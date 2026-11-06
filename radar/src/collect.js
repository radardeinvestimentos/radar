// Coletor: lê os feeds, mescla com o histórico, classifica, analisa e escreve a "API" estática (JSON).
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseFeed, parseHtmlLinks } from './rss.js';
import { classify, norm, TOPICS } from './classify.js';
import { analyze, GENERIC_ANALYSIS } from './impact.js';
import { enrichWithGemini } from './gemini.js';
import { jaccard, tokens } from './text.js';
import { buildTriggers } from './triggers.js';
import { buildAgenda } from './agenda.js';
import { fetchFocus } from './focus.js';
import { buildContent, compactForWeek, mergeWeek } from './content.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCES_FILE = process.env.SOURCES_FILE || path.join(ROOT, 'config', 'sources.json');
const OUT = process.env.OUT_DIR || path.join(ROOT, 'public', 'api');
const PREVIOUS_URL = process.env.PREVIOUS_URL || '';
const PREVIOUS_FILE = process.env.PREVIOUS_FILE || '';
const AGENDA_FILE = process.env.AGENDA_FILE || path.join(ROOT, 'config', 'agenda.json');
const LEITURAS_FILE = process.env.LEITURAS_FILE || path.join(ROOT, 'config', 'leituras.json');
const RETENTION_H = Number(process.env.RETENTION_HOURS || 72);
const MAX_ITEMS = 1500;
const UA = 'Mozilla/5.0 (compatible; RadarDoAssessor/1.0; agregador pessoal; apenas manchetes e links)';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hash = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 12);

async function fetchText(url) {
  let err;
  for (let i = 0; i < 2; i++) {
    try {
      const r = await fetch(url, {
        headers: {
          'user-agent': UA,
          accept: 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, text/html;q=0.8, */*;q=0.5',
          'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8',
        },
        signal: AbortSignal.timeout(20000),
        redirect: 'follow',
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.text();
    } catch (e) {
      err = e;
      await sleep(800);
    }
  }
  throw err;
}

async function readFeeds(feeds, src) {
  const settled = await Promise.allSettled(
    feeds.map(async (f) => {
      const body = await fetchText(f.url);
      const kind = f.kind || 'rss';
      const items = kind === 'html' ? parseHtmlLinks(body, f) : parseFeed(body, { assumeTz: src.assumeTz, gnews: kind === 'gnews' });
      return { kind, items };
    }),
  );
  const items = [];
  const errors = [];
  let via = null;
  for (const s of settled) {
    if (s.status === 'fulfilled') {
      if (s.value.items.length) { items.push(...s.value.items); via = via || s.value.kind; }
      else errors.push('feed sem itens');
    } else errors.push(s.reason?.message || String(s.reason));
  }
  return { items, via, errors };
}

async function collectSource(src) {
  const st = { id: src.id, name: src.name, region: src.region, paywall: !!src.paywall, status: 'ok', via: null, items: 0, error: null, note: src.note || null };
  if (src.enabled === false) return { items: [], st: { ...st, status: 'desativado' } };

  let r = { items: [], via: null, errors: [] };
  if (src.feeds?.length) r = await readFeeds(src.feeds, src);
  if (!r.items.length && src.fallback?.length) {
    const fb = await readFeeds(src.fallback, src);
    r = { items: fb.items, via: fb.via === 'gnews' ? 'google-news' : fb.via, errors: [...r.errors, ...fb.errors] };
  } else if (r.via === 'gnews') r.via = 'google-news';

  if (!r.items.length) {
    st.status = 'erro';
    st.error = [...new Set(r.errors)].slice(0, 3).join(' | ') || 'sem feed configurado';
    return { items: [], st };
  }
  st.via = r.via;
  st.items = r.items.length;
  return { items: r.items, st };
}

/** Lê um arquivo da execução anterior (news.json, conteudo.json...) do site publicado ou de uma pasta local. */
async function loadPrevious(name = 'news.json') {
  try {
    if (PREVIOUS_FILE) return JSON.parse(await fs.readFile(path.join(path.dirname(PREVIOUS_FILE), name), 'utf8'));
    if (PREVIOUS_URL) {
      const url = PREVIOUS_URL.replace(/news\.json$/, name);
      const r = await fetch(`${url}?t=${Date.now()}`, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(20000) });
      if (r.ok) return await r.json();
      console.log(`[histórico] ${url} -> HTTP ${r.status} (primeira execução?)`);
    }
  } catch (e) {
    if (e.code !== 'ENOENT') console.log(`[histórico] ${name} indisponível: ${e.message}`);
  }
  return null;
}

async function fetchJson(url) {
  const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// --- agrupamento de matérias repetidas entre portais (tokens/jaccard vêm de text.js) ---

function clusterItems(items) {
  const sorted = [...items].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  const heads = [];
  for (const it of sorted) {
    const tk = tokens(it.title);
    const t = Date.parse(it.publishedAt);
    const head = heads.find((h) => Math.abs(h.t - t) < 36 * 3600e3 && jaccard(h.tk, tk) >= 0.5);
    if (head) { it.cluster = head.id; head.members.push(it); }
    else { const id = 'c' + hash(it.id); it.cluster = id; heads.push({ id, tk, t, members: [it] }); }
  }
  for (const h of heads) {
    const srcs = [...new Set(h.members.map((m) => m.sourceName))];
    for (const m of h.members) { m.coverage = srcs.length; m.coveredBy = srcs; }
  }
}

function level(score) { return score >= 10 ? 'alta' : score >= 7 ? 'media' : 'baixa'; }

async function main() {
  const cfg = JSON.parse(await fs.readFile(SOURCES_FILE, 'utf8'));
  const now = new Date();
  const nowIso = now.toISOString();

  const prev = await loadPrevious();
  const prevItems = new Map((prev?.items || []).map((i) => [i.id, i]));
  const prevSources = new Map((prev?.meta?.sources || []).map((s) => [s.id, s]));

  const results = await Promise.all(cfg.sources.map((s) => collectSource(s).then((r) => ({ ...r, src: s }))));

  const merged = new Map(prevItems);
  for (const { items, src } of results) {
    for (const it of items) {
      const id = hash(it.url);
      const old = merged.get(id);
      let published = it.publishedAt ? Date.parse(it.publishedAt) : NaN;
      if (!Number.isFinite(published)) published = old ? Date.parse(old.publishedAt) : now.getTime();
      if (published > now.getTime() + 10 * 60e3) published = now.getTime(); // relógio do portal à frente
      merged.set(id, {
        id,
        source: src.id,
        sourceName: src.name,
        region: src.region,
        lang: src.lang,
        paywall: !!src.paywall,
        weight: src.weight ?? 1,
        title: it.title,
        url: it.url,
        summary: it.summary || old?.summary || '',
        categories: it.categories?.length ? it.categories : old?.categories || [],
        publishedAt: new Date(published).toISOString(),
        firstSeen: old?.firstSeen || nowIso,
        analysis: old?.analysis?.ai ? { ai: old.analysis.ai } : undefined,
      });
    }
  }

  // retenção
  const cutoff = now.getTime() - RETENTION_H * 3600e3;
  let items = [...merged.values()].filter((i) => Date.parse(i.publishedAt) >= cutoff);
  items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  items = items.slice(0, MAX_ITEMS);

  // classificação + análise por regras
  for (const it of items) {
    const c = classify(it);
    it.topic = c.topic;
    it.topics = c.topics;
    it.relevant = c.relevant;
    const ai = it.analysis?.ai;
    if (c.relevant) {
      const a = analyze(it) || { score: 1, temas: [GENERIC_ANALYSIS.tema], leitura: '', ativos: [], impactoClientes: GENERIC_ANALYSIS.impacto, comoGerarValor: GENERIC_ANALYSIS.valor, regras: [] };
      it.analysis = a;
      if (ai) it.analysis.ai = ai;
    } else {
      it.analysis = ai ? { ai } : null;
    }
  }

  clusterItems(items);

  // prioridade
  for (const it of items) {
    if (!it.analysis || it.analysis.score == null) { it.priority = null; it.priorityScore = 0; continue; }
    const ageH = (now.getTime() - Date.parse(it.publishedAt)) / 3600e3;
    const recency = ageH <= 3 ? 2 : ageH <= 12 ? 1 : ageH > 36 ? -2 : 0;
    const cover = Math.min((it.coverage || 1) - 1, 3) * 1.5;
    it.priorityScore = Math.round((it.analysis.score + cover + recency + (it.weight || 1)) * 10) / 10;
    it.priority = level(it.priorityScore);
  }

  // IA opcional nos itens mais prioritários (1 por cluster)
  let aiInfo = { used: false, count: 0 };
  if (process.env.GEMINI_API_KEY) {
    const seenC = new Set();
    const top = items
      .filter((i) => i.relevant && i.priorityScore > 0)
      .sort((a, b) => b.priorityScore - a.priorityScore)
      .filter((i) => (seenC.has(i.cluster) ? false : seenC.add(i.cluster)))
      .slice(0, 40);
    aiInfo = await enrichWithGemini(top, { apiKey: process.env.GEMINI_API_KEY });
  }

  // saúde das fontes (preserva "último sucesso")
  const sources = results.map(({ st }) => {
    const p = prevSources.get(st.id);
    return { ...st, lastOkAt: st.status === 'ok' ? nowIso : p?.lastOkAt || null, itemsStored: items.filter((i) => i.source === st.id).length };
  });

  // --- ferramentas do assessor: gatilhos, Focus, agenda e conteúdo (cada uma falha sem derrubar as demais) ---
  const extras = {};
  let triggers = null;
  let focus = null;
  let agenda = null;
  let conteudo = null;

  try {
    triggers = buildTriggers(items, now);
    extras.prospeccao = { status: 'ok', gatilhos: triggers.gatilhos.length, calendario: triggers.calendario.length };
  } catch (e) {
    extras.prospeccao = { status: 'erro', error: e.message };
    console.warn(`[prospecção] ${e.message}`);
  }

  try {
    focus = await fetchFocus({ fetchJson, now });
    if (!focus.ok) {
      const anterior = await loadPrevious('focus.json');
      if (anterior?.ok) focus = { ...anterior, desatualizado: true, erroAtual: focus.erro };
    }
    extras.focus = focus.ok ? { status: focus.desatualizado ? 'desatualizado' : 'ok', dataBase: focus.dataBase, parcial: focus.parcial || null, error: focus.erroAtual || null } : { status: 'erro', error: focus.erro };
  } catch (e) {
    focus = { ok: false, geradoEm: nowIso, erro: e.message, linhas: [] };
    extras.focus = { status: 'erro', error: e.message };
  }

  try {
    const agendaCfg = JSON.parse(await fs.readFile(AGENDA_FILE, 'utf8'));
    agenda = buildAgenda(agendaCfg, now, focus?.ok ? focus : null);
    extras.agenda = { status: 'ok', eventos: agenda.eventos.length };
  } catch (e) {
    extras.agenda = { status: 'erro', error: e.message };
    console.warn(`[agenda] ${e.message}`);
  }

  try {
    const prevContent = await loadPrevious('conteudo.json');
    const semana = mergeWeek(prevContent?.semana, compactForWeek(items), now);
    conteudo = buildContent(semana, agenda, now);
    extras.conteudo = { status: 'ok', base: semana.length, pauta: conteudo.pauta.length };
  } catch (e) {
    extras.conteudo = { status: 'erro', error: e.message };
    console.warn(`[conteúdo] ${e.message}`);
  }

  const topicCounts = [...TOPICS.map((t) => t.id), 'geral'].map((id) => ({
    id,
    label: id === 'geral' ? 'Outros' : TOPICS.find((t) => t.id === id).label,
    count: items.filter((i) => (id === 'geral' ? !i.relevant : i.relevant && i.topics.includes(id))).length,
  }));

  const meta = {
    generatedAt: nowIso,
    count: items.length,
    relevantCount: items.filter((i) => i.relevant).length,
    retentionHours: RETENTION_H,
    topics: topicCounts,
    sources,
    extras,
    ai: aiInfo,
    disclaimer: 'Análises automáticas por regras/IA servem como gatilho de reflexão para o assessor; não constituem recomendação de investimento. Confira sempre a matéria original.',
  };

  // saída
  await fs.mkdir(path.join(OUT, 'topics'), { recursive: true });
  const write = (f, o) => fs.writeFile(path.join(OUT, f), JSON.stringify(o));
  await write('news.json', { meta, items });
  await write('meta.json', { generatedAt: nowIso, count: items.length });
  await write('sources.json', { generatedAt: nowIso, sources });
  const impactHeads = [];
  const seenC = new Set();
  for (const it of [...items].filter((i) => i.relevant && i.analysis).sort((a, b) => b.priorityScore - a.priorityScore)) {
    if (seenC.has(it.cluster)) continue;
    seenC.add(it.cluster);
    impactHeads.push(it);
  }
  await write('impact.json', { generatedAt: nowIso, items: impactHeads.slice(0, 120) });
  // Cada deploy substitui o site inteiro: gravamos sempre um JSON válido (mesmo vazio, com o motivo do erro) para a aba não quebrar.
  await write('prospeccao.json', triggers || { geradoEm: nowIso, calendario: [], gatilhos: [], erro: extras.prospeccao?.error || 'indisponível' });
  try { await write('leituras.json', JSON.parse(await fs.readFile(LEITURAS_FILE, 'utf8'))); } catch (e) { await write('leituras.json', { documentos: [], gestoras: [], erro: e.message }); }
  await write('focus.json', focus || { ok: false, geradoEm: nowIso, erro: 'indisponível', linhas: [] });
  await write('agenda.json', agenda || { geradoEm: nowIso, hoje: nowIso.slice(0, 10), eventos: [], erro: extras.agenda?.error || 'indisponível' });
  await write('conteudo.json', conteudo || { geradoEm: nowIso, pauta: [], plano: [], newsletter: null, checklist: [], semana: [], erro: extras.conteudo?.error || 'indisponível' });
  for (const t of topicCounts) {
    await write(path.join('topics', `${t.id}.json`), {
      generatedAt: nowIso,
      topic: t,
      items: items.filter((i) => (t.id === 'geral' ? !i.relevant : i.relevant && i.topics.includes(t.id))),
    });
  }

  const ok = sources.filter((s) => s.status === 'ok');
  console.log(`Coletado: ${items.length} itens (${meta.relevantCount} relevantes) de ${ok.length}/${sources.length} fontes.`);
  for (const s of sources) console.log(`  ${s.status.padEnd(10)} ${s.name.padEnd(26)} ${String(s.items).padStart(3)} itens${s.via ? ' via ' + s.via : ''}${s.error ? ' — ' + s.error : ''}`);
  if (!ok.length) { console.error('Nenhuma fonte respondeu.'); process.exitCode = 1; }
}

main().catch((e) => { console.error(e); process.exit(1); });

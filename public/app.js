// Front-end do Radar do Assessor. Tudo é montado com textContent (nada de innerHTML com dados externos).
(() => {
  'use strict';
  const API = './api/';
  const $ = (id) => document.getElementById(id);
  const store = {
    get(k, d) { try { return localStorage.getItem('radar.' + k) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem('radar.' + k, v); } catch { /* sem armazenamento */ } },
  };

  const state = {
    data: null,
    section: store.get('section', 'noticias'),
    tab: store.get('tab', 'hoje'),
    period: store.get('period', 'today'),
    region: store.get('region', ''),
    source: '',
    q: '',
    level: store.get('level', 'todas'),
  };

  const ARROW = { up: '▲', down: '▼', watch: '◆' };
  const DIRLABEL = { up: 'tende a subir/beneficiar', down: 'tende a cair/pressionar', watch: 'acompanhar' };
  const fmtTime = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const fmtDay = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' });

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(kid));
    return el;
  }
  const safeHref = (u) => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : '#'; } catch { return '#'; } };
  const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');

  function ago(iso) {
    const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
    if (m < 1) return 'agora';
    if (m < 60) return `há ${m} min`;
    const d = new Date(iso), now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    return sameDay ? `hoje ${fmtTime.format(d)}` : `${fmtDay.format(d)} ${fmtTime.format(d)}`;
  }

  function clock(iso) {
    const d = new Date(iso);
    return d.toDateString() === new Date().toDateString() ? fmtTime.format(d) : fmtDay.format(d);
  }

  // ---------- dados ----------
  async function load(force) {
    const url = `${API}news.json${force ? `?t=${Date.now()}` : ''}`;
    const r = await fetch(url, { cache: force ? 'no-store' : 'default' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }

  async function refresh(manual) {
    const btn = $('refresh');
    btn.disabled = true;
    const before = state.data?.meta?.generatedAt;
    $('statusText').textContent = 'Buscando…';
    try {
      state.data = await load(true);
      await loadExtras(true);
      const after = state.data.meta.generatedAt;
      render();
      if (manual) {
        const changed = before && after !== before;
        state.flash = changed
          ? `Atualizado: ${fmtTime.format(new Date(after))} — novas notícias carregadas.`
          : `Já está na versão mais recente (coletada ${ago(after)}). A coleta roda sozinha a cada ~15 min.`;
        state.flashUntil = Date.now() + 6000;
        $('statusText').textContent = state.flash;
        setTimeout(setStatus, 6100);
      }
    } catch (e) {
      $('statusText').textContent = `Falha ao atualizar (${e.message}). Tente de novo em instantes.`;
    } finally {
      btn.disabled = false;
    }
  }

  async function poll() {
    try {
      const r = await fetch(`${API}meta.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!r.ok) return;
      const m = await r.json();
      if (m.generatedAt !== state.data?.meta?.generatedAt) { state.data = await load(true); await loadExtras(true); render(); }
      else setStatus();
    } catch { /* offline: mantém o que está na tela */ }
  }

  // ---------- filtros ----------
  function since() {
    if (state.period === 'today') { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); }
    return Date.now() - Number(state.period) * 3600e3;
  }

  function filtered() {
    const t0 = since();
    const q = norm(state.q.trim());
    return state.data.items.filter((i) => {
      if (Date.parse(i.publishedAt) < t0) return false;
      if (state.region && i.region !== state.region) return false;
      if (state.source && i.source !== state.source) return false;
      if (q && !norm(`${i.title} ${i.summary} ${(i.categories || []).join(' ')} ${i.sourceName}`).includes(q)) return false;
      return true;
    });
  }

  function tabItems(all) {
    if (state.tab === 'hoje') return all.filter((i) => i.relevant);
    if (state.tab === 'geral') return all.filter((i) => !i.relevant);
    if (state.section === 'impacto') return all.filter((i) => i.relevant && i.analysis);
    return all.filter((i) => i.relevant && i.topics.includes(state.tab));
  }

  function groupByCluster(items) {
    const map = new Map();
    for (const it of items) {
      const g = map.get(it.cluster);
      if (g) g.others.push(it); else map.set(it.cluster, { head: it, others: [] });
    }
    return [...map.values()];
  }

  // ---------- componentes ----------
  function metaRow(it, extra) {
    return h('div', { class: 'meta' },
      h('span', { class: 'src', text: it.sourceName }),
      h('span', { class: 'tag', text: it.region === 'BR' ? 'BR' : 'INT' }),
      it.paywall ? h('span', { class: 'tag', title: 'Conteúdo pode exigir assinatura', text: 'assinante' }) : null,
      h('time', { datetime: it.publishedAt, text: ago(it.publishedAt) }),
      extra);
  }

  function alsoRow(g) {
    if (!g.others.length) return null;
    const seen = new Set([g.head.source]);
    const links = [];
    for (const o of g.others) {
      if (seen.has(o.source)) continue;
      seen.add(o.source);
      links.push(h('a', { href: safeHref(o.url), target: '_blank', rel: 'noopener noreferrer', text: o.sourceName }));
    }
    if (!links.length) return null;
    const row = h('div', { class: 'also' }, 'Também em: ');
    links.forEach((a, i) => { if (i) row.append(', '); row.append(a); });
    return row;
  }

  function newsCard(g, topicLabels) {
    const it = g.head;
    return h('article', { class: 'row' },
      h('time', { class: 'when', datetime: it.publishedAt, title: ago(it.publishedAt), text: clock(it.publishedAt) }),
      h('div', { class: 'body' },
        h('div', { class: 'meta' },
          h('span', { class: 'src', text: it.sourceName }),
          h('span', { class: 'tag', text: it.region === 'BR' ? 'Brasil' : 'Internacional' }),
          it.paywall ? h('span', { class: 'tag', title: 'Conteúdo pode exigir assinatura', text: 'assinante' }) : null),
        h('h3', {}, h('a', { href: safeHref(it.url), target: '_blank', rel: 'noopener noreferrer', text: it.title })),
        it.summary ? h('p', { class: 'sum', text: it.summary }) : null,
        h('div', { class: 'chips' }, it.topics.filter((t) => t !== 'geral').map((t) => h('span', { class: 'chip', text: topicLabels[t] || t }))),
        alsoRow(g)));
  }

  function list(title, items) {
    if (!items?.length) return null;
    return h('div', { class: 'sec' }, h('h4', { text: title }), h('ul', {}, items.map((x) => h('li', { text: x }))));
  }

  function impactCard(g) {
    const it = g.head, a = it.analysis;
    const ai = a.ai;
    return h('article', { class: 'card impact' },
      metaRow(it, [
        h('span', { class: `prio ${it.priority}`, text: `Prioridade ${{ alta: 'alta', media: 'média', baixa: 'baixa' }[it.priority] || ''}` }),
        h('span', { class: 'score', title: 'Pontuação de relevância', text: `${it.priorityScore}` }),
        it.coverage > 1 ? h('span', { class: 'tag', text: `${it.coverage} portais` }) : null,
      ]),
      h('h3', {}, h('a', { href: safeHref(it.url), target: '_blank', rel: 'noopener noreferrer', text: it.title })),
      h('div', { class: 'chips' }, a.temas.map((t) => h('span', { class: 'chip', text: t }))),
      a.leitura ? h('p', { class: 'leitura', text: a.leitura }) : null,
      h('div', { class: 'imp-grid' },
        a.ativos?.length ? h('div', { class: 'sec' }, h('h4', { text: 'Efeito provável nos ativos' }),
          h('div', { class: 'assets' }, a.ativos.map((x) => h('div', { class: `asset ${x.dir}`, title: DIRLABEL[x.dir] },
            h('b', { 'aria-hidden': 'true', text: ARROW[x.dir] }),
            h('span', {}, x.classe, x.nota ? h('small', { text: x.nota }) : null))))) : h('div'),
        h('div', {},
          list('Impacto para as carteiras dos clientes', a.impactoClientes),
          list('Como gerar valor para você e para seus clientes', a.comoGerarValor))),
      ai ? h('div', { class: 'ai' }, h('h4', { text: 'Análise com IA' }),
        ai.resumo ? h('p', { text: ai.resumo }) : null,
        ai.carteiras ? h('p', {}, h('b', { text: 'Carteiras: ' }), ai.carteiras) : null,
        ai.oportunidades ? h('p', {}, h('b', { text: 'Oportunidades: ' }), ai.oportunidades) : null,
        ai.riscos ? h('p', {}, h('b', { text: 'Riscos: ' }), ai.riscos) : null,
        ai.conversa ? h('p', {}, h('b', { text: 'Para abrir a conversa: ' }), ai.conversa) : null) : null,
      alsoRow(g));
  }

  // ---------- dados extras (Prospecção, Agenda, Leituras, Conteúdo, Ativos) ----------
  const EXTRA_FILES = { prospeccao: 'prospeccao.json', agenda: 'agenda.json', focus: 'focus.json', conteudo: 'conteudo.json', leituras: 'leituras.json' };
  state.extras = {};
  state.dict = [];
  let compiledBase = [];
  let matchGen = 0;
  const matchCache = new WeakMap();

  async function getJson(url, force) {
    const r = await fetch(force ? `${url}?t=${Date.now()}` : url, { cache: force ? 'no-store' : 'default' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }

  async function loadExtras(force) {
    await Promise.all(Object.entries(EXTRA_FILES).map(async ([k, f]) => {
      try { state.extras[k] = await getJson(API + f, force); } catch (e) { state.extras[k] = { erro: `não carregou (${e.message})` }; }
    }));
    if (!state.dict.length) {
      try { state.dict = (await getJson('./data/ativos.json')).ativos || []; } catch { state.dict = []; }
      recompile();
    }
    if (!state.calcCfg) { try { state.calcCfg = await getJson('./data/calculadora.json'); } catch { state.calcCfg = null; } }
    if (!state.carteirasModelo) { try { state.carteirasModelo = await getJson('./data/carteiras-modelo.json'); } catch { state.carteirasModelo = null; } }
    if (!state.mapa) { try { state.mapa = await getJson('./data/mapa-rf.json'); } catch { state.mapa = null; } }
    if (!state.edu) { try { state.edu = await getJson('./data/educacao.json'); } catch { state.edu = null; } }
  }

  // Lista pessoal: só tickers, guardada neste aparelho (nunca enviada).
  const cleanTicker = (t) => String(t || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  function getWatch() {
    try { const a = JSON.parse(store.get('watch', '[]')); return Array.isArray(a) ? [...new Set(a.map(cleanTicker).filter(Boolean))] : []; } catch { return []; }
  }
  function setWatch(list) { store.set('watch', JSON.stringify([...new Set(list.map(cleanTicker).filter(Boolean))])); recompile(); }
  const rootOf = (t) => norm(t).replace(/\d+$/, '');
  function entryFor(t) {
    const hit = window.RadarMatch.lookup(t, state.dict);
    return hit ? { ...hit, t } : { t, n: '', a: [] };
  }
  function recompile() {
    if (!window.RadarMatch) return;
    const dictRoots = new Set(state.dict.map((d) => rootOf(d.t)));
    const extra = getWatch().filter((t) => !dictRoots.has(rootOf(t))).map((t) => ({ t }));
    compiledBase = window.RadarMatch.compileAll([...state.dict, ...extra]);
    matchGen++;
  }
  function hitsOf(it) {
    const c = matchCache.get(it);
    if (c && c.g === matchGen) return c.h;
    const h2 = new Set(window.RadarMatch.matchItem(it, compiledBase).map((t) => rootOf(t)));
    matchCache.set(it, { g: matchGen, h: h2 });
    return h2;
  }

  // ---------- peças comuns das seções ----------
  const SECTIONS = [
    { id: 'noticias', label: 'Notícias' },
    { id: 'prospeccao', label: 'Prospecção' },
    { id: 'ativos', label: 'Ativos' },
    { id: 'agenda', label: 'Agenda' },
    { id: 'leituras', label: 'Leituras' },
    { id: 'conteudo', label: 'Conteúdo' },
    { id: 'calculadora', label: 'Calculadora' },
    { id: 'educacao', label: 'Educação' },
    { id: 'impacto', label: 'Impacto para o assessor', cls: 'impact' },
  ];
  const WITH_FILTERS = new Set(['noticias', 'impacto', 'ativos']);
  const fmtBR = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');
  const num = (n, d = 2) => (n == null ? '–' : Number(n).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }));
  const link = (href, text) => h('a', { href: safeHref(href), target: '_blank', rel: 'noopener noreferrer', text });
  const badge = (text, cls, title) => h('span', { class: `badge ${cls || ''}`, title, text });
  const unavailable = (what, err) => h('div', { class: 'empty' }, h('p', { text: `${what} indisponível agora.` }), err ? h('p', { class: 'small', text: err }) : null);
  const pills = (opts, cur, onpick) => h('div', { class: 'filters' }, opts.map(([v, l]) => h('button', { class: 'pill', type: 'button', 'aria-pressed': String(cur === v), onclick: () => onpick(v) }, l)));
  const field = (label, ctl) => h('label', { class: 'field' }, h('span', { text: label }), ctl);
  async function copyText(text, btn) {
    const ok = () => { const old = btn.textContent; btn.textContent = 'Copiado'; setTimeout(() => { btn.textContent = old; }, 1600); };
    try { await navigator.clipboard.writeText(text); ok(); return; } catch { /* tenta o plano B */ }
    const ta = h('textarea', { style: 'position:fixed;opacity:0' }); ta.value = text; document.body.append(ta); ta.select();
    try { document.execCommand('copy'); ok(); } catch { btn.textContent = 'Selecione e copie'; } ta.remove();
  }
  function newsLine(it) {
    return h('li', { class: 'nl' }, h('time', { datetime: it.publishedAt, text: clock(it.publishedAt) }), ' ', link(it.url, it.title), h('span', { class: 'src2', text: ` · ${it.sourceName}` }));
  }

  // ---------- Prospecção ----------
  function renderProspeccao(box) {
    const p = state.extras.prospeccao;
    if (!p || p.erro && !p.gatilhos?.length && !p.calendario?.length) { box.append(unavailable('A lista de gatilhos', p?.erro)); return; }
    box.append(h('div', { class: 'note', text: 'Gatilhos são situações em que uma conversa com o cliente ou um contato novo faz sentido. A lista sai de regras automáticas sobre as manchetes, e não substitui o seu julgamento. Cada cartão traz o cuidado de compliance a observar.' }));
    const nicho = h('textarea', { class: 'area', rows: 2, placeholder: 'Ex.: empresários e sócios do Paraná, executivos da indústria, profissionais liberais com renda alta', 'aria-label': 'Meu nicho ou público-alvo' });
    nicho.value = store.get('nicho', '');
    nicho.addEventListener('input', () => store.set('nicho', nicho.value));
    box.append(h('div', { class: 'card plain' }, h('h4', { class: 'h4', text: 'Meu nicho' }), h('p', { class: 'small', text: 'Fica salvo só neste aparelho. Serve de lembrete para filtrar os gatilhos com o seu olhar.' }), nicho));
    const tp = state.tipo || 'todos';
    box.append(pills([['todos', 'Todos'], ['prospect', 'Prospecção (novos contatos)'], ['carteira', 'Carteira (clientes atuais)']], tp, (v) => { state.tipo = v; render(); }));
    const okTipo = (g) => tp === 'todos' || g.tipo === 'ambos' || g.tipo === tp;
    const tipoLabel = { prospect: 'Prospecção', carteira: 'Carteira', ambos: 'Prospecção e carteira' };

    const cal = (p.calendario || []).filter(okTipo);
    if (cal.length) {
      box.append(h('h3', { class: 'sh', text: 'Oportunidades de calendário' }));
      for (const c of cal) box.append(gatilhoCard(c, tipoLabel, true));
    }
    const gs = (p.gatilhos || []).filter(okTipo);
    box.append(h('h3', { class: 'sh', text: 'Gatilhos nas notícias' }));
    if (!gs.length) box.append(h('div', { class: 'empty' }, h('p', { text: 'Nenhum gatilho nas notícias desta coleta.' })));
    for (const g of gs) box.append(gatilhoCard(g, tipoLabel, false));
  }

  function gatilhoCard(g, tipoLabel, calendario) {
    const tops = g.itens || [];
    return h('article', { class: `card trig ${g.ativa === false ? 'off' : ''}` },
      h('div', { class: 'meta' },
        calendario ? badge(g.ativa ? 'Ativo agora' : 'Em breve', g.ativa ? 'on' : 'soon') : h('span', { class: `prio ${g.urgencia}`, text: `Urgência ${{ alta: 'alta', media: 'média', baixa: 'baixa' }[g.urgencia]}` }),
        badge(tipoLabel[g.tipo] || g.tipo),
        g.regional ? badge('Sul / Paraná', 'reg') : null,
        g.quando ? h('span', { text: g.quando }) : null,
        !calendario && g.total > 1 ? h('span', { text: `${g.total} notícias` }) : null),
      h('h3', { class: 'th', text: g.titulo }),
      h('p', { class: 'why', text: g.porque }),
      h('dl', { class: 'dl' },
        h('dt', { text: 'Para quem' }), h('dd', { text: g.publico }),
        h('dt', { text: 'Gancho da conversa' }), h('dd', { text: g.gancho }),
        h('dt', { text: 'Cuidado' }), h('dd', { text: g.cuidados })),
      tops.length ? h('ul', { class: 'nls' }, tops.map(newsLine)) : null);
  }

  // ---------- Ativos (IBrX e lista pessoal) ----------
  function renderAtivos(box, all) {
    if (!window.RadarMatch || !state.dict.length) { box.append(unavailable('O dicionário de ativos')); return; }
    const scope = state.scope || store.get('scope', 'ibrx50');
    state.scope = scope;
    box.append(h('div', { class: 'note', text: 'Notícias que citam cada papel (pelo ticker ou pelo nome da empresa), no período e com os filtros acima. É uma leitura automática: confira a matéria. Não é recomendação.' }));
    box.append(pills([['ibrx50', 'IBrX 50'], ['ibrx100', 'IBrX 100'], ['minha', 'Minha lista']], scope, (v) => { state.scope = v; store.set('scope', v); render(); }));

    const watch = getWatch();
    let entries;
    if (scope === 'minha') entries = watch.map(entryFor);
    else entries = state.dict.filter((d) => (scope === 'ibrx50' ? d.i === 50 : !!d.i));

    if (scope === 'minha') box.append(watchEditor(watch));

    const byRoot = new Map(entries.map((e) => [rootOf(e.t), { e, items: [] }]));
    for (const it of all) for (const r of hitsOf(it)) byRoot.get(r)?.items.push(it);
    const rows = [...byRoot.values()];
    for (const r of rows) r.items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
    const withNews = rows.filter((r) => r.items.length).sort((a, b) => b.items.length - a.items.length || b.items[0].publishedAt.localeCompare(a.items[0].publishedAt));
    const without = rows.filter((r) => !r.items.length);

    if (scope === 'minha' && !watch.length) { box.append(h('div', { class: 'empty' }, h('p', { text: 'Sua lista está vazia. Adicione tickers acima (ex.: PETR4, BBAS3, HGLG11).' }))); return; }
    if (withNews.length) {
      box.append(h('div', { class: 'tops' }, h('span', { class: 'small', text: 'Mais citados: ' }),
        withNews.slice(0, 6).map((r) => h('span', { class: 'chipn', text: `${r.e.t.replace(/\d+$/, '')} ${r.items.length}` }))));
    }
    for (const r of withNews) {
      const first = r.items.slice(0, 3), rest = r.items.slice(3, 15);
      box.append(h('article', { class: 'card asset-row' },
        h('div', { class: 'ar-h' }, h('b', { class: 'tk', text: r.e.t }), h('span', { class: 'nm', text: r.e.n || '' }), h('span', { class: 'cnt', text: `${r.items.length} ${r.items.length === 1 ? 'notícia' : 'notícias'}` })),
        h('ul', { class: 'nls' }, first.map(newsLine)),
        rest.length ? h('details', {}, h('summary', { text: `Ver mais ${rest.length}` }), h('ul', { class: 'nls' }, rest.map(newsLine))) : null));
    }
    if (!withNews.length) box.append(h('div', { class: 'empty' }, h('p', { text: 'Nenhuma notícia sobre estes papéis neste período.' }), state.period === 'today' ? h('button', { class: 'btn', type: 'button', onclick: () => { state.period = '72'; $('period').value = '72'; store.set('period', '72'); render(); } }, 'Ver últimas 72h') : null));
    if (without.length) box.append(h('p', { class: 'small quiet', text: `Sem notícias no período: ${without.map((r) => r.e.t).join(', ')}.` }));
  }

  function watchEditor(watch) {
    const inp = h('input', { type: 'text', placeholder: 'Ticker, ex.: PETR4', 'aria-label': 'Adicionar ticker', maxlength: '8', autocapitalize: 'characters' });
    const add = () => { const t = cleanTicker(inp.value); if (!t) return; setWatch([...watch, t]); render(); };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
    const code = () => btoa(unescape(encodeURIComponent(JSON.stringify(getWatch()))));
    const expBtn = h('button', { class: 'btn', type: 'button', onclick: () => copyText(code(), expBtn) }, 'Copiar código da lista');
    const impBtn = h('button', { class: 'btn', type: 'button', onclick: () => {
      const v = window.prompt('Cole o código da lista (gerado em "Copiar código da lista"):');
      if (!v) return;
      try { const a = JSON.parse(decodeURIComponent(escape(atob(v.trim())))); if (!Array.isArray(a)) throw new Error('formato'); setWatch([...watch, ...a]); render(); }
      catch { window.alert('Código inválido.'); }
    } }, 'Importar código');
    return h('div', { class: 'card plain' },
      h('div', { class: 'addrow' }, inp, h('button', { class: 'btn primary', type: 'button', onclick: add }, 'Adicionar')),
      h('div', { class: 'chips2' }, watch.map((t) => h('button', { class: 'chipx', type: 'button', title: 'Remover', onclick: () => { setWatch(watch.filter((x) => x !== t)); render(); } }, `${t} ×`))),
      h('div', { class: 'addrow' }, expBtn, impBtn),
      h('p', { class: 'small', text: 'A lista guarda só tickers e fica neste aparelho (não vai para a internet). Para usar em outro aparelho, copie o código e importe lá. Nunca coloque nomes de clientes.' }));
  }

  // ---------- Agenda ----------
  function renderAgenda(box) {
    const a = state.extras.agenda;
    if (!a?.eventos) { box.append(unavailable('A agenda', a?.erro)); return; }
    if (a.aviso) box.append(h('div', { class: 'note', text: a.aviso }));
    const groups = [['hoje', 'Hoje'], ['semana', 'Esta semana'], ['proxima', 'Semana que vem'], ['depois', 'Mais adiante']];
    const show = state.agendaAll ? a.eventos : a.eventos.filter((e) => e.tipo !== 'focus' || e.janela !== 'depois');
    for (const [id, label] of groups) {
      const evs = show.filter((e) => e.janela === id);
      if (!evs.length) continue;
      box.append(h('h3', { class: 'sh', text: label }));
      for (const e of evs) {
        box.append(h('article', { class: `card ag ${e.peso >= 3 ? 'big' : ''}` },
          h('div', { class: 'meta' }, h('b', { class: 'when2', text: e.quando }), h('span', { text: e.status }), badge(e.confianca === 'confirmado' ? 'Data confirmada' : 'Data estimada', e.confianca === 'confirmado' ? 'on' : 'soon', e.confianca === 'estimado' ? 'Confira antes de divulgar' : null), e.fonte ? h('span', { text: e.fonte }) : null),
          h('h3', { class: 'th', text: e.titulo }),
          e.detalhe ? h('p', { class: 'small quiet', text: e.detalhe }) : null,
          h('p', { class: 'why', text: e.esperar }),
          h('div', { class: 'two' },
            list('Antes', e.antes), list('Depois', e.depois))));
      }
    }
    box.append(h('p', { class: 'small quiet', text: `Calendário revisado em ${fmtBR(a.revisadoEm)}.${a.fontes?.length ? ` Fontes: ${a.fontes.join('; ')}.` : ''}` }));
  }

  // ---------- Leituras ----------
  function renderLeituras(box) {
    const f = state.extras.focus, l = state.extras.leituras;
    box.append(h('h3', { class: 'sh', text: 'Boletim Focus: o que o mercado espera' }));
    if (!f?.ok) box.append(unavailable('O Focus', f?.erro));
    else {
      if (f.desatualizado) box.append(h('div', { class: 'note', text: 'Mostrando a última leitura que deu certo; a atual falhou.' }));
      const rows = f.linhas.map((x) => h('tr', {},
        h('td', { text: x.nome }), h('td', { text: String(x.ano) }),
        h('td', { class: 'r', text: `${num(x.mediana)} ${x.unidade}` }),
        h('td', { class: 'r', text: x.anterior ? num(x.anterior.mediana) : '–' }),
        h('td', { class: 'r', text: x.variacao == null ? '–' : `${x.variacao > 0 ? '+' : ''}${num(x.variacao)}` })));
      box.append(h('div', { class: 'tblw' }, h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, ['Indicador', 'Ano', 'Mediana', 'Semana anterior', 'Variação'].map((t, i) => h('th', { class: i > 1 ? 'r' : '', text: t })))), h('tbody', {}, rows))));
      box.append(h('p', { class: 'small quiet', text: `${f.fonte}. Dados de ${fmtBR(f.dataBase)}.${f.parcial ? ` Atenção: ${f.parcial}.` : ''} Mudança na mediana de uma semana para outra mostra para onde o mercado está inclinando.` }));
    }
    if (!l?.documentos) { box.append(unavailable('A lista de leituras', l?.erro)); return; }
    box.append(h('h3', { class: 'sh', text: 'Documentos para ler e traduzir para o cliente' }));
    box.append(h('div', { class: 'card plain' }, h('h4', { class: 'h4', text: l.pergunta }), h('ol', { class: 'ro' }, l.roteiro.map((x) => h('li', { text: x })))));
    for (const d of l.documentos) {
      box.append(h('article', { class: 'card doc' },
        h('div', { class: 'meta' }, badge(d.tipo), badge(d.status === 'pronto' ? 'Resumo pronto' : 'Aguardando leitura', d.status === 'pronto' ? 'on' : 'soon')),
        h('h3', { class: 'th', text: d.titulo }),
        d.resumo ? h('p', { text: d.resumo }) : null,
        d.muda ? h('p', {}, h('b', { text: 'O que muda para o meu cliente: ' }), d.muda) : null,
        d.nota ? h('p', { class: 'small quiet', text: d.nota }) : null,
        d.link ? h('p', { class: 'small' }, link(d.link, d.linkRotulo || 'Abrir documento')) : null));
    }
    if (l.gestoras?.length) {
      box.append(h('h3', { class: 'sh', text: 'Gestoras para acompanhar' }));
      if (l.gestorasNota) box.append(h('p', { class: 'small quiet', text: l.gestorasNota }));
      box.append(h('div', { class: 'gest' }, l.gestoras.map((g) => h('a', { class: 'gcard', href: safeHref(g.busca), target: '_blank', rel: 'noopener noreferrer' }, h('b', { text: g.nome }), h('span', { text: g.foco })))));
    }
  }

  // ---------- Calculadora de renda fixa (comparação, gráfico e mapa de ativos) ----------
  const brl0 = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  const brl2 = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pc = (n, d = 2) => `${num(n, d)}%`;
  const brlCompact = (n) => {
    const a = Math.abs(n), f = (v) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
    return a >= 1e6 ? `R$ ${f(n / 1e6)} mi` : a >= 1e3 ? `R$ ${f(n / 1e3)} mil` : `R$ ${f(n)}`;
  };
  function parseNum(v) {
    let s = String(v ?? '').trim().replace(/[^\d.,-]/g, '');
    if (!s) return NaN;
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    else if ((s.match(/\./g) || []).length > 1 || /\.\d{3}$/.test(s)) s = s.replace(/\./g, '');
    return Number(s);
  }
  const INDEXADORES = [
    ['cdi_pct', 'Pós-fixado: % do CDI', '% do CDI', '110'],
    ['cdi_mais', 'Pós-fixado: CDI + taxa', 'Taxa acima do CDI (% a.a.)', '2'],
    ['selic_mais', 'Tesouro Selic: Selic + taxa', 'Taxa acima da Selic (% a.a.)', '0,10'],
    ['pre', 'Prefixado', 'Taxa prefixada (% a.a.)', '13,5'],
    ['ipca_mais', 'IPCA + taxa real', 'Taxa real acima do IPCA (% a.a.)', '7,5'],
    ['poupanca', 'Poupança', 'Sem taxa (0,5% ao mês)', '0'],
  ];
  const LETRAS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const MAX_CARDS = 8, MAX_COMPARA = 4;
  const CORES = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)'];

  function novoCenario(C, presetId, idx) {
    const pr = C.PRESETS.find((p) => p.id === presetId) || C.PRESETS[1];
    return { preset: pr.id, indexador: pr.indexador, tributacao: pr.tributacao, taxa: String(pr.taxa).replace('.', ','), custodiaB3: !!pr.custodiaB3, outrasTaxas: '0', k: idx, cmp: true, inc: false, cv: '', cm: '', mod: '', caixa: false };
  }
  function nomeCenario(C, sc) {
    const pr = C.PRESETS.find((p) => p.id === sc.preset);
    if (pr && String(pr.taxa).replace('.', ',') === String(sc.taxa) && pr.indexador === sc.indexador && pr.tributacao === sc.tributacao) return pr.nome;
    const idx = INDEXADORES.find((x) => x[0] === sc.indexador);
    const t = sc.indexador === 'poupanca' ? '' : sc.indexador === 'cdi_pct' ? `${sc.taxa}% do CDI` : sc.indexador === 'cdi_mais' ? `CDI + ${sc.taxa}%` : sc.indexador === 'selic_mais' ? `Selic + ${sc.taxa}%` : sc.indexador === 'pre' ? `Prefixado ${sc.taxa}% a.a.` : `IPCA + ${sc.taxa}%`;
    return `${t || idx[1]} · ${sc.tributacao === 'isento' || sc.indexador === 'poupanca' ? 'isento' : 'IR regressivo'}`;
  }

  function renderCalculadora(box) {
    const C = window.RadarCalc;
    if (!C) { box.append(unavailable('A calculadora')); return; }
    const cfg = state.calcCfg || { selic: 13.75, cdi: 13.65, ipca: 4.5 };
    const fx = (n) => String(n).replace('.', ',');
    let saved = {};
    try { saved = JSON.parse(store.get('calc2', '{}')) || {}; } catch { saved = {}; }
    const st = { selic: fx(cfg.selic), cdi: fx(cfg.cdi), ipca: fx(cfg.ipca), valor: '100.000', meses: '24', modo: 'valor', bruto: false, ...saved };
    if (!Array.isArray(st.cenarios) || !st.cenarios.length) st.cenarios = [novoCenario(C, 'cdb-pos', 0)];
    st.cenarios = st.cenarios.slice(0, MAX_CARDS);
    st.cenarios.forEach((sc, i) => {
      if (sc.cmp == null) sc.cmp = i < MAX_COMPARA;
      sc.inc = !!sc.inc; sc.caixa = !!sc.caixa; sc.mod = sc.mod || '';
      if (sc.cv == null || sc.cv === '') sc.cv = st.valor;
      if (sc.cm == null || sc.cm === '') sc.cm = st.meses;
    });
    if (!st.cenarios.some((sc) => sc.cmp)) st.cenarios[0].cmp = true;

    box.append(h('div', { class: 'note', text: 'Simulação com as premissas que você informar, para conversar com o cliente. Compare até 4 investimentos lado a lado (marque "Comparar") e, se quiser a visão 360°, inclua cada um na carteira com seu próprio valor e prazo (mais abaixo). O gráfico de comparação mostra quanto sobraria líquido se o cliente resgatasse em cada data, já com o IR regressivo, o IOF dos 30 primeiros dias e a custódia da B3. Não consulta taxas de mercado, não inclui come-cotas, carência nem marcação a mercado (a venda antes do vencimento de títulos públicos e crédito privado pode ter preço diferente), e as taxas dos modelos são só exemplos. Não é recomendação de investimento.' }));

    // premissas comuns
    const fields = {};
    const mkShared = (key, label, hint) => {
      const input = h('input', { type: 'text', inputmode: 'decimal', autocomplete: 'off', 'aria-label': label });
      input.value = st[key];
      input.addEventListener('input', () => { st[key] = input.value; update(); });
      fields[key] = input;
      return h('label', { class: 'field cf' }, h('span', { text: label }), input, hint ? h('small', { class: 'hint', text: hint }) : null);
    };
    const f = state.extras.focus;
    const fIpca = f?.ok ? f.linhas.filter((l) => l.indicador === 'IPCA').map((l) => `${l.ano}: ${num(l.mediana)}%`).join(' · ') : '';
    box.append(h('div', { class: 'cgrid' },
      mkShared('selic', 'Selic (% a.a.)', cfg.revisadoEm ? `Padrão revisado em ${fmtBR(cfg.revisadoEm)}` : ''),
      mkShared('cdi', 'CDI (% a.a.)', 'Costuma ficar ~0,10 abaixo da Selic'),
      mkShared('ipca', 'IPCA esperado (% a.a.)', fIpca ? `Focus: ${fIpca}` : ''),
      mkShared('valor', 'Valor aplicado (R$)'),
      mkShared('meses', 'Prazo (meses)')));

    // cartões de investimento
    const cards = h('div', { class: 'scs' });
    const addBtn = h('button', { class: 'btn', type: 'button', onclick: () => {
      if (st.cenarios.length >= MAX_CARDS) return;
      const sc = novoCenario(C, ['cdb-pos', 'lci-lca', 'ipca-mais', 'pre'][st.cenarios.length % 4], st.cenarios.length);
      sc.cmp = st.cenarios.filter((x) => x.cmp).length < MAX_COMPARA; sc.cv = st.valor; sc.cm = st.meses;
      st.cenarios.push(sc); buildCards(); update();
    } }, '+ Adicionar investimento');
    box.append(cards, h('div', { class: 'addrow' }, addBtn));

    function buildCards() {
      cards.replaceChildren();
      st.cenarios.forEach((sc, i) => {
        const dyn = h('span', { text: (INDEXADORES.find((x) => x[0] === sc.indexador) || INDEXADORES[0])[2] });
        const taxa = h('input', { type: 'text', inputmode: 'decimal', autocomplete: 'off', 'aria-label': `Taxa do investimento ${LETRAS[i]}` });
        taxa.value = sc.taxa;
        taxa.disabled = sc.indexador === 'poupanca';
        taxa.addEventListener('input', () => { sc.taxa = taxa.value; update(); });
        const outras = h('input', { type: 'text', inputmode: 'decimal', autocomplete: 'off', 'aria-label': `Outras taxas do investimento ${LETRAS[i]}` });
        outras.value = sc.outrasTaxas;
        outras.addEventListener('input', () => { sc.outrasTaxas = outras.value; update(); });
        const trib = h('select', { 'aria-label': `Imposto de renda do investimento ${LETRAS[i]}` }, [['regressivo', 'IR regressivo (tributado)'], ['isento', 'Isento (LCI, LCA, LCD, CRI, CRA, debênture incentivada)']].map(([v, l]) => h('option', { value: v, text: l })));
        trib.value = sc.tributacao;
        trib.disabled = sc.indexador === 'poupanca';
        trib.addEventListener('change', () => { sc.tributacao = trib.value; update(); });
        const cb = h('input', { type: 'checkbox' });
        cb.checked = !!sc.custodiaB3;
        cb.addEventListener('change', () => { sc.custodiaB3 = cb.checked; update(); });
        const idx = h('select', { 'aria-label': `Indexador do investimento ${LETRAS[i]}` }, INDEXADORES.map(([v, l]) => h('option', { value: v, text: l })));
        idx.value = sc.indexador;
        idx.addEventListener('change', () => {
          sc.indexador = idx.value; sc.preset = '';
          dyn.textContent = INDEXADORES.find((x) => x[0] === sc.indexador)[2];
          taxa.disabled = sc.indexador === 'poupanca';
          if (sc.indexador === 'poupanca') { sc.tributacao = 'isento'; trib.value = 'isento'; }
          trib.disabled = sc.indexador === 'poupanca';
          modelo.value = '';
          buildCards(); update();
        });
        const modelo = h('select', { 'aria-label': `Modelo do investimento ${LETRAS[i]}` }, h('option', { value: '', text: 'Personalizado' }), C.PRESETS.map((p) => h('option', { value: p.id, text: p.nome })));
        modelo.value = sc.preset || '';
        modelo.addEventListener('change', () => {
          const pr = C.PRESETS.find((p) => p.id === modelo.value);
          if (!pr) { sc.preset = ''; update(); return; }
          Object.assign(sc, { preset: pr.id, indexador: pr.indexador, tributacao: pr.tributacao, taxa: String(pr.taxa).replace('.', ','), custodiaB3: !!pr.custodiaB3 });
          buildCards(); update();
        });
        const cmpIdx = st.cenarios.map((x, k) => (x.cmp ? k : -1)).filter((k) => k >= 0);
        const nCmp = cmpIdx.length;
        const cmpCb = h('input', { type: 'checkbox', 'aria-label': `Comparar o investimento ${LETRAS[i]} no gráfico` });
        cmpCb.checked = !!sc.cmp; cmpCb.disabled = !sc.cmp && nCmp >= MAX_COMPARA;
        cmpCb.addEventListener('change', () => { sc.cmp = cmpCb.checked; buildCards(); update(); });
        const incCb = h('input', { type: 'checkbox', 'aria-label': `Incluir o investimento ${LETRAS[i]} na carteira` });
        incCb.checked = !!sc.inc;
        incCb.addEventListener('change', () => { sc.inc = incCb.checked; carteiraRow.classList.toggle('off', !sc.inc); update(); });
        const cv = h('input', { type: 'text', inputmode: 'decimal', autocomplete: 'off', 'aria-label': `Valor do investimento ${LETRAS[i]} na carteira` });
        cv.value = sc.cv; cv.addEventListener('input', () => { sc.cv = cv.value; update(); });
        const cm = h('input', { type: 'text', inputmode: 'decimal', autocomplete: 'off', 'aria-label': `Prazo do investimento ${LETRAS[i]} na carteira, em meses` });
        cm.value = sc.cm; cm.addEventListener('input', () => { sc.cm = cm.value; update(); });
        const auto = C && window.RadarCarteira ? window.RadarCarteira.modalidadeDe(sc.indexador) : 'pos';
        const MOD3 = [['pos', 'Pós-fixado'], ['infl', 'Inflação'], ['pre', 'Prefixado']];
        const modSel = h('select', { 'aria-label': `Modalidade do investimento ${LETRAS[i]}` }, h('option', { value: '', text: `Automática: ${MOD3.find((m) => m[0] === auto)[1]}` }), MOD3.map(([v, l]) => h('option', { value: v, text: l })));
        modSel.value = sc.mod;
        const caixaCb = h('input', { type: 'checkbox' }); caixaCb.checked = !!sc.caixa;
        caixaCb.addEventListener('change', () => { sc.caixa = caixaCb.checked; update(); });
        const caixaLbl = h('label', { class: 'field cf chk' }, h('span', { text: 'Conta como caixa' }), h('div', { class: 'chkrow' }, caixaCb, h('small', { class: 'hint', text: 'só pós-fixado com liquidez diária' })));
        caixaLbl.hidden = (sc.mod || auto) !== 'pos';
        modSel.addEventListener('change', () => { sc.mod = modSel.value; caixaLbl.hidden = (sc.mod || auto) !== 'pos'; if (caixaLbl.hidden) { sc.caixa = false; caixaCb.checked = false; } update(); });
        const carteiraRow = h('div', { class: `cart-row${sc.inc ? '' : ' off'}` },
          h('div', { class: 'cart-cap', text: 'Na carteira' }),
          h('div', { class: 'cgrid sm' },
            h('label', { class: 'field cf' }, h('span', { text: 'Valor na carteira (R$)' }), cv),
            h('label', { class: 'field cf' }, h('span', { text: 'Prazo na carteira (meses)' }), cm),
            h('label', { class: 'field cf' }, h('span', { text: 'Modalidade' }), modSel),
            caixaLbl));
        const head = h('div', { class: 'sc-h' },
          h('span', { class: 'sc-key', style: `background:${sc.cmp ? CORES[cmpIdx.indexOf(i)] : 'var(--muted)'}` }, LETRAS[i]),
          h('b', { text: `Investimento ${LETRAS[i]}` }),
          h('label', { class: 'chk-inline' }, cmpCb, h('span', { text: 'Comparar' })),
          h('label', { class: 'chk-inline' }, incCb, h('span', { text: 'Incluir na carteira' })),
          st.cenarios.length > 1 ? h('button', { class: 'btn small', type: 'button', 'aria-label': `Remover investimento ${LETRAS[i]}`, onclick: () => { st.cenarios.splice(i, 1); if (!st.cenarios.some((x) => x.cmp)) st.cenarios[0].cmp = true; buildCards(); update(); } }, 'Remover') : null);
        cards.append(h('div', { class: 'sc' }, head, h('div', { class: 'cgrid sm' },
          h('label', { class: 'field cf' }, h('span', { text: 'Modelo' }), modelo),
          h('label', { class: 'field cf' }, h('span', { text: 'Indexador' }), idx),
          h('label', { class: 'field cf' }, dyn, taxa),
          h('label', { class: 'field cf' }, h('span', { text: 'Imposto de renda' }), trib),
          h('label', { class: 'field cf' }, h('span', { text: 'Outras taxas (% a.a.)' }), outras),
          h('label', { class: 'field cf chk' }, h('span', { text: 'Custódia B3 (Tesouro)' }), h('div', { class: 'chkrow' }, cb, h('small', { class: 'hint', text: '0,20% a.a.; Selic isento até R$ 10 mil' })))), carteiraRow));
      });
      addBtn.hidden = st.cenarios.length >= MAX_CARDS;
    }

    // resultados
    const res = h('div', { class: 'cres' });
    box.append(res);
    let last = null;
    let cart = null;
    const cartBox = h('div', { class: 'cart' });
    box.append(cartBox);

    const faixas = state.calcCfg?.faixasIR;
    const paramsOf = (sc) => ({ indexador: sc.indexador, tributacao: sc.tributacao, custodiaB3: !!sc.custodiaB3, taxa: sc.indexador === 'poupanca' ? 0 : parseNum(sc.taxa), selic: parseNum(st.selic), cdi: parseNum(st.cdi), ipca: parseNum(st.ipca), valor: parseNum(st.valor), meses: parseNum(st.meses), outrasTaxas: parseNum(sc.outrasTaxas) || 0 });
    const invalido = (P) => ['taxa', 'selic', 'cdi', 'ipca', 'valor', 'meses'].find((k) => !Number.isFinite(P[k]) || ((k === 'valor' || k === 'meses') && P[k] <= 0));
    const row = (k, v) => h('div', { class: 'dr' }, h('span', { text: k }), h('b', { text: v }));

    function update() {
      store.set('calc2', JSON.stringify(st));
      if (cart) cart.update();
      const itens = st.cenarios.map((sc, i) => ({ sc, i, P: paramsOf(sc), nome: nomeCenario(C, sc) })).filter((it) => it.sc.cmp);
      itens.forEach((it, k) => { it.cor = CORES[k]; });
      const bad = itens.find((it) => invalido(it.P));
      if (bad) {
        last = null;
        res.replaceChildren(h('p', { class: 'frase', text: 'Preencha os campos com números (use vírgula para decimais) para ver o resultado.' }));
        return;
      }
      for (const it of itens) it.r = C.calcular(it.P, faixas);
      last = itens;
      const P0 = itens[0].P;
      const parts = [];

      if (itens.length === 1) {
        const { r, P } = itens[0];
        parts.push(h('div', { class: 'strip' },
          h('div', { class: 'stat accent' }, h('span', { class: 'sl', text: 'Juro real líquido (a.a.)' }), h('b', { class: 'sv', text: pc(r.jurosReaisAA) })),
          h('div', { class: 'stat' }, h('span', { class: 'sl', text: 'Rendimento líquido' }), h('b', { class: 'sv', text: brl0.format(r.rendLiq) })),
          h('div', { class: 'stat' }, h('span', { class: 'sl', text: 'Valor final líquido' }), h('b', { class: 'sv', text: brl0.format(r.final) })),
          h('div', { class: 'stat' }, h('span', { class: 'sl', text: 'Ganho real (em R$ de hoje)' }), h('b', { class: 'sv', text: brl0.format(r.ganhoReal) }))));
        parts.push(h('div', { class: 'detail' },
          row('Prazo', `${num(P.meses, P.meses % 1 ? 1 : 0)} meses (${r.dias} dias)`),
          row('Rendimento bruto', brl2.format(r.rendBruto)),
          r.iof > 0 ? row('IOF (resgate com menos de 30 dias)', `− ${brl2.format(r.iof)}`) : null,
          row(r.isento ? 'Imposto de renda' : `Imposto de renda (${num(r.aliq, 1)}%)`, r.isento ? 'isento' : `− ${brl2.format(r.ir)}`),
          row('Taxa bruta (a.a.)', pc(r.taxaBrutaAA)),
          row('Taxa líquida (a.a.)', pc(r.taxaLiqAA))));
        parts.push(h('p', { class: 'frase', text: `Com ${num(P.ipca)}% de inflação ao ano, o rendimento líquido de ${brl0.format(r.rendLiq)} tem juro real de ${pc(r.jurosReaisAA)} ao ano: dos ${brl0.format(r.rendLiq)}, ${brl0.format(r.reposicaoInflacao)} apenas repõem a inflação e ${brl0.format(r.ganhoReal)} são ganho real, em dinheiro de hoje.` }));
        parts.push(h('p', { class: 'equiv', text: `Equivalência: ${equivText(r)}` }));
      } else {
        const melhor = itens.reduce((a, b) => (b.r.final > a.r.final ? b : a));
        const pior = itens.reduce((a, b) => (b.r.final < a.r.final ? b : a));
        const rows = itens.map((it) => h('tr', { class: it === melhor ? 'best' : '' },
          h('td', { class: 'ativo' }, h('span', { class: 'sc-key', style: `background:${it.cor}` }, LETRAS[it.i]), ` ${it.nome}`, it === melhor ? badge('maior retorno líquido', 'on') : null),
          h('td', { class: 'r', text: brl0.format(it.r.final) }),
          h('td', { class: 'r', text: brl0.format(it.r.rendLiq) }),
          h('td', { class: 'r', text: it.r.isento ? 'isento' : `${brl0.format(it.r.ir + it.r.iof)} (${num(it.r.aliq, 1)}%)` }),
          h('td', { class: 'r', text: pc(it.r.taxaLiqAA) }),
          h('td', { class: 'r', text: pc(it.r.jurosReaisAA) }),
          h('td', { class: 'r', text: brl0.format(it.r.ganhoReal) })));
        parts.push(h('div', { class: 'tblw' }, h('table', { class: 'tbl cmp' },
          h('thead', {}, h('tr', {}, ['Investimento', 'Valor final líquido', 'Rendimento líquido', 'IR e IOF (alíquota)', 'Taxa líquida a.a.', 'Juro real a.a.', 'Ganho real (R$ de hoje)'].map((c, k) => h('th', { class: k ? 'r' : '', text: c })))),
          h('tbody', {}, rows))));
        const dif = melhor.r.final - pior.r.final;
        parts.push(h('p', { class: 'frase', text: `Em ${num(P0.meses, P0.meses % 1 ? 1 : 0)} meses, com ${num(P0.ipca)}% de inflação ao ano, o investimento ${LETRAS[melhor.i]} (${melhor.nome}) entrega ${brl0.format(dif)} a mais que o ${LETRAS[pior.i]} (${pior.nome}) depois de IR e IOF, ${num((dif / pior.r.final) * 100, 1)}% sobre o valor final do ${LETRAS[pior.i]}. A conta vale só para este prazo: veja no gráfico como a diferença muda se o cliente resgatar antes.` }));
        parts.push(h('details', { class: 'eqd' }, h('summary', { text: 'Equivalência entre isento e tributado' }), itens.map((it) => h('p', { class: 'equiv', text: `${LETRAS[it.i]}: ${equivText(it.r)}` }))));
      }

      // gráfico
      const CH = window.RadarChart;
      if (CH) {
        const series = itens.map((it) => ({ id: LETRAS[it.i], nome: `${LETRAS[it.i]} · ${it.nome}`, cor: it.cor, pts: C.serie(it.P, faixas) }));
        const valor = st.modo === 'valor';
        const dados = series.map((s) => ({ id: s.id, nome: s.nome, cor: s.cor, pontos: s.pts.map((p) => ({ dias: p.dias, y: valor ? p.liquido : p.rentLiqPct, yBruto: valor ? p.bruto : p.rentBrutaPct })) }));
        const ref = { nome: `Inflação (IPCA ${num(P0.ipca)}% a.a.)`, pontos: series[0].pts.map((p) => ({ dias: p.dias, y: valor ? p.inflacao : (p.inflacao / P0.valor - 1) * 100 })) };
        const modos = pills([['valor', 'Valor (R$)'], ['pct', 'Rentabilidade (%)']], st.modo, (v) => { st.modo = v; update(); });
        const brutoCb = h('input', { type: 'checkbox' });
        brutoCb.checked = !!st.bruto;
        brutoCb.addEventListener('change', () => { st.bruto = brutoCb.checked; update(); });
        parts.push(h('h3', { class: 'sh', text: 'Evolução ao longo do prazo (líquida de IR e IOF)' }));
        parts.push(h('div', { class: 'chart-ctl' }, modos, h('label', { class: 'chk-inline' }, brutoCb, h('span', { text: 'Mostrar também antes de IR e IOF (linha pontilhada)' }))));
        parts.push(CH.render({ compacto: window.matchMedia('(max-width: 720px)').matches, series: dados, ref, mostrarBruto: !!st.bruto, fmtY: valor ? brlCompact : (n) => `${num(n, 1)}%`, fmtTip: valor ? (n) => brl0.format(n) : (n) => pc(n), titulo: `Evolução líquida de ${series.map((s) => s.nome).join(', ')} em ${num(P0.meses, 0)} meses` }));
        parts.push(h('div', { class: 'legend' }, series.map((s, k) => h('span', { class: 'lg' }, h('i', { class: 'lgk', style: `background:${s.cor}` }), s.nome)), h('span', { class: 'lg' }, h('i', { class: 'lgk ref' }), ref.nome)));
        parts.push(h('p', { class: 'small quiet', text: 'Cada ponto mostra o valor líquido se o resgate fosse naquela data. Os degraus acontecem nas viradas da tabela regressiva do IR (180, 360 e 720 dias) e o IOF pesa nos primeiros 30 dias. O IR e o IOF só incidem sobre o rendimento.' }));
        // tabela (alternativa ao gráfico, para leitura e acessibilidade)
        const dTab = [30, 90, 180, 360, 540, 720, 1080, 1440, 1800, 2520, 3600].filter((d) => d < itens[0].r.dias);
        dTab.push(itens[0].r.dias);
        const trs = dTab.map((d) => h('tr', {}, h('td', { text: `${d} dias (${num((d * 12) / 365, 1)} m)` }), itens.map((it) => {
          const rr = C.calcular({ ...it.P, meses: (d * 12) / 365 }, faixas);
          return h('td', { class: 'r' }, brl0.format(rr.final), h('small', { class: 'quiet', text: rr.isento ? ' · isento' : ` · IR ${num(rr.aliq, 1)}%${rr.iof > 0 ? ' + IOF' : ''}` }));
        })));
        parts.push(h('details', { class: 'eqd' }, h('summary', { text: 'Ver os valores em tabela' }), h('div', { class: 'tblw' }, h('table', { class: 'tbl' },
          h('thead', {}, h('tr', {}, h('th', { text: 'Resgate em' }), itens.map((it) => h('th', { class: 'r', text: `${LETRAS[it.i]} · ${it.nome}` })))),
          h('tbody', {}, trs)))));
      }

      const copyBtn = h('button', { class: 'btn', type: 'button' }, 'Copiar resumo');
      copyBtn.addEventListener('click', () => copyText(resumoTexto(itens), copyBtn));
      parts.push(h('div', { class: 'addrow' }, copyBtn));
      res.replaceChildren(...parts);
    }

    function equivText(r) {
      const e = r.equivalente;
      return e.tipo === 'tributado'
        ? `este isento rende o mesmo que um papel tributado (IR de ${num(e.aliq, 1)}%) de ${num(e.pctCDI, 1)}% do CDI, ou IPCA + ${num(e.ipcaMais)}% a.a., ou prefixado de ${num(e.preAA)}% a.a.`
        : `este papel tributado (IR de ${num(e.aliq, 1)}%) rende o mesmo que um isento de ${num(e.pctCDI, 1)}% do CDI, ou IPCA + ${num(e.ipcaMais)}% a.a., ou prefixado de ${num(e.preAA)}% a.a.`;
    }
    function resumoTexto(itens) {
      const P = itens[0].P;
      const linhas = ['Simulação de renda fixa (estimativa)', `Valor aplicado: ${brl2.format(P.valor)} por ${P.meses} meses (${itens[0].r.dias} dias)`, `Premissas: Selic ${st.selic}% | CDI ${st.cdi}% | IPCA ${st.ipca}% ao ano`, ''];
      for (const it of itens) {
        const { r } = it;
        linhas.push(`${LETRAS[it.i]}) ${it.nome}`, `   Rendimento bruto: ${brl2.format(r.rendBruto)} | IR: ${r.isento ? 'isento' : brl2.format(r.ir)}${r.iof > 0 ? ` | IOF: ${brl2.format(r.iof)}` : ''}`, `   Rendimento líquido: ${brl2.format(r.rendLiq)} | Valor final líquido: ${brl2.format(r.final)}`, `   Juro real líquido: ${pc(r.jurosReaisAA)} a.a. | Ganho real: ${brl2.format(r.ganhoReal)} (em R$ de hoje)`);
      }
      linhas.push('', 'Simulação com premissas informadas; não é recomendação de investimento. Rentabilidade passada não garante resultados futuros.');
      return linhas.join('\n');
    }

    cart = montarCarteira(cartBox, { C, st, faixas, paramsOf, invalido, save: () => store.set('calc2', JSON.stringify(st)) });
    buildCards();
    update();
    renderMapa(box);
  }

  // ---------- Carteira total (visão 360°) ----------
  const MOD_PADRAO = [['pos', 'Pós-fixado'], ['infl', 'Inflação'], ['pre', 'Prefixado'], ['rfint', 'RF internacional'], ['rvbr', 'RV Brasil'], ['rvint', 'RV internacional'], ['multi', 'Multimercados'], ['listados', 'Fundos listados'], ['alt', 'Alternativos']];
  const GRUPO_COR = { pos: 'var(--s1)', infl: 'var(--s3)', pre: 'var(--s2)' };
  const GRUPO_NOME = { pos: 'Pós-fixado', infl: 'Inflação', pre: 'Prefixado' };

  function montarCarteira(box, ctx) {
    const { C, st, faixas, paramsOf, invalido, save } = ctx;
    const K = window.RadarCarteira;
    if (!K) return { update() {} };
    const M = state.carteirasModelo;
    const mods = (M?.modalidades?.length ? M.modalidades.map((m) => [m.id, m.curto]) : MOD_PADRAO);
    const nomes = Object.fromEntries(mods);
    const perfis = M?.perfis || [];
    const strM = (metas) => Object.fromEntries(K.MODALIDADES.map((m) => [m, String(metas?.[m] ?? 0).replace('.', ',')]));
    if (!st.cart || typeof st.cart !== 'object') {
      const base = perfis.find((p) => p.id === 'moderada') || perfis[0];
      st.cart = { preset: base ? base.id : 'nenhum', metas: strM(base?.metas), caixaMin: String(base?.caixaMinimo ?? 0).replace('.', ','), tol: String(M?.tolerancia ?? 5).replace('.', ','), editado: false, outras: [] };
    }
    const cart = st.cart;
    cart.metas = { ...strM({}), ...(cart.metas || {}) };
    cart.outras = Array.isArray(cart.outras) ? cart.outras.slice(0, 12) : [];
    const pn = (v) => { const n = parseNum(v); return Number.isFinite(n) ? n : 0; };

    box.append(h('h3', { class: 'sh', text: 'Carteira total (visão 360°)' }),
      h('p', { class: 'note', text: 'Marque "Incluir na carteira" nos investimentos acima, cada um com seu valor e prazo. A parte de renda fixa Brasil é projetada, líquida de IR, IOF e custódia. As demais modalidades entram em "outras posições", só para medir a concentração. Os dados ficam salvos apenas neste aparelho; não coloque nomes de clientes.' }));

    // ----- concentração desejada (modelo) -----
    const metasBox = h('div', { class: 'metas' });
    const outBox = h('div', { class: 'outras' });
    const res = h('div', { class: 'cres' });
    box.append(h('details', { class: 'eqd', open: '' }, h('summary', { text: 'Concentração desejada (modelo de alocação)' }), metasBox), h('div', { class: 'cart-sub' }, h('b', { text: 'Outras posições (sem projeção)' }), h('p', { class: 'small quiet', text: 'Renda fixa internacional, renda variável, multimercados, fundos listados, alternativos, ou caixa em outros veículos. Entram pelo valor aplicado.' }), outBox), res);

    function buildMetas() {
      const soma = h('span', { class: 'soma' });
      const restBtn = h('button', { class: 'btn small', type: 'button' }, 'Restaurar percentuais do modelo');
      const refresh = () => {
        const s = K.MODALIDADES.reduce((a, m) => a + pn(cart.metas[m]), 0);
        soma.replaceChildren(`Soma das metas: ${num(s, 1)}%`, s > 0 && Math.abs(s - 100) > 0.05 ? h('span', { class: 'ast', text: ' * deveria somar 100%' }) : '');
        restBtn.hidden = !(cart.editado && perfis.some((p) => p.id === cart.preset));
      };
      const opts = [...perfis.map((p) => [p.id, p.nome]), ['nenhum', 'Sem modelo']];
      const aplicar = (id) => {
        cart.preset = id; cart.editado = false;
        const pf = perfis.find((p) => p.id === id);
        cart.metas = pf ? strM(pf.metas) : strM({});
        cart.caixaMin = pf ? String(pf.caixaMinimo).replace('.', ',') : '0';
        buildMetas(); save(); atualizar();
      };
      restBtn.addEventListener('click', () => aplicar(cart.preset));
      const campo = (label, get, set, hint) => {
        const inp = h('input', { type: 'text', inputmode: 'decimal', autocomplete: 'off', 'aria-label': label });
        inp.value = get();
        inp.addEventListener('input', () => { set(inp.value); cart.editado = true; refresh(); save(); atualizar(); });
        return h('label', { class: 'field cf' }, h('span', { text: label }), inp, hint ? h('small', { class: 'hint', text: hint }) : null);
      };
      metasBox.replaceChildren(
        pills(opts, cart.preset, aplicar),
        h('p', { class: 'small quiet', text: 'Os três modelos vêm preenchidos e todos os percentuais podem ser editados. "Pós-fixado" é o total da modalidade, incluindo o caixa.' }),
        h('div', { class: 'cgrid sm metas-grid' }, mods.map(([id, nome]) => campo(`${nome} (%)`, () => cart.metas[id], (v) => { cart.metas[id] = v; })),
          campo('Caixa mínimo (% da carteira)', () => cart.caixaMin, (v) => { cart.caixaMin = v; }, 'Piso, dentro do pós-fixado'),
          campo('Tolerância (p.p.)', () => cart.tol, (v) => { cart.tol = v; }, 'Margem antes do aviso')),
        h('div', { class: 'addrow' }, soma, restBtn));
      refresh();
    }

    function buildOutras() {
      outBox.replaceChildren(
        ...cart.outras.map((o, i) => {
          const sel = h('select', { 'aria-label': 'Modalidade da posição' }, mods.map(([id, nome]) => h('option', { value: id, text: nome })));
          sel.value = o.m;
          const v = h('input', { type: 'text', inputmode: 'decimal', autocomplete: 'off', 'aria-label': 'Valor da posição (R$)', placeholder: 'Valor (R$)' });
          v.value = o.valor;
          v.addEventListener('input', () => { o.valor = v.value; save(); atualizar(); });
          const cx = h('input', { type: 'checkbox' }); cx.checked = !!o.caixa;
          cx.addEventListener('change', () => { o.caixa = cx.checked; save(); atualizar(); });
          const cxl = h('label', { class: 'chk-inline' }, cx, h('span', { text: 'Conta como caixa' })); cxl.hidden = o.m !== 'pos';
          sel.addEventListener('change', () => { o.m = sel.value; cxl.hidden = o.m !== 'pos'; if (o.m !== 'pos') { o.caixa = false; cx.checked = false; } save(); atualizar(); });
          return h('div', { class: 'orow' }, sel, v, cxl, h('button', { class: 'btn small', type: 'button', 'aria-label': 'Remover posição', onclick: () => { cart.outras.splice(i, 1); buildOutras(); save(); atualizar(); } }, 'Remover'));
        }),
        h('div', { class: 'addrow' }, cart.outras.length < 12 ? h('button', { class: 'btn', type: 'button', onclick: () => { cart.outras.push({ m: 'rvbr', valor: '', caixa: false }); buildOutras(); save(); } }, '+ Adicionar posição') : null));
    }

    // ----- resultado -----
    function atualizar() {
      const faixasIR = faixas;
      const parts = [];
      const aviso = [];
      const itens = [];
      st.cenarios.forEach((sc, i) => {
        if (!sc.inc) return;
        const P = { ...paramsOf(sc), valor: parseNum(sc.cv), meses: parseNum(sc.cm) };
        if (invalido(P)) { aviso.push(`${LETRAS[i]} (valor, prazo ou taxa sem número)`); return; }
        itens.push({ i, sc, P, nome: nomeCenario(C, sc), mod: sc.mod || K.modalidadeDe(sc.indexador) });
      });
      const outras = cart.outras.map((o) => ({ m: o.m, valor: parseNum(o.valor), caixa: !!o.caixa })).filter((o) => o.valor > 0);
      if (!itens.length && !outras.length) {
        res.replaceChildren(h('p', { class: 'frase', text: aviso.length ? `Preencha os campos de: ${aviso.join(', ')}.` : 'Marque "Incluir na carteira" em um ou mais investimentos, ou adicione outras posições, para ver a carteira total.' }));
        return;
      }
      for (const it of itens) { it.r = C.calcular(it.P, faixasIR); it.pts = C.serie(it.P, faixasIR, { pontos: 48 }); }
      const posicoes = [...itens.map((it) => ({ nome: it.nome, modalidade: it.mod, valor: it.P.valor, caixa: it.sc.caixa })), ...outras.map((o) => ({ nome: nomes[o.m], modalidade: o.m, valor: o.valor, caixa: o.caixa }))];
      const metas = Object.fromEntries(K.MODALIDADES.map((m) => [m, pn(cart.metas[m])]));
      const con = K.consolidar({ posicoes, metas, caixaMinimo: pn(cart.caixaMin), tolerancia: cart.tol === '' ? 5 : pn(cart.tol), nomes });
      const ipca = parseNum(st.ipca);
      const tem = itens.length > 0;
      let agg = null, S = null;
      if (tem) {
        const aplic = itens.reduce((a, it) => a + it.P.valor, 0);
        const fin = itens.reduce((a, it) => a + it.r.final, 0);
        const Hm = Math.max(...itens.map((it) => it.P.meses));
        const dH = Math.max(1, Math.round((Hm * 365) / 12));
        const taxa = (Math.pow(fin / aplic, 365 / dH) - 1) * 100;
        S = { aplic, fin, rend: fin - aplic, taxa, real: Number.isFinite(ipca) ? ((1 + taxa / 100) / (1 + ipca / 100) - 1) * 100 : NaN, Hm, prazoMedio: itens.reduce((a, it) => a + it.P.valor * it.P.meses, 0) / aplic, isento: itens.reduce((a, it) => a + (it.r.isento ? it.P.valor : 0), 0) / aplic * 100 };
        agg = K.agregar(itens.map((it) => ({ valor: it.P.valor, grupo: it.mod, pts: it.pts })), Number.isFinite(ipca) ? ipca : 0);
      }
      if (aviso.length) parts.push(h('p', { class: 'small quiet', text: `Não entraram na carteira por falta de números: ${aviso.join('; ')}.` }));
      parts.push(h('div', { class: 'strip' },
        h('div', { class: 'stat accent' }, h('span', { class: 'sl', text: 'Total da carteira (aplicado)' }), h('b', { class: 'sv', text: brl0.format(con.total) })),
        tem ? h('div', { class: 'stat' }, h('span', { class: 'sl', text: `Valor final líquido (RF projetada, ${num(S.Hm, S.Hm % 1 ? 1 : 0)} m)` }), h('b', { class: 'sv', text: brl0.format(S.fin) })) : null,
        tem ? h('div', { class: 'stat' }, h('span', { class: 'sl', text: 'Rendimento líquido' }), h('b', { class: 'sv', text: brl0.format(S.rend) })) : null,
        tem ? h('div', { class: 'stat' }, h('span', { class: 'sl', text: 'Rentabilidade líquida acumulada' }), h('b', { class: 'sv', text: pc((S.fin / S.aplic - 1) * 100) })) : null,
        tem ? h('div', { class: 'stat' }, h('span', { class: 'sl', text: 'Taxa líquida média (a.a.)' }), h('b', { class: 'sv', text: pc(S.taxa) })) : null,
        tem ? h('div', { class: 'stat' }, h('span', { class: 'sl', text: 'Taxa líquida média (a.m.)' }), h('b', { class: 'sv', text: pc((Math.pow(1 + S.taxa / 100, 1 / 12) - 1) * 100) })) : null,
        tem && Number.isFinite(parseNum(st.cdi)) && parseNum(st.cdi) > 0 ? h('div', { class: 'stat' }, h('span', { class: 'sl', text: 'Equivale a (% do CDI, líquido)' }), h('b', { class: 'sv', text: `${num((S.taxa / parseNum(st.cdi)) * 100, 0)}%` })) : null,
        tem && Number.isFinite(S.real) ? h('div', { class: 'stat' }, h('span', { class: 'sl', text: 'Juro real líquido (a.a.)' }), h('b', { class: 'sv', text: pc(S.real) })) : null));
      if (tem) parts.push(h('p', { class: 'small quiet', text: `Prazo médio ponderado: ${num(S.prazoMedio, 1)} meses. Isentos de IR: ${num(S.isento, 0)}% do valor projetado. As taxas médias são ponderadas pelo valor de cada posição e consideram todo o valor aplicado até o fim do maior prazo; cada posição para de render no vencimento e o valor líquido fica parado, sem reinvestimento.` }));

      // tabela de posições
      const linhas = [
        ...itens.map((it) => h('tr', {}, h('td', { class: 'ativo' }, h('span', { class: 'sc-key', style: 'background:var(--muted)' }, LETRAS[it.i]), ` ${it.nome}`, it.sc.caixa ? badge('caixa', 'soon') : null), h('td', { text: nomes[it.mod] }), h('td', { class: 'r', text: brl0.format(it.P.valor) }), h('td', { class: 'r', text: `${num((it.P.valor / con.total) * 100, 1)}%` }), h('td', { class: 'r', text: `${num(it.P.meses, it.P.meses % 1 ? 1 : 0)} m` }), h('td', { class: 'r', text: brl0.format(it.r.final) }), h('td', { class: 'r', text: pc(it.r.taxaLiqAA) }))),
        ...outras.map((o) => h('tr', {}, h('td', { class: 'ativo', text: `Outra posição${o.caixa ? ' (caixa)' : ''}` }), h('td', { text: nomes[o.m] }), h('td', { class: 'r', text: brl0.format(o.valor) }), h('td', { class: 'r', text: `${num((o.valor / con.total) * 100, 1)}%` }), h('td', { class: 'r', text: '–' }), h('td', { class: 'r quiet', text: 'sem projeção' }), h('td', { class: 'r', text: '–' }))),
      ];
      parts.push(h('div', { class: 'tblw' }, h('table', { class: 'tbl cmp' }, h('thead', {}, h('tr', {}, ['Posição', 'Modalidade', 'Aplicado', '% da carteira', 'Prazo', 'Valor final líquido', 'Taxa líq. a.a.'].map((c, k) => h('th', { class: k > 1 ? 'r' : '', text: c })))), h('tbody', {}, linhas))));

      // evolução da parte projetada (áreas empilhadas)
      const CH = window.RadarChart;
      if (tem && CH && CH.renderArea) {
        const ordem = ['pos', 'infl', 'pre'].filter((g) => agg.grupos[g]);
        const camadas = ordem.map((g) => ({ id: g, nome: GRUPO_NOME[g], cor: GRUPO_COR[g], valores: agg.grupos[g] }));
        parts.push(h('h3', { class: 'sh', text: 'Evolução da parte projetada (renda fixa Brasil, líquida)' }));
        parts.push(CH.renderArea({ compacto: window.matchMedia('(max-width: 720px)').matches, dias: agg.dias, camadas, total: agg.total, ref: { nome: `Só inflação (IPCA ${num(ipca)}% a.a.)`, valores: agg.infl }, fmtY: brlCompact, fmtTip: (n) => brl0.format(n), titulo: 'Evolução líquida da parte projetada da carteira, por modalidade' }));
        parts.push(h('div', { class: 'legend' }, camadas.map((c) => h('span', { class: 'lg' }, h('i', { class: 'lgk', style: `background:${c.cor}` }), c.nome)), h('span', { class: 'lg' }, h('i', { class: 'lgk ref' }), `Só inflação (IPCA ${num(ipca)}% a.a.)`)));
        parts.push(h('p', { class: 'small quiet', text: 'Cada ponto mostra o valor líquido se todas as posições fossem resgatadas naquela data. Resgate antes do vencimento de títulos públicos e crédito privado pode ter preço diferente (marcação a mercado). Não inclui come-cotas nem carência.' }));
      }

      // concentração vs modelo
      const temMeta = con.somaMetas > 0;
      const alertaPor = new Set(con.alertas.map((a) => a.id));
      const maxP = Math.max(10, ...K.MODALIDADES.map((m) => Math.max(con.pct[m], metas[m] || 0))) * 1.08;
      const barra = (id, nome, valor, meta, marcaCaixa) => h('div', { class: 'bar-row' },
        h('span', { class: 'bar-l' }, nome, alertaPor.has(id) ? h('sup', { class: 'ast', text: '*' }) : null),
        h('div', { class: 'bar-t' }, h('i', { class: `bar-f${marcaCaixa ? ' cx' : ''}`, style: `width:${Math.min(100, (valor / maxP) * 100).toFixed(1)}%` }), temMeta ? h('i', { class: 'bar-m', style: `left:${Math.min(100, (meta / maxP) * 100).toFixed(1)}%`, title: marcaCaixa ? 'mínimo do modelo' : 'meta do modelo' }) : null),
        h('span', { class: 'bar-v' }, `${num(valor, 1)}%`, temMeta ? h('small', { class: 'quiet', text: ` · modelo ${num(meta, 1)}%` }) : null));
      parts.push(h('h3', { class: 'sh', text: temMeta ? 'Concentração da carteira vs. modelo' : 'Concentração da carteira' }));
      parts.push(h('div', { class: 'bars', role: 'group', 'aria-label': 'Concentração por modalidade' },
        mods.map(([id, nome]) => barra(id, nome, con.pct[id], metas[id] || 0, false)),
        barra('caixa', 'Caixa (dentro do pós-fixado)', con.caixaPct, pn(cart.caixaMin), true)));
      parts.push(h('p', { class: 'small quiet', text: `A concentração usa o valor aplicado hoje.${temMeta ? ' O traço em cada barra marca a meta do modelo.' : ' Escolha um modelo acima para comparar com a alocação desejada.'}` }));
      if (con.alertas.length) parts.push(h('div', { class: 'alertas', role: 'note' }, con.alertas.map((a) => h('p', { class: 'alerta' }, h('span', { class: 'ast', text: '* ' }), a.texto))));
      else if (temMeta) parts.push(h('p', { class: 'small quiet', text: `Concentração dentro da tolerância do modelo (${num(cart.tol === '' ? 5 : pn(cart.tol), 1)} p.p.).` }));

      const btn = h('button', { class: 'btn', type: 'button' }, 'Copiar resumo da carteira');
      btn.addEventListener('click', () => copyText(resumo(), btn));
      parts.push(h('div', { class: 'addrow' }, btn));
      res.replaceChildren(...parts);

      function resumo() {
        const L = ['Carteira (simulação, estimativa)', `Total aplicado: ${brl2.format(con.total)}`, `Premissas: Selic ${st.selic}% | CDI ${st.cdi}% | IPCA ${st.ipca}% ao ano`, ''];
        for (const it of itens) L.push(`${LETRAS[it.i]}) ${it.nome} [${nomes[it.mod]}]: ${brl2.format(it.P.valor)} por ${it.P.meses} meses, final líquido ${brl2.format(it.r.final)}`);
        for (const o of outras) L.push(`Outra posição [${nomes[o.m]}]: ${brl2.format(o.valor)}`);
        if (tem) L.push('', `Renda fixa projetada: final líquido ${brl2.format(S.fin)} (rendimento ${brl2.format(S.rend)}), rentabilidade líquida acumulada ${pc((S.fin / S.aplic - 1) * 100)}, taxa líquida média ${pc(S.taxa)} a.a.`);
        L.push('', 'Concentração (aplicado hoje):', ...K.MODALIDADES.map((m) => `- ${nomes[m]}: ${num(con.pct[m], 1)}%${temMeta ? ` (modelo ${num(metas[m], 1)}%)` : ''}`), `- Caixa: ${num(con.caixaPct, 1)}%${temMeta ? ` (mínimo ${num(pn(cart.caixaMin), 1)}%)` : ''}`);
        if (con.alertas.length) L.push('', 'Avisos:', ...con.alertas.map((a) => `* ${a.texto}`));
        L.push('', 'Simulação com premissas informadas; não é recomendação de investimento. Rentabilidade passada não garante resultados futuros.');
        return L.join('\n');
      }
    }

    buildMetas();
    buildOutras();
    return { update: atualizar };
  }

  function renderMapa(box) {
    const m = state.mapa;
    if (!m?.grupos) return;
    box.append(h('h3', { class: 'sh', text: 'Mapa de ativos: renda fixa' }));
    const badgeFor = (v) => {
      const low = v.toLowerCase();
      if (low.startsWith('isento') || low === 'com fgc') return badge(v, 'on');
      if (low === 'sem fgc') return badge(v, 'soon');
      return v;
    };
    const rows = [];
    for (const g of m.grupos) {
      rows.push(h('tr', { class: 'gh' }, h('th', { colspan: String(m.colunas.length), text: g.titulo })));
      if (g.caracteristica) rows.push(h('tr', { class: 'gc' }, h('td', { colspan: String(m.colunas.length) }, h('span', { class: 'gcl', text: 'Característica da classe' }), ` ${g.caracteristica}`)));
      for (const l of g.linhas) rows.push(h('tr', {}, l.map((c, i) => h('td', { class: i === 1 ? 'ativo' : i >= 5 ? 'wrap' : '' }, i >= 3 && i < 5 ? badgeFor(c) : c))));
    }
    box.append(h('div', { class: 'tblw' }, h('table', { class: 'tbl mapa' }, h('thead', {}, h('tr', {}, m.colunas.map((c) => h('th', { text: c })))), h('tbody', {}, rows))));
    if (m.legenda?.length) box.append(h('dl', { class: 'legenda' }, m.legenda.flatMap(([k, v]) => [h('dt', { text: k }), h('dd', { text: v })])));
    if (m.notas?.length) box.append(h('ul', { class: 'small quiet notas' }, m.notas.map((n) => h('li', { text: n }))));
  }

  // ---------- Educação (conceitos para a conversa com o cliente; conteúdo em data/educacao.json) ----------
  function renderEducacao(box) {
    const E = state.edu;
    if (!E?.secoes?.length) { box.append(unavailable('A página de educação')); return; }
    box.append(h('div', { class: 'note', text: E.aviso || 'Conteúdo educacional. Não é recomendação de investimento.' }));
    const secs = {};
    const nav = h('div', { class: 'filters edu-nav' }, E.secoes.map((sec) => h('button', { class: 'pill', type: 'button', onclick: () => {
      for (const d of Object.values(secs)) d.open = d === secs[sec.id];
      secs[sec.id].scrollIntoView({ behavior: 'smooth', block: 'start' });
    } }, sec.titulo)));
    box.append(nav);
    const card = (it) => h('div', { class: 'card edu-card' },
      h('div', { class: 'edu-h' }, h('b', { class: 'th', text: it.titulo }), it.tag ? badge(it.tag, 'reg') : null, it.confirmar ? badge('a confirmar', 'soon', 'Texto interpretado a partir do conceito: revise antes de usar com clientes') : null),
      it.texto ? h('p', { class: 'why', text: it.texto }) : null,
      it.pontos?.length ? h('ul', { class: 'edu-ul' }, it.pontos.map((x) => h('li', { text: x }))) : null,
      it.quando ? h('p', { class: 'edu-when' }, h('b', { text: 'Quando faz sentido: ' }), it.quando) : null);
    E.secoes.forEach((sec, i) => {
      const body = [];
      if (sec.resumo) body.push(h('p', { class: 'edu-sum', text: sec.resumo }));
      for (const b of sec.blocos || []) {
        if (b.titulo) body.push(h('h4', { class: 'edu-bt', text: b.titulo }));
        if (b.tipo === 'cards') body.push(h('div', { class: 'edu-grid' }, (b.itens || []).map(card)));
        else if (b.tipo === 'passos') body.push(h('ol', { class: 'edu-steps' }, (b.itens || []).map((it) => h('li', {}, card(it)))));
        else if (b.tipo === 'lista') body.push(h('div', { class: 'filters' }, (b.itens || []).map((x) => h('span', { class: 'chip', text: x }))));
        else if (b.tipo === 'destaque') body.push(h('div', { class: 'note', text: b.texto }));
      }
      secs[sec.id] = h('details', { class: 'edu-sec', id: `edu-${sec.id}`, open: i === 0 }, h('summary', {}, h('span', { class: 'edu-n', text: String(i + 1) }), sec.titulo), h('div', { class: 'edu-body' }, body));
      box.append(secs[sec.id]);
    });
    if (E.revisadoEm) box.append(h('p', { class: 'small quiet', text: `Conteúdo revisado em ${fmtBR(E.revisadoEm)}.` }));
  }

  // ---------- Conteúdo ----------
  function renderConteudo(box) {
    const c = state.extras.conteudo;
    if (!c?.pauta) { box.append(unavailable('A pauta de conteúdo', c?.erro)); return; }
    box.append(h('div', { class: 'note', text: `Sugestões a partir das notícias dos últimos ${c.janelaDias} dias (${c.totalBase} guardadas). Edite com a sua voz e passe pelo compliance antes de publicar.` }));
    box.append(h('h3', { class: 'sh', text: 'Plano da semana' }));
    box.append(h('div', { class: 'plan' }, c.plano.map((p) => h('div', { class: 'card pl' },
      h('b', { class: 'dia', text: p.dia }), h('span', { class: 'small', text: p.formato }),
      h('p', { class: 'th2', text: p.tema }), h('p', { class: 'small quiet', text: p.gancho })))));
    box.append(h('h3', { class: 'sh', text: 'Pauta: temas com mais força' }));
    if (!c.pauta.length) box.append(h('div', { class: 'empty' }, h('p', { text: 'Ainda não há notícias suficientes para sugerir uma pauta.' })));
    for (const p of c.pauta) {
      box.append(h('article', { class: 'card pauta' },
        h('div', { class: 'meta' }, badge(p.tema), h('span', { text: `${p.noticias} ${p.noticias === 1 ? 'notícia' : 'notícias'}` })),
        h('h3', { class: 'th', text: p.titulo }),
        h('p', { class: 'why', text: p.angulo }),
        h('p', {}, h('b', { text: 'Pergunta que o cliente faz: ' }), p.pergunta),
        h('p', { class: 'small quiet', text: `Formatos: ${p.formatos.join(' · ')}` }),
        h('ul', { class: 'nls' }, p.fontes.map((s) => h('li', { class: 'nl' }, link(s.url, s.title), h('span', { class: 'src2', text: ` · ${s.sourceName}` }))))));
    }
    if (c.newsletter) {
      const ta = h('textarea', { class: 'area big', rows: 16, 'aria-label': 'Rascunho da newsletter' });
      ta.value = c.newsletter.markdown;
      const btn = h('button', { class: 'btn primary', type: 'button', onclick: () => copyText(ta.value, btn) }, 'Copiar rascunho');
      box.append(h('h3', { class: 'sh', text: 'Rascunho da newsletter semanal' }));
      box.append(h('div', { class: 'card plain' }, h('p', { class: 'small', text: 'Texto em Markdown, pronto para colar no seu e-mail ou ferramenta de envio. Troque [nome] e preencha o ponto de atenção.' }), ta, h('div', { class: 'addrow' }, btn)));
    }
    box.append(h('h3', { class: 'sh', text: 'Antes de publicar' }));
    box.append(h('div', { class: 'card plain' }, h('ul', { class: 'ck' }, c.checklist.map((x) => h('li', { text: x }))), h('p', { class: 'small quiet', text: c.disclaimer })));
  }

  // ---------- render ----------
  function topicLabels() { return Object.fromEntries(state.data.meta.topics.map((t) => [t.id, t.label])); }

  function renderTabs(all) {
    const nav = $('tabs');
    nav.replaceChildren();
    nav.hidden = state.section !== 'noticias';
    if (nav.hidden) return;
    const rel = all.filter((i) => i.relevant);
    const defs = [
      { id: 'hoje', label: 'Destaques', n: groupByCluster(rel).length },
      ...state.data.meta.topics.filter((t) => t.id !== 'geral').map((t) => ({ id: t.id, label: t.label, n: groupByCluster(rel.filter((i) => i.topics.includes(t.id))).length })),
      { id: 'geral', label: 'Outros', n: all.filter((i) => !i.relevant).length },
    ];
    if (!defs.some((d) => d.id === state.tab)) state.tab = 'hoje';
    for (const d of defs) {
      nav.append(h('button', {
        class: `tab ${d.cls || ''}`, role: 'tab', type: 'button', 'aria-selected': String(d.id === state.tab),
        onclick: () => { state.tab = d.id; store.set('tab', d.id); render(); window.scrollTo({ top: 0 }); },
      }, d.label, h('span', { class: 'n', text: String(d.n) })));
    }
    const sel = nav.querySelector('[aria-selected="true"]');
    if (sel && !sel.classList.contains('impact')) nav.scrollLeft = Math.max(0, sel.offsetLeft - 24);
  }

  function renderSections(all) {
    const nav = $('sections');
    nav.replaceChildren();
    const rel = all.filter((i) => i.relevant);
    const x = state.extras;
    const counts = {
      noticias: groupByCluster(rel).length,
      prospeccao: x.prospeccao?.gatilhos?.length,
      agenda: x.agenda?.eventos?.filter((e) => e.tipo !== 'focus' && e.janela !== 'depois').length,
      conteudo: x.conteudo?.pauta?.length,
      impacto: groupByCluster(rel.filter((i) => i.analysis)).length,
    };
    for (const d of SECTIONS) {
      nav.append(h('button', {
        class: `tab ${d.cls || ''}`, role: 'tab', type: 'button', 'aria-selected': String(d.id === state.section),
        onclick: () => { state.section = d.id; store.set('section', d.id); render(); window.scrollTo({ top: 0 }); },
      }, d.label, counts[d.id] != null ? h('span', { class: 'n', text: String(counts[d.id]) }) : null));
    }
    const sel = nav.querySelector('[aria-selected="true"]');
    if (sel && !sel.classList.contains('impact')) nav.scrollLeft = Math.max(0, sel.offsetLeft - 24);
    else if (sel) nav.scrollLeft = nav.scrollWidth;
  }

  function renderBody(all) {
    const box = $('list');
    const sec = state.section;
    if (sec === 'noticias' || sec === 'impacto') return renderList(all);
    box.replaceChildren();
    if (sec === 'prospeccao') renderProspeccao(box);
    else if (sec === 'ativos') renderAtivos(box, all);
    else if (sec === 'agenda') renderAgenda(box);
    else if (sec === 'leituras') renderLeituras(box);
    else if (sec === 'conteudo') renderConteudo(box);
    else if (sec === 'calculadora') renderCalculadora(box);
    else if (sec === 'educacao') renderEducacao(box);
  }

  function renderList(all) {
    const box = $('list');
    box.replaceChildren();
    let groups = groupByCluster(tabItems(all));

    if (state.section === 'impacto') {
      groups.sort((a, b) => b.head.priorityScore - a.head.priorityScore);
      const lv = ['todas', 'alta', 'media'];
      box.append(h('div', { class: 'note', text: 'Leitura automática por regras (e IA, se ativada), baseada nos títulos e resumos. É um ponto de partida para pensar em carteiras e em contato com clientes — não é recomendação de investimento. Confira a matéria original antes de agir.' }));
      box.append(h('div', { class: 'filters' }, 'Mostrar:', lv.map((v) => h('button', {
        class: 'pill', type: 'button', 'aria-pressed': String(state.level === v),
        onclick: () => { state.level = v; store.set('level', v); render(); },
      }, { todas: 'Todas', alta: 'Só prioridade alta', media: 'Alta + média' }[v]))));
      if (state.level === 'alta') groups = groups.filter((g) => g.head.priority === 'alta');
      if (state.level === 'media') groups = groups.filter((g) => g.head.priority !== 'baixa');
    }

    if (!groups.length) {
      const e = h('div', { class: 'empty' }, h('p', { text: 'Nada por aqui neste período e com estes filtros.' }));
      if (state.period === 'today') e.append(h('button', { class: 'btn', type: 'button', onclick: () => { state.period = '48'; $('period').value = '48'; store.set('period', '48'); render(); } }, 'Ver últimas 48h'));
      box.append(e);
      return;
    }
    const labels = topicLabels();
    const cap = 120;
    for (const g of groups.slice(0, cap)) box.append(state.section === 'impacto' ? impactCard(g) : newsCard(g, labels));
    if (groups.length > cap) box.append(h('div', { class: 'note', text: `Mostrando ${cap} de ${groups.length}. Use os filtros para refinar.` }));
  }

  function renderFooter() {
    const m = state.data.meta;
    $('disclaimer').textContent = m.disclaimer;
    const body = h('table', {}, h('thead', {}, h('tr', {}, h('th', { text: 'Portal' }), h('th', { text: 'Situação' }), h('th', { text: 'Itens' }))),
      h('tbody', {}, m.sources.map((s) => h('tr', {},
        h('td', { text: s.name }),
        h('td', {}, h('span', { class: `dot ${s.status}` }), s.status === 'ok' ? `ok${s.via && s.via !== 'rss' ? ` (via ${s.via})` : ''}` : s.status === 'desativado' ? 'desativado' : 'sem resposta', s.error ? h('div', { class: 'small', text: s.error }) : null, s.note && s.status !== 'ok' ? h('div', { class: 'small', text: s.note }) : null),
        h('td', { text: String(s.itemsStored ?? s.items) })))));
    $('healthBody').replaceChildren(body);

    const base = new URL(API, location.href).href;
    const eps = [['news.json', 'tudo, com análise'], ['impact.json', 'ranking de impacto'], ['topics/economia.json', 'um tópico (economia, monetaria, fiscal, geopolitica, politica, mercados, cambio, fundos, empresas, regulacao, geral)'], ['prospeccao.json', 'gatilhos de prospecção'], ['agenda.json', 'agenda'], ['focus.json', 'Boletim Focus'], ['conteudo.json', 'pauta e newsletter'], ['leituras.json', 'documentos e gestoras'], ['sources.json', 'saúde das fontes'], ['meta.json', 'só data da última coleta']];
    $('apiBody').replaceChildren(h('ul', {}, eps.map(([p, d]) => h('li', {}, h('code', { text: base + p }), ` — ${d}`))));

    const host = location.hostname;
    const link = $('actionsLink');
    link.replaceChildren();
    if (host.endsWith('.github.io')) {
      const owner = host.split('.')[0], repo = location.pathname.split('/')[1];
      if (repo) link.append('Quer coletar agora, sem esperar? ', h('a', { href: `https://github.com/${owner}/${repo}/actions/workflows/update.yml`, target: '_blank', rel: 'noopener noreferrer', text: 'abra o workflow e clique em "Run workflow"' }), ' (precisa estar logado no GitHub).');
    }
  }

  function renderSelects() {
    const sel = $('source');
    const cur = state.source;
    sel.replaceChildren(h('option', { value: '', text: 'Todos' }), state.data.meta.sources.filter((s) => s.status === 'ok').map((s) => h('option', { value: s.id, text: s.name })));
    sel.value = cur;
  }

  function setStatus() {
    const m = state.data?.meta;
    if (!m) return;
    if (state.flash && Date.now() < state.flashUntil) { $('statusText').textContent = state.flash; return; }
    const ok = m.sources.filter((s) => s.status === 'ok').length;
    const on = m.sources.filter((s) => s.status !== 'desativado').length;
    const age = (Date.now() - Date.parse(m.generatedAt)) / 60000;
    // ponto de frescor: pulsa quando a coleta é recente; âmbar quando está atrasada
    $('pulse').className = `pulse ${age <= 25 ? 'fresh' : age <= 120 ? 'ok' : 'stale'}`;
    $('statusText').textContent = `Coletado às ${fmtTime.format(new Date(m.generatedAt))} (${ago(m.generatedAt)}). ${m.relevantCount} notícias relevantes, ${ok} de ${on} portais respondendo.${age > 120 ? ' A coleta está atrasada: confira o workflow no GitHub.' : ''}`;
  }

  function render() {
    if (!state.data) return;
    const all = filtered();
    if (!SECTIONS.some((d) => d.id === state.section)) state.section = 'noticias';
    $('controls').hidden = !WITH_FILTERS.has(state.section);
    renderSections(all);
    renderTabs(all);
    renderBody(all);
    renderFooter();
    renderSelects();
    setStatus();
  }

  // ---------- eventos ----------
  $('refresh').addEventListener('click', () => refresh(true));
  const themeBtn = $('theme');
  const syncTheme = () => { themeBtn.textContent = document.documentElement.dataset.theme === 'light' ? 'Tema escuro' : 'Tema claro'; };
  themeBtn.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    store.set('theme', next);
    syncTheme();
  });
  syncTheme();
  $('period').value = state.period;
  $('region').value = state.region;
  $('period').addEventListener('change', (e) => { state.period = e.target.value; store.set('period', state.period); render(); });
  $('region').addEventListener('change', (e) => { state.region = e.target.value; store.set('region', state.region); render(); });
  $('source').addEventListener('change', (e) => { state.source = e.target.value; render(); });
  let qt;
  $('q').addEventListener('input', (e) => { clearTimeout(qt); qt = setTimeout(() => { state.q = e.target.value; render(); }, 150); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && state.data) poll(); });
  setInterval(poll, 5 * 60 * 1000);

  load(false).then(async (d) => { state.data = d; await loadExtras(false); render(); }).catch((e) => {
    $('statusText').textContent = 'Ainda não há dados publicados. Rode o workflow "Atualizar notícias" no GitHub (veja o README).';
    $('list').append(h('div', { class: 'empty', text: `Não consegui carregar ${API}news.json (${e.message}).` }));
  });
})();

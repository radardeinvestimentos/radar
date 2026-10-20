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
    if (!state.mapa) { try { state.mapa = await getJson('./data/mapa-rf.json'); } catch { state.mapa = null; } }
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

  // ---------- Calculadora de renda fixa ----------
  const brl0 = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  const brl2 = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pc = (n, d = 2) => `${num(n, d)}%`;
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

  function renderCalculadora(box) {
    const C = window.RadarCalc;
    if (!C) { box.append(unavailable('A calculadora')); return; }
    const cfg = state.calcCfg || { selic: 13.75, cdi: 13.65, ipca: 4.5 };
    let saved = {};
    try { saved = JSON.parse(store.get('calc', '{}')) || {}; } catch { saved = {}; }
    const st = { indexador: 'cdi_pct', tributacao: 'regressivo', taxa: '110', custodiaB3: false, outrasTaxas: '0', selic: String(cfg.selic).replace('.', ','), cdi: String(cfg.cdi).replace('.', ','), ipca: String(cfg.ipca).replace('.', ','), valor: '100.000', meses: '12', ...saved };

    box.append(h('div', { class: 'note', text: 'Simulação com as premissas que você informar, para conversar com o cliente. Não consulta taxas de mercado, não inclui IOF, come-cotas, carência nem marcação a mercado, e as taxas dos modelos são só exemplos. Não é recomendação de investimento.' }));

    const inputs = {};
    const mk = (key, label, opts = {}) => {
      const input = h('input', { type: 'text', inputmode: 'decimal', autocomplete: 'off', 'aria-label': label });
      input.value = st[key];
      input.addEventListener('input', () => { st[key] = input.value; update(); });
      inputs[key] = input;
      return h('label', { class: 'field cf' }, h('span', { text: label, class: opts.dyn ? 'dyn' : '' }), input, opts.hint ? h('small', { class: 'hint', text: opts.hint }) : null);
    };
    const mkSel = (key, label, options) => {
      const sel = h('select', { 'aria-label': label }, options.map(([v, l]) => h('option', { value: v, text: l })));
      sel.value = st[key];
      sel.addEventListener('change', () => { st[key] = sel.value; if (key === 'indexador') syncIdx(); update(); });
      inputs[key] = sel;
      return h('label', { class: 'field cf' }, h('span', { text: label }), sel);
    };

    // modelos de produto
    const chipRow = h('div', { class: 'filters' }, h('span', { class: 'small quiet', text: 'Modelo:' }));
    const chips = {};
    for (const pr of C.PRESETS) {
      const b = h('button', { class: 'pill', type: 'button', 'aria-pressed': 'false', onclick: () => applyPreset(pr) }, pr.nome);
      chips[pr.id] = b; chipRow.append(b);
    }
    box.append(chipRow);

    const f = state.extras.focus;
    const fIpca = f?.ok ? f.linhas.filter((l) => l.indicador === 'IPCA').map((l) => `${l.ano}: ${num(l.mediana)}%`).join(' · ') : '';
    box.append(h('div', { class: 'cgrid' },
      mk('selic', 'Selic (% a.a.)', { hint: cfg.revisadoEm ? `Padrão revisado em ${fmtBR(cfg.revisadoEm)}` : '' }),
      mk('cdi', 'CDI (% a.a.)', { hint: 'Costuma ficar ~0,10 abaixo da Selic' }),
      mk('ipca', 'IPCA esperado (% a.a.)', { hint: fIpca ? `Focus: ${fIpca}` : '' }),
      mk('valor', 'Valor aplicado (R$)'),
      mk('meses', 'Prazo (meses)')));
    box.append(h('div', { class: 'cgrid' },
      mkSel('indexador', 'Indexador', INDEXADORES.map(([v, l]) => [v, l])),
      mk('taxa', 'Taxa', { dyn: true }),
      mkSel('tributacao', 'Imposto de renda', [['regressivo', 'IR regressivo (tributado)'], ['isento', 'Isento (LCI, LCA, CRI, CRA, debênture incentivada)']]),
      mk('outrasTaxas', 'Outras taxas (% a.a.)', { hint: 'Ex.: administração de fundo' }),
      (() => {
        const cb = h('input', { type: 'checkbox' });
        cb.checked = !!st.custodiaB3;
        cb.addEventListener('change', () => { st.custodiaB3 = cb.checked; update(); });
        inputs.custodiaB3 = cb;
        return h('label', { class: 'field cf chk' }, h('span', { text: 'Custódia B3 (Tesouro)' }), h('div', { class: 'chkrow' }, cb, h('small', { class: 'hint', text: '0,20% a.a.; Tesouro Selic isento até R$ 10 mil' })));
      })()));

    // resultados no formato do exemplo
    const out = {};
    const stat = (id, label, cls) => { out[id] = h('b', { class: 'sv', text: '–' }); return h('div', { class: `stat ${cls || ''}` }, h('span', { class: 'sl', text: label }), out[id]); };
    box.append(h('div', { class: 'strip' },
      stat('liqAA', 'Juro real líquido (a.a.)', 'accent'),
      stat('rendLiq', 'Rendimento líquido'),
      stat('final', 'Valor final líquido'),
      stat('ganhoReal', 'Ganho real (em R$ de hoje)')));
    out.detail = h('div', { class: 'detail' });
    out.frase = h('p', { class: 'frase' });
    out.equiv = h('p', { class: 'equiv' });
    const copyBtn = h('button', { class: 'btn', type: 'button' }, 'Copiar resumo');
    out.copy = copyBtn;
    box.append(out.detail, out.frase, out.equiv, h('div', { class: 'addrow' }, copyBtn));

    let last = null;
    copyBtn.addEventListener('click', () => { if (last) copyText(last.resumo, copyBtn); });

    function syncIdx() {
      const idx = INDEXADORES.find((x) => x[0] === st.indexador);
      box.querySelector('.dyn').textContent = idx[2];
      inputs.taxa.disabled = st.indexador === 'poupanca';
      if (st.indexador === 'poupanca') inputs.tributacao.value = 'isento';
      inputs.tributacao.disabled = st.indexador === 'poupanca';
    }

    function applyPreset(pr) {
      st.indexador = pr.indexador; st.tributacao = pr.tributacao; st.taxa = String(pr.taxa).replace('.', ','); st.custodiaB3 = !!pr.custodiaB3;
      inputs.indexador.value = st.indexador; inputs.tributacao.value = st.tributacao; inputs.taxa.value = st.taxa; inputs.custodiaB3.checked = st.custodiaB3;
      st.preset = pr.id;
      syncIdx(); update();
    }

    function update() {
      const P = {
        indexador: st.indexador, tributacao: st.tributacao, custodiaB3: !!st.custodiaB3,
        taxa: st.indexador === 'poupanca' ? 0 : parseNum(st.taxa), selic: parseNum(st.selic), cdi: parseNum(st.cdi), ipca: parseNum(st.ipca),
        valor: parseNum(st.valor), meses: parseNum(st.meses), outrasTaxas: parseNum(st.outrasTaxas) || 0,
      };
      for (const [id, b] of Object.entries(chips)) b.setAttribute('aria-pressed', String(st.preset === id));
      store.set('calc', JSON.stringify({ ...st }));
      const bad = ['taxa', 'selic', 'cdi', 'ipca', 'valor', 'meses'].find((k) => !Number.isFinite(P[k]) || ((k === 'valor' || k === 'meses') && P[k] <= 0));
      if (bad) {
        last = null;
        for (const k of ['liqAA', 'rendLiq', 'final', 'ganhoReal']) out[k].textContent = '–';
        out.detail.replaceChildren(); out.equiv.textContent = '';
        out.frase.textContent = 'Preencha os campos com números (use vírgula para decimais) para ver o resultado.';
        return;
      }
      const r = C.calcular(P, state.calcCfg?.faixasIR);
      last = r;
      out.liqAA.textContent = pc(r.jurosReaisAA);
      out.rendLiq.textContent = brl0.format(r.rendLiq);
      out.final.textContent = brl0.format(r.final);
      out.ganhoReal.textContent = brl0.format(r.ganhoReal);
      const row = (k, v) => h('div', { class: 'dr' }, h('span', { text: k }), h('b', { text: v }));
      out.detail.replaceChildren(
        row('Prazo', `${num(P.meses, P.meses % 1 ? 1 : 0)} meses (${r.dias} dias)`),
        row('Rendimento bruto', brl2.format(r.rendBruto)),
        row(r.isento ? 'Imposto de renda' : `Imposto de renda (${num(r.aliq, 1)}%)`, r.isento ? 'isento' : `− ${brl2.format(r.ir)}`),
        row('Taxa bruta (a.a.)', pc(r.taxaBrutaAA)),
        row('Taxa líquida (a.a.)', pc(r.taxaLiqAA)));
      out.frase.textContent = `Com ${num(P.ipca)}% de inflação ao ano, o rendimento líquido de ${brl0.format(r.rendLiq)} tem juro real de ${pc(r.jurosReaisAA)} ao ano: dos ${brl0.format(r.rendLiq)}, ${brl0.format(r.reposicaoInflacao)} apenas repõem a inflação e ${brl0.format(r.ganhoReal)} são ganho real, em dinheiro de hoje.`;
      const e = r.equivalente;
      out.equiv.textContent = e.tipo === 'tributado'
        ? `Equivalência: este isento rende o mesmo que um papel tributado (IR de ${num(e.aliq, 1)}%) de ${num(e.pctCDI, 1)}% do CDI, ou IPCA + ${num(e.ipcaMais)}% a.a., ou prefixado de ${num(e.preAA)}% a.a.`
        : `Equivalência: este papel tributado (IR de ${num(e.aliq, 1)}%) rende o mesmo que um isento de ${num(e.pctCDI, 1)}% do CDI, ou IPCA + ${num(e.ipcaMais)}% a.a., ou prefixado de ${num(e.preAA)}% a.a.`;
      const idxLabel = INDEXADORES.find((x) => x[0] === st.indexador)[1];
      r.resumo = [`Simulação de renda fixa (estimativa)`, `Produto: ${idxLabel}${st.indexador === 'poupanca' ? '' : ` | taxa ${st.taxa}`} | ${r.isento ? 'isento de IR' : 'IR regressivo'}`, `Valor aplicado: ${brl2.format(P.valor)} por ${P.meses} meses (${r.dias} dias)`, `Premissas: Selic ${st.selic}% | CDI ${st.cdi}% | IPCA ${st.ipca}% ao ano`, `Rendimento bruto: ${brl2.format(r.rendBruto)} | IR: ${r.isento ? 'isento' : brl2.format(r.ir)}`, `Rendimento líquido: ${brl2.format(r.rendLiq)} | Valor final líquido: ${brl2.format(r.final)}`, `Juro real líquido: ${pc(r.jurosReaisAA)} a.a. | Ganho real: ${brl2.format(r.ganhoReal)} (em R$ de hoje)`, `Simulação com premissas informadas; não é recomendação de investimento. Rentabilidade passada não garante resultados futuros.`].join('\n');
    }

    syncIdx();
    update();

    // mapa de ativos
    const m = state.mapa;
    if (m?.grupos) {
      box.append(h('h3', { class: 'sh', text: 'Mapa de ativos: renda fixa' }));
      const badgeFor = (v) => {
        const low = v.toLowerCase();
        if (low.startsWith('isento')) return badge(v, 'on');
        if (low === 'com fgc') return badge(v, 'on');
        if (low === 'sem fgc') return badge(v, 'soon');
        return v;
      };
      const rows = [];
      for (const g of m.grupos) {
        rows.push(h('tr', { class: 'gh' }, h('th', { colspan: String(m.colunas.length), text: g.titulo })));
        for (const l of g.linhas) rows.push(h('tr', {}, l.map((c, i) => h('td', { class: i === 1 ? 'ativo' : '' }, i >= 3 ? badgeFor(c) : c))));
      }
      box.append(h('div', { class: 'tblw' }, h('table', { class: 'tbl mapa' }, h('thead', {}, h('tr', {}, m.colunas.map((c) => h('th', { text: c })))), h('tbody', {}, rows))));
      if (m.notas?.length) box.append(h('ul', { class: 'small quiet notas' }, m.notas.map((n) => h('li', { text: n }))));
    }
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

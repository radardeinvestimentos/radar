// Reconhecimento de ativos nas notícias (roda no navegador; a lista de ativos nunca sai do aparelho).
// Funciona no navegador (window.RadarMatch) e no Node (module.exports), para ser testado.
(function (root) {
  'use strict';

  const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  /** Ticker: PETR4 → raiz "petr" reconhece petr3, petr4... Entradas sem dígitos viram nome. */
  function compile(entry) {
    const t = norm(entry.t || '').replace(/[^a-z0-9]/g, '');
    const base = t.replace(/\d+$/, '');
    const parts = [];
    if (base && /\d+$/.test(t)) parts.push(`${esc(base)}\\d{1,2}`);
    else if (t) parts.push(esc(t));
    for (const a of entry.a || []) {
      const n = norm(a).trim();
      if (n.length >= 2) parts.push(esc(n));
    }
    if (!parts.length) return null;
    return { t: entry.t, re: new RegExp(`(?<![a-z0-9])(?:${parts.join('|')})(?![a-z0-9])`) };
  }

  function compileAll(list) {
    return (list || []).map(compile).filter(Boolean);
  }

  /** Devolve os tickers da lista citados na notícia. */
  function matchItem(item, compiled) {
    if (!compiled.length) return [];
    const text = norm(`${item.title} ${item.summary || ''} ${(item.categories || []).join(' ')}`);
    return compiled.filter((c) => c.re.test(text)).map((c) => c.t);
  }

  /** Completa um ticker digitado com nome e apelidos do dicionário (pela raiz do ticker). */
  function lookup(ticker, dict) {
    const t = norm(ticker).replace(/[^a-z0-9]/g, '');
    const base = t.replace(/\d+$/, '');
    const hit = (dict || []).find((d) => norm(d.t).replace(/\d+$/, '') === base && base);
    return hit || null;
  }

  const api = { norm, compile, compileAll, matchItem, lookup };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RadarMatch = api;
})(typeof window !== 'undefined' ? window : globalThis);

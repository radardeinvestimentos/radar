// Parser RSS/Atom e extrator de links HTML, sem dependências.
// Tolerante a feeds truncados/mal formados: lê item por item.

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decode(s = '') {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try { return String.fromCodePoint(code); } catch { return m; }
    }
    return ENT[e.toLowerCase()] ?? m;
  });
}

const unCdata = (s) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');

/** Remove HTML, decodifica entidades e normaliza espaços. */
export function clean(raw) {
  let t = decode(unCdata(raw || ''));
  t = t.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ');
  return decode(t).replace(/\s+/g, ' ').trim();
}

export function truncate(s, n = 300) {
  if (s.length <= n) return s;
  const cut = s.slice(0, n);
  return cut.slice(0, Math.max(cut.lastIndexOf(' '), n - 40)).replace(/[\s.,;:–-]+$/, '') + '…';
}

function esc(name) { return name.replace(/[:.]/g, '\\$&'); }

function tagText(block, name) {
  const m = block.match(new RegExp(`<${esc(name)}(?:\\s[^>]*)?>([\\s\\S]*?)</${esc(name)}>`, 'i'));
  return m ? m[1] : '';
}

function allTags(block, name) {
  const out = [];
  const re = new RegExp(`<${esc(name)}(?:\\s[^>]*)?>([\\s\\S]*?)</${esc(name)}>`, 'gi');
  for (const m of block.matchAll(re)) out.push(m[1]);
  return out;
}

export function safeUrl(u) {
  try {
    const url = new URL(u.trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch { return null; }
}

function parseDate(raw, assumeTz = 'Z') {
  if (!raw) return null;
  let s = clean(raw);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s)) s += assumeTz;
  else if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(s)) s = s.replace(' ', 'T') + assumeTz;
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

function linkOf(block) {
  // Atom: <link rel="alternate" href="..."/>
  const atom = [...block.matchAll(/<link\b([^>]*?)\/?>/gi)]
    .map((m) => m[1])
    .filter((a) => /href=/i.test(a));
  if (atom.length) {
    const alt = atom.find((a) => /rel=["']alternate["']/i.test(a)) || atom.find((a) => !/rel=/i.test(a)) || atom[0];
    const href = alt.match(/href=["']([^"']+)["']/i);
    if (href) return decode(href[1]);
  }
  const text = clean(tagText(block, 'link'));
  if (text) return text;
  const guid = clean(tagText(block, 'guid'));
  return /^https?:\/\//.test(guid) ? guid : '';
}

/**
 * @param {string} xml
 * @param {{assumeTz?: string, gnews?: boolean}} opts
 */
export function parseFeed(xml, opts = {}) {
  const blocks = [
    ...xml.matchAll(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi),
    ...xml.matchAll(/<entry(?:\s[^>]*)?>[\s\S]*?<\/entry>/gi),
  ].map((m) => m[0]);

  const items = [];
  for (const b of blocks) {
    let title = clean(tagText(b, 'title'));
    const url = safeUrl(linkOf(b) || '');
    if (!title || !url) continue;

    let summary = clean(
      tagText(b, 'description') || tagText(b, 'summary') || tagText(b, 'content:encoded') || tagText(b, 'content'),
    );
    if (opts.gnews) {
      // Google News: título vem como "Manchete - Veículo" e a descrição repete a manchete.
      title = title.replace(/\s+-\s+[^-]{2,60}$/, '');
      summary = '';
    } else if (summary.startsWith(title)) {
      summary = summary.slice(title.length).replace(/^[\s:–-]+/, '');
    }

    const categories = [...allTags(b, 'category')]
      .map(clean)
      .concat([...b.matchAll(/<category\b[^>]*\bterm=["']([^"']+)["']/gi)].map((m) => decode(m[1])))
      .filter(Boolean)
      .slice(0, 12);

    const publishedAt =
      parseDate(tagText(b, 'pubDate') || tagText(b, 'dc:date') || tagText(b, 'published') || tagText(b, 'updated'), opts.assumeTz);

    items.push({ title, url, summary: truncate(summary, 300), categories, publishedAt });
  }
  return items;
}

/** Fallback: extrai manchetes de uma página HTML (links <a>). Sem data de publicação. */
export function parseHtmlLinks(html, { url: base, hrefPattern, minDepth = 2, minTitle = 28 }) {
  const pat = hrefPattern ? new RegExp(hrefPattern) : null;
  const seen = new Set();
  const items = [];
  for (const m of html.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    let abs;
    try { abs = new URL(decode(m[1]), base).toString(); } catch { continue; }
    const u = safeUrl(abs);
    if (!u || seen.has(u)) continue;
    if (pat && !pat.test(u)) continue;
    const depth = new URL(u).pathname.split('/').filter(Boolean).length;
    if (depth < minDepth) continue;
    const title = clean(m[2]);
    if (title.length < minTitle) continue;
    seen.add(u);
    items.push({ title, url: u, summary: '', categories: [], publishedAt: null });
  }
  return items.slice(0, 40);
}

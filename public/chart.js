// Gráfico de linhas em SVG para a calculadora (window.RadarChart). Sem bibliotecas; textos sempre via textContent.
(function (root) {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const svgEl = (tag, attrs, text) => {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs || {})) if (v != null) e.setAttribute(k, v);
    if (text != null) e.textContent = text;
    return e;
  };
  const htmlEl = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  /** Escala "bonita": devolve {min,max,ticks} com ~n marcas em valores redondos. */
  function nice(lo, hi, n) {
    if (!(hi > lo)) { hi = lo + 1; }
    const raw = (hi - lo) / Math.max(1, n);
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const f = raw / mag;
    const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag;
    const min = Math.floor(lo / step) * step, max = Math.ceil(hi / step) * step;
    const ticks = [];
    for (let v = min; v <= max + step / 2; v += step) ticks.push(Math.round(v / step) * step);
    return { min, max, ticks };
  }

  /** Marcas do eixo X em meses: de 1 em 1 até 12 meses, de 3 em 3 até 36, depois anuais. */
  function xTicks(totalDias, compacto) {
    const meses = (totalDias * 12) / 365;
    const passo = compacto
      ? (meses <= 6 ? 1 : meses <= 12 ? 3 : meses <= 36 ? 6 : meses <= 120 ? 12 : 24)
      : (meses <= 12 ? (meses <= 6 ? 1 : 2) : meses <= 36 ? 3 : meses <= 120 ? 12 : 24);
    const out = [];
    for (let m = 0; m * 365 / 12 <= totalDias + 0.5; m += passo) out.push(m);
    return out;
  }
  const rotuloX = (m) => (m === 0 ? '0' : m % 12 === 0 && m >= 12 ? `${m / 12} ${m === 12 ? 'ano' : 'anos'}` : `${m} m`);

  /**
   * @param {object} o
   *  series: [{id, nome, cor (css), pontos: [{dias, y, yBruto?}]}]   // mesma lista de dias em todas
   *  ref: {nome, pontos:[{dias,y}]} | null                            // linha de referência (inflação)
   *  fmtY(n): rótulo curto do eixo; fmtTip(n): valor no tooltip; mostrarBruto: boolean; titulo (aria)
   * @returns {HTMLElement}
   */
  function render(o) {
    const c = !!o.compacto;
    const W = c ? 420 : 760, H = c ? 330 : 340, L = c ? 50 : 62, R = c ? 54 : 96, T = 14, B = 34;
    const wrap = htmlEl('div', 'chart');
    const todas = o.series.flatMap((s) => s.pontos.map((p) => p.y).concat(o.mostrarBruto ? s.pontos.map((p) => p.yBruto).filter((v) => v != null) : []));
    if (o.ref) for (const p of o.ref.pontos) todas.push(p.y);
    const dias = o.series[0].pontos.map((p) => p.dias);
    const total = dias[dias.length - 1] || 1;
    const ys = nice(Math.min(...todas), Math.max(...todas), 5);
    const X = (d) => L + (d / total) * (W - L - R);
    const Y = (v) => T + (1 - (v - ys.min) / (ys.max - ys.min)) * (H - T - B);

    const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart-svg', role: 'img', tabindex: '0', 'aria-label': o.titulo || 'Gráfico de evolução do investimento' });
    // grade e eixos (recessivos)
    for (const t of ys.ticks) {
      svg.append(svgEl('line', { x1: L, x2: W - R, y1: Y(t), y2: Y(t), class: 'gridl' }));
      svg.append(svgEl('text', { x: L - 8, y: Y(t) + 4, class: 'axl', 'text-anchor': 'end' }, o.fmtY(t)));
    }
    for (const m of xTicks(total, c)) {
      const d = (m * 365) / 12;
      svg.append(svgEl('line', { x1: X(d), x2: X(d), y1: H - B, y2: H - B + 4, class: 'axt' }));
      svg.append(svgEl('text', { x: X(d), y: H - B + 17, class: 'axl', 'text-anchor': 'middle' }, rotuloX(m)));
    }
    svg.append(svgEl('line', { x1: L, x2: W - R, y1: H - B, y2: H - B, class: 'axb' }));

    const path = (pts, key) => pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.dias).toFixed(1)},${Y(p[key]).toFixed(1)}`).join('');
    if (o.ref) {
      svg.append(svgEl('path', { d: path(o.ref.pontos, 'y'), class: 'ln ref' }));
    }
    for (const s of o.series) {
      if (o.mostrarBruto) svg.append(svgEl('path', { d: path(s.pontos.filter((p) => p.yBruto != null).map((p) => ({ dias: p.dias, y: p.yBruto })), 'y'), class: 'ln bruto', stroke: s.cor }));
    }
    for (const s of o.series) svg.append(svgEl('path', { d: path(s.pontos, 'y'), class: 'ln', stroke: s.cor }));

    // rótulos diretos no fim das linhas (evita colisão empurrando para baixo)
    const fins = o.series.map((s) => ({ s, y: Y(s.pontos[s.pontos.length - 1].y) }));
    if (o.ref) fins.push({ s: { id: 'ref', nome: o.ref.nome, cor: null }, y: Y(o.ref.pontos[o.ref.pontos.length - 1].y) });
    fins.sort((a, b) => a.y - b.y);
    for (let i = 1; i < fins.length; i++) if (fins[i].y - fins[i - 1].y < 15) fins[i].y = fins[i - 1].y + 15;
    for (const f of fins) {
      const x = W - R + 8;
      if (f.s.cor) svg.append(svgEl('circle', { cx: x + 4, cy: f.y, r: 4, fill: f.s.cor, class: 'enddot' }));
      else svg.append(svgEl('line', { x1: x, x2: x + 8, y1: f.y, y2: f.y, class: 'ln ref' }));
      svg.append(svgEl('text', { x: x + 14, y: f.y + 4, class: 'endl' }, f.s.id === 'ref' ? 'IPCA' : f.s.id));
    }

    // hover: guia vertical + tooltip único com todas as séries
    const guia = svgEl('line', { y1: T, y2: H - B, class: 'guia', visibility: 'hidden' });
    const dots = o.series.map((s) => svgEl('circle', { r: 4.5, fill: s.cor, class: 'hdot', visibility: 'hidden' }));
    svg.append(guia, ...dots);
    const tip = htmlEl('div', 'chart-tip');
    tip.hidden = true;
    const hit = svgEl('rect', { x: L, y: T, width: W - L - R, height: H - T - B, fill: 'transparent', class: 'hit' });
    svg.append(hit);
    let idx = dias.length - 1;

    function mostrar(i, clientX) {
      idx = Math.max(0, Math.min(dias.length - 1, i));
      const d = dias[idx];
      guia.setAttribute('x1', X(d)); guia.setAttribute('x2', X(d)); guia.setAttribute('visibility', 'visible');
      o.series.forEach((s, k) => { dots[k].setAttribute('cx', X(d)); dots[k].setAttribute('cy', Y(s.pontos[idx].y)); dots[k].setAttribute('visibility', 'visible'); });
      tip.replaceChildren();
      const m = (d * 12) / 365;
      tip.append(htmlEl('div', 'tt', d === 0 ? 'Início' : `${d} dias (${m < 10 ? m.toFixed(1).replace('.', ',') : Math.round(m)} meses)`));
      for (const s of o.series) {
        const row = htmlEl('div', 'tr');
        const key = htmlEl('i', 'tk'); key.style.background = s.cor;
        row.append(key, htmlEl('b', null, o.fmtTip(s.pontos[idx].y)), htmlEl('span', null, s.nome));
        tip.append(row);
        if (o.mostrarBruto && s.pontos[idx].yBruto != null) tip.append(htmlEl('div', 'tr sub', `antes de IR e IOF: ${o.fmtTip(s.pontos[idx].yBruto)}`));
      }
      if (o.ref) {
        const row = htmlEl('div', 'tr');
        const key = htmlEl('i', 'tk ref');
        row.append(key, htmlEl('b', null, o.fmtTip(o.ref.pontos[idx].y)), htmlEl('span', null, o.ref.nome));
        tip.append(row);
      }
      tip.hidden = false;
      const box = wrap.getBoundingClientRect();
      const px = (X(d) / W) * box.width;
      if (c) { tip.style.left = 'auto'; tip.style.right = 'auto'; return; }
      const lado = px > box.width * 0.6;
      tip.style.left = lado ? 'auto' : `${px + 12}px`;
      tip.style.right = lado ? `${box.width - px + 12}px` : 'auto';
    }
    const idxFromX = (clientX) => {
      const r = svg.getBoundingClientRect();
      const d = ((clientX - r.left) / r.width * W - L) / (W - L - R) * total;
      let best = 0;
      for (let i = 1; i < dias.length; i++) if (Math.abs(dias[i] - d) < Math.abs(dias[best] - d)) best = i;
      return best;
    };
    const esconder = () => { tip.hidden = true; guia.setAttribute('visibility', 'hidden'); dots.forEach((c) => c.setAttribute('visibility', 'hidden')); };
    hit.addEventListener('pointermove', (e) => mostrar(idxFromX(e.clientX), e.clientX));
    hit.addEventListener('pointerleave', esconder);
    svg.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); mostrar(tip.hidden ? 0 : idx + 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); mostrar(tip.hidden ? dias.length - 1 : idx - 1); }
      else if (e.key === 'Escape') esconder();
    });
    svg.addEventListener('blur', esconder);

    wrap.append(svg, tip);
    return wrap;
  }

  root.RadarChart = { render, nice, xTicks };
  if (typeof module !== 'undefined' && module.exports) module.exports = { nice, xTicks };
})(typeof window !== 'undefined' ? window : globalThis);

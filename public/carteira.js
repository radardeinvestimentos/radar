// Lógica da carteira (visão 360°) da calculadora: modalidades, concentração, alertas e série agregada. Sem DOM.
(function (root) {
  'use strict';
  const MODALIDADES = ['pos', 'infl', 'pre', 'rfint', 'rvbr', 'rvint', 'multi', 'listados', 'alt'];
  const DOS_INDEXADORES = { cdi_pct: 'pos', cdi_mais: 'pos', selic_mais: 'pos', poupanca: 'pos', ipca_mais: 'infl', pre: 'pre' };
  const modalidadeDe = (indexador) => DOS_INDEXADORES[indexador] || 'pos';
  const r1 = (n) => Math.round(n * 10) / 10;
  const f1 = (n) => r1(n).toFixed(1).replace('.', ',');

  /**
   * posicoes: [{nome, modalidade, valor, caixa}]; metas: {id: pct}; caixaMinimo: pct; tolerancia: p.p.
   * Concentração medida sobre o valor aplicado hoje. Sem meta definida (soma 0), não há alertas.
   */
  function consolidar({ posicoes, metas, caixaMinimo, tolerancia, nomes }) {
    const por = {}; for (const m of MODALIDADES) por[m] = 0;
    let total = 0, caixa = 0;
    for (const p of posicoes) {
      if (!(p.valor > 0) || !(p.modalidade in por)) continue;
      por[p.modalidade] += p.valor; total += p.valor;
      if (p.caixa && p.modalidade === 'pos') caixa += p.valor;
    }
    const pct = {}; for (const m of MODALIDADES) pct[m] = total > 0 ? (por[m] / total) * 100 : 0;
    const caixaPct = total > 0 ? (caixa / total) * 100 : 0;
    const somaMetas = MODALIDADES.reduce((a, m) => a + (Number(metas?.[m]) || 0), 0);
    const tol = Number.isFinite(tolerancia) && tolerancia >= 0 ? tolerancia : 5;
    const alertas = [];
    if (total > 0 && somaMetas > 0) {
      for (const m of MODALIDADES) {
        const meta = Number(metas[m]) || 0, d = pct[m] - meta;
        if (Math.abs(d) > tol + 1e-9) alertas.push({ tipo: 'modalidade', id: m, texto: `${nomes?.[m] || m}: ${f1(pct[m])}% da carteira, ${f1(Math.abs(d))} p.p. ${d > 0 ? 'acima' : 'abaixo'} do modelo (${f1(meta)}%; tolerância de ${f1(tol)} p.p.).` });
      }
      if (Number(caixaMinimo) > 0 && caixaPct < Number(caixaMinimo) - 1e-9) alertas.push({ tipo: 'caixa', id: 'caixa', texto: `Caixa: ${f1(caixaPct)}% da carteira, abaixo do mínimo de ${f1(Number(caixaMinimo))}% do modelo.` });
    }
    return { total, por, pct, caixa, caixaPct, somaMetas, alertas };
  }

  /** Valor líquido da posição em d dias: interpola a série; depois do vencimento, fica parado (sem reinvestir). */
  function valorEm(pts, d, chave) {
    const k = chave || 'liquido';
    const last = pts[pts.length - 1];
    if (d >= last.dias) return last[k];
    let i = 1; while (i < pts.length && pts[i].dias < d) i++;
    const a = pts[i - 1], b = pts[i];
    return b.dias === a.dias ? b[k] : a[k] + ((b[k] - a[k]) * (d - a.dias)) / (b.dias - a.dias);
  }
  /** Reamostra séries de vários investimentos numa grade comum de dias e soma (valor parado após o vencimento). */
  function somarSeries(lista, ipca, grade) {
    const valor = lista.reduce((a, x) => a + x.valor, 0);
    const set = new Set(grade || [0]);
    if (!grade) for (const x of lista) for (const p of x.pts) set.add(p.dias);
    const dias = [...set].sort((a, b) => a - b);
    return dias.map((d) => {
      let liq = 0, bru = 0;
      for (const x of lista) { liq += valorEm(x.pts, d, 'liquido'); bru += valorEm(x.pts, d, 'bruto'); }
      return { dias: d, meses: (d * 12) / 365, liquido: liq, bruto: bru, rentLiqPct: (liq / valor - 1) * 100, rentBrutaPct: (bru / valor - 1) * 100, inflacao: valor * Math.pow(1 + ipca / 100, d / 365) };
    });
  }
  /** series: [{valor, grupo, pts:[{dias,liquido}]}] -> {dias, grupos:{g:[...]}, total, infl} */
  function agregar(series, ipca) {
    const H = Math.max(...series.map((s) => s.pts[s.pts.length - 1].dias));
    const set = new Set([0, H]);
    for (const s of series) for (const p of s.pts) if (p.dias <= H) set.add(p.dias);
    const dias = [...set].sort((a, b) => a - b);
    const grupos = {};
    for (const s of series) grupos[s.grupo] = grupos[s.grupo] || dias.map(() => 0);
    const total = dias.map(() => 0), infl = dias.map(() => 0);
    const aplicado = series.reduce((a, s) => a + s.valor, 0);
    dias.forEach((d, k) => {
      for (const s of series) { const v = valorEm(s.pts, d); grupos[s.grupo][k] += v; total[k] += v; }
      infl[k] = aplicado * Math.pow(1 + ipca / 100, d / 365);
    });
    return { dias, grupos, total, infl, H };
  }

  const api = { MODALIDADES, modalidadeDe, consolidar, agregar, valorEm, somarSeries };
  root.RadarCarteira = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

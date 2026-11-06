// Motor da calculadora de renda fixa. Roda no navegador (window.RadarCalc) e no Node (testes).
// Reconstruído em 19/10/2026 a partir de test/calc.test.js e do uso em app.js (o arquivo original foi sobrescrito).
// Simplificações: meses × 365/12 = dias; %CDI aplicado sobre a taxa anual do CDI; sem come-cotas, carência ou marcação a mercado.
// IOF (23/10/2026): regressivo nos primeiros 30 dias, só sobre o rendimento de papéis tributados; o IR incide sobre o rendimento já descontado do IOF.
(function (root) {
  'use strict';

  const FAIXAS = [
    { ateDias: 180, aliquota: 22.5 },
    { ateDias: 360, aliquota: 20 },
    { ateDias: 720, aliquota: 17.5 },
    { ateDias: null, aliquota: 15 },
  ];
  const INDEXADORES = ['cdi_pct', 'cdi_mais', 'selic_mais', 'pre', 'ipca_mais', 'poupanca'];
  // IOF: % do rendimento cobrado no resgate, do dia 1 ao dia 29 (zero a partir do 30º dia).
  const IOF = [96, 93, 90, 86, 83, 80, 76, 73, 70, 66, 63, 60, 56, 53, 50, 46, 43, 40, 36, 33, 30, 26, 23, 20, 16, 13, 10, 6, 3];
  const iofAliquota = (dias) => (dias >= 1 && dias <= 29 ? IOF[dias - 1] : 0);
  const CUSTODIA_B3 = 0.2; // % a.a. (Tesouro Direto)
  const ISENTO_SELIC_ATE = 10000; // Tesouro Selic: isento de custódia até este valor

  /** Alíquota (em %) da tabela regressiva para um prazo em dias. */
  function aliquotaIR(dias, faixas) {
    const t = faixas?.length ? faixas : FAIXAS;
    for (const f of t) if (f.ateDias == null || dias <= f.ateDias) return f.aliquota ?? f.aliq;
    const u = t[t.length - 1];
    return u.aliquota ?? u.aliq;
  }

  const PRESETS = [
    { id: 'tesouro-selic', nome: 'Tesouro Selic', indexador: 'selic_mais', tributacao: 'regressivo', taxa: 0.1, custodiaB3: true },
    { id: 'cdb-pos', nome: 'CDB 110% do CDI', indexador: 'cdi_pct', tributacao: 'regressivo', taxa: 110 },
    { id: 'pre', nome: 'Prefixado', indexador: 'pre', tributacao: 'regressivo', taxa: 13.5 },
    { id: 'ipca-mais', nome: 'Tesouro IPCA+', indexador: 'ipca_mais', tributacao: 'regressivo', taxa: 7.5, custodiaB3: true },
    { id: 'lci-lca', nome: 'LCI/LCA 90% do CDI', indexador: 'cdi_pct', tributacao: 'isento', taxa: 90 },
    { id: 'incentivada', nome: 'Debênture incentivada IPCA+', indexador: 'ipca_mais', tributacao: 'isento', taxa: 7 },
    { id: 'poupanca', nome: 'Poupança', indexador: 'poupanca', tributacao: 'isento', taxa: 0 },
  ];

  /** Taxa anual bruta, em fração, antes de custos e IR. */
  function taxaBase(P) {
    const t = (P.taxa || 0) / 100;
    switch (P.indexador) {
      case 'cdi_pct': return (P.cdi / 100) * t;
      case 'cdi_mais': return (1 + P.cdi / 100) * (1 + t) - 1;
      case 'selic_mais': return (1 + P.selic / 100) * (1 + t) - 1;
      case 'pre': return t;
      case 'ipca_mais': return (1 + P.ipca / 100) * (1 + t) - 1;
      case 'poupanca': return Math.pow(1.005, 12) - 1;
      default: throw new Error(`indexador desconhecido: ${P.indexador}`);
    }
  }

  /**
   * @param {object} P {indexador, taxa, tributacao:'regressivo'|'isento', selic, cdi, ipca (em %), valor, meses, custodiaB3, outrasTaxas (% a.a.)}
   * @param {Array} faixasIR opcional: [{ateDias, aliquota}]
   */
  function calcular(P, faixasIR) {
    const anos = P.meses / 12;
    const dias = Math.round((P.meses * 365) / 12);
    const isento = P.tributacao === 'isento' || P.indexador === 'poupanca';
    const g0 = taxaBase(P);

    // custos (custódia do Tesouro e outras taxas) reduzem a taxa de forma proporcional
    let custo = P.outrasTaxas || 0;
    if (P.custodiaB3) {
      const parte = P.indexador === 'selic_mais' ? Math.max(0, P.valor - ISENTO_SELIC_ATE) / P.valor : 1;
      custo += CUSTODIA_B3 * parte;
    }
    const g = (1 + g0) * (1 - custo / 100) - 1; // taxa bruta efetiva, antes do IR

    const bruto = P.valor * Math.pow(1 + g, anos);
    const rendBruto = bruto - P.valor;
    const aliq = isento ? 0 : aliquotaIR(dias, faixasIR);
    const iof = !isento && rendBruto > 0 ? (rendBruto * iofAliquota(dias)) / 100 : 0;
    const baseIR = rendBruto - iof;
    const ir = baseIR > 0 ? (baseIR * aliq) / 100 : 0;
    const rendLiq = rendBruto - iof - ir;
    const final = P.valor + rendLiq;
    const taxaLiqAA = Math.pow(final / P.valor, 1 / anos) - 1;
    const jurosReaisAA = (1 + taxaLiqAA) / (1 + P.ipca / 100) - 1;
    const ganhoReal = final / Math.pow(1 + P.ipca / 100, anos) - P.valor; // em reais de hoje

    // equivalência: isento ↔ tributado (alíquota do prazo) que entregam o mesmo valor líquido
    const aliqRef = isento ? aliquotaIR(dias, faixasIR) : aliq;
    const alvoAA = isento ? Math.pow(1 + rendLiq / (1 - aliqRef / 100) / P.valor, 1 / anos) - 1 : taxaLiqAA;
    const refCdi = P.cdi / 100;
    const equivalente = {
      tipo: isento ? 'tributado' : 'isento',
      aliq: aliqRef,
      pctCDI: (alvoAA / refCdi) * 100,
      ipcaMais: ((1 + alvoAA) / (1 + P.ipca / 100) - 1) * 100,
      preAA: alvoAA * 100,
    };

    return {
      dias, isento, aliq, ir, iof, rendBruto, rendLiq, final,
      taxaBrutaAA: g * 100, taxaLiqAA: taxaLiqAA * 100,
      jurosReaisAA: jurosReaisAA * 100,
      ganhoReal, reposicaoInflacao: rendLiq - ganhoReal,
      equivalente,
    };
  }

  /**
   * Evolução do valor ao longo do prazo, como se o investidor resgatasse em cada data (IR e IOF do dia).
   * Inclui pontos extras nas viradas de alíquota (dias 29/30, 180/181, 360/361, 720/721) para o gráfico mostrar o degrau.
   * @returns {Array<{dias, meses, liquido, bruto, rentLiqPct, rentBrutaPct, inflacao}>}
   */
  function serie(P, faixasIR, opts) {
    const total = Math.round((P.meses * 365) / 12);
    const alvo = (opts && opts.pontos) || 60;
    const passo = Math.max(1, Math.round(total / alvo));
    const set = new Set([0, total]);
    for (let d = passo; d < total; d += passo) set.add(d);
    for (const k of [29, 30, 180, 181, 360, 361, 720, 721]) if (k < total) set.add(k);
    const out = [];
    for (const d of [...set].sort((a, b) => a - b)) {
      const meses = (d * 12) / 365;
      const infl = P.valor * Math.pow(1 + P.ipca / 100, d / 365);
      if (d === 0) { out.push({ dias: 0, meses: 0, liquido: P.valor, bruto: P.valor, rentLiqPct: 0, rentBrutaPct: 0, inflacao: P.valor }); continue; }
      const r = calcular({ ...P, meses }, faixasIR);
      out.push({ dias: d, meses, liquido: r.final, bruto: P.valor + r.rendBruto, rentLiqPct: (r.final / P.valor - 1) * 100, rentBrutaPct: (r.rendBruto / P.valor) * 100, inflacao: infl });
    }
    return out;
  }

  const api = { FAIXAS, INDEXADORES, PRESETS, IOF, iofAliquota, aliquotaIR, calcular, serie };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RadarCalc = api;
})(typeof window !== 'undefined' ? window : globalThis);

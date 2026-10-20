// Motor da calculadora de renda fixa. Roda no navegador (window.RadarCalc) e no Node (testes).
// Reconstruído em 19/10/2026 a partir de test/calc.test.js e do uso em app.js (o arquivo original foi sobrescrito).
// Simplificações: meses × 365/12 = dias; %CDI aplicado sobre a taxa anual do CDI; sem IOF, come-cotas, carência ou marcação a mercado.
(function (root) {
  'use strict';

  const FAIXAS = [
    { ateDias: 180, aliquota: 22.5 },
    { ateDias: 360, aliquota: 20 },
    { ateDias: 720, aliquota: 17.5 },
    { ateDias: null, aliquota: 15 },
  ];
  const INDEXADORES = ['cdi_pct', 'cdi_mais', 'selic_mais', 'pre', 'ipca_mais', 'poupanca'];
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
    const ir = rendBruto > 0 ? (rendBruto * aliq) / 100 : 0;
    const rendLiq = rendBruto - ir;
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
      dias, isento, aliq, ir, rendBruto, rendLiq, final,
      taxaBrutaAA: g * 100, taxaLiqAA: taxaLiqAA * 100,
      jurosReaisAA: jurosReaisAA * 100,
      ganhoReal, reposicaoInflacao: rendLiq - ganhoReal,
      equivalente,
    };
  }

  const api = { FAIXAS, INDEXADORES, PRESETS, aliquotaIR, calcular };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RadarCalc = api;
})(typeof window !== 'undefined' ? window : globalThis);

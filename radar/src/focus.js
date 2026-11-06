// Boletim Focus (expectativas de mercado) pela API aberta do Banco Central (OData, sem chave).
// Em caso de falha devolve ok:false e o site mostra "indisponível": nunca derruba a coleta.

const BASE = process.env.FOCUS_BASE || 'https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata/';

export const INDICADORES = [
  { key: 'IPCA', nome: 'IPCA', unidade: '%' },
  { key: 'PIB Total', nome: 'PIB', unidade: '%' },
  { key: 'Selic', nome: 'Selic (fim do ano)', unidade: '% a.a.' },
  { key: 'Câmbio', nome: 'Câmbio (fim do ano)', unidade: 'R$/US$' },
];

const DAY = 86400e3;
const arred = (n) => Math.round(n * 100) / 100;

/**
 * Resume as linhas de um indicador (mais recentes primeiro ou em qualquer ordem).
 * "anterior" é a primeira linha com pelo menos 7 dias de diferença da mais recente.
 */
export function summarizeRows(rows) {
  let r = (rows || []).filter((x) => Number.isFinite(Number(x.Mediana)) && x.Data);
  if (r.some((x) => x.baseCalculo === 0)) r = r.filter((x) => x.baseCalculo === 0);
  const byDate = new Map();
  for (const x of r) if (!byDate.has(x.Data)) byDate.set(x.Data, x);
  const dates = [...byDate.keys()].sort().reverse();
  if (!dates.length) return null;
  const atual = byDate.get(dates[0]);
  const alvo = Date.parse(dates[0]) - 7 * DAY;
  const dPrev = dates.find((d) => Date.parse(d) <= alvo);
  const ant = dPrev ? byDate.get(dPrev) : null;
  const med = Number(atual.Mediana);
  return {
    data: dates[0],
    mediana: med,
    media: atual.Media == null ? null : Number(atual.Media),
    minimo: atual.Minimo == null ? null : Number(atual.Minimo),
    maximo: atual.Maximo == null ? null : Number(atual.Maximo),
    respondentes: atual.numeroRespondentes ?? null,
    anterior: ant ? { data: dPrev, mediana: Number(ant.Mediana) } : null,
    variacao: ant ? arred(med - Number(ant.Mediana)) : null,
  };
}

export function focusUrl(indicador, ano) {
  const filter = `Indicador eq '${indicador}' and DataReferencia eq '${ano}'`;
  const q = ['$format=json', '$top=100', `$orderby=${encodeURIComponent('Data desc')}`, `$filter=${encodeURIComponent(filter)}`];
  return `${BASE}ExpectativasMercadoAnuais?${q.join('&')}`;
}

async function defaultFetchJson(url) {
  const r = await fetch(url, { headers: { accept: 'application/json', 'user-agent': 'RadarDoAssessor/1.0' }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

export async function fetchFocus({ now = new Date(), fetchJson = defaultFetchJson } = {}) {
  const ano = Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric' }).format(now));
  const linhas = [];
  const erros = [];
  const consultas = INDICADORES.flatMap((ind) => [ano, ano + 1].map((y) => ({ ind, y })));
  await Promise.all(consultas.map(async ({ ind, y }) => {
    try {
      const json = await fetchJson(focusUrl(ind.key, y));
      const s = summarizeRows(json?.value);
      if (s) linhas.push({ indicador: ind.key, nome: ind.nome, unidade: ind.unidade, ano: y, ...s });
      else erros.push(`${ind.key} ${y}: sem dados`);
    } catch (e) {
      erros.push(`${ind.key} ${y}: ${e.message}`);
    }
  }));
  const ordem = new Map(INDICADORES.map((i, n) => [i.key, n]));
  linhas.sort((a, b) => ordem.get(a.indicador) - ordem.get(b.indicador) || a.ano - b.ano);
  const geradoEm = now.toISOString();
  if (!linhas.length) return { ok: false, geradoEm, erro: erros[0] || 'sem dados', erros: erros.slice(0, 6), linhas: [] };
  return {
    ok: true,
    geradoEm,
    dataBase: linhas.map((l) => l.data).sort().pop(),
    fonte: 'Banco Central do Brasil, Expectativas de Mercado (mediana)',
    parcial: erros.length ? `${erros.length} de ${consultas.length} consultas falharam` : null,
    linhas,
    erros: erros.slice(0, 6),
  };
}

// Classificação por tópicos (palavras-chave PT/EN). Texto é normalizado: minúsculo, sem acentos.

export const norm = (s = '') => s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');

const re = (list) => new RegExp(`(?<![a-z0-9])(?:${list.join('|')})(?![a-z0-9])`, 'g');

export const TOPICS = [
  {
    id: 'economia', label: 'Economia & Atividade',
    re: re(['pib', 'produto interno', 'gdp', 'inflacao', 'ipca', 'igp-?m', 'ipc-?a?', 'cpi', 'pce', 'inflation', 'desemprego', 'emprego', 'payroll', 'caged', 'pnad', 'producao industrial', 'vendas no varejo', 'varejo', 'atividade economica', 'ibc-?br', 'recessao', 'recession', 'crescimento economico', 'economic growth', 'confianca (do )?(consumidor|empresarial)', 'pmi', 'balanca comercial', 'retail sales', 'jobless', 'unemployment', 'economia (brasileira|americana|chinesa|global|mundial)', 'economy', 'fmi', 'imf', 'banco mundial', 'world bank']),
  },
  {
    id: 'monetaria', label: 'Política Monetária & Juros',
    re: re(['selic', 'copom', 'banco central', 'bcb', 'bc', 'fed', 'fomc', 'powell', 'federal reserve', 'juros', 'taxa de juros', 'bce', 'ecb', 'boe', 'boj', 'banco do japao', 'rate cuts?', 'rate hikes?', 'interest rates?', 'di futuro', 'curva de juros', 'treasury yields?', 'yields?', 'galipolo', 'politica monetaria', 'monetary policy', 'corte de juros', 'alta de juros', 'taxa basica']),
  },
  {
    id: 'fiscal', label: 'Fiscal & Tributário',
    re: re(['fiscal', 'arcabouco', 'meta fiscal', 'deficit', 'superavit', 'divida (publica|bruta|liquida)', 'gastos (publicos)?', 'orcamento', 'loa', 'ldo', 'contingenciamento', 'bloqueio de gastos', 'haddad', 'tesouro nacional', 'imposto[s]?', 'tributa\\w*', 'reforma tributaria', 'imposto de renda', 'ir', 'iof', 'isencao', 'taxacao', 'arrecadacao', 'receita federal', 'taxes', 'tax', 'budget', 'debt ceiling', 'stimulus', 'desoneracao', 'pec', 'precatorios?', 'bolsa familia']),
  },
  {
    id: 'geopolitica', label: 'Geopolítica & Comércio',
    re: re(['guerra', 'war', 'ira', 'iran', 'israel', 'gaza', 'hamas', 'ucrania', 'ukraine', 'russia', 'putin', 'china', 'chines', 'xi jinping', 'taiwan', 'tarifas?', 'tariffs?', 'trade war', 'guerra comercial', 'sancoes', 'sanctions', 'opep', 'opec', 'otan', 'nato', 'conflito', 'missil', 'oriente medio', 'middle east', 'trump', 'casa branca', 'white house', 'g20', 'brics', 'cop\\d\\d', 'venezuela', 'groenlandia', 'greenland', 'geopolitic\\w*', 'embargo', 'acordo comercial', 'trade deal', 'cessar-fogo', 'ceasefire']),
  },
  {
    id: 'politica', label: 'Política & Eleições',
    re: re(['eleicao', 'eleicoes', 'election[s]?', 'lula', 'bolsonaro', 'tarcisio', 'segundo turno', 'datafolha', 'quaest', 'genial/?quaest', 'debate', 'candidato[s]?', 'stf', 'congresso', 'senado', 'camara dos deputados', 'planalto', 'centrao', 'campanha', 'urnas?', 'governo federal', 'ministro da fazenda']),
  },
  {
    id: 'mercados', label: 'Bolsa & Ações',
    re: re(['ibovespa', 'ibov', 'bolsa', 'b3', 'acoes', 'acao', 's&p ?500?', 'nasdaq', 'dow jones', 'wall street', 'stocks?', 'equities', 'shares', 'rally', 'pregao', 'small caps', 'bitcoin', 'cripto\\w*', 'crypto', 'etfs?', 'volatilidade', 'vix', 'nikkei', 'stoxx', 'ftse', 'hang seng', 'preco-alvo', 'target price', 'recomendacao', 'bdr[s]?', 'indice[s]?', 'ibovespa fecha', 'fechamento']),
  },
  {
    id: 'cambio', label: 'Câmbio & Commodities',
    re: re(['dolar', 'cambio', 'usd', 'brl', 'euro', 'iene', 'yen', 'peso', 'petroleo', 'oil', 'brent', 'wti', 'ouro', 'gold', 'minerio', 'iron ore', 'soja', 'milho', 'cafe (arabica|conilon)', 'saca de cafe', 'preco do cafe', 'boi gordo', 'commodit\\w*', 'cobre', 'copper', 'gas natural', 'diesel', 'gasolina', 'etanol', 'crude', 'currency', 'real']),
  },
  {
    id: 'fundos', label: 'Fundos, FIIs & Renda Fixa',
    re: re(['fii[s]?', 'fundos? imobiliari\\w*', 'ifix', 'cdb', 'lci', 'lca', 'cri', 'cra', 'debentures?', 'tesouro direto', 'tesouro selic', 'ipca\\+', 'renda fixa', 'fundos? de investimento', 'fundos?', 'multimercado', 'previdencia', 'pgbl', 'vgbl', 'fiagro', 'fi-infra', 'cdi', 'poupanca', 'rendimentos?', 'cotas?', 'bonds?', 'titulos publicos', 'treasur\\w+', 'credito privado', 'ntn-?b']),
  },
  {
    id: 'empresas', label: 'Empresas & Resultados',
    re: re(['resultado[s]?', 'balanco[s]?', 'lucro', 'prejuizo', 'receita liquida', 'ebitda', 'guidance', 'dividendos?', 'jcp', 'juros sobre capital', 'recompra', 'buyback', 'fusao', 'aquisicao', 'm&a', 'ipo', 'follow-on', 'oferta (publica|restrita)', 'recuperacao judicial', 'falencia', 'earnings', 'profit', 'revenue', 'quarterly', 'trimestre', '[a-z]{4}(?:3|4|5|6|11)', 'petrobras', 'vale', 'itau', 'bradesco', 'nvidia', 'apple', 'tesla']),
  },
  {
    id: 'regulacao', label: 'Regulação & Setor Financeiro',
    re: re(['cvm', 'bacen', 'anbima', 'susep', 'previc', 'regulacao', 'regulament\\w+', 'resolucao', 'open finance', 'pix', 'drex', 'conselho monetario', 'cmn', 'fgc', 'bancos?', 'nubank', 'btg', 'xp', 'credito', 'inadimplencia', 'spread', 'fintechs?', 'consignado', 'cartao', 'assessor(es)? de investimentos?', 'assessoria', 'corretoras?', 'gestoras?', 'taxa de administracao', 'come-cotas', 'sec', 'regulator\\w*', 'compliance', 'suitability']),
  },
];

const JUNK = re(['mega-?sena', 'loteria', 'lotofacil', 'quina', 'horoscopo', 'bbb', 'futebol', 'novela', 'celebridade', 'receita de', 'papa', 'tirzepatida', 'ozempic', 'previsao do tempo', 'signo']);

function count(rx, text) {
  if (!text) return 0;
  rx.lastIndex = 0;
  let n = 0;
  while (rx.exec(text) && n < 3) n++;
  return n;
}

/** @returns {{topic: string, topics: string[], scores: Record<string, number>, relevant: boolean}} */
export function classify(item) {
  const title = norm(item.title);
  const cats = norm((item.categories || []).join(' | '));
  const summ = norm(item.summary);
  const scores = {};
  for (const t of TOPICS) {
    scores[t.id] = count(t.re, title) * 3 + count(t.re, cats) * 2 + count(t.re, summ);
  }
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [top, topScore] = ranked[0];
  const junk = count(JUNK, title) + count(JUNK, cats) > 0;
  const relevant = topScore >= 3 && (!junk || topScore >= 9);
  const topics = relevant
    ? ranked.filter(([, s], i) => i === 0 || (s >= 3 && s >= topScore * 0.6)).slice(0, 3).map(([id]) => id)
    : ['geral'];
  return { topic: relevant ? top : 'geral', topics, scores, relevant };
}

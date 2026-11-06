// Conteúdo: pauta da semana, plano editorial e rascunho de newsletter, gerados a partir das notícias de maior impacto.
// Tudo é um RASCUNHO para você editar (comigo, no chat). Não é recomendação de investimento.
import { addDays, brtDate, fmtBR, jaccard, tokens } from './text.js';

const jaccardTitles = (a, b) => jaccard(tokens(a), tokens(b));

const RETENCAO_DIAS = 8;
const MAX_SEMANA = 250;

const FORMATOS = ['Post no LinkedIn', 'Carrossel no Instagram', 'Item da newsletter'];

/** Ângulo editorial e pergunta típica de cliente para cada regra de impacto. */
export const PAUTA = {
  juros_br: { angulo: 'Selic e juros: o que muda no seu dinheiro parado e na sua renda fixa', pergunta: 'Vale trocar meu CDB por um título prefixado agora?' },
  fed: { angulo: 'Juros nos EUA e o seu dólar: por que o Fed mexe com a sua carteira', pergunta: 'Dólar sobe quando o Fed segura os juros?' },
  inflacao: { angulo: 'Inflação e o retorno de verdade: quanto seu dinheiro rende acima do IPCA', pergunta: 'Meu investimento está ganhando da inflação?' },
  atividade: { angulo: 'Economia esfriando ou esquentando: o que isso tem a ver com a bolsa e com os juros', pergunta: 'Se a economia desacelera, o que acontece com meus investimentos?' },
  fiscal: { angulo: 'Contas públicas explicadas: por que o fiscal move dólar e juros longos', pergunta: 'Por que o governo gastar mais faz o dólar subir?' },
  tributacao: { angulo: 'Mudança de imposto em investimentos: antes e depois em números', pergunta: 'Essa mudança de imposto afeta meu CDB, LCI ou fundo?' },
  cambio: { angulo: 'Dólar subiu ou caiu: o que fazer (e o que não fazer) com a parcela internacional', pergunta: 'Devo comprar dólar agora?' },
  petroleo: { angulo: 'Petróleo, Petrobras e inflação: como o preço do barril chega ao seu bolso e à sua carteira', pergunta: 'Petróleo em alta é bom para minhas ações?' },
  commodities: { angulo: 'Minério, soja e café: o que as commodities dizem sobre a bolsa brasileira', pergunta: 'Por que a Vale cai quando a China desacelera?' },
  china: { angulo: 'China e Brasil: por que o que acontece lá fora mexe com a nossa bolsa', pergunta: 'Preciso me preocupar com a China?' },
  tarifas: { angulo: 'Guerra comercial sem complicação: quem ganha, quem perde e o que isso muda para a carteira', pergunta: 'Tarifas dos EUA afetam meus investimentos?' },
  conflito: { angulo: 'Guerras e mercado: por que a volatilidade aparece e o que não vale fazer por impulso', pergunta: 'Devo sair da bolsa por causa da guerra?' },
  eleicoes: { angulo: 'Eleição e investimentos: cenários econômicos, sem política partidária', pergunta: 'Devo mudar minha carteira por causa da eleição?' },
  bolsa_br: { angulo: 'Bolsa em queda ou em alta: como manter a cabeça fria e o plano', pergunta: 'A bolsa caiu: vendo ou espero?' },
  bolsa_eua: { angulo: 'Wall Street, big techs e BDRs: o que olhar antes de investir lá fora', pergunta: 'Vale investir em ações americanas?' },
  fiis: { angulo: 'Fundos imobiliários: papel x tijolo e o que os juros fazem com os dividendos', pergunta: 'Os dividendos dos meus FIIs vão cair?' },
  renda_fixa: { angulo: 'Renda fixa em 2026: pós, pré e IPCA+, quando cada um faz sentido', pergunta: 'Qual é o melhor título de renda fixa hoje?' },
  resultados: { angulo: 'Balanço sem mistério: como ler o resultado de uma empresa em 3 números', pergunta: 'Como sei se o balanço foi bom ou ruim?' },
  proventos: { angulo: 'Dividendos e JCP: quando caem, como entram na conta e o que fazer com o dinheiro', pergunta: 'Preciso pagar imposto sobre dividendos?' },
  ofertas_ma: { angulo: 'IPO, follow-on e fusões: o que significam para quem já é acionista', pergunta: 'Vale entrar numa oferta de ações?' },
  cripto: { angulo: 'Bitcoin e cripto na carteira: tamanho certo e riscos, sem hype', pergunta: 'Quanto da carteira pode ir para cripto?' },
  regulacao: { angulo: 'Regra nova no mercado: o que muda para o investidor na prática', pergunta: 'Essa regra nova me protege ou me prejudica?' },
  credito_bancos: { angulo: 'Crédito privado e FGC: como se proteger de emissor problemático', pergunta: 'Meu dinheiro no CDB está seguro?' },
  ouro: { angulo: 'Ouro na carteira: proteção, não aposta', pergunta: 'Vale ter ouro na carteira?' },
  previdencia: { angulo: 'Previdência e aposentadoria: PGBL, VGBL e quando cada um faz sentido', pergunta: 'PGBL ou VGBL: qual escolher?' },
};

/** Itens compactos que alimentam a semana (guardados entre execuções). */
export function compactForWeek(items) {
  const seen = new Set();
  const out = [];
  for (const it of [...items].sort((a, b) => b.priorityScore - a.priorityScore)) {
    if (!it.relevant || !it.analysis || it.priorityScore < 7) continue;
    if (seen.has(it.cluster)) continue;
    seen.add(it.cluster);
    out.push({
      id: it.id, title: it.title, url: it.url, sourceName: it.sourceName, region: it.region, publishedAt: it.publishedAt,
      summary: (it.summary || '').slice(0, 220),
      priorityScore: it.priorityScore, priority: it.priority, coverage: it.coverage || 1,
      temas: it.analysis.temas, regras: it.analysis.regras, impacto: (it.analysis.impactoClientes || []).slice(0, 2),
    });
  }
  return out;
}

export function mergeWeek(prev, current, now = new Date()) {
  const corte = addDays(brtDate(now), -RETENCAO_DIAS);
  const map = new Map();
  for (const it of [...(prev || []), ...current]) map.set(it.id, it);
  return [...map.values()]
    .filter((i) => brtDate(new Date(i.publishedAt)) >= corte)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, MAX_SEMANA);
}

const DISCLAIMER = 'Este conteúdo tem caráter informativo e educacional e não constitui recomendação de investimento. Rentabilidade passada não garante resultados futuros. Converse com seu assessor para avaliar o seu perfil e os seus objetivos.';

function rankPauta(semana, limite) {
  const porRegra = new Map();
  const vistos = [];
  for (const it of semana) {
    if (vistos.some((v) => jaccardTitles(v, it.title) >= 0.6)) continue;
    vistos.push(it.title);
    const regra = it.regras?.[0];
    if (!regra || !PAUTA[regra]) continue;
    const g = porRegra.get(regra) || { regra, itens: [], score: 0 };
    g.itens.push(it);
    g.score += it.priorityScore + (it.coverage - 1);
    porRegra.set(regra, g);
  }
  return [...porRegra.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limite)
    .map((g) => {
      const melhor = [...g.itens].sort((a, b) => b.priorityScore - a.priorityScore)[0];
      return {
        regra: g.regra,
        tema: melhor.temas?.[0] || g.regra,
        titulo: melhor.title,
        angulo: PAUTA[g.regra].angulo,
        pergunta: PAUTA[g.regra].pergunta,
        formatos: FORMATOS,
        noticias: g.itens.length,
        score: Math.round(g.score * 10) / 10,
        fontes: g.itens.slice(0, 3).map((i) => ({ title: i.title, url: i.url, sourceName: i.sourceName })),
        impacto: melhor.impacto || [],
      };
    });
}

function proximosEventos(agenda, hoje, dias = 7) {
  const fim = addDays(hoje, dias);
  return (agenda?.eventos || [])
    .filter((e) => e.data >= hoje && e.data <= fim && e.tipo !== 'focus' && e.peso >= 2)
    .sort((a, b) => b.peso - a.peso || a.data.localeCompare(b.data))
    .slice(0, 4);
}

function planoSemanal(pauta, eventos) {
  const plano = [];
  const evs = eventos.map((e) => e.titulo.replace(/:.*/, '')).slice(0, 3);
  plano.push({
    dia: 'Segunda', formato: 'Post no LinkedIn + stories',
    tema: 'O que esperar da semana',
    gancho: evs.length ? `Esta semana o mercado olha para: ${evs.join(', ')}. O que cada um significa para o seu dinheiro.` : 'Resumo do que importa para a semana, em 3 pontos.',
    fontes: [],
  });
  if (pauta[0]) plano.push({ dia: 'Quarta', formato: pauta[0].formatos[0], tema: pauta[0].tema, gancho: pauta[0].angulo, fontes: pauta[0].fontes });
  if (pauta[1]) plano.push({ dia: 'Sexta', formato: pauta[1].formatos[1], tema: pauta[1].tema, gancho: pauta[1].angulo, fontes: pauta[1].fontes });
  return plano;
}

function newsletter(semana, pauta, eventos, hoje) {
  const destaques = [];
  const usados = new Set();
  for (const p of pauta) {
    const it = semana.find((s) => s.title === p.titulo);
    if (it && !usados.has(it.id)) { usados.add(it.id); destaques.push({ it, p }); }
    if (destaques.length === 3) break;
  }
  const temas = destaques.map((d) => d.p.tema.toLowerCase());
  const titulo = temas.length ? `Radar da semana: ${temas.join(', ').replace(/, ([^,]*)$/, ' e $1')}` : 'Radar da semana';
  const L = [];
  L.push(`# ${titulo}`, '', 'Olá, [nome]!', '', 'Separei o que mais mexeu com o seu patrimônio nesta semana e o que vem por aí.', '', '## O que aconteceu', '');
  destaques.forEach(({ it, p }, i) => {
    L.push(`### ${i + 1}. ${it.title}`);
    L.push(`**O que aconteceu:** ${it.summary || it.title}`);
    if (it.impacto?.[0]) L.push(`**Por que importa:** ${it.impacto[0]}`);
    L.push(`**Pergunta que muita gente faz:** ${p.pergunta}`);
    L.push(`_Fonte: ${it.sourceName}_`, '');
  });
  if (eventos.length) {
    L.push('## O que vem por aí', '');
    for (const e of eventos) L.push(`- **${e.quando}**: ${e.titulo}${e.confianca === 'estimado' ? ' (data estimada)' : ''}`);
    L.push('');
  }
  L.push('## Um ponto de atenção', '', '[escreva aqui, com a sua voz, um ponto de atenção ligado ao perfil do leitor]', '', '---', '', `_${DISCLAIMER}_`);
  return { titulo, markdown: L.join('\n'), geradoEm: hoje };
}

const CHECKLIST = [
  'Não prometa nem sugira rentabilidade; evite as palavras "garantido", "sem risco" e "certeza".',
  'Cite a fonte dos dados e confira os números na matéria ou no comunicado original.',
  'Mostre riscos junto com possíveis benefícios e inclua o aviso de que não é recomendação.',
  'Não cite clientes, valores ou casos reais de carteira.',
  'Passe pelo seu compliance conforme a regra da sua assessoria antes de publicar.',
];

export function buildContent(semana, agenda, now = new Date()) {
  const hoje = brtDate(now);
  const pauta = rankPauta(semana, 6);
  const eventos = proximosEventos(agenda, hoje, 7);
  return {
    geradoEm: now.toISOString(),
    janelaDias: RETENCAO_DIAS,
    totalBase: semana.length,
    pauta,
    plano: planoSemanal(pauta, eventos),
    newsletter: newsletter(semana, pauta, eventos, hoje),
    checklist: CHECKLIST,
    disclaimer: DISCLAIMER,
    semana,
  };
}

export { fmtBR };

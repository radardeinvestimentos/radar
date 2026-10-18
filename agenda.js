// Agenda: eventos do calendário curado (config/agenda.json) + Focus toda segunda + roteiro "o que esperar / antes / depois".
// Datas AAAA-MM-DD no fuso de Brasília. Eventos "estimado" seguem regra geral: confirme antes de divulgar.
import { addDays, brtDate, dayNum, fmtBR, weekday } from './text.js';

const GUIA = {
  copom: {
    esperar: 'Decisão sobre a Selic. O comunicado e a sinalização contam mais que o número, porque o mercado já precifica o movimento esperado (veja o Focus e a curva de juros).',
    antes: 'Avise os clientes de renda fixa de que há decisão e diga o que está precificado. Evite prever o resultado.',
    depois: 'Compare com o esperado. Explique em duas frases o que muda no carrego de pós-fixados, prefixados e IPCA+. Quem está todo em CDI é o primeiro contato.',
  },
  ata: {
    esperar: 'Detalha o raciocínio do comitê e a sinalização para as próximas reuniões. Costuma mexer na curva de juros quando o tom surpreende.',
    antes: 'Reserve 15 minutos para ler os trechos sobre inflação, atividade e balanço de riscos.',
    depois: 'Resuma em 3 pontos e relacione com o que o cliente tem em carteira. Se quiser, me mande o documento e eu preparo o resumo.',
  },
  fomc: {
    esperar: 'Decisão de juros nos EUA. Move dólar, treasuries e o apetite global a risco. O tom do comunicado e a coletiva importam.',
    antes: 'Verifique clientes com exposição a dólar, BDRs e ETFs globais.',
    depois: 'Explique o efeito no dólar e nos emergentes. Quem tem renda fixa em dólar quer saber do yield.',
  },
  ipca: {
    esperar: 'Inflação oficial do mês. Acima ou abaixo do consenso muda a conversa sobre juros e a proteção em IPCA+.',
    antes: 'Veja o consenso e a projeção do Focus.',
    depois: 'Compare com o consenso e relacione ao carrego de pós-fixados e à rentabilidade real dos clientes.',
  },
  ipca15: {
    esperar: 'Prévia da inflação. Antecipa o IPCA cheio e costuma ser lida como sinal para o Copom.',
    antes: 'Veja o consenso.',
    depois: 'Use como gancho curto no relatório diário.',
  },
  pnad: {
    esperar: 'Desemprego e renda. Mercado de trabalho forte sustenta consumo e atrasa cortes de juros.',
    antes: 'Veja a taxa do mês anterior.',
    depois: 'Relacione com varejo, consumo e juros.',
  },
  pib: {
    esperar: 'Crescimento do trimestre. Define o tom da economia no ano e das projeções de 2027.',
    antes: 'Veja a mediana do Focus para o PIB.',
    depois: 'Explique ganhos ou perdas por setor e o que isso diz sobre os lucros das empresas.',
  },
  pim: { esperar: 'Produção da indústria. Termômetro de atividade e de empresas cíclicas.', antes: 'Veja o consenso.', depois: 'Use como gancho para clientes com indústria na carteira.' },
  pmc: { esperar: 'Vendas do varejo. Importante para o varejo listado e o consumo.', antes: 'Veja o consenso.', depois: 'Relacione com ações de varejo e juros.' },
  pms: { esperar: 'Volume de serviços, grande parte do PIB. Complementa a leitura de atividade.', antes: 'Veja o consenso.', depois: 'Junte com PMC e PIM para a leitura da semana.' },
  eleicao: {
    esperar: 'Aumento de volatilidade no entorno do resultado. O mercado reage ao cenário fiscal e regulatório sinalizado, a nomes de equipe econômica e a estatais.',
    antes: 'Prepare o roteiro de comunicação para a segunda-feira seguinte. Mapeie clientes concentrados em estatais, prefixados longos ou dólar.',
    depois: 'Contato proativo curto: o que mudou, o que não muda no plano e quais pontos acompanhar nas próximas semanas.',
  },
  comecotas: {
    esperar: 'Cobrança semestral de IR em fundos abertos, em maio e novembro, com redução de cotas. Não vale para FIIs e ações.',
    antes: 'Liste clientes com fundos tributados e avise do efeito líquido, principalmente em novembro.',
    depois: 'Revise a eficiência tributária: previdência, isentos, fundos exclusivos e ativos diretos.',
  },
  payroll: {
    esperar: 'Emprego nos EUA. Mexe nas apostas sobre juros do Fed, no dólar e nas bolsas globais.',
    antes: 'Veja o consenso.',
    depois: 'Explique o efeito no dólar e nas bolsas para clientes com exposição internacional.',
  },
  balancos: {
    esperar: 'Resultados do trimestre reprecificam ações e setores. Atenção à orientação (guidance), dividendos e comentários de gestão.',
    antes: 'Liste os papéis dos clientes que divulgam resultados na semana.',
    depois: 'Envie uma leitura curta para quem tem o papel, usando a aba Meus ativos.',
  },
  focus: {
    esperar: 'Boletim com as projeções do mercado para IPCA, PIB, câmbio e Selic. Mudança na mediana é sinal de rumo.',
    antes: 'Compare com a semana anterior na aba Leituras.',
    depois: 'Use como número da semana na newsletter.',
  },
};

const PESO = { copom: 5, eleicao: 5, fomc: 4, ipca: 4, pib: 3, ata: 3, payroll: 3, comecotas: 3, balancos: 3, ipca15: 2, pnad: 2, pim: 2, pmc: 2, pms: 1, focus: 1 };
const GENERICO = { esperar: 'Evento do calendário.', antes: 'Veja o que o mercado espera.', depois: 'Compare com o esperado e relacione com a carteira dos clientes.' };

// Qual linha do Focus entra no "antes" de cada evento.
const FOCUS_DO_EVENTO = { copom: 'Selic', ipca: 'IPCA', ipca15: 'IPCA', pib: 'PIB' };

const fmtNum = (n, casas = 2) => Number(n).toFixed(casas).replace('.', ',');

function linhaFocus(focus, tipo, data) {
  const ind = FOCUS_DO_EVENTO[tipo];
  if (!ind || !focus?.ok) return null;
  const ano = Number(data.slice(0, 4));
  const l = focus.linhas.find((x) => x.indicador === ind && x.ano === ano) || (ind !== 'Selic' ? focus.linhas.find((x) => x.indicador === ind) : null);
  if (!l) return null;
  const nome = ind === 'Selic' ? `Selic no fim de ${l.ano}` : `${ind} ${l.ano}`;
  let v = '';
  if (l.variacao != null && l.anterior) {
    const dias = dayNum(l.data) - dayNum(l.anterior.data);
    v = l.variacao === 0 ? ` (estável em ${dias} dias)` : ` (${l.variacao > 0 ? '+' : '-'}${fmtNum(Math.abs(l.variacao))} p.p. em ${dias} dias)`;
  }
  return `Focus: ${nome}: ${fmtNum(l.mediana)}${ind === 'Selic' ? '% a.a.' : '%'}${v}`;
}

function janelaDe(hoje, data) {
  if (data === hoje) return 'hoje';
  const dow = weekday(hoje) === 0 ? 7 : weekday(hoje);
  const fimSemana = addDays(hoje, 7 - dow);
  if (data <= fimSemana) return 'semana';
  if (data <= addDays(fimSemana, 7)) return 'proxima';
  return 'depois';
}

function statusDe(hoje, e) {
  if (e.inicio && e.inicio <= hoje && hoje <= e.data) return e.periodo ? 'em andamento' : 'em andamento';
  const d = dayNum(e.data) - dayNum(hoje);
  return d === 0 ? 'hoje' : d === 1 ? 'amanhã' : `em ${d} dias`;
}

/**
 * @param {{eventos?:any[], periodos?:any[], revisadoEm?:string, fontes?:string[]}} cfg
 * @param {Date} now
 * @param {object|null} focus resultado de fetchFocus (usado só se ok)
 */
export function buildAgenda(cfg, now = new Date(), focus = null, { horizonDias = 75 } = {}) {
  const hoje = brtDate(now);
  const limite = addDays(hoje, horizonDias);
  const brutos = [];

  for (const e of cfg.eventos || []) {
    if (e.data < hoje || e.data > limite) continue;
    brutos.push({ ...e });
  }
  for (const p of cfg.periodos || []) {
    if (p.fim < hoje || p.inicio > limite) continue;
    brutos.push({ ...p, data: p.inicio < hoje ? hoje : p.inicio, periodo: `${fmtBR(p.inicio)} a ${fmtBR(p.fim)}`, fimPeriodo: p.fim });
  }
  let seg = hoje;
  while (weekday(seg) !== 1) seg = addDays(seg, 1);
  for (let i = 0; i < 6 && seg <= limite; i++, seg = addDays(seg, 7)) {
    brutos.push({ data: seg, tipo: 'focus', titulo: 'Boletim Focus (Banco Central)', detalhe: 'Publicado às segundas-feiras.', fonte: 'Banco Central', confirmada: true });
  }

  const eventos = brutos.map((e) => {
    const g = { ...GENERICO, ...(GUIA[e.tipo] || {}) };
    const f = linhaFocus(focus, e.tipo, e.data);
    const quando = e.periodo || (e.inicio && e.inicio !== e.data ? `${fmtBR(e.inicio)} e ${fmtBR(e.data)}` : fmtBR(e.data));
    return {
      data: e.data,
      ...(e.inicio && e.inicio !== e.data ? { inicio: e.inicio } : {}),
      tipo: e.tipo,
      titulo: e.titulo,
      detalhe: e.detalhe || null,
      fonte: e.fonte || null,
      periodo: e.periodo || undefined,
      quando,
      status: statusDe(hoje, { ...e, inicio: e.periodo ? e.inicio : undefined }),
      janela: janelaDe(hoje, e.data),
      confianca: e.estimada ? 'estimado' : 'confirmado',
      peso: PESO[e.tipo] ?? 2,
      esperar: g.esperar,
      antes: [...(f ? [f] : []), g.antes],
      depois: [g.depois],
    };
  });
  eventos.sort((a, b) => a.data.localeCompare(b.data) || b.peso - a.peso || a.titulo.localeCompare(b.titulo, 'pt'));
  eventos.forEach((e, i) => { e.id = `${e.data}-${e.tipo}-${i}`; });

  return {
    geradoEm: now.toISOString(),
    hoje,
    revisadoEm: cfg.revisadoEm || null,
    fontes: cfg.fontes || [],
    aviso: 'Eventos marcados como estimados seguem regra geral e devem ser confirmados antes de divulgar. Datas de eventos oficiais podem mudar.',
    eventos,
  };
}

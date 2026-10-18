// Gatilhos de prospecção e relacionamento: EVENTOS nas notícias que sugerem uma conversa (nunca listas de pessoas).
// Use só informação pública e valide a abordagem com o seu compliance. Tudo aqui é sugestão para você decidir.
import { norm } from './classify.js';
import { addDays, brtDate, dayNum, fmtBR } from './text.js';

export const REGIONAL = /(?<![a-z0-9])(curitiba|parana|paranaense|santa catarina|catarinense|rio grande do sul|gaucho|porto alegre|florianopolis|londrina|maringa|joinville|blumenau|cascavel|ponta grossa|sul do pais)(?![a-z0-9])/;

const NOT_REVENUE = /vendas? (no|do|de|em) (varejo|varejista|veiculos|carros|imoveis|natal|dia)|vendas (caem|sobem|crescem|avancam|recuam|desaceleram)/;

// tipo: prospect (gera conversa com quem ainda não é cliente) | carteira (relacionamento com a base) | ambos
const RULES = [
  {
    id: 'venda_empresa', tipo: 'prospect', titulo: 'Venda, fusão ou aquisição de empresa', peso: 8,
    main: /(?<![a-z])(venda|vende|vendem|vendeu|venderam|vendida|vendido|aquisicao|adquire|adquirem|adquiriu|fusao|incorpora\w*|opa|desinvestimento|compra d[aeo]s?)(?![a-z])/,
    ctx: /(empresa|companhia|rede|grupo|controle|participacao|negocio|startup|fabricante|operacao|fintech|holding|socios?|fundador\w*|varejista|construtora|unidade|marca)/,
    not: [NOT_REVENUE, /(?<![a-z])(acoes?|titulos?|dolar|ouro|imovel|apartamento|carro)(?![a-z]).*(vende|venda)/],
    porque: 'Sócios, fundadores e executivos podem receber liquidez relevante e passam a ter dinheiro novo e patrimônio concentrado.',
    publico: 'Sócios e executivos da empresa; contadores e advogados societários que assessoram a operação.',
    gancho: 'Chegar por relacionamento ou indicação, sem usar a notícia como pretexto. Tema da conversa: diversificação, reserva e planejamento tributário e sucessório depois da liquidez.',
    cuidados: 'Não use informação não pública. A operação pode ainda não ter sido concluída.',
  },
  {
    id: 'captacao_startup', tipo: 'prospect', titulo: 'Rodada, captação ou saída de startup', peso: 5,
    main: /(?<![a-z])(rodada|serie [abc]|capta\w*|levanta\w*|aporte|unicornio|exit)(?![a-z])/,
    ctx: /(startup|fintech|healthtech|agtech|scale-?up|empresa de tecnologia|fundador\w*)/,
    porque: 'Fundadores podem ter venda parcial de participação (secundária) ou valorização relevante do patrimônio.',
    publico: 'Fundadores e primeiros funcionários com opções de ações.',
    gancho: 'Conteúdo consultivo sobre concentração de patrimônio em uma única empresa e planejamento de liquidez.',
    cuidados: 'Valores de rodadas são do negócio, não do patrimônio pessoal dos sócios.',
  },
  {
    id: 'ipo_oferta', tipo: 'ambos', titulo: 'IPO, follow-on ou oferta de ativos', peso: 6,
    main: /(?<![a-z])(ipo|follow-on|oferta (publica|restrita|subsequente|de acoes|de cotas)|emissao de debentures|cvm 160|primeira oferta)(?![a-z])/,
    porque: 'Ofertas primárias podem caber em perfis qualificados; sócios e executivos da emissora ganham liquidez ou ficam em período de lock-up.',
    publico: 'Clientes e prospects qualificados ou profissionais; sócios e executivos da emissora.',
    gancho: 'Apresentar a oferta somente para quem se enquadra no perfil e na regra da oferta; usar o tema para explicar como avaliar uma emissão primária.',
    cuidados: 'Há regras de comunicação durante ofertas (CVM 160) e de suitability. Valide com o compliance antes de divulgar.',
  },
  {
    id: 'tributaria', tipo: 'ambos', titulo: 'Mudança tributária em investimentos', peso: 8,
    main: /imposto de renda|(?<![a-z])ir(?![a-z]) (sobre|de|para|nos|na)|(?<![a-z])iof(?![a-z])|reforma tributaria|isencao|tributacao|taxacao|come-?cotas|itcmd|receita federal|medida provisoria|(?<![a-z])lci(?![a-z])|(?<![a-z])lca(?![a-z])|debentures incentivadas/,
    porque: 'Muda o retorno líquido de produtos de toda a base de clientes. Quem se antecipa ganha credibilidade e abre conversa de planejamento.',
    publico: 'Toda a base de clientes; prospects que perguntam sobre imposto e produtos isentos.',
    gancho: 'Comunicado curto e conversa de 15 minutos por segmento; para prospects, usar como conteúdo educativo (simulação do impacto líquido).',
    cuidados: 'Confirme a regra e a data de vigência na fonte oficial antes de falar com clientes.',
  },
  {
    id: 'demissoes_pdv', tipo: 'prospect', titulo: 'Demissões ou plano de desligamento', peso: 5,
    main: /(?<![a-z])(pdv|plano de demissao voluntaria|demiss\w+|demite\w*|layoffs?|corte de (vagas|funcionarios|empregos))(?![a-z])/,
    ctx: /(empresa|companhia|funcionarios|colaboradores|mil|montadora|fabrica|banco|varejista|industria|unidade|trabalhadores|vagas)/,
    porque: 'Pessoas com verba rescisória e FGTS precisam decidir reserva, uso do dinheiro e transição de carreira.',
    publico: 'Profissionais afetados, via parceiros de RH, outplacement e comunidades profissionais.',
    gancho: 'Tom de apoio. Conteúdo educativo sobre reserva de emergência e uso responsável da rescisão. Evite abordagem comercial direta.',
    cuidados: 'Tema sensível: não aborde pessoas pelo nome com base em notícia.',
  },
  {
    id: 'sucessao', tipo: 'prospect', titulo: 'Herança, sucessão e patrimônio familiar', peso: 6,
    main: /(?<![a-z])(heranca|sucessao|inventario|holding familiar|itcmd|doacao em vida|testamento|planejamento sucessorio|patrimonio familiar)(?![a-z])/,
    porque: 'Famílias com patrimônio em reorganização buscam orientação e tendem a manter o relacionamento por gerações.',
    publico: 'Famílias empresárias, advogados de família e sucessão, contadores.',
    gancho: 'Conteúdo e conversa de planejamento sucessório; parceria com advogado e contador especializados.',
    cuidados: 'Não é consultoria jurídica ou tributária: trabalhe com parceiros habilitados.',
  },
  {
    id: 'proventos_bonus', tipo: 'ambos', titulo: 'Dividendos extraordinários, bonificação ou PLR', peso: 4,
    main: /(dividendos? extraordinari\w*|proventos? extraordinari\w*|bonificacao|(?<![a-z])plr(?![a-z])|participacao nos lucros)/,
    porque: 'Acionistas e funcionários recebem caixa que precisa de destino: reinvestir, quitar dívida ou reservar.',
    publico: 'Acionistas relevantes e funcionários da companhia.',
    gancho: 'Mensagem sobre como pensar o destino do provento (reserva, objetivos, imposto).',
    cuidados: 'Confira a tributação vigente de dividendos e proventos antes de falar em valores.',
  },
  {
    id: 'turbulencia', tipo: 'carteira', titulo: 'Estresse forte no mercado', peso: 7,
    main: /(?<![a-z])(despenca\w*|desaba\w*|panico|sell-?off|circuit breaker|maior queda|tombo|derrete\w*|pior dia)(?![a-z])/,
    ctx: /(ibovespa|bolsa|dolar|mercados?|wall street|bitcoin|acoes|fiis?|ifix)/,
    porque: 'Clientes ansiosos ligam para o assessor que não ligou primeiro. É o momento de maior valor percebido do relacionamento.',
    publico: 'Clientes de renda variável e multimercado; clientes novos.',
    gancho: 'Contato proativo curto: contexto, horizonte, o que a carteira tem de proteção e o que não muda no plano.',
    cuidados: 'Sem promessa de recuperação e sem recomendação de compra por impulso.',
  },
  {
    id: 'decisao_juros', tipo: 'carteira', titulo: 'Decisão de juros (Copom ou Fed)', peso: 5,
    main: /(copom|selic|(?<![a-z])fed(?![a-z])|fomc).*(decide|decisao|mantem|mantiveram|corta|cortam|eleva|elevam|reuniao)|(decisao|reuniao) d[oa] (copom|fed)/,
    porque: 'Momento natural para revisar a alocação entre pós-fixados, prefixados e inflação.',
    publico: 'Clientes de renda fixa e todos os que perguntam "e agora, o que eu faço?".',
    gancho: 'Mensagem curta explicando o que foi decidido e o que muda (ou não) no carrego da carteira.',
    cuidados: 'Evite prever a próxima decisão.',
  },
  {
    id: 'credito_estresse', tipo: 'carteira', titulo: 'Evento de crédito (liquidação, RJ, calote)', peso: 8,
    main: /(liquidacao extrajudicial|recuperacao judicial|pedido de falencia|calote|inadimplencia d[eao]s? (debentures|cri|cra|emissor)|fraude)/,
    porque: 'Clientes com exposição ao emissor precisam ser avisados antes de perguntarem.',
    publico: 'Clientes com crédito privado, CDBs ou fundos expostos ao emissor citado.',
    gancho: 'Checar exposição e limite do FGC, ligar para os expostos e registrar a orientação.',
    cuidados: 'Informe só o que é público e confirmado; não especule sobre a causa.',
  },
  {
    id: 'eleicao', tipo: 'carteira', titulo: 'Eleição e cenário político-econômico', peso: 5, full: true,
    main: /(segundo turno|eleicoes? (2026|presidenciais?|gerais)|(?<![a-z])debate(?![a-z])|urnas|pesquisa (datafolha|quaest|ipec|genial))/,
    ctx: /(lula|presidente|candidat\w+|eleicao|eleicoes|eleitoral|segundo turno|urnas|tse|governador|pesquisa)/,
    porque: 'Eleição aumenta a volatilidade e as perguntas dos clientes sobre dólar, juros e bolsa.',
    publico: 'Toda a base, em especial clientes concentrados em estatais, prefixados longos ou dólar.',
    gancho: 'Mensagem sobre cenários econômicos (não partidários): o que muda, o que não muda no plano e quais pontos acompanhar.',
    cuidados: 'Sem opinião política nem previsão de resultado; foque em cenários e planejamento.',
  },
];

/** @returns {Array<{id:string,tipo:string,titulo:string,peso:number,porque:string,publico:string,gancho:string,cuidados:string}>} até 2 por notícia */
export function detectTriggers(item) {
  const head = norm(`${item.title} ${(item.categories || []).join(' ')}`);
  const ctxText = `${head} ${norm((item.summary || '').slice(0, 220))}`;
  const out = [];
  for (const r of RULES) {
    if (!r.main.test(r.full ? ctxText : head)) continue;
    if (r.ctx && !r.ctx.test(ctxText)) continue;
    if (r.not && r.not.some((n) => n.test(head))) continue;
    out.push({ id: r.id, tipo: r.tipo, titulo: r.titulo, peso: r.peso, porque: r.porque, publico: r.publico, gancho: r.gancho, cuidados: r.cuidados });
  }
  return out.sort((a, b) => b.peso - a.peso).slice(0, 2);
}

export function isRegional(item) {
  return REGIONAL.test(norm(`${item.title} ${(item.categories || []).join(' ')} ${item.summary || ''}`));
}

const urgencia = (peso) => (peso >= 7 ? 'alta' : peso >= 5 ? 'media' : 'baixa');
const URG = { alta: 0, media: 1, baixa: 2 };

/** Agrupa as notícias por gatilho. */
export function buildTriggers(items, now = new Date()) {
  const grupos = new Map();
  for (const it of items) {
    for (const t of detectTriggers(it)) {
      const g = grupos.get(t.id) || { ...t, itens: [], vistos: new Set(), score: 0 };
      const chave = it.cluster || it.id;
      if (g.vistos.has(chave)) continue;
      g.vistos.add(chave);
      const idadeH = (now.getTime() - Date.parse(it.publishedAt)) / 3600e3;
      const recencia = idadeH <= 3 ? 2 : idadeH <= 12 ? 1 : idadeH > 36 ? -2 : 0;
      g.score += t.peso + Math.min((it.coverage || 1) - 1, 3) * 1.5 + recencia;
      g.itens.push({
        id: it.id, title: it.title, url: it.url, sourceName: it.sourceName, publishedAt: it.publishedAt,
        regional: isRegional(it) || undefined,
      });
      grupos.set(t.id, g);
    }
  }
  const gatilhos = [...grupos.values()].map(({ vistos, itens, score, peso, ...g }) => ({
    ...g,
    urgencia: urgencia(peso),
    score: Math.round(score * 10) / 10,
    regional: itens.some((i) => i.regional) || undefined,
    itens: itens.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, 6),
    total: itens.length,
  }));
  gatilhos.sort((a, b) => URG[a.urgencia] - URG[b.urgencia] || b.score - a.score);
  return { geradoEm: now.toISOString(), calendario: buildSazonais(now), gatilhos };
}

// --- Gatilhos de calendário: oportunidades que se repetem todo ano (janela MM-DD a MM-DD) ---
const SAZONAIS = [
  {
    id: 'pgbl_fim_ano', titulo: 'PGBL e dedução do IR até 31/12', tipo: 'ambos', janelas: [['10-01', '12-31']],
    porque: 'Quem faz a declaração completa pode deduzir aportes em PGBL até 12% da renda bruta tributável; o benefício vale só para aportes feitos até 31/12.',
    publico: 'Clientes e prospects empregados com carteira assinada ou profissionais com renda tributável alta, que declaram no modelo completo.',
    gancho: 'Simulação simples: quanto de IR o aporte poderia reduzir e o que muda na tributação futura (tabela progressiva ou regressiva).',
    cuidados: 'Depende do perfil e do regime de declaração. Evite prometer restituição.',
  },
  {
    id: 'eleicao_2026', titulo: 'Eleições 2026: segundo turno em 25/10', tipo: 'carteira', ano: 2026, janelas: [['10-01', '10-31']],
    porque: 'Aumenta a volatilidade e as perguntas sobre dólar, juros e bolsa.',
    publico: 'Toda a base, em especial clientes com estatais, prefixados longos ou dólar.',
    gancho: 'Mensagem curta sobre cenários e o que não muda no plano, enviada antes do segundo turno ou na segunda-feira seguinte.',
    cuidados: 'Neutralidade política; sem previsão de resultado.',
  },
  {
    id: 'decimo_terceiro', titulo: '13º salário (1ª parcela até 30/11, 2ª até 20/12)', tipo: 'ambos', janelas: [['11-01', '12-20']],
    porque: 'Dinheiro extra na conta de muita gente, com destino a definir: dívidas, reserva, objetivos, previdência.',
    publico: 'Empregados CLT e aposentados; prospects de perfil iniciante.',
    gancho: 'Conteúdo educativo "o que fazer com o 13º" em 3 passos, sem produto específico.',
    cuidados: 'Conteúdo educativo; sem indicar produto sem conhecer o perfil.',
  },
  {
    id: 'comecotas', titulo: 'Come-cotas (último dia útil de novembro)', tipo: 'carteira', janelas: [['11-15', '11-30'], ['05-15', '05-31']],
    porque: 'Cobrança semestral de IR em fundos abertos reduz cotas e gera dúvidas.',
    publico: 'Clientes com fundos abertos tributados (não vale para FIIs e ações).',
    gancho: 'Avisar quem tem fundos antes da cobrança e rever a eficiência tributária da carteira.',
    cuidados: 'Confira a regra do tipo de fundo antes de falar em valores.',
  },
  {
    id: 'balancos', titulo: 'Temporada de balanços', tipo: 'carteira', janelas: [['10-20', '11-14'], ['02-20', '03-31'], ['04-20', '05-15'], ['07-20', '08-14']],
    porque: 'Resultados reprecificam ações e setores e geram perguntas dos clientes que têm os papéis.',
    publico: 'Clientes com ações; prospects que acompanham bolsa.',
    gancho: 'Leitura curta para quem tem o papel, usando a aba Meus ativos.',
    cuidados: 'Não faça recomendação individual; foque em explicar o resultado.',
    estimada: true,
  },
  {
    id: 'virada_ano', titulo: 'Virada do ano: balanço e planejamento', tipo: 'ambos', janelas: [['12-15', '01-15']],
    porque: 'Época de revisar metas, rentabilidade do ano e planejar o seguinte; clientes e prospects estão abertos a conversar.',
    publico: 'Toda a base e prospects em geral.',
    gancho: 'Retrospectiva do ano e conversa de planejamento para o ano seguinte.',
    cuidados: 'Rentabilidade passada não garante resultados futuros.',
  },
  {
    id: 'plr_temporada', titulo: 'Temporada de PLR e bônus', tipo: 'prospect', janelas: [['02-01', '03-31']],
    porque: 'Profissionais recebem PLR e bônus e decidem o destino do dinheiro.',
    publico: 'Profissionais de indústria, bancos e grandes empresas, via empresas parceiras e comunidades profissionais.',
    gancho: 'Conteúdo "o que fazer com a PLR" e convite para conversa de planejamento.',
    cuidados: 'Evite abordagem direta com base em dados de terceiros.',
    estimada: true,
  },
  {
    id: 'ir_declaracao', titulo: 'Declaração de Imposto de Renda', tipo: 'ambos', janelas: [['03-01', '05-31']],
    porque: 'Clientes olham pela primeira vez o próprio patrimônio e têm dúvidas sobre ativos, isenções e prejuízos.',
    publico: 'Toda a base e prospects que investem por conta própria.',
    gancho: 'Guia curto "o que levar à declaração" e oferta de revisão do informe de rendimentos.',
    cuidados: 'Não é consultoria tributária; indique contador quando necessário.',
  },
];

const AVISO_DIAS = 21;

/** Gatilhos de calendário ativos agora ou que começam em até 21 dias. */
export function buildSazonais(now = new Date()) {
  const hoje = brtDate(now);
  const ano = Number(hoje.slice(0, 4));
  const out = [];
  for (const s of SAZONAIS) {
    for (const [ini, fim] of s.janelas) {
      for (const y of [ano - 1, ano, ano + 1]) {
        if (s.ano && s.ano !== y) continue;
        const inicio = `${y}-${ini}`;
        const final = `${ini > fim ? y + 1 : y}-${fim}`;
        const ativa = hoje >= inicio && hoje <= final;
        const emBreve = hoje < inicio && dayNum(inicio) - dayNum(hoje) <= AVISO_DIAS;
        if (!ativa && !emBreve) continue;
        const { janelas, ano: _a, ...resto } = s;
        out.push({ ...resto, ativa, inicio, fim: final, quando: ativa ? `até ${fmtBR(final)}` : `começa em ${fmtBR(inicio)}` });
      }
    }
  }
  const vistos = new Set();
  return out.filter((x) => (vistos.has(x.id) ? false : vistos.add(x.id))).sort((a, b) => Number(b.ativa) - Number(a.ativa) || a.fim.localeCompare(b.fim));
}

export { addDays };

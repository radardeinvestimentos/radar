// Motor de análise de impacto para assessor de investimentos (regras determinísticas, 100% gratuito).
// Não é recomendação de investimento: é um gatilho para o assessor pensar em carteiras e em contato com clientes.

import { norm } from './classify.js';

const UP = /(?<![a-z0-9])(alta|altas|sobe|sobem|subiu|subir|eleva|elevar|elevam|elevou|aumenta|aumentam|aumentou|aumento|dispara|disparam|salta|saltam|avanca|avancam|avancou|valoriza\w*|recorde|rally|rises?|rose|jumps?|surges?|climbs?|gains?|higher|hikes?|raises?|soars?)(?![a-z0-9])/g;
const DOWN = /(?<![a-z0-9])(queda|quedas|cai|caem|caiu|cair|recua|recuam|recuou|corta|cortam|cortou|cortar|corte|reduz|reduzem|reduziu|reduzir|derrete\w*|despenca\w*|desaba\w*|desacelera\w*|perde|perdem|afunda\w*|falls?|fell|drops?|dropped|cuts?|lower|slumps?|slides?|eases?|declines?|tumbles?|sinks?)(?![a-z0-9])/g;

function firstIndex(rx, t) {
  rx.lastIndex = 0;
  const m = rx.exec(t);
  return m ? { i: m.index, w: m[0] } : null;
}

/** Direção dominante no título: a primeira palavra de tom que aparece. */
export function tone(title) {
  const t = norm(title);
  const u = firstIndex(UP, t);
  const d = firstIndex(DOWN, t);
  if (u && d) return u.i < d.i ? { key: 'up', word: u.w } : { key: 'down', word: d.w };
  if (u) return { key: 'up', word: u.w };
  if (d) return { key: 'down', word: d.w };
  return { key: 'flat', word: null };
}

const A = (classe, dir, nota) => ({ classe, dir, nota });
const FLAT_NOTE = 'A direção não está clara só pelo título: leia a matéria completa antes de reposicionar.';

const RULES = [
  {
    id: 'juros_br', tema: 'Juros no Brasil (Selic/Copom)', weight: 6,
    re: /selic|copom|taxa basica de juros|galipolo|politica monetaria no brasil|bc (eleva|corta|mantem)|banco central (eleva|corta|mantem)/,
    out: {
      up: {
        ativos: [A('Pós-fixados (CDI/Selic)', 'up', 'Carrego maior'), A('Prefixados e IPCA+ longos', 'down', 'Marcação a mercado pressionada'), A('Ações sensíveis a juros (varejo, construção, small caps)', 'down'), A('FIIs de tijolo', 'down'), A('FIIs de papel', 'up', 'Indexadores rendem mais')],
        impacto: ['Carteiras ancoradas em pós-fixados ganham carrego; quem carrega prefixados longos, small caps e FIIs de tijolo tende a ver mais volatilidade.'],
        valor: ['Mapear clientes com duration longa e procurá-los antes do fechamento do mês.', 'Para perfis conservadores, avaliar travar taxas atrativas em IPCA+/prefixado se o ciclo parecer perto do pico.'],
      },
      down: {
        ativos: [A('Pós-fixados (CDI/Selic)', 'down', 'Carrego menor'), A('Prefixados e IPCA+ longos', 'up', 'Marcação a mercado favorecida'), A('Ações sensíveis a juros (varejo, construção, small caps)', 'up'), A('FIIs de tijolo', 'up')],
        impacto: ['Clientes 100% em CDI enfrentam retorno menor; ativos de duration e bolsa ganham atratividade relativa.'],
        valor: ['Abrir conversa de diversificação (IPCA+, FIIs, renda variável) com quem está todo em pós-fixado, respeitando o perfil.', 'Reajustar a expectativa de rentabilidade nos planejamentos em andamento.'],
      },
      flat: {
        ativos: [A('Curva de juros / renda fixa', 'watch', 'Efeito depende do tom do comunicado')],
        impacto: ['Notícia sobre a política de juros: o impacto depende do tom do comunicado e da reação da curva DI.'],
        valor: ['Acompanhar comunicado e curva DI; preparar uma mensagem curta aos clientes explicando o que muda (ou não) no carrego.'],
      },
    },
  },
  {
    id: 'fed', tema: 'Juros nos EUA (Fed)', weight: 5,
    re: /(?<![a-z])fed(?![a-z])|fomc|powell|federal reserve|juros (nos eua|americanos)|treasur|yields?(?![a-z])|us rates|dot plot/,
    out: {
      up: {
        ativos: [A('Dólar', 'up'), A('Emergentes (Ibovespa)', 'down', 'Pressão por saída de fluxo'), A('Treasuries / renda fixa global', 'up', 'Yields mais altos'), A('Ouro', 'down'), A('Tecnologia/growth', 'down')],
        impacto: ['Juros americanos mais altos fortalecem o dólar e pressionam emergentes e ativos de longa duration, mas melhoram o retorno da renda fixa em dólar.'],
        valor: ['Para clientes com demanda em dólar, renda fixa global/treasuries ganham atratividade.', 'Checar hedge cambial e exposição a growth/small caps.'],
      },
      down: {
        ativos: [A('Dólar', 'down'), A('Emergentes (Ibovespa)', 'up', 'Fluxo favorecido'), A('Ouro', 'up'), A('Tecnologia/growth', 'up'), A('Treasuries', 'watch', 'Yields menores')],
        impacto: ['Juros americanos menores aliviam o dólar e favorecem emergentes, bolsa e ativos de risco.'],
        valor: ['Janela para retomar a conversa sobre bolsa/emergentes com clientes que estavam defensivos.', 'Reavaliar hedge e a fatia internacional.'],
      },
      flat: {
        ativos: [A('Dólar e emergentes', 'watch'), A('Treasuries', 'watch')],
        impacto: ['O Fed é o principal motor do dólar e do apetite a risco global: vale acompanhar o tom do comunicado.'],
        valor: ['Preparar um parágrafo no relatório semanal sobre o que o Fed significa para a carteira internacional dos clientes.'],
      },
    },
  },
  {
    id: 'inflacao', tema: 'Inflação', weight: 5,
    re: /inflacao|ipca|igp-?m|ipc-?a|(?<![a-z])cpi(?![a-z])|(?<![a-z])pce(?![a-z])|inflation|desinflacao/,
    out: {
      up: {
        ativos: [A('IPCA+ (Tesouro/CRIs)', 'up', 'Proteção real'), A('Pós-fixados', 'up', 'Juros altos por mais tempo'), A('Prefixados longos', 'down'), A('Poupança / caixa parado', 'down', 'Perde poder de compra')],
        impacto: ['Inflação pressionada reforça juros altos por mais tempo e corrói o retorno real de prefixados e de caixa mal remunerado.'],
        valor: ['Argumento direto para IPCA+ e para revisar clientes com dinheiro parado em poupança/contas abaixo do CDI.'],
      },
      down: {
        ativos: [A('Prefixados e IPCA+ longos', 'up', 'Espaço para queda de juros'), A('Bolsa doméstica', 'up'), A('Pós-fixados', 'down', 'Carrego tende a cair adiante')],
        impacto: ['Inflação cedendo abre espaço para cortes de juros, favorecendo ativos de duration e bolsa.'],
        valor: ['Boa hora para discutir antecipar a compra de títulos longos antes de a taxa cair, para quem tem horizonte longo.'],
      },
      flat: {
        ativos: [A('IPCA+ e prefixados', 'watch')],
        impacto: ['Dado de inflação: o efeito depende de ter vindo acima ou abaixo do consenso.'],
        valor: ['Comparar com o consenso e comentar com clientes o que muda no cenário de juros.'],
      },
    },
  },
  {
    id: 'atividade', tema: 'Atividade e emprego', weight: 4, invertWhen: /desemprego|unemployment|jobless/,
    re: /(?<![a-z])pib(?![a-z])|(?<![a-z])gdp(?![a-z])|producao industrial|vendas no varejo|retail sales|desemprego|unemployment|payroll|caged|pnad|jobless|recessao|recession|ibc-?br|(?<![a-z])pmi(?![a-z])/,
    out: {
      up: {
        ativos: [A('Ações cíclicas (consumo, indústria)', 'up'), A('Juros futuros', 'up', 'Atividade forte segura cortes'), A('Setores defensivos', 'watch')],
        impacto: ['Atividade forte ajuda lucros e bolsa, mas pode adiar cortes de juros.'],
        valor: ['Destacar setores cíclicos com clientes de perfil moderado/arrojado; lembrar que juros podem ficar altos por mais tempo.'],
      },
      down: {
        ativos: [A('Setores defensivos (energia, saneamento, saúde)', 'up'), A('Ações cíclicas', 'down'), A('Juros futuros', 'down', 'Aposta em cortes')],
        impacto: ['Desaceleração pesa em ações cíclicas e aumenta apostas em cortes de juros.'],
        valor: ['Revisar a concentração dos clientes em cíclicas; reforçar o argumento de diversificação e de renda fixa longa.'],
      },
      flat: {
        ativos: [A('Cíclicas vs. defensivas', 'watch')],
        impacto: ['Dado de atividade: sinaliza ritmo da economia e, por tabela, o caminho dos juros.'],
        valor: ['Usar o dado como gancho para o relatório semanal.'],
      },
    },
  },
  {
    id: 'fiscal', tema: 'Contas públicas (fiscal)', weight: 6,
    re: /fiscal|arcabouco|deficit|superavit|divida (publica|bruta|liquida)|gastos publicos|orcamento|contingenciamento|bloqueio de gastos|(?<![a-z])ldo(?![a-z])|(?<![a-z])loa(?![a-z])|desoneracao|precatorio|(?<![a-z])pec(?![a-z])|bolsa familia|haddad/,
    pick: (t) => {
      if (/superavit|corte de gastos|cumpr\w+ (a )?meta|contencao|melhora fiscal|economia de gastos|arrecadacao recorde/.test(t)) return 'good';
      if (/deficit|rombo|estouro|descumpr\w+|piora|pressao fiscal|risco fiscal|aumento de gastos|expansao de gastos|furo|ajuste fiscal|pede ajuste|alerta|custo (fiscal|bilionario)|gasto/.test(t)) return 'bad';
      return 'flat';
    },
    out: {
      bad: {
        ativos: [A('Juros futuros longos (DI)', 'up', 'Prêmio de risco'), A('Dólar', 'up'), A('Bolsa doméstica', 'down'), A('Prefixados/IPCA+ longos', 'down', 'Marcação a mercado'), A('Ouro / ativos globais', 'up', 'Proteção')],
        impacto: ['Deterioração fiscal eleva o prêmio de risco: curva longa abre, dólar pressiona e a bolsa costuma sofrer.'],
        valor: ['Conversa de proteção: parte da carteira em ativos globais, pós-fixados e prazos curtos.', 'Para horizonte longo, taxas maiores em IPCA+ longo podem ser oportunidade de entrada (avaliar suitability).'],
      },
      good: {
        ativos: [A('Juros futuros longos (DI)', 'down'), A('Dólar', 'down'), A('Bolsa doméstica', 'up'), A('Prefixados/IPCA+ longos', 'up')],
        impacto: ['Melhora fiscal reduz o prêmio de risco: tende a favorecer bolsa, juros longos menores e real mais forte.'],
        valor: ['Argumento para reduzir defensivismo excessivo em clientes que fugiram do risco-Brasil.'],
      },
      flat: {
        ativos: [A('Juros futuros longos e dólar', 'watch')],
        impacto: ['Tema fiscal: o mercado reage ao desfecho (aprovação, regra, números), não só à manchete.'],
        valor: ['Acompanhar o desfecho antes de reposicionar; deixar um comentário pronto para os clientes.'],
      },
    },
  },
  {
    id: 'tributacao', tema: 'Tributação de investimentos', weight: 7,
    re: /imposto de renda|(?<![a-z])ir(?![a-z]) (sobre|de|para)|(?<![a-z])iof(?![a-z])|reforma tributaria|isencao|tributacao|come-?cotas|(?<![a-z])lci(?![a-z])|(?<![a-z])lca(?![a-z])|debentures incentivadas|taxacao|receita federal|marco legal dos fundos|medida provisoria/,
    out: {
      flat: {
        ativos: [A('Isentos (LCI/LCA/CRI/CRA/debêntures incentivadas)', 'watch'), A('Dividendos e JCP', 'watch'), A('Fundos (come-cotas)', 'watch')],
        impacto: ['Mudanças tributárias alteram o retorno líquido e a competitividade entre produtos (isentos vs. tributáveis, fundos vs. ativos diretos).'],
        valor: ['Simular o impacto líquido por perfil de cliente e avisar de forma proativa antes da vigência: alto valor percebido em planejamento tributário.', 'Checar a norma original e os prazos de vigência.'],
      },
    },
  },
  {
    id: 'cambio', tema: 'Câmbio (dólar)', weight: 4,
    re: /dolar|cambio|(?<![a-z])usd(?![a-z])/,
    out: {
      up: {
        ativos: [A('Ativos dolarizados / dólar', 'up', 'Proteção'), A('Exportadoras', 'up'), A('Importadoras e empresas endividadas em dólar', 'down'), A('Inflação', 'up', 'Pressão')],
        impacto: ['Dólar mais forte favorece exportadoras e quem tem ativos em moeda forte; pressiona inflação e empresas com dívida em dólar.'],
        valor: ['Revisitar hedge e parcela internacional; reforçar que dólar é diversificação, não market timing.'],
      },
      down: {
        ativos: [A('Importadoras e varejo', 'up'), A('Inflação', 'down', 'Alívio'), A('Exportadoras', 'down'), A('Ativos dolarizados (em reais)', 'down')],
        impacto: ['Dólar mais fraco alivia inflação e custos e favorece importadoras, mas reduz o retorno em reais de ativos dolarizados.'],
        valor: ['Dólar mais barato pode ser janela para aportes graduais no exterior para clientes que querem diversificar.'],
      },
      flat: {
        ativos: [A('Dólar / hedge', 'watch')],
        impacto: ['Câmbio mexe com inflação, exportadoras e a parcela internacional das carteiras.'],
        valor: ['Verificar clientes com exposição desbalanceada em moeda.'],
      },
    },
  },
  {
    id: 'petroleo', tema: 'Petróleo e energia', weight: 5,
    re: /petroleo|brent|(?<![a-z])wti(?![a-z])|opep|opec|petrobras|petr4|(?<![a-z])oil(?![a-z])|crude|gasolina|diesel|prio3|(?<![a-z])aie(?![a-z])/,
    out: {
      up: {
        ativos: [A('Petrolíferas (Petrobras, PRIO etc.)', 'up'), A('Aéreas e transportes', 'down', 'Custo de combustível'), A('Inflação', 'up', 'Combustíveis')],
        impacto: ['Petróleo em alta favorece petrolíferas e dividendos, mas pressiona inflação e empresas intensivas em combustível.'],
        valor: ['Lembrar clientes de renda do papel dos dividendos da Petrobras e do risco de política de preços/governança.'],
      },
      down: {
        ativos: [A('Petrolíferas', 'down'), A('Aéreas e transportes', 'up'), A('Inflação', 'down', 'Alívio')],
        impacto: ['Petróleo em queda pesa nas petrolíferas e nos dividendos, mas alivia inflação e custos.'],
        valor: ['Checar concentração dos clientes em petrolíferas, principalmente os de renda.'],
      },
      flat: {
        ativos: [A('Petrolíferas / inflação', 'watch')],
        impacto: ['Petróleo influencia petrolíferas, inflação e dólar; efeito depende do movimento de preços que a notícia provoca.'],
        valor: ['Acompanhar o Brent ao longo do dia antes de comentar com clientes.'],
      },
    },
  },
  {
    id: 'commodities', tema: 'Commodities (minério, agro)', weight: 3,
    re: /minerio|iron ore|vale3|(?<![a-z])soja(?![a-z])|(?<![a-z])milho(?![a-z])|cafe (arabica|conilon)|saca de cafe|preco do cafe|boi gordo|commodit|cobre|copper|safra|fertilizant/,
    out: {
      up: { ativos: [A('Mineradoras e agro', 'up'), A('Real (via fluxo comercial)', 'up')], impacto: ['Commodities em alta favorecem mineradoras, agro e a balança comercial.'], valor: ['Conferir exposição dos clientes a Vale/agro e a concentração em um único setor.'] },
      down: { ativos: [A('Mineradoras e agro', 'down')], impacto: ['Commodities em queda pesam em mineradoras, agro e podem pressionar o real.'], valor: ['Revisar concentração setorial; evitar decisão por impulso em quedas curtas.'] },
      flat: { ativos: [A('Mineradoras e agro', 'watch')], impacto: ['Commodities movem receitas e dividendos de setores relevantes do Ibovespa.'], valor: ['Incluir no relatório semanal.'] },
    },
  },
  {
    id: 'china', tema: 'China', weight: 4,
    re: /china|chines|pequim|beijing|xi jinping|yuan|evergrande/,
    out: {
      up: { ativos: [A('Commodities (minério, cobre)', 'up'), A('Emergentes', 'up')], impacto: ['Sinais positivos da China costumam apoiar commodities e emergentes.'], valor: ['Revisitar teses de commodities e de mercados emergentes com perfis arrojados.'] },
      down: { ativos: [A('Commodities (minério, cobre)', 'down'), A('Emergentes', 'down')], impacto: ['Fraqueza da China pesa em commodities, em Vale e em emergentes.'], valor: ['Checar concentração em exportadoras de commodities.'] },
      flat: { ativos: [A('Commodities e emergentes', 'watch')], impacto: ['A China é o principal comprador das commodities brasileiras: política e dados importam.'], valor: ['Monitorar; incluir no relatório macro.'] },
    },
  },
  {
    id: 'tarifas', tema: 'Tarifas e comércio', weight: 5,
    re: /tarifa|tariff|trade war|guerra comercial|acordo comercial|trade deal|sancoes|sanctions/,
    pick: (t) => (/acordo|deal|suspende|reduz|trégua|tregua|alivio|isenta|recua|ease|pause|relief/.test(t) ? 'relief' : 'stress'),
    out: {
      stress: {
        ativos: [A('Volatilidade / VIX', 'up'), A('Exportadores atingidos', 'down'), A('Dólar', 'up', 'Risk-off'), A('Inflação global', 'up')],
        impacto: ['Tarifas elevam custos e incerteza, com risco de inflação e volatilidade; o efeito setorial depende do alvo e da alíquota.'],
        valor: ['Mapear clientes concentrados em setores atingidos e comunicar de forma proativa que volatilidade de curto prazo não muda a tese de longo prazo.'],
      },
      relief: {
        ativos: [A('Exportadores', 'up'), A('Bolsas globais', 'up'), A('Dólar', 'down')],
        impacto: ['Alívio comercial reduz a incerteza e favorece exportadores e bolsas.'],
        valor: ['Boa hora para retomar a conversa sobre risco com perfis que reduziram exposição.'],
      },
    },
  },
  {
    id: 'conflito', tema: 'Conflitos e risco geopolítico', weight: 5,
    re: /guerra|(?<![a-z])war(?![a-z])|conflito|ataque|missil|(?<![a-z])ira(?![a-z])|iran|israel|gaza|hamas|ucrania|ukraine|russia|putin|taiwan|oriente medio|middle east|otan|nato|embargo|cessar-fogo|ceasefire|tregua|groenlandia|greenland/,
    pick: (t) => (/cessar-fogo|ceasefire|tregua|acordo de paz|peace|truce|negocia\w+ de paz/.test(t) ? 'relief' : 'stress'),
    out: {
      stress: {
        ativos: [A('Ouro', 'up', 'Refúgio'), A('Petróleo', 'up', 'Risco de oferta'), A('Dólar', 'up'), A('Bolsas', 'down', 'Aversão a risco')],
        impacto: ['Escaladas geopolíticas geram aversão a risco no curto prazo; os efeitos duradouros dependem do impacto na energia e na inflação.'],
        valor: ['Evitar decisões por impulso: preparar nota rápida aos clientes lembrando horizonte e diversificação.', 'Verificar quem tem concentração em risco e se há espaço para ouro/dólar como diversificador.'],
      },
      relief: {
        ativos: [A('Bolsas', 'up'), A('Petróleo', 'down'), A('Ouro', 'down'), A('Dólar', 'down')],
        impacto: ['Distensão reduz o prêmio de risco: bolsas sobem e refúgios perdem força.'],
        valor: ['Janela para retomar posições de risco com clientes que estavam defensivos.'],
      },
    },
  },
  {
    id: 'eleicoes', tema: 'Eleições e política', weight: 6,
    re: /eleicao|eleicoes|election|segundo turno|datafolha|quaest|debate|candidato|lula|bolsonaro|tarcisio|urnas|campanha|planalto/,
    out: {
      flat: {
        ativos: [A('Ibovespa e ações domésticas', 'watch', 'Sensíveis ao cenário fiscal do vencedor'), A('Dólar e DI longo', 'watch'), A('Estatais (Petrobras, BB, Eletrobras, Sabesp)', 'watch')],
        impacto: ['Eleição aumenta a volatilidade: o mercado precifica a probabilidade de cada cenário fiscal/regulatório e pesquisas movem prêmio de risco (juros longos, dólar, estatais).'],
        valor: ['Ter um roteiro de comunicação para o dia seguinte ao resultado.', 'Mapear clientes concentrados em estatais/prefixados longos; evitar mudanças táticas baseadas só em pesquisas.'],
      },
    },
  },
  {
    id: 'bolsa_br', tema: 'Bolsa brasileira', weight: 3,
    re: /ibovespa|ibov(?![a-z])|(?<![a-z])b3(?![a-z])|small caps|pregao/,
    out: {
      up: { ativos: [A('Ibovespa', 'up')], impacto: ['Bolsa em alta melhora o humor e o patrimônio dos clientes de renda variável.'], valor: ['Usar o movimento para reforçar disciplina de rebalanceamento (realizar parcial em máximas, dentro da política de cada perfil).'] },
      down: { ativos: [A('Ibovespa', 'down')], impacto: ['Queda da bolsa aumenta a ansiedade dos clientes e testa a aderência ao perfil de risco.'], valor: ['Contato proativo com clientes de renda variável: contexto, horizonte e plano de aportes antes que eles liguem.'] },
      flat: { ativos: [A('Ibovespa', 'watch')], impacto: ['Movimento de mercado: contexto para a conversa com clientes de renda variável.'], valor: ['Usar como gancho no relatório diário.'] },
    },
  },
  {
    id: 'bolsa_eua', tema: 'Bolsas globais e tecnologia', weight: 3,
    re: /wall street|s&p ?500|nasdaq|dow jones|nvidia|big tech|inteligencia artificial|(?<![a-z])stocks(?![a-z])|equities|magnificent seven|ivvb11|bdr/,
    out: {
      up: { ativos: [A('Bolsas dos EUA / BDRs / ETFs globais', 'up')], impacto: ['Bolsas globais em alta beneficiam quem tem BDRs e ETFs internacionais.'], valor: ['Checar concentração em poucas big techs entre os clientes com carteira internacional.'] },
      down: { ativos: [A('Bolsas dos EUA / BDRs / ETFs globais', 'down')], impacto: ['Queda em Wall Street afeta BDRs/ETFs e tende a contagiar o Ibovespa.'], valor: ['Preparar contexto para clientes com forte exposição internacional.'] },
      flat: { ativos: [A('Bolsas globais', 'watch')], impacto: ['Wall Street dita o apetite global a risco.'], valor: ['Incluir no resumo diário.'] },
    },
  },
  {
    id: 'fiis', tema: 'Fundos imobiliários', weight: 4,
    re: /(?<![a-z])fiis?(?![a-z])|fundos? imobiliari\w*|ifix|fiagro/,
    out: {
      up: { ativos: [A('FIIs / IFIX', 'up')], impacto: ['FIIs em alta: a sensibilidade à curva de juros é alta — tijolo sofre com juros altos, papel se beneficia de CDI/IPCA altos.'], valor: ['Revisar a carteira de FIIs dos clientes por segmento (papel vs. tijolo), vacância e dividend yield vs. NTN-B.'] },
      down: { ativos: [A('FIIs / IFIX', 'down')], impacto: ['FIIs em queda: pode ser reflexo de juros longos mais altos; avaliar se há oportunidade de rotação entre segmentos.'], valor: ['Contato com clientes de renda mensal; mostrar o que é movimento de preço e o que é mudança de renda (dividendos).'] },
      flat: { ativos: [A('FIIs / IFIX', 'watch')], impacto: ['Tema de fundos imobiliários, importante para clientes de renda mensal.'], valor: ['Checar fundos citados nas carteiras dos clientes.'] },
    },
  },
  {
    id: 'renda_fixa', tema: 'Renda fixa e crédito privado', weight: 4,
    re: /tesouro direto|tesouro selic|ipca\+|(?<![a-z])cdb(?![a-z])|renda fixa|debentures?|(?<![a-z])cri(?![a-z])|(?<![a-z])cra(?![a-z])|credito privado|poupanca|(?<![a-z])cdi(?![a-z])|ntn-?b|fgc/,
    out: {
      flat: {
        ativos: [A('Renda fixa (prefixados, IPCA+, crédito privado)', 'watch')],
        impacto: ['Taxas de renda fixa definem o custo de oportunidade de todos os outros ativos.'],
        valor: ['Comparar as taxas atuais com a média da carteira do cliente e propor reinvestimento de vencimentos.', 'Em crédito privado, checar rating, concentração por emissor e limite do FGC.'],
      },
    },
  },
  {
    id: 'resultados', tema: 'Resultados de empresas', weight: 3,
    re: /balanco|resultado do (1|2|3|4|primeiro|segundo|terceiro|quarto)|trimestre|lucro|prejuizo|ebitda|guidance|receita liquida|earnings|profit|revenue/,
    out: {
      up: { ativos: [A('Ação da empresa e peers', 'up')], impacto: ['Resultado forte reprecifica a ação e o setor.'], valor: ['Ver quais clientes têm o papel (e os peers) e mandar uma leitura curta do resultado.'] },
      down: { ativos: [A('Ação da empresa e peers', 'down')], impacto: ['Resultado fraco pressiona a ação e pode contaminar o setor.'], valor: ['Contato proativo com clientes que têm o papel: reavaliar tese e tamanho de posição.'] },
      flat: { ativos: [A('Ação da empresa', 'watch')], impacto: ['Resultado/balanço: gatilho para contato com clientes que têm o papel.'], valor: ['Preparar uma nota curta com a leitura do resultado.'] },
    },
  },
  {
    id: 'proventos', tema: 'Dividendos e proventos', weight: 3,
    re: /dividendos?|(?<![a-z])jcp(?![a-z])|juros sobre capital|recompra|buyback|bonificacao|proventos/,
    out: {
      flat: { ativos: [A('Ações pagadoras de dividendos', 'watch')], impacto: ['Proventos geram renda e caixa para reinvestimento; regras de tributação podem mudar o líquido.'], valor: ['Janela de reinvestimento: avisar clientes de renda sobre datas-com/pagamento e conferir tributação vigente.'] },
    },
  },
  {
    id: 'ofertas_ma', tema: 'Ofertas, IPOs e M&A', weight: 3,
    re: /(?<![a-z])ipo(?![a-z])|follow-on|oferta (publica|restrita|de acoes)|fusao|aquisicao|m&a|(?<![a-z])opa(?![a-z])|venda de participacao/,
    out: {
      flat: { ativos: [A('Emissor e setor da operação', 'watch')], impacto: ['Ofertas e M&A criam oportunidades de alocação (mercado primário) e reprecificam ativos.'], valor: ['Avaliar se a oferta cabe no suitability de algum cliente; acompanhar prêmio de OPA para acionistas.'] },
    },
  },
  {
    id: 'cripto', tema: 'Criptoativos', weight: 3,
    re: /bitcoin|cripto|crypto|ethereum|stablecoin/,
    out: {
      up: { ativos: [A('Criptoativos', 'up')], impacto: ['Cripto em alta aumenta a pergunta dos clientes por exposição, com volatilidade elevada.'], valor: ['Se pedirem exposição, tratar como satélite pequeno dentro da política de risco, com enquadramento regulatório claro.'] },
      down: { ativos: [A('Criptoativos', 'down')], impacto: ['Cripto em queda testa a tolerância ao risco de quem entrou tarde.'], valor: ['Contato com clientes expostos: reforçar tamanho de posição e horizonte.'] },
      flat: { ativos: [A('Criptoativos', 'watch')], impacto: ['Tema cripto: regulação e fluxo institucional importam.'], valor: ['Guardar para o relatório semanal.'] },
    },
  },
  {
    id: 'regulacao', tema: 'Regulação do mercado', weight: 6,
    re: /(?<![a-z])cvm(?![a-z])|anbima|resolucao|regulament\w+|open finance|(?<![a-z])drex(?![a-z])|conselho monetario|(?<![a-z])cmn(?![a-z])|marco legal|suitability|assessor(es)? de investimentos?|taxa de administracao|susep|previc|regulacao/,
    out: {
      flat: { ativos: [A('Produtos e distribuição', 'watch')], impacto: ['Mudanças regulatórias impactam diretamente a prática do assessor (distribuição, suitability, produtos e remuneração).'], valor: ['Ler a norma/comunicado original, avaliar impacto nos processos de onboarding/suitability e compartilhar com o time/compliance.'] },
    },
  },
  {
    id: 'credito_bancos', tema: 'Crédito e bancos', weight: 4,
    re: /inadimplencia|rotativo|consignado|spread bancario|recuperacao judicial|falencia|liquidacao extrajudicial|calote|(?<![a-z])default(?![a-z])|banco master|itau|bradesco|santander|nubank|btg pactual/,
    pick: (t) => (/liquidacao|falencia|recuperacao judicial|calote|default|rombo|fraude/.test(t) ? 'stress' : 'flat'),
    out: {
      stress: { ativos: [A('Crédito privado do emissor citado', 'down'), A('Ações do setor', 'down')], impacto: ['Eventos de crédito afetam o emissor e podem contaminar o crédito privado do setor.'], valor: ['Checar na hora quais clientes têm exposição (debêntures, CRIs, CDBs) e o limite do FGC.'] },
      flat: { ativos: [A('Bancos e crédito privado', 'watch')], impacto: ['A saúde do crédito é termômetro de risco para bancos e para crédito privado.'], valor: ['Revisar concentração em crédito privado e liquidez.'] },
    },
  },
  {
    id: 'ouro', tema: 'Ouro', weight: 3,
    re: /(?<![a-z])ouro(?![a-z])|(?<![a-z])gold(?![a-z])|bullion/,
    out: {
      up: { ativos: [A('Ouro', 'up', 'Refúgio / dólar fraco / juros reais menores')], impacto: ['Ouro em alta costuma refletir aversão a risco ou dólar/juros reais menores.'], valor: ['Boa hora para explicar o papel do ouro como diversificador, sem perseguir preço.'] },
      down: { ativos: [A('Ouro', 'down')], impacto: ['Ouro em queda sugere apetite a risco maior ou juros reais mais altos.'], valor: ['Revisar a pequena fatia de proteção dos clientes, sem decisões por impulso.'] },
      flat: { ativos: [A('Ouro', 'watch')], impacto: ['Ouro é termômetro de aversão a risco.'], valor: ['Incluir no resumo diário.'] },
    },
  },
  {
    id: 'previdencia', tema: 'Previdência e planejamento', weight: 4,
    re: /previdencia|(?<![a-z])pgbl(?![a-z])|(?<![a-z])vgbl(?![a-z])|aposentadoria|(?<![a-z])inss(?![a-z])|fundos de pensao|sucessao|holding familiar|herança|heranca/,
    out: {
      flat: { ativos: [A('Previdência privada (PGBL/VGBL)', 'watch')], impacto: ['Temas de previdência e sucessão alimentam o planejamento de longo prazo dos clientes.'], valor: ['Reabrir conversa de planejamento (aposentadoria/sucessão) usando a notícia como gancho consultivo.'] },
    },
  },
];

const DEFAULT = {
  tema: 'Contexto de mercado',
  ativos: [],
  impacto: ['Notícia de contexto: sem impacto direto claro sobre carteiras.'],
  valor: ['Guardar como pauta para o relatório semanal.'],
};

/**
 * @param {{title:string, summary?:string, categories?:string[]}} item
 * @returns {null | {score:number, temas:string[], leitura:string, ativos:any[], impactoClientes:string[], comoGerarValor:string[], regras:string[]}}
 */
export function analyze(item) {
  const head = norm(`${item.title} ${(item.categories || []).join(' ')}`);
  const body = norm(item.summary || '');
  const tn = tone(item.title);
  const hits = [];

  for (const r of RULES) {
    let w = 0;
    if (r.re.test(head)) w = r.weight;
    else if (body && r.re.test(body)) w = r.weight * 0.5;
    if (!w) continue;
    let key = r.pick ? r.pick(norm(item.title)) : tn.key;
    if (r.invertWhen && r.invertWhen.test(head) && (key === 'up' || key === 'down')) key = key === 'up' ? 'down' : 'up';
    if (!r.out[key]) key = r.out.flat ? 'flat' : Object.keys(r.out)[0];
    hits.push({ r, key, w });
  }
  if (!hits.length) return null;

  hits.sort((a, b) => b.w - a.w);
  const top = hits.slice(0, 3);
  const ativos = [];
  const seen = new Set();
  for (const h of top) for (const a of h.r.out[h.key].ativos) {
    const k = a.classe + a.dir;
    if (!seen.has(k)) { seen.add(k); ativos.push(a); }
  }
  const dirWord = { up: 'alta/aumento', down: 'queda/redução', flat: null, stress: 'estresse/risco', relief: 'alívio', bad: 'deterioração', good: 'melhora' };
  const first = top[0];
  const leitura = dirWord[first.key]
    ? `Tom detectado no título: ${dirWord[first.key]}${tn.word && (first.key === 'up' || first.key === 'down') ? ` ("${tn.word}")` : ''}. ${first.key === 'flat' ? '' : 'Confirme na matéria.'}`.trim()
    : FLAT_NOTE;

  return {
    // regra principal pesa cheio; as secundárias 40% (evita inflar prioridade só por acumular temas)
    score: Math.round((top[0].w + 0.4 * top.slice(1).reduce((s, h) => s + h.w, 0)) * 10) / 10,
    temas: [...new Set(top.map((h) => h.r.tema))],
    leitura,
    ativos,
    impactoClientes: [...new Set(top.flatMap((h) => h.r.out[h.key].impacto))],
    comoGerarValor: [...new Set(top.flatMap((h) => h.r.out[h.key].valor))],
    regras: top.map((h) => h.r.id),
  };
}

export { DEFAULT as GENERIC_ANALYSIS };

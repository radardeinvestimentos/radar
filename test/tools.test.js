import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { summarizeRows, focusUrl, fetchFocus } from '../src/focus.js';
import { buildAgenda } from '../src/agenda.js';
import { buildTriggers, buildSazonais } from '../src/triggers.js';
import { buildContent, compactForWeek, mergeWeek, PAUTA } from '../src/content.js';
import { analyze } from '../src/impact.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const agendaCfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'agenda.json'), 'utf8'));
const NOW = new Date('2026-10-15T15:00:00Z'); // quinta-feira 15/10/2026, 12h em Brasília

test('Focus: resumo, variação semanal e URL', () => {
  const rows = [
    { Data: '2026-10-12', Mediana: 4.8, Media: 4.85, Minimo: 4.1, Maximo: 5.5, numeroRespondentes: 120 },
    { Data: '2026-10-09', Mediana: 4.75 },
    { Data: '2026-10-05', Mediana: 4.6 },
    { Data: '2026-10-02', Mediana: 4.5 },
  ];
  const s = summarizeRows(rows, { indicador: 'IPCA', ano: 2026 });
  assert.equal(s.mediana, 4.8);
  assert.equal(s.anterior.data, '2026-10-05'); // primeira linha com pelo menos 7 dias de diferença
  assert.equal(s.variacao, 0.2);
  assert.equal(summarizeRows([], { indicador: 'IPCA', ano: 2026 }), null);
  const u = focusUrl('Câmbio', 2027);
  assert.ok(u.includes('%24') === false && u.includes('$filter=') && u.includes('C%C3%A2mbio'));
});

test('Focus: falha total vira ok:false sem lançar erro', async () => {
  const r = await fetchFocus({ fetchJson: async () => { throw new Error('HTTP 500'); }, now: NOW });
  assert.equal(r.ok, false);
  assert.match(r.erro, /HTTP 500/);
});

test('Agenda: janelas, status, recorrentes e linha do Focus', async () => {
  const focus = await fetchFocus({
    now: NOW,
    fetchJson: async (url) => ({ value: [{ Data: '2026-10-12', Mediana: 14.25 }, { Data: '2026-10-05', Mediana: 14.5 }] }),
  });
  const ag = buildAgenda(agendaCfg, NOW, focus);
  assert.equal(ag.hoje, '2026-10-15');
  const by = (tipo, data) => ag.eventos.find((e) => e.tipo === tipo && (!data || e.data === data));
  const eleicao = by('eleicao');
  assert.equal(eleicao.data, '2026-10-25');
  assert.equal(eleicao.status, 'em 10 dias');
  assert.equal(eleicao.janela, 'proxima');
  assert.equal(by('fomc').janela, 'depois');
  const copom = by('copom', '2026-11-04');
  assert.equal(copom.quando, '03/11 e 04/11');
  assert.ok(copom.antes.some((t) => t.startsWith('Focus: Selic no fim de 2026: 14,25')), copom.antes.join(' | '));
  assert.ok(copom.antes.some((t) => t.includes('-0,25 p.p.')));
  const focos = ag.eventos.filter((e) => e.tipo === 'focus');
  assert.ok(focos.length >= 4 && focos.every((e) => new Date(`${e.data}T00:00:00Z`).getUTCDay() === 1), 'toda segunda-feira');
  assert.ok(ag.eventos.every((e) => e.antes.length && e.depois.length));
  const ipcaOut = by('ipca', '2026-11-12');
  assert.equal(ipcaOut.confianca, 'confirmado');
  assert.ok(ag.eventos.some((e) => e.tipo === 'balancos' && e.periodo));
});

const item = (id, title, extra = {}) => ({
  id, cluster: `c${id}`, title, summary: '', categories: [], source: 'x', sourceName: 'Fonte', region: 'BR', publishedAt: '2026-10-15T14:00:00Z', ...extra,
});

test('Gatilhos: detecta eventos e separa prospecção de carteira', () => {
  const items = [
    item(1, 'Grupo X vende controle da empresa Y para fundo de private equity'),
    item(2, 'Empresa Z anuncia PDV e corte de vagas na fábrica de Curitiba'),
    item(3, 'Debenturista da empresa W teme calote após pedido de recuperação judicial'),
    item(4, 'Ibovespa despenca 3% e tem pior dia do mês'),
    item(5, 'Governo estuda taxação de LCI e LCA em medida provisória'),
    item(6, 'Copom mantém Selic em 14,25% ao ano'),
    item(7, 'Lula e adversário se enfrentam em debate', { summary: 'Segundo turno em 25 de outubro.' }),
    item(8, 'Receita de bolo de cenoura fica pronta em 20 minutos'),
    item(9, 'Previsão do tempo para o fim de semana em Curitiba'),
  ];
  const t = buildTriggers(items, NOW);
  const ids = t.gatilhos.map((g) => g.id);
  for (const esperado of ['venda_empresa', 'demissoes_pdv', 'credito_estresse', 'turbulencia', 'tributaria', 'decisao_juros', 'eleicao']) {
    assert.ok(ids.includes(esperado), `faltou ${esperado}; veio ${ids}`);
  }
  assert.equal(t.gatilhos.find((g) => g.id === 'venda_empresa').tipo, 'prospect');
  assert.equal(t.gatilhos.find((g) => g.id === 'turbulencia').tipo, 'carteira');
  assert.ok(t.gatilhos[0].urgencia === 'alta', 'urgência alta primeiro');
  assert.ok(!t.gatilhos.some((g) => g.itens.some((i) => /bolo|tempo/.test(i.title))), 'ruído não vira gatilho');
  assert.ok(t.gatilhos.every((g) => g.gancho && g.cuidados && g.publico && g.porque));
});

test('Gatilhos de calendário: ativos, em breve e fora de época', () => {
  const s = Object.fromEntries(buildSazonais(NOW).map((x) => [x.id, x]));
  assert.equal(s.pgbl_fim_ano.ativa, true);
  assert.equal(s.pgbl_fim_ano.quando, 'até 31/12');
  assert.equal(s.eleicao_2026.ativa, true);
  assert.equal(s.decimo_terceiro.ativa, false);
  assert.equal(s.decimo_terceiro.quando, 'começa em 01/11');
  assert.equal(s.balancos.ativa, false);
  assert.equal(s.balancos.quando, 'começa em 20/10');
  assert.ok(!s.virada_ano, 'virada do ano começa em mais de 21 dias');
  assert.ok(!s.ir_declaracao && !s.plr_temporada);
  const jan = Object.fromEntries(buildSazonais(new Date('2027-01-10T15:00:00Z')).map((x) => [x.id, x]));
  assert.equal(jan.virada_ano.ativa, true, 'janela que cruza o ano');
  assert.ok(!jan.eleicao_2026, 'evento de 2026 não aparece em 2027');
});

function itemAnalisado(id, title, extra = {}) {
  const base = item(id, title, { relevant: true, priorityScore: 10, priority: 'alta', coverage: 2, ...extra });
  base.analysis = analyze(base);
  return base;
}

test('Conteúdo: pauta, plano, newsletter e retenção de 8 dias', () => {
  const items = [
    itemAnalisado(1, 'Copom mantém Selic e sinaliza cautela com inflação'),
    itemAnalisado(2, 'Dólar fecha em alta com tensão fiscal'),
    itemAnalisado(3, 'IFIX recua e FIIs de tijolo pressionados por juros'),
    itemAnalisado(4, 'Governo anuncia taxação de LCI e LCA'),
  ];
  const semana = mergeWeek([], compactForWeek(items), NOW);
  assert.ok(semana.length >= 3);
  const c = buildContent(semana, buildAgenda(agendaCfg, NOW, null), NOW);
  assert.ok(c.pauta.length >= 3 && c.pauta.every((p) => PAUTA[p.regra] && p.angulo && p.pergunta && p.fontes.length));
  assert.equal(c.plano[0].dia, 'Segunda');
  assert.ok(c.plano.length >= 2);
  assert.match(c.newsletter.markdown, /Olá, \[nome\]/);
  assert.match(c.newsletter.markdown, /não constitui recomendação/);
  assert.ok(c.newsletter.markdown.includes('## O que vem por aí'));
  assert.ok(!/Mapear clientes|comoGerarValor/.test(c.newsletter.markdown), 'newsletter não vaza texto interno do assessor');
  assert.ok(c.checklist.length >= 4);
  // retenção: item de 10 dias atrás sai
  const velho = { ...semana[0], id: 'velho', publishedAt: '2026-10-04T12:00:00Z' };
  const m = mergeWeek([velho], semana, NOW);
  assert.ok(!m.some((i) => i.id === 'velho'));
});

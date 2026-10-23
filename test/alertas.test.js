import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { parseYahooChart, parseTesouroJson, parseTesouroCsv, parseSgs, fetchCotacoes, fetchTesouro, tipoDoAtivo, tipoTesouro } from '../alertas/src/fontes.js';
import { avaliarVariacao, avaliarDesconto, avaliarTesouro, atualizarRefTesouro, avaliarMacro, montarResumo } from '../alertas/src/regras.js';
import { toastScript, encodePS, avisoNtfy, enviar } from '../alertas/src/canais.js';
import { executarCiclo, montarLista } from '../alertas/src/ciclo.js';
import { estadoVazio, mesclar, carregar, salvar } from '../alertas/src/estado.js';
import { sanitizar } from '../alertas/src/config-usuario.js';
import { semanaISO, brtParts } from '../alertas/src/util.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'alertas');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.padrao.json'), 'utf8'));
const ativos = JSON.parse(fs.readFileSync(path.join(ROOT, 'dados', 'ativos.json'), 'utf8'));

// 20/10/2026 (terça) 14:00 UTC = 11:00 em Brasília
const AGORA = new Date('2026-10-20T14:00:00Z');
const ts = (iso) => Math.floor(new Date(iso).getTime() / 1000);

function yahoo({ price = 90, prev = 100, high = 120, divs = {} } = {}) {
  return { chart: { result: [{
    meta: { regularMarketPrice: price, regularMarketTime: ts('2026-10-20T13:50:00Z'), chartPreviousClose: 50, fiftyTwoWeekHigh: high, fiftyTwoWeekLow: 70, currency: 'BRL' },
    timestamp: [ts('2026-10-16T20:00:00Z'), ts('2026-10-19T20:00:00Z'), ts('2026-10-20T13:50:00Z')],
    indicators: { quote: [{ close: [95, prev, price] }] },
    events: { dividends: divs },
  }] } };
}

test('Yahoo: usa o fechamento anterior da série (não o chartPreviousClose) e calcula yield 12m', () => {
  const c = parseYahooChart(yahoo({ price: 90, prev: 100, divs: { a: { date: ts('2026-09-15T00:00:00Z'), amount: 0.9 }, b: { date: ts('2024-01-01T00:00:00Z'), amount: 5 } } }), AGORA);
  assert.equal(c.prev, 100);
  assert.ok(Math.abs(c.diaPct - -10) < 1e-9);
  assert.equal(c.sessao, '2026-10-20');
  assert.equal(c.max52, 120);
  assert.ok(Math.abs(c.dy12 - 1) < 1e-9, 'só dividendos dos últimos 12 meses');
  assert.throws(() => parseYahooChart({ chart: { result: null, error: { description: 'Not Found' } } }), /Not Found/);
});

test('Classificação de ativos', () => {
  assert.equal(tipoDoAtivo('PETR4', cfg.fiis), 'acao');
  assert.equal(tipoDoAtivo('HGLG11', cfg.fiis), 'fii');
  assert.equal(tipoDoAtivo('BOVA11', cfg.fiis), 'etf');
  assert.equal(tipoDoAtivo('IBOV'), 'indice');
  assert.equal(tipoDoAtivo('USDBRL'), 'cambio');
  assert.equal(tipoTesouro('Tesouro IPCA+ com Juros Semestrais'), 'ipca_js');
  assert.equal(tipoTesouro('Tesouro Prefixado'), 'pre');
});

test('Variação forte: limite por tipo, direção e realerta só no próximo múltiplo', () => {
  const c = (d) => ({ price: 10, diaPct: d, sessao: '2026-10-20' });
  assert.equal(avaliarVariacao('PETR4', 'acao', c(2.9), cfg), null);
  const a = avaliarVariacao('PETR4', 'acao', c(-3.2), cfg);
  assert.equal(a.severidade, 'media');
  assert.match(a.titulo, /▼/);
  const b = avaliarVariacao('PETR4', 'acao', c(-6.5), cfg);
  assert.equal(b.severidade, 'alta');
  assert.notEqual(a.chave, b.chave);
  assert.equal(avaliarVariacao('PETR4', 'acao', c(-3.9), cfg).chave, a.chave, 'mesmo balde = mesma chave');
  assert.ok(avaliarVariacao('HGLG11', 'fii', c(2.1), cfg), 'FII usa 2%');
  assert.ok(avaliarVariacao('USDBRL', 'cambio', c(1.6), cfg));
  assert.equal(avaliarVariacao('IBOV', 'indice', c(1.9), cfg), null);
});

test('Desconto: máxima de 52 semanas e yield de FII contra CDI líquido', () => {
  const ctx = { cdi: 14.65, semana: '2026-W43' };
  assert.equal(avaliarDesconto('VALE3', 'acao', { price: 80, max52: 100, dy12: null }, cfg, ctx), null);
  const a = avaliarDesconto('VALE3', 'acao', { price: 70, max52: 100, dy12: null }, cfg, ctx);
  assert.match(a.titulo, /30,0%/);
  assert.match(a.corpo, /fundamentos/);
  assert.equal(avaliarDesconto('HGLG11', 'fii', { price: 100, max52: 105, dy12: 13 }, cfg, ctx), null, '5% pede 5% mínimo de desconto: 4,8% não vale');
  const f = avaliarDesconto('HGLG11', 'fii', { price: 90, max52: 100, dy12: 13 }, cfg, ctx);
  assert.ok(f, '10% de desconto + yield 13% ≥ CDI líquido 12,45%');
  assert.match(f.titulo, /yield/);
  assert.equal(avaliarDesconto('PETR4', 'acao', null, cfg, ctx), null);
  assert.equal(avaliarDesconto('IBOV', 'indice', { price: 1, max52: 2 }, cfg, ctx), null);
});

const TES_JSON = { response: { TrsrBdTradgList: [
  { TrsrBd: { nm: 'Tesouro IPCA+ 2035', mtrtyDt: '2035-05-15T00:00:00', anulInvstmtRate: 7.62, untrInvstmtVal: 1900 } },
  { TrsrBd: { nm: 'Tesouro Prefixado 2029', mtrtyDt: '2029-01-01T00:00:00', anulInvstmtRate: 13.4 } },
  { TrsrBd: { nm: 'Tesouro Selic 2031', mtrtyDt: '2031-03-01T00:00:00', anulInvstmtRate: 0.0702 } },
  { TrsrBd: { nm: 'Tesouro Renda+ 2065', mtrtyDt: '2065-12-15T00:00:00', anulInvstmtRate: 0 } },
] } };

test('Tesouro: parser JSON, CSV e regras (piso semanal + movimento no dia)', () => {
  const t = parseTesouroJson(TES_JSON);
  assert.deepEqual(t.map((x) => x.tipo), ['ipca', 'pre', 'selic'], 'taxa zero (indisponível) sai, exceto Selic');
  const csv = '﻿Tipo Titulo;Data Vencimento;Data Base;Taxa Compra Manha;Taxa Venda Manha;PU Compra Manha\r\nTesouro IPCA+;15/05/2035;19/10/2026;7,40;7,50;1.850,10\r\nTesouro IPCA+;15/05/2035;20/10/2026;7,55;7,65;1.840,00\r\nTesouro Prefixado;01/01/2029;20/10/2026;13,90;14,00;700,5\r\n';
  const c = parseTesouroCsv(csv);
  assert.equal(c.base, '2026-10-20');
  assert.equal(c.titulos.length, 2);
  assert.equal(c.titulos[0].taxa, 7.55);
  assert.equal(c.titulos[0].pu, 1840);

  let refs = atualizarRefTesouro({}, t, '2026-10-19');
  const ipca19 = t.map((x) => ({ ...x }));
  refs = atualizarRefTesouro(refs, t.map((x) => (x.tipo === 'ipca' ? { ...x, taxa: 7.40 } : x)), '2026-10-19');
  const hoje = t; // IPCA+ em 7,62
  refs = atualizarRefTesouro(refs, hoje, '2026-10-20');
  assert.equal(refs['Tesouro IPCA+ 2035'].ref, 7.40);
  const al = avaliarTesouro(hoje, refs, cfg, { hoje: '2026-10-20', semana: '2026-W43' });
  assert.equal(al.filter((a) => /IPCA\+ 2035/.test(a.titulo)).length, 2, 'piso 7,5 e movimento 0,22 p.p.');
  assert.ok(al.some((a) => /▲ 0,22 p\.p\./.test(a.titulo)));
  assert.ok(!al.some((a) => /Prefixado/.test(a.titulo)), 'pré 13,4 < 14 e sem movimento');
  assert.equal(ipca19.length, 3);
});

test('Macro: só alerta quando a Selic muda; primeira leitura não alerta', () => {
  assert.deepEqual(avaliarMacro({ selic: { valor: 14.25 } }, {}), []);
  assert.deepEqual(avaliarMacro({ selic: { valor: 14.25 } }, { selic: 14.25 }), []);
  const a = avaliarMacro({ selic: { valor: 14 } }, { selic: 14.25 });
  assert.equal(a[0].severidade, 'alta');
  assert.match(a[0].titulo, /cai para 14,00/);
  assert.deepEqual(parseSgs([{ data: '19/10/2026', valor: '14.25' }]), { data: '2026-10-19', valor: 14.25 });
});

test('Resumo do dia', () => {
  const r = montarResumo({ IBOV: { price: 140000, diaPct: -1.2 }, PETR4: { diaPct: 2 }, VALE3: { diaPct: -3 }, ITUB4: { diaPct: 0.5 } }, [{ tipo: 'ipca', venc: '2035-05-15', taxa: 7.6 }], '2026-10-20');
  assert.match(r.corpo, /Ibovespa -1,20%/);
  assert.match(r.corpo, /Maiores altas: PETR4 \+2,00%/);
  assert.match(r.corpo, /IPCA \+ 7,60%/);
  assert.equal(montarResumo({}, [], 'x'), null);
});

test('Toast do Windows: XML escapado, aspas simples dobradas e UTF-16LE em base64', () => {
  const s = toastScript('PETR4 ▼ 3% <teste>', "D'Água & cia", 'http://127.0.0.1:4747/');
  assert.ok(s.includes('&lt;teste&gt;') && s.includes('&amp;'));
  assert.ok(s.includes("D&apos;Água"), 'aspa simples vira entidade XML (evita quebrar o literal do PowerShell)');
  assert.ok(s.includes('activationType="protocol"'));
  assert.equal(Buffer.from(encodePS('é'), 'base64').toString('utf16le'), 'é');
});

test('Canais: ntfy publica JSON; severidade mínima e fallback no console', async () => {
  let req;
  await avisoNtfy({ titulo: 'T', corpo: 'C', severidade: 'alta', tipo: 'variacao' }, { servidor: 'https://ntfy.sh/', topico: 'abc', fetchFn: async (u, o) => { req = { u, o }; return { ok: true }; } });
  assert.equal(req.u, 'https://ntfy.sh');
  const b = JSON.parse(req.o.body);
  assert.equal(b.topic, 'abc'); assert.equal(b.priority, 4); assert.match(b.message, /não é recomendação/);
  await assert.rejects(avisoNtfy({ titulo: 'T', corpo: 'C', severidade: 'alta', tipo: 'x' }, { servidor: 'https://ntfy.sh', topico: '' }));

  const chamadas = [];
  const c = mesclar(cfg, { canais: { windows: { ativo: true, severidadeMinima: 'media' }, ntfy: { ativo: true, topico: 'z', severidadeMinima: 'alta' } } });
  const deps = { desktop: async () => chamadas.push('desktop'), ntfy: async () => chamadas.push('ntfy'), console_: () => chamadas.push('console') };
  await enviar({ severidade: 'baixa', titulo: 'a', corpo: 'b' }, c, deps);
  await enviar({ severidade: 'media', titulo: 'a', corpo: 'b' }, c, deps);
  await enviar({ severidade: 'alta', titulo: 'a', corpo: 'b' }, c, deps);
  assert.deepEqual(chamadas, ['console', 'desktop', 'desktop', 'ntfy']);
  const falha = await enviar({ severidade: 'alta', titulo: 'a', corpo: 'b' }, c, { ...deps, desktop: async () => { throw new Error('sem powershell'); } });
  assert.deepEqual(falha.ok, ['ntfy']); assert.match(falha.erros[0], /sem powershell/);
});

test('Fontes: falha de um ativo não derruba os outros; brapi só com token', async () => {
  const fj = async (url) => {
    if (url.includes('PETR4')) return yahoo({ price: 96, prev: 100 });
    if (url.includes('ERRO3')) throw new Error('HTTP 404');
    throw new Error('HTTP 429');
  };
  const r = await fetchCotacoes(['PETR4', 'ERRO3', 'VALE3'], { fetchJson: fj, now: AGORA, pausaMs: 0 });
  assert.deepEqual(Object.keys(r.cotacoes), ['PETR4']);
  assert.equal(r.erros.length, 2);
  const br = await fetchCotacoes(['VALE3'], { now: AGORA, pausaMs: 0, brapiToken: 'tok', fetchJson: async (u) => {
    if (u.includes('brapi.dev')) return { results: [{ regularMarketPrice: 60, regularMarketChangePercent: -4, regularMarketPreviousClose: 62.5, fiftyTwoWeekHigh: 80 }] };
    throw new Error('HTTP 429');
  } });
  assert.equal(br.cotacoes.VALE3.price, 60);
  const tes = await fetchTesouro({ fetchJson: async () => { throw new Error('HTTP 403'); }, fetchText: async () => 'Tipo Titulo;Data Vencimento;Data Base;Taxa Compra Manha\n Tesouro Prefixado;01/01/2029;20/10/2026;13,9\n' });
  assert.match(tes.fonte, /Transparente/);
  await assert.rejects(fetchTesouro({ fetchJson: async () => { throw new Error('a'); }, fetchText: async () => { throw new Error('b'); } }), /a.*b/);
});

test('Lista monitorada: IBrX 50 + FIIs + ETFs + minha lista, sem duplicar nem aceitar lixo', () => {
  const l = montarLista(mesclar(cfg, { lista: { minhaLista: ['petr4', 'xyz', '<script>', 'WEGE3'] } }), ativos);
  assert.ok(l.includes('PETR4') && l.includes('HGLG11') && l.includes('BOVA11') && l.includes('WEGE3'));
  assert.equal(l.filter((x) => x === 'PETR4').length, 1);
  assert.ok(!l.includes('<SCRIPT>'));
  assert.ok(l.length >= 70 && l.length < 120, `tamanho ${l.length}`);
});

function fontesFalsas(sobre = {}) {
  return {
    fetchCotacoes: async () => ({ cotacoes: { PETR4: { price: 30, prev: 32, diaPct: -6.25, sessao: '2026-10-20', max52: 50, min52: 28, dy12: null }, IBOV: { price: 140000, prev: 140000, diaPct: 0.1, sessao: '2026-10-20', max52: 150000 } }, erros: ['XXXX3: HTTP 404'] }),
    fetchTesouro: async () => ({ titulos: parseTesouroJson(TES_JSON), fonte: 'teste' }),
    fetchMacro: async () => ({ selic: { data: '2026-10-19', valor: 14.25 }, cdi: { data: '2026-10-19', valor: 14.15 }, erros: [] }),
    ...sobre,
  };
}

test('Ciclo: dedupe entre ciclos, intervalos, horário de mercado e limite por hora', async () => {
  const enviados = [];
  const env = async (a) => { enviados.push(a); return { ok: ['desktop'], erros: [] }; };
  const estado = estadoVazio();
  const r1 = await executarCiclo({ cfg, estado, agora: AGORA, ativos, fontes: fontesFalsas(), enviar: env });
  assert.deepEqual(r1.consultou, ['cotacoes', 'tesouro', 'macro']);
  assert.ok(enviados.some((a) => a.ticker === 'PETR4' && a.tipo === 'variacao' && a.severidade === 'alta'));
  assert.ok(enviados.some((a) => a.tipo === 'desconto' && a.ticker === 'PETR4'), '40% abaixo da máxima');
  assert.ok(enviados.some((a) => a.tipo === 'tesouro'), 'IPCA+ 7,62 ≥ 7,5');
  assert.ok(!enviados.some((a) => a.tipo === 'macro'), 'primeira leitura da Selic só grava');
  assert.equal(estado.macro.selic, 14.25);
  assert.match(r1.erros.join(), /XXXX3/);
  const n1 = enviados.length;

  // 2 min depois: nada vencido
  const r2 = await executarCiclo({ cfg, estado, agora: new Date(AGORA.getTime() + 120000), ativos, fontes: fontesFalsas(), enviar: env });
  assert.deepEqual(r2.consultou, []);
  // 6 min depois: consulta cotações, mas o mesmo alerta não se repete
  const r3 = await executarCiclo({ cfg, estado, agora: new Date(AGORA.getTime() + 360000), ativos, fontes: fontesFalsas(), enviar: env });
  assert.deepEqual(r3.consultou, ['cotacoes']);
  assert.equal(enviados.length, n1);

  // Selic muda → alerta alta, 1h depois
  const r4 = await executarCiclo({ cfg, estado, agora: new Date(AGORA.getTime() + 3700000), ativos, enviar: env, forcar: true, fontes: fontesFalsas({ fetchMacro: async () => ({ selic: { valor: 14 }, cdi: { valor: 13.9 }, erros: [] }) }) });
  assert.ok(r4.enviados.some((a) => a.tipo === 'macro'));

  // fora do horário (sábado) e antes da abertura: não consulta
  const sab = await executarCiclo({ cfg, estado: estadoVazio(), agora: new Date('2026-10-17T14:00:00Z'), ativos, fontes: fontesFalsas(), enviar: env });
  assert.deepEqual(sab.consultou, []);
  const cedo = await executarCiclo({ cfg, estado: estadoVazio(), agora: new Date('2026-10-20T11:00:00Z'), ativos, fontes: fontesFalsas(), enviar: env }); // 08:00 BRT
  assert.deepEqual(cedo.consultou, []);

  // limite por hora
  const e2 = estadoVazio(); const baixo = mesclar(cfg, { maxAlertasPorHora: 1 });
  const r5 = await executarCiclo({ cfg: baixo, estado: e2, agora: AGORA, ativos, fontes: fontesFalsas(), enviar: env });
  assert.equal(r5.enviados.length, 1);
  assert.equal(r5.enviados[0].severidade, 'alta', 'o mais grave vai primeiro');
  assert.ok(r5.retidos.length >= 1);
  assert.ok(e2.historico.some((h) => h.retido));
});

test('Ciclo: resumo do fim do dia sai uma vez; falha total de cotação é sinalizada', async () => {
  const env = async () => ({ ok: [], erros: [] });
  const e = estadoVazio();
  const tarde = new Date('2026-10-20T21:25:00Z'); // 18:25 BRT
  const r = await executarCiclo({ cfg, estado: e, agora: tarde, ativos, fontes: fontesFalsas(), enviar: env, forcar: true, ignorarHorario: false });
  assert.ok(r.enviados.some((a) => a.tipo === 'resumo'), 'resumo às 18:20+');
  const r2 = await executarCiclo({ cfg, estado: e, agora: new Date(tarde.getTime() + 600000), ativos, fontes: fontesFalsas(), enviar: env, forcar: true });
  assert.ok(!r2.enviados.some((a) => a.tipo === 'resumo'));
  const e3 = estadoVazio();
  await executarCiclo({ cfg, estado: e3, agora: AGORA, ativos, enviar: env, fontes: fontesFalsas({ fetchCotacoes: async () => ({ cotacoes: {}, erros: ['PETR4: HTTP 429'] }) }) });
  assert.equal(e3.fonteCotacaoOk, false);
});

test('Config: mescla em profundidade, painel é sanitizado e estado persiste', () => {
  const m = mesclar(cfg, { variacao: { acao: 5 }, lista: { minhaLista: ['A'] } });
  assert.equal(m.variacao.acao, 5); assert.equal(m.variacao.fii, 2);
  const s = sanitizar({ variacao: { acao: '4,5', fii: 'abc', cambio: 999 }, lista: { minhaLista: ['petr4', 'rm -rf', 'vale3', 'vale3'] }, canais: { ntfy: { topico: 'ok_topico-1', servidor: 'http://evil.local' }, windows: { ativo: true } }, horario: { inicio: '9:5', fim: '18:00' }, __proto__: { x: 1 }, hack: 1 });
  assert.equal(s.variacao.acao, 4.5);
  assert.ok(!('fii' in s.variacao) && !('cambio' in s.variacao));
  assert.deepEqual(s.lista.minhaLista, ['PETR4', 'VALE3']);
  assert.equal(s.canais.ntfy.topico, 'ok_topico-1');
  assert.ok(!s.canais.ntfy.servidor, 'só https é aceito');
  assert.equal(s.horario.fim, '18:00'); assert.ok(!s.horario.inicio);
  assert.ok(!('hack' in s));
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'alerta-')), 'sub', 'estado.json');
  const e = estadoVazio(); e.vistos.a = 1; salvar(f, e);
  assert.equal(carregar(f).vistos.a, 1);
  assert.deepEqual(carregar('/nao/existe.json').historico, []);
});

test('Datas: semana ISO e fuso de Brasília', () => {
  assert.equal(semanaISO('2026-10-20'), '2026-W43');
  assert.equal(semanaISO('2027-01-01'), '2026-W53');
  assert.deepEqual(brtParts(new Date('2026-10-20T02:30:00Z')), { date: '2026-10-19', hhmm: '23:30', dow: 1, util: true });
});

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseFeed, parseHtmlLinks } from '../src/rss.js';
import { classify } from '../src/classify.js';
import { analyze, tone } from '../src/impact.js';
import * as fx from './fixtures.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('RSS: CDATA, entidades, categorias, datas e feed truncado', () => {
  const items = parseFeed(fx.moneytimes());
  assert.equal(items.length, 3, 'item quebrado no final deve ser ignorado');
  const a = parseFeed(fx.infomoney());
  assert.equal(a.length, 6);
  assert.match(a[0].title, /^Possível alta de juros pelo Fed/);
  assert.deepEqual(a[0].categories, ['Mercados', 'Federal Reserve', 'Juros']);
  assert.ok(!a[0].summary.includes('<') && a[0].summary.includes('–'), 'HTML removido e entidade decodificada');
  assert.ok(a[0].publishedAt.endsWith('Z'));
});

test('RSS: data ISO sem fuso respeita assumeTz; Atom e Google News', () => {
  const ex = parseFeed(fx.exame(), { assumeTz: '-03:00' });
  const diffMin = (Date.now() - Date.parse(ex[0].publishedAt)) / 60e3;
  assert.ok(Math.abs(diffMin - 50) < 2, `esperava ~50min, veio ${diffMin}`);
  const at = parseFeed(fx.atom());
  assert.equal(at[0].url, 'https://exemplo.com/dolar-cai');
  assert.deepEqual(at[0].categories, ['Câmbio']);
  const gn = parseFeed(fx.gnews(), { gnews: true });
  assert.equal(gn[0].title, 'Governo anuncia novo limite para gastos e mira superávit em 2027');
});

test('HTML fallback pega só manchetes de economia e ignora menus/outras editorias', () => {
  const l = parseHtmlLinks(fx.cnnHtml(), { url: 'https://www.cnnbrasil.com.br/economia/', hrefPattern: '^https://www\\.cnnbrasil\\.com\\.br/(economia|blogs)/', minDepth: 3 });
  assert.equal(l.length, 2);
  assert.ok(l.every((i) => i.url.startsWith('https://www.cnnbrasil.com.br/economia/')));
});

test('Classificação por tópico', () => {
  const c = (title, categories = [], summary = '') => classify({ title, categories, summary });
  assert.equal(c('Copom mantém Selic em 15%', ['Juros']).topic, 'monetaria');
  assert.equal(c('IFIX recua 0,94% e fecha pregão', ['FIIs', 'IFIX']).topic, 'fundos');
  assert.ok(c('FMI pede ajuste fiscal e alerta que mercados podem forçar governos a agir', ['Economia']).topics.includes('fiscal'));
  assert.ok(c('Petróleo: AIE vê retomada de oferta vulnerável com guerra no Irã').topics.includes('geopolitica'));
  assert.equal(c('Flávio Bolsonaro critica Pix para MEI anunciado por Lula', ['Brasil']).relevant, true);
  assert.equal(c('Mega-Sena acumulada: veja quanto rende o prêmio', ['Loterias', 'Taxa Selic']).relevant, false);
  assert.equal(c('Papa Leão XIV nomeia e transfere bispo no Brasil', ['Brasil']).relevant, false);
  assert.equal(c('Dólar fecha em queda com exterior favorável', ['Câmbio']).topic, 'cambio');
});

test('Tom e análise de impacto', () => {
  assert.equal(tone('Selic sobe para 15,25%').key, 'up');
  assert.equal(tone('Copom corta Selic').key, 'down');
  assert.equal(tone('Ibovespa volta do feriado de mau humor, cai mais de 1% e vê MGLU3 derreterem').key, 'down');
  assert.equal(tone('Copom deve manter Selic').key, 'flat');

  const up = analyze({ title: 'Copom eleva Selic em 0,25 ponto' });
  assert.ok(up.ativos.some((a) => a.classe.startsWith('Pós-fixados') && a.dir === 'up'));
  const down = analyze({ title: 'Copom corta Selic em 0,50 ponto' });
  assert.ok(down.ativos.some((a) => a.classe.startsWith('Pós-fixados') && a.dir === 'down'));
  const flat = analyze({ title: 'Copom deve manter Selic e sinalizar cautela' });
  assert.ok(flat.leitura.length > 0 && flat.ativos[0].dir === 'watch');

  // desemprego subindo = atividade fraca (inversão)
  const un = analyze({ title: 'Desemprego sobe e atinge 6,1% nos EUA' });
  assert.ok(un.ativos.some((a) => a.classe.startsWith('Ações cíclicas') && a.dir === 'down'));

  const fiscal = analyze({ title: 'FMI pede ajuste fiscal e alerta que mercados podem forçar governos a agir' });
  assert.ok(fiscal.ativos.some((a) => a.classe === 'Dólar' && a.dir === 'up'));
  const tarifaRelief = analyze({ title: 'EUA e China fecham acordo e reduzem tarifas' });
  assert.ok(tarifaRelief.ativos.some((a) => a.classe === 'Bolsas globais' && a.dir === 'up'));
  assert.equal(analyze({ title: 'Banana madura é boa para o café da manhã' }), null);
});

function serve() {
  const routes = {
    '/infomoney.xml': fx.infomoney, '/moneytimes.xml': fx.moneytimes, '/exame.xml': fx.exame,
    '/gnews.xml': fx.gnews, '/cnn.html': fx.cnnHtml, '/atom.xml': fx.atom,
  };
  const srv = http.createServer((req, res) => {
    const f = routes[req.url];
    if (!f) { res.writeHead(404); return res.end('nope'); }
    res.writeHead(200, { 'content-type': 'text/xml; charset=utf-8' });
    res.end(f());
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv)));
}

function run(env) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, ['src/collect.js'], { cwd: ROOT, env: { ...process.env, ...env } });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (out += d));
    p.on('close', (code) => resolve({ code, out }));
  });
}

test('Integração: coleta, fallback, desativado, classificação, impacto e histórico', async () => {
  const srv = await serve();
  const base = `http://127.0.0.1:${srv.address().port}`;
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'radar-'));
  const cfg = {
    sources: [
      { id: 'infomoney', name: 'InfoMoney', region: 'BR', lang: 'pt', weight: 1, feeds: [{ url: `${base}/infomoney.xml` }] },
      { id: 'moneytimes', name: 'Money Times', region: 'BR', lang: 'pt', weight: 0.9, feeds: [{ url: `${base}/moneytimes.xml` }] },
      { id: 'exame', name: 'Exame', region: 'BR', lang: 'pt', assumeTz: '-03:00', feeds: [{ url: `${base}/exame.xml` }] },
      { id: 'valor', name: 'Valor Econômico', region: 'BR', lang: 'pt', paywall: true, feeds: [{ url: `${base}/nao-existe.xml` }], fallback: [{ kind: 'gnews', url: `${base}/gnews.xml` }] },
      { id: 'cnnbrasil', name: 'CNN Brasil', region: 'BR', lang: 'pt', feeds: [{ url: `${base}/nao-existe.xml` }], fallback: [{ kind: 'html', url: `${base}/cnn.html`, hrefPattern: '/economia/', minDepth: 3 }] },
      { id: 'arevista', name: 'A Revista', region: 'BR', lang: 'pt', enabled: false, feeds: [] },
      { id: 'quebrado', name: 'Quebrado', region: 'INT', lang: 'en', feeds: [{ url: `${base}/404.xml` }] },
    ],
  };
  const sf = path.join(tmp, 'sources.json');
  await fs.writeFile(sf, JSON.stringify(cfg));
  const out = path.join(tmp, 'api');

  const r1 = await run({ SOURCES_FILE: sf, OUT_DIR: out });
  assert.equal(r1.code, 0, r1.out);
  const news = JSON.parse(await fs.readFile(path.join(out, 'news.json'), 'utf8'));
  const st = Object.fromEntries(news.meta.sources.map((s) => [s.id, s]));
  assert.equal(st.infomoney.status, 'ok');
  assert.equal(st.valor.status, 'ok'); assert.equal(st.valor.via, 'google-news');
  assert.equal(st.cnnbrasil.via, 'html');
  assert.equal(st.arevista.status, 'desativado');
  assert.equal(st.quebrado.status, 'erro');
  // novas abas: todos os JSONs existem e são válidos mesmo quando o Focus (rede) falha
  for (const f of ['prospeccao', 'agenda', 'focus', 'conteudo', 'leituras']) {
    const j = JSON.parse(await fs.readFile(path.join(out, `${f}.json`), 'utf8'));
    assert.ok(j && typeof j === 'object', f);
  }
  const ag = JSON.parse(await fs.readFile(path.join(out, 'agenda.json'), 'utf8'));
  assert.ok(ag.eventos.length > 5);
  const lei = JSON.parse(await fs.readFile(path.join(out, 'leituras.json'), 'utf8'));
  assert.ok(lei.documentos.length && lei.gestoras.length);
  const cont = JSON.parse(await fs.readFile(path.join(out, 'conteudo.json'), 'utf8'));
  assert.ok(Array.isArray(cont.semana) && cont.newsletter);

  const byTitle = (re) => news.items.find((i) => re.test(i.title));
  assert.equal(byTitle(/Mega-Sena/).relevant, false);
  assert.equal(byTitle(/Papa Leão/).relevant, false);
  assert.ok(byTitle(/Copom deve manter/).topics.includes('monetaria'));
  // mesma matéria em dois portais forma um cluster com cobertura 2
  const fed = news.items.filter((i) => /Possível alta de juros pelo Fed/.test(i.title));
  assert.equal(fed.length, 2);
  assert.equal(fed[0].cluster, fed[1].cluster);
  assert.equal(fed[0].coverage, 2);
  // Exame: pubDate sem fuso interpretado em -03:00 → ~80min atrás, não 3h no futuro/passado
  const lula = byTitle(/Lula confirma/);
  assert.ok(Math.abs((Date.now() - Date.parse(lula.publishedAt)) / 60e3 - 80) < 3);
  // arquivos da API
  const impact = JSON.parse(await fs.readFile(path.join(out, 'impact.json'), 'utf8'));
  assert.ok(impact.items.length > 3);
  assert.ok(impact.items.every((i) => i.analysis && i.relevant));
  assert.equal(new Set(impact.items.map((i) => i.cluster)).size, impact.items.length, 'impacto mostra 1 por cluster');
  for (const id of ['economia', 'monetaria', 'fiscal', 'geopolitica', 'politica', 'mercados', 'cambio', 'fundos', 'empresas', 'regulacao', 'geral']) {
    await fs.access(path.join(out, 'topics', `${id}.json`));
  }

  // segunda execução com histórico: item some do feed mas continua armazenado
  cfg.sources[0].feeds = [{ url: `${base}/atom.xml` }];
  await fs.writeFile(sf, JSON.stringify(cfg));
  const r2 = await run({ SOURCES_FILE: sf, OUT_DIR: path.join(tmp, 'api2'), PREVIOUS_FILE: path.join(out, 'news.json') });
  assert.equal(r2.code, 0, r2.out);
  const news2 = JSON.parse(await fs.readFile(path.join(tmp, 'api2', 'news.json'), 'utf8'));
  assert.ok(news2.items.some((i) => /IFIX recua/.test(i.title)), 'histórico preservado');
  assert.ok(news2.items.some((i) => /Dólar fecha em queda/.test(i.title)), 'novo item entrou');
  const first = news.items.find((i) => /IFIX recua/.test(i.title)).firstSeen;
  assert.equal(news2.items.find((i) => /IFIX recua/.test(i.title)).firstSeen, first, 'firstSeen mantido');

  srv.close();
});

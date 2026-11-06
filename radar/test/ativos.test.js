import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dict = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'data', 'ativos.json'), 'utf8')).ativos;
// match.js é um script de navegador (UMD): carregamos num contexto isolado.
const ctx = { module: undefined };
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'public', 'match.js'), 'utf8'), ctx);
const M = ctx.RadarMatch;
const root = (t) => t.replace(/\d+$/, '');

test('Dicionário: IBrX 50 completo, raízes únicas e apelidos sem palavras comuns', () => {
  assert.ok(dict.filter((d) => d.i === 50).length >= 48);
  assert.ok(dict.filter((d) => d.i).length >= 95);
  const roots = dict.map((d) => root(d.t));
  assert.equal(new Set(roots).size, roots.length, 'raiz repetida');
  const comuns = ['vale', 'rumo', 'vamos', 'tenda', 'localiza', 'vivo', 'anima', 'motiva', 'equatorial', 'direcional'];
  for (const d of dict) for (const a of d.a || []) assert.ok(!comuns.includes(a), `apelido genérico em ${d.t}: ${a}`);
});

test('Reconhecimento: ticker, nome, classes e falsos positivos', () => {
  const c = M.compileAll(dict);
  const hit = (title) => M.matchItem({ title, summary: '' }, c).map(root).sort();
  assert.deepEqual(hit('Petrobras sobe com petróleo; PETR3 e PETR4 lideram'), ['PETR']);
  assert.ok(hit('Dividendos da Vale (VALE3) surpreendem').includes('VALE'));
  assert.ok(hit('Itaú Unibanco divulga balanço do 3º trimestre').includes('ITUB'));
  assert.ok(hit('Axia Energia, ex-Eletrobras, avança em leilão').includes('AXIA'));
  assert.deepEqual(hit('Polícia localiza suspeito; vamos ver o que vale a pena'), [], 'verbos comuns não são empresas');
  assert.deepEqual(hit('Rumo ao segundo turno, candidatos intensificam campanha'), []);
  assert.ok(hit('Rumo Logística anuncia investimento em ferrovia').includes('RAIL'));
  assert.deepEqual(hit('Banco Central mantém Selic'), []);
});

test('Lista pessoal: ticker fora do dicionário e lookup pela raiz', () => {
  const c = M.compileAll([{ t: 'XYZW11' }]);
  assert.deepEqual(M.matchItem({ title: 'Fundo XYZW11 distribui rendimentos' }, c), ['XYZW11']);
  assert.equal(M.lookup('petr3', dict).n, 'Petrobras');
  assert.equal(M.lookup('ZZZZ9', dict), null);
});

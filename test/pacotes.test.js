import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const json = (f) => JSON.parse(read(f));
const ctx = { module: undefined };
vm.runInNewContext(read('public/calc.js'), ctx);
const C = ctx.RadarCalc;
const chart = { module: { exports: {} } };
vm.runInNewContext(read('public/chart.js'), chart);
const near = (a, b, eps, m = '') => assert.ok(Math.abs(a - b) <= eps, `${m} ${a} vs ${b}`);
const base = { selic: 13.75, cdi: 13.65, ipca: 4.5, valor: 100000, meses: 12, tributacao: 'regressivo', indexador: 'cdi_pct', taxa: 110, custodiaB3: false, outrasTaxas: 0 };

test('IOF: tabela regressiva de 96% a 3% e zero a partir do 30º dia', () => {
  assert.equal(C.iofAliquota(1), 96);
  assert.equal(C.iofAliquota(15), 50);
  assert.equal(C.iofAliquota(29), 3);
  assert.equal(C.iofAliquota(30), 0);
  assert.equal(C.IOF.length, 29);
  assert.ok(C.IOF.every((v, i, a) => i === 0 || v < a[i - 1]), 'sempre decrescente');
});

test('Calculadora: IOF abate o rendimento antes do IR, e isentos não pagam IOF', () => {
  const r = C.calcular({ ...base, meses: (15 * 12) / 365 });
  assert.equal(r.dias, 15);
  near(r.iof, r.rendBruto * 0.5, 1e-9);
  near(r.ir, (r.rendBruto - r.iof) * 0.225, 1e-9, 'IR sobre o rendimento líquido de IOF');
  near(r.rendLiq, r.rendBruto - r.iof - r.ir, 1e-9);
  const lci = C.calcular({ ...base, tributacao: 'isento', meses: (15 * 12) / 365 });
  assert.equal(lci.iof, 0);
  assert.equal(C.calcular({ ...base, meses: 12 }).iof, 0);
  assert.equal(C.calcular({ ...base, meses: 1 }).iof, 0, '1 mês = 30 dias: já sem IOF');
});

test('Série: começa no valor aplicado, termina no valor final e mostra os degraus do IR', () => {
  const s = C.serie({ ...base, meses: 36 });
  assert.equal(s[0].liquido, 100000);
  const fim = C.calcular({ ...base, meses: 36 });
  near(s[s.length - 1].liquido, fim.final, 1e-6);
  assert.equal(s[s.length - 1].dias, fim.dias);
  const por = Object.fromEntries(s.map((p) => [p.dias, p]));
  for (const d of [29, 30, 180, 181, 360, 361, 720, 721]) assert.ok(por[d], `ponto no dia ${d}`);
  assert.ok(por[181].liquido > por[180].liquido * 1.001, 'a alíquota cai de 22,5% para 20% no dia 181');
  assert.ok(por[30].liquido > por[29].liquido, 'IOF some no 30º dia');
  assert.ok(s.every((p, i) => p.bruto >= p.liquido && (i === 0 || p.dias > s[i - 1].dias)));
  assert.ok(s.every((p) => p.inflacao >= 100000));
  near(s[s.length - 1].inflacao, 100000 * Math.pow(1.045, 36 / 12), 5);
});

test('Série: prazos curtos não quebram e isento não tem degraus de IR', () => {
  const curta = C.serie({ ...base, meses: 0.5 });
  assert.ok(curta.length >= 3 && curta[curta.length - 1].dias === 15);
  const iso = C.serie({ ...base, meses: 24, tributacao: 'isento' });
  assert.ok(iso.every((p, i) => i === 0 || p.liquido > iso[i - 1].liquido), 'isento só sobe');
  assert.ok(iso.every((p) => p.liquido === p.bruto));
});

test('Gráfico: escala e marcas do eixo X', () => {
  const n = chart.module.exports.nice(100000, 144325, 5);
  assert.ok(n.min <= 100000 && n.max >= 144325 && n.ticks.length >= 4 && n.ticks.length <= 9);
  assert.deepEqual([...chart.module.exports.xTicks(1095)].slice(0, 4), [0, 3, 6, 9]);
  assert.equal(chart.module.exports.xTicks(1095).at(-1), 36);
  assert.deepEqual([...chart.module.exports.xTicks(180)], [0, 1, 2, 3, 4, 5]);
  assert.deepEqual([...chart.module.exports.xTicks(1095, true)], [0, 6, 12, 18, 24, 30, 36], 'no celular, menos marcas para não encavalar');
  assert.ok(chart.module.exports.nice(5, 5, 5).max > 5, 'domínio degenerado');
});

test('Mapa de renda fixa: colunas completas, nomes por extenso, cupom, marcação e notas', () => {
  const m = json('public/data/mapa-rf.json');
  assert.deepEqual(m.colunas, ['Emissor', 'Ativo', 'Indexador', 'Imposto de renda', 'FGC', 'Cupom', 'Marcação*']);
  const linhas = m.grupos.flatMap((g) => g.linhas);
  assert.equal(linhas.length, 17);
  for (const l of linhas) { assert.equal(l.length, m.colunas.length, l[1]); assert.ok(l.every((c) => c && c.trim()), l[1]); }
  const por = Object.fromEntries(linhas.map((l) => [l[1].split(' (')[0], l]));
  for (const a of ['LTN', 'LFT', 'NTN-F', 'NTN-B Principal', 'NTN-B', 'CDB', 'LCI', 'LCA', 'LCD', 'CRI', 'CRA', 'Debênture', 'Debênture incentivada']) assert.ok(por[a], `falta ${a}`);
  assert.match(por.LTN[1], /^LTN \(Letra do Tesouro Nacional\)$/);
  assert.match(por.CDB[1], /Certificado de Depósito Bancário/);
  for (const a of ['LTN', 'LFT', 'NTN-B Principal']) assert.match(por[a][5], /^Bullet/, `${a} é bullet`);
  for (const a of ['NTN-F', 'NTN-B']) assert.match(por[a][5], /semestral/i);
  for (const a of ['CDB', 'LCI', 'LCA', 'LCD', 'CRI', 'CRA', 'Debênture', 'Debênture incentivada']) assert.match(por[a][5], /periódico.*ou bullet/i, a);
  for (const a of ['LCI', 'LCA', 'LCD', 'CRI', 'CRA', 'Debênture incentivada']) assert.equal(por[a][3], 'Isento IR', a);
  for (const a of ['CDB', 'Debênture', 'LTN', 'LFT', 'NTN-F', 'NTN-B']) assert.equal(por[a][3], 'Com IR', a);
  for (const a of ['LTN', 'LFT', 'NTN-F', 'NTN-B', 'NTN-B Principal', 'Debênture', 'Debênture incentivada', 'CRI', 'CRA']) assert.equal(por[a][6], 'Mercado*', a);
  for (const a of ['CDB', 'LCI', 'LCA', 'LCD']) assert.equal(por[a][6], 'Curva*', a);
  const g = Object.fromEntries(m.grupos.map((x) => [x.titulo, x]));
  assert.match(g['Títulos públicos'].caracteristica, /não é considerado ativo de liquidez diária/i);
  assert.match(g['Bancários'].caracteristica, /resgate trabalhado/i);
  assert.ok(!g.Fundos.caracteristica && !g.Financeiras.caracteristica, 'sem texto inventado onde o material não cobre');
  const notas = m.notas.join(' ');
  assert.match(notas, /marcação a mercado, mesmo nos papéis marcados na curva/);
  assert.match(notas, /IOF/);
  assert.deepEqual(m.legenda.map((x) => x[0]), ['Curva', 'Mercado', 'Bullet', 'Cupom']);
  assert.ok(!/HUB/.test(JSON.stringify(m)), 'sem referência a plataforma interna');
});

test('Educação: estrutura válida, estruturadas com definição e quando usar, sem dados exclusivos', () => {
  const e = json('public/data/educacao.json');
  const ids = e.secoes.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(e.secoes.length, 7);
  for (const s of e.secoes) {
    assert.ok(s.titulo && s.resumo && s.blocos.length, s.id);
    for (const b of s.blocos) {
      assert.ok(['cards', 'passos', 'lista', 'destaque'].includes(b.tipo), `${s.id}: ${b.tipo}`);
      if (b.tipo === 'cards' || b.tipo === 'passos') for (const it of b.itens) assert.ok(it.titulo && (it.texto || it.pontos), it.titulo);
    }
  }
  const est = e.secoes.find((s) => s.id === 'estruturadas').blocos[0].itens;
  assert.deepEqual(est.map((x) => x.titulo.split(' ')[0]), ['Collar', 'Fence', 'RUBI', 'Smart', 'Booster']);
  for (const x of est) assert.ok(x.texto && x.quando, `${x.titulo}: definição e quando usar`);
  assert.ok(est.filter((x) => x.confirmar).length === 4 && !est.find((x) => x.titulo === 'Booster').confirmar, 'só o Booster vem explícito no material');
  const mesa = JSON.stringify(e.secoes.find((s) => s.id === 'mesa-rv'));
  assert.match(mesa, /R\$ 100 mil/); assert.match(mesa, /R\$ 15 mil/); assert.match(mesa, /Broker/);
  const tudo = JSON.stringify(e);
  assert.ok(!/\bROA\b|aplica[cç][aã]o m[ií]nima|\bHUB\b|12,4%|\+5,5%/i.test(tudo), 'sem dados exclusivos das carteiras');
  assert.match(tudo, /Top Dividendos II/); assert.match(tudo, /Bunker/); assert.match(tudo, /Global Investo ETFs/);
  assert.match(e.aviso, /não é recomendação/i);
});

test('Site: nova aba, script do gráfico e render do mapa carregados', () => {
  const html = read('public/index.html'), app = read('public/app.js');
  assert.ok(html.indexOf('chart.js') > html.indexOf('calc.js') && html.indexOf('chart.js') < html.indexOf('app.js'));
  assert.match(app, /id: 'educacao', label: 'Educação'/);
  assert.match(app, /renderEducacao\(box\)/);
  assert.match(app, /data\/educacao\.json/);
});

// ---------- Carteira (visão 360°) ----------
{
  const test2 = test, assert2 = assert, Cc = C;
  const kctx = { module: { exports: {} } };
  vm.runInNewContext(read('public/carteira.js'), kctx);
  const K = kctx.RadarCarteira;
  const modelo = json('public/data/carteiras-modelo.json');
  const nomes = {};
  test2('carteira: os 3 modelos somam 100% e cobrem as 9 modalidades', () => {
    assert2.equal(modelo.perfis.length, 3);
    for (const p of modelo.perfis) {
      assert2.deepEqual(Object.keys(p.metas).sort(), [...K.MODALIDADES].sort());
      assert2.ok(Math.abs(Object.values(p.metas).reduce((a, b) => a + b, 0) - 100) < 1e-9, p.id);
      assert2.ok(p.caixaMinimo <= p.metas.pos);
    }
  });
  test2('carteira: modalidade pelo indexador', () => {
    assert2.equal(K.modalidadeDe('cdi_pct'), 'pos'); assert2.equal(K.modalidadeDe('poupanca'), 'pos');
    assert2.equal(K.modalidadeDe('ipca_mais'), 'infl'); assert2.equal(K.modalidadeDe('pre'), 'pre');
  });
  test2('carteira: sem meta não há alerta; com meta, alerta fora da tolerância e caixa abaixo do mínimo', () => {
    const pos = [{ modalidade: 'pos', valor: 60, caixa: false }, { modalidade: 'infl', valor: 40, caixa: false }];
    const sem = K.consolidar({ posicoes: pos, metas: {}, caixaMinimo: 20, tolerancia: 5, nomes });
    assert2.equal(sem.alertas.length, 0);
    const metas = modelo.perfis.find((p) => p.id === 'moderada').metas;
    const c = K.consolidar({ posicoes: pos, metas, caixaMinimo: 15, tolerancia: 5, nomes });
    const ids = c.alertas.map((a) => a.id);
    assert2.ok(ids.includes('pos') && ids.includes('infl') && ids.includes('caixa'));
    assert2.equal(c.total, 100); assert2.equal(c.pct.pos, 60);
  });
  test2('carteira: caixa só conta em pós-fixado e tolerância é respeitada', () => {
    const metas = { pos: 50, infl: 50 };
    const dentro = K.consolidar({ posicoes: [{ modalidade: 'pos', valor: 55, caixa: true }, { modalidade: 'infl', valor: 45, caixa: true }], metas, caixaMinimo: 50, tolerancia: 5, nomes });
    assert2.equal(dentro.alertas.length, 0); assert2.ok(Math.abs(dentro.caixaPct - 55) < 1e-9);
    const fora = K.consolidar({ posicoes: [{ modalidade: 'pos', valor: 56, caixa: false }, { modalidade: 'infl', valor: 44 }], metas, caixaMinimo: 0, tolerancia: 5, nomes });
    assert2.equal(fora.alertas.length, 2);
  });
  test2('carteira: agregação mantém o valor parado após o vencimento', () => {
    const P1 = { indexador: 'cdi_pct', tributacao: 'regressivo', taxa: 100, selic: 13.75, cdi: 13.65, ipca: 4.5, valor: 1000, meses: 6, outrasTaxas: 0 };
    const P2 = { ...P1, valor: 2000, meses: 24 };
    const s1 = Cc.serie(P1), s2 = Cc.serie(P2);
    const a = K.agregar([{ valor: 1000, grupo: 'pos', pts: s1 }, { valor: 2000, grupo: 'pos', pts: s2 }], 4.5);
    assert2.equal(a.dias[0], 0); assert2.equal(a.total[0], 3000);
    const fin1 = s1[s1.length - 1].liquido, fin2 = s2[s2.length - 1].liquido;
    assert2.ok(Math.abs(a.total[a.total.length - 1] - (fin1 + fin2)) < 1e-6);
    const k = a.dias.indexOf(s1[s1.length - 1].dias);
    assert2.ok(Math.abs(K.valorEm(s1, 400) - fin1) < 1e-9 && k > 0);
    assert2.ok(a.infl[a.infl.length - 1] > 3000);
  });
  test2('carteira: site carrega o script e os dados do modelo', () => {
    assert2.ok(read('public/index.html').includes('carteira.js'));
    assert2.ok(read('public/app.js').includes('carteiras-modelo.json'));
  });
}

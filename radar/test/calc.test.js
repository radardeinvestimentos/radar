import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ctx = { module: undefined };
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'public', 'calc.js'), 'utf8'), ctx);
const C = ctx.RadarCalc;
const base = { selic: 13.75, cdi: 13.65, ipca: 4.5, valor: 500000, meses: 12, tributacao: 'regressivo', custodiaB3: false, outrasTaxas: 0 };
const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg || ''} ${a} vs ${b}`);

test('Calculadora: reproduz o exemplo do usuário (Selic 15, IPCA 4,45, R$ 500 mil, 12 meses)', () => {
  const r = C.calcular({ ...base, selic: 15, ipca: 4.45, indexador: 'selic_mais', taxa: 0, tributacao: 'isento' });
  near(r.rendBruto, 75000, 0.01);
  near(r.jurosReaisAA, 10.10, 0.01);
  near(r.ganhoReal, 50503, 1);
  near(r.reposicaoInflacao, 24497, 1);
});

test('Calculadora: prefixado com IR regressivo e faixas', () => {
  const r = C.calcular({ ...base, indexador: 'pre', taxa: 12 });
  near(r.rendBruto, 60000, 0.01);
  assert.equal(r.aliq, 17.5);
  near(r.ir, 10500, 0.01);
  near(r.final, 549500, 0.01);
  assert.equal(C.aliquotaIR(180), 22.5);
  assert.equal(C.aliquotaIR(181), 20);
  assert.equal(C.aliquotaIR(721), 15);
  assert.equal(C.calcular({ ...base, indexador: 'pre', taxa: 12, meses: 36 }).aliq, 15);
});

test('Calculadora: IPCA+, % do CDI, CDI+ e Selic+ (ordem de grandeza e isenção)', () => {
  const ip = C.calcular({ ...base, indexador: 'ipca_mais', taxa: 7, tributacao: 'isento' });
  near(ip.taxaBrutaAA, (1.045 * 1.07 - 1) * 100, 1e-6);
  near(ip.ir, 0, 1e-9);
  const cd = C.calcular({ ...base, indexador: 'cdi_pct', taxa: 100 });
  near(cd.taxaBrutaAA, 13.65, 0.05, '100% do CDI em ~1 ano');
  const cm = C.calcular({ ...base, indexador: 'cdi_mais', taxa: 2 });
  near(cm.taxaBrutaAA, (1.1365 * 1.02 - 1) * 100, 1e-6);
  const sm = C.calcular({ ...base, indexador: 'selic_mais', taxa: 0.1 });
  near(sm.taxaBrutaAA, (1.1375 * 1.001 - 1) * 100, 1e-6);
  near(C.calcular({ ...base, indexador: 'poupanca', taxa: 0 }).taxaBrutaAA, (Math.pow(1.005, 12) - 1) * 100, 1e-6);
});

test('Calculadora: equivalência isento x tributado fecha o mesmo valor líquido', () => {
  const lci = C.calcular({ ...base, indexador: 'cdi_pct', taxa: 90, tributacao: 'isento' });
  assert.equal(lci.equivalente.tipo, 'tributado');
  const cdb = C.calcular({ ...base, indexador: 'cdi_pct', taxa: lci.equivalente.pctCDI });
  near(cdb.final, lci.final, 1, 'CDB equivalente rende o mesmo líquido');
  near(lci.equivalente.pctCDI, 90 / (1 - 0.175), 1.5, '90% isento ≈ 109% tributado a 17,5%');
  const cdb2 = C.calcular({ ...base, indexador: 'cdi_pct', taxa: 110 });
  const lci2 = C.calcular({ ...base, indexador: 'cdi_pct', taxa: cdb2.equivalente.pctCDI, tributacao: 'isento' });
  near(lci2.final, cdb2.final, 1);
});

test('Calculadora: custódia B3 (Tesouro Selic isento até R$ 10 mil) e prazos curtos', () => {
  const sem = C.calcular({ ...base, indexador: 'selic_mais', taxa: 0 });
  const com = C.calcular({ ...base, indexador: 'selic_mais', taxa: 0, custodiaB3: true });
  near(sem.taxaBrutaAA - com.taxaBrutaAA, 0.2 * (490000 / 500000) * 1.1375, 0.01);
  const pequeno = C.calcular({ ...base, valor: 8000, indexador: 'selic_mais', taxa: 0, custodiaB3: true });
  near(pequeno.taxaBrutaAA, 13.75, 1e-6, 'abaixo de R$ 10 mil não paga custódia no Selic');
  const curto = C.calcular({ ...base, meses: 3, indexador: 'pre', taxa: 12 });
  assert.equal(curto.aliq, 22.5);
  assert.throws(() => C.calcular({ ...base, indexador: 'xyz', taxa: 1 }));
});

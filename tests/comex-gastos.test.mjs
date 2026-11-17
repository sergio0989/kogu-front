// ============================================================
// tests/comex-gastos.test.mjs
// Comercio Exterior · vista simple de Análisis = GASTOS real vs teórico (etapa 1).
//
// Regla §16.4: escrita antes del código y mostrada fallando.
//
// CASO MEDIDO (prod, ADEGERMEX, Análisis 2026-10 por proveedor, 2026-11-17):
// salida de getAnalisis + getOperacionesProveedor (.q_comex_analisis_oct.mjs).
//
// Lo que defiende:
//   · Gastos (flete int'l + nacionales) real/kg vs teórico/kg sobre los kg con
//     teórico; mismo criterio que Reconciliación y Resumen.
//   · Bandas de la regla única; el estado no sigue al signo, el signo se conserva.
//   · "Sin teórico" = kg sin teórico y su % del grupo.
//   · La fila agregada = ponderado por kg de sus operaciones (drill-down).
//   · Cramer: la vista DDP actual lo deja SIN estado ("MP sin teórico") y esconde
//     la op 47035736007449 (2.90 USD/kg vs 11.72 teó; la otra op paga 11.21).
//     En la vista de gastos sí aparece como "revisar".
//   · Orden: revisar → fuera → dentro → sin teórico; dentro de cada uno, por kg.
// Uso: node --test tests/comex-gastos.test.mjs
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const C = require('../modules/comex/comex-control.js');

const r4 = (v) => Math.round(v * 1e4) / 1e4;
const p1 = (v) => Math.round(v * 1000) / 10;

const fila = (grupo, kg, kg_cmp, gastos_real_cmp, teo_flete, teo_otros, kg_mp_cmp = kg_cmp) =>
  ({ grupo, kg, kg_cmp, gastos_real_cmp, teo_flete, teo_otros, kg_mp_cmp, mp_real_mp_cmp: 0, teo_mp: 0 });

const IDF = fila('INTERNATIONAL DEHYDRATED FOODS INC', 35380.8, 35380.8, 12012.7324, 7300.1587, 11792.592);
const TM = fila('TRES MONTES SA', 7000, 7000, 5149.6387, 1779.1667, 10165.1511);
const CASONA = fila('ELABORADORA Y COMERCIALIZADORA CASONA EL MONTE LIMITADA', 20000, 20000, 9958.1394, 4150, 10780.6);
const CRAMER = fila('CARLOS CRAMER PRODUCTOS AROMATICOS SACI', 485, 485, 3067.877, 3395, 2290.2778, 0);
const NIKKEN = fila('NIKKEN FOODS USA INC.', 840, 0, 0, 0, 0);
const JENEIL = fila('JENEil BIOTECH INC.', 181.44, 0, 0, 0, 0);
const MM = fila('Mother Murphy’s Laboratories Inc.', 46, 0, 0, 0, 0);
const OCT = [IDF, TM, CASONA, CRAMER, NIKKEN, JENEIL, MM];

const OPS_IDF = [fila('24035736028314', 17962.56, 17962.56, 7174.1986, 2500.0779, 4183.1093),
  fila('24035736030380', 17418.24, 17418.24, 4838.5338, 4800.0807, 7609.4827)];
const OPS_CRAMER = [fila('47035736007449', 285, 285, 826.6776, 1995, 1345.8333, 0),
  fila('47035736007805', 200, 200, 2241.1994, 1400, 944.4444, 0)];

test('IDF: gastos 0.3395 vs teó 0.5396 USD/kg → −37.1 % "revisar", bajo', () => {
  const g = C.filaGastos(IDF);
  assert.equal(r4(g.real), 0.3395);
  assert.equal(r4(g.teo), 0.5396);
  assert.equal(p1(g.desv), -37.1);
  assert.equal(g.estado, 'revisar');
  assert.equal(g.signo, 'bajo');
  assert.equal(g.sinTeoKg, 0);
  assert.equal(g.sinTeoPct, 0);
});

test('Tres Montes −56.9 % y Casona −33.3 %: "revisar" (teórico sobreestimado, no ahorro)', () => {
  assert.equal(p1(C.filaGastos(TM).desv), -56.9);
  assert.equal(C.filaGastos(TM).estado, 'revisar');
  assert.equal(p1(C.filaGastos(CASONA).desv), -33.3);
  assert.equal(C.filaGastos(CASONA).estado, 'revisar');
});

test('Cramer: la vista DDP lo deja sin estado; la de gastos lo marca −46.0 % "revisar"', () => {
  const ddp = C.control({ kg: CRAMER.kg_cmp, kgMp: CRAMER.kg_mp_cmp, mpReal: 0, mpTeo: 0,
    gastosReal: CRAMER.gastos_real_cmp, gastosTeo: CRAMER.teo_flete + CRAMER.teo_otros });
  assert.equal(ddp.ddp.estado, null, 'hoy: "MP sin teórico", sin estado');
  const g = C.filaGastos(CRAMER);
  assert.equal(r4(g.real), 6.3255);
  assert.equal(r4(g.teo), 11.7222);
  assert.equal(p1(g.desv), -46.0);
  assert.equal(g.estado, 'revisar');
});

test('Cramer drill-down: op 47035736007449 2.90 vs 11.72 → −75.3 % "revisar"; op 7805 −4.4 % "dentro"', () => {
  const [o1, o2] = OPS_CRAMER.map(C.filaGastos);
  assert.equal(r4(o1.real), 2.9006);
  assert.equal(p1(o1.desv), -75.3);
  assert.equal(o1.estado, 'revisar');
  assert.equal(p1(o2.desv), -4.4);
  assert.equal(o2.estado, 'dentro');
});

test('IDF: la fila agregada = ponderado por kg de sus 2 operaciones', () => {
  const ops = OPS_IDF.map(C.filaGastos);
  const kgc = OPS_IDF.reduce((s, o) => s + o.kg_cmp, 0);
  const pond = (k) => ops.reduce((s, o, i) => s + o[k] * OPS_IDF[i].kg_cmp, 0) / kgc;
  const g = C.filaGastos(IDF);
  assert.equal(r4(pond('real')), r4(g.real));
  assert.equal(r4(pond('teo')), r4(g.teo));
  assert.equal(p1(ops[0].desv), 7.3);
  assert.equal(ops[0].estado, 'dentro');
  assert.equal(ops[0].signo, 'sobre');
  assert.equal(p1(ops[1].desv), -61.0);
});

test('sin teórico (Nikken, Jeneil, Mother Murphy): sin estado, 100 % de kg sin teórico', () => {
  for (const r of [NIKKEN, JENEIL, MM]) {
    const g = C.filaGastos(r);
    assert.equal(g.estado, null, r.grupo);
    assert.equal(g.motivo, 'sin_teorico');
    assert.equal(g.desv, null);
    assert.equal(g.sinTeoKg, r.kg);
    assert.equal(g.sinTeoPct, 1);
  }
});

test('sin teórico parcial: kg y % del grupo', () => {
  const g = C.filaGastos(fila('mixto', 1000, 750, 75, 50, 50));
  assert.equal(g.sinTeoKg, 250);
  assert.equal(g.sinTeoPct, 0.25);
  assert.equal(p1(g.desv), -25.0);
  assert.equal(g.estado, 'fuera');
});

test('orden de octubre: revisar por kg, luego sin teórico por kg', () => {
  const orden = C.ordenarControl(OCT).map((r) => r.grupo);
  assert.deepEqual(orden, [IDF.grupo, CASONA.grupo, TM.grupo, CRAMER.grupo, NIKKEN.grupo, JENEIL.grupo, MM.grupo]);
});

test('orden: revisar → fuera → dentro → sin teórico, sin importar el signo', () => {
  const rows = [
    fila('dentro', 9000, 9000, 100, 50, 50),
    fila('sin', 9999, 0, 0, 0, 0),
    fila('fuera-sobre', 10, 10, 120, 50, 50),
    fila('revisar-sobre', 5, 5, 200, 50, 50),
  ];
  assert.deepEqual(C.ordenarControl(rows).map((r) => r.grupo), ['revisar-sobre', 'fuera-sobre', 'dentro', 'sin']);
});

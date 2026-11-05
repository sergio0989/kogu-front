// Producción · Teórico vs real — "Por orden" y "MP producida en casa", observados
// en el PDF del 2026-11-04 (GPT0003): 77 órdenes con columnas "0.00/PT" para
// cloruro y sorbato, y la sección de lotes llena de "sin MP del lote" (neto $0.05)
// porque la cebolla de GPT0003 es de compra, no producida en casa.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const T = require('../modules/cto/produccion-teorico-calc.js');

const orden = (no, alertas, comps) => ({ no_ordp: no, alertas, componentes: comps });
const ceb = (g) => ({ cantidad: 3394.1, g_por_unidad: g, kg_por_pt: 1.1467, costo_kg: 25.5, con_teorico: true });
const sinG = { cantidad: 2.7, g_por_unidad: null, kg_por_pt: 0.0009, costo_kg: 27.14, con_teorico: true };
const ORD = [
  orden('1485', ['MP por PT'], { Cebolla: ceb(1146.7), Cloruro: sinG }),
  orden('1493', [], { Cebolla: ceb(1131.1), Cloruro: sinG }),
  orden('1495', ['Captura incompleta'], { Cebolla: ceb(527.4), Cloruro: sinG }),
];

test('Por orden: por omisión solo las que tienen alguna alerta; "ver todas" las muestra todas', () => {
  assert.deepEqual(T.ordenesVisibles(ORD, false).map((o) => o.no_ordp), ['1485', '1495']);
  assert.deepEqual(T.ordenesVisibles(ORD, true).map((o) => o.no_ordp), ['1485', '1493', '1495']);
});

test('Por orden: dosis solo de los componentes con gramos teóricos (no más "0.00/PT")', () => {
  assert.deepEqual(T.componentesConDosis(ORD, ['Cebolla', 'Cloruro', 'Sorbato']), ['Cebolla']);
});

test('MP producida en casa: se muestra solo si algún lote tiene costo conocido', () => {
  const sinMp = [{ no_ordp: '1185', costo_lote_kg: null, dif: null }, { no_ordp: '1193', costo_lote_kg: null, dif: null }];
  assert.equal(T.lotesConCosto(sinMp), false, 'GPT0003: la cebolla es de compra');
  // Sopas: sazonador WWP1330 del lote M-260408-1 ($30.66/kg) en la orden 1387
  assert.equal(T.lotesConCosto([...sinMp, { no_ordp: '1387', costo_lote_kg: 30.6561, dif: -19217.68 }]), true);
  assert.equal(T.lotesConCosto([]), false);
});

// PDF v1134 (2026-11-05): con GPT0003 la sección seguía llena de "sin MP del lote".
// 44 renglones SÍ tenían costo de lote (GMP0003 tiene órdenes propias) y cuadraban
// al centavo (neto $0.05), y los "sin MP del lote" se mostraban como si tuvieran
// diferencia. Por omisión: solo diferencia real (≥ $0.50); lo demás, resumido.
test('MP producida en casa: por omisión solo diferencias reales; cuadrados y sin lote van resumidos', () => {
  const cuadra = Array.from({ length: 44 }, (_, i) => ({ no_ordp: String(1200 + i), costo_lote_kg: 15, dif: i === 0 ? 0.05 : 0 }));
  const sinLote = Array.from({ length: 120 }, (_, i) => ({ no_ordp: String(1300 + i), costo_lote_kg: null, dif: null }));
  const r = T.resumenLotes([...cuadra, ...sinLote]);
  assert.deepEqual(r, { conDiferencia: 0, cuadran: 44, sinLote: 120 });
  assert.deepEqual(T.lotesVisibles([...cuadra, ...sinLote], false), []);
  assert.equal(T.lotesVisibles([...cuadra, ...sinLote], true).length, 164);
  // Sopas: la 1387 sí se ve por omisión
  const s1387 = { no_ordp: '1387', costo_lote_kg: 30.6561, dif: -19217.68 };
  assert.deepEqual(T.lotesVisibles([...cuadra, s1387, ...sinLote], false).map((l) => l.no_ordp), ['1387']);
});

test('unidad en plural: "kg" no se vuelve "kges"; "sobre" sí es "sobres"', () => {
  assert.equal(T.plural('kg'), 'kg');
  assert.equal(T.plural('sobre'), 'sobres');
  assert.equal(T.plural('caja'), 'cajas');
  assert.equal(T.plural('pieza'), 'piezas');
  assert.equal(T.plural(null), 'unidades');
});

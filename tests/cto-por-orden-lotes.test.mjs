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

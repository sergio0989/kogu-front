// ============================================================
// tests/comex-periodos.test.mjs
// Comercio Exterior · selector de periodo de Análisis (pendiente 2).
//
// Regla §16.4: escrita antes del código y mostrada fallando.
//
// CASO MEDIDO (prod, ADEGERMEX 09f2835c…, 2026-11-17): la matriz SAT tiene
// 13 periodos (2025-10…2026-10) pero solo 2026-10 está reconciliado (9 ops).
// Hoy el selector ofrece los 13; 12 terminan en "Sin datos".
//
// Lo que defiende:
//   · Solo se puede elegir un periodo con operaciones analizables.
//   · Los demás se ven, deshabilitados, diciendo por qué (sin reconciliar /
//     reconciliado sin datos analizables).
//   · Acumulado solo si algún periodo es analizable.
//   · Compatibilidad: si el back aún no manda n_analizable (front se despliega
//     antes que el back en prod), se comporta como hoy: todo habilitado.
// Uso: node --test tests/comex-periodos.test.mjs
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const C = require('../modules/comex/comex-control.js');

// Salida real de prod (n_ped, n_recon, n_analizable).
const PROD = [
  ['2026-10', 25, 9, 9], ['2026-09', 29, 0, 0], ['2026-08', 29, 0, 0], ['2026-07', 29, 0, 0],
  ['2026-06', 29, 0, 0], ['2026-05', 15, 0, 0], ['2026-04', 18, 0, 0], ['2026-03', 31, 0, 0],
  ['2026-02', 21, 0, 0], ['2026-01', 22, 0, 0], ['2025-12', 18, 0, 0], ['2025-11', 19, 0, 0],
  ['2025-10', 35, 0, 0],
].map(([periodo, n_pedimentos, n_reconciliado, n_analizable]) => ({ periodo, n_pedimentos, n_reconciliado, n_analizable }));

test('prod: solo 2026-10 (y Acumulado) se pueden elegir', () => {
  const ops = C.opcionesPeriodo(PROD);
  const elegibles = ops.filter(o => !o.disabled).map(o => o.value);
  assert.deepEqual(elegibles, ['ACUM', '2026-10']);
});

test('prod: los 12 meses sin reconciliar se ven deshabilitados y lo dicen', () => {
  const ops = C.opcionesPeriodo(PROD).filter(o => o.disabled);
  assert.equal(ops.length, 12);
  for (const o of ops) assert.match(o.label, /sin reconciliar/, o.label);
  assert.match(ops.find(o => o.value === '2026-09').label, /29 pedimentos/);
});

test('reconciliado pero sin operaciones analizables: deshabilitado con su motivo', () => {
  const ops = C.opcionesPeriodo([{ periodo: '2026-05', n_pedimentos: 15, n_reconciliado: 3, n_analizable: 0 }]);
  const o = ops.find(x => x.value === '2026-05');
  assert.equal(o.disabled, true);
  assert.match(o.label, /sin datos analizables/);
});

test('ningún periodo analizable: no se ofrece Acumulado', () => {
  const ops = C.opcionesPeriodo(PROD.slice(1));
  assert.equal(ops.some(o => o.value === 'ACUM'), false);
  assert.equal(ops.every(o => o.disabled), true);
});

test('compatibilidad: back sin n_analizable → todo habilitado, como hoy', () => {
  const viejo = PROD.map(({ periodo, n_pedimentos }) => ({ periodo, n_pedimentos }));
  const ops = C.opcionesPeriodo(viejo);
  assert.equal(ops.every(o => !o.disabled), true);
  assert.equal(ops[0].value, 'ACUM');
  assert.equal(ops.length, 14);
});

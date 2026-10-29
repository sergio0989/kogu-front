// Revisión del teórico antes de guardar (Producción · Teórico vs real).
// Casos reales del 2026-10-29: se capturó pasta 80 g dejando $1.64 (que era de
// 60 g) y se reemplazó sin querer la versión 2026-01-01 de las sopas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const T = require('../modules/cto/produccion-teorico-calc.js');

const fila = (g, costo_kg, merma_pct, cpu, componente = 'X') => ({ componente, claves: 'A', g, costo_kg, merma_pct, cpu, entra_peso: true });

test('$ por sobre: calculado = g/1000 × $/kg × (1 + merma)', () => {
  assert.ok(Math.abs(T.cpuCalc(fila('62', '24.5', '8', '')) - 1.64052) < 1e-6);
  assert.equal(T.cpuCalc(fila('', '180', '', '0.33')), null);
  assert.ok(Math.abs(T.cpuCalc(fila('3', '180', '', '')) - 0.54) < 1e-9);
});

test('pasta 80 g con $1.64 capturado (era de 60 g) → rojo, sugiere $2.1168', () => {
  const r = T.revisar({ filas: [fila('80', '24.5', '8', '1.64', 'Pasta')], vigenteDesde: '2026-10-01', versiones: [] });
  assert.equal(r.alertas.length, 1);
  assert.equal(r.alertas[0].nivel, 'rojo');
  assert.equal(r.alertas[0].i, 0);
  assert.equal(Math.round(r.alertas[0].calc * 1e4) / 1e4, 2.1168);
  assert.ok(r.alertas[0].pct > 0.2);
  assert.equal(r.bloquea, true);
});

test('sazonador 20 g × $40 con $0.80 (la hoja no aplica merma) → ámbar, no bloquea', () => {
  const r = T.revisar({ filas: [fila('20', '40', '3', '0.80', 'Sazonador')], vigenteDesde: '2026-10-01', versiones: [] });
  assert.equal(r.alertas[0].nivel, 'ambar');
  assert.equal(r.bloquea, false);
});

test('pasta 62 g con $1.64 cuadra; $ vacío o sin gramos no alerta', () => {
  const r = T.revisar({ filas: [fila('62', '24.5', '8', '1.64'), fila('62', '24.5', '8', ''), fila('', '', '', '0.33')], vigenteDesde: '2026-10-01', versiones: [] });
  assert.deepEqual(r.alertas, []);
});

test('misma fecha que una versión existente → reemplaza y pide confirmar', () => {
  const versiones = [{ vigente_desde: '2026-09-01' }, { vigente_desde: '2026-01-01' }];
  const r = T.revisar({ filas: [fila('62', '24.5', '8', '')], vigenteDesde: '2026-01-01', versiones });
  assert.equal(r.reemplaza, '2026-01-01');
  assert.equal(r.bloquea, true);
  const r2 = T.revisar({ filas: [fila('62', '24.5', '8', '')], vigenteDesde: '2026-10-01', versiones });
  assert.equal(r2.reemplaza, null);
  assert.equal(r2.bloquea, false);
});

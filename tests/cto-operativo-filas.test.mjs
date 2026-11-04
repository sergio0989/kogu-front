// Resumen operativo (Producción · Teórico vs real): qué valores se muestran por
// fila según el interruptor de simulación. Caso real: GPT0022 (jitomate en
// salmuera), Co-Pack 2026, orden 1495 con jitomate incompleto en septiembre.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const T = require('../modules/cto/produccion-teorico-calc.js');

const m = (mes, real, sim, aplica) => ({ anio: 2026, mes, simulado_aplica: aplica, real, sim });
const v = (mp_kg, mp_prom, rendimiento, pt_kg, pt_costo) => ({ ordenes: 2, mp_kg, mp_prom, rendimiento, pt_kg, pt_costo });
const GPT0022 = {
  cve_pt: 'GPT0022', sin_peso: false, rendimiento_ref: 0.7877,
  meses: [
    m(8, v(571.01, 19.87, 0.7566, 432, 35.68), v(571.01, 19.87, 0.7566, 432, 35.68), false),
    m(9, v(613.48, 26.32, 1.0196, 625.5, 35.36), v(763.76, 26.32, 0.819, 625.5, 41.68), true),
  ],
  acumulado: { simulado_aplica: true, real: v(6248.12, 31.14, 0.8066, 5040, 49.49), sim: v(6398.4, 31.03, 0.7877, 5040, 50.28) },
  incompletas: [{ no_ordp: '1495', mes: 9, rendimiento: 1.8961 }],
};

test('sin simular: valores reales y septiembre marcado como "revisar" por la 1495', () => {
  const f = T.filasOperativo(GPT0022, false);
  assert.deepEqual(f.map((x) => x.etiqueta), ['Ago-26', 'Sep-26', 'Acumulado']);
  const sep = f[1];
  assert.equal(sep.valores.rendimiento, 1.0196);
  assert.equal(sep.simulado, false);
  assert.equal(sep.revisar, true, 'el mes tiene una orden con captura incompleta');
  assert.equal(f[0].revisar, false);
  assert.equal(f[2].revisar, true);
});

test('simulando: septiembre y acumulado toman la estimación y se marcan como simulados', () => {
  const f = T.filasOperativo(GPT0022, true);
  assert.equal(f[1].valores.rendimiento, 0.819);
  assert.equal(f[1].valores.pt_costo, 41.68);
  assert.equal(f[1].simulado, true);
  assert.equal(f[0].simulado, false, 'agosto no tiene ajuste');
  assert.equal(f[0].valores.pt_costo, 35.68);
  assert.equal(f[2].valores.pt_costo, 50.28);
  assert.equal(f[2].simulado, true);
});

test('rendimiento imposible (> 100%) se distingue para pintarlo en rojo', () => {
  assert.equal(T.rendimientoImposible(1.0196), true);
  assert.equal(T.rendimientoImposible(1.0), false);
  assert.equal(T.rendimientoImposible(0.8066), false);
  assert.equal(T.rendimientoImposible(null), false);
});

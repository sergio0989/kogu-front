// KPIs de producción (Costo · Producción · KPIs): lo que la pantalla decide
// con lo que devuelve el back (analisis().kpis). Caso real: sopas GPT0030/31/32,
// Co-Pack 2026 ene-oct, cifras de qa/cto-kpis-sopas.sql contra prod (2026-11-10).
//   mesesConHuecos  el rango pedido completo; julio y octubre sin producción
//   alertas         gramos fuera del teórico, captura incompleta y precio de un mes
//   cobertura       inventario ÷ venta mensual promedio
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const K = require('../modules/cto/produccion-kpis-calc.js');

const c = (componente, real_por_unidad, g_real, g_teo_merma, teo_por_unidad = null) => ({ componente, real_por_unidad, g_real, g_teo_merma, teo_por_unidad });
const mes = (m, cajas, componentes) => ({ anio: 2026, mes: m, cantidad_pt: cajas, unidades: cajas * 24, kg: cajas * 1.968, componentes });
const KPIS = {
  meses: [
    mes(4, 6150, [c('Pasta', 1.6071, 69.38, 66.96), c('Sazonador', 0.5921, 19.32, 20.6), c('Película', 1.1396, 6.33, 3), c('Corrugado', 0.3256, null, null), c('Otros', 0.0791, null, null)]),
    mes(5, 6492, [c('Pasta', 1.5832, 68.34, 66.96), c('Sazonador', 0.5519, 22.03, 20.6), c('Película', 0.973, 5.87, 3), c('Corrugado', 0.3258, null, null), c('Otros', 0.0928, null, null)]),
    mes(6, 3408, [c('Pasta', 1.6146, 69.69, 66.96), c('Sazonador', 0.4025, 13.13, 20.6), c('Película', 0.8846, 5.47, 3), c('Corrugado', 0.325, null, null), c('Otros', 0.1055, null, null)]),
    mes(8, 788, [c('Pasta', 1.5927, 68.74, 66.96), c('Sazonador', 0.4318, 20.2, 20.6), c('Película', 1.3199, 7.35, 3), c('Corrugado', 0.325, null, null), c('Otros', 0.1059, null, null)]),
    mes(9, 396, [c('Pasta', 1.6161, 69.75, 66.96), c('Sazonador', 0.9943, 20.4, 20.6), c('Película', 1.3826, 7.68, 3), c('Corrugado', 0.325, null, null), c('Otros', 0.1185, null, null)]),
  ],
  acumulado: { cantidad_pt: 17234, unidades: 413616, kg: 33916.51,
    componentes: [c('Pasta', 1.5991, 69.03, 66.96, 1.64), c('Sazonador', 0.5414, 19.18, 20.6, 0.8), c('Película', 1.0403, 6.06, 3, 0.54), c('Corrugado', 0.3255, null, null, 0.33), c('Otros', 0.0916, null, null)] },
};

test('mesesConHuecos: el rango completo, los meses sin producción marcados', () => {
  const m = K.mesesConHuecos(KPIS.meses, 2026, 4, 10);
  assert.deepEqual(m.map((x) => x.mes), [4, 5, 6, 7, 8, 9, 10]);
  assert.deepEqual(m.filter((x) => x.sin_produccion).map((x) => x.mes), [7, 10]);
  assert.equal(m.find((x) => x.mes === 6).cantidad_pt, 3408);
});

test('valor por medida: cajas, sobres o kg; sin producción = 0', () => {
  const m = K.mesesConHuecos(KPIS.meses, 2026, 4, 10);
  assert.equal(K.valorMedida(m[0], 'cajas'), 6150);
  assert.equal(K.valorMedida(m[0], 'sobres'), 147600);
  assert.ok(Math.abs(K.valorMedida(m[0], 'kg') - 12103.2) < 0.01);
  assert.equal(K.valorMedida(m[3], 'sobres'), 0);
});

test('alertas: película al doble, sazonador de junio incompleto, sazonador de septiembre caro', () => {
  const a = K.alertas(KPIS);
  assert.deepEqual(a.map((x) => [x.tipo, x.componente, x.mes ?? null]), [
    ['gramos', 'Película', null],
    ['captura', 'Sazonador', 6],
    ['precio', 'Sazonador', 9],
  ]);
  assert.equal(a[0].nivel, 'alta');
  assert.ok(Math.abs(a[0].desviacion - (6.06 / 3 - 1)) < 1e-9);
  assert.equal(a[1].nivel, 'alta');
  assert.equal(a[2].nivel, 'media');
});

test('alertas: pasta (+3%) y sazonador acumulado (−7%) no alertan; corrugado sin gramos tampoco', () => {
  const a = K.alertas(KPIS);
  assert.ok(!a.some((x) => x.componente === 'Pasta'));
  assert.ok(!a.some((x) => x.componente === 'Corrugado'));
  assert.ok(!a.some((x) => x.tipo === 'gramos' && x.componente === 'Sazonador'));
});

test('cobertura: 1,613 cajas contra 15,621 vendidas en 7 meses ≈ 0.72 meses', () => {
  assert.ok(Math.abs(K.cobertura(1613, 15621, 7) - 1613 / (15621 / 7)) < 1e-9);
  assert.equal(K.cobertura(1613, 0, 7), null);
});

// KPI Ventas Cliente (Radar comercial): lo que la pantalla decide con lo que
// devuelve GET /protected/rc/kpi-cliente. Caso real: TECNO SOPAS (cliente 21),
// sopas GPT0030/31/32 de Co-Pack, 2026 ene-oct, cifras de
// qa/rc-sopas-ventas-cliente.sql contra prod (2026-11-10), corte 2026-11-10.
//   mesesConHuecos  el rango completo; un mes sin compra queda en 0
//   cambiosPrecio   variación del precio contra el mes anterior con compra
//   senales         concentración, demanda a la baja y días sin comprar
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const K = require('../modules/rc/kpi-cliente-calc.js');

const mes = (m, cantidad, venta) => ({ anio: 2026, mes: m, cantidad, venta, venta_neta: venta, precio: venta / cantidad });
const TECNO = {
  cve_cte: '21', cliente: 'TECNO SOPAS', venta_neta: 1948307.04, participacion: 1, dias_sin_compra: 39, ultima: '2026-10-02',
  meses: [mes(4, 6150, 755712), mes(5, 900, 110592), mes(6, 1718, 216880.32), mes(7, 2580, 325699.2), mes(8, 1928, 243390.72), mes(9, 1440, 181785.6), mes(10, 905, 114247.2)],
};
const DATA = { concentracion: { clientes: 1, top1: 1, top3: 1 }, clientes: [TECNO] };

test('mesesConHuecos: ene–oct completo; ene–mar sin compra', () => {
  const m = K.mesesConHuecos(TECNO.meses, 2026, 1, 10);
  assert.deepEqual(m.map((x) => x.mes), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.deepEqual(m.filter((x) => x.sin_compra).map((x) => x.mes), [1, 2, 3]);
  assert.equal(m.find((x) => x.mes === 7).cantidad, 2580);
});

test('cambiosPrecio: sube 2.7% en junio y luego se mantiene', () => {
  const c = K.cambiosPrecio(TECNO.meses);
  assert.equal(c[0].cambio, null, 'el primer mes no tiene contra qué compararse');
  assert.ok(Math.abs(c.find((x) => x.mes === 6).cambio - (126.24 / 122.88 - 1)) < 1e-6);
  assert.deepEqual(c.filter((x) => x.cambio && Math.abs(x.cambio) > 0.0005).map((x) => x.mes), [6]);
});

test('señales de TECNO SOPAS: concentración, demanda a la baja y 39 días sin comprar', () => {
  const s = K.senales(DATA, TECNO);
  assert.deepEqual(s.map((x) => [x.tipo, x.nivel]), [['concentracion', 'alta'], ['demanda', 'alta'], ['recencia', 'media']]);
  const d = s.find((x) => x.tipo === 'demanda');
  assert.ok(Math.abs(d.anterior - (900 + 1718 + 2580) / 3) < 1e-6);
  assert.ok(Math.abs(d.reciente - (1928 + 1440 + 905) / 3) < 1e-6);
  assert.ok(Math.abs(d.variacion - ((1928 + 1440 + 905) / (900 + 1718 + 2580) - 1)) < 1e-6);
});

test('señales: sin alerta de demanda si la caída es menor a 15% o hay menos de 6 meses con compra', () => {
  const estable = { ...TECNO, meses: [mes(5, 1000, 1), mes(6, 1000, 1), mes(7, 1000, 1), mes(8, 900, 1), mes(9, 900, 1), mes(10, 900, 1)] };
  assert.ok(!K.senales(DATA, estable).some((x) => x.tipo === 'demanda'), '−10% no alerta');
  const corto = { ...TECNO, meses: TECNO.meses.slice(-4) };
  assert.ok(!K.senales(DATA, corto).some((x) => x.tipo === 'demanda'));
});

test('señales: recencia por días sin comprar (≤30 nada, >30 media, >60 alta)', () => {
  const nivel = (d) => (K.senales({ concentracion: { clientes: 5, top1: 0.2 } }, { ...TECNO, meses: [], dias_sin_compra: d }).find((x) => x.tipo === 'recencia') || {}).nivel;
  assert.equal(nivel(30), undefined);
  assert.equal(nivel(39), 'media');
  assert.equal(nivel(61), 'alta');
});

// ── Selector de productos (lo vendido en el periodo) ──
const PRODS = [
  { cve_prod: 'GPT0030', descripcion: 'Sopa instantanea fideo con saz. tomate', venta_neta: 730608 },
  { cve_prod: 'GPT0031', descripcion: 'Sopa instantanea letra con saz. tomate', venta_neta: 651960.48 },
  { cve_prod: 'GPT0032', descripcion: 'Sopa instantanea municion con saz tomate', venta_neta: 565738.56 },
];

test('filtrarProductos: busca por clave o descripción, sin importar mayúsculas ni acentos', () => {
  assert.deepEqual(K.filtrarProductos(PRODS, 'gpt0031').map((x) => x.cve_prod), ['GPT0031']);
  assert.deepEqual(K.filtrarProductos(PRODS, 'MUNICIÓN').map((x) => x.cve_prod), ['GPT0032']);
  assert.deepEqual(K.filtrarProductos(PRODS, 'sopa tomate').map((x) => x.cve_prod), ['GPT0030', 'GPT0031', 'GPT0032'], 'todas las palabras');
  assert.equal(K.filtrarProductos(PRODS, '').length, 3);
});

test('seleccionInicial: conserva lo guardado que sí se vendió en el periodo; si no queda nada, ninguno', () => {
  assert.deepEqual(K.seleccionInicial(PRODS, ['GPT0031', 'WWP1330']), ['GPT0031']);
  assert.deepEqual(K.seleccionInicial(PRODS, ['WWP1330']), []);
  assert.deepEqual(K.seleccionInicial(PRODS, null), []);
});

// ── Selector en modal: el filtro de la pantalla muestra solo un resumen ──
// Caso real (dev, 2026-11-10): Copack ene–oct tiene 66 productos vendidos; la
// lista dentro de la pantalla ocupaba media vista. Ahora se elige en un modal y
// arriba queda el resumen de lo elegido.
test('resumenSeleccion: cuántos, venta y las primeras claves por venta', () => {
  const r = K.resumenSeleccion(PRODS, new Set(['GPT0032', 'GPT0030', 'GPT0031']));
  assert.equal(r.n, 3);
  assert.ok(Math.abs(r.venta - (730608 + 651960.48 + 565738.56)) < 0.01);
  assert.deepEqual(r.claves, ['GPT0030', 'GPT0031']);
  assert.equal(r.mas, 1, 'una más que no se lista');
  const vacio = K.resumenSeleccion(PRODS, new Set());
  assert.equal(vacio.n, 0); assert.deepEqual(vacio.claves, []); assert.equal(vacio.mas, 0);
  assert.equal(K.resumenSeleccion(PRODS, new Set(['WWP1330'])).n, 0, 'lo que no se vendió en el periodo no cuenta');
});

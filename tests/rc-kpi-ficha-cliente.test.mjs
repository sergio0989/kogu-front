// KPI Ventas Cliente (ficha): las señales que la pantalla saca de
// GET /protected/rc/kpi-cliente/ficha. Casos reales (prod, 2026-11-10, corte 10-nov):
//   TECNO SOPAS (Copack, 21)            — cliente nuevo, ritmo 13 días, 39 sin comprar
//   UNILEVER MANUFACTURERA (ADGM, 1)    — ene–oct 2026 −16.5% vs 2025, ritmo 6, 11 sin comprar
// Umbrales propuestos:
//   recencia   días sin comprar > 2× su ritmo: alta; > 1.5×: media
//   demanda    recurrente de los últimos 3 meses con venta < −15% vs los 3 previos: alta
//   anual      venta contra el mismo periodo del año anterior < −10%: alta; > +10%: bien
//   dejo       productos que compraba el año anterior y este no: media
//   unicas / nuevo   datos para leer bien la ficha
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const K = require('../modules/rc/kpi-ficha-cliente-calc.js');

const mes = (m, recurrente, unica = 0) => ({ anio: 2026, mes: m, recurrente, unica, venta_neta: recurrente + unica });
const TECNO = {
  actual: { venta_neta: 2071995.04, unica: 123688, recurrente: 1948307.04, ritmo_dias: 13, dias_sin_compra: 39, ultima: '2026-10-02' },
  anterior: null, variacion: null,
  meses: [mes(1, 0), mes(2, 0), mes(3, 0), mes(4, 755712), mes(5, 110592, 23688), mes(6, 216880.32), mes(7, 325699.2), mes(8, 243390.72, 100000), mes(9, 181785.6), mes(10, 114247.2)],
  productos: [{ cve_prod: 'GPT0030', estado: 'nuevo', anterior: null }],
};
const UNILEVER = {
  actual: { venta_neta: 119094757.55, unica: 445258.8, ritmo_dias: 6, dias_sin_compra: 11, ultima: '2026-10-30' },
  anterior: { venta_neta: 142579673.19 }, variacion: 119094757.55 / 142579673.19 - 1,
  meses: [],
  productos: [
    { cve_prod: 'WWP0776-B', estado: 'dejo', anterior: 42040730.1 }, { cve_prod: 'WWP0447-C', estado: 'dejo', anterior: 146390.53 },
    { cve_prod: 'WWP0465', estado: 'dejo', anterior: 52086.94 }, { cve_prod: 'WWP1260', estado: 'dejo', anterior: 20518.75 },
    { cve_prod: 'WWP0776-C', estado: 'nuevo', anterior: 0 }, { cve_prod: 'WWP0164', estado: 'crece', anterior: 36886038.23 },
  ],
};
const tipos = (s) => s.map((x) => [x.tipo, x.nivel]);

test('TECNO SOPAS: 39 días sin comprar (3× su ritmo), demanda a la baja, únicas y cliente nuevo', () => {
  const s = K.senales(TECNO);
  assert.deepEqual(tipos(s), [['recencia', 'alta'], ['demanda', 'alta'], ['unicas', 'dato'], ['nuevo', 'dato']]);
  const r = s.find((x) => x.tipo === 'recencia');
  assert.ok(Math.abs(r.veces - 39 / 13) < 1e-9);
  const d = s.find((x) => x.tipo === 'demanda');
  assert.ok(Math.abs(d.reciente - (243390.72 + 181785.6 + 114247.2) / 3) < 0.01);
  assert.ok(Math.abs(d.anterior - (110592 + 216880.32 + 325699.2) / 3) < 0.01);
  assert.deepEqual(d.meses_recientes, [8, 9, 10]);
});

test('UNILEVER: cae contra el año anterior, dejó 4 productos, recencia media', () => {
  const s = K.senales(UNILEVER);
  assert.deepEqual(tipos(s), [['recencia', 'media'], ['anual', 'alta'], ['dejo', 'media'], ['unicas', 'dato']]);
  const dj = s.find((x) => x.tipo === 'dejo');
  assert.equal(dj.productos, 4);
  assert.ok(Math.abs(dj.anterior - (42040730.1 + 146390.53 + 52086.94 + 20518.75)) < 0.01);
  assert.deepEqual(dj.claves.slice(0, 1), ['WWP0776-B'], 'la más grande primero');
});

test('sin señal: ritmo al día, demanda estable, año parejo', () => {
  const bien = {
    actual: { venta_neta: 100, unica: 0, ritmo_dias: 10, dias_sin_compra: 14 }, anterior: { venta_neta: 98 }, variacion: 100 / 98 - 1,
    meses: [mes(5, 100), mes(6, 100), mes(7, 100), mes(8, 95), mes(9, 95), mes(10, 95)], productos: [],
  };
  assert.deepEqual(K.senales(bien), []);
});

test('anual: crecer más de 10% es buena señal', () => {
  const s = K.senales({ actual: { venta_neta: 120, unica: 0, ritmo_dias: null, dias_sin_compra: 3 }, anterior: { venta_neta: 100 }, variacion: 0.2, meses: [], productos: [] });
  assert.deepEqual(tipos(s), [['anual', 'bien']]);
});

test('filtrarClientes: por clave, nombre o agente; todas las palabras, sin acentos', () => {
  const L = [{ cve_cte: '1', cliente: 'UNILEVER MANUFACTURERA', agente: 'Ana Pérez' }, { cve_cte: '21', cliente: 'TECNO SOPAS', agente: 'Belen Escandon' }, { cve_cte: '210', cliente: 'OTRO', agente: null }];
  assert.deepEqual(K.filtrarClientes(L, '21').map((c) => c.cve_cte), ['21'], 'clave exacta primero, sin traer 210 por contener 21');
  assert.deepEqual(K.filtrarClientes(L, 'tecno').map((c) => c.cve_cte), ['21']);
  assert.deepEqual(K.filtrarClientes(L, 'perez').map((c) => c.cve_cte), ['1']);
  assert.equal(K.filtrarClientes(L, '').length, 3);
});

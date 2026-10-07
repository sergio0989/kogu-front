// Costos de materia prima (front, Fase 1): lista por clave, ficha y captura de cotización.
// Casos reales: WWP0622 USD 1.058 desde 20,000 kg (12/08/2026); WWP0098-IR MXN 68 desde 1,000 kg.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const I = createRequire(import.meta.url)('../modules/idp/idp-comun.js');

test('precio con moneda: USD con hasta 4 decimales, MXN con 2', () => {
  assert.equal(I.precioMp('USD', 1.058), 'USD 1.058');
  assert.equal(I.precioMp('USD', 3.95), 'USD 3.95');
  assert.equal(I.precioMp('MXN', 68), 'MXN 68.00');
  assert.equal(I.precioMp('MXN', 598.3), 'MXN 598.30');
  assert.equal(I.precioMp('USD', null), '—');
});

test('rango de una escala: hasta el kg anterior a la siguiente; la última abierta; "sin escala" si viene de 0 migrado', () => {
  const e = [{ desde_kg: 25, precio: 4.78 }, { desde_kg: 1000, precio: 3.95 }, { desde_kg: 18000, precio: 3.5 }];
  assert.equal(I.rangoEscala(e, 0), '25 – 999 kg');
  assert.equal(I.rangoEscala(e, 1), '1,000 – 17,999 kg');
  assert.equal(I.rangoEscala(e, 2), '18,000 kg en adelante');
  assert.equal(I.rangoEscala([{ desde_kg: 0, precio: 1.6 }], 0, { sinEscala: true }), 'Sin escala');
});

test('vigencia sugerida: 6 meses menos un día', () => {
  assert.equal(I.vigenciaSugerida('2026-08-12'), '2027-02-11');
  assert.equal(I.vigenciaSugerida('2026-10-07'), '2027-04-06');
});

test('chips: vigencia y origen con texto (no solo color)', () => {
  assert.match(I.chipVigencia('por_vencer'), /Por vencer/);
  assert.match(I.chipVigencia('vencida'), /Vencida/);
  assert.match(I.chipVigencia('sin_precio'), /Sin precio/);
  assert.match(I.chipOrigen('importacion'), /Importación/);
  assert.match(I.chipOrigen('por_revisar'), /Por revisar/);
});

test('cuerpo de cotización: escalas con comas, ignora filas vacías, moneda y fechas', () => {
  const r = I.cuerpoCotizacion({ producto_id: 'p1', proveedor_id: '', incoterm: 'EXW', moneda: 'USD', transporte: 'maritimo', lugar_entrega: 'Chile',
    vigente_desde: '2026-08-12', vigente_hasta: '2027-02-11', comentario: ' MOQ 20 TN ',
    escalas: [{ desde_kg: '20,000', precio: '1.058' }, { desde_kg: '', precio: '' }] });
  assert.deepEqual(r, { ok: true, body: { producto_id: 'p1', proveedor_id: null, incoterm: 'EXW', moneda: 'USD', transporte: 'maritimo',
    lugar_entrega: 'Chile', vigente_desde: '2026-08-12', vigente_hasta: '2027-02-11', comentario: 'MOQ 20 TN',
    escalas: [{ desde_kg: 20000, precio: 1.058 }] } });
});

test('cuerpo de cotización: errores legibles antes de llamar al backend', () => {
  const base = { producto_id: 'p1', incoterm: 'EXW', moneda: 'USD', vigente_desde: '2026-08-12', escalas: [{ desde_kg: '20000', precio: '1.058' }] };
  assert.deepEqual(I.cuerpoCotizacion({ ...base, producto_id: '' }), { ok: false, error: 'Elige la clave (producto del catálogo).' });
  assert.deepEqual(I.cuerpoCotizacion({ ...base, escalas: [{ desde_kg: '', precio: '' }] }), { ok: false, error: 'Captura al menos una escala con kg y precio.' });
  assert.deepEqual(I.cuerpoCotizacion({ ...base, escalas: [{ desde_kg: '100', precio: '0' }] }), { ok: false, error: 'Cada escala necesita kg y un precio mayor a 0.' });
  assert.deepEqual(I.cuerpoCotizacion({ ...base, vigente_desde: '' }), { ok: false, error: 'Indica desde cuándo es vigente.' });
  assert.deepEqual(I.cuerpoCotizacion({ ...base, vigente_hasta: '2026-01-01' }), { ok: false, error: 'La vigencia termina antes de empezar.' });
});

test('resumen de la lista: cuántas por vencer, vencidas, sin escala y por revisar', () => {
  const filas = [
    { estado_vigencia: 'vigente', origen: 'importacion', sin_escala: false },
    { estado_vigencia: 'por_vencer', origen: 'nacional', sin_escala: false },
    { estado_vigencia: 'vencida', origen: 'por_revisar', sin_escala: true },
    { estado_vigencia: 'vencida', origen: 'nacional', sin_escala: true },
  ];
  assert.deepEqual(I.resumenMp(filas), { total: 4, vigente: 1, por_vencer: 1, vencida: 2, sin_escala: 2, por_revisar: 1 });
});

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

// Captura (14:47, 7-oct): en el formulario faltaba ver hasta dónde llega cada escala.
test('captura: "hasta" calculado en vivo por fila, aunque se capturen en desorden o con comas', () => {
  assert.deepEqual(I.hastaCaptura([{ desde_kg: '1,000', precio: '3.95' }, { desde_kg: '25', precio: '4.78' }, { desde_kg: '18000', precio: '3.5' }]),
    ['17,999 kg', '999 kg', 'en adelante']);
  assert.deepEqual(I.hastaCaptura([{ desde_kg: '20,000', precio: '1.058' }, { desde_kg: '', precio: '' }]), ['en adelante', '']);
  assert.deepEqual(I.hastaCaptura([{ desde_kg: '100', precio: '1' }, { desde_kg: '100', precio: '2' }]), ['desde repetido', 'desde repetido']);
});

// 7-oct 15:15–15:16: lugar de entrega del catálogo de I+D; unidad en CADA cotización.
test('cuerpo de cotización: unidad siempre (de la cotización), densidad si es litro, lugar como clave', () => {
  const base = { producto_id: 'p1', incoterm: 'EXW', moneda: 'MXN', vigente_desde: '2026-10-08', escalas: [{ desde_kg: '200', precio: '24' }] };
  assert.equal(I.cuerpoCotizacion({ ...base, unidad: 'pieza' }).body.unidad, 'pieza');
  const l = I.cuerpoCotizacion({ ...base, unidad: 'L', densidad_kg_l: '0.81', lugar_entrega: 'manzanillo' });
  assert.equal(l.body.unidad, 'L'); assert.equal(l.body.densidad_kg_l, 0.81); assert.equal(l.body.lugar_entrega, 'manzanillo');
  assert.deepEqual(I.cuerpoCotizacion({ ...base, unidad: 'L', densidad_kg_l: '', densidadClave: null }),
    { ok: false, error: 'En litros se necesita la densidad (kg/L) para costear en kg.' });
  assert.equal(I.cuerpoCotizacion({ ...base, unidad: 'L', densidad_kg_l: '', densidadClave: 0.9 }).ok, true);
});

test('etiquetas de escala según la unidad', () => {
  assert.deepEqual(I.etiquetasUnidad('kg'), { desde: 'Desde (kg)', precio: 'Precio por kg', corto: 'kg' });
  assert.deepEqual(I.etiquetasUnidad('L'), { desde: 'Desde (L)', precio: 'Precio por litro', corto: 'L' });
  assert.deepEqual(I.etiquetasUnidad('pieza'), { desde: 'Desde (piezas)', precio: 'Precio por pieza', corto: 'pza' });
});

// ── Fase 2: incrementables (copia de Comercio Exterior, manual o CRM) ──
test('cómo se calcula cada concepto copiado', () => {
  assert.equal(I.comoSeCalcula({ modo_captura: 'usd_fijo', valor_captura: 3233.16 }), 'USD 3,233.16 por embarque');
  assert.equal(I.comoSeCalcula({ modo_captura: 'mxn_fijo', valor_captura: 3500 }), 'MXN 3,500.00 por embarque');
  assert.equal(I.comoSeCalcula({ modo_captura: 'usd_kg', valor_captura: 0.65 }), 'USD 0.65 por kg');
  assert.equal(I.comoSeCalcula({ modo_captura: 'mxn_kg', valor_captura: 2 }), 'MXN 2.00 por kg');
  assert.equal(I.comoSeCalcula({ modo_captura: 'pct_base', es_arancel: true }, { arancel_pct: 15, escenario_nombre: 'General 15%' }), '15% del valor en aduana · General 15%');
});

test('fuente de los incrementables, en palabras', () => {
  assert.equal(I.fuenteIncrementables({ fuente: 'costeo', costeo_folio: '14/26', costeo_version: 2, fecha_copia: '2026-10-07', kg_base: 17962, modo_transporte: 'maritimo' }),
    'Copia del costeo 14/26 de Comercio Exterior · versión 2 · copiada el 07/10/2026 · embarque de 17,962 kg · marítimo');
  assert.equal(I.fuenteIncrementables({ fuente: 'crm', legacy_id: 1043, fecha_copia: '2026-08-12' }), 'Capturado en el CRM · costo 1043 del 12/08/2026');
  assert.equal(I.fuenteIncrementables({ fuente: 'manual', motivo: 'Flete cotizado por compras', kg_base: 1000 }), 'Captura manual · Flete cotizado por compras · embarque de 1,000 kg');
});

test('captura manual de incrementables: motivo, conceptos completos y kg del embarque si hay gastos fijos', () => {
  const fila = { nombre: 'Flete a planta', capa_incoterm: 'ddp', modo_captura: 'mxn_fijo', valor_captura: '3,500' };
  assert.deepEqual(I.cuerpoIncrementablesManual({ motivo: ' Flete de compras ', kg_base: '1,000', arancel_pct: '', conceptos: [fila, { nombre: '', valor_captura: '' }] }),
    { ok: true, body: { fuente: 'manual', motivo: 'Flete de compras', kg_base: 1000, arancel_pct: 0,
      conceptos: [{ nombre: 'Flete a planta', capa_incoterm: 'ddp', modo_captura: 'mxn_fijo', valor_captura: 3500 }] } });
  assert.equal(I.cuerpoIncrementablesManual({ motivo: '', conceptos: [fila], kg_base: 1000 }).error, 'Indica de dónde salen los incrementables.');
  assert.equal(I.cuerpoIncrementablesManual({ motivo: 'x', conceptos: [] }).error, 'Captura al menos un concepto.');
  assert.equal(I.cuerpoIncrementablesManual({ motivo: 'x', conceptos: [fila] }).error, 'Los gastos por embarque necesitan los kg del embarque.');
  assert.equal(I.cuerpoIncrementablesManual({ motivo: 'x', conceptos: [{ ...fila, valor_captura: 'abc' }], kg_base: 1 }).error, 'Cada concepto necesita nombre y un valor mayor o igual a 0.');
});

// ============================================================
// tests/cto-requisiciones-comun.test.mjs
// Costo · Precios de requisiciones — logica pura del front (sin DOM ni red).
// Regla §16: escrita antes del codigo y mostrada fallando.
// Datos: respuestas REALES del backend (servicio + repositorio contra
// PostgreSQL) para la 931 calculada y la 932 recibida de Co-Pack.
// Se corre con: node --test tests/cto-requisiciones-comun.test.mjs
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const C = require('../modules/cto/requisiciones-comun.js');
const API = JSON.parse(fs.readFileSync(new URL('./fixtures/cto-req-api-respuestas.json', import.meta.url)));
const ROWS_932 = JSON.parse(fs.readFileSync(new URL('./fixtures/cto-req-932-rows.json', import.meta.url)));
const P931 = API.detalle_931_calculada.partidas;

test('etiquetas de regla y de avisos en lenguaje de Costos', () => {
  assert.equal(C.etiquetaTipo('variante'), 'Variante -MQ (mismo lote)');
  assert.equal(C.etiquetaTipo('ultima_compra'), 'Última compra');
  assert.equal(C.etiquetaTipo('pendiente_lote'), 'Pendiente de lote');
  assert.equal(C.etiquetaTipo('pactado'), 'Precio pactado');
  assert.deepEqual(C.etiquetasAvisos(['variante', 'costo_antiguo', 'sin_iva_venta']),
    ['variante -MQ', 'costo antiguo', 'sin IVA de venta']);
  assert.deepEqual(C.etiquetasAvisos(['algo_nuevo']), ['algo_nuevo']);
});

test('resumen de la 931 calculada', () => {
  assert.deepEqual(C.resumen(P931), {
    total: 8, con_precio: 6, pendientes_lote: 2, sin_coincidencia: 0, sin_cantidad: 0, manuales: 1, con_avisos: 5,
  });
});

test('para aprobar faltan los renglones 5 y 8 (lotes de almacen)', () => {
  assert.deepEqual(C.faltanParaAprobar(P931), [5, 8]);
  const completas = P931.map((p) => (p.precio_final == null ? { ...p, regla: 'exacta', precio_final: 1 } : p));
  assert.deepEqual(C.faltanParaAprobar(completas), []);
  assert.deepEqual(C.faltanParaAprobar([{ renglon: 1, regla: 'sin_cantidad', precio_final: null }]), []);
});

test('estatus y ciclo', () => {
  assert.equal(C.abierta('recibida'), true);
  assert.equal(C.abierta('calculada'), true);
  assert.equal(C.abierta('aprobada'), false);
  assert.equal(C.abierta('enviada'), false);
  assert.deepEqual(C.PASOS, ['recibida', 'calculada', 'aprobada', 'enviada']);
  assert.equal(C.etiquetaStatus('calculada'), 'Calculada');
});

test('numero de requisicion: del nombre del archivo y del titulo del Excel', () => {
  assert.equal(C.numDelArchivo('REQUISICION 932.xlsx'), '932');
  assert.equal(C.numDelArchivo('RESULTADO_REQUISICION_931.xlsx'), '931');
  assert.equal(C.numDelArchivo('Requisición_1005 (2).xlsx'), '1005');
  assert.equal(C.numDelArchivo('lista copack.xlsx'), null);
  assert.equal(C.numDelTitulo(ROWS_932), '931');                // la 932 real trae el titulo de la 931
  assert.equal(C.contarPartidas(ROWS_932), 3);
});

test('edicion de precio: motivo obligatorio si difiere del sugerido', () => {
  const p7 = P931.find((p) => p.renglon === 7);
  assert.match(C.validarEdicion({ precio: '70', sugerido: p7.precio_sugerido, motivo: '' }), /motivo/i);
  assert.equal(C.validarEdicion({ precio: '70', sugerido: p7.precio_sugerido, motivo: 'Acordado' }), null);
  assert.equal(C.validarEdicion({ precio: '63.25', sugerido: p7.precio_sugerido, motivo: '' }), null);
  assert.match(C.validarEdicion({ precio: '-1', sugerido: 1, motivo: 'x' }), /precio/i);
  assert.match(C.validarEdicion({ precio: '', sugerido: 1, motivo: 'x' }), /precio/i);
  // Sin sugerido (sin coincidencia / pendiente): cualquier precio es manual.
  assert.match(C.validarEdicion({ precio: '12', sugerido: null, motivo: '' }), /motivo/i);
});

test('formatos: precio con su moneda, IVA en %, entrada usada', () => {
  assert.equal(C.fmtPrecio(63.25, 'USD'), '63.25 USD');
  assert.equal(C.fmtPrecio(69.6785, 'USD'), '69.6785 USD');
  assert.equal(C.fmtPrecio(6.5, 'MXN'), '6.50 MXN');
  assert.equal(C.fmtPrecio(null, 'USD'), '—');
  assert.equal(C.fmtIva(0.16), '16%');
  assert.equal(C.fmtIva(0), '0%');
  assert.equal(C.fmtIva(null), '—');
  const p7 = P931.find((p) => p.renglon === 7);
  assert.equal(C.entrada(p7.mov_snapshot), 'OC. 7889 I23-034 · 13/09/2023');
  assert.equal(C.entrada(null), '—');
});

test('IVA del editor: acepta 16 o 0.16; vacio = sin cambio', () => {
  assert.equal(C.ivaDeTexto('16'), 0.16);
  assert.equal(C.ivaDeTexto('0.16'), 0.16);
  assert.equal(C.ivaDeTexto('0'), 0);
  assert.equal(C.ivaDeTexto(''), undefined);
  assert.equal(C.ivaDeTexto('abc'), null);
});

// Caso real: REQUISICION 931 (09-nov-2026) trae lotes con el acento que pone
// Excel al inicio ('´605000177'); en pantalla se muestran limpios.
test('lote visible: sin el acento ni el apostrofo de Excel al inicio', () => {
  assert.equal(C.loteVisible('´605000177'), '605000177');
  assert.equal(C.loteVisible("'2026012522D0"), '2026012522D0');
  assert.equal(C.loteVisible('M26031002-03/2026620'), 'M26031002-03/2026620');
  assert.equal(C.loteVisible(null), '—');
  assert.equal(C.loteVisible('  '), '—');
});

// IVA (decision 10-nov-2026): la fuente es el catalogo de IVA por clave.
// Fixture real (servicio + PostgreSQL): r3 catalogo, r4 pactado, r6 IVA de la
// compra por confirmar, r1/r2 WWP1226 importacion sin propuesta.
test('IVA: aviso "Confirmar IVA con contabilidad" en ambar', () => {
  assert.deepEqual(C.etiquetasAvisos(['iva_por_confirmar']), ['Confirmar IVA con contabilidad']);
  assert.equal(C.esAvisoRevisar('iva_por_confirmar'), true);
});

test('IVA: la tasa se muestra con su origen', () => {
  const p = Object.fromEntries(P931.map((x) => [x.renglon, x]));
  assert.equal(C.ivaConOrigen(p[3]), '16% · catálogo');
  assert.equal(C.ivaConOrigen(p[4]), '16% · pactado');
  assert.equal(C.ivaConOrigen(p[6]), '16% · compra, por confirmar');
  assert.equal(C.ivaConOrigen(p[1]), 'Por confirmar');
  assert.equal(C.ivaConOrigen({ ...p[6], iva_origen: 'manual' }), '16% · confirmado');
  assert.equal(C.ivaConOrigen(p[8]), '—');            // pendiente de lote, sin precio
  assert.equal(C.ivaPorConfirmarSn(p[6]), true);
  assert.equal(C.ivaPorConfirmarSn(p[3]), false);
});

test('IVA: para aprobar, los renglones con precio y sin IVA confirmado son 1, 2 y 6', () => {
  assert.deepEqual(C.ivaPorConfirmar(P931), [1, 2, 6]);
  const ok = P931.map((x) => ({ ...x, iva_final: x.iva_final ?? 0.16, iva_origen: 'catalogo' }));
  assert.deepEqual(C.ivaPorConfirmar(ok), []);
});

// Facturacion (10-nov-2026): el backend manda `facturacion` (grupos por
// moneda-IVA); el front solo da formato.
test('facturacion: importes con su moneda y motivo de lo que queda fuera', () => {
  assert.equal(C.fmtImporte(8729.5, 'MXN'), '8,729.50 MXN');
  assert.equal(C.fmtImporte(0, 'USD'), '0.00 USD');
  assert.equal(C.motivoPendiente('sin_precio'), 'sin precio');
  assert.equal(C.motivoPendiente('iva_por_confirmar'), 'IVA por confirmar');
});

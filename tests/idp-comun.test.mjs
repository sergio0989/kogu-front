// Pruebas de la lógica pura del front de I+D (modules/idp/idp-comun.js).
// Casos sacados del backend real: acciones de GET /protected/idp/proyectos/:id
// (con "requiere") y del catálogo de QA (15 motivos, desarrolladores por empresa).
// Uso: node --test tests/idp-comun.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const I = require('../modules/idp/idp-comun.js');

const CATALOGO = {
  motivos: [
    { idp_motivo_id: 'm1', tipo: 'no_aprobacion', nombre: 'Precio', activo: true },
    { idp_motivo_id: 'm2', tipo: 'no_aprobacion', nombre: 'Viejo', activo: false },
    { idp_motivo_id: 'm3', tipo: 'hold', nombre: 'Pausado por el cliente', activo: true },
  ],
  desarrolladores: [{ user_id: 'dev-1', nombre: 'Sergio' }],
};
const NO_APROBADO = { a: 'no_aprobado', nombre: 'No aprobado', requiere: { motivo: 'no_aprobacion', desarrollador: false, cierre_vendido: false } };
const ASIGNADO = { a: 'asignado', nombre: 'Asignado', requiere: { motivo: null, desarrollador: true, cierre_vendido: false } };
const FINALIZADO = { a: 'finalizado', nombre: 'Finalizado', requiere: { motivo: null, desarrollador: false, cierre_vendido: true } };
const APROBADO = { a: 'aprobado', nombre: 'Aprobado', requiere: { motivo: null, desarrollador: false, cierre_vendido: false } };

test('fases del ciclo: los 16 estados ADGM caen en 5 fases; un estado nuevo cae por su categoría', () => {
  assert.deepEqual(I.FASES, ['Alta', 'Autorización', 'Desarrollo', 'Cliente', 'Cierre']);
  assert.equal(I.faseDe('generado', 'inicial'), 0);
  assert.equal(I.faseDe('asignado', 'proceso'), 1);
  assert.equal(I.faseDe('remuestreo', 'proceso'), 2);
  assert.equal(I.faseDe('hold', 'proceso'), 3);
  assert.equal(I.faseDe('cancelado', 'cancelado'), 4);
  assert.equal(I.faseDe('estado_nuevo_de_la_empresa', 'inicial'), 0);
  assert.equal(I.faseDe('estado_nuevo_de_la_empresa', 'proceso'), null);
});

test('campos del cambio de estado: solo motivos activos del tipo que pide', () => {
  const c = I.camposTransicion(NO_APROBADO, CATALOGO);
  assert.deepEqual(c.motivos.map(m => m.idp_motivo_id), ['m1']);
  assert.equal(c.desarrolladores, null); assert.equal(c.pideCierre, false);
  assert.deepEqual(I.camposTransicion(ASIGNADO, CATALOGO).desarrolladores, CATALOGO.desarrolladores);
  assert.equal(I.camposTransicion(FINALIZADO, CATALOGO).pideCierre, true);
  const libre = I.camposTransicion(APROBADO, CATALOGO);
  assert.equal(libre.motivos, null); assert.equal(libre.desarrolladores, null); assert.equal(libre.pideCierre, false);
});

test('validar antes de enviar: falta motivo, desarrollador o definir si se vendió', () => {
  assert.match(I.validarTransicion(I.camposTransicion(NO_APROBADO, CATALOGO), {}), /motivo/i);
  assert.match(I.validarTransicion(I.camposTransicion(ASIGNADO, CATALOGO), {}), /desarrollador/i);
  assert.match(I.validarTransicion(I.camposTransicion(FINALIZADO, CATALOGO), {}), /vend/i);
  assert.equal(I.validarTransicion(I.camposTransicion(FINALIZADO, CATALOGO), { cierre_vendido: 'no' }), null);
  assert.equal(I.validarTransicion(I.camposTransicion(APROBADO, CATALOGO), {}), null);
});

test('cuerpo del POST /transicion: solo lo que aplica, "vendido" como booleano', () => {
  assert.deepEqual(I.cuerpoTransicion(FINALIZADO, { cierre_vendido: 'si', comentario: '  Cerró con pedido  ', motivo_id: 'x' }),
    { a: 'finalizado', cierre_vendido: true, comentario: 'Cerró con pedido' });
  assert.deepEqual(I.cuerpoTransicion(NO_APROBADO, { motivo_id: 'm1', comentario: '' }), { a: 'no_aprobado', motivo_id: 'm1' });
  assert.deepEqual(I.cuerpoTransicion(ASIGNADO, { desarrollador_id: 'dev-1' }), { a: 'asignado', desarrollador_id: 'dev-1' });
});

test('estancado: días desde el último movimiento contra el umbral (90 por defecto)', () => {
  assert.equal(I.diasSinMovimiento('2026-07-01T10:00:00Z', '2026-10-02'), 93);
  assert.equal(I.estancado({ ultimo_evento_at: '2026-07-01T10:00:00Z', estado_categoria: 'proceso' }, '2026-10-02'), true);
  assert.equal(I.estancado({ ultimo_evento_at: '2026-07-01T10:00:00Z', estado_categoria: 'cierre' }, '2026-10-02'), false);
  assert.equal(I.estancado({ ultimo_evento_at: '2026-09-30T10:00:00Z', estado_categoria: 'proceso' }, '2026-10-02'), false);
});

test('montos: USD con separador de miles; sin dato, guion', () => {
  assert.equal(I.fmtUsd(73500), 'USD 73,500');
  assert.equal(I.fmtUsd(null), '—');
});

// ── Fichas, listas y claves (pantallas de la segunda entrega) ──
// Casos: catálogo de alérgenos del backend (10, mapeo del legado),
// reglas de publicación (descripción, organolépticos, vida útil) y
// partidas de lista (producto ERP o clave experimental, exactamente uno).

test('ficha: el formulario se convierte al contenido que espera el backend', () => {
  const c = I.contenidoFicha({
    descripcion: ' Polvo sabor queso ', ingredientes: '',
    aspecto: 'Polvo fino', color: 'Amarillo', olor: 'Queso', sabor: 'Cheddar',
    alergenos: ['leche', 'soya'],
    parametros: [{ nombre: 'Humedad', unidad: '%', min: '0', max: '5' }, { nombre: '', unidad: '', min: '', max: '' },
      { nombre: 'Cenizas', unidad: '%', min: '', max: '' }],
    empaque_mercado: 'nacional', empaque_descripcion: 'Bolsa 20 kg', transporte: '',
    vida_valor: '12', vida_unidad: 'meses',
  });
  assert.equal(c.descripcion, 'Polvo sabor queso');
  assert.equal(c.ingredientes, null);
  assert.deepEqual(c.organolepticos, { aspecto: 'Polvo fino', color: 'Amarillo', olor: 'Queso', sabor: 'Cheddar' });
  assert.deepEqual(c.alergenos, ['leche', 'soya']);
  assert.deepEqual(c.parametros, [{ nombre: 'Humedad', unidad: '%', min: 0, max: 5 }]);   // sin nombre o sin valores: no aplica
  assert.deepEqual(c.empaque, { mercado: 'nacional', descripcion: 'Bolsa 20 kg' });
  assert.deepEqual(c.vida_util, { valor: 12, unidad: 'meses' });
  assert.equal(I.contenidoFicha({ vida_valor: '' }).vida_util, null);
});

test('ficha: qué le falta para publicar (mismas reglas que el backend)', () => {
  assert.deepEqual(I.faltantesFicha({}), ['Descripción', 'Aspecto', 'Color', 'Olor', 'Sabor', 'Vida útil']);
  assert.deepEqual(I.faltantesFicha({ descripcion: 'x', organolepticos: { aspecto: 'a', color: 'c', olor: 'o', sabor: 's' },
    vida_util: { valor: 12, unidad: 'meses' } }), []);
});

test('partida de lista: exactamente un producto y precio válido; el cuerpo lleva solo el que aplica', () => {
  assert.match(I.validarPartida({ precio: '10' }), /producto/i);
  assert.match(I.validarPartida({ producto_id: 'a', precio: '' }), /precio/i);
  assert.match(I.validarPartida({ producto_id: 'a', precio: '-1' }), /precio/i);
  assert.match(I.validarPartida({ producto_id: 'a', precio: '1', cantidad_min: '500', cantidad_max: '100' }), /cantidad/i);
  assert.equal(I.validarPartida({ producto_desarrollo_id: 'pd1', precio: '85.5' }), null);
  assert.deepEqual(I.cuerpoPartida({ tipo: 'experimental', producto_id: 'erp-1', producto_desarrollo_id: 'pd1', precio: '85.5', impuesto_pct: '', cantidad_min: '500' }),
    { producto_desarrollo_id: 'pd1', precio: 85.5, cantidad_min: 500 });
  assert.deepEqual(I.cuerpoPartida({ tipo: 'erp', producto_id: 'erp-1', producto_desarrollo_id: 'pd1', precio: '12.5', impuesto_pct: '16', descripcion: ' ' }),
    { producto_id: 'erp-1', precio: 12.5, impuesto_pct: 16 });
});

test('lista: etiqueta y color por estado efectivo (vencida se calcula por fecha)', () => {
  assert.equal(I.estadoLista({ estado: 'vigente', vigencia_fin: '2026-10-01' }, '2026-10-02'), 'vencida');
  assert.equal(I.estadoLista({ estado: 'vigente', vigencia_fin: '2026-10-02' }, '2026-10-02'), 'vigente');
  assert.equal(I.estadoLista({ estado: 'por_aprobar', estado_efectivo: 'por_aprobar' }, '2026-10-02'), 'por_aprobar');
  assert.equal(I.ETIQUETA_LISTA.por_aprobar, 'Por aprobar');
});

test('precio: 2 decimales, o 4 si trae fracción más fina', () => {
  assert.equal(I.fmtPrecio('12.5000'), '12.50');
  assert.equal(I.fmtPrecio(62.4744), '62.4744');
  assert.equal(I.fmtPrecio(null), '—');
});

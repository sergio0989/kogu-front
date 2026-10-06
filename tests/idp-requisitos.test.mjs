// Pestaña Requisitos del proyecto y piezas de muestra (modules/idp/idp-comun.js).
// Contrato del backend (qa/idp-requisitos.test.mjs): 21 campos, PATCH combina con lo
// guardado y null borra. Caso real: línea "Ajos y Cebollas" en QA con
// requisitos [etiquetado, estado_fisico, envase, certificacion]; muestra del CRM
// "1 pieza de 200 Gramos".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const I = require('../modules/idp/idp-comun.js');

const AJOS = { catalogo: 'linea', clave: 'ajos_cebollas', config: { requisitos: ['etiquetado', 'estado_fisico', 'envase', 'certificacion'] } };
const SIN = { catalogo: 'linea', clave: 'tomates', config: {} };

test('bloques a mostrar: los que pide la línea; sin línea o sin definir → todos', () => {
  assert.deepEqual(I.bloquesRequisitos(AJOS), ['etiquetado', 'estado_fisico', 'envase', 'certificacion']);
  assert.deepEqual(I.bloquesRequisitos(SIN), I.CATALOGOS_REQUISITO);
  assert.deepEqual(I.bloquesRequisitos(null), I.CATALOGOS_REQUISITO);
});

test('campos de cada bloque: certificación y documentación llevan su "otro"; generales siempre', () => {
  assert.deepEqual(I.camposDeBloques(['etiquetado', 'certificacion']),
    ['etiquetado', 'certificaciones', 'certificacion_otro', ...I.CAMPOS_REQUISITO_GENERALES]);
  assert.deepEqual(I.camposDeBloques(['documento']),
    ['documentos_requeridos', 'documento_requerido_otro', 'documentos_entregados', 'documento_entregado_otro', ...I.CAMPOS_REQUISITO_GENERALES]);
  assert.deepEqual(I.CAMPOS_REQUISITO_GENERALES, ['termoresistente', 'alergenos', 'alergenos_lista', 'proceso', 'dosis', 'vida_anaquel_meses', 'direccion_envio']);
});

test('lo que se envía: solo lo que cambió; lo que se vació va como null; listas por contenido', () => {
  const guardado = { etiquetado: 'natural', proceso: 'Horneado', certificaciones: ['kosher', 'fda'], dosis: 1.5 };
  assert.deepEqual(I.cuerpoRequisitos({ etiquetado: 'natural', proceso: '', certificaciones: ['fda', 'kosher'], dosis: '1.5', envase: 'cubeta' }, guardado),
    { proceso: null, envase: 'cubeta' });
  assert.deepEqual(I.cuerpoRequisitos({ certificaciones: [] , dosis: '2' }, guardado), { certificaciones: null, dosis: 2 });
  assert.deepEqual(I.cuerpoRequisitos({ termoresistente: false }, {}), { termoresistente: false });
  assert.deepEqual(I.cuerpoRequisitos({ termoresistente: null }, { termoresistente: true }), { termoresistente: null });
  assert.equal(I.cuerpoRequisitos({ etiquetado: 'natural' }, guardado), null);
});

test('muestra: piezas y contenido como en el CRM', () => {
  assert.equal(I.porcionMuestra({ piezas: 1, cantidad: '200.000', unidad: 'g' }), '1 pieza de 200 g');
  assert.equal(I.porcionMuestra({ piezas: 2, cantidad: 1.5, unidad: 'kg' }), '2 piezas de 1.5 kg');
  assert.equal(I.porcionMuestra({ piezas: null, cantidad: 30, unidad: 'ml' }), '30 ml');
  assert.equal(I.porcionMuestra({ piezas: 3 }), '3 piezas');
  assert.equal(I.porcionMuestra({}), '');
});

test('validar piezas antes de enviar: entero ≥ 1 u omitido', () => {
  assert.equal(I.validarPiezas(''), null);
  assert.equal(I.validarPiezas('2'), null);
  for (const p of ['0', '-1', '1.5', 'x']) assert.match(I.validarPiezas(p), /piezas/i, p);
});

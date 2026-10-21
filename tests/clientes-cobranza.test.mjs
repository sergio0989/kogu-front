// Clientes · pestaña Cobranza y contactos (F0 del módulo de cobranza).
// Lógica pura de modules/core/clientes/clientes-cobranza.js.
// Casos reales: ALYS ALIMENTOS crédito 15 días (export SAI 20-oct); Unilever
// Manufacturera cobra por plataforma de factoraje; Tecsa A 23656 a junta;
// Roxana Hernandez = contacto de pagos de ADVANCED APPEALING (cve 111).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const C = createRequire(import.meta.url)('../modules/core/clientes/clientes-cobranza.js');

const VACIO = {
  condicion_pago: 'contado', dias_credito: null, limite_credito: null, moneda_limite: 'MXN', tipo_fecha: 'factura',
  rev_lu: false, rev_ma: false, rev_mi: false, rev_ju: false, rev_vi: false, rev_sa: false, rev_do: false,
  hora_revision_ini: null, hora_revision_fin: null,
  cob_lu: false, cob_ma: false, cob_mi: false, cob_ju: false, cob_vi: false, cob_sa: false, cob_do: false,
  hora_cobro_ini: null, hora_cobro_fin: null,
  usa_portal_facturas: false, url_portal_facturas: null, usuario_portal_fact: null, tiene_pass_portal_fact: false,
  usa_portal_pagos: false, url_portal_pagos: null, usuario_portal_pago: null, tiene_pass_portal_pago: true,
  cobro_factoraje: false, plataforma_factoraje: null, envio_edo_cta: 'no_aplica', responsable_cobranza_id: null,
  bloqueo_credito: false, bloqueo_motivo: null,
};
const form = (cambios = {}) => ({ ...C.formDesdeCliente(VACIO), ...cambios });

test('sin cambios no viaja nada (null)', () => {
  assert.equal(C.cuerpoCobranza(VACIO, form()), null);
});

test('crédito: solo viaja lo que cambió, con números de verdad', () => {
  assert.deepEqual(C.cuerpoCobranza(VACIO, form({ condicion_pago: 'credito', dias_credito: '15', limite_credito: '70,000' })),
    { condicion_pago: 'credito', dias_credito: 15, limite_credito: 70000 });
});

test('días de crédito no numéricos o negativos: error', () => {
  assert.throws(() => C.cuerpoCobranza(VACIO, form({ dias_credito: 'quince' })), /días de crédito/i);
  assert.throws(() => C.cuerpoCobranza(VACIO, form({ dias_credito: '-5' })), /días de crédito/i);
});

test('vaciar días de crédito viaja como null', () => {
  assert.deepEqual(C.cuerpoCobranza({ ...VACIO, dias_credito: 30 }, form({ dias_credito: '' })), { dias_credito: null });
});

test('días de revisión y de cobro viajan como booleanos', () => {
  assert.deepEqual(C.cuerpoCobranza(VACIO, form({ tipo_fecha: 'revision', rev_ma: true, cob_vi: true, hora_cobro_ini: '09:00' })),
    { tipo_fecha: 'revision', rev_ma: true, cob_vi: true, hora_cobro_ini: '09:00' });
});

test('factoraje (Unilever) con su plataforma', () => {
  assert.deepEqual(C.cuerpoCobranza(VACIO, form({ cobro_factoraje: true, plataforma_factoraje: ' Plataforma Unilever ' })),
    { cobro_factoraje: true, plataforma_factoraje: 'Plataforma Unilever' });
});

test('modo de estado de cuenta', () => {
  assert.deepEqual(C.cuerpoCobranza(VACIO, form({ envio_edo_cta: 'manual' })), { envio_edo_cta: 'manual' });
});

test('responsable vacío viaja como null', () => {
  assert.deepEqual(C.cuerpoCobranza({ ...VACIO, responsable_cobranza_id: 'u-1' }, form({ responsable_cobranza_id: '' })),
    { responsable_cobranza_id: null });
});

test('bloquear crédito sin motivo: error; con motivo viajan los dos', () => {
  assert.throws(() => C.cuerpoCobranza(VACIO, form({ bloqueo_credito: true, bloqueo_motivo: '  ' })), /motivo/i);
  assert.deepEqual(C.cuerpoCobranza(VACIO, form({ bloqueo_credito: true, bloqueo_motivo: 'A 23656 +90, a junta' })),
    { bloqueo_credito: true, bloqueo_motivo: 'A 23656 +90, a junta' });
});

test('desbloquear manda solo bloqueo_credito=false (el servidor limpia el resto)', () => {
  const bloqueado = { ...VACIO, bloqueo_credito: true, bloqueo_motivo: 'x' };
  assert.deepEqual(C.cuerpoCobranza(bloqueado, form({ ...C.formDesdeCliente(bloqueado), bloqueo_credito: false })),
    { bloqueo_credito: false });
});

test('contraseña de portal: solo viaja si se escribió una nueva; borrar es explícito', () => {
  assert.equal(C.formDesdeCliente(VACIO).pass_portal_pago, '', 'el formulario nunca trae la contraseña');
  assert.deepEqual(C.cuerpoCobranza(VACIO, form({ pass_portal_pago: 'nueva' })), { pass_portal_pago: 'nueva' });
  assert.deepEqual(C.cuerpoCobranza(VACIO, form({ borrar_pass_portal_pago: true })), { borrar_pass_portal_pago: true });
});

test('estado de la contraseña para mostrar', () => {
  assert.equal(C.estadoPass(VACIO, 'pago'), 'Hay una contraseña guardada');
  assert.equal(C.estadoPass(VACIO, 'fact'), 'Sin contraseña');
});

test('contacto: nombre obligatorio, email en minúsculas, rol por omisión cobranza', () => {
  assert.throws(() => C.cuerpoContacto({ nombre: ' ' }), /nombre/i);
  assert.deepEqual(C.cuerpoContacto({ nombre: ' Roxana Hernandez ', rol: 'pagos', email: 'Pagos@Cliente.MX', telefono: '', recibe_edo_cta: true, principal: true }),
    { nombre: 'Roxana Hernandez', rol: 'pagos', email: 'pagos@cliente.mx', telefono: null, whatsapp: null, puesto: null, recibe_edo_cta: true, principal: true });
  assert.equal(C.cuerpoContacto({ nombre: 'X' }).rol, 'cobranza');
});

test('contacto que recibe estado de cuenta sin email: error', () => {
  assert.throws(() => C.cuerpoContacto({ nombre: 'X', recibe_edo_cta: true, email: '' }), /email/i);
});

test('etiquetas de rol', () => {
  assert.equal(C.ROLES.cxp, 'Cuentas por pagar del cliente');
  assert.equal(C.ROLES.pagos, 'Pagos');
});

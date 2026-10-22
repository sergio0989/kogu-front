// Clientes · ficha con pestañas General / Cobranza / Contactos (F0 cobranza).
// Pantalla completa en jsdom con la API simulada y styles.css REAL cargado.
// La logica pura tiene su propia prueba (clientes-cobranza.test.mjs).
//
// Caso real (dev.kogu.ink, 2026-10-21): con la pestana Contactos activa se
// veian tambien General y Cobranza. El atributo hidden si cambiaba, pero
// .stack{display:grid} le gana; la version anterior de esta prueba solo
// revisaba el atributo. Ahora se revisa el display calculado.
// Decision del usuario: la edicion se abre en un modal (la pantalla
// dividida quedaba muy corta).
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const verde = [], rojo = [];
const check = async (n, f) => { try { await f(); verde.push(n); } catch (e) { rojo.push([n, String(e.message).split('\n')[0]]); } };
const src = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');

const LISTA = [{ cliente_id: 'c-111', nombre: 'ADVANCED APPEALING TECHNOLOGIES', rfc: 'AAT000101AAA', cve_cte: '111', activo: true }];
const DETALLE = { ...LISTA[0], condicion_pago: 'credito', dias_credito: 30, limite_credito: '800000', moneda_limite: 'MXN', tipo_fecha: 'factura',
  rev_ma: true, hora_cobro_ini: '09:00:00', usa_portal_pagos: true, usuario_portal_pago: 'cobranza', tiene_pass_portal_pago: true, tiene_pass_portal_fact: false,
  cobro_factoraje: false, envio_edo_cta: 'no_aplica', responsable_cobranza_id: null, bloqueo_credito: false, bloqueo_motivo: null };
const CONTACTOS = [{ contacto_id: 'k-1', nombre: 'Roxana Hernandez', rol: 'pagos', email: 'pagos@aat.mx', recibe_edo_cta: true, principal: true, activo: true }];

async function montar({ permisos = [], falla400 = false } = {}) {
  const css = src('assets/styles.css');
  const dom = new JSDOM(`<!doctype html><style>${css}</style><div id="app"><div id="pageContent"></div></div>`, { runScripts: 'outside-only', url: 'https://dev.kogu.ink/modules/core/clientes/clientes.html' });
  const w = dom.window;
  const llamadas = [], toasts = [];
  w.KoguUi = { escapeHtml: (s) => String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])), statusBadge: (v) => v };
  w.KoguShell = { initShell: async () => ({ permissions: permisos }), subscribeEmpresaActivaChange: () => {} };
  w.KoguApi = {
    toast: (m, t) => toasts.push([t, m]),
    unwrapRows: (r) => (r && r.data && r.data.rows) || (r && r.data) || r,
    apiFetch: async (path, opt = {}) => {
      const m = opt.method || 'GET'; const body = opt.body ? JSON.parse(opt.body) : null;
      llamadas.push([m, path, body]);
      if (path === '/protected/core/clientes' && m === 'GET') return { data: { rows: LISTA } };
      if (path === '/protected/core/clientes/c-111' && m === 'GET') return { data: DETALLE };
      if (path === '/protected/core/clientes/c-111' && m === 'PUT') {
        if (falla400) { const e = new Error('envio_edo_cta debe ser automatico, manual o no_aplica.'); e.status = 400; throw e; }
        return { data: { ...DETALLE, ...body } };
      }
      if (path === '/protected/core/clientes/c-111/status' && m === 'PUT') return { data: { ...DETALLE, activo: body.activo } };
      if (path === '/protected/core/clientes/c-111/contactos' && m === 'GET') return { data: { rows: CONTACTOS } };
      if (path === '/protected/core/clientes/c-111/contactos' && m === 'POST') return { data: { contacto_id: 'k-2', ...body } };
      if (path === '/protected/core/usuarios') return { data: [{ user_id: 'u-marce', nombre: 'Marcela', activo: true }] };
      throw new Error('ruta no simulada ' + m + ' ' + path);
    },
  };
  w.eval(src('modules/core/clientes/clientes-cobranza.js'));
  w.eval(src('modules/core/clientes/clientes.js'));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  const espera = () => new Promise((r) => setTimeout(r, 30));
  await espera();
  const $ = (id) => w.document.getElementById(id);
  const editar = async () => { w.document.querySelector('.btn-edit').click(); await espera(); };
  // jsdom trata [hidden] como oculto aunque una clase diga display:grid; Chrome
  // NO (asi nacio el bug). Por eso se exige display:none explicito en el estilo.
  const visible = (id) => $(id).style.display !== 'none' && w.getComputedStyle($(id)).display !== 'none';
  const oculta = (id) => $(id).style.display === 'none';
  return { w, $, llamadas, toasts, espera, editar, visible, oculta };
}

await check('al editar trae el cliente completo y llena la pestaña Cobranza', async () => {
  const t = await montar();
  await t.editar();
  assert.ok(t.llamadas.some(([m, p]) => m === 'GET' && p === '/protected/core/clientes/c-111'));
  assert.equal(t.$('cb_condicion_pago').value, 'credito');
  assert.equal(t.$('cb_dias_credito').value, '30');
  assert.equal(t.$('cb_rev_ma').checked, true);
  assert.equal(t.$('cb_hora_cobro_ini').value, '09:00');
  assert.equal(t.$('cb_pass_portal_pago').value, '', 'la contraseña nunca se precarga');
  assert.match(t.$('cb_estado_pago').textContent, /guardada/);
});

await check('guardar manda lo general + solo lo que cambió de cobranza', async () => {
  const t = await montar();
  await t.editar();
  t.$('cb_dias_credito').value = '15';
  t.$('cb_cobro_factoraje').checked = true;
  t.$('cb_plataforma_factoraje').value = 'Plataforma Unilever';
  t.$('saveBtn').click(); await t.espera();
  const put = t.llamadas.find(([m, p]) => m === 'PUT' && p === '/protected/core/clientes/c-111');
  assert.ok(put, 'hubo PUT');
  assert.deepEqual(put[2], { nombre: 'ADVANCED APPEALING TECHNOLOGIES', rfc: 'AAT000101AAA', cve_cte: '111', activo: true,
    dias_credito: 15, cobro_factoraje: true, plataforma_factoraje: 'Plataforma Unilever' });
});

await check('bloquear sin motivo avisa y no llama a la API', async () => {
  const t = await montar();
  await t.editar();
  t.$('cb_bloqueo_credito').checked = true;
  t.$('saveBtn').click(); await t.espera();
  assert.ok(!t.llamadas.some(([m]) => m === 'PUT'));
  assert.ok(t.toasts.some(([tipo, m]) => tipo === 'error' && /motivo/i.test(m)));
});

await check('un 400 del servidor se avisa (api.js no lo hace)', async () => {
  const t = await montar({ falla400: true });
  await t.editar();
  t.$('cb_envio_edo_cta').value = 'manual';
  t.$('saveBtn').click(); await t.espera();
  assert.ok(t.toasts.some(([tipo, m]) => tipo === 'error' && /envio_edo_cta/.test(m)));
});

await check('contactos: se listan y se agregan al cliente abierto', async () => {
  const t = await montar();
  assert.equal(t.oculta('ctPanel'), true, 'sin cliente no hay panel');
  await t.editar();
  assert.equal(t.visible('ctPanel'), true);
  assert.match(t.$('ctRows').textContent, /Roxana Hernandez/);
  t.$('ctAgregar').click();
  t.$('ct_nombre').value = 'Carmen Murillo'; t.$('ct_rol').value = 'cobranza'; t.$('ct_email').value = 'Cobranza@AAT.mx';
  t.$('ctGuardar').click(); await t.espera();
  const post = t.llamadas.find(([m, p]) => m === 'POST' && p.endsWith('/contactos'));
  assert.equal(post[2].email, 'cobranza@aat.mx');
  assert.equal(post[2].nombre, 'Carmen Murillo');
});

await check('sin permiso de usuarios: responsable deshabilitado, sin llamar a /usuarios', async () => {
  const t = await montar({ permisos: ['screen.catalogos.clientes'] });
  assert.equal(t.$('cb_responsable_cobranza_id').disabled, true);
  assert.match(t.$('cb_resp_aviso').textContent, /administrador/);
  assert.ok(!t.llamadas.some(([, p]) => p === '/protected/core/usuarios'));
});

await check('con permiso de usuarios: la lista de responsables se llena', async () => {
  const t = await montar({ permisos: ['screen.catalogos.usuarios'] });
  assert.match(t.$('cb_responsable_cobranza_id').innerHTML, /Marcela/);
});

await check('pestañas: solo se VE una a la vez (estilos reales)', async () => {
  const t = await montar();
  await t.editar();
  t.w.document.querySelector('#clTabs .tab[data-tab="contactos"]').click();
  assert.equal(t.visible('tab-contactos'), true, 'contactos visible');
  assert.equal(t.oculta('tab-general'), true, 'general oculta');
  assert.equal(t.oculta('tab-cobranza'), true, 'cobranza oculta');
});

await check('la ficha se abre en modal al editar', async () => {
  const t = await montar();
  assert.ok(t.$('clModal'), 'existe el modal');
  assert.equal(t.visible('clModal'), false, 'cerrado al cargar');
  await t.editar();
  assert.equal(t.visible('clModal'), true, 'abierto al editar');
  assert.match(t.$('modeChip').textContent, /Edición/);   // el título ahora es el nombre del cliente
});

await check('cerrar el modal lo oculta', async () => {
  const t = await montar();
  await t.editar();
  t.$('clCerrar').click();
  assert.equal(t.visible('clModal'), false);
});

await check('Nuevo cliente abre el modal vacío en la pestaña General', async () => {
  const t = await montar();
  await t.editar();
  t.w.document.querySelector('#clTabs .tab[data-tab="cobranza"]').click();
  t.$('clCerrar').click();
  t.$('newBtn').click();
  assert.equal(t.visible('clModal'), true);
  assert.equal(t.$('nombre').value, '');
  assert.equal(t.visible('tab-general'), true);
  assert.equal(t.oculta('tab-cobranza'), true);
});

// ── Rediseño 21-oct ("lo puedes hacer mejor"): encabezado con contexto, pie
// según pestaña, campos que aparecen solo cuando aplican, contacto a demanda.
await check('el encabezado muestra el nombre y los chips del cliente', async () => {
  const t = await montar();
  await t.editar();
  assert.match(t.$('formTitle').textContent, /ADVANCED APPEALING/);
  assert.match(t.$('clChips').textContent, /SAI 111/);
  assert.match(t.$('clChips').textContent, /Crédito 30 días/);
  assert.match(t.$('clMetrics').textContent, /Contactos/);
});

await check('en Contactos el pie no ofrece Guardar ni Cambiar status', async () => {
  const t = await montar();
  await t.editar();
  assert.equal(t.visible('saveBtn'), true);
  assert.equal(t.visible('statusBtn'), true, 'status en General');
  t.w.document.querySelector('#clTabs .tab[data-tab="cobranza"]').click();
  assert.equal(t.oculta('statusBtn'), true, 'status solo en General');
  t.w.document.querySelector('#clTabs .tab[data-tab="contactos"]').click();
  assert.equal(t.oculta('saveBtn'), true);
});

await check('el formulario de contacto se abre a demanda', async () => {
  const t = await montar();
  await t.editar();
  assert.equal(t.oculta('ctForm'), true, 'cerrado al entrar');
  t.$('ctAgregar').click();
  assert.equal(t.visible('ctForm'), true);
  t.$('ctNuevo').click();
  assert.equal(t.oculta('ctForm'), true, 'cancelar lo cierra');
});

await check('plataforma de factoraje solo aparece al marcar factoraje', async () => {
  const t = await montar();
  await t.editar();
  assert.equal(t.oculta('cbWrapPlataforma'), true);
  t.$('cb_cobro_factoraje').click();
  assert.equal(t.visible('cbWrapPlataforma'), true);
});

await check('motivo de bloqueo solo aparece al bloquear', async () => {
  const t = await montar();
  await t.editar();
  assert.equal(t.oculta('cbWrapBloqueo'), true);
  t.$('cb_bloqueo_credito').click();
  assert.equal(t.visible('cbWrapBloqueo'), true);
});

// Caso real (2026-10-22): Unilever cobra por factoraje y no entra en la
// sesion semanal; el usuario pidio "basta con un si/no por cliente".
await check('revisión en sesión: marcado por omisión, sin motivo visible', async () => {
  const t = await montar();
  await t.editar();
  assert.equal(t.$('cb_cob_revision_sesion').checked, true);
  assert.equal(t.oculta('cbWrapRevision'), true);
});

await check('quitar la revisión pide motivo y lo manda al guardar', async () => {
  const t = await montar();
  await t.editar();
  t.$('cb_cob_revision_sesion').click();
  assert.equal(t.visible('cbWrapRevision'), true);
  t.$('saveBtn').click(); await t.espera();
  assert.ok(!t.llamadas.some(([m]) => m === 'PUT'), 'sin motivo no guarda');
  assert.ok(t.toasts.some(([tipo, m]) => tipo === 'error' && /por qué/i.test(m)));
  t.$('cb_cob_revision_motivo').value = 'factoraje';
  t.$('saveBtn').click(); await t.espera();
  const put = t.llamadas.find(([m, p]) => m === 'PUT' && p === '/protected/core/clientes/c-111');
  assert.equal(put[2].cob_revision_sesion, false);
  assert.equal(put[2].cob_revision_motivo, 'factoraje');
});

await check('el select de motivo trae los 4 motivos', async () => {
  const t = await montar();
  await t.editar();
  const v = [...t.$('cb_cob_revision_motivo').options].map((o) => o.value).filter(Boolean);
  assert.deepEqual(v, ['factoraje', 'intercompania', 'juridico', 'otro']);
});

await check('avisa "cambios sin guardar" al modificar', async () => {
  const t = await montar();
  await t.editar();
  assert.equal(t.oculta('clDirty'), true);
  t.$('cb_dias_credito').value = '45';
  t.$('cb_dias_credito').dispatchEvent(new t.w.Event('input', { bubbles: true }));
  assert.equal(t.visible('clDirty'), true);
});

// Caso real (revision de codigo 2026-10-21): el boton leia un campo #status
// que no existe en el formulario; tronaba antes de llamar a la API.
await check('Cambiar status desactiva al cliente activo (antes tronaba)', async () => {
  const t = await montar();
  await t.editar();
  assert.match(t.$('statusBtn').textContent, /Desactivar/);
  t.$('statusBtn').click(); await t.espera();
  const put = t.llamadas.find(([m, p]) => m === 'PUT' && p === '/protected/core/clientes/c-111/status');
  assert.ok(put, 'hubo PUT a /status');
  assert.deepEqual(put[2], { activo: false });
  assert.equal(t.$('activo').value, 'false');
  assert.match(t.$('statusBtn').textContent, /Activar/);
  assert.ok(!t.toasts.some(([tipo]) => tipo === 'error'), 'sin errores');
});

for (const n of verde) console.log('ok -', n);
for (const [n, e] of rojo) console.log('not ok -', n, '::', e);
console.log(`# pass ${verde.length}\n# fail ${rojo.length}`);
if (rojo.length) process.exit(1);

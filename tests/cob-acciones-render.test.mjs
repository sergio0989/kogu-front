// ============================================================
// tests/cob-acciones-render.test.mjs
// Cobranza F1b · pantalla del catálogo de tipos de acción (solo administradores).
// Regla §16: escrita antes de la pantalla y mostrada fallando.
// Datos: las 8 acciones sembradas desde los comentarios del reporte de
// Facturación del 16-oct, como las regresa GET /protected/cob/acciones/admin
// (con usos = seguimientos vigentes). "Sin respuesta" desactivada para la prueba.
// Se corre con: node --test tests/cob-acciones-render.test.mjs
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import fs from 'node:fs';

const JS = fs.readFileSync(new URL('../modules/cob/acciones/acciones.js', import.meta.url), 'utf8');
const ACCIONES = [
  ['a-1', 'seguimiento', 'Seguimiento enviado', false, 10, 12, true], ['a-2', 'sin_respuesta', 'Sin respuesta', false, 20, 0, false],
  ['a-3', 'edo_cta', 'Estado de cuenta enviado', false, 30, 3, true], ['a-4', 'promesa_pago', 'Promesa de pago', true, 40, 1, true],
  ['a-5', 'programada_pago', 'Programada para pago', true, 50, 2, true], ['a-6', 'disposicion', 'Disposición (factoraje)', true, 60, 0, true],
  ['a-7', 'junta', 'Junta / escalamiento', true, 70, 1, true], ['a-8', 'otro', 'Otro', false, 90, 0, true],
].map(([accion_id, clave, nombre, requiere_fecha, orden, usos, activo]) => ({ accion_id, clave, nombre, requiere_fecha, orden, usos, activo }));
const err = (status, code, message) => Object.assign(new Error(message), { status, code });

async function arranca({ falla = null } = {}) {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div></body></html>',
    { url: 'https://kogu.test/modules/cob/acciones/acciones.html', runScripts: 'outside-only' });
  const { window } = dom;
  const pedidos = []; const toasts = [];
  let alCambiarEmpresa = null;
  window.KoguShell = {
    initShell: async (o) => {
      window.__init = o;
      const d = window.document.createElement('div'); d.id = 'pageContent';
      window.document.getElementById('app').appendChild(d);
      return { ok: true, permissions: ['cob.acciones.manage'] };
    },
    subscribeEmpresaActivaChange: (fn) => { alCambiarEmpresa = fn; },
  };
  window.KoguApi = {
    apiFetch: async (u, o = {}) => {
      pedidos.push({ u, method: o.method || 'GET', body: o.body ? JSON.parse(o.body) : null });
      if (falla && falla.ruta.test(u) && (o.method || 'GET') !== 'GET') throw falla.error;
      if (u === '/protected/cob/acciones/admin') return { ok: true, data: ACCIONES };
      if (u === '/protected/cob/acciones' && o.method === 'POST') return { ok: true, data: { accion_id: 'a-new', ...JSON.parse(o.body), activo: true } };
      if (/^\/protected\/cob\/acciones\/[^/]+$/.test(u) && o.method === 'PUT') return { ok: true, data: { accion_id: u.split('/').pop(), ...JSON.parse(o.body) } };
      throw new Error('ruta no esperada ' + u);
    },
    toast: (m, t) => toasts.push([t, m]),
  };
  window.KoguUi = { escapeHtml: (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') };
  window.eval(JS);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  await new Promise((r) => setTimeout(r, 100));
  const $ = (s) => window.document.querySelector(s);
  const $$ = (s) => [...window.document.querySelectorAll(s)];
  const texto = (el = window.document.getElementById('app')) => el.textContent.replace(/\s+/g, ' ').trim();
  const espera = () => new Promise((r) => setTimeout(r, 50));
  const fila = (id) => $(`tr[data-accion="${id}"]`);
  const envios = () => pedidos.filter((p) => p.method !== 'GET');
  // jsdom dispara su propio DOMContentLoaded además del de la prueba: se cuentan
  // las cargas del catálogo a partir de aquí, no desde cero.
  const cargas0 = pedidos.filter((x) => x.u === '/protected/cob/acciones/admin').length;
  const recargas = () => pedidos.filter((x) => x.u === '/protected/cob/acciones/admin').length - cargas0;
  return { window, pedidos, toasts, $, $$, texto, espera, fila, envios, recargas, cambiarEmpresa: async () => { await alCambiarEmpresa(); await espera(); } };
}

test('exige cob.acciones.manage; lista las 8 acciones por orden con usos, si piden fecha y su estado', async () => {
  const p = await arranca();
  assert.equal(p.window.__init.requiredPermission, 'cob.acciones.manage');
  assert.equal(p.window.__init.currentPage, '/modules/cob/acciones/acciones.html');
  assert.ok(p.pedidos.some((x) => x.u === '/protected/cob/acciones/admin'));
  assert.deepEqual(p.$$('#cobAccTabla tbody tr').map((tr) => tr.dataset.accion), ['a-1', 'a-2', 'a-3', 'a-4', 'a-5', 'a-6', 'a-7', 'a-8']);
  assert.match(p.texto(p.fila('a-1')), /Seguimiento enviado.*12.*Activa/);
  assert.match(p.texto(p.fila('a-4')), /Promesa de pago.*Pide fecha/);
  assert.match(p.texto(p.fila('a-2')), /Sin respuesta.*Inactiva/);
  assert.match(p.texto(p.fila('a-2').querySelector('[data-estado]')), /Activar/);
  assert.match(p.texto(p.fila('a-1').querySelector('[data-estado]')), /Desactivar/);
  assert.match(p.texto(p.$('#cobAccResumen')), /7 activas · 1 inactiva/);
});

test('nueva acción: manda nombre y si pide fecha; recarga la lista y avisa', async () => {
  const p = await arranca();
  p.$('#cobAccNueva').click(); await p.espera();
  assert.notEqual(p.$('#cobAccModal').style.display, 'none');
  p.$('#cobAccNombre').value = '  Pago parcial recibido ';
  p.$('#cobAccFecha').checked = true;
  p.$('#cobAccGuardar').click(); await p.espera();
  const [e] = p.envios();
  assert.deepEqual([e.u, e.method, e.body], ['/protected/cob/acciones', 'POST', { nombre: 'Pago parcial recibido', requiere_fecha: true }]);
  assert.equal(p.$('#cobAccModal').style.display, 'none');
  assert.equal(p.recargas(), 1, 'recarga la lista después de crear');
  assert.ok(p.toasts.some(([t, m]) => t === 'success' && /Pago parcial recibido/.test(m)));
});

test('nueva acción sin nombre: aviso en el formulario y no llama a la API', async () => {
  const p = await arranca();
  p.$('#cobAccNueva').click(); await p.espera();
  p.$('#cobAccGuardar').click(); await p.espera();
  assert.equal(p.envios().length, 0);
  assert.match(p.texto(p.$('#cobAccMsg')), /nombre/i);
});

test('editar: precarga, muestra la clave interna y manda solo lo que cambió', async () => {
  const p = await arranca();
  p.fila('a-6').querySelector('[data-editar]').click(); await p.espera();
  assert.equal(p.$('#cobAccNombre').value, 'Disposición (factoraje)');
  assert.equal(p.$('#cobAccFecha').checked, true);
  assert.equal(p.$('#cobAccOrden').value, '60');
  assert.match(p.texto(p.$('#cobAccClave')), /disposicion/);
  p.$('#cobAccOrden').value = '15';
  p.$('#cobAccGuardar').click(); await p.espera();
  const [e] = p.envios();
  assert.deepEqual([e.u, e.method, e.body], ['/protected/cob/acciones/a-6', 'PUT', { orden: 15 }]);
});

test('editar sin cambios: avisa y no llama a la API', async () => {
  const p = await arranca();
  p.fila('a-1').querySelector('[data-editar]').click(); await p.espera();
  p.$('#cobAccGuardar').click(); await p.espera();
  assert.equal(p.envios().length, 0);
  assert.match(p.texto(p.$('#cobAccMsg')), /no hay cambios/i);
});

test('desactivar y activar desde la tabla', async () => {
  const p = await arranca();
  p.fila('a-6').querySelector('[data-estado]').click(); await p.espera();
  p.fila('a-2').querySelector('[data-estado]').click(); await p.espera();
  assert.deepEqual(p.envios().map((e) => [e.u, e.body]), [['/protected/cob/acciones/a-6', { activo: false }], ['/protected/cob/acciones/a-2', { activo: true }]]);
});

test('error del servidor en el formulario (nombre repetido): se muestra en el formulario y no se cierra', async () => {
  const p = await arranca({ falla: { ruta: /\/protected\/cob\/acciones$/, error: err(409, 'COB_ACCION_DUPLICADA', 'Ya existe una acción llamada "Promesa de pago".') } });
  p.$('#cobAccNueva').click(); await p.espera();
  p.$('#cobAccNombre').value = 'promesa de PAGO';
  p.$('#cobAccGuardar').click(); await p.espera();
  assert.notEqual(p.$('#cobAccModal').style.display, 'none');
  assert.match(p.texto(p.$('#cobAccMsg')), /Ya existe una acción llamada "Promesa de pago"/);
});

// El servidor responde 422 y api.js ya muestra su mensaje: la pantalla no lo repite.
// Otros errores (p. ej. 400 de validación) sí los avisa la pantalla.
test('desactivar la última activa (422): se intenta, no se duplica el aviso de api.js; un 400 sí se avisa', async () => {
  const p = await arranca({ falla: { ruta: /a-8$/, error: err(422, 'COB_ACCION_ULTIMA_ACTIVA', 'Debe quedar al menos un tipo de acción activo.') } });
  p.fila('a-8').querySelector('[data-estado]').click(); await p.espera();
  assert.deepEqual(p.envios().map((e) => [e.u, e.body]), [['/protected/cob/acciones/a-8', { activo: false }]]);
  assert.equal(p.toasts.length, 0);
  const q = await arranca({ falla: { ruta: /a-1$/, error: err(400, 'COB_ACCION_CAMPO', 'activo debe ser verdadero o falso.') } });
  q.fila('a-1').querySelector('[data-estado]').click(); await q.espera();
  assert.ok(q.toasts.some(([t, m]) => t === 'error' && /verdadero o falso/.test(m)));
});

test('cambio de empresa: cierra el formulario y vuelve a pedir el catálogo', async () => {
  const p = await arranca();
  p.$('#cobAccNueva').click(); await p.espera();
  await p.cambiarEmpresa();
  assert.equal(p.$('#cobAccModal').style.display, 'none');
  assert.equal(p.recargas(), 1, 'vuelve a pedir el catálogo de la nueva empresa');
});

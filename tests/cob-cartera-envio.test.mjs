// ============================================================
// tests/cob-cartera-envio.test.mjs
// Cobranza · estado de cuenta, paso 2: enviarlo desde la Cartera.
// Regla §16: escrita antes de la pantalla y mostrada fallando.
// Decisiones (3-nov-2026, Sergio): manual desde la Cartera; CxC en copia
// visible y como reply-to; "Enviarme una prueba" antes; el envío real va a la
// lista exacta que se vio (se confirma marcando "Revisé los destinatarios").
// Datos: Cartera del 20-oct (fixture) y el cliente 8 (Tecno Sopas en prod);
// correos de CxC reales (Jaqueline, 30-oct); contactos del cliente de ejemplo.
//   GET  /protected/cob/estados-cuenta/:cve/destinatarios
//   POST /protected/cob/estados-cuenta/:cve/enviar   { corte_id, prueba:true } | { corte_id, confirmar:[...] }
//   GET  /protected/cob/estados-cuenta/:cve/envios
// Se corre con: node --test tests/cob-cartera-envio.test.mjs
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import fs from 'node:fs';

const JS = fs.readFileSync(new URL('../modules/cob/cartera/cartera.js', import.meta.url), 'utf8');
const COMUN = fs.readFileSync(new URL('../modules/cob/cob-comun.js', import.meta.url), 'utf8');
const CART = JSON.parse(fs.readFileSync(new URL('./fixtures/cob-cartera-20261020.json', import.meta.url)));
const K20 = CART.corte.corte_id;
const CXC = ['contabilidadcxc@adegermex.com.mx', 'auxiliarcxc@adegermex.com.mx'];
const DEST = { cve_cte: '8', cliente_id: 'cli-8', cliente: 'TECNO SOPAS', modo: 'manual', idioma: 'es',
  para: [{ nombre: 'Pagos', email: 'pagos@tecnosopas.com.mx', rol: 'pagos' }, { nombre: 'CxP', email: 'cxp@tecnosopas.com.mx', rol: 'cxp' }],
  copia: CXC, responder: CXC, puede_enviar: true, avisos: [] };
const HIST = [{ estado_cuenta_id: 'x-1', tipo: 'prueba', estado: 'enviado', fecha_corte: '2026-10-21', para: ['ams.sergio@gmail.com'], copia: [],
  error: null, created_at: '2026-11-03T21:00:00Z', enviado_por: 'Sergio' }];
const err = (status, message, code) => Object.assign(new Error(message), { status, code });

async function arranca({ permisos = ['cob.cartera.read', 'cob.edo_cta.send'], dest = DEST, hist = HIST, enviar = null } = {}) {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div></body></html>',
    { url: 'https://kogu.test/modules/cob/cartera/cartera.html', runScripts: 'outside-only' });
  const { window } = dom;
  const pedidos = []; const posts = []; const toasts = [];
  let destActual = dest;
  window.KoguShell = {
    initShell: async (o) => { const d = window.document.createElement('div'); d.id = 'pageContent'; window.document.getElementById('app').appendChild(d); return { ok: true, permissions: permisos }; },
    hasPerm: (p) => permisos.includes(p),
    subscribeEmpresaActivaChange: () => {},
  };
  window.KoguApi = {
    apiFetch: async (url, o = {}) => {
      pedidos.push(url);
      if (/\/estados-cuenta\/8\/destinatarios$/.test(url)) return { ok: true, data: destActual };
      if (/\/estados-cuenta\/8\/envios$/.test(url)) return { ok: true, data: hist };
      if (/\/estados-cuenta\/8\/enviar$/.test(url)) {
        const body = JSON.parse(o.body); posts.push(body);
        if (enviar) return enviar(body, { cambiar: (d) => { destActual = d; } });
        return { ok: true, data: { estado: 'enviado', tipo: body.prueba ? 'prueba' : 'envio', para: body.prueba ? ['ams.sergio@gmail.com'] : body.confirmar } };
      }
      if (url.startsWith('/protected/cob/acciones')) return { ok: true, data: [] };
      if (url.startsWith('/protected/cob/cortes')) return { ok: true, data: [{ corte_id: K20, fecha_corte: '2026-10-21', status: 'aplicado' }] };
      if (url.startsWith('/protected/cob/controles/cfdi')) throw Object.assign(new Error('sin control'), { status: 500 });
      if (url.startsWith('/protected/cob/cartera')) return { ok: true, data: CART };
      throw new Error('ruta no esperada ' + url);
    },
    toast: (m, t) => toasts.push([t, m]),
    authFetchRaw: async () => ({ ok: true, status: 200, headers: { get: () => '' }, blob: async () => new window.Blob(['%PDF']) }),
  };
  window.URL.createObjectURL = () => 'blob:kogu'; window.URL.revokeObjectURL = () => {};
  window.HTMLAnchorElement.prototype.click = function () {};
  window.KoguUi = { escapeHtml: (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') };
  window.eval(COMUN); window.eval(JS);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  await new Promise((r) => setTimeout(r, 150));
  const $ = (s) => window.document.querySelector(s);
  const $$ = (s) => [...window.document.querySelectorAll(s)];
  const texto = (el) => (el || window.document.getElementById('app')).textContent.replace(/\s+/g, ' ');
  const espera = () => new Promise((r) => setTimeout(r, 60));
  const cambia = async (sel, v) => { const e = $(sel); e.value = v; e.dispatchEvent(new window.Event('change')); await espera(); };
  const elegir8 = async () => { await cambia('#cobSesion', 'todos'); await cambia('#cobCliente', '8'); };
  const abrir = async () => { await elegir8(); $('#cobEnviarEdoCta').click(); await espera(); };
  const marcar = (sel, v = true) => { const c = $(sel); c.checked = v; c.dispatchEvent(new window.Event('change', { bubbles: true })); };
  return { window, pedidos, posts, toasts, $, $$, texto, espera, cambia, elegir8, abrir, marcar };
}

test('sin cob.edo_cta.send no aparece el botón de envío (la descarga del PDF sigue)', async () => {
  const p = await arranca({ permisos: ['cob.cartera.read'] });
  assert.equal(p.$('#cobEnviarEdoCta'), null);
  assert.ok(p.$('#cobEdoCta'));
});

test('el botón se activa con un solo cliente, igual que la descarga', async () => {
  const p = await arranca();
  assert.equal(p.$('#cobEnviarEdoCta').disabled, true);
  await p.elegir8();
  assert.equal(p.$('#cobEnviarEdoCta').disabled, false);
});

test('panel: para, copia visible a CxC, respuestas a CxC e historial de envíos', async () => {
  const p = await arranca();
  await p.abrir();
  assert.equal(p.$('#cobEnvModal').style.display, 'block');
  assert.ok(p.pedidos.includes('/protected/cob/estados-cuenta/8/destinatarios'));
  assert.ok(p.pedidos.includes('/protected/cob/estados-cuenta/8/envios'));
  const m = p.texto(p.$('#cobEnvModal'));
  assert.match(m, /TECNO SOPAS/);
  assert.match(m, /Corte 21\/10\/2026/);
  assert.deepEqual(p.$$('#cobEnvPara [data-email]').map((x) => x.dataset.email), ['pagos@tecnosopas.com.mx', 'cxp@tecnosopas.com.mx']);
  assert.match(p.texto(p.$('#cobEnvCopia')), /contabilidadcxc@adegermex\.com\.mx, auxiliarcxc@adegermex\.com\.mx/);
  assert.match(p.texto(p.$('#cobEnvResp')), /contabilidadcxc@adegermex\.com\.mx/);
  assert.match(p.texto(p.$('#cobEnvHist')), /Prueba.*ams\.sergio@gmail\.com.*Enviado/);
});

test('Enviarme una prueba: manda prueba con el corte que se ve y avisa', async () => {
  const p = await arranca();
  await p.abrir();
  p.$('#cobEnvPrueba').click(); await p.espera();
  assert.deepEqual(p.posts, [{ corte_id: K20, prueba: true }]);
  assert.ok(p.toasts.some(([t, m]) => t === 'success' && /prueba/i.test(m) && /ams\.sergio@gmail\.com/.test(m)));
});

test('Enviar: desactivado hasta marcar "Revisé los destinatarios"; manda la lista exacta que se vio', async () => {
  const p = await arranca();
  await p.abrir();
  assert.equal(p.$('#cobEnvEnviar').disabled, true);
  assert.match(p.texto(p.$('#cobEnvEnviar')), /Enviar a 2 contactos/);
  p.marcar('#cobEnvRevise');
  assert.equal(p.$('#cobEnvEnviar').disabled, false);
  p.$('#cobEnvEnviar').click(); await p.espera();
  assert.deepEqual(p.posts, [{ corte_id: K20, confirmar: ['pagos@tecnosopas.com.mx', 'cxp@tecnosopas.com.mx'] }]);
  assert.ok(p.toasts.some(([t, m]) => t === 'success' && /TECNO SOPAS/.test(m)));
});

test('cliente que no se puede enviar: avisos visibles, Enviar desactivado, la prueba sí', async () => {
  const dest = { ...DEST, para: [], puede_enviar: false, modo: 'no_aplica',
    avisos: [{ codigo: 'MODO_NO_APLICA', bloquea: true, mensaje: 'En su ficha, "Envío de estado de cuenta" dice No aplica. Cámbialo a Manual.' },
      { codigo: 'SIN_CONTACTO', bloquea: true, mensaje: 'Ningún contacto activo del cliente tiene marcado "Recibe estado de cuenta".' }] };
  const p = await arranca({ dest });
  await p.abrir();
  assert.deepEqual(p.$$('#cobEnvAvisos [data-aviso]').map((x) => x.dataset.aviso), ['MODO_NO_APLICA', 'SIN_CONTACTO']);
  assert.equal(p.$('#cobEnvRevise').disabled, true);
  assert.equal(p.$('#cobEnvEnviar').disabled, true);
  assert.equal(p.$('#cobEnvPrueba').disabled, false);
});

test('la lista cambió (409): se avisa, se recargan los destinatarios y hay que volver a confirmar', async () => {
  const nuevo = { ...DEST, para: [DEST.para[0]] };
  const p = await arranca({ enviar: (body, { cambiar }) => { cambiar(nuevo); throw err(409, 'Los destinatarios cambiaron desde que los revisaste.', 'COB_EDO_CTA_DESTINATARIOS_CAMBIARON'); } });
  await p.abrir();
  p.marcar('#cobEnvRevise');
  p.$('#cobEnvEnviar').click(); await p.espera(); await p.espera();
  assert.match(p.texto(p.$('#cobEnvMsg')), /cambiaron/);
  assert.deepEqual(p.$$('#cobEnvPara [data-email]').map((x) => x.dataset.email), ['pagos@tecnosopas.com.mx']);
  assert.equal(p.$('#cobEnvRevise').checked, false);
  assert.equal(p.$('#cobEnvEnviar').disabled, true);
});

test('envío que falla en el proveedor: se muestra el error y queda en el historial', async () => {
  const p = await arranca({ enviar: () => ({ ok: true, data: { estado: 'fallido', tipo: 'envio', error: 'Correo rechazado (403)' } }) });
  await p.abrir();
  p.marcar('#cobEnvRevise');
  p.$('#cobEnvEnviar').click(); await p.espera();
  assert.match(p.texto(p.$('#cobEnvMsg')), /403/);
  assert.ok(p.toasts.some(([t]) => t === 'error'));
  assert.ok(p.pedidos.filter((u) => /envios$/.test(u)).length >= 2);   // recargó el historial
});

// ============================================================
// tests/core-docfis-render.test.mjs
// Core · Documentos fiscales SAT (CSF + Opinión 32-D) de la empresa activa.
// Regla §16: escrita antes de la pantalla y mostrada fallando.
//
// Reglas (Sergio, 12 y 20-nov-2026): todo proceso automático lleva
// interruptor por empresa y lista de correos; "Descargar ahora" corre aunque
// el interruptor esté apagado. Los datos de prueba salen de la corrida real
// de WARNER (spike 12-nov): opinión positiva folio 26NP8975681, CSF del 12-nov.
//   GET  /protected/core/docfis            { ultimos, corridas, documentos }
//   GET  /protected/core/docfis/config     { docfis_auto, docfis_cada_dias, docfis_correos }
//   PUT  /protected/core/docfis/config
//   POST /protected/core/docfis/ejecutar
//   GET  /protected/core/docfis/documentos/:id/pdf
// Se corre con: node --test tests/core-docfis-render.test.mjs
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import fs from 'node:fs';

const JS = fs.readFileSync(new URL('../modules/core/docfis/docfis.js', import.meta.url), 'utf8');
const API = '/protected/core/docfis';
const err = (status, code, message) => Object.assign(new Error(message), { status, code });

const OP = { empresa_doc_fiscal_id: 'd0c00000-0000-4000-8000-0000000000a1', tipo: 'opinion_32d', fecha_emision: '2026-11-12', folio: '26NP8975681', sentido: 'positivo', datos_json: { rfc: 'WCM910617CC5' } };
const CSF = { empresa_doc_fiscal_id: 'd0c00000-0000-4000-8000-0000000000a2', tipo: 'csf', fecha_emision: '2026-11-12', folio: null, sentido: null, cambio_vs_anterior: null, datos_json: { rfc: 'WCM910617CC5', estatus: 'ACTIVO' } };
const HIST = {
  ultimos: { opinion_32d: OP, csf: CSF },
  corridas: [
    { docfis_corrida_id: 'c2', disparo: 'manual', status: 'ok', iniciada_at: '2026-11-20T18:00:00Z', terminada_at: '2026-11-20T18:01:00Z' },
    { docfis_corrida_id: 'c1', disparo: 'auto', status: 'fallida', error_codigo: 'DOCFIS_SAT_LOGIN', iniciada_at: '2026-11-19T16:00:00Z', terminada_at: '2026-11-19T16:00:30Z' },
  ],
  documentos: [OP, CSF],
};
const CFG = { empresa_id: 'bda26b0e-55b8-49f7-ac1d-90799bfa5125', docfis_auto: false, docfis_cada_dias: 15, docfis_correos: [] };

async function arranca({ permisos = ['screen.core.docfis', 'core.docfis.config', 'core.docfis.ejecutar'], hist = HIST, cfg = CFG, fallaEjecutar = null } = {}) {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div></body></html>',
    { url: 'https://kogu.test/modules/core/docfis/docfis.html', runScripts: 'outside-only' });
  const { window } = dom;
  const pedidos = []; const toasts = []; const crudos = []; const abiertos = [];
  let guardado = { ...cfg };
  let alCambiarEmpresa = null;
  const bootstrap = { ok: true, permissions: permisos };
  window.KoguShell = {
    initShell: async (o) => {
      window.__init = o;
      const d = window.document.createElement('div'); d.id = 'pageContent';
      window.document.getElementById('app').appendChild(d);
      return bootstrap;
    },
    hasPerm: (b, p) => (b.permissions || []).includes(p),
    subscribeEmpresaActivaChange: (fn) => { alCambiarEmpresa = fn; },
  };
  window.KoguApi = {
    apiFetch: async (u, o = {}) => {
      const method = o.method || 'GET';
      pedidos.push({ u, method, body: o.body ? JSON.parse(o.body) : null });
      if (u === API && method === 'GET') return { ok: true, data: hist };
      if (u === `${API}/config` && method === 'GET') return { ok: true, data: guardado };
      if (u === `${API}/config` && method === 'PUT') { guardado = { ...guardado, ...JSON.parse(o.body) }; return { ok: true, data: guardado }; }
      if (u === `${API}/ejecutar` && method === 'POST') { if (fallaEjecutar) throw fallaEjecutar; return { ok: true, data: { estado: 'ok', corridaId: 'c3' } }; }
      throw new Error('ruta no esperada ' + method + ' ' + u);
    },
    authFetchRaw: async (u) => { crudos.push(u); return { ok: true, status: 200, blob: async () => new window.Blob(['%PDF']) }; },
    toast: (m, t) => toasts.push([t, m]),
  };
  window.URL.createObjectURL = () => 'blob:kogu/pdf';
  window.URL.revokeObjectURL = () => {};
  window.open = (u) => { abiertos.push(u); return {}; };
  window.KoguUi = {
    escapeHtml: (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    fmtDate: (v) => (v ? String(v) : '-'),
    fmtDateOnly: (v) => { const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : '-'; },
  };
  window.eval(JS);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  await new Promise((r) => setTimeout(r, 100));
  const $ = (s) => window.document.querySelector(s);
  const $$ = (s) => [...window.document.querySelectorAll(s)];
  const texto = (el = window.document.getElementById('app')) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
  const espera = () => new Promise((r) => setTimeout(r, 50));
  const escribir = (el, v) => { el.value = v; el.dispatchEvent(new window.Event('input', { bubbles: true })); el.dispatchEvent(new window.Event('change', { bubbles: true })); };
  const de = (method, u) => pedidos.filter((x) => x.method === method && x.u === u);
  return { window, pedidos, toasts, crudos, abiertos, $, $$, texto, espera, escribir, de,
    cambiarEmpresa: async () => { await alCambiarEmpresa(); await espera(); } };
}

test('exige screen.core.docfis y vive en su propia ruta', async () => {
  const p = await arranca();
  assert.equal(p.window.__init.requiredPermission, 'screen.core.docfis');
  assert.equal(p.window.__init.currentPage, '/modules/core/docfis/docfis.html');
});

test('muestra la última opinión (sentido, folio, fecha) y la última constancia', async () => {
  const p = await arranca();
  const op = p.texto(p.$('#docfisOpinion'));
  assert.match(op, /positiv/i);
  assert.match(op, /26NP8975681/);
  assert.match(op, /12\/11\/2026/);
  assert.match(p.texto(p.$('#docfisCsf')), /12\/11\/2026/);
});

test('opinión negativa o CSF con cambios: se marcan como atención', async () => {
  const p = await arranca({ hist: { ...HIST, ultimos: {
    opinion_32d: { ...OP, sentido: 'negativo' },
    csf: { ...CSF, cambio_vs_anterior: { regimenes: { antes: [], despues: [] } } },
  } } });
  assert.ok(p.$('#docfisOpinion .badge-danger, #docfisOpinion [data-tono="danger"]'), 'opinión negativa en rojo');
  assert.match(p.texto(p.$('#docfisCsf')), /cambi/i);
});

test('sin documentos todavía: lo dice y ofrece descargarlos', async () => {
  const p = await arranca({ hist: { ultimos: {}, corridas: [], documentos: [] } });
  assert.match(p.texto(), /sin documentos|aún no hay|todavía no/i);
  assert.ok(p.$('#docfisEjecutar'));
});

test('bitácora de corridas con su estatus y el error cuando falló', async () => {
  const p = await arranca();
  const filas = p.$$('#docfisCorridas tbody tr');
  assert.equal(filas.length, 2);
  assert.match(p.texto(filas[1]), /fallida/i);
  assert.match(p.texto(filas[1]), /DOCFIS_SAT_LOGIN/);
  assert.match(p.texto(filas[1]), /autom/i);
});

test('el PDF se abre con el token (authFetchRaw), no con un enlace directo', async () => {
  const p = await arranca();
  p.$(`[data-pdf="${OP.empresa_doc_fiscal_id}"]`).click(); await p.espera();
  assert.deepEqual(p.crudos, [`${API}/documentos/${OP.empresa_doc_fiscal_id}/pdf`]);
  assert.deepEqual(p.abiertos, ['blob:kogu/pdf']);
});

// ── Configuración: interruptor, días, correos ──────────────────
test('config: interruptor apagado, cada 15 días y sin correos → explica a quién llegan los avisos', async () => {
  const p = await arranca();
  assert.equal(p.$('#docfisAuto').value, 'false');
  assert.equal(p.$('#docfisDias').value, '15');
  assert.match(p.texto(p.$('#docfisCorreosVista')), /permiso|usuarios/i);
  assert.match(p.texto(p.$('#docfisConfig')), /apagad/i);
});

test('config: encender, cada 7 días, dos correos → PUT normalizado', async () => {
  const p = await arranca();
  p.escribir(p.$('#docfisAuto'), 'true');
  p.escribir(p.$('#docfisDias'), '7');
  p.escribir(p.$('#docfisCorreos input'), ' Fiscal@Warner.mx ');
  p.$('#docfisCorreosAgregar').click();
  p.escribir(p.$$('#docfisCorreos input')[1], 'conta@warner.mx');
  p.$('#docfisGuardar').click(); await p.espera();
  assert.deepEqual(p.de('PUT', `${API}/config`).map((x) => x.body),
    [{ docfis_auto: true, docfis_cada_dias: 7, docfis_correos: ['fiscal@warner.mx', 'conta@warner.mx'] }]);
  assert.ok(p.toasts.some(([t, m]) => t === 'success' && /guard/i.test(m)));
});

test('config inválida (días fuera de 1–30 o correo mal escrito): avisa y no manda nada', async () => {
  const p = await arranca();
  p.escribir(p.$('#docfisDias'), '31');
  p.$('#docfisGuardar').click(); await p.espera();
  p.escribir(p.$('#docfisDias'), '15');
  p.escribir(p.$('#docfisCorreos input'), 'fiscal@warner');
  p.$('#docfisGuardar').click(); await p.espera();
  assert.equal(p.de('PUT', `${API}/config`).length, 0);
  assert.match(p.texto(p.$('#docfisMsg')), /fiscal@warner|correo/i);
});

test('sin core.docfis.config: ve la configuración pero no puede cambiarla', async () => {
  const p = await arranca({ permisos: ['screen.core.docfis'] });
  assert.equal(p.$('#docfisGuardar'), null);
  assert.ok(p.$('#docfisAuto').disabled);
  assert.equal(p.$('#docfisEjecutar'), null, 'sin core.docfis.ejecutar no hay botón');
});

// ── Descargar ahora ────────────────────────────────────────────
test('Descargar ahora: POST, se deshabilita mientras corre y recarga el historial', async () => {
  const p = await arranca();
  const antes = p.de('GET', API).length;
  p.$('#docfisEjecutar').click();
  assert.equal(p.$('#docfisEjecutar').disabled, true);
  await p.espera();
  assert.equal(p.de('POST', `${API}/ejecutar`).length, 1);
  assert.equal(p.de('GET', API).length, antes + 1);
  assert.ok(p.toasts.some(([t]) => t === 'success'));
});

test('Descargar ahora con una descarga en curso (409): avisa con el motivo', async () => {
  const p = await arranca({ fallaEjecutar: err(409, 'DOCFIS_EN_PROCESO', 'Ya hay una descarga en proceso para esta empresa.') });
  p.$('#docfisEjecutar').click(); await p.espera();
  assert.ok(p.toasts.some(([t, m]) => t === 'error' && /en proceso/i.test(m)));
  assert.equal(p.$('#docfisEjecutar').disabled, false);
});

test('cambio de empresa: vuelve a cargar historial y configuración de la nueva', async () => {
  const p = await arranca();
  const h = p.de('GET', API).length; const c = p.de('GET', `${API}/config`).length;
  await p.cambiarEmpresa();
  assert.equal(p.de('GET', API).length, h + 1);
  assert.equal(p.de('GET', `${API}/config`).length, c + 1);
});

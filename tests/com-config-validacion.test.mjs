// ============================================================
// tests/com-config-validacion.test.mjs
// Comisiones · Configuracion: rechazo claro y sin perder lo capturado.
// Regla §16: escrita antes del parche y mostrada fallando.
// Revision 04-nov-2026 (punto 4): el backend ahora rechaza (422) excepciones
// con agente no primario, adicionales = primario y % > 100. Hoy la pantalla
// borra los campos aunque el guardado falle, y acepta 150 en "% comision".
// Caso real: excepcion CO-PACK cliente 9 · agente 6 · WWP0871 · 5%.
// Se corre con: node --test tests/com-config-validacion.test.mjs
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import fs from 'node:fs';

const JS = fs.readFileSync(new URL('../modules/com/configuracion.js', import.meta.url), 'utf8');
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const MSG_NO_PRIMARIO = 'La excepción solo aplica con el agente primario del cliente 9: 6 · ANTORE. El agente 7 no lo es.';

async function montar({ falla = null } = {}) {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div></body></html>',
    { url: 'https://kogu.test/modules/com/configuracion.html', runScripts: 'outside-only' });
  const { window } = dom;
  const pedidos = []; const toasts = [];
  window.KoguShell = {
    initShell: async () => {
      const d = window.document.createElement('div'); d.id = 'pageContent';
      window.document.getElementById('app').appendChild(d);
      return { ok: true, permissions: ['screen.comisiones', 'com.comisiones.manage'] };
    },
    subscribeEmpresaActivaChange: () => {},
  };
  window.KoguApi = {
    apiFetch: async (u, o = {}) => {
      const method = o.method || 'GET';
      pedidos.push({ u, method, body: o.body ? JSON.parse(o.body) : null });
      if (method === 'POST' && falla) throw Object.assign(new Error(falla), { status: 422 });
      return { ok: true, data: [] };
    },
    toast: (m, t) => toasts.push([t, m]), unwrapData: (r) => r?.data,
    getEmpresaActiva: () => ({ nombre_corto: 'COPACK' }),
  };
  window.KoguUi = { escapeHtml: esc, withLoading: async (_e, fn) => fn() };
  window.confirm = () => true;
  window.eval(JS);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  await new Promise((r) => setTimeout(r, 80));
  const $ = (id) => window.document.getElementById(id);
  const capturaOv = (age) => { $('ovCte').value = '9'; $('ovAge').value = String(age); $('ovProd').value = 'WWP0871'; $('ovPct').value = '5'; $('ovMot').value = 'Especial'; };
  return { window, $, pedidos, toasts, capturaOv };
}
const espera = (ms = 100) => new Promise((r) => setTimeout(r, ms));

test('excepción rechazada por el backend (agente no primario) → muestra el motivo y CONSERVA lo capturado', async () => {
  const { $, toasts, capturaOv } = await montar({ falla: MSG_NO_PRIMARIO });
  capturaOv(7);
  $('ovAdd').click(); await espera();
  assert.ok(toasts.some(([t, m]) => t === 'error' && m === MSG_NO_PRIMARIO));
  assert.equal($('ovCte').value, '9');
  assert.equal($('ovAge').value, '7');
  assert.equal($('ovProd').value, 'WWP0871');
  assert.equal($('ovPct').value, '5');
});

test('excepción guardada con éxito (9/6/WWP0871 5%) → manda 0.05 y limpia el formulario', async () => {
  const { $, pedidos, capturaOv } = await montar();
  capturaOv(6);
  $('ovAdd').click(); await espera();
  const post = pedidos.find((p) => p.method === 'POST');
  assert.deepEqual(post.body, { cve_cte: '9', cve_age: 6, cve_prod: 'WWP0871', porcom_override: 0.05, motivo: 'Especial' });
  assert.equal($('ovCte').value, '');
});

test('% mayor a 100 en excepción → no se manda y avisa', async () => {
  const { $, pedidos, toasts, capturaOv } = await montar();
  capturaOv(6); $('ovPct').value = '150';
  $('ovAdd').click(); await espera();
  assert.ok(!pedidos.some((p) => p.method === 'POST'));
  assert.ok(toasts.some(([t, m]) => t === 'error' && /100/.test(m)));
  assert.equal($('ovPct').value, '150');
});

test('% mayor a 100 en comisión adicional → no se manda y avisa', async () => {
  const { $, pedidos, toasts } = await montar();
  $('ccCte').value = '2'; $('ccAge').value = '14'; $('ccPct').value = '101';
  $('ccAdd').click(); await espera();
  assert.ok(!pedidos.some((p) => p.method === 'POST'));
  assert.ok(toasts.some(([t, m]) => t === 'error' && /100/.test(m)));
});

test('adicional rechazado por el backend (agente = primario) conserva lo capturado', async () => {
  const { $ } = await montar({ falla: 'El agente 10 ya es el agente primario del cliente 2; como adicional cobraría dos veces.' });
  $('ccCte').value = '2'; $('ccAge').value = '10'; $('ccPct').value = '1';
  $('ccAdd').click(); await espera();
  assert.equal($('ccCte').value, '2');
  assert.equal($('ccAge').value, '10');
  assert.equal($('ccPct').value, '1');
});

// ============================================================
// tests/cto-precios-pactados-render.test.mjs
// Costo · Precios de requisiciones — catalogo de precios pactados.
// Regla §16: escrita antes de la pantalla y mostrada fallando.
// Datos: GET /protected/cto/precios-pactados real (filas de configuracion.xlsx:
// WWP0164 / WWP0164-6-G / WWP0164-MQ 61 MXN 16%, EMP0004-K 6.50 MXN).
// Se corre con: node --test tests/cto-precios-pactados-render.test.mjs
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import fs from 'node:fs';

const JS = fs.readFileSync(new URL('../modules/cto/precios-pactados.js', import.meta.url), 'utf8');
const COMUN = fs.readFileSync(new URL('../modules/cto/requisiciones-comun.js', import.meta.url), 'utf8');
const API = JSON.parse(fs.readFileSync(new URL('./fixtures/cto-req-api-respuestas.json', import.meta.url)));
const TODOS = ['screen.cto.requisiciones', 'cto.requisiciones.read', 'cto.precios_pactados.write'];

async function arranca({ perms = TODOS } = {}) {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div></body></html>',
    { url: 'https://kogu.test/modules/cto/precios-pactados.html', runScripts: 'outside-only' });
  const { window } = dom;
  const pedidos = [];
  window.KoguShell = {
    initShell: async (o) => {
      window.__init = o;
      const d = window.document.createElement('div'); d.id = 'pageContent';
      window.document.getElementById('app').appendChild(d);
      return { ok: true, permissions: perms };
    },
    hasPerm: (b, p) => (b?.permissions || []).includes(p),
    subscribeEmpresaActivaChange: () => {},
  };
  window.KoguApi = {
    apiFetch: async (u, o = {}) => {
      pedidos.push({ u, o, body: o.body ? JSON.parse(o.body) : undefined });
      if (u.startsWith('/protected/cto/precios-pactados?')) {
        const inc = new URLSearchParams(u.split('?')[1]).get('inactivos') === '1';
        return { ok: true, data: API.pactados.filter((x) => inc || x.activo) };
      }
      if (u === '/protected/cto/precios-pactados' && o.method === 'POST') return { ok: true, data: { pactado_id: 'nuevo' } };
      if (u.startsWith('/protected/cto/precios-pactados/')) return { ok: true, data: {} };
      throw new Error('ruta no esperada ' + u);
    },
    toast: (m) => { window.__toast = m; },
  };
  window.KoguUi = { escapeHtml: (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') };
  window.eval(COMUN);
  window.eval(JS);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  await new Promise((r) => setTimeout(r, 120));
  const $ = (s) => window.document.querySelector(s);
  const texto = (el) => (el || window.document.getElementById('app')).textContent.replace(/\s+/g, ' ');
  const espera = () => new Promise((r) => setTimeout(r, 80));
  const ultimo = (re, m) => pedidos.filter((p) => re.test(p.u) && (!m || p.o.method === m)).at(-1);
  return { window, pedidos, $, texto, espera, ultimo };
}

test('lista: solo activos por omision; con "ver inactivos" aparecen los dados de baja', async () => {
  const p = await arranca();
  assert.equal(p.window.__init.requiredPermission, 'screen.cto.requisiciones');
  assert.equal(p.window.document.querySelectorAll('#pacLista tr[data-id]').length, 3);
  const t = p.texto(p.$('#pacLista'));
  assert.match(t, /WWP0164.*61\.00 MXN.*16%/);
  assert.match(t, /WWP0164-6-G.*01\/01\/2025.*31\/12\/2025/);
  p.$('#pacInactivos').checked = true;
  p.$('#pacInactivos').dispatchEvent(new p.window.Event('change')); await p.espera();
  assert.equal(p.window.document.querySelectorAll('#pacLista tr[data-id]').length, 5);
  assert.match(p.texto(p.$('#pacLista')), /Inactivo/);
});

test('alta: valida precio y manda el pactado como lo capturo Costos', async () => {
  const p = await arranca();
  p.$('#pacCve').value = 'wwp0777-mq';
  p.$('#pacPrecio').value = '0';
  p.$('#pacGuardar').click(); await p.espera();
  assert.equal(p.ultimo(/^\/protected\/cto\/precios-pactados$/, 'POST'), undefined);
  assert.match(p.texto(p.$('#pacMsg')), /precio/i);
  p.$('#pacPrecio').value = '3.2';
  p.$('#pacMoneda').value = 'USD';
  p.$('#pacIva').value = '0';
  p.$('#pacNotas').value = 'Precio fijo en dólares';
  p.$('#pacGuardar').click(); await p.espera();
  const r = p.ultimo(/^\/protected\/cto\/precios-pactados$/, 'POST');
  assert.deepEqual(r.body, { cve_prod: 'WWP0777-MQ', precio: 3.2, moneda: 'USD', iva: 0, vigente_desde: null,
    vigente_hasta: null, notas: 'Precio fijo en dólares' });
});

test('editar: carga la fila en el formulario y manda PATCH', async () => {
  const p = await arranca();
  const w164 = API.pactados.find((x) => x.cve_prod === 'WWP0164');
  p.$(`#pacLista tr[data-id="${w164.pactado_id}"] .btn-editar`).click(); await p.espera();
  assert.equal(p.$('#pacCve').value, 'WWP0164');
  assert.equal(p.$('#pacPrecio').value, '61');
  p.$('#pacPrecio').value = '62.5';
  p.$('#pacGuardar').click(); await p.espera();
  const r = p.ultimo(/\/precios-pactados\//, 'PATCH');
  assert.equal(r.u, `/protected/cto/precios-pactados/${w164.pactado_id}`);
  assert.equal(r.body.precio, 62.5);
});

test('dar de baja: pide confirmar con un segundo clic y manda DELETE', async () => {
  const p = await arranca();
  const w164 = API.pactados.find((x) => x.cve_prod === 'WWP0164');
  const btn = () => p.$(`#pacLista tr[data-id="${w164.pactado_id}"] .btn-baja`);
  btn().click(); await p.espera();
  assert.equal(p.ultimo(/\/precios-pactados\//, 'DELETE'), undefined);
  assert.match(btn().textContent, /Confirmar/);
  btn().click(); await p.espera();
  assert.equal(p.ultimo(/\/precios-pactados\//, 'DELETE').u, `/protected/cto/precios-pactados/${w164.pactado_id}`);
});

test('solo lectura: sin cto.precios_pactados.write no hay formulario ni acciones', async () => {
  const p = await arranca({ perms: ['screen.cto.requisiciones', 'cto.requisiciones.read'] });
  assert.equal(p.$('#pacGuardar'), null);
  assert.equal(p.window.document.querySelectorAll('.btn-editar, .btn-baja').length, 0);
  assert.equal(p.window.document.querySelectorAll('#pacLista tr[data-id]').length, 3);
});

// ============================================================
// tests/cob-cartera-carga.test.mjs
// Cobranza · la Cartera no espera a los controles fiscales.
// Caso real (Sergio, 25-nov-2026, dev): GET /protected/cob/controles/rep tardó
// ~22 s y la Cartera no se pintaba hasta que terminaba, aunque los controles
// CFDI y REP van plegados por defecto (decisión 13-nov). La tabla y las fichas
// deben salir en cuanto llega la cartera; los controles llegan después, en paralelo.
// Regla §16: escrita antes del cambio, mostrada fallando.
// Se corre con: node --test tests/cob-cartera-carga.test.mjs
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import fs from 'node:fs';

const JS = fs.readFileSync(new URL('../modules/cob/cartera/cartera.js', import.meta.url), 'utf8');
const COMUN = fs.readFileSync(new URL('../modules/cob/cob-comun.js', import.meta.url), 'utf8');
const CART = JSON.parse(fs.readFileSync(new URL('./fixtures/cob-cartera-20261020.json', import.meta.url)));
const CTL = JSON.parse(fs.readFileSync(new URL('./fixtures/cob-control-cfdi-20261020.json', import.meta.url)));
const REP = JSON.parse(fs.readFileSync(new URL('./fixtures/cob-control-rep-20261022.json', import.meta.url)));
const K20 = CART.corte.corte_id;

async function arranca() {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div></body></html>',
    { url: 'https://kogu.test/modules/cob/cartera/cartera.html', runScripts: 'outside-only' });
  const { window } = dom;
  // Los controles quedan "colgados" hasta que la prueba los suelta (como el REP de 22 s).
  const pendientes = {};
  const colgado = (k, data) => new Promise((r) => { pendientes[k] = () => r({ ok: true, data }); });
  const pedidos = [];
  window.KoguShell = {
    initShell: async () => { const d = window.document.createElement('div'); d.id = 'pageContent'; window.document.getElementById('app').appendChild(d); return { ok: true, permissions: ['cob.cartera.read'] }; },
    hasPerm: () => false, subscribeEmpresaActivaChange: () => {},
  };
  window.KoguApi = {
    apiFetch: async (url) => {
      pedidos.push(url.split('?')[0]);
      if (url.startsWith('/protected/cob/controles/rep')) return colgado('rep', REP);
      if (url.startsWith('/protected/cob/controles/cfdi')) return colgado('cfdi', CTL);
      if (url.startsWith('/protected/cob/cortes')) return { ok: true, data: [{ corte_id: K20, fecha_corte: '2026-10-21', status: 'aplicado' }] };
      if (url.startsWith('/protected/cob/cartera')) return { ok: true, data: structuredClone(CART) };
      throw new Error('ruta no esperada ' + url);
    },
    toast: () => {}, authFetchRaw: async () => ({ ok: true, headers: { get: () => '' }, blob: async () => null }),
  };
  window.KoguUi = { escapeHtml: (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') };
  window.eval(COMUN); window.eval(JS);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  const espera = (ms = 60) => new Promise((r) => setTimeout(r, ms));
  await espera(150);
  const $ = (s) => window.document.querySelector(s);
  return { window, $, espera, pendientes, pedidos };
}

test('la tabla y las fichas salen aunque los controles CFDI y REP no hayan respondido', async () => {
  const p = await arranca();
  assert.ok(p.$('#cobTabla'), 'la tabla ya está pintada');
  assert.ok(p.$('#cobTabla tbody tr.r'), 'con facturas');
  assert.ok(p.pendientes.cfdi && p.pendientes.rep, 'los dos controles se pidieron');
});

test('los dos controles se piden en paralelo (no uno detrás del otro)', async () => {
  const p = await arranca();
  assert.ok(p.pendientes.rep, 'el REP se pidió sin esperar a que respondiera el CFDI');
});

test('cuando llegan los controles aparece la sección fiscal, plegada', async () => {
  const p = await arranca();
  assert.equal(p.$('#cobFiscal'), null, 'todavía no hay controles');
  p.pendientes.cfdi(); p.pendientes.rep();
  await p.espera(80);
  assert.ok(p.$('#cobFiscal'));
  assert.equal(p.$('#cobFiscal').style.display, 'none');
  assert.ok(p.$('#cobFiscal [data-rep]'));
});

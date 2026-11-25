// ============================================================
// tests/cob-cartera-notas.test.mjs
// Cobranza · la ficha de la factura muestra las notas de cobranza del cliente
// (cat_clientes.cob_notas, cargadas el 25-nov-2026 del archivo de Facturación).
// Regla §16: escrita antes del cambio, mostrada fallando.
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import fs from 'node:fs';

const JS = fs.readFileSync(new URL('../modules/cob/cartera/cartera.js', import.meta.url), 'utf8');
const COMUN = fs.readFileSync(new URL('../modules/cob/cob-comun.js', import.meta.url), 'utf8');
const CART = JSON.parse(fs.readFileSync(new URL('./fixtures/cob-cartera-20261020.json', import.meta.url)));
const K20 = CART.corte.corte_id;
const NOTA = 'REV: PORTAL\nPROCESO: SE SUBE AL PORTAL CON EVIDENCIAS FIRMADAS';

async function abre(folio, notas) {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div></body></html>',
    { url: 'https://kogu.test/modules/cob/cartera/cartera.html', runScripts: 'outside-only' });
  const { window } = dom;
  const doc = CART.documentos.find((d) => String(d.folio) === folio);
  window.KoguShell = {
    initShell: async () => { const d = window.document.createElement('div'); d.id = 'pageContent'; window.document.getElementById('app').appendChild(d); return { ok: true, permissions: ['cob.cartera.read'] }; },
    hasPerm: () => false, subscribeEmpresaActivaChange: () => {},
  };
  window.KoguApi = {
    apiFetch: async (url) => {
      if (url.startsWith('/protected/cob/cartera/documentos/')) return { ok: true, data: { documento: { ...doc, fecha_corte: '2026-10-21', cliente_notas: notas }, historia: [], seguimientos: [] } };
      if (url.startsWith('/protected/cob/controles/')) throw Object.assign(new Error('x'), { status: 500 });
      if (url.startsWith('/protected/cob/cortes')) return { ok: true, data: [{ corte_id: K20, fecha_corte: '2026-10-21', status: 'aplicado' }] };
      if (url.startsWith('/protected/cob/cartera')) return { ok: true, data: structuredClone(CART) };
      throw new Error('ruta no esperada ' + url);
    },
    toast: () => {}, authFetchRaw: async () => ({ ok: true, headers: { get: () => '' }, blob: async () => null }),
  };
  window.KoguUi = { escapeHtml: (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') };
  window.eval(COMUN); window.eval(JS);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  await new Promise((r) => setTimeout(r, 150));
  window.document.querySelector(`tr.r[data-id="${doc.documento_id}"] td:nth-child(2)`).click();
  await new Promise((r) => setTimeout(r, 80));
  return window.document.getElementById('cobDrawer');
}

test('ficha de factura: muestra "Cómo factura y paga" con las notas del cliente, respetando renglones', async () => {
  const dr = await abre('26108', NOTA);
  const caja = dr.querySelector('[data-notas]');
  assert.ok(caja, 'hay sección de notas');
  assert.match(caja.textContent, /Cómo factura y paga/);
  assert.match(caja.textContent, /SE SUBE AL PORTAL CON EVIDENCIAS FIRMADAS/);
  assert.match(caja.innerHTML, /white-space:\s*pre-line/);
});

test('ficha de factura: sin notas no hay sección', async () => {
  const dr = await abre('26108', null);
  assert.equal(dr.querySelector('[data-notas]'), null);
});

test('las notas se escapan (no se inyecta HTML)', async () => {
  const dr = await abre('26108', '<img src=x onerror=alert(1)>');
  assert.equal(dr.querySelector('[data-notas] img'), null);
});

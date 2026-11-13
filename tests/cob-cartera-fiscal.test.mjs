// ============================================================
// tests/cob-cartera-fiscal.test.mjs
// Cobranza · controles fiscales (CFDI y REP) plegados por defecto en la Cartera.
// Decisión de Sergio (13-nov-2026): cobranza arranca sin los controles fiscales
// para no causar dudas; quedan en una sección plegada que cualquiera puede abrir
// ("Mostrar controles fiscales"). Al volver a entrar, plegada otra vez.
// Regla §16: escrita antes del cambio y mostrada fallando.
// Datos: Cartera del 20-oct, control CFDI del mismo corte y control REP (fixtures).
// Se corre con: node --test tests/cob-cartera-fiscal.test.mjs
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

async function arranca({ cfdi = CTL, rep = REP } = {}) {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div></body></html>',
    { url: 'https://kogu.test/modules/cob/cartera/cartera.html', runScripts: 'outside-only' });
  const { window } = dom;
  window.KoguShell = {
    initShell: async () => { const d = window.document.createElement('div'); d.id = 'pageContent'; window.document.getElementById('app').appendChild(d); return { ok: true, permissions: ['cob.cartera.read'] }; },
    hasPerm: () => false, subscribeEmpresaActivaChange: () => {},
  };
  const falla = () => { throw Object.assign(new Error('falla'), { status: 500 }); };
  window.KoguApi = {
    apiFetch: async (url) => {
      if (url.startsWith('/protected/cob/controles/rep')) return rep ? { ok: true, data: rep } : falla();
      if (url.startsWith('/protected/cob/controles/cfdi')) return cfdi ? { ok: true, data: cfdi } : falla();
      if (url.startsWith('/protected/cob/cortes')) return { ok: true, data: [{ corte_id: K20, fecha_corte: '2026-10-21', status: 'aplicado' }] };
      if (url.startsWith('/protected/cob/cartera')) return { ok: true, data: CART };
      throw new Error('ruta no esperada ' + url);
    },
    toast: () => {}, authFetchRaw: async () => ({ ok: true, headers: { get: () => '' }, blob: async () => null }),
  };
  window.KoguUi = { escapeHtml: (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') };
  window.eval(COMUN); window.eval(JS);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  await new Promise((r) => setTimeout(r, 150));
  const $ = (s) => window.document.querySelector(s);
  const texto = (el) => el.textContent.replace(/\s+/g, ' ').trim();
  const espera = () => new Promise((r) => setTimeout(r, 60));
  const cambia = async (sel, v) => { const e = $(sel); e.value = v; e.dispatchEvent(new window.Event('change')); await espera(); };
  return { window, $, texto, espera, cambia };
}

test('por defecto: CFDI, REP y el aviso de fechas por descargar van dentro de la sección plegada', async () => {
  const p = await arranca();
  const sec = p.$('#cobFiscal');
  assert.ok(sec);
  assert.equal(sec.style.display, 'none');
  assert.ok(sec.querySelector('[data-cfdi]'));
  assert.ok(sec.querySelector('[data-rep]'));
  assert.match(p.texto(sec), /Falta descargar del SAT los CFDI emitidos/);
  assert.doesNotMatch(p.texto(p.$('#cobAvisos')), /Falta descargar del SAT/);
  assert.match(p.texto(p.$('#cobFiscalToggle')), /Mostrar controles fiscales \(CFDI y REP\)/);
});

test('"Mostrar" la abre y "Ocultar" la vuelve a plegar; sigue abierta al cambiar filtros', async () => {
  const p = await arranca();
  p.$('#cobFiscalToggle').click(); await p.espera();
  assert.equal(p.$('#cobFiscal').style.display, '');
  assert.match(p.texto(p.$('#cobFiscalToggle')), /Ocultar controles fiscales/);
  await p.cambia('#cobMoneda', 'USD');
  assert.equal(p.$('#cobFiscal').style.display, '', 'el render no la vuelve a plegar');
  p.$('#cobFiscalToggle').click(); await p.espera();
  assert.equal(p.$('#cobFiscal').style.display, 'none');
});

test('al volver a entrar está plegada otra vez', async () => {
  const a = await arranca();
  a.$('#cobFiscalToggle').click(); await a.espera();
  const b = await arranca();
  assert.equal(b.$('#cobFiscal').style.display, 'none');
});

test('sin ningún control (fallaron los dos): no hay sección ni botón', async () => {
  const p = await arranca({ cfdi: null, rep: null });
  assert.equal(p.$('#cobFiscal'), null);
  assert.equal(p.$('#cobFiscalToggle'), null);
});

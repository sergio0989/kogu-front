// ============================================================
// tests/cob-cartera-portal.test.mjs
// Cobranza · portal de agentes: CxC marca en la Cartera qué facturas vencidas
// ve el agente (decisiones de Sergio, 24-nov-2026, claude/cobranza-portal-agentes.md).
//  - Check factura por factura; "todas las del cliente" con la casilla del grupo.
//  - Solo cuentan FAC vencidas (lo único que ve el agente).
//  - El check sigue en las cargas siguientes: el backend lo manda en
//    portal_autorizada y la tabla lo pinta ("Agente la ve").
// Folios reales: CLIENTE 4 (26107, 26108 vencidas; 26681 por vencer),
// CLIENTE 222 (27147 vencida). Regla §16: escrita antes del cambio, mostrada fallando.
// Se corre con: node --test tests/cob-cartera-portal.test.mjs
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import fs from 'node:fs';

const JS = fs.readFileSync(new URL('../modules/cob/cartera/cartera.js', import.meta.url), 'utf8');
const COMUN = fs.readFileSync(new URL('../modules/cob/cob-comun.js', import.meta.url), 'utf8');
const BASE = JSON.parse(fs.readFileSync(new URL('./fixtures/cob-cartera-20261020.json', import.meta.url)));
const K20 = BASE.corte.corte_id;
const AUTORIZAR = 'cob.portal_agentes.autorizar';

function cartera(marcadas = ['26107']) {
  const c = structuredClone(BASE);
  c.documentos.forEach((d) => { d.portal_autorizada = marcadas.includes(String(d.folio)); });
  return c;
}

async function arranca({ perms = ['cob.cartera.read', AUTORIZAR], marcadas, respuesta = (b) => ({ actualizadas: b.documento_ids.length, autorizada: b.autorizada }) } = {}) {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div></body></html>',
    { url: 'https://kogu.test/modules/cob/cartera/cartera.html', runScripts: 'outside-only' });
  const { window } = dom;
  const puts = [];
  const toasts = [];
  const CART = cartera(marcadas);
  window.KoguShell = {
    initShell: async () => { const d = window.document.createElement('div'); d.id = 'pageContent'; window.document.getElementById('app').appendChild(d); return { ok: true, permissions: perms }; },
    hasPerm: () => false, subscribeEmpresaActivaChange: () => {},
  };
  window.KoguApi = {
    apiFetch: async (url, o = {}) => {
      if (url.startsWith('/protected/cob/portal-agentes/autorizaciones') && o.method === 'PUT') {
        const b = JSON.parse(o.body); puts.push(b); return { ok: true, data: respuesta(b) };
      }
      if (url.startsWith('/protected/cob/controles/')) throw Object.assign(new Error('sin control'), { status: 500 });
      if (url.startsWith('/protected/cob/cortes')) return { ok: true, data: [{ corte_id: K20, fecha_corte: '2026-10-21', status: 'aplicado' }] };
      if (url.startsWith('/protected/cob/cartera')) return { ok: true, data: CART };
      throw new Error('ruta no esperada ' + url);
    },
    toast: (m, t) => toasts.push([m, t]), authFetchRaw: async () => ({ ok: true, headers: { get: () => '' }, blob: async () => null }),
  };
  window.KoguUi = { escapeHtml: (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') };
  window.eval(COMUN); window.eval(JS);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  await new Promise((r) => setTimeout(r, 150));
  const $ = (s) => window.document.querySelector(s);
  const texto = (el) => el.textContent.replace(/\s+/g, ' ').trim();
  const espera = () => new Promise((r) => setTimeout(r, 60));
  const idDe = (folio) => CART.documentos.find((d) => String(d.folio) === folio).documento_id;
  const fila = (folio) => $(`tr.r[data-id="${idDe(folio)}"]`);
  const marca = async (folio) => { const c = fila(folio).querySelector('input[data-sel]'); c.checked = true; c.dispatchEvent(new window.Event('change', { bubbles: true })); await espera(); };
  const clic = async (sel) => { $(sel).click(); await espera(); };
  return { window, $, texto, espera, fila, marca, clic, idDe, puts, toasts };
}

test('CxC: casillas y botones "Mostrar al agente" / "Quitar al agente", apagados sin selección', async () => {
  const p = await arranca({ perms: ['cob.cartera.read', AUTORIZAR] });   // sin cob.seguimiento.write
  assert.ok(p.fila('26108').querySelector('input[data-sel]'), 'la casilla aparece aunque no registre seguimiento');
  assert.equal(p.$('#cobRegistrar'), null);
  assert.match(p.texto(p.$('#cobPortalMostrar')), /Mostrar al agente \(0\)/);
  assert.equal(p.$('#cobPortalMostrar').disabled, true);
  assert.equal(p.$('#cobPortalQuitar').disabled, true);
});

test('la factura con check vigente se ve marcada en la tabla ("Agente la ve")', async () => {
  const p = await arranca();
  assert.match(p.texto(p.fila('26107')), /Agente la ve/);
  assert.doesNotMatch(p.texto(p.fila('26108')), /Agente la ve/);
});

test('Mostrar al agente: manda solo las FAC vencidas elegidas y pinta el check', async () => {
  const p = await arranca();
  await p.marca('26108'); await p.marca('27147'); await p.marca('26681');   // 26681 está por vencer
  assert.match(p.texto(p.$('#cobPortalMostrar')), /Mostrar al agente \(2\)/);
  await p.clic('#cobPortalMostrar');
  assert.equal(p.puts.length, 1);
  assert.deepEqual([...p.puts[0].documento_ids].sort(), [p.idDe('26108'), p.idDe('27147')].sort());
  assert.equal(p.puts[0].autorizada, true);
  assert.match(p.texto(p.fila('26108')), /Agente la ve/);
  assert.match(p.texto(p.fila('27147')), /Agente la ve/);
  assert.doesNotMatch(p.texto(p.fila('26681')), /Agente la ve/);
  assert.match(p.toasts.at(-1)[0], /2 facturas/);
  assert.match(p.texto(p.$('#cobPortalMostrar')), /\(0\)/, 'limpia la selección');
});

test('Quitar al agente: manda solo las que tienen check y lo quita de la tabla', async () => {
  const p = await arranca({ marcadas: ['26107'] });
  await p.marca('26107'); await p.marca('26108');
  assert.match(p.texto(p.$('#cobPortalQuitar')), /Quitar al agente \(1\)/);
  await p.clic('#cobPortalQuitar');
  assert.deepEqual(p.puts[0], { documento_ids: [p.idDe('26107')], autorizada: false });
  assert.doesNotMatch(p.texto(p.fila('26107')), /Agente la ve/);
});

test('solo por vencer elegidas: Mostrar apagado y explica por qué', async () => {
  const p = await arranca();
  await p.marca('26681');
  assert.equal(p.$('#cobPortalMostrar').disabled, true);
  assert.match(p.$('#cobPortalMostrar').title, /vencidas/);
});

test('sin permiso de autorizar: no hay botones, pero el check se sigue viendo', async () => {
  const p = await arranca({ perms: ['cob.cartera.read'] });
  assert.equal(p.$('#cobPortalMostrar'), null);
  assert.equal(p.$('#cobPortalQuitar'), null);
  assert.equal(p.fila('26108').querySelector('input[data-sel]'), null);
  assert.match(p.texto(p.fila('26107')), /Agente la ve/);
});

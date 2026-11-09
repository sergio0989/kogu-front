// ============================================================
// tests/cto-requisiciones-parametros-render.test.mjs
// Costo · Precios de requisiciones — tarjeta "Parametros" (margen y
// tolerancias) en la pantalla Margen y precios pactados.
// Regla §16: escrita antes del codigo y mostrada fallando.
// Caso real: margen 15% de configuracion.xlsx; respuesta de
// GET /protected/cto/requisiciones-parametros del servicio real.
// Se corre con: node --test tests/cto-requisiciones-parametros-render.test.mjs
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import fs from 'node:fs';

const JS = fs.readFileSync(new URL('../modules/cto/precios-pactados.js', import.meta.url), 'utf8');
const COMUN = fs.readFileSync(new URL('../modules/cto/requisiciones-comun.js', import.meta.url), 'utf8');
const API = JSON.parse(fs.readFileSync(new URL('./fixtures/cto-req-api-respuestas.json', import.meta.url)));
const TODOS = ['screen.cto.requisiciones', 'cto.requisiciones.read', 'cto.precios_pactados.write'];
const DEFAULTS = { margen: 0.15, meses_antiguedad: 12, var_lote_pct: 0.2,
  origen: { margen: 'default', meses_antiguedad: 'default', var_lote_pct: 'default' } };

async function arranca({ perms = TODOS, params = DEFAULTS, fallaParams = false } = {}) {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div></body></html>',
    { url: 'https://kogu.test/modules/cto/precios-pactados.html', runScripts: 'outside-only' });
  const { window } = dom;
  const pedidos = [];
  let actuales = JSON.parse(JSON.stringify(params));
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
      if (u === '/protected/cto/requisiciones-parametros') {
        if (fallaParams) throw new Error('Sin conexión');
        if (o.method === 'PUT') {
          const b = JSON.parse(o.body);
          const f = (v) => Number(String(v).replace('%', '')) / 100;
          actuales = { margen: f(b.margen), meses_antiguedad: Number(b.meses_antiguedad), var_lote_pct: f(b.var_lote_pct),
            origen: { margen: 'empresa', meses_antiguedad: 'empresa', var_lote_pct: 'empresa' } };
        }
        return { ok: true, data: actuales };
      }
      if (u.startsWith('/protected/cto/precios-pactados?')) return { ok: true, data: API.pactados.filter((x) => x.activo) };
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

test('la pantalla se llama Margen y precios pactados y muestra los parametros en %', async () => {
  const p = await arranca();
  assert.equal(p.window.__init.title, 'Margen y precios pactados');
  assert.equal(p.$('#parMargen').value, '15');
  assert.equal(p.$('#parMeses').value, '12');
  assert.equal(p.$('#parVariacion').value, '20');
  assert.match(p.texto(p.$('#parametros')), /valor por omisión/i);
});

test('guardar: manda los % con su signo y confirma que aplica al calcular o recalcular', async () => {
  const p = await arranca();
  p.$('#parMargen').value = '20';
  p.$('#parGuardar').click(); await p.espera();
  const r = p.ultimo(/requisiciones-parametros$/, 'PUT');
  assert.deepEqual(r.body, { margen: '20%', meses_antiguedad: 12, var_lote_pct: '20%' });
  await p.espera();
  assert.equal(p.$('#parMargen').value, '20');
  assert.match(p.texto(p.$('#parMsg')), /calcul/i);
  assert.doesNotMatch(p.texto(p.$('#parametros')), /valor por omisión/i);
});

test('margen de 1%: se manda como "1%", no como 1 (que el backend leeria como fraccion)', async () => {
  const p = await arranca();
  p.$('#parMargen').value = '1';
  p.$('#parGuardar').click(); await p.espera();
  assert.equal(p.ultimo(/requisiciones-parametros$/, 'PUT').body.margen, '1%');
});

test('validaciones en pantalla: margen 0-100 y meses entero 1-120', async () => {
  const p = await arranca();
  p.$('#parMargen').value = '150';
  p.$('#parGuardar').click(); await p.espera();
  assert.equal(p.ultimo(/requisiciones-parametros$/, 'PUT'), undefined);
  assert.match(p.texto(p.$('#parMsg')), /margen/i);
  p.$('#parMargen').value = '15';
  p.$('#parMeses').value = '2.5';
  p.$('#parGuardar').click(); await p.espera();
  assert.equal(p.ultimo(/requisiciones-parametros$/, 'PUT'), undefined);
  assert.match(p.texto(p.$('#parMsg')), /meses/i);
});

test('solo lectura: ve los parametros pero no puede cambiarlos', async () => {
  const p = await arranca({ perms: ['screen.cto.requisiciones', 'cto.requisiciones.read'] });
  assert.equal(p.$('#parMargen').value, '15');
  assert.equal(p.$('#parMargen').disabled, true);
  assert.equal(p.$('#parGuardar'), null);
});

test('si fallan los parametros, la lista de pactados se muestra igual', async () => {
  const p = await arranca({ fallaParams: true });
  assert.match(p.texto(p.$('#parametros')), /No se pudieron cargar/i);
  assert.equal(p.window.document.querySelectorAll('#pacLista tr[data-id]').length, 3);
});

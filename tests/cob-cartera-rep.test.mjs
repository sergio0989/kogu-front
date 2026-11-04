// ============================================================
// tests/cob-cartera-rep.test.mjs
// Cobranza · control "PPD cobrada sin REP" en la Cartera (ficha + detalle).
// Regla §16: escrita antes de la pantalla y mostrada fallando.
// Datos: respuesta real de GET /protected/cob/controles/rep (servicio del
// backend sobre los casos de los diagnósticos de prod del 3-nov-2026) en
// tests/fixtures/cob-control-rep-20261022.json. Decisiones de Sergio:
// factoraje aparte, ≤1% = diferencia menor, ficha en la Cartera con detalle.
// Las facturas del control ya están cobradas: no están en la tabla de la
// Cartera; la ficha abre su lista y no filtra la tabla.
// Se corre con: node --test tests/cob-cartera-rep.test.mjs
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import fs from 'node:fs';

const JS = fs.readFileSync(new URL('../modules/cob/cartera/cartera.js', import.meta.url), 'utf8');
const COMUN = fs.readFileSync(new URL('../modules/cob/cob-comun.js', import.meta.url), 'utf8');
const CART = JSON.parse(fs.readFileSync(new URL('./fixtures/cob-cartera-20261020.json', import.meta.url)));
const REP = JSON.parse(fs.readFileSync(new URL('./fixtures/cob-control-rep-20261022.json', import.meta.url)));
const K20 = CART.corte.corte_id;

async function arranca({ rep = REP } = {}) {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div></body></html>',
    { url: 'https://kogu.test/modules/cob/cartera/cartera.html', runScripts: 'outside-only' });
  const { window } = dom;
  const pedidos = [];
  window.KoguShell = {
    initShell: async () => { const d = window.document.createElement('div'); d.id = 'pageContent'; window.document.getElementById('app').appendChild(d); return { ok: true, permissions: ['cob.cartera.read'] }; },
    hasPerm: () => false, subscribeEmpresaActivaChange: () => {},
  };
  window.KoguApi = {
    apiFetch: async (url) => {
      pedidos.push(url);
      if (url.startsWith('/protected/cob/controles/rep')) { if (!rep) throw Object.assign(new Error('falla'), { status: 500 }); return { ok: true, data: rep }; }
      if (url.startsWith('/protected/cob/controles/cfdi')) throw Object.assign(new Error('sin control'), { status: 500 });
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
  const $$ = (s) => [...window.document.querySelectorAll(s)];
  const texto = (el) => (el || window.document.getElementById('app')).textContent.replace(/\s+/g, ' ');
  const espera = () => new Promise((r) => setTimeout(r, 60));
  const filas = () => $$('#cobTabla tbody tr.r').filter((tr) => tr.style.display !== 'none');
  return { window, pedidos, $, $$, texto, espera, filas };
}

test('pide el control de REP del mismo corte que se ve', async () => {
  const p = await arranca();
  assert.ok(p.pedidos.includes(`/protected/cob/controles/rep?corte_id=${encodeURIComponent(K20)}`));
});

test('fila REP con cuatro fichas: falta REP (vencidas), factoraje, abierta con REP, diferencia menor', async () => {
  const p = await arranca();
  assert.deepEqual(p.$$('[data-rep] [data-rep-cat]').map((b) => b.dataset.repCat), ['falta_rep', 'factoraje', 'incongruente', 'diferencia_menor']);
  const t = (k) => p.texto(p.$(`[data-rep-cat="${k}"]`));
  assert.match(t('falta_rep'), /Falta REP\s*4\s*facturas · 3 vencidas · US\$35,756 · \$372,380/);
  assert.match(t('factoraje'), /Factoraje\s*2\s*facturas · \$2\.25M/);
  assert.match(t('incongruente'), /Abierta con REP\s*1\s*factura/);
  assert.match(t('diferencia_menor'), /Diferencia menor\s*1\s*factura · US\$16/);
  assert.match(p.texto(p.$('[data-rep]')), /toda la empresa/i);
});

test('detalle de "Falta REP": vencidas primero, con faltante, cobro en SAI y plazo (estimado si no hay cobro)', async () => {
  const p = await arranca();
  p.$('[data-rep-cat="falta_rep"]').click(); await p.espera();
  assert.equal(p.$('#cobRepModal').style.display, 'block');
  assert.deepEqual(p.$$('#cobRepModal [data-rep-folio]').map((x) => x.dataset.repFolio), ['26379', '27186', '27187', '27354']);
  const fila = (f) => p.texto(p.$(`#cobRepModal [data-rep-folio="${f}"]`));
  assert.match(fila('26379'), /MSI EXPRESS.*US\$69,100\.00.*US\$57,005\.00.*US\$12,095\.00.*29\/09\/2026.*05\/10\/2026.*Vencido/);
  assert.match(fila('27354'), /NOVALIMENTOS.*\$327,500\.00.*Sin cobro en SAI.*05\/11\/2026.*estimado/);
  assert.doesNotMatch(fila('27354'), /Vencido/);
  assert.match(p.texto(p.$('#cobRepModal')), /día 5 del mes siguiente/);
});

test('detalle de factoraje: Unilever con lo que cubre el REP y lo que falta', async () => {
  const p = await arranca();
  p.$('[data-rep-cat="factoraje"]').click(); await p.espera();
  assert.deepEqual(p.$$('#cobRepModal [data-rep-folio]').map((x) => x.dataset.repFolio), ['26421', '26658']);
  assert.match(p.texto(p.$('#cobRepModal [data-rep-folio="26421"]')), /UNILEVER MANUFACTURERA.*\$1,353,260\.64.*\$18,741\.31.*\$1,334,519\.33/);
  assert.match(p.texto(p.$('#cobRepModal')), /COMPENSACIÓN/);
});

test('la ficha no filtra la tabla de la Cartera; cerrar el detalle', async () => {
  const p = await arranca();
  const antes = p.filas().length;
  p.$('[data-rep-cat="incongruente"]').click(); await p.espera();
  assert.equal(p.filas().length, antes);
  assert.deepEqual(p.$$('#cobRepModal [data-rep-folio]').map((x) => x.dataset.repFolio), ['26942']);
  p.$('#cobRepCerrar').click();
  assert.equal(p.$('#cobRepModal').style.display, 'none');
});

test('si el control falla, la Cartera se ve igual y sin fila REP', async () => {
  const p = await arranca({ rep: null });
  assert.equal(p.$('[data-rep]'), null);
  assert.ok(p.filas().length > 0);
});

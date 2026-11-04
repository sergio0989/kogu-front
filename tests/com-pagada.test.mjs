// ============================================================
// tests/com-pagada.test.mjs
// Comisiones · "Marcar como pagada" y bloqueo de recalculo en pantalla.
// Regla §16: escrita antes del parche y mostrada fallando.
// Caso (Sergio, 04-nov-2026): una funcion de pago; ya pagada, no se recalcula.
//   POST /protected/com/comisiones/corridas/:id/pagar  { referencia }
//   (permiso com.comisiones.manage; el backend responde 409 PERIODO_PAGADO
//    si se intenta recalcular)
// Se corre con: node --test tests/com-pagada.test.mjs
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import fs from 'node:fs';

const JS = fs.readFileSync(new URL('../modules/com/comisiones.js', import.meta.url), 'utf8');
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const base = (o = {}) => ({
  corrida_id: 'c-1', anio: 2026, mes: 10, estado: 'calculada', vigente: true,
  comision_total: 100, comision_porcentaje: 100, comision_espejo: 0, comision_kg_usd: 0,
  comision_kg_usd_divisa: 0, comision_adicional: 0, subtotal_base: 1000,
  subtotal_con_espejos: 1000, subtotal_periodo_raw: 1200, num_detalle: 3,
  num_excluidos: 1, num_nomapeados: 0, tc_pago: null, created_at: '2026-11-04T10:00:00',
  params: { warnings: [] }, ...o,
});

async function montar({ corrida, permisos = ['screen.comisiones', 'com.comisiones.read', 'com.comisiones.run', 'com.comisiones.manage'], referencia = 'SPEI 0611' }) {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div></body></html>',
    { url: 'https://kogu.test/modules/com/comisiones.html', runScripts: 'outside-only' });
  const { window } = dom;
  const pedidos = [];
  let actual = corrida;
  window.KoguShell = {
    initShell: async () => {
      const d = window.document.createElement('div'); d.id = 'pageContent';
      window.document.getElementById('app').appendChild(d);
      return { ok: true, permissions: permisos };
    },
    subscribeEmpresaActivaChange: () => {},
  };
  window.KoguApi = {
    apiFetch: async (u, o = {}) => {
      const method = o.method || 'GET';
      pedidos.push({ u, method, body: o.body ? JSON.parse(o.body) : null });
      if (method === 'POST' && u.endsWith('/corridas/c-1/pagar')) {
        actual = { ...actual, estado: 'pagada', pagada_at: '2026-11-04T11:00:00', referencia_pago: JSON.parse(o.body).referencia };
        return { ok: true, data: actual };
      }
      if (u.includes('/corridas/vigente')) return { ok: true, data: { corrida: actual, resumen: [] } };
      throw new Error('ruta no esperada ' + method + ' ' + u);
    },
    toast: () => {}, unwrapData: (r) => r?.data, unwrapRows: (r) => r?.data || [],
    getEmpresaActiva: () => ({ nombre_corto: 'ADEGERMEX' }), authFetchRaw: async () => ({ ok: false }),
  };
  window.KoguUi = { escapeHtml: esc, money: (n) => `$${Number(n).toFixed(2)}`, withLoading: async (_e, fn) => fn() };
  window.confirm = () => true;
  window.prompt = () => referencia;
  window.eval(JS);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  await new Promise((r) => setTimeout(r, 80));
  return { window, pedidos, $: (id) => window.document.getElementById(id) };
}
const visible = (el) => !!el && el.style.display !== 'none' && !el.hidden;

test('corrida vigente calculada + permiso manage → botón "Marcar como pagada" visible y Calcular habilitado', async () => {
  const { $ } = await montar({ corrida: base() });
  assert.ok(visible($('pagarBtn')), 'debe existir y verse #pagarBtn');
  assert.equal($('calcBtn').disabled, false);
});

test('al marcar pagada: POST /pagar con la referencia capturada y la pantalla queda en "Pagada" con Calcular bloqueado', async () => {
  const { window, $, pedidos } = await montar({ corrida: base() });
  $('pagarBtn').click();
  await new Promise((r) => setTimeout(r, 120));
  const post = pedidos.find((p) => p.method === 'POST');
  assert.ok(post, 'debe mandar el POST');
  assert.equal(post.u, '/protected/com/comisiones/corridas/c-1/pagar');
  assert.deepEqual(post.body, { referencia: 'SPEI 0611' });
  assert.match($('estadoBadge').textContent, /Pagada/);
  assert.equal($('calcBtn').disabled, true);
  assert.ok(!visible($('pagarBtn')));
  assert.match(window.document.getElementById('pageContent').textContent, /SPEI 0611/);
});

test('si se cancela el cuadro de referencia, no se manda nada', async () => {
  const { $, pedidos } = await montar({ corrida: base(), referencia: null });
  $('pagarBtn').click();
  await new Promise((r) => setTimeout(r, 80));
  assert.ok(!pedidos.some((p) => p.method === 'POST'));
});

test('corrida ya pagada al cargar → badge Pagada, Calcular bloqueado, sin botón de pago', async () => {
  const { $ } = await montar({ corrida: base({ estado: 'pagada', pagada_at: '2026-07-05T09:00:00', referencia_pago: 'SPEI junio' }) });
  assert.match($('estadoBadge').textContent, /Pagada/);
  assert.equal($('calcBtn').disabled, true);
  assert.ok(!visible($('pagarBtn')));
});

test('sin permiso com.comisiones.manage no aparece el botón de pago', async () => {
  const { $ } = await montar({ corrida: base(), permisos: ['screen.comisiones', 'com.comisiones.read', 'com.comisiones.run'] });
  assert.ok(!visible($('pagarBtn')));
});

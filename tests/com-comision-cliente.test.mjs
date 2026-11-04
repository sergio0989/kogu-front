// ============================================================
// tests/com-comision-cliente.test.mjs
// Comisiones · Configuracion "Comision por cliente" con producto opcional.
// Regla §16: escrita antes del parche y mostrada fallando.
// Caso real (Sergio, 04-nov-2026): cliente 2 de ADGM sin agente primario,
// 3 agentes con su %; el agente 14 solo en ciertos productos. La pantalla no
// tiene donde capturar el producto.
// Se corre con: node --test tests/com-comision-cliente.test.mjs
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import fs from 'node:fs';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const FILAS = [
  { comcli_id: 'a', cve_cte: '2', cve_age: 20, porcom: '0.02', cve_prod: null, cliente_nombre: 'CLIENTE 2', agente_nombre: 'AG 20', motivo: '' },
  { comcli_id: 'b', cve_cte: '2', cve_age: 14, porcom: '0.01', cve_prod: 'WWP0164', cliente_nombre: 'CLIENTE 2', agente_nombre: 'AG 14', motivo: '' },
];

async function montar(file, page, routes) {
  const JS = fs.readFileSync(new URL(`../modules/com/${file}`, import.meta.url), 'utf8');
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div></body></html>',
    { url: `https://kogu.test/modules/com/${page}`, runScripts: 'outside-only' });
  const { window } = dom;
  const pedidos = [];
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
      return routes(u, method);
    },
    toast: () => {}, unwrapData: (r) => r?.data, unwrapRows: (r) => r?.data || [],
    getEmpresaActiva: () => ({ nombre_corto: 'ADGM' }), authFetchRaw: async () => ({ ok: false }),
  };
  window.KoguUi = { escapeHtml: esc, money: (n) => `$${Number(n).toFixed(2)}`, withLoading: async (_e, fn) => fn() };
  window.confirm = () => true;
  window.eval(JS);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  await new Promise((r) => setTimeout(r, 80));
  return { window, pedidos, $: (id) => window.document.getElementById(id) };
}
const cfgRoutes = (u) => ({ ok: true, data: u.endsWith('/comision-cliente') ? FILAS : [] });

test('config: agente 14 al 1% solo en WWP0164 → manda cve_prod y limpia al guardar', async () => {
  const { $, pedidos } = await montar('configuracion.js', 'configuracion.html', cfgRoutes);
  $('ccCte').value = '2'; $('ccAge').value = '14'; $('ccPct').value = '1'; $('ccProd').value = 'WWP0164';
  $('ccAdd').click(); await new Promise((r) => setTimeout(r, 100));
  const post = pedidos.find((p) => p.method === 'POST');
  assert.deepEqual(post.body, { cve_cte: '2', cve_age: 14, porcom: 0.01, cve_prod: 'WWP0164', motivo: '' });
  assert.equal($('ccProd').value, '');
});

test('config: sin producto manda cve_prod null (todos los productos)', async () => {
  const { $, pedidos } = await montar('configuracion.js', 'configuracion.html', cfgRoutes);
  $('ccCte').value = '2'; $('ccAge').value = '20'; $('ccPct').value = '2';
  $('ccAdd').click(); await new Promise((r) => setTimeout(r, 100));
  assert.equal(pedidos.find((p) => p.method === 'POST').body.cve_prod, null);
});

test('config: la tabla muestra el producto, o "Todos" cuando no tiene', async () => {
  const { $ } = await montar('configuracion.js', 'configuracion.html', cfgRoutes);
  const txt = $('ccRows').textContent;
  assert.match(txt, /WWP0164/);
  assert.match(txt, /Todos/);
});

test('config: el texto explica que sirve para clientes sin agente primario', async () => {
  const { window } = await montar('configuracion.js', 'configuracion.html', cfgRoutes);
  assert.match(window.document.getElementById('pageContent').textContent, /sin agente primario/i);
});

test('cálculo: el esquema adicional_cliente se etiqueta "Por cliente" (KPI y filtro)', async () => {
  const corrida = { corrida_id: 'c-1', anio: 2026, mes: 10, estado: 'calculada', vigente: true, comision_total: 360,
    comision_porcentaje: 0, comision_espejo: 0, comision_kg_usd: 0, comision_kg_usd_divisa: 0, comision_adicional: 360,
    subtotal_base: 0, subtotal_con_espejos: 26000, subtotal_periodo_raw: 10000, num_detalle: 3, num_excluidos: 0,
    num_nomapeados: 0, tc_pago: null, created_at: '2026-11-04T12:00:00', params: { warnings: [] } };
  const { $ } = await montar('comisiones.js', 'comisiones.html', () => ({ ok: true, data: { corrida, resumen: [] } }));
  assert.match($('kpis').textContent, /Por cliente/);
  assert.match($('detEsq').textContent, /Por cliente/);
  assert.doesNotMatch($('detEsq').textContent, /Adicional/);
});

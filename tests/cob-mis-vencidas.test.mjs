// ============================================================
// tests/cob-mis-vencidas.test.mjs
// Cobranza · portal de agentes: pantalla del agente "Mis clientes · Vencidas".
// Solo consulta (decisión 24-nov-2026). Datos: respuesta de
// GET /protected/cob/portal-agentes/mis-vencidas con los casos reales del corte
// del 13/11 (Alejandra: A 26107, A 26108 de CLIENTE 4 y A 27147 de CLIENTE 222).
// Regla §16: escrita antes de la pantalla, mostrada fallando.
// Se corre con: node --test tests/cob-mis-vencidas.test.mjs
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import fs from 'node:fs';

const RUTA = new URL('../modules/cob/mis-vencidas/mis-vencidas.js', import.meta.url);
const COMUN = fs.readFileSync(new URL('../modules/cob/cob-comun.js', import.meta.url), 'utf8');

const DATOS = {
  corte: { corte_id: 'k-13', fecha_corte: '2026-11-13' },
  agente: { nombre: 'ALEJANDRA GONZALEZ GERENTE DE CTA.' },
  facturas: [
    { serie: 'A', folio: '26107', cliente: 'CLIENTE 4', cve_cte: '4', fecha_doc: '2026-04-08', fecha_vencimiento: '2026-09-20', dias_vencido: 54, moneda: 'USD', saldo: 315.52, seguimiento: null },
    { serie: 'A', folio: '26108', cliente: 'CLIENTE 4', cve_cte: '4', fecha_doc: '2026-04-08', fecha_vencimiento: '2026-09-20', dias_vencido: 54, moneda: 'USD', saldo: 1310.8,
      seguimiento: { accion: 'Programada para pago', texto: 'Pago el viernes', fecha: '2026-11-10', compromiso: '2026-11-14' } },
    { serie: 'A', folio: '27147', cliente: 'CLIENTE 222', cve_cte: '222', fecha_doc: '2026-08-17', fecha_vencimiento: '2026-09-16', dias_vencido: 58, moneda: 'USD', saldo: 4853.11, seguimiento: null },
  ],
  totales: { USD: 6479.43, MXN: 0 },
};

async function arranca({ resp = () => ({ ok: true, data: DATOS }), perms = ['cob.portal_agentes.read'] } = {}) {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div></body></html>',
    { url: 'https://kogu.test/modules/cob/mis-vencidas/mis-vencidas.html', runScripts: 'outside-only' });
  const { window } = dom;
  const pedidos = [];
  let shellOpts = null;
  window.KoguShell = {
    initShell: async (o) => { shellOpts = o; const d = window.document.createElement('div'); d.id = 'pageContent'; window.document.getElementById('app').appendChild(d); return { ok: true, permissions: perms }; },
    hasPerm: () => false, subscribeEmpresaActivaChange: () => {},
  };
  window.KoguApi = {
    apiFetch: async (url) => { pedidos.push(url); return resp(url); },
    toast: () => {},
  };
  window.KoguUi = { escapeHtml: (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') };
  window.eval(COMUN); window.eval(fs.readFileSync(RUTA, 'utf8'));
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  await new Promise((r) => setTimeout(r, 120));
  const $ = (s) => window.document.querySelector(s);
  const texto = (el) => el.textContent.replace(/\s+/g, ' ').trim();
  return { window, $, texto, pedidos, shellOpts: () => shellOpts };
}

test('pide sus vencidas con el permiso del agente', async () => {
  const p = await arranca();
  assert.equal(p.shellOpts().requiredPermission, 'cob.portal_agentes.read');
  // (jsdom dispara su propio DOMContentLoaded además del de la prueba: se pide igual en cada arranque)
  assert.ok(p.pedidos.length >= 1);
  assert.deepEqual([...new Set(p.pedidos)], ['/protected/cob/portal-agentes/mis-vencidas']);
});

test('leyenda del corte, agente y totales solo de las monedas que hay', async () => {
  const p = await arranca();
  const t = p.texto(p.$('#pageContent'));
  assert.match(t, /Saldos al 13\/11\/2026 según el último corte de cartera/);
  assert.match(t, /ALEJANDRA GONZALEZ GERENTE DE CTA\./);
  assert.match(p.texto(p.$('#cobMvTotales')), /USD\s*6,479\.43/);
  assert.doesNotMatch(p.texto(p.$('#cobMvTotales')), /MXN/);
  assert.match(p.texto(p.$('#cobMvTotales')), /3 facturas · 2 clientes/);
});

test('facturas agrupadas por cliente con días vencido, saldo y último seguimiento de CxC', async () => {
  const p = await arranca();
  const grupos = [...p.window.document.querySelectorAll('#cobMvTabla tr.g')].map((g) => p.texto(g));
  assert.equal(grupos.length, 2);
  assert.match(grupos[0], /CLIENTE 222/);   // mayor saldo primero
  assert.match(grupos[0], /USD 4,853\.11/);
  assert.match(grupos[1], /CLIENTE 4/);
  const f26108 = p.texto([...p.window.document.querySelectorAll('#cobMvTabla tr.r')].find((r) => /26108/.test(r.textContent)));
  assert.match(f26108, /A 26108/);
  assert.match(f26108, /54/);
  assert.match(f26108, /1,310\.80/);
  assert.match(f26108, /Programada para pago/);
  assert.match(f26108, /Compromiso 14\/11\/2026/);
});

test('sin facturas autorizadas: mensaje claro, sin tabla', async () => {
  const p = await arranca({ resp: () => ({ ok: true, data: { ...DATOS, facturas: [], totales: { USD: 0, MXN: 0 } } }) });
  assert.equal(p.$('#cobMvTabla'), null);
  assert.match(p.texto(p.$('#pageContent')), /No hay facturas vencidas para mostrar/);
});

test('usuario sin agente ligado (403 COB_PORTAL_SIN_AGENTE): explica qué hacer', async () => {
  const p = await arranca({ resp: () => { throw Object.assign(new Error('Tu usuario no está ligado a un agente comercial en esta empresa.'), { status: 403, code: 'COB_PORTAL_SIN_AGENTE' }); } });
  assert.match(p.texto(p.$('#pageContent')), /no está ligado a un agente comercial/);
  assert.match(p.texto(p.$('#pageContent')), /Pide a Cuentas por cobrar/);
});

test('sin cortes aplicados: lo dice', async () => {
  const p = await arranca({ resp: () => ({ ok: true, data: { ...DATOS, corte: null, facturas: [], totales: {} } }) });
  assert.match(p.texto(p.$('#pageContent')), /Todavía no hay un corte de cartera/);
});

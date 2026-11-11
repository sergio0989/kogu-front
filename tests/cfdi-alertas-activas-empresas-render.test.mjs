// ============================================================
// tests/cfdi-alertas-activas-empresas-render.test.mjs
// Empresas · interruptor "Alertas CFDI" por empresa.
//
// Regla §16.4: escrita antes del cambio y mostrada fallando.
// Caso real (Sergio, 10-nov-2026): en WARNER el IVA exento es normal (707 de
// 4,311 CFDI, 191 tareas en 4 días) y la alerta solo hace ruido. Decisión:
// interruptor por empresa, igual que "Descarga automática CFDI".
// Backend: core_empresas.cfdi_alertas_activas (rama feature/cfdi-alertas-alta-interruptor).
// Se corre con: cd tests && node cfdi-alertas-activas-empresas-render.test.mjs
// ============================================================
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const verde = [];
const rojo = [];
const check = async (n, f) => {
  try { await f(); verde.push(n); }
  catch (e) { rojo.push([n, String(e.message).split('\n')[0]]); }
};

const ARCHIVO = new URL('../modules/core/empresas/empresas.js', import.meta.url).pathname;

const EMPRESAS = [
  { empresa_id: 'e1', clave_empresa: 'ADGM', nombre_corto: 'ADEGERMEX', razon_social: 'ADEGERMEX SA', rfc: 'ADE8703309B6',
    status: 'activa', activo: true, cfdi_descarga_auto: true, cfdi_alertas_activas: true, cfdi_correos_alertas: [] },
  { empresa_id: 'e2', clave_empresa: 'WCM', nombre_corto: 'WARNER', razon_social: 'WARNER CHAPPELL MUSIC MEXICO', rfc: 'WCM910617CC5',
    status: 'activa', activo: true, cfdi_descarga_auto: true, cfdi_alertas_activas: false, cfdi_correos_alertas: [] },
];

async function arranca() {
  const js = fs.readFileSync(ARCHIVO, 'utf8');
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div></body></html>',
    { url: 'https://kogu.test/modules/core/empresas/empresas.html', runScripts: 'outside-only' });
  const { window } = dom;
  const pedidos = [];
  window.KoguShell = {
    initShell: async () => {
      const d = window.document.createElement('div');
      d.id = 'pageContent';
      window.document.getElementById('app').appendChild(d);
      return { ok: true, permisos: ['screen.root.index'] };
    },
  };
  window.KoguApi = {
    apiFetch: async (url, opts = {}) => {
      pedidos.push({ url, opts });
      if (url === '/protected/core/empresas' && !opts.method) return { ok: true, data: { rows: EMPRESAS } };
      return { ok: true, data: { rows: [] } };
    },
    unwrapRows: (r) => r?.data?.rows || [],
    toast: () => {},
  };
  window.KoguUi = {
    escapeHtml: (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    statusBadge: (s) => `<span class="badge">${s}</span>`,
  };
  window.eval(js);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  await new Promise((r) => setTimeout(r, 300));
  const fila = (txt) => [...window.document.querySelectorAll('#rows tr')].find((tr) => tr.textContent.includes(txt));
  return { window, pedidos, fila };
}

await check('la tabla tiene la columna "Alertas CFDI" y WARNER dice No', async () => {
  const { window, fila } = await arranca();
  const ths = [...window.document.querySelectorAll('table th')].map((t) => t.textContent.trim());
  assert.ok(ths.includes('Alertas CFDI'), 'falta la columna');
  const celdas = [...fila('WARNER').querySelectorAll('td')].map((t) => t.textContent.trim());
  assert.equal(celdas[ths.indexOf('Alertas CFDI')], 'No');
});

await check('el formulario tiene el selector "Alertas CFDI"; una empresa nueva arranca en Sí', async () => {
  const { window } = await arranca();
  const sel = window.document.getElementById('cfdi_alertas_activas');
  assert.ok(sel, 'no hay #cfdi_alertas_activas');
  assert.equal(sel.value, 'true');
});

await check('al editar WARNER el selector muestra No', async () => {
  const { window, fila } = await arranca();
  fila('WARNER').querySelector('.btn-edit').click();
  assert.equal(window.document.getElementById('cfdi_alertas_activas').value, 'false');
});

await check('guardar manda cfdi_alertas_activas como booleano en el PUT', async () => {
  const { window, fila, pedidos } = await arranca();
  fila('ADEGERMEX').querySelector('.btn-edit').click();
  window.document.getElementById('cfdi_alertas_activas').value = 'false';
  window.document.getElementById('saveBtn').click();
  await new Promise((r) => setTimeout(r, 100));
  const put = pedidos.find((p) => p.opts.method === 'PUT');
  assert.ok(put, 'no hubo PUT');
  assert.equal(JSON.parse(put.opts.body).cfdi_alertas_activas, false);
});

await check('con alertas apagadas, la vista de correos lo dice (no llegará nada)', async () => {
  const { window, fila } = await arranca();
  fila('WARNER').querySelector('.btn-edit').click();
  assert.match(window.document.getElementById('cfdiCorreosVista').textContent, /apagadas/i);
});

console.log(`\n${'='.repeat(70)}`);
verde.forEach(n => console.log(`  VERDE  ${n}`));
rojo.forEach(([n, m]) => console.log(`  ROJO   ${n}\n           ${m}`));
console.log(`${'='.repeat(70)}`);
console.log(`  ${verde.length} en verde, ${rojo.length} en rojo\n`);
process.exit(rojo.length ? 1 : 0);

// ============================================================
// tests/cfdi-descarga-auto-empresas-render.test.mjs
// Empresas · interruptor "Descarga automática CFDI" por empresa.
//
// Regla §16.4: escrita antes del cambio y mostrada fallando.
// Caso (Sergio, 06-nov-2026): "como desactivar una empresa para ya no
// descargar de forma automática con cfdi" → indicador SOLO de la descarga,
// distinto de "Activo" (que apaga la empresa completa).
// Backend: core_empresas.cfdi_descarga_auto (rama feature/cfdi-impuestos-descarga, 3ccea2f).
// Se corre con: cd tests && node cfdi-descarga-auto-empresas-render.test.mjs
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
    status: 'activa', activo: true, cfdi_descarga_auto: true },
  { empresa_id: 'e2', clave_empresa: 'OLD', nombre_corto: 'EMPRESA SIN DESCARGA', razon_social: 'OLD SA', rfc: 'OLD010101AAA',
    status: 'activa', activo: true, cfdi_descarga_auto: false },
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
    escapeHtml: (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
    statusBadge: (s) => `<span class="badge">${s}</span>`,
  };
  window.eval(js);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  await new Promise((r) => setTimeout(r, 300));
  const fila = (txt) => [...window.document.querySelectorAll('#rows tr')].find((tr) => tr.textContent.includes(txt));
  return { window, pedidos, fila };
}

await check('la tabla tiene la columna "Descarga CFDI" y la empresa apagada dice No', async () => {
  const { window, fila } = await arranca();
  const ths = [...window.document.querySelectorAll('table th')].map((t) => t.textContent.trim());
  assert.ok(ths.includes('Descarga CFDI'), 'falta la columna');
  const celdas = [...fila('EMPRESA SIN DESCARGA').querySelectorAll('td')].map((t) => t.textContent.trim());
  assert.equal(celdas[ths.indexOf('Descarga CFDI')], 'No');
});

await check('el formulario tiene el selector "Descarga automática CFDI", distinto de Activo', async () => {
  const { window } = await arranca();
  const sel = window.document.getElementById('cfdi_descarga_auto');
  assert.ok(sel, 'no hay #cfdi_descarga_auto');
  assert.ok(window.document.getElementById('activo'), 'se perdió el selector Activo');
  assert.equal(sel.value, 'true', 'una empresa nueva debe descargar por defecto');
});

await check('al editar la empresa apagada el selector muestra No', async () => {
  const { window, fila } = await arranca();
  fila('EMPRESA SIN DESCARGA').querySelector('.btn-edit').click();
  assert.equal(window.document.getElementById('cfdi_descarga_auto').value, 'false');
});

await check('guardar manda cfdi_descarga_auto como booleano en el PUT', async () => {
  const { window, fila, pedidos } = await arranca();
  fila('ADEGERMEX').querySelector('.btn-edit').click();
  window.document.getElementById('cfdi_descarga_auto').value = 'false';
  window.document.getElementById('saveBtn').click();
  await new Promise((r) => setTimeout(r, 100));
  const put = pedidos.find((p) => p.opts.method === 'PUT');
  assert.ok(put, 'no hubo PUT');
  assert.equal(JSON.parse(put.opts.body).cfdi_descarga_auto, false);
});

console.log(`\n${'='.repeat(70)}`);
verde.forEach(n => console.log(`  VERDE  ${n}`));
rojo.forEach(([n, m]) => console.log(`  ROJO   ${n}\n           ${m}`));
console.log(`${'='.repeat(70)}`);
console.log(`  ${verde.length} en verde, ${rojo.length} en rojo\n`);
process.exit(rojo.length ? 1 : 0);

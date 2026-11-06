// ============================================================
// tests/cfdi-resumen-impuestos-render.test.mjs
// CFDI · Resumen de negocio / KPI: descuento, IVA, IEPS, IVA exento, sin desglose.
//
// Regla §16.4: escrita antes del cambio y mostrada fallando.
// Decisión (Sergio, 06-nov-2026): descuento e IEPS "en todo". Hoy el resumen
// solo pinta "Traslados" (IVA + IEPS sumados) y no tiene descuento.
// Cifras: Telmex FMM…261 + Plastinal FA 77596, ambos vigentes en MXN.
// Backend: rama feature/cfdi-impuestos-descarga (resumen 3bec5e0).
// Se corre con: cd tests && node cfdi-resumen-impuestos-render.test.mjs
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

const ARCHIVO = new URL('../modules/cfdi/dashboard/resumen.js', import.meta.url).pathname;

const RESUMEN = {
  empresa: { razon_social: 'ADEGERMEX' }, cfdi_totales: 3, cfdi_vigentes: 3,
  homologado_mxn: { subtotal: 5533.94, traslado: 677.73, descuento: 1682, iva: 624.78, ieps: 52.95,
    con_iva_exento: 1, sin_desglose: 1, retenido: 0, total: 4529.67, usd_sin_tipo_cambio: 0 },
  resumen_por_moneda: { mxn: { vigentes: 3, subtotal: 5533.94, traslado: 677.73, descuento: 1682,
    iva: 624.78, ieps: 52.95, retenido: 0, total: 4529.67 } },
};

async function arranca(resumen = RESUMEN) {
  const js = fs.readFileSync(ARCHIVO, 'utf8');
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div></body></html>',
    { url: 'https://kogu.test/modules/cfdi/dashboard/resumen.html', runScripts: 'outside-only' });
  const { window } = dom;
  window.KoguShell = {
    initShell: async () => {
      const d = window.document.createElement('div');
      d.id = 'pageContent';
      window.document.getElementById('app').appendChild(d);
      return { ok: true, permisos: ['screen.cfdi.sat_dm'], empresa_activa: { empresa_id: 'e' } };
    },
    hasPerm: () => true,
    subscribeEmpresaActivaChange: () => {},
  };
  window.KoguApi = {
    apiFetch: async (url) => {
      if (url.includes('negocio/resumen')) return { ok: true, data: resumen };
      if (url.includes('resumen-corporativo')) return { ok: true, data: { total_cfdi: 3 } };
      return { ok: true, data: {} };
    },
    authFetchRaw: async () => { throw new Error('sin red'); },
    unwrapData: (r) => r.data,
    toast: () => {},
  };
  window.KoguUi = {
    escapeHtml: (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
    money: (v) => '$' + Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    int: (v) => String(Number(v || 0)),
    queryParams: (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v !== '' && v != null)).toString(),
    cardStat: (l, v, h) => `<div class="card-stat"><span>${l}</span><strong>${v}</strong><em>${h}</em></div>`,
    withLoading: async (el, fn) => fn(),
  };
  window.eval(js);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  await new Promise((r) => setTimeout(r, 400));
  const txt = (id) => (window.document.getElementById(id)?.textContent || '').replace(/\s+/g, ' ');
  return { window, txt };
}

await check('tarjetas de importes: Descuento, IVA e IEPS homologados por separado', async () => {
  const { txt } = await arranca();
  const t = txt('importesTop');
  assert.match(t, /Descuento[^$]*\$1,682\.00/);
  assert.match(t, /IVA[^$]*\$624\.78/);
  assert.match(t, /IEPS[^$]*\$52\.95/);
});

await check('regresión: sigue la tarjeta de Traslados homologados (677.73)', async () => {
  const { txt } = await arranca();
  assert.match(txt('importesTop'), /Traslados[^$]*\$677\.73/);
});

await check('lectura ejecutiva y columna MXN traen Descuento, IVA e IEPS', async () => {
  const { txt } = await arranca();
  const t = txt('importesEjecutivosBox');
  assert.match(t, /Descuento MXN[^$]*\$1,682\.00/);
  assert.match(t, /IVA MXN[^$]*\$624\.78/);
  assert.match(t, /IEPS MXN[^$]*\$52\.95/);
});

await check('avisa cuántos CFDI traen IVA exento y cuántos no tienen desglose', async () => {
  const { txt } = await arranca();
  const t = txt('importesEjecutivosBox');
  assert.match(t, /1 CFDI con IVA exento/i);
  assert.match(t, /1 CFDI[^.]*sin desglose/i);
});

await check('sin exentos ni históricos no muestra esos avisos', async () => {
  const limpio = { ...RESUMEN, homologado_mxn: { ...RESUMEN.homologado_mxn, con_iva_exento: 0, sin_desglose: 0 } };
  const { txt } = await arranca(limpio);
  const t = txt('importesEjecutivosBox');
  assert.ok(!/IVA exento/i.test(t) && !/sin desglose/i.test(t));
});

console.log(`\n${'='.repeat(70)}`);
verde.forEach(n => console.log(`  VERDE  ${n}`));
rojo.forEach(([n, m]) => console.log(`  ROJO   ${n}\n           ${m}`));
console.log(`${'='.repeat(70)}`);
console.log(`  ${verde.length} en verde, ${rojo.length} en rojo\n`);
process.exit(rojo.length ? 1 : 0);

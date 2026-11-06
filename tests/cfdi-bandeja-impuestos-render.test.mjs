// ============================================================
// tests/cfdi-bandeja-impuestos-render.test.mjs
// CFDI · Bandeja: descuento, IVA / IEPS separados, IVA exento y "sin desglose".
//
// Regla §16.4: escrita antes del cambio y mostrada fallando.
// Casos reales (Sergio, 06-nov-2026): Plastinal FA 77596 (descuento 100%,
// total 0) y Telmex FMM…261 (IVA 624.78 + IEPS 52.95). Hoy la celda de
// importes dice "Traslados 677.73" y no hay descuento ni marca de exento.
// Backend: rama feature/cfdi-impuestos-descarga (bandeja 1c4b290).
// Se corre con: cd tests && node cfdi-bandeja-impuestos-render.test.mjs
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

const ARCHIVO = new URL('../modules/cfdi/bandeja/bandeja.js', import.meta.url).pathname;

const D = '2026-11-06T18:00:00Z';
const TELMEX = { cfdi_id: 'c1', uuid: '8bda38c7-a29a-4d57-ac98-73622875e42f', origen: 'RECIBIDO',
  tipo_comprobante: 'I', emisor_rfc: 'TME840315KT6', emisor_nombre: 'TELEFONOS DE MEXICO', moneda: 'MXN',
  subtotal: '3851.94', descuento: '0.00', impuestos_tras: '677.73', iva_trasladado: '624.78',
  ieps_trasladado: '52.95', impuestos_ret: '0', total: '4529.67', tiene_iva_exento: false,
  base_iva_exento: '0', desglose_impuestos_at: D, estatus_sat: 'Vigente' };
const PLASTINAL = { cfdi_id: 'c2', uuid: '3DD65100-C79F-4467-909C-DA9FB82B89E8', origen: 'RECIBIDO',
  tipo_comprobante: 'I', emisor_rfc: 'PLA970826UR4', emisor_nombre: 'PLASTINAL', moneda: 'MXN',
  subtotal: '1682.00', descuento: '1682.00', impuestos_tras: null, iva_trasladado: '0',
  ieps_trasladado: '0', impuestos_ret: '0', total: '0.00', tiene_iva_exento: false,
  base_iva_exento: '0', desglose_impuestos_at: D, estatus_sat: 'Vigente' };
// Fila sintética: CFDI procesado antes del desglose (no se reprocesa).
const HISTORICO = { cfdi_id: 'c3', uuid: 'HIST-0001', origen: 'RECIBIDO', tipo_comprobante: 'I',
  emisor_rfc: 'AAA010101AAA', emisor_nombre: 'PROVEEDOR VIEJO', moneda: 'MXN', subtotal: '100',
  descuento: null, impuestos_tras: '16', iva_trasladado: null, ieps_trasladado: null,
  impuestos_ret: '0', total: '116', tiene_iva_exento: false, base_iva_exento: '0',
  desglose_impuestos_at: null, estatus_sat: 'Vigente' };
// Fila sintética con IVA exento (no hay XML real todavía).
const EXENTO = { ...TELMEX, cfdi_id: 'c4', uuid: 'EXENTO-0001', emisor_nombre: 'PROVEEDOR EXENTO',
  iva_trasladado: '0', ieps_trasladado: '0', impuestos_tras: '0', total: '1000',
  tiene_iva_exento: true, base_iva_exento: '1000' };

const BANDEJA = {
  total: 4, items: [TELMEX, PLASTINAL, HISTORICO, EXENTO],
  conteos_por_tipo: { por_tipo: { I: 4 }, total: 4 },
  totales: { conteo: 4, subtotal: '6633.94', descuento: '1682.00', impuestos_tras: '693.73',
    iva_trasladado: '624.78', ieps_trasladado: '52.95', con_iva_exento: 1, sin_desglose: 1,
    impuestos_ret: '0', total: '5645.67' },
};

async function arranca() {
  const js = fs.readFileSync(ARCHIVO, 'utf8');
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div></body></html>',
    { url: 'https://kogu.test/modules/cfdi/bandeja/bandeja.html', runScripts: 'outside-only' });
  const { window } = dom;
  const pedidos = [];
  window.KoguShell = {
    initShell: async () => {
      const d = window.document.createElement('div');
      d.id = 'pageContent';
      window.document.getElementById('app').appendChild(d);
      return { ok: true, permisos: ['screen.cfdi.sat_dm'] };
    },
    hasPerm: () => true,
    subscribeEmpresaActivaChange: () => {},
  };
  window.KoguApi = {
    apiFetch: async (url) => {
      pedidos.push(url);
      if (url.includes('incidencias-efos')) return { ok: true, data: { total: 0, resumen: {}, items: [] } };
      return { ok: true, data: BANDEJA };
    },
    authFetchRaw: async (url) => { pedidos.push(url); throw new Error('sin red en la prueba'); },
    unwrapData: (r) => r.data,
    unwrapRows: (r) => r.data?.rows || [],
    toast: () => {},
  };
  window.KoguUi = {
    escapeHtml: (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    money: (v) => '$' + Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    int: (v) => String(Number(v || 0)),
    queryParams: (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v !== '' && v != null)).toString(),
    statusBadge: (s) => `<span>${s}</span>`,
  };
  window.eval(js);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  await new Promise((r) => setTimeout(r, 400));
  const fila = (uuid) => [...window.document.querySelectorAll('#rows tr')]
    .find((tr) => tr.textContent.includes(uuid));
  const txt = (el) => (el ? el.textContent.replace(/\s+/g, ' ') : '');
  return { window, pedidos, fila, txt };
}

console.log('\n── Importes de cada CFDI ───────────────────────────────────────');

await check('Telmex: la celda separa IVA 624.78 e IEPS 52.95', async () => {
  const { fila, txt } = await arranca();
  const t = txt(fila(TELMEX.uuid));
  assert.match(t, /IVA:? \$624\.78/, 'no muestra el IVA por separado');
  assert.match(t, /IEPS:? \$52\.95/, 'no muestra el IEPS por separado');
});

await check('Plastinal: la celda muestra Descuento $1,682.00 (por eso total 0)', async () => {
  const { fila, txt } = await arranca();
  assert.match(txt(fila(PLASTINAL.uuid)), /Descuento:? \$1,682\.00/);
});

await check('Telmex no muestra un renglón de descuento en cero', async () => {
  const { fila, txt } = await arranca();
  assert.ok(!/Descuento/.test(txt(fila(TELMEX.uuid))), 'pinta "Descuento $0.00" sin necesidad');
});

await check('histórico: dice "Sin desglose" y conserva Traslados, no inventa IVA en $0', async () => {
  const { fila, txt } = await arranca();
  const t = txt(fila(HISTORICO.uuid));
  assert.match(t, /Sin desglose/i);
  assert.match(t, /Traslados:? \$16\.00/);
  assert.ok(!/IVA:? \$0\.00/.test(t));
});

await check('IVA exento: la fila trae el chip "IVA exento"', async () => {
  const { fila } = await arranca();
  const chip = fila(EXENTO.uuid)?.querySelector('.chip-exento');
  assert.ok(chip, 'no hay chip de IVA exento');
  assert.match(chip.textContent, /IVA exento/);
  assert.ok(!fila(TELMEX.uuid).querySelector('.chip-exento'), 'Telmex no es exento');
});

console.log('\n── Filtro y totales ────────────────────────────────────────────');

await check('existe el filtro especial con exento / IEPS / descuento / sin desglose', async () => {
  const { window } = await arranca();
  const sel = window.document.getElementById('especial');
  assert.ok(sel, 'no hay select #especial');
  const vals = [...sel.options].map((o) => o.value);
  for (const v of ['', 'iva_exento', 'ieps', 'descuento', 'sin_desglose']) assert.ok(vals.includes(v), `falta ${v || '(todos)'}`);
});

await check('al elegir "IEPS" se vuelve a pedir la bandeja con especial=ieps', async () => {
  const { window, pedidos } = await arranca();
  const sel = window.document.getElementById('especial');
  sel.value = 'ieps';
  sel.dispatchEvent(new window.Event('change'));
  await new Promise((r) => setTimeout(r, 100));
  assert.ok(pedidos.some((u) => u.includes('negocio/bandeja') && u.includes('especial=ieps')));
});

await check('el export lleva el filtro especial', async () => {
  const { window, pedidos } = await arranca();
  window.document.getElementById('especial').value = 'iva_exento';
  window.document.getElementById('exportBtn').click();
  await new Promise((r) => setTimeout(r, 50));
  window.document.querySelector('#koguExportTemplateModal .kogu-empresa-list__item')?.click();
  await new Promise((r) => setTimeout(r, 100));
  assert.ok(pedidos.some((u) => u.includes('exportar-excel') && u.includes('especial=iva_exento')));
});

await check('el resumen superior muestra descuento, IVA, IEPS, exentos y sin desglose', async () => {
  const { window, txt } = await arranca();
  const t = txt(window.document.getElementById('summaryBox'));
  assert.match(t, /Descuento:? \$1,682\.00/);
  assert.match(t, /IVA:? \$624\.78/);
  assert.match(t, /IEPS:? \$52\.95/);
  assert.match(t, /IVA exento:? 1/);
  assert.match(t, /[Ss]in desglose:? 1/);
});

console.log(`\n${'='.repeat(70)}`);
verde.forEach(n => console.log(`  VERDE  ${n}`));
rojo.forEach(([n, m]) => console.log(`  ROJO   ${n}\n           ${m}`));
console.log(`${'='.repeat(70)}`);
console.log(`  ${verde.length} en verde, ${rojo.length} en rojo\n`);
process.exit(rojo.length ? 1 : 0);

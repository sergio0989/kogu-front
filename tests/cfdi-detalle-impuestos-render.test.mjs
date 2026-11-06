// ============================================================
// tests/cfdi-detalle-impuestos-render.test.mjs
// CFDI · Detalle: totales con descuento, IVA / IEPS separados e IVA exento.
//
// Regla §16.4: escrita antes del cambio y mostrada fallando.
// Casos reales (Sergio, 06-nov-2026): Plastinal FA 77596 (descuento 100%) y
// Telmex FMM…261 (IVA 624.78 + IEPS 52.95). Hoy los totales dicen
// "Impuestos trasladados" y no hay renglón de descuento.
// El backend ya devuelve las columnas (SELECT f.*).
// Se corre con: cd tests && node cfdi-detalle-impuestos-render.test.mjs
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

const ARCHIVO = new URL('../modules/cfdi/detalle/detalle.js', import.meta.url).pathname;
const D = '2026-11-06T18:00:00Z';

const TELMEX = { uuid: '8bda38c7-a29a-4d57-ac98-73622875e42f', subtotal: '3851.94', descuento: '0.00',
  impuestos_tras: '677.73', iva_trasladado: '624.78', ieps_trasladado: '52.95', impuestos_ret: '0',
  total: '4529.67', tiene_iva_exento: false, base_iva_exento: '0', desglose_impuestos_at: D,
  conceptos: [{ no_linea: 1, clave_prod: '81161700', cantidad: '1', unidad: 'E48',
    descripcion: 'Servicios de Telecomunicaciones', valor_unit: '3851.94', descuento: '0', importe: '3851.94' }] };
const PLASTINAL = { uuid: '3DD65100-C79F-4467-909C-DA9FB82B89E8', subtotal: '1682.00', descuento: '1682.00',
  impuestos_tras: null, iva_trasladado: '0', ieps_trasladado: '0', impuestos_ret: '0', total: '0.00',
  tiene_iva_exento: false, base_iva_exento: '0', desglose_impuestos_at: D, conceptos: [] };
const HISTORICO = { uuid: 'HIST-0001', subtotal: '100', descuento: null, impuestos_tras: '16',
  iva_trasladado: null, ieps_trasladado: null, impuestos_ret: '0', total: '116',
  tiene_iva_exento: false, base_iva_exento: '0', desglose_impuestos_at: null, conceptos: [] };
const EXENTO = { ...TELMEX, uuid: 'EXENTO-0001', iva_trasladado: '0', ieps_trasladado: '0',
  impuestos_tras: '0', total: '1000', tiene_iva_exento: true, base_iva_exento: '1000' };

async function arranca(ficha) {
  const js = fs.readFileSync(ARCHIVO, 'utf8');
  const dom = new JSDOM('<!DOCTYPE html><html><head></head><body><div id="app"></div></body></html>',
    { url: `https://kogu.test/modules/cfdi/detalle/detalle.html?uuid=${ficha.uuid}`, runScripts: 'outside-only' });
  const { window } = dom;
  window.KoguShell = {
    initShell: async () => {
      const d = window.document.createElement('div');
      d.id = 'pageContent';
      window.document.getElementById('app').appendChild(d);
      return { ok: true, permisos: ['screen.cfdi.sat_dm'], empresa_activa: { empresa_id: 'e' } };
    },
  };
  window.KoguApi = {
    apiFetch: async (url) => {
      if (url.endsWith('/json')) return { ok: true, data: {} };
      if (url.endsWith('/xml')) return '<xml/>';
      return { ok: true, data: ficha };
    },
    authFetchRaw: async () => { throw new Error('sin red'); },
    getToken: () => 't',
    unwrapData: (r) => r?.data,
    toast: () => {},
  };
  window.KoguUi = {
    escapeHtml: (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
    money: (v) => '$' + Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  };
  window.eval(js);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  await new Promise((r) => setTimeout(r, 300));
  const tot = () => (window.document.querySelector('.factura-totales')?.textContent || '').replace(/\s+/g, ' ');
  return { window, tot };
}

await check('Plastinal: los totales muestran Descuento $1,682.00 antes del Total $0.00', async () => {
  const { tot } = await arranca(PLASTINAL);
  assert.match(tot(), /Descuento\s*\$1,682\.00.*Total\s*\$0\.00/);
});

await check('Telmex: IVA trasladado 624.78 e IEPS trasladado 52.95 por separado', async () => {
  const { tot } = await arranca(TELMEX);
  assert.match(tot(), /IVA trasladado\s*\$624\.78/);
  assert.match(tot(), /IEPS trasladado\s*\$52\.95/);
});

await check('regresión: el Total de Telmex sigue en $4,529.67', async () => {
  const { tot } = await arranca(TELMEX);
  assert.match(tot(), /Total\s*\$4,529\.67/);
});

await check('IVA exento: renglón con la base exenta', async () => {
  const { tot } = await arranca(EXENTO);
  assert.match(tot(), /IVA exento \(base\)\s*\$1,000\.00/);
});

await check('histórico: conserva "Impuestos trasladados" y avisa "sin desglose"', async () => {
  const { tot } = await arranca(HISTORICO);
  assert.match(tot(), /Impuestos trasladados\s*\$16\.00/);
  assert.match(tot(), /sin desglose/i);
  assert.ok(!/IVA trasladado\s*\$0\.00/.test(tot()), 'inventa un IVA en cero');
});

console.log(`\n${'='.repeat(70)}`);
verde.forEach(n => console.log(`  VERDE  ${n}`));
rojo.forEach(([n, m]) => console.log(`  ROJO   ${n}\n           ${m}`));
console.log(`${'='.repeat(70)}`);
console.log(`  ${verde.length} en verde, ${rojo.length} en rojo\n`);
process.exit(rojo.length ? 1 : 0);

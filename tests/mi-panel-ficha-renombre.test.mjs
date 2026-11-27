// ============================================================
// tests/mi-panel-ficha-renombre.test.mjs
// Radar · Mi panel · ficha de cliente: la fila de un producto renombrado
// (WWP → ADE) dice cuál era la clave anterior.
//
// Regla §16.4: escrita antes del código y mostrada fallando.
//
// §16.5 — CASO REAL: ficha de GOOD FOODS SMA en dev, 27-nov-2026, rolling
// NOV 25–OCT 26 vs NOV 24–OCT 25 (captura de Sergio). La respuesta del
// endpoint /clientes/227/comparativo NO es un stub escrito a mano: es la
// salida del servicio nuevo (qa/rc-ficha-renombre.test.mjs) con los
// importes de esa captura, volcada a tests/fixtures/.
//
// El backend ya une WWP0782-RS bajo ADE0782-RS; sin la etiqueta, la fila
// dice "ADE0782-RS · Sazonador Español RS" con $6.36 M de previo y nadie
// sabe de dónde salió ese previo si la clave nueva empezó en jul-2025.
// ============================================================
process.env.TZ = 'America/Monterrey';

import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const verde = [];
const rojo = [];
const check = async (n, f) => {
  try { await f(); verde.push(n); }
  catch (e) { rojo.push([n, String(e.message).split('\n')[0]]); }
};

const UI       = new URL('../assets/ui.js', import.meta.url).pathname;
const MI_PANEL = new URL('../modules/rc/mi-panel.js', import.meta.url).pathname;
const FICHA    = JSON.parse(fs.readFileSync(
  new URL('./fixtures/mi-panel-ficha-goodfoods-20261127.json', import.meta.url), 'utf8'));

// La tarjeta de GOOD FOODS y las ventanas del rolling que manda el Radar.
const COMPARATIVO = {
  agente: { agente_id: 'ag-1', agente_nombre: 'CUENTAS ESPECIALES' },
  criterio: { materialidad_mxn: 75000,
              rolling: { r12_d: '2025-11-01', r12_h: '2026-10-31', p12_d: '2024-11-01', p12_h: '2025-10-31' } },
  periodos: { act_d: '2026-09-01', act_h: '2026-10-31', yoy_d: '2025-09-01', yoy_h: '2025-10-31' },
  clientes: [{
    cliente_ref: '227', nombre: 'GOOD FOODS SMA', severidad: 'alerta', base_comparacion: 'yoy',
    riesgo_kg: 0, riesgo_mxn: 1062141.60, caida: null, deriva: null, dormancia: null, productos: [],
  }],
};
const PANEL = {
  agente: { agente_id: 'ag-1', agente_nombre: 'CUENTAS ESPECIALES' }, anio: 2026, meses_transcurridos: 10,
  cartera: [{ cliente_ref: '227', nombre: 'GOOD FOODS SMA', venta_imp: 0, venta_qty: 0 }],
};

const pedidos = [];
async function abreFicha() {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div></body></html>',
    { url: 'https://kogu.test/modules/rc/mi-panel.html', runScripts: 'outside-only' });
  const { window } = dom;
  const errores = [];
  window.KoguShell = {
    initShell: async () => {
      const d = window.document.createElement('div');
      d.id = 'pageContent';
      window.document.getElementById('app').appendChild(d);
      return { ok: true };
    },
    subscribeEmpresaActivaChange: () => {},
  };
  window.KoguApi = {
    apiFetch: async (url) => {
      pedidos.push(url);
      if (url.includes('/clientes/227/comparativo')) return { ok: true, data: FICHA };
      if (url.includes('/mi-panel/comparativo')) return { ok: true, data: COMPARATIVO };
      if (url.includes('/mi-panel')) return { ok: true, data: PANEL };
      return { ok: true, data: {} };
    },
    authFetchRaw: async () => ({ ok: true, blob: async () => ({}), headers: { get: () => '' } }),
    unwrapRows: (res) => res?.data?.rows || res?.data || res || [],
    toast: (m, t) => errores.push(`toast(${t}): ${m}`),
    withLoading: async (el, fn) => fn(),
  };
  // El ui.js REAL, no un sustituto amable.
  window.eval(fs.readFileSync(UI, 'utf8'));
  window.eval(fs.readFileSync(MI_PANEL, 'utf8'));
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  await new Promise((r) => setTimeout(r, 600));
  const btn = window.document.querySelector('#alertas .btn[data-ficha-ref="227"]');
  if (btn) { btn.click(); await new Promise((r) => setTimeout(r, 300)); }
  const modal = window.document.getElementById('rcFichaModal');
  // Renglón de la tabla de productos cuya primera celda es la clave.
  const renglon = (clave) => {
    if (!modal) return null;
    const tr = [...modal.querySelectorAll('tbody tr')]
      .find((t) => t.cells[0] && t.cells[0].textContent.trim() === clave);
    return tr ? tr.textContent.replace(/\s+/g, ' ').trim() : null;
  };
  return { errores, modal, renglon, btn };
}

const F = await abreFicha();

console.log('\n── La ficha nombra la clave anterior ───────────────────────────');

await check('control: el boton Detalle abre la ficha de GOOD FOODS en rolling', async () => {
  assert.ok(F.btn, 'no hay boton Detalle para 227');
  assert.ok(F.modal, 'no abrio la ficha');
  assert.deepEqual(F.errores, []);
  const p = pedidos.find((u) => u.includes('/clientes/227/comparativo'));
  assert.match(p || '', /p1d=2024-11-01.*p2h=2026-10-31/, `no pidio el rolling: ${p}`);
  assert.ok(F.renglon('WWP0155-G'), 'no pinto la tabla de productos');
});

await check('ADE0782-RS dice "antes WWP0782-RS"', async () => {
  const r = F.renglon('ADE0782-RS');
  assert.ok(r, 'no esta ADE0782-RS');
  assert.match(r, /antes WWP0782-RS/, r);
});

await check('los cuatro unidos lo dicen: 0781-RS, 0770-RS, 1034', async () => {
  for (const [ahora, antes] of [['ADE0781-RS', 'WWP0781-RS'], ['ADE0770-RS', 'WWP0770-RS'], ['ADE1034', 'WWP1034']]) {
    assert.match(F.renglon(ahora) || '', new RegExp(`antes ${antes}`), `${ahora}: ${F.renglon(ahora)}`);
  }
});

await check('perdida real: ADE0704 dice "antes WWP0704" y sigue "abandonado"', async () => {
  const r = F.renglon('ADE0704') || '';
  assert.match(r, /antes WWP0704/, r);
  assert.match(r, /abandonado/, r);
});

await check('sin renombre no dice "antes": WWP0155-G y ADE1090', async () => {
  assert.ok(!/antes/.test(F.renglon('WWP0155-G')), F.renglon('WWP0155-G'));
  assert.ok(!/antes/.test(F.renglon('ADE1090')), F.renglon('ADE1090'));
});

console.log(`\nverde ${verde.length} · rojo ${rojo.length}`);
for (const n of verde) console.log(`  ✔ ${n}`);
for (const [n, m] of rojo) console.log(`  ✘ ${n}\n      ${m}`);
process.exit(rojo.length ? 1 : 0);

// ============================================================
// tests/consulta-ventas-renombre.test.mjs
// Consulta de ventas · pestaña comparativa: una clave renombrada
// (WWP#### → ADE####) no se pinta como "dejó de comprar" + "nueva".
// Pendiente #3 del informe del 25-nov; decisión A2 + B del 26-nov.
//
// Regla §16.4: escrita antes del código y mostrada fallando.
//
// La respuesta de la API NO es un stub escrito a mano: es la salida del
// servicio nuevo del backend (qa/rc-consulta-ventas-renombre.test.mjs)
// corrido contra Postgres, volcada a tests/fixtures/. Las fechas de los
// pares son las de prod (ADGM, consulta del 26-nov); las cantidades y los
// clientes son los construidos de esa prueba.
//
// El backend ya cambia el estado a 'renombrada'; la pantalla hoy no tiene
// etiqueta para ese estado y la deja en blanco.
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

const UI      = new URL('../assets/ui.js', import.meta.url).pathname;
const ARCHIVO = new URL('../modules/rc/consulta-ventas.js', import.meta.url).pathname;
const REAL    = JSON.parse(fs.readFileSync(
  new URL('./fixtures/consulta-ventas-renombre-20261126.json', import.meta.url), 'utf8'));

const CLIENTES = { clientes: [
  { cve_cte: 108, nombre: 'MSI EXPRESS', agente: 'ALEJANDRA GONZALEZ', renglones: 9, ultima_venta: '2026-05-10' },
] };

async function montar() {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div></body></html>',
    { url: 'https://kogu.test/modules/rc/consulta-ventas.html', runScripts: 'outside-only' });
  const { window } = dom;
  let cuerpoComp = REAL.clave;
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
      if (url.includes('/consulta-ventas/comparativo')) return { ok: true, data: cuerpoComp };
      if (url.includes('/consulta-ventas/clientes')) return { ok: true, data: CLIENTES };
      if (url.includes('/consulta-ventas/claves')) return { ventana: 'periodo', claves: [] };
      if (url.includes('/consulta-ventas')) return { ok: true, data: { periodo: {}, agrupar: 'clave', meses: [], filas: [], totales: {}, unidades: [], devoluciones: {}, procedencia: {} } };
      return { ok: true, data: {} };
    },
    authFetchRaw: async () => ({ ok: true, blob: async () => ({}), headers: { get: () => '' } }),
    toast: (m, t) => errores.push(`toast(${t}): ${m}`),
    withLoading: async (el, fn) => fn(),
  };
  // El ui.js REAL, no un sustituto amable.
  window.eval(fs.readFileSync(UI, 'utf8'));
  window.eval(fs.readFileSync(ARCHIVO, 'utf8'));
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  await new Promise((r) => setTimeout(r, 400));
  const $ = (id) => window.document.getElementById(id);
  $('tabComparativo').click();
  await new Promise((r) => setTimeout(r, 150));
  $('btnClientes').click();
  await new Promise((r) => setTimeout(r, 150));
  const op = [...window.document.querySelectorAll('#modalBody [data-ref]')].find((e) => e.dataset.ref === '108');
  op.querySelector('input[type=checkbox]').checked = true;
  $('modalAceptar').click();
  await new Promise((r) => setTimeout(r, 300));
  return {
    errores, $,
    comparar: async (c) => { cuerpoComp = c; $('btnComparar').click(); await new Promise((r) => setTimeout(r, 300)); },
    // El renglon de la tabla cuya celda de clave es exactamente `clave`.
    renglon: (clave) => {
      const tr = [...$('tablaComp').querySelectorAll('tbody tr')]
        .find((t) => [...t.cells].some((td) => td.firstChild && td.firstChild.textContent.trim() === clave));
      return tr ? tr.textContent.replace(/\s+/g, ' ').trim() : null;
    },
  };
}

console.log('\n── Por clave: el estado dice "renombrada" ──────────────────────');

const P = await montar();

await check('control: la tabla pinta los renglones de la respuesta real', async () => {
  await P.comparar(REAL.clave);
  assert.deepEqual(P.errores, []);
  assert.ok(P.renglon('EMP0076'), 'no pinto la tabla: el arnes no consulto');
  assert.match(P.renglon('EMP0076'), /dej[oó] de comprar/, 'la etiqueta de siempre no sale');
});

await check('WWP0707 dice "renombrada → ADE0707", no queda en blanco', async () => {
  const r = P.renglon('WWP0707');
  assert.ok(r, 'no esta WWP0707');
  assert.match(r, /renombrada → ADE0707/, r);
});

await check('ADE0707 dice "renombrada ← WWP0707"', async () => {
  const r = P.renglon('ADE0707');
  assert.match(r || '', /renombrada ← WWP0707/, r);
  assert.ok(!/undefined/.test(r), r);
});

await check('la celda del % (sin porcentaje contra cero) dice el renombre, no "—"', async () => {
  // ADE0707 no tiene comparacion: su % es nulo y la celda imprime la
  // etiqueta en su lugar. Mirar el renglon entero no lo distinguia de la
  // etiqueta junto a la unidad (lo delato una mutacion).
  const tr = [...P.$('tablaComp').querySelectorAll('tbody tr')]
    .find((t) => t.cells[1] && t.cells[1].textContent.trim() === 'ADE0707');
  assert.ok(tr, 'no esta ADE0707');
  const pct = tr.cells[tr.cells.length - 1].textContent.trim();
  assert.equal(pct, 'renombrada ← WWP0707');
});

await check('perdida real: WWP0547 sigue "dejó de comprar" y avisa a que clave paso', async () => {
  const r = P.renglon('WWP0547');
  assert.match(r || '', /dej[oó] de comprar/, r);
  assert.match(r || '', /ADE0547/, `no dice que la clave paso a ADE0547: ${r}`);
});

console.log('\n── Por clave canónica: la fila nombra la clave anterior ─────────');

await check('ADE0707 dice "antes WWP0707"', async () => {
  await P.comparar(REAL.canonica);
  const r = P.renglon('ADE0707');
  assert.ok(r, 'no esta ADE0707');
  assert.match(r, /antes WWP0707/, r);
});

await check('la clave con sufijo tambien: ADE0782-RS "antes WWP0782-RS"', async () => {
  assert.match(P.renglon('ADE0782-RS') || '', /antes WWP0782-RS/);
});

console.log(`\nverde ${verde.length} · rojo ${rojo.length}`);
for (const n of verde) console.log(`  ✔ ${n}`);
for (const [n, m] of rojo) console.log(`  ✘ ${n}\n      ${m}`);
process.exit(rojo.length ? 1 : 0);

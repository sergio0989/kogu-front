// ============================================================
// tests/consulta-ventas-renombre-filtro.test.mjs
// Consulta de ventas · pestaña comparativa: la pantalla declara el
// renombre que va dentro de una fila "comparable" y el alcance de un
// filtro por clave vigente.
//
// Regla §16.4: escrita antes del código y mostrada fallando.
//
// §16.5 — CASO REAL (dev, 27-nov-2026, capturas de Sergio): Corporación
// Dinant, ene–oct 2026 vs ene–oct 2025.
//   · Por clave, ADE1034 decía +325.8 % sin etiqueta: el volumen que se
//     movió desde WWP1034 parecía crecimiento.
//   · Con filtro solo ADE1034, la procedencia de la pantalla no decía que
//     el filtro incluye WWP1034 (y agrupando por canónica decía "todas").
// La respuesta de la API es la salida del servicio nuevo
// (qa/rc-consulta-ventas-renombre-filtro.test.mjs), volcada a fixture.
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
  new URL('./fixtures/consulta-ventas-dinant-20261127.json', import.meta.url), 'utf8'));

const CLIENTES = { clientes: [
  { cve_cte: 25, nombre: 'Corporacion Dinant, S.A De C.V', agente: 'CUENTAS ESPECIALES', renglones: 6, ultima_venta: '2026-06-10' },
] };

async function montar() {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div></body></html>',
    { url: 'https://kogu.test/modules/rc/consulta-ventas.html', runScripts: 'outside-only' });
  const { window } = dom;
  let cuerpoComp = REAL.todas_clave;
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
  const op = [...window.document.querySelectorAll('#modalBody [data-ref]')].find((e) => e.dataset.ref === '25');
  op.querySelector('input[type=checkbox]').checked = true;
  $('modalAceptar').click();
  await new Promise((r) => setTimeout(r, 300));
  return {
    errores, $,
    comparar: async (c) => { cuerpoComp = c; $('btnComparar').click(); await new Promise((r) => setTimeout(r, 300)); },
    renglon: (clave) => {
      const tr = [...$('tablaComp').querySelectorAll('tbody tr')]
        .find((t) => [...t.cells].some((td) => td.firstChild && td.firstChild.textContent.trim() === clave));
      return tr ? tr.textContent.replace(/\s+/g, ' ').trim() : null;
    },
    procedencia: () => $('procedenciaComp').textContent.replace(/\s+/g, ' '),
  };
}

const P = await montar();

console.log('\n── Por clave: la fila comparable declara el renombre ──────────');

await check('control: pinta las filas de la respuesta real', async () => {
  await P.comparar(REAL.todas_clave);
  assert.deepEqual(P.errores, []);
  assert.match(P.renglon('WWP1034') || '', /renombrada → ADE1034/);
});

await check('ADE1034 dice "incluye renombre ← WWP1034"', async () => {
  assert.match(P.renglon('ADE1034') || '', /incluye renombre ← WWP1034/, P.renglon('ADE1034'));
});

await check('ADE0081-S dice "incluye renombre ← WWP0081-S"', async () => {
  assert.match(P.renglon('ADE0081-S') || '', /incluye renombre ← WWP0081-S/, P.renglon('ADE0081-S'));
});

console.log('── Filtro por la vigente: la procedencia dice el alcance ───────');

await check('canonica con filtro ADE1034: "Claves: ADE1034 (incluye WWP1034)", no "todas"', async () => {
  await P.comparar(REAL.filtro_canonica);
  const t = P.procedencia();
  assert.ok(!/Claves: todas/.test(t), `dice que no hubo filtro: "${t}"`);
  assert.match(t, /ADE1034 \(incluye WWP1034\)/, t);
});

await check('canonica con filtro de Dinant: "Clientes: Corporacion Dinant…", no "todos"', async () => {
  const t = P.procedencia();
  assert.ok(!/Clientes: todos/.test(t), `dice que no hubo filtro de cliente: "${t}"`);
  assert.match(t, /Clientes: Corporacion Dinant/, t);
});

console.log(`\nverde ${verde.length} · rojo ${rojo.length}`);
for (const n of verde) console.log(`  ✔ ${n}`);
for (const [n, m] of rojo) console.log(`  ✘ ${n}\n      ${m}`);
process.exit(rojo.length ? 1 : 0);

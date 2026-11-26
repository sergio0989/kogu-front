// ============================================================
// tests/consulta-ventas-cobertura.test.mjs
// Consulta de ventas · pestaña comparativa: avisar en pantalla cuando el
// periodo actual rebasa los datos cargados. Pendiente #2, lado front.
//
// Regla §16.4: escrita antes del código y mostrada fallando.
//
// Caso real (prod, 25-nov-2026): ADGM declara su carga de ventas hasta el
// 2026-10-31 y su última venta es del 2026-10-30 (el 31 fue sábado). El
// comparativo más usado, ene–dic 2026 contra 2025, pone 304 días con
// datos contra 365. El backend ya lo calcula (commit f682c75) y lo manda
// en `procedencia`; esta prueba fija que la pantalla lo diga.
//
// La fecha va en ISO, como el resto del renglón ("Periodo 2026-01-01 a
// 2026-12-31") y como la hoja del Excel: dos formatos en una línea se
// leen mal. El arnés carga el ui.js REAL y fija America/Monterrey: si
// alguien la pasara por fmtDate saldría "30/10/2026, 18:00", un día antes. Las fechas de la respuesta son
// las del caso, no dependen del día en que se corra.
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

const CLIENTES = { clientes: [
  { cve_cte: 308, nombre: 'Unilever North America', agente: 'ALEJANDRA GONZALEZ', renglones: 40, ultima_venta: '2026-10-30' },
] };
const CLAVES = { ventana: 'periodo', claves: [] };

// Respuesta de /comparativo tal como la arma el backend en f682c75.
const base = (procedenciaExtra, actualHasta, actualDias) => ({
  periodos: {
    preset: 'anio_anterior',
    actual: { desde: '2026-01-01', hasta: actualHasta, dias: actualDias },
    comparacion: { desde: '2025-01-01', hasta: actualHasta.replace('2026', '2025'), dias: actualDias },
    longitudes_iguales: true,
  },
  agrupar: 'clave',
  filas: [{
    cve_cte: 308, cliente: 'Unilever North America', cve_prod: 'WWP0164.', clave_canonica: 'WWP0164',
    mercado: 'EXT', unidad: 'KG', es_kilogramo: true,
    actual: { cantidad: 1000, mxn: 70000, usd: 3500, renglones: 10 },
    comparacion: { cantidad: 800, mxn: 56000, usd: 2800, renglones: 8 },
    delta: { cantidad: 200, mxn: 14000, usd: 700 },
    delta_pct: { cantidad: 25, mxn: 25, usd: 25 }, estado: 'comparable',
  }],
  totales_unidad: [{ unidad: 'KG', es_kilogramo: true,
    actual: { cantidad: 1000, mxn: 70000, usd: 3500 }, comparacion: { cantidad: 800, mxn: 56000, usd: 2800 },
    delta: { cantidad: 200, mxn: 14000, usd: 700 } }],
  totales: { actual: { mxn: 70000, usd: 3500 }, comparacion: { mxn: 56000, usd: 2800 },
             delta: { mxn: 14000, usd: 700 } },
  devoluciones: { actual: { renglones: 0, cantidad: 0 }, comparacion: { renglones: 0, cantidad: 0 } },
  procedencia: {
    preset: 'anio_anterior', longitudes_iguales: true, fecha_campo: 'falta_fac',
    cantidad_campo: 'cant_surt', importe_campo: 'subt_prod',
    usd_regla: 'subt_prod / tip_cam solo en cve_mon = 2', agrupar: 'clave',
    clientes: ['Unilever North America'], claves: ['WWP0164.'],
    ...procedenciaExtra,
  },
});

const ENE_DIC = base({
  datos_hasta: '2026-10-31', datos_fuente: 'periodo_declarado',
  actual_rebasa_datos: true, actual_dias_con_datos: 304, actual_dias_sin_datos: 61,
}, '2026-12-31', 365);
const ENE_OCT = base({
  datos_hasta: '2026-10-31', datos_fuente: 'periodo_declarado',
  actual_rebasa_datos: false, actual_dias_con_datos: 304, actual_dias_sin_datos: 0,
}, '2026-10-31', 304);
const RESPALDO = base({
  datos_hasta: '2026-09-30', datos_fuente: 'ultima_venta',
  actual_rebasa_datos: true, actual_dias_con_datos: 273, actual_dias_sin_datos: 92,
}, '2026-12-31', 365);

async function montar() {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div></body></html>',
    { url: 'https://kogu.test/modules/rc/consulta-ventas.html', runScripts: 'outside-only' });
  const { window } = dom;
  const errores = [];
  let cuerpoComp = ENE_DIC;
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
      if (url.includes('/consulta-ventas/claves')) return CLAVES;
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
  // Un cliente elegido: sin filtro la pestaña no consulta.
  $('tabComparativo').click();
  await new Promise((r) => setTimeout(r, 150));
  $('btnClientes').click();
  await new Promise((r) => setTimeout(r, 150));
  const op = [...window.document.querySelectorAll('#modalBody [data-ref]')]
    .find((e) => e.dataset.ref === '308');
  op.querySelector('input[type=checkbox]').checked = true;
  $('modalAceptar').click();
  await new Promise((r) => setTimeout(r, 300));

  return {
    errores, $,
    aviso: () => $('avisoLongitud').textContent.replace(/\s+/g, ' '),
    comparar: async (c) => {
      cuerpoComp = c;
      $('btnComparar').click();
      await new Promise((r) => setTimeout(r, 300));
    },
  };
}

console.log('\n── La pantalla dice hasta donde hay datos ──────────────────────');

const P = await montar();

await check('el arnes llego a la pestana comparativa sin errores', async () => {
  assert.deepEqual(P.errores, []);
  assert.match(P.aviso(), /Periodo/, 'no pinto el aviso de periodos: el arnes no consulto');
});

await check('ene–dic 2026: avisa que hay datos hasta el 2026-10-31, 304 de 365 dias', async () => {
  await P.comparar(ENE_DIC);
  const t = P.aviso();
  assert.match(t, /2026-10-31/, `no dice hasta cuando hay datos (o corrio el dia): "${t}"`);
  assert.match(t, /304/, 'no dice cuantos dias tienen datos');
  assert.match(t, /61/, 'no dice cuantos faltan');
  assert.match(t, /periodo declarado/i, 'no dice de donde sale la fecha');
});

await check('ene–oct 2026: no hay aviso de datos faltantes', async () => {
  await P.comparar(ENE_OCT);
  const t = P.aviso();
  assert.match(t, /Periodo/, 'no repinto el aviso');
  assert.ok(!/faltan|sin datos|datos cargados/i.test(t), `aviso en un periodo completo: "${t}"`);
});

await check('ene–oct 2026: la cobertura se nombra aunque no haya aviso', async () => {
  // El contexto viaja con el numero: quien ve la pantalla sabe hasta
  // donde hay datos aunque su periodo este completo.
  const t = P.$('procedenciaComp').textContent.replace(/\s+/g, ' ');
  assert.match(t, /2026-10-31/, `la procedencia no dice la cobertura: "${t}"`);
});

await check('sin periodo declarado: dice que es la ultima venta registrada', async () => {
  await P.comparar(RESPALDO);
  const t = P.aviso();
  assert.match(t, /2026-09-30/, 'no dice la fecha de respaldo');
  assert.match(t, /[uú]ltima venta/i, 'no dice que la fecha es la ultima venta y no un periodo declarado');
});

console.log(`\nverde ${verde.length} · rojo ${rojo.length}`);
for (const n of verde) console.log(`  ✔ ${n}`);
for (const [n, m] of rojo) console.log(`  ✘ ${n}\n      ${m}`);
process.exit(rojo.length ? 1 : 0);

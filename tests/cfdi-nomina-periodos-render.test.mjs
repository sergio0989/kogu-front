// ============================================================
// tests/cfdi-nomina-periodos-render.test.mjs
// CFDI · Bandeja Nomina — periodo "Rango" con atajos Bimestre / Trimestre /
// Semestre y flechas para moverse al periodo anterior / siguiente.
//
// Regla §16.4: escrita antes del cambio y mostrada fallando.
// Sin reporte del contador de un bimestre: los atajos los define el
// calendario. Ancla real: GCP junio 2026 (ya cuadrado con ?mes=2026-06).
// Backend: rama feature/cfdi-nomina-rango (?desde=YYYY-MM-DD&hasta=YYYY-MM-DD,
// hasta inclusivo).
// Se corre con: cd tests && node cfdi-nomina-periodos-render.test.mjs
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

const ARCHIVO = new URL('../modules/cfdi/bandeja-nomina/bandeja-nomina.js', import.meta.url).pathname;
const espera = (ms = 30) => new Promise((r) => setTimeout(r, ms));

async function arranca() {
  const js = fs.readFileSync(ARCHIVO, 'utf8');
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div></body></html>',
    { url: 'https://kogu.test/modules/cfdi/bandeja-nomina/bandeja-nomina.html', runScripts: 'outside-only' });
  const { window } = dom;
  const pedidos = [];
  window.KoguShell = {
    initShell: async () => {
      const d = window.document.createElement('div');
      d.id = 'pageContent';
      window.document.getElementById('app').appendChild(d);
      return { ok: true, empresa_activa: { empresa_id: 'E' } };
    },
  };
  window.KoguApi = {
    apiFetch: async (url) => { pedidos.push(url); return { ok: true, data: { total: 0, items: [], kpis: {}, periodo: { etiqueta: 'x' } } }; },
    authFetchRaw: async (url) => { pedidos.push(url); throw new Error('sin red en la prueba'); },
    unwrapData: (r) => r.data,
    toast: () => {},
  };
  window.KoguUi = {
    escapeHtml: (s) => String(s ?? ''),
    money: (v) => '$' + Number(v || 0).toFixed(2),
    int: (v) => String(Number(v || 0)),
  };
  window.eval(js);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  await espera(100);
  const $ = (id) => window.document.getElementById(id);
  const ultimo = () => new URL(pedidos[pedidos.length - 1], 'https://x').searchParams;
  const elige = async (id, v) => { $(id).value = v; $(id).dispatchEvent(new window.Event('change')); await espera(); };
  const clic = async (el) => { el.click(); await espera(); };
  const atajo = (k) => window.document.querySelector(`[data-atajo="${k}"]`);
  const rango = () => [$('desde').value, $('hasta').value];
  return { window, pedidos, $, ultimo, elige, clic, atajo, rango };
}

console.log('\n── Selector de periodo ─────────────────────────────────────────');

await check('la carga inicial sigue siendo por mes (?mes=)', async () => {
  const { ultimo } = await arranca();
  assert.ok(ultimo().get('mes'), 'no manda ?mes en la carga inicial');
  assert.ok(!ultimo().get('desde'));
});

await check('existe la opcion "Rango" con Desde / Hasta y los tres atajos', async () => {
  const { $, atajo } = await arranca();
  const vals = [...$('tipoPeriodo').options].map((o) => o.value);
  assert.ok(vals.includes('rango'), 'no hay opcion rango');
  assert.ok($('desde') && $('hasta'), 'faltan los inputs desde/hasta');
  for (const k of ['B', 'T', 'S']) assert.ok(atajo(k), `falta el boton de atajo ${k}`);
  assert.ok($('atajoPrev') && $('atajoNext'), 'faltan las flechas anterior/siguiente');
});

await check('al elegir Rango se ocultan mes/año y se ven desde/hasta', async () => {
  const { $, elige } = await arranca();
  await elige('tipoPeriodo', 'rango');
  assert.equal($('mes').style.display, 'none');
  assert.equal($('anio').style.display, 'none');
  assert.notEqual($('rangoBox').style.display, 'none');
});

console.log('\n── Atajos (calendario) ─────────────────────────────────────────');

await check('Bimestre sobre 15/05/2026 → 01/05–30/06 y consulta ?desde&hasta', async () => {
  const { $, elige, clic, atajo, rango, ultimo } = await arranca();
  await elige('tipoPeriodo', 'rango');
  $('desde').value = '2026-05-15';
  await clic(atajo('B'));
  assert.deepEqual(rango(), ['2026-05-01', '2026-06-30']);
  assert.equal(ultimo().get('desde'), '2026-05-01');
  assert.equal(ultimo().get('hasta'), '2026-06-30');
  assert.ok(!ultimo().get('mes') && !ultimo().get('anio'), 'manda mes/anio junto con el rango');
});

await check('Trimestre sobre 15/05/2026 → 01/04–30/06', async () => {
  const { $, elige, clic, atajo, rango } = await arranca();
  await elige('tipoPeriodo', 'rango');
  $('desde').value = '2026-05-15';
  await clic(atajo('T'));
  assert.deepEqual(rango(), ['2026-04-01', '2026-06-30']);
});

await check('Semestre sobre 15/05/2026 → 01/01–30/06', async () => {
  const { $, elige, clic, atajo, rango } = await arranca();
  await elige('tipoPeriodo', 'rango');
  $('desde').value = '2026-05-15';
  await clic(atajo('S'));
  assert.deepEqual(rango(), ['2026-01-01', '2026-06-30']);
});

await check('bisiesto: Bimestre sobre 10/02/2028 → 01/01–29/02', async () => {
  const { $, elige, clic, atajo, rango } = await arranca();
  await elige('tipoPeriodo', 'rango');
  $('desde').value = '2028-02-10';
  await clic(atajo('B'));
  assert.deepEqual(rango(), ['2028-01-01', '2028-02-29']);
});

await check('flechas: siguiente / anterior bimestre, cruzando de año', async () => {
  const { $, elige, clic, atajo, rango } = await arranca();
  await elige('tipoPeriodo', 'rango');
  $('desde').value = '2026-11-15';
  await clic(atajo('B'));
  assert.deepEqual(rango(), ['2026-11-01', '2026-12-31']);
  await clic($('atajoNext'));
  assert.deepEqual(rango(), ['2027-01-01', '2027-02-28']);
  await clic($('atajoPrev'));
  await clic($('atajoPrev'));
  assert.deepEqual(rango(), ['2026-09-01', '2026-10-31']);
});

console.log('\n── Rango libre y export ────────────────────────────────────────');

await check('rango libre: con ambas fechas consulta; con una sola no', async () => {
  const { $, elige, ultimo, pedidos, window } = await arranca();
  await elige('tipoPeriodo', 'rango');
  $('desde').value = ''; $('hasta').value = '';
  const antes = pedidos.length;
  $('desde').value = '2026-05-01';
  $('desde').dispatchEvent(new window.Event('change')); await espera();
  assert.equal(pedidos.length, antes, 'consulto con una sola fecha');
  $('hasta').value = '2026-06-20';
  $('hasta').dispatchEvent(new window.Event('change')); await espera();
  assert.equal(ultimo().get('desde'), '2026-05-01');
  assert.equal(ultimo().get('hasta'), '2026-06-20');
});

await check('Exportar Excel en rango manda el mismo ?desde&hasta', async () => {
  const { $, elige, clic, atajo, ultimo } = await arranca();
  await elige('tipoPeriodo', 'rango');
  $('desde').value = '2026-05-15';
  await clic(atajo('B'));
  await clic($('exportBtn'));
  assert.equal(ultimo().get('desde'), '2026-05-01');
  assert.equal(ultimo().get('hasta'), '2026-06-30');
});

console.log(`\n${verde.length} verdes · ${rojo.length} rojas`);
for (const n of verde) console.log('  ✓', n);
for (const [n, e] of rojo) console.log('  ✗', n, '—', e);
process.exit(rojo.length ? 1 : 0);

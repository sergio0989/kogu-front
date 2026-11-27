// ============================================================
// tests/radar-vocabulario.test.mjs
// Radar · el vocabulario de los tres motivos que lee el usuario.
//
// Regla §16.4: escrita antes del código y mostrada fallando.
//
// §16.5 — CASO REAL: Sergio, 27-nov-2026, por lo que le dicen ventas y
// atención a clientes: "les cuesta trabajo entender encogiendo". La
// captura de KPIs del CRM (Volumen atendido) muestra las tres cubetas EN
// CAÍDA · SIN COMPRA · ENCOGIENDO. Decisión (opción A): el tiempo va en la
// palabra —una baja de golpe en el bimestre contra una que viene de todo
// el año—:
//
//   En caída   → Caída reciente
//   Sin compra → Sin compra
//   Encogiendo → Baja sostenida
//
// Y una nota que el cambio del 27-nov (1c87ae3, una sola escala) volvió
// falsa: Mi panel decía "El rojo compara dentro de tu cartera, no contra la
// empresa". Ahora es al revés.
//
// Las tres tarjetas son clientes reales de la tabla de dev del 27-nov, con
// su severidad de EMPRESA: NESTLE MEXICO (caída, crítica, 17,496 kg),
// GRUPO AGROINDUSTRIAL COR (sin compra, alerta, 1,486 kg) y PRODUCTOS
// CHATA (sólo deriva, alerta, 0 kg). El arnés usa el ui.js real.
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

const UI = new URL('../assets/ui.js', import.meta.url).pathname;
const MI_PANEL = new URL('../modules/rc/mi-panel.js', import.meta.url).pathname;
const BANDEJA = new URL('../modules/rc/bandeja.js', import.meta.url).pathname;

const PERIODOS = {
  act_d: '2026-09-01', act_h: '2026-10-31', yoy_d: '2025-09-01', yoy_h: '2025-10-31',
  prev_d: '2026-07-01', prev_h: '2026-08-31', mes_en_curso_excluido: true,
  p1d: '2025-09-01', p1h: '2025-11-01', p2d: '2026-09-01', p2h: '2026-10-31',
};
const CLIENTES = [
  { cliente_ref: '1', nombre: 'NESTLE MEXICO', agente_nombre: 'CUENTAS ESPECIALES',
    severidad: 'critica', base_comparacion: 'yoy', riesgo_kg: 17496, riesgo_mxn: 1500000,
    caida_kg: 17496, caida_mxn: 1500000,
    caida: { cant_p1: 30000, cant_p2: 12504, venta_p1: 2600000, venta_p2: 1100000,
      delta_cantidad: -0.58, delta_importe: -0.58 },
    dormancia: null, deriva: null, productos: [], alertas: [], estado: null },
  { cliente_ref: '2', nombre: 'GRUPO AGROINDUSTRIAL COR', agente_nombre: 'CUENTAS ESPECIALES',
    severidad: 'alerta', base_comparacion: null, riesgo_kg: 1486, riesgo_mxn: 120000,
    caida: null, deriva: null,
    dormancia: { dias_sin_compra: 95, ultima_compra: '2026-07-27', venta_ventana: 120000, kg_ventana: 1486 },
    productos: [], alertas: [], estado: null },
  { cliente_ref: '3', nombre: 'PRODUCTOS CHATA', agente_nombre: 'CUENTAS ESPECIALES',
    severidad: 'alerta', base_comparacion: null, riesgo_kg: 0, riesgo_mxn: 310000,
    caida: null, dormancia: null,
    deriva: { delta_mxn: -0.18, delta_kg: 0.02, caida_mxn: 310000, caida_kg: 0, meses_con_compra: 12 },
    productos: [], alertas: [], estado: null },
];
const COMP = {
  agente: { agente_id: 'ag-1', agente_nombre: 'CUENTAS ESPECIALES' },
  criterio: { materialidad_mxn: 75000 }, periodos: PERIODOS, clientes: CLIENTES,
};

async function montar(archivo, url) {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div></body></html>',
    { url, runScripts: 'outside-only' });
  const { window } = dom;
  window.KoguShell = {
    initShell: async () => {
      const d = window.document.createElement('div');
      d.id = 'pageContent';
      window.document.getElementById('app').appendChild(d);
      return { ok: true, permisos: ['rc.read', 'rc.run', 'rc.vendedor.read', 'rc.override'] };
    },
    hasPerm: () => true,
    subscribeEmpresaActivaChange: () => {},
  };
  window.KoguApi = {
    apiFetch: async (u) => {
      if (u.includes('/mi-panel/comparativo') || u.includes('/rc/comparativo')) return { ok: true, data: COMP };
      if (u.includes('/mi-panel')) return { ok: true, data: { agente: COMP.agente, anio: 2026 } };
      return { ok: true, data: { rows: [] } };
    },
    authFetchRaw: async () => ({ ok: true, blob: async () => ({}), headers: { get: () => '' } }),
    unwrapRows: (res) => res?.data?.rows || res?.data || res || [],
    toast: () => {},
    withLoading: async (el, fn) => fn(),
  };
  window.eval(fs.readFileSync(UI, 'utf8'));
  window.eval(fs.readFileSync(archivo, 'utf8'));
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  await new Promise((r) => setTimeout(r, 700));
  const $ = (id) => window.document.getElementById(id);
  const txt = (id) => ($(id) ? $(id).textContent.replace(/\s+/g, ' ') : '');
  return { window, $, txt };
}

console.log('\n── Mi panel ───────────────────────────────────────────────────');
const MP = await montar(MI_PANEL, 'https://kogu.test/modules/rc/mi-panel.html');

await check('control: Mi panel pinta las tres tarjetas', async () => {
  const t = MP.txt('alertas');
  for (const n of ['NESTLE MEXICO', 'GRUPO AGROINDUSTRIAL COR', 'PRODUCTOS CHATA']) assert.ok(t.includes(n), `falta ${n}`);
});

await check('Mi panel: las tarjetas de resumen dicen "Caída reciente" y "Baja sostenida"', async () => {
  const t = MP.txt('carteraResumen');
  assert.match(t, /Caída reciente/, t);
  assert.match(t, /Sin compra/, t);
  assert.match(t, /Baja sostenida/, t);
});

await check('Mi panel: ya no dice "Encogiendo" ni "En caída" en ningún lado', async () => {
  const t = MP.txt('carteraResumen') + ' ' + MP.txt('alertas');
  assert.ok(!/encogiendo/i.test(t), `sigue diciendo Encogiendo: ${t.slice(0, 200)}`);
  assert.ok(!/\bEn caída\b/.test(t), 'sigue diciendo "En caída"');
});

await check('Mi panel: la línea de CHATA dice "Baja sostenida:" con sus 12 de 12 meses', async () => {
  assert.match(MP.txt('alertas'), /Baja sostenida: [^·]*en 12 meses[^·]*·[^·]*·\s*compró 12 de 12 meses/);
});

await check('Mi panel: el filtro por la tarjeta dice "Filtro activo: baja sostenida"', async () => {
  MP.window.document.querySelector('#carteraResumen [data-motivo="deriva"]').onclick();
  await new Promise((r) => setTimeout(r, 100));
  assert.match(MP.txt('carteraResumen'), /Filtro activo: baja sostenida/i);
  MP.window.document.querySelector('#carteraResumen [data-motivo="deriva"]').onclick();
  await new Promise((r) => setTimeout(r, 100));
});

await check('Mi panel: la nota de severidad dice que el rojo compara contra la empresa', async () => {
  const t = MP.txt('carteraResumen');
  assert.ok(!/dentro de tu cartera/i.test(t), 'sigue diciendo que compara dentro de la cartera');
  assert.match(t, /contra toda la empresa/i, t);
});

console.log('\n── Bandeja ────────────────────────────────────────────────────');
const BJ = await montar(BANDEJA, 'https://kogu.test/modules/rc/bandeja.html');

await check('control: la Bandeja pinta las tres tarjetas', async () => {
  const t = BJ.txt('alertas');
  for (const n of ['NESTLE MEXICO', 'GRUPO AGROINDUSTRIAL COR', 'PRODUCTOS CHATA']) assert.ok(t.includes(n), `falta ${n}`);
});

await check('Bandeja: las tarjetas de resumen dicen "Caída reciente" y "Baja sostenida"', async () => {
  const t = BJ.txt('alertasResumen');
  assert.match(t, /Caída reciente/, t);
  assert.match(t, /Baja sostenida/, t);
  assert.match(t, /Sin compra(?!r)/, 'la Bandeja dice "Sin comprar" y Mi panel "Sin compra"');
  assert.ok(!/encogiendo/i.test(t + BJ.txt('alertas')), 'sigue diciendo Encogiendo');
  assert.ok(!/\bEn caída\b/.test(t), 'sigue diciendo "En caída"');
});

await check('Bandeja: la línea de CHATA dice "Baja sostenida:"', async () => {
  assert.match(BJ.txt('alertas'), /Baja sostenida: /);
});

console.log(`\nverde ${verde.length} · rojo ${rojo.length}`);
for (const n of verde) console.log(`  ✔ ${n}`);
for (const [n, m] of rojo) console.log(`  ✘ ${n}\n      ${m}`);
process.exit(rojo.length ? 1 : 0);

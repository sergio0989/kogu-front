// ============================================================
// tests/crm-actividades-filtros.test.mjs
// CRM · Actividades: filtros con etiqueta, los mismos de KPIs, y el
// cliente se elige en un modal con búsqueda (no escribiendo su clave).
//
// Regla §16.4: escrita antes del código y mostrada FALLANDO.
//
// §16.5 — CASO REAL: capturas de Sergio, 27-nov-2026 (dev.kogu.ink). KPIs:
// "Desde · Hasta · Origen · Agente · Mes analizado · Severidad", cada uno
// con su etiqueta. Actividades: controles sueltos sin etiqueta y un campo
// "Cliente (cve)" donde hay que saberse la clave. Decisión (opción B): la
// lista lleva los filtros de KPIs además de los suyos, y el cliente sale de
// un modal con los clientes que tienen actividades en tu alcance.
//
// Clientes del modal: los de las capturas (CHILES Y CONDIMENTOS 6,
// ABASTECEDORA 124) más uno construido. ui.js stub con fmtDateOnly real.
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

const ARCHIVO = new URL('../modules/crm/actividades.js', import.meta.url).pathname;
const CLIENTES = [
  { cliente_ref: '124', cliente_nombre: 'ABASTECEDORA DE PRODUCTOS NATURALES', actividades: 2, abiertas: 1 },
  { cliente_ref: '6', cliente_nombre: 'CHILES Y CONDIMENTOS INDUSTRIALES', actividades: 1, abiertas: 1 },
  { cliente_ref: '90', cliente_nombre: 'IMPORTADORA DEL GOLFO', actividades: 1, abiertas: 1 },
];
const espera = (ms = 80) => new Promise((r) => setTimeout(r, ms));

async function arranca({ permisos = ['crm.actividades.read', 'crm.actividades.admin'] } = {}) {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div></body></html>', {
    url: 'https://kogu.test/modules/crm/actividades.html', runScripts: 'outside-only',
  });
  const { window } = dom;
  const listas = [];
  const pedidosClientes = [];
  window.KoguShell = {
    initShell: async () => {
      const d = window.document.createElement('div');
      d.id = 'pageContent';
      window.document.getElementById('app').appendChild(d);
      return { permisos };
    },
    hasPerm: (_b, p) => permisos.includes(p),
    subscribeEmpresaActivaChange: () => {},
  };
  window.KoguApi = {
    apiFetch: async (url) => {
      if (/\/actividades\/resumen/.test(url)) return { ok: true, data: {} };
      if (/\/actividades\/clientes/.test(url)) {
        pedidosClientes.push(url);
        const q = (new URL(url, 'https://x').searchParams.get('q') || '').toLowerCase();
        return { ok: true, data: CLIENTES.filter((c) => !q || c.cliente_nombre.toLowerCase().includes(q) || c.cliente_ref.includes(q)) };
      }
      if (/\/etiquetas$/.test(url)) return { ok: true, data: [] };
      if (/\/agentes/.test(url)) return { ok: true, data: { rows: [{ agente_id: 'ag-7', agente_nombre: 'Marcela Garza' }] } };
      if (/\/actividades(\?|$)/.test(url)) { listas.push(url); return { ok: true, data: { items: [] } }; }
      return { ok: true, data: {} };
    },
    authFetchRaw: async () => ({ ok: true, blob: async () => ({}), headers: { get: () => '' } }),
    toast: () => {},
  };
  window.KoguUi = {
    escapeHtml: (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    money: (v) => '$' + Number(v || 0).toLocaleString('es-MX', { maximumFractionDigits: 2 }),
    fmtDate: (v) => (v ? new Date(v).toLocaleString('es-MX') : '-'),
    fmtDateOnly: (v) => { const m = String(v ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : '-'; },
    withLoading: async (el, fn) => fn(),
  };
  window.eval(fs.readFileSync(ARCHIVO, 'utf8'));
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  await espera(500);
  const $ = (id) => window.document.getElementById(id);
  const ultima = () => new URL(listas[listas.length - 1] || '/x', 'https://x').searchParams;
  const cambia = async (id, valor) => {
    $(id).value = valor;
    $(id).dispatchEvent(new window.Event('change'));
    await espera();
  };
  return { window, $, listas, pedidosClientes, ultima, cambia };
}

console.log('\n── Los filtros llevan etiqueta, como en KPIs ──────────────────');

await check('control: la pantalla pide la lista al arrancar', async () => {
  const { listas } = await arranca();
  assert.ok(listas.length >= 1);
});

await check('cada filtro tiene su etiqueta: Desde · Hasta · Origen · Agente · Mes analizado · Severidad · Vigencia · Estado · Cliente · Etiqueta', async () => {
  const { window } = await arranca();
  const labels = [...window.document.querySelectorAll('#actFiltros .label-text')].map((x) => x.textContent.trim());
  for (const l of ['Desde', 'Hasta', 'Origen', 'Agente', 'Mes analizado', 'Severidad', 'Vigencia', 'Estado', 'Cliente', 'Etiqueta']) {
    assert.ok(labels.includes(l), `falta la etiqueta "${l}" (hay: ${labels.join(' · ')})`);
  }
});

await check('Origen y Severidad ofrecen las mismas opciones que KPIs', async () => {
  const { $ } = await arranca();
  const ops = (id) => [...($(id)?.options || [])].map((o) => o.value);
  assert.deepEqual(ops('filOrigen'), ['', 'mi-panel', 'manual', 'comex-recon']);
  assert.deepEqual(ops('filSev'), ['', 'critica', 'alerta', 'info']);
});

// §16.5 — captura de Sergio, 27-nov 17:24: "los campos de los filtros
// tienen diferentes tamaños". Cada control traía su max-width (170, 190,
// 220, 160…) en una fila flex, y Cliente era un botón (otra altura). jsdom
// no mide; se verifica la estructura que produce el mismo tamaño.
await check('la barra de filtros es una cuadrícula de columnas iguales', async () => {
  const { $ } = await arranca();
  assert.equal($('actFiltros').style.display, 'grid');
  assert.match($('actFiltros').style.gridTemplateColumns, /repeat\(auto-fill, ?minmax\(\d+px, ?1fr\)\)/);
});

await check('todos los campos ocupan su columna completa, sin ancho máximo propio', async () => {
  const { window } = await arranca();
  const mal = [...window.document.querySelectorAll('#actFiltros input, #actFiltros select, #actFiltros button')]
    .filter((el) => el.style.width !== '100%' || el.style.maxWidth)
    .map((el) => `${el.id} (width ${el.style.width || '—'}, max ${el.style.maxWidth || '—'})`);
  assert.deepEqual(mal, []);
});

await check('Cliente se ve como un selector: misma clase que los desplegables', async () => {
  const { $ } = await arranca();
  assert.ok($('filCliente').classList.contains('select'), `clases: ${$('filCliente').className}`);
});

console.log('\n── Cada filtro viaja a la lista ───────────────────────────────');

await check('origen → ?origen=manual', async () => {
  const { cambia, ultima } = await arranca();
  await cambia('filOrigen', 'manual');
  assert.equal(ultima().get('origen'), 'manual');
});

await check('severidad → ?severidad=critica', async () => {
  const { cambia, ultima } = await arranca();
  await cambia('filSev', 'critica');
  assert.equal(ultima().get('severidad'), 'critica');
});

await check('mes analizado → ?periodo=2026-09', async () => {
  const { cambia, ultima } = await arranca();
  await cambia('filPeriodo', '2026-09');
  assert.equal(ultima().get('periodo'), '2026-09');
});

await check('desde y hasta → ?desde=…&hasta=…', async () => {
  const { cambia, ultima } = await arranca();
  await cambia('filDesde', '2026-11-01');
  await cambia('filHasta', '2026-11-27');
  assert.equal(ultima().get('desde'), '2026-11-01');
  assert.equal(ultima().get('hasta'), '2026-11-27');
});

await check('agente → ?agente_id=ag-7', async () => {
  const { cambia, ultima } = await arranca();
  await espera(100);
  await cambia('filAgente', 'ag-7');
  assert.equal(ultima().get('agente_id'), 'ag-7');
});

await check('sin fechas al arrancar: la lista no se recorta sola (como hoy)', async () => {
  const { ultima } = await arranca();
  assert.ok(!ultima().get('desde') && !ultima().get('hasta'), 'la lista arrancó recortada por fecha');
});

console.log('\n── Cliente: modal con búsqueda, no la clave a mano ────────────');

await check('ya no hay campo de texto "Cliente (cve)"', async () => {
  const { window } = await arranca();
  assert.ok(!window.document.querySelector('input[placeholder="Cliente (cve)"]'), 'sigue el campo de clave a mano');
});

await check('el botón de cliente abre un modal con los clientes que tienen actividades y su conteo', async () => {
  const { $, pedidosClientes } = await arranca();
  $('filCliente').onclick();
  await espera();
  assert.ok(pedidosClientes.length, 'no pidió /actividades/clientes');
  const t = $('actCliModal')?.textContent || '';
  assert.match(t, /ABASTECEDORA DE PRODUCTOS NATURALES/);
  assert.match(t, /CHILES Y CONDIMENTOS INDUSTRIALES/);
  assert.match(t, /2 actividades/);
});

await check('la búsqueda filtra el modal ("chiles")', async () => {
  const { window, $ } = await arranca();
  $('filCliente').onclick();
  await espera();
  $('actCliBuscar').value = 'chiles';
  $('actCliBuscar').dispatchEvent(new window.Event('input'));
  await espera(500);
  const t = $('actCliModal').textContent;
  assert.match(t, /CHILES/);
  assert.ok(!/ABASTECEDORA/.test(t), 'no filtró');
});

await check('elegir un cliente filtra la lista (?cliente_ref=124), cierra el modal y el botón dice su nombre', async () => {
  const { window, $, ultima } = await arranca();
  $('filCliente').onclick();
  await espera();
  window.document.querySelector('#actCliModal [data-cli="124"]').click();
  await espera();
  assert.equal(ultima().get('cliente_ref'), '124');
  assert.ok(!$('actCliModal'), 'el modal sigue abierto');
  assert.match($('filCliente').textContent, /ABASTECEDORA/);
});

await check('"Todos los clientes" quita el filtro', async () => {
  const { window, $, ultima } = await arranca();
  $('filCliente').onclick();
  await espera();
  window.document.querySelector('#actCliModal [data-cli="124"]').click();
  await espera();
  $('filCliente').onclick();
  await espera();
  window.document.querySelector('#actCliModal [data-cli=""]').click();
  await espera();
  assert.ok(!ultima().get('cliente_ref'), 'no quitó el filtro de cliente');
  assert.match($('filCliente').textContent, /Todos/);
});

console.log(`\nverde ${verde.length} · rojo ${rojo.length}`);
for (const n of verde) console.log(`  ✔ ${n}`);
for (const [n, m] of rojo) console.log(`  ✘ ${n}\n      ${m}`);
process.exit(rojo.length ? 1 : 0);

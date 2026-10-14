// ============================================================
// Prueba de render de consulta-ventas.js (jsdom).
// Se escribe antes del código y se muestra en rojo (§16.4).
// Los casos salen de los mismos fenómenos medidos que el backend.
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

const ARCHIVO = new URL('../modules/rc/consulta-ventas.js', import.meta.url).pathname;

// ── Respuestas del backend, con la forma real del servicio ───────────
const MESES = ['2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03',
  '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'];

const serie308 = [17600, 0, 17600, 17600, 17600, 0, 17600, 0, 0, 17600, 17600, 0];

const CONSULTA = {
  periodo: { desde: '2025-10-01', hasta: '2026-09-30', meses: 12 },
  agrupar: 'clave',
  meses: MESES,
  filas: [
    { cve_cte: 308, cliente: 'Unilever North America', cve_prod: 'WWP0164.',
      clave_canonica: 'WWP0164', mercado: 'EXT', unidad: 'KG',
      cantidad: 123200, mxn: 7701440, usd: 437360, renglones: 7,
      serie: serie308, serie_mxn: serie308.map((v) => v * 62.48), serie_usd: serie308.map((v) => v * 3.55),
      es_kilogramo: true },
    { cve_cte: 108, cliente: 'MSI EXPRESS, INC.', cve_prod: 'WWP0164.',
      clave_canonica: 'WWP0164', mercado: 'EXT', unidad: 'PIEZA',
      cantidad: 120, mxn: 88000, usd: 5000, renglones: 1,
      serie: [0, 0, 0, 0, 0, 0, 0, 0, 120, 0, 0, 0],
      serie_mxn: [0, 0, 0, 0, 0, 0, 0, 0, 88000, 0, 0, 0],
      serie_usd: [0, 0, 0, 0, 0, 0, 0, 0, 5000, 0, 0, 0],
      es_kilogramo: false },
  ],
  totales: { cantidad: 123320, mxn: 7789440, usd: 442360 },
  unidades: ['KG', 'PIEZA'],
  es_kilogramo: false,
  devoluciones: { renglones: 1, cantidad: -2000, mxn: -117920, usd: -6700 },
  procedencia: {
    desde: '2025-10-01', hasta: '2026-09-30',
    fecha_campo: 'falta_fac', cantidad_campo: 'cant_surt', importe_campo: 'subt_prod',
    usd_regla: 'subt_prod / tip_cam solo en cve_mon = 2',
    agrupar: 'clave',
    clientes: ['MSI EXPRESS, INC.', 'Unilever North America'],
    claves: ['WWP0164.'],
    claves_canonicas: ['WWP0164'],
    unidades: ['KG', 'PIEZA'],
    neto_de_devoluciones: true,
    generado_en: '2026-10-15T18:00:00.000Z',
  },
};

const CLIENTES = {
  clientes: [
    { cve_cte: 308, nombre: 'Unilever North America', agente: 'ALEJANDRA GONZALEZ',
      falta_en_catalogo: false, renglones: 55, ultima_venta: '2026-08-27' },
    { cve_cte: 108, nombre: 'MSI EXPRESS, INC.', agente: 'ALEJANDRA GONZALEZ',
      falta_en_catalogo: false, renglones: 208, ultima_venta: '2026-08-24' },
    { cve_cte: 1, nombre: 'UNILEVER MANUFACTURERA', agente: null,
      falta_en_catalogo: false, renglones: 1791, ultima_venta: '2026-08-31' },
    { cve_cte: 777, nombre: 'CLIENTE SIN ALTA', agente: null,
      falta_en_catalogo: true, renglones: 9, ultima_venta: '2026-07-01' },
  ],
};

const CLAVES = {
  ventana: 'periodo', desde: '2025-10-01', hasta: '2026-09-30',
  claves: [
    { cve_prod: 'WWP0164.', clave_canonica: 'WWP0164', mercado: 'EXT',
      descripcion: 'POWDERED ONION EXTRACT', unidad: 'KG', renglones: 125, ultima_venta: '2026-08-27' },
    { cve_prod: 'WWP0167-D.', clave_canonica: 'WWP0167-D', mercado: 'EXT',
      descripcion: 'POWDERED GARLIC EXTRACT', unidad: 'KG', renglones: 93, ultima_venta: '2026-08-24' },
    { cve_prod: 'WWP0167-C2-', clave_canonica: 'WWP0167-C2', mercado: 'EXT',
      descripcion: 'POWDERED GARLIC EXTRACT', unidad: 'KG', renglones: 33, ultima_venta: '2026-08-20' },
  ],
};

async function montar() {
  const js = fs.readFileSync(ARCHIVO, 'utf8');
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div></body></html>',
    { url: 'https://kogu.test/modules/rc/consulta-ventas.html', runScripts: 'outside-only' });
  const { window } = dom;
  await new Promise((r) => {
    if (window.document.readyState === 'complete') return r();
    window.addEventListener('load', r);
    setTimeout(r, 500);
  });
  const errores = [];
  const pedidos = [];
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
      // El front debe tolerar las dos envolturas posibles del backend.
      if (url.includes('/consulta-ventas/clientes')) return { ok: true, data: CLIENTES };
      if (url.includes('/consulta-ventas/claves')) return CLAVES;
      if (url.includes('/consulta-ventas')) return { ok: true, data: CONSULTA };
      return { ok: true, data: {} };
    },
    toast: (m, t) => errores.push(`toast(${t}): ${m}`),
    withLoading: async (el, fn) => fn(),
  };
  window.KoguUi = {
    escapeHtml: (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    money: (v) => '$' + Number(v || 0).toLocaleString('es-MX', { maximumFractionDigits: 0 }),
    fmtDateOnly: (v) => {
      const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
      return m ? `${m[3]}/${m[2]}/${m[1]}` : String(v);
    },
    withLoading: async (el, fn) => fn(),
  };
  window.eval(js);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  await new Promise((r) => setTimeout(r, 400));
  return { window, errores, pedidos, $: (id) => window.document.getElementById(id) };
}

let P = null;
await check('la pantalla levanta sin errores', async () => {
  P = await montar();
  assert.deepEqual(P.errores, []);
});

await check('el periodo arranca con una ventana de 12 meses', async () => {
  const d = P.$('fDesde'); const h = P.$('fHasta');
  assert.ok(d && h, 'faltan los campos de periodo');
  assert.match(d.value, /^\d{4}-\d{2}-\d{2}$/, `desde vacío: "${d.value}"`);
  assert.match(h.value, /^\d{4}-\d{2}-\d{2}$/, `hasta vacío: "${h.value}"`);
  const meses = (new Date(h.value) - new Date(d.value)) / (1000 * 60 * 60 * 24 * 30.4);
  assert.ok(meses > 10 && meses < 13, `la ventana inicial debe ser de 12 meses, dio ${meses.toFixed(1)}`);
});

await check('el encabezado imprime la procedencia con nombres, no conteos', () => {
  const t = P.$('procedencia').textContent.replace(/\s+/g, ' ');
  assert.match(t, /Unilever North America/, 'debe nombrar cada entidad');
  assert.match(t, /MSI EXPRESS/, 'debe nombrar cada entidad');
  assert.match(t, /WWP0164\./, 'debe nombrar cada clave resuelta');
  assert.match(t, /falta_fac/, 'debe declarar el campo de fecha');
  assert.match(t, /subt_prod/, 'debe declarar el campo de importe');
});

await check('el pivote trae las 12 columnas de mes, ceros incluidos', () => {
  const ths = [...P.window.document.querySelectorAll('#tablaPivote thead th')].map((e) => e.textContent.trim());
  const conMes = MESES.filter((m) => ths.some((t) => t.includes(m.slice(5)) || t.includes(m)));
  assert.equal(conMes.length, 12, `esperaba 12 meses en el encabezado, encontré ${conMes.length}`);
  const fila = [...P.window.document.querySelectorAll('#tablaPivote tbody tr')]
    .find((tr) => tr.textContent.includes('Unilever North America'));
  assert.ok(fila, 'no está la fila de Unilever North');
  const celdas = [...fila.querySelectorAll('td')].map((e) => e.textContent.trim());
  assert.ok(celdas.some((c) => /^0$/.test(c.replace(/[^\d]/g, '') || '0') || c === '0' || c === '—'),
    'los meses sin compra deben verse, no desaparecer');
});

await check('no rotula kilogramo cuando hay una unidad que no es peso (§4.9.6)', () => {
  const t = P.$('medida').textContent.replace(/\s+/g, ' ');
  assert.match(t, /unidad de venta/i,
    `con PIEZA mezclada la medida no es kilogramo: "${t}"`);
  assert.match(t, /PIEZA/, 'debe decir cuáles unidades trae');
});

await check('muestra las devoluciones aparte del neto', () => {
  const t = P.$('devoluciones').textContent.replace(/\s+/g, ' ');
  assert.match(t, /2,000|2000/, 'debe decir cuánto se restó por devoluciones');
});

await check('marca al cliente que no está en el catálogo (§3.5)', async () => {
  P.$('btnClientes').click();
  await new Promise((r) => setTimeout(r, 120));
  const t = P.$('modalBody').textContent;
  assert.match(t, /CLIENTE SIN ALTA/, 'el cliente sin alta debe aparecer');
  assert.match(t, /sin alta|catálogo/i, 'y debe aparecer marcado, no oculto');
});

await check('la búsqueda del selector ignora acentos', async () => {
  const q = P.$('modalBuscar');
  assert.ok(q, 'falta el campo de búsqueda del modal');
  q.value = 'unilever';
  q.dispatchEvent(new P.window.Event('input'));
  await new Promise((r) => setTimeout(r, 80));
  const visibles = [...P.window.document.querySelectorAll('#modalBody [data-ref]')]
    .filter((e) => !e.hidden);
  assert.ok(visibles.length >= 2, `debe encontrar las dos Unilever, encontró ${visibles.length}`);
  assert.ok(!visibles.some((e) => /MSI/.test(e.textContent)), 'no debe colar a MSI');
});

await check('elegir cliente dispara la cascada hacia las claves (§3)', async () => {
  const antes = P.pedidos.length;
  const op = [...P.window.document.querySelectorAll('#modalBody [data-ref]')]
    .find((e) => e.dataset.ref === '308');
  assert.ok(op, 'no está la opción de Unilever North');
  op.click();
  P.$('modalAceptar').click();
  await new Promise((r) => setTimeout(r, 200));
  const nuevos = P.pedidos.slice(antes);
  assert.ok(nuevos.some((u) => u.includes('/consulta-ventas/claves') && u.includes('clientes=308')),
    `la cascada debe pedir las claves del cliente: ${JSON.stringify(nuevos)}`);
});

await check('la lista de claves declara con qué ventana se armó (§3.1)', async () => {
  P.$('btnClaves').click();
  await new Promise((r) => setTimeout(r, 150));
  const t = P.$('modalBody').textContent + P.$('modalTitulo').textContent;
  assert.match(t, /periodo|histórico/i,
    'la lista debe decir si trae el periodo o el histórico');
  assert.match(t, /KG/, 'cada clave muestra su unidad');
});

await check('la exportación lleva la procedencia dentro del archivo', () => {
  const fn = P.window.__consultaVentasCsv;
  assert.ok(typeof fn === 'function', 'falta la función de exportación expuesta para prueba');
  const csv = fn(CONSULTA);
  assert.match(csv, /falta_fac/, 'el archivo debe declarar el campo de fecha');
  assert.match(csv, /Unilever North America/, 'el archivo debe nombrar las entidades');
  assert.match(csv, /WWP0164\./, 'el archivo debe nombrar las claves');
  assert.match(csv, /2025-10-01/, 'el archivo debe traer el periodo');
  assert.ok(csv.split('\n').length > 5, 'el archivo debe traer los datos además del encabezado');
});

console.log('');
if (verde.length) { console.log(`VERDE (${verde.length}):`); verde.forEach((n) => console.log(`  ✓ ${n}`)); }
if (rojo.length) {
  console.log(`\nROJO (${rojo.length}):`);
  rojo.forEach(([n, m]) => console.log(`  ✗ ${n}\n      ${m}`));
  process.exitCode = 1;
} else {
  console.log('\nTodo en verde.');
}

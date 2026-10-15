// ============================================================
// Prueba de render de consulta-ventas.js (jsdom).
//
// REESCRITA el 15-oct-2026 tras ver la pantalla real. La versión
// anterior tenía once casos en verde sobre un fixture de once
// renglones, y no detectó nada de lo que estaba mal: la pantalla
// consultaba sola al abrir, imprimía los ~400 clientes y ~600 claves
// uno por uno en el encabezado, y disparaba siempre el aviso de unidad.
//
// Lección de método: el fixture reproduce la ESCALA real, no un caso
// cómodo. 400 clientes y 600 claves. Una prueba que solo confirma los
// supuestos de quien la escribió no prueba nada.
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
const MESES = ['2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03',
  '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'];

// ── Escala real: 400 clientes, 600 claves ────────────────────────────
const CLIENTES_MUCHOS = {
  clientes: Array.from({ length: 400 }, (_, i) => ({
    cve_cte: i + 1,
    nombre: i === 0 ? 'UNILEVER MANUFACTURERA'
      : i === 107 ? 'MSI EXPRESS, INC.'
      : i === 307 ? 'Unilever North America'
      : `CLIENTE NUMERO ${i + 1}`,
    agente: i % 3 ? 'ALEJANDRA GONZALEZ' : null,
    falta_en_catalogo: i === 399,
    renglones: 10 + i,
    ultima_venta: '2026-08-20',
  })),
};

const CLAVES_MUCHAS = {
  ventana: 'periodo', desde: '2025-10-01', hasta: '2026-09-30',
  claves: Array.from({ length: 600 }, (_, i) => ({
    cve_prod: `WWP${String(i).padStart(4, '0')}`,
    clave_canonica: `WWP${String(i).padStart(4, '0')}`,
    mercado: i % 2 ? 'EXT' : 'NAL',
    descripcion: `PRODUCTO ${i}`,
    unidad: ['KG', 'PIEZA', 'CAJA', 'KGM', 'SACO'][i % 5],
    renglones: 5 + i,
    ultima_venta: '2026-08-20',
  })),
};

const serie = (v) => MESES.map((_, i) => (i % 3 === 0 ? v : 0));

// Consulta SIN filtro: muchas entidades, muchas unidades.
const CONSULTA_ANCHA = {
  periodo: { desde: '2025-10-01', hasta: '2026-09-30', meses: 12 },
  agrupar: 'clave', meses: MESES,
  filas: [
    { cve_cte: 1, cliente: 'UNILEVER MANUFACTURERA', cve_prod: 'WWP0164',
      clave_canonica: 'WWP0164', mercado: 'NAL', unidad: 'KG',
      cantidad: 258084, mxn: 16000000, usd: 0, renglones: 40,
      serie: serie(86028), serie_mxn: serie(5300000), serie_usd: serie(0), es_kilogramo: true },
    // Fila con TODA la serie en cero: no debe pintarse (defecto visto en pantalla).
    { cve_cte: 1, cliente: 'UNILEVER MANUFACTURERA', cve_prod: 'WWP0776-C',
      clave_canonica: 'WWP0776-C', mercado: 'NAL', unidad: 'KGM',
      cantidad: 0, mxn: 0, usd: 0, renglones: 3,
      serie: MESES.map(() => 0), serie_mxn: MESES.map(() => 0), serie_usd: MESES.map(() => 0),
      es_kilogramo: true },
    { cve_cte: 108, cliente: 'MSI EXPRESS, INC.', cve_prod: 'WWP0164.',
      clave_canonica: 'WWP0164', mercado: 'EXT', unidad: 'KG',
      cantidad: 310000, mxn: 19014105, usd: 1065350, renglones: 47,
      serie: serie(40000), serie_mxn: serie(2467372), serie_usd: serie(134000), es_kilogramo: true },
  ],
  totales: { cantidad: 568084, mxn: 35014105, usd: 1065350 },
  unidades: ['(SIN UNIDAD)', '99', 'ACT', 'BIDON', 'CAJA', 'KG', 'KGM', 'NA', 'PIEZA', 'SACO', 'SERVICIO'],
  es_kilogramo: false,
  devoluciones: { renglones: 35, cantidad: -28126, mxn: -2424487.59, usd: -120000 },
  procedencia: {
    desde: '2025-10-01', hasta: '2026-09-30', fecha_campo: 'falta_fac',
    cantidad_campo: 'cant_surt', importe_campo: 'subt_prod',
    usd_regla: 'subt_prod / tip_cam solo en cve_mon = 2', agrupar: 'clave',
    clientes: CLIENTES_MUCHOS.clientes.map((c) => c.nombre),
    claves: CLAVES_MUCHAS.claves.map((k) => k.cve_prod),
    claves_canonicas: CLAVES_MUCHAS.claves.map((k) => k.clave_canonica),
    unidades: ['(SIN UNIDAD)', '99', 'ACT', 'BIDON', 'CAJA', 'KG', 'KGM', 'NA', 'PIEZA', 'SACO', 'SERVICIO'],
    neto_de_devoluciones: true, generado_en: '2026-10-15T17:09:34.651Z',
  },
};

// Consulta CON filtro: dos clientes, una clave, una unidad.
const CONSULTA_ANGOSTA = {
  periodo: { desde: '2025-10-01', hasta: '2026-09-30', meses: 12 },
  agrupar: 'clave', meses: MESES,
  filas: [
    { cve_cte: 108, cliente: 'MSI EXPRESS, INC.', cve_prod: 'WWP0164.',
      clave_canonica: 'WWP0164', mercado: 'EXT', unidad: 'KG',
      cantidad: 310000, mxn: 19014105, usd: 1065350, renglones: 47,
      serie: serie(40000), serie_mxn: serie(2467372), serie_usd: serie(134000), es_kilogramo: true },
    { cve_cte: 308, cliente: 'Unilever North America', cve_prod: 'WWP0164.',
      clave_canonica: 'WWP0164', mercado: 'EXT', unidad: 'KG',
      cantidad: 176000, mxn: 11072318, usd: 627968, renglones: 7,
      serie: serie(35200), serie_mxn: serie(2300388), serie_usd: serie(124960), es_kilogramo: true },
  ],
  totales: { cantidad: 486000, mxn: 30086423, usd: 1693318 },
  unidades: ['KG'], es_kilogramo: true,
  devoluciones: { renglones: 0, cantidad: 0, mxn: 0, usd: 0 },
  procedencia: {
    desde: '2025-10-01', hasta: '2026-09-30', fecha_campo: 'falta_fac',
    cantidad_campo: 'cant_surt', importe_campo: 'subt_prod',
    usd_regla: 'subt_prod / tip_cam solo en cve_mon = 2', agrupar: 'clave',
    clientes: ['MSI EXPRESS, INC.', 'Unilever North America'],
    claves: ['WWP0164.'], claves_canonicas: ['WWP0164'], unidades: ['KG'],
    neto_de_devoluciones: true, generado_en: '2026-10-15T17:09:34.651Z',
  },
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
  let anchaOangosta = 'ancha';
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
      if (url.includes('/consulta-ventas/clientes')) return { ok: true, data: CLIENTES_MUCHOS };
      if (url.includes('/consulta-ventas/claves')) return CLAVES_MUCHAS;
      if (url.includes('/consulta-ventas')) {
        return { ok: true, data: anchaOangosta === 'ancha' ? CONSULTA_ANCHA : CONSULTA_ANGOSTA };
      }
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
  return {
    window, errores, pedidos,
    $: (id) => window.document.getElementById(id),
    modo: (m) => { anchaOangosta = m; },
  };
}

let P = null;

// ── 1. Abre sin datos ────────────────────────────────────────────────
await check('la pantalla levanta sin errores', async () => {
  P = await montar();
  assert.deepEqual(P.errores, []);
});

await check('al abrir NO ejecuta la consulta', () => {
  const consultas = P.pedidos.filter((u) => /\/consulta-ventas\?/.test(u));
  assert.equal(consultas.length, 0,
    `no debe consultar sin filtros, pidió: ${JSON.stringify(consultas)}`);
});

await check('al abrir SÍ carga los catálogos de los selectores', () => {
  assert.ok(P.pedidos.some((u) => u.includes('/consulta-ventas/clientes')), 'faltan clientes');
  assert.ok(P.pedidos.some((u) => u.includes('/consulta-ventas/claves')), 'faltan claves');
});

await check('muestra el estado vacío diciendo qué hacer', () => {
  const t = P.$('pageContent').textContent.replace(/\s+/g, ' ');
  assert.match(t, /elige|selecciona/i, `falta el mensaje de arranque: "${t.slice(0, 200)}"`);
  assert.match(t, /cliente/i, 'debe decir que elija cliente o clave');
});

await check('el estado vacío no trae avisos ni procedencia', () => {
  const med = P.$('medida');
  const proc = P.$('procedencia');
  assert.ok(!med || !med.textContent.trim(), 'no debe haber aviso de unidad sin consulta');
  assert.ok(!proc || !proc.textContent.trim(), 'no debe haber procedencia sin consulta');
});

// ── 2. Con filtro aplicado, corre el reporte ─────────────────────────
await check('aplicar un filtro de cliente ejecuta el reporte', async () => {
  P.modo('angosta');
  P.$('btnClientes').click();
  await new Promise((r) => setTimeout(r, 150));
  const op = [...P.window.document.querySelectorAll('#modalBody [data-ref]')]
    .find((e) => e.dataset.ref === '308');
  assert.ok(op, 'no está Unilever North en el selector');
  op.querySelector('input[type=checkbox]').checked = true;
  P.$('modalAceptar').click();
  await new Promise((r) => setTimeout(r, 250));
  assert.ok(P.pedidos.some((u) => /\/consulta-ventas\?/.test(u)),
    'tras elegir cliente debe ejecutarse el reporte');
});

await check('con pocos seleccionados la procedencia SÍ los nombra', () => {
  const t = P.$('procedencia').textContent.replace(/\s+/g, ' ');
  assert.match(t, /Unilever North America/, 'debe nombrar las entidades cuando son pocas');
  assert.match(t, /WWP0164\./, 'y las claves');
});

await check('con una sola unidad de peso dice kilogramos, sin advertencia', () => {
  const t = P.$('medida').textContent.replace(/\s+/g, ' ');
  assert.match(t, /kilogramo/i, `debería decir kilogramos: "${t}"`);
  assert.ok(!/⚠/.test(t), 'no debe advertir cuando la medida sí es kilos');
});

await check('sin devoluciones no inventa un renglón de devoluciones', () => {
  const t = (P.$('devoluciones')?.textContent || '').replace(/\s+/g, ' ');
  assert.ok(!/se restaron/i.test(t), `no hubo devoluciones: "${t}"`);
});

// ── 3. Consulta ancha: lo que rompió la pantalla real ────────────────
await check('con cientos de entidades la procedencia NO las lista una por una', async () => {
  P.modo('ancha');
  P.$('btnConsultar').click();
  await new Promise((r) => setTimeout(r, 250));
  const t = P.$('procedencia').textContent;
  assert.ok(t.length < 1200,
    `el encabezado mide ${t.length} caracteres: es un muro de nombres`);
  assert.ok(!/CLIENTE NUMERO 250/.test(t), 'no debe imprimir los 400 nombres');
  assert.match(t.replace(/\s+/g, ' '), /400/,
    'pero sí debe decir cuántos clientes entraron');
});

await check('con cientos de claves tampoco las lista', () => {
  const t = P.$('procedencia').textContent;
  assert.ok(!/WWP0300/.test(t), 'no debe imprimir las 600 claves');
  assert.match(t.replace(/\s+/g, ' '), /600/, 'pero sí debe decir cuántas');
});

await check('no pinta la fila con toda la serie en cero', () => {
  const filas = [...P.window.document.querySelectorAll('#tablaPivote tbody tr')];
  const texto = filas.map((f) => f.textContent).join(' ');
  assert.ok(!/WWP0776-C/.test(texto),
    'una fila sin un solo dato en el periodo no debe aparecer');
  assert.ok(/WWP0164/.test(texto), 'las filas con datos sí');
});

await check('no reporta una cantidad de devoluciones con unidades mezcladas', () => {
  const t = P.$('devoluciones').textContent.replace(/\s+/g, ' ');
  assert.ok(!/28,126|28126/.test(t),
    `con unidades mezcladas esa cantidad no significa nada: "${t}"`);
  assert.match(t, /35/, 'pero sí debe decir cuántos renglones');
  // money() redondea al peso: 2,424,487.59 se muestra como 2,424,488.
  assert.match(t, /\$2,424,4\d\d/, 'y el importe, que sí es comparable');
});

// ── 4. El archivo sí lleva todo ──────────────────────────────────────
await check('el CSV sí trae la lista completa de entidades', () => {
  const csv = P.window.__consultaVentasCsv(CONSULTA_ANCHA);
  assert.match(csv, /CLIENTE NUMERO 250/, 'el archivo es lo que viaja: ahí van todos');
  assert.match(csv, /WWP0300/, 'y todas las claves');
  assert.match(csv, /falta_fac/, 'con la procedencia completa');
});

// ── 5. Quitar los filtros regresa al estado vacío ────────────────────
await check('quitar todos los filtros regresa al estado vacío', async () => {
  P.$('btnClientes').click();
  await new Promise((r) => setTimeout(r, 150));
  P.$('modalLimpiar').click();
  P.$('modalAceptar').click();
  await new Promise((r) => setTimeout(r, 250));
  const t = P.$('pageContent').textContent.replace(/\s+/g, ' ');
  assert.match(t, /elige|selecciona/i, 'sin filtros debe volver al mensaje de arranque');
  const proc = P.$('procedencia');
  assert.ok(!proc || !proc.textContent.trim(), 'y limpiar la procedencia');
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

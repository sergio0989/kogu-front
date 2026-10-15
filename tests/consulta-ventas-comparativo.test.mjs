// ============================================================
// tests/consulta-ventas-comparativo.test.mjs
// Consulta de ventas · pestaña de periodos comparativos (minuta, punto 3).
//
// Regla §16.4: escrita antes de la pestaña y mostrada fallando.
//
// La pestaña mensual NO se modifica: esta prueba tambien la defiende, con
// casos que verifican que sigue siendo la vista por omision y que cambiar
// de pestaña no la reconsulta.
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

const CLIENTES = {
  clientes: [
    { cve_cte: 308, nombre: 'Unilever North America', agente: 'ALEJANDRA GONZALEZ', renglones: 40, ultima_venta: '2026-08-20' },
    { cve_cte: 108, nombre: 'MSI EXPRESS, INC.', agente: 'ALEJANDRA GONZALEZ', renglones: 47, ultima_venta: '2026-09-10' },
  ],
};
const CLAVES = {
  ventana: 'periodo', desde: '2025-10-01', hasta: '2026-09-30',
  claves: [
    { cve_prod: 'WWP0164.', clave_canonica: 'WWP0164', desc_prod: 'CHILE GUAJILLO', unidad: 'KG', renglones: 40 },
  ],
};

const COMPARATIVO = {
  periodos: {
    preset: 'anio_anterior',
    actual: { desde: '2026-08-01', hasta: '2026-09-30', dias: 61 },
    comparacion: { desde: '2025-08-01', hasta: '2025-09-30', dias: 61 },
    longitudes_iguales: true,
  },
  agrupar: 'clave',
  filas: [
    { cve_cte: 308, cliente: 'Unilever North America', cve_prod: 'WWP0164.', clave_canonica: 'WWP0164',
      mercado: 'EXT', unidad: 'KG', es_kilogramo: true,
      actual: { cantidad: 1000, mxn: 70000, usd: 3500, renglones: 10 },
      comparacion: { cantidad: 800, mxn: 56000, usd: 2800, renglones: 8 },
      delta: { cantidad: 200, mxn: 14000, usd: 700 },
      delta_pct: { cantidad: 25, mxn: 25, usd: 25 }, estado: 'comparable' },
    { cve_cte: 308, cliente: 'Unilever North America', cve_prod: 'WWP0167-D.', clave_canonica: 'WWP0167-D',
      mercado: 'EXT', unidad: 'KG', es_kilogramo: true,
      actual: { cantidad: 500, mxn: 35000, usd: 1750, renglones: 5 },
      comparacion: { cantidad: 0, mxn: 0, usd: 0, renglones: 0 },
      delta: { cantidad: 500, mxn: 35000, usd: 1750 },
      delta_pct: { cantidad: null, mxn: null, usd: null }, estado: 'nueva' },
    { cve_cte: 108, cliente: 'MSI EXPRESS, INC.', cve_prod: 'EMP0076', clave_canonica: 'EMP0076',
      mercado: 'EXT', unidad: 'CAJA', es_kilogramo: false,
      actual: { cantidad: 0, mxn: 0, usd: 0, renglones: 0 },
      comparacion: { cantidad: 25, mxn: 5000, usd: 250, renglones: 1 },
      delta: { cantidad: -25, mxn: -5000, usd: -250 },
      delta_pct: { cantidad: -100, mxn: -100, usd: -100 }, estado: 'dejo_de_comprar' },
  ],
  totales_unidad: [
    { unidad: 'CAJA', es_kilogramo: false,
      actual: { cantidad: 0, mxn: 0, usd: 0 }, comparacion: { cantidad: 25, mxn: 5000, usd: 250 },
      delta: { cantidad: -25, mxn: -5000, usd: -250 } },
    { unidad: 'KG', es_kilogramo: true,
      actual: { cantidad: 1500, mxn: 105000, usd: 5250 }, comparacion: { cantidad: 800, mxn: 56000, usd: 2800 },
      delta: { cantidad: 700, mxn: 49000, usd: 2450 } },
  ],
  totales: { actual: { mxn: 105000, usd: 5250 }, comparacion: { mxn: 61000, usd: 3050 },
             delta: { mxn: 44000, usd: 2200 } },
  devoluciones: { actual: { renglones: 2, cantidad: -50, mxn: -3500, usd: -175 },
                  comparacion: { renglones: 1, cantidad: -10, mxn: -700, usd: -35 } },
  procedencia: {
    preset: 'anio_anterior',
    actual_desde: '2026-08-01', actual_hasta: '2026-09-30', actual_dias: 61,
    comparacion_desde: '2025-08-01', comparacion_hasta: '2025-09-30', comparacion_dias: 61,
    longitudes_iguales: true, fecha_campo: 'falta_fac', cantidad_campo: 'cant_surt',
    importe_campo: 'subt_prod', usd_regla: 'subt_prod / tip_cam solo en cve_mon = 2',
    agrupar: 'clave', neto_de_devoluciones: true, generado_en: '2026-10-15T20:00:00.000Z',
  },
};

const DESIGUAL = {
  ...COMPARATIVO,
  periodos: { ...COMPARATIVO.periodos, preset: 'personalizado',
    comparacion: { desde: '2026-01-01', hasta: '2026-03-31', dias: 90 },
    longitudes_iguales: false },
  procedencia: { ...COMPARATIVO.procedencia, preset: 'personalizado',
    comparacion_desde: '2026-01-01', comparacion_hasta: '2026-03-31',
    comparacion_dias: 90, longitudes_iguales: false },
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
  let cuerpoComp = COMPARATIVO;
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
  window.KoguUi = {
    escapeHtml: (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    money: (v) => '$' + Number(v || 0).toLocaleString('es-MX', { maximumFractionDigits: 0 }),
    fmtDateOnly: (v) => String(v),
    withLoading: async (el, fn) => fn(),
  };
  window.eval(js);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  await new Promise((r) => setTimeout(r, 400));
  return {
    window, errores, pedidos,
    $: (id) => window.document.getElementById(id),
    txt: () => window.document.getElementById('app').textContent.replace(/\s+/g, ' '),
    comp: (c) => { cuerpoComp = c; },
  };
}

async function conFiltro(P) {
  P.$('btnClientes').click();
  await new Promise((r) => setTimeout(r, 150));
  const op = [...P.window.document.querySelectorAll('#modalBody [data-ref]')]
    .find((e) => e.dataset.ref === '308');
  op.querySelector('input[type=checkbox]').checked = true;
  P.$('modalAceptar').click();
  await new Promise((r) => setTimeout(r, 250));
}

let P = null;

console.log('\n── La pestana mensual sigue siendo la de siempre ───────────────');

await check('abre en la pestana mensual, con la comparativa oculta', async () => {
  P = await montar();
  assert.deepEqual(P.errores, []);
  const vc = P.$('vistaComparativo');
  assert.ok(vc, 'no existe la vista comparativa');
  assert.ok(vc.hidden, 'la comparativa no deberia abrir visible');
  assert.ok(!P.$('vistaMensual').hidden, 'la mensual debe ser la vista por omision');
});

await check('cambiar de pestana NO dispara una consulta sin filtros', async () => {
  const antes = P.pedidos.length;
  P.$('tabComparativo').click();
  await new Promise((r) => setTimeout(r, 200));
  const nuevos = P.pedidos.slice(antes).filter((u) => u.includes('/comparativo'));
  assert.equal(nuevos.length, 0, 'consulto sin que hubiera filtro');
  assert.ok(P.$('vistaMensual').hidden, 'no oculto la vista mensual');
});

console.log('\n── La comparacion ──────────────────────────────────────────────');

await check('el selector de preset ofrece los tres', async () => {
  const sel = P.$('fPreset');
  assert.ok(sel, 'no hay selector de periodo comparativo');
  const vals = [...sel.options].map((o) => o.value).sort();
  assert.deepEqual(vals, ['anio_anterior', 'periodo_anterior', 'personalizado']);
});

await check('las fechas de comparacion solo salen en personalizado', async () => {
  const caja = P.$('cajaPersonalizado');
  assert.ok(caja, 'no hay caja de fechas personalizadas');
  assert.ok(caja.hidden, 'con ano anterior no deberian verse');
  const sel = P.$('fPreset');
  sel.value = 'personalizado';
  sel.dispatchEvent(new P.window.Event('change'));
  await new Promise((r) => setTimeout(r, 120));
  assert.ok(!caja.hidden, 'con personalizado deben verse');
  sel.value = 'anio_anterior';
  sel.dispatchEvent(new P.window.Event('change'));
  await new Promise((r) => setTimeout(r, 120));
});

await check('con filtro, la pestana comparativa pide el comparativo con su preset', async () => {
  await conFiltro(P);
  await new Promise((r) => setTimeout(r, 250));
  const p = P.pedidos.filter((u) => u.includes('/comparativo')).pop();
  assert.ok(p, 'no pidio el comparativo');
  assert.ok(/preset=anio_anterior/.test(p), 'no mando el preset');
  assert.ok(/clientes=308/.test(p), 'no mando el filtro de cliente');
});

await check('pinta los dos periodos, el delta y el porcentaje', async () => {
  const t = P.txt();
  assert.ok(/1,000/.test(t), 'no pinta la cantidad del periodo actual');
  assert.ok(/800/.test(t), 'no pinta la del periodo de comparacion');
  assert.ok(/25\s*%|\+25/.test(t), 'no pinta el porcentaje de variacion');
});

await check('una clave nueva se etiqueta, no inventa un porcentaje', async () => {
  const t = P.txt();
  assert.ok(/nueva/i.test(t), 'no etiqueta la clave nueva');
  assert.ok(!/Infinity|NaN/.test(t), 'imprimio Infinity o NaN');
});

await check('una clave que dejo de comprarse aparece con su etiqueta', async () => {
  const t = P.txt();
  assert.ok(/EMP0076/.test(t), 'desaparecio la fila que solo existe en el periodo anterior');
  assert.ok(/dej[oó] de comprar/i.test(t), 'no la etiqueta');
});

await check('los totales van por unidad y no hay total de cantidad mezclado', async () => {
  const t = P.txt().replace(/[,\s]/g, '');
  assert.ok(/KG/.test(P.txt()), 'no hay total de KG');
  assert.ok(!t.includes('1500' + '0'), '');
  assert.ok(!/\b1503\b/.test(P.txt().replace(/,/g, '')), 'sumo KG con CAJA');
});

await check('avisa cuando los periodos tienen longitudes distintas', async () => {
  P.comp(DESIGUAL);
  P.$('fPreset').value = 'personalizado';
  P.$('fPreset').dispatchEvent(new P.window.Event('change'));
  P.$('fDesde2').value = '2026-01-01';
  P.$('fHasta2').value = '2026-03-31';
  P.$('btnComparar').click();
  await new Promise((r) => setTimeout(r, 250));
  const t = P.txt();
  assert.ok(/61\s*d[ií]as|90\s*d[ií]as/.test(t), 'no imprime los dias de cada periodo');
  assert.ok(/distinta|desigual|no comparables|cuidado/i.test(t),
    'no advierte que las longitudes difieren');
});

console.log('\n── Saber a quien estoy viendo ──────────────────────────────────');

// Observado el 15-oct: con un cliente elegido el boton decia "Clientes: 1"
// y en ninguna parte de la pantalla aparecia su nombre.
await check('el NOMBRE del cliente elegido queda visible JUNTO AL FILTRO', async () => {
  // Que aparezca en la columna Cliente de la tabla no cuenta: agrupando
  // por clave canonica esa columna no existe, y el nombre se perderia.
  const sel = P.$('seleccion').textContent;
  assert.ok(/Unilever North America/.test(sel),
    `el filtro no dice a quien estoy viendo: "${sel.trim()}"`);
});

await check('tambien se nombra la clave cuando se elige una', async () => {
  P.$('btnClaves').click();
  await new Promise((r) => setTimeout(r, 150));
  const op = [...P.window.document.querySelectorAll('#modalBody [data-ref]')]
    .find((e) => e.dataset.ref === 'WWP0164.');
  assert.ok(op, 'no esta la clave en el selector');
  op.querySelector('input[type=checkbox]').checked = true;
  P.$('modalAceptar').click();
  await new Promise((r) => setTimeout(r, 250));
  assert.ok(/WWP0164\./.test(P.$('seleccion').textContent),
    'la clave elegida no se nombra junto al filtro');
});

await check('el chip permite quitar el cliente y vuelve a consultar', async () => {
  const chip = P.window.document.querySelector('#seleccion [data-quita-cliente="308"]');
  assert.ok(chip, 'el chip del cliente no trae forma de quitarlo');
  const antes = P.pedidos.length;
  chip.click();
  await new Promise((r) => setTimeout(r, 250));
  assert.ok(!/Unilever North America/.test(P.txt()) || P.pedidos.length > antes,
    'quitar el chip no hizo nada');
});

console.log('\n── Alcance ─────────────────────────────────────────────────────');

await check('la exportacion no se ofrece todavia en la comparativa', async () => {
  const btn = P.$('btnExportar');
  assert.ok(btn.hidden || btn.disabled,
    'ofrece exportar en una pestaña cuyo libro aun no existe');
});

await check('volver a la mensual restaura la vista sin reconsultar', async () => {
  const antes = P.pedidos.length;
  P.$('tabMensual').click();
  await new Promise((r) => setTimeout(r, 200));
  assert.ok(!P.$('vistaMensual').hidden, 'no restauro la vista mensual');
  assert.ok(P.$('vistaComparativo').hidden, 'no oculto la comparativa');
  assert.equal(P.pedidos.length, antes, 'reconsulto al volver de pestaña');
});

console.log(`\n${'='.repeat(70)}`);
verde.forEach(n => console.log(`  VERDE  ${n}`));
rojo.forEach(([n, m]) => console.log(`  ROJO   ${n}\n           ${m}`));
console.log(`${'='.repeat(70)}`);
console.log(`  ${verde.length} en verde, ${rojo.length} en rojo\n`);
process.exit(rojo.length ? 1 : 0);

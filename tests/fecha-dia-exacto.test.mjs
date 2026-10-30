// ============================================================
// tests/fecha-dia-exacto.test.mjs
// Las fechas SIN HORA deben mostrar su día exacto, en cualquier zona.
//
// Regla §16.4: escrita antes del código y mostrada fallando.
//
// Regla §16.5 — CASO REAL, del 30-oct-2026: la tarjeta de RUSSALL
// INNOVACION EN ALIMENTOS en Mi panel dice "Sin compra hace 236 días ·
// última 5/2/2026", y el Excel del mismo agente trae el 6 de febrero.
// Dos pantallas del mismo dato con un día de diferencia.
//
// El día correcto es el 6, y lo prueba Postgres: el SQL calcula los días
// como ($2::date - ultima_compra) y dio 236 contra un corte del
// 2026-09-30. 2026-02-06 + 236 = 2026-09-30. Con el 5 darían 237.
//
// Por qué pasa: `ultima_compra` es una columna `date`. node-postgres la
// entrega como Date, se serializa a "2026-02-06T00:00:00.000Z" y
// `fmtDate` hace `new Date(v).toLocaleString('es-MX')`, que en UTC-6
// muestra las 18:00 del día ANTERIOR. `fmtDateOnly` lee la cadena con
// regex y no toca zonas horarias — el propio mi-panel.js ya lo explica en
// el comentario de `ultima_venta`, unas líneas arriba del defecto.
//
// ESTA PRUEBA FIJA LA ZONA. Con TZ=UTC el error no se ve, que es
// justamente por qué sobrevivió: el arnés de pruebas vivía en UTC y
// además sustituía fmtDate por String(v), más amable que el ui.js real.
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

// Tal cual sale del backend: columna `date` serializada a JSON.
const ULTIMA_COMPRA = '2026-02-06T00:00:00.000Z';

const COMPARATIVO = {
  agente: { agente_id: 'ag-1', agente_nombre: 'MARCELA GARZA' },
  criterio: { materialidad_mxn: 75000 },
  periodos: { act_d: '2026-08-01', act_h: '2026-09-30', yoy_d: '2025-08-01', yoy_h: '2025-09-30' },
  clientes: [{
    cliente_ref: '357', nombre: 'RUSSALL INNOVACION EN ALIMENTOS',
    severidad: 'critica', base_comparacion: null,
    riesgo_kg: 275, riesgo_mxn: 119271.91,
    caida: null, deriva: null,
    dormancia: { dias_sin_compra: 236, ultima_compra: ULTIMA_COMPRA,
                 venta_ventana: 119271.91, kg_ventana: 275 },
    // El producto llega como TEXTO desde el json_agg: es la cerca de
    // regresión, porque ese ya se mostraba bien.
    productos: [{ cve_prod: 'WWP0155-F', desc_prod: 'TOMATE EN POLVO',
                  cant_p1: 2000, cant_p2: 0, importe_p1: 349301, importe_p2: 0,
                  ultima_venta: '2026-06-25', estado: 'pausa' }],
  }],
};

const PANEL = {
  agente: { agente_id: 'ag-1', agente_nombre: 'MARCELA GARZA' },
  anio: 2026, meses_transcurridos: 9,
  cartera: [{ cliente_ref: '357', nombre: 'RUSSALL INNOVACION EN ALIMENTOS',
              venta_imp: 119271.91, venta_qty: 275,
              ultima_compra: ULTIMA_COMPRA, dias_sin_compra: 236 }],
};

function cargaUi() {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { runScripts: 'outside-only' });
  dom.window.eval(fs.readFileSync(UI, 'utf8'));
  return dom.window.KoguUi;
}

async function arrancaPanel(vista = 'riesgo') {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div></body></html>',
    { url: 'https://kogu.test/modules/rc/mi-panel.html', runScripts: 'outside-only' });
  const { window } = dom;
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
      if (url.includes('/mi-panel/comparativo')) return { ok: true, data: COMPARATIVO };
      if (url.includes('/mi-panel')) return { ok: true, data: PANEL };
      return { ok: true, data: {} };
    },
    authFetchRaw: async () => ({ ok: true, blob: async () => ({}), headers: { get: () => '' } }),
    unwrapRows: (res) => res?.data?.rows || res?.data || res || [],
    toast: () => {},
    withLoading: async (el, fn) => fn(),
  };
  // El ui.js REAL, no un sustituto amable.
  window.eval(fs.readFileSync(UI, 'utf8'));
  window.eval(fs.readFileSync(MI_PANEL, 'utf8'));
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  await new Promise((r) => setTimeout(r, 600));
  if (vista !== 'riesgo') {
    const sel = window.document.getElementById('vistaFil');
    sel.value = vista;
    await sel.onchange();
    await new Promise((r) => setTimeout(r, 300));
  }
  return window.document.getElementById('app').textContent.replace(/\s+/g, ' ');
}

console.log('\n── El formateador ─────────────────────────────────────────────');

await check('la zona de prueba es UTC-6: si no, el defecto no se ve', async () => {
  assert.equal(new Date(ULTIMA_COMPRA).getTimezoneOffset(), 360,
    'la prueba no esta corriendo en America/Monterrey y no prueba nada');
});

await check('fmtDateOnly conserva el dia exacto de una fecha sin hora', async () => {
  assert.equal(cargaUi().fmtDateOnly(ULTIMA_COMPRA), '06/02/2026');
});

await check('fmtDate la recorre un dia: por eso no va en fechas sin hora', async () => {
  // No es un defecto de fmtDate —para un timestamp real es correcto— sino la
  // razon por la que no debe usarse aqui.
  assert.match(cargaUi().fmtDate(ULTIMA_COMPRA), /^5\/2\/2026/);
});

console.log('\n── Mi panel ───────────────────────────────────────────────────');

await check('la tarjeta de sin compra muestra el 6 de febrero', async () => {
  const t = await arrancaPanel();
  assert.ok(/236 d[ií]as/.test(t), 'no pinto la linea de dormancia');
  assert.ok(/06\/02\/2026|6\/2\/2026/.test(t), 'no muestra el dia real de la ultima compra');
  assert.ok(!/5\/2\/2026/.test(t), 'muestra el 5 de febrero: un dia menos que el dato');
});

await check('la tarjeta de cartera muestra el mismo dia que la de riesgo', async () => {
  const t = await arrancaPanel('cartera');
  assert.ok(!/5\/2\/2026/.test(t), 'la vista de cartera recorre la fecha un dia');
  assert.ok(/06\/02\/2026|6\/2\/2026/.test(t), 'no muestra la ultima compra');
});

await check('la fecha del producto, que ya venia bien, sigue bien', async () => {
  const t = await arrancaPanel();
  assert.ok(/25\/06\/2026/.test(t), 'se rompio la fecha de ultima venta del producto');
});

console.log(`\n${'='.repeat(62)}`);
console.log(`  ${verde.length} en verde, ${rojo.length} en rojo`);
for (const [n, m] of rojo) console.log(`  ROJO   ${n}\n           ${m}`);
console.log('');
process.exit(rojo.length ? 1 : 0);

// ============================================================
// tests/mi-panel-actividad-riesgo.test.mjs
// Mi panel · "+ Actividad" debe congelar EL MISMO riesgo que la tarjeta
// enseñó, y el motivo por el que el cliente salió en riesgo.
//
// Regla §16.4: escrita antes del código y mostrada fallando.
// Regla §16.5: el caso sale de la pantalla real (dev.kogu.ink/modules/rc/
// mi-panel.html, 15-oct-2026): CHILES Y CONDIMENTOS INDUSTRIALES aparece
// marcado SOLO por deriva — "Encogiendo: -10.9% en 12 meses · 2,471 kg
// menos que los 12 previos · compró 12 de 12 meses" — y la tarjeta
// muestra EN RIESGO 2,471 kg.
//
// La afirmación bajo prueba NO es "tal fórmula es la correcta", sino que
// la actividad registre lo que el vendedor vio. Si la pantalla dice 2,471
// y el CRM guarda otra cosa, los KPI de seguimiento (SUM(kg_riesgo)) no
// podrán reconciliarse contra el radar.
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

const ARCHIVO = new URL('../modules/rc/mi-panel.js', import.meta.url).pathname;

// Productos con p1 === p2: el cliente compró los 12 meses, así que en la
// ventana bimestral NO hay caída. Es lo que hace visible el defecto.
const PROD_SIN_CAIDA = [
  { cve_prod: 'WWP0164', desc_prod: 'CHILE GUAJILLO', cant_p1: 1000, cant_p2: 1000, importe_p1: 70000, importe_p2: 70000 },
];

const CLIENTES = [
  // 1. Solo deriva — el de la captura.
  {
    cliente_ref: '5001', nombre: 'CHILES Y CONDIMENTOS INDUSTRIALES',
    severidad: 'critica', base_comparacion: 'rolling12',
    riesgo_kg: 2471, riesgo_mxn: 185325,
    caida: null, dormancia: null,
    deriva: { caida_kg: 2471, caida_mxn: 185325, delta_pct: -10.9, meses_comprados: 12, meses: 12 },
    productos: PROD_SIN_CAIDA,
  },
  // 2. Caída clásica — la cerca de regresión: NO debe cambiar.
  {
    cliente_ref: '5002', nombre: 'CLIENTE EN CAIDA',
    severidad: 'alerta', base_comparacion: 'yoy',
    riesgo_kg: 800, riesgo_mxn: 60000,
    caida: { cant_p1: 2000, cant_p2: 1200, venta_p1: 150000, venta_p2: 90000, delta_cantidad: -40, delta_importe: -40 },
    dormancia: null, deriva: null,
    productos: [{ cve_prod: 'WWP0167-D', desc_prod: 'CHILE ANCHO', cant_p1: 2000, cant_p2: 1200, importe_p1: 150000, importe_p2: 90000 }],
  },
  // 3. Solo dormancia — misma familia de defecto.
  {
    cliente_ref: '5003', nombre: 'CLIENTE DORMIDO',
    severidad: 'alerta', base_comparacion: 'yoy',
    riesgo_kg: 0, riesgo_mxn: 240000,
    caida: null, deriva: null,
    dormancia: { dias_sin_compra: 190, ultima_compra: '2026-04-08', venta_ventana: 240000 },
    productos: PROD_SIN_CAIDA,
  },
];

const COMPARATIVO = {
  agente: { agente_id: 'ag-1', agente_nombre: 'ALEJANDRA GONZALEZ' },
  criterio: { materialidad_mxn: 75000 },
  periodos: {
    act_d: '2026-08-01', act_h: '2026-09-30',
    yoy_d: '2025-08-01', yoy_h: '2025-09-30',
    mes_en_curso_excluido: true,
  },
  clientes: CLIENTES,
};

const PANEL = {
  agente: { agente_id: 'ag-1', agente_nombre: 'ALEJANDRA GONZALEZ' },
  anio: 2026, meta_mxn: 14000000, vendido_mxn: 5052413.77,
  esperado_mxn: 10500000, avance_pct: 36, faltante_mxn: 5447586.23,
};

async function arranca() {
  const js = fs.readFileSync(ARCHIVO, 'utf8');
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div></body></html>',
    { url: 'https://kogu.test/modules/rc/mi-panel.html', runScripts: 'outside-only' });
  const { window } = dom;
  await new Promise((r) => {
    if (window.document.readyState === 'complete') return r();
    window.addEventListener('load', r);
    setTimeout(r, 500);
  });

  const posts = [];
  const avisos = [];
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
    apiFetch: async (url, opts) => {
      if (opts && opts.method === 'POST' && url.includes('/crm/actividades')) {
        posts.push(JSON.parse(opts.body));
        return { ok: true, data: { actividad_id: 'nueva' } };
      }
      if (url.includes('/mi-panel/comparativo')) return { ok: true, data: COMPARATIVO };
      if (url.includes('/mi-panel')) return { ok: true, data: PANEL };
      if (url.includes('/agentes')) return { ok: true, data: { rows: [] } };
      if (url.includes('/ventas-mensuales')) return { ok: true, data: { rows: [] } };
      return { ok: true, data: {} };
    },
    authFetchRaw: async () => ({ ok: true, blob: async () => ({}), headers: { get: () => '' } }),
    unwrapRows: (res) => res?.data?.rows || res?.data || res || [],
    toast: (m, t) => avisos.push(`${t}: ${m}`),
    withLoading: async (el, fn) => fn(),
  };
  window.KoguUi = {
    escapeHtml: (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    money: (v) => '$' + Number(v || 0).toLocaleString('es-MX', { maximumFractionDigits: 2 }),
    fmtDate: (v) => String(v),
    fmtDateOnly: (v) => String(v),
    cardStat: (l, v, h) => `<div class="stat"><span>${l}</span><b>${v}</b><i>${h || ''}</i></div>`,
    withLoading: async (el, fn) => fn(),
  };
  window.eval(js);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  await new Promise((r) => setTimeout(r, 600));
  return { window, posts, avisos };
}

// Dispara "+ Actividad" del cliente y confirma el guardado; devuelve el body.
async function creaActividad(window, posts, clienteRef) {
  const antes = posts.length;
  const btn = window.document.querySelector(`#alertas .btn[data-act-ref="${clienteRef}"]`);
  assert.ok(btn, `no se pintó la tarjeta de ${clienteRef}`);
  btn.onclick();
  await new Promise((r) => setTimeout(r, 60));
  const guardar = window.document.getElementById('rcActGuardar');
  assert.ok(guardar, 'no abrió el modal de nueva actividad');
  await guardar.onclick({ target: guardar });
  await new Promise((r) => setTimeout(r, 60));
  assert.ok(posts.length > antes, 'no se envió la actividad');
  return posts[posts.length - 1];
}

// Lee el "EN RIESGO" que la tarjeta imprimió, como número.
function riesgoDeLaTarjeta(window, clienteRef) {
  const btn = window.document.querySelector(`#alertas .btn[data-act-ref="${clienteRef}"]`);
  const caja = btn.closest('div[style*="text-align:right"]');
  const txt = caja.querySelector('div[style*="font-weight:800"]').textContent;
  return Number(String(txt).replace(/[^0-9.-]/g, ''));
}

const { window, posts } = await arranca();

console.log('\n── El defecto observado en la captura del 15-oct ────────────────');

await check('la tarjeta de solo-deriva muestra 2,471 kg (el fixture reproduce la pantalla)', async () => {
  assert.equal(riesgoDeLaTarjeta(window, '5001'), 2471);
});

await check('la actividad guarda el MISMO kg que la tarjeta enseñó (solo deriva)', async () => {
  const body = await creaActividad(window, posts, '5001');
  assert.equal(body.kg_riesgo, riesgoDeLaTarjeta(window, '5001'),
    `la tarjeta dice ${riesgoDeLaTarjeta(window, '5001')} y la actividad guardó ${body.kg_riesgo}`);
});

await check('la actividad guarda el MISMO importe que la tarjeta (solo deriva)', async () => {
  const body = await creaActividad(window, posts, '5001');
  assert.equal(body.monto_riesgo, 185325,
    `la actividad guardó ${body.monto_riesgo} en vez del riesgo resuelto`);
});

await check('el snapshot congela la deriva: sin ella la actividad pierde su motivo', async () => {
  const body = await creaActividad(window, posts, '5001');
  assert.ok(body.snapshot.deriva, 'snapshot.deriva viene vacío');
  assert.equal(body.snapshot.deriva.caida_kg, 2471);
});

await check('el snapshot congela base_comparacion (rolling12 vs yoy no se leen igual)', async () => {
  const body = await creaActividad(window, posts, '5001');
  assert.equal(body.snapshot.base_comparacion, 'rolling12');
});

await check('la actividad guarda el mismo importe que la tarjeta (solo dormancia)', async () => {
  const body = await creaActividad(window, posts, '5003');
  assert.equal(body.monto_riesgo, 240000,
    `la actividad guardó ${body.monto_riesgo} y la tarjeta mide 240000 de venta en la ventana`);
});

console.log('\n── La cerca de regresion: lo que NO debe cambiar ────────────────');

await check('el cliente en caída clásica sigue guardando lo mismo que hoy', async () => {
  const body = await creaActividad(window, posts, '5002');
  assert.equal(body.kg_riesgo, 800);
  assert.equal(body.monto_riesgo, 60000);
});

await check('el snapshot sigue congelando caida, productos y periodos', async () => {
  const body = await creaActividad(window, posts, '5002');
  assert.ok(body.snapshot.caida, 'se perdió snapshot.caida');
  assert.ok(Array.isArray(body.snapshot.productos) && body.snapshot.productos.length, 'se perdieron los productos');
  assert.ok(body.snapshot.periodos, 'se perdieron los periodos');
  assert.ok(body.snapshot.capturado_at, 'se perdió capturado_at');
});

await check('sigue mandando origen, cliente y severidad', async () => {
  const body = await creaActividad(window, posts, '5002');
  assert.equal(body.origen, 'mi-panel');
  assert.equal(body.cliente_ref, '5002');
  assert.equal(body.severidad, 'alerta');
});

console.log(`\n${'='.repeat(70)}`);
verde.forEach(n => console.log(`  VERDE  ${n}`));
rojo.forEach(([n, m]) => console.log(`  ROJO   ${n}\n           ${m}`));
console.log(`${'='.repeat(70)}`);
console.log(`  ${verde.length} en verde, ${rojo.length} en rojo\n`);
process.exit(rojo.length ? 1 : 0);

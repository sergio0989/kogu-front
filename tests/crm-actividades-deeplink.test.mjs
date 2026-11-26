// ============================================================
// tests/crm-actividades-deeplink.test.mjs
// CRM · abrir una actividad concreta por liga: actividades.html?act=<id>
//
// Regla §16.4: escrita antes del código y mostrada FALLANDO.
//
// §16.5 — PETICIÓN REAL del 24-nov-2026: desde los KPIs de seguimiento se
// quiere llegar al detalle de la actividad para leer la retroalimentación
// de todos —la bitácora, los comentarios con @menciones, los seguidores—.
// Ese detalle YA existe completo en esta pantalla; lo único que le falta
// es poder abrirse en una actividad concreta desde fuera. `openDetalle(id)`
// hoy solo se dispara al hacer clic en una tarjeta de su propia lista.
//
// Decisión tomada el mismo día: la liga abre en la MISMA ventana, para no
// dejar pestañas sueltas al usuario.
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

const ARCHIVO = new URL('../modules/crm/actividades.js', import.meta.url).pathname;

// Caso real: la actividad de ABASTECEDORA DE PRODUCTOS NATURALES, abierta,
// con un comentario y una seguidora mencionada (captura del 24-nov).
const DETALLE = {
  actividad_id: 'act-124',
  cliente_ref: '124',
  cliente_nombre: 'ABASTECEDORA DE PRODUCTOS NATURALES',
  titulo: 'Recuperar ABASTECEDORA DE PRODUCTOS NATURALES',
  descripcion: 'No se esperan compras para este anio, compro mas del anio pasado',
  estado: 'abierta', severidad: 'alerta', origen: 'mi-panel',
  agente_id: 'ag-9', agente_nombre: 'Isela Rodriguez Perez',
  creada_por_nombre: 'Laura Cruz', created_by: 'u-laura',
  kg_riesgo: 200, monto_riesgo: 128602.96,
  periodo_analizado: '2026-10-01',
  created_at: '2026-11-12T16:00:00Z', fecha_limite: '2026-11-27',
  fecha_cierre: null, resultado: null, snapshot: {},
  comentarios: [{ comentario_id: 'c1', autor_nombre: 'Laura Cruz',
                  comentario: '@Mariana Hernandez', created_at: '2026-11-12T16:05:00Z' }],
  recordatorios: [], etiquetas: [],
  seguidores: [{ user_id: 'u-mariana', nombre: 'Mariana Hernández' }],
};

const LISTA = { rows: [] };

async function arranca(busqueda = '') {
  const js = fs.readFileSync(ARCHIVO, 'utf8');
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div></body></html>', {
    url: `https://kogu.test/modules/crm/actividades.html${busqueda}`,
    runScripts: 'outside-only',
  });
  const { window } = dom;
  const pedidos = [];
  const avisos = [];
  window.KoguShell = {
    initShell: async () => {
      const d = window.document.createElement('div');
      d.id = 'pageContent';
      window.document.getElementById('app').appendChild(d);
      return { permisos: ['crm.actividades.read'] };
    },
    hasPerm: () => false,
    subscribeEmpresaActivaChange: () => {},
  };
  window.KoguApi = {
    apiFetch: async (url) => {
      pedidos.push(url);
      if (/\/actividades\/resumen/.test(url)) return { ok: true, data: {} };
      if (/\/etiquetas$/.test(url)) return { ok: true, data: [] };
      const m = url.match(/\/actividades\/([^/?]+)$/);
      if (m && m[1] !== 'resumen') {
        if (m[1] !== DETALLE.actividad_id) {
          const e = new Error('La actividad no existe.'); e.status = 404; throw e;
        }
        return { ok: true, data: DETALLE };
      }
      return { ok: true, data: LISTA };
    },
    authFetchRaw: async () => ({ ok: true, blob: async () => ({}), headers: { get: () => '' } }),
    toast: (m, t) => avisos.push(`${t}: ${m}`),
  };
  window.KoguUi = {
    escapeHtml: (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    money: (v) => '$' + Number(v || 0).toLocaleString('es-MX', { maximumFractionDigits: 2 }),
    fmtDate: (v) => String(v),
    fmtDateOnly: (v) => String(v),
    withLoading: async (el, fn) => fn(),
  };
  window.eval(js);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  await new Promise((r) => setTimeout(r, 500));
  return { window, pedidos, avisos };
}

console.log('\n── La liga abre la actividad ──────────────────────────────────');

await check('con ?act=<id> pide ESE detalle al arrancar', async () => {
  const { pedidos } = await arranca('?act=act-124');
  assert.ok(pedidos.some((u) => u.endsWith('/actividades/act-124')),
    `nunca pidio el detalle. Pedidos: ${pedidos.join(' , ')}`);
});

await check('y lo pinta: el modal del detalle queda abierto', async () => {
  const { window } = await arranca('?act=act-124');
  const modal = window.document.getElementById('crmActModal');
  assert.ok(modal, 'no abrio el detalle');
  assert.match(modal.textContent, /ABASTECEDORA DE PRODUCTOS NATURALES/);
});

await check('la retroalimentacion viaja: bitacora y seguidores', async () => {
  const { window } = await arranca('?act=act-124');
  const t = window.document.getElementById('crmActModal').textContent;
  assert.match(t, /Laura Cruz/, 'falta quien comento');
  assert.match(t, /Mariana/, 'falta la seguidora mencionada');
});

console.log('\n── Lo que NO debe pasar ───────────────────────────────────────');

await check('sin ?act no abre nada ni pide detalles', async () => {
  const { window, pedidos } = await arranca();
  assert.ok(!window.document.getElementById('crmActModal'), 'abrio un detalle que nadie pidio');
  const detalles = pedidos.filter((u) => /\/actividades\/[^/?]+$/.test(u) && !/resumen/.test(u));
  assert.equal(detalles.length, 0, `pidio ${detalles.length} detalle(s) sin que se los pidieran`);
});

await check('un id que no existe avisa y deja la pantalla usable', async () => {
  const { window, avisos } = await arranca('?act=no-existe');
  assert.ok(avisos.length, 'no avisa que la actividad no existe');
  assert.ok(!window.document.getElementById('crmActModal'), 'abrio un modal vacio');
  assert.ok(window.document.getElementById('estFil'), 'se rompio la pantalla de lista');
});

console.log('\n── Al cerrar, la liga ya no manda ─────────────────────────────');

// Pendiente #8 del informe del 25-nov: `closeDetalle` quita el modal pero
// deja `?act=` en la URL, y un refresh vuelve a abrir la actividad que el
// usuario acaba de cerrar. Lo mismo con un id que no existe: el aviso
// reaparece en cada recarga. Se reproduce con el actividades.js real.
const sinAct = (w) => !new w.URLSearchParams(w.location.search).has('act');

await check('cerrar con la X quita ?act= de la URL', async () => {
  const { window } = await arranca('?act=act-124');
  assert.ok(window.document.getElementById('crmActModal'), 'no abrio el detalle: el caso no prueba nada');
  window.document.getElementById('crmActClose').click();
  assert.ok(!window.document.getElementById('crmActModal'), 'no cerro el modal');
  assert.ok(sinAct(window), `la URL sigue mandando: ${window.location.href}`);
  assert.match(window.location.pathname, /\/modules\/crm\/actividades\.html$/, 'cambio de pagina');
});

await check('cerrar con clic fuera del modal tambien la quita', async () => {
  const { window } = await arranca('?act=act-124');
  const modal = window.document.getElementById('crmActModal');
  assert.ok(modal, 'no abrio el detalle: el caso no prueba nada');
  modal.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  assert.ok(!window.document.getElementById('crmActModal'), 'no cerro el modal');
  assert.ok(sinAct(window), `la URL sigue mandando: ${window.location.href}`);
});

await check('un id que no existe no se queda en la URL para avisar otra vez', async () => {
  const { window, avisos } = await arranca('?act=no-existe');
  assert.ok(avisos.length, 'no aviso: el caso no prueba nada');
  assert.ok(sinAct(window), `la URL sigue mandando: ${window.location.href}`);
});

await check('cerrar no agrega una entrada al historial (Atras no reabre)', async () => {
  // Se mide con Atras de verdad: en jsdom history.length no crece con
  // pushState, asi que contarlo no probaba nada (lo delato una mutacion).
  const { window } = await arranca('?act=act-124');
  window.document.getElementById('crmActClose').click();
  assert.ok(sinAct(window), 'no limpio la URL: el caso no prueba nada');
  window.history.back();
  await new Promise((r) => setTimeout(r, 100));
  assert.ok(sinAct(window), `Atras regreso a la actividad cerrada: ${window.location.href}`);
});

console.log(`\n${'='.repeat(62)}`);
console.log(`  ${verde.length} en verde, ${rojo.length} en rojo`);
for (const [n, m] of rojo) console.log(`  ROJO   ${n}\n           ${m}`);
console.log('');
process.exit(rojo.length ? 1 : 0);

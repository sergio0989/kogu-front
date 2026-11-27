// ============================================================
// tests/crm-actividades-reabrir.test.mjs
// CRM · botón "Re abrir" en el detalle de una actividad cerrada o cancelada.
//
// Regla §16.4: escrita antes del código y mostrada FALLANDO.
//
// §16.5 — CASO REAL: Sergio, 27-nov-2026: "hoy una vez que cierro, una
// actividad no se puede re abrir". El bloque de Acciones sólo se pinta
// para abierta/en proceso: una cerrada se queda sin ningún botón.
//
// La actividad es la de la captura del 24-nov (ABASTECEDORA DE PRODUCTOS
// NATURALES, la misma de crm-actividades-deeplink), ahora cerrada con
// resultado "Estable". La vigencia por omisión se lee igual que la
// calcula la pantalla —hoy + 15, por componentes locales— con la zona
// fijada en America/Monterrey: no hay fechas escritas a mano.
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

const BASE = {
  actividad_id: 'act-124', cliente_ref: '124',
  cliente_nombre: 'ABASTECEDORA DE PRODUCTOS NATURALES',
  titulo: 'Recuperar ABASTECEDORA DE PRODUCTOS NATURALES',
  descripcion: 'No se esperan compras para este anio, compro mas del anio pasado',
  severidad: 'alerta', origen: 'mi-panel',
  agente_id: 'ag-9', agente_nombre: 'Isela Rodriguez Perez',
  created_by: 'u-laura', kg_riesgo: 200, monto_riesgo: 128602.96,
  periodo_analizado: '2026-10-01', created_at: '2026-11-12T16:00:00Z', fecha_limite: '2026-11-27',
  snapshot: {}, comentarios: [], recordatorios: [], etiquetas: [], seguidores: [],
};
const CERRADA = { ...BASE, estado: 'cerrada', resultado: 'estable', fecha_cierre: '2026-11-20T17:30:00Z' };

const hoyMas15 = () => {
  const d = new Date(); d.setDate(d.getDate() + 15);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

async function arranca({ detalle = CERRADA, permisos = ['crm.actividades.read', 'crm.actividades.close'] } = {}) {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div></body></html>', {
    url: `https://kogu.test/modules/crm/actividades.html?act=${detalle.actividad_id}`,
    runScripts: 'outside-only',
  });
  const { window } = dom;
  const posts = [];
  const avisos = [];
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
    apiFetch: async (url, opts) => {
      if (opts && opts.method === 'POST') { posts.push({ url, body: JSON.parse(opts.body || '{}') }); return { ok: true, data: {} }; }
      if (/\/actividades\/resumen/.test(url)) return { ok: true, data: {} };
      if (/\/etiquetas$/.test(url)) return { ok: true, data: [] };
      if (/\/actividades\/act-124$/.test(url)) return { ok: true, data: detalle };
      return { ok: true, data: { rows: [] } };
    },
    authFetchRaw: async () => ({ ok: true, blob: async () => ({}), headers: { get: () => '' } }),
    toast: (m, t) => avisos.push(`${t}: ${m}`),
  };
  window.KoguUi = {
    escapeHtml: (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    money: (v) => '$' + Number(v || 0).toLocaleString('es-MX', { maximumFractionDigits: 2 }),
    fmtDate: (v) => (v ? new Date(v).toLocaleString('es-MX') : '-'),
    fmtDateOnly: (v) => {
      const m = String(v ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
      return m ? `${m[3]}/${m[2]}/${m[1]}` : '-';
    },
    withLoading: async (el, fn) => fn(),
  };
  window.eval(fs.readFileSync(ARCHIVO, 'utf8'));
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  await new Promise((r) => setTimeout(r, 500));
  const $ = (id) => window.document.getElementById(id);
  return { window, $, posts, avisos };
}

console.log('\n── El botón aparece donde debe ────────────────────────────────');

await check('control: abre el detalle de la cerrada', async () => {
  const { $ } = await arranca();
  assert.ok($('crmActModal'), 'no abrió el detalle');
  assert.match($('crmActModal').textContent, /ABASTECEDORA/);
});

await check('cerrada + permiso de cierre: hay botón "Re abrir"', async () => {
  const { $ } = await arranca();
  const b = $('crmReabrir');
  assert.ok(b, 'no hay botón Re abrir');
  assert.match(b.textContent, /Re abrir/i);
});

await check('cancelada + permiso de cierre: también hay "Re abrir"', async () => {
  const { $ } = await arranca({ detalle: { ...CERRADA, estado: 'cancelada', resultado: null, fecha_cierre: null } });
  assert.ok($('crmReabrir'), 'no hay botón Re abrir en una cancelada');
});

await check('sin permiso de cierre: no hay "Re abrir"', async () => {
  const { $ } = await arranca({ permisos: ['crm.actividades.read'] });
  assert.ok(!$('crmReabrir'), 'se ofrece Re abrir a quien no puede cerrar');
});

await check('una abierta no ofrece "Re abrir" (sigue con sus acciones)', async () => {
  const { $ } = await arranca({ detalle: { ...BASE, estado: 'abierta', resultado: null, fecha_cierre: null } });
  assert.ok(!$('crmReabrir'), 'ofrece Re abrir en una abierta');
  assert.ok($('crmCerrar'), 'se perdió el botón Cerrar actividad');
});

console.log('\n── Motivo y vigencia ──────────────────────────────────────────');

await check('al dar clic pide motivo y vigencia, prellenada con hoy + 15', async () => {
  const { $ } = await arranca();
  $('crmReabrir').onclick();
  await new Promise((r) => setTimeout(r, 50));
  assert.ok($('crmReabrirMotivo'), 'no pide el motivo');
  assert.equal($('crmReabrirFecha')?.value, hoyMas15());
});

await check('sin motivo no se manda nada y avisa', async () => {
  const { $, posts, avisos } = await arranca();
  $('crmReabrir').onclick();
  await new Promise((r) => setTimeout(r, 50));
  $('crmReabrirMotivo').value = '   ';
  await $('crmReabrirOk').onclick({ target: $('crmReabrirOk') });
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(posts.length, 0, 'se mandó sin motivo');
  assert.ok(avisos.some((a) => /motivo/i.test(a)), `no avisó: ${avisos.join(' | ')}`);
});

await check('con motivo manda POST /actividades/act-124/reabrir con motivo y vigencia', async () => {
  const { $, posts } = await arranca();
  $('crmReabrir').onclick();
  await new Promise((r) => setTimeout(r, 50));
  $('crmReabrirMotivo').value = 'El cliente volvió a bajar en diciembre';
  $('crmReabrirFecha').value = '2026-12-15';
  await $('crmReabrirOk').onclick({ target: $('crmReabrirOk') });
  await new Promise((r) => setTimeout(r, 50));
  const p = posts.find((x) => /\/actividades\/act-124\/reabrir$/.test(x.url));
  assert.ok(p, `no llamó a reabrir: ${posts.map((x) => x.url).join(' , ')}`);
  assert.deepEqual(p.body, { motivo: 'El cliente volvió a bajar en diciembre', fecha_limite: '2026-12-15' });
});

console.log('\n── Nueva vigencia de una actividad abierta ────────────────────');

// §16.5 — CASO REAL: captura de Sergio, 27-nov, CHILES Y CONDIMENTOS recién
// reabierta: arriba "Vence 12/12/2026" y el campo "Nueva vigencia" vacío
// (dd/mm/aaaa). La columna date viaja en JSON como "2026-12-12T00:00:00.000Z"
// y un <input type="date"> sólo acepta AAAA-MM-DD: lo deja en blanco, y
// "Actualizar" mandaba null —borraba la vigencia—.
const ABIERTA_ISO = { ...BASE, estado: 'en_proceso', resultado: null, fecha_cierre: null,
  fecha_limite: '2026-12-12T00:00:00.000Z' };

await check('el campo "Nueva vigencia" muestra 2026-12-12 cuando llega como fecha con hora', async () => {
  const { $ } = await arranca({ detalle: ABIERTA_ISO });
  assert.equal($('crmFechaLim')?.value, '2026-12-12');
});

await check('si ya llega como AAAA-MM-DD, se queda igual', async () => {
  const { $ } = await arranca({ detalle: { ...ABIERTA_ISO, fecha_limite: '2026-12-12' } });
  assert.equal($('crmFechaLim')?.value, '2026-12-12');
});

await check('"Actualizar" con el campo vacío no borra la vigencia', async () => {
  const pats = [];
  const { window, $, avisos } = await arranca({ detalle: ABIERTA_ISO });
  const orig = window.KoguApi.apiFetch;
  window.KoguApi.apiFetch = async (url, opts) => {
    if (opts && opts.method === 'PATCH') pats.push(JSON.parse(opts.body || '{}'));
    return orig(url, opts);
  };
  $('crmFechaLim').value = '';
  await $('crmGuardarVig').onclick({ target: $('crmGuardarVig') });
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(pats.length, 0, `mandó ${JSON.stringify(pats)}`);
  assert.ok(avisos.some((a) => /fecha/i.test(a)), `no avisó: ${avisos.join(' | ')}`);
});

console.log(`\nverde ${verde.length} · rojo ${rojo.length}`);
for (const n of verde) console.log(`  ✔ ${n}`);
for (const [n, m] of rojo) console.log(`  ✘ ${n}\n      ${m}`);
process.exit(rojo.length ? 1 : 0);

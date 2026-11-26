// ============================================================
// tests/crm-actividades-vence-dia.test.mjs
// CRM · Actividades: la tarjeta de la lista debe decir el MISMO dia de
// vencimiento que el detalle.
//
// Regla §16.4: escrita antes del codigo y mostrada fallando.
//
// §16.5 — CASO REAL, prod, 26-nov-2026 10:29 (captura de Sergio): la
// actividad de prueba "Recuperar UNILEVER MANUFACTURERA Prueba", agente
// CUENTAS ESPECIALES, creada ese dia con vigencia 26-nov.
//   · La tarjeta de la lista dice  "vence 25/11/2026".
//   · El detalle de la misma dice  "Vence 26/11/2026".
// El correcto es el 26: es lo que se capturo.
//
// Por que: `fecha_limite` es columna `date`; llega serializada como
// "2026-11-26T00:00:00.000Z". La tarjeta la pinta con fechaCorta(), que
// pasa por KoguUi.fmtDate -> toLocaleString, y en UTC-6 esa medianoche
// UTC son las 18:00 del 25. El detalle usa fmtDateOnly y sale bien. Es el
// defecto 2.2 del informe del 25-nov, en otra pantalla.
//
// El arnes carga el ui.js REAL y fija America/Monterrey: con TZ=UTC o con
// un fmtDate sustituto el error no se ve, que es como sobrevivio.
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

const UI      = new URL('../assets/ui.js', import.meta.url).pathname;
const ARCHIVO = new URL('../modules/crm/actividades.js', import.meta.url).pathname;

// La actividad de la captura, tal como la manda el backend.
const PRUEBA = {
  actividad_id: 'act-prueba-unilever', cliente_ref: '1',
  cliente_nombre: 'UNILEVER MANUFACTURERA', titulo: 'Recuperar UNILEVER MANUFACTURERA Prueba',
  estado: 'abierta', severidad: 'critica', origen: 'mi-panel', vencida: false,
  agente_nombre: 'CUENTAS ESPECIALES', created_by_nombre: 'Sergio Abraham Juárez Nolasco',
  kg_riesgo: 1016937, monto_riesgo: 26638119.59,
  created_at: '2026-11-26T16:20:00.000Z',
  fecha_limite: '2026-11-26T00:00:00.000Z',
  etiquetas: [], seguidores: [],
};

async function arranca(items) {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div></body></html>', {
    url: 'https://kogu.test/modules/crm/actividades.html', runScripts: 'outside-only',
  });
  const { window } = dom;
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
      if (/\/actividades\/resumen/.test(url)) return { ok: true, data: {} };
      if (/\/etiquetas$/.test(url)) return { ok: true, data: [] };
      return { ok: true, data: { items } };
    },
    authFetchRaw: async () => ({ ok: true, blob: async () => ({}), headers: { get: () => '' } }),
    toast: () => {},
  };
  // El ui.js REAL, no un sustituto amable.
  window.eval(fs.readFileSync(UI, 'utf8'));
  window.eval(fs.readFileSync(ARCHIVO, 'utf8'));
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  await new Promise((r) => setTimeout(r, 500));
  return window;
}

const tarjeta = (w) => w.document.getElementById('lista').textContent.replace(/\s+/g, ' ');

console.log('\n── El dia de vencimiento en la tarjeta ────────────────────────');

await check('control: la tarjeta de la captura se pinta', async () => {
  const w = await arranca([PRUEBA]);
  assert.match(tarjeta(w), /UNILEVER MANUFACTURERA/, 'no pinto la lista: el caso no prueba nada');
  assert.match(tarjeta(w), /vence/i, 'la tarjeta no trae vencimiento');
});

await check('la tarjeta dice "vence 26/11/2026", como el detalle (caso de la captura)', async () => {
  const w = await arranca([PRUEBA]);
  const t = tarjeta(w);
  assert.ok(!/25\/11\/2026/.test(t), `la tarjeta corrio un dia: "${t.match(/vence[^·]*/i)?.[0]}"`);
  assert.match(t, /vence 26\/11\/2026/i);
});

await check('tambien si la fecha llega como texto AAAA-MM-DD', async () => {
  const w = await arranca([{ ...PRUEBA, fecha_limite: '2026-11-26' }]);
  assert.match(tarjeta(w), /vence 26\/11\/2026/i, `"${tarjeta(w).match(/vence[^·]*/i)?.[0]}"`);
});

console.log(`\n${'='.repeat(62)}`);
console.log(`  ${verde.length} en verde, ${rojo.length} en rojo`);
for (const [n, m] of rojo) console.log(`  ROJO   ${n}\n           ${m}`);
console.log('');
process.exit(rojo.length ? 1 : 0);

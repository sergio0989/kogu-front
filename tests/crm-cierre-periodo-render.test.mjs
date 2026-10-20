// ============================================================
// tests/crm-cierre-periodo-render.test.mjs
// CRM · pantalla de actividades: vocabulario de cierre consolidado
// y el mes analizado a la vista. Ajustes del 20-oct.
//
// Regla §16.4: escrita antes del codigo y mostrada fallando.
//
// Lo que defiende: que el selector de cierre deje de ofrecer el
// vocabulario retirado —si conviven, el indicador parte la misma
// realidad en dos etiquetas— y que el mes analizado se vea, porque no
// es la fecha de creacion y nadie lo adivina.
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

const COMPORTAMIENTO = ['aumento', 'estable', 'disminucion', 'baja_temporal',
  'baja_total', 'nuevo_cliente', 'spot', 'seguimiento'];
const ADMIN = ['no_aplica', 'completada'];
const RETIRADOS = ['recuperado', 'parcial', 'perdido'];

const RESUMEN = {
  abiertas: 1, vencidas: 0, por_vencer: 0, cerradas: 0, recuperadas: 0,
  monto_en_seguimiento: 0, kg_en_seguimiento: 0,
};

const ACTIVIDAD = {
  actividad_id: 'a1', id_mov: 357, empresa_id: 'e1', agente_id: 'ag1',
  cliente_ref: '102', cliente_nombre: 'TROPHE INGREDIENTES',
  origen: 'mi-panel', tipo: 'seguimiento_riesgo',
  titulo: 'Recuperar TROPHE INGREDIENTES', descripcion: null,
  severidad: 'alerta', monto_riesgo: 290998.9, kg_riesgo: 1667, metrica: 'cantidad',
  estado: 'abierta', resultado: null,
  fecha_limite: '2026-10-30', fecha_cierre: null,
  periodo_analizado: '2026-09-01',
  agente_nombre: 'MARCELA GARZA',
  created_at: '2026-10-15T17:30:00Z', created_by: 'u1',
  creada_por_nombre: 'Sergio Abraham Juarez Nolasco',
  tomada_por: null, tomada_at: null, vencida: false,
  snapshot: { periodos: { act_d: '2026-08-01', act_h: '2026-09-30' }, productos: [] },
  comentarios: [], recordatorios: [], etiquetas: [], seguidores: [],
};

async function montar() {
  const js = fs.readFileSync(ARCHIVO, 'utf8');
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div></body></html>',
    { url: 'https://kogu.test/modules/crm/actividades.html', runScripts: 'outside-only' });
  const { window } = dom;
  await new Promise((r) => {
    if (window.document.readyState === 'complete') return r();
    window.addEventListener('load', r);
    setTimeout(r, 500);
  });
  const errores = [];
  window.KoguShell = {
    initShell: async () => {
      const d = window.document.createElement('div');
      d.id = 'pageContent';
      window.document.getElementById('app').appendChild(d);
      return { ok: true };
    },
    hasPerm: () => true,
    subscribeEmpresaActivaChange: () => {},
  };
  window.KoguApi = {
    apiFetch: async (url) => {
      // Cada endpoint desenvuelve distinto: etiquetas espera un arreglo en
      // data, la lista espera data.items y el detalle el objeto en data.
      if (url.includes('/etiquetas')) return { ok: true, data: [] };
      if (url.includes('/actividades/resumen')) return { ok: true, data: RESUMEN };
      if (/\/actividades\/[^/?]+$/.test(url)) return { ok: true, data: ACTIVIDAD };
      if (url.includes('/actividades')) return { ok: true, data: { items: [ACTIVIDAD] } };
      return { ok: true, data: {} };
    },
    authFetchRaw: async () => ({ ok: true, blob: async () => ({}), headers: { get: () => '' } }),
    toast: (m, t) => errores.push(`toast(${t}): ${m}`),
    withLoading: async (el, fn) => fn(),
  };
  window.KoguUi = {
    escapeHtml: (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    money: (v) => '$' + Number(v || 0).toLocaleString('es-MX', { maximumFractionDigits: 2 }),
    fmtDate: (v) => String(v), fmtDateOnly: (v) => String(v),
    withLoading: async (el, fn) => fn(),
  };
  window.eval(js);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  await new Promise((r) => setTimeout(r, 400));
  return {
    window, errores,
    $: (id) => window.document.getElementById(id),
    // OJO: el modal del detalle se cuelga del body, no de #app. Leer solo
    // #app hacia que las aserciones del detalle midieran una cadena vacia.
    txt: () => window.document.body.textContent.replace(/\s+/g, ' '),
  };
}

let P = null;

await check('la pantalla levanta y abre el detalle de una actividad', async () => {
  P = await montar();
  const fila = P.window.document.querySelector('#lista [data-act]');
  assert.ok(fila, 'no pinto la lista de actividades');
  fila.onclick();
  await new Promise((r) => setTimeout(r, 300));
  assert.ok(P.$('crmResultado'), 'no abrio el detalle con el selector de cierre');
});

console.log('\n── Vocabulario de cierre ───────────────────────────────────────');

await check('ofrece los ocho valores de comportamiento del cliente', async () => {
  const vals = [...P.$('crmResultado').options].map((o) => o.value);
  for (const r of COMPORTAMIENTO) {
    assert.ok(vals.includes(r), `falta "${r}" en el selector`);
  }
});

await check('ofrece los dos administrativos', async () => {
  const vals = [...P.$('crmResultado').options].map((o) => o.value);
  for (const r of ADMIN) assert.ok(vals.includes(r), `falta "${r}"`);
});

await check('ya NO ofrece el vocabulario retirado', async () => {
  const vals = [...P.$('crmResultado').options].map((o) => o.value);
  for (const r of RETIRADOS) {
    assert.ok(!vals.includes(r), `"${r}" sigue ofreciendose y quedo retirado`);
  }
});

await check('separa comportamiento de administrativos, para que no se confundan', async () => {
  const grupos = [...P.$('crmResultado').querySelectorAll('optgroup')]
    .map((g) => g.getAttribute('label').toLowerCase());
  assert.ok(grupos.some((g) => /comportamiento|cliente/.test(g)),
    `falta el grupo de comportamiento: ${JSON.stringify(grupos)}`);
  assert.ok(grupos.length >= 2, 'los diez valores van en una sola lista plana');
});

await check('seguimiento se ofrece como CIERRE, no como estado', async () => {
  const op = [...P.$('crmResultado').options].find((o) => o.value === 'seguimiento');
  assert.ok(op, 'falta seguimiento');
  assert.ok(/observaci[oó]n|seguimiento/i.test(op.textContent),
    'la etiqueta no dice que el cliente queda en observacion');
});

console.log('\n── El mes analizado a la vista ─────────────────────────────────');

await check('el detalle muestra el mes de ventas analizado', async () => {
  const t = P.txt();
  assert.ok(/sep.*2026|2026-09/i.test(t),
    'el detalle no dice que mes se analizo; nadie lo adivina desde la fecha de creacion');
});

await check('no lo confunde con la fecha de creacion', async () => {
  const t = P.txt();
  assert.ok(/analizad|periodo|mes de ventas/i.test(t),
    'muestra la fecha pero sin decir que es el periodo analizado');
});

console.log('\n── Quien es el responsable ─────────────────────────────────────');

// Observado el 20-oct: la actividad se asigna sola al agente del cliente,
// y los KPIs filtran por agente, pero en ninguna pantalla se veia CUAL
// agente la tiene. Sin eso nadie puede verificar que la asignacion quedo
// bien, que era el punto de la correccion del 15-oct.
await check('el detalle dice que agente es responsable', async () => {
  assert.ok(/MARCELA GARZA/i.test(P.txt()),
    'el detalle no nombra al agente responsable');
});

await check('lo distingue de quien la creo', async () => {
  const t = P.txt();
  assert.ok(/agente|responsable/i.test(t),
    'muestra el nombre pero sin decir que es el agente responsable');
  assert.ok(/creada por/i.test(t), 'se perdio quien la creo');
});

console.log(`\n${'='.repeat(70)}`);
verde.forEach(n => console.log(`  VERDE  ${n}`));
rojo.forEach(([n, m]) => console.log(`  ROJO   ${n}\n           ${m}`));
console.log(`${'='.repeat(70)}`);
console.log(`  ${verde.length} en verde, ${rojo.length} en rojo\n`);
process.exit(rojo.length ? 1 : 0);

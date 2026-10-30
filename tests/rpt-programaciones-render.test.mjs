// ============================================================
// tests/rpt-programaciones-render.test.mjs
// Reportes programados · el editor solo muestra los filtros que el reporte usa.
// Regla §16: escrita antes del cambio y mostrada fallando.
// Caso real (captura 23-oct-2026, dev.kogu.ink): la programación "Cobranza"
// (reporte cob.cartera.sesion, sin parámetros) aparecía en la lista como
// "Cobranza — Cartera para la sesión · Hoy" y el editor mostraba Periodo,
// Ámbito, Tipo de comprobante… que ese reporte ignora.
// Catálogo: el que regresa GET /protected/rpt/catalogo (rpt.catalogo.js).
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import fs from 'node:fs';

const JS = fs.readFileSync(new URL('../modules/rpt/programaciones.js', import.meta.url), 'utf8');
const P_CFDI = ['scope', 'tipo_comprobante', 'metodo_pago', 'moneda', 'estatus_sat', 'periodo'];
const CATALOGO = {
  reportes: [
    { key: 'cfdi.bandeja.personalizado', modulo: 'cfdi', nombre: 'Bandeja CFDI — Excel Personalizado', parametros: P_CFDI },
    { key: 'cfdi.bandeja.estandar', modulo: 'cfdi', nombre: 'Bandeja CFDI — Excel Estándar', parametros: P_CFDI },
    { key: 'cob.cartera.sesion', modulo: 'cob', nombre: 'Cobranza — Cartera para la sesión', parametros: [] },
  ],
  periodos: [{ clave: 'hoy', etiqueta: 'Hoy' }, { clave: 'ayer', etiqueta: 'Ayer' }],
  eventos: [{ clave: 'cfdi.descarga_completada', nombre: 'Al terminar la descarga automática del SAT' }],
};
const PROG_COB = { rpt_programacion_id: 'p-cob', nombre: 'Cobranza', reporte_key: 'cob.cartera.sesion', parametros: { periodo: 'hoy' },
  disparador: 'horario', dias_semana: [1], horas: ['08:00'], destinatarios: [{ email: 'auxiliarcxc@adegermex.com.mx' }], activo: true, enviar_si_vacio: true };
const PROG_CFDI = { rpt_programacion_id: 'p-cfdi', nombre: 'CFDI recibidos — Finanzas', reporte_key: 'cfdi.bandeja.personalizado', parametros: { periodo: 'hoy', scope: 'recibidos' },
  disparador: 'horario', dias_semana: [1, 2, 3, 4, 5], horas: ['09:45'], destinatarios: [{ email: 'finanzas@ejemplo.com' }], activo: true, enviar_si_vacio: true };

async function arranca() {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"><div id="pageContent"></div></div></body></html>',
    { url: 'https://kogu.test/modules/rpt/programaciones.html', runScripts: 'outside-only' });
  const { window } = dom;
  const envios = [];
  window.KoguShell = { initShell: async () => ({ ok: true, permissions: ['rpt.read', 'rpt.manage'] }), hasPerm: () => true, subscribeEmpresaActivaChange: () => {} };
  window.KoguApi = {
    unwrapRows: (r) => r?.data ?? r ?? [],
    toast: () => {},
    apiFetch: async (u, o = {}) => {
      if (o.method && o.method !== 'GET') { envios.push({ u, method: o.method, body: o.body ? JSON.parse(o.body) : null }); return { ok: true, data: {} }; }
      if (u === '/protected/rpt/catalogo') return { ok: true, data: CATALOGO };
      if (u === '/protected/rpt/programaciones') return { ok: true, data: [PROG_CFDI, PROG_COB] };
      if (u.startsWith('/protected/rpt/ejecuciones')) return { ok: true, data: [] };
      throw new Error('ruta no esperada ' + u);
    },
  };
  window.KoguUi = {
    escapeHtml: (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    cardStat: (l, v) => `<div>${l} ${v}</div>`, int: (n) => String(n), fmtDate: (d) => String(d || ''), fmtDateOnly: (d) => String(d || ''),
    queryParams: (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v != null && v !== '')).toString(),
    withLoading: async (btn, fn) => fn(),
  };
  window.eval(JS);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  await new Promise((r) => setTimeout(r, 80));
  const $ = (s) => window.document.querySelector(s);
  // Oculto = display:none en su caja (como hace la pantalla: .grid-* le gana a [hidden]).
  const visible = (name) => { const el = $(`#form [name="${name}"]`); const caja = el && el.closest('[data-param]'); return !!el && !(caja && caja.style.display === 'none'); };
  const texto = (el) => el.textContent.replace(/\s+/g, ' ').trim();
  const espera = () => new Promise((r) => setTimeout(r, 30));
  const elegir = async (key) => { const s = $('#form [name="reporte_key"]'); s.value = key; s.dispatchEvent(new window.Event('change', { bubbles: true })); await espera(); };
  return { window, $, visible, texto, espera, elegir, envios };
}
const FILTROS = ['periodo', 'f_scope', 'f_tipo_comprobante', 'f_estatus_sat', 'f_metodo_pago', 'f_moneda'];

test('nueva programación con un reporte de CFDI: periodo y filtros visibles (como hoy)', async () => {
  const p = await arranca();
  p.$('#btnNueva').click(); await p.espera();
  assert.equal(p.$('#form [name="reporte_key"]').value, 'cfdi.bandeja.personalizado');
  for (const f of FILTROS) assert.equal(p.visible(f), true, f);
});

test('al elegir el reporte de cobranza se ocultan periodo y filtros, con una nota; al regresar a CFDI vuelven', async () => {
  const p = await arranca();
  p.$('#btnNueva').click(); await p.espera();
  await p.elegir('cob.cartera.sesion');
  for (const f of FILTROS) assert.equal(p.visible(f), false, f);
  assert.match(p.texto(p.$('#paramNota')), /no tiene filtros/i);
  assert.notEqual(p.$('#paramNota').style.display, 'none');
  await p.elegir('cfdi.bandeja.estandar');
  for (const f of FILTROS) assert.equal(p.visible(f), true, f);
  assert.equal(p.$('#paramNota').style.display, 'none');
});

test('guardar cobranza manda solo los parámetros que el reporte declara (ninguno)', async () => {
  const p = await arranca();
  p.$('#btnNueva').click(); await p.espera();
  await p.elegir('cob.cartera.sesion');
  p.$('#form [name="nombre"]').value = 'Cobranza';
  p.$('#form [name="destinatarios"]').value = 'auxiliarcxc@adegermex.com.mx';
  p.$('#form').dispatchEvent(new p.window.Event('submit', { cancelable: true })); await p.espera();
  const [e] = p.envios;
  assert.equal(e.body.reporte_key, 'cob.cartera.sesion');
  assert.deepEqual(e.body.parametros, {});
});

test('guardar CFDI sigue mandando periodo y filtros como antes', async () => {
  const p = await arranca();
  p.$('#btnNueva').click(); await p.espera();
  p.$('#form [name="nombre"]').value = 'CFDI recibidos';
  p.$('#form [name="destinatarios"]').value = 'finanzas@ejemplo.com';
  p.$('#form').dispatchEvent(new p.window.Event('submit', { cancelable: true })); await p.espera();
  assert.deepEqual(p.envios[0].body.parametros, { periodo: 'hoy', scope: 'recibidos' });
});

test('editar la programación de cobranza abre sin filtros', async () => {
  const p = await arranca();
  const btn = [...p.window.document.querySelectorAll('#rows [data-edit], #rows button')].find((b) => /Editar/.test(b.textContent) && b.closest('tr').textContent.includes('Cobranza —'));
  btn.click(); await p.espera();
  assert.equal(p.$('#form [name="reporte_key"]').value, 'cob.cartera.sesion');
  for (const f of FILTROS) assert.equal(p.visible(f), false, f);
});

test('lista: el reporte sin periodo no muestra "· Hoy" (caso de la captura); el de CFDI sí', async () => {
  const p = await arranca();
  const filas = [...p.window.document.querySelectorAll('#rows tr')].map((tr) => p.texto(tr));
  assert.ok(filas.some((t) => /Cobranza — Cartera para la sesión/.test(t) && !/· Hoy/.test(t)), filas.join(' | '));
  assert.ok(filas.some((t) => /Bandeja CFDI — Excel Personalizado · Hoy/.test(t)));
});

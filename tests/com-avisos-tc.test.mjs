// ============================================================
// tests/com-avisos-tc.test.mjs
// Comisiones · avisos de la corrida + periodo por defecto del TC.
// Regla §16: escrita antes del parche y mostrada fallando.
// Caso observado (revisión 04-nov-2026):
//  1) El motor devuelve "Falta com_config_tc_pago para el periodo: comisión por
//     kg USD omitida." y la pantalla lo borra al recargar la corrida; la tarjeta
//     #warns nunca se llena aunque la corrida guarda params.warnings.
//  2) Configuración abre el TC en ENERO del AÑO SIGUIENTE (primera opción sin
//     selected) → el TC se guarda en un periodo equivocado.
// Se corre con: node --test tests/com-avisos-tc.test.mjs
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import fs from 'node:fs';

const WARN_TC = 'Falta com_config_tc_pago para el periodo: comisión por kg USD omitida.';
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const err = (status, code, message) => Object.assign(new Error(message || code), { status, code });

function montar(file, page, apiFetch) {
  const JS = fs.readFileSync(new URL(`../modules/com/${file}`, import.meta.url), 'utf8');
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div></body></html>',
    { url: `https://kogu.test/modules/com/${page}`, runScripts: 'outside-only' });
  const { window } = dom;
  const toasts = [];
  window.KoguShell = {
    initShell: async () => {
      const d = window.document.createElement('div'); d.id = 'pageContent';
      window.document.getElementById('app').appendChild(d);
      return { ok: true };
    },
    subscribeEmpresaActivaChange: () => {},
  };
  window.KoguApi = {
    apiFetch, toast: (m, t) => toasts.push([t, m]),
    unwrapData: (r) => r?.data, unwrapRows: (r) => r?.data || [],
    getEmpresaActiva: () => ({ nombre_corto: 'ADEGERMEX' }),
    authFetchRaw: async () => ({ ok: false }),
  };
  window.KoguUi = {
    escapeHtml: esc, money: (n) => `$${Number(n).toFixed(2)}`,
    withLoading: async (_el, fn) => fn(),
  };
  window.confirm = () => true;
  window.eval(JS);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  return { window, toasts };
}
const espera = (ms = 80) => new Promise((r) => setTimeout(r, ms));

const corrida = (warnings) => ({
  corrida_id: 'c-1', anio: 2026, mes: 10, estado: 'calculada', vigente: true,
  comision_total: 100, comision_porcentaje: 100, comision_espejo: 0, comision_kg_usd: 0,
  comision_kg_usd_divisa: 0, comision_adicional: 0, subtotal_base: 1000,
  subtotal_con_espejos: 1000, subtotal_periodo_raw: 1200, num_detalle: 3,
  num_excluidos: 1, num_nomapeados: 0, tc_pago: null, created_at: '2026-11-04T10:00:00',
  params: { warnings },
});

test('1a · al calcular, la advertencia de TC faltante queda visible tras recargar', async () => {
  let calculada = false;
  const { window } = montar('comisiones.js', 'comisiones.html', async (u, o = {}) => {
    if (o.method === 'POST') {
      calculada = true;
      return { ok: true, data: { totales: { comisionTotal: 100 }, warnings: [WARN_TC] } };
    }
    if (u.includes('/corridas/vigente')) {
      if (!calculada) throw err(404, 'CORRIDA_NO_ENCONTRADA');
      return { ok: true, data: { corrida: corrida([WARN_TC]), resumen: [] } };
    }
    throw new Error('ruta no esperada ' + u);
  });
  await espera();
  window.document.getElementById('calcBtn').click();
  await espera(150);
  const txt = window.document.getElementById('pageContent').textContent;
  assert.ok(txt.includes(WARN_TC), 'la advertencia del motor debe seguir en pantalla');
});

test('1b · al cargar una corrida guardada con advertencias, se muestran en #warns', async () => {
  const { window } = montar('comisiones.js', 'comisiones.html', async (u) => {
    if (u.includes('/corridas/vigente')) return { ok: true, data: { corrida: corrida([WARN_TC]), resumen: [] } };
    throw new Error('ruta no esperada ' + u);
  });
  await espera();
  assert.ok(window.document.getElementById('warns').textContent.includes(WARN_TC));
});

test('1c · sin advertencias, #warns queda vacío', async () => {
  const { window } = montar('comisiones.js', 'comisiones.html', async (u) => {
    if (u.includes('/corridas/vigente')) return { ok: true, data: { corrida: corrida([]), resumen: [] } };
    throw new Error('ruta no esperada ' + u);
  });
  await espera();
  assert.equal(window.document.getElementById('warns').textContent.trim(), '');
});

test('2 · Configuración abre el TC en el periodo que se paga (mes anterior), no en enero del año siguiente', async () => {
  const { window } = montar('configuracion.js', 'configuracion.html', async () => ({ ok: true, data: [] }));
  await espera();
  const now = new Date();
  const anio = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const mes = now.getMonth() === 0 ? 12 : now.getMonth();
  assert.equal(window.document.getElementById('tcAnio').value, String(anio));
  assert.equal(window.document.getElementById('tcMes').value, String(mes));
});

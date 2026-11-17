// ============================================================
// tests/comex-analisis-render.test.mjs
// Comercio Exterior · pantalla Análisis, etapa 1 (vista simple de gastos).
//
// Prueba de cableado de la pantalla: la lógica (filaGastos, ordenarControl,
// opcionesPeriodo) ya está cubierta en rojo→verde por comex-gastos y
// comex-periodos. Esta se escribió DESPUÉS del parche de la pantalla: verifica
// que la pantalla use esa lógica, no la define.
// Datos: Análisis 2026-10 por proveedor de prod (ADEGERMEX, 2026-11-17) y los
// periodos medidos ese día (n_analizable agregado como lo mandará la etapa 2).
// Uso: node --test tests/comex-analisis-render.test.mjs
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import fs from 'node:fs';

const CTRL = fs.readFileSync(new URL('../modules/comex/comex-control.js', import.meta.url), 'utf8');
const JS = fs.readFileSync(new URL('../modules/comex/analisis-comex.js', import.meta.url), 'utf8');

const prov = (grupo, kg, kg_cmp, gastos_real_cmp, teo_flete, teo_otros, kg_mp_cmp = kg_cmp) => ({
  grupo, ops: 1, kg, kg_cmp, gastos_real_cmp, teo_flete, teo_otros, kg_mp_cmp, mp_real_mp_cmp: 0, teo_mp: 0,
  costo_usd: 0, mp_usd: 0, gastos_usd: 0, gmp: null, periodo_min: '2026-10', periodo_max: '2026-10', n_periodos: 1,
});
const ANALISIS = {
  proveedores: [
    prov('TRES MONTES SA', 7000, 7000, 5149.6387, 1779.1667, 10165.1511),
    prov('NIKKEN FOODS USA INC.', 840, 0, 0, 0, 0),
    prov('CARLOS CRAMER PRODUCTOS AROMATICOS SACI', 485, 485, 3067.877, 3395, 2290.2778, 0),
    prov('INTERNATIONAL DEHYDRATED FOODS INC', 35380.8, 35380.8, 12012.7324, 7300.1587, 11792.592),
    prov('ELABORADORA Y COMERCIALIZADORA CASONA EL MONTE LIMITADA', 20000, 20000, 9958.1394, 4150, 10780.6),
  ],
  productos: [], escalas: [],
};
const PERIODOS = [
  { periodo: '2026-10', n_pedimentos: 25, n_reconciliado: 9, n_analizable: 9 },
  { periodo: '2026-09', n_pedimentos: 29, n_reconciliado: 0, n_analizable: 0 },
];

async function abrir() {
  const dom = new JSDOM('<!DOCTYPE html><div id="app"></div>', { url: 'https://kogu.test/modules/comex/analisis-comex.html', runScripts: 'outside-only' });
  const { window } = dom;
  const urls = [];
  window.KoguShell = {
    initShell: async () => { const d = window.document.createElement('div'); d.id = 'pageContent'; window.document.getElementById('app').appendChild(d); return {}; },
    subscribeEmpresaActivaChange: () => {},
  };
  window.KoguApi = {
    apiFetch: async (url) => { urls.push(url); if (url.includes('/reconciliacion/periodos')) return { data: PERIODOS }; if (url.includes('/analisis?')) return { data: ANALISIS }; return { data: [] }; },
    unwrapData: (r) => r.data, toast: () => {},
  };
  window.eval(CTRL);
  window.eval(JS);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
  const $ = (s) => window.document.querySelector(s);
  const filas = () => [...window.document.querySelectorAll('#tAn tbody tr:not(.op-det)')].map((tr) => tr.textContent.replace(/\s+/g, ' ').trim());
  const head = () => $('#tAn thead').textContent.replace(/\s+/g, ' ');
  return { window, $, filas, head, urls };
}

test('abre en la vista de gastos: columnas esenciales, sin costo total', async () => {
  const p = await abrir();
  const h = p.head();
  for (const c of ['Gastos real/kg', 'Gastos teó/kg', 'Desv vs teó', 'Estado', 'Sin teórico']) assert.ok(h.includes(c), c);
  assert.ok(!h.includes('Costo total USD'), 'el costo total va al detalle');
  assert.ok(!h.includes('Gastos/MP'));
});

test('orden: revisar por kg (IDF, Casona, Tres Montes, Cramer) y al final sin teórico', async () => {
  const f = (await abrir()).filas();
  assert.match(f[0], /^.*INTERNATIONAL DEHYDRATED/);
  assert.match(f[1], /CASONA/);
  assert.match(f[2], /TRES MONTES/);
  assert.match(f[3], /CRAMER/);
  assert.match(f[4], /NIKKEN/);
});

test('IDF ↓ −37.1 % revisar; Cramer revisar (hoy oculto en DDP); Nikken sin teórico 840 kg', async () => {
  const f = (await abrir()).filas();
  assert.match(f[0], /↓ -37\.1%/); assert.match(f[0], /revisar/);
  assert.match(f[3], /↓ -46\.0%/); assert.match(f[3], /revisar/);
  assert.match(f[4], /sin teórico comparable/); assert.match(f[4], /840 kg/); assert.match(f[4], /100\.0%/);
});

test('selector: 2026-09 deshabilitado "sin reconciliar"; arranca en Acumulado', async () => {
  const p = await abrir();
  const o = p.$('#periodo option[value="2026-09"]');
  assert.equal(o.disabled, true);
  assert.match(o.textContent, /sin reconciliar/);
  assert.equal(p.$('#periodo').value, 'ACUM');
  assert.ok(p.urls.some((u) => u.includes('/analisis?periodo=ACUM')));
});

test('Ver detalle muestra Composición y DDP; el DDP conserva su vista', async () => {
  const p = await abrir();
  assert.equal(p.$('#vDet').style.display, 'none');
  p.$('#vMas').click();
  assert.notEqual(p.$('#vDet').style.display, 'none');
  p.$('#vCtrl').click();
  assert.ok(p.head().includes('DDP real/kg'));
  p.$('#vComp').click();
  assert.ok(p.head().includes('Costo total USD'));
  assert.notEqual(p.$('#legGmp').style.display, 'none', 'leyenda Gastos/MP solo en Composición');
  p.$('#vGas').click();
  assert.ok(p.head().includes('Gastos real/kg'));
  assert.equal(p.$('#legGmp').style.display, 'none');
});

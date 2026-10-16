// ============================================================
// tests/comex-control.test.mjs
// Comercio Exterior · regla de control vs teórico (modules/comex/comex-control.js)
//
// Regla §16.4: escrita antes del código y mostrada fallando.
//
// Lo que defiende: que una muestra mínima de mercancía comparable no decida
// el estado de todo un proveedor, sin esconder la señal de la mercancía.
//   · DDP con estado solo si la mercancía comparable cubre ≥ 50 % de los kg;
//     debajo → 'parcial' (gris), nunca 'revisar'.
//   · La mercancía (MP) se evalúa aparte, con su propia base.
//   · Bandas: dentro ≤10 % · fuera ≤30 % · revisar >30 % (el estado no sigue al signo).
//
// Casos MEDIDOS en AdeApps (Análisis · Acumulado · Control vs teórico, 2026-10-16):
//   Cramer: 6 líneas WWP0855 = 145 kg, MP real 25.27–30.45 USD/kg vs EXW 14.75;
//           pantalla: DDP real 33.2953 vs teó 21.7137 (+53.3 %), "MP sobre 1 % kg".
//   K+S:    384,000 kg, MP 1.099 = 1.099; DDP real 1.2719 vs teó 1.4355 (−11.4 %).
// Los importes de gastos se DERIVAN de esos DDP de pantalla (DDP − MP/kg) × kg.
// Uso: node --test tests/comex-control.test.mjs
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const C = require('../modules/comex/comex-control.js');

const r4 = (v) => Math.round(v * 1e4) / 1e4;

// Cramer · 6 líneas WWP0855 (kg × MP real/kg medidos)
const LINEAS_WWP0855 = [[40, 25.27], [5, 27.36], [40, 27.36], [10, 27.36], [40, 27.36], [10, 30.45]];
const kgMpCramer = LINEAS_WWP0855.reduce((a, [k]) => a + k, 0);              // 145
const mpRealCramer = LINEAS_WWP0855.reduce((a, [k, p]) => a + k * p, 0);      // 3,914.5
const KG_CRAMER = 14384;
const CRAMER = {
  kg: KG_CRAMER, kgMp: kgMpCramer,
  mpReal: mpRealCramer, mpTeo: kgMpCramer * 14.75,
  gastosReal: (33.2953 - mpRealCramer / kgMpCramer) * KG_CRAMER,
  gastosTeo: (21.7137 - 14.75) * KG_CRAMER,
};
const KS = {
  kg: 384000, kgMp: 384000, mpReal: 1.099 * 384000, mpTeo: 1.099 * 384000,
  gastosReal: (1.2719 - 1.099) * 384000, gastosTeo: (1.4355 - 1.099) * 384000,
};

test('bandas: dentro ≤10 %, fuera ≤30 %, revisar >30 %, sin importar el signo', () => {
  assert.equal(C.estado(-0.10), 'dentro');
  assert.equal(C.estado(0.1001), 'fuera');
  assert.equal(C.estado(-0.30), 'fuera');
  assert.equal(C.estado(-0.3001), 'revisar');
  assert.equal(C.estado(null), null);
});

test('Cramer: 1 % de cobertura → DDP "parcial", nunca "revisar"', () => {
  const c = C.control(CRAMER);
  assert.equal(Math.round(c.cobMp * 100), 1);
  assert.equal(r4(c.ddp.real), 33.2953, 'el DDP real se sigue mostrando');
  assert.equal(r4(c.ddp.teo), 21.7137);
  assert.equal(c.ddp.estado, 'parcial');
  assert.equal(c.ddp.motivo, 'mp_parcial');
});

test('Cramer: la señal de la mercancía NO se esconde — WWP0855 +83 % "revisar" sobre 145 kg', () => {
  const c = C.control(CRAMER);
  assert.equal(Math.round(c.mp.desv * 100), 83);
  assert.equal(c.mp.estado, 'revisar');
  assert.equal(c.mp.kg, 145);
});

test('K+S: 100 % de cobertura → DDP −11.4 % "fuera"; MP 0.0 % "dentro"', () => {
  const c = C.control(KS);
  assert.equal(c.cobMp, 1);
  assert.equal(Math.round(c.ddp.desv * 1000) / 10, -11.4);
  assert.equal(c.ddp.estado, 'fuera');
  assert.equal(r4(c.mp.desv), 0);
  assert.equal(c.mp.estado, 'dentro');
});

test('umbral: cobertura exactamente 50 % sí da estado al DDP', () => {
  const c = C.control({ kg: 1000, kgMp: 500, mpReal: 5000, mpTeo: 5000, gastosReal: 1000, gastosTeo: 1000 });
  assert.equal(C.UMBRAL_COB_MP, 0.5);
  assert.equal(c.ddp.estado, 'dentro');
});

test('op 975: ninguna línea del producto del costeo → "MP sin teórico", sin DDP', () => {
  const c = C.control({ kg: 800, kgMp: 0, mpReal: 0, mpTeo: 0, gastosReal: 4.7325 * 800, gastosTeo: 6.7063 * 800 });
  assert.equal(c.mp, null);
  assert.equal(c.ddp.real, null);
  assert.equal(c.ddp.estado, null);
  assert.equal(c.ddp.motivo, 'mp_sin_teorico');
});

test('sin teórico comparable (kg = 0) → nada que comparar', () => {
  const c = C.control({ kg: 0, kgMp: 0, mpReal: 0, mpTeo: 0, gastosReal: 0, gastosTeo: 0 });
  assert.equal(c.ddp.motivo, 'sin_teorico');
  assert.equal(c.mp, null);
});

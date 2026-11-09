// ============================================================
// tests/menu-costos.test.mjs
// Menu · la seccion "Costo" (26 opciones) se divide en subsecciones.
// Regla §16: escrita antes del cambio y mostrada fallando.
// Caso real: menu de assets/shell.js al 2026-11-09 — "Costo" llego a 26
// opciones al agregar Requisiciones (Sergio: "ya esta muy cargado").
// Solo front: no cambia ninguna ruta, pagina ni permiso.
// Se corre con: node --test tests/menu-costos.test.mjs
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const H = require('../assets/herramientas.js');

const SRC = readFileSync(new URL('../assets/shell.js', import.meta.url), 'utf8');

// Lee el NAV real: { seccion: [{href, perm}] } en orden.
function leerNav(src) {
  const out = [];
  const re = /\{section:'([^']+)',items:\[([\s\S]*?)\]\}/g;
  for (const m of src.matchAll(re)) {
    const items = [...m[2].matchAll(/\{href:'([^']+)',\s*label:'([^']*)',\s*perm:(\[[^\]]*\]|'[^']*')\}/g)]
      .map((x) => ({ href: x[1], label: x[2], perm: x[3] }));
    out.push({ section: m[1], items });
  }
  return out;
}
const NAV = leerNav(SRC);

// Las 26 opciones de "Costo" antes del cambio, con su permiso.
const ANTES = {
  '/modules/cto/direccion-ventas.html': "'screen.costo'",
  '/modules/cto/dashboard-bruta.html': "'screen.costo'",
  '/modules/cto/dashboard-operacion.html': "'screen.costo'",
  '/modules/cto/segmentos.html': "'screen.cto.segmentos'",
  '/modules/cto/exportacion-analisis.html': "'screen.costo'",
  '/modules/cto/costo-export-cliente.html': "'screen.cto.export_cliente'",
  '/modules/cto/reporte-ejecutivo.html': "'screen.costo'",
  '/modules/cto/eficiencia-comercial.html': "'screen.costo'",
  '/modules/cto/cargas.html': "'screen.costo'",
  '/modules/cto/captura-abc.html': "'screen.costo'",
  '/modules/cto/factores-abc.html': "'screen.cto.factores'",
  '/modules/cto/segmentos-catalogo.html': "'screen.cto.segmentos'",
  '/modules/cto/captura-gastos-venta.html': "'screen.costo'",
  '/modules/cto/integraciones-export.html': "'screen.costo'",
  '/modules/cto/resumen.html': "'screen.costo'",
  '/modules/cto/bandeja.html': "'screen.costo'",
  '/modules/cto/factura.html': "'screen.costo'",
  '/modules/cto/rentabilidad.html': "'screen.costo'",
  '/modules/cto/compras-usd.html': "'screen.costo'",
  '/modules/cto/inventario.html': "'screen.costo'",
  '/modules/cto/productos-b.html': "'screen.costo'",
  '/modules/cto/produccion-teorico.html': "'screen.costo'",
  '/modules/cto/produccion-vendido.html': "'screen.costo'",
  '/modules/cto/requisiciones.html': "'screen.cto.requisiciones'",
  '/modules/cto/precios-pactados.html': "'screen.cto.requisiciones'",
  '/modules/cto/cierre.html': "'screen.costo'",
};

const SUBSECCIONES = {
  'Costo · Dirección': ['direccion-ventas', 'dashboard-bruta', 'dashboard-operacion', 'segmentos', 'reporte-ejecutivo', 'eficiencia-comercial'],
  'Costo · Costo de ventas': ['resumen', 'bandeja', 'factura', 'rentabilidad', 'factores-abc', 'compras-usd'],
  'Costo · Producción e inventario': ['inventario', 'productos-b', 'produccion-teorico', 'produccion-vendido'],
  'Costo · Exportación': ['exportacion-analisis', 'costo-export-cliente', 'integraciones-export'],
  'Costo · Requisiciones': ['requisiciones', 'precios-pactados'],
  'Costo · Captura y cierre': ['cargas', 'captura-abc', 'captura-gastos-venta', 'segmentos-catalogo', 'cierre'],
};

test('el NAV se lee completo (control de la prueba)', () => {
  assert.ok(NAV.length >= 16);
  const total = NAV.reduce((s, x) => s + x.items.length, 0);
  assert.ok(total >= 60, `solo se leyeron ${total} opciones`);
});

test('ya no existe la seccion "Costo" de 26 opciones; hay seis subsecciones en este orden', () => {
  const nombres = NAV.map((s) => s.section);
  assert.ok(!nombres.includes('Costo'));
  const subs = nombres.filter((n) => n.startsWith('Costo · '));
  assert.deepEqual(subs, Object.keys(SUBSECCIONES));
});

test('cada subseccion trae sus pantallas, en orden, y ninguna pasa de 6', () => {
  for (const [sec, slugs] of Object.entries(SUBSECCIONES)) {
    const s = NAV.find((x) => x.section === sec);
    assert.ok(s, `falta ${sec}`);
    assert.deepEqual(s.items.map((i) => i.href), slugs.map((x) => `/modules/cto/${x}.html`), sec);
    assert.ok(s.items.length <= 6, `${sec} tiene ${s.items.length}`);
  }
});

test('no se pierde ni se duplica ninguna pantalla de Costo y cada una conserva su permiso', () => {
  const todos = NAV.flatMap((s) => s.items).filter((i) => i.href.startsWith('/modules/cto/'));
  assert.equal(todos.length, Object.keys(ANTES).length);
  for (const i of todos) assert.equal(i.perm, ANTES[i.href], i.href);
  assert.deepEqual(new Set(todos.map((i) => i.href)), new Set(Object.keys(ANTES)));
});

test('las subsecciones quedan en la herramienta Costos, antes de Comercio Exterior y Comisiones', () => {
  assert.deepEqual(H.secciones('costos'), [...Object.keys(SUBSECCIONES), 'Comercio Exterior', 'Comisiones']);
});

test('las etiquetas no repiten el nombre de la subseccion', () => {
  for (const sec of Object.keys(SUBSECCIONES)) {
    const s = NAV.find((x) => x.section === sec);
    for (const i of s?.items || []) {
      assert.doesNotMatch(i.label, /Dirección ·|Exportación ·|Producción ·|Requisiciones ·/, `${sec}: ${i.label}`);
    }
  }
});

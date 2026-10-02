// Prueba del selector de herramientas (core). Se corre con: node --test tests/
// Casos tomados del NAV real de assets/shell.js y de perfiles reales.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const H = require('../assets/herramientas.js');

// Fragmento del NAV real (shell.js), suficiente para los casos.
const NAV = [
  { section: 'Administrador', items: [{ href: '/modules/core/empresas/empresas.html', perm: 'screen.root.index' }] },
  { section: 'Negocio CFDI', items: [{ href: '/modules/cfdi/bandeja/bandeja.html', perm: 'screen.cfdi.sat_dm' }] },
  { section: 'Radar Comercial', items: [{ href: '/modules/rc/mi-panel.html', perm: 'screen.ventas.vendedor' }] },
  { section: 'CRM', items: [{ href: '/modules/crm/actividades.html', perm: 'crm.actividades.read' }] },
  { section: 'Costo', items: [{ href: '/modules/cto/resumen.html', perm: 'screen.costo' }] },
  { section: 'Lab QA', items: [{ href: '/modules/lab/lab-lotes.html', perm: 'screen.lab.lotes' }] },
];

test('vendedor: solo ve Comercial y entra directo', () => {
  const r = H.disponibles(NAV, ['screen.ventas.vendedor', 'crm.actividades.read']);
  assert.deepEqual(r.map(h => h.id), ['comercial']);
  assert.equal(H.entradaDirecta(NAV, ['screen.ventas.vendedor']), 'comercial');
});

test('usuario con varias áreas: ve sus herramientas en orden fijo y no entra directo', () => {
  const perms = ['screen.lab.lotes', 'screen.costo', 'screen.cfdi.sat_dm'];
  assert.deepEqual(H.disponibles(NAV, perms).map(h => h.id), ['fiscal', 'costos', 'calidad']);
  assert.equal(H.entradaDirecta(NAV, perms), null);
});

test('una herramienta sin secciones con permiso no aparece (I+D vacía hoy)', () => {
  const ids = H.disponibles(NAV, ['screen.root.index', 'screen.costo']).map(h => h.id);
  assert.ok(!ids.includes('idp'));
});

test('secciones de una herramienta', () => {
  assert.deepEqual(H.secciones('comercial'), ['Radar Comercial', 'CRM']);
});

test('enlace directo a una página de otra herramienta: se identifica su herramienta', () => {
  assert.equal(H.herramientaDePagina(NAV, '/modules/lab/lab-lotes.html'), 'calidad');
  assert.equal(H.herramientaDePagina(NAV, '/modules/core/contexto/cambio-empresa.html'), null);
});

test('toda sección del NAV real de shell.js pertenece a exactamente una herramienta', () => {
  const src = readFileSync(new URL('../assets/shell.js', import.meta.url), 'utf8');
  const nombres = [...src.matchAll(/\{section:'([^']+)'/g)].map(m => m[1]);
  assert.ok(nombres.length >= 16, 'no se leyeron las secciones del NAV');
  for (const n of nombres) {
    const duenas = H.HERRAMIENTAS.filter(h => h.secciones.includes(n));
    assert.equal(duenas.length, 1, `la sección "${n}" pertenece a ${duenas.length} herramientas`);
  }
});

// ── Paso 2: herramienta activa y filtro del menú (lo usará shell.js) ──
const PERMS_MIXTO = ['screen.lab.lotes', 'screen.costo', 'screen.cfdi.sat_dm'];

test('activa: un enlace directo manda sobre la herramienta guardada', () => {
  assert.equal(H.resolverActiva(NAV, PERMS_MIXTO, '/modules/lab/lab-lotes.html', 'costos'), 'calidad');
});

test('activa: en página transversal se conserva la guardada si sigue disponible', () => {
  assert.equal(H.resolverActiva(NAV, PERMS_MIXTO, '/modules/core/contexto/cambio-empresa.html', 'costos'), 'costos');
});

test('activa: una guardada que ya no está permitida se descarta', () => {
  assert.equal(H.resolverActiva(NAV, PERMS_MIXTO, '/inicio.html', 'comercial'), null);
  assert.equal(H.resolverActiva(NAV, ['screen.ventas.vendedor'], '/inicio.html', 'costos'), 'comercial');
});

test('filtro: sin herramienta activa el menú queda igual que hoy', () => {
  assert.deepEqual(H.filtrarNav(NAV, null), NAV);
});

test('filtro: con herramienta activa solo quedan sus secciones', () => {
  assert.deepEqual(H.filtrarNav(NAV, 'comercial').map(s => s.section), ['Radar Comercial', 'CRM']);
});

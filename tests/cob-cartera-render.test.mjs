// ============================================================
// tests/cob-cartera-render.test.mjs
// Cobranza F1 · pantalla de Cartera (sesión semanal del lunes 9:00).
// Regla §16: escrita antes de la pantalla y mostrada fallando.
// Datos: respuesta real de GET /protected/cob/cartera (servicio del backend
// sobre el export SAI del 20-oct-2026 anonimizado) en tests/fixtures.
// Se corre con: node --test tests/cob-cartera-render.test.mjs
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import fs from 'node:fs';

const JS = fs.readFileSync(new URL('../modules/cob/cartera/cartera.js', import.meta.url), 'utf8');
const COMUN = fs.readFileSync(new URL('../modules/cob/cob-comun.js', import.meta.url), 'utf8');
const CART = JSON.parse(fs.readFileSync(new URL('./fixtures/cob-cartera-20261020.json', import.meta.url)));
const K20 = CART.corte.corte_id;
const K13 = '44444444-4444-4444-8444-444444444444';
const CORTES = [
  { corte_id: '55555555-5555-4555-8555-555555555555', fecha_corte: '2026-10-23', status: 'preview' },
  { corte_id: K20, fecha_corte: '2026-10-20', status: 'aplicado', saldo_mxn: '99472027.56' },
  { corte_id: '66666666-6666-4666-8666-666666666666', fecha_corte: '2026-10-20', status: 'reemplazado', saldo_mxn: '99000000.00' },
  { corte_id: K13, fecha_corte: '2026-10-13', status: 'aplicado', saldo_mxn: '98000000.00' },
  { corte_id: '77777777-7777-4777-8777-777777777777', fecha_corte: '2026-10-09', status: 'descartado' },
];
const D27162 = CART.documentos.find((d) => d.folio === '27162');
const FICHA = { documento: { ...D27162, corte_id: K20, fecha_corte: '2026-10-20', corte_status: 'aplicado' },
  historia: [
    { corte_id: K13, fecha_corte: '2026-10-13', corte_status: 'aplicado', saldo: 2530, saldo_mxn: 43047.19, dias_vencido: 11, bucket: 2 },
    { corte_id: K20, fecha_corte: '2026-10-20', corte_status: 'aplicado', saldo: 2530, saldo_mxn: 43047.19, dias_vencido: 18, bucket: 2 },
  ],
  // F1b: seguimientos de la factura (uno anulado), como los devuelve el backend.
  seguimientos: [
    { seguimiento_id: 's-8', accion_clave: 'seguimiento', accion: 'Seguimiento enviado', texto: 'Correo al contacto de pagos', fecha_compromiso: null,
      gestiona: 'cxc', agente: null, anulado: true, anulado_motivo: 'Era de otra factura', created_at: '2026-10-16T15:00:00Z', creado_por: 'CxC' },
    { seguimiento_id: 's-9', accion_clave: 'junta', accion: 'Junta / escalamiento', texto: 'Prox junta jueves 26 oct, Marce', fecha_compromiso: '2026-10-26',
      gestiona: 'agente', agente: 'Marcela G.', anulado: false, anulado_motivo: null, created_at: '2026-10-21T16:00:00Z', creado_por: 'CxC' },
  ] };
const ACCIONES = [
  { accion_id: 'a-seg', clave: 'seguimiento', nombre: 'Seguimiento enviado', requiere_fecha: false },
  { accion_id: 'a-prog', clave: 'programada_pago', nombre: 'Programada para pago', requiere_fecha: true },
  { accion_id: 'a-otro', clave: 'otro', nombre: 'Otro', requiere_fecha: false },
];

// La cuadratura con SAI (342 docs, $99.47M) se ve con Sesión = Todos; por eso
// las pruebas arrancan ahí salvo que pidan el valor por omisión (sesion: null).
async function arranca({ cartera = CART, permisos = ['cob.cartera.read'], sesion = 'todos', exportFalla = null } = {}) {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div></body></html>',
    { url: 'https://kogu.test/modules/cob/cartera/cartera.html', runScripts: 'outside-only' });
  const { window } = dom;
  const pedidos = [];
  const envios = [];
  const descargas = [];
  const bajados = [];
  const toasts = [];
  let alCambiarEmpresa = null;
  let respuesta = cartera;
  window.KoguShell = {
    initShell: async (o) => {
      window.__init = o;
      const d = window.document.createElement('div'); d.id = 'pageContent';
      window.document.getElementById('app').appendChild(d);
      return { ok: true, permissions: permisos };
    },
    hasPerm: (p) => permisos.includes(p),
    subscribeEmpresaActivaChange: (fn) => { alCambiarEmpresa = fn; },
  };
  window.KoguApi = {
    apiFetch: async (url, o = {}) => {
      pedidos.push(url);
      if (o.method === 'POST') envios.push({ url, body: o.body ? JSON.parse(o.body) : null });
      if (url === '/protected/cob/acciones') return { ok: true, data: ACCIONES };
      if (url === '/protected/cob/seguimientos') return { ok: true, data: { creados: 2 } };
      if (/\/protected\/cob\/seguimientos\/[^/]+\/anular$/.test(url)) return { ok: true, data: { anulado: true } };
      if (url.startsWith('/protected/cob/cortes')) return { ok: true, data: CORTES };
      if (url.startsWith('/protected/cob/cartera/documentos/')) return { ok: true, data: FICHA };
      if (url.startsWith('/protected/cob/cartera')) return { ok: true, data: typeof respuesta === 'function' ? respuesta(url) : respuesta };
      throw new Error('ruta no esperada ' + url);
    },
    toast: (m, t) => toasts.push([t, m]),
    authFetchRaw: async (url, o = {}) => {
      descargas.push({ url, method: o.method, body: o.body ? JSON.parse(o.body) : null });
      if (exportFalla) return { ok: false, status: exportFalla.status, headers: { get: () => 'application/json' }, json: async () => exportFalla.body };
      return { ok: true, status: 200, headers: { get: (h) => (/disposition/i.test(h) ? 'attachment; filename="cartera_ADGM_2026-10-21.xlsx"' : '') },
        blob: async () => new window.Blob(['PK']) };
    },
  };
  window.URL.createObjectURL = () => 'blob:kogu';
  window.URL.revokeObjectURL = () => {};
  window.HTMLAnchorElement.prototype.click = function () { bajados.push(this.download); };
  window.KoguUi = { escapeHtml: (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') };
  window.eval(COMUN);
  window.eval(JS);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  await new Promise((r) => setTimeout(r, 150));
  const $ = (s) => window.document.querySelector(s);
  const $$ = (s) => [...window.document.querySelectorAll(s)];
  const texto = (el = window.document.getElementById('app')) => el.textContent.replace(/\s+/g, ' ');
  const espera = () => new Promise((r) => setTimeout(r, 60));
  const filas = () => $$('#cobTabla tbody tr.r').filter((tr) => tr.style.display !== 'none');
  const cambia = async (sel, v) => { const e = $(sel); e.value = v; e.dispatchEvent(new window.Event(sel === '#cobQ' ? 'input' : 'change')); await espera(); };
  if (sesion && $('#cobSesion')) await cambia('#cobSesion', sesion);
  return { window, pedidos, envios, descargas, bajados, toasts, $, $$, texto, espera, filas, cambia, set: (r) => { respuesta = r; }, cambiarEmpresa: async () => { alCambiarEmpresa && (await alCambiarEmpresa()); await espera(); } };
}

test('pide la cartera vigente y el historial de cortes; exige cob.cartera.read', async () => {
  const p = await arranca();
  assert.equal(p.window.__init.requiredPermission, 'cob.cartera.read');
  assert.equal(p.window.__init.currentPage, '/modules/cob/cartera/cartera.html');
  assert.ok(p.pedidos.includes('/protected/cob/cartera'));
  assert.ok(p.pedidos.some((u) => u.startsWith('/protected/cob/cortes')));
});

test('fichas en dos filas, pesos y dólares, cada una en su moneda; equivalente en pesos como control', async () => {
  const p = await arranca();
  assert.equal(p.$$('[data-moneda="MXN"] [data-ficha]').length, 7);
  assert.equal(p.$$('[data-moneda="USD"] [data-ficha]').length, 7);
  const t = (m, k) => p.texto(p.$(`[data-moneda="${m}"] [data-ficha="${k}"]`));
  assert.match(t('MXN', 'cartera'), /\$27\.99M/); assert.match(t('MXN', 'cartera'), /103 docs/);
  assert.match(t('MXN', 'vencido'), /\$2\.15M/); assert.match(t('MXN', 'vencido'), /11 docs/);
  assert.match(t('USD', 'cartera'), /US\$4\.08M/); assert.match(t('USD', 'cartera'), /239 docs/);
  assert.match(t('USD', 'vencido'), /US\$832,705/); assert.match(t('USD', 'vencido'), /91 docs/);
  assert.match(p.texto(p.$('#cobControl')), /342 docs · 55 clientes · equivalente en pesos \$99,472,027\.56/);
  assert.match(p.texto(), /Corte 21\/10\/2026/i);   // el export se generó el 21
});

test('avisos: notas por aplicar y residuos; sin aviso de corte desactualizado', async () => {
  const p = await arranca();
  const a = p.texto(p.$('#cobAvisos'));
  assert.match(a, /8 notas de crédito por aplicar/);
  assert.match(a, /2 saldos menores a \$50/);
  assert.doesNotMatch(a, /días; carga/);
});

test('corte desactualizado: aviso visible', async () => {
  const p = await arranca({ cartera: { ...CART, corte: { ...CART.corte, dias_desde_corte: 10, desactualizado: true } } });
  assert.match(p.texto(p.$('#cobAvisos')), /El corte tiene 10 días/);
});

test('tabla: columnas USD y MXN, cada factura en la de su moneda; suma de cada columna al pie', async () => {
  const p = await arranca();
  assert.equal(p.filas().length, 342);
  assert.match(p.texto(p.filas()[0]), /A 23656/);
  assert.match(p.texto(p.$('#cobConteo')), /342 documentos/);
  const ths = p.$$('#cobTabla thead th').map((th) => p.texto(th).replace(/[▲▼]/g, '').trim());
  assert.ok(ths.includes('USD') && ths.includes('MXN'));
  assert.ok(!ths.includes('Mon.') && !ths.includes('Saldo MXN'));
  const f = p.filas().find((tr) => /A 27162/.test(p.texto(tr)));
  assert.equal(p.texto(f.querySelector('[data-col="usd"]')).trim(), '2,530.00');
  assert.equal(p.texto(f.querySelector('[data-col="mxn"]')).trim(), '');
  assert.equal(p.texto(p.$('#cobTotUSD')).trim(), '4,082,965.10');
  assert.equal(p.texto(p.$('#cobTotMXN')).trim(), '27,986,056.36');
});

test('cliente con factoraje y cliente sin catalogar se distinguen', async () => {
  const p = await arranca();
  const f1 = p.filas().find((tr) => /CLIENTE 1\b/.test(p.texto(tr)));
  assert.match(p.texto(f1), /Factoraje/);
  const sin = p.filas().find((tr) => tr.dataset.sinCatalogo === '1');
  assert.ok(sin, 'hay renglones sin catálogo marcados');
  assert.match(p.texto(sin), /Sin catálogo/);
});

test('ficha seleccionada filtra la tabla y aparece como chip; segundo clic la quita', async () => {
  const p = await arranca();
  // La ficha filtra solo el rango, sin importar en qué fila (moneda) se tocó.
  p.$('[data-moneda="USD"] [data-ficha="b5"]').click(); await p.espera();
  assert.equal(p.filas().length, 22);
  assert.match(p.texto(p.$('#cobChips')), /Ficha: Más de 90/);
  assert.doesNotMatch(p.texto(p.$('#cobChips')), /USD|MXN/);
  assert.equal(p.$$('[data-ficha="b5"].sel').length, 2, 'se marca la ficha en las dos filas');
  assert.equal(p.texto(p.$('#cobTotUSD')).trim(), '140,807.50');
  assert.equal(p.texto(p.$('#cobTotMXN')).trim(), '1,632,567.04');
  p.$('[data-moneda="MXN"] [data-ficha="b5"]').click(); await p.espera();
  assert.equal(p.filas().length, 342);
});

test('filtro de moneda recalcula fichas y tabla', async () => {
  const p = await arranca();
  await p.cambia('#cobMoneda', 'USD');
  assert.equal(p.filas().length, 239);
  assert.equal(p.$('[data-moneda="MXN"]'), null);
  assert.match(p.texto(p.$('[data-moneda="USD"] [data-ficha="cartera"]')), /US\$4\.08M/);
  assert.match(p.texto(p.$('#cobChips')), /Moneda: USD/);
});

test('buscar folio (notas sin serie) y filtrar responsable "sin responsable"', async () => {
  const p = await arranca();
  await p.cambia('#cobQ', 'n200');
  assert.equal(p.filas().length, 1);
  await p.cambia('#cobQ', '');
  await p.cambia('#cobResp', '__none');
  assert.equal(p.filas().length, 244);
});

test('agrupar por cliente: 55 grupos, el de mayor saldo arriba; los renglones se abren al tocar el grupo', async () => {
  const p = await arranca();
  const chk = p.$('#cobAgrupar'); chk.checked = true; chk.dispatchEvent(new p.window.Event('change')); await p.espera();
  const g = p.$$('#cobTabla tbody tr.g');
  assert.equal(g.length, 55);
  assert.match(p.texto(g[0]), /CLIENTE 1 · 81 docs · 5 vencidas/);
  assert.match(p.texto(g[0]), /530,097\.29/); assert.match(p.texto(g[0]), /22,869,671\.73/);
  assert.equal(p.filas().length, 0);
  g[0].click(); await p.espera();
  assert.equal(p.filas().length, 81);
});

test('vencido por responsable: Roxana primero, sin responsable al final', async () => {
  const p = await arranca();
  const r = p.$$('#cobResponsables [data-resp]').map((e) => p.texto(e));
  assert.match(r[0], /Roxana H\./);
  assert.match(r[0], /US\$127,798\.16/); assert.match(r[0], /\$192,400\.50/);
  assert.match(r.at(-1), /Sin responsable/);
});

test('clic en una factura: pide su ficha y muestra la historia en los cortes', async () => {
  const p = await arranca();
  p.filas().find((tr) => /A 27162/.test(p.texto(tr))).click(); await p.espera();
  assert.ok(p.pedidos.includes(`/protected/cob/cartera/documentos/${D27162.documento_id}`));
  const dr = p.$('#cobDrawer');
  assert.notEqual(dr.style.display, 'none');
  assert.match(p.texto(dr), /A 27162/);
  assert.match(p.texto(dr), /13\/10\/2026.*11 días.*20\/10\/2026.*18 días/);
  p.$('#cobDrawerCerrar').click(); await p.espera();
  assert.equal(dr.style.display, 'none');
});

test('selector de corte: solo aplicados y reemplazados; elegir uno lo pide por corte_id', async () => {
  const p = await arranca();
  const ops = p.$$('#cobCorte option').map((o) => o.textContent);
  assert.equal(ops.length, 3);
  assert.match(ops[1], /20\/10\/2026.*reemplazado/i);
  await p.cambia('#cobCorte', K13);
  assert.ok(p.pedidos.includes(`/protected/cob/cartera?corte_id=${K13}`));
});

test('sin cortes cargados: estado vacío; con permiso de carga, liga a Cargar corte', async () => {
  const vacio = { corte: null, documentos: [], fichas: CART.fichas, por_responsable: [] };
  const p = await arranca({ cartera: vacio, permisos: ['cob.cartera.read', 'cob.corte.cargar'] });
  assert.match(p.texto(), /Todavía no hay cortes aplicados/);
  assert.ok(p.$('a[href="/modules/cob/cargar/cargar.html"]'));
  const q = await arranca({ cartera: vacio });
  assert.equal(q.$('a[href="/modules/cob/cargar/cargar.html"]'), null);
});

test('cambio de empresa: vuelve a pedir y no deja datos de la empresa anterior', async () => {
  const p = await arranca();
  p.set({ corte: null, documentos: [], fichas: CART.fichas, por_responsable: [] });
  const antes = p.pedidos.length;
  await p.cambiarEmpresa();
  assert.ok(p.pedidos.length > antes);
  assert.equal(p.filas().length, 0);
  assert.doesNotMatch(p.texto(), /A 23656/);
});

// ── F1b: seguimiento de facturas ────────────────────────────────────────────
const SEGUIR = ['cob.cartera.read', 'cob.seguimiento.write'];
const filaDe = (p, folio) => p.filas().find((tr) => new RegExp(`\\b${folio}\\b`).test(p.texto(tr.querySelector('td[data-col="folio"]') || tr)));
const marcar = async (p, folio) => { const c = filaDe(p, folio).querySelector('input[data-sel]'); c.checked = true; c.dispatchEvent(new p.window.Event('change', { bubbles: true })); await p.espera(); };

test('tabla: columnas Agente y Último seguimiento (en lugar de Resp.); compromiso vencido en rojo', async () => {
  const p = await arranca();
  const ths = p.$$('#cobTabla thead th').map((th) => p.texto(th).replace(/[▲▼]/g, '').trim());
  assert.ok(ths.includes('Agente') && ths.includes('Último seguimiento'));
  assert.ok(!ths.includes('Resp.'));
  const f = filaDe(p, '27162');
  assert.match(p.texto(f), /Marcela G\./);
  assert.match(p.texto(f.querySelector('[data-col="seg"]')), /Seguimiento enviado · 21\/10\/2026/);
  const g = filaDe(p, '27090');
  assert.match(p.texto(g.querySelector('[data-col="seg"]')), /Compromiso 19\/10\/2026 vencido/);
  assert.ok(g.querySelector('[data-col="seg"] .cob-rojo'));
});

test('fichas de seguimiento: Vencido sin seguimiento (87: el cliente fuera de sesión no cuenta) y Compromisos vencidos (1); filtran la tabla', async () => {
  const p = await arranca();
  const t = (k) => p.texto(p.$(`[data-seg] [data-ficha="${k}"]`));
  assert.match(t('sin_seguimiento'), /87/); assert.match(t('sin_seguimiento'), /US\$707,334/); assert.match(t('sin_seguimiento'), /\$1\.90M/);
  assert.match(t('compromiso_vencido'), /Compromisos vencidos\s*1\s*factura · \$58,104/);
  p.$('[data-seg] [data-ficha="compromiso_vencido"]').click(); await p.espera();
  assert.equal(p.filas().length, 1);
  assert.match(p.texto(p.$('#cobChips')), /Ficha: Compromisos vencidos/);
});

test('sin permiso de seguimiento: no hay casillas ni botón de registrar', async () => {
  const p = await arranca();
  assert.equal(p.$('input[data-sel]'), null);
  assert.equal(p.$('#cobRegistrar'), null);
});

test('registrar seguimiento en 2 facturas: exige fecha si la acción la pide y manda el lote', async () => {
  const p = await arranca({ permisos: SEGUIR });
  await marcar(p, '27129'); await marcar(p, '27162');
  const btn = p.$('#cobRegistrar');
  assert.match(p.texto(btn), /Registrar seguimiento \(2\)/);
  assert.equal(btn.disabled, false);
  btn.click(); await p.espera();
  assert.notEqual(p.$('#cobSegModal').style.display, 'none');
  assert.ok(p.pedidos.includes('/protected/cob/acciones'));
  assert.deepEqual(p.$$('#cobSegAccion option').map((o) => o.value).filter(Boolean), ['a-seg', 'a-prog', 'a-otro']);
  p.$('#cobSegAccion').value = 'a-prog'; p.$('#cobSegAccion').dispatchEvent(new p.window.Event('change')); await p.espera();
  p.$('#cobSegTexto').value = 'Programada para pago lunes';
  p.$('#cobSegGuardar').click(); await p.espera();
  assert.equal(p.envios.length, 0);
  assert.match(p.texto(p.$('#cobSegMsg')), /fecha compromiso/i);
  p.$('#cobSegFecha').value = '2026-10-26';
  const antes = p.pedidos.filter((u) => u.startsWith('/protected/cob/cartera')).length;
  p.$('#cobSegGuardar').click(); await p.espera(); await p.espera();
  const e = p.envios.at(-1);
  assert.equal(e.url, '/protected/cob/seguimientos');
  const ids = ['27129', '27162'].map((f) => CART.documentos.find((d) => d.folio === f).documento_id);
  assert.deepEqual(e.body, { documento_ids: ids, accion_id: 'a-prog', texto: 'Programada para pago lunes', fecha_compromiso: '2026-10-26', gestiona: 'cxc' });
  assert.equal(p.$('#cobSegModal').style.display, 'none');
  assert.ok(p.pedidos.filter((u) => u.startsWith('/protected/cob/cartera')).length > antes, 'recarga la cartera');
  assert.equal(p.$$('input[data-sel]:checked').length, 0, 'limpia la selección');
});

test('gestiona el agente: se elige de los agentes de la cartera; si todas las facturas son del mismo, viene seleccionado', async () => {
  const p = await arranca({ permisos: SEGUIR });
  await marcar(p, '27162');
  p.$('#cobRegistrar').click(); await p.espera();
  p.$('#cobSegAccion').value = 'a-seg';
  const r = p.$('input[name="cobSegGestiona"][value="agente"]'); r.checked = true; r.dispatchEvent(new p.window.Event('change', { bubbles: true })); await p.espera();
  assert.equal(p.$('#cobSegAgente').value, 'ag-marc');
  p.$('#cobSegGuardar').click(); await p.espera();
  assert.deepEqual([p.envios.at(-1).body.gestiona, p.envios.at(-1).body.agente_id], ['agente', 'ag-marc']);
});

test('agrupado: la casilla del cliente selecciona todas sus facturas', async () => {
  const p = await arranca({ permisos: SEGUIR });
  const chk = p.$('#cobAgrupar'); chk.checked = true; chk.dispatchEvent(new p.window.Event('change')); await p.espera();
  const g = p.$('#cobTabla tbody tr.g input[data-sel-grupo]');
  g.checked = true; g.dispatchEvent(new p.window.Event('change', { bubbles: true })); await p.espera();
  assert.match(p.texto(p.$('#cobRegistrar')), /Registrar seguimiento \(81\)/);
});

test('ficha de factura: línea de tiempo con cortes y seguimientos; los anulados con su motivo; anular pide motivo', async () => {
  const p = await arranca({ permisos: SEGUIR });
  filaDe(p, '27162').querySelector('td[data-col="folio"]').click(); await p.espera();
  const tl = p.texto(p.$('#cobHistoria'));
  assert.match(tl, /Junta \/ escalamiento.*Prox junta jueves 26 oct, Marce.*compromiso 26\/10\/2026.*Marcela G\./);
  assert.match(tl, /Anulado: Era de otra factura/);
  assert.doesNotMatch(p.texto(p.$('#cobDrawer')), /llegan en la siguiente fase/);
  p.$('[data-anular="s-9"]').click(); await p.espera();
  p.$('#cobAnularGuardar').click(); await p.espera();
  assert.equal(p.envios.length, 0, 'sin motivo no se anula');
  p.$('#cobAnularMotivo').value = 'Se canceló la junta';
  p.$('#cobAnularGuardar').click(); await p.espera();
  assert.deepEqual(p.envios.at(-1), { url: '/protected/cob/seguimientos/s-9/anular', body: { motivo: 'Se canceló la junta' } });
});

test('desde la ficha se registra seguimiento solo para esa factura', async () => {
  const p = await arranca({ permisos: SEGUIR });
  filaDe(p, '27162').querySelector('td[data-col="folio"]').click(); await p.espera();
  p.$('#cobDrawerRegistrar').click(); await p.espera();
  p.$('#cobSegAccion').value = 'a-seg';
  p.$('#cobSegGuardar').click(); await p.espera();
  assert.deepEqual(p.envios.at(-1).body.documento_ids, [D27162.documento_id]);
});

// ── Clientes fuera de la sesión semanal (caso real: Unilever, factoraje) ─────
// Fixture: el cliente 1 cobra por factoraje y está marcado fuera de la sesión.
test('Sesión: por omisión solo los clientes que se revisan; la línea de control dice cuánto queda fuera', async () => {
  const p = await arranca({ sesion: null });
  assert.equal(p.$('#cobSesion').value, 'sesion');
  assert.equal(p.filas().length, 261);
  assert.ok(!p.filas().some((tr) => /CLIENTE 1\b/.test(p.texto(tr))));
  const fuera = p.texto(p.$('#cobFuera'));
  assert.match(fuera, /81 facturas de 1 cliente fuera de la sesión/);
  assert.match(fuera, /US\$530,097\.29/); assert.match(fuera, /\$22,869,671\.73/);
  assert.match(p.texto(p.$('#cobChips')), /Sesión: Solo los que se revisan/);
});

test('Sesión: Todos regresa al total de SAI y marca las facturas fuera de sesión', async () => {
  const p = await arranca({ sesion: null });
  await p.cambia('#cobSesion', 'todos');
  assert.equal(p.filas().length, 342);
  assert.match(p.texto(p.$('#cobControl')), /342 docs · 55 clientes · equivalente en pesos \$99,472,027\.56/);
  const f = p.filas().find((tr) => /A 23913/.test(p.texto(tr)));
  assert.match(p.texto(f), /Fuera de sesión/);
  assert.equal(p.$('#cobFuera'), null, 'con Todos no hace falta la línea de lo que queda fuera');
});

test('Sesión: Excluidos muestra solo esos y se quita con el chip', async () => {
  const p = await arranca({ sesion: null });
  await p.cambia('#cobSesion', 'excluidos');
  assert.equal(p.filas().length, 81);
  assert.match(p.texto(p.$('#cobChips')), /Sesión: Fuera de la sesión/);
  p.$('[data-quitar="cobSesion"]').click(); await p.espera();
  assert.equal(p.$('#cobSesion').value, 'todos');
  assert.equal(p.filas().length, 342);
});

// ── F1.1: Exportar a Excel (lo que se ve en pantalla, en ese orden) ─────────
test('Exportar: manda el corte, las facturas visibles en el orden de la tabla y el recorte; baja el archivo', async () => {
  const p = await arranca({ sesion: null });
  p.$('[data-moneda="USD"] [data-ficha="vencido"]').click(); await p.espera();
  const ids = p.filas().map((tr) => tr.dataset.id);
  assert.ok(ids.length > 0);
  p.$('#cobExportar').click(); await p.espera();
  assert.equal(p.descargas.length, 1);
  const d = p.descargas[0];
  assert.equal(d.url, '/protected/cob/cartera/export');
  assert.equal(d.method, 'POST');
  assert.equal(d.body.corte_id, K20);
  assert.deepEqual(d.body.documento_ids, ids);
  assert.equal(d.body.recorte, 'Sesión: Solo los que se revisan · Ficha: Vencido');
  assert.deepEqual(p.bajados, ['cartera_ADGM_2026-10-21.xlsx']);
});

test('Exportar agrupado por cliente: el orden del archivo es el de los grupos', async () => {
  const p = await arranca();
  p.$('#cobAgrupar').click(); await p.espera();
  const ids = p.$$('#cobTabla tbody tr.r').map((tr) => tr.dataset.id);
  p.$('#cobExportar').click(); await p.espera();
  assert.deepEqual(p.descargas[0].body.documento_ids, ids);
});

test('Exportar sin facturas en el recorte: botón deshabilitado', async () => {
  const p = await arranca();
  await p.cambia('#cobQ', 'no-existe-999');
  assert.equal(p.filas().length, 0);
  assert.equal(p.$('#cobExportar').disabled, true);
});

test('Exportar con error del servidor: avisa con su mensaje y no baja nada', async () => {
  const p = await arranca({ exportFalla: { status: 422, body: { ok: false, code: 'COB_EXPORT_DOCUMENTO_AJENO', message: 'Alguna factura no pertenece a este corte. Recarga la cartera y vuelve a exportar.' } } });
  p.$('#cobExportar').click(); await p.espera();
  assert.deepEqual(p.bajados, []);
  assert.ok(p.toasts.some(([t, m]) => t === 'error' && /no pertenece a este corte/.test(m)));
});

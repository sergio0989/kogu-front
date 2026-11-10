// ============================================================
// tests/clientes-permiso-cobranza.test.mjs
// Clientes · Facturación/CxC edita las pestañas Cobranza y Contactos con
// cob.clientes.write (decisión de Sergio, 10-nov-2026): misma ficha, General
// en solo lectura, sin "Nuevo cliente" ni "Desactivar". El backend rechaza
// (403) cualquier campo fuera de Cobranza, así que la pantalla manda solo eso.
// Regla §16: escrita antes del cambio y mostrada fallando.
// Caso real: ficha de ALYS ALIMENTOS en dev (10-nov): contado, estado de cuenta
// "No aplica", 0 contactos; aquí con los datos de la fixture de la ficha.
// Se corre con: node tests/clientes-permiso-cobranza.test.mjs
// ============================================================
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const verde = [], rojo = [];
const check = async (n, f) => { try { await f(); verde.push(n); } catch (e) { rojo.push([n, String(e.message).split('\n')[0]]); } };
const src = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');

const LISTA = [{ cliente_id: 'c-111', nombre: 'ALYS ALIMENTOS', rfc: 'AAL170824F9A', cve_cte: '222', activo: true }];
const DETALLE = { ...LISTA[0], condicion_pago: 'contado', dias_credito: null, limite_credito: null, moneda_limite: 'MXN', tipo_fecha: 'factura',
  tiene_pass_portal_pago: false, tiene_pass_portal_fact: false, cobro_factoraje: false, envio_edo_cta: 'no_aplica', cob_idioma_edo_cta: 'es',
  responsable_cobranza_id: null, bloqueo_credito: false, bloqueo_motivo: null, cob_revision_sesion: true };
const CONTACTOS = [];
const COB = ['cob.cartera.read', 'cob.clientes.write'];

async function montar({ permisos = [], falla400 = false } = {}) {
  const css = src('assets/styles.css');
  const dom = new JSDOM(`<!doctype html><style>${css}</style><div id="app"><div id="pageContent"></div></div>`, { runScripts: 'outside-only', url: 'https://dev.kogu.ink/modules/core/clientes/clientes.html' });
  const w = dom.window;
  const llamadas = [], toasts = [];
  w.KoguUi = { escapeHtml: (s) => String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])), statusBadge: (v) => v };
  w.KoguShell = { initShell: async (o) => { w.__init = o; return { permissions: permisos }; }, subscribeEmpresaActivaChange: () => {} };
  w.KoguApi = {
    toast: (m, t) => toasts.push([t, m]),
    unwrapRows: (r) => (r && r.data && r.data.rows) || (r && r.data) || r,
    apiFetch: async (path, opt = {}) => {
      const m = opt.method || 'GET'; const body = opt.body ? JSON.parse(opt.body) : null;
      llamadas.push([m, path, body]);
      if (path === '/protected/core/clientes' && m === 'GET') return { data: { rows: LISTA } };
      if (path === '/protected/core/clientes/c-111' && m === 'GET') return { data: DETALLE };
      if (path === '/protected/core/clientes/c-111' && m === 'PUT') {
        if (falla400) { const e = new Error('envio_edo_cta debe ser automatico, manual o no_aplica.'); e.status = 400; throw e; }
        return { data: { ...DETALLE, ...body } };
      }
      if (path === '/protected/core/clientes/c-111/status' && m === 'PUT') return { data: { ...DETALLE, activo: body.activo } };
      if (path === '/protected/core/clientes/c-111/contactos' && m === 'GET') return { data: { rows: CONTACTOS } };
      if (path === '/protected/core/clientes/c-111/contactos' && m === 'POST') return { data: { contacto_id: 'k-2', ...body } };
      if (path === '/protected/core/usuarios') return { data: [{ user_id: 'u-marce', nombre: 'Marcela', activo: true }] };
      throw new Error('ruta no simulada ' + m + ' ' + path);
    },
  };
  w.eval(src('modules/core/clientes/clientes-cobranza.js'));
  w.eval(src('modules/core/clientes/clientes.js'));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  const espera = () => new Promise((r) => setTimeout(r, 30));
  await espera();
  const $ = (id) => w.document.getElementById(id);
  const editar = async () => { w.document.querySelector('.btn-edit').click(); await espera(); };
  // jsdom trata [hidden] como oculto aunque una clase diga display:grid; Chrome
  // NO (asi nacio el bug). Por eso se exige display:none explicito en el estilo.
  const visible = (id) => $(id).style.display !== 'none' && w.getComputedStyle($(id)).display !== 'none';
  const oculta = (id) => $(id).style.display === 'none';
  return { w, $, llamadas, toasts, espera, editar, visible, oculta };
}


await check('la pantalla abre con el permiso del catálogo o con el de cobranza', async () => {
  const t = await montar({ permisos: COB });
  assert.deepEqual([...t.w.__init.requiredPermission], ['screen.catalogos.clientes', 'cob.clientes.write']);   // arreglo de jsdom → de Node
});

await check('con solo cob.clientes.write: sin "Nuevo cliente"; General en solo lectura con aviso; sin "Desactivar"', async () => {
  const t = await montar({ permisos: COB });
  assert.equal(t.$('newBtn').style.display, 'none');
  await t.editar();
  for (const id of ['nombre', 'rfc', 'cveCte', 'activo']) assert.equal(t.$(id).disabled, true, id);
  assert.match(t.$('clSoloLectura').textContent, /solo lectura/i);
  assert.ok(t.visible('clSoloLectura'));
  assert.equal(t.$('statusBtn').style.display, 'none');
});

await check('con solo cob.clientes.write: guardar manda solo lo que cambió de Cobranza (Alys a envío Manual)', async () => {
  const t = await montar({ permisos: COB });
  await t.editar();
  t.$('cb_envio_edo_cta').value = 'manual';
  t.$('saveBtn').click(); await t.espera();
  const put = t.llamadas.filter(([m, p]) => m === 'PUT' && p === '/protected/core/clientes/c-111');
  assert.equal(put.length, 1);
  assert.deepEqual(put[0][2], { envio_edo_cta: 'manual' });
});

await check('con solo cob.clientes.write: sin cambios no manda nada y lo dice', async () => {
  const t = await montar({ permisos: COB });
  await t.editar();
  t.$('saveBtn').click(); await t.espera();
  assert.equal(t.llamadas.filter(([m]) => m === 'PUT').length, 0);
  assert.ok(t.toasts.some(([, m]) => /no hay cambios/i.test(m)));
});

await check('con solo cob.clientes.write: agrega el contacto que recibe el estado de cuenta', async () => {
  const t = await montar({ permisos: COB });
  await t.editar();
  t.$('ctAgregar').click();
  t.$('ct_nombre').value = 'Pagos Alys'; t.$('ct_email').value = 'pagos@alys.com.mx'; t.$('ct_rol').value = 'pagos';
  t.$('ct_recibe_edo_cta').checked = true;
  t.$('ctGuardar').click(); await t.espera();
  const post = t.llamadas.find(([m, p]) => m === 'POST' && p === '/protected/core/clientes/c-111/contactos');
  assert.ok(post);
  assert.equal(post[2].recibe_edo_cta, true);
});

await check('con el permiso del catálogo: todo como antes (General editable, Nuevo y Desactivar visibles)', async () => {
  const t = await montar({ permisos: ['screen.catalogos.clientes', 'cob.clientes.write'] });
  assert.notEqual(t.$('newBtn').style.display, 'none');
  await t.editar();
  assert.equal(t.$('nombre').disabled, false);
  assert.ok(!t.$('clSoloLectura') || t.$('clSoloLectura').style.display === 'none');
  t.$('saveBtn').click(); await t.espera();
  const put = t.llamadas.find(([m, p]) => m === 'PUT' && p === '/protected/core/clientes/c-111');
  assert.equal(put[2].nombre, 'ALYS ALIMENTOS');
});

console.log(`VERDE (${verde.length}):`); verde.forEach((n) => console.log('  ✓', n));
console.log(`ROJO (${rojo.length}):`); rojo.forEach(([n, m]) => console.log('  ✗', n, '\n     ', m));
if (rojo.length) process.exit(1);

// ============================================================
// tests/cfdi-alertas-correos-empresas-render.test.mjs
// Empresas · "Correos alertas CFDI" (lista con Quitar / Agregar correo).
//
// Regla §16.4: escrita antes del cambio y mostrada fallando.
// Caso real (Sergio, 06-nov-2026): la alerta de IVA exento de ADGM (BANCO BASE)
// llegó a 8 cuentas. Decisión: "que sea un atributo de la empresa, correos
// alertas cfdi", con la forma de Configuración de cobranza (captura de Sergio).
// Backend: core_empresas.cfdi_correos_alertas (rama feature/cfdi-alertas-correos, 811fccc).
// Se corre con: cd tests && node cfdi-alertas-correos-empresas-render.test.mjs
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

const ARCHIVO = new URL('../modules/core/empresas/empresas.js', import.meta.url).pathname;

const EMPRESAS = [
  { empresa_id: 'e1', clave_empresa: 'ADGM', nombre_corto: 'ADEGERMEX', razon_social: 'ADEGERMEX SA', rfc: 'ADE8703309B6',
    status: 'activa', activo: true, cfdi_descarga_auto: true,
    cfdi_correos_alertas: ['cxp@adegermex.com.mx', 'sergio_juarez@adegermex.com.mx'] },
  { empresa_id: 'e2', clave_empresa: 'CPK', nombre_corto: 'COPACK', razon_social: 'COPACK SA', rfc: 'GCO010101AAA',
    status: 'activa', activo: true, cfdi_descarga_auto: true, cfdi_correos_alertas: [] },
];

async function arranca() {
  const js = fs.readFileSync(ARCHIVO, 'utf8');
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div></body></html>',
    { url: 'https://kogu.test/modules/core/empresas/empresas.html', runScripts: 'outside-only' });
  const { window } = dom;
  const pedidos = [];
  window.KoguShell = {
    initShell: async () => {
      const d = window.document.createElement('div');
      d.id = 'pageContent';
      window.document.getElementById('app').appendChild(d);
      return { ok: true, permisos: ['screen.root.index'] };
    },
  };
  window.KoguApi = {
    apiFetch: async (url, opts = {}) => {
      pedidos.push({ url, opts });
      if (url === '/protected/core/empresas' && !opts.method) return { ok: true, data: { rows: EMPRESAS } };
      return { ok: true, data: { rows: [] } };
    },
    unwrapRows: (r) => r?.data?.rows || [],
    toast: () => {},
  };
  window.KoguUi = {
    escapeHtml: (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    statusBadge: (s) => `<span class="badge">${s}</span>`,
  };
  window.eval(js);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  await new Promise((r) => setTimeout(r, 300));
  const doc = window.document;
  const fila = (txt) => [...doc.querySelectorAll('#rows tr')].find((tr) => tr.textContent.includes(txt));
  const inputs = () => [...doc.querySelectorAll('#cfdiCorreosLista input')];
  const guardar = async () => { doc.getElementById('saveBtn').click(); await new Promise((r) => setTimeout(r, 100)); };
  const put = () => pedidos.filter((p) => p.opts.method === 'PUT').pop();
  return { window, doc, pedidos, fila, inputs, guardar, put };
}

await check('el formulario tiene la sección "Correos alertas CFDI" con Agregar correo', async () => {
  const { doc } = await arranca();
  assert.ok(doc.getElementById('cfdiCorreosLista'), 'no hay #cfdiCorreosLista');
  assert.ok(doc.getElementById('cfdiCorreosAgregar'), 'no hay botón Agregar correo');
  assert.match(doc.getElementById('pageContent').textContent, /Correos alertas CFDI/);
});

await check('al abrir la pantalla (alta) ya hay un renglón vacío y la vista previa', async () => {
  const { doc, inputs } = await arranca();
  assert.deepEqual(inputs().map((i) => i.value), ['']);
  assert.match(doc.getElementById('cfdiCorreosVista').textContent, /usuarios con permiso/i);
});

await check('al editar ADGM se ven sus dos correos, cada uno con Quitar', async () => {
  const { fila, inputs, doc } = await arranca();
  fila('ADEGERMEX').querySelector('.btn-edit').click();
  assert.deepEqual(inputs().map((i) => i.value), ['cxp@adegermex.com.mx', 'sergio_juarez@adegermex.com.mx']);
  assert.equal(doc.querySelectorAll('#cfdiCorreosLista [data-quitar]').length, 2);
});

await check('la vista previa dice a quién llega; sin correos explica el respaldo por permiso', async () => {
  const { fila, doc } = await arranca();
  fila('ADEGERMEX').querySelector('.btn-edit').click();
  assert.match(doc.getElementById('cfdiCorreosVista').textContent, /cxp@adegermex\.com\.mx, sergio_juarez@adegermex\.com\.mx/);
  fila('COPACK').querySelector('.btn-edit').click();
  assert.match(doc.getElementById('cfdiCorreosVista').textContent, /usuarios con permiso/i);
});

await check('Quitar + Agregar correo y Guardar mandan la lista limpia en el PUT', async () => {
  const { window, doc, fila, inputs, guardar, put } = await arranca();
  fila('ADEGERMEX').querySelector('.btn-edit').click();
  doc.querySelector('#cfdiCorreosLista [data-quitar="0"]').click();          // quita cxp@
  doc.getElementById('cfdiCorreosAgregar').click();
  const nuevo = inputs().pop();
  nuevo.value = ' CxP.Ade@Adegermex.com.mx ';
  nuevo.dispatchEvent(new window.Event('input', { bubbles: true }));
  await guardar();
  assert.ok(put(), 'no hubo PUT');
  assert.deepEqual(JSON.parse(put().opts.body).cfdi_correos_alertas,
    ['sergio_juarez@adegermex.com.mx', 'cxp.ade@adegermex.com.mx']);
});

await check('un correo mal escrito no se guarda y avisa', async () => {
  const { window, doc, fila, inputs, guardar, put } = await arranca();
  fila('COPACK').querySelector('.btn-edit').click();
  const i = inputs()[0];
  i.value = 'mal@';
  i.dispatchEvent(new window.Event('input', { bubbles: true }));
  await guardar();
  assert.ok(!put(), 'mandó el PUT con un correo inválido');
  assert.match(doc.getElementById('cfdiCorreosMsg').textContent, /mal@/);
});

await check('máximo 10: el botón Agregar correo se desactiva', async () => {
  const { doc, fila } = await arranca();
  fila('COPACK').querySelector('.btn-edit').click();
  for (let k = 0; k < 12; k++) doc.getElementById('cfdiCorreosAgregar').click();
  assert.equal(doc.querySelectorAll('#cfdiCorreosLista input').length, 10);
  assert.equal(doc.getElementById('cfdiCorreosAgregar').disabled, true);
});

await check('Limpiar (alta nueva) deja la lista vacía', async () => {
  const { doc, fila, inputs } = await arranca();
  fila('ADEGERMEX').querySelector('.btn-edit').click();
  doc.getElementById('clearBtn').click();
  assert.deepEqual(inputs().map((i) => i.value), ['']);
});

console.log(`\n${'='.repeat(70)}`);
verde.forEach(n => console.log(`  VERDE  ${n}`));
rojo.forEach(([n, m]) => console.log(`  ROJO   ${n}\n           ${m}`));
console.log(`${'='.repeat(70)}`);
console.log(`  ${verde.length} en verde, ${rojo.length} en rojo\n`);
process.exit(rojo.length ? 1 : 0);

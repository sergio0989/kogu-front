// ============================================================
// tests/cto-requisiciones-render.test.mjs
// Costo · Precios de requisiciones — lista y alta (subir el Excel de Co-Pack).
// Regla §16: escrita antes de la pantalla y mostrada fallando.
// Datos: GET /protected/cto/requisiciones real (931 calculada, 932 recibida)
// y el Excel real REQUISICION 932.xlsx (su titulo dice 931).
// Se corre con: node --test tests/cto-requisiciones-render.test.mjs
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import fs from 'node:fs';

const JS = fs.readFileSync(new URL('../modules/cto/requisiciones.js', import.meta.url), 'utf8');
const COMUN = fs.readFileSync(new URL('../modules/cto/requisiciones-comun.js', import.meta.url), 'utf8');
const API = JSON.parse(fs.readFileSync(new URL('./fixtures/cto-req-api-respuestas.json', import.meta.url)));
const ROWS_932 = JSON.parse(fs.readFileSync(new URL('./fixtures/cto-req-932-rows.json', import.meta.url)));
const ESCR = ['screen.cto.requisiciones', 'cto.requisiciones.read', 'cto.requisiciones.write'];
const hoyLocal = () => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };

async function arranca({ perms = ESCR } = {}) {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div></body></html>',
    { url: 'https://kogu.test/modules/cto/requisiciones.html', runScripts: 'outside-only' });
  const { window } = dom;
  const pedidos = [];
  window.KoguShell = {
    initShell: async (o) => {
      window.__init = o;
      const d = window.document.createElement('div'); d.id = 'pageContent';
      window.document.getElementById('app').appendChild(d);
      return { ok: true, permissions: perms };
    },
    hasPerm: (b, p) => (b?.permissions || []).includes(p),
    subscribeEmpresaActivaChange: (fn) => { window.__cambioEmpresa = fn; },
  };
  window.KoguApi = {
    apiFetch: async (u, o = {}) => {
      pedidos.push({ u, o, body: o.body ? JSON.parse(o.body) : undefined });
      if (u.startsWith('/protected/cto/requisiciones?') || u === '/protected/cto/requisiciones') {
        if (o.method === 'POST') return { ok: true, data: API.alta_932 };
        return { ok: true, data: API.listar };
      }
      throw new Error('ruta no esperada ' + u);
    },
    toast: (m) => { window.__toast = m; },
  };
  window.KoguUi = { escapeHtml: (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') };
  window.XLSX = { read: () => ({ SheetNames: ['Hoja3'], Sheets: { Hoja3: {} } }), utils: { sheet_to_json: () => ROWS_932 } };
  window.__kogu_ir = (u) => { window.__fuiA = u; };
  window.eval(COMUN);
  window.eval(JS);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  await new Promise((r) => setTimeout(r, 120));
  const $ = (s) => window.document.querySelector(s);
  const texto = (el) => (el || window.document.getElementById('app')).textContent.replace(/\s+/g, ' ');
  const espera = () => new Promise((r) => setTimeout(r, 80));
  const ultimo = (re) => pedidos.filter((p) => re.test(p.u)).at(-1);
  const elegir = async (nombre = 'REQUISICION 932.xlsx') => {
    const f = new window.File([new Uint8Array([80, 75, 3, 4])], nombre);
    f.arrayBuffer = async () => new ArrayBuffer(4);
    Object.defineProperty($('#nuevaArchivo'), 'files', { value: [f], configurable: true });
    $('#nuevaArchivo').dispatchEvent(new window.Event('change'));
    await espera(); await espera();
  };
  return { window, pedidos, $, texto, espera, ultimo, elegir };
}

test('lista: permiso, filas con estatus y avance, enlace al detalle', async () => {
  const p = await arranca();
  assert.equal(p.window.__init.requiredPermission, 'screen.cto.requisiciones');
  assert.equal(p.window.__init.currentPage, '/modules/cto/requisiciones.html');
  const filas = p.window.document.querySelectorAll('#reqLista tr[data-id]');
  assert.equal(filas.length, 2);
  const r931 = [...filas].find((f) => /931/.test(f.textContent));
  assert.match(p.texto(r931), /931.*CO-PACK.*Calculada.*8.*2 sin precio/);
  const id931 = API.listar.rows.find((r) => r.num_requisicion === '931').requisicion_id;
  assert.equal(r931.querySelector('a').getAttribute('href'), `/modules/cto/requisicion-detalle.html?id=${id931}`);
});

test('filtro por estatus y busqueda van al backend', async () => {
  const p = await arranca();
  p.$('#fStatus').value = 'calculada';
  p.$('#fQ').value = '93';
  p.$('#btnBuscar').click(); await p.espera();
  const r = p.ultimo(/^\/protected\/cto\/requisiciones\?/);
  const qs = new URLSearchParams(r.u.split('?')[1]);
  assert.equal(qs.get('status'), 'calculada');
  assert.equal(qs.get('q'), '93');
});

test('nueva: al elegir la 932 propone el numero del archivo y avisa que el titulo dice 931', async () => {
  const p = await arranca();
  p.$('#btnNueva').click(); await p.espera();
  assert.equal(p.$('#nuevaFecha').value, hoyLocal());
  assert.equal(p.$('#nuevaSolicitante').value, 'CO-PACK');
  await p.elegir();
  assert.equal(p.$('#nuevaNum').value, '932');
  const t = p.texto(p.$('#nuevaInfo'));
  assert.match(t, /3 partidas/);
  assert.match(t, /título.*931/i);
});

test('nueva: manda numero, filas y archivo; luego abre el detalle', async () => {
  const p = await arranca();
  p.$('#btnNueva').click(); await p.espera();
  await p.elegir();
  p.$('#btnCrear').click(); await p.espera();
  const r = p.ultimo(/^\/protected\/cto\/requisiciones$/);
  assert.equal(r.o.method, 'POST');
  assert.deepEqual(r.body, { num_requisicion: '932', rows: ROWS_932, archivo_nombre: 'REQUISICION 932.xlsx',
    fecha_recepcion: hoyLocal(), solicitante: 'CO-PACK' });
  assert.equal(p.window.__fuiA, `/modules/cto/requisicion-detalle.html?id=${API.alta_932.requisicion.requisicion_id}`);
});

test('nueva: sin archivo o sin numero no se envia', async () => {
  const p = await arranca();
  p.$('#btnNueva').click(); await p.espera();
  p.$('#btnCrear').click(); await p.espera();
  assert.equal(p.ultimo(/^\/protected\/cto\/requisiciones$/), undefined);
  assert.match(p.texto(p.$('#nuevaMsg')), /archivo/i);
  await p.elegir('lista copack.xlsx');
  p.$('#nuevaNum').value = '';
  p.$('#btnCrear').click(); await p.espera();
  assert.equal(p.ultimo(/^\/protected\/cto\/requisiciones$/), undefined);
  assert.match(p.texto(p.$('#nuevaMsg')), /número/i);
});

test('solo lectura: no hay boton de nueva requisicion', async () => {
  const p = await arranca({ perms: ['screen.cto.requisiciones', 'cto.requisiciones.read'] });
  assert.equal(p.$('#btnNueva'), null);
});

test('al cambiar de empresa vuelve a cargar la lista', async () => {
  const p = await arranca();
  const antes = p.pedidos.length;
  await p.window.__cambioEmpresa(); await p.espera();
  assert.ok(p.pedidos.length > antes);
});

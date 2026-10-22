// ============================================================
// tests/cob-cargar-render.test.mjs
// Cobranza F1 · Cargar corte (Facturación, viernes en la tarde).
// Regla §16: escrita antes de la pantalla y mostrada fallando.
// Datos: respuesta real de POST /protected/cob/cortes/preview (servicio del
// backend con el export SAI del 20-oct-2026 anonimizado), que reemplaza un
// corte ya aplicado: 1 factura nueva, 1 que salió y 1 que cambió de saldo.
// Se corre con: node --test tests/cob-cargar-render.test.mjs
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const JS = fs.readFileSync(new URL('../modules/cob/cargar/cargar.js', import.meta.url), 'utf8');
const COMUN = fs.readFileSync(new URL('../modules/cob/cob-comun.js', import.meta.url), 'utf8');
const PV = JSON.parse(fs.readFileSync(new URL('./fixtures/cob-preview-20261020.json', import.meta.url)));
const C = require('../modules/cob/cob-comun.js');
const KID = PV.corte.corte_id;
const HISTORIAL = [
  { corte_id: KID, fecha_corte: '2026-10-20', status: 'preview', docs: 342, saldo_mxn: '99472027.56', archivo_nombre: 'CxC SAI 20-oct.xlsx', created_at: '2026-10-22T19:00:00Z' },
  { corte_id: '22222222-2222-4222-8222-222222222222', fecha_corte: '2026-10-20', status: 'aplicado', docs: 342, saldo_mxn: '99472027.56', created_at: '2026-10-20T19:00:00Z' },
];
const hoyLocal = () => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
const err = (status, code, message) => Object.assign(new Error(message), { status, code });

async function arranca({ url = 'https://kogu.test/modules/cob/cargar/cargar.html', preview = PV, obtener = null, falla = null } = {}) {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div></body></html>', { url, runScripts: 'outside-only' });
  const { window } = dom;
  const pedidos = [];
  window.KoguShell = {
    initShell: async (o) => {
      window.__init = o;
      const d = window.document.createElement('div'); d.id = 'pageContent';
      window.document.getElementById('app').appendChild(d);
      return { ok: true, permissions: ['cob.corte.cargar', 'cob.cartera.read'] };
    },
    subscribeEmpresaActivaChange: () => {},
  };
  window.KoguApi = {
    apiFetch: async (u, o = {}) => {
      pedidos.push({ u, o });
      if (falla && falla.ruta.test(u)) throw falla.error;
      if (u.startsWith('/protected/cob/cortes?')) return { ok: true, data: HISTORIAL };
      if (u === '/protected/cob/cortes/preview') return { ok: true, data: preview };
      if (/\/aplicar$/.test(u)) return { ok: true, data: { ...PV.corte, status: 'aplicado' } };
      if (/\/descartar$/.test(u)) return { ok: true, data: { ...PV.corte, status: 'descartado' } };
      if (u.startsWith('/protected/cob/cortes/')) return { ok: true, data: obtener };
      throw new Error('ruta no esperada ' + u);
    },
    toast: (m) => { window.__toast = m; },
  };
  window.KoguUi = { escapeHtml: (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') };
  window.eval(COMUN);
  window.eval(JS);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  await new Promise((r) => setTimeout(r, 120));
  const $ = (s) => window.document.querySelector(s);
  const texto = (el = window.document.getElementById('app')) => el.textContent.replace(/\s+/g, ' ');
  const espera = () => new Promise((r) => setTimeout(r, 60));
  const ponerArchivo = () => {
    const f = new window.File([new Uint8Array([80, 75, 3, 4])], 'CxC SAI 20-oct.xlsx');
    Object.defineProperty($('#cobArchivo'), 'files', { value: [f], configurable: true });
    $('#cobArchivo').dispatchEvent(new window.Event('change'));
  };
  const previsualizar = async () => { ponerArchivo(); $('#cobPreviewBtn').click(); await espera(); };
  const ultimo = (re) => pedidos.filter((p) => re.test(p.u)).at(-1);
  return { window, pedidos, $, texto, espera, ponerArchivo, previsualizar, ultimo };
}

test('exige cob.corte.cargar; fecha por omisión = viernes más reciente; muestra el historial', async () => {
  const p = await arranca();
  assert.equal(p.window.__init.requiredPermission, 'cob.corte.cargar');
  assert.equal(p.window.__init.currentPage, '/modules/cob/cargar/cargar.html');
  assert.equal(p.$('#cobFecha').value, C.viernesMasReciente(hoyLocal()));
  assert.match(p.texto(p.$('#cobHistorial')), /20\/10\/2026.*Vista previa.*20\/10\/2026.*Aplicado/);
});

test('sin archivo no se envía nada', async () => {
  const p = await arranca();
  p.$('#cobPreviewBtn').click(); await p.espera();
  assert.equal(p.ultimo(/preview/), undefined);
  assert.match(p.texto(p.$('#cobMsg')), /Elige el archivo/);
});

test('vista previa: manda archivo y fecha en FormData', async () => {
  const p = await arranca();
  p.$('#cobFecha').value = '2026-10-20';
  await p.previsualizar();
  const r = p.ultimo(/\/cortes\/preview$/);
  assert.equal(r.o.method, 'POST');
  assert.ok(r.o.body instanceof p.window.FormData);
  assert.equal(r.o.body.get('fecha_corte'), '2026-10-20');
  assert.equal(r.o.body.get('archivo').name, 'CxC SAI 20-oct.xlsx');
});

test('resumen: totales por antigüedad iguales a SAI, documentos y clientes', async () => {
  const p = await arranca();
  await p.previsualizar();
  const t = p.texto(p.$('#cobResumen'));
  assert.match(t, /342 documentos · 55 clientes/);
  assert.match(t, /Por vencer.*\$82,687,067\.45/);
  assert.match(t, /\+90.*\$4,336,659\.76/);
  assert.match(t, /Total.*\$99,472,027\.56/);
  assert.match(t, /Cuadra con los totales y la antigüedad de SAI renglón por renglón/);
});

test('clientes sin catalogar: se listan con su saldo', async () => {
  const p = await arranca();
  await p.previsualizar();
  const t = p.texto(p.$('#cobSinCatalogo'));
  assert.match(t, /50 clientes sin catalogar/);   // fixture: 5 de 55 claves en el catálogo de prueba
  assert.match(t, new RegExp(PV.resumen.sin_catalogo[0].nom_cte_sai));
});

test('comparación con el corte anterior: nuevas, salieron y cambiaron', async () => {
  const p = await arranca();
  await p.previsualizar();
  const t = p.texto(p.$('#cobComparacion'));
  assert.match(t, /contra el corte del 20\/10\/2026/);
  assert.match(t, /1 nueva/); assert.match(t, /A 27433/);
  assert.match(t, /1 salió/); assert.match(t, /A 26999/);
  assert.match(t, /1 cambió de saldo/); assert.match(t, /A 27162.*3,000\.00.*2,530\.00/);
});

test('reemplazo: pide motivo antes de aplicar y lo manda', async () => {
  const p = await arranca();
  await p.previsualizar();
  assert.match(p.texto(p.$('#cobAcciones')), /Ya hay un corte aplicado al 20\/10\/2026/);
  p.$('#cobAplicar').click(); await p.espera();
  assert.equal(p.ultimo(/aplicar$/), undefined);
  assert.match(p.texto(p.$('#cobMsg')), /motivo/i);
  p.$('#cobMotivo').value = 'Se exportó antes del cierre';
  p.$('#cobAplicar').click(); await p.espera();
  const r = p.ultimo(/aplicar$/);
  assert.equal(r.u, `/protected/cob/cortes/${KID}/aplicar`);
  assert.deepEqual(JSON.parse(r.o.body), { motivo: 'Se exportó antes del cierre' });
  assert.match(p.texto(p.$('#cobMsg')), /Corte aplicado/);
  assert.ok(p.$('a[href="/modules/cob/cartera/cartera.html"]'));
});

test('sin reemplazo no pide motivo', async () => {
  const p = await arranca({ preview: { ...PV, resumen: { ...PV.resumen, reemplaza: null } } });
  await p.previsualizar();
  assert.equal(p.$('#cobMotivo'), null);
  p.$('#cobAplicar').click(); await p.espera();
  assert.deepEqual(JSON.parse(p.ultimo(/aplicar$/).o.body), {});
});

test('diferencias contra SAI: se muestran y hay que confirmar la revisión', async () => {
  const dif = [{ linea: 7, documento: 'A 27000', saldo_mxn: 100, total_sai_mxn: 90 }];
  const p = await arranca({ preview: { ...PV, resumen: { ...PV.resumen, reemplaza: null, diferencias_importe: dif } } });
  await p.previsualizar();
  assert.match(p.texto(p.$('#cobResumen')), /1 renglón no cuadra con SAI.*A 27000/);
  p.$('#cobAplicar').click(); await p.espera();
  assert.equal(p.ultimo(/aplicar$/), undefined);
  p.$('#cobConfirmarDif').checked = true;
  p.$('#cobAplicar').click(); await p.espera();
  assert.deepEqual(JSON.parse(p.ultimo(/aplicar$/).o.body), { confirmar_diferencias: true });
});

test('mismo archivo ya aplicado: advertencia visible', async () => {
  const adv = [{ code: 'COB_CORTE_MISMO_ARCHIVO', mensaje: 'Este mismo archivo ya se aplicó en el corte del 2026-10-13.' }];
  const p = await arranca({ preview: { ...PV, advertencias: adv } });
  await p.previsualizar();
  assert.match(p.texto(p.$('#cobAdvertencias')), /Este mismo archivo ya se aplicó/);
});

test('descartar la vista previa', async () => {
  const p = await arranca();
  await p.previsualizar();
  p.$('#cobDescartar').click(); await p.espera();
  assert.equal(p.ultimo(/descartar$/).u, `/protected/cob/cortes/${KID}/descartar`);
  assert.match(p.texto(p.$('#cobMsg')), /descartad/i);
  assert.equal(p.$('#cobAplicar'), null);
});

test('error del archivo (columnas que no son del reporte): mensaje del backend en pantalla', async () => {
  const e = err(422, 'COB_CXC_ENCABEZADOS', 'El archivo no tiene las columnas esperadas del reporte de SAI: faltan Saldo_fac.');
  const p = await arranca({ falla: { ruta: /preview$/, error: e } });
  await p.previsualizar();
  assert.match(p.texto(p.$('#cobMsg')), /faltan Saldo_fac/);
  assert.equal(p.$('#cobAplicar'), null);
});

test('retomar una vista previa por ?corte_id', async () => {
  const obtener = { ...PV.corte, resumen: PV.resumen };
  const p = await arranca({ url: `https://kogu.test/modules/cob/cargar/cargar.html?corte_id=${KID}`, obtener });
  assert.ok(p.pedidos.some((x) => x.u === `/protected/cob/cortes/${KID}`));
  assert.match(p.texto(p.$('#cobResumen')), /342 documentos/);
  assert.ok(p.$('#cobAplicar'));
});

// ── Fecha de corte equivocada (caso real 22-oct: export del 22 cargado con la
//    fecha por omisión, viernes 16; la pantalla decía "cuadra con SAI") ───────
const DIF_B = [
  { linea: 8, documento: 'A 27280', bucket_sai: 1, bucket_kogu: 2, dias_vencido: 6 },
  { linea: 180, documento: 'A 26773', bucket_sai: 2, bucket_kogu: 3, dias_vencido: 36 },
];
const PV_FECHA_MAL = { ...PV, corte: { ...PV.corte, fecha_corte: '2026-10-16' },
  resumen: { ...PV.resumen, reemplaza: null, diferencias_bucket: DIF_B, fecha_sugerida: '2026-10-22' } };

test('antigüedad distinta a SAI: aviso con la fecha que cuadra; no dice "cuadra con SAI"', async () => {
  const p = await arranca({ preview: PV_FECHA_MAL });
  await p.previsualizar();
  const t = p.texto(p.$('#cobResumen'));
  assert.match(t, /En 2 facturas la antigüedad no coincide con SAI/);
  assert.match(t, /22\/10\/2026/);
  assert.doesNotMatch(t, /Cuadra con los totales de SAI/);
  assert.ok(p.$('#cobUsarSugerida'));
});

test('"Usar fecha sugerida": descarta la vista previa y la repite con esa fecha', async () => {
  const p = await arranca({ preview: PV_FECHA_MAL });
  p.$('#cobFecha').value = '2026-10-16';
  await p.previsualizar();
  p.$('#cobUsarSugerida').click(); await p.espera(); await p.espera();
  assert.equal(p.ultimo(/descartar$/).u, `/protected/cob/cortes/${KID}/descartar`);
  assert.equal(p.$('#cobFecha').value, '2026-10-22');
  const previews = p.pedidos.filter((x) => /\/cortes\/preview$/.test(x.u));
  assert.equal(previews.length, 2);
  assert.equal(previews[1].o.body.get('fecha_corte'), '2026-10-22');
});

test('aplicar con antigüedad distinta exige confirmar', async () => {
  const p = await arranca({ preview: PV_FECHA_MAL });
  await p.previsualizar();
  p.$('#cobAplicar').click(); await p.espera();
  assert.equal(p.ultimo(/aplicar$/), undefined);
  p.$('#cobConfirmarDif').checked = true;
  p.$('#cobAplicar').click(); await p.espera();
  assert.deepEqual(JSON.parse(p.ultimo(/aplicar$/).o.body), { confirmar_diferencias: true });
});

test('después de aplicar: el resultado y la liga a la Cartera junto a los botones; el título ya no dice vista previa', async () => {
  const p = await arranca({ preview: { ...PV, resumen: { ...PV.resumen, reemplaza: null } } });
  await p.previsualizar();
  p.$('#cobAplicar').click(); await p.espera();
  const acc = p.$('#cobAcciones');
  assert.match(p.texto(acc), /Corte aplicado/);
  assert.ok(acc.querySelector('a[href="/modules/cob/cartera/cartera.html"]'));
  assert.doesNotMatch(p.texto(p.$('#cobResumen .eyebrow')), /Vista previa/i);
  assert.match(p.texto(p.$('#cobResumen .eyebrow')), /Aplicado/);
});

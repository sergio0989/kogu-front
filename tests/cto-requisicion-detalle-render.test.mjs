// ============================================================
// tests/cto-requisicion-detalle-render.test.mjs
// Costo · Precios de requisiciones — pantalla de detalle.
// Regla §16: escrita antes de la pantalla y mostrada fallando.
// Datos: respuestas REALES del backend para la 931 (calculada, WWP0685 con
// precio a mano) y la 932 (recibida, titulo del archivo dice 931).
// Se corre con: node --test tests/cto-requisicion-detalle-render.test.mjs
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import fs from 'node:fs';

const JS = fs.readFileSync(new URL('../modules/cto/requisicion-detalle.js', import.meta.url), 'utf8');
const COMUN = fs.readFileSync(new URL('../modules/cto/requisiciones-comun.js', import.meta.url), 'utf8');
const API = JSON.parse(fs.readFileSync(new URL('./fixtures/cto-req-api-respuestas.json', import.meta.url)));
const ROWS_932 = JSON.parse(fs.readFileSync(new URL('./fixtures/cto-req-932-rows.json', import.meta.url)));
const DET = API.detalle_931_calculada;
const RID = DET.requisicion.requisicion_id;
const TODOS = ['screen.cto.requisiciones', 'cto.requisiciones.read', 'cto.requisiciones.write', 'cto.requisiciones.aprobar'];
const clon = (o) => JSON.parse(JSON.stringify(o));

async function arranca({ det = DET, perms = TODOS, id = RID } = {}) {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div></body></html>',
    { url: `https://kogu.test/modules/cto/requisicion-detalle.html?id=${id}`, runScripts: 'outside-only' });
  const { window } = dom;
  const pedidos = [];
  let actual = clon(det);
  window.KoguShell = {
    initShell: async (o) => {
      window.__init = o;
      const d = window.document.createElement('div'); d.id = 'pageContent';
      window.document.getElementById('app').appendChild(d);
      return { ok: true, permissions: perms };
    },
    hasPerm: (b, p) => (b?.permissions || []).includes(p),
    subscribeEmpresaActivaChange: () => {},
  };
  window.KoguApi = {
    apiFetch: async (u, o = {}) => {
      pedidos.push({ u, o, body: o.body ? JSON.parse(o.body) : undefined });
      const base = `/protected/cto/requisiciones/${actual.requisicion.requisicion_id}`;
      if (u === base && !o.method) return { ok: true, data: actual };
      if (u === `${base}/calcular`) { actual.requisicion.status = 'calculada'; return { ok: true, data: API.calcular_931 }; }
      if (u === `${base}/aprobar`) { actual.requisicion.status = 'aprobada'; return { ok: true, data: actual.requisicion }; }
      if (u === `${base}/enviada`) { actual.requisicion.status = 'enviada'; return { ok: true, data: actual.requisicion }; }
      if (u === `${base}/lotes`) return { ok: true, data: { actualizadas: 2, sin_cambio: 6, avisos: [] } };
      if (u.startsWith(`${base}/partidas/`)) {
        const p = actual.partidas.find((x) => u.endsWith(x.partida_id));
        const b = JSON.parse(o.body);
        Object.assign(p, { precio_final: b.precio_final, es_manual: b.precio_final !== p.precio_sugerido,
          motivo_manual: b.motivo ?? null });
        if (b.iva_final !== undefined) {
          Object.assign(p, { iva_final: b.iva_final, iva_origen: 'manual',
            banderas: (p.banderas || []).filter((x) => x !== 'iva_por_confirmar') });
        }
        return { ok: true, data: p };
      }
      throw new Error('ruta no esperada ' + u);
    },
    authFetchRaw: async (u) => { pedidos.push({ u, raw: true }); return { ok: true, blob: async () => new window.Blob(['PK']) }; },
    toast: (m) => { window.__toast = m; },
  };
  window.KoguUi = { escapeHtml: (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') };
  window.URL.createObjectURL = () => 'blob:x';
  window.URL.revokeObjectURL = () => {};
  window.XLSX = {
    read: () => ({ SheetNames: ['Hoja3'], Sheets: { Hoja3: {} } }),
    utils: { sheet_to_json: () => window.__rowsXlsx },
  };
  window.eval(COMUN);
  window.eval(JS);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  await new Promise((r) => setTimeout(r, 120));
  const $ = (s) => window.document.querySelector(s);
  const texto = (el) => (el || window.document.getElementById('app')).textContent.replace(/\s+/g, ' ');
  const espera = () => new Promise((r) => setTimeout(r, 80));
  const fila = (ren) => $(`#reqTabla tr[data-renglon="${ren}"]`);
  const ultimo = (re) => pedidos.filter((p) => re.test(p.u)).at(-1);
  return { window, pedidos, $, texto, espera, fila, ultimo };
}

test('pide screen.cto.requisiciones, resalta la lista en el menu y carga la requisicion del ?id', async () => {
  const p = await arranca();
  assert.equal(p.window.__init.requiredPermission, 'screen.cto.requisiciones');
  assert.equal(p.window.__init.currentPage, '/modules/cto/requisiciones.html');
  assert.equal(p.pedidos[0].u, `/protected/cto/requisiciones/${RID}`);
  assert.match(p.texto(p.$('#reqTitulo')), /Requisición 931/);
  assert.match(p.texto(p.$('#reqChips')), /Calculada/);
  assert.match(p.texto(p.$('#reqChips')), /CO-PACK/);
  const actual = p.$('#reqPasos .paso.actual');
  assert.match(p.texto(actual), /Calculada/);
});

test('metricas: partidas, con precio, pendientes de lote, a mano, kardex y margen', async () => {
  const p = await arranca();
  const t = p.texto(p.$('#reqMetricas'));
  assert.match(t, /8\s*partidas/i);
  assert.match(t, /6\s*con precio/i);
  assert.match(t, /2\s*pendientes de lote/i);
  assert.match(t, /1\s*editada a mano/i);
  assert.match(t, /Kardex al 04\/11\/2026/);
  assert.match(t, /Margen 15%/);
});

test('tabla: una fila por partida con su tipo, producto usado, entrada, precio y avisos', async () => {
  const p = await arranca();
  assert.equal(p.window.document.querySelectorAll('#reqTabla tr[data-renglon]').length, 8);
  const r7 = p.fila(7);
  assert.ok(r7.classList.contains('req-variante'));
  const t7 = p.texto(r7);
  for (const s of ['WWP0809', '52H.12239', 'Variante -MQ', 'WWP0809-MQ', 'OC. 7889 I23-034 · 13/09/2023', '63.25 USD', '16%', 'costo antiguo']) {
    assert.ok(t7.includes(s), `fila 7 debe mostrar "${s}" — ${t7}`);
  }
  const t6 = p.texto(p.fila(6));
  assert.match(t6, /69\.6785 USD/);   // sugerido
  assert.match(t6, /73\.00 USD/);     // final a mano
  assert.match(t6, /Acordado con Co-Pack/);
  assert.match(p.texto(p.fila(4)), /Precio pactado.*6\.50 MXN/);
  assert.match(p.texto(p.fila(5)), /Pendiente de lote/);
  assert.ok(p.fila(5).classList.contains('req-pendiente_lote'));
});

test('aprobar con lotes pendientes: no manda nada y dice que renglones faltan', async () => {
  const p = await arranca();
  p.$('#btnAprobar').click(); await p.espera();
  assert.equal(p.ultimo(/\/aprobar$/), undefined);
  assert.match(p.texto(p.$('#reqMsg')), /5.*8/);
  assert.match(p.texto(p.$('#reqMsg')), /lote/i);
});

test('aprobar completa: manda POST aprobar y la pantalla queda cerrada (sin editar ni calcular)', async () => {
  const det = clon(DET);
  for (const x of det.partidas) if (x.precio_final == null) Object.assign(x, { regla: 'exacta', precio_final: 10, moneda: 'MXN' });
  for (const x of det.partidas) Object.assign(x, { iva_final: x.iva_final ?? 0.16, iva_origen: 'catalogo' });
  const p = await arranca({ det });
  p.$('#btnAprobar').click(); await p.espera();
  assert.ok(p.ultimo(/\/aprobar$/));
  assert.equal(p.ultimo(/\/aprobar$/).o.method, 'POST');
  await p.espera();
  assert.match(p.texto(p.$('#reqChips')), /Aprobada/);
  assert.equal(p.$('#btnCalcular'), null);
  assert.equal(p.window.document.querySelectorAll('.btn-editar').length, 0);
  assert.ok(p.$('#btnEnviada'));
});

test('editar precio: sin motivo no se guarda; con motivo manda PATCH y recarga', async () => {
  const p = await arranca();
  const r7 = DET.partidas.find((x) => x.renglon === 7);
  p.fila(7).querySelector('.btn-editar').click(); await p.espera();
  p.$('#edPrecio').value = '70';
  p.$('#edGuardar').click(); await p.espera();
  assert.equal(p.ultimo(/\/partidas\//), undefined);
  assert.match(p.texto(p.$('#edMsg')), /motivo/i);
  p.$('#edMotivo').value = 'Ajuste comercial';
  p.$('#edIva').value = '16';
  p.$('#edGuardar').click(); await p.espera();
  const r = p.ultimo(/\/partidas\//);
  assert.equal(r.u, `/protected/cto/requisiciones/${RID}/partidas/${r7.partida_id}`);
  assert.equal(r.o.method, 'PATCH');
  assert.deepEqual(r.body, { precio_final: 70, iva_final: 0.16, motivo: 'Ajuste comercial' });
  await p.espera();
  assert.match(p.texto(p.fila(7)), /70\.00 USD/);
});

test('calcular: POST calcular y recarga el detalle', async () => {
  const p = await arranca();
  const antes = p.pedidos.length;
  p.$('#btnCalcular').click(); await p.espera(); await p.espera();
  const nuevos = p.pedidos.slice(antes).map((x) => x.u);
  assert.deepEqual(nuevos, [`/protected/cto/requisiciones/${RID}/calcular`, `/protected/cto/requisiciones/${RID}`]);
  assert.equal(p.ultimo(/\/calcular$/).o.method, 'POST');
});

test('lotes de almacen: lee el Excel elegido y manda sus filas', async () => {
  const p = await arranca();
  p.window.__rowsXlsx = ROWS_932;
  const f = new p.window.File([new Uint8Array([80, 75, 3, 4])], 'REQUISICION 931 lotes.xlsx');
  f.arrayBuffer = async () => new ArrayBuffer(4);
  Object.defineProperty(p.$('#inpLotes'), 'files', { value: [f], configurable: true });
  p.$('#inpLotes').dispatchEvent(new p.window.Event('change')); await p.espera(); await p.espera();
  const r = p.ultimo(/\/lotes$/);
  assert.equal(r.o.method, 'POST');
  assert.deepEqual(r.body, { rows: ROWS_932 });
  assert.match(p.window.__toast, /2 partidas actualizadas/);
});

test('descargar Excel: pide el export de esta requisicion', async () => {
  const p = await arranca();
  p.$('#btnExcel').click(); await p.espera();
  const r = p.ultimo(/\/export$/);
  assert.ok(r.raw);
  assert.equal(r.u, `/protected/cto/requisiciones/${RID}/export`);
});

test('solo lectura: sin write/aprobar no hay calcular, lotes, editar ni aprobar; si hay Excel', async () => {
  const p = await arranca({ perms: ['screen.cto.requisiciones', 'cto.requisiciones.read'] });
  assert.equal(p.$('#btnCalcular'), null);
  assert.equal(p.$('#inpLotes'), null);
  assert.equal(p.$('#btnAprobar'), null);
  assert.equal(p.window.document.querySelectorAll('.btn-editar').length, 0);
  assert.ok(p.$('#btnExcel'));
});

test('932 recibida: muestra el aviso del numero y que falta calcular', async () => {
  const det = API.detalle_932_recibida;
  const p = await arranca({ det, id: det.requisicion.requisicion_id });
  assert.match(p.texto(p.$('#reqAvisos')), /El archivo dice REQUISICION 931 y se declaró 932/);
  assert.match(p.texto(p.$('#reqMetricas')), /Sin calcular/i);
  assert.match(p.texto(p.$('#reqChips')), /Recibida/);
});

test('sin ?id no llama al backend y lo dice', async () => {
  const p = await arranca({ id: '' });
  assert.equal(p.pedidos.length, 0);
  assert.match(p.texto(p.$('#reqMsg')), /requisición/i);
});

// Caso real: REQUISICION 931 con lotes '´2026012522D0' (acento de Excel).
test('tabla: el lote se ve sin el acento de Excel', async () => {
  const det = clon(DET);
  det.partidas.find((x) => x.renglon === 7).lote = '´52H.12239';
  const p = await arranca({ det });
  const t = p.texto(p.fila(7));
  assert.ok(t.includes('52H.12239'));
  assert.ok(!t.includes('´'), t);
});

test('tabla: no hereda el ancho fijo de columnas de .table-wrap (se encimaban)', async () => {
  const p = await arranca();
  const css = p.window.document.getElementById('estiloReq').textContent;
  assert.match(css, /\.table-wrap table\.req-tabla\{[^}]*table-layout:auto/);
});

// IVA (decision 10-nov-2026): fixture real — r3 catalogo, r6 compra por
// confirmar, r1/r2 WWP1226 importacion sin IVA propuesto.
test('IVA: la columna dice de donde sale y el aviso pide confirmarlo con contabilidad', async () => {
  const p = await arranca();
  assert.match(p.texto(p.fila(3)), /16% · catálogo/);
  assert.match(p.texto(p.fila(6)), /16% · compra, por confirmar/);
  assert.match(p.texto(p.fila(1)), /Por confirmar/);
  const av = [...p.fila(6).querySelectorAll('.req-aviso')].find((x) => /Confirmar IVA con contabilidad/.test(x.textContent));
  assert.ok(av, 'fila 6 trae el aviso');
  assert.ok(av.classList.contains('revisar'));
  assert.ok(p.fila(6).querySelector('.req-iva-pendiente'), 'la celda de IVA por confirmar se resalta');
  assert.equal(p.fila(3).querySelector('.req-iva-pendiente'), null);
});

test('IVA: con todos los precios pero IVA por confirmar no se aprueba y dice que renglones', async () => {
  const det = clon(DET);
  for (const x of det.partidas) if (x.precio_final == null) Object.assign(x, { regla: 'exacta', precio_final: 10, moneda: 'MXN', iva_final: 0.16, iva_origen: 'catalogo' });
  const p = await arranca({ det });
  p.$('#btnAprobar').click(); await p.espera();
  assert.equal(p.ultimo(/\/aprobar$/), undefined);
  const m = p.texto(p.$('#reqMsg'));
  assert.match(m, /IVA/);
  assert.match(m, /1, 2, 6/);
  assert.match(m, /contabilidad/i);
});

test('IVA: el editor avisa que guardar el IVA lo confirma; cambiar solo el IVA no pide motivo', async () => {
  const p = await arranca();
  const r1 = DET.partidas.find((x) => x.renglon === 1);
  p.fila(1).querySelector('.btn-editar').click(); await p.espera();
  assert.match(p.texto(p.$('.req-editor')), /queda confirmado/i);
  assert.equal(p.$('#edIva').value, '');
  p.$('#edIva').value = '16';
  p.$('#edGuardar').click(); await p.espera();
  const r = p.ultimo(/\/partidas\//);
  assert.ok(r, 'manda el PATCH');
  assert.deepEqual(r.body, { precio_final: r1.precio_final, iva_final: 0.16 });
  await p.espera();
  assert.match(p.texto(p.fila(1)), /16% · confirmado/);
});

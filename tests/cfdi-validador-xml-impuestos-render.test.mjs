// ============================================================
// tests/cfdi-validador-xml-impuestos-render.test.mjs
// CFDI · Validador XML — desglose de impuestos e IVA exento en pantalla.
// Regla §16.4: escrita antes del cambio y mostrada fallando.
// Casos reales (Sergio, 24-nov-2026), con los valores que entrega el backend
// (feature/cfdi-validador-xml) para:
//   - Contreras 17964: 1,465.31 al 16% (IVA 234.45) + 4,396.09 exento.
//   - Tiger CVV-18 19189: 659.48 al 16% (IVA 105.52), sin exento.
// Hoy la tabla solo muestra Total XML / Total KOGU y el detalle no desglosa.
// Se corre con: cd tests && node cfdi-validador-xml-impuestos-render.test.mjs
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

const ARCHIVO = new URL('../modules/cfdi/validador-xml/validador-xml.js', import.meta.url).pathname;
const base = { estructura_xml_resumen: 'CORRECTA', estructura_xml_totales: { ok: 20, total: 20 },
  validaciones_estructura: [], observaciones: [], diferencias: [], xml_valido: true };
const CONTRERAS = { ...base, archivo: 'contreras.xml', uuid: 'b92b09a9-cd5f-421c-8d53-31ade3b28806',
  resultado_final: 'NO_EN_KOGU_SAT_VIGENTE', existe_en_kogu: false, sat: { estatus_sat: 'VIGENTE' },
  xml: { uuid: 'b92b09a9-cd5f-421c-8d53-31ade3b28806', emisor_rfc: 'COMD871213B33', receptor_rfc: 'ADE8703309B6',
    subtotal: 5861.4, descuento: 0, base_iva_16: 1465.31, base_iva_8: 0, base_iva_0: 0, base_iva_exento: 4396.09,
    tiene_iva_exento: true, iva_trasladado: 234.45, ieps_trasladado: 0, impuestos_ret_iva: 0, impuestos_ret_isr: 0, total: 6095.85 } };
const TIGER = { ...base, archivo: 'tiger.xml', uuid: '0DACAD58-9CA7-4770-9AAB-0D21999AABD1',
  resultado_final: 'COINCIDE_ACTUALIZADO', existe_en_kogu: true,
  xml: { uuid: '0DACAD58-9CA7-4770-9AAB-0D21999AABD1', emisor_rfc: 'PTI101111Q20', receptor_rfc: 'ADE8703309B6',
    subtotal: 659.48, descuento: 0, base_iva_16: 659.48, base_iva_8: 0, base_iva_0: 0, base_iva_exento: 0,
    tiene_iva_exento: false, iva_trasladado: 105.52, ieps_trasladado: 0, impuestos_ret_iva: 0, impuestos_ret_isr: 0, total: 765 },
  kogu: { total: 765, subtotal: 659.48, descuento: 0, base_iva_16: 659.48, base_iva_8: 0, base_iva_0: 0, base_iva_exento: 0,
    tiene_iva_exento: false, iva_trasladado: 105.52, ieps_trasladado: 0, impuestos_ret_iva: 0, impuestos_ret_isr: 0,
    desglose_impuestos_at: '2026-11-24T21:00:00Z' } };

async function arranca() {
  const js = fs.readFileSync(ARCHIVO, 'utf8');
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div></body></html>',
    { url: 'https://kogu.test/modules/cfdi/validador-xml/validador-xml.html', runScripts: 'outside-only' });
  const { window } = dom;
  window.KoguShell = { initShell: async () => {
    const d = window.document.createElement('div'); d.id = 'pageContent';
    window.document.getElementById('app').appendChild(d);
    return { ok: true, empresa_activa: { empresa_id: 'E-ADGM' } };
  } };
  window.KoguApi = {
    apiFetch: async () => ({ ok: true, data: { resumen: { total_archivos: 2 }, resultados: [CONTRERAS, TIGER] } }),
    authFetchRaw: async () => { throw new Error('sin red'); }, unwrapData: (r) => r.data, toast: () => {}
  };
  window.KoguUi = {
    escapeHtml: (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    money: (v) => '$' + Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    int: (v) => String(Number(v || 0))
  };
  window.open = () => null;
  window.eval(js);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  await new Promise((r) => setTimeout(r, 50));
  window.document.getElementById('xmlFiles').onchange({ target: { files: [new window.File(['x'], 'a.xml')] } });
  window.document.getElementById('validateBtn').click();
  await new Promise((r) => setTimeout(r, 300));
  return window;
}

const w = await arranca();
const doc = w.document;
const headers = [...doc.querySelectorAll('table thead th')].map((th) => th.textContent.trim());
const col = headers.indexOf('Impuestos');
const fila = (uuid) => [...doc.querySelectorAll('#resultRows tr')].find((tr) => tr.textContent.includes(uuid));
const celda = (uuid) => (fila(uuid)?.querySelectorAll('td')[col]?.textContent || '').replace(/\s+/g, ' ');
const abrir = (uuid) => { fila(uuid)?.querySelector('[data-detail-index]')?.click(); return doc.getElementById('detailBody'); };
const filaImp = (body, etiqueta) => [...body.querySelectorAll('[data-impuestos] tr')].find((tr) => tr.querySelector('td')?.textContent.trim() === etiqueta);

console.log('\n── Tabla ───────────────────────────────────────────────────────');
await check('Hay columna "Impuestos" entre Total XML y Total KOGU', () => {
  assert.ok(col > 0, headers.join(' | '));
  assert.deepEqual([headers[col - 1], headers[col + 1]], ['Total XML', 'Total KOGU']);
});
await check('Contreras: la celda dice IVA $234.45 y Exento: Sí', () => {
  assert.match(celda(CONTRERAS.uuid), /IVA:? \$234\.45/);
  assert.match(celda(CONTRERAS.uuid), /Exento:? Sí/);
});
await check('Tiger: la celda dice Exento: No', () => assert.match(celda(TIGER.uuid), /Exento:? No/));

console.log('\n── Detalle ─────────────────────────────────────────────────────');
await check('Contreras: recuadro de impuestos con base exenta $4,396.09 en XML y "—" en KOGU', () => {
  const tr = filaImp(abrir(CONTRERAS.uuid), 'Base IVA exento');
  assert.ok(tr, 'no hay fila "Base IVA exento" en [data-impuestos]');
  const tds = [...tr.querySelectorAll('td')].map((td) => td.textContent.trim());
  assert.deepEqual(tds.slice(1), ['$4,396.09', '—']);
});
await check('Contreras: fila "IVA exento" dice Sí / —', () => {
  const tds = [...(filaImp(abrir(CONTRERAS.uuid), 'IVA exento')?.querySelectorAll('td') || [])].map((td) => td.textContent.trim());
  assert.deepEqual(tds.slice(1), ['Sí', '—']);
});
await check('Tiger: IVA 16% de XML y KOGU lado a lado ($105.52 / $105.52)', () => {
  const tds = [...(filaImp(abrir(TIGER.uuid), 'IVA trasladado')?.querySelectorAll('td') || [])].map((td) => td.textContent.trim());
  assert.deepEqual(tds.slice(1), ['$105.52', '$105.52']);
});
await check('El recuadro sigue el orden de factura: Subtotal … Total', () => {
  const body = abrir(TIGER.uuid);
  const orden = [...body.querySelectorAll('[data-impuestos] tbody tr')].map((tr) => tr.querySelector('td').textContent.trim());
  assert.deepEqual(orden, ['Subtotal', 'Descuento', 'Base IVA 16%', 'Base IVA 8%', 'Base IVA 0%', 'Base IVA exento',
    'IVA exento', 'IVA trasladado', 'IEPS trasladado', 'Ret. IVA', 'Ret. ISR', 'Total']);
});

for (const n of verde) console.log(`ok   ${n}`);
for (const [n, m] of rojo) console.log(`FAIL ${n}\n     ${m}`);
console.log(`\n${verde.length} verde · ${rojo.length} rojo`);
process.exit(rojo.length ? 1 : 0);

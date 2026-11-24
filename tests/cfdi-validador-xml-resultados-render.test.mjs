// ============================================================
// tests/cfdi-validador-xml-resultados-render.test.mjs
// CFDI · Validador XML — como se pintan los resultados de la Fase 2.
// Regla §16.4: escrita antes del cambio y mostrada fallando.
// Caso real (Sergio, 24-nov-2026): Preimpresos Tiger CVV-18 19189
// (UUID 0DACAD58-…ABD1). En ADEGERMEX aun no esta en KOGU y el SAT lo da
// VIGENTE; en la empresa Sergio Juarez es un XML ajeno. Backend: rama
// feature/cfdi-validador-xml. Los demas resultados son variantes sinteticas.
// Se corre con: cd tests && node cfdi-validador-xml-resultados-render.test.mjs
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
const XML_TIGER = { uuid: '0DACAD58-9CA7-4770-9AAB-0D21999AABD1', serie: 'CVV-18', folio: '19189',
  emisor_rfc: 'PTI101111Q20', emisor_nombre: 'PREIMPRESOS TIGER', receptor_rfc: 'ADE8703309B6',
  receptor_nombre: 'ADEGERMEX', total: 765 };
const item = (uuid, resultado_final, extra = {}) => ({
  archivo: `${uuid}.xml`, uuid, xml_valido: true, xml: { ...XML_TIGER, uuid },
  estructura_xml_resumen: 'CORRECTA', estructura_xml_totales: { ok: 20, total: 20 },
  validaciones_estructura: [], observaciones: [], diferencias: [], existe_en_kogu: false,
  resultado_final, ...extra
});
const RESULTADOS = [
  item('U-VIGENTE', 'NO_EN_KOGU_SAT_VIGENTE', { sat: { estatus_sat: 'VIGENTE', created_at: '2026-11-24T21:41:00Z' } }),
  item('U-CANCELADO', 'NO_EN_KOGU_SAT_CANCELADO', { sat: { estatus_sat: 'CANCELADO', created_at: '2026-11-24T21:41:00Z' } }),
  item('U-NOSAT', 'NO_EN_KOGU_SAT_NO_ENCONTRADO', { sat: { estatus_sat: 'NO ENCONTRADO', created_at: '2026-11-24T21:41:00Z' } }),
  item('U-AJENO', 'NO_CORRESPONDE_EMPRESA'),
  item('U-ALCANCE', 'FUERA_DE_ALCANCE'),
  item('U-OK', 'COINCIDE_ACTUALIZADO', { existe_en_kogu: true, kogu: { total: 765, estatus_sat: 'Vigente' } })
];
const RESUMEN = { total_archivos: 6, xml_validos: 6, invalidos: 0, no_encontrados: 3,
  no_corresponden: 1, fuera_alcance: 1, coincidencias: 1, con_diferencias: 0 };

async function arranca() {
  const js = fs.readFileSync(ARCHIVO, 'utf8');
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div></body></html>',
    { url: 'https://kogu.test/modules/cfdi/validador-xml/validador-xml.html', runScripts: 'outside-only' });
  const { window } = dom;
  window.KoguShell = {
    initShell: async () => {
      const d = window.document.createElement('div');
      d.id = 'pageContent';
      window.document.getElementById('app').appendChild(d);
      return { ok: true, empresa_activa: { empresa_id: 'E-ADGM' }, permisos: ['screen.cfdi.sat_dm'] };
    }
  };
  window.KoguApi = {
    apiFetch: async () => ({ ok: true, data: { empresa: { rfc: 'ADE8703309B6' }, resumen: RESUMEN, resultados: RESULTADOS } }),
    authFetchRaw: async () => { throw new Error('sin red en la prueba'); },
    unwrapData: (r) => r.data,
    toast: () => {}
  };
  window.KoguUi = {
    escapeHtml: (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    money: (v) => '$' + Number(v || 0).toFixed(2),
    int: (v) => String(Number(v || 0))
  };
  window.open = () => null;
  window.eval(js);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  await new Promise((r) => setTimeout(r, 50));
  const input = window.document.getElementById('xmlFiles');
  const f = new window.File(['<cfdi:Comprobante/>'], 'tiger.xml', { type: 'text/xml' });
  input.onchange({ target: { files: [f] } });
  window.document.getElementById('validateBtn').click();
  await new Promise((r) => setTimeout(r, 300));
  const fila = (uuid) => [...window.document.querySelectorAll('#resultRows tr')].find((tr) => tr.textContent.includes(uuid));
  const chip = (uuid) => fila(uuid)?.querySelectorAll('td')[6]?.querySelector('.chip');
  const sat = (uuid) => (fila(uuid)?.querySelectorAll('td')[7]?.textContent || '').trim();
  return { window, fila, chip, sat };
}

const ctx = await arranca();
const clases = (uuid) => [...(ctx.chip(uuid)?.classList || [])].join(' ');

console.log('\n── Color del resultado ─────────────────────────────────────────');
await check('Vigente en SAT pero no en KOGU → ámbar (warn), no rojo', () => assert.match(clases('U-VIGENTE'), /\bwarn\b/, clases('U-VIGENTE')));
await check('Cancelado en SAT → rojo', () => assert.match(clases('U-CANCELADO'), /\bdanger\b/));
await check('No existe en SAT → rojo', () => assert.match(clases('U-NOSAT'), /\bdanger\b/));
await check('XML ajeno → rojo', () => assert.match(clases('U-AJENO'), /\bdanger\b/));
await check('Fuera de alcance → neutro (sin success/warn/danger)', () => assert.doesNotMatch(clases('U-ALCANCE'), /success|warn|danger/, clases('U-ALCANCE')));

console.log('\n── Texto legible ───────────────────────────────────────────────');
await check('Vigente no descargado: "No en KOGU · vigente en SAT"', () => assert.equal(ctx.chip('U-VIGENTE')?.textContent.trim(), 'No en KOGU · vigente en SAT'));
await check('Ajeno: "No es de la empresa"', () => assert.equal(ctx.chip('U-AJENO')?.textContent.trim(), 'No es de la empresa'));
await check('Fuera de alcance: "Fuera de alcance"', () => assert.equal(ctx.chip('U-ALCANCE')?.textContent.trim(), 'Fuera de alcance'));

console.log('\n── Estatus SAT de los que no están en KOGU ─────────────────────');
await check('La columna Estatus SAT muestra VIGENTE aunque no esté en KOGU', () => assert.equal(ctx.sat('U-VIGENTE'), 'VIGENTE'));
await check('Un ajeno no muestra estatus SAT', () => assert.equal(ctx.sat('U-AJENO'), '-'));

console.log('\n── Resumen ─────────────────────────────────────────────────────');
await check('La tarjeta 4 suma no encontrados + ajenos + inválidos (3+1+0 = 4)', () => {
  const v = ctx.window.document.querySelectorAll('#resumeGrid .mini-stat-v')[3]?.textContent.trim();
  assert.equal(v, '4');
});

for (const n of verde) console.log(`ok   ${n}`);
for (const [n, m] of rojo) console.log(`FAIL ${n}\n     ${m}`);
console.log(`\n${verde.length} verde · ${rojo.length} rojo`);
process.exit(rojo.length ? 1 : 0);

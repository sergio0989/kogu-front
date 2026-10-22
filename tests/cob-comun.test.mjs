// Cobranza F1 · lógica pura de la pantalla de Cartera y de Cargar corte.
// Se corre con: node --test tests/cob-comun.test.mjs
// Datos: respuesta real de GET /protected/cob/cartera generada por el servicio
// del backend con el export SAI del 20-oct-2026 (anonimizado):
// tests/fixtures/cob-cartera-20261020.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const C = require('../modules/cob/cob-comun.js');
const CART = JSON.parse(readFileSync(new URL('./fixtures/cob-cartera-20261020.json', import.meta.url)));
const D = CART.documentos;

test('fecha de corte por omisión: el viernes más reciente (el export es viernes en la tarde)', () => {
  assert.equal(C.viernesMasReciente('2026-10-22'), '2026-10-16');   // jueves
  assert.equal(C.viernesMasReciente('2026-10-23'), '2026-10-23');   // viernes
  assert.equal(C.viernesMasReciente('2026-10-26'), '2026-10-23');   // lunes 8:00, antes de la sesión
  assert.equal(C.viernesMasReciente('2026-11-01'), '2026-10-30');   // cruza de mes
});

test('folio para mostrar: serie + folio; las notas no traen serie', () => {
  assert.equal(C.folioDe({ serie: 'A', folio: '27162' }), 'A 27162');
  assert.equal(C.folioDe({ serie: null, folio: 'N200' }), 'N200');
});

test('fichas del corte completo = las de SAI', () => {
  const f = Object.fromEntries(C.resumenFichas(D).map((x) => [x.k, [x.docs, x.saldo_mxn]]));
  assert.deepEqual(f.cartera, [342, 99472027.56]);
  assert.deepEqual(f.b1, [240, 82687067.45]);
  assert.deepEqual(f.b2, [51, 10253202.52]);
  assert.deepEqual(f.b5, [22, 4336659.76]);
  assert.deepEqual(f.vencido, [102, 16784960.11]);
  assert.equal(C.resumenFichas(D)[0].clientes, 55);
});

test('filtros: cliente, responsable (o sin responsable), moneda, folio y ficha', () => {
  assert.equal(C.filtrar(D, { cliente: '111' }).length, 1);
  assert.equal(C.filtrar(D, { responsable: 'u-rox' }).length, 82);
  assert.equal(C.filtrar(D, { responsable: '__none' }).length, 244);
  assert.equal(C.filtrar(D, { moneda: 'USD' }).length, 239);
  assert.deepEqual(C.filtrar(D, { q: '2705' }).map((d) => d.folio), ['27050', '27051', '27052', '27059']);
  assert.deepEqual(C.filtrar(D, { q: 'n200' }).map((d) => d.folio), ['N200']);
  assert.equal(C.filtrar(D, { ficha: 'b5' }).length, 22);
  assert.equal(C.filtrar(D, { ficha: 'vencido', moneda: 'USD' }).length, C.filtrar(D, { moneda: 'USD' }).filter((d) => d.vencido).length);
  assert.equal(C.filtrar(D, {}).length, 342);
});

test('orden: por saldo en pesos de mayor a menor, por días, por folio', () => {
  assert.equal(C.ordenar(D, 'saldo_mxn', -1)[0].folio, '23656');
  assert.equal(C.ordenar(D, 'dias_vencido', -1)[0].folio, 'N177');
  const asc = C.ordenar(D, 'folio', 1).map(C.folioDe);
  assert.ok(asc.indexOf('A 27050') < asc.indexOf('A 27051'));
  assert.equal(D[0].folio, '27162');   // no muta el arreglo original
});

test('agrupar por cliente: de mayor a menor saldo, con facturas vencidas', () => {
  const g = C.agrupar(D);
  assert.equal(g.length, 55);
  assert.deepEqual([g[0].cve_cte, g[0].docs.length, g[0].saldo_mxn, g[0].vencidas], ['1', 81, 32362220.92, 5]);
  assert.ok(g.every((x, i) => i === 0 || g[i - 1].saldo_mxn >= x.saldo_mxn));
});

test('avisos: notas por aplicar, residuos menores a $50 y corte desactualizado', () => {
  const a = C.avisos(D, CART.corte);
  assert.ok(a.some((x) => x.tipo === 'notas' && x.docs === 8 && x.saldo_mxn === -45309.78));
  assert.ok(a.some((x) => x.tipo === 'residuos' && x.docs === 2 && x.saldo_mxn === 17.88));
  assert.equal(a.some((x) => x.tipo === 'desactualizado'), false);
  const b = C.avisos(D, { ...CART.corte, dias_desde_corte: 10, desactualizado: true });
  assert.ok(b.some((x) => x.tipo === 'desactualizado' && /10 días/.test(x.texto)));
});

test('opciones de filtros: clientes por nombre y responsables con "Sin responsable"', () => {
  const cl = C.opcionesClientes(D);
  assert.equal(cl.length, 55);
  assert.ok(cl.every((x, i) => i === 0 || cl[i - 1].nombre.localeCompare(x.nombre) <= 0));
  assert.deepEqual(C.opcionesResponsables(D), [
    { valor: 'u-mar', nombre: 'Marcela G.' }, { valor: 'u-rox', nombre: 'Roxana H.' }, { valor: '__none', nombre: 'Sin responsable' }]);
});

test('vencido por responsable sobre lo filtrado; sin responsable al final', () => {
  const p = C.porResponsable(D);
  assert.deepEqual(p.map((x) => [x.responsable, x.vencido_mxn]), CART.por_responsable.map((x) => [x.responsable, x.vencido_mxn]));
  assert.equal(p.at(-1).responsable, 'Sin responsable');
  assert.deepEqual(C.porResponsable(C.filtrar(D, { cliente: '111' })).map((x) => x.responsable), ['Roxana H.']);
});

test('formatos: fecha dd/mm/aaaa, importes y etiqueta de antigüedad', () => {
  assert.equal(C.fmtFecha('2026-10-02'), '02/10/2026');
  assert.equal(C.fmtFecha(null), '—');
  assert.equal(C.dinero(43047.19), '$43,047.19');
  assert.equal(C.dineroCorto(16784960.11), '$16.78M');
  assert.equal(C.dineroCorto(379768.52), '$379,769');
  assert.deepEqual([1, 2, 3, 4, 5].map(C.etiquetaBucket), ['Por vencer', '1-30', '31-60', '61-90', '+90']);
});

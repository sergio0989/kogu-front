// Pruebas de la lógica pura de la pantalla Catálogos de I+D (modules/idp/idp-comun.js).
// Casos del backend real en QA (smoke eb2eeff): 110 valores en 14 catálogos,
// segmento jerárquico con 11 subsegmentos (Bebidas → 5), clave fija, "smoke_linea" orden 180.
// Uso: node --test tests/idp-catalogos.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const I = require('../modules/idp/idp-comun.js');

// Respuesta de GET /protected/idp/catalogos (recortada a lo que se usa)
const SEG = [
  { valor_id: 's1', catalogo: 'segmento', clave: 'bebidas', nombre: 'Bebidas', padre_id: null, orden: 10, activo: true },
  { valor_id: 's2', catalogo: 'segmento', clave: 'panificacion', nombre: 'Panificación', padre_id: null, orden: 20, activo: true },
  { valor_id: 's3', catalogo: 'segmento', clave: 'bebidas_alcoholicas', nombre: 'Alcohólicas', padre_id: 's1', orden: 110, activo: true },
  { valor_id: 's4', catalogo: 'segmento', clave: 'bebidas_base_agua', nombre: 'Base agua', padre_id: 's1', orden: 100, activo: false },
  { valor_id: 's5', catalogo: 'segmento', clave: 'confiteria', nombre: 'Confitería', padre_id: null, orden: 250, activo: true },
  { valor_id: 's6', catalogo: 'segmento', clave: 'huerfano', nombre: 'Huérfano', padre_id: 'no-existe', orden: 5, activo: true },
];

test('clave desde el nombre: minúsculas, sin acentos ni signos, espacios a _ (cumple ^[a-z0-9_]{2,60}$)', () => {
  assert.equal(I.claveDesdeNombre('Línea Ñandú  Plus!'), 'linea_nandu_plus');
  assert.equal(I.claveDesdeNombre('  FSSC 22000 '), 'fssc_22000');
  assert.equal(I.claveDesdeNombre('Bebidas / Base-agua'), 'bebidas_base_agua');
  assert.equal(I.claveDesdeNombre('x'.repeat(80)).length, 60);
  assert.equal(I.claveDesdeNombre('¿?'), '');
});

test('árbol: principales por orden, hijos debajo de su padre (por orden), huérfano como principal', () => {
  const a = I.arbolCatalogo(SEG);
  assert.deepEqual(a.map((n) => n.clave), ['huerfano', 'bebidas', 'panificacion', 'confiteria']);
  assert.deepEqual(a[1].hijos.map((n) => n.clave), ['bebidas_base_agua', 'bebidas_alcoholicas']);
  assert.deepEqual(a[2].hijos, []);
});

test('validar alta: nombre requerido, clave válida y no repetida en el mismo catálogo', () => {
  assert.match(I.validarValorCatalogo({ catalogo: 'segmento', clave: 'snacks', nombre: '' }, SEG), /nombre/i);
  assert.match(I.validarValorCatalogo({ catalogo: 'segmento', clave: 'Snacks Ñ', nombre: 'Snacks' }, SEG), /clave/i);
  assert.match(I.validarValorCatalogo({ catalogo: 'segmento', clave: 'bebidas', nombre: 'Bebidas 2' }, SEG), /ya existe/i);
  assert.equal(I.validarValorCatalogo({ catalogo: 'linea', clave: 'bebidas', nombre: 'Bebidas' }, SEG), null);
  assert.equal(I.validarValorCatalogo({ catalogo: 'segmento', clave: 'snacks', nombre: 'Snacks' }, SEG), null);
});

test('cuerpo del alta: texto recortado, orden numérico o se omite, padre vacío → sin padre', () => {
  assert.deepEqual(I.cuerpoValorCatalogo({ catalogo: 'linea', clave: ' smoke_linea ', nombre: ' Línea smoke ', orden: '', padre_id: '' }),
    { catalogo: 'linea', clave: 'smoke_linea', nombre: 'Línea smoke' });
  assert.deepEqual(I.cuerpoValorCatalogo({ catalogo: 'segmento', clave: 'snacks_salados', nombre: 'Salados', orden: '55', padre_id: 's1' }),
    { catalogo: 'segmento', clave: 'snacks_salados', nombre: 'Salados', orden: 55, padre_id: 's1' });
});

test('opciones para un select del proyecto: solo activas, y el valor actual aunque esté inactivo', () => {
  const op = I.opcionesCatalogo(SEG, 'bebidas_base_agua');
  assert.ok(op.some((o) => o.clave === 'bebidas_base_agua' && /inactivo/i.test(o.etiqueta)));
  assert.ok(!I.opcionesCatalogo(SEG, null).some((o) => o.clave === 'bebidas_base_agua'));
  // subsegmento se muestra con su padre
  assert.equal(I.opcionesCatalogo(SEG, null).find((o) => o.clave === 'bebidas_alcoholicas').etiqueta, 'Bebidas › Alcohólicas');
});

test('requisitos por línea (C4): config.requisitos filtrado a catálogos de requisitos conocidos', () => {
  assert.deepEqual(I.CATALOGOS_REQUISITO, ['etiquetado', 'estado_fisico', 'envase', 'almacenamiento', 'clasificacion',
    'solubilidad', 'demostracion', 'envio', 'certificacion', 'documento']);
  assert.deepEqual(I.requisitosDeLinea({ config: { requisitos: ['etiquetado', 'inventado', 'certificacion'] } }), ['etiquetado', 'certificacion']);
  assert.deepEqual(I.requisitosDeLinea({ config: {} }), []);
  assert.deepEqual(I.requisitosDeLinea(null), []);
});

// Alta de proyecto en 4 pasos, copiada del CRM (generar_proyecto.php):
// 1 Información del proyecto · 2 Información de negocio · 3 Detalles del desarrollo ·
// 4 Información adicional (en el CRM: "para Sabores" + muestras de línea, 15 filas).
// Fecha requerida sugerida = hoy + 10 días; envío por omisión "al agente de ventas".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const I = require('../modules/idp/idp-comun.js');

const AJOS = { clave: 'ajos_cebollas', config: { requisitos: ['etiquetado', 'envase', 'clasificacion'] } };

test('los 4 pasos del CRM', () => {
  assert.deepEqual(I.PASOS_ALTA, ['Información del proyecto', 'Información de negocio', 'Detalles del desarrollo', 'Información adicional']);
});

test('fecha requerida sugerida: hoy + 10 días (cruza mes)', () => {
  assert.equal(I.fechaSugeridaAlta('2026-10-06'), '2026-10-16');
  assert.equal(I.fechaSugeridaAlta('2026-12-25'), '2027-01-04');
});

test('bloques de los pasos 3 y 4 según la línea (sin definir → todos, como el CRM)', () => {
  assert.deepEqual(I.bloquesPasoAlta(3, null), ['etiquetado', 'estado_fisico', 'envase', 'almacenamiento', 'certificacion', 'documento', 'envio']);
  assert.deepEqual(I.bloquesPasoAlta(4, null), ['clasificacion', 'solubilidad', 'demostracion']);
  assert.deepEqual(I.bloquesPasoAlta(3, AJOS), ['etiquetado', 'envase']);
  assert.deepEqual(I.bloquesPasoAlta(4, AJOS), ['clasificacion']);
});

test('muestras de línea: filas vacías fuera; fila con datos exige producto; piezas válidas', () => {
  const r = I.filasMuestraAlta([
    { codigo: 'adf/sab/0101', nombre: 'Fresa', piezas: '1', cantidad: '200', unidad: 'g' },
    { codigo: '', nombre: '', piezas: '', cantidad: '', unidad: 'g' },
  ]);
  assert.equal(r.error, null);
  assert.deepEqual(r.muestras, [{ codigo: 'adf/sab/0101', nombre: 'Fresa', piezas: 1, cantidad: 200, unidad: 'g' }]);
  assert.match(I.filasMuestraAlta([{ codigo: 'X', nombre: '', piezas: '', cantidad: '', unidad: 'g' }]).error, /fila 1/i);
  assert.match(I.filasMuestraAlta([{}, { nombre: 'A', piezas: '0' }]).error, /fila 2.*piezas/i);
});

test('cuerpo del alta: datos, requisitos sin vacíos y muestras en un solo envío', () => {
  const b = I.cuerpoAlta({
    cliente_id: 'c1', nombre: ' Sabor fresa ', tipo: 'reactivo', linea: 'sabores', tipo_solicitud: 'desarrollo', segmento: '',
    fecha_requerida: '2026-10-16', descripcion: '', kg_mes: '500', precio_objetivo: '8.5', moneda: 'USD', agente_id: '',
    requisitos: { etiquetado: 'natural', envase: '', certificaciones: [], envio: 'agente', costo_aplicacion: '', costo_aplicacion_moneda: 'MXN', termoresistente: null },
    muestras: [{ codigo: '', nombre: 'Fresa', piezas: 1, cantidad: 200, unidad: 'g' }],
  });
  assert.deepEqual(b, {
    cliente_id: 'c1', nombre: 'Sabor fresa', tipo: 'reactivo', linea: 'sabores', tipo_solicitud: 'desarrollo',
    fecha_requerida: '2026-10-16', kg_mes: 500, precio_objetivo: 8.5, moneda: 'USD',
    requisitos: { etiquetado: 'natural', envio: 'agente' },
    muestras: [{ codigo: '', nombre: 'Fresa', piezas: 1, cantidad: 200, unidad: 'g' }],
  });
});

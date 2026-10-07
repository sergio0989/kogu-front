// Captura CRM-2188 en dev (2026-10-06): el desarrollador migrado del CRM es un usuario SIN ACCESO,
// no está en la lista de desarrolladores activos y la ficha decía "Asignado" en lugar del nombre.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { nombreDesarrollador } = createRequire(import.meta.url)('../modules/idp/idp-comun.js');

const DEVS = [{ user_id: 'u-1', nombre: 'Erika Téllez' }];

test('desarrollador activo: nombre de la lista', () => {
  assert.equal(nombreDesarrollador({ desarrollador_id: 'u-1' }, DEVS), 'Erika Téllez');
});
test('desarrollador sin acceso (migrado del CRM): nombre que manda el backend', () => {
  assert.equal(nombreDesarrollador({ desarrollador_id: 'u-32', desarrollador_nombre: 'Diana Castañeda' }, DEVS), 'Diana Castañeda');
});
test('asignado sin nombre conocido: "Asignado"; sin asignar: vacío', () => {
  assert.equal(nombreDesarrollador({ desarrollador_id: 'u-9' }, DEVS), 'Asignado');
  assert.equal(nombreDesarrollador({ desarrollador_id: null }, DEVS), '');
});

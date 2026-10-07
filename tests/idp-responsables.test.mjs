// Responsables (CRM: asignar, asignar_apoyo, asesor). El modal manda SOLO lo que cambió;
// "— sin apoyo —" se manda como null para quitarlo; el desarrollador no se puede dejar vacío.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const I = createRequire(import.meta.url)('../modules/idp/idp-comun.js');

const P = { desarrollador_id: 'u-diana', apoyo_id: 'u-angel', asesor_id: null };

test('solo viaja lo que cambió', () => {
  assert.deepEqual(I.cuerpoResponsables(P, { desarrollador_id: 'u-diana', apoyo_id: 'u-angel', asesor_id: 'u-analleli', comentario: '' }),
    { asesor_id: 'u-analleli' });
});
test('quitar apoyo viaja como null; el comentario acompaña', () => {
  assert.deepEqual(I.cuerpoResponsables(P, { desarrollador_id: 'u-diana', apoyo_id: '', asesor_id: '', comentario: ' Ya no apoya ' }),
    { apoyo_id: null, comentario: 'Ya no apoya' });
});
test('sin cambios → null (el modal avisa y no envía)', () => {
  assert.equal(I.cuerpoResponsables(P, { desarrollador_id: 'u-diana', apoyo_id: 'u-angel', asesor_id: '' }), null);
});
test('vaciar el desarrollador ya asignado es error', () => {
  assert.throws(() => I.cuerpoResponsables(P, { desarrollador_id: '', apoyo_id: 'u-angel', asesor_id: '' }), /desarrollador/);
});
test('nombres en la ficha: de la lista, o el que manda el backend (usuarios sin acceso)', () => {
  const devs = [{ user_id: 'u-angel', nombre: 'Angel Pinacho' }];
  assert.equal(I.nombreResponsable({ apoyo_id: 'u-angel' }, 'apoyo', devs), 'Angel Pinacho');
  assert.equal(I.nombreResponsable({ asesor_id: 'u-46', asesor_nombre: 'Valeria Silva' }, 'asesor', devs), 'Valeria Silva');
  assert.equal(I.nombreResponsable({ asesor_id: null }, 'asesor', devs), '');
});

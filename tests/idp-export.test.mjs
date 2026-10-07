// Exportar a Excel desde la lista de proyectos (CRM: exportar_proyectos/exportar_eventos):
// exporta lo que se ve filtrado (no solo la página) y la bitácora si se pide.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const I = createRequire(import.meta.url)('../modules/idp/idp-comun.js');

test('lleva los filtros activos, no la página ni el límite', () => {
  assert.equal(I.urlExportProyectos('/protected/idp', { q: 'sabor', estado: 'finalizado', potencial: '', agente_id: '', estancados: '', pagina: 3, limite: 50 }),
    '/protected/idp/proyectos/export?q=sabor&estado=finalizado');
});
test('con bitácora agrega bitacora=1; sin filtros queda limpia', () => {
  assert.equal(I.urlExportProyectos('/protected/idp', { pagina: 1 }, { bitacora: true }), '/protected/idp/proyectos/export?bitacora=1');
  assert.equal(I.urlExportProyectos('/protected/idp', {}), '/protected/idp/proyectos/export');
});
test('codifica el texto de búsqueda', () => {
  assert.equal(I.urlExportProyectos('/x', { q: 'ajo & cebolla' }), '/x/proyectos/export?q=ajo+%26+cebolla');
});

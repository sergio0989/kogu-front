// Estadísticas de I+D: dos vistas (decisión 7-oct): Resultados del periodo (por omisión el mes) y
// Comparativo vs mismo periodo del año anterior. "Ver listado" como el CRM (p*.php?fi&ff).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const I = createRequire(import.meta.url)('../modules/idp/idp-comun.js');
const HOY = new Date('2026-10-07T17:00:00Z'); // 11:00 en México

test('rangos rápidos en fecha de México', () => {
  assert.deepEqual(I.rangoTablero('mes', HOY), { desde: '2026-10-01', hasta: '2026-10-07' });
  assert.deepEqual(I.rangoTablero('mes_anterior', HOY), { desde: '2026-09-01', hasta: '2026-09-30' });
  assert.deepEqual(I.rangoTablero('anio', HOY), { desde: '2026-01-01', hasta: '2026-10-07' });
  assert.deepEqual(I.rangoTablero('mes', new Date('2026-11-01T03:00:00Z')), { desde: '2026-10-01', hasta: '2026-10-31' }); // 31-oct 21:00 en México
});

test('USD abreviado para indicadores y barras', () => {
  assert.equal(I.usdCorto(15124768.32), 'USD 15.1 M');
  assert.equal(I.usdCorto(84000), 'USD 84 mil');
  assert.equal(I.usdCorto(900), 'USD 900');
  assert.equal(I.usdCorto(0), 'USD 0');
  assert.equal(I.usdCorto(null), '—');
});

test('variación: texto con signo y dirección; sin base = sin variación', () => {
  assert.deepEqual(I.variacion({ var_pct: 20 }), { texto: '+20%', dir: 'sube' });
  assert.deepEqual(I.variacion({ var_pct: -8.5 }), { texto: '−8.5%', dir: 'baja' });
  assert.deepEqual(I.variacion({ var_pts: 6.7 }), { texto: '+6.7 pts', dir: 'sube' });
  assert.deepEqual(I.variacion({ var_pct: 0 }), { texto: '0%', dir: 'igual' });
  assert.deepEqual(I.variacion({ var_pct: null }), { texto: 'sin base', dir: null });
});

test('ver listado: liga a la lista con el corte y el periodo; los "Sin …" no ligan', () => {
  const per = { desde: '2026-09-01', hasta: '2026-09-30' };
  assert.equal(I.urlListado('potencial', 'A', per), '/modules/idp/proyectos.html?potencial=A&desde=2026-09-01&hasta=2026-09-30');
  assert.equal(I.urlListado('agente', 'a1', per), '/modules/idp/proyectos.html?agente_id=a1&desde=2026-09-01&hasta=2026-09-30');
  assert.equal(I.urlListado('estado', 'hold', null), '/modules/idp/proyectos.html?estado=hold');
  assert.equal(I.urlListado('agente', null, per), null);
  assert.equal(I.urlListado('linea', 'sabores', per), null); // la lista aún no filtra por línea
});

test('la lista toma los filtros de la URL (lo que manda el tablero)', () => {
  assert.deepEqual(I.filtrosDesdeUrl('?potencial=A&desde=2026-09-01&hasta=2026-09-30&x=1'),
    { potencial: 'A', desde: '2026-09-01', hasta: '2026-09-30' });
  assert.deepEqual(I.filtrosDesdeUrl(''), {});
});

test('ancho de barra: proporcional al máximo, mínimo visible si hay dato', () => {
  assert.equal(I.anchoBarra(50, 100), 50);
  assert.equal(I.anchoBarra(1, 1000), 1.5);
  assert.equal(I.anchoBarra(0, 100), 0);
  assert.equal(I.anchoBarra(5, 0), 0);
});

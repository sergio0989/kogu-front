// Pantalla Administrador → Tipo de cambio (FIX Banxico SF43718).
// Casos reales del CRM (tcaplicado): 17.00 el 25/09/2026 → 17.71 el 28/09/2026 (pasa);
// 21.0000 el 29/09/2026 tras 17.71 (relleno: pide confirmar); 1.0000 el 18/09/2026 (fuera de rango).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const T = createRequire(import.meta.url)('../modules/core/tipo-cambio/tc-comun.js');

test('historial: variación contra el día anterior con dato (viene de más reciente a más viejo)', () => {
  const f = T.filasHistorico([
    { fecha: '2026-09-29', valor: 21, fuente: 'manual', motivo: 'Relleno CRM', creado_por: 'Compras' },
    { fecha: '2026-09-28', valor: 17.71, fuente: 'banxico' },
    { fecha: '2026-09-25', valor: 17, fuente: 'banxico' },
  ]);
  assert.equal(f[0].variacion_dia_pct, 18.6);
  assert.equal(f[1].variacion_dia_pct, 4.2);
  assert.equal(f[2].variacion_dia_pct, null, 'el más viejo no tiene contra qué compararse');
  assert.equal(f[0].fuera_de_banda, true, 'más de 5% contra el día anterior');
  assert.equal(f[1].fuera_de_banda, false);
});

test('tarjeta del día: FIX con 4 decimales, fecha del dato y fuente; avisa si es del día hábil anterior', () => {
  assert.deepEqual(T.tarjetaDia({ fecha_solicitada: '2026-10-07', fecha_dato: '2026-10-07', valor: 18.45, fuente: 'banxico', es_anterior: false }),
    { valor: '18.4500', detalle: 'Dato del 07/10/2026 · Banxico', aviso: null });
  assert.deepEqual(T.tarjetaDia({ fecha_solicitada: '2026-10-04', fecha_dato: '2026-10-02', valor: 18.3, fuente: 'manual', es_anterior: true }),
    { valor: '18.3000', detalle: 'Dato del 02/10/2026 · Captura manual',
      aviso: 'El 04/10/2026 no hay FIX publicado; se usa el del día hábil anterior.' });
});

test('captura manual: motivo obligatorio, rango 10–40 y confirmación si se mueve más de 5% contra el anterior', () => {
  assert.deepEqual(T.revisarCaptura({ valor: '17.71', motivo: 'Banxico sin respuesta', referencia: 17 }), { ok: true, valor: 17.71, requiereConfirmar: false, aviso: null });
  const r = T.revisarCaptura({ valor: '21', motivo: 'x', referencia: 17.71 });
  assert.equal(r.ok, true); assert.equal(r.requiereConfirmar, true);
  assert.equal(r.aviso, '21.0000 se aleja 18.6% del último tipo de cambio (17.7100). ¿Es correcto?');
  assert.equal(T.revisarCaptura({ valor: '1', motivo: 'x', referencia: 17 }).error, 'El tipo de cambio debe estar entre 10 y 40 pesos por dólar.');
  assert.equal(T.revisarCaptura({ valor: '17.5', motivo: '  ', referencia: 17 }).error, 'La captura manual necesita un motivo.');
  assert.equal(T.revisarCaptura({ valor: '', motivo: 'x' }).error, 'El tipo de cambio debe estar entre 10 y 40 pesos por dólar.');
});

test('estado del sincronizador, en palabras', () => {
  assert.deepEqual(T.estadoSincronizador({ token_configurado: false, enabled: true }),
    { tono: 'error', texto: 'Falta el token de Banxico (BANXICO_TOKEN): no se puede sincronizar.' });
  assert.deepEqual(T.estadoSincronizador({ token_configurado: true, enabled: false, last: null }),
    { tono: 'aviso', texto: 'Sincronización automática apagada (TC_SCHEDULER_ENABLED). Se puede sincronizar a mano.' });
  assert.deepEqual(T.estadoSincronizador({ token_configurado: true, enabled: true, activo: true, tickMs: 10800000,
    last: { at: '2026-10-07T18:00:00.000Z', ok: true, guardados: 3 } }),
    { tono: 'ok', texto: 'Automática cada 3 h · última corrida 07/10/2026 12:00 · 3 días guardados.' });
  assert.deepEqual(T.estadoSincronizador({ token_configurado: true, enabled: true, activo: true, tickMs: 10800000,
    last: { at: '2026-10-07T18:00:00.000Z', ok: false, code: 'TC_BANXICO_ERROR' } }),
    { tono: 'error', texto: 'Automática cada 3 h · la última corrida (07/10/2026 12:00) falló: TC_BANXICO_ERROR.' });
});

// ============================================================
// modules/core/tipo-cambio/tc-comun.js — reglas puras de la pantalla Tipo de cambio
// (FIX Banxico SF43718). Mismas reglas que el backend: rango 10–40 y confirmación
// si la captura manual se aleja más de 5% del último tipo de cambio.
// Se prueba con node (tests/core-tipo-cambio.test.mjs); en el navegador queda en window.KoguTc.
// ============================================================
(function (root) {
  const TC_MIN = 10; const TC_MAX = 40; const BANDA_PCT = 5;
  const r1 = (n) => Math.round(n * 10) / 10;
  const f4 = (n) => Number(n).toFixed(4);
  const fecha = (d) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d || '')); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };
  const fechaHoraMx = (iso) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
    return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
  };
  const FUENTE = { banxico: 'Banxico', manual: 'Captura manual' };

  /** Filas de más reciente a más viejo; variación contra la siguiente (el día anterior con dato). */
  function filasHistorico(filas) {
    return (filas || []).map((x, i, a) => {
      const prev = a[i + 1];
      const v = prev && Number(prev.valor) > 0 ? r1((Number(x.valor) / Number(prev.valor) - 1) * 100) : null;
      return { ...x, variacion_dia_pct: v, fuera_de_banda: v != null && Math.abs(v) > BANDA_PCT };
    });
  }

  function tarjetaDia(d) {
    return {
      valor: f4(d.valor),
      detalle: `Dato del ${fecha(d.fecha_dato)} · ${FUENTE[d.fuente] || d.fuente}`,
      aviso: d.es_anterior ? `El ${fecha(d.fecha_solicitada)} no hay FIX publicado; se usa el del día hábil anterior.` : null,
    };
  }

  function revisarCaptura({ valor, motivo, referencia = null }) {
    const t = String(valor ?? '').replace(/,/g, '').trim();
    const v = t === '' ? NaN : Number(t);
    if (!String(motivo || '').trim()) return { ok: false, error: 'La captura manual necesita un motivo.' };
    if (!Number.isFinite(v) || v < TC_MIN || v > TC_MAX) return { ok: false, error: `El tipo de cambio debe estar entre ${TC_MIN} y ${TC_MAX} pesos por dólar.` };
    const ref = Number(referencia);
    const dev = Number.isFinite(ref) && ref > 0 ? r1(Math.abs(v / ref - 1) * 100) : null;
    const requiereConfirmar = dev != null && dev > BANDA_PCT;
    return { ok: true, valor: v, requiereConfirmar,
      aviso: requiereConfirmar ? `${f4(v)} se aleja ${dev}% del último tipo de cambio (${f4(ref)}). ¿Es correcto?` : null };
  }

  function estadoSincronizador(e = {}) {
    if (!e.token_configurado) return { tono: 'error', texto: 'Falta el token de Banxico (BANXICO_TOKEN): no se puede sincronizar.' };
    if (!e.enabled) return { tono: 'aviso', texto: 'Sincronización automática apagada (TC_SCHEDULER_ENABLED). Se puede sincronizar a mano.' };
    const cada = e.tickMs ? `Automática cada ${r1(e.tickMs / 3600000)} h` : 'Automática';
    if (!e.last) return { tono: 'aviso', texto: `${cada} · todavía no corre.` };
    if (e.last.ok === false) return { tono: 'error', texto: `${cada} · la última corrida (${fechaHoraMx(e.last.at)}) falló: ${e.last.code || 'error'}.` };
    const g = Number(e.last.guardados || 0);
    return { tono: 'ok', texto: `${cada} · última corrida ${fechaHoraMx(e.last.at)} · ${g} ${g === 1 ? 'día guardado' : 'días guardados'}.` };
  }

  const api = { TC_MIN, TC_MAX, BANDA_PCT, fecha, fechaHoraMx, filasHistorico, tarjetaDia, revisarCaptura, estadoSincronizador };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.KoguTc = api;
})(typeof window !== 'undefined' ? window : globalThis);

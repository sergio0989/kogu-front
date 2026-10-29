/* KOGU · Costo · Producción — revisión del teórico antes de guardar.
 * Funciones puras (sin DOM) para poder probarlas con node --test
 * (tests/cto-teorico-revision.test.mjs).
 *   cpuCalc(fila)  → $ por unidad = g/1000 × $/kg × (1 + merma%/100), o null
 *   revisar({filas, vigenteDesde, versiones}) → { alertas, reemplaza, bloquea }
 *     alertas: $ por unidad capturado que no cuadra con el cálculo
 *              (ámbar ≥ 1%, rojo > 10%: casi seguro gramos cambiados y $ viejo)
 *     reemplaza: fecha de la versión existente que se sobrescribiría, o null
 *     bloquea: hay rojo o reemplazo → pedir confirmación antes de guardar
 */
(function (root) {
  const UMBRAL_AMBAR = 0.01;
  const UMBRAL_ROJO = 0.10;
  const num = (v) => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v));

  function cpuCalc(f) {
    const g = num(f.g), ck = num(f.costo_kg);
    return g == null || ck == null ? null : (g / 1000) * ck * (1 + (num(f.merma_pct) || 0) / 100);
  }

  function revisar({ filas, vigenteDesde, versiones }) {
    const alertas = [];
    (filas || []).forEach((f, i) => {
      const cpu = num(f.cpu), calc = cpuCalc(f);
      if (cpu == null || calc == null || calc === 0) return;
      const pct = Math.abs(cpu - calc) / calc;
      if (pct < UMBRAL_AMBAR) return;
      alertas.push({ i, componente: f.componente, cpu, calc, pct, nivel: pct > UMBRAL_ROJO ? 'rojo' : 'ambar' });
    });
    const existe = (versiones || []).find((v) => v.vigente_desde === vigenteDesde);
    const reemplaza = existe ? existe.vigente_desde : null;
    return { alertas, reemplaza, bloquea: !!reemplaza || alertas.some((a) => a.nivel === 'rojo') };
  }

  const api = { cpuCalc, revisar, UMBRAL_AMBAR, UMBRAL_ROJO };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KoguTeoCalc = api;
})(typeof window !== 'undefined' ? window : globalThis);

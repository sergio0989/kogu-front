/* KOGU · Costo · Producción — revisión del teórico antes de guardar.
 * Funciones puras (sin DOM) para poder probarlas con node --test
 * (tests/cto-teorico-revision.test.mjs).
 *   cpuCalc(fila)  → $ por unidad = g/1000 × $/kg × (1 + merma%/100), o null
 *   revisar({filas, vigenteDesde, versiones}) → { alertas, reemplaza, bloquea }
 *     alertas: $ por unidad capturado que no cuadra con el cálculo
 *              (ámbar ≥ 1%, rojo > 10%: casi seguro gramos cambiados y $ viejo)
 *     reemplaza: fecha de la versión existente que se sobrescribiría, o null
 *     bloquea: hay rojo o reemplazo → pedir confirmación antes de guardar
 *   filasOperativo(producto, simular) → filas del Resumen operativo (meses + acumulado)
 *     con los valores reales o los simulados (captura incompleta estimada)
 *   rendimientoImposible(r) → más de 100%: sale más de lo que entra
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

  const MES = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const rendimientoImposible = (r) => r != null && Number(r) > 1;

  function filasOperativo(p, simular) {
    const meses = new Set((p.incompletas || []).map((i) => i.mes));
    const fila = (etiqueta, x, revisar, esAcum) => {
      const sim = !!(simular && x.simulado_aplica);
      return { etiqueta, acumulado: esAcum, valores: sim ? x.sim : x.real, simulado: sim, revisar };
    };
    return [
      ...(p.meses || []).map((x) => fila(`${MES[x.mes]}-${String(x.anio).slice(2)}`, x, meses.has(x.mes), false)),
      fila('Acumulado', p.acumulado, meses.size > 0, true),
    ];
  }

  const api = { cpuCalc, revisar, filasOperativo, rendimientoImposible, UMBRAL_AMBAR, UMBRAL_ROJO };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KoguTeoCalc = api;
})(typeof window !== 'undefined' ? window : globalThis);

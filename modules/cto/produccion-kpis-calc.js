/* KOGU · Costo · Producción — KPIs de producción.
 * Funciones puras (sin DOM) para poder probarlas con node --test
 * (tests/cto-produccion-kpis.test.mjs). Trabajan sobre analisis().kpis del back.
 *   mesesConHuecos(meses, anio, mesIni, mesFin) → todo el rango; los meses sin
 *     producción van con sin_produccion: true y volumen 0
 *   valorMedida(mes, medida) → cajas | sobres | kg del mes (0 si no hubo producción)
 *   alertas(kpis) → [{ tipo, nivel, componente, mes?, real, ref, desviacion }]
 *     gramos   acumulado > 15% arriba del teórico con merma          (alta)
 *     captura  un mes < 85% de los gramos teóricos con merma         (alta)
 *     precio   $ por unidad de un mes > 1.5 × el del acumulado        (media)
 *   cobertura(inventario, vendido, meses) → meses de venta que cubre el inventario
 */
(function (root) {
  const UMBRAL_GRAMOS = 0.15;
  const UMBRAL_CAPTURA = 0.85;
  const UMBRAL_PRECIO = 1.5;
  const num = (v) => (v == null || !Number.isFinite(Number(v)) ? null : Number(v));

  function mesesConHuecos(meses, anio, mesIni, mesFin) {
    const por = new Map((meses || []).map((m) => [m.mes, m]));
    const out = [];
    for (let m = mesIni; m <= mesFin; m++) {
      out.push(por.get(m) || { anio, mes: m, sin_produccion: true, ordenes: 0, cantidad_pt: 0, unidades: 0, kg: 0, componentes: [] });
    }
    return out;
  }

  function valorMedida(mes, medida) {
    if (!mes || mes.sin_produccion) return 0;
    const v = medida === 'sobres' ? mes.unidades : medida === 'kg' ? mes.kg : mes.cantidad_pt;
    return num(v) || 0;
  }

  function alertas(kpis) {
    const out = [];
    const acum = (kpis && kpis.acumulado && kpis.acumulado.componentes) || [];
    for (const c of acum) {
      const g = num(c.g_real), t = num(c.g_teo_merma);
      if (g != null && t && g / t - 1 > UMBRAL_GRAMOS) {
        out.push({ tipo: 'gramos', nivel: 'alta', componente: c.componente, real: g, ref: t, desviacion: g / t - 1 });
      }
    }
    const refPrecio = new Map(acum.map((c) => [c.componente, num(c.real_por_unidad)]));
    const capturas = [], precios = [];
    for (const m of (kpis && kpis.meses) || []) {
      for (const c of m.componentes || []) {
        const g = num(c.g_real), t = num(c.g_teo_merma);
        if (g != null && t && g / t < UMBRAL_CAPTURA) {
          capturas.push({ tipo: 'captura', nivel: 'alta', componente: c.componente, mes: m.mes, anio: m.anio, real: g, ref: t, desviacion: g / t - 1 });
        }
        const p = num(c.real_por_unidad), ref = refPrecio.get(c.componente);
        if (p != null && ref && p / ref > UMBRAL_PRECIO) {
          precios.push({ tipo: 'precio', nivel: 'media', componente: c.componente, mes: m.mes, anio: m.anio, real: p, ref, desviacion: p / ref - 1 });
        }
      }
    }
    return out.concat(capturas, precios);
  }

  function cobertura(inventario, vendido, meses) {
    const inv = num(inventario), v = num(vendido), m = num(meses);
    if (inv == null || !v || !m) return null;
    return inv / (v / m);
  }

  const api = { mesesConHuecos, valorMedida, alertas, cobertura, UMBRAL_GRAMOS, UMBRAL_CAPTURA, UMBRAL_PRECIO };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KoguKpiCalc = api;
})(typeof window !== 'undefined' ? window : globalThis);

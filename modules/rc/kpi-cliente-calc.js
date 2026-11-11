/* KOGU · Radar comercial — KPI Ventas Cliente.
 * Funciones puras (sin DOM) para poder probarlas con node --test
 * (tests/rc-kpi-cliente.test.mjs). Trabajan sobre GET /protected/rc/kpi-cliente.
 *   mesesConHuecos(meses, anio, mesIni, mesFin) → el rango completo; los meses
 *     sin compra van con sin_compra: true y cantidad/venta 0
 *   cambiosPrecio(meses) → cada mes con compra y su variación de precio contra
 *     el mes anterior con compra (el primero, null)
 *   senales(data, cliente) → [{ tipo, nivel, ... }] en este orden:
 *     concentracion  el cliente principal pasa del 50% de la venta    (alta)
 *     demanda        últimos 3 meses con compra < −15% vs los 3 previos (alta);
 *                    solo con 6 meses o más con compra
 *     recencia       días sin comprar: > 30 media, > 60 alta
 *   filtrarProductos(lista, texto) → por clave o descripción; todas las palabras,
 *     sin importar mayúsculas ni acentos
 *   seleccionInicial(lista, guardada) → lo guardado que sí se vendió en el periodo
 *   resumenSeleccion(lista, seleccion) → { n, venta, claves (2 primeras por venta), mas }
 */
(function (root) {
  const UMBRAL_CONCENTRACION = 0.5;
  const UMBRAL_DEMANDA = -0.15;
  const RECENCIA_MEDIA = 30;
  const RECENCIA_ALTA = 60;
  const num = (v) => (v == null || !Number.isFinite(Number(v)) ? null : Number(v));
  const prom = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;

  function mesesConHuecos(meses, anio, mesIni, mesFin) {
    const por = new Map((meses || []).map((m) => [m.mes, m]));
    const out = [];
    for (let m = mesIni; m <= mesFin; m++) {
      out.push(por.get(m) || { anio, mes: m, sin_compra: true, cantidad: 0, venta: 0, venta_neta: 0, precio: null });
    }
    return out;
  }

  function cambiosPrecio(meses) {
    let prev = null;
    return (meses || []).filter((m) => num(m.cantidad) > 0 && num(m.precio) != null)
      .sort((a, b) => a.mes - b.mes)
      .map((m) => {
        const cambio = prev == null ? null : m.precio / prev - 1;
        prev = m.precio;
        return { mes: m.mes, anio: m.anio, precio: m.precio, cambio };
      });
  }

  function senales(data, cliente) {
    const out = [];
    const c = (data && data.concentracion) || {};
    if (num(c.top1) != null && c.top1 > UMBRAL_CONCENTRACION) {
      out.push({ tipo: 'concentracion', nivel: 'alta', top1: c.top1, clientes: c.clientes });
    }
    const conCompra = ((cliente && cliente.meses) || []).filter((m) => num(m.cantidad) > 0).sort((a, b) => a.mes - b.mes);
    if (conCompra.length >= 6) {
      const reciente = prom(conCompra.slice(-3).map((m) => Number(m.cantidad)));
      const anterior = prom(conCompra.slice(-6, -3).map((m) => Number(m.cantidad)));
      const variacion = anterior ? reciente / anterior - 1 : null;
      if (variacion != null && variacion < UMBRAL_DEMANDA) {
        out.push({ tipo: 'demanda', nivel: 'alta', anterior, reciente, variacion,
          meses_anteriores: conCompra.slice(-6, -3).map((m) => m.mes), meses_recientes: conCompra.slice(-3).map((m) => m.mes) });
      }
    }
    const d = num(cliente && cliente.dias_sin_compra);
    if (d != null && d > RECENCIA_MEDIA) {
      out.push({ tipo: 'recencia', nivel: d > RECENCIA_ALTA ? 'alta' : 'media', dias: d, ultima: cliente.ultima });
    }
    return out;
  }

  const norm = (v) => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  function filtrarProductos(lista, texto) {
    const palabras = norm(texto).split(/\s+/).filter(Boolean);
    if (!palabras.length) return (lista || []).slice();
    return (lista || []).filter((p) => { const h = norm(p.cve_prod + ' ' + (p.descripcion || '')); return palabras.every((w) => h.includes(w)); });
  }
  function seleccionInicial(lista, guardada) {
    const hay = new Set((lista || []).map((p) => p.cve_prod));
    return (Array.isArray(guardada) ? guardada : []).filter((k) => hay.has(k));
  }

  function resumenSeleccion(lista, seleccion) {
    const sel = seleccion instanceof Set ? seleccion : new Set(seleccion || []);
    const items = (lista || []).filter((p) => sel.has(p.cve_prod)).sort((a, b) => (b.venta_neta || 0) - (a.venta_neta || 0));
    const claves = items.slice(0, 2).map((p) => p.cve_prod);
    return { n: items.length, venta: items.reduce((t, p) => t + (Number(p.venta_neta) || 0), 0), claves, mas: Math.max(0, items.length - claves.length) };
  }

  const api = { mesesConHuecos, cambiosPrecio, senales, filtrarProductos, seleccionInicial, resumenSeleccion, UMBRAL_CONCENTRACION, UMBRAL_DEMANDA, RECENCIA_MEDIA, RECENCIA_ALTA };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KoguKpiCliente = api;
})(typeof window !== 'undefined' ? window : globalThis);

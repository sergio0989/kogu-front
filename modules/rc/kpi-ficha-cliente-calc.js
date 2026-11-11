/* KOGU · Radar comercial — KPI Ventas Cliente (ficha).
 * Funciones puras (sin DOM) para node --test (tests/rc-kpi-ficha-cliente.test.mjs).
 * Trabajan sobre GET /protected/rc/kpi-cliente/ficha y /clientes.
 *   senales(ficha) → [{ tipo, nivel, ... }] en este orden:
 *     recencia  días sin comprar > 2× su ritmo: alta; > 1.5×: media
 *     demanda   recurrente de los últimos 3 meses con venta < −15% vs los 3 previos: alta
 *     anual     venta vs el mismo periodo del año anterior < −10%: alta; > +10%: bien
 *     dejo      productos que compraba el año anterior y este no: media
 *     unicas    venta que no se repite (equipo, servicio): dato
 *     nuevo     sin compras el año anterior: dato
 *   filtrarClientes(lista, texto) → una clave numérica busca la clave exacta;
 *     el texto busca en nombre, agente y clave (todas las palabras, sin acentos)
 */
(function (root) {
  const RECENCIA_ALTA = 2, RECENCIA_MEDIA = 1.5;
  const UMBRAL_DEMANDA = -0.15, UMBRAL_ANUAL = 0.10;
  const num = (v) => (v == null || !Number.isFinite(Number(v)) ? null : Number(v));
  const prom = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const norm = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  function senales(f) {
    const out = [];
    const a = (f && f.actual) || {};
    const ritmo = num(a.ritmo_dias), dias = num(a.dias_sin_compra);
    if (ritmo && ritmo > 0 && dias != null) {
      const veces = dias / ritmo;
      if (veces > RECENCIA_MEDIA) out.push({ tipo: 'recencia', nivel: veces > RECENCIA_ALTA ? 'alta' : 'media', dias, ritmo, veces, ultima: a.ultima || null });
    }
    const conVenta = ((f && f.meses) || []).filter((m) => num(m.recurrente) > 0).sort((x, y) => x.mes - y.mes);
    if (conVenta.length >= 6) {
      const reciente = prom(conVenta.slice(-3).map((m) => Number(m.recurrente)));
      const anterior = prom(conVenta.slice(-6, -3).map((m) => Number(m.recurrente)));
      const variacion = anterior ? reciente / anterior - 1 : null;
      if (variacion != null && variacion < UMBRAL_DEMANDA) {
        out.push({ tipo: 'demanda', nivel: 'alta', reciente, anterior, variacion,
          meses_recientes: conVenta.slice(-3).map((m) => m.mes), meses_anteriores: conVenta.slice(-6, -3).map((m) => m.mes) });
      }
    }
    const v = num(f && f.variacion);
    if (f && f.anterior && v != null) {
      if (v < -UMBRAL_ANUAL) out.push({ tipo: 'anual', nivel: 'alta', variacion: v, actual: num(a.venta_neta), anterior: num(f.anterior.venta_neta) });
      else if (v > UMBRAL_ANUAL) out.push({ tipo: 'anual', nivel: 'bien', variacion: v, actual: num(a.venta_neta), anterior: num(f.anterior.venta_neta) });
    }
    const dejo = ((f && f.productos) || []).filter((p) => p.estado === 'dejo').sort((x, y) => (num(y.anterior) || 0) - (num(x.anterior) || 0));
    if (dejo.length) out.push({ tipo: 'dejo', nivel: 'media', productos: dejo.length, anterior: dejo.reduce((s, p) => s + (num(p.anterior) || 0), 0), claves: dejo.map((p) => p.cve_prod) });
    if ((num(a.unica) || 0) > 0.005) out.push({ tipo: 'unicas', nivel: 'dato', monto: num(a.unica), parte: num(a.venta_neta) ? a.unica / a.venta_neta : null });
    if (f && !f.anterior) out.push({ tipo: 'nuevo', nivel: 'dato', primera: a.primera || null });
    return out;
  }

  function filtrarClientes(lista, texto) {
    const t = String(texto ?? '').trim();
    if (!t) return (lista || []).slice();
    if (/^\d+$/.test(t)) return (lista || []).filter((c) => String(c.cve_cte) === t);
    const palabras = norm(t).split(/\s+/).filter(Boolean);
    return (lista || []).filter((c) => { const h = norm(`${c.cve_cte} ${c.cliente || ''} ${c.agente || ''}`); return palabras.every((w) => h.includes(w)); });
  }

  const api = { senales, filtrarClientes, RECENCIA_ALTA, RECENCIA_MEDIA, UMBRAL_DEMANDA, UMBRAL_ANUAL };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KoguFichaCliente = api;
})(typeof window !== 'undefined' ? window : globalThis);

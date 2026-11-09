/*
 * modules/cto/requisiciones-comun.js — Costo · Precios de requisiciones.
 * Logica pura de las pantallas (sin DOM ni red): etiquetas, resumen, si se
 * puede aprobar, numero de la requisicion, validacion de edicion y formatos.
 * Se usa en el navegador como window.CtoReq y en node con require().
 * Prueba: tests/cto-requisiciones-comun.test.mjs (respuestas reales del backend).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CtoReq = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const TIPOS = {
    exacta: 'Exacta',
    variante: 'Variante -MQ (mismo lote)',
    pactado: 'Precio pactado',
    ultima_compra: 'Última compra',
    sin_coincidencia: 'Sin coincidencia',
    pendiente_lote: 'Pendiente de lote',
    sin_cantidad: 'Sin cantidad',
  };
  // Explicacion corta para el title= del chip.
  const AYUDA_TIPO = {
    exacta: 'Compra del mismo producto con el mismo lote.',
    variante: 'El lote pedido está en la clave -MQ (o en la base): se usó esa compra.',
    pactado: 'Precio fijo del catálogo de precios pactados; no lleva margen.',
    ultima_compra: 'No hay compra con ese lote: se usó la compra más reciente del producto.',
    sin_coincidencia: 'El producto no está en el kardex: captura el precio a mano.',
    pendiente_lote: 'Almacén aún no asigna el lote.',
    sin_cantidad: 'La partida viene con cantidad 0.',
  };
  const AVISOS = {
    variante: 'variante -MQ',
    costo_antiguo: 'costo antiguo',
    lote_costos_distintos: 'lote con costos distintos',
    lote_req_sin_costo: 'el lote pedido entró con costo 0',
    lote_solo_produccion: 'el lote pedido solo existe como producción',
    moneda_desconocida: 'moneda desconocida',
    iva_difiere: 'IVA compra ≠ venta',
    sin_iva_venta: 'sin IVA de venta',
    requiere_manual: 'requiere precio manual',
    precio_editado: 'precio editado',
  };
  // Avisos que piden revisar (se pintan en ambar); el resto es informativo.
  const AVISOS_REVISAR = new Set(['costo_antiguo', 'lote_costos_distintos', 'iva_difiere', 'requiere_manual', 'moneda_desconocida']);
  const STATUS = { recibida: 'Recibida', calculada: 'Calculada', aprobada: 'Aprobada', enviada: 'Enviada', cancelada: 'Cancelada' };
  const STATUS_BADGE = { recibida: 'neutral', calculada: 'primary', aprobada: 'success', enviada: 'success', cancelada: 'danger' };
  const PASOS = ['recibida', 'calculada', 'aprobada', 'enviada'];
  const CERRADAS = ['aprobada', 'enviada', 'cancelada'];

  const etiquetaTipo = (r) => TIPOS[r] || r || '—';
  const ayudaTipo = (r) => AYUDA_TIPO[r] || '';
  const etiquetasAvisos = (b) => (b || []).map((x) => AVISOS[x] || x);
  const esAvisoRevisar = (x) => AVISOS_REVISAR.has(x);
  const etiquetaStatus = (s) => STATUS[s] || s || '—';
  const badgeStatus = (s) => STATUS_BADGE[s] || 'neutral';
  const abierta = (s) => !CERRADAS.includes(s);

  function resumen(partidas) {
    const ps = partidas || [];
    const cuenta = (f) => ps.filter(f).length;
    return {
      total: ps.length,
      con_precio: cuenta((p) => p.precio_final != null),
      pendientes_lote: cuenta((p) => p.regla === 'pendiente_lote'),
      sin_coincidencia: cuenta((p) => p.regla === 'sin_coincidencia'),
      sin_cantidad: cuenta((p) => p.regla === 'sin_cantidad'),
      manuales: cuenta((p) => p.es_manual),
      con_avisos: cuenta((p) => (p.banderas || []).length > 0),
    };
  }

  const faltanParaAprobar = (partidas) => (partidas || [])
    .filter((p) => p.regla !== 'sin_cantidad' && p.precio_final == null)
    .map((p) => p.renglon);

  function numDelArchivo(nombre) {
    const m = String(nombre || '').match(/REQUISICI[OÓ]N[\s_-]*(\d+)/i);
    return m ? m[1] : null;
  }

  const up = (v) => (v == null ? '' : String(v).trim().toUpperCase());
  const filaEncabezado = (rows) => (rows || []).findIndex((r) => Array.isArray(r) && r.some((c) => up(c) === 'CODIGO'));

  function numDelTitulo(rows) {
    const h = filaEncabezado(rows);
    for (let i = (h < 0 ? (rows || []).length : h) - 1; i >= 0; i--) {
      for (const c of rows[i] || []) {
        const m = up(c).match(/REQUISICI[OÓ]N\s*(\d+)/);
        if (m) return m[1];
      }
    }
    return null;
  }

  function contarPartidas(rows) {
    const h = filaEncabezado(rows);
    if (h < 0) return 0;
    const col = rows[h].findIndex((c) => up(c) === 'CODIGO');
    return rows.slice(h + 1).filter((r) => up((r || [])[col])).length;
  }

  const num = (v) => {
    if (v == null || String(v).trim() === '') return null;
    const n = Number(String(v).replace(/,/g, '').trim());
    return Number.isFinite(n) ? n : null;
  };

  function validarEdicion({ precio, sugerido, motivo }) {
    const n = num(precio);
    if (n == null || n < 0) return 'Captura un precio válido.';
    const s = num(sugerido);
    const difiere = s == null || Math.abs(n - s) > 1e-6;
    if (difiere && !String(motivo || '').trim()) return 'Un precio distinto al sugerido necesita motivo.';
    return null;
  }

  function ivaDeTexto(v) {
    const s = String(v ?? '').replace('%', '').trim();
    if (s === '') return undefined;
    const n = num(s);
    if (n == null || n < 0) return null;
    const t = n > 1 ? n / 100 : n;
    return t > 1 ? null : Math.round(t * 1e4) / 1e4;
  }

  const fmtNum = new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  const fmtPrecio = (v, moneda) => (v == null ? '—' : `${fmtNum.format(Number(v))} ${moneda || ''}`.trim());
  const fmtIva = (t) => (t == null ? '—' : `${Math.round(Number(t) * 100)}%`);
  function fmtFecha(v) {
    const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : (v ? String(v) : '—');
  }
  // El lote se guarda como llego; en pantalla sin el acento/apostrofo que
  // Excel deja al inicio ('´605000177' en la REQUISICION 931 real).
  function loteVisible(l) {
    const t = String(l ?? '').trim().replace(/^['´`]+/, '').trim();
    return t || '—';
  }

  function entrada(m) {
    if (!m) return '—';
    const partes = [m.no_ref || (m.no_pedc ? `OC ${m.no_pedc}` : null), m.f_mov ? fmtFecha(m.f_mov) : null].filter(Boolean);
    return partes.length ? partes.join(' · ') : '—';
  }

  return {
    TIPOS, AVISOS, PASOS, etiquetaTipo, ayudaTipo, etiquetasAvisos, esAvisoRevisar, etiquetaStatus, badgeStatus, abierta,
    resumen, faltanParaAprobar, numDelArchivo, numDelTitulo, contarPartidas, validarEdicion, ivaDeTexto,
    fmtPrecio, fmtIva, fmtFecha, entrada, num, loteVisible,
  };
});

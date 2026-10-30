/*
 * modules/cob/cob-comun.js — Cobranza F1 · lógica pura de Cartera y Cargar corte.
 * Sin DOM ni red: filtros, fichas, orden, agrupación, avisos y formatos.
 * Se usa en el navegador como window.CobComun y en node con require().
 * Prueba: tests/cob-comun.test.mjs (datos reales del corte SAI 20-oct-2026).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CobComun = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const fm2 = new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fm0 = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 });
  const r2 = (x) => Math.round((Number(x) + Number.EPSILON) * 100) / 100;
  // Suma con el saldo exacto (saldo x TC sin redondear, como SAI); el redondeado
  // por renglón se desvía centavos del total del reporte.
  const mxn = (d) => Number(d.saldo_mxn_exacto ?? d.saldo_mxn ?? 0);
  const suma = (docs) => r2(docs.reduce((s, d) => s + mxn(d), 0));

  // Rangos de antigüedad del reporte SAI (bucket 1..5 que calcula el backend).
  const BUCKETS = ['Por vencer', '1-30', '31-60', '61-90', '+90'];
  const etiquetaBucket = (b) => BUCKETS[b - 1] || '—';

  // Fichas de la pantalla. En F1 no hay acuerdos: "Vencido" es todo lo vencido;
  // "vencido sin acuerdo" y "promesas vencidas" llegan con F1b.
  const FICHAS = [
    { k: 'cartera', l: 'Cartera', color: '#64748b', f: () => true },
    { k: 'b1', l: 'Por vencer', color: '#16a34a', f: (d) => d.bucket === 1 },
    { k: 'b2', l: 'Vencido 1-30', color: '#d97706', f: (d) => d.bucket === 2 },
    { k: 'b3', l: '31-60', color: '#ea580c', f: (d) => d.bucket === 3 },
    { k: 'b4', l: '61-90', color: '#dc2626', f: (d) => d.bucket === 4 },
    { k: 'b5', l: 'Más de 90', color: '#7f1d1d', f: (d) => d.bucket === 5 },
    { k: 'vencido', l: 'Vencido', color: '#dc2626', valor: true, f: (d) => !!d.vencido },
  ];

  // F1b: fichas de seguimiento (las marcas vienen calculadas del backend por identidad de factura).
  const FICHAS_SEG = [
    { k: 'sin_seguimiento', l: 'Vencido sin seguimiento', color: '#b91c1c', f: (d) => !!d.sin_seguimiento,
      ayuda: 'Vencidas sin ningún seguimiento en los últimos 7 días al corte.' },
    { k: 'compromiso_vencido', l: 'Compromisos vencidos', color: '#d97706', f: (d) => !!d.compromiso_vencido,
      ayuda: 'La fecha comprometida ya pasó y la factura sigue abierta.' },
  ];
  // Control CFDI (GET /protected/cob/controles/cfdi): lo fiscal y lo que es hueco
  // de la descarga del SAT van en fichas distintas.
  const CFDI_FISCAL = ['no_encontrado', 'cancelado', 'sin_cfdi', 'sin_estatus'];
  const FICHAS_CFDI = [
    { k: 'cfdi_sin_vigente', l: 'Sin CFDI vigente', color: '#b91c1c', f: (d) => CFDI_FISCAL.includes(d.cfdi_estado),
      ayuda: 'El CFDI no aparece, está cancelado o el SAT no lo encuentra, aunque ese día sí hay CFDI descargados. Revisar con Facturación.' },
    { k: 'cfdi_descarga', l: 'Falta descargar CFDI', color: '#64748b', f: (d) => d.cfdi_estado === 'falta_descarga',
      ayuda: 'Ese día no hay ningún CFDI emitido descargado en KOGU: hay que pedir la descarga de esa fecha en Solicitudes SAT.' },
  ];
  const ETIQUETA_CFDI = { no_encontrado: 'Sin CFDI vigente', cancelado: 'Sin CFDI vigente', sin_cfdi: 'Sin CFDI vigente', sin_estatus: 'Sin CFDI vigente', falta_descarga: 'CFDI por descargar' };
  const fichaDe = (k) => FICHAS.find((x) => x.k === k) || FICHAS_SEG.find((x) => x.k === k) || FICHAS_CFDI.find((x) => x.k === k) || null;

  function folioDe(d) { return (d.serie ? d.serie + ' ' : '') + d.folio; }

  function resumenFichas(docs) {
    return FICHAS.map((F) => {
      const a = docs.filter(F.f);
      const out = { k: F.k, l: F.l, color: F.color, valor: !!F.valor, docs: a.length, saldo_mxn: suma(a) };
      if (F.k === 'cartera') out.clientes = new Set(a.map((d) => d.cve_cte)).size;
      return out;
    });
  }

  // Saldo en la moneda del documento (sin convertir): pesos y dólares no se suman.
  const sumaSaldo = (docs) => r2(docs.reduce((s, d) => s + Number(d.saldo || 0), 0));
  const MONEDAS = ['MXN', 'USD'];

  // Fichas en dos filas, una por moneda, cada una en su moneda (como el reporte
  // de Facturación, que lleva columnas USD y MXN separadas).
  function fichasPorMoneda(docs) {
    return MONEDAS.map((moneda) => {
      const dm = docs.filter((d) => d.moneda === moneda);
      return { moneda, fichas: FICHAS.map((F) => {
        const a = dm.filter(F.f);
        const out = { k: F.k, l: F.l, color: F.color, valor: !!F.valor, docs: a.length, saldo: sumaSaldo(a) };
        if (F.k === 'cartera') out.clientes = new Set(a.map((d) => d.cve_cte)).size;
        return out;
      }) };
    });
  }

  function fichasSeguimiento(docs) {
    return FICHAS_SEG.map((F) => {
      const a = docs.filter(F.f);
      return { k: F.k, l: F.l, color: F.color, ayuda: F.ayuda, docs: a.length, por_moneda: totalesMoneda(a) };
    });
  }

  // Marca cada documento con el estado de su CFDI (las vigentes no traen alerta).
  function unirControlCfdi(docs, control) {
    const m = new Map(((control && control.alertas) || []).map((a) => [a.documento_id, a]));
    for (const d of docs) {
      const a = m.get(d.documento_id);
      if (a) { d.cfdi_estado = a.estado; d.cfdi_uuid = a.uuid || null; d.cfdi_estatus_sat = a.estatus_sat || null; } else { delete d.cfdi_estado; }
    }
    return docs;
  }

  function fichasCfdi(docs) {
    return FICHAS_CFDI.map((F) => {
      const a = docs.filter(F.f);
      return { k: F.k, l: F.l, color: F.color, ayuda: F.ayuda, docs: a.length, por_moneda: totalesMoneda(a),
        fechas: [...new Set(a.map((d) => d.fecha_doc))].sort() };
    });
  }

  function opcionesAgentes(docs) {
    const m = new Map();
    for (const d of docs) if (d.agente_id) m.set(d.agente_id, d.agente || d.agente_id);
    return [...m.entries()].map(([valor, nombre]) => ({ valor, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }

  function totalesMoneda(docs) {
    const out = {};
    for (const m of MONEDAS) { const a = docs.filter((d) => d.moneda === m); out[m] = { docs: a.length, saldo: sumaSaldo(a) }; }
    return out;
  }

  // Sesión semanal: 'sesion' = clientes que se revisan, 'excluidos' = los
  // marcados fuera en el catálogo (p. ej. factoraje), vacío o 'todos' = SAI completo.
  const SESION = { sesion: 'Solo los que se revisan', todos: 'Todos', excluidos: 'Fuera de la sesión' };
  function enSesion(d, s) {
    if (!s || s === 'todos') return true;
    return s === 'excluidos' ? d.en_sesion === false : d.en_sesion !== false;
  }
  function fueraDeSesion(docs) {
    const a = docs.filter((d) => d.en_sesion === false);
    return { docs: a.length, clientes: new Set(a.map((d) => d.cve_cte)).size, por_moneda: totalesMoneda(a) };
  }

  function filtrar(docs, f = {}) {
    const q = (f.q || '').trim().toLowerCase();
    const ficha = f.ficha ? fichaDe(f.ficha) : null;
    return docs.filter((d) =>
      (!f.cliente || d.cve_cte === f.cliente) &&
      (!f.responsable || (f.responsable === '__none' ? !d.responsable_id : d.responsable_id === f.responsable)) &&
      (!f.moneda || d.moneda === f.moneda) &&
      enSesion(d, f.sesion) &&
      (!q || folioDe(d).toLowerCase().includes(q)) &&
      (!ficha || ficha.f(d)));
  }

  function ordenar(docs, key, dir = 1) {
    const val = (d) => (key === 'folio' ? folioDe(d) : d[key]);
    return [...docs].sort((a, b) => {
      const x = val(a); const y = val(b);
      if (x == null && y == null) return 0;
      if (x == null) return 1;            // vacíos al final en cualquier sentido
      if (y == null) return -1;
      if (typeof x === 'number' && typeof y === 'number') return (x - y) * dir;
      return String(x).localeCompare(String(y), 'es', { numeric: true }) * dir;
    });
  }

  function agrupar(docs) {
    const g = new Map();
    for (const d of docs) {
      if (!g.has(d.cve_cte)) g.set(d.cve_cte, { cve_cte: d.cve_cte, cliente: d.cliente, docs: [] });
      g.get(d.cve_cte).docs.push(d);
    }
    return [...g.values()]
      .map((x) => ({ ...x, saldo_mxn: suma(x.docs), vencidas: x.docs.filter((d) => d.vencido && !d.nota).length,
        por_moneda: { MXN: sumaSaldo(x.docs.filter((d) => d.moneda === 'MXN')), USD: sumaSaldo(x.docs.filter((d) => d.moneda === 'USD')) } }))
      .sort((a, b) => b.saldo_mxn - a.saldo_mxn);
  }

  function avisos(docs, corte) {
    const out = [];
    const notas = docs.filter((d) => d.nota);
    const res = docs.filter((d) => d.residuo);
    if (corte && corte.desactualizado) {
      out.push({ tipo: 'desactualizado', texto: `El corte tiene ${corte.dias_desde_corte} días; carga el de esta semana antes de la sesión.` });
    }
    if (notas.length) {
      out.push({ tipo: 'notas', docs: notas.length, saldo_mxn: suma(notas),
        texto: `${notas.length} notas de crédito por aplicar (${dinero(suma(notas))}) restan dentro de su antigüedad.` });
    }
    if (res.length) {
      out.push({ tipo: 'residuos', docs: res.length, saldo_mxn: suma(res),
        texto: `${res.length} saldos menores a $50 (${dinero(suma(res))}): residuos de cobro o tipo de cambio para depurar.` });
    }
    return out;
  }

  function opcionesClientes(docs) {
    const m = new Map();
    for (const d of docs) if (!m.has(d.cve_cte)) m.set(d.cve_cte, d.cliente || d.nom_cte_sai || d.cve_cte);
    return [...m.entries()].map(([valor, nombre]) => ({ valor, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }

  function opcionesResponsables(docs) {
    const m = new Map(); let sin = false;
    for (const d of docs) { if (d.responsable_id) m.set(d.responsable_id, d.responsable || d.responsable_id); else sin = true; }
    const out = [...m.entries()].map(([valor, nombre]) => ({ valor, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    if (sin) out.push({ valor: '__none', nombre: 'Sin responsable' });
    return out;
  }

  // Misma regla que el backend: vencido (rango 2..5) por responsable de cobranza.
  function porResponsable(docs) {
    const m = new Map();
    for (const d of docs) {
      if (!d.vencido) continue;
      const k = d.responsable_id || '';
      const g = m.get(k) || { responsable_id: d.responsable_id || null, responsable: d.responsable || 'Sin responsable', docs: 0, vencido_mxn: 0,
        por_moneda: { MXN: { docs: 0, saldo: 0 }, USD: { docs: 0, saldo: 0 } } };
      g.docs += 1; g.vencido_mxn += mxn(d);
      const pm = g.por_moneda[d.moneda]; if (pm) { pm.docs += 1; pm.saldo += Number(d.saldo || 0); }
      m.set(k, g);
    }
    return [...m.values()].map((g) => ({ ...g, vencido_mxn: r2(g.vencido_mxn),
      por_moneda: { MXN: { ...g.por_moneda.MXN, saldo: r2(g.por_moneda.MXN.saldo) }, USD: { ...g.por_moneda.USD, saldo: r2(g.por_moneda.USD.saldo) } } }))
      .sort((a, b) => (a.responsable_id === null) - (b.responsable_id === null) || b.vencido_mxn - a.vencido_mxn);
  }

  // El export de SAI se hace el viernes en la tarde: ese es el corte por omisión.
  function viernesMasReciente(hoyISO) {
    const [y, m, d] = hoyISO.split('-').map(Number);
    const t = new Date(Date.UTC(y, m - 1, d));
    const atras = (t.getUTCDay() - 5 + 7) % 7;
    t.setUTCDate(t.getUTCDate() - atras);
    return t.toISOString().slice(0, 10);
  }

  function fmtFecha(s) {
    if (!s) return '—';
    const [y, m, d] = String(s).slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
  }
  function dinero(v) { return (v < 0 ? '-$' : '$') + fm2.format(Math.abs(Number(v) || 0)); }
  function dineroCorto(v) {
    const n = Number(v) || 0;
    return Math.abs(n) >= 1e6 ? `${n < 0 ? '-' : ''}$${(Math.abs(n) / 1e6).toFixed(2)}M` : (n < 0 ? '-$' : '$') + fm0.format(Math.abs(n));
  }
  function numero(v) { return fm2.format(Number(v) || 0); }
  function dineroCortoMoneda(v, moneda) {
    const t = dineroCorto(v);
    return moneda === 'USD' ? t.replace('$', 'US$') : t;
  }

  return { FICHAS_CFDI, ETIQUETA_CFDI, unirControlCfdi, fichasCfdi, SESION, fueraDeSesion, FICHAS_SEG, fichaDe, fichasSeguimiento, opcionesAgentes, BUCKETS, FICHAS, MONEDAS, etiquetaBucket, folioDe, resumenFichas, fichasPorMoneda, totalesMoneda, dineroCortoMoneda, filtrar, ordenar, agrupar, avisos,
    opcionesClientes, opcionesResponsables, porResponsable, viernesMasReciente, fmtFecha, dinero, dineroCorto, numero };
});

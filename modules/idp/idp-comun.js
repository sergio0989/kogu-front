/* KOGU · I+D (idp_) — lógica compartida del front.
 * Parte pura (probada con node --test tests/idp-comun.test.mjs) + ayudas de
 * navegador (modal, descarga con sesión). En el navegador queda en window.KoguIdp.
 */
(function (root) {
  const BASE = '/protected/idp';

  // ── Fases del ciclo (stepper de 5 pasos sobre los estados del catálogo) ──
  const FASES = ['Alta', 'Autorización', 'Desarrollo', 'Cliente', 'Cierre'];
  const FASE_POR_ESTADO = {
    generado: 0, rechazado: 0,
    autorizado: 1, asignado: 1,
    en_desarrollo: 2, muestra_entregada: 2, reformular: 2, remuestreo: 2,
    enviado_cliente: 3, hold: 3, aprobado: 3, no_aprobado: 3, recotizar: 3, prueba_piloto: 3,
    finalizado: 4, cancelado: 4,
  };
  function faseDe(clave, categoria) {
    if (clave in FASE_POR_ESTADO) return FASE_POR_ESTADO[clave];
    if (categoria === 'inicial') return 0;
    if (categoria === 'cierre' || categoria === 'cancelado') return 4;
    return null;   // estado propio de la empresa sin fase conocida: el stepper no marca avance
  }

  // ── Color del chip de estado ──
  function colorEstado(clave, categoria) {
    if (clave === 'aprobado' || categoria === 'cierre') return '#16a34a';
    if (clave === 'no_aprobado' || clave === 'rechazado') return '#dc2626';
    if (clave === 'hold') return '#ca8a04';
    if (categoria === 'cancelado') return '#991b1b';
    if (categoria === 'inicial') return '#64748b';
    return '#2563eb';
  }
  const COLOR_POTENCIAL = { A: '#16a34a', B: '#2563eb', C: '#64748b' };

  // ── Cambio de estado: qué pedir, validar y qué enviar ──
  function camposTransicion(accion, catalogo) {
    const rq = (accion && accion.requiere) || {};
    const motivos = rq.motivo
      ? ((catalogo && catalogo.motivos) || []).filter((m) => m.activo !== false && m.tipo === rq.motivo)
      : null;
    return {
      motivos,
      desarrolladores: rq.desarrollador ? ((catalogo && catalogo.desarrolladores) || []) : null,
      pideCierre: !!rq.cierre_vendido,
    };
  }
  function validarTransicion(campos, v) {
    v = v || {};
    if (campos.motivos && !v.motivo_id) return 'Selecciona el motivo.';
    if (campos.desarrolladores && !v.desarrollador_id) return 'Selecciona el desarrollador.';
    if (campos.pideCierre && !['si', 'no'].includes(v.cierre_vendido)) return 'Indica si el proyecto se vendió.';
    return null;
  }
  function cuerpoTransicion(accion, v) {
    v = v || {};
    const rq = accion.requiere || {};
    const b = { a: accion.a };
    if (rq.motivo && v.motivo_id) b.motivo_id = v.motivo_id;
    if (rq.desarrollador && v.desarrollador_id) b.desarrollador_id = v.desarrollador_id;
    if (rq.cierre_vendido && ['si', 'no'].includes(v.cierre_vendido)) b.cierre_vendido = v.cierre_vendido === 'si';
    const c = String(v.comentario || '').trim();
    if (c) b.comentario = c;
    return b;
  }

  // ── Estancado ──
  const DIA = 86400000;
  function diasSinMovimiento(fechaIso, hoy) {
    if (!fechaIso) return null;
    const h = hoy ? new Date(String(hoy).slice(0, 10) + 'T00:00:00Z') : new Date();
    const d = new Date(String(fechaIso).slice(0, 10) + 'T00:00:00Z');
    return Math.floor((h - d) / DIA);
  }
  function estancado(p, hoy, umbral) {
    if (!p || ['cierre', 'cancelado'].includes(p.estado_categoria)) return false;
    const d = diasSinMovimiento(p.ultimo_evento_at || p.created_at, hoy);
    return d != null && d >= (umbral || 90);
  }

  // ── Formatos ──
  function fmtUsd(n) {
    if (n === null || n === undefined || n === '' || !Number.isFinite(Number(n))) return '—';
    return 'USD ' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
  }
  function fmtNum(n, dec) {
    if (n === null || n === undefined || n === '') return '—';
    return Number(n).toLocaleString('es-MX', { maximumFractionDigits: dec == null ? 2 : dec });
  }


  // ── Fichas técnicas ──
  const tx = (v) => { const t = String(v ?? '').trim(); return t || null; };
  const nm = (v) => (v === null || v === undefined || String(v).trim() === '' ? null : Number(v));
  const ALERGENOS = [
    ['gluten', 'Cereales con gluten'], ['huevo', 'Huevo'], ['crustaceos', 'Crustáceos'], ['pescado', 'Pescado'],
    ['moluscos', 'Moluscos'], ['cacahuate', 'Cacahuate'], ['soya', 'Soya'], ['leche', 'Leche'],
    ['nueces', 'Nueces de árbol'], ['sulfitos', 'Sulfitos (≥10 mg/kg)'],
  ];
  const PARAMETROS_BASE = [
    { nombre: 'Humedad', unidad: '%' }, { nombre: 'pH (solución al 10%)', unidad: '' },
    { nombre: 'Cloruros como NaCl', unidad: '%' }, { nombre: 'Cenizas', unidad: '%' },
  ];
  function contenidoFicha(v) {
    v = v || {};
    const valor = nm(v.vida_valor);
    return {
      descripcion: tx(v.descripcion), ingredientes: tx(v.ingredientes), transporte_almacenamiento: tx(v.transporte),
      organolepticos: { aspecto: tx(v.aspecto), color: tx(v.color), olor: tx(v.olor), sabor: tx(v.sabor) },
      alergenos: Array.isArray(v.alergenos) ? v.alergenos.slice() : [],
      // Sin nombre o sin mínimo ni máximo = no aplica (como el 0/0 del legado); el backend los rechazaría.
      parametros: (v.parametros || []).filter((p) => tx(p.nombre) && (nm(p.min) !== null || nm(p.max) !== null)).map((p) => ({
        nombre: tx(p.nombre), unidad: String(p.unidad ?? '').trim(), min: nm(p.min), max: nm(p.max) })),
      empaque: { mercado: v.empaque_mercado || null, descripcion: tx(v.empaque_descripcion) },
      vida_util: valor && valor > 0 ? { valor, unidad: v.vida_unidad || 'meses' } : null,
    };
  }
  function faltantesFicha(c) {
    c = c || {}; const o = c.organolepticos || {};
    return [
      !c.descripcion && 'Descripción', !o.aspecto && 'Aspecto', !o.color && 'Color', !o.olor && 'Olor', !o.sabor && 'Sabor',
      !(c.vida_util && c.vida_util.valor > 0) && 'Vida útil',
    ].filter(Boolean);
  }

  // ── Listas de precios ──
  function idProductoPartida(v) {
    if (v.tipo === 'experimental') return { producto_desarrollo_id: v.producto_desarrollo_id || null };
    if (v.tipo === 'erp') return { producto_id: v.producto_id || null };
    return { producto_id: v.producto_id || null, producto_desarrollo_id: v.producto_desarrollo_id || null };
  }
  function validarPartida(v) {
    v = v || {};
    const ids = Object.values(idProductoPartida(v)).filter(Boolean);
    if (ids.length !== 1) return 'Elige un producto: clave ERP o clave experimental.';
    const precio = nm(v.precio);
    if (precio === null || !Number.isFinite(precio) || precio < 0) return 'Captura un precio válido.';
    const imp = nm(v.impuesto_pct);
    if (imp !== null && (!Number.isFinite(imp) || imp < 0 || imp > 100)) return 'El impuesto va de 0 a 100 %.';
    const min = nm(v.cantidad_min); const max = nm(v.cantidad_max);
    if (min !== null && max !== null && max < min) return 'La cantidad máxima es menor que la mínima.';
    return null;
  }
  function cuerpoPartida(v) {
    const b = {};
    for (const [k, val] of Object.entries(idProductoPartida(v))) if (val) b[k] = val;
    b.precio = nm(v.precio);
    for (const k of ['impuesto_pct', 'cantidad_min', 'cantidad_max']) { const n = nm(v[k]); if (n !== null) b[k] = n; }
    for (const k of ['descripcion', 'tiempo_entrega']) { const t = tx(v[k]); if (t) b[k] = t; }
    return b;
  }
  const ETIQUETA_LISTA = { borrador: 'Borrador', por_aprobar: 'Por aprobar', vigente: 'Vigente', vencida: 'Vencida', cancelada: 'Cancelada' };
  const COLOR_LISTA = { borrador: '#64748b', por_aprobar: '#ca8a04', vigente: '#16a34a', vencida: '#b45309', cancelada: '#991b1b' };
  function estadoLista(l, hoy) {
    const h = hoy || new Date(Date.now() - 6 * 3600e3).toISOString().slice(0, 10);
    const fin = l.vigencia_fin ? String(l.vigencia_fin).slice(0, 10) : null;
    if (l.estado === 'vigente' && fin && fin < h) return 'vencida';
    return l.estado_efectivo || l.estado;
  }

  // Precio: 2 decimales; 4 si el precio trae fracción más fina (numeric 18,4).
  function fmtPrecio(n) {
    if (n === null || n === undefined || n === '') return '—';
    const v = Number(n); const d = Math.abs(Math.round(v * 100) - v * 100) > 1e-6 ? 4 : 2;
    return v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  // ── Catálogos de I+D (GET /protected/idp/catalogos) ──
  // Mismas reglas que el backend: clave ^[a-z0-9_]{2,60}$, fija después del alta.
  const CLAVE_CATALOGO_RE = /^[a-z0-9_]{2,60}$/;
  const CATALOGOS_REQUISITO = ['etiquetado', 'estado_fisico', 'envase', 'almacenamiento', 'clasificacion',
    'solubilidad', 'demostracion', 'envio', 'certificacion', 'documento'];
  function claveDesdeNombre(nombre) {
    return String(nombre ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60).replace(/_+$/, '');
  }
  const porOrden = (a, b) => (Number(a.orden) || 0) - (Number(b.orden) || 0) || String(a.nombre).localeCompare(String(b.nombre), 'es');
  // Principales con sus hijos; si el padre no existe, el valor se muestra como principal.
  function arbolCatalogo(valores) {
    const lista = valores || [];
    const ids = new Set(lista.map((v) => v.valor_id));
    const raiz = lista.filter((v) => !v.padre_id || !ids.has(v.padre_id)).sort(porOrden);
    return raiz.map((v) => ({ ...v, hijos: lista.filter((h) => h.padre_id === v.valor_id).sort(porOrden).map((h) => ({ ...h, hijos: [] })) }));
  }
  function validarValorCatalogo(v, existentes) {
    if (!String(v.nombre || '').trim()) return 'Escribe el nombre.';
    const clave = String(v.clave || '').trim();
    if (!CLAVE_CATALOGO_RE.test(clave)) return 'La clave va en minúsculas, sin espacios ni acentos (letras, números y _), de 2 a 60.';
    if ((existentes || []).some((x) => x.catalogo === v.catalogo && x.clave === clave)) return `La clave ${clave} ya existe en este catálogo.`;
    return null;
  }
  function cuerpoValorCatalogo(f) {
    const b = { catalogo: f.catalogo, clave: String(f.clave || '').trim(), nombre: String(f.nombre || '').trim() };
    if (f.orden !== '' && f.orden != null && Number.isFinite(Number(f.orden))) b.orden = Number(f.orden);
    if (f.padre_id) b.padre_id = f.padre_id;
    return b;
  }
  // Opciones para un select: activas (subsegmento como "Padre › Hijo") + el valor actual aunque esté inactivo.
  function opcionesCatalogo(valores, actual) {
    const out = [];
    for (const p of arbolCatalogo(valores)) {
      for (const v of [p, ...p.hijos]) {
        if (v.activo === false && v.clave !== actual) continue;
        const etiqueta = (v === p ? v.nombre : `${p.nombre} › ${v.nombre}`) + (v.activo === false ? ' (inactivo)' : '');
        out.push({ clave: v.clave, etiqueta, activo: v.activo !== false });
      }
    }
    return out;
  }
  function requisitosDeLinea(linea) {
    const r = (linea && linea.config && Array.isArray(linea.config.requisitos)) ? linea.config.requisitos : [];
    return r.filter((k) => CATALOGOS_REQUISITO.includes(k));
  }

  // ── Requisitos del proyecto (contrato: backend qa/idp-requisitos.test.mjs) ──
  const CAMPOS_REQUISITO_GENERALES = ['termoresistente', 'alergenos', 'alergenos_lista', 'proceso', 'dosis', 'vida_anaquel_meses', 'direccion_envio'];
  const CAMPOS_POR_BLOQUE = {
    certificacion: ['certificaciones', 'certificacion_otro'],
    documento: ['documentos_requeridos', 'documento_requerido_otro', 'documentos_entregados', 'documento_entregado_otro'],
  };
  const NUMERICOS_REQUISITO = ['dosis', 'vida_anaquel_meses'];
  function bloquesRequisitos(lineaValor) {
    const r = requisitosDeLinea(lineaValor);
    return r.length ? r : CATALOGOS_REQUISITO.slice();
  }
  function camposDeBloques(bloques) {
    return [...(bloques || []).flatMap((b) => CAMPOS_POR_BLOQUE[b] || [b]), ...CAMPOS_REQUISITO_GENERALES];
  }
  const sinDato = (v) => v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length);
  function normReq(k, v) {
    if (sinDato(v)) return null;
    if (NUMERICOS_REQUISITO.includes(k)) { const n = Number(v); return Number.isFinite(n) ? n : v; }
    if (typeof v === 'string') return v.trim() || null;
    return v;
  }
  const igualReq = (a, b) => (Array.isArray(a) && Array.isArray(b)
    ? a.length === b.length && [...a].sort().join('\u0001') === [...b].sort().join('\u0001')
    : a === b);
  // Solo lo que cambió respecto a lo guardado; lo vaciado va como null. Sin cambios → null.
  function cuerpoRequisitos(nuevo, guardado) {
    const g = guardado || {}; const out = {};
    for (const [k, v] of Object.entries(nuevo || {})) {
      const n = normReq(k, v); const o = normReq(k, g[k]);
      if (!igualReq(n, o)) out[k] = n;
    }
    return Object.keys(out).length ? out : null;
  }
  // Muestras: piezas + contenido de cada pieza (CRM: cantidad + unidadn/unidad).
  function porcionMuestra(m) {
    const x = m || {};
    const contenido = x.cantidad !== null && x.cantidad !== undefined && x.cantidad !== '' ? `${Number(x.cantidad)}${x.unidad ? ' ' + x.unidad : ''}` : '';
    if (x.piezas === null || x.piezas === undefined || x.piezas === '') return contenido;
    const n = Number(x.piezas);
    return `${n} pieza${n === 1 ? '' : 's'}${contenido ? ' de ' + contenido : ''}`;
  }
  function validarPiezas(v) {
    if (v === null || v === undefined || String(v).trim() === '') return null;
    const n = Number(v);
    return Number.isInteger(n) && n >= 1 ? null : 'Las piezas deben ser un número entero de 1 en adelante.';
  }

  // ── Alta de proyecto en 4 pasos (copia de generar_proyecto.php del CRM) ──
  const PASOS_ALTA = ['Información del proyecto', 'Información de negocio', 'Detalles del desarrollo', 'Información adicional'];
  const BLOQUES_PASO_ALTA = {
    3: ['etiquetado', 'estado_fisico', 'envase', 'almacenamiento', 'certificacion', 'documento', 'envio'],
    4: ['clasificacion', 'solubilidad', 'demostracion'],
  };
  function fechaSugeridaAlta(hoy) {
    const [a, m, d] = String(hoy).slice(0, 10).split('-').map(Number);
    return new Date(Date.UTC(a, m - 1, d + 10)).toISOString().slice(0, 10);
  }
  function bloquesPasoAlta(paso, lineaValor) {
    const pide = bloquesRequisitos(lineaValor);
    return (BLOQUES_PASO_ALTA[paso] || []).filter((b) => pide.includes(b));
  }
  const blanco = (v) => v === undefined || v === null || String(v).trim() === '';
  // Filas de "muestras de línea": las vacías no cuentan; con datos exigen producto.
  function filasMuestraAlta(filas) {
    const muestras = [];
    for (let i = 0; i < (filas || []).length; i++) {
      const f = filas[i] || {}; const n = i + 1;
      if (['codigo', 'nombre', 'piezas', 'cantidad'].every((k) => blanco(f[k]))) continue;
      if (blanco(f.nombre)) return { muestras: [], error: `Fila ${n} de muestras: escribe el producto.` };
      const ep = validarPiezas(f.piezas);
      if (ep) return { muestras: [], error: `Fila ${n} de muestras: ${ep.charAt(0).toLowerCase()}${ep.slice(1)}` };
      if (!blanco(f.cantidad) && !(Number(f.cantidad) >= 0)) return { muestras: [], error: `Fila ${n} de muestras: contenido inválido.` };
      muestras.push({ codigo: String(f.codigo || '').trim(), nombre: String(f.nombre).trim(),
        piezas: blanco(f.piezas) ? null : Number(f.piezas), cantidad: blanco(f.cantidad) ? null : Number(f.cantidad), unidad: f.unidad || null });
    }
    return { muestras, error: null };
  }
  // Un solo envío: datos del proyecto + requisitos (sin vacíos) + muestras de línea.
  function cuerpoAlta(f) {
    const b = {};
    for (const k of ['cliente_id', 'nombre', 'tipo', 'linea', 'tipo_solicitud', 'segmento', 'fecha_requerida', 'descripcion', 'moneda', 'agente_id', 'prioridad']) {
      if (!blanco(f[k])) b[k] = String(f[k]).trim();
    }
    for (const k of ['kg_mes', 'precio_objetivo']) if (!blanco(f[k])) b[k] = Number(f[k]);
    const req = {};
    for (const [k, v] of Object.entries(f.requisitos || {})) {
      if (sinDato(v)) continue;
      req[k] = typeof v === 'string' ? v.trim() : v;
    }
    if (sinDato(req.costo_aplicacion)) delete req.costo_aplicacion_moneda;
    if (req.alergenos !== true) delete req.alergenos_lista;
    if (Object.keys(req).length) b.requisitos = req;
    if (Array.isArray(f.muestras) && f.muestras.length) b.muestras = f.muestras;
    return b;
  }

  const api = { PASOS_ALTA, fechaSugeridaAlta, bloquesPasoAlta, filasMuestraAlta, cuerpoAlta, CAMPOS_REQUISITO_GENERALES, bloquesRequisitos, camposDeBloques, cuerpoRequisitos, porcionMuestra, validarPiezas,
    CLAVE_CATALOGO_RE, CATALOGOS_REQUISITO, claveDesdeNombre, arbolCatalogo, validarValorCatalogo, cuerpoValorCatalogo,
    opcionesCatalogo, requisitosDeLinea, fmtPrecio, BASE, FASES, faseDe, colorEstado, COLOR_POTENCIAL, camposTransicion, validarTransicion, cuerpoTransicion,
    diasSinMovimiento, estancado, fmtUsd, fmtNum, ALERGENOS, PARAMETROS_BASE, contenidoFicha, faltantesFicha,
    validarPartida, cuerpoPartida, ETIQUETA_LISTA, COLOR_LISTA, estadoLista };

  // ── Costos de materia prima (Fase 1) ──
  const escMp = (x) => String(x ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const chipMp = (texto, bg, fg) => `<span class="chip" style="white-space:nowrap;background:${bg};color:${fg};border:1px solid ${fg}33;font-weight:600">${escMp(texto)}</span>`;
  const VIGENCIA_MP = { vigente: ['Vigente', '#dcfce7', '#166534'], por_vencer: ['Por vencer', '#fef3c7', '#92400e'], vencida: ['Vencida', '#fee2e2', '#991b1b'],
    futura: ['Futura', '#e0f2fe', '#075985'], sin_precio: ['Sin precio', '#f1f5f9', '#475569'] };
  const ORIGEN_MP = { nacional: ['Nacional', '#f1f5f9', '#334155'], importacion: ['Importación', '#e0f2fe', '#075985'], por_revisar: ['Por revisar', '#fff7ed', '#9a3412'] };
  const kgTxt = (n) => Number(n).toLocaleString('en-US', { maximumFractionDigits: 3 });
  api.precioMp = (moneda, precio) => {
    if (precio == null || precio === '' || !Number.isFinite(Number(precio))) return '—';
    const n = Number(precio);
    return moneda === 'USD'
      ? `USD ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`
      : `MXN ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };
  api.rangoEscala = (escalas, i, { sinEscala = false } = {}) => {
    const e = escalas[i]; if (!e) return '';
    if (sinEscala && Number(e.desde_kg) === 0) return 'Sin escala';
    const sig = escalas[i + 1];
    return sig ? `${kgTxt(e.desde_kg)} – ${kgTxt(Number(sig.desde_kg) - 1)} kg` : `${kgTxt(e.desde_kg)} kg en adelante`;
  };
  api.vigenciaSugerida = (desde, meses = 6) => {
    const d = new Date(`${desde}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + meses); d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  };
  api.chipVigencia = (e) => { const [t, bg, fg] = VIGENCIA_MP[e] || [e || '—', '#f1f5f9', '#475569']; return chipMp(t, bg, fg); };
  api.chipOrigen = (o) => { const [t, bg, fg] = ORIGEN_MP[o] || [o || '—', '#f1f5f9', '#475569']; return chipMp(t, bg, fg); };
  api.cuerpoCotizacion = (f) => {
    if (!f.producto_id) return { ok: false, error: 'Elige la clave (producto del catálogo).' };
    if (!f.vigente_desde) return { ok: false, error: 'Indica desde cuándo es vigente.' };
    if (f.vigente_hasta && f.vigente_hasta < f.vigente_desde) return { ok: false, error: 'La vigencia termina antes de empezar.' };
    const num = (v) => Number(String(v ?? '').replace(/,/g, '').trim());
    const filas = (f.escalas || []).filter((e) => String(e.desde_kg ?? '').trim() !== '' || String(e.precio ?? '').trim() !== '');
    if (!filas.length) return { ok: false, error: 'Captura al menos una escala con kg y precio.' };
    const escalas = filas.map((e) => ({ desde_kg: num(e.desde_kg), precio: num(e.precio) }));
    if (escalas.some((e) => !Number.isFinite(e.desde_kg) || e.desde_kg < 0 || !(e.precio > 0))) return { ok: false, error: 'Cada escala necesita kg y un precio mayor a 0.' };
    const t = (v) => { const x = String(v ?? '').trim(); return x || null; };
    const body = { producto_id: f.producto_id, proveedor_id: t(f.proveedor_id), incoterm: f.incoterm, moneda: f.moneda, transporte: t(f.transporte),
      lugar_entrega: t(f.lugar_entrega), vigente_desde: f.vigente_desde, vigente_hasta: t(f.vigente_hasta), comentario: t(f.comentario), escalas };
    // Solo para una clave nueva (la primera cotización la da de alta).
    for (const k of ['origen', 'pais', 'unidad_compra']) if (t(f[k])) body[k] = t(f[k]);
    if (t(f.densidad_kg_l)) body.densidad_kg_l = num(f.densidad_kg_l);
    return { ok: true, body };
  };
  api.resumenMp = (filas) => {
    const r = { total: filas.length, vigente: 0, por_vencer: 0, vencida: 0, sin_escala: 0, por_revisar: 0 };
    for (const x of filas) {
      if (r[x.estado_vigencia] !== undefined) r[x.estado_vigencia]++;
      if (x.sin_escala) r.sin_escala++;
      if (x.origen === 'por_revisar') r.por_revisar++;
    }
    return r;
  };

  // ── Solo navegador ──
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
    api.esc = esc;

    api.chipEstado = (clave, nombre, categoria) => {
      const c = colorEstado(clave, categoria);
      return `<span class="chip" style="background:${c}1a;color:${c};border:1px solid ${c}55">${esc(nombre || clave)}</span>`;
    };
    api.chipPotencial = (p) => {
      if (!p) return '<span class="muted">—</span>';
      const c = COLOR_POTENCIAL[p] || '#64748b';
      return `<span class="chip" style="background:${c}1a;color:${c};border:1px solid ${c}55;font-weight:700">${esc(p)}</span>`;
    };
    api.chip = (texto, color) => `<span class="chip" style="white-space:nowrap;background:${color}1a;color:${color};border:1px solid ${color}55">${esc(texto)}</span>`;
    api.chipLista = (l) => { const e = estadoLista(l); return api.chip(ETIQUETA_LISTA[e] || e, COLOR_LISTA[e] || '#64748b'); };
    api.chipFicha = (e) => api.chip(e, { vigente: '#16a34a', borrador: '#64748b', obsoleta: '#991b1b' }[e] || '#64748b');
    // Ventana de búsqueda contra el servidor (mismo aspecto que KoguUi.openSearchPicker,
    // pero consulta mientras escribes: clientes y productos son miles).
    // fetcher(q) → items · pinta(item) → html · onSelect(item) · accion = { texto(q), onClick(q) }
    api.picker = ({ titulo = 'Buscar', placeholder = 'Escribe para buscar…', fetcher, pinta, onSelect, accion, minimo = 2 }) => {
      const ov = document.createElement('div');
      ov.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:10000;display:flex;align-items:flex-start;justify-content:center;padding:60px 20px;backdrop-filter:blur(2px)';
      ov.innerHTML = `
        <div style="width:100%;max-width:720px;max-height:80vh;background:var(--panel,#fff);border-radius:12px;box-shadow:0 20px 50px rgba(0,0,0,.3);display:flex;flex-direction:column;overflow:hidden">
          <div style="padding:16px 18px;border-bottom:1px solid var(--line,#e2e8f0);display:flex;align-items:center;justify-content:space-between;gap:10px">
            <div style="font-weight:600;font-size:16px">${esc(titulo)}</div><button class="btn ghost" data-pk-x>Cerrar</button></div>
          <div style="padding:12px 18px;border-bottom:1px solid var(--line,#e2e8f0)">
            <input class="input" data-pk-q placeholder="${esc(placeholder)}" autocomplete="off" style="width:100%"/>
            <div data-pk-info style="margin-top:6px;font-size:12px;color:var(--muted,#64748b)">Escribe al menos ${minimo} letras.</div></div>
          <div data-pk-list style="flex:1;overflow-y:auto"></div>
          <div data-pk-acc style="display:none;padding:10px 18px;border-top:1px solid var(--line,#e2e8f0)"></div>
        </div>`;
      document.body.appendChild(ov);
      const $q = ov.querySelector('[data-pk-q]'); const $l = ov.querySelector('[data-pk-list]');
      const $i = ov.querySelector('[data-pk-info]'); const $a = ov.querySelector('[data-pk-acc]');
      let items = []; let hi = 0; let t; let turno = 0;
      const cerrar = () => { ov.remove(); document.removeEventListener('keydown', teclas, true); };
      const pintarHi = () => $l.querySelectorAll('[data-pk-i]').forEach((r, k) => {
        r.style.background = k === hi ? 'rgba(59,130,246,.10)' : '';
        if (k === hi) r.scrollIntoView({ block: 'nearest' });
      });
      const elegir = (k) => { const it = items[k]; if (!it) return; cerrar(); onSelect(it); };
      const pintarAccion = (q) => {
        if (!accion || q.length < minimo) { $a.style.display = 'none'; return; }
        $a.style.display = 'block';
        $a.innerHTML = `<a href="#" class="link" data-pk-a>${esc(accion.texto(q))}</a>`;
        $a.querySelector('[data-pk-a]').onclick = (e) => { e.preventDefault(); cerrar(); accion.onClick(q); };
      };
      const buscar = async () => {
        const q = $q.value.trim(); pintarAccion(q);
        if (q.length < minimo) { items = []; $l.innerHTML = ''; $i.textContent = `Escribe al menos ${minimo} letras.`; return; }
        const mio = ++turno; $i.textContent = 'Buscando…';
        let r = [];
        try { r = (await fetcher(q)) || []; } catch (_) { r = []; }
        if (mio !== turno) return;           // llegó una respuesta vieja: se descarta
        items = r; hi = 0;
        $i.textContent = r.length ? `${r.length} resultado${r.length === 1 ? '' : 's'}${r.length >= 20 ? ' · afina la búsqueda para ver más' : ''}` : 'Sin coincidencias.';
        $l.innerHTML = r.map((it, k) => `<div data-pk-i="${k}" style="padding:10px 18px;border-bottom:1px solid var(--line,#e2e8f0);cursor:pointer;font-size:14px">${pinta(it)}</div>`).join('');
        pintarHi();
      };
      function teclas(e) {
        if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); cerrar(); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); hi = Math.min(hi + 1, items.length - 1); pintarHi(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); hi = Math.max(hi - 1, 0); pintarHi(); }
        else if (e.key === 'Enter' && document.activeElement === $q) { e.preventDefault(); elegir(hi); }
      }
      document.addEventListener('keydown', teclas, true);
      $q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(buscar, 250); });
      $l.addEventListener('click', (e) => { const r = e.target.closest('[data-pk-i]'); if (r) elegir(Number(r.dataset.pkI)); });
      $l.addEventListener('mousemove', (e) => { const r = e.target.closest('[data-pk-i]'); if (r && Number(r.dataset.pkI) !== hi) { hi = Number(r.dataset.pkI); pintarHi(); } });
      ov.addEventListener('click', (e) => { if (e.target === ov) cerrar(); });
      ov.querySelector('[data-pk-x]').onclick = cerrar;
      setTimeout(() => $q.focus(), 30);
      return { cerrar };
    };

    // Convierte un input en "campo de selección": no se escribe en él; al hacer clic
    // (o Enter/flecha abajo) abre la ventana de búsqueda.
    api.campoBusqueda = (input, opts) => {
      input.readOnly = true; input.style.cursor = 'pointer'; input.setAttribute('autocomplete', 'off');
      if (!input.placeholder || /…$/.test(input.placeholder)) input.placeholder = opts.vacio || 'Haz clic para buscar…';
      const abrir = () => api.picker({ ...opts });
      input.addEventListener('click', abrir);
      input.addEventListener('keydown', (e) => { if (['Enter', ' ', 'ArrowDown'].includes(e.key)) { e.preventDefault(); abrir(); } });
    };
    // Compatibilidad con las pantallas: mismo contrato que el buscador anterior.
    // (el título se lee al abrir: puede depender del tipo elegido en el formulario)
    api.buscador = (input, _caja, o) => api.campoBusqueda(input, {
      get titulo() { return o.titulo; }, fetcher: o.fetcher, pinta: o.pinta, onSelect: o.elegir, accion: o.accion });
    api.cajaBusqueda = (attr) => `<div ${attr} style="display:none;position:absolute;left:0;right:0;top:100%;z-index:5;background:var(--panel,#fff);border:1px solid var(--line);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.18);max-height:240px;overflow:auto;margin-top:2px"></div>`;
    api.chipProspecto = (estatus) => (estatus === 'prospecto'
      ? '<span class="chip" style="background:#7c3aed1a;color:#7c3aed;border:1px solid #7c3aed55">prospecto</span>' : '');

    // Modal sencillo: devuelve { el, close }. onSubmit(el) puede lanzar para no cerrar.
    api.modal = ({ eyebrow, titulo, cuerpo, aceptar = 'Guardar', ancho = 560, onSubmit }) => {
      const id = 'idpModal' + Date.now();
      document.body.insertAdjacentHTML('beforeend', `
        <div id="${id}" style="position:fixed;inset:0;z-index:9999;background:rgba(15,23,42,.55);display:flex;justify-content:center;align-items:flex-start;overflow:auto;padding:40px 16px">
          <div style="background:var(--panel,#fff);border-radius:16px;max-width:${ancho}px;width:100%;box-shadow:0 24px 70px rgba(0,0,0,.3);overflow:hidden">
            <div style="padding:18px 22px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;gap:16px">
              <div>${eyebrow ? `<div class="eyebrow">${esc(eyebrow)}</div>` : ''}<h2 style="margin:4px 0 0;font-size:20px">${esc(titulo)}</h2></div>
              <button class="btn" data-x>✕</button>
            </div>
            <div style="padding:18px 22px;display:flex;flex-direction:column;gap:14px" data-body>${cuerpo}</div>
            <div style="padding:14px 22px;border-top:1px solid var(--line);display:flex;gap:8px;justify-content:flex-end">
              <button class="btn" data-x>Cancelar</button>
              ${onSubmit ? `<button class="btn primary" data-ok>${esc(aceptar)}</button>` : ''}
            </div>
          </div>
        </div>`);
      const el = document.getElementById(id);
      const close = () => el.remove();
      el.querySelectorAll('[data-x]').forEach((b) => (b.onclick = close));
      el.onclick = (e) => { if (e.target === el) close(); };
      const ok = el.querySelector('[data-ok]');
      if (ok) ok.onclick = () => KoguUi.withLoading(ok, async () => { await onSubmit(el); close(); }, 'Guardando…').catch(() => {});
      const f = el.querySelector('[data-body] input, [data-body] select, [data-body] textarea');
      if (f) setTimeout(() => f.focus(), 30);
      return { el, close };
    };

    // Descarga (o abre) un archivo protegido usando la sesión.
    api.descargar = async (path, { abrir = false, nombre = 'archivo' } = {}) => {
      const res = await KoguApi.authFetchRaw(path);
      if (!res.ok) { KoguApi.toast('No se pudo obtener el archivo.', 'error'); return; }
      const blob = await res.blob();
      const cd = res.headers.get('Content-Disposition') || '';
      const m = cd.match(/filename\*=UTF-8''([^;]+)/) || cd.match(/filename="?([^";]+)"?/);
      const url = URL.createObjectURL(blob);
      if (abrir) { window.open(url, '_blank'); }
      else {
        const a = document.createElement('a');
        a.href = url; a.download = m ? decodeURIComponent(m[1]) : nombre;
        document.body.appendChild(a); a.click(); a.remove();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    };

    api.mensajeError = (err) => err?.message || 'Ocurrió un error.';

    // Catálogos de I+D en selects: activos + el valor actual aunque esté inactivo.
    api.opcionesHtml = (valores, actual, vacio = '—') => `<option value="">${esc(vacio)}</option>` +
      opcionesCatalogo(valores, actual).map((o) => `<option value="${esc(o.clave)}"${o.clave === actual ? ' selected' : ''}>${esc(o.etiqueta)}</option>`).join('');
    api.nombreCatalogo = (valores, clave) => {
      if (!clave) return '';
      const o = opcionesCatalogo(valores, clave).find((x) => x.clave === clave);
      return o ? o.etiqueta : clave;
    };
  }

  // Nombre del desarrollador: de la lista de activos; si ya no está (p. ej. usuario del CRM sin acceso),
  // el que manda el backend (desarrollador_nombre); si no hay nombre, "Asignado".
  api.nombreDesarrollador = (p, devs) => {
    const uid = p?.desarrollador_id;
    if (!uid) return '';
    return (devs || []).find((d) => d.user_id === uid)?.nombre || p.desarrollador_nombre || 'Asignado';
  };

  // Responsables (CRM: asignar, asignar_apoyo, asesor). Manda solo lo que cambió; vacío = null
  // (quitar apoyo/asesor). El desarrollador ya asignado no se puede dejar vacío. null = sin cambios.
  api.cuerpoResponsables = (p, form) => {
    const body = {};
    for (const k of ['desarrollador_id', 'apoyo_id', 'asesor_id']) {
      const v = String(form?.[k] ?? '').trim() || null;
      if (v !== (p?.[k] || null)) body[k] = v;
    }
    if ('desarrollador_id' in body && !body.desarrollador_id && p?.desarrollador_id) throw new Error('El proyecto no puede quedarse sin desarrollador.');
    if (!Object.keys(body).length) return null;
    const c = String(form?.comentario ?? '').trim();
    if (c) body.comentario = c;
    return body;
  };
  api.nombreResponsable = (p, rol, devs) => {
    const uid = p?.[`${rol}_id`];
    if (!uid) return '';
    return (devs || []).find((d) => d.user_id === uid)?.nombre || p[`${rol}_nombre`] || 'Asignado';
  };

  // Exportar a Excel: los filtros activos de la lista (no página ni límite) y la bitácora si se pide.
  api.urlExportProyectos = (base, filtros = {}, { bitacora = false } = {}) => {
    const qs = new URLSearchParams();
    for (const k of ['q', 'estado', 'potencial', 'agente_id', 'desarrollador_id', 'estancados', 'desde', 'hasta']) {
      const v = filtros[k];
      if (v !== undefined && v !== null && String(v).trim() !== '') qs.set(k, String(v).trim());
    }
    if (bitacora) qs.set('bitacora', '1');
    const s = qs.toString();
    return `${base}/proyectos/export${s ? `?${s}` : ''}`;
  };

  // ── Estadísticas (tablero) ──
  const fechaMxStr = (d) => new Date(d.getTime() - 6 * 3600 * 1000).toISOString().slice(0, 10);
  api.rangoTablero = (clave, ahora = new Date()) => {
    const hoy = fechaMxStr(ahora); const [y, m] = hoy.split('-').map(Number);
    const finMes = (yy, mm) => new Date(Date.UTC(yy, mm, 0)).toISOString().slice(0, 10);
    if (clave === 'mes_anterior') { const yy = m === 1 ? y - 1 : y; const mm = m === 1 ? 12 : m - 1; return { desde: `${yy}-${String(mm).padStart(2, '0')}-01`, hasta: finMes(yy, mm) }; }
    if (clave === 'anio') return { desde: `${y}-01-01`, hasta: hoy };
    // 'mes': el mes en curso hasta hoy (si ya terminó el día 31, el mes completo)
    return { desde: `${hoy.slice(0, 7)}-01`, hasta: hoy };
  };
  api.usdCorto = (n) => {
    if (n == null || Number.isNaN(Number(n))) return '—';
    const v = Number(n); const a = Math.abs(v);
    if (a >= 1e6) return `USD ${(v / 1e6).toFixed(1).replace(/\.0$/, '')} M`;
    if (a >= 1e3) return `USD ${Math.round(v / 1e3)} mil`;
    return `USD ${Math.round(v)}`;
  };
  api.variacion = (c) => {
    const pts = c && c.var_pts !== undefined; const v = pts ? c.var_pts : c?.var_pct;
    if (v == null) return { texto: 'sin base', dir: null };
    const n = Math.abs(v).toLocaleString('es-MX', { maximumFractionDigits: 1 });
    return { texto: `${v > 0 ? '+' : v < 0 ? '−' : ''}${n}${pts ? ' pts' : '%'}`, dir: v > 0 ? 'sube' : v < 0 ? 'baja' : 'igual' };
  };
  const PARAM_CORTE = { estado: 'estado', agente: 'agente_id', desarrollador: 'desarrollador_id', potencial: 'potencial' };
  api.urlListado = (corte, clave, periodo) => {
    const p = PARAM_CORTE[corte];
    if (!p || clave == null || clave === '') return null;
    const qs = new URLSearchParams({ [p]: clave });
    if (periodo?.desde) qs.set('desde', periodo.desde);
    if (periodo?.hasta) qs.set('hasta', periodo.hasta);
    return `/modules/idp/proyectos.html?${qs}`;
  };
  api.filtrosDesdeUrl = (search) => {
    const u = new URLSearchParams(search || ''); const out = {};
    for (const k of ['q', 'estado', 'potencial', 'agente_id', 'desarrollador_id', 'estancados', 'desde', 'hasta']) if (u.get(k)) out[k] = u.get(k);
    return out;
  };
  api.anchoBarra = (n, max) => (!max || !n ? 0 : Math.max(1.5, Math.round((n / max) * 1000) / 10));

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KoguIdp = api;
})(typeof window !== 'undefined' ? window : globalThis);

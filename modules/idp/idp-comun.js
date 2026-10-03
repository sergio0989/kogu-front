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
  const api = { fmtPrecio, BASE, FASES, faseDe, colorEstado, COLOR_POTENCIAL, camposTransicion, validarTransicion, cuerpoTransicion,
    diasSinMovimiento, estancado, fmtUsd, fmtNum, ALERGENOS, PARAMETROS_BASE, contenidoFicha, faltantesFicha,
    validarPartida, cuerpoPartida, ETIQUETA_LISTA, COLOR_LISTA, estadoLista };

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
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KoguIdp = api;
})(typeof window !== 'undefined' ? window : globalThis);

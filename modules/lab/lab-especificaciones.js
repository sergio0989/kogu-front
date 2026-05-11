// ============================================================
// lab-especificaciones.js
// CRUD de Especificaciones (lab_especificaciones).
// La regla cumple/no cumple por (producto, parámetro, [método])
// con vigencias y soporte para origen interna / cliente / regulatoria.
//
// Pantalla de un solo nivel: tabla + filtros + modal de edición.
// El formulario es dinámico según tipo_evaluacion seleccionado.
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/lab/lab-especificaciones.html';
  const BASE = '/protected/lab/maestros/especificaciones';
  const PERM = 'screen.lab.especificaciones';

  const TIPOS = [
    { code: 'rango',              label: 'Rango (min ≤ valor ≤ max)' },
    { code: 'mayor_igual',        label: 'Mayor o igual (valor ≥ min)' },
    { code: 'menor_igual',        label: 'Menor o igual (valor ≤ max)' },
    { code: 'igual',              label: 'Igual al objetivo (con tolerancia)' },
    { code: 'cualitativo',        label: 'Cualitativo (texto esperado)' },
    { code: 'presencia_ausencia', label: 'Presencia / Ausencia (micro)' },
  ];
  const ORIGENES = [
    { code: 'interna',     label: 'Interna' },
    { code: 'cliente',     label: 'Cliente' },
    { code: 'regulatoria', label: 'Regulatoria' },
  ];
  const STATUS = [
    { code: 'activo',    label: 'Activo',    color: '#16a34a' },
    { code: 'inactivo',  label: 'Inactivo',  color: '#94a3b8' },
    { code: 'obsoleto',  label: 'Obsoleto',  color: '#dc2626' },
  ];

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Especificaciones',
    description: 'Reglas cumple/no cumple por producto+parámetro. Define qué debe cumplir cada lote para liberarse.',
    requiredPermission: PERM,
  });
  if (!b) return;

  // ── Caches ────────────────────────────────────────────
  let productos  = [];
  let parametros = [];
  let metodos    = [];
  let unidades   = [];
  let clientes   = [];

  async function loadCatalogos() {
    try {
      const [resProd, resParam] = await Promise.all([
        KoguApi.apiFetch('/protected/cat/productos?pageSize=500').catch(() => null),
        KoguApi.apiFetch('/protected/lab/maestros/parametros?status=activo&pageSize=500'),
      ]);
      if (resProd) productos = KoguApi.unwrapData(resProd) || [];
      parametros = KoguApi.unwrapData(resParam) || [];

      // Métodos, unidades, clientes — opcionales (cargados si los endpoints existen)
      try {
        const resCli = await KoguApi.apiFetch('/protected/core/clientes');
        clientes = KoguApi.unwrapRows(resCli);
      } catch (_) { clientes = []; }
      try {
        const resUni = await KoguApi.apiFetch('/protected/cat/unidades?pageSize=500').catch(() => null);
        if (resUni) unidades = KoguApi.unwrapData(resUni) || [];
      } catch (_) { unidades = []; }
      // Métodos: no hay endpoint CRUD aún. Lo dejamos vacío y el campo
      // se captura como id manual o se queda en NULL (cualquier método).
      metodos = [];
    } catch (err) {
      console.warn('Catálogos parciales:', err.message);
    }
  }

  // ── Estado ────────────────────────────────────────────
  let rows = [];
  let currentPage = 1;
  let pageSize    = 25;
  let totalPages  = 1;
  let totalRows   = 0;
  let editing     = null;   // null = alta, objeto = edición

  const $ = (id) => document.getElementById(id);

  const c = document.getElementById('pageContent');
  c.innerHTML = `
<div class="card">
  <div class="row">
    <div>
      <div class="eyebrow">Lab QA</div>
      <h2>Especificaciones</h2>
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn ghost"   id="refreshBtn">Actualizar</button>
      <button class="btn primary" id="newSpecBtn">+ Nueva especificación</button>
    </div>
  </div>

  <!-- Filtros -->
  <div class="grid-2" style="margin-top:14px;gap:10px">
    <input class="input" id="qFil" placeholder="Buscar por producto, parámetro o referencia…"/>
    <div style="display:flex;gap:6px;align-items:center">
      <input class="input" id="prodLabel" readonly placeholder="— Cualquier producto —"
             style="flex:1;cursor:pointer;background:#f8fafc"/>
      <button type="button" class="btn ghost" id="prodPickBtn">Producto…</button>
      <button type="button" class="btn ghost" id="prodClearBtn" title="Limpiar">×</button>
    </div>
    <input type="hidden" id="prodIdFil"/>
    <select class="select" id="origenFil">
      <option value="">Cualquier origen</option>
      ${ORIGENES.map(o => `<option value="${o.code}">${o.label}</option>`).join('')}
    </select>
    <select class="select" id="statusFil">
      <option value="">Cualquier estado</option>
      <option value="activo">Activo</option>
      <option value="inactivo">Inactivo</option>
      <option value="obsoleto">Obsoleto</option>
    </select>
    <label style="display:flex;align-items:center;gap:6px;font-size:13px">
      <input type="checkbox" id="vigenteFil"/>
      Solo vigentes hoy
    </label>
  </div>

  <!-- Tabla -->
  <div class="table-wrap" style="margin-top:14px">
    <table>
      <thead><tr>
        <th>Producto</th>
        <th>Parámetro</th>
        <th>Regla</th>
        <th>Origen</th>
        <th>Vigencia</th>
        <th>Estado</th>
        <th style="text-align:right">Acciones</th>
      </tr></thead>
      <tbody id="rows"></tbody>
    </table>
  </div>

  <!-- Paginación -->
  <div id="pgBar" style="display:flex;align-items:center;justify-content:space-between;margin-top:14px;flex-wrap:wrap;gap:10px;font-size:13px;color:var(--muted)">
    <div id="pgInfo">—</div>
    <div style="display:flex;align-items:center;gap:6px">
      <span>Por página:</span>
      <select class="select" id="pgSize" style="width:80px">
        <option value="10">10</option>
        <option value="25" selected>25</option>
        <option value="50">50</option>
        <option value="100">100</option>
      </select>
      <button class="btn ghost" id="pgFirst">«</button>
      <button class="btn ghost" id="pgPrev">‹</button>
      <span id="pgNumeros" style="display:flex;gap:4px"></span>
      <button class="btn ghost" id="pgNext">›</button>
      <button class="btn ghost" id="pgLast">»</button>
    </div>
  </div>
</div>
  `;

  // ── Picker de producto (filtro y formulario reusan la misma lista) ─
  function abrirPickerProducto({ titulo, onSelect }) {
    KoguUi.openSearchPicker({
      title: titulo,
      items: productos,
      placeholder: 'Buscar por cve_prod o descripción…',
      columns: [
        { key: 'cve_prod',  label: 'cve_prod',   primary: true },
        { key: 'desc_prod', label: 'Producto' },
      ],
      emptyText: productos.length === 0
        ? 'No hay productos en esta empresa (módulo Catálogos → Productos).'
        : 'Sin coincidencias',
      onSelect,
    });
  }
  function abrirPickerParametro({ onSelect }) {
    KoguUi.openSearchPicker({
      title: 'Selecciona el parámetro',
      items: parametros,
      placeholder: 'Buscar por clave o nombre…',
      columns: [
        { key: 'clave',  label: 'Clave',  primary: true },
        { key: 'nombre', label: 'Nombre' },
        { key: 'tipo_parametro', label: 'Tipo' },
      ],
      emptyText: 'Sin parámetros — créalos en Maestros → Parámetros.',
      onSelect,
    });
  }
  function abrirPickerCliente({ onSelect }) {
    KoguUi.openSearchPicker({
      title: 'Selecciona el cliente',
      items: clientes,
      placeholder: 'Buscar por nombre, RFC o cve_cte…',
      columns: [
        { key: 'nombre',  label: 'Nombre',  primary: true },
        { key: 'rfc',     label: 'RFC' },
        { key: 'cve_cte', label: 'cve_cte' },
      ],
      emptyText: clientes.length === 0
        ? 'No hay clientes — créalos en Catálogos → Clientes.'
        : 'Sin coincidencias',
      onSelect,
    });
  }
  function abrirPickerUnidad({ onSelect }) {
    KoguUi.openSearchPicker({
      title: 'Selecciona la unidad',
      items: unidades,
      placeholder: 'Buscar por símbolo o nombre…',
      columns: [
        { key: 'simbolo', label: 'Símbolo', primary: true },
        { key: 'nombre',  label: 'Nombre' },
      ],
      emptyText: 'Sin unidades en catálogo.',
      onSelect,
    });
  }

  // ── Carga lista ───────────────────────────────────────
  async function load({ showToast = false, resetPage = false } = {}) {
    if (resetPage) currentPage = 1;
    const params = new URLSearchParams();
    params.set('page',     String(currentPage));
    params.set('pageSize', String(pageSize));
    const q = $('qFil').value.trim();
    const prodId = $('prodIdFil').value;
    const origen = $('origenFil').value;
    const status = $('statusFil').value;
    const vigente = $('vigenteFil').checked;
    if (q)       params.set('q', q);
    if (prodId)  params.set('producto_id', prodId);
    if (origen)  params.set('origen', origen);
    if (status)  params.set('status', status);
    if (vigente) params.set('vigente_hoy', 'true');

    try {
      const res = await KoguApi.apiFetch(`${BASE}?${params.toString()}`);
      rows = KoguApi.unwrapData(res) || [];
      const meta = res?.meta || {};
      totalRows   = parseInt(meta.total ?? rows.length, 10) || 0;
      pageSize    = parseInt(meta.pageSize ?? pageSize, 10) || pageSize;
      currentPage = parseInt(meta.page ?? currentPage, 10) || 1;
      totalPages  = parseInt(meta.totalPages ?? 1, 10) || 1;
      renderRows();
      renderPaginacion();
      if (showToast) KoguApi.toast('Especificaciones actualizadas', 'success');
    } catch (err) { KoguApi.toast(err.message, 'error'); }
  }

  function describeRegla(s) {
    const u = s.unidad_simbolo ? ` ${s.unidad_simbolo}` : '';
    switch (s.tipo_evaluacion) {
      case 'rango':
        return `${fmtNum(s.lim_min)} – ${fmtNum(s.lim_max)}${u}`;
      case 'mayor_igual':
        return `≥ ${fmtNum(s.lim_min)}${u}`;
      case 'menor_igual':
        return `≤ ${fmtNum(s.lim_max)}${u}`;
      case 'igual':
        return `= ${fmtNum(s.objetivo)} ± ${fmtNum(s.tolerancia)}${u}`;
      case 'cualitativo':
      case 'presencia_ausencia':
        return `«${s.valor_cualitativo_esperado || ''}»`;
      default:
        return s.tipo_evaluacion;
    }
  }
  function fmtNum(v) {
    if (v == null) return '—';
    return parseFloat(v).toLocaleString();
  }

  function renderRows() {
    const tbody = $('rows');
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--muted)">
        Sin especificaciones con los filtros actuales. Click en <strong>+ Nueva especificación</strong> para crear la primera.
      </td></tr>`;
      return;
    }
    tbody.innerHTML = rows.map(s => {
      const st = STATUS.find(x => x.code === s.status) || { label: s.status, color: '#64748b' };
      const orig = ORIGENES.find(x => x.code === s.origen)?.label || s.origen;
      const vigenciaTxt = `Desde ${s.vigente_desde}${s.vigente_hasta ? ' hasta ' + s.vigente_hasta : ' (vigente)'}`;
      const clienteChip = s.origen === 'cliente'
        ? `<div class="muted" style="font-size:11px">${escapeHtml(s.cliente_nombre || '')}</div>` : '';
      return `
        <tr>
          <td>
            ${escapeHtml(s.cve_prod || '—')}
            <div class="muted" style="font-size:12px">${escapeHtml(s.desc_prod || '')}</div>
          </td>
          <td>
            <strong>${escapeHtml(s.parametro_clave || '—')}</strong>
            <div class="muted" style="font-size:12px">${escapeHtml(s.parametro_nombre || '')}</div>
          </td>
          <td>${escapeHtml(describeRegla(s))}</td>
          <td>${escapeHtml(orig)}${clienteChip}</td>
          <td style="font-size:12px">${escapeHtml(vigenciaTxt)}
            ${s.vigente_hoy ? '<div style="color:#16a34a;font-size:11px">✓ Vigente hoy</div>' : ''}
          </td>
          <td><span class="chip" style="background:${st.color}22;color:${st.color}">${st.label}</span></td>
          <td style="text-align:right;white-space:nowrap">
            <button class="btn ghost" data-edit="${s.especificacion_id}">Editar</button>
            ${s.status === 'activo' ? `<button class="btn ghost danger" data-delete="${s.especificacion_id}">Desactivar</button>` : ''}
          </td>
        </tr>`;
    }).join('');

    tbody.querySelectorAll('button[data-edit]').forEach(btn => {
      btn.addEventListener('click', () => abrirEditor(btn.dataset.edit));
    });
    tbody.querySelectorAll('button[data-delete]').forEach(btn => {
      btn.addEventListener('click', () => confirmarBaja(btn.dataset.delete));
    });
  }

  function renderPaginacion() {
    const inicio = totalRows === 0 ? 0 : (currentPage - 1) * pageSize + 1;
    const fin    = Math.min(currentPage * pageSize, totalRows);
    $('pgInfo').textContent = totalRows ? `Mostrando ${inicio}–${fin} de ${totalRows}` : 'Sin resultados';
    $('pgFirst').disabled = currentPage <= 1;
    $('pgPrev').disabled  = currentPage <= 1;
    $('pgNext').disabled  = currentPage >= totalPages;
    $('pgLast').disabled  = currentPage >= totalPages;

    const ventana = 2;
    let from = Math.max(1, currentPage - ventana);
    let to   = Math.min(totalPages, currentPage + ventana);
    if (currentPage <= 3) to = Math.min(totalPages, 5);
    if (currentPage >= totalPages - 2) from = Math.max(1, totalPages - 4);

    const nums = $('pgNumeros'); nums.innerHTML = '';
    if (from > 1) {
      nums.appendChild(makePgBtn(1));
      if (from > 2) { const d = document.createElement('span'); d.textContent = '…'; d.style.padding = '0 6px'; nums.appendChild(d); }
    }
    for (let i = from; i <= to; i++) nums.appendChild(makePgBtn(i));
    if (to < totalPages) {
      if (to < totalPages - 1) { const d = document.createElement('span'); d.textContent = '…'; d.style.padding = '0 6px'; nums.appendChild(d); }
      nums.appendChild(makePgBtn(totalPages));
    }
  }
  function makePgBtn(num) {
    const b = document.createElement('button');
    b.className = 'btn ghost';
    b.textContent = String(num);
    if (num === currentPage) { b.classList.add('primary'); b.classList.remove('ghost'); }
    b.addEventListener('click', () => { if (num !== currentPage) { currentPage = num; load(); } });
    return b;
  }

  // ── Modal editor (alta y edición) ─────────────────────
  async function abrirEditor(specId = null) {
    editing = null;
    if (specId) {
      try {
        const res = await KoguApi.apiFetch(`${BASE}/${specId}`);
        editing = KoguApi.unwrapData(res);
      } catch (err) { return KoguApi.toast(err.message, 'error'); }
    }
    renderModalEditor();
  }

  function renderModalEditor() {
    const isEdit = !!editing;
    const e = editing || {
      producto_id: '', parametro_id: '', cliente_id: '', unidad_id: '',
      tipo_evaluacion: 'rango', origen: 'interna',
      lim_min: '', lim_max: '', objetivo: '', tolerancia: 0,
      valor_cualitativo_esperado: '',
      referencia: '', version: '1.0',
      vigente_desde: new Date().toISOString().slice(0, 10),
      vigente_hasta: '',
      status: 'activo', observaciones: '',
    };

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;overflow:auto';
    overlay.innerHTML = `
      <div style="background:white;border-radius:8px;max-width:760px;width:100%;max-height:95vh;overflow:auto;padding:24px;box-shadow:0 25px 50px rgba(0,0,0,.3)">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px">
          <div>
            <div class="eyebrow">Lab QA</div>
            <h2 style="margin:6px 0 0 0">${isEdit ? 'Editar especificación' : 'Nueva especificación'}</h2>
          </div>
          <button class="btn ghost" id="closeModalBtn">×</button>
        </div>

        <div class="grid-2" style="gap:10px">
          <div>
            <div class="label-text">Producto *</div>
            <div style="display:flex;gap:6px">
              <input class="input" id="m_prodLabel" readonly
                     placeholder="— Selecciona —"
                     value="${escapeAttr(formatProducto(e.producto_id))}"
                     style="flex:1;cursor:pointer;background:#f8fafc"/>
              <button type="button" class="btn ghost" id="m_prodPickBtn">Buscar…</button>
            </div>
            <input type="hidden" id="m_prodId" value="${escapeAttr(e.producto_id || '')}"/>
          </div>
          <div>
            <div class="label-text">Parámetro *</div>
            <div style="display:flex;gap:6px">
              <input class="input" id="m_paramLabel" readonly
                     placeholder="— Selecciona —"
                     value="${escapeAttr(formatParametro(e.parametro_id))}"
                     style="flex:1;cursor:pointer;background:#f8fafc"/>
              <button type="button" class="btn ghost" id="m_paramPickBtn">Buscar…</button>
            </div>
            <input type="hidden" id="m_paramId" value="${escapeAttr(e.parametro_id || '')}"/>
          </div>

          <div>
            <div class="label-text">Tipo de evaluación *</div>
            <select class="select" id="m_tipo">
              ${TIPOS.map(t => `<option value="${t.code}" ${e.tipo_evaluacion === t.code ? 'selected' : ''}>${t.label}</option>`).join('')}
            </select>
          </div>
          <div>
            <div class="label-text">Origen *</div>
            <select class="select" id="m_origen">
              ${ORIGENES.map(o => `<option value="${o.code}" ${e.origen === o.code ? 'selected' : ''}>${o.label}</option>`).join('')}
            </select>
          </div>

          <!-- Cliente (visible solo si origen=cliente) -->
          <div id="m_clienteBlock" style="grid-column:1/-1;display:none">
            <div class="label-text">Cliente *</div>
            <div style="display:flex;gap:6px">
              <input class="input" id="m_cliLabel" readonly
                     value="${escapeAttr(formatCliente(e.cliente_id))}"
                     style="flex:1;cursor:pointer;background:#f8fafc"/>
              <button type="button" class="btn ghost" id="m_cliPickBtn">Buscar cliente…</button>
            </div>
            <input type="hidden" id="m_cliId" value="${escapeAttr(e.cliente_id || '')}"/>
          </div>

          <!-- Bloque dinámico según tipo -->
          <div id="m_camposTipo" style="grid-column:1/-1;display:grid;grid-template-columns:1fr 1fr;gap:10px"></div>

          <div>
            <div class="label-text">Unidad (opcional)</div>
            <div style="display:flex;gap:6px">
              <input class="input" id="m_uniLabel" readonly
                     value="${escapeAttr(formatUnidad(e.unidad_id))}"
                     placeholder="— Sin unidad —"
                     style="flex:1;cursor:pointer;background:#f8fafc"/>
              <button type="button" class="btn ghost" id="m_uniPickBtn">Buscar…</button>
              <button type="button" class="btn ghost" id="m_uniClearBtn" title="Limpiar">×</button>
            </div>
            <input type="hidden" id="m_uniId" value="${escapeAttr(e.unidad_id || '')}"/>
          </div>
          <div>
            <div class="label-text">Referencia</div>
            <input class="input" id="m_ref" maxlength="200"
                   value="${escapeAttr(e.referencia || '')}"
                   placeholder="NOM-XXX / SOP-interno / código cliente"/>
          </div>

          <div>
            <div class="label-text">Vigente desde *</div>
            <input class="input" type="date" id="m_desde"
                   value="${escapeAttr(e.vigente_desde || '')}"/>
          </div>
          <div>
            <div class="label-text">Vigente hasta</div>
            <input class="input" type="date" id="m_hasta"
                   value="${escapeAttr(e.vigente_hasta || '')}"
                   placeholder="Indefinido"/>
          </div>

          <div>
            <div class="label-text">Versión</div>
            <input class="input" id="m_version" maxlength="20"
                   value="${escapeAttr(e.version || '1.0')}"/>
          </div>
          <div>
            <div class="label-text">Estado</div>
            <select class="select" id="m_status">
              ${STATUS.map(s => `<option value="${s.code}" ${e.status === s.code ? 'selected' : ''}>${s.label}</option>`).join('')}
            </select>
          </div>

          <div style="grid-column:1/-1">
            <div class="label-text">Observaciones</div>
            <textarea class="input" id="m_obs" rows="2" maxlength="500">${escapeHtml(e.observaciones || '')}</textarea>
          </div>
        </div>

        <div style="margin-top:20px;display:flex;gap:8px;justify-content:flex-end">
          <button class="btn ghost"   id="cancelBtn">Cancelar</button>
          <button class="btn primary" id="saveBtn">${isEdit ? 'Guardar cambios' : 'Crear especificación'}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const oQ = (s) => overlay.querySelector(s);
    const close = () => overlay.remove();
    overlay.addEventListener('click', ev => { if (ev.target === overlay) close(); });
    oQ('#closeModalBtn').addEventListener('click', close);
    oQ('#cancelBtn').addEventListener('click', close);

    // Pickers
    oQ('#m_prodPickBtn').addEventListener('click', () => abrirPickerProducto({
      titulo: 'Producto al que aplica la especificación',
      onSelect: (p) => {
        oQ('#m_prodId').value = p.producto_id;
        oQ('#m_prodLabel').value = `${p.cve_prod || ''} — ${p.desc_prod || ''}`.trim();
      },
    }));
    oQ('#m_prodLabel').addEventListener('click', () => oQ('#m_prodPickBtn').click());

    oQ('#m_paramPickBtn').addEventListener('click', () => abrirPickerParametro({
      onSelect: (p) => {
        oQ('#m_paramId').value = p.parametro_id;
        oQ('#m_paramLabel').value = `${p.clave || ''} — ${p.nombre || ''}`.trim();
      },
    }));
    oQ('#m_paramLabel').addEventListener('click', () => oQ('#m_paramPickBtn').click());

    oQ('#m_cliPickBtn').addEventListener('click', () => abrirPickerCliente({
      onSelect: (c) => {
        oQ('#m_cliId').value = c.cliente_id;
        oQ('#m_cliLabel').value = c.nombre + (c.rfc ? ' — ' + c.rfc : '');
      },
    }));
    oQ('#m_cliLabel').addEventListener('click', () => oQ('#m_cliPickBtn').click());

    oQ('#m_uniPickBtn').addEventListener('click', () => abrirPickerUnidad({
      onSelect: (u) => {
        oQ('#m_uniId').value = u.unidad_id;
        oQ('#m_uniLabel').value = `${u.simbolo || ''} ${u.nombre ? '— ' + u.nombre : ''}`.trim();
      },
    }));
    oQ('#m_uniLabel').addEventListener('click', () => oQ('#m_uniPickBtn').click());
    oQ('#m_uniClearBtn').addEventListener('click', () => {
      oQ('#m_uniId').value = '';
      oQ('#m_uniLabel').value = '';
    });

    // Renderiza dinámicamente campos según tipo
    function renderCamposTipo() {
      const tipo = oQ('#m_tipo').value;
      const cont = oQ('#m_camposTipo');
      const valNum = (v) => v == null ? '' : v;
      const limMin = isEdit ? valNum(e.lim_min) : '';
      const limMax = isEdit ? valNum(e.lim_max) : '';
      const obj    = isEdit ? valNum(e.objetivo) : '';
      const tol    = isEdit ? (e.tolerancia ?? 0) : 0;
      const val    = isEdit ? (e.valor_cualitativo_esperado || '') : '';

      if (tipo === 'rango') {
        cont.innerHTML = `
          <div><div class="label-text">Mínimo *</div><input class="input" type="number" step="any" id="m_min" value="${escapeAttr(limMin)}"/></div>
          <div><div class="label-text">Máximo *</div><input class="input" type="number" step="any" id="m_max" value="${escapeAttr(limMax)}"/></div>`;
      } else if (tipo === 'mayor_igual') {
        cont.innerHTML = `<div style="grid-column:1/-1"><div class="label-text">Mínimo *</div><input class="input" type="number" step="any" id="m_min" value="${escapeAttr(limMin)}"/></div>`;
      } else if (tipo === 'menor_igual') {
        cont.innerHTML = `<div style="grid-column:1/-1"><div class="label-text">Máximo *</div><input class="input" type="number" step="any" id="m_max" value="${escapeAttr(limMax)}"/></div>`;
      } else if (tipo === 'igual') {
        cont.innerHTML = `
          <div><div class="label-text">Objetivo *</div><input class="input" type="number" step="any" id="m_obj" value="${escapeAttr(obj)}"/></div>
          <div><div class="label-text">Tolerancia ±</div><input class="input" type="number" step="any" id="m_tol" value="${escapeAttr(tol)}"/></div>`;
      } else if (tipo === 'cualitativo' || tipo === 'presencia_ausencia') {
        const ph = tipo === 'presencia_ausencia' ? 'ej. ausencia/25g, presencia' : 'ej. claro, sin sedimento';
        cont.innerHTML = `<div style="grid-column:1/-1"><div class="label-text">Valor esperado *</div><input class="input" id="m_cualValor" value="${escapeAttr(val)}" placeholder="${ph}"/></div>`;
      }
    }
    renderCamposTipo();
    oQ('#m_tipo').addEventListener('change', renderCamposTipo);

    // Visibilidad del cliente
    function renderOrigenCliente() {
      const isCli = oQ('#m_origen').value === 'cliente';
      oQ('#m_clienteBlock').style.display = isCli ? 'block' : 'none';
    }
    renderOrigenCliente();
    oQ('#m_origen').addEventListener('change', renderOrigenCliente);

    // Guardar
    oQ('#saveBtn').addEventListener('click', async () => {
      const body = collectBody(oQ);
      if (!body) return;
      try {
        oQ('#saveBtn').disabled = true;
        if (isEdit) {
          await KoguApi.apiFetch(`${BASE}/${editing.especificacion_id}`, {
            method: 'PUT', body: JSON.stringify(body),
          });
          KoguApi.toast('Especificación actualizada', 'success');
        } else {
          await KoguApi.apiFetch(BASE, {
            method: 'POST', body: JSON.stringify(body),
          });
          KoguApi.toast('Especificación creada', 'success');
        }
        close();
        await load();
      } catch (err) {
        oQ('#saveBtn').disabled = false;
        KoguApi.toast(err.message, 'error');
      }
    });
  }

  function collectBody(oQ) {
    const tipo = oQ('#m_tipo').value;
    const origen = oQ('#m_origen').value;
    const body = {
      producto_id:     oQ('#m_prodId').value || null,
      parametro_id:    oQ('#m_paramId').value || null,
      tipo_evaluacion: tipo,
      origen,
      unidad_id:       oQ('#m_uniId').value || null,
      referencia:      oQ('#m_ref').value.trim() || null,
      version:         oQ('#m_version').value.trim() || '1.0',
      vigente_desde:   oQ('#m_desde').value || null,
      vigente_hasta:   oQ('#m_hasta').value || null,
      status:          oQ('#m_status').value,
      observaciones:   oQ('#m_obs').value.trim() || null,
    };
    if (!body.producto_id)  { KoguApi.toast('Selecciona el producto.',  'error'); return null; }
    if (!body.parametro_id) { KoguApi.toast('Selecciona el parámetro.', 'error'); return null; }

    if (tipo === 'rango' || tipo === 'mayor_igual') body.lim_min = parseFloat(oQ('#m_min')?.value);
    if (tipo === 'rango' || tipo === 'menor_igual') body.lim_max = parseFloat(oQ('#m_max')?.value);
    if (tipo === 'igual') {
      body.objetivo   = parseFloat(oQ('#m_obj')?.value);
      body.tolerancia = parseFloat(oQ('#m_tol')?.value || '0');
    }
    if (tipo === 'cualitativo' || tipo === 'presencia_ausencia') {
      body.valor_cualitativo_esperado = (oQ('#m_cualValor')?.value || '').trim();
    }

    if (origen === 'cliente') {
      body.cliente_id = oQ('#m_cliId').value || null;
      if (!body.cliente_id) { KoguApi.toast('Origen cliente requiere seleccionar cliente.', 'error'); return null; }
    } else {
      body.cliente_id = null;
    }
    return body;
  }

  function confirmarBaja(specId) {
    if (!confirm('¿Desactivar esta especificación?\n\nLos lotes que ya usaron esta spec mantienen su evaluación. Los lotes futuros del mismo producto/parámetro requerirán una nueva spec activa para liberarse.')) return;
    KoguApi.apiFetch(`${BASE}/${specId}`, { method: 'DELETE' })
      .then(() => { KoguApi.toast('Especificación desactivada', 'success'); return load(); })
      .catch(err => KoguApi.toast(err.message, 'error'));
  }

  // ── Helpers de etiqueta para los pickers desde edición ─
  function formatProducto(id) {
    if (!id) return '';
    const p = productos.find(x => x.producto_id === id);
    return p ? `${p.cve_prod || ''} — ${p.desc_prod || ''}`.trim() : '';
  }
  function formatParametro(id) {
    if (!id) return '';
    const p = parametros.find(x => x.parametro_id === id);
    return p ? `${p.clave || ''} — ${p.nombre || ''}`.trim() : '';
  }
  function formatCliente(id) {
    if (!id) return '';
    const c = clientes.find(x => x.cliente_id === id);
    return c ? c.nombre + (c.rfc ? ' — ' + c.rfc : '') : '';
  }
  function formatUnidad(id) {
    if (!id) return '';
    const u = unidades.find(x => x.unidad_id === id);
    return u ? `${u.simbolo || ''} ${u.nombre ? '— ' + u.nombre : ''}`.trim() : '';
  }

  // ── Wiring de filtros y paginación ────────────────────
  $('qFil').addEventListener('input', debounce(() => load({ resetPage: true }), 300));
  $('prodPickBtn').addEventListener('click', () => abrirPickerProducto({
    titulo: 'Filtrar por producto',
    onSelect: (p) => {
      $('prodIdFil').value = p.producto_id;
      $('prodLabel').value = `${p.cve_prod || ''} — ${p.desc_prod || ''}`.trim();
      load({ resetPage: true });
    },
  }));
  $('prodLabel').addEventListener('click', () => $('prodPickBtn').click());
  $('prodClearBtn').addEventListener('click', () => {
    $('prodIdFil').value = '';
    $('prodLabel').value = '';
    load({ resetPage: true });
  });
  $('origenFil').addEventListener('change', () => load({ resetPage: true }));
  $('statusFil').addEventListener('change', () => load({ resetPage: true }));
  $('vigenteFil').addEventListener('change', () => load({ resetPage: true }));

  $('refreshBtn').addEventListener('click', () => load({ showToast: true }));
  $('newSpecBtn').addEventListener('click', () => abrirEditor(null));

  $('pgSize').addEventListener('change', e => {
    pageSize = parseInt(e.target.value, 10) || 25;
    load({ resetPage: true });
  });
  $('pgFirst').addEventListener('click', () => { if (currentPage > 1) { currentPage = 1; load(); } });
  $('pgPrev').addEventListener('click',  () => { if (currentPage > 1) { currentPage--;    load(); } });
  $('pgNext').addEventListener('click',  () => { if (currentPage < totalPages) { currentPage++; load(); } });
  $('pgLast').addEventListener('click',  () => { if (currentPage < totalPages) { currentPage = totalPages; load(); } });

  KoguShell.subscribeEmpresaActivaChange(() => load({ showToast: true, resetPage: true }));

  function escapeHtml(s) { return String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m]); }
  function escapeAttr(s) { return String(s ?? '').replace(/"/g, '&quot;'); }
  function debounce(fn, ms) { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); }; }

  await loadCatalogos();
  await load();
});

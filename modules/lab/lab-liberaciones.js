// ============================================================
// lab-liberaciones.js
// Módulo Liberaciones: puente lote↔cliente entre Calidad y
// Comercial. Tres tabs en una sola pantalla:
//   - Pendientes  → lotes en 'listo_revision' (acción liberar)
//   - Activas     → liberaciones con status='activo'
//                   (acción multi-selección → emitir COA, anular)
//   - Histórico   → anuladas + reemplazadas (solo lectura)
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/lab/lab-liberaciones.html';
  const BASE = '/protected/lab';
  const PERM = 'screen.lab.liberaciones';

  const CONDICIONES = [
    { code: 'normal',              label: 'Normal',              color: '#16a34a' },
    { code: 'excepcion',           label: 'Excepción',           color: '#f97316' },
    { code: 'cliente_especifico',  label: 'Cliente específico',  color: '#3b82f6' },
  ];
  const STATUS_LIB = [
    { code: 'activo',      label: 'Activa',      color: '#16a34a' },
    { code: 'anulado',     label: 'Anulada',     color: '#dc2626' },
    { code: 'reemplazado', label: 'Reemplazada', color: '#94a3b8' },
  ];

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Liberaciones',
    description: 'Entidad puente entre Lotes y Certificados — el filtro que decide qué lotes pueden entregarse a cada cliente.',
    requiredPermission: PERM,
  });
  if (!b) return;

  // ── Estado global ──────────────────────────────────────
  const STATE_KEY = 'lab.liberaciones.state.v1';

  let currentTab    = 'activas';    // 'pendientes' | 'activas' | 'historico'
  let currentPage   = 1;
  let pageSize      = 25;
  let totalPages    = 1;
  let totalRows     = 0;

  let rows          = [];
  let clientes      = [];   // catálogo cacheado para el filtro
  const selectedLib = new Set();   // ids de liberaciones seleccionadas (tab Activas)

  // Restaurar estado previo de UI si lo había en sessionStorage
  try {
    const saved = JSON.parse(sessionStorage.getItem(STATE_KEY) || '{}');
    if (saved.tab) currentTab = saved.tab;
    if (saved.pageSize) pageSize = parseInt(saved.pageSize, 10) || 25;
  } catch (_) { /* noop */ }

  // Aceptar ?tab=pendientes|activas|historico
  const qsp = new URLSearchParams(window.location.search);
  if (qsp.get('tab') && ['pendientes','activas','historico'].includes(qsp.get('tab'))) {
    currentTab = qsp.get('tab');
  }

  // ── Render shell de la pantalla ─────────────────────────
  const c = document.getElementById('pageContent');
  c.innerHTML = `
<div class="card">
  <div class="row">
    <div>
      <div class="eyebrow">Lab QA</div>
      <h2>Liberaciones</h2>
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn ghost"   id="refreshBtn">Actualizar</button>
      <button class="btn primary" id="nuevaLibBtn">+ Nueva liberación</button>
    </div>
  </div>

  <!-- Tabs -->
  <div id="tabsBar" style="margin-top:14px;display:flex;gap:4px;border-bottom:1px solid var(--line)">
    ${tabButton('pendientes', 'Pendientes', '#f59e0b')}
    ${tabButton('activas',    'Activas',    '#16a34a')}
    ${tabButton('historico',  'Histórico',  '#94a3b8')}
  </div>

  <!-- Filtros (cambian según tab) -->
  <div id="filtros" style="margin-top:14px"></div>

  <!-- Toolbar de selección (solo tab Activas) -->
  <div id="selToolbar" style="display:none;margin-top:12px;padding:10px 12px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;align-items:center;gap:10px;flex-wrap:wrap">
    <span id="selCountText" style="font-size:13px;font-weight:600;color:#1e3a8a"></span>
    <span class="muted" style="font-size:12px">Cliente: <span id="selClienteText">—</span></span>
    <div style="margin-left:auto;display:flex;gap:6px">
      <button class="btn ghost"   id="selClearBtn">Limpiar selección</button>
      <button class="btn primary" id="selEmitirCoaBtn">Emitir COA con selección →</button>
    </div>
  </div>

  <!-- Tabla -->
  <div class="table-wrap" style="margin-top:14px">
    <table id="tabla">
      <thead id="tablaHead"></thead>
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
      <button class="btn ghost" id="pgFirst" title="Primera">«</button>
      <button class="btn ghost" id="pgPrev"  title="Anterior">‹</button>
      <span id="pgNumeros" style="display:flex;gap:4px"></span>
      <button class="btn ghost" id="pgNext"  title="Siguiente">›</button>
      <button class="btn ghost" id="pgLast"  title="Última">»</button>
    </div>
  </div>
</div>
  `;

  // Helper para botón de tab
  function tabButton(code, label, color) {
    return `<button data-tab="${code}" class="lib-tab"
      style="border:0;background:transparent;padding:10px 16px;font-size:14px;cursor:pointer;border-bottom:3px solid transparent;color:#64748b">
      <span style="display:inline-block;width:8px;height:8px;background:${color};border-radius:50%;margin-right:6px;vertical-align:middle"></span>${label}
    </button>`;
  }

  // ── Cache de clientes para los filtros ──────────────────
  async function loadClientes() {
    try {
      const res = await KoguApi.apiFetch('/protected/core/clientes');
      clientes = KoguApi.unwrapRows(res);
    } catch (err) {
      console.warn('No se pudieron cargar clientes:', err.message);
      clientes = [];
    }
  }

  // ── Filtros según tab ───────────────────────────────────
  function renderFiltros() {
    const cont = $('filtros');
    if (currentTab === 'pendientes') {
      cont.innerHTML = `
        <div class="grid-2" style="gap:10px">
          <input class="input" id="qFil" placeholder="Buscar por número de lote, cve_prod o descripción"/>
        </div>
      `;
      $('qFil').addEventListener('input', debounce(() => load({ resetPage: true }), 300));
      return;
    }

    // Tab Activas / Histórico — filtros completos
    cont.innerHTML = `
      <div class="grid-2" style="gap:10px">
        <input class="input" id="qFil" placeholder="Lote, producto, cliente, RFC…"/>
        <div style="display:flex;gap:6px;align-items:center">
          <input class="input" id="clienteLabel" readonly placeholder="— Cualquier cliente —"
                 style="flex:1;cursor:pointer;background:#f8fafc"/>
          <button type="button" class="btn ghost" id="clientePickBtn">Cliente…</button>
          <button type="button" class="btn ghost" id="clienteClearBtn" title="Limpiar">×</button>
        </div>
        <input type="hidden" id="clienteIdFil"/>
        <select class="select" id="condFil">
          <option value="">Cualquier condición</option>
          ${CONDICIONES.map(c => `<option value="${c.code}">${c.label}</option>`).join('')}
        </select>
        <select class="select" id="coaFil">
          <option value="">Con o sin COA</option>
          <option value="true">Solo con COA emitido</option>
          <option value="false">Solo sin COA</option>
        </select>
        <select class="select" id="valFil">
          <option value="">Cualquier validación</option>
          <option value="validada">✓ Validada</option>
          <option value="incompleta">⚠ Incompleta</option>
          <option value="no_cumple">✕ No cumple</option>
          <option value="sin_pliego">⚠ Sin pliego</option>
          <option value="sin_lote">○ Sin lote</option>
        </select>
        <div style="display:flex;gap:6px">
          <input class="input" type="date" id="desdeFil" title="Liberada desde"/>
          <input class="input" type="date" id="hastaFil" title="Liberada hasta"/>
        </div>
      </div>
    `;
    $('qFil').addEventListener('input', debounce(() => load({ resetPage: true }), 300));
    $('clientePickBtn').addEventListener('click', abrirPickerCliente);
    $('clienteLabel').addEventListener('click', abrirPickerCliente);
    $('clienteClearBtn').addEventListener('click', () => {
      $('clienteIdFil').value = '';
      $('clienteLabel').value = '';
      load({ resetPage: true });
    });
    $('condFil').addEventListener('change', () => load({ resetPage: true }));
    $('coaFil').addEventListener('change', () => load({ resetPage: true }));
    $('valFil').addEventListener('change', () => load({ resetPage: true }));
    $('desdeFil').addEventListener('change', () => load({ resetPage: true }));
    $('hastaFil').addEventListener('change', () => load({ resetPage: true }));
  }

  function abrirPickerCliente() {
    KoguUi.openSearchPicker({
      title: 'Filtrar liberaciones por cliente',
      items: clientes,
      placeholder: 'Buscar por nombre, RFC o cve_cte…',
      columns: [
        { key: 'nombre',  label: 'Nombre',  primary: true },
        { key: 'rfc',     label: 'RFC' },
        { key: 'cve_cte', label: 'cve_cte' },
      ],
      emptyText: clientes.length === 0
        ? 'No hay clientes en esta empresa.'
        : 'Sin coincidencias',
      onSelect: (cli) => {
        $('clienteIdFil').value = cli.cliente_id;
        $('clienteLabel').value = cli.nombre + (cli.rfc ? ' — ' + cli.rfc : '');
        load({ resetPage: true });
      },
    });
  }

  // ── Cabecera de la tabla según tab ──────────────────────
  function renderHead() {
    if (currentTab === 'pendientes') {
      $('tablaHead').innerHTML = `
        <tr>
          <th>Lote</th>
          <th>Producto</th>
          <th>Cantidad</th>
          <th>Semáforo</th>
          <th>Días</th>
          <th style="text-align:right">Acciones</th>
        </tr>`;
    } else if (currentTab === 'activas') {
      $('tablaHead').innerHTML = `
        <tr>
          <th style="width:32px"><input type="checkbox" id="selAll" title="Seleccionar todo"/></th>
          <th style="width:120px">Folio</th>
          <th>Lote</th>
          <th>Cliente</th>
          <th>Condición</th>
          <th>Liberada</th>
          <th>COA</th>
          <th style="text-align:right">Acciones</th>
        </tr>`;
    } else {
      // historico
      $('tablaHead').innerHTML = `
        <tr>
          <th style="width:120px">Folio</th>
          <th>Lote</th>
          <th>Cliente</th>
          <th>Estado</th>
          <th>Anulada</th>
          <th>Motivo</th>
          <th style="text-align:right">Acciones</th>
        </tr>`;
    }
  }

  // ── Activar tab ─────────────────────────────────────────
  function setActiveTab(tab) {
    currentTab  = tab;
    currentPage = 1;
    selectedLib.clear();
    persistState();
    document.querySelectorAll('.lib-tab').forEach(btn => {
      const active = btn.dataset.tab === tab;
      btn.style.borderBottom = active ? '3px solid #0f172a' : '3px solid transparent';
      btn.style.color        = active ? '#0f172a' : '#64748b';
      btn.style.fontWeight   = active ? '600' : '400';
    });
    renderFiltros();
    renderHead();
    renderToolbarSeleccion();
    load();
  }

  // ── Cargar datos ────────────────────────────────────────
  async function load({ showToast = false, resetPage = false } = {}) {
    if (resetPage) currentPage = 1;

    const params = new URLSearchParams();
    params.set('page',     String(currentPage));
    params.set('pageSize', String(pageSize));

    let url;
    if (currentTab === 'pendientes') {
      const q = ($('qFil')?.value || '').trim();
      if (q) params.set('q', q);
      url = `${BASE}/liberaciones/pendientes?${params.toString()}`;
    } else {
      // activas / historico — ambos usan el endpoint /liberaciones
      const q   = ($('qFil')?.value || '').trim();
      const cli = $('clienteIdFil')?.value || '';
      const cnd = $('condFil')?.value || '';
      const coa = $('coaFil')?.value || '';
      const val = $('valFil')?.value || '';
      const d1  = $('desdeFil')?.value || '';
      const d2  = $('hastaFil')?.value || '';
      if (q)   params.set('q', q);
      if (cli) params.set('cliente_id', cli);
      if (cnd) params.set('condicion', cnd);
      if (coa) params.set('con_coa', coa);
      if (val) params.set('validacion_status', val);
      if (d1)  params.set('fecha_desde', d1);
      if (d2)  params.set('fecha_hasta', d2);

      if (currentTab === 'activas')  params.set('status', 'activo');
      if (currentTab === 'historico') {
        // Hist: status anulado o reemplazado (sin filtro → trae todos los no-activos).
        // Para simplicidad, traemos solo 'anulado' por default; el usuario puede
        // afinar si quiere 'reemplazado' a futuro. Pidiendo ambos requiere 2 calls.
        params.set('status', 'anulado');
      }
      url = `${BASE}/liberaciones?${params.toString()}`;
    }

    try {
      const res  = await KoguApi.apiFetch(url);
      rows = KoguApi.unwrapData(res) || [];
      const meta = res?.meta || {};
      totalRows   = parseInt(meta.total ?? rows.length, 10) || 0;
      pageSize    = parseInt(meta.pageSize ?? pageSize, 10) || pageSize;
      currentPage = parseInt(meta.page ?? currentPage, 10) || 1;
      totalPages  = parseInt(meta.totalPages ?? 1, 10) || 1;
      renderRows();
      renderPaginacion();
      if (showToast) KoguApi.toast('Liberaciones actualizadas', 'success');
    } catch (err) { KoguApi.toast(err.message, 'error'); }
  }

  // ── Filas ───────────────────────────────────────────────
  function renderRows() {
    const tbody = $('rows');
    if (!rows.length) {
      const colspan = currentTab === 'pendientes' ? 6 : currentTab === 'activas' ? 8 : 7;
      const emptyMsg = currentTab === 'pendientes'
        ? 'No hay lotes pendientes de liberar. Cuando un lote pase a estado "Listo revisión", aparecerá aquí.'
        : currentTab === 'activas'
          ? 'No hay liberaciones activas con los filtros aplicados.'
          : 'No hay liberaciones anuladas con los filtros aplicados.';
      tbody.innerHTML = `<tr><td colspan="${colspan}" style="text-align:center;padding:28px;color:var(--muted)">${emptyMsg}</td></tr>`;
      return;
    }

    if (currentTab === 'pendientes') {
      tbody.innerHTML = rows.map(r => filaPendiente(r)).join('');
      tbody.querySelectorAll('button[data-liberar]').forEach(btn => {
        btn.addEventListener('click', () => abrirLiberarModal(btn.dataset.liberar));
      });
    } else if (currentTab === 'activas') {
      tbody.innerHTML = rows.map(r => filaActiva(r)).join('');
      // Checkbox individuales
      tbody.querySelectorAll('input[data-pick]').forEach(cb => {
        cb.addEventListener('change', e => togglePick(e.target.dataset.pick, e.target.checked));
      });
      // Botones detalle / anular
      tbody.querySelectorAll('button[data-detalle]').forEach(btn => {
        btn.addEventListener('click', () => abrirDetalle(btn.dataset.detalle));
      });
      tbody.querySelectorAll('button[data-anular]').forEach(btn => {
        btn.addEventListener('click', () => abrirAnularModal(btn.dataset.anular));
      });
      // Toolbar checkbox "seleccionar todo"
      const selAll = $('selAll');
      if (selAll) {
        selAll.checked = rows.every(r => selectedLib.has(r.liberacion_id));
        selAll.addEventListener('change', () => {
          rows.forEach(r => togglePick(r.liberacion_id, selAll.checked));
          tbody.querySelectorAll('input[data-pick]').forEach(cb => {
            cb.checked = selectedLib.has(cb.dataset.pick);
          });
        });
      }
    } else {
      // historico
      tbody.innerHTML = rows.map(r => filaHistorico(r)).join('');
      tbody.querySelectorAll('button[data-detalle]').forEach(btn => {
        btn.addEventListener('click', () => abrirDetalle(btn.dataset.detalle));
      });
    }
    renderToolbarSeleccion();
  }

  function filaPendiente(l) {
    const sem = (l.semaforo || 'amarillo');
    const semChip = sem === 'verde' ? '<span class="chip" style="background:#dcfce7;color:#166534">✓ Cumple</span>'
                  : sem === 'rojo'  ? '<span class="chip" style="background:#fee2e2;color:#991b1b">✗ No cumple</span>'
                                    : '<span class="chip" style="background:#fef3c7;color:#92400e">⚠ Sin oficial</span>';
    const cant = l.cantidad ? `${parseFloat(l.cantidad).toLocaleString()} ${l.unidad_simbolo || ''}` : '—';
    return `
      <tr>
        <td>
          <strong>${escapeHtml(l.numero_lote)}</strong>
          <div class="muted" style="font-size:12px">${escapeHtml(l.estado_calidad)}</div>
        </td>
        <td>
          ${escapeHtml(l.cve_prod || '')}
          <div class="muted" style="font-size:12px">${escapeHtml(l.desc_prod || '—')}</div>
        </td>
        <td>${escapeHtml(cant)}</td>
        <td>${semChip}</td>
        <td>${l.dias_en_bandeja != null ? l.dias_en_bandeja + 'd' : '—'}</td>
        <td style="text-align:right">
          <button class="btn primary" data-liberar="${l.lote_id}">Liberar a cliente…</button>
        </td>
      </tr>`;
  }

  function filaActiva(lib) {
    const cond = CONDICIONES.find(c => c.code === lib.condicion) || { label: lib.condicion, color: '#64748b' };
    const fecha = lib.fecha_liberacion ? new Date(lib.fecha_liberacion).toLocaleString() : '—';
    const coaChip = (lib.coa_count || 0) > 0
      ? `<span class="chip" style="background:#dcfce7;color:#166534">✓ ${lib.coa_count} COA${lib.coa_count > 1 ? 's' : ''}</span>${lib.ultimo_coa_folio ? `<div class="muted" style="font-size:11px">${escapeHtml(lib.ultimo_coa_folio)}</div>` : ''}`
      : `<span class="chip" style="background:#f1f5f9;color:#475569">— sin COA</span>`;
    const ncChip = chipNcAbiertas(lib);
    const checked = selectedLib.has(lib.liberacion_id) ? 'checked' : '';
    return `
      <tr>
        <td><input type="checkbox" data-pick="${lib.liberacion_id}" ${checked}/></td>
        <td style="font-family:monospace;font-size:12px;white-space:nowrap;color:var(--primary);font-weight:600">
          ${escapeHtml(lib.folio_liberacion || '—')}
        </td>
        <td>
          <strong>${escapeHtml(lib.numero_lote || '—')}</strong>
          <div class="muted" style="font-size:12px">${escapeHtml(lib.cve_prod || '')} — ${escapeHtml(lib.desc_prod || '')}</div>
          ${chipValidacion(lib)}${ncChip}
        </td>
        <td>
          ${escapeHtml(lib.cliente_nombre || '—')}
          <div class="muted" style="font-size:12px">${escapeHtml(lib.cliente_rfc || '')}</div>
        </td>
        <td><span class="chip" style="background:${cond.color}22;color:${cond.color}">${cond.label}</span></td>
        <td>${fecha}<br><span class="muted" style="font-size:12px">por ${escapeHtml(lib.liberador_nombre || '—')}</span></td>
        <td>${coaChip}</td>
        <td style="text-align:right;white-space:nowrap">
          <button class="btn ghost"  data-detalle="${lib.liberacion_id}">Detalle</button>
          <button class="btn ghost danger" data-anular="${lib.liberacion_id}">Anular</button>
        </td>
      </tr>`;
  }

  // Chip "⚠ N NC abiertas" reusable entre tabs.
  // Sólo se muestra si el backend devolvió nc_abiertas_count > 0.
  // Linkea a la bandeja de NCs prefiltrada por lote_id.
  function chipNcAbiertas(lib) {
    const n = parseInt(lib?.nc_abiertas_count || 0, 10);
    if (!n) return '';
    const plural = n > 1 ? 's' : '';
    return `
      <a href="/modules/lab/lab-no-conformidades.html?lote_id=${encodeURIComponent(lib.lote_id)}"
         class="chip"
         style="background:#fef3c7;color:#92400e;font-size:11px;text-decoration:none;margin-top:4px;display:inline-block"
         title="Ver no conformidades abiertas de este lote">⚠ ${n} NC abierta${plural}</a>`;
  }

  // Chip del estado de validación pliego-driven (campo persistido
  // lib.validacion_status). NULL = liberación previa sin evaluar.
  function chipValidacion(lib) {
    const s = lib?.validacion_status;
    if (!s) return '';
    const MAP = {
      validada:   { label: '✓ Validada',   bg: '#dcfce7', fg: '#166534' },
      incompleta: { label: '⚠ Incompleta', bg: '#fef3c7', fg: '#92400e' },
      no_cumple:  { label: '✕ No cumple',  bg: '#fee2e2', fg: '#991b1b' },
      sin_pliego: { label: '⚠ Sin pliego', bg: '#fef3c7', fg: '#92400e' },
      sin_lote:   { label: '○ Sin lote',   bg: '#f1f5f9', fg: '#475569' },
    };
    const m = MAP[s];
    if (!m) return '';
    return `<span class="chip" style="background:${m.bg};color:${m.fg};font-size:11px;margin-top:4px;margin-right:4px;display:inline-block">${m.label}</span>`;
  }

  function filaHistorico(lib) {
    const st  = STATUS_LIB.find(s => s.code === lib.status) || { label: lib.status, color: '#64748b' };
    const fa  = lib.fecha_anulacion ? new Date(lib.fecha_anulacion).toLocaleString() : '—';
    const ncChip = chipNcAbiertas(lib);
    return `
      <tr>
        <td style="font-family:monospace;font-size:12px;white-space:nowrap;color:var(--muted);font-weight:600">
          ${escapeHtml(lib.folio_liberacion || '—')}
        </td>
        <td>
          <strong>${escapeHtml(lib.numero_lote || '—')}</strong>
          <div class="muted" style="font-size:12px">${escapeHtml(lib.cve_prod || '')} — ${escapeHtml(lib.desc_prod || '')}</div>
          ${chipValidacion(lib)}${ncChip}
        </td>
        <td>
          ${escapeHtml(lib.cliente_nombre || '—')}
          <div class="muted" style="font-size:12px">${escapeHtml(lib.cliente_rfc || '')}</div>
        </td>
        <td><span class="chip" style="background:${st.color}22;color:${st.color}">${st.label}</span></td>
        <td>${fa}</td>
        <td style="max-width:340px"><span class="muted" style="font-size:13px">${escapeHtml(lib.motivo_anulacion || '—')}</span></td>
        <td style="text-align:right">
          <button class="btn ghost" data-detalle="${lib.liberacion_id}">Detalle</button>
        </td>
      </tr>`;
  }

  // ── Selección múltiple (tab Activas) ────────────────────
  function togglePick(libId, checked) {
    if (checked) selectedLib.add(libId);
    else          selectedLib.delete(libId);
    renderToolbarSeleccion();
  }

  function renderToolbarSeleccion() {
    const bar = $('selToolbar');
    if (!bar) return;
    if (currentTab !== 'activas' || selectedLib.size === 0) {
      bar.style.display = 'none';
      return;
    }
    bar.style.display = 'flex';
    $('selCountText').textContent = `${selectedLib.size} liberación${selectedLib.size === 1 ? '' : 'es'} seleccionada${selectedLib.size === 1 ? '' : 's'}`;

    // Validar que todas las seleccionadas sean del mismo cliente
    const seleccionadas = rows.filter(r => selectedLib.has(r.liberacion_id));
    const clientesUnicos = new Set(seleccionadas.map(r => r.cliente_id));
    if (clientesUnicos.size === 1 && seleccionadas[0]) {
      $('selClienteText').textContent = seleccionadas[0].cliente_nombre || '—';
      $('selEmitirCoaBtn').disabled = false;
      $('selEmitirCoaBtn').title = '';
    } else if (clientesUnicos.size > 1) {
      $('selClienteText').textContent = `${clientesUnicos.size} clientes distintos (debe ser solo uno)`;
      $('selEmitirCoaBtn').disabled = true;
      $('selEmitirCoaBtn').title = 'Solo se puede emitir COA con liberaciones del mismo cliente';
    } else {
      // las liberaciones seleccionadas no están en la página actual; deshabilitamos
      $('selClienteText').textContent = '— (selección parcial fuera de la página actual)';
      $('selEmitirCoaBtn').disabled = true;
    }
  }

  // ── Paginación ──────────────────────────────────────────
  function renderPaginacion() {
    const inicio = totalRows === 0 ? 0 : (currentPage - 1) * pageSize + 1;
    const fin    = Math.min(currentPage * pageSize, totalRows);
    $('pgInfo').textContent = totalRows
      ? `Mostrando ${inicio}–${fin} de ${totalRows}`
      : 'Sin resultados';
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

  // ── Liberar con manejo de errores B3 ────────────────────
  // Usa authFetchRaw para poder leer el body completo del 422
  // (con codigo + details) y abrir modales explicativos.
  async function liberarConManejoDeErrores(payload, { contextoUI = '' } = {}) {
    let response;
    try {
      response = await KoguApi.authFetchRaw(`${BASE}/liberaciones`, {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (netErr) {
      KoguApi.toast('Error de red: ' + netErr.message, 'error');
      return { ok: false };
    }

    let bodyJson = null;
    try { bodyJson = await response.json(); } catch (_) { /* sin body */ }

    if (response.ok) {
      return { ok: true, data: bodyJson?.data };
    }

    // Errores estructurados del nuevo modelo (V037+)
    const code = bodyJson?.error?.code || bodyJson?.code;
    const msg  = bodyJson?.error?.message || bodyJson?.message || 'No fue posible liberar.';
    const det  = bodyJson?.error?.details || bodyJson?.details || null;

    if (response.status === 422 && code === 'SPEC_CLIENTE_FALTANTE') {
      abrirModalSpecFaltante({ payload, details: det, contextoUI });
      return { ok: false, handled: true };
    }
    if (response.status === 422 && code === 'LOTE_NO_CUMPLE_SPEC_CLIENTE') {
      abrirModalNoCumple({ payload, details: det });
      return { ok: false, handled: true };
    }
    if (response.status === 422 && code === 'LOTE_FALTA_RESULTADO_PLIEGO') {
      abrirModalFaltaResultado({ payload, details: det });
      return { ok: false, handled: true };
    }

    // Cualquier otro error: toast genérico
    KoguApi.toast(msg, 'error');
    return { ok: false };
  }

  // Modal B3 — spec del cliente faltante
  function abrirModalSpecFaltante({ payload, details, contextoUI }) {
    const params = details?.parametros_sin_spec || [];
    const claves = params.map(p => p.parametro_clave).join(', ');
    const cveProd = details?.cve_prod || '';
    const descProd = details?.desc_prod || '';

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
    overlay.innerHTML = `
      <div style="background:white;border-radius:8px;max-width:580px;width:100%;padding:24px;box-shadow:0 25px 50px rgba(0,0,0,.3)">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
          <span style="font-size:24px">⚠️</span>
          <h2 style="margin:0">Spec del cliente faltante</h2>
        </div>
        <div style="font-size:13px;line-height:1.5;color:#475569">
          <p>Este cliente no tiene especificación capturada para <strong>${escapeHtml(cveProd)}${descProd ? ' — ' + escapeHtml(descProd) : ''}</strong> en uno o más parámetros oficiales del lote:</p>
          <div style="margin:10px 0;padding:10px;background:#fef3c7;border-radius:6px;font-family:monospace;font-size:13px;color:#78350f">
            ${escapeHtml(claves)}
          </div>
          <p>Sin spec del cliente no se puede liberar. Elige una acción:</p>
        </div>

        <div style="display:flex;flex-direction:column;gap:8px;margin-top:18px">
          <button class="btn primary" id="opCapturar" style="text-align:left;padding:12px">
            <strong>Capturar la especificación del cliente</strong><br>
            <span style="font-weight:normal;font-size:12px;opacity:.9">Abre la pantalla de Especificaciones con cliente y producto pre-seleccionados.</span>
          </button>
          <button class="btn ghost" id="opExcepcion" style="text-align:left;padding:12px">
            <strong>Crear excepción para que QA apruebe sin spec</strong><br>
            <span style="font-weight:normal;font-size:12px;opacity:.8">Crea una excepción borrador. Hasta que gerencia la apruebe, no se libera.</span>
          </button>
          <button class="btn ghost" id="opCancelar" style="margin-top:6px">Cancelar</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const oQ = (s) => overlay.querySelector(s);
    const close = () => overlay.remove();
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    oQ('#opCancelar').addEventListener('click', close);

    oQ('#opCapturar').addEventListener('click', () => {
      const q = new URLSearchParams();
      if (details?.cliente_id)  q.set('cliente_id',  details.cliente_id);
      if (details?.producto_id) q.set('producto_id', details.producto_id);
      window.location.href = `/modules/lab/lab-especificaciones.html?${q.toString()}`;
    });

    oQ('#opExcepcion').addEventListener('click', async () => {
      oQ('#opExcepcion').disabled = true;
      try {
        const res = await KoguApi.apiFetch(`${BASE}/excepciones/auto-spec-faltante`, {
          method: 'POST',
          body: JSON.stringify({
            lote_id:    payload.lote_id,
            cliente_id: payload.cliente_id,
          }),
        });
        const exc = KoguApi.unwrapData(res);
        KoguApi.toast('Excepción creada en borrador. QA debe aprobarla.', 'success');
        close();
        // Modal de seguimiento con info clara del flujo Opción B
        const followup = document.createElement('div');
        followup.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
        followup.innerHTML = `
          <div style="background:white;border-radius:8px;max-width:520px;width:100%;padding:24px;box-shadow:0 25px 50px rgba(0,0,0,.3)">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
              <span style="font-size:24px">📋</span>
              <h2 style="margin:0">Excepción creada</h2>
            </div>
            <div style="font-size:13px;line-height:1.6;color:#475569">
              <p>Excepción <strong style="font-family:monospace;color:#0f172a">${escapeHtml((exc?.excepcion_id || '').slice(0, 8))}</strong> creada en estado <span class="chip" style="background:#fef3c7;color:#92400e">borrador</span>.</p>
              <div style="margin:14px 0;padding:12px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px">
                <strong style="color:#1e3a8a">Próximos pasos:</strong>
                <ol style="margin:8px 0 0 18px;padding:0">
                  <li>Notifica a gerencia QA para que revise la excepción.</li>
                  <li>QA aprueba o rechaza la excepción desde <strong>Excepciones</strong>.</li>
                  <li>Al aprobar, <strong style="color:#16a34a">la liberación se crea automáticamente</strong> con condición "excepción" — no tienes que regresar aquí.</li>
                </ol>
              </div>
            </div>
            <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:18px">
              <button class="btn ghost"   id="fuCancelBtn">Cerrar</button>
              <button class="btn primary" id="fuVerExc">Ir a Excepciones →</button>
            </div>
          </div>
        `;
        document.body.appendChild(followup);
        followup.addEventListener('click', ev => { if (ev.target === followup) followup.remove(); });
        followup.querySelector('#fuCancelBtn').addEventListener('click', () => followup.remove());
        followup.querySelector('#fuVerExc').addEventListener('click', () => {
          window.location.href = '/modules/lab/lab-excepciones.html';
        });
      } catch (err) {
        oQ('#opExcepcion').disabled = false;
        KoguApi.toast(err.message, 'error');
      }
    });
  }

  // Modal — lote no cumple spec del cliente
  function abrirModalNoCumple({ payload, details }) {
    const params = details?.parametros_no_cumplen || [];
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
    overlay.innerHTML = `
      <div style="background:white;border-radius:8px;max-width:620px;width:100%;padding:24px;box-shadow:0 25px 50px rgba(0,0,0,.3)">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
          <span style="font-size:24px">⛔</span>
          <h2 style="margin:0">Lote no cumple la spec del cliente</h2>
        </div>
        <div style="font-size:13px;line-height:1.5;color:#475569">
          <p>El lote tiene resultados que están fuera de los límites del cliente:</p>
          <table style="width:100%;margin-top:8px;border-collapse:collapse;font-size:13px">
            <thead><tr style="background:#fee2e2;color:#991b1b">
              <th style="text-align:left;padding:6px">Parámetro</th>
              <th style="text-align:left;padding:6px">Valor oficial</th>
              <th style="text-align:left;padding:6px">Spec del cliente</th>
            </tr></thead>
            <tbody>
              ${params.map(p => {
                const valor = p.valor_oficial != null
                  ? `${parseFloat(p.valor_oficial).toLocaleString()}${p.unidad_simbolo ? ' ' + p.unidad_simbolo : ''}`
                  : (p.valor_texto || '—');
                let spec = '—';
                if (p.tipo_evaluacion === 'rango') spec = `${p.lim_min}–${p.lim_max}`;
                else if (p.tipo_evaluacion === 'mayor_igual') spec = `≥ ${p.lim_min}`;
                else if (p.tipo_evaluacion === 'menor_igual') spec = `≤ ${p.lim_max}`;
                else if (p.tipo_evaluacion === 'igual') spec = `= ${p.objetivo} ± ${p.tolerancia ?? 0}`;
                else spec = `"${p.valor_cualitativo_esperado || ''}"`;
                return `<tr style="border-top:1px solid #fecaca">
                  <td style="padding:6px"><strong>${escapeHtml(p.parametro_clave)}</strong></td>
                  <td style="padding:6px;color:#dc2626;font-weight:600">${escapeHtml(valor)}</td>
                  <td style="padding:6px">${escapeHtml(spec)}${p.unidad_simbolo ? ' ' + escapeHtml(p.unidad_simbolo) : ''}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
          <p style="margin-top:14px">Para entregar este lote a pesar de las desviaciones, debes crear una excepción aprobada por gerencia de QA.</p>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:18px">
          <button class="btn ghost"   id="opCancelar">Cancelar</button>
          <button class="btn primary" id="opIrExcepcion">Crear excepción manualmente →</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    overlay.querySelector('#opCancelar').addEventListener('click', close);
    overlay.querySelector('#opIrExcepcion').addEventListener('click', () => {
      // Redirige al wizard de excepción de la bandeja clásica (que sigue funcional)
      window.location.href = `/modules/lab/lab-bandeja.html`;
    });
  }

  // Modal — el pliego exige parámetros sin resultado en el lote
  function abrirModalFaltaResultado({ payload, details }) {
    const params = details?.parametros_falta_resultado || [];
    const loteId = payload?.lote_id || details?.lote_id || '';
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
    overlay.innerHTML = `
      <div style="background:white;border-radius:8px;max-width:600px;width:100%;padding:24px;box-shadow:0 25px 50px rgba(0,0,0,.3)">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
          <span style="font-size:24px">⚠️</span>
          <h2 style="margin:0">Faltan resultados exigidos por el pliego</h2>
        </div>
        <div style="font-size:13px;line-height:1.5;color:#475569">
          <p>El pliego del cliente exige parámetros que el lote no tiene medidos. No se puede certificar contra una especificación sin el resultado:</p>
          <div style="margin:10px 0;padding:10px;background:#fef3c7;border-radius:6px;font-family:monospace;font-size:13px;color:#78350f">
            ${escapeHtml(params.map(p => p.parametro_clave).join(', ') || '—')}
          </div>
          <p>Elige una acción:</p>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;margin-top:14px">
          <button class="btn primary" id="opCapturarRes" style="text-align:left;padding:12px">
            <strong>Capturar los resultados faltantes en el lote</strong><br>
            <span style="font-weight:normal;font-size:12px;opacity:.9">Abre el detalle del lote para registrar muestras y resultados.</span>
          </button>
          <button class="btn ghost" id="opExcepcionFalta" style="text-align:left;padding:12px">
            <strong>Crear excepción para que QA apruebe sin el resultado</strong><br>
            <span style="font-weight:normal;font-size:12px;opacity:.8">Crea la excepción en la bandeja; al aprobarla, la liberación se genera con condición "excepción".</span>
          </button>
          <button class="btn ghost" id="opCancelarFalta" style="margin-top:6px">Cancelar</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    overlay.querySelector('#opCancelarFalta').addEventListener('click', close);
    overlay.querySelector('#opCapturarRes').addEventListener('click', () => {
      window.location.href = `/modules/lab/lab-lote-detalle.html?id=${encodeURIComponent(loteId)}`;
    });
    overlay.querySelector('#opExcepcionFalta').addEventListener('click', () => {
      window.location.href = `/modules/lab/lab-bandeja.html`;
    });
  }

  // ── Acción: modal "Nueva liberación" (desde botón header) ──
  // Permite elegir lote (entre los liberables) + cliente + condición.
  // A diferencia de "Liberar a cliente…" desde tab Pendientes, esto
  // funciona para lotes ya liberados (multi-cliente).
  async function abrirNuevaLiberacionModal() {
    let lotesLiberables = [];
    try {
      const res = await KoguApi.apiFetch(`${BASE}/liberaciones/lotes-liberables?pageSize=200`);
      lotesLiberables = KoguApi.unwrapData(res) || [];
    } catch (err) {
      return KoguApi.toast('No se pudieron cargar los lotes: ' + err.message, 'error');
    }
    if (!lotesLiberables.length) {
      return KoguApi.toast('No hay lotes en estado liberable. Lleva un lote a "Listo revisión" desde su detalle.', 'info');
    }

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
    overlay.innerHTML = `
      <div style="background:white;border-radius:8px;max-width:640px;width:100%;max-height:90vh;overflow:auto;padding:24px;box-shadow:0 25px 50px rgba(0,0,0,.3)">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px">
          <div>
            <div class="eyebrow">Lab QA</div>
            <h2 style="margin:6px 0 0 0">Nueva liberación</h2>
            <div class="muted" style="font-size:13px;margin-top:6px">
              Elige el lote a liberar y el cliente al que se entregará.
              Puedes liberar el mismo lote a múltiples clientes — cada liberación es independiente.
            </div>
          </div>
          <button class="btn ghost" id="closeNuevaBtn">×</button>
        </div>

        <div style="margin-top:8px">
          <div class="label-text">Lote *</div>
          <div style="display:flex;gap:6px">
            <input class="input" id="loteLabel" readonly placeholder="— Selecciona un lote —"
                   style="flex:1;cursor:pointer;background:#f8fafc"/>
            <button type="button" class="btn ghost" id="lotePickBtn">Buscar lote…</button>
          </div>
          <input type="hidden" id="loteIdSel"/>
          <div class="muted" style="margin-top:4px;font-size:12px">
            Solo se muestran lotes en estados <strong>Listo revisión</strong>, <strong>Liberado</strong> o <strong>Con excepción</strong>.
          </div>
        </div>

        <div style="margin-top:14px">
          <div class="label-text">Cliente *</div>
          <div style="display:flex;gap:6px">
            <input class="input" id="cliLabel" readonly placeholder="— Selecciona un cliente —"
                   style="flex:1;cursor:pointer;background:#f8fafc"/>
            <button type="button" class="btn ghost" id="cliPickBtn">Buscar cliente…</button>
          </div>
          <input type="hidden" id="cliIdSel"/>
        </div>

        <div class="grid-2" style="gap:10px;margin-top:14px">
          <div>
            <div class="label-text">Condición</div>
            <select class="select" id="condSel">
              <option value="normal" selected>Normal</option>
              <option value="cliente_especifico">Cliente específico</option>
            </select>
            <div class="muted" style="margin-top:4px;font-size:12px">
              Para condición "Excepción", usa la bandeja clásica (crea la excepción primero).
            </div>
          </div>
          <div>
            <div class="label-text">Folio factura externa (opcional)</div>
            <input class="input" id="folioFactSel" maxlength="60" placeholder="ej. FAC-2026-001234"/>
          </div>
        </div>

        <div style="margin-top:14px">
          <div class="label-text">Observaciones (opcional)</div>
          <textarea class="input" id="obsSel" rows="2" maxlength="500"></textarea>
        </div>

        <div style="margin-top:24px;display:flex;gap:8px;justify-content:flex-end">
          <button class="btn ghost"   id="cancelNuevaBtn">Cancelar</button>
          <button class="btn primary" id="crearNuevaBtn" disabled>Crear liberación</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const overlayQ = (s) => overlay.querySelector(s);
    const close = () => overlay.remove();

    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    overlayQ('#closeNuevaBtn').addEventListener('click', close);
    overlayQ('#cancelNuevaBtn').addEventListener('click', close);

    function actualizarCrearBtn() {
      const ok = !!overlayQ('#loteIdSel').value && !!overlayQ('#cliIdSel').value;
      overlayQ('#crearNuevaBtn').disabled = !ok;
    }

    function abrirPickerLote() {
      KoguUi.openSearchPicker({
        title: 'Selecciona el lote a liberar',
        items: lotesLiberables.map(l => ({
          ...l,
          display_estado: l.estado_calidad === 'listo_revision' ? '✓ Listo revisión'
                        : l.estado_calidad === 'con_excepcion'  ? '⚠ Con excepción'
                        : '● Ya liberado',
          display_clientes: l.liberaciones_activas > 0
            ? `${l.liberaciones_activas} cliente${l.liberaciones_activas === 1 ? '' : 's'}`
            : '—',
        })),
        placeholder: 'Buscar por número de lote, cve_prod o descripción…',
        columns: [
          { key: 'numero_lote',      label: 'Lote',     primary: true },
          { key: 'cve_prod',         label: 'cve_prod' },
          { key: 'desc_prod',        label: 'Producto' },
          { key: 'display_estado',   label: 'Estado' },
          { key: 'display_clientes', label: 'Ya liberado a' },
        ],
        emptyText: 'Sin coincidencias',
        onSelect: (l) => {
          overlayQ('#loteIdSel').value = l.lote_id;
          overlayQ('#loteLabel').value = `${l.numero_lote} — ${l.cve_prod || ''} ${l.desc_prod || ''}`.trim();
          actualizarCrearBtn();
        },
      });
    }
    function abrirPickerCli() {
      KoguUi.openSearchPicker({
        title: 'Selecciona el cliente al que liberar',
        items: clientes,
        placeholder: 'Buscar por nombre, RFC o cve_cte…',
        columns: [
          { key: 'nombre',  label: 'Nombre',  primary: true },
          { key: 'rfc',     label: 'RFC' },
          { key: 'cve_cte', label: 'cve_cte' },
        ],
        emptyText: clientes.length === 0
          ? 'No hay clientes en esta empresa.'
          : 'Sin coincidencias',
        onSelect: (c) => {
          overlayQ('#cliIdSel').value = c.cliente_id;
          overlayQ('#cliLabel').value = c.nombre + (c.rfc ? ' — ' + c.rfc : '');
          actualizarCrearBtn();
        },
      });
    }
    overlayQ('#lotePickBtn').addEventListener('click', abrirPickerLote);
    overlayQ('#loteLabel').addEventListener('click', abrirPickerLote);
    overlayQ('#cliPickBtn').addEventListener('click', abrirPickerCli);
    overlayQ('#cliLabel').addEventListener('click', abrirPickerCli);

    overlayQ('#crearNuevaBtn').addEventListener('click', async () => {
      const loteId = overlayQ('#loteIdSel').value;
      const cliId  = overlayQ('#cliIdSel').value;
      if (!loteId || !cliId) return;

      const payload = {
        lote_id:               loteId,
        cliente_id:            cliId,
        condicion:             overlayQ('#condSel').value,
        folio_factura_externa: overlayQ('#folioFactSel').value.trim() || null,
        observaciones:         overlayQ('#obsSel').value.trim() || null,
      };

      try {
        overlayQ('#crearNuevaBtn').disabled = true;
        const result = await liberarConManejoDeErrores(payload, { contextoUI: 'nueva-liberacion' });
        if (result.ok) {
          KoguApi.toast(`Liberación creada (${result.data?.cliente_nombre || ''})`, 'success');
          close();
          if (currentTab !== 'activas') setActiveTab('activas');
          else                          await load();
        } else {
          overlayQ('#crearNuevaBtn').disabled = false;
          if (result.handled) close(); // modal explicativo ya abierto
        }
      } catch (err) {
        overlayQ('#crearNuevaBtn').disabled = false;
        KoguApi.toast(err.message, 'error');
      }
    });
  }

  // ── Acción: liberar lote (modal mínimo) ─────────────────
  function abrirLiberarModal(loteId) {
    // Si tenemos pocos clientes los listamos; si hay muchos, picker.
    KoguUi.openSearchPicker({
      title: 'Liberar lote a cliente',
      items: clientes,
      placeholder: 'Buscar por nombre, RFC o cve_cte…',
      columns: [
        { key: 'nombre',  label: 'Nombre',  primary: true },
        { key: 'rfc',     label: 'RFC' },
        { key: 'cve_cte', label: 'cve_cte' },
      ],
      emptyText: 'No hay clientes en esta empresa.',
      onSelect: async (cli) => {
        if (!confirm(`¿Liberar este lote al cliente "${cli.nombre}"?\n\nSe creará una liberación con condición "Normal". Si necesitas excepción, ve a la Bandeja de Calidad clásica.`)) return;
        const payload = {
          lote_id:    loteId,
          cliente_id: cli.cliente_id,
          condicion:  'normal',
        };
        const result = await liberarConManejoDeErrores(payload, { contextoUI: 'pendientes' });
        if (result.ok) {
          KoguApi.toast(`Liberación creada (${result.data?.cliente_nombre || cli.nombre})`, 'success');
          await load();
        }
        // Si no ok: el helper ya mostró toast o modal según corresponda.
      },
    });
  }

  // ── Acción: anular ──────────────────────────────────────
  async function abrirAnularModal(libId) {
    const motivo = prompt('Motivo de anulación (mínimo 5 caracteres):');
    if (motivo == null) return;
    if (motivo.trim().length < 5) {
      return KoguApi.toast('El motivo debe tener al menos 5 caracteres.', 'error');
    }
    if (!confirm('¿Anular esta liberación?\n\nLos COAs ya emitidos NO se anulan (son inmutables).')) return;
    try {
      const res = await KoguApi.apiFetch(`${BASE}/liberaciones/${libId}/anular`, {
        method: 'POST',
        body: JSON.stringify({ motivo: motivo.trim() }),
      });
      const data = KoguApi.unwrapData(res);
      KoguApi.toast(data.mensaje || 'Liberación anulada', 'success');
      selectedLib.delete(libId);
      await load();
    } catch (err) { KoguApi.toast(err.message, 'error'); }
  }

  // ── Acción: detalle (modal simple) ──────────────────────
  async function abrirDetalle(libId) {
    try {
      const res = await KoguApi.apiFetch(`${BASE}/liberaciones/${libId}`);
      const lib = KoguApi.unwrapData(res);
      mostrarModalDetalle(lib);
    } catch (err) { KoguApi.toast(err.message, 'error'); }
  }

  // ── Comparativo PLIEGO-DRIVEN: dos tablas paralelas (resultados
  //    del lote vs especificación del cliente). La autoridad es el
  //    PLIEGO del cliente: ambas tablas listan los parámetros del
  //    pliego. Un parámetro exigido sin resultado en el lote se marca
  //    "FALTA RESULTADO" (ámbar). Los oficiales del lote que el pliego
  //    no exige van a un bloque informativo aparte. Semáforo sutil:
  //    verde cumple · rojo no cumple · ámbar falta resultado.
  //    lib.comparacion lo arma el backend (getById); si no viene
  //    (backend previo), la sección no se dibuja.
  function buildComparativoHtml(lib) {
    const comp = lib.comparacion;
    if (!comp) return '';

    const h3 = '<h3 style="margin-top:20px;margin-bottom:6px;font-size:14px">Comparativo — Resultados del lote vs Especificación del cliente</h3>';
    const infoBox = (txt) =>
      `${h3}<div style="background:#f1f5f9;color:#475569;padding:10px;border-radius:6px;font-size:13px">${escapeHtml(txt)}</div>`;

    if (comp.motivo === 'sin_lote')
      return infoBox('Esta liberación no tiene un lote vinculado, así que no hay resultados de laboratorio que comparar.');
    if (comp.motivo === 'error')
      return infoBox('No se pudo cargar el comparativo en este momento.');

    const evaluables   = comp.parametros || [];                      // pliego ∩ lote
    const sinResultado = comp.parametros_pliego_sin_resultado || [];  // pliego − lote
    const fueraPliego  = comp.parametros_sin_spec || [];             // lote − pliego

    const num = (v) => (v === null || v === undefined || v === '') ? '' : v;
    const fmtValorLote = (p) => {
      if (p.valor_oficial !== null && p.valor_oficial !== undefined && p.valor_oficial !== '')
        return String(p.valor_oficial);
      if (p.valor_texto) return String(p.valor_texto);
      return '—';
    };
    const fmtCriterio = (p) => {
      switch (p.tipo_evaluacion) {
        case 'rango':              return `${num(p.lim_min)} – ${num(p.lim_max)}`;
        case 'mayor_igual':        return `≥ ${num(p.lim_min)}`;
        case 'menor_igual':        return `≤ ${num(p.lim_max)}`;
        case 'igual':              return `${num(p.objetivo)} ± ${num(p.tolerancia) || 0}`;
        case 'cualitativo':
        case 'presencia_ausencia': return num(p.valor_cualitativo_esperado) || '—';
        default:                   return '—';
      }
    };
    const tintCumple = (c) => {
      if (c === true)  return 'background:#dcfce7;color:#166534;font-weight:600';
      if (c === false) return 'background:#fee2e2;color:#991b1b;font-weight:600';
      return '';
    };
    const celdaParam = (p) =>
      `${escapeHtml(p.parametro_clave || '')} <span class="muted" style="font-size:11px">${escapeHtml(p.parametro_nombre || '')}</span>`;

    // Bloque informativo: oficiales del lote que el cliente no exige.
    const bloqueFueraPliego = fueraPliego.length ? `
      <div style="margin-top:14px">
        <div style="font-weight:600;font-size:12px;margin-bottom:4px">
          Otros resultados del lote — no exigidos por este cliente
        </div>
        <div class="muted" style="font-size:11px;margin-bottom:4px">
          El lote midió estos parámetros pero el pliego de ${escapeHtml(lib.cliente_nombre || 'este cliente')} no los pide; no se evalúan para esta liberación.
        </div>
        <table>
          <thead><tr><th>Parámetro</th><th style="text-align:right">Valor</th></tr></thead>
          <tbody>${
            fueraPliego
              .slice()
              .sort((a, b) => String(a.parametro_clave || '').localeCompare(String(b.parametro_clave || '')))
              .map(p => `
                <tr>
                  <td>${celdaParam(p)}</td>
                  <td style="text-align:right">${escapeHtml(fmtValorLote(p))}</td>
                </tr>`).join('')
          }</tbody>
        </table>
      </div>` : '';

    // Universo del pliego = evaluables + sin resultado, ordenado por clave.
    const filasPliego = [
      ...evaluables.map(p   => ({ ...p, _tipo: 'eval',  _cumple: p.cumple === true })),
      ...sinResultado.map(p => ({ ...p, _tipo: 'falta', _cumple: null })),
    ].sort((a, b) => String(a.parametro_clave || '').localeCompare(String(b.parametro_clave || '')));

    // Sin parámetros de pliego: o no hay pliego vigente, o no hay oficiales.
    if (!filasPliego.length) {
      if (fueraPliego.length)
        return `${h3}
          <div style="background:#fef3c7;border-left:3px solid #f59e0b;color:#92400e;padding:8px 10px;border-radius:4px;font-size:12px;margin-bottom:8px">
            ⚠ El cliente no tiene un pliego vigente para este producto. No hay especificación contra la cual evaluar el lote.
          </div>
          ${bloqueFueraPliego}`;
      return infoBox('El lote no tiene resultados oficiales registrados todavía.');
    }

    const alertaFalta = sinResultado.length ? `
      <div style="background:#fef3c7;border-left:3px solid #f59e0b;color:#92400e;padding:8px 10px;border-radius:4px;font-size:12px;margin-bottom:8px">
        ⚠ El pliego del cliente exige ${sinResultado.length} parámetro(s) sin resultado en el lote
        (${escapeHtml(sinResultado.map(p => p.parametro_clave).join(', '))}). La evaluación está incompleta.
      </div>` : '';

    const filasLote = filasPliego.map(p => `
      <tr>
        <td>${celdaParam(p)}</td>
        ${p._tipo === 'falta'
          ? '<td style="text-align:right;background:#fef3c7;color:#92400e;font-weight:600">FALTA RESULTADO</td>'
          : `<td style="text-align:right;${tintCumple(p._cumple)}">${escapeHtml(fmtValorLote(p))}</td>`}
        <td>${escapeHtml(p.unidad_simbolo || '')}</td>
      </tr>`).join('');

    const filasSpec = filasPliego.map(p => `
      <tr>
        <td>${celdaParam(p)}</td>
        <td style="text-align:right">${escapeHtml(fmtCriterio(p))}</td>
        <td>${escapeHtml(p.unidad_simbolo || '')}</td>
      </tr>`).join('');

    return `
      ${h3}
      <div class="muted" style="font-size:11px;margin-bottom:8px">
        Las dos tablas listan los parámetros del pliego vigente hoy del cliente.
        El valor del lote se resalta en verde si cumple, rojo si no cumple y ámbar si falta el resultado.
      </div>
      ${alertaFalta}
      <div style="display:flex;gap:16px;flex-wrap:wrap">
        <div style="flex:1 1 330px;min-width:270px">
          <div style="font-weight:600;font-size:12px;margin-bottom:4px">
            Resultados del lote · ${escapeHtml(lib.numero_lote || '—')}
          </div>
          <table>
            <thead><tr><th>Parámetro</th><th style="text-align:right">Valor</th><th>Unidad</th></tr></thead>
            <tbody>${filasLote}</tbody>
          </table>
        </div>
        <div style="flex:1 1 330px;min-width:270px">
          <div style="font-weight:600;font-size:12px;margin-bottom:4px">
            Especificación · ${escapeHtml(lib.cliente_nombre || '—')}
          </div>
          <table>
            <thead><tr><th>Parámetro</th><th style="text-align:right">Criterio</th><th>Unidad</th></tr></thead>
            <tbody>${filasSpec}</tbody>
          </table>
        </div>
      </div>
      ${bloqueFueraPliego}
    `;
  }

  function mostrarModalDetalle(lib) {
    const cond  = CONDICIONES.find(c => c.code === lib.condicion) || { label: lib.condicion, color: '#64748b' };
    const st    = STATUS_LIB.find(s => s.code === lib.status)     || { label: lib.status,    color: '#64748b' };
    const fecha = lib.fecha_liberacion ? new Date(lib.fecha_liberacion).toLocaleString() : '—';
    const fa    = lib.fecha_anulacion  ? new Date(lib.fecha_anulacion).toLocaleString()  : '';

    const coasHtml = (lib.coas || []).length
      ? lib.coas.map(c => `
          <tr>
            <td><a href="/modules/lab/lab-coa-detalle.html?id=${c.coa_id}" style="color:#2563eb">${escapeHtml(c.folio_coa)}</a></td>
            <td>${escapeHtml(c.idioma.toUpperCase())}</td>
            <td>${escapeHtml(c.estado)}</td>
            <td>${c.fecha_emision ? new Date(c.fecha_emision).toLocaleString() : '—'}</td>
          </tr>`).join('')
      : `<tr><td colspan="4" style="text-align:center;color:#94a3b8">Sin COAs emitidos para esta liberación</td></tr>`;

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
    overlay.innerHTML = `
      <div style="background:white;border-radius:8px;max-width:960px;width:100%;max-height:90vh;overflow:auto;padding:24px;box-shadow:0 25px 50px rgba(0,0,0,.3)">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px">
          <div>
            <div class="eyebrow">Liberación · ${escapeHtml(lib.numero_lote || '—')}</div>
            <h2 style="margin:6px 0 0 0">${escapeHtml(lib.cliente_nombre || '—')}</h2>
            <div class="muted" style="font-size:12px">${escapeHtml(lib.cliente_rfc || '')}</div>
            ${lib.folio_liberacion ? `<div style="margin-top:4px;font-family:monospace;font-size:13px;color:var(--primary)">${escapeHtml(lib.folio_liberacion)}</div>` : ''}
          </div>
          <button class="btn ghost" id="closeDetalleBtn">×</button>
        </div>

        <div class="grid-2" style="gap:10px;font-size:13px">
          <div><strong>Estado:</strong> <span class="chip" style="background:${st.color}22;color:${st.color}">${st.label}</span></div>
          <div><strong>Condición:</strong> <span class="chip" style="background:${cond.color}22;color:${cond.color}">${cond.label}</span></div>
          <div><strong>Producto:</strong> ${escapeHtml(lib.cve_prod || '')} — ${escapeHtml(lib.desc_prod || '')}</div>
          <div><strong>Liberada:</strong> ${fecha}</div>
          <div><strong>Liberador:</strong> ${escapeHtml(lib.liberador_nombre || '—')}<br><span class="muted" style="font-size:12px">${escapeHtml(lib.liberador_email || '')}</span></div>
          ${lib.folio_factura_externa ? `<div><strong>Ref. factura:</strong> ${escapeHtml(lib.folio_factura_externa)}</div>` : ''}
          ${lib.observaciones ? `<div style="grid-column:1/-1"><strong>Observaciones:</strong><br><span class="muted">${escapeHtml(lib.observaciones)}</span></div>` : ''}
          ${lib.excepcion_id ? `
            <div style="grid-column:1/-1;background:#fef3c7;padding:10px;border-radius:6px">
              <strong>Excepción asociada:</strong> ${escapeHtml(lib.excepcion_categoria || '—')}<br>
              <span class="muted" style="font-size:12px">${escapeHtml(lib.excepcion_descripcion || '')}</span>
            </div>` : ''}
          ${lib.status === 'anulado' ? `
            <div style="grid-column:1/-1;background:#fee2e2;padding:10px;border-radius:6px">
              <strong>Anulada:</strong> ${fa}<br>
              ${lib.anulador_nombre ? `<span class="muted" style="font-size:12px">por ${escapeHtml(lib.anulador_nombre)}</span><br>` : ''}
              <span style="font-size:13px">${escapeHtml(lib.motivo_anulacion || '—')}</span>
            </div>` : ''}
        </div>

        ${buildComparativoHtml(lib)}

        <h3 style="margin-top:20px;margin-bottom:8px;font-size:14px">COAs emitidos a partir de esta liberación</h3>
        <table>
          <thead><tr><th>Folio</th><th>Idioma</th><th>Estado</th><th>Emitido</th></tr></thead>
          <tbody>${coasHtml}</tbody>
        </table>

        <div style="margin-top:20px;display:flex;gap:8px;justify-content:flex-end">
          <button class="btn ghost" id="revalidarBtn">Revalidar estado</button>
          ${lib.status === 'activo'
            ? `<button class="btn primary" id="emitirCoaUnoBtn">Emitir COA con esta liberación</button>`
            : ''}
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    overlay.querySelector('#closeDetalleBtn').addEventListener('click', () => overlay.remove());
    const emitir = overlay.querySelector('#emitirCoaUnoBtn');
    if (emitir) {
      emitir.addEventListener('click', () => {
        window.location.href = `/modules/lab/lab-coa-emitir.html?liberacion_ids=${encodeURIComponent(lib.liberacion_id)}`;
      });
    }
    const revalidarBtn = overlay.querySelector('#revalidarBtn');
    if (revalidarBtn) {
      revalidarBtn.addEventListener('click', async () => {
        revalidarBtn.disabled = true;
        try {
          const res = await KoguApi.apiFetch(`${BASE}/liberaciones/${lib.liberacion_id}/revalidar`, { method: 'POST' });
          const r = KoguApi.unwrapData(res);
          KoguApi.toast(`Estado de validación recalculado: ${r?.validacion_status || '—'}`, 'success');
          overlay.remove();
          load();
        } catch (err) {
          revalidarBtn.disabled = false;
          KoguApi.toast(err.message, 'error');
        }
      });
    }
  }

  // ── Emitir COA con selección (tab Activas) ──────────────
  function emitirCoaConSeleccion() {
    if (!selectedLib.size) return;
    const ids = Array.from(selectedLib).join(',');
    window.location.href = `/modules/lab/lab-coa-emitir.html?liberacion_ids=${encodeURIComponent(ids)}`;
  }

  // ── Wiring de controles globales ────────────────────────
  document.querySelectorAll('.lib-tab').forEach(btn => {
    btn.addEventListener('click', () => setActiveTab(btn.dataset.tab));
  });
  $('refreshBtn').addEventListener('click', () => load({ showToast: true }));
  $('nuevaLibBtn').addEventListener('click', abrirNuevaLiberacionModal);
  $('selClearBtn').addEventListener('click', () => {
    selectedLib.clear();
    document.querySelectorAll('input[data-pick]').forEach(cb => cb.checked = false);
    renderToolbarSeleccion();
  });
  $('selEmitirCoaBtn').addEventListener('click', emitirCoaConSeleccion);

  $('pgSize').value = String(pageSize);
  $('pgSize').addEventListener('change', e => {
    pageSize = parseInt(e.target.value, 10) || 25;
    persistState();
    load({ resetPage: true });
  });
  $('pgFirst').addEventListener('click', () => { if (currentPage > 1) { currentPage = 1; load(); } });
  $('pgPrev').addEventListener('click',  () => { if (currentPage > 1) { currentPage--;    load(); } });
  $('pgNext').addEventListener('click',  () => { if (currentPage < totalPages) { currentPage++; load(); } });
  $('pgLast').addEventListener('click',  () => { if (currentPage < totalPages) { currentPage = totalPages; load(); } });

  KoguShell.subscribeEmpresaActivaChange(() => {
    selectedLib.clear();
    load({ showToast: true, resetPage: true });
  });

  // ── Helpers ─────────────────────────────────────────────
  function persistState() {
    try {
      sessionStorage.setItem(STATE_KEY, JSON.stringify({ tab: currentTab, pageSize }));
    } catch (_) { /* noop */ }
  }
  function $(id) { return document.getElementById(id); }
  function escapeHtml(s) { return String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m]); }
  function debounce(fn, ms) { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); }; }

  await loadClientes();
  setActiveTab(currentTab);
});

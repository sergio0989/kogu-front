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
      const d1  = $('desdeFil')?.value || '';
      const d2  = $('hastaFil')?.value || '';
      if (q)   params.set('q', q);
      if (cli) params.set('cliente_id', cli);
      if (cnd) params.set('condicion', cnd);
      if (coa) params.set('con_coa', coa);
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
      const colspan = currentTab === 'pendientes' ? 6 : 7;
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
    const checked = selectedLib.has(lib.liberacion_id) ? 'checked' : '';
    return `
      <tr>
        <td><input type="checkbox" data-pick="${lib.liberacion_id}" ${checked}/></td>
        <td>
          <strong>${escapeHtml(lib.numero_lote || '—')}</strong>
          <div class="muted" style="font-size:12px">${escapeHtml(lib.cve_prod || '')} — ${escapeHtml(lib.desc_prod || '')}</div>
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

  function filaHistorico(lib) {
    const st  = STATUS_LIB.find(s => s.code === lib.status) || { label: lib.status, color: '#64748b' };
    const fa  = lib.fecha_anulacion ? new Date(lib.fecha_anulacion).toLocaleString() : '—';
    return `
      <tr>
        <td>
          <strong>${escapeHtml(lib.numero_lote || '—')}</strong>
          <div class="muted" style="font-size:12px">${escapeHtml(lib.cve_prod || '')} — ${escapeHtml(lib.desc_prod || '')}</div>
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
        const res = await KoguApi.apiFetch(`${BASE}/liberaciones`, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        const lib = KoguApi.unwrapData(res);
        KoguApi.toast(`Liberación creada (${lib.cliente_nombre || ''})`, 'success');
        close();
        // Cambia al tab Activas y refresca
        if (currentTab !== 'activas') setActiveTab('activas');
        else                          await load();
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
        try {
          const res = await KoguApi.apiFetch(`${BASE}/liberaciones`, {
            method: 'POST',
            body: JSON.stringify({
              lote_id:    loteId,
              cliente_id: cli.cliente_id,
              condicion:  'normal',
            }),
          });
          const lib = KoguApi.unwrapData(res);
          KoguApi.toast(`Liberación creada (${lib.cliente_nombre || cli.nombre})`, 'success');
          await load();
        } catch (err) { KoguApi.toast(err.message, 'error'); }
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
      <div style="background:white;border-radius:8px;max-width:780px;width:100%;max-height:90vh;overflow:auto;padding:24px;box-shadow:0 25px 50px rgba(0,0,0,.3)">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px">
          <div>
            <div class="eyebrow">Liberación · ${escapeHtml(lib.numero_lote || '—')}</div>
            <h2 style="margin:6px 0 0 0">${escapeHtml(lib.cliente_nombre || '—')}</h2>
            <div class="muted" style="font-size:12px">${escapeHtml(lib.cliente_rfc || '')}</div>
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

        <h3 style="margin-top:20px;margin-bottom:8px;font-size:14px">COAs emitidos a partir de esta liberación</h3>
        <table>
          <thead><tr><th>Folio</th><th>Idioma</th><th>Estado</th><th>Emitido</th></tr></thead>
          <tbody>${coasHtml}</tbody>
        </table>

        ${lib.status === 'activo' ? `
          <div style="margin-top:20px;display:flex;gap:8px;justify-content:flex-end">
            <button class="btn primary" id="emitirCoaUnoBtn">Emitir COA con esta liberación</button>
          </div>` : ''}
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

// ============================================================
// lab-imp-compras.js
// Bandeja de Inspección de Compras — selección QA con 4 tabs.
// Tabs: Pendientes (default) · Seleccionadas · Descartadas · Procesadas
// Acciones: seleccionar/descartar/restaurar (single + bulk).
// Modal de importación Excel (POST /protected/lab/compras/imports).
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/lab/lab-imp-compras.html';
  const PERM = 'screen.lab.inspeccion_compras';
  const BASE = '/protected/lab';

  const TABS = [
    { code: 'pendiente',    label: 'Pendientes',   color: '#f59e0b' },
    { code: 'seleccionada', label: 'Seleccionadas',color: '#3b82f6' },
    { code: 'descartada',   label: 'Descartadas',  color: '#94a3b8' },
    { code: 'procesada',    label: 'Procesadas',   color: '#16a34a' },
  ];

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Inspección de Compras',
    description: 'Bandeja de compras importadas del ERP. Selecciona las que requieren inspección QA.',
    requiredPermission: PERM,
  });
  if (!b) return;

  // ── Estado ──────────────────────────────────────
  let rows = [];
  let counts = { pendiente: 0, seleccionada: 0, descartada: 0, procesada: 0 };
  let currentTab = 'pendiente';
  let currentPage = 1, pageSize = 25, totalPages = 1, totalRows = 0;
  const selected = new Set();

  // Catálogos
  let proveedores = [];
  async function loadProveedores() {
    try {
      const res = await KoguApi.apiFetch('/protected/core/proveedores');
      proveedores = KoguApi.unwrapRows(res) || [];
    } catch (_) { proveedores = []; }
  }

  const $ = (id) => document.getElementById(id);

  // ── Layout ──────────────────────────────────────
  const c = document.getElementById('pageContent');
  c.innerHTML = `
<div class="card">
  <div class="row">
    <div>
      <div class="eyebrow">Lab QA</div>
      <h2>Inspección de Compras</h2>
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn ghost"   id="refreshBtn">Actualizar</button>
      <button class="btn ghost"   id="historyBtn">Historial imports</button>
      <button class="btn primary" id="importBtn">📥 Importar Excel</button>
    </div>
  </div>

  <!-- Tabs -->
  <div id="tabsBar" style="display:flex;gap:4px;margin-top:14px;border-bottom:2px solid var(--line)"></div>

  <!-- Filtros -->
  <div class="grid-2" style="margin-top:14px;gap:10px">
    <input class="input" id="qFil" placeholder="Buscar por cve, lote, factura, producto, proveedor…"/>
    <div style="display:flex;gap:6px;align-items:center">
      <input class="input" id="provLabel" readonly placeholder="— Cualquier proveedor —"
             style="flex:1;cursor:pointer;background:#f8fafc"/>
      <button type="button" class="btn ghost" id="provPickBtn">Proveedor…</button>
      <button type="button" class="btn ghost" id="provClearBtn" title="Limpiar">×</button>
    </div>
    <input type="hidden" id="provIdFil"/>
    <select class="select" id="matchFil">
      <option value="">Mapeo: cualquiera</option>
      <option value="proveedor">Sin match proveedor</option>
      <option value="producto">Sin match producto</option>
      <option value="cualquiera">Sin match (cualquiera)</option>
    </select>
    <div style="display:flex;gap:6px">
      <input class="input" type="date" id="desdeFil" title="Recepción desde"/>
      <input class="input" type="date" id="hastaFil" title="Recepción hasta"/>
    </div>
  </div>

  <!-- Toolbar de selección -->
  <div id="selToolbar" style="display:none;margin-top:14px;padding:10px 14px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
    <span id="selCountText" style="font-size:13px;color:#1e40af"></span>
    <div style="display:flex;gap:6px">
      <button class="btn primary" id="bulkSelectBtn"     style="background:#16a34a">✓ Seleccionar todas</button>
      <button class="btn ghost danger" id="bulkDescartarBtn">Descartar todas</button>
      <button class="btn ghost"  id="bulkRestaurarBtn">↺ Restaurar a pendiente</button>
      <button class="btn ghost"  id="selClearBtn">Limpiar</button>
    </div>
  </div>

  <!-- Tabla -->
  <div class="table-wrap" style="margin-top:14px">
    <table>
      <thead><tr>
        <th style="width:32px"><input type="checkbox" id="selAll" title="Seleccionar todo en esta página"/></th>
        <th>Recepción</th>
        <th>Proveedor</th>
        <th>Producto</th>
        <th>Lote</th>
        <th>Cantidad</th>
        <th>Clasificación</th>
        <th>Selección QA</th>
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
        <option value="10">10</option><option value="25" selected>25</option>
        <option value="50">50</option><option value="100">100</option>
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

  // ── Render de tabs con contadores ───────────────
  function renderTabs() {
    const bar = $('tabsBar');
    bar.innerHTML = TABS.map(t => `
      <button class="lab-tab" data-tab="${t.code}"
              style="background:transparent;border:none;cursor:pointer;padding:10px 18px;font-size:14px;
                     border-bottom:3px solid ${t.code === currentTab ? '#0f172a' : 'transparent'};
                     color:${t.code === currentTab ? '#0f172a' : '#64748b'};
                     font-weight:${t.code === currentTab ? '600' : '400'}">
        ${t.label}
        <span class="chip" style="background:${t.color}22;color:${t.color};margin-left:6px;font-size:11px">${counts[t.code] || 0}</span>
      </button>
    `).join('');
    bar.querySelectorAll('.lab-tab').forEach(btn => btn.addEventListener('click', () => setTab(btn.dataset.tab)));
  }

  function setTab(tab) {
    currentTab = tab;
    currentPage = 1;
    selected.clear();
    renderTabs();
    load();
  }

  // ── Pickers ─────────────────────────────────────
  function abrirPickerProveedor({ onSelect }) {
    KoguUi.openSearchPicker({
      title: 'Selecciona el proveedor',
      items: proveedores,
      placeholder: 'Buscar por nombre, RFC o cve_prov…',
      columns: [
        { key: 'nombre',   label: 'Nombre',   primary: true },
        { key: 'rfc',      label: 'RFC' },
        { key: 'cve_prov', label: 'cve_prov' },
      ],
      emptyText: 'Sin proveedores en esta empresa.',
      onSelect,
    });
  }

  // ── Cargar contadores + lista ───────────────────
  async function loadContadores() {
    try {
      const res = await KoguApi.apiFetch(`${BASE}/imp-compras/contadores`);
      counts = KoguApi.unwrapData(res) || counts;
      renderTabs();
    } catch (_) { /* silencioso */ }
  }

  async function load({ showToast = false, resetPage = false } = {}) {
    if (resetPage) currentPage = 1;
    const params = new URLSearchParams();
    params.set('page', String(currentPage));
    params.set('pageSize', String(pageSize));
    params.set('seleccion_qa', currentTab);
    const q     = $('qFil').value.trim();
    const prov  = $('provIdFil').value;
    const match = $('matchFil').value;
    const d1    = $('desdeFil').value;
    const d2    = $('hastaFil').value;
    if (q)     params.set('q', q);
    if (prov)  params.set('proveedor_id', prov);
    if (match) params.set('sin_match', match);
    if (d1)    params.set('fecha_desde', d1);
    if (d2)    params.set('fecha_hasta', d2);

    try {
      const res = await KoguApi.apiFetch(`${BASE}/imp-compras?${params.toString()}`);
      rows = KoguApi.unwrapData(res) || [];
      const meta = res?.meta || {};
      totalRows   = parseInt(meta.total ?? rows.length, 10) || 0;
      pageSize    = parseInt(meta.pageSize ?? pageSize, 10) || pageSize;
      currentPage = parseInt(meta.page ?? currentPage, 10) || 1;
      totalPages  = parseInt(meta.totalPages ?? 1, 10) || 1;
      renderRows();
      renderPag();
      renderToolbarSeleccion();
      loadContadores();   // refresh badges (no bloquear)
      if (showToast) KoguApi.toast('Bandeja actualizada', 'success');
    } catch (err) { KoguApi.toast(err.message, 'error'); }
  }

  // ── Render de filas ─────────────────────────────
  function renderRows() {
    const tbody = $('rows');
    if (!rows.length) {
      const empty = currentTab === 'pendiente'
        ? 'No hay compras pendientes con los filtros actuales. Importa un Excel para empezar o revisa los otros tabs.'
        : currentTab === 'seleccionada'
          ? 'No hay compras seleccionadas para inspección.'
          : currentTab === 'descartada'
            ? 'No hay compras descartadas con los filtros actuales.'
            : 'No hay compras procesadas (con reporte emitido).';
      tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:28px;color:var(--muted)">${empty}</td></tr>`;
      return;
    }
    tbody.innerHTML = rows.map(filaCompra).join('');
    tbody.querySelectorAll('input[data-pick]').forEach(cb => cb.addEventListener('change', e => togglePick(e.target.dataset.pick, e.target.checked)));
    tbody.querySelectorAll('button[data-detalle]').forEach(btn => btn.addEventListener('click', () => abrirDetalle(btn.dataset.detalle)));
    tbody.querySelectorAll('button[data-seleccionar]').forEach(btn => btn.addEventListener('click', () => seleccionarSingle(btn.dataset.seleccionar)));
    tbody.querySelectorAll('button[data-descartar]').forEach(btn => btn.addEventListener('click', () => descartarSingle(btn.dataset.descartar)));
    tbody.querySelectorAll('button[data-restaurar]').forEach(btn => btn.addEventListener('click', () => restaurarSingle(btn.dataset.restaurar)));
    tbody.querySelectorAll('button[data-crear-reporte]').forEach(btn => btn.addEventListener('click', () => crearReporte(btn.dataset.crearReporte)));

    // Sel-all checkbox de la página
    const selAll = $('selAll');
    if (selAll) {
      selAll.checked = rows.every(r => selected.has(r.imp_compra_id));
      selAll.onchange = () => {
        rows.forEach(r => togglePick(r.imp_compra_id, selAll.checked));
        tbody.querySelectorAll('input[data-pick]').forEach(cb => { cb.checked = selected.has(cb.dataset.pick); });
      };
    }
  }

  function filaCompra(c) {
    const fecha = fmtDate(c.fecha_recepcion);
    const cant  = c.cantidad != null
      ? `${parseFloat(c.cantidad).toLocaleString()} ${escapeHtml(c.unidad || '')}`
      : '—';
    const provBadge = c.tiene_match_proveedor
      ? escapeHtml(c.proveedor_nombre || c.cve_prov)
      : `<span class="muted">${escapeHtml(c.cve_prov)}</span>
         <span class="chip" style="background:#fef3c7;color:#92400e;font-size:10px;margin-left:4px">⚠ sin match</span>`;
    const prodBadge = c.tiene_match_producto
      ? `<strong>${escapeHtml(c.cve_prod)}</strong>
         <div class="muted" style="font-size:11px">${escapeHtml(truncar(c.producto_nombre || '', 40))}</div>`
      : `<strong class="muted">${escapeHtml(c.cve_prod)}</strong>
         <span class="chip" style="background:#fef3c7;color:#92400e;font-size:10px;margin-left:4px">⚠ sin match</span>`;
    const clasif = c.clasificacion_origen
      ? `<span class="chip" style="background:${c.requiere_inspeccion ? '#dcfce7' : '#f1f5f9'};color:${c.requiere_inspeccion ? '#166534' : '#64748b'};font-size:11px">${escapeHtml(c.clasificacion_origen)}</span>`
      : '<span class="muted">—</span>';
    const tab = TABS.find(t => t.code === c.seleccion_qa) || { label: c.seleccion_qa, color: '#64748b' };
    let stChip = `<span class="chip" style="background:${tab.color}22;color:${tab.color}">${tab.label}</span>`;
    let stExtra = c.seleccion_qa === 'descartada' && c.motivo_descarte
      ? `<div class="muted" style="font-size:11px;margin-top:2px" title="${escapeHtml(c.motivo_descarte)}">${escapeHtml(truncar(c.motivo_descarte, 40))}</div>`
      : '';

    // En tab Procesadas, reemplazamos el chip por la decisión real del reporte
    // y agregamos el folio RI + chip NC si aplica.
    if (c.seleccion_qa === 'procesada' && c.reporte_decision) {
      const decColors = {
        borrador:                 { label: 'Borrador',           color: '#94a3b8' },
        emitido:                  { label: 'Emitido',            color: '#3b82f6' },
        aceptado:                 { label: '✓ Aceptado',         color: '#16a34a' },
        aceptado_con_observacion: { label: '⚠ Aceptado c/obs',   color: '#f59e0b' },
        rechazado:                { label: '✗ Rechazado',        color: '#dc2626' },
      };
      const d = decColors[c.reporte_decision] || { label: c.reporte_decision, color: '#64748b' };
      stChip = `<span class="chip" style="background:${d.color}22;color:${d.color}">${d.label}</span>`;
      const partes = [];
      if (c.reporte_folio) {
        partes.push(`<a href="/modules/lab/lab-reporte-inspeccion-detalle.html?id=${c.reporte_id}"
                       style="font-family:monospace;font-size:11px;text-decoration:none;color:#475569">${escapeHtml(c.reporte_folio)}</a>`);
      }
      if (c.nc_folio_reporte) {
        partes.push(`<a href="/modules/lab/lab-nc-detalle.html?id=${c.nc_id_reporte}"
                       class="chip"
                       style="background:#fee2e2;color:#991b1b;font-size:10px;text-decoration:none">⚠ ${escapeHtml(c.nc_folio_reporte)}</a>`);
      }
      stExtra = partes.length
        ? `<div style="margin-top:4px;display:flex;flex-direction:column;gap:2px">${partes.join('')}</div>`
        : '';
    } else if (c.seleccion_qa === 'procesada' && !c.reporte_decision) {
      // Procesada pero sin reporte aún (caso raro de datos previos)
      stExtra = '<div class="muted" style="font-size:11px;margin-top:2px">sin reporte</div>';
    }

    let actions = '';
    if (c.seleccion_qa === 'pendiente') {
      actions = `
        <button class="btn primary" data-seleccionar="${c.imp_compra_id}" style="background:#16a34a">✓ Seleccionar</button>
        <button class="btn ghost danger" data-descartar="${c.imp_compra_id}">Descartar</button>`;
    } else if (c.seleccion_qa === 'seleccionada') {
      actions = `
        <button class="btn primary" data-crear-reporte="${c.imp_compra_id}" style="background:#3b82f6">+ Reporte</button>
        <button class="btn ghost danger" data-descartar="${c.imp_compra_id}">Descartar</button>
        <button class="btn ghost"  data-restaurar="${c.imp_compra_id}">↺ Restaurar</button>`;
    } else if (c.seleccion_qa === 'descartada') {
      actions = `<button class="btn ghost"  data-restaurar="${c.imp_compra_id}">↺ Restaurar</button>`;
    } else if (c.seleccion_qa === 'procesada') {
      const btns = [];
      if (c.reporte_id) {
        btns.push(`<a class="btn primary" href="/modules/lab/lab-reporte-inspeccion-detalle.html?id=${c.reporte_id}" style="background:#3b82f6">Reporte</a>`);
      }
      if (c.lote_id) {
        btns.push(`<a class="btn ghost" href="/modules/lab/lab-lote-detalle.html?id=${c.lote_id}">Ver lote</a>`);
      }
      actions = btns.length ? btns.join(' ') : `<span class="muted" style="font-size:11px">procesada</span>`;
    }

    const checked = selected.has(c.imp_compra_id) ? 'checked' : '';
    const checkable = c.seleccion_qa !== 'procesada';

    return `
      <tr>
        <td>${checkable ? `<input type="checkbox" data-pick="${c.imp_compra_id}" ${checked}/>` : ''}</td>
        <td style="font-size:12px">${fecha}
          ${c.folio_factura_proveedor ? `<div class="muted" style="font-size:11px">F: ${escapeHtml(c.folio_factura_proveedor)}</div>` : ''}
        </td>
        <td>${provBadge}</td>
        <td>${prodBadge}</td>
        <td><strong style="font-family:monospace">${escapeHtml(c.numero_lote)}</strong></td>
        <td style="font-size:13px">${cant}</td>
        <td>${clasif}</td>
        <td>${stChip}${stExtra}</td>
        <td style="text-align:right;white-space:nowrap">
          <button class="btn ghost" data-detalle="${c.imp_compra_id}">Detalle</button>
          ${actions}
        </td>
      </tr>`;
  }

  // ── Selección bulk ──────────────────────────────
  function togglePick(id, checked) {
    if (checked) selected.add(id);
    else         selected.delete(id);
    renderToolbarSeleccion();
  }

  function renderToolbarSeleccion() {
    const bar = $('selToolbar');
    if (!bar) return;
    if (selected.size === 0) { bar.style.display = 'none'; return; }
    bar.style.display = 'flex';
    $('selCountText').textContent = `${selected.size} compra${selected.size === 1 ? '' : 's'} seleccionada${selected.size === 1 ? '' : 's'}`;
    // Habilitar/deshabilitar botones según tab actual
    $('bulkSelectBtn').style.display    = (currentTab === 'pendiente' || currentTab === 'descartada') ? '' : 'none';
    $('bulkDescartarBtn').style.display = (currentTab === 'pendiente' || currentTab === 'seleccionada') ? '' : 'none';
    $('bulkRestaurarBtn').style.display = (currentTab === 'seleccionada' || currentTab === 'descartada') ? '' : 'none';
  }

  async function bulkAction(accion, motivo = null) {
    const ids = Array.from(selected);
    if (!ids.length) return;
    try {
      const body = { ids, accion };
      if (motivo) body.motivo = motivo;
      const res = await KoguApi.apiFetch(`${BASE}/imp-compras/bulk`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      const data = KoguApi.unwrapData(res);
      KoguApi.toast(`${data.afectadas} afectadas · ${data.ignoradas} ignoradas`, 'success');
      selected.clear();
      await load();
    } catch (err) {
      KoguApi.toast(err.message, 'error');
    }
  }

  // ── Acciones single ─────────────────────────────
  async function seleccionarSingle(id) {
    try {
      await KoguApi.apiFetch(`${BASE}/imp-compras/${id}/seleccionar`, {
        method: 'POST', body: JSON.stringify({}),
      });
      KoguApi.toast('Compra seleccionada', 'success');
      await load();
    } catch (err) { KoguApi.toast(err.message, 'error'); }
  }

  async function descartarSingle(id) {
    const motivo = prompt('Motivo del descarte (obligatorio):');
    if (motivo == null) return;
    if (!motivo.trim()) return KoguApi.toast('Motivo requerido.', 'error');
    try {
      await KoguApi.apiFetch(`${BASE}/imp-compras/${id}/descartar`, {
        method: 'POST',
        body: JSON.stringify({ motivo: motivo.trim() }),
      });
      KoguApi.toast('Compra descartada', 'success');
      await load();
    } catch (err) { KoguApi.toast(err.message, 'error'); }
  }

  async function restaurarSingle(id) {
    if (!confirm('¿Restaurar esta compra a estado "Pendiente"? Se perderá el motivo de descarte si existía.')) return;
    try {
      await KoguApi.apiFetch(`${BASE}/imp-compras/${id}/restaurar`, {
        method: 'POST', body: JSON.stringify({}),
      });
      KoguApi.toast('Compra restaurada', 'success');
      await load();
    } catch (err) { KoguApi.toast(err.message, 'error'); }
  }

  // Crea reporte de inspección desde una imp_compra seleccionada
  // y redirige al detalle del reporte para captura de parámetros.
  async function crearReporte(impCompraId) {
    try {
      const res = await KoguApi.apiFetch(
        `${BASE}/imp-compras/${impCompraId}/reporte-inspeccion`,
        { method: 'POST', body: JSON.stringify({}) },
      );
      const reporte = KoguApi.unwrapData(res);
      KoguApi.toast(`Reporte ${reporte.folio_reporte} creado`, 'success');
      window.location.href =
        `/modules/lab/lab-reporte-inspeccion-detalle.html?id=${reporte.reporte_inspeccion_id}`;
    } catch (err) {
      KoguApi.toast(err.message, 'error');
    }
  }

  // ── Detalle (modal con datos completos + raw_json) ──
  async function abrirDetalle(id) {
    try {
      const res = await KoguApi.apiFetch(`${BASE}/imp-compras/${id}`);
      mostrarModalDetalle(KoguApi.unwrapData(res));
    } catch (err) { KoguApi.toast(err.message, 'error'); }
  }

  function mostrarModalDetalle(c) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;overflow:auto';
    const tab = TABS.find(t => t.code === c.seleccion_qa) || { label: c.seleccion_qa, color: '#64748b' };
    const rawPretty = c.raw_json ? JSON.stringify(c.raw_json, null, 2) : '(sin raw_json)';
    overlay.innerHTML = `
      <div style="background:white;border-radius:8px;max-width:780px;width:100%;max-height:92vh;overflow:auto;padding:24px;box-shadow:0 25px 50px rgba(0,0,0,.3)">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px">
          <div>
            <div class="eyebrow">Lab QA · Compra importada</div>
            <h2 style="margin:6px 0 0 0">Lote ${escapeHtml(c.numero_lote)}</h2>
            <span class="chip" style="background:${tab.color}22;color:${tab.color};font-size:12px;display:inline-block;margin-top:6px">${tab.label}</span>
            ${c.requiere_inspeccion ? '<span class="chip" style="background:#dcfce7;color:#166534;font-size:11px;margin-left:4px">Requiere inspección</span>' : '<span class="chip" style="background:#f1f5f9;color:#64748b;font-size:11px;margin-left:4px">No requiere inspección</span>'}
          </div>
          <button class="btn ghost" id="closeBtn">×</button>
        </div>

        <div class="grid-2" style="gap:10px;font-size:13px">
          <div><strong>Recepción:</strong> ${fmtDate(c.fecha_recepcion)}</div>
          <div><strong>Importación:</strong> ${escapeHtml(c.importacion_archivo || '—')}<br><span class="muted" style="font-size:11px">${c.importacion_fecha ? new Date(c.importacion_fecha).toLocaleString() : ''}</span></div>
          <div><strong>Proveedor:</strong> ${escapeHtml(c.proveedor_nombre || c.cve_prov)}<br><span class="muted" style="font-size:11px">${escapeHtml(c.cve_prov)} ${c.proveedor_rfc ? '· ' + escapeHtml(c.proveedor_rfc) : ''}</span></div>
          <div><strong>Producto:</strong> ${escapeHtml(c.producto_nombre || c.cve_prod)}<br><span class="muted" style="font-size:11px">${escapeHtml(c.cve_prod)}</span></div>
          <div><strong>Cantidad:</strong> ${c.cantidad != null ? parseFloat(c.cantidad).toLocaleString() : '—'} ${escapeHtml(c.unidad || '')}</div>
          <div><strong>Folio factura:</strong> ${escapeHtml(c.folio_factura_proveedor || '—')}</div>
          <div><strong>Clasificación origen:</strong> ${escapeHtml(c.clasificacion_origen || '—')}</div>
          <div><strong>Mapeo:</strong>
            ${c.tiene_match_proveedor ? '✓ proveedor' : '⚠ sin proveedor'} ·
            ${c.tiene_match_producto ? '✓ producto' : '⚠ sin producto'}
          </div>
          ${c.lote_id ? `<div style="grid-column:1/-1"><strong>Lote QA generado:</strong> ${escapeHtml(c.lote_numero || c.lote_id)}</div>` : ''}
          ${c.motivo_descarte ? `<div style="grid-column:1/-1;padding:10px;background:#fef3c7;border-radius:6px"><strong>Motivo de descarte:</strong> ${escapeHtml(c.motivo_descarte)}<div class="muted" style="font-size:11px;margin-top:4px">por ${escapeHtml(c.seleccionada_por_nombre || '—')}</div></div>` : ''}
        </div>

        <details style="margin-top:14px;border:1px solid var(--line);border-radius:6px;padding:10px">
          <summary style="cursor:pointer;font-size:13px;font-weight:600">Raw JSON del Excel (auditoría)</summary>
          <pre style="margin-top:10px;padding:10px;background:#f1f5f9;border-radius:4px;font-size:11px;max-height:300px;overflow:auto">${escapeHtml(rawPretty)}</pre>
        </details>
      </div>
    `;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    overlay.querySelector('#closeBtn').addEventListener('click', close);
  }

  // ── Modal de importación ────────────────────────
  function abrirModalImport() {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;overflow:auto';
    overlay.innerHTML = `
      <div style="background:white;border-radius:8px;max-width:540px;width:100%;padding:24px;box-shadow:0 25px 50px rgba(0,0,0,.3)">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px">
          <div>
            <div class="eyebrow">Lab QA</div>
            <h2 style="margin:6px 0 0 0">Importar Excel de compras</h2>
            <div class="muted" style="font-size:12px;margin-top:6px">
              Sube el reporte ALPHA ERP. El sistema detecta automáticamente
              MATERIA PRIMA vs SERVICIOS y descarta los que no requieren inspección.
              Re-importar el mismo archivo es seguro: actualiza datos físicos y
              <strong>preserva</strong> selecciones previas.
            </div>
          </div>
          <button class="btn ghost" id="closeBtn">×</button>
        </div>
        <div style="margin-top:16px">
          <input type="file" id="archivoInput" accept=".xlsx,.xls" style="font-size:13px"/>
          <div class="muted" style="font-size:11px;margin-top:6px">Formatos: .xlsx, .xls. Máximo 50 MB.</div>
        </div>
        <div id="importProgress" style="display:none;margin-top:16px;padding:12px;background:#eff6ff;border-radius:6px;font-size:13px;color:#1e40af">
          ⏳ Procesando archivo… esto puede tardar varios segundos según el volumen.
        </div>
        <div id="importResult" style="display:none;margin-top:16px;padding:12px;border-radius:6px;font-size:13px"></div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:20px">
          <button class="btn ghost"   id="cancelBtn">Cancelar</button>
          <button class="btn primary" id="uploadBtn">Importar</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const oQ = s => overlay.querySelector(s);
    const close = () => overlay.remove();
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    oQ('#closeBtn').addEventListener('click', close);
    oQ('#cancelBtn').addEventListener('click', close);

    oQ('#uploadBtn').addEventListener('click', async () => {
      const f = oQ('#archivoInput').files?.[0];
      if (!f) return KoguApi.toast('Selecciona un archivo Excel.', 'error');
      if (!f.name.match(/\.(xlsx|xls)$/i)) return KoguApi.toast('Solo .xlsx o .xls', 'error');
      if (typeof XLSX === 'undefined') return KoguApi.toast('SheetJS no cargado. Recarga la página.', 'error');

      oQ('#uploadBtn').disabled = true;
      oQ('#importProgress').style.display = 'block';
      oQ('#importProgress').textContent = '⏳ Leyendo archivo…';
      oQ('#importResult').style.display = 'none';
      try {
        // 1. Parsear Excel en el navegador con SheetJS (patrón ERP)
        const buffer = await f.arrayBuffer();
        const wb     = XLSX.read(buffer, { type: 'array', cellDates: true });
        const ws     = wb.Sheets[wb.SheetNames[0]];
        if (!ws) throw new Error('El archivo no contiene hojas.');
        // raw:true preserva tipos nativos (Date objects, numbers).
        // Con raw:false las fechas se convierten al formato Excel original
        // (ej. "m/d/yy" → "2/5/26") y el backend no las puede parsear.
        // Con raw:true, JSON.stringify convierte Date a ISO string,
        // que el backend sí entiende.
        const rawRows = XLSX.utils.sheet_to_json(ws, { defval: null, raw: true });
        if (!rawRows.length) throw new Error('El archivo no contiene filas.');

        // Normalizar keys: trim + toLowerCase (mismo patrón que ERP).
        // ALPHA ERP puede exportar con espacios o capitalización inconsistente;
        // esto garantiza que `cve_prov`, `cve_prod`, `lote`, `fech_revi`, etc.
        // matcheen lo que espera el backend.
        const normalized = rawRows.map(row => {
          const r = {};
          for (const [k, v] of Object.entries(row)) {
            r[String(k).trim().toLowerCase()] = v;
          }
          return r;
        });

        // Pre-filtrar en cliente: solo enviar filas con LOTE (físico inspeccionable).
        // Servicios, fletes, anticipos y similares no tienen lote y no aplican
        // al módulo Lab QA (Inspección de Compras). Esto reduce el JSON enviado
        // y elimina ~80% del ruido típico del reporte ALPHA.
        const filasOmitidasSinLote = normalized.length;
        const rows = normalized.filter(r => {
          const lote = r.lote;
          if (lote == null || lote === '') return false;
          const s = String(lote).trim();
          return s.length > 0;
        });
        const omitidas = filasOmitidasSinLote - rows.length;
        if (!rows.length) {
          throw new Error(`Todas las ${filasOmitidasSinLote} filas son sin lote (servicios/fletes). Nada que inspeccionar.`);
        }
        if (omitidas > 0) {
          oQ('#importProgress').textContent =
            `⏳ ${omitidas.toLocaleString()} filas omitidas sin lote (servicios). Enviando ${rows.length.toLocaleString()}…`;
        }

        // 2. SHA-256 del archivo (auditoría liviana sin guardar el binario)
        let sha256 = null;
        try {
          const digest = await crypto.subtle.digest('SHA-256', buffer);
          sha256 = Array.from(new Uint8Array(digest))
            .map(b => b.toString(16).padStart(2, '0')).join('');
        } catch (_) { /* opcional, no bloquear si crypto no está */ }

        oQ('#importProgress').textContent = `⏳ Enviando ${rows.length.toLocaleString()} filas…`;

        // 3. POST JSON al backend (mismo patrón que ERP)
        const json = await KoguApi.apiFetch(`${BASE}/compras/imports`, {
          method: 'POST',
          body: JSON.stringify({
            archivo_nombre: f.name,
            archivo_bytes:  f.size,
            archivo_sha256: sha256,
            rows,
          }),
        });
        const importacionId = json?.data?.importacion_id;
        if (!importacionId) throw new Error('No se obtuvo importacion_id del servidor.');

        // 4. Polling del estado en background
        oQ('#importProgress').textContent = '⏳ Procesando en background…';
        const imp = await pollImport(importacionId, oQ('#importProgress'));

        // 3. Mostrar resultado
        oQ('#importProgress').style.display = 'none';
        if (imp.estado === 'completada') {
          oQ('#importResult').style.cssText = 'display:block;margin-top:16px;padding:12px;border-radius:6px;font-size:13px;background:#dcfce7;color:#166534';
          oQ('#importResult').innerHTML = `
            <strong>✅ Import completado</strong><br>
            ${escapeHtml(imp.mensaje_resumen || '')}
          `;
          KoguApi.toast('Import completado', 'success');
        } else {
          oQ('#importResult').style.cssText = 'display:block;margin-top:16px;padding:12px;border-radius:6px;font-size:13px;background:#fee2e2;color:#991b1b';
          oQ('#importResult').textContent = '❌ ' + (imp.mensaje_resumen || 'Importación fallida.');
          KoguApi.toast('Import fallido', 'error');
        }
        currentPage = 1;
        await load();
        oQ('#uploadBtn').textContent = 'Cerrar';
        oQ('#uploadBtn').disabled = false;
        oQ('#uploadBtn').onclick = close;
      } catch (err) {
        oQ('#importProgress').style.display = 'none';
        oQ('#importResult').style.cssText = 'display:block;margin-top:16px;padding:12px;border-radius:6px;font-size:13px;background:#fee2e2;color:#991b1b';
        oQ('#importResult').textContent = '❌ ' + err.message;
        oQ('#uploadBtn').disabled = false;
      }
    });
  }

  // ── Polling de importación ──────────────────────
  // Backend procesa en background; vamos preguntando estado cada 2s.
  // Muestra avance en progressEl si lo recibe.
  async function pollImport(importacionId, progressEl = null) {
    const INTERVAL_MS = 2000;
    const MAX_TRIES   = 600;   // 600 × 2s = 20 minutos máximo
    for (let i = 0; i < MAX_TRIES; i++) {
      await new Promise(r => setTimeout(r, INTERVAL_MS));
      try {
        const res = await KoguApi.apiFetch(`${BASE}/compras/imports/${importacionId}`);
        const imp = KoguApi.unwrapData(res);
        if (!imp) continue;
        if (progressEl) {
          const leidas  = imp.filas_leidas  || 0;
          const validas = imp.filas_validas || 0;
          const errores = imp.filas_error   || 0;
          progressEl.textContent = `⏳ Procesando… ${leidas} leídas · ${validas} ok · ${errores} errores`;
        }
        if (imp.estado === 'completada' || imp.estado === 'fallida') {
          return imp;
        }
      } catch (e) {
        // Errores transitorios de red — seguimos intentando
        console.warn('poll error', e.message);
      }
    }
    throw new Error('Timeout esperando que termine la importación (>20 min).');
  }

  // ── Modal de historial de imports ───────────────
  async function abrirModalHistorial() {
    let imports = [];
    try {
      const res = await KoguApi.apiFetch(`${BASE}/compras/imports?pageSize=50`);
      imports = KoguApi.unwrapData(res) || [];
    } catch (err) { return KoguApi.toast(err.message, 'error'); }

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;overflow:auto';
    const filas = imports.length
      ? imports.map(i => `
        <tr>
          <td style="font-size:12px">${i.created_at ? new Date(i.created_at).toLocaleString() : '—'}</td>
          <td style="font-size:12px">${escapeHtml(i.archivo_nombre || '—')}</td>
          <td style="font-size:13px">${escapeHtml(i.importador_nombre || '—')}</td>
          <td style="text-align:center"><span class="chip" style="background:${i.estado==='completada'?'#dcfce7':i.estado==='fallida'?'#fee2e2':'#fef3c7'};color:${i.estado==='completada'?'#166534':i.estado==='fallida'?'#991b1b':'#92400e'};font-size:11px">${escapeHtml(i.estado)}</span></td>
          <td style="font-size:12px;text-align:right">${i.filas_leidas||0} leídas / ${i.filas_validas||0} ok / ${i.filas_error||0} err</td>
        </tr>`).join('')
      : '<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--muted)">Sin importaciones aún.</td></tr>';
    overlay.innerHTML = `
      <div style="background:white;border-radius:8px;max-width:780px;width:100%;max-height:80vh;overflow:auto;padding:24px;box-shadow:0 25px 50px rgba(0,0,0,.3)">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px">
          <div>
            <div class="eyebrow">Lab QA</div>
            <h2 style="margin:6px 0 0 0">Historial de importaciones</h2>
          </div>
          <button class="btn ghost" id="closeBtn">×</button>
        </div>
        <table style="width:100%">
          <thead><tr>
            <th>Fecha</th><th>Archivo</th><th>Usuario</th>
            <th style="text-align:center">Estado</th><th style="text-align:right">Filas</th>
          </tr></thead>
          <tbody>${filas}</tbody>
        </table>
      </div>
    `;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    overlay.querySelector('#closeBtn').addEventListener('click', close);
  }

  // ── Paginación ──────────────────────────────────
  function renderPag() {
    const inicio = totalRows === 0 ? 0 : (currentPage - 1) * pageSize + 1;
    const fin = Math.min(currentPage * pageSize, totalRows);
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
    if (from > 1) { nums.appendChild(makePgBtn(1)); if (from > 2) { const d=document.createElement('span'); d.textContent='…'; d.style.padding='0 6px'; nums.appendChild(d); } }
    for (let i = from; i <= to; i++) nums.appendChild(makePgBtn(i));
    if (to < totalPages) { if (to < totalPages - 1) { const d=document.createElement('span'); d.textContent='…'; d.style.padding='0 6px'; nums.appendChild(d); } nums.appendChild(makePgBtn(totalPages)); }
  }
  function makePgBtn(num) {
    const b = document.createElement('button');
    b.className = 'btn ghost';
    b.textContent = String(num);
    if (num === currentPage) { b.classList.add('primary'); b.classList.remove('ghost'); }
    b.addEventListener('click', () => { if (num !== currentPage) { currentPage = num; load(); } });
    return b;
  }

  // ── Listeners ───────────────────────────────────
  $('qFil').addEventListener('input', debounce(() => load({ resetPage: true }), 300));
  $('matchFil').addEventListener('change', () => load({ resetPage: true }));
  $('desdeFil').addEventListener('change', () => load({ resetPage: true }));
  $('hastaFil').addEventListener('change', () => load({ resetPage: true }));
  $('provPickBtn').addEventListener('click', () => abrirPickerProveedor({
    onSelect: (p) => {
      $('provIdFil').value = p.proveedor_id;
      $('provLabel').value = p.nombre + (p.cve_prov ? ' · ' + p.cve_prov : '');
      load({ resetPage: true });
    },
  }));
  $('provLabel').addEventListener('click', () => $('provPickBtn').click());
  $('provClearBtn').addEventListener('click', () => {
    $('provIdFil').value = '';
    $('provLabel').value = '';
    load({ resetPage: true });
  });
  $('refreshBtn').addEventListener('click', () => load({ showToast: true }));
  $('importBtn').addEventListener('click', abrirModalImport);
  $('historyBtn').addEventListener('click', abrirModalHistorial);
  $('pgSize').addEventListener('change', ev => { pageSize = parseInt(ev.target.value, 10) || 25; load({ resetPage: true }); });
  $('pgFirst').addEventListener('click', () => { if (currentPage > 1) { currentPage = 1; load(); } });
  $('pgPrev').addEventListener('click',  () => { if (currentPage > 1) { currentPage--;    load(); } });
  $('pgNext').addEventListener('click',  () => { if (currentPage < totalPages) { currentPage++; load(); } });
  $('pgLast').addEventListener('click',  () => { if (currentPage < totalPages) { currentPage = totalPages; load(); } });
  $('selClearBtn').addEventListener('click', () => { selected.clear(); renderRows(); renderToolbarSeleccion(); });
  $('bulkSelectBtn').addEventListener('click',    () => bulkAction('seleccionar'));
  $('bulkRestaurarBtn').addEventListener('click', () => bulkAction('restaurar'));
  $('bulkDescartarBtn').addEventListener('click', () => {
    const motivo = prompt('Motivo del descarte (aplicará a todas las seleccionadas):');
    if (motivo == null) return;
    if (!motivo.trim()) return KoguApi.toast('Motivo requerido.', 'error');
    bulkAction('descartar', motivo.trim());
  });

  KoguShell.subscribeEmpresaActivaChange(() => load({ showToast: true, resetPage: true }));

  // ── Helpers ─────────────────────────────────────
  function escapeHtml(s) { return String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m]); }
  function debounce(fn, ms) { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); }; }
  function truncar(s, n) { return s && s.length > n ? s.slice(0, n - 1) + '…' : s; }
  function fmtDate(v) {
    if (!v) return '—';
    const s = String(v);
    const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : s;
  }

  // ── Arranque ────────────────────────────────────
  renderTabs();
  await loadProveedores();
  await load();
});

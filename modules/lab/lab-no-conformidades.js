// ============================================================
// lab-no-conformidades.js
// Listado del módulo NC/CAPA: NCs con sus CAPAs anidadas.
// Drill-down a lab-nc-detalle.html?id=<nc_id>.
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/lab/lab-no-conformidades.html';
  const BASE = '/protected/lab/nc';
  const PERM = 'screen.lab.no_conformidades';

  const STATUS = [
    { code: 'abierta',     label: 'Abierta',      color: '#f59e0b' },
    { code: 'en_analisis', label: 'En análisis',  color: '#3b82f6' },
    { code: 'con_capa',    label: 'Con CAPA',     color: '#8b5cf6' },
    { code: 'cerrada',     label: 'Cerrada',      color: '#16a34a' },
    { code: 'anulada',     label: 'Anulada',      color: '#94a3b8' },
  ];
  const ORIGENES = [
    { code: 'resultado',         label: 'Resultado fuera spec' },
    { code: 'excepcion',         label: 'Excepción aprobada' },
    { code: 'rechazo',           label: 'Rechazo de lote' },
    { code: 'queja_cliente',     label: 'Queja de cliente' },
    { code: 'inspeccion_compra', label: 'Inspección de compra' },
    { code: 'auditoria',         label: 'Auditoría' },
  ];

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'No Conformidades',
    description: 'Registro y gestión de no conformidades del laboratorio con sus acciones correctivas y preventivas (CAPAs).',
    requiredPermission: PERM,
  });
  if (!b) return;

  // Catálogos
  let clientes = [], proveedores = [], usuarios = [];
  async function loadCatalogos() {
    try {
      const res = await KoguApi.apiFetch('/protected/core/clientes');
      clientes = KoguApi.unwrapRows(res) || [];
    } catch (_) { clientes = []; }
    // Proveedores y usuarios: opcionales (si los endpoints existen)
    try {
      const res = await KoguApi.apiFetch('/protected/core/proveedores');
      proveedores = KoguApi.unwrapRows(res) || [];
    } catch (_) { proveedores = []; }
    try {
      const res = await KoguApi.apiFetch('/protected/core/usuarios');
      usuarios = KoguApi.unwrapRows(res) || [];
    } catch (_) { usuarios = []; }
  }

  let rows = [];
  let currentPage = 1, pageSize = 25, totalPages = 1, totalRows = 0;
  const $ = (id) => document.getElementById(id);

  const c = document.getElementById('pageContent');
  c.innerHTML = `
<div class="card">
  <div class="row">
    <div>
      <div class="eyebrow">Lab QA</div>
      <h2>No Conformidades</h2>
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn ghost"   id="refreshBtn">Actualizar</button>
      <button class="btn primary" id="newNcBtn">+ Nueva NC</button>
    </div>
  </div>

  <div class="grid-2" style="margin-top:14px;gap:10px">
    <input class="input" id="qFil" placeholder="Buscar por folio, descripción, lote, producto, cliente o proveedor…"/>
    <select class="select" id="statusFil">
      <option value="" selected>Cualquier estado</option>
      <option value="abierta">Abiertas</option>
      <option value="en_analisis">En análisis</option>
      <option value="con_capa">Con CAPA</option>
      <option value="cerrada">Cerradas</option>
      <option value="anulada">Anuladas</option>
    </select>
    <select class="select" id="origenFil">
      <option value="" selected>Cualquier origen</option>
      ${ORIGENES.map(o => `<option value="${o.code}">${o.label}</option>`).join('')}
    </select>
    <div style="display:flex;gap:6px;align-items:center">
      <input class="input" id="cliLabel" readonly placeholder="— Cualquier cliente —"
             style="flex:1;cursor:pointer;background:#f8fafc"/>
      <button type="button" class="btn ghost" id="cliPickBtn">Cliente…</button>
      <button type="button" class="btn ghost" id="cliClearBtn" title="Limpiar">×</button>
    </div>
    <input type="hidden" id="cliIdFil"/>
    <div style="display:flex;gap:6px">
      <input class="input" type="date" id="desdeFil" title="Apertura desde"/>
      <input class="input" type="date" id="hastaFil" title="Apertura hasta"/>
    </div>
  </div>

  <div class="table-wrap" style="margin-top:14px">
    <table>
      <thead><tr>
        <th>Folio</th>
        <th>Origen</th>
        <th>Entidad afectada</th>
        <th>Responsable</th>
        <th>Apertura</th>
        <th>CAPAs</th>
        <th>Estado</th>
        <th style="text-align:right">Acciones</th>
      </tr></thead>
      <tbody id="rows"></tbody>
    </table>
  </div>

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
      emptyText: 'Sin clientes.',
      onSelect,
    });
  }
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
  function abrirPickerUsuario({ onSelect }) {
    KoguUi.openSearchPicker({
      title: 'Selecciona el responsable',
      items: usuarios,
      placeholder: 'Buscar por nombre o email…',
      columns: [
        { key: 'nombre', label: 'Nombre', primary: true },
        { key: 'email',  label: 'Email' },
      ],
      emptyText: 'Sin usuarios.',
      onSelect,
    });
  }

  async function load({ showToast = false, resetPage = false } = {}) {
    if (resetPage) currentPage = 1;
    const params = new URLSearchParams();
    params.set('page', String(currentPage));
    params.set('pageSize', String(pageSize));
    const q = $('qFil').value.trim();
    const status = $('statusFil').value;
    const origen = $('origenFil').value;
    const cliId  = $('cliIdFil').value;
    const desde  = $('desdeFil').value;
    const hasta  = $('hastaFil').value;
    if (q)      params.set('q', q);
    if (status) params.set('status', status);
    if (origen) params.set('origen', origen);
    if (cliId)  params.set('cliente_id', cliId);
    if (desde)  params.set('fecha_desde', desde);
    if (hasta)  params.set('fecha_hasta', hasta);
    try {
      const res = await KoguApi.apiFetch(`${BASE}?${params.toString()}`);
      rows = KoguApi.unwrapData(res) || [];
      const meta = res?.meta || {};
      totalRows = parseInt(meta.total ?? rows.length, 10) || 0;
      pageSize = parseInt(meta.pageSize ?? pageSize, 10) || pageSize;
      currentPage = parseInt(meta.page ?? currentPage, 10) || 1;
      totalPages = parseInt(meta.totalPages ?? 1, 10) || 1;
      renderRows();
      renderPag();
      if (showToast) KoguApi.toast('NCs actualizadas', 'success');
    } catch (err) { KoguApi.toast(err.message, 'error'); }
  }

  function renderRows() {
    const tbody = $('rows');
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--muted)">
        Sin NCs con los filtros actuales. Las NCs se crean manualmente con <strong>+ Nueva NC</strong>
        o se generan automáticamente al rechazar un lote o aprobar una excepción.
      </td></tr>`;
      return;
    }
    tbody.innerHTML = rows.map(n => {
      const st = STATUS.find(s => s.code === n.status) || { label: n.status, color: '#64748b' };
      const orig = ORIGENES.find(o => o.code === n.origen)?.label || n.origen;
      const entidad = entidadAfectada(n);
      const fecha = n.fecha_apertura ? new Date(n.fecha_apertura + 'T00:00:00').toLocaleDateString() : '—';
      const capas = n.capas_count > 0
        ? `<span class="chip" style="background:#e0f2fe;color:#075985">${n.capas_eficaces}/${n.capas_count}</span>`
        : '<span class="muted">—</span>';
      return `
        <tr>
          <td><strong style="font-family:monospace">${escapeHtml(n.folio_nc)}</strong></td>
          <td>${escapeHtml(orig)}</td>
          <td style="font-size:13px">${entidad}</td>
          <td style="font-size:13px">${escapeHtml(n.responsable_nombre || '—')}</td>
          <td style="font-size:12px">${fecha}
            ${n.fecha_compromiso ? `<div class="muted" style="font-size:11px">compr. ${escapeHtml(n.fecha_compromiso)}</div>` : ''}
          </td>
          <td>${capas}</td>
          <td><span class="chip" style="background:${st.color}22;color:${st.color}">${st.label}</span></td>
          <td style="text-align:right;white-space:nowrap">
            <button class="btn ghost" data-detalle="${n.nc_id}">Abrir</button>
          </td>
        </tr>`;
    }).join('');
    tbody.querySelectorAll('button[data-detalle]').forEach(b => b.addEventListener('click', () => {
      window.location.href = `/modules/lab/lab-nc-detalle.html?id=${b.dataset.detalle}`;
    }));
  }

  function entidadAfectada(n) {
    const parts = [];
    if (n.numero_lote) parts.push(`Lote ${escapeHtml(n.numero_lote)}`);
    if (n.cliente_nombre) parts.push(`Cliente: ${escapeHtml(truncar(n.cliente_nombre, 25))}`);
    if (n.proveedor_nombre) parts.push(`Prov: ${escapeHtml(truncar(n.proveedor_nombre, 25))}`);
    if (n.parametro_clave) parts.push(`Param ${escapeHtml(n.parametro_clave)}`);
    return parts.length ? parts.join('<br>') : '<span class="muted">—</span>';
  }

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

  // ── Modal: Nueva NC manual ────────────────────────────
  function abrirNuevaNcModal() {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;overflow:auto';
    overlay.innerHTML = `
      <div style="background:white;border-radius:8px;max-width:680px;width:100%;max-height:95vh;overflow:auto;padding:24px;box-shadow:0 25px 50px rgba(0,0,0,.3)">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px">
          <div>
            <div class="eyebrow">Lab QA</div>
            <h2 style="margin:6px 0 0 0">Nueva No Conformidad</h2>
            <div class="muted" style="font-size:12px;margin-top:6px">
              Las NCs por rechazo de lote y por excepción aprobada se generan automáticamente.
              Usa este formulario solo para quejas de cliente, inspecciones, auditorías o NCs ad-hoc.
            </div>
          </div>
          <button class="btn ghost" id="closeBtn">×</button>
        </div>

        <div class="grid-2" style="gap:10px">
          <div>
            <div class="label-text">Origen *</div>
            <select class="select" id="m_origen">
              <option value="">— Selecciona —</option>
              ${ORIGENES.map(o => `<option value="${o.code}">${o.label}</option>`).join('')}
            </select>
          </div>
          <div>
            <div class="label-text">Responsable (opcional)</div>
            <div style="display:flex;gap:6px">
              <input class="input" id="m_respLabel" readonly placeholder="— Sin responsable —"
                     style="flex:1;cursor:pointer;background:#f8fafc"/>
              <button type="button" class="btn ghost" id="m_respPickBtn">Buscar…</button>
              <button type="button" class="btn ghost" id="m_respClearBtn" title="Limpiar">×</button>
            </div>
            <input type="hidden" id="m_respId"/>
          </div>

          <!-- Entidad afectada según origen -->
          <div id="m_cliBlock" style="grid-column:1/-1;display:none">
            <div class="label-text">Cliente *</div>
            <div style="display:flex;gap:6px">
              <input class="input" id="m_cliLabel" readonly placeholder="— Selecciona —"
                     style="flex:1;cursor:pointer;background:#f8fafc"/>
              <button type="button" class="btn ghost" id="m_cliPickBtn">Buscar cliente…</button>
            </div>
            <input type="hidden" id="m_cliId"/>
          </div>

          <div id="m_provBlock" style="grid-column:1/-1;display:none">
            <div class="label-text">Proveedor *</div>
            <div style="display:flex;gap:6px">
              <input class="input" id="m_provLabel" readonly placeholder="— Selecciona —"
                     style="flex:1;cursor:pointer;background:#f8fafc"/>
              <button type="button" class="btn ghost" id="m_provPickBtn">Buscar proveedor…</button>
            </div>
            <input type="hidden" id="m_provId"/>
          </div>

          <div style="grid-column:1/-1">
            <div class="label-text">Descripción *</div>
            <textarea class="input" id="m_desc" rows="3" maxlength="2000" placeholder="Describe la no conformidad detectada…"></textarea>
          </div>

          <div style="grid-column:1/-1">
            <div class="label-text">Contención (acción inmediata)</div>
            <textarea class="input" id="m_cont" rows="2" maxlength="1000" placeholder="Acción inmediata para evitar uso/expedición…"></textarea>
          </div>

          <div>
            <div class="label-text">Fecha compromiso</div>
            <input class="input" type="date" id="m_compr"/>
          </div>
          <div>
            <div class="label-text">Observaciones</div>
            <input class="input" id="m_obs" maxlength="500"/>
          </div>
        </div>

        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:20px">
          <button class="btn ghost"   id="cancelBtn">Cancelar</button>
          <button class="btn primary" id="saveBtn">Crear NC</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const oQ = s => overlay.querySelector(s);
    const close = () => overlay.remove();
    overlay.addEventListener('click', ev => { if (ev.target === overlay) close(); });
    oQ('#closeBtn').addEventListener('click', close);
    oQ('#cancelBtn').addEventListener('click', close);

    // Mostrar/ocultar bloques según origen
    oQ('#m_origen').addEventListener('change', () => {
      const v = oQ('#m_origen').value;
      oQ('#m_cliBlock').style.display  = v === 'queja_cliente' ? 'block' : 'none';
      oQ('#m_provBlock').style.display = v === 'inspeccion_compra' ? 'block' : 'none';
    });

    // Pickers
    oQ('#m_respPickBtn').addEventListener('click', () => abrirPickerUsuario({
      onSelect: u => {
        oQ('#m_respId').value = u.user_id;
        oQ('#m_respLabel').value = u.nombre + (u.email ? ' — ' + u.email : '');
      },
    }));
    oQ('#m_respLabel').addEventListener('click', () => oQ('#m_respPickBtn').click());
    oQ('#m_respClearBtn').addEventListener('click', () => {
      oQ('#m_respId').value = '';
      oQ('#m_respLabel').value = '';
    });
    oQ('#m_cliPickBtn').addEventListener('click', () => abrirPickerCliente({
      onSelect: c => {
        oQ('#m_cliId').value = c.cliente_id;
        oQ('#m_cliLabel').value = c.nombre + (c.rfc ? ' — ' + c.rfc : '');
      },
    }));
    oQ('#m_cliLabel').addEventListener('click', () => oQ('#m_cliPickBtn').click());
    oQ('#m_provPickBtn').addEventListener('click', () => abrirPickerProveedor({
      onSelect: p => {
        oQ('#m_provId').value = p.proveedor_id;
        oQ('#m_provLabel').value = p.nombre + (p.rfc ? ' — ' + p.rfc : '');
      },
    }));
    oQ('#m_provLabel').addEventListener('click', () => oQ('#m_provPickBtn').click());

    oQ('#saveBtn').addEventListener('click', async () => {
      const body = {
        origen:              oQ('#m_origen').value,
        descripcion:         oQ('#m_desc').value.trim(),
        contencion:          oQ('#m_cont').value.trim() || null,
        responsable_user_id: oQ('#m_respId').value || null,
        cliente_id:          oQ('#m_cliId').value || null,
        proveedor_id:        oQ('#m_provId').value || null,
        fecha_compromiso:    oQ('#m_compr').value || null,
        observaciones:       oQ('#m_obs').value.trim() || null,
      };
      if (!body.origen) return KoguApi.toast('Selecciona el origen.', 'error');
      if (!body.descripcion) return KoguApi.toast('Describe la NC.', 'error');
      try {
        oQ('#saveBtn').disabled = true;
        const res = await KoguApi.apiFetch(BASE, { method: 'POST', body: JSON.stringify(body) });
        const nc = KoguApi.unwrapData(res);
        KoguApi.toast(`NC ${nc.folio_nc} creada`, 'success');
        close();
        window.location.href = `/modules/lab/lab-nc-detalle.html?id=${nc.nc_id}`;
      } catch (err) {
        oQ('#saveBtn').disabled = false;
        KoguApi.toast(err.message, 'error');
      }
    });
  }

  $('qFil').addEventListener('input', debounce(() => load({ resetPage: true }), 300));
  $('statusFil').addEventListener('change', () => load({ resetPage: true }));
  $('origenFil').addEventListener('change', () => load({ resetPage: true }));
  $('desdeFil').addEventListener('change', () => load({ resetPage: true }));
  $('hastaFil').addEventListener('change', () => load({ resetPage: true }));
  $('cliPickBtn').addEventListener('click', () => abrirPickerCliente({
    onSelect: c => {
      $('cliIdFil').value = c.cliente_id;
      $('cliLabel').value = c.nombre + (c.rfc ? ' — ' + c.rfc : '');
      load({ resetPage: true });
    },
  }));
  $('cliLabel').addEventListener('click', () => $('cliPickBtn').click());
  $('cliClearBtn').addEventListener('click', () => {
    $('cliIdFil').value = '';
    $('cliLabel').value = '';
    load({ resetPage: true });
  });
  $('refreshBtn').addEventListener('click', () => load({ showToast: true }));
  $('newNcBtn').addEventListener('click', abrirNuevaNcModal);
  $('pgSize').addEventListener('change', ev => { pageSize = parseInt(ev.target.value, 10) || 25; load({ resetPage: true }); });
  $('pgFirst').addEventListener('click', () => { if (currentPage > 1) { currentPage = 1; load(); } });
  $('pgPrev').addEventListener('click',  () => { if (currentPage > 1) { currentPage--;    load(); } });
  $('pgNext').addEventListener('click',  () => { if (currentPage < totalPages) { currentPage++; load(); } });
  $('pgLast').addEventListener('click',  () => { if (currentPage < totalPages) { currentPage = totalPages; load(); } });
  KoguShell.subscribeEmpresaActivaChange(() => load({ showToast: true, resetPage: true }));

  function escapeHtml(s) { return String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m]); }
  function debounce(fn, ms) { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); }; }
  function truncar(s, n) { return s && s.length > n ? s.slice(0, n - 1) + '…' : s; }

  await loadCatalogos();
  await load();
});

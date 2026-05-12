// ============================================================
// lab-cert-proveedor.js
// Bandeja de Certificados de Calidad del Proveedor (CofA).
// Drill-down a lab-cert-proveedor-detalle.html?id=<cert_id>.
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/lab/lab-cert-proveedor.html';
  const PERM = 'screen.lab.inspeccion_compras';
  const BASE = '/protected/lab/cert-proveedor';

  const ESTADOS = [
    { code: 'pendiente',   label: 'Pendiente',   color: '#94a3b8' },
    { code: 'capturado',   label: 'Capturado',   color: '#3b82f6' },
    { code: 'discrepante', label: 'Discrepante', color: '#dc2626' },
    { code: 'validado',    label: 'Validado',    color: '#16a34a' },
  ];

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Certificados de Proveedor',
    description: 'Certificados de Calidad (CofA) que envían los proveedores con la mercancía recibida.',
    requiredPermission: PERM,
  });
  if (!b) return;

  // Catálogos
  let proveedores = [], productos = [];
  async function loadCatalogos() {
    try {
      const res = await KoguApi.apiFetch('/protected/core/proveedores');
      proveedores = KoguApi.unwrapRows(res) || [];
    } catch (_) { proveedores = []; }
    try {
      const res = await KoguApi.apiFetch('/protected/lab/maestros/productos');
      productos = KoguApi.unwrapData(res) || [];
    } catch (_) {
      // Fallback: si no existe el endpoint en maestros, intentar core
      try {
        const res = await KoguApi.apiFetch('/protected/core/productos');
        productos = KoguApi.unwrapRows(res) || [];
      } catch (_) { productos = []; }
    }
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
      <h2>Certificados de Proveedor (CofA)</h2>
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn ghost"   id="refreshBtn">Actualizar</button>
      <button class="btn primary" id="newCofaBtn">+ Nuevo CofA</button>
    </div>
  </div>

  <div class="grid-2" style="margin-top:14px;gap:10px">
    <input class="input" id="qFil" placeholder="Buscar por folio interno, folio proveedor, lote, producto…"/>
    <select class="select" id="estadoFil">
      <option value="" selected>Cualquier estado</option>
      ${ESTADOS.map(e => `<option value="${e.code}">${e.label}</option>`).join('')}
    </select>
    <div style="display:flex;gap:6px;align-items:center">
      <input class="input" id="provLabel" readonly placeholder="— Cualquier proveedor —"
             style="flex:1;cursor:pointer;background:#f8fafc"/>
      <button type="button" class="btn ghost" id="provPickBtn">Proveedor…</button>
      <button type="button" class="btn ghost" id="provClearBtn" title="Limpiar">×</button>
    </div>
    <input type="hidden" id="provIdFil"/>
    <div style="display:flex;gap:6px">
      <input class="input" type="date" id="desdeFil" title="Emisión desde"/>
      <input class="input" type="date" id="hastaFil" title="Emisión hasta"/>
    </div>
  </div>

  <div class="table-wrap" style="margin-top:14px">
    <table>
      <thead><tr>
        <th>Folio interno</th>
        <th>Folio proveedor</th>
        <th>Proveedor</th>
        <th>Producto</th>
        <th>Lote prov.</th>
        <th>Emisión</th>
        <th>Vigencia</th>
        <th>Parámetros</th>
        <th>Archivo</th>
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

  function abrirPickerProducto({ onSelect }) {
    KoguUi.openSearchPicker({
      title: 'Selecciona el producto',
      items: productos,
      placeholder: 'Buscar por cve_prod o descripción…',
      columns: [
        { key: 'cve_prod',  label: 'Clave',       primary: true },
        { key: 'desc_prod', label: 'Descripción' },
      ],
      emptyText: 'Sin productos en esta empresa.',
      onSelect,
    });
  }

  async function load({ showToast = false, resetPage = false } = {}) {
    if (resetPage) currentPage = 1;
    const params = new URLSearchParams();
    params.set('page', String(currentPage));
    params.set('pageSize', String(pageSize));
    const q     = $('qFil').value.trim();
    const est   = $('estadoFil').value;
    const prov  = $('provIdFil').value;
    const d1    = $('desdeFil').value;
    const d2    = $('hastaFil').value;
    if (q)    params.set('q', q);
    if (est)  params.set('estado_lectura', est);
    if (prov) params.set('proveedor_id', prov);
    if (d1)   params.set('fecha_desde', d1);
    if (d2)   params.set('fecha_hasta', d2);
    try {
      const res = await KoguApi.apiFetch(`${BASE}?${params.toString()}`);
      rows = KoguApi.unwrapData(res) || [];
      const meta = res?.meta || {};
      totalRows   = parseInt(meta.total ?? rows.length, 10) || 0;
      pageSize    = parseInt(meta.pageSize ?? pageSize, 10) || pageSize;
      currentPage = parseInt(meta.page ?? currentPage, 10) || 1;
      totalPages  = parseInt(meta.totalPages ?? 1, 10) || 1;
      renderRows();
      renderPag();
      if (showToast) KoguApi.toast('Bandeja actualizada', 'success');
    } catch (err) { KoguApi.toast(err.message, 'error'); }
  }

  function renderRows() {
    const tbody = $('rows');
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="11" style="text-align:center;padding:28px;color:var(--muted)">
        Sin certificados con los filtros actuales. Crea uno con <strong>+ Nuevo CofA</strong>
        cuando recibas un certificado de un proveedor.
      </td></tr>`;
      return;
    }
    tbody.innerHTML = rows.map(c => {
      const est = ESTADOS.find(e => e.code === c.estado_lectura) || { label: c.estado_lectura, color: '#64748b' };
      return `
        <tr>
          <td><strong style="font-family:monospace">${escapeHtml(c.folio_interno || '—')}</strong></td>
          <td style="font-size:13px">${escapeHtml(c.folio_certificado_proveedor || '—')}</td>
          <td>${escapeHtml(c.proveedor_nombre || '—')}
            <div class="muted" style="font-size:11px">${escapeHtml(c.proveedor_rfc || '')}</div>
          </td>
          <td><strong>${escapeHtml(c.cve_prod || '—')}</strong>
            <div class="muted" style="font-size:11px">${escapeHtml(truncar(c.desc_prod || '', 40))}</div>
          </td>
          <td style="font-size:13px;font-family:monospace">${escapeHtml(c.lote_proveedor || '—')}</td>
          <td style="font-size:12px">${fmtDate(c.fecha_emision)}</td>
          <td style="font-size:12px">${c.fecha_vigencia ? fmtDate(c.fecha_vigencia) : '—'}</td>
          <td style="text-align:center"><span class="chip" style="background:${c.parametros_count > 0 ? '#dcfce7' : '#f1f5f9'};color:${c.parametros_count > 0 ? '#166534' : '#64748b'};font-size:11px">${c.parametros_count || 0}</span></td>
          <td style="text-align:center">${c.archivo_origen_path ? '<span title="Archivo cargado" style="color:#16a34a">📎</span>' : '<span class="muted">—</span>'}</td>
          <td><span class="chip" style="background:${est.color}22;color:${est.color}">${est.label}</span></td>
          <td style="text-align:right;white-space:nowrap">
            <button class="btn ghost" data-detalle="${c.certificado_proveedor_id}">Abrir</button>
          </td>
        </tr>`;
    }).join('');
    tbody.querySelectorAll('button[data-detalle]').forEach(b => b.addEventListener('click', () => {
      window.location.href = `/modules/lab/lab-cert-proveedor-detalle.html?id=${b.dataset.detalle}`;
    }));
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

  // ── Modal Nuevo CofA ────────────────────────────
  function abrirNuevoCofaModal() {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;overflow:auto';
    overlay.innerHTML = `
      <div style="background:white;border-radius:8px;max-width:640px;width:100%;max-height:95vh;overflow:auto;padding:24px;box-shadow:0 25px 50px rgba(0,0,0,.3)">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px">
          <div>
            <div class="eyebrow">Lab QA</div>
            <h2 style="margin:6px 0 0 0">Nuevo Certificado de Proveedor</h2>
            <div class="muted" style="font-size:12px;margin-top:6px">
              Captura el CofA enviado por el proveedor. Después podrás
              capturar parámetros, subir el PDF y validarlo.
            </div>
          </div>
          <button class="btn ghost" id="closeBtn">×</button>
        </div>

        <div class="grid-2" style="gap:10px">
          <div>
            <div class="label-text">Folio del proveedor *</div>
            <input class="input" id="m_folio_prov" maxlength="80" placeholder="Folio del CofA recibido"/>
          </div>
          <div>
            <div class="label-text">Lote del proveedor</div>
            <input class="input" id="m_lote_prov" maxlength="80"/>
          </div>

          <div style="grid-column:1/-1">
            <div class="label-text">Proveedor *</div>
            <div style="display:flex;gap:6px">
              <input class="input" id="m_provLabel" readonly placeholder="— Selecciona —"
                     style="flex:1;cursor:pointer;background:#f8fafc"/>
              <button type="button" class="btn ghost" id="m_provPickBtn">Buscar…</button>
            </div>
            <input type="hidden" id="m_provId"/>
          </div>

          <div style="grid-column:1/-1">
            <div class="label-text">Producto *</div>
            <div style="display:flex;gap:6px">
              <input class="input" id="m_prodLabel" readonly placeholder="— Selecciona —"
                     style="flex:1;cursor:pointer;background:#f8fafc"/>
              <button type="button" class="btn ghost" id="m_prodPickBtn">Buscar…</button>
            </div>
            <input type="hidden" id="m_prodId"/>
          </div>

          <div>
            <div class="label-text">Fecha de emisión</div>
            <input class="input" type="date" id="m_emision"/>
          </div>
          <div>
            <div class="label-text">Fecha de vigencia</div>
            <input class="input" type="date" id="m_vigencia"/>
          </div>

          <div style="grid-column:1/-1">
            <div class="label-text">Observaciones</div>
            <textarea class="input" id="m_obs" rows="2" maxlength="500"></textarea>
          </div>
        </div>

        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:20px">
          <button class="btn ghost"   id="cancelBtn">Cancelar</button>
          <button class="btn primary" id="saveBtn">Crear CofA</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const oQ = s => overlay.querySelector(s);
    const close = () => overlay.remove();
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    oQ('#closeBtn').addEventListener('click', close);
    oQ('#cancelBtn').addEventListener('click', close);

    oQ('#m_provPickBtn').addEventListener('click', () => abrirPickerProveedor({
      onSelect: p => {
        oQ('#m_provId').value = p.proveedor_id;
        oQ('#m_provLabel').value = p.nombre + (p.cve_prov ? ' · ' + p.cve_prov : '');
      },
    }));
    oQ('#m_provLabel').addEventListener('click', () => oQ('#m_provPickBtn').click());
    oQ('#m_prodPickBtn').addEventListener('click', () => abrirPickerProducto({
      onSelect: p => {
        oQ('#m_prodId').value = p.producto_id;
        oQ('#m_prodLabel').value = p.cve_prod + ' — ' + (p.desc_prod || '');
      },
    }));
    oQ('#m_prodLabel').addEventListener('click', () => oQ('#m_prodPickBtn').click());

    oQ('#saveBtn').addEventListener('click', async () => {
      const body = {
        folio_certificado_proveedor: oQ('#m_folio_prov').value.trim(),
        lote_proveedor:              oQ('#m_lote_prov').value.trim() || null,
        proveedor_id:                oQ('#m_provId').value,
        producto_id:                 oQ('#m_prodId').value,
        fecha_emision:               oQ('#m_emision').value || null,
        fecha_vigencia:              oQ('#m_vigencia').value || null,
        observaciones:               oQ('#m_obs').value.trim() || null,
      };
      if (!body.folio_certificado_proveedor) return KoguApi.toast('Folio del proveedor requerido.', 'error');
      if (!body.proveedor_id) return KoguApi.toast('Selecciona un proveedor.', 'error');
      if (!body.producto_id)  return KoguApi.toast('Selecciona un producto.', 'error');
      try {
        oQ('#saveBtn').disabled = true;
        const res = await KoguApi.apiFetch(BASE, { method: 'POST', body: JSON.stringify(body) });
        const cp = KoguApi.unwrapData(res);
        KoguApi.toast(`CofA ${cp.folio_interno} creado`, 'success');
        close();
        window.location.href = `/modules/lab/lab-cert-proveedor-detalle.html?id=${cp.certificado_proveedor_id}`;
      } catch (err) {
        oQ('#saveBtn').disabled = false;
        KoguApi.toast(err.message, 'error');
      }
    });
  }

  // ── Listeners ───────────────────────────────────
  $('qFil').addEventListener('input', debounce(() => load({ resetPage: true }), 300));
  $('estadoFil').addEventListener('change', () => load({ resetPage: true }));
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
  $('newCofaBtn').addEventListener('click', abrirNuevoCofaModal);
  $('pgSize').addEventListener('change', ev => { pageSize = parseInt(ev.target.value, 10) || 25; load({ resetPage: true }); });
  $('pgFirst').addEventListener('click', () => { if (currentPage > 1) { currentPage = 1; load(); } });
  $('pgPrev').addEventListener('click',  () => { if (currentPage > 1) { currentPage--;    load(); } });
  $('pgNext').addEventListener('click',  () => { if (currentPage < totalPages) { currentPage++; load(); } });
  $('pgLast').addEventListener('click',  () => { if (currentPage < totalPages) { currentPage = totalPages; load(); } });
  KoguShell.subscribeEmpresaActivaChange(() => load({ showToast: true, resetPage: true }));

  function escapeHtml(s) { return String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m]); }
  function debounce(fn, ms) { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); }; }
  function truncar(s, n) { return s && s.length > n ? s.slice(0, n - 1) + '…' : s; }
  function fmtDate(v) {
    if (!v) return '—';
    const s = String(v);
    const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : s;
  }

  await loadCatalogos();
  await load();
});

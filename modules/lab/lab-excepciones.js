// ============================================================
// lab-excepciones.js
// Módulo Excepciones — listado de solicitudes de excepción que
// hacen los analistas/comerciales para liberar lotes sin spec
// o con desviaciones. Aprobar/rechazar las gestiona QA Lead.
//
// Al APROBAR una excepción que tiene cliente_destino_id, el
// backend crea automáticamente la liberación con condicion='excepcion'
// (flujo B3 del modelo cliente).
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/lab/lab-excepciones.html';
  const BASE = '/protected/lab/excepciones';
  const PERM = 'screen.lab.bandeja';   // reusa permiso de bandeja (V031)

  const STATUS = [
    { code: 'borrador',  label: 'Borrador',  color: '#94a3b8', desc: 'Pendiente de aprobación QA' },
    { code: 'aprobada',  label: 'Aprobada',  color: '#16a34a', desc: 'Avalada por gerencia QA' },
    { code: 'rechazada', label: 'Rechazada', color: '#dc2626', desc: 'No procede' },
    { code: 'cancelada', label: 'Cancelada', color: '#94a3b8', desc: 'Anulada por el solicitante' },
  ];
  const CATEGORIAS = [
    { code: 'proceso',       label: 'Proceso' },
    { code: 'materia_prima', label: 'Materia prima' },
    { code: 'equipo',        label: 'Equipo' },
    { code: 'humano',        label: 'Humano' },
    { code: 'otro',          label: 'Otro' },
  ];
  const RIESGOS = {
    bajo:  { label: 'Bajo',  color: '#16a34a' },
    medio: { label: 'Medio', color: '#f59e0b' },
    alto:  { label: 'Alto',  color: '#dc2626' },
  };
  // Colores de estado NC (para el chip de NC vinculada)
  const STATUS_NC = {
    abierta:     { label: 'Abierta',     color: '#f59e0b' },
    en_analisis: { label: 'En análisis', color: '#3b82f6' },
    con_capa:    { label: 'Con CAPA',    color: '#8b5cf6' },
    cerrada:     { label: 'Cerrada',     color: '#16a34a' },
    anulada:     { label: 'Anulada',     color: '#94a3b8' },
  };

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Excepciones',
    description: 'Solicitudes de liberación con desviación o sin spec del cliente. QA aprueba o rechaza. Aprobar crea la liberación automáticamente.',
    requiredPermission: PERM,
  });
  if (!b) return;

  // Catálogos
  let clientes = [];
  async function loadClientes() {
    try {
      const res = await KoguApi.apiFetch('/protected/core/clientes');
      clientes = KoguApi.unwrapRows(res) || [];
    } catch (_) { clientes = []; }
  }

  let rows = [];
  let ncByExcepcion = {};   // index: excepcion_id → NC summary (cargado en background)
  let currentPage = 1, pageSize = 25, totalPages = 1, totalRows = 0;
  const $ = (id) => document.getElementById(id);

  const c = document.getElementById('pageContent');
  c.innerHTML = `
<div class="card">
  <div class="row">
    <div>
      <div class="eyebrow">Lab QA</div>
      <h2>Excepciones</h2>
    </div>
    <button class="btn ghost" id="refreshBtn">Actualizar</button>
  </div>

  <div class="grid-2" style="margin-top:14px;gap:10px">
    <input class="input" id="qFil" placeholder="Buscar por lote, producto, cliente o motivo…"/>
    <select class="select" id="statusFil">
      <option value="borrador" selected>Solo pendientes (borrador)</option>
      <option value="">Cualquier estado</option>
      <option value="aprobada">Aprobadas</option>
      <option value="rechazada">Rechazadas</option>
      <option value="cancelada">Canceladas</option>
    </select>
    <div style="display:flex;gap:6px;align-items:center">
      <input class="input" id="cliLabel" readonly placeholder="— Cualquier cliente —"
             style="flex:1;cursor:pointer;background:#f8fafc"/>
      <button type="button" class="btn ghost" id="cliPickBtn">Cliente…</button>
      <button type="button" class="btn ghost" id="cliClearBtn" title="Limpiar">×</button>
    </div>
    <input type="hidden" id="cliIdFil"/>
    <select class="select" id="catFil">
      <option value="">Cualquier categoría</option>
      ${CATEGORIAS.map(c => `<option value="${c.code}">${c.label}</option>`).join('')}
    </select>
  </div>

  <div class="table-wrap" style="margin-top:14px">
    <table>
      <thead><tr>
        <th>Solicitada</th>
        <th>Lote</th>
        <th>Cliente destino</th>
        <th>Categoría</th>
        <th>Riesgo</th>
        <th>Liberación</th>
        <th>NC</th>
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
      emptyText: 'Sin clientes',
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
    const cliId = $('cliIdFil').value;
    const cat = $('catFil').value;
    if (q)      params.set('q', q);
    if (status) params.set('status', status);
    if (cliId)  params.set('cliente_id', cliId);
    if (cat)    params.set('motivo_categoria', cat);
    try {
      const res = await KoguApi.apiFetch(`${BASE}?${params.toString()}`);
      rows = KoguApi.unwrapData(res) || [];
      ncByExcepcion = {};  // reset index al recargar
      const meta = res?.meta || {};
      totalRows = parseInt(meta.total ?? rows.length, 10) || 0;
      pageSize = parseInt(meta.pageSize ?? pageSize, 10) || pageSize;
      currentPage = parseInt(meta.page ?? currentPage, 10) || 1;
      totalPages = parseInt(meta.totalPages ?? 1, 10) || 1;
      renderRows();
      renderPag();
      if (showToast) KoguApi.toast('Excepciones actualizadas', 'success');
      // Carga en background de NCs vinculadas → re-render cuando termine.
      cargarNcsAsociadas().then(() => renderRows()).catch(() => {/* silencioso */});
    } catch (err) { KoguApi.toast(err.message, 'error'); }
  }

  // Para cada excepción visible (aprobada o con liberacion_id),
  // resuelve si tiene NC vinculada vía GET /protected/lab/nc?excepcion_id=X.
  // Se ejecuta en paralelo y silencioso; si falla, se queda sin chip.
  async function cargarNcsAsociadas() {
    const idsExc = rows
      .filter(e => e.excepcion_id && (e.status === 'aprobada' || e.liberacion_id))
      .map(e => e.excepcion_id);
    if (!idsExc.length) return;
    const results = await Promise.allSettled(idsExc.map(id =>
      KoguApi.apiFetch(`/protected/lab/nc?excepcion_id=${encodeURIComponent(id)}&pageSize=1`)
    ));
    results.forEach((r, i) => {
      if (r.status !== 'fulfilled') return;
      const ncs = KoguApi.unwrapData(r.value) || [];
      if (ncs[0]) ncByExcepcion[idsExc[i]] = ncs[0];
    });
  }

  function renderRows() {
    const tbody = $('rows');
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:24px;color:var(--muted)">
        Sin excepciones con los filtros actuales. Las excepciones se crean desde el flujo de liberación al usar el atajo <strong>"Crear excepción"</strong>.
      </td></tr>`;
      return;
    }
    tbody.innerHTML = rows.map(e => {
      const st = STATUS.find(s => s.code === e.status) || { label: e.status, color: '#64748b' };
      const cat = CATEGORIAS.find(c => c.code === e.motivo_categoria)?.label || e.motivo_categoria;
      const riesgo = RIESGOS[e.evaluacion_riesgo] || { label: e.evaluacion_riesgo, color: '#64748b' };
      const fecha = e.created_at ? new Date(e.created_at).toLocaleString() : '—';
      const libChip = e.liberacion_id
        ? `<span class="chip" style="background:#dcfce7;color:#166534">✓ Creada</span>`
        : (e.status === 'aprobada' ? '<span class="muted" style="font-size:11px">Sin liberación</span>' : '<span class="muted">—</span>');
      // NC vinculada (cargada en 2do paso async)
      const ncLink = ncByExcepcion[e.excepcion_id];
      const stNc = ncLink ? (STATUS_NC[ncLink.status] || { color: '#64748b' }) : null;
      const ncChip = ncLink
        ? `<a href="/modules/lab/lab-nc-detalle.html?id=${ncLink.nc_id}"
              class="chip"
              style="background:${stNc.color}22;color:${stNc.color};font-family:monospace;text-decoration:none;font-size:11px"
              title="${escapeHtml(ncLink.descripcion || '')}">${escapeHtml(ncLink.folio_nc)}</a>`
        : (e.status === 'aprobada' ? '<span class="muted" style="font-size:11px">—</span>' : '<span class="muted">—</span>');
      return `
        <tr>
          <td style="font-size:12px">${fecha}
            <div class="muted" style="font-size:11px">por ${escapeHtml(e.analista_nombre || '—')}</div>
          </td>
          <td><strong>${escapeHtml(e.numero_lote || '—')}</strong>
            <div class="muted" style="font-size:11px">${escapeHtml(e.cve_prod || '')} — ${escapeHtml(truncar(e.desc_prod || '', 30))}</div>
          </td>
          <td>${escapeHtml(e.cliente_nombre || '—')}
            <div class="muted" style="font-size:11px">${escapeHtml(e.cliente_rfc || '')}</div>
          </td>
          <td>${escapeHtml(cat || '—')}
            <div class="muted" style="font-size:11px">${escapeHtml(truncar(e.motivo_descripcion || '', 50))}</div>
          </td>
          <td><span class="chip" style="background:${riesgo.color}22;color:${riesgo.color}">${riesgo.label}</span></td>
          <td>${libChip}</td>
          <td>${ncChip}</td>
          <td><span class="chip" style="background:${st.color}22;color:${st.color}">${st.label}</span></td>
          <td style="text-align:right;white-space:nowrap">
            <button class="btn ghost" data-detalle="${e.excepcion_id}">Detalle</button>
            ${e.status === 'borrador'
              ? `<button class="btn primary" data-aprobar="${e.excepcion_id}" style="background:#16a34a">Aprobar</button>
                 <button class="btn ghost danger" data-rechazar="${e.excepcion_id}">Rechazar</button>` : ''}
          </td>
        </tr>`;
    }).join('');
    tbody.querySelectorAll('button[data-detalle]').forEach(b => b.addEventListener('click', () => abrirDetalle(b.dataset.detalle)));
    tbody.querySelectorAll('button[data-aprobar]').forEach(b => b.addEventListener('click', () => aprobarConfirm(b.dataset.aprobar)));
    tbody.querySelectorAll('button[data-rechazar]').forEach(b => b.addEventListener('click', () => rechazarConfirm(b.dataset.rechazar)));
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

  async function abrirDetalle(excId) {
    try {
      const [resExc, resNc] = await Promise.all([
        KoguApi.apiFetch(`${BASE}/${excId}`),
        KoguApi.apiFetch(`/protected/lab/nc?excepcion_id=${encodeURIComponent(excId)}&pageSize=1`).catch(() => null),
      ]);
      const exc = KoguApi.unwrapData(resExc);
      const ncs = resNc ? (KoguApi.unwrapData(resNc) || []) : [];
      mostrarModalDetalle(exc, ncs[0] || null);
    } catch (err) { KoguApi.toast(err.message, 'error'); }
  }

  function mostrarModalDetalle(exc, ncVinculada = null) {
    const st = STATUS.find(s => s.code === exc.status) || { label: exc.status, color: '#64748b' };
    const cat = CATEGORIAS.find(c => c.code === exc.motivo_categoria)?.label || exc.motivo_categoria;
    let parametros = [];
    try { parametros = JSON.parse(exc.parametros_fuera_json || '[]'); } catch (_) { parametros = []; }

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;overflow:auto';
    overlay.innerHTML = `
      <div style="background:white;border-radius:8px;max-width:700px;width:100%;max-height:90vh;overflow:auto;padding:24px;box-shadow:0 25px 50px rgba(0,0,0,.3)">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px">
          <div>
            <div class="eyebrow">Lab QA · Excepción</div>
            <h2 style="margin:6px 0 0 0">Lote ${escapeHtml(exc.numero_lote || '—')}</h2>
            <span class="chip" style="background:${st.color}22;color:${st.color};font-size:12px;display:inline-block;margin-top:6px">${st.label}</span>
          </div>
          <button class="btn ghost" id="closeBtn">×</button>
        </div>

        <div class="grid-2" style="gap:10px;font-size:13px">
          <div><strong>Producto:</strong> ${escapeHtml(exc.cve_prod || '')} — ${escapeHtml(exc.desc_prod || '')}</div>
          <div><strong>Cliente destino:</strong> ${escapeHtml(exc.cliente_nombre || '—')}<br><span class="muted" style="font-size:11px">${escapeHtml(exc.cliente_rfc || '')}</span></div>
          <div><strong>Categoría:</strong> ${escapeHtml(cat)}</div>
          <div><strong>Riesgo:</strong> ${escapeHtml(exc.evaluacion_riesgo)}</div>
          <div style="grid-column:1/-1"><strong>Descripción:</strong><br><span class="muted">${escapeHtml(exc.motivo_descripcion || '')}</span></div>
          ${exc.acciones_inmediatas ? `<div style="grid-column:1/-1"><strong>Acciones inmediatas:</strong><br><span class="muted">${escapeHtml(exc.acciones_inmediatas)}</span></div>` : ''}
        </div>

        ${parametros.length ? `
          <h3 style="margin-top:18px;font-size:14px">Parámetros fuera de spec / sin spec del cliente</h3>
          <div style="font-size:12px;display:flex;flex-direction:column;gap:6px;margin-top:6px">
            ${parametros.map(p => `
              <div style="padding:8px 10px;background:#fef3c7;border-radius:6px">
                <strong>${escapeHtml(p.parametro_clave || p.parametro_id || '—')}</strong>
                ${p.parametro_nombre ? ` — ${escapeHtml(p.parametro_nombre)}` : ''}
                ${p.motivo ? `<div class="muted" style="font-size:11px">motivo: ${escapeHtml(p.motivo)}</div>` : ''}
                ${p.valor_oficial != null ? `<div class="muted" style="font-size:11px">valor oficial: ${escapeHtml(String(p.valor_oficial))}</div>` : ''}
              </div>`).join('')}
          </div>
        ` : ''}

        ${exc.status === 'borrador' ? `
          <div style="margin-top:20px;display:flex;gap:8px;justify-content:flex-end">
            <button class="btn ghost danger" id="rechazarBtn">Rechazar</button>
            <button class="btn primary" id="aprobarBtn" style="background:#16a34a">Aprobar</button>
          </div>
        ` : ''}
        ${exc.status === 'aprobada' && exc.liberacion_id ? `
          <div style="margin-top:14px;padding:10px;background:#dcfce7;color:#166534;border-radius:6px;font-size:13px">
            ✓ Liberación creada automáticamente al aprobar.
            <a href="/modules/lab/lab-liberaciones.html" style="margin-left:8px">Ir a Liberaciones →</a>
          </div>
        ` : ''}
        ${ncVinculada ? (() => {
          const stNc = STATUS_NC[ncVinculada.status] || { label: ncVinculada.status, color: '#64748b' };
          return `
          <div style="margin-top:10px;padding:10px;background:#eef2ff;color:#3730a3;border-radius:6px;font-size:13px">
            <strong>NC vinculada:</strong>
            <a href="/modules/lab/lab-nc-detalle.html?id=${ncVinculada.nc_id}"
               style="font-family:monospace;margin-left:6px">${escapeHtml(ncVinculada.folio_nc)}</a>
            <span class="chip" style="background:${stNc.color}22;color:${stNc.color};margin-left:8px;font-size:11px">${stNc.label}</span>
            ${ncVinculada.capas_count
              ? `<span class="muted" style="margin-left:8px;font-size:11px">${ncVinculada.capas_eficaces || 0}/${ncVinculada.capas_count} CAPAs eficaces</span>`
              : '<span class="muted" style="margin-left:8px;font-size:11px">Sin CAPAs aún</span>'}
          </div>`;
        })() : (exc.status === 'aprobada' ? `
          <div style="margin-top:10px;padding:10px;background:#fef3c7;color:#92400e;border-radius:6px;font-size:13px">
            ⚠ Esta excepción está aprobada pero no se encontró NC vinculada.
            Las NCs por excepción deberían crearse automáticamente al aprobar.
          </div>
        ` : '')}
        ${exc.status === 'rechazada' && exc.motivo_rechazo ? `
          <div style="margin-top:14px;padding:10px;background:#fee2e2;color:#991b1b;border-radius:6px;font-size:13px">
            <strong>Motivo de rechazo:</strong> ${escapeHtml(exc.motivo_rechazo)}
          </div>
        ` : ''}
      </div>
    `;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    overlay.querySelector('#closeBtn').addEventListener('click', close);
    overlay.querySelector('#aprobarBtn')?.addEventListener('click', () => { close(); aprobarConfirm(exc.excepcion_id); });
    overlay.querySelector('#rechazarBtn')?.addEventListener('click', () => { close(); rechazarConfirm(exc.excepcion_id); });
  }

  async function aprobarConfirm(excId) {
    if (!confirm('¿Aprobar esta excepción?\n\nAl aprobar:\n- Se firma técnicamente la excepción.\n- Se crea automáticamente la liberación del lote al cliente destino.\n- Se genera una NC (no conformidad) para trazabilidad.\n\nLa acción no se puede deshacer.')) return;
    try {
      const res = await KoguApi.apiFetch(`${BASE}/${excId}/aprobar`, { method: 'POST', body: JSON.stringify({}) });
      const data = KoguApi.unwrapData(res);
      let msg = 'Excepción aprobada';
      if (data?.liberacion_auto_id) msg += '. Liberación creada automáticamente.';
      if (data?.folio_nc) msg += ` NC: ${data.folio_nc}.`;
      KoguApi.toast(msg, 'success');
      await load();
    } catch (err) { KoguApi.toast(err.message, 'error'); }
  }

  async function rechazarConfirm(excId) {
    const motivo = prompt('Motivo del rechazo (obligatorio):');
    if (motivo == null) return;
    if (!motivo.trim()) return KoguApi.toast('Motivo requerido.', 'error');
    try {
      await KoguApi.apiFetch(`${BASE}/${excId}/rechazar`, {
        method: 'POST',
        body: JSON.stringify({ motivo_rechazo: motivo.trim() }),
      });
      KoguApi.toast('Excepción rechazada', 'success');
      await load();
    } catch (err) { KoguApi.toast(err.message, 'error'); }
  }

  $('qFil').addEventListener('input', debounce(() => load({ resetPage: true }), 300));
  $('statusFil').addEventListener('change', () => load({ resetPage: true }));
  $('catFil').addEventListener('change', () => load({ resetPage: true }));
  $('cliPickBtn').addEventListener('click', () => abrirPickerCliente({
    onSelect: (c) => {
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
  $('pgSize').addEventListener('change', ev => { pageSize = parseInt(ev.target.value, 10) || 25; load({ resetPage: true }); });
  $('pgFirst').addEventListener('click', () => { if (currentPage > 1) { currentPage = 1; load(); } });
  $('pgPrev').addEventListener('click',  () => { if (currentPage > 1) { currentPage--;    load(); } });
  $('pgNext').addEventListener('click',  () => { if (currentPage < totalPages) { currentPage++; load(); } });
  $('pgLast').addEventListener('click',  () => { if (currentPage < totalPages) { currentPage = totalPages; load(); } });
  KoguShell.subscribeEmpresaActivaChange(() => load({ showToast: true, resetPage: true }));

  function escapeHtml(s) { return String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m]); }
  function debounce(fn, ms) { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); }; }
  function truncar(s, n) { return s && s.length > n ? s.slice(0, n - 1) + '…' : s; }

  await loadClientes();
  await load();
});

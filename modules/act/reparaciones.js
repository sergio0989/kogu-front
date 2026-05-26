// ============================================================
// reparaciones.js
// Pantalla: Reparaciones (act_ordenes tipo='reparacion').
// Misma bandeja que mantenimiento, filtrada a reparacion, con
// proveedor/taller y costo visibles.
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const b = await KoguShell.initShell({
    currentPage:        '/modules/act/reparaciones.html',
    title:              'Reparaciones',
    description:        'Órdenes de reparación de activos.',
    requiredPermission: 'act.ordenes.read',
  });
  if (!b) return;

  const esc = KoguUi.escapeHtml;
  const canCreate = KoguShell.hasPerm(b, 'act.ordenes.create');
  const ESTADOS = ['abierta', 'en_proceso', 'en_espera', 'cerrada', 'cancelada'];
  const PRIORIDADES = ['baja', 'media', 'alta'];
  const ESTADO_COLOR = { abierta: '#ca8a04', en_proceso: '#2563eb', en_espera: '#7c3aed', cerrada: '#16a34a', cancelada: '#dc2626' };
  const estadoBadge = e => { const c = ESTADO_COLOR[e] || '#64748b'; return `<span class="chip" style="background:${c}1a;color:${c};border:1px solid ${c}55">${esc((e || '').replace(/_/g, ' '))}</span>`; };

  let activos = null, proveedores = null, usuarios = null;
  let page = 1, pageSize = 20, totalPages = 1, total = 0;
  const $ = id => document.getElementById(id);

  document.getElementById('pageContent').innerHTML = `
<div class="card">
  <div class="row">
    <div><div class="eyebrow">Activos</div><h2>Reparaciones</h2></div>
    <div style="display:flex;gap:8px">
      ${canCreate ? '<button class="btn primary" id="newBtn">+ Nueva reparación</button>' : ''}
      <button class="btn" id="refreshBtn">Actualizar</button>
    </div>
  </div>
  <div class="grid-2" style="margin-top:16px">
    <select class="select" id="fEstado"><option value="">Todos los estados</option>${ESTADOS.map(e => `<option value="${e}">${e.replace(/_/g, ' ')}</option>`).join('')}</select>
    <select class="select" id="fPrioridad"><option value="">Toda prioridad</option>${PRIORIDADES.map(p => `<option value="${p}">${p}</option>`).join('')}</select>
  </div>
  <label style="display:flex;align-items:center;gap:8px;margin-top:10px;cursor:pointer"><input type="checkbox" id="fVencidas"/> <span>Solo vencidas (compromiso pasado, no cerradas)</span></label>
  <div class="table-wrap" style="margin-top:14px">
    <table><thead><tr>
      <th>Folio</th><th>Activo</th><th>Estado</th><th>Prioridad</th><th>Taller / Proveedor</th><th>Costo</th><th>Apertura</th><th>Compromiso</th>
    </tr></thead><tbody id="repRows"><tr><td colspan="8" class="empty">Cargando…</td></tr></tbody></table>
  </div>
  <div id="repPg" style="display:flex;align-items:center;justify-content:space-between;margin-top:10px;font-size:13px;color:var(--muted)"></div>
</div>`;

  ['fEstado', 'fPrioridad', 'fVencidas'].forEach(id => $(id).addEventListener('change', () => { page = 1; load(); }));

  async function load() {
    const tbody = $('repRows');
    try {
      const qs = KoguUi.queryParams({
        tipo: 'reparacion', estado: $('fEstado').value, prioridad: $('fPrioridad').value,
        vencidas: $('fVencidas').checked ? 'true' : '', page, page_size: pageSize,
      });
      const res = await KoguApi.apiFetch('/protected/act/ordenes?' + qs);
      const data = KoguApi.unwrapData(res);
      const rows = data.datos || []; const pg = data.paginacion || {};
      page = pg.page || 1; pageSize = pg.page_size || 20; total = pg.total || rows.length; totalPages = pg.total_pages || 1;
      if (!rows.length) tbody.innerHTML = `<tr><td colspan="8" class="empty">Sin reparaciones para los filtros actuales.</td></tr>`;
      else tbody.innerHTML = rows.map(r => `
        <tr style="cursor:pointer" data-id="${r.orden_id}">
          <td><strong>#${esc(String(r.id_mov))}</strong></td>
          <td>${esc(r.activo_codigo || '')}${r.activo_nombre ? ` · ${esc(r.activo_nombre)}` : ''}</td>
          <td>${estadoBadge(r.estado)}</td>
          <td>${esc(r.prioridad || '')}</td>
          <td>${r.proveedor_nombre ? esc(r.proveedor_nombre) : '<span class="muted">—</span>'}</td>
          <td>${r.costo != null ? KoguUi.fmtMoney(r.costo, r.moneda) : '<span class="muted">—</span>'}</td>
          <td>${KoguUi.fmtDate(r.fecha_apertura)}</td>
          <td>${r.fecha_compromiso ? esc(r.fecha_compromiso) : '<span class="muted">—</span>'}</td>
        </tr>`).join('');
      tbody.querySelectorAll('[data-id]').forEach(tr => tr.onclick = () => { window.location.href = '/modules/act/orden-detalle.html?id=' + encodeURIComponent(tr.dataset.id); });
      $('repPg').innerHTML = `<span>${total} reparación${total === 1 ? '' : 'es'} · página ${page} de ${totalPages}</span>
        <span style="display:flex;gap:8px"><button class="btn ghost" id="rp" ${page <= 1 ? 'disabled' : ''}>← Anterior</button><button class="btn ghost" id="rn" ${page >= totalPages ? 'disabled' : ''}>Siguiente →</button></span>`;
      const rp = $('rp'), rn = $('rn');
      if (rp) rp.onclick = () => { if (page > 1) { page--; load(); } };
      if (rn) rn.onclick = () => { if (page < totalPages) { page++; load(); } };
    } catch (_err) {
      tbody.innerHTML = `<tr><td colspan="8" class="empty">No fue posible cargar las reparaciones.</td></tr>`;
    }
  }

  // ── Modal Nueva reparación ──────────────────────────────────────────────────
  const sel = { activoId: null, proveedorId: null, responsableId: null };
  async function ensureActivos() { if (!activos) { try { const r = await KoguApi.apiFetch('/protected/act/activos?page_size=200'); activos = KoguApi.unwrapData(r).datos || []; } catch (_) { activos = []; } } }
  async function ensureProveedores() { if (!proveedores) { try { proveedores = KoguApi.unwrapRows(await KoguApi.apiFetch('/protected/core/proveedores')) || []; } catch (_) { proveedores = []; } } }
  async function ensureUsuarios() { if (!usuarios) { try { usuarios = KoguApi.unwrapRows(await KoguApi.apiFetch('/protected/core/usuarios')) || []; } catch (_) { usuarios = []; } } }

  function buildModal() {
    if (!canCreate) return;
    const overlay = document.createElement('div');
    overlay.id = 'repModal';
    overlay.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:9999;align-items:flex-start;justify-content:center;padding:40px 20px;backdrop-filter:blur(2px)';
    overlay.innerHTML = `
      <div style="width:100%;max-width:600px;max-height:88vh;background:white;border-radius:12px;box-shadow:0 20px 50px rgba(0,0,0,.3);display:flex;flex-direction:column;overflow:hidden;color:#0f172a">
        <div style="padding:16px 20px;border-bottom:1px solid var(--line,#e2e8f0);display:flex;justify-content:space-between;align-items:center;flex-shrink:0">
          <h2 style="margin:0;font-size:18px">Nueva reparación</h2><button class="btn ghost" id="repClose" style="padding:6px 10px;font-size:16px">✕</button>
        </div>
        <div style="flex:1;overflow-y:auto;padding:20px"><div class="stack">
          <div><div class="label-text">Activo</div><div style="display:flex;gap:6px"><input class="input" id="r_activo_label" readonly placeholder="— selecciona —" style="flex:1;cursor:pointer;background:#f8fafc"/><button type="button" class="btn ghost" id="r_activo_pick">Buscar…</button></div></div>
          <div><div class="label-text">Prioridad</div><select class="select" id="r_prioridad">${PRIORIDADES.map(p => `<option value="${p}"${p === 'media' ? ' selected' : ''}>${p}</option>`).join('')}</select></div>
          <div><div class="label-text">Descripción del problema</div><input class="input" id="r_desc"/></div>
          <div class="grid-2">
            <div><div class="label-text">Taller / proveedor <span class="muted" style="font-size:11px">(opcional)</span></div><div style="display:flex;gap:6px"><input class="input" id="r_prov_label" readonly placeholder="— ninguno —" style="flex:1;cursor:pointer;background:#f8fafc"/><button type="button" class="btn ghost" id="r_prov_pick">Buscar…</button></div></div>
            <div><div class="label-text">Responsable <span class="muted" style="font-size:11px">(opcional)</span></div><div style="display:flex;gap:6px"><input class="input" id="r_resp_label" readonly placeholder="— ninguno —" style="flex:1;cursor:pointer;background:#f8fafc"/><button type="button" class="btn ghost" id="r_resp_pick">Buscar…</button></div></div>
          </div>
          <div><div class="label-text">Fecha compromiso <span class="muted" style="font-size:11px">(opcional)</span></div><input class="input" id="r_compromiso" type="date"/></div>
        </div></div>
        <div style="padding:14px 20px;border-top:1px solid var(--line,#e2e8f0);display:flex;justify-content:flex-end;gap:8px;flex-shrink:0">
          <button class="btn ghost" id="repCancel">Cancelar</button><button class="btn primary" id="repSave">Crear reparación</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
    $('repClose').onclick = closeModal; $('repCancel').onclick = closeModal; $('repSave').onclick = onSave;
    const pickActivo = async () => { await ensureActivos(); KoguUi.openSearchPicker({ title: 'Selecciona el activo', items: activos, placeholder: 'Buscar por código o nombre…', columns: [{ key: 'codigo', label: 'Código', primary: true }, { key: 'nombre', label: 'Nombre' }], onSelect: a => { sel.activoId = a.activo_id; $('r_activo_label').value = `${a.codigo} · ${a.nombre}`; } }); };
    $('r_activo_pick').onclick = pickActivo; $('r_activo_label').onclick = pickActivo;
    const pickProv = async () => { await ensureProveedores(); KoguUi.openSearchPicker({ title: 'Selecciona el proveedor', items: proveedores, placeholder: 'Buscar…', columns: [{ key: 'nombre', label: 'Nombre', primary: true }, { key: 'rfc', label: 'RFC' }], onSelect: p => { sel.proveedorId = p.proveedor_id; $('r_prov_label').value = p.nombre || p.rfc; } }); };
    $('r_prov_pick').onclick = pickProv;
    const pickResp = async () => { await ensureUsuarios(); KoguUi.openSearchPicker({ title: 'Selecciona el responsable', items: usuarios, placeholder: 'Buscar por nombre o email…', columns: [{ key: 'nombre', label: 'Nombre', primary: true }, { key: 'email', label: 'Email' }], onSelect: u => { sel.responsableId = u.user_id; $('r_resp_label').value = u.nombre || u.email; } }); };
    $('r_resp_pick').onclick = pickResp;
  }
  function openModal() { sel.activoId = sel.proveedorId = sel.responsableId = null; ['r_activo_label', 'r_prov_label', 'r_resp_label', 'r_desc', 'r_compromiso'].forEach(id => { if ($(id)) $(id).value = ''; }); $('r_prioridad').value = 'media'; $('repModal').style.display = 'flex'; }
  function closeModal() { const m = $('repModal'); if (m) m.style.display = 'none'; }

  async function onSave() {
    if (!sel.activoId) { KoguApi.toast('Selecciona el activo.', 'error'); return; }
    const desc = $('r_desc').value.trim();
    if (!desc) { KoguApi.toast('La descripción del problema es obligatoria.', 'error'); return; }
    const payload = { activo_id: sel.activoId, tipo: 'reparacion', prioridad: $('r_prioridad').value, descripcion_problema: desc, proveedor_id: sel.proveedorId || null, responsable_user_id: sel.responsableId || null, fecha_compromiso: $('r_compromiso').value || null };
    await KoguUi.withLoading(this, async () => {
      try {
        const res = await KoguApi.apiFetch('/protected/act/ordenes', { method: 'POST', body: JSON.stringify(payload) });
        const created = KoguApi.unwrapData(res);
        KoguApi.toast('Reparación creada · #' + (created?.id_mov || ''), 'success');
        closeModal();
        if (created?.orden_id) window.location.href = '/modules/act/orden-detalle.html?id=' + encodeURIComponent(created.orden_id);
      } catch (_err) { /* apiFetch toast */ }
    }, 'Creando…');
  }

  // ── Bindings ────────────────────────────────────────────────────────────────
  buildModal();
  if (canCreate) $('newBtn').onclick = openModal;
  $('refreshBtn').onclick = () => { page = 1; load(); };
  KoguShell.subscribeEmpresaActivaChange(() => { page = 1; load(); });
  load();
});

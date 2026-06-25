// ============================================================
// mantenimiento.js
// Pantalla: Mantenimiento (órdenes preventivo/correctivo + calendario).
// Endpoints: /protected/act/ordenes, /protected/act/activos
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const b = await KoguShell.initShell({
    currentPage:        '/modules/act/mantenimiento.html',
    title:              'Mantenimiento',
    description:        'Órdenes de mantenimiento preventivo y correctivo.',
    requiredPermission: 'act.ordenes.read',
  });
  if (!b) return;

  const esc = KoguUi.escapeHtml;
  const canCreate = KoguShell.hasPerm(b, 'act.ordenes.create');
  const TIPOS = ['preventivo', 'correctivo'];
  const ESTADOS = ['abierta', 'en_proceso', 'en_espera', 'cerrada', 'cancelada'];
  const PRIORIDADES = ['baja', 'media', 'alta'];
  const ESTADO_COLOR = { abierta: '#ca8a04', en_proceso: '#2563eb', en_espera: '#7c3aed', cerrada: '#16a34a', cancelada: '#dc2626' };
  const estadoBadge = e => { const c = ESTADO_COLOR[e] || '#64748b'; return `<span class="chip" style="background:${c}1a;color:${c};border:1px solid ${c}55">${esc((e || '').replace(/_/g, ' '))}</span>`; };

  let activeTab = 'ordenes';
  let activos = null, proveedores = null, usuarios = null;
  const $ = id => document.getElementById(id);

  document.getElementById('pageContent').innerHTML = `
<div class="card">
  <div class="row">
    <div><div class="eyebrow">Activos</div><h2>Mantenimiento</h2></div>
    <div style="display:flex;gap:8px">
      ${canCreate ? '<button class="btn primary" id="newBtn">+ Nueva orden</button>' : ''}
      <button class="btn" id="refreshBtn">Actualizar</button>
    </div>
  </div>
  <div class="tabs" style="margin-top:16px">
    <button class="tab active" data-tab="ordenes">Órdenes</button>
    <button class="tab" data-tab="calendario">Calendario</button>
  </div>
  <div id="tabBody"></div>
</div>`;

  pcTabs();
  function pcTabs() {
    document.querySelectorAll('[data-tab]').forEach(btn => {
      btn.onclick = () => {
        activeTab = btn.dataset.tab;
        document.querySelectorAll('[data-tab]').forEach(x => x.classList.toggle('active', x.dataset.tab === activeTab));
        renderTab();
      };
    });
  }

  function renderTab() {
    if (activeTab === 'ordenes') return renderOrdenes();
    if (activeTab === 'calendario') return renderCalendario();
  }

  // ── Órdenes ─────────────────────────────────────────────────────────────────
  let page = 1; const pageSize = 20;
  let mergedRows = [];

  function renderOrdenes() {
    $('tabBody').innerHTML = `
      <div class="grid-3" style="margin-top:14px">
        <select class="select" id="fTipo">
          <option value="">Preventivo y correctivo</option>
          <option value="preventivo">Preventivo</option>
          <option value="correctivo">Correctivo</option>
        </select>
        <select class="select" id="fEstado"><option value="">Todos los estados</option>${ESTADOS.map(e => `<option value="${e}">${e.replace(/_/g, ' ')}</option>`).join('')}</select>
        <select class="select" id="fPrioridad"><option value="">Toda prioridad</option>${PRIORIDADES.map(p => `<option value="${p}">${p}</option>`).join('')}</select>
      </div>
      <label style="display:flex;align-items:center;gap:8px;margin-top:10px;cursor:pointer"><input type="checkbox" id="fVencidas"/> <span>Solo vencidas (compromiso pasado, no cerradas)</span></label>
      <div class="table-wrap" style="margin-top:14px">
        <table><thead><tr>
          <th>Folio</th><th>Activo</th><th>Tipo</th><th>Estado</th><th>Prioridad</th><th>Apertura</th><th>Compromiso</th>
        </tr></thead><tbody id="ordRows"><tr><td colspan="7" class="empty">Cargando…</td></tr></tbody></table>
      </div>
      <div id="ordPg" style="display:flex;align-items:center;justify-content:space-between;margin-top:10px;font-size:13px;color:var(--muted)"></div>`;
    ['fTipo', 'fEstado', 'fPrioridad', 'fVencidas'].forEach(id => $(id).addEventListener('change', () => { page = 1; loadOrdenes(); }));
    loadOrdenes();
  }

  // El backend filtra por un solo tipo; para "ambos" se piden los dos y se
  // fusionan client-side (paginación local).
  async function fetchAllOfTipo(tipo, baseFilters) {
    const out = [];
    let p = 1, tp = 1;
    do {
      const qs = KoguUi.queryParams({ ...baseFilters, tipo, page: p, page_size: 200 });
      const res = await KoguApi.apiFetch('/protected/act/ordenes?' + qs);
      const data = KoguApi.unwrapData(res);
      (data.datos || []).forEach(r => out.push(r));
      tp = data.paginacion?.total_pages || 1; p++;
    } while (p <= tp);
    return out;
  }

  async function loadOrdenes() {
    const tbody = $('ordRows');
    const baseFilters = {
      estado: $('fEstado').value, prioridad: $('fPrioridad').value,
      vencidas: $('fVencidas').checked ? 'true' : '',
    };
    const tipoSel = $('fTipo').value;
    try {
      const tipos = tipoSel ? [tipoSel] : TIPOS;
      const parts = await Promise.all(tipos.map(t => fetchAllOfTipo(t, baseFilters)));
      mergedRows = parts.flat().sort((a, c) => new Date(c.fecha_apertura) - new Date(a.fecha_apertura));
      renderOrdenPage();
    } catch (_err) {
      tbody.innerHTML = `<tr><td colspan="7" class="empty">No fue posible cargar las órdenes.</td></tr>`;
    }
  }

  function renderOrdenPage() {
    const tbody = $('ordRows');
    const total = mergedRows.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (page > totalPages) page = totalPages;
    const slice = mergedRows.slice((page - 1) * pageSize, page * pageSize);
    if (!slice.length) { tbody.innerHTML = `<tr><td colspan="7" class="empty">Sin órdenes para los filtros actuales.</td></tr>`; }
    else tbody.innerHTML = slice.map(r => `
      <tr style="cursor:pointer" data-id="${r.orden_id}">
        <td><strong>#${esc(String(r.id_mov))}</strong></td>
        <td>${esc(r.activo_codigo || '')}${r.activo_nombre ? ` · ${esc(r.activo_nombre)}` : ''}</td>
        <td><span class="chip">${esc(r.tipo)}</span></td>
        <td>${estadoBadge(r.estado)}</td>
        <td>${esc(r.prioridad || '')}</td>
        <td>${KoguUi.fmtDate(r.fecha_apertura)}</td>
        <td>${r.fecha_compromiso ? esc(KoguUi.fmtDateOnly(r.fecha_compromiso)) : '<span class="muted">—</span>'}</td>
      </tr>`).join('');
    tbody.querySelectorAll('[data-id]').forEach(tr => tr.onclick = () => { window.location.href = '/modules/act/orden-detalle.html?id=' + encodeURIComponent(tr.dataset.id); });
    $('ordPg').innerHTML = `<span>${total} orden${total === 1 ? '' : 'es'} · página ${page} de ${totalPages}</span>
      <span style="display:flex;gap:8px"><button class="btn ghost" id="op" ${page <= 1 ? 'disabled' : ''}>← Anterior</button><button class="btn ghost" id="on" ${page >= totalPages ? 'disabled' : ''}>Siguiente →</button></span>`;
    const op = $('op'), on = $('on');
    if (op) op.onclick = () => { if (page > 1) { page--; renderOrdenPage(); } };
    if (on) on.onclick = () => { if (page < totalPages) { page++; renderOrdenPage(); } };
  }

  // ── Calendario (preventivos por fecha_compromiso) ───────────────────────────
  // Nota: el backend no expone un listado global de planes; se usan las órdenes
  // preventivas y su fecha_compromiso (que generar-orden copia de proxima_fecha).
  let calRef = new Date(); calRef.setDate(1);

  async function renderCalendario() {
    $('tabBody').innerHTML = `
      <div class="row" style="margin-top:14px">
        <div><div class="eyebrow">Preventivos programados</div><h3 id="calTitle" style="margin:4px 0"></h3></div>
        <div style="display:flex;gap:8px"><button class="btn ghost" id="calPrev">←</button><button class="btn ghost" id="calToday">Hoy</button><button class="btn ghost" id="calNext">→</button></div>
      </div>
      <div id="calGrid" style="margin-top:12px"></div>
      <div class="muted" style="font-size:12px;margin-top:8px">Basado en órdenes preventivas y su fecha de compromiso. En rojo: vencidas no cerradas.</div>`;
    $('calPrev').onclick = () => { calRef.setMonth(calRef.getMonth() - 1); paintCalendar(); };
    $('calNext').onclick = () => { calRef.setMonth(calRef.getMonth() + 1); paintCalendar(); };
    $('calToday').onclick = () => { calRef = new Date(); calRef.setDate(1); paintCalendar(); };
    await loadCalData();
    paintCalendar();
  }

  let calOrdenes = [];
  async function loadCalData() {
    try { calOrdenes = await fetchAllOfTipo('preventivo', {}); }
    catch (_e) { calOrdenes = []; }
  }

  function paintCalendar() {
    const y = calRef.getFullYear(), m = calRef.getMonth();
    $('calTitle').textContent = calRef.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
    const first = new Date(y, m, 1);
    const startDow = (first.getDay() + 6) % 7; // lunes=0
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const today = new Date(); today.setHours(0, 0, 0, 0);

    // Mapa día -> órdenes
    const byDay = {};
    calOrdenes.forEach(o => {
      if (!o.fecha_compromiso) return;
      const d = new Date(o.fecha_compromiso + 'T00:00:00');
      if (d.getFullYear() === y && d.getMonth() === m) {
        const k = d.getDate(); (byDay[k] = byDay[k] || []).push(o);
      }
    });

    const dows = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    let cells = dows.map(d => `<div style="font-weight:700;font-size:12px;color:var(--muted);text-align:center;padding:4px">${d}</div>`).join('');
    for (let i = 0; i < startDow; i++) cells += `<div></div>`;
    for (let day = 1; day <= daysInMonth; day++) {
      const items = byDay[day] || [];
      const cellDate = new Date(y, m, day); cellDate.setHours(0, 0, 0, 0);
      const marks = items.map(o => {
        const vencida = cellDate < today && o.estado !== 'cerrada' && o.estado !== 'cancelada';
        const col = vencida ? '#dc2626' : (o.estado === 'cerrada' ? '#16a34a' : '#2563eb');
        return `<a href="/modules/act/orden-detalle.html?id=${encodeURIComponent(o.orden_id)}" class="chip" style="display:block;margin-top:3px;background:${col}1a;color:${col};border:1px solid ${col}55;text-decoration:none;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">#${esc(String(o.id_mov))} ${esc(o.activo_codigo || '')}</a>`;
      }).join('');
      const isToday = cellDate.getTime() === today.getTime();
      cells += `<div style="border:1px solid var(--line,#e2e8f0);border-radius:8px;min-height:74px;padding:6px;${isToday ? 'background:#eff6ff' : ''}">
        <div style="font-size:12px;font-weight:600">${day}</div>${marks}</div>`;
    }
    $('calGrid').innerHTML = `<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:6px">${cells}</div>`;
  }

  // ── Modal Nueva orden ───────────────────────────────────────────────────────
  const sel = { activoId: null, activoLabel: '', proveedorId: null, proveedorLabel: '', responsableId: null, responsableLabel: '' };

  async function ensureActivos() { if (!activos) { try { const r = await KoguApi.apiFetch('/protected/act/activos?page_size=200'); activos = KoguApi.unwrapData(r).datos || []; } catch (_) { activos = []; } } return activos; }
  async function ensureProveedores() { if (!proveedores) { try { proveedores = KoguApi.unwrapRows(await KoguApi.apiFetch('/protected/core/proveedores')) || []; } catch (_) { proveedores = []; } } return proveedores; }
  async function ensureUsuarios() { if (!usuarios) { try { usuarios = KoguApi.unwrapRows(await KoguApi.apiFetch('/protected/core/usuarios')) || []; } catch (_) { usuarios = []; } } return usuarios; }

  function buildModal() {
    if (!canCreate) return;
    const overlay = document.createElement('div');
    overlay.id = 'ordModal';
    overlay.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:9999;align-items:flex-start;justify-content:center;padding:40px 20px;backdrop-filter:blur(2px)';
    overlay.innerHTML = `
      <div style="width:100%;max-width:600px;max-height:88vh;background:white;border-radius:12px;box-shadow:0 20px 50px rgba(0,0,0,.3);display:flex;flex-direction:column;overflow:hidden;color:#0f172a">
        <div style="padding:16px 20px;border-bottom:1px solid var(--line,#e2e8f0);display:flex;justify-content:space-between;align-items:center;flex-shrink:0">
          <h2 style="margin:0;font-size:18px">Nueva orden de mantenimiento</h2>
          <button class="btn ghost" id="ordClose" style="padding:6px 10px;font-size:16px">✕</button>
        </div>
        <div style="flex:1;overflow-y:auto;padding:20px"><div class="stack">
          <div>
            <div class="label-text">Activo</div>
            <div style="display:flex;gap:6px"><input class="input" id="o_activo_label" readonly placeholder="— selecciona —" style="flex:1;cursor:pointer;background:#f8fafc"/><button type="button" class="btn ghost" id="o_activo_pick">Buscar…</button></div>
          </div>
          <div class="grid-2">
            <div><div class="label-text">Tipo</div><select class="select" id="o_tipo"><option value="preventivo">preventivo</option><option value="correctivo">correctivo</option></select></div>
            <div><div class="label-text">Prioridad</div><select class="select" id="o_prioridad">${PRIORIDADES.map(p => `<option value="${p}"${p === 'media' ? ' selected' : ''}>${p}</option>`).join('')}</select></div>
          </div>
          <div><div class="label-text">Descripción del problema / trabajo</div><input class="input" id="o_desc"/></div>
          <div class="grid-2">
            <div><div class="label-text">Proveedor / taller <span class="muted" style="font-size:11px">(opcional)</span></div>
              <div style="display:flex;gap:6px"><input class="input" id="o_prov_label" readonly placeholder="— ninguno —" style="flex:1;cursor:pointer;background:#f8fafc"/><button type="button" class="btn ghost" id="o_prov_pick">Buscar…</button></div></div>
            <div><div class="label-text">Responsable <span class="muted" style="font-size:11px">(opcional)</span></div>
              <div style="display:flex;gap:6px"><input class="input" id="o_resp_label" readonly placeholder="— ninguno —" style="flex:1;cursor:pointer;background:#f8fafc"/><button type="button" class="btn ghost" id="o_resp_pick">Buscar…</button></div></div>
          </div>
          <div><div class="label-text">Fecha compromiso <span class="muted" style="font-size:11px">(opcional)</span></div><input class="input" id="o_compromiso" type="date"/></div>
        </div></div>
        <div style="padding:14px 20px;border-top:1px solid var(--line,#e2e8f0);display:flex;justify-content:flex-end;gap:8px;flex-shrink:0">
          <button class="btn ghost" id="ordCancel">Cancelar</button><button class="btn primary" id="ordSave">Crear orden</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
    $('ordClose').onclick = closeModal; $('ordCancel').onclick = closeModal; $('ordSave').onclick = onSave;
    const pickActivo = async () => { await ensureActivos(); KoguUi.openSearchPicker({ title: 'Selecciona el activo', items: activos, placeholder: 'Buscar por código o nombre…', columns: [{ key: 'codigo', label: 'Código', primary: true }, { key: 'nombre', label: 'Nombre' }], onSelect: a => { sel.activoId = a.activo_id; $('o_activo_label').value = `${a.codigo} · ${a.nombre}`; } }); };
    $('o_activo_pick').onclick = pickActivo; $('o_activo_label').onclick = pickActivo;
    const pickProv = async () => { await ensureProveedores(); KoguUi.openSearchPicker({ title: 'Selecciona el proveedor', items: proveedores, placeholder: 'Buscar…', columns: [{ key: 'nombre', label: 'Nombre', primary: true }, { key: 'rfc', label: 'RFC' }], onSelect: p => { sel.proveedorId = p.proveedor_id; $('o_prov_label').value = p.nombre || p.rfc; } }); };
    $('o_prov_pick').onclick = pickProv;
    const pickResp = async () => { await ensureUsuarios(); KoguUi.openSearchPicker({ title: 'Selecciona el responsable', items: usuarios, placeholder: 'Buscar por nombre o email…', columns: [{ key: 'nombre', label: 'Nombre', primary: true }, { key: 'email', label: 'Email' }], onSelect: u => { sel.responsableId = u.user_id; $('o_resp_label').value = u.nombre || u.email; } }); };
    $('o_resp_pick').onclick = pickResp;
  }
  function openModal() { sel.activoId = sel.proveedorId = sel.responsableId = null; ['o_activo_label', 'o_prov_label', 'o_resp_label', 'o_desc', 'o_compromiso'].forEach(id => { if ($(id)) $(id).value = ''; }); $('o_tipo').value = 'preventivo'; $('o_prioridad').value = 'media'; $('ordModal').style.display = 'flex'; }
  function closeModal() { const m = $('ordModal'); if (m) m.style.display = 'none'; }

  async function onSave() {
    if (!sel.activoId) { KoguApi.toast('Selecciona el activo.', 'error'); return; }
    const desc = $('o_desc').value.trim();
    if (!desc) { KoguApi.toast('La descripción del problema es obligatoria.', 'error'); return; }
    const payload = {
      activo_id: sel.activoId, tipo: $('o_tipo').value, prioridad: $('o_prioridad').value,
      descripcion_problema: desc,
      proveedor_id: sel.proveedorId || null, responsable_user_id: sel.responsableId || null,
      fecha_compromiso: $('o_compromiso').value || null,
    };
    await KoguUi.withLoading(this, async () => {
      try {
        const res = await KoguApi.apiFetch('/protected/act/ordenes', { method: 'POST', body: JSON.stringify(payload) });
        const created = KoguApi.unwrapData(res);
        KoguApi.toast('Orden creada · #' + (created?.id_mov || ''), 'success');
        closeModal();
        if (created?.orden_id) window.location.href = '/modules/act/orden-detalle.html?id=' + encodeURIComponent(created.orden_id);
      } catch (_err) { /* apiFetch toast */ }
    }, 'Creando…');
  }

  // ── Bindings ────────────────────────────────────────────────────────────────
  buildModal();
  if (canCreate) $('newBtn').onclick = openModal;
  $('refreshBtn').onclick = () => renderTab();

  KoguShell.subscribeEmpresaActivaChange(() => { window.location.reload(); });

  renderTab();
});

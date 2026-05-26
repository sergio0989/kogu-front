// ============================================================
// inventario.js
// Pantalla: Campañas de inventario físico + panel de conciliación.
// Endpoints: /protected/act/inventarios(/:id/estado, /:id/conciliacion)
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const b = await KoguShell.initShell({
    currentPage:        '/modules/act/inventario.html',
    title:              'Inventario físico',
    description:        'Campañas de inventario y conciliación contra el registro.',
    requiredPermission: 'act.inventario.read',
  });
  if (!b) return;

  const esc = KoguUi.escapeHtml;
  const canManage = KoguShell.hasPerm(b, 'act.inventario.manage');
  const canContar = KoguShell.hasPerm(b, 'act.inventario.contar');

  const ESTADO_COLOR = { abierto: '#ca8a04', en_conteo: '#2563eb', conciliacion: '#7c3aed', cerrado: '#16a34a' };
  const estadoBadge = e => { const c = ESTADO_COLOR[e] || '#64748b'; return `<span class="chip" style="background:${c}1a;color:${c};border:1px solid ${c}55">${esc((e || '').replace(/_/g, ' '))}</span>`; };
  // Máquina lineal: cada estado avanza solo al siguiente.
  const NEXT = { abierto: { to: 'en_conteo', label: 'Iniciar conteo' }, en_conteo: { to: 'conciliacion', label: 'Pasar a conciliación' }, conciliacion: { to: 'cerrado', label: 'Cerrar campaña' }, cerrado: null };

  let ubicaciones = null, usuarios = null;
  const $ = id => document.getElementById(id);

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if ([...document.scripts].some(s => s.src === src)) return resolve();
      const s = document.createElement('script'); s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('No se pudo cargar ' + src));
      document.head.appendChild(s);
    });
  }

  // ── Vista lista ─────────────────────────────────────────────────────────────
  function renderListShell() {
    document.getElementById('pageContent').innerHTML = `
<div class="card">
  <div class="row">
    <div><div class="eyebrow">Activos</div><h2>Inventario físico</h2></div>
    <div style="display:flex;gap:8px">
      ${canManage ? '<button class="btn primary" id="newBtn">+ Nueva campaña</button>' : ''}
      <button class="btn" id="refreshBtn">Actualizar</button>
    </div>
  </div>
  <div class="table-wrap" style="margin-top:16px">
    <table><thead><tr>
      <th>Nombre</th><th>Alcance</th><th>Estado</th><th>Inicio</th><th>Cierre</th><th>Responsable</th><th>Acciones</th>
    </tr></thead><tbody id="rows"><tr><td colspan="7" class="empty">Cargando…</td></tr></tbody></table>
  </div>
</div>`;
    buildModal();
    if (canManage) $('newBtn').onclick = openModal;
    $('refreshBtn').onclick = loadList;
    loadList();
  }

  async function loadList() {
    const tbody = $('rows'); if (!tbody) return;
    try {
      const res = await KoguApi.apiFetch('/protected/act/inventarios');
      const rows = KoguApi.unwrapRows(res, 'rows') || [];
      if (!rows.length) { tbody.innerHTML = `<tr><td colspan="7" class="empty">Sin campañas de inventario.</td></tr>`; return; }
      tbody.innerHTML = rows.map(i => {
        const next = NEXT[i.estado];
        const puedeContar = canContar && (i.estado === 'abierto' || i.estado === 'en_conteo');
        return `<tr>
          <td><strong>${esc(i.nombre)}</strong></td>
          <td>${i.ubicacion_clave ? esc(i.ubicacion_clave) + ' — ' + esc(i.ubicacion_nombre || '') : '<span class="muted">Toda la empresa</span>'}</td>
          <td>${estadoBadge(i.estado)}</td>
          <td>${KoguUi.fmtDate(i.fecha_inicio)}</td>
          <td>${i.fecha_cierre ? KoguUi.fmtDate(i.fecha_cierre) : '<span class="muted">—</span>'}</td>
          <td>${i.responsable_nombre ? esc(i.responsable_nombre) : '<span class="muted">—</span>'}</td>
          <td class="actions-cell">
            ${puedeContar ? `<a class="btn ghost" href="/modules/act/inventario-conteo.html?id=${encodeURIComponent(i.inventario_id)}">Contar</a>` : ''}
            <button class="btn ghost" data-concil="${i.inventario_id}">Conciliación</button>
            ${(canManage && next) ? `<button class="btn ghost" data-next="${i.inventario_id}" data-to="${next.to}">${esc(next.label)}</button>` : ''}
          </td>
        </tr>`;
      }).join('');
      tbody.querySelectorAll('[data-concil]').forEach(btn => btn.onclick = () => renderConciliacion(btn.dataset.concil));
      tbody.querySelectorAll('[data-next]').forEach(btn => btn.onclick = () => cambiarEstado(btn.dataset.next, btn.dataset.to));
    } catch (_err) { tbody.innerHTML = `<tr><td colspan="7" class="empty">No fue posible cargar las campañas.</td></tr>`; }
  }

  async function cambiarEstado(id, to) {
    const labels = { en_conteo: 'iniciar el conteo', conciliacion: 'pasar a conciliación', cerrado: 'cerrar la campaña' };
    if (!window.confirm(`¿Confirmas ${labels[to] || 'cambiar el estado'}?`)) return;
    try {
      await KoguApi.apiFetch('/protected/act/inventarios/' + encodeURIComponent(id) + '/estado', { method: 'POST', body: JSON.stringify({ estado: to }) });
      KoguApi.toast('Estado actualizado', 'success');
      loadList();
    } catch (_err) { /* apiFetch toast (422 transición inválida) */ }
  }

  // ── Modal Nueva campaña ─────────────────────────────────────────────────────
  const sel = { ubicacionId: null, responsableId: null };
  async function ensureUbicaciones() { if (!ubicaciones) { try { const all = KoguApi.unwrapRows(await KoguApi.apiFetch('/protected/act/ubicaciones'), 'rows') || []; ubicaciones = all.filter(u => u.activo !== false); } catch (_) { ubicaciones = []; } } return ubicaciones; }
  async function ensureUsuarios() { if (!usuarios) { try { usuarios = KoguApi.unwrapRows(await KoguApi.apiFetch('/protected/core/usuarios')) || []; } catch (_) { usuarios = []; } } return usuarios; }

  function buildModal() {
    if (!canManage) return;
    const overlay = document.createElement('div');
    overlay.id = 'invModal';
    overlay.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:9999;align-items:flex-start;justify-content:center;padding:40px 20px;backdrop-filter:blur(2px)';
    overlay.innerHTML = `
      <div style="width:100%;max-width:520px;background:white;border-radius:12px;box-shadow:0 20px 50px rgba(0,0,0,.3);color:#0f172a;overflow:hidden">
        <div style="padding:16px 20px;border-bottom:1px solid var(--line,#e2e8f0);display:flex;justify-content:space-between;align-items:center">
          <h2 style="margin:0;font-size:18px">Nueva campaña de inventario</h2><button class="btn ghost" id="invClose" style="padding:6px 10px">✕</button>
        </div>
        <div style="padding:20px"><div class="stack">
          <div><div class="label-text">Nombre</div><input class="input" id="inv_nombre" placeholder="Ej. Inventario anual 2026"/></div>
          <div><div class="label-text">Alcance: ubicación <span class="muted" style="font-size:11px">(opcional; vacío = toda la empresa)</span></div><select class="select" id="inv_ubicacion"><option value="">Toda la empresa</option></select></div>
          <div><div class="label-text">Responsable <span class="muted" style="font-size:11px">(opcional)</span></div>
            <div style="display:flex;gap:6px"><input class="input" id="inv_resp_label" readonly placeholder="— ninguno —" style="flex:1;cursor:pointer;background:#f8fafc"/><button type="button" class="btn ghost" id="inv_resp_pick">Buscar…</button></div></div>
        </div></div>
        <div style="padding:14px 20px;border-top:1px solid var(--line,#e2e8f0);display:flex;justify-content:flex-end;gap:8px">
          <button class="btn ghost" id="invCancel">Cancelar</button><button class="btn primary" id="invSave">Crear campaña</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
    $('invClose').onclick = closeModal; $('invCancel').onclick = closeModal; $('invSave').onclick = onSave;
    const pickResp = async () => { await ensureUsuarios(); KoguUi.openSearchPicker({ title: 'Selecciona el responsable', items: usuarios, placeholder: 'Buscar por nombre o email…', columns: [{ key: 'nombre', label: 'Nombre', primary: true }, { key: 'email', label: 'Email' }], onSelect: u => { sel.responsableId = u.user_id; $('inv_resp_label').value = u.nombre || u.email; } }); };
    $('inv_resp_pick').onclick = pickResp;
  }
  async function openModal() {
    sel.ubicacionId = null; sel.responsableId = null;
    $('inv_nombre').value = ''; $('inv_resp_label').value = '';
    await ensureUbicaciones();
    $('inv_ubicacion').innerHTML = '<option value="">Toda la empresa</option>' + ubicaciones.map(u => `<option value="${u.ubicacion_id}">${esc(u.clave)} — ${esc(u.nombre)}</option>`).join('');
    $('invModal').style.display = 'flex';
  }
  function closeModal() { const m = $('invModal'); if (m) m.style.display = 'none'; }

  async function onSave() {
    const nombre = $('inv_nombre').value.trim();
    if (!nombre) { KoguApi.toast('El nombre es obligatorio.', 'error'); return; }
    const payload = { nombre, ubicacion_id: $('inv_ubicacion').value || null, responsable_user_id: sel.responsableId || null };
    await KoguUi.withLoading(this, async () => {
      try {
        await KoguApi.apiFetch('/protected/act/inventarios', { method: 'POST', body: JSON.stringify(payload) });
        KoguApi.toast('Campaña creada', 'success');
        closeModal(); loadList();
      } catch (_err) { /* apiFetch toast */ }
    }, 'Creando…');
  }

  // ── Panel de conciliación ───────────────────────────────────────────────────
  let concilData = null;
  async function renderConciliacion(id) {
    const pc = document.getElementById('pageContent');
    pc.innerHTML = `<div class="card"><div class="empty">Cargando conciliación…</div></div>`;
    try {
      const res = await KoguApi.apiFetch('/protected/act/inventarios/' + encodeURIComponent(id) + '/conciliacion');
      concilData = KoguApi.unwrapData(res);
    } catch (_err) {
      renderListShell();
      return;
    }
    const t = concilData.totales || {};
    const inv = concilData.inventario || {};
    const kpi = (label, val, color) => `<div class="kpi"><div class="label">${esc(label)}</div><div class="value" style="${color ? 'color:' + color : ''}">${KoguUi.int(val || 0)}</div><div class="hint"></div></div>`;
    pc.innerHTML = `
<div class="card">
  <div class="row">
    <div><div class="eyebrow"><button class="btn ghost" id="backBtn" style="padding:2px 8px">← Campañas</button></div>
      <h2 style="margin:6px 0">Conciliación · ${esc(inv.nombre || '')}</h2>
      <div>${estadoBadge(inv.estado)}</div></div>
    <div><button class="btn" id="exportConcilBtn">Exportar Excel</button></div>
  </div>
  <div class="grid-3" style="margin-top:16px">
    ${kpi('Esperados', t.esperados)}
    ${kpi('Localizados', t.localizados, '#16a34a')}
    ${kpi('Ubicación incorrecta', t.ubicacion_incorrecta, '#ca8a04')}
    ${kpi('No localizados', t.no_localizados, '#dc2626')}
    ${kpi('No registrados', t.no_registrados, '#7c3aed')}
    ${kpi('Sobrantes', t.sobrantes, '#0e7490')}
  </div>
  <div id="concilTablas" style="margin-top:18px"></div>
</div>`;
    $('backBtn').onclick = renderListShell;
    $('exportConcilBtn').onclick = exportConciliacion;
    renderConcilTablas();
  }

  function tablaConteos(titulo, rows) {
    if (!rows || !rows.length) return `<div class="eyebrow" style="margin-top:14px">${esc(titulo)} (0)</div>`;
    return `<div class="eyebrow" style="margin-top:14px">${esc(titulo)} (${rows.length})</div>
      <div class="table-wrap" style="margin-top:6px"><table><thead><tr><th>Código escaneado</th><th>Activo</th><th>Ubicación encontrada</th><th>Contó</th><th>Fecha</th></tr></thead>
      <tbody>${rows.map(r => `<tr>
        <td>${esc(r.codigo_escaneado || '')}</td>
        <td>${r.activo_codigo ? esc(r.activo_codigo) + (r.activo_nombre ? ' · ' + esc(r.activo_nombre) : '') : '<span class="muted">—</span>'}</td>
        <td>${r.ubicacion_encontrada_clave ? esc(r.ubicacion_encontrada_clave) : '<span class="muted">—</span>'}</td>
        <td>${r.contado_por_nombre ? esc(r.contado_por_nombre) : '<span class="muted">—</span>'}</td>
        <td>${KoguUi.fmtDate(r.created_at)}</td></tr>`).join('')}</tbody></table></div>`;
  }
  function tablaEsperados(titulo, rows) {
    if (!rows || !rows.length) return `<div class="eyebrow" style="margin-top:14px">${esc(titulo)} (0)</div>`;
    return `<div class="eyebrow" style="margin-top:14px">${esc(titulo)} (${rows.length})</div>
      <div class="table-wrap" style="margin-top:6px"><table><thead><tr><th>Código</th><th>Nombre</th><th>Estado</th></tr></thead>
      <tbody>${rows.map(r => `<tr><td><strong>${esc(r.codigo || '')}</strong></td><td>${esc(r.nombre || '')}</td><td>${esc((r.estado || '').replace(/_/g, ' '))}</td></tr>`).join('')}</tbody></table></div>`;
  }
  function renderConcilTablas() {
    const l = concilData.listas || {};
    $('concilTablas').innerHTML =
      tablaConteos('Localizados', l.localizados) +
      tablaConteos('Ubicación incorrecta', l.ubicacion_incorrecta) +
      tablaEsperados('No localizados (esperados sin conteo)', l.no_localizados) +
      tablaConteos('No registrados', l.no_registrados) +
      tablaConteos('Sobrantes', l.sobrantes);
  }

  async function exportConciliacion() {
    await KoguUi.withLoading($('exportConcilBtn'), async () => {
      try {
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
        const t = concilData.totales || {}; const l = concilData.listas || {}; const inv = concilData.inventario || {};
        const wb = window.XLSX.utils.book_new();
        const totRows = Object.entries(t).map(([k, v]) => ({ Categoria: k, Total: v }));
        window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.json_to_sheet(totRows), 'Totales');
        const mapConteo = r => ({ CodigoEscaneado: r.codigo_escaneado || '', ActivoCodigo: r.activo_codigo || '', ActivoNombre: r.activo_nombre || '', UbicacionEncontrada: r.ubicacion_encontrada_clave || '', Conto: r.contado_por_nombre || '', Fecha: r.created_at || '' });
        const mapEsp = r => ({ Codigo: r.codigo || '', Nombre: r.nombre || '', Estado: r.estado || '' });
        const add = (name, rows, mapper) => { if (rows && rows.length) window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.json_to_sheet(rows.map(mapper)), name.slice(0, 31)); };
        add('Localizados', l.localizados, mapConteo);
        add('UbicacionIncorrecta', l.ubicacion_incorrecta, mapConteo);
        add('NoLocalizados', l.no_localizados, mapEsp);
        add('NoRegistrados', l.no_registrados, mapConteo);
        add('Sobrantes', l.sobrantes, mapConteo);
        const nombre = (inv.nombre || 'inventario').replace(/[^a-zA-Z0-9_-]+/g, '-');
        window.XLSX.writeFile(wb, `conciliacion_${nombre}_${new Date().toISOString().slice(0, 10)}.xlsx`);
      } catch (e) { KoguApi.toast(e.message || 'No fue posible exportar.', 'error'); }
    }, 'Exportando…');
  }

  // ── Init ────────────────────────────────────────────────────────────────────
  KoguShell.subscribeEmpresaActivaChange(() => { renderListShell(); });
  renderListShell();
});

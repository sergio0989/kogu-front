// ============================================================
// lab-reactivos.js
// CRUD de Reactivos. Stock + caducidad + status (activo, vencido,
// bloqueado, baja). Sin pivote a parámetros.
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/lab/lab-reactivos.html';
  const BASE = '/protected/lab/maestros/reactivos';
  const PERM = 'screen.lab.maestros';

  const STATUS = [
    { code: 'activo',    label: 'Activo',    color: '#16a34a' },
    { code: 'vencido',   label: 'Vencido',   color: '#dc2626' },
    { code: 'bloqueado', label: 'Bloqueado', color: '#f97316' },
    { code: 'baja',      label: 'Baja',      color: '#94a3b8' },
  ];
  const CADUC = {
    ok:      { label: '✓ Vigente',  bg: '#dcfce7', color: '#166534' },
    pronto:  { label: '⚠ Próximo',  bg: '#fef3c7', color: '#92400e' },
    vencido: { label: '✗ Vencido',  bg: '#fee2e2', color: '#991b1b' },
  };
  const STK = {
    ok:      { label: '✓ OK',      bg: '#dcfce7', color: '#166534' },
    bajo:    { label: '⚠ Bajo',    bg: '#fef3c7', color: '#92400e' },
    agotado: { label: '✗ Agotado', bg: '#fee2e2', color: '#991b1b' },
  };

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Reactivos',
    description: 'Inventario de reactivos del laboratorio con control de caducidad y stock mínimo.',
    requiredPermission: PERM,
  });
  if (!b) return;

  let rows = [];
  let unidades = [];
  let currentPage = 1, pageSize = 25, totalPages = 1, totalRows = 0;
  let editing = null;
  const $ = (id) => document.getElementById(id);

  async function loadUnidades() {
    try {
      const res = await KoguApi.apiFetch('/protected/cat/unidades');
      unidades = KoguApi.unwrapRows(res) || [];
    } catch (_) { unidades = []; }
  }

  const c = document.getElementById('pageContent');
  c.innerHTML = `
<div style="display:flex;gap:4px;border-bottom:1px solid var(--line);margin-bottom:16px">
  <a href="/modules/lab/lab-maestros.html"  style="padding:10px 16px;font-size:14px;color:#64748b;border-bottom:3px solid transparent;text-decoration:none">Parámetros</a>
  <a href="/modules/lab/lab-metodos.html"   style="padding:10px 16px;font-size:14px;color:#64748b;border-bottom:3px solid transparent;text-decoration:none">Métodos</a>
  <a href="/modules/lab/lab-equipos.html"   style="padding:10px 16px;font-size:14px;color:#64748b;border-bottom:3px solid transparent;text-decoration:none">Equipos</a>
  <a href="/modules/lab/lab-reactivos.html" style="padding:10px 16px;font-size:14px;color:#0f172a;font-weight:600;border-bottom:3px solid #0f172a;text-decoration:none">Reactivos</a>
</div>

<div class="card">
  <div class="row">
    <div><div class="eyebrow">Lab QA</div><h2>Reactivos</h2></div>
    <div style="display:flex;gap:8px">
      <button class="btn ghost"   id="refreshBtn">Actualizar</button>
      <button class="btn primary" id="newBtn">+ Nuevo reactivo</button>
    </div>
  </div>

  <div class="grid-2" style="margin-top:14px;gap:10px">
    <input class="input" id="qFil" placeholder="Buscar por clave, nombre, fabricante o lote…"/>
    <select class="select" id="statusFil">
      <option value="activo" selected>Solo activos</option>
      <option value="">Cualquier estado</option>
      <option value="vencido">Vencidos</option>
      <option value="bloqueado">Bloqueados</option>
      <option value="baja">Baja</option>
    </select>
    <label style="display:flex;align-items:center;gap:6px;font-size:13px">
      <input type="checkbox" id="venceFil"/>
      Próximos a vencer (≤ 30 días)
    </label>
    <label style="display:flex;align-items:center;gap:6px;font-size:13px">
      <input type="checkbox" id="stockFil"/>
      Bajo stock mínimo
    </label>
  </div>

  <div class="table-wrap" style="margin-top:14px">
    <table>
      <thead><tr>
        <th>Clave</th>
        <th>Nombre / Fabricante</th>
        <th>Lote</th>
        <th>Caducidad</th>
        <th>Stock</th>
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

  async function load({ showToast = false, resetPage = false } = {}) {
    if (resetPage) currentPage = 1;
    const params = new URLSearchParams();
    params.set('page', String(currentPage));
    params.set('pageSize', String(pageSize));
    const q = $('qFil').value.trim();
    const status = $('statusFil').value;
    if (q) params.set('q', q);
    if (status) params.set('status', status);
    if ($('venceFil').checked) params.set('proximos_a_vencer', 'true');
    if ($('stockFil').checked) params.set('bajo_stock', 'true');
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
      if (showToast) KoguApi.toast('Reactivos actualizados', 'success');
    } catch (err) { KoguApi.toast(err.message, 'error'); }
  }

  function renderRows() {
    const tbody = $('rows');
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--muted)">
        Sin reactivos con los filtros actuales. Click en <strong>+ Nuevo reactivo</strong> para registrar el primero.
      </td></tr>`;
      return;
    }
    tbody.innerHTML = rows.map(r => {
      const st = STATUS.find(s => s.code === r.status) || { label: r.status, color: '#64748b' };
      const cad = r.caducidad_estado ? (CADUC[r.caducidad_estado] || null) : null;
      const stk = r.stock_estado ? (STK[r.stock_estado] || null) : null;
      const cadHtml = r.fecha_caducidad
        ? `${r.fecha_caducidad}${cad ? '<br><span class="chip" style="background:' + cad.bg + ';color:' + cad.color + ';font-size:11px">' + cad.label + '</span>' : ''}`
        : '<span class="muted">—</span>';
      const stockTxt = r.stock_actual != null
        ? `${parseFloat(r.stock_actual).toLocaleString()}${r.unidad_simbolo ? ' ' + r.unidad_simbolo : ''}${r.stock_minimo != null ? `<div class="muted" style="font-size:11px">mín. ${parseFloat(r.stock_minimo).toLocaleString()}</div>` : ''}${stk ? '<div><span class="chip" style="background:' + stk.bg + ';color:' + stk.color + ';font-size:11px">' + stk.label + '</span></div>' : ''}`
        : '<span class="muted">—</span>';
      return `
        <tr>
          <td><strong>${escapeHtml(r.clave)}</strong></td>
          <td>${escapeHtml(r.nombre)}
            ${r.fabricante ? `<div class="muted" style="font-size:11px">${escapeHtml(r.fabricante)}</div>` : ''}
            ${r.presentacion ? `<div class="muted" style="font-size:11px">${escapeHtml(r.presentacion)}</div>` : ''}
          </td>
          <td style="font-size:13px">${escapeHtml(r.lote || '—')}</td>
          <td style="font-size:12px">${cadHtml}</td>
          <td style="font-size:13px">${stockTxt}</td>
          <td><span class="chip" style="background:${st.color}22;color:${st.color}">${st.label}</span></td>
          <td style="text-align:right;white-space:nowrap">
            <button class="btn ghost" data-edit="${r.reactivo_id}">Editar</button>
            ${r.status !== 'baja' ? `<button class="btn ghost danger" data-delete="${r.reactivo_id}">Dar de baja</button>` : ''}
          </td>
        </tr>`;
    }).join('');
    tbody.querySelectorAll('button[data-edit]').forEach(b => b.addEventListener('click', () => abrirEditor(b.dataset.edit)));
    tbody.querySelectorAll('button[data-delete]').forEach(b => b.addEventListener('click', () => confirmarBaja(b.dataset.delete)));
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

  async function abrirEditor(reactivoId = null) {
    editing = null;
    if (reactivoId) {
      try {
        const res = await KoguApi.apiFetch(`${BASE}/${reactivoId}`);
        editing = KoguApi.unwrapData(res);
      } catch (err) { return KoguApi.toast(err.message, 'error'); }
    }
    renderModal();
  }

  function renderModal() {
    const isEdit = !!editing;
    const e = editing || {
      clave: '', nombre: '', presentacion: '', fabricante: '',
      lote: '', fecha_fabricacion: '', fecha_caducidad: '',
      condicion_almacenamiento: '',
      stock_actual: '', stock_minimo: '', unidad_id: '',
      hoja_seguridad_path: '', status: 'activo',
    };
    const unidadOpciones = unidades.map(u =>
      `<option value="${u.unidad_id}" ${e.unidad_id === u.unidad_id ? 'selected' : ''}>${escapeHtml(u.simbolo || '')} ${u.nombre ? '— ' + escapeHtml(u.nombre) : ''}</option>`
    ).join('');

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;overflow:auto';
    overlay.innerHTML = `
      <div style="background:white;border-radius:8px;max-width:720px;width:100%;max-height:95vh;overflow:auto;padding:24px;box-shadow:0 25px 50px rgba(0,0,0,.3)">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px">
          <div><div class="eyebrow">Lab QA</div><h2 style="margin:6px 0 0 0">${isEdit ? 'Editar reactivo' : 'Nuevo reactivo'}</h2></div>
          <button class="btn ghost" id="closeBtn">×</button>
        </div>

        <div class="grid-2" style="gap:10px">
          <div><div class="label-text">Clave *</div>
            <input class="input" id="f_clave" maxlength="30" value="${escapeAttr(e.clave)}" placeholder="ej. NaOH-01"/>
          </div>
          <div><div class="label-text">Estado</div>
            <select class="select" id="f_status">
              ${STATUS.map(s => `<option value="${s.code}" ${e.status === s.code ? 'selected' : ''}>${s.label}</option>`).join('')}
            </select>
          </div>
          <div style="grid-column:1/-1"><div class="label-text">Nombre *</div>
            <input class="input" id="f_nombre" maxlength="200" value="${escapeAttr(e.nombre)}" placeholder="Nombre del reactivo"/>
          </div>
          <div><div class="label-text">Presentación</div>
            <input class="input" id="f_pres" maxlength="150" value="${escapeAttr(e.presentacion || '')}" placeholder="ej. Frasco 500 ml"/>
          </div>
          <div><div class="label-text">Fabricante</div>
            <input class="input" id="f_fab" maxlength="150" value="${escapeAttr(e.fabricante || '')}"/>
          </div>
          <div><div class="label-text">Lote</div>
            <input class="input" id="f_lote" maxlength="80" value="${escapeAttr(e.lote || '')}"/>
          </div>
          <div><div class="label-text">Condición de almacenamiento</div>
            <input class="input" id="f_alm" maxlength="200" value="${escapeAttr(e.condicion_almacenamiento || '')}" placeholder="ej. Refrigerar 2-8°C"/>
          </div>
          <div><div class="label-text">Fecha de fabricación</div>
            <input class="input" type="date" id="f_fab_date" value="${escapeAttr(e.fecha_fabricacion || '')}"/>
          </div>
          <div><div class="label-text">Fecha de caducidad</div>
            <input class="input" type="date" id="f_cad" value="${escapeAttr(e.fecha_caducidad || '')}"/>
          </div>
          <div><div class="label-text">Stock actual</div>
            <input class="input" type="number" step="any" id="f_stk_act" value="${e.stock_actual ?? ''}"/>
          </div>
          <div><div class="label-text">Stock mínimo</div>
            <input class="input" type="number" step="any" id="f_stk_min" value="${e.stock_minimo ?? ''}"/>
          </div>
          <div><div class="label-text">Unidad</div>
            <select class="select" id="f_unid">
              <option value="">— Sin unidad —</option>
              ${unidadOpciones}
            </select>
          </div>
          <div><div class="label-text">Hoja de seguridad (ruta)</div>
            <input class="input" id="f_hoja" maxlength="500" value="${escapeAttr(e.hoja_seguridad_path || '')}" placeholder="ruta S3 o disk"/>
          </div>
        </div>

        <div style="margin-top:20px;display:flex;gap:8px;justify-content:flex-end">
          <button class="btn ghost"   id="cancelBtn">Cancelar</button>
          <button class="btn primary" id="saveBtn">${isEdit ? 'Guardar' : 'Crear reactivo'}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const oQ = s => overlay.querySelector(s);
    const close = () => overlay.remove();
    overlay.addEventListener('click', ev => { if (ev.target === overlay) close(); });
    oQ('#closeBtn').addEventListener('click', close);
    oQ('#cancelBtn').addEventListener('click', close);

    oQ('#saveBtn').addEventListener('click', async () => {
      const body = {
        clave:                    oQ('#f_clave').value.trim(),
        nombre:                   oQ('#f_nombre').value.trim(),
        presentacion:             oQ('#f_pres').value.trim() || null,
        fabricante:               oQ('#f_fab').value.trim() || null,
        lote:                     oQ('#f_lote').value.trim() || null,
        fecha_fabricacion:        oQ('#f_fab_date').value || null,
        fecha_caducidad:          oQ('#f_cad').value || null,
        condicion_almacenamiento: oQ('#f_alm').value.trim() || null,
        stock_actual:             oQ('#f_stk_act').value !== '' ? parseFloat(oQ('#f_stk_act').value) : null,
        stock_minimo:             oQ('#f_stk_min').value !== '' ? parseFloat(oQ('#f_stk_min').value) : null,
        unidad_id:                oQ('#f_unid').value || null,
        hoja_seguridad_path:      oQ('#f_hoja').value.trim() || null,
        status:                   oQ('#f_status').value,
      };
      if (!body.clave)  return KoguApi.toast('Clave es obligatoria.', 'error');
      if (!body.nombre) return KoguApi.toast('Nombre es obligatorio.', 'error');

      try {
        oQ('#saveBtn').disabled = true;
        if (isEdit) {
          await KoguApi.apiFetch(`${BASE}/${editing.reactivo_id}`, { method: 'PUT', body: JSON.stringify(body) });
          KoguApi.toast('Reactivo actualizado', 'success');
        } else {
          await KoguApi.apiFetch(BASE, { method: 'POST', body: JSON.stringify(body) });
          KoguApi.toast('Reactivo creado', 'success');
        }
        close();
        await load();
      } catch (err) {
        oQ('#saveBtn').disabled = false;
        KoguApi.toast(err.message, 'error');
      }
    });
  }

  function confirmarBaja(reactivoId) {
    if (!confirm('¿Dar de baja este reactivo?\n\nQueda como "baja" — puedes reactivarlo editándolo.')) return;
    KoguApi.apiFetch(`${BASE}/${reactivoId}`, { method: 'DELETE' })
      .then(() => { KoguApi.toast('Reactivo dado de baja', 'success'); return load(); })
      .catch(err => KoguApi.toast(err.message, 'error'));
  }

  $('qFil').addEventListener('input', debounce(() => load({ resetPage: true }), 300));
  $('statusFil').addEventListener('change', () => load({ resetPage: true }));
  $('venceFil').addEventListener('change', () => load({ resetPage: true }));
  $('stockFil').addEventListener('change', () => load({ resetPage: true }));
  $('refreshBtn').addEventListener('click', () => load({ showToast: true }));
  $('newBtn').addEventListener('click', () => abrirEditor(null));
  $('pgSize').addEventListener('change', ev => { pageSize = parseInt(ev.target.value, 10) || 25; load({ resetPage: true }); });
  $('pgFirst').addEventListener('click', () => { if (currentPage > 1) { currentPage = 1; load(); } });
  $('pgPrev').addEventListener('click',  () => { if (currentPage > 1) { currentPage--;    load(); } });
  $('pgNext').addEventListener('click',  () => { if (currentPage < totalPages) { currentPage++; load(); } });
  $('pgLast').addEventListener('click',  () => { if (currentPage < totalPages) { currentPage = totalPages; load(); } });
  KoguShell.subscribeEmpresaActivaChange(() => load({ showToast: true, resetPage: true }));

  function escapeHtml(s) { return String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m]); }
  function escapeAttr(s) { return String(s ?? '').replace(/"/g, '&quot;'); }
  function debounce(fn, ms) { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); }; }

  await loadUnidades();
  await load();
});

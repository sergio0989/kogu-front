// ============================================================
// lab-equipos.js
// CRUD de Equipos analíticos. Incluye plan de calibración y
// pivote a parámetros (sin flag predeterminado).
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/lab/lab-equipos.html';
  const BASE = '/protected/lab/maestros/equipos';
  const PERM = 'screen.lab.maestros';

  const STATUS = [
    { code: 'activo',         label: 'Activo',           color: '#16a34a' },
    { code: 'en_calibracion', label: 'En calibración',   color: '#3b82f6' },
    { code: 'fuera_servicio', label: 'Fuera de servicio',color: '#dc2626' },
    { code: 'baja',           label: 'Baja',             color: '#94a3b8' },
  ];
  const CALIB = {
    ok:      { label: '✓ Al día',      bg: '#dcfce7', color: '#166534' },
    pronto:  { label: '⚠ Próxima',     bg: '#fef3c7', color: '#92400e' },
    vencida: { label: '✗ Vencida',     bg: '#fee2e2', color: '#991b1b' },
  };

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Equipos analíticos',
    description: 'Inventario de equipos del laboratorio con plan de calibración.',
    requiredPermission: PERM,
  });
  if (!b) return;

  let rows = [];
  let parametros = [];
  let currentPage = 1, pageSize = 25, totalPages = 1, totalRows = 0;
  let editing = null;
  const $ = (id) => document.getElementById(id);

  async function loadParametros() {
    try {
      const res = await KoguApi.apiFetch('/protected/lab/maestros/parametros?status=activo&pageSize=500');
      parametros = KoguApi.unwrapData(res) || [];
    } catch (_) { parametros = []; }
  }

  const c = document.getElementById('pageContent');
  c.innerHTML = `
<div style="display:flex;gap:4px;border-bottom:1px solid var(--line);margin-bottom:16px">
  <a href="/modules/lab/lab-maestros.html" style="padding:10px 16px;font-size:14px;color:#64748b;border-bottom:3px solid transparent;text-decoration:none">Parámetros</a>
  <a href="/modules/lab/lab-metodos.html"  style="padding:10px 16px;font-size:14px;color:#64748b;border-bottom:3px solid transparent;text-decoration:none">Métodos</a>
  <a href="/modules/lab/lab-equipos.html"  style="padding:10px 16px;font-size:14px;color:#0f172a;font-weight:600;border-bottom:3px solid #0f172a;text-decoration:none">Equipos</a>
  <a href="/modules/lab/lab-reactivos.html" style="padding:10px 16px;font-size:14px;color:#64748b;border-bottom:3px solid transparent;text-decoration:none">Reactivos</a>
</div>

<div class="card">
  <div class="row">
    <div><div class="eyebrow">Lab QA</div><h2>Equipos analíticos</h2></div>
    <div style="display:flex;gap:8px">
      <button class="btn ghost"   id="refreshBtn">Actualizar</button>
      <button class="btn primary" id="newBtn">+ Nuevo equipo</button>
    </div>
  </div>

  <div class="grid-2" style="margin-top:14px;gap:10px">
    <input class="input" id="qFil" placeholder="Buscar por clave, descripción, marca, modelo, serie o ubicación…"/>
    <select class="select" id="statusFil">
      <option value="activo" selected>Solo activos</option>
      <option value="">Cualquier estado</option>
      <option value="en_calibracion">En calibración</option>
      <option value="fuera_servicio">Fuera de servicio</option>
      <option value="baja">Baja</option>
    </select>
  </div>

  <div class="table-wrap" style="margin-top:14px">
    <table>
      <thead><tr>
        <th>Clave</th>
        <th>Descripción</th>
        <th>Marca / Modelo</th>
        <th>Ubicación</th>
        <th>Próx. calibración</th>
        <th>Parámetros</th>
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
      if (showToast) KoguApi.toast('Equipos actualizados', 'success');
    } catch (err) { KoguApi.toast(err.message, 'error'); }
  }

  function renderRows() {
    const tbody = $('rows');
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--muted)">
        Sin equipos con los filtros actuales. Click en <strong>+ Nuevo equipo</strong> para registrar el primero.
      </td></tr>`;
      return;
    }
    tbody.innerHTML = rows.map(e => {
      const st = STATUS.find(s => s.code === e.status) || { label: e.status, color: '#64748b' };
      const calib = e.calibracion_estado ? (CALIB[e.calibracion_estado] || null) : null;
      const calibTxt = e.proxima_calibracion_fecha
        ? `${e.proxima_calibracion_fecha}${calib ? '<br><span class="chip" style="background:' + calib.bg + ';color:' + calib.color + ';font-size:11px">' + calib.label + '</span>' : ''}`
        : '<span class="muted">—</span>';
      const marcaModelo = [e.marca, e.modelo].filter(Boolean).join(' / ') || '—';
      return `
        <tr>
          <td><strong>${escapeHtml(e.clave_equipo)}</strong>
            ${e.numero_serie ? `<div class="muted" style="font-size:11px">S/N: ${escapeHtml(e.numero_serie)}</div>` : ''}
          </td>
          <td>${escapeHtml(e.descripcion)}</td>
          <td style="font-size:13px">${escapeHtml(marcaModelo)}</td>
          <td style="font-size:13px">${escapeHtml(e.ubicacion || '—')}
            ${e.responsable_nombre ? `<div class="muted" style="font-size:11px">${escapeHtml(e.responsable_nombre)}</div>` : ''}
          </td>
          <td style="font-size:12px">${calibTxt}</td>
          <td>${e.parametros_count > 0 ? `<span class="chip" style="background:#e0f2fe;color:#075985">${e.parametros_count}</span>` : '—'}</td>
          <td><span class="chip" style="background:${st.color}22;color:${st.color}">${st.label}</span></td>
          <td style="text-align:right;white-space:nowrap">
            <button class="btn ghost" data-edit="${e.equipo_id}">Editar</button>
            ${e.status !== 'baja' ? `<button class="btn ghost danger" data-delete="${e.equipo_id}">Dar de baja</button>` : ''}
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

  async function abrirEditor(equipoId = null) {
    editing = null;
    if (equipoId) {
      try {
        const res = await KoguApi.apiFetch(`${BASE}/${equipoId}`);
        editing = KoguApi.unwrapData(res);
      } catch (err) { return KoguApi.toast(err.message, 'error'); }
    }
    renderModal();
  }

  function renderModal() {
    const isEdit = !!editing;
    const e = editing || {
      clave_equipo: '', descripcion: '', marca: '', modelo: '', numero_serie: '',
      ubicacion: '', responsable_user_id: '',
      frecuencia_calibracion_dias: '',
      ultima_calibracion_fecha: '', proxima_calibracion_fecha: '',
      status: 'activo', parametros: [],
    };

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;overflow:auto';
    overlay.innerHTML = `
      <div style="background:white;border-radius:8px;max-width:780px;width:100%;max-height:95vh;overflow:auto;padding:24px;box-shadow:0 25px 50px rgba(0,0,0,.3)">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px">
          <div><div class="eyebrow">Lab QA</div><h2 style="margin:6px 0 0 0">${isEdit ? 'Editar equipo' : 'Nuevo equipo'}</h2></div>
          <button class="btn ghost" id="closeBtn">×</button>
        </div>

        <div style="display:flex;gap:4px;border-bottom:1px solid var(--line);margin-bottom:14px">
          <button data-mt="datos"  class="mt" style="border:0;background:transparent;padding:8px 14px;font-size:13px;cursor:pointer;border-bottom:3px solid #0f172a;color:#0f172a;font-weight:600">Datos del equipo</button>
          <button data-mt="calib"  class="mt" style="border:0;background:transparent;padding:8px 14px;font-size:13px;cursor:pointer;border-bottom:3px solid transparent;color:#64748b">Calibración</button>
          <button data-mt="params" class="mt" style="border:0;background:transparent;padding:8px 14px;font-size:13px;cursor:pointer;border-bottom:3px solid transparent;color:#64748b">Parámetros (${(e.parametros || []).length})</button>
        </div>

        <div data-pn="datos">
          <div class="grid-2" style="gap:10px">
            <div><div class="label-text">Clave *</div>
              <input class="input" id="f_clave" maxlength="30" value="${escapeAttr(e.clave_equipo)}" placeholder="ej. BAL-001"/>
            </div>
            <div><div class="label-text">Estado</div>
              <select class="select" id="f_status">
                ${STATUS.map(s => `<option value="${s.code}" ${e.status === s.code ? 'selected' : ''}>${s.label}</option>`).join('')}
              </select>
            </div>
            <div style="grid-column:1/-1"><div class="label-text">Descripción *</div>
              <input class="input" id="f_desc" maxlength="300" value="${escapeAttr(e.descripcion)}" placeholder="Descripción del equipo"/>
            </div>
            <div><div class="label-text">Marca</div>
              <input class="input" id="f_marca" maxlength="100" value="${escapeAttr(e.marca || '')}"/>
            </div>
            <div><div class="label-text">Modelo</div>
              <input class="input" id="f_modelo" maxlength="100" value="${escapeAttr(e.modelo || '')}"/>
            </div>
            <div><div class="label-text">Número de serie</div>
              <input class="input" id="f_serie" maxlength="100" value="${escapeAttr(e.numero_serie || '')}"/>
            </div>
            <div><div class="label-text">Ubicación</div>
              <input class="input" id="f_ubic" maxlength="200" value="${escapeAttr(e.ubicacion || '')}" placeholder="Área / laboratorio"/>
            </div>
          </div>
        </div>

        <div data-pn="calib" style="display:none">
          <div class="grid-2" style="gap:10px">
            <div><div class="label-text">Frecuencia de calibración (días)</div>
              <input class="input" type="number" min="1" id="f_frec" value="${e.frecuencia_calibracion_dias ?? ''}" placeholder="ej. 90, 180, 365"/>
            </div>
            <div><div class="label-text">Última calibración</div>
              <input class="input" type="date" id="f_ult" value="${escapeAttr(e.ultima_calibracion_fecha || '')}"/>
            </div>
            <div><div class="label-text">Próxima calibración</div>
              <input class="input" type="date" id="f_prox" value="${escapeAttr(e.proxima_calibracion_fecha || '')}"/>
            </div>
            <div><div class="label-text">Ruta del certificado</div>
              <input class="input" id="f_cert" maxlength="500" value="${escapeAttr(e.certificado_calibracion_path || '')}" placeholder="ruta S3 o disk"/>
            </div>
          </div>
        </div>

        <div data-pn="params" style="display:none">
          <div class="muted" style="font-size:13px;margin-bottom:8px">
            Marca los parámetros que este equipo mide. La asociación se usa para sugerencias en captura de resultados.
          </div>
          <div id="paramsList" style="display:flex;flex-direction:column;gap:6px"></div>
          ${parametros.length === 0 ? '<div class="muted" style="text-align:center;padding:20px">No hay parámetros activos.</div>' : ''}
        </div>

        <div style="margin-top:20px;display:flex;gap:8px;justify-content:flex-end">
          <button class="btn ghost"   id="cancelBtn">Cancelar</button>
          <button class="btn primary" id="saveBtn">${isEdit ? 'Guardar' : 'Crear equipo'}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const oQ = s => overlay.querySelector(s);
    const close = () => overlay.remove();
    overlay.addEventListener('click', ev => { if (ev.target === overlay) close(); });
    oQ('#closeBtn').addEventListener('click', close);
    oQ('#cancelBtn').addEventListener('click', close);

    overlay.querySelectorAll('.mt').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.mt;
        overlay.querySelectorAll('.mt').forEach(b => {
          const active = b.dataset.mt === tab;
          b.style.borderBottom = active ? '3px solid #0f172a' : '3px solid transparent';
          b.style.color = active ? '#0f172a' : '#64748b';
          b.style.fontWeight = active ? '600' : '400';
        });
        overlay.querySelectorAll('[data-pn]').forEach(p => {
          p.style.display = p.dataset.pn === tab ? 'block' : 'none';
        });
      });
    });

    const sel = new Set((e.parametros || []).map(p => p.parametro_id));
    function renderParamsList() {
      const list = oQ('#paramsList');
      list.innerHTML = parametros.map(p => `
        <label style="display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid var(--line);border-radius:6px;background:${sel.has(p.parametro_id) ? '#f8fafc' : 'white'};cursor:pointer">
          <input type="checkbox" data-pid="${p.parametro_id}" ${sel.has(p.parametro_id) ? 'checked' : ''}/>
          <div style="flex:1">
            <strong>${escapeHtml(p.clave)}</strong> · <span style="font-size:13px">${escapeHtml(p.nombre)}</span>
            <div class="muted" style="font-size:11px">${escapeHtml(p.tipo_parametro || '')}</div>
          </div>
        </label>`).join('');
      list.querySelectorAll('input[data-pid]').forEach(cb => cb.addEventListener('change', ev => {
        const pid = ev.target.dataset.pid;
        if (ev.target.checked) sel.add(pid); else sel.delete(pid);
        renderParamsList();
      }));
    }
    renderParamsList();

    oQ('#saveBtn').addEventListener('click', async () => {
      const body = {
        clave_equipo:   oQ('#f_clave').value.trim(),
        descripcion:    oQ('#f_desc').value.trim(),
        marca:          oQ('#f_marca').value.trim() || null,
        modelo:         oQ('#f_modelo').value.trim() || null,
        numero_serie:   oQ('#f_serie').value.trim() || null,
        ubicacion:      oQ('#f_ubic').value.trim() || null,
        frecuencia_calibracion_dias: oQ('#f_frec').value ? parseInt(oQ('#f_frec').value, 10) : null,
        ultima_calibracion_fecha:    oQ('#f_ult').value || null,
        proxima_calibracion_fecha:   oQ('#f_prox').value || null,
        certificado_calibracion_path: oQ('#f_cert').value.trim() || null,
        status:         oQ('#f_status').value,
        parametros:     Array.from(sel).map(pid => ({ parametro_id: pid })),
      };
      if (!body.clave_equipo) return KoguApi.toast('Clave es obligatoria.', 'error');
      if (!body.descripcion)  return KoguApi.toast('Descripción es obligatoria.', 'error');

      try {
        oQ('#saveBtn').disabled = true;
        if (isEdit) {
          await KoguApi.apiFetch(`${BASE}/${editing.equipo_id}`, { method: 'PUT', body: JSON.stringify(body) });
          KoguApi.toast('Equipo actualizado', 'success');
        } else {
          await KoguApi.apiFetch(BASE, { method: 'POST', body: JSON.stringify(body) });
          KoguApi.toast('Equipo creado', 'success');
        }
        close();
        await load();
      } catch (err) {
        oQ('#saveBtn').disabled = false;
        KoguApi.toast(err.message, 'error');
      }
    });
  }

  function confirmarBaja(equipoId) {
    if (!confirm('¿Dar de baja este equipo?\n\nLos resultados que lo referencian conservan el vínculo. El equipo queda como "baja" — puedes reactivarlo editándolo.')) return;
    KoguApi.apiFetch(`${BASE}/${equipoId}`, { method: 'DELETE' })
      .then(() => { KoguApi.toast('Equipo dado de baja', 'success'); return load(); })
      .catch(err => KoguApi.toast(err.message, 'error'));
  }

  $('qFil').addEventListener('input', debounce(() => load({ resetPage: true }), 300));
  $('statusFil').addEventListener('change', () => load({ resetPage: true }));
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

  await loadParametros();
  await load();
});

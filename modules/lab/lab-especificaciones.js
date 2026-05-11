// ============================================================
// lab-especificaciones.js (V040+)
// Pliegos de especificaciones por cliente.
//
// Modelo: cabecera (folio único, cliente, producto, versión,
// vigencia, status, archivo adjunto, firma) + detalle (N
// parámetros con tipo_evaluacion, límites, redondeo, etc.).
//
// La pantalla muestra LISTA DE PLIEGOS, no parámetros sueltos.
// El modal de edición tiene cabecera + zona de archivo +
// tabla editable de parámetros.
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/lab/lab-especificaciones.html';
  const BASE = '/protected/lab/maestros/especificaciones/pliego';
  const PERM = 'screen.lab.especificaciones';

  const TIPOS = [
    { code: 'rango',              label: 'Rango' },
    { code: 'mayor_igual',        label: 'Mín. (≥)' },
    { code: 'menor_igual',        label: 'Máx. (≤)' },
    { code: 'igual',              label: 'Igual ± tol.' },
    { code: 'cualitativo',        label: 'Cualitativo' },
    { code: 'presencia_ausencia', label: 'Presencia/Ausencia' },
  ];
  const STATUS = [
    { code: 'borrador',    label: 'Borrador',    color: '#94a3b8' },
    { code: 'vigente',     label: 'Vigente',     color: '#16a34a' },
    { code: 'vencida',     label: 'Vencida',     color: '#f59e0b' },
    { code: 'reemplazada', label: 'Reemplazada', color: '#3b82f6' },
    { code: 'obsoleta',    label: 'Obsoleta',    color: '#dc2626' },
  ];
  const REDONDEO = [
    { code: 'round',    label: 'Redondear' },
    { code: 'floor',    label: 'Hacia abajo' },
    { code: 'ceil',     label: 'Hacia arriba' },
    { code: 'truncate', label: 'Truncar' },
    { code: 'none',     label: 'Sin redondeo' },
  ];

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Especificaciones',
    description: 'Pliegos de especificaciones por cliente — cada cliente define qué debe cumplir el producto que le entregamos.',
    requiredPermission: PERM,
  });
  if (!b) return;

  // ── Catálogos en memoria ──────────────────────────────
  let clientes = [];
  let productos = [];
  let parametros = [];
  let metodos = [];
  let unidades = [];

  async function loadCatalogos() {
    try {
      const resCli = await KoguApi.apiFetch('/protected/core/clientes');
      clientes = KoguApi.unwrapRows(resCli) || [];
    } catch (_) { clientes = []; }
    try {
      const resProd = await KoguApi.apiFetch('/protected/cat/productos');
      productos = KoguApi.unwrapRows(resProd) || [];
    } catch (_) { productos = []; }
    try {
      const resParam = await KoguApi.apiFetch('/protected/lab/maestros/parametros?status=activo&pageSize=500');
      parametros = KoguApi.unwrapData(resParam) || [];
    } catch (_) { parametros = []; }
    try {
      const resMet = await KoguApi.apiFetch('/protected/lab/maestros/metodos?status=activo&pageSize=500');
      metodos = KoguApi.unwrapData(resMet) || [];
    } catch (_) { metodos = []; }
    try {
      const resUni = await KoguApi.apiFetch('/protected/cat/unidades');
      unidades = KoguApi.unwrapRows(resUni) || [];
    } catch (_) { unidades = []; }
  }

  // ── Estado ────────────────────────────────────────────
  let rows = [];
  let currentPage = 1, pageSize = 25, totalPages = 1, totalRows = 0;
  let empresaActivaClave = null;  // se resuelve lazy al usar "Sugerir folio"
  const $ = (id) => document.getElementById(id);

  const c = document.getElementById('pageContent');
  c.innerHTML = `
<div class="card">
  <div class="row">
    <div>
      <div class="eyebrow">Lab QA</div>
      <h2>Pliegos de Especificaciones</h2>
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn ghost"   id="refreshBtn">Actualizar</button>
      <button class="btn primary" id="newPliegoBtn">+ Nuevo pliego</button>
    </div>
  </div>

  <div class="grid-2" style="margin-top:14px;gap:10px">
    <div style="display:flex;gap:6px;align-items:center">
      <input class="input" id="cliLabel" readonly placeholder="— Todos los clientes —"
             style="flex:1;cursor:pointer;background:#f8fafc"/>
      <button type="button" class="btn primary" id="cliPickBtn">Cliente…</button>
      <button type="button" class="btn ghost" id="cliClearBtn" title="Limpiar">×</button>
    </div>
    <input type="hidden" id="cliIdFil"/>
    <div style="display:flex;gap:6px;align-items:center">
      <input class="input" id="prodLabel" readonly placeholder="— Cualquier producto —"
             style="flex:1;cursor:pointer;background:#f8fafc"/>
      <button type="button" class="btn ghost" id="prodPickBtn">Producto…</button>
      <button type="button" class="btn ghost" id="prodClearBtn" title="Limpiar">×</button>
    </div>
    <input type="hidden" id="prodIdFil"/>
    <input class="input" id="qFil" placeholder="Buscar por folio, versión, RFC, cliente o producto…"/>
    <select class="select" id="statusFil">
      <option value="" selected>Cualquier estado</option>
      <option value="borrador">Solo borradores</option>
      <option value="vigente">Solo vigentes</option>
      <option value="vencida">Solo vencidas</option>
      <option value="reemplazada">Reemplazadas</option>
      <option value="obsoleta">Obsoletas</option>
    </select>
    <label style="display:flex;align-items:center;gap:6px;font-size:13px">
      <input type="checkbox" id="vigenteFil"/>
      Solo vigentes hoy
    </label>
  </div>

  <div class="table-wrap" style="margin-top:14px">
    <table>
      <thead><tr>
        <th>Folio</th>
        <th>Cliente</th>
        <th>Producto</th>
        <th>Versión</th>
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

  // ── Pickers ───────────────────────────────────────────
  function abrirPickerCliente({ titulo = 'Selecciona el cliente', onSelect }) {
    KoguUi.openSearchPicker({
      title: titulo,
      items: clientes,
      placeholder: 'Buscar por nombre, RFC o cve_cte…',
      columns: [
        { key: 'nombre',  label: 'Nombre',  primary: true },
        { key: 'rfc',     label: 'RFC' },
        { key: 'cve_cte', label: 'cve_cte' },
      ],
      emptyText: 'Sin clientes en esta empresa.',
      onSelect,
    });
  }
  function abrirPickerProducto({ titulo = 'Selecciona el producto', onSelect }) {
    KoguUi.openSearchPicker({
      title: titulo,
      items: productos,
      placeholder: 'Buscar por cve_prod o descripción…',
      columns: [
        { key: 'cve_prod',  label: 'cve_prod',  primary: true },
        { key: 'desc_prod', label: 'Producto' },
      ],
      emptyText: 'Sin productos.',
      onSelect,
    });
  }
  function abrirPickerParametro({ onSelect }) {
    KoguUi.openSearchPicker({
      title: 'Selecciona el parámetro',
      items: parametros,
      placeholder: 'Buscar por clave o nombre…',
      columns: [
        { key: 'clave',  label: 'Clave',  primary: true },
        { key: 'nombre', label: 'Nombre' },
        { key: 'tipo_parametro', label: 'Tipo' },
      ],
      emptyText: 'Sin parámetros activos.',
      onSelect,
    });
  }
  function abrirPickerMetodo({ onSelect }) {
    KoguUi.openSearchPicker({
      title: 'Selecciona el método (opcional)',
      items: metodos,
      placeholder: 'Buscar por clave o nombre…',
      columns: [
        { key: 'clave',  label: 'Clave',  primary: true },
        { key: 'nombre', label: 'Nombre' },
        { key: 'origen', label: 'Origen' },
      ],
      emptyText: 'Sin métodos activos.',
      onSelect,
    });
  }
  function abrirPickerUnidad({ onSelect }) {
    KoguUi.openSearchPicker({
      title: 'Selecciona la unidad (opcional)',
      items: unidades,
      placeholder: 'Buscar por símbolo o nombre…',
      columns: [
        { key: 'simbolo', label: 'Símbolo', primary: true },
        { key: 'nombre',  label: 'Nombre' },
      ],
      emptyText: 'Sin unidades.',
      onSelect,
    });
  }

  // ── Load lista ────────────────────────────────────────
  async function load({ showToast = false, resetPage = false } = {}) {
    if (resetPage) currentPage = 1;
    const params = new URLSearchParams();
    params.set('page', String(currentPage));
    params.set('pageSize', String(pageSize));
    const q = $('qFil').value.trim();
    const cliId = $('cliIdFil').value;
    const prodId = $('prodIdFil').value;
    const status = $('statusFil').value;
    const vigente = $('vigenteFil').checked;
    if (q)      params.set('q', q);
    if (cliId)  params.set('cliente_id', cliId);
    if (prodId) params.set('producto_id', prodId);
    if (status) params.set('status', status);
    if (vigente) params.set('vigente_hoy', 'true');
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
      if (showToast) KoguApi.toast('Pliegos actualizados', 'success');
    } catch (err) { KoguApi.toast(err.message, 'error'); }
  }

  function renderRows() {
    const tbody = $('rows');
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:24px;color:var(--muted)">
        Sin pliegos. Click en <strong>+ Nuevo pliego</strong> para registrar uno.
      </td></tr>`;
      return;
    }
    tbody.innerHTML = rows.map(c => {
      const st = STATUS.find(s => s.code === c.status) || { label: c.status, color: '#64748b' };
      const vigTxt = `${c.vigencia_desde}${c.vigencia_hasta ? ' → ' + c.vigencia_hasta : ' (indef.)'}`;
      const archivo = c.archivo_path
        ? `<a href="#" data-download="${c.cabecera_id}" title="${escapeAttr(c.archivo_nombre_original || '')}" style="color:#2563eb">📄 ${escapeHtml(truncar(c.archivo_nombre_original || 'archivo', 24))}</a>`
        : '<span class="muted">—</span>';
      return `
        <tr>
          <td><strong style="font-family:monospace;font-size:13px">${escapeHtml(c.folio_spec)}</strong></td>
          <td>${escapeHtml(c.cliente_nombre || '—')}
            <div class="muted" style="font-size:11px">${escapeHtml(c.cliente_rfc || '')}</div>
          </td>
          <td>${escapeHtml(c.cve_prod || '—')}
            <div class="muted" style="font-size:11px">${escapeHtml(c.desc_prod || '')}</div>
          </td>
          <td><span class="chip" style="background:#f1f5f9">${escapeHtml(c.version)}</span></td>
          <td style="font-size:12px">${escapeHtml(vigTxt)}</td>
          <td>${c.parametros_count > 0 ? `<span class="chip" style="background:#e0f2fe;color:#075985">${c.parametros_count}</span>` : '<span class="muted">0</span>'}</td>
          <td>${archivo}</td>
          <td><span class="chip" style="background:${st.color}22;color:${st.color}">${st.label}</span></td>
          <td style="text-align:right;white-space:nowrap">
            <button class="btn ghost" data-edit="${c.cabecera_id}">Abrir</button>
            ${c.status === 'borrador' || c.status === 'vigente'
              ? `<button class="btn ghost danger" data-delete="${c.cabecera_id}">Obsoleto</button>` : ''}
          </td>
        </tr>`;
    }).join('');
    tbody.querySelectorAll('button[data-edit]').forEach(b => b.addEventListener('click', () => abrirEditor(b.dataset.edit)));
    tbody.querySelectorAll('button[data-delete]').forEach(b => b.addEventListener('click', () => marcarObsoleto(b.dataset.delete)));
    tbody.querySelectorAll('a[data-download]').forEach(a => a.addEventListener('click', ev => {
      ev.preventDefault();
      descargarArchivo(a.dataset.download);
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

  // ── Descarga de archivo (autenticada) ─────────────────
  async function descargarArchivo(cabeceraId) {
    try {
      const res = await KoguApi.authFetchRaw(`${BASE}/${cabeceraId}/file`, { method: 'GET' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message || 'No se pudo descargar el archivo.');
      }
      const blob = await res.blob();
      const cdHeader = res.headers.get('content-disposition') || '';
      const matchFn = cdHeader.match(/filename="?([^"]+)"?/);
      const filename = matchFn ? decodeURIComponent(matchFn[1]) : `pliego-${cabeceraId}.bin`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) { KoguApi.toast(err.message, 'error'); }
  }

  // ── Modal editor ──────────────────────────────────────
  async function abrirEditor(cabeceraId = null) {
    let cab = null;
    if (cabeceraId) {
      try {
        const res = await KoguApi.apiFetch(`${BASE}/${cabeceraId}`);
        cab = KoguApi.unwrapData(res);
      } catch (err) { return KoguApi.toast(err.message, 'error'); }
    }
    renderModal(cab);
  }

  function renderModal(cab) {
    const isEdit = !!cab;
    const e = cab || {
      cabecera_id: null,
      folio_spec: '',
      cliente_id: $('cliIdFil')?.value || '',
      producto_id: $('prodIdFil')?.value || '',
      version: 'v1',
      vigencia_desde: new Date().toISOString().slice(0, 10),
      vigencia_hasta: '',
      status: 'borrador',
      observaciones: '',
      parametros: [],
    };
    const readonly = (e.status && e.status !== 'borrador' && e.status !== 'vigente');
    const lockMetadata = (e.status === 'vigente');   // vigente: no se cambia folio/cliente/producto/vigencia

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;overflow:auto';
    overlay.innerHTML = `
      <div style="background:white;border-radius:8px;max-width:1100px;width:100%;max-height:95vh;overflow:auto;padding:24px;box-shadow:0 25px 50px rgba(0,0,0,.3)">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px">
          <div>
            <div class="eyebrow">Lab QA · Pliego de especificaciones</div>
            <h2 style="margin:6px 0 0 0">${isEdit ? escapeHtml(e.folio_spec || 'Pliego') : 'Nuevo pliego'}</h2>
            ${isEdit && e.status ? `<span class="chip" style="background:${(STATUS.find(s => s.code === e.status) || {color:'#64748b'}).color}22;color:${(STATUS.find(s => s.code === e.status) || {color:'#64748b'}).color};font-size:11px;margin-top:6px;display:inline-block">${escapeHtml((STATUS.find(s => s.code === e.status) || {label:e.status}).label)}</span>` : ''}
          </div>
          <button class="btn ghost" id="closeBtn">×</button>
        </div>

        ${readonly ? `<div style="background:#fef3c7;color:#78350f;padding:10px;border-radius:6px;margin-bottom:14px;font-size:13px">
          Este pliego está en estado <strong>${escapeHtml(e.status)}</strong> y es de solo lectura. Para cambios, crea una nueva versión.
        </div>` : ''}

        <!-- Sección 1: Identidad -->
        <fieldset style="border:1px solid var(--line);border-radius:6px;padding:12px;margin-bottom:14px" ${readonly ? 'disabled' : ''}>
          <legend style="padding:0 8px;font-size:12px;color:#64748b">Identidad del pliego</legend>
          <div class="grid-2" style="gap:10px">
            <div><div class="label-text">Folio del pliego *</div>
              <div style="display:flex;gap:6px">
                <input class="input" id="f_folio" maxlength="80" value="${escapeAttr(e.folio_spec)}"
                       placeholder="SPEC-EMPRESA-PRODUCTO-CLIENTE-v1"
                       style="flex:1" ${lockMetadata ? 'readonly' : ''}/>
                ${!lockMetadata ? '<button type="button" class="btn ghost" id="genFolioBtn" title="Generar folio según el patrón sugerido a partir de cliente, producto y versión seleccionados">Sugerir</button>' : ''}
              </div>
              <div class="muted" style="font-size:11px;margin-top:4px">Patrón: <code>SPEC-&lt;empresa&gt;-&lt;cve_prod&gt;-&lt;cliente&gt;-v&lt;n&gt;</code></div>
            </div>
            <div><div class="label-text">Versión</div>
              <input class="input" id="f_version" maxlength="20" value="${escapeAttr(e.version)}"
                     placeholder="v1" ${lockMetadata ? 'readonly' : ''}/>
            </div>
            <div>
              <div class="label-text">Cliente *</div>
              <div style="display:flex;gap:6px">
                <input class="input" id="m_cliLabel" readonly placeholder="— Selecciona —"
                       value="${escapeAttr(formatCliente(e.cliente_id))}"
                       style="flex:1;cursor:pointer;background:#f8fafc"/>
                <button type="button" class="btn ghost" id="m_cliPickBtn" ${lockMetadata ? 'disabled' : ''}>Buscar…</button>
              </div>
              <input type="hidden" id="m_cliId" value="${escapeAttr(e.cliente_id || '')}"/>
            </div>
            <div>
              <div class="label-text">Producto *</div>
              <div style="display:flex;gap:6px">
                <input class="input" id="m_prodLabel" readonly placeholder="— Selecciona —"
                       value="${escapeAttr(formatProducto(e.producto_id))}"
                       style="flex:1;cursor:pointer;background:#f8fafc"/>
                <button type="button" class="btn ghost" id="m_prodPickBtn" ${lockMetadata ? 'disabled' : ''}>Buscar…</button>
              </div>
              <input type="hidden" id="m_prodId" value="${escapeAttr(e.producto_id || '')}"/>
            </div>
            <div><div class="label-text">Vigente desde *</div>
              <input class="input" type="date" id="f_desde" value="${escapeAttr(e.vigencia_desde || '')}" ${lockMetadata ? 'readonly' : ''}/>
            </div>
            <div><div class="label-text">Vigente hasta (opcional)</div>
              <input class="input" type="date" id="f_hasta" value="${escapeAttr(e.vigencia_hasta || '')}" placeholder="Indefinido"/>
            </div>
            <div style="grid-column:1/-1"><div class="label-text">Observaciones</div>
              <textarea class="input" id="f_obs" rows="2" maxlength="2000">${escapeHtml(e.observaciones || '')}</textarea>
            </div>
          </div>
        </fieldset>

        <!-- Sección 2: Archivo adjunto -->
        <fieldset style="border:1px solid var(--line);border-radius:6px;padding:12px;margin-bottom:14px">
          <legend style="padding:0 8px;font-size:12px;color:#64748b">Archivo del pliego (PDF/Excel/Word/imagen)</legend>
          ${isEdit ? `
            <div id="archivoBox">
              ${e.archivo_path ? `
                <div style="display:flex;gap:12px;align-items:center;padding:10px;background:#f0fdf4;border:1px solid #86efac;border-radius:6px">
                  <span style="font-size:24px">📄</span>
                  <div style="flex:1">
                    <strong>${escapeHtml(e.archivo_nombre_original)}</strong>
                    <div class="muted" style="font-size:12px">
                      ${escapeHtml(e.archivo_mime || '')} · ${formatBytes(e.archivo_size_bytes)} ·
                      Subido ${e.archivo_uploaded_at ? new Date(e.archivo_uploaded_at).toLocaleString() : '—'}
                      ${e.archivo_uploader_nombre ? ' por ' + escapeHtml(e.archivo_uploader_nombre) : ''}
                    </div>
                  </div>
                  <button type="button" class="btn ghost" id="downloadBtn">Descargar</button>
                  ${!readonly ? '<button type="button" class="btn ghost danger" id="removeFileBtn">Eliminar</button>' : ''}
                </div>
                ${!readonly ? `<div style="margin-top:8px"><label class="btn ghost" style="cursor:pointer">Reemplazar archivo<input type="file" id="fileInput" style="display:none"/></label></div>` : ''}
              ` : `
                ${!readonly ? `
                  <label style="display:flex;flex-direction:column;align-items:center;padding:24px;border:2px dashed #cbd5e1;border-radius:6px;cursor:pointer;background:#f8fafc">
                    <span style="font-size:32px;margin-bottom:6px">⬆</span>
                    <strong>Click para subir archivo</strong>
                    <span class="muted" style="font-size:12px;margin-top:4px">PDF, Excel, Word, imagen — máx. 20 MB</span>
                    <input type="file" id="fileInput" style="display:none" accept=".pdf,.png,.jpg,.jpeg,.webp,.xls,.xlsx,.doc,.docx,.csv,.txt"/>
                  </label>
                ` : '<div class="muted" style="padding:12px">Sin archivo adjunto.</div>'}
              `}
            </div>
          ` : `<div class="muted" style="padding:12px">Guarda el pliego para poder subir su archivo.</div>`}
        </fieldset>

        <!-- Sección 3: Parámetros del pliego -->
        <fieldset style="border:1px solid var(--line);border-radius:6px;padding:12px;margin-bottom:14px" ${readonly ? 'disabled' : ''}>
          <legend style="padding:0 8px;font-size:12px;color:#64748b">Parámetros del pliego</legend>
          <div class="row" style="margin-bottom:10px">
            <div class="muted" style="font-size:12px">
              Cada tarjeta es un parámetro. Click para expandir y capturar/editar. Tipo <strong>Rango</strong> requiere mín y máx; <strong>Cualitativo</strong> requiere valor esperado; etc.
            </div>
            <div style="display:flex;gap:6px">
              <button type="button" class="btn ghost"   id="toggleAllParamsBtn">Expandir todas</button>
              <button type="button" class="btn primary" id="addParamBtn">+ Agregar parámetro</button>
            </div>
          </div>
          <div id="paramsList" style="display:flex;flex-direction:column;gap:8px"></div>
        </fieldset>

        <!-- Acciones -->
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button class="btn ghost"   id="cancelBtn">Cerrar</button>
          ${!readonly ? `<button class="btn primary" id="saveBtn">${isEdit ? 'Guardar cambios' : 'Crear pliego'}</button>` : ''}
          ${e.status === 'borrador' ? `<button class="btn primary" id="firmarBtn" style="background:#16a34a">Firmar y marcar VIGENTE</button>` : ''}
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const oQ = s => overlay.querySelector(s);
    const close = () => overlay.remove();
    overlay.addEventListener('click', ev => { if (ev.target === overlay) close(); });
    oQ('#closeBtn').addEventListener('click', close);
    oQ('#cancelBtn').addEventListener('click', close);

    // Pickers
    // Botón "Sugerir folio" — valida cliente + producto y arma el patrón.
    oQ('#genFolioBtn')?.addEventListener('click', async () => {
      const cliId  = oQ('#m_cliId').value;
      const prodId = oQ('#m_prodId').value;
      const version = (oQ('#f_version').value || '').trim() || 'v1';

      if (!cliId) {
        KoguApi.toast('Selecciona primero el cliente.', 'error');
        return oQ('#m_cliPickBtn')?.click();
      }
      if (!prodId) {
        KoguApi.toast('Selecciona primero el producto.', 'error');
        return oQ('#m_prodPickBtn')?.click();
      }

      // Resolver clave de empresa activa
      let claveEmp = empresaActivaClave;
      if (!claveEmp) {
        try {
          const res = await KoguApi.apiFetch('/protected/core/context/empresa-activa');
          const data = KoguApi.unwrapData(res);
          claveEmp = data?.clave_empresa || data?.empresa?.clave_empresa || 'EMP';
          empresaActivaClave = claveEmp;
        } catch (_) {
          claveEmp = 'EMP';
        }
      }

      const cli  = clientes.find(x => x.cliente_id === cliId);
      const prod = productos.find(x => x.producto_id === prodId);

      // Clave del cliente: prefiere cve_cte, luego primeros 6 del RFC, luego 6 chars del id
      const claveCli = (cli?.cve_cte && String(cli.cve_cte).trim())
        || (cli?.rfc ? String(cli.rfc).slice(0, 6) : null)
        || (cli?.cliente_id ? String(cli.cliente_id).slice(0, 6) : 'CLI');

      const claveProd = (prod?.cve_prod && String(prod.cve_prod).trim()) || 'PROD';

      // Normalizar versión: si trae solo número (ej. "2"), prefija "v"
      const vNorm = /^\d+$/.test(version) ? `v${version}` : (version.startsWith('v') ? version : `v${version}`);

      const folio = `SPEC-${slug(claveEmp)}-${slug(claveProd)}-${slug(claveCli)}-${vNorm}`;
      oQ('#f_folio').value = folio.toUpperCase();
      KoguApi.toast('Folio sugerido aplicado.', 'success');
    });

    oQ('#m_cliPickBtn')?.addEventListener('click', () => abrirPickerCliente({
      onSelect: (cli) => {
        oQ('#m_cliId').value = cli.cliente_id;
        oQ('#m_cliLabel').value = cli.nombre + (cli.rfc ? ' — ' + cli.rfc : '');
      },
    }));
    oQ('#m_cliLabel').addEventListener('click', () => oQ('#m_cliPickBtn')?.click());
    oQ('#m_prodPickBtn')?.addEventListener('click', () => abrirPickerProducto({
      onSelect: (p) => {
        oQ('#m_prodId').value = p.producto_id;
        oQ('#m_prodLabel').value = `${p.cve_prod || ''} — ${p.desc_prod || ''}`.trim();
      },
    }));
    oQ('#m_prodLabel').addEventListener('click', () => oQ('#m_prodPickBtn')?.click());

    // Parámetros editables: estado en memoria + render como cards expandibles
    const paramsState   = (e.parametros || []).map(p => normalizeParamRow(p));
    const paramsOpen    = new Set();   // índices de cards expandidas
    // Las recién agregadas arrancan expandidas; las existentes colapsadas.

    function resumenLimite(p) {
      if (p.tipo_evaluacion === 'rango' && p.lim_min != null && p.lim_max != null) {
        return `${p.lim_min}–${p.lim_max}`;
      }
      if (p.tipo_evaluacion === 'mayor_igual' && p.lim_min != null) return `≥ ${p.lim_min}`;
      if (p.tipo_evaluacion === 'menor_igual' && p.lim_max != null) return `≤ ${p.lim_max}`;
      if (p.tipo_evaluacion === 'igual' && p.objetivo != null) return `= ${p.objetivo}${p.tolerancia ? ' ± ' + p.tolerancia : ''}`;
      if ((p.tipo_evaluacion === 'cualitativo' || p.tipo_evaluacion === 'presencia_ausencia')
          && p.valor_cualitativo_esperado) return `"${p.valor_cualitativo_esperado}"`;
      return '—';
    }

    function renderParamsList() {
      const list = oQ('#paramsList');
      if (!paramsState.length) {
        list.innerHTML = '<div class="muted" style="text-align:center;padding:20px;border:1px dashed var(--line);border-radius:6px">Sin parámetros. Click en <strong>+ Agregar parámetro</strong> para empezar.</div>';
        updateToggleAllLabel();
        return;
      }
      list.innerHTML = paramsState.map((p, i) => cardHtml(p, i)).join('');
      wireCards();
      updateToggleAllLabel();
    }

    function cardHtml(p, i) {
      const isOpen = paramsOpen.has(i);
      const label  = p.parametro_label || formatParametro(p.parametro_id) || '(parámetro sin seleccionar)';
      const tipoLabel = (TIPOS.find(t => t.code === p.tipo_evaluacion) || {}).label || p.tipo_evaluacion;
      const unidadShort = (p.unidad_label || formatUnidad(p.unidad_id) || '').split(' — ')[0];
      const resumen = resumenLimite(p);

      return `
        <div data-card="${i}" style="border:1px solid var(--line);border-radius:6px;background:white;overflow:hidden">
          <!-- Header colapsable -->
          <div data-toggle="${i}" style="display:flex;align-items:center;gap:10px;padding:10px 12px;cursor:pointer;user-select:none;background:${isOpen ? '#f1f5f9' : 'white'}">
            <span style="font-size:12px;color:#64748b;width:14px">${isOpen ? '▼' : '▶'}</span>
            <div style="flex:1">
              <div style="font-size:13px"><strong>${escapeHtml(label)}</strong></div>
              <div class="muted" style="font-size:11px">
                ${escapeHtml(tipoLabel)} · ${escapeHtml(resumen)}${unidadShort ? ' ' + escapeHtml(unidadShort) : ''}
              </div>
            </div>
            <button type="button" class="btn ghost danger" data-remove="${i}" title="Quitar parámetro" style="padding:4px 8px">Quitar</button>
          </div>

          <!-- Cuerpo (solo si expandido) -->
          ${isOpen ? `
            <div style="padding:12px;border-top:1px solid var(--line);background:#fafafa">
              <div class="grid-2" style="gap:10px">
                <div style="grid-column:1/-1">
                  <div class="label-text">Parámetro *</div>
                  <div style="display:flex;gap:6px">
                    <input class="input" data-f="parametro_label" data-row="${i}" readonly
                           value="${escapeAttr(p.parametro_label || formatParametro(p.parametro_id))}"
                           placeholder="— Selecciona un parámetro —"
                           style="flex:1;cursor:pointer;background:#f8fafc"/>
                    <button type="button" class="btn ghost" data-pick="param" data-row="${i}">Buscar parámetro…</button>
                  </div>
                </div>

                <div>
                  <div class="label-text">Tipo de evaluación *</div>
                  <select class="select" data-f="tipo_evaluacion" data-row="${i}">
                    ${TIPOS.map(t => `<option value="${t.code}" ${p.tipo_evaluacion === t.code ? 'selected' : ''}>${t.label}</option>`).join('')}
                  </select>
                </div>
                <div>
                  <div class="label-text">Unidad (opcional)</div>
                  <div style="display:flex;gap:6px">
                    <input class="input" data-f="unidad_label" data-row="${i}" readonly
                           value="${escapeAttr(p.unidad_label || formatUnidad(p.unidad_id))}"
                           placeholder="— Sin unidad —"
                           style="flex:1;cursor:pointer;background:#f8fafc"/>
                    <button type="button" class="btn ghost" data-pick="unidad" data-row="${i}">Buscar…</button>
                  </div>
                </div>

                <!-- Bloque dinámico según tipo -->
                <div style="grid-column:1/-1" data-tipo-block="${i}">
                  ${camposPorTipo(p, i)}
                </div>

                <div>
                  <div class="label-text">Método (opcional)</div>
                  <div style="display:flex;gap:6px">
                    <input class="input" data-f="metodo_label" data-row="${i}" readonly
                           value="${escapeAttr(p.metodo_label || formatMetodo(p.metodo_id))}"
                           placeholder="— Cualquier método —"
                           style="flex:1;cursor:pointer;background:#f8fafc"/>
                    <button type="button" class="btn ghost" data-pick="metodo" data-row="${i}">Buscar…</button>
                  </div>
                </div>
                <div>
                  <div class="label-text">Redondeo / Decimales</div>
                  <div style="display:flex;gap:6px">
                    <select class="select" data-f="redondeo" data-row="${i}" style="flex:1">
                      ${REDONDEO.map(r => `<option value="${r.code}" ${p.redondeo === r.code ? 'selected' : ''}>${r.label}</option>`).join('')}
                    </select>
                    <input class="input" type="number" min="0" max="6" data-f="decimales" data-row="${i}"
                           value="${p.decimales ?? 2}" title="Decimales" style="width:70px"/>
                  </div>
                </div>
              </div>
            </div>
          ` : ''}
        </div>
      `;
    }

    function camposPorTipo(p, i) {
      const t = p.tipo_evaluacion || 'rango';
      const v = (x) => x == null ? '' : x;
      if (t === 'rango') {
        return `
          <div class="grid-2" style="gap:10px">
            <div><div class="label-text">Mínimo *</div>
              <input class="input" type="number" step="any" data-f="lim_min" data-row="${i}" value="${escapeAttr(v(p.lim_min))}"/>
            </div>
            <div><div class="label-text">Máximo *</div>
              <input class="input" type="number" step="any" data-f="lim_max" data-row="${i}" value="${escapeAttr(v(p.lim_max))}"/>
            </div>
          </div>`;
      }
      if (t === 'mayor_igual') {
        return `<div><div class="label-text">Mínimo *</div>
          <input class="input" type="number" step="any" data-f="lim_min" data-row="${i}" value="${escapeAttr(v(p.lim_min))}"/></div>`;
      }
      if (t === 'menor_igual') {
        return `<div><div class="label-text">Máximo *</div>
          <input class="input" type="number" step="any" data-f="lim_max" data-row="${i}" value="${escapeAttr(v(p.lim_max))}"/></div>`;
      }
      if (t === 'igual') {
        return `
          <div class="grid-2" style="gap:10px">
            <div><div class="label-text">Objetivo *</div>
              <input class="input" type="number" step="any" data-f="objetivo" data-row="${i}" value="${escapeAttr(v(p.objetivo))}"/>
            </div>
            <div><div class="label-text">Tolerancia ±</div>
              <input class="input" type="number" step="any" data-f="tolerancia" data-row="${i}" value="${escapeAttr(p.tolerancia ?? 0)}"/>
            </div>
          </div>`;
      }
      if (t === 'cualitativo' || t === 'presencia_ausencia') {
        const ph = t === 'presencia_ausencia' ? 'ausencia/25g, presencia, etc.' : 'claro, sin sedimento, etc.';
        return `<div><div class="label-text">Valor esperado *</div>
          <input class="input" data-f="valor_cualitativo_esperado" data-row="${i}"
                 value="${escapeAttr(p.valor_cualitativo_esperado || '')}" placeholder="${ph}"/></div>`;
      }
      return '';
    }

    function wireCards() {
      // Toggle expand/collapse (click en header)
      oQ('#paramsList').querySelectorAll('[data-toggle]').forEach(el => {
        el.addEventListener('click', ev => {
          // No togglear si el click vino del botón "Quitar"
          if (ev.target.closest('button[data-remove]')) return;
          const i = parseInt(el.dataset.toggle, 10);
          if (paramsOpen.has(i)) paramsOpen.delete(i);
          else                    paramsOpen.add(i);
          renderParamsList();
        });
      });
      // Inputs y selects
      oQ('#paramsList').querySelectorAll('input[data-f], select[data-f]').forEach(el => {
        const update = ev => {
          const idx = parseInt(ev.target.dataset.row, 10);
          const f   = ev.target.dataset.f;
          paramsState[idx][f] = ev.target.value === '' ? null : ev.target.value;
          // Si cambió tipo_evaluacion, re-render del bloque dinámico
          if (f === 'tipo_evaluacion') {
            const block = oQ('#paramsList').querySelector(`[data-tipo-block="${idx}"]`);
            if (block) block.innerHTML = camposPorTipo(paramsState[idx], idx);
            wireCards();   // re-wire los inputs nuevos
          }
        };
        el.addEventListener('input', update);
        el.addEventListener('change', update);
      });
      // Pickers
      oQ('#paramsList').querySelectorAll('button[data-pick]').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = parseInt(btn.dataset.row, 10);
          const what = btn.dataset.pick;
          if (what === 'param') {
            abrirPickerParametro({
              onSelect: (p) => {
                paramsState[idx].parametro_id    = p.parametro_id;
                paramsState[idx].parametro_label = `${p.clave} — ${p.nombre}`;
                renderParamsList();
              },
            });
          } else if (what === 'metodo') {
            abrirPickerMetodo({
              onSelect: (m) => {
                paramsState[idx].metodo_id    = m.metodo_id;
                paramsState[idx].metodo_label = `${m.clave} — ${m.nombre}`;
                renderParamsList();
              },
            });
          } else if (what === 'unidad') {
            abrirPickerUnidad({
              onSelect: (u) => {
                paramsState[idx].unidad_id    = u.unidad_id;
                paramsState[idx].unidad_label = `${u.simbolo || ''} ${u.nombre ? '— ' + u.nombre : ''}`.trim();
                renderParamsList();
              },
            });
          }
        });
      });
      // Click en input readonly de label → abre el picker correspondiente
      oQ('#paramsList').querySelectorAll('input[readonly][data-f]').forEach(el => {
        el.addEventListener('click', () => {
          const idx = el.dataset.row;
          const map = { parametro_label: 'param', metodo_label: 'metodo', unidad_label: 'unidad' };
          const what = map[el.dataset.f];
          if (what) oQ('#paramsList').querySelector(`button[data-pick="${what}"][data-row="${idx}"]`)?.click();
        });
      });
      // Quitar
      oQ('#paramsList').querySelectorAll('button[data-remove]').forEach(btn => {
        btn.addEventListener('click', ev => {
          ev.stopPropagation();
          const idx = parseInt(btn.dataset.remove, 10);
          paramsState.splice(idx, 1);
          // Recalcular paramsOpen tras splice (los índices > idx se corren -1)
          const newOpen = new Set();
          paramsOpen.forEach(o => {
            if (o < idx) newOpen.add(o);
            else if (o > idx) newOpen.add(o - 1);
          });
          paramsOpen.clear();
          newOpen.forEach(v => paramsOpen.add(v));
          renderParamsList();
        });
      });
    }

    function updateToggleAllLabel() {
      const btn = oQ('#toggleAllParamsBtn');
      if (!btn) return;
      const allOpen = paramsState.length > 0 && paramsOpen.size === paramsState.length;
      btn.textContent = allOpen ? 'Colapsar todas' : 'Expandir todas';
    }

    renderParamsList();

    oQ('#addParamBtn')?.addEventListener('click', () => {
      paramsState.push(normalizeParamRow({ tipo_evaluacion: 'rango', redondeo: 'round', decimales: 2 }));
      paramsOpen.add(paramsState.length - 1);  // recién agregado: expandido
      renderParamsList();
    });
    oQ('#toggleAllParamsBtn')?.addEventListener('click', () => {
      const allOpen = paramsState.length > 0 && paramsOpen.size === paramsState.length;
      if (allOpen) paramsOpen.clear();
      else paramsState.forEach((_, i) => paramsOpen.add(i));
      renderParamsList();
    });

    // Archivo
    const fileInput = oQ('#fileInput');
    if (fileInput) {
      fileInput.addEventListener('change', async ev => {
        const file = ev.target.files?.[0];
        if (!file || !cab?.cabecera_id) return;
        await subirArchivo(cab.cabecera_id, file);
        close();
        abrirEditor(cab.cabecera_id);
      });
    }
    oQ('#downloadBtn')?.addEventListener('click', () => descargarArchivo(cab.cabecera_id));
    oQ('#removeFileBtn')?.addEventListener('click', async () => {
      if (!confirm('¿Eliminar el archivo adjunto del pliego?')) return;
      try {
        await KoguApi.apiFetch(`${BASE}/${cab.cabecera_id}/file`, { method: 'DELETE' });
        KoguApi.toast('Archivo eliminado', 'success');
        close();
        abrirEditor(cab.cabecera_id);
      } catch (err) { KoguApi.toast(err.message, 'error'); }
    });

    // Save / Firmar
    oQ('#saveBtn')?.addEventListener('click', async () => {
      await guardar(false);
    });
    oQ('#firmarBtn')?.addEventListener('click', async () => {
      if (!confirm('¿Marcar este pliego como VIGENTE?\n\nUna vez vigente, los parámetros se vuelven inmutables y el sistema lo usará para validar todas las liberaciones a este cliente para este producto.')) return;
      await guardar(true);
    });

    async function guardar(firmar) {
      const body = {
        folio_spec:     oQ('#f_folio').value.trim(),
        version:        oQ('#f_version').value.trim() || 'v1',
        cliente_id:     oQ('#m_cliId').value,
        producto_id:    oQ('#m_prodId').value,
        vigencia_desde: oQ('#f_desde').value || null,
        vigencia_hasta: oQ('#f_hasta').value || null,
        observaciones:  oQ('#f_obs').value.trim() || null,
        parametros:     paramsState.map(toPayloadParam).filter(p => !!p.parametro_id && !!p.tipo_evaluacion),
      };
      if (!body.folio_spec)  return KoguApi.toast('Folio es obligatorio.', 'error');
      if (!body.cliente_id)  return KoguApi.toast('Cliente es obligatorio.', 'error');
      if (!body.producto_id) return KoguApi.toast('Producto es obligatorio.', 'error');

      if (firmar) {
        if (!body.parametros.length) return KoguApi.toast('Agrega al menos un parámetro antes de firmar.', 'error');
        body.status      = 'vigente';
        body.firmado_por = null;            // backend lo toma del user actual si está vacío
        body.fecha_firma = new Date().toISOString();
        // Mandamos firmado_por = user del request usando un truco: dejamos que el backend
        // lo asuma. Si el backend no lo asume, agrégalo en el patch del service.
        const userId = (await KoguApi.apiFetch('/protected/core/context/empresa-activa').catch(() => null))?.data?.user?.user_id;
        if (userId) body.firmado_por = userId;
      }

      try {
        const btn = firmar ? oQ('#firmarBtn') : oQ('#saveBtn');
        if (btn) btn.disabled = true;
        let resultId;
        if (cab?.cabecera_id) {
          await KoguApi.apiFetch(`${BASE}/${cab.cabecera_id}`, { method: 'PUT', body: JSON.stringify(body) });
          resultId = cab.cabecera_id;
          KoguApi.toast(firmar ? 'Pliego firmado y vigente' : 'Pliego actualizado', 'success');
        } else {
          const res = await KoguApi.apiFetch(BASE, { method: 'POST', body: JSON.stringify(body) });
          const created = KoguApi.unwrapData(res);
          resultId = created.cabecera_id;
          KoguApi.toast(firmar ? 'Pliego creado y vigente' : 'Pliego creado', 'success');
        }
        close();
        await load();
      } catch (err) {
        const btn = firmar ? oQ('#firmarBtn') : oQ('#saveBtn');
        if (btn) btn.disabled = false;
        KoguApi.toast(err.message, 'error');
      }
    }
  }

  async function subirArchivo(cabeceraId, file) {
    const fd = new FormData();
    fd.append('archivo', file);
    try {
      const res = await KoguApi.authFetchRaw(`${BASE}/${cabeceraId}/upload`, { method: 'POST', body: fd });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message || `HTTP ${res.status}`);
      }
      KoguApi.toast('Archivo subido', 'success');
    } catch (err) {
      KoguApi.toast(err.message, 'error');
      throw err;
    }
  }

  async function marcarObsoleto(cabeceraId) {
    if (!confirm('¿Marcar este pliego como obsoleto?\n\nNo se podrá usar para validar liberaciones. Los COA ya emitidos no se afectan.')) return;
    try {
      await KoguApi.apiFetch(`${BASE}/${cabeceraId}`, { method: 'DELETE' });
      KoguApi.toast('Pliego marcado como obsoleto', 'success');
      await load();
    } catch (err) { KoguApi.toast(err.message, 'error'); }
  }

  // ── Helpers ───────────────────────────────────────────
  function normalizeParamRow(p) {
    return {
      parametro_id:                p.parametro_id || null,
      parametro_label:             p.parametro_clave ? `${p.parametro_clave} — ${p.parametro_nombre || ''}`.trim() : (p.parametro_label || ''),
      tipo_evaluacion:             p.tipo_evaluacion || 'rango',
      lim_min:                     p.lim_min ?? null,
      lim_max:                     p.lim_max ?? null,
      objetivo:                    p.objetivo ?? null,
      tolerancia:                  p.tolerancia ?? 0,
      valor_cualitativo_esperado:  p.valor_cualitativo_esperado || '',
      metodo_id:                   p.metodo_id || null,
      metodo_label:                p.metodo_clave ? `${p.metodo_clave} — ${p.metodo_nombre || ''}`.trim() : (p.metodo_label || ''),
      unidad_id:                   p.unidad_id || null,
      unidad_label:                p.unidad_simbolo ? `${p.unidad_simbolo}${p.unidad_nombre ? ' — ' + p.unidad_nombre : ''}` : (p.unidad_label || ''),
      redondeo:                    p.redondeo || 'round',
      decimales:                   p.decimales ?? 2,
    };
  }
  function toPayloadParam(p) {
    const numOrNull = v => (v === null || v === '' || v == null) ? null : Number(v);
    return {
      parametro_id:                p.parametro_id,
      tipo_evaluacion:             p.tipo_evaluacion,
      lim_min:                     numOrNull(p.lim_min),
      lim_max:                     numOrNull(p.lim_max),
      objetivo:                    numOrNull(p.objetivo),
      tolerancia:                  numOrNull(p.tolerancia) ?? 0,
      valor_cualitativo_esperado:  p.valor_cualitativo_esperado || null,
      metodo_id:                   p.metodo_id || null,
      unidad_id:                   p.unidad_id || null,
      redondeo:                    p.redondeo || 'round',
      decimales:                   p.decimales == null ? 2 : parseInt(p.decimales, 10),
    };
  }
  function formatCliente(id) {
    if (!id) return '';
    const c = clientes.find(x => x.cliente_id === id);
    return c ? c.nombre + (c.rfc ? ' — ' + c.rfc : '') : '';
  }
  function formatProducto(id) {
    if (!id) return '';
    const p = productos.find(x => x.producto_id === id);
    return p ? `${p.cve_prod || ''} — ${p.desc_prod || ''}`.trim() : '';
  }
  function formatParametro(id) {
    if (!id) return '';
    const p = parametros.find(x => x.parametro_id === id);
    return p ? `${p.clave || ''} — ${p.nombre || ''}`.trim() : '';
  }
  function formatMetodo(id) {
    if (!id) return '';
    const m = metodos.find(x => x.metodo_id === id);
    return m ? `${m.clave || ''} — ${m.nombre || ''}`.trim() : '';
  }
  function formatUnidad(id) {
    if (!id) return '';
    const u = unidades.find(x => x.unidad_id === id);
    return u ? `${u.simbolo || ''}${u.nombre ? ' — ' + u.nombre : ''}`.trim() : '';
  }
  function formatBytes(b) {
    if (!b) return '0 B';
    const u = ['B','KB','MB','GB'];
    let i = 0, v = b;
    while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
    return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${u[i]}`;
  }
  function truncar(s, n) { return s && s.length > n ? s.slice(0, n - 1) + '…' : s; }
  function slug(s) {
    return String(s ?? '')
      .normalize('NFKD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
  function escapeHtml(s) { return String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m]); }
  function escapeAttr(s) { return String(s ?? '').replace(/"/g, '&quot;'); }
  function debounce(fn, ms) { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); }; }

  // ── Wiring filtros + paginación ───────────────────────
  $('qFil').addEventListener('input', debounce(() => load({ resetPage: true }), 300));
  $('statusFil').addEventListener('change', () => load({ resetPage: true }));
  $('vigenteFil').addEventListener('change', () => load({ resetPage: true }));
  $('cliPickBtn').addEventListener('click', () => abrirPickerCliente({
    titulo: 'Filtrar por cliente',
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
  $('prodPickBtn').addEventListener('click', () => abrirPickerProducto({
    titulo: 'Filtrar por producto',
    onSelect: (p) => {
      $('prodIdFil').value = p.producto_id;
      $('prodLabel').value = `${p.cve_prod || ''} — ${p.desc_prod || ''}`.trim();
      load({ resetPage: true });
    },
  }));
  $('prodLabel').addEventListener('click', () => $('prodPickBtn').click());
  $('prodClearBtn').addEventListener('click', () => {
    $('prodIdFil').value = '';
    $('prodLabel').value = '';
    load({ resetPage: true });
  });

  $('refreshBtn').addEventListener('click', () => load({ showToast: true }));
  $('newPliegoBtn').addEventListener('click', () => abrirEditor(null));
  $('pgSize').addEventListener('change', ev => { pageSize = parseInt(ev.target.value, 10) || 25; load({ resetPage: true }); });
  $('pgFirst').addEventListener('click', () => { if (currentPage > 1) { currentPage = 1; load(); } });
  $('pgPrev').addEventListener('click',  () => { if (currentPage > 1) { currentPage--;    load(); } });
  $('pgNext').addEventListener('click',  () => { if (currentPage < totalPages) { currentPage++; load(); } });
  $('pgLast').addEventListener('click',  () => { if (currentPage < totalPages) { currentPage = totalPages; load(); } });
  KoguShell.subscribeEmpresaActivaChange(() => load({ showToast: true, resetPage: true }));

  await loadCatalogos();

  // Pre-poblar filtros desde query (cuando vienes del modal B3 de "spec faltante")
  const qsp = new URLSearchParams(window.location.search);
  if (qsp.get('cliente_id')) {
    const c = clientes.find(x => x.cliente_id === qsp.get('cliente_id'));
    if (c) {
      $('cliIdFil').value = c.cliente_id;
      $('cliLabel').value = c.nombre + (c.rfc ? ' — ' + c.rfc : '');
    }
  }
  if (qsp.get('producto_id')) {
    const p = productos.find(x => x.producto_id === qsp.get('producto_id'));
    if (p) {
      $('prodIdFil').value = p.producto_id;
      $('prodLabel').value = `${p.cve_prod || ''} — ${p.desc_prod || ''}`.trim();
    }
  }
  await load();

  // Si llegamos con cliente+producto, abrir alta automáticamente
  if (qsp.get('cliente_id') && qsp.get('producto_id') && !qsp.get('no_auto')) {
    KoguApi.toast('Captura un nuevo pliego para el cliente y producto preseleccionados.', 'info');
    setTimeout(() => abrirEditor(null), 300);
  }
});

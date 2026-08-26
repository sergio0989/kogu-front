// ============================================================
// lab-imp-facturas-venta.js
// Bandeja de Importación de Facturas de Venta ERP.
// Tabs: Pendientes (default) · Procesadas
// Acción: Crear liberación por fila (lote_id nullable — Opción B).
// POST /protected/lab/facturas-venta/imports  (síncrono, sin polling)
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/lab/lab-imp-facturas-venta.html';
  const PERM = 'screen.lab.facturas_imports';
  const BASE = '/protected/lab';

  const TABS = [
    { code: 'pendiente', label: 'Pendientes', color: '#f59e0b' },
    { code: 'procesada', label: 'Procesadas', color: '#16a34a' },
  ];

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Importación Facturas de Venta ERP',
    description: 'Bandeja de facturas de venta importadas del ERP. Crea una Liberación QA desde cada fila pendiente.',
    requiredPermission: PERM,
  });
  if (!b) return;

  // ── Estado ──────────────────────────────────────
  const STATE_KEY = 'kogu_lab_imp_facturas_state';
  let rows = [];
  let counts = { pendiente: 0, procesada: 0 };
  let currentTab = 'pendiente';
  let currentPage = 1, pageSize = 25, totalPages = 1, totalRows = 0;

  // Restaurar estado previo (tab + pageSize) si existe
  try {
    const saved = JSON.parse(sessionStorage.getItem(STATE_KEY) || '{}');
    if (saved.tab && TABS.some(t => t.code === saved.tab)) currentTab = saved.tab;
    if (saved.pageSize && Number.isFinite(saved.pageSize))  pageSize   = saved.pageSize;
  } catch (_) { /* ignorar */ }

  const $ = (id) => document.getElementById(id);

  // ── Layout ──────────────────────────────────────
  const c = document.getElementById('pageContent');
  c.innerHTML = `
<div class="card">
  <div class="row">
    <div>
      <div class="eyebrow">Lab QA</div>
      <h2>Importación Facturas de Venta ERP</h2>
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn ghost"   id="refreshBtn">Actualizar</button>
      <button class="btn ghost"   id="historyBtn">Historial imports</button>
      <button class="btn primary" id="importBtn">📥 Importar Excel</button>
    </div>
  </div>

  <!-- Aviso Opción B -->
  <div style="margin-top:14px;padding:10px 14px;background:#fef9c3;border:1px solid #fde047;border-radius:6px;font-size:13px;color:#713f12">
    ⚠ <strong>Lote opcional:</strong> si el lote de producción aún no existe en el sistema,
    la liberación se crea igualmente y queda vinculada manualmente después.
    El chip <em>"⏳ Pendiente"</em> indica que el lote no se encontró al procesar.
  </div>

  <!-- Tabs -->
  <div id="tabsBar" style="display:flex;gap:4px;margin-top:14px;border-bottom:2px solid var(--line)"></div>

  <!-- Filtros -->
  <div class="grid-2" style="margin-top:14px;gap:10px">
    <input class="input" id="qFil" placeholder="Buscar por factura, cliente, cve producto, lote…"/>
    <select class="select" id="loteFil">
      <option value="">Lote en Lab: cualquiera</option>
      <option value="con_lote">✓ Con lote en Lab</option>
      <option value="sin_lote">⏳ Sin lote en Lab</option>
    </select>
  </div>

  <!-- Tabla -->
  <div class="table-wrap" style="margin-top:14px">
    <table>
      <thead><tr>
        <th style="width:110px">No. Factura</th>
        <th style="width:95px">Fecha Fac.</th>
        <th>Cliente</th>
        <th>Cve Producto</th>
        <th>Descripción</th>
        <th style="width:120px">Lote ERP</th>
        <th style="width:90px;text-align:right">Cantidad</th>
        <th style="width:110px">Lote en Lab</th>
        <th style="width:110px">Liberación</th>
        <th style="width:100px">Estado</th>
        <th style="text-align:right;white-space:nowrap">Acciones</th>
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

  // ── Tabs ────────────────────────────────────────
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
    bar.querySelectorAll('.lab-tab').forEach(btn =>
      btn.addEventListener('click', () => setTab(btn.dataset.tab)));
  }

  function setTab(tab) {
    currentTab = tab;
    currentPage = 1;
    try { sessionStorage.setItem(STATE_KEY, JSON.stringify({ tab: currentTab, pageSize })); } catch (_) {}
    renderTabs();
    load();
  }

  // ── Carga ───────────────────────────────────────
  async function loadContadores() {
    try {
      const res  = await KoguApi.apiFetch(`${BASE}/imp-facturas-venta/contadores`);
      const data = KoguApi.unwrapData(res) || {};
      // Backend devuelve { pendientes, procesadas } (plural); tabs usan código singular
      counts = {
        pendiente: parseInt(data.pendientes ?? 0, 10),
        procesada: parseInt(data.procesadas  ?? 0, 10),
      };
      renderTabs();
    } catch (_) { /* silencioso */ }
  }

  async function load({ showToast = false, resetPage = false } = {}) {
    if (resetPage) currentPage = 1;
    const params = new URLSearchParams();
    params.set('page', String(currentPage));
    params.set('pageSize', String(pageSize));
    params.set('procesado', currentTab === 'procesada' ? 'true' : 'false');
    const q     = $('qFil').value.trim();
    const lote  = $('loteFil').value;
    if (q)    params.set('q', q);
    if (lote) params.set('lote_status', lote);

    try {
      const res = await KoguApi.apiFetch(`${BASE}/imp-facturas-venta?${params.toString()}`);
      rows      = KoguApi.unwrapData(res) || [];
      const meta = res?.meta || {};
      totalRows   = parseInt(meta.total    ?? rows.length, 10) || 0;
      pageSize    = parseInt(meta.pageSize ?? pageSize, 10) || pageSize;
      currentPage = parseInt(meta.page     ?? currentPage, 10) || 1;
      totalPages  = parseInt(meta.totalPages ?? 1, 10) || 1;
      renderRows();
      renderPag();
      loadContadores();
      if (showToast) KoguApi.toast('Bandeja actualizada', 'success');
    } catch (err) { KoguApi.toast(err.message, 'error'); }
  }

  // ── Render filas ────────────────────────────────
  function renderRows() {
    const tbody = $('rows');
    if (!rows.length) {
      const msg = currentTab === 'pendiente'
        ? 'No hay facturas pendientes. Importa un Excel ERP para empezar.'
        : 'No hay facturas procesadas con los filtros actuales.';
      tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:28px;color:var(--muted)">${msg}</td></tr>`;
      return;
    }
    tbody.innerHTML = rows.map(filaFactura).join('');
    tbody.querySelectorAll('button[data-crear-lib]').forEach(btn =>
      btn.addEventListener('click', () => crearLiberacion(btn.dataset.crearLib)));
  }

  function filaFactura(r) {
    const warnIcon = `<span title="Sin match en catálogo" style="color:#92400e;margin-left:4px;cursor:help">⚠</span>`;

    // tiene_match_* se deriva de si se resolvió el FK en el backend
    const tieneMatchCliente  = r.cliente_id  != null;
    const tieneMatchProducto = r.producto_id != null;

    // Cliente
    const cteBadge = tieneMatchCliente
      ? `<strong>${escapeHtml(r.cliente_nombre || r.cve_cte)}</strong><div class="muted" style="font-size:11px">${escapeHtml(r.cve_cte)}</div>`
      : `<span class="muted">${escapeHtml(r.cve_cte)}</span>${warnIcon}`;

    // Producto
    const prodBadge = tieneMatchProducto
      ? `<strong>${escapeHtml(r.cve_prod)}</strong>`
      : `<strong class="muted">${escapeHtml(r.cve_prod)}</strong>${warnIcon}`;

    // cantidad → columna real en BD (cant_surt es nombre del ERP, no de la tabla staging)
    const cant = r.cantidad != null
      ? `${parseFloat(r.cantidad).toLocaleString()} ${escapeHtml(r.unidad || '')}`
      : '—';

    // Chip "Lote en Lab"
    let loteChip = '';
    if (!r.numero_lote) {
      loteChip = `<span class="chip" style="background:#f1f5f9;color:#64748b;font-size:11px">Sin lote</span>`;
    } else if (r.lote_id) {
      loteChip = `<a href="/modules/lab/lab-lote-detalle.html?id=${r.lote_id}"
                    class="chip" style="background:#dcfce7;color:#166534;font-size:11px;text-decoration:none">✓ En Lab</a>`;
    } else {
      loteChip = `<span class="chip" style="background:#fef3c7;color:#92400e;font-size:11px">⏳ Pendiente</span>`;
    }

    const estadoChip = r.procesado
      ? `<span class="chip" style="background:#dcfce7;color:#166534;font-size:11px">Procesada</span>`
      : `<span class="chip" style="background:#fef3c7;color:#92400e;font-size:11px">Pendiente</span>`;

    const btnStyle = 'padding:4px 8px;font-size:12px';
    let actions = '';
    if (!r.procesado) {
      // PK de la tabla es imp_factura_venta_id (no imp_factura_id)
      actions = `<button class="btn primary" data-crear-lib="${r.imp_factura_venta_id}"
                   style="background:#3b82f6;${btnStyle}" title="Crear liberación QA">＋ Liberación</button>`;
    } else if (r.liberacion_id) {
      actions = `<a class="btn ghost" href="/modules/lab/lab-liberaciones.html?id=${r.liberacion_id}"
                   style="${btnStyle}">Ver liberación</a>`;
    }

    return `
      <tr>
        <td style="font-family:monospace;font-size:12px"><strong>${escapeHtml(r.folio_factura || '—')}</strong></td>
        <td style="font-size:12px">${fmtDate(r.fecha_factura)}</td>
        <td>${cteBadge}</td>
        <td>${prodBadge}</td>
        <td style="font-size:12px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
            title="${escapeHtml(r.desc_prod || r.producto_nombre || '')}">${escapeHtml(truncar(r.desc_prod || r.producto_nombre || '—', 28))}</td>
        <td style="font-family:monospace;font-size:12px">${escapeHtml(r.numero_lote || '—')}</td>
        <td style="text-align:right;font-size:13px;white-space:nowrap">${cant}</td>
        <td>${loteChip}</td>
        <td style="font-size:12px;font-family:monospace">
          ${r.folio_liberacion
            ? `<a href="/modules/lab/lab-liberaciones.html?id=${r.liberacion_id}"
                  style="color:var(--accent);text-decoration:none">${escapeHtml(r.folio_liberacion)}</a>`
            : '<span class="muted">—</span>'}
        </td>
        <td>${estadoChip}
          ${r.fecha_procesamiento ? `<div class="muted" style="font-size:10px;margin-top:2px">${fmtDate(r.fecha_procesamiento)}</div>` : ''}
        </td>
        <td style="text-align:right;white-space:nowrap">${actions}</td>
      </tr>`;
  }

  // ── Crear liberación ─────────────────────────────
  async function crearLiberacion(id) {
    if (!confirm('¿Crear una Liberación QA a partir de esta factura de venta?')) return;
    try {
      const res  = await KoguApi.apiFetch(`${BASE}/imp-facturas-venta/${id}/crear-liberacion`, {
        method: 'POST', body: JSON.stringify({}),
      });
      const data = KoguApi.unwrapData(res);
      if (data.lote_encontrado) {
        KoguApi.toast(`Liberación creada y vinculada al lote ${data.lote_id || ''}`, 'success');
      } else {
        // Opción B: creada sin lote — toast amarillo (usa success con texto de aviso)
        KoguApi.toast('Liberación creada. ⚠ Lote no encontrado — vincular manualmente.', 'success');
      }
      await load();
    } catch (err) { KoguApi.toast(err.message, 'error'); }
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
            <h2 style="margin:6px 0 0 0">Importar Excel de Facturas de Venta</h2>
            <div class="muted" style="font-size:12px;margin-top:6px">
              Sube el reporte ALPHA ERP de ventas. El sistema detecta el encabezado automáticamente.
              Re-importar el mismo archivo es seguro: actualiza datos y <strong>preserva</strong> las ya procesadas.
            </div>
          </div>
          <button class="btn ghost" id="closeBtn">×</button>
        </div>
        <div style="margin-top:16px">
          <input type="file" id="archivoInput" accept=".xlsx,.xls" style="font-size:13px"/>
          <div class="muted" style="font-size:11px;margin-top:6px">Formatos: .xlsx, .xls. Máximo 50 MB.</div>
        </div>
        <div id="importProgress" style="display:none;margin-top:16px;padding:12px;background:#eff6ff;border-radius:6px;font-size:13px;color:#1e40af">
          ⏳ Procesando archivo…
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
        const buffer = await f.arrayBuffer();
        const wb     = XLSX.read(buffer, { type: 'array', cellDates: true });
        const ws     = wb.Sheets[wb.SheetNames[0]];
        if (!ws) throw new Error('El archivo no contiene hojas.');

        // Mandamos array de arrays para que el backend detecte el header
        const rawRows = XLSX.utils.sheet_to_json(ws, { defval: null, raw: true, header: 1 });
        if (!rawRows.length) throw new Error('El archivo no contiene filas.');

        oQ('#importProgress').textContent = `⏳ Enviando ${rawRows.length.toLocaleString()} filas…`;

        // SHA-256 opcional para auditoría
        let sha256 = null;
        try {
          const digest = await crypto.subtle.digest('SHA-256', buffer);
          sha256 = Array.from(new Uint8Array(digest))
            .map(b => b.toString(16).padStart(2, '0')).join('');
        } catch (_) { /* opcional */ }

        const res  = await KoguApi.apiFetch(`${BASE}/facturas-venta/imports`, {
          method: 'POST',
          body: JSON.stringify({
            archivo_nombre: f.name,
            archivo_bytes:  f.size,
            archivo_hash:   sha256,
            rows: rawRows,
          }),
        });
        const data = KoguApi.unwrapData(res);

        oQ('#importProgress').style.display = 'none';
        // Filas que ya generaron liberación: el reimport NO las pisa, así que
        // una corrección del ERP sobre ellas no entró. Antes esto pasaba en
        // silencio y el resumen decía "importadas" igual.
        const yaProcesadas = data?.ya_procesadas ?? 0;
        const hayAdvertencias = (data?.sin_cliente?.length ?? 0) > 0
          || (data?.sin_producto?.length ?? 0) > 0
          || yaProcesadas > 0;
        oQ('#importResult').style.cssText = hayAdvertencias
          ? 'display:block;margin-top:16px;padding:12px;border-radius:6px;font-size:13px;background:#fef9c3;color:#854d0e'
          : 'display:block;margin-top:16px;padding:12px;border-radius:6px;font-size:13px;background:#dcfce7;color:#166534';
        oQ('#importResult').innerHTML = `
          <strong>${hayAdvertencias ? '⚠ Import completado con advertencias' : '✅ Import completado'}</strong><br>
          ${escapeHtml(data?.mensaje_resumen || `${data?.filas_validas ?? '?'} filas procesadas`)}
          ${(data?.sin_cliente?.length ?? 0) > 0 || (data?.sin_producto?.length ?? 0) > 0
              ? `<br><span style="font-size:12px">Las filas con cve_cte o cve_prod sin match importaron sin cliente/producto — vincúlalos desde los catálogos.</span>`
              : ''}
          ${yaProcesadas > 0
              ? `<br><span style="font-size:12px"><strong>${yaProcesadas} fila(s) NO se actualizaron</strong> porque ya generaron su liberación.
                 Si el ERP corrigió alguna de ellas, ese cambio no entró.
                 ${(data?.folios_ya_procesados?.length ?? 0) > 0
                     ? `Facturas: ${escapeHtml(data.folios_ya_procesados.join(', '))}.` : ''}</span>`
              : ''}
        `;
        KoguApi.toast(hayAdvertencias ? 'Import con advertencias' : 'Import completado',
                      hayAdvertencias ? 'warning' : 'success');
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

  // ── Modal historial ─────────────────────────────
  async function abrirModalHistorial() {
    let imports = [];
    try {
      const res = await KoguApi.apiFetch(`${BASE}/facturas-venta/imports?pageSize=50`);
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
          <td style="text-align:center">
            <span class="chip" style="background:${i.estado==='completada'?'#dcfce7':i.estado==='fallida'?'#fee2e2':'#fef3c7'};color:${i.estado==='completada'?'#166534':i.estado==='fallida'?'#991b1b':'#92400e'};font-size:11px">
              ${escapeHtml(i.estado)}
            </span>
          </td>
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
  $('loteFil').addEventListener('change', () => load({ resetPage: true }));
  $('refreshBtn').addEventListener('click', () => load({ showToast: true }));
  $('importBtn').addEventListener('click', abrirModalImport);
  $('historyBtn').addEventListener('click', abrirModalHistorial);
  $('pgSize').addEventListener('change', ev => {
    pageSize = parseInt(ev.target.value, 10) || 25;
    try { sessionStorage.setItem(STATE_KEY, JSON.stringify({ tab: currentTab, pageSize })); } catch (_) {}
    load({ resetPage: true });
  });
  $('pgFirst').addEventListener('click', () => { if (currentPage > 1) { currentPage = 1; load(); } });
  $('pgPrev').addEventListener('click',  () => { if (currentPage > 1) { currentPage--;    load(); } });
  $('pgNext').addEventListener('click',  () => { if (currentPage < totalPages) { currentPage++; load(); } });
  $('pgLast').addEventListener('click',  () => { if (currentPage < totalPages) { currentPage = totalPages; load(); } });

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
  // Sincronizar select con pageSize restaurado de sessionStorage
  if ($('pgSize')) $('pgSize').value = String(pageSize);
  renderTabs();
  await load();
});

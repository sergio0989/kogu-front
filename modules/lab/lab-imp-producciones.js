// ============================================================
// lab-imp-producciones.js
// Bandeja de Importación de Producciones ERP.
// Tabs: Pendientes (default) · Procesadas
// Acciones: Crear lote (pendiente), ver lote (procesada).
// Modal de importación Excel — lee hoja "PT" del ERP.
// POST /protected/lab/producciones/imports  (síncrono, sin polling)
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/lab/lab-imp-producciones.html';
  const PERM = 'screen.lab.producciones_imports';
  const BASE = '/protected/lab';

  const TABS = [
    { code: 'pendiente', label: 'Pendientes', color: '#f59e0b' },
    { code: 'procesada', label: 'Procesadas', color: '#16a34a' },
  ];

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Importación Producciones ERP',
    description: 'Bandeja de lotes de producción importados del ERP. Crea un Lote QA desde cada fila pendiente.',
    requiredPermission: PERM,
  });
  if (!b) return;

  // ── Estado ──────────────────────────────────────
  let rows = [];
  let counts = { pendiente: 0, procesada: 0 };
  let currentTab = 'pendiente';
  let currentPage = 1, pageSize = 25, totalPages = 1, totalRows = 0;

  const $ = (id) => document.getElementById(id);

  // ── Layout ──────────────────────────────────────
  const c = document.getElementById('pageContent');
  c.innerHTML = `
<div class="card">
  <div class="row">
    <div>
      <div class="eyebrow">Lab QA</div>
      <h2>Importación Producciones ERP</h2>
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn ghost"   id="refreshBtn">Actualizar</button>
      <button class="btn ghost"   id="historyBtn">Historial imports</button>
      <button class="btn primary" id="importBtn">📥 Importar Excel</button>
    </div>
  </div>

  <!-- Tabs -->
  <div id="tabsBar" style="display:flex;gap:4px;margin-top:14px;border-bottom:2px solid var(--line)"></div>

  <!-- Filtros -->
  <div class="grid-2" style="margin-top:14px;gap:10px">
    <input class="input" id="qFil" placeholder="Buscar por cve, lote, descripción…"/>
    <select class="select" id="matchFil">
      <option value="">Mapeo: cualquiera</option>
      <option value="sin_match">Sin match en catálogo</option>
    </select>
  </div>

  <!-- Tabla -->
  <div class="table-wrap" style="margin-top:14px">
    <table>
      <thead><tr>
        <th style="width:110px">Ref. OP</th>
        <th>Cve Producto</th>
        <th>Descripción</th>
        <th style="width:130px">Lote Producción</th>
        <th style="width:100px">Fecha Prod.</th>
        <th style="width:100px;text-align:right">Cantidad</th>
        <th style="width:120px">Match Catálogo</th>
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
    renderTabs();
    load();
  }

  // ── Carga ───────────────────────────────────────
  async function loadContadores() {
    try {
      const res  = await KoguApi.apiFetch(`${BASE}/imp-producciones/contadores`);
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
    const match = $('matchFil').value;
    if (q)     params.set('q', q);
    if (match) params.set('sin_match', 'true');

    try {
      const res = await KoguApi.apiFetch(`${BASE}/imp-producciones?${params.toString()}`);
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
        ? 'No hay producciones pendientes. Importa un Excel ERP para empezar.'
        : 'No hay producciones procesadas con los filtros actuales.';
      tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:28px;color:var(--muted)">${msg}</td></tr>`;
      return;
    }
    tbody.innerHTML = rows.map(filaProduccion).join('');
    tbody.querySelectorAll('button[data-crear-lote]').forEach(btn =>
      btn.addEventListener('click', () => crearLote(btn.dataset.crearLote)));
  }

  function filaProduccion(r) {
    const warnIcon = `<span title="Sin match en catálogo" style="color:#92400e;margin-left:4px;cursor:help">⚠</span>`;
    // tiene_match_producto se deriva de si se resolvió el FK en el backend
    const tieneMatchProducto = r.producto_id != null;
    const prodBadge = tieneMatchProducto
      ? `<strong>${escapeHtml(r.cve_prod)}</strong>`
      : `<strong class="muted">${escapeHtml(r.cve_prod)}</strong>${warnIcon}`;
    const cant = r.cantidad != null
      ? `${parseFloat(r.cantidad).toLocaleString()} ${escapeHtml(r.unidad || '')}`
      : '—';
    const matchChip = tieneMatchProducto
      ? `<span class="chip" style="background:#dcfce7;color:#166534;font-size:11px">✓ Mapeado</span>`
      : `<span class="chip" style="background:#fef3c7;color:#92400e;font-size:11px">⚠ Sin match</span>`;
    const estadoChip = r.procesado
      ? `<span class="chip" style="background:#dcfce7;color:#166534;font-size:11px">Procesada</span>`
      : `<span class="chip" style="background:#fef3c7;color:#92400e;font-size:11px">Pendiente</span>`;

    const btnStyle = 'padding:4px 8px;font-size:12px';
    let actions = '';
    if (!r.procesado) {
      actions = `<button class="btn primary" data-crear-lote="${r.imp_produccion_id}"
                   style="background:#16a34a;${btnStyle}" title="Crear lote QA">＋ Crear lote</button>`;
    } else if (r.lote_id) {
      actions = `<a class="btn ghost" href="/modules/lab/lab-lote-detalle.html?id=${r.lote_id}"
                   style="${btnStyle}">Ver lote</a>`;
    }

    return `
      <tr>
        <td style="font-size:12px;font-family:monospace">${escapeHtml(r.referencia_externa || '—')}</td>
        <td>${prodBadge}</td>
        <td style="font-size:12px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
            title="${escapeHtml(r.desc_prod || r.producto_nombre || '')}">${escapeHtml(truncar(r.desc_prod || r.producto_nombre || '—', 35))}</td>
        <td style="font-family:monospace;font-size:12px"><strong>${escapeHtml(r.numero_lote || '—')}</strong></td>
        <td style="font-size:12px">${fmtDate(r.fecha_produccion)}</td>
        <td style="text-align:right;font-size:13px;white-space:nowrap">${cant}</td>
        <td>${matchChip}</td>
        <td>${estadoChip}
          ${r.fecha_procesamiento ? `<div class="muted" style="font-size:10px;margin-top:2px">${fmtDate(r.fecha_procesamiento)}</div>` : ''}
        </td>
        <td style="text-align:right;white-space:nowrap">${actions}</td>
      </tr>`;
  }

  // ── Crear lote ──────────────────────────────────
  async function crearLote(id) {
    if (!confirm('¿Crear un Lote QA a partir de esta producción?')) return;
    try {
      const res  = await KoguApi.apiFetch(`${BASE}/imp-producciones/${id}/crear-lote`, {
        method: 'POST', body: JSON.stringify({}),
      });
      const data = KoguApi.unwrapData(res);
      if (data.creado) {
        KoguApi.toast(`Lote ${data.lote_numero || ''} creado`, 'success');
      } else {
        KoguApi.toast(`Lote ${data.lote_numero || ''} ya existía — fila vinculada`, 'success');
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
            <h2 style="margin:6px 0 0 0">Importar Excel de Producciones</h2>
            <div class="muted" style="font-size:12px;margin-top:6px">
              Sube el reporte ERP de producciones. El sistema lee la hoja <strong>"PT"</strong>
              automáticamente. Re-importar el mismo archivo es seguro: actualiza filas físicas y
              <strong>preserva</strong> las ya procesadas.
            </div>
          </div>
          <button class="btn ghost" id="closeBtn">×</button>
        </div>
        <div style="margin-top:16px">
          <input type="file" id="archivoInput" accept=".xlsx,.xls" style="font-size:13px"/>
          <div class="muted" style="font-size:11px;margin-top:6px">Formatos: .xlsx, .xls. Hoja: PT.</div>
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

        // Busca hoja "PT"; si no existe, usa la primera
        const sheetName = wb.SheetNames.includes('PT') ? 'PT' : wb.SheetNames[0];
        const ws = wb.Sheets[sheetName];
        if (!ws) throw new Error('El archivo no contiene hojas.');

        const rawRows = XLSX.utils.sheet_to_json(ws, { defval: null, raw: true, header: 1 });
        if (!rawRows.length) throw new Error('El archivo no contiene filas.');

        // Hoja PT: arreglo de arrays (header: 1). Mandamos tal cual al backend.
        oQ('#importProgress').textContent = `⏳ Enviando ${rawRows.length.toLocaleString()} filas de hoja "${sheetName}"…`;

        // SHA-256 opcional para auditoría
        let sha256 = null;
        try {
          const digest = await crypto.subtle.digest('SHA-256', buffer);
          sha256 = Array.from(new Uint8Array(digest))
            .map(b => b.toString(16).padStart(2, '0')).join('');
        } catch (_) { /* opcional */ }

        const res  = await KoguApi.apiFetch(`${BASE}/producciones/imports`, {
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
        oQ('#importResult').style.cssText = 'display:block;margin-top:16px;padding:12px;border-radius:6px;font-size:13px;background:#dcfce7;color:#166534';
        oQ('#importResult').innerHTML = `
          <strong>✅ Import completado</strong><br>
          ${escapeHtml(data?.mensaje_resumen || `${data?.filas_validas ?? '?'} filas procesadas`)}
        `;
        KoguApi.toast('Import completado', 'success');
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
      const res = await KoguApi.apiFetch(`${BASE}/producciones/imports?pageSize=50`);
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
  $('matchFil').addEventListener('change', () => load({ resetPage: true }));
  $('refreshBtn').addEventListener('click', () => load({ showToast: true }));
  $('importBtn').addEventListener('click', abrirModalImport);
  $('historyBtn').addEventListener('click', abrirModalHistorial);
  $('pgSize').addEventListener('change', ev => { pageSize = parseInt(ev.target.value, 10) || 25; load({ resetPage: true }); });
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
  renderTabs();
  await load();
});

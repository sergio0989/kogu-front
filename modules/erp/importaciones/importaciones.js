/* ============================================================
   KOGU Multiempresa — ERP Importaciones
   Pantalla: /modules/erp/importaciones/importaciones.html
   Permisos: screen.erp.importaciones
   Descripción: Carga de archivos XLSX para ventas, compras,
                producciones y cobranza. SheetJS parsea en
                frontend; backend recibe JSON rows.
   ============================================================ */
document.addEventListener('DOMContentLoaded', async () => {
  const PAGE  = '/modules/erp/importaciones/importaciones.html';
  const BASE  = '/protected/erp';
  const PERM  = 'screen.erp.importaciones';

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Importaciones ERP',
    description: 'Carga masiva de ventas, compras, producciones y cobranza desde Excel.',
    requiredPermission: PERM
  });
  if (!b) return;

  // ── Layout ────────────────────────────────────────────────
  document.getElementById('pageContent').innerHTML = `
<div class="stack" style="gap:20px">

  <!-- Selector de tipo + zona de carga -->
  <div class="card">
    <div class="row">
      <div>
        <div class="eyebrow">Módulo ERP</div>
        <h2>Nueva importación</h2>
      </div>
    </div>

    <!-- Tabs de tipo -->
    <div class="tabs" style="margin-top:16px" id="tipoTabs">
      <button class="tab active" data-tipo="ventas">Ventas</button>
      <button class="tab" data-tipo="compras">Compras</button>
      <button class="tab" data-tipo="producciones">Producciones</button>
      <button class="tab" data-tipo="cobranza">Cobranza</button>
    </div>

    <!-- Zona de arrastre / selección -->
    <div id="dropZone" style="
      border:2px dashed var(--line);
      border-radius:14px;
      padding:36px 20px;
      text-align:center;
      cursor:pointer;
      transition:border-color .15s,background .15s;
      background:var(--panel2);
      margin-top:4px
    ">
      <div style="font-size:32px;margin-bottom:8px">📂</div>
      <div style="font-weight:700;color:var(--fg)">Arrastra el archivo Excel aquí</div>
      <div class="muted" style="margin-top:4px;font-size:13px">o haz clic para seleccionar un .xlsx o .xls</div>
      <input type="file" id="fileInput" accept=".xlsx,.xls" style="display:none"/>
    </div>

    <!-- Info de columnas esperadas -->
    <div id="columnasInfo" style="margin-top:12px;background:var(--panel2);border-radius:10px;padding:12px 14px;font-size:12px;color:var(--muted);display:none">
      <strong style="color:var(--fg)">Columnas esperadas:</strong>
      <span id="columnasTexto"></span>
    </div>

    <!-- Preview de filas parseadas -->
    <div id="previewSection" style="display:none;margin-top:16px">
      <div class="row">
        <div>
          <div class="eyebrow">Vista previa</div>
          <div id="previewCounter" style="font-size:13px;color:var(--muted)"></div>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn" id="cancelFileBtn">Cancelar</button>
          <button class="btn primary" id="importarBtn">Importar</button>
        </div>
      </div>
      <div class="table-wrap" style="margin-top:12px;max-height:260px;overflow-y:auto">
        <table id="previewTable"><thead id="previewHead"></thead><tbody id="previewBody"></tbody></table>
      </div>
    </div>

    <!-- Barra de progreso -->
    <div id="progressSection" style="display:none;margin-top:16px">
      <div class="row" style="margin-bottom:8px">
        <span style="font-weight:600" id="progressLabel">Importando...</span>
        <span id="progressPct" style="font-size:12px;color:var(--muted)">0%</span>
      </div>
      <div style="height:8px;background:var(--line);border-radius:99px;overflow:hidden">
        <div id="progressBar" style="height:100%;background:#0e7490;border-radius:99px;width:0%;transition:width .3s"></div>
      </div>
      <div id="progressDetail" style="font-size:12px;color:var(--muted);margin-top:6px"></div>
    </div>
  </div>

  <!-- Historial de importaciones -->
  <div class="card">
    <div class="row">
      <div>
        <div class="eyebrow">Historial</div>
        <h2>Importaciones recientes</h2>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <select class="select" id="histTipoFil" style="min-width:130px">
          <option value="">Todos los tipos</option>
          <option value="ventas">Ventas</option>
          <option value="compras">Compras</option>
          <option value="producciones">Producciones</option>
          <option value="cobranza">Cobranza</option>
        </select>
        <button class="btn" id="refreshHistBtn">Actualizar</button>
      </div>
    </div>
    <div class="table-wrap" style="margin-top:16px">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Tipo</th>
            <th>Archivo</th>
            <th>Filas</th>
            <th>Procesadas</th>
            <th>Omitidas</th>
            <th>Errores</th>
            <th>Estado</th>
            <th>Fecha</th>
          </tr>
        </thead>
        <tbody id="histRows"></tbody>
      </table>
    </div>
    <div id="histPager" style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px;align-items:center"></div>
  </div>

</div>`;

  // ── Estado local ──────────────────────────────────────────
  let tipoActivo    = 'ventas';
  let parsedRows    = [];
  let histPage      = 1;
  const HIST_LIMIT  = 20;

  // ── Columnas esperadas por tipo ───────────────────────────
  const COLUMNAS = {
    ventas:       'No_Fact, FechaFact, CveCliente, NombreCliente, RFC_Cliente, Subtotal, IVA, Total, Moneda, TipoCambio, Status_Fac, …',
    compras:      'No_FComp, FechaComp, CveProv, NombreProv, RFC_Prov, Subtotal, IVA, Total, Moneda, TipoCambio, Status_Comp, …',
    producciones: 'No_OrdP, FechaProd, Cve_Art, Descripcion, Lote_P, Cantidad, Rendimiento, CostoMO, CostoFab, CostoInd, …',
    cobranza:     'Num_Cobro, FechaCobro, CveCliente, NombreCliente, No_Fact, Monto_MN, Monto_ME, IVA_MN, IVA_ME, Status, …'
  };

  // ── Tabs de tipo ──────────────────────────────────────────
  document.querySelectorAll('#tipoTabs .tab').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('#tipoTabs .tab').forEach(x => x.classList.remove('active'));
      btn.classList.add('active');
      tipoActivo = btn.dataset.tipo;
      resetFile();
      updateColumnasInfo();
      loadHistorial();
    };
  });

  function updateColumnasInfo() {
    const el = document.getElementById('columnasTexto');
    const sec = document.getElementById('columnasInfo');
    el.textContent = ' ' + (COLUMNAS[tipoActivo] || '');
    sec.style.display = 'block';
  }
  updateColumnasInfo();

  // ── Drop zone ─────────────────────────────────────────────
  const dropZone  = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput');

  dropZone.onclick = () => fileInput.click();

  dropZone.ondragover = (e) => {
    e.preventDefault();
    dropZone.style.borderColor = '#0e7490';
    dropZone.style.background  = 'rgba(14,116,144,.06)';
  };
  dropZone.ondragleave = () => {
    dropZone.style.borderColor = '';
    dropZone.style.background  = '';
  };
  dropZone.ondrop = (e) => {
    e.preventDefault();
    dropZone.style.borderColor = '';
    dropZone.style.background  = '';
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  };

  fileInput.onchange = () => {
    const file = fileInput.files?.[0];
    if (file) handleFile(file);
  };

  // ── Parseo XLSX ───────────────────────────────────────────
  function handleFile(file) {
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      KoguApi.toast('Solo se aceptan archivos .xlsx o .xls', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb   = XLSX.read(e.target.result, { type: 'array', cellDates: true });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const raw  = XLSX.utils.sheet_to_json(ws, { defval: '' });

        if (!raw.length) {
          KoguApi.toast('El archivo no contiene datos.', 'error');
          return;
        }

        // Normalizar nombres de columna: el ERP exporta headers con espacios
        // y/o en PascalCase (Ventas: lowercase con espacios; Cobranza: PascalCase con espacios).
        // trim() + toLowerCase() normaliza ambos casos sin efecto en los que ya son lowercase.
        const data = raw.map(row => {
          const r = {};
          for (const [k, v] of Object.entries(row)) r[k.trim().toLowerCase()] = v;
          return r;
        });

        parsedRows = data;
        dropZone.style.display = 'none';
        renderPreview(file.name, { rows: data, docs: data.length, lineas: data.length });
      } catch (err) {
        KoguApi.toast('Error al leer el archivo: ' + err.message, 'error');
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function renderPreview(fileName, preview) {
    const rows      = preview.rows ?? preview;
    const docs      = preview.docs   ?? rows.length;
    const lineas    = preview.lineas ?? rows.length;
    const headers   = Object.keys(rows[0] || {});
    const MAX_COLS  = 8;
    const colsShown = headers.slice(0, MAX_COLS);
    const hasMore   = headers.length > MAX_COLS;

    const cntTxt = docs !== lineas
      ? `${docs.toLocaleString()} documentos (${lineas.toLocaleString()} líneas) — "${fileName}"`
      : `${lineas.toLocaleString()} filas encontradas — "${fileName}"`;
    document.getElementById('previewCounter').textContent = cntTxt;

    document.getElementById('previewHead').innerHTML =
      `<tr>${colsShown.map(h => `<th>${KoguUi.escapeHtml(String(h))}</th>`).join('')}${hasMore ? '<th>…</th>' : ''}</tr>`;

    const MAX_ROWS = 5;
    document.getElementById('previewBody').innerHTML = rows.slice(0, MAX_ROWS).map(row =>
      `<tr>${colsShown.map(h => `<td>${KoguUi.escapeHtml(String(row[h] ?? ''))}</td>`).join('')}${hasMore ? '<td>…</td>' : ''}</tr>`
    ).join('') + (rows.length > MAX_ROWS ? `<tr><td colspan="${colsShown.length + (hasMore?1:0)}" class="empty">… ${rows.length - MAX_ROWS} filas más</td></tr>` : '');

    document.getElementById('previewSection').style.display = '';
  }

  function resetFile() {
    parsedRows = [];
    fileInput.value = '';
    dropZone.style.display = '';
    document.getElementById('previewSection').style.display  = 'none';
    document.getElementById('progressSection').style.display = 'none';
    document.getElementById('previewHead').innerHTML = '';
    document.getElementById('previewBody').innerHTML = '';
  }

  document.getElementById('cancelFileBtn').onclick = resetFile;

  // ── Importar ──────────────────────────────────────────────
  document.getElementById('importarBtn').onclick = async (e) => {
    if (!parsedRows.length) return;

    const btn = e.target;
    btn.disabled = true;
    btn.textContent = 'Importando...';

    document.getElementById('previewSection').style.display  = 'none';
    document.getElementById('progressSection').style.display = '';
    setProgress(0, 'Agrupando y enviando datos…', '');

    try {
      const archivoNombre = (document.getElementById('previewCounter').textContent.match(/"([^"]+)"/) || [])[1] || 'importacion.xlsx';

      // Modelo flat: enviar filas tal como vienen del Excel, sin agrupar
      const totalLineas = parsedRows.length;
      const payload = {
        archivo_nombre: archivoNombre,
        rows: parsedRows
      };

      setProgress(30, 'Procesando en servidor…',
        `${totalLineas.toLocaleString()} filas`);

      const res = await KoguApi.apiFetch(`${BASE}/importaciones/${tipoActivo}`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      setProgress(100, '¡Importación completada!', '');

      const d   = res?.data || res;
      const tip = tipoActivo.charAt(0).toUpperCase() + tipoActivo.slice(1);
      const msg = `Filas: ${d?.filas_procesadas ?? '?'} | Omitidas: ${d?.filas_omitidas ?? 0} | Errores: ${d?.filas_error ?? 0}`;
      KoguApi.toast(`${tip} importadas. ${msg}`, d?.filas_error > 0 ? 'warning' : 'success');

      setTimeout(() => {
        resetFile();
        loadHistorial();
      }, 1800);

    } catch (err) {
      setProgress(0, 'Error en importación', err.message);
      KoguApi.toast('Error: ' + err.message, 'error');
      document.getElementById('importarBtn').disabled = false;
      document.getElementById('importarBtn').textContent = 'Importar';
    }
  };

  function setProgress(pct, label, detail) {
    document.getElementById('progressBar').style.width   = pct + '%';
    document.getElementById('progressPct').textContent   = pct + '%';
    document.getElementById('progressLabel').textContent = label;
    document.getElementById('progressDetail').textContent = detail;
  }

  // ── Historial ─────────────────────────────────────────────
  async function loadHistorial() {
    const tipo   = document.getElementById('histTipoFil').value;
    const offset = (histPage - 1) * HIST_LIMIT;
    const qs     = new URLSearchParams({ limit: HIST_LIMIT, offset });
    if (tipo) qs.set('tipo', tipo);

    try {
      const res  = await KoguApi.apiFetch(`${BASE}/importaciones?${qs}`);
      const rows = KoguApi.unwrapRows(res);
      const total = res?.data?.total ?? res?.total ?? rows.length;
      renderHistorial(rows, total);
    } catch (_) {
      document.getElementById('histRows').innerHTML =
        '<tr><td colspan="9" class="empty">No se pudo cargar el historial.</td></tr>';
    }
  }

  const STATUS_LABEL = {
    procesando:    { cls: 'neutral',  txt: 'Procesando' },
    completado:    { cls: 'success',  txt: 'Completado' },
    error_parcial: { cls: 'warning',  txt: 'Parcial' },
    error_total:   { cls: 'danger',   txt: 'Error' }
  };

  function renderHistorial(rows, total) {
    if (!rows.length) {
      document.getElementById('histRows').innerHTML =
        '<tr><td colspan="9" class="empty">Sin importaciones registradas.</td></tr>';
      document.getElementById('histPager').innerHTML = '';
      return;
    }

    document.getElementById('histRows').innerHTML = rows.map(r => {
      const s      = STATUS_LABEL[r.status] || { cls: 'neutral', txt: r.status };
      const fec    = r.created_at ? new Date(r.created_at).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : '-';
      const errores = r.filas_error ?? 0;
      const tieneDetalle = errores > 0 && r.detalle_json;

      // Fila principal
      let html = `<tr>
        <td style="color:var(--muted);font-size:12px">${r.id_mov ?? '-'}</td>
        <td><span class="chip-compact">${KoguUi.escapeHtml(r.tipo ?? '-')}</span></td>
        <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${KoguUi.escapeHtml(r.archivo_nombre ?? '')}">${KoguUi.escapeHtml(r.archivo_nombre ?? '-')}</td>
        <td style="text-align:right">${(r.total_filas ?? 0).toLocaleString()}</td>
        <td style="text-align:right;color:#16a34a">${(r.filas_procesadas ?? 0).toLocaleString()}</td>
        <td style="text-align:right;color:var(--muted)">${(r.filas_omitidas ?? 0).toLocaleString()}</td>
        <td style="text-align:right;${errores>0?'color:#dc2626;font-weight:700':''}">${errores.toLocaleString()}</td>
        <td><span class="badge ${s.cls}">${s.txt}</span></td>
        <td style="font-size:12px;color:var(--muted)">
          ${fec}
          ${tieneDetalle ? `<button class="btn" data-toggle-errs="${r.importacion_id}" style="margin-left:8px;font-size:11px;padding:2px 8px">Ver errores</button>` : ''}
        </td>
      </tr>`;

      // Fila de detalle de errores (oculta por defecto)
      if (tieneDetalle) {
        let detalles;
        try { detalles = typeof r.detalle_json === 'string' ? JSON.parse(r.detalle_json) : r.detalle_json; }
        catch(_) { detalles = []; }
        html += `<tr class="err-detail-row" id="errs-${r.importacion_id}" style="display:none">
          <td colspan="9" style="padding:0">
            <div style="background:#fff1f2;border-left:3px solid #dc2626;padding:12px 16px;font-size:12px">
              <div style="font-weight:700;color:#dc2626;margin-bottom:8px">Detalle de ${errores} error${errores>1?'es':''}</div>
              <table style="width:100%;border-collapse:collapse">
                <thead><tr style="color:var(--muted)"><th style="text-align:left;padding:4px 8px">Fila</th><th style="text-align:left;padding:4px 8px">Folio / Ref.</th><th style="text-align:left;padding:4px 8px">Error</th></tr></thead>
                <tbody>${detalles.map(e => `
                  <tr style="border-top:1px solid rgba(220,38,38,.15)">
                    <td style="padding:4px 8px;color:var(--muted)">${e.fila ?? '-'}</td>
                    <td style="padding:4px 8px;font-family:monospace">${KoguUi.escapeHtml(String(e.folio ?? e.no_fcomp ?? e.no_ordp ?? e.num_cobro ?? '-'))}</td>
                    <td style="padding:4px 8px;color:#dc2626">${KoguUi.escapeHtml(e.error ?? '-')}</td>
                  </tr>`).join('')}
                </tbody>
              </table>
            </div>
          </td>
        </tr>`;
      }
      return html;
    }).join('');

    // Toggle de detalle de errores
    document.querySelectorAll('[data-toggle-errs]').forEach(btn => {
      btn.onclick = () => {
        const id  = btn.dataset.toggleErrs;
        const row = document.getElementById(`errs-${id}`);
        if (!row) return;
        const visible = row.style.display !== 'none';
        row.style.display = visible ? 'none' : '';
        btn.textContent   = visible ? 'Ver errores' : 'Ocultar errores';
      };
    });

    // Paginador
    const pages = Math.ceil(total / HIST_LIMIT);
    if (pages > 1) {
      document.getElementById('histPager').innerHTML = `
        <span style="font-size:12px;color:var(--muted)">${total.toLocaleString()} registros</span>
        <button class="btn" id="prevHistBtn" ${histPage<=1?'disabled':''}>‹ Ant.</button>
        <span style="font-size:13px;font-weight:600">${histPage} / ${pages}</span>
        <button class="btn" id="nextHistBtn" ${histPage>=pages?'disabled':''}>Sig. ›</button>`;
      document.getElementById('prevHistBtn').onclick = () => { histPage--; loadHistorial(); };
      document.getElementById('nextHistBtn').onclick = () => { histPage++; loadHistorial(); };
    } else {
      document.getElementById('histPager').innerHTML = '';
    }
  }

  document.getElementById('refreshHistBtn').onclick  = () => { histPage = 1; loadHistorial(); };
  document.getElementById('histTipoFil').onchange    = () => { histPage = 1; loadHistorial(); };

  // Refrescar al cambiar empresa
  KoguShell.subscribeEmpresaActivaChange(async () => {
    resetFile();
    histPage = 1;
    await loadHistorial();
  });

  await loadHistorial();
});

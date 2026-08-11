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

  // Permiso que gobierna el cierre de periodos y, por extensión, la carga
  // ACUMULADA (año completo). Se resuelve aquí arriba porque el selector de
  // mes lo necesita para decidir si ofrece la opción "Acumulado".
  const PUEDE_CERRAR = (b?.permissions || []).includes('erp.periodo.cerrar');

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

    <!-- Modo de carga (solo Ventas) -->
    <div id="modoVentasBox" style="margin-top:12px;border:1px solid var(--line);border-radius:10px;padding:10px 14px;background:var(--bg-soft,#f8fafc)">
      <div style="font-size:12px;color:var(--muted);margin-bottom:6px">Modo de carga (Ventas)</div>
      <label style="display:block;font-size:13px;cursor:pointer;margin-bottom:4px">
        <input type="radio" name="modoVentas" value="periodo" checked /> <strong>Periodo</strong> — el archivo es el mes completo: compara contra lo cargado y da de baja lo que ya no existe en el ERP <em>(recomendado)</em>
      </label>
      <label style="display:block;font-size:13px;cursor:pointer;margin-bottom:4px">
        <input type="radio" name="modoVentas" value="reemplazar" /> Reemplazar por documento — reemplaza cada factura del archivo (modo anterior)
      </label>
      <label style="display:block;font-size:13px;cursor:pointer">
        <input type="radio" name="modoVentas" value="agregar" /> Agregar — no destructivo: solo añade líneas nuevas (re-imports parciales)
      </label>

      <div id="periodoBox" style="margin-top:10px;padding-top:10px;border-top:1px dashed var(--line)">
        <div style="font-size:12px;color:var(--muted);margin-bottom:6px">
          Periodo que cubre el archivo — se <strong>declara</strong>, no se deduce: así un archivo incompleto se delata como bajas en el análisis.
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <select class="select" id="periodoAnio" style="min-width:110px"></select>
          <select class="select" id="periodoMes" style="min-width:140px"></select>
          <span id="periodoRango" style="font-size:12px;color:var(--muted)"></span>
        </div>
        <div id="acumAviso" style="display:none;margin-top:8px;border:1px solid #b45309;background:rgba(180,83,9,.06);border-radius:8px;padding:8px 10px;font-size:12px;color:#b45309">
          <strong>Acumulado:</strong> el archivo se trata como el año completo, pero <strong>solo se tocan los meses que trae</strong>. Un mes que no venga en el archivo no se modifica — se te reporta aparte. Al aplicar se pedirá motivo y confirmación.
        </div>
      </div>
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

    <!-- Analisis del periodo (diff) -->
    <div id="diffSection" style="display:none;margin-top:16px">
      <div class="row">
        <div>
          <div class="eyebrow">Análisis del periodo</div>
          <h3 id="diffTitulo" style="margin:2px 0 0">—</h3>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn" id="diffDescartarBtn">Descartar</button>
          <button class="btn primary" id="diffAplicarBtn">Aplicar cambios</button>
        </div>
      </div>

      <div id="diffAvisos" style="margin-top:12px"></div>

      <div id="diffMetrics" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin-top:12px"></div>
      <!-- Desglose por mes (solo acumulado) -->
      <div id="diffPorMesWrap" style="margin-top:14px;display:none">
        <div style="font-size:12px;color:var(--muted);margin-bottom:6px">
          Un renglón por mes. El acumulado <strong>solo toca los meses que trae el archivo</strong>; dentro de cada uno, lo que ya no viene se da de baja igual que en una carga mensual.
        </div>
        <div class="table-wrap" style="max-height:340px;overflow-y:auto">
          <table>
            <thead><tr>
              <th>Mes</th>
              <th class="num">Archivo</th>
              <th class="num">Sin cambio</th>
              <th class="num">Altas</th>
              <th class="num">Bajas</th>
              <th class="num">Antes</th>
              <th class="num">Después</th>
              <th class="num">Δ</th>
            </tr></thead>
            <tbody id="diffPorMesBody"></tbody>
          </table>
        </div>
      </div>

      <!-- Meses con datos que el archivo NO trae -->
      <div id="diffAusentesWrap" style="margin-top:14px;display:none">
        <div style="font-size:12px;color:var(--muted);margin-bottom:6px">
          Meses con datos en KOGU que <strong>no vienen en el archivo</strong>. No se van a tocar. Si el archivo debía traerlos, el periodo o el archivo están mal.
        </div>
        <div id="diffAusentes"></div>
      </div>

      <!-- Candado de la carga acumulada -->
      <div id="diffCandado" style="display:none;margin-top:14px;border:1px solid #b45309;background:rgba(180,83,9,.06);border-radius:12px;padding:14px">
        <div style="font-weight:700;color:#b45309">Confirmación requerida — carga acumulada</div>
        <div style="font-size:12px;color:var(--muted);margin:2px 0 10px">
          Vas a reescribir varios meses de un año en una sola operación. El motivo queda registrado en la importación y en cada línea dada de baja.
        </div>
        <div style="display:grid;grid-template-columns:1fr 220px;gap:10px;align-items:start">
          <div>
            <div class="label-text" style="font-size:11px;margin-bottom:4px">Motivo</div>
            <textarea id="candadoMotivo" rows="2" style="width:100%;box-sizing:border-box;border:1px solid var(--line);border-radius:8px;padding:8px;font:inherit" placeholder="Ej. carga histórica del ejercicio"></textarea>
          </div>
          <div>
            <div class="label-text" style="font-size:11px;margin-bottom:4px">Escribe <strong id="candadoAnio">—</strong> para confirmar</div>
            <input class="input" id="candadoConfirma" style="width:100%;box-sizing:border-box" placeholder="Año" inputmode="numeric" autocomplete="off"/>
          </div>
        </div>
        <div id="candadoCerradosWrap" style="display:none;margin-top:10px;border-top:1px dashed #b45309;padding-top:10px">
          <label style="display:flex;gap:8px;align-items:flex-start;font-size:13px;cursor:pointer;color:#dc2626">
            <input type="checkbox" id="candadoForzar" style="margin-top:3px"/>
            <span>El archivo toca meses <strong>CERRADOS</strong> (<span id="candadoCerradosTxt"></span>). Entiendo que se reabrirán y quedará registro de quién y por qué.</span>
          </label>
        </div>
      </div>

      <div id="diffDetalleWrap" style="margin-top:14px;display:none">
        <div style="font-size:12px;color:var(--muted);margin-bottom:6px">
          Documentos afectados (los de <strong>baja</strong> desaparecieron del ERP: cancelados, re-emitidos o ausentes del archivo).
        </div>
        <div class="table-wrap" style="max-height:300px;overflow-y:auto">
          <table>
            <thead><tr><th>Tipo</th><th>Folio</th><th>Fecha</th><th>Cliente</th><th class="num">Líneas</th><th class="num">Cantidad</th><th class="num">Importe</th></tr></thead>
            <tbody id="diffDetalleBody"></tbody>
          </table>
        </div>
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

  <!-- Cierre de periodos (solo Ventas) -->
  <div class="card" id="periodosCard" style="display:none">
    <div class="row">
      <div>
        <div class="eyebrow">Control</div>
        <h2>Periodos de ventas</h2>
        <div style="font-size:13px;color:var(--muted);margin-top:2px">
          Cerrar un mes congela su foto. Si después alguien lo recarga, el sistema lo bloquea y aquí se ve si la cifra se movió.
        </div>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <select class="select" id="perAnio" style="min-width:110px"></select>
        <button class="btn" id="perRefreshBtn">Actualizar</button>
      </div>
    </div>

    <div id="perAviso" style="margin-top:12px"></div>

    <div class="table-wrap" style="margin-top:12px">
      <table>
        <thead>
          <tr>
            <th>Mes</th>
            <th class="num">Líneas</th>
            <th class="num">Cantidad</th>
            <th class="num">Importe</th>
            <th>Estado</th>
            <th>Cerrado</th>
            <th class="num">Δ vs cierre</th>
            <th style="text-align:right">Acciones</th>
          </tr>
        </thead>
        <tbody id="perBody"><tr><td colspan="8" class="empty">Cargando…</td></tr></tbody>
      </table>
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
      updateModoBox();
      loadHistorial();
      if (tipoActivo === 'ventas') loadPeriodos();
    };
  });

  function updateModoBox() {
    const box = document.getElementById('modoVentasBox');
    if (box) box.style.display = tipoActivo === 'ventas' ? '' : 'none';
    // El cierre de periodo hoy aplica solo a ventas (entidad 'erp_ventas').
    const pc = document.getElementById('periodosCard');
    if (pc) pc.style.display = tipoActivo === 'ventas' ? '' : 'none';
    updatePeriodoBox();
  }

  // ── Periodo declarado (modo 'periodo') ────────────────────────────────────
  const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                 'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  let previewImportacionId = null;

  function modoVentasActual() {
    const el = document.querySelector('input[name="modoVentas"]:checked');
    return el ? el.value : 'periodo';
  }

  function updatePeriodoBox() {
    const box = document.getElementById('periodoBox');
    if (!box) return;
    box.style.display = (tipoActivo === 'ventas' && modoVentasActual() === 'periodo') ? '' : 'none';
    updatePeriodoRango();
  }

  /** Mes declarado: 1-12, o 'ACUM' para el año completo. */
  function mesPeriodoActual() {
    const v = document.getElementById('periodoMes')?.value;
    return v === 'ACUM' ? 'ACUM' : parseInt(v, 10);
  }

  function updatePeriodoRango() {
    const a  = parseInt(document.getElementById('periodoAnio')?.value, 10);
    const m  = mesPeriodoActual();
    const el = document.getElementById('periodoRango');
    const av = document.getElementById('acumAviso');
    if (!el || !a) return;
    if (m === 'ACUM') {
      el.textContent = `Se comparará ${a}-01-01 … ${a}-12-31, mes por mes`;
      if (av) av.style.display = '';
      return;
    }
    if (av) av.style.display = 'none';
    if (!m) return;
    const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
    const pad = (n) => String(n).padStart(2, '0');
    el.textContent = `Se comparará todo ${a}-${pad(m)}-01 … ${a}-${pad(m)}-${pad(ultimo)}`;
  }

  (function initPeriodoSelectores() {
    const selA = document.getElementById('periodoAnio');
    const selM = document.getElementById('periodoMes');
    if (!selA || !selM) return;
    const hoy = new Date();
    const anioActual = hoy.getUTCFullYear();
    // Mes anterior por defecto: es el que normalmente se está cargando.
    let anioDef = anioActual, mesDef = hoy.getUTCMonth();   // 0-based → mes anterior 1-based
    if (mesDef === 0) { mesDef = 12; anioDef = anioActual - 1; }

    selA.innerHTML = '';
    for (let a = anioActual + 1; a >= anioActual - 5; a--) {
      selA.innerHTML += `<option value="${a}"${a === anioDef ? ' selected' : ''}>${a}</option>`;
    }
    // La opción Acumulado solo se ofrece a quien puede cerrar periodos: una
    // carga anual reescribe varios meses de una sentada.
    selM.innerHTML = MESES
      .map((nom, i) => `<option value="${i + 1}"${(i + 1) === mesDef ? ' selected' : ''}>${nom}</option>`)
      .join('') + (PUEDE_CERRAR ? '<option value="ACUM">Acumulado — todo el año</option>' : '');

    selA.onchange = updatePeriodoRango;
    selM.onchange = updatePeriodoRango;
    updatePeriodoRango();
  })();

  document.querySelectorAll('input[name="modoVentas"]').forEach(r => {
    r.addEventListener('change', updatePeriodoBox);
  });

  updateModoBox();

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
    const ds = document.getElementById('diffSection');
    if (ds) ds.style.display = 'none';
    ['diffPorMesWrap', 'diffAusentesWrap', 'diffCandado', 'candadoCerradosWrap'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
    previewImportacionId = null;
    const ib = document.getElementById('importarBtn');
    if (ib) { ib.disabled = false; ib.textContent = 'Importar'; }
  }

  document.getElementById('cancelFileBtn').onclick = resetFile;

  // ── Importar ──────────────────────────────────────────────
  document.getElementById('importarBtn').onclick = async (e) => {
    if (!parsedRows.length) return;

    // Modo periodo: primero se ANALIZA (no toca erp_ventas) y el usuario
    // confirma el diff. Es lo que evita que un archivo parcial borre datos.
    if (tipoActivo === 'ventas' && modoVentasActual() === 'periodo') {
      return analizarPeriodo(e.target);
    }

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
      // Modo solo aplica a ventas: 'reemplazar' (reemplaza factura completa)
      // o 'agregar' (no destructivo: solo agrega líneas nuevas).
      if (tipoActivo === 'ventas') {
        const modoEl = document.querySelector('input[name="modoVentas"]:checked');
        payload.modo = modoEl ? modoEl.value : 'reemplazar';
      }

      setProgress(30, 'Procesando en servidor…',
        `${totalLineas.toLocaleString()} filas`);

      const res = await KoguApi.apiFetch(`${BASE}/importaciones/${tipoActivo}`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      setProgress(100, '¡Importación completada!', '');

      const d   = res?.data || res;
      const tip = tipoActivo.charAt(0).toUpperCase() + tipoActivo.slice(1);
      const dup = (d?.duplicadas ?? 0) > 0 ? ` | Duplicadas: ${d.duplicadas}` : '';
      const msg = `Filas: ${d?.filas_procesadas ?? d?.procesadas ?? '?'} | Omitidas: ${d?.filas_omitidas ?? d?.omitidas ?? 0} | Errores: ${d?.filas_error ?? d?.errores ?? 0}${dup}`;
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

  // ══ Ingesta por PERIODO — analizar, aplicar, descartar ═════════════════════

  const money = (v) => '$' + Number(v || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const num2  = (v) => Number(v || 0).toLocaleString('es-MX', { maximumFractionDigits: 2 });

  function tile(label, valor, sub, color) {
    return `<div style="border:1px solid var(--line);border-left:3px solid ${color};border-radius:10px;padding:10px 12px;background:var(--panel2)">
      <div style="font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:var(--muted)">${label}</div>
      <div style="font-size:18px;font-weight:700;margin-top:2px;color:${color}">${valor}</div>
      <div style="font-size:11px;color:var(--muted);margin-top:2px">${sub || ''}</div>
    </div>`;
  }

  // ── Carga por LOTES ───────────────────────────────────────────────────────
  // El .xlsx viaja comprimido, pero las filas parseadas no: son ~76 columnas
  // por renglón contra el límite de 25 MB de express.json. Un año completo no
  // cabe en un solo POST, así que se sube en tandas contra el mismo
  // importacion_id y el diff se corre al final, cuando el stage ya está entero.
  const LOTE_FILAS = 2000;

  function nombreArchivo() {
    return (document.getElementById('previewCounter').textContent.match(/"([^"]+)"/) || [])[1] || 'importacion.xlsx';
  }

  async function descartarSilencioso(id) {
    if (!id) return;
    try {
      await KoguApi.apiFetch(`${BASE}/importaciones/ventas/periodo/descartar`, {
        method: 'POST', body: JSON.stringify({ importacion_id: id })
      });
    } catch (_) { /* best-effort */ }
  }

  async function analizarPeriodo(btn) {
    const anio = parseInt(document.getElementById('periodoAnio').value, 10);
    const mes  = mesPeriodoActual();
    if (!anio || (mes !== 'ACUM' && !mes)) {
      KoguApi.toast('Selecciona el periodo que cubre el archivo.', 'error');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Analizando...';
    document.getElementById('previewSection').style.display  = 'none';
    document.getElementById('progressSection').style.display = '';

    const total = parsedRows.length;
    let creado = null;
    try {
      setProgress(2, 'Declarando el periodo…',
        mes === 'ACUM' ? `Acumulado ${anio} · ${total.toLocaleString()} filas` : `${total.toLocaleString()} filas`);

      const ini = KoguApi.unwrapData(await KoguApi.apiFetch(`${BASE}/importaciones/ventas/periodo/iniciar`, {
        method: 'POST',
        body: JSON.stringify({ archivo_nombre: nombreArchivo(), anio, mes, total_filas: total })
      }));
      creado = ini.importacion_id;
      previewImportacionId = creado;

      let enviadas = 0;
      for (let off = 0; off < total; off += LOTE_FILAS) {
        const tanda = parsedRows.slice(off, off + LOTE_FILAS);
        await KoguApi.apiFetch(`${BASE}/importaciones/ventas/periodo/lote`, {
          method: 'POST',
          body: JSON.stringify({ importacion_id: creado, rows: tanda, offset: off })
        });
        enviadas += tanda.length;
        setProgress(5 + Math.round((enviadas / total) * 75), 'Subiendo el archivo…',
          `${enviadas.toLocaleString()} de ${total.toLocaleString()} filas`);
      }

      setProgress(85, 'Comparando contra el periodo…',
        mes === 'ACUM' ? 'mes por mes' : 'altas, bajas y sin cambio');
      const pv = KoguApi.unwrapData(await KoguApi.apiFetch(`${BASE}/importaciones/ventas/periodo/analizar`, {
        method: 'POST', body: JSON.stringify({ importacion_id: creado })
      }));

      setProgress(100, 'Análisis listo', '');
      document.getElementById('progressSection').style.display = 'none';
      renderDiff(pv);
    } catch (err) {
      // Un fallo a media subida deja el stage incompleto: se descarta para que
      // el siguiente intento arranque limpio y no mezcle dos archivos.
      await descartarSilencioso(creado);
      previewImportacionId = null;
      document.getElementById('progressSection').style.display = 'none';
      document.getElementById('previewSection').style.display  = '';
      KoguApi.toast('No se pudo analizar: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Importar';
    }
  }

  // ── Preview del diff ──────────────────────────────────────────────────────
  function renderDiff(d) {
    previewImportacionId = d.importacion_id;
    const acum = !!d.acumulado;
    const meses = d.archivo?.meses || [];

    document.getElementById('diffTitulo').textContent = acum
      ? `Acumulado ${d.periodo.anio} · ${meses.length} mes(es) en el archivo`
      : `${MESES[d.periodo.mes - 1]} ${d.periodo.anio} · ${d.periodo.desde} … ${d.periodo.hasta}`;

    // Avisos primero: las bajas, el archivo parcial y los meses ausentes son
    // lo que hay que mirar antes de aplicar.
    const colorAviso = { bajas: '#b45309', archivo_parcial: '#b45309', periodo_cerrado: '#dc2626',
                         meses_ausentes: '#b45309', sin_fecha: '#64748b', errores_carga: '#dc2626' };
    document.getElementById('diffAvisos').innerHTML = (d.advertencias || []).map(a =>
      `<div style="border:1px solid ${colorAviso[a.tipo] || 'var(--line)'};background:rgba(180,83,9,.06);
                   border-radius:10px;padding:9px 12px;margin-bottom:6px;font-size:13px;color:${colorAviso[a.tipo] || 'var(--fg)'}">
         ${KoguUi.escapeHtml(a.mensaje)}
       </div>`).join('');

    const delta = Number(d.resultado.delta || 0);
    document.getElementById('diffMetrics').innerHTML = [
      tile('En el archivo', num2(d.archivo.lineas_cargadas) + ' líneas', money(d.archivo.importe), '#0e7490'),
      tile('Sin cambio', num2(d.diff.sin_cambio.lineas) + ' líneas', 'no se tocan', '#64748b'),
      tile('Altas', num2(d.diff.altas.lineas) + ' líneas', money(d.diff.altas.importe), '#15803d'),
      tile('Bajas', num2(d.diff.bajas.lineas) + ' líneas', money(d.diff.bajas.importe), '#b45309'),
      tile(acum ? 'El año pasa de' : 'El periodo pasa de', money(d.resultado.importe_antes),
           'a ' + money(d.resultado.importe_despues), '#0f172a'),
      tile('Delta', (delta >= 0 ? '+' : '') + money(delta), delta === 0 ? 'sin cambio neto' : 'diferencia neta',
           delta === 0 ? '#64748b' : (delta > 0 ? '#15803d' : '#dc2626')),
    ].join('');

    // ── Desglose por mes (solo acumulado) ───────────────────────────────────
    const pm = d.por_mes || [];
    const wrapMes = document.getElementById('diffPorMesWrap');
    wrapMes.style.display = (acum && pm.length) ? '' : 'none';
    if (acum && pm.length) {
      document.getElementById('diffPorMesBody').innerHTML = pm.map(m => {
        const dl = Number(m.importe_despues) - Number(m.importe_antes);
        const marcas = [
          m.cerrado ? chip('CERRADO', '#dc2626', 'rgba(220,38,38,.12)') : '',
          m.parcial ? chip('PARCIAL', '#b45309', 'rgba(180,83,9,.12)') : '',
        ].filter(Boolean).join(' ');
        return `<tr>
          <td><strong>${MESES[m.mes - 1]}</strong> ${marcas}</td>
          <td class="num">${num2(m.archivo.lineas)}</td>
          <td class="num" style="color:var(--muted)">${num2(m.sin_cambio.lineas)}</td>
          <td class="num" style="color:#15803d">${num2(m.altas.lineas)}</td>
          <td class="num" style="color:#b45309">${num2(m.bajas.lineas)}</td>
          <td class="num">${money(m.importe_antes)}</td>
          <td class="num"><strong>${money(m.importe_despues)}</strong></td>
          <td class="num" style="color:${dl === 0 ? '#64748b' : (dl > 0 ? '#15803d' : '#dc2626')}">
            ${(dl >= 0 ? '+' : '') + money(dl)}
          </td>
        </tr>`;
      }).join('');
    }

    // ── Meses que el archivo NO trae y sí tienen datos ──────────────────────
    // No se van a tocar: esa es la regla del acumulado. Pero si el archivo
    // debía traerlos, aquí es donde se nota.
    const ma = d.meses_ausentes || [];
    const wrapAus = document.getElementById('diffAusentesWrap');
    wrapAus.style.display = ma.length ? '' : 'none';
    if (ma.length) {
      document.getElementById('diffAusentes').innerHTML = ma.map(x =>
        `<span style="display:inline-block;border:1px solid var(--line);border-radius:8px;
                      padding:4px 10px;margin:0 6px 6px 0;font-size:12px;background:var(--panel2)">
           <strong>${MESES[x.mes - 1]}</strong> · ${num2(x.lineas)} líneas · ${money(x.importe)}
         </span>`).join('');
    }

    // ── Candado (solo acumulado) ───────────────────────────────────────────
    const cand = document.getElementById('diffCandado');
    cand.style.display = acum ? '' : 'none';
    if (acum) {
      document.getElementById('candadoAnio').textContent = String(d.confirmacion_requerida || d.periodo.anio);
      document.getElementById('candadoMotivo').value   = '';
      document.getElementById('candadoConfirma').value = '';
      document.getElementById('candadoForzar').checked = false;
      const cerrados = d.cierres_tocados || [];
      document.getElementById('candadoCerradosWrap').style.display = cerrados.length ? '' : 'none';
      document.getElementById('candadoCerradosTxt').textContent =
        cerrados.map(c => MESES[c.mes - 1]).join(', ');
    }
    validarCandado();

    const det = d.detalle || [];
    document.getElementById('diffDetalleWrap').style.display = det.length ? '' : 'none';
    document.getElementById('diffDetalleBody').innerHTML = det.map(r => {
      const esBaja = r.tipo === 'baja';
      const chipTipo = esBaja
        ? '<span style="background:rgba(180,83,9,.12);color:#b45309;padding:1px 7px;border-radius:99px;font-size:11px;font-weight:600">baja</span>'
        : '<span style="background:rgba(21,128,61,.12);color:#15803d;padding:1px 7px;border-radius:99px;font-size:11px;font-weight:600">alta</span>';
      return `<tr>
        <td>${chipTipo}</td>
        <td>${KoguUi.escapeHtml(r.folio_factura || '')}</td>
        <td>${r.falta_fac ? String(r.falta_fac).slice(0, 10) : ''}</td>
        <td>${KoguUi.escapeHtml(r.nom_cte || '')}</td>
        <td class="num">${num2(r.lineas)}</td>
        <td class="num">${num2(r.cantidad)}</td>
        <td class="num"${Number(r.importe) < 0 ? ' style="color:#dc2626"' : ''}>${money(r.importe)}</td>
      </tr>`;
    }).join('');

    document.getElementById('diffSection').style.display = '';
  }

  /**
   * El botón de aplicar se habilita sólo cuando los cerrojos están satisfechos.
   * En carga mensual no hay candado y queda siempre habilitado.
   */
  function validarCandado() {
    const btn  = document.getElementById('diffAplicarBtn');
    const cand = document.getElementById('diffCandado');
    if (!btn || !cand) return;
    if (cand.style.display === 'none') { btn.disabled = false; return; }
    const motivo   = document.getElementById('candadoMotivo').value.trim();
    const confirma = document.getElementById('candadoConfirma').value.trim();
    const anio     = document.getElementById('candadoAnio').textContent.trim();
    const cerrWrap = document.getElementById('candadoCerradosWrap');
    const okCerr   = cerrWrap.style.display === 'none' || document.getElementById('candadoForzar').checked;
    btn.disabled = !(motivo && confirma === anio && okCerr);
  }

  ['candadoMotivo', 'candadoConfirma'].forEach(id =>
    document.getElementById(id)?.addEventListener('input', validarCandado));
  document.getElementById('candadoForzar')?.addEventListener('change', validarCandado);

  document.getElementById('diffAplicarBtn').onclick = async (e) => {
    if (!previewImportacionId) return;
    const btn  = e.target;
    const cand = document.getElementById('diffCandado');
    const acum = cand && cand.style.display !== 'none';

    const payload = { importacion_id: previewImportacionId };
    if (acum) {
      payload.motivo          = document.getElementById('candadoMotivo').value.trim();
      payload.confirmacion    = document.getElementById('candadoConfirma').value.trim();
      payload.forzar_cerrados = document.getElementById('candadoForzar').checked;
    }

    btn.disabled = true;
    btn.textContent = 'Aplicando...';
    document.getElementById('progressSection').style.display = '';
    setProgress(50, 'Aplicando cambios…', 'archivando bajas y promoviendo altas');
    try {
      const d = KoguApi.unwrapData(await KoguApi.apiFetch(`${BASE}/importaciones/ventas/periodo/aplicar`, {
        method: 'POST', body: JSON.stringify(payload)
      }));
      setProgress(100, '¡Periodo actualizado!', '');
      const etiqueta = d.acumulado
        ? `Acumulado ${d.periodo.anio} (${(d.meses_aplicados || []).map(m => MESES[m - 1]).join(', ')})`
        : `Periodo ${d.periodo.anio}-${String(d.periodo.mes).padStart(2, '0')}`;
      KoguApi.toast(
        `${etiqueta}: ${d.aplicado.insertadas} alta(s), ${d.aplicado.borradas} baja(s). ` +
        `Total ${money(d.despues.importe)}.`, 'success');
      setTimeout(() => { resetFile(); loadHistorial(); loadPeriodos(); }, 1800);
    } catch (err) {
      document.getElementById('progressSection').style.display = 'none';
      // Meses cerrados: en vez de un toast ciego, se revela la casilla que
      // permite reabrirlos y se dice cuáles son.
      if (err.code === 'ERP_PERIODO_CERRADO' && acum) {
        const lista = (err.details?.meses_cerrados || []).map(m => MESES[m.mes - 1]);
        document.getElementById('candadoCerradosWrap').style.display = '';
        if (lista.length) document.getElementById('candadoCerradosTxt').textContent = lista.join(', ');
        document.getElementById('candadoForzar').checked = false;
        document.getElementById('candadoCerradosWrap').scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      KoguApi.toast('Error: ' + err.message, 'error');
      btn.textContent = 'Aplicar cambios';
      validarCandado();
    }
  };

  document.getElementById('diffDescartarBtn').onclick = async () => {
    if (previewImportacionId) {
      try {
        await KoguApi.apiFetch(`${BASE}/importaciones/ventas/periodo/descartar`, {
          method: 'POST',
          body: JSON.stringify({ importacion_id: previewImportacionId })
        });
      } catch (_) { /* descartar es best-effort */ }
    }
    resetFile();
    loadHistorial();
  };

  // ══ Cierre de periodos ═════════════════════════════════════════════════════
  // Cerrar congela la foto del mes (lineas, cantidad, importe y una huella).
  // Despues, si la foto viva deja de coincidir, la columna "Δ vs cierre" y el
  // chip MOVIDO lo delatan sin que nadie tenga que notarlo en una junta.

  function chip(txt, color, bg) {
    return `<span style="background:${bg};color:${color};padding:2px 9px;border-radius:99px;font-size:11px;font-weight:700;white-space:nowrap">${txt}</span>`;
  }

  /** Modal chico para capturar un motivo. Resuelve con el texto o null. */
  function pedirMotivo(titulo, ayuda, obligatorio = true) {
    return new Promise((resolve) => {
      const ov = document.createElement('div');
      ov.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.45);display:flex;align-items:center;justify-content:center;z-index:9999';
      ov.innerHTML = `
        <div style="background:var(--panel,#fff);border-radius:14px;padding:20px;max-width:460px;width:92%;box-shadow:0 18px 50px rgba(0,0,0,.25)">
          <h3 style="margin:0 0 6px">${KoguUi.escapeHtml(titulo)}</h3>
          <div style="font-size:13px;color:var(--muted);margin-bottom:12px">${KoguUi.escapeHtml(ayuda)}</div>
          <textarea id="motivoTxt" rows="3" style="width:100%;box-sizing:border-box;border:1px solid var(--line);border-radius:8px;padding:8px;font:inherit" placeholder="Motivo"></textarea>
          <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px">
            <button class="btn" id="motivoCancel">Cancelar</button>
            <button class="btn primary" id="motivoOk">Confirmar</button>
          </div>
        </div>`;
      document.body.appendChild(ov);
      const ta = ov.querySelector('#motivoTxt');
      ta.focus();
      const cerrar = (v) => { ov.remove(); resolve(v); };
      ov.querySelector('#motivoCancel').onclick = () => cerrar(null);
      ov.querySelector('#motivoOk').onclick = () => {
        const v = ta.value.trim();
        if (obligatorio && !v) { ta.style.borderColor = '#dc2626'; ta.focus(); return; }
        cerrar(v);
      };
      ov.onclick = (e) => { if (e.target === ov) cerrar(null); };
    });
  }

  function initPerAnio() {
    const sel = document.getElementById('perAnio');
    if (!sel || sel.options.length) return;
    const actual = new Date().getUTCFullYear();
    for (let a = actual; a >= actual - 5; a--) {
      sel.innerHTML += `<option value="${a}"${a === actual ? ' selected' : ''}>${a}</option>`;
    }
    sel.onchange = loadPeriodos;
  }

  async function loadPeriodos() {
    const card = document.getElementById('periodosCard');
    if (!card || card.style.display === 'none') return;
    initPerAnio();
    const anio = document.getElementById('perAnio').value;
    const body = document.getElementById('perBody');
    body.innerHTML = '<tr><td colspan="8" class="empty">Cargando…</td></tr>';
    try {
      const res = await KoguApi.apiFetch(`${BASE}/periodos?anio=${anio}`);
      renderPeriodos(KoguApi.unwrapRows(res) || res?.data || []);
    } catch (err) {
      body.innerHTML = `<tr><td colspan="8" class="empty">Error al cargar: ${KoguUi.escapeHtml(err.message)}</td></tr>`;
    }
  }

  function renderPeriodos(rows) {
    const conDatos = (rows || []).filter(r => Number(r.vivo?.lineas || 0) > 0 || r.cierre);
    const movidos  = conDatos.filter(r => r.movido);

    const avisos = [];
    if (movidos.length) {
      avisos.push(`<div style="border:1px solid #dc2626;background:rgba(220,38,38,.06);border-radius:10px;padding:9px 12px;margin-bottom:6px;font-size:13px;color:#dc2626">
        ${movidos.length} periodo(s) CERRADO(s) cambiaron después del cierre: ${movidos.map(m => MESES[m.mes-1]).join(', ')}.
        Revisa las bajas para ver qué se movió.
      </div>`);
    }
    if (!PUEDE_CERRAR) {
      avisos.push(`<div style="border:1px solid var(--line);background:var(--panel2);border-radius:10px;padding:9px 12px;margin-bottom:6px;font-size:13px;color:var(--muted)">
        Solo lectura: te falta el permiso <strong>erp.periodo.cerrar</strong> para cerrar o reabrir periodos.
        Si te lo acaban de otorgar, cierra sesión y vuelve a entrar — los permisos viajan en la sesión.
      </div>`);
    }
    document.getElementById('perAviso').innerHTML = avisos.join('');

    if (!conDatos.length) {
      document.getElementById('perBody').innerHTML = '<tr><td colspan="8" class="empty">Sin ventas cargadas en este año.</td></tr>';
      return;
    }

    document.getElementById('perBody').innerHTML = conDatos.map(r => {
      const cerrado = r.status === 'cerrado';
      const estado = r.movido
        ? chip('MOVIDO', '#dc2626', 'rgba(220,38,38,.12)')
        : cerrado
          ? chip('cerrado', '#15803d', 'rgba(21,128,61,.12)')
          : r.status === 'reabierto'
            ? chip('reabierto', '#b45309', 'rgba(180,83,9,.12)')
            : chip('abierto', '#64748b', 'rgba(100,116,139,.12)');

      const cerradoTxt = r.cierre
        ? `<div style="font-size:12px">${money(r.cierre.importe)}</div>
           <div style="font-size:11px;color:var(--muted)">${KoguUi.fmtDateOnly(r.cierre.cerrado_at)} · ${KoguUi.escapeHtml(r.cierre.cerrado_por_nombre || '')}</div>`
        : '<span style="color:var(--muted)">—</span>';

      const d = r.delta_vs_cierre;
      const deltaTxt = (d === null || d === undefined)
        ? '<span style="color:var(--muted)">—</span>'
        : `<span style="color:${Math.abs(d) < 0.005 ? '#64748b' : '#dc2626'};font-weight:${Math.abs(d) < 0.005 ? '400' : '700'}">${(d >= 0 ? '+' : '') + money(d)}</span>`;

      const acciones = [];
      if (PUEDE_CERRAR) {
        acciones.push(cerrado
          ? `<button class="btn" data-reabrir="${r.mes}" style="padding:3px 10px;font-size:12px">Reabrir</button>`
          : `<button class="btn primary" data-cerrar="${r.mes}" style="padding:3px 10px;font-size:12px">Cerrar</button>`);
      }
      acciones.push(`<button class="btn" data-bajas="${r.mes}" style="padding:3px 10px;font-size:12px">Bajas</button>`);

      return `<tr>
        <td style="font-weight:600">${MESES[r.mes - 1]}</td>
        <td class="num">${num2(r.vivo.lineas)}</td>
        <td class="num">${num2(r.vivo.cantidad)}</td>
        <td class="num">${money(r.vivo.importe)}</td>
        <td>${estado}</td>
        <td>${cerradoTxt}</td>
        <td class="num">${deltaTxt}</td>
        <td style="text-align:right;white-space:nowrap">${acciones.join(' ')}</td>
      </tr>
      <tr id="perBajas${r.mes}" style="display:none"><td colspan="8" style="background:var(--panel2);padding:10px 14px"></td></tr>`;
    }).join('');

    document.querySelectorAll('[data-cerrar]').forEach(b2 => b2.onclick = () => cerrarPeriodo(parseInt(b2.dataset.cerrar, 10)));
    document.querySelectorAll('[data-reabrir]').forEach(b2 => b2.onclick = () => reabrirPeriodo(parseInt(b2.dataset.reabrir, 10)));
    document.querySelectorAll('[data-bajas]').forEach(b2 => b2.onclick = () => verBajas(parseInt(b2.dataset.bajas, 10)));
  }

  async function cerrarPeriodo(mes) {
    const anio = parseInt(document.getElementById('perAnio').value, 10);
    const motivo = await pedirMotivo(
      `Cerrar ${MESES[mes - 1]} ${anio}`,
      'Se congela la foto del mes (líneas, cantidad, importe y huella). Después, recargarlo exigirá reabrirlo. ¿Contra qué lo conciliaste?',
      false);
    if (motivo === null) return;
    try {
      await KoguApi.apiFetch(`${BASE}/periodos/cerrar`, { method: 'POST', body: JSON.stringify({ anio, mes, motivo }) });
      KoguApi.toast(`${MESES[mes - 1]} ${anio} cerrado.`, 'success');
      loadPeriodos();
    } catch (err) { KoguApi.toast('Error: ' + err.message, 'error'); }
  }

  async function reabrirPeriodo(mes) {
    const anio = parseInt(document.getElementById('perAnio').value, 10);
    const motivo = await pedirMotivo(
      `Reabrir ${MESES[mes - 1]} ${anio}`,
      'Reabrir un mes ya reportado queda registrado con tu usuario. El motivo es obligatorio.',
      true);
    if (motivo === null) return;
    try {
      await KoguApi.apiFetch(`${BASE}/periodos/reabrir`, { method: 'POST', body: JSON.stringify({ anio, mes, motivo }) });
      KoguApi.toast(`${MESES[mes - 1]} ${anio} reabierto.`, 'warning');
      loadPeriodos();
    } catch (err) { KoguApi.toast('Error: ' + err.message, 'error'); }
  }

  async function verBajas(mes) {
    const anio = parseInt(document.getElementById('perAnio').value, 10);
    const fila = document.getElementById('perBajas' + mes);
    const celda = fila.querySelector('td');
    if (fila.style.display !== 'none') { fila.style.display = 'none'; return; }
    fila.style.display = '';
    celda.innerHTML = '<span style="color:var(--muted);font-size:13px">Cargando…</span>';
    try {
      const res = await KoguApi.apiFetch(`${BASE}/periodos/bajas?anio=${anio}&mes=${mes}`);
      const rows = KoguApi.unwrapRows(res) || res?.data || [];
      if (!rows.length) {
        celda.innerHTML = '<span style="color:var(--muted);font-size:13px">Sin bajas registradas en este periodo.</span>';
        return;
      }
      celda.innerHTML = `
        <div style="font-size:12px;color:var(--muted);margin-bottom:6px">
          Líneas eliminadas porque desaparecieron del ERP (canceladas, re-emitidas o ausentes del archivo del periodo).
        </div>
        <table style="width:100%">
          <thead><tr><th>Folio</th><th>Fecha</th><th>Cliente</th><th>Concepto</th><th class="num">Cantidad</th><th class="num">Importe</th><th>Dada de baja</th></tr></thead>
          <tbody>${rows.map(x => `<tr>
            <td>${KoguUi.escapeHtml(x.folio_factura || '')}</td>
            <td>${KoguUi.fmtDateOnly(x.falta_fac)}</td>
            <td>${KoguUi.escapeHtml(x.nom_cte || '')}</td>
            <td>${KoguUi.escapeHtml(x.desc_prod || '')}</td>
            <td class="num">${num2(x.cant_surt)}</td>
            <td class="num">${money(x.subt_prod)}</td>
            <td style="font-size:12px">${KoguUi.fmtDateOnly(x.baja_at)} · ${KoguUi.escapeHtml(x.baja_por_nombre || '')}</td>
          </tr>`).join('')}</tbody>
        </table>`;
    } catch (err) {
      celda.innerHTML = `<span style="color:#dc2626;font-size:13px">Error: ${KoguUi.escapeHtml(err.message)}</span>`;
    }
  }

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
  document.getElementById('perRefreshBtn').onclick    = () => loadPeriodos();
  document.getElementById('histTipoFil').onchange    = () => { histPage = 1; loadHistorial(); };

  // Refrescar al cambiar empresa
  KoguShell.subscribeEmpresaActivaChange(async () => {
    resetFile();
    histPage = 1;
    await loadHistorial();
    await loadPeriodos();
  });

  await loadHistorial();
  await loadPeriodos();
});

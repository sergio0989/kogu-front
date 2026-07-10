document.addEventListener('DOMContentLoaded', async () => {
  const PAGE     = '/modules/cat/productos/productos.html';
  const BASE     = '/protected/cat/productos';
  const BASE_FAM = '/protected/cat/familias';
  const BASE_UND = '/protected/cat/unidades';
  const PERM     = 'screen.catalogos.productos';

  const b = await KoguShell.initShell({ currentPage: PAGE, title: 'Catálogo de Productos', description: 'Productos, servicios y kits de la empresa.', requiredPermission: PERM });
  if (!b) return;

  const c = document.getElementById('pageContent');
  c.innerHTML = `
<div class="card">
  <div class="row">
    <div><div class="eyebrow">Catálogo</div><h2>Productos</h2></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn primary" id="newProdBtn">+ Nuevo producto</button>
      <button class="btn"         id="cargaProdBtn">Carga masiva</button>
      <button class="btn"         id="refreshBtn">Actualizar</button>
    </div>
  </div>
  <div class="grid-2" style="margin-top:16px;gap:10px">
    <input  class="input"  id="q"        placeholder="Buscar por clave o descripción" />
    <select class="select" id="tipoFil">
      <option value="">Todos los tipos</option>
      <option value="producto">Producto</option>
      <option value="servicio">Servicio</option>
      <option value="kit">Kit</option>
    </select>
    <select class="select" id="usoFil">
      <option value="">Todos los usos</option>
      <option value="producto_terminado">Producto terminado</option>
      <option value="materia_prima">Materia prima</option>
      <option value="producto_en_proceso">En proceso</option>
      <option value="consumible">Consumible</option>
      <option value="activo_fijo">Activo fijo</option>
      <option value="mercancia_reventa">Mercancía reventa</option>
      <option value="servicio_externo">Servicio externo</option>
    </select>
    <select class="select" id="famFil"><option value="">Todas las familias</option></select>
  </div>
  <div class="grid-2" style="margin-top:8px;gap:10px">
    <select class="select" id="activoFil"><option value="">Todos</option><option value="true">Activos</option><option value="false">Inactivos</option></select>
  </div>
  <div class="table-wrap" style="margin-top:16px">
    <table><thead><tr>
      <th>Clave</th><th>Descripción</th><th>Tipo</th><th>Uso</th><th>Familia</th><th>Precio</th><th>Estado</th><th></th>
    </tr></thead><tbody id="rowsProductos"></tbody></table>
  </div>
  <div id="pgBarProductos" style="display:flex;align-items:center;justify-content:space-between;margin-top:10px;font-size:13px;color:var(--muted)"></div>
</div>`;

  // ── Modal ──────────────────────────────────────────────────────────────────
  function buildModal() {
    const overlay = document.createElement('div');
    overlay.id = 'prodModal';
    overlay.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:9999;align-items:flex-start;justify-content:center;padding:40px 20px 20px;backdrop-filter:blur(2px)';
    overlay.innerHTML = `
      <div style="width:100%;max-width:680px;max-height:88vh;background:white;border-radius:12px;box-shadow:0 20px 50px rgba(0,0,0,.3);display:flex;flex-direction:column;overflow:hidden;color:#0f172a">
        <!-- Header -->
        <div style="padding:16px 20px;border-bottom:1px solid var(--line,#e2e8f0);display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
          <div>
            <div class="eyebrow">Producto</div>
            <h2 id="formTitle" style="margin:0;font-size:20px">Nuevo producto</h2>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <span class="chip" id="modeChip">Alta</span>
            <button class="btn ghost" id="closeModalBtn" style="padding:6px 10px;font-size:16px">✕</button>
          </div>
        </div>
        <!-- Body scrollable -->
        <div style="flex:1;overflow-y:auto;padding:20px">
          <div class="stack">
            <input type="hidden" id="productoId"/>

            <!-- Identificación ERP -->
            <div class="eyebrow" style="margin-bottom:6px">Identificación ERP</div>
            <div class="grid-2" style="gap:10px">
              <div>
                <div class="label-text">Clave ERP <span style="color:var(--danger)">*</span></div>
                <input class="input" id="pCve" placeholder="Ej: CAJA-001" style="text-transform:uppercase" maxlength="50"/>
              </div>
              <div>
                <div class="label-text">Nombre corto</div>
                <input class="input" id="pNombreCorto" placeholder="Para búsqueda rápida" maxlength="100"/>
              </div>
            </div>
            <div>
              <div class="label-text">Descripción <span style="color:var(--danger)">*</span></div>
              <input class="input" id="pDesc" placeholder="Descripción completa del producto" maxlength="300"/>
            </div>

            <!-- Clasificación -->
            <div style="border-top:1px solid var(--line);padding-top:14px;margin-top:4px">
              <div class="eyebrow" style="margin-bottom:8px">Clasificación</div>
              <div class="grid-2" style="gap:10px">
                <div>
                  <div class="label-text">Tipo <span style="color:var(--danger)">*</span></div>
                  <select class="select" id="pTipo">
                    <option value="producto">Producto</option>
                    <option value="servicio">Servicio</option>
                    <option value="kit">Kit</option>
                  </select>
                </div>
                <div>
                  <div class="label-text">Uso <span style="color:var(--danger)">*</span></div>
                  <select class="select" id="pUso">
                    <option value="producto_terminado">Producto terminado</option>
                    <option value="materia_prima">Materia prima</option>
                    <option value="producto_en_proceso">En proceso</option>
                    <option value="consumible">Consumible</option>
                    <option value="activo_fijo">Activo fijo</option>
                    <option value="mercancia_reventa">Mercancía reventa</option>
                    <option value="servicio_externo">Servicio externo</option>
                  </select>
                </div>
                <div>
                  <div class="label-text">Familia</div>
                  <select class="select" id="pFamilia"><option value="">— Sin familia —</option></select>
                </div>
                <div>
                  <div class="label-text">Subfamilia</div>
                  <select class="select" id="pSubfamilia"><option value="">— Sin subfamilia —</option></select>
                </div>
              </div>
            </div>

            <!-- Unidad de medida -->
            <div style="border-top:1px solid var(--line);padding-top:14px;margin-top:4px">
              <div class="eyebrow" style="margin-bottom:8px">Unidad de Medida</div>
              <div class="grid-2" style="gap:10px">
                <div>
                  <div class="label-text">Unidad uso / venta</div>
                  <select class="select" id="pUnidad"><option value="">— Seleccionar —</option></select>
                </div>
                <div>
                  <div class="label-text">Unidad compra</div>
                  <select class="select" id="pUnidadCompra"><option value="">— Igual a uso —</option></select>
                </div>
                <div>
                  <div class="label-text">Factor conversión</div>
                  <input class="input" id="pFactor" type="number" value="1" min="0.0001" step="any" placeholder="1"/>
                </div>
              </div>
            </div>

            <!-- Precios -->
            <div style="border-top:1px solid var(--line);padding-top:14px;margin-top:4px">
              <div class="eyebrow" style="margin-bottom:8px">Precios</div>
              <div class="grid-2" style="gap:10px">
                <div>
                  <div class="label-text">Precio base</div>
                  <input class="input" id="pPrecio" type="number" min="0" step="0.01" placeholder="0.00"/>
                </div>
                <div>
                  <div class="label-text">Costo base</div>
                  <input class="input" id="pCosto" type="number" min="0" step="0.01" placeholder="0.00"/>
                </div>
                <div>
                  <div class="label-text">Moneda</div>
                  <select class="select" id="pMoneda">
                    <option value="MXN">MXN — Peso mexicano</option>
                    <option value="USD">USD — Dólar</option>
                    <option value="EUR">EUR — Euro</option>
                  </select>
                </div>
                <div>
                  <div class="label-text">IVA default (%)</div>
                  <select class="select" id="pIva">
                    <option value="16">16%</option>
                    <option value="8">8% (frontera)</option>
                    <option value="0">0% (exento)</option>
                  </select>
                </div>
              </div>
            </div>

            <!-- Flags -->
            <div style="border-top:1px solid var(--line);padding-top:14px;margin-top:4px">
              <div class="eyebrow" style="margin-bottom:8px">Módulos que lo usan</div>
              <div class="grid-2" style="gap:10px">
                <div>
                  <div class="label-text">¿Es vendible?</div>
                  <select class="select" id="pVendible"><option value="true">Sí</option><option value="false">No</option></select>
                </div>
                <div>
                  <div class="label-text">¿Es comprable?</div>
                  <select class="select" id="pComprable"><option value="true">Sí</option><option value="false">No</option></select>
                </div>
                <div>
                  <div class="label-text">¿Es activo fijo?</div>
                  <select class="select" id="pActivoFijo"><option value="false">No</option><option value="true">Sí</option></select>
                </div>
                <div>
                  <div class="label-text">¿Maneja inventario?</div>
                  <select class="select" id="pInventario"><option value="false">No</option><option value="true">Sí</option></select>
                </div>
              </div>
            </div>

            <!-- SAT -->
            <details style="border-top:1px solid var(--line);padding-top:14px;margin-top:4px">
              <summary style="cursor:pointer;font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)">Datos SAT (opcional)</summary>
              <div class="grid-2" style="gap:10px;margin-top:12px">
                <div>
                  <div class="label-text">ClaveProdServ SAT</div>
                  <input class="input" id="pClaveSat" placeholder="Ej: 43232000" maxlength="10"/>
                </div>
                <div>
                  <div class="label-text">ClaveUnidad SAT</div>
                  <input class="input" id="pUnidadSat" placeholder="Ej: H87" maxlength="5" style="text-transform:uppercase"/>
                </div>
              </div>
            </details>

            <!-- Estado -->
            <div style="border-top:1px solid var(--line);padding-top:14px;margin-top:4px">
              <div class="label-text">Estado</div>
              <select class="select" id="pActivo" style="margin-top:4px"><option value="true">Activo</option><option value="false">Inactivo</option></select>
            </div>
          </div>
        </div>
        <!-- Footer -->
        <div style="padding:14px 20px;border-top:1px solid var(--line,#e2e8f0);display:flex;justify-content:flex-end;gap:8px;flex-shrink:0">
          <button class="btn ghost" id="cancelModalBtn">Cancelar</button>
          <button class="btn primary" id="saveProdBtn">Guardar</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    return overlay;
  }

  const modal   = buildModal();
  const openM   = () => { modal.style.display = 'flex'; }
  const closeM  = () => { modal.style.display = 'none'; }
  modal.addEventListener('click', e => { if (e.target === modal) closeM(); });
  document.getElementById('closeModalBtn').addEventListener('click', closeM);
  document.getElementById('cancelModalBtn').addEventListener('click', closeM);

  // ── Modal carga masiva (alta) ──────────────────────────────────────────────
  const cargaOverlay = document.createElement('div');
  cargaOverlay.id = 'cargaModal';
  cargaOverlay.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:10000;align-items:flex-start;justify-content:center;padding:40px 20px 20px;backdrop-filter:blur(2px)';
  cargaOverlay.innerHTML = `
    <div style="width:100%;max-width:920px;max-height:88vh;background:white;border-radius:12px;box-shadow:0 20px 50px rgba(0,0,0,.3);display:flex;flex-direction:column;overflow:hidden;color:#0f172a">
      <div style="padding:16px 20px;border-bottom:1px solid var(--line,#e2e8f0);display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
        <div><div class="eyebrow">Carga masiva</div><h2 style="margin:0;font-size:20px">Alta de productos por Excel</h2></div>
        <button class="btn ghost" id="cargaClose" style="padding:6px 10px;font-size:16px">✕</button>
      </div>
      <div style="flex:1;overflow-y:auto;padding:20px">
        <p style="margin:0 0 12px;font-size:13px;color:var(--muted)">
          Sube un Excel para <b>dar de alta productos nuevos</b> en la empresa activa. La llave es <b>cve_prod</b>:
          si un producto ya existe, se <b>omite</b> (no se sobrescribe). Obligatorios: <b>cve_prod</b> y <b>desc_prod</b>.
        </p>
        <div class="page-actions" style="gap:8px;flex-wrap:wrap;align-items:center">
          <button class="btn" id="cargaPlantillaBtn">⬇ Descargar plantilla</button>
          <input type="file" id="cargaFile" accept=".xlsx,.xls" class="input" style="max-width:340px"/>
          <span id="cargaFileInfo" class="muted" style="font-size:12px"></span>
        </div>
        <div class="page-actions" style="gap:8px;margin-top:10px">
          <button class="btn primary" id="cargaPreviewBtn" disabled>Previsualizar</button>
          <button class="btn"         id="cargaApplyBtn"   disabled>Aplicar</button>
        </div>
        <div id="cargaResumen" style="margin-top:14px"></div>
        <div id="cargaTabla" class="table-wrap" style="margin-top:8px;max-height:42vh;overflow:auto"></div>
      </div>
    </div>`;
  document.body.appendChild(cargaOverlay);
  const closeCarga = () => { cargaOverlay.style.display = 'none'; };
  document.getElementById('cargaClose').onclick = closeCarga;
  cargaOverlay.addEventListener('click', e => { if (e.target === cargaOverlay) closeCarga(); });

  let cargaRows = [];  // filas parseadas del Excel (objetos por encabezado)

  const CARGA_STATUS = {
    crear:             { label: 'Se creará',     color: '#16a34a' },
    ya_existe:         { label: 'Ya existe',     color: '#64748b' },
    duplicado_archivo: { label: 'Duplicado',     color: '#d97706' },
    dato_invalido:     { label: 'Dato inválido', color: '#dc2626' },
  };
  const CARGA_ORDER = ['crear', 'ya_existe', 'duplicado_archivo', 'dato_invalido'];

  function openCarga() {
    cargaRows = [];
    document.getElementById('cargaFile').value = '';
    document.getElementById('cargaFileInfo').textContent = '';
    document.getElementById('cargaResumen').innerHTML = '';
    document.getElementById('cargaTabla').innerHTML = '';
    document.getElementById('cargaPreviewBtn').disabled = true;
    const applyBtn = document.getElementById('cargaApplyBtn');
    applyBtn.disabled = true; applyBtn.textContent = 'Aplicar';
    cargaOverlay.style.display = 'flex';
  }

  function descargarPlantillaProd() {
    if (typeof XLSX === 'undefined') return KoguApi.toast('SheetJS no cargó; recarga la página.', 'error');
    const aoa = [
      ['cve_prod', 'desc_prod', 'tipo_producto', 'uso_producto', 'clave_prod_serv_sat', 'clave_unidad_sat', 'precio_base', 'costo_base', 'moneda', 'tasa_iva_default'],
      ['WWP9001', 'EXTRACTO DEMO DE PRUEBA', 'producto', 'materia_prima', '', '', '0', '0', 'MXN', '16'],
      ['SERV-DEMO', 'SERVICIO DEMO', 'servicio', 'servicio_externo', '', '', '', '', 'MXN', '16'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 16 }, { wch: 34 }, { wch: 14 }, { wch: 18 }, { wch: 18 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'productos');
    XLSX.writeFile(wb, 'plantilla_productos.xlsx');
  }

  const CARGA_ALIAS = { clave: 'cve_prod', descripcion: 'desc_prod', descripcion_completa: 'desc_prod' };

  async function onCargaFile() {
    const file = document.getElementById('cargaFile').files?.[0];
    cargaRows = [];
    document.getElementById('cargaResumen').innerHTML = '';
    document.getElementById('cargaTabla').innerHTML = '';
    const applyBtn = document.getElementById('cargaApplyBtn');
    applyBtn.disabled = true; applyBtn.textContent = 'Aplicar';
    const info = document.getElementById('cargaFileInfo');
    if (!file) { info.textContent = ''; document.getElementById('cargaPreviewBtn').disabled = true; return; }
    if (typeof XLSX === 'undefined') return KoguApi.toast('SheetJS no cargó; recarga la página.', 'error');
    try {
      const buf = await file.arrayBuffer();
      const wb  = XLSX.read(buf, { type: 'array' });
      const ws  = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json(ws, { defval: '', raw: true });
      const parsed = [];
      for (const r of raw) {
        const o = {};
        for (const k in r) {
          const key = String(k).trim().toLowerCase().replace(/\s+/g, '_');
          o[CARGA_ALIAS[key] || key] = r[k];
        }
        // descartar renglones totalmente vacíos
        if (Object.values(o).some(v => v !== null && v !== '' && v !== undefined)) parsed.push(o);
      }
      cargaRows = parsed;
      info.textContent = `${file.name} · ${parsed.length} fila(s)`;
      document.getElementById('cargaPreviewBtn').disabled = parsed.length === 0;
      if (!parsed.length) KoguApi.toast('El archivo no tiene filas de datos.', 'error');
    } catch (e) {
      KoguApi.toast('No se pudo leer el archivo: ' + e.message, 'error');
    }
  }

  function renderCarga(plan, applied) {
    const r = plan.resumen || {};
    const chip = (s) => {
      const m = CARGA_STATUS[s] || { label: s, color: '#64748b' };
      return `<span style="display:inline-flex;align-items:center;gap:6px;border:1px solid ${m.color}33;color:${m.color};background:${m.color}14;border-radius:999px;padding:3px 10px;font-size:12px;margin:0 6px 6px 0">${m.label}: <b>${r[s]}</b></span>`;
    };
    const ap = plan.aplicado;
    document.getElementById('cargaResumen').innerHTML =
      `<div style="margin-bottom:6px;font-size:13px;color:var(--muted)">${applied ? 'Resultado' : 'Previsualización'} · ${plan.total} fila(s)` +
      (ap ? ` · <b style="color:#16a34a">${ap.creados} creados</b>${ap.errores?.length ? ` · <b style="color:#dc2626">${ap.errores.length} con error</b>` : ''}` : '') +
      `</div>` +
      CARGA_ORDER.filter(s => r[s]).map(chip).join('');

    const items = plan.items || [];
    const CAP = 500;
    const shown = items.slice(0, CAP);
    document.getElementById('cargaTabla').innerHTML = `
      <table><thead><tr>
        <th style="width:44px">#</th><th style="width:130px">Clave</th><th>Descripción</th><th style="width:90px">Tipo</th><th style="width:120px">Estado</th><th>Detalle</th>
      </tr></thead><tbody>
        ${shown.map(it => {
          const m = CARGA_STATUS[it.status] || { label: it.status, color: '#64748b' };
          return `<tr>
            <td>${it.linea}</td>
            <td style="font-family:monospace">${KoguUi.escapeHtml(it.cve_prod || '')}</td>
            <td style="font-size:12px;max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${KoguUi.escapeHtml(it.desc_prod || '')}">${KoguUi.escapeHtml(it.desc_prod || '')}</td>
            <td style="font-size:11px;color:var(--muted)">${KoguUi.escapeHtml(it.tipo_producto || '')}</td>
            <td><span style="color:${m.color};font-weight:600;font-size:12px">${m.label}</span></td>
            <td style="font-size:11px;color:var(--muted)">${KoguUi.escapeHtml(it.mensaje || '')}</td>
          </tr>`;
        }).join('')}
      </tbody></table>
      ${items.length > CAP ? `<div class="muted" style="font-size:11px;padding:8px">Mostrando ${CAP} de ${items.length} filas.</div>` : ''}`;
  }

  async function cargaPreview(e) {
    if (!cargaRows.length) return KoguApi.toast('Primero elige un archivo.', 'error');
    await KoguUi.withLoading(e.target, async () => {
      try {
        const res  = await KoguApi.apiFetch(`${BASE}/carga/preview`, { method: 'POST', body: JSON.stringify({ rows: cargaRows }) });
        const plan = KoguApi.unwrapData(res);
        renderCarga(plan, false);
        const n = plan.resumen?.crear || 0;
        const applyBtn = document.getElementById('cargaApplyBtn');
        applyBtn.disabled = n === 0;
        applyBtn.textContent = n > 0 ? `Aplicar ${n} alta(s)` : 'Aplicar';
      } catch (err) { KoguApi.toast(err.message, 'error'); }
    }, 'Analizando...');
  }

  async function cargaApply(e) {
    if (!cargaRows.length) return;
    await KoguUi.withLoading(e.target, async () => {
      try {
        const res  = await KoguApi.apiFetch(`${BASE}/carga/aplicar`, { method: 'POST', body: JSON.stringify({ rows: cargaRows }) });
        const data = KoguApi.unwrapData(res);
        renderCarga(data, true);
        const ap = data.aplicado || {};
        KoguApi.toast(`Productos creados: ${ap.creados || 0}${ap.errores?.length ? ` · ${ap.errores.length} con error` : ''}`, 'success');
        document.getElementById('cargaApplyBtn').disabled = true;
        await load();
      } catch (err) { KoguApi.toast(err.message, 'error'); }
    }, 'Aplicando...');
  }

  document.getElementById('cargaProdBtn').onclick     = openCarga;
  document.getElementById('cargaPlantillaBtn').onclick = descargarPlantillaProd;
  document.getElementById('cargaFile').onchange        = onCargaFile;
  document.getElementById('cargaPreviewBtn').onclick   = cargaPreview;
  document.getElementById('cargaApplyBtn').onclick     = cargaApply;

  // ── Estado ─────────────────────────────────────────────────────────────
  const PAGE_SIZE = 50;
  let productos   = [];
  let familias    = [];
  let subfamilias = {};
  let unidades    = [];
  let currentPage = 1;

  const val  = id => document.getElementById(id)?.value?.trim() ?? '';
  const sel  = id => document.getElementById(id)?.value ?? '';
  const setV = (id, v) => { const el = document.getElementById(id); if (el) el.value = v ?? ''; };
  const num  = id => { const v = parseFloat(document.getElementById(id)?.value); return isNaN(v) ? undefined : v; };

  // ── Catálogos de soporte ──────────────────────────────────────────────
  async function loadSupportData() {
    const [resFam, resUnd] = await Promise.all([
      KoguApi.apiFetch(BASE_FAM),
      KoguApi.apiFetch(BASE_UND),
    ]);
    familias = KoguApi.unwrapRows(resFam).filter(f => f.activo);
    unidades = KoguApi.unwrapRows(resUnd).filter(u => u.activo);
    populateFamiliasSelects();
    populateUnidadesSelects();
  }

  function populateFamiliasSelects() {
    const opts = '<option value="">— Sin familia —</option>' +
      familias.map(f => `<option value="${f.familia_id}">${KoguUi.escapeHtml(f.clave)} — ${KoguUi.escapeHtml(f.nombre)}</option>`).join('');
    document.getElementById('pFamilia').innerHTML = opts;
    document.getElementById('famFil').innerHTML =
      '<option value="">Todas las familias</option>' +
      familias.map(f => `<option value="${f.familia_id}">${KoguUi.escapeHtml(f.nombre)}</option>`).join('');
  }

  function populateUnidadesSelects() {
    const opts = '<option value="">— Seleccionar —</option>' +
      unidades.map(u => `<option value="${u.unidad_id}">${KoguUi.escapeHtml(u.clave_interna)} — ${KoguUi.escapeHtml(u.nombre)}</option>`).join('');
    const optsC = '<option value="">— Igual a uso —</option>' +
      unidades.map(u => `<option value="${u.unidad_id}">${KoguUi.escapeHtml(u.clave_interna)} — ${KoguUi.escapeHtml(u.nombre)}</option>`).join('');
    document.getElementById('pUnidad').innerHTML = opts;
    document.getElementById('pUnidadCompra').innerHTML = optsC;
  }

  async function loadSubfamiliasForFamilia(familiaId) {
    if (!familiaId) { document.getElementById('pSubfamilia').innerHTML = '<option value="">— Sin subfamilia —</option>'; return; }
    if (!subfamilias[familiaId]) {
      const res = await KoguApi.apiFetch(`${BASE_FAM}/${familiaId}/subfamilias`);
      subfamilias[familiaId] = KoguApi.unwrapRows(res).filter(s => s.activo);
    }
    document.getElementById('pSubfamilia').innerHTML =
      '<option value="">— Sin subfamilia —</option>' +
      subfamilias[familiaId].map(s =>
        `<option value="${s.subfamilia_id}">${KoguUi.escapeHtml(s.clave)} — ${KoguUi.escapeHtml(s.nombre)}</option>`
      ).join('');
  }

  document.getElementById('pFamilia').onchange = () => loadSubfamiliasForFamilia(sel('pFamilia'));

  // ── Reset / Fill ─────────────────────────────────────────────────────────
  function reset() {
    setV('productoId', ''); setV('pCve', ''); setV('pDesc', ''); setV('pNombreCorto', '');
    setV('pTipo', 'producto'); setV('pUso', 'producto_terminado');
    setV('pFamilia', ''); setV('pSubfamilia', '');
    setV('pUnidad', ''); setV('pUnidadCompra', ''); setV('pFactor', '1');
    setV('pPrecio', ''); setV('pCosto', ''); setV('pMoneda', 'MXN'); setV('pIva', '16');
    setV('pVendible', 'true'); setV('pComprable', 'true');
    setV('pActivoFijo', 'false'); setV('pInventario', 'false');
    setV('pClaveSat', ''); setV('pUnidadSat', ''); setV('pActivo', 'true');
    document.getElementById('formTitle').textContent = 'Nuevo producto';
    document.getElementById('modeChip').textContent  = 'Alta';
    document.getElementById('pSubfamilia').innerHTML = '<option value="">— Sin subfamilia —</option>';
  }

  async function fill(r) {
    setV('productoId', r.producto_id); setV('pCve', r.cve_prod); setV('pDesc', r.desc_prod);
    setV('pNombreCorto', r.nombre_corto || '');
    setV('pTipo', r.tipo_producto); setV('pUso', r.uso_producto);
    setV('pFamilia', r.familia_id || '');
    if (r.familia_id) await loadSubfamiliasForFamilia(r.familia_id);
    setV('pSubfamilia', r.subfamilia_id || '');
    setV('pUnidad', r.unidad_medida_id || ''); setV('pUnidadCompra', r.unidad_compra_id || '');
    setV('pFactor', r.factor_conversion ?? 1);
    setV('pPrecio', r.precio_base ?? ''); setV('pCosto', r.costo_base ?? '');
    setV('pMoneda', r.moneda || 'MXN'); setV('pIva', String(r.tasa_iva_default ?? 16));
    setV('pVendible', String(!!r.es_vendible)); setV('pComprable', String(!!r.es_comprable));
    setV('pActivoFijo', String(!!r.es_activo_fijo)); setV('pInventario', String(!!r.maneja_inventario));
    setV('pClaveSat', r.clave_prod_serv_sat || ''); setV('pUnidadSat', r.clave_unidad_sat || '');
    setV('pActivo', String(!!r.activo));
    document.getElementById('formTitle').textContent = 'Editar: ' + r.cve_prod;
    document.getElementById('modeChip').textContent  = 'Edición';
  }

  // ── Carga y render ────────────────────────────────────────────────────────
  async function load(showToast = false) {
    const res = await KoguApi.apiFetch(BASE);
    productos  = KoguApi.unwrapRows(res);
    currentPage = 1;
    render();
    if (showToast) KoguApi.toast('Catálogo actualizado por cambio de empresa', 'success');
  }

  const TIPO_LABEL = { producto: 'Producto', servicio: 'Servicio', kit: 'Kit' };
  const USO_SHORT  = {
    producto_terminado: 'P. Terminado', materia_prima: 'Mat. Prima',
    producto_en_proceso: 'En Proceso',  consumible: 'Consumible',
    activo_fijo: 'Activo Fijo',         mercancia_reventa: 'Reventa',
    servicio_externo: 'Serv. Externo',
  };

  function getFiltered() {
    const q  = val('q').toLowerCase();
    const tf = sel('tipoFil');
    const uf = sel('usoFil');
    const ff = sel('famFil');
    const af = sel('activoFil');
    return productos.filter(r => {
      const txt = `${r.cve_prod} ${r.desc_prod} ${r.nombre_corto || ''}`.toLowerCase();
      return (!q  || txt.includes(q))
          && (!tf || r.tipo_producto === tf)
          && (!uf || r.uso_producto  === uf)
          && (!ff || r.familia_id    === ff)
          && (af === '' || String(!!r.activo) === af);
    });
  }

  function renderPaginationProductos(total) {
    const bar        = document.getElementById('pgBarProductos');
    const totalPages = Math.ceil(total / PAGE_SIZE) || 1;
    const from       = total === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
    const to         = Math.min(currentPage * PAGE_SIZE, total);
    bar.innerHTML = `
      <span>${from}–${to} de ${total}</span>
      <div style="display:flex;gap:8px">
        <button class="btn" id="pgPrev" ${currentPage <= 1 ? 'disabled' : ''}>Anterior</button>
        <span style="padding:6px 10px;font-size:13px">${currentPage} / ${totalPages}</span>
        <button class="btn" id="pgNext" ${currentPage >= totalPages ? 'disabled' : ''}>Siguiente</button>
      </div>`;
    document.getElementById('pgPrev').onclick = () => { if (currentPage > 1)          { currentPage--; render(); } };
    document.getElementById('pgNext').onclick = () => { if (currentPage < totalPages) { currentPage++; render(); } };
  }

  function render() {
    const filtered = getFiltered();
    const page     = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
    document.getElementById('rowsProductos').innerHTML = page.length
      ? page.map(r => `
          <tr>
            <td><span class="chip-compact">${KoguUi.escapeHtml(r.cve_prod)}</span></td>
            <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${KoguUi.escapeHtml(r.desc_prod)}">${KoguUi.escapeHtml(r.desc_prod)}</td>
            <td><span class="badge neutral">${TIPO_LABEL[r.tipo_producto] || r.tipo_producto}</span></td>
            <td style="font-size:11px;color:var(--muted)">${USO_SHORT[r.uso_producto] || r.uso_producto}</td>
            <td style="font-size:11px;color:var(--muted)">${KoguUi.escapeHtml(r.familia_nombre || '-')}</td>
            <td style="text-align:right">${r.precio_base ? KoguUi.money(r.precio_base) : '-'}</td>
            <td>${KoguUi.statusBadge(r.activo ? 'activo' : 'inactivo')}</td>
            <td><button class="btn btn-edit" data-id="${r.producto_id}">Editar</button></td>
          </tr>`).join('')
      : '<tr><td colspan="8" class="empty">Sin productos</td></tr>';

    document.querySelectorAll('.btn-edit').forEach(x => x.onclick = async () => {
      const row = productos.find(r => r.producto_id === x.dataset.id);
      if (row) { reset(); await fill(row); openM(); }
    });
    renderPaginationProductos(filtered.length);
  }

  // ── Guardar ──────────────────────────────────────────────────────────────
  document.getElementById('saveProdBtn').onclick = async (e) => {
    await KoguUi.withLoading(e.target, async () => {
      try {
        const id = val('productoId');
        const payload = {
          cve_prod:            val('pCve').toUpperCase(),
          desc_prod:           val('pDesc'),
          nombre_corto:        val('pNombreCorto') || undefined,
          tipo_producto:       sel('pTipo'),
          uso_producto:        sel('pUso'),
          familia_id:          sel('pFamilia')      || undefined,
          subfamilia_id:       sel('pSubfamilia')   || undefined,
          unidad_medida_id:    sel('pUnidad')       || undefined,
          unidad_compra_id:    sel('pUnidadCompra') || undefined,
          factor_conversion:   num('pFactor') ?? 1,
          precio_base:         num('pPrecio'),
          costo_base:          num('pCosto'),
          moneda:              sel('pMoneda'),
          tasa_iva_default:    parseFloat(sel('pIva')),
          es_vendible:         sel('pVendible')   === 'true',
          es_comprable:        sel('pComprable')  === 'true',
          es_activo_fijo:      sel('pActivoFijo') === 'true',
          maneja_inventario:   sel('pInventario') === 'true',
          clave_prod_serv_sat: val('pClaveSat') || undefined,
          clave_unidad_sat:    val('pUnidadSat').toUpperCase() || undefined,
          activo:              sel('pActivo') === 'true',
        };
        if (!payload.cve_prod)  throw new Error('Clave ERP es obligatoria.');
        if (!payload.desc_prod) throw new Error('Descripción es obligatoria.');
        if (id) {
          await KoguApi.apiFetch(`${BASE}/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
          KoguApi.toast('Producto actualizado', 'success');
        } else {
          await KoguApi.apiFetch(BASE, { method: 'POST', body: JSON.stringify(payload) });
          KoguApi.toast('Producto creado', 'success');
        }
        closeM();
        reset();
        await load();
      } catch (err) { KoguApi.toast(err.message, 'error'); }
    }, 'Guardando...');
  };

  // ── Eventos ───────────────────────────────────────────────────────────────
  document.getElementById('newProdBtn').onclick = () => { reset(); openM(); };
  document.getElementById('refreshBtn').onclick = () => load(false);
  document.getElementById('q').oninput = () => { currentPage = 1; render(); };
  ['tipoFil', 'usoFil', 'famFil', 'activoFil'].forEach(id =>
    document.getElementById(id).onchange = () => { currentPage = 1; render(); }
  );

  KoguShell.subscribeEmpresaActivaChange(async () => {
    subfamilias = {};
    reset();
    await loadSupportData();
    await load(true);
  });

  await loadSupportData();
  await load();
});

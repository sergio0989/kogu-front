// ============================================================
// cargas.js — Costo (cto_): Cargas / Importación de Excel.
// El Excel se parsea en el cliente (SheetJS) y se envían las filas (JSON)
// al endpoint de la fuente seleccionada. Mismo patrón que ERP/Lab.
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/cto/cargas.html';
  const PERM = 'screen.costo';
  const BASE = '/protected/cto';

  // Fuente → endpoint + reglas. requierePeriodo: pide año/mes del corte.
  const FUENTES = [
    { code: 'factores',           label: 'Factores integrados (AbcHistorico)', ep: '/cargas/factores',            periodo:false, modo:false, hojaSug:'Sheet1' },
    { code: 'ventas_costo',       label: 'Ventas con costo (ALPHA ERP)',       ep: '/cargas/ventas-costo',        periodo:false, modo:true,  hojaSug:null },
    { code: 'producciones',       label: 'Producciones (historial)',           ep: '/cargas/producciones',        periodo:false, modo:'agregar', hojaSug:'Sheet1' },
    { code: 'costos_exportacion', label: 'Costos de exportación (Int_FacExpo)', ep: '/cargas/costos-exportacion',  periodo:false, modo:true,  hojaSug:'Sheet1' },
    { code: 'gastos_venta',       label: 'Gastos de venta por agente',         ep: '/cargas/gastos-venta',        periodo:false, modo:false, hojaSug:'AgenteCosto', soloAnio:true },
    { code: 'inventario_sistema', label: 'Inventario del sistema',             ep: '/cargas/inventario-sistema',  periodo:true,  modo:false, hojaSug:null },
    { code: 'inventario_conteo',  label: 'Conteo físico',                      ep: '/cargas/inventario-conteo',   periodo:true,  modo:false, hojaSug:null },
    { code: 'movimientos',        label: 'Movimientos / kardex (mov_ade)',     ep: '/cargas/movimientos',         periodo:false, modo:'agregar', hojaSug:null },
  ];

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Costo — Cargas / Importación',
    description: 'Importa los Excel del cálculo de costo de ventas e inventario. El archivo se lee en el navegador y se envía al servidor.',
    requiredPermission: PERM,
  });
  if (!b) return;

  const $ = (id) => document.getElementById(id);
  let workbook = null;

  // Encabezado de paso/bloque (número + título + subtítulo).
  const stepHead = (n, t, s) => `
    <div style="display:flex;align-items:center;gap:10px;margin:0 0 12px">
      <span style="flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:999px;background:#ecfeff;color:var(--primary);font-size:13px;font-weight:800;border:1px solid #cffafe">${n}</span>
      <div>
        <div style="font-size:14px;font-weight:700;color:var(--text);line-height:1.15">${t}</div>
        <div class="muted" style="font-size:11px">${s}</div>
      </div>
    </div>`;

  const c = document.getElementById('pageContent');
  c.innerHTML = `
<div class="card">
  <div class="row">
    <div><div class="eyebrow">Costo</div><h2>Cargas / Importación</h2></div>
    <button class="btn ghost" id="refreshBtn">Actualizar historial</button>
  </div>

  <!-- Bloque 1 · Origen -->
  <div style="margin-top:18px">
    ${stepHead(1, 'Origen', 'Qué vas a importar y desde qué archivo')}
    <div class="grid-2" style="gap:12px">
      <div>
        <label class="muted" style="font-size:12px">Fuente de datos</label>
        <select class="select" id="fuente">
          ${FUENTES.map(f => `<option value="${f.code}">${f.label}</option>`).join('')}
        </select>
      </div>
      <div>
        <label class="muted" style="font-size:12px">Archivo Excel (.xlsx / .xls)</label>
        <input type="file" id="archivo" accept=".xlsx,.xls" class="input"/>
      </div>
    </div>
  </div>

  <!-- Bloque 2 · Lectura del archivo -->
  <div style="margin-top:18px;padding-top:16px;border-top:1px solid var(--line)">
    ${stepHead(2, 'Lectura del archivo', 'Hoja y fila donde empiezan los encabezados')}
    <div class="grid-2" style="gap:12px">
      <div>
        <label class="muted" style="font-size:12px">Hoja</label>
        <select class="select" id="hoja"><option value="">— selecciona archivo —</option></select>
      </div>
      <div>
        <label class="muted" style="font-size:12px;display:block;margin-bottom:4px">Fila de encabezado</label>
        <input type="number" id="headerRow" class="input" value="1" min="1" style="width:120px"/>
      </div>
    </div>
  </div>

  <!-- Bloque 3 · Período de la carga -->
  <div style="margin-top:18px;padding-top:16px;border-top:1px solid var(--line)">
    ${stepHead(3, 'Período de la carga', 'Año y mes asociados a esta carga')}
    <div class="grid-2" id="periodoBox" style="gap:12px">
      <div><label class="muted" style="font-size:12px" id="anioLbl">Año del corte</label><input type="number" id="anio" class="input" placeholder="2026"/></div>
      <div id="mesBox"><label class="muted" style="font-size:12px" id="mesLbl">Mes del corte</label><input type="number" id="mes" class="input" placeholder="6" min="1" max="12"/></div>
    </div>
    <div id="periodoHint" class="muted" style="font-size:11px;margin-top:6px"></div>
    <div id="modoBox" style="margin-top:14px;display:none">
      <label class="muted" style="font-size:12px">Modo de escritura</label>
      <select class="select" id="modo" style="max-width:260px">
        <option value="reemplazar">Reemplazar periodo</option>
        <option value="agregar">Agregar (no destructivo)</option>
      </select>
    </div>
  </div>

  <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:20px">
    <button class="btn primary" id="cargarBtn">📥 Cargar</button>
  </div>

  <div id="result" style="display:none;margin-top:16px;padding:12px;border-radius:6px;font-size:13px"></div>
</div>

<div class="card" style="margin-top:16px">
  <h3 style="margin:0 0 10px 0">Cargas recientes</h3>
  <div class="table-wrap">
    <table>
      <thead><tr>
        <th>Fecha</th><th>Fuente</th><th>Periodo</th><th>Archivo</th>
        <th style="text-align:center">Estado</th><th style="text-align:right">OK / Error</th>
      </tr></thead>
      <tbody id="cargasRows"><tr><td colspan="6" style="text-align:center;padding:20px;color:var(--muted)">—</td></tr></tbody>
    </table>
  </div>
</div>`;

  function fuenteActual() { return FUENTES.find(f => f.code === $('fuente').value); }

  function syncForm() {
    const f = fuenteActual();
    // El período se captura SIEMPRE. En cortes (inventario/conteo) define el
    // renglón; en acumuladas es el "período de cierre" (solo trazabilidad +
    // reconciliación) y cada fila conserva el suyo.
    const esCorte = !!f.periodo;
    $('periodoBox').style.display = 'grid';
    $('mesBox').style.display = '';
    $('anioLbl').textContent = esCorte ? 'Año del corte' : 'Año de cierre';
    $('mesLbl').textContent = esCorte ? 'Mes del corte' : 'Mes de cierre';
    $('periodoHint').textContent = esCorte
      ? 'Define el período del corte (sustituye al anterior de ese mes).'
      : 'Etiqueta la carga para trazabilidad; cada renglón conserva su propio período. Se avisa si el archivo trae meses posteriores al cierre.';
    // Prefill con período en curso si está vacío.
    const now = new Date();
    if (!$('anio').value) $('anio').value = now.getFullYear();
    if (!$('mes').value) $('mes').value = now.getMonth() + 1;
    $('modoBox').style.display = f.modo ? 'block' : 'none';
    if (f.modo === 'agregar') $('modo').value = 'agregar';
    // sugerir hoja
    if (workbook && f.hojaSug && workbook.SheetNames.includes(f.hojaSug)) $('hoja').value = f.hojaSug;
  }

  async function onFile() {
    const file = $('archivo').files?.[0];
    $('hoja').innerHTML = '<option value="">—</option>';
    workbook = null;
    if (!file) return;
    if (typeof XLSX === 'undefined') return KoguApi.toast('SheetJS no cargó; recarga la página.', 'error');
    try {
      const buf = await file.arrayBuffer();
      workbook = XLSX.read(buf, { type: 'array', cellDates: true });
      $('hoja').innerHTML = workbook.SheetNames.map(n => `<option value="${n}">${n}</option>`).join('');
      syncForm();
    } catch (e) { KoguApi.toast('No se pudo leer el archivo: ' + e.message, 'error'); }
  }

  async function cargar() {
    const f = fuenteActual();
    const file = $('archivo').files?.[0];
    if (!file) return KoguApi.toast('Selecciona un archivo Excel.', 'error');
    if (!workbook) return KoguApi.toast('El archivo aún no se ha leído.', 'error');
    const hoja = $('hoja').value || workbook.SheetNames[0];
    const ws = workbook.Sheets[hoja];
    if (!ws) return KoguApi.toast('Hoja no encontrada.', 'error');

    const headerRow = Math.max(1, parseInt($('headerRow').value, 10) || 1);
    let rows = XLSX.utils.sheet_to_json(ws, { defval: null, raw: true, range: headerRow - 1 });
    // Normalizar encabezados: algunos exports del ERP traen espacios alrededor
    // del nombre de columna (p.ej. " cant_surt "). Trim para que el backend mapee.
    rows = rows.map(r => {
      const o = {};
      for (const k in r) o[String(k).trim()] = r[k];
      return o;
    });
    // Descartar renglones totalmente vacíos (colas/blancos de Excel).
    rows = rows.filter(r => Object.values(r).some(v => v !== null && v !== '' && v !== undefined));
    if (!rows.length) return KoguApi.toast('La hoja no tiene filas de datos.', 'error');

    // Período SIEMPRE: corte (inventario/conteo) o cierre (acumuladas).
    const anio = parseInt($('anio').value, 10), mes = parseInt($('mes').value, 10);
    if (!anio || !mes) return KoguApi.toast('Indica el año y el mes (de corte o de cierre).', 'error');
    if (f.soloAnio) {
      // Descartar renglones separadores (sin ID de agente).
      rows = rows.filter(r => (r.ID ?? r.Identificador ?? r.agente_ref ?? r.cve_agente) != null
                              && (r.Mes ?? r.mes) != null && String(r.Mes ?? r.mes).trim() !== '_');
      // El archivo de gastos no trae año; lo inyectamos por fila (el backend lee row.year).
      rows.forEach(r => { if (r.year == null && r.Year == null && r.anio == null) r.year = anio; });
      if (!rows.length) return KoguApi.toast('No hay filas de agente válidas en la hoja.', 'error');
    }
    const body = { rows, archivo_nombre: file.name, anio, mes };
    if (f.modo) body.modo = $('modo').value;

    const res$ = $('result');
    $('cargarBtn').disabled = true;
    res$.style.display = 'block';
    res$.style.cssText = 'display:block;margin-top:16px;padding:12px;border-radius:6px;font-size:13px;background:#eff6ff;color:#1e40af';
    res$.textContent = `⏳ Enviando ${rows.length.toLocaleString()} filas de "${hoja}"…`;

    try {
      const r = await KoguApi.apiFetch(`${BASE}${f.ep}`, { method: 'POST', body: JSON.stringify(body) });
      const d = KoguApi.unwrapData(r) || {};
      const errores = d.errores ?? 0;
      const aviso = d.aviso || null;             // reconciliación de período (no bloqueante)
      const warn = errores || aviso;
      res$.style.cssText = `display:block;margin-top:16px;padding:12px;border-radius:6px;font-size:13px;background:${warn ? '#fef9c3' : '#dcfce7'};color:${warn ? '#854d0e' : '#166534'}`;
      res$.innerHTML = `<strong>${warn ? '⚠ Carga con avisos' : '✅ Carga completada'}</strong><br>
        ${d.ok ?? '?'} filas OK · ${errores} con error · estado: ${d.carga?.status ?? '—'}
        ${errores && d.detalle?.length ? `<br><span style="font-size:11px">Primer error (fila ${d.detalle[0].fila}): ${escapeHtml(d.detalle[0].error)}</span>` : ''}
        ${aviso ? `<br><span style="font-size:12px">🔎 ${escapeHtml(aviso)}</span>` : ''}`;
      KoguApi.toast(warn ? 'Carga con avisos' : 'Carga completada', warn ? 'warning' : 'success');
      loadCargas();
    } catch (e) {
      res$.style.cssText = 'display:block;margin-top:16px;padding:12px;border-radius:6px;font-size:13px;background:#fee2e2;color:#991b1b';
      res$.textContent = '❌ ' + e.message;
    } finally { $('cargarBtn').disabled = false; }
  }

  async function loadCargas() {
    try {
      const r = await KoguApi.apiFetch(`${BASE}/cargas?limit=30`);
      const rows = KoguApi.unwrapData(r) || [];
      const tb = $('cargasRows');
      if (!rows.length) { tb.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--muted)">Sin cargas todavía.</td></tr>'; return; }
      tb.innerHTML = rows.map(x => {
        const periodo = (x.anio && x.mes) ? `${x.anio}-${String(x.mes).padStart(2, '0')}` : (x.anio || '—');
        const col = x.status === 'procesada' ? '#16a34a' : x.status === 'error' ? '#dc2626' : '#f59e0b';
        return `<tr>
          <td style="font-size:12px">${x.created_at ? new Date(x.created_at).toLocaleString() : '—'}</td>
          <td style="font-size:12px">${escapeHtml(x.tipo_fuente || '—')}</td>
          <td style="font-size:12px">${periodo}</td>
          <td style="font-size:12px;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(x.archivo_nombre || '—')}</td>
          <td style="text-align:center"><span class="chip" style="background:${col}22;color:${col};font-size:11px">${escapeHtml(x.status)}</span></td>
          <td style="text-align:right;font-size:12px">${x.renglones_ok ?? 0} / ${x.renglones_error ?? 0}</td>
        </tr>`;
      }).join('');
    } catch (e) { KoguApi.toast(e.message, 'error'); }
  }

  function escapeHtml(s) { return String(s ?? '').replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])); }

  $('fuente').addEventListener('change', syncForm);
  $('archivo').addEventListener('change', onFile);
  $('cargarBtn').addEventListener('click', cargar);
  $('refreshBtn').addEventListener('click', loadCargas);
  KoguShell.subscribeEmpresaActivaChange(() => loadCargas());

  syncForm();
  loadCargas();
});

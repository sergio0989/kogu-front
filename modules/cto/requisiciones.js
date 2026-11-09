// ============================================================
// requisiciones.js — Costo · Precios de requisiciones · Lista y alta.
// Co-Pack manda la requisicion por correo; aqui se sube el Excel tal cual.
// El numero se propone del nombre del archivo (o del titulo) y se avisa si
// no coinciden (caso real: REQUISICION 932.xlsx con titulo "REQUISICION 931").
// Endpoints: GET  /protected/cto/requisiciones?status&q&limit
//            POST /protected/cto/requisiciones {num_requisicion, rows, archivo_nombre, fecha_recepcion, solicitante}
// Logica pura: requisiciones-comun.js (window.CtoReq).
// Prueba: tests/cto-requisiciones-render.test.mjs
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/cto/requisiciones.html';
  const DETALLE = '/modules/cto/requisicion-detalle.html';
  const BASE = '/protected/cto/requisiciones';
  const R = window.CtoReq;
  const ir = (u) => (window.__kogu_ir || ((x) => { window.location.href = x; }))(u);

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Precios de requisiciones',
    description: 'Requisiciones de Co-Pack con el precio asignado desde el kardex de entradas.',
    requiredPermission: 'screen.cto.requisiciones',
  });
  if (!b) return;

  const puedeEscribir = KoguShell.hasPerm(b, 'cto.requisiciones.write');
  const esc = (s) => KoguUi.escapeHtml(s);
  const $ = (id) => document.getElementById(id);
  const hoyLocal = () => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
  let nueva = { rows: null, archivo: null, numAuto: null };

  const c = $('pageContent');
  c.innerHTML = `
<div class="card">
  <div class="row" style="align-items:flex-end;gap:12px;flex-wrap:wrap">
    <div style="flex:1 1 320px"><div class="eyebrow">Costo · Requisiciones</div><h2 style="margin:0">Precios de requisiciones</h2>
      <div class="muted" style="font-size:12px">Sube la lista que manda Co-Pack; almacén asigna los lotes y el precio sale de la entrada del kardex más el margen, o del precio pactado.</div></div>
    <div><label class="muted" style="font-size:12px;display:block">Estatus</label>
      <select id="fStatus" class="select" style="min-width:130px">
        <option value="">Todos</option><option value="recibida">Recibida</option><option value="calculada">Calculada</option>
        <option value="aprobada">Aprobada</option><option value="enviada">Enviada</option></select></div>
    <div><label class="muted" style="font-size:12px;display:block">Buscar</label><input id="fQ" class="input" placeholder="Número o solicitante" style="width:180px"/></div>
    <button class="btn" id="btnBuscar">Buscar</button>
    <a class="btn ghost" href="/modules/cto/precios-pactados.html">Precios pactados</a>
    ${puedeEscribir ? '<button class="btn primary" id="btnNueva">+ Nueva requisición</button>' : ''}
  </div>
  ${puedeEscribir ? `
  <div id="nuevaPanel" hidden style="margin-top:14px;padding:14px;border:1px dashed var(--line);border-radius:12px">
    <div class="row" style="gap:12px;align-items:flex-end;flex-wrap:wrap">
      <div><label class="muted" style="font-size:12px;display:block">Excel de la requisición</label><input type="file" id="nuevaArchivo" accept=".xlsx,.xls" class="input"/></div>
      <div><label class="muted" style="font-size:12px;display:block">Número</label><input id="nuevaNum" class="input" style="width:110px"/></div>
      <div><label class="muted" style="font-size:12px;display:block">Recibida el</label><input id="nuevaFecha" type="date" class="input"/></div>
      <div><label class="muted" style="font-size:12px;display:block">Solicitante</label><input id="nuevaSolicitante" class="input" style="width:140px"/></div>
      <button class="btn primary" id="btnCrear">Guardar requisición</button>
      <button class="btn ghost" id="btnCancelarNueva">Cancelar</button>
    </div>
    <div id="nuevaInfo" class="muted" style="font-size:12.5px;margin-top:8px"></div>
    <div id="nuevaMsg" class="req-msg" style="margin-top:8px;color:var(--danger);font-size:13px"></div>
  </div>` : ''}
</div>
<div class="card" style="margin-top:14px">
  <div class="table-wrap"><table>
    <thead><tr><th>Número</th><th>Solicitante</th><th>Recibida</th><th>Estatus</th><th>Partidas</th><th>Avance</th><th>Con avisos</th><th>Kardex al</th></tr></thead>
    <tbody id="reqLista"><tr><td colspan="8" class="muted">Cargando…</td></tr></tbody>
  </table></div>
  <div id="reqTotal" class="muted" style="font-size:12px;margin-top:8px"></div>
</div>`;

  async function cargar() {
    const qs = new URLSearchParams({ limit: '100' });
    if ($('fStatus').value) qs.set('status', $('fStatus').value);
    if ($('fQ').value.trim()) qs.set('q', $('fQ').value.trim());
    try {
      const res = await KoguApi.apiFetch(`${BASE}?${qs}`);
      const d = res?.data ?? res;
      const rows = d.rows || [];
      $('reqLista').innerHTML = rows.length ? rows.map((r) => `
        <tr data-id="${esc(r.requisicion_id)}">
          <td><a href="${DETALLE}?id=${encodeURIComponent(r.requisicion_id)}"><b>${esc(r.num_requisicion)}</b></a></td>
          <td>${esc(r.solicitante || '—')}</td>
          <td>${esc(R.fmtFecha(r.fecha_recepcion))}</td>
          <td><span class="badge ${R.badgeStatus(r.status)}">${esc(R.etiquetaStatus(r.status))}</span></td>
          <td>${r.n_partidas}</td>
          <td>${r.n_sin_precio ? `<span style="color:var(--warn);font-weight:600">${r.n_sin_precio} sin precio</span>` : '<span style="color:var(--success)">Completa</span>'}</td>
          <td>${r.n_con_banderas || 0}</td>
          <td>${esc(r.kardex_hasta ? R.fmtFecha(r.kardex_hasta) : '—')}</td>
        </tr>`).join('') : '<tr><td colspan="8" class="muted">No hay requisiciones con ese filtro.</td></tr>';
      $('reqTotal').textContent = `${d.total ?? rows.length} requisición(es)`;
    } catch (e) {
      $('reqLista').innerHTML = `<tr><td colspan="8" style="color:var(--danger)">${esc(e.message || 'No se pudo cargar la lista.')}</td></tr>`;
    }
  }

  async function leerExcel(file) {
    if (typeof XLSX === 'undefined') throw new Error('No cargó el lector de Excel; recarga la página.');
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false });
    return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null, raw: true });
  }

  function abrirNueva() {
    nueva = { rows: null, archivo: null, numAuto: null };
    $('nuevaPanel').hidden = false;
    $('nuevaArchivo').value = '';
    $('nuevaNum').value = '';
    $('nuevaFecha').value = hoyLocal();
    $('nuevaSolicitante').value = 'CO-PACK';
    $('nuevaInfo').textContent = '';
    $('nuevaMsg').textContent = '';
  }

  async function alElegir(ev) {
    const f = ev.target.files?.[0];
    $('nuevaMsg').textContent = '';
    if (!f) return;
    try {
      const rows = await leerExcel(f);
      nueva.rows = rows;
      nueva.archivo = f.name;
      const delArchivo = R.numDelArchivo(f.name);
      const delTitulo = R.numDelTitulo(rows);
      const propuesto = delArchivo || delTitulo || '';
      if (!$('nuevaNum').value || $('nuevaNum').value === nueva.numAuto) $('nuevaNum').value = propuesto;
      nueva.numAuto = propuesto;
      const n = R.contarPartidas(rows);
      const partes = [`${n} partidas en el archivo.`];
      if (delArchivo && delTitulo && delArchivo !== delTitulo) {
        partes.push(`⚠ El título del archivo dice REQUISICION ${delTitulo}; se guardará como ${$('nuevaNum').value} (cámbialo si no es así).`);
      }
      if (!n) partes.push('⚠ No se encontró la fila de encabezados (columna CODIGO).');
      $('nuevaInfo').textContent = partes.join(' ');
    } catch (e) {
      nueva.rows = null;
      $('nuevaMsg').textContent = e.message || 'No se pudo leer el archivo.';
    }
  }

  async function crear(ev) {
    const num = $('nuevaNum').value.trim();
    if (!nueva.rows) { $('nuevaMsg').textContent = 'Elige el archivo de la requisición.'; return; }
    if (!num) { $('nuevaMsg').textContent = 'Indica el número de requisición.'; return; }
    ev.target.disabled = true;
    try {
      const res = await KoguApi.apiFetch(BASE, { method: 'POST', body: JSON.stringify({
        num_requisicion: num, rows: nueva.rows, archivo_nombre: nueva.archivo,
        fecha_recepcion: $('nuevaFecha').value || hoyLocal(), solicitante: $('nuevaSolicitante').value.trim() || 'CO-PACK',
      }) });
      const d = res?.data ?? res;
      KoguApi.toast(`Requisición ${num} guardada con ${d.partidas ?? ''} partidas.`, 'success');
      ir(`${DETALLE}?id=${encodeURIComponent(d.requisicion.requisicion_id)}`);
    } catch (e) {
      $('nuevaMsg').textContent = e.message || 'No se pudo guardar la requisición.';
      ev.target.disabled = false;
    }
  }

  $('btnBuscar').addEventListener('click', cargar);
  $('fQ').addEventListener('keydown', (e) => { if (e.key === 'Enter') cargar(); });
  $('fStatus').addEventListener('change', cargar);
  if (puedeEscribir) {
    $('btnNueva').addEventListener('click', abrirNueva);
    $('btnCancelarNueva').addEventListener('click', () => { $('nuevaPanel').hidden = true; });
    $('nuevaArchivo').addEventListener('change', alElegir);
    $('btnCrear').addEventListener('click', crear);
  }
  KoguShell.subscribeEmpresaActivaChange?.(() => cargar());
  await cargar();
});

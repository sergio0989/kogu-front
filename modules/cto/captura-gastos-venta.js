// ============================================================
// captura-gastos-venta.js — Costo (cto_): captura de gastos de venta por
// agente DIRECTO en el sistema (sin Excel). Gemela de Captura ABC.
// Finanzas captura 4 importes por agente; KOGU deriva kg y aplica al Calcular.
//   GET  /protected/cto/gastos-venta/:anio/:mes  → agentes + lo capturado
//   POST /protected/cto/gastos-venta/:anio/:mes  → upsert importes por agente
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/cto/captura-gastos-venta.html';
  const PERM = 'screen.costo';
  const BASE = '/protected/cto';

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Captura Gastos de Venta',
    description: 'Captura los importes de gasto de venta por agente (comisiones, sueldo, gasto, carga social). KOGU deriva los kilos de las ventas y los aplica al calcular.',
    requiredPermission: PERM,
  });
  if (!b) return;

  const $ = (id) => document.getElementById(id);
  const now = new Date();
  let agentes = [];

  const mon = (v) => '$' + (Number(v) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const numv = (v) => { const n = Number(String(v).replace(/[^0-9.\-]/g, '')); return isFinite(n) ? n : 0; };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));

  const c = document.getElementById('pageContent');
  c.innerHTML = `
<div class="card">
  <div class="row">
    <div><div class="eyebrow">Costo</div><h2>Captura Gastos de Venta</h2></div>
    <div style="display:flex;gap:8px;align-items:flex-end">
      <div><label class="muted" style="font-size:12px">Año</label><input type="number" id="anio" class="input" style="width:100px" value="${now.getFullYear()}"/></div>
      <div><label class="muted" style="font-size:12px">Mes</label><input type="number" id="mes" class="input" style="width:80px" min="1" max="12" value="${now.getMonth() + 1}"/></div>
      <button class="btn ghost" id="loadBtn">Cargar agentes</button>
      <button class="btn primary" id="saveBtn" style="background:#16a34a">Guardar captura</button>
    </div>
  </div>
  <div id="msg" class="muted" style="margin-top:10px;font-size:13px">Indica el periodo y pulsa <b>Cargar agentes</b>.</div>
</div>
<div class="card" id="tabCard" style="margin-top:16px;display:none">
  <div class="row"><h3 style="margin:0">Agentes (catálogo) · importes del periodo</h3>
    <span class="muted" style="font-size:12px">KOGU deriva los kilos al calcular · solo capturas los importes</span></div>
  <div style="overflow:auto;margin-top:12px">
    <table style="width:100%;border-collapse:collapse;font-size:13px" id="tab"></table>
  </div>
</div>`;

  function render() {
    const head = `<thead><tr style="text-align:right;border-bottom:2px solid #e2e8f0">
      <th style="text-align:left;padding:8px">Agente</th>
      <th style="padding:8px">Comisiones</th><th style="padding:8px">Sueldo</th>
      <th style="padding:8px">Gasto</th><th style="padding:8px">Carga social</th>
      <th style="padding:8px">Total</th><th style="padding:8px">Estado</th></tr></thead>`;
    const inp = (i, k, v) => `<input class="input gv" data-i="${i}" data-k="${k}" style="width:120px;text-align:right" value="${Number(v) || 0}"/>`;
    const rows = agentes.map((a, i) => {
      const tot = (numv(a.comisiones_sv) + numv(a.sueldo) + numv(a.gasto));
      return `<tr style="text-align:right;border-bottom:1px solid #f1f5f9">
        <td style="text-align:left;padding:8px;font-weight:600">${esc(a.nombre)} <span class="muted" style="font-size:11px">(${esc(a.cve_agente)})</span></td>
        <td style="padding:6px">${inp(i, 'comisiones_sv', a.comisiones_sv)}</td>
        <td style="padding:6px">${inp(i, 'sueldo', a.sueldo)}</td>
        <td style="padding:6px">${inp(i, 'gasto', a.gasto)}</td>
        <td style="padding:6px">${inp(i, 'carga_social', a.carga_social)}</td>
        <td style="padding:8px;font-weight:600" id="tot-${i}">${mon(tot)}</td>
        <td style="padding:8px">${a.capturado ? '<span class="chip" style="background:#dcfce7;color:#166534;font-size:10px;font-weight:700;padding:1px 6px">capturado</span>' : '<span class="muted" style="font-size:11px">—</span>'}</td>
      </tr>`;
    }).join('');
    $('tab').innerHTML = head + '<tbody>' + rows + '</tbody>';
    document.querySelectorAll('.gv').forEach((el) => el.addEventListener('input', onEdit));
  }

  function onEdit(e) {
    const i = +e.target.dataset.i, k = e.target.dataset.k;
    agentes[i][k] = numv(e.target.value);
    const tot = numv(agentes[i].comisiones_sv) + numv(agentes[i].sueldo) + numv(agentes[i].gasto);
    $('tot-' + i).textContent = mon(tot);
  }

  async function cargar() {
    const anio = $('anio').value, mes = $('mes').value;
    if (!anio || !mes) return KoguApi.toast('Indica año y mes.', 'error');
    $('msg').textContent = 'Cargando agentes…';
    try {
      const d = KoguApi.unwrapData(await KoguApi.apiFetch(`${BASE}/gastos-venta/${anio}/${mes}`));
      agentes = (d.agentes || []).map((a) => ({ ...a }));
      $('tabCard').style.display = 'block';
      render();
      const cap = agentes.filter((a) => a.capturado).length;
      $('msg').innerHTML = `<b>${agentes.length}</b> agentes · <b>${cap}</b> ya capturados. Edita los importes y pulsa <b>Guardar captura</b>.`;
    } catch (e) { $('msg').textContent = ''; KoguApi.toast(e.message, 'error'); }
  }

  async function guardar() {
    const anio = $('anio').value, mes = $('mes').value;
    if (!agentes.length) return KoguApi.toast('Primero carga los agentes.', 'error');
    // solo enviar agentes con algún importe > 0 (evita crear filas vacías)
    const payload = agentes
      .filter((a) => numv(a.comisiones_sv) || numv(a.sueldo) || numv(a.gasto) || numv(a.carga_social))
      .map((a) => ({ agente_id: a.agente_id, cve_agente: a.cve_agente, nombre: a.nombre,
        comisiones_sv: numv(a.comisiones_sv), sueldo: numv(a.sueldo), gasto: numv(a.gasto), carga_social: numv(a.carga_social) }));
    if (!payload.length) return KoguApi.toast('No hay importes capturados.', 'error');
    $('msg').textContent = 'Guardando…';
    try {
      const d = KoguApi.unwrapData(await KoguApi.apiFetch(`${BASE}/gastos-venta/${anio}/${mes}`, {
        method: 'POST', body: JSON.stringify({ agentes: payload }),
      }));
      KoguApi.toast(`Guardado: ${d.capturados} agentes`, 'success');
      $('msg').innerHTML = `Guardados <b>${d.capturados}</b> agentes. Ahora <b>Calcular</b> el periodo para aplicar el gasto de venta.`;
      cargar();
    } catch (e) { $('msg').textContent = ''; KoguApi.toast(e.message, 'error'); }
  }

  $('loadBtn').onclick = cargar;
  $('saveBtn').onclick = guardar;
});

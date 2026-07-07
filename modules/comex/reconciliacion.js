// ============================================================
// reconciliacion.js — Comercio Exterior (comex_): Reconciliación real vs teórico.
// C.1: sube las DBF de SAI (COSTEOS/COSTEOC/COSTEOD) y muestra el costeo REAL
// por operación (kg, flete int'l=INDICANTID, otros=INDIPESO, arancel, DDP).
// C.2 (después): motor de reconciliación vs costeo teórico + banda ± + CRM.
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/comex/reconciliacion.html';
  const PERM = 'screen.comex.reconciliacion';
  const BASE = '/protected/comex/real';

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Reconciliación (real vs teórico)',
    description: 'Carga el costeo real de SAI (DBF) y compáralo contra el costeo teórico.',
    requiredPermission: PERM,
  });
  if (!b) return;

  const $ = (id) => document.getElementById(id);
  const c = $('pageContent');
  const money = (v) => '$' + (Number(v) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const n0 = (v) => (Number(v) || 0).toLocaleString('es-MX');
  const kg = (v) => (Number(v) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const fdate = (v) => v ? new Date(v).toLocaleString('es-MX') : '';

  c.innerHTML = `
<div class="card">
  <div class="row">
    <div><div class="eyebrow">Comercio Exterior · Reconciliación</div><h2>Costeo real (SAI)</h2>
      <div class="muted" style="font-size:12px">Sube las DBF <strong>COSTEOS / COSTEOC / COSTEOD</strong> (sueltas o en zip). Es un <strong>snapshot acumulado</strong>: cada carga reemplaza la anterior. Se filtran cancelados y borrados.</div></div>
  </div>
  <div style="display:flex;gap:12px;align-items:flex-end;margin-top:14px;flex-wrap:wrap">
    <div><label class="muted" style="font-size:12px;display:block">DBF (o zip)</label>
      <input type="file" id="file" accept=".dbf,.zip" multiple class="input" style="max-width:360px"/></div>
    <button class="btn primary" id="procBtn" style="background:#0891b2">📥 Procesar DBF</button>
    <span id="proc" class="muted" style="font-size:12px"></span>
  </div>
  <div class="muted" style="font-size:11px;margin-top:6px">La reconciliación es por mes, pero la guía la matriz SAT (mensual): cruza los pedimentos del mes contra este snapshot real.</div>
  <div id="msg" style="display:none;margin-top:12px;padding:10px;border-radius:6px;font-size:13px"></div>
</div>

<div class="card" style="margin-top:14px">
  <div class="row"><h3 style="margin:0">Cargas</h3><span class="muted" style="font-size:12px">costeos reales por periodo</span></div>
  <div style="overflow-x:auto;margin-top:10px"><table class="table" id="tCargas" style="width:100%;font-size:13px;font-variant-numeric:tabular-nums"></table></div>
</div>

<div class="card" id="realCard" style="margin-top:14px;display:none">
  <div class="row"><div><h3 style="margin:0" id="realTit">Costeo real</h3>
    <span class="muted" style="font-size:12px">DIRECTO = mercancía (se excluye) · flete int'l = INDICANTID · otros = INDIPESO</span></div></div>
  <div style="overflow-x:auto;margin-top:10px"><table class="table" id="tReal" style="width:100%;font-size:12.5px;font-variant-numeric:tabular-nums"></table></div>
</div>`;

  function showMsg(html, tipo) {
    const m = $('msg');
    const bg = tipo === 'error' ? '#fee2e2' : tipo === 'warn' ? '#fef9c3' : '#dcfce7';
    const co = tipo === 'error' ? '#991b1b' : tipo === 'warn' ? '#854d0e' : '#166534';
    m.style.cssText = `display:block;margin-top:12px;padding:10px;border-radius:6px;font-size:13px;background:${bg};color:${co}`;
    m.innerHTML = html;
  }
  function chip(s) {
    const map = { procesando: ['#fef3c7', '#92400e'], completado: ['#dcfce7', '#166534'], error: ['#fee2e2', '#991b1b'] };
    const m = map[s] || map.procesando;
    return `<span class="chip" style="background:${m[0]};color:${m[1]};font-size:11px;font-weight:800;padding:2px 9px;border-radius:999px">${esc(s)}</span>`;
  }

  async function procesar() {
    const files = $('file').files;
    if (!files || !files.length) return KoguApi.toast('Elige las DBF o un zip.', 'error');
    $('procBtn').disabled = true; $('proc').textContent = '⏳ Procesando…';
    try {
      const fd = new FormData();
      for (const f of files) fd.append('archivos', f);
      const d = KoguApi.unwrapData(await KoguApi.apiFetch(BASE + '/cargar', { method: 'POST', body: fd })) || {};
      const r = d.resumen || {};
      showMsg(`✅ Procesado: ${n0(r.costeos?.activos)} costeos activos (${n0(r.costeos?.cancelados)} cancelados) · ${n0(d.n_partidas)} partidas · ${n0(d.n_gastos)} gastos.`, 'ok');
      $('proc').textContent = ''; $('file').value = '';
      await cargarCargas();
      if (d.carga_id) verReal(d.carga_id);
    } catch (e) { showMsg('❌ ' + e.message, 'error'); $('proc').textContent = ''; }
    finally { $('procBtn').disabled = false; }
  }

  async function cargarCargas() {
    const head = `<thead><tr style="border-bottom:2px solid #e2e8f0;text-align:right">
      <th style="text-align:left;padding:7px">Periodo</th><th style="text-align:left;padding:7px">Archivo</th>
      <th>Costeos</th><th>Partidas</th><th>Gastos</th><th style="text-align:center;padding:7px">Estatus</th>
      <th style="text-align:left;padding:7px">Fecha</th><th></th></tr></thead>`;
    try {
      const rows = KoguApi.unwrapData(await KoguApi.apiFetch(BASE + '/cargas')) || [];
      if (!rows.length) { $('tCargas').innerHTML = head + '<tbody><tr><td colspan="8" style="text-align:center;padding:18px;color:var(--muted)">Sin cargas. Sube las DBF.</td></tr></tbody>'; return; }
      $('tCargas').innerHTML = head + '<tbody>' + rows.map(r => `<tr style="border-bottom:1px solid #f1f5f9;text-align:right">
        <td style="text-align:left;padding:7px;font-weight:700">${esc(r.periodo || '—')}</td>
        <td style="text-align:left;padding:7px">${esc(r.archivo_nombre || '')}</td>
        <td style="padding:7px">${n0(r.n_costeos)}</td><td style="padding:7px">${n0(r.n_partidas)}</td><td style="padding:7px">${n0(r.n_gastos)}</td>
        <td style="text-align:center;padding:7px">${chip(r.status)}</td>
        <td style="text-align:left;padding:7px">${fdate(r.created_at)}</td>
        <td style="padding:7px;white-space:nowrap"><button class="btn ghost" style="padding:2px 8px" data-ver="${r.carga_id}">Ver</button>
          <button class="btn ghost" style="padding:2px 8px;color:#991b1b" data-del="${r.carga_id}">✕</button></td></tr>`).join('') + '</tbody>';
      $('tCargas').querySelectorAll('button[data-ver]').forEach(bn => bn.addEventListener('click', () => verReal(bn.dataset.ver)));
      $('tCargas').querySelectorAll('button[data-del]').forEach(bn => bn.addEventListener('click', () => borrar(bn.dataset.del)));
    } catch (e) { KoguApi.toast(e.message, 'error'); }
  }

  async function verReal(cargaId) {
    try {
      const rows = KoguApi.unwrapData(await KoguApi.apiFetch(BASE + '/costeos?carga_id=' + encodeURIComponent(cargaId))) || [];
      $('realCard').style.display = 'block';
      $('realTit').textContent = 'Costeo real · ' + n0(rows.length) + ' operaciones';
      const head = `<thead><tr style="border-bottom:2px solid #e2e8f0;text-align:right">
        <th style="text-align:left;padding:6px">No. costeo</th><th style="text-align:left;padding:6px">Pedimento (REFERENCIA)</th>
        <th>Kg</th><th>Flete int'l</th><th>Otros</th><th>Arancel</th><th>Mercancía (DIRECTO)</th><th>DDP total</th></tr></thead>`;
      if (!rows.length) { $('tReal').innerHTML = head + '<tbody><tr><td colspan="8" style="text-align:center;padding:16px;color:var(--muted)">Sin operaciones.</td></tr></tbody>'; return; }
      $('tReal').innerHTML = head + '<tbody>' + rows.map(r => `<tr style="border-bottom:1px solid #f1f5f9;text-align:right">
        <td style="text-align:left;padding:6px;font-weight:700">${esc(r.no_costeo)}</td>
        <td style="text-align:left;padding:6px">${esc(r.referencia || '')}</td>
        <td style="padding:6px">${kg(r.kg)}</td>
        <td style="padding:6px">${money(r.flete_int)}</td>
        <td style="padding:6px">${money(r.otros)}</td>
        <td style="padding:6px">${money(r.arancel)}</td>
        <td style="padding:6px;color:#94a3b8">${money(r.directo)}</td>
        <td style="padding:6px;font-weight:700">${money(r.ctotot)}</td></tr>`).join('') + '</tbody>';
    } catch (e) { KoguApi.toast(e.message, 'error'); }
  }

  async function borrar(cargaId) {
    if (!confirm('¿Eliminar esta carga real?')) return;
    try { await KoguApi.apiFetch(BASE + '/cargas/' + cargaId, { method: 'DELETE' }); KoguApi.toast('Carga eliminada', 'success');
      $('realCard').style.display = 'none'; cargarCargas();
    } catch (e) { KoguApi.toast(e.message, 'error'); }
  }

  $('procBtn').addEventListener('click', procesar);
  KoguShell.subscribeEmpresaActivaChange(() => { $('realCard').style.display = 'none'; cargarCargas(); });
  cargarCargas();
});

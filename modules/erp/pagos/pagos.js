/* KOGU Multiempresa — ERP Pagos / Tesorería (CxC + CxP) */
document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/erp/pagos/pagos.html';
  const BASE = '/protected/erp';
  const PERM = 'screen.erp.pagos';

  const b = await KoguShell.initShell({ currentPage: PAGE, title: 'Pagos / Tesorería', description: 'CxC y CxP consolidadas por empresa. Sincroniza desde ventas y compras importadas.', requiredPermission: PERM });
  if (!b) return;

  document.getElementById('pageContent').innerHTML = `
<div class="stack" style="gap:20px">

  <!-- Resumen CxC + CxP -->
  <div class="card">
    <div class="row" style="margin-bottom:16px">
      <div>
        <div class="eyebrow">Tesorería</div>
        <h2>Resumen CxC / CxP</h2>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn" id="refreshResumenBtn">Actualizar</button>
        <button class="btn primary" id="sincronizarBtn">⟳ Sincronizar</button>
      </div>
    </div>

    <!-- CxC -->
    <div class="eyebrow" style="margin-bottom:8px;color:#16a34a">Cuentas por Cobrar (CxC)</div>
    <div id="kpisCxc" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:20px">
      <div class="kpi"><div class="label">Total docs</div><div class="value" id="cxcTotal">—</div></div>
      <div class="kpi"><div class="label">Importe MXN</div><div class="value" id="cxcMXN">—</div></div>
      <div class="kpi"><div class="label">Importe USD</div><div class="value" id="cxcUSD">—</div></div>
      <div class="kpi"><div class="label">Pendientes</div><div class="value" id="cxcPend">—</div><div class="hint">sin liquidar</div></div>
      <div class="kpi"><div class="label">Liquidados</div><div class="value" id="cxcLiq">—</div></div>
    </div>

    <!-- CxP -->
    <div class="eyebrow" style="margin-bottom:8px;color:#dc2626">Cuentas por Pagar (CxP)</div>
    <div id="kpisCxp" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px">
      <div class="kpi"><div class="label">Total docs</div><div class="value" id="cxpTotal">—</div></div>
      <div class="kpi"><div class="label">Importe MXN</div><div class="value" id="cxpMXN">—</div></div>
      <div class="kpi"><div class="label">Importe USD</div><div class="value" id="cxpUSD">—</div></div>
      <div class="kpi"><div class="label">Pendientes</div><div class="value" id="cxpPend">—</div><div class="hint">sin pagar</div></div>
      <div class="kpi"><div class="label">Pagados</div><div class="value" id="cxpPag">—</div></div>
    </div>
  </div>

  <!-- Tabla de movimientos -->
  <div class="card">
    <div class="row">
      <div><div class="eyebrow">Movimientos</div><h2>CxC + CxP</h2></div>
      <button class="btn" id="refreshBtn">Actualizar</button>
    </div>
    <div class="grid-2" style="margin-top:14px;gap:10px;grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">
      <input  class="input"  id="q"        placeholder="Folio / tercero / RFC" />
      <select class="select" id="tipoFil">
        <option value="">CxC + CxP</option>
        <option value="CxC">Solo CxC</option>
        <option value="CxP">Solo CxP</option>
      </select>
      <select class="select" id="statusFil">
        <option value="">Todos los estatus</option>
        <option value="pendiente">Pendiente</option>
        <option value="parcial">Parcial</option>
        <option value="liquidado">Liquidado</option>
        <option value="cancelado">Cancelado</option>
      </select>
      <select class="select" id="monedaFil">
        <option value="">Todas las monedas</option>
        <option value="MXN">MXN</option>
        <option value="USD">USD</option>
      </select>
    </div>
    <div class="table-wrap" style="margin-top:14px">
      <table>
        <thead><tr>
          <th>#</th><th>Tipo</th><th>Folio doc.</th><th>Fecha</th><th>Tercero</th>
          <th style="text-align:right">Importe</th><th style="text-align:right">Saldo</th>
          <th>Mon</th><th>Estatus</th><th>Vence</th>
        </tr></thead>
        <tbody id="rows"></tbody>
      </table>
    </div>
    <div id="pager" style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px;align-items:center"></div>
  </div>
</div>`;

  let page = 1;
  const LIMIT = 50;
  const fmt = v => KoguUi.money(v);

  // ── Resumen ───────────────────────────────────────────────
  async function loadResumen() {
    try {
      const res  = await KoguApi.apiFetch(`${BASE}/pagos/resumen`);
      const data = res?.data || res || {};
      const cxc  = data.cxc || {};
      const cxp  = data.cxp || {};

      document.getElementById('cxcTotal').textContent = (cxc.total??0).toLocaleString();
      document.getElementById('cxcMXN').textContent   = fmt(cxc.importe_mxn);
      document.getElementById('cxcUSD').textContent   = `$${Number(cxc.importe_usd||0).toLocaleString('es-MX',{minimumFractionDigits:2})}`;
      document.getElementById('cxcPend').textContent  = (cxc.pendientes??0).toLocaleString();
      document.getElementById('cxcLiq').textContent   = (cxc.liquidados??0).toLocaleString();

      document.getElementById('cxpTotal').textContent = (cxp.total??0).toLocaleString();
      document.getElementById('cxpMXN').textContent   = fmt(cxp.importe_mxn);
      document.getElementById('cxpUSD').textContent   = `$${Number(cxp.importe_usd||0).toLocaleString('es-MX',{minimumFractionDigits:2})}`;
      document.getElementById('cxpPend').textContent  = (cxp.pendientes??0).toLocaleString();
      document.getElementById('cxpPag').textContent   = (cxp.pagados??0).toLocaleString();
    } catch(_) {}
  }

  // ── Sincronizar ───────────────────────────────────────────
  document.getElementById('sincronizarBtn').onclick = async (e) => {
    await KoguUi.withLoading(e.target, async () => {
      try {
        await KoguApi.apiFetch(`${BASE}/pagos/sincronizar`, { method: 'POST' });
        KoguApi.toast('CxC y CxP sincronizadas correctamente.', 'success');
        await loadResumen();
        page = 1;
        await loadPagos();
      } catch(err) {
        KoguApi.toast('Error al sincronizar: ' + err.message, 'error');
      }
    }, 'Sincronizando...');
  };

  document.getElementById('refreshResumenBtn').onclick = loadResumen;

  // ── Lista de pagos ────────────────────────────────────────
  async function loadPagos() {
    const qs = new URLSearchParams({ limit: LIMIT, offset: (page-1)*LIMIT });
    const qv = document.getElementById('q').value.trim(); if (qv) qs.set('q', qv);
    const tf = document.getElementById('tipoFil').value; if (tf) qs.set('tipo_doc', tf);
    const sf = document.getElementById('statusFil').value; if (sf) qs.set('status', sf);
    const mf = document.getElementById('monedaFil').value; if (mf) qs.set('cve_mon', mf);

    try {
      const res   = await KoguApi.apiFetch(`${BASE}/pagos?${qs}`);
      const rows  = KoguApi.unwrapRows(res);
      const total = res?.data?.total ?? rows.length;
      renderRows(rows, total);
    } catch(_) {
      document.getElementById('rows').innerHTML = '<tr><td colspan="10" class="empty">No se pudo cargar la información.</td></tr>';
    }
  }

  const TIPO_COLOR = { CxC: '#16a34a', CxP: '#dc2626' };

  function renderRows(rows, total) {
    document.getElementById('rows').innerHTML = rows.length
      ? rows.map(r => {
          const color = TIPO_COLOR[r.tipo_doc] || 'var(--fg)';
          const vence = r.fecha_vence ? new Date(r.fecha_vence).toLocaleDateString('es-MX') : '-';
          const hoy   = new Date();
          const vencido = r.fecha_vence && new Date(r.fecha_vence) < hoy && r.status !== 'liquidado' && r.status !== 'cancelado';
          return `<tr${vencido ? ' style="background:rgba(220,38,38,.04)"' : ''}>
            <td style="color:var(--muted);font-size:12px">${r.id_mov??'-'}</td>
            <td><span class="chip-compact" style="color:${color}">${r.tipo_doc??'-'}</span></td>
            <td><strong>${KoguUi.escapeHtml(r.folio_doc??'-')}</strong></td>
            <td style="white-space:nowrap">${r.fecha_doc?new Date(r.fecha_doc).toLocaleDateString('es-MX'):'-'}</td>
            <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${KoguUi.escapeHtml(r.nombre_tercero??'-')}</td>
            <td style="text-align:right;font-weight:700">${fmt(r.importe)}</td>
            <td style="text-align:right;color:${vencido?'#dc2626':'inherit'}">${fmt(r.saldo)}</td>
            <td><span class="chip-compact">${r.cve_mon??'-'}</span></td>
            <td>${KoguUi.statusBadge(r.status??'-')}</td>
            <td style="white-space:nowrap;font-size:12px;color:${vencido?'#dc2626':'var(--muted)'}">${vence}${vencido?' ⚠':''}
            </td>
          </tr>`;
        }).join('')
      : '<tr><td colspan="10" class="empty">Sin movimientos. Presiona "Sincronizar" para traer CxC y CxP desde ventas y compras importadas.</td></tr>';

    const pages = Math.ceil(total / LIMIT);
    document.getElementById('pager').innerHTML = pages > 1
      ? `<span style="font-size:12px;color:var(--muted)">${total.toLocaleString()} registros</span>
         <button class="btn" id="prev" ${page<=1?'disabled':''}>‹ Ant.</button>
         <span style="font-size:13px;font-weight:600">${page}/${pages}</span>
         <button class="btn" id="next" ${page>=pages?'disabled':''}>Sig. ›</button>` : '';
    document.getElementById('prev')?.addEventListener('click', ()=>{ page--; loadPagos(); });
    document.getElementById('next')?.addEventListener('click', ()=>{ page++; loadPagos(); });
  }

  ['tipoFil','statusFil','monedaFil'].forEach(id =>
    document.getElementById(id)?.addEventListener('change', ()=>{ page=1; loadPagos(); })
  );
  document.getElementById('q').addEventListener('input', ()=>{ page=1; loadPagos(); });
  document.getElementById('refreshBtn').onclick = ()=>{ page=1; loadPagos(); };

  KoguShell.subscribeEmpresaActivaChange(async () => {
    page = 1;
    await Promise.all([loadResumen(), loadPagos()]);
  });

  await Promise.all([loadResumen(), loadPagos()]);
});

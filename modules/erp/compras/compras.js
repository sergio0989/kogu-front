/* KOGU Multiempresa — ERP Compras */
document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/erp/compras/compras.html';
  const BASE = '/protected/erp';
  const PERM = 'screen.erp.compras';

  const b = await KoguShell.initShell({ currentPage: PAGE, title: 'Compras ERP', description: 'Consulta y análisis de facturas de compra importadas.', requiredPermission: PERM });
  if (!b) return;

  // ── Mes anterior por defecto ──────────────────────────────
  const hoy    = new Date();
  const defMes = hoy.getMonth() === 0 ? 12 : hoy.getMonth();
  const defAño = hoy.getMonth() === 0 ? hoy.getFullYear() - 1 : hoy.getFullYear();

  // cve_mon: 1 = MXN, 2 = USD
  const MON_LABEL = { 1: 'MXN', 2: 'USD', '1': 'MXN', '2': 'USD' };

  document.getElementById('pageContent').innerHTML = `
<div class="stack" style="gap:20px">

  <!-- KPIs -->
  <div class="card" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px">
    <div class="kpi"><div class="label">Facturas</div><div class="value" id="kpiTotal">—</div><div class="hint">del período</div></div>
    <div class="kpi"><div class="label">Subtotal MXN</div><div class="value" id="kpiMXN">—</div><div class="hint">subt. líneas MN</div></div>
    <div class="kpi"><div class="label">Subtotal USD</div><div class="value" id="kpiUSD">—</div><div class="hint">subt. líneas ME</div></div>
    <div class="kpi"><div class="label">Total MXN</div><div class="value" id="kpiTotMXN">—</div><div class="hint">total fact. MN</div></div>
  </div>

  <!-- Filtros + tabla -->
  <div class="card">
    <div class="row">
      <div><div class="eyebrow">Catálogo</div><h2>Facturas de Compra</h2></div>
      <button class="btn" id="refreshBtn">Actualizar</button>
    </div>
    <div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end">
      <div>
        <div class="label-text" style="font-size:11px;margin-bottom:4px">Buscar</div>
        <input class="input" id="q" placeholder="No. compra / proveedor / producto" style="min-width:200px"/>
      </div>
      <div>
        <div class="label-text" style="font-size:11px;margin-bottom:4px">Estatus</div>
        <select class="select" id="statusFil">
          <option value="">Todos</option>
          <option value="Pagada">Pagada</option>
          <option value="Pendiente">Pendiente</option>
          <option value="Parcial">Parcial</option>
          <option value="Cancelada">Cancelada</option>
        </select>
      </div>
      <div>
        <div class="label-text" style="font-size:11px;margin-bottom:4px">Moneda</div>
        <select class="select" id="monedaFil">
          <option value="">Todas</option>
          <option value="1">MXN</option>
          <option value="2">USD</option>
        </select>
      </div>
      <div>
        <div class="label-text" style="font-size:11px;margin-bottom:4px">Año</div>
        <input class="input" id="añoFil" value="${defAño}" maxlength="4" style="width:90px"/>
      </div>
      <div>
        <div class="label-text" style="font-size:11px;margin-bottom:4px">Mes</div>
        <select class="select" id="mesFil">
          <option value="">Todos</option>
          ${['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
            .map((m,i)=>`<option value="${i+1}" ${i+1===defMes?'selected':''}>${m}</option>`).join('')}
        </select>
      </div>
    </div>

    <!-- Totales del período -->
    <div id="periodoTotales" style="margin-top:12px;background:var(--panel2);border-radius:10px;padding:10px 14px;font-size:13px;display:none">
      <span style="color:var(--muted)">Período filtrado — </span>
      <strong id="ptDocs">0</strong> facturas ·
      Subtotal MXN: <strong id="ptSubMXN">$0</strong> ·
      Subtotal USD: <strong id="ptSubUSD">$0</strong> ·
      Total MXN: <strong id="ptTotMXN">$0</strong> ·
      Total USD: <strong id="ptTotUSD">$0</strong>
    </div>

    <div class="table-wrap" style="margin-top:12px">
      <table>
        <thead><tr>
          <th style="width:40px">#</th>
          <th>No. Compra</th>
          <th>No. Factura Prov.</th>
          <th>Fecha</th>
          <th>Proveedor</th>
          <th style="text-align:right">Subtotal MXN</th>
          <th style="text-align:right">Total Factura</th>
          <th>Mon</th>
          <th>Líneas</th>
          <th>Estatus</th>
        </tr></thead>
        <tbody id="rows"></tbody>
      </table>
    </div>
    <div id="pager" style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px;align-items:center"></div>
  </div>
</div>`;

  let page = 1;
  const LIMIT = 50;
  const fmt = v => {
    const n = Number(v || 0);
    return (n < 0 ? '-' : '') + '$' + Math.abs(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  function buildFilters() {
    const qs = new URLSearchParams();
    const qv = document.getElementById('q').value.trim();      if (qv) qs.set('q', qv);
    const sf = document.getElementById('statusFil').value;     if (sf) qs.set('status_fac', sf);
    const mf = document.getElementById('monedaFil').value;     if (mf) qs.set('cve_mon', mf);
    const af = document.getElementById('añoFil').value.trim(); if (af) qs.set('año', af);
    const ef = document.getElementById('mesFil').value;        if (ef) qs.set('mes', ef);
    return qs;
  }

  async function load() {
    const filters = buildFilters();
    const qs = new URLSearchParams(filters);
    qs.set('limit',  LIMIT);
    qs.set('offset', (page - 1) * LIMIT);

    try {
      const [res, resTot] = await Promise.all([
        KoguApi.apiFetch(`${BASE}/compras?${qs}`),
        KoguApi.apiFetch(`${BASE}/compras/totales?${filters}`),
      ]);
      const rows  = KoguApi.unwrapRows(res);
      const total = rows.length ? Number(rows[0].total_count ?? rows.length) : 0;
      const tots  = resTot?.data ?? resTot ?? {};

      renderKpis(tots);
      renderTotales(tots);
      renderRows(rows, total);
    } catch(err) {
      console.error('[compras] load() error:', err);
      document.getElementById('rows').innerHTML =
        `<tr><td colspan="10" class="empty">Error al cargar: ${KoguUi.escapeHtml(String(err?.message || err))}</td></tr>`;
    }
  }

  function renderKpis(tots) {
    document.getElementById('kpiTotal').textContent  = Number(tots.facturas  || 0).toLocaleString();
    document.getElementById('kpiMXN').textContent    = fmt(tots.subtot_mxn);
    document.getElementById('kpiUSD').textContent    = fmt(tots.subtot_usd);
    document.getElementById('kpiTotMXN').textContent = fmt(tots.total_mxn);
  }

  function renderTotales(tots) {
    const n = Number(tots.facturas || 0);
    if (!n) { document.getElementById('periodoTotales').style.display = 'none'; return; }

    document.getElementById('ptDocs').textContent   = n.toLocaleString();
    document.getElementById('ptSubMXN').textContent = fmt(tots.subtot_mxn);
    document.getElementById('ptSubUSD').textContent = fmt(tots.subtot_usd);
    document.getElementById('ptTotMXN').textContent = fmt(tots.total_mxn);
    document.getElementById('ptTotUSD').textContent = fmt(tots.total_usd);
    document.getElementById('periodoTotales').style.display = '';
  }

  function renderRows(rows, total) {
    document.getElementById('rows').innerHTML = rows.length
      ? rows.map(r => {
          const fecha    = r.falta_fac ? new Date(r.falta_fac).toLocaleDateString('es-MX') : '-';
          const monLabel = MON_LABEL[r.cve_mon] ?? String(r.cve_mon ?? '-');
          return `<tr>
            <td style="color:var(--muted);font-size:12px">${r.id_mov??'-'}</td>
            <td><strong>${KoguUi.escapeHtml(String(r.no_fcomp??'-'))}</strong></td>
            <td style="font-size:12px;color:var(--muted)">${KoguUi.escapeHtml(r.no_facc??'-')}</td>
            <td style="white-space:nowrap">${fecha}</td>
            <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
                title="${KoguUi.escapeHtml(r.nom_prov??'')}">${KoguUi.escapeHtml(r.nom_prov??'-')}</td>
            <td style="text-align:right">${fmt(r.subtotmn_sum)}</td>
            <td style="text-align:right;font-weight:700">${fmt(r.total_fac)}</td>
            <td><span class="chip-compact">${monLabel}</span></td>
            <td style="text-align:right;color:var(--muted);font-size:12px">${r.lineas??'-'}</td>
            <td>${KoguUi.statusBadge(r.status_fac??'-')}</td>
          </tr>`;
        }).join('')
      : '<tr><td colspan="10" class="empty">Sin compras registradas para esta empresa y período.</td></tr>';

    const pages = Math.ceil(total / LIMIT);
    document.getElementById('pager').innerHTML = pages > 1
      ? `<span style="font-size:12px;color:var(--muted)">${total.toLocaleString()} registros</span>
         <button class="btn" id="prev" ${page<=1?'disabled':''}>‹ Ant.</button>
         <span style="font-size:13px;font-weight:600">${page}/${pages}</span>
         <button class="btn" id="next" ${page>=pages?'disabled':''}>Sig. ›</button>` : '';
    document.getElementById('prev')?.addEventListener('click', ()=>{ page--; load(); });
    document.getElementById('next')?.addEventListener('click', ()=>{ page++; load(); });
  }

  ['statusFil','monedaFil','añoFil','mesFil'].forEach(id =>
    document.getElementById(id)?.addEventListener('change', ()=>{ page=1; load(); })
  );
  document.getElementById('q').addEventListener('input', ()=>{ page=1; load(); });
  document.getElementById('refreshBtn').onclick = ()=>{ page=1; load(); };
  KoguShell.subscribeEmpresaActivaChange(async ()=>{ page=1; await load(); });
  await load();
});

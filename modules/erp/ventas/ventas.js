/* KOGU Multiempresa — ERP Ventas */
document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/erp/ventas/ventas.html';
  const BASE = '/protected/erp';
  const PERM = 'screen.erp.ventas';

  const b = await KoguShell.initShell({ currentPage: PAGE, title: 'Ventas ERP', description: 'Consulta y análisis de facturas de venta importadas.', requiredPermission: PERM });
  if (!b) return;

  // ── Mes anterior por defecto ──────────────────────────────
  const hoy       = new Date();
  const defMes    = hoy.getMonth() === 0 ? 12 : hoy.getMonth();        // getMonth() es 0-based
  const defAño    = hoy.getMonth() === 0 ? hoy.getFullYear() - 1 : hoy.getFullYear();

  // cve_mon: 1 = MXN, 2 = USD
  const MON_LABEL = { 1: 'MXN', 2: 'USD', '1': 'MXN', '2': 'USD' };

  document.getElementById('pageContent').innerHTML = `
<div class="stack" style="gap:20px">

  <!-- KPIs -->
  <div class="card" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px">
    <div class="kpi"><div class="label">Documentos</div><div class="value" id="kpiTotal">—</div><div class="hint">del período</div></div>
    <div class="kpi"><div class="label">Subtotal MXN</div><div class="value" id="kpiSubMXN">—</div><div class="hint">subt. líneas MN</div></div>
    <div class="kpi"><div class="label">Subtotal USD</div><div class="value" id="kpiSubUSD">—</div><div class="hint">subt. líneas ME</div></div>
    <div class="kpi"><div class="label">Notas crédito</div><div class="value" id="kpiNC" style="color:#dc2626">—</div><div class="hint">importes negativos</div></div>
  </div>

  <!-- Filtros + tabla -->
  <div class="card">
    <div class="row">
      <div><div class="eyebrow">Catálogo</div><h2>Facturas de Venta</h2></div>
      <button class="btn" id="refreshBtn">Actualizar</button>
    </div>
    <div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end">
      <div>
        <div class="label-text" style="font-size:11px;margin-bottom:4px">Buscar</div>
        <input class="input" id="q" placeholder="Folio / cliente / clave cte" style="min-width:200px"/>
      </div>
      <div>
        <div class="label-text" style="font-size:11px;margin-bottom:4px">Estatus</div>
        <select class="select" id="statusFil">
          <option value="">Todos</option>
          <option value="vigente">Vigente</option>
          <option value="cancelado">Cancelado</option>
          <option value="parcial">Parcial</option>
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
      <strong id="ptDocs">0</strong> docs ·
      Subtotal: <strong id="ptSub">$0</strong> ·
      IVA: <strong id="ptIva">$0</strong> ·
      Total: <strong id="ptTotal">$0</strong>
      <span id="ptNC" style="margin-left:12px;color:#dc2626;display:none">· Notas crédito: <strong id="ptNCVal"></strong></span>
    </div>

    <div class="table-wrap" style="margin-top:12px">
      <table>
        <thead><tr>
          <th style="width:40px">#</th>
          <th>Folio</th>
          <th>Fecha</th>
          <th>Cve. Cte.</th>
          <th>Cliente</th>
          <th>Lugar</th>
          <th style="text-align:right">Subtotal</th>
          <th style="text-align:right">IVA</th>
          <th style="text-align:right">Total</th>
          <th>Mon</th>
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
  const fmt  = v => {
    const n = Number(v || 0);
    return (n < 0 ? '-' : '') + '$' + Math.abs(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // Construye los query params de filtro (sin limit/offset) — compartido entre
  // la llamada paginada y la llamada de totales del período completo.
  function buildFilters() {
    const qs = new URLSearchParams();
    const qv = document.getElementById('q').value.trim();        if (qv) qs.set('q', qv);
    const sf = document.getElementById('statusFil').value;       if (sf) qs.set('status_fac', sf);
    const mf = document.getElementById('monedaFil').value;       if (mf) qs.set('cve_mon', mf);
    const af = document.getElementById('añoFil').value.trim();   if (af) qs.set('año', af);
    const ef = document.getElementById('mesFil').value;          if (ef) qs.set('mes', ef);
    return qs;
  }

  async function load() {
    const filters = buildFilters();
    const qs = new URLSearchParams(filters);
    qs.set('limit',  LIMIT);
    qs.set('offset', (page - 1) * LIMIT);

    try {
      // Llamadas en paralelo: paginación + totales del período completo
      const [res, resTot] = await Promise.all([
        KoguApi.apiFetch(`${BASE}/ventas?${qs}`),
        KoguApi.apiFetch(`${BASE}/ventas/totales?${filters}`),
      ]);
      const rows  = KoguApi.unwrapRows(res);
      const total = rows.length ? Number(rows[0].total_count ?? rows.length) : 0;
      const tots  = resTot?.data ?? resTot ?? {};

      renderKpis(rows, total, tots);
      renderTotales(total, tots);
      renderRows(rows, total);
    } catch(err) {
      console.error('[ventas] load() error:', err);
      const msg = err?.message || String(err);
      document.getElementById('rows').innerHTML = `<tr><td colspan="11" class="empty">Error al cargar: ${KoguUi.escapeHtml(msg)}</td></tr>`;
    }
  }

  // KPIs — todos desde el endpoint /ventas/totales (período completo, no la página).
  function renderKpis(rows, totalDocs, tots) {
    const mxn = Number(tots.subtotal_mxn   || 0);
    const usd = Number(tots.subtotal_usd   || 0);
    const nc  = Number(tots.nc_count       || 0);
    document.getElementById('kpiTotal').textContent  = Number(tots.folios ?? totalDocs ?? 0).toLocaleString();
    document.getElementById('kpiSubMXN').textContent = fmt(mxn);
    document.getElementById('kpiSubUSD').textContent = `$${Math.abs(usd).toLocaleString('es-MX',{minimumFractionDigits:2})}`;
    document.getElementById('kpiNC').textContent     = nc.toLocaleString();
  }

  // "Período filtrado" — usa los totales del endpoint /ventas/totales (período completo).
  function renderTotales(totalDocs, tots) {
    const sub = Number(tots.subtotal_total || 0);
    const iva = Number(tots.iva_total      || 0);
    const tot = Number(tots.total_lineas   || 0);
    const n   = Number(tots.folios         || totalDocs || 0);

    if (!n) { document.getElementById('periodoTotales').style.display = 'none'; return; }

    document.getElementById('ptDocs').textContent  = n.toLocaleString();
    document.getElementById('ptSub').textContent   = fmt(sub);
    document.getElementById('ptIva').textContent   = fmt(iva);
    document.getElementById('ptTotal').textContent = fmt(tot);

    // Notas de crédito: subtotal negativo en el período
    const ncEl = document.getElementById('ptNC');
    ncEl.style.display = 'none';   // sin info de NC en endpoint de totales por ahora

    document.getElementById('periodoTotales').style.display = '';
  }

  function renderRows(rows, total) {
    document.getElementById('rows').innerHTML = rows.length
      ? rows.map(r => {
          const esNC     = Number(r.total_fac||0) < 0;
          const monLabel = MON_LABEL[r.cve_mon] ?? r.cve_mon ?? '-';
          const fecha    = r.falta_fac ? new Date(r.falta_fac).toLocaleDateString('es-MX') : '-';
          const ncStyle  = esNC ? 'background:rgba(220,38,38,.04);' : '';
          return `<tr style="${ncStyle}">
            <td style="color:var(--muted);font-size:12px">${r.id_mov??'-'}</td>
            <td>
              <strong>${KoguUi.escapeHtml(r.folio_factura??r.no_fac??'-')}</strong>
              ${esNC ? '<span style="margin-left:6px;font-size:10px;color:#dc2626;font-weight:700">NC</span>' : ''}
            </td>
            <td style="white-space:nowrap">${fecha}</td>
            <td><span class="chip-compact">${KoguUi.escapeHtml(r.cve_cte??'-')}</span></td>
            <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${KoguUi.escapeHtml(r.nom_cte??'')}">
              ${KoguUi.escapeHtml(r.nom_cte??'-')}
            </td>
            <td style="font-size:12px;color:var(--muted)">${KoguUi.escapeHtml(r.lugar??'-')}</td>
            <td style="text-align:right;${esNC?'color:#dc2626':''}">${fmt(r.subt_prod_sum)}</td>
            <td style="text-align:right">${fmt(r.iva_prod_sum)}</td>
            <td style="text-align:right;font-weight:700;${esNC?'color:#dc2626':''}">${fmt(r.total_fac)}</td>
            <td><span class="chip-compact">${monLabel}</span></td>
            <td>${KoguUi.statusBadge(r.status_fac??'-')}</td>
          </tr>`;
        }).join('')
      : '<tr><td colspan="11" class="empty">Sin ventas registradas para esta empresa y período.</td></tr>';

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

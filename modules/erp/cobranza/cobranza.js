/* KOGU Multiempresa — ERP Cobranza */
document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/erp/cobranza/cobranza.html';
  const BASE = '/protected/erp';
  const PERM = 'screen.erp.cobranza';

  const b = await KoguShell.initShell({ currentPage: PAGE, title: 'Cobranza ERP', description: 'Seguimiento de cobros y cuentas por cobrar importadas.', requiredPermission: PERM });
  if (!b) return;

  // ── Mes anterior por defecto ──────────────────────────────
  const hoy    = new Date();
  const defMes = hoy.getMonth() === 0 ? 12 : hoy.getMonth();
  const defAño = hoy.getMonth() === 0 ? hoy.getFullYear() - 1 : hoy.getFullYear();

  document.getElementById('pageContent').innerHTML = `
<div class="stack" style="gap:20px">

  <!-- Resumen ejecutivo mensual -->
  <div class="card">
    <div class="row">
      <div>
        <div class="eyebrow">RESUMEN EJECUTIVO</div>
        <h2 style="margin:0">Cobranza por mes — <span id="resAño">${defAño}</span></h2>
      </div>
      <div style="font-size:12px;color:var(--muted)">Cobros = movimientos del mes · Subtotal = importe cobrado</div>
    </div>
    <style>
      .res-card { background:var(--panel2); border-radius:12px; padding:12px; min-width:0 }
      .res-card.total { background:rgba(14,116,144,.06); border:1px solid rgba(14,116,144,.25) }
      .res-card .eyebrow { margin-bottom:8px }
      .res-card.total .eyebrow { color:#0e7490 }
      .res-card .table-wrap { overflow-x:auto }
      .res-card table { font-size:11px; min-width:100%; border-collapse:collapse }
      .res-card th, .res-card td { white-space:nowrap; padding:4px 8px }
      .res-card th { font-weight:600; color:var(--muted); border-bottom:1px solid var(--line) }
      .res-card td.num, .res-card th[style*="right"] { text-align:right; font-variant-numeric:tabular-nums }
      .res-card tfoot tr { background:var(--panel); font-weight:700; border-top:2px solid var(--line) }
    </style>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(380px,1fr));gap:14px;margin-top:14px">
      <!-- COBRANZA MXN -->
      <div class="res-card">
        <div class="eyebrow">COBRANZA MXN</div>
        <div class="table-wrap"><table>
          <thead><tr>
            <th style="text-align:left">Mes</th>
            <th style="text-align:right">Cobros</th>
            <th style="text-align:right">Subtotal</th>
            <th style="text-align:right">IVA</th>
          </tr></thead>
          <tbody id="resMxn"><tr><td colspan="4" class="empty" style="text-align:center;color:var(--muted);padding:10px">—</td></tr></tbody>
          <tfoot id="resMxnFoot"></tfoot>
        </table></div>
      </div>
      <!-- COBRANZA USD -->
      <div class="res-card">
        <div class="eyebrow">COBRANZA USD</div>
        <div class="table-wrap"><table>
          <thead><tr>
            <th style="text-align:left">Mes</th>
            <th style="text-align:right">Cobros</th>
            <th style="text-align:right">Subtotal</th>
            <th style="text-align:right">IVA</th>
          </tr></thead>
          <tbody id="resUsd"><tr><td colspan="4" class="empty" style="text-align:center;color:var(--muted);padding:10px">—</td></tr></tbody>
          <tfoot id="resUsdFoot"></tfoot>
        </table></div>
      </div>
      <!-- TOTAL CONSOLIDADO -->
      <div class="res-card total">
        <div class="eyebrow">TOTAL CONSOLIDADO</div>
        <div class="table-wrap"><table>
          <thead><tr>
            <th style="text-align:left">Mes</th>
            <th style="text-align:right">Cobros</th>
            <th style="text-align:right">Subtotal</th>
            <th style="text-align:right">IVA</th>
          </tr></thead>
          <tbody id="resTotal"><tr><td colspan="4" class="empty" style="text-align:center;color:var(--muted);padding:10px">—</td></tr></tbody>
          <tfoot id="resTotalFoot"></tfoot>
        </table></div>
      </div>
    </div>
  </div>

  <!-- Filtros + tabla -->
  <div class="card">
    <div class="row">
      <div><div class="eyebrow">Catálogo</div><h2>Registro de Cobros</h2></div>
      <button class="btn" id="refreshBtn">Actualizar</button>
    </div>
    <div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end">
      <div>
        <div class="label-text" style="font-size:11px;margin-bottom:4px">Buscar</div>
        <input class="input" id="q" placeholder="No. cobro / cliente / factura" style="min-width:200px"/>
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
      <strong id="ptDocs">0</strong> cobros ·
      Subtotal MXN: <strong id="ptMXN">$0</strong> ·
      Subtotal USD: <strong id="ptUSD">$0</strong> ·
      IVA: <strong id="ptIva">$0</strong> ·
      Total: <strong id="ptTotal">$0</strong>
    </div>

    <div class="table-wrap" style="margin-top:12px">
      <table>
        <thead><tr>
          <th style="width:40px">#</th>
          <th>No. Cobro</th>
          <th>Fecha</th>
          <th>Realización</th>
          <th>Cliente</th>
          <th>Facturas</th>
          <th style="text-align:right">Subtotal MXN</th>
          <th style="text-align:right">Subtotal USD</th>
          <th style="text-align:right">IVA MXN</th>
          <th>Tipo</th>
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
  const num = v => Number(v || 0).toLocaleString('es-MX', { maximumFractionDigits: 2 });
  const MES_LBL = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

  // Construye los query params de filtro (sin limit/offset) — compartido entre
  // la llamada paginada y la llamada de totales del período completo.
  function buildFilters() {
    const qs = new URLSearchParams();
    const qv = document.getElementById('q').value.trim();      if (qv) qs.set('q', qv);
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
      // Llamadas en paralelo: paginación + totales del período completo + resumen anual
      const añoSel = document.getElementById('añoFil').value.trim() || defAño;
      const resumenQs = new URLSearchParams({ año: añoSel });
      const qSearch = document.getElementById('q').value.trim();
      if (qSearch) resumenQs.set('q', qSearch);

      const [res, resTot, resResumen] = await Promise.all([
        KoguApi.apiFetch(`${BASE}/cobranza?${qs}`),
        KoguApi.apiFetch(`${BASE}/cobranza/totales?${filters}`),
        KoguApi.apiFetch(`${BASE}/cobranza/resumen?${resumenQs}`),
      ]);
      const rows  = KoguApi.unwrapRows(res);
      const total = rows.length ? Number(rows[0].total_count ?? rows.length) : 0;
      const tots  = resTot?.data ?? resTot ?? {};
      const resumenRows = KoguApi.unwrapRows(resResumen);

      renderResumen(resumenRows, añoSel);
      renderTotales(total, tots);
      renderRows(rows, total);
    } catch(err) {
      console.error('[cobranza] load() error:', err);
      const msg = err?.message || String(err);
      document.getElementById('rows').innerHTML = `<tr><td colspan="10" class="empty">Error al cargar: ${KoguUi.escapeHtml(msg)}</td></tr>`;
    }
  }

  // Resumen ejecutivo mensual — 3 cards (MXN / USD / TOTAL CONSOLIDADO).
  function renderResumen(rows, añoSel) {
    document.getElementById('resAño').textContent = añoSel;

    const renderRow = (r, suf) => `<tr>
      <td>${MES_LBL[r.mes] || r.mes}</td>
      <td class="num">${Number(r['cobros_'+suf]||0).toLocaleString()}</td>
      <td class="num">${fmt(r['subtot_'+suf])}</td>
      <td class="num">${fmt(r['iva_'+suf])}</td>
    </tr>`;

    const renderFoot = (suf) => {
      const t = rows.reduce((a,r) => ({
        cobros: a.cobros + Number(r['cobros_'+suf]||0),
        subtot: a.subtot + Number(r['subtot_'+suf]||0),
        iva:    a.iva    + Number(r['iva_'+suf]||0),
      }), {cobros:0, subtot:0, iva:0});
      return `<tr>
        <td>Total</td>
        <td class="num">${t.cobros.toLocaleString()}</td>
        <td class="num">${fmt(t.subtot)}</td>
        <td class="num">${fmt(t.iva)}</td>
      </tr>`;
    };

    const empty = `<tr><td colspan="4" class="empty" style="text-align:center;color:var(--muted);padding:12px">Sin datos para el año ${añoSel}.</td></tr>`;

    if (!rows.length) {
      document.getElementById('resMxn').innerHTML       = empty;
      document.getElementById('resUsd').innerHTML       = empty;
      document.getElementById('resTotal').innerHTML     = empty;
      document.getElementById('resMxnFoot').innerHTML   = '';
      document.getElementById('resUsdFoot').innerHTML   = '';
      document.getElementById('resTotalFoot').innerHTML = '';
      return;
    }

    document.getElementById('resMxn').innerHTML       = rows.map(r => renderRow(r,'mxn')).join('');
    document.getElementById('resUsd').innerHTML       = rows.map(r => renderRow(r,'usd')).join('');
    document.getElementById('resTotal').innerHTML     = rows.map(r => renderRow(r,'total')).join('');
    document.getElementById('resMxnFoot').innerHTML   = renderFoot('mxn');
    document.getElementById('resUsdFoot').innerHTML   = renderFoot('usd');
    document.getElementById('resTotalFoot').innerHTML = renderFoot('total');
  }

  // "Período filtrado" — usa los totales del endpoint /cobranza/totales.
  function renderTotales(totalDocs, tots) {
    const n = Number(tots.cobros || totalDocs || 0);
    if (!n) { document.getElementById('periodoTotales').style.display = 'none'; return; }

    document.getElementById('ptDocs').textContent  = n.toLocaleString();
    document.getElementById('ptMXN').textContent   = fmt(tots.subtot_mxn);
    document.getElementById('ptUSD').textContent   = fmt(tots.subtot_usd);
    document.getElementById('ptIva').textContent   = fmt(tots.iva_total);
    document.getElementById('ptTotal').textContent = fmt(tots.subtot_total);
    document.getElementById('periodoTotales').style.display = '';
  }

  function renderRows(rows, total) {
    document.getElementById('rows').innerHTML = rows.length
      ? rows.map(r => {
          const fecha   = r.fecha    ? new Date(r.fecha).toLocaleDateString('es-MX')    : '-';
          const fecRea  = r.fec_rea  ? new Date(r.fec_rea).toLocaleDateString('es-MX')  : '-';
          return `<tr>
            <td style="color:var(--muted);font-size:12px">${r.id_mov??'-'}</td>
            <td><strong>${KoguUi.escapeHtml(String(r.num??'-'))}</strong></td>
            <td style="white-space:nowrap">${fecha}</td>
            <td style="white-space:nowrap;color:var(--muted);font-size:12px">${fecRea}</td>
            <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
                title="${KoguUi.escapeHtml(r.nom_cte??'')}">${KoguUi.escapeHtml(r.nom_cte??'-')}</td>
            <td style="font-size:12px;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
                title="${KoguUi.escapeHtml(r.facturas??'')}">${KoguUi.escapeHtml(r.facturas??'-')}</td>
            <td style="text-align:right;font-weight:700">${fmt(r.subtot_mxn)}</td>
            <td style="text-align:right">${fmt(r.subtot_usd)}</td>
            <td style="text-align:right">${fmt(r.iva_mxn)}</td>
            <td><span class="chip-compact">${KoguUi.escapeHtml(r.tipo??'-')}</span></td>
          </tr>`;
        }).join('')
      : '<tr><td colspan="10" class="empty">Sin cobros registrados para esta empresa y período.</td></tr>';

    const pages = Math.ceil(total / LIMIT);
    document.getElementById('pager').innerHTML = pages > 1
      ? `<span style="font-size:12px;color:var(--muted)">${total.toLocaleString()} registros</span>
         <button class="btn" id="prev" ${page<=1?'disabled':''}>‹ Ant.</button>
         <span style="font-size:13px;font-weight:600">${page}/${pages}</span>
         <button class="btn" id="next" ${page>=pages?'disabled':''}>Sig. ›</button>` : '';
    document.getElementById('prev')?.addEventListener('click', ()=>{ page--; load(); });
    document.getElementById('next')?.addEventListener('click', ()=>{ page++; load(); });
  }

  ['añoFil','mesFil'].forEach(id =>
    document.getElementById(id)?.addEventListener('change', ()=>{ page=1; load(); })
  );
  document.getElementById('q').addEventListener('input', ()=>{ page=1; load(); });
  document.getElementById('refreshBtn').onclick = ()=>{ page=1; load(); };
  KoguShell.subscribeEmpresaActivaChange(async ()=>{ page=1; await load(); });
  await load();
});

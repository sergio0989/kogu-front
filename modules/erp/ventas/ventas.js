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

  <!-- Resumen ejecutivo mensual -->
  <div class="card">
    <div class="row">
      <div>
        <div class="eyebrow">RESUMEN EJECUTIVO</div>
        <h2 style="margin:0">Ventas por mes — <span id="resAño">${defAño}</span></h2>
      </div>
      <div style="font-size:12px;color:var(--muted)">Cantidad = unidades vendidas · Subtotal excluye notas de crédito</div>
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
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:14px;margin-top:14px">
      <!-- VENTAS MXN -->
      <div class="res-card">
        <div class="eyebrow">VENTAS MXN</div>
        <div class="table-wrap"><table>
          <thead><tr>
            <th style="text-align:left">Mes</th>
            <th style="text-align:right">Cantidad</th>
            <th style="text-align:right">Subtotal</th>
            <th style="text-align:right">NC</th>
            <th style="text-align:right">Imp. NC</th>
          </tr></thead>
          <tbody id="resMxn"><tr><td colspan="5" class="empty" style="text-align:center;color:var(--muted);padding:10px">—</td></tr></tbody>
          <tfoot id="resMxnFoot"></tfoot>
        </table></div>
      </div>
      <!-- VENTAS USD -->
      <div class="res-card">
        <div class="eyebrow">VENTAS USD</div>
        <div class="table-wrap"><table>
          <thead><tr>
            <th style="text-align:left">Mes</th>
            <th style="text-align:right">Cantidad</th>
            <th style="text-align:right">Subtotal</th>
            <th style="text-align:right">NC</th>
            <th style="text-align:right">Imp. NC</th>
          </tr></thead>
          <tbody id="resUsd"><tr><td colspan="5" class="empty" style="text-align:center;color:var(--muted);padding:10px">—</td></tr></tbody>
          <tfoot id="resUsdFoot"></tfoot>
        </table></div>
      </div>
      <!-- TOTAL CONSOLIDADO -->
      <div class="res-card total">
        <div class="eyebrow">TOTAL CONSOLIDADO</div>
        <div class="table-wrap"><table>
          <thead><tr>
            <th style="text-align:left">Mes</th>
            <th style="text-align:right">Cantidad</th>
            <th style="text-align:right">Subtotal</th>
            <th style="text-align:right">NC</th>
            <th style="text-align:right">Imp. NC</th>
          </tr></thead>
          <tbody id="resTotal"><tr><td colspan="5" class="empty" style="text-align:center;color:var(--muted);padding:10px">—</td></tr></tbody>
          <tfoot id="resTotalFoot"></tfoot>
        </table></div>
      </div>
    </div>
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
        <select class="select" id="añoFil" style="min-width:100px">
          <option value="${defAño}">${defAño}</option>
        </select>
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
  const num = v => Number(v || 0).toLocaleString('es-MX', { maximumFractionDigits: 2 });
  const MES_LBL = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

  // Construye los query params de filtro (sin limit/offset) — compartido entre
  // la llamada paginada y la llamada de totales del período completo.
  function buildFilters() {
    const qs = new URLSearchParams();
    const qv = document.getElementById('q').value.trim();        if (qv) qs.set('q', qv);
    const sf = document.getElementById('statusFil').value;       if (sf) qs.set('status_fac', sf);
    const mf = document.getElementById('monedaFil').value;       if (mf) qs.set('cve_mon', mf);
    const af = document.getElementById('añoFil').value;          if (af) qs.set('año', af);
    const ef = document.getElementById('mesFil').value;          if (ef) qs.set('mes', ef);
    return qs;
  }

  // Pobla el dropdown de Año con los años con datos disponibles para la
  // empresa activa. Si BD no tiene datos, mantiene defAño como única opción.
  // Selecciona el año más reciente. Idempotente — se vuelve a llamar al
  // cambiar de empresa.
  async function loadAnios() {
    const sel = document.getElementById('añoFil');
    try {
      const res   = await KoguApi.apiFetch(`${BASE}/ventas/anios-disponibles`);
      const anios = (res?.data ?? res ?? []).map(Number).filter(Boolean);
      if (!anios.length) {
        sel.innerHTML = `<option value="${defAño}">${defAño}</option>`;
        return;
      }
      sel.innerHTML = anios.map(a => `<option value="${a}">${a}</option>`).join('');
      sel.value = String(anios[0]); // más reciente
    } catch (err) {
      console.error('[ventas] loadAnios error:', err);
      sel.innerHTML = `<option value="${defAño}">${defAño}</option>`;
    }
  }

  async function load() {
    const filters = buildFilters();
    const qs = new URLSearchParams(filters);
    qs.set('limit',  LIMIT);
    qs.set('offset', (page - 1) * LIMIT);

    try {
      // Llamadas en paralelo: paginación + totales del período completo + resumen anual
      const añoSel = document.getElementById('añoFil').value || defAño;
      const resumenQs = new URLSearchParams({ año: añoSel });
      const qSearch = document.getElementById('q').value.trim();
      if (qSearch) resumenQs.set('q', qSearch);

      const [res, resTot, resResumen] = await Promise.all([
        KoguApi.apiFetch(`${BASE}/ventas?${qs}`),
        KoguApi.apiFetch(`${BASE}/ventas/totales?${filters}`),
        KoguApi.apiFetch(`${BASE}/ventas/resumen?${resumenQs}`),
      ]);
      const rows  = KoguApi.unwrapRows(res);
      const total = rows.length ? Number(rows[0].total_count ?? rows.length) : 0;
      const tots  = resTot?.data ?? resTot ?? {};
      const resumenRows = KoguApi.unwrapRows(resResumen);

      renderResumen(resumenRows, añoSel);
      renderTotales(total, tots);
      renderRows(rows, total);
    } catch(err) {
      console.error('[ventas] load() error:', err);
      const msg = err?.message || String(err);
      document.getElementById('rows').innerHTML = `<tr><td colspan="11" class="empty">Error al cargar: ${KoguUi.escapeHtml(msg)}</td></tr>`;
    }
  }

  // Resumen ejecutivo mensual — 3 cards (MXN / USD / TOTAL CONSOLIDADO).
  // Pinta una fila por mes que tenga datos en el año filtrado.
  function renderResumen(rows, añoSel) {
    document.getElementById('resAño').textContent = añoSel;

    const renderRow = (r, suf) => `<tr>
      <td>${MES_LBL[r.mes] || r.mes}</td>
      <td class="num">${num(r['cantidad_'+suf])}</td>
      <td class="num">${fmt(r['subtotal_'+suf])}</td>
      <td class="num">${Number(r['nc_count_'+suf]||0)}</td>
      <td class="num"${Number(r['importe_nc_'+suf]||0)<0?' style="color:#dc2626"':''}>${fmt(r['importe_nc_'+suf])}</td>
    </tr>`;

    const renderFoot = (suf) => {
      const t = rows.reduce((a,r) => ({
        cantidad: a.cantidad + Number(r['cantidad_'+suf]||0),
        subtotal: a.subtotal + Number(r['subtotal_'+suf]||0),
        nc:       a.nc       + Number(r['nc_count_'+suf]||0),
        imp_nc:   a.imp_nc   + Number(r['importe_nc_'+suf]||0),
      }), {cantidad:0, subtotal:0, nc:0, imp_nc:0});
      return `<tr>
        <td>Total</td>
        <td class="num">${num(t.cantidad)}</td>
        <td class="num">${fmt(t.subtotal)}</td>
        <td class="num">${t.nc.toLocaleString()}</td>
        <td class="num"${t.imp_nc<0?' style="color:#dc2626"':''}>${fmt(t.imp_nc)}</td>
      </tr>`;
    };

    const empty = `<tr><td colspan="5" class="empty" style="text-align:center;color:var(--muted);padding:12px">Sin datos para el año ${añoSel}.</td></tr>`;

    if (!rows.length) {
      document.getElementById('resMxn').innerHTML   = empty;
      document.getElementById('resUsd').innerHTML   = empty;
      document.getElementById('resTotal').innerHTML = empty;
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
  KoguShell.subscribeEmpresaActivaChange(async ()=>{
    page = 1;
    await loadAnios();
    await load();
  });
  await loadAnios();
  await load();
});

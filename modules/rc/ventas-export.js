// ============================================================
// ventas-export.js
// Radar Comercial (rc_) — Ventas de Exportación.
// Lee erp_ventas (cve_iva='EXT') vía /protected/rc/ventas-export/dashboard.
// KPIs + tendencia mensual + ranking por cliente. USD (subt_prod/tip_cam)
// y MXN (subt_prod). Filtro Año/Mes patrón CFDI. Empresa activa.
// Permiso: rc.ventas_export.read
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/rc/ventas-export.html';
  const BASE = '/protected/rc';
  const PERM = 'rc.ventas_export.read';
  const CHART_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js';

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Ventas de Exportación',
    description: 'Ventas de exportación (mercado EXT) desde el ERP: valor, volumen y clientes. Radar Comercial.',
    requiredPermission: PERM,
  });
  if (!b) return;

  // ── Estado ──────────────────────────────────────────────
  let anioSel = null, mesSel = null, moneda = 'USD', selectoresListos = false;
  let chart = null;
  const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const CO = { primary: '#0891b2', green: '#16a34a', slate: '#64748b', amber: '#d97706' };

  const esc = KoguUi.escapeHtml;
  const $ = (id) => document.getElementById(id);
  const nf0 = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 });
  const money = (n, cur) => (cur === 'MXN' ? '$' : 'US$') + nf0.format(Math.round(Number(n) || 0));
  const moneyC = (n, cur) => (cur === 'MXN' ? '$' : 'US$') + new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(n) || 0);
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (window.Chart) return resolve();
      const s = document.createElement('script'); s.src = src; s.onload = resolve; s.onerror = reject; document.head.appendChild(s);
    });
  }

  // ── Layout ──────────────────────────────────────────────
  $('pageContent').innerHTML = `
<div class="stack" style="gap:18px">
  <div class="card">
    <div class="eyebrow">Radar · Comercio Exterior</div>
    <h2 style="margin:2px 0 4px">Ventas de Exportación</h2>
    <div class="hint" style="color:var(--muted);font-size:13px">Facturas de mercado <b>EXT</b> del ERP (empresa activa). Valor en <b>MXN</b> (subtotal) y <b>USD</b> (convertido con el tipo de cambio de cada factura).</div>
    <div style="display:flex;gap:16px;align-items:flex-end;flex-wrap:wrap;margin-top:14px">
      <div><label class="label-text">Año</label><select class="input" id="selAnio" style="min-width:120px"></select></div>
      <div><label class="label-text">Mes</label><select class="input" id="selMes" style="min-width:170px"></select></div>
      <div><label class="label-text">Moneda (tendencia)</label>
        <div style="display:flex;gap:6px">
          <button class="btn" id="btnUSD">USD</button>
          <button class="btn" id="btnMXN">MXN</button>
        </div>
      </div>
    </div>
  </div>

  <div id="kpis" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px"></div>

  <div class="card">
    <div class="eyebrow">Tendencia</div>
    <h3 style="margin:2px 0 8px">Exportación mensual (<span id="curLabel">USD</span>)</h3>
    <div style="position:relative;height:320px"><canvas id="c_mensual"></canvas></div>
  </div>

  <div class="card">
    <div class="eyebrow">Clientes</div>
    <h3 style="margin:2px 0 8px">Ranking de clientes de exportación</h3>
    <div style="overflow-x:auto"><table class="table" id="tblClientes"></table></div>
  </div>
</div>`;

  $('selAnio').addEventListener('change', (e) => { anioSel = e.target.value ? Number(e.target.value) : null; load(); });
  $('selMes').addEventListener('change', (e) => { mesSel = e.target.value ? Number(e.target.value) : null; load(); });
  $('btnUSD').addEventListener('click', () => { moneda = 'USD'; load(); });
  $('btnMXN').addEventListener('click', () => { moneda = 'MXN'; load(); });

  function poblarSelectores(D) {
    if (!selectoresListos) {
      $('selMes').innerHTML = `<option value="">Acumulado (año)</option>` + MESES.map((m, i) => `<option value="${i + 1}">${m}</option>`).join('');
      selectoresListos = true;
    }
    $('selAnio').innerHTML = (D.anios || []).map((a) => `<option value="${a}">${a}</option>`).join('') || `<option value="">—</option>`;
    anioSel = D.anio || (D.anios && D.anios[0]) || null;
    $('selAnio').value = anioSel != null ? String(anioSel) : '';
    $('selMes').value = D.mes != null ? String(D.mes) : '';
    $('btnUSD').style.cssText = moneda === 'USD' ? 'background:var(--primary);color:#fff;border-color:var(--primary)' : '';
    $('btnMXN').style.cssText = moneda === 'MXN' ? 'background:var(--primary);color:#fff;border-color:var(--primary)' : '';
    $('curLabel').textContent = moneda;
  }

  function dashQuery() {
    const parts = [];
    if (anioSel) parts.push('anio=' + anioSel);
    if (mesSel) parts.push('mes=' + mesSel);
    return parts.length ? '?' + parts.join('&') : '';
  }

  function kpi(v, l, h) { return `<div class="kpi"><div class="value">${v}</div><div class="label">${esc(l)}</div><div class="hint">${esc(h)}</div></div>`; }

  function pintarAviso(msg) {
    $('kpis').innerHTML = `<div class="card" style="grid-column:1/-1;text-align:center;color:var(--muted)">${esc(msg)}</div>`;
    if (chart) { try { chart.destroy(); } catch (_) {} chart = null; }
    $('tblClientes').innerHTML = '';
  }

  async function load() {
    let D;
    try {
      const res = await KoguApi.apiFetch(BASE + '/ventas-export/dashboard' + dashQuery());
      D = KoguApi.unwrapData(res);
    } catch (e) {
      pintarAviso('No se pudo cargar el análisis. Verifica que el servicio esté desplegado e inténtalo de nuevo.');
      return;
    }
    if (!D || D.empty) {
      pintarAviso('No hay ventas de exportación (mercado EXT) registradas en el ERP para esta empresa.');
      return;
    }
    poblarSelectores(D);
    renderKpis(D);
    await renderChart(D);
    renderTabla(D);
  }

  function renderKpis(D) {
    const m = D.meta || {};
    const per = D.mes ? `${MESES[D.mes - 1]} ${D.anio || ''}` : `${D.anio || ''} (acum.)`;
    $('kpis').innerHTML = [
      kpi(moneyC(m.usd, 'USD'), 'Exportado (USD)', per),
      kpi(moneyC(m.mxn, 'MXN'), 'Exportado (MXN)', per),
      kpi(nf0.format(m.kg || 0), 'Kg exportados', `${nf0.format(m.facturas || 0)} facturas`),
      kpi(nf0.format(m.clientes || 0), 'Clientes', `${nf0.format(m.lineas || 0)} líneas`),
      kpi(moneyC(m.ticket_usd, 'USD'), 'Ticket promedio', 'por factura (USD)'),
    ].join('');
  }

  async function renderChart(D) {
    try { await loadScript(CHART_SRC); } catch (_) { return; }
    const Chart = window.Chart;
    Chart.defaults.font.family = 'Inter,system-ui,sans-serif'; Chart.defaults.color = '#64748b'; Chart.defaults.font.size = 12;
    if (chart) { try { chart.destroy(); } catch (_) {} chart = null; }
    const serie = moneda === 'MXN' ? D.mensual.mxn : D.mensual.usd;
    chart = new Chart($('c_mensual'), {
      type: 'bar',
      data: { labels: D.mensual.labels, datasets: [{ label: `Exportación ${moneda}`, data: serie, backgroundColor: CO.primary, borderRadius: 4 }] },
      options: {
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => money(c.raw, moneda) } } },
        scales: { y: { ticks: { callback: (v) => moneyC(v, moneda) } } },
      },
    });
  }

  function renderTabla(D) {
    const cur = moneda;
    $('tblClientes').innerHTML = `<thead><tr>
      <th>Cliente</th><th>Agente</th><th style="text-align:right">Facturas</th>
      <th style="text-align:right">USD</th><th style="text-align:right">MXN</th><th style="text-align:right">Kg</th>
      </tr></thead><tbody>${(D.clientes || []).map((r) => `<tr>
      <td><b>${esc(r.cliente)}</b><div style="color:var(--muted);font-size:11px">${esc(r.cve_cte || '')}</div></td>
      <td>${esc(r.agente)}</td>
      <td style="text-align:right">${nf0.format(r.facturas)}</td>
      <td style="text-align:right">${money(r.usd, 'USD')}</td>
      <td style="text-align:right">${money(r.mxn, 'MXN')}</td>
      <td style="text-align:right">${nf0.format(r.kg)}</td>
      </tr>`).join('')}</tbody>`;
    void cur;
  }

  await load();
});

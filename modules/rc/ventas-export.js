// ============================================================
// ventas-export.js
// Radar Comercial (rc_) — Ventas de Exportación.
// Lee erp_ventas (cve_iva='EXT') vía /protected/rc/ventas-export/dashboard.
// KPIs ejecutivos + tendencia mensual + ranking de clientes con
// participación y precio USD/kg. USD (subt_prod/tip_cam) y MXN (subt_prod).
// Filtro Año/Mes patrón CFDI. Empresa activa. Permiso: rc.ventas_export.read
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
  let chartTrend = null, chartTop = null;
  const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const CO = { primary: '#0891b2', primaryD: '#0e7490', cyan: '#22d3ee', green: '#16a34a', slate: '#94a3b8', amber: '#d97706' };

  const esc = KoguUi.escapeHtml;
  const $ = (id) => document.getElementById(id);
  const nf0 = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 1 });
  const sign = (cur) => (cur === 'MXN' ? '$' : 'US$');
  const money = (n, cur) => sign(cur) + nf0.format(Math.round(Number(n) || 0));
  const moneyC = (n, cur) => sign(cur) + new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(n) || 0);
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (window.Chart) return resolve();
      const s = document.createElement('script'); s.src = src; s.onload = resolve; s.onerror = reject; document.head.appendChild(s);
    });
  }

  // ── Estilos (scoped ve-*) ───────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    .ve-kpis{display:grid;grid-template-columns:1.3fr repeat(4,1fr);gap:14px}
    @media(max-width:1000px){.ve-kpis{grid-template-columns:repeat(2,1fr)}}
    .ve-kpi{background:var(--panel,#fff);border:1px solid var(--line,#e2e8f0);border-radius:16px;padding:18px 20px;box-shadow:var(--shadow,0 10px 25px rgba(15,23,42,.06));position:relative;overflow:hidden}
    .ve-kpi.hero{background:linear-gradient(135deg,#0e7490,#0891b2);color:#fff;border:none}
    .ve-kpi .ve-lab{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted,#64748b);font-weight:600}
    .ve-kpi.hero .ve-lab{color:rgba(255,255,255,.85)}
    .ve-kpi .ve-val{font-size:30px;font-weight:800;letter-spacing:-.02em;line-height:1.1;margin-top:6px}
    .ve-kpi.small .ve-val{font-size:24px}
    .ve-kpi .ve-sub{font-size:12.5px;color:var(--muted,#64748b);margin-top:6px}
    .ve-kpi.hero .ve-sub{color:rgba(255,255,255,.9)}
    .ve-kpi .ve-accent{position:absolute;right:-14px;top:-14px;width:70px;height:70px;border-radius:50%;background:var(--primary,#0891b2);opacity:.06}
    .ve-insight{background:#ecfeff;border-left:3px solid var(--primary,#0891b2);border-radius:0 10px 10px 0;padding:11px 15px;font-size:13.5px;color:#0c4a6e;margin-top:4px}
    .ve-seg{display:inline-flex;background:var(--panel2,#f1f5f9);border:1px solid var(--line,#e2e8f0);border-radius:10px;padding:3px;gap:2px}
    .ve-seg button{border:none;background:transparent;padding:6px 14px;border-radius:8px;font-size:13px;font-weight:600;color:var(--muted,#64748b);cursor:pointer}
    .ve-seg button.on{background:var(--primary,#0891b2);color:#fff}
    .ve-bar-wrap{background:var(--panel2,#f1f5f9);border-radius:6px;height:8px;overflow:hidden;min-width:70px}
    .ve-bar{height:100%;background:linear-gradient(90deg,#0891b2,#22d3ee);border-radius:6px}
    .ve-rank{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:6px;background:var(--panel2,#f1f5f9);color:var(--muted,#64748b);font-size:12px;font-weight:700;flex:none}
    .ve-databar{position:absolute;right:6px;top:50%;transform:translateY(-50%);height:22px;border-radius:5px;pointer-events:none}
    .ve-databar.usd{background:linear-gradient(90deg,rgba(8,145,178,.10),rgba(34,211,238,.22))}
    .ve-databar.kg{background:linear-gradient(90deg,rgba(100,116,139,.08),rgba(100,116,139,.20))}
    .ve-cell{position:relative}
    .ve-cell span{position:relative;z-index:1}
  `;
  document.head.appendChild(style);

  // ── Layout ──────────────────────────────────────────────
  $('pageContent').innerHTML = `
<div class="stack" style="gap:18px">
  <div class="card">
    <div class="eyebrow">Radar · Comercio Exterior</div>
    <h2 style="margin:2px 0 4px">Ventas de Exportación</h2>
    <div class="hint" style="color:var(--muted);font-size:13px">Facturas de mercado <b>EXT</b> del ERP (empresa activa). Valor en <b>USD</b> (convertido con el tipo de cambio de cada factura) y <b>MXN</b> (subtotal).</div>
    <div style="display:flex;gap:16px;align-items:flex-end;flex-wrap:wrap;margin-top:14px">
      <div><label class="label-text">Año</label><select class="input" id="selAnio" style="min-width:120px"></select></div>
      <div><label class="label-text">Mes</label><select class="input" id="selMes" style="min-width:170px"></select></div>
      <div><label class="label-text">Moneda (tendencia)</label><div class="ve-seg" id="segMon">
        <button data-c="USD" class="on">USD</button><button data-c="MXN">MXN</button>
      </div></div>
    </div>
  </div>

  <div class="ve-kpis" id="kpis"></div>
  <div id="insight"></div>

  <div class="card">
    <div class="eyebrow">Tendencia</div>
    <h3 style="margin:2px 0 8px">Exportación mensual (<span id="curLabel">USD</span>)</h3>
    <div style="position:relative;height:320px"><canvas id="c_mensual"></canvas></div>
  </div>

  <div class="card">
    <div class="eyebrow">Concentración</div>
    <h3 style="margin:2px 0 8px">Top clientes por exportación (<span id="curLabel2">USD</span>)</h3>
    <div style="position:relative;height:340px"><canvas id="c_top"></canvas></div>
  </div>

  <div class="card">
    <div class="eyebrow">Detalle</div>
    <h3 style="margin:2px 0 8px">Ranking de clientes de exportación</h3>
    <div style="overflow-x:auto"><table class="table" id="tblClientes"></table></div>
  </div>
</div>`;

  $('selAnio').addEventListener('change', (e) => { anioSel = e.target.value ? Number(e.target.value) : null; load(); });
  $('selMes').addEventListener('change', (e) => { mesSel = e.target.value ? Number(e.target.value) : null; load(); });
  $('segMon').querySelectorAll('button').forEach((btn) => btn.addEventListener('click', () => { moneda = btn.dataset.c; load(); }));

  function poblarSelectores(D) {
    if (!selectoresListos) {
      $('selMes').innerHTML = `<option value="">Acumulado (año)</option>` + MESES.map((m, i) => `<option value="${i + 1}">${m}</option>`).join('');
      selectoresListos = true;
    }
    $('selAnio').innerHTML = (D.anios || []).map((a) => `<option value="${a}">${a}</option>`).join('') || `<option value="">—</option>`;
    anioSel = D.anio || (D.anios && D.anios[0]) || null;
    $('selAnio').value = anioSel != null ? String(anioSel) : '';
    $('selMes').value = D.mes != null ? String(D.mes) : '';
    $('segMon').querySelectorAll('button').forEach((btn) => btn.classList.toggle('on', btn.dataset.c === moneda));
    $('curLabel').textContent = moneda; $('curLabel2').textContent = moneda;
  }

  function dashQuery() {
    const parts = [];
    if (anioSel) parts.push('anio=' + anioSel);
    if (mesSel) parts.push('mes=' + mesSel);
    return parts.length ? '?' + parts.join('&') : '';
  }

  function pintarAviso(msg) {
    $('kpis').innerHTML = `<div class="card" style="grid-column:1/-1;text-align:center;color:var(--muted)">${esc(msg)}</div>`;
    $('insight').innerHTML = '';
    [chartTrend, chartTop].forEach((c) => { if (c) { try { c.destroy(); } catch (_) {} } });
    chartTrend = chartTop = null;
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
    renderInsight(D);
    await renderCharts(D);
    renderTabla(D);
  }

  function kpiCard(val, lab, sub, cls) {
    return `<div class="ve-kpi ${cls || ''}"><div class="ve-accent"></div><div class="ve-lab">${esc(lab)}</div><div class="ve-val">${val}</div><div class="ve-sub">${sub}</div></div>`;
  }
  function renderKpis(D) {
    const m = D.meta || {};
    const usdKg = m.kg ? m.usd / m.kg : 0;
    const per = D.mes ? `${MESES[D.mes - 1]} ${D.anio || ''}` : `${D.anio || ''} · acumulado`;
    $('kpis').innerHTML = [
      kpiCard(moneyC(m.usd, 'USD'), 'Exportado (USD)', `${money(m.mxn, 'MXN')} MXN · ${esc(per)}`, 'hero'),
      kpiCard(nf0.format(m.kg || 0) + ' kg', 'Volumen', `US$${nf1.format(usdKg)} / kg`, 'small'),
      kpiCard(nf0.format(m.facturas || 0), 'Facturas', `${nf0.format(m.clientes || 0)} clientes`, 'small'),
      kpiCard(moneyC(m.ticket_usd, 'USD'), 'Ticket promedio', 'por factura (USD)', 'small'),
      kpiCard(nf0.format(m.lineas || 0), 'Líneas facturadas', 'renglones de producto', 'small'),
    ].join('');
  }

  function renderInsight(D) {
    const m = D.meta || {}, cl = D.clientes || [], men = D.mensual || { labels: [], usd: [] };
    if (!cl.length) { $('insight').innerHTML = ''; return; }
    const totUsd = cl.reduce((a, r) => a + (r.usd || 0), 0) || m.usd || 1;
    const top3 = cl.slice(0, 3).reduce((a, r) => a + (r.usd || 0), 0);
    const top3pct = Math.round((top3 / totUsd) * 100);
    const lider = cl[0];
    let picoTxt = '';
    if (men.usd && men.usd.length) {
      const i = men.usd.indexOf(Math.max(...men.usd));
      if (i >= 0) picoTxt = ` El mes más fuerte fue <b>${esc(men.labels[i])}</b> (${money(men.usd[i], 'USD')}).`;
    }
    $('insight').innerHTML = `<div class="ve-insight"><b>Lectura:</b> <b>${esc(lider.cliente)}</b> lidera con ${money(lider.usd, 'USD')} (${Math.round((lider.usd / totUsd) * 100)}% del total); los <b>top 3</b> concentran el <b>${top3pct}%</b> de la exportación.${picoTxt}</div>`;
  }

  // Plugin ligero: etiqueta de valor sobre cada barra.
  const barLabels = {
    id: 'veBarLabels',
    afterDatasetsDraw(c) {
      const { ctx } = c; const cur = c.$cur || 'USD';
      ctx.save(); ctx.font = '600 11px Inter, sans-serif'; ctx.fillStyle = '#334155'; ctx.textAlign = 'center';
      c.data.datasets.forEach((ds, di) => {
        const meta = c.getDatasetMeta(di);
        meta.data.forEach((bar, i) => {
          const v = ds.data[i]; if (!v) return;
          if (c.options.indexAxis === 'y') { ctx.textAlign = 'left'; ctx.fillText(moneyC(v, cur), bar.x + 6, bar.y + 4); }
          else { ctx.textAlign = 'center'; ctx.fillText(moneyC(v, cur), bar.x, bar.y - 6); }
        });
      });
      ctx.restore();
    },
  };

  async function renderCharts(D) {
    try { await loadScript(CHART_SRC); } catch (_) { return; }
    const Chart = window.Chart;
    Chart.defaults.font.family = 'Inter,system-ui,sans-serif'; Chart.defaults.color = '#64748b'; Chart.defaults.font.size = 12;
    [chartTrend, chartTop].forEach((c) => { if (c) { try { c.destroy(); } catch (_) {} } });

    const serie = moneda === 'MXN' ? D.mensual.mxn : D.mensual.usd;
    const grad = (ctx) => { const g = ctx.createLinearGradient(0, 0, 0, 320); g.addColorStop(0, CO.primary); g.addColorStop(1, '#67e8f9'); return g; };
    chartTrend = new Chart($('c_mensual'), {
      type: 'bar',
      data: { labels: D.mensual.labels, datasets: [{ label: `Exportación ${moneda}`, data: serie, backgroundColor: (c) => grad(c.chart.ctx), borderRadius: 6, maxBarThickness: 64 }] },
      options: {
        maintainAspectRatio: false, layout: { padding: { top: 22 } },
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => money(c.raw, moneda) } } },
        scales: { y: { ticks: { callback: (v) => moneyC(v, moneda) }, grid: { color: '#f1f5f9' } }, x: { grid: { display: false } } },
      },
      plugins: [barLabels],
    });
    chartTrend.$cur = moneda;

    // Top clientes (horizontal)
    const top = (D.clientes || []).slice(0, 10);
    const key = moneda === 'MXN' ? 'mxn' : 'usd';
    chartTop = new Chart($('c_top'), {
      type: 'bar',
      data: { labels: top.map((r) => r.cliente.length > 28 ? r.cliente.slice(0, 27) + '…' : r.cliente), datasets: [{ data: top.map((r) => r[key]), backgroundColor: CO.primary, borderRadius: 5, maxBarThickness: 22 }] },
      options: {
        maintainAspectRatio: false, indexAxis: 'y', layout: { padding: { right: 60 } },
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => money(c.raw, moneda) + '  ·  ' + nf0.format(top[c.dataIndex].facturas) + ' fac' } } },
        scales: { x: { ticks: { callback: (v) => moneyC(v, moneda) }, grid: { color: '#f1f5f9' } }, y: { grid: { display: false } } },
      },
      plugins: [barLabels],
    });
    chartTop.$cur = moneda;
  }

  function renderTabla(D) {
    const cl = D.clientes || [];
    const totUsd = cl.reduce((a, r) => a + (r.usd || 0), 0) || 1;
    const maxUsd = cl.length ? Math.max(...cl.map((r) => r.usd || 0)) : 1;
    const maxKg = cl.length ? Math.max(...cl.map((r) => r.kg || 0)) : 1;
    let acum = 0;
    $('tblClientes').innerHTML = `<thead><tr>
      <th style="width:26px"></th><th>Cliente</th><th>Agente</th><th style="text-align:right">Facturas</th>
      <th style="text-align:right;min-width:150px">USD</th><th style="text-align:right">% total</th><th style="text-align:right">% acum.</th>
      <th style="text-align:right">MXN</th><th style="text-align:right;min-width:120px">Kg</th><th style="text-align:right">US$/kg</th>
      </tr></thead><tbody>${cl.map((r, i) => {
        const shareRaw = (r.usd / totUsd) * 100;
        const share = Math.round(shareRaw * 10) / 10;
        acum += shareRaw;
        const wUsd = Math.max(4, Math.round((r.usd / maxUsd) * 100));
        const wKg = Math.max(4, Math.round((r.kg / maxKg) * 100));
        const ukg = r.kg ? r.usd / r.kg : 0;
        return `<tr>
        <td><span class="ve-rank">${i + 1}</span></td>
        <td><b>${esc(r.cliente)}</b><div style="color:var(--muted);font-size:11px">${esc(r.cve_cte || '')}</div></td>
        <td>${esc(r.agente)}</td>
        <td style="text-align:right">${nf0.format(r.facturas)}</td>
        <td class="ve-cell" style="text-align:right;font-weight:600"><div class="ve-databar usd" style="width:${wUsd}%"></div><span>${money(r.usd, 'USD')}</span></td>
        <td style="text-align:right;font-weight:600;color:var(--primary)">${nf1.format(share)}%</td>
        <td style="text-align:right;color:var(--muted)">${nf0.format(Math.round(acum))}%</td>
        <td style="text-align:right;color:var(--muted)">${money(r.mxn, 'MXN')}</td>
        <td class="ve-cell" style="text-align:right"><div class="ve-databar kg" style="width:${wKg}%"></div><span>${nf0.format(r.kg)}</span></td>
        <td style="text-align:right">US$${nf1.format(ukg)}</td>
        </tr>`;
      }).join('')}</tbody>`;
  }

  await load();
});

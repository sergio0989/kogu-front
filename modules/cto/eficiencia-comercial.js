// ============================================================
// eficiencia-comercial.js — Costo (cto_): tablero decisional "Eficiencia
// comercial" con 3 lentes sobre los mismos datos (Dirección):
//   1) Eficiencia por agente: gasto de venta ÷ utilidad bruta (ranking)
//   2) Tendencia de % operación por agente (multilínea por mes)
//   3) Alertas de margen por mes: renglones en pérdida y utilidad 0–20%
// Reusa endpoints:
//   GET /dashboard/:anio/agentes · /serie-agentes · /margen-alertas
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/cto/eficiencia-comercial.html';
  const PERM = 'screen.costo';
  const BASE = '/protected/cto';
  const CHART_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js';

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Eficiencia comercial',
    description: 'Lente decisional sobre el gasto de venta y el margen: retorno por agente, tendencia de operación y alertas de margen por mes.',
    requiredPermission: PERM,
  });
  if (!b) return;

  const $ = (id) => document.getElementById(id);
  const now = new Date();
  let charts = [];

  const mon = (v) => '$' + (Number(v) || 0).toLocaleString('es-MX', { maximumFractionDigits: 0 });
  const pct1 = (v) => ((Number(v) || 0) * 100).toFixed(1) + '%';
  const num = (v) => (Number(v) || 0).toLocaleString('es-MX', { maximumFractionDigits: 0 });
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
  const MES = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const loadChart = () => new Promise((res, rej) => {
    if (window.Chart) return res();
    const s = document.createElement('script'); s.src = CHART_SRC; s.onload = res; s.onerror = rej; document.head.appendChild(s);
  });

  const c = document.getElementById('pageContent');
  c.innerHTML = `
<div class="card">
  <div class="row">
    <div><div class="eyebrow">Costo · Dirección</div><h2>Eficiencia comercial</h2></div>
    <div style="display:flex;gap:8px;align-items:flex-end">
      <div><label class="muted" style="font-size:12px">Año</label><input type="number" id="anio" class="input" style="width:100px" value="${now.getFullYear()}"/></div>
      <button class="btn primary" id="loadBtn">Cargar</button>
    </div>
  </div>
  <div id="msg" class="muted" style="margin-top:10px;font-size:13px">Indica el año y pulsa <b>Cargar</b>.</div>
</div>

<div class="card sec" id="s1" style="margin-top:16px;display:none">
  <h3 style="margin:0 0 4px">1 · Eficiencia por agente</h3>
  <p class="muted" style="font-size:12px;margin:0 0 10px">Gasto de venta como % de la utilidad bruta que genera cada agente (acumulado). Menor = más eficiente.</p>
  <div id="k1" class="grid-3" style="gap:12px;margin-bottom:12px"></div>
  <div style="position:relative;height:420px"><canvas id="cEfic"></canvas></div>
</div>

<div class="card sec" id="s2" style="margin-top:16px;display:none">
  <h3 style="margin:0 0 4px">2 · Tendencia de % operación por agente</h3>
  <p class="muted" style="font-size:12px;margin:0 0 10px">Margen de operación mes a mes por agente. Detecta quién mejora o se deteriora.</p>
  <div style="position:relative;height:380px"><canvas id="cTrend"></canvas></div>
</div>

<div class="card sec" id="s3" style="margin-top:16px;display:none">
  <h3 style="margin:0 0 4px">3 · Alertas de margen por mes</h3>
  <p class="muted" style="font-size:12px;margin:0 0 10px">Renglones en pérdida y en utilidad 0–20% — la utilidad que se deja en la mesa.</p>
  <div id="k3" class="grid-3" style="gap:12px;margin-bottom:12px"></div>
  <div style="position:relative;height:300px"><canvas id="cAlert"></canvas></div>
  <div style="overflow:auto;margin-top:12px"><table style="width:100%;border-collapse:collapse;font-size:13px" id="tAlert"></table></div>
</div>`;

  function kpi(label, val, sub, color) {
    return `<div class="card" style="padding:14px">
      <div class="muted" style="font-size:12px">${label}</div>
      <div style="font-size:20px;font-weight:700;margin-top:4px${color ? ';color:' + color : ''}">${val}</div>
      ${sub ? `<div class="muted" style="font-size:12px;margin-top:2px">${sub}</div>` : ''}</div>`;
  }

  // ─── Lente 1 ───
  function pintarEficiencia(d) {
    const ags = (d.agentes || [])
      .filter((a) => Number(a.total_ventas) > 0 && Number(a.utilidad_bruta) > 0)
      .map((a) => ({ nombre: a.agente_nombre, gv: Number(a.gastos_venta) || 0, ub: Number(a.utilidad_bruta) || 0 }))
      .map((a) => ({ ...a, r: a.ub ? a.gv / a.ub : 0 }))
      .sort((x, y) => y.r - x.r);
    const t = d.totales || {};
    const prom = (Number(t.utilidad_bruta) ? Number(t.gastos_venta) / Number(t.utilidad_bruta) : 0);
    const conGV = ags.filter((a) => a.gv > 0);
    const mejor = conGV.length ? conGV[conGV.length - 1] : null;
    const peor = conGV.length ? conGV[0] : null;
    $('k1').innerHTML = [
      kpi('Promedio del negocio', pct1(prom), 'gasto venta ÷ utilidad bruta'),
      mejor ? kpi('Más eficiente', `${esc(mejor.nombre.split(' ')[0])} · ${pct1(mejor.r)}`, 'de los que tienen gasto', '#16a34a') : '',
      peor ? kpi('Más caro', `${esc(peor.nombre.split(' ')[0])} · ${pct1(peor.r)}`, 'de su utilidad en gasto', '#dc2626') : '',
    ].join('');
    const col = (v) => v > 0.20 ? '#A32D2D' : (v >= 0.10 ? '#BA7517' : '#3B6D11');
    charts.push(new window.Chart($('cEfic'), {
      type: 'bar',
      data: { labels: ags.map((a) => a.nombre), datasets: [{ data: ags.map((a) => +(a.r * 100).toFixed(1)), backgroundColor: ags.map((a) => col(a.r)) }] },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (x) => x.parsed.x.toFixed(1) + '% de su utilidad bruta' } } },
        scales: { x: { ticks: { callback: (v) => v + '%' }, grid: { display: false } }, y: { grid: { display: false } } },
      },
    }));
  }

  // ─── Lente 2 ───
  function pintarTendencia(d) {
    const ags = (d.agentes || []).filter((a) => a.agente_id).slice(0, 8);
    const mesesSet = new Set();
    ags.forEach((a) => Object.keys(a.serie || {}).forEach((m) => mesesSet.add(+m)));
    const meses = [...mesesSet].sort((x, y) => x - y);
    const palette = ['#185FA5', '#0F6E56', '#993C1D', '#993556', '#534AB7', '#854F0B', '#3B6D11', '#5F5E5A'];
    const ds = ags.map((a, i) => ({
      label: a.agente_nombre,
      data: meses.map((m) => a.serie[m] ? +((a.serie[m].utilidad_operacion_pct || 0) * 100).toFixed(1) : null),
      borderColor: palette[i % palette.length], backgroundColor: palette[i % palette.length],
      tension: 0.25, spanGaps: true, pointRadius: 3,
    }));
    charts.push(new window.Chart($('cTrend'), {
      type: 'line',
      data: { labels: meses.map((m) => MES[m]), datasets: ds },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } },
          tooltip: { callbacks: { label: (x) => x.dataset.label + ': ' + (x.parsed.y == null ? '—' : x.parsed.y + '%') } } },
        scales: { y: { ticks: { callback: (v) => v + '%' } }, x: { grid: { display: false } } },
      },
    }));
  }

  // ─── Lente 3 ───
  function pintarAlertas(d) {
    const ms = d.meses || [], t = d.totales || {};
    $('k3').innerHTML = [
      kpi('Renglones en pérdida (YTD)', num(t.perdida_renglones), `impacto ${mon(t.perdida_utilidad)}`, '#dc2626'),
      kpi('Utilidad 0–20% (YTD)', num(t.bajo_renglones) + ' renglones', `${mon(t.bajo_ventas)} en venta`, '#d97706'),
      kpi('Venta en pérdida (YTD)', mon(t.perdida_ventas), 'a revisar precio/costo'),
    ].join('');
    charts.push(new window.Chart($('cAlert'), {
      type: 'bar',
      data: {
        labels: ms.map((m) => m.mes_nombre),
        datasets: [
          { label: 'Venta en pérdida', data: ms.map((m) => Number(m.perdida_ventas) || 0), backgroundColor: '#A32D2D' },
          { label: 'Venta 0–20%', data: ms.map((m) => Number(m.bajo_ventas) || 0), backgroundColor: '#BA7517' },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } },
          tooltip: { callbacks: { label: (x) => x.dataset.label + ': ' + mon(x.parsed.y) } } },
        scales: { y: { ticks: { callback: (v) => '$' + (v / 1000000).toFixed(1) + 'M' } }, x: { grid: { display: false } } },
      },
    }));
    const head = `<thead><tr style="text-align:right;border-bottom:2px solid #e2e8f0">
      <th style="text-align:left;padding:6px">Mes</th><th style="padding:6px"># Pérdida</th><th style="padding:6px">Impacto</th>
      <th style="padding:6px"># 0–20%</th><th style="padding:6px">Venta 0–20%</th></tr></thead>`;
    const rows = ms.map((m) => `<tr style="text-align:right;border-bottom:1px solid #f1f5f9">
      <td style="text-align:left;padding:6px;font-weight:600">${esc(m.mes_nombre)}</td>
      <td style="padding:6px">${num(m.perdida_renglones)}</td>
      <td style="padding:6px;color:#dc2626">${mon(m.perdida_utilidad)}</td>
      <td style="padding:6px">${num(m.bajo_renglones)}</td>
      <td style="padding:6px">${mon(m.bajo_ventas)}</td></tr>`).join('');
    const tot = `<tr style="text-align:right;border-top:2px solid #cbd5e1;font-weight:700;background:#f8fafc">
      <td style="text-align:left;padding:6px">TOTAL</td><td style="padding:6px">${num(t.perdida_renglones)}</td>
      <td style="padding:6px;color:#dc2626">${mon(t.perdida_utilidad)}</td><td style="padding:6px">${num(t.bajo_renglones)}</td>
      <td style="padding:6px">${mon(t.bajo_ventas)}</td></tr>`;
    $('tAlert').innerHTML = head + '<tbody>' + rows + tot + '</tbody>';
  }

  async function cargar() {
    const anio = $('anio').value;
    if (!anio) return KoguApi.toast('Indica el año.', 'error');
    $('msg').textContent = 'Cargando…';
    charts.forEach((ch) => { try { ch.destroy(); } catch (e) {} }); charts = [];
    try {
      const [efi, ser, ale] = await Promise.all([
        KoguApi.apiFetch(`${BASE}/dashboard/${anio}/agentes`).then(KoguApi.unwrapData),
        KoguApi.apiFetch(`${BASE}/dashboard/${anio}/serie-agentes`).then(KoguApi.unwrapData),
        KoguApi.apiFetch(`${BASE}/dashboard/${anio}/margen-alertas`).then(KoguApi.unwrapData),
      ]);
      await loadChart();
      ['s1', 's2', 's3'].forEach((id) => $(id).style.display = 'block');
      pintarEficiencia(efi);
      pintarTendencia(ser);
      pintarAlertas(ale);
      $('msg').textContent = 'Listo.';
    } catch (e) { $('msg').textContent = ''; KoguApi.toast(e.message, 'error'); }
  }

  $('loadBtn').onclick = cargar;
});

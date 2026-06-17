// ============================================================
// dashboard-bruta.js — Costo (cto_): Tablero Dirección · Fase 1.
// Costo integrado + Utilidad bruta. KPIs del mes en foco, tendencia
// mensual apilada (costo integrado + utilidad bruta = ventas) y tabla
// del año. Solo lectura: GET /protected/cto/dashboard/:anio.
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/cto/dashboard-bruta.html';
  const PERM = 'screen.costo';
  const BASE = '/protected/cto';
  const CHART_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js';

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Dirección · Utilidad Bruta',
    description: 'Fase 1 — ventas, costo integrado y utilidad bruta del año. Tendencia mensual y KPIs por periodo.',
    requiredPermission: PERM,
  });
  if (!b) return;

  const $ = (id) => document.getElementById(id);
  const now = new Date();
  let chart = null;
  let data = null; // { anio, meses, totales }

  const fmtMon = (v) => '$' + (Number(v) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtMM = (v) => '$' + (Number(v) / 1e6).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' M';
  const fmtPct = (v) => v == null ? '—' : ((Number(v) || 0) * 100).toFixed(2) + ' %';
  const fmtNum = (v) => (Number(v) || 0).toLocaleString('es-MX');
  const fmtKg = (v) => (Number(v) || 0).toLocaleString('es-MX', { maximumFractionDigits: 0 }) + ' kg';

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if ([...document.scripts].some(s => s.src === src)) return resolve();
      const s = document.createElement('script'); s.src = src; s.onload = resolve;
      s.onerror = () => reject(new Error('No se pudo cargar ' + src));
      document.head.appendChild(s);
    });
  }

  function chip(pctVal) {
    const p = Number(pctVal) || 0;
    const map = p >= 0.20 ? ['#dcfce7', '#166534', 'Correcto']
      : p >= 0.10 ? ['#fef9c3', '#854d0e', 'Revisar']
        : ['#fee2e2', '#991b1b', 'Alerta'];
    return `<span style="background:${map[0]};color:${map[1]};padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700">${map[2]}</span>`;
  }

  // Variación vs mes anterior (▲/▼ %). upGood=true → subir es verde.
  function varSpan(cur, prev, prevName, upGood = true) {
    if (prev == null || !isFinite(Number(prev)) || Number(prev) === 0) return '';
    const d = (Number(cur) - Number(prev)) / Number(prev);
    const up = d >= 0, good = upGood ? up : !up;
    return `<span style="color:${good ? '#166534' : '#991b1b'};font-weight:600;font-size:11px">${up ? '▲' : '▼'} ${Math.abs(d * 100).toFixed(1)}% vs ${prevName}</span>`;
  }

  $('pageContent').innerHTML = `
<div class="card">
  <div class="row">
    <div><div class="eyebrow">Costo · Tableros</div><h2 style="margin:2px 0">Utilidad Bruta</h2>
      <div class="muted" style="font-size:12px">Ventas, costo integrado y utilidad por mes</div></div>
    <div style="display:flex;gap:8px;align-items:flex-end">
      <div><label class="muted" style="font-size:12px">Año</label><input type="number" id="anio" class="input" style="width:100px" value="${now.getFullYear()}"/></div>
      <div><label class="muted" style="font-size:12px">Mes (KPIs)</label>
        <select id="mes" class="input" style="width:130px"></select></div>
      <button class="btn primary" id="refreshBtn">Actualizar</button>
      <a class="btn ghost" href="/modules/cto/dashboard-operacion.html" style="white-space:nowrap;text-decoration:none">Ut. Operación →</a>
    </div>
  </div>
  <div id="msg" style="display:none;margin-top:14px;padding:12px;border-radius:6px;font-size:13px"></div>
</div>

<div id="kpis" class="grid-3" style="margin-top:16px;gap:12px;display:none"></div>

<div class="card" id="chartCard" style="margin-top:16px;display:none">
  <div class="row"><h3 style="margin:0">Costo integrado + Utilidad bruta por mes</h3>
    <span class="muted" style="font-size:12px">Cada barra suma el total de ventas del mes</span></div>
  <div style="position:relative;height:340px;margin-top:12px;max-width:880px"><canvas id="chartMeses"></canvas></div>
</div>

<div class="card" id="tablaCard" style="margin-top:16px;display:none">
  <h3 style="margin:0 0 10px 0">Detalle por mes</h3>
  <div style="overflow-x:auto"><table class="table" id="tabla" style="width:100%;font-size:13px;font-variant-numeric:tabular-nums"></table></div>
</div>`;

  function showMsg(html, tipo) {
    const m = $('msg');
    const bg = tipo === 'error' ? '#fee2e2' : tipo === 'warn' ? '#fef9c3' : '#dcfce7';
    const co = tipo === 'error' ? '#991b1b' : tipo === 'warn' ? '#854d0e' : '#166534';
    m.style.cssText = `display:block;margin-top:14px;padding:12px;border-radius:6px;font-size:13px;background:${bg};color:${co}`;
    m.innerHTML = html;
  }

  function kpi(label, val, sub, accent) {
    return `<div class="card" style="padding:16px;${accent ? 'border-top:3px solid ' + accent : ''}">
      <div class="muted" style="font-size:12px">${label}</div>
      <div style="font-size:22px;font-weight:700;margin-top:4px">${val}</div>
      ${sub ? `<div class="muted" style="font-size:12px;margin-top:2px">${sub}</div>` : ''}
    </div>`;
  }

  function pintarKpis() {
    const mesSel = parseInt($('mes').value, 10);
    const idx = data.meses.findIndex(x => x.mes === mesSel);
    const m = idx >= 0 ? data.meses[idx] : null;
    const prev = idx > 0 ? data.meses[idx - 1] : null;
    const t = data.totales;
    if (!m) { $('kpis').style.display = 'none'; return; }
    const pn = prev ? prev.mes_nombre : '';
    const costoPct = m.total_ventas ? (m.costo_integrado / m.total_ventas) * 100 : 0;
    $('kpis').style.display = 'grid';
    $('kpis').innerHTML = [
      kpi(`Ventas · ${m.mes_nombre}`, fmtMM(m.total_ventas), `${fmtMon(m.total_ventas)} ${varSpan(m.total_ventas, prev && prev.total_ventas, pn)}`, '#0d9488'),
      kpi('Costo integrado', fmtMM(m.costo_integrado), `${costoPct.toFixed(2)} % de ventas`, '#64748b'),
      kpi('Utilidad bruta', fmtMM(m.utilidad_bruta), `${fmtPct(m.utilidad_bruta_pct)} ${chip(m.utilidad_bruta_pct)} ${varSpan(m.utilidad_bruta, prev && prev.utilidad_bruta, pn)}`, '#8b5cf6'),
      kpi(`Kilos · Facturas · ${m.mes_nombre}`, fmtKg(m.kilos), fmtNum(m.recuento_facturas) + ' facturas'),
      kpi(`Ventas YTD ${data.anio}`, fmtMM(t.total_ventas), `${fmtMon(t.total_ventas)} · ${fmtNum(t.recuento_facturas)} fact.`, '#0d9488'),
      kpi('Utilidad bruta YTD', fmtMM(t.utilidad_bruta), `${fmtPct(t.utilidad_bruta_pct)} ${chip(t.utilidad_bruta_pct)}`, '#8b5cf6'),
    ].join('');
  }

  async function pintarChart() {
    try { await loadScript(CHART_SRC); } catch (_e) { return; }
    const Chart = window.Chart;
    if (chart) { chart.destroy(); chart = null; }
    const labels = data.meses.map(m => m.mes_nombre);
    chart = new Chart($('chartMeses'), {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Costo integrado', data: data.meses.map(m => m.costo_integrado), backgroundColor: '#94a3b8', stack: 's', maxBarThickness: 34 },
          { label: 'Utilidad bruta', data: data.meses.map(m => m.utilidad_bruta), backgroundColor: '#0d9488', stack: 's', maxBarThickness: 34 },
        ],
      },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top' },
          tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${fmtMon(c.raw)}` } },
        },
        scales: {
          x: { stacked: true, ticks: { callback: (v) => '$' + (v / 1e6).toFixed(0) + 'M' } },
          y: { stacked: true },
        },
      },
    });
  }

  function pintarTabla() {
    const head = `<thead><tr style="text-align:right;border-bottom:2px solid #e2e8f0">
      <th style="text-align:left;padding:6px">Mes</th><th style="padding:6px">Ventas</th>
      <th style="padding:6px">Costo integrado</th><th style="padding:6px">Utilidad bruta</th>
      <th style="padding:6px">% Util</th><th style="padding:6px">Nivel</th>
      <th style="padding:6px">Kg</th><th style="padding:6px">Facturas</th></tr></thead>`;
    const mesSel = parseInt($('mes').value, 10);
    const rows = data.meses.map(m => `<tr style="text-align:right;border-bottom:1px solid #f1f5f9${m.mes === mesSel ? ';background:#f1f5f9' : ''}">
      <td style="text-align:left;padding:6px;font-weight:600">${m.mes_nombre}${m.mes === mesSel ? ' <span style="font-size:9px;color:#0ea5e9;font-weight:700;letter-spacing:.5px">FOCO</span>' : ''}</td>
      <td style="padding:6px">${fmtMon(m.total_ventas)}</td>
      <td style="padding:6px">${fmtMon(m.costo_integrado)}</td>
      <td style="padding:6px;font-weight:600">${fmtMon(m.utilidad_bruta)}</td>
      <td style="padding:6px">${fmtPct(m.utilidad_bruta_pct)}</td>
      <td style="padding:6px;text-align:center">${chip(m.utilidad_bruta_pct)}</td>
      <td style="padding:6px">${fmtNum(Math.round(m.kilos))}</td>
      <td style="padding:6px">${fmtNum(m.recuento_facturas)}</td></tr>`).join('');
    const t = data.totales;
    const total = `<tr style="text-align:right;border-top:2px solid #cbd5e1;font-weight:700;background:#f8fafc">
      <td style="text-align:left;padding:6px">TOTAL ${data.anio}</td>
      <td style="padding:6px">${fmtMon(t.total_ventas)}</td>
      <td style="padding:6px">${fmtMon(t.costo_integrado)}</td>
      <td style="padding:6px">${fmtMon(t.utilidad_bruta)}</td>
      <td style="padding:6px">${fmtPct(t.utilidad_bruta_pct)}</td>
      <td style="padding:6px;text-align:center">${chip(t.utilidad_bruta_pct)}</td>
      <td style="padding:6px">${fmtNum(Math.round(t.kilos))}</td>
      <td style="padding:6px">${fmtNum(t.recuento_facturas)}</td></tr>`;
    $('tabla').innerHTML = head + '<tbody>' + rows + total + '</tbody>';
  }

  function llenarSelectMes() {
    const sel = $('mes');
    const prev = parseInt(sel.value, 10) || (now.getMonth() + 1);
    sel.innerHTML = data.meses.map(m => `<option value="${m.mes}">${m.mes_nombre}</option>`).join('');
    const existe = data.meses.some(m => m.mes === prev);
    sel.value = existe ? prev : (data.meses.length ? data.meses[data.meses.length - 1].mes : prev);
  }

  async function cargar() {
    const anio = parseInt($('anio').value, 10);
    if (!anio) return KoguApi.toast('Indica el año.', 'error');
    $('refreshBtn').disabled = true;
    try {
      const res = await KoguApi.apiFetch(`${BASE}/dashboard/${anio}`);
      data = KoguApi.unwrapData(res);
      if (!data || !data.meses || !data.meses.length) {
        $('kpis').style.display = $('chartCard').style.display = $('tablaCard').style.display = 'none';
        showMsg('Sin datos calculados para ' + anio + '. Calcula algún mes en "Costo de ventas / Utilidad".', 'warn');
        return;
      }
      $('msg').style.display = 'none';
      $('chartCard').style.display = $('tablaCard').style.display = 'block';
      llenarSelectMes();
      pintarKpis(); pintarTabla(); await pintarChart();
    } catch (e) {
      showMsg('❌ ' + e.message, 'error');
      KoguApi.toast(e.message, 'error');
    } finally { $('refreshBtn').disabled = false; }
  }

  $('refreshBtn').addEventListener('click', cargar);
  $('anio').addEventListener('change', cargar);
  $('mes').addEventListener('change', pintarKpis);
  KoguShell.subscribeEmpresaActivaChange(() => cargar());

  cargar();
});

// ============================================================
// exportacion-analisis.js — Costo (cto_): Exportación · Análisis.
// Tres lentes para Dirección:
//   1) Margen real de exportación vs nacional (neto del gasto internacional).
//   2) Exposición y FX realizado (factura→cobro) de las ventas en USD.
//   3) Concentración de clientes de exportación (Pareto).
// Solo lectura: GET /protected/cto/dashboard/:anio/export-analisis.
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/cto/exportacion-analisis.html';
  const PERM = 'screen.costo';
  const BASE = '/protected/cto';
  const CHART_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js';

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Exportación · Análisis',
    description: 'Margen real de exportación, exposición y diferencia cambiaria realizada, y concentración de clientes de exportación.',
    requiredPermission: PERM,
  });
  if (!b) return;

  const $ = (id) => document.getElementById(id);
  const now = new Date();
  const MES3 = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

  const money = (v) => (KoguUi && KoguUi.money) ? KoguUi.money(Number(v || 0)) : '$' + (Number(v) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtMM = (v) => '$' + (Number(v) / 1e6).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' M';
  const fmtMon = (v) => '$' + (Number(v) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtNum = (v) => (Number(v) || 0).toLocaleString('es-MX');
  const nf0 = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 });
  const fmtPct = (v) => v == null ? '—' : (Number(v) * 100).toFixed(1) + ' %';
  const fmtTC = (v) => v == null ? '—' : '$' + Number(v).toLocaleString('es-MX', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  const fmtKg = (v) => `${nf0.format(Number(v) || 0)} kg`;
  const esc = (s) => (KoguUi && KoguUi.escapeHtml) ? KoguUi.escapeHtml(String(s ?? '')) : String(s ?? '');

  let data = null;
  let margenChart = null, fxChart = null, paretoChart = null;

  // Carga deduplicada de Chart.js (espera onload real, comparte promesa).
  let _chartPromise = null;
  function ensureChart() {
    if (window.Chart) return Promise.resolve(window.Chart);
    if (_chartPromise) return _chartPromise;
    _chartPromise = new Promise((resolve, reject) => {
      const existing = [...document.scripts].find(s => s.src === CHART_SRC);
      const el = existing || document.createElement('script');
      el.addEventListener('load', () => resolve(window.Chart));
      el.addEventListener('error', () => { _chartPromise = null; reject(new Error('No se pudo cargar Chart.js')); });
      if (!existing) { el.src = CHART_SRC; document.head.appendChild(el); }
      if (window.Chart) resolve(window.Chart);
    });
    return _chartPromise;
  }

  function margenCol(m) {
    if (m == null) return '#64748b';
    const p = Number(m);
    return p < 0 ? '#991b1b' : p < 0.10 ? '#854d0e' : p >= 0.20 ? '#166534' : '#475569';
  }

  $('pageContent').innerHTML = `
<div class="card">
  <div class="row">
    <div><div class="eyebrow">Costo · Dirección</div><h2 style="margin:2px 0">Exportación · Análisis</h2>
      <div class="muted" style="font-size:12px">Margen real, exposición cambiaria y concentración de clientes de exportación</div></div>
    <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap">
      <div><label class="muted" style="font-size:12px;display:block">Año</label><input type="number" id="anio" class="input" style="width:100px" value="${now.getFullYear()}"/></div>
      <button class="btn primary" id="refreshBtn">Actualizar</button>
      <a class="btn ghost" href="/modules/cto/direccion-ventas.html" style="white-space:nowrap;text-decoration:none">← Dirección · Ventas</a>
    </div>
  </div>
  <div id="msg" style="display:none;margin-top:14px;padding:12px;border-radius:6px;font-size:13px"></div>
</div>

<!-- ── Lente 1: margen real ── -->
<div class="card" id="margenCard" style="margin-top:16px;display:none">
  <div class="row"><div><div class="eyebrow">Lente 1 · Rentabilidad</div><h2 style="margin:2px 0">¿La exportación realmente gana?</h2>
    <div class="muted" style="font-size:12px">Margen de exportación (neto del gasto internacional) vs nacional</div></div></div>
  <div id="margenKpis" class="grid-4" style="margin-top:14px;gap:12px"></div>
  <div id="margenCallout" class="muted" style="margin-top:12px;padding:10px 12px;background:var(--panel2,#f1f5f9);border-radius:10px;font-size:13px"></div>
  <div style="position:relative;height:300px;margin-top:14px"><canvas id="chartMargen"></canvas></div>
</div>

<!-- ── Lente 2: exposición y FX ── -->
<div class="card" id="fxCard" style="margin-top:16px;display:none">
  <div class="row"><div><div class="eyebrow">Lente 2 · Exposición cambiaria</div><h2 style="margin:2px 0">Diferencia cambiaria realizada</h2>
    <div class="muted" style="font-size:12px">Cobros en dólares: TC al facturar vs TC al cobrar (toda venta USD: nacional + exportación)</div></div></div>
  <div id="fxKpis" class="grid-4" style="margin-top:14px;gap:12px"></div>
  <div style="position:relative;height:280px;margin-top:14px"><canvas id="chartFx"></canvas></div>
  <div class="muted" style="font-size:11px;margin-top:8px" id="fxNota"></div>
</div>

<!-- ── Lente 3: concentración ── -->
<div class="card" id="concCard" style="margin-top:16px;display:none">
  <div class="row"><div><div class="eyebrow">Lente 3 · Concentración</div><h2 style="margin:2px 0">¿De cuántos clientes depende la exportación?</h2>
    <div class="muted" style="font-size:12px">Pareto de clientes de exportación — riesgo de dependencia</div></div></div>
  <div id="concKpis" class="grid-3" style="margin-top:14px;gap:12px"></div>
  <div style="position:relative;height:340px;margin-top:14px"><canvas id="chartConc"></canvas></div>
  <div style="overflow-x:auto;margin-top:14px"><table class="table" id="concTabla" style="width:100%;font-size:13px;font-variant-numeric:tabular-nums"></table></div>
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
      ${sub ? `<div class="muted" style="font-size:12px;margin-top:2px">${sub}</div>` : ''}</div>`;
  }

  // ── Lente 1 ──────────────────────────────────────────────────────────────
  async function renderMargen() {
    const t = data.margen_totales;
    if (!t || !t.exp_ventas) { $('margenCard').style.display = 'none'; return; }
    $('margenCard').style.display = 'block';
    const puntos = (t.exp_margen != null && t.exp_margen_sin_expo != null) ? (t.exp_margen_sin_expo - t.exp_margen) * 100 : null;
    $('margenKpis').innerHTML = [
      kpi('Exportación', fmtMM(t.exp_ventas), `${fmtPct(t.exp_pct_ventas)} de la venta`, '#4f46e5'),
      kpi('Margen exportación', fmtPct(t.exp_margen), 'neto del gasto internacional', margenCol(t.exp_margen)),
      kpi('Margen nacional', fmtPct(t.nal_margen), 'para comparar', margenCol(t.nal_margen)),
      kpi('Gasto internacional', fmtMM(t.exp_costo_expo), puntos != null ? `le resta ${puntos.toFixed(1)} pts de margen` : 'costo expo absorbido', '#d97706'),
    ].join('');
    const dif = (t.exp_margen != null && t.nal_margen != null) ? (t.exp_margen - t.nal_margen) * 100 : null;
    const veredicto = t.exp_margen == null ? ''
      : t.exp_margen < 0 ? `<b style="color:#991b1b">La exportación está dejando pérdida</b> a nivel margen bruto (${fmtPct(t.exp_margen)}).`
      : dif != null && dif < -2 ? `La exportación deja <b>${fmtPct(t.exp_margen)}</b>, <b>${Math.abs(dif).toFixed(1)} pts por debajo</b> del nacional (${fmtPct(t.nal_margen)}). Volumen que rinde menos.`
      : dif != null && dif > 2 ? `La exportación deja <b>${fmtPct(t.exp_margen)}</b>, <b>${dif.toFixed(1)} pts por encima</b> del nacional (${fmtPct(t.nal_margen)}). Negocio sano.`
      : `La exportación deja <b>${fmtPct(t.exp_margen)}</b>, a la par del nacional (${fmtPct(t.nal_margen)}).`;
    const expoNota = puntos != null && t.exp_costo_expo > 0
      ? ` Sin el gasto internacional (${fmtMM(t.exp_costo_expo)}) el margen sería ${fmtPct(t.exp_margen_sin_expo)}: ese costo le quita ${puntos.toFixed(1)} puntos.`
      : '';
    $('margenCallout').innerHTML = veredicto + expoNota;

    const Chart = await ensureChart().catch(() => null);
    if (!Chart) return;
    if (margenChart) { margenChart.destroy(); margenChart = null; }
    const m = data.margen_meses;
    margenChart = new Chart($('chartMargen'), {
      data: {
        labels: m.map(x => MES3[x.mes] || x.mes),
        datasets: [
          { type: 'bar', label: 'Venta exportación', data: m.map(x => x.exp_ventas), backgroundColor: '#c7d2fe', yAxisID: 'y', order: 3, maxBarThickness: 30 },
          { type: 'line', label: 'Margen exportación', data: m.map(x => x.exp_margen == null ? null : x.exp_margen * 100), borderColor: '#4f46e5', backgroundColor: '#4f46e5', yAxisID: 'y1', tension: 0.2, pointRadius: 2, borderWidth: 2, order: 1 },
          { type: 'line', label: 'Margen nacional', data: m.map(x => x.nal_margen == null ? null : x.nal_margen * 100), borderColor: '#059669', backgroundColor: '#059669', borderDash: [5, 4], yAxisID: 'y1', tension: 0.2, pointRadius: 2, borderWidth: 2, order: 2 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { font: { size: 12 } } },
          tooltip: { callbacks: { label: (c) => c.dataset.type === 'bar' ? `${c.dataset.label}: ${fmtMon(c.raw)}` : `${c.dataset.label}: ${Number(c.raw).toFixed(1)}%` } },
        },
        scales: {
          y: { position: 'left', beginAtZero: true, ticks: { callback: (v) => '$' + (v / 1e6).toFixed(0) + 'M', font: { size: 12 } }, grid: { display: false } },
          y1: { position: 'right', ticks: { callback: (v) => v + '%', font: { size: 12 } }, grid: { color: '#f1f5f9' } },
          x: { grid: { display: false }, ticks: { font: { size: 12 } } },
        },
      },
    });
  }

  // ── Lente 2 ──────────────────────────────────────────────────────────────
  async function renderFx() {
    const t = data.fx_totales;
    if (!t || !t.usd_cobrado) { $('fxCard').style.display = 'none'; return; }
    $('fxCard').style.display = 'block';
    const fxCol = t.fx_realizado >= 0 ? '#166534' : '#991b1b';
    const signo = t.fx_realizado >= 0 ? 'ganancia' : 'pérdida';
    $('fxKpis').innerHTML = [
      kpi('FX realizado del año', money(t.fx_realizado), `${signo} cambiaria al cobrar`, fxCol),
      kpi('TC factura → cobro', `${fmtTC(t.tc_factura)} → ${fmtTC(t.tc_cobro)}`, 'promedio ponderado', '#d97706'),
      kpi('Cobrado en USD', money(t.usd_cobrado), 'dólares cobrados en el año', '#4f46e5'),
      kpi('Sensibilidad ±$1 TC', money(t.usd_cobrado), 'efecto de mover $1 el TC', '#0ea5e9'),
    ].join('');

    const Chart = await ensureChart().catch(() => null);
    if (!Chart) return;
    if (fxChart) { fxChart.destroy(); fxChart = null; }
    const m = data.fx_meses;
    fxChart = new Chart($('chartFx'), {
      data: {
        labels: m.map(x => MES3[x.mes] || x.mes),
        datasets: [
          { type: 'bar', label: 'FX realizado', data: m.map(x => x.fx_realizado), backgroundColor: m.map(x => x.fx_realizado >= 0 ? '#16a34a' : '#dc2626'), yAxisID: 'y', order: 3, maxBarThickness: 34 },
          { type: 'line', label: 'TC cobro', data: m.map(x => x.tc_cobro), borderColor: '#d97706', backgroundColor: '#d97706', yAxisID: 'y1', tension: 0.2, pointRadius: 2, borderWidth: 2, order: 1 },
          { type: 'line', label: 'TC factura', data: m.map(x => x.tc_factura), borderColor: '#94a3b8', backgroundColor: '#94a3b8', borderDash: [4, 4], yAxisID: 'y1', tension: 0.2, pointRadius: 2, borderWidth: 1.5, order: 2 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { font: { size: 12 } } },
          tooltip: { callbacks: { label: (c) => c.dataset.type === 'bar' ? `${c.dataset.label}: ${fmtMon(c.raw)}` : `${c.dataset.label}: ${fmtTC(c.raw)}` } },
        },
        scales: {
          y: { position: 'left', ticks: { callback: (v) => '$' + (v / 1e3).toFixed(0) + 'k', font: { size: 12 } }, grid: { color: '#f1f5f9' } },
          y1: { position: 'right', ticks: { callback: (v) => '$' + Number(v).toFixed(2), font: { size: 12 } }, grid: { display: false } },
          x: { grid: { display: false }, ticks: { font: { size: 12 } } },
        },
      },
    });
    $('fxNota').textContent = 'FX realizado = Σ (USD cobrado × (TC de cobro − TC de factura)). Positivo = el peso se debilitó entre facturar y cobrar (ganas); negativo = se fortaleció (pierdes). Cubre toda venta facturada en USD, no solo exportación.';
  }

  // ── Lente 3 ──────────────────────────────────────────────────────────────
  function paretoOf(items) {
    const arr = [...items].filter(r => Number(r.ventas) > 0).sort((a, b) => b.ventas - a.ventas);
    const total = arr.reduce((s, r) => s + Number(r.ventas), 0);
    let acum = 0;
    const rows = arr.map((r, i) => { acum += Number(r.ventas); return { ...r, rank: i + 1, acumPct: total ? acum / total * 100 : 0, pct: total ? Number(r.ventas) / total * 100 : 0 }; });
    const n80 = (rows.find(r => r.acumPct >= 80) || {}).rank || rows.length;
    const top3 = rows.slice(0, 3).reduce((s, r) => s + Number(r.ventas), 0);
    return { rows, total, n80, count: rows.length, top3pct: total ? top3 / total * 100 : 0 };
  }

  async function renderConc() {
    const items = data.clientes || [];
    if (!items.length) { $('concCard').style.display = 'none'; return; }
    $('concCard').style.display = 'block';
    const p = paretoOf(items);
    $('concKpis').innerHTML = [
      kpi('80% de la exportación', `${fmtNum(p.n80)} clientes`, `de ${fmtNum(p.count)} con venta de exportación`, '#4f46e5'),
      kpi('Top 3 concentra', fmtPct(p.top3pct / 100), 'de la venta de exportación', '#dc2626'),
      kpi('Clientes de exportación', fmtNum(p.count), `${fmtMM(p.total)} en el año`, '#0ea5e9'),
    ].join('');

    const Chart = await ensureChart().catch(() => null);
    if (Chart) {
      if (paretoChart) { paretoChart.destroy(); paretoChart = null; }
      const top = p.rows.slice(0, 15);
      paretoChart = new Chart($('chartConc'), {
        data: {
          labels: top.map(r => r.nombre ? (r.nombre.length > 20 ? r.nombre.slice(0, 19) + '…' : r.nombre) : r.clave),
          datasets: [
            { type: 'bar', label: 'Venta exportación', data: top.map(r => Number(r.ventas)), backgroundColor: '#4f46e5', yAxisID: 'y', order: 3, maxBarThickness: 34 },
            { type: 'line', label: '% acumulado', data: top.map(r => r.acumPct), borderColor: '#0d9488', backgroundColor: '#0d9488', yAxisID: 'y1', tension: 0.2, pointRadius: 2, borderWidth: 2, order: 1 },
            { type: 'line', label: '80%', data: top.map(() => 80), borderColor: '#94a3b8', borderDash: [4, 4], yAxisID: 'y1', pointRadius: 0, borderWidth: 1, order: 2 },
          ],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { position: 'top', labels: { font: { size: 12 }, filter: (it) => it.text !== '80%' } },
            tooltip: { callbacks: { title: (i) => { const r = top[i[0].dataIndex]; return (r.nombre || r.clave) + ' · ' + r.clave; }, label: (c) => c.dataset.type === 'bar' ? 'Venta: ' + fmtMon(c.raw) : c.dataset.label + ': ' + Number(c.raw).toFixed(1) + '%' } },
          },
          scales: {
            y: { position: 'left', beginAtZero: true, ticks: { callback: (v) => '$' + (v / 1e6).toFixed(1) + 'M', font: { size: 12 } }, grid: { display: false } },
            y1: { position: 'right', min: 0, max: 100, ticks: { callback: (v) => v + '%', font: { size: 12 } }, grid: { display: false } },
            x: { ticks: { autoSkip: false, maxRotation: 55, minRotation: 45, font: { size: 10 } }, grid: { display: false } },
          },
        },
      });
    }

    const head = `<thead><tr style="border-bottom:2px solid #e2e8f0;text-align:right">
      <th style="text-align:left;padding:6px">#</th><th style="text-align:left;padding:6px">Cliente</th>
      <th style="padding:6px">Venta</th><th style="padding:6px">% acum.</th>
      <th style="padding:6px">Utilidad</th><th style="padding:6px">Margen</th><th style="padding:6px">Kg</th></tr></thead>`;
    const rows = p.rows.slice(0, p.n80).map(r => `<tr style="border-bottom:1px solid #f1f5f9;text-align:right">
      <td style="text-align:left;padding:6px;color:#94a3b8">${r.rank}</td>
      <td style="text-align:left;padding:6px;font-weight:600">${esc(r.nombre || r.clave)}</td>
      <td style="padding:6px">${fmtMon(r.ventas)}</td>
      <td style="padding:6px;font-weight:600">${r.acumPct.toFixed(1)} %</td>
      <td style="padding:6px">${fmtMon(r.utilidad_bruta)}</td>
      <td style="padding:6px;color:${margenCol(r.margen)};font-weight:700">${fmtPct(r.margen)}</td>
      <td style="padding:6px">${fmtNum(Math.round(r.kilos))}</td></tr>`).join('');
    const colaN = p.count - p.n80;
    const cola = colaN > 0 ? `<tr style="border-top:2px solid #cbd5e1;background:#f8fafc;text-align:right">
      <td style="text-align:left;padding:6px" colspan="2">+ ${fmtNum(colaN)} clientes en la cola</td>
      <td style="padding:6px" colspan="5">cierran el 100% de la exportación</td></tr>` : '';
    $('concTabla').innerHTML = head + '<tbody>' + rows + cola + '</tbody>';
  }

  async function cargar() {
    const anio = parseInt($('anio').value, 10);
    if (!anio) return KoguApi.toast('Indica el año.', 'error');
    $('refreshBtn').disabled = true;
    try {
      const res = await KoguApi.apiFetch(`${BASE}/dashboard/${anio}/export-analisis`);
      data = KoguApi.unwrapData(res);
      const hayExpo = data && data.margen_totales && data.margen_totales.exp_ventas;
      if (!hayExpo && !(data && data.fx_totales && data.fx_totales.usd_cobrado)) {
        $('margenCard').style.display = $('fxCard').style.display = $('concCard').style.display = 'none';
        showMsg('Sin datos de exportación / USD para ' + anio + '. Calcula los meses en "Costo de ventas / Utilidad".', 'warn');
        return;
      }
      $('msg').style.display = 'none';
      await renderMargen();
      await renderFx();
      await renderConc();
    } catch (e) {
      showMsg('❌ ' + e.message, 'error');
      KoguApi.toast(e.message, 'error');
    } finally { $('refreshBtn').disabled = false; }
  }

  $('refreshBtn').addEventListener('click', cargar);
  $('anio').addEventListener('change', cargar);
  KoguShell.subscribeEmpresaActivaChange(() => cargar());

  cargar();
});

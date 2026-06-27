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
  let paretoChart = null;
  let paretoDim = 'cliente';     // dimensión del Pareto doble
  let paretoData = null;         // { dim, items, totales } de rentabilidad
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
      <div><label class="muted" style="font-size:12px">Periodo (KPIs)</label>
        <select id="mes" class="input" style="width:150px"></select></div>
      <button class="btn primary" id="refreshBtn">Actualizar</button>
      <a class="btn ghost" href="/modules/cto/dashboard-operacion.html" style="white-space:nowrap;text-decoration:none">Ut. Operación →</a>
    </div>
  </div>
  <div id="msg" style="display:none;margin-top:14px;padding:12px;border-radius:6px;font-size:13px"></div>
</div>

<div id="kpis" class="grid-3" style="margin-top:16px;gap:12px;display:none"></div>

<div class="card" id="ppCard" style="margin-top:16px;display:none">
  <div class="row"><h3 style="margin:0">Avance del año vs Presupuesto (PP)</h3>
    <span class="muted" style="font-size:12px" id="ppSub">Real acumulado vs meta anual</span></div>
  <div id="ppBody" style="margin-top:14px;max-width:880px"></div>
</div>

<div class="card" id="chartCard" style="margin-top:16px;display:none">
  <div class="row"><h3 style="margin:0">Costo integrado + Utilidad bruta por mes</h3>
    <span class="muted" style="font-size:12px">Cada barra suma el total de ventas del mes</span></div>
  <div style="position:relative;height:340px;margin-top:12px;max-width:880px"><canvas id="chartMeses"></canvas></div>
</div>

<div class="card" id="paretoCard" style="margin-top:16px;display:none">
  <div class="row">
    <div><h3 style="margin:0">Pareto doble — venta vs utilidad</h3>
      <div class="muted" style="font-size:12px" id="paretoSub">Dónde está la venta… y dónde la utilidad</div></div>
    <div style="display:flex;gap:8px">
      <button class="tab" id="pTabCliente">Por cliente</button>
      <button class="tab" id="pTabProducto">Por producto</button>
    </div>
  </div>
  <div style="display:flex;flex-wrap:wrap;gap:16px;margin:10px 0 4px;font-size:12px;color:#64748b">
    <span style="display:flex;align-items:center;gap:5px"><span style="width:10px;height:10px;border-radius:2px;background:#185FA5"></span>Venta ($)</span>
    <span style="display:flex;align-items:center;gap:5px"><span style="width:14px;height:0;border-top:2px solid #0d9488"></span>% acum. venta</span>
    <span style="display:flex;align-items:center;gap:5px"><span style="width:14px;height:0;border-top:2px dashed #d97706"></span>% acum. utilidad</span>
  </div>
  <div style="position:relative;height:360px;margin-top:6px"><canvas id="chartPareto"></canvas></div>
  <div class="muted" style="font-size:11px;margin-top:8px" id="paretoNota"></div>
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
    const raw = $('mes').value;
    const t = data.totales;
    // Modo ACUMULADO (año): KPIs del YTD en lugar de un mes.
    if (raw === 'acum') {
      const nMeses = data.meses.length || 1;
      const costoPctA = t.total_ventas ? (t.costo_integrado / t.total_ventas) * 100 : 0;
      $('kpis').style.display = 'grid';
      $('kpis').innerHTML = [
        kpi(`Ventas · Acumulado ${data.anio}`, fmtMM(t.total_ventas), `${fmtMon(t.total_ventas)} · ${fmtNum(t.recuento_facturas)} fact.`, '#0d9488'),
        kpi('Costo integrado · Acum.', fmtMM(t.costo_integrado), `${costoPctA.toFixed(2)} % de ventas`, '#64748b'),
        kpi('Utilidad bruta · Acum.', fmtMM(t.utilidad_bruta), `${fmtPct(t.utilidad_bruta_pct)} ${chip(t.utilidad_bruta_pct)}`, '#8b5cf6'),
        kpi('Kilos · Facturas · Acum.', fmtKg(t.kilos), fmtNum(t.recuento_facturas) + ' facturas'),
        kpi('Promedio ventas / mes', fmtMM(t.total_ventas / nMeses), `${nMeses} ${nMeses === 1 ? 'mes' : 'meses'} con datos`, '#0d9488'),
        kpi('Promedio utilidad / mes', fmtMM(t.utilidad_bruta / nMeses), fmtPct(t.utilidad_bruta_pct) + ' del año', '#8b5cf6'),
      ].join('');
      return;
    }
    const mesSel = parseInt(raw, 10);
    const idx = data.meses.findIndex(x => x.mes === mesSel);
    const m = idx >= 0 ? data.meses[idx] : null;
    const prev = idx > 0 ? data.meses[idx - 1] : null;
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

  // Una barra de avance Real vs Meta (PP). falta = meta − real.
  function ppItem(label, real, meta, pctv, falta, fmt) {
    const p = pctv == null ? 0 : Number(pctv);
    const wpct = Math.max(0, Math.min(p, 1)) * 100;
    const over = p >= 1;
    const barCol = over ? '#16a34a' : p >= 0.8 ? '#0d9488' : p >= 0.5 ? '#d97706' : '#dc2626';
    return `<div style="margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
        <span style="font-weight:600">${label}</span>
        <span class="muted">${fmt(real)} de ${fmt(meta)} · <strong style="color:${barCol}">${fmtPct(pctv)}</strong></span>
      </div>
      <div style="height:10px;background:#e2e8f0;border-radius:999px;overflow:hidden">
        <div style="height:100%;width:${wpct}%;background:${barCol};border-radius:999px"></div>
      </div>
      <div class="muted" style="font-size:11px;margin-top:3px">${over ? 'Meta superada por ' + fmt(Math.abs(falta)) : 'Falta ' + fmt(falta) + ' para la meta anual'}</div>
    </div>`;
  }

  function pintarPP() {
    const pp = data && data.pp;
    if (!pp) { $('ppCard').style.display = 'none'; return; }
    const t = data.totales;
    $('ppCard').style.display = 'block';
    $('ppSub').textContent = `Real acumulado ${data.anio} vs meta anual · ${fmtNum(pp.sublineas)} sublíneas de PP`;
    $('ppBody').innerHTML =
      ppItem('Ventas', t.total_ventas, pp.ventas_pp, pp.avance_ventas, pp.falta_ventas, fmtMM)
      + ppItem('Utilidad bruta', t.utilidad_bruta, pp.utilidad_pp, pp.avance_utilidad, pp.falta_utilidad, fmtMM)
      + ppItem('Kilos', t.kilos, pp.kg_pp, pp.avance_kg, pp.falta_kg, fmtKg);
  }

  // Etiquetas de importe fijas sobre las barras (sin hover):
  //  - valor de cada segmento centrado (si cabe), en blanco;
  //  - total al final de la barra, en negrita oscuro.
  const valueLabels = {
    id: 'valueLabels',
    afterDatasetsDraw(ch) {
      const ctx = ch.ctx;
      const ds = ch.data.datasets;
      ctx.save();
      ctx.textBaseline = 'middle';
      // Segmentos
      ds.forEach((d, di) => {
        const meta = ch.getDatasetMeta(di);
        meta.data.forEach((bar, i) => {
          const val = Number(d.data[i]) || 0;
          if (val <= 0) return;
          const w = Math.abs(bar.x - bar.base);
          if (w < 60) return; // no cabe → no etiquetar el segmento
          ctx.font = 'bold 14px sans-serif';
          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'center';
          ctx.fillText('$' + (val / 1e6).toFixed(1) + 'M', (bar.x + bar.base) / 2, bar.y);
        });
      });
      // Total al final de cada barra
      const last = ch.getDatasetMeta(ds.length - 1);
      ch.data.labels.forEach((_lbl, i) => {
        const bar = last.data[i]; if (!bar) return;
        const total = ds.reduce((s, d) => s + (Number(d.data[i]) || 0), 0);
        ctx.font = 'bold 16px sans-serif';
        ctx.fillStyle = '#0f172a';
        ctx.textAlign = 'left';
        ctx.fillText('$' + (total / 1e6).toFixed(1) + ' M', bar.x + 8, bar.y);
      });
      ctx.restore();
    },
  };

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
        layout: { padding: { right: 86 } },
        plugins: {
          legend: { position: 'top', labels: { font: { size: 13 } } },
          tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${fmtMon(c.raw)}` } },
        },
        scales: {
          x: { stacked: true, ticks: { font: { size: 13 }, callback: (v) => '$' + (v / 1e6).toFixed(0) + 'M' } },
          y: { stacked: true, ticks: { font: { size: 13 } } },
        },
      },
      plugins: [valueLabels],
    });
  }

  // ---- Pareto doble (venta vs utilidad) --------------------------------
  function syncParetoTabs() {
    $('pTabCliente').className = 'tab' + (paretoDim === 'cliente' ? ' active' : '');
    $('pTabProducto').className = 'tab' + (paretoDim === 'producto' ? ' active' : '');
  }

  async function cargarPareto() {
    const anio = parseInt($('anio').value, 10);
    const mes = $('mes').value; // 'acum' | número
    try {
      const res = await KoguApi.apiFetch(`${BASE}/rentabilidad/${paretoDim}/${anio}?mes=${encodeURIComponent(mes)}`);
      paretoData = KoguApi.unwrapData(res);
    } catch (_e) { paretoData = null; }
    pintarPareto();
  }

  async function pintarPareto() {
    if (!paretoData || !paretoData.items || !paretoData.items.length) { $('paretoCard').style.display = 'none'; return; }
    $('paretoCard').style.display = 'block';
    try { await loadScript(CHART_SRC); } catch (_e) { return; }
    const Chart = window.Chart;
    if (paretoChart) { paretoChart.destroy(); paretoChart = null; }

    const arr = [...paretoData.items].filter(r => Number(r.ventas) > 0).sort((a, b) => b.ventas - a.ventas);
    const totV = arr.reduce((s, r) => s + Number(r.ventas), 0);
    const totU = arr.reduce((s, r) => s + Number(r.utilidad_bruta), 0);
    let aV = 0, aU = 0;
    const rows = arr.map(r => { aV += Number(r.ventas); aU += Number(r.utilidad_bruta); return { ...r, acumV: totV ? aV / totV * 100 : 0, acumU: totU ? aU / totU * 100 : 0 }; });
    const topN = 18;
    const top = rows.slice(0, topN);
    const etq = paretoDim === 'cliente' ? 'clientes' : 'productos';
    const labels = top.map(r => r.nombre ? (r.nombre.length > 20 ? r.nombre.slice(0, 19) + '…' : r.nombre) : r.clave);

    paretoChart = new Chart($('chartPareto'), {
      data: {
        labels,
        datasets: [
          { type: 'bar', label: 'Venta', data: top.map(r => Number(r.ventas)), backgroundColor: '#185FA5', yAxisID: 'y', order: 3, maxBarThickness: 30 },
          { type: 'line', label: '% acum. venta', data: top.map(r => r.acumV), borderColor: '#0d9488', backgroundColor: '#0d9488', yAxisID: 'y1', tension: 0.2, pointRadius: 2, borderWidth: 2, order: 1 },
          { type: 'line', label: '% acum. utilidad', data: top.map(r => r.acumU), borderColor: '#d97706', backgroundColor: '#d97706', borderDash: [5, 4], yAxisID: 'y1', tension: 0.2, pointRadius: 2, borderWidth: 2, order: 1 },
          { type: 'line', label: '80%', data: top.map(() => 80), borderColor: '#cbd5e1', borderDash: [3, 3], yAxisID: 'y1', pointRadius: 0, borderWidth: 1, order: 2 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: (items) => { const r = top[items[0].dataIndex]; return (r.nombre || r.clave) + ' · ' + r.clave; },
              label: (c) => c.dataset.type === 'bar' ? 'Venta: ' + fmtMon(c.raw) : c.dataset.label + ': ' + Number(c.raw).toFixed(1) + '%',
            },
          },
        },
        scales: {
          y: { position: 'left', beginAtZero: true, ticks: { callback: (v) => '$' + (v / 1e6).toFixed(1) + 'M', font: { size: 12 } }, grid: { display: false } },
          y1: { position: 'right', min: 0, max: 100, ticks: { callback: (v) => v + '%', font: { size: 12 } }, grid: { display: false } },
          x: { ticks: { autoSkip: false, maxRotation: 55, minRotation: 45, font: { size: 10 } }, grid: { display: false } },
        },
      },
    });

    // Insight automático: primer renglón donde la utilidad acumulada va por
    // debajo de la venta acumulada con brecha relevante = cuenta grande de bajo margen.
    const n80real = rows.findIndex(r => r.acumV >= 80) + 1 || rows.length;
    const margenTot = totV ? (totU / totV) * 100 : 0;
    let ancla = null, gap = 0;
    rows.slice(0, Math.max(n80real, 5)).forEach(r => { const g = r.acumV - r.acumU; if (g > gap) { gap = g; ancla = r; } });
    const per = ($('mes').value && $('mes').value !== 'acum') ? '' : '';
    let nota = `${n80real} ${etq} concentran el 80% de la venta · margen global ${margenTot.toFixed(1)} %.`;
    if (ancla && gap >= 1.5) nota += ` La línea de utilidad va por debajo de la de venta: ${ancla.nombre || ancla.clave} pesa en venta pero rinde menos margen — cuenta grande de bajo margen.`;
    $('paretoNota').textContent = nota;
    $('paretoSub').textContent = `${paretoDim === 'cliente' ? 'Clientes' : 'Productos'} · top ${Math.min(topN, rows.length)} de ${fmtNum(rows.length)}`;
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
    const prevRaw = sel.value;
    sel.innerHTML = '<option value="acum">Acumulado (año)</option>'
      + data.meses.map(m => `<option value="${m.mes}">${m.mes_nombre}</option>`).join('');
    if (prevRaw === 'acum') { sel.value = 'acum'; return; }
    const prev = parseInt(prevRaw, 10) || (now.getMonth() + 1);
    sel.value = data.meses.some(m => m.mes === prev)
      ? String(prev)
      : (data.meses.length ? String(data.meses[data.meses.length - 1].mes) : 'acum');
  }

  async function cargar() {
    const anio = parseInt($('anio').value, 10);
    if (!anio) return KoguApi.toast('Indica el año.', 'error');
    $('refreshBtn').disabled = true;
    try {
      const res = await KoguApi.apiFetch(`${BASE}/dashboard/${anio}`);
      data = KoguApi.unwrapData(res);
      if (!data || !data.meses || !data.meses.length) {
        $('kpis').style.display = $('chartCard').style.display = $('tablaCard').style.display = $('ppCard').style.display = $('paretoCard').style.display = 'none';
        showMsg('Sin datos calculados para ' + anio + '. Calcula algún mes en "Costo de ventas / Utilidad".', 'warn');
        return;
      }
      $('msg').style.display = 'none';
      $('chartCard').style.display = $('tablaCard').style.display = 'block';
      llenarSelectMes();
      pintarKpis(); pintarPP(); pintarTabla(); await pintarChart();
      await cargarPareto();
    } catch (e) {
      showMsg('❌ ' + e.message, 'error');
      KoguApi.toast(e.message, 'error');
    } finally { $('refreshBtn').disabled = false; }
  }

  function cambiarParetoDim(nuevo) { if (paretoDim === nuevo) return; paretoDim = nuevo; syncParetoTabs(); cargarPareto(); }

  $('refreshBtn').addEventListener('click', cargar);
  $('anio').addEventListener('change', cargar);
  $('mes').addEventListener('change', () => { pintarKpis(); cargarPareto(); });
  $('pTabCliente').addEventListener('click', () => cambiarParetoDim('cliente'));
  $('pTabProducto').addEventListener('click', () => cambiarParetoDim('producto'));
  syncParetoTabs();
  KoguShell.subscribeEmpresaActivaChange(() => cargar());

  cargar();
});

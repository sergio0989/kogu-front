// ============================================================
// dashboard-operacion.js — Costo (cto_): Tablero Dirección · Fase 2.
// Gasto de venta (comisión/sueldo/gasto/carga) + utilidad de operación.
// KPIs del mes, desglose por agente (apilado % y absoluto) y tabla.
// Solo lectura:
//   GET /protected/cto/dashboard/:anio                → KPIs del mes (totales)
//   GET /protected/cto/dashboard/:anio/:mes/agentes   → desglose por agente
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/cto/dashboard-operacion.html';
  const PERM = 'screen.costo';
  const BASE = '/protected/cto';
  const CHART_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js';

  // Colores por componente (estilo del tablero ABC).
  const COL = {
    costo: '#0d9488', comisiones: '#06b6d4', sueldo: '#eab308',
    carga: '#f97316', gasto: '#ec4899', utilidad: '#8b5cf6',
  };

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Dirección · Utilidad de Operación',
    description: 'Fase 2 — gasto de venta (comisión, sueldo, gasto, carga social) y utilidad de operación por agente.',
    requiredPermission: PERM,
  });
  if (!b) return;

  const $ = (id) => document.getElementById(id);
  const now = new Date();
  let chartPct = null, chartAbs = null;
  let mesData = null;     // mes en foco (de la serie anual)
  let agData = null;      // { anio, mes, agentes, totales }

  const fmtMon = (v) => '$' + (Number(v) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtMM = (v) => '$' + (Number(v) / 1e6).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' M';
  const fmtPct = (v) => v == null ? '—' : ((Number(v) || 0) * 100).toFixed(2) + ' %';
  const fmtNum = (v) => (Number(v) || 0).toLocaleString('es-MX');
  const fmtKg = (v) => (Number(v) || 0).toLocaleString('es-MX', { maximumFractionDigits: 0 }) + ' kg';
  const MESES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  let serieCache = null; // serie anual (para variación vs mes anterior)
  function chip(pctVal) {
    const p = Number(pctVal) || 0;
    const map = p >= 0.20 ? ['#dcfce7', '#166534', 'Correcto'] : p >= 0.10 ? ['#fef9c3', '#854d0e', 'Revisar'] : ['#fee2e2', '#991b1b', 'Alerta'];
    return `<span style="background:${map[0]};color:${map[1]};padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700">${map[2]}</span>`;
  }
  function varSpan(cur, prev, prevName, upGood = true) {
    if (prev == null || !isFinite(Number(prev)) || Number(prev) === 0) return '';
    const d = (Number(cur) - Number(prev)) / Number(prev);
    const up = d >= 0, good = upGood ? up : !up;
    return `<span style="color:${good ? '#166534' : '#991b1b'};font-weight:600;font-size:11px">${up ? '▲' : '▼'} ${Math.abs(d * 100).toFixed(1)}% vs ${prevName}</span>`;
  }
  const pctVentas = (parte, ventas) => ventas ? ((Number(parte) / Number(ventas)) * 100).toFixed(2) + ' % de ventas' : '';

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if ([...document.scripts].some(s => s.src === src)) return resolve();
      const s = document.createElement('script'); s.src = src; s.onload = resolve;
      s.onerror = () => reject(new Error('No se pudo cargar ' + src));
      document.head.appendChild(s);
    });
  }

  $('pageContent').innerHTML = `
<div class="card">
  <div class="row">
    <div><div class="eyebrow">Costo · Tableros</div><h2 style="margin:2px 0">Utilidad de Operación</h2>
      <div class="muted" style="font-size:12px">Gastos de venta por agente y utilidad resultante</div></div>
    <div style="display:flex;gap:8px;align-items:flex-end">
      <div><label class="muted" style="font-size:12px">Año</label><input type="number" id="anio" class="input" style="width:100px" value="${now.getFullYear()}"/></div>
      <div><label class="muted" style="font-size:12px">Mes</label>
        <select id="mes" class="input" style="width:130px"></select></div>
      <button class="btn primary" id="refreshBtn">Actualizar</button>
      <a class="btn ghost" href="/modules/cto/dashboard-bruta.html" style="white-space:nowrap;text-decoration:none">← Ut. Bruta</a>
    </div>
  </div>
  <div id="msg" style="display:none;margin-top:14px;padding:12px;border-radius:6px;font-size:13px"></div>
</div>

<div id="kpis" class="grid-3" style="margin-top:16px;gap:12px;display:none"></div>

<div class="card" id="chartPctCard" style="margin-top:16px;display:none">
  <div class="row"><h3 style="margin:0">Composición por agente (% de ventas)</h3>
    <span class="muted" style="font-size:12px">Costo + gasto de venta + utilidad = 100%</span></div>
  <div style="position:relative;height:420px;margin-top:12px;max-width:880px"><canvas id="canvasPct"></canvas></div>
</div>

<div class="card" id="chartAbsCard" style="margin-top:16px;display:none">
  <h3 style="margin:0 0 12px 0">Composición por agente (pesos)</h3>
  <div style="position:relative;height:420px;max-width:880px"><canvas id="canvasAbs"></canvas></div>
</div>

<div class="card" id="tablaCard" style="margin-top:16px;display:none">
  <h3 style="margin:0 0 10px 0">Detalle por agente</h3>
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
    const m = mesData;
    if (!m) { $('kpis').style.display = 'none'; return; }
    // Mes anterior (para variación), desde la serie anual.
    const meses = (serieCache && serieCache.meses) || [];
    const idx = meses.findIndex(x => x.mes === m.mes);
    const prev = idx > 0 ? meses[idx - 1] : null;
    const pn = prev ? prev.mes_nombre : '';
    const v = m.total_ventas;
    $('kpis').style.display = 'grid';
    $('kpis').innerHTML = [
      kpi(`Utilidad de operación · ${MESES[m.mes]}`, fmtMM(m.utilidad_operacion),
        `${fmtPct(m.utilidad_operacion_pct)} ${chip(m.utilidad_operacion_pct)} ${varSpan(m.utilidad_operacion, prev && prev.utilidad_operacion, pn)}`, COL.utilidad),
      kpi('Gastos de venta', fmtMM(m.gastos_venta), `comisión + sueldo + gasto + carga · ${pctVentas(m.gastos_venta, v)}`, COL.gasto),
      kpi('Comisiones', fmtMon(m.comisiones), pctVentas(m.comisiones, v), COL.comisiones),
      kpi('Sueldo', fmtMon(m.sueldo), pctVentas(m.sueldo, v), COL.sueldo),
      kpi('Gastos', fmtMon(m.gasto), pctVentas(m.gasto, v), COL.gasto),
      kpi('Carga social', fmtMon(m.carga), pctVentas(m.carga, v), COL.carga),
    ].join('');
  }

  function topAgentes() {
    // Agentes con ventas, ordenados; máx 15 para legibilidad.
    return (agData.agentes || []).filter(a => a.total_ventas !== 0).slice(0, 15);
  }

  async function pintarCharts() {
    try { await loadScript(CHART_SRC); } catch (_e) { return; }
    const Chart = window.Chart;
    const ags = topAgentes();
    const labels = ags.map(a => a.agente_nombre);
    const comp = [
      ['Costo integrado', 'costo_integrado', COL.costo],
      ['Comisiones', 'comisiones', COL.comisiones],
      ['Sueldo', 'sueldo', COL.sueldo],
      ['Carga social', 'carga', COL.carga],
      ['Gastos', 'gasto', COL.gasto],
      ['Utilidad operación', 'utilidad_operacion', COL.utilidad],
    ];

    // ── Gráfica % (normalizada a ventas) ──
    if (chartPct) chartPct.destroy();
    chartPct = new Chart($('canvasPct'), {
      type: 'bar',
      data: {
        labels,
        datasets: comp.map(([lbl, key, color]) => ({
          label: lbl, backgroundColor: color, stack: 'p',
          data: ags.map(a => a.total_ventas ? (a[key] / a.total_ventas) * 100 : 0),
        })),
      },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top' },
          tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${(Number(c.raw) || 0).toFixed(1)}%` } },
        },
        scales: { x: { stacked: true, max: 100, ticks: { callback: (v) => v + '%' } }, y: { stacked: true } },
      },
    });

    // ── Gráfica absoluta (pesos) ──
    if (chartAbs) chartAbs.destroy();
    chartAbs = new Chart($('canvasAbs'), {
      type: 'bar',
      data: {
        labels,
        datasets: comp.map(([lbl, key, color]) => ({
          label: lbl, backgroundColor: color, stack: 'a',
          data: ags.map(a => a[key]),
        })),
      },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top' },
          tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${fmtMon(c.raw)}` } },
        },
        scales: { x: { stacked: true, ticks: { callback: (v) => '$' + (v / 1e6).toFixed(1) + 'M' } }, y: { stacked: true } },
      },
    });
  }

  function pintarTabla() {
    const head = `<thead><tr style="text-align:right;border-bottom:2px solid #e2e8f0">
      <th style="text-align:left;padding:6px">Agente</th><th style="padding:6px">Ventas</th>
      <th style="padding:6px">Costo int.</th><th style="padding:6px">Comis.</th><th style="padding:6px">Sueldo</th>
      <th style="padding:6px">Gasto</th><th style="padding:6px">Carga</th><th style="padding:6px">Gasto venta</th>
      <th style="padding:6px">Util. oper.</th><th style="padding:6px">% Oper.</th></tr></thead>`;
    const rows = (agData.agentes || []).map(a => `<tr style="text-align:right;border-bottom:1px solid #f1f5f9">
      <td style="text-align:left;padding:6px;font-weight:600">${KoguUi.escapeHtml(a.agente_nombre)}</td>
      <td style="padding:6px">${fmtMon(a.total_ventas)}</td>
      <td style="padding:6px">${fmtMon(a.costo_integrado)}</td>
      <td style="padding:6px">${fmtMon(a.comisiones)}</td>
      <td style="padding:6px">${fmtMon(a.sueldo)}</td>
      <td style="padding:6px">${fmtMon(a.gasto)}</td>
      <td style="padding:6px">${fmtMon(a.carga)}</td>
      <td style="padding:6px">${fmtMon(a.gastos_venta)}</td>
      <td style="padding:6px;font-weight:600">${fmtMon(a.utilidad_operacion)}</td>
      <td style="padding:6px">${fmtPct(a.utilidad_operacion_pct)}</td></tr>`).join('');
    const t = agData.totales;
    const total = `<tr style="text-align:right;border-top:2px solid #cbd5e1;font-weight:700;background:#f8fafc">
      <td style="text-align:left;padding:6px">TOTAL</td>
      <td style="padding:6px">${fmtMon(t.total_ventas)}</td>
      <td style="padding:6px">${fmtMon(t.costo_integrado)}</td>
      <td style="padding:6px">${fmtMon(t.comisiones)}</td>
      <td style="padding:6px">${fmtMon(t.sueldo)}</td>
      <td style="padding:6px">${fmtMon(t.gasto)}</td>
      <td style="padding:6px">${fmtMon(t.carga)}</td>
      <td style="padding:6px">${fmtMon(t.gastos_venta)}</td>
      <td style="padding:6px">${fmtMon(t.utilidad_operacion)}</td>
      <td style="padding:6px">${fmtPct(t.utilidad_operacion_pct)}</td></tr>`;
    $('tabla').innerHTML = head + '<tbody>' + rows + total + '</tbody>';
  }

  async function llenarSelectMesYcargar() {
    // Pide la serie anual una vez para conocer los meses con datos y los KPIs.
    const anio = parseInt($('anio').value, 10);
    const res = await KoguApi.apiFetch(`${BASE}/dashboard/${anio}`);
    const serie = KoguApi.unwrapData(res);
    const sel = $('mes');
    if (!serie || !serie.meses || !serie.meses.length) {
      sel.innerHTML = ''; return null;
    }
    const prev = parseInt(sel.value, 10) || (now.getMonth() + 1);
    sel.innerHTML = serie.meses.map(m => `<option value="${m.mes}">${m.mes_nombre}</option>`).join('');
    sel.value = serie.meses.some(m => m.mes === prev) ? prev : serie.meses[serie.meses.length - 1].mes;
    return serie;
  }

  async function cargarMes(serie) {
    const anio = parseInt($('anio').value, 10);
    const mes = parseInt($('mes').value, 10);
    mesData = (serie || {}).meses ? serie.meses.find(m => m.mes === mes) : null;
    const res = await KoguApi.apiFetch(`${BASE}/dashboard/${anio}/${mes}/agentes`);
    agData = KoguApi.unwrapData(res);
    $('kpis').style.display = 'grid';
    $('chartPctCard').style.display = $('chartAbsCard').style.display = $('tablaCard').style.display = 'block';
    pintarKpis(); pintarTabla(); await pintarCharts();
  }

  async function cargar(reload = true) {
    const anio = parseInt($('anio').value, 10);
    if (!anio) return KoguApi.toast('Indica el año.', 'error');
    $('refreshBtn').disabled = true;
    try {
      if (reload) serieCache = await llenarSelectMesYcargar();
      if (!serieCache) {
        $('kpis').style.display = $('chartPctCard').style.display = $('chartAbsCard').style.display = $('tablaCard').style.display = 'none';
        showMsg('Sin datos calculados para ' + anio + '. Calcula algún mes en "Costo de ventas / Utilidad".', 'warn');
        return;
      }
      $('msg').style.display = 'none';
      await cargarMes(serieCache);
    } catch (e) {
      showMsg('❌ ' + e.message, 'error');
      KoguApi.toast(e.message, 'error');
    } finally { $('refreshBtn').disabled = false; }
  }

  $('refreshBtn').addEventListener('click', () => cargar(true));
  $('anio').addEventListener('change', () => cargar(true));
  $('mes').addEventListener('change', () => cargar(false));
  KoguShell.subscribeEmpresaActivaChange(() => cargar(true));

  cargar(true);
});

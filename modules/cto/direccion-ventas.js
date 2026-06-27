// ============================================================
// direccion-ventas.js — Costo (cto_): Dirección · Ventas (80/20).
// Pareto SIMPLE de ventas por cliente / producto: ¿de cuántas cuentas
// (o productos) depende la facturación? Concentración + cola larga.
// Solo lectura: GET /protected/cto/rentabilidad/:dim/:anio(?mes=).
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/cto/direccion-ventas.html';
  const PERM = 'screen.costo';
  const BASE = '/protected/cto';
  const CHART_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js';

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Dirección · Ventas',
    description: 'Análisis 80/20 — de cuántos clientes y productos depende la facturación. Concentración y cola larga.',
    requiredPermission: PERM,
  });
  if (!b) return;

  const $ = (id) => document.getElementById(id);
  const now = new Date();
  const MESES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

  const fmtMon = (v) => '$' + (Number(v) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtMM = (v) => '$' + (Number(v) / 1e6).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' M';
  const fmtPct = (v) => v == null ? '—' : (Number(v) || 0).toFixed(1) + ' %';
  const fmtNum = (v) => (Number(v) || 0).toLocaleString('es-MX');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

  let dim = 'cliente';
  let data = null;   // { dim, anio, mes, items, totales }
  let chart = null;
  let topN = 20;     // cuántas barras pinta el Pareto

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
    <div><div class="eyebrow">Costo · Dirección</div><h2 style="margin:2px 0">Ventas · 80/20</h2>
      <div class="muted" style="font-size:12px">De cuántas cuentas y productos depende la facturación</div></div>
    <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap">
      <div><label class="muted" style="font-size:12px;display:block">Año</label><input type="number" id="anio" class="input" style="width:100px" value="${now.getFullYear()}"/></div>
      <div><label class="muted" style="font-size:12px;display:block">Periodo</label>
        <select id="mes" class="input" style="width:160px">
          <option value="acum">Acumulado (año)</option>
          ${MESES.slice(1).map((n, i) => `<option value="${i + 1}">${n}</option>`).join('')}
        </select></div>
      <button class="btn primary" id="refreshBtn">Actualizar</button>
      <a class="btn ghost" href="/modules/cto/dashboard-bruta.html" style="white-space:nowrap;text-decoration:none">Utilidad Bruta →</a>
    </div>
  </div>

  <div style="display:flex;gap:8px;margin-top:14px">
    <button class="tab" id="tabCliente">Por cliente</button>
    <button class="tab" id="tabProducto">Por producto</button>
  </div>
  <div id="msg" style="display:none;margin-top:14px;padding:12px;border-radius:6px;font-size:13px"></div>
</div>

<div id="kpis" class="grid-3" style="margin-top:16px;gap:12px;display:none"></div>

<div class="card" id="chartCard" style="margin-top:16px;display:none">
  <div class="row"><h3 id="chartTitulo" style="margin:0">Pareto de ventas</h3>
    <span class="muted" style="font-size:12px" id="chartSub"></span></div>
  <div style="position:relative;height:380px;margin-top:12px"><canvas id="chartPareto"></canvas></div>
  <div class="muted" style="font-size:11px;margin-top:8px">Barras = venta del periodo (mayor a menor). Línea = % acumulado. La marca al 80% señala el grupo “vital”.</div>
</div>

<div class="card" id="tablaCard" style="margin-top:16px;display:none">
  <div class="row"><h3 id="tablaTitulo" style="margin:0">Grupo vital (hasta 80%)</h3>
    <span class="muted" style="font-size:12px" id="tablaSub"></span></div>
  <div style="overflow-x:auto;margin-top:10px"><table class="table" id="tabla" style="width:100%;font-size:13px;font-variant-numeric:tabular-nums"></table></div>
</div>`;

  function showMsg(html, tipo) {
    const m = $('msg');
    const bg = tipo === 'error' ? '#fee2e2' : tipo === 'warn' ? '#fef9c3' : '#dcfce7';
    const co = tipo === 'error' ? '#991b1b' : tipo === 'warn' ? '#854d0e' : '#166534';
    m.style.cssText = `display:block;margin-top:14px;padding:12px;border-radius:6px;font-size:13px;background:${bg};color:${co}`;
    m.innerHTML = html;
  }

  function syncTabs() {
    $('tabCliente').className = 'tab' + (dim === 'cliente' ? ' active' : '');
    $('tabProducto').className = 'tab' + (dim === 'producto' ? ' active' : '');
  }

  function kpi(label, val, sub, accent) {
    return `<div class="card" style="padding:16px;${accent ? 'border-top:3px solid ' + accent : ''}">
      <div class="muted" style="font-size:12px">${label}</div>
      <div style="font-size:22px;font-weight:700;margin-top:4px">${val}</div>
      ${sub ? `<div class="muted" style="font-size:12px;margin-top:2px">${sub}</div>` : ''}</div>`;
  }

  // Ordena por venta desc, acumula, calcula cuántos llegan a cada umbral.
  function pareto() {
    const arr = [...data.items].filter(r => Number(r.ventas) > 0).sort((a, b) => b.ventas - a.ventas);
    const total = arr.reduce((s, r) => s + Number(r.ventas), 0);
    let acum = 0;
    const rows = arr.map((r, i) => {
      acum += Number(r.ventas);
      return { ...r, rank: i + 1, acum, acumPct: total ? (acum / total) * 100 : 0, pct: total ? (Number(r.ventas) / total) * 100 : 0 };
    });
    const cuenta = (umbral) => { const f = rows.find(r => r.acumPct >= umbral); return f ? f.rank : rows.length; };
    const top10 = rows.slice(0, 10).reduce((s, r) => s + Number(r.ventas), 0);
    return { rows, total, n80: cuenta(80), n50: cuenta(50), n95: cuenta(95), top10pct: total ? (top10 / total) * 100 : 0, count: rows.length };
  }

  function pintarKpis(p) {
    const etq = dim === 'cliente' ? 'clientes' : 'productos';
    const pctVital = p.count ? (p.n80 / p.count) * 100 : 0;
    const colaN = p.count - p.n80;
    const acumVital = p.rows[p.n80 - 1] ? p.rows[p.n80 - 1].acumPct : 80;
    const colaPct = Math.max(0, 100 - acumVital);
    $('kpis').style.display = 'grid';
    $('kpis').innerHTML = [
      kpi(`80% de la venta`, `${fmtNum(p.n80)} ${etq}`, `de ${fmtNum(p.count)} (${pctVital.toFixed(0)}%) · "los vitales"`, '#0d9488'),
      kpi('Top 10 concentra', fmtPct(p.top10pct), `de la venta total del periodo`, '#0ea5e9'),
      kpi('Cola larga', `${fmtNum(colaN)} ${etq}`, `aportan solo el ${colaPct.toFixed(0)}% restante`, '#94a3b8'),
    ].join('');
  }

  async function pintarChart(p) {
    try { await loadScript(CHART_SRC); } catch (_e) { return; }
    const Chart = window.Chart;
    if (chart) { chart.destroy(); chart = null; }
    const top = p.rows.slice(0, topN);
    const labels = top.map(r => r.nombre ? (r.nombre.length > 22 ? r.nombre.slice(0, 21) + '…' : r.nombre) : r.clave);
    const ventas = top.map(r => Number(r.ventas));
    const acumPct = top.map(r => r.acumPct);
    const linea80 = top.map(() => 80);
    chart = new Chart($('chartPareto'), {
      data: {
        labels,
        datasets: [
          { type: 'bar', label: 'Venta', data: ventas, backgroundColor: '#185FA5', yAxisID: 'y', order: 3, maxBarThickness: 34 },
          { type: 'line', label: '% acumulado', data: acumPct, borderColor: '#0d9488', backgroundColor: '#0d9488', yAxisID: 'y1', tension: 0.2, pointRadius: 2, borderWidth: 2, order: 1 },
          { type: 'line', label: '80%', data: linea80, borderColor: '#94a3b8', borderDash: [4, 4], yAxisID: 'y1', pointRadius: 0, borderWidth: 1, order: 2 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { font: { size: 12 }, filter: (it) => it.text !== '80%' } },
          tooltip: {
            callbacks: {
              title: (items) => { const i = items[0].dataIndex; const r = top[i]; return (r.nombre || r.clave) + ' · ' + r.clave; },
              label: (c) => c.dataset.type === 'bar'
                ? 'Venta: ' + fmtMon(c.raw)
                : c.dataset.label + ': ' + (Number(c.raw)).toFixed(1) + '%',
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
  }

  function pintarTabla(p) {
    const etq = dim === 'cliente' ? 'Cliente' : 'Producto';
    const vital = p.rows.slice(0, p.n80);
    const head = `<thead><tr style="border-bottom:2px solid #e2e8f0;text-align:right">
      <th style="text-align:left;padding:6px">#</th>
      <th style="text-align:left;padding:6px">Clave</th>
      <th style="text-align:left;padding:6px">${etq}</th>
      <th style="padding:6px">Venta</th><th style="padding:6px">% del total</th>
      <th style="padding:6px">% acumulado</th></tr></thead>`;
    const rows = vital.map(r => `<tr style="border-bottom:1px solid #f1f5f9;text-align:right">
      <td style="text-align:left;padding:6px;color:#94a3b8">${r.rank}</td>
      <td style="text-align:left;padding:6px">${esc(r.clave)}</td>
      <td style="text-align:left;padding:6px;font-weight:600">${esc(r.nombre || '—')}</td>
      <td style="padding:6px">${fmtMon(r.ventas)}</td>
      <td style="padding:6px">${r.pct.toFixed(1)} %</td>
      <td style="padding:6px;font-weight:600">${r.acumPct.toFixed(1)} %</td></tr>`).join('');
    const colaN = p.count - p.n80;
    const colaVentas = p.rows.slice(p.n80).reduce((s, r) => s + Number(r.ventas), 0);
    const cola = colaN > 0 ? `<tr style="border-top:2px solid #cbd5e1;background:#f8fafc;text-align:right">
      <td style="text-align:left;padding:6px" colspan="3">+ ${fmtNum(colaN)} ${dim === 'cliente' ? 'clientes' : 'productos'} en la cola larga</td>
      <td style="padding:6px">${fmtMon(colaVentas)}</td>
      <td style="padding:6px">${p.total ? (colaVentas / p.total * 100).toFixed(1) : 0} %</td>
      <td style="padding:6px">100.0 %</td></tr>` : '';
    $('tabla').innerHTML = head + '<tbody>' + rows + cola + '</tbody>';
    const per = data.mes && data.mes !== 'acum' ? MESES[data.mes] : `Acumulado ${data.anio}`;
    $('tablaTitulo').textContent = `Grupo vital — ${p.n80} ${dim === 'cliente' ? 'clientes' : 'productos'} = 80% de la venta`;
    $('tablaSub').textContent = `${per} · ${fmtMM(p.total)} en total`;
  }

  async function cargar() {
    const anio = parseInt($('anio').value, 10);
    if (!anio) return KoguApi.toast('Indica el año.', 'error');
    const mes = $('mes').value;
    $('refreshBtn').disabled = true;
    try {
      const res = await KoguApi.apiFetch(`${BASE}/rentabilidad/${dim}/${anio}?mes=${encodeURIComponent(mes)}`);
      data = KoguApi.unwrapData(res);
      if (!data || !data.items || !data.items.length) {
        $('kpis').style.display = $('chartCard').style.display = $('tablaCard').style.display = 'none';
        showMsg('Sin datos para el periodo. Calcula el mes en "Costo de ventas / Utilidad".', 'warn');
        return;
      }
      $('msg').style.display = 'none';
      $('chartCard').style.display = $('tablaCard').style.display = 'block';
      const p = pareto();
      const etq = dim === 'cliente' ? 'clientes' : 'productos';
      $('chartTitulo').textContent = `Pareto de ventas por ${dim}`;
      $('chartSub').textContent = `Top ${Math.min(topN, p.count)} de ${fmtNum(p.count)} ${etq}`;
      pintarKpis(p); await pintarChart(p); pintarTabla(p);
    } catch (e) {
      showMsg('❌ ' + e.message, 'error');
      KoguApi.toast(e.message, 'error');
    } finally { $('refreshBtn').disabled = false; }
  }

  function cambiarDim(nuevo) { if (dim === nuevo) return; dim = nuevo; syncTabs(); cargar(); }

  $('tabCliente').addEventListener('click', () => cambiarDim('cliente'));
  $('tabProducto').addEventListener('click', () => cambiarDim('producto'));
  $('refreshBtn').addEventListener('click', cargar);
  $('anio').addEventListener('change', cargar);
  $('mes').addEventListener('change', cargar);
  KoguShell.subscribeEmpresaActivaChange(() => cargar());

  syncTabs();
  cargar();
});

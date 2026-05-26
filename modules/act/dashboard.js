// ============================================================
// dashboard.js
// Pantalla: Dashboard de Activos (KPIs + alertas). Solo lectura.
// Endpoints: GET /protected/act/dashboard/kpis, /dashboard/alertas
// Pinta todo con esas dos llamadas; sin cálculos sobre filas crudas.
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const b = await KoguShell.initShell({
    currentPage:        '/modules/act/dashboard.html',
    title:              'Dashboard de Activos',
    description:        'KPIs, gráficas y alertas del módulo de Activos.',
    requiredPermission: 'act.dashboard.read',
  });
  if (!b) return;

  const esc = KoguUi.escapeHtml;
  const $ = id => document.getElementById(id);

  const ESTADO_LABEL = { activo: 'Activos', en_mantenimiento: 'En mantenimiento', en_reparacion: 'En reparación', en_resguardo: 'En resguardo', baja: 'Baja' };
  const ESTADO_COLOR = { activo: '#16a34a', en_mantenimiento: '#ca8a04', en_reparacion: '#ea580c', en_resguardo: '#7c3aed', baja: '#dc2626' };
  const SEV_COLOR = { alta: '#dc2626', media: '#ca8a04', info: '#2563eb' };
  const CHART_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js';

  let categorias = [], ubicaciones = [];
  let charts = { cat: null, ubi: null, ord: null };

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if ([...document.scripts].some(s => s.src === src)) return resolve();
      const s = document.createElement('script'); s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('No se pudo cargar ' + src));
      document.head.appendChild(s);
    });
  }

  document.getElementById('pageContent').innerHTML = `
<div class="card">
  <div class="row">
    <div><div class="eyebrow">Activos</div><h2>Dashboard</h2></div>
    <div><button class="btn" id="refreshBtn">Actualizar</button></div>
  </div>
  <div class="grid-3" style="margin-top:16px">
    <div><div class="label-text">Desde</div><input class="input" id="fDesde" type="date"/></div>
    <div><div class="label-text">Hasta</div><input class="input" id="fHasta" type="date"/></div>
    <div><div class="label-text">Categoría</div><select class="select" id="fCategoria"><option value="">Todas</option></select></div>
  </div>
  <div class="grid-2" style="margin-top:10px">
    <div><div class="label-text">Ubicación</div><select class="select" id="fUbicacion"><option value="">Todas</option></select></div>
    <div style="display:flex;align-items:flex-end"><button class="btn primary" id="aplicarBtn">Aplicar filtros</button></div>
  </div>
</div>

<div id="kpiCards" class="grid-3" style="margin-top:16px"></div>

<div class="card" style="margin-top:16px">
  <div class="eyebrow">Desglose por estado</div>
  <div id="estadoChips" class="pillbar" style="margin-top:10px"></div>
</div>

<div class="split" style="margin-top:16px">
  <div class="card"><div class="eyebrow">Activos por categoría</div><div style="margin-top:10px"><canvas id="chartCat" height="220"></canvas></div></div>
  <div class="card"><div class="eyebrow">Órdenes abiertas por tipo</div><div style="margin-top:10px"><canvas id="chartOrd" height="220"></canvas></div></div>
</div>
<div class="card" style="margin-top:16px"><div class="eyebrow">Activos por ubicación</div><div style="margin-top:10px"><canvas id="chartUbi" height="200"></canvas></div></div>

<div class="card" style="margin-top:16px">
  <div class="row"><div><div class="eyebrow">Alertas</div><h3 style="margin:4px 0" id="alertTitle">Feed de alertas</h3></div></div>
  <div id="alertFeed" class="stack" style="margin-top:10px"><div class="empty">Cargando…</div></div>
</div>`;

  function currentFilters() {
    return { categoria_id: $('fCategoria').value, ubicacion_id: $('fUbicacion').value, desde: $('fDesde').value, hasta: $('fHasta').value };
  }

  // ── KPIs ────────────────────────────────────────────────────────────────────
  function kpiCard(label, value, hint) {
    return `<div class="kpi"><div class="label">${esc(label)}</div><div class="value">${esc(String(value))}</div><div class="hint">${esc(hint || '')}</div></div>`;
  }

  async function loadKpis() {
    let data;
    try {
      const res = await KoguApi.apiFetch('/protected/act/dashboard/kpis?' + KoguUi.queryParams(currentFilters()));
      data = KoguApi.unwrapData(res);
    } catch (_err) { return; }

    const a = data.activos || {};
    const o = data.ordenes || {};
    const mant = data.mantenimiento || {};
    const porEstado = a.por_estado || [];
    const ordenesAbiertas = (o.abiertas_por_tipo || []).reduce((s, r) => s + Number(r.total || 0), 0);

    $('kpiCards').innerHTML =
      kpiCard('Total de activos', KoguUi.int(a.total || 0), 'Incluye dados de baja') +
      kpiCard('Órdenes abiertas', KoguUi.int(ordenesAbiertas), 'Mantenimiento + reparación') +
      kpiCard('Preventivos vencidos', KoguUi.int(mant.planes_preventivos_vencidos || 0), 'Planes con próxima fecha pasada') +
      kpiCard('Sin asignación', KoguUi.int(a.sin_asignacion || 0), 'Activos sin custodio vigente') +
      kpiCard('Costo de mantenimiento', KoguUi.fmtMoney(o.costo_total_periodo || 0), 'Órdenes cerradas en el periodo') +
      kpiCard('Valor registrado', KoguUi.fmtMoney(a.valor_total || 0), 'Suma de costo de adquisición');

    // Chips por estado
    $('estadoChips').innerHTML = ['activo', 'en_mantenimiento', 'en_reparacion', 'en_resguardo', 'baja'].map(e => {
      const found = porEstado.find(x => x.estado === e);
      const n = found ? found.total : 0;
      const c = ESTADO_COLOR[e];
      return `<span class="chip" style="background:${c}1a;color:${c};border:1px solid ${c}55">${esc(ESTADO_LABEL[e])}: <strong>${KoguUi.int(n)}</strong></span>`;
    }).join('');

    await drawCharts(a, o);
  }

  async function drawCharts(a, o) {
    try { await loadScript(CHART_SRC); } catch (_e) { return; }
    const Chart = window.Chart;
    Object.values(charts).forEach(c => { if (c) c.destroy(); });

    const cat = a.por_categoria || [];
    charts.cat = new Chart($('chartCat'), {
      type: 'bar',
      data: { labels: cat.map(x => x.categoria_nombre || x.categoria_clave || '—'), datasets: [{ label: 'Activos', data: cat.map(x => x.total), backgroundColor: '#2563eb' }] },
      options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } },
    });

    const ubi = a.por_ubicacion || [];
    charts.ubi = new Chart($('chartUbi'), {
      type: 'bar',
      data: { labels: ubi.map(x => x.ubicacion_nombre || x.ubicacion_clave || 'Sin ubicación'), datasets: [{ label: 'Activos', data: ubi.map(x => x.total), backgroundColor: '#0e7490' }] },
      options: { indexAxis: 'y', responsive: true, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { precision: 0 } } } },
    });

    const ord = o.abiertas_por_tipo || [];
    charts.ord = new Chart($('chartOrd'), {
      type: 'doughnut',
      data: { labels: ord.map(x => x.tipo), datasets: [{ data: ord.map(x => x.total), backgroundColor: ['#2563eb', '#ea580c', '#7c3aed', '#16a34a'] }] },
      options: { responsive: true, plugins: { legend: { position: 'bottom' } } },
    });
  }

  // ── Alertas ─────────────────────────────────────────────────────────────────
  function alertHref(al) {
    if (al.orden_id) return '/modules/act/orden-detalle.html?id=' + encodeURIComponent(al.orden_id);
    if (al.activo_id) return '/modules/act/activo-detalle.html?id=' + encodeURIComponent(al.activo_id);
    return null;
  }

  async function loadAlertas() {
    let data;
    try { data = KoguApi.unwrapData(await KoguApi.apiFetch('/protected/act/dashboard/alertas')); }
    catch (_err) { return; }
    const alertas = data.alertas || [];
    const ps = data.por_severidad || {};
    $('alertTitle').textContent = `Feed de alertas — ${data.total || 0} (alta ${ps.alta || 0} · media ${ps.media || 0} · info ${ps.info || 0})`;
    if (!alertas.length) { $('alertFeed').innerHTML = `<div class="empty">Sin alertas. 🎉</div>`; return; }
    $('alertFeed').innerHTML = alertas.map(al => {
      const c = SEV_COLOR[al.severidad] || '#64748b';
      const href = alertHref(al);
      const inner = `<div style="display:flex;justify-content:space-between;gap:10px;align-items:center">
        <div><span class="chip" style="background:${c}1a;color:${c};border:1px solid ${c}55">${esc(al.severidad)}</span>
          <span style="margin-left:8px">${esc(al.mensaje)}</span></div>
        <span class="muted" style="font-size:12px;white-space:nowrap">${al.fecha_referencia ? KoguUi.fmtDate(al.fecha_referencia) : ''}</span></div>`;
      return `<div class="card" style="padding:12px;border-left:4px solid ${c}">${href ? `<a href="${href}" style="text-decoration:none;color:inherit">${inner}</a>` : inner}</div>`;
    }).join('');
  }

  async function loadCatalogos() {
    try {
      const [cat, ubi] = await Promise.all([
        KoguApi.apiFetch('/protected/act/categorias').catch(() => ({})),
        KoguApi.apiFetch('/protected/act/ubicaciones').catch(() => ({})),
      ]);
      categorias = KoguApi.unwrapRows(cat, 'rows') || [];
      ubicaciones = KoguApi.unwrapRows(ubi, 'rows') || [];
      $('fCategoria').innerHTML = '<option value="">Todas</option>' + categorias.map(c => `<option value="${c.categoria_id}">${esc(c.clave)} — ${esc(c.nombre)}</option>`).join('');
      $('fUbicacion').innerHTML = '<option value="">Todas</option>' + ubicaciones.map(u => `<option value="${u.ubicacion_id}">${esc(u.clave)} — ${esc(u.nombre)}</option>`).join('');
    } catch (_e) {}
  }

  async function reloadAll() { await Promise.all([loadKpis(), loadAlertas()]); }

  // ── Bindings ────────────────────────────────────────────────────────────────
  $('aplicarBtn').onclick = loadKpis; // las alertas no dependen de filtros
  $('refreshBtn').onclick = reloadAll;
  KoguShell.subscribeEmpresaActivaChange(async () => { await loadCatalogos(); await reloadAll(); });

  await loadCatalogos();
  await reloadAll();
});

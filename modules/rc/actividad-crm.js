// ============================================================
// actividad-crm.js
// Radar Comercial (rc_) — Actividad CRM (I+D).
// Carga de los exports del CRM (Proyectos + Eventos) y dashboard de
// seguimiento comercial: productividad, cobertura, calidad/ritmo y
// vínculo con ventas. Opera siempre sobre la empresa activa.
// Lectura: rc.crm_actividades.read · Carga: rc.crm_actividades.import
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/rc/actividad-crm.html';
  const BASE = '/protected/rc';
  const PERM_READ = 'rc.crm_actividades.read';
  const PERM_IMPORT = 'rc.crm_actividades.import';
  const CHART_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js';
  const LS_SEL = 'kogu.rc.crm.usuarios'; // preferencia de filtro (no sensible)

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Actividad CRM (I+D)',
    description: 'Seguimiento comercial del CRM de Innovación y Ventas: productividad, cobertura y vínculo con ventas. Radar Comercial.',
    requiredPermission: PERM_READ,
  });
  if (!b) return;
  const puedeImportar = KoguShell.hasPerm(b, PERM_IMPORT);

  // ── Estado ──────────────────────────────────────────────
  let usuarios = [];        // [{u, eventos, perfil}]
  let seleccion = null;     // Set<string> | null (null = todos)
  let anioSel = null;       // año seleccionado (null → el más reciente)
  let mesSel = null;        // mes 1..12 (null → acumulado del año)
  let selectoresListos = false;
  let charts = [];
  const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const CO = { primary: '#0891b2', cyan: '#06b6d4', teal: '#14b8a6', green: '#16a34a', amber: '#d97706', red: '#dc2626', slate: '#64748b', indigo: '#6366f1' };

  // ── Helpers ─────────────────────────────────────────────
  const esc = KoguUi.escapeHtml;
  const $ = (id) => document.getElementById(id);
  const nf0 = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 });
  const moneyC = (n) => '$' + new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(n || 0));
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (window.Chart) return resolve();
      const s = document.createElement('script'); s.src = src; s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  function destroyCharts() { charts.forEach((c) => { try { c.destroy(); } catch (_) {} }); charts = []; }
  function loadSeleccion() { try { const a = JSON.parse(localStorage.getItem(LS_SEL) || 'null'); return Array.isArray(a) ? new Set(a) : null; } catch (_) { return null; } }
  function saveSeleccion() { try { localStorage.setItem(LS_SEL, seleccion ? JSON.stringify([...seleccion]) : 'null'); } catch (_) {} }

  // ── Layout ──────────────────────────────────────────────
  const c = $('pageContent');
  c.innerHTML = `
<div class="stack" style="gap:18px">

  ${puedeImportar ? `
  <div class="card">
    <div class="eyebrow">Radar · CRM I+D</div>
    <h2 style="margin:2px 0 4px">Carga de datos del CRM</h2>
    <div class="hint" style="color:var(--muted);font-size:13px;margin-bottom:12px">
      Sube los dos exports del CRM (<b>listado de Proyectos</b> y <b>registro de Eventos</b>). Se guardan por
      <b>empresa activa</b> y reemplazan el snapshot anterior (el histórico se conserva). Formatos <code>.xls</code> / <code>.xlsx</code>.
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr auto;gap:12px;align-items:end;flex-wrap:wrap">
      <div><label class="label-text">Listado de Proyectos</label><input class="input" type="file" id="fProyectos" accept=".xls,.xlsx,.htm,.html"/></div>
      <div><label class="label-text">Registro de Eventos</label><input class="input" type="file" id="fEventos" accept=".xls,.xlsx,.htm,.html"/></div>
      <button class="btn" id="btnCargar">Cargar y procesar</button>
    </div>
    <div class="hint" id="cargaEstado" style="margin-top:10px;color:var(--muted);font-size:12px">—</div>
    <div id="cargasList" style="margin-top:10px"></div>
  </div>` : ''}

  <div class="card">
    <div class="row" style="align-items:flex-start;gap:12px;flex-wrap:wrap">
      <div style="flex:1;min-width:220px">
        <div class="eyebrow">Filtro</div>
        <h2 style="margin:2px 0 4px">Usuarios en el análisis</h2>
        <div class="hint" style="color:var(--muted);font-size:12px">Selecciona el equipo a analizar. Tu selección se recuerda en este navegador.</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <button class="btn" id="btnVentas" title="Seleccionar solo perfiles comerciales">Solo ventas</button>
        <button class="btn" id="btnTodos" title="Incluir a todos los usuarios">Todos</button>
      </div>
    </div>
    <div style="display:flex;gap:16px;align-items:flex-end;flex-wrap:wrap;margin-top:14px">
      <div><label class="label-text">Año</label><select class="input" id="selAnio" style="min-width:120px"></select></div>
      <div><label class="label-text">Mes</label><select class="input" id="selMes" style="min-width:170px"></select></div>
    </div>
    <div id="chipsUsuarios" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px"></div>
  </div>

  <div id="kpis" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px"></div>

  <!-- Sección 1 -->
  <div class="card">
    <div class="eyebrow">1 · Productividad</div>
    <h3 style="margin:2px 0 2px">Actividad por agente</h3>
    <div class="hint" style="color:var(--muted);font-size:12px;margin-bottom:10px">Visita, llamada, videoconferencia, correo (contacto directo) + comentario. El total iguala tu tabla dinámica; el tooltip muestra solo el contacto directo.</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
      <div style="position:relative;height:340px"><canvas id="c_contacto"></canvas></div>
      <div style="position:relative;height:340px"><canvas id="c_ritmo"></canvas></div>
    </div>
  </div>

  <!-- Sección 2 -->
  <div class="card">
    <div class="eyebrow">2 · Cobertura</div>
    <h3 style="margin:2px 0 8px">Clientes y proyectos por agente</h3>
    <div style="overflow-x:auto"><table class="table" id="tblCobertura"></table></div>
  </div>

  <!-- Sección 3 -->
  <div class="card">
    <div class="eyebrow">3 · Calidad y ritmo</div>
    <h3 style="margin:2px 0 8px">Naturaleza de la actividad</h3>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
      <div style="position:relative;height:300px"><canvas id="c_clase"></canvas></div>
      <div style="position:relative;height:300px"><canvas id="c_mesclase"></canvas></div>
    </div>
  </div>

  <!-- Sección 4 -->
  <div class="card">
    <div class="eyebrow">4 · Vínculo con ventas</div>
    <h3 style="margin:2px 0 8px">Pipeline y cartera</h3>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
      <div style="position:relative;height:300px"><canvas id="c_pipe"></canvas></div>
      <div style="position:relative;height:300px"><canvas id="c_funnel"></canvas></div>
    </div>
  </div>

  <!-- Cuentas -->
  <div class="card">
    <div class="eyebrow">5 · Cuentas más activas</div>
    <h3 style="margin:2px 0 8px">Top clientes por eventos</h3>
    <div style="overflow-x:auto"><table class="table" id="tblClientes"></table></div>
  </div>

</div>`;

  // ── Carga de archivos ───────────────────────────────────
  if (puedeImportar) {
    $('btnCargar').addEventListener('click', async () => {
      const fp = $('fProyectos').files[0];
      const fe = $('fEventos').files[0];
      if (!fp || !fe) { KoguApi.toast('Selecciona ambos archivos (Proyectos y Eventos).', 'error'); return; }
      const fd = new FormData();
      fd.append('proyectos', fp);
      fd.append('eventos', fe);
      const btn = $('btnCargar'); btn.disabled = true; btn.textContent = 'Procesando…';
      $('cargaEstado').textContent = 'Subiendo y procesando…';
      try {
        const res = await KoguApi.apiFetch(BASE + '/crm/cargar', { method: 'POST', body: fd });
        const d = KoguApi.unwrapData(res);
        KoguApi.toast(`Carga #${d.id_mov}: ${nf0.format(d.filas_proyectos)} proyectos y ${nf0.format(d.filas_eventos)} eventos.`, 'success');
        $('cargaEstado').textContent = `Última carga: ${nf0.format(d.filas_proyectos)} proyectos · ${nf0.format(d.filas_eventos)} eventos · periodo ${d.periodo_min || '—'} a ${d.periodo_max || '—'}.`;
        $('fProyectos').value = ''; $('fEventos').value = '';
        await refreshUsuarios(true);
        await loadDashboard();
        await loadCargas();
      } catch (e) { $('cargaEstado').textContent = 'No se pudo procesar la carga.'; }
      finally { btn.disabled = false; btn.textContent = 'Cargar y procesar'; }
    });
    await loadCargas();
  }

  async function loadCargas() {
    try {
      const res = await KoguApi.apiFetch(BASE + '/crm/cargas');
      const rows = KoguApi.unwrapRows(res, 'cargas');
      if (!rows.length) { $('cargasList').innerHTML = ''; return; }
      $('cargasList').innerHTML = `<div class="hint" style="font-size:12px;color:var(--muted);margin-bottom:4px">Historial de cargas</div>` +
        rows.slice(0, 5).map((r) => `<div style="display:flex;gap:10px;align-items:center;font-size:12px;padding:4px 0;border-top:1px solid var(--line)">
          <span class="badge ${r.status === 'activa' ? 'success' : 'neutral'}">${esc(r.status)}</span>
          <span>#${r.id_mov}</span>
          <span style="color:var(--muted)">${nf0.format(r.filas_proyectos)} proy · ${nf0.format(r.filas_eventos)} ev · ${KoguUi.fmtDateOnly(r.created_at)}</span>
          <button class="btn" data-del="${r.carga_id}" style="margin-left:auto;padding:2px 8px;font-size:11px">Eliminar</button>
        </div>`).join('');
      $('cargasList').querySelectorAll('[data-del]').forEach((btn) => btn.addEventListener('click', async () => {
        if (!confirm('¿Eliminar esta carga? No afecta al CRM origen.')) return;
        try { await KoguApi.apiFetch(BASE + '/crm/cargas/' + btn.dataset.del, { method: 'DELETE' }); KoguApi.toast('Carga eliminada.', 'success'); await refreshUsuarios(true); await loadDashboard(); await loadCargas(); } catch (_) {}
      }));
    } catch (_) { /* sin cargas aún */ }
  }

  // ── Filtro de usuarios ──────────────────────────────────
  $('btnVentas').addEventListener('click', () => { seleccion = new Set(usuarios.filter((u) => u.perfil === 'Comercial').map((u) => u.u)); saveSeleccion(); renderChips(); loadDashboard(); });
  $('btnTodos').addEventListener('click', () => { seleccion = null; saveSeleccion(); renderChips(); loadDashboard(); });

  function renderChips() {
    const cont = $('chipsUsuarios');
    if (!usuarios.length) { cont.innerHTML = `<span class="hint" style="color:var(--muted);font-size:12px">Sin datos cargados todavía.</span>`; return; }
    cont.innerHTML = usuarios.map((u) => {
      const on = !seleccion || seleccion.has(u.u);
      const com = u.perfil === 'Comercial';
      return `<button class="btn" data-u="${esc(u.u)}" style="padding:5px 11px;font-size:12.5px;border-radius:999px;${on ? 'background:var(--primary);color:#fff;border-color:var(--primary)' : 'opacity:.75'}">
        ${esc(u.u)} <span style="opacity:.7">· ${nf0.format(u.eventos)}${com ? ' · com' : ''}</span></button>`;
    }).join('');
    cont.querySelectorAll('[data-u]').forEach((btn) => btn.addEventListener('click', () => {
      const name = btn.dataset.u;
      if (!seleccion) seleccion = new Set(usuarios.map((u) => u.u)); // "todos" → set concreto para poder quitar
      if (seleccion.has(name)) seleccion.delete(name); else seleccion.add(name);
      if (seleccion.size === usuarios.length) seleccion = null;
      saveSeleccion(); renderChips(); loadDashboard();
    }));
  }

  async function refreshUsuarios(reset) {
    try {
      const res = await KoguApi.apiFetch(BASE + '/crm/usuarios');
      usuarios = KoguApi.unwrapRows(res, 'usuarios');
    } catch (_) { usuarios = []; }
    const saved = loadSeleccion();
    if (reset || (!saved && seleccion === null)) {
      // default: perfiles comerciales; si no hay, todos
      const com = usuarios.filter((u) => u.perfil === 'Comercial').map((u) => u.u);
      seleccion = com.length ? new Set(com) : null;
    } else if (saved) {
      seleccion = saved;
    }
    renderChips();
  }

  // ── Periodo (Año + Mes, patrón CFDI) ────────────────────
  $('selAnio').addEventListener('change', (e) => { anioSel = e.target.value ? Number(e.target.value) : null; loadDashboard(); });
  $('selMes').addEventListener('change', (e) => { mesSel = e.target.value ? Number(e.target.value) : null; loadDashboard(); });

  function poblarSelectores(D) {
    // Mes: "Acumulado (año)" + los 12 meses (una sola vez).
    if (!selectoresListos) {
      $('selMes').innerHTML = `<option value="">Acumulado (año)</option>` + MESES.map((m, i) => `<option value="${i + 1}">${m}</option>`).join('');
      selectoresListos = true;
    }
    // Año: los años disponibles según la carga.
    const anios = D.anios || [];
    $('selAnio').innerHTML = anios.map((a) => `<option value="${a}">${a}</option>`).join('') || `<option value="">—</option>`;
    anioSel = D.anio || (anios[0] || null);
    $('selAnio').value = anioSel != null ? String(anioSel) : '';
    $('selMes').value = D.mes != null ? String(D.mes) : '';
  }

  // ── Dashboard ───────────────────────────────────────────
  function dashQuery() {
    const parts = [];
    if (seleccion && seleccion.size > 0 && seleccion.size !== usuarios.length) parts.push('usuarios=' + encodeURIComponent([...seleccion].join(',')));
    if (anioSel) parts.push('anio=' + anioSel);
    if (mesSel) parts.push('mes=' + mesSel);
    return parts.length ? '?' + parts.join('&') : '';
  }

  function pintarVacio() {
    $('kpis').innerHTML = `<div class="card" style="grid-column:1/-1;text-align:center;color:var(--muted)">Aún no hay datos del CRM cargados para esta empresa.${puedeImportar ? ' Sube los exports arriba para comenzar.' : ''}</div>`;
    destroyCharts();
  }

  async function loadDashboard() {
    let D;
    try {
      const res = await KoguApi.apiFetch(BASE + '/crm/dashboard' + dashQuery());
      D = KoguApi.unwrapData(res);
    } catch (_) {
      return; // errores 401/403/409 reales ya los maneja el cliente API
    }
    if (!D || D.empty) { pintarVacio(); return; }
    poblarSelectores(D);
    renderKpis(D);
    await renderCharts(D);
    renderTablas(D);
  }

  function kpi(v, l, h) { return `<div class="kpi"><div class="value">${v}</div><div class="label">${esc(l)}</div><div class="hint">${esc(h)}</div></div>`; }
  function renderKpis(D) {
    const m = D.meta || {};
    const per = D.mes ? `${MESES[D.mes - 1]} ${D.anio || ''}` : `${D.anio || 'todo'} (acum.)`;
    $('kpis').innerHTML = [
      kpi(nf0.format(m.ev_total || 0), 'Eventos', per),
      kpi(nf0.format((D.clase && D.clase['Contacto directo']) || 0), 'Contacto directo', `${D.pct_contacto_global || 0}% del total`),
      kpi(nf0.format(m.clientes || 0), 'Clientes', `${nf0.format(m.proyectos_tocados || 0)} proyectos`),
      kpi(moneyC(D.pipeline_total || 0), `Pipeline ${D.anio || ''} (USD)`, `${nf0.format(D.proyectos_nuevos || 0)} nuevos`),
      kpi(nf0.format(D.cerrados || 0), 'Proyectos cerrados', `de ${nf0.format(m.pr_total || 0)} en cartera`),
    ].join('');
  }

  async function renderCharts(D) {
    try { await loadScript(CHART_SRC); } catch (_) { return; }
    const Chart = window.Chart;
    Chart.defaults.font.family = 'Inter,system-ui,sans-serif'; Chart.defaults.color = '#64748b'; Chart.defaults.font.size = 12;
    destroyCharts();
    const money = (n) => moneyC(n);
    const pal = [CO.primary, CO.amber, CO.green, CO.indigo, CO.red, CO.teal, CO.cyan];

    charts.push(new Chart($('c_contacto'), { type: 'bar', data: { labels: D.contacto_agente.labels, datasets: [
      { label: 'Visita', data: D.contacto_agente.Visita, backgroundColor: CO.primary },
      { label: 'Llamada', data: D.contacto_agente.Llamada, backgroundColor: CO.cyan },
      { label: 'Videoconferencia', data: D.contacto_agente.Videoconferencia, backgroundColor: CO.teal },
      { label: 'Correo', data: D.contacto_agente.Correo, backgroundColor: CO.amber },
      { label: 'Comentario', data: D.contacto_agente.Comentario, backgroundColor: CO.slate } ] },
      options: { maintainAspectRatio: false, indexAxis: 'y', scales: { x: { stacked: true }, y: { stacked: true } }, plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { footer: (items) => { const i = items[0].dataIndex; return 'Contacto directo: ' + (D.contacto_agente.CONTACTO[i] || 0); } } } } } }));

    charts.push(new Chart($('c_ritmo'), { type: 'line', data: { labels: D.mes_agente.labels, datasets: Object.entries(D.mes_agente.series).map((e, i) => ({ label: e[0], data: e[1], borderColor: pal[i % pal.length], backgroundColor: 'transparent', tension: .35, borderWidth: 2, pointRadius: 2 })) },
      options: { maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } } } } }));

    charts.push(new Chart($('c_clase'), { type: 'doughnut', data: { labels: Object.keys(D.clase), datasets: [{ data: Object.values(D.clase), backgroundColor: [CO.slate, CO.amber, CO.primary, CO.indigo] }] },
      options: { maintainAspectRatio: false, cutout: '58%', plugins: { legend: { position: 'bottom' } } } }));

    const CL = ['Sistema/hito', 'Nota/seguimiento', 'Contacto directo'];
    charts.push(new Chart($('c_mesclase'), { type: 'bar', data: { labels: D.mes_labels, datasets: [
      { label: 'Sistema/hito', data: D.mes_clase['Sistema/hito'], backgroundColor: CO.slate },
      { label: 'Nota/seguimiento', data: D.mes_clase['Nota/seguimiento'], backgroundColor: CO.amber },
      { label: 'Contacto directo', data: D.mes_clase['Contacto directo'], backgroundColor: CO.primary } ] },
      options: { maintainAspectRatio: false, scales: { x: { stacked: true }, y: { stacked: true } }, plugins: { legend: { position: 'bottom' } } } }));

    charts.push(new Chart($('c_pipe'), { type: 'bar', data: { labels: D.pipeline_agente.map((x) => x.u), datasets: [{ label: 'Pipeline USD', data: D.pipeline_agente.map((x) => x.pipeline), backgroundColor: CO.primary }] },
      options: { maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => money(ctx.raw) + '  ·  ' + D.pipeline_agente[ctx.dataIndex].proyectos + ' proy' } } }, scales: { x: { ticks: { callback: (v) => money(v) } } } } }));

    charts.push(new Chart($('c_funnel'), { type: 'bar', data: { labels: Object.keys(D.funnel), datasets: [{ data: Object.values(D.funnel), backgroundColor: [CO.green, CO.cyan, CO.amber, CO.slate, CO.red, CO.indigo, CO.teal] }] },
      options: { maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false } } } }));
  }

  function renderTablas(D) {
    $('tblCobertura').innerHTML = `<thead><tr>
      <th>Agente</th><th style="text-align:right">Eventos</th><th style="text-align:right">Contacto dir.</th><th style="text-align:right">Comentarios</th><th style="text-align:right">Sistema</th>
      <th style="text-align:right">% contacto</th><th style="text-align:right">Clientes</th><th style="text-align:right">Proyectos</th><th style="text-align:right">Ev/cliente</th>
      </tr></thead><tbody>${(D.cobertura || []).map((r) => `<tr>
      <td><b>${esc(r.u)}</b></td><td style="text-align:right">${nf0.format(r.eventos)}</td><td style="text-align:right">${nf0.format(r.contacto)}</td><td style="text-align:right">${nf0.format(r.comentarios || 0)}</td><td style="text-align:right">${nf0.format(r.sistema || 0)}</td>
      <td style="text-align:right">${r.pct_contacto}%</td><td style="text-align:right">${nf0.format(r.clientes)}</td><td style="text-align:right">${nf0.format(r.proyectos)}</td><td style="text-align:right">${r.ev_cli}</td>
      </tr>`).join('')}</tbody>`;

    $('tblClientes').innerHTML = `<thead><tr><th>Cliente</th><th style="text-align:right">Eventos</th><th style="text-align:right">Proyectos</th></tr></thead>
      <tbody>${(D.top_clientes || []).map((r) => `<tr><td>${esc(r.c)}</td><td style="text-align:right">${nf0.format(r.eventos)}</td><td style="text-align:right">${nf0.format(r.proyectos)}</td></tr>`).join('')}</tbody>`;
  }

  // ── Arranque ────────────────────────────────────────────
  await refreshUsuarios(false);
  await loadDashboard();
});

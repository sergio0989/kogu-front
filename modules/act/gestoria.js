// ============================================================
// gestoria.js
// Pantalla: Gestoría — bandeja global de obligaciones y vencimientos
// de cumplimiento (act_gestoria). Filtros por estado/ámbito/tipo/texto,
// semáforo de vencimiento, cumplir rápido y exportación a Excel.
// Endpoints: GET /gestoria, GET /gestoria/tipos, POST /gestoria/:id/cumplir.
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const b = await KoguShell.initShell({
    currentPage:        '/modules/act/gestoria.html',
    title:              'Gestoría',
    description:        'Obligaciones y vencimientos de cumplimiento de los activos.',
    requiredPermission: 'act.gestoria.read',
  });
  if (!b) return;

  const esc = KoguUi.escapeHtml;
  const canCumplir = KoguShell.hasPerm(b, 'act.gestoria.cumplir');
  const ESTADOS = ['pendiente', 'en_tramite', 'cumplido', 'vencido', 'no_aplica'];
  const $ = id => document.getElementById(id);

  let tipos = null, rowsCache = [];

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if ([...document.scripts].some(s => s.src === src)) return resolve();
      const s = document.createElement('script');
      s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('No se pudo cargar ' + src));
      document.head.appendChild(s);
    });
  }

  function semaforo(g) {
    if (g.estado === 'cumplido')  return { color: '#16a34a', label: 'Cumplida' };
    if (g.estado === 'no_aplica') return { color: '#64748b', label: 'No aplica' };
    if (!g.fecha_vencimiento)     return { color: '#64748b', label: 'Sin fecha' };
    const venc = String(g.fecha_vencimiento).slice(0, 10);
    const hoy = new Date().toISOString().slice(0, 10);
    const dias = Math.round((new Date(venc + 'T00:00:00Z') - new Date(hoy + 'T00:00:00Z')) / 86400000);
    if (dias < 0)   return { color: '#dc2626', label: `Vencida (${Math.abs(dias)}d)`, bucket: 'vencida' };
    if (dias <= 30) return { color: '#ca8a04', label: `Vence en ${dias}d`, bucket: 'por_vencer' };
    return { color: '#2563eb', label: 'Vigente', bucket: 'vigente' };
  }

  $('pageContent').innerHTML = `
<div class="card">
  <div class="row">
    <div><div class="eyebrow">Activos</div><h2>Gestoría · vencimientos</h2></div>
    <div style="display:flex;gap:8px">
      <button class="btn" id="exportBtn">Exportar Excel</button>
      <button class="btn" id="refreshBtn">Actualizar</button>
    </div>
  </div>
  <div id="gesMetrics" class="ot-metrics" style="margin-top:14px"></div>
  <div class="grid-3" style="margin-top:14px">
    <select class="select" id="fEstado"><option value="">Todos los estados</option>${ESTADOS.map(e => `<option value="${e}">${e.replace(/_/g, ' ')}</option>`).join('')}</select>
    <select class="select" id="fAmbito"><option value="">Todo ámbito</option><option value="vehicular">Vehicular</option><option value="general">General</option></select>
    <select class="select" id="fTipo"><option value="">Todos los tipos</option></select>
  </div>
  <div class="grid-2" style="margin-top:10px">
    <input class="input" id="fQ" placeholder="Buscar por título, código o nombre de activo…"/>
    <label style="display:flex;align-items:center;gap:8px;cursor:pointer"><input type="checkbox" id="fVigentes"/> <span>Solo pendientes / vencidas</span></label>
  </div>
  <div class="table-wrap" style="margin-top:14px">
    <table class="kogu-actions-table"><thead><tr>
      <th>Activo</th><th>Tipo</th><th>Título</th><th>Vencimiento</th><th>Estado</th><th>Costo</th><th>Responsable</th><th>Acciones</th>
    </tr></thead><tbody id="gesRows"><tr><td colspan="8" class="empty">Cargando…</td></tr></tbody></table>
  </div>
</div>`;

  async function ensureTipos() {
    if (tipos) return tipos;
    try { tipos = KoguApi.unwrapRows(await KoguApi.apiFetch('/protected/act/gestoria/tipos'), 'rows') || []; }
    catch (_e) { tipos = []; }
    const sel = $('fTipo');
    sel.innerHTML = '<option value="">Todos los tipos</option>' +
      tipos.map(t => `<option value="${t.tipo_id}">${esc(t.nombre)}</option>`).join('');
    return tipos;
  }

  function renderMetrics(rows) {
    let vencidas = 0, porVencer = 0;
    rows.forEach(g => { const s = semaforo(g); if (s.bucket === 'vencida') vencidas++; else if (s.bucket === 'por_vencer') porVencer++; });
    const cards = [
      { k: 'Obligaciones', v: String(rows.length) },
      { k: 'Vencidas', v: String(vencidas) },
      { k: 'Por vencer (30d)', v: String(porVencer) },
    ];
    $('gesMetrics').innerHTML = cards.map(c => `<div class="ot-metric"><div class="m-k">${esc(c.k)}</div><div class="m-v">${esc(c.v)}</div></div>`).join('');
  }

  async function load() {
    const tbody = $('gesRows');
    try {
      const qs = KoguUi.queryParams({
        estado: $('fEstado').value, ambito: $('fAmbito').value, tipo_id: $('fTipo').value,
        q: $('fQ').value.trim(), vigentes: $('fVigentes').checked ? '1' : '',
      });
      const res = await KoguApi.apiFetch('/protected/act/gestoria' + (qs ? '?' + qs : ''));
      const rows = KoguApi.unwrapRows(res, 'rows') || [];
      rowsCache = rows;
      renderMetrics(rows);
      if (!rows.length) { tbody.innerHTML = `<tr><td colspan="8" class="empty">Sin obligaciones para los filtros actuales.</td></tr>`; return; }
      tbody.innerHTML = rows.map(g => {
        const s = semaforo(g);
        return `<tr style="cursor:pointer" data-activo="${g.activo_id}">
          <td><strong>${esc(g.activo_codigo || '')}</strong>${g.activo_nombre ? `<div class="muted" style="font-size:12px">${esc(g.activo_nombre)}</div>` : ''}</td>
          <td>${g.tipo_nombre ? `<span class="chip">${esc(g.tipo_nombre)}</span>` : '<span class="muted">—</span>'}</td>
          <td>${esc(g.titulo)}</td>
          <td>${g.fecha_vencimiento ? esc(KoguUi.fmtDateOnly(g.fecha_vencimiento)) : '<span class="muted">—</span>'}<div style="font-size:12px;color:${s.color};font-weight:600">${esc(s.label)}</div></td>
          <td><span class="chip" style="background:${s.color}1a;color:${s.color};border:1px solid ${s.color}55">${esc((g.estado || '').replace(/_/g, ' '))}</span></td>
          <td>${g.costo != null ? KoguUi.fmtMoney(g.costo, g.moneda) : '<span class="muted">—</span>'}</td>
          <td>${g.responsable_nombre ? esc(g.responsable_nombre) : '<span class="muted">—</span>'}</td>
          <td class="actions-cell">
            ${(canCumplir && (g.estado === 'pendiente' || g.estado === 'en_tramite')) ? `<button class="btn ghost" data-cumplir="${g.gestoria_id}">Cumplir</button>` : ''}
            <a class="btn ghost" href="/modules/act/activo-detalle.html?id=${encodeURIComponent(g.activo_id)}">Ver activo</a>
          </td>
        </tr>`;
      }).join('');
      tbody.querySelectorAll('[data-cumplir]').forEach(btn => btn.onclick = (e) => { e.stopPropagation(); cumplirRapido(btn.dataset.cumplir); });
      tbody.querySelectorAll('[data-activo]').forEach(tr => tr.onclick = () => { window.location.href = '/modules/act/activo-detalle.html?id=' + encodeURIComponent(tr.dataset.activo); });
    } catch (_err) {
      tbody.innerHTML = `<tr><td colspan="8" class="empty">No fue posible cargar la gestoría.</td></tr>`;
    }
  }

  async function cumplirRapido(id) {
    if (!window.confirm('¿Marcar esta obligación como cumplida hoy?')) return;
    try {
      const res = await KoguApi.apiFetch('/protected/act/gestoria/' + encodeURIComponent(id) + '/cumplir', {
        method: 'POST', body: JSON.stringify({ fecha_cumplimiento: new Date().toISOString().slice(0, 10) }),
      });
      const out = KoguApi.unwrapData(res);
      KoguApi.toast(out && out.siguiente ? 'Cumplida · siguiente generada' : 'Obligación cumplida', 'success');
      await load();
    } catch (_err) { /* apiFetch toast */ }
  }

  async function exportarExcel() {
    if (!rowsCache.length) { KoguApi.toast('No hay obligaciones para exportar.', 'error'); return; }
    await KoguUi.withLoading($('exportBtn'), async () => {
      try {
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
        const data = rowsCache.map(g => ({
          Activo: g.activo_codigo || '', Nombre: g.activo_nombre || '',
          Tipo: g.tipo_nombre || '', Titulo: g.titulo || '',
          Vencimiento: g.fecha_vencimiento ? String(g.fecha_vencimiento).slice(0, 10) : '',
          Estado: g.estado || '', Cumplimiento: g.fecha_cumplimiento ? String(g.fecha_cumplimiento).slice(0, 10) : '',
          Costo: g.costo != null ? Number(g.costo) : '', Moneda: g.moneda || '',
          Autoridad: g.autoridad || '', Referencia: g.referencia || '',
          Responsable: g.responsable_nombre || '', Gestor: g.proveedor_nombre || '',
        }));
        const ws = window.XLSX.utils.json_to_sheet(data);
        const wb = window.XLSX.utils.book_new();
        window.XLSX.utils.book_append_sheet(wb, ws, 'Gestoria');
        window.XLSX.writeFile(wb, 'gestoria_' + new Date().toISOString().slice(0, 10) + '.xlsx');
      } catch (_e) { KoguApi.toast('No fue posible exportar.', 'error'); }
    }, 'Exportando…');
  }

  // ── Bindings ─────────────────────────────────────────────────
  ['fEstado', 'fAmbito', 'fTipo', 'fVigentes'].forEach(id => $(id).addEventListener('change', load));
  let qTimer = null;
  $('fQ').addEventListener('input', () => { clearTimeout(qTimer); qTimer = setTimeout(load, 350); });
  $('refreshBtn').onclick = load;
  $('exportBtn').onclick = exportarExcel;
  KoguShell.subscribeEmpresaActivaChange(async () => { tipos = null; await ensureTipos(); await load(); });

  await ensureTipos();
  await load();
});

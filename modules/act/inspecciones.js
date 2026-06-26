// ============================================================
// inspecciones.js
// Pantalla: Inspecciones — bandeja global (act_inspecciones).
// Filtros por estado/resultado/texto; abrir ejecución; export Excel.
// Endpoints: GET /inspecciones.
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const b = await KoguShell.initShell({
    currentPage:        '/modules/act/inspecciones.html',
    title:              'Inspecciones',
    description:        'Inspecciones de condición y seguridad de los activos.',
    requiredPermission: 'act.inspecciones.read',
  });
  if (!b) return;

  const esc = KoguUi.escapeHtml;
  const ESTADOS = ['programada', 'en_proceso', 'cerrada', 'cancelada'];
  const RESULTADOS = ['aprobado', 'condicionado', 'rechazado'];
  const COLOR = { aprobado: '#16a34a', condicionado: '#ca8a04', rechazado: '#dc2626' };
  const $ = id => document.getElementById(id);
  let rowsCache = [];

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if ([...document.scripts].some(s => s.src === src)) return resolve();
      const s = document.createElement('script');
      s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('No se pudo cargar ' + src));
      document.head.appendChild(s);
    });
  }

  $('pageContent').innerHTML = `
<div class="card">
  <div class="row">
    <div><div class="eyebrow">Activos</div><h2>Inspecciones</h2></div>
    <div style="display:flex;gap:8px">
      <button class="btn" id="exportBtn">Exportar Excel</button>
      <button class="btn" id="refreshBtn">Actualizar</button>
    </div>
  </div>
  <div class="grid-3" style="margin-top:14px">
    <select class="select" id="fEstado"><option value="">Todos los estados</option>${ESTADOS.map(e => `<option value="${e}">${e.replace(/_/g, ' ')}</option>`).join('')}</select>
    <select class="select" id="fResultado"><option value="">Todo resultado</option>${RESULTADOS.map(r => `<option value="${r}">${r}</option>`).join('')}</select>
    <input class="input" id="fQ" placeholder="Buscar por código o nombre de activo…"/>
  </div>
  <div class="table-wrap" style="margin-top:14px">
    <table class="kogu-actions-table"><thead><tr>
      <th>Folio</th><th>Activo</th><th>Plantilla</th><th>Fecha</th><th>Odómetro</th><th>Estado</th><th>Resultado</th><th>Acciones</th>
    </tr></thead><tbody id="rows"><tr><td colspan="8" class="empty">Cargando…</td></tr></tbody></table>
  </div>
</div>`;

  async function load() {
    const tbody = $('rows');
    try {
      const qs = KoguUi.queryParams({ estado: $('fEstado').value, resultado: $('fResultado').value, q: $('fQ').value.trim() });
      const res = await KoguApi.apiFetch('/protected/act/inspecciones' + (qs ? '?' + qs : ''));
      const rows = KoguApi.unwrapRows(res, 'rows') || [];
      rowsCache = rows;
      if (!rows.length) { tbody.innerHTML = `<tr><td colspan="8" class="empty">Sin inspecciones para los filtros actuales.</td></tr>`; return; }
      tbody.innerHTML = rows.map(i => {
        const rc = i.resultado ? `<span class="chip" style="background:${COLOR[i.resultado]}1a;color:${COLOR[i.resultado]};border:1px solid ${COLOR[i.resultado]}55">${esc(i.resultado)}</span>` : '<span class="muted">—</span>';
        return `<tr style="cursor:pointer" data-id="${i.inspeccion_id}">
          <td><strong>#${esc(String(i.id_mov))}</strong></td>
          <td><strong>${esc(i.activo_codigo || '')}</strong>${i.activo_nombre ? `<div class="muted" style="font-size:12px">${esc(i.activo_nombre)}</div>` : ''}</td>
          <td>${i.plantilla_nombre ? esc(i.plantilla_nombre) : '<span class="muted">—</span>'}</td>
          <td>${i.fecha ? esc(KoguUi.fmtDateOnly(i.fecha)) : '<span class="muted">—</span>'}</td>
          <td>${i.odometro != null ? esc(String(i.odometro)) + ' ' + esc(i.odometro_unidad || '') : '<span class="muted">—</span>'}</td>
          <td><span class="chip">${esc((i.estado || '').replace(/_/g, ' '))}</span></td>
          <td>${rc}</td>
          <td class="actions-cell"><a class="btn ghost" href="/modules/act/inspeccion-detalle.html?id=${encodeURIComponent(i.inspeccion_id)}">Abrir</a></td>
        </tr>`;
      }).join('');
      tbody.querySelectorAll('[data-id]').forEach(tr => tr.onclick = (e) => { if (e.target.closest('a')) return; window.location.href = '/modules/act/inspeccion-detalle.html?id=' + encodeURIComponent(tr.dataset.id); });
    } catch (_err) {
      tbody.innerHTML = `<tr><td colspan="8" class="empty">No fue posible cargar las inspecciones.</td></tr>`;
    }
  }

  async function exportarExcel() {
    if (!rowsCache.length) { KoguApi.toast('No hay inspecciones para exportar.', 'error'); return; }
    await KoguUi.withLoading($('exportBtn'), async () => {
      try {
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
        const data = rowsCache.map(i => ({
          Folio: i.id_mov, Activo: i.activo_codigo || '', Nombre: i.activo_nombre || '',
          Plantilla: i.plantilla_nombre || '', Fecha: i.fecha ? String(i.fecha).slice(0, 10) : '',
          Odometro: i.odometro != null ? Number(i.odometro) : '', Unidad: i.odometro_unidad || '',
          Estado: i.estado || '', Resultado: i.resultado || '', Inspector: i.inspector_nombre || '',
        }));
        const ws = window.XLSX.utils.json_to_sheet(data);
        const wb = window.XLSX.utils.book_new();
        window.XLSX.utils.book_append_sheet(wb, ws, 'Inspecciones');
        window.XLSX.writeFile(wb, 'inspecciones_' + new Date().toISOString().slice(0, 10) + '.xlsx');
      } catch (_e) { KoguApi.toast('No fue posible exportar.', 'error'); }
    }, 'Exportando…');
  }

  ['fEstado', 'fResultado'].forEach(id => $(id).addEventListener('change', load));
  let qTimer = null;
  $('fQ').addEventListener('input', () => { clearTimeout(qTimer); qTimer = setTimeout(load, 350); });
  $('refreshBtn').onclick = load;
  $('exportBtn').onclick = exportarExcel;
  KoguShell.subscribeEmpresaActivaChange(load);
  await load();
});

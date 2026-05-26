// ============================================================
// proveedores.js
// Pantalla: Scorecard de proveedores de taller (analítica de órdenes).
// Endpoint: GET /protected/act/proveedores/estadisticas?desde&hasta
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const b = await KoguShell.initShell({
    currentPage:        '/modules/act/proveedores.html',
    title:              'Scorecard de proveedores',
    description:        'Desempeño de los talleres/proveedores: costos, tiempos, cumplimiento y reincidencia.',
    requiredPermission: 'act.proveedores.read',
  });
  if (!b) return;

  const esc = KoguUi.escapeHtml;
  const $ = id => document.getElementById(id);

  // Columnas ordenables (key = campo normalizado en filas; num = orden numérico)
  const COLS = [
    { key: 'proveedor_nombre',            label: 'Proveedor',           num: false },
    { key: 'num_ordenes',                 label: '# órdenes',           num: true },
    { key: 'gasto_total',                 label: 'Gasto total',         num: true },
    { key: 'costo_promedio',              label: 'Costo prom.',         num: true },
    { key: 'dias_promedio_atencion',      label: 'Días prom.',          num: true },
    { key: 'pct_cumplimiento_compromiso', label: '% en tiempo',         num: true },
    { key: 'reincidencia_pct',            label: 'Reincidencia',        num: true },
  ];

  let rows = [];
  let sort = { key: 'gasto_total', dir: 'desc' };

  function semaforoReincidencia(pct) {
    if (pct == null) return '<span class="muted">—</span>';
    const c = pct < 5 ? '#16a34a' : pct <= 15 ? '#ca8a04' : '#dc2626';
    return `<span class="chip" style="background:${c}1a;color:${c};border:1px solid ${c}55">${pct.toFixed(1)}%</span>`;
  }
  function num(v) { return v == null ? null : Number(v); }

  document.getElementById('pageContent').innerHTML = `
<div class="card">
  <div class="row">
    <div><div class="eyebrow">Activos</div><h2>Scorecard de proveedores</h2></div>
    <div><button class="btn" id="refreshBtn">Actualizar</button></div>
  </div>
  <div class="grid-3" style="margin-top:16px">
    <div><div class="label-text">Desde</div><input class="input" id="fDesde" type="date"/></div>
    <div><div class="label-text">Hasta</div><input class="input" id="fHasta" type="date"/></div>
    <div style="display:flex;align-items:flex-end"><button class="btn primary" id="aplicarBtn">Aplicar</button></div>
  </div>
  <div class="muted" style="font-size:12px;margin-top:10px">Reincidencia: % de activos que regresan con una orden del mismo tipo dentro de 60 días tras el cierre. Semáforo: verde &lt; 5% · ámbar 5–15% · rojo &gt; 15%.</div>
  <div class="table-wrap" style="margin-top:12px">
    <table>
      <thead><tr id="headRow"></tr></thead>
      <tbody id="rows"><tr><td colspan="7" class="empty">Cargando…</td></tr></tbody>
    </table>
  </div>
</div>`;

  function renderHead() {
    $('headRow').innerHTML = COLS.map(c => {
      const active = sort.key === c.key;
      const arrow = active ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : '';
      return `<th data-sort="${c.key}" style="cursor:pointer;white-space:nowrap;${c.num ? 'text-align:right' : ''}">${esc(c.label)}${arrow}</th>`;
    }).join('');
    $('headRow').querySelectorAll('[data-sort]').forEach(th => th.onclick = () => {
      const k = th.dataset.sort;
      if (sort.key === k) sort.dir = sort.dir === 'asc' ? 'desc' : 'asc';
      else { sort.key = k; sort.dir = COLS.find(c => c.key === k).num ? 'desc' : 'asc'; }
      renderHead(); renderBody();
    });
  }

  function renderBody() {
    const tbody = $('rows');
    if (!rows.length) { tbody.innerHTML = `<tr><td colspan="7" class="empty">Sin proveedores con órdenes en el rango.</td></tr>`; return; }
    const col = COLS.find(c => c.key === sort.key);
    const sorted = rows.slice().sort((a, b2) => {
      let va = a[sort.key], vb = b2[sort.key];
      if (col.num) { va = va == null ? -Infinity : Number(va); vb = vb == null ? -Infinity : Number(vb); }
      else { va = String(va || '').toLowerCase(); vb = String(vb || '').toLowerCase(); }
      if (va < vb) return sort.dir === 'asc' ? -1 : 1;
      if (va > vb) return sort.dir === 'asc' ? 1 : -1;
      return 0;
    });
    tbody.innerHTML = sorted.map(r => `
      <tr>
        <td><strong>${esc(r.proveedor_nombre || '—')}</strong></td>
        <td style="text-align:right">${KoguUi.int(r.num_ordenes || 0)}</td>
        <td style="text-align:right">${KoguUi.fmtMoney(r.gasto_total || 0)}</td>
        <td style="text-align:right">${r.costo_promedio != null ? KoguUi.fmtMoney(r.costo_promedio) : '<span class="muted">—</span>'}</td>
        <td style="text-align:right">${r.dias_promedio_atencion != null ? r.dias_promedio_atencion.toFixed(1) : '<span class="muted">—</span>'}</td>
        <td style="text-align:right">${r.pct_cumplimiento_compromiso != null ? r.pct_cumplimiento_compromiso.toFixed(1) + '%' : '<span class="muted">—</span>'}</td>
        <td style="text-align:right">${semaforoReincidencia(r.reincidencia_pct)}</td>
      </tr>`).join('');
  }

  async function load() {
    const tbody = $('rows');
    try {
      const qs = KoguUi.queryParams({ desde: $('fDesde').value, hasta: $('fHasta').value });
      const res = await KoguApi.apiFetch('/protected/act/proveedores/estadisticas' + (qs ? '?' + qs : ''));
      const data = KoguApi.unwrapData(res);
      rows = (data.proveedores || []).map(p => ({
        ...p,
        num_ordenes: num(p.num_ordenes), gasto_total: num(p.gasto_total),
        costo_promedio: num(p.costo_promedio), dias_promedio_atencion: num(p.dias_promedio_atencion),
        pct_cumplimiento_compromiso: num(p.pct_cumplimiento_compromiso), reincidencia_pct: num(p.reincidencia_pct),
      }));
      renderBody();
    } catch (_err) { tbody.innerHTML = `<tr><td colspan="7" class="empty">No fue posible cargar el scorecard.</td></tr>`; }
  }

  // ── Bindings ────────────────────────────────────────────────────────────────
  renderHead();
  $('aplicarBtn').onclick = load;
  $('refreshBtn').onclick = load;
  KoguShell.subscribeEmpresaActivaChange(load);
  await load();
});

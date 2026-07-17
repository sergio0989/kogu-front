// ============================================================
// cobertura-comex.js — Comercio Exterior: Cobertura de reconciliación.
// Lista priorizada (por kg) de proveedores con operaciones reales (2025+) que
// AÚN NO reconcilian, clasificados por motivo: SIN TEORICO / SIN PROVEEDOR /
// FUERA DE ESCALA. Es la lista de trabajo: "qué costeo teórico crear después".
// Excluye movimientos internos (transferencias/ajustes) igual que el motor.
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/comex/cobertura-comex.html';
  const PERM = 'screen.comex.cobertura';
  const BASE = '/protected/comex';

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Cobertura de reconciliación · Comercio Exterior',
    description: 'Proveedores con importaciones reales que aún no reconcilian. Prioriza qué costeo teórico crear.',
    requiredPermission: PERM,
  });
  if (!b) return;

  const $ = (id) => document.getElementById(id);
  const c = $('pageContent');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const n0 = (v) => (Number(v) || 0).toLocaleString('es-MX', { maximumFractionDigits: 0 });
  const pct1 = (v) => (Number(v) || 0).toFixed(1) + '%';

  // Estados: color + etiqueta + hint de acción. SIN TEORICO es el caso de un solo paso.
  const EST = {
    'SIN TEORICO':     { bg: '#fef3c7', co: '#92400e', lab: 'Sin teórico',     accion: 'Crear costeo(s) teórico(s) del proveedor en las escalas que opera.' },
    'SIN PROVEEDOR':   { bg: '#f3e8ff', co: '#6b21a8', lab: 'Sin proveedor',   accion: 'Mapear la clave SAI en cat_proveedores y luego crear su costeo.' },
    'FUERA DE ESCALA': { bg: '#dbeafe', co: '#1e40af', lab: 'Fuera de escala', accion: 'Hay costeo, pero ninguno cubre operaciones tan chicas: crear una escala menor.' },
  };
  const estChip = (e) => { const m = EST[e] || { bg: '#f1f5f9', co: '#475569', lab: e }; return `<span style="background:${m.bg};color:${m.co};font-size:11px;font-weight:700;padding:2px 9px;border-radius:999px;white-space:nowrap">${esc(m.lab)}</span>`; };

  let data = [];
  let fEstado = 'TODOS', filtro = '', sortKey = 'kg_total', sortDir = 'desc';

  c.innerHTML = `
<div class="card">
  <div class="row">
    <div><div class="eyebrow">Comercio Exterior · Cobertura</div><h2 style="margin:0">Cobertura de reconciliación</h2>
      <div class="muted" style="font-size:12px">Proveedores con importaciones reales (2025+) que <strong>todavía no reconcilian</strong>. Ordenados por kg = impacto. Los movimientos internos (transferencias) ya están excluidos.</div></div>
    <button class="btn" id="reload" style="align-self:flex-start">↻ Actualizar</button>
  </div>

  <div id="kpis" style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px"></div>

  <div style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap;align-items:center">
    <div id="chips" style="display:flex;gap:6px;flex-wrap:wrap"></div>
    <input id="q" class="input" placeholder="🔍 Buscar proveedor…" style="max-width:300px"/>
  </div>
  <div class="muted" id="info" style="font-size:12px;margin-top:8px"></div>
  <div style="overflow-x:auto;margin-top:8px"><table class="table" id="tab" style="width:100%;font-size:12.5px;font-variant-numeric:tabular-nums"></table></div>
  <div class="muted" style="font-size:11.5px;margin-top:10px">
    <strong>Pareto:</strong> la columna <em>% acum</em> muestra cuánto del kg faltante concentran los proveedores de arriba — normalmente ~6 proveedores cubren ~80%.
    <strong>Rango op.</strong> = kg de la operación más chica y más grande del proveedor: la escala mínima a crear va ≤ el rango chico.
  </div>
</div>`;

  const kpi = (lab, val, sub, co) => `
    <div style="flex:1;min-width:150px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px 14px">
      <div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.04em">${esc(lab)}</div>
      <div style="font-size:22px;font-weight:800;color:${co || '#0f172a'};line-height:1.2">${val}</div>
      <div class="muted" style="font-size:11px">${sub || ''}</div>
    </div>`;

  function renderKpis() {
    const tot = data.reduce((s, r) => s + (Number(r.kg_total) || 0), 0);
    const ops = data.reduce((s, r) => s + (Number(r.operaciones) || 0), 0);
    const by = (e) => data.filter(r => r.estado === e);
    const kgOf = (arr) => arr.reduce((s, r) => s + (Number(r.kg_total) || 0), 0);
    const st = by('SIN TEORICO'), sp = by('SIN PROVEEDOR'), fe = by('FUERA DE ESCALA');
    $('kpis').innerHTML =
      kpi('Kg sin reconciliar', n0(tot), `${n0(data.length)} proveedores · ${n0(ops)} operaciones`, '#b45309') +
      kpi('Sin teórico', n0(st.length), `${n0(kgOf(st))} kg · un paso: crear costeo`, '#92400e') +
      kpi('Sin proveedor', n0(sp.length), `${n0(kgOf(sp))} kg · mapear + costeo`, '#6b21a8') +
      kpi('Fuera de escala', n0(fe.length), `${n0(kgOf(fe))} kg · crear escala menor`, '#1e40af');
  }

  function renderChips() {
    const counts = { TODOS: data.length };
    data.forEach(r => { counts[r.estado] = (counts[r.estado] || 0) + 1; });
    const defs = [['TODOS', 'Todos'], ['SIN TEORICO', 'Sin teórico'], ['SIN PROVEEDOR', 'Sin proveedor'], ['FUERA DE ESCALA', 'Fuera de escala']];
    $('chips').innerHTML = defs.map(([k, lab]) => {
      const on = fEstado === k;
      return `<button class="btn ${on ? 'primary' : 'ghost'}" data-e="${k}" style="${on ? 'background:#0891b2' : ''}">${esc(lab)} · ${n0(counts[k] || 0)}</button>`;
    }).join('');
    $('chips').querySelectorAll('button[data-e]').forEach(bn => bn.addEventListener('click', () => { fEstado = bn.dataset.e; render(); }));
  }

  function sortVal(r, k) {
    switch (k) {
      case 'proveedor': return String(r.proveedor || '').toLowerCase();
      case 'estado': return String(r.estado || '');
      case 'operaciones': return Number(r.operaciones) || 0;
      case 'kg_min_op': return Number(r.kg_min_op) || 0;
      case 'kg_max_op': return Number(r.kg_max_op) || 0;
      default: return Number(r.kg_total) || 0;
    }
  }
  function clickSort(k) {
    if (sortKey === k) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    else { sortKey = k; sortDir = (k === 'proveedor' || k === 'estado') ? 'asc' : 'desc'; }
    render();
  }

  function render() {
    renderKpis(); renderChips();
    const q = filtro.trim().toLowerCase();
    let rows = data.slice();
    if (fEstado !== 'TODOS') rows = rows.filter(r => r.estado === fEstado);
    if (q) rows = rows.filter(r => String(r.proveedor || '').toLowerCase().includes(q) || String(r.cve_prov || '').includes(q));
    const dir = sortDir === 'asc' ? 1 : -1;
    rows.sort((a, b) => { const va = sortVal(a, sortKey), vb = sortVal(b, sortKey); return va < vb ? -dir : va > vb ? dir : 0; });

    // Pareto: % acumulado sobre el subconjunto mostrado, ordenado por kg desc.
    const totKg = rows.reduce((s, r) => s + (Number(r.kg_total) || 0), 0) || 1;
    const paretoOrder = rows.slice().sort((a, b) => (Number(b.kg_total) || 0) - (Number(a.kg_total) || 0));
    let acc = 0; const acumMap = new Map();
    paretoOrder.forEach(r => { acc += (Number(r.kg_total) || 0); acumMap.set(r, acc / totKg * 100); });

    $('info').textContent = `${n0(rows.length)} proveedor(es) · ${n0(totKg)} kg sin reconciliar en el filtro actual`;
    const sarr = (k) => sortKey === k ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';
    const th = (k, lab, extra = '') => `<th data-sk="${k}" style="cursor:pointer;user-select:none;padding:6px;${extra}">${lab}${sarr(k)}</th>`;
    const head = `<thead><tr style="border-bottom:2px solid #e2e8f0;text-align:right">
      <th style="width:30px;text-align:right;padding:6px">#</th>
      ${th('proveedor', 'Proveedor', 'text-align:left')}
      <th style="text-align:left;padding:6px">cve SAI</th>
      ${th('estado', 'Motivo', 'text-align:left')}
      ${th('operaciones', 'Ops')}${th('kg_total', 'Kg total')}<th style="padding:6px">% acum</th>
      ${th('kg_min_op', 'Op. mín')}${th('kg_max_op', 'Op. máx')}
      <th style="text-align:left;padding:6px">Acción</th></tr></thead>`;
    if (!rows.length) { $('tab').innerHTML = head + `<tbody><tr><td colspan="9" style="text-align:center;padding:18px;color:var(--muted)">${data.length ? 'Sin coincidencias en el filtro.' : '🎉 Sin huecos: toda operación real reconcilia.'}</td></tr></tbody>`; wireSort(); return; }

    // rank global por kg (independiente del sort visible) para el Pareto.
    const rankMap = new Map(); paretoOrder.forEach((r, i) => rankMap.set(r, i + 1));
    $('tab').innerHTML = head + '<tbody>' + rows.map((r) => {
      const acumPct = acumMap.get(r) || 0;
      const dentro80 = acumPct <= 80.0001;
      const m = EST[r.estado] || { accion: '' };
      return `<tr style="border-bottom:1px solid #f1f5f9;text-align:right">
        <td style="padding:6px;color:#94a3b8">${rankMap.get(r)}</td>
        <td style="text-align:left;padding:6px;font-weight:700">${esc(r.proveedor)}</td>
        <td style="text-align:left;padding:6px;color:#64748b">${r.cve_prov != null ? esc(r.cve_prov) : '—'}</td>
        <td style="text-align:left;padding:6px">${estChip(r.estado)}</td>
        <td style="padding:6px">${n0(r.operaciones)}</td>
        <td style="padding:6px;font-weight:700">${n0(r.kg_total)}</td>
        <td style="padding:6px;${dentro80 ? 'color:#b45309;font-weight:700' : 'color:#94a3b8'}">${pct1(acumPct)}</td>
        <td style="padding:6px;color:#475569">${n0(r.kg_min_op)}</td>
        <td style="padding:6px;color:#475569">${n0(r.kg_max_op)}</td>
        <td style="text-align:left;padding:6px;color:#64748b;font-size:11.5px;max-width:320px">${esc(m.accion || '')}</td></tr>`;
    }).join('') + '</tbody>';
    wireSort();
  }
  function wireSort() { $('tab').querySelectorAll('th[data-sk]').forEach(h => h.addEventListener('click', () => clickSort(h.dataset.sk))); }

  async function cargar() {
    $('info').textContent = 'Cargando…';
    try {
      data = KoguApi.unwrapData(await KoguApi.apiFetch(BASE + '/cobertura')) || [];
      render();
    } catch (e) { KoguApi.toast(e.message, 'error'); $('info').textContent = esc(e.message); }
  }

  let qTimer = null;
  $('q').addEventListener('input', (e) => { clearTimeout(qTimer); qTimer = setTimeout(() => { filtro = e.target.value; render(); }, 180); });
  $('reload').addEventListener('click', cargar);
  KoguShell.subscribeEmpresaActivaChange(() => { data = []; filtro = ''; fEstado = 'TODOS'; if ($('q')) $('q').value = ''; cargar(); });
  cargar();
});

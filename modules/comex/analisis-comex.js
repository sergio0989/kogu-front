// ============================================================
// analisis-comex.js — Comercio Exterior: Análisis y exportación.
// Cortes por proveedor / producto / escala sobre la reconciliación del periodo,
// enriquecidos con COSTEOC. Exporta a Excel (3 hojas).
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/comex/analisis-comex.html';
  const PERM = 'screen.comex.analisis';
  const BASE = '/protected/comex';

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Análisis y exportación · Comercio Exterior',
    description: 'Cortes por proveedor, producto y escala del periodo reconciliado. Exporta a Excel.',
    requiredPermission: PERM,
  });
  if (!b) return;

  const $ = (id) => document.getElementById(id);
  const c = $('pageContent');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const n0 = (v) => (Number(v) || 0).toLocaleString('es-MX', { maximumFractionDigits: 0 });
  const kg = (v) => (Number(v) || 0).toLocaleString('es-MX', { maximumFractionDigits: 0 });
  const usd4 = (v) => (v == null ? '—' : Number(v).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 4 }));
  const pct = (v) => (v == null ? '—' : (Number(v) * 100).toFixed(1) + '%');

  let data = null, corte = 'proveedores', periodo = null;
  let filtro = '', sortKey = 'costo_usd', sortDir = 'desc';

  c.innerHTML = `
<div class="card">
  <div class="row">
    <div><div class="eyebrow">Comercio Exterior · Análisis</div><h2 style="margin:0">Análisis y exportación de importaciones</h2>
      <div class="muted" style="font-size:12px">Cortes del <strong>periodo reconciliado</strong> por proveedor, producto y escala de kg.</div></div>
    <div style="display:flex;gap:10px;align-items:flex-end">
      <div><label class="muted" style="font-size:12px;display:block">Periodo</label>
        <select id="periodo" class="input" style="min-width:200px"></select></div>
      <button class="btn primary" id="expBtn" style="background:#0891b2">⬇ Exportar Excel</button>
    </div>
  </div>
  <div style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap;align-items:center">
    <div style="display:flex;gap:6px;flex-wrap:wrap">
      <button class="btn" data-c="proveedores">Por proveedor</button>
      <button class="btn" data-c="productos">Por producto</button>
      <button class="btn" data-c="escalas">Por escala</button>
    </div>
    <input id="anQ" class="input" placeholder="🔍 Buscar…" style="max-width:300px"/>
  </div>
  <div class="muted" id="cInfo" style="font-size:12px;margin-top:8px"></div>
  <div style="overflow-x:auto;margin-top:8px"><table class="table" id="tAn" style="width:100%;font-size:12.5px;font-variant-numeric:tabular-nums"></table></div>
</div>`;

  const G = 'background:#f8fafc;color:#334155';
  const M = 'background:#faf5ff;color:#7e22ce';
  function gmpPill(v) {
    if (v == null) return '—';
    const bg = v < 0.30 ? '#dcfce7' : v <= 0.60 ? '#fef9c3' : '#fee2e2';
    const co = v < 0.30 ? '#166534' : v <= 0.60 ? '#854d0e' : '#991b1b';
    return `<span style="font-weight:700;background:${bg};color:${co};padding:1px 8px;border-radius:999px">${pct(v)}</span>`;
  }
  function utiPill(v) {
    if (v == null) return '—';
    const bg = v < 0.08 ? '#dcfce7' : v <= 0.15 ? '#fef9c3' : '#fee2e2';
    const co = v < 0.08 ? '#166534' : v <= 0.15 ? '#854d0e' : '#991b1b';
    return `<span style="font-weight:700;background:${bg};color:${co};padding:1px 8px;border-radius:999px">${pct(v)}</span>`;
  }

  const CORTES = {
    proveedores: { lab: 'Proveedor', nombre: false, prov: false },
    productos: { lab: 'Producto', nombre: true, prov: true },
    escalas: { lab: 'Escala (kg)', nombre: false, prov: false },
  };

  function render() {
    document.querySelectorAll('button[data-c]').forEach(bn => {
      const on = bn.dataset.c === corte;
      bn.className = 'btn ' + (on ? 'primary' : 'ghost');
      bn.style.background = on ? '#0891b2' : '';
    });
    const meta = CORTES[corte];
    const expand = true;
    if ($('anQ')) $('anQ').placeholder = `🔍 Buscar ${meta.lab.toLowerCase()}…`;
    const base = (data && data[corte]) || [];
    const q = filtro.trim().toLowerCase();
    let rows = q ? base.filter(r => String(r.grupo || '').toLowerCase().includes(q) || String(r.nombre || '').toLowerCase().includes(q) || String(r.proveedor || '').toLowerCase().includes(q)) : base.slice();
    const dir = sortDir === 'asc' ? 1 : -1;
    rows.sort((a, b) => { const va = sortVal(a, sortKey), vb = sortVal(b, sortKey); return va < vb ? -dir : va > vb ? dir : 0; });
    const hint = corte === 'productos' ? ' · expande un producto → operaciones por escala'
      : corte === 'escalas' ? ' · expande una escala → operaciones por proveedor'
        : ' · expande un proveedor → sus operaciones';
    $('cInfo').textContent = `${n0(rows.length)} de ${n0(base.length)} ${meta.lab.toLowerCase()}(s) · costo USD = DDP total${hint}`;
    const sarr = (k) => sortKey === k ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';
    const th = (k, lab, extra = '') => `<th data-sk="${k}" style="cursor:pointer;user-select:none;padding:6px;${extra}">${lab}${sarr(k)}</th>`;
    const head = `<thead><tr style="border-bottom:2px solid #e2e8f0;text-align:right">
      ${expand ? '<th style="width:24px"></th>' : ''}
      ${th('grupo', esc(meta.lab), 'text-align:left')}${meta.nombre ? th('nombre', 'Nombre', 'text-align:left') : ''}${meta.prov ? th('proveedor', 'Proveedor', 'text-align:left') : ''}
      ${th('ops', 'Ops')}${th('kg', 'Kg')}${th('costo_usd', 'Costo USD')}
      ${th('mp_kg', 'Mercancía/kg', M)}${th('gastos_kg', 'Gastos/kg')}${th('ddp_kg', 'DDP/kg')}
      ${th('gmp', 'Gastos/MP', M)}${th('uti', 'UtiPor')}</tr></thead>`;
    const ncol = 9 + (meta.nombre ? 1 : 0) + (meta.prov ? 1 : 0) + (expand ? 1 : 0);
    if (!rows.length) { $('tAn').innerHTML = head + `<tbody><tr><td colspan="${ncol}" style="text-align:center;padding:16px;color:var(--muted)">${base.length ? 'Sin coincidencias.' : 'Sin datos. Reconcilia el periodo primero.'}</td></tr></tbody>`; $('tAn').querySelectorAll('th[data-sk]').forEach(h => h.addEventListener('click', () => clickSort(h.dataset.sk))); return; }
    $('tAn').innerHTML = head + '<tbody>' + rows.map((r, idx) => {
      const kgv = Number(r.kg) || 0;
      const mpKg = kgv > 0 ? Number(r.mp_usd) / kgv : null;
      const gKg = kgv > 0 ? Number(r.gastos_usd) / kgv : null;
      const ddpKg = kgv > 0 ? Number(r.costo_usd) / kgv : null;
      const det = expand ? `<tr class="op-det" data-det="${idx}" style="display:none"><td colspan="${ncol}" style="padding:0 6px 10px 30px;background:#fafcff"></td></tr>` : '';
      return `<tr style="border-bottom:1px solid #f1f5f9;text-align:right">
        ${expand ? `<td style="text-align:center;padding:6px"><button class="btn ghost" data-op="${idx}" title="Ver operaciones" style="padding:0 6px;font-size:12px;line-height:1.4">▸</button></td>` : ''}
        <td style="text-align:left;padding:6px;font-weight:700">${esc(r.grupo)}</td>
        ${meta.nombre ? `<td style="text-align:left;padding:6px">${esc(r.nombre || '')}</td>` : ''}
        ${meta.prov ? `<td style="text-align:left;padding:6px">${esc(r.proveedor || '—')}</td>` : ''}
        <td style="padding:6px">${n0(r.ops)}</td>
        <td style="padding:6px">${kg(r.kg)}</td>
        <td style="padding:6px;font-weight:700">$${n0(r.costo_usd)}</td>
        <td style="padding:6px;${M}">$${usd4(mpKg)}</td>
        <td style="padding:6px">$${usd4(gKg)}</td>
        <td style="padding:6px">$${usd4(ddpKg)}</td>
        <td style="padding:6px">${gmpPill(r.gmp == null ? null : Number(r.gmp))}</td>
        <td style="padding:6px">${utiPill(r.uti == null ? null : Number(r.uti))}</td></tr>${det}`;
    }).join('') + '</tbody>';
    if (expand) $('tAn').querySelectorAll('button[data-op]').forEach(bn => bn.addEventListener('click', () => toggleOps(bn, rows[+bn.dataset.op])));
    $('tAn').querySelectorAll('th[data-sk]').forEach(h => h.addEventListener('click', () => clickSort(h.dataset.sk)));
  }

  function sortVal(r, key) {
    const kgv = Number(r.kg) || 0;
    switch (key) {
      case 'grupo': return String(r.grupo || '').toLowerCase();
      case 'nombre': return String(r.nombre || '').toLowerCase();
      case 'proveedor': return String(r.proveedor || '').toLowerCase();
      case 'ops': return Number(r.ops) || 0;
      case 'kg': return kgv;
      case 'costo_usd': return Number(r.costo_usd) || 0;
      case 'mp_kg': return kgv > 0 ? Number(r.mp_usd) / kgv : 0;
      case 'gastos_kg': return kgv > 0 ? Number(r.gastos_usd) / kgv : 0;
      case 'ddp_kg': return kgv > 0 ? Number(r.costo_usd) / kgv : 0;
      case 'gmp': return r.gmp == null ? -1 : Number(r.gmp);
      case 'uti': return r.uti == null ? -1 : Number(r.uti);
      default: return 0;
    }
  }
  function clickSort(k) {
    if (sortKey === k) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    else { sortKey = k; sortDir = (k === 'grupo' || k === 'nombre') ? 'asc' : 'desc'; }
    render();
  }

  const opsCache = {};
  const resChip = (r) => {
    const map = { DentroBanda: ['#dcfce7', '#166534', 'Dentro'], SobreTabulador: ['#fee2e2', '#991b1b', '↑ Sobre'], BajoTabulador: ['#dbeafe', '#1e40af', '↓ Bajo'], SinTeorico: ['#f1f5f9', '#475569', 'Sin teórico'], SinProveedor: ['#f3e8ff', '#6b21a8', 'Sin prov'], SinDatos: ['#fef9c3', '#854d0e', 'Sin datos'] };
    const m = map[r] || map.SinDatos;
    return `<span style="background:${m[0]};color:${m[1]};font-size:11px;font-weight:700;padding:1px 8px;border-radius:999px">${m[2]}</span>`;
  };

  const opFila = (o) => {
    const k = Number(o.kg) || 0;
    return `<tr style="border-bottom:1px solid #f1f5f9;text-align:right">
      <td style="text-align:left;padding:4px 6px;font-weight:700">${esc(o.pedimento || o.no_costeo)}</td>
      <td style="padding:4px 6px">${o.escala_kg != null ? kg(o.escala_kg) + ' kg' : '—'}</td>
      <td style="padding:4px 6px">${kg(o.kg)}</td>
      <td style="padding:4px 6px;font-weight:700">$${n0(o.costo_usd)}</td>
      <td style="padding:4px 6px;${M}">$${usd4(k > 0 ? Number(o.mp_usd) / k : null)}</td>
      <td style="padding:4px 6px">$${usd4(k > 0 ? Number(o.gastos_usd) / k : null)}</td>
      <td style="padding:4px 6px">$${usd4(k > 0 ? Number(o.costo_usd) / k : null)}</td>
      <td style="padding:4px 6px">${gmpPill(o.gmp == null ? null : Number(o.gmp))}</td>
      <td style="padding:4px 6px">${utiPill(o.uti == null ? null : Number(o.uti))}</td>
      <td style="text-align:center;padding:4px 6px">${o.resultado ? resChip(o.resultado) : '—'}</td></tr>`;
  };
  const opHead = `<thead><tr style="border-bottom:1px solid #e2e8f0;text-align:right;color:#64748b">
    <th style="text-align:left;padding:4px 6px">Pedimento</th><th>Escala</th><th>Kg</th><th>Costo USD</th>
    <th style="${M};padding:4px 6px">Mercancía/kg</th><th>Gastos/kg</th><th>DDP/kg</th>
    <th style="${M};padding:4px 6px">Gastos/MP</th><th>UtiPor</th><th style="text-align:center;padding:4px 6px">Resultado</th></tr></thead>`;

  async function toggleOps(bn, row) {
    const idx = bn.dataset.op;
    const det = $('tAn').querySelector(`tr.op-det[data-det="${idx}"]`);
    if (!det) return;
    if (det.style.display !== 'none') { det.style.display = 'none'; bn.textContent = '▸'; return; }
    det.style.display = ''; bn.textContent = '▾';
    const cell = det.firstElementChild;
    const key = corte + '|' + periodo + '|' + row.grupo;
    if (opsCache[key]) { cell.innerHTML = opsCache[key]; return; }
    cell.innerHTML = '<div style="padding:8px;color:var(--muted);font-size:12px">Cargando operaciones…</div>';
    try {
      let url, groupBy = null;
      if (corte === 'productos') { url = BASE + '/analisis/operaciones-producto?periodo=' + encodeURIComponent(periodo) + '&producto=' + encodeURIComponent(row.grupo); groupBy = 'escala'; }
      else if (corte === 'escalas') { url = BASE + '/analisis/operaciones-escala?periodo=' + encodeURIComponent(periodo) + '&escala=' + encodeURIComponent(row.grupo); groupBy = 'proveedor'; }
      else { url = BASE + '/analisis/operaciones?periodo=' + encodeURIComponent(periodo) + '&proveedor=' + encodeURIComponent(row.grupo); }
      const ops = KoguApi.unwrapData(await KoguApi.apiFetch(url)) || [];
      if (!ops.length) { cell.innerHTML = '<div style="padding:8px;color:var(--muted);font-size:12px">Sin operaciones.</div>'; return; }
      let html;
      if (groupBy) {
        const grupos = {};
        ops.forEach(o => {
          const g = groupBy === 'escala' ? (o.escala_kg != null ? String(o.escala_kg) : '— sin escala') : (o.proveedor || '—');
          (grupos[g] = grupos[g] || []).push(o);
        });
        const claves = groupBy === 'escala'
          ? Object.keys(grupos).sort((a, b) => (parseFloat(a) || 1e9) - (parseFloat(b) || 1e9))
          : Object.keys(grupos).sort((a, b) => grupos[b].reduce((s, o) => s + (Number(o.costo_usd) || 0), 0) - grupos[a].reduce((s, o) => s + (Number(o.costo_usd) || 0), 0));
        html = claves.map(g => {
          const lista = grupos[g];
          const sk = lista.reduce((a, o) => a + (Number(o.kg) || 0), 0);
          const su = lista.reduce((a, o) => a + (Number(o.costo_usd) || 0), 0);
          const etq = groupBy === 'escala' ? (g === '— sin escala' ? g : 'Escala ' + kg(g) + ' kg') : g;
          return `<div style="margin-top:8px">
            <div style="display:flex;justify-content:space-between;gap:8px;background:#eef6ff;color:#1e3a8a;font-weight:700;font-size:12px;padding:4px 8px;border-radius:6px">
              <span>${esc(etq)} · ${lista.length} op(s)</span><span style="white-space:nowrap">${kg(sk)} kg · $${n0(su)} USD</span></div>
            <table class="table" style="width:100%;font-size:12px;font-variant-numeric:tabular-nums">${opHead}<tbody>${lista.map(opFila).join('')}</tbody></table>
          </div>`;
        }).join('');
      } else {
        html = `<table class="table" style="width:100%;font-size:12px;font-variant-numeric:tabular-nums;margin-top:4px">${opHead}<tbody>${ops.map(opFila).join('')}</tbody></table>`;
      }
      opsCache[key] = html; cell.innerHTML = html;
    } catch (e) { cell.innerHTML = `<div style="padding:8px;color:#991b1b;font-size:12px">${esc(e.message)}</div>`; }
  }

  async function cargarPeriodos() {
    try {
      const rows = KoguApi.unwrapData(await KoguApi.apiFetch(BASE + '/reconciliacion/periodos')) || [];
      const sel = $('periodo');
      if (!rows.length) { sel.innerHTML = '<option value="">— sin periodos reconciliados —</option>'; $('expBtn').disabled = true; return; }
      const acum = `<option value="ACUM">📊 Acumulado (todos los periodos)</option>`;
      sel.innerHTML = acum + rows.map(r => `<option value="${esc(r.periodo)}">${esc(r.periodo)} · ${n0(r.n_pedimentos)} pedimentos</option>`).join('');
      sel.value = 'ACUM';
      periodo = sel.value; cargar();
    } catch (e) { KoguApi.toast(e.message, 'error'); }
  }

  async function cargar() {
    if (!periodo) return;
    try {
      data = KoguApi.unwrapData(await KoguApi.apiFetch(BASE + '/analisis?periodo=' + encodeURIComponent(periodo))) || {};
      render();
    } catch (e) { KoguApi.toast(e.message, 'error'); }
  }

  async function exportar() {
    if (!periodo) return KoguApi.toast('Elige un periodo.', 'error');
    $('expBtn').disabled = true; const t = $('expBtn').textContent; $('expBtn').textContent = '⏳ Generando…';
    try {
      const res = await KoguApi.authFetchRaw(BASE + '/analisis/export?periodo=' + encodeURIComponent(periodo));
      if (!res.ok) throw new Error('No se pudo generar el Excel');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `Analisis_Comex_${periodo === 'ACUM' ? 'acumulado' : periodo}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } catch (e) { KoguApi.toast(e.message, 'error'); }
    finally { $('expBtn').disabled = false; $('expBtn').textContent = t; }
  }

  $('periodo').addEventListener('change', () => { periodo = $('periodo').value; cargar(); });
  document.querySelectorAll('button[data-c]').forEach(bn => bn.addEventListener('click', () => { corte = bn.dataset.c; filtro = ''; if ($('anQ')) $('anQ').value = ''; sortKey = 'costo_usd'; sortDir = 'desc'; render(); }));
  let anQTimer = null;
  $('anQ').addEventListener('input', (e) => { clearTimeout(anQTimer); anQTimer = setTimeout(() => { filtro = e.target.value; render(); }, 180); });
  $('expBtn').addEventListener('click', exportar);
  KoguShell.subscribeEmpresaActivaChange(() => { data = null; $('periodo').innerHTML = ''; cargarPeriodos(); });
  cargarPeriodos();
});

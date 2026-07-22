// ============================================================
// cruce-ventas.js — Comercio Exterior: Cruce venta ↔ importación por lote.
// Cada renglón de venta (erp_ventas) se une con su lote importado (COSTEOC):
// precio de venta USD/kg vs MP + flete + otros + arancel = LANDED USD/kg.
// Resuelve claves espejo (ADE####↔WWP####) vía comex_producto_equivalencia y
// normaliza el lote a solo dígitos (la venta puede traer sufijo 'ADE').
// El semáforo es contra el landed del lote: ¿el precio cubre traerlo?
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/comex/cruce-ventas.html';
  const PERM = 'screen.comex.cruce_ventas';
  const BASE = '/protected/comex';

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Cruce venta-importación · Comercio Exterior',
    description: 'Precio de venta vs costo real de importación (landed) por lote. Detecta ventas que no cubren su importación.',
    requiredPermission: PERM,
  });
  if (!b) return;

  const $ = (id) => document.getElementById(id);
  const c = $('pageContent');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const n0 = (v) => (Number(v) || 0).toLocaleString('es-MX', { maximumFractionDigits: 0 });
  const n2 = (v) => (v === null || v === undefined) ? '—' : Number(v).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pctf = (v) => (v === null || v === undefined) ? '—' : (Number(v) * 100).toFixed(1) + '%';
  const fmtFecha = (f) => { if (!f) return '—'; const d = new Date(f); return isNaN(d) ? esc(String(f).slice(0, 10)) : d.toLocaleDateString('es-MX', { year: '2-digit', month: 'short', day: '2-digit' }); };

  let kpis = null, filas = [], eqs = [];
  let fSolo = 'TODOS', filtro = '', sortKey = 'fecha', sortDir = 'asc';
  const _perms = (b && (b.permissions || b.permisos)) || [];
  const canWrite = _perms.includes('comex.cruce_ventas.write') || _perms.includes('comex.admin');

  c.innerHTML = `
<div class="card">
  <div class="row">
    <div><div class="eyebrow">Comercio Exterior · Cruce</div><h2 style="margin:0">Cruce venta-importación</h2>
      <div class="muted" style="font-size:12px">Cada venta contra el <strong>lote importado</strong> del que salió: precio vs landed (MP + flete + otros + arancel) en USD/kg. Renglones en rosa = el precio no cubrió traer ese lote.</div></div>
    <div style="display:flex;gap:8px;align-self:flex-start">
      <button class="btn ghost" id="exportBtn">⬇ Exportar Excel</button>
      <button class="btn" id="reload">↻ Actualizar</button>
    </div>
  </div>

  <div style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap;align-items:end">
    <div><label class="muted" style="font-size:11px">Desde</label><br/><input type="date" id="fDesde" class="input"/></div>
    <div><label class="muted" style="font-size:11px">Hasta</label><br/><input type="date" id="fHasta" class="input"/></div>
    <div><label class="muted" style="font-size:11px">Cliente</label><br/>
      <button class="btn" id="fClienteBtn" style="min-width:220px;max-width:300px;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">Todos ▾</button></div>
    <div><label class="muted" style="font-size:11px">Producto</label><br/>
      <button class="btn" id="fProductoBtn" style="min-width:220px;max-width:300px;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">Todos ▾</button></div>
    <button class="btn primary" id="aplicar">Aplicar</button>
  </div>

  <div id="kpis" style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px"></div>

  <div style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap;align-items:center">
    <div id="chips" style="display:flex;gap:6px;flex-wrap:wrap"></div>
    <input id="q" class="input" placeholder="🔍 Factura, cliente, producto, lote…" style="max-width:300px"/>
  </div>
  <div class="muted" id="info" style="font-size:12px;margin-top:8px"></div>
  <div style="overflow-x:auto;margin-top:8px"><table class="table" id="tab" style="width:100%;font-size:12px;font-variant-numeric:tabular-nums"></table></div>
  <div class="muted" style="font-size:11.5px;margin-top:10px">
    <strong>TC:</strong> el landed usa el TC del pedimento cuando la operación ya reconcilió (⚓); si no, cae al TC de la venta (≈).
    <strong>Sin lote</strong> = la venta no encontró partida importada (lote no importado, clave sin espejo, o DBF sin cargar).
  </div>
</div>

<div class="card" style="margin-top:14px">
  <div class="row">
    <div><h3 style="margin:0">Claves espejo (equivalencias)</h3>
      <div class="muted" style="font-size:12px">Mismo producto con dos claves (ADE#### ↔ WWP####). Sembradas por regla de sufijo; cura aquí las excepciones.</div></div>
    <button class="btn ghost" id="toggleEq" style="align-self:flex-start">▸ Ver</button>
  </div>
  <div id="eqPanel" style="display:none;margin-top:10px">
    <div id="eqAlta" style="display:${canWrite ? 'flex' : 'none'};gap:8px;flex-wrap:wrap;align-items:end;margin-bottom:10px">
      <div><label class="muted" style="font-size:11px">Clave venta</label><br/><input id="eqA" class="input" placeholder="ADE0707" style="max-width:140px"/></div>
      <div><label class="muted" style="font-size:11px">Clave importación</label><br/><input id="eqB" class="input" placeholder="WWP0707" style="max-width:140px"/></div>
      <button class="btn primary" id="eqAdd">+ Vincular</button>
    </div>
    <div style="overflow-x:auto"><table class="table" id="eqTab" style="width:100%;font-size:12px"></table></div>
  </div>
</div>`;

  const kpi = (lab, val, sub, co) => `
    <div style="flex:1;min-width:150px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px 14px">
      <div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.04em">${esc(lab)}</div>
      <div style="font-size:22px;font-weight:800;color:${co || '#0f172a'};line-height:1.2">${val}</div>
      <div class="muted" style="font-size:11px">${sub || ''}</div>
    </div>`;

  function renderKpis() {
    if (!kpis) { $('kpis').innerHTML = ''; return; }
    $('kpis').innerHTML =
      kpi('Renglones', n0(kpis.renglones), `${n0(kpis.con_match)} con lote · ${n0(kpis.sin_match)} sin lote`) +
      kpi('Kg cruzados', n0(kpis.kg_match), `de ${n0(kpis.kg)} kg vendidos`) +
      kpi('Margen vs landed', pctf(kpis.margen_pct), `US$ ${n0(kpis.margen_usd)} sobre venta US$ ${n0(kpis.venta_usd)}`, (kpis.margen_pct || 0) < 0 ? '#be123c' : '#047857') +
      kpi('Ventas con pérdida', n0(kpis.con_perdida), `${n0(kpis.kg_perdida)} kg · US$ ${n0(Math.abs(kpis.perdida_usd || 0))} perdidos`, kpis.con_perdida ? '#be123c' : '#047857');
  }

  function renderChips() {
    const counts = {
      TODOS: filas.length,
      PERDIDA: filas.filter(f => f.con_perdida).length,
      MATCH: filas.filter(f => f.match).length,
      SINMATCH: filas.filter(f => !f.match).length,
    };
    const defs = [['TODOS', 'Todos'], ['PERDIDA', 'Con pérdida'], ['MATCH', 'Con lote'], ['SINMATCH', 'Sin lote']];
    $('chips').innerHTML = defs.map(([k, lab]) => {
      const on = fSolo === k;
      return `<button class="btn ${on ? 'primary' : 'ghost'}" data-e="${k}" style="${on ? 'background:#0891b2' : ''}">${esc(lab)} · ${n0(counts[k])}</button>`;
    }).join('');
    $('chips').querySelectorAll('button[data-e]').forEach(bn => bn.addEventListener('click', () => { fSolo = bn.dataset.e; render(); }));
  }

  function sortVal(f, k) {
    switch (k) {
      case 'fecha': return String(f.fecha || '');
      case 'factura': return String(f.factura || '');
      case 'cliente': return String(f.nom_cte || '').toLowerCase();
      case 'producto': return String(f.cve_prod || '');
      case 'kg': return Number(f.kg) || 0;
      case 'precio': return f.precio_usd_kg ?? -1e9;
      case 'landed': return f.landed_usd_kg ?? -1e9;
      case 'margen': return f.margen_usd_kg ?? -1e9;
      case 'margen_pct': return f.margen_pct ?? -1e9;
      default: return String(f.fecha || '');
    }
  }
  function clickSort(k) {
    if (sortKey === k) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    else { sortKey = k; sortDir = (k === 'cliente' || k === 'producto' || k === 'factura' || k === 'fecha') ? 'asc' : 'desc'; }
    render();
  }

  function render() {
    renderKpis(); renderChips();
    const q = filtro.trim().toLowerCase();
    let rows = filas.slice();
    if (fSolo === 'PERDIDA') rows = rows.filter(f => f.con_perdida);
    else if (fSolo === 'MATCH') rows = rows.filter(f => f.match);
    else if (fSolo === 'SINMATCH') rows = rows.filter(f => !f.match);
    if (q) rows = rows.filter(f =>
      String(f.factura || '').toLowerCase().includes(q) || String(f.nom_cte || '').toLowerCase().includes(q) ||
      String(f.cve_prod || '').toLowerCase().includes(q) || String(f.desc_prod || '').toLowerCase().includes(q) ||
      String(f.lote || '').toLowerCase().includes(q));
    const dir = sortDir === 'asc' ? 1 : -1;
    rows.sort((a, b2) => { const va = sortVal(a, sortKey), vb = sortVal(b2, sortKey); return va < vb ? -dir : va > vb ? dir : 0; });

    $('info').textContent = `${n0(rows.length)} renglón(es) en el filtro actual`;
    const sarr = (k) => sortKey === k ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';
    const th = (k, lab, extra = '') => `<th data-sk="${k}" style="cursor:pointer;user-select:none;padding:6px;${extra}">${lab}${sarr(k)}</th>`;
    const head = `<thead><tr style="border-bottom:2px solid #e2e8f0;text-align:right">
      ${th('fecha', 'Fecha', 'text-align:left')}${th('factura', 'Factura', 'text-align:left')}
      ${th('cliente', 'Cliente', 'text-align:left')}${th('producto', 'Producto', 'text-align:left')}
      <th style="text-align:left;padding:6px">Lote</th>${th('kg', 'Kg')}
      <th style="text-align:left;padding:6px">Embarque</th>
      ${th('precio', 'Precio<br/>USD/kg')}<th style="padding:6px">MP</th><th style="padding:6px">Flete</th><th style="padding:6px">Otros</th>
      ${th('landed', 'Landed<br/>USD/kg')}${th('margen', 'Margen<br/>USD/kg')}${th('margen_pct', '%')}</tr></thead>`;
    if (!rows.length) { $('tab').innerHTML = head + `<tbody><tr><td colspan="14" style="text-align:center;padding:18px;color:var(--muted)">${filas.length ? 'Sin coincidencias en el filtro.' : 'Sin datos: revisa el rango de fechas o carga DBF/ventas.'}</td></tr></tbody>`; wireSort(); return; }

    $('tab').innerHTML = head + '<tbody>' + rows.map((f) => {
      const bg = f.con_perdida ? 'background:#fdf2f4;' : '';
      const tcMark = !f.match ? '' : (f.tc_es_pedimento ? ' <span title="TC del pedimento">⚓</span>' : ' <span title="TC de la venta (operación sin reconciliar)" style="color:#b45309">≈</span>');
      const prodExtra = f.cve_prod_impo && f.cve_prod_impo !== f.cve_prod ? `<div class="muted" style="font-size:10.5px">impo: ${esc(f.cve_prod_impo)}</div>` : '';
      const marCo = f.margen_usd_kg === null ? '#94a3b8' : (f.margen_usd_kg < 0 ? '#be123c' : '#047857');
      return `<tr style="border-bottom:1px solid #f1f5f9;text-align:right;${bg}">
        <td style="text-align:left;padding:6px;white-space:nowrap">${fmtFecha(f.fecha)}</td>
        <td style="text-align:left;padding:6px;font-weight:700">${esc(f.factura)}</td>
        <td style="text-align:left;padding:6px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(f.nom_cte)}">${esc(f.nom_cte)}</td>
        <td style="text-align:left;padding:6px"><strong>${esc(f.cve_prod)}</strong>${prodExtra}<div class="muted" style="font-size:10.5px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(f.desc_prod)}">${esc(f.desc_prod)}</div></td>
        <td style="text-align:left;padding:6px;color:#64748b">${esc(f.lote || '—')}</td>
        <td style="padding:6px;font-weight:700">${n0(f.kg)}</td>
        <td style="text-align:left;padding:6px;font-size:11px;color:#475569">${f.match ? (esc(f.embarque || (f.proveedor ? f.proveedor + (f.escala_kg ? ' · ' + n0(f.escala_kg) + ' kg' : '') : '—'))) : '<span style="color:#b45309;font-weight:700">Sin lote</span>'}</td>
        <td style="padding:6px;font-weight:700">${n2(f.precio_usd_kg)}</td>
        <td style="padding:6px;color:#475569">${n2(f.mp_usd_kg)}</td>
        <td style="padding:6px;color:#475569">${n2(f.flete_usd_kg)}</td>
        <td style="padding:6px;color:#475569">${n2((f.otros_usd_kg ?? null) === null ? null : (f.otros_usd_kg + (f.arancel_usd_kg || 0)))}</td>
        <td style="padding:6px;font-weight:700">${n2(f.landed_usd_kg)}${tcMark}</td>
        <td style="padding:6px;font-weight:800;color:${marCo}">${n2(f.margen_usd_kg)}</td>
        <td style="padding:6px;font-weight:700;color:${marCo}">${pctf(f.margen_pct)}</td></tr>`;
    }).join('') + '</tbody>';
    wireSort();
  }
  function wireSort() { $('tab').querySelectorAll('th[data-sk]').forEach(h => h.addEventListener('click', () => clickSort(h.dataset.sk))); }

  // ── Equivalencias ───────────────────────────────────────────
  function renderEq() {
    const head = `<thead><tr style="border-bottom:1px solid #e2e8f0;color:#64748b;text-align:left">
      <th style="padding:4px 6px">Clave venta</th><th style="padding:4px 6px">Clave impo</th>
      <th style="padding:4px 6px">Sufijo</th><th style="padding:4px 6px">Origen</th>
      <th style="padding:4px 6px">Estado</th>${canWrite ? '<th style="padding:4px 6px"></th>' : ''}</tr></thead>`;
    if (!eqs.length) { $('eqTab').innerHTML = head + '<tbody><tr><td colspan="6" style="padding:12px;text-align:center;color:var(--muted)">Sin equivalencias (aplica la migración o vincula manual).</td></tr></tbody>'; return; }
    // Mostrar solo una dirección por par (a<b) para no duplicar visualmente.
    const vistos = new Set();
    const unicos = eqs.filter(e => {
      const k = [e.cve_prod_venta, e.cve_prod_impo].sort().join('|');
      if (vistos.has(k)) return false; vistos.add(k); return true;
    });
    $('eqTab').innerHTML = head + '<tbody>' + unicos.map(e => `
      <tr style="border-bottom:1px solid #f1f5f9;${e.activo ? '' : 'opacity:.45'}">
        <td style="padding:4px 6px;font-weight:700">${esc(e.cve_prod_venta)}</td>
        <td style="padding:4px 6px;font-weight:700">${esc(e.cve_prod_impo)}</td>
        <td style="padding:4px 6px;color:#64748b">${esc(e.sufijo || '—')}</td>
        <td style="padding:4px 6px">${e.origen === 'manual' ? '✍️ manual' : '⚙️ sufijo'}</td>
        <td style="padding:4px 6px">${e.activo ? '<span style="color:#047857;font-weight:700">activa</span>' : '<span style="color:#94a3b8">inactiva</span>'}</td>
        ${canWrite ? `<td style="padding:4px 6px"><button class="btn ghost" data-eq="${esc(e.equivalencia_id)}" data-on="${e.activo ? '0' : '1'}" style="font-size:11px;padding:2px 8px">${e.activo ? 'Desactivar' : 'Activar'}</button></td>` : ''}
      </tr>`).join('') + '</tbody>';
    if (canWrite) $('eqTab').querySelectorAll('button[data-eq]').forEach(bn => bn.addEventListener('click', async () => {
      try {
        await KoguApi.apiFetch(BASE + '/cruce-ventas/equivalencias/' + bn.dataset.eq, { method: 'PUT', body: JSON.stringify({ activo: bn.dataset.on === '1' }) });
        await cargarEq(); cargar();
      } catch (e) { KoguApi.toast(e.message, 'error'); }
    }));
  }

  async function cargarEq() {
    try { eqs = KoguApi.unwrapData(await KoguApi.apiFetch(BASE + '/cruce-ventas/equivalencias')) || []; renderEq(); }
    catch (e) { KoguApi.toast(e.message, 'error'); }
  }

  // ── Filtros cliente/producto: picker modal con búsqueda ────
  let filtrosData = { clientes: [], productos: [] };
  let selCliente = null;   // { cve_cte, nom_cte } | null
  let selProducto = null;  // { cve_prod, desc_prod } | null
  const TODOS = '__TODOS__';

  function pintaFiltroBtns() {
    $('fClienteBtn').textContent = selCliente ? `${selCliente.nom_cte || selCliente.cve_cte} ✕` : 'Todos ▾';
    $('fProductoBtn').textContent = selProducto ? `${selProducto.cve_prod} ✕` : 'Todos ▾';
    $('fClienteBtn').title = selCliente ? `${selCliente.nom_cte} (${selCliente.cve_cte}) — clic para cambiar` : 'Todos los clientes';
    $('fProductoBtn').title = selProducto ? `${selProducto.desc_prod || selProducto.cve_prod} — clic para cambiar` : 'Todos los productos';
  }

  function pickerCliente() {
    const items = [{ cve_cte: TODOS, nom_cte: '— Todos los clientes —', renglones: '' }]
      .concat(filtrosData.clientes.map(x => ({ ...x, renglones: n0(x.renglones) })));
    KoguUi.openSearchPicker({
      title: 'Filtrar por cliente',
      items,
      columns: [
        { key: 'nom_cte', label: 'Cliente', primary: true },
        { key: 'cve_cte', label: 'cve' },
        { key: 'renglones', label: 'ventas cruzables' },
      ],
      placeholder: 'Buscar por nombre o clave…',
      onSelect: (it) => { selCliente = it.cve_cte === TODOS ? null : it; pintaFiltroBtns(); cargar(); },
    });
  }

  function pickerProducto() {
    const items = [{ cve_prod: TODOS, desc_prod: '— Todos los productos —', renglones: '' }]
      .concat(filtrosData.productos.map(x => ({ ...x, renglones: n0(x.renglones) })));
    KoguUi.openSearchPicker({
      title: 'Filtrar por producto',
      items,
      columns: [
        { key: 'cve_prod', label: 'Clave', primary: true },
        { key: 'desc_prod', label: 'Descripción' },
        { key: 'renglones', label: 'ventas cruzables' },
      ],
      placeholder: 'Buscar por clave o descripción…',
      onSelect: (it) => { selProducto = it.cve_prod === TODOS ? null : it; pintaFiltroBtns(); cargar(); },
    });
  }

  // ── Carga ───────────────────────────────────────────────────
  function qs() {
    const p = new URLSearchParams();
    if ($('fDesde').value) p.set('desde', $('fDesde').value);
    if ($('fHasta').value) p.set('hasta', $('fHasta').value);
    if (selCliente) p.set('cliente', selCliente.cve_cte);
    if (selProducto) p.set('producto', selProducto.cve_prod);
    const s = p.toString();
    return s ? '?' + s : '';
  }

  async function cargarFiltros() {
    try {
      const d = KoguApi.unwrapData(await KoguApi.apiFetch(BASE + '/cruce-ventas/filtros')) || {};
      filtrosData = { clientes: d.clientes || [], productos: d.productos || [] };
    } catch (e) { /* filtros no bloquean la pantalla */ }
  }

  async function cargar() {
    $('info').textContent = 'Cargando…';
    try {
      const d = KoguApi.unwrapData(await KoguApi.apiFetch(BASE + '/cruce-ventas' + qs())) || {};
      kpis = d.kpis || null; filas = d.filas || [];
      render();
    } catch (e) { KoguApi.toast(e.message, 'error'); $('info').textContent = esc(e.message); }
  }

  let qTimer = null;
  $('q').addEventListener('input', (e) => { clearTimeout(qTimer); qTimer = setTimeout(() => { filtro = e.target.value; render(); }, 180); });
  $('aplicar').addEventListener('click', cargar);
  $('fClienteBtn').addEventListener('click', pickerCliente);
  $('fProductoBtn').addEventListener('click', pickerProducto);
  $('exportBtn').addEventListener('click', async () => {
    try {
      KoguApi.toast('Generando Excel…', 'info');
      // Respeta también el chip activo (solo=perdida/match/sinmatch).
      const soloMap = { PERDIDA: 'perdida', MATCH: 'match', SINMATCH: 'sinmatch' };
      let url = BASE + '/cruce-ventas/export' + qs();
      if (soloMap[fSolo]) url += (url.includes('?') ? '&' : '?') + 'solo=' + soloMap[fSolo];
      const res = await KoguApi.authFetchRaw(url);
      if (!res.ok) throw new Error('No se pudo generar el Excel.');
      const blob = await res.blob();
      const dl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const suf = [selCliente?.nom_cte, selProducto?.cve_prod].filter(Boolean).join('_').replace(/\s+/g, '') || 'todos';
      a.href = dl; a.download = `cruce_venta_impo_${suf}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(dl);
    } catch (e) { KoguApi.toast(e.message, 'error'); }
  });
  $('reload').addEventListener('click', () => { cargar(); cargarEq(); });
  $('toggleEq').addEventListener('click', () => {
    const p = $('eqPanel'); const on = p.style.display === 'none';
    p.style.display = on ? '' : 'none'; $('toggleEq').textContent = on ? '▾ Ocultar' : '▸ Ver';
    if (on && !eqs.length) cargarEq();
  });
  if (canWrite) $('eqAdd').addEventListener('click', async () => {
    const a = $('eqA').value.trim(), b2 = $('eqB').value.trim();
    if (!a || !b2) return KoguApi.toast('Captura ambas claves.', 'error');
    try {
      await KoguApi.apiFetch(BASE + '/cruce-ventas/equivalencias', { method: 'POST', body: JSON.stringify({ cve_prod_venta: a, cve_prod_impo: b2 }) });
      $('eqA').value = ''; $('eqB').value = '';
      KoguApi.toast('Equivalencia creada.', 'success');
      await cargarEq(); cargar();
    } catch (e) { KoguApi.toast(e.message, 'error'); }
  });

  KoguShell.subscribeEmpresaActivaChange(() => {
    kpis = null; filas = []; eqs = []; fSolo = 'TODOS'; filtro = '';
    selCliente = null; selProducto = null; pintaFiltroBtns();
    if ($('q')) $('q').value = '';
    cargarFiltros(); cargar();
  });
  pintaFiltroBtns(); cargarFiltros(); cargar();
});

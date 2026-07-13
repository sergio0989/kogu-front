// ============================================================
// integraciones-export.js — Costo (cto_): Integraciones de exportación.
// Reemplaza la plataforma FileMaker: arma el documento con datos del ERP
// (ventas EXT + compras), calcula el costo/kg (uniforme por kg) y al
// Finalizar publica a cto_costos_exportacion (lo consume el motor ABC).
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/cto/integraciones-export.html';
  const PERM = 'screen.costo';
  const BASE = '/protected/cto/export';

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Integraciones de exportación',
    description: 'Arma el costo de exportación con datos del ERP y publícalo al costo de ventas.',
    requiredPermission: PERM,
  });
  if (!b) return;

  const $ = (id) => document.getElementById(id);
  const c = $('pageContent');

  const fmtMon = (v) => '$' + (Number(v) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmt2 = (v) => (Number(v) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtKg = (v) => (Number(v) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' kg';
  const fmtPct = (v) => v == null ? '—' : (Number(v) || 0).toFixed(2) + ' %';
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const fechaSolo = (v) => v ? String(v).slice(0, 10) : '';

  let CATS = [];   // catálogo de categorías
  let STATE = { view: 'list', id: null };

  // ── API helpers ──
  const api = (path, opts) => KoguApi.apiFetch(BASE + path, opts);
  const data = (res) => KoguApi.unwrapData(res);
  const qs = (obj) => {
    const p = Object.entries(obj || {}).filter(([, v]) => v != null && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(v)}`);
    return p.length ? '?' + p.join('&') : '';
  };

  async function loadCategorias() {
    try { CATS = data(await api('/categorias')) || []; } catch (_e) { CATS = []; }
  }

  // ════════════════════════════ LISTA ════════════════════════════
  async function renderList() {
    STATE = { view: 'list', id: null };
    c.innerHTML = `
<div class="card">
  <div class="row">
    <div><div class="eyebrow">Costo · Exportación</div><h2>Integraciones de exportación</h2>
      <div class="muted" style="font-size:12px">Documento por embarque: ventas de exportación + facturas de gasto → costo por kilo publicado al costo de ventas.</div></div>
    <div style="display:flex;gap:8px;align-items:flex-end">
      <div><label class="muted" style="font-size:12px;display:block">Estatus</label>
        <select id="fStatus" class="input" style="width:150px">
          <option value="">Todos</option><option value="pendiente">Pendiente</option>
          <option value="borrador">Borrador</option><option value="finalizado">Finalizado</option>
        </select></div>
      <div><label class="muted" style="font-size:12px;display:block">Buscar</label><input id="fQ" class="input" placeholder="Folio o referencia" style="width:180px"/></div>
      <button class="btn primary" id="nuevaBtn" style="background:#0891b2">＋ Nueva integración</button>
    </div>
  </div>
  <div style="overflow-x:auto;margin-top:12px"><table class="table" id="tabla" style="width:100%;font-size:13px;font-variant-numeric:tabular-nums"></table></div>
</div>`;
    $('nuevaBtn').addEventListener('click', nueva);
    $('fStatus').addEventListener('change', cargarLista);
    $('fQ').addEventListener('input', () => { clearTimeout(window.__lq); window.__lq = setTimeout(cargarLista, 300); });
    cargarLista();
  }

  async function cargarLista() {
    const status = $('fStatus') ? $('fStatus').value : '';
    const q = $('fQ') ? $('fQ').value.trim() : '';
    const head = `<thead><tr style="border-bottom:2px solid #e2e8f0;text-align:right">
      <th style="text-align:left;padding:7px">Folio</th><th style="text-align:left;padding:7px">Fecha</th>
      <th style="text-align:left;padding:7px">Tipo</th><th style="padding:7px">Ventas</th><th style="padding:7px">Gastos</th>
      <th style="padding:7px">Total kg</th><th style="padding:7px">Costo/kg</th>
      <th style="text-align:center;padding:7px">Estatus</th></tr></thead>`;
    try {
      const rows = data(await api('/integraciones' + qs({ status, q }))) || [];
      if (!rows.length) { $('tabla').innerHTML = head + '<tbody><tr><td colspan="8" style="text-align:center;padding:20px;color:var(--muted)">Sin integraciones. Crea una nueva.</td></tr></tbody>'; return; }
      const body = rows.map(r => `<tr style="border-bottom:1px solid #f1f5f9;text-align:right;cursor:pointer" data-id="${r.integracion_id}">
        <td style="text-align:left;padding:7px;font-weight:700">${esc(r.folio || '(sin folio)')}</td>
        <td style="text-align:left;padding:7px">${fechaSolo(r.fecha) || '—'}</td>
        <td style="text-align:left;padding:7px">${esc(r.tipo)}</td>
        <td style="padding:7px">${r.n_ventas}</td><td style="padding:7px">${r.n_gastos}</td>
        <td style="padding:7px">${r.total_kg != null ? fmtKg(r.total_kg) : '—'}</td>
        <td style="padding:7px">${r.costo_expo_kg != null ? fmtMon(r.costo_expo_kg) : '—'}</td>
        <td style="text-align:center;padding:7px">${statusChip(r.status)}</td></tr>`).join('');
      $('tabla').innerHTML = head + '<tbody>' + body + '</tbody>';
      $('tabla').querySelectorAll('tr[data-id]').forEach(tr => tr.addEventListener('click', () => openDetail(tr.dataset.id)));
    } catch (e) { KoguApi.toast(e.message, 'error'); }
  }

  function statusChip(s) {
    const map = {
      pendiente: ['#fef3c7', '#92400e', '● Pendiente'], borrador: ['#e5e7eb', '#374151', '○ Borrador'],
      finalizado: ['#dcfce7', '#166534', '✓ Finalizado'], cancelado: ['#fee2e2', '#991b1b', '✕ Cancelado'],
    };
    const m = map[s] || map.pendiente;
    return `<span class="chip" style="background:${m[0]};color:${m[1]};font-size:11px;font-weight:800;padding:2px 9px;border-radius:999px">${m[2]}</span>`;
  }

  async function nueva() {
    try {
      const hoy = new Date().toISOString().slice(0, 10);
      // Folio automático (NNN/YY) lo asigna el backend; queda editable en el detalle.
      const r = data(await api('/integraciones', { method: 'POST', body: JSON.stringify({ tipo: 'exportacion', fecha: hoy }) }));
      KoguApi.toast('Integración ' + (r.folio || '') + ' creada', 'success');
      openDetail(r.integracion_id);
    } catch (e) { KoguApi.toast(e.message, 'error'); }
  }

  // ════════════════════════════ DETALLE ════════════════════════════
  async function openDetail(id) {
    STATE = { view: 'detail', id };
    try {
      const d = data(await api('/integraciones/' + id));
      renderDetail(d);
    } catch (e) { KoguApi.toast(e.message, 'error'); renderList(); }
  }

  function renderDetail(d) {
    const it = d.integracion;
    const fin = it.status === 'finalizado';
    const ro = fin ? 'disabled' : '';
    c.innerHTML = `
<div class="card">
  <div class="row">
    <div><div class="eyebrow">Costo · Exportación</div><h2>Integración ${esc(it.folio || '(sin folio)')}</h2></div>
    <div style="display:flex;gap:8px;align-items:center">
      ${statusChip(it.status)}
      <button class="btn ghost" id="volverBtn">← Volver</button>
      ${fin ? '' : `<button class="btn ghost" id="calcBtn">▶ Calcular</button>`}
      ${fin
        ? `<button class="btn ghost" id="reabrirBtn">↩ Reabrir</button>`
        : `<button class="btn primary" id="finBtn" style="background:#16a34a">✓ Finalizar y publicar</button>`}
    </div>
  </div>
  <div class="grid-3" style="margin-top:14px;gap:12px">
    <div><label class="muted" style="font-size:12px;display:block">Folio</label><input class="input" id="cFolio" value="${esc(it.folio || '')}" ${ro}/></div>
    <div><label class="muted" style="font-size:12px;display:block">Fecha</label><input class="input" type="date" id="cFecha" value="${fechaSolo(it.fecha)}" ${ro}/></div>
    <div><label class="muted" style="font-size:12px;display:block">Tipo de cambio <span style="font-size:10px;color:#94a3b8">(de la factura)</span></label><input class="input" id="cTc" value="${it.tip_cam != null ? it.tip_cam : ''}" readonly style="background:#f8fafc"/></div>
    <div style="grid-column:span 2"><label class="muted" style="font-size:12px;display:block">Referencia</label><input class="input" id="cRef" value="${esc(it.referencia || '')}" ${ro}/></div>
    <div style="display:flex;align-items:flex-end">${fin ? '' : `<button class="btn ghost" id="delBtn" style="color:#991b1b">🗑 Eliminar</button>`}</div>
  </div>
  <div id="msg" style="display:none;margin-top:12px;padding:10px;border-radius:6px;font-size:13px"></div>
</div>

<div class="card" style="margin-top:14px">
  <div class="row"><h3 style="margin:0">Facturas Expo <span class="muted" style="font-weight:500;font-size:12px">· ventas de exportación (ERP)</span></h3>
    ${fin ? '' : `<button class="btn ghost" id="addVentaBtn">＋ Agregar venta (ERP)</button>`}</div>
  <div style="overflow-x:auto;margin-top:10px"><table class="table" id="tExpo" style="width:100%;font-size:12.5px;font-variant-numeric:tabular-nums"></table></div>
</div>

<div class="card" style="margin-top:14px">
  <div class="row"><h3 style="margin:0">Facturas de Gasto <span class="muted" style="font-weight:500;font-size:12px">· facturas de proveedor (ERP)</span></h3>
    ${fin ? '' : `<button class="btn ghost" id="addGastoBtn">＋ Agregar gasto (ERP)</button>`}</div>
  <div style="overflow-x:auto;margin-top:10px"><table class="table" id="tGasto" style="width:100%;font-size:12.5px;font-variant-numeric:tabular-nums"></table></div>
</div>

<div class="card" style="margin-top:14px">
  <div class="row"><div><h3 style="margin:0">Costo por categoría</h3>
    <span class="muted" style="font-size:12px">Σ importe de la categoría ÷ total kg = costo por kilo</span></div></div>
  <div id="totGrid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin-top:8px"></div>
  <div style="display:flex;align-items:center;justify-content:space-between;gap:14px;margin-top:14px;background:#0f172a;color:#fff;border-radius:12px;padding:14px 18px">
    <div><div style="font-size:12px;color:#94a3b8">Costo de exportación (Σ categorías)</div>
      <div style="font-size:26px;font-weight:800"><span id="rMxn">${fmtMon(it.costo_expo_kg)}</span> <span style="font-size:15px;color:#94a3b8">/kg</span></div></div>
    <div style="text-align:right"><div style="font-size:12px;color:#94a3b8">Total kg</div>
      <div style="font-size:20px;font-weight:800" id="rKg">${fmtKg(d.total_kg)}</div></div>
  </div>
  <div class="muted" style="font-size:12px;margin-top:8px">Al <strong>Finalizar</strong> se publica una fila por factura+lote en <code>cto_costos_exportacion</code> (costo/kg), que el motor de costo de ventas ya consume.</div>
</div>`;

    $('volverBtn').addEventListener('click', renderList);
    if ($('calcBtn')) $('calcBtn').addEventListener('click', () => calcular(it.integracion_id));
    if ($('finBtn')) $('finBtn').addEventListener('click', () => finalizar(it.integracion_id));
    if ($('reabrirBtn')) $('reabrirBtn').addEventListener('click', () => reabrir(it.integracion_id));
    if ($('delBtn')) $('delBtn').addEventListener('click', () => eliminar(it.integracion_id));
    if ($('addVentaBtn')) $('addVentaBtn').addEventListener('click', () => pickerVentas(it.integracion_id));
    if ($('addGastoBtn')) $('addGastoBtn').addEventListener('click', () => pickerGastos(it.integracion_id));
    // Guardado de cabecera (blur)
    if (!fin) {
      const patch = (field, el) => el && el.addEventListener('change', () => guardarCab(it.integracion_id, { [field]: el.value }));
      patch('folio', $('cFolio')); patch('fecha', $('cFecha')); patch('referencia', $('cRef'));
    }
    pintarExpo(d.ventas, fin, it.integracion_id);
    pintarGasto(d.gastos, fin, it.integracion_id);
    pintarTotales(d.categorias, d.total_kg);
  }

  function pintarExpo(rows, fin, id) {
    const head = `<thead><tr style="border-bottom:2px solid #e2e8f0;text-align:right">
      <th style="text-align:left;padding:6px">Factura</th><th style="text-align:left;padding:6px">Fecha</th>
      <th style="text-align:left;padding:6px">Cliente</th><th style="text-align:left;padding:6px">Producto</th>
      <th style="text-align:left;padding:6px">Clave</th><th style="text-align:left;padding:6px">Lote</th>
      <th style="padding:6px">Cantidad kg</th><th style="padding:6px">Precio/kg</th>
      <th style="padding:6px">Costo/kg</th><th style="padding:6px">USD</th><th style="padding:6px">%</th>${fin ? '' : '<th></th>'}</tr></thead>`;
    if (!rows.length) { $('tExpo').innerHTML = head + `<tbody><tr><td colspan="${fin ? 11 : 12}" style="text-align:center;padding:16px;color:var(--muted)">Sin ventas. Agrega desde el ERP.</td></tr></tbody>`; return; }
    let totKg = 0;
    const body = rows.map(r => { totKg += Number(r.cantidad_kg) || 0; return `<tr style="border-bottom:1px solid #f1f5f9;text-align:right">
      <td style="text-align:left;padding:6px;font-weight:700">${esc(r.no_fac || '')}</td>
      <td style="text-align:left;padding:6px">${fechaSolo(r.fecha)}</td>
      <td style="text-align:left;padding:6px">${esc(r.nom_cte || '')}</td>
      <td style="text-align:left;padding:6px">${esc(r.desc_prod || '')}</td>
      <td style="text-align:left;padding:6px">${esc(r.cve_prod || '')}</td>
      <td style="text-align:left;padding:6px">${esc(r.lote || '')}</td>
      <td style="padding:6px">${fmt2(r.cantidad_kg)}</td>
      <td style="padding:6px">${r.precio_kg != null ? fmt2(r.precio_kg) : '—'}</td>
      <td style="padding:6px">${r.costo_kg_mxn != null ? '<span style="background:#f0fdfa;color:#0f766e;font-weight:700;border-radius:6px;padding:1px 6px">' + fmt2(r.costo_kg_mxn) + '</span>' : '—'}</td>
      <td style="padding:6px">${r.costo_usd != null ? fmt2(r.costo_usd) : '—'}</td>
      <td style="padding:6px">${fmtPct(r.porcentaje)}</td>
      ${fin ? '' : `<td style="padding:6px"><button class="btn ghost" style="color:#991b1b;padding:2px 7px" data-ev="${r.ev_id}">✕</button></td>`}</tr>`; }).join('');
    const foot = `<tfoot><tr style="background:#f8fafc;font-weight:800;border-top:1px solid #e2e8f0">
      <td style="text-align:left;padding:7px" colspan="6">Total</td>
      <td style="text-align:right;padding:7px">${fmt2(totKg)}</td><td colspan="${fin ? 4 : 5}"></td></tr></tfoot>`;
    $('tExpo').innerHTML = head + '<tbody>' + body + '</tbody>' + foot;
    if (!fin) $('tExpo').querySelectorAll('button[data-ev]').forEach(btn => btn.addEventListener('click', () => delVenta(id, btn.dataset.ev)));
  }

  function pintarGasto(rows, fin, id) {
    const head = `<thead><tr style="border-bottom:2px solid #e2e8f0;text-align:right">
      <th style="text-align:left;padding:6px">Folio factura</th><th style="text-align:left;padding:6px">Proveedor</th>
      <th style="text-align:left;padding:6px">Clave</th><th style="text-align:left;padding:6px">Categoría</th>
      <th style="text-align:left;padding:6px">Fecha</th><th style="padding:6px">Importe MXN</th>${fin ? '' : '<th></th>'}</tr></thead>`;
    if (!rows.length) { $('tGasto').innerHTML = head + `<tbody><tr><td colspan="${fin ? 6 : 7}" style="text-align:center;padding:16px;color:var(--muted)">Sin gastos. Agrega desde el ERP.</td></tr></tbody>`; return; }
    let tot = 0;
    const body = rows.map(r => { tot += Number(r.importe) || 0;
      const sel = fin
        ? esc(r.categoria_nombre || '(sin categoría)')
        : `<select class="input" data-eg="${r.eg_id}" style="padding:4px 6px;font-size:12px;min-width:170px">
            <option value="">(sin categoría)</option>
            ${CATS.map(cat => `<option value="${cat.categoria_id}" ${cat.categoria_id === r.categoria_id ? 'selected' : ''}>${esc(cat.nombre)}</option>`).join('')}
          </select>`;
      const warn = !r.categoria_id ? ' <span style="color:#b45309;font-size:11px">⚠</span>' : '';
      return `<tr style="border-bottom:1px solid #f1f5f9;text-align:right">
      <td style="text-align:left;padding:6px;font-weight:700">${esc(r.folio_factura || '')}</td>
      <td style="text-align:left;padding:6px">${esc(r.proveedor || '')}</td>
      <td style="text-align:left;padding:6px">${esc(r.clave || '')}</td>
      <td style="text-align:left;padding:6px">${sel}${warn}</td>
      <td style="text-align:left;padding:6px">${fechaSolo(r.fecha_fac)}</td>
      <td style="padding:6px">${fmtMon(r.importe)}</td>
      ${fin ? '' : `<td style="padding:6px"><button class="btn ghost" style="color:#991b1b;padding:2px 7px" data-eg="${r.eg_id}">✕</button></td>`}</tr>`; }).join('');
    const foot = `<tfoot><tr style="background:#f8fafc;font-weight:800;border-top:1px solid #e2e8f0">
      <td style="text-align:left;padding:7px" colspan="5">Total gastos</td>
      <td style="text-align:right;padding:7px">${fmtMon(tot)}</td>${fin ? '' : '<td></td>'}</tr></tfoot>`;
    $('tGasto').innerHTML = head + '<tbody>' + body + '</tbody>' + foot;
    if (!fin) {
      $('tGasto').querySelectorAll('select[data-eg]').forEach(s => s.addEventListener('change', () => setCategoria(id, s.dataset.eg, s.value)));
      $('tGasto').querySelectorAll('button[data-eg]').forEach(btn => btn.addEventListener('click', () => delGasto(id, btn.dataset.eg)));
    }
  }

  function pintarTotales(cats, totalKg) {
    const chip = (a) => a === 'nacional' ? '<span style="background:#dbeafe;color:#1e40af;border-radius:6px;padding:1px 6px;font-size:10px;font-weight:800">NAL</span>'
      : a === 'internacional' ? '<span style="background:#fae8ff;color:#86198f;border-radius:6px;padding:1px 6px;font-size:10px;font-weight:800">INT</span>' : '';
    // Previsualiza el costo/kg total en vivo (Σ gastos categorizados ÷ total kg),
    // sin esperar a Calcular. Al Calcular se persiste el mismo número.
    const rMxn = $('rMxn');
    if (rMxn) {
      const totCat = (cats || []).reduce((s, c) => s + (Number(c.suma) || 0), 0);
      const kg = Number(totalKg) || 0;
      rMxn.textContent = fmtMon(kg > 0 ? totCat / kg : 0);
    }
    if (!cats || !cats.length) { $('totGrid').innerHTML = '<div class="muted" style="font-size:13px">Sin gastos categorizados aún.</div>'; return; }
    $('totGrid').innerHTML = cats.map(c => {
      const on = (Number(c.suma) || 0) > 0;
      const nombre = c.nombre || '(sin categoría)';
      return `<div style="border:1px solid ${on ? '#bbf7d0' : '#e2e8f0'};border-radius:10px;padding:10px 12px;background:${on ? '#f0fdf4' : '#f8fafc'}">
        <div style="font-size:12px;font-weight:700;display:flex;justify-content:space-between;align-items:center"><span>${esc(nombre)} ${chip(c.ambito)}</span></div>
        <div style="display:flex;justify-content:space-between;margin-top:6px;font-size:12px"><span class="muted">Suma</span><span style="font-weight:800">${fmtMon(c.suma)}</span></div>
        <div style="display:flex;justify-content:space-between;margin-top:2px;font-size:12px"><span class="muted">Costo x kilo</span><span style="font-weight:800;color:#166534">${fmtMon(c.costo_x_kilo)}</span></div>
      </div>`;
    }).join('');
  }

  function showMsg(html, tipo) {
    const m = $('msg'); if (!m) return;
    const bg = tipo === 'error' ? '#fee2e2' : tipo === 'warn' ? '#fef9c3' : '#dcfce7';
    const co = tipo === 'error' ? '#991b1b' : tipo === 'warn' ? '#854d0e' : '#166534';
    m.style.cssText = `display:block;margin-top:12px;padding:10px;border-radius:6px;font-size:13px;background:${bg};color:${co}`;
    m.innerHTML = html;
  }

  // ── Acciones ──
  async function guardarCab(id, patch) {
    try { await api('/integraciones/' + id, { method: 'PATCH', body: JSON.stringify(patch) }); }
    catch (e) { KoguApi.toast(e.message, 'error'); }
  }
  async function calcular(id) {
    try { const r = data(await api('/integraciones/' + id + '/calcular', { method: 'POST', body: '{}' }));
      if (r.gastos_sin_categoria > 0) showMsg(`Calculado. ⚠ ${r.gastos_sin_categoria} gasto(s) sin categoría no entran al costo.`, 'warn');
      else showMsg(`✅ Calculado: costo ${fmtMon(r.costo_expo_kg)}/kg sobre ${fmtKg(r.total_kg)}.`, 'ok');
      openDetail(id);
    } catch (e) { KoguApi.toast(e.message, 'error'); }
  }
  async function finalizar(id) {
    if (!confirm('¿Finalizar y publicar al costo de ventas? Quedará bloqueada (puedes reabrirla después).')) return;
    try { const r = data(await api('/integraciones/' + id + '/finalizar', { method: 'POST', body: '{}' }));
      KoguApi.toast(`Publicado: ${r.filas_publicadas} renglones · ${fmtMon(r.costo_expo_kg)}/kg`, 'success');
      openDetail(id);
    } catch (e) { KoguApi.toast(e.message, 'error'); }
  }
  async function reabrir(id) {
    if (!confirm('¿Reabrir? Se despublicará del costo de ventas hasta volver a finalizar.')) return;
    try { await api('/integraciones/' + id + '/reabrir', { method: 'POST', body: '{}' });
      KoguApi.toast('Integración reabierta', 'success'); openDetail(id);
    } catch (e) { KoguApi.toast(e.message, 'error'); }
  }
  async function eliminar(id) {
    if (!confirm('¿Eliminar esta integración?')) return;
    try { await api('/integraciones/' + id, { method: 'DELETE' }); KoguApi.toast('Eliminada', 'success'); renderList(); }
    catch (e) { KoguApi.toast(e.message, 'error'); }
  }
  async function delVenta(id, evId) {
    try { await api('/integraciones/' + id + '/ventas/' + evId, { method: 'DELETE' }); openDetail(id); }
    catch (e) { KoguApi.toast(e.message, 'error'); }
  }
  async function delGasto(id, egId) {
    try { await api('/integraciones/' + id + '/gastos/' + egId, { method: 'DELETE' }); openDetail(id); }
    catch (e) { KoguApi.toast(e.message, 'error'); }
  }
  async function setCategoria(id, egId, categoriaId) {
    try { await api('/integraciones/' + id + '/gastos/' + egId, { method: 'PATCH', body: JSON.stringify({ categoria_id: categoriaId || null }) }); openDetail(id); }
    catch (e) { KoguApi.toast(e.message, 'error'); }
  }

  // ── Pickers ERP (modal) ──
  function modal(titulo, subtitulo) {
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.45);display:flex;align-items:flex-start;justify-content:center;z-index:9999;padding-top:7vh';
    ov.innerHTML = `<div class="card" style="width:860px;max-width:94vw;max-height:78vh;display:flex;flex-direction:column;margin:0">
      <div class="row"><div><h3 style="margin:0">${esc(titulo)}</h3><div class="muted" style="font-size:11px">${esc(subtitulo)}</div></div><button class="btn ghost" id="mX" type="button">✕</button></div>
      <input type="text" id="mQ" class="input" placeholder="Buscar…" style="margin-top:10px"/>
      <div id="mList" style="margin-top:10px;overflow:auto;flex:1"></div></div>`;
    document.body.appendChild(ov);
    const close = () => ov.remove();
    ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
    ov.querySelector('#mX').addEventListener('click', close);
    return { ov, close, q: ov.querySelector('#mQ'), list: ov.querySelector('#mList') };
  }

  function pickerVentas(id) {
    const { close, q, list } = modal('Selecciona ventas de exportación', 'ERP · Ventas · filtro cve_iva = EXT');
    async function buscar() {
      try {
        const rows = data(await api('/picker/ventas' + qs({ integracion_id: id, q: q.value.trim() }))) || [];
        if (!rows.length) { list.innerHTML = '<div class="muted" style="padding:12px;text-align:center">Sin ventas de exportación.</div>'; return; }
        list.innerHTML = `<table style="width:100%;font-size:12px;border-collapse:collapse"><thead><tr style="text-align:left;border-bottom:1px solid #e2e8f0">
          <th style="padding:6px">Factura</th><th style="padding:6px">Fecha</th><th style="padding:6px">Cliente</th><th style="padding:6px">Clave</th><th style="padding:6px">Lote</th><th style="padding:6px;text-align:right">Cantidad</th><th></th></tr></thead><tbody>${
          rows.map((r, i) => `<tr style="border-bottom:1px solid #f1f5f9">
            <td style="padding:6px;font-weight:700">${esc(r.no_fac || '')}</td><td style="padding:6px">${fechaSolo(r.fecha)}</td>
            <td style="padding:6px">${esc(r.nom_cte || '')}</td><td style="padding:6px">${esc(r.cve_prod || '')}</td>
            <td style="padding:6px">${esc(r.lote || '')}</td><td style="padding:6px;text-align:right">${fmt2(r.cantidad_kg)}</td>
            <td style="padding:6px;text-align:right"><button class="btn ghost" style="padding:2px 9px;color:#0e7490" data-i="${i}">＋ Agregar</button></td></tr>`).join('')
          }</tbody></table>`;
        list.querySelectorAll('button[data-i]').forEach(btn => btn.addEventListener('click', async () => {
          const r = rows[+btn.dataset.i]; btn.disabled = true;
          try {
            await api('/integraciones/' + id + '/ventas', { method: 'POST', body: JSON.stringify({
              erp_venta_id: r.venta_id, no_fac: r.no_fac, fecha: r.fecha, cve_cte: r.cve_cte, nom_cte: r.nom_cte,
              cve_prod: r.cve_prod, desc_prod: r.desc_prod, lote: r.lote, cantidad_kg: r.cantidad_kg,
              precio_kg: r.precio_kg, cve_mon: r.cve_mon, tip_cam: r.tip_cam,
            }) });
            // TC de la integración = TC de la factura (si aún no está fijado)
            const cTc = $('cTc'); if (cTc && !cTc.value && r.tip_cam != null) await guardarCab(id, { tip_cam: r.tip_cam });
            buscar();
          } catch (e) { KoguApi.toast(e.message, 'error'); btn.disabled = false; }
        }));
      } catch (e) { list.innerHTML = `<div style="padding:12px;color:#991b1b">${esc(e.message)}</div>`; }
    }
    q.addEventListener('input', () => { clearTimeout(window.__pv); window.__pv = setTimeout(buscar, 300); });
    const origClose = close; q._close = origClose;
    q.focus(); buscar();
    // refrescar detalle al cerrar
    q.closest('.card').querySelector('#mX').addEventListener('click', () => openDetail(id));
    q.closest('div[style*="inset"]')?.addEventListener('click', (e) => { if (e.target === e.currentTarget) openDetail(id); });
  }

  function pickerGastos(id) {
    const { q, list } = modal('Selecciona factura de gasto', 'ERP · Compras · facturas de proveedor');
    async function buscar() {
      try {
        const rows = data(await api('/picker/gastos' + qs({ integracion_id: id, q: q.value.trim() }))) || [];
        if (!rows.length) { list.innerHTML = '<div class="muted" style="padding:12px;text-align:center">Sin facturas de compra.</div>'; return; }
        list.innerHTML = `<table style="width:100%;font-size:12px;border-collapse:collapse"><thead><tr style="text-align:left;border-bottom:1px solid #e2e8f0">
          <th style="padding:6px">Folio</th><th style="padding:6px">Fecha</th><th style="padding:6px">Proveedor</th><th style="padding:6px">Clave</th><th style="padding:6px">Concepto</th><th style="padding:6px;text-align:right">Importe</th><th></th></tr></thead><tbody>${
          rows.map((r, i) => `<tr style="border-bottom:1px solid #f1f5f9">
            <td style="padding:6px;font-weight:700">${esc(r.folio_factura || '')}</td><td style="padding:6px">${fechaSolo(r.fecha_fac)}</td>
            <td style="padding:6px">${esc(r.proveedor || '')}</td><td style="padding:6px">${esc(r.clave || '')}</td>
            <td style="padding:6px">${esc(r.concepto || '')}</td>
            <td style="padding:6px;text-align:right">${fmtMon(r.importe)}</td>
            <td style="padding:6px;text-align:right"><button class="btn ghost" style="padding:2px 9px;color:#0e7490" data-i="${i}">＋ Agregar</button></td></tr>`).join('')
          }</tbody></table>`;
        list.querySelectorAll('button[data-i]').forEach(btn => btn.addEventListener('click', async () => {
          const r = rows[+btn.dataset.i]; btn.disabled = true;
          try {
            await api('/integraciones/' + id + '/gastos', { method: 'POST', body: JSON.stringify({
              erp_compra_id: r.compra_id, folio_factura: r.folio_factura, clave: r.clave,
              proveedor: r.proveedor, fecha_fac: r.fecha_fac, importe: r.importe, cve_mon: r.cve_mon,
            }) });
            KoguApi.toast('Gasto agregado: ' + (r.folio_factura || ''), 'success');
            buscar();
          } catch (e) { KoguApi.toast(e.message, 'error'); btn.disabled = false; }
        }));
      } catch (e) { list.innerHTML = `<div style="padding:12px;color:#991b1b">${esc(e.message)}</div>`; }
    }
    q.addEventListener('input', () => { clearTimeout(window.__pg); window.__pg = setTimeout(buscar, 300); });
    q.focus(); buscar();
    q.closest('.card').querySelector('#mX').addEventListener('click', () => openDetail(id));
    q.closest('div[style*="inset"]')?.addEventListener('click', (e) => { if (e.target === e.currentTarget) openDetail(id); });
  }

  // ── Init ──
  await loadCategorias();
  renderList();
  KoguShell.subscribeEmpresaActivaChange(() => { loadCategorias(); renderList(); });
});

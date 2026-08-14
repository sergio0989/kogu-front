// ============================================================
// costeo-teorico.js — Comercio Exterior (comex_): Costeo teórico de importación.
// Un producto por costeo · conceptos por capa de incoterm (EXW/CFR/DDP) ·
// multi-escenario de arancel · versionado inmutable · duplicar · responsables.
// Motor de cálculo en cliente (instantáneo) + persistencia contra /protected/comex.
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/comex/costeo-teorico.html';
  const PERM = 'screen.comex';
  const BASE = '/protected/comex/costeo';

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Costeo teórico (importación)',
    description: 'Costea una importación por capa de incoterm y compáralo después con el costo real.',
    requiredPermission: PERM,
  });
  if (!b) return;

  const $ = (id) => document.getElementById(id);
  const c = $('pageContent');
  const money = (v) => '$' + (Number(v) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const n2 = (v) => (Number(v) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const fdate = (v) => v ? String(v).slice(0, 10) : '';

  const api = (p, o) => KoguApi.apiFetch(BASE + p, o);
  const data = (r) => KoguApi.unwrapData(r);
  const qs = (o) => { const p = Object.entries(o || {}).filter(([, v]) => v != null && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(v)}`); return p.length ? '?' + p.join('&') : ''; };
  const debTimers = {};
  const deb = (key, fn, ms = 500) => { clearTimeout(debTimers[key]); debTimers[key] = setTimeout(fn, ms); };

  const MODOS = { usd_fijo: 'USD fijo', mxn_fijo: 'MXN fijo', usd_kg: 'USD/kg', mxn_kg: 'MXN/kg', pct_base: '% s/aduana' };
  // modo_captura ↔ (base, moneda): base=fijo|kg|pct · moneda=USD|MXN
  const modoToBaseMon = (m) => m === 'pct_base' ? { base: 'pct', mon: '—' } : { base: m.endsWith('_kg') ? 'kg' : 'fijo', mon: m.startsWith('mxn') ? 'MXN' : 'USD' };
  const baseMonToModo = (base, mon) => base === 'pct' ? 'pct_base' : (mon === 'MXN' ? 'mxn' : 'usd') + (base === 'kg' ? '_kg' : '_fijo');
  const capaTag = (c) => `<span class="chip" style="background:${c === 'exw' ? '#ede9fe;color:#5b21b6' : c === 'cfr' ? '#cffafe;color:#0e7490' : '#dcfce7;color:#166534'};font-size:10px;font-weight:800;padding:1px 7px;border-radius:6px">${c.toUpperCase()}</span>`;

  let CATS = [];       // catálogo de conceptos
  let D = null;        // detalle en memoria
  let collapsed = { cfr: false, ddp: false };  // secciones plegables por capa

  // ── Motor (idéntico al backend) ──
  function importeUSD(x, tc, kg) {
    const v = Number(x.valor_captura) || 0;
    switch (x.modo_captura) {
      case 'usd_fijo': return v; case 'mxn_fijo': return tc > 0 ? v / tc : 0;
      case 'usd_kg': return v * kg; case 'mxn_kg': return tc > 0 ? v * kg / tc : 0;
      case 'pct_base': return 0; default: return 0;
    }
  }
  function calcular() {
    const cab = D.costeo, tc = Number(cab.tip_cam) || 0, kg = Number(cab.kg) || 0, exw = Number(cab.costo_unit_exw) || 0;
    const exwTotal = exw * kg;
    const cfr = D.conceptos.filter(x => x.capa_incoterm === 'cfr' && !x.es_arancel);
    const ddp = D.conceptos.filter(x => x.capa_incoterm === 'ddp' && !x.es_arancel);
    const sumCfr = cfr.reduce((a, x) => a + importeUSD(x, tc, kg), 0);
    const sumDdp = ddp.reduce((a, x) => a + importeUSD(x, tc, kg), 0);
    const base = exwTotal + sumCfr;
    const escs = D.escenarios.map(e => {
      const pct = Number(e.arancel_pct) || 0, ar = base * pct / 100;
      const tot = exwTotal + sumCfr + ar + sumDdp, ddpKg = kg > 0 ? tot / kg : 0;
      return { ...e, arancel: ar, total: tot, ddp_kg: ddpKg, ddp_kg_mxn: ddpKg * tc, factor: exw > 0 ? ddpKg / exw : 0 };
    });
    return { tc, kg, exwUnit: exw, exwTotal, base, cfr_kg: kg > 0 ? base / kg : 0, escs };
  }

  async function loadCats() { try { CATS = data(await api('/conceptos')) || []; } catch (_e) { CATS = []; } }

  // ════════════════════ LISTA ════════════════════
  function renderList() {
    D = null;
    c.innerHTML = `
<div class="card">
  <div class="row">
    <div><div class="eyebrow">Comercio Exterior · Importación</div><h2>Costeo teórico</h2>
      <div class="muted" style="font-size:12px">Un costeo por producto: conceptos por incoterm (EXW/CFR/DDP), escenarios de arancel y versiones.</div></div>
    <div style="display:flex;gap:8px;align-items:flex-end">
      <div><label class="muted" style="font-size:12px;display:block">Buscar</label><input id="fQ" class="input" placeholder="Folio, producto u origen" style="width:200px"/></div>
      <button class="btn primary" id="nuevaBtn" style="background:#0891b2">＋ Nuevo costeo</button>
    </div>
  </div>
  <div style="overflow-x:auto;margin-top:12px"><table class="table" id="tabla" style="width:100%;font-size:13px;font-variant-numeric:tabular-nums"></table></div>
</div>`;
    $('nuevaBtn').addEventListener('click', nueva);
    $('fQ').addEventListener('input', () => deb('lq', cargarLista, 300));
    cargarLista();
  }
  async function cargarLista() {
    const q = $('fQ') ? $('fQ').value.trim() : '';
    const head = `<thead><tr style="border-bottom:2px solid #e2e8f0;text-align:right">
      <th style="text-align:left;padding:7px">Folio</th><th style="text-align:left;padding:7px">Fecha</th>
      <th style="text-align:left;padding:7px">Producto</th><th style="text-align:left;padding:7px">Origen</th>
      <th style="text-align:left;padding:7px">Transporte</th><th>KGS</th><th>EXW USD/kg</th><th>Versión</th></tr></thead>`;
    try {
      const rows = data(await api('/costeos' + qs({ q }))) || [];
      if (!rows.length) { $('tabla').innerHTML = head + '<tbody><tr><td colspan="8" style="text-align:center;padding:20px;color:var(--muted)">Sin costeos. Crea uno nuevo.</td></tr></tbody>'; return; }
      $('tabla').innerHTML = head + '<tbody>' + rows.map(r => `<tr style="border-bottom:1px solid #f1f5f9;text-align:right;cursor:pointer" data-id="${r.costeo_id}">
        <td style="text-align:left;padding:7px;font-weight:700">${esc(r.folio || '(sin folio)')}</td>
        <td style="text-align:left;padding:7px">${fdate(r.fecha) || '—'}</td>
        <td style="text-align:left;padding:7px">${esc(r.cve_prod || '')} ${esc(r.desc_prod || '')}</td>
        <td style="text-align:left;padding:7px">${esc(r.origen_proveedor || '—')}</td>
        <td style="text-align:left;padding:7px">${esc(r.modo_transporte)}</td>
        <td style="padding:7px">${n2(r.kg)}</td><td style="padding:7px">${money(r.costo_unit_exw)}</td>
        <td style="padding:7px">v${r.version_actual}</td></tr>`).join('') + '</tbody>';
      $('tabla').querySelectorAll('tr[data-id]').forEach(tr => tr.addEventListener('click', () => openDetail(tr.dataset.id)));
    } catch (e) { KoguApi.toast(e.message, 'error'); }
  }

  async function nueva() {
    pickerProducto(async (p) => {
      try {
        const hoy = new Date().toISOString().slice(0, 10);
        const r = data(await api('/costeos', { method: 'POST', body: JSON.stringify({ producto_id: p.producto_id, cve_prod: p.cve_prod, desc_prod: p.nombre_corto, fecha: hoy }) }));
        KoguApi.toast('Costeo ' + (r.folio || '') + ' creado', 'success');
        openDetail(r.costeo_id);
      } catch (e) { KoguApi.toast(e.message, 'error'); }
    });
  }

  // ════════════════════ DETALLE ════════════════════
  async function openDetail(id) {
    try { D = data(await api('/costeos/' + id)); renderDetail(); }
    catch (e) { KoguApi.toast(e.message, 'error'); renderList(); }
  }

  function renderDetail() {
    const it = D.costeo;
    c.innerHTML = `
<div class="card">
  <div class="row">
    <div><div class="eyebrow">Comercio Exterior · Importación</div><h2>Costeo ${esc(it.folio || '')}</h2>
      <div class="muted" style="font-size:12px">${esc(it.cve_prod || '')} · ${esc(it.desc_prod || '')}</div></div>
    <div style="display:flex;gap:8px;align-items:center">
      <span class="chip" style="background:#ede9fe;color:#5b21b6;font-weight:800;padding:3px 10px;border-radius:999px">v${it.version_actual} · vigente</span>
      <button class="btn ghost" id="volverBtn">← Volver</button>
      <button class="btn ghost" id="histBtn">🕑 Historial</button>
      <button class="btn ghost" id="dupBtn">⎘ Duplicar</button>
      <button class="btn" id="saveBtn" style="border-color:#0891b2;color:#0e7490;font-weight:700">💾 Guardar datos</button>
      <button class="btn primary" id="verBtn" style="background:#0891b2">🔖 Guardar versión</button>
    </div>
  </div>
  <div class="grid-3" style="margin-top:14px;gap:12px">
    <div><label class="muted" style="font-size:12px;display:block">Folio</label><input class="input" id="cFolio" value="${esc(it.folio || '')}"/></div>
    <div><label class="muted" style="font-size:12px;display:block">Fecha</label><input class="input" type="date" id="cFecha" value="${fdate(it.fecha)}"/></div>
    <div><label class="muted" style="font-size:12px;display:block">Transporte</label>
      <select class="input" id="cTrans">${['general', 'aereo', 'maritimo', 'terrestre'].map(t => `<option value="${t}" ${t === it.modo_transporte ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
    <div style="grid-column:span 2"><label class="muted" style="font-size:12px;display:block">Origen / proveedor</label>
      <div style="display:flex;gap:6px">
        <input class="input" id="cOrig" value="${esc(it.origen_proveedor || '')}" readonly placeholder="(selecciona del catálogo)" style="flex:1;background:#f8fafc;cursor:pointer"/>
        <button class="btn ghost" id="cOrigBtn" type="button" title="Buscar proveedor">🔍</button>
      </div></div>
    <div><label class="muted" style="font-size:12px;display:block">Tipo de cambio</label><input class="input" id="cTc" value="${it.tip_cam != null ? it.tip_cam : ''}"/></div>
    <div><label class="muted" style="font-size:12px;display:block">KGS a importar</label><input class="input" id="cKg" value="${it.kg != null ? it.kg : ''}"/></div>
    <div><label class="muted" style="font-size:12px;display:block">Costo unit EXW (USD/kg)</label><input class="input" id="cExw" value="${it.costo_unit_exw != null ? it.costo_unit_exw : ''}"/></div>
  </div>
  <div style="margin-top:12px" id="respBox"></div>
  <div id="histBox" style="display:none;margin-top:10px"></div>
</div>

<div class="card" style="margin-top:14px">
  <div class="row"><div><h3 style="margin:0">Conceptos de costo</h3><span class="muted" style="font-size:12px">capa de incoterm + modo de captura</span></div>
    <button class="btn ghost" id="addConcBtn">＋ Agregar concepto</button></div>
  <div style="overflow-x:auto;margin-top:10px"><table id="tConc" style="width:100%;font-size:12.5px;font-variant-numeric:tabular-nums"></table></div>
</div>

<div class="card" style="margin-top:14px">
  <div class="row"><div><h3 style="margin:0">Escenarios de arancel</h3><span class="muted" style="font-size:12px">arancel sobre el valor en aduana (EXW + flete int'l + gastos origen)</span></div>
    <button class="btn ghost" id="addEscBtn">＋ Escenario</button></div>
  <div id="escGrid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px;margin-top:8px"></div>
  <div style="margin-top:14px"><div class="muted" style="font-size:11px;font-weight:700;margin-bottom:4px">Escalera de incoterm (por kg · USD, sin arancel) · % = participación de cada tramo en el DDP</div>
    <div id="ladder" style="display:flex;gap:8px;flex-wrap:wrap"></div></div>
</div>`;

    $('volverBtn').addEventListener('click', renderList);
    $('dupBtn').addEventListener('click', duplicar);
    $('saveBtn').addEventListener('click', guardarDatos);
    $('verBtn').addEventListener('click', guardarVersion);
    $('histBtn').addEventListener('click', toggleHist);
    $('addConcBtn').addEventListener('click', addConcepto);
    $('addEscBtn').addEventListener('click', addEscenario);
    // cabecera → persistir + recalc
    const bindCab = (id, field, num) => $(id).addEventListener('input', () => {
      D.costeo[field] = num ? (parseFloat($(id).value) || 0) : $(id).value;
      if (['tip_cam', 'kg', 'costo_unit_exw'].includes(field)) updateComputed();
      deb('cab_' + field, () => patchCab({ [field]: D.costeo[field] }));
    });
    bindCab('cFolio', 'folio'); bindCab('cFecha', 'fecha');
    bindCab('cTc', 'tip_cam', true); bindCab('cKg', 'kg', true); bindCab('cExw', 'costo_unit_exw', true);
    // Origen/proveedor = selector del catálogo de proveedores
    const selProv = () => pickerProveedor((p) => {
      D.costeo.proveedor_id = p.proveedor_id; D.costeo.origen_proveedor = p.nombre;
      $('cOrig').value = p.nombre; patchCab({ proveedor_id: p.proveedor_id, origen_proveedor: p.nombre });
    });
    $('cOrig').addEventListener('click', selProv);
    $('cOrigBtn').addEventListener('click', selProv);
    $('cTrans').addEventListener('change', () => { D.costeo.modo_transporte = $('cTrans').value; patchCab({ modo_transporte: D.costeo.modo_transporte }); });

    renderResp(); renderConceptos(); renderResultados();
  }

  function renderResp() {
    const chips = (D.responsables || []).map(r => `<span class="chip" style="background:#eef2ff;color:#3730a3;border-radius:999px;padding:3px 10px;font-size:12px;font-weight:700;margin-right:6px">
      ${esc(r.nombre || r.email)} <span style="cursor:pointer;color:#6366f1" data-u="${r.user_id}">✕</span></span>`).join('');
    $('respBox').innerHTML = `<span class="muted" style="font-size:11px;font-weight:700">Responsables / seguidores:</span> ${chips || '<span class="muted" style="font-size:12px">ninguno</span>'} <button class="btn ghost" id="addRespBtn" style="padding:3px 9px;font-size:12px">＋ Agregar</button>`;
    $('addRespBtn').addEventListener('click', () => pickerUsuario(async (u) => {
      try { await api('/costeos/' + D.costeo.costeo_id + '/responsables', { method: 'POST', body: JSON.stringify({ user_id: u.user_id, rol: 'seguidor' }) }); openDetail(D.costeo.costeo_id); }
      catch (e) { KoguApi.toast(e.message, 'error'); }
    }));
    $('respBox').querySelectorAll('span[data-u]').forEach(x => x.addEventListener('click', async () => {
      try { await api('/costeos/' + D.costeo.costeo_id + '/responsables/' + x.dataset.u, { method: 'DELETE' }); openDetail(D.costeo.costeo_id); }
      catch (e) { KoguApi.toast(e.message, 'error'); }
    }));
  }

  function renderConceptos() {
    const r = calcular();
    const head = `<thead><tr style="border-bottom:2px solid #e2e8f0;text-align:right">
      <th style="text-align:left;padding:6px">Concepto</th><th style="text-align:left;padding:6px">Capa</th>
      <th style="text-align:left;padding:6px">Base</th><th style="text-align:left;padding:6px">Moneda</th><th>Captura</th><th>Importe USD</th><th></th></tr></thead>`;
    const iSt = 'border:1px solid var(--line);border-radius:6px;padding:3px 5px;font-size:11px';
    const rowHtml = (x, i) => {
      const bm = modoToBaseMon(x.modo_captura);
      const imp = x.es_arancel ? null : importeUSD(x, r.tc, r.kg);
      const baseCell = x.es_arancel ? '<span class="muted">% s/aduana</span>'
        : `<select class="cbase" data-i="${i}" style="${iSt}"><option value="fijo" ${bm.base === 'fijo' ? 'selected' : ''}>Fijo</option><option value="kg" ${bm.base === 'kg' ? 'selected' : ''}>Por kg</option></select>`;
      const monCell = x.es_arancel ? '<span class="muted">—</span>'
        : `<select class="cmon" data-i="${i}" style="${iSt}"><option value="USD" ${bm.mon === 'USD' ? 'selected' : ''}>USD</option><option value="MXN" ${bm.mon === 'MXN' ? 'selected' : ''}>MXN</option></select>`;
      const capCell = x.es_arancel ? '<span class="muted">por escenario</span>'
        : `<input class="cval" data-i="${i}" value="${x.valor_captura}" style="width:92px;text-align:right;border:1px solid var(--line);border-radius:6px;padding:3px 6px;font-size:12px"/>`;
      return `<tr style="border-bottom:1px solid #f1f5f9">
        <td style="text-align:left;padding:6px 6px 6px 24px">${esc(x.nombre || '')}</td>
        <td style="padding:6px">${capaTag(x.capa_incoterm)}</td>
        <td style="text-align:left;padding:6px">${baseCell}</td>
        <td style="text-align:left;padding:6px">${monCell}</td>
        <td style="text-align:right;padding:6px">${capCell}</td>
        <td style="text-align:right;padding:6px" id="cImp${i}">${imp == null ? '—' : money(imp)}</td>
        <td style="padding:6px"><button class="btn ghost cdel" data-i="${i}" style="color:#991b1b;padding:2px 7px">✕</button></td></tr>`;
    };
    const grp = (g, label, n, sum, coll) => `<tr class="grp" data-g="${g}" style="cursor:pointer;background:#eef2f7"><td style="padding:7px" colspan="2"><span style="font-weight:800;color:#334155">${coll ? '▸' : '▾'} ${label}</span> <span class="muted" style="font-size:11px">· ${n} conceptos${coll ? ' (contraído)' : ''}</span></td><td colspan="3"></td><td style="text-align:right;padding:7px;font-weight:800;color:#475569" id="cGrp${g}">${money(sum)}</td><td></td></tr>`;
    const cfrItems = D.conceptos.map((x, i) => ({ x, i })).filter(o => o.x.capa_incoterm === 'cfr');
    const ddpItems = D.conceptos.map((x, i) => ({ x, i })).filter(o => o.x.capa_incoterm === 'ddp');
    const ddpSum = ddpItems.reduce((a, o) => a + (o.x.es_arancel ? 0 : importeUSD(o.x, r.tc, r.kg)), 0);
    let body = `<tr style="background:#f0f9ff;font-weight:800"><td style="text-align:left;padding:6px">Valor EXW (mercancía)</td><td style="padding:6px">${capaTag('exw')}</td><td class="muted" style="text-align:left;padding:6px" id="cExwDesc" colspan="3">${money(r.exwUnit)}/kg × ${n2(r.kg)}</td><td style="text-align:right;padding:6px" id="cExwTot">${money(r.exwTotal)}</td><td></td></tr>`;
    body += grp('cfr', 'Hasta frontera (CFR)', cfrItems.length, r.base - r.exwTotal, collapsed.cfr);
    if (!collapsed.cfr) cfrItems.forEach(o => { body += rowHtml(o.x, o.i); });
    body += `<tr style="background:#f0f9ff;font-weight:800"><td style="text-align:left;padding:6px">= Valor en aduana (CFR)</td><td style="padding:6px">${capaTag('cfr')}</td><td class="muted" style="text-align:left;padding:6px" colspan="3">base del arancel</td><td style="text-align:right;padding:6px" id="cCfrTot">${money(r.base)}</td><td></td></tr>`;
    body += grp('ddp', 'Puesto en destino (DDP)', ddpItems.length, ddpSum, collapsed.ddp);
    if (!collapsed.ddp) ddpItems.forEach(o => { body += rowHtml(o.x, o.i); });
    $('tConc').innerHTML = head + '<tbody>' + body + '</tbody>';
    $('tConc').querySelectorAll('.grp').forEach(row => row.addEventListener('click', () => { collapsed[row.dataset.g] = !collapsed[row.dataset.g]; renderConceptos(); }));
    $('tConc').querySelectorAll('.cval').forEach(inp => inp.addEventListener('input', () => {
      const i = +inp.dataset.i; D.conceptos[i].valor_captura = parseFloat(inp.value) || 0;
      updateComputed();  // actualiza celdas sin re-render → no pierde el foco
      deb('conc_' + D.conceptos[i].linea_id, () => patchConc(D.conceptos[i].linea_id, { valor_captura: D.conceptos[i].valor_captura }));
    }));
    $('tConc').querySelectorAll('.cbase').forEach(sel => sel.addEventListener('change', () => {
      const i = +sel.dataset.i, bm = modoToBaseMon(D.conceptos[i].modo_captura);
      D.conceptos[i].modo_captura = baseMonToModo(sel.value, bm.mon);
      patchConc(D.conceptos[i].linea_id, { modo_captura: D.conceptos[i].modo_captura }); renderConceptos(); renderResultados();
    }));
    $('tConc').querySelectorAll('.cmon').forEach(sel => sel.addEventListener('change', () => {
      const i = +sel.dataset.i, bm = modoToBaseMon(D.conceptos[i].modo_captura);
      D.conceptos[i].modo_captura = baseMonToModo(bm.base, sel.value); D.conceptos[i].moneda = sel.value;
      patchConc(D.conceptos[i].linea_id, { modo_captura: D.conceptos[i].modo_captura, moneda: sel.value }); renderConceptos(); renderResultados();
    }));
    $('tConc').querySelectorAll('.cdel').forEach(btn => btn.addEventListener('click', async () => {
      const i = +btn.dataset.i;
      try { await api('/costeos/' + D.costeo.costeo_id + '/conceptos/' + D.conceptos[i].linea_id, { method: 'DELETE' }); D.conceptos.splice(i, 1); renderConceptos(); renderResultados(); }
      catch (e) { KoguApi.toast(e.message, 'error'); }
    }));
  }
  // Actualiza SOLO las celdas calculadas (EXW, importes, CFR) + resultados,
  // sin reconstruir la tabla → conserva el foco/cursor al teclear.
  function updateComputed() {
    const r = calcular();
    if ($('cExwDesc')) $('cExwDesc').textContent = money(r.exwUnit) + '/kg × ' + n2(r.kg);
    if ($('cExwTot')) $('cExwTot').textContent = money(r.exwTotal);
    if ($('cCfrTot')) $('cCfrTot').textContent = money(r.base);
    if ($('cGrpcfr')) $('cGrpcfr').textContent = money(r.base - r.exwTotal);
    if ($('cGrpddp')) $('cGrpddp').textContent = money(D.conceptos.reduce((a, x) => a + (x.capa_incoterm === 'ddp' && !x.es_arancel ? importeUSD(x, r.tc, r.kg) : 0), 0));
    D.conceptos.forEach((x, i) => { const cell = $('cImp' + i); if (cell) cell.textContent = x.es_arancel ? '—' : money(importeUSD(x, r.tc, r.kg)); });
    renderResultados();
  }

  function renderResultados() {
    const r = calcular();
    const best = r.escs.reduce((m, e) => e.ddp_kg < m.ddp_kg ? e : m, r.escs[0] || { ddp_kg: 0 });
    $('escGrid').innerHTML = r.escs.map(e => `<div style="border:1px solid ${e === best ? '#bbf7d0' : 'var(--line)'};border-radius:10px;padding:12px 14px;background:${e === best ? '#f0fdf4' : '#f8fafc'}">
      <div style="font-size:12px;font-weight:800;display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <span>${esc(e.nombre)}</span>
        <span><input class="epct" data-e="${e.escenario_id}" value="${e.arancel_pct}" style="width:56px;text-align:right;border:1px solid var(--line);border-radius:6px;padding:3px 5px;font-size:12px"/>%
          <span class="edel" data-e="${e.escenario_id}" style="cursor:pointer;color:#991b1b;margin-left:4px">✕</span></span></div>
      <div style="display:flex;justify-content:space-between;font-size:12px"><span class="muted">Arancel</span><b>${money(e.arancel)}</b></div>
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-top:2px"><span class="muted">Total DDP</span><b>${money(e.total)}</b></div>
      <div style="font-size:22px;font-weight:800;margin-top:8px;border-top:1px solid var(--line);padding-top:8px">${money(e.ddp_kg)} <span style="font-size:13px;color:var(--muted)">DDP US$/kg</span></div>
      <div class="muted" style="font-size:11px">Factor ${e.factor.toFixed(2)}× · MXN ${money(e.ddp_kg_mxn)}/kg</div>
    </div>`).join('') || '<div class="muted" style="font-size:13px">Sin escenarios.</div>';
    const total0 = r.escs[0] ? r.escs[0].total : 0;
    const pct = (part) => total0 > 0 ? (part / total0 * 100).toFixed(1) + '% del DDP' : '';
    const rung = (l, v, p) => `<div style="border:1px solid var(--line);border-radius:8px;padding:8px 12px;background:#fff;font-size:12px">${l}<b style="display:block;font-size:16px">${v}</b>${p ? `<span style="font-size:11px;color:var(--muted)">${p}</span>` : ''}</div>`;
    $('ladder').innerHTML =
      rung('EXW/kg · mercancía', money(r.exwUnit), pct(r.exwTotal)) +
      rung('CFR/kg · internacional', money(r.cfr_kg), pct(r.base - r.exwTotal)) +
      rung('DDP/kg · destino', money(r.escs[0] ? r.escs[0].ddp_kg : 0), pct(total0 - r.base)) +
      `<div style="border:none;border-radius:8px;padding:8px 12px;background:#0f172a;color:#fff;font-size:12px">Factor DDP<b style="display:block;font-size:16px">${(r.escs[0] ? r.escs[0].factor : 0).toFixed(2)}×</b></div>`;
    $('escGrid').querySelectorAll('.epct').forEach(inp => inp.addEventListener('input', () => {
      const e = D.escenarios.find(x => x.escenario_id === inp.dataset.e); if (!e) return;
      e.arancel_pct = parseFloat(inp.value) || 0; renderResultados();
      deb('esc_' + e.escenario_id, () => patchEsc(e.escenario_id, { arancel_pct: e.arancel_pct }));
    }));
    $('escGrid').querySelectorAll('.edel').forEach(x => x.addEventListener('click', async () => {
      try { await api('/costeos/' + D.costeo.costeo_id + '/escenarios/' + x.dataset.e, { method: 'DELETE' }); D.escenarios = D.escenarios.filter(e => e.escenario_id !== x.dataset.e); renderResultados(); }
      catch (e) { KoguApi.toast(e.message, 'error'); }
    }));
  }

  // ── Persistencia ──
  const patchCab = (patch) => api('/costeos/' + D.costeo.costeo_id, { method: 'PATCH', body: JSON.stringify(patch) }).catch(e => KoguApi.toast(e.message, 'error'));
  const patchConc = (lineaId, patch) => api('/costeos/' + D.costeo.costeo_id + '/conceptos/' + lineaId, { method: 'PATCH', body: JSON.stringify(patch) }).catch(e => KoguApi.toast(e.message, 'error'));
  const patchEsc = (escId, patch) => api('/costeos/' + D.costeo.costeo_id + '/escenarios/' + escId, { method: 'PATCH', body: JSON.stringify(patch) }).catch(e => KoguApi.toast(e.message, 'error'));

  async function agregarConceptoAlCosteo(cat) {
    const modo = cat.modo_default || cat.modo_captura || 'usd_fijo';
    await api('/costeos/' + D.costeo.costeo_id + '/conceptos', { method: 'POST', body: JSON.stringify({ concepto_id: cat.concepto_id || null, nombre: cat.nombre, capa_incoterm: cat.capa_incoterm, modo_captura: modo, es_arancel: !!cat.es_arancel, moneda: String(modo).startsWith('mxn') ? 'MXN' : 'USD', orden: cat.orden || 100 }) });
    openDetail(D.costeo.costeo_id);
  }
  function addConcepto() {
    pickerConcepto((cat) => { if (cat) agregarConceptoAlCosteo(cat).catch(e => KoguApi.toast(e.message, 'error')); });
  }
  async function addEscenario() {
    const nombre = prompt('Nombre del escenario:', 'Nuevo arancel');
    if (nombre === null) return;
    const pct = parseFloat(prompt('Arancel %:', '0')) || 0;
    try { await api('/costeos/' + D.costeo.costeo_id + '/escenarios', { method: 'POST', body: JSON.stringify({ nombre, arancel_pct: pct, orden: (D.escenarios.length + 1) * 10 }) }); openDetail(D.costeo.costeo_id); }
    catch (e) { KoguApi.toast(e.message, 'error'); }
  }
  // Persiste el borrador completo al instante (flush del auto-guardado), sin versión.
  async function guardarDatos() {
    const it = D.costeo;
    Object.keys(debTimers).forEach(k => clearTimeout(debTimers[k]));
    try {
      await Promise.all([
        patchCab({ folio: it.folio, fecha: it.fecha, origen_proveedor: it.origen_proveedor, proveedor_id: it.proveedor_id, modo_transporte: it.modo_transporte, tip_cam: it.tip_cam, kg: it.kg, costo_unit_exw: it.costo_unit_exw }),
        ...D.conceptos.map(x => patchConc(x.linea_id, { valor_captura: x.valor_captura, modo_captura: x.modo_captura, moneda: x.moneda })),
        ...D.escenarios.map(e => patchEsc(e.escenario_id, { nombre: e.nombre, arancel_pct: e.arancel_pct })),
      ]);
      KoguApi.toast('Datos guardados', 'success');
    } catch (e) { KoguApi.toast(e.message, 'error'); }
  }
  async function guardarVersion() {
    const motivo = prompt('Motivo de esta versión:', '');
    if (motivo === null) return;
    try { const v = data(await api('/costeos/' + D.costeo.costeo_id + '/versiones', { method: 'POST', body: JSON.stringify({ motivo }) }));
      KoguApi.toast('Versión v' + v.version_num + ' congelada', 'success'); openDetail(D.costeo.costeo_id); }
    catch (e) { KoguApi.toast(e.message, 'error'); }
  }
  async function duplicar() {
    if (!confirm('¿Duplicar este costeo a un folio nuevo?')) return;
    try { const r = data(await api('/costeos/' + D.costeo.costeo_id + '/duplicar', { method: 'POST', body: '{}' }));
      KoguApi.toast('Costeo duplicado', 'success'); openDetail(r.costeo_id); }
    catch (e) { KoguApi.toast(e.message, 'error'); }
  }
  const snapCache = {};
  async function getSnap(versionId) {
    // Versión actual (copia de trabajo sin congelar): se arma con lo cargado en D.
    if (versionId === '__actual__') {
      return {
        version_num: D.costeo.version_actual, actual: true,
        snapshot: { costeo: D.costeo, conceptos: D.conceptos || [], escenarios: D.escenarios || [] },
      };
    }
    if (snapCache[versionId]) return snapCache[versionId];
    const v = data(await api('/versiones/' + versionId));
    snapCache[versionId] = v; return v;
  }
  function toggleHist() {
    const box = $('histBox'); if (box.style.display === 'block') { box.style.display = 'none'; return; }
    const vs = (D.versiones || []).slice().sort((a, b) => b.version_num - a.version_num);
    box.style.display = 'block';
    const vActual = D.costeo.version_actual;
    // Opciones: primero la actual (copia de trabajo), luego las congeladas.
    const opts = `<option value="__actual__">v${vActual} (actual)</option>` + vs.map(v => `<option value="${v.version_id}">v${v.version_num}</option>`).join('');
    const filaActual = `<tr style="border-top:1px solid #f1f5f9;background:#f5f3ff">
      <td style="padding:6px;font-weight:700">v${vActual} <span style="font-size:10px;color:#6b21a8;font-weight:800">actual</span></td>
      <td style="padding:6px" colspan="2" class="muted">copia de trabajo (sin congelar)</td>
      <td style="padding:6px"></td>
      <td style="padding:6px;white-space:nowrap;text-align:right">
        <button class="btn ghost" data-ver="__actual__" style="padding:1px 8px;font-size:11px">👁 Ver</button>
        ${vs.length ? `<button class="btn ghost" data-diff="__actual__" data-prev="${vs[0].version_id}" style="padding:1px 8px;font-size:11px">Δ vs anterior</button>` : ''}
      </td></tr>`;
    box.innerHTML = `
      <div style="border:1px solid var(--line);border-radius:10px;overflow:hidden">
        <table style="width:100%;font-size:12.5px"><thead><tr style="background:#f8fafc;text-align:left">
          <th style="padding:6px">Versión</th><th style="padding:6px">Fecha</th><th style="padding:6px">Autor</th><th style="padding:6px">Motivo</th><th style="padding:6px"></th></tr></thead>
        <tbody>${filaActual}${vs.map((v, i) => `<tr style="border-top:1px solid #f1f5f9">
          <td style="padding:6px;font-weight:700">v${v.version_num}</td>
          <td style="padding:6px">${new Date(v.created_at).toLocaleString('es-MX')}</td>
          <td style="padding:6px">${esc(v.autor || '—')}</td>
          <td style="padding:6px">${esc(v.motivo || '')}</td>
          <td style="padding:6px;white-space:nowrap;text-align:right">
            <button class="btn ghost" data-ver="${v.version_id}" style="padding:1px 8px;font-size:11px">👁 Ver</button>
            ${i < vs.length - 1 ? `<button class="btn ghost" data-diff="${v.version_id}" data-prev="${vs[i + 1].version_id}" style="padding:1px 8px;font-size:11px">Δ vs anterior</button>` : ''}
          </td></tr>`).join('')}</tbody></table>
      </div>
      <div style="display:flex;gap:8px;align-items:center;margin-top:10px;flex-wrap:wrap">
        <span class="muted" style="font-size:12px">Comparar</span>
        <select id="cmpA" class="input" style="width:auto">${opts}</select>
        <span class="muted">vs</span>
        <select id="cmpB" class="input" style="width:auto">${opts}</select>
        <button class="btn" id="cmpBtn" style="padding:3px 11px;font-size:12px;background:#0891b2;color:#fff">Comparar</button>
      </div>
      <div id="histDetail" style="margin-top:10px"></div>`;
    box.querySelectorAll('button[data-ver]').forEach(b => b.addEventListener('click', () => verVersion(b.dataset.ver)));
    box.querySelectorAll('button[data-diff]').forEach(b => b.addEventListener('click', () => diffVersiones(b.dataset.prev, b.dataset.diff)));
    // Default: última congelada (A) vs actual (B) → muestra los cambios del borrador.
    $('cmpA').value = vs[0].version_id; $('cmpB').value = '__actual__';
    $('cmpBtn').addEventListener('click', () => diffVersiones($('cmpA').value, $('cmpB').value));
  }

  const MODO_LBL = { usd_fijo: 'USD fijo', mxn_fijo: 'MXN fijo', usd_kg: 'USD/kg', mxn_kg: 'MXN/kg', pct_base: '% sobre base' };
  const CAPA = {
    exw: { lab: 'EXW · mercancía', bg: '#f5f3ff', tx: '#7e22ce' },
    cfr: { lab: 'CFR · hasta frontera', bg: '#ecfeff', tx: '#0e7490' },
    ddp: { lab: 'DDP · puesto en destino', bg: '#fffbeb', tx: '#b45309' },
  };
  function statChip(lab, val) {
    return `<div style="background:#f8fafc;border:1px solid var(--line);border-radius:8px;padding:6px 12px;min-width:80px">
      <div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.03em">${esc(lab)}</div>
      <div style="font-size:15px;font-weight:700;color:#0f172a">${val}</div></div>`;
  }
  async function verVersion(versionId) {
    const box = $('histDetail'); box.innerHTML = '<div class="muted" style="font-size:12px;padding:6px">Cargando…</div>';
    try {
      const v = await getSnap(versionId); const s = v.snapshot || {}; const c = s.costeo || {};
      const nm = (x) => (Number(x) || 0).toLocaleString('es-MX', { maximumFractionDigits: 2 });
      const conceptosPorCapa = (capa) => (s.conceptos || []).filter(x => (x.capa_incoterm || '') === capa);
      const bloqueCapa = (capa) => {
        const meta = CAPA[capa]; const lista = conceptosPorCapa(capa);
        if (!lista.length) return '';
        return `<div style="margin-top:8px">
          <div style="background:${meta.bg};color:${meta.tx};font-weight:700;font-size:12px;padding:4px 10px;border-radius:6px">${meta.lab}</div>
          <table style="width:100%;font-size:12.5px"><tbody>${lista.map(x => `<tr style="border-bottom:1px solid #f1f5f9">
            <td style="padding:5px 10px">${esc(x.clave || x.nombre || '')}</td>
            <td style="padding:5px 10px;text-align:right;font-weight:600">${nm(x.valor_captura)} <span style="color:#64748b;font-weight:400">${esc(x.moneda || '')}</span></td>
            <td style="padding:5px 10px;color:#64748b;width:120px">${esc(MODO_LBL[x.modo_captura] || x.modo_captura || '')}</td>
            ${x.es_arancel ? '<td style="padding:5px 10px"><span style="background:#fee2e2;color:#991b1b;font-size:10px;font-weight:700;padding:1px 7px;border-radius:999px">arancel</span></td>' : '<td></td>'}
          </tr>`).join('')}</tbody></table></div>`;
      };
      const esc2 = (s.escenarios || []).map(e => `<span style="background:#eef2ff;color:#3730a3;font-size:11px;font-weight:700;padding:2px 10px;border-radius:999px;margin-right:6px">${esc(e.nombre)}: ${e.arancel_pct}%</span>`).join('');
      box.innerHTML = `<div style="border:1px solid var(--line);border-radius:12px;padding:14px 16px;background:#fff">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <span class="chip" style="background:#ede9fe;color:#5b21b6;font-weight:800;padding:2px 10px;border-radius:999px">v${v.version_num}${v.actual ? ' · actual' : ''}</span>
          <strong style="font-size:15px">${esc(c.folio || '')}</strong>
          <span class="muted" style="font-size:13px">${esc(c.origen_proveedor || '')}</span>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
          ${statChip('Transporte', esc(c.modo_transporte || '—'))}
          ${statChip('KGS', nm(c.kg))}
          ${statChip('EXW USD/kg', '$' + nm(c.costo_unit_exw))}
          ${statChip('Tipo de cambio', nm(c.tip_cam))}
        </div>
        ${bloqueCapa('exw')}${bloqueCapa('cfr')}${bloqueCapa('ddp')}
        ${esc2 ? `<div style="margin-top:10px"><span class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.03em">Escenarios de arancel</span><div style="margin-top:4px">${esc2}</div></div>` : ''}
      </div>`;
    } catch (e) { box.innerHTML = `<div style="color:#991b1b;font-size:12px;padding:6px">${esc(e.message)}</div>`; }
  }
  function diffRows(a, b) {
    const rows = [];
    const cab = [['Transporte', 'modo_transporte'], ['Tipo de cambio', 'tip_cam'], ['KGS', 'kg'], ['EXW USD/kg', 'costo_unit_exw'], ['Origen/proveedor', 'origen_proveedor']];
    cab.forEach(([lab, f]) => { const va = (a.costeo || {})[f], vb = (b.costeo || {})[f]; if (String(va ?? '') !== String(vb ?? '')) rows.push({ sec: 'Cabecera', tipo: 'chg', campo: lab, old: va, neu: vb }); });
    const kc = (c) => String(c.clave || c.nombre || '').toUpperCase();
    const ma = new Map((a.conceptos || []).map(c => [kc(c), c])), mb = new Map((b.conceptos || []).map(c => [kc(c), c]));
    new Set([...ma.keys(), ...mb.keys()]).forEach(k => {
      const ca = ma.get(k), cb = mb.get(k);
      const sv = (x) => `${x.valor_captura} ${x.moneda || ''} (${x.modo_captura})`;
      if (ca && !cb) rows.push({ sec: 'Conceptos', tipo: 'del', campo: k, old: sv(ca) });
      else if (!ca && cb) rows.push({ sec: 'Conceptos', tipo: 'add', campo: k, neu: sv(cb) });
      else if (sv(ca) !== sv(cb)) rows.push({ sec: 'Conceptos', tipo: 'chg', campo: k, old: sv(ca), neu: sv(cb) });
    });
    const ea = new Map((a.escenarios || []).map(e => [e.nombre, e.arancel_pct])), eb = new Map((b.escenarios || []).map(e => [e.nombre, e.arancel_pct]));
    new Set([...ea.keys(), ...eb.keys()]).forEach(k => { const va = ea.get(k), vb = eb.get(k); if (va === undefined) rows.push({ sec: 'Escenarios', tipo: 'add', campo: k, neu: vb + '%' }); else if (vb === undefined) rows.push({ sec: 'Escenarios', tipo: 'del', campo: k, old: va + '%' }); else if (String(va) !== String(vb)) rows.push({ sec: 'Escenarios', tipo: 'chg', campo: k, old: va + '%', neu: vb + '%' }); });
    return rows;
  }
  async function diffVersiones(vidA, vidB) {
    const box = $('histDetail');
    if (vidA === vidB) { box.innerHTML = '<div class="muted" style="font-size:12px;padding:6px">Elige dos versiones distintas.</div>'; return; }
    box.innerHTML = '<div class="muted" style="font-size:12px;padding:6px">Comparando…</div>';
    try {
      const [va, vb] = await Promise.all([getSnap(vidA), getSnap(vidB)]);
      const rows = diffRows(va.snapshot || {}, vb.snapshot || {});
      const badge = { add: ['#dcfce7', '#166534', '+ agregado'], del: ['#fee2e2', '#991b1b', '− eliminado'], chg: ['#fef9c3', '#854d0e', 'Δ cambió'] };
      const cell = (r) => {
        const m = badge[r.tipo];
        const val = r.tipo === 'add' ? `<span style="color:#166534">${esc(r.neu)}</span>`
          : r.tipo === 'del' ? `<span style="color:#991b1b;text-decoration:line-through">${esc(r.old)}</span>`
            : `<span style="color:#991b1b;text-decoration:line-through">${esc(r.old)}</span> → <span style="color:#166534;font-weight:700">${esc(r.neu)}</span>`;
        return `<tr style="border-top:1px solid #f1f5f9"><td style="padding:4px 6px"><span style="background:${m[0]};color:${m[1]};font-size:10px;font-weight:700;padding:1px 7px;border-radius:999px">${m[2]}</span></td><td style="padding:4px 6px">${esc(r.sec)}</td><td style="padding:4px 6px;font-weight:600">${esc(r.campo)}</td><td style="padding:4px 6px">${val}</td></tr>`;
      };
      box.innerHTML = `<div style="border:1px solid var(--line);border-radius:10px;padding:10px 12px">
        <div class="eyebrow">Cambios · v${va.version_num} → v${vb.version_num}</div>
        ${rows.length ? `<table style="width:100%;font-size:12px"><tbody>${rows.map(cell).join('')}</tbody></table>` : '<div class="muted" style="font-size:12px;margin-top:4px">Sin cambios entre estas versiones.</div>'}</div>`;
    } catch (e) { box.innerHTML = `<div style="color:#991b1b;font-size:12px;padding:6px">${esc(e.message)}</div>`; }
  }

  // ── Modales de búsqueda ──
  function modal(titulo, sub, onQuery) {
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.45);display:flex;align-items:flex-start;justify-content:center;z-index:9999;padding-top:8vh';
    ov.innerHTML = `<div class="card" style="width:560px;max-width:92vw;max-height:74vh;display:flex;flex-direction:column;margin:0">
      <div class="row"><div><h3 style="margin:0">${esc(titulo)}</h3><div class="muted" style="font-size:11px">${esc(sub)}</div></div><button class="btn ghost" id="mX">✕</button></div>
      <input class="input" id="mQ" placeholder="Buscar…" style="margin-top:10px"/><div id="mL" style="margin-top:10px;overflow:auto;flex:1"></div></div>`;
    document.body.appendChild(ov);
    const close = () => ov.remove();
    ov.addEventListener('click', e => { if (e.target === ov) close(); });
    ov.querySelector('#mX').addEventListener('click', close);
    const q = ov.querySelector('#mQ'), list = ov.querySelector('#mL');
    const run = () => onQuery(q.value.trim(), list, close);
    q.addEventListener('input', () => deb('modal', run, 300));
    q.focus(); run();
  }
  function pickerProducto(onPick) {
    modal('Selecciona producto', 'Catálogo de productos', async (term, list, close) => {
      try {
        const rows = data(await api('/productos' + qs({ q: term }))) || [];
        list.innerHTML = rows.length ? rows.map((p, i) => `<button class="btn ghost" data-i="${i}" style="display:block;width:100%;text-align:left;margin-bottom:4px;padding:8px 10px"><strong>${esc(p.cve_prod)}</strong> <span class="muted" style="font-size:11px">${esc(p.nombre_corto || '')}</span></button>`).join('') : '<div class="muted" style="padding:12px;text-align:center">Sin resultados.</div>';
        list.querySelectorAll('button[data-i]').forEach(bn => bn.addEventListener('click', () => { close(); onPick(rows[+bn.dataset.i]); }));
      } catch (e) { list.innerHTML = `<div style="padding:12px;color:#991b1b">${esc(e.message)}</div>`; }
    });
  }
  function pickerProveedor(onPick) {
    modal('Selecciona proveedor', 'Catálogo de proveedores', async (term, list, close) => {
      try {
        const rows = data(await api('/proveedores' + qs({ q: term }))) || [];
        list.innerHTML = rows.length ? rows.map((p, i) => `<button class="btn ghost" data-i="${i}" style="display:block;width:100%;text-align:left;margin-bottom:4px;padding:8px 10px"><strong>${esc(p.nombre)}</strong> <span class="muted" style="font-size:11px">${esc(p.rfc || '')}</span></button>`).join('') : '<div class="muted" style="padding:12px;text-align:center">Sin resultados.</div>';
        list.querySelectorAll('button[data-i]').forEach(bn => bn.addEventListener('click', () => { close(); onPick(rows[+bn.dataset.i]); }));
      } catch (e) { list.innerHTML = `<div style="padding:12px;color:#991b1b">${esc(e.message)}</div>`; }
    });
  }
  // Picker de concepto de costo: filtra el catálogo CATS en memoria, con chip
  // de capa de incoterm. Marca los que ya están en el costeo (sin bloquearlos).
  const CAPA_COL = { exw: ['#f5f3ff', '#7e22ce'], cfr: ['#ecfeff', '#0e7490'], ddp: ['#fffbeb', '#b45309'] };
  function pickerConcepto(onPick) {
    const yaClaves = new Set((D.conceptos || []).map(x => String(x.clave || '').toUpperCase()));
    modal('Agregar concepto', 'Catálogo de conceptos de costo', async (term, list, close) => {
      const t = term.toLowerCase();
      const rows = (CATS || []).filter(c => !t || `${c.clave} ${c.nombre}`.toLowerCase().includes(t));
      const items = rows.map((c, i) => {
        const cap = String(c.capa_incoterm || '').toLowerCase();
        const [bg, co] = CAPA_COL[cap] || ['#f1f5f9', '#475569'];
        const ya = yaClaves.has(String(c.clave || '').toUpperCase());
        return `<button class="btn ghost" data-i="${i}" style="display:flex;align-items:center;gap:8px;width:100%;text-align:left;margin-bottom:4px;padding:8px 10px">
          <span style="flex:1"><strong>${esc(c.nombre)}</strong> <span class="muted" style="font-size:11px">${esc(c.clave)}</span>${ya ? ' <span style="font-size:10px;color:#94a3b8">· ya agregado</span>' : ''}</span>
          <span style="background:${bg};color:${co};font-size:10px;font-weight:700;padding:1px 8px;border-radius:999px;text-transform:uppercase">${esc(c.capa_incoterm || '')}</span></button>`;
      }).join('');
      const crear = `<button data-crear style="display:block;width:100%;text-align:left;margin-top:6px;padding:9px 10px;border:1px dashed #a5f3fc;background:#ecfeff;color:#0e7490;font-weight:700;border-radius:8px;cursor:pointer">＋ Crear concepto nuevo${term ? ` «${esc(term)}»` : ''}</button>`;
      list.innerHTML = (rows.length ? items : '<div class="muted" style="padding:10px;text-align:center">Sin coincidencias en el catálogo.</div>') + crear;
      list.querySelectorAll('button[data-i]').forEach(bn => bn.addEventListener('click', () => { close(); onPick(rows[+bn.dataset.i]); }));
      list.querySelector('button[data-crear]').addEventListener('click', () => { close(); crearConceptoForm(term, onPick); });
    });
  }

  // Formulario para crear un concepto que no está en el catálogo. Lo crea en
  // cat_comex_conceptos (reutilizable, permiso admin) y lo agrega al costeo.
  function crearConceptoForm(prefill, onPick) {
    const capas = [['exw', 'EXW · mercancía'], ['cfr', 'CFR · hasta frontera'], ['ddp', 'DDP · nacionales']];
    const modos = [['usd_fijo', 'USD fijo'], ['mxn_fijo', 'MXN fijo'], ['usd_kg', 'USD por kg'], ['mxn_kg', 'MXN por kg'], ['pct_base', '% sobre base']];
    const claveDe = (s) => String(s || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24);
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.45);display:flex;align-items:flex-start;justify-content:center;z-index:10000;padding-top:8vh';
    ov.innerHTML = `<div class="card" style="width:520px;max-width:92vw;margin:0">
      <div class="row"><div><h3 style="margin:0">Crear concepto nuevo</h3><div class="muted" style="font-size:11px">Se agrega al catálogo (reutilizable) y a este costeo</div></div><button class="btn ghost" id="cX">✕</button></div>
      <div style="margin-top:12px;display:grid;gap:10px">
        <div><label class="muted" style="font-size:12px;display:block">Nombre</label><input class="input" id="cNom" value="${esc(prefill || '')}" placeholder="p.ej. Seguro de carga"/></div>
        <div style="display:flex;gap:10px">
          <div style="flex:1"><label class="muted" style="font-size:12px;display:block">Clave</label><input class="input" id="cClave" value="${esc(claveDe(prefill))}" placeholder="SEG_CARGA"/></div>
          <div style="flex:1"><label class="muted" style="font-size:12px;display:block">Capa de incoterm</label><select class="input" id="cCapa">${capas.map(([v, l]) => `<option value="${v}"${v === 'ddp' ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
        </div>
        <div style="display:flex;gap:10px;align-items:flex-end">
          <div style="flex:1"><label class="muted" style="font-size:12px;display:block">Modo de captura</label><select class="input" id="cModo">${modos.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></div>
          <label style="display:flex;gap:6px;align-items:center;font-size:12.5px;padding:8px 4px"><input type="checkbox" id="cAran"/> Es arancel</label>
        </div>
      </div>
      <div class="row" style="margin-top:14px;justify-content:flex-end;gap:8px"><button class="btn ghost" id="cCancel">Cancelar</button><button class="btn primary" id="cOk">Crear y agregar</button></div></div>`;
    document.body.appendChild(ov);
    const close = () => ov.remove();
    ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
    ov.querySelector('#cX').addEventListener('click', close);
    ov.querySelector('#cCancel').addEventListener('click', close);
    const nomEl = ov.querySelector('#cNom'), claveEl = ov.querySelector('#cClave');
    let claveTocada = false;
    claveEl.addEventListener('input', () => { claveTocada = true; });
    nomEl.addEventListener('input', () => { if (!claveTocada) claveEl.value = claveDe(nomEl.value); });
    nomEl.focus();
    ov.querySelector('#cOk').addEventListener('click', async () => {
      const nombre = nomEl.value.trim();
      const clave = claveDe(claveEl.value) || claveDe(nombre);
      if (!nombre) { KoguApi.toast('Escribe un nombre.', 'error'); return; }
      if (!clave) { KoguApi.toast('Escribe una clave.', 'error'); return; }
      const body = { clave, nombre, capa_incoterm: ov.querySelector('#cCapa').value, modo_default: ov.querySelector('#cModo').value, es_arancel: ov.querySelector('#cAran').checked, orden: 100 };
      const btn = ov.querySelector('#cOk'); btn.disabled = true; btn.textContent = 'Creando…';
      try {
        const nuevo = data(await api('/conceptos', { method: 'POST', body: JSON.stringify(body) }));
        await loadCats();
        close();
        if (nuevo && onPick) onPick(nuevo);
        KoguApi.toast('Concepto «' + nombre + '» creado', 'success');
      } catch (e) { KoguApi.toast(e.message, 'error'); btn.disabled = false; btn.textContent = 'Crear y agregar'; }
    });
  }
  function pickerUsuario(onPick) {
    modal('Agregar responsable', 'Usuarios de la empresa', async (term, list, close) => {
      try {
        const rows = data(await api('/usuarios' + qs({ q: term }))) || [];
        list.innerHTML = rows.length ? rows.map((u, i) => `<button class="btn ghost" data-i="${i}" style="display:block;width:100%;text-align:left;margin-bottom:4px;padding:8px 10px"><strong>${esc(u.nombre || u.email)}</strong> <span class="muted" style="font-size:11px">${esc(u.email || '')}</span></button>`).join('') : '<div class="muted" style="padding:12px;text-align:center">Sin resultados.</div>';
        list.querySelectorAll('button[data-i]').forEach(bn => bn.addEventListener('click', () => { close(); onPick(rows[+bn.dataset.i]); }));
      } catch (e) { list.innerHTML = `<div style="padding:12px;color:#991b1b">${esc(e.message)}</div>`; }
    });
  }

  await loadCats();
  renderList();
  KoguShell.subscribeEmpresaActivaChange(() => { loadCats(); renderList(); });
});

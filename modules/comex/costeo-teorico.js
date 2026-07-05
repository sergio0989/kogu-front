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
  const capaTag = (c) => `<span class="chip" style="background:${c === 'exw' ? '#ede9fe;color:#5b21b6' : c === 'cfr' ? '#cffafe;color:#0e7490' : '#dcfce7;color:#166534'};font-size:10px;font-weight:800;padding:1px 7px;border-radius:6px">${c.toUpperCase()}</span>`;

  let CATS = [];       // catálogo de conceptos
  let D = null;        // detalle en memoria

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
      <button class="btn primary" id="verBtn" style="background:#0891b2">💾 Guardar versión</button>
    </div>
  </div>
  <div class="grid-3" style="margin-top:14px;gap:12px">
    <div><label class="muted" style="font-size:12px;display:block">Folio</label><input class="input" id="cFolio" value="${esc(it.folio || '')}"/></div>
    <div><label class="muted" style="font-size:12px;display:block">Fecha</label><input class="input" type="date" id="cFecha" value="${fdate(it.fecha)}"/></div>
    <div><label class="muted" style="font-size:12px;display:block">Transporte</label>
      <select class="input" id="cTrans">${['general', 'aereo', 'maritimo', 'terrestre'].map(t => `<option value="${t}" ${t === it.modo_transporte ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
    <div style="grid-column:span 2"><label class="muted" style="font-size:12px;display:block">Origen / proveedor</label><input class="input" id="cOrig" value="${esc(it.origen_proveedor || '')}"/></div>
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
  <div style="margin-top:14px"><div class="muted" style="font-size:11px;font-weight:700;margin-bottom:4px">Escalera de incoterm (por kg · USD, sin arancel)</div>
    <div id="ladder" style="display:flex;gap:8px;flex-wrap:wrap"></div></div>
</div>`;

    $('volverBtn').addEventListener('click', renderList);
    $('dupBtn').addEventListener('click', duplicar);
    $('verBtn').addEventListener('click', guardarVersion);
    $('histBtn').addEventListener('click', toggleHist);
    $('addConcBtn').addEventListener('click', addConcepto);
    $('addEscBtn').addEventListener('click', addEscenario);
    // cabecera → persistir + recalc
    const bindCab = (id, field, num) => $(id).addEventListener('input', () => {
      D.costeo[field] = num ? (parseFloat($(id).value) || 0) : $(id).value;
      if (['tip_cam', 'kg', 'costo_unit_exw'].includes(field)) renderResultados();
      deb('cab_' + field, () => patchCab({ [field]: D.costeo[field] }));
    });
    bindCab('cFolio', 'folio'); bindCab('cFecha', 'fecha'); bindCab('cOrig', 'origen_proveedor');
    bindCab('cTc', 'tip_cam', true); bindCab('cKg', 'kg', true); bindCab('cExw', 'costo_unit_exw', true);
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
      <th style="text-align:left;padding:6px">Modo</th><th>Captura</th><th>Importe USD</th><th></th></tr></thead>`;
    let body = `<tr style="background:#f0f9ff;font-weight:800"><td style="text-align:left;padding:6px">Valor EXW (mercancía)</td><td style="padding:6px">${capaTag('exw')}</td><td class="muted" style="text-align:left;padding:6px">${money(r.exwUnit)}/kg × ${n2(r.kg)}</td><td></td><td style="text-align:right;padding:6px">${money(r.exwTotal)}</td><td></td></tr>`;
    const lastCfr = D.conceptos.map(x => x.capa_incoterm).lastIndexOf('cfr');
    D.conceptos.forEach((x, i) => {
      const cap = x.modo_captura.startsWith('mxn') ? 'MXN' : (x.modo_captura === 'pct_base' ? '%' : 'USD');
      const imp = x.es_arancel ? null : importeUSD(x, r.tc, r.kg);
      body += `<tr style="border-bottom:1px solid #f1f5f9">
        <td style="text-align:left;padding:6px">${esc(x.nombre || '')}</td>
        <td style="padding:6px">${capaTag(x.capa_incoterm)}</td>
        <td style="text-align:left;padding:6px"><select class="cmodo" data-i="${i}" style="border:1px solid var(--line);border-radius:6px;padding:3px 5px;font-size:11px">${Object.entries(MODOS).map(([k, v]) => `<option value="${k}" ${k === x.modo_captura ? 'selected' : ''}>${v}</option>`).join('')}</select></td>
        <td style="text-align:right;padding:6px">${x.es_arancel ? '<span class="muted">por escenario</span>' : `<input class="cval" data-i="${i}" value="${x.valor_captura}" style="width:92px;text-align:right;border:1px solid var(--line);border-radius:6px;padding:3px 6px;font-size:12px"/> <span class="muted" style="font-size:10px">${cap}</span>`}</td>
        <td style="text-align:right;padding:6px">${imp == null ? '—' : money(imp)}</td>
        <td style="padding:6px"><button class="btn ghost cdel" data-i="${i}" style="color:#991b1b;padding:2px 7px">✕</button></td></tr>`;
      if (i === lastCfr) body += `<tr style="background:#f0f9ff;font-weight:800"><td style="text-align:left;padding:6px">= Valor en aduana (CFR)</td><td style="padding:6px">${capaTag('cfr')}</td><td class="muted" style="text-align:left;padding:6px">base del arancel</td><td></td><td style="text-align:right;padding:6px">${money(r.base)}</td><td></td></tr>`;
    });
    $('tConc').innerHTML = head + '<tbody>' + body + '</tbody>';
    $('tConc').querySelectorAll('.cval').forEach(inp => inp.addEventListener('input', () => {
      const i = +inp.dataset.i; D.conceptos[i].valor_captura = parseFloat(inp.value) || 0;
      renderResultados(); renderConceptImportes();
      deb('conc_' + D.conceptos[i].linea_id, () => patchConc(D.conceptos[i].linea_id, { valor_captura: D.conceptos[i].valor_captura }));
    }));
    $('tConc').querySelectorAll('.cmodo').forEach(sel => sel.addEventListener('change', () => {
      const i = +sel.dataset.i; D.conceptos[i].modo_captura = sel.value;
      patchConc(D.conceptos[i].linea_id, { modo_captura: sel.value }); renderConceptos(); renderResultados();
    }));
    $('tConc').querySelectorAll('.cdel').forEach(btn => btn.addEventListener('click', async () => {
      const i = +btn.dataset.i;
      try { await api('/costeos/' + D.costeo.costeo_id + '/conceptos/' + D.conceptos[i].linea_id, { method: 'DELETE' }); D.conceptos.splice(i, 1); renderConceptos(); renderResultados(); }
      catch (e) { KoguApi.toast(e.message, 'error'); }
    }));
  }
  function renderConceptImportes() { /* importes viven en la tabla; recomputa liviano */ renderConceptos(); }

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
    const rung = (l, v, bg) => `<div style="border:1px solid var(--line);border-radius:8px;padding:8px 12px;background:${bg || '#fff'};font-size:12px">${l}<b style="display:block;font-size:16px">${v}</b></div>`;
    $('ladder').innerHTML = rung('EXW/kg', money(r.exwUnit)) + rung('CFR/kg', money(r.cfr_kg)) + rung('DDP/kg', money(r.escs[0] ? r.escs[0].ddp_kg : 0)) +
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

  async function addConcepto() {
    // menú simple del catálogo
    const opts = CATS.map(cat => `${cat.clave} · ${cat.nombre}`);
    const idx = opts.length ? prompt('Concepto a agregar:\n' + opts.map((o, i) => (i + 1) + '. ' + o).join('\n'), '1') : null;
    if (!idx) return;
    const cat = CATS[parseInt(idx, 10) - 1]; if (!cat) return;
    try {
      await api('/costeos/' + D.costeo.costeo_id + '/conceptos', { method: 'POST', body: JSON.stringify({ concepto_id: cat.concepto_id, nombre: cat.nombre, capa_incoterm: cat.capa_incoterm, modo_captura: cat.modo_default, es_arancel: cat.es_arancel, moneda: cat.modo_default.startsWith('mxn') ? 'MXN' : 'USD', orden: cat.orden }) });
      openDetail(D.costeo.costeo_id);
    } catch (e) { KoguApi.toast(e.message, 'error'); }
  }
  async function addEscenario() {
    const nombre = prompt('Nombre del escenario:', 'Nuevo arancel');
    if (nombre === null) return;
    const pct = parseFloat(prompt('Arancel %:', '0')) || 0;
    try { await api('/costeos/' + D.costeo.costeo_id + '/escenarios', { method: 'POST', body: JSON.stringify({ nombre, arancel_pct: pct, orden: (D.escenarios.length + 1) * 10 }) }); openDetail(D.costeo.costeo_id); }
    catch (e) { KoguApi.toast(e.message, 'error'); }
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
  function toggleHist() {
    const box = $('histBox'); if (box.style.display === 'block') { box.style.display = 'none'; return; }
    const vs = D.versiones || [];
    box.style.display = 'block';
    box.innerHTML = `<div style="border:1px solid var(--line);border-radius:10px;overflow:hidden">
      <table style="width:100%;font-size:12.5px"><thead><tr style="background:#f8fafc;text-align:left">
        <th style="padding:6px">Versión</th><th style="padding:6px">Fecha</th><th style="padding:6px">Autor</th><th style="padding:6px">Motivo</th></tr></thead>
      <tbody>${vs.length ? vs.map(v => `<tr style="border-top:1px solid #f1f5f9"><td style="padding:6px;font-weight:700">v${v.version_num}</td><td style="padding:6px">${new Date(v.created_at).toLocaleString('es-MX')}</td><td style="padding:6px">${esc(v.autor || '—')}</td><td style="padding:6px">${esc(v.motivo || '')}</td></tr>`).join('') : '<tr><td colspan="4" style="padding:10px;text-align:center;color:var(--muted)">Aún no hay versiones congeladas.</td></tr>'}</tbody></table></div>`;
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

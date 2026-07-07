// ============================================================
// reconciliacion.js — Comercio Exterior (comex_): Reconciliación real vs teórico.
// C.1: sube las DBF de SAI (COSTEOS/COSTEOC/COSTEOD) y muestra el costeo REAL
// por operación (kg, flete int'l=INDICANTID, otros=INDIPESO, arancel, DDP).
// C.2 (después): motor de reconciliación vs costeo teórico + banda ± + CRM.
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/comex/reconciliacion.html';
  const PERM = 'screen.comex.reconciliacion';
  const BASE = '/protected/comex/real';
  const RECON = '/protected/comex/reconciliacion';

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Reconciliación (real vs teórico)',
    description: 'Carga el costeo real de SAI (DBF) y compáralo contra el costeo teórico.',
    requiredPermission: PERM,
  });
  if (!b) return;

  const $ = (id) => document.getElementById(id);
  const c = $('pageContent');
  const money = (v) => '$' + (Number(v) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const n0 = (v) => (Number(v) || 0).toLocaleString('es-MX');
  const kg = (v) => (Number(v) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const fdate = (v) => v ? new Date(v).toLocaleString('es-MX') : '';

  c.innerHTML = `
<div class="card">
  <div class="row">
    <div><div class="eyebrow">Comercio Exterior · Reconciliación</div><h2>Costeo real (SAI)</h2>
      <div class="muted" style="font-size:12px">Sube las DBF <strong>COSTEOS / COSTEOC / COSTEOD</strong> (sueltas o en zip). Es un <strong>snapshot acumulado</strong>: cada carga reemplaza la anterior. Se filtran cancelados y borrados.</div></div>
  </div>
  <div style="display:flex;gap:12px;align-items:flex-end;margin-top:14px;flex-wrap:wrap">
    <div><label class="muted" style="font-size:12px;display:block">DBF (o zip)</label>
      <input type="file" id="file" accept=".dbf,.zip" multiple class="input" style="max-width:360px"/></div>
    <button class="btn primary" id="procBtn" style="background:#0891b2">📥 Procesar DBF</button>
    <span id="proc" class="muted" style="font-size:12px"></span>
  </div>
  <div class="muted" style="font-size:11px;margin-top:6px">La reconciliación es por mes, pero la guía la matriz SAT (mensual): cruza los pedimentos del mes contra este snapshot real.</div>
  <div id="msg" style="display:none;margin-top:12px;padding:10px;border-radius:6px;font-size:13px"></div>
</div>

<div class="card" style="margin-top:14px">
  <div class="row"><h3 style="margin:0">Cargas</h3><span class="muted" style="font-size:12px">costeos reales por periodo</span></div>
  <div style="overflow-x:auto;margin-top:10px"><table class="table" id="tCargas" style="width:100%;font-size:13px;font-variant-numeric:tabular-nums"></table></div>
</div>

<div class="card" style="margin-top:14px">
  <div class="row"><div><div class="eyebrow">Comercio Exterior · Reconciliación</div><h3 style="margin:0">Reconciliación del mes</h3>
    <div class="muted" style="font-size:12px">Cruza la <strong>matriz SAT</strong> del periodo contra el costeo real y compara gastos/kg vs el <strong>costeo teórico</strong> (mismo transporte, kg-piso). Fuera de banda → <strong>CRM automático</strong>.</div></div></div>
  <div style="display:flex;gap:12px;align-items:flex-end;margin-top:14px;flex-wrap:wrap">
    <div><label class="muted" style="font-size:12px;display:block">Periodo (matriz SAT)</label>
      <select id="periodo" class="input" style="min-width:220px"></select></div>
    <button class="btn primary" id="reconBtn" style="background:#0891b2">⚖️ Reconciliar mes</button>
    <span id="reconMsg" class="muted" style="font-size:12px"></span>
  </div>
  <div id="reconKpis" style="display:none;gap:8px;margin-top:14px;flex-wrap:wrap"></div>
  <div id="reconFiltros" style="display:none;gap:6px;margin-top:12px;flex-wrap:wrap"></div>
  <div style="overflow-x:auto;margin-top:10px"><table class="table" id="tRecon" style="width:100%;font-size:12.5px;font-variant-numeric:tabular-nums"></table></div>
</div>

<div class="card" id="realCard" style="margin-top:14px;display:none">
  <div class="row"><div><h3 style="margin:0" id="realTit">Costeo real</h3>
    <span class="muted" style="font-size:12px">DIRECTO = mercancía (se excluye) · flete int'l = INDICANTID · otros = INDIPESO</span></div></div>
  <div id="realTools" style="display:flex;gap:10px;align-items:center;margin-top:12px;flex-wrap:wrap">
    <input id="realQ" class="input" placeholder="🔍 Buscar pedimento o No. costeo…" style="max-width:300px"/>
    <label class="muted" style="font-size:12px">Por página
      <select id="realPageSize" class="input" style="width:auto;display:inline-block;margin-left:4px">
        <option>25</option><option selected>50</option><option>100</option><option>250</option></select></label>
    <span style="flex:1"></span>
    <button class="btn ghost" id="realPrev" style="padding:2px 11px">‹</button>
    <span id="realPager" class="muted" style="font-size:12px;min-width:110px;text-align:center"></span>
    <button class="btn ghost" id="realNext" style="padding:2px 11px">›</button>
  </div>
  <div style="overflow-x:auto;margin-top:10px"><table class="table" id="tReal" style="width:100%;font-size:12.5px;font-variant-numeric:tabular-nums"></table></div>
</div>`;

  function showMsg(html, tipo) {
    const m = $('msg');
    const bg = tipo === 'error' ? '#fee2e2' : tipo === 'warn' ? '#fef9c3' : '#dcfce7';
    const co = tipo === 'error' ? '#991b1b' : tipo === 'warn' ? '#854d0e' : '#166534';
    m.style.cssText = `display:block;margin-top:12px;padding:10px;border-radius:6px;font-size:13px;background:${bg};color:${co}`;
    m.innerHTML = html;
  }
  function chip(s) {
    const map = { procesando: ['#fef3c7', '#92400e'], completado: ['#dcfce7', '#166534'], error: ['#fee2e2', '#991b1b'] };
    const m = map[s] || map.procesando;
    return `<span class="chip" style="background:${m[0]};color:${m[1]};font-size:11px;font-weight:800;padding:2px 9px;border-radius:999px">${esc(s)}</span>`;
  }

  async function procesar() {
    const files = $('file').files;
    if (!files || !files.length) return KoguApi.toast('Elige las DBF o un zip.', 'error');
    $('procBtn').disabled = true; $('proc').textContent = '⏳ Procesando…';
    try {
      const fd = new FormData();
      for (const f of files) fd.append('archivos', f);
      const d = KoguApi.unwrapData(await KoguApi.apiFetch(BASE + '/cargar', { method: 'POST', body: fd })) || {};
      const r = d.resumen || {};
      showMsg(`✅ Procesado: ${n0(r.costeos?.activos)} costeos activos (${n0(r.costeos?.cancelados)} cancelados) · ${n0(d.n_partidas)} partidas · ${n0(d.n_gastos)} gastos.`, 'ok');
      $('proc').textContent = ''; $('file').value = '';
      await cargarCargas();
      if (d.carga_id) verReal(d.carga_id);
    } catch (e) { showMsg('❌ ' + e.message, 'error'); $('proc').textContent = ''; }
    finally { $('procBtn').disabled = false; }
  }

  async function cargarCargas() {
    const head = `<thead><tr style="border-bottom:2px solid #e2e8f0;text-align:right">
      <th style="text-align:left;padding:7px">Periodo</th><th style="text-align:left;padding:7px">Archivo</th>
      <th>Costeos</th><th>Partidas</th><th>Gastos</th><th style="text-align:center;padding:7px">Estatus</th>
      <th style="text-align:left;padding:7px">Fecha</th><th></th></tr></thead>`;
    try {
      const rows = KoguApi.unwrapData(await KoguApi.apiFetch(BASE + '/cargas')) || [];
      if (!rows.length) { $('tCargas').innerHTML = head + '<tbody><tr><td colspan="8" style="text-align:center;padding:18px;color:var(--muted)">Sin cargas. Sube las DBF.</td></tr></tbody>'; return; }
      $('tCargas').innerHTML = head + '<tbody>' + rows.map(r => `<tr style="border-bottom:1px solid #f1f5f9;text-align:right">
        <td style="text-align:left;padding:7px;font-weight:700">${esc(r.periodo || '—')}</td>
        <td style="text-align:left;padding:7px">${esc(r.archivo_nombre || '')}</td>
        <td style="padding:7px">${n0(r.n_costeos)}</td><td style="padding:7px">${n0(r.n_partidas)}</td><td style="padding:7px">${n0(r.n_gastos)}</td>
        <td style="text-align:center;padding:7px">${chip(r.status)}</td>
        <td style="text-align:left;padding:7px">${fdate(r.created_at)}</td>
        <td style="padding:7px;white-space:nowrap"><button class="btn ghost" style="padding:2px 8px" data-ver="${r.carga_id}">Ver</button>
          <button class="btn ghost" style="padding:2px 8px;color:#991b1b" data-del="${r.carga_id}">✕</button></td></tr>`).join('') + '</tbody>';
      $('tCargas').querySelectorAll('button[data-ver]').forEach(bn => bn.addEventListener('click', () => verReal(bn.dataset.ver)));
      $('tCargas').querySelectorAll('button[data-del]').forEach(bn => bn.addEventListener('click', () => borrar(bn.dataset.del)));
    } catch (e) { KoguApi.toast(e.message, 'error'); }
  }

  const REAL_COLS = [
    { k: 'no_costeo', lab: 'No. costeo', align: 'left', fmt: (r) => `<span style="font-weight:700">${esc(r.no_costeo)}</span>`, sv: (r) => Number(r.no_costeo) || 0 },
    { k: 'referencia', lab: 'Pedimento (REFERENCIA)', align: 'left', fmt: (r) => esc(r.referencia || ''), sv: (r) => String(r.referencia || '') },
    { k: 'kg', lab: 'Kg', align: 'right', fmt: (r) => kg(r.kg), sv: (r) => Number(r.kg) || 0 },
    { k: 'flete_int', lab: "Flete int'l", align: 'right', fmt: (r) => money(r.flete_int), sv: (r) => Number(r.flete_int) || 0 },
    { k: 'otros', lab: 'Otros', align: 'right', fmt: (r) => money(r.otros), sv: (r) => Number(r.otros) || 0 },
    { k: 'arancel', lab: 'Arancel', align: 'right', fmt: (r) => money(r.arancel), sv: (r) => Number(r.arancel) || 0 },
    { k: 'directo', lab: 'Mercancía (DIRECTO)', align: 'right', fmt: (r) => `<span style="color:#94a3b8">${money(r.directo)}</span>`, sv: (r) => Number(r.directo) || 0 },
    { k: 'ctotot', lab: 'DDP total', align: 'right', fmt: (r) => `<span style="font-weight:700">${money(r.ctotot)}</span>`, sv: (r) => Number(r.ctotot) || 0 },
  ];
  const realState = { rows: [], filtro: '', sortKey: 'no_costeo', sortDir: 'asc', page: 1, pageSize: 50 };

  function realFiltradas() {
    let rows = realState.rows;
    const q = realState.filtro.trim().toLowerCase();
    if (q) rows = rows.filter(r => String(r.referencia || '').toLowerCase().includes(q) || String(r.no_costeo).includes(q));
    const col = REAL_COLS.find(c => c.k === realState.sortKey);
    if (col) {
      const dir = realState.sortDir === 'asc' ? 1 : -1;
      rows = [...rows].sort((a, b) => { const va = col.sv(a), vb = col.sv(b); return va < vb ? -dir : va > vb ? dir : 0; });
    }
    return rows;
  }

  function renderReal() {
    const rows = realFiltradas();
    const ps = realState.pageSize, total = rows.length;
    const pages = Math.max(1, Math.ceil(total / ps));
    if (realState.page > pages) realState.page = pages;
    const start = (realState.page - 1) * ps;
    const pageRows = rows.slice(start, start + ps);
    const head = '<thead><tr style="border-bottom:2px solid #e2e8f0">' + REAL_COLS.map(c => {
      const arrow = realState.sortKey === c.k ? (realState.sortDir === 'asc' ? ' ▲' : ' ▼') : '';
      return `<th data-sort="${c.k}" style="cursor:pointer;padding:6px;text-align:${c.align};user-select:none;white-space:nowrap">${c.lab}${arrow}</th>`;
    }).join('') + '</tr></thead>';
    const body = pageRows.length
      ? pageRows.map(r => '<tr style="border-bottom:1px solid #f1f5f9">' + REAL_COLS.map(c => `<td style="padding:6px;text-align:${c.align}">${c.fmt(r)}</td>`).join('') + '</tr>').join('')
      : `<tr><td colspan="${REAL_COLS.length}" style="text-align:center;padding:16px;color:var(--muted)">Sin resultados.</td></tr>`;
    $('tReal').innerHTML = head + '<tbody>' + body + '</tbody>';
    $('tReal').querySelectorAll('th[data-sort]').forEach(th => th.addEventListener('click', () => {
      const k = th.dataset.sort;
      if (realState.sortKey === k) realState.sortDir = realState.sortDir === 'asc' ? 'desc' : 'asc';
      else { realState.sortKey = k; realState.sortDir = (k === 'no_costeo' || k === 'referencia') ? 'asc' : 'desc'; }
      renderReal();
    }));
    $('realPager').textContent = total ? `${n0(start + 1)}–${n0(Math.min(start + ps, total))} de ${n0(total)}` : '0 de 0';
    $('realPrev').disabled = realState.page <= 1;
    $('realNext').disabled = realState.page >= pages;
  }

  async function verReal(cargaId) {
    try {
      realState.rows = KoguApi.unwrapData(await KoguApi.apiFetch(BASE + '/costeos?carga_id=' + encodeURIComponent(cargaId))) || [];
      realState.page = 1; realState.filtro = ''; const q = $('realQ'); if (q) q.value = '';
      $('realCard').style.display = 'block';
      $('realTit').textContent = 'Costeo real · ' + n0(realState.rows.length) + ' operaciones';
      renderReal();
    } catch (e) { KoguApi.toast(e.message, 'error'); }
  }

  async function borrar(cargaId) {
    if (!confirm('¿Eliminar esta carga real?')) return;
    try { await KoguApi.apiFetch(BASE + '/cargas/' + cargaId, { method: 'DELETE' }); KoguApi.toast('Carga eliminada', 'success');
      $('realCard').style.display = 'none'; cargarCargas();
    } catch (e) { KoguApi.toast(e.message, 'error'); }
  }

  // ── Reconciliación del mes ──────────────────────────────────
  const usdkg = (v) => (v == null ? '—' : (Number(v)).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const pct = (v) => (v == null ? '—' : (Number(v) * 100).toLocaleString('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%');
  const RES_META = {
    DentroBanda:    ['#dcfce7', '#166534', 'Dentro'],
    SobreTabulador: ['#fee2e2', '#991b1b', '↑ Sobre'],
    BajoTabulador:  ['#dbeafe', '#1e40af', '↓ Bajo'],
    SinTeorico:     ['#f1f5f9', '#475569', 'Sin teórico'],
    SinDatos:       ['#fef9c3', '#854d0e', 'Sin datos'],
  };
  const resChip = (r) => { const m = RES_META[r] || RES_META.SinDatos; return `<span class="chip" style="background:${m[0]};color:${m[1]};font-size:11px;font-weight:800;padding:2px 9px;border-radius:999px">${m[2]}</span>`; };
  const reconState = { rows: [], filtro: null };

  async function cargarPeriodos() {
    try {
      const rows = KoguApi.unwrapData(await KoguApi.apiFetch(RECON + '/periodos')) || [];
      const sel = $('periodo');
      if (!rows.length) { sel.innerHTML = '<option value="">— sin matriz SAT cargada —</option>'; $('reconBtn').disabled = true; return; }
      $('reconBtn').disabled = false;
      sel.innerHTML = rows.map(r => `<option value="${esc(r.periodo)}">${esc(r.periodo)} · ${n0(r.n_pedimentos)} pedimentos</option>`).join('');
    } catch (e) { KoguApi.toast(e.message, 'error'); }
  }

  async function reconciliar() {
    const periodo = $('periodo').value;
    if (!periodo) return KoguApi.toast('Elige un periodo con matriz SAT.', 'error');
    $('reconBtn').disabled = true; $('reconMsg').textContent = '⏳ Reconciliando…';
    try {
      const s = KoguApi.unwrapData(await KoguApi.apiFetch(RECON + '/run', { method: 'POST', body: JSON.stringify({ periodo }) })) || {};
      renderKpis(s);
      $('reconMsg').textContent = '';
      if (!s.teoricos) {
        KoguApi.toast('Sin costeos teóricos cargados: no hay contra qué comparar.', 'warn');
      } else if (s.sin_teorico === s.operaciones) {
        KoguApi.toast('Ningún costeo teórico coincide por transporte con estas operaciones.', 'warn');
      } else if (s.crm_actividad_id) {
        KoguApi.toast('Reconciliado. Se generó una actividad CRM con las desviaciones.', 'success');
      } else {
        KoguApi.toast('Reconciliado. Sin operaciones fuera de banda.', 'success');
      }
      await cargarRecon(periodo);
    } catch (e) { $('reconMsg').textContent = ''; KoguApi.toast(e.message, 'error'); }
    finally { $('reconBtn').disabled = false; }
  }

  function renderKpis(s) {
    const box = $('reconKpis'); box.style.display = 'flex';
    const kpi = (lab, val, col) => `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:8px 14px;min-width:96px">
      <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.03em">${lab}</div>
      <div style="font-size:20px;font-weight:800;color:${col || '#0f172a'}">${n0(val)}</div></div>`;
    box.innerHTML = kpi('Operaciones', s.operaciones) + kpi('Dentro', s.dentro_banda, '#166534')
      + kpi('↑ Sobre', s.sobre, '#991b1b') + kpi('↓ Bajo', s.bajo, '#1e40af')
      + kpi('Sin teórico', s.sin_teorico, '#475569') + kpi('Sin datos', s.sin_datos, '#854d0e')
      + `<div style="align-self:center;font-size:12px;color:#64748b">Banda ±: +${(s.banda?.sup * 100).toFixed(1)}% / -${(s.banda?.inf * 100).toFixed(1)}%</div>`;
    const t = s.teoricos_por_transporte || {};
    const detalle = Object.keys(t).length ? Object.entries(t).map(([k, v]) => `${k}: ${v}`).join(' · ') : 'ninguno';
    const warn = !s.teoricos;
    box.insertAdjacentHTML('beforeend',
      `<div style="flex-basis:100%;font-size:12px;margin-top:4px;color:${warn ? '#991b1b' : '#64748b'}">
        Costeos teóricos disponibles: <strong>${n0(s.teoricos || 0)}</strong> (${esc(detalle)})${warn ? ' — <strong>crea costeos teóricos por transporte en “Costeo teórico (importación)” para poder comparar.</strong>' : ''}</div>`);
  }

  function renderFiltros() {
    const box = $('reconFiltros'); box.style.display = 'flex';
    const counts = reconState.rows.reduce((a, r) => { a[r.resultado] = (a[r.resultado] || 0) + 1; return a; }, {});
    const opts = [['', 'Todas', reconState.rows.length], ...Object.keys(RES_META).map(k => [k, RES_META[k][2], counts[k] || 0])];
    box.innerHTML = opts.map(([v, lab, n]) => {
      const on = (reconState.filtro || '') === v;
      return `<button class="btn ${on ? 'primary' : 'ghost'}" style="padding:3px 11px;font-size:12px${on ? ';background:#0891b2' : ''}" data-f="${v}">${lab} · ${n}</button>`;
    }).join('');
    box.querySelectorAll('button[data-f]').forEach(bn => bn.addEventListener('click', () => { reconState.filtro = bn.dataset.f || null; renderFiltros(); renderReconTable(); }));
  }

  function renderReconTable() {
    const head = `<thead><tr style="border-bottom:2px solid #e2e8f0;text-align:right">
      <th style="text-align:left;padding:6px">Pedimento</th><th style="text-align:left;padding:6px">Transporte</th>
      <th>Kg</th><th>Real flete/kg</th><th>Real otros/kg</th><th>Real total/kg</th><th>Teórico total/kg</th>
      <th>Desv. USD/kg</th><th>Desv. %</th><th style="text-align:center;padding:6px">Resultado</th></tr></thead>`;
    let rows = reconState.rows;
    if (reconState.filtro) rows = rows.filter(r => r.resultado === reconState.filtro);
    if (!rows.length) { $('tRecon').innerHTML = head + '<tbody><tr><td colspan="10" style="text-align:center;padding:16px;color:var(--muted)">Sin operaciones. Corre "Reconciliar mes".</td></tr></tbody>'; return; }
    $('tRecon').innerHTML = head + '<tbody>' + rows.map(r => {
      const fuera = r.resultado === 'SobreTabulador' || r.resultado === 'BajoTabulador';
      return `<tr style="border-bottom:1px solid #f1f5f9;text-align:right${fuera ? ';background:#fffbf5' : ''}">
        <td style="text-align:left;padding:6px;font-weight:700">${esc(r.pedimento || '')}</td>
        <td style="text-align:left;padding:6px;text-transform:capitalize">${esc(r.transporte || '')}</td>
        <td style="padding:6px">${kg(r.kg_total)}</td>
        <td style="padding:6px">${usdkg(r.real_flete_kg_usd)}</td>
        <td style="padding:6px">${usdkg(r.real_otros_kg_usd)}</td>
        <td style="padding:6px;font-weight:700">${usdkg(r.real_total_kg_usd)}</td>
        <td style="padding:6px;color:#64748b">${usdkg(r.teo_total_kg_usd)}</td>
        <td style="padding:6px;color:${fuera ? (r.resultado === 'SobreTabulador' ? '#991b1b' : '#1e40af') : '#0f172a'}">${usdkg(r.desv_total_usd)}</td>
        <td style="padding:6px;font-weight:700;color:${fuera ? (r.resultado === 'SobreTabulador' ? '#991b1b' : '#1e40af') : '#0f172a'}">${pct(r.desv_total_pct)}</td>
        <td style="text-align:center;padding:6px">${resChip(r.resultado)}</td></tr>`;
    }).join('') + '</tbody>';
  }

  async function cargarRecon(periodo) {
    try {
      reconState.rows = KoguApi.unwrapData(await KoguApi.apiFetch(RECON + '?periodo=' + encodeURIComponent(periodo))) || [];
      reconState.filtro = null;
      renderFiltros(); renderReconTable();
    } catch (e) { KoguApi.toast(e.message, 'error'); }
  }

  $('reconBtn').addEventListener('click', reconciliar);
  $('periodo').addEventListener('change', () => { const p = $('periodo').value; if (p) cargarRecon(p); });

  // Toolbar del costeo real (búsqueda + tamaño de página + paginación)
  let realQTimer = null;
  $('realQ').addEventListener('input', (e) => {
    clearTimeout(realQTimer);
    realQTimer = setTimeout(() => { realState.filtro = e.target.value; realState.page = 1; renderReal(); }, 200);
  });
  $('realPageSize').addEventListener('change', (e) => { realState.pageSize = Number(e.target.value) || 50; realState.page = 1; renderReal(); });
  $('realPrev').addEventListener('click', () => { if (realState.page > 1) { realState.page--; renderReal(); } });
  $('realNext').addEventListener('click', () => { realState.page++; renderReal(); });

  $('procBtn').addEventListener('click', procesar);
  KoguShell.subscribeEmpresaActivaChange(() => {
    $('realCard').style.display = 'none'; $('reconKpis').style.display = 'none'; $('reconFiltros').style.display = 'none';
    reconState.rows = []; renderReconTable(); cargarCargas(); cargarPeriodos();
  });
  cargarCargas();
  cargarPeriodos();
});

// ============================================================
// inventario.js — Costo (cto_): Inventario integrado.
// Corre la verificación del periodo y muestra el resultado en dos niveles
// (sumatoria por producto / producto+lote): cuadre de existencia (sistema
// vs físico), costo unitario vs referencia (producción/compra) y anomalías
// de costo-cero. Endpoints:
//   POST /protected/cto/inventario/verificar/:anio/:mes
//   GET  /protected/cto/inventario/verificacion/:anio/:mes?nivel=&soloAnomalias=
//   GET  /protected/cto/inventario/resumen/:anio/:mes
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/cto/inventario.html';
  const PERM = 'screen.costo';
  const BASE = '/protected/cto';

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Inventario integrado',
    description: 'Verifica existencia (sistema vs físico) y costo (vs producción/compra) por producto y por producto+lote.',
    requiredPermission: PERM,
  });
  if (!b) return;

  const $ = (id) => document.getElementById(id);
  const esc = KoguUi.escapeHtml;
  const now = new Date();
  let nivel = 'producto_lote';
  let soloAnomalias = false;
  let familiaSel = '';
  let tipoSel = '';
  let familiasData = [];

  const fmtMon = (v) => v == null ? '—' : '$' + (Number(v) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtNum = (v) => v == null ? '—' : (Number(v) || 0).toLocaleString('es-MX', { maximumFractionDigits: 3 });
  const fmtPct = (v) => v == null ? '—' : ((Number(v) || 0) * 100).toFixed(1) + ' %';

  $('pageContent').innerHTML = `
<div class="card">
  <div class="row">
    <div><div class="eyebrow">Costo · Inventario</div><h2>Inventario integrado</h2></div>
    <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap">
      <div><label class="muted" style="font-size:12px">Año</label><input type="number" id="anio" class="input" style="width:96px" value="${now.getFullYear()}"/></div>
      <div><label class="muted" style="font-size:12px">Mes</label><input type="number" id="mes" class="input" style="width:72px" min="1" max="12" value="${now.getMonth() + 1}"/></div>
      <button class="btn ghost" id="verBtn">Ver resultado</button>
      <button class="btn primary" id="runBtn" style="background:#16a34a">▶ Verificar</button>
    </div>
  </div>
  <div id="msg" style="display:none;margin-top:14px;padding:12px;border-radius:6px;font-size:13px"></div>
</div>

<div id="kpis" class="grid-3" style="margin-top:16px;gap:12px;display:none"></div>

<div class="card" id="tablaCard" style="margin-top:16px;display:none">
  <div class="row" style="flex-wrap:wrap;gap:10px">
    <div style="display:flex;gap:8px;align-items:center">
      <span class="muted" style="font-size:12px">Nivel:</span>
      <button class="btn ghost" id="nivLote" data-niv="producto_lote">Producto + lote</button>
      <button class="btn ghost" id="nivProd" data-niv="producto">Sumatoria producto</button>
    </div>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <select id="familia" class="input" style="width:150px"><option value="">Todas las familias</option></select>
      <select id="tipo" class="input" style="width:160px">
        <option value="">Todos los estados</option>
        <option value="dif_kg">Dif. kg (contado)</option>
        <option value="dif_costo">Dif. costo</option>
        <option value="costo_cero">Costo-cero</option>
        <option value="sin_fuente">Sin fuente de costo</option>
        <option value="sin_conteo">Sin conteo</option>
        <option value="sobrante">Sobrante</option>
      </select>
      <input type="text" id="q" class="input" placeholder="Buscar producto / lote…" style="width:180px"/>
      <label style="font-size:13px;display:flex;align-items:center;gap:6px"><input type="checkbox" id="soloAnom"/> Solo anomalías</label>
    </div>
  </div>
  <div style="overflow-x:auto;margin-top:12px"><table class="table" id="tabla" style="width:100%;font-size:13px"></table></div>
  <div class="muted" id="tablaMeta" style="font-size:12px;margin-top:8px"></div>
</div>

<div class="card" id="costoCeroCard" style="margin-top:16px;display:none;border-left:4px solid #8b5cf6">
  <div class="row"><h3 style="margin:0">🟣 Costo-cero — existencia con costo $0</h3>
    <span class="muted" id="costoCeroMeta" style="font-size:12px"></span></div>
  <div class="muted" style="font-size:12px;margin-top:4px">Partidas con existencia en el sistema pero costo unitario por debajo del piso. Requieren costeo.</div>
  <div style="overflow-x:auto;margin-top:12px"><table class="table" id="tablaCero" style="width:100%;font-size:13px"></table></div>
</div>`;

  function showMsg(html, tipo) {
    const m = $('msg');
    const bg = tipo === 'error' ? '#fee2e2' : tipo === 'warn' ? '#fef9c3' : '#dcfce7';
    const co = tipo === 'error' ? '#991b1b' : tipo === 'warn' ? '#854d0e' : '#166534';
    m.style.cssText = `display:block;margin-top:14px;padding:12px;border-radius:6px;font-size:13px;background:${bg};color:${co}`;
    m.innerHTML = html;
  }

  function chipOK(ok, okTxt, badTxt) {
    if (ok == null) return `<span style="background:#f1f5f9;color:#64748b;padding:2px 8px;border-radius:999px;font-size:11px">n/a</span>`;
    const c = ok ? ['#dcfce7', '#166534', okTxt] : ['#fee2e2', '#991b1b', badTxt];
    return `<span style="background:${c[0]};color:${c[1]};padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700">${c[2]}</span>`;
  }

  function kpiCard(label, val, sub, accent) {
    return `<div class="card" style="padding:16px;${accent ? 'border-top:3px solid ' + accent : ''}">
      <div class="muted" style="font-size:12px">${label}</div>
      <div style="font-size:22px;font-weight:700;margin-top:4px">${val}</div>
      ${sub ? `<div class="muted" style="font-size:12px;margin-top:2px">${sub}</div>` : ''}
    </div>`;
  }

  function pintarKpis(resumen, parametros) {
    const byNiv = Object.fromEntries((resumen || []).map(r => [r.nivel, r]));
    const pl = byNiv['producto_lote'] || {};
    const pr = byNiv['producto'] || {};
    $('kpis').style.display = 'grid';
    $('kpis').innerHTML = [
      kpiCard('Partidas verificadas (prod+lote)', fmtNum(pl.total || 0), `${fmtNum(pr.total || 0)} productos`, '#0d9488'),
      // Anomalías DURAS: contado-y-difiere + dif. costo + costo-cero.
      kpiCard('Anomalías (duras)', fmtNum(pl.anomalias || 0),
        `Dif. kg ${fmtNum(pl.dif_kg || 0)} · Dif. costo ${fmtNum(pl.dif_costo || 0)} · Costo-cero ${fmtNum(pl.costo_cero || 0)}`,
        (pl.anomalias > 0 ? '#dc2626' : '#16a34a')),
      kpiCard('Dif. existencia contada (kg)', fmtNum(pl.dif_kg || 0), 'contado y fuera de tolerancia', '#ca8a04'),
      // Buckets informativos (NO anomalía).
      kpiCard('Sin conteo', fmtNum(pl.sin_conteo || 0), 'en sistema, no contado (p.ej. empaques)', '#64748b'),
      kpiCard('Sobrante', fmtNum(pl.sobrante || 0), 'contado, el sistema no lo reporta', '#0ea5e9'),
      kpiCard('Valor inventario (sistema)', fmtMon(pl.valor_sistema || 0), `${fmtNum(pl.existencia_sistema || 0)} kg`, '#64748b'),
    ].join('');
  }

  // Chip por estado de kg (4 estados).
  function chipEstado(estado) {
    const map = {
      ok: ['#dcfce7', '#166534', 'OK'],
      dif: ['#fee2e2', '#991b1b', 'Dif.'],
      sin_conteo: ['#f1f5f9', '#475569', 'Sin conteo'],
      sobrante: ['#e0f2fe', '#075985', 'Sobrante'],
    };
    const c = map[estado] || ['#f1f5f9', '#64748b', estado || '—'];
    return `<span style="background:${c[0]};color:${c[1]};padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700">${c[2]}</span>`;
  }

  function pintarFamilias() {
    const sel = $('familia');
    const opts = ['<option value="">Todas las familias</option>']
      .concat((familiasData || []).map(f => `<option value="${esc(f.familia)}">${esc(f.familia)} (${f.anomalias}/${f.total})</option>`));
    sel.innerHTML = opts.join('');
    sel.value = familiaSel;
  }

  function pintarTabla(rows, meta) {
    const esLote = nivel === 'producto_lote';
    const head = `<thead><tr style="text-align:right;border-bottom:2px solid #e2e8f0">
      <th style="text-align:left;padding:6px">Fam.</th><th style="text-align:left;padding:6px">Producto</th>${esLote ? '<th style="text-align:left;padding:6px">Lote</th>' : ''}
      <th style="padding:6px">Exist. sistema</th><th style="padding:6px">Conteo físico</th><th style="padding:6px">Dif. kg</th><th style="padding:6px;text-align:center">Kg</th>
      <th style="padding:6px">Costo u. sist.</th>${esLote ? '<th style="padding:6px">Costo u. ref.</th><th style="padding:6px">Fuente</th><th style="padding:6px">Dif. %</th><th style="padding:6px;text-align:center">Costo</th>' : ''}
      <th style="padding:6px;text-align:center">Estado</th><th style="text-align:left;padding:6px">Motivo</th></tr></thead>`;
    const body = rows.map(r => `<tr style="text-align:right;border-bottom:1px solid #f1f5f9;${r.anomalia ? 'background:#fef2f2' : ''}">
      <td style="text-align:left;padding:6px;color:#64748b">${esc(r.familia || '')}</td>
      <td style="text-align:left;padding:6px;font-weight:600">${esc(r.cve_prod || '')}</td>
      ${esLote ? `<td style="text-align:left;padding:6px">${esc(r.lote_norm || '')}</td>` : ''}
      <td style="padding:6px">${fmtNum(r.existencia_sistema)}</td>
      <td style="padding:6px">${fmtNum(r.conteo_fisico)}</td>
      <td style="padding:6px">${fmtNum(r.dif_existencia)}</td>
      <td style="padding:6px;text-align:center">${chipEstado(r.estado_kg)}</td>
      <td style="padding:6px">${fmtMon(r.costo_unit_sistema)}</td>
      ${esLote ? `<td style="padding:6px">${fmtMon(r.costo_unit_referencia)}</td>
      <td style="padding:6px;text-align:center">${r.fuente_referencia ? esc(r.fuente_referencia) : '—'}</td>
      <td style="padding:6px">${fmtPct(r.dif_costo_pct)}</td>
      <td style="padding:6px;text-align:center">${chipOK(r.dif_costo_ok, 'OK', '>tol')}</td>` : ''}
      <td style="padding:6px;text-align:center">${r.anomalia ? chipOK(false, '', 'Revisar') : chipOK(true, 'OK', '')}</td>
      <td style="text-align:left;padding:6px;color:#991b1b">${esc(r.motivo || '')}</td></tr>`).join('');
    $('tabla').innerHTML = head + '<tbody>' + (body || `<tr><td colspan="15" class="muted" style="padding:12px;text-align:center">Sin partidas.</td></tr>`) + '</tbody>';
    $('tablaMeta').textContent = `${meta ? meta.total : rows.length} partidas · nivel ${esLote ? 'producto+lote' : 'sumatoria producto'}${familiaSel ? ' · familia ' + familiaSel : ''}${tipoSel ? ' · ' + tipoSel : ''}${soloAnomalias ? ' · solo anomalías' : ''}`;
  }

  function syncNivelBtns() {
    $('nivLote').className = 'btn ' + (nivel === 'producto_lote' ? 'primary' : 'ghost');
    $('nivProd').className = 'btn ' + (nivel === 'producto' ? 'primary' : 'ghost');
  }

  async function cargarTabla() {
    const anio = parseInt($('anio').value, 10), mes = parseInt($('mes').value, 10);
    const q = ($('q').value || '').trim();
    const qs = new URLSearchParams({ nivel, soloAnomalias: String(soloAnomalias) });
    if (familiaSel) qs.set('familia', familiaSel);
    if (tipoSel) qs.set('tipo', tipoSel);
    if (q) qs.set('q', q);
    const res = await KoguApi.apiFetch(`${BASE}/inventario/verificacion/${anio}/${mes}?${qs.toString()}`);
    pintarTabla(KoguApi.unwrapData(res) || [], res.meta);
  }

  // Bloque específico: solo partidas costo-cero (existencia con costo $0).
  async function cargarCostoCero() {
    const anio = parseInt($('anio').value, 10), mes = parseInt($('mes').value, 10);
    const res = await KoguApi.apiFetch(`${BASE}/inventario/verificacion/${anio}/${mes}?nivel=${nivel}&tipo=costo_cero&limit=500`);
    const rows = KoguApi.unwrapData(res) || [];
    if (!rows.length) { $('costoCeroCard').style.display = 'none'; return; }
    $('costoCeroCard').style.display = 'block';
    const esLote = nivel === 'producto_lote';
    const head = `<thead><tr style="text-align:right;border-bottom:2px solid #e2e8f0">
      <th style="text-align:left;padding:6px">Producto</th>${esLote ? '<th style="text-align:left;padding:6px">Lote</th>' : ''}
      <th style="padding:6px">Exist. sistema</th><th style="padding:6px">Costo u. sist.</th>
      <th style="padding:6px">Conteo físico</th><th style="padding:6px">Dif. kg</th><th style="padding:6px;text-align:center">Kg</th></tr></thead>`;
    const body = rows.map(r => `<tr style="text-align:right;border-bottom:1px solid #f1f5f9;background:#faf5ff">
      <td style="text-align:left;padding:6px;font-weight:600">${esc(r.cve_prod || '')}</td>
      ${esLote ? `<td style="text-align:left;padding:6px">${esc(r.lote_norm || '')}</td>` : ''}
      <td style="padding:6px">${fmtNum(r.existencia_sistema)}</td>
      <td style="padding:6px;color:#7c3aed;font-weight:600">${fmtMon(r.costo_unit_sistema)}</td>
      <td style="padding:6px">${fmtNum(r.conteo_fisico)}</td>
      <td style="padding:6px">${fmtNum(r.dif_existencia)}</td>
      <td style="padding:6px;text-align:center">${chipOK(r.dif_existencia_ok, 'OK', '≠')}</td></tr>`).join('');
    $('tablaCero').innerHTML = head + '<tbody>' + body + '</tbody>';
    $('costoCeroMeta').textContent = `${rows.length} partidas · nivel ${esLote ? 'producto+lote' : 'sumatoria producto'}`;
  }

  async function verResultado() {
    const anio = parseInt($('anio').value, 10), mes = parseInt($('mes').value, 10);
    if (!anio || !mes) return KoguApi.toast('Indica año y mes.', 'error');
    try {
      const res = await KoguApi.apiFetch(`${BASE}/inventario/resumen/${anio}/${mes}`);
      const d = KoguApi.unwrapData(res) || {};
      if (!d.resumen || !d.resumen.length) {
        $('kpis').style.display = $('tablaCard').style.display = 'none';
        showMsg('Sin verificación para ese periodo. Pulsa "Verificar" (requiere inventario del sistema y conteo físico cargados).', 'warn');
        return;
      }
      $('msg').style.display = 'none';
      familiasData = d.familias || []; pintarFamilias();
      pintarKpis(d.resumen, d.parametros);
      $('tablaCard').style.display = 'block';
      syncNivelBtns();
      await cargarTabla();
      await cargarCostoCero();
    } catch (e) {
      $('kpis').style.display = $('tablaCard').style.display = $('costoCeroCard').style.display = 'none';
      showMsg('❌ ' + e.message, 'error');
    }
  }

  async function verificar() {
    const anio = parseInt($('anio').value, 10), mes = parseInt($('mes').value, 10);
    if (!anio || !mes) return KoguApi.toast('Indica año y mes.', 'error');
    $('runBtn').disabled = true;
    showMsg('⏳ Verificando inventario ' + anio + '-' + String(mes).padStart(2, '0') + '…', 'warn');
    try {
      const res = await KoguApi.apiFetch(`${BASE}/inventario/verificar/${anio}/${mes}`, { method: 'POST', body: JSON.stringify({}) });
      const d = KoguApi.unwrapData(res) || {};
      const c = d.conteos || {};
      showMsg(`✅ Verificación completada: ${fmtNum(c.producto_lote)} partidas producto+lote · ${fmtNum(c.producto)} productos. Tolerancias: kg ${d.parametros.tol_kg}, costo ±${(d.parametros.var_costo_pct * 100).toFixed(0)}%, piso $${d.parametros.costo_min_kg}.`, 'ok');
      familiasData = d.familias || []; pintarFamilias();
      pintarKpis(d.resumen, d.parametros);
      $('tablaCard').style.display = 'block';
      syncNivelBtns();
      await cargarTabla();
      await cargarCostoCero();
      KoguApi.toast('Inventario verificado', 'success');
    } catch (e) {
      showMsg('❌ ' + e.message, 'error');
      KoguApi.toast(e.message, 'error');
    } finally { $('runBtn').disabled = false; }
  }

  $('runBtn').addEventListener('click', verificar);
  $('verBtn').addEventListener('click', verResultado);
  $('nivLote').addEventListener('click', () => { nivel = 'producto_lote'; syncNivelBtns(); cargarTabla(); cargarCostoCero(); });
  $('nivProd').addEventListener('click', () => { nivel = 'producto'; syncNivelBtns(); cargarTabla(); cargarCostoCero(); });
  $('soloAnom').addEventListener('change', (e) => { soloAnomalias = e.target.checked; cargarTabla(); });
  $('familia').addEventListener('change', (e) => { familiaSel = e.target.value; cargarTabla(); });
  $('tipo').addEventListener('change', (e) => { tipoSel = e.target.value; cargarTabla(); });
  let qt; $('q').addEventListener('input', () => { clearTimeout(qt); qt = setTimeout(cargarTabla, 350); });
  KoguShell.subscribeEmpresaActivaChange(() => verResultado());

  verResultado();
});

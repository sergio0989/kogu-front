// ============================================================
// compras-usd.js — Costo (cto_): Costo de compras USD / diferencia cambiaria.
// Tres bloques: KPIs de exposición FX, variación real (USD) vs cambiaria (TC),
// y catálogo de compras del periodo. Fuente: cto_movimientos (compras).
// Solo lectura: GET /protected/cto/compras-usd/:anio(?mes=&q=).
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/cto/compras-usd.html';
  const PERM = 'screen.costo';
  const BASE = '/protected/cto';

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Costo — Compras USD',
    description: 'Aísla la variación real del costo de compra (en USD) del efecto del tipo de cambio.',
    requiredPermission: PERM,
  });
  if (!b) return;

  const $ = (id) => document.getElementById(id);
  const now = new Date();
  const MESES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const NAVY = '#1e3a8a';

  const fmtMon = (v) => '$' + (Number(v) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtU = (v, d = 4) => (Number(v) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: d });
  const fmtMM = (v) => '$' + (Number(v) / 1e6).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' M';
  const fmtPct = (v) => v == null ? '—' : ((Number(v) || 0) * 100).toFixed(2) + ' %';
  const fmtNum = (v) => (Number(v) || 0).toLocaleString('es-MX');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

  let data = null;

  $('pageContent').innerHTML = `
<div class="card">
  <div class="row">
    <div><div class="eyebrow">Costo · Análisis</div><h2 style="margin:2px 0">Compras USD / Diferencia cambiaria</h2>
      <div class="muted" style="font-size:12px">Variación real (USD) vs efecto del tipo de cambio</div></div>
    <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap">
      <div><label class="muted" style="font-size:12px;display:block">Año</label><input type="number" id="anio" class="input" style="width:100px" value="${now.getFullYear()}"/></div>
      <div><label class="muted" style="font-size:12px;display:block">Periodo</label>
        <select id="mes" class="input" style="width:160px">
          <option value="acum">Acumulado (año)</option>
          ${MESES.slice(1).map((n, i) => `<option value="${i + 1}">${n}</option>`).join('')}
        </select></div>
      <div><label class="muted" style="font-size:12px;display:block">Buscar</label><input type="text" id="q" class="input" style="width:200px" placeholder="producto / proveedor / lote"/></div>
      <button class="btn primary" id="refreshBtn">Actualizar</button>
      <button class="btn ghost" id="exportBtn">⬇ Excel</button>
    </div>
  </div>
  <div id="msg" style="display:none;margin-top:14px;padding:12px;border-radius:6px;font-size:13px"></div>
</div>

<div id="kpis" class="grid-3" style="margin-top:16px;gap:12px;display:none"></div>

<div class="card" id="varCard" style="margin-top:16px;display:none">
  <div class="row"><h3 style="margin:0">Variación de costo: real vs cambiaria</h3>
    <span class="muted" style="font-size:12px">Última compra del periodo vs la anterior · ordenado por mayor cambio en MXN</span></div>
  <div style="overflow-x:auto;margin-top:10px"><table class="table" id="tablaVar" style="width:100%;font-size:13px;font-variant-numeric:tabular-nums"></table></div>
</div>

<div class="card" id="catCard" style="margin-top:16px;display:none">
  <div class="row"><h3 style="margin:0">Catálogo de compras del periodo</h3>
    <span class="muted" style="font-size:12px" id="catSub"></span></div>
  <div style="overflow-x:auto;margin-top:10px"><table class="table" id="tablaCat" style="width:100%;font-size:13px;font-variant-numeric:tabular-nums"></table></div>
</div>`;

  function showMsg(html, tipo) {
    const m = $('msg');
    const bg = tipo === 'error' ? '#fee2e2' : tipo === 'warn' ? '#fef9c3' : '#dcfce7';
    const co = tipo === 'error' ? '#991b1b' : tipo === 'warn' ? '#854d0e' : '#166534';
    m.style.cssText = `display:block;margin-top:14px;padding:12px;border-radius:6px;font-size:13px;background:${bg};color:${co}`;
    m.innerHTML = html;
  }

  function kpi(label, val, sub, accent) {
    return `<div class="card" style="padding:16px;${accent ? 'border-top:3px solid ' + accent : ''}">
      <div class="muted" style="font-size:12px">${label}</div>
      <div style="font-size:22px;font-weight:700;margin-top:4px">${val}</div>
      ${sub ? `<div class="muted" style="font-size:12px;margin-top:2px">${sub}</div>` : ''}</div>`;
  }

  function pintarKpis() {
    const k = data.kpis;
    $('kpis').style.display = 'grid';
    $('kpis').innerHTML = [
      kpi('Compras en USD', fmtPct(k.pct_usd), `${fmtMM(k.monto_mxn_usd)} de ${fmtMM(k.monto_mxn)} · ${fmtNum(k.n_compras_usd)}/${fmtNum(k.n_compras)} compras`, NAVY),
      kpi('Exposición en USD', 'US$' + fmtU(k.monto_usd, 2), 'monto de compras en dólares', NAVY),
      kpi('TC promedio ponderado', k.tc_prom_pond != null ? '$' + fmtU(k.tc_prom_pond, 4) : '—', 'ponderado por monto USD', '#64748b'),
      kpi('Impacto de +$1 de TC', fmtMon(k.impacto_tc_1), 'MXN adicionales por cada peso de TC', '#d97706'),
      kpi('Compras en pesos', fmtMM(k.monto_mxn_pesos), 'sin exposición cambiaria', '#0d9488'),
      kpi('Total de compras', fmtMM(k.monto_mxn), `${fmtNum(k.n_compras)} renglones`, '#0d9488'),
    ].join('');
  }

  function claseChip(clase) {
    const map = { cambiaria: [NAVY, 'Cambiaria'], real: ['#991b1b', 'Real'], estable: ['#64748b', 'Estable'] };
    const [c, t] = map[clase] || map.estable;
    return `<span class="chip" style="background:${c}22;color:${c};font-size:11px;font-weight:700">${t}</span>`;
  }
  function pctCol(p, goodDown = true) {
    if (p == null) return '<span style="color:#9ca3af">—</span>';
    const v = Number(p) * 100;
    const col = Math.abs(v) < 1 ? '#64748b' : (v > 0 ? '#991b1b' : '#166534');
    return `<span style="color:${col};font-weight:600">${v > 0 ? '+' : ''}${v.toFixed(1)}%</span>`;
  }

  function pintarVar() {
    const head = `<thead><tr style="border-bottom:2px solid #e2e8f0">
      <th style="text-align:left;padding:6px">Producto</th>
      <th style="text-align:right;padding:6px">Costo MXN<div style="font-size:9px;font-weight:400;color:#94a3b8">ant → act</div></th>
      <th style="text-align:right;padding:6px">Δ MXN</th>
      <th style="text-align:right;padding:6px">Costo USD<div style="font-size:9px;font-weight:400;color:#94a3b8">ant → act</div></th>
      <th style="text-align:right;padding:6px">Δ USD</th>
      <th style="text-align:right;padding:6px">Efecto real</th>
      <th style="text-align:right;padding:6px">Efecto cambiario</th>
      <th style="text-align:center;padding:6px">Clase</th></tr></thead>`;
    const rows = data.variacion.map(r => `<tr style="border-bottom:1px solid #f1f5f9;${r.clase === 'cambiaria' ? 'background:#eef2ff' : ''}">
      <td style="padding:6px;font-size:12px"><strong>${esc(r.cve_prod)}</strong>${r.lote ? `<div style="font-family:monospace;font-size:10px;color:#64748b">${esc(r.lote)}</div>` : ''}</td>
      <td style="padding:6px;text-align:right;font-size:12px">${fmtMon(r.prev_mxn)} → <strong>${fmtMon(r.act_mxn)}</strong></td>
      <td style="padding:6px;text-align:right">${pctCol(r.pct_mxn)}</td>
      <td style="padding:6px;text-align:right;font-size:12px;color:${NAVY}">${r.es_usd ? 'US$' + fmtU(r.prev_usd) + ' → ' + fmtU(r.act_usd) : '—'}</td>
      <td style="padding:6px;text-align:right">${r.es_usd ? pctCol(r.pct_usd) : '<span style="color:#9ca3af">—</span>'}</td>
      <td style="padding:6px;text-align:right;font-size:12px">${fmtMon(r.efecto_real)}</td>
      <td style="padding:6px;text-align:right;font-size:12px;color:${NAVY}">${fmtMon(r.efecto_fx)}</td>
      <td style="padding:6px;text-align:center">${claseChip(r.clase)}</td></tr>`).join('');
    $('tablaVar').innerHTML = head + '<tbody>' + (rows || '<tr><td colspan="8" style="padding:16px;text-align:center;color:var(--muted)">Sin compras con histórico previo para comparar.</td></tr>') + '</tbody>';
  }

  function pintarCat() {
    const head = `<thead><tr style="border-bottom:2px solid #e2e8f0">
      <th style="text-align:left;padding:6px">Fecha</th><th style="text-align:left;padding:6px">Producto</th>
      <th style="text-align:left;padding:6px">Lote</th><th style="text-align:left;padding:6px">Prov.</th>
      <th style="text-align:right;padding:6px">Cantidad</th><th style="text-align:right;padding:6px">Costo u. MXN</th>
      <th style="text-align:right;padding:6px">TC</th><th style="text-align:right;padding:6px">Costo u. USD</th>
      <th style="text-align:right;padding:6px">Monto MXN</th><th style="text-align:center;padding:6px">Mon.</th></tr></thead>`;
    const rows = data.catalogo.map(r => `<tr style="border-bottom:1px solid #f1f5f9">
      <td style="padding:6px;font-size:12px">${r.fecha ? String(r.fecha).slice(0, 10) : '—'}</td>
      <td style="padding:6px;font-size:12px"><strong>${esc(r.cve_prod)}</strong></td>
      <td style="padding:6px;font-family:monospace;font-size:11px">${esc(r.lote || '—')}</td>
      <td style="padding:6px;font-size:12px">${esc(r.proveedor || '—')}</td>
      <td style="padding:6px;text-align:right;font-size:12px">${fmtNum(Math.round(r.cantidad))}</td>
      <td style="padding:6px;text-align:right;font-size:12px">${fmtMon(r.costo_mxn)}</td>
      <td style="padding:6px;text-align:right;font-size:12px">${r.tip_cam != null ? '$' + fmtU(r.tip_cam, 4) : '—'}</td>
      <td style="padding:6px;text-align:right;font-size:12px;color:${NAVY}">${r.costo_usd != null ? 'US$' + fmtU(r.costo_usd) : '—'}</td>
      <td style="padding:6px;text-align:right;font-size:12px">${fmtMon(r.monto_mxn)}</td>
      <td style="padding:6px;text-align:center"><span style="font-size:10px;font-weight:700;color:${r.es_usd ? NAVY : '#94a3b8'}">${r.es_usd ? 'USD' : 'MXN'}</span></td></tr>`).join('');
    $('tablaCat').innerHTML = head + '<tbody>' + (rows || '<tr><td colspan="10" style="padding:16px;text-align:center;color:var(--muted)">Sin compras en el periodo.</td></tr>') + '</tbody>';
    $('catSub').textContent = `${data.catalogo.length} compras`;
  }

  async function cargar() {
    const anio = parseInt($('anio').value, 10);
    if (!anio) return KoguApi.toast('Indica el año.', 'error');
    const mes = $('mes').value, q = $('q').value.trim();
    $('refreshBtn').disabled = true;
    try {
      const res = await KoguApi.apiFetch(`${BASE}/compras-usd/${anio}?mes=${encodeURIComponent(mes)}${q ? '&q=' + encodeURIComponent(q) : ''}`);
      data = KoguApi.unwrapData(res);
      if (!data || !data.kpis || !data.kpis.n_compras) {
        $('kpis').style.display = $('varCard').style.display = $('catCard').style.display = 'none';
        showMsg('Sin compras cargadas para el periodo. Carga "Movimientos / kardex" en Cargas.', 'warn');
        return;
      }
      $('msg').style.display = 'none';
      $('varCard').style.display = $('catCard').style.display = 'block';
      pintarKpis(); pintarVar(); pintarCat();
    } catch (e) {
      showMsg('❌ ' + e.message, 'error');
      KoguApi.toast(e.message, 'error');
    } finally { $('refreshBtn').disabled = false; }
  }

  async function exportar() {
    const anio = parseInt($('anio').value, 10);
    if (!anio) return KoguApi.toast('Indica el año.', 'error');
    const mes = $('mes').value, q = $('q').value.trim();
    try {
      KoguApi.toast('Generando Excel…', 'info');
      const res = await KoguApi.authFetchRaw(`${BASE}/compras-usd/${anio}/export?mes=${encodeURIComponent(mes)}${q ? '&q=' + encodeURIComponent(q) : ''}`);
      if (!res.ok) throw new Error('No se pudo generar el Excel.');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `cto_compras_usd_${anio}${mes !== 'acum' ? '_' + String(mes).padStart(2, '0') : ''}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e) { KoguApi.toast(e.message, 'error'); }
  }

  $('refreshBtn').addEventListener('click', cargar);
  $('anio').addEventListener('change', cargar);
  $('mes').addEventListener('change', cargar);
  $('q').addEventListener('input', () => { clearTimeout(window.__t); window.__t = setTimeout(cargar, 350); });
  $('exportBtn').addEventListener('click', exportar);
  KoguShell.subscribeEmpresaActivaChange(() => cargar());

  cargar();
});

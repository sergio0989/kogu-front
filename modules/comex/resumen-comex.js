// ============================================================
// resumen-comex.js — Comercio Exterior: Resumen ejecutivo (KPIs multi-mes).
// Se apoya en la reconciliación (operaciones con periodo + TC) + COSTEOC.
// Refleja los meses reconciliados; crece conforme reconcilias más periodos.
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/comex/resumen-comex.html';
  const PERM = 'screen.comex.resumen';
  const BASE = '/protected/comex/resumen';

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Resumen ejecutivo · Comercio Exterior',
    description: 'KPIs de importaciones por año y mes: operaciones, kg, costo, tipo de cambio y tops.',
    requiredPermission: PERM,
  });
  if (!b) return;

  const $ = (id) => document.getElementById(id);
  const c = $('pageContent');
  const MES = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const n0 = (v) => (Number(v) || 0).toLocaleString('es-MX', { maximumFractionDigits: 0 });
  const kg = (v) => (Number(v) || 0).toLocaleString('es-MX', { maximumFractionDigits: 0 });
  const compact = (v) => {
    v = Number(v) || 0; const a = Math.abs(v);
    if (a >= 1e6) return (v / 1e6).toFixed(2) + ' M';
    if (a >= 1e3) return (v / 1e3).toFixed(1) + ' K';
    return v.toFixed(0);
  };

  c.innerHTML = `
<div class="card">
  <div class="row">
    <div><div class="eyebrow">Comercio Exterior · Resumen</div><h2 style="margin:0">Resumen ejecutivo de importaciones</h2>
      <div class="muted" style="font-size:12px">Refleja los meses <strong>reconciliados</strong>. Reconcilia más periodos para verlos aquí.</div></div>
    <div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap">
      <div><label class="muted" style="font-size:12px;display:block">Año</label>
        <select id="anio" class="input" style="min-width:110px"></select></div>
      <div><label class="muted" style="font-size:12px;display:block">Mes</label>
        <select id="mes" class="input" style="min-width:130px"></select></div>
      <div><label class="muted" style="font-size:12px;display:block">Proveedor</label>
        <select id="prov" class="input" style="min-width:220px;max-width:280px"></select></div>
    </div>
  </div>
  <div id="kpis" style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap"></div>
  <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.04em;margin-top:14px;font-weight:700">Importaciones vs presupuesto (costeo teórico)</div>
  <div id="presupuesto" style="display:flex;gap:10px;margin-top:6px;flex-wrap:wrap"></div>
  <div id="dinero" style="margin-top:12px"></div>
</div>

<div class="card" style="margin-top:14px">
  <div class="row"><div><h3 style="margin:0">Desglose por modo de transporte</h3>
    <span class="muted" style="font-size:12px">Aéreo vs marítimo: dónde está el volumen y dónde pesa más el gasto.</span></div></div>
  <div style="overflow-x:auto;margin-top:8px"><table class="table" id="tModo" style="width:100%;font-size:12.5px;font-variant-numeric:tabular-nums"></table></div>
</div>

<div class="card" style="margin-top:14px">
  <div class="row"><div><h3 style="margin:0">Real vs presupuesto por mes</h3>
    <span class="muted" style="font-size:12px"><span style="color:#0891b2;font-weight:700">▮</span> Gasto real · <span style="color:#f59e0b;font-weight:700">▮</span> Presupuesto (teórico) · <span style="color:#166534;font-weight:700">barra real más corta = ahorro</span></span></div></div>
  <div style="display:flex;gap:18px;flex-wrap:wrap;margin-top:10px;align-items:flex-start">
    <div id="chart" style="flex:1 1 360px;min-width:320px;overflow-x:auto"></div>
    <div id="tableWrap" style="flex:1 1 500px;min-width:440px;overflow-x:auto"><table class="table" id="tMes" style="width:100%;font-size:12px;font-variant-numeric:tabular-nums"></table></div>
  </div>
</div>

<div style="display:flex;gap:14px;margin-top:14px;flex-wrap:wrap">
  <div class="card" style="flex:1;min-width:320px">
    <h3 style="margin:0 0 8px">Top 5 proveedores por costo (USD)</h3>
    <div id="topProv"></div>
  </div>
  <div class="card" style="flex:1;min-width:320px">
    <h3 style="margin:0 0 8px">Top 5 productos por costo (USD)</h3>
    <div id="topProd"></div>
  </div>
</div>`;

  function kpi(lab, val, sub, col) {
    return `<div style="flex:1;min-width:160px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:12px 16px">
      <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.03em">${lab}</div>
      <div style="font-size:26px;font-weight:800;color:${col || '#0f172a'};margin-top:2px">${val}</div>
      <div style="font-size:12px;color:#64748b">${sub || ''}</div></div>`;
  }

  // KPI de resultado (presupuesto) con banda de color y % sobre comparables.
  function resKpi(lab, val, sub, bg, co, bd) {
    return `<div style="flex:1;min-width:150px;background:${bg};border:1px solid ${bd};border-radius:10px;padding:10px 14px">
      <div style="font-size:11px;color:${co};text-transform:uppercase;letter-spacing:.03em;font-weight:700">${lab}</div>
      <div style="font-size:24px;font-weight:800;color:${co};margin-top:1px">${val}</div>
      <div style="font-size:11px;color:${co};opacity:.85">${sub || ''}</div></div>`;
  }

  const usd4 = (v) => (v == null ? '—' : Number(v).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 4 }));
  const pct1 = (v) => (v == null ? '—' : (Number(v) * 100).toFixed(1) + '%');
  function gmpPill(v) {
    if (v == null) return '—';
    const bg = v < 0.30 ? '#dcfce7' : v <= 0.60 ? '#fef9c3' : '#fee2e2';
    const co = v < 0.30 ? '#166534' : v <= 0.60 ? '#854d0e' : '#991b1b';
    return `<span style="font-weight:700;background:${bg};color:${co};padding:1px 8px;border-radius:999px">${pct1(v)}</span>`;
  }
  function utiPill(v) {
    if (v == null) return '—';
    const bg = v < 0.08 ? '#dcfce7' : v <= 0.15 ? '#fef9c3' : '#fee2e2';
    const co = v < 0.08 ? '#166534' : v <= 0.15 ? '#854d0e' : '#991b1b';
    return `<span style="font-weight:700;background:${bg};color:${co};padding:1px 8px;border-radius:999px">${pct1(v)}</span>`;
  }
  const MODO_INFO = { maritimo: ['🚢', 'Marítimo'], aereo: ['✈️', 'Aéreo'], terrestre: ['🚚', 'Terrestre'], general: ['📦', 'Sin modo'] };

  // Banner estrella: cuánto se ahorró (o se pasó) en USD vs el costeo teórico.
  function pintaDinero(t) {
    t = t || {};
    const dif = Number(t.dif_usd) || 0, real = Number(t.real_gastos_usd) || 0, teo = Number(t.teo_gastos_usd) || 0;
    const ahorro = dif < 0;
    const abs = Math.abs(dif);
    const pctVsTeo = teo > 0 ? abs / teo * 100 : 0;
    if (real === 0 && teo === 0) { $('dinero').innerHTML = ''; return; }
    const bg = ahorro ? '#f0fdf4' : '#fef2f2', bd = ahorro ? '#bbf7d0' : '#fecaca', co = ahorro ? '#166534' : '#991b1b';
    const titulo = ahorro ? '↓ Ahorro vs presupuesto' : '↑ Sobrecosto vs presupuesto';
    $('dinero').innerHTML = `
      <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:center;background:${bg};border:1px solid ${bd};border-radius:12px;padding:14px 18px">
        <div style="min-width:230px">
          <div style="font-size:11px;color:${co};text-transform:uppercase;letter-spacing:.04em;font-weight:700">${titulo}</div>
          <div style="font-size:30px;font-weight:800;color:${co};line-height:1.15">${ahorro ? '−' : '+'}$${n0(abs)} <span style="font-size:15px">USD</span></div>
          <div style="font-size:12px;color:${co};opacity:.85">${pctVsTeo.toFixed(1)}% ${ahorro ? 'por debajo del' : 'por encima del'} presupuesto (gastos flete+otros)</div>
        </div>
        <div style="display:flex;gap:22px;flex-wrap:wrap;font-size:13px;color:#334155">
          <div><div class="muted" style="font-size:11px">Gasto real</div><div style="font-weight:700">$${n0(real)} USD</div></div>
          <div style="align-self:center;color:#94a3b8;font-size:18px">vs</div>
          <div><div class="muted" style="font-size:11px">Presupuesto (teórico)</div><div style="font-weight:700">$${n0(teo)} USD</div></div>
        </div>
      </div>`;
  }

  // Tabla de desglose por modo + fila de eficiencia global (lentes ponderados).
  function tablaModo(rows) {
    const head = `<thead><tr style="border-bottom:2px solid #e2e8f0;text-align:right">
      <th style="text-align:left;padding:6px">Modo</th><th>Ops</th><th>Kg</th><th>Costo USD</th>
      <th style="background:#faf5ff;color:#7e22ce;padding:6px">Mercancía/kg</th><th>Gastos/kg</th><th>DDP/kg</th>
      <th style="background:#faf5ff;color:#7e22ce;padding:6px">Gastos/MP</th><th>UtiPor</th></tr></thead>`;
    if (!rows || !rows.length) return head + '<tbody><tr><td colspan="9" style="text-align:center;padding:14px;color:var(--muted)">Sin datos.</td></tr></tbody>';
    const tot = rows.reduce((a, r) => ({ kg: a.kg + (+r.kg || 0), costo: a.costo + (+r.costo_usd || 0), mp: a.mp + (+r.mercancia_usd || 0), fl: a.fl + (+r.flete_usd || 0), ot: a.ot + (+r.otros_usd || 0), ops: a.ops + (+r.ops || 0) }), { kg: 0, costo: 0, mp: 0, fl: 0, ot: 0, ops: 0 });
    const fila = (r, bold) => {
      const [ic, lab] = MODO_INFO[r.modo] || ['📦', r.modo];
      const k = +r.kg || 0, mp = +r.mercancia_usd || 0, fl = +r.flete_usd || 0, ot = +r.otros_usd || 0, costo = +r.costo_usd || 0;
      const gastos = fl + ot;
      const gmp = mp > 0 ? gastos / mp : null;
      const uti = (mp + fl) > 0 ? ot / (mp + fl) : null;
      const st = bold ? 'font-weight:800;background:#f8fafc' : '';
      return `<tr style="border-bottom:1px solid #f1f5f9;text-align:right;${st}">
        <td style="text-align:left;padding:6px;font-weight:700">${bold ? '∑ ' : ic + ' '}${lab}${bold ? '' : ` <span style="color:#94a3b8;font-weight:400">· ${r.ops} op(s)</span>`}</td>
        <td style="padding:6px">${bold ? r.ops : r.ops}</td>
        <td style="padding:6px">${kg(k)}</td>
        <td style="padding:6px;font-weight:700">$${n0(costo)}</td>
        <td style="padding:6px;background:#faf5ff;color:#7e22ce">$${usd4(k > 0 ? mp / k : null)}</td>
        <td style="padding:6px">$${usd4(k > 0 ? gastos / k : null)}</td>
        <td style="padding:6px">$${usd4(k > 0 ? costo / k : null)}</td>
        <td style="padding:6px">${gmpPill(gmp)}</td>
        <td style="padding:6px">${utiPill(uti)}</td></tr>`;
    };
    const body = rows.map(r => fila(r, false)).join('');
    const totalRow = rows.length > 1 ? fila({ modo: 'general', ops: tot.ops, kg: tot.kg, costo_usd: tot.costo, mercancia_usd: tot.mp, flete_usd: tot.fl, otros_usd: tot.ot }, true).replace('📦 Sin modo', 'Total periodo') : '';
    return head + '<tbody>' + body + totalRow + '</tbody>';
  }

  function pintaPresupuesto(R) {
    R = R || {};
    const bajo = +R.BajoTabulador || 0, sobre = +R.SobreTabulador || 0, dentro = +R.DentroBanda || 0;
    const sinTeo = +R.SinTeorico || 0, sinProv = +R.SinProveedor || 0, sinDat = +R.SinDatos || 0;
    const comparables = bajo + sobre + dentro; // operaciones que SÍ se midieron vs teórico
    const pc = (n) => comparables ? ` · ${(n / comparables * 100).toFixed(0)}%` : '';
    const noComp = sinTeo + sinProv + sinDat;
    $('presupuesto').innerHTML =
      resKpi('↓ Bajo presupuesto', n0(bajo), 'costó menos que el teórico' + pc(bajo), '#f0fdf4', '#166534', '#bbf7d0') +
      resKpi('↑ Sobre presupuesto', n0(sobre), 'costó más — revisar' + pc(sobre), '#fef2f2', '#991b1b', '#fecaca') +
      resKpi('✓ Dentro de banda', n0(dentro), 'dentro de tolerancia' + pc(dentro), '#ecfeff', '#0e7490', '#a5f3fc') +
      resKpi('◦ Sin comparar', n0(noComp), 'sin teórico / proveedor / datos', '#f8fafc', '#64748b', '#e2e8f0');
  }

  function chartMensual(rows) {
    if (!rows.length) return '<div class="muted" style="font-size:12px;padding:10px">Sin datos para el año.</div>';
    const W = 760, H = 250, padL = 20, padR = 20, padT = 20, padB = 30;
    const iw = W - padL - padR, ih = H - padT - padB, n = rows.length;
    const maxUsd = Math.max(...rows.map(r => Number(r.costo_usd) || 0), 1);
    const tcs = rows.map(r => Number(r.tc_prom) || 0).filter(x => x > 0);
    const tcLo = tcs.length ? Math.min(...tcs) : 0, tcHi = tcs.length ? Math.max(...tcs) : 1, band = (tcHi - tcLo) || 1;
    const bw = Math.min((iw / n) * 0.5, 46);
    const x = (i) => padL + iw * (i + 0.5) / n;
    // Bandas separadas: barras crecen desde abajo (máx 60% de la altura);
    // la línea de TC vive en una banda superior propia → no se enciman rótulos.
    const maxBarH = ih * 0.60;
    const tcTop = padT + 12, tcBot = padT + ih * 0.24;
    const yBar = (v) => padT + ih - (v / maxUsd) * maxBarH;
    const yTc = (v) => tcBot - ((v - tcLo) / band) * (tcBot - tcTop);
    let bars = '', labels = '', pts = [];
    rows.forEach((r, i) => {
      const v = Number(r.costo_usd) || 0, bx = x(i) - bw / 2, by = yBar(v), bh = padT + ih - by;
      bars += `<rect x="${bx}" y="${by}" width="${bw}" height="${Math.max(bh, 0)}" rx="3" fill="#0891b2" opacity="0.85"/>`;
      const tc = Number(r.tc_prom) || 0; if (tc > 0) pts.push([x(i), yTc(tc)]);
      const mm = String(r.periodo).slice(5);
      labels += `<text x="${x(i)}" y="${H - 10}" text-anchor="middle" font-size="11" fill="#64748b">${MES[+mm] || mm}</text>`;
      labels += `<text x="${x(i)}" y="${by - 4}" text-anchor="middle" font-size="10" fill="#0e7490" font-weight="700">${compact(v)}</text>`;
      if (tc > 0) labels += `<text x="${x(i)}" y="${yTc(tc) - 6}" text-anchor="middle" font-size="10" fill="#b45309">${tc.toFixed(2)}</text>`;
    });
    const line = pts.length > 1 ? `<polyline points="${pts.map(p => p.join(',')).join(' ')}" fill="none" stroke="#f59e0b" stroke-width="2"/>` : '';
    const dots = pts.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="3" fill="#f59e0b"/>`).join('');
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px;height:auto">${bars}${line}${dots}${labels}</svg>`;
  }

  const difCell = (v) => {
    const d = Number(v) || 0;
    if (!d) return '<td style="padding:6px;color:#94a3b8">—</td>';
    const co = d < 0 ? '#166534' : '#991b1b';
    return `<td style="padding:6px;font-weight:700;color:${co}">${d < 0 ? '−' : '+'}$${n0(Math.abs(d))}</td>`;
  };
  // Gráfica: gasto real (teal) vs presupuesto teórico (ámbar) por mes, con la
  // diferencia (ahorro/sobrecosto) rotulada abajo. Barra real < ppto = ahorro.
  function chartRealVsPpto(rows) {
    rows = (rows || []).filter(r => (Number(r.real_gastos_usd) || 0) + (Number(r.teo_gastos_usd) || 0) > 0);
    if (!rows.length) return '<div class="muted" style="font-size:12px;padding:10px">Sin operaciones comparables (con teórico) en el periodo.</div>';
    const n = rows.length, W = Math.max(300, Math.min(560, n * 92)), H = 270;
    const padL = 14, padR = 14, padT = 26, padB = 46;
    const iw = W - padL - padR, ih = H - padT - padB;
    const maxV = Math.max(...rows.map(r => Math.max(Number(r.real_gastos_usd) || 0, Number(r.teo_gastos_usd) || 0)), 1);
    const gw = iw / n, bw = Math.min(gw * 0.30, 26), gap = Math.min(gw * 0.06, 6);
    const y = (v) => padT + ih - (v / maxV) * ih;
    const base = padT + ih;
    let bars = '', labels = '';
    // línea base
    bars += `<line x1="${padL}" y1="${base}" x2="${W - padR}" y2="${base}" stroke="#e2e8f0" stroke-width="1"/>`;
    rows.forEach((r, i) => {
      const cx = padL + gw * (i + 0.5);
      const real = Number(r.real_gastos_usd) || 0, teo = Number(r.teo_gastos_usd) || 0, dif = Number(r.dif_usd) || 0;
      const xr = cx - bw - gap / 2, xt = cx + gap / 2, yr = y(real), yt = y(teo);
      bars += `<rect x="${xr}" y="${yr}" width="${bw}" height="${Math.max(base - yr, 0)}" rx="3" fill="#0891b2"/>`;
      bars += `<rect x="${xt}" y="${yt}" width="${bw}" height="${Math.max(base - yt, 0)}" rx="3" fill="#f59e0b" opacity="0.92"/>`;
      labels += `<text x="${xr + bw / 2}" y="${yr - 4}" text-anchor="middle" font-size="9" fill="#0e7490" font-weight="700">${compact(real)}</text>`;
      labels += `<text x="${xt + bw / 2}" y="${yt - 4}" text-anchor="middle" font-size="9" fill="#b45309" font-weight="700">${compact(teo)}</text>`;
      const mm = String(r.periodo).slice(5);
      labels += `<text x="${cx}" y="${H - 26}" text-anchor="middle" font-size="11" fill="#334155" font-weight="600">${MES[+mm] || mm}</text>`;
      const dcol = dif < 0 ? '#166534' : '#991b1b';
      labels += `<text x="${cx}" y="${H - 10}" text-anchor="middle" font-size="9.5" fill="${dcol}" font-weight="700">${dif < 0 ? '−' : '+'}$${compact(Math.abs(dif))}</text>`;
    });
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px;height:auto">${bars}${labels}</svg>`;
  }

  function tablaMes(rows) {
    const head = `<thead><tr style="border-bottom:2px solid #e2e8f0;text-align:right">
      <th style="text-align:left;padding:6px">Mes</th><th>Ops</th><th>Kg</th><th>Costo USD (DDP)</th>
      <th>Gasto real</th><th>Presupuesto</th><th>Dif vs ppto</th><th>TC prom.</th></tr></thead>`;
    if (!rows.length) return head + '<tbody><tr><td colspan="8" style="text-align:center;padding:14px;color:var(--muted)">Sin meses reconciliados en este periodo.</td></tr></tbody>';
    return head + '<tbody>' + rows.map(r => `<tr style="border-bottom:1px solid #f1f5f9;text-align:right">
      <td style="text-align:left;padding:6px;font-weight:700">${MES[+String(r.periodo).slice(5)] || r.periodo} ${String(r.periodo).slice(0, 4)}</td>
      <td style="padding:6px">${n0(r.operaciones)}</td>
      <td style="padding:6px">${kg(r.kg)}</td>
      <td style="padding:6px;font-weight:700;color:#0e7490">$${n0(r.costo_usd)}</td>
      <td style="padding:6px">$${n0(r.real_gastos_usd)}</td>
      <td style="padding:6px;color:#b45309">$${n0(r.teo_gastos_usd)}</td>
      ${difCell(r.dif_usd)}
      <td style="padding:6px;color:#b45309">${(Number(r.tc_prom) || 0).toFixed(2)}</td></tr>`).join('') + '</tbody>';
  }

  function topBars(items, labelFn) {
    if (!items || !items.length) return '<div class="muted" style="font-size:12px">Sin datos.</div>';
    const max = Math.max(...items.map(i => Number(i.usd ?? i.costo_usd) || 0), 1);
    return items.map(i => {
      const v = Number(i.usd ?? i.costo_usd) || 0, w = (v / max * 100).toFixed(1);
      return `<div style="margin:8px 0">
        <div style="display:flex;justify-content:space-between;gap:8px;font-size:12px"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${labelFn(i)}</span><span style="font-weight:700;white-space:nowrap">$${n0(v)}</span></div>
        <div style="height:9px;background:#eef2f7;border-radius:6px;margin-top:3px"><div style="height:9px;width:${w}%;background:#0891b2;border-radius:6px"></div></div></div>`;
    }).join('');
  }

  let provReady = false; // el select de proveedores se llena una vez

  async function cargar() {
    try {
      const anio = $('anio').value, mes = $('mes').value, prov = $('prov').value;
      const qs = [];
      if (anio) qs.push('anio=' + encodeURIComponent(anio));
      if (mes) qs.push('mes=' + encodeURIComponent(mes));
      if (prov && prov !== 'TODOS') qs.push('proveedor=' + encodeURIComponent(prov));
      const d = KoguApi.unwrapData(await KoguApi.apiFetch(BASE + (qs.length ? '?' + qs.join('&') : ''))) || {};

      const selA = $('anio');
      if (!selA.options.length && (d.anios || []).length) {
        selA.innerHTML = d.anios.map(a => `<option value="${esc(a)}" ${a === d.anio ? 'selected' : ''}>${esc(a)}</option>`).join('');
      }
      if (!(d.anios || []).length) selA.innerHTML = '<option value="">— sin datos —</option>';
      // Mes: Todos + Ene..Dic (una vez)
      if (!$('mes').options.length) {
        $('mes').innerHTML = '<option value="">Todos</option>' + MES.slice(1).map((m, i) => `<option value="${i + 1}">${m}</option>`).join('');
      }
      // Proveedor: Todos + lista (una vez, no se re-filtra al elegir uno)
      if (!provReady && (d.proveedores || []).length) {
        $('prov').innerHTML = '<option value="TODOS">Todos los proveedores</option>' + d.proveedores.map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join('');
        if (d.proveedor) $('prov').value = d.proveedor;
        provReady = true;
      }

      const t = d.totales || {};
      $('kpis').innerHTML =
        kpi('Operaciones', n0(t.operaciones)) +
        kpi('Kg importados', compact(t.kg), 'kg') +
        kpi('Costo total MXN', '$' + compact(t.costo_mxn), 'MXN') +
        kpi('Costo total USD', '$' + compact(t.costo_usd), 'USD', '#0e7490');
      pintaPresupuesto(d.resultados);
      pintaDinero(d.totales);
      $('tModo').innerHTML = tablaModo(d.porModo || []);
      $('chart').innerHTML = chartRealVsPpto(d.mensual || []);
      $('tMes').innerHTML = tablaMes(d.mensual || []);
      $('topProv').innerHTML = topBars((d.tops || {}).proveedores, (i) => esc(i.proveedor || '—'));
      $('topProd').innerHTML = topBars((d.tops || {}).productos, (i) => esc((i.cve_prod || '') + (i.nombre_corto ? ' · ' + i.nombre_corto : '')));
    } catch (e) { KoguApi.toast(e.message, 'error'); }
  }

  $('anio').addEventListener('change', cargar);
  $('mes').addEventListener('change', cargar);
  $('prov').addEventListener('change', cargar);
  KoguShell.subscribeEmpresaActivaChange(() => { $('anio').innerHTML = ''; $('mes').innerHTML = ''; $('prov').innerHTML = ''; provReady = false; cargar(); });
  cargar();
});

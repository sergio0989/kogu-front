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
</div>

<div class="card" style="margin-top:14px">
  <div class="row"><div><h3 style="margin:0">Tendencia mensual</h3>
    <span class="muted" style="font-size:12px"><span style="color:#0891b2;font-weight:700">▮</span> Costo USD por mes · <span style="color:#f59e0b;font-weight:700">━</span> TC pedimento promedio</span></div></div>
  <div id="chart" style="margin-top:10px;overflow-x:auto"></div>
  <div style="overflow-x:auto;margin-top:8px"><table class="table" id="tMes" style="width:100%;font-size:12.5px;font-variant-numeric:tabular-nums"></table></div>
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

  function tablaMes(rows) {
    const head = `<thead><tr style="border-bottom:2px solid #e2e8f0;text-align:right">
      <th style="text-align:left;padding:6px">Mes</th><th>Operaciones</th><th>Kg</th><th>Costo MXN</th><th>Costo USD</th><th>TC prom.</th></tr></thead>`;
    if (!rows.length) return head + '<tbody><tr><td colspan="6" style="text-align:center;padding:14px;color:var(--muted)">Sin meses reconciliados en este año.</td></tr></tbody>';
    return head + '<tbody>' + rows.map(r => `<tr style="border-bottom:1px solid #f1f5f9;text-align:right">
      <td style="text-align:left;padding:6px;font-weight:700">${MES[+String(r.periodo).slice(5)] || r.periodo} ${String(r.periodo).slice(0, 4)}</td>
      <td style="padding:6px">${n0(r.operaciones)}</td>
      <td style="padding:6px">${kg(r.kg)}</td>
      <td style="padding:6px">$${n0(r.costo_mxn)}</td>
      <td style="padding:6px;font-weight:700;color:#0e7490">$${n0(r.costo_usd)}</td>
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
      $('chart').innerHTML = chartMensual(d.mensual || []);
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

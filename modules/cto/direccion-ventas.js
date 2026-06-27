// ============================================================
// direccion-ventas.js — Costo (cto_): Dirección · Ventas.
// Foto ejecutiva de ventas para Dirección, en una sola hoja:
//   1) Resumen de ventas (banda KPIs + tendencia mensual + mezcla moneda)
//   2) Cumplimiento vs PP 2026 (presupuesto anual + proyección de cierre)
//   3) Análisis 80/20 (Pareto simple de venta por cliente / producto)
// Las secciones 1-2 reusan Radar Comercial: GET /protected/rc/kpis|alertas|pp
// (modo MXN). La sección 3 reusa Costo: GET /protected/cto/rentabilidad/:dim/:anio.
// NOTA: 1-2 salen de erp_ventas (Radar) y 3 de cto (ABC) — son dos fuentes;
// los totales no atan al peso entre sí (se indica en pantalla).
// Solo lectura. Degrada con elegancia si no hay permiso de Radar.
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/cto/direccion-ventas.html';
  const PERM = 'screen.costo';
  const BASE = '/protected/cto';
  const RC = '/protected/rc';
  const CHART_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js';

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Dirección · Ventas',
    description: 'Foto ejecutiva de ventas: resumen, cumplimiento vs presupuesto y análisis 80/20 por cliente y producto.',
    requiredPermission: PERM,
  });
  if (!b) return;

  const $ = (id) => document.getElementById(id);
  const now = new Date();
  const MESES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const MES3 = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

  // ── Formato ──────────────────────────────────────────────────────────────
  const money = (v) => (KoguUi && KoguUi.money) ? KoguUi.money(Number(v || 0)) : '$' + (Number(v) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const moneyC = (v) => { const n = Number(v || 0), abs = Math.abs(n); if (abs >= 1e6) { const m = Math.trunc(n / 1e3) / 1e3; return `$${m.toLocaleString('es-MX', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} M`; } return money(n); };
  const fmtMM = (v) => '$' + (Number(v) / 1e6).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' M';
  const fmtMon = (v) => '$' + (Number(v) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtNum = (v) => (Number(v) || 0).toLocaleString('es-MX');
  const nf0 = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 });
  const pct0 = (v) => (v == null ? '—' : `${(Number(v) * 100).toFixed(0)}%`);
  const esc = (s) => (KoguUi && KoguUi.escapeHtml) ? KoguUi.escapeHtml(String(s ?? '')) : String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const fmtDate = (d) => (KoguUi && KoguUi.fmtDate) ? KoguUi.fmtDate(d) : new Date(d).toLocaleDateString('es-MX');

  // ── Estado ───────────────────────────────────────────────────────────────
  let dim = 'cliente';
  let data = null;        // pareto: { dim, anio, mes, items, totales }
  let chart = null;
  let topN = 20;
  let rcKpis = [];        // filas KPI de Radar
  let rcAlertas = [];
  let pp = null;          // presupuesto anual vs real
  const ppOpen = new Set();
  let ppTablaOpen = false;
  let rcOk = true;        // ¿el usuario tiene acceso a Radar?

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if ([...document.scripts].some(s => s.src === src)) return resolve();
      const s = document.createElement('script'); s.src = src; s.onload = resolve;
      s.onerror = () => reject(new Error('No se pudo cargar ' + src));
      document.head.appendChild(s);
    });
  }

  // Tarjetas homologadas con el Radar.
  const statCard = (lbl, val, hint = '', accent = '#2563eb') => `
    <div style="border:1px solid var(--line,#e2e8f0);border-left:4px solid ${accent};border-radius:12px;padding:12px 14px;background:var(--panel,#fff)">
      <div style="font-size:10px;color:var(--muted,#64748b);text-transform:uppercase;letter-spacing:.04em">${esc(lbl)}</div>
      <div style="font-size:21px;font-weight:800;line-height:1.1;margin-top:3px;color:${accent}">${esc(val)}</div>
      ${hint ? `<div style="font-size:11px;color:var(--muted,#64748b);margin-top:1px">${esc(hint)}</div>` : ''}</div>`;
  const miniCard = (lbl, val, hint = '', color = '') => `
    <div style="border:1px solid var(--line,#e2e8f0);border-radius:10px;padding:9px 12px">
      <div style="font-size:10px;color:var(--muted,#64748b);text-transform:uppercase;letter-spacing:.03em">${esc(lbl)}</div>
      <div style="font-size:17px;font-weight:800;line-height:1.15;margin-top:1px;${color ? `color:${color}` : ''}">${esc(val)}</div>
      ${hint ? `<div style="font-size:10px;color:var(--muted,#64748b)">${esc(hint)}</div>` : ''}</div>`;

  $('pageContent').innerHTML = `
<div class="card">
  <div class="row">
    <div><div class="eyebrow">Costo · Dirección</div><h2 style="margin:2px 0">Ventas</h2>
      <div class="muted" style="font-size:12px" id="hdrMeta">Resumen, cumplimiento vs presupuesto y análisis 80/20</div></div>
    <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap">
      <div><label class="muted" style="font-size:12px;display:block">Año</label><input type="number" id="anio" class="input" style="width:100px" value="${now.getFullYear()}"/></div>
      <button class="btn primary" id="refreshBtn">Actualizar</button>
      <a class="btn ghost" href="/modules/cto/dashboard-bruta.html" style="white-space:nowrap;text-decoration:none">Utilidad Bruta →</a>
    </div>
  </div>
  <div id="msg" style="display:none;margin-top:14px;padding:12px;border-radius:6px;font-size:13px"></div>
</div>

<!-- ── 1) Resumen de ventas (Radar) ── -->
<div class="card" id="rcCard" style="margin-top:16px;display:none">
  <div class="row"><div><div class="eyebrow">Radar · Dirección</div><h2 style="margin:2px 0">Resumen de ventas</h2>
    <div class="muted" style="font-size:12px" id="rcMeta">—</div></div></div>
  <div id="kpiCards" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(176px,1fr));gap:10px;margin-top:16px"></div>
  <div class="split" style="margin-top:16px">
    <div style="border:1px solid var(--line,#e2e8f0);border-radius:12px;padding:16px;background:var(--panel,#fff)">
      <div class="eyebrow">Tendencia mensual</div><h3 style="margin:4px 0 12px">Venta por mes</h3><div id="trend"></div></div>
    <div style="border:1px solid var(--line,#e2e8f0);border-radius:12px;padding:16px;background:var(--panel,#fff)">
      <div class="eyebrow">Mezcla</div><h3 style="margin:4px 0 12px">Mercado y moneda</h3><div id="mezcla"></div></div>
  </div>
</div>

<!-- ── 2) Cumplimiento vs PP (Radar) ── -->
<div class="card" id="ppCard" style="margin-top:16px;display:none"></div>

<!-- ── 3) Análisis 80/20 (Costo) ── -->
<div class="card" id="paretoHead" style="margin-top:16px;display:none">
  <div class="row">
    <div><div class="eyebrow">Costo · Análisis</div><h2 style="margin:2px 0">Concentración 80/20</h2>
      <div class="muted" style="font-size:12px">De cuántas cuentas y productos depende la facturación (base ABC de Costo)</div></div>
    <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap">
      <div><label class="muted" style="font-size:12px;display:block">Periodo</label>
        <select id="mes" class="input" style="width:160px">
          <option value="acum">Acumulado (año)</option>
          ${MESES.slice(1).map((n, i) => `<option value="${i + 1}">${n}</option>`).join('')}
        </select></div>
    </div>
  </div>
  <div style="display:flex;gap:8px;margin-top:14px">
    <button class="tab" id="tabCliente">Por cliente</button>
    <button class="tab" id="tabProducto">Por producto</button>
  </div>
  <div id="msgP" style="display:none;margin-top:14px;padding:12px;border-radius:6px;font-size:13px"></div>
</div>

<div id="kpis" class="grid-3" style="margin-top:16px;gap:12px;display:none"></div>

<div class="card" id="chartCard" style="margin-top:16px;display:none">
  <div class="row"><h3 id="chartTitulo" style="margin:0">Pareto de ventas</h3>
    <span class="muted" style="font-size:12px" id="chartSub"></span></div>
  <div style="position:relative;height:380px;margin-top:12px"><canvas id="chartPareto"></canvas></div>
  <div class="muted" style="font-size:11px;margin-top:8px">Barras = venta del periodo (mayor a menor). Línea = % acumulado. La marca al 80% señala el grupo “vital”.</div>
</div>

<div class="card" id="tablaCard" style="margin-top:16px;display:none">
  <div class="row"><h3 id="tablaTitulo" style="margin:0">Grupo vital (hasta 80%)</h3>
    <span class="muted" style="font-size:12px" id="tablaSub"></span></div>
  <div style="overflow-x:auto;margin-top:10px"><table class="table" id="tabla" style="width:100%;font-size:13px;font-variant-numeric:tabular-nums"></table></div>
</div>`;

  function showMsg(el, html, tipo) {
    const m = $(el);
    const bg = tipo === 'error' ? '#fee2e2' : tipo === 'warn' ? '#fef9c3' : '#dcfce7';
    const co = tipo === 'error' ? '#991b1b' : tipo === 'warn' ? '#854d0e' : '#166534';
    m.style.cssText = `display:block;margin-top:14px;padding:12px;border-radius:6px;font-size:13px;background:${bg};color:${co}`;
    m.innerHTML = html;
  }

  // ============================================================
  // 1) Resumen de ventas (Radar) — banda KPIs + tendencia + mezcla
  // ============================================================
  const sumK = (arr, f) => arr.reduce((a, x) => a + Number(f(x) || 0), 0);

  function renderBanda() {
    const totMXN = sumK(rcKpis, k => k.subtotal_mxn);
    const totKg = sumK(rcKpis, k => k.cantidad);
    const nal = sumK(rcKpis.filter(k => k.mercado === 'NAL'), k => k.subtotal_mxn);
    const ext = sumK(rcKpis.filter(k => k.mercado === 'EXT'), k => k.subtotal_mxn);
    const usd = sumK(rcKpis.filter(k => k.moneda === 'USD'), k => k.subtotal_mxn);
    const pc = (v) => totMXN ? Math.round(100 * v / totMXN) : 0;
    const abiertas = rcAlertas.filter(a => a.status === 'abierta').length;
    $('kpiCards').innerHTML = [
      statCard('Venta total (MXN-eq)', money(totMXN), `${rcKpis.length} combinaciones`, '#2563eb'),
      statCard('Volumen total (kg)', `${nf0.format(totKg)} kg`, 'cantidad surtida', '#7c3aed'),
      statCard('Nacional', money(nal), `${pc(nal)}% del total`, '#059669'),
      statCard('Exportación', money(ext), `${pc(ext)}% del total`, '#4f46e5'),
      statCard('% en USD', `${pc(usd)}%`, 'exposición a tipo de cambio', '#d97706'),
      statCard('Alertas abiertas', String(abiertas), `${rcAlertas.length} en total`, '#dc2626'),
    ].join('');
  }

  function renderTrend() {
    const porMes = {};
    rcKpis.forEach(k => { porMes[k.mes] = (porMes[k.mes] || 0) + Number(k.subtotal_mxn || 0); });
    const meses = Object.keys(porMes).map(Number).sort((a, b) => a - b);
    const cont = $('trend');
    if (!meses.length) { cont.innerHTML = '<div class="muted">Sin datos</div>'; return; }
    const metaMes = pp && pp.totales ? Number(pp.totales.ventas_pp || 0) / 12 : null;
    const max = Math.max(...meses.map(m => porMes[m]), metaMes || 0);
    const wMeta = (metaMes != null && max) ? Math.round(100 * metaMes / max) : null;
    const rows = meses.map(m => {
      const v = porMes[m]; const w = max ? Math.round(100 * v / max) : 0;
      const cumple = metaMes != null && v >= metaMes;
      const barCol = metaMes == null ? '#2563eb' : (cumple ? '#16a34a' : '#2563eb');
      return `<div style="display:flex;align-items:center;gap:10px;margin:6px 0">
        <div style="width:34px;font-size:12px;color:var(--muted,#64748b)">${MES3[m] || m}</div>
        <div style="position:relative;flex:1;background:var(--panel2,#f1f5f9);border-radius:6px;height:18px">
          <div style="width:${w}%;min-width:2px;height:100%;background:${barCol};border-radius:6px"></div>
          ${wMeta != null ? `<div title="Meta mensual ${money(metaMes)}" style="position:absolute;top:-2px;left:${wMeta}%;width:2px;height:22px;background:var(--ink,#0f172a)"></div>` : ''}
        </div>
        <div style="width:140px;text-align:right;font-size:12px">${money(v)}</div>
      </div>`;
    }).join('');
    const legend = metaMes != null
      ? `<div class="muted" style="margin-top:8px;font-size:11px">▎Marcador = meta mensual (PP ÷ 12 = ${money(metaMes)}). Verde = el mes alcanza la meta.</div>`
      : '';
    cont.innerHTML = rows + legend;
  }

  function renderMezcla() {
    const total = sumK(rcKpis, k => k.subtotal_mxn) || 1;
    const grupos = [
      ['Nacional MXN', 'NAL', 'MXN', '#059669'],
      ['Nacional USD', 'NAL', 'USD', '#10b981'],
      ['Exportación MXN', 'EXT', 'MXN', '#4f46e5'],
      ['Exportación USD', 'EXT', 'USD', '#6366f1'],
    ];
    $('mezcla').innerHTML = grupos.map(([lbl, merc, mon, col]) => {
      const v = sumK(rcKpis.filter(k => k.mercado === merc && k.moneda === mon), k => k.subtotal_mxn); if (!v) return '';
      const p = Math.round(100 * v / total);
      return `<div style="padding:8px 0">
        <div style="display:flex;justify-content:space-between;margin-bottom:5px">
          <span style="font-weight:600">${lbl}</span>
          <span style="font-weight:700">${money(v)} <span style="color:var(--muted,#64748b);font-weight:400">(${p}%)</span></span>
        </div>
        <div style="background:var(--panel2,#f1f5f9);border-radius:6px;height:8px;overflow:hidden"><div style="width:${p}%;height:100%;background:${col}"></div></div>
      </div>`;
    }).join('') || '<div class="muted">Sin datos</div>';
  }

  // ============================================================
  // 2) Cumplimiento vs PP (Radar) — modo MXN
  // ============================================================
  const ppVal = (o) => Number(o.ventas_pp || 0);
  const realVal = (o) => Number(o.ventas_real || 0);
  const avVal = (o) => { const p = ppVal(o); return p ? realVal(o) / p : null; };
  function semColor(av, ritmo) {
    if (av == null || !ritmo) return 'var(--muted,#64748b)';
    const r = av / ritmo;
    return r >= 0.95 ? '#16a34a' : r >= 0.8 ? '#d97706' : '#dc2626';
  }

  function renderPp() {
    const el = $('ppCard');
    if (!pp) { el.style.display = 'none'; el.innerHTML = ''; return; }
    el.style.display = 'block';
    if (pp.sin_pp) {
      el.innerHTML = `<div class="row"><div><div class="eyebrow">Radar · Presupuesto</div><h2 style="margin:2px 0">Cumplimiento vs PP ${pp.anio}</h2></div></div>
        <div class="muted" style="margin-top:10px">No hay presupuesto (PP) cargado para ${pp.anio}.${pp.anios && pp.anios.length ? ` Disponibles: ${pp.anios.join(', ')}.` : ''}</div>`;
      return;
    }
    const t = pp.totales, ritmo = Number(t.ritmo_esperado || 0);
    const av = avVal(t), col = semColor(av, ritmo);
    const ultv = t.ult_venta ? fmtDate(t.ult_venta).split(',')[0] : '—';
    const sc = pp.sin_cruce || { ventas_real: 0 };
    const scVal = Number(sc.ventas_real || 0);
    const cob = t.cobertura_ventas;

    const head = `<div class="row" style="align-items:flex-start">
      <div><div class="eyebrow">Radar · Presupuesto</div><h2 style="margin:2px 0">Cumplimiento vs PP ${pp.anio}</h2>
        <div class="muted" style="margin-top:4px;font-size:12px">Métrica: <b>venta (MXN)</b> · última venta ${ultv} · ritmo esperado <b>${pct0(ritmo)}</b> del año</div></div>
      <span style="display:inline-block;padding:4px 12px;border-radius:999px;font-weight:700;color:#fff;background:${col}">${pct0(av)} del PP</span></div>`;

    const mesesTrans = t.ult_venta ? (new Date(t.ult_venta).getUTCMonth() + 1) : null;
    const metaCorte = mesesTrans ? ppVal(t) / 12 * mesesTrans : null;
    const cumplCorte = metaCorte ? realVal(t) / metaCorte : null;
    const cumplCol = cumplCorte == null ? 'var(--muted,#64748b)' : (cumplCorte >= 1 ? '#16a34a' : cumplCorte >= 0.9 ? '#d97706' : '#dc2626');
    const cards = `<div class="grid-4" style="gap:10px;margin-top:14px">
      ${miniCard(`PP ${pp.anio} (MXN)`, moneyC(ppVal(t)), 'presupuesto anual')}
      ${miniCard('Real a la fecha', moneyC(realVal(t)), `${pct0(av)} del PP · ritmo ${pct0(ritmo)}`, col)}
      ${miniCard(`Meta al corte (${mesesTrans || 0} m)`, metaCorte != null ? moneyC(metaCorte) : '—', `PP ÷ 12 × ${mesesTrans || 0} meses`)}
      ${miniCard('Cumplimiento al corte', pct0(cumplCorte), 'real ÷ meta al corte', cumplCol)}</div>
      ${scVal > 0 ? `<div class="muted" style="margin-top:8px;font-size:12px">El total de arriba ya es comparable (venta total al corte vs PP). Cobertura de mapeo a sublíneas: <b>${pct0(cob)}</b> · sin cruce <b>${moneyC(scVal)}</b> — se atribuye al cargar el puente sub_cse→sublínea (rc_pp_map).</div>` : ''}`;

    const barW = Math.min(100, Math.round((av || 0) * 100));
    const ritW = Math.min(100, Math.round(ritmo * 100));
    const bar = `<div style="margin-top:14px">
      <div style="position:relative;background:var(--panel2,#f1f5f9);border-radius:8px;height:22px;overflow:hidden">
        <div style="width:${barW}%;height:100%;background:${col};transition:width .3s"></div>
        <div title="Ritmo esperado ${pct0(ritmo)}" style="position:absolute;top:-2px;left:${ritW}%;width:2px;height:26px;background:var(--ink,#0f172a)"></div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--muted,#64748b);margin-top:3px">
        <span>Avance ${pct0(av)}</span><span>Marcador = ritmo esperado ${pct0(ritmo)}</span><span>PP 100%</span></div></div>`;

    // Proyección de cierre
    const realA = realVal(t), ppA = ppVal(t);
    const mesesT = Number(t.meses_transcurridos) || (t.ult_venta ? new Date(t.ult_venta).getUTCMonth() + 1 : 0);
    const promBack = t.promedio_mensual_ventas;
    const promMes = promBack != null ? Number(promBack) : (mesesT ? realA / mesesT : 0);
    const proyBack = t.proyeccion_cierre_ventas;
    const proy = proyBack != null ? Number(proyBack) : promMes * 12;
    const proyPct = (proy != null && ppA) ? proy / ppA : null;
    const faltante = (proy != null) ? Math.max(0, ppA - proy) : null;
    const proyCol = proyPct == null ? 'var(--muted,#64748b)' : (proyPct >= 0.98 ? '#16a34a' : proyPct >= 0.9 ? '#d97706' : '#dc2626');
    const mesesRest = Math.max(1, 12 - mesesT);
    const necesarioMes = (ppA - realA) > 0 ? (ppA - realA) / mesesRest : 0;
    const proyBlock = `<div style="display:flex;align-items:center;gap:8px;margin:16px 0 8px">
        <div class="eyebrow" style="margin:0">Proyección a fin de año · promedio mensual × 12</div>
        <button class="btn" id="proyInfoBtn" title="¿Cómo se calcula la proyección?" style="padding:2px 9px;font-size:12px">ℹ ¿Cómo se calcula?</button></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px">
        ${miniCard('Promedio de ventas mensual', moneyC(promMes), `real ÷ ${mesesT || 0} meses`)}
        ${miniCard('Proyección de cierre', moneyC(proy), `vs PP ${moneyC(ppA)}`, proyCol)}
        ${miniCard('% del PP proyectado', pct0(proyPct), proyPct != null && proyPct < 1 ? 'cerraría por debajo' : 'cerraría en meta', proyCol)}
        ${miniCard('Faltante proyectado', faltante ? moneyC(faltante) : '—', 'para alcanzar el PP', faltante > 0 ? '#dc2626' : '')}
        ${miniCard('Ritmo mensual requerido', moneyC(necesarioMes), `para cerrar el PP (~${mesesRest} meses)`)}</div>`;

    // Tabla por categoría (colapsable)
    const filaCat = (c) => {
      const a = avVal(c), cc = semColor(a, ritmo);
      const open = ppOpen.has(c.cat);
      const subs = open ? c.sublineas.map(s => {
        const sa = avVal(s), scol = semColor(sa, ritmo);
        return `<tr style="background:var(--panel2,#f8fafc)">
          <td style="padding-left:26px"><span class="chip-compact">${esc(s.cve_sublinea)}</span> ${esc(s.sublinea_nombre)}${s.mapeado ? '' : ' <span style="color:#d97706;font-size:11px">·sin cruce</span>'}</td>
          <td style="text-align:right">${money(ppVal(s))}</td>
          <td style="text-align:right">${money(realVal(s))}</td>
          <td style="text-align:right;font-weight:600;color:${scol}">${pct0(sa)}</td></tr>`;
      }).join('') : '';
      return `<tr data-cat="${c.cat}" style="cursor:pointer">
          <td><span style="display:inline-block;width:14px;color:var(--muted,#64748b)">${open ? '▾' : '▸'}</span><b>${esc(c.cat_nombre || ('Categoría ' + c.cat))}</b> <span style="color:var(--muted,#64748b);font-size:11px">(${c.sublineas.length})</span></td>
          <td style="text-align:right">${money(ppVal(c))}</td>
          <td style="text-align:right">${money(realVal(c))}</td>
          <td style="text-align:right;font-weight:700;color:${cc}">${pct0(a)}</td></tr>${subs}`;
    };
    const sinMapeo = !cob || cob < 0.001;
    const bannerCat = sinMapeo
      ? `<div class="muted" style="margin:10px 0 0;padding:10px 12px;background:var(--panel2,#f1f5f9);border-radius:10px;font-size:12px">El <b>desglose por categoría</b> requiere el puente <b>sub_cse→sublínea</b> (<code>rc_pp_map</code>), aún pendiente. El <b>total al corte ya es correcto</b> arriba.</div>` : '';
    const cuerpo = `${bannerCat}<div class="table-wrap" style="margin-top:8px"><table><thead><tr>
        <th>Categoría</th><th style="text-align:right">PP ${pp.anio}</th><th style="text-align:right">Real</th><th style="text-align:right">Avance</th>
      </tr></thead><tbody>${pp.categorias.map(filaCat).join('')}</tbody></table></div>`;
    const tabla = `<div id="ppCatHead" class="eyebrow" style="margin:18px 0 0;cursor:pointer;display:flex;align-items:center;gap:8px;user-select:none">
        <span style="display:inline-block;width:12px">${ppTablaOpen ? '▾' : '▸'}</span>Avance por categoría (MXN)
        <span style="color:var(--muted,#64748b);font-weight:400;font-size:11px;text-transform:none">· ${pp.categorias.length} categorías · ${ppTablaOpen ? 'clic para ocultar' : 'clic para mostrar'}</span>
      </div>${ppTablaOpen ? cuerpo : ''}`;

    el.innerHTML = head + cards + bar + proyBlock + tabla;
    const proyBtn = el.querySelector('#proyInfoBtn');
    if (proyBtn) proyBtn.onclick = openProyeccion;
    const catHead = el.querySelector('#ppCatHead');
    if (catHead) catHead.onclick = () => { ppTablaOpen = !ppTablaOpen; renderPp(); };
    el.querySelectorAll('tr[data-cat]').forEach(tr => tr.onclick = () => {
      const cat = Number(tr.dataset.cat);
      if (ppOpen.has(cat)) ppOpen.delete(cat); else ppOpen.add(cat);
      renderPp();
    });
  }

  function openProyeccion() {
    if (!pp || !pp.totales) return;
    const t = pp.totales;
    const realA = realVal(t), ppA = ppVal(t);
    const mesesT = Number(t.meses_transcurridos) || (t.ult_venta ? new Date(t.ult_venta).getUTCMonth() + 1 : 0);
    const promBack = t.promedio_mensual_ventas;
    const promMes = promBack != null ? Number(promBack) : (mesesT ? realA / mesesT : 0);
    const proyBack = t.proyeccion_cierre_ventas;
    const proy = proyBack != null ? Number(proyBack) : promMes * 12;
    const proyPct = (proy != null && ppA) ? proy / ppA : null;
    const faltante = proy != null ? Math.max(0, ppA - proy) : null;
    const mesesRest = Math.max(1, 12 - mesesT);
    const necesarioMes = (ppA - realA) > 0 ? (ppA - realA) / mesesRest : 0;
    const ultv = t.ult_venta ? fmtDate(t.ult_venta).split(',')[0] : '—';
    const paso = (n, titulo, formula, resultado) => `
      <div style="display:flex;gap:12px;align-items:flex-start;padding:10px 0;border-bottom:1px solid var(--line,#e2e8f0)">
        <div style="flex:none;width:24px;height:24px;border-radius:50%;background:#2563eb;color:#fff;font-weight:700;font-size:12px;display:flex;align-items:center;justify-content:center">${n}</div>
        <div style="flex:1"><div style="font-weight:700;font-size:14px">${titulo}</div>
          <div style="font-size:13px;color:var(--muted,#64748b);margin-top:2px">${formula}</div>
          <div style="font-size:14px;font-weight:700;margin-top:4px">${resultado}</div></div></div>`;
    const html = `<div id="rcProyModal" style="position:fixed;inset:0;z-index:9999;background:rgba(15,23,42,.55);display:flex;justify-content:center;align-items:flex-start;overflow:auto;padding:32px 16px">
        <div style="background:var(--panel,#fff);border-radius:16px;max-width:720px;width:100%;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,.3)">
          <div class="row" style="align-items:flex-start;margin-bottom:8px">
            <div><div class="eyebrow">Radar · Presupuesto</div><h2 style="margin:4px 0 0">Cómo se calcula la proyección de cierre</h2></div>
            <button class="btn" id="rcProyClose">Cerrar ✕</button></div>
          <div style="background:var(--panel2,#f1f5f9);border-radius:10px;padding:12px;margin-bottom:14px;font-size:13px;color:var(--muted,#64748b)">
            <b>Idea.</b> Sacamos el <b>promedio de venta por mes</b> observado hasta el corte y lo extrapolamos a los 12 meses del año. Corte al <b>${ultv}</b> · PP ${pp.anio} = <b>${money(ppA)}</b>.</div>
          ${paso(1, 'Meses transcurridos', 'Mes del año al que corresponde la última venta cargada.', `= <b>${mesesT || 0} meses</b> (al ${ultv})`)}
          ${paso(2, 'Promedio de ventas mensual', 'Real a la fecha ÷ meses transcurridos.', `${money(realA)} ÷ ${mesesT || 0} = <b>${money(promMes)}/mes</b>`)}
          ${paso(3, 'Proyección de cierre', 'Promedio mensual × 12.', `${money(promMes)} × 12 = <b>${money(proy)}</b>`)}
          ${paso(4, '% del PP proyectado', 'Proyección de cierre ÷ PP anual.', `${money(proy)} ÷ ${money(ppA)} = <b>${pct0(proyPct)}</b>`)}
          ${paso(5, 'Faltante proyectado', 'PP anual − Proyección de cierre.', `${money(ppA)} − ${money(proy)} = <b>${faltante ? money(faltante) : '—'}</b>`)}
          ${paso(6, 'Ritmo mensual requerido', 'Lo que falta del PP ÷ meses restantes del año.', `(${money(ppA)} − ${money(realA)}) ÷ ${mesesRest} meses = <b>${money(necesarioMes)}/mes</b>`)}
          <div style="font-size:12px;color:var(--muted,#64748b);margin-top:10px"><b>Límites.</b> Es una proyección <b>lineal</b>: no modela estacionalidad. El corte usa la <b>última fecha de venta cargada</b> (${ultv}), no hoy.</div>
        </div></div>`;
    $('rcProyModal')?.remove();
    document.body.insertAdjacentHTML('beforeend', html);
    const modal = $('rcProyModal');
    $('rcProyClose').onclick = () => modal.remove();
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  }

  async function cargarRC() {
    const anio = parseInt($('anio').value, 10);
    try {
      const [kRes, aRes] = await Promise.all([
        KoguApi.apiFetch(`${RC}/kpis?anio=${anio}`),
        KoguApi.apiFetch(`${RC}/alertas`).catch(() => null),
      ]);
      rcKpis = KoguApi.unwrapRows(kRes);
      rcAlertas = aRes ? KoguApi.unwrapRows(aRes) : [];
      try { const ppRes = await KoguApi.apiFetch(`${RC}/pp?anio=${anio}`); pp = ppRes && ppRes.data ? ppRes.data : ppRes; }
      catch (_e) { pp = null; }
      rcOk = true;
      $('hdrMeta').textContent = 'Resumen, cumplimiento vs presupuesto y análisis 80/20';
      const calc = (kRes && kRes.data && kRes.data.calculado_at) || null;
      $('rcMeta').textContent = calc ? `Última actualización: ${fmtDate(calc)} · ${rcKpis.length} filas KPI` : `${rcKpis.length} filas KPI`;
      $('rcCard').style.display = rcKpis.length ? 'block' : 'none';
      if (rcKpis.length) { renderBanda(); renderTrend(); renderMezcla(); }
      renderPp();
    } catch (e) {
      // 403 u otro → el usuario probablemente no tiene Radar. Ocultar sin romper.
      rcOk = false; rcKpis = []; rcAlertas = []; pp = null;
      $('rcCard').style.display = 'none';
      $('ppCard').style.display = 'none';
      $('hdrMeta').textContent = 'Resumen y PP requieren acceso a Radar Comercial · mostrando solo el análisis 80/20';
    }
  }

  // ============================================================
  // 3) Análisis 80/20 (Costo)
  // ============================================================
  function syncTabs() {
    $('tabCliente').className = 'tab' + (dim === 'cliente' ? ' active' : '');
    $('tabProducto').className = 'tab' + (dim === 'producto' ? ' active' : '');
  }

  function kpi(label, val, sub, accent) {
    return `<div class="card" style="padding:16px;${accent ? 'border-top:3px solid ' + accent : ''}">
      <div class="muted" style="font-size:12px">${label}</div>
      <div style="font-size:22px;font-weight:700;margin-top:4px">${val}</div>
      ${sub ? `<div class="muted" style="font-size:12px;margin-top:2px">${sub}</div>` : ''}</div>`;
  }

  function pareto() {
    const arr = [...data.items].filter(r => Number(r.ventas) > 0).sort((a, b) => b.ventas - a.ventas);
    const total = arr.reduce((s, r) => s + Number(r.ventas), 0);
    let acum = 0;
    const rows = arr.map((r, i) => {
      acum += Number(r.ventas);
      return { ...r, rank: i + 1, acum, acumPct: total ? (acum / total) * 100 : 0, pct: total ? (Number(r.ventas) / total) * 100 : 0 };
    });
    const cuenta = (umbral) => { const f = rows.find(r => r.acumPct >= umbral); return f ? f.rank : rows.length; };
    const top10 = rows.slice(0, 10).reduce((s, r) => s + Number(r.ventas), 0);
    return { rows, total, n80: cuenta(80), top10pct: total ? (top10 / total) * 100 : 0, count: rows.length };
  }

  function pintarKpisP(p) {
    const etq = dim === 'cliente' ? 'clientes' : 'productos';
    const pctVital = p.count ? (p.n80 / p.count) * 100 : 0;
    const colaN = p.count - p.n80;
    const acumVital = p.rows[p.n80 - 1] ? p.rows[p.n80 - 1].acumPct : 80;
    const colaPct = Math.max(0, 100 - acumVital);
    $('kpis').style.display = 'grid';
    $('kpis').innerHTML = [
      kpi('80% de la venta', `${fmtNum(p.n80)} ${etq}`, `de ${fmtNum(p.count)} (${pctVital.toFixed(0)}%) · "los vitales"`, '#0d9488'),
      kpi('Top 10 concentra', p.top10pct.toFixed(1) + ' %', 'de la venta total del periodo', '#0ea5e9'),
      kpi('Cola larga', `${fmtNum(colaN)} ${etq}`, `aportan solo el ${colaPct.toFixed(0)}% restante`, '#94a3b8'),
    ].join('');
  }

  async function pintarChart(p) {
    try { await loadScript(CHART_SRC); } catch (_e) { return; }
    const Chart = window.Chart;
    if (chart) { chart.destroy(); chart = null; }
    const top = p.rows.slice(0, topN);
    const labels = top.map(r => r.nombre ? (r.nombre.length > 22 ? r.nombre.slice(0, 21) + '…' : r.nombre) : r.clave);
    chart = new Chart($('chartPareto'), {
      data: {
        labels,
        datasets: [
          { type: 'bar', label: 'Venta', data: top.map(r => Number(r.ventas)), backgroundColor: '#185FA5', yAxisID: 'y', order: 3, maxBarThickness: 34 },
          { type: 'line', label: '% acumulado', data: top.map(r => r.acumPct), borderColor: '#0d9488', backgroundColor: '#0d9488', yAxisID: 'y1', tension: 0.2, pointRadius: 2, borderWidth: 2, order: 1 },
          { type: 'line', label: '80%', data: top.map(() => 80), borderColor: '#94a3b8', borderDash: [4, 4], yAxisID: 'y1', pointRadius: 0, borderWidth: 1, order: 2 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { font: { size: 12 }, filter: (it) => it.text !== '80%' } },
          tooltip: {
            callbacks: {
              title: (items) => { const r = top[items[0].dataIndex]; return (r.nombre || r.clave) + ' · ' + r.clave; },
              label: (c) => c.dataset.type === 'bar' ? 'Venta: ' + fmtMon(c.raw) : c.dataset.label + ': ' + Number(c.raw).toFixed(1) + '%',
            },
          },
        },
        scales: {
          y: { position: 'left', beginAtZero: true, ticks: { callback: (v) => '$' + (v / 1e6).toFixed(1) + 'M', font: { size: 12 } }, grid: { display: false } },
          y1: { position: 'right', min: 0, max: 100, ticks: { callback: (v) => v + '%', font: { size: 12 } }, grid: { display: false } },
          x: { ticks: { autoSkip: false, maxRotation: 55, minRotation: 45, font: { size: 10 } }, grid: { display: false } },
        },
      },
    });
  }

  function pintarTabla(p) {
    const etq = dim === 'cliente' ? 'Cliente' : 'Producto';
    const vital = p.rows.slice(0, p.n80);
    const head = `<thead><tr style="border-bottom:2px solid #e2e8f0;text-align:right">
      <th style="text-align:left;padding:6px">#</th><th style="text-align:left;padding:6px">Clave</th>
      <th style="text-align:left;padding:6px">${etq}</th><th style="padding:6px">Venta</th>
      <th style="padding:6px">% del total</th><th style="padding:6px">% acumulado</th></tr></thead>`;
    const rows = vital.map(r => `<tr style="border-bottom:1px solid #f1f5f9;text-align:right">
      <td style="text-align:left;padding:6px;color:#94a3b8">${r.rank}</td>
      <td style="text-align:left;padding:6px">${esc(r.clave)}</td>
      <td style="text-align:left;padding:6px;font-weight:600">${esc(r.nombre || '—')}</td>
      <td style="padding:6px">${fmtMon(r.ventas)}</td>
      <td style="padding:6px">${r.pct.toFixed(1)} %</td>
      <td style="padding:6px;font-weight:600">${r.acumPct.toFixed(1)} %</td></tr>`).join('');
    const colaN = p.count - p.n80;
    const colaVentas = p.rows.slice(p.n80).reduce((s, r) => s + Number(r.ventas), 0);
    const cola = colaN > 0 ? `<tr style="border-top:2px solid #cbd5e1;background:#f8fafc;text-align:right">
      <td style="text-align:left;padding:6px" colspan="3">+ ${fmtNum(colaN)} ${dim === 'cliente' ? 'clientes' : 'productos'} en la cola larga</td>
      <td style="padding:6px">${fmtMon(colaVentas)}</td>
      <td style="padding:6px">${p.total ? (colaVentas / p.total * 100).toFixed(1) : 0} %</td>
      <td style="padding:6px">100.0 %</td></tr>` : '';
    $('tabla').innerHTML = head + '<tbody>' + rows + cola + '</tbody>';
    const per = data.mes && data.mes !== 'acum' ? MESES[data.mes] : `Acumulado ${data.anio}`;
    $('tablaTitulo').textContent = `Grupo vital — ${p.n80} ${dim === 'cliente' ? 'clientes' : 'productos'} = 80% de la venta`;
    $('tablaSub').textContent = `${per} · ${fmtMM(p.total)} en total`;
  }

  async function cargarPareto() {
    const anio = parseInt($('anio').value, 10);
    if (!anio) return KoguApi.toast('Indica el año.', 'error');
    const mes = $('mes').value;
    try {
      const res = await KoguApi.apiFetch(`${BASE}/rentabilidad/${dim}/${anio}?mes=${encodeURIComponent(mes)}`);
      data = KoguApi.unwrapData(res);
      if (!data || !data.items || !data.items.length) {
        $('kpis').style.display = $('chartCard').style.display = $('tablaCard').style.display = 'none';
        showMsg('msgP', 'Sin datos de Costo para el periodo. Calcula el mes en "Costo de ventas / Utilidad".', 'warn');
        return;
      }
      $('msgP').style.display = 'none';
      $('chartCard').style.display = $('tablaCard').style.display = 'block';
      const p = pareto();
      const etq = dim === 'cliente' ? 'clientes' : 'productos';
      $('chartTitulo').textContent = `Pareto de ventas por ${dim}`;
      $('chartSub').textContent = `Top ${Math.min(topN, p.count)} de ${fmtNum(p.count)} ${etq}`;
      pintarKpisP(p); await pintarChart(p); pintarTabla(p);
    } catch (e) {
      $('kpis').style.display = $('chartCard').style.display = $('tablaCard').style.display = 'none';
      showMsg('msgP', '❌ ' + e.message, 'error');
    }
  }

  // ── Orquestación ─────────────────────────────────────────────────────────
  async function cargarTodo() {
    const anio = parseInt($('anio').value, 10);
    if (!anio) return KoguApi.toast('Indica el año.', 'error');
    $('refreshBtn').disabled = true;
    $('paretoHead').style.display = 'block';
    try {
      await cargarRC();
      await cargarPareto();
    } finally { $('refreshBtn').disabled = false; }
  }

  function cambiarDim(nuevo) { if (dim === nuevo) return; dim = nuevo; syncTabs(); cargarPareto(); }

  $('tabCliente').addEventListener('click', () => cambiarDim('cliente'));
  $('tabProducto').addEventListener('click', () => cambiarDim('producto'));
  $('refreshBtn').addEventListener('click', cargarTodo);
  $('anio').addEventListener('change', cargarTodo);
  $('mes').addEventListener('change', cargarPareto);
  KoguShell.subscribeEmpresaActivaChange(() => cargarTodo());

  syncTabs();
  cargarTodo();
});

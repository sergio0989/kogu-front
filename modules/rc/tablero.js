document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/rc/tablero.html';
  const BASE = '/protected/rc';
  const PERM = 'screen.ventas.direccion';

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Tablero Radar Comercial',
    description: 'Foto ejecutiva de ventas por empresa. Vista Dirección · Radar Comercial.',
    requiredPermission: PERM,
  });
  if (!b) return;

  const anioActual = new Date().getFullYear();

  const c = document.getElementById('pageContent');
  c.innerHTML = `
<div class="stack" style="gap:20px">

  <!-- ── Barra superior ── -->
  <div class="card">
    <div class="row">
      <div>
        <div class="eyebrow">Radar · Dirección</div>
        <h2>Resumen de ventas</h2>
        <div class="hint" id="metaInfo" style="margin-top:4px;color:var(--muted)">—</div>
      </div>
      <div style="display:flex;gap:10px;align-items:center">
        <select class="select" id="metricaFil" style="max-width:160px">
          <option value="dinero">$ Dinero (MXN)</option>
          <option value="cantidad">⚖ Cantidad (kg)</option>
        </select>
        <select class="select" id="anioFil" style="max-width:120px"></select>
        <button class="btn" id="reglasBtn" title="¿Cómo se calculan las alertas?">ℹ Reglas</button>
        <button class="btn" id="recalcBtn">↻ Recalcular</button>
      </div>
    </div>
    <div style="margin-top:14px">
      <div style="max-width:340px">
        <div class="label-text">Periodo comparativo (reglas RC-005/006)</div>
        <select class="select" id="presetFil">
          <option value="auto">Automático (2 meses vs 2 meses)</option>
          <option value="mes">Mes vs mes anterior</option>
          <option value="custom">Personalizado</option>
        </select>
      </div>
      <div id="customPeriodos" style="display:none;margin-top:14px">
        <div class="grid-2" style="gap:16px">
          <div style="border:1px solid var(--line);border-radius:12px;padding:14px">
            <div class="eyebrow" style="margin-bottom:10px">Periodo 1 (base)</div>
            <div class="grid-2" style="gap:10px">
              <div><div class="label-text">Desde</div><input class="input" id="p1d" type="date"/></div>
              <div><div class="label-text">Hasta</div><input class="input" id="p1h" type="date"/></div>
            </div>
          </div>
          <div style="border:1px solid var(--line);border-radius:12px;padding:14px">
            <div class="eyebrow" style="margin-bottom:10px">Periodo 2 (comparado)</div>
            <div class="grid-2" style="gap:10px">
              <div><div class="label-text">Desde</div><input class="input" id="p2d" type="date"/></div>
              <div><div class="label-text">Hasta</div><input class="input" id="p2h" type="date"/></div>
            </div>
          </div>
        </div>
        <div class="hint" style="margin-top:8px;color:var(--muted);font-size:12px">
          Fechas inclusivas. La variación se calcula (P2 − P1) / P1.
        </div>
      </div>
    </div>
  </div>

  <!-- ── KPIs ── -->
  <div id="kpiCards" class="grid-4" style="gap:16px"></div>

  <!-- ── Presupuesto anual (PP) vs real ── -->
  <div class="card" id="ppCard"></div>

  <!-- ── Tendencia mensual + mezcla ── -->
  <div class="split">
    <div class="card">
      <div class="eyebrow">Tendencia mensual</div>
      <h3 style="margin:4px 0 12px">Venta por mes</h3>
      <div id="trend"></div>
    </div>
    <div class="card">
      <div class="eyebrow">Mezcla</div>
      <h3 style="margin:4px 0 12px">Mercado y moneda</h3>
      <div id="mezcla"></div>
    </div>
  </div>

  <!-- ── Resumen de riesgo (enlace a Bandeja) ── -->
  <div class="card">
    <div class="row">
      <div><div class="eyebrow">Radar</div><h2>Clientes en riesgo</h2></div>
      <a class="btn primary" href="/modules/rc/bandeja.html">Abrir Bandeja de Riesgo →</a>
    </div>
    <div id="riesgoResumen" style="margin-top:14px"></div>
  </div>

</div>`;

  // ── Estado ────────────────────────────────────────────────────────────────
  let kpis = [];
  let alertas = [];
  let pp = null;                 // presupuesto anual vs real { anio, totales, categorias, sin_cruce }
  const ppOpen = new Set();      // categorías expandidas (cat)

  // ── Helpers ───────────────────────────────────────────────────────────────
  const money = v => KoguUi.money(Number(v || 0));
  const sel = id => document.getElementById(id)?.value ?? '';
  const show = (id, v) => { const el = document.getElementById(id); if (el) el.style.display = v ? '' : 'none'; };

  let metrica = localStorage.getItem('kogu:rc-metrica') || 'cantidad';
  const esDinero = () => metrica === 'dinero';
  const nf0 = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 });
  const fmtVal = v => esDinero() ? money(v) : `${nf0.format(Number(v || 0))} kg`;
  const measKpi = k => esDinero() ? Number(k.subtotal_mxn || 0) : Number(k.cantidad || 0);
  const metricaLbl = () => esDinero() ? 'MXN-eq' : 'kg (aprox)';
  // Tarjeta KPI compacta homologada con todas las pantallas del Radar.
  const miniCard = (lbl, val, hint = '', color = '') => `
    <div style="border:1px solid var(--line);border-radius:10px;padding:9px 12px">
      <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.03em">${KoguUi.escapeHtml(lbl)}</div>
      <div style="font-size:17px;font-weight:800;line-height:1.15;margin-top:1px;${color ? `color:${color}` : ''}">${KoguUi.escapeHtml(val)}</div>
      ${hint ? `<div style="font-size:10px;color:var(--muted)">${KoguUi.escapeHtml(hint)}</div>` : ''}
    </div>`;
  const MESES = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

  // ── Periodos / fechas (para Recalcular) ─────────────────────────────────────
  const pad = n => String(n).padStart(2, '0');
  const isoUTC = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
  const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
  const addDays = (iso, n) => { const d = new Date(iso); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  function maxMesKpis() {
    let best = null;
    kpis.forEach(k => { const key = k.anio * 12 + k.mes; if (!best || key > best.key) best = { key, y: k.anio, m: k.mes }; });
    return best;
  }
  function computePeriodos() {
    const preset = sel('presetFil');
    if (preset === 'mes') {
      const mx = maxMesKpis();
      if (!mx) return null;
      const py = mx.m === 1 ? mx.y - 1 : mx.y;
      const pm = mx.m === 1 ? 12 : mx.m - 1;
      return { p1d: isoUTC(py, pm, 1), p1h: isoUTC(mx.y, mx.m, 1), p2d: isoUTC(mx.y, mx.m, 1), p2h: isoUTC(mx.y, mx.m, lastDay(mx.y, mx.m)) };
    }
    if (preset === 'custom') {
      const p1d = sel('p1d'), p1hIn = sel('p1h'), p2d = sel('p2d'), p2h = sel('p2h');
      if (!p1d || !p1hIn || !p2d || !p2h) return null;
      return { p1d, p1h: addDays(p1hIn, 1), p2d, p2h };
    }
    return null;
  }

  // "En riesgo" = lo que dejó de comprar (P1 − P2), en la métrica activa.
  const SEV_RANK = { critica: 0, alerta: 1, info: 2 };
  function montoRiesgo(a) {
    const d = a.detalle || {};
    if (esDinero()) {
      if (d.venta_p1 != null && d.venta_p2 != null) return Math.max(0, Number(d.venta_p1) - Number(d.venta_p2));
      if (d.importe_p1 != null) return Math.max(0, Number(d.importe_p1) - Number(d.importe_p2));
      if (d.venta_anio != null) return Math.max(0, Number(d.venta_anio));
      return 0;
    }
    if (d.cant_p1 != null) return Math.max(0, Number(d.cant_p1) - Number(d.cant_p2));
    if (d.qty_anio != null) return Math.max(0, Number(d.qty_anio));
    if (d.prev_qty != null) return Math.max(0, Number(d.prev_qty) - Number(d.cur_qty));
    return 0;
  }

  // ── Selector de año ─────────────────────────────────────────────────────────
  const anioFil = document.getElementById('anioFil');
  anioFil.innerHTML = [anioActual, anioActual - 1, anioActual - 2].map(a => `<option value="${a}">${a}</option>`).join('');
  anioFil.value = String(anioActual);
  document.getElementById('metricaFil').value = metrica;

  // ── Carga ─────────────────────────────────────────────────────────────────
  async function loadAll() {
    const anio = sel('anioFil') || anioActual;
    const [kRes, aRes] = await Promise.all([
      KoguApi.apiFetch(`${BASE}/kpis?anio=${anio}`),
      KoguApi.apiFetch(`${BASE}/alertas`),
    ]);
    kpis = KoguApi.unwrapRows(kRes);
    alertas = KoguApi.unwrapRows(aRes);
    const calc = (kRes?.data?.calculado_at) || null;
    document.getElementById('metaInfo').textContent = calc
      ? `Última actualización: ${KoguUi.fmtDate(calc)} · ${kpis.length} filas KPI`
      : 'Sin cálculo aún — presiona Recalcular.';
    renderKpis();
    renderTrend();
    renderMezcla();
    renderRiesgoResumen();
    await loadPp();
  }

  // ── Presupuesto anual (PP) vs real ──────────────────────────────────────────
  async function loadPp() {
    const anio = sel('anioFil') || anioActual;
    try {
      const res = await KoguApi.apiFetch(`${BASE}/pp?anio=${anio}`);
      pp = res?.data || res;
    } catch (err) {
      pp = null;
      document.getElementById('ppCard').innerHTML =
        `<div class="eyebrow">Radar · Presupuesto</div><div class="empty">No se pudo cargar el PP: ${KoguUi.escapeHtml(err.message)}</div>`;
      return;
    }
    renderPp();
  }

  const pct0 = v => (v == null ? '—' : `${(Number(v) * 100).toFixed(0)}%`);
  const ppVal = o => esDinero() ? Number(o.ventas_pp || 0) : Number(o.kg_pp || 0);
  const realVal = o => esDinero() ? Number(o.ventas_real || 0) : Number(o.kg_real || 0);
  const avVal = o => { const p = ppVal(o); return p ? realVal(o) / p : null; };
  // Semáforo: avance real contra el ritmo esperado del año.
  function semColor(av, ritmo) {
    if (av == null || !ritmo) return 'var(--muted,#64748b)';
    const r = av / ritmo;
    return r >= 0.95 ? 'var(--success,#16a34a)' : r >= 0.8 ? 'var(--warning,#d97706)' : 'var(--danger,#dc2626)';
  }

  function renderPp() {
    const el = document.getElementById('ppCard');
    if (!pp) { el.innerHTML = ''; return; }
    if (pp.sin_pp) {
      el.innerHTML = `
        <div class="row"><div><div class="eyebrow">Radar · Presupuesto</div><h2>Cumplimiento vs PP ${pp.anio}</h2></div></div>
        <div class="empty" style="margin-top:10px">No hay presupuesto (PP) cargado para ${pp.anio}.${pp.anios?.length ? ` Disponibles: ${pp.anios.join(', ')}.` : ''}</div>`;
      return;
    }
    const t = pp.totales, ritmo = Number(t.ritmo_esperado || 0);
    const av = avVal(t);
    const col = semColor(av, ritmo);
    const ultv = t.ult_venta ? KoguUi.fmtDate(t.ult_venta).split(',')[0] : '—';
    const sc = pp.sin_cruce || { kg_real: 0, ventas_real: 0 };
    const scVal = esDinero() ? Number(sc.ventas_real || 0) : Number(sc.kg_real || 0);
    const cob = esDinero() ? t.cobertura_ventas : t.cobertura_kg;   // 0..1 atribuido a sublíneas

    const head = `
      <div class="row" style="align-items:flex-start">
        <div>
          <div class="eyebrow">Radar · Presupuesto</div>
          <h2>Cumplimiento vs PP ${pp.anio}</h2>
          <div class="hint" style="margin-top:4px;color:var(--muted);font-size:12px">
            Métrica: <b>${esDinero() ? 'venta (MXN)' : 'volumen (kg)'}</b> · última venta ${ultv} · ritmo esperado <b>${pct0(ritmo)}</b> del año
          </div>
        </div>
        <span style="display:inline-block;padding:4px 12px;border-radius:999px;font-weight:700;color:#fff;background:${col}">${pct0(av)} del PP</span>
      </div>`;

    const cards = `
      <div class="grid-4" style="gap:10px;margin-top:14px">
        ${miniCard(`PP ${pp.anio} (${esDinero() ? 'MXN' : 'kg'})`, fmtVal(ppVal(t)), 'presupuesto anual')}
        ${miniCard('Real a la fecha', fmtVal(realVal(t)), `${pct0(av)} del PP`, col)}
        ${miniCard('Ritmo esperado', pct0(ritmo), `del año al ${ultv}`)}
        ${miniCard('Brecha vs ritmo', pct0(av == null ? null : av - ritmo), av != null && av < ritmo ? 'por debajo' : 'en/above línea', col)}
      </div>
      ${scVal > 0 ? `<div class="hint" style="margin-top:8px;color:var(--muted);font-size:12px">El total de arriba ya es comparable (venta total al corte vs PP). Cobertura de mapeo a sublíneas: <b>${pct0(cob)}</b> · sin cruce <b>${fmtVal(scVal)}</b> — se atribuye al cargar el puente sub_cse→sublínea (rc_pp_map).</div>` : ''}`;

    // Barra avance vs ritmo
    const barW = Math.min(100, Math.round((av || 0) * 100));
    const ritW = Math.min(100, Math.round(ritmo * 100));
    const bar = `
      <div style="margin-top:14px">
        <div style="position:relative;background:var(--panel2,#f1f5f9);border-radius:8px;height:22px;overflow:hidden">
          <div style="width:${barW}%;height:100%;background:${col};transition:width .3s"></div>
          <div title="Ritmo esperado ${pct0(ritmo)}" style="position:absolute;top:-2px;left:${ritW}%;width:2px;height:26px;background:var(--ink,#0f172a)"></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--muted);margin-top:3px">
          <span>Avance ${pct0(av)}</span><span>Marcador = ritmo esperado ${pct0(ritmo)}</span><span>PP 100%</span>
        </div>
      </div>`;

    // Tabla por categoría (expandible a sublínea)
    const filaCat = c => {
      const a = avVal(c), cc = semColor(a, ritmo);
      const open = ppOpen.has(c.cat);
      const subs = open ? c.sublineas.map(s => {
        const sa = avVal(s), scol = semColor(sa, ritmo);
        return `<tr style="background:var(--panel2,#f8fafc)">
          <td style="padding-left:26px"><span class="chip-compact">${KoguUi.escapeHtml(s.cve_sublinea)}</span> ${KoguUi.escapeHtml(s.sublinea_nombre)}${s.mapeado ? '' : ' <span style="color:var(--warning,#d97706);font-size:11px">·sin cruce</span>'}</td>
          <td style="text-align:right">${fmtVal(ppVal(s))}</td>
          <td style="text-align:right">${fmtVal(realVal(s))}</td>
          <td style="text-align:right;font-weight:600;color:${scol}">${pct0(sa)}</td>
        </tr>`;
      }).join('') : '';
      return `<tr data-cat="${c.cat}" style="cursor:pointer">
          <td><span style="display:inline-block;width:14px;color:var(--muted)">${open ? '▾' : '▸'}</span><b>${KoguUi.escapeHtml(c.cat_nombre || ('Categoría ' + c.cat))}</b> <span style="color:var(--muted);font-size:11px">(${c.sublineas.length})</span></td>
          <td style="text-align:right">${fmtVal(ppVal(c))}</td>
          <td style="text-align:right">${fmtVal(realVal(c))}</td>
          <td style="text-align:right;font-weight:700;color:${cc}">${pct0(a)}</td>
        </tr>${subs}`;
    };
    const sinMapeo = !cob || cob < 0.001;
    const bannerCat = sinMapeo
      ? `<div class="hint" style="margin:10px 0 0;padding:10px 12px;background:var(--panel2,#f1f5f9);border-radius:10px;color:var(--muted);font-size:12px">El <b>desglose por categoría</b> requiere el puente <b>sub_cse→sublínea</b> (<code>rc_pp_map</code>), aún pendiente. Por ahora la columna Real aparece en cero por categoría; el <b>total al corte ya es correcto</b> arriba.</div>`
      : '';
    const tabla = `
      <div class="eyebrow" style="margin:18px 0 8px">Avance por categoría (${esDinero() ? 'MXN' : 'kg'}) · clic para ver sublíneas</div>
      ${bannerCat}
      <div class="table-wrap"><table><thead><tr>
        <th>Categoría</th><th style="text-align:right">PP ${pp.anio}</th><th style="text-align:right">Real</th><th style="text-align:right">Avance</th>
      </tr></thead><tbody>${pp.categorias.map(filaCat).join('')}</tbody></table></div>`;

    el.innerHTML = head + cards + bar + tabla;
    el.querySelectorAll('tr[data-cat]').forEach(tr => tr.onclick = () => {
      const cat = Number(tr.dataset.cat);
      if (ppOpen.has(cat)) ppOpen.delete(cat); else ppOpen.add(cat);
      renderPp();
    });
  }

  const sum = (arr, f = measKpi) => arr.reduce((a, x) => a + Number(f(x) || 0), 0);

  function renderKpis() {
    const total = sum(kpis);
    const nal = sum(kpis.filter(k => k.mercado === 'NAL'));
    const ext = sum(kpis.filter(k => k.mercado === 'EXT'));
    const pctExt = total ? (ext / total) : 0;
    document.getElementById('kpiCards').innerHTML = [
      miniCard(`Venta total (${metricaLbl()})`, fmtVal(total), `${kpis.length} combinaciones`),
      miniCard('Nacional', fmtVal(nal), `${total ? Math.round(100 * nal / total) : 0}% del total`),
      miniCard('Exportación', fmtVal(ext), `${Math.round(100 * pctExt)}% del total`),
      miniCard('Alertas abiertas', String(alertas.filter(a => a.status === 'abierta').length), `${alertas.length} en total`),
    ].join('');
  }

  function renderTrend() {
    const porMes = {};
    kpis.forEach(k => { porMes[k.mes] = (porMes[k.mes] || 0) + measKpi(k); });
    const meses = Object.keys(porMes).map(Number).sort((a, b) => a - b);
    if (!meses.length) { document.getElementById('trend').innerHTML = '<div class="empty">Sin datos</div>'; return; }
    const max = Math.max(...meses.map(m => porMes[m]));
    document.getElementById('trend').innerHTML = meses.map(m => {
      const v = porMes[m]; const w = max ? Math.round(100 * v / max) : 0;
      return `<div style="display:flex;align-items:center;gap:10px;margin:6px 0">
        <div style="width:34px;font-size:12px;color:var(--muted)">${MESES[m] || m}</div>
        <div style="flex:1;background:var(--panel2,#f1f5f9);border-radius:6px;overflow:hidden">
          <div style="width:${w}%;min-width:2px;height:18px;background:var(--brand,#2563eb)"></div>
        </div>
        <div style="width:130px;text-align:right;font-size:12px">${fmtVal(v)}</div>
      </div>`;
    }).join('');
  }

  function renderMezcla() {
    const total = sum(kpis) || 1;
    const grupos = [
      ['Nacional MXN', kpis.filter(k => k.mercado === 'NAL' && k.moneda === 'MXN')],
      ['Nacional USD', kpis.filter(k => k.mercado === 'NAL' && k.moneda === 'USD')],
      ['Exportación MXN', kpis.filter(k => k.mercado === 'EXT' && k.moneda === 'MXN')],
      ['Exportación USD', kpis.filter(k => k.mercado === 'EXT' && k.moneda === 'USD')],
    ];
    document.getElementById('mezcla').innerHTML = grupos.map(([lbl, rows]) => {
      const v = sum(rows); if (!v) return '';
      return `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--line)">
        <span>${lbl}</span>
        <span style="font-weight:600">${fmtVal(v)} <span style="color:var(--muted);font-weight:400">(${Math.round(100 * v / total)}%)</span></span>
      </div>`;
    }).join('') || '<div class="empty">Sin datos</div>';
  }

  // ── Resumen de riesgo (foto; el detalle vive en la Bandeja) ──────────────────
  function renderRiesgoResumen() {
    const abiertas = alertas.filter(a => a.status !== 'descartada');
    const groups = new Map();
    let otras = 0, productos = 0;
    abiertas.forEach(a => {
      if (a.cliente_ref && (a.entidad_tipo === 'cliente' || a.entidad_tipo === 'cliente_producto')) {
        let g = groups.get(a.cliente_ref);
        if (!g) { g = { alertas: [], rc005: null, rc004: null, productos: [] }; groups.set(a.cliente_ref, g); }
        g.alertas.push(a);
        if (a.regla_clave === 'RC-005') g.rc005 = a;
        if (a.regla_clave === 'RC-004') g.rc004 = a;
        if (a.regla_clave === 'RC-006') { g.productos.push(a); productos++; }
      } else otras++;
    });
    const grpRiesgo = g => g.rc005 ? montoRiesgo(g.rc005)
      : Math.max(g.productos.reduce((s, a) => s + montoRiesgo(a), 0), g.rc004 ? montoRiesgo(g.rc004) : 0);
    const grpSev = g => g.alertas.reduce((m, a) => Math.min(m, SEV_RANK[a.severidad] ?? 2), 2);
    const arr = [...groups.values()];
    const totalRiesgo = arr.reduce((s, g) => s + grpRiesgo(g), 0);
    const nCriticas = arr.filter(g => grpSev(g) === 0).length;
    document.getElementById('riesgoResumen').innerHTML = `
      <div class="grid-4" style="gap:10px">
        ${miniCard(esDinero() ? 'Monto en riesgo' : 'Volumen en riesgo (kg)', fmtVal(totalRiesgo), 'dejaron de comprar (P1−P2)', 'var(--danger,#dc2626)')}
        ${miniCard('Clientes en caída', String(arr.length), `${nCriticas} críticos`)}
        ${miniCard('Productos en caída', String(productos), 'alertas RC-006')}
        ${miniCard('Otras alertas', String(otras), 'empresa / agentes')}
      </div>
      <div class="hint" style="margin-top:10px;color:var(--muted);font-size:12px">El detalle accionable, filtros y ficha por cliente están en la <a href="/modules/rc/bandeja.html">Bandeja de Riesgo</a>.</div>`;
  }

  // ── Modal: cómo se calculan las reglas ──────────────────────────────────────
  function openReglas() {
    const regla = (clave, titulo, detecta, calculo, umbral) => `
      <div style="border:1px solid var(--line);border-left:4px solid var(--brand,#2563eb);border-radius:12px;padding:14px;margin-bottom:10px">
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:4px">
          <span class="chip-compact">${clave}</span><span style="font-weight:700">${titulo}</span>
        </div>
        <div style="font-size:13px;margin-bottom:4px"><b>Detecta:</b> ${detecta}</div>
        <div style="font-size:13px;color:var(--muted);margin-bottom:4px"><b>Cómo se calcula:</b> ${calculo}</div>
        <div style="font-size:12px;color:var(--muted)"><b>Umbral:</b> ${umbral}</div>
      </div>`;

    const html = `
      <div id="rcReglasModal" style="position:fixed;inset:0;z-index:9999;background:rgba(15,23,42,.55);display:flex;justify-content:center;align-items:flex-start;overflow:auto;padding:32px 16px">
        <div style="background:var(--panel,#fff);border-radius:16px;max-width:860px;width:100%;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,.3)">
          <div class="row" style="align-items:flex-start;margin-bottom:10px">
            <div><div class="eyebrow">Radar Comercial</div><h2 style="margin:4px 0 0">Cómo se calculan las alertas</h2></div>
            <button class="btn" id="rcReglasClose">Cerrar ✕</button>
          </div>

          <div style="background:var(--panel2,#f1f5f9);border-radius:10px;padding:12px;margin-bottom:14px;font-size:13px;color:var(--muted)">
            <b>Bases del cálculo.</b> La métrica primaria es <b>cantidad (kg)</b>: el importe en pesos se distorsiona con el tipo de cambio (~70% de la venta es USD), así que las caídas se miden en volumen. La venta se atribuye a un agente por el <b>cliente</b> (cat_clientes → agente vigente), nunca por la clave de agente del ERP. El comparativo <b>P1 vs P2</b> usa por defecto los <b>últimos 2 meses vs los 2 previos</b> (configurable). Las metas se comparan contra el <b>presupuesto anual</b> del agente.
          </div>

          ${regla('RC-001', 'Cumplimiento vs meta', 'Agentes que van por debajo del ritmo necesario para llegar a su meta anual.', 'Venta acumulada del año ÷ meta anual = % avance. El <i>ritmo esperado</i> = meta × (meses transcurridos ÷ 12). Se compara el avance real contra ese ritmo. Base kg si el agente tiene meta de cantidad; si no, en importe.', 'Alerta si el ritmo < 90% del esperado · Crítica si < 70%.')}
          ${regla('RC-002', 'Concentración de cliente', 'Agentes que dependen demasiado de un solo cliente (riesgo si ese cliente se va).', 'Para cada agente, se calcula qué % de su venta (ventana de 12 meses) representa su cliente más grande.', 'Alerta si un cliente concentra ≥ 30% · Crítica si ≥ 50%. (En importe.)')}
          ${regla('RC-003', 'Caída de volumen (mes vs mes)', 'Caída del volumen vendido del último mes contra el mes anterior, a nivel empresa y por agente.', 'Compara los kg del último mes con los del mes previo: (mes actual − mes anterior) ÷ mes anterior.', 'Alerta si cae ≥ 20% · Crítica si cae ≥ 40%. (En kg.)')}
          ${regla('RC-004', 'Cliente sin compra (dormido)', 'Clientes con historial que dejaron de comprar.', 'Días entre la última compra del cliente y la fecha de la última venta de la empresa.', 'Alerta si lleva ≥ 60 días sin comprar · Crítica si ≥ 120 días.')}
          ${regla('RC-005', 'Cliente comprando menos (P1 vs P2)', 'Clientes cuyo volumen de compra cayó entre dos periodos.', 'Suma de kg del cliente en P2 vs P1: (P2 − P1) ÷ P1.', 'Alerta si cae ≥ 25% · Crítica si cae ≥ 50%. (En kg.)')}
          ${regla('RC-006', 'Producto que el cliente compra menos (P1 vs P2)', 'A nivel cliente×producto: qué producto específico dejó de comprar o redujo un cliente.', 'Por cada cliente y producto, compara P1 vs P2 en importe y en cantidad; basta que caiga en cualquiera de las dos. Se filtran productos chicos (mínimo de venta en P1) para evitar ruido.', 'Alerta si cae ≥ 30% (importe o kg) y la venta de P1 ≥ $5,000. "Abandonado" = cayó a 0.')}

          <div style="font-size:12px;color:var(--muted);margin-top:8px">El <b>"monto/volumen en riesgo"</b> de cada cliente es lo que dejó de comprar (P1 − P2). Los umbrales son configurables en el catálogo de reglas.</div>
        </div>
      </div>`;
    document.getElementById('rcReglasModal')?.remove();
    document.body.insertAdjacentHTML('beforeend', html);
    const modal = document.getElementById('rcReglasModal');
    document.getElementById('rcReglasClose').onclick = () => modal.remove();
    modal.onclick = e => { if (e.target === modal) modal.remove(); };
  }

  // ── Eventos ───────────────────────────────────────────────────────────────
  document.getElementById('reglasBtn').onclick = openReglas;
  document.getElementById('presetFil').onchange = () => show('customPeriodos', sel('presetFil') === 'custom');
  document.getElementById('recalcBtn').onclick = async (e) => {
    await KoguUi.withLoading(e.target, async () => {
      try {
        const periodos = computePeriodos();
        const body = periodos ? { periodos } : {};
        const res = await KoguApi.apiFetch(`${BASE}/engine/recalcular`, { method: 'POST', body: JSON.stringify(body) });
        const d = res?.data || res;
        KoguApi.toast(`Recalculado: ${d?.kpi_filas ?? 0} filas KPI, ${d?.total_alertas ?? 0} alertas`, 'success');
        await loadAll();
      } catch (err) { KoguApi.toast(err.message, 'error'); }
    }, 'Recalculando...');
  };
  document.getElementById('anioFil').onchange = loadAll;
  document.getElementById('metricaFil').onchange = (e) => {
    metrica = e.target.value;
    localStorage.setItem('kogu:rc-metrica', metrica);
    renderKpis(); renderTrend(); renderMezcla(); renderRiesgoResumen(); renderPp();
  };

  KoguShell.subscribeEmpresaActivaChange(loadAll);
  await loadAll();
});

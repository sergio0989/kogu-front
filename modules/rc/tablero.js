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

  // ── Eventos ───────────────────────────────────────────────────────────────
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
    renderKpis(); renderTrend(); renderMezcla(); renderRiesgoResumen();
  };

  KoguShell.subscribeEmpresaActivaChange(loadAll);
  await loadAll();
});

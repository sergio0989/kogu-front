document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/rc/tablero.html';
  const BASE = '/protected/rc';
  const PERM = 'screen.ventas.direccion';

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Tablero Radar Comercial',
    description: 'KPIs de venta y alertas inteligentes por empresa. Vista Dirección · Radar Comercial.',
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
        <div class="eyebrow">Inteligencia comercial</div>
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
      <h3 style="margin:4px 0 12px">Venta por mes (MXN-eq)</h3>
      <div id="trend"></div>
    </div>
    <div class="card">
      <div class="eyebrow">Mezcla</div>
      <h3 style="margin:4px 0 12px">Mercado y moneda</h3>
      <div id="mezcla"></div>
    </div>
  </div>

  <!-- ── Alertas ── -->
  <div class="card">
    <div class="row">
      <div><div class="eyebrow">Radar</div><h2>Alertas</h2></div>
      <div style="display:flex;gap:10px">
        <select class="select" id="sevFil">
          <option value="">Toda severidad</option>
          <option value="critica">Crítica</option>
          <option value="alerta">Alerta</option>
          <option value="info">Info</option>
        </select>
        <select class="select" id="reglaFil"><option value="">Todas las reglas</option></select>
      </div>
    </div>
    <div id="alertas" style="margin-top:16px"></div>
  </div>

</div>`;

  // ── Estado ────────────────────────────────────────────────────────────────
  let kpis = [];
  let alertas = [];

  // ── Helpers ───────────────────────────────────────────────────────────────
  const money = v => KoguUi.money(Number(v || 0));
  const sel = id => document.getElementById(id)?.value ?? '';
  const show = (id, v) => { const el = document.getElementById(id); if (el) el.style.display = v ? '' : 'none'; };

  // ── Métrica activa: dinero (MXN) | cantidad (kg) ────────────────────────────
  let metrica = localStorage.getItem('kogu:rc-metrica') || 'dinero';
  const esDinero = () => metrica === 'dinero';
  const nf0 = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 });
  // Formatea un valor según la métrica activa.
  const fmtVal = v => esDinero() ? money(v) : `${nf0.format(Number(v || 0))} kg`;
  // Extrae la medida de una fila de KPI (subtotal_mxn o cantidad).
  const measKpi = k => esDinero() ? Number(k.subtotal_mxn || 0) : Number(k.cantidad || 0);
  // Para filas de ficha: {subt, cantidad} o {p1/p2, cant_p1/cant_p2}.
  const measSubt = r => esDinero() ? Number(r.subt || 0) : Number(r.cantidad || 0);
  const metricaLbl = () => esDinero() ? 'MXN-eq' : 'kg (aprox)';
  const MESES = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

  // Etiquetas de periodo a partir de {p1d,p1h,p2d,p2h} (p?h de P1 es exclusivo).
  const mesIni = iso => MESES[new Date(iso).getUTCMonth() + 1] || '';
  const mesPrev = iso => MESES[new Date(iso).getUTCMonth()] || MESES[12]; // mes anterior al exclusivo
  const rangoP1 = p => p?.p1d ? `${mesIni(p.p1d)}–${mesPrev(p.p1h)}` : '';
  const rangoP2 = p => p?.p2d ? `${mesIni(p.p2d)}–${mesIni(p.p2h)}` : '';

  // ── Periodos / fechas ──────────────────────────────────────────────────────
  const pad = n => String(n).padStart(2, '0');
  const isoUTC = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
  const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m 1-based
  const addDays = (iso, n) => { const d = new Date(iso); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

  // Mes máximo presente en los KPIs (para preset "mes vs mes").
  function maxMesKpis() {
    let best = null;
    kpis.forEach(k => { const key = k.anio * 12 + k.mes; if (!best || key > best.key) best = { key, y: k.anio, m: k.mes }; });
    return best;
  }

  // Devuelve {p1d,p1h,p2d,p2h} (p1h exclusivo) o null para automático.
  function computePeriodos() {
    const preset = sel('presetFil');
    if (preset === 'mes') {
      const mx = maxMesKpis();
      if (!mx) return null;
      const py = mx.m === 1 ? mx.y - 1 : mx.y;
      const pm = mx.m === 1 ? 12 : mx.m - 1;
      return {
        p1d: isoUTC(py, pm, 1), p1h: isoUTC(mx.y, mx.m, 1),
        p2d: isoUTC(mx.y, mx.m, 1), p2h: isoUTC(mx.y, mx.m, lastDay(mx.y, mx.m)),
      };
    }
    if (preset === 'custom') {
      const p1d = sel('p1d'), p1hIn = sel('p1h'), p2d = sel('p2d'), p2h = sel('p2h');
      if (!p1d || !p1hIn || !p2d || !p2h) return null; // incompleto → auto
      return { p1d, p1h: addDays(p1hIn, 1), p2d, p2h }; // P1 hasta inclusivo → exclusivo +1
    }
    return null; // auto
  }

  const fmtPctCap = d => { const n = Number(d); if (n <= -1) return '−100%+'; return `${(n * 100).toFixed(1)}%`; };
  function tituloDe(a) {
    const d = a.detalle || {};
    if (a.regla_clave === 'RC-005' && d.delta != null) return `Cliente compra ${fmtPctCap(d.delta)}: ${d.cliente_nombre || a.cliente_ref}`;
    if (a.regla_clave === 'RC-003' && d.delta != null) { const who = a.entidad_tipo === 'empresa' ? 'Empresa' : 'Agente'; return `${who}: caída de venta ${fmtPctCap(d.delta)} mes vs mes`; }
    return a.titulo;
  }

  const SEV = {
    critica: { txt: 'Crítica', bg: 'var(--danger,#dc2626)' },
    alerta:  { txt: 'Alerta',  bg: 'var(--warning,#d97706)' },
    info:    { txt: 'Info',    bg: 'var(--muted,#64748b)' },
  };
  const sevBadge = s => {
    const m = SEV[s] || SEV.info;
    return `<span style="display:inline-block;padding:2px 10px;border-radius:999px;font-size:11px;font-weight:600;color:#fff;background:${m.bg}">${m.txt}</span>`;
  };

  // Llenar selector de año
  const anioFil = document.getElementById('anioFil');
  anioFil.innerHTML = [anioActual, anioActual - 1, anioActual - 2]
    .map(a => `<option value="${a}">${a}</option>`).join('');
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
    const calc = (kRes?.data?.calculado_at) || null;
    alertas = KoguApi.unwrapRows(aRes);
    document.getElementById('metaInfo').textContent = calc
      ? `Última actualización: ${KoguUi.fmtDate(calc)} · ${kpis.length} filas KPI`
      : 'Sin cálculo aún — presiona Recalcular.';
    renderKpis();
    renderTrend();
    renderMezcla();
    fillReglaFil();
    renderAlertas();
  }

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const sum = (arr, f = measKpi) => arr.reduce((a, x) => a + Number(f(x) || 0), 0);

  function renderKpis() {
    const total = sum(kpis);
    const nal = sum(kpis.filter(k => k.mercado === 'NAL'));
    const ext = sum(kpis.filter(k => k.mercado === 'EXT'));
    const pctExt = total ? (ext / total) : 0;
    document.getElementById('kpiCards').innerHTML = [
      KoguUi.cardStat(`Venta total (${metricaLbl()})`, fmtVal(total), `${kpis.length} combinaciones`),
      KoguUi.cardStat('Nacional', fmtVal(nal), `${total ? Math.round(100 * nal / total) : 0}% del total`),
      KoguUi.cardStat('Exportación', fmtVal(ext), `${Math.round(100 * pctExt)}% del total`),
      KoguUi.cardStat('Alertas abiertas', String(alertas.filter(a => a.status === 'abierta').length), `${alertas.length} en total`),
    ].join('');
  }

  // ── Tendencia mensual (barras simples) ──────────────────────────────────────
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

  // ── Mezcla mercado/moneda ───────────────────────────────────────────────────
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

  // ── Alertas ─────────────────────────────────────────────────────────────────
  function fillReglaFil() {
    const reglas = [...new Set(alertas.map(a => a.regla_clave))].sort();
    const cur = sel('reglaFil');
    document.getElementById('reglaFil').innerHTML =
      '<option value="">Todas las reglas</option>' + reglas.map(r => `<option value="${r}">${r}</option>`).join('');
    document.getElementById('reglaFil').value = cur;
  }

  // Banner del comparativo P1 vs P2 (lo lee de cualquier alerta que lo traiga).
  function periodosBanner() {
    const conP = alertas.find(a => a.detalle && a.detalle.periodos);
    const p = conP?.detalle?.periodos;
    if (!p) return '';
    return `<div class="hint" style="margin-bottom:12px;color:var(--muted);font-size:12px">
      Comparativo P1 vs P2 (reglas RC-005/006): <b>P1 ${rangoP1(p)}</b> vs <b>P2 ${rangoP2(p)}</b> · variación = (P2−P1)/P1
    </div>`;
  }

  function renderAlertas() {
    const sv = sel('sevFil'), rg = sel('reglaFil');
    const filtered = alertas.filter(a =>
      (!sv || a.severidad === sv) && (!rg || a.regla_clave === rg) && a.status !== 'descartada');
    if (!filtered.length) { document.getElementById('alertas').innerHTML = periodosBanner() + '<div class="empty">Sin alertas para el filtro</div>'; return; }
    document.getElementById('alertas').innerHTML = periodosBanner() + filtered.map(a => {
      const quien = a.agente_nombre ? `Agente: ${KoguUi.escapeHtml(a.agente_nombre)}` :
                    a.cliente_ref ? `Cliente: ${KoguUi.escapeHtml(a.cliente_ref)}` : 'Empresa';
      const d = a.detalle || {};
      // Subline P1→P2. RC-005 trae venta_p1/p2 (importe); RC-006 trae importe_* y cant_*.
      let comparativo = '';
      if (d.venta_p1 != null && d.venta_p2 != null) {
        const negativo = Number(d.venta_p2) < 0;
        comparativo = `<div style="font-size:12px;color:var(--muted);margin-top:4px">
          P1 ${rangoP1(d.periodos)}: <b>${money(d.venta_p1)}</b> → P2 ${rangoP2(d.periodos)}: <b>${money(d.venta_p2)}</b>
          ${negativo ? ' <span style="color:var(--danger,#dc2626);font-weight:600">· devoluciones netas en P2</span>' : ''}
        </div>`;
      } else if (d.importe_p1 != null) {
        const nf0 = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 });
        comparativo = `<div style="font-size:12px;color:var(--muted);margin-top:4px">
          Importe: <b>${money(d.importe_p1)}</b> → <b>${money(d.importe_p2)}</b> ·
          Cantidad: <b>${nf0.format(Number(d.cant_p1 || 0))}</b> → <b>${nf0.format(Number(d.cant_p2 || 0))}</b> kg
          ${d.abandonado ? ' <span style="color:var(--danger,#dc2626);font-weight:600">· abandonado</span>' : ''}
        </div>`;
      }
      return `<div style="border:1px solid var(--line);border-radius:12px;padding:14px;margin-bottom:10px">
        <div class="row" style="align-items:flex-start">
          <div style="flex:1">
            <div style="display:flex;gap:8px;align-items:center;margin-bottom:4px">
              ${sevBadge(a.severidad)}
              <span class="chip-compact">${KoguUi.escapeHtml(a.regla_clave)}</span>
              ${a.status === 'vista' ? '<span class="badge neutral">vista</span>' : ''}
            </div>
            <div style="font-weight:600">${KoguUi.escapeHtml(tituloDe(a))}</div>
            <div style="font-size:12px;color:var(--muted);margin-top:2px">${quien}</div>
            ${comparativo}
          </div>
          <div style="display:flex;gap:6px">
            ${(a.entidad_tipo === 'cliente' || a.entidad_tipo === 'cliente_producto') && a.cliente_ref ? `<button class="btn primary" data-ficha="${a.alerta_id}" style="font-size:12px">Detalle</button>` : ''}
            <button class="btn" data-act="vista" data-id="${a.alerta_id}" style="font-size:12px">Vista</button>
            <button class="btn" data-act="descartada" data-id="${a.alerta_id}" style="font-size:12px">Descartar</button>
          </div>
        </div>
      </div>`;
    }).join('');
    document.querySelectorAll('#alertas .btn[data-act]').forEach(x => x.onclick = async () => {
      try {
        await KoguApi.apiFetch(`${BASE}/alertas/${x.dataset.id}/status`, { method: 'PUT', body: JSON.stringify({ status: x.dataset.act }) });
        KoguApi.toast('Alerta actualizada', 'success');
        const a = alertas.find(z => z.alerta_id === x.dataset.id); if (a) a.status = x.dataset.act;
        renderKpis(); renderAlertas();
      } catch (err) { KoguApi.toast(err.message, 'error'); }
    });
    document.querySelectorAll('#alertas .btn[data-ficha]').forEach(x => x.onclick = () => {
      const a = alertas.find(z => z.alerta_id === x.dataset.ficha);
      if (a) openFicha(a);
    });
  }

  // ── Ficha de detalle del cliente (modal) ────────────────────────────────────
  async function openFicha(a) {
    const p = a.detalle?.periodos;
    const qs = p ? `?p1d=${p.p1d}&p1h=${p.p1h}&p2d=${p.p2d}&p2h=${p.p2h}` : '';
    try {
      const res = await KoguApi.apiFetch(`${BASE}/clientes/${encodeURIComponent(a.cliente_ref)}/comparativo${qs}`);
      renderFicha(res?.data || res);
    } catch (err) { KoguApi.toast(err.message, 'error'); }
  }

  function closeFicha() { document.getElementById('rcFichaModal')?.remove(); }

  function renderFicha(d) {
    const ind = d.indicadores || {};
    const p = d.periodos || {};
    const r1 = rangoP1(p), r2 = rangoP2(p);

    // Productos con medida activa (dinero o cantidad) + reordenar por caída.
    const valP1 = pr => esDinero() ? Number(pr.p1 || 0) : Number(pr.cant_p1 || 0);
    const valP2 = pr => esDinero() ? Number(pr.p2 || 0) : Number(pr.cant_p2 || 0);
    const prods = (d.productos || []).slice().sort((a, b) => (valP2(a) - valP1(a)) - (valP2(b) - valP1(b)));

    // Totales P1/P2 según métrica (cantidad se suma desde productos).
    const totP1 = esDinero() ? Number(ind.p1_total || 0) : prods.reduce((s, x) => s + Number(x.cant_p1 || 0), 0);
    const totP2 = esDinero() ? Number(ind.p2_total || 0) : prods.reduce((s, x) => s + Number(x.cant_p2 || 0), 0);
    const deltaTot = totP1 ? (totP2 - totP1) / totP1 : null;
    const ticketP1 = ind.facturas_p1 ? totP1 / ind.facturas_p1 : null;
    const ticketP2 = ind.facturas_p2 ? totP2 / ind.facturas_p2 : null;

    const kpi = (lbl, val, hint = '') =>
      `<div style="border:1px solid var(--line);border-radius:10px;padding:10px">
        <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em">${lbl}</div>
        <div style="font-size:18px;font-weight:700;margin-top:2px">${val}</div>
        ${hint ? `<div style="font-size:11px;color:var(--muted)">${hint}</div>` : ''}
      </div>`;

    const indicadores = `
      <div class="grid-4" style="gap:12px;margin-bottom:8px">
        ${kpi(`P1 ${r1} (${metricaLbl()})`, fmtVal(totP1), `${ind.facturas_p1} fac · ticket ${ticketP1 != null ? fmtVal(ticketP1) : '—'}`)}
        ${kpi(`P2 ${r2} (${metricaLbl()})`, fmtVal(totP2), `${ind.facturas_p2} fac · ticket ${ticketP2 != null ? fmtVal(ticketP2) : '—'}`)}
        ${kpi('Variación', `<span style="color:${Number(deltaTot) < 0 ? 'var(--danger,#dc2626)' : 'var(--brand,#2563eb)'}">${fmtPctCap(deltaTot)}</span>`, totP2 < 0 ? 'P2 neto negativo (devoluciones)' : '')}
        ${kpi('Última compra', KoguUi.fmtDate(ind.ultima_compra).split(',')[0] || '—', ind.dias_sin_compra != null ? `${ind.dias_sin_compra} días sin comprar` : '')}
      </div>`;

    // Productos (medida activa)
    const filas = prods.slice(0, 40).map(pr => {
      const a = valP1(pr), bb = valP2(pr);
      const dlt = a ? (bb - a) / a : null;
      const dpct = dlt == null ? '—' : fmtPctCap(dlt);
      const color = bb < a ? 'var(--danger,#dc2626)' : 'var(--muted)';
      const abandono = a > 0 && bb === 0;
      return `<tr>
        <td><span class="chip-compact">${KoguUi.escapeHtml(pr.cve_prod)}</span></td>
        <td>${KoguUi.escapeHtml(pr.desc_prod || '')}${abandono ? ' <span style="display:inline-block;padding:1px 8px;border-radius:999px;font-size:10px;font-weight:600;color:#fff;background:var(--danger,#dc2626)">abandonado</span>' : ''}</td>
        <td style="text-align:right">${fmtVal(a)}</td>
        <td style="text-align:right">${fmtVal(bb)}</td>
        <td style="text-align:right;color:${color};font-weight:600">${dpct}</td>
      </tr>`;
    }).join('');
    const tablaProd = `
      <div class="eyebrow" style="margin:16px 0 8px">Productos (${prods.length}) · ${metricaLbl()} · ordenados por mayor caída</div>
      <div class="table-wrap"><table><thead><tr>
        <th>Cve</th><th>Producto</th><th style="text-align:right">P1</th><th style="text-align:right">P2</th><th style="text-align:right">Var</th>
      </tr></thead><tbody>${filas || '<tr><td colspan="5" class="empty">Sin productos</td></tr>'}</tbody></table></div>`;

    // Tendencia mensual (medida activa)
    const meses = d.meses || [];
    const maxM = Math.max(1, ...meses.map(measSubt));
    const trend = meses.map(m => {
      const v = measSubt(m); const w = Math.round(100 * v / maxM);
      return `<div style="display:flex;align-items:center;gap:10px;margin:5px 0">
        <div style="width:64px;font-size:12px;color:var(--muted)">${MESES[m.mes] || m.mes} ${String(m.anio).slice(2)}</div>
        <div style="flex:1;background:var(--panel2,#f1f5f9);border-radius:6px"><div style="width:${w}%;min-width:2px;height:16px;background:${v < 0 ? 'var(--danger,#dc2626)' : 'var(--brand,#2563eb)'}"></div></div>
        <div style="width:120px;text-align:right;font-size:12px">${fmtVal(v)}</div>
      </div>`;
    }).join('');

    // Mezcla (medida activa)
    const mezcla = (d.mezcla || []).map(m =>
      `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--line)">
        <span>${m.mercado} · ${m.moneda}</span><span style="font-weight:600">${fmtVal(measSubt(m))}</span></div>`).join('');

    const html = `
      <div id="rcFichaModal" style="position:fixed;inset:0;z-index:9999;background:rgba(15,23,42,.55);display:flex;justify-content:center;align-items:flex-start;overflow:auto;padding:32px 16px">
        <div style="background:var(--panel,#fff);border-radius:16px;max-width:920px;width:100%;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,.3)">
          <div class="row" style="align-items:flex-start;margin-bottom:8px">
            <div>
              <div class="eyebrow">Ficha de cliente · ${r1} vs ${r2}</div>
              <h2 style="margin:4px 0 0">${KoguUi.escapeHtml(d.cliente_nombre || d.cliente_ref)}</h2>
              <div style="font-size:12px;color:var(--muted)">Cliente ${KoguUi.escapeHtml(d.cliente_ref)}${d.agente_nombre ? ` · Agente: ${KoguUi.escapeHtml(d.agente_nombre)}` : ''}</div>
            </div>
            <button class="btn" id="rcFichaClose">Cerrar ✕</button>
          </div>
          ${indicadores}
          ${tablaProd}
          <div class="split" style="margin-top:16px">
            <div><div class="eyebrow" style="margin-bottom:8px">Tendencia mensual</div>${trend || '<div class="empty">Sin datos</div>'}</div>
            <div><div class="eyebrow" style="margin-bottom:8px">Mezcla P2 (mercado · moneda)</div>${mezcla || '<div class="empty">Sin datos</div>'}</div>
          </div>
        </div>
      </div>`;
    closeFicha();
    document.body.insertAdjacentHTML('beforeend', html);
    const modal = document.getElementById('rcFichaModal');
    document.getElementById('rcFichaClose').onclick = closeFicha;
    modal.onclick = e => { if (e.target === modal) closeFicha(); };
  }

  // ── Eventos ───────────────────────────────────────────────────────────────
  document.getElementById('presetFil').onchange = () => {
    show('customPeriodos', sel('presetFil') === 'custom');
  };

  document.getElementById('recalcBtn').onclick = async (e) => {
    await KoguUi.withLoading(e.target, async () => {
      try {
        const periodos = computePeriodos();
        const body = periodos ? { periodos } : {};
        const res = await KoguApi.apiFetch(`${BASE}/engine/recalcular`, { method: 'POST', body: JSON.stringify(body) });
        const d = res?.data || res;
        const tot = d?.total_alertas ?? 0;
        KoguApi.toast(`Recalculado: ${d?.kpi_filas ?? 0} filas KPI, ${tot} alertas`, 'success');
        await loadAll();
      } catch (err) { KoguApi.toast(err.message, 'error'); }
    }, 'Recalculando...');
  };
  document.getElementById('anioFil').onchange = loadAll;
  document.getElementById('metricaFil').onchange = (e) => {
    metrica = e.target.value;
    localStorage.setItem('kogu:rc-metrica', metrica);
    renderKpis(); renderTrend(); renderMezcla();
  };
  document.getElementById('sevFil').onchange = renderAlertas;
  document.getElementById('reglaFil').onchange = renderAlertas;

  KoguShell.subscribeEmpresaActivaChange(loadAll);
  await loadAll();
});

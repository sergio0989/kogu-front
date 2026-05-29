document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/rc/bandeja.html';
  const BASE = '/protected/rc';
  const PERM = 'screen.ventas.direccion';

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Bandeja de Riesgo',
    description: 'Clientes en caída priorizados por volumen (kg) que dejaron de comprar · Radar Comercial.',
    requiredPermission: PERM,
  });
  if (!b) return;

  const anioActual = new Date().getFullYear();

  const c = document.getElementById('pageContent');
  c.innerHTML = `
<div class="stack" style="gap:16px">

  <div class="card">
    <div class="row">
      <div>
        <div class="eyebrow">Radar · Acción</div>
        <h2>Clientes en riesgo</h2>
        <div class="hint" id="metaInfo" style="margin-top:4px;color:var(--muted)">—</div>
      </div>
      <div style="display:flex;gap:10px;align-items:center">
        <select class="select" id="metricaFil" style="max-width:160px">
          <option value="dinero">$ Dinero (MXN)</option>
          <option value="cantidad">⚖ Cantidad (kg)</option>
        </select>
        <button class="btn" id="recalcBtn">↻ Recalcular</button>
      </div>
    </div>

    <div class="grid-2" style="gap:12px;margin-top:14px;align-items:end">
      <div>
        <div class="label-text">Periodo comparativo (RC-005/006)</div>
        <select class="select" id="presetFil">
          <option value="auto">Automático (2 meses vs 2 meses)</option>
          <option value="mes">Mes vs mes anterior</option>
          <option value="custom">Personalizado</option>
        </select>
      </div>
      <div style="display:flex;gap:10px">
        <select class="select" id="sevFil">
          <option value="">Toda severidad</option>
          <option value="critica">Crítica</option>
          <option value="alerta">Alerta</option>
          <option value="info">Info</option>
        </select>
        <select class="select" id="agenteFil"><option value="">Todos los agentes</option></select>
      </div>
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
    </div>

    <div id="alertasResumen" style="margin-top:14px"></div>
  </div>

  <div class="card">
    <div id="alertas"></div>
  </div>

</div>`;

  // ── Estado / helpers ────────────────────────────────────────────────────────
  let kpis = [];
  let alertas = [];

  const money = v => KoguUi.money(Number(v || 0));
  const sel = id => document.getElementById(id)?.value ?? '';
  const show = (id, v) => { const el = document.getElementById(id); if (el) el.style.display = v ? '' : 'none'; };

  let metrica = localStorage.getItem('kogu:rc-metrica') || 'cantidad';
  const esDinero = () => metrica === 'dinero';
  const nf0 = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 });
  const fmtVal = v => esDinero() ? money(v) : `${nf0.format(Number(v || 0))} kg`;
  const measSubt = r => esDinero() ? Number(r.subt || 0) : Number(r.cantidad || 0);
  const metricaLbl = () => esDinero() ? 'MXN-eq' : 'kg (aprox)';
  const MESES = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

  const mesIni = iso => MESES[new Date(iso).getUTCMonth() + 1] || '';
  const mesPrev = iso => MESES[new Date(iso).getUTCMonth()] || MESES[12];
  const rangoP1 = p => p?.p1d ? `${mesIni(p.p1d)}–${mesPrev(p.p1h)}` : '';
  const rangoP2 = p => p?.p2d ? `${mesIni(p.p2d)}–${mesIni(p.p2h)}` : '';

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

  const fmtPctCap = d => { const n = Number(d); if (n <= -1) return '−100%+'; return `${(n * 100).toFixed(1)}%`; };
  function tituloDe(a) {
    const d = a.detalle || {};
    if (a.regla_clave === 'RC-005' && d.delta != null) return `Cliente compra ${fmtPctCap(d.delta)}: ${d.cliente_nombre || a.cliente_ref}`;
    if (a.regla_clave === 'RC-003' && d.delta != null) { const who = a.entidad_tipo === 'empresa' ? 'Empresa' : 'Agente'; return `${who}: caída de venta ${fmtPctCap(d.delta)} mes vs mes`; }
    return a.titulo;
  }
  const SEV = { critica: { txt: 'Crítica', bg: 'var(--danger,#dc2626)' }, alerta: { txt: 'Alerta', bg: 'var(--warning,#d97706)' }, info: { txt: 'Info', bg: 'var(--muted,#64748b)' } };
  const sevBadge = s => { const m = SEV[s] || SEV.info; return `<span style="display:inline-block;padding:2px 10px;border-radius:999px;font-size:11px;font-weight:600;color:#fff;background:${m.bg}">${m.txt}</span>`; };
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

  function fillAgenteFil() {
    const ags = [...new Set(alertas.map(a => a.agente_nombre).filter(Boolean))].sort();
    const cur = sel('agenteFil');
    document.getElementById('agenteFil').innerHTML =
      '<option value="">Todos los agentes</option>' + ags.map(a => `<option value="${KoguUi.escapeHtml(a)}">${KoguUi.escapeHtml(a)}</option>`).join('');
    document.getElementById('agenteFil').value = cur;
  }
  function periodosBanner() {
    const conP = alertas.find(a => a.detalle && a.detalle.periodos);
    const p = conP?.detalle?.periodos;
    if (!p) return '';
    return `<div class="hint" style="margin:0 0 12px;color:var(--muted);font-size:12px">
      Comparativo: <b>P1 ${rangoP1(p)}</b> vs <b>P2 ${rangoP2(p)}</b> · prioridad por ${esDinero() ? 'monto' : 'volumen (kg)'} que dejó de comprar (P1−P2)
    </div>`;
  }

  // ── Carga ─────────────────────────────────────────────────────────────────
  async function loadAll() {
    const [kRes, aRes] = await Promise.all([
      KoguApi.apiFetch(`${BASE}/kpis?anio=${anioActual}`),
      KoguApi.apiFetch(`${BASE}/alertas`),
    ]);
    kpis = KoguApi.unwrapRows(kRes);
    alertas = KoguApi.unwrapRows(aRes);
    const calc = (kRes?.data?.calculado_at) || null;
    document.getElementById('metaInfo').textContent = calc
      ? `Última actualización: ${KoguUi.fmtDate(calc)}`
      : 'Sin cálculo aún — presiona Recalcular.';
    fillAgenteFil();
    renderAlertas();
  }

  function renderAlertas() {
    const sv = sel('sevFil'), ag = sel('agenteFil');
    const filtered = alertas.filter(a =>
      (!sv || a.severidad === sv) && (!ag || a.agente_nombre === ag) && a.status !== 'descartada');

    const groups = new Map();
    const otras = [];
    filtered.forEach(a => {
      if (a.cliente_ref && (a.entidad_tipo === 'cliente' || a.entidad_tipo === 'cliente_producto')) {
        let g = groups.get(a.cliente_ref);
        if (!g) { g = { cliente_ref: a.cliente_ref, nombre: null, agente: null, alertas: [], rc005: null, rc004: null, productos: [] }; groups.set(a.cliente_ref, g); }
        g.alertas.push(a);
        const d = a.detalle || {};
        if (d.cliente_nombre && !g.nombre) g.nombre = d.cliente_nombre;
        if (a.agente_nombre && !g.agente) g.agente = a.agente_nombre;
        if (a.regla_clave === 'RC-005') g.rc005 = a;
        if (a.regla_clave === 'RC-004') g.rc004 = a;
        if (a.regla_clave === 'RC-006') g.productos.push(a);
      } else otras.push(a);
    });

    const grpRiesgo = g => g.rc005 ? montoRiesgo(g.rc005)
      : Math.max(g.productos.reduce((s, a) => s + montoRiesgo(a), 0), g.rc004 ? montoRiesgo(g.rc004) : 0);
    const grpSev = g => g.alertas.reduce((m, a) => Math.min(m, SEV_RANK[a.severidad] ?? 2), 2);
    const groupsArr = [...groups.values()].sort((a, b) => grpRiesgo(b) - grpRiesgo(a));

    const totalRiesgo = groupsArr.reduce((s, g) => s + grpRiesgo(g), 0);
    const nCriticas = groupsArr.filter(g => grpSev(g) === 0).length;
    document.getElementById('alertasResumen').innerHTML = `
      <div class="grid-4" style="gap:12px">
        ${KoguUi.cardStat(esDinero() ? 'Monto en riesgo' : 'Volumen en riesgo (kg)', fmtVal(totalRiesgo), 'dejaron de comprar (P1−P2)')}
        ${KoguUi.cardStat('Clientes en caída', String(groupsArr.length), `${nCriticas} críticos`)}
        ${KoguUi.cardStat('Productos en caída', String(groupsArr.reduce((s, g) => s + g.productos.length, 0)), 'alertas RC-006')}
        ${KoguUi.cardStat('Otras alertas', String(otras.length), 'empresa / agentes')}
      </div>`;

    if (!groupsArr.length && !otras.length) {
      document.getElementById('alertas').innerHTML = periodosBanner() + '<div class="empty">Sin alertas para el filtro</div>';
      return;
    }

    const sevWord = { 0: 'Crítica', 1: 'Alerta', 2: 'Info' };
    const sevBg = { 0: 'var(--danger,#dc2626)', 1: 'var(--warning,#d97706)', 2: 'var(--muted,#64748b)' };

    const cardCliente = g => {
      const riesgo = grpRiesgo(g);
      const sevN = grpSev(g);
      const varTxt = g.rc005 ? fmtPctCap(esDinero() ? g.rc005.detalle?.delta_importe : g.rc005.detalle?.delta_cantidad) : '';
      const prods = g.productos.slice().sort((a, b) => montoRiesgo(b) - montoRiesgo(a));
      const top = prods.slice(0, 6).map(a => {
        const d = a.detalle || {};
        const v1 = esDinero() ? d.importe_p1 : d.cant_p1;
        const v2 = esDinero() ? d.importe_p2 : d.cant_p2;
        const dl = esDinero() ? d.delta_importe : d.delta_cantidad;
        return `<div style="display:flex;justify-content:space-between;gap:8px;font-size:12px;padding:3px 0">
          <span style="color:var(--muted)">${a.producto_ref ? `<span class="chip-compact">${KoguUi.escapeHtml(a.producto_ref)}</span> ` : ''}${KoguUi.escapeHtml(d.desc_prod || '')}${d.abandonado ? ' <span style="color:var(--danger,#dc2626);font-weight:600">·abandonado</span>' : ''}</span>
          <span>${fmtVal(v1)} → ${fmtVal(v2)} <b style="color:var(--danger,#dc2626)">${fmtPctCap(dl)}</b></span>
        </div>`;
      }).join('');
      const masTxt = prods.length > 6 ? `<div style="font-size:11px;color:var(--muted);margin-top:4px">+${prods.length - 6} producto(s) más — ver Detalle</div>` : '';
      return `<div style="border:1px solid var(--line);border-left:4px solid ${sevBg[sevN]};border-radius:12px;padding:14px;margin-bottom:10px">
        <div class="row" style="align-items:flex-start">
          <div style="flex:1">
            <div style="display:flex;gap:8px;align-items:center">
              <span style="display:inline-block;padding:2px 10px;border-radius:999px;font-size:11px;font-weight:600;color:#fff;background:${sevBg[sevN]}">${sevWord[sevN]}</span>
              <span style="font-weight:700">${KoguUi.escapeHtml(g.nombre || g.cliente_ref)}</span>
              <span style="font-size:12px;color:var(--muted)">· ${g.agente ? KoguUi.escapeHtml(g.agente) : 'sin agente'}</span>
            </div>
            ${g.rc005 ? `<div style="font-size:12px;color:var(--muted);margin-top:3px">Caída general ${varTxt} · ${fmtVal(esDinero() ? g.rc005.detalle?.venta_p1 : g.rc005.detalle?.cant_p1)} → ${fmtVal(esDinero() ? g.rc005.detalle?.venta_p2 : g.rc005.detalle?.cant_p2)}</div>` : ''}
            ${g.rc004 ? `<div style="font-size:12px;color:var(--warning,#d97706);margin-top:3px">⏳ Sin compra hace ${g.rc004.detalle?.dias_sin_compra} días · última ${KoguUi.fmtDate(g.rc004.detalle?.ultima_compra).split(',')[0]}</div>` : ''}
            ${top ? `<div style="margin-top:8px">${top}${masTxt}</div>` : ''}
          </div>
          <div style="text-align:right;min-width:150px">
            <div style="font-size:11px;color:var(--muted);text-transform:uppercase">En riesgo</div>
            <div style="font-size:19px;font-weight:800;color:var(--danger,#dc2626)">${fmtVal(riesgo)}</div>
            <div style="display:flex;gap:6px;justify-content:flex-end;margin-top:8px">
              <button class="btn primary" data-ficha-grp="${g.cliente_ref}" style="font-size:12px">Detalle</button>
              <button class="btn" data-descgrp="${g.cliente_ref}" style="font-size:12px">Descartar</button>
            </div>
          </div>
        </div>
      </div>`;
    };

    const fmtBase = (v, base) => base === 'kg' ? `${nf0.format(Number(v || 0))} kg` : money(v);
    const cardOtra = a => {
      const d = a.detalle || {};
      let sub = '';
      if (a.regla_clave === 'RC-001') {
        sub = `<div style="font-size:12px;color:var(--muted);margin-top:2px">Meta ${fmtBase(d.meta, d.base)} · Actual ${fmtBase(d.actual, d.base)} · faltan ${fmtBase(d.faltante_ritmo, d.base)} para el ritmo esperado</div>`;
      }
      return `<div style="border:1px solid var(--line);border-radius:12px;padding:12px;margin-bottom:8px">
        <div class="row" style="align-items:center">
          <div style="flex:1">
            <div style="display:flex;gap:8px;align-items:center;margin-bottom:2px">${sevBadge(a.severidad)}<span class="chip-compact">${KoguUi.escapeHtml(a.regla_clave)}</span></div>
            <div style="font-weight:600;font-size:14px">${KoguUi.escapeHtml(tituloDe(a))}</div>
            ${sub}
          </div>
          <button class="btn" data-act="descartada" data-id="${a.alerta_id}" style="font-size:12px">Descartar</button>
        </div>
      </div>`;
    };

    const otrasHtml = otras.length
      ? `<div class="eyebrow" style="margin:18px 0 8px">Otras alertas (empresa / agentes)</div>${otras.map(cardOtra).join('')}`
      : '';

    document.getElementById('alertas').innerHTML =
      periodosBanner() + (groupsArr.map(cardCliente).join('') || '<div class="empty">Sin clientes en caída para el filtro</div>') + otrasHtml;

    document.querySelectorAll('#alertas .btn[data-ficha-grp]').forEach(x => x.onclick = () => {
      const g = groups.get(x.dataset.fichaGrp);
      const a = g && (g.rc005 || g.productos[0] || g.rc004);
      if (a) openFicha(a);
    });
    document.querySelectorAll('#alertas .btn[data-descgrp]').forEach(x => x.onclick = async () => {
      const g = groups.get(x.dataset.descgrp); if (!g) return;
      try {
        await Promise.all(g.alertas.map(a => KoguApi.apiFetch(`${BASE}/alertas/${a.alerta_id}/status`, { method: 'PUT', body: JSON.stringify({ status: 'descartada' }) })));
        g.alertas.forEach(a => { const z = alertas.find(q => q.alerta_id === a.alerta_id); if (z) z.status = 'descartada'; });
        KoguApi.toast('Caso descartado', 'success');
        renderAlertas();
      } catch (err) { KoguApi.toast(err.message, 'error'); }
    });
    document.querySelectorAll('#alertas .btn[data-act]').forEach(x => x.onclick = async () => {
      try {
        await KoguApi.apiFetch(`${BASE}/alertas/${x.dataset.id}/status`, { method: 'PUT', body: JSON.stringify({ status: x.dataset.act }) });
        KoguApi.toast('Alerta actualizada', 'success');
        const a = alertas.find(z => z.alerta_id === x.dataset.id); if (a) a.status = x.dataset.act;
        renderAlertas();
      } catch (err) { KoguApi.toast(err.message, 'error'); }
    });
  }

  // ── Ficha de detalle (modal) ────────────────────────────────────────────────
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
    const valP1 = pr => esDinero() ? Number(pr.p1 || 0) : Number(pr.cant_p1 || 0);
    const valP2 = pr => esDinero() ? Number(pr.p2 || 0) : Number(pr.cant_p2 || 0);
    const prods = (d.productos || []).slice().sort((a, b) => (valP2(a) - valP1(a)) - (valP2(b) - valP1(b)));
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
  document.getElementById('presetFil').onchange = () => show('customPeriodos', sel('presetFil') === 'custom');
  document.getElementById('metricaFil').value = metrica;
  document.getElementById('metricaFil').onchange = (e) => {
    metrica = e.target.value;
    localStorage.setItem('kogu:rc-metrica', metrica);
    renderAlertas();
  };
  document.getElementById('sevFil').onchange = renderAlertas;
  document.getElementById('agenteFil').onchange = renderAlertas;
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

  KoguShell.subscribeEmpresaActivaChange(loadAll);
  await loadAll();
});

document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/rc/mi-panel.html';
  const BASE = '/protected/rc';
  const PERM = 'screen.ventas.vendedor';

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Mi panel',
    description: 'Tu cartera: avance vs meta y tus clientes en riesgo · Radar Comercial.',
    requiredPermission: PERM,
  });
  if (!b) return;

  const c = document.getElementById('pageContent');
  c.innerHTML = `
<div class="stack" style="gap:16px">
  <div class="card">
    <div class="row">
      <div><div class="eyebrow">Radar · Vendedor</div><h2 id="tituloPanel">Mi panel</h2>
        <div class="hint" id="metaInfo" style="margin-top:4px;color:var(--muted)">—</div>
      </div>
      <select class="select" id="metricaFil" style="max-width:160px">
        <option value="dinero">$ Dinero (MXN)</option>
        <option value="cantidad">⚖ Cantidad (kg)</option>
      </select>
    </div>
    <div id="cumplCard" style="margin-top:14px"></div>
  </div>

  <div class="card">
    <div class="row">
      <div><div class="eyebrow">Acción</div><h2>Mis clientes en riesgo</h2></div>
      <select class="select" id="sevFil">
        <option value="">Toda severidad</option>
        <option value="critica">Crítica</option>
        <option value="alerta">Alerta</option>
        <option value="info">Info</option>
      </select>
    </div>
    <div id="alertas" style="margin-top:14px"></div>
  </div>
</div>`;

  const money = v => KoguUi.money(Number(v || 0));
  const sel = id => document.getElementById(id)?.value ?? '';
  let metrica = localStorage.getItem('kogu:rc-metrica') || 'cantidad';
  const esDinero = () => metrica === 'dinero';
  const nf0 = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 });
  const fmtVal = v => esDinero() ? money(v) : `${nf0.format(Number(v || 0))} kg`;
  const measSubt = r => esDinero() ? Number(r.subt || 0) : Number(r.cantidad || 0);
  const metricaLbl = () => esDinero() ? 'MXN-eq' : 'kg (aprox)';
  const fmtBase = (v, base) => base === 'kg' ? `${nf0.format(Number(v || 0))} kg` : money(v);
  const pct = v => v == null ? '—' : `${Math.round(Number(v) * 100)}%`;
  const MESES = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const mesIni = iso => MESES[new Date(iso).getUTCMonth() + 1] || '';
  const mesPrev = iso => MESES[new Date(iso).getUTCMonth()] || MESES[12];
  const rangoP1 = p => p?.p1d ? `${mesIni(p.p1d)}–${mesPrev(p.p1h)}` : '';
  const rangoP2 = p => p?.p2d ? `${mesIni(p.p2d)}–${mesIni(p.p2h)}` : '';
  const fmtPctCap = d => { const n = Number(d); if (n <= -1) return '−100%+'; return `${(n * 100).toFixed(1)}%`; };
  const SEV_RANK = { critica: 0, alerta: 1, info: 2 };
  const SEM = { verde: 'var(--ok,#16a34a)', amarillo: 'var(--warning,#d97706)', naranja: '#ea580c', rojo: 'var(--danger,#dc2626)', sin_meta: 'var(--muted,#64748b)' };
  const SEM_TXT = { verde: 'Al día', amarillo: 'Atención', naranja: 'Atrasado', rojo: 'Crítico', sin_meta: 'Sin meta' };

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

  let panel = { agente: null, alertas: [], cumplimiento: null };

  document.getElementById('metricaFil').value = metrica;

  async function load() {
    const res = await KoguApi.apiFetch(`${BASE}/mi-panel`);
    panel = res?.data || res;
    if (!panel.agente) {
      document.getElementById('tituloPanel').textContent = 'Mi panel';
      document.getElementById('metaInfo').textContent = '';
      document.getElementById('cumplCard').innerHTML =
        '<div class="empty">Tu usuario no está vinculado a un agente. Pide al administrador que lo vincule en <b>Agentes comerciales</b> (campo "Usuario KOGU vinculado").</div>';
      document.getElementById('alertas').innerHTML = '';
      return;
    }
    document.getElementById('tituloPanel').textContent = panel.agente.agente_nombre;
    document.getElementById('metaInfo').textContent =
      `Agente cve ${panel.agente.cve_agente} · año ${panel.anio} · ${panel.meses_transcurridos} meses transcurridos`;
    renderCumpl();
    renderAlertas();
  }

  function renderCumpl() {
    const r = panel.cumplimiento;
    if (!r || !r.tiene_meta) {
      document.getElementById('cumplCard').innerHTML =
        '<div class="empty">Sin meta capturada para este año. Captúrala en Agentes → Meta anual.</div>';
      return;
    }
    const semColor = SEM[r.semaforo] || SEM.sin_meta;
    document.getElementById('cumplCard').innerHTML = `
      <div class="grid-4" style="gap:12px">
        ${KoguUi.cardStat(`Meta ${panel.anio} (${r.base === 'kg' ? 'kg' : 'MXN'})`, fmtBase(r.meta, r.base), '')}
        ${KoguUi.cardStat('Vendido', fmtBase(r.actual, r.base), `esperado ${fmtBase(r.esperado, r.base)}`)}
        ${KoguUi.cardStat('Avance', `<span style="color:${semColor}">${pct(r.avance)}</span>`, SEM_TXT[r.semaforo] || '')}
        ${KoguUi.cardStat('Faltante al ritmo', fmtBase(r.faltante_ritmo, r.base), `${fmtBase(r.faltante_anual, r.base)} a la meta anual`)}
      </div>`;
  }

  function renderAlertas() {
    const sv = sel('sevFil');
    const filtered = (panel.alertas || []).filter(a =>
      (!sv || a.severidad === sv) && a.status !== 'descartada' &&
      a.cliente_ref && (a.entidad_tipo === 'cliente' || a.entidad_tipo === 'cliente_producto'));

    const groups = new Map();
    filtered.forEach(a => {
      let g = groups.get(a.cliente_ref);
      if (!g) { g = { cliente_ref: a.cliente_ref, nombre: null, alertas: [], rc005: null, rc004: null, productos: [] }; groups.set(a.cliente_ref, g); }
      g.alertas.push(a);
      const d = a.detalle || {};
      if (d.cliente_nombre && !g.nombre) g.nombre = d.cliente_nombre;
      if (a.regla_clave === 'RC-005') g.rc005 = a;
      if (a.regla_clave === 'RC-004') g.rc004 = a;
      if (a.regla_clave === 'RC-006') g.productos.push(a);
    });
    const grpRiesgo = g => g.rc005 ? montoRiesgo(g.rc005)
      : Math.max(g.productos.reduce((s, a) => s + montoRiesgo(a), 0), g.rc004 ? montoRiesgo(g.rc004) : 0);
    const grpSev = g => g.alertas.reduce((m, a) => Math.min(m, SEV_RANK[a.severidad] ?? 2), 2);
    const arr = [...groups.values()].sort((a, b) => grpRiesgo(b) - grpRiesgo(a));

    if (!arr.length) { document.getElementById('alertas').innerHTML = '<div class="empty">Sin clientes en riesgo para el filtro. ¡Bien!</div>'; return; }

    const sevWord = { 0: 'Crítica', 1: 'Alerta', 2: 'Info' };
    const sevBg = { 0: 'var(--danger,#dc2626)', 1: 'var(--warning,#d97706)', 2: 'var(--muted,#64748b)' };
    document.getElementById('alertas').innerHTML = arr.map(g => {
      const riesgo = grpRiesgo(g); const sevN = grpSev(g);
      const prods = g.productos.slice().sort((a, b) => montoRiesgo(b) - montoRiesgo(a)).slice(0, 6).map(a => {
        const d = a.detalle || {};
        const v1 = esDinero() ? d.importe_p1 : d.cant_p1, v2 = esDinero() ? d.importe_p2 : d.cant_p2, dl = esDinero() ? d.delta_importe : d.delta_cantidad;
        return `<div style="display:flex;justify-content:space-between;gap:8px;font-size:12px;padding:3px 0">
          <span style="color:var(--muted)">${a.producto_ref ? `<span class="chip-compact">${KoguUi.escapeHtml(a.producto_ref)}</span> ` : ''}${KoguUi.escapeHtml(d.desc_prod || '')}${d.abandonado ? ' <span style="color:var(--danger,#dc2626);font-weight:600">·abandonado</span>' : ''}</span>
          <span>${fmtVal(v1)} → ${fmtVal(v2)} <b style="color:var(--danger,#dc2626)">${fmtPctCap(dl)}</b></span>
        </div>`;
      }).join('');
      return `<div style="border:1px solid var(--line);border-left:4px solid ${sevBg[sevN]};border-radius:12px;padding:14px;margin-bottom:10px">
        <div class="row" style="align-items:flex-start">
          <div style="flex:1">
            <div style="display:flex;gap:8px;align-items:center">
              <span style="display:inline-block;padding:2px 10px;border-radius:999px;font-size:11px;font-weight:600;color:#fff;background:${sevBg[sevN]}">${sevWord[sevN]}</span>
              <span style="font-weight:700">${KoguUi.escapeHtml(g.nombre || g.cliente_ref)}</span>
            </div>
            ${g.rc004 ? `<div style="font-size:12px;color:var(--warning,#d97706);margin-top:3px">⏳ Sin compra hace ${g.rc004.detalle?.dias_sin_compra} días · última ${KoguUi.fmtDate(g.rc004.detalle?.ultima_compra).split(',')[0]}</div>` : ''}
            ${prods ? `<div style="margin-top:8px">${prods}</div>` : ''}
          </div>
          <div style="text-align:right;min-width:140px">
            <div style="font-size:11px;color:var(--muted);text-transform:uppercase">En riesgo</div>
            <div style="font-size:19px;font-weight:800;color:var(--danger,#dc2626)">${fmtVal(riesgo)}</div>
            <button class="btn primary" data-ficha-grp="${g.cliente_ref}" style="font-size:12px;margin-top:8px">Detalle</button>
          </div>
        </div>
      </div>`;
    }).join('');

    document.querySelectorAll('#alertas .btn[data-ficha-grp]').forEach(x => x.onclick = () => {
      const g = groups.get(x.dataset.fichaGrp);
      const a = g && (g.rc005 || g.productos[0] || g.rc004);
      if (a) openFicha(a);
    });
  }

  // ── Ficha (modal) ───────────────────────────────────────────────────────────
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
    const kpi = (lbl, val, hint = '') =>
      `<div style="border:1px solid var(--line);border-radius:10px;padding:10px"><div style="font-size:11px;color:var(--muted);text-transform:uppercase">${lbl}</div><div style="font-size:18px;font-weight:700;margin-top:2px">${val}</div>${hint ? `<div style="font-size:11px;color:var(--muted)">${hint}</div>` : ''}</div>`;
    const filas = prods.slice(0, 40).map(pr => {
      const a = valP1(pr), bb = valP2(pr);
      const dlt = a ? (bb - a) / a : null;
      const color = bb < a ? 'var(--danger,#dc2626)' : 'var(--muted)';
      const ab = a > 0 && bb === 0;
      return `<tr><td><span class="chip-compact">${KoguUi.escapeHtml(pr.cve_prod)}</span></td>
        <td>${KoguUi.escapeHtml(pr.desc_prod || '')}${ab ? ' <span style="color:var(--danger,#dc2626);font-weight:600">abandonado</span>' : ''}</td>
        <td style="text-align:right">${fmtVal(a)}</td><td style="text-align:right">${fmtVal(bb)}</td>
        <td style="text-align:right;color:${color};font-weight:600">${dlt == null ? '—' : fmtPctCap(dlt)}</td></tr>`;
    }).join('');
    const meses = d.meses || [];
    const maxM = Math.max(1, ...meses.map(measSubt));
    const trend = meses.map(m => {
      const v = measSubt(m); const w = Math.round(100 * v / maxM);
      return `<div style="display:flex;align-items:center;gap:10px;margin:5px 0"><div style="width:64px;font-size:12px;color:var(--muted)">${MESES[m.mes] || m.mes} ${String(m.anio).slice(2)}</div><div style="flex:1;background:var(--panel2,#f1f5f9);border-radius:6px"><div style="width:${w}%;min-width:2px;height:16px;background:${v < 0 ? 'var(--danger,#dc2626)' : 'var(--brand,#2563eb)'}"></div></div><div style="width:120px;text-align:right;font-size:12px">${fmtVal(v)}</div></div>`;
    }).join('');
    const html = `
      <div id="rcFichaModal" style="position:fixed;inset:0;z-index:9999;background:rgba(15,23,42,.55);display:flex;justify-content:center;align-items:flex-start;overflow:auto;padding:32px 16px">
        <div style="background:var(--panel,#fff);border-radius:16px;max-width:920px;width:100%;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,.3)">
          <div class="row" style="align-items:flex-start;margin-bottom:8px">
            <div><div class="eyebrow">Ficha de cliente · ${r1} vs ${r2}</div>
              <h2 style="margin:4px 0 0">${KoguUi.escapeHtml(d.cliente_nombre || d.cliente_ref)}</h2></div>
            <button class="btn" id="rcFichaClose">Cerrar ✕</button>
          </div>
          <div class="grid-4" style="gap:12px;margin-bottom:8px">
            ${kpi(`P1 ${r1}`, fmtVal(totP1))}
            ${kpi(`P2 ${r2}`, fmtVal(totP2))}
            ${kpi('Variación', `<span style="color:${Number(deltaTot) < 0 ? 'var(--danger,#dc2626)' : 'var(--brand,#2563eb)'}">${fmtPctCap(deltaTot)}</span>`)}
            ${kpi('Última compra', KoguUi.fmtDate(ind.ultima_compra).split(',')[0] || '—', ind.dias_sin_compra != null ? `${ind.dias_sin_compra} días sin comprar` : '')}
          </div>
          <div class="eyebrow" style="margin:16px 0 8px">Productos (${prods.length}) · ${metricaLbl()}</div>
          <div class="table-wrap"><table><thead><tr><th>Cve</th><th>Producto</th><th style="text-align:right">P1</th><th style="text-align:right">P2</th><th style="text-align:right">Var</th></tr></thead><tbody>${filas || '<tr><td colspan="5" class="empty">Sin productos</td></tr>'}</tbody></table></div>
          <div style="margin-top:16px"><div class="eyebrow" style="margin-bottom:8px">Tendencia mensual</div>${trend || '<div class="empty">Sin datos</div>'}</div>
        </div>
      </div>`;
    closeFicha();
    document.body.insertAdjacentHTML('beforeend', html);
    document.getElementById('rcFichaClose').onclick = closeFicha;
    document.getElementById('rcFichaModal').onclick = e => { if (e.target.id === 'rcFichaModal') closeFicha(); };
  }

  document.getElementById('metricaFil').onchange = (e) => {
    metrica = e.target.value;
    localStorage.setItem('kogu:rc-metrica', metrica);
    renderCumpl(); renderAlertas();
  };
  document.getElementById('sevFil').onchange = renderAlertas;
  KoguShell.subscribeEmpresaActivaChange(load);
  await load();
});

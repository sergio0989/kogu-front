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
      <div style="display:flex;gap:10px;align-items:center">
        <select class="select" id="anioFil" style="max-width:110px"></select>
        <select class="select" id="agenteSel" style="max-width:240px" title="Ver cartera de un agente"><option value="">Mi cartera (mi usuario)</option></select>
        <select class="select" id="metricaFil" style="max-width:160px">
          <option value="dinero">$ Dinero (MXN)</option>
          <option value="cantidad">⚖ Cantidad (kg)</option>
        </select>
        <button class="btn" id="exportBtn" title="Descargar Excel del agente">⬇ Exportar</button>
      </div>
    </div>
    <div id="cumplCard" style="margin-top:14px"></div>
  </div>

  <div class="card">
    <div class="row">
      <div><div class="eyebrow">Acción</div><h2 id="listaTitulo">Mis clientes en riesgo</h2></div>
      <div style="display:flex;gap:10px">
        <select class="select" id="vistaFil">
          <option value="riesgo">Solo en riesgo</option>
          <option value="sanos">Solo sanos</option>
          <option value="cartera">Toda la cartera</option>
          <option value="ventas">Ventas por mes</option>
        </select>
        <select class="select" id="sevFil">
          <option value="">Toda severidad</option>
          <option value="critica">Crítica</option>
          <option value="alerta">Alerta</option>
          <option value="info">Info</option>
        </select>
      </div>
    </div>
    <div id="carteraResumen" style="margin-top:14px"></div>
    <div id="alertas" style="margin-top:14px"></div>
  </div>
</div>`;

  const money = v => KoguUi.money(Number(v || 0));
  const sel = id => document.getElementById(id)?.value ?? '';
  const show = (id, v) => { const el = document.getElementById(id); if (el) el.style.display = v ? '' : 'none'; };
  // Tarjeta KPI compacta (más eficiente en espacio que KoguUi.cardStat).
  const miniCard = (lbl, val, hint = '', color = '') => `
    <div style="border:1px solid var(--line);border-radius:10px;padding:9px 12px">
      <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.03em">${KoguUi.escapeHtml(lbl)}</div>
      <div style="font-size:17px;font-weight:800;line-height:1.15;margin-top:1px;${color ? `color:${color}` : ''}">${KoguUi.escapeHtml(val)}</div>
      ${hint ? `<div style="font-size:10px;color:var(--muted)">${KoguUi.escapeHtml(hint)}</div>` : ''}
    </div>`;
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

  // Selector de año (calendario Ene–Dic; misma lógica que Cumplimiento).
  const anioActual = new Date().getFullYear();
  const anioFilEl = document.getElementById('anioFil');
  anioFilEl.innerHTML = [anioActual, anioActual - 1, anioActual - 2].map(a => `<option value="${a}">${a}</option>`).join('');
  anioFilEl.value = String(anioActual);

  // Selector de agente (para Dirección/Gerencia: previsualizar cualquier cartera).
  async function loadAgentesSel() {
    try {
      const res = await KoguApi.apiFetch(`${BASE}/agentes?activo=true`);
      const ags = KoguApi.unwrapRows(res);
      const cur = sel('agenteSel');
      document.getElementById('agenteSel').innerHTML =
        '<option value="">Mi cartera (mi usuario)</option>' +
        ags.map(a => `<option value="${a.agente_id}">${KoguUi.escapeHtml(`${a.cve_agente} · ${a.nombre}`)}</option>`).join('');
      document.getElementById('agenteSel').value = cur;
    } catch (_) { /* sin permiso de agentes: solo "Mi cartera" */ }
  }

  function qsAgenteAnio() {
    const ag = sel('agenteSel'), anio = sel('anioFil');
    const p = new URLSearchParams();
    if (ag) p.set('agente_id', ag);
    if (anio) p.set('anio', anio);
    const s = p.toString();
    return s ? `?${s}` : '';
  }

  async function load() {
    const res = await KoguApi.apiFetch(`${BASE}/mi-panel${qsAgenteAnio()}`);
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
    render();
  }

  const riskRefs = () => new Set((panel.alertas || [])
    .filter(a => a.cliente_ref && (a.entidad_tipo === 'cliente' || a.entidad_tipo === 'cliente_producto') && a.status !== 'descartada')
    .map(a => a.cliente_ref));

  function renderResumen() {
    const cartera = panel.cartera || [];
    if (!panel.agente) { document.getElementById('carteraResumen').innerHTML = ''; return; }
    const riesgo = riskRefs();
    const total = cartera.length;
    const enRiesgo = cartera.filter(c => riesgo.has(c.cliente_ref)).length;
    const ventaImp = cartera.reduce((s, c) => s + Number(c.venta_imp || 0), 0);
    const ventaQty = cartera.reduce((s, c) => s + Number(c.venta_qty || 0), 0);
    const sinVenta = cartera.filter(c => Number(c.venta_imp || 0) === 0).length;
    document.getElementById('carteraResumen').innerHTML = `
      <div class="grid-4" style="gap:10px">
        ${miniCard('Clientes en cartera', String(total), `${sinVenta} sin compra ${panel.anio}`)}
        ${miniCard('En riesgo', String(enRiesgo), `${total ? Math.round(100 * enRiesgo / total) : 0}% de la cartera`, enRiesgo ? 'var(--danger,#dc2626)' : '')}
        ${miniCard(`Venta ${panel.anio}`, fmtVal(esDinero() ? ventaImp : ventaQty), 'cartera del agente')}
        ${miniCard('Sanos', String(total - enRiesgo), 'sin alertas', 'var(--ok,#16a34a)')}
      </div>`;
  }

  // Resumen estilo Bandeja (enfoque en el riesgo) para la vista "Solo en riesgo".
  function renderResumenRiesgo() {
    const groups = new Map();
    let productos = 0, sinCompra = 0;
    (panel.alertas || []).filter(a => a.status !== 'descartada' && a.cliente_ref &&
      (a.entidad_tipo === 'cliente' || a.entidad_tipo === 'cliente_producto')).forEach(a => {
        let g = groups.get(a.cliente_ref);
        if (!g) { g = { alertas: [], rc005: null, rc004: null, productos: [] }; groups.set(a.cliente_ref, g); }
        g.alertas.push(a);
        if (a.regla_clave === 'RC-005') g.rc005 = a;
        if (a.regla_clave === 'RC-004') { g.rc004 = a; sinCompra++; }
        if (a.regla_clave === 'RC-006') { g.productos.push(a); productos++; }
      });
    const grpRiesgo = g => g.rc005 ? montoRiesgo(g.rc005)
      : Math.max(g.productos.reduce((s, a) => s + montoRiesgo(a), 0), g.rc004 ? montoRiesgo(g.rc004) : 0);
    const arr = [...groups.values()];
    const totalRiesgo = arr.reduce((s, g) => s + grpRiesgo(g), 0);
    const nCriticas = arr.filter(g => g.alertas.some(a => a.severidad === 'critica')).length;
    document.getElementById('carteraResumen').innerHTML = `
      <div class="grid-4" style="gap:10px">
        ${miniCard(esDinero() ? 'Monto en riesgo' : 'Volumen en riesgo (kg)', fmtVal(totalRiesgo), 'dejaron de comprar (P1−P2)', 'var(--danger,#dc2626)')}
        ${miniCard('Clientes en caída', String(arr.length), `${nCriticas} críticos`)}
        ${miniCard('Productos en caída', String(productos), 'alertas RC-006')}
        ${miniCard('Sin compra', String(sinCompra), 'clientes dormidos')}
      </div>`;
  }

  function render() {
    const vista = sel('vistaFil');
    const titulos = { riesgo: 'Mis clientes en riesgo', sanos: 'Mis clientes sanos', cartera: 'Toda mi cartera', ventas: 'Ventas por mes' };
    document.getElementById('listaTitulo').textContent = titulos[vista] || titulos.riesgo;
    show('sevFil', vista === 'riesgo');
    if (vista === 'riesgo') { renderResumenRiesgo(); renderAlertas(); }
    else if (vista === 'ventas') { renderResumen(); renderVentas(); }
    else { renderResumen(); renderCartera(vista); }
  }

  // Vista "Ventas por mes": pivote cliente × mes (Cantidad o Importe según métrica).
  async function renderVentas() {
    document.getElementById('alertas').innerHTML = '<div class="empty">Cargando ventas…</div>';
    let d;
    try {
      const res = await KoguApi.apiFetch(`${BASE}/ventas-mensuales${qsAgenteAnio()}`);
      d = res?.data || res;
    } catch (err) { document.getElementById('alertas').innerHTML = `<div class="empty">${KoguUi.escapeHtml(err.message)}</div>`; return; }
    if (!d || !d.agente) { document.getElementById('alertas').innerHTML = '<div class="empty">Sin agente.</div>'; return; }
    const meses = d.meses || [], clientes = d.clientes || [];
    if (!clientes.length) { document.getElementById('alertas').innerHTML = '<div class="empty">Sin ventas en el año.</div>'; return; }
    const head = `<th>Cliente</th>${meses.map(m => `<th style="text-align:right">${MESES[m] || m}</th>`).join('')}<th style="text-align:right">Total</th>`;
    const body = clientes.map(c => {
      const cells = meses.map(m => { const cell = c.mes[m]; return `<td style="text-align:right">${cell ? fmtVal(esDinero() ? cell.imp : cell.cant) : '<span style="color:var(--muted)">—</span>'}</td>`; }).join('');
      const tot = esDinero() ? c.tImp : c.tCant;
      return `<tr><td>${KoguUi.escapeHtml(c.cliente || c.cref)}</td>${cells}<td style="text-align:right;font-weight:700">${fmtVal(tot)}</td></tr>`;
    }).join('');
    document.getElementById('alertas').innerHTML =
      `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>
       <div class="hint" style="margin-top:8px;color:var(--muted);font-size:12px">Métrica: ${esDinero() ? 'Importe (MXN)' : 'Cantidad (kg)'} · ${clientes.length} clientes · ${d.anio}</div>`;
  }

  async function exportarAgente() {
    const ag = sel('agenteSel');
    const anio = sel('anioFil') || new Date().getFullYear();
    try {
      const res = await KoguApi.authFetchRaw(`${BASE}/reporte/agente?anio=${anio}${ag ? `&agente_id=${ag}` : ''}`);
      if (!res.ok) { KoguApi.toast('No se pudo generar el reporte (¿agente sin resolver?).', 'error'); return; }
      const blob = await res.blob();
      const cd = res.headers.get('Content-Disposition') || '';
      const m = cd.match(/filename="?([^"]+)"?/);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = m ? m[1] : `Reporte_Agente_${anio}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch (err) { KoguApi.toast(err.message, 'error'); }
  }

  function renderCartera(mode = 'cartera') {
    const riesgo = riskRefs();
    let cartera = (panel.cartera || []).slice();
    if (mode === 'sanos') cartera = cartera.filter(c => !riesgo.has(c.cliente_ref));
    if (!cartera.length) {
      const msg = mode === 'sanos' ? 'No hay clientes sanos para mostrar.' : 'Este agente no tiene clientes asignados.';
      document.getElementById('alertas').innerHTML = `<div class="empty">${msg}</div>`;
      return;
    }
    // Tarjetas homologadas con la vista "Solo en riesgo" (borde de color por estado).
    document.getElementById('alertas').innerHTML = cartera.map(c => {
      const enR = riesgo.has(c.cliente_ref);
      const sinV = Number(c.venta_imp || 0) === 0;
      const color = enR ? 'var(--danger,#dc2626)' : (sinV ? 'var(--muted,#64748b)' : 'var(--ok,#16a34a)');
      const estado = enR ? 'En riesgo' : (sinV ? 'Sin compra' : 'Sano');
      const venta = esDinero() ? Number(c.venta_imp || 0) : Number(c.venta_qty || 0);
      const ult = c.ultima_compra ? KoguUi.fmtDate(c.ultima_compra).split(',')[0] : '—';
      return `<div style="border:1px solid var(--line);border-left:4px solid ${color};border-radius:12px;padding:12px 14px;margin-bottom:8px">
        <div class="row" style="align-items:center">
          <div style="flex:1">
            <div style="display:flex;gap:8px;align-items:center">
              <span style="display:inline-block;padding:2px 10px;border-radius:999px;font-size:11px;font-weight:600;color:#fff;background:${color}">${estado}</span>
              <span style="font-weight:700">${KoguUi.escapeHtml(c.nombre || c.cliente_ref)}</span>
              <span style="font-size:11px;color:var(--muted)">· ${KoguUi.escapeHtml(c.cliente_ref || '')}</span>
            </div>
            <div style="font-size:12px;color:var(--muted);margin-top:3px">Última compra ${ult}${c.dias_sin_compra != null ? ` · hace ${c.dias_sin_compra} días` : ''}</div>
          </div>
          <div style="text-align:right;min-width:150px">
            <div style="font-size:11px;color:var(--muted);text-transform:uppercase">Venta ${panel.anio}</div>
            <div style="font-size:18px;font-weight:800">${fmtVal(venta)}</div>
            <button class="btn primary btn-ficha" data-ref="${KoguUi.escapeHtml(c.cliente_ref || '')}" style="font-size:12px;margin-top:6px">Detalle</button>
          </div>
        </div>
      </div>`;
    }).join('');
    document.querySelectorAll('#alertas .btn-ficha').forEach(x => x.onclick = () => openFicha({ cliente_ref: x.dataset.ref, detalle: {} }));
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
      <div class="grid-4" style="gap:10px">
        ${miniCard(`Meta ${panel.anio} (${r.base === 'kg' ? 'kg' : 'MXN'})`, fmtBase(r.meta, r.base))}
        ${miniCard('Vendido', fmtBase(r.actual, r.base), `esperado ${fmtBase(r.esperado, r.base)}`)}
        ${miniCard('Avance', pct(r.avance), SEM_TXT[r.semaforo] || '', semColor)}
        ${miniCard('Faltante al ritmo', fmtBase(r.faltante_ritmo, r.base), `${fmtBase(r.faltante_anual, r.base)} a meta anual`)}
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
      const varTxt = g.rc005 ? fmtPctCap(esDinero() ? g.rc005.detalle?.delta_importe : g.rc005.detalle?.delta_cantidad) : '';
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
            ${g.rc005 ? `<div style="font-size:12px;color:var(--muted);margin-top:3px">Caída general ${varTxt} · ${fmtVal(esDinero() ? g.rc005.detalle?.venta_p1 : g.rc005.detalle?.cant_p1)} → ${fmtVal(esDinero() ? g.rc005.detalle?.venta_p2 : g.rc005.detalle?.cant_p2)}</div>` : ''}
            ${g.rc004 ? `<div style="font-size:12px;color:var(--warning,#d97706);margin-top:3px">⏳ Sin compra hace ${g.rc004.detalle?.dias_sin_compra} días · última ${KoguUi.fmtDate(g.rc004.detalle?.ultima_compra).split(',')[0]}</div>` : ''}
            ${prods ? `<div style="margin-top:8px">${prods}</div>` : ''}
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
    }).join('');

    document.querySelectorAll('#alertas .btn[data-ficha-grp]').forEach(x => x.onclick = () => {
      const g = groups.get(x.dataset.fichaGrp);
      const a = g && (g.rc005 || g.productos[0] || g.rc004);
      if (a) openFicha(a);
    });
    document.querySelectorAll('#alertas .btn[data-descgrp]').forEach(x => x.onclick = async () => {
      const g = groups.get(x.dataset.descgrp); if (!g) return;
      try {
        await Promise.all(g.alertas.map(a => KoguApi.apiFetch(`${BASE}/alertas/${a.alerta_id}/status`, { method: 'PUT', body: JSON.stringify({ status: 'descartada' }) })));
        g.alertas.forEach(a => { const z = (panel.alertas || []).find(q => q.alerta_id === a.alerta_id); if (z) z.status = 'descartada'; });
        KoguApi.toast('Caso descartado', 'success');
        render();
      } catch (err) { KoguApi.toast(err.message, 'error'); }
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
    renderCumpl(); render();
  };
  document.getElementById('sevFil').onchange = render;
  document.getElementById('vistaFil').onchange = render;
  document.getElementById('agenteSel').onchange = load;
  document.getElementById('anioFil').onchange = load;
  document.getElementById('exportBtn').onclick = (e) => KoguUi.withLoading(e.target, exportarAgente, 'Generando…');
  KoguShell.subscribeEmpresaActivaChange(async () => { await loadAgentesSel(); await load(); });
  await loadAgentesSel();
  await load();
});

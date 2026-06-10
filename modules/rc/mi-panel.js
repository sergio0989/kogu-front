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

    <!-- Periodo propio de Mi panel (solo aplica a la vista "Solo en riesgo") -->
    <div id="periodoBox" style="margin-top:12px">
      <div style="display:flex;gap:10px;align-items:end;flex-wrap:wrap">
        <div style="max-width:260px">
          <div class="label-text">Periodo comparativo (independiente)</div>
          <select class="select" id="presetFil">
            <option value="auto">Automático (2 meses vs 2 meses)</option>
            <option value="mes">Mes vs mes anterior</option>
            <option value="custom">Personalizado</option>
          </select>
        </div>
        <div id="customPeriodos" style="display:none;gap:8px;align-items:end;flex-wrap:wrap">
          <div><div class="label-text">P1 desde</div><input class="input" id="p1d" type="date"/></div>
          <div><div class="label-text">P1 hasta</div><input class="input" id="p1h" type="date"/></div>
          <span style="align-self:center;color:var(--muted)">vs</span>
          <div><div class="label-text">P2 desde</div><input class="input" id="p2d" type="date"/></div>
          <div><div class="label-text">P2 hasta</div><input class="input" id="p2h" type="date"/></div>
          <button class="btn" id="aplicarPeriodo">Aplicar</button>
        </div>
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

  // Periodos propios de Mi panel (independientes de Tablero/Bandeja).
  const pad = n => String(n).padStart(2, '0');
  const isoUTC = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
  const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
  const addDays = (iso, n) => { const d = new Date(iso); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  function computePeriodos() {
    const preset = sel('presetFil');
    if (preset === 'mes') {
      const y = Number(panel.anio) || new Date().getFullYear();
      const m = Number(panel.meses_transcurridos) || 12;
      const py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1;
      return { p1d: isoUTC(py, pm, 1), p1h: isoUTC(y, m, 1), p2d: isoUTC(y, m, 1), p2h: isoUTC(y, m, lastDay(y, m)) };
    }
    if (preset === 'custom') {
      const p1d = sel('p1d'), p1hIn = sel('p1h'), p2d = sel('p2d'), p2h = sel('p2h');
      if (!p1d || !p1hIn || !p2d || !p2h) return null;
      return { p1d, p1h: addDays(p1hIn, 1), p2d, p2h };
    }
    return null; // auto
  }
  const fmtPctCap = d => { const n = Number(d); if (n <= -1) return '−100%+'; return `${(n * 100).toFixed(1)}%`; };
  const SEM = { verde: 'var(--ok,#16a34a)', amarillo: 'var(--warning,#d97706)', naranja: '#ea580c', rojo: 'var(--danger,#dc2626)', sin_meta: 'var(--muted,#64748b)' };
  const SEM_TXT = { verde: 'Al día', amarillo: 'Atención', naranja: 'Atrasado', rojo: 'Crítico', sin_meta: 'Sin meta' };

  let panel = { agente: null, alertas: [], cumplimiento: null };
  let comp = { clientes: [], periodos: null };
  let riskSet = new Set();

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
    await loadComp();
    renderCumpl();
    render();
  }

  // Comparativo ON-DEMAND (clientes en riesgo con el periodo propio de Mi panel).
  // Lo usan las TRES vistas para clasificar estado (riesgo/sano), no solo la de riesgo.
  async function loadComp() {
    comp = { clientes: [], periodos: null }; riskSet = new Set();
    if (!panel.agente) return;
    const ag = sel('agenteSel'); const per = computePeriodos();
    const q = new URLSearchParams();
    if (ag) q.set('agente_id', ag);
    if (per) { q.set('p1d', per.p1d); q.set('p1h', per.p1h); q.set('p2d', per.p2d); q.set('p2h', per.p2h); }
    try {
      const res = await KoguApi.apiFetch(`${BASE}/mi-panel/comparativo${q.toString() ? `?${q}` : ''}`);
      comp = res?.data || res;
      riskSet = new Set((comp.clientes || []).map(c => c.cliente_ref));
    } catch (_) { comp = { clientes: [], periodos: null }; riskSet = new Set(); }
  }

  const riskRefs = () => riskSet;

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

  function render() {
    const vista = sel('vistaFil');
    const titulos = { riesgo: 'Mis clientes en riesgo', sanos: 'Mis clientes sanos', cartera: 'Toda mi cartera', ventas: 'Ventas por mes' };
    document.getElementById('listaTitulo').textContent = titulos[vista] || titulos.riesgo;
    show('sevFil', vista === 'riesgo');
    show('periodoBox', vista !== 'ventas');   // el periodo clasifica riesgo en las 3 vistas de cartera
    if (vista === 'riesgo') renderRiesgo();
    else if (vista === 'ventas') { renderResumen(); renderVentas(); }
    else { renderResumen(); renderCartera(vista); }
  }

  // "Solo en riesgo": comparativo ON-DEMAND con el periodo propio de Mi panel.
  const riesgoCli = c => {
    if (esDinero()) {
      if (c.caida) return Math.max(0, Number(c.caida.venta_p1) - Number(c.caida.venta_p2));
      return (c.productos || []).reduce((s, p) => s + Math.max(0, Number(p.importe_p1) - Number(p.importe_p2)), 0);
    }
    if (c.caida) return Math.max(0, Number(c.caida.cant_p1) - Number(c.caida.cant_p2));
    return (c.productos || []).reduce((s, p) => s + Math.max(0, Number(p.cant_p1) - Number(p.cant_p2)), 0);
  };

  function renderRiesgo() {
    if (!comp || !comp.agente) { document.getElementById('carteraResumen').innerHTML = ''; document.getElementById('alertas').innerHTML = '<div class="empty">Sin agente.</div>'; return; }
    const sv = sel('sevFil');
    const clientes = (comp.clientes || []).filter(c => !sv || c.severidad === sv).slice().sort((a, b) => riesgoCli(b) - riesgoCli(a));

    // Resumen
    const totalRiesgo = clientes.reduce((s, c) => s + riesgoCli(c), 0);
    const nCrit = clientes.filter(c => c.severidad === 'critica').length;
    const nProd = clientes.reduce((s, c) => s + (c.productos || []).length, 0);
    const nDorm = clientes.filter(c => c.dormancia).length;
    document.getElementById('carteraResumen').innerHTML = `
      <div class="grid-4" style="gap:10px">
        ${miniCard(esDinero() ? 'Monto en riesgo' : 'Volumen en riesgo (kg)', fmtVal(totalRiesgo), 'dejaron de comprar (P1−P2)', 'var(--danger,#dc2626)')}
        ${miniCard('Clientes en caída', String(clientes.length), `${nCrit} críticos`)}
        ${miniCard('Productos en caída', String(nProd), 'cae el producto')}
        ${miniCard('Sin compra', String(nDorm), 'clientes dormidos')}
      </div>`;

    const p = comp.periodos;
    const banner = p ? `<div class="hint" style="margin:0 0 12px;color:var(--muted);font-size:12px">Comparativo: <b>P1 ${rangoP1(p)}</b> vs <b>P2 ${rangoP2(p)}</b> · periodo propio de Mi panel</div>` : '';
    if (!clientes.length) { document.getElementById('alertas').innerHTML = banner + '<div class="empty">Sin clientes en riesgo para el periodo. ¡Bien!</div>'; return; }

    const sevBg = { critica: 'var(--danger,#dc2626)', alerta: 'var(--warning,#d97706)', info: 'var(--muted,#64748b)' };
    const sevWord = { critica: 'Crítica', alerta: 'Alerta', info: 'Info' };
    document.getElementById('alertas').innerHTML = banner + clientes.map(c => {
      const color = sevBg[c.severidad] || sevBg.info;
      const varTxt = c.caida ? fmtPctCap(esDinero() ? c.caida.delta_importe : c.caida.delta_cantidad) : '';
      const prods = (c.productos || []).slice(0, 6).map(pr => {
        const v1 = esDinero() ? pr.importe_p1 : pr.cant_p1, v2 = esDinero() ? pr.importe_p2 : pr.cant_p2, dl = esDinero() ? pr.delta_importe : pr.delta_cantidad;
        return `<div style="display:flex;justify-content:space-between;gap:8px;font-size:12px;padding:3px 0">
          <span style="color:var(--muted)">${pr.cve_prod ? `<span class="chip-compact">${KoguUi.escapeHtml(pr.cve_prod)}</span> ` : ''}${KoguUi.escapeHtml(pr.desc_prod || '')}${pr.abandonado ? ' <span style="color:var(--danger,#dc2626);font-weight:600">·abandonado</span>' : ''}</span>
          <span>${fmtVal(v1)} → ${fmtVal(v2)} <b style="color:var(--danger,#dc2626)">${fmtPctCap(dl)}</b></span>
        </div>`;
      }).join('');
      return `<div style="border:1px solid var(--line);border-left:4px solid ${color};border-radius:12px;padding:14px;margin-bottom:10px">
        <div class="row" style="align-items:flex-start">
          <div style="flex:1">
            <div style="display:flex;gap:8px;align-items:center">
              <span style="display:inline-block;padding:2px 10px;border-radius:999px;font-size:11px;font-weight:600;color:#fff;background:${color}">${sevWord[c.severidad] || 'Alerta'}</span>
              <span style="font-weight:700">${KoguUi.escapeHtml(c.nombre || c.cliente_ref)}</span>
            </div>
            ${c.caida ? `<div style="font-size:12px;color:var(--muted);margin-top:3px">Caída general ${varTxt} · ${fmtVal(esDinero() ? c.caida.venta_p1 : c.caida.cant_p1)} → ${fmtVal(esDinero() ? c.caida.venta_p2 : c.caida.cant_p2)}</div>` : ''}
            ${c.dormancia ? `<div style="font-size:12px;color:var(--warning,#d97706);margin-top:3px">⏳ Sin compra hace ${c.dormancia.dias_sin_compra} días · última ${KoguUi.fmtDate(c.dormancia.ultima_compra).split(',')[0]}</div>` : ''}
            ${prods ? `<div style="margin-top:8px">${prods}</div>` : ''}
          </div>
          <div style="text-align:right;min-width:150px">
            <div style="font-size:11px;color:var(--muted);text-transform:uppercase">En riesgo</div>
            <div style="font-size:19px;font-weight:800;color:var(--danger,#dc2626)">${fmtVal(riesgoCli(c))}</div>
            <div style="display:flex;gap:6px;justify-content:flex-end;margin-top:8px">
              <button class="btn primary" data-ficha-ref="${KoguUi.escapeHtml(c.cliente_ref)}" style="font-size:12px">Detalle</button>
              <button class="btn" data-act-ref="${KoguUi.escapeHtml(c.cliente_ref)}" title="Generar actividad de seguimiento" style="font-size:12px">+ Actividad</button>
            </div>
          </div>
        </div>
      </div>`;
    }).join('');
    document.querySelectorAll('#alertas .btn[data-ficha-ref]').forEach(x => x.onclick = () =>
      openFicha({ cliente_ref: x.dataset.fichaRef, detalle: { periodos: comp.periodos } }));
    document.querySelectorAll('#alertas .btn[data-act-ref]').forEach(x => x.onclick = () => {
      const cli = (comp.clientes || []).find(k => k.cliente_ref === x.dataset.actRef);
      if (cli) openCrearActividad(cli);
    });
  }

  // ── Crear actividad de seguimiento (CRM) desde una tarjeta de riesgo ─────────
  const hoyMas = n => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  function closeActModal() { document.getElementById('rcCrearActModal')?.remove(); }
  function openCrearActividad(c) {
    const monto = riesgoCli(c);
    const nombre = c.nombre || c.cliente_ref;
    const prods = (c.productos || []).slice(0, 8).map(pr =>
      `<div style="font-size:12px;color:var(--muted)">${pr.cve_prod ? `<span class="chip-compact">${KoguUi.escapeHtml(pr.cve_prod)}</span> ` : ''}${KoguUi.escapeHtml(pr.desc_prod || '')}</div>`).join('');
    const html = `
      <div id="rcCrearActModal" style="position:fixed;inset:0;z-index:10000;background:rgba(15,23,42,.55);display:flex;justify-content:center;align-items:flex-start;overflow:auto;padding:32px 16px">
        <div style="background:var(--panel,#fff);border-radius:16px;max-width:560px;width:100%;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,.3)">
          <div class="row" style="align-items:flex-start;margin-bottom:8px">
            <div><div class="eyebrow">CRM · Nueva actividad</div><h2 style="margin:4px 0 0">${KoguUi.escapeHtml(nombre)}</h2>
              <div class="hint" style="color:var(--muted);font-size:12px">En riesgo: <b>${fmtVal(monto)}</b> · severidad ${c.severidad || '—'} · se congela el comparativo actual</div>
            </div>
            <button class="btn" id="rcActCancel">✕</button>
          </div>
          ${prods ? `<div style="margin:8px 0 4px">${prods}</div>` : ''}
          <div style="margin-top:10px"><div class="label-text">Título</div>
            <input class="input" id="rcActTitulo" value="Recuperar ${KoguUi.escapeHtml(nombre)}"/></div>
          <div style="margin-top:10px"><div class="label-text">Nota / plan de acción</div>
            <textarea class="input" id="rcActNota" rows="3" placeholder="¿Qué vas a hacer para recuperar a este cliente?"></textarea></div>
          <div style="margin-top:10px"><div class="label-text">Vigencia (fecha límite)</div>
            <input class="input" id="rcActFecha" type="date" value="${hoyMas(15)}" style="max-width:200px"/></div>
          <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:18px">
            <button class="btn" id="rcActCancel2">Cancelar</button>
            <button class="btn primary" id="rcActGuardar">Crear actividad</button>
          </div>
        </div>
      </div>`;
    closeActModal();
    document.body.insertAdjacentHTML('beforeend', html);
    const close = () => closeActModal();
    document.getElementById('rcActCancel').onclick = close;
    document.getElementById('rcActCancel2').onclick = close;
    document.getElementById('rcCrearActModal').onclick = e => { if (e.target.id === 'rcCrearActModal') close(); };
    document.getElementById('rcActGuardar').onclick = (e) => KoguUi.withLoading(e.target, async () => {
      const body = {
        cliente_ref: c.cliente_ref,
        cliente_nombre: c.nombre,
        origen: 'mi-panel',
        severidad: c.severidad || null,
        monto_riesgo: monto,
        metrica,
        titulo: document.getElementById('rcActTitulo').value.trim(),
        descripcion: document.getElementById('rcActNota').value.trim() || null,
        fecha_limite: document.getElementById('rcActFecha').value || null,
        snapshot: {
          capturado_at: new Date().toISOString(),
          metrica, severidad: c.severidad || null, monto_riesgo: monto,
          periodos: comp.periodos || null,
          caida: c.caida || null, dormancia: c.dormancia || null,
          productos: c.productos || [],
        },
      };
      const ag = sel('agenteSel'); if (ag) body.agente_id = ag;  // Dirección previsualizando otra cartera
      try {
        await KoguApi.apiFetch('/protected/crm/actividades', { method: 'POST', body: JSON.stringify(body) });
        KoguApi.toast('Actividad creada. Disponible en CRM → Actividades de seguimiento.', 'success');
        close();
      } catch (err) { KoguApi.toast(err.message, 'error'); }
    }, 'Creando…');
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
  document.getElementById('presetFil').onchange = async () => {
    document.getElementById('customPeriodos').style.display = sel('presetFil') === 'custom' ? 'flex' : 'none';
    if (sel('presetFil') !== 'custom') { await loadComp(); render(); }
  };
  document.getElementById('aplicarPeriodo').onclick = (e) => KoguUi.withLoading(e.target, async () => { await loadComp(); render(); }, 'Calculando…');
  document.getElementById('agenteSel').onchange = load;
  document.getElementById('anioFil').onchange = load;
  document.getElementById('exportBtn').onclick = (e) => KoguUi.withLoading(e.target, exportarAgente, 'Generando…');
  KoguShell.subscribeEmpresaActivaChange(async () => { await loadAgentesSel(); await load(); });
  await loadAgentesSel();
  await load();
});

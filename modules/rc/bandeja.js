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
        <button class="btn" id="reglasBtn" title="¿Cómo se calculan las alertas?">ℹ Reglas</button>
        <button class="btn" id="recalcBtn">↻ Recalcular</button>
      </div>
    </div>

    <div class="grid-2" style="gap:12px;margin-top:14px;align-items:end">
      <div>
        <div class="label-text">Periodo de comparación</div>
        <select class="select" id="presetFil">
          <option value="auto">Meses cerrados vs año pasado</option>
          <option value="mes">Mes vs mes anterior</option>
          <option value="custom">Personalizado</option>
        </select>
      </div>
      <div style="display:flex;gap:10px">
        <select class="select" id="estadoFil">
          <option value="pendiente">Pendientes</option>
          <option value="">Todas</option>
          <option value="atendida">Atendidas</option>
          <option value="descartada">Descartadas</option>
        </select>
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
  let alertas = [];        // materializadas (otras alertas: RC-001/002/003 empresa/agente)
  let comp = null;         // comparativo on-demand a nivel empresa { periodos, clientes }

  const money = v => KoguUi.money(Number(v || 0));
  const sel = id => document.getElementById(id)?.value ?? '';
  const show = (id, v) => { const el = document.getElementById(id); if (el) el.style.display = v ? '' : 'none'; };

  let metrica = localStorage.getItem('kogu:rc-metrica') || 'cantidad';
  const esDinero = () => metrica === 'dinero';
  const nf0 = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 });
  const fmtVal = v => esDinero() ? money(v) : `${nf0.format(Number(v || 0))} kg`;
  const measSubt = r => esDinero() ? Number(r.subt || 0) : Number(r.cantidad || 0);
  const metricaLbl = () => esDinero() ? 'MXN-eq' : 'kg (aprox)';
  // Tarjeta KPI compacta homologada con todas las pantallas del Radar.
  const miniCard = (lbl, val, hint = '', color = '') => `
    <div style="border:1px solid var(--line);border-radius:10px;padding:9px 12px">
      <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.03em">${KoguUi.escapeHtml(lbl)}</div>
      <div style="font-size:17px;font-weight:800;line-height:1.15;margin-top:1px;${color ? `color:${color}` : ''}">${KoguUi.escapeHtml(val)}</div>
      ${hint ? `<div style="font-size:10px;color:var(--muted)">${KoguUi.escapeHtml(hint)}</div>` : ''}
    </div>`;
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

  function fillAgenteFil() {
    const ags = [...new Set([
      ...alertas.map(a => a.agente_nombre),
      ...(comp?.clientes || []).map(c => c.agente_nombre),
    ].filter(Boolean))].sort();
    const cur = sel('agenteFil');
    document.getElementById('agenteFil').innerHTML =
      '<option value="">Todos los agentes</option>' + ags.map(a => `<option value="${KoguUi.escapeHtml(a)}">${KoguUi.escapeHtml(a)}</option>`).join('');
    document.getElementById('agenteFil').value = cur;
  }
  // Rango legible de una ventana con extremos INCLUSIVOS (act_/yoy_/prev_).
  const rangoIncl = (d, h) => {
    if (!d || !h) return '';
    const a = new Date(d), b = new Date(h);
    const mA = `${MESES[a.getUTCMonth() + 1]} ${String(a.getUTCFullYear()).slice(2)}`;
    const mB = `${MESES[b.getUTCMonth() + 1]} ${String(b.getUTCFullYear()).slice(2)}`;
    return mA === mB ? mA : `${mA}–${mB}`;
  };
  function periodosBanner() {
    const p = comp?.periodos;
    if (!p) return '';
    const cr = comp?.criterio || {};
    // Con las tres ventanas nuevas el encabezado dice contra QUÉ se compara y
    // desde qué piso; antes decía "P1 vs P2" y había que adivinar el criterio.
    const cab = p.act_d
      ? `Periodo <b>${rangoIncl(p.act_d, p.act_h)}</b> contra <b>${rangoIncl(p.yoy_d, p.yoy_h)}</b> (mismo periodo del año pasado)`
      : `Comparativo: <b>P1 ${rangoP1(p)}</b> vs <b>P2 ${rangoP2(p)}</b>`;
    const piso = cr.materialidad_mxn ? ` · sólo caídas de <b>${money(cr.materialidad_mxn)}</b> o más` : '';
    const cierre = p.mes_en_curso_excluido ? ' · el mes en curso queda fuera (sólo meses cerrados)' : '';
    const nuevos = p.act_d ? ' · los clientes que no existían hace un año se comparan contra el periodo anterior' : '';
    return `<div class="hint" style="margin:0 0 12px;color:var(--muted);font-size:12px">
      ${cab}${piso}${cierre}${nuevos} · prioridad por ${esDinero() ? 'monto' : 'volumen (kg)'} que dejó de comprar · cálculo on-demand (no depende de Recalcular)
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
    await loadComp();
    fillAgenteFil();
    renderAlertas();
  }

  // Comparativo on-demand a nivel empresa: clientes en riesgo según el periodo
  // seleccionado, SIN depender del Recalcular global (que sólo materializa KPIs
  // y las "otras alertas" de empresa/agente).
  async function loadComp() {
    const periodos = computePeriodos();
    const qs = periodos
      ? `?p1d=${periodos.p1d}&p1h=${periodos.p1h}&p2d=${periodos.p2d}&p2h=${periodos.p2h}`
      : '';
    try {
      const res = await KoguApi.apiFetch(`${BASE}/comparativo${qs}`);
      comp = res?.data || res;
    } catch (err) {
      comp = { periodos: null, clientes: [] };
      KoguApi.toast(err.message, 'error');
    }
  }

  // Riesgo de un cliente. El backend lo manda ya resuelto en `riesgo_mxn` /
  // `riesgo_kg`, con UNA definición para las tres pantallas (ver riesgoDe() en
  // rc-engine.service.js). Aquí sólo se elige la métrica activa.
  //
  // Antes cada pantalla lo calculaba a su manera y no coincidían: en kg —la
  // métrica por defecto— esta función le ponía CERO a todo cliente dormido
  // porque no existía el dato, mientras el Tablero le ponía su venta del año.
  // El respaldo de abajo sólo actúa contra un backend viejo.
  function riesgoCli(c) {
    const listo = esDinero() ? c.riesgo_mxn : c.riesgo_kg;
    if (listo != null) return Math.max(0, Number(listo));
    if (!c.caida && c.dormancia) return esDinero() ? Number(c.dormancia.venta_ventana || 0) : 0;
    const previo = esDinero() ? c.caida_mxn : c.caida_kg;
    if (previo != null) return Math.max(0, Number(previo));
    if (c.caida) {
      return esDinero()
        ? Math.max(0, Number(c.caida.venta_p1) - Number(c.caida.venta_p2))
        : Math.max(0, Number(c.caida.cant_p1) - Number(c.caida.cant_p2));
    }
    return (c.productos || []).reduce((s, p) => s + Math.max(0,
      esDinero() ? Number(p.importe_p1) - Number(p.importe_p2) : Number(p.cant_p1) - Number(p.cant_p2)), 0);
  }
  const BASE_TXT = { yoy: 'vs año pasado', secuencial: 'vs periodo anterior' };

  // Estado del triaje. `null` = el cliente no tiene alerta materializada
  // todavía (falta Recalcular), así que cuenta como pendiente: es trabajo por
  // hacer, no trabajo hecho.
  const ESTADO = {
    descartada: { txt: 'Descartada', bg: 'var(--muted,#64748b)' },
    resuelta:   { txt: 'Atendida',   bg: 'var(--ok,#059669)' },
    vista:      { txt: 'Vista',      bg: 'var(--brand,#2563eb)' },
  };
  const esPendiente = c => !c.estado || c.estado === 'abierta';
  function pasaEstado(c, filtro) {
    if (!filtro) return true;
    if (filtro === 'pendiente')  return esPendiente(c);
    if (filtro === 'atendida')   return c.estado === 'resuelta';
    if (filtro === 'descartada') return c.estado === 'descartada';
    return true;
  }

  function renderAlertas() {
    const sv = sel('sevFil'), ag = sel('agenteFil'), es = sel('estadoFil');

    // Clientes en riesgo: comparativo on-demand (independiente del Recalcular).
    const todos = (comp?.clientes || [])
      .filter(c => (!sv || c.severidad === sv) && (!ag || (c.agente_nombre || '') === ag));
    const clientes = todos
      .filter(c => pasaEstado(c, es))
      .map(c => ({ ...c, _riesgo: riesgoCli(c) }))
      .sort((a, b) => b._riesgo - a._riesgo);
    const nTriados = todos.filter(c => !esPendiente(c)).length;

    // Otras alertas (empresa / agentes): materializadas, NO de cliente.
    const otras = alertas.filter(a =>
      !(a.cliente_ref && (a.entidad_tipo === 'cliente' || a.entidad_tipo === 'cliente_producto'))
      && (!sv || a.severidad === sv) && (!ag || a.agente_nombre === ag) && a.status !== 'descartada');

    const totalRiesgo = clientes.reduce((s, c) => s + c._riesgo, 0);
    const nCriticas = clientes.filter(c => c.severidad === 'critica').length;
    const nCaida = clientes.filter(c => c.caida).length;
    const nDormidos = clientes.filter(c => c.dormancia).length;
    document.getElementById('alertasResumen').innerHTML = `
      <div class="grid-4" style="gap:10px">
        ${miniCard(esDinero() ? 'Monto en riesgo' : 'Volumen en riesgo (kg)', fmtVal(totalRiesgo), 'lo que dejaron de comprar', 'var(--danger,#dc2626)')}
        ${miniCard('Clientes a atender', String(clientes.length), `${nCriticas} críticos · atiende estos primero`)}
        ${miniCard('En caída', String(nCaida), 'compran menos que su base')}
        ${miniCard('Sin comprar', String(nDormidos), 'dejaron de facturar')}
      </div>
      ${nTriados ? `<div class="hint" style="margin-top:8px;color:var(--muted);font-size:12px">${nTriados} cliente(s) ya triado(s) — se conservan al recalcular. Cámbialo en el filtro de estado para verlos.</div>` : ''}`;

    if (!clientes.length && !otras.length) {
      document.getElementById('alertas').innerHTML = periodosBanner() + '<div class="empty">Sin alertas para el filtro</div>';
      return;
    }

    const sevBg = { critica: 'var(--danger,#dc2626)', alerta: 'var(--warning,#d97706)', info: 'var(--muted,#64748b)' };
    const sevWordC = { critica: 'Crítica', alerta: 'Alerta', info: 'Info' };

    const estadoBadge = c => {
      const m = ESTADO[c.estado];
      if (!m) return '';
      return `<span style="display:inline-block;padding:2px 9px;border-radius:999px;font-size:11px;font-weight:600;color:#fff;background:${m.bg}">${m.txt}</span>`;
    };
    // El triaje se aplica a TODAS las alertas del cliente a la vez: la tarjeta
    // es el cliente, no la regla. Si no hay alerta materializada todavía, no
    // hay a qué fila apuntar y se dice, en vez de dejar botones muertos.
    const triajeBotones = c => {
      const ids = (c.alertas || []).map(a => a.alerta_id);
      if (!ids.length) {
        return `<span style="font-size:11px;color:var(--muted);align-self:center" title="Las alertas se materializan al recalcular">Recalcula para triar</span>`;
      }
      const refs = KoguUi.escapeHtml(ids.join(','));
      if (esPendiente(c)) {
        return `<button class="btn" data-triaje="resuelta" data-ids="${refs}" style="font-size:12px">✓ Atendida</button>
                <button class="btn" data-triaje="descartada" data-ids="${refs}" style="font-size:12px">Descartar</button>`;
      }
      return `<button class="btn" data-triaje="abierta" data-ids="${refs}" style="font-size:12px">↺ Reabrir</button>`;
    };

    const cardCliente = c => {
      const bg = sevBg[c.severidad] || sevBg.info;
      const varTxt = c.caida ? fmtPctCap(esDinero() ? c.caida.delta_importe : c.caida.delta_cantidad) : '';
      // Contra qué se comparó: un −40% "vs año pasado" y uno "vs periodo
      // anterior" no se leen igual, y antes la tarjeta no lo decía.
      const baseTxt = c.base_comparacion ? `<span style="color:var(--muted)">${BASE_TXT[c.base_comparacion] || ''}</span>` : '';
      // El backend ya manda los productos ordenados por caída; el sort local
      // sólo se aplica al respaldo (respuesta vieja sin caida_mxn).
      const prods = (c.productos || []).slice().sort((a, b) =>
        (a.caida_mxn != null && b.caida_mxn != null)
          ? (esDinero() ? b.caida_mxn - a.caida_mxn : b.caida_kg - a.caida_kg)
          : (esDinero() ? (b.importe_p1 - b.importe_p2) - (a.importe_p1 - a.importe_p2) : (b.cant_p1 - b.cant_p2) - (a.cant_p1 - a.cant_p2)));
      const top = prods.slice(0, 6).map(p => {
        const v1 = esDinero() ? p.importe_p1 : p.cant_p1;
        const v2 = esDinero() ? p.importe_p2 : p.cant_p2;
        const dl = esDinero() ? p.delta_importe : p.delta_cantidad;
        return `<div style="display:flex;justify-content:space-between;gap:8px;font-size:12px;padding:3px 0">
          <span style="color:var(--muted)">${p.cve_prod ? `<span class="chip-compact">${KoguUi.escapeHtml(p.cve_prod)}</span> ` : ''}${KoguUi.escapeHtml(p.desc_prod || '')}${p.abandonado ? ' <span style="color:var(--danger,#dc2626);font-weight:600">·abandonado</span>' : ''}</span>
          <span>${fmtVal(v1)} → ${fmtVal(v2)} <b style="color:var(--danger,#dc2626)">${fmtPctCap(dl)}</b></span>
        </div>`;
      }).join('');
      const masTxt = prods.length > 6 ? `<div style="font-size:11px;color:var(--muted);margin-top:4px">+${prods.length - 6} producto(s) más — ver Detalle</div>` : '';
      return `<div style="border:1px solid var(--line);border-left:4px solid ${bg};border-radius:12px;padding:14px;margin-bottom:10px">
        <div class="row" style="align-items:flex-start">
          <div style="flex:1">
            <div style="display:flex;gap:8px;align-items:center">
              <span style="display:inline-block;padding:2px 10px;border-radius:999px;font-size:11px;font-weight:600;color:#fff;background:${bg}">${sevWordC[c.severidad] || 'Info'}</span>
              <span style="font-weight:700">${KoguUi.escapeHtml(c.nombre || c.cliente_ref)}</span>
              <span style="font-size:12px;color:var(--muted)">· ${c.agente_nombre ? KoguUi.escapeHtml(c.agente_nombre) : 'sin agente'}</span>
              ${estadoBadge(c)}
            </div>
            ${c.caida ? `<div style="font-size:12px;color:var(--muted);margin-top:3px">Caída ${varTxt} ${baseTxt} · ${fmtVal(esDinero() ? c.caida.venta_p1 : c.caida.cant_p1)} → ${fmtVal(esDinero() ? c.caida.venta_p2 : c.caida.cant_p2)}</div>` : ''}
            ${c.dormancia ? `<div style="font-size:12px;color:var(--warning,#d97706);margin-top:3px">⏳ Sin compra hace ${c.dormancia.dias_sin_compra} días · última ${KoguUi.fmtDate(c.dormancia.ultima_compra).split(',')[0]}${c.dormancia.venta_ventana ? ` · venía comprando ${money(c.dormancia.venta_ventana)}` : ''}</div>` : ''}
            ${top ? `<div style="margin-top:8px">${top}${masTxt}</div>` : ''}
          </div>
          <div style="text-align:right;min-width:150px">
            <div style="font-size:11px;color:var(--muted);text-transform:uppercase">En riesgo</div>
            <div style="font-size:19px;font-weight:800;color:var(--danger,#dc2626)">${fmtVal(c._riesgo)}</div>
            <div style="display:flex;gap:6px;justify-content:flex-end;margin-top:8px;flex-wrap:wrap">
              ${triajeBotones(c)}
              <button class="btn primary" data-ficha-ref="${KoguUi.escapeHtml(c.cliente_ref)}" style="font-size:12px">Detalle</button>
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
      periodosBanner() + (clientes.map(cardCliente).join('') || '<div class="empty">Sin clientes en caída para el filtro</div>') + otrasHtml;

    document.querySelectorAll('#alertas .btn[data-ficha-ref]').forEach(x => x.onclick = () => openFicha(x.dataset.fichaRef));
    document.querySelectorAll('#alertas .btn[data-triaje]').forEach(x => x.onclick = async () => {
      const ids = x.dataset.ids.split(',').filter(Boolean);
      const nuevo = x.dataset.triaje;
      await KoguUi.withLoading(x, async () => {
        try {
          for (const id of ids) {
            await KoguApi.apiFetch(`${BASE}/alertas/${id}/status`, { method: 'PUT', body: JSON.stringify({ status: nuevo }) });
          }
          // Se actualiza en memoria en vez de recargar todo: recargar volvería
          // a pedir el comparativo completo por un clic.
          const cli = (comp?.clientes || []).find(z => (z.alertas || []).some(a => ids.includes(a.alerta_id)));
          if (cli) { cli.alertas.forEach(a => { if (ids.includes(a.alerta_id)) a.status = nuevo; }); cli.estado = nuevo; }
          KoguApi.toast(nuevo === 'abierta' ? 'Cliente reabierto' : 'Listo — se conserva al recalcular', 'success');
          renderAlertas();
        } catch (err) { KoguApi.toast(err.message, 'error'); }
      }, '...');
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
  async function openFicha(clienteRef) {
    const p = comp?.periodos;
    const qs = p ? `?p1d=${p.p1d}&p1h=${p.p1h}&p2d=${p.p2d}&p2h=${p.p2h}` : '';
    try {
      const res = await KoguApi.apiFetch(`${BASE}/clientes/${encodeURIComponent(clienteRef)}/comparativo${qs}`);
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
            <b>Bases del cálculo.</b> La métrica primaria es <b>cantidad (kg)</b>: el importe en pesos se distorsiona con el tipo de cambio (~70% de la venta es USD), así que las caídas se miden en volumen. La venta se atribuye a un agente por el <b>cliente</b> (cat_clientes → agente vigente), nunca por la clave de agente del ERP. El comparativo usa por defecto los <b>últimos 2 meses cerrados contra los mismos meses del año pasado</b>: el mes en curso <b>no entra</b> —comparar 43 días contra 61 hacía "caer" ~30% a todos por pura aritmética— y el año contra año separa la estacionalidad de la caída real. Las metas se comparan contra el <b>presupuesto anual</b> del agente.
          </div>
          ${regla('RC-001', 'Cumplimiento vs meta', 'Agentes que van por debajo del ritmo necesario para llegar a su meta anual.', 'Venta acumulada del año ÷ meta anual = % avance. El <i>ritmo esperado</i> = meta × (meses transcurridos ÷ 12). Se compara el avance real contra ese ritmo. Base kg si el agente tiene meta de cantidad; si no, en importe.', 'Alerta si el ritmo < 90% del esperado · Crítica si < 70%.')}
          ${regla('RC-002', 'Concentración de cliente', 'Agentes que dependen demasiado de un solo cliente (riesgo si ese cliente se va).', 'Para cada agente, se calcula qué % de su venta (ventana de 12 meses) representa su cliente más grande.', 'Alerta si un cliente concentra ≥ 30% · Crítica si ≥ 50%. (En importe.)')}
          ${regla('RC-003', 'Caída de volumen (mes vs mes)', 'Caída del volumen vendido del último mes contra el mes anterior, a nivel empresa y por agente.', 'Compara los kg del último mes con los del mes previo: (mes actual − mes anterior) ÷ mes anterior.', 'Alerta si cae ≥ 20% · Crítica si cae ≥ 40%. (En kg.)')}
          ${regla('RC-004', 'Cliente sin compra (dormido)', 'Clientes que venían comprando y dejaron de hacerlo.', 'Días entre la última compra del cliente y la última venta de la empresa. Sólo entran clientes cuya última compra cae dentro de una <b>ventana de 12 meses</b> —quien se fue hace dos años ya no es un pendiente de seguimiento— y que dentro de esa ventana facturaron al menos la materialidad.', 'Alerta a partir de 60 días sin comprar. Crítica: los 10 de mayor venta en riesgo, no los de más días.')}
          ${regla('RC-005', 'Cliente comprando menos', 'Clientes que siguen comprando pero por debajo de su base, con los productos que explican la caída dentro de la misma incidencia.', 'Se compara el periodo actual (<b>meses cerrados</b>) contra el <b>mismo periodo del año pasado</b>. Si el cliente no existía hace un año, se cae al periodo inmediato anterior y la tarjeta lo dice. Dentro de cada cliente se listan los productos que más aportan a la caída.', 'Entra si la caída llega a la <b>materialidad</b> (por defecto $75,000) y el descenso es ≥ 25% en kg o en importe.')}
          ${regla('RC-006', 'Producto que el cliente compra menos', 'Ya no emite alertas propias: sus productos viajan como evidencia dentro de la incidencia del cliente (RC-005).', 'Antes RC-005 y RC-006 contaban el mismo hecho con distinto zoom y el dinero se sumaba dos veces: 340 alertas para 167 clientes, con un solo cliente generando 45 renglones.', 'Sin renglones sueltos. El detalle por producto está en la tarjeta del cliente y en su ficha.')}
          <div style="font-size:12px;color:var(--muted);margin-top:8px">
            <b>Por qué cambió.</b> Con umbrales fijos y sin piso de materialidad, una caída de $8,000 pesaba igual que una de $4M y el 80% salía "crítica" — cuando todo es crítico, la severidad no ordena nada. Ahora hay dos filtros y un orden: <b>materialidad</b> (¿vale el tiempo de un gerente?), <b>caída relativa</b> (¿de verdad bajó?) y <b>severidad por ranking</b> (las mayores caídas son las críticas). El <b>"monto/volumen en riesgo"</b> es lo que el cliente dejó de comprar contra su base. Todo es configurable en el catálogo de reglas.
          </div>
        </div>
      </div>`;
    document.getElementById('rcReglasModal')?.remove();
    document.body.insertAdjacentHTML('beforeend', html);
    const modal = document.getElementById('rcReglasModal');
    document.getElementById('rcReglasClose').onclick = () => modal.remove();
    modal.onclick = e => { if (e.target === modal) modal.remove(); };
  }

  // ── Eventos ───────────────────────────────────────────────────────────────
  // Recarga el comparativo on-demand al cambiar el periodo (sin Recalcular global).
  async function reloadComp(btn) {
    const run = async () => { await loadComp(); fillAgenteFil(); renderAlertas(); };
    if (btn) await KoguUi.withLoading(btn, run, 'Calculando...'); else await run();
  }

  document.getElementById('reglasBtn').onclick = openReglas;
  document.getElementById('presetFil').onchange = async () => {
    const custom = sel('presetFil') === 'custom';
    show('customPeriodos', custom);
    if (!custom) await reloadComp();   // custom espera a que se completen las fechas
  };
  ['p1d', 'p1h', 'p2d', 'p2h'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.onchange = () => { if (computePeriodos()) reloadComp(); };
  });
  document.getElementById('metricaFil').value = metrica;
  document.getElementById('metricaFil').onchange = (e) => {
    metrica = e.target.value;
    localStorage.setItem('kogu:rc-metrica', metrica);
    renderAlertas();
  };
  document.getElementById('sevFil').onchange = renderAlertas;
  document.getElementById('estadoFil').onchange = renderAlertas;
  document.getElementById('agenteFil').onchange = renderAlertas;
  // Resumen del Recalcular. Ya no basta con "N alertas": ahora la pregunta
  // que importa es si el triaje humano sobrevivió, así que el aviso lo dice.
  function msgRecalculo(d) {
    const a = d?.alertas;
    const base = `Recalculado: ${d?.kpi_filas ?? 0} filas KPI, ${d?.total_alertas ?? 0} alertas`;
    if (!a) return base;
    const partes = [];
    if (a.nuevas)          partes.push(`${a.nuevas} nueva(s)`);
    if (a.actualizadas)    partes.push(`${a.actualizadas} actualizada(s)`);
    if (a.cerradas)        partes.push(`${a.cerradas} cerrada(s)`);
    if (a.triaje_preservado) partes.push(`${a.triaje_preservado} con tu triaje intacto`);
    return partes.length ? `${base} · ${partes.join(' · ')}` : base;
  }

  document.getElementById('recalcBtn').onclick = async (e) => {
    await KoguUi.withLoading(e.target, async () => {
      try {
        // Recalcular NO manda el periodo del selector. El selector cambia lo
        // que se MIRA —el comparativo, que se calcula al vuelo—; Recalcular
        // graba la medición canónica de meses cerrados. Mandarle el rango
        // reabría todas las alertas ya triadas, porque el periodo entra en la
        // condición que preserva el estado del triaje.
        const res = await KoguApi.apiFetch(`${BASE}/engine/recalcular`, { method: 'POST', body: '{}' });
        const d = res?.data || res;
        KoguApi.toast(msgRecalculo(d), 'success');
        await loadAll();
      } catch (err) { KoguApi.toast(err.message, 'error'); }
    }, 'Recalculando...');
  };

  KoguShell.subscribeEmpresaActivaChange(loadAll);
  await loadAll();
});

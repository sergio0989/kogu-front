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
        <div class="label-text">Periodo de comparación</div>
        <select class="select" id="presetFil">
          <option value="auto">Meses cerrados vs mismo periodo del año pasado</option>
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

    <!-- KPIs enriquecidos -->
    <div id="kpiCards" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(176px,1fr));gap:10px;margin-top:16px"></div>

    <!-- Tendencia mensual + Mezcla -->
    <div class="split" style="margin-top:16px">
      <div style="border:1px solid var(--line);border-radius:12px;padding:16px;background:var(--panel,#fff)">
        <div class="eyebrow">Tendencia mensual</div>
        <h3 style="margin:4px 0 12px">Venta por mes</h3>
        <div id="trend"></div>
      </div>
      <div style="border:1px solid var(--line);border-radius:12px;padding:16px;background:var(--panel,#fff)">
        <div class="eyebrow">Mezcla</div>
        <h3 style="margin:4px 0 12px">Mercado y moneda</h3>
        <div id="mezcla"></div>
      </div>
    </div>
  </div>

  <!-- ── Presupuesto anual (PP) vs real ── -->
  <div class="card" id="ppCard"></div>

  <!-- ── Cumplimiento de agentes (resumen) ── -->
  <div class="card" id="cumplCard"></div>

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
  let ppTablaOpen = false;       // sección "Avance por categoría" colapsable (arranca comprimida)
  let cumpl = null;              // ranking de cumplimiento de agentes { rows, elapsed_pct }

  // ── Helpers ───────────────────────────────────────────────────────────────
  const money = v => KoguUi.money(Number(v || 0));
  const sel = id => document.getElementById(id)?.value ?? '';
  const show = (id, v) => { const el = document.getElementById(id); if (el) el.style.display = v ? '' : 'none'; };

  let metrica = localStorage.getItem('kogu:rc-metrica') || 'cantidad';
  const esDinero = () => metrica === 'dinero';
  const nf0 = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 });
  const fmtVal = v => esDinero() ? money(v) : `${nf0.format(Number(v || 0))} kg`;
  // Formato compacto para cifras grandes de la proyección: 395,875,579.71 → "$395.875 M".
  // Trunca a 3 decimales de millón (no redondea) para casar con la lectura ejecutiva.
  const moneyC = v => {
    const n = Number(v || 0), abs = Math.abs(n);
    if (abs >= 1e6) {
      const m = Math.trunc(n / 1e3) / 1e3;
      return `$${m.toLocaleString('es-MX', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} M`;
    }
    return money(n);
  };
  // Compacto solo para dinero; en kg se conserva el formato normal.
  const fmtValC = v => esDinero() ? moneyC(v) : `${nf0.format(Number(v || 0))} kg`;
  const measKpi = k => esDinero() ? Number(k.subtotal_mxn || 0) : Number(k.cantidad || 0);
  const metricaLbl = () => esDinero() ? 'MXN-eq' : 'kg (aprox)';
  // Tarjeta KPI compacta homologada con todas las pantallas del Radar.
  const miniCard = (lbl, val, hint = '', color = '') => `
    <div style="border:1px solid var(--line);border-radius:10px;padding:9px 12px">
      <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.03em">${KoguUi.escapeHtml(lbl)}</div>
      <div style="font-size:17px;font-weight:800;line-height:1.15;margin-top:1px;${color ? `color:${color}` : ''}">${KoguUi.escapeHtml(val)}</div>
      ${hint ? `<div style="font-size:10px;color:var(--muted)">${KoguUi.escapeHtml(hint)}</div>` : ''}
    </div>`;
  // Tarjeta KPI con acento de color (resumen de ventas, menos gris).
  const statCard = (lbl, val, hint = '', accent = 'var(--brand,#2563eb)') => `
    <div style="border:1px solid var(--line);border-left:4px solid ${accent};border-radius:12px;padding:12px 14px;background:var(--panel,#fff)">
      <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em">${KoguUi.escapeHtml(lbl)}</div>
      <div style="font-size:21px;font-weight:800;line-height:1.1;margin-top:3px;color:${accent}">${KoguUi.escapeHtml(val)}</div>
      ${hint ? `<div style="font-size:11px;color:var(--muted);margin-top:1px">${KoguUi.escapeHtml(hint)}</div>` : ''}
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
  // Semilla: los últimos 3 años, porque hay que pintar algo antes de la primera
  // respuesta del backend. En cuanto llega el PP se reconstruye con los años
  // que el backend reporta — unión de PP capturado + años con venta — así que
  // deja de ser una ventana fija de 3 y no se pierden ejercicios más viejos.
  const anioFil = document.getElementById('anioFil');
  anioFil.innerHTML = [anioActual, anioActual - 1, anioActual - 2].map(a => `<option value="${a}">${a}</option>`).join('');
  anioFil.value = String(anioActual);

  function renderAniosPp() {
    if (!pp || !Array.isArray(pp.anios) || !pp.anios.length) return;
    const actual = Number(anioFil.value) || anioActual;
    const conPp = new Set(pp.anios_pp || []);
    // El año seleccionado se conserva aunque el backend no lo liste (p. ej. un
    // ejercicio sin una sola venta cargada): cambiárselo al usuario por debajo
    // sería peor que mostrarlo vacío.
    const lista = pp.anios.includes(actual) ? pp.anios : [actual, ...pp.anios];
    anioFil.innerHTML = lista.map(a =>
      `<option value="${a}"${a === actual ? ' selected' : ''}>${a}${conPp.size && !conPp.has(a) ? ' · sin PP' : ''}</option>`).join('');
    anioFil.value = String(actual);
  }
  document.getElementById('metricaFil').value = metrica;

  // ── Carga ─────────────────────────────────────────────────────────────────
  async function loadAll() {
    const anio = sel('anioFil') || anioActual;
    const [kRes, aRes, cRes] = await Promise.all([
      KoguApi.apiFetch(`${BASE}/kpis?anio=${anio}`),
      KoguApi.apiFetch(`${BASE}/alertas`),
      KoguApi.apiFetch(`${BASE}/cumplimiento?anio=${anio}`).catch(() => null),
    ]);
    kpis = KoguApi.unwrapRows(kRes);
    alertas = KoguApi.unwrapRows(aRes);
    cumpl = cRes ? (cRes.data || cRes) : null;
    const calc = (kRes?.data?.calculado_at) || null;
    document.getElementById('metaInfo').textContent = calc
      ? `Última actualización: ${KoguUi.fmtDate(calc)} · ${kpis.length} filas KPI`
      : 'Sin cálculo aún — presiona Recalcular.';
    renderKpis();
    renderTrend();
    renderMezcla();
    renderRiesgoResumen();
    renderCumpl();
    await loadPp();
  }

  // ── Cumplimiento de agentes (resumen ejecutivo, enlace a la pantalla) ────────
  const SEM = {
    verde:   'var(--ok,#16a34a)', amarillo: 'var(--warning,#d97706)',
    naranja: '#ea580c', rojo: 'var(--danger,#dc2626)', sin_meta: 'var(--muted,#64748b)',
  };
  const SEM_RANK_C = { rojo: 0, naranja: 1, amarillo: 2, verde: 3, sin_meta: 4 };
  function renderCumpl() {
    const el = document.getElementById('cumplCard');
    if (!el) return;
    const rows = (cumpl?.rows || []).filter(r => r.tiene_meta);
    const head = `
      <div class="row" style="align-items:flex-start">
        <div><div class="eyebrow">Radar · Dirección</div><h2>Cumplimiento de agentes</h2></div>
        <a class="btn primary" href="/modules/rc/cumplimiento.html">Abrir Cumplimiento →</a>
      </div>`;
    if (!rows.length) {
      el.innerHTML = head + '<div class="empty" style="margin-top:12px">Sin agentes con meta cargada para el año.</div>';
      return;
    }
    const alDia = rows.filter(r => r.semaforo === 'verde').length;
    const atrasados = rows.filter(r => r.semaforo === 'rojo' || r.semaforo === 'naranja').length;
    const resumen = `
      <div class="grid-4" style="gap:10px;margin-top:12px">
        ${miniCard('Agentes con meta', String(rows.length), `de ${cumpl?.rows?.length || rows.length} activos`)}
        ${miniCard('Al día', String(alDia), 'cumpliendo ritmo', 'var(--ok,#16a34a)')}
        ${miniCard('Requieren atención', String(atrasados), 'por debajo del ritmo', 'var(--danger,#dc2626)')}
        ${miniCard('Ritmo del año', pct0(cumpl?.elapsed_pct), 'transcurrido')}
      </div>`;
    const fmtMeta = r => r.base === 'kg' ? `${nf0.format(Number(r.actual || 0))}/${nf0.format(Number(r.meta || 0))} kg` : `${money(r.actual)} / ${money(r.meta)}`;
    const item = r => {
      const col = SEM[r.semaforo] || SEM.sin_meta;
      return `<div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--line)">
          <span style="width:8px;height:8px;border-radius:50%;background:${col};flex:none"></span>
          <div style="flex:1;min-width:0">
            <div style="font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${r.agente_id ? `<a href="/modules/rc/mi-panel.html?agente_id=${encodeURIComponent(r.agente_id)}" title="Ver el panel de este agente" style="color:var(--brand,#2563eb);text-decoration:none">${KoguUi.escapeHtml(r.agente_nombre || r.cve_agente)}</a>` : KoguUi.escapeHtml(r.agente_nombre || r.cve_agente)}</div>
            <div style="font-size:11px;color:var(--muted)">${fmtMeta(r)}</div>
          </div>
          <div style="font-weight:800;color:${col}">${pct0(r.avance)}</div>
        </div>`;
    };
    // Partimos el ranking por la mitad para que Top y "Requieren atención" no
    // se traslapen cuando hay pocos agentes.
    const ranked = rows.slice().sort((a, b) => (b.ritmo ?? -1) - (a.ritmo ?? -1));
    const nTop = Math.min(4, Math.ceil(ranked.length / 2));
    const top = ranked.slice(0, nTop);
    const bottom = ranked.slice(nTop).slice(-4).reverse();   // peores primero, sin repetir
    const cols = `
      <div class="split" style="margin-top:14px">
        <div><div class="eyebrow" style="margin-bottom:6px">Top cumplimiento</div>${top.map(item).join('')}</div>
        <div><div class="eyebrow" style="margin-bottom:6px">Requieren atención</div>${bottom.map(item).join('')}</div>
      </div>`;
    el.innerHTML = head + resumen + cols;
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
    renderAniosPp();
    renderPp();
    renderTrend();   // la tendencia necesita el PP para dibujar la meta mensual
  }

  const pct0 = v => (v == null ? '—' : `${(Number(v) * 100).toFixed(0)}%`);
  const ppVal = o => esDinero() ? Number(o.ventas_pp || 0) : Number(o.kg_pp || 0);
  const realVal = o => esDinero() ? Number(o.ventas_real || 0) : Number(o.kg_real || 0);
  const avVal = o => { const p = ppVal(o); return p ? realVal(o) / p : null; };
  // Real YA atribuido a sublíneas (totales.*_real_mapeado). El backend lo
  // devuelve aparte del real total: la diferencia es lo que sigue sin ClavePP.
  const realMapVal = o => esDinero() ? Number(o.ventas_real_mapeado || 0) : Number(o.kg_real_mapeado || 0);
  // Total CRUDO del ERP del año (totales.*_control): no se deriva de las
  // categorías, así que sirve para cuadrar de verdad contra erp_ventas.
  const ctrlVal = o => esDinero() ? Number(o.ventas_control || 0) : Number(o.kg_control || 0);
  // Semáforo: avance real contra el ritmo esperado del año.
  function semColor(av, ritmo) {
    if (av == null || !ritmo) return 'var(--muted,#64748b)';
    const r = av / ritmo;
    return r >= 0.95 ? 'var(--success,#16a34a)' : r >= 0.8 ? 'var(--warning,#d97706)' : 'var(--danger,#dc2626)';
  }

  // ── Guardas contra un PP simbólico ────────────────────────────────────────
  // Visto en 2026: "Food Service" con PP de $0.50 y real de $839,813.60 daba
  // un avance de 167,962,720% pintado en VERDE, como si fuera un logro. No lo
  // es: es un PP mal capturado. Dos guardas, ninguna toca los totales:
  //   · PP < 1 (peso o kg) no es un presupuesto, es ruido → avance en guion.
  //   · avance > 500% es implausible → se rotula el tope y sale del semáforo
  //     (azul de aviso), para que nadie lo lea como cumplimiento.
  const PP_MINIMO = 1;
  const AV_TOPE = 5;
  const ppSimbolico = o => { const p = ppVal(o); return p > 0 && p < PP_MINIMO; };
  const fmtAv = o => {
    if (ppSimbolico(o)) return '—';
    const a = avVal(o);
    return a == null ? '—' : (a > AV_TOPE ? `>${AV_TOPE * 100}%` : pct0(a));
  };
  const colAv = (o, ritmo) => {
    const a = avVal(o);
    if (ppSimbolico(o) || (a != null && a > AV_TOPE)) return 'var(--brand,#2563eb)';
    return semColor(a, ritmo);
  };
  const tipAv = o => ppSimbolico(o)
    ? ' title="El PP capturado para este renglón es de centavos: no hay contra qué medir. Revísalo en Carga de PP."'
    : ((avVal(o) ?? 0) > AV_TOPE ? ' title="Avance implausible: revisa el PP capturado de este renglón."' : '');

  function renderPp() {
    const el = document.getElementById('ppCard');
    if (!pp) { el.innerHTML = ''; return; }
    if (pp.sin_pp) {
      const ctlSinPp = pp.control ? (esDinero() ? Number(pp.control.ventas_real || 0) : Number(pp.control.kg_real || 0)) : 0;
      el.innerHTML = `
        <div class="row"><div><div class="eyebrow">Radar · Presupuesto</div><h2>Cumplimiento vs PP ${pp.anio}</h2></div></div>
        <div class="empty" style="margin-top:10px">No hay presupuesto (PP) cargado para ${pp.anio}.${pp.anios?.length ? ` Disponibles: ${pp.anios.join(', ')}.` : ''}
        ${ctlSinPp ? `<div style="margin-top:6px;font-size:12px">Hay <b>${fmtVal(ctlSinPp)}</b> de venta en ${pp.anio}, pero ninguna combinación cliente·producto tiene ClavePP todavía — <a href="/modules/rc/asignacion-pp.html">Asignación PP</a>.</div>` : ''}</div>`;
      return;
    }
    // Año con ventas y sin PP capturado: hay real atribuido pero nada contra
    // qué medirlo. Se dice, en vez de pintar un PP de $0.00 (que se lee como
    // "presupuesto de cero", no como "presupuesto ausente") y avances vacíos.
    const pend = !!pp.pp_pendiente;
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
            Métrica: <b>${esDinero() ? 'venta (MXN)' : 'volumen (kg)'}</b> · última venta ${ultv} ·
            ${pend ? `<b style="color:var(--warning,#d97706)">presupuesto ${pp.anio} sin capturar</b>` : `ritmo esperado <b>${pct0(ritmo)}</b> del año`}
          </div>
        </div>
        ${pend
          ? `<span style="display:inline-block;padding:4px 12px;border-radius:999px;font-weight:700;color:#fff;background:var(--warning,#d97706)">PP por capturar</span>`
          : `<span style="display:inline-block;padding:4px 12px;border-radius:999px;font-weight:700;color:#fff;background:${col}">${pct0(av)} del PP</span>`}
      </div>`;

    // Cumplimiento al corte = real ÷ meta lineal a la fecha (PP ÷ 12 × meses
    // transcurridos). Mide qué tan al día vas contra el ritmo mensual del PP.
    const mesesTrans = t.ult_venta ? (new Date(t.ult_venta).getUTCMonth() + 1) : null;
    const metaCorte = mesesTrans ? ppVal(t) / 12 * mesesTrans : null;
    const cumplCorte = metaCorte ? realVal(t) / metaCorte : null;
    const cumplCol = cumplCorte == null ? 'var(--muted,#64748b)'
      : (cumplCorte >= 1 ? 'var(--success,#16a34a)' : cumplCorte >= 0.9 ? 'var(--warning,#d97706)' : 'var(--danger,#dc2626)');
    const cards = `
      <div class="grid-4" style="gap:10px;margin-top:14px">
        ${pend
          ? miniCard(`PP ${pp.anio} (${esDinero() ? 'MXN' : 'kg'})`, 'Por capturar', 'sin presupuesto en el sistema', 'var(--warning,#d97706)')
          : miniCard(`PP ${pp.anio} (${esDinero() ? 'MXN' : 'kg'})`, fmtValC(ppVal(t)), 'presupuesto anual')}
        ${miniCard('Real a la fecha', fmtValC(realVal(t)), pend ? 'venta atribuida del ejercicio' : `${pct0(av)} del PP · ritmo esperado ${pct0(ritmo)}`, col)}
        ${miniCard(`Meta al corte (${mesesTrans || 0} m)`, (!pend && metaCorte != null) ? fmtValC(metaCorte) : '—', pend ? 'requiere PP' : `PP ÷ 12 × ${mesesTrans || 0} meses`)}
        ${miniCard('Cumplimiento al corte', pend ? '—' : pct0(cumplCorte), pend ? 'requiere PP' : 'real ÷ meta al corte', cumplCol)}
      </div>
      ${scVal !== 0 ? `<div class="hint" style="margin-top:8px;color:var(--muted);font-size:12px">El total de arriba ya es comparable (venta total al corte vs PP). Cobertura de mapeo a sublíneas: <b>${pct0(cob)}</b> · sin cruce <b>${fmtValC(scVal)}</b> — se atribuye conforme confirmas las combinaciones cliente·producto en <a href="/modules/rc/asignacion-pp.html">Asignación PP</a>.</div>` : ''}`;

    // Barra avance vs ritmo
    const barW = Math.min(100, Math.round((av || 0) * 100));
    const ritW = Math.min(100, Math.round(ritmo * 100));
    const bar = pend
      ? `<div style="margin-top:14px;padding:10px 12px;border:1px solid var(--warning,#d97706);background:rgba(180,83,9,.06);border-radius:10px;font-size:13px;color:#b45309">
           El presupuesto de <b>${pp.anio}</b> no está capturado, así que no hay contra qué medir el avance.
           Lo que ves es la <b>venta real del ejercicio ya atribuida</b> a categoría y sublínea.
           Captúralo en <a href="/modules/rc/pp-carga.html" style="color:inherit;text-decoration:underline">Carga de PP</a> y esta tarjeta se completa sola.
         </div>`
      : `
      <div style="margin-top:14px">
        <div style="position:relative;background:var(--panel2,#f1f5f9);border-radius:8px;height:22px;overflow:hidden">
          <div style="width:${barW}%;height:100%;background:${col};transition:width .3s"></div>
          <div title="Ritmo esperado ${pct0(ritmo)}" style="position:absolute;top:-2px;left:${ritW}%;width:2px;height:26px;background:var(--ink,#0f172a)"></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--muted);margin-top:3px">
          <span>Avance ${pct0(av)}</span><span>Marcador = ritmo esperado ${pct0(ritmo)}</span><span>PP 100%</span>
        </div>
      </div>`;

    // Tabla por categoría (expandible a sublínea).
    // Sin PP capturado la columna va en guion: un cero se lee como
    // "presupuesto de cero", que es una afirmación distinta.
    const fmtPp = v => pend ? '—' : fmtVal(v);
    const filaCat = c => {
      const a = avVal(c), cc = semColor(a, ritmo);
      const open = ppOpen.has(c.cat);
      const subs = open ? c.sublineas.map(s => {
        const sa = avVal(s), scol = semColor(sa, ritmo);
        // ·fuera del PP = tiene venta atribuida pero ese ejercicio no la
        // presupuestó. Antes esa venta no aparecía en ningún renglón.
        const etq = s.en_pp === false
          ? ' <span style="color:var(--brand,#2563eb);font-size:11px" title="Tiene venta atribuida pero no se presupuestó en este ejercicio">·fuera del PP</span>'
          : (s.mapeado ? '' : ' <span style="color:var(--warning,#d97706);font-size:11px">·sin cruce</span>');
        return `<tr style="background:var(--panel2,#f8fafc)">
          <td style="padding-left:26px"><span class="chip-compact">${KoguUi.escapeHtml(s.cve_sublinea)}</span> ${KoguUi.escapeHtml(s.sublinea_nombre)}${etq}</td>
          <td style="text-align:right">${s.en_pp === false ? '—' : fmtPp(ppVal(s))}</td>
          <td style="text-align:right">${fmtVal(realVal(s))}</td>
          <td style="text-align:right;font-weight:600;color:${colAv(s, ritmo)}"${tipAv(s)}>${fmtAv(s)}</td>
        </tr>`;
      }).join('') : '';
      return `<tr data-cat="${c.cat}" style="cursor:pointer">
          <td><span style="display:inline-block;width:14px;color:var(--muted)">${open ? '▾' : '▸'}</span><b>${KoguUi.escapeHtml(c.cat_nombre || ('Categoría ' + c.cat))}</b> <span style="color:var(--muted);font-size:11px">(${c.sublineas.length})</span></td>
          <td style="text-align:right">${fmtPp(ppVal(c))}</td>
          <td style="text-align:right">${fmtVal(realVal(c))}</td>
          <td style="text-align:right;font-weight:700;color:${colAv(c, ritmo)}"${tipAv(c)}>${fmtAv(c)}</td>
        </tr>${subs}`;
    };
    // Proyección de cierre por promedio mensual × 12.
    const realA = realVal(t), ppA = ppVal(t);
    // Meses transcurridos: del backend; fallback al mes de la última venta.
    const mesesT = Number(t.meses_transcurridos) || (t.ult_venta ? new Date(t.ult_venta).getUTCMonth() + 1 : 0);
    // Promedio de ventas mensual = real al corte ÷ meses transcurridos (backend, con fallback).
    const promBack = esDinero() ? t.promedio_mensual_ventas : t.promedio_mensual_kg;
    const promMes = promBack != null ? Number(promBack) : (mesesT ? realA / mesesT : 0);
    // Proyección de cierre = promedio mensual × 12 (backend, con fallback).
    const proyBack = esDinero() ? t.proyeccion_cierre_ventas : t.proyeccion_cierre_kg;
    const proy = proyBack != null ? Number(proyBack) : promMes * 12;
    const proyPct = (proy != null && ppA) ? proy / ppA : null;
    const faltante = (proy != null) ? Math.max(0, ppA - proy) : null;
    const proyCol = proyPct == null ? 'var(--muted,#64748b)'
      : (proyPct >= 0.98 ? 'var(--success,#16a34a)' : proyPct >= 0.9 ? 'var(--warning,#d97706)' : 'var(--danger,#dc2626)');
    // Ritmo mensual requerido para cerrar el PP con lo que falta del año.
    const mesesRest = Math.max(1, 12 - mesesT);
    const necesarioMes = (ppA - realA) > 0 ? (ppA - realA) / mesesRest : 0;
    const proyBlock = `
      <div style="display:flex;align-items:center;gap:8px;margin:16px 0 8px">
        <div class="eyebrow" style="margin:0">Proyección a fin de año · promedio mensual × 12</div>
        <button class="btn" id="proyInfoBtn" title="¿Cómo se calcula la proyección?" style="padding:2px 9px;font-size:12px">ℹ ¿Cómo se calcula?</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px">
        ${miniCard('Promedio de ventas mensual', fmtValC(promMes), `real ÷ ${mesesT || 0} meses`)}
        ${miniCard('Proyección de cierre', fmtValC(proy), pend ? 'sin PP con qué compararla' : `vs PP ${fmtValC(ppA)}`, pend ? '' : proyCol)}
        ${miniCard('% del PP proyectado', pend ? '—' : pct0(proyPct), pend ? 'requiere PP' : (proyPct != null && proyPct < 1 ? 'cerraría por debajo' : 'cerraría en meta'), pend ? '' : proyCol)}
        ${miniCard('Faltante proyectado', (!pend && faltante) ? fmtValC(faltante) : '—', pend ? 'requiere PP' : 'para alcanzar el PP', (!pend && faltante > 0) ? 'var(--danger,#dc2626)' : '')}
        ${miniCard('Ritmo mensual requerido', pend ? '—' : fmtValC(necesarioMes), pend ? 'requiere PP' : `para cerrar el PP (~${mesesRest} meses)`)}
      </div>`;

    const sinMapeo = !cob || cob < 0.001;
    const bannerCat = sinMapeo
      ? `<div class="hint" style="margin:10px 0 0;padding:10px 12px;background:var(--panel2,#f1f5f9);border-radius:10px;color:var(--muted);font-size:12px">El <b>desglose por categoría</b> aparece en cero porque todavía no hay combinaciones <b>cliente·producto</b> confirmadas con su ClavePP. Se llena desde <a href="/modules/rc/asignacion-pp.html">Asignación PP</a>. El <b>total al corte ya es correcto</b> arriba.</div>`
      : '';
    // ── Sumatorias ──────────────────────────────────────────────────────────
    //
    // La suma de las categorías NO tiene por qué igualar el "Real a la fecha"
    // del encabezado: lo que todavía no tiene ClavePP asignada cae en "sin
    // cruce". Por eso se muestran los tres renglones (suma + sin cruce = total)
    // en vez de un único total: así la diferencia queda explícita y se cuadra
    // a la vista, sin sacar calculadora.
    const sumPp   = pp.categorias.reduce((a, c) => a + ppVal(c), 0);
    const sumReal = pp.categorias.reduce((a, c) => a + realVal(c), 0);
    const totReal = sumReal + scVal;
    const avSum   = sumPp ? sumReal / sumPp : null;
    const avTot   = sumPp ? totReal / sumPp : null;

    // Triple verificación. Las dos primeras contrastan el front contra el
    // backend, pero salen de la misma fuente (totales.*_real_mapeado se deriva
    // de estas mismas categorías): solas nunca detectarían una fila perdida.
    // La tercera es la buena — Real a la fecha contra el total CRUDO de
    // erp_ventas del año (totales.*_control), que el backend calcula sin pasar
    // por la asignación PP. Si esa falla, hay venta cayéndose del tablero.
    const tol      = esDinero() ? 0.5 : 1;
    const dMapeado = sumReal - realMapVal(t);
    const dTotal   = totReal - realVal(t);
    const ctl      = ctrlVal(t);              // 0 si el backend aún no lo manda
    const dCtl     = ctl ? realVal(t) - ctl : 0;
    const notaCuadre = (Math.abs(dMapeado) > tol || Math.abs(dTotal) > tol || Math.abs(dCtl) > tol)
      ? `<div style="margin-top:8px;padding:9px 12px;border:1px solid var(--danger,#dc2626);border-radius:10px;color:var(--danger,#dc2626);font-size:12px">
           <b>Las sumas no cuadran.</b>
           ${Math.abs(dMapeado) > tol ? `Suma de categorías ${fmtVal(sumReal)} vs atribuido del servidor ${fmtVal(realMapVal(t))} (dif. ${fmtVal(dMapeado)}). ` : ''}
           ${Math.abs(dTotal) > tol ? `Total de la tabla ${fmtVal(totReal)} vs Real a la fecha ${fmtVal(realVal(t))} (dif. ${fmtVal(dTotal)}). ` : ''}
           ${Math.abs(dCtl) > tol ? `<b>Real a la fecha ${fmtVal(realVal(t))} vs venta del ERP ${fmtVal(ctl)} (dif. ${fmtVal(dCtl)})</b> — hay líneas de erp_ventas que no llegan ni a una sublínea ni a "sin cruce".` : ''}
         </div>`
      : (ctl ? `<div style="margin-top:8px;font-size:12px;color:var(--muted)">✓ Cuadra contra el ERP: suma de categorías + sin cruce = ${fmtVal(ctl)} de venta ${pp.anio}.</div>` : '');

    const foot = `
      <tfoot>
        <tr style="border-top:2px solid var(--line);font-weight:700;background:var(--panel2,#f8fafc)">
          <td>Suma de categorías <span style="color:var(--muted);font-weight:400;font-size:11px">(${pp.categorias.length})</span></td>
          <td style="text-align:right">${fmtPp(sumPp)}</td>
          <td style="text-align:right">${fmtVal(sumReal)}</td>
          <td style="text-align:right;color:${semColor(avSum, ritmo)}">${pct0(avSum)}</td>
        </tr>
        ${scVal !== 0 ? `<tr style="background:var(--panel2,#f8fafc);color:var(--warning,#d97706)">
          <td style="padding-left:14px">Sin cruce
            <span style="font-weight:400;font-size:11px">· cliente·producto todavía sin ClavePP${scVal < 0 ? ' · <b>en negativo</b>: son notas de crédito sin asignar' : ''} —
              <a href="/modules/rc/asignacion-pp.html" style="color:inherit;text-decoration:underline">asignar</a>
            </span>
          </td>
          <td style="text-align:right">—</td>
          <td style="text-align:right;font-weight:700">${fmtVal(scVal)}</td>
          <td style="text-align:right">—</td>
        </tr>` : ''}
        <tr style="border-top:1px solid var(--line);font-weight:800">
          <td>TOTAL ${pp.anio}</td>
          <td style="text-align:right">${fmtPp(sumPp)}</td>
          <td style="text-align:right">${fmtVal(totReal)}</td>
          <td style="text-align:right;color:${semColor(avTot, ritmo)}">${pct0(avTot)}</td>
        </tr>
      </tfoot>`;

    const cuerpo = `
      ${bannerCat}
      <div class="table-wrap" style="margin-top:8px"><table><thead><tr>
        <th>Categoría</th><th style="text-align:right">${pend ? 'PP (por capturar)' : `PP ${pp.anio}`}</th><th style="text-align:right">Real</th><th style="text-align:right">Avance</th>
      </tr></thead><tbody>${pp.categorias.map(filaCat).join('')}</tbody>${foot}</table></div>
      ${notaCuadre}`;
    const tabla = `
      <div id="ppCatHead" class="eyebrow" style="margin:18px 0 0;cursor:pointer;display:flex;align-items:center;gap:8px;user-select:none">
        <span style="display:inline-block;width:12px">${ppTablaOpen ? '▾' : '▸'}</span>
        Avance por categoría (${esDinero() ? 'MXN' : 'kg'})
        <span style="color:var(--muted);font-weight:400;font-size:11px;text-transform:none">· ${pp.categorias.length} categorías · ${ppTablaOpen ? 'clic para ocultar' : 'clic para mostrar'}</span>
      </div>
      ${ppTablaOpen ? cuerpo : ''}`;

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

  const sum = (arr, f = measKpi) => arr.reduce((a, x) => a + Number(f(x) || 0), 0);

  function renderKpis() {
    const totMet = sum(kpis);                                   // métrica activa
    const totMXN = sum(kpis, k => Number(k.subtotal_mxn || 0)); // siempre MXN
    const totKg = sum(kpis, k => Number(k.cantidad || 0));      // siempre kg
    const nal = sum(kpis.filter(k => k.mercado === 'NAL'));
    const ext = sum(kpis.filter(k => k.mercado === 'EXT'));
    const usd = sum(kpis.filter(k => k.moneda === 'USD'));
    const pc = v => totMet ? Math.round(100 * v / totMet) : 0;
    const abiertas = alertas.filter(a => a.status === 'abierta').length;
    // Tarjeta cruzada: muestra siempre la OTRA unidad (kg si estás en $, y viceversa).
    const cruzada = esDinero()
      ? statCard('Volumen total (kg)', `${nf0.format(totKg)} kg`, 'cantidad surtida', '#7c3aed')
      : statCard('Venta total (MXN)', money(totMXN), 'MXN-eq', '#7c3aed');
    document.getElementById('kpiCards').innerHTML = [
      statCard(`Venta total (${metricaLbl()})`, fmtVal(totMet), `${kpis.length} combinaciones`, 'var(--brand,#2563eb)'),
      cruzada,
      statCard('Nacional', fmtVal(nal), `${pc(nal)}% del total`, '#059669'),
      statCard('Exportación', fmtVal(ext), `${pc(ext)}% del total`, '#4f46e5'),
      statCard('% en USD', `${pc(usd)}%`, 'exposición a tipo de cambio', '#d97706'),
      statCard('Alertas abiertas', String(abiertas), `${alertas.length} en total`, 'var(--danger,#dc2626)'),
    ].join('');
  }

  function renderTrend() {
    const porMes = {};
    kpis.forEach(k => { porMes[k.mes] = (porMes[k.mes] || 0) + measKpi(k); });
    const meses = Object.keys(porMes).map(Number).sort((a, b) => a - b);
    const cont = document.getElementById('trend');
    if (!meses.length) { cont.innerHTML = '<div class="empty">Sin datos</div>'; return; }
    // Meta mensual lineal del PP (PP anual ÷ 12) para comparar mes a mes.
    // Sin PP capturado no hay meta: si se dejara en 0, el marcador se pegaría
    // al origen y TODOS los meses se pintarían de verde por cumplir un cero.
    const ppAnual = (pp && pp.totales && !pp.pp_pendiente) ? ppVal(pp.totales) : 0;
    const metaMes = ppAnual ? ppAnual / 12 : null;
    const max = Math.max(...meses.map(m => porMes[m]), metaMes || 0);
    const wMeta = (metaMes != null && max) ? Math.round(100 * metaMes / max) : null;
    const rows = meses.map(m => {
      const v = porMes[m]; const w = max ? Math.round(100 * v / max) : 0;
      const cumple = metaMes != null && v >= metaMes;
      const barCol = metaMes == null ? 'var(--brand,#2563eb)' : (cumple ? 'var(--success,#16a34a)' : 'var(--brand,#2563eb)');
      return `<div style="display:flex;align-items:center;gap:10px;margin:6px 0">
        <div style="width:34px;font-size:12px;color:var(--muted)">${MESES[m] || m}</div>
        <div style="position:relative;flex:1;background:var(--panel2,#f1f5f9);border-radius:6px;height:18px">
          <div style="width:${w}%;min-width:2px;height:100%;background:${barCol};border-radius:6px"></div>
          ${wMeta != null ? `<div title="Meta mensual ${fmtVal(metaMes)}" style="position:absolute;top:-2px;left:${wMeta}%;width:2px;height:22px;background:var(--ink,#0f172a)"></div>` : ''}
        </div>
        <div style="width:130px;text-align:right;font-size:12px">${fmtVal(v)}</div>
      </div>`;
    }).join('');
    const legend = metaMes != null
      ? `<div class="hint" style="margin-top:8px;color:var(--muted);font-size:11px">▎Marcador = meta mensual (PP ÷ 12 = ${fmtVal(metaMes)}). Verde = el mes alcanza la meta.</div>`
      : '';
    cont.innerHTML = rows + legend;
  }

  function renderMezcla() {
    const total = sum(kpis) || 1;
    const grupos = [
      ['Nacional MXN', 'NAL', 'MXN', '#059669'],
      ['Nacional USD', 'NAL', 'USD', '#10b981'],
      ['Exportación MXN', 'EXT', 'MXN', '#4f46e5'],
      ['Exportación USD', 'EXT', 'USD', '#6366f1'],
    ];
    document.getElementById('mezcla').innerHTML = grupos.map(([lbl, merc, mon, col]) => {
      const v = sum(kpis.filter(k => k.mercado === merc && k.moneda === mon)); if (!v) return '';
      const p = Math.round(100 * v / total);
      return `<div style="padding:8px 0">
        <div style="display:flex;justify-content:space-between;margin-bottom:5px">
          <span style="font-weight:600">${lbl}</span>
          <span style="font-weight:700">${fmtVal(v)} <span style="color:var(--muted);font-weight:400">(${p}%)</span></span>
        </div>
        <div style="background:var(--panel2,#f1f5f9);border-radius:6px;height:8px;overflow:hidden"><div style="width:${p}%;height:100%;background:${col}"></div></div>
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
        if (a.regla_clave === 'RC-005') {
          g.rc005 = a;
          // Los productos ya no son alertas sueltas: viajan como evidencia
          // dentro de la incidencia del cliente. Se cuentan de ahí.
          productos += (a.detalle?.productos?.length || 0);
        }
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
        ${miniCard(esDinero() ? 'Monto en riesgo' : 'Volumen en riesgo (kg)', fmtVal(totalRiesgo), 'lo que dejaron de comprar', 'var(--danger,#dc2626)')}
        ${miniCard('Clientes en caída', String(arr.length), `${nCriticas} críticos`)}
        ${miniCard('Productos en caída', String(productos), 'evidencia dentro del cliente')}
        ${miniCard('Otras alertas', String(otras), 'empresa / agentes')}
      </div>
      <div class="hint" style="margin-top:10px;color:var(--muted);font-size:12px">El detalle accionable, filtros y ficha por cliente están en la <a href="/modules/rc/bandeja.html">Bandeja de Riesgo</a>.</div>`;
  }

  // ── Modal: cómo se calcula la proyección de cierre ──────────────────────────
  function openProyeccion() {
    if (!pp || !pp.totales) return;
    const t = pp.totales, ritmo = Number(t.ritmo_esperado || 0);
    const realA = realVal(t), ppA = ppVal(t);
    const mesesT = Number(t.meses_transcurridos) || (t.ult_venta ? new Date(t.ult_venta).getUTCMonth() + 1 : 0);
    const promBack = esDinero() ? t.promedio_mensual_ventas : t.promedio_mensual_kg;
    const promMes = promBack != null ? Number(promBack) : (mesesT ? realA / mesesT : 0);
    const proyBack = esDinero() ? t.proyeccion_cierre_ventas : t.proyeccion_cierre_kg;
    const proy = proyBack != null ? Number(proyBack) : promMes * 12;
    const proyPct = (proy != null && ppA) ? proy / ppA : null;
    const faltante = proy != null ? Math.max(0, ppA - proy) : null;
    const mesesRest = Math.max(1, 12 - mesesT);
    const necesarioMes = (ppA - realA) > 0 ? (ppA - realA) / mesesRest : 0;
    const ultv = t.ult_venta ? KoguUi.fmtDate(t.ult_venta).split(',')[0] : '—';
    const uni = esDinero() ? 'venta (MXN)' : 'volumen (kg)';
    const pend = !!pp.pp_pendiente;   // sin PP capturado: los pasos 4–6 no aplican

    const paso = (n, titulo, formula, resultado) => `
      <div style="display:flex;gap:12px;align-items:flex-start;padding:10px 0;border-bottom:1px solid var(--line)">
        <div style="flex:none;width:24px;height:24px;border-radius:50%;background:var(--brand,#2563eb);color:#fff;font-weight:700;font-size:12px;display:flex;align-items:center;justify-content:center">${n}</div>
        <div style="flex:1">
          <div style="font-weight:700;font-size:14px">${titulo}</div>
          <div style="font-size:13px;color:var(--muted);margin-top:2px">${formula}</div>
          <div style="font-size:14px;font-weight:700;margin-top:4px">${resultado}</div>
        </div>
      </div>`;

    const html = `
      <div id="rcProyModal" style="position:fixed;inset:0;z-index:9999;background:rgba(15,23,42,.55);display:flex;justify-content:center;align-items:flex-start;overflow:auto;padding:32px 16px">
        <div style="background:var(--panel,#fff);border-radius:16px;max-width:720px;width:100%;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,.3)">
          <div class="row" style="align-items:flex-start;margin-bottom:8px">
            <div><div class="eyebrow">Radar · Presupuesto</div><h2 style="margin:4px 0 0">Cómo se calcula la proyección de cierre</h2></div>
            <button class="btn" id="rcProyClose">Cerrar ✕</button>
          </div>
          <div style="background:var(--panel2,#f1f5f9);border-radius:10px;padding:12px;margin-bottom:14px;font-size:13px;color:var(--muted)">
            <b>Idea.</b> Sacamos el <b>promedio de venta por mes</b> observado hasta el corte y lo extrapolamos a los 12 meses del año. Métrica activa: <b>${uni}</b> · corte al <b>${ultv}</b> · PP ${pp.anio} = <b>${pend ? 'sin capturar' : fmtVal(ppA)}</b>.
          </div>
          ${paso(1, 'Meses transcurridos', 'Mes del año al que corresponde la última venta cargada (Ene = 1 … Dic = 12).', `= <b>${mesesT || 0} meses</b> (al ${ultv})`)}
          ${paso(2, 'Promedio de ventas mensual', 'Real a la fecha ÷ meses transcurridos.', `${fmtVal(realA)} ÷ ${mesesT || 0} = <b>${fmtVal(promMes)}/mes</b>`)}
          ${paso(3, 'Proyección de cierre', 'Promedio mensual × 12 (lo que se vendería en el año completo manteniendo ese promedio).', `${fmtVal(promMes)} × 12 = <b>${fmtVal(proy)}</b>`)}
          ${pend
            ? `<div style="padding:10px 0;font-size:13px;color:var(--muted)">Los pasos 4 a 6 comparan contra el PP anual y el presupuesto de <b>${pp.anio}</b> no está capturado, así que no aplican. La proyección de cierre de arriba sí es válida: no depende del PP.</div>`
            : `${paso(4, '% del PP proyectado', 'Proyección de cierre ÷ PP anual.', `${fmtVal(proy)} ÷ ${fmtVal(ppA)} = <b>${pct0(proyPct)}</b>`)}
          ${paso(5, 'Faltante proyectado', 'PP anual − Proyección de cierre (cuánto quedaría sin alcanzar si nada cambia).', `${fmtVal(ppA)} − ${fmtVal(proy)} = <b>${faltante ? fmtVal(faltante) : '—'}</b>`)}
          ${paso(6, 'Ritmo mensual requerido', 'Lo que falta del PP ÷ meses restantes del año (cuánto deberías vender por mes para sí llegar al PP).', `(${fmtVal(ppA)} − ${fmtVal(realA)}) ÷ ${mesesRest} meses = <b>${fmtVal(necesarioMes)}/mes</b>`)}`}
          <div style="font-size:12px;color:var(--muted);margin-top:10px">
            <b>Límites.</b> Es una proyección <b>lineal</b>: el mes en curso cuenta como mes completo y no modela estacionalidad ni pedidos puntuales. El toggle <b>$ / kg</b> cambia la métrica de todo el cálculo. El corte usa la <b>última fecha de venta cargada</b> (${ultv}), no la fecha de hoy.
          </div>
        </div>
      </div>`;
    document.getElementById('rcProyModal')?.remove();
    document.body.insertAdjacentHTML('beforeend', html);
    const modal = document.getElementById('rcProyModal');
    document.getElementById('rcProyClose').onclick = () => modal.remove();
    modal.onclick = e => { if (e.target === modal) modal.remove(); };
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
    renderKpis(); renderTrend(); renderMezcla(); renderRiesgoResumen(); renderPp(); renderCumpl();
  };

  KoguShell.subscribeEmpresaActivaChange(loadAll);
  await loadAll();
});

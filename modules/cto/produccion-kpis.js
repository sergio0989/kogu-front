// ============================================================
// produccion-kpis.js — Costo: Producción · KPIs de producción (solo lectura).
// Volumen en las tres medidas del producto (caja, sobre y kg de producto), costo
// de materia prima por cada una contra el teórico, gramos por componente,
// rendimiento, mix por producto, producido vs vendido y alertas. Solo MP.
// Endpoints: GET /protected/cto/produccion-mp/analisis   → kpis
//            GET /protected/cto/produccion-mp/vendido    → inventario y venta
// Reglas puras en produccion-kpis-calc.js (tests/cto-produccion-kpis.test.mjs).
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/cto/produccion-kpis.html';
  const PERM = 'screen.costo';
  const BASE = '/protected/cto/produccion-mp';
  const K = window.KoguKpiCalc;

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Producción · KPIs',
    description: 'Cajas, sobres y kg producidos; costo de materia prima contra el teórico.',
    requiredPermission: PERM,
  });
  if (!b) return;

  const $ = (id) => document.getElementById(id);
  const c = $('pageContent');
  const MES = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const MESL = ['', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const fmt = (v, d = 2) => (v == null ? '—' : Number(v).toLocaleString('es-MX', { minimumFractionDigits: d, maximumFractionDigits: d }));
  const money = (v, d = 2) => (v == null ? '—' : (Number(v) < 0 ? '−$' + fmt(-v, d) : '$' + fmt(v, d)));
  const n0 = (v) => (v == null ? '—' : Number(v).toLocaleString('es-MX', { maximumFractionDigits: 0 }));
  const pct = (v, d = 1) => (v == null ? '—' : fmt(v * 100, d) + '%');
  const dev = (real, teo) => (real == null || !teo ? null : real / teo - 1);
  const devTxt = (v) => (v == null ? '—' : (v >= 0 ? '+' : '−') + fmt(Math.abs(v) * 100, 1) + '%');
  const devCls = (v) => (v == null ? 'neutral' : v > 0.15 ? 'danger' : v > 0.05 ? 'warn' : v < -0.05 ? 'primary' : 'success');
  const MEDIDAS = [['cajas', 'Cajas'], ['sobres', 'Sobres'], ['kg', 'kg de producto']];

  const hoy = new Date();
  let productos = [], seleccion = new Set(), D = null, V = null, medida = 'cajas', P = null;

  if (!document.getElementById('estiloProdKpi')) {
    const st = document.createElement('style'); st.id = 'estiloProdKpi';
    st.textContent = `
      .kpi-tile{padding:14px 16px}
      .kpi-tile .lbl{font-size:11px;text-transform:uppercase;letter-spacing:.04em;font-weight:700;color:var(--muted)}
      .kpi-tile .val{font-size:26px;font-weight:800;margin-top:2px;letter-spacing:-.01em;font-variant-numeric:tabular-nums}
      .kpi-tile .hint{font-size:12px;color:var(--muted)}
      .kpi-tile.oscuro{background:#0f172a;color:#fff}.kpi-tile.oscuro .lbl,.kpi-tile.oscuro .hint{color:#cbd5e1}
      .kpi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}
      .kpi-dos{display:grid;grid-template-columns:repeat(auto-fit,minmax(420px,1fr));gap:14px}
      .kpi-dos>*,.kpi-grid>*{min-width:0}
      @media (max-width:520px){.kpi-dos{grid-template-columns:1fr}.kpi-grid{grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}.kpi-barras{gap:4px}.kpi-barras .badge{font-size:10px;white-space:normal;text-align:center}}
      .kpi-seg{display:inline-flex;padding:3px;background:var(--panel2);border:1px solid var(--line);border-radius:10px;gap:3px}
      .kpi-seg button{border:0;background:transparent;padding:6px 12px;border-radius:7px;font:inherit;font-size:13px;font-weight:600;color:var(--muted);cursor:pointer;min-height:36px}
      .kpi-seg button[aria-pressed="true"]{background:#fff;color:var(--text);box-shadow:0 1px 2px rgba(15,23,42,.15)}
      .kpi-barras{display:flex;align-items:stretch;gap:10px;height:270px;margin-top:12px}
      .kpi-barras .col{flex:1 1 0;min-width:0;display:flex;flex-direction:column;align-items:center;gap:6px}
      .kpi-barras .area{flex:1 1 auto;width:100%;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:6px}
      .kpi-barras .bar{width:72%;max-width:84px;background:var(--primary);border-radius:6px 6px 0 0}
      .kpi-barras .bar.vacia{height:6px;background:transparent;border:1px dashed #94a3b8;border-radius:4px}
      .kpi-barras .v{font-size:12.5px;font-weight:700;font-variant-numeric:tabular-nums}
      .kpi-barras .m{font-size:13px;font-weight:600}
      .kpi-stack{display:flex;height:26px;border-radius:6px;overflow:hidden;gap:2px;margin-top:12px}
      .kpi-fila{display:grid;grid-template-columns:14px 1fr 80px 80px 70px;gap:10px;align-items:center;padding:9px 0;border-bottom:1px solid var(--line);font-size:13px}
      .kpi-fila .num{text-align:right;font-variant-numeric:tabular-nums}
      .kpi-g{display:grid;grid-template-columns:70px 1fr 64px;gap:8px;align-items:center;font-size:12px;color:var(--muted)}
      .kpi-g .pista{height:12px;background:var(--panel2);border-radius:4px;overflow:hidden}
      .kpi-g .pista div{height:12px;border-radius:4px}
      .kpi-flujo{display:flex;flex-wrap:wrap;gap:10px;align-items:stretch}
      .kpi-flujo .caja{flex:1 1 140px;padding:12px;border-radius:10px;display:flex;flex-direction:column;gap:2px}
      .kpi-flujo .op{display:flex;align-items:center;color:#94a3b8;font-size:20px}
      .table-wrap table.tabla-kpi{table-layout:auto;width:max-content;min-width:100%;font-variant-numeric:tabular-nums;font-size:12.5px}
      .table-wrap .tabla-kpi th,.table-wrap .tabla-kpi td{white-space:nowrap;padding:7px 10px;word-break:normal}
      .tabla-kpi .num{text-align:right}
      .tabla-kpi tr.vacio td{color:var(--muted);background:#fafbfc}
      .tabla-kpi tr.acum td{font-weight:700;border-top:2px solid var(--line);background:#f8fafc}
      .kpi-alerta{padding:12px 14px;border-radius:10px;display:flex;flex-direction:column;gap:6px;font-size:13px}
      .kpi-alerta.alta{background:#fff7ed;border:1px solid #fed7aa}
      .kpi-alerta.media{background:var(--panel2);border:1px solid var(--line)}`;
    document.head.appendChild(st);
  }

  c.innerHTML = `
<div class="card">
  <div class="row" style="align-items:flex-end;gap:12px;flex-wrap:wrap">
    <div style="flex:1 1 320px"><div class="eyebrow">Costo · Producción</div><h2 style="margin:0">KPIs de producción</h2>
      <div class="muted" style="font-size:12px">Cajas, sobres y kg producidos; costo de <b>materia prima</b> (sin servicios ni indirectos) contra el teórico vigente de cada orden.</div></div>
    <div><label class="muted" style="font-size:12px;display:block" for="anio">Año</label><input id="anio" type="number" class="input" style="width:100px"/></div>
    <div><label class="muted" style="font-size:12px;display:block" for="mesIni">Mes inicial</label><select id="mesIni" class="select" style="min-width:110px"></select></div>
    <div><label class="muted" style="font-size:12px;display:block" for="mesFin">Mes final</label><select id="mesFin" class="select" style="min-width:110px"></select></div>
    <button class="btn primary" id="btnAnalizar">Analizar</button>
  </div>
  <div style="margin-top:14px">
    <div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.04em;font-weight:700">Productos</div>
    <div class="row" style="gap:8px;align-items:center;flex-wrap:wrap;margin-top:6px">
      <div id="productos" style="display:flex;gap:6px;flex-wrap:wrap"></div>
      <input id="ptExtra" class="input" placeholder="Otra clave…" aria-label="Agregar otra clave" style="width:130px;text-transform:uppercase;padding:4px 8px;font-size:12px" title="Agrega un producto que no aparece (Enter)"/>
    </div>
  </div>
</div>
<div id="cuerpo" style="margin-top:14px;display:flex;flex-direction:column;gap:14px"></div>`;

  const opts = MES.slice(1).map((m, i) => `<option value="${i + 1}">${m}</option>`).join('');
  $('mesIni').innerHTML = opts; $('mesFin').innerHTML = opts;
  $('anio').value = hoy.getFullYear(); $('mesIni').value = 1; $('mesFin').value = Math.max(1, hoy.getMonth());
  const periodo = () => ({ anio: parseInt($('anio').value, 10), mes_ini: parseInt($('mesIni').value, 10), mes_fin: parseInt($('mesFin').value, 10) });

  async function cargarProductos() {
    const p = periodo();
    if (p.mes_ini > p.mes_fin) return KoguApi.toast('El mes inicial no puede ser mayor que el final.', 'error');
    try {
      const r = await KoguApi.apiFetch(`${BASE}/productos?${new URLSearchParams({ anio: p.anio, mes_ini: 1, mes_fin: 12 })}`);
      productos = (KoguApi.unwrapData(r) || []).map(x => ({ cve_pt: x.cve_pt, con_teorico: x.con_teorico }));
      if (!seleccion.size) seleccion = new Set(productos.filter(x => x.con_teorico).map(x => x.cve_pt));
      pintaProductos();
      if (seleccion.size) await analizar(); else limpiar('Elige al menos un producto.');
    } catch (e) { KoguApi.toast(e.message, 'error'); }
  }

  function pintaProductos() {
    const todos = [...productos];
    for (const k of seleccion) if (!todos.find(x => x.cve_pt === k)) todos.push({ cve_pt: k });
    $('productos').innerHTML = todos.length ? todos.map(x => {
      const on = seleccion.has(x.cve_pt);
      return `<button class="btn ${on ? 'primary' : 'ghost'}" data-pt="${esc(x.cve_pt)}" aria-pressed="${on}" style="padding:4px 10px;font-size:12px">${esc(x.cve_pt)}${x.con_teorico ? ' <span title="Tiene teórico">✓</span>' : ''}</button>`;
    }).join('') : '<span class="muted" style="font-size:12px">Sin producción cargada en el año.</span>';
    $('productos').querySelectorAll('[data-pt]').forEach(btn => btn.addEventListener('click', () => {
      const k = btn.dataset.pt; if (seleccion.has(k)) seleccion.delete(k); else seleccion.add(k); pintaProductos();
    }));
  }

  function limpiar(msg) { $('cuerpo').innerHTML = `<div class="card muted" style="padding:16px">${esc(msg)}</div>`; }

  async function analizar() {
    if (!seleccion.size) return KoguApi.toast('Elige al menos un producto.', 'error');
    P = periodo();
    const q = new URLSearchParams({ ...P, cve_pt: [...seleccion].join(',') });
    $('btnAnalizar').disabled = true;
    D = null; V = null; limpiar('Cargando…');
    try {
      const [a, v] = await Promise.allSettled([
        KoguApi.apiFetch(`${BASE}/analisis?${q}`),
        KoguApi.apiFetch(`${BASE}/vendido?${q}`),
      ]);
      if (a.status === 'rejected') throw a.reason;
      D = KoguApi.unwrapData(a.value);
      V = v.status === 'fulfilled' ? KoguApi.unwrapData(v.value) : null;
      if (!D || !D.kpis || !D.kpis.meses.length) return limpiar('No hay producción cargada de esos productos en el periodo (Costo → Cargas / Importación).');
      pinta();
    } catch (e) { limpiar(e.message || 'No se pudo cargar.'); KoguApi.toast(e.message, 'error'); }
    finally { $('btnAnalizar').disabled = false; }
  }

  // ── Datos de lo vendido: cajas vendidas del periodo e inventario de los lotes ──
  function vendido() {
    if (!V || !V.resumen || !V.resumen.length) return null;
    const t = V.resumen.find(x => x.mes === null && x.cve_pt === 'Total');
    const mesesVenta = new Set(V.resumen.filter(x => x.mes !== null && x.cve_pt === 'Total' && x.cajas).map(x => x.mes)).size;
    const invPorPt = new Map();
    let inv = 0, invValor = 0;
    for (const l of V.lotes || []) {
      if (l.inventario == null) continue;
      inv += l.inventario;
      invPorPt.set(l.cve_pt, (invPorPt.get(l.cve_pt) || 0) + l.inventario);
      const cu = l.mp_corr_caja ?? l.mp_caja;
      if (cu != null) invValor += l.inventario * cu;
    }
    return { t, mesesVenta, inv, invValor, invPorPt };
  }

  const tile = (lbl, val, hint, extra = '', cls = '') => `<div class="card kpi-tile ${cls}"><div class="lbl">${lbl}</div>
    <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap"><span class="val">${val}</span>${extra}</div><div class="hint">${hint}</div></div>`;
  const chip = (v, txt) => `<span class="badge ${devCls(v)}">${txt ?? devTxt(v)}</span>`;

  function pinta() {
    const k = D.kpis, a = k.acumulado, u = D.unidad || 'unidad';
    const us = KoguTeoPlural(u);
    const sv = vendido();
    const kgSobre = a.unidades ? a.kg / a.unidades : null;

    const volumen = `<div class="kpi-grid">
      ${tile('Cajas producidas', n0(a.cantidad_pt), `${a.ordenes} órdenes · promedio ${n0(a.promedio_orden_pt)} · mayor ${n0(a.mayor_orden_pt)}`)}
      ${tile(`${esc(cap(us))} producidos`, n0(a.unidades), `cajas × ${fmt(a.cantidad_pt ? a.unidades / a.cantidad_pt : null, 0)}`)}
      ${tile('Producto (kg)', `${n0(a.kg)} kg`, kgSobre == null ? 'sin kg en el catálogo' : `${fmt(kgSobre * 1000, 0)} g por ${esc(u)} · ${fmt(a.cantidad_pt ? a.kg / a.cantidad_pt : null, 3)} kg por caja`)}
      ${sv ? tile('Inventario (lotes vendidos)', `${n0(sv.inv)} cajas`, `≈ ${money(sv.invValor, 0)} de MP · ${fmt(K.cobertura(sv.inv, sv.t && sv.t.cajas, sv.mesesVenta), 1)} meses de venta`) : tile('Inventario', '—', 'sin ventas calculadas en el periodo')}
    </div>`;

    const costo = `<div class="kpi-grid">
      ${tile(`MP por ${esc(u)}`, money(a.mp_por_unidad, 2), `teórico ${money(a.teo_por_unidad, 2)}`, chip(dev(a.mp_por_unidad, a.teo_por_unidad)))}
      ${tile('MP por caja', money(a.mp_por_pt, 2), `teórico ${money(a.teo_por_pt, 2)}`, chip(dev(a.mp_por_pt, a.teo_por_pt), a.teo_por_pt == null ? '—' : (a.mp_por_pt >= a.teo_por_pt ? '+' : '−') + money(Math.abs(a.mp_por_pt - a.teo_por_pt), 2)))}
      ${tile('MP por kg', money(a.mp_por_kg, 2), `teórico ${money(a.teo_por_kg, 2)} · MP total ${money(a.costo_mp, 0)}`, chip(dev(a.mp_por_kg, a.teo_por_kg)))}
      ${tile('Rendimiento', pct(a.rendimiento), `teórico ${pct(a.rendimiento_teo)} · kg producto ÷ kg que entran al peso`, a.rendimiento == null || a.rendimiento_teo == null ? '' : `<span class="badge neutral">${(a.rendimiento >= a.rendimiento_teo ? '+' : '−') + fmt(Math.abs(a.rendimiento - a.rendimiento_teo) * 100, 1)} pts</span>`)}
      ${tile('Sobrecosto MP vs teórico', money(a.sobrecosto, 0), a.sobrecosto == null ? 'sin teórico en todas las órdenes' : `${n0(a.unidades)} ${esc(us)} × ${money(a.unidades ? a.sobrecosto / a.unidades : null, 3)}`, '', 'oscuro')}
    </div>`;

    $('cuerpo').innerHTML = volumen + costo + cardMensual(k, u) +
      `<div class="kpi-dos">${cardDesglose(a, u)}${cardGramos(a, u)}</div>` +
      `<div class="kpi-dos">${cardMix(k, sv)}${cardFlujo(a, sv)}</div>` +
      cardDetalle(k, a, u) + cardAlertas(k, u);
    enlazaMedida();
  }
  function enlazaMedida() {
    $('cuerpo').querySelectorAll('[data-medida]').forEach(btn => btn.addEventListener('click', () => { medida = btn.dataset.medida; $('mensual').outerHTML = cardMensual(D.kpis, D.unidad || 'unidad'); enlazaMedida(); }));
  }

  function cardMensual(k, u) {
    const meses = K.mesesConHuecos(k.meses, P.anio, P.mes_ini, P.mes_fin);
    const max = Math.max(1, ...meses.map(m => K.valorMedida(m, medida)));
    const cols = meses.map(m => {
      const v = K.valorMedida(m, medida);
      const h = v ? Math.max(6, Math.round(v / max * 190)) : 0;
      const d = m.sin_produccion ? null : dev(m.mp_por_unidad, m.teo_por_unidad);
      const tip = m.sin_produccion ? `${MESL[m.mes]}: sin producción` : `${MESL[m.mes]}: ${n0(m.cantidad_pt)} cajas · ${n0(m.unidades)} ${KoguTeoPlural(u)} · ${n0(m.kg)} kg · ${m.ordenes} órdenes`;
      return `<div class="col" title="${esc(tip)}"><div class="area"><span class="v">${v ? n0(v) : '—'}</span>
        <div class="bar${v ? '' : ' vacia'}" style="${v ? `height:${h}px` : ''}"></div></div>
        <span class="m">${MES[m.mes]}</span>${m.sin_produccion ? '<span class="badge neutral">sin producción</span>' : chip(d, `${money(m.mp_por_unidad, 2)} · ${devTxt(d)}`)}</div>`;
    }).join('');
    const etiqueta = { cajas: 'cajas producidas', sobres: `${KoguTeoPlural(u)} producidos`, kg: 'kg de producto' }[medida];
    return `<div class="card" id="mensual">
      <div class="row" style="justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
        <div><h3 style="margin:0">Producción por mes</h3><div class="muted" style="font-size:12px">Barras: ${esc(etiqueta)} · etiqueta: MP por ${esc(u)} y desviación contra el teórico</div></div>
        <div class="kpi-seg" role="group" aria-label="Medida">${MEDIDAS.map(([id, l]) => `<button type="button" data-medida="${id}" aria-pressed="${medida === id}">${id === 'sobres' ? esc(cap(KoguTeoPlural(u))) : l}</button>`).join('')}</div>
      </div>
      <div class="kpi-barras">${cols}</div></div>`;
  }

  const COLORES = ['#0891b2', '#ea7a1e', '#0f766e', '#7c8ba1', '#cbd5e1', '#a78bfa', '#f472b6'];
  function cardDesglose(a, u) {
    const comps = a.componentes.filter(x => x.costo);
    const tot = comps.reduce((s, x) => s + (x.real_por_unidad || 0), 0);
    const seg = comps.map((x, i) => `<div title="${esc(x.componente)} ${pct(tot ? x.real_por_unidad / tot : null)}" style="width:${tot ? (x.real_por_unidad / tot * 100).toFixed(2) : 0}%;background:${COLORES[i % COLORES.length]}"></div>`).join('');
    const filas = comps.map((x, i) => `<div class="kpi-fila"><span aria-hidden="true" style="width:12px;height:12px;border-radius:3px;background:${COLORES[i % COLORES.length]}"></span>
      <span style="font-weight:600">${esc(x.componente)}</span><span class="num" style="font-weight:700">${money(x.real_por_unidad, 3)}</span>
      <span class="num muted">${x.teo_por_unidad == null ? 'sin teórico' : 'teo ' + money(x.teo_por_unidad, 2)}</span>
      <span class="num">${x.teo_por_unidad == null ? pct(tot ? x.real_por_unidad / tot : null) : chip(dev(x.real_por_unidad, x.teo_por_unidad))}</span></div>`).join('');
    return `<div class="card"><h3 style="margin:0">¿En qué se va el costo de un ${esc(u)}?</h3>
      <div class="muted" style="font-size:12px">${money(a.mp_por_unidad, 3)} de MP real por ${esc(u)} en el periodo</div>
      <div class="kpi-stack" role="img" aria-label="Desglose del costo por componente">${seg}</div><div style="margin-top:6px">${filas}</div></div>`;
  }

  function cardGramos(a, u) {
    const comps = a.componentes.filter(x => x.g_real != null);
    const max = Math.max(1, ...comps.map(x => Math.max(x.g_real || 0, x.g_teo_merma || 0))) * 1.05;
    const filas = comps.map(x => {
      const d = dev(x.g_real, x.g_teo_merma);
      const alto = d != null && Math.abs(d) > K.UMBRAL_GRAMOS;
      return `<div style="display:flex;flex-direction:column;gap:6px;margin-top:14px">
        <div class="row" style="justify-content:space-between;align-items:baseline"><span style="font-weight:600;font-size:13.5px">${esc(x.componente)} <span class="muted" style="font-weight:400;font-size:12px">· teórico ${fmt(x.g_teo, 1)} g${x.g_teo_merma !== x.g_teo ? ` + merma = ${fmt(x.g_teo_merma, 1)} g` : ''}</span></span>${chip(d)}</div>
        <div class="kpi-g"><span>Real</span><div class="pista"><div style="width:${(x.g_real / max * 100).toFixed(1)}%;background:${alto ? '#ea7a1e' : 'var(--primary)'}"></div></div><span class="num" style="font-weight:700;color:var(--text)">${fmt(x.g_real, 1)} g</span></div>
        <div class="kpi-g"><span>Teórico</span><div class="pista"><div style="width:${((x.g_teo_merma || 0) / max * 100).toFixed(1)}%;background:#94a3b8"></div></div><span class="num" style="font-weight:700;color:var(--text)">${fmt(x.g_teo_merma, 1)} g</span></div>
      </div>`;
    }).join('');
    return `<div class="card"><h3 style="margin:0">Gramos por ${esc(u)} contra el teórico</h3>
      <div class="muted" style="font-size:12px">Real = kg consumidos ÷ ${esc(KoguTeoPlural(u))} producidos · teórico con su merma. Solo componentes con gramos en el teórico.</div>
      ${filas || '<div class="muted" style="margin-top:10px">El teórico no lleva gramos.</div>'}</div>`;
  }

  function cardMix(k, sv) {
    const tot = k.acumulado.cantidad_pt || 0;
    const filas = k.por_pt.map(x => {
      const p = tot ? x.cantidad_pt / tot : null;
      const inv = sv ? sv.invPorPt.get(x.cve_pt) : null;
      return `<tr><td style="font-weight:600">${esc(x.cve_pt)}</td><td class="num">${n0(x.cantidad_pt)}</td><td class="num">${n0(x.unidades)}</td>
        <td><div style="display:flex;align-items:center;gap:8px"><div style="width:70px;height:8px;background:var(--panel2);border-radius:4px;overflow:hidden"><div style="height:8px;width:${p == null ? 0 : (p * 100).toFixed(1)}%;background:var(--primary)"></div></div>${pct(p)}</div></td>
        <td class="num" style="font-weight:600">${money(x.mp_por_pt, 2)}</td><td class="num">${chip(dev(x.mp_por_unidad, x.teo_por_unidad))}</td>
        <td class="num">${!sv ? '—' : inv ? n0(inv) : '<span class="badge danger">Agotado</span>'}</td></tr>`;
    }).join('');
    return `<div class="card"><h3 style="margin:0">Mix por producto</h3>
      <div class="table-wrap" style="margin-top:10px"><table class="tabla-kpi"><thead><tr><th>Clave</th><th class="num">Cajas</th><th class="num">${esc(cap(KoguTeoPlural(D.unidad || 'unidad')))}</th><th>% mix</th><th class="num">MP / caja</th><th class="num">vs teórico</th><th class="num">Inventario</th></tr></thead><tbody>${filas}</tbody></table></div></div>`;
  }

  function cardFlujo(a, sv) {
    if (!sv || !sv.t) return `<div class="card"><h3 style="margin:0">Producido vs vendido</h3><div class="muted" style="margin-top:10px">Sin ventas calculadas de estos productos en el periodo (Costo → Cargas y Calcular).</div></div>`;
    const t = sv.t;
    return `<div class="card"><h3 style="margin:0">Producido vs vendido</h3>
      <div class="muted" style="font-size:12px">Del periodo. El inventario es el de los lotes vendidos (producido − vendido de siempre).</div>
      <div class="kpi-flujo" style="margin-top:12px">
        <div class="caja" style="background:#ecfeff"><span class="muted" style="font-size:12px;font-weight:600">Producido</span><span style="font-size:22px;font-weight:800">${n0(a.cantidad_pt)}</span><span class="muted" style="font-size:12px">cajas</span></div>
        <div class="op" aria-hidden="true">·</div>
        <div class="caja" style="background:var(--success-bg)"><span class="muted" style="font-size:12px;font-weight:600">Vendido</span><span style="font-size:22px;font-weight:800">${n0(t.cajas)}</span><span class="muted" style="font-size:12px">cajas · ${money(t.venta, 0)}</span></div>
        <div class="op" aria-hidden="true">·</div>
        <div class="caja" style="background:var(--panel2);border:1px solid var(--line)"><span class="muted" style="font-size:12px;font-weight:600">Inventario</span><span style="font-size:22px;font-weight:800">${n0(sv.inv)}</span><span class="muted" style="font-size:12px">cajas · ≈ ${money(sv.invValor, 0)}</span></div>
      </div>
      <div class="kpi-grid" style="margin-top:12px">
        <div style="padding:10px;border:1px solid var(--line);border-radius:8px"><div class="muted" style="font-size:12px">Contribución MP corregida</div><div style="font-size:18px;font-weight:800">${money(t.contrib && t.contrib.mp_corr, 0)} · ${pct(t.pct && t.pct.mp_corr)}</div></div>
        <div style="padding:10px;border:1px solid var(--line);border-radius:8px"><div class="muted" style="font-size:12px">Cobertura del inventario</div><div style="font-size:18px;font-weight:800">${fmt(K.cobertura(sv.inv, t.cajas, sv.mesesVenta), 1)} meses</div><div class="muted" style="font-size:12px">al promedio de ${sv.mesesVenta} mes(es) con venta</div></div>
      </div></div>`;
  }

  function cardDetalle(k, a, u) {
    const g = (m, nombre) => { const x = (m.componentes || []).find(y => y.componente === nombre); return x && x.g_real != null ? x : null; };
    const conGramos = a.componentes.filter(x => x.g_real != null).map(x => x.componente);
    const celG = (m, nombre) => {
      const x = g(m, nombre); if (!x) return '<td class="num">—</td>';
      const r = x.g_teo_merma ? x.g_real / x.g_teo_merma : null;
      const cls = r == null ? '' : r < K.UMBRAL_CAPTURA ? 'danger' : r - 1 > K.UMBRAL_GRAMOS ? 'warn' : '';
      return `<td class="num">${cls ? `<span class="badge ${cls}">${fmt(x.g_real, 1)}</span>` : fmt(x.g_real, 1)}</td>`;
    };
    const fila = (m, etq, cls = '') => m.sin_produccion
      ? `<tr class="vacio"><td>${etq}</td><td class="num">0</td><td colspan="${7 + conGramos.length}">sin producción</td></tr>`
      : `<tr class="${cls}"><td>${etq}</td><td class="num">${m.ordenes}</td><td class="num">${n0(m.cantidad_pt)}</td><td class="num">${n0(m.unidades)}</td><td class="num">${n0(m.kg)}</td>
        <td class="num" style="font-weight:600">${money(m.mp_por_unidad, 3)}</td><td class="num">${chip(dev(m.mp_por_unidad, m.teo_por_unidad))}</td>
        <td class="num">${m.rendimiento != null && m.rendimiento > 0.97 ? `<span class="badge danger" title="Casi sin merma: revisa la captura">${pct(m.rendimiento)}</span>` : pct(m.rendimiento)}</td>
        <td class="num">${money(m.costo_mp, 0)}</td>${conGramos.map(nm => celG(m, nm)).join('')}</tr>`;
    const meses = K.mesesConHuecos(k.meses, P.anio, P.mes_ini, P.mes_fin);
    return `<div class="card"><h3 style="margin:0">Detalle mensual</h3>
      <div class="table-wrap" style="margin-top:10px"><table class="tabla-kpi"><thead><tr><th>Mes</th><th class="num">Órdenes</th><th class="num">Cajas</th><th class="num">${esc(cap(KoguTeoPlural(u)))}</th><th class="num">kg</th>
        <th class="num">MP / ${esc(u)}</th><th class="num">vs teórico</th><th class="num">Rend.</th><th class="num">MP total</th>${conGramos.map(nm => `<th class="num">g ${esc(nm.toLowerCase())}</th>`).join('')}</tr></thead>
        <tbody>${meses.map(m => fila(m, `${MES[m.mes]} ${m.anio}`)).join('')}${fila(a, 'Acumulado', 'acum')}</tbody></table></div></div>`;
  }

  function cardAlertas(k, u) {
    const al = K.alertas(k);
    const texto = (x) => {
      if (x.tipo === 'gramos') return [`${x.componente} ${devTxt(x.desviacion)} sobre el teórico`, `${fmt(x.real, 1)} g por ${u} contra ${fmt(x.ref, 1)} g del teórico con merma, en todo el periodo. Revisa la merma real o si el teórico se quedó corto.`];
      if (x.tipo === 'captura') return [`${cap(MESL[x.mes])}: ${x.componente.toLowerCase()} incompleto`, `${fmt(x.real, 1)} g por ${u} contra ${fmt(x.ref, 1)} g esperados (${pct(x.real / x.ref, 0)}). Lo más probable es que falte capturar ${x.componente.toLowerCase()} en alguna orden del mes, no un ahorro.`];
      return [`${cap(MESL[x.mes])}: ${x.componente.toLowerCase()} caro`, `${money(x.real, 3)} por ${u} contra ${money(x.ref, 3)} del periodo (${devTxt(x.desviacion)}). Revisa el costo del lote que se consumió ese mes.`];
    };
    const cajas = al.map(x => { const [t, d] = texto(x); return `<div class="kpi-alerta ${x.nivel}"><div style="display:flex;gap:8px;align-items:center"><span class="badge ${x.nivel === 'alta' ? 'warn' : 'neutral'}">${x.nivel === 'alta' ? 'Alta' : 'Media'}</span><b>${esc(t)}</b></div><div class="muted" style="color:#334155">${esc(d)}</div></div>`; }).join('');
    return `<div class="card"><h3 style="margin:0">Alertas de producción</h3>
      <div class="muted" style="font-size:12px">Gramos del periodo más de ${pct(K.UMBRAL_GRAMOS, 0)} sobre el teórico · un mes por debajo del ${pct(K.UMBRAL_CAPTURA, 0)} de los gramos teóricos · un mes con el componente ${fmt(K.UMBRAL_PRECIO, 1)} veces más caro que el periodo.</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:10px;margin-top:10px">${cajas || '<div class="muted">Sin alertas en el periodo.</div>'}</div>
      <div class="muted" style="font-size:12px;margin-top:12px">${esc(cap(KoguTeoPlural(u)))} = cajas × la equivalencia del producto · kg = cajas × kg netos del catálogo · MP por ${esc(u)} = costo de MP de las órdenes ÷ ${esc(KoguTeoPlural(u))} · Solo materia prima.</div></div>`;
  }

  const cap = (s) => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);
  function KoguTeoPlural(u) { return window.KoguTeoCalc && window.KoguTeoCalc.plural ? window.KoguTeoCalc.plural(u) : (/[aeiou]$/i.test(u) ? u + 's' : u); }

  $('btnAnalizar').addEventListener('click', analizar);
  $('anio').addEventListener('change', cargarProductos);
  $('ptExtra').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const v = $('ptExtra').value.trim().toUpperCase(); if (!v) return;
    seleccion.add(v); $('ptExtra').value = ''; pintaProductos();
  });
  if (KoguShell.subscribeEmpresaActivaChange) KoguShell.subscribeEmpresaActivaChange(() => { seleccion = new Set(); D = null; V = null; cargarProductos(); });
  cargarProductos();
});

// ============================================================
// produccion-vendido.js — Costo: Producción · Resultado de lo vendido (solo lectura).
// El costo va sobre lo producido; el resultado, sobre lo vendido. Cada venta de
// la Bandeja (ya calculada) se liga por producto + lote a la orden que lo produjo.
// Solo materia prima — los indirectos quedan fuera. Tres costos por caja:
//   Teórico       versión vigente a la fecha de la orden × unidades por caja
//   MP real       Mat_dir de la orden ÷ cajas producidas
//   MP corregida  MP real con la MP producida en casa (sazonador) al costo de su lote
// Endpoint: GET /protected/cto/produccion-mp/vendido (cto.read)
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/cto/produccion-vendido.html';
  const PERM = 'screen.costo';
  const BASE = '/protected/cto/produccion-mp';

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Producción · Resultado de lo vendido',
    description: 'Contribución de materia prima de lo vendido: teórico, MP real y MP corregida por lote.',
    requiredPermission: PERM,
  });
  if (!b) return;

  const $ = (id) => document.getElementById(id);
  const c = $('pageContent');
  const MES = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const fmt = (v, d = 2) => (v == null ? '—' : Number(v).toLocaleString('es-MX', { minimumFractionDigits: d, maximumFractionDigits: d }));
  const money = (v, d = 2) => (v == null ? '—' : (Number(v) < 0 ? '−$' + fmt(-v, d) : '$' + fmt(v, d)));
  const n0 = (v) => (v == null ? '—' : Number(v).toLocaleString('es-MX', { maximumFractionDigits: 0 }));
  const pct = (v) => (v == null ? '—' : fmt(v * 100, 1) + '%');
  // Contribución real contra la teórica: lejos en cualquier sentido = revisar.
  const difCls = (v) => (v == null ? '' : Math.abs(v) > 0.03 ? 'color:var(--danger);font-weight:700' : Math.abs(v) > 0.01 ? 'color:var(--warn);font-weight:600' : 'color:var(--muted)');
  const ptsTxt = (v) => (v == null ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + fmt(Math.abs(v) * 100, 1) + ' pts');

  const hoy = new Date();
  let productos = [], seleccion = new Set(), D = null;

  if (!document.getElementById('estiloProdVen')) {
    const st = document.createElement('style'); st.id = 'estiloProdVen';
    st.textContent = `
      .table-wrap table.tabla-resumen{table-layout:auto;width:max-content;min-width:100%;font-variant-numeric:tabular-nums;font-size:12.5px}
      .table-wrap .tabla-resumen th,.table-wrap .tabla-resumen td{word-break:normal;overflow-wrap:normal;white-space:nowrap;padding:7px 10px}
      .tabla-resumen th{font-size:11.5px}
      .tabla-resumen .num{text-align:right}
      .tabla-resumen .sep{border-left:2px solid var(--line)}
      .tabla-resumen .teo{background:#f8fafc}
      .tabla-resumen .corr{background:#f0f9ff}
      .tabla-resumen tr.total td{font-weight:700;border-top:2px solid var(--line);background:#f8fafc}
      .tabla-resumen tr.acum td{font-weight:700;border-top:3px double var(--line);background:#eef6ff}
      .tabla-resumen td.fija{font-weight:600;position:sticky;left:0;background:#fff;z-index:1;box-shadow:2px 0 0 var(--line)}
      .tabla-resumen tr.total td.fija{background:#f8fafc}
      .tabla-resumen tr.acum td.fija{background:#eef6ff}
      .tabla-resumen thead tr:first-child th:first-child{position:sticky;left:0;z-index:2;background:#f8fafc;box-shadow:2px 0 0 var(--line)}
      .tabla-resumen .grupo{text-align:center;font-size:12px}
      .tabla-resumen .grupo small{display:block;font-weight:400;color:var(--muted);font-size:11px}
      .tabla-resumen td.lote{white-space:normal;min-width:160px;max-width:220px;font-size:11.5px}`;
    document.head.appendChild(st);
  }

  c.innerHTML = `
<div class="card">
  <div class="row" style="align-items:flex-end;gap:12px;flex-wrap:wrap">
    <div style="flex:1 1 320px"><div class="eyebrow">Costo · Producción</div><h2 style="margin:0">Resultado de lo vendido</h2>
      <div class="muted" style="font-size:12px">Contribución de <b>materia prima</b> de lo vendido (sin indirectos). Cada venta se liga por producto + lote a la orden que lo produjo.</div></div>
    <div><label class="muted" style="font-size:12px;display:block">Año</label><input id="anio" type="number" class="input" style="width:100px"/></div>
    <div><label class="muted" style="font-size:12px;display:block">Mes inicial</label><select id="mesIni" class="select" style="min-width:110px"></select></div>
    <div><label class="muted" style="font-size:12px;display:block">Mes final</label><select id="mesFin" class="select" style="min-width:110px"></select></div>
    <button class="btn primary" id="btnAnalizar">Analizar</button>
  </div>
  <div style="margin-top:14px">
    <div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.04em;font-weight:700">Productos</div>
    <div class="row" style="gap:8px;align-items:center;flex-wrap:wrap;margin-top:6px">
      <div id="productos" style="display:flex;gap:6px;flex-wrap:wrap"></div>
      <input id="ptExtra" class="input" placeholder="Otra clave…" style="width:130px;text-transform:uppercase;padding:4px 8px;font-size:12px" title="Agrega un producto que no aparece (Enter)"/>
    </div>
  </div>
</div>

<div id="avisos" style="margin-top:12px"></div>
<div id="kpis" class="grid-4" style="margin-top:14px"></div>

<div class="card" style="margin-top:14px">
  <h3 style="margin:0">Resultado por mes</h3>
  <div class="muted" style="font-size:12px">Venta − costo de MP de las cajas vendidas. <b>Teórico</b>: la versión vigente cuando se produjo el lote. <b>MP real</b>: lo que costó la MP de la orden. <b>MP corregida</b>: la MP producida en casa (sazonador) al costo de su lote. Dif = contribución − teórica.</div>
  <div class="table-wrap" style="margin-top:10px"><table id="tMes" class="tabla-resumen"></table></div>
</div>

<div class="card" style="margin-top:14px">
  <h3 style="margin:0">Por lote</h3>
  <div class="muted" style="font-size:12px">Orden que produjo cada lote vendido, su costo de MP por <span class="lblCaja">caja</span> y lo que queda. Inventario = producido − vendido de siempre (no solo del periodo), valuado a MP corregida.</div>
  <div class="table-wrap" style="margin-top:10px"><table id="tLotes" class="tabla-resumen"></table></div>
</div>`;

  const opts = MES.slice(1).map((m, i) => `<option value="${i + 1}">${m}</option>`).join('');
  $('mesIni').innerHTML = opts; $('mesFin').innerHTML = opts;
  $('anio').value = hoy.getFullYear(); $('mesIni').value = 1; $('mesFin').value = Math.max(1, hoy.getMonth());
  const periodo = () => ({ anio: parseInt($('anio').value, 10), mes_ini: parseInt($('mesIni').value, 10), mes_fin: parseInt($('mesFin').value, 10) });

  async function cargarProductos() {
    const p = periodo();
    if (p.mes_ini > p.mes_fin) return KoguApi.toast('El mes inicial no puede ser mayor que el final.', 'error');
    try {
      // Productos con producción cargada en el año; los que tienen teórico van preseleccionados.
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
      return `<button class="btn ${on ? 'primary' : 'ghost'}" data-pt="${esc(x.cve_pt)}" style="padding:4px 10px;font-size:12px">${esc(x.cve_pt)}${x.con_teorico ? ' <span title="Tiene teórico">✓</span>' : ''}</button>`;
    }).join('') : '<span class="muted" style="font-size:12px">Sin producción cargada en el año.</span>';
    $('productos').querySelectorAll('[data-pt]').forEach(btn => btn.addEventListener('click', () => {
      const k = btn.dataset.pt; if (seleccion.has(k)) seleccion.delete(k); else seleccion.add(k); pintaProductos();
    }));
  }

  function limpiar(msg) {
    $('kpis').innerHTML = ''; $('avisos').innerHTML = '';
    ['tMes', 'tLotes'].forEach(id => { $(id).innerHTML = `<tr><td class="muted" style="padding:16px">${esc(msg)}</td></tr>`; });
  }

  async function analizar() {
    if (!seleccion.size) return KoguApi.toast('Elige al menos un producto.', 'error');
    const p = { ...periodo(), cve_pt: [...seleccion].join(',') };
    $('btnAnalizar').disabled = true;
    try {
      D = KoguApi.unwrapData(await KoguApi.apiFetch(`${BASE}/vendido?${new URLSearchParams(p)}`));
      if (!D.resumen.length) return limpiar('No hay ventas calculadas de esos productos en el periodo (Costo → Cargas y Calcular).');
      pintaAvisos(); pintaKpis(); pintaMes(); pintaLotes();
    } catch (e) { KoguApi.toast(e.message, 'error'); }
    finally { $('btnAnalizar').disabled = false; }
  }

  const caja = 'caja';
  function pintaAvisos() {
    const av = [];
    if (D.sin_orden.renglones) av.push(`<b>${D.sin_orden.renglones}</b> venta(s) (${n0(D.sin_orden.cajas)} cajas, ${money(D.sin_orden.venta, 0)}) sin orden de producción para su lote: quedan fuera del resultado. Revisa que el PT de esos lotes esté cargado.`);
    if (D.correccion_incompleta) av.push(`<b>${D.correccion_incompleta}</b> lote(s) sin corrección conocida (su orden no tiene MP cargadas o la MP producida en casa no tiene su lote): la MP corregida usa la MP real en esos lotes.`);
    $('avisos').innerHTML = av.map(t => `<div class="card" style="border-left:4px solid var(--warn);padding:10px 14px;font-size:12.5px;margin-bottom:8px">${t}</div>`).join('');
  }

  function pintaKpis() {
    const t = D.resumen.find(x => x.mes === null && x.cve_pt === 'Total');
    const u = D.unidad;
    const card = (lbl, val, hint, style = '') => `<div class="card" style="padding:12px 14px"><div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.04em;font-weight:700">${lbl}</div>
      <div style="font-size:22px;font-weight:800;margin-top:2px;${style}">${val}</div><div class="muted" style="font-size:12px">${hint}</div></div>`;
    const dif = t.pct.mp_corr != null && t.pct.teorico != null ? t.pct.mp_corr - t.pct.teorico : null;
    $('kpis').innerHTML =
      card('Cajas vendidas', n0(t.cajas), `${u ? n0(t.unidades) + ' ' + esc(u) + 's · ' : ''}${t.kg == null ? '' : fmt(t.kg, 0) + ' kg'}`) +
      card('Venta', money(t.venta, 0), `${money(t.cajas ? t.venta / t.cajas : null)} por caja`) +
      card('Contribución MP corregida', pct(t.pct.mp_corr), `${money(t.contrib.mp_corr, 0)} · MP real ${pct(t.pct.mp)}`) +
      card('Contra el teórico', ptsTxt(dif), `teórico ${pct(t.pct.teorico)} · ${money(t.por_caja.teorico)} por caja`, difCls(dif));
  }

  function pintaMes() {
    const grupo = (t, sub, cls) => `<th colspan="3" class="grupo sep ${cls}">${t}<small>${sub}</small></th>`;
    const celdas = (x, k, cls, conDif) => {
      const dif = conDif && x.pct[k] != null && x.pct.teorico != null ? x.pct[k] - x.pct.teorico : null;
      return `<td class="num sep ${cls}">${money(x.por_caja[k])}</td><td class="num ${cls}">${money(x.contrib[k], 0)}</td>` +
        `<td class="num ${cls}">${pct(x.pct[k])}${conDif ? `<div style="font-size:11px;${difCls(dif)}">${ptsTxt(dif)}</div>` : ''}</td>`;
    };
    const fila = (x) => {
      const cls = x.mes === null ? (x.cve_pt === 'Total' ? 'acum' : '') : x.cve_pt === 'Total' ? 'total' : '';
      const etq = x.mes === null ? (x.cve_pt === 'Total' ? 'Acumulado' : `Acum · ${esc(x.cve_pt)}`) : x.cve_pt === 'Total' ? `${MES[x.mes]}-${String(x.anio).slice(2)} · Total` : `${MES[x.mes]}-${String(x.anio).slice(2)} · ${esc(x.cve_pt)}`;
      return `<tr class="${cls}"><td class="fija">${etq}</td><td class="num">${n0(x.cajas)}</td><td class="num">${x.kg == null ? '—' : fmt(x.kg, 0)}</td>
        <td class="num">${money(x.venta, 0)}</td><td class="num">${money(x.cajas ? x.venta / x.cajas : null)}</td>
        ${celdas(x, 'teorico', 'teo', false)}${celdas(x, 'mp', '', true)}${celdas(x, 'mp_corr', 'corr', true)}</tr>`;
    };
    $('tMes').innerHTML = `<thead><tr><th>Periodo · producto</th><th class="num">Cajas</th><th class="num">Kg</th><th class="num">Venta</th><th class="num">$ / caja</th>
      ${grupo('Teórico', 'versión vigente al producir', 'teo')}${grupo('MP real', 'de la orden', '')}${grupo('MP corregida', 'sazonador al costo de su lote', 'corr')}</tr>
      <tr><th></th><th></th><th></th><th></th><th></th>${['teo', '', 'corr'].map(cl => `<th class="num sep ${cl}">MP / caja</th><th class="num ${cl}">Contribución</th><th class="num ${cl}">%</th>`).join('')}</tr></thead>
      <tbody>${D.resumen.map(fila).join('')}</tbody>`;
  }

  function pintaLotes() {
    let invCajas = 0, invValor = 0;
    const filas = D.lotes.map(l => {
      const val = l.inventario != null && (l.mp_corr_caja ?? l.mp_caja) != null ? l.inventario * (l.mp_corr_caja ?? l.mp_caja) : null;
      if (val != null) { invCajas += l.inventario; invValor += val; }
      const difTeo = l.mp_corr_caja != null && l.teorico_caja != null ? l.teorico_caja - l.mp_corr_caja : null;
      return `<tr><td class="fija">${esc(l.no_ordp)}</td><td>${esc(l.fecha_orden || '—')}</td><td>${esc(l.cve_pt)}</td><td class="lote">${esc(l.lote)}</td>
        <td class="num sep">${n0(l.cajas_producidas)}</td><td class="num">${n0(l.cajas_vendidas_periodo)}</td><td class="num">${n0(l.cajas_vendidas_total)}</td>
        <td class="num" style="font-weight:700${l.inventario < 0 ? ';color:var(--danger)' : ''}">${n0(l.inventario)}</td>
        <td class="num sep teo">${money(l.teorico_caja)}</td><td class="num">${money(l.mp_caja)}</td>
        <td class="num" style="${l.correccion ? 'color:var(--warn);font-weight:600' : 'color:var(--muted)'}">${l.correccion == null ? '<span title="Sin corrección conocida">¿?</span>' : (l.correccion < -0.005 ? '+' : '') + money(-l.correccion || 0, 0)}</td>
        <td class="num corr" style="font-weight:700">${money(l.mp_corr_caja)}</td>
        <td class="num" style="${difTeo == null ? '' : Math.abs(difTeo) / l.teorico_caja > 0.10 ? 'color:var(--danger);font-weight:700' : Math.abs(difTeo) / l.teorico_caja > 0.03 ? 'color:var(--warn);font-weight:600' : 'color:var(--muted)'}">${money(difTeo)}</td>
        <td class="num sep">${money(val, 0)}</td></tr>`;
    }).join('');
    $('tLotes').innerHTML = `<thead><tr><th>Orden</th><th>Fecha</th><th>Producto</th><th>Lote</th>
      <th class="num sep">Producidas</th><th class="num">Vendidas periodo</th><th class="num">Vendidas total</th><th class="num">Inventario</th>
      <th class="num sep teo">Teórico / caja</th><th class="num">MP real / caja</th><th class="num" title="Lo que hay que sumar a la MP de la orden para llevar la MP producida en casa al costo de su lote (total de la orden). + = la MP real estaba subvaluada">Ajuste a la MP</th>
      <th class="num corr">MP corregida / caja</th><th class="num" title="Teórico − MP corregida">Dif / caja</th><th class="num sep">Inventario a MP corr.</th></tr></thead>
      <tbody>${filas}<tr class="total"><td class="fija">Total</td><td colspan="6"></td><td class="num">${n0(invCajas)}</td><td colspan="5"></td><td class="num sep">${money(invValor, 0)}</td></tr></tbody>`;
  }

  $('btnAnalizar').addEventListener('click', analizar);
  $('anio').addEventListener('change', cargarProductos);
  $('ptExtra').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const k = $('ptExtra').value.trim().toUpperCase(); if (!k) return;
    seleccion.add(k); $('ptExtra').value = ''; pintaProductos();
  });
  if (KoguShell.subscribeEmpresaActivaChange) KoguShell.subscribeEmpresaActivaChange(() => { seleccion = new Set(); D = null; cargarProductos(); });
  cargarProductos();
});

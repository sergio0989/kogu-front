// ============================================================
// produccion-teorico.js — Costo: Producción · Teórico vs real (solo lectura).
// Costo de MP por unidad PRODUCIDA contra el teórico del producto, a partir de
// los consumos cargados en Cargas → "Producciones — materias primas (MP)".
//   1) Resumen por mes y componente (formato de la hoja de costos: real · teórico · dif)
//   2) Por orden: dosis, $/kg y MP por PT; marca lo que se aleja de la mediana
//   3) MP producida en casa vs costo de MP de su lote (corrección del sazonador)
// Endpoint: GET /protected/cto/produccion-mp/{productos|analisis}
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/cto/produccion-teorico.html';
  const PERM = 'screen.costo';
  const BASE = '/protected/cto/produccion-mp';

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Producción · Teórico vs real',
    description: 'Costo de materia prima por unidad producida contra el teórico del producto.',
    requiredPermission: PERM,
  });
  if (!b) return;

  const $ = (id) => document.getElementById(id);
  const c = $('pageContent');
  const MES = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const fmt = (v, d = 2) => (v == null ? '—' : Number(v).toLocaleString('es-MX', { minimumFractionDigits: d, maximumFractionDigits: d }));
  const money = (v, d = 2) => (v == null ? '—' : (Number(v) < 0 ? '−$' + fmt(-v, d) : '$' + fmt(v, d)));
  const plural = (u) => (u ? u + (/[aeiou]$/i.test(u) ? 's' : 'es') : 'unidades');
  const warnDif = (v) => (v == null || Math.abs(v) < 0.005 ? '' : 'color:var(--warn);font-weight:700');
  const n0 = (v) => (v == null ? '—' : Number(v).toLocaleString('es-MX', { maximumFractionDigits: 0 }));
  const difCls = (v) => (v == null ? '' : v < -0.005 ? 'color:var(--danger);font-weight:700' : v > 0.005 ? 'color:#15803d' : '');

  const hoy = new Date();
  let productos = [], seleccion = new Set(), D = null;

  c.innerHTML = `
<div class="card">
  <div class="row" style="align-items:flex-end;gap:12px;flex-wrap:wrap">
    <div style="flex:1 1 320px"><div class="eyebrow">Costo · Producción</div><h2 style="margin:0">Teórico vs real</h2>
      <div class="muted" style="font-size:12px">Costo de MP por unidad producida (sin mano de obra ni gastos de fabricación). Sale de las MP cargadas por orden.</div></div>
    <div><label class="muted" style="font-size:12px;display:block">Año</label><input id="anio" type="number" class="input" style="width:100px"/></div>
    <div><label class="muted" style="font-size:12px;display:block">Mes inicial</label><select id="mesIni" class="select" style="min-width:110px"></select></div>
    <div><label class="muted" style="font-size:12px;display:block">Mes final</label><select id="mesFin" class="select" style="min-width:110px"></select></div>
    <button class="btn primary" id="btnAnalizar">Analizar</button>
  </div>
  <div style="margin-top:14px">
    <div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.04em;font-weight:700">Productos con MP en el periodo</div>
    <div id="productos" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px"><span class="muted" style="font-size:12px">—</span></div>
  </div>
</div>

<div id="kpis" class="grid-4" style="margin-top:14px"></div>

<div class="card" style="margin-top:14px">
  <h3 style="margin:0">Resumen por mes y componente</h3>
  <div class="muted" style="font-size:12px">$ por <span class="lblUnidad">unidad</span>: real · teórico · diferencia (teórico − real; negativo = real arriba del teórico). Debajo, gramos por <span class="lblUnidad">unidad</span> real / teórico.</div>
  <div class="table-wrap" style="margin-top:10px"><table id="tResumen" style="font-variant-numeric:tabular-nums;font-size:12.5px"></table></div>
</div>

<div class="card" style="margin-top:14px">
  <h3 style="margin:0">Por orden</h3>
  <div class="muted" style="font-size:12px">Dosis y costo de cada orden. En rojo, lo que se aleja más de 15% de la mediana del periodo (con 3 órdenes o más).</div>
  <div class="table-wrap" style="margin-top:10px"><table id="tOrdenes" style="font-variant-numeric:tabular-nums;font-size:12.5px"></table></div>
</div>

<div class="card" style="margin-top:14px">
  <div class="row"><div><h3 style="margin:0">MP producida en casa vs costo de su lote</h3>
    <div class="muted" style="font-size:12px">Costo con el que salió la MP en la orden contra el costo de MP de la orden que produjo ese lote. La diferencia es lo que habría que corregir.</div></div>
    <div id="lotesTotal" style="font-size:14px;font-weight:700"></div></div>
  <div class="table-wrap" style="margin-top:10px"><table id="tLotes" style="font-variant-numeric:tabular-nums;font-size:12.5px"></table></div>
</div>`;

  // ── Filtros ──
  const opts = MES.slice(1).map((m, i) => `<option value="${i + 1}">${m}</option>`).join('');
  $('mesIni').innerHTML = opts; $('mesFin').innerHTML = opts;
  $('anio').value = hoy.getFullYear(); $('mesIni').value = 1; $('mesFin').value = Math.max(1, hoy.getMonth());

  const periodo = () => ({ anio: parseInt($('anio').value, 10), mes_ini: parseInt($('mesIni').value, 10), mes_fin: parseInt($('mesFin').value, 10) });

  async function cargarProductos() {
    const p = periodo();
    if (p.mes_ini > p.mes_fin) return KoguApi.toast('El mes inicial no puede ser mayor que el final.', 'error');
    try {
      const r = await KoguApi.apiFetch(`${BASE}/productos?${new URLSearchParams(p)}`);
      productos = KoguApi.unwrapData(r) || [];
      const conTeo = productos.filter(x => x.con_teorico).map(x => x.cve_pt);
      seleccion = new Set(conTeo.length ? conTeo : productos.slice(0, 1).map(x => x.cve_pt));
      pintaProductos();
      if (seleccion.size) await analizar(); else limpiar('No hay MP cargadas en el periodo.');
    } catch (e) { KoguApi.toast(e.message, 'error'); }
  }

  function pintaProductos() {
    if (!productos.length) { $('productos').innerHTML = '<span class="muted" style="font-size:12px">Sin MP cargadas en el periodo. Cárgalas en Costo → Cargas.</span>'; return; }
    $('productos').innerHTML = productos.map(x => {
      const on = seleccion.has(x.cve_pt);
      return `<button class="btn ${on ? 'primary' : 'ghost'}" data-pt="${esc(x.cve_pt)}" style="padding:4px 10px;font-size:12px">
        ${esc(x.cve_pt)} <span style="opacity:.7">· ${x.ordenes} ord</span>${x.con_teorico ? ' <span title="Tiene teórico">✓</span>' : ''}</button>`;
    }).join('');
    $('productos').querySelectorAll('[data-pt]').forEach(btn => btn.addEventListener('click', () => {
      const k = btn.dataset.pt;
      if (seleccion.has(k)) seleccion.delete(k); else seleccion.add(k);
      pintaProductos();
    }));
  }

  function limpiar(msg) {
    $('kpis').innerHTML = '';
    ['tResumen', 'tOrdenes', 'tLotes'].forEach(id => { $(id).innerHTML = `<tr><td class="muted" style="padding:16px">${esc(msg)}</td></tr>`; });
    $('lotesTotal').textContent = '';
  }

  async function analizar() {
    if (!seleccion.size) return KoguApi.toast('Elige al menos un producto.', 'error');
    const p = { ...periodo(), cve_pt: [...seleccion].join(',') };
    $('btnAnalizar').disabled = true;
    try {
      const r = await KoguApi.apiFetch(`${BASE}/analisis?${new URLSearchParams(p)}`);
      D = KoguApi.unwrapData(r);
      document.querySelectorAll('.lblUnidad').forEach(el => { el.textContent = D.unidad || 'unidad'; });
      pintaKpis(); pintaResumen(); pintaOrdenes(); pintaLotes();
    } catch (e) { KoguApi.toast(e.message, 'error'); }
    finally { $('btnAnalizar').disabled = false; }
  }

  // ── KPIs del periodo (ponderados por unidades) ──
  function pintaKpis() {
    const tot = D.resumen.filter(f => f.componente === 'Total MP');
    if (!tot.length) return limpiar('Sin consumos para los productos elegidos.');
    const uni = tot.reduce((s, f) => s + f.unidades, 0);
    const real = tot.reduce((s, f) => s + f.real_por_unidad * f.unidades, 0) / uni;
    const conTeo = tot.filter(f => f.teo_por_unidad != null);
    const teo = conTeo.length ? conTeo.reduce((s, f) => s + f.teo_por_unidad * f.unidades, 0) / conTeo.reduce((s, f) => s + f.unidades, 0) : null;
    const conAlerta = D.ordenes.filter(o => o.alertas.length).length;
    const u = D.unidad || 'unidad';
    const kpi = (label, value, hint, style = '') => `<div class="kpi"><div class="label">${label}</div><div class="value" style="${style}">${value}</div><div class="hint">${hint}</div></div>`;
    $('kpis').innerHTML = [
      kpi(`MP real por ${esc(u)}`, money(real), `${n0(uni)} ${esc(plural(D.unidad))} producidos`),
      kpi(`Teórico por ${esc(u)}`, money(teo), teo == null ? 'Sin teórico para estos productos' : 'Costo de MP teórico'),
      kpi('Diferencia', teo == null ? '—' : money(teo - real), 'Teórico − real (negativo = real arriba)', difCls(teo == null ? null : teo - real)),
      kpi('Órdenes a revisar', `${conAlerta} de ${D.ordenes.length}`, 'Fuera de ±15% de la mediana', conAlerta ? 'color:var(--warn)' : ''),
    ].join('');
  }

  // ── Resumen: componentes × meses ──
  function pintaResumen() {
    const meses = [...new Map(D.resumen.map(f => [f.anio * 100 + f.mes, f])).values()];
    const comps = [...new Set(D.resumen.map(f => f.componente))];
    const celda = (comp, m) => D.resumen.find(f => f.componente === comp && f.anio === m.anio && f.mes === m.mes);
    const head = `<thead><tr><th rowspan="2" style="text-align:left">Componente</th>
      ${meses.map(m => `<th colspan="3" style="text-align:center;border-left:1px solid var(--line)">${MES[m.mes]}-${String(m.anio).slice(2)}<div class="muted" style="font-weight:400;font-size:11px">${n0(m.unidades)} ${esc(plural(D.unidad))}</div></th>`).join('')}</tr>
      <tr>${meses.map(() => '<th style="border-left:1px solid var(--line)">Real</th><th>Teórico</th><th>Dif</th>').join('')}</tr></thead>`;
    const body = comps.map(comp => {
      const tot = comp === 'Total MP';
      return `<tr style="${tot ? 'font-weight:700;background:var(--panel-2,#f8fafc)' : ''}"><td style="text-align:left">${esc(comp)}</td>
        ${meses.map(m => {
          const f = celda(comp, m);
          if (!f) return '<td style="border-left:1px solid var(--line)">—</td><td></td><td></td>';
          const g = f.g_por_unidad_real != null ? `<div class="muted" style="font-size:11px">${fmt(f.g_por_unidad_real, 1)} g${f.g_por_unidad_teo != null ? ' / ' + fmt(f.g_por_unidad_teo, 1) + ' g' : ''}</div>` : '';
          return `<td style="text-align:right;border-left:1px solid var(--line)">${money(f.real_por_unidad)}${g}</td>
            <td style="text-align:right">${money(f.teo_por_unidad)}</td>
            <td style="text-align:right;${difCls(f.dif)}">${f.dif == null ? '—' : fmt(f.dif)}</td>`;
        }).join('')}</tr>`;
    }).join('');
    $('tResumen').innerHTML = head + `<tbody>${body}</tbody>`;
  }

  // ── Por orden ──
  function pintaOrdenes() {
    if (!D.ordenes.length) { $('tOrdenes').innerHTML = '<tr><td class="muted" style="padding:16px">Sin órdenes.</td></tr>'; return; }
    // Mismo orden que el resumen (orden del teórico).
    const enOrdenes = new Set(D.ordenes.flatMap(o => Object.entries(o.componentes).filter(([, v]) => v.con_teorico).map(([k]) => k)));
    const comps = [...new Set(D.resumen.map(f => f.componente))].filter(k => enOrdenes.has(k));
    const u = D.unidad || 'unidad';
    const alerta = (o, et) => o.alertas.includes(et) ? 'color:var(--danger);font-weight:700;background:var(--danger-bg)' : '';
    const head = `<thead><tr><th style="text-align:left">Orden</th><th style="text-align:left">Fecha</th><th style="text-align:left">Producto</th><th>Cantidad PT</th>
      ${comps.map(k => `<th>${esc(k)}<div class="muted" style="font-weight:400;font-size:11px">dosis · $/kg</div></th>`).join('')}
      <th>MP por PT</th><th style="text-align:left">Revisar</th></tr></thead>`;
    const body = D.ordenes.map(o => `<tr>
      <td style="text-align:left">${esc(o.no_ordp)}</td><td style="text-align:left">${esc(o.fecha || '—')}</td><td style="text-align:left">${esc(o.cve_pt)}</td>
      <td style="text-align:right">${n0(o.cantidad_pt)}</td>
      ${comps.map(k => {
        const v = o.componentes[k];
        if (!v) return '<td style="text-align:right">—</td>';
        const dosis = v.g_por_unidad != null ? fmt(v.g_por_unidad, 1) + ' g' : (v.kg_por_pt != null ? fmt(v.kg_por_pt, 2) + '/PT' : '—');
        return `<td style="text-align:right"><span style="${alerta(o, `${k} g/unidad`)}">${dosis}</span>
          · <span style="${alerta(o, `${k} $/kg`)}">${money(v.costo_kg)}</span></td>`;
      }).join('')}
      <td style="text-align:right;${alerta(o, 'MP por PT')}">${money(o.mp_por_pt)}</td>
      <td style="text-align:left">${o.alertas.length ? o.alertas.map(a => `<span class="badge warn" style="margin:1px">${esc(a)}</span>`).join('') : '<span class="muted">—</span>'}</td>
    </tr>`).join('');
    $('tOrdenes').innerHTML = head + `<tbody>${body}</tbody>`;
  }

  // ── Lotes ──
  function pintaLotes() {
    if (!D.lotes.length) {
      $('tLotes').innerHTML = '<tr><td class="muted" style="padding:16px">Ninguna MP de estos productos se produce en casa (o su producción no está cargada).</td></tr>';
      $('lotesTotal').textContent = ''; return;
    }
    const abs = D.lotes.reduce((s, l) => s + Math.abs(l.dif || 0), 0);
    $('lotesTotal').innerHTML = `Neto: ${money(D.lotes_total_dif)} <span class="muted" style="font-weight:400;font-size:12px">· a corregir (suma absoluta): ${money(abs)}</span>`;
    const head = `<thead><tr><th style="text-align:left">Orden</th><th style="text-align:left">Fecha</th><th style="text-align:left">Producto</th><th style="text-align:left">MP</th><th style="text-align:left">Lote</th>
      <th>kg</th><th>$/kg en la orden</th><th>$/kg del lote</th><th style="text-align:left">Produjo</th><th>Diferencia</th></tr></thead>`;
    const body = D.lotes.map(l => `<tr>
      <td style="text-align:left">${esc(l.no_ordp)}</td><td style="text-align:left">${esc(l.fecha || '—')}</td><td style="text-align:left">${esc(l.cve_pt)}</td>
      <td style="text-align:left">${esc(l.cve_mp)}</td><td style="text-align:left">${esc(l.lote || '—')}</td>
      <td style="text-align:right">${fmt(l.kg, 2)}</td><td style="text-align:right">${money(l.costo_kg_capturado, 4)}</td>
      <td style="text-align:right">${l.costo_lote_kg == null ? '<span class="badge neutral" title="Carga el PT y las MP de la orden que produjo el lote">sin MP del lote</span>' : money(l.costo_lote_kg, 4)}</td>
      <td style="text-align:left">${esc(l.orden_produccion || '—')}</td>
      <td style="text-align:right;${warnDif(l.dif)}">${money(l.dif)}</td>
    </tr>`).join('');
    $('tLotes').innerHTML = head + `<tbody>${body}</tbody>`;
  }

  $('btnAnalizar').addEventListener('click', analizar);
  ['anio', 'mesIni', 'mesFin'].forEach(id => $(id).addEventListener('change', cargarProductos));
  KoguShell.subscribeEmpresaActivaChange(() => { D = null; productos = []; seleccion.clear(); cargarProductos(); });

  limpiar('Elige el periodo y los productos.');
  cargarProductos();
});

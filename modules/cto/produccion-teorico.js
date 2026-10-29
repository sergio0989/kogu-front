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
  // Diferencia = teórico − real. Se pinta por distancia a 0 en cualquier sentido:
  // un teórico arriba del real no es ahorro, es un teórico que no representa la realidad.
  const difCls = (v, base) => {
    if (v == null) return '';
    const rel = base ? Math.abs(v) / Math.abs(base) : Math.abs(v);
    return rel > 0.10 ? 'color:var(--danger);font-weight:700' : rel > 0.03 ? 'color:var(--warn);font-weight:600' : 'color:var(--muted)';
  };

  const hoy = new Date();
  let productos = [], seleccion = new Set(), D = null, verTodosLotes = false;

  if (!document.getElementById('estiloProdTeo')) {
    const st = document.createElement('style'); st.id = 'estiloProdTeo';
    st.textContent = `
      /* styles.css fija .table-wrap table{table-layout:fixed} y corta palabras: aquí la tabla toma su ancho natural y se desplaza */
      .table-wrap table.tabla-resumen{table-layout:auto;width:max-content;min-width:100%;font-variant-numeric:tabular-nums;font-size:12.5px}
      .table-wrap .tabla-resumen th,.table-wrap .tabla-resumen td{word-break:normal;overflow-wrap:normal;white-space:nowrap;padding:7px 10px}
      .tabla-resumen th{font-size:11.5px}
      .tabla-resumen .num{text-align:right}
      .tabla-resumen .sep{border-left:2px solid var(--line)}
      .tabla-resumen .teo{background:#f8fafc}
      .tabla-resumen .acum{background:#f0f9ff}
      .tabla-resumen tr.total td{font-weight:700;border-top:2px solid var(--line);background:#f8fafc}
      .tabla-resumen td.comp{font-weight:600;position:sticky;left:0;background:#fff;z-index:1}
      .tabla-resumen tr.total td.comp{background:#f8fafc}
      .table-wrap .tabla-resumen td.claves{white-space:normal;min-width:170px;max-width:240px;line-height:1.9}
      .tabla-resumen .clave{display:inline-block;white-space:nowrap;font-size:11px;padding:1px 6px;margin:1px 2px 1px 0;border-radius:6px;background:#eef2f7;color:var(--text);font-weight:600}
      .tabla-resumen .clave.sin{background:transparent;border:1px dashed #cbd5e1;color:#94a3b8;font-weight:400}
            .tabla-resumen .grupo{text-align:center;font-size:12px}
      .tabla-resumen .grupo small{display:block;font-weight:400;color:var(--muted);font-size:11px}`;
    document.head.appendChild(st);
  }

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
  <div class="row" style="align-items:flex-start">
    <div><h3 style="margin:0">Resumen por mes y componente</h3>
      <div class="muted" style="font-size:12px">Costo de MP por <span class="lblUnidad">unidad</span> producida. A la izquierda el teórico; por mes el gasto, el real por <span class="lblUnidad">unidad</span> y la diferencia (teórico − real). Lejos de 0 en cualquier sentido = el teórico no representa la realidad.</div></div>
  </div>
  <div id="ptIncluidos" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px"></div>
  <div class="table-wrap" style="margin-top:10px"><table id="tResumen" class="tabla-resumen"></table></div>
  <h4 style="margin:16px 0 4px">Gramos por <span class="lblUnidad">unidad</span></h4>
  <div class="muted" style="font-size:12px">Solo componentes que se pesan. Diferencia = teórico − real.</div>
  <div class="table-wrap" style="margin-top:8px"><table id="tGramos" class="tabla-resumen"></table></div>
</div>

<div class="card" style="margin-top:14px">
  <h3 style="margin:0">Por orden</h3>
  <div class="muted" style="font-size:12px">Dosis y costo de cada orden. En rojo, lo que se aleja más de 15% de la mediana del periodo (con 3 órdenes o más).</div>
  <div class="table-wrap" style="margin-top:10px"><table id="tOrdenes" style="font-variant-numeric:tabular-nums;font-size:12.5px"></table></div>
</div>

<div class="card" style="margin-top:14px">
  <div class="row"><div><h3 style="margin:0">MP producida en casa vs costo de su lote</h3>
    <div class="muted" style="font-size:12px">Costo con el que salió la MP en la orden contra el costo de MP de la orden que produjo ese lote. La diferencia es lo que habría que corregir.</div></div>
    <div style="text-align:right"><div id="lotesTotal" style="font-size:14px;font-weight:700"></div><div id="lotesToggle" style="margin-top:6px"></div></div></div>
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
    $('ptIncluidos').innerHTML = '';
    ['tResumen', 'tGramos', 'tOrdenes', 'tLotes'].forEach(id => { $(id).innerHTML = `<tr><td class="muted" style="padding:16px">${esc(msg)}</td></tr>`; });
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
      kpi('Diferencia', teo == null ? '—' : money(teo - real), 'Teórico − real · control: lo sano es cerca de 0', difCls(teo == null ? null : teo - real, teo)),
      kpi('Órdenes a revisar', `${conAlerta} de ${D.ordenes.length}`, 'Fuera de ±15% de la mediana', conAlerta ? 'color:var(--warn)' : ''),
    ].join('');
  }

  // ── Resumen: teórico a la izquierda; por mes gasto · real · dif; acumulado ──
  function pintaResumen() {
    const u = D.unidad || 'unidad';
    const meses = [...new Map(D.resumen.map(f => [f.anio * 100 + f.mes, { anio: f.anio, mes: f.mes, unidades: f.unidades }])).values()];
    const fila = (comp, m) => D.resumen.find(f => f.componente === comp && f.anio === m.anio && f.mes === m.mes);
    const comps = [...(D.componentes || []).map(c => c.componente), 'Total MP'];
    const meta = Object.fromEntries((D.componentes || []).map(c => [c.componente, c]));
    const uniTot = meses.reduce((s, m) => s + m.unidades, 0);

    $('ptIncluidos').innerHTML = (D.productos_periodo || []).map(p =>
      `<span class="badge neutral" style="font-size:11.5px"><b>${esc(p.cve_pt)}</b> · ${p.ordenes} ord · ${n0(p.cantidad_pt)} PT</span>`).join('');

    // Acumulado ponderado por unidades.
    const acum = (comp) => {
      const fs = meses.map(m => fila(comp, m)).filter(Boolean);
      if (!fs.length) return null;
      const costo = fs.reduce((s, f) => s + (f.costo || 0), 0);
      const uni = fs.reduce((s, f) => s + f.unidades, 0);
      const conTeo = fs.filter(f => f.teo_por_unidad != null);
      const uT = conTeo.reduce((s, f) => s + f.unidades, 0);
      const teo = uT ? conTeo.reduce((s, f) => s + f.teo_por_unidad * f.unidades, 0) / uT : null;
      const conG = fs.filter(f => f.g_por_unidad_real != null);
      const uG = conG.reduce((s, f) => s + f.unidades, 0);
      return {
        costo, real: costo / uni, teo, dif: teo == null ? null : teo - costo / uni,
        g: uG ? conG.reduce((s, f) => s + f.g_por_unidad_real * f.unidades, 0) / uG : null,
        gTeo: conG.length ? conG[0].g_por_unidad_teo : null,
      };
    };

    const clavesHtml = (comp) => {
      const m = meta[comp]; if (!m) return '';
      const cons = new Set(m.claves_consumidas || []);
      const teo = m.claves_teorico || [];
      const todas = [...new Set([...teo, ...cons])];
      return todas.map(k => cons.has(k) ? `<span class="clave">${esc(k)}</span>` : `<span class="clave sin" title="En el teórico, sin consumo en el periodo">${esc(k)}</span>`).join('');
    };

    const head = `<thead>
      <tr>
        <th rowspan="2" style="text-align:left">Componente</th>
        <th rowspan="2" style="text-align:left">Claves MP</th>
        <th colspan="4" class="grupo teo sep">Teórico<small>por ${esc(u)}</small></th>
        ${meses.map(m => `<th colspan="3" class="grupo sep">${MES[m.mes]}-${String(m.anio).slice(2)}<small>${n0(m.unidades)} ${esc(plural(D.unidad))}</small></th>`).join('')}
        ${meses.length > 1 ? `<th colspan="3" class="grupo sep acum">Acumulado<small>${n0(uniTot)} ${esc(plural(D.unidad))}</small></th>` : ''}
      </tr>
      <tr>
        <th class="num teo sep">Kg</th><th class="num teo">$/kg</th><th class="num teo">Merma</th><th class="num teo">$/${esc(u)}</th>
        ${meses.map(() => '<th class="num sep">Gasto</th><th class="num">Real</th><th class="num">Dif</th>').join('')}
        ${meses.length > 1 ? '<th class="num sep acum">Gasto</th><th class="num acum">Real</th><th class="num acum">Dif</th>' : ''}
      </tr></thead>`;

    const body = comps.map(comp => {
      const tot = comp === 'Total MP';
      const t = meta[comp]?.teo || null;
      const teoTot = tot ? (meses.map(m => fila(comp, m)).find(f => f && f.teo_por_unidad != null)?.teo_por_unidad ?? null) : null;
      const a = meses.length > 1 ? acum(comp) : null;
      return `<tr class="${tot ? 'total' : ''}">
        <td class="comp">${esc(comp)}</td>
        <td class="claves">${tot ? '' : clavesHtml(comp)}</td>
        <td class="num teo sep">${t?.kg_por_unidad != null ? fmt(t.kg_por_unidad, 3) : ''}</td>
        <td class="num teo">${t?.costo_kg != null ? money(t.costo_kg) : ''}</td>
        <td class="num teo">${t?.merma != null ? fmt(t.merma * 100, 0) + '%' : ''}</td>
        <td class="num teo" style="font-weight:700">${tot ? money(teoTot) : (t ? money(t.costo_por_unidad) : '—')}</td>
        ${meses.map(m => {
          const f = fila(comp, m);
          if (!f) return '<td class="num sep">—</td><td></td><td></td>';
          return `<td class="num sep">${money(f.costo, 0)}</td><td class="num">${money(f.real_por_unidad)}</td>
            <td class="num" style="${difCls(f.dif, f.teo_por_unidad)}">${f.dif == null ? '—' : money(f.dif)}</td>`;
        }).join('')}
        ${a ? `<td class="num sep acum">${money(a.costo, 0)}</td><td class="num acum">${money(a.real)}</td>
          <td class="num acum" style="${difCls(a.dif, a.teo)}">${a.dif == null ? '—' : money(a.dif)}</td>` : (meses.length > 1 ? '<td class="sep acum"></td><td class="acum"></td><td class="acum"></td>' : '')}
      </tr>`;
    }).join('');
    $('tResumen').innerHTML = head + `<tbody>${body}</tbody>`;

    // Gramos por unidad (solo componentes con kg teórico).
    const pesados = (D.componentes || []).filter(c => c.teo && c.teo.kg_por_unidad != null).map(c => c.componente);
    if (!pesados.length) { $('tGramos').innerHTML = '<tr><td class="muted" style="padding:12px">Sin componentes con gramos teóricos.</td></tr>'; return; }
    const gHead = `<thead><tr><th style="text-align:left">Componente</th><th class="num teo sep">Teórico</th>
      ${meses.map(m => `<th colspan="2" class="grupo sep">${MES[m.mes]}-${String(m.anio).slice(2)}</th>`).join('')}
      ${meses.length > 1 ? '<th colspan="2" class="grupo sep acum">Acumulado</th>' : ''}</tr>
      <tr><th></th><th class="num teo sep">g</th>${meses.map(() => '<th class="num sep">Real g</th><th class="num">Dif g</th>').join('')}
      ${meses.length > 1 ? '<th class="num sep acum">Real g</th><th class="num acum">Dif g</th>' : ''}</tr></thead>`;
    const gBody = pesados.map(comp => {
      const gTeo = meta[comp].teo.kg_por_unidad * 1000;
      const a = meses.length > 1 ? acum(comp) : null;
      return `<tr><td class="comp">${esc(comp)}</td><td class="num teo sep">${fmt(gTeo, 1)}</td>
        ${meses.map(m => {
          const f = fila(comp, m);
          if (!f || f.g_por_unidad_real == null) return '<td class="num sep">—</td><td></td>';
          const d = gTeo - f.g_por_unidad_real;
          return `<td class="num sep">${fmt(f.g_por_unidad_real, 1)}</td><td class="num" style="${difCls(d, gTeo)}">${fmt(d, 1)}</td>`;
        }).join('')}
        ${a && a.g != null ? `<td class="num sep acum">${fmt(a.g, 1)}</td><td class="num acum" style="${difCls(gTeo - a.g, gTeo)}">${fmt(gTeo - a.g, 1)}</td>` : (meses.length > 1 ? '<td class="sep acum"></td><td class="acum"></td>' : '')}
      </tr>`;
    }).join('');
    $('tGramos').innerHTML = gHead + `<tbody>${gBody}</tbody>`;
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
    const conDif = D.lotes.filter(l => l.dif == null || Math.abs(l.dif) >= 0.5);
    const filas = verTodosLotes ? D.lotes : conDif;
    const ocultos = D.lotes.length - conDif.length;
    $('lotesToggle').innerHTML = ocultos
      ? `<button class="btn ghost" id="btnLotes" style="padding:3px 10px;font-size:12px">${verTodosLotes ? 'Solo con diferencia' : `Ver todos (${ocultos} sin diferencia)`}</button>`
      : '';
    if ($('btnLotes')) $('btnLotes').onclick = () => { verTodosLotes = !verTodosLotes; pintaLotes(); };
    const head = `<thead><tr><th style="text-align:left">Orden</th><th style="text-align:left">Fecha</th><th style="text-align:left">Producto</th><th style="text-align:left">MP</th><th style="text-align:left">Lote</th>
      <th>kg</th><th>$/kg en la orden</th><th>$/kg del lote</th><th style="text-align:left">Produjo</th><th>Diferencia</th></tr></thead>`;
    const body = (filas.length ? filas : []).map(l => `<tr>
      <td style="text-align:left">${esc(l.no_ordp)}</td><td style="text-align:left">${esc(l.fecha || '—')}</td><td style="text-align:left">${esc(l.cve_pt)}</td>
      <td style="text-align:left">${esc(l.cve_mp)}</td><td style="text-align:left">${esc(l.lote || '—')}</td>
      <td style="text-align:right">${fmt(l.kg, 2)}</td><td style="text-align:right">${money(l.costo_kg_capturado, 4)}</td>
      <td style="text-align:right">${l.costo_lote_kg == null ? '<span class="badge neutral" title="Carga el PT y las MP de la orden que produjo el lote">sin MP del lote</span>' : money(l.costo_lote_kg, 4)}</td>
      <td style="text-align:left">${esc(l.orden_produccion || '—')}</td>
      <td style="text-align:right;${warnDif(l.dif)}">${money(l.dif)}</td>
    </tr>`).join('');
    $('tLotes').innerHTML = head + `<tbody>${body || '<tr><td colspan="10" class="muted" style="padding:12px">Todas las salidas coinciden con el costo de su lote.</td></tr>'}</tbody>`;
  }

  $('btnAnalizar').addEventListener('click', analizar);
  ['anio', 'mesIni', 'mesFin'].forEach(id => $(id).addEventListener('change', cargarProductos));
  KoguShell.subscribeEmpresaActivaChange(() => { D = null; productos = []; seleccion.clear(); cargarProductos(); });

  limpiar('Elige el periodo y los productos.');
  cargarProductos();
});

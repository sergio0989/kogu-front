// ============================================================
// produccion-teorico.js — Costo: Producción · Teórico vs real (solo lectura).
// Costo de MP por unidad PRODUCIDA contra el teórico del producto, a partir de
// los consumos cargados en Cargas → "Producciones — materias primas (MP)".
//   1) Resumen por mes y componente (formato de la hoja de costos: real · teórico · dif)
//   2) Por orden: dosis, $/kg y MP por PT; marca lo que se aleja de la mediana
//   3) MP producida en casa vs costo de MP de su lote (corrección del sazonador)
//   4) Editor del teórico por producto, con versiones "vigente desde": cada orden se
//      compara contra la versión vigente en su fecha (un cambio no reescribe meses pasados)
// Endpoints: GET /protected/cto/produccion-mp/{productos|analisis}
//            GET|PUT /protected/cto/produccion-mp/teorico/:cvePt (guardar: cto.import)
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
      .tabla-resumen thead tr:first-child th:first-child{position:sticky;left:0;z-index:2;background:#f8fafc;box-shadow:2px 0 0 var(--line)}
      .tabla-resumen td.comp{box-shadow:2px 0 0 var(--line)}
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
    <button class="btn ghost" id="btnTeorico" title="Capturar o cambiar el teórico de un producto">✎ Teórico</button>
  </div>
  <div style="margin-top:14px">
    <div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.04em;font-weight:700">Productos con MP en el periodo</div>
    <div id="productos" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px"><span class="muted" style="font-size:12px">—</span></div>
  </div>
</div>

<div id="cardTeo" class="card" style="margin-top:14px;display:none;border-left:4px solid var(--primary, #2563eb)">
  <div class="row" style="align-items:flex-start;gap:12px;flex-wrap:wrap">
    <div style="flex:1 1 300px"><h3 style="margin:0">Teórico del producto</h3>
      <div class="muted" style="font-size:12px">Por <b>unidad de presentación</b> (sobre). Gramos y merma como se capturan en la hoja de costos; el $ por unidad se calcula si lo dejas vacío (g × $/kg × (1 + merma)).
        Cada orden se compara contra la versión vigente en su fecha: <b>una fecha nueva no cambia los meses anteriores</b>.</div></div>
    <button class="btn ghost" id="teoCerrar" style="padding:4px 10px">✕</button>
  </div>
  <div class="row" style="align-items:flex-end;gap:12px;flex-wrap:wrap;margin-top:12px">
    <div><label class="muted" style="font-size:12px;display:block">Producto</label><input id="teoPt" class="input" list="teoPtList" style="width:140px;text-transform:uppercase" placeholder="GPT0030"/><datalist id="teoPtList"></datalist></div>
    <div><label class="muted" style="font-size:12px;display:block">Versión</label><select id="teoVersion" class="select" style="min-width:190px"></select></div>
    <div><label class="muted" style="font-size:12px;display:block">Vigente desde</label><input id="teoVig" type="date" class="input" style="width:150px"/></div>
    <div><label class="muted" style="font-size:12px;display:block">Unidad</label><input id="teoUnidad" class="input" style="width:90px" placeholder="sobre"/></div>
    <div><label class="muted" style="font-size:12px;display:block">Unidades por PT</label><input id="teoUpp" type="number" step="any" min="0" class="input" style="width:100px" placeholder="24"/></div>
  </div>
  <div id="teoAvisoVig" style="font-size:12px;margin-top:8px"></div>
  <div class="table-wrap" style="margin-top:10px"><table id="tTeo" class="tabla-resumen"></table></div>
  <div class="row" style="justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-top:10px">
    <button class="btn ghost" id="teoAdd" style="padding:4px 10px">＋ Componente</button>
    <div id="teoTotales" style="font-size:13px"></div>
  </div>
  <div id="teoOtros" style="margin-top:10px;font-size:12px"></div>
  <div class="row" style="justify-content:flex-end;gap:8px;margin-top:12px">
    <button class="btn primary" id="teoGuardar">Guardar teórico</button>
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
  <h3 style="margin:0">Cantidad producida y rendimiento</h3>
  <div class="muted" style="font-size:12px">Kg producidos = cantidad de PT × kg netos por unidad del catálogo de productos (sin empaque). Rendimiento = kg producidos ÷ kg de MP que entran al producto (con teórico: los componentes marcados; sin teórico: solo renglones en kg, nunca piezas).</div>
  <div id="rendAviso" style="margin-top:8px"></div>
  <div class="table-wrap" style="margin-top:10px"><table id="tRend" class="tabla-resumen"></table></div>
</div>

<div class="card" style="margin-top:14px">
  <h3 style="margin:0">Por orden</h3>
  <div class="muted" style="font-size:12px">Dosis, costo y rendimiento de cada orden. En rojo, lo que se aleja de la mediana del periodo (±15%; rendimiento ±5%; con 3 órdenes o más).</div>
  <div class="table-wrap" style="margin-top:10px"><table id="tOrdenes" style="font-variant-numeric:tabular-nums;font-size:12.5px"></table></div>
</div>

<div class="card" style="margin-top:14px">
  <div class="row"><div><h3 style="margin:0">MP producida en casa vs costo de su lote</h3>
    <div class="muted" style="font-size:12px">Costo con el que salió la MP en la orden contra el costo de MP de la orden que produjo ese lote. La diferencia es lo que habría que corregir.</div></div>
    <div style="text-align:right"><div id="lotesTotal" style="font-size:14px;font-weight:700"></div><div id="lotesToggle" style="margin-top:6px"></div></div></div>
  <div class="table-wrap" style="margin-top:10px"><table id="tLotes" style="font-variant-numeric:tabular-nums;font-size:12.5px"></table></div>
</div>`;

  // ── Editor del teórico ──
  let teo = { cve: null, versiones: [], filas: [] };
  const numOrNull = (v) => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v));
  const r4 = (v) => (v == null ? '' : String(Math.round(v * 1e4) / 1e4));
  const filaVacia = () => ({ componente: '', claves: '', g: '', costo_kg: '', merma_pct: '', cpu: '', entra_peso: false });
  const aFila = (c) => ({
    componente: c.componente, claves: (c.claves_mp || []).join(', '),
    g: c.kg_por_unidad == null ? '' : r4(c.kg_por_unidad * 1000),
    costo_kg: c.costo_kg == null ? '' : r4(c.costo_kg),
    merma_pct: c.merma == null ? '' : r4(c.merma * 100),
    cpu: c.costo_por_unidad == null ? '' : r4(c.costo_por_unidad),
    entra_peso: !!c.entra_peso,
  });
  const cpuCalc = (f) => {
    const g = numOrNull(f.g), ck = numOrNull(f.costo_kg);
    return g == null || ck == null ? null : (g / 1000) * ck * (1 + (numOrNull(f.merma_pct) || 0) / 100);
  };

  async function abrirTeorico(cve) {
    $('cardTeo').style.display = '';
    $('teoPtList').innerHTML = productos.map(x => `<option value="${esc(x.cve_pt)}">`).join('');
    const pt = (cve || [...seleccion][0] || productos[0]?.cve_pt || '').toUpperCase();
    $('teoPt').value = pt;
    if (pt) await cargarTeorico(pt); else pintaTeo();
    $('cardTeo').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function cargarTeorico(cve) {
    try {
      const r = KoguApi.unwrapData(await KoguApi.apiFetch(`${BASE}/teorico/${encodeURIComponent(cve)}`));
      teo = { cve, versiones: r.versiones || [], filas: [] };
      $('teoVersion').innerHTML = teo.versiones.length
        ? teo.versiones.map((v, i) => `<option value="${i}">Desde ${esc(v.vigente_desde)}${i === 0 ? ' · la más reciente' : ''}</option>`).join('')
        : '<option value="">Sin teórico — captura uno nuevo</option>';
      usarVersion(teo.versiones.length ? 0 : null);
    } catch (e) { KoguApi.toast(e.message, 'error'); }
  }

  function usarVersion(i) {
    const v = i == null ? null : teo.versiones[i];
    teo.filas = v ? v.componentes.map(aFila) : [filaVacia()];
    $('teoVig').value = v ? v.vigente_desde : `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-01`;
    $('teoUnidad').value = v?.unidad || 'sobre';
    $('teoUpp').value = v?.unidades_por_pt ?? '';
    pintaTeo();
  }

  function avisoVigencia() {
    const vig = $('teoVig').value;
    const existe = teo.versiones.find(v => v.vigente_desde === vig);
    const previa = teo.versiones.filter(v => v.vigente_desde < vig).sort((a, b) => b.vigente_desde.localeCompare(a.vigente_desde))[0];
    $('teoAvisoVig').innerHTML = !vig ? ''
      : existe ? `<span style="color:var(--warn);font-weight:600">Reemplaza la versión vigente desde ${esc(vig)}.</span> Las órdenes desde esa fecha se recalculan con lo que captures.`
      : `<span style="color:var(--primary, #2563eb);font-weight:600">Versión nueva desde ${esc(vig)}.</span> ${previa ? `Las órdenes anteriores siguen con la versión del ${esc(previa.vigente_desde)}.` : 'Es la primera versión del producto.'}`;
  }

  function pintaTeo() {
    const inp = (i, k, extra = '') => `<input class="input" data-i="${i}" data-k="${k}" value="${esc(teo.filas[i][k])}" ${extra}/>`;
    $('tTeo').innerHTML = `<thead><tr><th>Componente</th><th>Claves de MP <small class="muted">(separadas por coma)</small></th>
      <th class="num">g por <span class="lblUnidadTeo">sobre</span></th><th class="num">$/kg</th><th class="num">Merma %</th>
      <th class="num">$ por <span class="lblUnidadTeo">sobre</span></th><th title="Entra al peso neto del producto (rendimiento)">Entra al peso</th><th></th></tr></thead>
      <tbody>${teo.filas.map((f, i) => {
        const calc = cpuCalc(f);
        return `<tr>
          <td>${inp(i, 'componente', 'style="width:120px" placeholder="Pasta"')}</td>
          <td>${inp(i, 'claves', 'style="width:230px;text-transform:uppercase" placeholder="WWP1331, WWP1332"')}</td>
          <td class="num">${inp(i, 'g', 'type="number" step="any" min="0" style="width:80px;text-align:right"')}</td>
          <td class="num">${inp(i, 'costo_kg', 'type="number" step="any" min="0" style="width:85px;text-align:right"')}</td>
          <td class="num">${inp(i, 'merma_pct', 'type="number" step="any" min="0" max="99" style="width:70px;text-align:right"')}</td>
          <td class="num">${inp(i, 'cpu', `type="number" step="any" min="0" style="width:85px;text-align:right" placeholder="${calc == null ? '' : r4(calc)}" title="Vacío = se calcula"`)}</td>
          <td style="text-align:center"><input type="checkbox" data-i="${i}" data-k="entra_peso" ${f.entra_peso ? 'checked' : ''}/></td>
          <td><button class="btn ghost" data-del="${i}" style="padding:2px 8px" title="Quitar">✕</button></td></tr>`;
      }).join('')}</tbody>`;
    document.querySelectorAll('.lblUnidadTeo').forEach(el => { el.textContent = $('teoUnidad').value || 'unidad'; });
    $('tTeo').querySelectorAll('input[data-k]').forEach(el => el.addEventListener(el.type === 'checkbox' ? 'change' : 'input', () => {
      teo.filas[+el.dataset.i][el.dataset.k] = el.type === 'checkbox' ? el.checked : el.value;
      if (['g', 'costo_kg', 'merma_pct'].includes(el.dataset.k)) {
        const c2 = cpuCalc(teo.filas[+el.dataset.i]);
        el.closest('tr').querySelector('[data-k="cpu"]').placeholder = c2 == null ? '' : r4(c2);
      }
      totalesTeo();
    }));
    $('tTeo').querySelectorAll('[data-del]').forEach(b2 => b2.addEventListener('click', () => {
      teo.filas.splice(+b2.dataset.del, 1); if (!teo.filas.length) teo.filas.push(filaVacia()); pintaTeo();
    }));
    totalesTeo(); avisoVigencia(); pintaOtros();
  }

  function totalesTeo() {
    let tot = 0, g = 0, gEnt = 0;
    for (const f of teo.filas) {
      const cpu = numOrNull(f.cpu) ?? cpuCalc(f);
      if (cpu != null) tot += cpu;
      if (f.entra_peso && numOrNull(f.g) != null) { g += Number(f.g); gEnt += Number(f.g) * (1 + (numOrNull(f.merma_pct) || 0) / 100); }
    }
    const u = $('teoUnidad').value || 'unidad';
    $('teoTotales').innerHTML = `Total MP: <b>${money(tot)}</b> por ${esc(u)}` +
      (g ? ` · Peso neto <b>${fmt(g, 1)} g</b> · entra con merma ${fmt(gEnt, 1)} g · rendimiento teórico <b>${fmt(g / gEnt * 100, 1)}%</b>` : '');
  }

  function pintaOtros() {
    const otros = productos.filter(x => x.con_teorico || seleccion.has(x.cve_pt)).map(x => x.cve_pt).filter(k => k !== teo.cve);
    $('teoOtros').innerHTML = otros.length ? `<span class="muted">Aplicar también a:</span> ` + otros.map(k =>
      `<label style="margin-right:10px;white-space:nowrap"><input type="checkbox" class="teoOtro" value="${esc(k)}"/> ${esc(k)}</label>`).join('') : '';
  }

  async function guardarTeorico(btn) {
    const cve = ($('teoPt').value || '').trim().toUpperCase();
    if (!cve) return KoguApi.toast('Indica el producto.', 'error');
    const componentes = teo.filas.filter(f => String(f.componente).trim() || String(f.claves).trim()).map(f => ({
      componente: f.componente,
      claves_mp: String(f.claves).split(',').map(x => x.trim()).filter(Boolean),
      kg_por_unidad: numOrNull(f.g) == null ? null : Number(f.g) / 1000,
      costo_kg: numOrNull(f.costo_kg),
      merma: numOrNull(f.merma_pct) == null ? null : Number(f.merma_pct) / 100,
      costo_por_unidad: numOrNull(f.cpu),
      entra_peso: !!f.entra_peso,
    }));
    const body = { vigente_desde: $('teoVig').value, unidad: $('teoUnidad').value, unidades_por_pt: $('teoUpp').value || null, componentes };
    const destinos = [cve, ...[...document.querySelectorAll('.teoOtro:checked')].map(x => x.value)];
    await KoguUi.withLoading(btn, async () => {
      const ok = [];
      for (const k of destinos) {
        try {
          await KoguApi.apiFetch(`${BASE}/teorico/${encodeURIComponent(k)}`, { method: 'PUT', body: JSON.stringify(body) });
          ok.push(k);
        } catch (e) { KoguApi.toast(`${k}: ${e.message}`, 'error'); break; }
      }
      if (!ok.length) return;
      KoguApi.toast(`Teórico guardado (desde ${body.vigente_desde}): ${ok.join(', ')}`, 'success');
      await cargarTeorico(cve);
      const i = teo.versiones.findIndex(v => v.vigente_desde === body.vigente_desde);
      if (i >= 0) { $('teoVersion').value = i; usarVersion(i); }
      const r = await KoguApi.apiFetch(`${BASE}/productos?${new URLSearchParams(periodo())}`);
      productos = KoguApi.unwrapData(r) || productos; pintaProductos();
      if (seleccion.size) await analizar();
    }, 'Guardando...');
  }

  $('btnTeorico').addEventListener('click', () => abrirTeorico());
  $('teoCerrar').addEventListener('click', () => { $('cardTeo').style.display = 'none'; });
  $('teoPt').addEventListener('change', () => { const k = $('teoPt').value.trim().toUpperCase(); $('teoPt').value = k; if (k) cargarTeorico(k); });
  $('teoVersion').addEventListener('change', () => usarVersion($('teoVersion').value === '' ? null : +$('teoVersion').value));
  $('teoVig').addEventListener('input', avisoVigencia);
  $('teoUnidad').addEventListener('input', () => { document.querySelectorAll('.lblUnidadTeo').forEach(el => { el.textContent = $('teoUnidad').value || 'unidad'; }); totalesTeo(); });
  $('teoAdd').addEventListener('click', () => { teo.filas.push(filaVacia()); pintaTeo(); });
  $('teoGuardar').addEventListener('click', (e) => guardarTeorico(e.currentTarget));

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
    $('rendAviso').innerHTML = '';
    ['tResumen', 'tGramos', 'tRend', 'tOrdenes', 'tLotes'].forEach(id => { $(id).innerHTML = `<tr><td class="muted" style="padding:16px">${esc(msg)}</td></tr>`; });
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
      pintaKpis(); pintaResumen(); pintaRendimiento(); pintaOrdenes(); pintaLotes();
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
    const gHead = `<thead><tr><th style="text-align:left">Componente</th><th style="text-align:left">Claves MP</th><th class="num teo sep">Teórico</th>
      ${meses.map(m => `<th colspan="2" class="grupo sep">${MES[m.mes]}-${String(m.anio).slice(2)}</th>`).join('')}
      ${meses.length > 1 ? '<th colspan="2" class="grupo sep acum">Acumulado</th>' : ''}</tr>
      <tr><th></th><th></th><th class="num teo sep">g</th>${meses.map(() => '<th class="num sep">Real g</th><th class="num">Dif g</th>').join('')}
      ${meses.length > 1 ? '<th class="num sep acum">Real g</th><th class="num acum">Dif g</th>' : ''}</tr></thead>`;
    const gBody = pesados.map(comp => {
      const gTeo = meta[comp].teo.kg_por_unidad * 1000;
      const a = meses.length > 1 ? acum(comp) : null;
      return `<tr><td class="comp">${esc(comp)}</td><td class="claves">${clavesHtml(comp)}</td><td class="num teo sep">${fmt(gTeo, 1)}</td>
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

  // ── Cantidad producida y rendimiento (métricas × meses + acumulado) ──
  function pintaRendimiento() {
    const R = D.rendimiento || [];
    if (!R.length) { $('tRend').innerHTML = '<tr><td class="muted" style="padding:12px">Sin datos.</td></tr>'; $('rendAviso').innerHTML = ''; return; }
    const sinPeso = R.reduce((s, x) => s + (x.ordenes_sin_peso || 0), 0);
    const pts = [...new Set((D.ordenes || []).filter(o => o.kg_producidos == null).map(o => o.cve_pt))];
    $('rendAviso').innerHTML = sinPeso
      ? `<span class="badge warn">${sinPeso} orden(es) sin kg por unidad en el catálogo (${pts.map(esc).join(', ')}): quedan fuera del rendimiento. Captúralo en Catálogos → Productos.</span>` : '';
    const sum = (k) => R.reduce((s, x) => s + (x[k] || 0), 0);
    const conP = R.filter(x => x.kg_producidos != null);
    const kgP = conP.reduce((s, x) => s + x.kg_producidos, 0), kgE = conP.reduce((s, x) => s + x.kg_entrada, 0);
    const conT = R.filter(x => x.kg_entrada_teo != null);
    const kgPt = conT.reduce((s, x) => s + x.kg_producidos, 0), kgT = conT.reduce((s, x) => s + x.kg_entrada_teo, 0);
    const A = R.length > 1 ? {
      ordenes: sum('ordenes'), cantidad_pt: sum('cantidad_pt'), unidades: sum('unidades'),
      kg_producidos: conP.length ? kgP : null, kg_entrada: conP.length ? kgE : null, kg_entrada_teo: kgT || null,
      merma_kg: conP.length ? kgE - kgP : null, rendimiento: kgE ? kgP / kgE : null, rendimiento_teo: kgT ? kgPt / kgT : null,
    } : null;
    const cols = [...R, ...(A ? [A] : [])];
    const pct = (v) => (v == null ? '—' : fmt(v * 100, 1) + '%');
    const u = plural(D.unidad);
    const filas = [
      ['Órdenes', x => n0(x.ordenes)],
      ['Cantidad PT', x => n0(x.cantidad_pt)],
      [`${u.charAt(0).toUpperCase() + u.slice(1)}`, x => n0(x.unidades)],
      ['Kg producidos', x => x.kg_producidos == null ? '—' : fmt(x.kg_producidos, 1)],
      ['Kg MP que entran al producto', x => x.kg_entrada == null ? '—' : fmt(x.kg_entrada, 1)],
      ['Kg MP teórico (con merma)', x => x.kg_entrada_teo == null ? '—' : fmt(x.kg_entrada_teo, 1)],
      ['Merma kg (entrada − producido)', x => x.merma_kg == null ? '—' : fmt(x.merma_kg, 1)],
      ['Rendimiento real', x => `<b>${pct(x.rendimiento)}</b>`, true],
      ['Rendimiento teórico', x => pct(x.rendimiento_teo), true],
      ['Dif (real − teórico)', x => {
        if (x.rendimiento == null || x.rendimiento_teo == null) return '—';
        const d = (x.rendimiento - x.rendimiento_teo) * 100;
        return `<span style="${difCls(d, 40)}">${d > 0 ? '+' : d < 0 ? '−' : ''}${fmt(Math.abs(d), 1)} pts</span>`;
      }, true],
    ];
    const head = `<thead><tr><th style="text-align:left">Concepto</th>
      ${R.map(x => `<th class="num sep">${MES[x.mes]}-${String(x.anio).slice(2)}</th>`).join('')}
      ${A ? '<th class="num sep acum">Acumulado</th>' : ''}</tr></thead>`;
    const body = filas.map(([lab, f, destacado]) => `<tr${destacado ? ' style="background:#fcfcfd"' : ''}>
      <td class="comp">${lab}</td>
      ${cols.map((x, i) => `<td class="num sep${A && i === cols.length - 1 ? ' acum' : ''}">${f(x)}</td>`).join('')}</tr>`).join('');
    $('tRend').innerHTML = head + `<tbody>${body}</tbody>`;
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
      <th>MP por PT</th><th>Rend.</th><th style="text-align:left">Revisar</th></tr></thead>`;
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
      <td style="text-align:right;${alerta(o, 'Rendimiento')}">${o.rendimiento == null ? '—' : fmt(o.rendimiento * 100, 1) + '%'}</td>
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

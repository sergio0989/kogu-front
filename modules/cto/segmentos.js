// ============================================================
// segmentos.js — Costo (cto_): Utilidad por segmento de negocio.
//
// Pantalla imprimible para Dirección. UN solo fetch a
// GET /protected/cto/segmentos/:anio/:mes, que ya devuelve el informe resuelto.
//
// Este archivo SOLO MAQUETA. No calcula márgenes, no corta tops, no arma
// narrativa: todo eso vive en cto-segmentos.service.js. Si algo del contenido
// debe cambiar, se cambia allá — de lo contrario el mismo informe podría decir
// dos cosas distintas según se lea la tabla o el texto.
//
// "Imprimir / Guardar PDF" usa window.print() con CSS @media print.
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/cto/segmentos.html';
  const PERM = 'screen.cto.segmentos';
  const BASE = '/protected/cto';

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Utilidad por segmento',
    description: 'Utilidad por segmento de negocio (grupo de cliente × familia de producto), del mes y acumulada, sobre costo integrado ABC. Lista para imprimir o guardar como PDF.',
    requiredPermission: PERM,
  });
  if (!b) return;

  const $ = (id) => document.getElementById(id);
  const now = new Date();

  // El signo va ANTES del peso ("-$35,678"): el backend arma la narrativa con
  // ese criterio y un informe firmado no puede contradecirse entre el texto y
  // la tabla de la página siguiente.
  const sg = (v, s) => ((Number(v) || 0) < 0 ? '-' + s : s);
  const mon = (v) => (v == null ? '—' : sg(v, '$' + Math.abs(Number(v) || 0).toLocaleString('es-MX', { maximumFractionDigits: 0 })));
  const mon2 = (v) => (v == null ? '—' : sg(v, '$' + Math.abs(Number(v) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })));
  const num = (v) => (v == null ? '—' : Math.round(Number(v) || 0).toLocaleString('es-MX'));
  const pc = (v, d = 1) => (v == null ? '—' : `${(Number(v) * 100).toFixed(d)}%`);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Semáforo del margen. El verde NO es un umbral fijo: es el margen real de la
  // casa, que el backend manda en umbrales.margen_casa. Así la escala se
  // recalibra cada mes en vez de quedarse en un número que alguien puso una vez.
  //
  // El color se decide sobre la cifra REDONDEADA, la que el lector tiene
  // enfrente — no sobre el valor completo. Comparando el valor completo, dos
  // celdas que muestran "27.1%" pueden salir de distinto color (27.148% verde,
  // 27.104% sin color) y eso se lee como un error del reporte, no como
  // precisión. El costo es aceptar hasta media décima de holgura en el borde;
  // la alternativa es un informe firmado que se contradice a sí mismo.
  let CASA = 0; let BAJO = 0.15;
  const cls = (v, d = 1) => {
    if (v == null) return '';
    const r = (x) => Number((Number(x) * 100).toFixed(d));
    const val = r(v);
    return val >= r(CASA) ? 'pos' : (val < r(BAJO) ? 'neg' : '');
  };
  // El rojo lo decide el SIGNO del dato, no la fila donde cae: la venta de una
  // muestra es positiva aunque su resultado sea negativo, y pintarla en rojo
  // "porque es la fila de muestras" la hace parecer un cargo.
  const sgn = (v) => ((Number(v) || 0) < 0 ? 'neg' : '');

  let PER = ''; let ACUM = '';

  document.getElementById('pageContent').innerHTML = `
<style>
  #reporte { background:#fff; color:#0f172a; }
  #reporte .band { background:#0e7490; color:#fff; padding:12px 16px; border-radius:8px; margin:18px 0 12px; display:flex; justify-content:space-between; align-items:center; }
  #reporte .band h2 { margin:0; font-size:16px; }
  #reporte .band .bsub { font-size:16px; color:#a5f3fc; margin-top:3px; font-weight:700; letter-spacing:.2px; }
  #reporte .band .n { font-size:11.5px; font-weight:800; opacity:.7; letter-spacing:.8px; text-transform:uppercase; white-space:nowrap; }
  #reporte .idx { border:1px solid #cbd5e1; border-radius:8px; padding:12px 14px; margin-top:14px; }
  #reporte .idx h4 { margin:0 0 8px; font-size:12px; text-transform:uppercase; letter-spacing:.5px; }
  #reporte .idx table.rt td { border-bottom:0; padding:3px 0; }
  #reporte .idx table.rt td:nth-child(2) { text-align:right; color:#64748b; }
  #reporte .cont { font-size:11px; color:#64748b; font-weight:700; text-transform:uppercase; letter-spacing:.6px; border-bottom:1px solid #e2e8f0; padding-bottom:5px; }
  #reporte .kgrid { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; }
  #reporte .kc { background:#f1f5f9; border-radius:8px; padding:12px 14px; }
  #reporte .kc.dark { background:#0e7490; color:#fff; }
  #reporte .kc .l { font-size:11px; color:#64748b; }
  #reporte .kc.dark .l { color:#cbd5e1; }
  #reporte .kc .v { font-size:19px; font-weight:800; margin-top:3px; }
  #reporte .kc .s { font-size:11px; font-weight:700; color:#059669; margin-top:2px; }
  #reporte .kc.dark .s { color:#5eead4; }
  #reporte table.rt { width:100%; border-collapse:collapse; font-size:12px; }
  #reporte table.rt th { background:#0e7490; color:#fff; padding:6px 8px; text-align:right; font-size:10.5px; font-weight:700; white-space:nowrap; }
  #reporte table.rt th:first-child { text-align:left; }
  /* Una cifra partida a la mitad ("$20,012,49 / 2") es un error de lectura, no
     de estilo: los números nunca se rompen; el ancho se gana angostando. */
  #reporte table.rt td { padding:5px 8px; text-align:right; border-bottom:1px solid #eef2f6; white-space:nowrap; }
  #reporte table.rt td:first-child { text-align:left; white-space:normal; }
  #reporte table.rt tr.tot td { background:#ecfdf5; font-weight:800; border-top:2px solid #059669; }
  #reporte table.rt.wide { font-size:10.5px; }
  #reporte table.rt.wide td, #reporte table.rt.wide th { padding:4px 5px; }
  #reporte table.rt.txt3 td:nth-child(-n+3), #reporte table.rt.txt3 th:nth-child(-n+3) { text-align:left; white-space:normal; }
  #reporte .sub { font-size:9.5px; color:#64748b; font-weight:400; }
  #reporte .neg { color:#dc2626; }
  #reporte .pos { color:#059669; font-weight:700; }
  #reporte .narr { margin:16px 0 0; }
  #reporte .narr h3 { font-size:13px; margin:0 0 6px; text-transform:uppercase; letter-spacing:.5px; border-bottom:2px solid #0e7490; padding-bottom:4px; }
  #reporte .narr p { font-size:12px; line-height:1.65; color:#1e293b; margin:0 0 9px; text-align:justify; }
  #reporte .narr ul { margin:4px 0 0; padding-left:18px; }
  #reporte .narr ul.res li { margin-bottom:7px; }
  #reporte .narr li { font-size:12px; line-height:1.6; color:#1e293b; margin-bottom:5px; }
  #reporte .aviso { border-left:4px solid #d97706; background:#fffbeb; color:#78350f; padding:9px 12px; border-radius:0 6px 6px 0; font-size:11.5px; margin:10px 0 12px; }
  #reporte .aviso.info { border-left-color:#0e7490; background:#ecfeff; color:#155e75; }
  #reporte .leyenda { font-size:10px; color:#64748b; margin-top:6px; }
  #reporte .leyenda i { font-style:normal; font-weight:700; }
  #reporte .metod { font-size:10.5px; color:#64748b; font-style:italic; margin-top:6px; }

  @media print {
    @page { size: letter; margin: 20mm 0 16mm; }
    /* Margen LATERAL garantizado con padding del propio reporte: sobrevive
       aunque el diálogo de impresión ponga "Márgenes: Ninguno". */
    #reporte { padding: 4mm 14mm !important; box-sizing: border-box !important; width:100% !important; }
    html, body { background:#fff !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    .sidebar, .topbar, .no-print { display: none !important; }
    body, #app, #app > *, main, .content, .app-main, .app-shell, .layout, .page, #pageContent {
      display:block !important; margin:0 !important; padding:0 !important; width:auto !important; max-width:none !important; box-shadow:none !important; border:0 !important; }
    #reporte, #reporte * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    #reporte table.rt { width:100% !important; }
    #reporte table.rt td:first-child { overflow-wrap:anywhere; }
    #reporte .pb { page-break-before: always; padding-top: 6mm; }
    #reporte .band.pb { padding-top:12px; margin-top:6mm; }
    #reporte tr, #reporte .kc, #reporte .band { page-break-inside: avoid; }
    #reporte .kgrid { page-break-inside: avoid; }
    /* Una banda de sección al pie, sin su contenido, es un encabezado colgado. */
    #reporte .band, #reporte h4, #reporte .narr h3, #reporte .cont { page-break-after: avoid; }
  }
</style>
<div class="card no-print">
  <div class="row">
    <div><div class="eyebrow">Costo · Dirección</div><h2>Utilidad por segmento</h2></div>
    <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap">
      <div><label class="muted" style="font-size:12px">Año</label><input type="number" id="anio" class="input" style="width:100px" value="${now.getFullYear()}"/></div>
      <div><label class="muted" style="font-size:12px">Mes</label><input type="number" id="mes" class="input" style="width:80px" min="1" max="12" value="${now.getMonth() + 1}"/></div>
      <button class="btn primary" id="genBtn">Generar</button>
      <button class="btn ghost" id="printBtn" title="Imprime o guarda como PDF desde el navegador">🖨 Imprimir / Guardar PDF</button>
    </div>
  </div>
  <div id="msg" class="muted" style="margin-top:10px;font-size:13px">Selecciona el periodo y pulsa <b>Generar</b>. Luego <b>Imprimir / Guardar PDF</b>.</div>
</div>
<div id="reporte"></div>`;

  // ─── helpers de render ───
  // El número de la banda es la SECCIÓN, no la página: sin la palabra delante se
  // lee como paginación y no coincide con la hoja donde cae al imprimir. El
  // subtítulo declara el alcance porque en el mismo informe conviven cifras del
  // mes y acumuladas, y de otro modo el lector las suma como si fueran iguales.
  const band = (n, title, alcance, periodo, pb) => {
    const sub = alcance ? `<div class="bsub">${esc(alcance)}${periodo ? ' · ' + esc(periodo) : ''}</div>` : '';
    return `<div class="band${pb ? ' pb' : ''}"><div><h2>${esc(title)}</h2>${sub}</div><span class="n">Sección ${n}</span></div>`;
  };
  const kc = (l, v, s, dark) => `<div class="kc${dark ? ' dark' : ''}"><div class="l">${esc(l)}</div><div class="v">${v}</div>${s ? `<div class="s">${esc(s)}</div>` : ''}</div>`;

  function secEncabezado(d) {
    const emp = (d.empresa && (d.empresa.razon_social || d.empresa.nombre_corto)) || 'Empresa';
    return `<div style="background:#0e7490;color:#fff;padding:16px;border-radius:8px;display:flex;justify-content:space-between;align-items:center">
      <div><div style="font-size:20px;font-weight:800">Utilidad por Segmento de Negocio</div>
        <div style="font-size:12px;color:#cbd5e1;margin-top:2px">${esc(emp)} · ${esc(PER)}${d.periodo.cerrado ? ' (cerrado)' : ''} y acumulado del ejercicio</div></div>
      <div style="text-align:right"><div style="font-size:15px;font-weight:800">KOGU</div>
        <div style="font-size:10px;color:#94a3b8">Reporte para Dirección</div></div></div>`;
  }

  function secIndice(d) {
    const filas = [
      ['Sección 1 · Panorama del periodo', 'Mes y acumulado'],
      ['Sección 2 · Utilidad por segmento', 'Mes y acumulado'],
      ['Sección 3 · Contribución por grupo de cliente', 'Acumulado'],
      d.apertura ? [`Sección 4 · Apertura del segmento «${d.apertura.nombre}»`, 'Acumulado'] : null,
      ['Sección 5 · Evolución del margen por segmento', ACUM],
      ['Sección 6 · Partidas fuera del margen: muestras y notas', 'Acumulado'],
      ['Sección 7 · Conclusiones y metodología', '—'],
    ].filter(Boolean);
    return `<div class="idx"><h4>Contenido</h4><table class="rt">${
      filas.map(([a, c]) => `<tr><td>${esc(a)}</td><td>${esc(c)}</td></tr>`).join('')
    }</table><div class="metod">Cada sección declara en su encabezado si informa el mes que se cierra o el acumulado del ejercicio.</div></div>`;
  }

  function secPanorama(d) {
    const m = d.totales.mes; const a = d.totales.acum;
    let h = band(1, 'Panorama del periodo', 'Mes y acumulado', `${PER} · ${ACUM}`);
    h += '<div class="cont">Resultado del mes</div><div class="kgrid" style="margin-top:8px">';
    if (m && m.ventas) {
      h += kc('Venta del mes', mon(m.ventas), `${num(m.facturas)} facturas · ${num(m.kilos)} kg`);
      h += kc('Costo integrado', mon(m.costo_integrado), `${pc(m.costo_pct)} de la venta`);
      h += kc('Utilidad del mes', mon(m.utilidad), `margen ${pc(m.margen, 2)}`, true);
    } else {
      h += kc('Venta del mes', '—', 'Sin ventas costeadas en el mes');
      h += kc('Costo integrado', '—', '');
      h += kc('Utilidad del mes', '—', '', true);
    }
    h += '</div>';
    h += '<div class="cont" style="margin-top:14px">Acumulado del ejercicio</div><div class="kgrid" style="margin-top:8px">';
    h += kc('Venta acumulada', mon(a.ventas), `${num(a.facturas)} facturas · ${d.periodo.meses_acumulados} meses`);
    h += kc('Costo integrado', mon(a.costo_integrado), `${pc(a.costo_pct)} de la venta`);
    h += kc('Utilidad acumulada', mon(a.utilidad), `margen ${pc(a.margen, 2)}`, true);
    h += '</div>';
    h += `<div class="narr"><h3>Resumen ejecutivo</h3><ul class="res">${
      d.narrativa.resumen.map((p) => `<li><b>${esc(p.etiqueta)}:</b> ${esc(p.texto)}</li>`).join('')
    }</ul></div>`;
    return h;
  }

  function secSegmentos(d) {
    const a = d.totales.acum; const m = d.totales.mes;
    let h = band(2, 'Utilidad por segmento', 'Mes y acumulado', `${PER} · ${ACUM}`, true);
    h += `<table class="rt wide"><thead>
      <tr><th rowspan="2">Segmento</th>
          <th colspan="3" style="text-align:center;border-bottom:1px solid rgba(255,255,255,.25)">${esc(PER)}</th>
          <th colspan="5" style="text-align:center;border-bottom:1px solid rgba(255,255,255,.25)">Acumulado ${esc(ACUM)}</th></tr>
      <tr><th>Ventas</th><th>Utilidad</th><th>Margen</th>
          <th>Ventas</th><th>% vta</th><th>Utilidad</th><th>Margen</th><th>Prom. s/factura</th></tr></thead><tbody>`;
    for (const s of d.segmentos) {
      const sm = s.mes; const sa = s.acum;
      // La marca de dispersión no es un juicio: dice dónde el promedio simple
      // exagera (▲) o subestima (▼) el margen real por el tamaño de las facturas.
      const disp = s.dispersion_alta
        ? ` <span class="${s.dispersion_pp > 0 ? 'neg' : 'pos'}">${s.dispersion_pp > 0 ? '▲' : '▼'}${Math.abs(s.dispersion_pp).toFixed(1)}</span>`
        : '';
      h += `<tr><td>${esc(s.nombre)}</td>
        <td>${sm ? mon(sm.ventas) : '—'}</td><td>${sm ? mon(sm.utilidad) : '—'}</td>
        <td class="${sm ? cls(sm.margen) : ''}">${sm ? pc(sm.margen) : '—'}</td>
        <td>${mon(sa.ventas)}</td><td>${pc(s.pct_venta)}</td><td>${mon(sa.utilidad)}</td>
        <td class="${cls(sa.margen)}"><b>${pc(sa.margen)}</b></td>
        <td>${pc(sa.prom_simple)}${disp}</td></tr>`;
    }
    h += `<tr class="tot"><td>Total operación</td>
      <td>${m ? mon(m.ventas) : '—'}</td><td>${m ? mon(m.utilidad) : '—'}</td><td>${m ? pc(m.margen, 2) : '—'}</td>
      <td>${mon(a.ventas)}</td><td>100.0%</td><td>${mon(a.utilidad)}</td><td>${pc(a.margen, 2)}</td>
      <td>${pc(a.prom_simple)}</td></tr></tbody></table>`;
    h += `<div class="leyenda">Color del margen: <i class="pos">verde</i> igual o mejor que el margen de la casa (${pc(CASA, 2)}) · sin color entre ${pc(BAJO)} y ese umbral · <i class="neg">rojo</i> por debajo de ${pc(BAJO)}.</div>`;
    h += `<div class="aviso"><b>Sobre la columna «Prom. s/factura».</b> Es el promedio simple del margen renglón por renglón:
      pondera igual una factura de mil pesos y una de diez millones, por eso no suma al total
      (${pc(a.prom_simple, 2)} contra el margen real de ${pc(a.margen, 2)}). Se conserva para comparar contra el archivo de trabajo,
      pero la cifra que cuadra con el estado de resultados es <b>Margen</b>. Se marcan con ▲ los segmentos donde el promedio simple
      se separa más de ${d.umbrales.dispersion_pp} puntos: ahí hay facturas grandes con margen distinto al del resto del segmento.</div>`;
    return h;
  }

  function secGrupos(d) {
    const a = d.totales.acum;
    let h = band(3, 'Contribución por grupo de cliente', 'Acumulado', ACUM, true);
    h += `<table class="rt"><thead><tr><th>Grupo de cliente</th><th>Clientes</th><th>Ventas</th><th>% vta</th>
      <th>Utilidad</th><th>% util.</th><th>Margen</th><th>Índice</th></tr></thead><tbody>`;
    for (const g of d.grupos) {
      h += `<tr><td>${esc(g.nombre)}<div class="sub">${esc((g.segmentos || []).join(', '))}</div></td>
        <td>${num(g.clientes)}</td><td>${mon(g.acum.ventas)}</td><td>${pc(g.pct_venta)}</td>
        <td>${mon(g.acum.utilidad)}</td><td>${pc(g.pct_utilidad)}</td>
        <td class="${cls(g.acum.margen, 2)}"><b>${pc(g.acum.margen, 2)}</b></td>
        <td class="${g.indice >= 1 ? 'pos' : 'neg'}"><b>${g.indice == null ? '—' : g.indice.toFixed(2)}</b></td></tr>`;
    }
    h += `<tr class="tot"><td>Total operación</td><td>—</td><td>${mon(a.ventas)}</td><td>100.0%</td>
      <td>${mon(a.utilidad)}</td><td>100.0%</td><td>${pc(a.margen, 2)}</td><td>1.00</td></tr></tbody></table>`;
    h += '<div class="leyenda">El <i>índice</i> es la participación en la utilidad dividida entre la participación en la venta. Arriba de 1.00 el grupo aporta más utilidad de la que le correspondería por tamaño; abajo, la diluye.</div>';
    return h;
  }

  function secApertura(d) {
    const o = d.apertura;
    if (!o) return '';
    let h = band(4, `Apertura del segmento «${o.nombre}»`, 'Acumulado', ACUM, true);
    h += `<div class="aviso info">«${esc(o.nombre)}» concentra <b>${mon2(o.total.ventas)}</b> — ${pc(o.pct_compania)} de la venta del ejercicio —
      repartidos en <b>${num(o.n_clientes)} clientes</b> y <b>${num(o.n_productos)} productos</b>. Sin abrirlo, esa parte del negocio
      queda como una sola línea. Los diez clientes principales explican ${pc(o.top_pct)} del segmento.</div>`;
    h += `<table class="rt"><thead><tr><th>Cliente</th><th>Ventas</th><th>% del segmento</th><th>Utilidad</th><th>Margen</th></tr></thead><tbody>`;
    for (const t of o.top) {
      h += `<tr><td>${esc(t.nombre || t.clave)}</td><td>${mon(t.ventas)}</td><td>${pc(t.pct_segmento)}</td>
        <td>${mon(t.utilidad)}</td><td class="${cls(t.margen)}"><b>${pc(t.margen)}</b></td></tr>`;
    }
    h += `<tr><td>Resto (${num(o.resto.clientes)} clientes)</td><td>${mon(o.resto.ventas)}</td><td>${pc(o.resto.pct)}</td>
      <td>${mon(o.resto.utilidad)}</td><td class="${cls(o.resto.margen)}">${pc(o.resto.margen)}</td></tr>
      <tr class="tot"><td>Total «${esc(o.nombre)}»</td><td>${mon(o.total.ventas)}</td><td>100.0%</td>
      <td>${mon(o.total.utilidad)}</td><td>${pc(o.total.margen, 2)}</td></tr></tbody></table>`;
    return h;
  }

  function secSerie(d) {
    const s = d.serie;
    let h = band(5, 'Evolución del margen por segmento', 'Serie mensual', ACUM, true);
    h += `<table class="rt wide"><thead><tr><th>Segmento</th>${
      s.etiquetas.map((e) => `<th>${esc(e)}</th>`).join('')}<th>Acum.</th></tr></thead><tbody>`;
    const acumPorClave = new Map(d.segmentos.map((x) => [x.clave, x.acum.margen]));
    for (const f of s.filas) {
      // Celda vacía = mes SIN VENTA del segmento, no un cero: pintar 0% haría
      // creer que el segmento se desplomó ese mes.
      const tds = s.meses.map((i) => {
        const c = f.m[i] || f.m[String(i)];
        return `<td class="${c ? cls(c.margen) : ''}">${c ? pc(c.margen) : '—'}</td>`;
      }).join('');
      const ac = acumPorClave.get(f.clave);
      h += `<tr><td>${esc(f.nombre)}</td>${tds}<td class="${cls(ac)}"><b>${pc(ac)}</b></td></tr>`;
    }
    h += `<tr class="tot"><td>Total operación</td>${
      s.meses.map((i) => {
        const t = s.total[i] || s.total[String(i)];
        return `<td>${t ? pc(t.margen) : '—'}</td>`;
      }).join('')}<td>${pc(d.totales.acum.margen)}</td></tr></tbody></table>`;
    h += '<div class="leyenda">Las celdas vacías son meses sin venta del segmento, no ceros.</div>';
    return h;
  }

  function secPartidas(d) {
    const mu = d.muestras; const c = d.conciliacion; const nc = d.notas;
    let h = band(6, 'Partidas fuera del margen: muestras y notas de crédito', 'Acumulado', ACUM, true);

    if (mu.acum) {
      h += '<div class="cont">Muestras</div>';
      h += `<div class="aviso"><b>Estas cifras no están en el margen de las secciones anteriores, pero sí en el Informe de cierre.</b>
        El reporte por segmento excluye las muestras; el motor de costo las incluye en el resultado del mes. Su costo es real:
        <b>${mon2(mu.acum.ventas)}</b> facturados contra <b>${mon2(mu.acum.costo_integrado)}</b> de costo integrado =
        <b>${mon2(mu.acum.utilidad)}</b>.</div>`;
      h += `<div class="cont" style="margin-top:4px">Conciliación de ${esc(PER)}</div>`;
      h += `<table class="rt" style="margin-top:8px"><thead><tr><th>Concepto</th><th>Ventas</th><th>Utilidad</th><th>Margen</th></tr></thead><tbody>
        <tr><td>Operación por segmento (Secciones 1 a 5)</td><td>${mon2(c.operacion.ventas)}</td><td>${mon2(c.operacion.utilidad)}</td><td>${pc(c.operacion.margen, 2)}</td></tr>
        <tr><td>Muestras del mes</td><td class="${c.muestras ? sgn(c.muestras.ventas) : ''}">${c.muestras ? mon2(c.muestras.ventas) : '—'}</td>
            <td class="${c.muestras ? sgn(c.muestras.utilidad) : ''}">${c.muestras ? mon2(c.muestras.utilidad) : '—'}</td>
            <td class="${c.muestras ? sgn(c.muestras.margen) : ''}">${c.muestras ? pc(c.muestras.margen) : '—'}</td></tr>
        <tr class="tot"><td>Total del mes — cuadra con el Informe de cierre</td><td>${mon2(c.total.ventas)}</td>
            <td>${mon2(c.total.utilidad)}</td><td>${pc(c.total.margen, 2)}</td></tr></tbody></table>`;

      if (mu.detalle && mu.detalle.length) {
        h += '<table class="rt txt3" style="margin-top:10px"><thead><tr><th>Mes</th><th>Cliente</th><th>Producto</th><th>Venta</th><th>Costo integrado</th><th>Resultado</th></tr></thead><tbody>';
        for (const x of mu.detalle) {
          h += `<tr><td>${x.mes}</td><td>${esc(x.cliente)}</td><td>${esc(x.producto)}</td>
            <td>${mon(x.ventas)}</td><td>${mon(x.costo_integrado)}</td><td class="${sgn(x.utilidad)}">${mon(x.utilidad)}</td></tr>`;
        }
        h += `<tr class="tot"><td colspan="3">Total muestras (${mu.acum.renglones} renglones)</td>
          <td>${mon(mu.acum.ventas)}</td><td>${mon(mu.acum.costo_integrado)}</td>
          <td class="${sgn(mu.acum.utilidad)}">${mon(mu.acum.utilidad)}</td></tr></tbody></table>`;
      }
    }

    if (nc.renglones) {
      h += '<div class="cont" style="margin-top:16px">Notas de crédito</div>';
      h += `<div class="metod" style="margin-bottom:8px">Los ${nc.renglones} renglones de nota SÍ están dentro del margen de las
        secciones anteriores, restando venta y utilidad al segmento donde cayeron. Se listan para explicar caídas puntuales de margen.</div>`;
      h += '<table class="rt"><thead><tr><th>Segmento</th><th>Renglones</th><th>Venta reversada</th><th>Utilidad reversada</th></tr></thead><tbody>';
      for (const p of nc.por_segmento) {
        h += `<tr><td>${esc(p.nombre)}</td><td>${p.renglones}</td><td class="${sgn(p.ventas)}">${mon(p.ventas)}</td><td class="${sgn(p.utilidad)}">${mon(p.utilidad)}</td></tr>`;
      }
      h += `<tr class="tot"><td>Total</td><td>${nc.renglones}</td><td class="${sgn(nc.ventas)}">${mon(nc.ventas)}</td>
        <td class="${sgn(nc.utilidad)}">${mon(nc.utilidad)}</td></tr></tbody></table>`;
      if (nc.mayor) {
        h += `<div class="narr"><ul class="res"><li><b>La nota mayor:</b> ${esc(nc.mayor.cliente)} / ${esc(nc.mayor.producto)}
          en ${esc((nc.mayor.mes_nombre || '').toLowerCase())}, por ${mon2(nc.mayor.ventas)} y ${mon2(nc.mayor.utilidad)} de utilidad,
          dentro de ${esc(nc.mayor.segmento)}. Reversa una venta anterior, así que hunde el margen del segmento sin que haya nada
          mal en las ventas del mes.</li></ul></div>`;
      }
    }
    return h;
  }

  function secCierre(d) {
    const n = d.narrativa;
    let h = band(7, 'Conclusiones y metodología', '', '', true);
    h += '<div class="narr">';
    if (n.conclusiones.length) {
      h += `<h3>Conclusiones</h3><ul class="res">${
        n.conclusiones.map((c) => `<li><b>${esc(c.titulo)}:</b> ${esc(c.texto)}</li>`).join('')}</ul>`;
    }
    if (n.recomendaciones.length) {
      h += `<h3 style="margin-top:14px">Recomendaciones</h3><ul class="res">${
        n.recomendaciones.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>`;
    }
    h += `<h3 style="margin-top:14px">Metodología</h3><p>${esc(n.nota_metodologia)}</p>`;

    // El catálogo se imprime porque el informe se firma: quien lo lea dentro de
    // seis meses tiene que poder saber con qué reglas se clasificó, sin abrir
    // la base. Es la diferencia entre un reporte y un número suelto.
    const cat = d.catalogo;
    if (cat && cat.grupos.length) {
      const linea = (x) => `${esc(x.nombre)}${x.es_resto ? ' (respaldo)' : ''}${
        x.patrones.length ? ` — ${x.patrones.map((p) => esc(p.patron)).join(', ')}` : ''}`;
      h += `<p class="metod">Grupos de cliente: ${cat.grupos.map(linea).join(' · ')}.<br>
        Familias de producto: ${cat.familias.map(linea).join(' · ')}.</p>`;
    }
    const cob = d.cobertura;
    if (cob && cob.productos_sin_patron.length) {
      const top3 = cob.productos_sin_patron.slice(0, 3).map((p) => `${esc(p.clave)} (${mon(p.ventas)})`).join(', ');
      h += `<p class="metod">Claves sin familia asignada con mayor venta: ${top3}. Se informan dentro del segmento residual.</p>`;
    }
    h += `<p class="metod">Fuente: motor de costo ABC de KOGU, ${esc(ACUM)}. Cifras en pesos mexicanos.</p></div>`;
    return h;
  }

  // ─── generar ───
  async function generar() {
    const anio = $('anio').value; const mes = $('mes').value;
    if (!anio || !mes) return KoguApi.toast('Indica año y mes.', 'error');

    $('msg').innerHTML = 'Generando informe…';
    $('reporte').innerHTML = '';
    try {
      const d = KoguApi.unwrapData(await KoguApi.apiFetch(`${BASE}/segmentos/${anio}/${mes}`));
      if (!d || !d.totales) { $('msg').innerHTML = 'No hay ventas costeadas para ese periodo.'; return; }

      CASA = Number(d.umbrales.margen_casa) || 0;
      BAJO = Number(d.umbrales.margen_bajo) || 0.15;
      PER = d.periodo.etiqueta_mes;
      ACUM = d.periodo.etiqueta_acum;

      $('reporte').innerHTML =
        secEncabezado(d) + secIndice(d) + secPanorama(d) + secSegmentos(d) +
        secGrupos(d) + secApertura(d) + secSerie(d) + secPartidas(d) + secCierre(d);
      $('msg').innerHTML = 'Informe generado. Pulsa <b>Imprimir / Guardar PDF</b> (Ctrl/Cmd+P → Guardar como PDF).';
    } catch (e) {
      $('msg').innerHTML = '';
      // El 409 no es un error del usuario ni una falla: es configuración que
      // falta, y decirlo así evita que alguien crea que la pantalla se rompió.
      const msg = /catálogo|catalogo/i.test(e.message || '')
        ? 'Esta empresa todavía no tiene catálogo de segmentos. Captúralo antes de generar el informe.'
        : (e.message || 'Error generando el informe');
      KoguApi.toast(msg, 'error');
      $('msg').innerHTML = `<span style="color:#b45309">${esc(msg)}</span>`;
    }
  }

  $('genBtn').onclick = generar;
  $('printBtn').onclick = () => window.print();
});

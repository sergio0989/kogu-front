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
    description: 'Utilidad por segmento de negocio (grupo de cliente × línea del presupuesto de producto), del mes y acumulada, sobre costo integrado ABC. Lista para imprimir o guardar como PDF.',
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
  #reporte .cont { font-size:11px; color:#64748b; font-weight:700; text-transform:uppercase; letter-spacing:.6px; border-bottom:1px solid #e2e8f0; padding-bottom:5px; }
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
  #reporte table.rt.txt2 td:nth-child(-n+2), #reporte table.rt.txt2 th:nth-child(-n+2) { text-align:left; white-space:normal; }
  #reporte table.rt.txt2 td:first-child { white-space:nowrap; font-variant-numeric:tabular-nums; }
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
    #reporte tr, #reporte .band, #reporte ul.res li { page-break-inside: avoid; }
    /* Con el catálogo por línea del PP la tabla de segmentos pasó de 14 a ~31
       renglones y ya no cabe en una hoja. Sin esto, la hoja 2 de una tabla sale
       sin encabezados y las columnas de cifras quedan sin nombre — nueve
       columnas de números sin título no se pueden leer. */
    #reporte table.rt thead { display: table-header-group; }
    #reporte table.rt tfoot { display: table-footer-group; }
    /* El renglón de total no puede quedarse solo al inicio de una hoja. */
    #reporte tr.tot { page-break-before: avoid; }
    /* Un .cont con salto es el encabezado de una hoja nueva: sin este margen
       queda pegado al borde superior, donde @page ya no puede empujarlo. */
    #reporte .cont.pb { margin-top: 0 !important; }
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

  function secEncabezado(d) {
    const emp = (d.empresa && (d.empresa.razon_social || d.empresa.nombre_corto)) || 'Empresa';
    return `<div style="background:#0e7490;color:#fff;padding:16px;border-radius:8px;display:flex;justify-content:space-between;align-items:center">
      <div><div style="font-size:20px;font-weight:800">Utilidad por Segmento de Negocio</div>
        <div style="font-size:12px;color:#cbd5e1;margin-top:2px">${esc(emp)} · ${esc(PER)}${d.periodo.cerrado ? ' (cerrado)' : ''} y acumulado del ejercicio</div></div>
      <div style="text-align:right"><div style="font-size:15px;font-weight:800">KOGU</div>
        <div style="font-size:10px;color:#94a3b8">Reporte para Dirección</div></div></div>`;
  }

  // Sección 1: el resumen ejecutivo, solo. Antes vivía dentro de "Panorama del
  // periodo", debajo de seis tarjetas que repetían cifras que las tablas de la
  // Sección 2 ya dan con más detalle. Dirección pidió quitar el panorama; las
  // viñetas se quedan porque son lo que de verdad se lee, y ahora abren el
  // informe en vez de colgar de una sección que ya no existe.
  function secResumen(d) {
    let h = band(1, 'Resumen ejecutivo', 'Mes y acumulado', `${PER} · ${ACUM}`);
    h += `<div class="narr"><ul class="res">${
      d.narrativa.resumen.map((p) => `<li><b>${esc(p.etiqueta)}:</b> ${esc(p.texto)}</li>`).join('')
    }</ul></div>`;
    return h;
  }

  // Sección 2: DOS tablas, una por alcance, con las mismas columnas que el
  // reporte de origen — participación en ventas, en costo y en utilidad, y el
  // promedio por factura. Antes iban mes y acumulado en una sola tabla ancha, y
  // no cabían las tres participaciones; separarlas las devuelve.
  //
  // Se conserva "Margen" junto al promedio por factura: es la columna que el
  // origen no tenía y la única que cuadra con el estado de resultados. Quitarla
  // por parecerse más al Excel sería deshacer lo que este informe vino a
  // corregir.
  function tablaSegmentos(d, alcance) {
    const T = alcance === 'mes' ? d.totales.mes : d.totales.acum;
    if (!T || !T.ventas) {
      return '<div class="aviso">Sin ventas costeadas en el periodo.</div>';
    }
    const filas = d.segmentos.map((s) => {
      const c = alcance === 'mes' ? s.mes : s.acum;
      // Un segmento sin venta en el mes se muestra con rayas, no se omite: así
      // las dos tablas tienen las mismas filas en el mismo orden y se pueden
      // leer una contra otra sin buscar.
      if (!c || !c.ventas) {
        return `<tr><td>${esc(s.nombre)}</td>${'<td>—</td>'.repeat(8)}</tr>`;
      }
      const disp = alcance === 'acum' && s.dispersion_alta
        ? ` <span class="${s.dispersion_pp > 0 ? 'neg' : 'pos'}">${s.dispersion_pp > 0 ? '▲' : '▼'}${Math.abs(s.dispersion_pp).toFixed(1)}</span>`
        : '';
      return `<tr><td>${esc(s.nombre)}</td>
        <td>${mon(c.ventas)}</td><td>${pc(c.ventas / T.ventas, 2)}</td>
        <td>${mon(c.costo_integrado)}</td><td>${pc(c.costo_integrado / T.costo_integrado, 2)}</td>
        <td>${mon(c.utilidad)}</td><td>${pc(c.utilidad / T.utilidad, 2)}</td>
        <td class="${cls(c.margen)}"><b>${pc(c.margen)}</b></td>
        <td>${pc(c.prom_simple)}${disp}</td></tr>`;
    }).join('');

    return `<table class="rt wide"><thead><tr>
        <th>Segmento</th><th>Ventas</th><th>% Ventas</th>
        <th>Costo integrado</th><th>% Costo</th>
        <th>Utilidad</th><th>% Utilidad</th>
        <th>Margen</th><th>Prom. s/factura</th></tr></thead><tbody>
      ${filas}
      <tr class="tot"><td>Total operación</td>
        <td>${mon(T.ventas)}</td><td>100.00%</td>
        <td>${mon(T.costo_integrado)}</td><td>100.00%</td>
        <td>${mon(T.utilidad)}</td><td>100.00%</td>
        <td>${pc(T.margen, 2)}</td><td>${pc(T.prom_simple)}</td></tr>
      </tbody></table>`;
  }

  function secSegmentos(d) {
    const a = d.totales.acum;
    let h = band(2, 'Utilidad por segmento', 'Mes y acumulado', `${PER} · ${ACUM}`, true);

    h += `<div class="cont">Resultado del mes · ${esc(PER)}</div>`;
    h += tablaSegmentos(d, 'mes');
    h += `<div class="leyenda">Las tres columnas de porcentaje son <i>participación</i> —cuánto del total aporta cada segmento— y suman 100%. <i>Margen</i> es utilidad entre ventas del propio segmento.</div>`;

    h += `<div class="cont pb" style="margin-top:16px">Acumulado del ejercicio · ${esc(ACUM)}</div>`;
    h += tablaSegmentos(d, 'acum');
    h += `<div class="leyenda">Color del margen: <i class="pos">verde</i> igual o mejor que el margen de la casa (${pc(CASA, 2)}) · sin color entre ${pc(BAJO)} y ese umbral · <i class="neg">rojo</i> por debajo de ${pc(BAJO)}.</div>`;
    h += `<div class="aviso"><b>Sobre la columna «Prom. s/factura».</b> Es el promedio simple del margen renglón por renglón:
      pondera igual una factura de mil pesos y una de diez millones, por eso no suma al total
      (${pc(a.prom_simple, 2)} contra el margen real de ${pc(a.margen, 2)}). Se conserva para comparar contra el archivo de trabajo,
      pero la cifra que cuadra con el estado de resultados es <b>Margen</b>. Se marcan con ▲ los segmentos donde el promedio simple
      se separa más de ${d.umbrales.dispersion_pp} puntos: ahí hay facturas grandes con margen distinto al del resto del segmento.</div>`;
    h += plegados(d);
    return h;
  }

  // Qué es el renglón «Otro» y qué se juntó dentro de él.
  //
  // Hacen falta las dos cosas. El residual ya no es un bloque de negocio: es la
  // venta sin ClavePP asignada, casi toda ajustes de precio sin costo, así que
  // su margen ronda el 100% y en una tabla donde todo lo demás va entre 7% y
  // 40% ese renglón salta a la vista y hay que poder explicarlo en la junta.
  //
  // Y lo plegado se declara porque una cifra que se movió sin decirlo es una
  // cifra que alguien va a tener que rastrear después: la pregunta "¿y dónde
  // quedó tal línea?" no tiene buena respuesta improvisada.
  function plegados(d) {
    // Sólo se dibuja cuando el catálogo ya resuelve por línea del presupuesto.
    // Sin eso no se puede afirmar QUÉ es el residual: con el catálogo anterior
    // «Otro» era un tercio del negocio por falta de familia, no por falta de
    // ClavePP, y esta nota lo estaría explicando al revés.
    //
    // La condición mira el catálogo, que es lo que manda, y no la presencia del
    // campo: el backend nuevo envía plegados siempre, incluso sobre una base
    // donde la migración todavía no corrió.
    if (!d.catalogo_por_linea_pp || !Array.isArray(d.plegados)) return '';
    const p = d.plegados;
    const r = d.segmentos.find((x) => x.clave === 'OTRO');
    if (!p.length && !r) return '';

    let h = '<div class="aviso info">';
    if (r && r.acum && r.acum.ventas) {
      h += `<b>Sobre el renglón «${esc(r.nombre)}».</b> Es la venta que todavía no tiene ClavePP
        asignada en Radar Comercial — ${mon2(r.acum.ventas)}, ${pc(r.pct_venta, 2)} del ejercicio, en
        ${num(r.productos)} ${r.productos === 1 ? 'producto' : 'productos'}. No es un segmento de negocio
        y su margen no es comparable con el de los demás: son en su mayoría ajustes de precio, que
        entran sin costo. Asignarles ClavePP los reparte solo, sin tocar el catálogo de segmentos. `;
    }
    if (p.length) {
      const t = p.reduce((x, y) => x + (Number(y.ventas) || 0), 0);
      const lista = p
        .slice()
        .sort((x, y) => Math.abs(Number(y.ventas) || 0) - Math.abs(Number(x.ventas) || 0))
        .map((x) => `${esc(x.nombre)} (${mon2(x.ventas)})`)
        .join(' · ');
      h += `<b>Combinaciones sin materialidad.</b>
        ${p.length === 1 ? 'Una combinación' : `${num(p.length)} combinaciones`} de grupo × línea
        ${p.length === 1 ? 'vendió' : 'vendieron'} menos de ${mon(d.umbrales.materialidad_min)} en el
        ejercicio y se ${p.length === 1 ? 'informa' : 'informan'} dentro de ese renglón en vez de ocupar
        uno propio — ${mon2(t)} en total. ${lista}.`;
    }
    return `${h}</div>`;
  }

  // Con el catálogo por línea del PP, "Mercado abierto" llega a ~16 segmentos y
  // la lista completa convierte el renglón del grupo en un párrafo. Se acota: el
  // detalle está en la Sección 2 y esta línea sólo sitúa de qué se compone.
  function listaSegmentos(xs) {
    const a = xs || [];
    if (a.length <= 6) return a.join(', ');
    return `${a.slice(0, 6).join(', ')} y ${a.length - 6} más`;
  }

  function secGrupos(d) {
    const a = d.totales.acum;
    let h = band(3, 'Contribución por grupo de cliente', 'Acumulado', ACUM, true);
    h += `<table class="rt"><thead><tr><th>Grupo de cliente</th><th>Clientes</th><th>Ventas</th><th>% vta</th>
      <th>Utilidad</th><th>% util.</th><th>Margen</th><th>Índice</th></tr></thead><tbody>`;
    for (const g of d.grupos) {
      h += `<tr><td>${esc(g.nombre)}<div class="sub">${esc(listaSegmentos(g.segmentos))}</div></td>
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

  // Sección 4: abre los segmentos mayores por sublínea del PP.
  //
  // Reemplaza la apertura del residual por cliente. Esa sección existía porque
  // el residual era un tercio del negocio en una sola línea; con el catálogo por
  // línea del PP el residual es una fracción de punto y lo que hay que explicar
  // es otra cosa: de dónde sale el margen de los segmentos grandes.
  //
  // La apertura cuadra por construcción —es el siguiente nivel de la misma
  // taxonomía que define el segmento—, así que no hay renglón de "resto" ni
  // diferencia que justificar. Por eso el total de cada tabla es el propio
  // segmento y se puede leer contra la Sección 2 sin sumar nada.
  function secApertura(d) {
    const o = d.apertura;
    if (!o || !o.segmentos || !o.segmentos.length) return '';
    let h = band(4, 'Apertura de los segmentos mayores por sublínea', 'Acumulado', ACUM, true);
    h += `<div class="aviso info">Un segmento con buen margen puede ser varias sublíneas parejas o una
      sublínea fuerte cargando a otra que se vende cerca del costo, y son dos conversaciones distintas.
      Esta sección abre ${o.segmentos.length === 1 ? 'el segmento mayor' : `los ${o.segmentos.length} segmentos mayores`}
      por sublínea del presupuesto de producto. La suma de las sublíneas <b>es</b> la venta del segmento:
      no hay «resto» porque es el mismo criterio que define el segmento, un nivel más abajo.</div>`;

    for (const g of o.segmentos) {
      // El rango se enuncia sólo cuando dice algo. Dos sublíneas al 27% y al
      // 28% no son un hallazgo, son la misma cifra escrita dos veces.
      const rango = g.rango_pp != null && g.rango_pp >= 5
        ? ` — sus márgenes van del <b class="${cls(g.margen_min)}">${pc(g.margen_min)}</b>
            al <b class="${cls(g.margen_max)}">${pc(g.margen_max)}</b>, ${g.rango_pp.toFixed(1)} puntos de diferencia`
        : '';
      h += `<h4>${esc(g.nombre)} · ${mon2(g.total.ventas)} · margen ${pc(g.total.margen, 2)}</h4>`;
      h += `<div class="leyenda" style="margin:2px 0 6px">${pc(g.pct_compania)} de la venta del ejercicio
        en ${num(g.n_sublineas)} ${g.n_sublineas === 1 ? 'sublínea' : 'sublíneas'}${rango}.</div>`;
      h += `<table class="rt txt2"><thead><tr><th>ClavePP</th><th>Sublínea</th><th>Clientes</th><th>Productos</th>
        <th>Ventas</th><th>% del segmento</th><th>Utilidad</th><th>Margen</th></tr></thead><tbody>`;
      for (const x of g.sublineas) {
        h += `<tr><td>${esc(x.clave)}</td><td>${esc(x.nombre)}</td>
          <td>${num(x.clientes)}</td><td>${num(x.productos)}</td>
          <td>${mon(x.ventas)}</td><td>${pc(x.pct_segmento)}</td>
          <td>${mon(x.utilidad)}</td>
          <td class="${cls(x.margen)}"><b>${pc(x.margen)}</b></td></tr>`;
      }
      // colspan hasta la columna de Ventas: con la clase txt2 un td suelto en la
      // segunda posición se alinearía a la izquierda y el guion quedaría bajo el
      // nombre en vez de bajo su columna.
      h += `<tr class="tot"><td colspan="4">Total «${esc(g.nombre)}»</td>
        <td>${mon(g.total.ventas)}</td><td>100.0%</td>
        <td>${mon(g.total.utilidad)}</td><td>${pc(g.total.margen, 2)}</td></tr></tbody></table>`;
      if (g.truncado) {
        h += `<div class="leyenda">Se listan las ${num(g.sublineas.length)} sublíneas de mayor venta; el total del renglón inferior es el del segmento completo.</div>`;
      }
    }

    h += `<div class="leyenda">La segunda columna es el nombre de la sublínea tal como la mantiene
      Radar Comercial en el presupuesto de producto. <i>(sin ClavePP)</i> agrupa la venta que todavía
      no tiene asignación cliente-producto capturada.</div>`;
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
      h += '<div class="cont pb" style="margin-top:16px">Notas de crédito</div>';
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
        secEncabezado(d) + secResumen(d) + secSegmentos(d) +
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

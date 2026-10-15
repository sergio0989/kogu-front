// ============================================================
// consulta-ventas.js — Radar Comercial · Consulta de ventas
//
// Recorte libre: periodo, clientes y claves los pone el usuario.
// Hermana de Ventas de Exportación, no sustituta: aquel tablero es por
// Año/Mes y no puede expresar un periodo que cruce el corte de año.
//
// La pantalla existe para que el número que sale diga de dónde salió.
// Quien lo recibe suele ser un cliente, así que la procedencia viaja
// impresa en la vista y dentro del archivo exportado.
// ============================================================
(function () {
  'use strict';

  var API = '/protected/rc/consulta-ventas';
  // Unidades que son kilogramo escrito de tres formas. El resto no tiene
  // kilogramo en el dato (medido: 6 % de los renglones).
  var UNIDADES_KG = ['KG', 'KGM', 'KILO'];
  // Cuántos nombres se imprimen en pantalla antes de pasar a contarlos.
  // Con el filtro abierto son ~400 clientes y ~600 claves: nombrarlos
  // uno por uno convierte el encabezado en catorce mil caracteres de
  // muro. La lista completa viaja en el CSV, que es lo que llega al
  // cliente; la pantalla solo necesita que el recorte sea verificable.
  var MAX_NOMBRES = 12;
  var MAX_UNIDADES = 6;

  var S = {
    desde: '', hasta: '',
    clientes: [], claves: [],
    agrupar: 'clave', metrica: 'cantidad',
    catClientes: [], catClaves: [], clavesVentana: 'periodo', clavesHistorico: false,
    data: null,
    modal: null,
    // Pestaña activa y estado propio de la comparativa. La vista mensual
    // no sabe que existe: su código queda igual, sólo se oculta.
    tab: 'mensual', preset: 'anio_anterior', comp: null,
  };

  // ── utilidades ─────────────────────────────────────────────────────
  var esc = function (s) { return KoguUi.escapeHtml(s); };
  var norm = function (s) {
    return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  };
  var num = function (v) {
    var n = Number(v) || 0;
    return n === 0 ? '—' : n.toLocaleString('es-MX', { maximumFractionDigits: 0 });
  };
  var fecha = function (v) { return v ? KoguUi.fmtDateOnly(v) : '—'; };

  // El backend puede venir envuelto o plano. Tolerar las dos formas
  // evita que la pantalla se rompa por un helper de respuesta.
  var cuerpo = function (r) {
    if (!r || typeof r !== 'object') return {};
    if (r.data && typeof r.data === 'object') return r.data;
    return r;
  };

  var hoy = function () { return new Date(); };
  var iso = function (d) { return d.toISOString().slice(0, 10); };

  // Esta pantalla es una herramienta de RECORTE: el recorte lo pone el
  // usuario. Sin cliente ni clave no hay reporte que correr.
  var hayFiltro = function () { return S.clientes.length > 0 || S.claves.length > 0; };

  // Nombra mientras sean pocos; en cuanto son muchos, cuenta.
  var nombrarOcontar = function (lista, singular, plural, vacio) {
    var n = (lista || []).length;
    if (!n) return vacio;
    if (n <= MAX_NOMBRES) return esc(lista.join(' · '));
    return '<b>' + n + '</b> ' + plural + ' (la lista completa va dentro del CSV)';
  };

  // Ventana inicial: los últimos 12 meses cerrados.
  function periodoInicial() {
    var h = hoy();
    var fin = new Date(Date.UTC(h.getUTCFullYear(), h.getUTCMonth(), 0));
    var ini = new Date(Date.UTC(fin.getUTCFullYear(), fin.getUTCMonth() - 11, 1));
    return { desde: iso(ini), hasta: iso(fin) };
  }

  // ── armado de la pantalla ──────────────────────────────────────────
  function plantilla() {
    return ''
      + '<div class="page-head">'
      + '  <h1>Consulta de ventas</h1>'
      + '  <p class="muted">Cantidad e importe vendido por cliente y clave, en el periodo que elijas.</p>'
      + '</div>'

      + '<section class="card filtros">'
      + '  <div class="row">'
      + '    <label>Desde <input type="date" id="fDesde"></label>'
      + '    <label>Hasta <input type="date" id="fHasta"></label>'
      + '    <button type="button" class="btn" id="btnClientes">Clientes: todos</button>'
      + '    <button type="button" class="btn" id="btnClaves">Claves: todas</button>'
      + '    <label>Agrupar'
      + '      <select id="fAgrupar">'
      + '        <option value="clave">Clave tal cual</option>'
      + '        <option value="canonica">Clave canónica (junta nacional y exportación)</option>'
      + '      </select>'
      + '    </label>'
      + '    <label>Métrica'
      + '      <select id="fMetrica">'
      + '        <option value="cantidad">Cantidad</option>'
      + '        <option value="mxn">Importe MXN</option>'
      + '        <option value="usd">Importe USD</option>'
      + '      </select>'
      + '    </label>'
      + '    <button type="button" class="btn btn-primary" id="btnConsultar">Consultar</button>'
      + '    <button type="button" class="btn" id="btnExportar">Exportar Excel</button>'
      + '  </div>'
      + '  <div id="seleccion" class="chips"></div>'
      + '</section>'

      + '<nav class="tabs">'
      + '  <button type="button" class="tab activa" id="tabMensual">Consulta mensual</button>'
      + '  <button type="button" class="tab" id="tabComparativo">Periodos comparativos</button>'
      + '</nav>'

      + '<div id="vistaMensual">'

      + '<section class="card" id="avisos">'
      + '  <div id="medida" class="aviso"></div>'
      + '  <div id="devoluciones" class="aviso"></div>'
      + '  <div id="procedencia" class="procedencia"></div>'
      + '</section>'

      + '<section class="card">'
      + '  <div class="tabla-scroll"><table id="tablaPivote" class="tabla"><thead></thead><tbody></tbody><tfoot></tfoot></table></div>'
      + '</section>'

      + '</div>'

      + '<div id="vistaComparativo" hidden>'
      + '  <section class="card filtros">'
      + '    <div class="row">'
      + '      <label>Comparar contra'
      + '        <select id="fPreset">'
      + '          <option value="anio_anterior">Mismo periodo del a\u00f1o pasado</option>'
      + '          <option value="periodo_anterior">Periodo inmediato anterior</option>'
      + '          <option value="personalizado">Personalizado</option>'
      + '        </select>'
      + '      </label>'
      + '      <span id="cajaPersonalizado" hidden>'
      + '        <label>Comparar desde <input type="date" id="fDesde2"></label>'
      + '        <label>Comparar hasta <input type="date" id="fHasta2"></label>'
      + '      </span>'
      + '      <button type="button" class="btn btn-primary" id="btnComparar">Comparar</button>'
      + '    </div>'
      + '  </section>'
      + '  <section class="card" id="avisosComp">'
      + '    <div id="avisoLongitud" class="aviso"></div>'
      + '    <div id="devolucionesComp" class="aviso"></div>'
      + '    <div id="procedenciaComp" class="procedencia"></div>'
      + '  </section>'
      + '  <section class="card">'
      + '    <div class="tabla-scroll"><table id="tablaComp" class="tabla"><thead></thead><tbody></tbody><tfoot></tfoot></table></div>'
      + '  </section>'
      + '</div>'

      + '<div id="modal" class="modal" hidden>'
      + '  <div class="modal-caja">'
      + '    <h2 id="modalTitulo"></h2>'
      + '    <input type="search" id="modalBuscar" placeholder="Buscar…" autocomplete="off">'
      + '    <div id="modalBody" class="modal-body"></div>'
      + '    <div class="modal-pie">'
      + '      <button type="button" class="btn" id="modalLimpiar">Quitar todos</button>'
      + '      <button type="button" class="btn" id="modalCerrar">Cancelar</button>'
      + '      <button type="button" class="btn btn-primary" id="modalAceptar">Aplicar</button>'
      + '    </div>'
      + '  </div>'
      + '</div>';
  }

  // ── render ─────────────────────────────────────────────────────────
  function pintarSeleccion() {
    var cl = S.clientes.length ? String(S.clientes.length) : 'todos';
    var cv = S.claves.length ? String(S.claves.length) : 'todas';
    document.getElementById('btnClientes').textContent = 'Clientes: ' + cl;
    document.getElementById('btnClaves').textContent = 'Claves: ' + cv;

    // Una clave elegida que el cliente actual no compra NO se descarta
    // en silencio: se marca y el usuario decide (decisión §3.2).
    var vivas = {};
    S.catClaves.forEach(function (k) { vivas[k.cve_prod] = true; });
    var huerfanas = S.claves.filter(function (k) { return !vivas[k]; });

    var html = '';
    if (huerfanas.length) {
      html += '<p class="aviso-warn">⚠ ' + huerfanas.length + ' clave(s) seleccionada(s) sin venta a los '
        + 'clientes elegidos: <b>' + esc(huerfanas.join(', ')) + '</b>. Se conservan en el filtro; '
        + 'quítalas si no las necesitas.</p>';
    }
    document.getElementById('seleccion').innerHTML = html;
  }

  function limpiarAvisos() {
    document.getElementById('medida').innerHTML = '';
    document.getElementById('devoluciones').innerHTML = '';
    document.getElementById('procedencia').innerHTML = '';
    // Sin consulta no debe quedar una tarjeta blanca flotando.
    document.getElementById('avisos').hidden = true;
  }

  function pintarAvisos(d) {
    document.getElementById('avisos').hidden = false;
    var medida = document.getElementById('medida');
    var unidades = (d.unidades || []);
    var lista = unidades.length > MAX_UNIDADES
      ? unidades.slice(0, MAX_UNIDADES).join(', ') + ' y ' + (unidades.length - MAX_UNIDADES) + ' más'
      : unidades.join(', ');
    if (!unidades.length) {
      medida.innerHTML = '';
    } else if (d.es_kilogramo) {
      medida.innerHTML = 'Cantidad en <b>kilogramos</b>.';
    } else {
      // Medido: en el 6 % de los renglones no existe kilogramo en el dato.
      medida.innerHTML = '⚠ Cantidad en <b>unidad de venta</b>, no en kilogramos: la selección mezcla '
        + esc(lista) + '. Para un número en kilos, filtra a claves de unidad de peso.';
    }

    var dev = document.getElementById('devoluciones');
    var n = d.devoluciones || {};
    if (Number(n.renglones) > 0) {
      // La cantidad solo se reporta si es comparable. Con unidades
      // mezcladas, un total de "28,126" no significa nada.
      var cant = d.es_kilogramo
        ? '<b>' + Math.abs(Number(n.cantidad) || 0).toLocaleString('es-MX', { maximumFractionDigits: 0 })
          + '</b> kg y '
        : '';
      dev.innerHTML = 'Neto de devoluciones: se restaron ' + cant
        + '<b>' + KoguUi.money(Math.abs(Number(n.mxn) || 0)) + ' MXN</b> en '
        + n.renglones + ' renglón(es) de nota de crédito.';
    } else {
      dev.innerHTML = '';
    }

    var p = d.procedencia || {};
    document.getElementById('procedencia').innerHTML = ''
      + '<h3>Procedencia del dato</h3>'
      + '<ul>'
      + '<li><b>Periodo:</b> ' + esc(p.desde) + ' a ' + esc(p.hasta)
      + ' (' + (d.meses || []).length + ' meses, por <code>' + esc(p.fecha_campo) + '</code>)</li>'
      + '<li><b>Clientes:</b> '
      + nombrarOcontar(p.clientes, 'cliente', 'clientes', 'todos') + '</li>'
      + '<li><b>Claves:</b> '
      + nombrarOcontar(p.claves || p.claves_canonicas, 'clave', 'claves', 'todas') + '</li>'
      + '<li><b>Cantidad:</b> <code>' + esc(p.cantidad_campo) + '</code>'
      + ' · <b>Importe:</b> <code>' + esc(p.importe_campo) + '</code>'
      + ' · <b>USD:</b> ' + esc(p.usd_regla) + '</li>'
      + '<li><b>Generado:</b> ' + esc(p.generado_en) + '</li>'
      + '</ul>';
  }

  function serieDe(f) {
    if (S.metrica === 'mxn') return f.serie_mxn || [];
    if (S.metrica === 'usd') return f.serie_usd || [];
    return f.serie || [];
  }
  function totalDe(f) {
    if (S.metrica === 'mxn') return f.mxn;
    if (S.metrica === 'usd') return f.usd;
    return f.cantidad;
  }

  function pintarTabla(d) {
    var tabla = document.getElementById('tablaPivote');
    var meses = d.meses || [];
    var porCanonica = d.agrupar === 'canonica';

    var th = '<tr>'
      + (porCanonica
        ? '<th>Clave canónica</th><th>Mercado</th>'
        : '<th>Cliente</th><th>Clave</th>')
      + '<th>Unidad</th>'
      + meses.map(function (m) { return '<th class="n">' + esc(m) + '</th>'; }).join('')
      + '<th class="n">Total</th></tr>';
    tabla.tHead.innerHTML = th;

    // Una fila sin un solo dato en el periodo no es información: es ruido.
    // El backend la devuelve porque la clave existe en el recorte, pero en
    // pantalla son doce guiones seguidos.
    var filas = (d.filas || []).filter(function (f) {
      return Number(f.cantidad) !== 0 || Number(f.mxn) !== 0 || Number(f.usd) !== 0;
    });

    if (!filas.length) {
      tabla.tBodies[0].innerHTML = '<tr><td colspan="' + (meses.length + 4) + '">'
        + 'Sin ventas con ese recorte. Revisa el periodo y las claves: la clave tal como la escribe '
        + 'quien pide el dato suele ser la nacional, y la de exportación lleva punto final.</td></tr>';
      tabla.tFoot.innerHTML = '';
      return;
    }

    tabla.tBodies[0].innerHTML = filas.map(function (f) {
      var serie = serieDe(f);
      return '<tr>'
        + (porCanonica
          ? '<td>' + esc(f.clave_canonica) + '</td><td>' + esc(f.mercado) + '</td>'
          : '<td>' + esc(f.cliente || f.cve_cte) + '</td><td>' + esc(f.cve_prod) + '</td>')
        + '<td>' + esc(f.unidad) + '</td>'
        + meses.map(function (_, i) { return '<td class="n">' + num(serie[i]) + '</td>'; }).join('')
        + '<td class="n"><b>' + num(totalDe(f)) + '</b></td>'
        + '</tr>';
    }).join('');

    pintarPie(tabla, filas, meses, porCanonica);
  }

  // Totales POR UNIDAD, no uno solo.
  //
  // Con la selección mezclando KG, CAJA y SERVICIO —caso real del
  // 15-oct— un total único de cantidad sumaría kilos con cajas y con
  // servicios. Es el mismo defecto que el rótulo de kilogramos: un
  // número que se ve normal y no significa nada.
  //
  // El dinero sí es comparable siempre, así que cuando la métrica es
  // MXN o USD se agrega además un total general.
  function pintarPie(tabla, filas, meses, porCanonica) {
    var etiquetaCols = porCanonica ? 2 : 2;
    var porUnidad = {};
    var orden = [];
    filas.forEach(function (f) {
      if (!porUnidad[f.unidad]) {
        porUnidad[f.unidad] = { total: 0, serie: meses.map(function () { return 0; }) };
        orden.push(f.unidad);
      }
      var acc = porUnidad[f.unidad];
      var serie = serieDe(f);
      acc.total += Number(totalDe(f)) || 0;
      meses.forEach(function (_, i) { acc.serie[i] += Number(serie[i]) || 0; });
    });
    orden.sort(function (a, b) { return Math.abs(porUnidad[b].total) - Math.abs(porUnidad[a].total); });

    var renglon = function (titulo, acc, clase) {
      return '<tr class="' + clase + '">'
        + '<th colspan="' + etiquetaCols + '">' + esc(titulo) + '</th>'
        + '<th></th>'
        + acc.serie.map(function (v) { return '<td class="n">' + num(v) + '</td>'; }).join('')
        + '<td class="n">' + num(acc.total) + '</td>'
        + '</tr>';
    };

    var html = orden.map(function (u) {
      return renglon('Total ' + u, porUnidad[u], 'pie-unidad');
    }).join('');

    // El dinero suma aunque las unidades no. La cantidad solo si hay
    // una sola unidad, y entonces el renglón de arriba ya es el total.
    var dinero = S.metrica === 'mxn' || S.metrica === 'usd';
    if (dinero && orden.length > 1) {
      var gen = { total: 0, serie: meses.map(function () { return 0; }) };
      orden.forEach(function (u) {
        gen.total += porUnidad[u].total;
        porUnidad[u].serie.forEach(function (v, i) { gen.serie[i] += v; });
      });
      html += renglon('Total general', gen, 'pie-general');
    }

    tabla.tFoot.innerHTML = html;
  }

  // Estado de arranque: la pantalla abre sin datos y dice qué hacer.
  // Correr la consulta completa sin que nadie la pida devuelve cada
  // cliente por cada clave por doce meses, que no le sirve a nadie.
  function pintarVacio() {
    limpiarAvisos();
    var tabla = document.getElementById('tablaPivote');
    tabla.tHead.innerHTML = '';
    tabla.tFoot.innerHTML = '';
    tabla.tBodies[0].innerHTML = '<tr><td class="vacio">'
      + '<b>Elige al menos un cliente o una clave para ejecutar el reporte.</b><br>'
      + 'Ajusta también el periodo si lo necesitas. El resultado se arma sobre lo que '
      + 'selecciones, y el archivo que exportes lleva impreso ese recorte.'
      + '</td></tr>';
    pintarSeleccion();
  }

  function pintar() {
    var d = S.data;
    if (!d) return pintarVacio();
    pintarAvisos(d);
    pintarTabla(d);
    pintarSeleccion();
  }

  // ── modal con búsqueda ─────────────────────────────────────────────
  function abrirModal(titulo, items, seleccion, onAceptar, extra) {
    S.modal = { items: items, sel: seleccion.slice(), onAceptar: onAceptar };
    document.getElementById('modalTitulo').textContent = titulo;
    document.getElementById('modalBuscar').value = '';
    document.getElementById('modalBody').innerHTML = (extra || '')
      + items.map(function (it) {
        var puesto = seleccion.indexOf(it.ref) >= 0;
        return '<label class="opcion" data-ref="' + esc(it.ref) + '" data-buscar="' + esc(norm(it.buscar)) + '">'
          + '<input type="checkbox"' + (puesto ? ' checked' : '') + '> '
          + '<span class="op-nom">' + esc(it.nombre) + '</span> '
          + '<span class="op-meta">' + esc(it.meta) + '</span>'
          + '</label>';
      }).join('');
    document.getElementById('modal').hidden = false;
    document.getElementById('modalBuscar').focus();
  }

  function cerrarModal() {
    document.getElementById('modal').hidden = true;
    S.modal = null;
  }

  function filtrarModal() {
    var q = norm(document.getElementById('modalBuscar').value);
    var nodos = document.querySelectorAll('#modalBody [data-ref]');
    for (var i = 0; i < nodos.length; i++) {
      nodos[i].hidden = q ? nodos[i].dataset.buscar.indexOf(q) < 0 : false;
    }
  }

  function seleccionDelModal() {
    var out = [];
    var nodos = document.querySelectorAll('#modalBody [data-ref]');
    for (var i = 0; i < nodos.length; i++) {
      var cb = nodos[i].querySelector('input[type=checkbox]');
      if (cb && cb.checked) out.push(nodos[i].dataset.ref);
    }
    return out;
  }

  // ── llamadas ───────────────────────────────────────────────────────
  function qs(extra) {
    var p = ['desde=' + encodeURIComponent(S.desde), 'hasta=' + encodeURIComponent(S.hasta)];
    if (S.clientes.length) p.push('clientes=' + encodeURIComponent(S.clientes.join(',')));
    if (S.claves.length) p.push('claves=' + encodeURIComponent(S.claves.join(',')));
    (extra || []).forEach(function (x) { p.push(x); });
    return '?' + p.join('&');
  }

  async function cargarClientes() {
    var r = cuerpo(await KoguApi.apiFetch(API + '/clientes?desde=' + encodeURIComponent(S.desde)
      + '&hasta=' + encodeURIComponent(S.hasta)
      + (S.claves.length ? '&claves=' + encodeURIComponent(S.claves.join(',')) : '')));
    S.catClientes = r.clientes || [];
  }

  async function cargarClaves() {
    var url = API + '/claves?desde=' + encodeURIComponent(S.desde)
      + '&hasta=' + encodeURIComponent(S.hasta)
      + (S.clientes.length ? '&clientes=' + encodeURIComponent(S.clientes.join(',')) : '')
      + (S.clavesHistorico ? '&historico=1' : '');
    var r = cuerpo(await KoguApi.apiFetch(url));
    S.catClaves = r.claves || [];
    S.clavesVentana = r.ventana || 'periodo';
  }

  async function consultar() {
    if (!hayFiltro()) {
      S.data = null;
      pintarVacio();
      return;
    }
    var r = cuerpo(await KoguApi.apiFetch(API + qs(['agrupar=' + S.agrupar])));
    S.data = r;
    pintar();
  }

  // ── exportación ─────────────────────────────────────────────────────
  // El libro lo arma el backend con exceljs sobre la MISMA respuesta que
  // pintó la pantalla, así que el archivo y lo que ves no pueden diferir.
  // Trae cuatro hojas —Resumen, Por cliente, Por cliente y clave, Datos—
  // que son los tres pivotes que hoy se arman a mano en Excel más el
  // renglón plano, con la procedencia impresa y los totales por unidad.
  async function descargarExcel(boton) {
    if (!hayFiltro()) {
      KoguApi.toast('Elige al menos un cliente o una clave antes de exportar.', 'info');
      return;
    }
    try {
      var res = await KoguApi.authFetchRaw(API + '/export' + qs(['agrupar=' + S.agrupar]));
      if (!res.ok) { KoguApi.toast('No se pudo generar el archivo.', 'error'); return; }
      var blob = await res.blob();
      var cd = res.headers.get('Content-Disposition') || '';
      var m = cd.match(/filename="?([^"]+)"?/);
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = m ? m[1] : 'ventas_' + S.desde + '_' + S.hasta + '.xlsx';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    } catch (err) {
      KoguApi.toast(err && err.message ? err.message : String(err), 'error');
    }
  }

  // ── pestaña comparativa ────────────────────────────────────────────
  // Consulta pura: no escribe, no alerta, no toca el triaje. La vista
  // mensual de arriba no se modificó; aquí todo es código nuevo al lado.
  var ETIQUETA = {
    nueva: 'nueva',
    dejo_de_comprar: 'dejó de comprar',
    comparable: '',
  };

  function medida() { return S.metrica === 'cantidad' ? 'cantidad' : S.metrica; }

  function valorDe(bloque) { return Number(bloque[medida()] || 0); }

  // El porcentaje contra cero no existe. Cuando viene null se imprime la
  // etiqueta del estado, nunca un Infinity disfrazado de dato.
  function pctTxt(f) {
    var v = f.delta_pct ? f.delta_pct[medida()] : null;
    if (v === null || v === undefined) return '<span class="etq">' + esc(ETIQUETA[f.estado] || '—') + '</span>';
    var signo = v > 0 ? '+' : '';
    var txt = (Math.round(v * 10) % 10 === 0) ? String(Math.round(v)) : v.toFixed(1);
    return '<b class="' + (v < 0 ? 'baja' : (v > 0 ? 'sube' : '')) + '">' + signo + txt + '%</b>';
  }

  function deltaTxt(f) {
    var v = Number(f.delta[medida()] || 0);
    return '<span class="' + (v < 0 ? 'baja' : (v > 0 ? 'sube' : '')) + '">'
      + (v > 0 ? '+' : '') + num(v) + '</span>';
  }

  function cambiarTab(t) {
    S.tab = t;
    document.getElementById('vistaMensual').hidden = (t !== 'mensual');
    document.getElementById('vistaComparativo').hidden = (t !== 'comparativo');
    document.getElementById('tabMensual').className = 'tab' + (t === 'mensual' ? ' activa' : '');
    document.getElementById('tabComparativo').className = 'tab' + (t === 'comparativo' ? ' activa' : '');
    // Exportar pertenece a la vista mensual: el libro comparativo todavía
    // no existe y ofrecer el botón sería prometer lo que no hay.
    document.getElementById('btnExportar').hidden = (t !== 'mensual');
  }

  function pintarVacioComp() {
    document.getElementById('avisoLongitud').innerHTML =
      '<b>Elige al menos un cliente o una clave para comparar.</b>';
    document.getElementById('devolucionesComp').innerHTML = '';
    document.getElementById('procedenciaComp').innerHTML = '';
    var t = document.getElementById('tablaComp');
    t.querySelector('thead').innerHTML = '';
    t.querySelector('tbody').innerHTML = '';
    t.querySelector('tfoot').innerHTML = '';
  }

  function pintarAvisosComp(d) {
    var pr = d.procedencia || {};
    var pe = d.periodos || {};
    var a = pe.actual || {};
    var c = pe.comparacion || {};

    // La lección que el Radar ya pagó: comparar 43 días contra 61 hacía
    // "caer" ~30% a todos por pura aritmética. Si las longitudes difieren
    // hay que decirlo antes de que alguien lea el porcentaje.
    var aviso = 'Periodo <b>' + esc(a.desde) + ' a ' + esc(a.hasta) + '</b> (' + a.dias + ' días)'
      + ' contra <b>' + esc(c.desde) + ' a ' + esc(c.hasta) + '</b> (' + c.dias + ' días).';
    if (pe.longitudes_iguales === false) {
      aviso += ' <b class="baja">Cuidado: las longitudes son distintas</b>'
        + ' — las variaciones incluyen la diferencia de días, no sólo la de ventas.';
    }
    document.getElementById('avisoLongitud').innerHTML = aviso;

    var dv = d.devoluciones || {};
    var dA = dv.actual || {}; var dC = dv.comparacion || {};
    document.getElementById('devolucionesComp').innerHTML =
      'Devoluciones ya descontadas — periodo actual: ' + (dA.renglones || 0) + ' renglón(es), '
      + num(dA.cantidad || 0) + ' · comparación: ' + (dC.renglones || 0) + ' renglón(es), '
      + num(dC.cantidad || 0) + '.';

    document.getElementById('procedenciaComp').innerHTML =
      'Fecha: <b>' + esc(pr.fecha_campo) + '</b> · cantidad: <b>' + esc(pr.cantidad_campo) + '</b>'
      + ' · importe: <b>' + esc(pr.importe_campo) + '</b> · USD: ' + esc(pr.usd_regla)
      + ' · agrupado por <b>' + esc(pr.agrupar) + '</b> · comparación <b>' + esc(pr.preset) + '</b>.';
  }

  function pintarComparativo(d) {
    pintarAvisosComp(d);
    var porCanonica = d.agrupar === 'canonica';
    var tabla = document.getElementById('tablaComp');

    var cabecera = porCanonica
      ? '<th>Clave canónica</th><th>Mercado</th>'
      : '<th>Cliente</th><th>Clave</th>';
    tabla.querySelector('thead').innerHTML =
      '<tr>' + cabecera + '<th>Unidad</th>'
      + '<th class="n">Periodo actual</th><th class="n">Comparación</th>'
      + '<th class="n">Variación</th><th class="n">%</th></tr>';

    tabla.querySelector('tbody').innerHTML = (d.filas || []).map(function (f) {
      var ident = porCanonica
        ? '<td>' + esc(f.clave_canonica) + '</td><td>' + esc(f.mercado) + '</td>'
        : '<td>' + esc(f.cliente || '') + '</td><td>' + esc(f.cve_prod) + '</td>';
      var etq = f.estado !== 'comparable'
        ? ' <span class="etq">' + esc(ETIQUETA[f.estado]) + '</span>' : '';
      return '<tr>' + ident + '<td>' + esc(f.unidad) + etq + '</td>'
        + '<td class="n">' + num(valorDe(f.actual)) + '</td>'
        + '<td class="n">' + num(valorDe(f.comparacion)) + '</td>'
        + '<td class="n">' + deltaTxt(f) + '</td>'
        + '<td class="n">' + pctTxt(f) + '</td></tr>';
    }).join('');

    // Totales: cantidad POR UNIDAD, nunca uno solo. El dinero sí se
    // totaliza entre unidades, porque un peso es un peso.
    var pie = '';
    if (medida() === 'cantidad') {
      pie = (d.totales_unidad || []).map(function (t) {
        var v = Number(t.delta.cantidad || 0);
        return '<tr class="total"><td colspan="' + (porCanonica ? 2 : 2) + '">Total ' + esc(t.unidad) + '</td><td></td>'
          + '<td class="n">' + num(t.actual.cantidad) + '</td>'
          + '<td class="n">' + num(t.comparacion.cantidad) + '</td>'
          + '<td class="n"><span class="' + (v < 0 ? 'baja' : (v > 0 ? 'sube' : '')) + '">'
          + (v > 0 ? '+' : '') + num(v) + '</span></td><td></td></tr>';
      }).join('');
    } else {
      var tt = d.totales || { actual: {}, comparacion: {}, delta: {} };
      var k = medida();
      var vv = Number(tt.delta[k] || 0);
      pie = '<tr class="total"><td colspan="3">Total general</td>'
        + '<td class="n">' + num(tt.actual[k] || 0) + '</td>'
        + '<td class="n">' + num(tt.comparacion[k] || 0) + '</td>'
        + '<td class="n"><span class="' + (vv < 0 ? 'baja' : (vv > 0 ? 'sube' : '')) + '">'
        + (vv > 0 ? '+' : '') + num(vv) + '</span></td><td></td></tr>';
    }
    tabla.querySelector('tfoot').innerHTML = pie;
  }

  async function consultarComparativo() {
    if (!hayFiltro()) { pintarVacioComp(); return; }
    var q = new URLSearchParams();
    q.set('desde', document.getElementById('fDesde').value);
    q.set('hasta', document.getElementById('fHasta').value);
    if (S.clientes.length) q.set('clientes', S.clientes.join(','));
    if (S.claves.length) q.set('claves', S.claves.join(','));
    q.set('agrupar', document.getElementById('fAgrupar').value);
    q.set('preset', S.preset);
    if (S.preset === 'personalizado') {
      q.set('desde2', document.getElementById('fDesde2').value || '');
      q.set('hasta2', document.getElementById('fHasta2').value || '');
    }
    try {
      var res = await KoguApi.apiFetch(API + '/comparativo?' + q.toString());
      S.comp = cuerpo(res);
      pintarComparativo(S.comp);
    } catch (e) {
      KoguApi.toast(e.message || 'No se pudo calcular la comparación.', 'error');
    }
  }

  // Despachador: cada pestaña consulta lo suyo.
  function refrescar() {
    return S.tab === 'comparativo' ? consultarComparativo() : consultar();
  }

  // ── eventos ────────────────────────────────────────────────────────
  function conectar() {
    document.getElementById('fDesde').addEventListener('change', function (e) { S.desde = e.target.value; });
    document.getElementById('fHasta').addEventListener('change', function (e) { S.hasta = e.target.value; });
    document.getElementById('fAgrupar').addEventListener('change', function (e) {
      S.agrupar = e.target.value; refrescar();
    });
    document.getElementById('fMetrica').addEventListener('change', function (e) {
      S.metrica = e.target.value;
      if (S.tab === 'comparativo') { if (S.comp) pintarComparativo(S.comp); } else { pintar(); }
    });
    document.getElementById('btnConsultar').addEventListener('click', function () { refrescar(); });
    document.getElementById('tabMensual').addEventListener('click', function () { cambiarTab('mensual'); });
    document.getElementById('tabComparativo').addEventListener('click', function () {
      cambiarTab('comparativo');
      // No consulta sola: misma regla que la pestaña mensual. Sin filtro
      // no hay reporte.
      if (hayFiltro() && S.comp === null) consultarComparativo(); else if (!hayFiltro()) pintarVacioComp();
    });
    document.getElementById('fPreset').addEventListener('change', function (e) {
      S.preset = e.target.value;
      document.getElementById('cajaPersonalizado').hidden = (S.preset !== 'personalizado');
      if (S.preset !== 'personalizado' && hayFiltro()) consultarComparativo();
    });
    document.getElementById('btnComparar').addEventListener('click', function () { consultarComparativo(); });

    document.getElementById('btnExportar').addEventListener('click', function (e) {
      return KoguUi.withLoading(e.target, function () { return descargarExcel(e.target); }, 'Generando…');
    });

    document.getElementById('btnClientes').addEventListener('click', function () {
      abrirModal('Clientes (vacío = todos)', S.catClientes.map(function (c) {
        return {
          ref: String(c.cve_cte),
          nombre: c.nombre,
          // El cliente que no llegó al catálogo aparece MARCADO, no oculto.
          meta: (c.falta_en_catalogo ? '⚠ sin alta en catálogo · ' : '')
            + (c.agente ? c.agente + ' · ' : 'sin agente · ')
            + c.renglones + ' renglones · última ' + fecha(c.ultima_venta),
          buscar: c.cve_cte + ' ' + c.nombre + ' ' + (c.agente || '') + (c.falta_en_catalogo ? ' sin alta catalogo' : ''),
        };
      }), S.clientes, async function (sel) {
        S.clientes = sel;
        // Cascada cliente → clave.
        await cargarClaves();
        await refrescar();
      });
    });

    document.getElementById('btnClaves').addEventListener('click', function () {
      var nota = '<p class="aviso">Lista armada con las claves que tuvieron venta '
        + (S.clavesHistorico ? 'en cualquier momento (histórico).' : 'en el periodo seleccionado.')
        + ' <label><input type="checkbox" id="modalHistorico"' + (S.clavesHistorico ? ' checked' : '')
        + '> incluir lo que compró antes del periodo</label></p>';
      abrirModal('Claves (vacío = todas)', S.catClaves.map(function (k) {
        return {
          ref: k.cve_prod,
          nombre: k.cve_prod + ' — ' + (k.descripcion || ''),
          meta: k.mercado + ' · ' + k.unidad + ' · ' + k.renglones + ' renglones · última ' + fecha(k.ultima_venta),
          buscar: k.cve_prod + ' ' + (k.descripcion || '') + ' ' + k.clave_canonica + ' ' + k.mercado,
        };
      }), S.claves, async function (sel) {
        S.claves = sel;
        // Cascada inversa clave → cliente.
        await cargarClientes();
        await refrescar();
      }, nota);
      var h = document.getElementById('modalHistorico');
      if (h) {
        h.addEventListener('change', async function (e) {
          S.clavesHistorico = e.target.checked;
          await cargarClaves();
          cerrarModal();
          document.getElementById('btnClaves').click();
        });
      }
    });

    document.getElementById('modalBuscar').addEventListener('input', filtrarModal);
    document.getElementById('modalBuscar').addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      var nodos = document.querySelectorAll('#modalBody [data-ref]');
      for (var i = 0; i < nodos.length; i++) {
        if (!nodos[i].hidden) {
          var cb = nodos[i].querySelector('input[type=checkbox]');
          if (cb) cb.checked = !cb.checked;
          break;
        }
      }
    });
    document.getElementById('modalCerrar').addEventListener('click', cerrarModal);
    document.getElementById('modalLimpiar').addEventListener('click', function () {
      var nodos = document.querySelectorAll('#modalBody input[type=checkbox]');
      for (var i = 0; i < nodos.length; i++) nodos[i].checked = false;
    });
    document.getElementById('modalAceptar').addEventListener('click', async function () {
      var sel = seleccionDelModal();
      var cb = S.modal && S.modal.onAceptar;
      cerrarModal();
      if (cb) await cb(sel);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && S.modal) cerrarModal();
    });
  }

  async function init() {
    try {
      await KoguShell.initShell({ titulo: 'Consulta de ventas' });
      var cont = document.getElementById('pageContent') || document.body;
      cont.innerHTML = plantilla();

      var per = periodoInicial();
      S.desde = per.desde;
      S.hasta = per.hasta;
      document.getElementById('fDesde').value = S.desde;
      document.getElementById('fHasta').value = S.hasta;

      conectar();

      await cargarClientes();
      await cargarClaves();
      // NO se consulta al abrir: la pantalla arranca vacía (§ decisión
      // del 15-oct-2026, tras ver el resultado real sin filtro).
      pintarVacio();

      if (KoguShell.subscribeEmpresaActivaChange) {
        KoguShell.subscribeEmpresaActivaChange(async function () {
          // Al cambiar de empresa no pueden quedar datos residuales.
          S.clientes = []; S.claves = []; S.data = null;
          await cargarClientes();
          await cargarClaves();
          pintarVacio();
        });
      }
    } catch (err) {
      KoguApi.toast('No se pudo cargar la consulta: ' + (err && err.message ? err.message : err), 'error');
    }
  }

  document.addEventListener('DOMContentLoaded', init);
}());

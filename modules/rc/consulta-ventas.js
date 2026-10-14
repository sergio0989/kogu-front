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

  var S = {
    desde: '', hasta: '',
    clientes: [], claves: [],
    agrupar: 'clave', metrica: 'cantidad',
    catClientes: [], catClaves: [], clavesVentana: 'periodo', clavesHistorico: false,
    data: null,
    modal: null,
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
      + '    <button type="button" class="btn" id="btnExportar">Exportar CSV</button>'
      + '  </div>'
      + '  <div id="seleccion" class="chips"></div>'
      + '</section>'

      + '<section class="card">'
      + '  <div id="medida" class="aviso"></div>'
      + '  <div id="devoluciones" class="aviso"></div>'
      + '  <div id="procedencia" class="procedencia"></div>'
      + '</section>'

      + '<section class="card">'
      + '  <div class="tabla-scroll"><table id="tablaPivote" class="tabla"><thead></thead><tbody></tbody></table></div>'
      + '</section>'

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
    var cl = S.clientes.length ? S.clientes.length + ' cliente(s)' : 'todos';
    var cv = S.claves.length ? S.claves.length + ' clave(s)' : 'todas';
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

  function pintarAvisos(d) {
    var medida = document.getElementById('medida');
    var unidades = (d.unidades || []);
    if (!unidades.length) {
      medida.textContent = '';
    } else if (d.es_kilogramo) {
      medida.innerHTML = 'Cantidad en <b>kilogramos</b>. Unidades presentes: ' + esc(unidades.join(', ')) + '.';
    } else {
      // Medido: en el 6 % de los renglones no existe kilogramo en el dato.
      medida.innerHTML = '⚠ Cantidad en <b>unidad de venta</b>, no en kilogramos: la selección mezcla '
        + esc(unidades.join(', ')) + '. Para un número en kilos, filtra a claves de unidad de peso.';
    }

    var dev = document.getElementById('devoluciones');
    var n = d.devoluciones || {};
    if (Number(n.renglones) > 0) {
      dev.innerHTML = 'Neto de devoluciones: se restaron <b>'
        + Math.abs(Number(n.cantidad) || 0).toLocaleString('es-MX', { maximumFractionDigits: 0 })
        + '</b> en ' + n.renglones + ' renglón(es) de nota de crédito, y '
        + KoguUi.money(Math.abs(Number(n.mxn) || 0)) + ' MXN.';
    } else {
      dev.textContent = 'Sin devoluciones en el periodo.';
    }

    var p = d.procedencia || {};
    document.getElementById('procedencia').innerHTML = ''
      + '<h3>Procedencia del dato</h3>'
      + '<ul>'
      + '<li><b>Periodo:</b> ' + esc(p.desde) + ' a ' + esc(p.hasta)
      + ' (' + (d.meses || []).length + ' meses, por <code>' + esc(p.fecha_campo) + '</code>)</li>'
      + '<li><b>Clientes incluidos:</b> ' + esc((p.clientes || []).join(' · ') || 'todos') + '</li>'
      + '<li><b>Claves incluidas:</b> ' + esc((p.claves || p.claves_canonicas || []).join(' · ') || 'todas') + '</li>'
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

    if (!d.filas || !d.filas.length) {
      tabla.tBodies[0].innerHTML = '<tr><td colspan="' + (meses.length + 4) + '">'
        + 'Sin ventas con ese recorte. Revisa el periodo y las claves: la clave tal como la escribe '
        + 'quien pide el dato suele ser la nacional, y la de exportación lleva punto final.</td></tr>';
      return;
    }

    tabla.tBodies[0].innerHTML = d.filas.map(function (f) {
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
  }

  function pintar() {
    var d = S.data;
    if (!d) return;
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
    var r = cuerpo(await KoguApi.apiFetch(API + qs(['agrupar=' + S.agrupar])));
    S.data = r;
    pintar();
  }

  // ── exportación: la procedencia viaja DENTRO del archivo ───────────
  function aCsv(d) {
    var p = d.procedencia || {};
    var meses = d.meses || [];
    var porCanonica = d.agrupar === 'canonica';
    var L = [];
    L.push('KOGU Multiempresa - Radar Comercial - Consulta de ventas');
    L.push('Periodo;' + p.desde + ' a ' + p.hasta + ';' + meses.length + ' meses');
    L.push('Campo de fecha;' + p.fecha_campo);
    L.push('Campo de cantidad;' + p.cantidad_campo);
    L.push('Campo de importe;' + p.importe_campo);
    L.push('Regla USD;' + p.usd_regla);
    L.push('Agrupado;' + p.agrupar);
    L.push('Clientes incluidos;' + (p.clientes || []).join(' | '));
    L.push('Claves incluidas;' + (p.claves || p.claves_canonicas || []).join(' | '));
    L.push('Unidades;' + (p.unidades || []).join(' | '));
    L.push('Medida;' + (d.es_kilogramo ? 'kilogramos' : 'cantidad en unidad de venta'));
    L.push('Neto de devoluciones;' + (p.neto_de_devoluciones ? 'si' : 'no'));
    L.push('Generado;' + p.generado_en);
    L.push('');
    L.push((porCanonica ? 'Clave canonica;Mercado' : 'Cliente;Clave') + ';Unidad;'
      + meses.join(';') + ';Total cantidad;Total MXN;Total USD');
    (d.filas || []).forEach(function (f) {
      L.push((porCanonica ? f.clave_canonica + ';' + f.mercado : (f.cliente || f.cve_cte) + ';' + f.cve_prod)
        + ';' + f.unidad + ';'
        + (f.serie || []).join(';') + ';' + f.cantidad + ';' + f.mxn + ';' + f.usd);
    });
    return L.join('\n');
  }

  function descargarCsv() {
    if (!S.data) return;
    var blob = new Blob(['﻿' + aCsv(S.data)], { type: 'text/csv;charset=utf-8;' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'consulta-ventas_' + S.desde + '_' + S.hasta + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  // ── eventos ────────────────────────────────────────────────────────
  function conectar() {
    document.getElementById('fDesde').addEventListener('change', function (e) { S.desde = e.target.value; });
    document.getElementById('fHasta').addEventListener('change', function (e) { S.hasta = e.target.value; });
    document.getElementById('fAgrupar').addEventListener('change', function (e) {
      S.agrupar = e.target.value; consultar();
    });
    document.getElementById('fMetrica').addEventListener('change', function (e) {
      S.metrica = e.target.value; pintar();
    });
    document.getElementById('btnConsultar').addEventListener('click', function () { consultar(); });
    document.getElementById('btnExportar').addEventListener('click', descargarCsv);

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
        await consultar();
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
        await consultar();
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
      await consultar();

      if (KoguShell.subscribeEmpresaActivaChange) {
        KoguShell.subscribeEmpresaActivaChange(async function () {
          // Al cambiar de empresa no pueden quedar datos residuales.
          S.clientes = []; S.claves = []; S.data = null;
          await cargarClientes();
          await cargarClaves();
          await consultar();
        });
      }
    } catch (err) {
      KoguApi.toast('No se pudo cargar la consulta: ' + (err && err.message ? err.message : err), 'error');
    }
  }

  document.addEventListener('DOMContentLoaded', init);

  // Expuesto solo para la prueba de render.
  window.__consultaVentasCsv = aCsv;
}());

// ============================================================
// modules/cob/cartera/cartera.js
// Cobranza F1 · Cartera por cobrar — la pantalla de la sesión semanal
// (lunes 9:00). Estructura de KPIs de CRM: fichas arriba y, al elegir una,
// el detalle por factura; clic en la factura abre su ficha con la historia
// en los cortes.
//
// GET /protected/cob/cartera[?corte_id=]  → corte + documentos + fichas
// GET /protected/cob/cortes               → selector de corte
// GET /protected/cob/cartera/documentos/:id → ficha de factura
//
// Se pide el corte completo (cientos de renglones) y los filtros corren en
// el navegador con CobComun, igual que la maqueta validada. Las sumas usan
// saldo_mxn_exacto para cuadrar con SAI al centavo.
// Prueba: tests/cob-cartera-render.test.mjs
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/cob/cartera/cartera.html';
  const CARGAR = '/modules/cob/cargar/cargar.html';
  const C = window.CobComun;

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Cartera por cobrar',
    description: 'Qué se debe, desde cuándo y quién lo sigue · corte semanal de SAI.',
    requiredPermission: 'cob.cartera.read',
  });
  if (!b) return;
  const permisos = b.permissions || b.permisos || [];
  const puedeCargar = permisos.includes('cob.corte.cargar');
  const puedeSeguir = permisos.includes('cob.seguimiento.write');   // F1b: cfdi_cobranza y administradores

  const esc = (s) => KoguUi.escapeHtml(s);
  const $ = (id) => document.getElementById(id);
  const api = async (url) => (await KoguApi.apiFetch(url)).data;
  const avisarError = (e) => KoguApi.toast((e && e.message) || 'No se pudo cargar la cartera.', 'error');

  estilos();
  const cont = $('pageContent');
  cont.innerHTML = `
<div class="stack cob" style="gap:16px">
  <div class="card">
    <div class="cob-filtros">
      <div><div class="label-text">Corte</div><select class="select" id="cobCorte"></select></div>
      <div><div class="label-text">Cliente</div><select class="select" id="cobCliente" style="min-width:200px"><option value="">Todos los clientes</option></select></div>
      <div><div class="label-text">Responsable</div><select class="select" id="cobResp"><option value="">Todos</option></select></div>
      <div><div class="label-text">Moneda</div><select class="select" id="cobMoneda"><option value="">Todas</option><option>USD</option><option>MXN</option></select></div>
      <div><div class="label-text">Sesión</div><select class="select" id="cobSesion" title="Clientes que se revisan en la sesión semanal (se marca en el catálogo de clientes)"><option value="sesion">Solo los que se revisan</option><option value="todos">Todos</option><option value="excluidos">Fuera de la sesión</option></select></div>
      <div><div class="label-text">Buscar folio</div><input class="input" id="cobQ" style="width:150px" placeholder="27090, N200…"/></div>
      ${puedeCargar ? `<div class="cob-sp"></div><a class="btn" href="${CARGAR}">Cargar corte</a>` : ''}
    </div>
    <div class="cob-chips" id="cobChips"></div>
  </div>
  <div id="cobCuerpo"></div>
</div>
<div class="cob-ov" id="cobOv" style="display:none"></div>
<aside class="cob-drawer" id="cobDrawer" style="display:none" aria-label="Ficha de factura"></aside>
${puedeSeguir ? `<div class="cob-ov cob-ov2" id="cobSegOv" style="display:none"></div>
<div class="cob-modal" id="cobSegModal" style="display:none" role="dialog" aria-label="Registrar seguimiento">
  <div class="eyebrow">Seguimiento de la sesión</div><h3 style="margin:4px 0 4px">Registrar seguimiento</h3>
  <div id="cobSegResumen" class="cob-muted"></div>
  <div class="cob-form">
    <label><span class="label-text">Acción</span><select class="select" id="cobSegAccion"></select></label>
    <label><span class="label-text">Comentario</span><textarea class="input" id="cobSegTexto" rows="3" placeholder="Ej. se mandó correo con estado de cuenta; pago esta semana"></textarea></label>
    <label><span class="label-text">Fecha compromiso <span id="cobSegFechaReq" class="cob-muted"></span></span><input class="input" type="date" id="cobSegFecha"/></label>
    <div><span class="label-text">Quién gestiona</span>
      <div class="cob-radios"><label><input type="radio" name="cobSegGestiona" value="cxc" checked/> Cuentas por cobrar</label>
      <label><input type="radio" name="cobSegGestiona" value="agente"/> Agente de ventas</label></div>
      <select class="select" id="cobSegAgente" style="display:none;margin-top:8px"></select></div>
  </div>
  <div id="cobSegMsg" class="cob-msg"></div>
  <div class="cob-btns"><button type="button" class="btn" id="cobSegCancelar">Cancelar</button><button type="button" class="btn primary" id="cobSegGuardar">Guardar</button></div>
</div>` : ''}`;

  let datos = null;          // respuesta de /cartera
  let control = null;        // control CFDI del corte (si falla, la cartera se ve igual)
  let ordenExport = [];      // facturas de la tabla en el orden en que se ven (F1.1)
  let recorteExport = '';
  let cortes = [];
  let ficha = '';   // rango elegido en las fichas (aplica a las dos monedas)
  let seleccion = new Set();   // F1b: facturas marcadas para registrar seguimiento (orden de selección)
  let acciones = null;         // catálogo de acciones (se pide al abrir el formulario)
  let segDocs = [];            // facturas del formulario abierto
  let fichaAbierta = null;     // documento_id de la ficha abierta
  let rowsActuales = [];
  let gruposActuales = [];
  let orden = { k: 'saldo_mxn', dir: -1 };
  const filtro = () => ({ cliente: $('cobCliente').value, responsable: $('cobResp').value, moneda: $('cobMoneda').value, sesion: $('cobSesion').value, q: $('cobQ').value });

  // ── Carga ────────────────────────────────────────────────────────
  async function cargar(corteId) {
    $('cobCuerpo').innerHTML = '<div class="card cob-muted">Cargando cartera…</div>';
    try {
      const [cart, lista] = await Promise.all([
        api(corteId ? `/protected/cob/cartera?corte_id=${encodeURIComponent(corteId)}` : '/protected/cob/cartera'),
        api('/protected/cob/cortes?limit=30').catch(() => []),
      ]);
      datos = cart; cortes = Array.isArray(lista) ? lista : [];
      seleccion = new Set();
      // Columnas USD / MXN de la tabla (para ordenar por cada una).
      if (datos && datos.documentos) datos.documentos.forEach((d) => { d.usd = d.moneda === 'USD' ? d.saldo : null; d.mxn = d.moneda === 'MXN' ? d.saldo : null; });
      // Control fiscal CFDI del mismo corte: opcional, no bloquea la cartera.
      control = null;
      if (datos && datos.corte) {
        try {
          control = await api(`/protected/cob/controles/cfdi?corte_id=${encodeURIComponent(datos.corte.corte_id)}`);
          C.unirControlCfdi(datos.documentos, control);
        } catch (e) { control = null; }
      }
      llenarFiltros();
      render();
    } catch (e) {
      datos = null;
      $('cobCuerpo').innerHTML = '<div class="card cob-muted">No se pudo cargar la cartera.</div>';
      avisarError(e);
    }
  }

  function llenarFiltros() {
    const sel = $('cobCorte');
    const vis = cortes.filter((c) => c.status === 'aplicado' || c.status === 'reemplazado');
    sel.innerHTML = vis.map((c) => `<option value="${esc(c.corte_id)}">${C.fmtFecha(c.fecha_corte)} · ${c.status === 'aplicado' ? 'SAI' : 'reemplazado'}</option>`).join('')
      || '<option value="">Sin cortes</option>';
    if (datos && datos.corte) sel.value = datos.corte.corte_id;
    const docs = (datos && datos.documentos) || [];
    const keep = (id) => $(id).value;
    const cli = keep('cobCliente'); const resp = keep('cobResp');
    $('cobCliente').innerHTML = '<option value="">Todos los clientes</option>' +
      C.opcionesClientes(docs).map((o) => `<option value="${esc(o.valor)}">${esc(o.nombre)}</option>`).join('');
    $('cobResp').innerHTML = '<option value="">Todos</option>' +
      C.opcionesResponsables(docs).map((o) => `<option value="${esc(o.valor)}">${esc(o.nombre)}</option>`).join('');
    $('cobCliente').value = docs.some((d) => d.cve_cte === cli) ? cli : '';
    $('cobResp').value = [...$('cobResp').options].some((o) => o.value === resp) ? resp : '';
  }

  // ── Render ───────────────────────────────────────────────────────
  function render() {
    const cuerpo = $('cobCuerpo');
    if (!datos || !datos.corte) {
      $('cobChips').innerHTML = '';
      cuerpo.innerHTML = `<div class="card cob-vacio"><b>Todavía no hay cortes aplicados.</b>
        <div class="cob-muted" style="margin-top:6px">La cartera se arma con el export de SAI "Cuentas por cliente y factura" que Facturación carga cada viernes.</div>
        ${puedeCargar ? `<div style="margin-top:16px"><a class="btn primary" href="${CARGAR}">Cargar el primer corte</a></div>` : ''}</div>`;
      return;
    }
    const f = filtro();
    const base = C.filtrar(datos.documentos, f);
    const rows = C.ordenar(C.filtrar(base, { ficha }), orden.k, orden.dir);
    const corte = datos.corte;

    const chips = [];
    if (f.cliente) chips.push(['cobCliente', 'Cliente', $('cobCliente').selectedOptions[0]?.text]);
    if (f.responsable) chips.push(['cobResp', 'Responsable', $('cobResp').selectedOptions[0]?.text]);
    if (f.moneda) chips.push(['cobMoneda', 'Moneda', f.moneda]);
    if (f.sesion !== 'todos') chips.push(['cobSesion', 'Sesión', C.SESION[f.sesion]]);
    if (f.q) chips.push(['cobQ', 'Folio', f.q]);
    if (ficha) chips.push(['ficha', 'Ficha', C.fichaDe(ficha).l]);
    recorteExport = chips.map((c) => `${c[1]}: ${c[2]}`).join(' · ');
    $('cobChips').innerHTML = chips.map(([id, l, v]) => `<button type="button" class="cob-chip" data-quitar="${id}">${esc(l)}: <b>${esc(v)}</b> ×</button>`).join('');

    const recorte = [`Corte ${C.fmtFecha(corte.fecha_corte)} · SAI`, ...(corte.status === 'reemplazado' ? ['reemplazado'] : []), ...chips.map((c) => `${c[1]}: ${c[2]}`)].join(' · ');
    // Dos filas de fichas, una por moneda y cada una en su moneda: como el reporte
    // de Facturación, pesos y dólares no se suman.
    const fichas = C.fichasPorMoneda(base).filter((r) => !f.moneda || r.moneda === f.moneda).map((r) => `
      <div class="cob-fila" data-moneda="${r.moneda}"><div class="cob-fila-l">${r.moneda === 'MXN' ? 'Pesos' : 'Dólares'}</div>
      <div class="cob-kpis">${r.fichas.map((x) => {
        const hint = x.k === 'cartera' ? `${x.docs} docs · ${x.clientes} clientes` : `${x.docs} docs`;
        return `<button type="button" class="cob-kpi ${ficha === x.k ? 'sel' : ''}" data-ficha="${x.k}" style="--k:${x.color};${x.valor ? `--kv:${x.color}` : ''}">
          <div class="l">${esc(x.l)}</div><div class="v">${C.dineroCortoMoneda(x.saldo, r.moneda)}</div><div class="h">${hint}</div></button>`;
      }).join('')}</div></div>`).join('');
    // F1b: fila de seguimiento (cuenta facturas; los montos por moneda, sin sumarlas).
    const montosSeg = (pm) => [pm.USD.docs ? C.dineroCortoMoneda(pm.USD.saldo, 'USD') : '', pm.MXN.docs ? C.dineroCortoMoneda(pm.MXN.saldo, 'MXN') : ''].filter(Boolean).join(' · ') || '—';
    const fichasSeg = `<div class="cob-fila" data-seg><div class="cob-fila-l">Seguimiento</div><div class="cob-kpis">${C.fichasSeguimiento(base).map((x) => `
      <button type="button" class="cob-kpi cob-kpi-seg ${ficha === x.k ? 'sel' : ''}" data-ficha="${x.k}" title="${esc(x.ayuda)}" style="--k:${x.color};--kv:${x.color}">
        <div class="l">${esc(x.l)}</div><div class="v">${x.docs}</div><div class="h">${x.docs === 1 ? 'factura' : 'facturas'} · ${montosSeg(x.por_moneda)}</div></button>`).join('')}</div></div>`;
    // Control CFDI: lo fiscal y lo que falta descargar del SAT, en fichas aparte.
    const cfdi = control ? C.fichasCfdi(base) : [];
    const pl2 = (n, a, b) => `${n} ${n === 1 ? a : b}`;
    const fichasCfdi = control ? `<div class="cob-fila" data-cfdi><div class="cob-fila-l">CFDI</div><div class="cob-kpis">${cfdi.map((x) => `
      <button type="button" class="cob-kpi cob-kpi-seg ${ficha === x.k ? 'sel' : ''}" data-ficha="${x.k}" title="${esc(x.ayuda)}" style="--k:${x.color};--kv:${x.color}">
        <div class="l">${esc(x.l)}</div><div class="v">${x.docs}</div><div class="h">${x.docs === 1 ? 'factura' : 'facturas'}${x.k === 'cfdi_descarga' && x.docs ? ` · ${pl2(x.fechas.length, 'fecha', 'fechas')}` : ''} · ${montosSeg(x.por_moneda)}</div></button>`).join('')}</div></div>` : '';
    const descarga = cfdi.find((x) => x.k === 'cfdi_descarga');
    const avisoDescarga = descarga && descarga.docs
      ? `<div class="cob-aviso">Falta descargar del SAT los CFDI emitidos de ${pl2(descarga.fechas.length, 'día', 'días')}: ${descarga.fechas.map((f) => C.fmtFecha(f)).join(', ')}. Pide esas fechas en CFDI › Solicitudes SAT (emitidos); mientras, sus facturas salen como "CFDI por descargar".</div>` : '';
    const tot = C.resumenFichas(base)[0];
    // Lo que el filtro de sesión deja fuera, para que el total siga cuadrando con SAI.
    const fz = f.sesion === 'sesion' ? C.fueraDeSesion(C.filtrar(datos.documentos, { ...f, sesion: 'todos' })) : null;
    const pl = (n, a, b) => `${n} ${n === 1 ? a : b}`;
    const lineaFuera = fz && fz.docs ? `<div class="cob-muted" id="cobFuera" style="font-size:12px;margin-top:4px">${pl(fz.docs, 'factura', 'facturas')} de ${pl(fz.clientes, 'cliente', 'clientes')} fuera de la sesión: ${
      [fz.por_moneda.USD.docs ? 'US' + C.dinero(fz.por_moneda.USD.saldo) : '', fz.por_moneda.MXN.docs ? C.dinero(fz.por_moneda.MXN.saldo) : ''].filter(Boolean).join(' · ')
    }. Para verlas, cambia Sesión a Todos.</div>` : '';
    const avisos = C.avisos(base, corte).map((a) => `<div class="cob-aviso ${a.tipo === 'desactualizado' ? 'mal' : ''}">${esc(a.texto)}</div>`).join('') + avisoDescarga;

    const totM = C.totalesMoneda(rows);
    const cols = [['folio', 'Folio'], ['cliente', 'Cliente'], ['agente', 'Agente'], ['fecha_doc', 'Factura'], ['fecha_vencimiento', 'Vence'],
      ['dias_vencido', 'Días', 'num'], ['usd', 'USD', 'num'], ['mxn', 'MXN', 'num'], ['bucket', 'Antigüedad'], ['', 'Último seguimiento']];
    rowsActuales = rows;
    const sel0 = puedeSeguir ? 1 : 0;   // columna de casillas
    const nCols = cols.length + sel0;
    const th = (puedeSeguir ? `<th class="sel"><input type="checkbox" data-sel-todos aria-label="Seleccionar todas"/></th>` : '') +
      cols.map(([k, l, c]) => (k ? `<th data-orden="${k}" class="${c || ''}">${l}${orden.k === k ? (orden.dir > 0 ? ' ▲' : ' ▼') : ''}</th>` : `<th>${l}</th>`)).join('');
    const agrupar = $('cobAgrupar') ? $('cobAgrupar').checked : false;
    let tbody;
    if (agrupar) {
      gruposActuales = C.agrupar(rows);
      const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;
      ordenExport = gruposActuales.flatMap((g) => g.docs);
      tbody = gruposActuales.map((g, i) => `<tr class="g" data-grupo="${i}">${puedeSeguir ? `<td class="sel"><input type="checkbox" data-sel-grupo="${i}" ${g.docs.every((d) => seleccion.has(d.documento_id)) ? 'checked' : ''} aria-label="Seleccionar facturas del cliente"/></td>` : ''}<td colspan="6">▸ ${esc(g.cliente)} · ${plural(g.docs.length, 'doc', 'docs')}${g.vencidas ? ` · <span class="cob-rojo">${plural(g.vencidas, 'vencida', 'vencidas')}</span>` : ''}</td>
          <td class="num">${g.por_moneda.USD ? C.numero(g.por_moneda.USD) : ''}</td><td class="num">${g.por_moneda.MXN ? C.numero(g.por_moneda.MXN) : ''}</td><td></td><td></td></tr>` + g.docs.map((d) => fila(d, i)).join('')).join('');
    } else {
      ordenExport = rows;
      tbody = rows.map((d) => fila(d)).join('');
    }
    if (!rows.length) tbody = `<tr><td colspan="${nCols}" class="cob-muted" style="padding:20px">Sin documentos con este recorte.</td></tr>`;
    const tfoot = `<tr class="tot"><td colspan="${6 + sel0}">Total · ${totM.USD.docs} en dólares · ${totM.MXN.docs} en pesos</td>
      <td class="num" id="cobTotUSD">${C.numero(totM.USD.saldo)}</td><td class="num" id="cobTotMXN">${C.numero(totM.MXN.saldo)}</td><td></td><td></td></tr>`;

    const resp = C.porResponsable(base);
    const mon = (pm, m) => (pm.docs ? `<span>${m === 'USD' ? 'US' : ''}${C.dinero(pm.saldo)} <span class="cob-muted">· ${pm.docs} docs</span></span>` : '<span class="cob-muted">—</span>');

    cuerpo.innerHTML = `
  <div class="card">
    <div class="eyebrow" id="cobRecorte">${esc(recorte)}</div>
    ${fichas}
    ${fichasSeg}
    ${fichasCfdi}
    <div id="cobAvisos">${avisos}<div class="cob-muted" id="cobControl" style="font-size:12px;margin-top:6px">${tot.docs} docs · ${tot.clientes} clientes · equivalente en pesos ${C.dinero(tot.saldo_mxn)} (tipo de cambio de cada factura, igual que el pie del reporte de SAI).</div>${lineaFuera}</div>
  </div>
  <div class="card">
    <div class="cob-toolbar">
      <div class="eyebrow">Detalle por factura</div>
      <label class="cob-tog"><input type="checkbox" id="cobAgrupar" ${agrupar ? 'checked' : ''}/> Agrupar por cliente</label>
      <span class="cob-sp"></span>
      <span id="cobConteo" class="cob-muted">${rows.length} documentos</span>
      <button type="button" class="btn" id="cobEdoCta" ${f.cliente ? '' : 'disabled'} title="${f.cliente ? 'Estado de cuenta en PDF del cliente filtrado, con el corte que se ve' : 'Elige un cliente en el filtro Cliente'}">Estado de cuenta (PDF)</button>
      <button type="button" class="btn" id="cobExportar" ${rows.length ? '' : 'disabled'} title="Las facturas de la tabla, en este orden, con su último seguimiento">Exportar a Excel</button>
      ${puedeSeguir ? '<button type="button" class="btn primary" id="cobRegistrar" disabled>Registrar seguimiento (0)</button>' : ''}
    </div>
    <div class="cob-scroll"><table class="cob-tbl" id="cobTabla"><thead><tr>${th}</tr></thead><tbody>${tbody}</tbody><tfoot>${tfoot}</tfoot></table></div>
  </div>
  <div class="card">
    <div class="eyebrow">Vencido por responsable de cobranza</div>
    <div class="cob-muted" style="margin-top:4px">Según el responsable asignado en el catálogo de clientes.</div>
    <div class="cob-cov" id="cobResponsables"><div class="cob-covr cob-covh"><span></span><span>Dólares</span><span>Pesos</span></div>
      ${resp.map((r) => `<div class="cob-covr" data-resp="${esc(r.responsable_id || '__none')}"><b class="${r.responsable_id ? '' : 'cob-muted'}">${esc(r.responsable)}</b>
      ${mon(r.por_moneda.USD, 'USD')}${mon(r.por_moneda.MXN, 'MXN')}</div>`).join('') || '<div class="cob-muted">Sin vencido con este recorte.</div>'}</div>
  </div>`;
    $('cobAgrupar').addEventListener('change', render);   // directo: el cuerpo se repinta en cada render
    $('cobExportar').addEventListener('click', exportar);
    $('cobEdoCta').addEventListener('click', estadoCuenta);
    actualizarSeleccion();
  }

  // ── Selección para registrar seguimiento (F1b) ──────────────────
  // Cliente del estado de cuenta: el del filtro Cliente o, si no hay, el de las
  // casillas marcadas cuando todas son del mismo cliente (caso real 30-oct).
  function clienteEdoCta() {
    const fil = $('cobCliente') ? $('cobCliente').value : '';
    if (fil) return { cve: fil };
    if (!seleccion.size || !datos || !datos.documentos) return { cve: '', motivo: 'Elige un cliente en el filtro Cliente o marca facturas de un solo cliente' };
    const cves = new Set(datos.documentos.filter((d) => seleccion.has(d.documento_id)).map((d) => d.cve_cte));
    return cves.size === 1 ? { cve: [...cves][0] } : { cve: '', motivo: 'Las facturas marcadas son de varios clientes: marca facturas de un solo cliente' };
  }
  function actualizarEdoCta() {
    const b = $('cobEdoCta');
    if (!b || b.textContent === 'Generando…') return;
    const c = clienteEdoCta();
    b.disabled = !c.cve;
    b.title = c.cve ? 'Estado de cuenta en PDF del cliente, con el corte que se ve' : c.motivo;
  }

  function actualizarSeleccion() {
    actualizarEdoCta();
    const b = $('cobRegistrar');
    if (!b) return;
    b.textContent = `Registrar seguimiento (${seleccion.size})`;
    b.disabled = seleccion.size === 0;
  }

  function celdaSeg(d) {
    const s = d.ultimo_seguimiento;
    const comp = d.compromiso
      ? `<div class="${d.compromiso.vencido ? 'cob-rojo' : 'cob-muted'}">Compromiso ${C.fmtFecha(d.compromiso.fecha)}${d.compromiso.vencido ? ' vencido' : ''}</div>` : '';
    if (!s) return (d.sin_seguimiento ? '<span class="cob-rojo">Sin seguimiento</span>' : '<span class="cob-muted">—</span>') + comp;
    const texto = s.texto ? `<div class="cob-muted cob-trunc" title="${esc(s.texto)}">${esc(s.texto)}</div>` : '';
    return `<div class="cob-seg"><b>${esc(s.accion)}</b> · ${C.fmtFecha(s.fecha)}${s.agente ? ` · ${esc(s.agente)}` : ''}</div>${texto}${comp}`;
  }

  // F1.1: el backend arma el Excel con estas facturas, en este orden; los
  // filtros viven aquí, así archivo y pantalla no pueden diferir.
  async function exportar() {
    const btn = $('cobExportar');
    if (!datos || !datos.corte || !ordenExport.length) return;
    btn.disabled = true; btn.textContent = 'Generando…';
    try {
      const res = await KoguApi.authFetchRaw('/protected/cob/cartera/export', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ corte_id: datos.corte.corte_id, documento_ids: ordenExport.map((d) => d.documento_id), recorte: recorteExport }),
      });
      if (!res.ok) {
        let msg = 'No se pudo generar el archivo.';
        try { const j = await res.json(); if (j && j.message) msg = j.message; } catch (e) { /* sin cuerpo */ }
        KoguApi.toast(msg, 'error');
        return;
      }
      const blob = await res.blob();
      const m = (res.headers.get('Content-Disposition') || '').match(/filename="?([^"]+)"?/);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = m ? m[1] : `cartera_${datos.corte.fecha_corte}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch (e) {
      KoguApi.toast((e && e.message) || 'No se pudo generar el archivo.', 'error');
    } finally {
      if ($('cobExportar')) { $('cobExportar').disabled = !ordenExport.length; $('cobExportar').textContent = 'Exportar a Excel'; }
    }
  }

  // Estado de cuenta en PDF del cliente filtrado (idioma según su ficha).
  async function estadoCuenta() {
    const cve = clienteEdoCta().cve;
    const btn = $('cobEdoCta');
    if (!cve || !datos || !datos.corte) return;
    btn.disabled = true; btn.textContent = 'Generando…';
    try {
      const res = await KoguApi.authFetchRaw(`/protected/cob/estados-cuenta/${encodeURIComponent(cve)}/pdf?corte_id=${encodeURIComponent(datos.corte.corte_id)}`, { method: 'GET' });
      if (!res.ok) {
        let msg = 'No se pudo generar el estado de cuenta.';
        try { const j = await res.json(); if (j && j.message) msg = j.message; } catch (e) { /* sin cuerpo */ }
        KoguApi.toast(msg, 'error');
        return;
      }
      const blob = await res.blob();
      const m = (res.headers.get('Content-Disposition') || '').match(/filename="?([^"]+)"?/);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      // Mismo nombre que el servidor por si el encabezado no llega (P-001).
      a.download = m ? m[1] : `estado_cuenta_${cve.replace(/[^A-Za-z0-9_-]+/g, '')}_${datos.corte.fecha_corte}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch (e) {
      KoguApi.toast((e && e.message) || 'No se pudo generar el estado de cuenta.', 'error');
    } finally {
      if ($('cobEdoCta')) { $('cobEdoCta').textContent = 'Estado de cuenta (PDF)'; actualizarEdoCta(); }
    }
  }

  const MOTIVOS = { factoraje: 'Factoraje', intercompania: 'Intercompañía', juridico: 'Jurídico', otro: 'Otro motivo' };
  function fila(d, grupo) {
    const oculto = grupo != null ? ' style="display:none"' : '';
    const tipo = d.tipo_doc !== 'FAC' ? ` <span class="cob-b bn">${d.tipo_doc}</span>` : '';
    const marcas = (d.cobro_factoraje ? ' <span class="cob-b binfo">Factoraje</span>' : '') + (d.sin_catalogo ? ' <span class="cob-b bwarn">Sin catálogo</span>' : '')
      + (d.cfdi_estado ? ` <span class="cob-b ${d.cfdi_estado === 'falta_descarga' ? 'bn' : 'bwarn'}" title="${esc(d.cfdi_estado === 'falta_descarga' ? 'Ese día no hay CFDI emitidos descargados en KOGU' : `CFDI ${d.cfdi_estatus_sat || 'no encontrado en KOGU'}${d.cfdi_uuid ? ' · ' + d.cfdi_uuid : ''}`)}">${C.ETIQUETA_CFDI[d.cfdi_estado]}</span>` : '')
      + (d.en_sesion === false ? ` <span class="cob-b bn" title="${esc(MOTIVOS[d.motivo_fuera_sesion] || 'Marcado en el catálogo de clientes')}">Fuera de sesión</span>` : '');
    const dias = d.dias_vencido != null && d.dias_vencido > 0 ? `<b class="cob-rojo">${d.dias_vencido}</b>` : '<span class="cob-muted">—</span>';
    const sel = puedeSeguir ? `<td class="sel"><input type="checkbox" data-sel="${esc(d.documento_id)}" ${seleccion.has(d.documento_id) ? 'checked' : ''} aria-label="Seleccionar ${esc(C.folioDe(d))}"/></td>` : '';
    return `<tr class="r"${oculto} data-id="${esc(d.documento_id)}" ${grupo != null ? `data-de-grupo="${grupo}"` : ''} data-sin-catalogo="${d.sin_catalogo ? 1 : 0}">
      ${sel}<td data-col="folio"><b>${esc(C.folioDe(d))}</b>${tipo}</td><td>${esc(d.cliente)}${marcas}</td><td>${esc(d.agente || '—')}</td>
      <td>${C.fmtFecha(d.fecha_doc)}</td><td>${C.fmtFecha(d.fecha_vencimiento)}</td><td class="num">${dias}</td>
      <td class="num" data-col="usd">${d.moneda === 'USD' ? C.numero(d.saldo) : ''}</td><td class="num" data-col="mxn">${d.moneda === 'MXN' ? C.numero(d.saldo) : ''}</td>
      <td><span class="cob-b b${d.bucket || 0}">${C.etiquetaBucket(d.bucket)}</span></td><td data-col="seg">${celdaSeg(d)}</td></tr>`;
  }

  // ── Ficha de factura ────────────────────────────────────────────
  async function abrirFicha(id) {
    fichaAbierta = id;
    const dr = $('cobDrawer');
    dr.innerHTML = '<div class="cob-dh cob-muted">Cargando factura…</div>';
    dr.style.display = 'block'; $('cobOv').style.display = 'block';
    try {
      const { documento: d, historia, seguimientos = [] } = await api(`/protected/cob/cartera/documentos/${encodeURIComponent(id)}`);
      // Línea de tiempo: cortes en que apareció + seguimientos (siguen entre cortes), por fecha.
      const itemCorte = (h) => ({ fecha: h.fecha_corte, orden: 0, html: `<div><b>${C.fmtFecha(h.fecha_corte)}</b> · en cartera, saldo ${esc(d.moneda)} ${C.numero(h.saldo)} · ${h.dias_vencido > 0 ? `${h.dias_vencido} días vencida` : 'por vencer'}${h.corte_status === 'reemplazado' ? ' <span class="cob-muted">(corte reemplazado)</span>' : ''}</div>` });
      const itemSeg = (x) => {
        const f = String(x.created_at || '').slice(0, 10);
        const quien = x.agente ? ` · ${esc(x.agente)}` : (x.gestiona === 'cxc' ? ' · Cuentas por cobrar' : '');
        return { fecha: f, orden: 1, html: `<div class="cob-tl-seg ${x.anulado ? 'anulado' : ''}" data-seg-id="${esc(x.seguimiento_id)}"><b>${C.fmtFecha(f)}</b> · <b>${esc(x.accion)}</b>${x.texto ? ` — ${esc(x.texto)}` : ''}${x.fecha_compromiso ? ` · compromiso ${C.fmtFecha(x.fecha_compromiso)}` : ''}${quien}${x.creado_por ? ` <span class="cob-muted">(registró ${esc(x.creado_por)})</span>` : ''}
          ${x.anulado ? `<div class="cob-rojo">Anulado: ${esc(x.anulado_motivo || '')}</div>` : (puedeSeguir ? ` <button type="button" class="cob-link" data-anular="${esc(x.seguimiento_id)}">Anular</button>` : '')}</div>` };
      };
      const linea = [...historia.map(itemCorte), ...seguimientos.map(itemSeg)]
        .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.orden - b.orden).map((x) => x.html).join('');
      const tipo = d.tipo_doc === 'FAC' ? 'Factura' : d.tipo_doc === 'CRE' ? 'Nota de crédito' : 'Nota de cargo';
      const diasTxt = d.dias_vencido == null ? '—' : d.dias_vencido > 0 ? `${d.dias_vencido} días` : `Por vencer (${-d.dias_vencido} d)`;
      dr.innerHTML = `
  <div class="cob-dh"><button type="button" class="btn cob-x" id="cobDrawerCerrar">Cerrar</button>
    <div class="eyebrow">${tipo} · corte ${C.fmtFecha(d.fecha_corte)}</div>
    <h2>${esc(C.folioDe(d))} · ${esc(d.cliente)}</h2>
    <span class="cob-b b${d.bucket || 0}">${C.etiquetaBucket(d.bucket)}</span> <span class="cob-b bn">${esc(d.moneda)}</span>
    ${d.cobro_factoraje ? '<span class="cob-b binfo">Factoraje</span>' : ''} ${d.sin_catalogo ? '<span class="cob-b bwarn">Sin catálogo</span>' : ''}</div>
  <div class="cob-strip">
    <div><small>Total</small><b>${esc(d.moneda)} ${C.numero(d.total)}</b></div><div><small>Saldo</small><b>${esc(d.moneda)} ${C.numero(d.saldo)}</b></div>
    <div><small>Saldo MXN</small><b>${C.dinero(d.saldo_mxn)}</b></div><div><small>Días vencida</small><b class="${d.dias_vencido > 0 ? 'cob-rojo' : ''}">${diasTxt}</b></div>
    <div><small>Días de crédito</small><b>${d.dias_credito_sai ?? '—'}</b></div><div><small>TC factura</small><b>${d.moneda === 'USD' ? esc(d.tip_cam) : '—'}</b></div>
  </div>
  <div class="cob-cols">
    <div><h3>Datos</h3><div class="cob-kv">
      <span>Cliente</span><b>${esc(d.cve_cte)} · ${esc(d.cliente)}</b>
      <span>Responsable</span><b>${esc(d.responsable || 'Sin responsable en el catálogo')}</b>
      <span>Agente</span><b>${esc(d.agente || 'Sin agente en el catálogo')}</b>
      <span>Fecha factura</span><b>${C.fmtFecha(d.fecha_doc)}</b><span>Vencimiento</span><b>${C.fmtFecha(d.fecha_vencimiento)}</b>
      <span>Contacto pagos</span><b>${esc(d.contacto_pagos_sai || '— sin capturar en SAI')}</b>
      ${d.tipo_doc === 'FAC' && d.total !== d.saldo ? `<span>Abonado</span><b>${esc(d.moneda)} ${C.numero(d.total - d.saldo)} (pago parcial)</b>` : ''}
    </div></div>
    <div><h3>Historia y seguimiento</h3><div class="cob-tl" id="cobHistoria">
      ${linea}
      <div class="fut">Siguiente corte · si sale de la cartera, se cobró</div></div>
      ${puedeSeguir ? '<button type="button" class="btn primary" id="cobDrawerRegistrar" style="margin-top:14px">Registrar seguimiento</button>' : ''}
    </div>
  </div>`;
    } catch (e) {
      dr.innerHTML = '<div class="cob-dh">No se pudo abrir la factura. <button type="button" class="btn" id="cobDrawerCerrar">Cerrar</button></div>';
      avisarError(e);
    }
  }
  function cerrarFicha() { fichaAbierta = null; $('cobDrawer').style.display = 'none'; $('cobOv').style.display = 'none'; }

  // ── Formulario de seguimiento (F1b) ─────────────────────────────
  const msgSeg = (t) => { $('cobSegMsg').textContent = t || ''; };
  const accionSel = () => (acciones || []).find((a) => a.accion_id === $('cobSegAccion').value) || null;
  function refrescarForm() {
    const a = accionSel();
    $('cobSegFechaReq').textContent = a && a.requiere_fecha ? '(obligatoria para esta acción)' : '(opcional)';
    const ag = document.querySelector('input[name="cobSegGestiona"]:checked').value === 'agente';
    $('cobSegAgente').style.display = ag ? '' : 'none';
  }
  async function abrirSeguimiento(ids) {
    if (!ids.length) return;
    segDocs = ids;
    try {
      if (!acciones) acciones = await api('/protected/cob/acciones');
    } catch (e) { avisarError(e); return; }
    const docs = datos.documentos.filter((d) => ids.includes(d.documento_id));
    const clientes = new Set(docs.map((d) => d.cliente));
    $('cobSegResumen').textContent = `${ids.length} ${ids.length === 1 ? 'factura' : 'facturas'} · ${clientes.size === 1 ? [...clientes][0] : `${clientes.size} clientes`}`;
    $('cobSegAccion').innerHTML = '<option value="">Elige la acción…</option>' + acciones.map((a) => `<option value="${esc(a.accion_id)}">${esc(a.nombre)}</option>`).join('');
    $('cobSegTexto').value = ''; $('cobSegFecha').value = '';
    document.querySelector('input[name="cobSegGestiona"][value="cxc"]').checked = true;
    const ags = C.opcionesAgentes(datos.documentos);
    $('cobSegAgente').innerHTML = '<option value="">Elige el agente…</option>' + ags.map((o) => `<option value="${esc(o.valor)}">${esc(o.nombre)}</option>`).join('');
    const propios = [...new Set(docs.map((d) => d.agente_id).filter(Boolean))];
    $('cobSegAgente').value = propios.length === 1 ? propios[0] : '';
    msgSeg(''); refrescarForm();
    $('cobSegModal').style.display = 'block'; $('cobSegOv').style.display = 'block';
  }
  function cerrarSeguimiento() { if ($('cobSegModal')) { $('cobSegModal').style.display = 'none'; $('cobSegOv').style.display = 'none'; } }
  async function guardarSeguimiento() {
    const a = accionSel();
    if (!a) { msgSeg('Elige la acción.'); return; }
    const texto = $('cobSegTexto').value.trim();
    const fecha = $('cobSegFecha').value;
    const gestiona = document.querySelector('input[name="cobSegGestiona"]:checked').value;
    if (a.requiere_fecha && !fecha) { msgSeg(`"${a.nombre}" necesita fecha compromiso.`); return; }
    if (a.clave === 'otro' && !texto) { msgSeg('Describe la acción en el comentario.'); return; }
    if (gestiona === 'agente' && !$('cobSegAgente').value) { msgSeg('Elige el agente que da el seguimiento.'); return; }
    const body = { documento_ids: segDocs, accion_id: a.accion_id };
    if (texto) body.texto = texto;
    if (fecha) body.fecha_compromiso = fecha;
    body.gestiona = gestiona;
    if (gestiona === 'agente') body.agente_id = $('cobSegAgente').value;
    $('cobSegGuardar').disabled = true;
    try {
      const r = (await KoguApi.apiFetch('/protected/cob/seguimientos', { method: 'POST', body: JSON.stringify(body) })).data || {};
      KoguApi.toast(`${r.creados || segDocs.length} ${segDocs.length === 1 ? 'seguimiento registrado' : 'seguimientos registrados'}.`, 'success');
      cerrarSeguimiento();
      const abierta = fichaAbierta;
      await cargar(datos && datos.corte ? datos.corte.corte_id : null);
      if (abierta) abrirFicha(abierta);
    } catch (e) {
      msgSeg((e && e.message) || 'No se pudo registrar el seguimiento.');
    } finally {
      $('cobSegGuardar').disabled = false;
    }
  }
  async function anularSeguimiento(id, motivo) {
    try {
      await KoguApi.apiFetch(`/protected/cob/seguimientos/${encodeURIComponent(id)}/anular`, { method: 'POST', body: JSON.stringify({ motivo }) });
      KoguApi.toast('Seguimiento anulado.', 'success');
      const abierta = fichaAbierta;
      await cargar(datos && datos.corte ? datos.corte.corte_id : null);
      if (abierta) abrirFicha(abierta);
    } catch (e) { avisarError(e); }
  }

  // ── Eventos (delegados: el cuerpo se repinta) ────────────────────
  ['cobCliente', 'cobResp', 'cobMoneda', 'cobSesion'].forEach((id) => $(id).addEventListener('change', render));
  $('cobQ').addEventListener('input', render);
  $('cobCorte').addEventListener('change', () => { ficha = ''; cargar($('cobCorte').value); });
  $('cobChips').addEventListener('click', (e) => {
    const q = e.target.closest('[data-quitar]'); if (!q) return;
    if (q.dataset.quitar === 'ficha') ficha = '';
    else $(q.dataset.quitar).value = q.dataset.quitar === 'cobSesion' ? 'todos' : '';
    render();
  });
  $('cobCuerpo').addEventListener('click', (e) => {
    const k = e.target.closest('[data-ficha]');
    // La ficha filtra el rango en las dos monedas; la moneda se elige con el filtro Moneda.
    if (k) { ficha = ficha === k.dataset.ficha || k.dataset.ficha === 'cartera' ? '' : k.dataset.ficha; render(); return; }
    const th = e.target.closest('[data-orden]');
    if (th) { const key = th.dataset.orden; orden = orden.k === key ? { k: key, dir: -orden.dir } : { k: key, dir: ['dias_vencido', 'usd', 'mxn', 'bucket'].includes(key) ? -1 : 1 }; render(); return; }
    if (e.target.closest('input[data-sel], input[data-sel-grupo], input[data-sel-todos]')) return;   // casillas: las maneja "change"
    if (e.target.id === 'cobRegistrar') { abrirSeguimiento([...seleccion]); return; }
    const g = e.target.closest('tr.g');
    if (g) { document.querySelectorAll(`tr[data-de-grupo="${g.dataset.grupo}"]`).forEach((tr) => { tr.style.display = tr.style.display === 'none' ? '' : 'none'; }); return; }
    const tr = e.target.closest('tr.r');
    if (tr && tr.dataset.id) abrirFicha(tr.dataset.id);
  });
  $('cobCuerpo').addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.sel !== undefined) { if (t.checked) seleccion.add(t.dataset.sel); else seleccion.delete(t.dataset.sel); }
    else if (t.dataset.selGrupo !== undefined) {
      const g = gruposActuales[Number(t.dataset.selGrupo)];
      if (g) g.docs.forEach((d) => (t.checked ? seleccion.add(d.documento_id) : seleccion.delete(d.documento_id)));
      document.querySelectorAll(`tr[data-de-grupo="${t.dataset.selGrupo}"] input[data-sel]`).forEach((c) => { c.checked = t.checked; });
    } else if (t.dataset.selTodos !== undefined) {
      rowsActuales.forEach((d) => (t.checked ? seleccion.add(d.documento_id) : seleccion.delete(d.documento_id)));
      document.querySelectorAll('#cobTabla input[data-sel], #cobTabla input[data-sel-grupo]').forEach((c) => { c.checked = t.checked; });
    } else return;
    actualizarSeleccion();
  });
  $('cobDrawer').addEventListener('click', (e) => {
    if (e.target.id === 'cobDrawerCerrar') { cerrarFicha(); return; }
    if (e.target.id === 'cobDrawerRegistrar' && fichaAbierta) { abrirSeguimiento([fichaAbierta]); return; }
    const an = e.target.closest('[data-anular]');
    if (an) {
      document.querySelectorAll('.cob-anular').forEach((x) => x.remove());
      an.insertAdjacentHTML('afterend', `<div class="cob-anular"><input class="input" id="cobAnularMotivo" placeholder="Motivo de la anulación"/>
        <button type="button" class="btn" id="cobAnularGuardar" data-id="${esc(an.dataset.anular)}">Anular</button></div>`);
      $('cobAnularMotivo').focus();
      return;
    }
    if (e.target.id === 'cobAnularGuardar') {
      const motivo = $('cobAnularMotivo').value.trim();
      if (!motivo) { $('cobAnularMotivo').focus(); return; }
      anularSeguimiento(e.target.dataset.id, motivo);
    }
  });
  if (puedeSeguir) {
    $('cobSegCancelar').addEventListener('click', cerrarSeguimiento);
    $('cobSegOv').addEventListener('click', cerrarSeguimiento);
    $('cobSegGuardar').addEventListener('click', guardarSeguimiento);
    $('cobSegAccion').addEventListener('change', refrescarForm);
    $('cobSegModal').addEventListener('change', (e) => { if (e.target.name === 'cobSegGestiona') refrescarForm(); });
  }
  $('cobOv').addEventListener('click', cerrarFicha);
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if ($('cobSegModal') && $('cobSegModal').style.display !== 'none') cerrarSeguimiento(); else cerrarFicha();
  });

  // Cambio de empresa: limpiar todo antes de pedir, para no mostrar datos de la anterior.
  KoguShell.subscribeEmpresaActivaChange(async () => {
    datos = null; control = null; cortes = []; ficha = ''; seleccion = new Set(); acciones = null;
    cerrarSeguimiento();
    ['cobCliente', 'cobResp', 'cobMoneda', 'cobQ'].forEach((id) => { $(id).value = ''; });
    $('cobSesion').value = 'sesion';
    cerrarFicha();
    render();
    await cargar(null);
  });

  await cargar(null);

  function estilos() {
    if (document.getElementById('cobEstilos')) return;
    const s = document.createElement('style'); s.id = 'cobEstilos';
    s.textContent = `
.cob .cob-filtros{display:flex;gap:12px;flex-wrap:wrap;align-items:end}
.cob .cob-sp{flex:1}
.cob-chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:12px}
.cob-chip{border:1px solid var(--line);border-radius:999px;padding:4px 10px;font-size:12px;background:#fff;cursor:pointer}
.cob-chip b{color:#1d4ed8}
.cob-muted{color:var(--muted);font-size:13px}
.cob-rojo{color:var(--danger,#dc2626)}
.cob-kpis{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:10px;margin-top:12px}
@media(max-width:1250px){.cob-kpis{grid-template-columns:repeat(4,minmax(0,1fr))}}
@media(max-width:700px){.cob-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}
.cob-kpi{all:unset;box-sizing:border-box;border:1px solid var(--line);border-left:3px solid var(--k,#64748b);border-radius:12px;padding:12px 14px;cursor:pointer;background:#fff;min-width:0}
.cob-kpi:hover{box-shadow:0 10px 25px rgba(15,23,42,.06)}
.cob-kpi.sel{outline:2px solid var(--k);background:#f8fafc}
.cob-kpi .l{font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}
.cob-kpi .v{font-size:20px;font-weight:800;margin-top:2px;color:var(--kv,var(--text))}
.cob-kpi .h{font-size:11px;color:var(--muted);margin-top:2px}
.cob-aviso{color:#b45309;font-size:13px;margin-top:10px}
.cob-aviso.mal{color:#b91c1c;font-weight:600}
.cob-toolbar{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:12px}
.cob-tog{display:flex;align-items:center;gap:6px;font-size:13px;color:var(--muted)}
.cob-scroll{overflow:auto;max-height:calc(100vh - 170px);border:1px solid var(--line);border-radius:10px}
/* Títulos fijos arriba y totales fijos abajo mientras se recorre la tabla */
.cob-tbl thead th{position:sticky;top:0;z-index:2;box-shadow:inset 0 -1px 0 var(--line)}
.cob-tbl tfoot td{position:sticky;bottom:0;z-index:2;background:#fff;box-shadow:inset 0 2px 0 var(--line)}
.cob-tbl{width:100%;border-collapse:collapse;font-size:13px}
.cob-tbl th{background:#f8fafc;text-align:left;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);padding:10px;border-bottom:1px solid var(--line);cursor:pointer;white-space:nowrap}
.cob-tbl td{padding:9px 10px;border-bottom:1px solid var(--line);vertical-align:top}
.cob-tbl td:first-child{white-space:nowrap}
.cob-tbl tr.r:hover td{background:#f0f9ff;cursor:pointer}
.cob-tbl tr.g td{background:#f8fafc;font-weight:700;cursor:pointer}
.cob-tbl .num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.cob-tbl th.sel,.cob-tbl td.sel{width:28px;text-align:center}
.cob-tbl td[data-col="folio"]{white-space:nowrap}
.cob-tbl td[data-col="seg"]{min-width:200px;max-width:280px;font-size:12px;line-height:1.35}
.cob-trunc{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:260px}
.cob-ov2{z-index:50}
.cob-modal{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:min(560px,calc(100% - 32px));max-height:calc(100vh - 40px);overflow:auto;background:#fff;border-radius:16px;padding:20px 22px;z-index:51;box-shadow:0 20px 50px rgba(15,23,42,.25)}
.cob-form{display:grid;gap:12px;margin-top:14px}
.cob-form label{display:grid;gap:4px}
.cob-form textarea{width:100%;resize:vertical}
.cob-radios{display:flex;gap:16px;font-size:13px;flex-wrap:wrap}
.cob-radios label{display:flex;gap:6px;align-items:center}
.cob-msg{color:var(--danger,#dc2626);font-size:13px;font-weight:600;margin-top:10px;min-height:1em}
.cob-btns{display:flex;gap:10px;justify-content:flex-end;margin-top:14px}
.cob-link{all:unset;color:var(--primary,#0891b2);cursor:pointer;font-size:12px;font-weight:600;margin-left:6px}
.cob-tl .cob-tl-seg:before{background:#7c3aed}
.cob-tl .anulado{opacity:.6}
.cob-tl .anulado:before{background:#cbd5e1}
.cob-anular{display:flex;gap:8px;margin-top:6px}
.cob-anular .input{flex:1;min-width:0}
.cob-b{display:inline-block;border-radius:999px;padding:2px 8px;font-size:11px;font-weight:700;white-space:nowrap}
.cob-b.b1{background:#e0f2fe;color:#075985}.cob-b.b2{background:#fef3c7;color:#92400e}.cob-b.b3{background:#fed7aa;color:#9a3412}
.cob-b.b4{background:#fee2e2;color:#991b1b}.cob-b.b5{background:#7f1d1d;color:#fff}
.cob-b.bn{background:#f1f5f9;color:#475569}.cob-b.binfo{background:#ede9fe;color:#5b21b6}.cob-b.bwarn{background:#fef3c7;color:#92400e}
.cob-cov{display:grid;gap:10px;margin-top:10px}
.cob-covr{display:grid;grid-template-columns:200px 1fr 1fr;gap:10px;align-items:center;font-size:13px;font-variant-numeric:tabular-nums}
.cob-covh{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.cob-fila{display:grid;grid-template-columns:96px 1fr;gap:10px;align-items:center;margin-top:12px}
.cob-fila .cob-kpis{margin-top:0}
.cob-fila-l{font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.cob-tbl tfoot td{font-weight:800;padding:10px}
.cob-tbl tfoot .num{text-align:right;font-variant-numeric:tabular-nums}
@media(max-width:700px){.cob-fila{grid-template-columns:1fr}}
.cob-covr .num{text-align:right;font-variant-numeric:tabular-nums}
.cob-bar{height:14px;border-radius:7px;background:#f1f5f9;overflow:hidden;display:flex}
.cob-bar i{display:block;height:100%}
.cob-vacio{text-align:center;padding:32px}
.cob-ov{position:fixed;inset:0;background:rgba(15,23,42,.35);z-index:40}
.cob-drawer{position:fixed;top:0;right:0;height:100vh;width:min(760px,100%);background:#fff;z-index:41;overflow:auto;box-shadow:-10px 0 30px rgba(0,0,0,.15)}
.cob-dh{position:relative;padding:20px 24px;border-bottom:1px solid var(--line)}
.cob-dh h2{margin:4px 0 8px;font-size:22px}
.cob-x{position:absolute;right:18px;top:18px}
.cob-strip{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;padding:16px 24px;border-bottom:1px solid var(--line)}
.cob-strip div{background:#f8fafc;border-radius:10px;padding:10px 12px}
.cob-strip small{display:block;font-size:10px;color:var(--muted);letter-spacing:.08em;text-transform:uppercase}
.cob-strip b{font-size:16px}
.cob-cols{display:grid;grid-template-columns:1fr 1fr;gap:18px;padding:18px 24px}
.cob-cols h3{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin:0 0 10px}
.cob-kv{display:grid;grid-template-columns:130px 1fr;gap:6px 10px;font-size:13px}
.cob-kv span{color:var(--muted)}
.cob-tl{border-left:2px solid var(--line);margin-left:6px;padding-left:14px;display:grid;gap:12px;font-size:13px}
.cob-tl div{position:relative}
.cob-tl div:before{content:"";position:absolute;left:-20px;top:4px;width:10px;height:10px;border-radius:50%;background:var(--primary,#0891b2)}
.cob-tl .fut{color:var(--muted)}.cob-tl .fut:before{background:#cbd5e1}
.cob-ph{border:1px dashed var(--line);border-radius:10px;padding:10px 12px;color:var(--muted);font-size:12px;margin-top:14px}
@media(max-width:900px){.cob-cols{grid-template-columns:1fr}.cob-covr{grid-template-columns:1fr}.cob-strip{grid-template-columns:repeat(2,1fr)}}`;
    document.head.appendChild(s);
  }
});

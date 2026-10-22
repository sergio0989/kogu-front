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
      <div><div class="label-text">Cliente</div><select class="select" id="cobCliente" style="min-width:240px"><option value="">Todos los clientes</option></select></div>
      <div><div class="label-text">Responsable</div><select class="select" id="cobResp"><option value="">Todos</option></select></div>
      <div><div class="label-text">Moneda</div><select class="select" id="cobMoneda"><option value="">Todas</option><option>USD</option><option>MXN</option></select></div>
      <div><div class="label-text">Buscar folio</div><input class="input" id="cobQ" placeholder="27090, N200…"/></div>
      ${puedeCargar ? `<div class="cob-sp"></div><a class="btn" href="${CARGAR}">Cargar corte</a>` : ''}
    </div>
    <div class="cob-chips" id="cobChips"></div>
  </div>
  <div id="cobCuerpo"></div>
</div>
<div class="cob-ov" id="cobOv" style="display:none"></div>
<aside class="cob-drawer" id="cobDrawer" style="display:none" aria-label="Ficha de factura"></aside>`;

  let datos = null;          // respuesta de /cartera
  let cortes = [];
  let ficha = '';   // rango elegido en las fichas (aplica a las dos monedas)
  let orden = { k: 'saldo_mxn', dir: -1 };
  const filtro = () => ({ cliente: $('cobCliente').value, responsable: $('cobResp').value, moneda: $('cobMoneda').value, q: $('cobQ').value });

  // ── Carga ────────────────────────────────────────────────────────
  async function cargar(corteId) {
    $('cobCuerpo').innerHTML = '<div class="card cob-muted">Cargando cartera…</div>';
    try {
      const [cart, lista] = await Promise.all([
        api(corteId ? `/protected/cob/cartera?corte_id=${encodeURIComponent(corteId)}` : '/protected/cob/cartera'),
        api('/protected/cob/cortes?limit=30').catch(() => []),
      ]);
      datos = cart; cortes = Array.isArray(lista) ? lista : [];
      // Columnas USD / MXN de la tabla (para ordenar por cada una).
      if (datos && datos.documentos) datos.documentos.forEach((d) => { d.usd = d.moneda === 'USD' ? d.saldo : null; d.mxn = d.moneda === 'MXN' ? d.saldo : null; });
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
    if (f.q) chips.push(['cobQ', 'Folio', f.q]);
    if (ficha) chips.push(['ficha', 'Ficha', C.FICHAS.find((x) => x.k === ficha).l]);
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
    const tot = C.resumenFichas(base)[0];
    const avisos = C.avisos(base, corte).map((a) => `<div class="cob-aviso ${a.tipo === 'desactualizado' ? 'mal' : ''}">${esc(a.texto)}</div>`).join('');

    const totM = C.totalesMoneda(rows);
    const cols = [['folio', 'Folio'], ['cliente', 'Cliente'], ['responsable', 'Resp.'], ['fecha_doc', 'Factura'], ['fecha_vencimiento', 'Vence'],
      ['dias_vencido', 'Días', 'num'], ['usd', 'USD', 'num'], ['mxn', 'MXN', 'num'], ['bucket', 'Antigüedad']];
    const th = cols.map(([k, l, c]) => `<th data-orden="${k}" class="${c || ''}">${l}${orden.k === k ? (orden.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('');
    const agrupar = $('cobAgrupar') ? $('cobAgrupar').checked : false;
    let tbody;
    if (agrupar) {
      tbody = C.agrupar(rows).map((g, i) => `<tr class="g" data-grupo="${i}"><td colspan="6">▸ ${esc(g.cliente)} · ${g.docs.length} docs${g.vencidas ? ` · <span class="cob-rojo">${g.vencidas} vencidas</span>` : ''}</td>
          <td class="num">${g.por_moneda.USD ? C.numero(g.por_moneda.USD) : ''}</td><td class="num">${g.por_moneda.MXN ? C.numero(g.por_moneda.MXN) : ''}</td><td></td></tr>` + g.docs.map((d) => fila(d, i)).join('')).join('');
    } else {
      tbody = rows.map((d) => fila(d)).join('');
    }
    if (!rows.length) tbody = '<tr><td colspan="9" class="cob-muted" style="padding:20px">Sin documentos con este recorte.</td></tr>';
    const tfoot = `<tr class="tot"><td colspan="6">Total · ${totM.USD.docs} en dólares · ${totM.MXN.docs} en pesos</td>
      <td class="num" id="cobTotUSD">${C.numero(totM.USD.saldo)}</td><td class="num" id="cobTotMXN">${C.numero(totM.MXN.saldo)}</td><td></td></tr>`;

    const resp = C.porResponsable(base);
    const mon = (pm, m) => (pm.docs ? `<span>${m === 'USD' ? 'US' : ''}${C.dinero(pm.saldo)} <span class="cob-muted">· ${pm.docs} docs</span></span>` : '<span class="cob-muted">—</span>');

    cuerpo.innerHTML = `
  <div class="card">
    <div class="eyebrow" id="cobRecorte">${esc(recorte)}</div>
    ${fichas}
    <div id="cobAvisos">${avisos}<div class="cob-muted" id="cobControl" style="font-size:12px;margin-top:6px">${tot.docs} docs · ${tot.clientes} clientes · equivalente en pesos ${C.dinero(tot.saldo_mxn)} (tipo de cambio de cada factura, igual que el pie del reporte de SAI).</div></div>
  </div>
  <div class="card">
    <div class="cob-toolbar">
      <div class="eyebrow">Detalle por factura</div>
      <label class="cob-tog"><input type="checkbox" id="cobAgrupar" ${agrupar ? 'checked' : ''}/> Agrupar por cliente</label>
      <span class="cob-sp"></span>
      <span id="cobConteo" class="cob-muted">${rows.length} documentos</span>
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
  }

  function fila(d, grupo) {
    const oculto = grupo != null ? ' style="display:none"' : '';
    const tipo = d.tipo_doc !== 'FAC' ? ` <span class="cob-b bn">${d.tipo_doc}</span>` : '';
    const marcas = (d.cobro_factoraje ? ' <span class="cob-b binfo">Factoraje</span>' : '') + (d.sin_catalogo ? ' <span class="cob-b bwarn">Sin catálogo</span>' : '');
    const dias = d.dias_vencido != null && d.dias_vencido > 0 ? `<b class="cob-rojo">${d.dias_vencido}</b>` : '<span class="cob-muted">—</span>';
    return `<tr class="r"${oculto} data-id="${esc(d.documento_id)}" ${grupo != null ? `data-de-grupo="${grupo}"` : ''} data-sin-catalogo="${d.sin_catalogo ? 1 : 0}">
      <td><b>${esc(C.folioDe(d))}</b>${tipo}</td><td>${esc(d.cliente)}${marcas}</td><td>${esc(d.responsable || '—')}</td>
      <td>${C.fmtFecha(d.fecha_doc)}</td><td>${C.fmtFecha(d.fecha_vencimiento)}</td><td class="num">${dias}</td>
      <td class="num" data-col="usd">${d.moneda === 'USD' ? C.numero(d.saldo) : ''}</td><td class="num" data-col="mxn">${d.moneda === 'MXN' ? C.numero(d.saldo) : ''}</td>
      <td><span class="cob-b b${d.bucket || 0}">${C.etiquetaBucket(d.bucket)}</span></td></tr>`;
  }

  // ── Ficha de factura ────────────────────────────────────────────
  async function abrirFicha(id) {
    const dr = $('cobDrawer');
    dr.innerHTML = '<div class="cob-dh cob-muted">Cargando factura…</div>';
    dr.style.display = 'block'; $('cobOv').style.display = 'block';
    try {
      const { documento: d, historia } = await api(`/protected/cob/cartera/documentos/${encodeURIComponent(id)}`);
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
      <span>Fecha factura</span><b>${C.fmtFecha(d.fecha_doc)}</b><span>Vencimiento</span><b>${C.fmtFecha(d.fecha_vencimiento)}</b>
      <span>Contacto pagos</span><b>${esc(d.contacto_pagos_sai || '— sin capturar en SAI')}</b>
      ${d.tipo_doc === 'FAC' && d.total !== d.saldo ? `<span>Abonado</span><b>${esc(d.moneda)} ${C.numero(d.total - d.saldo)} (pago parcial)</b>` : ''}
    </div></div>
    <div><h3>Historia en los cortes</h3><div class="cob-tl" id="cobHistoria">
      ${historia.map((h) => `<div><b>${C.fmtFecha(h.fecha_corte)}</b> · saldo ${esc(d.moneda)} ${C.numero(h.saldo)} · ${h.dias_vencido > 0 ? `${h.dias_vencido} días vencida` : 'por vencer'}${h.corte_status === 'reemplazado' ? ' <span class="cob-muted">(corte reemplazado)</span>' : ''}</div>`).join('')}
      <div class="fut">Siguiente corte · si sale de la cartera, se cobró</div></div>
      <div class="cob-ph">Los acuerdos de la sesión (seguimiento, promesa de pago, responsable) llegan en la siguiente fase.</div>
    </div>
  </div>`;
    } catch (e) {
      dr.innerHTML = '<div class="cob-dh">No se pudo abrir la factura. <button type="button" class="btn" id="cobDrawerCerrar">Cerrar</button></div>';
      avisarError(e);
    }
  }
  function cerrarFicha() { $('cobDrawer').style.display = 'none'; $('cobOv').style.display = 'none'; }

  // ── Eventos (delegados: el cuerpo se repinta) ────────────────────
  ['cobCliente', 'cobResp', 'cobMoneda'].forEach((id) => $(id).addEventListener('change', render));
  $('cobQ').addEventListener('input', render);
  $('cobCorte').addEventListener('change', () => { ficha = ''; cargar($('cobCorte').value); });
  $('cobChips').addEventListener('click', (e) => {
    const q = e.target.closest('[data-quitar]'); if (!q) return;
    if (q.dataset.quitar === 'ficha') ficha = ''; else $(q.dataset.quitar).value = '';
    render();
  });
  $('cobCuerpo').addEventListener('click', (e) => {
    const k = e.target.closest('[data-ficha]');
    // La ficha filtra el rango en las dos monedas; la moneda se elige con el filtro Moneda.
    if (k) { ficha = ficha === k.dataset.ficha || k.dataset.ficha === 'cartera' ? '' : k.dataset.ficha; render(); return; }
    const th = e.target.closest('[data-orden]');
    if (th) { const key = th.dataset.orden; orden = orden.k === key ? { k: key, dir: -orden.dir } : { k: key, dir: ['dias_vencido', 'usd', 'mxn', 'bucket'].includes(key) ? -1 : 1 }; render(); return; }
    const g = e.target.closest('tr.g');
    if (g) { document.querySelectorAll(`tr[data-de-grupo="${g.dataset.grupo}"]`).forEach((tr) => { tr.style.display = tr.style.display === 'none' ? '' : 'none'; }); return; }
    const tr = e.target.closest('tr.r');
    if (tr && tr.dataset.id) abrirFicha(tr.dataset.id);
  });
  $('cobDrawer').addEventListener('click', (e) => { if (e.target.id === 'cobDrawerCerrar') cerrarFicha(); });
  $('cobOv').addEventListener('click', cerrarFicha);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrarFicha(); });

  // Cambio de empresa: limpiar todo antes de pedir, para no mostrar datos de la anterior.
  KoguShell.subscribeEmpresaActivaChange(async () => {
    datos = null; cortes = []; ficha = '';
    ['cobCliente', 'cobResp', 'cobMoneda', 'cobQ'].forEach((id) => { $(id).value = ''; });
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
.cob-scroll{overflow:auto}
.cob-tbl{width:100%;border-collapse:collapse;font-size:13px}
.cob-tbl th{background:#f8fafc;text-align:left;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);padding:10px;border-bottom:1px solid var(--line);cursor:pointer;white-space:nowrap}
.cob-tbl td{padding:9px 10px;border-bottom:1px solid var(--line);vertical-align:top}
.cob-tbl td:first-child{white-space:nowrap}
.cob-tbl tr.r:hover td{background:#f0f9ff;cursor:pointer}
.cob-tbl tr.g td{background:#f8fafc;font-weight:700;cursor:pointer}
.cob-tbl .num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.cob-b{display:inline-block;border-radius:999px;padding:2px 8px;font-size:11px;font-weight:700;white-space:nowrap}
.cob-b.b1{background:#e0f2fe;color:#075985}.cob-b.b2{background:#fef3c7;color:#92400e}.cob-b.b3{background:#fed7aa;color:#9a3412}
.cob-b.b4{background:#fee2e2;color:#991b1b}.cob-b.b5{background:#7f1d1d;color:#fff}
.cob-b.bn{background:#f1f5f9;color:#475569}.cob-b.binfo{background:#ede9fe;color:#5b21b6}.cob-b.bwarn{background:#fef3c7;color:#92400e}
.cob-cov{display:grid;gap:10px;margin-top:10px}
.cob-covr{display:grid;grid-template-columns:200px 1fr 1fr;gap:10px;align-items:center;font-size:13px;font-variant-numeric:tabular-nums}
.cob-covh{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.cob-fila{display:grid;grid-template-columns:70px 1fr;gap:10px;align-items:center;margin-top:12px}
.cob-fila .cob-kpis{margin-top:0}
.cob-fila-l{font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.cob-tbl tfoot td{font-weight:800;border-top:2px solid var(--line);padding:10px}
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

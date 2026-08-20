/* ============================================================
   KOGU Multiempresa — Radar Comercial · Bandeja de facturas
   Pantalla: /modules/rc/facturas.html
   Permiso:  screen.ventas.direccion

   Grano de RENGLÓN, no de factura: el folio se repite en sus líneas. Es lo
   que permite filtrar por producto o por ClavePP, que a nivel factura no
   tendría una respuesta clara ("¿muestro la factura entera o solo la línea
   que casa?").

   Fuente única: GET /protected/rc/facturas — devuelve página, totales del
   FILTRO COMPLETO (no de la página) y los catálogos de los selects.

   Dos cosas que esta pantalla dice y ninguna otra:
     · qué renglones NO están cruzando al PP y con qué estatus
     · el precio realmente cobrado (subtotal ÷ cantidad), que con descuento
       de línea no es el valor_prod del ERP
   ============================================================ */
document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/rc/facturas.html';
  const BASE = '/protected/rc';
  const PERM = 'screen.ventas.direccion';

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Bandeja de facturas',
    description: 'Consulta los renglones de venta con su ClavePP y su agente · Radar Comercial.',
    requiredPermission: PERM,
  });
  if (!b) return;

  // ── Estado ────────────────────────────────────────────────────────────────
  const PAGINA = 100;
  let data = null;
  let offset = 0;
  let primeraCarga = true;

  const $ = id => document.getElementById(id);
  const sel = id => $(id)?.value ?? '';
  const esc = v => KoguUi.escapeHtml(String(v ?? ''));
  const nf0 = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 });
  const nf3 = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 3 });
  const money = v => KoguUi.money(Number(v || 0));
  const moneyC = v => {
    const n = Number(v || 0);
    if (Math.abs(n) >= 1e6) return `$${(Math.trunc(n / 1e3) / 1e3).toLocaleString('es-MX', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} M`;
    return money(n);
  };
  const fecha = v => (v ? String(v).slice(0, 10) : '—');
  // Los importes del ERP vienen en MXN aunque la factura sea en dólares, así
  // que el valor original del documento se recupera DIVIDIENDO entre el tipo
  // de cambio de esa factura. Se muestra debajo de cada importe en vez de en
  // columnas nuevas: la tabla ya trae 13 y el dólar es contexto de la fila,
  // no una dimensión aparte.
  const esUsd = r => r.cve_mon === 2 && Number(r.tip_cam || 0) > 0;
  const usdDe = (r, v) => (esUsd(r) && v != null ? Number(v) / Number(r.tip_cam) : null);
  const subUsd = (r, v, dec = 2) => {
    const u = usdDe(r, v);
    if (u == null) return '';
    const txt = dec === 4
      ? 'US$' + u.toLocaleString('es-MX', { minimumFractionDigits: 4, maximumFractionDigits: 4 })
      : 'US$' + u.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    // Azul y en negritas, igual que la convención que ya usa Costo
    // ("P.venta/kg MXN · USD"): el dólar tiene que saltar a la vista, no
    // esconderse en gris junto a las notas al pie.
    return `<div style="font-size:10px;font-weight:600;color:var(--brand,#2563eb)" title="Valor original de la factura, al tipo de cambio ${num(r.tip_cam)}">${txt}</div>`;
  };
  const num = (v, f = nf3) => (v == null ? '—' : f.format(Number(v)));
  const MESES = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const anioActual = new Date().getFullYear();

  const miniCard = (lbl, val, hint = '', color = '') => `
    <div style="border:1px solid var(--line);border-radius:10px;padding:9px 12px">
      <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.03em">${esc(lbl)}</div>
      <div style="font-size:17px;font-weight:800;line-height:1.15;margin-top:1px;${color ? `color:${color}` : ''}">${esc(val)}</div>
      ${hint ? `<div style="font-size:10px;color:var(--muted)">${esc(hint)}</div>` : ''}
    </div>`;

  // ── Layout ────────────────────────────────────────────────────────────────
  $('pageContent').innerHTML = `
<div class="stack" style="gap:16px">

  <div class="card">
    <div class="row" style="align-items:flex-start">
      <div>
        <div class="eyebrow">Radar · Facturas</div>
        <h2 style="margin:0">Bandeja de facturas</h2>
        <div class="hint" style="margin-top:4px;color:var(--muted);font-size:12px">
          Un renglón por línea de venta. Los importes están en <b>MXN</b> aunque la factura sea en dólares
          (el ERP ya los convirtió al tipo de cambio); la columna USD se calcula dividiendo.
        </div>
      </div>
      <button class="btn" id="exportBtn" title="Descargar lo filtrado en Excel">⬇ Exportar</button>
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-top:14px;align-items:end">
      <div><div class="label-text">Año</div>
        <select class="select" id="fAnio"><option value="${anioActual}">${anioActual}</option></select></div>
      <div><div class="label-text">Mes</div>
        <select class="select" id="fMes">
          <option value="">Todos</option>
          ${MESES.map((m, i) => i ? `<option value="${i}">${m}</option>` : '').join('')}
        </select>
      </div>
      <div><div class="label-text">ClavePP</div><select class="select" id="fSublinea"><option value="">Todas</option></select></div>
      <div><div class="label-text">Agente</div><select class="select" id="fAgente"><option value="">Todos</option></select></div>
      <div><div class="label-text">Cruce al PP</div>
        <select class="select" id="fCruce">
          <option value="">Todos</option>
          <option value="cruza">Cruza (suma al tablero)</option>
          <option value="nocruza">No cruza</option>
        </select>
      </div>
      <div><div class="label-text">Moneda</div>
        <select class="select" id="fMoneda"><option value="">Todas</option><option value="1">MXN</option><option value="2">USD</option></select>
      </div>
      <div><div class="label-text">Tipo</div>
        <select class="select" id="fTipo">
          <option value="">Todo</option>
          <option value="venta">Solo venta</option>
          <option value="nc">Solo notas de crédito</option>
        </select>
      </div>
      <div><div class="label-text">Orden</div>
        <select class="select" id="fOrden"><option value="fecha">Fecha reciente</option><option value="importe">Importe mayor</option></select>
      </div>
      <div style="grid-column:span 2">
        <div class="label-text">Buscar (folio, cliente, producto, lote)</div>
        <input class="input" id="fQ" placeholder="A 26128, UNILEVER, WWP0164, cebolla…"/>
      </div>
    </div>

    <div id="cards" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-top:14px"></div>
  </div>

  <div class="card">
    <div class="row" style="margin-bottom:10px">
      <div class="eyebrow" id="info">—</div>
      <div style="display:flex;gap:8px;align-items:center">
        <button class="btn" id="prevBtn">‹ Anterior</button>
        <button class="btn" id="nextBtn">Siguiente ›</button>
      </div>
    </div>
    <div id="tabla"></div>
  </div>

</div>`;

  // ── Carga ─────────────────────────────────────────────────────────────────
  function filtrosActuales() {
    const qs = new URLSearchParams();
    const map = { anio: 'fAnio', mes: 'fMes', sublinea: 'fSublinea', agente: 'fAgente',
                  cruce: 'fCruce', moneda: 'fMoneda', tipo: 'fTipo', orden: 'fOrden', q: 'fQ' };
    for (const [k, id] of Object.entries(map)) if (sel(id)) qs.set(k, sel(id));
    return qs;
  }

  async function load(reiniciarPagina = true) {
    if (reiniciarPagina) offset = 0;
    const qs = filtrosActuales();
    qs.set('limit', String(PAGINA));
    qs.set('offset', String(offset));
    const res = await KoguApi.apiFetch(`${BASE}/facturas?${qs.toString()}`);
    data = KoguApi.unwrapData(res);
    if (primeraCarga) {
      primeraCarga = false;
      // Si el año que se pidió no existe en esta empresa, se recarga una vez
      // con el más reciente en vez de dejar la pantalla vacía y el selector
      // diciendo otra cosa.
      if (llenarCatalogos()) return load(true);
    }
    renderCards();
    renderTabla();
  }

  // Los catálogos se llenan una sola vez: no dependen del filtro y repintarlos
  // en cada carga haría perder la selección.
  // Devuelve true si tuvo que cambiar el año elegido (el ejercicio en curso
  // puede no tener ventas cargadas todavía, o ser otra empresa).
  function llenarCatalogos() {
    const anios = data.anios || [];
    const previo = sel('fAnio');
    $('fAnio').innerHTML = '<option value="">Todos</option>'
      + anios.map(a => `<option value="${a}">${a}</option>`).join('');
    let cambio = false;
    if (anios.map(String).includes(previo)) $('fAnio').value = previo;
    else if (anios.length) { $('fAnio').value = String(anios[0]); cambio = true; }
    else { $('fAnio').value = ''; cambio = previo !== ''; }

    const porCat = new Map();
    for (const x of (data.sublineas || [])) {
      const cat = x.cat_nombre || (x.cat != null ? 'Categoría ' + x.cat : 'Sin categoría');
      if (!porCat.has(cat)) porCat.set(cat, []);
      porCat.get(cat).push(x);
    }
    $('fSublinea').innerHTML = '<option value="">Todas</option><option value="__SIN__">— sin ClavePP —</option>'
      + [...porCat.entries()].map(([cat, subs]) =>
          `<optgroup label="${esc(cat)}">` + subs.map(x =>
            `<option value="${esc(x.cve_sublinea)}">${esc(x.cve_sublinea)} · ${esc(x.sublinea_nombre)}</option>`).join('') + '</optgroup>').join('');

    $('fAgente').innerHTML = '<option value="">Todos</option><option value="__SIN__">— sin agente —</option>'
      + (data.agentes || []).map(a => `<option value="${esc(a.agente_id)}">${esc(a.nombre)}</option>`).join('');
    return cambio;
  }

  // ── Totales del filtro ────────────────────────────────────────────────────
  function renderCards() {
    const t = data.totales || {};
    const sinCruce = Number(t.lineas_sin_cruce || 0);
    const nc = Number(t.lineas_nc || 0);
    const usd = Number(t.subtotal_usd || 0);
    $('cards').innerHTML = [
      miniCard('Renglones', nf0.format(Number(t.lineas || 0)), `${nf0.format(Number(t.facturas || 0))} facturas · ${nf0.format(Number(t.clientes || 0))} clientes`),
      miniCard('Cantidad', `${nf0.format(Number(t.cantidad || 0))} kg`, 'suma del filtro'),
      miniCard('Subtotal', moneyC(t.subtotal_mxn), 'MXN, sin IVA'),
      miniCard('IVA', moneyC(t.iva_mxn), 'total − subtotal'),
      miniCard('Total', moneyC(t.total_mxn), 'MXN, con IVA'),
      usd ? miniCard('Subtotal USD', moneyC(usd), 'solo facturas en dólares') : '',
      nc ? miniCard('Notas de crédito', nf0.format(nc), moneyC(t.subtotal_nc), 'var(--warning,#d97706)') : '',
      sinCruce ? miniCard('Sin cruce al PP', nf0.format(sinCruce), 'renglones sin ClavePP confirmada', 'var(--warning,#d97706)') : '',
    ].filter(Boolean).join('');
  }

  // ── Tabla ─────────────────────────────────────────────────────────────────
  const chipPp = r => {
    if (!r.cve_sublinea) return '<span style="color:var(--warning,#d97706);font-size:11px">sin ClavePP</span>';
    const pend = r.pp_status !== 'asignado';
    return `<span class="chip-compact">${esc(r.cve_sublinea)}</span>`
      + `<div style="font-size:10px;color:var(--muted);margin-top:2px">${esc(r.sublinea_nombre || '')}</div>`
      + (pend ? `<div style="font-size:10px;color:var(--warning,#d97706)" title="La sugerencia no está confirmada, así que este renglón NO suma al tablero">pendiente · no cruza</div>` : '');
  };

  function renderTabla() {
    const items = data.items || [];
    const p = data.paginacion || { total: 0, limit: PAGINA, offset: 0 };
    const desde = p.total ? p.offset + 1 : 0;
    const hasta = Math.min(p.offset + items.length, p.total);
    $('info').innerHTML = p.total
      ? `${nf0.format(desde)}–${nf0.format(hasta)} de <b>${nf0.format(p.total)}</b> renglones`
      : 'Sin renglones para el filtro';
    $('prevBtn').disabled = p.offset <= 0;
    $('nextBtn').disabled = hasta >= p.total;

    if (!items.length) { $('tabla').innerHTML = '<div class="empty">Sin renglones para el filtro.</div>'; return; }

    const filas = items.map(r => {
      const neg = Number(r.subtotal_mxn || 0) < 0;
      return `<tr${neg ? ' style="background:rgba(180,83,9,.06)"' : ''}>
        <td style="white-space:nowrap"><b>${esc(r.folio_factura)}</b>
          <div style="font-size:10px;color:var(--muted)">${fecha(r.falta_fac)}</div></td>
        <td><div style="font-weight:600">${esc(r.cliente_nombre || ('Cliente ' + r.cve_cte))}</div>
          <div style="font-size:11px;color:var(--muted)">cve ${esc(r.cve_cte)}</div></td>
        <td><span class="chip-compact">${esc(r.cve_prod || '—')}</span>
          <div style="font-size:11px;color:var(--muted)">${esc(r.desc_prod || '')}</div></td>
        <td style="text-align:center;font-size:11px">${esc(r.unidad || '—')}</td>
        <td style="text-align:right;white-space:nowrap">${num(r.cant_surt)}</td>
        <td style="text-align:right;white-space:nowrap">${r.precio_efectivo == null ? '—' : money(r.precio_efectivo)}
          ${subUsd(r, r.precio_efectivo, 4)}
          ${(r.precio_lista != null && Number(r.descu_prod || 0) !== 0)
            ? `<div style="font-size:10px;color:var(--muted)" title="Precio de lista antes del descuento de línea">lista ${money(r.precio_lista)}</div>` : ''}</td>
        <td style="text-align:right;white-space:nowrap;font-weight:600">${money(r.subtotal_mxn)}${subUsd(r, r.subtotal_mxn)}</td>
        <td style="text-align:right;white-space:nowrap">${money(r.iva_mxn)}${subUsd(r, r.iva_mxn)}</td>
        <td style="text-align:right;white-space:nowrap;font-weight:700">${money(r.total_mxn)}${subUsd(r, r.total_mxn)}</td>
        <td style="text-align:center;font-size:11px;white-space:nowrap">${r.cve_mon === 2 ? 'USD' : 'MXN'}
          ${r.cve_mon === 2 ? `<div style="color:var(--muted)">tc ${num(r.tip_cam)}</div>` : ''}</td>
        <td style="min-width:150px">${chipPp(r)}</td>
        <td style="font-size:12px">${r.agente_nombre ? esc(r.agente_nombre) : '<span style="color:var(--warning,#d97706);font-size:11px">sin agente</span>'}</td>
      </tr>`;
    }).join('');

    $('tabla').innerHTML = `
      <div class="table-wrap"><table><thead><tr>
        <th>Folio / fecha</th><th>Cliente</th><th>Producto</th>
        <th style="text-align:center">Unidad</th>
        <th style="text-align:right">Cantidad</th>
        <th style="text-align:right">Precio</th>
        <th style="text-align:right">Subtotal $</th>
        <th style="text-align:right">IVA $</th>
        <th style="text-align:right">Total $</th>
        <th style="text-align:center">Moneda</th>
        <th>ClavePP</th><th>Agente</th>
      </tr></thead><tbody>${filas}</tbody>${pie(items)}</table></div>`;
  }

  // Suma de la PÁGINA, rotulada como tal: los totales del filtro completo
  // están arriba y no deben confundirse con esto.
  function pie(items) {
    const s = (f) => items.reduce((a, x) => a + Number(x[f] || 0), 0);
    return `<tfoot><tr style="border-top:2px solid var(--line);font-weight:700;background:var(--panel2,#f8fafc)">
      <td colspan="4">Suma de los ${items.length} renglones de esta página</td>
      <td style="text-align:right">${num(s('cant_surt'), nf0)}</td>
      <td></td>
      <td style="text-align:right">${money(s('subtotal_mxn'))}</td>
      <td style="text-align:right">${money(s('iva_mxn'))}</td>
      <td style="text-align:right">${money(s('total_mxn'))}</td>
      <td colspan="3"></td>
    </tr></tfoot>`;
  }

  // ── Exportar ──────────────────────────────────────────────────────────────
  // Exporta el FILTRO COMPLETO, no la página: bajar 100 renglones cuando el
  // filtro tiene 8,000 sería una trampa. Se pide en bloques hasta el tope.
  const TOPE_EXPORT = 20000;
  async function exportar() {
    if (typeof XLSX === 'undefined') { KoguApi.toast('SheetJS no cargó. Recarga la página.', 'error'); return; }
    const total = Number(data?.paginacion?.total || 0);
    if (!total) { KoguApi.toast('No hay renglones que exportar.', 'error'); return; }
    const meta = Math.min(total, TOPE_EXPORT);
    const bloques = [];
    for (let off = 0; off < meta; off += 500) {
      const qs = filtrosActuales();
      qs.set('limit', '500'); qs.set('offset', String(off));
      const res = await KoguApi.apiFetch(`${BASE}/facturas?${qs.toString()}`);
      bloques.push(...(KoguApi.unwrapData(res)?.items || []));
    }
    const filas = bloques.map(r => ({
      'Folio': r.folio_factura, 'Fecha': fecha(r.falta_fac),
      'Cve cliente': r.cve_cte, 'Cliente': r.cliente_nombre || '',
      'Producto': r.cve_prod || '', 'Descripción': r.desc_prod || '',
      'Lote': r.lote || '', 'Unidad': r.unidad || '',
      'Cantidad': Number(r.cant_surt || 0),
      'Precio lista': r.precio_lista == null ? null : Number(r.precio_lista),
      'Descuento': Number(r.descu_prod || 0),
      'Precio efectivo': r.precio_efectivo == null ? null : Number(r.precio_efectivo),
      'Subtotal $': Number(r.subtotal_mxn || 0),
      'IVA $': Number(r.iva_mxn || 0),
      'Total $': Number(r.total_mxn || 0),
      'Moneda': r.cve_mon === 2 ? 'USD' : 'MXN',
      'Tipo de cambio': r.tip_cam == null ? null : Number(r.tip_cam),
      'Precio USD': usdDe(r, r.precio_efectivo),
      'Subtotal USD': usdDe(r, r.subtotal_mxn),
      'IVA USD': usdDe(r, r.iva_mxn),
      'Total USD': usdDe(r, r.total_mxn),
      'Régimen IVA': r.cve_iva || '',
      'ClavePP': r.cve_sublinea || '',
      'Sublínea': r.sublinea_nombre || '',
      'Cruza al PP': r.cve_sublinea && r.pp_status === 'asignado' ? 'sí' : 'no',
      'Agente': r.agente_nombre || '',
    }));
    const cols = [
      { k: 'Folio', w: 14 }, { k: 'Fecha', w: 12 },
      { k: 'Cve cliente', w: 12 }, { k: 'Cliente', w: 34 },
      { k: 'Producto', w: 14 }, { k: 'Descripción', w: 40 }, { k: 'Lote', w: 14 },
      { k: 'Unidad', w: 9 },
      { k: 'Cantidad', w: 14, z: '#,##0.00' },
      { k: 'Precio lista', w: 14, z: '"$"#,##0.0000' },
      { k: 'Descuento', w: 12, z: '"$"#,##0.00' },
      { k: 'Precio efectivo', w: 15, z: '"$"#,##0.0000' },
      { k: 'Subtotal $', w: 16, z: '"$"#,##0.00' },
      { k: 'IVA $', w: 14, z: '"$"#,##0.00' },
      { k: 'Total $', w: 16, z: '"$"#,##0.00' },
      { k: 'Moneda', w: 9 },
      { k: 'Tipo de cambio', w: 13, z: '#,##0.0000' },
      { k: 'Precio USD',   w: 13, z: '"$"#,##0.0000' },
      { k: 'Subtotal USD', w: 15, z: '"$"#,##0.00' },
      { k: 'IVA USD',      w: 13, z: '"$"#,##0.00' },
      { k: 'Total USD',    w: 15, z: '"$"#,##0.00' },
      { k: 'Régimen IVA', w: 11 },
      { k: 'ClavePP', w: 10 }, { k: 'Sublínea', w: 34 },
      { k: 'Cruza al PP', w: 11 }, { k: 'Agente', w: 26 },
    ];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(filas, { header: cols.map(c => c.k) });
    ws['!cols'] = cols.map(c => ({ wch: c.w }));
    const rango = XLSX.utils.decode_range(ws['!ref']);
    for (let C = 0; C <= rango.e.c; C++) {
      const z = cols[C]?.z;
      if (!z) continue;
      for (let R = 1; R <= rango.e.r; R++) {
        const cel = ws[XLSX.utils.encode_cell({ r: R, c: C })];
        if (cel && cel.t === 'n') cel.z = z;
      }
    }
    ws['!autofilter'] = { ref: ws['!ref'] };
    XLSX.utils.book_append_sheet(wb, ws, 'Facturas');
    const etq = sel('fAnio') || 'todos';
    XLSX.writeFile(wb, `KOGU_facturas_${etq}${sel('fMes') ? '_' + sel('fMes') : ''}.xlsx`);
    KoguApi.toast(`${filas.length} renglones exportados${total > TOPE_EXPORT ? ` (tope ${nf0.format(TOPE_EXPORT)}, afina el filtro)` : ''}`,
      total > TOPE_EXPORT ? 'error' : 'success');
  }

  // ── Eventos ───────────────────────────────────────────────────────────────
  ['fAnio', 'fMes', 'fSublinea', 'fAgente', 'fCruce', 'fMoneda', 'fTipo', 'fOrden']
    .forEach(id => { $(id).onchange = () => load(true); });
  let qTimer = null;
  $('fQ').oninput = () => { clearTimeout(qTimer); qTimer = setTimeout(() => load(true), 350); };
  $('prevBtn').onclick = () => { offset = Math.max(0, offset - PAGINA); load(false); };
  $('nextBtn').onclick = () => { offset += PAGINA; load(false); };
  $('exportBtn').onclick = (e) => KoguUi.withLoading(e.target, async () => {
    try { await exportar(); } catch (err) { KoguApi.toast(err.message, 'error'); }
  }, 'Generando…');

  KoguShell.subscribeEmpresaActivaChange(async () => { primeraCarga = true; await load(true); });
  await load(true);
});

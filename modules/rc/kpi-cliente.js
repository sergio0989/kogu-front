// ============================================================
// kpi-cliente.js — Radar Comercial · KPI Ventas Cliente (solo lectura).
// Concentración de la venta y salud de cada cuenta para los productos que se
// elijan: venta, cantidad en unidad de venta / presentación / kg, precio,
// frecuencia, recencia, detalle por mes y por producto, y señales.
// Endpoint: GET /protected/rc/kpi-cliente (screen.ventas.direccion)
// Reglas puras en kpi-cliente-calc.js (tests/rc-kpi-cliente.test.mjs).
// La contribución MP va oculta por defecto; se conecta con los KPIs de
// producción (Costo) cuando estén en main.
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/rc/kpi-cliente.html';
  const BASE = '/protected/rc';
  const PERM = 'screen.ventas.direccion';
  const K = window.KoguKpiCliente;
  const LS = 'kogu:rc-kpi-cliente:productos';

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'KPI Ventas Cliente',
    description: 'Concentración de la venta y salud de cada cuenta por producto.',
    requiredPermission: PERM,
  });
  if (!b) return;

  const $ = (id) => document.getElementById(id);
  const c = $('pageContent');
  const MES = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const MESL = ['', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const fmt = (v, d = 2) => (v == null ? '—' : Number(v).toLocaleString('es-MX', { minimumFractionDigits: d, maximumFractionDigits: d }));
  const money = (v, d = 2) => (v == null ? '—' : (Number(v) < 0 ? '−$' + fmt(-v, d) : '$' + fmt(v, d)));
  const n0 = (v) => (v == null ? '—' : Number(v).toLocaleString('es-MX', { maximumFractionDigits: 0 }));
  const pct = (v, d = 1) => (v == null ? '—' : fmt(v * 100, d) + '%');
  const fecha = (s) => { if (!s) return '—'; const [y, m, d] = String(s).split('-'); return `${Number(d)}-${MES[Number(m)].toLowerCase()}-${y}`; };
  const minus = (s) => String(s || '').toLowerCase();
  const plural = (u) => { const x = minus(u); return !x ? '' : /[aeiou]$/.test(x) ? x + 's' : x === 'kg' ? x : x + 'es'; };

  const hoy = new Date();
  let seleccion = new Set(), D = null, P = null, activo = null, medida = 'cantidad', verMp = false;
  try { (JSON.parse(localStorage.getItem(LS) || '[]') || []).forEach(k => seleccion.add(k)); } catch (_) { /* sin almacenamiento */ }
  const guardaSel = () => { try { localStorage.setItem(LS, JSON.stringify([...seleccion])); } catch (_) { /* sin almacenamiento */ } };

  if (!document.getElementById('estiloKpiCte')) {
    const st = document.createElement('style'); st.id = 'estiloKpiCte';
    st.textContent = `
      .kc-tile{padding:14px 16px}
      .kc-tile .lbl{font-size:11px;text-transform:uppercase;letter-spacing:.04em;font-weight:700;color:var(--muted)}
      .kc-tile .val{font-size:24px;font-weight:800;margin-top:2px;letter-spacing:-.01em;font-variant-numeric:tabular-nums}
      .kc-tile .hint{font-size:12px;color:var(--muted)}
      .kc-tile.oscuro{background:#0f172a;color:#fff}.kc-tile.oscuro .lbl,.kc-tile.oscuro .hint{color:#cbd5e1}
      .kc-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px}
      .kc-dos{display:grid;grid-template-columns:repeat(auto-fit,minmax(420px,1fr));gap:14px}
      .kc-dos>*,.kc-grid>*{min-width:0}
      @media (max-width:520px){.kc-dos{grid-template-columns:1fr}.kc-grid{grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}.kc-barras{gap:3px}}
      .kc-conc{background:#fff7ed;border:1px solid #fdba74;border-radius:14px;padding:14px 18px;display:flex;flex-wrap:wrap;gap:14px;align-items:center}
      .kc-conc.ok{background:var(--panel);border-color:var(--line)}
      .kc-seg{display:inline-flex;padding:3px;background:var(--panel2);border:1px solid var(--line);border-radius:10px;gap:3px}
      .kc-seg button{border:0;background:transparent;padding:6px 12px;border-radius:7px;font:inherit;font-size:13px;font-weight:600;color:var(--muted);cursor:pointer;min-height:36px}
      .kc-seg button[aria-pressed="true"]{background:#fff;color:var(--text);box-shadow:0 1px 2px rgba(15,23,42,.15)}
      .kc-barras{display:flex;align-items:stretch;gap:8px;height:250px;margin-top:12px}
      .kc-barras .col{flex:1 1 0;min-width:0;display:flex;flex-direction:column;align-items:center;gap:6px}
      .kc-barras .area{flex:1 1 auto;width:100%;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:6px}
      .kc-barras .bar{width:70%;max-width:80px;background:var(--primary);border-radius:6px 6px 0 0}
      .kc-barras .bar.vacia{height:5px;background:transparent;border:1px dashed #94a3b8;border-radius:4px}
      .kc-barras .v{font-size:12px;font-weight:700;font-variant-numeric:tabular-nums}
      .kc-barras .m{font-size:12.5px;font-weight:600}
      .table-wrap table.tabla-kc{table-layout:auto;width:max-content;min-width:100%;font-variant-numeric:tabular-nums;font-size:12.5px}
      .table-wrap .tabla-kc th,.table-wrap .tabla-kc td{white-space:nowrap;padding:8px 10px;word-break:normal}
      .tabla-kc .num{text-align:right}
      .tabla-kc tbody tr.cte{cursor:pointer}
      .tabla-kc tbody tr.cte.sel td{background:#ecfeff}
      .tabla-kc tbody tr.cte:hover td{background:#f8fafc}
      .kc-precio{display:grid;grid-template-columns:48px 1fr 80px 78px;gap:10px;align-items:center;padding:8px 0;border-bottom:1px solid var(--line);font-size:13px;font-variant-numeric:tabular-nums}
      .kc-senal{padding:12px 14px;border-radius:10px;display:flex;flex-direction:column;gap:6px;font-size:13px}
      .kc-senal.alta{background:#fff7ed;border:1px solid #fed7aa}
      .kc-senal.media{background:var(--panel2);border:1px solid var(--line)}`;
    document.head.appendChild(st);
  }

  c.innerHTML = `
<div class="card">
  <div class="row" style="align-items:flex-end;gap:12px;flex-wrap:wrap">
    <div style="flex:1 1 300px"><div class="eyebrow">Radar comercial · Ventas</div><h2 style="margin:0">KPI Ventas Cliente</h2>
      <div class="muted" style="font-size:12px">Facturas de venta del ERP de los productos elegidos. Cliente y agente del catálogo KOGU. Venta sin IVA, neta de notas de crédito.</div></div>
    <div><label class="muted" style="font-size:12px;display:block" for="anio">Año</label><input id="anio" type="number" class="input" style="width:100px"/></div>
    <div><label class="muted" style="font-size:12px;display:block" for="mesIni">Mes inicial</label><select id="mesIni" class="select" style="min-width:110px"></select></div>
    <div><label class="muted" style="font-size:12px;display:block" for="mesFin">Mes final</label><select id="mesFin" class="select" style="min-width:110px"></select></div>
    <button class="btn ghost" id="btnMp" aria-pressed="false">Mostrar contribución MP</button>
    <button class="btn primary" id="btnAnalizar">Analizar</button>
  </div>
  <div style="margin-top:14px">
    <div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.04em;font-weight:700">Productos</div>
    <div class="row" style="gap:8px;align-items:center;flex-wrap:wrap;margin-top:6px">
      <div id="productos" style="display:flex;gap:6px;flex-wrap:wrap"></div>
      <input id="ptExtra" class="input" placeholder="Clave (Enter)…" aria-label="Agregar clave de producto" style="width:150px;text-transform:uppercase;padding:4px 8px;font-size:12px" title="Una o varias claves separadas por coma"/>
    </div>
  </div>
</div>
<div id="cuerpo" style="margin-top:14px;display:flex;flex-direction:column;gap:14px"></div>`;

  const opts = MES.slice(1).map((m, i) => `<option value="${i + 1}">${m}</option>`).join('');
  $('mesIni').innerHTML = opts; $('mesFin').innerHTML = opts;
  $('anio').value = hoy.getFullYear(); $('mesIni').value = 1; $('mesFin').value = hoy.getMonth() + 1;
  const periodo = () => ({ anio: parseInt($('anio').value, 10), mes_ini: parseInt($('mesIni').value, 10), mes_fin: parseInt($('mesFin').value, 10) });

  function pintaProductos() {
    $('productos').innerHTML = seleccion.size ? [...seleccion].map(k =>
      `<button class="btn primary" data-pt="${esc(k)}" aria-label="Quitar ${esc(k)}" style="padding:4px 10px;font-size:12px">${esc(k)} ✕</button>`).join('')
      : '<span class="muted" style="font-size:12px">Escribe una o varias claves (p. ej. GPT0030, GPT0031, GPT0032).</span>';
    $('productos').querySelectorAll('[data-pt]').forEach(btn => btn.addEventListener('click', () => { seleccion.delete(btn.dataset.pt); guardaSel(); pintaProductos(); }));
  }
  function limpiar(msg) { $('cuerpo').innerHTML = `<div class="card muted" style="padding:16px">${esc(msg)}</div>`; }

  async function analizar() {
    if (!seleccion.size) return limpiar('Elige al menos un producto.');
    P = periodo();
    if (P.mes_ini > P.mes_fin) return KoguApi.toast('El mes inicial no puede ser mayor que el final.', 'error');
    $('btnAnalizar').disabled = true; D = null; limpiar('Cargando…');
    try {
      const q = new URLSearchParams({ ...P, cve_prod: [...seleccion].join(',') });
      D = KoguApi.unwrapData(await KoguApi.apiFetch(`${BASE}/kpi-cliente?${q}`));
      if (!D || !D.clientes || !D.clientes.length) return limpiar('No hay ventas de esos productos en el periodo.');
      if (!activo || !D.clientes.find(x => x.cve_cte === activo)) activo = D.clientes[0].cve_cte;
      pinta();
    } catch (e) { limpiar(e.message || 'No se pudo cargar.'); KoguApi.toast(e.message, 'error'); }
    finally { $('btnAnalizar').disabled = false; }
  }

  const tile = (lbl, val, hint, extra = '', cls = '') => `<div class="card kc-tile ${cls}"><div class="lbl">${lbl}</div>
    <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap"><span class="val">${val}</span>${extra}</div><div class="hint">${hint}</div></div>`;

  function pinta() {
    const cte = D.clientes.find(x => x.cve_cte === activo);
    $('cuerpo').innerHTML = cardConcentracion() + cardClientes() + ficha(cte) + cardMensual(cte) +
      `<div class="kc-dos">${cardProductos(cte)}${cardPrecio(cte)}</div>` + cardSenales(cte) +
      `<div class="muted" style="font-size:12px">Venta neta = subtotal sin IVA menos notas de crédito · presentación y kg = cantidad × equivalencias del catálogo de productos · días sin comprar al ${esc(fecha(D.periodo.fecha_corte))}.</div>`;
    $('cuerpo').querySelectorAll('tr.cte').forEach(tr => {
      const ir = () => { activo = tr.dataset.cte; pinta(); };
      tr.addEventListener('click', ir);
      tr.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ir(); } });
    });
    enlazaMedida();
  }

  function cardConcentracion() {
    const k = D.concentracion;
    const alta = k.top1 != null && k.top1 > K.UMBRAL_CONCENTRACION;
    const texto = k.clientes === 1
      ? 'Toda la venta de estos productos es de <b>un solo cliente</b>. La pantalla funciona como ficha de salud de esa cuenta.'
      : `El cliente principal es el <b>${pct(k.top1)}</b> de la venta y los 3 principales el <b>${pct(k.top3)}</b>, entre ${k.clientes} clientes.`;
    return `<div class="kc-conc ${alta ? '' : 'ok'}"><div><div style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${alta ? '#9a3412' : 'var(--muted)'}">Concentración</div>
      <div style="font-size:28px;font-weight:800;color:${alta ? '#7c2d12' : 'var(--text)'}">${pct(k.top1, 0)}</div></div>
      <div style="flex:1 1 380px;font-size:13.5px;line-height:1.5;color:${alta ? '#7c2d12' : 'var(--text)'}">${texto} Venta neta del periodo: <b>${money(D.totales.venta_neta, 0)}</b>.</div></div>`;
  }

  function cardClientes() {
    const filas = D.clientes.map(x => {
      const dias = x.dias_sin_compra;
      const badge = dias == null ? '—' : `<span class="badge ${dias > K.RECENCIA_ALTA ? 'danger' : dias > K.RECENCIA_MEDIA ? 'warn' : 'success'}">hace ${n0(dias)} días</span>`;
      return `<tr class="cte ${x.cve_cte === activo ? 'sel' : ''}" data-cte="${esc(x.cve_cte)}" tabindex="0" aria-selected="${x.cve_cte === activo}">
        <td><span class="muted">${esc(x.cve_cte)} ·</span> <b>${esc(x.cliente)}</b></td><td>${esc(x.agente || 'Sin agente')}</td>
        <td class="num" style="font-weight:700">${money(x.venta_neta, 0)}</td>
        <td><div style="display:flex;align-items:center;gap:8px"><div style="width:80px;height:8px;background:var(--panel2);border-radius:4px;overflow:hidden"><div style="height:8px;width:${((x.participacion || 0) * 100).toFixed(1)}%;background:var(--primary)"></div></div>${pct(x.participacion)}</div></td>
        <td class="num">${n0(x.cantidad)}</td><td class="num">${money(x.precio_prom)}</td>
        ${verMp ? '<td class="num muted">—</td>' : ''}
        <td class="num">${x.meses_compra}</td><td class="num">${badge}</td></tr>`;
    }).join('');
    return `<div class="card"><div class="row" style="justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:8px"><h3 style="margin:0">Clientes del periodo</h3><span class="muted" style="font-size:12px">Por venta neta · clic para ver la ficha</span></div>
      <div class="table-wrap" style="margin-top:10px"><table class="tabla-kc"><thead><tr><th>Cliente</th><th>Agente</th><th class="num">Venta neta</th><th>Participación</th><th class="num">Cantidad</th><th class="num">Precio prom.</th>${verMp ? '<th class="num">Contrib. MP</th>' : ''}<th class="num">Meses</th><th class="num">Última compra</th></tr></thead><tbody>${filas}</tbody></table></div></div>`;
  }

  function ficha(x) {
    const u = minus(x.unidad) || 'unidad';
    const pres = x.unidad_presentacion ? `${n0(x.unidades_presentacion)} ${plural(x.unidad_presentacion)}` : null;
    const precioPres = x.unidad_presentacion && x.unidades_presentacion ? x.venta / x.unidades_presentacion : null;
    const dias = x.dias_sin_compra;
    return `<div style="display:flex;flex-direction:column;gap:10px">
      <div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap"><h2 style="margin:0">${esc(x.cliente)}</h2>
        <span class="muted" style="font-size:13px">Cliente ${esc(x.cve_cte)} · agente ${esc(x.agente || 'sin asignar')} · primera compra del periodo ${esc(fecha(x.primera))}${x.unidad ? ' · facturación en ' + esc(x.unidad) : ''}</span></div>
      <div class="kc-grid">
        ${tile('Venta neta', money(x.venta_neta, 0), `${x.facturas} facturas · ${x.notas} notas de crédito${x.nc ? ' (' + money(x.nc, 0) + ')' : ''}`)}
        ${tile('Volumen', `${n0(x.cantidad)} ${esc(plural(u))}`, [pres, x.kg != null ? `${n0(x.kg)} kg` : null].filter(Boolean).join(' · ') || 'sin equivalencias en el catálogo')}
        ${tile('Precio promedio', `${money(x.precio_prom)} / ${esc(u)}`, `${precioPres != null ? money(precioPres) + ' por ' + esc(minus(x.unidad_presentacion)) + ' · ' : ''}rango ${money(x.precio_min)} – ${money(x.precio_max)}`)}
        ${verMp ? tile('Contribución MP', '—', 'se conecta con los KPIs de producción (Costo)') : ''}
        ${tile('Frecuencia', `${x.meses_compra} de ${P.mes_fin - P.mes_ini + 1} meses`, `${n0(x.cantidad_por_factura)} ${esc(plural(u))} por factura · ${money(x.ticket_prom, 0)} promedio`)}
        ${tile('Última compra', dias == null ? '—' : `hace ${n0(dias)} días`, esc(fecha(x.ultima)), '', 'oscuro')}
      </div></div>`;
  }

  function cardMensual(x) {
    const meses = K.mesesConHuecos(x.meses, P.anio, P.mes_ini, P.mes_fin);
    const val = (m) => (medida === 'venta' ? m.venta_neta : m.cantidad) || 0;
    const max = Math.max(1, ...meses.map(val));
    const cols = meses.map(m => {
      const v = val(m), h = v ? Math.max(5, Math.round(v / max * 180)) : 0;
      return `<div class="col" title="${esc(m.sin_compra ? MESL[m.mes] + ': sin compra' : `${MESL[m.mes]}: ${n0(m.cantidad)} · ${money(m.venta_neta, 0)} · ${money(m.precio)}`)}"><div class="area"><span class="v">${v ? (medida === 'venta' ? '$' + n0(v / 1000) + 'k' : n0(v)) : '—'}</span>
        <div class="bar${v ? '' : ' vacia'}" style="${v ? `height:${h}px` : ''}"></div></div><span class="m">${MES[m.mes]}</span></div>`;
    }).join('');
    return `<div class="card" id="kcMensual"><div class="row" style="justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
      <div><h3 style="margin:0">Compras por mes</h3><div class="muted" style="font-size:12px">${medida === 'venta' ? 'Venta neta' : 'Cantidad facturada en ' + esc(plural(minus(x.unidad) || 'unidad'))} · un mes punteado = sin compra</div></div>
      <div class="kc-seg" role="group" aria-label="Medida"><button type="button" data-medida="cantidad" aria-pressed="${medida === 'cantidad'}">Cantidad</button><button type="button" data-medida="venta" aria-pressed="${medida === 'venta'}">Venta $</button></div></div>
      <div class="kc-barras">${cols}</div></div>`;
  }
  function enlazaMedida() {
    $('cuerpo').querySelectorAll('[data-medida]').forEach(btn => btn.addEventListener('click', () => {
      medida = btn.dataset.medida; $('kcMensual').outerHTML = cardMensual(D.clientes.find(x => x.cve_cte === activo)); enlazaMedida();
    }));
  }

  function cardProductos(x) {
    const filas = x.por_producto.map(p => `<tr><td style="font-weight:700">${esc(p.cve_prod)}</td><td class="num">${n0(p.cantidad)}</td>
      <td><div style="display:flex;align-items:center;gap:8px"><div style="width:90px;height:8px;background:var(--panel2);border-radius:4px;overflow:hidden"><div style="height:8px;width:${((p.mix || 0) * 100).toFixed(1)}%;background:var(--primary)"></div></div>${pct(p.mix)}</div></td>
      <td class="num">${money(p.precio)}</td><td class="num">${money(p.venta_neta, 0)}</td>${verMp ? '<td class="num muted">—</td>' : ''}</tr>`).join('');
    return `<div class="card"><h3 style="margin:0">Qué productos lleva</h3>
      <div class="table-wrap" style="margin-top:10px"><table class="tabla-kc"><thead><tr><th>Clave</th><th class="num">Cantidad</th><th>Mix</th><th class="num">Precio</th><th class="num">Venta neta</th>${verMp ? '<th class="num">Contrib. MP</th>' : ''}</tr></thead><tbody>${filas}</tbody></table></div></div>`;
  }

  function cardPrecio(x) {
    const cambios = K.cambiosPrecio(x.meses);
    const ps = cambios.map(p => p.precio);
    const lo = Math.min(...ps) * 0.95, hi = Math.max(...ps) * 1.02;
    const filas = cambios.map(p => {
      const ch = p.cambio;
      const chip = ch == null ? '<span class="badge neutral">inicio</span>' : Math.abs(ch) < 0.0005 ? '<span class="badge neutral">igual</span>'
        : `<span class="badge ${ch > 0 ? 'success' : 'warn'}">${ch > 0 ? '+' : '−'}${fmt(Math.abs(ch) * 100, 1)}%</span>`;
      return `<div class="kc-precio"><b>${MES[p.mes]}</b><div style="height:10px;background:var(--panel2);border-radius:4px;overflow:hidden"><div style="height:10px;width:${hi > lo ? ((p.precio - lo) / (hi - lo) * 100).toFixed(1) : 100}%;background:var(--primary)"></div></div>
        <span style="text-align:right;font-weight:700">${money(p.precio)}</span><span style="text-align:center">${chip}</span></div>`;
    }).join('');
    return `<div class="card"><h3 style="margin:0">Precio por ${esc(minus(x.unidad) || 'unidad')}</h3><div class="muted" style="font-size:12px">Venta ÷ cantidad de cada mes; variación contra el mes anterior con compra.</div><div style="margin-top:6px">${filas}</div></div>`;
  }

  function cardSenales(x) {
    const s = K.senales(D, x);
    const u = plural(minus(x.unidad) || 'unidad');
    const txt = (z) => {
      if (z.tipo === 'concentracion') return ['Venta concentrada', `El cliente principal es el ${pct(z.top1, 0)} de la venta de estos productos${z.clientes === 1 ? ' (un solo cliente)' : ''}. Cualquier cambio en esa cuenta mueve todo el resultado.`];
      if (z.tipo === 'demanda') return ['Demanda a la baja', `${MES[z.meses_recientes[0]]}–${MES[z.meses_recientes[2]]}: ${n0(z.reciente)} ${u}/mes contra ${n0(z.anterior)} en ${MES[z.meses_anteriores[0]]}–${MES[z.meses_anteriores[2]]} (${pct(z.variacion)}).`];
      return [`${n0(z.dias)} días sin comprar`, `La última factura fue el ${fecha(z.ultima)}.`];
    };
    const cajas = s.map(z => { const [t, d] = txt(z); return `<div class="kc-senal ${z.nivel}"><div style="display:flex;gap:8px;align-items:center"><span class="badge ${z.nivel === 'alta' ? 'warn' : 'neutral'}">${z.nivel === 'alta' ? 'Alta' : 'Media'}</span><b>${esc(t)}</b></div><div style="color:#334155">${esc(d)}</div></div>`; }).join('');
    return `<div class="card"><h3 style="margin:0">Señales de la cuenta</h3>
      <div class="muted" style="font-size:12px">Concentración > ${pct(K.UMBRAL_CONCENTRACION, 0)} · últimos 3 meses con compra ${pct(K.UMBRAL_DEMANDA, 0)} o peor contra los 3 previos · más de ${K.RECENCIA_MEDIA} / ${K.RECENCIA_ALTA} días sin comprar.</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:10px;margin-top:10px">${cajas || '<div class="muted">Sin señales en el periodo.</div>'}</div></div>`;
  }

  $('btnAnalizar').addEventListener('click', analizar);
  $('btnMp').addEventListener('click', () => {
    verMp = !verMp;
    $('btnMp').setAttribute('aria-pressed', String(verMp));
    $('btnMp').textContent = verMp ? 'Ocultar contribución MP' : 'Mostrar contribución MP';
    if (D) pinta();
  });
  $('ptExtra').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    $('ptExtra').value.split(',').map(s => s.trim().toUpperCase()).filter(Boolean).forEach(k => seleccion.add(k));
    $('ptExtra').value = ''; guardaSel(); pintaProductos();
  });
  if (KoguShell.subscribeEmpresaActivaChange) KoguShell.subscribeEmpresaActivaChange(() => { D = null; activo = null; limpiar('Elige productos y analiza.'); });
  pintaProductos();
  if (seleccion.size) analizar(); else limpiar('Escribe las claves de producto y pulsa Analizar.');
});

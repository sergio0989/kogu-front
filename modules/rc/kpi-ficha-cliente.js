// ============================================================
// kpi-ficha-cliente.js — Radar Comercial · KPI Ventas Cliente (solo lectura).
// Todo lo que compra UN cliente contra los mismos meses del año anterior:
// venta, recurrente y únicas, ticket, ritmo de compra, días sin comprar, lugar
// entre los clientes de la empresa, meses, productos (nuevo / dejó / crece /
// cae / igual), facturas en el tiempo y señales. Solo ventas, sin costos.
// Endpoints: GET /protected/rc/kpi-cliente/clientes (selector del periodo)
//            GET /protected/rc/kpi-cliente/ficha    (ficha del cliente)
// Reglas puras en kpi-ficha-cliente-calc.js (tests/rc-kpi-ficha-cliente.test.mjs).
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/rc/kpi-ficha-cliente.html';
  const BASE = '/protected/rc';
  const PERM = 'screen.ventas.direccion';
  const K = window.KoguFichaCliente;
  const LS = 'kogu:rc-kpi-ficha-cliente:cliente';

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'KPI Ventas Cliente',
    description: 'Todo lo que compra un cliente contra el año anterior: ritmo, productos y señales.',
    requiredPermission: PERM,
  });
  if (!b) return;

  const $ = (id) => document.getElementById(id);
  const c = $('pageContent');
  const MES = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const MESL = ['', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const fmt = (v, d = 2) => (v == null ? '—' : Number(v).toLocaleString('es-MX', { minimumFractionDigits: d, maximumFractionDigits: d }));
  const money = (v, d = 0) => (v == null ? '—' : (Number(v) < 0 ? '−$' + fmt(-v, d) : '$' + fmt(v, d)));
  const corto = (v) => (v == null ? '—' : Math.abs(v) >= 1e6 ? '$' + fmt(v / 1e6, 1) + ' M' : Math.abs(v) >= 1e3 ? '$' + fmt(v / 1e3, 0) + 'k' : money(v));
  const n0 = (v) => (v == null ? '—' : Number(v).toLocaleString('es-MX', { maximumFractionDigits: 0 }));
  const pct = (v, d = 1) => (v == null ? '—' : fmt(v * 100, d) + '%');
  const signo = (v, d = 1) => (v == null ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + fmt(Math.abs(v) * 100, d) + '%');
  const fecha = (s) => { if (!s) return '—'; const [y, m, d] = String(s).split('-'); return `${Number(d)}-${MES[Number(m)].toLowerCase()}-${y}`; };
  const dias = (v) => (v == null ? '—' : fmt(v, v % 1 ? 1 : 0));

  const hoy = new Date();
  let clientes = [], filtro = '', cte = null, F = null, P = null, vista = 'total';
  try { cte = localStorage.getItem(LS) || null; } catch (_) { cte = null; }
  const guarda = () => { try { if (cte) localStorage.setItem(LS, cte); } catch (_) { /* sin almacenamiento */ } };

  if (!document.getElementById('estiloFichaCte')) {
    const st = document.createElement('style'); st.id = 'estiloFichaCte';
    st.textContent = `
      .fc-tile{padding:14px 16px}
      .fc-tile .lbl{font-size:11px;text-transform:uppercase;letter-spacing:.04em;font-weight:700;color:var(--muted)}
      .fc-tile .val{font-size:24px;font-weight:800;margin-top:2px;letter-spacing:-.01em;font-variant-numeric:tabular-nums}
      .fc-tile .hint{font-size:12px;color:var(--muted)}
      .fc-tile.oscuro{background:#0f172a;color:#fff}.fc-tile.oscuro .lbl,.fc-tile.oscuro .hint{color:#cbd5e1}
      .fc-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px}
      .fc-dos{display:grid;grid-template-columns:repeat(auto-fit,minmax(420px,1fr));gap:14px}
      .fc-dos>*,.fc-grid>*{min-width:0}
      @media (max-width:520px){.fc-dos{grid-template-columns:1fr}.fc-grid{grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}.fc-barras .v{display:none}}
      .fc-elige{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:14px;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:var(--panel2)}
      .fc-chip{display:inline-block;padding:4px 10px;border-radius:999px;font-size:12.5px;font-weight:700}
      .fc-seg{display:inline-flex;padding:3px;background:var(--panel2);border:1px solid var(--line);border-radius:10px;gap:3px}
      .fc-seg button{border:0;background:transparent;padding:6px 12px;border-radius:7px;font:inherit;font-size:13px;font-weight:600;color:var(--muted);cursor:pointer;min-height:36px}
      .fc-seg button[aria-pressed="true"]{background:#fff;color:var(--text);box-shadow:0 1px 2px rgba(15,23,42,.15)}
      .fc-barras{display:flex;align-items:stretch;gap:6px;height:250px;margin-top:12px}
      .fc-barras .col{flex:1 1 0;min-width:0;display:flex;flex-direction:column;align-items:center;gap:4px}
      .fc-barras .area{flex:1 1 auto;width:100%;display:flex;justify-content:center;align-items:flex-end;gap:3px}
      .fc-barras .pila{width:46%;max-width:46px;display:flex;flex-direction:column;justify-content:flex-end}
      .fc-barras .ant{width:22%;max-width:20px;background:#cbd5e1;border-radius:4px 4px 0 0}
      .fc-barras .v{font-size:11px;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap}
      .fc-barras .m{font-size:12px;font-weight:600}
      .table-wrap table.tabla-fc{table-layout:auto;width:max-content;min-width:100%;font-variant-numeric:tabular-nums;font-size:12.5px}
      .table-wrap .tabla-fc th,.table-wrap .tabla-fc td{white-space:nowrap;padding:8px 10px;word-break:normal}
      .tabla-fc .num{text-align:right}
      .tabla-fc td.desc{max-width:280px;overflow:hidden;text-overflow:ellipsis}
      .fc-rk{display:grid;grid-template-columns:26px minmax(0,150px) 1fr 86px 52px;gap:8px;align-items:center;font-size:12.5px;font-variant-numeric:tabular-nums;padding:3px 0}
      .fc-rk .nom{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .fc-rk.yo .nom{font-weight:800;color:#155e75}
      .fc-tl{position:relative;height:110px;margin:6px 8px 0}
      .fc-senal{padding:12px 14px;border-radius:10px;display:flex;flex-direction:column;gap:6px;font-size:13px}
      .fc-senal.alta{background:#fff7ed;border:1px solid #fed7aa}
      .fc-senal.media{background:var(--panel2);border:1px solid var(--line)}
      .fc-senal.dato{background:#f0f9ff;border:1px solid #bae6fd}
      .fc-senal.bien{background:#f0fdf4;border:1px solid #bbf7d0}
      dialog.fc-dlg{width:min(1000px,92vw);height:85vh;max-height:85vh;padding:0;border:0;border-radius:14px;box-shadow:0 24px 64px rgba(15,23,42,.35)}
      dialog.fc-dlg::backdrop{background:rgba(15,23,42,.45)}
      dialog.fc-dlg[open]{display:flex;flex-direction:column}
      .fc-dlg header{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:16px 20px;border-bottom:1px solid var(--line)}
      .fc-dlg .barra{padding:10px 20px;background:var(--panel2);border-bottom:1px solid var(--line)}
      .fc-dlg .lista{flex:1 1 auto;overflow:auto;min-height:0}
      .fc-dlg .it,.fc-dlg .cab{display:grid;grid-template-columns:40px 70px minmax(0,1fr) minmax(0,160px) 120px 64px 96px;gap:10px;align-items:center;padding:9px 20px;border-bottom:1px solid var(--line);font-size:13px;font-variant-numeric:tabular-nums;text-align:left}
      .fc-dlg .cab{position:sticky;top:0;background:#fff;z-index:1;font-size:11px;text-transform:uppercase;letter-spacing:.04em;font-weight:700;color:var(--muted)}
      .fc-dlg button.it{width:100%;background:#fff;border:0;border-bottom:1px solid var(--line);font:inherit;color:inherit;cursor:pointer}
      .fc-dlg button.it:hover,.fc-dlg button.it:focus-visible{background:#ecfeff}
      .fc-dlg button.it.on{background:#ecfeff}
      .fc-dlg .num{text-align:right}
      .fc-dlg .tx{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
      @media (max-width:640px){dialog.fc-dlg{width:100vw;max-width:100vw;height:100vh;max-height:100vh;border-radius:0}
        .fc-dlg .it,.fc-dlg .cab{grid-template-columns:34px minmax(0,1fr) 96px;padding:9px 12px}.fc-dlg .opc{display:none}}`;
    document.head.appendChild(st);
  }

  c.innerHTML = `
<div class="card">
  <div class="row" style="align-items:flex-end;gap:12px;flex-wrap:wrap">
    <div style="flex:1 1 300px"><div class="eyebrow">Radar comercial · Ventas</div><h2 style="margin:0">KPI Ventas Cliente</h2>
      <div class="muted" style="font-size:12px">Todo lo que compra un cliente contra los mismos meses del año anterior. Venta sin IVA, neta de notas de crédito. Cliente y agente del catálogo KOGU.</div></div>
    <div><label class="muted" style="font-size:12px;display:block" for="anio">Año</label><input id="anio" type="number" class="input" style="width:100px"/></div>
    <div><label class="muted" style="font-size:12px;display:block" for="mesIni">Mes inicial</label><select id="mesIni" class="select" style="min-width:110px"></select></div>
    <div><label class="muted" style="font-size:12px;display:block" for="mesFin">Mes final</label><select id="mesFin" class="select" style="min-width:110px"></select></div>
    <button class="btn primary" id="btnAnalizar">Analizar</button>
  </div>
  <div class="fc-elige">
    <button class="btn" id="btnElegir" type="button" aria-haspopup="dialog">Elegir cliente</button>
    <span id="selResumen" style="font-size:13px;flex:1 1 260px;min-width:0" aria-live="polite"></span>
  </div>
</div>
<dialog class="fc-dlg" id="dlgCte" aria-labelledby="dlgCteTit">
  <header><div><h3 id="dlgCteTit" style="margin:0">Clientes con venta en el periodo</h3><div class="muted" id="dlgPeriodo" style="font-size:12px"></div></div>
    <button class="btn ghost" type="button" id="dlgCerrar" aria-label="Cerrar">✕</button></header>
  <div class="barra"><input id="buscaCte" class="input" type="search" placeholder="Buscar por clave, nombre o agente…" aria-label="Buscar cliente" style="width:100%;padding:8px 12px;font-size:14px;box-sizing:border-box"/></div>
  <div class="lista" id="clientes" aria-label="Clientes"></div>
</dialog>
<div id="cuerpo" style="margin-top:14px;display:flex;flex-direction:column;gap:14px"></div>`;

  const opts = MES.slice(1).map((m, i) => `<option value="${i + 1}">${m}</option>`).join('');
  $('mesIni').innerHTML = opts; $('mesFin').innerHTML = opts;
  $('anio').value = hoy.getFullYear(); $('mesIni').value = 1; $('mesFin').value = hoy.getMonth() + 1;
  const periodo = () => ({ anio: parseInt($('anio').value, 10), mes_ini: parseInt($('mesIni').value, 10), mes_fin: parseInt($('mesFin').value, 10) });
  const limpiar = (msg) => { $('cuerpo').innerHTML = `<div class="card muted" style="padding:16px">${esc(msg)}</div>`; };

  // ── Selector de clientes ──
  async function cargarClientes() {
    const p = periodo();
    if (p.mes_ini > p.mes_fin) return KoguApi.toast('El mes inicial no puede ser mayor que el final.', 'error');
    $('selResumen').textContent = 'Cargando clientes…';
    try {
      const r = KoguApi.unwrapData(await KoguApi.apiFetch(`${BASE}/kpi-cliente/clientes?${new URLSearchParams(p)}`));
      clientes = (r && r.clientes) || [];
      if (cte && !clientes.find(x => x.cve_cte === cte)) cte = null;
      pintaResumen();
      if (cte) analizar();
      else limpiar(clientes.length ? `Hay ${clientes.length} clientes con venta en el periodo. Pulsa «Elegir cliente».` : 'No hay ventas en el periodo.');
    } catch (e) { clientes = []; pintaResumen(); limpiar(e.message || 'No se pudieron cargar los clientes.'); KoguApi.toast(e.message, 'error'); }
  }
  function pintaResumen() {
    const x = clientes.find(y => y.cve_cte === cte);
    $('selResumen').innerHTML = !clientes.length ? '<span class="muted">Sin clientes con venta en el periodo.</span>'
      : !x ? `<span class="muted">Ningún cliente elegido · ${clientes.length} con venta en el periodo</span>`
      : `<b>${esc(x.cve_cte)} · ${esc(x.cliente || '—')}</b> · ${esc(x.agente || 'sin agente')} · <span class="muted">lugar ${x.lugar} de ${clientes.length}</span>`;
    $('btnElegir').disabled = !clientes.length;
  }
  function pintaClientes() {
    const vis = K.filtrarClientes(clientes, filtro);
    const cab = '<div class="cab" aria-hidden="true"><span class="num">#</span><span class="opc">Clave</span><span>Cliente</span><span class="opc">Agente</span><span class="num">Venta neta</span><span class="num opc">Part.</span><span class="num opc">Última</span></div>';
    $('clientes').innerHTML = cab + (vis.length ? vis.map(x => `<button type="button" aria-pressed="${x.cve_cte === cte}" class="it ${x.cve_cte === cte ? 'on' : ''}" data-cte="${esc(x.cve_cte)}">
        <span class="num muted">${x.lugar}</span><b class="opc">${esc(x.cve_cte)}</b><span class="tx" title="${esc(x.cliente || '')}">${esc(x.cliente || '—')}</span>
        <span class="tx opc muted">${esc(x.agente || '—')}</span><span class="num">${money(x.venta_neta)}</span>
        <span class="num opc">${x.participacion > 0 && x.participacion < 0.001 ? '<0.1%' : pct(x.participacion)}</span><span class="num opc muted">${esc(fecha(x.ultima))}</span></button>`).join('')
      : `<div class="muted" style="padding:16px 20px;font-size:13px">Ningún cliente coincide con la búsqueda.</div>`);
    $('clientes').querySelectorAll('[data-cte]').forEach(btn => btn.addEventListener('click', () => {
      cte = btn.dataset.cte; guarda(); pintaResumen(); $('dlgCte').close(); $('btnElegir').focus(); analizar();
    }));
  }
  function abrirSelector() {
    const p = periodo(); filtro = ''; $('buscaCte').value = '';
    $('dlgPeriodo').textContent = `${MESL[p.mes_ini]} a ${MESL[p.mes_fin]} de ${p.anio} · ${clientes.length} clientes · clic en uno para ver su ficha`;
    pintaClientes(); $('dlgCte').showModal(); $('buscaCte').focus();
  }

  // ── Ficha ──
  async function analizar() {
    if (!cte) return limpiar('Ningún cliente elegido. Pulsa «Elegir cliente».');
    P = periodo();
    if (P.mes_ini > P.mes_fin) return KoguApi.toast('El mes inicial no puede ser mayor que el final.', 'error');
    $('btnAnalizar').disabled = true; F = null; limpiar('Cargando…');
    try {
      F = KoguApi.unwrapData(await KoguApi.apiFetch(`${BASE}/kpi-cliente/ficha?${new URLSearchParams({ ...P, cve_cte: cte })}`));
      if (!F || !F.actual) return limpiar('El cliente no tiene ventas en el periodo.');
      // Las etiquetas usan el periodo que respondió el back, no el de los filtros.
      if (F.periodo) P = { anio: F.periodo.anio, mes_ini: F.periodo.mes_ini, mes_fin: F.periodo.mes_fin };
      pinta();
    } catch (e) { limpiar(e.message || 'No se pudo cargar.'); KoguApi.toast(e.message, 'error'); }
    finally { $('btnAnalizar').disabled = false; }
  }

  const tile = (lbl, val, hint, extra = '', cls = '') => `<div class="card fc-tile ${cls}"><div class="lbl">${lbl}</div>
    <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap"><span class="val">${val}</span>${extra}</div><div class="hint">${hint}</div></div>`;
  const chipVar = (v) => (v == null ? '' : `<span class="badge ${v < -K.UMBRAL_ANUAL ? 'danger' : v > K.UMBRAL_ANUAL ? 'success' : 'neutral'}">${signo(v)}</span>`);
  const pAnt = () => `${MES[P.mes_ini]}–${MES[P.mes_fin]} ${P.anio - 1}`;

  function pinta() {
    const a = F.actual, b = F.anterior, cl = F.cliente;
    const sen = K.senales(F);
    const rec = sen.find(s => s.tipo === 'recencia');
    const varChip = !b ? '<span class="fc-chip" style="background:#fef3c7;color:#92400e">Sin compras el año anterior</span>'
      : `<span class="fc-chip" style="${F.variacion < -K.UMBRAL_ANUAL ? 'background:#fee2e2;color:#991b1b' : F.variacion > K.UMBRAL_ANUAL ? 'background:#dcfce7;color:#166534' : 'background:var(--panel2);color:#334155'}">${signo(F.variacion)} vs ${esc(pAnt())}</span>`;
    $('cuerpo').innerHTML = `
      <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:baseline;justify-content:space-between">
        <div><h2 style="margin:0">${esc(cl.cliente || 'Cliente ' + cl.cve_cte)}</h2>
          <div class="muted" style="font-size:13px">Cliente ${esc(cl.cve_cte)} · agente ${esc(cl.agente || 'sin asignar')} · primera compra del periodo ${esc(fecha(a.primera))}</div></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${F.lugar ? `<span class="fc-chip" style="background:#ecfeff;color:#155e75">Lugar ${F.lugar.lugar} de ${F.lugar.clientes}</span><span class="fc-chip" style="background:var(--panel2);color:#334155">${pct(F.lugar.participacion)} de la venta</span>` : ''}
          ${varChip}
        </div>
      </div>
      <div class="fc-grid">
        ${tile('Venta neta', money(a.venta_neta), b ? `${esc(pAnt())}: ${money(b.venta_neta)}` : `${a.facturas} facturas · ${a.notas} notas de crédito`, chipVar(F.variacion))}
        ${tile('Venta recurrente', money(a.recurrente), `${pct(a.venta_neta ? a.recurrente / a.venta_neta : null)} · únicas ${money(a.unica)}`)}
        ${tile('Facturas y ticket', `${n0(a.facturas)} · ${corto(a.ticket)}`, `${money(a.ticket_recurrente)} en facturas recurrentes${b ? ` · antes ${n0(b.facturas)} facturas` : ''}`)}
        ${tile('Ritmo de compra', a.ritmo_dias == null ? '—' : `cada ${dias(a.ritmo_dias)} días`, `${a.meses_compra} meses con compra${b && b.ritmo_dias != null ? ` · antes cada ${dias(b.ritmo_dias)}` : ''}`)}
        ${tile('Última compra', a.dias_sin_compra == null ? '—' : `hace ${n0(a.dias_sin_compra)} días`, `${esc(fecha(a.ultima))}${rec ? ` · ${fmt(rec.veces, 1)} veces su ritmo` : ''}`, '', 'oscuro')}
      </div>
      <div class="fc-dos">${cardMeses()}${cardRanking()}</div>
      ${cardProductos()}
      ${cardFacturas(sen)}
      ${cardSenales(sen)}
      <div class="muted" style="font-size:12px">Venta neta = subtotal sin IVA menos notas de crédito · única = producto en una sola factura del periodo o servicio (clave SER…) · ritmo = mediana de días entre compras recurrentes · estado de producto: ±10% contra ${esc(pAnt())} · días sin comprar al ${esc(fecha(F.periodo.fecha_corte))}.</div>`;
    $('cuerpo').querySelectorAll('[data-vista]').forEach(btn => btn.addEventListener('click', () => { vista = btn.dataset.vista; pinta(); }));
  }

  function cardMeses() {
    const solo = vista === 'recurrente', hayAnt = !!F.anterior;
    const val = (m) => (solo ? m.recurrente : m.venta_neta) || 0;
    const max = Math.max(1, ...F.meses.map(m => Math.max(val(m), hayAnt ? (m.anterior || 0) : 0)));
    const h = (v) => (v > 0 ? Math.max(4, Math.round(v / max * 180)) : 0);
    const cols = F.meses.map(m => {
      const rec = Math.max(0, m.recurrente || 0), un = solo ? 0 : Math.max(0, m.unica || 0), v = val(m);
      const tip = `${MESL[m.mes]}: ${money(m.venta_neta)}${m.unica ? ` (únicas ${money(m.unica)})` : ''} · ${m.facturas} facturas${hayAnt ? ` · ${P.anio - 1}: ${money(m.anterior)}` : ''}`;
      const pila = (un ? `<div style="height:${h(un)}px;background:#f59e0b;border-radius:4px 4px 0 0"></div>` : '')
        + (rec ? `<div style="height:${h(rec)}px;background:var(--primary);border-radius:${un ? '0' : '4px 4px 0 0'}"></div>` : (!un ? '<div style="height:4px;border:1px dashed #94a3b8;border-radius:3px"></div>' : ''));
      return `<div class="col" title="${esc(tip)}"><span class="v">${v ? corto(v) : '—'}</span><div class="area"><div class="pila">${pila}</div>
        ${hayAnt ? `<div class="ant" style="height:${h(m.anterior || 0)}px"></div>` : ''}</div>
        <span class="m">${MES[m.mes]}</span><span class="muted" style="font-size:11px">${m.facturas || '—'}</span></div>`;
    }).join('');
    return `<div class="card"><div class="row" style="justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
      <div><h3 style="margin:0">Venta por mes</h3><div class="muted" style="font-size:12px">Número de abajo: facturas del mes${hayAnt ? ` · barra gris: ${P.anio - 1}` : ' · sin año anterior para comparar'}</div></div>
      <div class="fc-seg" role="group" aria-label="Qué venta"><button type="button" data-vista="total" aria-pressed="${!solo}">Total</button><button type="button" data-vista="recurrente" aria-pressed="${solo}">Solo recurrente</button></div></div>
      <div class="fc-barras">${cols}</div>
      <div style="display:flex;flex-wrap:wrap;gap:14px;font-size:12px;color:var(--muted);margin-top:8px">
        <span><span aria-hidden="true" style="display:inline-block;width:11px;height:11px;border-radius:3px;background:var(--primary);vertical-align:-1px"></span> Recurrente</span>
        ${solo ? '' : '<span><span aria-hidden="true" style="display:inline-block;width:11px;height:11px;border-radius:3px;background:#f59e0b;vertical-align:-1px"></span> Única</span>'}
        ${hayAnt ? `<span><span aria-hidden="true" style="display:inline-block;width:11px;height:11px;border-radius:3px;background:#cbd5e1;vertical-align:-1px"></span> ${P.anio - 1}</span>` : ''}</div></div>`;
  }

  function cardRanking() {
    const max = Math.max(1, ...F.ranking.map(r => r.venta_neta || 0));
    const filas = F.ranking.map((r, i) => `${i > 0 && r.lugar > F.ranking[i - 1].lugar + 1 ? '<div class="muted" style="text-align:center;font-size:12px">⋯</div>' : ''}
      <div class="fc-rk ${r.actual ? 'yo' : ''}"><span class="muted" style="text-align:right">${r.lugar}</span><span class="nom" title="${esc(r.cliente || '')}">${esc(r.cliente || 'Cliente ' + r.cve_cte)}</span>
      <div style="height:11px;background:var(--panel2);border-radius:4px;overflow:hidden"><div style="height:11px;width:${Math.max(0.6, (r.venta_neta || 0) / max * 100).toFixed(1)}%;background:${r.actual ? 'var(--primary)' : '#cbd5e1'}"></div></div>
      <span style="text-align:right">${corto(r.venta_neta)}</span><span class="muted" style="text-align:right">${pct(r.participacion)}</span></div>`).join('');
    const top3 = F.ranking.filter(r => r.lugar <= 3).reduce((s, r) => s + (r.participacion || 0), 0);
    return `<div class="card"><h3 style="margin:0">Su lugar entre los clientes</h3>
      <div class="muted" style="font-size:12px">Venta neta del periodo · ${F.lugar ? F.lugar.clientes : 0} clientes · los 3 primeros suman ${pct(top3)}</div>
      <div style="margin-top:10px;display:flex;flex-direction:column;gap:2px">${filas}</div></div>`;
  }

  const TIPO = { recurrente: ['Recurrente', 'background:#ecfeff;color:#155e75'], unica: ['Única', 'background:#fef3c7;color:#92400e'], servicio: ['Servicio', 'background:#fef3c7;color:#92400e'] };
  const EST = { nuevo: ['Nuevo', 'success'], dejo: ['Dejó', 'danger'], crece: ['Crece', 'success'], cae: ['Cae', 'warn'], igual: ['Igual', 'neutral'] };
  function cardProductos() {
    const hayAnt = !!F.anterior;
    const cuenta = F.productos.reduce((m, p) => ({ ...m, [p.estado]: (m[p.estado] || 0) + 1 }), {});
    const resumen = hayAnt ? ['crece', 'igual', 'cae', 'nuevo', 'dejo'].filter(k => cuenta[k]).map(k => `<span class="badge ${EST[k][1]}">${cuenta[k]} ${EST[k][0].toLowerCase()}</span>`).join(' ') : '';
    const filas = F.productos.map(p => {
      const t = TIPO[p.tipo] || ['—', ''];
      const v = hayAnt && p.anterior ? p.venta_neta / p.anterior - 1 : null;
      const est = EST[p.estado] || [p.estado, 'neutral'];
      return `<tr${p.estado === 'dejo' ? ' style="color:var(--muted)"' : ''}><td><b>${esc(p.cve_prod)}</b></td><td class="desc" title="${esc(p.descripcion || '')}">${esc(p.descripcion || '—')}</td>
        <td><span class="fc-chip" style="${t[1]};font-size:11.5px">${t[0]}</span></td>
        <td class="num">${p.estado === 'dejo' ? '—' : `${n0(p.cantidad)} ${esc((p.unidad || '').toLowerCase())}`}</td><td class="num">${p.precio == null ? '—' : money(p.precio, 2)}</td>
        <td class="num" style="font-weight:700">${money(p.venta_neta)}</td><td class="num">${p.participacion == null ? '—' : pct(p.participacion)}</td>
        ${hayAnt ? `<td class="num">${money(p.anterior)}</td><td class="num">${v == null ? '—' : signo(v)}</td>` : ''}
        ${hayAnt ? `<td><span class="badge ${est[1]}">${est[0]}</span></td>` : ''}<td class="num">${p.facturas || '—'}</td></tr>`;
    }).join('');
    return `<div class="card"><div class="row" style="justify-content:space-between;align-items:baseline;gap:8px;flex-wrap:wrap"><h3 style="margin:0">Qué compra</h3><div style="display:flex;gap:6px;flex-wrap:wrap">${resumen}</div></div>
      <div class="table-wrap" style="margin-top:10px"><table class="tabla-fc"><thead><tr><th>Clave</th><th>Descripción</th><th>Tipo</th><th class="num">Cantidad</th><th class="num">Precio</th><th class="num">Venta neta</th><th class="num">Part.</th>
      ${hayAnt ? `<th class="num">${P.anio - 1}</th><th class="num">Var.</th><th>Estado</th>` : ''}<th class="num">Facturas</th></tr></thead><tbody>${filas}</tbody></table></div></div>`;
  }

  function cardFacturas(sen) {
    const fs = F.facturas;
    if (!fs.length) return '';
    const t0 = Date.parse(`${P.anio}-${String(P.mes_ini).padStart(2, '0')}-01`);
    const t1 = Math.max(Date.parse(F.periodo.fecha_corte), Date.parse(fs[fs.length - 1].fecha));
    const x = (iso) => Math.min(100, Math.max(0, (Date.parse(iso) - t0) / (t1 - t0) * 100));
    const maxV = Math.max(1, ...fs.map(f => Math.abs(f.venta_neta)));
    const puntos = fs.map(f => {
      const s = Math.round(8 + Math.sqrt(Math.abs(f.venta_neta) / maxV) * 20);
      const color = f.venta_neta < 0 ? 'rgba(220,38,38,.75)' : f.unica ? 'rgba(245,158,11,.8)' : 'rgba(8,145,178,.7)';
      return `<span title="${esc(`${f.folio_factura} · ${fecha(f.fecha)} · ${money(f.venta_neta)}${f.unica ? ' · única' : ''}`)}" style="position:absolute;top:${48 - s / 2}px;left:calc(${x(f.fecha).toFixed(2)}% - ${s / 2}px);width:${s}px;height:${s}px;border-radius:50%;background:${color};border:2px solid #fff;box-sizing:border-box"></span>`;
    }).join('');
    const ult = F.actual.ultima;
    const hueco = ult ? `<span style="position:absolute;top:40px;height:16px;left:${x(ult).toFixed(2)}%;right:0;border:2px dashed #f59e0b;border-left:0;border-radius:0 6px 6px 0;background:rgba(254,243,199,.6);box-sizing:border-box"></span>` : '';
    const ejes = [];
    const finMes = Math.min(12, Math.max(P.mes_fin, Number(String(F.periodo.fecha_corte).slice(5, 7)) || P.mes_fin));
    for (let m = P.mes_ini; m <= finMes; m++) ejes.push(`<span style="position:absolute;top:84px;left:${x(`${P.anio}-${String(m).padStart(2, '0')}-01`).toFixed(2)}%;font-size:11px;color:var(--muted);border-left:1px solid var(--line);padding-left:3px">${MES[m]}</span>`);
    const iv = F.actual.intervalos || [];
    const r = F.actual.ritmo_dias;
    const ultimos = iv.slice(-14).map(d => `<span class="badge ${r && d > K.RECENCIA_ALTA * r ? 'warn' : 'neutral'}">${d}</span>`).join(' ');
    const rec = sen.find(s => s.tipo === 'recencia');
    return `<div class="card"><h3 style="margin:0">Sus facturas en el tiempo</h3>
      <div class="muted" style="font-size:12px">${fs.length} facturas · cada punto es una factura, del tamaño de su importe · la franja punteada va de la última compra al corte</div>
      <div class="fc-tl"><span style="position:absolute;left:0;right:0;top:47px;height:2px;background:var(--line)"></span>${hueco}${puntos}${ejes.join('')}</div>
      <div style="font-size:12.5px;margin-top:4px">Días entre compras recurrentes${iv.length > 14 ? ' (últimas 14)' : ''}: ${ultimos || '—'}
        ${F.actual.dias_sin_compra != null ? ` <span class="badge ${rec ? (rec.nivel === 'alta' ? 'danger' : 'warn') : 'success'}">hoy ${F.actual.dias_sin_compra}</span>` : ''}</div></div>`;
  }

  function cardSenales(sen) {
    const txt = (s) => {
      if (s.tipo === 'recencia') return [`${n0(s.dias)} días sin comprar`, `Compra cada ${dias(s.ritmo)} días y lleva ${fmt(s.veces, 1)} veces eso sin factura. Última: ${fecha(s.ultima)}.`];
      if (s.tipo === 'demanda') return ['Venta recurrente a la baja', `${MES[s.meses_recientes[0]]}–${MES[s.meses_recientes[2]]} promedia ${money(s.reciente)} al mes contra ${money(s.anterior)} en ${MES[s.meses_anteriores[0]]}–${MES[s.meses_anteriores[2]]} (${signo(s.variacion)}).`];
      if (s.tipo === 'anual') return [s.nivel === 'bien' ? 'Crece contra el año anterior' : 'Cae contra el año anterior', `${money(s.actual)} contra ${money(s.anterior)} en ${pAnt()} (${signo(s.variacion)}).`];
      if (s.tipo === 'dejo') return [`Dejó de comprar ${s.productos} ${s.productos === 1 ? 'producto' : 'productos'}`, `Sumaban ${money(s.anterior)} en ${pAnt()}: ${s.claves.slice(0, 4).join(', ')}${s.claves.length > 4 ? '…' : ''}. Revisa si alguno cambió de clave.`];
      if (s.tipo === 'unicas') return ['Ventas únicas aparte', `${money(s.monto)} (${pct(s.parte)}) en productos de una sola factura o servicios; no cuentan para el ritmo ni la tendencia.`];
      return ['Cliente nuevo', `No compró en ${pAnt()}; no hay comparativo contra el año anterior.`];
    };
    const etq = { alta: ['Alta', 'warn'], media: ['Media', 'neutral'], dato: ['Dato', 'primary'], bien: ['Bien', 'success'] };
    const cajas = sen.map(s => { const [t, d] = txt(s); const e = etq[s.nivel] || ['', 'neutral'];
      return `<div class="fc-senal ${s.nivel}"><div style="display:flex;gap:8px;align-items:center"><span class="badge ${e[1]}">${e[0]}</span><b>${esc(t)}</b></div><div style="color:#334155">${esc(d)}</div></div>`; }).join('');
    return `<div class="card"><h3 style="margin:0">Señales de la cuenta</h3>
      <div class="muted" style="font-size:12px">Más de ${fmt(K.RECENCIA_MEDIA, 1)} / ${K.RECENCIA_ALTA} veces su ritmo sin comprar · recurrente de los últimos 3 meses ${pct(K.UMBRAL_DEMANDA, 0)} o peor · ±${pct(K.UMBRAL_ANUAL, 0)} contra el año anterior.</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:10px;margin-top:10px">${cajas || '<div class="muted">Sin señales en el periodo.</div>'}</div></div>`;
  }

  $('btnAnalizar').addEventListener('click', analizar);
  ['anio', 'mesIni', 'mesFin'].forEach(id => $(id).addEventListener('change', cargarClientes));
  $('btnElegir').addEventListener('click', abrirSelector);
  $('buscaCte').addEventListener('input', () => { filtro = $('buscaCte').value; pintaClientes(); });
  $('dlgCerrar').addEventListener('click', () => { $('dlgCte').close(); $('btnElegir').focus(); });
  $('dlgCte').addEventListener('click', (e) => { if (e.target === $('dlgCte')) $('dlgCte').close(); });
  if (KoguShell.subscribeEmpresaActivaChange) KoguShell.subscribeEmpresaActivaChange(() => { cte = null; F = null; cargarClientes(); });
  cargarClientes();
});

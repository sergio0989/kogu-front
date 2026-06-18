// ============================================================
// rentabilidad.js — Costo (cto_): Rentabilidad por producto / cliente.
// Pestañas Producto/Cliente, resalta Top por ventas y Peores por margen,
// tabla ordenable, filtro año/mes/búsqueda y export Excel.
// Solo lectura: GET /protected/cto/rentabilidad/:dim/:anio(?mes=).
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/cto/rentabilidad.html';
  const PERM = 'screen.costo';
  const BASE = '/protected/cto';

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Costo — Rentabilidad',
    description: 'Quién deja y quién cuesta: ventas, costo, utilidad y margen por producto y por cliente.',
    requiredPermission: PERM,
  });
  if (!b) return;

  const $ = (id) => document.getElementById(id);
  const now = new Date();
  const MESES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

  const fmtMon = (v) => '$' + (Number(v) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtMM = (v) => '$' + (Number(v) / 1e6).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' M';
  const fmtPct = (v) => v == null ? '—' : ((Number(v) || 0) * 100).toFixed(2) + ' %';
  const fmtNum = (v) => (Number(v) || 0).toLocaleString('es-MX');
  const fmtKg = (v) => (Number(v) || 0).toLocaleString('es-MX', { maximumFractionDigits: 0 }) + ' kg';
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

  // Color del margen: <0 rojo, <10% ámbar, ≥20% verde, intermedio gris.
  function margenCol(m) {
    if (m == null) return '#64748b';
    const p = Number(m);
    return p < 0 ? '#991b1b' : p < 0.10 ? '#854d0e' : p >= 0.20 ? '#166534' : '#475569';
  }
  function margenChip(m) {
    const c = margenCol(m);
    return `<span style="color:${c};font-weight:700">${fmtPct(m)}</span>`;
  }

  let dim = 'producto';
  let data = null;             // { dim, anio, mes, items, totales }
  let sortKey = 'ventas';
  let sortDir = 'desc';

  $('pageContent').innerHTML = `
<div class="card">
  <div class="row">
    <div><div class="eyebrow">Costo · Análisis</div><h2 style="margin:2px 0">Rentabilidad</h2>
      <div class="muted" style="font-size:12px">Ventas, costo, utilidad y margen por producto y por cliente</div></div>
    <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap">
      <div><label class="muted" style="font-size:12px;display:block">Año</label><input type="number" id="anio" class="input" style="width:100px" value="${now.getFullYear()}"/></div>
      <div><label class="muted" style="font-size:12px;display:block">Periodo</label>
        <select id="mes" class="input" style="width:160px">
          <option value="acum">Acumulado (año)</option>
          ${MESES.slice(1).map((n, i) => `<option value="${i + 1}">${n}</option>`).join('')}
        </select></div>
      <div><label class="muted" style="font-size:12px;display:block">Buscar</label><input type="text" id="q" class="input" style="width:200px" placeholder="clave o nombre"/></div>
      <button class="btn primary" id="refreshBtn">Actualizar</button>
      <button class="btn ghost" id="exportBtn">⬇ Excel</button>
    </div>
  </div>

  <div style="display:flex;gap:8px;margin-top:14px">
    <button class="tab" id="tabProducto">Por producto</button>
    <button class="tab" id="tabCliente">Por cliente</button>
  </div>
  <div id="msg" style="display:none;margin-top:14px;padding:12px;border-radius:6px;font-size:13px"></div>
</div>

<div id="kpis" class="grid-3" style="margin-top:16px;gap:12px;display:none"></div>

<div class="split" id="highlights" style="margin-top:16px;display:none">
  <div class="card" style="margin:0"><h3 style="margin:0 0 10px 0">Top por ventas</h3><div id="topVentas"></div></div>
  <div class="card" style="margin:0"><h3 style="margin:0 0 10px 0">Peores por margen</h3>
    <div class="muted" style="font-size:11px;margin-bottom:8px">Entre los que venden (&gt; 0). Los que “cuestan”.</div>
    <div id="peorMargen"></div></div>
</div>

<div class="card" id="tablaCard" style="margin-top:16px;display:none">
  <div class="row"><h3 id="tablaTitulo" style="margin:0">Detalle</h3>
    <span class="muted" style="font-size:12px" id="tablaSub"></span></div>
  <div style="overflow-x:auto;margin-top:10px"><table class="table" id="tabla" style="width:100%;font-size:13px;font-variant-numeric:tabular-nums"></table></div>
</div>`;

  function showMsg(html, tipo) {
    const m = $('msg');
    const bg = tipo === 'error' ? '#fee2e2' : tipo === 'warn' ? '#fef9c3' : '#dcfce7';
    const co = tipo === 'error' ? '#991b1b' : tipo === 'warn' ? '#854d0e' : '#166534';
    m.style.cssText = `display:block;margin-top:14px;padding:12px;border-radius:6px;font-size:13px;background:${bg};color:${co}`;
    m.innerHTML = html;
  }

  function syncTabs() {
    $('tabProducto').className = 'tab' + (dim === 'producto' ? ' active' : '');
    $('tabCliente').className = 'tab' + (dim === 'cliente' ? ' active' : '');
    const etq = dim === 'cliente' ? 'cliente' : 'producto';
    $('q').placeholder = 'clave o nombre de ' + etq;
  }

  function kpi(label, val, sub, accent) {
    return `<div class="card" style="padding:16px;${accent ? 'border-top:3px solid ' + accent : ''}">
      <div class="muted" style="font-size:12px">${label}</div>
      <div style="font-size:22px;font-weight:700;margin-top:4px">${val}</div>
      ${sub ? `<div class="muted" style="font-size:12px;margin-top:2px">${sub}</div>` : ''}</div>`;
  }

  function pintarKpis() {
    const t = data.totales;
    const etq = dim === 'cliente' ? 'clientes' : 'productos';
    $('kpis').style.display = 'grid';
    $('kpis').innerHTML = [
      kpi('Ventas del periodo', fmtMM(t.ventas), `${fmtMon(t.ventas)}`, '#0d9488'),
      kpi('Utilidad bruta', fmtMM(t.utilidad_bruta), `${fmtPct(t.margen)} de margen`, '#8b5cf6'),
      kpi(`${data.totales.registros} ${etq}`, fmtKg(t.kilos), 'kilos del periodo', '#64748b'),
    ].join('');
  }

  function filaMini(r) {
    return `<div style="display:flex;justify-content:space-between;gap:10px;padding:6px 0;border-bottom:1px solid #f1f5f9">
      <div style="min-width:0"><div style="font-weight:600;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(r.nombre || r.clave)}</div>
        <div class="muted" style="font-size:11px">${esc(r.clave)} · ${fmtMM(r.ventas)}</div></div>
      <div style="text-align:right;white-space:nowrap">${margenChip(r.margen)}<div class="muted" style="font-size:11px">${fmtMM(r.utilidad_bruta)}</div></div>
    </div>`;
  }

  function pintarHighlights() {
    const items = data.items;
    const top = [...items].sort((a, b) => b.ventas - a.ventas).slice(0, 5);
    // "Peores por margen": ignorar ventas ínfimas (umbral = 0.01% del total),
    // porque sobre ventas ≈ 0 el margen se dispara (división por casi cero) y
    // tapa las pérdidas que sí importan. La tabla de abajo sí muestra todo.
    const floor = (data.totales.ventas || 0) * 0.0001;
    const peor = items.filter(r => r.ventas > floor && r.margen != null)
      .sort((a, b) => a.margen - b.margen).slice(0, 5);
    $('highlights').style.display = 'grid';
    $('topVentas').innerHTML = top.map(filaMini).join('') || '<div class="muted">Sin datos.</div>';
    $('peorMargen').innerHTML = peor.map(filaMini).join('') || '<div class="muted">Sin datos.</div>';
  }

  function th(label, key, alignRight = true) {
    const arrow = sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';
    return `<th data-key="${key}" style="padding:6px;cursor:pointer;${alignRight ? 'text-align:right' : 'text-align:left'}">${label}${arrow}</th>`;
  }

  function itemsOrdenados() {
    const q = ($('q').value || '').trim().toLowerCase();
    let arr = data.items;
    if (q) arr = arr.filter(r => String(r.clave).toLowerCase().includes(q) || String(r.nombre || '').toLowerCase().includes(q));
    const dirf = sortDir === 'asc' ? 1 : -1;
    return [...arr].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      if (sortKey === 'clave' || sortKey === 'nombre') return String(av || '').localeCompare(String(bv || '')) * dirf;
      return ((Number(av) || 0) - (Number(bv) || 0)) * dirf;
    });
  }

  function pintarTabla() {
    const etq = dim === 'cliente' ? 'Cliente' : 'Producto';
    const head = `<thead><tr style="border-bottom:2px solid #e2e8f0">
      ${th('Clave', 'clave', false)}${th(etq, 'nombre', false)}
      ${th('Ventas', 'ventas')}${th('Costo int.', 'costo_integrado')}
      ${th('Utilidad', 'utilidad_bruta')}${th('% Margen', 'margen')}
      ${th('Kg', 'kilos')}${th('Facturas', 'recuento_facturas')}</tr></thead>`;
    const arr = itemsOrdenados();
    const rows = arr.map(r => `<tr style="border-bottom:1px solid #f1f5f9">
      <td style="padding:6px">${esc(r.clave)}</td>
      <td style="padding:6px">${esc(r.nombre || '—')}</td>
      <td style="padding:6px;text-align:right">${fmtMon(r.ventas)}</td>
      <td style="padding:6px;text-align:right">${fmtMon(r.costo_integrado)}</td>
      <td style="padding:6px;text-align:right;font-weight:600">${fmtMon(r.utilidad_bruta)}</td>
      <td style="padding:6px;text-align:right">${margenChip(r.margen)}</td>
      <td style="padding:6px;text-align:right">${fmtNum(Math.round(r.kilos))}</td>
      <td style="padding:6px;text-align:right">${fmtNum(r.recuento_facturas)}</td></tr>`).join('');
    const t = data.totales;
    const total = `<tr style="border-top:2px solid #cbd5e1;font-weight:700;background:#f8fafc">
      <td style="padding:6px" colspan="2">TOTAL (${arr.length})</td>
      <td style="padding:6px;text-align:right">${fmtMon(t.ventas)}</td>
      <td style="padding:6px;text-align:right">${fmtMon(t.costo_integrado)}</td>
      <td style="padding:6px;text-align:right">${fmtMon(t.utilidad_bruta)}</td>
      <td style="padding:6px;text-align:right">${margenChip(t.margen)}</td>
      <td style="padding:6px;text-align:right">${fmtNum(Math.round(t.kilos))}</td>
      <td style="padding:6px"></td></tr>`;
    $('tabla').innerHTML = head + '<tbody>' + rows + total + '</tbody>';
    $('tabla').querySelectorAll('th[data-key]').forEach(thEl => {
      thEl.addEventListener('click', () => {
        const k = thEl.getAttribute('data-key');
        if (sortKey === k) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
        else { sortKey = k; sortDir = (k === 'clave' || k === 'nombre') ? 'asc' : 'desc'; }
        pintarTabla();
      });
    });
    const per = data.mes ? MESES[data.mes] : `Acumulado ${data.anio}`;
    $('tablaTitulo').textContent = `Detalle por ${etq.toLowerCase()}`;
    $('tablaSub').textContent = `${per} · ${arr.length} de ${data.items.length}`;
  }

  async function cargar() {
    const anio = parseInt($('anio').value, 10);
    if (!anio) return KoguApi.toast('Indica el año.', 'error');
    const mes = $('mes').value;
    $('refreshBtn').disabled = true;
    try {
      const res = await KoguApi.apiFetch(`${BASE}/rentabilidad/${dim}/${anio}?mes=${encodeURIComponent(mes)}`);
      data = KoguApi.unwrapData(res);
      if (!data || !data.items || !data.items.length) {
        $('kpis').style.display = $('highlights').style.display = $('tablaCard').style.display = 'none';
        showMsg('Sin datos para el periodo. Calcula el mes en "Costo de ventas / Utilidad".', 'warn');
        return;
      }
      $('msg').style.display = 'none';
      $('tablaCard').style.display = 'block';
      pintarKpis(); pintarHighlights(); pintarTabla();
    } catch (e) {
      showMsg('❌ ' + e.message, 'error');
      KoguApi.toast(e.message, 'error');
    } finally { $('refreshBtn').disabled = false; }
  }

  async function exportar() {
    const anio = parseInt($('anio').value, 10);
    if (!anio) return KoguApi.toast('Indica el año.', 'error');
    const mes = $('mes').value;
    try {
      KoguApi.toast('Generando Excel…', 'info');
      const res = await KoguApi.authFetchRaw(`${BASE}/rentabilidad/${dim}/${anio}/export?mes=${encodeURIComponent(mes)}`);
      if (!res.ok) throw new Error('No se pudo generar el Excel.');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `cto_rentabilidad_${dim}_${anio}${mes !== 'acum' ? '_' + String(mes).padStart(2, '0') : ''}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e) { KoguApi.toast(e.message, 'error'); }
  }

  function cambiarDim(nuevo) { if (dim === nuevo) return; dim = nuevo; sortKey = 'ventas'; sortDir = 'desc'; syncTabs(); cargar(); }

  $('tabProducto').addEventListener('click', () => cambiarDim('producto'));
  $('tabCliente').addEventListener('click', () => cambiarDim('cliente'));
  $('refreshBtn').addEventListener('click', cargar);
  $('anio').addEventListener('change', cargar);
  $('mes').addEventListener('change', cargar);
  $('q').addEventListener('input', () => { if (data) pintarTabla(); });
  $('exportBtn').addEventListener('click', exportar);
  KoguShell.subscribeEmpresaActivaChange(() => cargar());

  syncTabs();
  cargar();
});

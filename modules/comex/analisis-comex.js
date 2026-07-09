// ============================================================
// analisis-comex.js — Comercio Exterior: Análisis y exportación.
// Cortes por proveedor / producto / escala sobre la reconciliación del periodo,
// enriquecidos con COSTEOC. Exporta a Excel (3 hojas).
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/comex/analisis-comex.html';
  const PERM = 'screen.comex.analisis';
  const BASE = '/protected/comex';

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Análisis y exportación · Comercio Exterior',
    description: 'Cortes por proveedor, producto y escala del periodo reconciliado. Exporta a Excel.',
    requiredPermission: PERM,
  });
  if (!b) return;

  const $ = (id) => document.getElementById(id);
  const c = $('pageContent');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const n0 = (v) => (Number(v) || 0).toLocaleString('es-MX', { maximumFractionDigits: 0 });
  const kg = (v) => (Number(v) || 0).toLocaleString('es-MX', { maximumFractionDigits: 0 });
  const usd4 = (v) => (v == null ? '—' : Number(v).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 4 }));
  const pct = (v) => (v == null ? '—' : (Number(v) * 100).toFixed(1) + '%');

  let data = null, corte = 'proveedores', periodo = null;

  c.innerHTML = `
<div class="card">
  <div class="row">
    <div><div class="eyebrow">Comercio Exterior · Análisis</div><h2 style="margin:0">Análisis y exportación de importaciones</h2>
      <div class="muted" style="font-size:12px">Cortes del <strong>periodo reconciliado</strong> por proveedor, producto y escala de kg.</div></div>
    <div style="display:flex;gap:10px;align-items:flex-end">
      <div><label class="muted" style="font-size:12px;display:block">Periodo</label>
        <select id="periodo" class="input" style="min-width:200px"></select></div>
      <button class="btn primary" id="expBtn" style="background:#0891b2">⬇ Exportar Excel</button>
    </div>
  </div>
  <div style="display:flex;gap:6px;margin-top:14px;flex-wrap:wrap">
    <button class="btn" data-c="proveedores">Por proveedor</button>
    <button class="btn" data-c="productos">Por producto</button>
    <button class="btn" data-c="escalas">Por escala</button>
  </div>
  <div class="muted" id="cInfo" style="font-size:12px;margin-top:8px"></div>
  <div style="overflow-x:auto;margin-top:8px"><table class="table" id="tAn" style="width:100%;font-size:12.5px;font-variant-numeric:tabular-nums"></table></div>
</div>`;

  const G = 'background:#f8fafc;color:#334155';
  const M = 'background:#faf5ff;color:#7e22ce';
  function gmpPill(v) {
    if (v == null) return '—';
    const bg = v < 0.30 ? '#dcfce7' : v <= 0.60 ? '#fef9c3' : '#fee2e2';
    const co = v < 0.30 ? '#166534' : v <= 0.60 ? '#854d0e' : '#991b1b';
    return `<span style="font-weight:700;background:${bg};color:${co};padding:1px 8px;border-radius:999px">${pct(v)}</span>`;
  }
  function utiPill(v) {
    if (v == null) return '—';
    const bg = v < 0.08 ? '#dcfce7' : v <= 0.15 ? '#fef9c3' : '#fee2e2';
    const co = v < 0.08 ? '#166534' : v <= 0.15 ? '#854d0e' : '#991b1b';
    return `<span style="font-weight:700;background:${bg};color:${co};padding:1px 8px;border-radius:999px">${pct(v)}</span>`;
  }

  const CORTES = {
    proveedores: { lab: 'Proveedor', nombre: false },
    productos: { lab: 'Producto', nombre: true },
    escalas: { lab: 'Escala (kg)', nombre: false },
  };

  function render() {
    document.querySelectorAll('button[data-c]').forEach(bn => {
      const on = bn.dataset.c === corte;
      bn.className = 'btn ' + (on ? 'primary' : 'ghost');
      bn.style.background = on ? '#0891b2' : '';
    });
    const rows = (data && data[corte]) || [];
    const meta = CORTES[corte];
    $('cInfo').textContent = `${n0(rows.length)} ${meta.lab.toLowerCase()}(s) · costo USD = DDP total · gastos/kg y mercancía/kg ponderados por kg`;
    const head = `<thead><tr style="border-bottom:2px solid #e2e8f0;text-align:right">
      <th style="text-align:left;padding:6px">${esc(meta.lab)}</th>${meta.nombre ? '<th style="text-align:left;padding:6px">Nombre</th>' : ''}
      <th>Ops</th><th>Kg</th><th>Costo USD</th>
      <th style="${M};padding:6px">Mercancía/kg</th><th>Gastos/kg</th><th>DDP/kg</th>
      <th style="${M};padding:6px">Gastos/MP</th><th>UtiPor</th></tr></thead>`;
    const ncol = meta.nombre ? 10 : 9;
    if (!rows.length) { $('tAn').innerHTML = head + `<tbody><tr><td colspan="${ncol}" style="text-align:center;padding:16px;color:var(--muted)">Sin datos. Reconcilia el periodo primero.</td></tr></tbody>`; return; }
    $('tAn').innerHTML = head + '<tbody>' + rows.map(r => {
      const kgv = Number(r.kg) || 0;
      const mpKg = kgv > 0 ? Number(r.mp_usd) / kgv : null;
      const gKg = kgv > 0 ? Number(r.gastos_usd) / kgv : null;
      const ddpKg = kgv > 0 ? Number(r.costo_usd) / kgv : null;
      return `<tr style="border-bottom:1px solid #f1f5f9;text-align:right">
        <td style="text-align:left;padding:6px;font-weight:700">${esc(r.grupo)}</td>
        ${meta.nombre ? `<td style="text-align:left;padding:6px">${esc(r.nombre || '')}</td>` : ''}
        <td style="padding:6px">${n0(r.ops)}</td>
        <td style="padding:6px">${kg(r.kg)}</td>
        <td style="padding:6px;font-weight:700">$${n0(r.costo_usd)}</td>
        <td style="padding:6px;${M}">$${usd4(mpKg)}</td>
        <td style="padding:6px">$${usd4(gKg)}</td>
        <td style="padding:6px">$${usd4(ddpKg)}</td>
        <td style="padding:6px">${gmpPill(r.gmp == null ? null : Number(r.gmp))}</td>
        <td style="padding:6px">${utiPill(r.uti == null ? null : Number(r.uti))}</td></tr>`;
    }).join('') + '</tbody>';
  }

  async function cargarPeriodos() {
    try {
      const rows = KoguApi.unwrapData(await KoguApi.apiFetch(BASE + '/reconciliacion/periodos')) || [];
      const sel = $('periodo');
      if (!rows.length) { sel.innerHTML = '<option value="">— sin periodos reconciliados —</option>'; $('expBtn').disabled = true; return; }
      const acum = `<option value="ACUM">📊 Acumulado (todos los periodos)</option>`;
      sel.innerHTML = acum + rows.map(r => `<option value="${esc(r.periodo)}">${esc(r.periodo)} · ${n0(r.n_pedimentos)} pedimentos</option>`).join('');
      sel.value = 'ACUM';
      periodo = sel.value; cargar();
    } catch (e) { KoguApi.toast(e.message, 'error'); }
  }

  async function cargar() {
    if (!periodo) return;
    try {
      data = KoguApi.unwrapData(await KoguApi.apiFetch(BASE + '/analisis?periodo=' + encodeURIComponent(periodo))) || {};
      render();
    } catch (e) { KoguApi.toast(e.message, 'error'); }
  }

  async function exportar() {
    if (!periodo) return KoguApi.toast('Elige un periodo.', 'error');
    $('expBtn').disabled = true; const t = $('expBtn').textContent; $('expBtn').textContent = '⏳ Generando…';
    try {
      const res = await KoguApi.authFetchRaw(BASE + '/analisis/export?periodo=' + encodeURIComponent(periodo));
      if (!res.ok) throw new Error('No se pudo generar el Excel');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `Analisis_Comex_${periodo === 'ACUM' ? 'acumulado' : periodo}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } catch (e) { KoguApi.toast(e.message, 'error'); }
    finally { $('expBtn').disabled = false; $('expBtn').textContent = t; }
  }

  $('periodo').addEventListener('change', () => { periodo = $('periodo').value; cargar(); });
  document.querySelectorAll('button[data-c]').forEach(bn => bn.addEventListener('click', () => { corte = bn.dataset.c; render(); }));
  $('expBtn').addEventListener('click', exportar);
  KoguShell.subscribeEmpresaActivaChange(() => { data = null; $('periodo').innerHTML = ''; cargarPeriodos(); });
  cargarPeriodos();
});

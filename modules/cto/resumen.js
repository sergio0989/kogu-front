// ============================================================
// resumen.js — Costo (cto_): Costo de ventas / Utilidad de operación.
// Selecciona periodo, ejecuta el motor de cálculo (Etapas 1 y 2) y muestra
// los KPIs del resultado (réplica del tablero ABC del usuario).
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/cto/resumen.html';
  const PERM = 'screen.costo';
  const BASE = '/protected/cto';

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Costo de ventas / Utilidad',
    description: 'Calcula el costo integrado y la utilidad (bruta y de operación) del periodo y muestra los KPIs.',
    requiredPermission: PERM,
  });
  if (!b) return;

  const $ = (id) => document.getElementById(id);
  const now = new Date();

  const c = document.getElementById('pageContent');
  c.innerHTML = `
<div class="card">
  <div class="row">
    <div><div class="eyebrow">Costo</div><h2>Costo de ventas / Utilidad</h2></div>
    <div style="display:flex;gap:8px;align-items:flex-end">
      <div><label class="muted" style="font-size:12px">Año</label><input type="number" id="anio" class="input" style="width:100px" value="${now.getFullYear()}"/></div>
      <div><label class="muted" style="font-size:12px">Mes</label><input type="number" id="mes" class="input" style="width:80px" min="1" max="12" value="${now.getMonth() + 1}"/></div>
      <button class="btn ghost" id="verBtn">Ver resultado</button>
      <button class="btn primary" id="calcBtn" style="background:#16a34a">▶ Calcular</button>
    </div>
  </div>
  <div id="msg" style="display:none;margin-top:14px;padding:12px;border-radius:6px;font-size:13px"></div>
</div>

<div id="kpis" class="grid-3" style="margin-top:16px;gap:12px;display:none"></div>

<div class="card" id="factoresCard" style="margin-top:16px;display:none">
  <div class="row"><h3 style="margin:0">Indicadores ABC del periodo</h3>
    <span class="muted" style="font-size:12px">Importes capturados · Kilos calculados por KOGU · Factores</span></div>
  <div id="factores" style="margin-top:12px"></div>
</div>`;

  const fmtMon = (v) => '$' + (Number(v) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtPct = (v) => ((Number(v) || 0) * 100).toFixed(2) + ' %';
  const fmtNum = (v) => (Number(v) || 0).toLocaleString('es-MX');

  function kpi(label, val, sub) {
    return `<div class="card" style="padding:16px">
      <div class="muted" style="font-size:12px">${label}</div>
      <div style="font-size:22px;font-weight:700;margin-top:4px">${val}</div>
      ${sub ? `<div class="muted" style="font-size:12px;margin-top:2px">${sub}</div>` : ''}
    </div>`;
  }

  const fFac = (v) => v == null ? '—' : Number(v).toFixed(6);
  const fKg = (v) => fmtNum(Math.round(Number(v) || 0)) + ' kg';

  function pintarResultado(r) {
    if (!r) { $('kpis').style.display = 'none'; return; }
    $('kpis').style.display = 'grid';
    $('kpis').innerHTML = [
      kpi('Total ventas', fmtMon(r.total_ventas)),
      kpi('Σ Costo MP (ctototmn)', fmtMon(r.costo_mp), 'costo del sistema'),
      kpi('Σ Costo integrado (costo_int_imp)', fmtMon(r.costo_integrado), 'MP + factores'),
      kpi('Utilidad bruta', fmtMon(r.utilidad_bruta), fmtPct(r.utilidad_bruta_pct)),
      kpi('Gastos de venta', fmtMon(r.gastos_venta)),
      kpi('Utilidad de operación', fmtMon(r.utilidad_operacion), fmtPct(r.utilidad_operacion_pct)),
      kpi('Kilos / Facturas', fmtNum(r.kilos) + ' kg', fmtNum(r.recuento_facturas) + ' facturas'),
    ].join('');
  }

  function pintarFactores(f) {
    if (!f) { $('factoresCard').style.display = 'none'; return; }
    $('factoresCard').style.display = 'block';
    const aplic = `<span class="chip" style="background:#dcfce7;color:#166534;font-size:10px;font-weight:700;padding:1px 6px;margin-left:4px">aplicado</span>`;
    const info = `<span class="chip" style="background:#e5e7eb;color:#6b7280;font-size:10px;font-weight:700;padding:1px 6px;margin-left:4px">informativo</span>`;
    const row = (l, v, tag = '') => `<tr style="border-bottom:1px solid #f1f5f9"><td style="padding:5px 8px">${l}${tag}</td><td style="padding:5px 8px;text-align:right;font-variant-numeric:tabular-nums">${v}</td></tr>`;
    const bloque = (titulo, filas) => `<div>
      <div class="muted" style="font-size:12px;font-weight:700;margin-bottom:4px">${titulo}</div>
      <table style="width:100%;font-size:13px;border-collapse:collapse"><tbody>${filas}</tbody></table></div>`;
    $('factores').innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:16px">
      ${bloque('Importes (capturados)',
        row('Importe A', fmtMon(f.importe_a)) +
        row('Importe B', fmtMon(f.importe_b)) +
        row('Importe B fijo', fmtMon(f.importe_b_fijo)) +
        row('Importe B prorrateo', fmtMon(f.importe_b_prorrateo)) +
        row('Importe C', fmtMon(f.importe_c)))}
      ${bloque('Kilos (calculados por KOGU)',
        row('Kilos A <span class="muted" style="font-size:10px">neto de notas</span>', fKg(f.kilos_a)) +
        row('Kilos B <span class="muted" style="font-size:10px">producidos</span>', fKg(f.kilos_b)) +
        row('Kilos C <span class="muted" style="font-size:10px">exportación</span>', fKg(f.kilos_c)) +
        row('Kilos Prod B <span class="muted" style="font-size:10px">capturado</span>', fKg(f.kilos_prod_b)))}
      ${bloque('Factores',
        row('Factor A', fFac(f.factor_a), aplic) +
        row('Factor B fijo', fFac(f.factor_b_fijo), aplic) +
        row('Factor B', fFac(f.factor_b), info) +
        row('Factor C', fFac(f.factor_c), info) +
        row('Factor B almacén', fFac(f.factor_b_alm), info))}
    </div>`;
  }

  async function cargarFactores(anio, mes) {
    try {
      const res = await KoguApi.apiFetch(`${BASE}/factores/${anio}/${mes}`);
      pintarFactores(KoguApi.unwrapData(res));
    } catch (_e) { pintarFactores(null); }
  }

  function showMsg(html, tipo) {
    const m = $('msg');
    const bg = tipo === 'error' ? '#fee2e2' : tipo === 'warn' ? '#fef9c3' : '#dcfce7';
    const co = tipo === 'error' ? '#991b1b' : tipo === 'warn' ? '#854d0e' : '#166534';
    m.style.cssText = `display:block;margin-top:14px;padding:12px;border-radius:6px;font-size:13px;background:${bg};color:${co}`;
    m.innerHTML = html;
  }

  async function calcular() {
    const anio = parseInt($('anio').value, 10), mes = parseInt($('mes').value, 10);
    if (!anio || !mes) return KoguApi.toast('Indica año y mes.', 'error');
    $('calcBtn').disabled = true;
    showMsg('⏳ Calculando periodo ' + anio + '-' + String(mes).padStart(2, '0') + '…', 'warn');
    try {
      const res = await KoguApi.apiFetch(`${BASE}/calculo/${anio}/${mes}`, { method: 'POST', body: JSON.stringify({}) });
      const d = KoguApi.unwrapData(res) || {};
      showMsg(`✅ Cálculo completado: ${fmtNum(d.renglones)} renglones · ${fmtNum(d.renglones_con_gasto_venta)} con gasto de venta.`, 'ok');
      pintarResultado(d.resultado);
      await cargarFactores(anio, mes);
      KoguApi.toast('Cálculo completado', 'success');
    } catch (e) {
      showMsg('❌ ' + e.message, 'error');
      KoguApi.toast(e.message, 'error');
    } finally { $('calcBtn').disabled = false; }
  }

  async function verResultado() {
    const anio = parseInt($('anio').value, 10), mes = parseInt($('mes').value, 10);
    if (!anio || !mes) return KoguApi.toast('Indica año y mes.', 'error');
    try {
      const res = await KoguApi.apiFetch(`${BASE}/resultado/${anio}/${mes}`);
      pintarResultado(KoguApi.unwrapData(res));
      await cargarFactores(anio, mes);
      $('msg').style.display = 'none';
    } catch (e) {
      pintarResultado(null);
      pintarFactores(null);
      showMsg('Sin resultado calculado para ese periodo. Pulsa "Calcular".', 'warn');
    }
  }

  $('calcBtn').addEventListener('click', calcular);
  $('verBtn').addEventListener('click', verResultado);
  KoguShell.subscribeEmpresaActivaChange(() => verResultado());

  verResultado();
});

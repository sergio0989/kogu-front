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
  <h3 style="margin:0 0 8px 0">Factores del mes aplicados</h3>
  <div id="factores" class="muted" style="font-size:13px"></div>
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

  function pintarResultado(r, factores) {
    if (!r) { $('kpis').style.display = 'none'; $('factoresCard').style.display = 'none'; return; }
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
    if (factores) {
      $('factoresCard').style.display = 'block';
      $('factores').innerHTML = `Factor A: <strong>${Number(factores.factor_a).toFixed(6)}</strong> ·
        Factor B fijo: <strong>${Number(factores.factor_b_fijo).toFixed(6)}</strong> ·
        Factor C (ref): <strong>${factores.factor_c != null ? Number(factores.factor_c).toFixed(6) : '—'}</strong>`;
    }
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
      pintarResultado(d.resultado, d.factores);
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
      pintarResultado(KoguApi.unwrapData(res), null);
      $('msg').style.display = 'none';
    } catch (e) {
      pintarResultado(null);
      showMsg('Sin resultado calculado para ese periodo. Pulsa "Calcular".', 'warn');
    }
  }

  $('calcBtn').addEventListener('click', calcular);
  $('verBtn').addEventListener('click', verResultado);
  KoguShell.subscribeEmpresaActivaChange(() => verResultado());

  verResultado();
});

// ============================================================
// costo-export-cliente.js — Costo: Costo de exportación por cliente.
// Pivote cliente × mes (Op · P Venta USD/kg · Costo Expo USD/kg) + totales.
// Fuente: cto_ventas_costo (es_nacional=false, USD). costo = costo_expo_kg/tc.
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/cto/costo-export-cliente.html';
  const PERM = 'screen.cto.export_cliente';
  const BASE = '/protected/cto';

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Costo de exportación por cliente · Costo',
    description: 'Cuánto cuesta el kg exportado por cliente: operaciones, precio de venta y costo de exportación en USD.',
    requiredPermission: PERM,
  });
  if (!b) return;

  const $ = (id) => document.getElementById(id);
  const c = $('pageContent');
  const MES = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const n0 = (v) => (Number(v) || 0).toLocaleString('es-MX', { maximumFractionDigits: 0 });
  const u2 = (v) => (v == null ? '—' : Number(v).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

  let D = null, fCosto = 'todos'; // todos | con | sin

  c.innerHTML = `
<div class="card">
  <div class="row">
    <div><div class="eyebrow">Costo · Exportación</div><h2 style="margin:0">Costo de exportación por cliente</h2>
      <div class="muted" style="font-size:12px">Por cliente y mes: <strong>Op</strong> (operaciones), <strong>P Venta</strong> y <strong>Costo</strong> por kg exportado (USD). El costo = gasto de exportación por kg.</div></div>
    <div style="display:flex;gap:10px;align-items:flex-end">
      <div><label class="muted" style="font-size:12px;display:block">Año</label><select id="anio" class="input" style="min-width:110px"></select></div>
      <button class="btn" id="expBtn" style="background:#059669">⬇ Excel</button>
    </div>
  </div>
  <div id="kpis" style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap"></div>
  <div id="chips" style="display:flex;gap:6px;margin-top:12px;flex-wrap:wrap"></div>
  <div class="muted" style="font-size:11px;margin-top:10px">Solo exportación en USD (cve_mon=USD). P Venta = subtotal ÷ TC ÷ kg · Costo = costo de exportación/kg ÷ TC, ponderado <strong>solo sobre kg con integración finalizada</strong> · <strong>"—" = aún sin integrar</strong> · Op = operaciones (folios).</div>
  <div style="overflow-x:auto;margin-top:10px"><table class="table" id="tab" style="font-size:12px;font-variant-numeric:tabular-nums;white-space:nowrap"></table></div>
</div>`;

  function kpi(lab, val, sub, col) {
    return `<div style="flex:1;min-width:150px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px 14px">
      <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.03em">${lab}</div>
      <div style="font-size:22px;font-weight:800;color:${col || '#0f172a'};margin-top:1px">${val}</div>
      <div style="font-size:11px;color:#64748b">${sub || ''}</div></div>`;
  }

  // Encabezado de dos filas: mes (colspan 3) + sub-columnas Op / P Venta / Costo.
  function pintaTabla(d) {
    const meses = d.meses || [];
    const cols = [...meses, 'T']; // T = total
    const gTop = (lab, span, bg) => `<th colspan="${span}" style="text-align:center;padding:6px 8px;border-left:2px solid #e2e8f0;background:${bg || '#f8fafc'};font-weight:800">${lab}</th>`;
    const sub = (bg) => `<th style="text-align:right;padding:4px 8px;border-left:2px solid #e2e8f0;background:${bg || ''};font-size:11px;color:#64748b">Op</th><th style="text-align:right;padding:4px 8px;font-size:11px;color:#64748b">P Venta</th><th style="text-align:right;padding:4px 8px;font-size:11px;color:#0e7490">Costo</th>`;
    let top = `<tr><th style="text-align:left;padding:6px 8px;background:#f8fafc"></th>`;
    meses.forEach(m => { top += gTop(MES[m] || m, 3); });
    top += gTop('Total', 3, '#ecfeff') + '</tr>';
    let sub2 = `<tr style="border-bottom:2px solid #e2e8f0"><th style="text-align:left;padding:4px 8px;background:#f8fafc">Cliente</th>`;
    meses.forEach(() => { sub2 += sub(); });
    sub2 += sub('#ecfeff') + '</tr>';
    const head = `<thead>${top}${sub2}</thead>`;

    const cell = (o, bg) => {
      if (!o) return `<td style="border-left:2px solid #f1f5f9;background:${bg || ''};color:#cbd5e1;padding:4px 8px;text-align:right">·</td><td style="padding:4px 8px;text-align:right;color:#cbd5e1">·</td><td style="padding:4px 8px;text-align:right;color:#cbd5e1">·</td>`;
      return `<td style="border-left:2px solid #f1f5f9;background:${bg || ''};padding:4px 8px;text-align:right">${n0(o.op)}</td>
        <td style="padding:4px 8px;text-align:right;background:${bg || ''}">${u2(o.pventa)}</td>
        <td style="padding:4px 8px;text-align:right;font-weight:700;color:#0e7490;background:${bg || ''}">${u2(o.costo)}</td>`;
    };

    const rows = (d.clientes || []).map(cl => {
      let tds = `<td style="text-align:left;padding:5px 8px;font-weight:700;position:sticky;left:0;background:#fff">${esc(cl.nombre)}</td>`;
      meses.forEach(m => { tds += cell(cl.porMes[m]); });
      tds += cell(cl.total, '#f0fdff');
      return `<tr style="border-bottom:1px solid #f1f5f9">${tds}</tr>`;
    }).join('');

    // fila total general
    let totTds = `<td style="text-align:left;padding:6px 8px;font-weight:800;background:#f8fafc;position:sticky;left:0">Total general</td>`;
    meses.forEach(m => { totTds += cell((d.total.porMes || {})[m], '#f8fafc'); });
    totTds += cell(d.total, '#e0f2fe');
    const totRow = `<tr style="border-top:2px solid #e2e8f0;font-weight:800">${totTds}</tr>`;

    if (!(d.clientes || []).length) {
      $('tab').innerHTML = head + `<tbody><tr><td colspan="${1 + cols.length * 3}" style="text-align:center;padding:18px;color:var(--muted)">Sin exportaciones capturadas en el año.</td></tr></tbody>`;
      return;
    }
    $('tab').innerHTML = head + '<tbody>' + rows + totRow + '</tbody>';
  }

  function clientesFiltrados() {
    const cs = D.clientes || [];
    if (fCosto === 'con') return cs.filter(c => c.total.costo != null);
    if (fCosto === 'sin') return cs.filter(c => c.total.costo == null);
    return cs;
  }
  function pintaChips() {
    const cs = D.clientes || [];
    const con = cs.filter(c => c.total.costo != null).length;
    const defs = [['todos', 'Todos', cs.length], ['con', 'Con costo integrado', con], ['sin', 'Sin costo (pendiente)', cs.length - con]];
    $('chips').innerHTML = defs.map(([k, lab, ct]) => {
      const on = fCosto === k;
      return `<button class="btn ${on ? 'primary' : 'ghost'}" data-fc="${k}" style="${on ? 'background:#059669' : ''}">${lab} · ${ct}</button>`;
    }).join('');
    $('chips').querySelectorAll('button[data-fc]').forEach(bn => bn.addEventListener('click', () => { fCosto = bn.dataset.fc; render(); }));
  }
  function render() {
    pintaChips();
    pintaTabla({ meses: D.meses || [], clientes: clientesFiltrados(), total: D.total || {} });
  }

  async function cargar() {
    try {
      const anio = $('anio').value;
      if (!anio && D) return;
      D = KoguApi.unwrapData(await KoguApi.apiFetch(BASE + '/dashboard/' + encodeURIComponent(anio || new Date().getFullYear()) + '/export-costo-cliente')) || {};
      // años: derivar del resumen (o dejar el actual + anteriores)
      const selA = $('anio');
      if (!selA.options.length) {
        const y = new Date().getFullYear();
        const arr = [y, y - 1, y - 2];
        selA.innerHTML = arr.map(a => `<option value="${a}" ${String(a) === String(D.anio) ? 'selected' : ''}>${a}</option>`).join('');
        if (D.anio) selA.value = D.anio;
      }
      const t = D.total || {};
      $('kpis').innerHTML =
        kpi('Clientes', n0((D.clientes || []).length), 'de exportación') +
        kpi('Operaciones', n0(t.op), 'folios') +
        kpi('Kg exportados', n0(t.kg), 'kg') +
        kpi('P Venta prom.', '$' + u2(t.pventa), 'USD/kg') +
        kpi('Costo expo prom.', '$' + u2(t.costo), 'USD/kg', '#0e7490');
      render();
    } catch (e) { KoguApi.toast(e.message, 'error'); }
  }

  // Export Excel simple (CSV con BOM, abre en Excel). Reproduce el pivote plano.
  function exportarCsv() {
    if (!D || !(D.clientes || []).length) return KoguApi.toast('Sin datos para exportar.', 'error');
    const meses = D.meses || [];
    const head = ['Cliente'];
    meses.forEach(m => head.push(MES[m] + ' Op', MES[m] + ' P Venta', MES[m] + ' Costo USD'));
    head.push('Total Op', 'Total P Venta', 'Total Costo USD');
    const line = (nombre, porMes, total) => {
      const r = [nombre];
      meses.forEach(m => { const o = porMes[m] || {}; r.push(o.op ?? '', o.pventa != null ? o.pventa.toFixed(4) : '', o.costo != null ? o.costo.toFixed(4) : ''); });
      r.push(total.op ?? '', total.pventa != null ? total.pventa.toFixed(4) : '', total.costo != null ? total.costo.toFixed(4) : '');
      return r.map(x => `"${String(x).replace(/"/g, '""')}"`).join(',');
    };
    const lines = [head.map(h => `"${h}"`).join(',')];
    (D.clientes || []).forEach(cl => lines.push(line(cl.nombre, cl.porMes, cl.total)));
    lines.push(line('Total general', D.total.porMes || {}, D.total));
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = `Costo_Export_Cliente_${D.anio}.csv`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  $('anio').addEventListener('change', cargar);
  $('expBtn').addEventListener('click', exportarCsv);
  KoguShell.subscribeEmpresaActivaChange(() => { $('anio').innerHTML = ''; D = null; cargar(); });
  cargar();
});

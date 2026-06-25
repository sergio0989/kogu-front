// ============================================================
// reporte-ejecutivo.js — Costo (cto_): Paquete de cierre para Dirección.
// Consolida 3 secciones del periodo en una página imprimible:
//   1) Reporte ejecutivo (KPIs, puente de utilidad, ABC, utilidad por agente)
//   2) Análisis de rentabilidad (Pareto, top clientes/productos, alertas)
//   3) Detalle Cliente × Producto (drill-down)
// Reusa endpoints existentes:
//   GET /resultado/:a/:m · /factores/:a/:m · /dashboard/:a/:m/agentes ·
//   /rentabilidad/cliente|producto/:a?mes= · /rentabilidad-cliente-producto/:a?mes=
// "Imprimir / Guardar PDF" usa window.print() con CSS @media print.
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/cto/reporte-ejecutivo.html';
  const PERM = 'screen.costo';
  const BASE = '/protected/cto';

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Reporte ejecutivo',
    description: 'Paquete de cierre para Dirección: ejecutivo + rentabilidad + detalle cliente/producto, listo para imprimir o guardar como PDF.',
    requiredPermission: PERM,
  });
  if (!b) return;

  const $ = (id) => document.getElementById(id);
  const now = new Date();
  const emp = (KoguApi.getEmpresaActiva && KoguApi.getEmpresaActiva()) || {};
  const MESES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

  const mon = (v) => '$' + (Number(v) || 0).toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const mon2 = (v) => '$' + (Number(v) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pct = (v) => ((Number(v) || 0) * 100).toFixed(2) + '%';
  const pct1 = (v) => ((Number(v) || 0) * 100).toFixed(1) + '%';
  const num = (v) => (Number(v) || 0).toLocaleString('es-MX', { maximumFractionDigits: 0 });
  const fac = (v) => v == null ? '—' : Number(v).toFixed(6);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));

  const c = document.getElementById('pageContent');
  c.innerHTML = `
<style>
  #reporte { background:#fff; color:#0f172a; }
  #reporte .band { background:#0f172a; color:#fff; padding:12px 16px; border-radius:8px; margin:18px 0 12px; display:flex; justify-content:space-between; align-items:center; }
  #reporte .band h2 { margin:0; font-size:16px; }
  #reporte .band .n { font-size:24px; font-weight:800; opacity:.35; }
  #reporte .kgrid { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; }
  #reporte .kc { background:#f1f5f9; border-radius:8px; padding:12px 14px; }
  #reporte .kc.dark { background:#0f172a; color:#fff; }
  #reporte .kc .l { font-size:11px; color:#64748b; }
  #reporte .kc.dark .l { color:#cbd5e1; }
  #reporte .kc .v { font-size:19px; font-weight:800; margin-top:3px; }
  #reporte .kc .s { font-size:11px; font-weight:700; color:#059669; margin-top:2px; }
  #reporte table.rt { width:100%; border-collapse:collapse; font-size:12px; }
  #reporte table.rt th { background:#0f172a; color:#fff; padding:6px 8px; text-align:right; font-size:10.5px; }
  #reporte table.rt th:first-child { text-align:left; }
  #reporte table.rt td { padding:5px 8px; text-align:right; border-bottom:1px solid #eef2f6; }
  #reporte table.rt td:first-child { text-align:left; }
  #reporte table.rt tr.tot td { background:#ecfdf5; font-weight:800; border-top:2px solid #059669; }
  #reporte tr.clir td { background:#e8edf4; font-weight:700; color:#0f172a; }
  #reporte .neg { color:#dc2626; }
  #reporte .pos { color:#059669; font-weight:700; }
  #reporte .mini { display:grid; grid-template-columns:repeat(3,1fr); gap:14px; }
  #reporte .mini h4 { margin:0 0 4px; font-size:11px; color:#64748b; }
  #reporte .chip { font-size:9px;font-weight:700;padding:1px 5px;border-radius:4px;margin-left:4px }
  #reporte .ap { background:#dcfce7;color:#166534 } #reporte .inf { background:#e5e7eb;color:#6b7280 }
  @media print {
    @page { size: letter; margin: 12mm; }
    html, body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    body * { visibility: hidden !important; }
    #reporte, #reporte * { visibility: visible !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    #reporte { position:absolute; left:0; top:0; width:100%; }
    .no-print { display:none !important; }
    #reporte .pb { page-break-before: always; }
    #reporte tr, #reporte .kc, #reporte .band, #reporte .mini > div { page-break-inside: avoid; }
  }
</style>
<div class="card no-print">
  <div class="row">
    <div><div class="eyebrow">Costo · Dirección</div><h2>Reporte ejecutivo (paquete de cierre)</h2></div>
    <div style="display:flex;gap:8px;align-items:flex-end">
      <div><label class="muted" style="font-size:12px">Año</label><input type="number" id="anio" class="input" style="width:100px" value="${now.getFullYear()}"/></div>
      <div><label class="muted" style="font-size:12px">Mes</label><input type="number" id="mes" class="input" style="width:80px" min="1" max="12" value="${now.getMonth() + 1}"/></div>
      <button class="btn primary" id="genBtn">Generar</button>
      <button class="btn ghost" id="printBtn" title="Imprime o guarda como PDF desde el navegador">🖨 Imprimir / Guardar PDF</button>
    </div>
  </div>
  <div id="msg" class="muted" style="margin-top:10px;font-size:13px">Selecciona el periodo y pulsa <b>Generar</b>. Luego <b>Imprimir / Guardar PDF</b>.</div>
</div>
<div id="reporte"></div>`;

  // ─── fetchers ───
  const get = async (path) => KoguApi.unwrapData(await KoguApi.apiFetch(`${BASE}${path}`));

  // ─── render helpers ───
  function band(n, title) { return `<div class="band"><h2>${title}</h2><span class="n">${n}</span></div>`; }
  function kc(l, v, s, dark) { return `<div class="kc${dark ? ' dark' : ''}"><div class="l">${l}</div><div class="v">${v}</div>${s ? `<div class="s">${s}</div>` : ''}</div>`; }

  function secEjecutivo(r, f, ag) {
    const T = r.total_ventas || (ag && ag.totales && ag.totales.total_ventas) || 0;
    let h = `<div class="sec">${band('1', 'Reporte ejecutivo de Costo y Utilidad')}`;
    h += `<div class="kgrid">
      ${kc('Total ventas', mon2(r.total_ventas))}
      ${kc('Costo integrado (MP + factores)', mon2(r.costo_integrado))}
      ${kc('Utilidad bruta', mon2(r.utilidad_bruta), pct(r.utilidad_bruta_pct))}
      ${kc('Gastos de venta', mon2(r.gastos_venta))}
      ${kc('Utilidad de operación', mon2(r.utilidad_operacion), pct(r.utilidad_operacion_pct), true)}
      ${kc('Kilos / Facturas', num(r.kilos) + ' kg', num(r.recuento_facturas) + ' facturas')}
    </div>`;
    // puente de utilidad
    const tv = Number(r.total_ventas) || 0;
    const pp = (v) => tv ? pct1(v / tv) : '—';
    h += `<table class="rt" style="margin-top:14px">
      <tr><th>Ventas</th><th>(−) Costo integrado</th><th>= Utilidad bruta</th><th>(−) Gasto de venta</th><th>= Utilidad operación</th></tr>
      <tr><td style="text-align:right">${mon(r.total_ventas)}</td><td>${mon(r.costo_integrado)}</td><td class="pos">${mon(r.utilidad_bruta)}</td><td>${mon(r.gastos_venta)}</td><td class="pos">${mon(r.utilidad_operacion)}</td></tr>
      <tr style="color:#64748b;font-size:10px"><td style="text-align:right">100%</td><td>${pp(r.costo_integrado)}</td><td>${pct1(r.utilidad_bruta_pct)}</td><td>${pp(r.gastos_venta)}</td><td>${pct1(r.utilidad_operacion_pct)}</td></tr>
    </table>`;
    // ABC
    if (f) {
      const rowf = (l, v, tag) => `<tr><td style="text-align:left;padding:4px 8px">${l}${tag || ''}</td><td style="padding:4px 8px">${v}</td></tr>`;
      const tab = (rows) => `<table class="rt"><tbody>${rows}</tbody></table>`;
      h += `<div class="mini" style="margin-top:16px">
        <div><h4>Importes capturados</h4>${tab(
          rowf('Importe A', mon(f.importe_a)) + rowf('Importe B', mon(f.importe_b)) + rowf('Importe B fijo', mon(f.importe_b_fijo)) + rowf('Importe B prorrateo', mon(f.importe_b_prorrateo)) + rowf('Importe C', mon(f.importe_c)))}</div>
        <div><h4>Kilos calculados por KOGU</h4>${tab(
          rowf('Kilos A', num(f.kilos_a)) + rowf('Kilos B', num(f.kilos_b)) + rowf('Kilos C (export+import)', num(f.kilos_c)) + rowf('Kilos Prod B', num(f.kilos_prod_b)))}</div>
        <div><h4>Factores</h4>${tab(
          rowf('Factor A', fac(f.factor_a), '<span class="chip ap">aplicado</span>') + rowf('Factor B fijo', fac(f.factor_b_fijo), '<span class="chip ap">aplicado</span>') + rowf('Factor B', fac(f.factor_b), '<span class="chip inf">inf</span>') + rowf('Factor C', fac(f.factor_c), '<span class="chip inf">inf</span>') + rowf('Factor B almacén', fac(f.factor_b_alm), '<span class="chip inf">inf</span>'))}</div>
      </div>`;
    }
    // por agente
    const ags = (ag && ag.agentes || []).filter(a => Number(a.total_ventas) !== 0);
    if (ags.length) {
      let body = '';
      for (const a of ags) {
        const ci = a.costo_integrado != null ? a.costo_integrado : a.costo_int;
        body += `<tr><td>${esc(a.nombre || a.agente_nombre || a.agente_ref || '—')}</td><td>${mon(a.total_ventas)}</td><td>${mon(ci)}</td><td>${mon(a.gastos_venta)}</td><td>${mon(a.utilidad_operacion)}</td><td class="pos">${pct1(a.utilidad_operacion_pct)}</td></tr>`;
      }
      const t = ag.totales || {};
      body += `<tr class="tot"><td>TOTAL</td><td>${mon(t.total_ventas)}</td><td>${mon(t.costo_integrado)}</td><td>${mon(t.gastos_venta)}</td><td>${mon(t.utilidad_operacion)}</td><td>${pct1(t.utilidad_operacion_pct)}</td></tr>`;
      h += `<h4 style="margin:18px 0 6px;color:#0f172a">Utilidad de operación por agente</h4>
        <table class="rt"><tr><th>Agente</th><th>Ventas</th><th>Costo int.</th><th>Gasto venta</th><th>Util. oper.</th><th>% Oper.</th></tr>${body}</table>`;
    }
    return h + `</div>`;
  }

  function secAnalisis(cli, prod, T) {
    const ci = (cli.items || []).slice();
    const pr = (prod.items || []).slice();
    const c4 = ci.slice(0, 4).reduce((s, x) => s + x.ventas, 0);
    const c10 = ci.slice(0, 10).reduce((s, x) => s + x.ventas, 0);
    let h = `<div class="sec pb">${band('2', 'Análisis de Rentabilidad')}`;
    h += `<p style="font-size:12px;color:#334155;line-height:1.5">
      &bull; Los <b>4 clientes principales</b> concentran <b>${pct1(c4 / T)}</b> de la venta (${mon(c4)}).<br/>
      &bull; Los <b>10 principales</b> = <b>${pct1(c10 / T)}</b>. ${ci.length > 10 ? `El resto (${ci.length - 10} clientes) aporta ${pct1(1 - c10 / T)}.` : ''}<br/>
      ${ci[0] ? `&bull; Cliente ancla: <b>${esc(ci[0].nombre)}</b> con ${mon(ci[0].ventas)} (${pct1(ci[0].ventas / T)}).` : ''}</p>`;
    // top 10 clientes
    let acum = 0, body = '';
    ci.slice(0, 10).forEach((x, i) => { acum += x.ventas; body += `<tr><td>${i + 1}. ${esc(x.nombre)}</td><td>${mon(x.ventas)}</td><td>${mon(x.utilidad_bruta)}</td><td class="pos">${pct1(x.margen)}</td><td>${num(x.kilos)}</td><td>${pct1(acum / T)}</td></tr>`; });
    h += `<h4 style="margin:6px 0">Top 10 clientes por venta</h4>
      <table class="rt"><tr><th>Cliente</th><th>Ventas</th><th>Utilidad</th><th>Margen</th><th>Kg</th><th>% acum.</th></tr>${body}</table>`;
    // top 12 productos
    body = '';
    pr.slice(0, 12).forEach((x, i) => { body += `<tr><td>${i + 1}. ${esc(x.clave)} · ${esc((x.nombre || '').slice(0, 28))}</td><td>${mon(x.ventas)}</td><td>${mon(x.utilidad_bruta)}</td><td class="pos">${pct1(x.margen)}</td><td>${num(x.kilos)}</td></tr>`; });
    h += `<h4 style="margin:16px 0 6px">Top 12 productos por venta</h4>
      <table class="rt"><tr><th>Producto</th><th>Ventas</th><th>Utilidad</th><th>Margen</th><th>Kg</th></tr>${body}</table>`;
    // alertas
    const perd = pr.filter(x => x.utilidad_bruta < 0).sort((a, b) => a.utilidad_bruta - b.utilidad_bruta).slice(0, 6);
    const bajo = pr.filter(x => x.ventas > 0 && x.margen != null && x.margen >= 0 && x.margen <= 0.10).sort((a, b) => a.margen - b.margen).slice(0, 6);
    if (perd.length || bajo.length) {
      body = '';
      perd.forEach(x => body += `<tr><td>${esc(x.clave)} · ${esc((x.nombre || '').slice(0, 22))}</td><td>${mon(x.ventas)}</td><td class="neg">${mon(x.utilidad_bruta)}</td><td class="neg">${pct1(x.margen)}</td><td class="neg">Pérdida</td></tr>`);
      bajo.forEach(x => body += `<tr><td>${esc(x.clave)} · ${esc((x.nombre || '').slice(0, 22))}</td><td>${mon(x.ventas)}</td><td>${mon(x.utilidad_bruta)}</td><td style="color:#d97706">${pct1(x.margen)}</td><td style="color:#d97706">Margen bajo</td></tr>`);
      h += `<h4 style="margin:16px 0 6px;color:#7f1d1d">Alertas de margen</h4>
        <table class="rt"><tr style="background:#7f1d1d"><th>Producto</th><th>Ventas</th><th>Utilidad</th><th>Margen</th><th>Estado</th></tr>${body}</table>`;
    }
    return h + `</div>`;
  }

  function secDrill(cp) {
    let h = `<div class="sec pb">${band('3', 'Detalle Rentabilidad por Cliente y Producto')}`;
    h += `<table class="rt"><tr><th>Cliente / Producto</th><th>Ventas</th><th>Utilidad</th><th>Margen</th><th>Kg</th></tr>`;
    for (const cl of (cp.clientes || [])) {
      h += `<tr class="clir"><td>${esc(cl.nombre || cl.clave)}</td><td>${mon(cl.ventas)}</td><td>${mon(cl.utilidad_bruta)}</td><td>${pct1(cl.margen)}</td><td>${num(cl.kilos)}</td></tr>`;
      for (const p of (cl.productos || [])) {
        const neg = p.utilidad_bruta < 0;
        h += `<tr><td style="padding-left:22px;color:#475569">${esc(p.clave)} · ${esc((p.nombre || '').slice(0, 38))}</td><td>${mon(p.ventas)}</td><td class="${neg ? 'neg' : ''}">${mon(p.utilidad_bruta)}</td><td class="${neg ? 'neg' : ''}">${pct1(p.margen)}</td><td>${num(p.kilos)}</td></tr>`;
      }
    }
    return h + `</table></div>`;
  }

  async function generar() {
    const anio = $('anio').value, mes = $('mes').value;
    if (!anio || !mes) return KoguApi.toast('Indica año y mes.', 'error');
    $('msg').innerHTML = 'Generando reporte…';
    $('reporte').innerHTML = '';
    try {
      const [r, f, ag, cli, prod, cp] = await Promise.all([
        get(`/resultado/${anio}/${mes}`),
        get(`/factores/${anio}/${mes}`).catch(() => null),
        get(`/dashboard/${anio}/${mes}/agentes`).catch(() => null),
        get(`/rentabilidad/cliente/${anio}?mes=${mes}`),
        get(`/rentabilidad/producto/${anio}?mes=${mes}`),
        get(`/rentabilidad-cliente-producto/${anio}?mes=${mes}`),
      ]);
      if (!r || !r.total_ventas) { $('msg').innerHTML = 'No hay resultado calculado para ese periodo. Calcula primero en “Costo de ventas / Utilidad”.'; return; }
      const T = Number(r.total_ventas) || 1;
      const head = `<div style="background:#0f172a;color:#fff;padding:16px;border-radius:8px;display:flex;justify-content:space-between;align-items:center">
        <div><div style="font-size:20px;font-weight:800">Paquete de Cierre — Costo de Ventas y Utilidad</div>
          <div style="font-size:12px;color:#cbd5e1;margin-top:2px">${esc(emp.razon_social || emp.nombre_corto || 'Empresa')} · ${MESES[Number(mes)] || mes} ${anio}</div></div>
        <div style="text-align:right"><div style="font-size:15px;font-weight:800">KOGU</div><div style="font-size:10px;color:#94a3b8">Reporte para Dirección</div></div></div>`;
      $('reporte').innerHTML = head + secEjecutivo(r, f, ag) + secAnalisis(cli, prod, T) + secDrill(cp);
      $('msg').innerHTML = 'Reporte generado. Pulsa <b>Imprimir / Guardar PDF</b> (Ctrl/Cmd+P → Guardar como PDF).';
    } catch (e) {
      $('msg').innerHTML = '';
      KoguApi.toast(e.message || 'Error generando el reporte', 'error');
    }
  }

  $('genBtn').onclick = generar;
  $('printBtn').onclick = () => window.print();
});

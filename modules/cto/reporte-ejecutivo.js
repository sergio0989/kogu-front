// ============================================================
// reporte-ejecutivo.js — Costo (cto_): Informe de cierre para Dirección.
//
// Una sola pantalla, dos salidas:
//   · "Paquete de datos"     → lo que se venía imprimiendo (secciones 1-3).
//   · "Informe a Dirección"  → el mismo documento + portada memo, resumen
//                              ejecutivo, cumplimiento vs PP, conclusiones y
//                              firmas. No es otro reporte: es un superconjunto.
// El interruptor solo pone/quita una clase; el CSS de impresión hace el resto.
//
// TODA la lógica del informe (cortes top-N, concentración, alertas, narrativa)
// vive ahora en el backend: GET /protected/cto/informe/:anio/:mes. Este archivo
// solo maqueta. Si algo del contenido debe cambiar, se cambia allá — no aquí.
//
// "Imprimir / Guardar PDF" usa window.print() con CSS @media print.
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/cto/reporte-ejecutivo.html';
  const PERM = 'screen.costo';
  const BASE = '/protected/cto';

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Informe de cierre',
    description: 'Informe de costo de ventas y utilidad para Dirección: paquete de datos o memo completo, listo para imprimir o guardar como PDF.',
    requiredPermission: PERM,
  });
  if (!b) return;

  const $ = (id) => document.getElementById(id);
  const now = new Date();
  const emp = (KoguApi.getEmpresaActiva && KoguApi.getEmpresaActiva()) || {};
  const LS_KEY = 'cto.informe.memo.' + (emp.empresa_id || emp.clave_empresa || 'default');

  // El signo va ANTES del peso ("-$35,678", no "$-35,678"): la narrativa la arma
  // el backend con ese criterio y un informe firmado no puede contradecirse a
  // sí mismo entre el texto y la tabla de la página siguiente.
  const sg = (v, s) => ((Number(v) || 0) < 0 ? '-' + s : s);
  const mon = (v) => sg(v, '$' + Math.abs(Number(v) || 0).toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 }));
  const mon2 = (v) => sg(v, '$' + Math.abs(Number(v) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const monM = (v) => sg(v, '$' + Math.abs(Number(v) / 1e6).toLocaleString('es-MX', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + ' M');
  const pct = (v) => v == null ? '—' : ((Number(v) || 0) * 100).toFixed(2) + '%';
  const pct1 = (v) => v == null ? '—' : ((Number(v) || 0) * 100).toFixed(1) + '%';
  const pct0 = (v) => v == null ? '—' : Math.round((Number(v) || 0) * 100) + '%';
  const num = (v) => (Number(v) || 0).toLocaleString('es-MX', { maximumFractionDigits: 0 });
  const fac = (v) => v == null ? '—' : Number(v).toFixed(6);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
  const hoy = () => new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });

  let PER = '', ACUM = '';   // "Junio 2026" y "Enero–Junio 2026"

  let memoPref = {};
  try { memoPref = JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch { memoPref = {}; }
  let modo = memoPref.modo === 'datos' ? 'datos' : 'informe';

  const c = document.getElementById('pageContent');
  c.innerHTML = `
<style>
  #reporte { background:#fff; color:#0f172a; }
  #reporte .band { background:#0e7490; color:#fff; padding:12px 16px; border-radius:8px; margin:18px 0 12px; display:flex; justify-content:space-between; align-items:center; }
  #reporte .band h2 { margin:0; font-size:16px; }
  #reporte .band .bsub { font-size:16px; color:#a5f3fc; margin-top:3px; font-weight:700; letter-spacing:.2px; }
  #reporte .band .n { font-size:11.5px; font-weight:800; opacity:.7; letter-spacing:.8px; text-transform:uppercase; white-space:nowrap; }
  #reporte .idx { border:1px solid #cbd5e1; border-radius:8px; padding:12px 14px; margin-top:14px; }
  #reporte .idx h4 { margin:0 0 8px; font-size:12px; text-transform:uppercase; letter-spacing:.5px; }
  #reporte .idx table.rt td:nth-child(2), #reporte .idx table.rt td:nth-child(3) { text-align:right; white-space:nowrap; }
  #reporte .ppsub { font-size:15px; color:#0e7490; font-weight:700; margin-top:3px; }
  #reporte .cont { font-size:11px; color:#64748b; font-weight:700; text-transform:uppercase; letter-spacing:.6px; border-bottom:1px solid #e2e8f0; padding-bottom:5px; }
  #reporte .kgrid { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; }
  #reporte .kc { background:#f1f5f9; border-radius:8px; padding:12px 14px; }
  #reporte .kc.dark { background:#0e7490; color:#fff; }
  #reporte .kc .l { font-size:11px; color:#64748b; }
  #reporte .kc.dark .l { color:#cbd5e1; }
  #reporte .kc .v { font-size:19px; font-weight:800; margin-top:3px; }
  #reporte .kc .s { font-size:11px; font-weight:700; color:#059669; margin-top:2px; }
  #reporte .kc.dark .s { color:#5eead4; }
  #reporte table.rt { width:100%; border-collapse:collapse; font-size:12px; }
  #reporte table.rt th { background:#0e7490; color:#fff; padding:6px 8px; text-align:right; font-size:10.5px; }
  #reporte table.rt th:first-child { text-align:left; }
  #reporte table.rt td { padding:5px 8px; text-align:right; border-bottom:1px solid #eef2f6; }
  #reporte table.rt td:first-child { text-align:left; }
  #reporte table.rt tr.tot td { background:#ecfdf5; font-weight:800; border-top:2px solid #059669; }
  #reporte .neg { color:#dc2626; }
  #reporte .pos { color:#059669; font-weight:700; }
  #reporte .mini { display:grid; grid-template-columns:repeat(3,1fr); gap:14px; }
  #reporte .mini h4 { margin:0 0 4px; font-size:11px; color:#64748b; }
  #reporte .chip { font-size:9px;font-weight:700;padding:1px 5px;border-radius:4px;margin-left:4px }
  #reporte .ap { background:#dcfce7;color:#166534 } #reporte .inf { background:#e5e7eb;color:#6b7280 }

  /* ── Portada memo ── */
  #reporte .memo { border:1px solid #cbd5e1; border-radius:8px; margin:16px 0 0; overflow:hidden; }
  #reporte .memo .mrow { display:grid; grid-template-columns:78px 1fr 78px 1fr; font-size:12px; border-bottom:1px solid #e2e8f0; }
  #reporte .memo .mrow:last-child { border-bottom:0; }
  #reporte .memo .mrow.full { grid-template-columns:78px 1fr; }
  #reporte .memo .mk { background:#f8fafc; color:#64748b; font-weight:700; padding:7px 10px; font-size:10.5px; text-transform:uppercase; letter-spacing:.4px; border-right:1px solid #e2e8f0; }
  #reporte .memo .mv { padding:7px 10px; color:#0f172a; font-weight:600; }

  /* ── Narrativa ── */
  #reporte .narr { margin:16px 0 0; }
  #reporte .narr h3 { font-size:13px; margin:0 0 6px; text-transform:uppercase; letter-spacing:.5px; border-bottom:2px solid #0e7490; padding-bottom:4px; }
  #reporte .narr p { font-size:12px; line-height:1.65; color:#1e293b; margin:0 0 9px; text-align:justify; }
  #reporte .narr ul { margin:4px 0 0; padding-left:18px; }
  #reporte .narr li { font-size:12px; line-height:1.6; color:#1e293b; margin-bottom:5px; }
  #reporte .metod { font-size:10.5px; color:#64748b; font-style:italic; margin-top:2px; }

  /* ── Cumplimiento vs PP ── */
  #reporte .ppwrap { border:1px solid #cbd5e1; border-radius:10px; padding:14px 16px; margin-top:14px; }
  #reporte .pphead { display:flex; justify-content:space-between; align-items:flex-start; }
  #reporte .pphead .ppt { font-size:15px; font-weight:800; margin-top:2px; }
  #reporte .eyebrow { font-size:9.5px; font-weight:800; letter-spacing:1.2px; text-transform:uppercase; color:#64748b; }
  #reporte .ppbadge { color:#fff; font-weight:800; font-size:11px; padding:4px 12px; border-radius:999px; white-space:nowrap; }
  #reporte .pp { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; margin-top:12px; }
  #reporte .pp .ppc { border:1px solid #e2e8f0; border-radius:8px; padding:9px 11px; }
  #reporte .pp .ppc .l { font-size:9.5px; color:#64748b; text-transform:uppercase; letter-spacing:.4px; }
  #reporte .pp .ppc .v { font-size:16px; font-weight:800; margin-top:2px; }
  #reporte .pp .ppc .sub { font-size:9.5px; color:#64748b; margin-top:3px; }
  #reporte .ppbar { margin-top:12px; }
  #reporte .ppbar .track { position:relative; background:#f1f5f9; border-radius:8px; height:18px; }
  #reporte .ppbar .track i { display:block; height:100%; border-radius:8px 0 0 8px; }
  #reporte .ppbar .track .mark { position:absolute; top:-2px; width:2px; height:22px; background:#0f172a; }
  #reporte .ppbar .lbl { display:flex; justify-content:space-between; font-size:10px; color:#64748b; margin-top:3px; }

  /* ── Anexos y firmas ── */
  #reporte .anexos { margin-top:20px; }
  #reporte .anexos h4 { font-size:12px; margin:0 0 6px; }
  #reporte .anexos li { font-size:11.5px; color:#334155; line-height:1.7; }
  #reporte .firmas { display:grid; grid-template-columns:1fr 1fr; gap:60px; margin-top:46px; }
  #reporte .firmas div { text-align:center; }
  #reporte .firmas .line { border-top:1px solid #334155; margin-bottom:6px; }
  #reporte .firmas .nm { font-size:12px; font-weight:700; }
  #reporte .firmas .rl { font-size:10.5px; color:#64748b; margin-top:2px; }

  /* El interruptor no duplica el render: solo oculta lo que es del memo. */
  #reporte.modo-datos .memo-only { display:none !important; }

  .seg { display:inline-flex; border:1px solid var(--border,#cbd5e1); border-radius:8px; overflow:hidden }
  .seg button { border:0; background:transparent; padding:7px 12px; font-size:12px; font-weight:700; cursor:pointer; color:var(--muted,#64748b) }
  .seg button.on { background:#0e7490; color:#fff }

  @media print {
    @page { size: letter; margin: 12mm 0; }
    /* Margen LATERAL garantizado con padding del propio reporte: sobrevive aunque
       el diálogo de impresión ponga "Márgenes: Ninguno". Top/bottom vía @page. */
    #reporte { padding: 8mm 14mm !important; box-sizing: border-box !important; width:100% !important; }
    html, body { background:#fff !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    /* Ocultar el shell (menú + barra) y controles; el reporte fluye en flujo
       normal para que el margen de @page (14mm) aplique en TODOS los lados/páginas.
       (Antes: position:absolute pegaba el contenido al borde físico → sin margen.) */
    .sidebar, .topbar, .no-print { display: none !important; }
    body, #app, #app > *, main, .content, .app-main, .app-shell, .layout, .page, #pageContent {
      display:block !important; margin:0 !important; padding:0 !important; width:auto !important; max-width:none !important; box-shadow:none !important; border:0 !important; }
    #reporte, #reporte * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    #reporte table.rt { width:100% !important; table-layout:fixed; }
    #reporte table.rt td, #reporte table.rt th { overflow-wrap:anywhere; word-break:break-word; }
    #reporte .pb { page-break-before: always; }
    #reporte tr, #reporte .kc, #reporte .band, #reporte .mini > div, #reporte .memo, #reporte .firmas, #reporte .ppwrap { page-break-inside: avoid; }
    /* La tira de KPIs se lee como una sola unidad: partirla a media rejilla deja
       dos tarjetas huérfanas en la página siguiente (lo primero que ve Dirección).
       Y una banda de sección al pie de página, sin su contenido, es un encabezado
       colgado: por eso el break-after:avoid en banda y encabezados. */
    #reporte .kgrid, #reporte .mini, #reporte .pp { page-break-inside: avoid; }
    #reporte .band, #reporte h4, #reporte .narr h3, #reporte .eyebrow { page-break-after: avoid; }
  }
</style>
<div class="card no-print">
  <div class="row">
    <div><div class="eyebrow">Costo · Dirección</div><h2>Informe de cierre</h2></div>
    <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap">
      <div><label class="muted" style="font-size:12px">Año</label><input type="number" id="anio" class="input" style="width:100px" value="${now.getFullYear()}"/></div>
      <div><label class="muted" style="font-size:12px">Mes</label><input type="number" id="mes" class="input" style="width:80px" min="1" max="12" value="${now.getMonth() + 1}"/></div>
      <div><label class="muted" style="font-size:12px">Salida</label><div class="seg" id="segModo">
        <button data-modo="informe" class="${modo === 'informe' ? 'on' : ''}">Informe a Dirección</button>
        <button data-modo="datos" class="${modo === 'datos' ? 'on' : ''}">Paquete de datos</button>
      </div></div>
      <button class="btn primary" id="genBtn">Generar</button>
      <button class="btn ghost" id="printBtn" title="Imprime o guarda como PDF desde el navegador">🖨 Imprimir / Guardar PDF</button>
    </div>
  </div>
  <div class="row" id="memoRow" style="margin-top:10px;gap:10px;align-items:flex-end;${modo === 'datos' ? 'display:none' : ''}">
    <div style="flex:1;min-width:240px"><label class="muted" style="font-size:12px">Para (destinatario del memo)</label>
      <input type="text" id="para" class="input" style="width:100%" placeholder="Nombre — Puesto" value="${esc(memoPref.para || '')}"/></div>
    <div style="flex:1;min-width:200px"><label class="muted" style="font-size:12px">C.c. (opcional)</label>
      <input type="text" id="cc" class="input" style="width:100%" placeholder="Otro destinatario" value="${esc(memoPref.cc || '')}"/></div>
  </div>
  <div id="msg" class="muted" style="margin-top:10px;font-size:13px">Selecciona el periodo y pulsa <b>Generar</b>. Luego <b>Imprimir / Guardar PDF</b>.</div>
</div>
<div id="reporte" class="${modo === 'datos' ? 'modo-datos' : ''}"></div>`;

  // ─── render helpers ───
  // El número de la banda es la SECCIÓN, no la página: sin la palabra delante
  // se lee como paginación y no coincide con la hoja donde cae al imprimir.
  // El subtítulo declara el alcance (mes o acumulado) y el periodo exacto: en un
  // mismo informe conviven cifras del mes (utilidad) y acumuladas (presupuesto),
  // y de otro modo el lector las suma mentalmente como si fueran comparables.
  function band(n, title, pb, alcance, periodo) {
    const sub = alcance ? `<div class="bsub">${alcance}${periodo ? ' · ' + periodo : ''}</div>` : '';
    return `<div class="band${pb ? ' pb' : ''}"><div><h2>${title}</h2>${sub}</div><span class="n">Sección ${n}</span></div>`;
  }
  function kc(l, v, s, dark) { return `<div class="kc${dark ? ' dark' : ''}"><div class="l">${l}</div><div class="v">${v}</div>${s ? `<div class="s">${s}</div>` : ''}</div>`; }

  // ── Encabezado + portada memo ──
  function secPortada(d) {
    const m = d.memo || {};
    const cerrado = d.periodo.cerrado ? ' (cerrado)' : '';
    let h = `<div style="background:#0e7490;color:#fff;padding:16px;border-radius:8px;display:flex;justify-content:space-between;align-items:center">
      <div><div style="font-size:20px;font-weight:800">Informe de Costo de Ventas y Utilidad</div>
        <div style="font-size:12px;color:#cbd5e1;margin-top:2px">${esc((d.empresa && (d.empresa.razon_social || d.empresa.nombre_corto)) || 'Empresa')} · ${esc(d.periodo.mes_nombre)} ${d.periodo.anio}</div></div>
      <div style="text-align:right"><div style="font-size:15px;font-weight:800">KOGU</div><div style="font-size:10px;color:#94a3b8">Reporte para Dirección</div></div></div>`;
    h += `<div class="memo memo-only">
      <div class="mrow">
        <div class="mk">Para</div><div class="mv">${esc(m.para || 'Dirección General')}</div>
        <div class="mk">Fecha</div><div class="mv">${hoy()}</div>
      </div>
      <div class="mrow">
        <div class="mk">De</div><div class="mv">${esc(m.de || '—')}${m.de_puesto ? ' — ' + esc(m.de_puesto) : ''}</div>
        <div class="mk">Periodo</div><div class="mv">${esc(d.periodo.mes_nombre)} ${d.periodo.anio}${cerrado}</div>
      </div>
      ${m.cc ? `<div class="mrow full"><div class="mk">C.c.</div><div class="mv">${esc(m.cc)}</div></div>` : ''}
      <div class="mrow full"><div class="mk">Asunto</div><div class="mv">${esc(m.asunto || '')}</div></div>
    </div>`;
    return h;
  }

  // ── Índice: qué trae el informe y, sobre todo, QUÉ ALCANCE tiene cada parte ──
  function secIndice(d) {
    const filas = [
      ['Resumen ejecutivo', 'Mes y acumulado', `${PER} · ${ACUM}`],
      ...(d.pp ? [['Cumplimiento vs presupuesto (PP)', 'Acumulado del año', ACUM]] : []),
      ['Sección 1 · Utilidad Bruta', 'Mes', PER],
      ['Sección 2 · Utilidad de Operación', 'Mes', PER],
      ['Sección 3 · Análisis de Rentabilidad', 'Mes', PER],
      ['Sección 4 · Conclusiones y Cierre', 'Mes y acumulado', `${PER} · ${ACUM}`],
      ['Anexos y firmas', '—', '—'],
    ];
    return `<div class="idx memo-only"><h4>Contenido del informe</h4>
      <table class="rt"><tr><th>Apartado</th><th>Alcance</th><th>Periodo</th></tr>
      ${filas.map(([a, b, c]) => `<tr><td>${a}</td><td>${b}</td><td>${esc(c)}</td></tr>`).join('')}</table>
      <div class="metod">El informe mezcla dos alcances: la <b>utilidad</b> y el <b>análisis de rentabilidad</b> son
      del mes; el <b>cumplimiento vs presupuesto</b> es acumulado del año al cierre del mes. No son sumables entre sí.</div></div>`;
  }

  // ── Resumen ejecutivo (narrativa generada en el backend) ──
  function secResumen(d) {
    const n = d.narrativa || {};
    if (!n.resumen || !n.resumen.length) return '';
    return `<div class="narr memo-only"><h3>Resumen ejecutivo</h3>
      ${n.resumen.map((p) => `<p>${esc(p)}</p>`).join('')}
      ${n.nota_metodologia ? `<div class="metod">${esc(n.nota_metodologia)}</div>` : ''}</div>`;
  }

  // ── Cumplimiento vs PP (corte al mes del informe) ──
  function secPp(d) {
    const p = d.pp;
    if (!p) return '';
    const col = p.cumplimiento_corte == null ? '#64748b'
      : p.cumplimiento_corte >= 1 ? '#16a34a' : p.cumplimiento_corte >= 0.9 ? '#d97706' : '#dc2626';
    const barW = Math.min(100, Math.round((p.avance || 0) * 100));
    const ritW = Math.min(100, Math.round((p.ritmo_esperado || 0) * 100));
    let h = `<div class="ppwrap memo-only">
      <div class="pphead">
        <div><div class="eyebrow">Radar · Presupuesto</div>
          <div class="ppt">Cumplimiento vs PP ${p.anio}</div>
          <div class="ppsub">Acumulado del año · ${esc(ACUM)}</div></div>
        <span class="ppbadge" style="background:${col}">${pct0(p.avance)} del PP</span></div>
      <div class="pp">
        <div class="ppc"><div class="l">PP ${p.anio} (MXN)</div><div class="v">${monM(p.ventas_pp)}</div><div class="sub">presupuesto anual</div></div>
        <div class="ppc"><div class="l">Real al corte (${d.periodo.mes} m)</div><div class="v" style="color:${col}">${monM(p.real_corte)}</div><div class="sub">${pct0(p.avance)} del PP · ritmo esperado ${pct0(p.ritmo_esperado)}</div></div>
        <div class="ppc"><div class="l">Meta al corte (${d.periodo.mes} m)</div><div class="v">${monM(p.meta_corte)}</div><div class="sub">PP ÷ 12 × ${d.periodo.mes} ${d.periodo.mes === 1 ? 'mes' : 'meses'}</div></div>
        <div class="ppc"><div class="l">Cumplimiento al corte</div><div class="v" style="color:${col}">${pct0(p.cumplimiento_corte)}</div><div class="sub">real ÷ meta al corte</div></div>
      </div>
      <div class="ppbar"><div class="track"><i style="width:${barW}%;background:${col}"></i><span class="mark" style="left:${ritW}%"></span></div>
        <div class="lbl"><span>Avance ${pct0(p.avance)}</span><span>Marcador = ritmo esperado ${pct0(p.ritmo_esperado)}</span><span>PP 100%</span></div></div>`;
    if (p.proyeccion) {
      const q = p.proyeccion;
      const pcol = q.cierre_pct == null ? '#64748b' : q.cierre_pct >= 0.98 ? '#16a34a' : q.cierre_pct >= 0.9 ? '#d97706' : '#dc2626';
      h += `<div class="eyebrow" style="margin-top:14px">Proyección a fin de año · promedio mensual × 12</div>
        <div class="pp">
          <div class="ppc"><div class="l">Promedio mensual</div><div class="v">${monM(q.promedio_mensual)}</div><div class="sub">real ÷ ${d.periodo.mes} ${d.periodo.mes === 1 ? 'mes' : 'meses'}</div></div>
          <div class="ppc"><div class="l">Proyección de cierre</div><div class="v" style="color:${pcol}">${monM(q.cierre)}</div><div class="sub">vs PP ${monM(p.ventas_pp)}</div></div>
          <div class="ppc"><div class="l">% del PP proyectado</div><div class="v" style="color:${pcol}">${pct0(q.cierre_pct)}</div><div class="sub">${q.cierre_pct != null && q.cierre_pct < 1 ? 'cerraría por debajo' : 'cerraría en meta'}</div></div>
          <div class="ppc"><div class="l">Ritmo requerido</div><div class="v">${monM(q.ritmo_requerido)}</div><div class="sub">mensual, ${q.meses_restantes} ${q.meses_restantes === 1 ? 'mes' : 'meses'} restantes</div></div>
        </div>`;
    } else if (p.proyeccion_omitida) {
      h += `<div class="metod" style="margin-top:10px">Con menos de tres meses de historia la proyección lineal no es significativa; se omite.</div>`;
    }
    if (p.pp_pendiente) h += `<div class="metod" style="margin-top:8px">El presupuesto del año aún no está capturado por sublínea; el comparativo usa el catálogo con PP en cero.</div>`;
    h += `<div class="metod" style="margin-top:8px">El presupuesto se administra en Radar Comercial; el real al corte es el del ABC, misma fuente que el resto de este informe.</div></div>`;
    return h;
  }

  // ── Sección 1 — Utilidad bruta (sin cambios respecto del reporte vigente) ──
  function secBruta(r, f) {
    let h = `<div class="sec">${band('1', 'Utilidad Bruta', false, 'Resultado del mes', PER)}`;
    h += `<div class="kgrid">
      ${kc('Total ventas', mon2(r.total_ventas))}
      ${kc('Σ Costo MP (sistema)', mon2(r.costo_mp))}
      ${kc('Costo integrado (MP + factores)', mon2(r.costo_integrado))}
      ${kc('Utilidad bruta', mon2(r.utilidad_bruta), pct(r.utilidad_bruta_pct), true)}
      ${kc('Kilos / Facturas', num(r.kilos) + ' kg', num(r.recuento_facturas) + ' facturas')}
    </div>`;
    const tv = Number(r.total_ventas) || 0;
    const pp = (v) => tv ? pct1(v / tv) : '—';
    h += `<table class="rt" style="margin-top:14px">
      <tr><th>Ventas</th><th>(−) Costo integrado</th><th>= Utilidad bruta</th></tr>
      <tr><td style="text-align:right">${mon(r.total_ventas)}</td><td>${mon(r.costo_integrado)}</td><td class="pos">${mon(r.utilidad_bruta)}</td></tr>
      <tr style="color:#64748b;font-size:10px"><td style="text-align:right">100%</td><td>${pp(r.costo_integrado)}</td><td>${pct1(r.utilidad_bruta_pct)}</td></tr>
    </table>`;
    if (f) {
      const rowf = (l, v, tag) => `<tr><td style="text-align:left;padding:4px 8px">${l}${tag || ''}</td><td style="padding:4px 8px">${v}</td></tr>`;
      const tab = (rows) => `<table class="rt"><tbody>${rows}</tbody></table>`;
      h += `<h4 style="margin:16px 0 6px;color:#0f172a">Indicadores ABC del mes · ${esc(PER)}</h4>
        <div class="mini">
        <div><h4>Importes capturados</h4>${tab(
          rowf('Importe A', mon(f.importe_a)) + rowf('Importe B', mon(f.importe_b)) + rowf('Importe B fijo', mon(f.importe_b_fijo)) + rowf('Importe B prorrateo', mon(f.importe_b_prorrateo)) + rowf('Importe C', mon(f.importe_c)))}</div>
        <div><h4>Kilos calculados por KOGU</h4>${tab(
          rowf('Kilos A', num(f.kilos_a)) + rowf('Kilos B', num(f.kilos_b)) + rowf('Kilos C (export+import)', num(f.kilos_c)) + rowf('Kilos Prod B', num(f.kilos_prod_b)))}</div>
        <div><h4>Factores</h4>${tab(
          rowf('Factor A', fac(f.factor_a), '<span class="chip ap">aplicado</span>') + rowf('Factor B fijo', fac(f.factor_b_fijo), '<span class="chip ap">aplicado</span>') + rowf('Factor B', fac(f.factor_b), '<span class="chip inf">inf</span>') + rowf('Factor C', fac(f.factor_c), '<span class="chip inf">inf</span>') + rowf('Factor B almacén', fac(f.factor_b_alm), '<span class="chip inf">inf</span>'))}</div>
      </div>`;
    }
    return h + `</div>`;
  }

  // ── Sección 2 — Utilidad de operación ──
  function secOperacion(r, ag) {
    let h = `<div class="sec">${band('2', 'Utilidad de Operación', true, 'Resultado del mes', PER)}`;
    h += `<p style="font-size:12px;color:#334155;margin:0 0 12px">Sobre la utilidad bruta se descuenta el <b>gasto de venta</b> (comisiones, sueldo, gasto y carga social) prorrateado por kilo vendido de cada agente.</p>`;
    h += `<div class="kgrid">
      ${kc('Utilidad bruta', mon2(r.utilidad_bruta), pct(r.utilidad_bruta_pct))}
      ${kc('(−) Gastos de venta', mon2(r.gastos_venta), pct1((Number(r.gastos_venta) || 0) / (Number(r.total_ventas) || 1)) + ' de ventas')}
      ${kc('= Utilidad de operación', mon2(r.utilidad_operacion), pct(r.utilidad_operacion_pct), true)}
    </div>`;
    h += `<table class="rt" style="margin-top:14px">
      <tr><th>Utilidad bruta</th><th>(−) Gasto de venta</th><th>= Utilidad de operación</th></tr>
      <tr><td style="text-align:right" class="pos">${mon(r.utilidad_bruta)}</td><td>${mon(r.gastos_venta)}</td><td class="pos">${mon(r.utilidad_operacion)}</td></tr>
      <tr style="color:#64748b;font-size:10px"><td style="text-align:right">${pct1(r.utilidad_bruta_pct)}</td><td>${pct1((Number(r.gastos_venta) || 0) / (Number(r.total_ventas) || 1))}</td><td>${pct1(r.utilidad_operacion_pct)}</td></tr>
    </table>`;
    const ags = (ag && ag.agentes) || [];
    if (ags.length) {
      let body = '';
      for (const a of ags) {
        body += `<tr><td>${esc(a.agente_nombre || a.nombre || '—')}</td><td>${mon(a.total_ventas)}</td><td>${mon(a.costo_integrado)}</td><td>${mon(a.gastos_venta)}</td><td>${mon(a.utilidad_operacion)}</td><td class="pos">${pct1(a.utilidad_operacion_pct)}</td></tr>`;
      }
      const t = ag.totales || {};
      body += `<tr class="tot"><td>TOTAL</td><td>${mon(t.total_ventas)}</td><td>${mon(t.costo_integrado)}</td><td>${mon(t.gastos_venta)}</td><td>${mon(t.utilidad_operacion)}</td><td>${pct1(t.utilidad_operacion_pct)}</td></tr>`;
      h += `<h4 style="margin:18px 0 6px;color:#0f172a">Utilidad de operación por agente</h4>
        <table class="rt"><tr><th>Agente</th><th>Ventas</th><th>Costo int.</th><th>Gasto venta</th><th>Util. oper.</th><th>% Oper.</th></tr>${body}</table>`;
    }
    return h + `</div>`;
  }

  // ── Sección 3 — Análisis de rentabilidad ──
  function secAnalisis(d) {
    const cl = d.clientes, pr = d.productos, k = cl.concentracion;
    let h = `<div class="sec">${band('3', 'Análisis de Rentabilidad', true, 'Resultado del mes', PER)}`;
    h += `<p style="font-size:12px;color:#334155;line-height:1.5">
      &bull; Los <b>4 clientes principales</b> concentran <b>${pct1(k.top4_pct)}</b> de la venta (${mon(k.top4_importe)}).<br/>
      &bull; Los <b>10 principales</b> = <b>${pct1(k.top10_pct)}</b>. ${k.resto_registros > 0 ? `El resto (${k.resto_registros} clientes) aporta ${pct1(k.resto_pct)}.` : ''}<br/>
      ${k.ancla ? `&bull; Cliente ancla: <b>${esc(k.ancla.nombre)}</b> con ${mon(k.ancla.ventas)} (${pct1(k.ancla.pct_venta)}).` : ''}</p>`;
    let body = '';
    cl.top.forEach((x) => { body += `<tr><td>${x.posicion}. ${esc(x.nombre)}</td><td>${mon(x.ventas)}</td><td>${mon(x.utilidad_bruta)}</td><td class="pos">${pct1(x.margen)}</td><td>${num(x.kilos)}</td><td>${pct1(x.pct_acumulado)}</td></tr>`; });
    h += `<h4 style="margin:6px 0">Top 10 clientes por venta</h4>
      <table class="rt"><tr><th>Cliente</th><th>Ventas</th><th>Utilidad</th><th>Margen</th><th>Kg</th><th>% acum.</th></tr>${body}</table>`;
    body = '';
    pr.top.forEach((x) => { body += `<tr><td>${x.posicion}. ${esc(x.clave)} · ${esc((x.nombre || '').slice(0, 28))}</td><td>${mon(x.ventas)}</td><td>${mon(x.utilidad_bruta)}</td><td class="pos">${pct1(x.margen)}</td><td>${num(x.kilos)}</td></tr>`; });
    h += `<h4 style="margin:16px 0 6px">Top 10 productos por venta</h4>
      <table class="rt"><tr><th>Producto</th><th>Ventas</th><th>Utilidad</th><th>Margen</th><th>Kg</th></tr>${body}</table>`;
    // Alertas: la causa del rojo se distingue en la tabla. "Pérdida" = se vendió
    // por debajo de costo. "Devolución" = ninguna venta perdió dinero; una nota
    // de crédito reversó ventas anteriores y arrastró el neto. Presentarlas
    // igual hace que Dirección persiga un problema de precio inexistente.
    const perd = pr.alertas.perdida || [], dev = pr.alertas.devolucion || [], bajo = pr.alertas.bajo || [];
    if (perd.length || dev.length || bajo.length) {
      const nm = (x) => `${esc(x.clave)} · ${esc((x.nombre || '').slice(0, 22))}`;
      body = '';
      perd.forEach((x) => {
        const u = x.utilidad_sin_notas != null ? x.utilidad_sin_notas : x.utilidad_bruta;
        const v = x.ventas_sin_notas != null ? x.ventas_sin_notas : x.ventas;
        const m = x.margen_sin_notas != null ? x.margen_sin_notas : x.margen;
        body += `<tr><td>${nm(x)}</td><td>${mon(v)}</td><td class="neg">${mon(u)}</td><td class="neg">${pct1(m)}</td><td>—</td><td class="neg">Bajo costo</td></tr>`;
      });
      dev.forEach((x) => {
        body += `<tr><td>${nm(x)}</td><td>${mon(x.ventas_sin_notas)}</td><td class="pos">${mon(x.utilidad_sin_notas)}</td><td class="pos">${pct1(x.margen_sin_notas)}</td><td class="neg">${mon(x.ventas_nota)}</td><td style="color:#7c3aed">Devolución</td></tr>`;
      });
      bajo.forEach((x) => {
        const v = x.ventas_sin_notas != null ? x.ventas_sin_notas : x.ventas;
        const u = x.utilidad_sin_notas != null ? x.utilidad_sin_notas : x.utilidad_bruta;
        const m = x.margen_sin_notas != null ? x.margen_sin_notas : x.margen;
        body += `<tr><td>${nm(x)}</td><td>${mon(v)}</td><td>${mon(u)}</td><td style="color:#d97706">${pct1(m)}</td><td>${x.ventas_nota ? mon(x.ventas_nota) : '—'}</td><td style="color:#d97706">Margen bajo</td></tr>`;
      });
      const th = (t) => `<th style="background:#7f1d1d">${t}</th>`;
      // Las alertas van SIEMPRE en hoja propia: cuando quedaban al pie, el titulo
      // y el encabezado de la tabla se separaban de sus renglones y la hoja
      // siguiente abria con una tabla roja sin contexto.
      h += `<div class="pb">
        <div class="cont">Sección 3 · Análisis de Rentabilidad (continúa) · ${esc(PER)}</div>
        <h4 style="margin:10px 0 6px;color:#7f1d1d">Alertas de margen</h4>
        <table class="rt"><tr style="background:#7f1d1d">${th('Producto')}${th('Ventas del periodo')}${th('Utilidad')}${th('Margen')}${th('Devuelto')}${th('Estado')}</tr>${body}</table>
        <div class="metod">Ventas, utilidad y margen son <b>de la venta del periodo</b>, sin notas de crédito. La columna <b>Devuelto</b> muestra el importe reversado por notas: cuando ese reverso supera la utilidad del mes, el producto cierra en rojo sin que ninguna operación se haya vendido bajo costo.</div></div>`;
    }
    return h + `</div>`;
  }

  // ── Sección 4 — Conclusiones, anexos y firmas (solo memo) ──
  function secCierre(d) {
    const n = d.narrativa || {};
    if (!n.conclusiones || !n.conclusiones.length) return '';
    let h = `<div class="sec memo-only">${band('4', 'Conclusiones y Cierre', true, 'Mes y acumulado del año', `${PER} · ${ACUM}`)}<div class="narr">`;
    h += `<h3>Conclusiones</h3><ul>${n.conclusiones.map((x) => `<li><b>${esc(x.titulo)}:</b> ${esc(x.texto)}</li>`).join('')}</ul>`;
    if (n.recomendaciones && n.recomendaciones.length) {
      h += `<h3 style="margin-top:18px">Recomendaciones</h3><ul>${n.recomendaciones.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
    }
    h += `</div>`;
    h += `<div class="anexos"><h4>Anexos que acompañan este informe</h4><ul>
      <li>ABC y ABC Histórico del periodo</li>
      <li>Rentabilidad por cliente y por producto (Excel)</li>
      <li>Costo por cliente de exportación</li>
      <li>Detalle de gasto de venta por agente</li></ul></div>`;
    const m = d.memo || {};
    // "Nombre — Puesto" se captura en un solo campo; en la firma se parte para
    // que el nombre quede sobre la raya y el puesto debajo, como en un memo.
    const parte = (txt, defNombre, defRol) => {
      const p = String(txt || '').split(/\s+—\s+|\s+-\s+/);
      return { nombre: (p[0] || defNombre).trim(), rol: (p.slice(1).join(' — ') || defRol).trim() };
    };
    const fDe = parte(m.de, '', ''), fPara = parte(m.para, 'Dirección General', '');
    h += `<div class="firmas">
      <div><div class="line"></div><div class="nm">${esc(fDe.nombre)}</div><div class="rl">Elaboró${m.de_puesto ? ' — ' + esc(m.de_puesto) : ''}</div></div>
      <div><div class="line"></div><div class="nm">${esc(fPara.nombre)}</div><div class="rl">Vo. Bo.${fPara.rol ? ' — ' + esc(fPara.rol) : ''}</div></div>
    </div>`;
    return h + `</div>`;
  }

  // ─── generar ───
  async function generar() {
    const anio = $('anio').value, mes = $('mes').value;
    if (!anio || !mes) return KoguApi.toast('Indica año y mes.', 'error');
    const para = ($('para') && $('para').value || '').trim();
    const cc = ($('cc') && $('cc').value || '').trim();
    try { localStorage.setItem(LS_KEY, JSON.stringify({ para, cc, modo })); } catch { /* sin persistencia */ }

    $('msg').innerHTML = 'Generando informe…';
    $('reporte').innerHTML = '';
    try {
      const qs = new URLSearchParams();
      if (para) qs.set('para', para);
      if (cc) qs.set('cc', cc);
      const d = KoguApi.unwrapData(await KoguApi.apiFetch(`${BASE}/informe/${anio}/${mes}${qs.toString() ? '?' + qs : ''}`));
      if (!d || !d.resultado) { $('msg').innerHTML = 'No hay resultado calculado para ese periodo. Calcula primero en “Costo de ventas / Utilidad”.'; return; }
      PER = `${d.periodo.mes_nombre} ${d.periodo.anio}`;
      ACUM = d.periodo.mes === 1 ? PER : `Enero–${d.periodo.mes_nombre} ${d.periodo.anio}`;
      $('reporte').innerHTML =
        secPortada(d) + secIndice(d) + secResumen(d) + secPp(d) +
        secBruta(d.resultado, d.factores) + secOperacion(d.resultado, d.agentes) +
        secAnalisis(d) + secCierre(d);
      $('msg').innerHTML = 'Informe generado. Pulsa <b>Imprimir / Guardar PDF</b> (Ctrl/Cmd+P → Guardar como PDF).';
    } catch (e) {
      $('msg').innerHTML = '';
      KoguApi.toast(e.message || 'Error generando el informe', 'error');
    }
  }

  // ─── interruptor de salida (no re-consulta: solo alterna la clase) ───
  $('segModo').addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-modo]');
    if (!btn) return;
    modo = btn.dataset.modo;
    [...$('segModo').querySelectorAll('button')].forEach((x) => x.classList.toggle('on', x.dataset.modo === modo));
    $('reporte').classList.toggle('modo-datos', modo === 'datos');
    $('memoRow').style.display = modo === 'datos' ? 'none' : '';
    try { localStorage.setItem(LS_KEY, JSON.stringify({ ...memoPref, modo })); } catch { /* sin persistencia */ }
  });

  $('genBtn').onclick = generar;
  $('printBtn').onclick = () => window.print();
});

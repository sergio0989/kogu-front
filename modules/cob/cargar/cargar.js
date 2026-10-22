// ============================================================
// modules/cob/cargar/cargar.js
// Cobranza F1 · Cargar corte de cartera. Facturación exporta de SAI
// "Cuentas por cliente y factura" el viernes en la tarde y lo carga aquí:
//   1) Vista previa  POST /protected/cob/cortes/preview (archivo + fecha)
//      → totales por antigüedad (deben cuadrar con SAI), clientes sin
//        catalogar, comparación con el corte anterior y avisos.
//   2) Aplicar       POST /protected/cob/cortes/:id/aplicar
//      (motivo si reemplaza un corte de la misma fecha; confirmar si hay
//       renglones que no cuadran con SAI) — o Descartar.
// ?corte_id= retoma una vista previa (GET /protected/cob/cortes/:id).
// Prueba: tests/cob-cargar-render.test.mjs
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/cob/cargar/cargar.html';
  const CARTERA = '/modules/cob/cartera/cartera.html';
  const C = window.CobComun;

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Cargar corte de cartera',
    description: 'Export de SAI "Cuentas por cliente y factura" · se carga el viernes, se trabaja el lunes.',
    requiredPermission: 'cob.corte.cargar',
  });
  if (!b) return;

  const esc = (s) => KoguUi.escapeHtml(s);
  const $ = (id) => document.getElementById(id);
  const hoy = () => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
  const STATUS = { preview: 'Vista previa', aplicado: 'Aplicado', descartado: 'Descartado', reemplazado: 'Reemplazado' };
  const STATUS_CLASE = { preview: 'warn', aplicado: 'success', descartado: 'neutral', reemplazado: 'neutral' };

  estilos();
  $('pageContent').innerHTML = `
<div class="stack cobc" style="gap:16px">
  <div class="card">
    <div class="eyebrow">Cobranza · Corte semanal</div>
    <div class="cobc-muted" style="margin-top:6px">Exporta de SAI el reporte <b>Cuentas por cliente y factura</b> al cierre del viernes y súbelo tal cual (Excel). La fecha de corte es la del reporte.</div>
    <div class="cobc-form">
      <div><div class="label-text">Archivo de SAI</div><input class="input" id="cobArchivo" type="file" accept=".xlsx,.xls"/></div>
      <div><div class="label-text">Fecha de corte</div><input class="input" id="cobFecha" type="date" style="max-width:180px"/></div>
      <button type="button" class="btn primary" id="cobPreviewBtn">Vista previa</button>
    </div>
    <div id="cobMsg" class="cobc-msg"></div>
  </div>
  <div id="cobPreview"></div>
  <div class="card">
    <div class="eyebrow">Historial de cortes</div>
    <div id="cobHistorial" class="cobc-muted" style="margin-top:8px">Cargando…</div>
  </div>
</div>`;
  $('cobFecha').value = hoy();   // SAI cuenta los días contra la fecha del export; normalmente se carga el mismo día

  let actual = null;   // { corte, resumen, advertencias }

  const msg = (html, tipo = '') => { $('cobMsg').className = `cobc-msg ${tipo}`; $('cobMsg').innerHTML = html; };

  // ── Historial ────────────────────────────────────────────────────
  async function historial() {
    try {
      const rows = (await KoguApi.apiFetch('/protected/cob/cortes?limit=30')).data || [];
      $('cobHistorial').innerHTML = rows.length ? `<table class="cobc-tbl"><thead><tr><th>Corte</th><th>Estatus</th><th class="num">Documentos</th><th class="num">Saldo MXN</th><th>Archivo</th><th></th></tr></thead><tbody>
        ${rows.map((c) => `<tr><td>${C.fmtFecha(c.fecha_corte)}</td><td><span class="badge ${STATUS_CLASE[c.status] || 'neutral'}">${STATUS[c.status] || esc(c.status)}</span>${c.motivo_reemplazo ? ` <span class="cobc-muted">· ${esc(c.motivo_reemplazo)}</span>` : ''}</td>
          <td class="num">${c.docs ?? '—'}</td><td class="num">${c.saldo_mxn != null ? C.dinero(Number(c.saldo_mxn)) : '—'}</td><td>${esc(c.archivo_nombre || '—')}</td>
          <td>${c.status === 'preview' ? `<a href="${PAGE}?corte_id=${esc(c.corte_id)}">Retomar</a>` : ''}</td></tr>`).join('')}</tbody></table>`
        : 'Todavía no se ha cargado ningún corte.';
    } catch (_) {
      $('cobHistorial').textContent = 'No se pudo cargar el historial.';
    }
  }

  // ── Vista previa ─────────────────────────────────────────────────
  async function previsualizar() {
    const f = $('cobArchivo').files && $('cobArchivo').files[0];
    const fecha = $('cobFecha').value;
    if (!f) { msg('Elige el archivo exportado de SAI.', 'mal'); return; }
    if (!fecha) { msg('Indica la fecha de corte.', 'mal'); return; }
    const fd = new FormData();
    fd.append('fecha_corte', fecha);
    fd.append('archivo', f, f.name);
    msg('Leyendo el archivo…');
    $('cobPreviewBtn').disabled = true;
    try {
      const r = (await KoguApi.apiFetch('/protected/cob/cortes/preview', { method: 'POST', body: fd })).data;
      msg('');
      mostrar({ corte: r.corte, resumen: r.resumen, advertencias: r.advertencias || [] });
      historial();
    } catch (e) {
      actual = null; $('cobPreview').innerHTML = '';
      msg(esc((e && e.message) || 'No se pudo leer el archivo.'), 'mal');
    } finally {
      $('cobPreviewBtn').disabled = false;
    }
  }

  function mostrar(p) {
    actual = p;
    const { corte, resumen: r } = p;
    const bk = r.buckets_mxn || {};
    const difs = r.diferencias_importe || [];
    const difB = r.diferencias_bucket || [];
    const sug = r.fecha_sugerida;
    const comp = r.comparacion;
    const fila = (d, extra = '') => `<li><b>${esc(C.folioDe(d))}</b> · ${esc(d.cve_cte)} · ${esc(d.moneda)} ${C.numero(d.saldo)}${extra}</li>`;
    const lista = (arr, f) => arr.slice(0, 15).map(f).join('') + (arr.length > 15 ? `<li class="cobc-muted">y ${arr.length - 15} más</li>` : '');
    const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`;

    $('cobPreview').innerHTML = `
  <div class="card" id="cobResumen">
    <div class="eyebrow" id="cobTitulo">${titulo(corte)}</div>
    <div class="cobc-big">${corte.docs} documentos · ${corte.clientes} clientes</div>
    <table class="cobc-tbl" style="max-width:520px"><tbody>
      ${C.BUCKETS.map((l, i) => `<tr><td>${l}</td><td class="num">${C.dinero(bk[i + 1] || 0)}</td></tr>`).join('')}
      <tr class="tot"><td>Total</td><td class="num">${C.dinero(Number(corte.saldo_mxn))}</td></tr>
    </tbody></table>
    ${difs.length
    ? `<div class="cobc-alerta mal">${plural(difs.length, 'renglón no cuadra', 'renglones no cuadran')} con SAI: ${difs.slice(0, 10).map((d) => `${esc(d.documento)} (KOGU ${C.dinero(d.saldo_mxn)} · SAI ${C.dinero(d.total_sai_mxn)})`).join(', ')}.</div>` : ''}
    ${difB.length
    ? `<div class="cobc-alerta mal">En ${plural(difB.length, 'factura', 'facturas')} la antigüedad no coincide con SAI (${difB.slice(0, 5).map((d) => esc(d.documento)).join(', ')}${difB.length > 5 ? '…' : ''}).
        SAI cuenta los días contra el día en que se generó el reporte.
        ${sug ? `Con fecha de corte <b>${C.fmtFecha(sug)}</b> cuadra completo.
          ${corte.status === 'preview' ? `<div style="margin-top:8px"><button type="button" class="btn primary" id="cobUsarSugerida" data-fecha="${esc(sug)}">Usar ${C.fmtFecha(sug)}</button></div>` : ''}`
    : 'Revisa que la fecha de corte sea el día en que sacaste el reporte.'}</div>` : ''}
    ${!difs.length && !difB.length ? '<div class="cobc-alerta ok">Cuadra con los totales y la antigüedad de SAI renglón por renglón.</div>' : ''}
    <div class="cobc-muted" style="margin-top:6px">Compara estos totales con los del pie del reporte en SAI antes de aplicar.</div>
  </div>
  <div class="card" id="cobAcciones">${acciones()}</div>
  <div id="cobAdvertencias">${(p.advertencias || []).map((a) => `<div class="card cobc-alerta warn">${esc(a.mensaje || a.texto || '')}</div>`).join('')}</div>
  <div class="card" id="cobSinCatalogo">
    ${r.sin_catalogo && r.sin_catalogo.length
    ? `<div class="eyebrow">${plural(r.sin_catalogo.length, 'cliente sin catalogar', 'clientes sin catalogar')}</div>
       <div class="cobc-muted">Se cargan igual con el nombre de SAI; dalos de alta en el catálogo de clientes (clave SAI) para que tengan responsable de cobranza.</div>
       <table class="cobc-tbl"><thead><tr><th>Clave SAI</th><th>Nombre en SAI</th><th class="num">Docs</th><th class="num">Saldo MXN</th></tr></thead><tbody>
       ${r.sin_catalogo.slice(0, 10).map((s) => `<tr><td>${esc(s.cve_cte)}</td><td>${esc(s.nom_cte_sai)}</td><td class="num">${s.docs}</td><td class="num">${C.dinero(s.saldo_mxn)}</td></tr>`).join('')}
       </tbody></table>${r.sin_catalogo.length > 10 ? `<div class="cobc-muted">y ${r.sin_catalogo.length - 10} más</div>` : ''}`
    : '<div class="eyebrow">Todos los clientes están en el catálogo</div>'}
  </div>
  <div class="card" id="cobComparacion">
    ${comp
    ? `<div class="eyebrow">Cambios contra el corte del ${C.fmtFecha(comp.corte_anterior.fecha_corte)}</div>
       <div class="cobc-cols">
         <div><b>${plural(comp.nuevos.length, 'nueva', 'nuevas')}</b><ul>${lista(comp.nuevos, (d) => fila(d))}</ul></div>
         <div><b>${comp.salieron.length} ${comp.salieron.length === 1 ? 'salió' : 'salieron'}</b> <span class="cobc-muted">(cobradas o canceladas)</span><ul>${lista(comp.salieron, (d) => fila(d))}</ul></div>
         <div><b>${comp.cambiaron.length} ${comp.cambiaron.length === 1 ? 'cambió' : 'cambiaron'} de saldo</b><ul>${lista(comp.cambiaron, (d) => `<li><b>${esc(C.folioDe(d))}</b> · ${esc(d.moneda)} ${C.numero(d.saldo_anterior)} → ${C.numero(d.saldo)}</li>`)}</ul></div>
       </div><div class="cobc-muted">${comp.sin_cambio} sin cambio.</div>`
    : '<div class="eyebrow">Primer corte</div><div class="cobc-muted">No hay corte aplicado anterior para comparar.</div>'}
  </div>
`;
  }

  function titulo(corte) {
    return corte.status === 'preview' ? `Vista previa · corte ${C.fmtFecha(corte.fecha_corte)}` : `Corte ${C.fmtFecha(corte.fecha_corte)} · ${STATUS[corte.status] || esc(corte.status)}`;
  }

  function acciones() {
    const { corte, resumen: r } = actual;
    if (corte.status === 'aplicado') return `<div class="cobc-alerta ok">Corte aplicado. <a href="${CARTERA}"><b>Ver la cartera →</b></a></div>`;
    if (corte.status !== 'preview') return `<div>Este corte está <b>${STATUS[corte.status] || esc(corte.status)}</b>.</div>`;
    const difs = (r.diferencias_importe || []).length + (r.diferencias_bucket || []).length;
    return `
    ${r.reemplaza ? `<div class="cobc-alerta warn">Ya hay un corte aplicado al ${C.fmtFecha(r.reemplaza.fecha_corte)}. Al aplicar éste, el anterior queda como reemplazado (se conserva como historia).</div>
      <div class="label-text" style="margin-top:10px">Motivo del reemplazo</div><textarea class="input" id="cobMotivo" rows="2" style="width:100%" placeholder="Ej. se exportó antes del cierre"></textarea>` : ''}
    ${difs ? '<label class="cobc-check"><input type="checkbox" id="cobConfirmarDif"/> Revisé las diferencias contra SAI y quiero aplicar así.</label>' : ''}
    <div class="cobc-btns"><button type="button" class="btn primary" id="cobAplicar">Aplicar corte</button>
      <button type="button" class="btn" id="cobDescartar">Descartar</button></div>`;
  }

  async function aplicar() {
    const body = {};
    if (actual.resumen.reemplaza) {
      const m = ($('cobMotivo').value || '').trim();
      if (!m) { msg('Escribe el motivo del reemplazo.', 'mal'); return; }
      body.motivo = m;
    }
    if ((actual.resumen.diferencias_importe || []).length || (actual.resumen.diferencias_bucket || []).length) {
      if (!$('cobConfirmarDif').checked) { msg('Confirma que revisaste las diferencias contra SAI.', 'mal'); return; }
      body.confirmar_diferencias = true;
    }
    $('cobAplicar').disabled = true;
    try {
      const c = (await KoguApi.apiFetch(`/protected/cob/cortes/${encodeURIComponent(actual.corte.corte_id)}/aplicar`, { method: 'POST', body: JSON.stringify(body) })).data;
      actual.corte = { ...actual.corte, ...c, status: 'aplicado' };
      $('cobAcciones').innerHTML = acciones();
      $('cobTitulo').innerHTML = titulo(actual.corte);
      msg(`Corte aplicado. <a href="${CARTERA}">Ver la cartera</a>`, 'ok');
      historial();
    } catch (e) {
      if ($('cobAplicar')) $('cobAplicar').disabled = false;
      msg(esc((e && e.message) || 'No se pudo aplicar el corte.'), 'mal');
    }
  }

  async function descartar() {
    try {
      await KoguApi.apiFetch(`/protected/cob/cortes/${encodeURIComponent(actual.corte.corte_id)}/descartar`, { method: 'POST' });
      actual.corte = { ...actual.corte, status: 'descartado' };
      $('cobAcciones').innerHTML = acciones();
      $('cobTitulo').innerHTML = titulo(actual.corte);
      msg('Vista previa descartada. Puedes cargar otro archivo.', 'ok');
      historial();
    } catch (e) {
      msg(esc((e && e.message) || 'No se pudo descartar.'), 'mal');
    }
  }

  // Descarta la vista previa con la fecha equivocada y la repite con la que cuadra.
  async function usarSugerida(fecha) {
    try {
      await KoguApi.apiFetch(`/protected/cob/cortes/${encodeURIComponent(actual.corte.corte_id)}/descartar`, { method: 'POST' });
    } catch (_) { /* si ya no estaba en vista previa, seguimos */ }
    $('cobFecha').value = fecha;
    await previsualizar();
  }

  // ── Eventos ──────────────────────────────────────────────────────
  $('cobPreviewBtn').addEventListener('click', previsualizar);
  $('cobPreview').addEventListener('click', (e) => {
    if (e.target.id === 'cobUsarSugerida') usarSugerida(e.target.dataset.fecha);
    if (e.target.id === 'cobAplicar') aplicar();
    if (e.target.id === 'cobDescartar') descartar();
  });
  KoguShell.subscribeEmpresaActivaChange(() => { actual = null; $('cobPreview').innerHTML = ''; msg(''); historial(); });

  // Retomar una vista previa (enlace del historial).
  const corteId = new URLSearchParams(location.search).get('corte_id');
  if (corteId) {
    try {
      const c = (await KoguApi.apiFetch(`/protected/cob/cortes/${encodeURIComponent(corteId)}`)).data;
      if (c && c.resumen) mostrar({ corte: c, resumen: c.resumen, advertencias: [] });
    } catch (e) {
      msg(esc((e && e.message) || 'No se encontró el corte.'), 'mal');
    }
  }
  historial();

  function estilos() {
    if (document.getElementById('cobcEstilos')) return;
    const s = document.createElement('style'); s.id = 'cobcEstilos';
    s.textContent = `
.cobc-muted{color:var(--muted);font-size:13px}
.cobc-form{display:flex;gap:12px;flex-wrap:wrap;align-items:end;margin-top:14px}
.cobc-msg{margin-top:10px;font-size:13px}
.cobc-msg.mal{color:var(--danger,#dc2626);font-weight:600}
.cobc-msg.ok{color:#166534;font-weight:600}
.cobc-big{font-size:20px;font-weight:800;margin:6px 0 10px}
.cobc-tbl{width:100%;border-collapse:collapse;font-size:13px;margin-top:8px}
.cobc-tbl th{background:#f8fafc;text-align:left;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);padding:8px 10px;border-bottom:1px solid var(--line)}
.cobc-tbl td{padding:8px 10px;border-bottom:1px solid var(--line)}
.cobc-tbl .num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.cobc-tbl tr.tot td{font-weight:800;border-top:2px solid var(--line)}
.cobc-alerta{border-radius:10px;padding:10px 12px;font-size:13px;margin-top:10px}
.cobc-alerta.ok{background:#dcfce7;color:#166534}
.cobc-alerta.warn{background:#fef3c7;color:#92400e}
.cobc-alerta.mal{background:#fee2e2;color:#991b1b}
.cobc-cols{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:10px;font-size:13px}
.cobc-cols ul{margin:6px 0 0;padding-left:18px}
.cobc-check{display:flex;gap:8px;align-items:center;font-size:13px;margin-top:10px}
.cobc-btns{display:flex;gap:10px;margin-top:14px}
@media(max-width:900px){.cobc-cols{grid-template-columns:1fr}}`;
    document.head.appendChild(s);
  }
});

// ============================================================
// requisicion-detalle.js — Costo · Precios de requisiciones · Detalle.
// Una requisicion de Co-Pack: ciclo Recibida → Calculada → Aprobada → Enviada,
// metricas, partidas con el color de su regla, editar precio (con motivo),
// lotes de almacen (mismo Excel con lotes), calcular, aprobar y Excel.
// Endpoints: GET  /protected/cto/requisiciones/:id
//            POST /protected/cto/requisiciones/:id/{calcular|lotes|aprobar|enviada}
//            PATCH /protected/cto/requisiciones/:id/partidas/:pid
//            GET  /protected/cto/requisiciones/:id/export (xlsx)
// Logica pura: requisiciones-comun.js (window.CtoReq).
// Prueba: tests/cto-requisicion-detalle-render.test.mjs
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const LISTA = '/modules/cto/requisiciones.html';
  const BASE = '/protected/cto/requisiciones';
  const R = window.CtoReq;
  const ir = (u) => (window.__kogu_ir || ((x) => { window.location.href = x; }))(u);

  const b = await KoguShell.initShell({
    currentPage: LISTA,
    title: 'Requisición',
    description: 'Precios asignados a una requisición de Co-Pack.',
    requiredPermission: 'screen.cto.requisiciones',
  });
  if (!b) return;

  const puedeEscribir = KoguShell.hasPerm(b, 'cto.requisiciones.write');
  const puedeAprobar = KoguShell.hasPerm(b, 'cto.requisiciones.aprobar');
  const esc = (s) => KoguUi.escapeHtml(s);
  const $ = (id) => document.getElementById(id);
  const id = new URLSearchParams(window.location.search).get('id') || '';
  let D = null;
  let editando = null;

  if (!document.getElementById('estiloReq')) {
    const st = document.createElement('style'); st.id = 'estiloReq';
    st.textContent = `
      /* styles.css fija .table-wrap table{table-layout:fixed}: con columnas de ancho fijo el texto se encimaba */
      .table-wrap table.req-tabla{table-layout:auto;width:max-content;min-width:100%;font-size:12.5px;font-variant-numeric:tabular-nums}
      .table-wrap .req-tabla th,.table-wrap .req-tabla td{word-break:normal;overflow-wrap:normal;white-space:nowrap;padding:7px 9px;vertical-align:top}
      .req-tabla td.num{text-align:right}
      .req-tabla td.wrap{white-space:normal;min-width:160px;max-width:260px}
      .req-tabla tr.req-exacta td:first-child{box-shadow:inset 4px 0 #70ad47}
      .req-tabla tr.req-variante td:first-child{box-shadow:inset 4px 0 #8064a2}
      .req-tabla tr.req-pactado td:first-child{box-shadow:inset 4px 0 #5b9bd5}
      .req-tabla tr.req-ultima_compra td:first-child{box-shadow:inset 4px 0 #f4b183}
      .req-tabla tr.req-sin_coincidencia td{background:#fff1f1}
      .req-tabla tr.req-pendiente_lote td,.req-tabla tr.req-sin_cantidad td{background:#f4f5f7;color:var(--muted)}
      .req-chip{display:inline-block;font-size:11px;font-weight:600;padding:2px 8px;border-radius:999px;background:#eef2f7}
      .req-chip.exacta{background:#e2efda;color:#375623}.req-chip.variante{background:#e4dfec;color:#3f3151}
      .req-chip.pactado{background:#ddebf7;color:#1f4e78}.req-chip.ultima_compra{background:#fce4d6;color:#843c0c}
      .req-chip.sin_coincidencia{background:#ffd7d7;color:#9c0006}.req-chip.pendiente_lote,.req-chip.sin_cantidad{background:#e7e9ee;color:#475569}
      .req-aviso{display:inline-block;font-size:11px;padding:1px 6px;margin:1px 3px 1px 0;border-radius:6px;background:#f1f5f9;color:#475569}
      .req-aviso.revisar{background:#fff4ce;color:#7a5b00}
      .req-final.manual{color:#9c0006;font-weight:700}
      .req-editor td{background:#f8fafc}
      .req-editor .input{max-width:140px}
      .req-acciones{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
      .req-msg:empty{display:none}
      .req-msg{margin-top:10px;padding:10px 12px;border-radius:10px;background:#fff4ce;color:#7a5b00;font-size:13px}
      .req-avisos:empty{display:none}
      .req-avisos{margin-top:10px;padding:10px 12px;border-radius:10px;background:#fff4ce;color:#7a5b00;font-size:13px}
      #reqPasos.ot-stepper{max-width:520px}`;
    document.head.appendChild(st);
  }

  const c = $('pageContent');
  c.innerHTML = `
<div class="card">
  <div class="row" style="align-items:flex-start;gap:24px;flex-wrap:wrap;justify-content:space-between">
    <div style="flex:1 1 320px">
      <div class="eyebrow">Costo · Precios de requisiciones</div>
      <h2 id="reqTitulo" style="margin:0">Requisición</h2>
      <div id="reqChips" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px"></div>
    </div>
    <div id="reqPasos" class="ot-stepper" style="flex:1 1 360px"></div>
  </div>
  <div id="reqMetricas" class="ot-metrics"></div>
  <div id="reqAvisos" class="req-avisos"></div>
  <div id="reqAcciones" class="req-acciones" style="margin-top:14px"></div>
  <div id="reqMsg" class="req-msg"></div>
</div>
<div class="card" style="margin-top:14px">
  <div class="table-wrap"><table class="req-tabla">
    <thead><tr>
      <th>#</th><th>Código</th><th>Lote</th><th>Cantidad</th><th>Tipo</th><th>Producto usado</th><th>Entrada usada</th>
      <th>Costo</th><th>Sugerido</th><th>Precio final</th><th>IVA</th><th>Avisos</th><th>Motivo</th><th></th>
    </tr></thead>
    <tbody id="reqTabla"></tbody>
  </table></div>
  <div class="muted" style="font-size:12px;margin-top:8px">Precio sugerido = costo de la entrada × (1 + margen). El precio pactado no lleva margen. En rojo: precio editado a mano.</div>
</div>`;

  const msg = (t) => { $('reqMsg').textContent = t || ''; };

  if (!id) { msg('Falta la requisición: ábrela desde la lista de requisiciones.'); return; }

  async function cargar() {
    try {
      const res = await KoguApi.apiFetch(`${BASE}/${encodeURIComponent(id)}`);
      D = res?.data ?? res;
      editando = null;
      render();
    } catch (e) {
      msg(e.message || 'No se pudo cargar la requisición.');
    }
  }

  function render() {
    const r = D.requisicion;
    const ps = D.partidas || [];
    const s = R.resumen(ps);
    const abierta = R.abierta(r.status);
    const calculada = ps.some((p) => p.regla);

    $('reqTitulo').textContent = `Requisición ${r.num_requisicion}`;
    $('reqChips').innerHTML = [
      `<span class="badge ${R.badgeStatus(r.status)}">${esc(R.etiquetaStatus(r.status))}</span>`,
      `<span class="badge neutral">${esc(r.solicitante || '—')}</span>`,
      `<span class="badge neutral">Recibida ${esc(R.fmtFecha(r.fecha_recepcion))}</span>`,
      r.archivo_nombre ? `<span class="badge neutral" title="Archivo cargado">${esc(r.archivo_nombre)}</span>` : '',
    ].join('');

    const idx = R.PASOS.indexOf(r.status);
    $('reqPasos').innerHTML = R.PASOS.map((p, i) => {
      const cls = i < idx ? 'done' : (i === idx ? 'current actual' : '');
      const linea = i < R.PASOS.length - 1 ? `<div class="ot-line ${i < idx ? 'done' : ''}"></div>` : '';
      return `<div class="ot-step paso ${cls}"><div class="ot-dot">${i < idx ? '✓' : i + 1}</div><div class="ot-lbl">${esc(R.etiquetaStatus(p))}</div></div>${linea}`;
    }).join('');

    const m = (v, k) => `<div class="ot-metric"><div class="m-v">${esc(v)}</div><div class="m-k">${esc(k)}</div></div>`;
    $('reqMetricas').innerHTML = [
      m(s.total, 'partidas'),
      calculada ? m(s.con_precio, 'con precio') : m('—', 'Sin calcular'),
      m(s.pendientes_lote, 'pendientes de lote'),
      m(s.manuales, s.manuales === 1 ? 'editada a mano' : 'editadas a mano'),
      r.kardex_hasta ? m(`Kardex al ${R.fmtFecha(r.kardex_hasta)}`, `Margen ${Math.round(Number(r.margen_aplicado) * 100)}%`)
        : m('Sin calcular', 'kardex y margen se fijan al calcular'),
    ].join('');
    $('reqMetricas').style.gridTemplateColumns = 'repeat(5,1fr)';

    $('reqAvisos').innerHTML = (r.avisos || []).map((a) => `<div>⚠ ${esc(a.message || a.code)}</div>`).join('');

    const acc = [];
    if (abierta && puedeEscribir) {
      acc.push(`<button class="btn primary" id="btnCalcular">${calculada ? 'Recalcular' : 'Calcular precios'}</button>`);
      acc.push(`<label class="btn ghost" style="cursor:pointer" title="Sube el Excel con los lotes que asignó almacén (mismo orden de renglones)">
        Cargar lotes de almacén<input type="file" id="inpLotes" accept=".xlsx,.xls" style="display:none"/></label>`);
    }
    if (puedeAprobar && r.status === 'calculada') acc.push('<button class="btn" id="btnAprobar">Aprobar</button>');
    if (puedeAprobar && r.status === 'aprobada') acc.push('<button class="btn" id="btnEnviada">Marcar como enviada</button>');
    acc.push('<button class="btn ghost" id="btnExcel">Descargar Excel</button>');
    acc.push(`<a class="btn ghost" href="${LISTA}">← Requisiciones</a>`);
    $('reqAcciones').innerHTML = acc.join('');

    $('reqTabla').innerHTML = ps.map((p) => fila(p, abierta)).join('');
    enlazar();
  }

  function fila(p, abierta) {
    const editable = abierta && puedeEscribir && !['pendiente_lote', 'sin_cantidad'].includes(p.regla);
    const avisos = (p.banderas || []).map((x) =>
      `<span class="req-aviso ${R.esAvisoRevisar(x) ? 'revisar' : ''}">${esc(R.etiquetasAvisos([x])[0])}</span>`).join('');
    const cant = p.cantidad == null ? '—' : `${Number(p.cantidad).toLocaleString('es-MX')} ${p.um || ''}`;
    return `<tr data-renglon="${p.renglon}" data-pid="${esc(p.partida_id)}" class="req-${esc(p.regla || 'sin_calcular')}">
      <td class="num">${p.renglon}</td>
      <td><b>${esc(p.cve_prod)}</b></td>
      <td>${esc(R.loteVisible(p.lote))}</td>
      <td class="num">${esc(cant)}</td>
      <td>${p.regla ? `<span class="req-chip ${esc(p.regla)}" title="${esc(R.ayudaTipo(p.regla))}">${esc(R.etiquetaTipo(p.regla))}</span>` : '<span class="muted">Sin calcular</span>'}</td>
      <td>${esc(p.cve_prod_match || '—')}</td>
      <td>${esc(R.entrada(p.mov_snapshot))}</td>
      <td class="num">${esc(R.fmtPrecio(p.costo_unit, p.moneda))}</td>
      <td class="num">${esc(R.fmtPrecio(p.precio_sugerido, p.moneda))}</td>
      <td class="num"><span class="req-final ${p.es_manual ? 'manual' : ''}">${esc(R.fmtPrecio(p.precio_final, p.moneda))}</span></td>
      <td class="num">${esc(R.fmtIva(p.iva_final))}</td>
      <td class="wrap">${avisos || '<span class="muted">—</span>'}</td>
      <td class="wrap">${esc(p.motivo_manual || '')}</td>
      <td>${editable ? `<button class="btn ghost btn-editar" data-pid="${esc(p.partida_id)}" style="padding:3px 10px">Editar</button>` : ''}</td>
    </tr>`;
  }

  function abrirEditor(pid) {
    const p = D.partidas.find((x) => x.partida_id === pid);
    if (!p) return;
    document.querySelectorAll('.req-editor').forEach((x) => x.remove());
    editando = pid;
    const tr = [...document.querySelectorAll('#reqTabla tr[data-pid]')].find((x) => x.dataset.pid === pid);
    const ed = document.createElement('tr');
    ed.className = 'req-editor';
    const ivaTxt = p.iva_final == null ? '' : String(Math.round(Number(p.iva_final) * 100));
    ed.innerHTML = `<td colspan="14">
      <div class="row" style="gap:10px;align-items:flex-end;flex-wrap:wrap">
        <div><label class="muted" style="font-size:12px;display:block">Precio final (${esc(p.moneda || '')})</label>
          <input id="edPrecio" class="input" type="number" step="0.0001" min="0" value="${p.precio_final ?? ''}"/></div>
        <div><label class="muted" style="font-size:12px;display:block">IVA %</label>
          <input id="edIva" class="input" type="text" value="${esc(ivaTxt)}" placeholder="16 o 0"/></div>
        <div style="flex:1 1 280px"><label class="muted" style="font-size:12px;display:block">Motivo (obligatorio si cambias el sugerido: ${esc(R.fmtPrecio(p.precio_sugerido, p.moneda))})</label>
          <input id="edMotivo" class="input" type="text" style="max-width:none;width:100%" value="${esc(p.motivo_manual || '')}" placeholder="p. ej. Acordado con Co-Pack"/></div>
        <button class="btn primary" id="edGuardar">Guardar</button>
        <button class="btn ghost" id="edCancelar">Cancelar</button>
      </div>
      <div id="edMsg" class="req-msg"></div>
    </td>`;
    tr.after(ed);
    $('edCancelar').addEventListener('click', () => { ed.remove(); editando = null; });
    $('edGuardar').addEventListener('click', () => guardarEdicion(p));
    $('edPrecio').focus();
  }

  async function guardarEdicion(p) {
    const precio = $('edPrecio').value;
    const motivo = $('edMotivo').value.trim();
    const err = R.validarEdicion({ precio, sugerido: p.precio_sugerido, motivo });
    if (err) { $('edMsg').textContent = err; return; }
    const iva = R.ivaDeTexto($('edIva').value);
    if (iva === null) { $('edMsg').textContent = 'IVA inválido: usa 16 o 0.'; return; }
    const body = { precio_final: R.num(precio) };
    if (iva !== undefined) body.iva_final = iva;
    if (motivo) body.motivo = motivo;
    try {
      await KoguApi.apiFetch(`${BASE}/${encodeURIComponent(id)}/partidas/${encodeURIComponent(p.partida_id)}`,
        { method: 'PATCH', body: JSON.stringify(body) });
      KoguApi.toast(`Precio de ${p.cve_prod} guardado.`, 'success');
      await cargar();
    } catch (e) { $('edMsg').textContent = e.message || 'No se pudo guardar.'; }
  }

  async function post(accion, body = {}) {
    return KoguApi.apiFetch(`${BASE}/${encodeURIComponent(id)}/${accion}`, { method: 'POST', body: JSON.stringify(body) });
  }

  async function leerExcel(file) {
    if (typeof XLSX === 'undefined') throw new Error('No cargó el lector de Excel; recarga la página.');
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false });
    const ws = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
  }

  function enlazar() {
    $('btnCalcular')?.addEventListener('click', async (ev) => {
      ev.target.disabled = true; msg('');
      try {
        const res = await post('calcular');
        const rs = (res?.data ?? res)?.resumen || {};
        const partes = Object.entries(rs).map(([k, v]) => `${v} ${R.etiquetaTipo(k).toLowerCase()}`);
        KoguApi.toast(`Precios calculados${partes.length ? ': ' + partes.join(', ') : ''}.`, 'success');
        await cargar();
      } catch (e) { msg(e.message || 'No se pudo calcular.'); ev.target.disabled = false; }
    });

    $('inpLotes')?.addEventListener('change', async (ev) => {
      const f = ev.target.files?.[0];
      if (!f) return;
      msg('');
      try {
        const rows = await leerExcel(f);
        const res = await post('lotes', { rows });
        const d = res?.data ?? res;
        KoguApi.toast(`${d.actualizadas} partidas actualizadas${d.actualizadas ? '. Recalcula para ver sus precios' : ''}.`, 'success');
        await cargar();
      } catch (e) {
        const ren = e?.details?.renglones || e?.data?.error?.details?.renglones;
        msg(`${e.message || 'No se pudieron cargar los lotes.'}${ren?.length ? ` Renglones: ${ren.join(', ')}.` : ''}`);
      } finally { ev.target.value = ''; }
    });

    $('btnAprobar')?.addEventListener('click', async (ev) => {
      const faltan = R.faltanParaAprobar(D.partidas);
      if (faltan.length) {
        msg(`No se puede aprobar: faltan precio los renglones ${faltan.join(', ')} (lote pendiente de almacén o sin coincidencia en el kardex).`);
        return;
      }
      ev.target.disabled = true; msg('');
      try { await post('aprobar'); KoguApi.toast(`Requisición ${D.requisicion.num_requisicion} aprobada.`, 'success'); await cargar(); }
      catch (e) { msg(e.message || 'No se pudo aprobar.'); ev.target.disabled = false; }
    });

    $('btnEnviada')?.addEventListener('click', async (ev) => {
      ev.target.disabled = true;
      try { await post('enviada'); KoguApi.toast('Marcada como enviada a Co-Pack.', 'success'); await cargar(); }
      catch (e) { msg(e.message || 'No se pudo marcar como enviada.'); ev.target.disabled = false; }
    });

    $('btnExcel')?.addEventListener('click', async () => {
      try {
        const res = await KoguApi.authFetchRaw(`${BASE}/${encodeURIComponent(id)}/export`);
        if (!res.ok) throw new Error('No se pudo generar el Excel.');
        const url = URL.createObjectURL(await res.blob());
        const a = document.createElement('a');
        a.href = url; a.download = `RESULTADO_REQUISICION_${D?.requisicion?.num_requisicion || id}.xlsx`;
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(url);
      } catch (e) { KoguApi.toast(e.message, 'error'); }
    });

    document.querySelectorAll('.btn-editar').forEach((btn) =>
      btn.addEventListener('click', () => abrirEditor(btn.dataset.pid)));
  }

  // La requisicion es de la empresa activa: si cambia, regresar a la lista.
  KoguShell.subscribeEmpresaActivaChange?.(() => ir(LISTA));
  await cargar();
});

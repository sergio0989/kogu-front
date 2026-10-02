// ============================================================
// modules/rpt/programaciones.js — Reportes programados (solo admin)
// Lista + editor + vista previa + activar + bitácora de envíos.
// Backend: /protected/rpt (rpt.read / rpt.manage).
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/rpt/programaciones.html';
  const BASE = '/protected/rpt';

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Reportes programados',
    description: 'Envío automático de reportes por correo, por horario o al terminar la descarga del SAT.',
    requiredPermission: 'rpt.read',
  });
  if (!b) return;

  const esc = (s) => KoguUi.escapeHtml(String(s ?? ''));
  const puedeManage = KoguShell.hasPerm(b, 'rpt.manage');
  const unwrap = (res) => (KoguApi.unwrapRows ? KoguApi.unwrapRows(res) : (res?.data ?? res ?? []));
  const api = (path, opts) => KoguApi.apiFetch(`${BASE}${path}`, opts);

  const DIAS = [[1, 'L'], [2, 'M'], [3, 'Mi'], [4, 'J'], [5, 'V'], [6, 'S'], [7, 'D']];
  const FILTROS_CFDI = {
    scope: { label: 'Ámbito', opts: [['recibidos', 'Recibidos'], ['emitidos', 'Emitidos'], ['todos', 'Todos']] },
    tipo_comprobante: { label: 'Tipo de comprobante', opts: [['', 'Todos'], ['I', 'Ingreso'], ['E', 'Egreso'], ['T', 'Traslado'], ['N', 'Nómina'], ['P', 'Pago']] },
    estatus_sat: { label: 'Estatus SAT', opts: [['', 'Todos'], ['VIGENTE', 'Vigentes'], ['CANCELADO', 'Cancelados']] },
    metodo_pago: { label: 'Método de pago', opts: [['', 'Todos'], ['PUE', 'PUE'], ['PPD', 'PPD']] },
    moneda: { label: 'Moneda', opts: [['', 'Todas'], ['MXN', 'MXN'], ['USD', 'USD'], ['OTRAS', 'Otras']] },
  };
  const STATUS_BADGE = {
    enviada: ['success', 'Enviada'], vacia_omitida: ['neutral', 'Vacía · omitida'], fallida: ['danger', 'Fallida'],
    reclamada: ['warn', 'En curso'], generando: ['warn', 'Generando'],
  };
  const DISPARO = { horario: 'Horario', evento: 'Tras descarga', evento_limite: 'Por límite', manual: 'Enviar ahora', preview: 'Vista previa' };

  let catalogo = { reportes: [], periodos: [], eventos: [] };
  let progs = [];
  let filtroBitacora = '';

  const c = document.getElementById('pageContent');
  c.innerHTML = `
<div class="stack" style="gap:16px">
  <div class="card">
    <div class="row" style="align-items:flex-start;flex-wrap:wrap">
      <div>
        <div class="eyebrow">Administración · Envíos</div>
        <h2 style="margin:2px 0 4px">Reportes programados</h2>
        <div class="muted" style="font-size:12.5px;max-width:720px">
          Cada programación genera un reporte de KOGU y lo manda por correo con el Excel adjunto.
          Nace <b>apagada</b>: manda primero una <b>vista previa</b> (te llega solo a ti) y luego actívala.
          ${puedeManage ? '' : '<br><b>Solo lectura</b> (te falta el permiso rpt.manage).'}
        </div>
      </div>
      ${puedeManage ? '<button class="btn primary" id="btnNueva">+ Nueva programación</button>' : ''}
    </div>
    <div class="grid-4" id="kpis" style="margin-top:14px"></div>
  </div>

  <div class="card">
    <div class="table-wrap"><table class="kogu-actions-table">
      <thead><tr><th>Programación</th><th>Cuándo</th><th>Destinatarios</th><th>Estado</th><th>Último envío</th><th>Acciones</th></tr></thead>
      <tbody id="rows"><tr><td colspan="6" class="empty">Cargando…</td></tr></tbody>
    </table></div>
  </div>

  <div class="card">
    <div class="row" style="flex-wrap:wrap;margin-bottom:10px">
      <div><div class="eyebrow">Bitácora</div><h3 style="margin:2px 0 0;font-size:15px">Ejecuciones recientes</h3></div>
      <div style="display:flex;gap:8px;align-items:center">
        <select class="select" id="bitProg" style="min-width:220px"><option value="">Todas las programaciones</option></select>
        <button class="btn" id="bitRefresh">Actualizar</button>
      </div>
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th>Fecha</th><th>Programación</th><th>Disparo</th><th>Periodo</th><th>Estado</th><th>Registros</th><th>Archivo / detalle</th></tr></thead>
      <tbody id="bitRows"><tr><td colspan="7" class="empty">Cargando…</td></tr></tbody>
    </table></div>
  </div>
</div>

<div class="modal-backdrop" id="modal" hidden>
  <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
    <div class="rpt-modal-head">
      <div><div class="eyebrow" id="modalEyebrow">Nueva programación</div><h3 style="margin:2px 0 0" id="modalTitle">Programar envío de reporte</h3></div>
      <button class="btn" id="modalClose" aria-label="Cerrar">✕</button>
    </div>
    <form id="form" autocomplete="off"></form>
  </div>
</div>`;

  // ── helpers de presentación ──────────────────────────────────
  const diasTxt = (d) => {
    const s = (d || []).map(Number).sort().join(',');
    if (s === '1,2,3,4,5') return 'Lunes a viernes';
    if (s === '1,2,3,4,5,6,7') return 'Todos los días';
    return (d || []).map((n) => (DIAS.find((x) => x[0] === Number(n)) || [0, '?'])[1]).join(' · ');
  };
  const cuandoTxt = (p) => p.disparador === 'evento'
    ? `<div class="rpt-cuando"><b>Tras la descarga SAT</b> de ${(p.evento_slots || []).map(esc).join(', ')}<br><small>${esc(diasTxt(p.dias_semana))} · límite ${esc(p.evento_limite_min)} min</small></div>`
    : `<div class="rpt-cuando"><b>${(p.horas || []).map(esc).join(', ')}</b><br><small>${esc(diasTxt(p.dias_semana))}</small></div>`;
  const reporteNombre = (k) => (catalogo.reportes.find((r) => r.key === k) || {}).nombre || k;
  const periodoNombre = (k) => (catalogo.periodos.find((p) => p.clave === k) || {}).etiqueta || k;
  const badge = (st) => { const [cls, txt] = STATUS_BADGE[st] || ['neutral', st || '—']; return `<span class="badge ${cls}">${esc(txt)}</span>`; };

  // ── carga ────────────────────────────────────────────────────
  async function load() {
    try {
      const [cat, rows] = await Promise.all([api('/catalogo'), api('/programaciones')]);
      catalogo = cat?.data || cat || catalogo;
      progs = unwrap(rows) || [];
    } catch (err) {
      document.getElementById('rows').innerHTML = `<tr><td colspan="6" class="empty">${esc(err.message)}</td></tr>`;
      return;
    }
    renderKpis(); renderRows(); renderBitSelect();
    await loadBitacora();
  }

  function renderKpis() {
    const activas = progs.filter((p) => p.activo).length;
    const fallidas = progs.filter((p) => p.ultima_status === 'fallida').length;
    const ult = progs.map((p) => p.ultima_iniciada_at).filter(Boolean).sort().pop();
    document.getElementById('kpis').innerHTML = [
      KoguUi.cardStat('Programaciones', KoguUi.int(progs.length), 'en esta empresa'),
      KoguUi.cardStat('Activas', KoguUi.int(activas), activas ? 'enviando solas' : 'ninguna enviando'),
      KoguUi.cardStat('Último envío', ult ? KoguUi.fmtDate(ult) : '—', 'sin contar vistas previas'),
      KoguUi.cardStat('Con falla', KoguUi.int(fallidas), fallidas ? 'revisa la bitácora' : 'todo en orden'),
    ].join('');
  }

  function renderRows() {
    const tb = document.getElementById('rows');
    if (!progs.length) {
      tb.innerHTML = `<tr><td colspan="6" class="empty">Aún no hay programaciones en esta empresa.${puedeManage ? ' Crea la primera con “+ Nueva programación”.' : ''}</td></tr>`;
      return;
    }
    tb.innerHTML = progs.map((p) => {
      const n = (p.destinatarios || []).length;
      const dest = (p.destinatarios || []).map((d) => d.email).join(', ');
      const ultimo = p.ultima_status
        ? `${badge(p.ultima_status)}<div class="muted" style="font-size:12px;margin-top:4px">${esc(KoguUi.fmtDate(p.ultima_iniciada_at))}${p.ultima_filas != null ? ` · ${esc(KoguUi.int(p.ultima_filas))} reg.` : ''}</div>`
        : '<span class="muted">Sin envíos</span>';
      const acciones = puedeManage ? `
        <button class="btn" data-act="editar" data-id="${esc(p.rpt_programacion_id)}">Editar</button>
        <button class="btn" data-act="preview" data-id="${esc(p.rpt_programacion_id)}" title="Te llega solo a ti">Vista previa</button>
        ${p.activo
          ? `<button class="btn" data-act="desactivar" data-id="${esc(p.rpt_programacion_id)}">Desactivar</button>`
          : `<button class="btn primary" data-act="activar" data-id="${esc(p.rpt_programacion_id)}">Activar</button>`}
        <button class="btn" data-act="ejecutar" data-id="${esc(p.rpt_programacion_id)}" title="Envía ya a todos los destinatarios">Enviar ahora</button>`
        : '';
      return `<tr>
        <td><b>${esc(p.nombre)}</b><div class="muted" style="font-size:12px">${esc(reporteNombre(p.reporte_key))} · ${esc(periodoNombre(p.parametros?.periodo || 'hoy'))}</div></td>
        <td>${cuandoTxt(p)}</td>
        <td title="${esc(dest)}">${esc(n)} correo${n === 1 ? '' : 's'}<div class="muted" style="font-size:12px;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(dest)}</div></td>
        <td>${p.activo ? '<span class="badge success">Activa</span>' : '<span class="badge neutral">Apagada</span>'}</td>
        <td>${ultimo}</td>
        <td class="actions-cell">${acciones}<button class="btn" data-act="bitacora" data-id="${esc(p.rpt_programacion_id)}">Bitácora</button></td>
      </tr>`;
    }).join('');
  }

  function renderBitSelect() {
    const sel = document.getElementById('bitProg');
    sel.innerHTML = '<option value="">Todas las programaciones</option>' +
      progs.map((p) => `<option value="${esc(p.rpt_programacion_id)}">${esc(p.nombre)}</option>`).join('');
    sel.value = filtroBitacora;
  }

  async function loadBitacora() {
    const tb = document.getElementById('bitRows');
    try {
      const q = KoguUi.queryParams({ programacion_id: filtroBitacora, limit: 100 });
      const rows = unwrap(await api(`/ejecuciones?${q}`)) || [];
      if (!rows.length) { tb.innerHTML = '<tr><td colspan="7" class="empty">Sin ejecuciones todavía.</td></tr>'; return; }
      tb.innerHTML = rows.map((e) => {
        const periodo = e.periodo_desde ? (e.periodo_desde === e.periodo_hasta
          ? KoguUi.fmtDateOnly(e.periodo_desde)
          : `${KoguUi.fmtDateOnly(e.periodo_desde)} – ${KoguUi.fmtDateOnly(e.periodo_hasta)}`) : '—';
        const incompleta = e.corrida_completa === false
          ? `<div style="color:#b45309;font-size:12px">Descarga incompleta: falta ${esc((e.detalle_corrida?.faltantes || []).join(' y '))}</div>` : '';
        const detalle = e.error
          ? `<div style="color:#b91c1c;font-size:12px;max-width:320px">${esc(e.error)}</div>`
          : `<div style="font-size:12px">${esc(e.archivo_nombre || '—')}${e.archivo_bytes ? ` <span class="muted">· ${(e.archivo_bytes / 1024).toFixed(0)} KB</span>` : ''}</div>`;
        return `<tr>
          <td style="white-space:nowrap">${esc(KoguUi.fmtDate(e.iniciada_at))}</td>
          <td>${esc(e.programacion_nombre)}</td>
          <td>${esc(DISPARO[e.disparo] || e.disparo)}</td>
          <td>${esc(periodo)}</td>
          <td>${badge(e.status)}</td>
          <td>${e.filas != null ? esc(KoguUi.int(e.filas)) : '—'}</td>
          <td>${detalle}${incompleta}</td>
        </tr>`;
      }).join('');
    } catch (err) {
      tb.innerHTML = `<tr><td colspan="7" class="empty">${esc(err.message)}</td></tr>`;
    }
  }

  // ── editor ───────────────────────────────────────────────────
  const modal = document.getElementById('modal');
  const form = document.getElementById('form');
  let editId = null;

  function selectHtml(name, opts, val) {
    return `<select class="select" name="${name}">${opts.map(([v, t]) => `<option value="${esc(v)}" ${String(val ?? '') === v ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
  }

  function abrirEditor(p = null) {
    editId = p?.rpt_programacion_id || null;
    const d = p || {
      nombre: '', reporte_key: catalogo.reportes[0]?.key || '', parametros: { scope: 'recibidos', periodo: 'hoy' },
      disparador: 'horario', dias_semana: [1, 2, 3, 4, 5], horas: ['09:45', '14:30'],
      evento_slots: ['09:00', '14:00'], evento_limite_min: 120, destinatarios: [], asunto: '', enviar_si_vacio: true,
    };
    const par = d.parametros || {};
    document.getElementById('modalEyebrow').textContent = editId ? 'Editar programación' : 'Nueva programación';
    document.getElementById('modalTitle').textContent = editId ? d.nombre : 'Programar envío de reporte';

    form.innerHTML = `
      <div class="grid-2" style="gap:14px">
        <div><div class="label-text">Nombre</div><input class="input" name="nombre" maxlength="150" value="${esc(d.nombre)}" placeholder="CFDI recibidos del día — Finanzas" required></div>
        <div><div class="label-text">Reporte</div>${selectHtml('reporte_key', catalogo.reportes.map((r) => [r.key, r.nombre]), d.reporte_key)}</div>
      </div>

      <div class="rpt-sec"><h4>Qué incluye</h4>
        <div class="grid-3" style="gap:12px">
          <div><div class="label-text">Periodo</div>${selectHtml('periodo', catalogo.periodos.map((x) => [x.clave, x.etiqueta]), par.periodo || 'hoy')}
            <div class="muted" style="font-size:11.5px;margin-top:3px">Se calcula al enviar, en hora de México.</div></div>
          ${Object.entries(FILTROS_CFDI).map(([k, f]) => `<div><div class="label-text">${esc(f.label)}</div>${selectHtml(`f_${k}`, f.opts, par[k] ?? (k === 'scope' ? 'recibidos' : ''))}</div>`).join('')}
        </div>
      </div>

      <div class="rpt-sec"><h4>Cuándo se envía</h4>
        <div class="rpt-disp">
          <label><input type="radio" name="disparador" value="horario" ${d.disparador !== 'evento' ? 'checked' : ''}> <b>A horas fijas</b>
            <small>Sale a la hora indicada aunque la descarga del SAT no haya terminado.</small></label>
          <label><input type="radio" name="disparador" value="evento" ${d.disparador === 'evento' ? 'checked' : ''}> <b>Al terminar la descarga del SAT</b>
            <small>Espera a que la descarga automática termine. Si no termina a tiempo, sale al límite con un aviso.</small></label>
        </div>
        <div style="margin-top:12px"><div class="label-text">Días</div>
          <div class="rpt-dias">${DIAS.map(([n, t]) => `<label class="rpt-dia"><input type="checkbox" name="dia" value="${n}" ${(d.dias_semana || []).map(Number).includes(n) ? 'checked' : ''}> ${t}</label>`).join('')}</div>
        </div>
        <div class="grid-2" style="gap:12px;margin-top:12px" id="boxHorario">
          <div><div class="label-text">Horas de envío</div><input class="input" name="horas" value="${esc((d.horas || []).join(', '))}" placeholder="09:45, 14:30">
            <div class="muted" style="font-size:11.5px;margin-top:3px">Formato 24 h, separadas por coma.</div></div>
        </div>
        <div class="grid-2" style="gap:12px;margin-top:12px" id="boxEvento">
          <div><div class="label-text">Descargas a esperar</div><input class="input" name="evento_slots" value="${esc((d.evento_slots || []).join(', '))}" placeholder="09:00, 14:00">
            <div class="muted" style="font-size:11.5px;margin-top:3px">Horarios de la descarga automática del SAT.</div></div>
          <div><div class="label-text">Esperar como máximo (minutos)</div><input class="input" type="number" min="15" max="480" step="5" name="evento_limite_min" value="${esc(d.evento_limite_min || 120)}"></div>
        </div>
      </div>

      <div class="rpt-sec"><h4>A quién</h4>
        <div class="grid-2" style="gap:12px">
          <div><div class="label-text">Correos de destino</div>
            <textarea class="input" name="destinatarios" rows="4" placeholder="finanzas@empresa.com&#10;cxp@empresa.com">${esc((d.destinatarios || []).map((x) => x.email).join('\n'))}</textarea>
            <div class="muted" style="font-size:11.5px;margin-top:3px">Uno por renglón o separados por coma. Pueden no ser usuarios de KOGU.</div></div>
          <div><div class="label-text">Asunto (opcional)</div>
            <input class="input" name="asunto" maxlength="200" value="${esc(d.asunto || '')}" placeholder="CFDI recibidos {empresa} · {periodo} · {filas} comprobantes">
            <div class="muted" style="font-size:11.5px;margin-top:3px">Puedes usar <code>{empresa}</code> <code>{periodo}</code> <code>{filas}</code> <code>{reporte}</code>.</div>
            <label style="display:flex;gap:6px;align-items:center;margin-top:12px;font-size:13px"><input type="checkbox" name="enviar_si_vacio" ${d.enviar_si_vacio !== false ? 'checked' : ''}> Enviar aunque no haya registros</label>
          </div>
        </div>
      </div>

      <div class="rpt-err" id="formErr"></div>
      <div class="row" style="margin-top:14px;justify-content:flex-end">
        <button type="button" class="btn" id="btnCancel">Cancelar</button>
        <button type="submit" class="btn primary" id="btnSave">${editId ? 'Guardar cambios' : 'Crear programación'}</button>
      </div>`;

    const toggle = () => {
      const ev = form.querySelector('input[name="disparador"]:checked').value === 'evento';
      // .grid-2 fija display:grid y le gana al atributo hidden: se usa style.display.
      form.querySelector('#boxHorario').style.display = ev ? 'none' : '';
      form.querySelector('#boxEvento').style.display = ev ? '' : 'none';
    };
    form.querySelectorAll('input[name="disparador"]').forEach((r) => r.addEventListener('change', toggle));
    toggle();
    form.querySelector('#btnCancel').onclick = cerrarEditor;
    modal.hidden = false;
    form.querySelector('input[name="nombre"]').focus();
  }

  function cerrarEditor() { modal.hidden = true; editId = null; }
  document.getElementById('modalClose').onclick = cerrarEditor;
  modal.addEventListener('click', (e) => { if (e.target === modal) cerrarEditor(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) cerrarEditor(); });

  const lista = (s) => String(s || '').split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);

  function leerForm() {
    const fd = new FormData(form);
    const parametros = { periodo: fd.get('periodo') };
    for (const k of Object.keys(FILTROS_CFDI)) { const v = fd.get(`f_${k}`); if (v) parametros[k] = v; }
    const disparador = fd.get('disparador');
    return {
      nombre: fd.get('nombre'),
      reporte_key: fd.get('reporte_key'),
      parametros,
      disparador,
      dias_semana: fd.getAll('dia').map(Number),
      horas: disparador === 'horario' ? lista(fd.get('horas')) : [],
      evento_key: disparador === 'evento' ? 'cfdi.descarga_completada' : null,
      evento_slots: disparador === 'evento' ? lista(fd.get('evento_slots')) : [],
      evento_limite_min: Number(fd.get('evento_limite_min') || 120),
      destinatarios: lista(fd.get('destinatarios')).map((email) => ({ email })),
      asunto: fd.get('asunto') || null,
      enviar_si_vacio: fd.get('enviar_si_vacio') === 'on',
    };
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errBox = form.querySelector('#formErr');
    errBox.textContent = '';
    const btn = form.querySelector('#btnSave');
    try {
      await KoguUi.withLoading(btn, async () => {
        const body = JSON.stringify(leerForm());
        if (editId) await api(`/programaciones/${editId}`, { method: 'PUT', body });
        else await api('/programaciones', { method: 'POST', body });
      }, 'Guardando…');
      KoguApi.toast(editId ? 'Programación guardada' : 'Programación creada. Manda una vista previa antes de activarla.', 'success');
      cerrarEditor();
      await load();
    } catch (err) {
      errBox.textContent = err.message; // 422 del backend: dice qué corregir
    }
  });

  // ── acciones de la tabla ─────────────────────────────────────
  document.getElementById('rows').addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const id = btn.dataset.id;
    const p = progs.find((x) => x.rpt_programacion_id === id);
    const act = btn.dataset.act;

    if (act === 'editar') return abrirEditor(p);
    if (act === 'bitacora') {
      filtroBitacora = id; renderBitSelect(); await loadBitacora();
      document.getElementById('bitRows').closest('.card').scrollIntoView({ behavior: 'smooth' });
      return;
    }
    if (act === 'ejecutar') {
      const n = (p?.destinatarios || []).length;
      if (!window.confirm(`Se enviará "${p?.nombre}" ahora mismo a ${n} correo${n === 1 ? '' : 's'}. ¿Continuar?`)) return;
    }

    const rutas = {
      preview: ['/preview', 'Generando vista previa…', 'Vista previa enviada a tu correo.'],
      ejecutar: ['/ejecutar', 'Enviando…', 'Reporte enviado a los destinatarios.'],
      activar: ['/activar', 'Activando…', 'Programación activa.'],
      desactivar: ['/desactivar', 'Desactivando…', 'Programación apagada.'],
    };
    const [ruta, cargando, ok] = rutas[act] || [];
    if (!ruta) return;
    try {
      const res = await KoguUi.withLoading(btn, () => api(`/programaciones/${id}${ruta}`, { method: 'POST' }), cargando);
      const r = res?.data || res || {};
      if ((act === 'preview' || act === 'ejecutar') && r.ok === false) {
        KoguApi.toast(`No se pudo generar: ${r.error || 'revisa la bitácora'}`, 'error');
      } else if (r.status === 'vacia_omitida') {
        KoguApi.toast('Sin registros en el periodo: no se envió (la programación no envía vacíos).', 'info');
      } else {
        KoguApi.toast(ok, 'success');
      }
      await load();
    } catch (err) {
      KoguApi.toast(err.message, 'error');
    }
  });

  document.getElementById('bitProg').addEventListener('change', async (e) => { filtroBitacora = e.target.value; await loadBitacora(); });
  document.getElementById('bitRefresh').addEventListener('click', loadBitacora);
  if (puedeManage) document.getElementById('btnNueva').addEventListener('click', () => abrirEditor());

  KoguShell.subscribeEmpresaActivaChange(async () => { cerrarEditor(); filtroBitacora = ''; await load(); });
  await load();
});

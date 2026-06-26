// ============================================================
// inspeccion-detalle.js
// Pantalla: Ejecución / detalle de inspección (act_inspecciones).
// Checklist por ítem (ok/observación/falla/na) + odómetro + evidencias
// (foto de cámara o archivo, por ítem o generales) + cierre con resultado
// y generación de orden correctiva.
// Endpoints: GET /inspecciones/:id, PUT /inspecciones/:id,
//   POST /inspecciones/:id/respuestas|evidencias|cerrar,
//   GET/DELETE /inspeccion-evidencias/:id[/archivo]
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const b = await KoguShell.initShell({
    currentPage:        '/modules/act/inspecciones.html',
    title:              'Inspección',
    description:        'Ejecución del checklist, evidencias y cierre.',
    requiredPermission: 'act.inspecciones.read',
  });
  if (!b) return;

  const esc = KoguUi.escapeHtml;
  const canEjecutar = KoguShell.hasPerm(b, 'act.inspecciones.ejecutar');
  const canCerrar   = KoguShell.hasPerm(b, 'act.inspecciones.cerrar');

  const RES = {
    ok:          { label: 'OK',          color: '#16a34a' },
    observacion: { label: 'Observación', color: '#ca8a04' },
    falla:       { label: 'Falla',       color: '#dc2626' },
    na:          { label: 'N/A',         color: '#64748b' },
  };
  const RESULT_INSP = {
    aprobado:    { label: 'Aprobado',    color: '#16a34a' },
    condicionado:{ label: 'Condicionado',color: '#ca8a04' },
    rechazado:   { label: 'Rechazado',   color: '#dc2626' },
  };

  const params = new URLSearchParams(window.location.search);
  const inspeccionId = params.get('id');
  const pc = document.getElementById('pageContent');
  const $ = id => document.getElementById(id);
  let data = null;             // { inspeccion, respuestas, evidencias }
  const dirty = {};            // respuesta_id -> { resultado_item, comentario }

  if (!inspeccionId) {
    pc.innerHTML = `<div class="card"><div class="empty">Falta el parámetro de la inspección. <a class="link" href="/modules/act/inspecciones.html">Volver</a></div></div>`;
    return;
  }

  async function load() {
    try {
      const res = await KoguApi.apiFetch('/protected/act/inspecciones/' + encodeURIComponent(inspeccionId));
      data = KoguApi.unwrapData(res);
      render();
    } catch (_err) {
      pc.innerHTML = `<div class="card"><div class="empty">No se encontró la inspección (o es de otra empresa). <a class="link" href="/modules/act/inspecciones.html">Volver</a></div></div>`;
    }
  }

  // Descarga protegida de evidencia como blob (para <img> / abrir).
  async function evBlobUrl(evidenciaId) {
    const headers = { Authorization: 'Bearer ' + KoguApi.getToken() };
    const emp = KoguApi.getEmpresaId(); if (emp) headers['X-Empresa-Id'] = emp;
    const resp = await fetch(KoguApi.getBaseUrl() + '/protected/act/inspeccion-evidencias/' + encodeURIComponent(evidenciaId) + '/archivo', { headers });
    if (!resp.ok) throw new Error('evidencia');
    return URL.createObjectURL(await resp.blob());
  }

  function evidenciasDe(respuestaId) {
    return (data.evidencias || []).filter(e => (respuestaId ? e.respuesta_id === respuestaId : !e.respuesta_id));
  }

  function evidenciaHtml(e) {
    const isImg = (e.mime_type || '').startsWith('image/');
    return `<div class="insp-ev" data-ev="${e.evidencia_id}">
      ${isImg ? `<img data-evimg="${e.evidencia_id}" alt="evidencia" style="width:64px;height:64px;object-fit:cover;border-radius:8px;border:1px solid var(--line);background:#f1f5f9"/>`
              : `<div style="width:64px;height:64px;border-radius:8px;border:1px solid var(--line);display:flex;align-items:center;justify-content:center;background:#f8fafc;font-size:11px;color:var(--muted)">archivo</div>`}
      <div style="display:flex;flex-direction:column;gap:2px">
        <button class="link" data-evopen="${e.evidencia_id}" style="background:none;border:none;padding:0;text-align:left;font-size:12px">${esc(e.nombre_archivo_original || 'ver')}</button>
        ${canEjecutar && !cerrada() ? `<button class="link" data-evdel="${e.evidencia_id}" style="background:none;border:none;padding:0;text-align:left;font-size:12px;color:#dc2626">Eliminar</button>` : ''}
      </div>
    </div>`;
  }

  function cerrada() { return data.inspeccion.estado === 'cerrada' || data.inspeccion.estado === 'cancelada'; }

  function render() {
    const i = data.inspeccion;
    const editable = canEjecutar && !cerrada();
    const counts = { ok: 0, observacion: 0, falla: 0, na: 0 };
    (data.respuestas || []).forEach(r => { counts[r.resultado_item] = (counts[r.resultado_item] || 0) + 1; });

    const resultadoChip = i.resultado
      ? `<span class="chip" style="background:${RESULT_INSP[i.resultado].color}1a;color:${RESULT_INSP[i.resultado].color};border:1px solid ${RESULT_INSP[i.resultado].color}55">${RESULT_INSP[i.resultado].label}</span>`
      : '';

    pc.innerHTML = `
<div class="card">
  <div class="row">
    <div>
      <div class="eyebrow"><a class="link" href="/modules/act/inspecciones.html">← Inspecciones</a></div>
      <h2 style="margin:4px 0">Inspección #${esc(String(i.id_mov))} · ${esc(i.activo_codigo || '')}</h2>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:2px">
        <span class="chip">${esc((i.estado || '').replace(/_/g, ' '))}</span>${resultadoChip}
        ${i.plantilla_nombre ? `<span class="chip">${esc(i.plantilla_nombre)}</span>` : ''}
        ${i.activo_id ? `<a class="link" href="/modules/act/activo-detalle.html?id=${encodeURIComponent(i.activo_id)}">Ver activo →</a>` : ''}
      </div>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      ${editable ? '<button class="btn primary" id="saveBtn">Guardar checklist</button>' : ''}
      ${canCerrar && i.estado === 'en_proceso' ? '<button class="btn primary" id="cerrarBtn">Cerrar inspección</button>' : ''}
    </div>
  </div>
  <div class="ot-metrics">
    <div class="ot-metric"><div class="m-k">Odómetro</div><div class="m-v">${i.odometro != null ? esc(String(i.odometro)) + ' ' + esc(i.odometro_unidad || '') : '—'}</div></div>
    <div class="ot-metric"><div class="m-k">Fecha</div><div class="m-v">${i.fecha ? esc(KoguUi.fmtDateOnly(i.fecha)) : '—'}</div></div>
    <div class="ot-metric"><div class="m-k">Inspector</div><div class="m-v">${i.inspector_nombre ? esc(i.inspector_nombre) : '—'}</div></div>
    <div class="ot-metric"><div class="m-k">Hallazgos</div><div class="m-v">${counts.falla} falla(s)</div></div>
  </div>
</div>

<div class="card" style="margin-top:14px">
  <div class="eyebrow">Encabezado</div>
  <div class="grid-3" style="margin-top:10px">
    <div><div class="label-text">Odómetro</div><input class="input" id="h_odo" type="number" min="0" step="0.1" ${editable ? '' : 'disabled'} value="${i.odometro != null ? esc(String(i.odometro)) : ''}"/></div>
    <div><div class="label-text">Unidad</div><select class="select" id="h_unidad" ${editable ? '' : 'disabled'}><option value="km"${i.odometro_unidad === 'km' ? ' selected' : ''}>km</option><option value="hr"${i.odometro_unidad === 'hr' ? ' selected' : ''}>hr</option></select></div>
    <div><div class="label-text">Fecha</div><input class="input" id="h_fecha" type="date" ${editable ? '' : 'disabled'} value="${i.fecha ? String(i.fecha).slice(0, 10) : ''}"/></div>
  </div>
  <div style="margin-top:10px"><div class="label-text">Observaciones</div><input class="input" id="h_obs" ${editable ? '' : 'disabled'} value="${esc(i.observaciones || '')}"/></div>
</div>

<div class="card" style="margin-top:14px">
  <div class="eyebrow">Checklist</div>
  <div class="stack" style="margin-top:12px">
    ${(data.respuestas || []).length ? data.respuestas.map(r => itemHtml(r, editable)).join('') : '<div class="empty">Esta inspección no tiene ítems. (Se crea desde una plantilla.)</div>'}
  </div>
</div>

<div class="card" style="margin-top:14px">
  <div class="row"><div class="eyebrow">Evidencias generales</div>
    ${editable ? `<label class="btn ghost" style="cursor:pointer">+ Foto / archivo<input type="file" accept="image/*,application/pdf" capture="environment" data-evup="" style="display:none"/></label>` : '<div></div>'}
  </div>
  <div class="insp-ev-wrap" id="evGen" style="margin-top:12px;display:flex;gap:12px;flex-wrap:wrap">${evidenciasDe(null).map(evidenciaHtml).join('') || '<span class="muted">Sin evidencias generales.</span>'}</div>
</div>`;

    bind(editable);
    paintThumbs();
  }

  function itemHtml(r, editable) {
    const cur = (dirty[r.respuesta_id] && dirty[r.respuesta_id].resultado_item) || r.resultado_item || 'na';
    const com = (dirty[r.respuesta_id] && dirty[r.respuesta_id].comentario != null) ? dirty[r.respuesta_id].comentario : (r.comentario || '');
    const btns = Object.keys(RES).map(k => {
      const on = cur === k;
      const c = RES[k].color;
      return `<button class="btn ghost insp-rb" data-r="${r.respuesta_id}" data-v="${k}" ${editable ? '' : 'disabled'}
        style="${on ? `background:${c}1a;color:${c};border-color:${c}` : ''}">${RES[k].label}</button>`;
    }).join('');
    const evs = evidenciasDe(r.respuesta_id);
    return `<div class="card" style="padding:12px;box-shadow:none;border:1px solid var(--line)">
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap">
        <div style="font-weight:600">${r.obligatorio ? '<span style="color:#dc2626">*</span> ' : ''}${esc(r.texto_item)}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">${btns}</div>
      </div>
      <input class="input insp-com" data-r="${r.respuesta_id}" placeholder="Comentario (opcional)" ${editable ? '' : 'disabled'} value="${esc(com)}" style="margin-top:8px"/>
      <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin-top:8px">
        ${evs.map(evidenciaHtml).join('')}
        ${editable ? `<label class="btn ghost" style="cursor:pointer;font-size:12px">+ Foto<input type="file" accept="image/*,application/pdf" capture="environment" data-evup="${r.respuesta_id}" style="display:none"/></label>` : ''}
      </div>
    </div>`;
  }

  async function paintThumbs() {
    const imgs = pc.querySelectorAll('[data-evimg]');
    for (const img of imgs) {
      try { img.src = await evBlobUrl(img.dataset.evimg); } catch (_e) {}
    }
  }

  function bind(editable) {
    if (editable) {
      pc.querySelectorAll('.insp-rb').forEach(btn => btn.onclick = () => {
        const id = btn.dataset.r;
        dirty[id] = dirty[id] || {};
        dirty[id].resultado_item = btn.dataset.v;
        render();
      });
      pc.querySelectorAll('.insp-com').forEach(inp => inp.oninput = () => {
        const id = inp.dataset.r;
        dirty[id] = dirty[id] || {};
        dirty[id].comentario = inp.value;
      });
      pc.querySelectorAll('[data-evup]').forEach(inp => inp.onchange = () => subirEvidencia(inp.dataset.evup, inp.files[0]));
      const sb = $('saveBtn'); if (sb) sb.onclick = guardarChecklist;
    }
    const cb = $('cerrarBtn'); if (cb) cb.onclick = openCerrar;
    pc.querySelectorAll('[data-evopen]').forEach(btn => btn.onclick = async () => {
      try { window.open(await evBlobUrl(btn.dataset.evopen), '_blank'); } catch (_e) { KoguApi.toast('No se pudo abrir la evidencia.', 'error'); }
    });
    pc.querySelectorAll('[data-evdel]').forEach(btn => btn.onclick = () => borrarEvidencia(btn.dataset.evdel));
  }

  async function guardarChecklist() {
    // Persiste odómetro/observaciones (header) + respuestas modificadas.
    await KoguUi.withLoading($('saveBtn'), async () => {
      try {
        await KoguApi.apiFetch('/protected/act/inspecciones/' + encodeURIComponent(inspeccionId), {
          method: 'PUT',
          body: JSON.stringify({
            odometro: $('h_odo').value ? Number($('h_odo').value) : null,
            odometro_unidad: $('h_unidad').value,
            fecha: $('h_fecha').value || null,
            observaciones: $('h_obs').value.trim() || null,
          }),
        });
        const respuestas = Object.keys(dirty).map(id => ({
          respuesta_id: id,
          resultado_item: dirty[id].resultado_item || undefined,
          comentario: dirty[id].comentario != null ? dirty[id].comentario : undefined,
        }));
        if (respuestas.length) {
          await KoguApi.apiFetch('/protected/act/inspecciones/' + encodeURIComponent(inspeccionId) + '/respuestas', {
            method: 'POST', body: JSON.stringify({ respuestas }),
          });
        }
        for (const k of Object.keys(dirty)) delete dirty[k];
        KoguApi.toast('Checklist guardado', 'success');
        await load();
      } catch (_err) { /* apiFetch toast */ }
    }, 'Guardando…');
  }

  async function subirEvidencia(respuestaId, file) {
    if (!file) return;
    const fd = new FormData();
    fd.append('archivo', file);
    if (respuestaId) fd.append('respuesta_id', respuestaId);
    try {
      const headers = { Authorization: 'Bearer ' + KoguApi.getToken() };
      const emp = KoguApi.getEmpresaId(); if (emp) headers['X-Empresa-Id'] = emp;
      const resp = await fetch(KoguApi.getBaseUrl() + '/protected/act/inspecciones/' + encodeURIComponent(inspeccionId) + '/evidencias', {
        method: 'POST', headers, body: fd,
      });
      if (!resp.ok) { const j = await resp.json().catch(() => ({})); throw new Error(j.message || 'error'); }
      KoguApi.toast('Evidencia agregada', 'success');
      await load();
    } catch (e) { KoguApi.toast('No se pudo subir la evidencia. ' + (e.message || ''), 'error'); }
  }

  async function borrarEvidencia(id) {
    if (!window.confirm('¿Eliminar esta evidencia?')) return;
    try {
      await KoguApi.apiFetch('/protected/act/inspeccion-evidencias/' + encodeURIComponent(id), { method: 'DELETE' });
      KoguApi.toast('Evidencia eliminada', 'success');
      await load();
    } catch (_err) { /* apiFetch toast */ }
  }

  // ── Cerrar ────────────────────────────────────────────────
  function openCerrar() {
    const counts = { falla: 0, observacion: 0 };
    (data.respuestas || []).forEach(r => { if (counts[r.resultado_item] != null) counts[r.resultado_item]++; });
    const sugerido = counts.falla > 0 ? 'rechazado' : (counts.observacion > 0 ? 'condicionado' : 'aprobado');
    const overlay = document.createElement('div');
    overlay.id = 'cerrarInspModal';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:9999;display:flex;align-items:flex-start;justify-content:center;padding:40px 20px;backdrop-filter:blur(2px)';
    overlay.innerHTML = `
      <div style="width:100%;max-width:480px;background:white;border-radius:12px;box-shadow:0 20px 50px rgba(0,0,0,.3);color:#0f172a;overflow:hidden">
        <div style="padding:16px 20px;border-bottom:1px solid var(--line,#e2e8f0);display:flex;justify-content:space-between;align-items:center">
          <h2 style="margin:0;font-size:18px">Cerrar inspección</h2><button class="btn ghost" id="ciClose" style="padding:6px 10px">✕</button>
        </div>
        <div style="padding:20px"><div class="stack">
          <div class="muted" style="font-size:13px">${counts.falla} falla(s) · ${counts.observacion} observación(es).</div>
          <div><div class="label-text">Resultado</div><select class="select" id="ci_resultado">
            ${['aprobado', 'condicionado', 'rechazado'].map(r => `<option value="${r}"${r === sugerido ? ' selected' : ''}>${RESULT_INSP[r].label}${r === sugerido ? ' (sugerido)' : ''}</option>`).join('')}
          </select></div>
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer"><input type="checkbox" id="ci_correctivo" ${counts.falla > 0 ? 'checked' : ''}/> <span>Generar orden correctiva con los hallazgos en falla</span></label>
          <div id="ci_prio_wrap"><div class="label-text">Prioridad del correctivo</div><select class="select" id="ci_prio"><option value="alta" selected>alta</option><option value="media">media</option><option value="baja">baja</option></select></div>
        </div></div>
        <div style="padding:14px 20px;border-top:1px solid var(--line,#e2e8f0);display:flex;justify-content:flex-end;gap:8px">
          <button class="btn ghost" id="ciCancel">Cancelar</button><button class="btn primary" id="ciSave">Cerrar inspección</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    $('ciClose').onclick = close; $('ciCancel').onclick = close;
    $('ciSave').onclick = async () => {
      await KoguUi.withLoading($('ciSave'), async () => {
        try {
          const res = await KoguApi.apiFetch('/protected/act/inspecciones/' + encodeURIComponent(inspeccionId) + '/cerrar', {
            method: 'POST', body: JSON.stringify({
              resultado: $('ci_resultado').value,
              generar_correctivo: $('ci_correctivo').checked,
              prioridad: $('ci_prio').value,
            }),
          });
          const out = KoguApi.unwrapData(res);
          close();
          if (out && out.orden) {
            KoguApi.toast('Inspección cerrada · correctivo #' + out.orden.id_mov, 'success');
            if (window.confirm('Se generó la orden correctiva #' + out.orden.id_mov + '. ¿Abrirla?')) {
              window.location.href = '/modules/act/orden-detalle.html?id=' + encodeURIComponent(out.orden.orden_id);
              return;
            }
          } else {
            KoguApi.toast('Inspección cerrada', 'success');
          }
          await load();
        } catch (_err) { /* apiFetch toast */ }
      }, 'Cerrando…');
    };
  }

  KoguShell.subscribeEmpresaActivaChange(() => { window.location.href = '/modules/act/inspecciones.html'; });
  await load();
});

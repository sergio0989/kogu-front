// ============================================================
// lab-nc-detalle.js
// Detalle de NC con análisis editable y CAPAs como cards expandibles.
// Workflow guiado: cambiar estado / agregar CAPAs / cerrar NC / anular.
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/lab/lab-nc-detalle.html';
  const BASE = '/protected/lab/nc';
  const PERM = 'screen.lab.no_conformidades';

  const params = new URLSearchParams(window.location.search);
  const ncId   = params.get('id');
  if (!ncId) { window.location.href = '/modules/lab/lab-no-conformidades.html'; return; }

  const STATUS_NC = [
    { code: 'abierta',     label: 'Abierta',      color: '#f59e0b' },
    { code: 'en_analisis', label: 'En análisis',  color: '#3b82f6' },
    { code: 'con_capa',    label: 'Con CAPA',     color: '#8b5cf6' },
    { code: 'cerrada',     label: 'Cerrada',      color: '#16a34a' },
    { code: 'anulada',     label: 'Anulada',      color: '#94a3b8' },
  ];
  const STATUS_CAPA = [
    { code: 'planeada',   label: 'Planeada',   color: '#94a3b8' },
    { code: 'ejecutada',  label: 'Ejecutada',  color: '#3b82f6' },
    { code: 'verificada', label: 'Verificada', color: '#f59e0b' },
    { code: 'eficaz',     label: 'Eficaz',     color: '#16a34a' },
    { code: 'reabierta',  label: 'Reabierta',  color: '#f97316' },
    { code: 'anulada',    label: 'Anulada',    color: '#dc2626' },
  ];
  const TIPOS_CAPA = [
    { code: 'correctiva', label: 'Correctiva' },
    { code: 'preventiva', label: 'Preventiva' },
  ];
  const ORIGEN_LABEL = {
    resultado:         'Resultado fuera spec',
    excepcion:         'Excepción aprobada',
    rechazo:           'Rechazo de lote',
    queja_cliente:     'Queja de cliente',
    inspeccion_compra: 'Inspección de compra',
    auditoria:         'Auditoría',
  };

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Detalle de NC',
    description: 'No conformidad con sus CAPAs (acciones correctivas / preventivas).',
    requiredPermission: PERM,
  });
  if (!b) return;

  let usuarios = [];
  async function loadUsuarios() {
    try {
      const res = await KoguApi.apiFetch('/protected/core/usuarios');
      usuarios = KoguApi.unwrapRows(res) || [];
    } catch (_) { usuarios = []; }
  }

  let nc = null;
  const capasOpen = new Set();   // ids de CAPAs expandidas
  const $ = (id) => document.getElementById(id);

  const c = document.getElementById('pageContent');
  c.innerHTML = `
<div style="margin-bottom:12px">
  <button class="btn ghost" id="backBtn">← Volver a NCs</button>
</div>

<div id="ncContenido">
  <div style="text-align:center;padding:40px;color:var(--muted)">Cargando NC…</div>
</div>
  `;

  async function loadNc() {
    try {
      const res = await KoguApi.apiFetch(`${BASE}/${ncId}`);
      nc = KoguApi.unwrapData(res);
      render();
    } catch (err) {
      KoguApi.toast(err.message, 'error');
      $('ncContenido').innerHTML = `<div style="padding:40px;text-align:center;color:var(--danger)">No se pudo cargar la NC.</div>`;
    }
  }

  function render() {
    if (!nc) return;
    const st = STATUS_NC.find(s => s.code === nc.status) || { label: nc.status, color: '#64748b' };
    const origen = ORIGEN_LABEL[nc.origen] || nc.origen;
    const readonly = ['cerrada', 'anulada'].includes(nc.status);

    $('ncContenido').innerHTML = `
<!-- Cabecera -->
<div class="card">
  <div class="row">
    <div>
      <div class="eyebrow">Lab QA · NC</div>
      <h2 style="margin:4px 0 0 0;font-family:monospace">${escapeHtml(nc.folio_nc)}</h2>
      <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;align-items:center">
        <span class="chip" style="background:${st.color}22;color:${st.color}">${st.label}</span>
        <span class="chip" style="background:#f1f5f9">${escapeHtml(origen)}</span>
      </div>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end" id="accionesNc"></div>
  </div>

  <div class="grid-2" style="margin-top:18px;gap:10px;font-size:13px">
    ${nc.numero_lote ? `<div><strong>Lote:</strong> ${escapeHtml(nc.numero_lote)}
      ${nc.cve_prod ? `<div class="muted" style="font-size:12px">${escapeHtml(nc.cve_prod)} — ${escapeHtml(nc.desc_prod || '')}</div>` : ''}
    </div>` : ''}
    ${nc.cliente_nombre ? `<div><strong>Cliente:</strong> ${escapeHtml(nc.cliente_nombre)}<br><span class="muted" style="font-size:12px">${escapeHtml(nc.cliente_rfc || '')}</span></div>` : ''}
    ${nc.proveedor_nombre ? `<div><strong>Proveedor:</strong> ${escapeHtml(nc.proveedor_nombre)}<br><span class="muted" style="font-size:12px">${escapeHtml(nc.proveedor_rfc || '')}</span></div>` : ''}
    ${nc.parametro_clave ? `<div><strong>Parámetro:</strong> ${escapeHtml(nc.parametro_clave)} — ${escapeHtml(nc.parametro_nombre || '')}</div>` : ''}
    <div><strong>Apertura:</strong> ${fmtDate(nc.fecha_apertura)}</div>
    ${nc.fecha_compromiso ? `<div><strong>Compromiso:</strong> ${fmtDate(nc.fecha_compromiso)}</div>` : ''}
    ${nc.fecha_cierre ? `<div><strong>Cierre:</strong> ${fmtDate(nc.fecha_cierre)}</div>` : ''}
    ${nc.responsable_nombre ? `<div><strong>Responsable:</strong> ${escapeHtml(nc.responsable_nombre)}<br><span class="muted" style="font-size:11px">${escapeHtml(nc.responsable_email || '')}</span></div>` : ''}
    ${nc.creador_nombre ? `<div class="muted" style="font-size:12px"><strong>Creada por:</strong> ${escapeHtml(nc.creador_nombre)} · ${new Date(nc.created_at).toLocaleString()}</div>` : ''}
  </div>

  ${nc.status === 'anulada' && nc.motivo_anulacion ? `
    <div style="margin-top:14px;padding:10px;background:#fee2e2;color:#991b1b;border-radius:6px;font-size:13px">
      <strong>Motivo de anulación:</strong> ${escapeHtml(nc.motivo_anulacion)}
    </div>` : ''}
</div>

<!-- Análisis editable -->
<div class="card" style="margin-top:16px">
  <div class="row">
    <div><div class="eyebrow">Análisis</div><h3 style="margin:0">Descripción, contención y causa raíz</h3></div>
    ${!readonly ? '<button class="btn primary" id="saveAnalisisBtn">Guardar análisis</button>' : ''}
  </div>
  <div style="margin-top:14px;display:flex;flex-direction:column;gap:10px">
    <div>
      <div class="label-text">Descripción *</div>
      <textarea class="input" id="f_desc" rows="3" maxlength="2000" ${readonly ? 'readonly' : ''}>${escapeHtml(nc.descripcion || '')}</textarea>
    </div>
    <div>
      <div class="label-text">Contención (acción inmediata)</div>
      <textarea class="input" id="f_cont" rows="2" maxlength="1000" placeholder="Acción inmediata para evitar uso/expedición…" ${readonly ? 'readonly' : ''}>${escapeHtml(nc.contencion || '')}</textarea>
    </div>
    <div>
      <div class="label-text">Causa raíz (5 porqués / Ishikawa)</div>
      <textarea class="input" id="f_causa" rows="3" maxlength="2000" placeholder="Por qué ocurrió, qué causó la causa, etc." ${readonly ? 'readonly' : ''}>${escapeHtml(nc.causa_raiz || '')}</textarea>
    </div>
    <div class="grid-2" style="gap:10px">
      <div>
        <div class="label-text">Responsable</div>
        <div style="display:flex;gap:6px">
          <input class="input" id="f_respLabel" readonly placeholder="— Sin responsable —"
                 value="${escapeAttr(nc.responsable_nombre ? nc.responsable_nombre + (nc.responsable_email ? ' — ' + nc.responsable_email : '') : '')}"
                 style="flex:1;cursor:pointer;background:#f8fafc"/>
          ${!readonly ? '<button type="button" class="btn ghost" id="f_respPickBtn">Buscar…</button>' : ''}
          ${!readonly ? '<button type="button" class="btn ghost" id="f_respClearBtn" title="Limpiar">×</button>' : ''}
        </div>
        <input type="hidden" id="f_respId" value="${escapeAttr(nc.responsable_user_id || '')}"/>
      </div>
      <div>
        <div class="label-text">Fecha compromiso</div>
        <input class="input" type="date" id="f_compr" value="${escapeAttr(fmtDate(nc.fecha_compromiso))}" ${readonly ? 'readonly' : ''}/>
      </div>
      <div style="grid-column:1/-1">
        <div class="label-text">Observaciones</div>
        <textarea class="input" id="f_obs" rows="2" maxlength="500" ${readonly ? 'readonly' : ''}>${escapeHtml(nc.observaciones || '')}</textarea>
      </div>
    </div>
  </div>
</div>

<!-- CAPAs -->
<div class="card" style="margin-top:16px">
  <div class="row">
    <div><div class="eyebrow">Acciones</div><h3 style="margin:0">CAPAs (correctivas / preventivas)</h3></div>
    ${!readonly ? '<button class="btn primary" id="addCapaBtn">+ Agregar CAPA</button>' : ''}
  </div>
  <div id="capasList" style="margin-top:14px;display:flex;flex-direction:column;gap:8px"></div>
</div>
    `;

    renderAccionesNc();
    renderCapas();

    if (!readonly) {
      $('saveAnalisisBtn').addEventListener('click', guardarAnalisis);
      $('f_respPickBtn')?.addEventListener('click', () => pickUsuario({
        onSelect: u => {
          $('f_respId').value = u.user_id;
          $('f_respLabel').value = u.nombre + (u.email ? ' — ' + u.email : '');
        },
      }));
      $('f_respLabel')?.addEventListener('click', () => $('f_respPickBtn')?.click());
      $('f_respClearBtn')?.addEventListener('click', () => {
        $('f_respId').value = '';
        $('f_respLabel').value = '';
      });
      $('addCapaBtn').addEventListener('click', abrirNuevaCapaModal);
    }
  }

  function renderAccionesNc() {
    const cont = $('accionesNc');
    if (!cont) return;
    const html = [];
    if (nc.status === 'abierta') {
      html.push('<button class="btn ghost" data-trans="en_analisis">Pasar a En análisis</button>');
    }
    if (nc.status === 'en_analisis' && (nc.capas_count || (nc.capas || []).length) === 0) {
      html.push('<button class="btn primary" data-cerrar="1" style="background:#16a34a">Cerrar sin CAPAs</button>');
    }
    if (nc.status === 'en_analisis' || nc.status === 'con_capa') {
      html.push('<button class="btn primary" data-cerrar="1" style="background:#16a34a">Cerrar NC</button>');
    }
    if (['abierta','en_analisis','con_capa','cerrada'].includes(nc.status)) {
      html.push('<button class="btn ghost danger" data-anular="1">Anular NC</button>');
    }
    cont.innerHTML = html.join('');
    cont.querySelectorAll('button[data-trans]').forEach(b => b.addEventListener('click', () => cambiarEstado(b.dataset.trans)));
    cont.querySelectorAll('button[data-cerrar]').forEach(b => b.addEventListener('click', cerrarNc));
    cont.querySelectorAll('button[data-anular]').forEach(b => b.addEventListener('click', anularNc));
  }

  function renderCapas() {
    const list = $('capasList');
    const capas = (nc.capas || []);
    if (!capas.length) {
      list.innerHTML = '<div class="muted" style="text-align:center;padding:24px;border:1px dashed var(--line);border-radius:6px">Sin CAPAs todavía. Click en <strong>+ Agregar CAPA</strong> para registrar una acción correctiva o preventiva.</div>';
      return;
    }
    list.innerHTML = capas.map(cp => cardCapa(cp)).join('');
    list.querySelectorAll('[data-toggle-capa]').forEach(el => {
      el.addEventListener('click', ev => {
        if (ev.target.closest('button')) return;
        const id = el.dataset.toggleCapa;
        if (capasOpen.has(id)) capasOpen.delete(id);
        else                    capasOpen.add(id);
        renderCapas();
      });
    });
    list.querySelectorAll('button[data-action]').forEach(b => b.addEventListener('click', ev => {
      ev.stopPropagation();
      const accion = b.dataset.action;
      const capaId = b.dataset.capa;
      if (accion === 'ejecutar')  return abrirEjecutarModal(capaId);
      if (accion === 'verificar') return abrirVerificarModal(capaId);
      if (accion === 'cerrar')    return cerrarCapa(capaId);
      if (accion === 'anular')    return anularCapa(capaId);
      if (accion === 'editar')    return abrirEditarCapaModal(capaId);
    }));
  }

  function cardCapa(cp) {
    const isOpen = capasOpen.has(cp.capa_id);
    const st = STATUS_CAPA.find(s => s.code === cp.status) || { label: cp.status, color: '#64748b' };
    const tipo = TIPOS_CAPA.find(t => t.code === cp.tipo)?.label || cp.tipo;
    const ef = cp.eficacia && cp.eficacia !== 'pendiente'
      ? `· Eficacia: <span style="color:${cp.eficacia === 'positiva' ? '#16a34a' : '#dc2626'}">${cp.eficacia}</span>`
      : '';
    const accionesBtn = botonesCapa(cp);
    return `
      <div data-card-capa="${cp.capa_id}" style="border:1px solid var(--line);border-radius:6px;background:white;overflow:hidden">
        <div data-toggle-capa="${cp.capa_id}" style="display:flex;align-items:center;gap:10px;padding:10px 12px;cursor:pointer;user-select:none;background:${isOpen ? '#f1f5f9' : 'white'}">
          <span style="font-size:12px;color:#64748b;width:14px">${isOpen ? '▼' : '▶'}</span>
          <div style="flex:1">
            <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
              <span class="chip" style="background:${st.color}22;color:${st.color}">${st.label}</span>
              <strong>${escapeHtml(tipo)}</strong>
              <span class="muted" style="font-size:12px">${escapeHtml(truncar(cp.descripcion || '', 80))}</span>
            </div>
            <div class="muted" style="font-size:11px;margin-top:2px">
              ${cp.responsable_nombre ? `Resp: ${escapeHtml(cp.responsable_nombre)} · ` : ''}
              ${cp.fecha_compromiso ? `Compr. ${escapeHtml(fmtDate(cp.fecha_compromiso))} · ` : ''}
              ${ef}
            </div>
          </div>
          <div style="display:flex;gap:4px" data-noaccordion="1">${accionesBtn}</div>
        </div>
        ${isOpen ? `
          <div style="padding:14px;border-top:1px solid var(--line);background:#fafafa">
            <div class="grid-2" style="gap:12px;font-size:13px">
              <div style="grid-column:1/-1"><strong>Descripción completa:</strong><br>${escapeHtml(cp.descripcion || '')}</div>
              ${cp.fecha_implementacion ? `<div><strong>Implementada:</strong> ${fmtDate(cp.fecha_implementacion)}</div>` : ''}
              ${cp.fecha_verificacion ? `<div><strong>Verificada:</strong> ${fmtDate(cp.fecha_verificacion)}<br><span class="muted" style="font-size:11px">por ${escapeHtml(cp.verificador_nombre || '—')}</span></div>` : ''}
              ${cp.fecha_cierre ? `<div><strong>Cerrada:</strong> ${fmtDate(cp.fecha_cierre)}</div>` : ''}
              ${cp.evidencia_implementacion ? `<div style="grid-column:1/-1;padding:8px;background:#eff6ff;border-radius:6px"><strong>Evidencia:</strong><br>${escapeHtml(cp.evidencia_implementacion)}</div>` : ''}
              ${cp.observaciones ? `<div style="grid-column:1/-1"><span class="muted">${escapeHtml(cp.observaciones)}</span></div>` : ''}
              ${cp.status === 'anulada' && cp.motivo_anulacion ? `<div style="grid-column:1/-1;padding:8px;background:#fee2e2;color:#991b1b;border-radius:6px"><strong>Motivo de anulación:</strong> ${escapeHtml(cp.motivo_anulacion)}</div>` : ''}
            </div>
          </div>` : ''}
      </div>
    `;
  }

  function botonesCapa(cp) {
    const ro = ['cerrada','anulada'].includes(nc.status);
    if (ro) return '';
    const btns = [];
    if (cp.status === 'planeada' || cp.status === 'reabierta') {
      btns.push(`<button class="btn ghost" data-action="editar" data-capa="${cp.capa_id}" style="padding:4px 8px;font-size:12px">Editar</button>`);
      btns.push(`<button class="btn primary" data-action="ejecutar" data-capa="${cp.capa_id}" style="padding:4px 8px;font-size:12px">Ejecutar</button>`);
    }
    if (cp.status === 'ejecutada') {
      btns.push(`<button class="btn primary" data-action="verificar" data-capa="${cp.capa_id}" style="padding:4px 8px;font-size:12px">Verificar</button>`);
    }
    if (cp.status === 'verificada' && cp.eficacia === 'positiva') {
      btns.push(`<button class="btn primary" data-action="cerrar" data-capa="${cp.capa_id}" style="padding:4px 8px;font-size:12px;background:#16a34a">Cerrar (eficaz)</button>`);
    }
    if (!['eficaz','anulada'].includes(cp.status)) {
      btns.push(`<button class="btn ghost danger" data-action="anular" data-capa="${cp.capa_id}" style="padding:4px 8px;font-size:12px">Anular</button>`);
    }
    return btns.join('');
  }

  // ── Acciones de NC ────────────────────────────────────
  async function guardarAnalisis() {
    const body = {
      descripcion:         $('f_desc').value.trim(),
      contencion:          $('f_cont').value.trim() || null,
      causa_raiz:          $('f_causa').value.trim() || null,
      responsable_user_id: $('f_respId').value || null,
      fecha_compromiso:    $('f_compr').value || null,
      observaciones:       $('f_obs').value.trim() || null,
    };
    if (!body.descripcion) return KoguApi.toast('Descripción es obligatoria.', 'error');
    try {
      await KoguApi.apiFetch(`${BASE}/${ncId}`, { method: 'PUT', body: JSON.stringify(body) });
      KoguApi.toast('Análisis guardado', 'success');
      // Si NC estaba 'abierta', y guardó análisis, sugerir pasar a en_analisis
      if (nc.status === 'abierta' && (body.causa_raiz || body.responsable_user_id)) {
        if (confirm('¿Pasar la NC a "En análisis" ahora?')) {
          await cambiarEstado('en_analisis', { silent: true });
        }
      }
      await loadNc();
    } catch (err) { KoguApi.toast(err.message, 'error'); }
  }

  async function cambiarEstado(nuevo, { silent = false } = {}) {
    try {
      await KoguApi.apiFetch(`${BASE}/${ncId}/cambiar-estado`, {
        method: 'POST',
        body: JSON.stringify({ nuevo_status: nuevo }),
      });
      if (!silent) KoguApi.toast(`NC pasó a "${nuevo}"`, 'success');
      await loadNc();
    } catch (err) { KoguApi.toast(err.message, 'error'); }
  }

  async function cerrarNc() {
    if (!confirm('¿Cerrar esta NC?\n\nTodas las CAPAs deben estar en estado "eficaz" o "anulada".')) return;
    try {
      await KoguApi.apiFetch(`${BASE}/${ncId}/cerrar`, { method: 'POST', body: JSON.stringify({}) });
      KoguApi.toast('NC cerrada', 'success');
      await loadNc();
    } catch (err) { KoguApi.toast(err.message, 'error'); }
  }

  async function anularNc() {
    const motivo = prompt('Motivo de anulación (obligatorio):');
    if (motivo == null) return;
    if (!motivo.trim()) return KoguApi.toast('Motivo requerido.', 'error');
    try {
      await KoguApi.apiFetch(`${BASE}/${ncId}/anular`, {
        method: 'POST',
        body: JSON.stringify({ motivo_anulacion: motivo.trim() }),
      });
      KoguApi.toast('NC anulada', 'success');
      await loadNc();
    } catch (err) { KoguApi.toast(err.message, 'error'); }
  }

  // ── Acciones de CAPA ──────────────────────────────────
  function abrirNuevaCapaModal() {
    abrirCapaModal({ titulo: 'Nueva CAPA', initial: {}, onSubmit: async (body) => {
      try {
        const res = await KoguApi.apiFetch(`${BASE}/${ncId}/capa`, {
          method: 'POST', body: JSON.stringify(body),
        });
        const cp = KoguApi.unwrapData(res);
        KoguApi.toast('CAPA creada', 'success');
        capasOpen.add(cp.capa_id);
        await loadNc();
        return true;
      } catch (err) { KoguApi.toast(err.message, 'error'); return false; }
    } });
  }

  function abrirEditarCapaModal(capaId) {
    const cp = (nc.capas || []).find(x => x.capa_id === capaId);
    if (!cp) return;
    abrirCapaModal({ titulo: 'Editar CAPA', initial: cp, onSubmit: async (body) => {
      try {
        await KoguApi.apiFetch(`${BASE}/${ncId}/capa/${capaId}`, {
          method: 'PUT', body: JSON.stringify(body),
        });
        KoguApi.toast('CAPA actualizada', 'success');
        await loadNc();
        return true;
      } catch (err) { KoguApi.toast(err.message, 'error'); return false; }
    } });
  }

  function abrirCapaModal({ titulo, initial, onSubmit }) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;overflow:auto';
    overlay.innerHTML = `
      <div style="background:white;border-radius:8px;max-width:580px;width:100%;max-height:95vh;overflow:auto;padding:24px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px">
          <div><div class="eyebrow">CAPA</div><h2 style="margin:6px 0 0 0">${escapeHtml(titulo)}</h2></div>
          <button class="btn ghost" id="closeBtn">×</button>
        </div>
        <div class="grid-2" style="gap:10px">
          <div>
            <div class="label-text">Tipo *</div>
            <select class="select" id="c_tipo">
              <option value="">— Selecciona —</option>
              ${TIPOS_CAPA.map(t => `<option value="${t.code}" ${initial.tipo === t.code ? 'selected' : ''}>${t.label}</option>`).join('')}
            </select>
          </div>
          <div>
            <div class="label-text">Responsable</div>
            <div style="display:flex;gap:6px">
              <input class="input" id="c_respLabel" readonly
                     value="${escapeAttr(initial.responsable_nombre ? initial.responsable_nombre + (initial.responsable_email ? ' — ' + initial.responsable_email : '') : '')}"
                     placeholder="— Sin responsable —" style="flex:1;cursor:pointer;background:#f8fafc"/>
              <button type="button" class="btn ghost" id="c_respPickBtn">Buscar…</button>
              <button type="button" class="btn ghost" id="c_respClearBtn" title="Limpiar">×</button>
            </div>
            <input type="hidden" id="c_respId" value="${escapeAttr(initial.responsable_user_id || '')}"/>
          </div>
          <div style="grid-column:1/-1">
            <div class="label-text">Descripción *</div>
            <textarea class="input" id="c_desc" rows="3" maxlength="2000">${escapeHtml(initial.descripcion || '')}</textarea>
          </div>
          <div>
            <div class="label-text">Fecha compromiso</div>
            <input class="input" type="date" id="c_compr" value="${escapeAttr(fmtDate(initial.fecha_compromiso))}"/>
          </div>
          <div style="grid-column:1/-1">
            <div class="label-text">Observaciones</div>
            <textarea class="input" id="c_obs" rows="2" maxlength="500">${escapeHtml(initial.observaciones || '')}</textarea>
          </div>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:20px">
          <button class="btn ghost" id="cancelBtn">Cancelar</button>
          <button class="btn primary" id="saveBtn">Guardar</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const oQ = s => overlay.querySelector(s);
    const close = () => overlay.remove();
    overlay.addEventListener('click', ev => { if (ev.target === overlay) close(); });
    oQ('#closeBtn').addEventListener('click', close);
    oQ('#cancelBtn').addEventListener('click', close);
    oQ('#c_respPickBtn').addEventListener('click', () => pickUsuario({
      onSelect: u => {
        oQ('#c_respId').value = u.user_id;
        oQ('#c_respLabel').value = u.nombre + (u.email ? ' — ' + u.email : '');
      },
    }));
    oQ('#c_respLabel').addEventListener('click', () => oQ('#c_respPickBtn').click());
    oQ('#c_respClearBtn').addEventListener('click', () => {
      oQ('#c_respId').value = '';
      oQ('#c_respLabel').value = '';
    });
    oQ('#saveBtn').addEventListener('click', async () => {
      const body = {
        tipo:                oQ('#c_tipo').value,
        descripcion:         oQ('#c_desc').value.trim(),
        responsable_user_id: oQ('#c_respId').value || null,
        fecha_compromiso:    oQ('#c_compr').value || null,
        observaciones:       oQ('#c_obs').value.trim() || null,
      };
      if (!body.tipo)        return KoguApi.toast('Selecciona tipo.', 'error');
      if (!body.descripcion) return KoguApi.toast('Descripción requerida.', 'error');
      oQ('#saveBtn').disabled = true;
      const ok = await onSubmit(body);
      if (ok) close();
      else oQ('#saveBtn').disabled = false;
    });
  }

  function abrirEjecutarModal(capaId) {
    const fecha = prompt('Fecha de implementación (YYYY-MM-DD) — ENTER = hoy:', new Date().toISOString().slice(0, 10));
    if (fecha == null) return;
    const evidencia = prompt('Evidencia de implementación (obligatorio):');
    if (evidencia == null) return;
    if (!evidencia.trim()) return KoguApi.toast('Evidencia requerida.', 'error');
    KoguApi.apiFetch(`${BASE}/${ncId}/capa/${capaId}/ejecutar`, {
      method: 'POST',
      body: JSON.stringify({
        fecha_implementacion: fecha.trim() || new Date().toISOString().slice(0, 10),
        evidencia_implementacion: evidencia.trim(),
      }),
    })
      .then(() => { KoguApi.toast('CAPA marcada como ejecutada', 'success'); return loadNc(); })
      .catch(err => KoguApi.toast(err.message, 'error'));
  }

  function abrirVerificarModal(capaId) {
    const respuesta = prompt('Verificación de eficacia: escribe "positiva" o "negativa":');
    if (respuesta == null) return;
    const eficacia = respuesta.trim().toLowerCase();
    if (!['positiva','negativa'].includes(eficacia)) {
      return KoguApi.toast('Debe ser "positiva" o "negativa".', 'error');
    }
    const obs = prompt('Observaciones de la verificación (opcional):') || '';
    KoguApi.apiFetch(`${BASE}/${ncId}/capa/${capaId}/verificar`, {
      method: 'POST',
      body: JSON.stringify({
        eficacia,
        observaciones: obs.trim() || null,
      }),
    })
      .then(() => {
        KoguApi.toast(
          eficacia === 'positiva'
            ? 'Eficacia POSITIVA — la CAPA pasó a "verificada". Cierra cuando estés listo.'
            : 'Eficacia NEGATIVA — la CAPA se reabrió. Replanea o anula.',
          'success',
        );
        return loadNc();
      })
      .catch(err => KoguApi.toast(err.message, 'error'));
  }

  async function cerrarCapa(capaId) {
    if (!confirm('¿Cerrar esta CAPA como eficaz?\n\nLa eficacia ya debe ser "positiva".')) return;
    try {
      await KoguApi.apiFetch(`${BASE}/${ncId}/capa/${capaId}/cerrar`, { method: 'POST', body: JSON.stringify({}) });
      KoguApi.toast('CAPA cerrada (eficaz)', 'success');
      await loadNc();
    } catch (err) { KoguApi.toast(err.message, 'error'); }
  }

  async function anularCapa(capaId) {
    const motivo = prompt('Motivo de anulación (obligatorio):');
    if (motivo == null) return;
    if (!motivo.trim()) return KoguApi.toast('Motivo requerido.', 'error');
    try {
      await KoguApi.apiFetch(`${BASE}/${ncId}/capa/${capaId}/anular`, {
        method: 'POST',
        body: JSON.stringify({ motivo_anulacion: motivo.trim() }),
      });
      KoguApi.toast('CAPA anulada', 'success');
      await loadNc();
    } catch (err) { KoguApi.toast(err.message, 'error'); }
  }

  // ── Picker de usuarios ────────────────────────────────
  function pickUsuario({ onSelect }) {
    KoguUi.openSearchPicker({
      title: 'Selecciona el responsable',
      items: usuarios,
      placeholder: 'Buscar por nombre o email…',
      columns: [
        { key: 'nombre', label: 'Nombre', primary: true },
        { key: 'email',  label: 'Email' },
      ],
      emptyText: 'Sin usuarios.',
      onSelect,
    });
  }

  // ── Wiring ────────────────────────────────────────────
  $('backBtn').addEventListener('click', () => { window.location.href = '/modules/lab/lab-no-conformidades.html'; });
  KoguShell.subscribeEmpresaActivaChange(() => {
    window.location.href = '/modules/lab/lab-no-conformidades.html';
  });

  function fmtDate(v) {
    if (!v) return '';
    const s = String(v);
    const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : s;
  }
  function escapeHtml(s) { return String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m]); }
  function escapeAttr(s) { return String(s ?? '').replace(/"/g, '&quot;'); }
  function truncar(s, n) { return s && s.length > n ? s.slice(0, n - 1) + '…' : s; }

  await loadUsuarios();
  await loadNc();
});

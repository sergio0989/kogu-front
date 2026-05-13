// ============================================================
// cfdi-materialidad.js
// Detalle de materialidad por CFDI: score, evidencias directas + heredadas
// de casos, observaciones (razón de negocio).
// Sub-proyecto: materialidad-v1 — Iteración 1.
// ============================================================

const TIPO_EVIDENCIA_LABELS = {
  contrato_especifico:    'Contrato específico',
  orden_compra:           'Orden de compra',
  recepcion_fisica:       'Recepción física',
  bitacora_entrada:       'Bitácora de entrada',
  foto_recepcion:         'Foto de recepción',
  coa_lote:               'COA / Certificado de análisis',
  inspeccion_qa:          'Inspección QA',
  rep_pago:               'REP / Comprobante de pago',
  correo:                 'Correo / comunicación',
  acta_entrega:           'Acta de entrega',
  comprobante_servicio:   'Comprobante de servicio',
  reporte_actividades:    'Reporte de actividades',
  otro:                   'Otro',
};

const ORIGEN_LABELS = {
  manual:        'Manual',
  derivado_erp:  'ERP',
  derivado_lab:  'Lab QA',
  derivado_rep:  'REP',
  derivado_cfdi: 'CFDI',
};

const TIPO_OBS_LABELS = {
  razon_negocio: 'Razón de negocio',
  comentario:    'Comentario',
  aprobacion:    'Aprobación',
  rechazo:       'Rechazo',
  nota_legal:    'Nota legal',
};

document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(window.location.search);
  const cfdiId = params.get('cfdi_id');
  if (!cfdiId) {
    document.body.innerHTML = '<p style="padding:40px;text-align:center">Falta el parámetro <code>cfdi_id</code>.</p>';
    return;
  }

  const b = await KoguShell.initShell({
    currentPage:        '/modules/mat/bandeja-defensa.html',
    title:              'Materialidad del CFDI',
    description:        'Score, evidencias y observaciones (razón de negocio) para defensa fiscal.',
    requiredPermission: 'screen.mat.cfdi_detalle',
  });
  if (!b) return;

  document.getElementById('pageContent').innerHTML = `
<div class="stack">

  <!-- Header con score -->
  <div class="card">
    <div class="row">
      <div>
        <div class="eyebrow">CFDI</div>
        <h2 id="cfdiTitle">Cargando…</h2>
        <div id="cfdiSubtitle" class="muted" style="margin-top:6px"></div>
      </div>
      <div style="text-align:right;min-width:200px">
        <div class="muted" style="font-size:11px">Score de materialidad</div>
        <div id="scoreNum" style="font-size:42px;font-weight:700">—</div>
        <div id="nivelChip"></div>
        <div id="estatusChip" style="margin-top:6px"></div>
        <div id="efosChip" style="margin-top:6px"></div>
      </div>
    </div>
    <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap">
      <a class="btn" href="/modules/mat/bandeja-defensa.html">← Volver a bandeja</a>
      <button class="btn primary" id="recalcBtn">Recalcular score</button>
    </div>
    <div id="cobertura" style="margin-top:14px"></div>
  </div>

  <!-- Evidencias -->
  <div class="card">
    <div class="row">
      <div><div class="eyebrow">Evidencias</div><h2>Soporte del CFDI</h2></div>
      <button class="btn primary" id="addEvBtn">Adjuntar evidencia</button>
    </div>
    <div style="margin-top:8px" class="muted" id="evCounter"></div>
    <div class="table-wrap" style="margin-top:16px">
      <table><thead><tr>
        <th>Tipo</th><th>Origen</th><th>Caso (si hereda)</th><th>Descripción</th><th>Validado</th><th>Acciones</th>
      </tr></thead><tbody id="evRows"></tbody></table>
    </div>
  </div>

  <!-- Observaciones -->
  <div class="card">
    <div class="row">
      <div><div class="eyebrow">Bitácora</div><h2>Observaciones / Razón de negocio</h2></div>
      <button class="btn primary" id="addObsBtn">Nueva observación</button>
    </div>
    <div class="table-wrap" style="margin-top:16px">
      <table><thead><tr>
        <th>Fecha</th><th>Tipo</th><th>Autor</th><th>Texto</th>
      </tr></thead><tbody id="obsRows"></tbody></table>
    </div>
  </div>

  <!-- Modal adjuntar evidencia (con archivo) -->
  <div id="evModal" style="display:none;position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:50;align-items:center;justify-content:center;padding:20px;">
    <div class="card" style="max-width:520px;width:100%;background:#fff">
      <div class="row"><h3 style="margin:0">Adjuntar evidencia</h3><button class="btn" id="closeEvBtn">Cerrar</button></div>
      <div class="stack" style="margin-top:16px">
        <div>
          <div class="label-text">Tipo de evidencia</div>
          <select class="select" id="ev_tipo">
            <option value="">Selecciona…</option>
            ${Object.entries(TIPO_EVIDENCIA_LABELS).map(([k,v]) => `<option value="${k}">${v}</option>`).join('')}
          </select>
        </div>
        <div>
          <div class="label-text">Descripción</div>
          <input class="input" id="ev_descripcion" />
        </div>
        <div>
          <div class="label-text">Archivo (PDF, imagen, Excel, Word — máx. 25 MB)</div>
          <input class="input" id="ev_archivo" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.xlsx,.xls,.docx,.doc,.csv,.txt"/>
        </div>
        <div class="page-actions">
          <button class="btn primary" id="submitEvBtn">Subir</button>
          <button class="btn" id="cancelEvBtn">Cancelar</button>
        </div>
      </div>
    </div>
  </div>

  <!-- Modal nueva observación -->
  <div id="obsModal" style="display:none;position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:50;align-items:center;justify-content:center;padding:20px;">
    <div class="card" style="max-width:520px;width:100%;background:#fff">
      <div class="row"><h3 style="margin:0">Nueva observación</h3><button class="btn" id="closeObsBtn">Cerrar</button></div>
      <div class="stack" style="margin-top:16px">
        <div>
          <div class="label-text">Tipo</div>
          <select class="select" id="obs_tipo">
            ${Object.entries(TIPO_OBS_LABELS).map(([k,v]) => `<option value="${k}">${v}</option>`).join('')}
          </select>
        </div>
        <div>
          <div class="label-text">Texto</div>
          <textarea class="input" id="obs_texto" rows="4"></textarea>
        </div>
        <div class="page-actions">
          <button class="btn primary" id="submitObsBtn">Registrar</button>
          <button class="btn" id="cancelObsBtn">Cancelar</button>
        </div>
      </div>
    </div>
  </div>

</div>`;

  const $ = id => document.getElementById(id);

  function nivelBadge(n) {
    if (!n) return '';
    const c = n === 'BAJO' ? '#16a34a' : n === 'MEDIO' ? '#ca8a04' : n === 'ALTO' ? '#ea580c' : '#dc2626';
    return `<span class="chip" style="background:${c}1a;color:${c};border:1px solid ${c}55">${n}</span>`;
  }
  function estatusBadge(e) {
    if (!e) return '';
    const c = e === 'completo' ? '#16a34a'
            : e === 'en_armado' ? '#ca8a04'
            : e === 'requiere_aprobacion' ? '#7c3aed'
            : e === 'insuficiente' ? '#dc2626'
            : '#64748b';
    return `<span class="chip" style="background:${c}1a;color:${c};border:1px solid ${c}55">${e.replace('_',' ')}</span>`;
  }
  function efosBadge(e) {
    if (!e) return '';
    const c = e === 'definitivo' ? '#dc2626'
            : e === 'presunto'  ? '#ea580c'
            : e === 'desvirtuado' ? '#16a34a'
            : '#64748b';
    return `<span class="chip" style="background:${c}1a;color:${c};border:1px solid ${c}55">EFOS: ${e}</span>`;
  }
  function fmtDate(d){ if(!d) return ''; return new Date(d).toLocaleString('es-MX'); }

  // ── Loaders ───────────────────────────────────────────────────────────────
  async function loadScore() {
    try {
      const res = await KoguApi.apiFetch('/protected/mat/score/' + cfdiId);
      const s = KoguApi.unwrapData(res);

      $('scoreNum').textContent = s.score ?? '—';
      $('nivelChip').innerHTML  = nivelBadge(s.nivel);
      $('estatusChip').innerHTML = estatusBadge(s.estatus_defensa);
      $('efosChip').innerHTML   = efosBadge(s.riesgo_efos);

      const req  = Array.isArray(s.evidencias_requeridas) ? s.evidencias_requeridas : [];
      const pres = Array.isArray(s.evidencias_presentes)  ? s.evidencias_presentes  : [];
      const falt = Array.isArray(s.evidencias_faltantes)  ? s.evidencias_faltantes  : [];

      $('cobertura').innerHTML = `
        <div class="muted" style="font-size:12px;margin-bottom:8px">Cobertura de evidencias</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          ${pres.map(t => `<span class="chip" style="background:#16a34a1a;color:#16a34a;border:1px solid #16a34a55">✓ ${TIPO_EVIDENCIA_LABELS[t] || t}</span>`).join('')}
          ${falt.map(t => `<span class="chip" style="background:#dc26261a;color:#dc2626;border:1px solid #dc262655">✗ ${TIPO_EVIDENCIA_LABELS[t] || t}</span>`).join('')}
        </div>
        ${req.length === 0 ? '<div class="muted" style="margin-top:8px;font-size:11px">No hay reglas aplicables a este CFDI todavía. Ve a Materialidad → Reglas.</div>' : ''}
      `;
    } catch (e) {
      $('scoreNum').textContent = '—';
      $('cobertura').innerHTML = '<div class="muted" style="font-size:12px">Score aún no calculado. Presiona <strong>Recalcular score</strong>.</div>';
    }
  }

  async function loadCfdiHeader() {
    // Reusa la query de bandeja con filtro por uuid no es trivial; aprovechamos
    // que el endpoint de score ya devuelve uuid, scope y datos básicos.
    try {
      const res = await KoguApi.apiFetch('/protected/mat/score/' + cfdiId);
      const s = KoguApi.unwrapData(res);
      $('cfdiTitle').textContent = (s.uuid ? `UUID ${s.uuid}` : 'CFDI');
      $('cfdiSubtitle').textContent = (s.scope || '') + (s.uuid ? ` · ${s.uuid}` : '');
    } catch (_) {
      $('cfdiTitle').textContent = 'CFDI ' + cfdiId;
    }
  }

  async function loadEvidencias() {
    const res = await KoguApi.apiFetch('/protected/mat/cfdi/' + cfdiId + '/evidencias');
    const data = KoguApi.unwrapData(res) || {};
    const directas  = Array.isArray(data.directas)  ? data.directas  : [];
    const heredadas = Array.isArray(data.heredadas) ? data.heredadas : [];
    const total = directas.length + heredadas.length;

    $('evCounter').textContent = `${total} evidencias (${directas.length} directas + ${heredadas.length} heredadas de casos)`;

    const html = [
      ...directas.map(e => evRowHtml(e, false)),
      ...heredadas.map(e => evRowHtml(e, true)),
    ].join('');
    $('evRows').innerHTML = html || '<tr><td colspan="6" class="empty">Sin evidencias todavía.</td></tr>';

    document.querySelectorAll('.btn-ev-delete').forEach(btn => btn.onclick = async () => {
      if (!confirm('¿Eliminar esta evidencia?')) return;
      try {
        await KoguApi.apiFetch('/protected/mat/evidencias/' + btn.dataset.id, { method: 'DELETE' });
        KoguApi.toast('Evidencia eliminada', 'success');
        await loadEvidencias();
      } catch (e) { KoguApi.toast(e.message, 'error'); }
    });
  }

  function evRowHtml(e, heredada) {
    const id = heredada ? (e.evidencia_caso_id || e.evidencia_id) : e.evidencia_id;
    const caso = heredada ? KoguUi.escapeHtml(e.caso_nombre || '') : '';
    const descargar = e.storage_ref
      ? `<a class="btn" href="${KoguApi.getBaseUrl()}/protected/mat/evidencias/${id}/archivo" target="_blank" rel="noopener">Descargar</a>`
      : '<span class="muted" style="font-size:11px">— sin archivo —</span>';
    const delBtn = (!heredada && e.evidencia_id)
      ? `<button class="btn btn-ev-delete" data-id="${e.evidencia_id}">Eliminar</button>`
      : '';
    return `
      <tr>
        <td>${KoguUi.escapeHtml(TIPO_EVIDENCIA_LABELS[e.tipo_evidencia] || e.tipo_evidencia)}</td>
        <td>${KoguUi.escapeHtml(ORIGEN_LABELS[e.origen] || e.origen)}${heredada ? ' <span class="chip" style="background:#7c3aed1a;color:#7c3aed;border:1px solid #7c3aed55">heredada</span>' : ''}</td>
        <td>${caso}</td>
        <td>${KoguUi.escapeHtml(e.descripcion || '')}</td>
        <td>${e.validado_at ? '✓ ' + fmtDate(e.validado_at) : '<span class="muted">—</span>'}</td>
        <td>${descargar} ${delBtn}</td>
      </tr>`;
  }

  async function loadObservaciones() {
    const res = await KoguApi.apiFetch('/protected/mat/cfdi/' + cfdiId + '/observaciones');
    const obs = KoguApi.unwrapRows(res) || [];
    $('obsRows').innerHTML = obs.length ? obs.map(o => `
      <tr>
        <td>${fmtDate(o.created_at)}</td>
        <td>${KoguUi.escapeHtml(TIPO_OBS_LABELS[o.tipo] || o.tipo)}</td>
        <td>${KoguUi.escapeHtml(o.autor_nombre || '—')}</td>
        <td>${KoguUi.escapeHtml(o.texto || '')}</td>
      </tr>
    `).join('') : '<tr><td colspan="4" class="empty">Sin observaciones</td></tr>';
  }

  async function reload() {
    await Promise.all([loadCfdiHeader(), loadScore(), loadEvidencias(), loadObservaciones()]);
  }

  // ── Acciones ──────────────────────────────────────────────────────────────
  $('recalcBtn').onclick = async () => {
    try {
      const res = await KoguApi.apiFetch('/protected/mat/score/' + cfdiId + '/recalcular', { method: 'POST' });
      const s = KoguApi.unwrapData(res);
      KoguApi.toast(`Score recalculado: ${s.score} (${s.nivel})`, 'success');
      await reload();
    } catch (e) { KoguApi.toast(e.message, 'error'); }
  };

  // Modal evidencia
  $('addEvBtn').onclick     = () => { ['ev_tipo','ev_descripcion','ev_archivo'].forEach(id => $(id).value = ''); $('evModal').style.display = 'flex'; };
  $('closeEvBtn').onclick   = () => $('evModal').style.display = 'none';
  $('cancelEvBtn').onclick  = () => $('evModal').style.display = 'none';
  $('submitEvBtn').onclick  = async () => {
    try {
      const tipo = $('ev_tipo').value;
      const file = $('ev_archivo').files[0];
      if (!tipo) throw new Error('Selecciona el tipo de evidencia.');
      if (!file) throw new Error('Selecciona un archivo.');

      const fd = new FormData();
      fd.append('archivo', file);
      fd.append('tipo_evidencia', tipo);
      if ($('ev_descripcion').value) fd.append('descripcion', $('ev_descripcion').value);

      const token = KoguApi.getToken();
      const empresaId = KoguApi.getEmpresaId();
      const resp = await fetch(KoguApi.getBaseUrl() + '/protected/mat/cfdi/' + cfdiId + '/evidencias', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, ...(empresaId ? { 'X-Empresa-Id': empresaId } : {}) },
        body: fd,
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data?.ok === false) throw new Error(data?.error?.message || 'No fue posible subir la evidencia.');

      KoguApi.toast('Evidencia adjuntada. Recalculando score…', 'success');
      $('evModal').style.display = 'none';
      // Recalcular score automáticamente al adjuntar evidencia
      await KoguApi.apiFetch('/protected/mat/score/' + cfdiId + '/recalcular', { method: 'POST' }).catch(() => {});
      await reload();
    } catch (e) { KoguApi.toast(e.message, 'error'); }
  };

  // Modal observación
  $('addObsBtn').onclick    = () => { $('obs_tipo').value = 'razon_negocio'; $('obs_texto').value = ''; $('obsModal').style.display = 'flex'; };
  $('closeObsBtn').onclick  = () => $('obsModal').style.display = 'none';
  $('cancelObsBtn').onclick = () => $('obsModal').style.display = 'none';
  $('submitObsBtn').onclick = async () => {
    try {
      const body = { tipo: $('obs_tipo').value, texto: $('obs_texto').value };
      if (!body.texto || !body.texto.trim()) throw new Error('El texto es obligatorio.');
      await KoguApi.apiFetch('/protected/mat/cfdi/' + cfdiId + '/observaciones', {
        method: 'POST', body: JSON.stringify(body),
      });
      KoguApi.toast('Observación registrada', 'success');
      $('obsModal').style.display = 'none';
      // Si es razón de negocio, recalcular score (limpia el castigo -10)
      if (body.tipo === 'razon_negocio') {
        await KoguApi.apiFetch('/protected/mat/score/' + cfdiId + '/recalcular', { method: 'POST' }).catch(() => {});
      }
      await reload();
    } catch (e) { KoguApi.toast(e.message, 'error'); }
  };

  KoguShell.subscribeEmpresaActivaChange(() => {
    window.location.href = '/modules/mat/bandeja-defensa.html';
  });

  await reload();
});

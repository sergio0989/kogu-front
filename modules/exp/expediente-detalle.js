// ============================================================
// expediente-detalle.js
// Pantalla: Detalle de expediente — documentos + evaluaciones.
// Sub-proyecto: materialidad-v1 — Iteración 1.
// ============================================================

const TIPO_DOCUMENTO_LABELS = {
  acta_constitutiva:                     'Acta constitutiva',
  poder_notarial:                        'Poder notarial',
  cedula_fiscal:                         'Cédula fiscal',
  constancia_situacion_fiscal:           'Constancia de situación fiscal',
  comprobante_domicilio:                 'Comprobante de domicilio',
  estado_cuenta_bancario:                'Estado de cuenta bancario',
  contrato_marco:                        'Contrato marco',
  registro_patronal_imss:                'Registro patronal IMSS',
  prueba_capacidad_proveedor:            'Prueba de capacidad del proveedor',
  identificacion_oficial_representante:  'Identificación oficial del representante',
  otro:                                  'Otro',
};

const STATUS_DOC_LABELS = {
  vigente:    'Vigente',
  por_vencer: 'Por vencer',
  vencido:    'Vencido',
  invalido:   'Inválido',
};

const ORIGEN_EVAL_LABELS = {
  manual:                'Manual',
  automatica:            'Automática',
  '69b_alerta':          'Alerta EFOS/69-B',
  vencimiento_documento: 'Vencimiento de documento',
  score_recalculado:     'Score recalculado',
};

document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(window.location.search);
  const expedienteId = params.get('id');

  if (!expedienteId) {
    document.body.innerHTML = '<p style="padding:40px;text-align:center">Falta el parámetro <code>id</code> del expediente.</p>';
    return;
  }

  const b = await KoguShell.initShell({
    currentPage:        '/modules/exp/expedientes.html', // mismo permiso/menú padre
    title:              'Detalle de expediente',
    description:        'Documentos legales, evaluaciones de riesgo y score actual.',
    requiredPermission: 'screen.exp.expedientes',
  });
  if (!b) return;

  document.getElementById('pageContent').innerHTML = `
<div class="stack">

  <!-- Header del expediente -->
  <div class="card" id="headerCard">
    <div class="row">
      <div>
        <div class="eyebrow">Expediente</div>
        <h2 id="expedienteTitle">Cargando…</h2>
        <div id="expedienteSubtitle" class="muted" style="margin-top:6px"></div>
      </div>
      <div style="text-align:right">
        <div class="muted" style="font-size:11px">Score</div>
        <div id="scoreActual" style="font-size:32px;font-weight:700">—</div>
        <div id="nivelActual"></div>
      </div>
    </div>
    <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap">
      <a class="btn" href="/modules/exp/expedientes.html">← Volver a listado</a>
      <button class="btn" id="refreshBtn">Actualizar</button>
    </div>
  </div>

  <!-- Documentos -->
  <div class="card">
    <div class="row">
      <div><div class="eyebrow">Sección legal</div><h2>Documentos</h2></div>
      <button class="btn primary" id="addDocBtn">Subir documento</button>
    </div>
    <div class="table-wrap" style="margin-top:16px">
      <table><thead><tr>
        <th>Tipo</th><th>Descripción</th><th>Vigencia</th><th>Tamaño</th><th>Hash</th><th>Status</th><th>Acciones</th>
      </tr></thead><tbody id="docRows"></tbody></table>
    </div>
  </div>

  <!-- Evaluaciones -->
  <div class="card">
    <div class="row">
      <div><div class="eyebrow">Bitácora</div><h2>Evaluaciones de riesgo</h2></div>
      <button class="btn primary" id="addEvalBtn">Nueva evaluación</button>
    </div>
    <div class="table-wrap" style="margin-top:16px">
      <table><thead><tr>
        <th>Fecha</th><th>Origen</th><th>Evaluador</th><th>Antes</th><th>Después</th><th>Observaciones</th>
      </tr></thead><tbody id="evalRows"></tbody></table>
    </div>
  </div>

  <!-- Modal upload documento -->
  <div id="uploadModal" style="display:none;position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:50;align-items:center;justify-content:center;padding:20px;">
    <div class="card" style="max-width:520px;width:100%;background:#fff">
      <div class="row"><h3 style="margin:0">Subir documento</h3><button class="btn" id="closeUploadBtn">Cerrar</button></div>
      <div class="stack" style="margin-top:16px">
        <div>
          <div class="label-text">Tipo de documento</div>
          <select class="select" id="tipo_documento">
            <option value="">Selecciona…</option>
            ${Object.entries(TIPO_DOCUMENTO_LABELS).map(([k,v]) => `<option value="${k}">${v}</option>`).join('')}
          </select>
        </div>
        <div>
          <div class="label-text">Descripción <span class="muted" style="font-size:11px">(opcional)</span></div>
          <input class="input" id="descripcion" />
        </div>
        <div class="grid-2">
          <div><div class="label-text">Vigencia desde</div><input class="input" id="vigencia_desde" type="date"/></div>
          <div><div class="label-text">Vigencia hasta</div><input class="input" id="vigencia_hasta" type="date"/></div>
        </div>
        <div>
          <div class="label-text">Archivo (PDF, JPG, PNG, XLSX, DOCX, CSV — máx. 25 MB)</div>
          <input class="input" id="archivo" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.xlsx,.xls,.docx,.doc,.csv,.txt"/>
        </div>
        <div class="page-actions">
          <button class="btn primary" id="submitUploadBtn">Subir</button>
          <button class="btn" id="cancelUploadBtn">Cancelar</button>
        </div>
      </div>
    </div>
  </div>

  <!-- Modal nueva evaluación -->
  <div id="evalModal" style="display:none;position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:50;align-items:center;justify-content:center;padding:20px;">
    <div class="card" style="max-width:520px;width:100%;background:#fff">
      <div class="row"><h3 style="margin:0">Nueva evaluación de riesgo</h3><button class="btn" id="closeEvalBtn">Cerrar</button></div>
      <div class="stack" style="margin-top:16px">
        <div>
          <div class="label-text">Origen</div>
          <select class="select" id="eval_origen">
            <option value="manual">Manual</option>
            <option value="69b_alerta">Alerta EFOS / 69-B</option>
            <option value="vencimiento_documento">Vencimiento de documento</option>
            <option value="score_recalculado">Score recalculado</option>
          </select>
        </div>
        <div class="grid-2">
          <div>
            <div class="label-text">Nivel nuevo</div>
            <select class="select" id="eval_nivel">
              <option value="">— sin cambio —</option>
              <option value="BAJO">BAJO</option><option value="MEDIO">MEDIO</option>
              <option value="ALTO">ALTO</option><option value="CRITICO">CRÍTICO</option>
            </select>
          </div>
          <div>
            <div class="label-text">Score nuevo (0–100)</div>
            <input class="input" id="eval_score" type="number" min="0" max="100" />
          </div>
        </div>
        <div>
          <div class="label-text">Observaciones</div>
          <textarea class="input" id="eval_observaciones" rows="3"></textarea>
        </div>
        <div class="page-actions">
          <button class="btn primary" id="submitEvalBtn">Registrar evaluación</button>
          <button class="btn" id="cancelEvalBtn">Cancelar</button>
        </div>
      </div>
    </div>
  </div>

</div>`;

  const $ = id => document.getElementById(id);

  // ── Loaders ───────────────────────────────────────────────────────────────
  async function loadHeader() {
    const res = await KoguApi.apiFetch('/protected/exp/expedientes/' + expedienteId);
    const exp = KoguApi.unwrapData(res);
    $('expedienteTitle').textContent = exp.nombre || '(sin nombre)';
    $('expedienteSubtitle').innerHTML = `
      <strong style="font-family:monospace">${KoguUi.escapeHtml(exp.rfc || '')}</strong>
      &nbsp;·&nbsp; ${KoguUi.escapeHtml(exp.tercero_tipo || '')}
      ${exp.cliente_nombre   ? '<br>Cliente: '   + KoguUi.escapeHtml(exp.cliente_nombre)   : ''}
      ${exp.proveedor_nombre ? '<br>Proveedor: ' + KoguUi.escapeHtml(exp.proveedor_nombre) : ''}
      ${exp.responsable_nombre ? '<br>Responsable: ' + KoguUi.escapeHtml(exp.responsable_nombre) : ''}
    `;
    $('scoreActual').textContent = typeof exp.score_actual === 'number' ? exp.score_actual : '—';
    $('nivelActual').innerHTML = nivelBadge(exp.nivel_riesgo);
  }

  async function loadDocs() {
    const res = await KoguApi.apiFetch('/protected/exp/expedientes/' + expedienteId + '/documentos');
    const docs = KoguApi.unwrapRows(res) || [];
    $('docRows').innerHTML = docs.length ? docs.map(d => `
      <tr>
        <td>${KoguUi.escapeHtml(TIPO_DOCUMENTO_LABELS[d.tipo_documento] || d.tipo_documento)}</td>
        <td>${KoguUi.escapeHtml(d.descripcion || '')}</td>
        <td>${d.vigencia_desde || ''} → ${d.vigencia_hasta || ''}</td>
        <td>${fmtBytes(d.size_bytes)}</td>
        <td style="font-family:monospace;font-size:11px">${(d.hash_sha256 || '').slice(0, 12)}…</td>
        <td>${KoguUi.statusBadge(STATUS_DOC_LABELS[d.status] || d.status)}</td>
        <td>
          <div class="actions-cell">
            <a class="btn" href="${KoguApi.getBaseUrl()}/protected/exp/documentos/${d.documento_id}/archivo" target="_blank" rel="noopener">Descargar</a>
            <button class="btn btn-delete" data-id="${d.documento_id}">Eliminar</button>
          </div>
        </td>
      </tr>
    `).join('') : '<tr><td colspan="7" class="empty">Sin documentos</td></tr>';

    document.querySelectorAll('.btn-delete').forEach(btn => btn.onclick = async () => {
      if (!confirm('¿Eliminar este documento?')) return;
      try {
        await KoguApi.apiFetch('/protected/exp/documentos/' + btn.dataset.id, { method: 'DELETE' });
        KoguApi.toast('Documento eliminado', 'success');
        await loadDocs();
      } catch (e) { KoguApi.toast(e.message, 'error'); }
    });
  }

  async function loadEvals() {
    const res = await KoguApi.apiFetch('/protected/exp/expedientes/' + expedienteId + '/evaluaciones');
    const ev = KoguApi.unwrapRows(res) || [];
    $('evalRows').innerHTML = ev.length ? ev.map(e => `
      <tr>
        <td>${fmtDate(e.created_at)}</td>
        <td>${KoguUi.escapeHtml(ORIGEN_EVAL_LABELS[e.origen] || e.origen)}</td>
        <td>${KoguUi.escapeHtml(e.evaluador_nombre || '—')}</td>
        <td>${e.score_anterior ?? '—'} / ${e.nivel_anterior || '—'}</td>
        <td>${e.score_nuevo ?? '—'} / ${e.nivel_nuevo || '—'}</td>
        <td>${KoguUi.escapeHtml(e.observaciones || '')}</td>
      </tr>
    `).join('') : '<tr><td colspan="6" class="empty">Sin evaluaciones</td></tr>';
  }

  async function reload() {
    await Promise.all([loadHeader(), loadDocs(), loadEvals()]);
  }

  // ── Helpers UI ────────────────────────────────────────────────────────────
  function nivelBadge(nivel) {
    if (!nivel) return '<span class="muted" style="font-size:11px">— sin evaluar —</span>';
    const color = nivel === 'BAJO' ? '#16a34a'
                : nivel === 'MEDIO' ? '#ca8a04'
                : nivel === 'ALTO' ? '#ea580c'
                : '#dc2626';
    return `<span class="chip" style="background:${color}1a;color:${color};border:1px solid ${color}55;">${nivel}</span>`;
  }
  function fmtBytes(b) {
    if (!b) return '—';
    if (b < 1024) return b + ' B';
    if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
    return (b / 1024 / 1024).toFixed(2) + ' MB';
  }
  function fmtDate(d) {
    if (!d) return '';
    const dt = new Date(d);
    return dt.toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
  }

  // ── Modal upload doc ──────────────────────────────────────────────────────
  function openUpload() {
    ['tipo_documento','descripcion','vigencia_desde','vigencia_hasta','archivo'].forEach(id => $(id).value = '');
    $('uploadModal').style.display = 'flex';
  }
  function closeUpload() { $('uploadModal').style.display = 'none'; }

  $('addDocBtn').onclick      = openUpload;
  $('closeUploadBtn').onclick = closeUpload;
  $('cancelUploadBtn').onclick = closeUpload;

  $('submitUploadBtn').onclick = async () => {
    try {
      const tipo = $('tipo_documento').value;
      const file = $('archivo').files[0];
      if (!tipo) throw new Error('Selecciona el tipo de documento.');
      if (!file) throw new Error('Selecciona un archivo.');

      const fd = new FormData();
      fd.append('archivo', file);
      fd.append('tipo_documento', tipo);
      if ($('descripcion').value)    fd.append('descripcion',    $('descripcion').value);
      if ($('vigencia_desde').value) fd.append('vigencia_desde', $('vigencia_desde').value);
      if ($('vigencia_hasta').value) fd.append('vigencia_hasta', $('vigencia_hasta').value);

      const token = KoguApi.getToken();
      const empresaId = KoguApi.getEmpresaId();
      const resp = await fetch(KoguApi.getBaseUrl() + '/protected/exp/expedientes/' + expedienteId + '/documentos', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + token,
          ...(empresaId ? { 'X-Empresa-Id': empresaId } : {}),
        },
        body: fd,
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data?.ok === false) {
        throw new Error(data?.error?.message || 'No fue posible subir el documento.');
      }
      KoguApi.toast('Documento subido', 'success');
      closeUpload();
      await loadDocs();
    } catch (e) {
      KoguApi.toast(e.message, 'error');
    }
  };

  // ── Modal nueva evaluación ────────────────────────────────────────────────
  function openEval() {
    $('eval_origen').value = 'manual';
    $('eval_nivel').value = '';
    $('eval_score').value = '';
    $('eval_observaciones').value = '';
    $('evalModal').style.display = 'flex';
  }
  function closeEval() { $('evalModal').style.display = 'none'; }

  $('addEvalBtn').onclick    = openEval;
  $('closeEvalBtn').onclick  = closeEval;
  $('cancelEvalBtn').onclick = closeEval;

  $('submitEvalBtn').onclick = async () => {
    try {
      const body = {
        origen:        $('eval_origen').value,
        nivel_nuevo:   $('eval_nivel').value || null,
        score_nuevo:   $('eval_score').value ? Number($('eval_score').value) : null,
        observaciones: $('eval_observaciones').value || null,
      };
      await KoguApi.apiFetch('/protected/exp/expedientes/' + expedienteId + '/evaluaciones', {
        method: 'POST', body: JSON.stringify(body),
      });
      KoguApi.toast('Evaluación registrada', 'success');
      closeEval();
      await reload();
    } catch (e) {
      KoguApi.toast(e.message, 'error');
    }
  };

  $('refreshBtn').onclick = reload;

  // ── Cambio de empresa ─────────────────────────────────────────────────────
  // Si el usuario cambia empresa estando en el detalle, lo regresamos al
  // listado para evitar mostrar un expediente de empresa distinta.
  KoguShell.subscribeEmpresaActivaChange(() => {
    window.location.href = '/modules/exp/expedientes.html';
  });

  await reload();
});

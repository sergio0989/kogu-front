// ============================================================
// caso-detalle.js
// Detalle de un caso de operación: header + CFDI miembros + evidencias del caso.
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

const ROL_CFDI_LABELS = {
  principal:      'Principal',
  complementario: 'Complementario',
  rep:            'REP',
  nota_credito:   'Nota de crédito',
  traslado:       'Traslado',
  nomina:         'Nómina',
};

document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(window.location.search);
  const casoId = params.get('id');
  if (!casoId) {
    document.body.innerHTML = '<p style="padding:40px;text-align:center">Falta el parámetro <code>id</code>.</p>';
    return;
  }

  const b = await KoguShell.initShell({
    currentPage:        '/modules/mat/casos.html',
    title:              'Detalle de caso',
    description:        'CFDI miembros y evidencias del caso. Las evidencias del caso heredan a los CFDI miembros.',
    requiredPermission: 'screen.mat.casos',
  });
  if (!b) return;

  document.getElementById('pageContent').innerHTML = `
<div class="stack">

  <!-- Header -->
  <div class="card" id="headerCard">
    <div class="row">
      <div><div class="eyebrow">Caso de operación</div><h2 id="casoTitle">Cargando…</h2>
        <div id="casoSubtitle" class="muted" style="margin-top:6px"></div>
      </div>
      <div style="text-align:right">
        <div class="muted" style="font-size:11px">Status</div>
        <div id="statusChip" style="margin-top:6px"></div>
      </div>
    </div>
    <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap">
      <a class="btn" href="/modules/mat/casos.html">← Volver a casos</a>
      <button class="btn" id="refreshBtn">Actualizar</button>
    </div>
  </div>

  <!-- CFDI miembros -->
  <div class="card">
    <div class="row">
      <div><div class="eyebrow">Miembros</div><h2>CFDI vinculados al caso</h2></div>
      <button class="btn primary" id="addCfdiBtn">Vincular CFDI</button>
    </div>
    <div class="table-wrap" style="margin-top:16px">
      <table><thead><tr>
        <th>UUID</th><th>Fecha</th><th>Tipo</th><th>Tercero</th><th>Total</th>
        <th>Score CFDI</th><th>Rol en caso</th><th>Acciones</th>
      </tr></thead><tbody id="cfdiRows"></tbody></table>
    </div>
  </div>

  <!-- Evidencias del caso -->
  <div class="card">
    <div class="row">
      <div><div class="eyebrow">Soporte del caso</div><h2>Evidencias</h2></div>
      <button class="btn primary" id="addEvBtn">Subir evidencia al caso</button>
    </div>
    <div class="muted" style="margin-top:6px;font-size:12px">
      Estas evidencias <strong>heredan automáticamente</strong> a todos los CFDI vinculados al caso para el cálculo de score.
    </div>
    <div class="table-wrap" style="margin-top:16px">
      <table><thead><tr>
        <th>Tipo</th><th>Descripción</th><th>Tamaño</th><th>Subido</th><th>Acciones</th>
      </tr></thead><tbody id="evRows"></tbody></table>
    </div>
  </div>

  <!-- Modal vincular CFDI -->
  <div id="cfdiModal" style="display:none;position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:50;align-items:center;justify-content:center;padding:20px;">
    <div class="card" style="max-width:520px;width:100%;background:#fff">
      <div class="row"><h3 style="margin:0">Vincular CFDI al caso</h3><button class="btn" id="closeCfdiBtn">Cerrar</button></div>
      <div class="stack" style="margin-top:16px">
        <div>
          <div class="label-text">CFDI ID <span class="muted" style="font-size:11px">(UUID interno KOGU)</span></div>
          <input class="input" id="cfdi_id" placeholder="cfdi_id (uuid del CFDI)"/>
          <div class="muted" style="margin-top:6px;font-size:11px">
            Tip: lo obtienes desde la bandeja CFDI (columna ID) o desde la Bandeja de Defensa.
          </div>
        </div>
        <div>
          <div class="label-text">Rol en el caso</div>
          <select class="select" id="rol_en_caso">
            ${Object.entries(ROL_CFDI_LABELS).map(([k,v]) => `<option value="${k}">${v}</option>`).join('')}
          </select>
        </div>
        <div>
          <div class="label-text">Observaciones</div>
          <input class="input" id="obs_cfdi"/>
        </div>
        <div class="page-actions">
          <button class="btn primary" id="submitCfdiBtn">Vincular</button>
          <button class="btn" id="cancelCfdiBtn">Cancelar</button>
        </div>
      </div>
    </div>
  </div>

  <!-- Modal evidencia caso -->
  <div id="evModal" style="display:none;position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:50;align-items:center;justify-content:center;padding:20px;">
    <div class="card" style="max-width:520px;width:100%;background:#fff">
      <div class="row"><h3 style="margin:0">Subir evidencia al caso</h3><button class="btn" id="closeEvBtn">Cerrar</button></div>
      <div class="stack" style="margin-top:16px">
        <div>
          <div class="label-text">Tipo de evidencia</div>
          <select class="select" id="ev_tipo">
            <option value="">Selecciona…</option>
            ${Object.entries(TIPO_EVIDENCIA_LABELS).map(([k,v]) => `<option value="${k}">${v}</option>`).join('')}
          </select>
        </div>
        <div><div class="label-text">Descripción</div><input class="input" id="ev_descripcion"/></div>
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

</div>`;

  const $ = id => document.getElementById(id);

  function statusBadge(s) {
    const c = s === 'completo' ? '#16a34a'
            : s === 'en_armado' ? '#ca8a04'
            : s === 'abierto' ? '#0ea5e9'
            : s === 'cerrado' ? '#64748b'
            : '#94a3b8';
    return `<span class="chip" style="background:${c}1a;color:${c};border:1px solid ${c}55">${(s || '').replace('_',' ')}</span>`;
  }
  function fmtDate(d){ if(!d) return ''; return new Date(d).toLocaleDateString('es-MX'); }
  function fmtBytes(b){ if(!b) return '—'; if (b < 1024) return b + ' B'; if (b < 1024*1024) return (b/1024).toFixed(1) + ' KB'; return (b/1024/1024).toFixed(2) + ' MB'; }
  function fmtMoney(v, mon){ if(v == null) return '—'; return Number(v).toLocaleString('es-MX',{style:'currency',currency:(mon||'MXN'),maximumFractionDigits:2}); }

  async function loadAll() {
    const res = await KoguApi.apiFetch('/protected/mat/casos/' + casoId);
    const data = KoguApi.unwrapData(res) || {};
    const caso = data.caso || {};
    const cfdis = data.cfdis || [];
    const evidencias = data.evidencias || [];

    // Header
    $('casoTitle').textContent = caso.nombre || '(sin nombre)';
    $('casoSubtitle').innerHTML = `
      ${KoguUi.escapeHtml(caso.tipo_caso || '')}
      ${caso.expediente_rfc ? '<br>Tercero: <strong style="font-family:monospace">' + KoguUi.escapeHtml(caso.expediente_rfc) + '</strong> · ' + KoguUi.escapeHtml(caso.expediente_nombre || '') : ''}
      ${caso.fecha_inicio || caso.fecha_fin ? `<br>${fmtDate(caso.fecha_inicio)} → ${fmtDate(caso.fecha_fin)}` : ''}
      ${caso.monto_total ? '<br>Monto: ' + fmtMoney(caso.monto_total, caso.moneda) : ''}
      ${caso.descripcion ? '<br>' + KoguUi.escapeHtml(caso.descripcion) : ''}
    `;
    $('statusChip').innerHTML = statusBadge(caso.status);

    // CFDI miembros
    $('cfdiRows').innerHTML = cfdis.length ? cfdis.map(c => `
      <tr>
        <td style="font-family:monospace;font-size:11px">${KoguUi.escapeHtml((c.cfdi_uuid || '').slice(0, 8))}…</td>
        <td>${fmtDate(c.fecha_emision)}</td>
        <td>${KoguUi.escapeHtml(c.tipo_comprobante || '')}</td>
        <td>${KoguUi.escapeHtml((c.emisor_rfc || '') + ' / ' + (c.receptor_rfc || ''))}</td>
        <td>${fmtMoney(c.total, c.moneda)}</td>
        <td>${c.score_cfdi ?? '<span class="muted">—</span>'} ${c.nivel_cfdi ? '· ' + c.nivel_cfdi : ''}</td>
        <td>${KoguUi.escapeHtml(ROL_CFDI_LABELS[c.rol_en_caso] || c.rol_en_caso || '')}</td>
        <td>
          <a class="btn" href="/modules/mat/cfdi-materialidad.html?cfdi_id=${encodeURIComponent(c.cfdi_id)}">Materialidad</a>
          <button class="btn btn-detach" data-cfdi="${c.cfdi_id}">Desvincular</button>
        </td>
      </tr>
    `).join('') : '<tr><td colspan="8" class="empty">Sin CFDI vinculados. Usa "Vincular CFDI".</td></tr>';

    document.querySelectorAll('.btn-detach').forEach(btn => btn.onclick = async () => {
      if (!confirm('¿Desvincular este CFDI del caso?')) return;
      try {
        await KoguApi.apiFetch('/protected/mat/casos/' + casoId + '/cfdis/' + btn.dataset.cfdi, { method: 'DELETE' });
        KoguApi.toast('CFDI desvinculado', 'success');
        await loadAll();
      } catch (e) { KoguApi.toast(e.message, 'error'); }
    });

    // Evidencias del caso
    $('evRows').innerHTML = evidencias.length ? evidencias.map(e => `
      <tr>
        <td>${KoguUi.escapeHtml(TIPO_EVIDENCIA_LABELS[e.tipo_evidencia] || e.tipo_evidencia)}</td>
        <td>${KoguUi.escapeHtml(e.descripcion || '')}</td>
        <td>${fmtBytes(e.size_bytes)}</td>
        <td>${fmtDate(e.created_at)}</td>
        <td>
          ${e.storage_ref ? `<a class="btn" href="${KoguApi.getBaseUrl()}/protected/mat/caso-evidencias/${e.evidencia_caso_id}/archivo" target="_blank" rel="noopener">Descargar</a>` : ''}
          <button class="btn btn-ev-delete" data-id="${e.evidencia_caso_id}">Eliminar</button>
        </td>
      </tr>
    `).join('') : '<tr><td colspan="5" class="empty">Sin evidencias del caso</td></tr>';

    document.querySelectorAll('.btn-ev-delete').forEach(btn => btn.onclick = async () => {
      if (!confirm('¿Eliminar esta evidencia del caso?')) return;
      try {
        await KoguApi.apiFetch('/protected/mat/caso-evidencias/' + btn.dataset.id, { method: 'DELETE' });
        KoguApi.toast('Evidencia eliminada', 'success');
        await loadAll();
      } catch (e) { KoguApi.toast(e.message, 'error'); }
    });
  }

  // ── Modal vincular CFDI ───────────────────────────────────────────────────
  $('addCfdiBtn').onclick    = () => { ['cfdi_id','obs_cfdi'].forEach(id => $(id).value = ''); $('rol_en_caso').value = 'principal'; $('cfdiModal').style.display = 'flex'; };
  $('closeCfdiBtn').onclick  = () => $('cfdiModal').style.display = 'none';
  $('cancelCfdiBtn').onclick = () => $('cfdiModal').style.display = 'none';
  $('submitCfdiBtn').onclick = async () => {
    try {
      const cid = $('cfdi_id').value.trim();
      if (!cid) throw new Error('CFDI ID es obligatorio.');
      await KoguApi.apiFetch('/protected/mat/casos/' + casoId + '/cfdis', {
        method: 'POST',
        body: JSON.stringify({
          cfdi_id: cid,
          rol_en_caso: $('rol_en_caso').value,
          observaciones: $('obs_cfdi').value || null,
        }),
      });
      KoguApi.toast('CFDI vinculado al caso', 'success');
      $('cfdiModal').style.display = 'none';
      await loadAll();
    } catch (e) { KoguApi.toast(e.message, 'error'); }
  };

  // ── Modal evidencia del caso ──────────────────────────────────────────────
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
      const resp = await fetch(KoguApi.getBaseUrl() + '/protected/mat/casos/' + casoId + '/evidencias', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, ...(empresaId ? { 'X-Empresa-Id': empresaId } : {}) },
        body: fd,
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data?.ok === false) throw new Error(data?.error?.message || 'No fue posible subir la evidencia.');
      KoguApi.toast('Evidencia adjuntada al caso (heredará a CFDI miembros)', 'success');
      $('evModal').style.display = 'none';
      await loadAll();
    } catch (e) { KoguApi.toast(e.message, 'error'); }
  };

  $('refreshBtn').onclick = loadAll;
  KoguShell.subscribeEmpresaActivaChange(() => {
    window.location.href = '/modules/mat/casos.html';
  });

  await loadAll();
});

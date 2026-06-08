// ============================================================
// bandeja-revision.js
// Bandeja interna de revisión de envíos del Portal de Proveedores.
// Aprobar → promueve el documento a exp_documentos. Rechazar → con motivo.
// Sub-proyecto: modulo-proveedores-v1.
// ============================================================

const TIPO_DOC_LABEL = {
  acta_constitutiva:                    'Acta constitutiva',
  poder_notarial:                       'Poder notarial',
  cedula_fiscal:                        'Cédula fiscal',
  constancia_situacion_fiscal:          'Constancia de situación fiscal',
  comprobante_domicilio:                'Comprobante de domicilio',
  estado_cuenta_bancario:               'Estado de cuenta bancario',
  contrato_marco:                       'Contrato marco',
  registro_patronal_imss:               'Registro patronal IMSS',
  prueba_capacidad_proveedor:           'Prueba de capacidad',
  identificacion_oficial_representante: 'Identificación del representante',
  otro:                                 'Otro',
};

const STATUS_BADGE = {
  en_revision: '<span class="chip" style="background:#fef3c7;color:#92600c">En revisión</span>',
  aprobado:    '<span class="chip" style="background:#dcfce7;color:#15803d">Aprobado</span>',
  rechazado:   '<span class="chip" style="background:#fee2e2;color:#991b1b">Rechazado</span>',
};

document.addEventListener('DOMContentLoaded', async () => {
  const b = await KoguShell.initShell({
    currentPage:        '/modules/prov/bandeja-revision.html',
    title:              'Bandeja de Revisión · Proveedores',
    description:        'Documentos enviados por los proveedores desde el portal. Al aprobar, el documento se promueve al expediente.',
    requiredPermission: 'screen.prov.bandeja_revision',
  });
  if (!b) return;

  document.getElementById('pageContent').innerHTML = `
<div class="card">
  <div class="row">
    <div><div class="eyebrow">Proveedores</div><h2>Bandeja de Revisión</h2></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn primary" id="refreshBtn">Actualizar</button>
    </div>
  </div>

  <div class="grid-2" style="margin-top:14px;gap:8px">
    <div>
      <div class="label-text">Estatus</div>
      <select class="select" id="fStatus">
        <option value="en_revision" selected>En revisión</option>
        <option value="aprobado">Aprobados</option>
        <option value="rechazado">Rechazados</option>
      </select>
    </div>
    <div></div>
  </div>

  <div class="table-wrap" style="margin-top:16px">
    <table><thead><tr>
      <th style="min-width:200px">Proveedor</th>
      <th style="min-width:160px">Documento</th>
      <th style="min-width:160px">Archivo</th>
      <th style="min-width:110px;white-space:nowrap">Vigencia</th>
      <th style="min-width:110px;white-space:nowrap">Recibido</th>
      <th>Estatus</th>
      <th style="min-width:170px">Acción</th>
    </tr></thead><tbody id="rows"></tbody></table>
  </div>

  <div id="meta" class="muted" style="margin-top:10px;font-size:12px"></div>
</div>`;

  const $ = id => document.getElementById(id);
  const fmtDate = d => d ? new Date(d).toLocaleDateString('es-MX') : '—';

  async function load() {
    const status = $('fStatus').value;
    $('rows').innerHTML = '<tr><td colspan="7" class="empty">Cargando…</td></tr>';
    try {
      const res  = await KoguApi.apiFetch('/protected/prov/revision/envios?status=' + encodeURIComponent(status));
      const data = KoguApi.unwrapData(res) || {};
      render(data.rows || []);
    } catch (e) {
      $('rows').innerHTML = `<tr><td colspan="7" class="empty">Error: ${KoguUi.escapeHtml(e.message)}</td></tr>`;
    }
  }

  function render(rows) {
    const esRevision = $('fStatus').value === 'en_revision';
    $('rows').innerHTML = rows.length ? rows.map(r => {
      const tipo = TIPO_DOC_LABEL[r.tipo_documento] || r.tipo_documento || '—';
      const vig  = r.vigencia_hasta ? `vence ${fmtDate(r.vigencia_hasta)}` : '—';
      const acciones = esRevision
        ? `<div class="actions-cell">
             <button class="btn primary sm btn-ap" data-id="${KoguUi.escapeHtml(r.envio_id)}">Aprobar</button>
             <button class="btn sm btn-rj" data-id="${KoguUi.escapeHtml(r.envio_id)}" style="border-color:#fca5a5;color:#dc2626">Rechazar</button>
           </div>`
        : (r.status === 'rechazado' && r.motivo_rechazo
            ? `<span class="muted" style="font-size:12px" title="${KoguUi.escapeHtml(r.motivo_rechazo)}">Motivo: ${KoguUi.escapeHtml(r.motivo_rechazo)}</span>`
            : '<span class="muted">—</span>');
      return `
        <tr>
          <td style="font-size:12px;line-height:1.4">
            <strong>${KoguUi.escapeHtml(r.proveedor_nombre || '—')}</strong>
            <div style="font-family:monospace;font-size:11px;color:var(--muted,#64748b)">${KoguUi.escapeHtml(r.proveedor_rfc || '')}</div>
            ${r.portal_email ? `<div style="font-size:11px;color:var(--muted,#64748b)">${KoguUi.escapeHtml(r.portal_email)}</div>` : ''}
          </td>
          <td>${KoguUi.escapeHtml(tipo)}</td>
          <td style="font-size:12px">${KoguUi.escapeHtml(r.nombre_archivo || '—')}</td>
          <td style="white-space:nowrap;font-size:12px">${vig}</td>
          <td style="white-space:nowrap;font-size:12px">${fmtDate(r.created_at)}</td>
          <td>${STATUS_BADGE[r.status] || KoguUi.escapeHtml(r.status)}</td>
          <td>${acciones}</td>
        </tr>`;
    }).join('') : '<tr><td colspan="7" class="empty">Sin envíos en este estatus.</td></tr>';

    $('meta').textContent = `${rows.length} envío(s)`;

    document.querySelectorAll('.btn-ap').forEach(btn => btn.onclick = () => aprobar(btn));
    document.querySelectorAll('.btn-rj').forEach(btn => btn.onclick = () => rechazar(btn));
  }

  async function aprobar(btn) {
    const id = btn.dataset.id;
    if (!confirm('¿Aprobar este documento y promoverlo al expediente del proveedor?')) return;
    btn.disabled = true; btn.textContent = '...';
    try {
      const res = await KoguApi.apiFetch('/protected/prov/revision/envios/' + id + '/aprobar', { method: 'POST' });
      KoguApi.unwrapData(res);
      KoguApi.toast('Documento aprobado y promovido al expediente.', 'success');
      await load();
    } catch (e) {
      btn.disabled = false; btn.textContent = 'Aprobar';
      KoguApi.toast(e.message, 'error');
    }
  }

  async function rechazar(btn) {
    const id = btn.dataset.id;
    const motivo = prompt('Motivo del rechazo (lo verá el proveedor):');
    if (motivo === null) return;
    if (!motivo.trim()) { KoguApi.toast('El motivo es obligatorio.', 'error'); return; }
    btn.disabled = true; btn.textContent = '...';
    try {
      const res = await KoguApi.apiFetch('/protected/prov/revision/envios/' + id + '/rechazar', {
        method: 'POST',
        body: JSON.stringify({ motivo: motivo.trim() }),
      });
      KoguApi.unwrapData(res);
      KoguApi.toast('Envío rechazado. El proveedor recibirá el motivo.', 'success');
      await load();
    } catch (e) {
      btn.disabled = false; btn.textContent = 'Rechazar';
      KoguApi.toast(e.message, 'error');
    }
  }

  $('fStatus').onchange = load;
  $('refreshBtn').onclick = load;
  await load();
});

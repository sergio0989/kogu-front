// ============================================================
// cfdi.js — Verificación interna de CFDI subidos por proveedores.
// Lista por empresa, filtros, "PPD sin REP" y verificar/rechazar.
// Sub-proyecto: modulo-proveedores-v1 · Fase 3.
// ============================================================

const TIPO_LABEL = { I: 'Ingreso', P: 'Pago (REP)', E: 'Egreso', T: 'Traslado', N: 'Nómina' };

document.addEventListener('DOMContentLoaded', async () => {
  const b = await KoguShell.initShell({
    currentPage:        '/modules/prov/cfdi.html',
    title:              'Verificación CFDI · Proveedores',
    description:        'CFDI y complementos de pago que los proveedores cargaron como verificación. La conciliación fiscal real la hace el proceso CFDI del SAT.',
    requiredPermission: 'screen.prov.cfdi',
  });
  if (!b) return;

  document.getElementById('pageContent').innerHTML = `
<div class="card">
  <div class="row">
    <div><div class="eyebrow">Proveedores</div><h2>Verificación CFDI</h2></div>
    <button class="btn primary" id="refreshBtn">Actualizar</button>
  </div>

  <div class="grid-2" style="margin-top:14px;gap:8px">
    <div>
      <div class="label-text">Tipo</div>
      <select class="select" id="fTipo">
        <option value="">Todos</option>
        <option value="I">Ingreso</option>
        <option value="P">Pago (REP)</option>
        <option value="E">Egreso</option>
      </select>
    </div>
    <div>
      <div class="label-text">Verificación rápida</div>
      <select class="select" id="fVista">
        <option value="">Todos</option>
        <option value="ppd_sin_rep">⚠️ PPD sin complemento de pago</option>
      </select>
    </div>
  </div>

  <div class="table-wrap" style="margin-top:16px">
    <table><thead><tr>
      <th style="min-width:180px">Proveedor</th>
      <th>Tipo</th><th>UUID</th><th>Serie/Folio</th><th>Fecha</th>
      <th style="text-align:right">Total</th><th>Método</th><th>SAT</th><th>Estatus</th>
      <th style="min-width:150px">Acción</th>
    </tr></thead><tbody id="rows"></tbody></table>
  </div>
  <div id="meta" class="muted" style="margin-top:10px;font-size:12px"></div>
</div>`;

  const $ = id => document.getElementById(id);
  const fmtDate = d => d ? new Date(d).toLocaleDateString('es-MX') : '—';

  const ESTATUS_BADGE = {
    recibido:   '<span class="chip" style="background:#eff6ff;color:#1d4ed8">Recibido</span>',
    verificado: '<span class="chip" style="background:#dcfce7;color:#15803d">Verificado</span>',
    rechazado:  '<span class="chip" style="background:#fee2e2;color:#991b1b">Rechazado</span>',
  };

  async function load() {
    const p = new URLSearchParams();
    if ($('fTipo').value) p.set('tipo', $('fTipo').value);
    if ($('fVista').value === 'ppd_sin_rep') p.set('solo_sin_rep', 'true');
    $('rows').innerHTML = '<tr><td colspan="10" class="empty">Cargando…</td></tr>';
    try {
      const res = await KoguApi.apiFetch('/protected/prov/cfdi?' + p.toString());
      render((KoguApi.unwrapData(res) || {}).rows || []);
    } catch (e) {
      $('rows').innerHTML = `<tr><td colspan="10" class="empty">Error: ${KoguUi.escapeHtml(e.message)}</td></tr>`;
    }
  }

  function render(rows) {
    $('rows').innerHTML = rows.length ? rows.map(c => {
      const metodo = c.metodo_pago === 'PPD'
        ? '<span class="chip" style="background:#fef3c7;color:#92600c">PPD</span>'
        : (c.metodo_pago === 'PUE' ? '<span class="chip" style="background:#eff6ff;color:#1d4ed8">PUE</span>' : '—');
      const sat = c.match_uuid
        ? '<span class="chip" style="background:#dcfce7;color:#15803d">En SAT</span>'
        : '<span class="chip" style="background:#f1f5f9;color:#475569">Anticipado</span>';
      const nRel = Array.isArray(c.relacionados) ? c.relacionados.length : 0;
      return `<tr>
        <td style="font-size:12px;line-height:1.4">
          <strong>${KoguUi.escapeHtml(c.proveedor_nombre || c.rfc_emisor || '—')}</strong>
          <div style="font-family:monospace;font-size:11px;color:var(--muted,#64748b)">${KoguUi.escapeHtml(c.proveedor_rfc || c.rfc_emisor || '')}</div>
        </td>
        <td>${KoguUi.escapeHtml(TIPO_LABEL[c.tipo_comprobante] || c.tipo_comprobante)}${c.tipo_comprobante === 'P' && nRel ? ` <span class="muted" style="font-size:10px">(${nRel} doc)</span>` : ''}</td>
        <td title="${KoguUi.escapeHtml(c.uuid || '')}" style="font-family:monospace;font-size:11px">${KoguUi.escapeHtml((c.uuid || '').slice(0, 8))}…</td>
        <td style="font-size:12px">${KoguUi.escapeHtml((c.serie || '') + (c.folio ? (c.serie ? '/' : '') + c.folio : '') || '—')}</td>
        <td style="font-size:12px;white-space:nowrap">${fmtDate(c.fecha_emision)}</td>
        <td style="text-align:right;white-space:nowrap;font-weight:600">${c.total != null ? '$' + Number(c.total).toLocaleString('es-MX', { minimumFractionDigits: 2 }) : '—'}</td>
        <td>${metodo}</td>
        <td>${sat}</td>
        <td>${ESTATUS_BADGE[c.status] || KoguUi.escapeHtml(c.status)}</td>
        <td><div class="actions-cell">
          ${c.status !== 'verificado' ? `<button class="btn sm primary btn-ver" data-id="${KoguUi.escapeHtml(c.cfdi_envio_id)}">Verificar</button>` : ''}
          ${c.status !== 'rechazado' ? `<button class="btn sm btn-rej" data-id="${KoguUi.escapeHtml(c.cfdi_envio_id)}" style="border-color:#fca5a5;color:#dc2626">Rechazar</button>` : ''}
        </div></td>
      </tr>`;
    }).join('') : '<tr><td colspan="10" class="empty">Sin CFDI en este filtro.</td></tr>';

    $('meta').textContent = `${rows.length} CFDI`;
    document.querySelectorAll('.btn-ver').forEach(btn => btn.onclick = () => setEstatus(btn, 'verificado'));
    document.querySelectorAll('.btn-rej').forEach(btn => btn.onclick = () => rechazar(btn));
  }

  async function setEstatus(btn, status, observaciones) {
    btn.disabled = true; btn.textContent = '...';
    try {
      await KoguApi.apiFetch('/protected/prov/cfdi/' + btn.dataset.id + '/verificar', {
        method: 'POST', body: JSON.stringify({ status, observaciones: observaciones || null }),
      });
      KoguApi.toast(status === 'verificado' ? 'CFDI verificado.' : 'CFDI rechazado.', 'success');
      await load();
    } catch (e) { KoguApi.toast(e.message, 'error'); await load(); }
  }

  async function rechazar(btn) {
    const motivo = prompt('Motivo del rechazo (opcional):') || '';
    await setEstatus(btn, 'rechazado', motivo.trim() || null);
  }

  $('fTipo').onchange = load;
  $('fVista').onchange = load;
  $('refreshBtn').onclick = load;
  await load();
});

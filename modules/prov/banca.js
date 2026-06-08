// ============================================================
// banca.js — Validación interna de datos bancarios de proveedores.
// Bandeja de cuentas por estatus; validar/rechazar autorización por empresa.
// Sub-proyecto: modulo-proveedores-v1 · Fase 2.
// ============================================================

const BADGE = {
  pendiente: '<span class="chip" style="background:#fef3c7;color:#92600c">Pendiente</span>',
  validada:  '<span class="chip" style="background:#dcfce7;color:#15803d">Validada</span>',
  rechazada: '<span class="chip" style="background:#fee2e2;color:#991b1b">Rechazada</span>',
  revocada:  '<span class="chip" style="background:#fee2e2;color:#991b1b">Revocada</span>',
};

const fmtClabe = s => { const d = String(s || '').replace(/\D/g, ''); return d.length === 18 ? d.replace(/(.{6})(.{6})(.{6})/, '$1 $2 $3') : (s || ''); };

document.addEventListener('DOMContentLoaded', async () => {
  const b = await KoguShell.initShell({
    currentPage:        '/modules/prov/banca.html',
    title:              'Validación Bancaria · Proveedores',
    description:        'Cuentas bancarias registradas por los proveedores. Valida o rechaza antes de usarlas para pagos.',
    requiredPermission: 'screen.prov.banca',
  });
  if (!b) return;

  document.getElementById('pageContent').innerHTML = `
<div class="card">
  <div class="row">
    <div><div class="eyebrow">Proveedores · Tesorería</div><h2>Validación de datos bancarios</h2></div>
    <button class="btn primary" id="refreshBtn">Actualizar</button>
  </div>

  <div class="grid-2" style="margin-top:14px;gap:8px">
    <div>
      <div class="label-text">Estatus</div>
      <select class="select" id="fStatus">
        <option value="pendiente" selected>Pendientes</option>
        <option value="validada">Validadas</option>
        <option value="rechazada">Rechazadas</option>
      </select>
    </div><div></div>
  </div>

  <div class="callout" style="margin-top:12px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px 12px;font-size:12.5px;color:#854d0e">
    ⚠️ Un pago solo debe usar una cuenta <strong>validada</strong>. Un cambio de cuenta genera versión nueva y vuelve a requerir validación.
  </div>

  <div class="table-wrap" style="margin-top:14px">
    <table><thead><tr>
      <th style="min-width:200px">Proveedor</th>
      <th>Banco</th>
      <th>CLABE</th>
      <th>Titular</th>
      <th>Comprobante</th>
      <th>Estatus</th>
      <th style="min-width:170px">Acción</th>
    </tr></thead><tbody id="rows"></tbody></table>
  </div>
  <div id="meta" class="muted" style="margin-top:10px;font-size:12px"></div>
</div>`;

  const $ = id => document.getElementById(id);

  async function load() {
    const status = $('fStatus').value;
    $('rows').innerHTML = '<tr><td colspan="7" class="empty">Cargando…</td></tr>';
    try {
      const res  = await KoguApi.apiFetch('/protected/prov/revision/bancarios?status=' + encodeURIComponent(status));
      const data = KoguApi.unwrapData(res) || {};
      render(data.rows || []);
    } catch (e) {
      $('rows').innerHTML = `<tr><td colspan="7" class="empty">Error: ${KoguUi.escapeHtml(e.message)}</td></tr>`;
    }
  }

  function render(rows) {
    const esPendiente = $('fStatus').value === 'pendiente';
    $('rows').innerHTML = rows.length ? rows.map(r => {
      const acciones = esPendiente
        ? `<div class="actions-cell">
             <button class="btn primary sm btn-ok" data-id="${KoguUi.escapeHtml(r.autorizacion_id)}">Validar</button>
             <button class="btn sm btn-no" data-id="${KoguUi.escapeHtml(r.autorizacion_id)}" style="border-color:#fca5a5;color:#dc2626">Rechazar</button>
           </div>`
        : (r.autorizacion_status === 'rechazada' && r.motivo
            ? `<span class="muted" style="font-size:12px" title="${KoguUi.escapeHtml(r.motivo)}">Motivo: ${KoguUi.escapeHtml(r.motivo)}</span>`
            : '<span class="muted">—</span>');
      return `
        <tr>
          <td style="font-size:12px;line-height:1.4">
            <strong>${KoguUi.escapeHtml(r.proveedor_nombre || '—')}</strong>
            <div style="font-family:monospace;font-size:11px;color:var(--muted,#64748b)">${KoguUi.escapeHtml(r.proveedor_rfc || '')}</div>
          </td>
          <td style="font-size:12px">${KoguUi.escapeHtml(r.banco_nombre || r.banco_codigo || '—')}</td>
          <td style="font-family:monospace;font-size:12px;white-space:nowrap;letter-spacing:.5px">${KoguUi.escapeHtml(fmtClabe(r.clabe) || r.cuenta_15 || '—')}</td>
          <td style="font-size:12px">${KoguUi.escapeHtml(r.titular || '—')}</td>
          <td style="font-size:12px">${r.comprobante_nombre ? KoguUi.escapeHtml(r.comprobante_nombre) : '<span class="muted">—</span>'}</td>
          <td>${BADGE[r.autorizacion_status] || KoguUi.escapeHtml(r.autorizacion_status || '')} ${r.version > 1 ? `<span class="muted" style="font-size:10px">v${r.version}</span>` : ''}</td>
          <td>${acciones}</td>
        </tr>`;
    }).join('') : '<tr><td colspan="7" class="empty">Sin cuentas en este estatus.</td></tr>';

    $('meta').textContent = `${rows.length} cuenta(s)`;
    document.querySelectorAll('.btn-ok').forEach(btn => btn.onclick = () => validar(btn));
    document.querySelectorAll('.btn-no').forEach(btn => btn.onclick = () => rechazar(btn));
  }

  async function validar(btn) {
    const id = btn.dataset.id;
    if (!confirm('¿Validar esta cuenta bancaria? Podrá usarse para pagos de esta empresa.')) return;
    btn.disabled = true; btn.textContent = '...';
    try {
      await KoguApi.apiFetch('/protected/prov/bancarios/autorizacion/' + id + '/validar', { method: 'POST' });
      KoguApi.toast('Cuenta validada.', 'success');
      await load();
    } catch (e) { btn.disabled = false; btn.textContent = 'Validar'; KoguApi.toast(e.message, 'error'); }
  }

  async function rechazar(btn) {
    const id = btn.dataset.id;
    const motivo = prompt('Motivo del rechazo (lo verá el proveedor):');
    if (motivo === null) return;
    if (!motivo.trim()) { KoguApi.toast('El motivo es obligatorio.', 'error'); return; }
    btn.disabled = true; btn.textContent = '...';
    try {
      await KoguApi.apiFetch('/protected/prov/bancarios/autorizacion/' + id + '/rechazar', {
        method: 'POST', body: JSON.stringify({ motivo: motivo.trim() }),
      });
      KoguApi.toast('Cuenta rechazada.', 'success');
      await load();
    } catch (e) { btn.disabled = false; btn.textContent = 'Rechazar'; KoguApi.toast(e.message, 'error'); }
  }

  $('fStatus').onchange = load;
  $('refreshBtn').onclick = load;
  await load();
});

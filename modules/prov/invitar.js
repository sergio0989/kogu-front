// ============================================================
// invitar.js
// Pantalla interna: invitar proveedor al portal + definir requisitos.
// Sub-proyecto: modulo-proveedores-v1.
// ============================================================

const TIPO_DOC = [
  ['constancia_situacion_fiscal', 'Constancia de situación fiscal'],
  ['comprobante_domicilio',       'Comprobante de domicilio'],
  ['acta_constitutiva',           'Acta constitutiva'],
  ['poder_notarial',              'Poder notarial'],
  ['cedula_fiscal',               'Cédula fiscal'],
  ['estado_cuenta_bancario',      'Estado de cuenta bancario'],
  ['contrato_marco',              'Contrato marco'],
  ['registro_patronal_imss',      'Registro patronal IMSS'],
  ['prueba_capacidad_proveedor',  'Prueba de capacidad'],
  ['identificacion_oficial_representante', 'Identificación del representante'],
];

const INV_BADGE = {
  pendiente: '<span class="chip" style="background:#fef3c7;color:#92600c">Pendiente</span>',
  aceptada:  '<span class="chip" style="background:#dcfce7;color:#15803d">Aceptada</span>',
  expirada:  '<span class="chip" style="background:#f1f5f9;color:#475569">Expirada</span>',
  revocada:  '<span class="chip" style="background:#fee2e2;color:#991b1b">Revocada</span>',
};

document.addEventListener('DOMContentLoaded', async () => {
  const b = await KoguShell.initShell({
    currentPage:        '/modules/prov/invitar.html',
    title:              'Invitar Proveedor',
    description:        'Invita a un proveedor al portal y define los documentos que debe entregar. KOGU nunca envía contraseñas: el proveedor define la suya.',
    requiredPermission: 'prov_portal.invitar',
  });
  if (!b) return;

  document.getElementById('pageContent').innerHTML = `
<div class="card">
  <div class="row"><div><div class="eyebrow">Proveedores</div><h2>Invitar al portal</h2></div></div>

  <div class="grid-2" style="margin-top:14px;gap:10px">
    <div>
      <div class="label-text">Proveedor</div>
      <select class="select" id="prov"><option value="">Cargando…</option></select>
      <div class="muted" id="provInfo" style="font-size:11px;margin-top:4px"></div>
    </div>
    <div>
      <div class="label-text">Correo del proveedor</div>
      <input class="input" id="email" type="email" placeholder="contacto@proveedor.com" autocomplete="off"/>
    </div>
  </div>

  <div style="margin-top:14px">
    <div class="label-text">Documentos requeridos (checklist)</div>
    <div id="reqs" style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:6px">
      ${TIPO_DOC.map(([v, l]) => `
        <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:#334155;cursor:pointer">
          <input type="checkbox" class="req-chk" value="${v}" /> ${l}
        </label>`).join('')}
    </div>
    <div class="muted" style="font-size:11px;margin-top:6px">Los requisitos se guardan en el expediente del proveedor (requiere expediente existente).</div>
  </div>

  <div style="margin-top:16px;display:flex;gap:8px">
    <button class="btn primary" id="inviteBtn">Enviar invitación</button>
    <button class="btn" id="refreshBtn">Actualizar lista</button>
  </div>
  <div id="msg" class="muted" style="font-size:12px;margin-top:8px"></div>
</div>

<div class="card" style="margin-top:16px">
  <div class="eyebrow">Historial</div>
  <h2 style="margin-bottom:6px">Invitaciones</h2>
  <div class="table-wrap" style="margin-top:10px">
    <table><thead><tr><th>Correo</th><th>Enviada</th><th>Vence</th><th>Estatus</th><th style="text-align:right">Acción</th></tr></thead>
    <tbody id="invRows"><tr><td colspan="5" class="empty">Cargando…</td></tr></tbody></table>
  </div>
</div>`;

  const $ = id => document.getElementById(id);
  const fmtDate = d => d ? new Date(d).toLocaleDateString('es-MX') : '—';

  let proveedores = [];
  let expByProv = {};   // proveedor_id -> expediente_id

  async function loadCatalogos() {
    // Proveedores
    try {
      const res = await KoguApi.apiFetch('/protected/core/proveedores');
      proveedores = KoguApi.unwrapRows(res) || [];
    } catch (e) { proveedores = []; }
    // Expedientes (para resolver expediente_id por proveedor)
    try {
      const res = await KoguApi.apiFetch('/protected/exp/expedientes');
      const data = KoguApi.unwrapData(res);
      const rows = (data && data.rows) || (Array.isArray(data) ? data : []);
      expByProv = {};
      rows.forEach(r => { if (r.proveedor_id) expByProv[r.proveedor_id] = r.expediente_id; });
    } catch (e) { expByProv = {}; }

    $('prov').innerHTML = '<option value="">Selecciona un proveedor…</option>' +
      proveedores.map(p => `<option value="${KoguUi.escapeHtml(p.proveedor_id)}" data-email="${KoguUi.escapeHtml(p.email_contacto || '')}" data-rfc="${KoguUi.escapeHtml(p.rfc || '')}">${KoguUi.escapeHtml(p.nombre || p.nombre_proveedor || '')} ${p.rfc ? '· ' + KoguUi.escapeHtml(p.rfc) : ''}</option>`).join('');
  }

  $('prov').onchange = () => {
    const opt = $('prov').selectedOptions[0];
    if (!opt || !opt.value) { $('provInfo').textContent = ''; return; }
    const provId = opt.value;
    const email = opt.dataset.email;
    if (email && !$('email').value) $('email').value = email;
    const exp = expByProv[provId];
    $('provInfo').innerHTML = exp
      ? '✅ Tiene expediente — los requisitos se guardarán.'
      : '⚠️ Sin expediente: la invitación se envía igual, pero los requisitos no se guardarán hasta crear su expediente.';
  };

  async function invitar() {
    const provId = $('prov').value;
    const email = $('email').value.trim();
    if (!provId) { KoguApi.toast('Selecciona un proveedor.', 'error'); return; }
    if (!email)  { KoguApi.toast('Captura el correo del proveedor.', 'error'); return; }
    const expedienteId = expByProv[provId] || null;
    const reqs = Array.from(document.querySelectorAll('.req-chk:checked')).map(c => c.value);

    const btn = $('inviteBtn'); btn.disabled = true; btn.textContent = 'Enviando…';
    try {
      const body = { proveedor_id: provId, email };
      if (expedienteId) body.expediente_id = expedienteId;
      await KoguApi.apiFetch('/protected/prov/invitaciones', { method: 'POST', body: JSON.stringify(body) });

      // Requisitos (solo si hay expediente)
      if (expedienteId && reqs.length) {
        await KoguApi.apiFetch('/protected/prov/expedientes/' + expedienteId + '/requisitos', {
          method: 'PUT',
          body: JSON.stringify({ requisitos: reqs.map(t => ({ tipo_documento: t, obligatorio: true })) }),
        });
      }

      KoguApi.toast('Invitación enviada' + (expedienteId && reqs.length ? ' · requisitos guardados' : ''), 'success');
      $('email').value = '';
      document.querySelectorAll('.req-chk:checked').forEach(c => c.checked = false);
      await loadInvitaciones();
    } catch (e) {
      KoguApi.toast(e.message, 'error');
    } finally {
      btn.disabled = false; btn.textContent = 'Enviar invitación';
    }
  }

  async function loadInvitaciones() {
    try {
      const res = await KoguApi.apiFetch('/protected/prov/invitaciones');
      const data = KoguApi.unwrapData(res);
      const rows = (data && data.rows) || [];
      $('invRows').innerHTML = rows.length ? rows.map(r => `
        <tr>
          <td>${KoguUi.escapeHtml(r.email_destino || '—')}</td>
          <td style="font-size:12px;white-space:nowrap">${fmtDate(r.created_at)}</td>
          <td style="font-size:12px;white-space:nowrap">${fmtDate(r.expira_at)}</td>
          <td>${INV_BADGE[r.status] || KoguUi.escapeHtml(r.status)}</td>
          <td style="text-align:right">${r.status === 'pendiente'
            ? `<button class="btn sm btn-rev" data-id="${KoguUi.escapeHtml(r.invitacion_id)}" style="border-color:#fca5a5;color:#dc2626">Revocar</button>`
            : '<span class="muted">—</span>'}</td>
        </tr>`).join('') : '<tr><td colspan="5" class="empty">Sin invitaciones.</td></tr>';

      document.querySelectorAll('.btn-rev').forEach(btn => btn.onclick = async () => {
        if (!confirm('¿Revocar esta invitación?')) return;
        try {
          await KoguApi.apiFetch('/protected/prov/invitaciones/' + btn.dataset.id + '/revocar', { method: 'POST' });
          KoguApi.toast('Invitación revocada', 'success');
          await loadInvitaciones();
        } catch (e) { KoguApi.toast(e.message, 'error'); }
      });
    } catch (e) {
      $('invRows').innerHTML = `<tr><td colspan="5" class="empty">Error: ${KoguUi.escapeHtml(e.message)}</td></tr>`;
    }
  }

  $('inviteBtn').onclick = invitar;
  $('refreshBtn').onclick = loadInvitaciones;

  await loadCatalogos();
  await loadInvitaciones();
});

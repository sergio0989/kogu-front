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
    <div style="position:relative">
      <div class="label-text">Proveedor</div>
      <input class="input" id="provSearch" placeholder="Buscar por nombre o RFC…" autocomplete="off"/>
      <input type="hidden" id="provId"/>
      <div id="provList" style="display:none;position:absolute;z-index:30;left:0;right:0;top:64px;max-height:280px;overflow:auto;background:#fff;border:1px solid var(--line,#e2e8f0);border-radius:10px;box-shadow:0 10px 25px rgba(15,23,42,.12)"></div>
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

    $('provSearch').placeholder = `Buscar entre ${proveedores.length} proveedores por nombre o RFC…`;
  }

  // ── Buscador con filtro (reemplaza el <select> con miles de opciones) ──
  const mapNom = p => p.nombre || p.nombre_proveedor || p.razon_social || '';
  function seleccionarProv(p) {
    $('provId').value = p.proveedor_id;
    $('provSearch').value = mapNom(p) + (p.rfc ? ' · ' + p.rfc : '');
    $('provList').style.display = 'none';
    if (p.email_contacto && !$('email').value) $('email').value = p.email_contacto;
    $('provInfo').innerHTML = expByProv[p.proveedor_id]
      ? '✅ Ya tiene expediente.'
      : 'ℹ️ Se creará su expediente al invitar.';
  }
  function filtrar() {
    const q = $('provSearch').value.trim().toLowerCase();
    $('provId').value = '';  // se invalida hasta elegir de la lista
    if (q.length < 2) { $('provList').style.display = 'none'; return; }
    const res = proveedores.filter(p =>
      mapNom(p).toLowerCase().includes(q) || String(p.rfc || '').toLowerCase().includes(q)
    ).slice(0, 30);
    $('provList').innerHTML = res.length ? res.map((p, i) => `
      <div class="prov-opt" data-i="${proveedores.indexOf(p)}" style="padding:9px 12px;cursor:pointer;border-top:${i ? '1px solid var(--line,#eef2f7)' : 'none'};font-size:13px">
        <strong>${KoguUi.escapeHtml(mapNom(p))}</strong>
        ${p.rfc ? `<span style="font-family:monospace;font-size:11px;color:var(--muted,#64748b);margin-left:6px">${KoguUi.escapeHtml(p.rfc)}</span>` : ''}
      </div>`).join('') : '<div style="padding:10px 12px;color:#64748b;font-size:13px">Sin coincidencias</div>';
    $('provList').style.display = 'block';
    $('provList').querySelectorAll('.prov-opt').forEach(el => el.onclick = () => seleccionarProv(proveedores[Number(el.dataset.i)]));
  }
  $('provSearch').addEventListener('input', filtrar);
  $('provSearch').addEventListener('focus', () => { if ($('provSearch').value.trim().length >= 2) filtrar(); });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#provList') && e.target.id !== 'provSearch') $('provList').style.display = 'none';
  });

  async function invitar() {
    const provId = $('provId').value;
    const email = $('email').value.trim();
    if (!provId) { KoguApi.toast('Selecciona un proveedor de la lista.', 'error'); return; }
    if (!email)  { KoguApi.toast('Captura el correo del proveedor.', 'error'); return; }
    const expedienteId = expByProv[provId] || null;
    const reqs = Array.from(document.querySelectorAll('.req-chk:checked')).map(c => c.value);

    const btn = $('inviteBtn'); btn.disabled = true; btn.textContent = 'Enviando…';
    try {
      // La invitación lleva los requisitos; el backend crea/asegura el expediente
      // y los guarda (aunque el proveedor aún no tuviera expediente).
      const body = { proveedor_id: provId, email, requisitos: reqs };
      if (expedienteId) body.expediente_id = expedienteId;
      await KoguApi.apiFetch('/protected/prov/invitaciones', { method: 'POST', body: JSON.stringify(body) });

      KoguApi.toast('Invitación enviada' + (reqs.length ? ' · requisitos guardados' : ''), 'success');
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

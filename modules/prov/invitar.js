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
    description:        'Invita a un proveedor al portal y define o edita los documentos que debe entregar. Selecciona un proveedor para ver su expediente y ajustar su lista de requisitos. KOGU nunca envía contraseñas: el proveedor define la suya.',
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
    <div class="muted" style="font-size:11px;margin-top:6px">Al invitar se guardan en el expediente. Si el proveedor ya fue invitado, usa <strong>Guardar requisitos</strong> para definirlos/actualizarlos sin reenviar la invitación.</div>
  </div>

  <div style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap">
    <button class="btn primary" id="inviteBtn">Enviar invitación</button>
    <button class="btn" id="saveReqBtn" title="Guarda los requisitos marcados en el expediente del proveedor seleccionado (sin reenviar invitación)">Guardar requisitos</button>
    <button class="btn" id="refreshBtn">Actualizar lista</button>
  </div>
  <div id="msg" class="muted" style="font-size:12px;margin-top:8px"></div>
</div>

<div class="card" style="margin-top:16px">
  <div class="eyebrow">Historial</div>
  <h2 style="margin-bottom:6px">Invitaciones</h2>
  <div class="table-wrap" style="margin-top:10px">
    <table><thead><tr><th>Proveedor</th><th>RFC</th><th>Folio</th><th>Correo</th><th>Enviada</th><th>Vence</th><th>Estatus</th><th style="text-align:right">Acción</th></tr></thead>
    <tbody id="invRows"><tr><td colspan="8" class="empty">Cargando…</td></tr></tbody></table>
  </div>
</div>`;

  const $ = id => document.getElementById(id);
  const fmtDate = d => d ? new Date(d).toLocaleDateString('es-MX') : '—';

  let proveedores = [];
  let expByProv = {};     // proveedor_id -> expediente_id
  let folioByProv = {};   // proveedor_id -> folio (id_mov del expediente)

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
      expByProv = {}; folioByProv = {};
      rows.forEach(r => {
        if (r.proveedor_id) {
          expByProv[r.proveedor_id] = r.expediente_id;
          folioByProv[r.proveedor_id] = r.id_mov ?? r.folio ?? null;
        }
      });
    } catch (e) { expByProv = {}; folioByProv = {}; }

    $('provSearch').placeholder = `Buscar entre ${proveedores.length} proveedores por nombre o RFC…`;
  }

  // ── Buscador con filtro (reemplaza el <select> con miles de opciones) ──
  const mapNom = p => p.nombre || p.nombre_proveedor || p.razon_social || '';
  function limpiarChecklist() {
    document.querySelectorAll('.req-chk:checked').forEach(c => c.checked = false);
  }
  async function cargarRequisitosActuales(expedienteId) {
    limpiarChecklist();
    if (!expedienteId) return;
    try {
      const res = await KoguApi.apiFetch('/protected/prov/expedientes/' + expedienteId + '/requisitos');
      const data = KoguApi.unwrapData(res);
      const rows = (data && data.rows) || [];
      const set = new Set(rows.map(r => r.tipo_documento));
      document.querySelectorAll('.req-chk').forEach(c => { c.checked = set.has(c.value); });
    } catch (e) { /* sin requisitos previos: checklist queda vacío */ }
  }
  async function seleccionarProv(p) {
    const provId = p.proveedor_id;
    $('provId').value = provId;
    $('provSearch').value = mapNom(p) + (p.rfc ? ' · ' + p.rfc : '');
    $('provList').style.display = 'none';
    if (p.email_contacto && !$('email').value) $('email').value = p.email_contacto;

    const expId = expByProv[provId];
    const folio = folioByProv[provId];
    $('provInfo').innerHTML = `
      <div style="margin-top:8px;padding:10px 12px;border:1px solid var(--line,#e2e8f0);border-radius:10px;background:#f8fafc;display:flex;flex-wrap:wrap;gap:18px;align-items:center;font-size:12px">
        <span><span style="color:#64748b">Nombre:</span> <strong>${KoguUi.escapeHtml(mapNom(p) || '—')}</strong></span>
        <span><span style="color:#64748b">RFC:</span> <strong style="font-family:monospace">${KoguUi.escapeHtml(p.rfc || '—')}</strong></span>
        <span><span style="color:#64748b">Folio:</span> <strong>${folio != null ? '#' + KoguUi.escapeHtml(String(folio)) : '—'}</strong></span>
        <span style="margin-left:auto">${expId
          ? '<span class="chip" style="background:#dcfce7;color:#15803d">✅ Con expediente</span>'
          : '<span class="chip" style="background:#fef3c7;color:#92600c">Se crea al invitar</span>'}</span>
      </div>`;

    // Precargar el checklist actual del expediente (para editar la lista existente).
    await cargarRequisitosActuales(expId);
  }
  function filtrar() {
    const q = $('provSearch').value.trim().toLowerCase();
    $('provId').value = '';  // se invalida hasta elegir de la lista
    $('provInfo').innerHTML = '';
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

  async function guardarRequisitos() {
    const provId = $('provId').value;
    if (!provId) { KoguApi.toast('Selecciona un proveedor de la lista.', 'error'); return; }
    const expedienteId = expByProv[provId] || null;
    if (!expedienteId) { KoguApi.toast('El proveedor aún no tiene expediente. Invítalo primero (se crea al invitar).', 'error'); return; }
    const reqs = Array.from(document.querySelectorAll('.req-chk:checked')).map(c => c.value);
    if (!reqs.length) { KoguApi.toast('Marca al menos un requisito.', 'error'); return; }

    const btn = $('saveReqBtn'); btn.disabled = true; btn.textContent = 'Guardando…';
    try {
      const body = { requisitos: reqs.map(t => ({ tipo_documento: t, obligatorio: true })) };
      await KoguApi.apiFetch('/protected/prov/expedientes/' + expedienteId + '/requisitos', { method: 'PUT', body: JSON.stringify(body) });
      KoguApi.toast(`Lista actualizada (${reqs.length} requisito${reqs.length === 1 ? '' : 's'}) · el proveedor la verá en su portal`, 'success');
    } catch (e) {
      KoguApi.toast(e.message, 'error');
    } finally {
      btn.disabled = false; btn.textContent = 'Guardar requisitos';
    }
  }

  async function loadInvitaciones() {
    try {
      const res = await KoguApi.apiFetch('/protected/prov/invitaciones');
      const data = KoguApi.unwrapData(res);
      const rows = (data && data.rows) || [];
      $('invRows').innerHTML = rows.length ? rows.map(r => `
        <tr>
          <td>${KoguUi.escapeHtml(r.proveedor_nombre || '—')}</td>
          <td style="font-family:monospace;font-size:12px;white-space:nowrap">${KoguUi.escapeHtml(r.proveedor_rfc || '—')}</td>
          <td style="font-size:12px;white-space:nowrap">${r.folio != null ? '#' + KoguUi.escapeHtml(String(r.folio)) : '—'}</td>
          <td>${KoguUi.escapeHtml(r.email_destino || '—')}</td>
          <td style="font-size:12px;white-space:nowrap">${fmtDate(r.created_at)}</td>
          <td style="font-size:12px;white-space:nowrap">${fmtDate(r.expira_at)}</td>
          <td>${INV_BADGE[r.status] || KoguUi.escapeHtml(r.status)}</td>
          <td style="text-align:right">${r.status === 'pendiente'
            ? `<button class="btn sm btn-rev" data-id="${KoguUi.escapeHtml(r.invitacion_id)}" style="border-color:#fca5a5;color:#dc2626">Revocar</button>`
            : '<span class="muted">—</span>'}</td>
        </tr>`).join('') : '<tr><td colspan="8" class="empty">Sin invitaciones.</td></tr>';

      document.querySelectorAll('.btn-rev').forEach(btn => btn.onclick = async () => {
        if (!confirm('¿Revocar esta invitación?')) return;
        try {
          await KoguApi.apiFetch('/protected/prov/invitaciones/' + btn.dataset.id + '/revocar', { method: 'POST' });
          KoguApi.toast('Invitación revocada', 'success');
          await loadInvitaciones();
        } catch (e) { KoguApi.toast(e.message, 'error'); }
      });
    } catch (e) {
      $('invRows').innerHTML = `<tr><td colspan="8" class="empty">Error: ${KoguUi.escapeHtml(e.message)}</td></tr>`;
    }
  }

  $('inviteBtn').onclick = invitar;
  $('saveReqBtn').onclick = guardarRequisitos;
  $('refreshBtn').onclick = loadInvitaciones;

  await loadCatalogos();
  await loadInvitaciones();
});

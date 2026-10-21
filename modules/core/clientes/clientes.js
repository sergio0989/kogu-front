window.__MODULE_DEF__ = {
  currentPage: '/modules/core/clientes/clientes.html',
  title:       'Clientes',
  description: 'Catálogo base multiempresa para clientes.',
  singular:    'cliente',
  basePath:    '/protected/core/clientes',
  idField:     'cliente_id',
  buildPayload: x => ({ nombre: x.nombre, rfc: x.rfc, cve_cte: x.cve_cte || null, activo: x.activo })
};

document.addEventListener('DOMContentLoaded', async () => {
  const MODULE = window.__MODULE_DEF__;

  const b = await KoguShell.initShell({
    currentPage:        MODULE.currentPage,
    title:              MODULE.title,
    description:        MODULE.description,
    requiredPermission: 'screen.catalogos.clientes'
  });
  if (!b) return;

  const c = document.getElementById('pageContent');
  c.innerHTML = `
<div>

  <!-- ── Lista (ancho completo; la ficha se abre en modal) ── -->
  <div class="card">
    <div class="row">
      <div><div class="eyebrow">Listado</div><h2>${MODULE.title}</h2></div>
      <div class="page-actions">
        <button class="btn" id="refreshBtn">Actualizar</button>
        <button class="btn primary" id="newBtn">Nuevo cliente</button>
      </div>
    </div>
    <div class="grid-2" style="margin-top:16px">
      <input  class="input"  id="q"           placeholder="Buscar por nombre o RFC" />
      <select class="select" id="activoFiltro">
        <option value="">Todos</option>
        <option value="true">Activos</option>
        <option value="false">Inactivos</option>
      </select>
    </div>
    <div class="table-wrap" style="margin-top:16px">
      <table><thead><tr>
        <th>Nombre</th><th>RFC</th><th style="width:110px">Cve SAI</th><th>Activo</th><th>Acciones</th>
      </tr></thead><tbody id="rows"></tbody></table>
    </div>
    <div id="pgBar" style="display:flex;align-items:center;justify-content:space-between;margin-top:10px;font-size:13px;color:var(--muted)"></div>
  </div>

  <!-- ── Ficha del cliente (modal) ── -->
  <div class="modal-backdrop" id="clModal" hidden>
  <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="formTitle">
    <div class="row">
      <div><div class="eyebrow">Ficha del cliente</div><h2 id="formTitle">Alta de ${MODULE.singular}</h2></div>
      <div style="display:flex;gap:8px;align-items:center">
        <span class="chip" id="modeChip">Alta</span>
        <button class="btn" id="clCerrar">Cerrar</button>
      </div>
    </div>
    <div class="stack" style="margin-top:16px">
      <input type="hidden" id="id" />
      <div class="tabs" id="clTabs">
        <button class="tab active" data-tab="general">General</button>
        <button class="tab" data-tab="cobranza">Cobranza</button>
        <button class="tab" data-tab="contactos">Contactos</button>
      </div>
      <div id="tab-general" class="stack">
      <div><div class="label-text">Nombre</div><input class="input" id="nombre" /></div>
      <div><div class="label-text">RFC</div><input class="input" id="rfc" /></div>
      <div>
        <div class="label-text">Cve SAI <span style="color:var(--muted);font-weight:400;font-size:11px">(cve_cte — identificador ERP)</span></div>
        <input class="input" id="cveCte" placeholder="Ej. C0001" />
      </div>
      <div>
        <div class="label-text">Activo</div>
        <select class="select" id="activo">
          <option value="true">Sí</option>
          <option value="false">No</option>
        </select>
      </div>
      </div>
      <div id="tab-cobranza" class="stack" style="display:none">${htmlCobranza()}</div>
      <div id="tab-contactos" class="stack" style="display:none">${htmlContactos()}</div>
      <div class="page-actions">
        <button class="btn primary" id="saveBtn">Guardar</button>
        <button class="btn"         id="statusBtn">Cambiar status</button>
        <button class="btn"         id="clCerrarPie">Cerrar</button>
      </div>
    </div>
  </div>
  </div>

</div>`;

  // ── Cobranza (F0): pestaña y contactos ───────────────────────────────────
  // La lógica pura vive en clientes-cobranza.js (tests/clientes-cobranza.test.mjs).
  function htmlCobranza() {
    const CB = window.KoguClientesCobranza;
    const esc = KoguUi.escapeHtml;
    const opts = (m) => Object.entries(m).map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('');
    const dias = (pref) => `<div style="display:flex;gap:10px;flex-wrap:wrap">${CB.DIAS.map(d =>
      `<label style="display:flex;gap:4px;align-items:center;font-size:13px"><input type="checkbox" id="cb_${pref}_${d}"> ${d[0].toUpperCase() + d.slice(1)}</label>`).join('')}</div>`;
    const portal = (cual, tit, campoUrl, campoUsr) => `
      <div class="eyebrow" style="margin-top:6px">${tit}</div>
      <label style="display:flex;gap:6px;align-items:center;font-size:13px"><input type="checkbox" id="cb_usa_portal_${cual === 'fact' ? 'facturas' : 'pagos'}"> Usa portal</label>
      <div class="grid-2">
        <div><div class="label-text">URL</div><input class="input" id="cb_${campoUrl}" placeholder="https://"></div>
        <div><div class="label-text">Usuario</div><input class="input" id="cb_${campoUsr}"></div>
      </div>
      <div><div class="label-text">Contraseña <span class="muted" id="cb_estado_${cual}" style="font-weight:400;font-size:11px"></span></div>
        <input class="input" type="password" id="cb_${CB.PASS[cual]}" autocomplete="new-password" placeholder="Escribe solo para cambiarla">
        <label style="display:flex;gap:6px;align-items:center;font-size:12px;margin-top:6px" class="muted"><input type="checkbox" id="cb_borrar_${CB.PASS[cual]}"> Borrar la contraseña guardada</label>
      </div>`;
    return `
      <div class="eyebrow">Crédito</div>
      <div class="grid-2">
        <div><div class="label-text">Condición de pago</div><select class="select" id="cb_condicion_pago">${opts({ contado: 'Contado', credito: 'Crédito', anticipado: 'Anticipado' })}</select></div>
        <div><div class="label-text">Días de crédito</div><input class="input" id="cb_dias_credito" inputmode="numeric"></div>
        <div><div class="label-text">Límite de crédito</div><input class="input" id="cb_limite_credito" inputmode="decimal"></div>
        <div><div class="label-text">Moneda del límite</div><select class="select" id="cb_moneda_limite">${opts({ MXN: 'MXN', USD: 'USD' })}</select></div>
      </div>
      <div class="eyebrow" style="margin-top:6px">Revisión y cobro</div>
      <div><div class="label-text">El plazo corre desde</div><select class="select" id="cb_tipo_fecha">${opts({ factura: 'La factura', revision: 'La revisión (contrarrecibo)' })}</select></div>
      <div><div class="label-text">Días de revisión</div>${dias('rev')}</div>
      <div class="grid-2">
        <div><div class="label-text">Revisión desde</div><input class="input" type="time" id="cb_hora_revision_ini"></div>
        <div><div class="label-text">Revisión hasta</div><input class="input" type="time" id="cb_hora_revision_fin"></div>
      </div>
      <div><div class="label-text">Días de cobro</div>${dias('cob')}</div>
      <div class="grid-2">
        <div><div class="label-text">Cobro desde</div><input class="input" type="time" id="cb_hora_cobro_ini"></div>
        <div><div class="label-text">Cobro hasta</div><input class="input" type="time" id="cb_hora_cobro_fin"></div>
      </div>
      ${portal('fact', 'Portal de facturas', 'url_portal_facturas', 'usuario_portal_fact')}
      ${portal('pago', 'Portal de pagos', 'url_portal_pagos', 'usuario_portal_pago')}
      <div class="eyebrow" style="margin-top:6px">Factoraje y estado de cuenta</div>
      <label style="display:flex;gap:6px;align-items:center;font-size:13px"><input type="checkbox" id="cb_cobro_factoraje"> Se cobra por plataforma de factoraje</label>
      <div><div class="label-text">Plataforma / banco</div><input class="input" id="cb_plataforma_factoraje"></div>
      <div><div class="label-text">Envío de estado de cuenta</div><select class="select" id="cb_envio_edo_cta">${opts(CB.ENVIO_EDO_CTA)}</select></div>
      <div><div class="label-text">Responsable de cobranza</div><select class="select" id="cb_responsable_cobranza_id"><option value="">— sin responsable —</option></select>
        <div class="muted" id="cb_resp_aviso" style="font-size:11px;margin-top:4px"></div></div>
      <div class="eyebrow" style="margin-top:6px">Bloqueo de crédito</div>
      <label style="display:flex;gap:6px;align-items:center;font-size:13px"><input type="checkbox" id="cb_bloqueo_credito"> Crédito bloqueado</label>
      <div><div class="label-text">Motivo</div><textarea class="input" id="cb_bloqueo_motivo" rows="2"></textarea>
        <div class="muted" id="cb_bloqueo_info" style="font-size:11px;margin-top:4px"></div></div>`;
  }

  function htmlContactos() {
    const CB = window.KoguClientesCobranza;
    const opts = Object.entries(CB.ROLES).map(([v, l]) => `<option value="${v}">${KoguUi.escapeHtml(l)}</option>`).join('');
    return `
      <div class="muted" id="ctSinCliente" style="font-size:13px">Guarda el cliente para agregar contactos.</div>
      <div id="ctPanel" style="display:none">
        <div class="table-wrap"><table><thead><tr>
          <th>Nombre</th><th>Rol</th><th>Email</th><th>Edo. cta</th><th></th>
        </tr></thead><tbody id="ctRows"></tbody></table></div>
        <div class="eyebrow" style="margin-top:12px" id="ctTitulo">Nuevo contacto</div>
        <input type="hidden" id="ct_id">
        <div class="grid-2" style="margin-top:8px">
          <div><div class="label-text">Nombre</div><input class="input" id="ct_nombre"></div>
          <div><div class="label-text">Rol</div><select class="select" id="ct_rol">${opts}</select></div>
          <div><div class="label-text">Puesto</div><input class="input" id="ct_puesto"></div>
          <div><div class="label-text">Email</div><input class="input" id="ct_email" type="email"></div>
          <div><div class="label-text">Teléfono</div><input class="input" id="ct_telefono"></div>
          <div><div class="label-text">WhatsApp</div><input class="input" id="ct_whatsapp"></div>
        </div>
        <div style="display:flex;gap:14px;margin-top:8px;font-size:13px">
          <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="ct_recibe_edo_cta"> Recibe estado de cuenta</label>
          <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="ct_principal"> Principal de su rol</label>
        </div>
        <div class="page-actions" style="margin-top:10px">
          <button class="btn primary" id="ctGuardar">Guardar contacto</button>
          <button class="btn" id="ctNuevo">Nuevo contacto</button>
        </div>
      </div>`;
  }

  // ── Estado ────────────────────────────────────────────────────────────────
  const PAGE_SIZE  = 50;
  let rows         = [];
  let currentPage  = 1;
  let original     = null;   // cliente completo en edición (GET /clientes/:id)
  let contactos    = [];
  const CB = window.KoguClientesCobranza;

  const val  = id => document.getElementById(id).value.trim();
  const mapName = r => r.nombre || r.nombre_cliente || r.razon_social || '';
  const mapRfc  = r => r.rfc || r.rfc_cliente || '';
  const mapId   = r => r[MODULE.idField] || r.id || '';

  // ── Helpers formulario ────────────────────────────────────────────────────
  function reset() {
    ['id', 'nombre', 'rfc', 'cveCte'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('activo').value    = 'true';
    document.getElementById('formTitle').textContent = 'Alta de ' + MODULE.singular;
    document.getElementById('modeChip').textContent  = 'Alta';
    original = null; contactos = [];
    pintarCobranza(null); pintarContactos(); limpiarContacto();
  }

  function fill(r) {
    document.getElementById('id').value      = mapId(r);
    document.getElementById('nombre').value  = mapName(r);
    document.getElementById('rfc').value     = mapRfc(r);
    document.getElementById('cveCte').value  = r.cve_cte || '';
    document.getElementById('activo').value  = String(!!r.activo);
    document.getElementById('formTitle').textContent = 'Editar ' + MODULE.singular;
    document.getElementById('modeChip').textContent  = 'Edición';
    original = r;
    pintarCobranza(r); limpiarContacto(); cargarContactos();
  }

  // Abre el cliente completo: la lista solo trae columnas de resumen.
  async function abrir(id) {
    try {
      const res = await KoguApi.apiFetch(MODULE.basePath + '/' + id);
      fill(res.data || res);
      activarTab('general');
      abrirModal();
    } catch (err) { avisar(err); }
  }

  function abrirModal()  { document.getElementById('clModal').hidden = false; }
  function cerrarModal() { document.getElementById('clModal').hidden = true; }

  function activarTab(t) {
    document.querySelectorAll('#clTabs .tab').forEach(b => b.classList.toggle('active', b.dataset.tab === t));
    // display explícito: el atributo hidden pierde contra .stack{display:grid}.
    ['general', 'cobranza', 'contactos'].forEach(x => { document.getElementById('tab-' + x).style.display = x === t ? '' : 'none'; });
  }

  // api.js ya avisa en 401/403/409/422; lo demás (400, validaciones locales) avisa aquí.
  const avisar = (err) => { if (![401, 403, 409, 422].includes(err && err.status)) KoguApi.toast(err.message, 'error'); };

  const $c = (k) => document.getElementById('cb_' + k);

  function pintarCobranza(r) {
    const f = CB.formDesdeCliente(r);
    [...CB.CAMPOS_SELECT, ...CB.CAMPOS_TEXTO, ...CB.CAMPOS_NUM].forEach(k => { if ($c(k)) $c(k).value = f[k] ?? ''; });
    const resp = $c('responsable_cobranza_id');
    if (f.responsable_cobranza_id && ![...resp.options].some(o => o.value === f.responsable_cobranza_id)) {
      resp.insertAdjacentHTML('beforeend', `<option value="${KoguUi.escapeHtml(f.responsable_cobranza_id)}">Usuario asignado</option>`);
    }
    resp.value = f.responsable_cobranza_id || '';
    CB.CAMPOS_BOOL.forEach(k => { if ($c(k)) $c(k).checked = !!f[k]; });
    $c('bloqueo_credito').checked = f.bloqueo_credito;
    $c('bloqueo_motivo').value = f.bloqueo_motivo;
    Object.values(CB.PASS).forEach(p => { $c(p).value = ''; $c('borrar_' + p).checked = false; });
    document.getElementById('cb_estado_fact').textContent = '· ' + CB.estadoPass(r, 'fact');
    document.getElementById('cb_estado_pago').textContent = '· ' + CB.estadoPass(r, 'pago');
    document.getElementById('cb_bloqueo_info').textContent = r && r.bloqueo_credito && r.bloqueo_at
      ? 'Bloqueado desde ' + String(r.bloqueo_at).slice(0, 10) : '';
  }

  function leerCobranza() {
    const f = {};
    [...CB.CAMPOS_SELECT, ...CB.CAMPOS_TEXTO, ...CB.CAMPOS_NUM].forEach(k => { f[k] = $c(k).value; });
    CB.CAMPOS_BOOL.forEach(k => { f[k] = $c(k).checked; });
    f.bloqueo_credito = $c('bloqueo_credito').checked;
    f.bloqueo_motivo = $c('bloqueo_motivo').value;
    Object.values(CB.PASS).forEach(p => { f[p] = $c(p).value; f['borrar_' + p] = $c('borrar_' + p).checked; });
    return f;
  }

  async function cargarResponsables(perms) {
    const sel = $c('responsable_cobranza_id');
    if (!(perms || []).some(p => p === '*' || p === 'screen.catalogos.usuarios')) {
      document.getElementById('cb_resp_aviso').textContent = 'Tu perfil no puede ver la lista de usuarios; pide a un administrador que asigne el responsable.';
      sel.disabled = true;
      return;
    }
    try {
      const us = KoguApi.unwrapRows(await KoguApi.apiFetch('/protected/core/usuarios')) || [];
      sel.innerHTML = '<option value="">— sin responsable —</option>' + us.filter(u => u.activo !== false)
        .map(u => `<option value="${KoguUi.escapeHtml(u.user_id)}">${KoguUi.escapeHtml(u.nombre || u.email || u.user_id)}</option>`).join('');
      if (original) sel.value = original.responsable_cobranza_id || '';
    } catch (err) { avisar(err); }
  }

  // ── Contactos ─────────────────────────────────────────────────────────────
  const $t = (k) => document.getElementById('ct_' + k);

  function pintarContactos() {
    const id = document.getElementById('id').value;
    document.getElementById('ctSinCliente').style.display = id ? 'none' : '';
    document.getElementById('ctPanel').style.display = id ? '' : 'none';
    const esc = KoguUi.escapeHtml;
    document.getElementById('ctRows').innerHTML = contactos.length ? contactos.map(k => `
      <tr style="${k.activo ? '' : 'opacity:.55'}">
        <td>${esc(k.nombre)}${k.principal ? ' <span class="chip">Principal</span>' : ''}${k.activo ? '' : ' <span class="muted">(baja)</span>'}</td>
        <td>${esc(CB.ROLES[k.rol] || k.rol)}</td>
        <td style="font-size:12px">${esc(k.email || '—')}</td>
        <td>${k.recibe_edo_cta ? 'Sí' : '—'}</td>
        <td class="actions-cell">
          <button class="btn ct-edit" data-id="${esc(k.contacto_id)}">Editar</button>
          <button class="btn ct-baja" data-id="${esc(k.contacto_id)}" data-activo="${k.activo}">${k.activo ? 'Baja' : 'Reactivar'}</button>
        </td>
      </tr>`).join('') : '<tr><td colspan="5" class="empty">Sin contactos</td></tr>';
    document.querySelectorAll('.ct-edit').forEach(b => b.onclick = () => editarContacto(b.dataset.id));
    document.querySelectorAll('.ct-baja').forEach(b => b.onclick = () => cambiarActivoContacto(b.dataset.id, b.dataset.activo !== 'true'));
  }

  async function cargarContactos() {
    const id = document.getElementById('id').value;
    contactos = [];
    if (id) {
      try { contactos = KoguApi.unwrapRows(await KoguApi.apiFetch(`${MODULE.basePath}/${id}/contactos`)) || []; }
      catch (err) { avisar(err); }
    }
    pintarContactos();
  }

  function limpiarContacto() {
    ['id', 'nombre', 'puesto', 'email', 'telefono', 'whatsapp'].forEach(k => { $t(k).value = ''; });
    $t('rol').value = 'cobranza'; $t('recibe_edo_cta').checked = false; $t('principal').checked = false;
    document.getElementById('ctTitulo').textContent = 'Nuevo contacto';
  }

  function editarContacto(contactoId) {
    const k = contactos.find(x => x.contacto_id === contactoId);
    if (!k) return;
    $t('id').value = k.contacto_id;
    ['nombre', 'puesto', 'email', 'telefono', 'whatsapp'].forEach(f => { $t(f).value = k[f] || ''; });
    $t('rol').value = k.rol; $t('recibe_edo_cta').checked = !!k.recibe_edo_cta; $t('principal').checked = !!k.principal;
    document.getElementById('ctTitulo').textContent = 'Editar contacto';
  }

  async function guardarContacto() {
    try {
      const clienteId = document.getElementById('id').value;
      const body = CB.cuerpoContacto({
        nombre: $t('nombre').value, rol: $t('rol').value, puesto: $t('puesto').value, email: $t('email').value,
        telefono: $t('telefono').value, whatsapp: $t('whatsapp').value,
        recibe_edo_cta: $t('recibe_edo_cta').checked, principal: $t('principal').checked,
      });
      const cid = $t('id').value;
      await KoguApi.apiFetch(`${MODULE.basePath}/${clienteId}/contactos${cid ? '/' + cid : ''}`,
        { method: cid ? 'PUT' : 'POST', body: JSON.stringify(body) });
      KoguApi.toast(cid ? 'Contacto actualizado' : 'Contacto agregado', 'success');
      limpiarContacto(); await cargarContactos();
    } catch (err) { avisar(err); }
  }

  async function cambiarActivoContacto(contactoId, activo) {
    try {
      const clienteId = document.getElementById('id').value;
      await KoguApi.apiFetch(`${MODULE.basePath}/${clienteId}/contactos/${contactoId}`,
        { method: 'PUT', body: JSON.stringify({ activo }) });
      KoguApi.toast(activo ? 'Contacto reactivado' : 'Contacto dado de baja', 'success');
      await cargarContactos();
    } catch (err) { avisar(err); }
  }

  // ── Carga ─────────────────────────────────────────────────────────────────
  async function load(showToast = false) {
    const res = await KoguApi.apiFetch(MODULE.basePath);
    rows = KoguApi.unwrapRows(res);
    currentPage = 1;
    render();
    if (showToast) KoguApi.toast('Clientes actualizados por cambio de empresa', 'success');
  }

  // ── Filtrado ──────────────────────────────────────────────────────────────
  function getFiltered() {
    const q  = val('q').toLowerCase();
    const af = document.getElementById('activoFiltro').value;
    return rows.filter(r => {
      const text = `${mapName(r)} ${mapRfc(r)} ${r.cve_cte || ''}`.toLowerCase();
      return (!q  || text.includes(q))
          && (af === '' || String(!!r.activo) === af);
    });
  }

  // ── Paginación ────────────────────────────────────────────────────────────
  function renderPagination(total) {
    const bar       = document.getElementById('pgBar');
    const totalPages = Math.ceil(total / PAGE_SIZE) || 1;
    const from      = total === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
    const to        = Math.min(currentPage * PAGE_SIZE, total);
    bar.innerHTML   = `
      <span>${from}–${to} de ${total}</span>
      <div style="display:flex;gap:8px">
        <button class="btn" id="pgPrev" ${currentPage <= 1 ? 'disabled' : ''}>Anterior</button>
        <span style="padding:6px 10px;font-size:13px">${currentPage} / ${totalPages}</span>
        <button class="btn" id="pgNext" ${currentPage >= totalPages ? 'disabled' : ''}>Siguiente</button>
      </div>`;
    document.getElementById('pgPrev').onclick = () => { if (currentPage > 1)          { currentPage--; render(); } };
    document.getElementById('pgNext').onclick = () => { if (currentPage < totalPages) { currentPage++; render(); } };
  }

  // ── Render tabla ──────────────────────────────────────────────────────────
  function render() {
    const filtered = getFiltered();
    const page     = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

    document.getElementById('rows').innerHTML = page.length
      ? page.map(r => `
          <tr>
            <td>${KoguUi.escapeHtml(mapName(r))}</td>
            <td style="font-family:monospace;font-size:12px">${KoguUi.escapeHtml(mapRfc(r))}</td>
            <td style="font-family:monospace;font-size:12px;color:${r.cve_cte ? 'var(--primary)' : 'var(--muted)'}">${KoguUi.escapeHtml(r.cve_cte || '—')}</td>
            <td>${KoguUi.statusBadge(r.activo ? 'activo' : 'inactivo')}</td>
            <td><button class="btn btn-edit" data-id="${mapId(r)}">Editar</button></td>
          </tr>`).join('')
      : '<tr><td colspan="5" class="empty">Sin registros</td></tr>';

    document.querySelectorAll('.btn-edit').forEach(x => x.onclick = () => {
      const row = rows.find(r => String(mapId(r)) === x.dataset.id);
      if (row) abrir(mapId(row));
    });

    renderPagination(filtered.length);
  }

  // ── Guardar ───────────────────────────────────────────────────────────────
  document.getElementById('saveBtn').onclick = async () => {
    try {
      const payload = MODULE.buildPayload({
        nombre:  val('nombre'),
        rfc:     val('rfc'),
        cve_cte: val('cveCte') || null,
        activo:  document.getElementById('activo').value === 'true',
      });
      if (!val('nombre')) throw new Error('Nombre es obligatorio.');
      Object.assign(payload, CB.cuerpoCobranza(original, leerCobranza()) || {});
      const id = document.getElementById('id').value;
      let res;
      if (id) {
        res = await KoguApi.apiFetch(MODULE.basePath + '/' + id, { method: 'PUT', body: JSON.stringify(payload) });
        KoguApi.toast(MODULE.singular + ' actualizado', 'success');
      } else {
        res = await KoguApi.apiFetch(MODULE.basePath, { method: 'POST', body: JSON.stringify(payload) });
        KoguApi.toast(MODULE.singular + ' creado', 'success');
      }
      // Se queda en la ficha (con lo que regresó el servidor) para seguir con cobranza y contactos.
      const fila = res && (res.data || res);
      if (fila && fila.cliente_id) fill(fila); else reset();
      await load(false);
    } catch (err) { avisar(err); }
  };

  document.getElementById('statusBtn').onclick = async () => {
    try {
      const id = document.getElementById('id').value;
      if (!id) throw new Error('Selecciona un registro.');
      await KoguApi.apiFetch(MODULE.basePath + '/' + id + '/status', {
        method: 'PUT',
        body: JSON.stringify({
          status: document.getElementById('status').value,
          activo: document.getElementById('activo').value === 'true'
        })
      });
      KoguApi.toast('Status actualizado', 'success');
      await load(false);
    } catch (err) { KoguApi.toast(err.message, 'error'); }
  };

  // ── Eventos ───────────────────────────────────────────────────────────────
  document.getElementById('refreshBtn').onclick      = () => load(false);
  document.getElementById('newBtn').onclick          = () => { reset(); activarTab('general'); abrirModal(); };
  document.getElementById('clCerrar').onclick        = cerrarModal;
  document.getElementById('clCerrarPie').onclick     = cerrarModal;
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrarModal(); });
  document.querySelectorAll('#clTabs .tab').forEach(t => t.onclick = () => activarTab(t.dataset.tab));
  document.getElementById('ctGuardar').onclick = guardarContacto;
  document.getElementById('ctNuevo').onclick   = limpiarContacto;
  document.getElementById('q').oninput              = () => { currentPage = 1; render(); };
  document.getElementById('activoFiltro').onchange  = () => { currentPage = 1; render(); };

  KoguShell.subscribeEmpresaActivaChange(async () => { cerrarModal(); reset(); activarTab('general'); await load(true); });
  reset();
  cargarResponsables(b.permissions || b.permisos || []);
  await load(false);
});

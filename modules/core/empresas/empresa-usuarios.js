document.addEventListener('DOMContentLoaded', async () => {
  const bootstrap = await KoguShell.initShell({
    currentPage: '/modules/core/empresas/empresa-usuarios.html',
    title: 'Usuarios por empresa',
    description: 'Asignación y edición de relaciones usuario-empresa sobre los servicios actuales.',
    requiredPermission: 'screen.root.index'
  });
  if (!bootstrap) return;

  const content = document.getElementById('pageContent');

  function getEmpresaActivaActual() {
    return KoguApi.getEmpresaActiva() || bootstrap.empresa_activa || null;
  }

  let empresaActual = getEmpresaActivaActual();
  let empresaId = empresaActual?.empresa_id || '';

  if (!empresaId) {
    content.innerHTML = `<div class="card"><h2>Sin empresa seleccionada</h2><p>Selecciona una empresa desde la pantalla Empresas.</p></div>`;
    return;
  }

  content.innerHTML = `
    <div class="grid-2">
      <div class="card">
        <div class="eyebrow">Empresa seleccionada</div>
        <h2 id="empresaNombre">${empresaActual.nombre_corto || empresaActual.razon_social || 'Empresa'}</h2>
        <p class="muted" id="empresaRfc">${empresaActual.rfc || ''}</p>

        <div style="display:grid;gap:14px;margin-top:16px">
          <div>
            <div class="label-text">Buscar usuario</div>
            <input class="input" id="user_search" placeholder="Buscar por nombre o email" />
          </div>

          <div class="table-wrap" style="max-height:220px;overflow:auto">
            <table>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Email</th>
                  <th>Perfil</th>
                  <th></th>
                </tr>
              </thead>
              <tbody id="userSearchRows"></tbody>
            </table>
          </div>

          <div class="hero-note" id="selectedUserBox">No hay usuario seleccionado.</div>

          <div>
            <div class="label-text">Rol empresa</div>
            <input class="input" id="rol_empresa" value="owner_base" />
          </div>

          <div class="grid-2">
            <div>
              <div class="label-text">Status</div>
              <select class="select" id="status">
                <option value="activo">activo</option>
                <option value="inactivo">inactivo</option>
                <option value="suspendido">suspendido</option>
              </select>
            </div>
            <div>
              <div class="label-text">Predeterminada</div>
              <select class="select" id="empresa_predeterminada">
                <option value="false">No</option>
                <option value="true">Sí</option>
              </select>
            </div>
          </div>

          <div class="grid-2">
            <div>
              <div class="label-text">Puede operar</div>
              <select class="select" id="puede_operar">
                <option value="true">Sí</option>
                <option value="false">No</option>
              </select>
            </div>
            <div>
              <div class="label-text">Activo</div>
              <select class="select" id="activo">
                <option value="true">Sí</option>
                <option value="false">No</option>
              </select>
            </div>
          </div>

          <div class="btns">
            <button class="btn primary" id="saveBtn">Asignar usuario</button>
            <button class="btn" id="clearUserBtn">Limpiar usuario</button>
            <button class="btn" id="backBtn">Volver a empresas</button>
          </div>

          <div class="hero-note">
            Esta pantalla usa
            <strong>GET /protected/core/usuarios</strong>,
            <strong>GET /protected/core/usuarios-empresa</strong>,
            <strong>POST /protected/core/usuarios-empresa</strong> y
            <strong>PUT /protected/core/usuarios-empresa/:usuarioEmpresaId</strong>.
          </div>
        </div>
      </div>

      <div class="card">
        <div class="row">
          <div>
            <div class="eyebrow">Relaciones</div>
            <h2>Usuarios asignados</h2>
          </div>
          <button class="btn primary" id="refreshBtn">Actualizar</button>
        </div>

        <div class="table-wrap" style="margin-top:16px">
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Email</th>
                <th>Rol</th>
                <th>Status</th>
                <th>Predet.</th>
                <th>Opera</th>
                <th>Activo</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody id="rows"></tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  let usuariosCache = [];
  let relacionesCache = [];
  let currentUsuarioEmpresaId = null;
  let selectedUserId = null;

  function byId(id) {
    return document.getElementById(id);
  }

  function paintEmpresaHeader() {
    const empresa = empresaActual || {};
    const nombreEl = byId('empresaNombre');
    const rfcEl = byId('empresaRfc');
    if (nombreEl) nombreEl.textContent = empresa.nombre_corto || empresa.razon_social || 'Empresa';
    if (rfcEl) rfcEl.textContent = empresa.rfc || '';
  }

  function paintSelectedUser() {
    const box = byId('selectedUserBox');
    const user = usuariosCache.find(x => x.user_id === selectedUserId);
    if (!user) {
      box.textContent = 'No hay usuario seleccionado.';
      return;
    }
    box.innerHTML = `<strong>${user.nombre || ''}</strong><br>${user.email || ''}<br>Perfil: ${user.perfil || '-'}`;
  }

  function resetForm() {
    currentUsuarioEmpresaId = null;
    selectedUserId = null;
    byId('rol_empresa').value = 'owner_base';
    byId('status').value = 'activo';
    byId('empresa_predeterminada').value = 'false';
    byId('puede_operar').value = 'true';
    byId('activo').value = 'true';
    byId('saveBtn').textContent = 'Asignar usuario';
    byId('user_search').value = '';
    paintSelectedUser();
    renderUserSearchRows();
  }

  function renderUserSearchRows() {
    const q = byId('user_search').value.trim().toLowerCase();
    const filtered = usuariosCache.filter(u => {
      const haystack = `${u.nombre || ''} ${u.email || ''}`.toLowerCase();
      return !q || haystack.includes(q);
    }).slice(0, 20);

    byId('userSearchRows').innerHTML = filtered.map(u => `
      <tr>
        <td>${u.nombre || ''}</td>
        <td>${u.email || ''}</td>
        <td>${u.perfil || ''}</td>
        <td><button class="btn btn-select-user" data-id="${u.user_id}">Seleccionar</button></td>
      </tr>
    `).join('');

    document.querySelectorAll('.btn-select-user').forEach(btn => {
      btn.onclick = () => {
        selectedUserId = btn.dataset.id;
        paintSelectedUser();
      };
    });
  }

  async function loadUsers() {
    const res = await KoguApi.apiFetch('/protected/core/usuarios');
    usuariosCache = res.data?.rows || [];
    renderUserSearchRows();
  }

  async function loadRelations() {
    const qs = new URLSearchParams({ empresaId });
    const res = await KoguApi.apiFetch('/protected/core/usuarios-empresa?' + qs.toString());
    relacionesCache = res.data?.rows || [];

    byId('rows').innerHTML = relacionesCache.map(r => `
      <tr>
        <td>${r.nombre || ''}</td>
        <td>${r.email || ''}</td>
        <td>${r.rol_empresa || ''}</td>
        <td>${r.status || ''}</td>
        <td>${r.empresa_predeterminada ? 'Sí' : 'No'}</td>
        <td>${r.puede_operar ? 'Sí' : 'No'}</td>
        <td>${r.activo ? 'Sí' : 'No'}</td>
        <td><button class="btn btn-edit" data-id="${r.usuario_empresa_id}">Editar</button></td>
      </tr>
    `).join('');

    document.querySelectorAll('.btn-edit').forEach(btn => {
      btn.onclick = () => {
        const row = relacionesCache.find(x => x.usuario_empresa_id === btn.dataset.id);
        if (!row) return;
        currentUsuarioEmpresaId = row.usuario_empresa_id;
        selectedUserId = row.user_id;
        byId('rol_empresa').value = row.rol_empresa || 'owner_base';
        byId('status').value = row.status || 'activo';
        byId('empresa_predeterminada').value = String(!!row.empresa_predeterminada);
        byId('puede_operar').value = String(!!row.puede_operar);
        byId('activo').value = String(!!row.activo);
        byId('saveBtn').textContent = 'Actualizar relación';
        paintSelectedUser();
      };
    });
  }

  async function reloadForEmpresaActiva(nuevaEmpresa) {
    empresaActual = nuevaEmpresa || getEmpresaActivaActual();
    empresaId = empresaActual?.empresa_id || '';

    if (!empresaId) {
      content.innerHTML = `<div class="card"><h2>Sin empresa seleccionada</h2><p>No existe empresa activa válida.</p></div>`;
      return;
    }

    paintEmpresaHeader();
    resetForm();
    await loadRelations();
  }

  byId('saveBtn').onclick = async () => {
    try {
      const payload = {
        user_id: selectedUserId,
        empresa_id: empresaId,
        rol_empresa: byId('rol_empresa').value.trim(),
        status: byId('status').value,
        empresa_predeterminada: byId('empresa_predeterminada').value === 'true',
        puede_operar: byId('puede_operar').value === 'true',
        activo: byId('activo').value === 'true'
      };

      if (!payload.user_id) throw new Error('Selecciona un usuario.');
      if (!payload.rol_empresa) throw new Error('Rol empresa es obligatorio.');

      if (currentUsuarioEmpresaId) {
        await KoguApi.apiFetch('/protected/core/usuarios-empresa/' + currentUsuarioEmpresaId, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
        KoguApi.toast('Relación usuario-empresa actualizada', 'success');
      } else {
        await KoguApi.apiFetch('/protected/core/usuarios-empresa', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        KoguApi.toast('Usuario asignado a la empresa correctamente', 'success');
      }

      resetForm();
      await loadRelations();
    } catch (error) {
      KoguApi.toast(error.message || 'No fue posible guardar la relación', 'error');
    }
  };

  byId('refreshBtn').onclick = loadRelations;
  byId('clearUserBtn').onclick = () => {
    selectedUserId = null;
    paintSelectedUser();
  };
  byId('backBtn').onclick = () => {
    window.location.href = './empresas.html';
  };
  byId('user_search').addEventListener('input', renderUserSearchRows);

  await loadUsers();
  await loadRelations();
  resetForm();

  KoguShell.subscribeEmpresaActivaChange(async (empresa) => {
    await reloadForEmpresaActiva(empresa);
  });
});

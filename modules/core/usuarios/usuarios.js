document.addEventListener('DOMContentLoaded', async () => {
  const b = await KoguShell.initShell({
    currentPage: '/modules/core/usuarios/usuarios.html',
    title: 'Usuarios',
    description: 'CRUD base de usuarios del core multiempresa.',
    requiredPermission: 'screen.catalogos.usuarios'
  });
  if (!b) return;

  const c = document.getElementById('pageContent');
  c.innerHTML = `
    <div class="split">
      <div class="card">
        <div class="row">
          <div>
            <div class="eyebrow">Listado</div>
            <h2>Usuarios</h2>
          </div>
          <button class="btn primary" id="refreshBtn">Actualizar</button>
        </div>

        <div class="grid-2" style="margin-top:16px">
          <input class="input" id="q" placeholder="Buscar por nombre o email"/>
          <select class="select" id="activoFiltro">
            <option value="">Todos</option>
            <option value="true">Activos</option>
            <option value="false">Inactivos</option>
          </select>
        </div>

        <div class="table-wrap" style="margin-top:16px">
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Email</th>
                <th>Perfil</th>
                <th>Activo</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody id="rows"></tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <div class="row">
          <div>
            <div class="eyebrow">Formulario</div>
            <h2 id="formTitle">Alta de usuario</h2>
          </div>
          <span class="chip" id="modeChip">Alta</span>
        </div>

        <div class="stack" style="margin-top:16px">
          <input type="hidden" id="user_id"/>

          <div>
            <div class="label-text">Nombre</div>
            <input class="input" id="nombre"/>
          </div>

          <div>
            <div class="label-text">Email</div>
            <input class="input" id="email"/>
          </div>

          <div>
            <div class="label-text">Perfil</div>
            <select class="select" id="perfil_id">
              <option value="">Selecciona un perfil</option>
            </select>
          </div>

          <div>
            <div class="label-text">Password</div>
            <input class="input" id="password" type="password" placeholder="Solo para alta o cambio"/>
          </div>

          <div>
            <div class="label-text">Activo</div>
            <select class="select" id="activo">
              <option value="true">Sí</option>
              <option value="false">No</option>
            </select>
          </div>

          <div>
            <div class="label-text">Política de contraseña</div>
            <div class="grid-2">
              <select class="select" id="forzar_motivo">
                <option value="">Selecciona motivo</option>
                <option value="admin_reset">Reseteo solicitado por admin</option>
                <option value="compromiso_credencial">Compromiso de credencial</option>
                <option value="politica_caducidad">Caducidad de política</option>
                <option value="primer_login">Primer inicio de sesión</option>
              </select>
              <button class="btn" id="forzarPasswordBtn" type="button">Forzar cambio en próximo login</button>
            </div>
            <div style="margin-top:6px; font-size:12px; color:#64748b;">
              El usuario verá una pantalla obligatoria de cambio de contraseña al iniciar sesión.
            </div>
          </div>

          <div class="page-actions">
            <button class="btn primary" id="saveBtn">Guardar</button>
            <button class="btn" id="passwordBtn">Cambiar contraseña</button>
            <button class="btn" id="newBtn">Nuevo</button>
          </div>
        </div>
      </div>
    </div>
  `;

  let rows = [];
  let perfiles = [];

  function val(id) {
    return document.getElementById(id).value.trim();
  }

  function perfilNombreById(perfilId) {
    const p = perfiles.find(x => String(x.perfil_id) === String(perfilId));
    return p?.nombre || '';
  }

  function renderPerfiles() {
    const select = document.getElementById('perfil_id');
    select.innerHTML = `
      <option value="">Selecciona un perfil</option>
      ${perfiles.map(p => `
        <option value="${KoguUi.escapeHtml(p.perfil_id)}">${KoguUi.escapeHtml(p.nombre || '')}</option>
      `).join('')}
    `;
  }

  function reset() {
    ['user_id', 'nombre', 'email', 'password'].forEach(id => {
      document.getElementById(id).value = '';
    });
    document.getElementById('perfil_id').value = '';
    document.getElementById('activo').value = 'true';
    document.getElementById('formTitle').textContent = 'Alta de usuario';
    document.getElementById('modeChip').textContent = 'Alta';
  }

  function fill(r) {
    document.getElementById('user_id').value = r.user_id || r.id || '';
    document.getElementById('nombre').value = r.nombre || '';
    document.getElementById('email').value = r.email || '';
    document.getElementById('perfil_id').value = r.perfil_id || '';
    document.getElementById('activo').value = String(!!r.activo);
    document.getElementById('password').value = '';
    document.getElementById('formTitle').textContent = 'Editar usuario';
    document.getElementById('modeChip').textContent = 'Edición';
  }

  async function loadPerfiles() {
    const res = await KoguApi.apiFetch('/protected/core/perfiles');
    perfiles = KoguApi.unwrapRows(res) || [];
    renderPerfiles();
  }

  async function load() {
    const res = await KoguApi.apiFetch('/protected/core/usuarios');
    rows = KoguApi.unwrapRows(res) || [];
    render();
  }

  function render() {
    const q = val('q').toLowerCase();
    const af = document.getElementById('activoFiltro').value;

    const filtered = rows.filter(r => {
      const text = `${r.nombre || ''} ${r.email || ''}`.toLowerCase();
      const okText = !q || text.includes(q);
      const okAct = af === '' || String(!!r.activo) === af;
      return okText && okAct;
    });

    document.getElementById('rows').innerHTML = filtered.length
      ? filtered.map(r => `
        <tr>
          <td>${KoguUi.escapeHtml(r.nombre || '')}</td>
          <td>${KoguUi.escapeHtml(r.email || '')}</td>
          <td>${KoguUi.escapeHtml(r.perfil || perfilNombreById(r.perfil_id) || '')}</td>
          <td>${KoguUi.statusBadge(r.activo ? 'activo' : 'inactivo')}</td>
          <td><button class="btn btn-edit" data-id="${r.user_id || r.id}">Editar</button></td>
        </tr>
      `).join('')
      : `<tr><td colspan="5" class="empty">Sin usuarios</td></tr>`;

    document.querySelectorAll('.btn-edit').forEach(x => {
      x.onclick = () => {
        const row = rows.find(r => String(r.user_id || r.id) === x.dataset.id);
        if (row) fill(row);
      };
    });
  }

  document.getElementById('refreshBtn').onclick = async () => {
    await load();
  };

  document.getElementById('newBtn').onclick = reset;
  document.getElementById('q').oninput = render;
  document.getElementById('activoFiltro').onchange = render;

  document.getElementById('saveBtn').onclick = async () => {
    try {
      const payload = {
        nombre: val('nombre'),
        email: val('email'),
        perfil_id: val('perfil_id'),
        activo: document.getElementById('activo').value === 'true'
      };

      if (!payload.nombre || !payload.email || !payload.perfil_id) {
        throw new Error('Nombre, email y perfil son obligatorios.');
      }

      const password = val('password');
      const id = document.getElementById('user_id').value;

      if (id) {
        await KoguApi.apiFetch('/protected/core/usuarios/' + id, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });

        if (password) {
          await KoguApi.apiFetch('/protected/core/usuarios/' + id + '/password', {
            method: 'PUT',
            body: JSON.stringify({ password })
          });
        }

        KoguApi.toast('Usuario actualizado', 'success');
      } else {
        if (!password) throw new Error('La contraseña es obligatoria en alta.');

        await KoguApi.apiFetch('/protected/core/usuarios', {
          method: 'POST',
          body: JSON.stringify({
            ...payload,
            password
          })
        });

        KoguApi.toast('Usuario creado', 'success');
      }

      reset();
      await load();
    } catch (err) {
      KoguApi.toast(err.message || 'No fue posible guardar el usuario', 'error');
    }
  };

  document.getElementById('passwordBtn').onclick = async () => {
    try {
      const id = document.getElementById('user_id').value;
      const password = val('password');

      if (!id) throw new Error('Primero selecciona un usuario.');
      if (!password) throw new Error('Captura la nueva contraseña.');

      await KoguApi.apiFetch('/protected/core/usuarios/' + id + '/password', {
        method: 'PUT',
        body: JSON.stringify({ password })
      });

      KoguApi.toast('Contraseña actualizada', 'success');
      document.getElementById('password').value = '';
    } catch (err) {
      KoguApi.toast(err.message || 'No fue posible actualizar la contraseña', 'error');
    }
  };

  // admin-password-policy-v1: marcar a un usuario para forzar cambio
  // de contraseña en su próximo inicio de sesión.
  // Requiere permiso 'usuarios.password.force_change' (validado server-side).
  document.getElementById('forzarPasswordBtn').onclick = async () => {
    try {
      const id = document.getElementById('user_id').value;
      const motivo = document.getElementById('forzar_motivo').value;

      if (!id) throw new Error('Primero selecciona un usuario.');
      if (!motivo) throw new Error('Selecciona el motivo del cambio obligatorio.');

      if (!confirm('¿Forzar al usuario a cambiar contraseña en su próximo inicio de sesión?')) return;

      await KoguApi.apiFetch('/protected/core/usuarios/' + id + '/forzar-cambio-password', {
        method: 'POST',
        body: JSON.stringify({ motivo })
      });

      KoguApi.toast('Marcado: el usuario deberá cambiar contraseña al próximo inicio de sesión.', 'success');
      document.getElementById('forzar_motivo').value = '';
    } catch (err) {
      KoguApi.toast(err.message || 'No fue posible aplicar la marca.', 'error');
    }
  };

  await loadPerfiles();
  await load();
});
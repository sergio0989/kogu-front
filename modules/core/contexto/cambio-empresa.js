document.addEventListener('DOMContentLoaded', async () => {
  let bootstrap = await KoguShell.initShell({
    currentPage: '/modules/core/contexto/cambio-empresa.html',
    title: 'Cambio de empresa',
    description: 'Selector de empresa activa conectado a core/context como fuente de verdad.',
    // Sin permiso específico: cualquier usuario autenticado debe poder elegir
    // su empresa activa (solo ve y opera sus propias empresas autorizadas).
    // Antes exigía screen.root.index, lo que dejaba a los usuarios no-admin
    // atrapados tras el redirect del 409 ("Acceso denegado").
    requiredPermission: null
  });
  if (!bootstrap) return;

  const c = document.getElementById('pageContent');

  function render(boot){
    const empresas = boot.empresas || boot.empresas_autorizadas || [];
    const ea = boot.empresa_activa || {};
    c.innerHTML = `
      <div class="grid-2">
        <div class="card">
          <div class="eyebrow">Empresa activa</div>
          <h2 data-kogu-cambio-empresa-nombre>${ea.nombre_corto || ea.razon_social || 'Sin empresa'}</h2>
          <div class="muted" style="margin-top:4px" data-kogu-cambio-empresa-rfc>${ea.rfc || ''}</div>

          <div class="btns" style="margin-top:18px">
            <button class="btn primary" id="openModalBtn">Cambiar empresa activa…</button>
            <button class="btn" id="reloadBtn">Recargar bootstrap</button>
          </div>

          <div class="hero-note" style="margin-top:16px">
            El cambio de empresa usa <code>/protected/core/context/empresa-activa</code> y refresca el bootstrap real del core. El selector ahora se abre como modal desde aquí o desde el chip "EMPRESA" del topbar.
          </div>
        </div>

        <div class="card">
          <div class="eyebrow">Relaciones usuario-empresa</div>
          <h2>Accesos disponibles</h2>

          <div class="table-wrap" style="margin-top:16px">
            <table>
              <thead>
                <tr>
                  <th>Empresa</th>
                  <th>Rol</th>
                  <th>Status</th>
                  <th>Predeterminada</th>
                  <th>Activa</th>
                </tr>
              </thead>
              <tbody id="rows"></tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    document.getElementById('rows').innerHTML = empresas.map(e => `
      <tr>
        <td>${e.nombre_corto || e.razon_social}</td>
        <td>${e.rol_empresa || '-'}</td>
        <td>${e.status || '-'}</td>
        <td>${e.empresa_predeterminada ? 'Sí' : 'No'}</td>
        <td>${e.empresa_id === (boot.empresa_activa?.empresa_id) ? 'Sí' : 'No'}</td>
      </tr>
    `).join('');

    document.getElementById('openModalBtn').onclick = () => {
      if (typeof KoguShell.openEmpresaModal === 'function') {
        KoguShell.openEmpresaModal();
      } else {
        KoguApi.toast('El modal de empresas no está disponible.', 'error');
      }
    };

    document.getElementById('reloadBtn').onclick = async () => {
      try {
        bootstrap = await KoguShell.loadCoreBootstrap();
        KoguShell.refreshChrome(bootstrap);
        KoguApi.toast('Bootstrap recargado', 'success');
        render(bootstrap);
      } catch (err) {
        KoguApi.toast(err.message || 'No fue posible recargar el bootstrap', 'error');
      }
    };
  }

  render(bootstrap);

  // Refresca la pantalla cuando el modal global cambia la empresa activa.
  if (typeof KoguShell.subscribeEmpresaActivaChange === 'function') {
    KoguShell.subscribeEmpresaActivaChange(async (newBoot) => {
      bootstrap = newBoot || await KoguShell.loadCoreBootstrap();
      render(bootstrap);
    });
  }
});
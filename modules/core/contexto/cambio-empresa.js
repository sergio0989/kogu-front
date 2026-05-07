document.addEventListener('DOMContentLoaded', async () => {
  let bootstrap = await KoguShell.initShell({
    currentPage: '/modules/core/contexto/cambio-empresa.html',
    title: 'Cambio de empresa',
    description: 'Selector de empresa activa conectado a core/context como fuente de verdad.',
    requiredPermission: 'screen.root.index'
  });
  if (!bootstrap) return;

  const c = document.getElementById('pageContent');

  function render(boot){
    const empresas = boot.empresas || boot.empresas_autorizadas || [];
    c.innerHTML = `
      <div class="grid-2">
        <div class="card">
          <div class="eyebrow">Empresa activa</div>
          <h2>Seleccionador</h2>

          <div class="label-text" style="margin-top:16px">Empresa</div>
          <select class="select" id="empresaSelect">
            ${empresas.map(e => {
              const isActiva = e.empresa_id === (boot.empresa_activa?.empresa_id);
              return `<option value="${e.empresa_id}" ${isActiva ? 'selected' : ''}>
                ${e.nombre_corto || e.razon_social} · ${e.rfc || ''}
              </option>`;
            }).join('')}
          </select>

          <div class="btns" style="margin-top:16px">
            <button class="btn primary" id="applyBtn">Aplicar cambio</button>
            <button class="btn" id="reloadBtn">Recargar bootstrap</button>
          </div>

          <div class="hero-note" style="margin-top:16px">
            El cambio de empresa usa <code>/protected/core/context/empresa-activa</code> y refresca el bootstrap real del core.
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

    document.getElementById('applyBtn').onclick = async () => {
      const btn = document.getElementById('applyBtn');
      try {
        btn.disabled = true;
        btn.textContent = 'Aplicando...';
        const empresa_id = document.getElementById('empresaSelect').value;

        await KoguApi.apiFetch('/protected/core/context/empresa-activa', {
          method: 'POST',
          body: JSON.stringify({ empresa_id })
        });

        bootstrap = await KoguShell.loadCoreBootstrap();
        KoguShell.refreshChrome(bootstrap);
        KoguApi.toast('Empresa activa actualizada', 'success');
        render(bootstrap);
      } catch (err) {
        KoguApi.toast(err.message || 'No fue posible cambiar la empresa activa', 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Aplicar cambio';
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
});
document.addEventListener('DOMContentLoaded', async () => {
  const envSelect = document.getElementById('envSelect');

  // En producción (hostname distinto de localhost/127.0.0.1) ocultar el selector
  // y forzar el ambiente de producción para no exponer URLs del backend
  const isLocalhost = ['localhost', '127.0.0.1', ''].includes(window.location.hostname);

  if (!isLocalhost) {
    // Ocultar el grupo del selector de ambiente
    const envGroup = envSelect.closest('div');
    if (envGroup) envGroup.style.display = 'none';
    // Forzar producción
    KoguApi.setEnvName('produccion');
  } else {
    // Solo en local: poblar y mostrar el selector
    Object.entries(window.KOGU_ENVIRONMENTS || {}).forEach(([k, v]) => {
      const o = document.createElement('option');
      o.value = k;
      o.textContent = v.label;
      envSelect.appendChild(o);
    });
    envSelect.value = KoguApi.getEnvName();
  }

  async function resolveLanding() {
    const res = await KoguApi.apiFetch('/protected/core/context/bootstrap');
    const boot = (res && (res.data || res)) || {};
    const perms = boot.permissions || boot.permisos || [];

    if (Array.isArray(perms) && perms.includes('screen.root.index')) {
      return '/modules/core/dashboard/index.html';
    }

    if (Array.isArray(perms) && perms.includes('screen.cfdi.sat_dm')) {
      return '/modules/cfdi/dashboard/resumen.html';
    }

    if (Array.isArray(perms) && perms.includes('screen.root.catalogos')) {
      if (perms.includes('screen.catalogos.clientes')) {
        return '/modules/core/clientes/clientes.html';
      }
      if (perms.includes('screen.catalogos.proveedores')) {
        return '/modules/core/proveedores/proveedores.html';
      }
    }

    if (Array.isArray(perms) && perms.includes('screen.catalogos.clientes')) {
      return '/modules/core/clientes/clientes.html';
    }

    if (Array.isArray(perms) && perms.includes('screen.catalogos.proveedores')) {
      return '/modules/core/proveedores/proveedores.html';
    }

    return '/modules/cfdi/dashboard/resumen.html';
  }

  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      KoguApi.setEnvName(envSelect.value);

      await KoguAuth.login({
        email: document.getElementById('email').value.trim(),
        password: document.getElementById('password').value.trim()
      });

      const landing = await resolveLanding();

      KoguApi.toast('Sesión iniciada correctamente', 'success');
      window.location.href = landing;
    } catch (err) {
      KoguApi.toast(err.message || 'No fue posible iniciar sesión', 'error');
    }
  });
});
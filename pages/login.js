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

    // ── Lab QA — perfiles analista_lab / supervisor_lab / gerente_calidad ──
    // Cualquier usuario con acceso al módulo Lab aterriza en el Dashboard KPIs
    // (la pantalla más "ejecutiva" del módulo). Si no tiene KPIs/Maestros, se
    // intenta Lotes, Bandeja y Liberaciones como fallbacks razonables.
    if (Array.isArray(perms)) {
      if (perms.includes('screen.lab.maestros')) {
        return '/modules/lab/lab-kpis.html';
      }
      if (perms.includes('screen.lab.lotes')) {
        return '/modules/lab/lab-lotes.html';
      }
      if (perms.includes('screen.lab.bandeja')) {
        return '/modules/lab/lab-bandeja.html';
      }
      if (perms.includes('screen.lab.liberaciones')) {
        return '/modules/lab/lab-liberaciones.html';
      }
    }

    // ── Comercial — Radar Comercial / CRM ──
    // Perfiles comerciales (director_ventas, vendedor, etc.) no tienen CFDI:
    // aterrizan en la pantalla más ejecutiva a la que sí tienen acceso.
    if (Array.isArray(perms)) {
      if (perms.includes('screen.ventas.direccion') || perms.includes('screen.ventas.gerencia')) {
        return '/modules/rc/tablero.html';
      }
      if (perms.includes('screen.ventas.vendedor')) {
        return '/modules/rc/mi-panel.html';
      }
      if (perms.includes('screen.ventas.agentes')) {
        return '/modules/rc/agentes.html';
      }
      if (perms.includes('crm.actividades.read')) {
        return '/modules/crm/actividades.html';
      }
    }

    return '/modules/cfdi/dashboard/resumen.html';
  }

  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      KoguApi.setEnvName(envSelect.value);

      const payload = await KoguAuth.login({
        email: document.getElementById('email').value.trim(),
        password: document.getElementById('password').value.trim()
      });

      // admin-password-policy-v1: si el backend marcó cambio obligatorio,
      // redirigir SIN resolver landing — el usuario no puede operar todavía.
      if (payload && payload.requiresPasswordChange === true) {
        const reason = payload.passwordChangeReason || '';
        KoguApi.toast('Debes cambiar tu contraseña antes de continuar.', 'info');
        const qs = reason ? ('?reason=' + encodeURIComponent(reason)) : '';
        window.location.href = '/password-change.html' + qs;
        return;
      }

      const landing = await resolveLanding();

      KoguApi.toast('Sesión iniciada correctamente', 'success');
      window.location.href = landing;
    } catch (err) {
      KoguApi.toast(err.message || 'No fue posible iniciar sesión', 'error');
    }
  });
});
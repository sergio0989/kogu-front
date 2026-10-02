// /inicio.html — selector de herramienta (empresa activa → herramienta).
// Con una sola herramienta (o ninguna) no se muestra: se entra directo.
// ?next=<ruta> viene del login y conserva la pantalla de inicio de siempre.
document.addEventListener('DOMContentLoaded', async () => {
  if (!KoguAuth.requireAuth()) return;
  const H = window.KoguHerramientas;
  const nav = KoguShell.getNav();
  const params = new URLSearchParams(window.location.search);
  const nextRaw = params.get('next');
  const next = nextRaw && nextRaw.startsWith('/') && !nextRaw.startsWith('//') ? nextRaw : null;

  const $empresa = document.getElementById('inicioEmpresa');
  const $lista = document.getElementById('inicioLista');
  const $cambiar = document.getElementById('inicioCambiarEmpresa');
  document.getElementById('inicioLogout').onclick = () => KoguAuth.logout();

  const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const permsDe = (b) => { const p = b?.permissions || b?.permisos || []; return Array.isArray(p) ? p : []; };

  function destino(boot, id) {
    // Si la pantalla que traía el login es de esta herramienta, se respeta.
    if (next && H.herramientaDePagina(nav, next) === id) return next;
    return H.primeraPagina(nav, permsDe(boot), id) || next || '/modules/core/dashboard/index.html';
  }

  function entrar(boot, id) {
    KoguShell.guardarHerramienta(id);
    window.location.href = destino(boot, id);
  }

  function render(boot) {
    KoguShell.setContextBootstrap(boot);
    const e = boot.empresa_activa || {};
    $empresa.textContent = [e.razon_social || e.nombre_corto || 'Sin empresa activa', e.rfc].filter(Boolean).join(' · ');
    const empresas = boot.empresas || boot.empresas_autorizadas || [];
    $cambiar.hidden = empresas.length < 2;

    const disp = H ? H.disponibles(nav, permsDe(boot)) : [];
    if (disp.length <= 1) {
      // Una sola herramienta (o ninguna): no hay nada que elegir.
      if (disp.length === 1) { entrar(boot, disp[0].id); return; }
      KoguShell.guardarHerramienta(null);
      window.location.href = next || '/modules/core/dashboard/index.html';
      return;
    }

    const ultima = KoguShell.leerHerramienta();
    $lista.innerHTML = disp.map((h) => `
      <button class="inicio-item${h.id === ultima ? ' is-ultima' : ''}" type="button" data-id="${esc(h.id)}">
        <span class="inicio-item__icono" aria-hidden="true">${h.icono}</span>
        <span class="inicio-item__texto">
          <span class="inicio-item__nombre">${esc(h.nombre)}${h.id === ultima ? ' <span class="inicio-item__tag">Última</span>' : ''}</span>
          <span class="inicio-item__desc">${esc(h.descripcion)}</span>
        </span>
        <span class="inicio-item__flecha" aria-hidden="true">→</span>
      </button>`).join('');
    $lista.querySelectorAll('.inicio-item').forEach((b) => { b.onclick = () => entrar(boot, b.dataset.id); });
  }

  try {
    render(await KoguShell.loadBootstrap());
  } catch (err) {
    $empresa.textContent = 'No fue posible cargar tu contexto.';
    KoguApi.toast(err.message || 'No fue posible cargar tu contexto', 'error');
  }

  $cambiar.onclick = () => KoguShell.openEmpresaModal();
  // Al cambiar de empresa los permisos pueden cambiar: se vuelve a pintar.
  KoguShell.subscribeEmpresaActivaChange(async () => { render(await KoguShell.loadBootstrap()); });
});

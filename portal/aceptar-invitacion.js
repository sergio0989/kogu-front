// ============================================================
// aceptar-invitacion.js — El proveedor crea su acceso con un token
// de un solo uso y define su propia contraseña. Portal externo.
// ============================================================
(function () {
  const $ = id => document.getElementById(id);
  const SYMBOL_REGEX = /[!@#$%^&*()_+\-=\[\]{};:'",.<>?/\\|`~]/;

  const token = new URLSearchParams(window.location.search).get('token') || '';

  function showMsg(text, kind) {
    const el = $('msg');
    el.style.display = 'block';
    el.textContent = text;
    if (kind === 'error') { el.style.cssText = 'display:block;margin-top:4px;padding:10px 12px;border-radius:8px;font-size:13px;background:#fee2e2;color:#991b1b;border:1px solid #fca5a5'; }
    else { el.style.cssText = 'display:block;margin-top:4px;padding:10px 12px;border-radius:8px;font-size:13px;background:#dcfce7;color:#15803d;border:1px solid #86efac'; }
  }

  if (!token) {
    $('introText').textContent = 'Enlace de invitación inválido o incompleto.';
    showMsg('No se encontró el token de invitación. Solicita una nueva invitación a la empresa.', 'error');
    ['nombre', 'newPassword', 'confirmPassword', 'submitBtn'].forEach(id => $(id).disabled = true);
    return;
  }

  function pickEmpresa(empresas) {
    if (!Array.isArray(empresas) || !empresas.length) return;
    const pref = empresas.find(e => e.es_predeterminada) || empresas[0];
    if (pref?.empresa_id) PortalApi.setEmpresaId(pref.empresa_id);
  }

  $('inviteForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nombre = $('nombre').value.trim();
    const pw = $('newPassword').value;
    const pw2 = $('confirmPassword').value;

    if (pw.length < 8) { showMsg('La contraseña debe tener al menos 8 caracteres.', 'error'); return; }
    if (!SYMBOL_REGEX.test(pw)) { showMsg('La contraseña debe incluir al menos un símbolo.', 'error'); return; }
    if (pw !== pw2) { showMsg('Las contraseñas no coinciden.', 'error'); return; }

    const btn = $('submitBtn');
    btn.disabled = true; btn.textContent = 'Creando…';
    try {
      const data = await PortalApi.call('/portal/auth/accept-invite', {
        method: 'POST', auth: false, body: { token, password: pw, nombre },
      });
      PortalApi.setToken(data.token);
      pickEmpresa(data.empresas);
      showMsg('¡Acceso creado! Entrando al portal…', 'ok');
      setTimeout(() => { window.location.href = '/portal/index.html'; }, 1400);
    } catch (err) {
      showMsg(err.message || 'No fue posible crear el acceso. El enlace pudo expirar o ya fue usado.', 'error');
      btn.disabled = false; btn.textContent = 'Crear mi acceso';
    }
  });
})();

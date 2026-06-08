// ============================================================
// login.js — Login del Portal de Proveedores.
// ============================================================
(function () {
  const $ = id => document.getElementById(id);

  // Si ya hay sesión de portal, ir directo al panel.
  if (PortalApi.getToken()) { window.location.href = '/portal/index.html'; return; }

  function showMsg(text, kind) {
    const el = $('msg');
    el.style.display = 'block';
    el.textContent = text;
    if (kind === 'error') { el.style.cssText = 'display:block;margin-top:4px;padding:10px 12px;border-radius:8px;font-size:13px;background:#fee2e2;color:#991b1b;border:1px solid #fca5a5'; }
    else { el.style.cssText = 'display:block;margin-top:4px;padding:10px 12px;border-radius:8px;font-size:13px;background:#dcfce7;color:#15803d;border:1px solid #86efac'; }
  }

  function pickEmpresa(empresas) {
    if (!Array.isArray(empresas) || !empresas.length) return;
    const pref = empresas.find(e => e.es_predeterminada) || empresas[0];
    if (pref?.empresa_id) PortalApi.setEmpresaId(pref.empresa_id);
  }

  $('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('email').value.trim();
    const password = $('password').value;
    if (!email || !password) { showMsg('Correo y contraseña son obligatorios.', 'error'); return; }

    const btn = $('submitBtn');
    btn.disabled = true; btn.textContent = 'Entrando…';
    try {
      const data = await PortalApi.call('/portal/auth/login', {
        method: 'POST', auth: false, body: { email, password },
      });
      PortalApi.setToken(data.token);
      pickEmpresa(data.empresas);
      window.location.href = '/portal/index.html';
    } catch (err) {
      showMsg(err.message || 'No fue posible iniciar sesión.', 'error');
      btn.disabled = false; btn.textContent = 'Entrar al portal';
    }
  });
})();

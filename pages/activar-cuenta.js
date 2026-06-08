// ============================================================
// activar-cuenta.js
// Página pública: el usuario define su contraseña con un token de
// activación de un solo uso (sin login previo, sin recibir contraseña).
// Endpoint público: POST /auth/activacion/definir-password
// Sub-proyecto: core-user-activation-v1.
// ============================================================

(function () {
  const $ = id => document.getElementById(id);
  const SYMBOL_REGEX = /[!@#$%^&*()_+\-=\[\]{};:'",.<>?/\\|`~]/;

  // Token desde la query string: /activar-cuenta.html?token=XXX  (también acepta /activar?token=)
  const params = new URLSearchParams(window.location.search);
  const token  = params.get('token') || '';

  function showMsg(text, kind) {
    const el = $('msg');
    el.style.display = 'block';
    el.textContent = text;
    if (kind === 'error') { el.style.background = '#fee2e2'; el.style.color = '#991b1b'; el.style.border = '1px solid #fca5a5'; }
    else if (kind === 'ok') { el.style.background = '#dcfce7'; el.style.color = '#15803d'; el.style.border = '1px solid #86efac'; }
    else { el.style.background = '#eff6ff'; el.style.color = '#1e40af'; el.style.border = '1px solid #bfdbfe'; }
  }

  if (!token) {
    $('introText').textContent = 'Enlace de activación inválido o incompleto.';
    showMsg('No se encontró el token de activación en el enlace. Solicita uno nuevo a tu administrador.', 'error');
    $('newPassword').disabled = true;
    $('confirmPassword').disabled = true;
    $('submitBtn').disabled = true;
    return;
  }

  $('activarForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pw = $('newPassword').value;
    const pw2 = $('confirmPassword').value;

    if (pw.length < 8) { showMsg('La contraseña debe tener al menos 8 caracteres.', 'error'); return; }
    if (!SYMBOL_REGEX.test(pw)) { showMsg('La contraseña debe incluir al menos un símbolo.', 'error'); return; }
    if (pw !== pw2) { showMsg('Las contraseñas no coinciden.', 'error'); return; }

    const btn = $('submitBtn');
    btn.disabled = true; btn.textContent = 'Activando…';
    try {
      const base = (window.KoguApi && KoguApi.getBaseUrl) ? KoguApi.getBaseUrl() : '';
      const res = await fetch(base + '/auth/activacion/definir-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, new_password: pw }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        const msg = data?.error?.message || 'No fue posible activar la cuenta. El enlace pudo expirar o ya fue usado.';
        showMsg(msg, 'error');
        btn.disabled = false; btn.textContent = 'Activar mi cuenta';
        return;
      }
      showMsg('¡Cuenta activada! Redirigiendo al inicio de sesión…', 'ok');
      setTimeout(() => { window.location.href = '/login.html'; }, 1800);
    } catch (err) {
      showMsg('Error de red al activar la cuenta. Intenta de nuevo.', 'error');
      btn.disabled = false; btn.textContent = 'Activar mi cuenta';
    }
  });
})();

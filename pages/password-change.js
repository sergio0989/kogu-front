// Pantalla de cambio obligatorio de contraseña (admin-password-policy-v1).
// Reglas: mínimo 8 chars, al menos 1 símbolo, distinta de la actual.

const REASON_MESSAGES = {
  admin_reset:           'Un administrador solicitó que actualices tu contraseña antes de continuar.',
  compromiso_credencial: 'Se detectó un posible compromiso de tu credencial. Cámbiala por seguridad.',
  politica_caducidad:    'Tu contraseña venció según la política de seguridad de la plataforma.',
  primer_login:          'Bienvenido. Establece una nueva contraseña personal para tu cuenta.',
};

const SYMBOL_REGEX = /[!@#$%^&*()_+\-=\[\]{};:'",.<>?/\\|`~]/;

document.addEventListener('DOMContentLoaded', () => {
  // Si no hay token, no tiene sentido estar aquí.
  if (!KoguApi.getToken()) {
    window.location.href = '/login.html';
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const reason = params.get('reason');
  if (reason && REASON_MESSAGES[reason]) {
    document.getElementById('reasonText').textContent = REASON_MESSAGES[reason];
  }

  const currentInput = document.getElementById('currentPassword');
  const newInput     = document.getElementById('newPassword');
  const confirmInput = document.getElementById('confirmPassword');
  const submitBtn    = document.getElementById('submitBtn');

  const ruleNodes = {
    len:  document.querySelector('#strengthHints [data-rule="len"]'),
    sym:  document.querySelector('#strengthHints [data-rule="sym"]'),
    diff: document.querySelector('#strengthHints [data-rule="diff"]'),
  };
  const confirmHint = document.getElementById('confirmHint');

  function markRule(node, ok) {
    if (!node) return;
    node.style.color = ok ? '#16a34a' : '#64748b';
    node.style.fontWeight = ok ? '600' : '400';
  }

  function updateHints() {
    const current = currentInput.value || '';
    const next    = newInput.value || '';
    const confirm = confirmInput.value || '';

    const lenOk  = next.length >= 8;
    const symOk  = SYMBOL_REGEX.test(next);
    const diffOk = next.length > 0 && next !== current;
    const confirmOk = confirm.length > 0 && confirm === next;

    markRule(ruleNodes.len, lenOk);
    markRule(ruleNodes.sym, symOk);
    markRule(ruleNodes.diff, diffOk);

    if (confirmHint) {
      confirmHint.style.color = confirmOk ? '#16a34a' : '#64748b';
      confirmHint.style.fontWeight = confirmOk ? '600' : '400';
    }
  }

  [currentInput, newInput, confirmInput].forEach((el) => el.addEventListener('input', updateHints));
  updateHints();

  document.getElementById('logoutBtn').addEventListener('click', () => {
    KoguAuth.logout();
  });

  document.getElementById('passwordChangeForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const current = currentInput.value || '';
    const next    = newInput.value || '';
    const confirm = confirmInput.value || '';

    if (!current || !next) {
      KoguApi.toast('Captura la contraseña actual y la nueva contraseña.', 'error');
      return;
    }
    if (next.length < 8) {
      KoguApi.toast('La nueva contraseña debe tener al menos 8 caracteres.', 'error');
      return;
    }
    if (!SYMBOL_REGEX.test(next)) {
      KoguApi.toast('La nueva contraseña debe incluir al menos un símbolo.', 'error');
      return;
    }
    if (next === current) {
      KoguApi.toast('La nueva contraseña debe ser distinta de la actual.', 'error');
      return;
    }
    if (next !== confirm) {
      KoguApi.toast('Las contraseñas no coinciden.', 'error');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Guardando…';

    try {
      await KoguAuth.changePassword({
        current_password: current,
        new_password: next,
      });
      KoguApi.toast('Contraseña actualizada. Redirigiendo…', 'success');
      // Pequeña pausa para que el toast se vea y luego mandamos a login
      // para forzar un flujo limpio (re-resolver landing + bootstrap).
      setTimeout(() => {
        KoguAuth.logout(); // limpia sesión y manda a /login.html
      }, 900);
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Guardar nueva contraseña';
      const msg = err?.message || 'No fue posible cambiar la contraseña.';
      KoguApi.toast(msg, 'error');
    }
  });
});

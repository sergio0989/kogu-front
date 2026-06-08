// ============================================================
// portal-api.js
// Cliente API del PORTAL DE PROVEEDORES (superficie externa).
// Token e identidad SEPARADOS del backend interno (no usa KoguApi token
// ni X-Empresa-Id). La empresa activa se manda como ?empresa_id en /me/*.
// Sub-proyecto: modulo-proveedores-v1.
// ============================================================

window.PortalApi = (function () {
  const TOKEN_KEY   = 'kogu_portal_token';
  const EMPRESA_KEY = 'kogu_portal_empresa';

  function base() {
    if (window.KoguApi && KoguApi.getBaseUrl) return KoguApi.getBaseUrl();
    const env = (window.KOGU_ENVIRONMENTS || {})[window.KOGU_DEFAULT_ENV] || {};
    return env.baseUrl || '';
  }

  function getToken()      { return localStorage.getItem(TOKEN_KEY) || ''; }
  function setToken(t)     { localStorage.setItem(TOKEN_KEY, t || ''); }
  function getEmpresaId()  { return localStorage.getItem(EMPRESA_KEY) || ''; }
  function setEmpresaId(id){ localStorage.setItem(EMPRESA_KEY, id || ''); }
  function clear()         { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(EMPRESA_KEY); }

  function requireSession() {
    if (!getToken()) { window.location.href = '/portal/login.html'; return false; }
    return true;
  }

  async function call(path, opts = {}) {
    const { method = 'GET', body = null, auth = true, form = null, withEmpresa = false } = opts;
    let url = base() + path;
    if (withEmpresa && getEmpresaId()) {
      url += (url.includes('?') ? '&' : '?') + 'empresa_id=' + encodeURIComponent(getEmpresaId());
    }
    const headers = {};
    if (auth && getToken()) headers.Authorization = 'Bearer ' + getToken();

    let payload = null;
    if (form) {
      payload = form; // FormData — el browser pone el Content-Type con boundary
    } else if (body) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }

    let res, data;
    try {
      res = await fetch(url, { method, headers, body: payload });
      data = await res.json().catch(() => ({}));
    } catch (e) {
      throw new Error('Error de red. Verifica tu conexión e intenta de nuevo.');
    }

    if (res.status === 401) {
      clear();
      if (!location.pathname.endsWith('/login.html')) window.location.href = '/portal/login.html';
      throw new Error('Sesión expirada. Inicia sesión de nuevo.');
    }
    if (!res.ok || data?.ok === false) {
      const err = new Error(data?.error?.message || ('Error ' + res.status));
      err.status = res.status; err.code = data?.error?.code;
      throw err;
    }
    return data?.data ?? data;
  }

  function toast(msg, kind) {
    let el = document.getElementById('portalToast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'portalToast';
      el.style.cssText = 'position:fixed;bottom:22px;left:50%;transform:translateX(-50%) translateY(140%);background:#0f172a;color:#fff;padding:11px 18px;border-radius:10px;font-size:13px;font-weight:600;box-shadow:0 10px 25px rgba(15,23,42,.2);transition:.35s;z-index:9999';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.background = kind === 'error' ? '#dc2626' : (kind === 'success' ? '#16a34a' : '#0f172a');
    el.style.transform = 'translateX(-50%) translateY(0)';
    setTimeout(() => { el.style.transform = 'translateX(-50%) translateY(140%)'; }, 2800);
  }

  function escapeHtml(s = '') {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  return { base, getToken, setToken, getEmpresaId, setEmpresaId, clear, requireSession, call, toast, escapeHtml };
})();

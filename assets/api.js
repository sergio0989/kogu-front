(function(){
  const ENV_KEY     = 'kogu.env';       // preferencia no sensible → localStorage OK
  const TOKEN_KEY   = 'kogu.token';     // credencial sensible    → sessionStorage solo
  const BOOT_KEY    = 'kogu.bootstrap'; // datos de sesión        → sessionStorage solo
  const SESSION_KEY = 'kogu.session';   // datos de sesión        → sessionStorage solo

  // ─── Entorno ──────────────────────────────────────────────────────────────
  function getEnvName(){ return localStorage.getItem(ENV_KEY) || window.KOGU_DEFAULT_ENV || 'local'; }
  function setEnvName(v){ localStorage.setItem(ENV_KEY, v); }
  function getBaseUrl(){
    const env = window.KOGU_ENVIRONMENTS[getEnvName()] || window.KOGU_ENVIRONMENTS[window.KOGU_DEFAULT_ENV];
    return String(env.baseUrl || '').replace(/\/$/, '');
  }

  // ─── Storage: sensible solo en sessionStorage (F-03) ─────────────────────
  function getSecure(key, fallback = ''){
    return sessionStorage.getItem(key) || fallback;
  }
  function setSecure(key, value){
    try { sessionStorage.setItem(key, value); } catch(_){}
    // NO escribir en localStorage datos de sesión/token
  }
  function removeSecure(key){
    try { sessionStorage.removeItem(key); } catch(_){}
    try { localStorage.removeItem(key); } catch(_){} // limpiar residuos previos
  }

  // ─── Token ────────────────────────────────────────────────────────────────
  function getToken(){ return getSecure(TOKEN_KEY, ''); }
  function setToken(v){ setSecure(TOKEN_KEY, v || ''); }

  // ─── Sesión / Bootstrap ───────────────────────────────────────────────────
  function getSession(){
    try { return JSON.parse(getSecure(SESSION_KEY, '{}')); } catch(_){ return {}; }
  }
  function setSession(v){ setSecure(SESSION_KEY, JSON.stringify(v || {})); }

  function getBootstrap(){
    try { return JSON.parse(getSecure(BOOT_KEY, 'null')); } catch(_){ return null; }
  }
  function setBootstrap(v){
    setSecure(BOOT_KEY, JSON.stringify(v || null));
    try {
      window.dispatchEvent(new CustomEvent('kogu:bootstrap-storage-updated', { detail: v || null }));
    } catch(_){}
  }

  function clearSession(){
    removeSecure(TOKEN_KEY);
    removeSecure(SESSION_KEY);
    removeSecure(BOOT_KEY);
  }

  // ─── Empresa activa ───────────────────────────────────────────────────────
  function getEmpresaActiva(){
    const b = getBootstrap() || {};
    return b.empresa_activa || b.empresaActiva || null;
  }
  function getEmpresaId(){
    const e = getEmpresaActiva() || {};
    return e.empresa_id || e.id || '';
  }

  // ─── Toast ────────────────────────────────────────────────────────────────
  function toast(message, type = 'info'){
    const old = document.querySelector('.toast');
    if(old) old.remove();
    const el = document.createElement('div');
    el.className = 'toast ' + (type === 'error' ? 'error' : type === 'success' ? 'success' : '');
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3500);
  }

  // ─── Helpers HTTP ─────────────────────────────────────────────────────────
  function readErrorMessage(data){
    return data?.error?.message || data?.message || data?.error || (typeof data === 'string' ? data : 'Error al consumir servicio');
  }

  // Adjunta metadatos al Error para que la pantalla pueda ramificar por código
  // en vez de comparar textos. El backend siempre responde
  // { ok:false, error:{ code, message, details } } (ver error-handler.js).
  function buildError(data, status){
    const err = new Error(readErrorMessage(data));
    err.status  = status;
    err.code    = data?.error?.code || '';
    err.details = data?.error?.details ?? null;
    return err;
  }

  // Únicos códigos que significan de verdad "no hay empresa activa".
  const CODIGOS_SIN_EMPRESA = [
    'EMPRESA_ACTIVA_REQUIRED', 'EMPRESA_CONTEXT_MISSING', 'EMPRESA_INACTIVE', 'NO_EMPRESA_ACTIVA'
  ];

  function buildAuthHeaders(headers = {}){
    const h = Object.assign({}, headers || {});
    const token = getToken();
    if(token && !h.Authorization) h.Authorization = 'Bearer ' + token;
    const empresaId = getEmpresaId();
    if(empresaId && !h['X-Empresa-Id']) h['X-Empresa-Id'] = empresaId;
    return h;
  }

  // ─── authFetchRaw (binarios, PDFs) ────────────────────────────────────────
  async function authFetchRaw(path, options = {}){
    const headers = buildAuthHeaders(options.headers || {});
    const response = await fetch(
      path.startsWith('http') ? path : getBaseUrl() + path,
      Object.assign({}, options, { headers })
    );
    if(response.status === 401){
      clearSession();
      toast('Tu sesión expiró. Debes iniciar sesión nuevamente.', 'error');
      setTimeout(() => window.location.href = '/login.html', 500);
    }
    return response;
  }

  // ─── apiFetch con manejo de errores 401/403/409/422 (F-04) ───────────────
  async function apiFetch(path, options = {}){
    const headers = buildAuthHeaders(options.headers || {});
    if(options.body && !(options.body instanceof FormData) && !headers['Content-Type']){
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(getBaseUrl() + path, Object.assign({}, options, { headers }));

    // 401 — Sesión expirada
    if(response.status === 401){
      clearSession();
      toast('Tu sesión expiró. Debes iniciar sesión nuevamente.', 'error');
      setTimeout(() => window.location.href = '/login.html', 500);
      throw new Error('SESSION_EXPIRED');
    }

    const ct = response.headers.get('content-type') || '';
    const data = ct.includes('application/json') ? await response.json() : await response.text();

    // 403 — Sin acceso al módulo o empresa
    if(response.status === 403){
      toast('Sin acceso. Tu usuario no tiene permiso para esta operación.', 'error');
      throw buildError(data, 403);
    }

    // 409 — Conflicto.
    //
    // OJO: 409 NO significa "sin empresa activa". El backend lo usa para
    // decenas de conflictos de negocio legítimos: ERP_PERIODO_CERRADO,
    // CAB_FOLIO_DUPLICADO, CLI_LOTE_YA_LIBERADO, CTO_EXPORT_YA_FINALIZADA…
    // Antes CUALQUIER 409 sacaba al usuario de su pantalla y lo mandaba a
    // cambiar de empresa, perdiendo el trabajo en curso y ocultando el
    // verdadero motivo del rechazo. Sólo redirigen los códigos de contexto.
    if(response.status === 409){
      const code = data?.error?.code || '';
      if(code === 'PASSWORD_CHANGE_REQUIRED'){
        const reason = data?.error?.reason || '';
        toast('Debes cambiar tu contraseña antes de continuar.', 'error');
        setTimeout(() => {
          const qs = reason ? ('?reason=' + encodeURIComponent(reason)) : '';
          window.location.href = '/password-change.html' + qs;
        }, 800);
        throw new Error('PASSWORD_CHANGE_REQUIRED');
      }
      // Sin código no se puede distinguir: se conserva el comportamiento previo.
      if(!code || CODIGOS_SIN_EMPRESA.includes(code)){
        toast('No hay empresa activa. Selecciona una empresa para continuar.', 'error');
        setTimeout(() => window.location.href = '/modules/core/contexto/cambio-empresa.html', 1200);
        throw buildError(data, 409);
      }
      // Conflicto de negocio: lo resuelve la pantalla, que conoce el caso.
      throw buildError(data, 409);
    }

    // 422 — Error funcional de negocio
    if(response.status === 422){
      const msg = readErrorMessage(data);
      toast(msg || 'No fue posible completar la operación.', 'error');
      throw buildError(data, 422);
    }

    if(!response.ok) throw buildError(data, response.status);
    return data;
  }

  // ─── unwrapRows con key explícita opcional (F-08) ─────────────────────────
  // Uso recomendado: unwrapRows(res, 'facturas')
  // Sin key: detecta automáticamente el primer array conocido (compatibilidad)
  function unwrapRows(response, key){
    const d = response?.data ?? response;
    if(key) return d?.[key] ?? [];
    // fallback de compatibilidad — se irá eliminando conforme el backend estandarice { data: { rows } }
    return d?.rows || d?.items || d?.empresas || d?.solicitudes || d?.alertas ||
           d?.permisos || d?.certificados || d?.clientes || d?.proveedores ||
           (Array.isArray(d) ? d : []);
  }
  function unwrapData(response){ return response?.data ?? response ?? {}; }

  window.KoguApi = {
    getEnvName, setEnvName, getBaseUrl,
    getToken, setToken,
    getSession, setSession,
    getBootstrap, setBootstrap, clearSession,
    getEmpresaActiva, getEmpresaId,
    toast, apiFetch, authFetchRaw,
    unwrapRows, unwrapData,
    buildAuthHeaders
  };
})();

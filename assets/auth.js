(function(){
  async function login({email,password}){
    const response = await fetch(KoguApi.getBaseUrl() + '/auth/login', {
      method:'POST',
      mode:'cors',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({email,password})
    });
    const data = await response.json();
    if(!response.ok || data?.ok === false){
      throw new Error(data?.error?.message || data?.message || 'No fue posible iniciar sesión');
    }
    const payload = data?.data || {};
    const token = payload.token || payload.access_token || '';
    if(!token) throw new Error('La respuesta de login no devolvió token.');
    KoguApi.setToken(token);
    KoguApi.setSession(payload);
    if(payload.bootstrap) KoguApi.setBootstrap(payload.bootstrap);
    return payload;
  }

  // Cambio de contraseña self-service (admin-password-policy-v1).
  // Llama POST /auth/password/change. Si el backend responde con un nuevo
  // token (caso típico: el flag de cambio obligatorio se acaba de limpiar),
  // lo reemplazamos en sessionStorage para que las próximas requests no
  // queden bloqueadas por el middleware requirePasswordChangeCompleted.
  async function changePassword({ current_password, new_password }){
    const token = KoguApi.getToken();
    if(!token) throw new Error('No hay sesión activa.');

    const response = await fetch(KoguApi.getBaseUrl() + '/auth/password/change', {
      method:'POST',
      mode:'cors',
      headers:{
        'Content-Type':'application/json',
        'Authorization':'Bearer ' + token
      },
      body: JSON.stringify({ current_password, new_password })
    });
    const data = await response.json().catch(() => ({}));
    if(!response.ok || data?.ok === false){
      const err = new Error(data?.error?.message || 'No fue posible cambiar la contraseña.');
      err.code = data?.error?.code || 'PASSWORD_CHANGE_FAILED';
      err.status = response.status;
      throw err;
    }
    const payload = data?.data || {};
    if(payload.token){
      KoguApi.setToken(payload.token);
      // Refresh de la sesión local marcando flag a false
      const session = KoguApi.getSession() || {};
      session.requiresPasswordChange = false;
      session.passwordChangeReason = null;
      KoguApi.setSession(session);
    }
    return payload;
  }

  function requireAuth(){
    if(!KoguApi.getToken()){
      window.location.href='/login.html';
      return false;
    }
    return true;
  }
  function logout(){
    KoguApi.clearSession();
    window.location.href='/login.html';
  }
  window.KoguAuth={login,changePassword,requireAuth,logout};
})();
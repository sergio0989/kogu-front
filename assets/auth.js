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
  window.KoguAuth={login,requireAuth,logout};
})();
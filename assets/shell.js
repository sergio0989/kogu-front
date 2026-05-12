(function(){
  const NAV=[
    {section:'Administrador',items:[
      {href:'/modules/core/dashboard/index.html',label:'Inicio administración',perm:'screen.root.index'},
      {href:'/modules/core/empresas/empresas.html',label:'Empresas',perm:'screen.root.index'},
      {href:'/modules/core/empresas/empresa-usuarios.html',label:'Usuarios por empresa',perm:'screen.root.index'},
      {href:'/modules/core/usuarios/usuarios.html',label:'Usuarios',perm:'screen.catalogos.usuarios'},
      {href:'/modules/core/usuarios/usuario-certificados.html',label:'Mis certificados',perm:null},
      {href:'/modules/core/perfiles/perfiles.html',label:'Perfiles',perm:'screen.catalogos.perfiles'},
      {href:'/modules/core/permisos/permisos.html',label:'Permisos',perm:'screen.catalogos.permisos'},
      {href:'/modules/core/certificados/certificados.html',label:'Certificados',perm:'screen.root.index'},
      {href:'/modules/core/salud-fiscal/salud-fiscal.html',label:'Salud fiscal',perm:'screen.root.index'},
      {href:'/modules/core/monitor-sat/monitor-sat.html',label:'Monitoreo SAT',perm:'screen.root.index'},
      {href:'/modules/core/contexto/cambio-empresa.html',label:'Cambio de empresa',perm:'screen.root.index'},
    ]},
    {section:'Negocio CFDI',items:[
      {href:'/modules/cfdi/mis-empresas/mis-empresas.html',label:'Mis empresas',perm:'screen.cfdi.sat_dm'},
      {href:'/modules/cfdi/solicitudes/solicitudes.html',label:'Solicitudes SAT',perm:'screen.cfdi.sat_dm'},
      {href:'/modules/cfdi/dashboard/resumen.html',label:'Resumen de negocio',perm:'screen.cfdi.sat_dm'},
      {href:'/modules/cfdi/bandeja/bandeja.html',label:'Bandeja CFDI',perm:'screen.cfdi.sat_dm'},
      {href:'/modules/cfdi/validador-xml/validador-xml.html',label:'Validador XML',perm:'screen.cfdi.sat_dm'},
      {href:'/modules/cfdi/rep/resumen-rep.html',label:'Resumen REP',perm:'screen.cfdi.sat_dm'},
      {href:'/modules/cfdi/rep/bandeja-rep.html',label:'Bandeja REP',perm:'screen.cfdi.cfdi_facturas'},
    ]},
    {section:'Catálogos',items:[
      {href:'/modules/core/clientes/clientes.html',label:'Clientes',perm:'screen.catalogos.clientes'},
      {href:'/modules/core/proveedores/proveedores.html',label:'Proveedores',perm:'screen.catalogos.proveedores'},
    ]},
    {section:'Catálogos Maestros',items:[
      {href:'/modules/cat/familias/familias.html',label:'Familias / Subfamilias',perm:'screen.catalogos.familias'},
      {href:'/modules/cat/unidades/unidades.html',label:'Unidades de Medida',perm:'screen.catalogos.unidades'},
      {href:'/modules/cat/productos/productos.html',label:'Productos',perm:'screen.catalogos.productos'},
    ]},
    {section:'ERP',items:[
      {href:'/modules/erp/importaciones/importaciones.html',label:'Importaciones ERP',perm:'screen.erp.importaciones'},
      {href:'/modules/erp/ventas/ventas.html',label:'Ventas',perm:'screen.erp.ventas'},
      {href:'/modules/erp/compras/compras.html',label:'Compras',perm:'screen.erp.compras'},
      {href:'/modules/erp/producciones/producciones.html',label:'Producciones / Lotes',perm:'screen.erp.producciones'},
      {href:'/modules/erp/cobranza/cobranza.html',label:'Cobranza',perm:'screen.erp.cobranza'},
      {href:'/modules/erp/pagos/pagos.html',label:'Pagos / Tesorería',perm:'screen.erp.pagos'},
    ]},
    {section:'Lab QA',items:[
      // ── Vista ejecutiva ──
      {href:'/modules/lab/lab-kpis.html',             label:'📊 Dashboard KPIs',   perm:'screen.lab.maestros'},
      // ── Entrada (compras) ──
      {href:'/modules/lab/lab-imp-compras.html',      label:'Inspección compras',  perm:'screen.lab.inspeccion_compras'},
      {href:'/modules/lab/lab-cert-proveedor.html',   label:'CofA proveedor',      perm:'screen.lab.inspeccion_compras'},
      // ── Proceso (laboratorio) ──
      {href:'/modules/lab/lab-lotes.html',            label:'Lotes',               perm:'screen.lab.lotes'},
      {href:'/modules/lab/lab-especificaciones.html', label:'Especificaciones',    perm:'screen.lab.especificaciones'},
      // ── Salida (ventas / comercialización) ──
      {href:'/modules/lab/lab-liberaciones.html',     label:'Liberaciones',        perm:'screen.lab.liberaciones'},
      {href:'/modules/lab/lab-excepciones.html',      label:'Excepciones',         perm:'screen.lab.bandeja'},
      {href:'/modules/lab/lab-coa.html',              label:'Certificados COA',    perm:'screen.lab.coa'},
      // ── Transversal / Configuración ──
      {href:'/modules/lab/lab-no-conformidades.html', label:'No Conformidades',    perm:'screen.lab.no_conformidades'},
      {href:'/modules/lab/lab-maestros.html',         label:'Maestros analíticos', perm:'screen.lab.maestros'},
    ]}
  ];

  // ── Secciones colapsables ─────────────────────────────────────────────────
  const NAV_COLLAPSE_KEY = 'kogu:nav-collapsed';

  function getCollapsedSections() {
    try { return JSON.parse(localStorage.getItem(NAV_COLLAPSE_KEY) || '{}'); } catch(_) { return {}; }
  }
  function setCollapsedSection(key, collapsed) {
    try {
      const s = getCollapsedSections();
      s[key] = collapsed;
      localStorage.setItem(NAV_COLLAPSE_KEY, JSON.stringify(s));
    } catch(_) {}
  }
  function isSectionCollapsed(sectionKey) {
    return !!getCollapsedSections()[sectionKey];
  }


  const SIDEBAR_STORAGE_KEY='kogu:sidebar-hidden';
  let _bootstrap = null; // F-06: variable privada, nunca expuesta en window

  function getSidebarHidden(){
    try{
      return localStorage.getItem(SIDEBAR_STORAGE_KEY)==='1';
    }catch(_error){
      return false;
    }
  }

  function setSidebarHidden(hidden){
    try{
      localStorage.setItem(SIDEBAR_STORAGE_KEY, hidden ? '1' : '0');
    }catch(_error){}
  }

  function normalizeCoreBootstrap(data){
    const d = data?.data || data || {};
    return {
      user: d.user || d.usuario || null,
      empresas: d.empresas_autorizadas || d.empresas || [],
      empresa_activa: d.empresa_activa || d.empresaActiva || null,
      empresaActiva: d.empresa_activa || d.empresaActiva || null,
      modulos_habilitados: d.modulos_habilitados || d.modulos || [],
      session: d.session || null,
      environment: d.environment || null,
      permissions: d.permissions || d.permisos || [],
      screens: d.screens || [],
      source: 'core'
    };
  }

  function isCorePath(pathname){
    return String(pathname || window.location.pathname || '').includes('/modules/core/');
  }

  function mergeBootstraps(coreBoot, koguBoot){
    const c = normalizeCoreBootstrap(coreBoot);
    const k = koguBoot?.data || koguBoot || {};
    return {
      ...k,
      ...c,
      user: c.user || k.user || null,
      empresas: c.empresas || k.empresas || [],
      empresa_activa: c.empresa_activa || null,
      empresaActiva: c.empresa_activa || null,
      modulos_habilitados: c.modulos_habilitados || k.modulos_habilitados || k.modules || [],
      permissions: (k.permissions || k.permisos || []).length ? (k.permissions || k.permisos || []) : (c.permissions || []),
      screens: k.screens || c.screens || [],
      environment: c.environment || k.environment || {},
      source: 'merged'
    };
  }

  function emitBootstrapEvents(boot){
    try{
      window.dispatchEvent(new CustomEvent('kogu:bootstrap-updated', { detail: boot }));
      if (boot?.empresa_activa) {
        window.dispatchEvent(new CustomEvent('kogu:empresa-activa-cambiada', { detail: boot.empresa_activa }));
      }
    }catch(_error){}
  }

  async function loadCoreBootstrap(){
    const response = await KoguApi.apiFetch('/protected/core/context/bootstrap');
    const boot = normalizeCoreBootstrap(response);
    KoguApi.setBootstrap(boot);
    emitBootstrapEvents(boot);
    return boot;
  }

  async function loadBootstrap(){
    const coreBoot = await loadCoreBootstrap();

    if (isCorePath()) {
      KoguApi.setBootstrap(coreBoot);
      emitBootstrapEvents(coreBoot);
      return coreBoot;
    }

    try{
      const koguResp = await KoguApi.apiFetch('/protected/kogu/bootstrap');
      const merged = mergeBootstraps(coreBoot, KoguApi.unwrapData(koguResp));
      KoguApi.setBootstrap(merged);
      emitBootstrapEvents(merged);
      return merged;
    }catch(_error){
      KoguApi.setBootstrap(coreBoot);
      emitBootstrapEvents(coreBoot);
      return coreBoot;
    }
  }

  function readSessionUser(){
    try{
      return window.KoguApi?.getSession?.()?.user || null;
    }catch(_error){
      return null;
    }
  }

  function resolveUserProfile(bootstrap){
    const bootUser = bootstrap?.user || {};
    const sessionUser = readSessionUser() || {};
    return (
      bootUser.perfil ||
      bootUser.perfil_nombre ||
      bootUser.rol ||
      sessionUser.perfil ||
      sessionUser.perfil_nombre ||
      sessionUser.rol ||
      '-'
    );
  }

  function resolveUserName(bootstrap){
    const bootUser = bootstrap?.user || {};
    const sessionUser = readSessionUser() || {};
    return (
      bootUser.nombre ||
      bootUser.name ||
      bootUser.email ||
      sessionUser.nombre ||
      sessionUser.name ||
      sessionUser.email ||
      '-'
    );
  }

  function hasPerm(bootstrap,perm){
    if(!perm) return true;

    const perms = bootstrap?.permissions || bootstrap?.permisos || [];

    if (!Array.isArray(perms) || perms.length === 0) {
      return false;
    }

    return perms.includes(perm);
  }

  function sectionHtml(current,section){
    const items=section.items.filter(x=>hasPerm(_bootstrap,x.perm));
    if(!items.length) return '';
    const key = section.section;
    const collapsed = isSectionCollapsed(key);
    // Marca activa si algún ítem del grupo es la página actual
    const hasActive = items.some(x => x.href === current);
    return `<div class="nav-section${collapsed ? ' nav-section--collapsed' : ''}" data-nav-section="${key}">
      <button class="nav-title-btn" data-nav-toggle="${key}" title="Expandir/colapsar ${key}">
        <span>${section.section}</span>
        <span class="nav-title-arrow">${collapsed ? '▶' : '▼'}</span>
        ${hasActive ? '<span class="nav-section-dot"></span>' : ''}
      </button>
      <div class="nav-section-items">${items.map(x=>`<a class="nav-link ${x.href===current?'active':''}" href="${x.href}">${x.label}</a>`).join('')}</div>
    </div>`;
  }

  function bindNavCollapse() {
    document.querySelectorAll('[data-nav-toggle]').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.navToggle;
        const section = document.querySelector(`[data-nav-section="${key}"]`);
        if (!section) return;
        const isNowCollapsed = !section.classList.contains('nav-section--collapsed');
        section.classList.toggle('nav-section--collapsed', isNowCollapsed);
        const arrow = btn.querySelector('.nav-title-arrow');
        if (arrow) arrow.textContent = isNowCollapsed ? '▶' : '▼';
        setCollapsedSection(key, isNowCollapsed);
      });
    });
  }

  function renderSidebar(current,bootstrap){
    _bootstrap=bootstrap; // F-06: privado
    const empresa=bootstrap.empresa_activa||{};
    const env=bootstrap.environment||{};
    const sections=NAV.map(s=>sectionHtml(current,s)).join('');
    return `<aside class="sidebar">
      <div class="sidebar-head">
        <div>
          <div class="brand-kicker">KOGU</div>
          <div class="brand-title">Multiempresa</div>
        </div>
      </div>
      <div class="brand-text">Core estable con contexto multiempresa y módulos administrativos/negocio sobre bootstrap real.</div>
      <div class="nav-group">${sections}</div>
      <div class="context-card">
        <div class="label">Empresa activa</div>
        <div class="value" data-kogu-sidebar-empresa>${empresa.nombre_corto||empresa.razon_social||'Sin empresa'}</div>
        <div class="sub" data-kogu-sidebar-rfc>${empresa.rfc||'Sin RFC'}</div>
        <div style="margin-top:12px" class="btns">
          <span class="badge primary">${env.name||'local'}</span>
          <button class="btn" id="logoutBtn" style="padding:8px 10px">Cerrar sesión</button>
        </div>
      </div>
    </aside>`;
  }

  function renderTopbar(title,desc,bootstrap){
    const empresa=bootstrap.empresa_activa||{};
    const userName = resolveUserName(bootstrap);
    const profile = resolveUserProfile(bootstrap);
    return `<header class="topbar">
      <button
        class="menu-tab-toggle no-print"
        id="sidebarToggleBtnTopbar"
        type="button"
        aria-label="Ocultar menú"
        title="Ocultar menú"
      >
        <span class="menu-tab-toggle__icon">◀</span>
      </button>

      <div class="topbar-leading">
        <div>
          <div class="eyebrow">KOGU multiempresa</div>
          <h1>${title}</h1>
          <p>${desc}</p>
        </div>
      </div>

      <div class="topbar-cards">
        <div class="top-mini"><div class="k">Usuario</div><div class="v" data-kogu-user>${userName}</div></div>
        <div class="top-mini"><div class="k">Empresa activa</div><div class="v" data-kogu-empresa>${empresa.nombre_corto||empresa.razon_social||'-'}</div></div>
        <div class="top-mini"><div class="k">Perfil</div><div class="v" data-kogu-perfil>${profile}</div></div>
      </div>
    </header>`;
  }


  function applySidebarState(hidden){
    const layout = document.querySelector('.layout');
    const topbarBtn = document.getElementById('sidebarToggleBtnTopbar');

    if (layout) {
      layout.classList.toggle('sidebar-hidden', !!hidden);
    }

    if (topbarBtn) {
      const iconEl = topbarBtn.querySelector('.menu-tab-toggle__icon');
      if (iconEl) iconEl.textContent = hidden ? '▶' : '◀';

      topbarBtn.setAttribute('aria-label', hidden ? 'Mostrar menú' : 'Ocultar menú');
      topbarBtn.setAttribute('title', hidden ? 'Mostrar menú' : 'Ocultar menú');
    }
  }

  function bindSidebarToggle(){
    const topbarBtn = document.getElementById('sidebarToggleBtnTopbar');

    const toggle = () => {
      const next = !getSidebarHidden();
      setSidebarHidden(next);
      applySidebarState(next);
    };

    if (topbarBtn) topbarBtn.onclick = toggle;

    applySidebarState(getSidebarHidden());
  }

  function refreshChrome(bootstrap){
    const empresa = bootstrap?.empresa_activa || {};
    const userName = resolveUserName(bootstrap);
    const profile = resolveUserProfile(bootstrap);

    const userEl = document.querySelector('[data-kogu-user]');
    const empresaEl = document.querySelector('[data-kogu-empresa]');
    const perfilEl = document.querySelector('[data-kogu-perfil]');
    const sidebarEmpresaEl = document.querySelector('[data-kogu-sidebar-empresa]');
    const sidebarRfcEl = document.querySelector('[data-kogu-sidebar-rfc]');

    if (userEl) userEl.textContent = userName;
    if (empresaEl) empresaEl.textContent = empresa.nombre_corto || empresa.razon_social || '-';
    if (perfilEl) perfilEl.textContent = profile;
    if (sidebarEmpresaEl) sidebarEmpresaEl.textContent = empresa.nombre_corto || empresa.razon_social || 'Sin empresa';
    if (sidebarRfcEl) sidebarRfcEl.textContent = empresa.rfc || 'Sin RFC';

    _bootstrap = bootstrap; // F-06: privado
  }

  async function initShell({currentPage,title,description,requiredPermission}){
    if(!KoguAuth.requireAuth()) return null;
    const bootstrap=await loadBootstrap();
    if(requiredPermission && !hasPerm(bootstrap,requiredPermission)){
      document.body.innerHTML=`<div style="padding:32px"><h1>Acceso denegado</h1><p>No tienes permiso para entrar a esta pantalla.</p><a href="/modules/core/dashboard/index.html">Volver</a></div>`;
      return null;
    }
    document.getElementById('app').innerHTML=`<div class="layout ${getSidebarHidden() ? 'sidebar-hidden' : ''}">${renderSidebar(currentPage,bootstrap)}<main class="main">${renderTopbar(title,description,bootstrap)}<section class="content" id="pageContent"></section></main></div>`;
    const btn=document.getElementById('logoutBtn'); if(btn) btn.onclick=()=>KoguAuth.logout();
    bindSidebarToggle();
    bindNavCollapse();

    window.addEventListener('kogu:bootstrap-updated', (event) => {
      if (event?.detail) refreshChrome(event.detail);
    });

    return bootstrap;
  }

  function subscribeEmpresaActivaChange(handler){
    const wrapped = async (event) => {
      try { await handler(event?.detail || null, event); } catch (err) { console.error(err); }
    };
    window.addEventListener('kogu:empresa-activa-cambiada', wrapped);
    return () => window.removeEventListener('kogu:empresa-activa-cambiada', wrapped);
  }

  window.KoguShell={initShell,loadBootstrap,loadCoreBootstrap,hasPerm,subscribeEmpresaActivaChange,refreshChrome};
})();
(function(){
  const NAV=[
    {section:'Administrador',items:[
      {href:'/modules/core/dashboard/index.html',label:'Inicio administración',perm:'screen.root.index'},
      {href:'/modules/core/empresas/empresas.html',label:'Empresas',perm:'screen.root.index'},
      {href:'/modules/core/empresas/empresa-usuarios.html',label:'Usuarios por empresa',perm:'screen.root.index'},
      {href:'/modules/core/usuarios/usuarios.html',label:'Usuarios',perm:'screen.root.index'},
      // "Mis certificados" se movió a la sección "Mi cuenta" al final del NAV
      // para que la sección "Administrador" no aparezca a perfiles no-admin
      // (gerente_calidad, supervisor_lab, analista_lab) que tienen catalogos.usuarios
      // sólo para resolver nombres en pickers, no para gestionar usuarios.
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
      {href:'/modules/cfdi/bandeja-nomina/bandeja-nomina.html',label:'Bandeja CFDI Nómina',perm:['cfdi.tipo.nomina.read','cfdi.alcance.solo_nomina']},
      {href:'/modules/cfdi/validador-xml/validador-xml.html',label:'Validador XML',perm:'screen.cfdi.sat_dm'},
      {href:'/modules/cfdi/conciliacion/conciliacion-erp.html',label:'Conciliación CFDI',perm:'screen.cfdi.sat_dm'},
      {href:'/modules/cfdi/auditoria/auditoria.html',label:'Auditoría CFDI',perm:'screen.cfdi.sat_dm'},
      {href:'/modules/cfdi/rep/resumen-rep.html',label:'Resumen REP',perm:'screen.cfdi.sat_dm'},
      {href:'/modules/cfdi/rep/bandeja-rep.html',label:'Bandeja REP',perm:'screen.cfdi.cfdi_facturas'},
      {href:'/modules/cfdi/rep/emitidas-pendientes.html',label:'PPD emitidas pendientes',perm:'screen.cfdi.cfdi_facturas'},
    ]},
    {section:'Catálogos',items:[
      {href:'/modules/core/clientes/clientes.html',label:'Clientes',perm:'screen.catalogos.clientes'},
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
    {section:'Radar Comercial',items:[
      {href:'/modules/rc/tablero.html',label:'Tablero (Dirección)',perm:'screen.ventas.direccion'},
      {href:'/modules/rc/bandeja.html',label:'Bandeja de Riesgo',perm:'screen.ventas.direccion'},
      {href:'/modules/rc/cumplimiento.html',label:'Cumplimiento de agentes',perm:'screen.ventas.direccion'},
      {href:'/modules/rc/mi-panel.html',label:'Mi panel (Vendedor)',perm:'screen.ventas.vendedor'},
      {href:'/modules/rc/mi-panel.html',label:'Panel por agente',perm:'screen.ventas.direccion'},
      {href:'/modules/rc/agentes.html',label:'Agentes comerciales',perm:'screen.ventas.agentes'},
      {href:'/modules/rc/asignacion.html',label:'Asignar clientes',perm:'screen.ventas.agentes'},
      {href:'/modules/rc/presupuesto.html',label:'Presupuesto (PP)',perm:'screen.ventas.direccion'},
      {href:'/modules/rc/asignacion-pp.html',label:'Asignación PP',perm:'screen.ventas.direccion'},
      {href:'/modules/rc/pp-carga.html',label:'Carga de PP',perm:'rc.pp.manage'},
      {href:'/modules/rc/actividad-crm.html',label:'Actividad CRM (I+D)',perm:'rc.crm_actividades.read'},
      {href:'/modules/rc/ventas-export.html',label:'Ventas de Exportación',perm:'rc.ventas_export.read'},
    ]},
    {section:'CRM',items:[
      {href:'/modules/crm/actividades.html',label:'Actividades de seguimiento',perm:'crm.actividades.read'},
      {href:'/modules/crm/notif-plantillas.html',label:'Plantillas de notificación',perm:'notif.read'},
      {href:'/modules/crm/notif-envios.html',label:'Bitácora de notificaciones',perm:'notif.read'},
    ]},
    {section:'Comisiones',items:[
      {href:'/modules/com/comisiones.html',label:'Comisiones',perm:'screen.comisiones'},
      {href:'/modules/com/kpi.html',label:'KPI de Comisiones',perm:'screen.comisiones'},
      {href:'/modules/com/configuracion.html',label:'Configuración',perm:'screen.comisiones'},
    ]},
    {section:'Costo',items:[
      {href:'/modules/cto/direccion-ventas.html',label:'📈 Dirección · Ventas (80/20)',perm:'screen.costo'},
      {href:'/modules/cto/dashboard-bruta.html',label:'📊 Dirección · Utilidad Bruta',perm:'screen.costo'},
      {href:'/modules/cto/dashboard-operacion.html',label:'📊 Dirección · Utilidad Operación',perm:'screen.costo'},
      {href:'/modules/cto/exportacion-analisis.html',label:'🌎 Exportación · Análisis',perm:'screen.costo'},
      {href:'/modules/cto/costo-export-cliente.html',label:'🌎 Exportación · Costo por cliente',perm:'screen.cto.export_cliente'},
      {href:'/modules/cto/reporte-ejecutivo.html',label:'📄 Reporte ejecutivo (PDF)',perm:'screen.costo'},
      {href:'/modules/cto/eficiencia-comercial.html',label:'🎯 Eficiencia comercial',perm:'screen.costo'},
      {href:'/modules/cto/cargas.html',label:'Cargas / Importación',perm:'screen.costo'},
      {href:'/modules/cto/captura-abc.html',label:'Captura ABC (gastos)',perm:'screen.costo'},
      {href:'/modules/cto/factores-abc.html',label:'🧮 Factores del ABC (dashboard)',perm:'screen.cto.factores'},
      {href:'/modules/cto/captura-gastos-venta.html',label:'Captura Gastos de Venta',perm:'screen.costo'},
      {href:'/modules/cto/integraciones-export.html',label:'🌎 Exportación · Integraciones de costo',perm:'screen.costo'},
      {href:'/modules/cto/resumen.html',label:'Costo de ventas / Utilidad',perm:'screen.costo'},
      {href:'/modules/cto/bandeja.html',label:'Bandeja / Corrección de costo',perm:'screen.costo'},
      {href:'/modules/cto/factura.html',label:'Ficha de factura',perm:'screen.costo'},
      {href:'/modules/cto/rentabilidad.html',label:'Rentabilidad (producto/cliente)',perm:'screen.costo'},
      {href:'/modules/cto/compras-usd.html',label:'Compras USD / Dif. cambiaria',perm:'screen.costo'},
      {href:'/modules/cto/inventario.html',label:'Inventario integrado',perm:'screen.costo'},
      {href:'/modules/cto/productos-b.html',label:'Productos B (producidos)',perm:'screen.costo'},
      {href:'/modules/cto/cierre.html',label:'Validación / Cierre de periodo',perm:'screen.costo'},
    ]},
    {section:'Comercio Exterior',items:[
      {href:'/modules/comex/resumen-comex.html',label:'📊 Resumen ejecutivo',perm:'screen.comex.resumen'},
      {href:'/modules/comex/analisis-comex.html',label:'📈 Análisis y exportación',perm:'screen.comex.analisis'},
      {href:'/modules/comex/costeo-teorico.html',label:'🌐 Costeo teórico (importación)',perm:'screen.comex'},
      {href:'/modules/comex/pedimentos-sat.html',label:'📥 Pedimentos SAT (matriz)',perm:'screen.comex.pedimentos'},
      {href:'/modules/comex/reconciliacion.html',label:'⚖️ Reconciliación (real vs teórico)',perm:'screen.comex.reconciliacion'},
      {href:'/modules/comex/cobertura-comex.html',label:'🎯 Cobertura (huecos de costeo)',perm:'screen.comex.cobertura'},
      {href:'/modules/comex/cruce-ventas.html',label:'🔗 Cruce venta-importación',perm:'screen.comex.cruce_ventas'},
    ]},
    {section:'Materialidad',items:[
      // Flujo bottom-up: primero conoces al tercero, después clasificas la
      // operación, al final el CFDI es la materialización fiscal.
      {href:'/modules/exp/expedientes.html',    label:'Expedientes de terceros',    perm:'screen.exp.expedientes'},
      {href:'/modules/mat/casos.html',          label:'Casos de operación',         perm:'screen.mat.casos'},
      {href:'/modules/mat/bandeja-defensa.html',label:'Bandeja de Defensa',         perm:'screen.mat.bandeja_defensa'},
      {href:'/modules/mat/reglas.html',         label:'Reglas de materialidad',     perm:'screen.mat.reglas'},
    ]},
    {section:'Proveedores',items:[
      {href:'/modules/core/proveedores/proveedores.html',label:'Catálogo de Proveedores', perm:'screen.catalogos.proveedores'},
      {href:'/modules/prov/invitar.html',         label:'Invitar Proveedor',         perm:'prov_portal.invitar'},
      {href:'/modules/prov/bandeja-revision.html',label:'Bandeja de Revisión',       perm:'screen.prov.bandeja_revision'},
      {href:'/modules/prov/banca.html',           label:'Validación Bancaria',       perm:'screen.prov.banca'},
      {href:'/modules/prov/cfdi.html',            label:'Verificación CFDI',         perm:'screen.prov.cfdi'},
    ]},
    {section:'Lab QA',items:[
      // ── Vista ejecutiva ──
      {href:'/modules/lab/lab-kpis.html',             label:'📊 Dashboard KPIs',   perm:'screen.lab.kpis'},
      // ── Entrada (compras) ──
      {href:'/modules/lab/lab-imp-compras.html',         label:'Inspección compras',    perm:'screen.lab.inspeccion_compras'},
      {href:'/modules/lab/lab-cert-proveedor.html',      label:'CofA proveedor',        perm:'screen.lab.inspeccion_compras'},
      // ── Importaciones ERP ──
      {href:'/modules/lab/lab-imp-producciones.html',    label:'Imp. Producciones ERP', perm:'screen.lab.producciones_imports'},
      {href:'/modules/lab/lab-imp-facturas-venta.html',  label:'Imp. Facturas venta',   perm:'screen.lab.facturas_imports'},
      // ── Proceso (laboratorio) ──
      {href:'/modules/lab/lab-lotes.html',            label:'Lotes',               perm:'screen.lab.lotes'},
      {href:'/modules/lab/lab-especificaciones.html', label:'Especificaciones',    perm:'screen.lab.especificaciones'},
      // ── Salida (ventas / comercialización) ──
      {href:'/modules/lab/lab-liberaciones.html',     label:'Liberaciones',        perm:'screen.lab.liberaciones'},
      {href:'/modules/lab/lab-excepciones.html',      label:'Excepciones',         perm:'screen.lab.bandeja'},
      {href:'/modules/lab/lab-coa.html',              label:'Certificados COA',    perm:'screen.lab.coa'},
      // ── Transversal / Configuración ──
      {href:'/modules/lab/lab-no-conformidades.html',    label:'No Conformidades',    perm:'screen.lab.no_conformidades'},
      {href:'/modules/lab/lab-maestros.html',            label:'Maestros analíticos', perm:'screen.lab.maestros'},
      {href:'/modules/lab/lab-plantilla-producto.html',  label:'Plantilla productos', perm:'lab.plantilla_producto.manage'},
    ]},
    {section:'Activos',items:[
      {href:'/modules/act/dashboard.html',     label:'Dashboard',     perm:'act.dashboard.read'},
      {href:'/modules/act/activos.html',       label:'Activos',       perm:'act.activos.read'},
      {href:'/modules/act/mantenimiento.html', label:'Mantenimiento', perm:'act.ordenes.read'},
      {href:'/modules/act/reparaciones.html',  label:'Reparaciones',  perm:'act.ordenes.read'},
      {href:'/modules/act/inventario.html',    label:'Inventario',    perm:'act.inventario.read'},
      {href:'/modules/act/inspecciones.html',  label:'Inspecciones',  perm:'act.inspecciones.read'},
      {href:'/modules/act/gestoria.html',      label:'Gestoría',      perm:'act.gestoria.read'},
      {href:'/modules/act/proveedores.html',   label:'Proveedores',   perm:'act.proveedores.read'},
    ]},
    {section:'Documental',items:[
      {href:'/modules/doc/dashboard.html',      label:'Tablero',         perm:'doc.dashboard.read'},
      {href:'/modules/doc/documentos.html',     label:'Documentos',      perm:'doc.documentos.read'},
      {href:'/modules/doc/mis-documentos.html', label:'Mis documentos',  perm:'doc.asignaciones.read'},
    ]},
    {section:'Activos · Catálogos',items:[
      {href:'/modules/act/ubicaciones.html', label:'Ubicaciones', perm:'act.catalogos.read'},
      {href:'/modules/act/categorias.html',  label:'Categorías',  perm:'act.catalogos.read'},
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
      pagina_inicio: d.pagina_inicio || (d.user && d.user.pagina_inicio) || null,
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

    // perm puede ser string (exacto) o arreglo (any-of: basta con tener uno).
    if (Array.isArray(perm)) {
      return perm.some((p) => perms.includes(p));
    }

    return perms.includes(perm);
  }

  // Resuelve la "página de inicio" del usuario para el botón Mi inicio:
  // 1) pagina_inicio del perfil (si es ruta válida), 2) primer ítem del
  // menú al que tiene permiso, 3) login como último recurso.
  function resolveHome(bootstrap){
    const pi = bootstrap && (bootstrap.pagina_inicio || (bootstrap.user && bootstrap.user.pagina_inicio));
    if (typeof pi === 'string' && pi.startsWith('/')) return pi;
    for (const s of NAV){
      for (const it of (s.items || [])){
        if (hasPerm(bootstrap, it.perm)) return it.href;
      }
    }
    return '/login.html';
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
        </div>
      </div>
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
    const kicker = _deriveTopbarKicker(_currentPagePath);
    const empresaTxt = empresa.nombre_corto || empresa.razon_social || 'Sin empresa';
    const empresaIni = _initialsFrom(empresaTxt);
    const userIni = _initialsFrom(userName, 2);
    return `<header class="topbar topbar-v2">
      <button class="topbar-back" id="sidebarToggleBtnTopbar" type="button" aria-label="Ocultar menú" title="Ocultar menú">
        <span class="topbar-back__icon">‹</span>
      </button>
      <button class="btn" id="homeBtnTopbar" type="button" aria-label="Mi inicio" title="Ir a mi página de inicio" style="margin:0 12px 0 4px;white-space:nowrap;padding:8px 12px">⌂ Mi inicio</button>
      <div class="topbar-heading">
        <div class="topbar-heading__row1">
          <span class="topbar-heading__kicker" data-kogu-kicker>${kicker}</span>
          <span class="topbar-heading__sep">/</span>
          <h1 class="topbar-heading__title">${title || ''}</h1>
        </div>
        ${desc ? `<p class="topbar-heading__desc">${desc}</p>` : ''}
      </div>
      <button class="ctx-chip" id="ctxChipBtn" type="button" aria-label="Contexto · usuario y empresa" title="Cambiar empresa">
        <span class="ctx-chip__ini" data-kogu-empresa-ini>${empresaIni}</span>
        <span class="ctx-chip__info">
          <span class="ctx-chip__row">
            <span class="ctx-chip__k">USUARIO</span>
            <span class="ctx-chip__v" data-kogu-user>${userName}</span>
          </span>
          <span class="ctx-chip__row">
            <span class="ctx-chip__k">EMPRESA</span>
            <span class="ctx-chip__v" data-kogu-empresa>${empresaTxt}</span>
          </span>
        </span>
        <span class="ctx-chip__caret">▾</span>
      </button>
    </header>`;
  }

  // Deriva el kicker del topbar a partir del path de la pantalla activa.
  function _deriveTopbarKicker(currentPage){
    if (!currentPage) return 'KOGU';
    const p = String(currentPage).toLowerCase();
    if (p.includes('/modules/lab/'))     return 'LAB QA';
    if (p.includes('/modules/act/'))     return 'ACTIVOS';
    if (p.includes('/modules/doc/'))     return 'DOCUMENTAL';
    if (p.includes('/modules/cfdi/'))    return 'CFDI';
    if (p.includes('/modules/erp/'))     return 'ERP';
    if (p.includes('/modules/mat/') ||
        p.includes('/modules/exp/'))     return 'MATERIALIDAD';
    if (p.includes('/modules/cat/'))     return 'CATÁLOGOS';
    if (p.includes('/modules/core/'))    return 'ADMINISTRADOR';
    return 'KOGU';
  }

  // Iniciales legibles de un texto (empresa o usuario).
  function _initialsFrom(text, max){
    const limit = max || 2;
    if (!text) return '·';
    const parts = String(text).trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '·';
    if (parts.length === 1) return parts[0].slice(0, limit).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  // Variable de módulo para que renderTopbar conozca el path actual al refrescar.
  let _currentPagePath = '';


  function applySidebarState(hidden){
    const layout = document.querySelector('.layout');
    const topbarBtn = document.getElementById('sidebarToggleBtnTopbar');

    if (layout) {
      layout.classList.toggle('sidebar-hidden', !!hidden);
    }

    if (topbarBtn) {
      // Soporta dos markups: el v1 (.menu-tab-toggle__icon con ◀/▶) y el v2
      // del topbar (.topbar-back__icon con ‹/›). El ícono se invierte según
      // si el sidebar está oculto.
      const iconV1 = topbarBtn.querySelector('.menu-tab-toggle__icon');
      const iconV2 = topbarBtn.querySelector('.topbar-back__icon');
      if (iconV1) iconV1.textContent = hidden ? '▶' : '◀';
      if (iconV2) iconV2.textContent = hidden ? '›' : '‹';

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
    const empresaTxt = empresa.nombre_corto || empresa.razon_social || '-';

    // Selectores antiguos (compat con topbar v1).
    const userEl = document.querySelector('[data-kogu-user]');
    const empresaEl = document.querySelector('[data-kogu-empresa]');
    const perfilEl = document.querySelector('[data-kogu-perfil]');
    const sidebarEmpresaEl = document.querySelector('[data-kogu-sidebar-empresa]');
    const sidebarRfcEl = document.querySelector('[data-kogu-sidebar-rfc]');

    if (userEl) userEl.textContent = userName;
    if (empresaEl) empresaEl.textContent = empresaTxt;
    if (perfilEl) perfilEl.textContent = profile;
    if (sidebarEmpresaEl) sidebarEmpresaEl.textContent = empresa.nombre_corto || empresa.razon_social || 'Sin empresa';
    if (sidebarRfcEl) sidebarRfcEl.textContent = empresa.rfc || 'Sin RFC';

    // Topbar v2 — chip de empresa y avatar de usuario.
    const empresaIniEl = document.querySelector('[data-kogu-empresa-ini]');
    const userIniEl    = document.querySelector('[data-kogu-user-ini]');
    if (empresaIniEl) empresaIniEl.textContent = _initialsFrom(empresaTxt);
    if (userIniEl)    userIniEl.textContent    = _initialsFrom(userName, 2);

    _bootstrap = bootstrap; // F-06: privado
  }

  // Liga el chip de contexto (usuario + empresa) al modal de cambio de
  // empresa. El mismo modal sirve para identidad y selección.
  function bindEmpresaChip(){
    const ctxBtn = document.getElementById('ctxChipBtn');
    if (ctxBtn) ctxBtn.onclick = () => openEmpresaModal();
  }

  // Modal global de cambio de empresa.
  // Lo abre el chip del topbar y también cambio-empresa.html.
  function openEmpresaModal(){
    const boot = _bootstrap;
    if (!boot) return;
    const empresas = boot.empresas || boot.empresas_autorizadas || [];
    const activaId = boot.empresa_activa?.empresa_id;

    // Info del usuario para el bloque superior del modal.
    const userName  = resolveUserName(boot);
    const userPerf  = resolveUserProfile(boot);
    const userEmail = boot?.user?.email || '';
    const userIni   = _initialsFrom(userName, 2);
    const userMeta  = [userPerf && userPerf !== '-' ? userPerf : '', userEmail]
      .filter(Boolean).join(' · ');

    let overlay = document.getElementById('koguEmpresaModal');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'koguEmpresaModal';
      overlay.className = 'kogu-modal-overlay';
      document.body.appendChild(overlay);
    }
    overlay.innerHTML = `
      <div class="kogu-modal kogu-modal--empresa" role="dialog" aria-modal="true" aria-label="Cambiar empresa activa">
        <div class="kogu-modal__head">
          <div>
            <div class="kogu-modal__eyebrow">Empresa activa</div>
            <h2>Cambiar empresa</h2>
          </div>
          <button class="kogu-modal__close" id="koguEmpresaModalClose" type="button" aria-label="Cerrar">×</button>
        </div>
        <div class="kogu-modal__user">
          <span class="kogu-modal__user-ini">${userIni}</span>
          <div class="kogu-modal__user-info">
            <div class="kogu-modal__user-nombre">${userName}</div>
            ${userMeta ? `<div class="kogu-modal__user-meta">${userMeta}</div>` : ''}
          </div>
        </div>
        <ul class="kogu-empresa-list">
          ${empresas.length ? empresas.map(e => {
            const isActiva = e.empresa_id === activaId;
            const nombre = e.nombre_corto || e.razon_social || '—';
            const ini = _initialsFrom(nombre);
            return `
              <li class="kogu-empresa-list__item${isActiva ? ' is-active' : ''}" data-empresa-id="${e.empresa_id}">
                <span class="kogu-empresa-list__check">${isActiva ? '✓' : ''}</span>
                <span class="kogu-empresa-list__ini">${ini}</span>
                <span class="kogu-empresa-list__info">
                  <span class="kogu-empresa-list__nombre">${nombre}</span>
                  <span class="kogu-empresa-list__rfc">${e.rfc || ''}</span>
                </span>
              </li>
            `;
          }).join('') : '<li class="kogu-empresa-list__empty">Sin empresas disponibles.</li>'}
        </ul>
      </div>
    `;
    overlay.classList.add('is-open');

    const closeBtn = document.getElementById('koguEmpresaModalClose');
    if (closeBtn) closeBtn.onclick = closeEmpresaModal;
    overlay.onclick = (ev) => { if (ev.target === overlay) closeEmpresaModal(); };

    overlay.querySelectorAll('.kogu-empresa-list__item').forEach(li => {
      li.onclick = async () => {
        const empresaId = li.dataset.empresaId;
        if (!empresaId || empresaId === activaId) { closeEmpresaModal(); return; }
        try {
          await KoguApi.apiFetch('/protected/core/context/empresa-activa', {
            method: 'POST',
            body: JSON.stringify({ empresa_id: empresaId })
          });
          const newBoot = await loadCoreBootstrap();
          refreshChrome(newBoot);
          window.dispatchEvent(new CustomEvent('kogu:empresa-activa-cambiada', { detail: newBoot }));
          KoguApi.toast('Empresa activa actualizada', 'success');
          closeEmpresaModal();
        } catch (err) {
          KoguApi.toast(err.message || 'No fue posible cambiar la empresa activa', 'error');
        }
      };
    });
  }

  function closeEmpresaModal(){
    const overlay = document.getElementById('koguEmpresaModal');
    if (overlay) overlay.classList.remove('is-open');
  }

  async function initShell({currentPage,title,description,requiredPermission}){
    if(!KoguAuth.requireAuth()) return null;
    const bootstrap=await loadBootstrap();
    // requiredPermission puede ser string (exacto) o arreglo (any-of: basta
    // tener uno). Útil en pantallas compartidas por más de un perfil.
    const permDenied = requiredPermission && (Array.isArray(requiredPermission)
      ? !requiredPermission.some(p=>hasPerm(bootstrap,p))
      : !hasPerm(bootstrap,requiredPermission));
    if(permDenied){
      document.body.innerHTML=`
        <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:32px;box-sizing:border-box">
          <div style="max-width:440px;width:100%;text-align:center;background:var(--panel,#fff);border:1px solid var(--line,#e2e8f0);border-radius:16px;padding:32px 28px;box-shadow:0 12px 40px rgba(0,0,0,.08)">
            <div class="eyebrow" style="color:var(--muted,#64748b)">KOGU Multiempresa</div>
            <h1 style="margin:8px 0 6px;font-size:22px">Acceso denegado</h1>
            <p style="color:var(--muted,#64748b);margin:0 0 22px">No tienes permiso para entrar a esta pantalla. Usa el menú o cierra sesión para entrar con otra cuenta.</p>
            <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
              <button class="btn" id="denegadoBack">Volver</button>
              <button class="btn primary" id="denegadoLogout">Cerrar sesión</button>
            </div>
          </div>
        </div>`;
      const back=document.getElementById('denegadoBack');
      if(back) back.onclick=()=>{ if(history.length>1) history.back(); else window.location.href='/login.html'; };
      const out=document.getElementById('denegadoLogout');
      if(out) out.onclick=()=>KoguAuth.logout();
      return null;
    }
    _currentPagePath = currentPage || '';
    document.getElementById('app').innerHTML=`<div class="layout ${getSidebarHidden() ? 'sidebar-hidden' : ''}">${renderSidebar(currentPage,bootstrap)}<main class="main">${renderTopbar(title,description,bootstrap)}<section class="content" id="pageContent"></section></main></div>`;
    const btn=document.getElementById('logoutBtn'); if(btn) btn.onclick=()=>KoguAuth.logout();
    const homeBtn=document.getElementById('homeBtnTopbar');
    if(homeBtn){ const home=resolveHome(bootstrap); homeBtn.onclick=()=>{ window.location.href=home; }; }
    bindSidebarToggle();
    bindNavCollapse();
    bindEmpresaChip();

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

  window.KoguShell={initShell,loadBootstrap,loadCoreBootstrap,hasPerm,subscribeEmpresaActivaChange,refreshChrome,openEmpresaModal,closeEmpresaModal};
})();
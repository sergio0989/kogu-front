/* KOGU · Herramientas
 * Agrupa las secciones del menú (NAV de shell.js) en herramientas por área de trabajo.
 * Flujo: empresa activa → herramienta → menú solo con las secciones de esa herramienta.
 * Funciones puras (sin DOM) para poder probarlas con node --test.
 */
(function (root) {
  // Orden fijo = orden en que se muestran las tarjetas.
  const HERRAMIENTAS = [
    { id: 'fiscal',    nombre: 'Fiscal',         icono: '🧾', descripcion: 'CFDI, materialidad y proveedores.',
      secciones: ['Negocio CFDI', 'Materialidad', 'Proveedores'] },
    { id: 'costos',    nombre: 'Costos',         icono: '📊', descripcion: 'Costo de ventas, comercio exterior y comisiones.',
      secciones: ['Costo', 'Comercio Exterior', 'Comisiones'] },
    { id: 'comercial', nombre: 'Comercial',      icono: '🎯', descripcion: 'Radar comercial y seguimiento de clientes.',
      secciones: ['Radar Comercial', 'CRM'] },
    { id: 'idp',       nombre: 'I+D',            icono: '🧪', descripcion: 'Proyectos de desarrollo, muestras y lista de precios.',
      secciones: [] },
    { id: 'calidad',   nombre: 'Calidad',        icono: '🔬', descripcion: 'Laboratorio y control documental.',
      secciones: ['Lab QA', 'Documental'] },
    { id: 'activos',   nombre: 'Activos',        icono: '🛠️', descripcion: 'Activos, mantenimiento e inventario.',
      secciones: ['Activos', 'Activos · Catálogos'] },
    { id: 'admin',     nombre: 'Administración', icono: '⚙️', descripcion: 'Empresas, usuarios, catálogos e importaciones ERP.',
      secciones: ['Administrador', 'Catálogos', 'Catálogos Maestros', 'ERP'] },
  ];

  // Vista especial: menú completo. Solo para administrador (screen.root.index).
  const TODAS = 'todas';
  const TODAS_INFO = { id: TODAS, nombre: 'Todas las herramientas', icono: '🧭',
    descripcion: 'Menú completo (administrador).' };

  function puedeVerTodo(perms) {
    return Array.isArray(perms) && perms.includes('screen.root.index');
  }

  function tienePerm(perms, perm) {
    if (!perm) return true;
    const p = Array.isArray(perms) ? perms : [];
    return Array.isArray(perm) ? perm.some((x) => p.includes(x)) : p.includes(perm);
  }

  function seccionVisible(nav, nombre, perms) {
    const s = (nav || []).find((x) => x.section === nombre);
    return !!s && (s.items || []).some((it) => tienePerm(perms, it.perm));
  }

  // Herramientas que el usuario puede usar: al menos una sección con un ítem permitido.
  function disponibles(nav, perms) {
    return HERRAMIENTAS.filter((h) => h.secciones.some((n) => seccionVisible(nav, n, perms)));
  }

  // Si solo hay una herramienta, se entra directo (sin pantalla de selección).
  function entradaDirecta(nav, perms) {
    const d = disponibles(nav, perms);
    return d.length === 1 ? d[0].id : null;
  }

  function secciones(id) {
    const h = HERRAMIENTAS.find((x) => x.id === id);
    return h ? h.secciones.slice() : [];
  }

  // Herramienta dueña de una página (para enlaces directos). null = página transversal.
  function herramientaDePagina(nav, href) {
    const s = (nav || []).find((x) => (x.items || []).some((it) => it.href === href));
    if (!s) return null;
    const h = HERRAMIENTAS.find((x) => x.secciones.includes(s.section));
    return h ? h.id : null;
  }

  // Herramienta activa para una página:
  // 1) si la página pertenece a una herramienta permitida, esa (enlace directo);
  // 2) si no, la guardada mientras siga permitida;
  // 3) si no, la única disponible (entrada directa) o null.
  function resolverActiva(nav, perms, href, guardada) {
    if (guardada === TODAS && puedeVerTodo(perms)) return TODAS;
    const ids = disponibles(nav, perms).map((h) => h.id);
    const dePagina = herramientaDePagina(nav, href);
    if (dePagina && ids.includes(dePagina)) return dePagina;
    if (guardada && ids.includes(guardada)) return guardada;
    return ids.length === 1 ? ids[0] : null;
  }

  // Menú filtrado. Sin herramienta activa, el menú queda igual que hoy.
  function filtrarNav(nav, id) {
    if (!id || id === TODAS) return nav;
    const s = secciones(id);
    return (nav || []).filter((x) => s.includes(x.section));
  }

  // Primera página permitida de una herramienta (destino al elegirla).
  function primeraPagina(nav, perms, id) {
    if (id === TODAS) return null; // el llamador decide (pantalla de siempre)
    for (const sec of filtrarNav(nav, id)) {
      for (const it of sec.items || []) if (tienePerm(perms, it.perm)) return it.href;
    }
    return null;
  }

  const api = { HERRAMIENTAS, disponibles, entradaDirecta, secciones, herramientaDePagina,
                resolverActiva, filtrarNav, primeraPagina, TODAS, TODAS_INFO, puedeVerTodo };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KoguHerramientas = api;
})(typeof window !== 'undefined' ? window : globalThis);

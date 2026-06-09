// ============================================================
// lab-plantilla-producto.js
// Pantalla Lab QA — Plantilla de parámetros por producto.
// Patrón: lista de productos → detalle con UNA tabla de TODOS los
// parámetros del catálogo; un check "Aplica" agrega/quita de la plantilla.
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const PAGE         = '/modules/lab/lab-plantilla-producto.html';
  const PERM_SCREEN  = 'lab.plantilla_producto.manage';
  const BASE         = '/protected/lab/plantilla-producto';
  const BASE_PARAM   = '/protected/lab/maestros/parametros';
  const BASE_PROD    = '/protected/cat/productos';

  // ── Bootstrap del shell ──────────────────────────────────────
  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Plantilla de parámetros',
    description: 'Define qué parámetros analíticos se pre-cargan al crear una muestra por producto.',
    requiredPermission: PERM_SCREEN,
  });
  if (!b) return;

  // ── Estado ───────────────────────────────────────────────────
  let listaProductos = [];   // productos con plantilla configurada
  let todosProductos = [];   // catálogo completo para el modal de alta
  let parametros     = [];   // catálogo de parámetros analíticos (TODOS)
  let productoSel    = null; // { producto_id, producto_clave, producto_nombre }
  let plantilla      = [];   // parámetros aplicados al producto seleccionado
  let detalleFiltro  = '';   // texto de búsqueda en el detalle

  // ── Helpers ───────────────────────────────────────────────────
  const esc = s => s ? String(s).replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])) : '';

  const tipoLabel = t => ({
    numerico:'Numérico', rango:'Rango', texto_controlado:'Texto ctrl.',
    booleano:'Booleano', microbiologico:'Microbiológico', cualitativo:'Cualitativo',
  }[t] || t || '—');

  function showNotif(msg, tipo = 'success') {
    if (typeof window.KoguUI?.toast === 'function') { window.KoguUI.toast(msg, tipo); return; }
    if (typeof KoguApi?.toast === 'function') { KoguApi.toast(msg, tipo); return; }
  }

  // ── Render HTML principal ────────────────────────────────────
  const c = document.getElementById('pageContent');
  c.innerHTML = `
<div class="card">
  <div class="row">
    <div>
      <div class="eyebrow">Lab QA</div>
      <h2 style="margin:0">Plantilla de parámetros</h2>
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn" id="refreshBtn">Actualizar</button>
      <button class="btn primary" id="nuevaBtn">+ Nueva plantilla</button>
    </div>
  </div>

  <!-- Filtro búsqueda -->
  <div style="margin-top:16px">
    <input class="input" id="qInput" placeholder="Buscar por clave o descripción de producto…"/>
  </div>

  <!-- Tabla de productos con plantilla -->
  <div class="table-wrap" style="margin-top:16px">
    <table>
      <thead><tr>
        <th>Clave</th>
        <th>Producto</th>
        <th style="text-align:center;width:140px">Parámetros</th>
        <th style="width:100px"></th>
      </tr></thead>
      <tbody id="listaTbody"></tbody>
    </table>
  </div>
  <div id="listaEmpty" style="display:none;text-align:center;padding:40px;color:var(--muted);font-size:14px">
    No hay plantillas configuradas. Usa "+ Nueva plantilla" para empezar.
  </div>
</div>

<!-- Card de detalle: TODOS los parámetros del catálogo con check "Aplica" -->
<div id="detalleCard" class="card" style="display:none;margin-top:16px">
  <div class="row">
    <div>
      <div class="eyebrow" id="detalleEyebrow">Parámetros</div>
      <h3 style="margin:0" id="detalleTitulo">—</h3>
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn ghost" id="cerrarDetalleBtn">Cerrar</button>
    </div>
  </div>

  <p style="margin:10px 0 0;font-size:13px;color:var(--muted)">
    Marca <strong>Aplica</strong> para incluir el parámetro en la plantilla del producto.
    Solo los marcados se pre-cargan al crear una muestra. Orden, Obligatorio y En COA
    se editan en los parámetros aplicados.
  </p>

  <input class="input" id="detalleSearch" placeholder="Buscar por clave o nombre…" style="margin-top:12px"/>

  <div class="table-wrap" id="detalleTblWrap" style="margin-top:12px;display:none">
    <table>
      <thead><tr>
        <th style="width:70px;text-align:center">Aplica</th>
        <th style="width:70px">Orden</th>
        <th>Clave</th>
        <th>Parámetro</th>
        <th>Tipo</th>
        <th style="text-align:center">Obligatorio</th>
        <th style="text-align:center">En COA</th>
      </tr></thead>
      <tbody id="detalleTbody"></tbody>
    </table>
  </div>
  <div id="detalleEmpty" style="display:none;text-align:center;padding:32px;color:var(--muted);font-size:14px">
    No hay parámetros en el catálogo.
  </div>
</div>

<!-- Modal: Nueva plantilla (seleccionar producto) -->
<div id="modalNueva" style="display:none;position:fixed;inset:0;z-index:500;background:rgba(0,0,0,.45);align-items:center;justify-content:center">
  <div class="card" style="width:520px;max-width:95vw;max-height:80vh;overflow-y:auto">
    <div class="row" style="margin-bottom:16px">
      <h3 style="margin:0">Nueva plantilla — selecciona producto</h3>
      <button class="btn ghost" id="cerrarModalNueva">✕</button>
    </div>
    <input class="input" id="nuevaProdSearch" placeholder="Buscar por clave o descripción…" style="margin-bottom:10px"/>
    <div id="nuevaProdLista" style="max-height:340px;overflow-y:auto;border:1px solid var(--line);border-radius:8px"></div>
    <div id="nuevaSelLabel" style="display:none;margin-top:10px;padding:8px 12px;background:var(--bg);border-radius:6px;font-size:13px"></div>
    <div style="margin-top:16px;display:flex;gap:8px;justify-content:flex-end">
      <button class="btn ghost" id="cancelarModalNueva">Cancelar</button>
      <button class="btn primary" id="confirmarNueva" disabled>Abrir plantilla</button>
    </div>
  </div>
</div>
`;

  // ── Referencias DOM ───────────────────────────────────────────
  const listaTbody      = document.getElementById('listaTbody');
  const listaEmpty      = document.getElementById('listaEmpty');
  const qInput          = document.getElementById('qInput');
  const detalleCard     = document.getElementById('detalleCard');
  const detalleTitulo   = document.getElementById('detalleTitulo');
  const detalleEyebrow  = document.getElementById('detalleEyebrow');
  const detalleTbody    = document.getElementById('detalleTbody');
  const detalleTblWrap  = document.getElementById('detalleTblWrap');
  const detalleEmpty    = document.getElementById('detalleEmpty');
  const detalleSearch   = document.getElementById('detalleSearch');

  const modalNueva      = document.getElementById('modalNueva');
  const nuevaProdSearch = document.getElementById('nuevaProdSearch');
  const nuevaProdLista  = document.getElementById('nuevaProdLista');
  const nuevaSelLabel   = document.getElementById('nuevaSelLabel');
  const confirmarNueva  = document.getElementById('confirmarNueva');

  // ── Carga de catálogos ────────────────────────────────────────
  async function cargarCatalogos() {
    const [rProd, rParam] = await Promise.allSettled([
      KoguApi.apiFetch(`${BASE_PROD}?pageSize=500&status=activo`),
      KoguApi.apiFetch(`${BASE_PARAM}?pageSize=500&status=activo`),
    ]);
    todosProductos = rProd.status === 'fulfilled' ? KoguApi.unwrapRows(rProd.value) : [];
    parametros     = rParam.status === 'fulfilled' ? KoguApi.unwrapRows(rParam.value) : [];
  }

  async function cargarLista() {
    try {
      const r = await KoguApi.apiFetch(BASE);
      listaProductos = r?.data ?? [];
    } catch { listaProductos = []; }
    renderLista(qInput.value.trim());
  }

  // ── Render lista principal ────────────────────────────────────
  function renderLista(q) {
    const q2 = q.toLowerCase();
    const hits = listaProductos.filter(p =>
      !q2 ||
      p.producto_clave?.toLowerCase().includes(q2) ||
      p.producto_nombre?.toLowerCase().includes(q2)
    );

    if (!hits.length) {
      listaTbody.innerHTML = '';
      listaEmpty.style.display = 'block';
      return;
    }
    listaEmpty.style.display = 'none';
    listaTbody.innerHTML = hits.map(p => `
      <tr>
        <td style="font-family:monospace;font-size:12px">${esc(p.producto_clave)}</td>
        <td>${esc(p.producto_nombre)}</td>
        <td style="text-align:center">
          <span style="background:var(--accent-muted,#e0f2fe);color:var(--accent);padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600">
            ${p.num_parametros}
          </span>
        </td>
        <td style="text-align:right">
          <button class="btn ghost" style="font-size:12px"
            onclick="window.__abrirProducto('${esc(p.producto_id)}','${esc(p.producto_clave)}','${esc(p.producto_nombre)}')">
            Configurar
          </button>
        </td>
      </tr>
    `).join('');
  }

  // ── Abrir detalle de un producto ──────────────────────────────
  window.__abrirProducto = async (productoId, clave, nombre) => {
    productoSel = { producto_id: productoId, producto_clave: clave, producto_nombre: nombre };
    detalleFiltro = '';
    detalleSearch.value = '';
    detalleEyebrow.textContent = `Parámetros — ${clave}`;
    detalleTitulo.textContent  = nombre;
    detalleTblWrap.style.display = 'none';
    detalleEmpty.style.display   = 'none';
    detalleCard.style.display    = 'block';
    detalleCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    await cargarDetalle();
  };

  async function cargarDetalle() {
    try {
      const r = await KoguApi.apiFetch(`${BASE}/${productoSel.producto_id}`);
      plantilla = r?.data ?? [];
      renderDetalle();
    } catch (err) {
      showNotif('Error al cargar la plantilla: ' + (err.message || err), 'error');
    }
  }

  // ── Render detalle: TODOS los parámetros con check "Aplica" ────
  function renderDetalle() {
    if (!parametros.length) {
      detalleEmpty.style.display   = 'block';
      detalleTblWrap.style.display = 'none';
      return;
    }

    // Mapa de aplicados por parametro_id (trae plantilla_id, orden, flags).
    const aplicados = new Map(plantilla.map(i => [i.parametro_id, i]));

    const q = detalleFiltro.trim().toLowerCase();
    const lista = parametros.filter(p =>
      !q || (p.clave || '').toLowerCase().includes(q) || (p.nombre || '').toLowerCase().includes(q)
    );

    // Orden visual: aplicados primero (por su orden), luego el resto por clave.
    lista.sort((a, bb) => {
      const ia = aplicados.get(a.parametro_id);
      const ib = aplicados.get(bb.parametro_id);
      if (ia && !ib) return -1;
      if (!ia && ib) return 1;
      if (ia && ib) return (ia.orden - ib.orden) || (a.clave || '').localeCompare(bb.clave || '');
      return (a.clave || '').localeCompare(bb.clave || '');
    });

    if (!lista.length) {
      detalleTbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--muted);font-size:13px">Sin resultados para "${esc(detalleFiltro)}".</td></tr>`;
      detalleTblWrap.style.display = 'block';
      detalleEmpty.style.display   = 'none';
      return;
    }

    detalleEmpty.style.display   = 'none';
    detalleTblWrap.style.display = 'block';

    detalleTbody.innerHTML = lista.map(p => {
      const item     = aplicados.get(p.parametro_id);
      const aplica   = !!item;
      const disabled = aplica ? '' : 'disabled';
      const rowStyle = aplica ? '' : 'opacity:.5';
      return `
        <tr style="${rowStyle}">
          <td style="text-align:center">
            <input type="checkbox" ${aplica ? 'checked' : ''}
              onchange="window.__plantillaAplica('${esc(p.parametro_id)}', this.checked)"/>
          </td>
          <td style="text-align:center">
            <input type="number" value="${item ? item.orden : ''}" min="0" ${disabled}
              style="width:54px;text-align:center;padding:4px 6px;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--text)"
              onchange="window.__plantillaOrden('${esc(p.parametro_id)}', this.value)"/>
          </td>
          <td style="font-family:monospace;font-size:12px">${esc(p.clave)}</td>
          <td>${esc(p.nombre)}</td>
          <td style="font-size:12px;color:var(--muted)">${tipoLabel(p.tipo_parametro)}</td>
          <td style="text-align:center">
            <input type="checkbox" ${item && item.es_obligatorio ? 'checked' : ''} ${disabled}
              onchange="window.__plantillaToggle('${esc(p.parametro_id)}','es_obligatorio',this.checked)"/>
          </td>
          <td style="text-align:center">
            <input type="checkbox" ${item && item.incluir_en_coa ? 'checked' : ''} ${disabled}
              onchange="window.__plantillaToggle('${esc(p.parametro_id)}','incluir_en_coa',this.checked)"/>
          </td>
        </tr>`;
    }).join('');
  }

  // ── Toggle "Aplica": agrega (PUT) o quita (DELETE) de la plantilla ──
  window.__plantillaAplica = async (parametroId, checked) => {
    if (!productoSel) return;
    try {
      if (checked) {
        await KoguApi.apiFetch(`${BASE}/${productoSel.producto_id}/${parametroId}`, {
          method: 'PUT',
          body: JSON.stringify({ orden: plantilla.length, es_obligatorio: true, incluir_en_coa: true }),
        });
      } else {
        const item = plantilla.find(i => i.parametro_id === parametroId);
        if (item) {
          await KoguApi.apiFetch(`${BASE}/${productoSel.producto_id}/${item.plantilla_id}`, { method: 'DELETE' });
        }
      }
      await cargarDetalle();   // recarga estado real + re-render
      await cargarLista();     // actualiza el contador en la lista
    } catch (err) {
      showNotif('Error: ' + (err.message || err), 'error');
      await cargarDetalle();   // revertir UI al estado real del servidor
    }
  };

  // ── Inline edits (solo aplican a parámetros ya en la plantilla) ──
  window.__plantillaOrden = async (parametroId, newOrden) => {
    if (!productoSel) return;
    try {
      await KoguApi.apiFetch(`${BASE}/${productoSel.producto_id}/${parametroId}`,
        { method: 'PUT', body: JSON.stringify({ orden: parseInt(newOrden, 10) || 0 }) });
      const item = plantilla.find(i => i.parametro_id === parametroId);
      if (item) item.orden = parseInt(newOrden, 10) || 0;
    } catch { showNotif('Error al actualizar orden', 'error'); }
  };

  window.__plantillaToggle = async (parametroId, campo, valor) => {
    if (!productoSel) return;
    try {
      await KoguApi.apiFetch(`${BASE}/${productoSel.producto_id}/${parametroId}`,
        { method: 'PUT', body: JSON.stringify({ [campo]: valor }) });
      const item = plantilla.find(i => i.parametro_id === parametroId);
      if (item) item[campo] = valor;
    } catch { showNotif('Error al actualizar', 'error'); }
  };

  // ── Botones principales ───────────────────────────────────────
  document.getElementById('refreshBtn').addEventListener('click', cargarLista);

  document.getElementById('cerrarDetalleBtn').addEventListener('click', () => {
    detalleCard.style.display = 'none';
    productoSel = null;
    plantilla   = [];
  });

  qInput.addEventListener('input', () => renderLista(qInput.value.trim()));

  detalleSearch.addEventListener('input', () => {
    detalleFiltro = detalleSearch.value;
    renderDetalle();
  });

  // ── Modal: Nueva plantilla ────────────────────────────────────
  let nuevaSelProd = null;

  document.getElementById('nuevaBtn').addEventListener('click', () => {
    nuevaSelProd = null;
    nuevaProdSearch.value = '';
    nuevaSelLabel.style.display = 'none';
    confirmarNueva.disabled = true;
    renderNuevaProdLista('');
    modalNueva.style.display = 'flex';
    nuevaProdSearch.focus();
  });

  [document.getElementById('cerrarModalNueva'),
   document.getElementById('cancelarModalNueva')].forEach(btn =>
    btn.addEventListener('click', () => { modalNueva.style.display = 'none'; })
  );

  function renderNuevaProdLista(q) {
    const q2 = q.toLowerCase();
    const yaConfigurados = new Set(listaProductos.map(p => p.producto_id));
    const hits = todosProductos.filter(p =>
      (!q2 || p.cve_prod?.toLowerCase().includes(q2) || p.desc_prod?.toLowerCase().includes(q2))
    ).slice(0, 30);

    if (!hits.length) {
      nuevaProdLista.innerHTML = `<div style="padding:12px;color:var(--muted);font-size:13px">Sin resultados</div>`;
      return;
    }
    nuevaProdLista.innerHTML = hits.map(p => {
      const yaConf = yaConfigurados.has(p.producto_id);
      return `
        <div data-id="${esc(p.producto_id)}" data-cve="${esc(p.cve_prod)}" data-desc="${esc(p.desc_prod)}"
             style="padding:10px 14px;cursor:pointer;font-size:13px;border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between"
             onmouseover="this.style.background='var(--bg)'" onmouseout="this.style.background=''">
          <span>
            <strong style="font-family:monospace">${esc(p.cve_prod)}</strong>
            <span style="margin-left:8px">${esc(p.desc_prod)}</span>
          </span>
          ${yaConf ? '<span style="font-size:11px;color:var(--accent)">Ya configurado</span>' : ''}
        </div>`;
    }).join('');
  }

  nuevaProdSearch.addEventListener('input', () => renderNuevaProdLista(nuevaProdSearch.value.trim()));

  nuevaProdLista.addEventListener('click', (e) => {
    const row = e.target.closest('[data-id]');
    if (!row) return;
    nuevaProdLista.querySelectorAll('[data-id]').forEach(r => r.style.background = '');
    row.style.background = 'var(--accent-muted,#e0f2fe)';
    nuevaSelProd = { producto_id: row.dataset.id, producto_clave: row.dataset.cve, producto_nombre: row.dataset.desc };
    nuevaSelLabel.textContent = `Seleccionado: ${nuevaSelProd.producto_clave} — ${nuevaSelProd.producto_nombre}`;
    nuevaSelLabel.style.display = 'block';
    confirmarNueva.disabled = false;
  });

  confirmarNueva.addEventListener('click', async () => {
    if (!nuevaSelProd) return;
    modalNueva.style.display = 'none';
    // Abre el detalle: la tabla muestra todo el catálogo para marcar lo que aplica.
    await window.__abrirProducto(nuevaSelProd.producto_id, nuevaSelProd.producto_clave, nuevaSelProd.producto_nombre);
  });

  // Cerrar modal con Escape
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    modalNueva.style.display = 'none';
  });

  // ── Carga inicial ─────────────────────────────────────────────
  await Promise.all([cargarCatalogos(), cargarLista()]);
});

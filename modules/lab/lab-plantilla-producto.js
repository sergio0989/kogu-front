// ============================================================
// lab-plantilla-producto.js
// Pantalla Lab QA — Plantilla de parámetros por producto.
// Patrón: lista de productos configurados → detalle de parámetros.
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
  let parametros     = [];   // catálogo de parámetros analíticos
  let productoSel    = null; // { producto_id, producto_clave, producto_nombre }
  let plantilla      = [];   // parámetros del producto seleccionado

  // ── Helpers ───────────────────────────────────────────────────
  const esc = s => s ? String(s).replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])) : '';

  const tipoLabel = t => ({
    numerico:'Numérico', rango:'Rango', texto_controlado:'Texto ctrl.',
    booleano:'Booleano', microbiologico:'Microbiológico', cualitativo:'Cualitativo',
  }[t] || t || '—');

  function showNotif(msg, tipo = 'success') {
    if (typeof KoguUI?.toast === 'function') { KoguUI.toast(msg, tipo); return; }
    alert(msg);
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

<!-- Card de detalle: parámetros del producto seleccionado -->
<div id="detalleCard" class="card" style="display:none;margin-top:16px">
  <div class="row">
    <div>
      <div class="eyebrow" id="detalleEyebrow">Parámetros configurados</div>
      <h3 style="margin:0" id="detalleTitulo">—</h3>
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn ghost" id="cerrarDetalleBtn">Cerrar</button>
      <button class="btn primary" id="agregarParamBtn">+ Agregar parámetro</button>
    </div>
  </div>

  <div id="detalleEmpty" style="display:none;text-align:center;padding:32px;color:var(--muted);font-size:14px">
    Sin parámetros configurados. Usa "+ Agregar parámetro".
  </div>

  <div class="table-wrap" id="detalleTblWrap" style="margin-top:16px;display:none">
    <table>
      <thead><tr>
        <th style="width:64px">Orden</th>
        <th>Clave</th>
        <th>Parámetro</th>
        <th>Tipo</th>
        <th style="text-align:center">Obligatorio</th>
        <th style="text-align:center">En COA</th>
        <th style="width:80px"></th>
      </tr></thead>
      <tbody id="detalleTbody"></tbody>
    </table>
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

<!-- Modal: Agregar parámetro -->
<div id="modalParam" style="display:none;position:fixed;inset:0;z-index:500;background:rgba(0,0,0,.45);align-items:center;justify-content:center">
  <div class="card" style="width:500px;max-width:95vw;max-height:80vh;overflow-y:auto">
    <div class="row" style="margin-bottom:16px">
      <h3 style="margin:0">Agregar parámetro</h3>
      <button class="btn ghost" id="cerrarModalParam">✕</button>
    </div>
    <input class="input" id="paramSearch" placeholder="Buscar por clave o nombre…" style="margin-bottom:10px"/>
    <div id="paramLista" style="max-height:300px;overflow-y:auto;border:1px solid var(--line);border-radius:8px"></div>
    <div id="paramSelLabel" style="display:none;margin-top:10px;padding:8px 12px;background:var(--bg);border-radius:6px;font-size:13px"></div>
    <div style="margin-top:14px;display:flex;gap:10px;align-items:flex-end">
      <div>
        <label class="label">Orden</label>
        <input class="input" id="modalOrden" type="number" value="0" min="0" style="width:80px"/>
      </div>
      <div style="display:flex;align-items:center;gap:6px;padding-bottom:2px">
        <input type="checkbox" id="modalOblig" checked/>
        <label for="modalOblig" style="font-size:13px">Obligatorio</label>
      </div>
      <div style="display:flex;align-items:center;gap:6px;padding-bottom:2px">
        <input type="checkbox" id="modalCoa" checked/>
        <label for="modalCoa" style="font-size:13px">En COA</label>
      </div>
    </div>
    <div id="paramError" style="display:none;margin-top:10px;padding:8px 12px;background:#fee2e2;border-radius:6px;color:#991b1b;font-size:13px"></div>
    <div style="margin-top:16px;display:flex;gap:8px;justify-content:flex-end">
      <button class="btn ghost" id="cancelarModalParam">Cancelar</button>
      <button class="btn primary" id="guardarParam" disabled>Guardar</button>
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

  const modalNueva      = document.getElementById('modalNueva');
  const nuevaProdSearch = document.getElementById('nuevaProdSearch');
  const nuevaProdLista  = document.getElementById('nuevaProdLista');
  const nuevaSelLabel   = document.getElementById('nuevaSelLabel');
  const confirmarNueva  = document.getElementById('confirmarNueva');

  const modalParam      = document.getElementById('modalParam');
  const paramSearch     = document.getElementById('paramSearch');
  const paramLista      = document.getElementById('paramLista');
  const paramSelLabel   = document.getElementById('paramSelLabel');
  const paramError      = document.getElementById('paramError');
  const guardarParam    = document.getElementById('guardarParam');

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

  function renderDetalle() {
    if (!plantilla.length) {
      detalleEmpty.style.display   = 'block';
      detalleTblWrap.style.display = 'none';
      return;
    }
    detalleEmpty.style.display   = 'none';
    detalleTblWrap.style.display = 'block';

    detalleTbody.innerHTML = plantilla.map(item => `
      <tr>
        <td style="text-align:center">
          <input type="number" value="${item.orden}" min="0"
            style="width:52px;text-align:center;padding:4px 6px;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--text)"
            onchange="window.__plantillaOrden('${esc(item.plantilla_id)}','${esc(item.parametro_id)}',this.value)"/>
        </td>
        <td style="font-family:monospace;font-size:12px">${esc(item.parametro_clave)}</td>
        <td>${esc(item.parametro_nombre)}</td>
        <td style="font-size:12px;color:var(--muted)">${tipoLabel(item.tipo_parametro)}</td>
        <td style="text-align:center">
          <input type="checkbox" ${item.es_obligatorio ? 'checked' : ''}
            onchange="window.__plantillaToggle('${esc(item.plantilla_id)}','${esc(item.parametro_id)}','es_obligatorio',this.checked)"/>
        </td>
        <td style="text-align:center">
          <input type="checkbox" ${item.incluir_en_coa ? 'checked' : ''}
            onchange="window.__plantillaToggle('${esc(item.plantilla_id)}','${esc(item.parametro_id)}','incluir_en_coa',this.checked)"/>
        </td>
        <td style="text-align:right">
          <button class="btn ghost" style="font-size:12px;color:#dc2626"
            onclick="window.__plantillaEliminar('${esc(item.plantilla_id)}')">Quitar</button>
        </td>
      </tr>
    `).join('');
  }

  // ── Inline edits ──────────────────────────────────────────────
  window.__plantillaOrden = async (plantillaId, parametroId, newOrden) => {
    try {
      await KoguApi.apiFetch(`${BASE}/${productoSel.producto_id}/${parametroId}`,
        { method: 'PUT', body: JSON.stringify({ orden: parseInt(newOrden, 10) || 0 }) });
      const item = plantilla.find(i => i.plantilla_id === plantillaId);
      if (item) item.orden = parseInt(newOrden, 10) || 0;
      plantilla.sort((a, b) => a.orden - b.orden || a.parametro_clave.localeCompare(b.parametro_clave));
    } catch { showNotif('Error al actualizar orden', 'error'); }
  };

  window.__plantillaToggle = async (plantillaId, parametroId, campo, valor) => {
    try {
      await KoguApi.apiFetch(`${BASE}/${productoSel.producto_id}/${parametroId}`,
        { method: 'PUT', body: JSON.stringify({ [campo]: valor }) });
      const item = plantilla.find(i => i.plantilla_id === plantillaId);
      if (item) item[campo] = valor;
    } catch { showNotif('Error al actualizar', 'error'); }
  };

  window.__plantillaEliminar = async (plantillaId) => {
    if (!confirm('¿Quitar este parámetro de la plantilla?')) return;
    try {
      await KoguApi.apiFetch(`${BASE}/${productoSel.producto_id}/${plantillaId}`,
        { method: 'DELETE' });
      plantilla = plantilla.filter(i => i.plantilla_id !== plantillaId);
      renderDetalle();
      await cargarLista(); // actualiza el contador en la lista
      showNotif('Parámetro removido');
    } catch (err) { showNotif('Error: ' + (err.message || err), 'error'); }
  };

  // ── Botones principales ───────────────────────────────────────
  document.getElementById('refreshBtn').addEventListener('click', cargarLista);

  document.getElementById('cerrarDetalleBtn').addEventListener('click', () => {
    detalleCard.style.display = 'none';
    productoSel = null;
    plantilla   = [];
  });

  qInput.addEventListener('input', () => renderLista(qInput.value.trim()));

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
    // Excluir productos que ya tienen plantilla
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
    await cargarLista();
    await window.__abrirProducto(nuevaSelProd.producto_id, nuevaSelProd.producto_clave, nuevaSelProd.producto_nombre);
    // Al crear plantilla nueva, abrir directo el modal de parámetros sin clic extra
    document.getElementById('agregarParamBtn').click();
  });

  // ── Modal: Agregar parámetro ──────────────────────────────────
  let paramSelModal = null;

  document.getElementById('agregarParamBtn').addEventListener('click', () => {
    paramSelModal = null;
    paramSearch.value = '';
    document.getElementById('modalOrden').value = plantilla.length;
    document.getElementById('modalOblig').checked = true;
    document.getElementById('modalCoa').checked   = true;
    paramSelLabel.style.display = 'none';
    guardarParam.disabled = true;
    paramError.style.display = 'none';
    renderParamLista('');
    modalParam.style.display = 'flex';
    paramSearch.focus();
  });

  [document.getElementById('cerrarModalParam'),
   document.getElementById('cancelarModalParam')].forEach(btn =>
    btn.addEventListener('click', () => { modalParam.style.display = 'none'; })
  );

  function renderParamLista(q) {
    const q2 = q.toLowerCase();
    const yaEnPlantilla = new Set(plantilla.map(i => i.parametro_id));
    const hits = parametros.filter(p =>
      !yaEnPlantilla.has(p.parametro_id) &&
      (!q2 || p.clave?.toLowerCase().includes(q2) || p.nombre?.toLowerCase().includes(q2))
    ).slice(0, 30);

    if (!hits.length) {
      paramLista.innerHTML = `<div style="padding:12px;color:var(--muted);font-size:13px">
        ${q2 ? 'Sin resultados' : 'Todos los parámetros ya están en la plantilla'}
      </div>`;
      return;
    }
    paramLista.innerHTML = hits.map(p => `
      <div data-pid="${esc(p.parametro_id)}" data-clave="${esc(p.clave)}" data-nombre="${esc(p.nombre)}" data-tipo="${esc(p.tipo_parametro)}"
           style="padding:10px 14px;cursor:pointer;font-size:13px;border-bottom:1px solid var(--line)"
           onmouseover="this.style.background='var(--bg)'" onmouseout="this.style.background=''">
        <strong style="font-family:monospace">${esc(p.clave)}</strong>
        <span style="margin-left:8px">${esc(p.nombre)}</span>
        <span style="margin-left:6px;font-size:11px;color:var(--muted)">${tipoLabel(p.tipo_parametro)}</span>
      </div>`
    ).join('');
  }

  paramSearch.addEventListener('input', () => renderParamLista(paramSearch.value.trim()));

  paramLista.addEventListener('click', (e) => {
    const row = e.target.closest('[data-pid]');
    if (!row) return;
    paramLista.querySelectorAll('[data-pid]').forEach(r => r.style.background = '');
    row.style.background = 'var(--accent-muted,#e0f2fe)';
    paramSelModal = { parametro_id: row.dataset.pid, clave: row.dataset.clave, nombre: row.dataset.nombre };
    paramSelLabel.textContent = `Seleccionado: ${paramSelModal.clave} — ${paramSelModal.nombre}`;
    paramSelLabel.style.display = 'block';
    guardarParam.disabled = false;
    paramError.style.display = 'none';
  });

  guardarParam.addEventListener('click', async () => {
    if (!paramSelModal || !productoSel) return;
    guardarParam.disabled = true;
    paramError.style.display = 'none';
    try {
      const body = {
        orden:          parseInt(document.getElementById('modalOrden').value, 10) || 0,
        es_obligatorio: document.getElementById('modalOblig').checked,
        incluir_en_coa: document.getElementById('modalCoa').checked,
      };
      await KoguApi.apiFetch(`${BASE}/${productoSel.producto_id}/${paramSelModal.parametro_id}`,
        { method: 'PUT', body: JSON.stringify(body) });
      modalParam.style.display = 'none';
      await cargarDetalle();
      await cargarLista(); // actualiza el contador
      showNotif('Parámetro agregado');
    } catch (err) {
      const msg = err.body?.message || err.message || 'Error al guardar';
      paramError.textContent = msg;
      paramError.style.display = 'block';
      guardarParam.disabled = false;
    }
  });

  // Cerrar modales con Escape
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    modalNueva.style.display  = 'none';
    modalParam.style.display  = 'none';
  });

  // ── Carga inicial ─────────────────────────────────────────────
  await Promise.all([cargarCatalogos(), cargarLista()]);
});

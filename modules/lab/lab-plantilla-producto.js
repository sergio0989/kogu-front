// ============================================================
// lab-plantilla-producto.js
// Pantalla Lab QA — Plantilla de parámetros requeridos por producto.
// Permite definir qué parámetros analíticos debe incluir cada
// muestra creada a partir de un lote de cierto producto.
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const PAGE       = '/modules/lab/lab-plantilla-producto.html';
  const PERM_SCREEN = 'lab.plantilla_producto.manage';
  const BASE_PLANTILLA = '/protected/lab/plantilla-producto';
  const BASE_PARAM     = '/protected/lab/maestros/parametros';
  const BASE_PROD      = '/protected/cat/productos';

  // ── Bootstrap del shell ──────────────────────────────────────
  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Plantilla de parámetros',
    description: 'Define qué parámetros analíticos se pre-cargan al crear una muestra por producto.',
    requiredPermission: PERM_SCREEN,
  });
  if (!b) return;

  // ── Estado ───────────────────────────────────────────────────
  let productos    = [];
  let parametros   = [];
  let productoSel  = null;   // { producto_id, cve_prod, desc_prod }
  let plantilla    = [];     // rows de lab_plantilla_producto

  // ── Contenido inicial ─────────────────────────────────────────
  const c = document.getElementById('pageContent');
  c.innerHTML = `
<!-- Card principal — mismo patrón que lab-lotes -->
<div class="card">

  <!-- Cabecera -->
  <div class="row">
    <div>
      <div class="eyebrow">Lab QA</div>
      <h2 style="margin:0">Plantilla de parámetros</h2>
    </div>
    <button class="btn primary" id="agregarBtn" style="display:none">+ Agregar parámetro</button>
  </div>

  <!-- Filtro: selector de producto -->
  <div style="margin-top:16px;display:flex;gap:10px;align-items:center;position:relative">
    <div style="flex:1;position:relative">
      <input class="input" id="prodSearch" placeholder="Buscar producto por clave o descripción…" autocomplete="off"/>
      <div id="prodDropdown" style="display:none;position:absolute;top:100%;left:0;z-index:200;background:var(--surface);border:1px solid var(--line);border-radius:8px;max-height:240px;overflow-y:auto;width:100%;box-shadow:0 4px 16px rgba(0,0,0,.12)"></div>
    </div>
  </div>

  <!-- Chip de producto seleccionado -->
  <div id="prodSelected" style="display:none;margin-top:12px;padding:8px 14px;background:var(--bg);border-radius:8px;border:1px solid var(--line);display:flex;align-items:center;justify-content:space-between">
    <span id="prodSelectedLabel" style="font-size:13px;font-weight:600"></span>
    <button class="btn ghost" id="clearProd" style="font-size:12px">Cambiar</button>
  </div>

  <!-- Estado vacío inicial -->
  <div id="plantillaInicio" style="text-align:center;padding:48px 0;color:var(--muted);font-size:14px">
    Selecciona un producto para ver o configurar su plantilla de parámetros.
  </div>

  <!-- Estado vacío: producto sin parámetros -->
  <div id="plantillaEmpty" style="display:none;text-align:center;padding:40px;color:var(--muted);font-size:14px">
    Este producto no tiene parámetros configurados.<br>
    <span style="font-size:12px">Usa "+ Agregar parámetro" para empezar.</span>
  </div>

  <!-- Tabla de parámetros -->
  <div class="table-wrap" id="plantillaTblWrap" style="margin-top:16px;display:none">
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
      <tbody id="plantillaTbody"></tbody>
    </table>
  </div>

</div>

<!-- Modal agregar parámetro -->
<div id="modalAgregar" style="display:none;position:fixed;inset:0;z-index:500;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center">
  <div class="card" style="width:480px;max-width:95vw;max-height:80vh;overflow-y:auto">
    <div class="row" style="margin-bottom:16px">
      <h3 style="margin:0">Agregar parámetro</h3>
      <button class="btn ghost" id="cerrarModal">✕</button>
    </div>
    <label class="label">Buscar parámetro</label>
    <input class="input" id="paramSearch" placeholder="Clave o nombre del parámetro…" style="margin-bottom:10px"/>
    <div id="paramLista" style="max-height:320px;overflow-y:auto;border:1px solid var(--line);border-radius:8px"></div>
    <div style="margin-top:14px;display:flex;gap:10px">
      <div style="flex:1">
        <label class="label">Orden</label>
        <input class="input" id="modalOrden" type="number" value="0" min="0" style="width:80px"/>
      </div>
      <div style="display:flex;align-items:center;gap:6px;padding-top:22px">
        <input type="checkbox" id="modalOblig" checked/>
        <label for="modalOblig" style="font-size:13px">Obligatorio</label>
      </div>
      <div style="display:flex;align-items:center;gap:6px;padding-top:22px">
        <input type="checkbox" id="modalCoa" checked/>
        <label for="modalCoa" style="font-size:13px">Incluir en COA</label>
      </div>
    </div>
    <div id="modalSelectedParam" style="display:none;margin-top:10px;padding:8px 12px;background:var(--bg);border-radius:6px;font-size:13px"></div>
    <div style="margin-top:16px;display:flex;gap:8px;justify-content:flex-end">
      <button class="btn ghost" id="cancelarModal">Cancelar</button>
      <button class="btn primary" id="guardarParam" disabled>Guardar</button>
    </div>
    <div id="modalError" style="display:none;margin-top:10px;padding:8px 12px;background:#fee2e2;border-radius:6px;color:#991b1b;font-size:13px"></div>
  </div>
</div>
`;

  // Ocultar modal inicialmente (re-set display via JS)
  document.getElementById('modalAgregar').style.display = 'none';

  // ── Helpers ───────────────────────────────────────────────────
  const escHtml = s => s ? String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])) : '';

  const tipoLabel = t => ({
    numerico:'Numérico', rango:'Rango', texto_controlado:'Texto ctrl.',
    booleano:'Booleano', microbiologico:'Microbiológico', cualitativo:'Cualitativo',
  }[t] || t || '—');

  function showNotif(msg, tipo = 'success') {
    if (typeof KoguUI?.toast === 'function') { KoguUI.toast(msg, tipo); return; }
    alert(msg);
  }

  // ── Helpers API ──────────────────────────────────────────────
  async function apiGet(path) {
    const r = await KoguApi.apiFetch(path);
    return r?.data ?? r ?? [];
  }
  async function apiPut(path, body) {
    return KoguApi.apiFetch(path, { method: 'PUT', body: JSON.stringify(body) });
  }
  async function apiDelete(path) {
    return KoguApi.apiFetch(path, { method: 'DELETE' });
  }

  // ── Cargar catálogos ─────────────────────────────────────────
  async function cargarProductos() {
    try {
      const r = await KoguApi.apiFetch(`${BASE_PROD}?pageSize=500&status=activo`);
      productos = r?.data ?? [];
    } catch { productos = []; }
  }

  async function cargarParametros() {
    try {
      const r = await KoguApi.apiFetch(`${BASE_PARAM}?pageSize=500&status=activo`);
      parametros = r?.data ?? [];
    } catch { parametros = []; }
  }

  await Promise.all([cargarProductos(), cargarParametros()]);

  // ── Búsqueda de producto ─────────────────────────────────────
  const prodSearch   = document.getElementById('prodSearch');
  const prodDropdown = document.getElementById('prodDropdown');
  const prodSelected = document.getElementById('prodSelected');
  const prodSelLabel = document.getElementById('prodSelectedLabel');
  const clearProd    = document.getElementById('clearProd');

  function renderProdDropdown(q) {
    const q2 = q.toLowerCase();
    const hits = productos.filter(p =>
      p.cve_prod?.toLowerCase().includes(q2) ||
      p.desc_prod?.toLowerCase().includes(q2)
    ).slice(0, 20);

    if (!hits.length) {
      prodDropdown.innerHTML = `<div style="padding:12px;color:var(--muted);font-size:13px">Sin resultados</div>`;
    } else {
      prodDropdown.innerHTML = hits.map(p => `
        <div data-id="${escHtml(p.producto_id)}"
             data-cve="${escHtml(p.cve_prod)}"
             data-desc="${escHtml(p.desc_prod)}"
             style="padding:10px 14px;cursor:pointer;font-size:13px;border-bottom:1px solid var(--line)"
             onmouseover="this.style.background='var(--bg)'" onmouseout="this.style.background=''">
          <strong>${escHtml(p.cve_prod)}</strong>
          <span style="color:var(--muted);margin-left:6px">${escHtml(p.desc_prod)}</span>
        </div>`
      ).join('');
    }
    prodDropdown.style.display = 'block';
  }

  prodSearch.addEventListener('input', () => {
    const q = prodSearch.value.trim();
    if (q.length < 1) { prodDropdown.style.display = 'none'; return; }
    renderProdDropdown(q);
  });

  prodDropdown.addEventListener('click', async (e) => {
    const row = e.target.closest('[data-id]');
    if (!row) return;
    productoSel = {
      producto_id: row.dataset.id,
      cve_prod:    row.dataset.cve,
      desc_prod:   row.dataset.desc,
    };
    prodDropdown.style.display = 'none';
    prodSearch.value = '';
    prodSelected.style.display = 'flex';
    prodSelLabel.textContent = `${productoSel.cve_prod} — ${productoSel.desc_prod}`;
    await cargarPlantilla();
  });

  clearProd.addEventListener('click', () => {
    productoSel = null;
    plantilla   = [];
    prodSelected.style.display = 'none';
    document.getElementById('agregarBtn').style.display     = 'none';
    document.getElementById('plantillaTblWrap').style.display = 'none';
    document.getElementById('plantillaEmpty').style.display   = 'none';
    document.getElementById('plantillaInicio').style.display  = '';
  });

  document.addEventListener('click', (e) => {
    if (!prodDropdown.contains(e.target) && e.target !== prodSearch) {
      prodDropdown.style.display = 'none';
    }
  });

  // ── Cargar plantilla del producto seleccionado ───────────────
  async function cargarPlantilla() {
    if (!productoSel) return;
    // Mostrar botón agregar y ocultar estados vacíos mientras carga
    document.getElementById('agregarBtn').style.display = '';
    document.getElementById('plantillaInicio').style.display = 'none';
    document.getElementById('plantillaTblWrap').style.display = 'none';
    document.getElementById('plantillaEmpty').style.display = 'none';

    try {
      const r = await KoguApi.apiFetch(`${BASE_PLANTILLA}/${productoSel.producto_id}`);
      plantilla = r?.data ?? [];
      renderPlantilla();
    } catch (err) {
      showNotif('Error al cargar la plantilla: ' + (err.message || err), 'error');
    }
  }

  function renderPlantilla() {
    const tbody = document.getElementById('plantillaTbody');
    const empty = document.getElementById('plantillaEmpty');
    const tblWrap = document.getElementById('plantillaTblWrap');

    if (!plantilla.length) {
      empty.style.display = 'block';
      tblWrap.style.display = 'none';
      return;
    }
    empty.style.display = 'none';
    tblWrap.style.display = 'block';

    tbody.innerHTML = plantilla.map(item => `
      <tr data-id="${escHtml(item.plantilla_id)}">
        <td style="text-align:center">
          <input type="number" value="${item.orden}" min="0" style="width:52px;text-align:center;padding:4px 6px;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--text)"
            onchange="window.__plantillaOrden('${escHtml(item.plantilla_id)}','${escHtml(item.parametro_id)}', this.value)"/>
        </td>
        <td style="font-family:monospace;font-size:12px">${escHtml(item.parametro_clave)}</td>
        <td>${escHtml(item.parametro_nombre)}</td>
        <td style="font-size:12px;color:var(--muted)">${tipoLabel(item.tipo_parametro)}</td>
        <td style="text-align:center">
          <input type="checkbox" ${item.es_obligatorio ? 'checked' : ''}
            onchange="window.__plantillaToggle('${escHtml(item.plantilla_id)}','${escHtml(item.parametro_id)}','es_obligatorio', this.checked)"/>
        </td>
        <td style="text-align:center">
          <input type="checkbox" ${item.incluir_en_coa ? 'checked' : ''}
            onchange="window.__plantillaToggle('${escHtml(item.plantilla_id)}','${escHtml(item.parametro_id)}','incluir_en_coa', this.checked)"/>
        </td>
        <td style="text-align:right">
          <button class="btn ghost" style="font-size:12px;color:#dc2626"
            onclick="window.__plantillaEliminar('${escHtml(item.plantilla_id)}')">Quitar</button>
        </td>
      </tr>
    `).join('');
  }

  // ── Acciones inline (cambio de orden / checkbox) ─────────────
  window.__plantillaOrden = async (plantillaId, parametroId, newOrden) => {
    try {
      await apiPut(
        `${BASE_PLANTILLA}/${productoSel.producto_id}/${parametroId}`,
        { orden: parseInt(newOrden, 10) || 0 }
      );
      // Actualizar localmente
      const item = plantilla.find(i => i.plantilla_id === plantillaId);
      if (item) item.orden = parseInt(newOrden, 10) || 0;
      // Reordenar
      plantilla.sort((a, b) => a.orden - b.orden || a.parametro_clave.localeCompare(b.parametro_clave));
    } catch (err) {
      showNotif('Error al actualizar orden', 'error');
    }
  };

  window.__plantillaToggle = async (plantillaId, parametroId, campo, valor) => {
    try {
      await apiPut(
        `${BASE_PLANTILLA}/${productoSel.producto_id}/${parametroId}`,
        { [campo]: valor }
      );
      const item = plantilla.find(i => i.plantilla_id === plantillaId);
      if (item) item[campo] = valor;
    } catch (err) {
      showNotif('Error al actualizar parámetro', 'error');
    }
  };

  window.__plantillaEliminar = async (plantillaId) => {
    if (!confirm('¿Quitar este parámetro de la plantilla?')) return;
    try {
      await apiDelete(`${BASE_PLANTILLA}/${productoSel.producto_id}/${plantillaId}`);
      plantilla = plantilla.filter(i => i.plantilla_id !== plantillaId);
      renderPlantilla();
      showNotif('Parámetro removido de la plantilla');
    } catch (err) {
      showNotif('Error al eliminar: ' + (err.message || err), 'error');
    }
  };

  // ── Modal — Agregar parámetro ─────────────────────────────────
  const modalAgregar  = document.getElementById('modalAgregar');
  const cerrarModal   = document.getElementById('cerrarModal');
  const cancelarModal = document.getElementById('cancelarModal');
  const paramSearch   = document.getElementById('paramSearch');
  const paramLista    = document.getElementById('paramLista');
  const guardarParam  = document.getElementById('guardarParam');
  const modalError    = document.getElementById('modalError');
  const modalSelLabel = document.getElementById('modalSelectedParam');

  let paramSelModal = null;  // { parametro_id, clave, nombre }

  document.getElementById('agregarBtn').addEventListener('click', () => {
    paramSelModal = null;
    paramSearch.value = '';
    document.getElementById('modalOrden').value = plantilla.length;
    document.getElementById('modalOblig').checked = true;
    document.getElementById('modalCoa').checked   = true;
    modalSelLabel.style.display = 'none';
    guardarParam.disabled = true;
    modalError.style.display = 'none';
    renderParamLista('');
    modalAgregar.style.display = 'flex';
    paramSearch.focus();
  });

  [cerrarModal, cancelarModal].forEach(btn =>
    btn.addEventListener('click', () => { modalAgregar.style.display = 'none'; })
  );

  function renderParamLista(q) {
    const q2 = q.toLowerCase();
    // Excluir los que ya están en la plantilla
    const yaEnPlantilla = new Set(plantilla.map(i => i.parametro_id));

    const hits = parametros.filter(p =>
      !yaEnPlantilla.has(p.parametro_id) &&
      (q2 === '' ||
       p.clave?.toLowerCase().includes(q2) ||
       p.nombre?.toLowerCase().includes(q2))
    ).slice(0, 30);

    if (!hits.length) {
      paramLista.innerHTML = `<div style="padding:12px;color:var(--muted);font-size:13px">
        ${q2 ? 'Sin resultados' : 'Todos los parámetros ya están en la plantilla'}
      </div>`;
      return;
    }

    paramLista.innerHTML = hits.map(p => `
      <div data-pid="${escHtml(p.parametro_id)}"
           data-clave="${escHtml(p.clave)}"
           data-nombre="${escHtml(p.nombre)}"
           data-tipo="${escHtml(p.tipo_parametro)}"
           style="padding:10px 14px;cursor:pointer;font-size:13px;border-bottom:1px solid var(--line)"
           onmouseover="this.style.background='var(--bg)'" onmouseout="this.style.background=''">
        <strong style="font-family:monospace">${escHtml(p.clave)}</strong>
        <span style="margin-left:8px">${escHtml(p.nombre)}</span>
        <span style="margin-left:6px;font-size:11px;color:var(--muted)">${tipoLabel(p.tipo_parametro)}</span>
      </div>`
    ).join('');
  }

  paramSearch.addEventListener('input', () => renderParamLista(paramSearch.value.trim()));

  paramLista.addEventListener('click', (e) => {
    const row = e.target.closest('[data-pid]');
    if (!row) return;

    // Deselect previous
    paramLista.querySelectorAll('[data-pid]').forEach(r => r.style.background = '');
    row.style.background = 'var(--accent-muted, #e0f2fe)';

    paramSelModal = {
      parametro_id: row.dataset.pid,
      clave:        row.dataset.clave,
      nombre:       row.dataset.nombre,
    };
    modalSelLabel.textContent = `Seleccionado: ${paramSelModal.clave} — ${paramSelModal.nombre}`;
    modalSelLabel.style.display = 'block';
    guardarParam.disabled = false;
    modalError.style.display = 'none';
  });

  guardarParam.addEventListener('click', async () => {
    if (!paramSelModal || !productoSel) return;
    guardarParam.disabled = true;
    modalError.style.display = 'none';

    try {
      const body = {
        orden:          parseInt(document.getElementById('modalOrden').value, 10) || 0,
        es_obligatorio: document.getElementById('modalOblig').checked,
        incluir_en_coa: document.getElementById('modalCoa').checked,
      };
      await apiPut(
        `${BASE_PLANTILLA}/${productoSel.producto_id}/${paramSelModal.parametro_id}`,
        body
      );
      modalAgregar.style.display = 'none';
      await cargarPlantilla();
      showNotif('Parámetro agregado a la plantilla');
    } catch (err) {
      const msg = err.body?.message || err.message || 'Error al guardar';
      modalError.textContent = msg;
      modalError.style.display = 'block';
      guardarParam.disabled = false;
    }
  });

  // Cerrar modal con Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalAgregar.style.display !== 'none') {
      modalAgregar.style.display = 'none';
    }
  });
});

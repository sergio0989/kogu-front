document.addEventListener('DOMContentLoaded', async () => {
  const PAGE     = '/modules/cat/productos/productos.html';
  const BASE     = '/protected/cat/productos';
  const BASE_FAM = '/protected/cat/familias';
  const BASE_UND = '/protected/cat/unidades';
  const PERM     = 'screen.catalogos.productos';

  const b = await KoguShell.initShell({ currentPage: PAGE, title: 'Catálogo de Productos', description: 'Productos, servicios y kits de la empresa.', requiredPermission: PERM });
  if (!b) return;

  const c = document.getElementById('pageContent');
  c.innerHTML = `
<div class="split">

  <!-- ── Lista ── -->
  <div class="card">
    <div class="row">
      <div><div class="eyebrow">Catálogo</div><h2>Productos</h2></div>
      <button class="btn primary" id="refreshBtn">Actualizar</button>
    </div>
    <div class="grid-2" style="margin-top:16px;gap:10px">
      <input  class="input"  id="q"        placeholder="Buscar por clave o descripción" />
      <select class="select" id="tipoFil">
        <option value="">Todos los tipos</option>
        <option value="producto">Producto</option>
        <option value="servicio">Servicio</option>
        <option value="kit">Kit</option>
      </select>
      <select class="select" id="usoFil">
        <option value="">Todos los usos</option>
        <option value="producto_terminado">Producto terminado</option>
        <option value="materia_prima">Materia prima</option>
        <option value="producto_en_proceso">En proceso</option>
        <option value="consumible">Consumible</option>
        <option value="activo_fijo">Activo fijo</option>
        <option value="mercancia_reventa">Mercancía reventa</option>
        <option value="servicio_externo">Servicio externo</option>
      </select>
      <select class="select" id="famFil"><option value="">Todas las familias</option></select>
    </div>
    <div class="grid-2" style="margin-top:8px;gap:10px">
      <select class="select" id="activoFil"><option value="">Todos</option><option value="true">Activos</option><option value="false">Inactivos</option></select>
    </div>
    <div class="table-wrap" style="margin-top:16px">
      <table><thead><tr>
        <th>Clave</th><th>Descripción</th><th>Tipo</th><th>Uso</th><th>Familia</th><th>Precio</th><th>Estado</th><th></th>
      </tr></thead><tbody id="rowsProductos"></tbody></table>
    </div>
    <div id="pgBarProductos" style="display:flex;align-items:center;justify-content:space-between;margin-top:10px;font-size:13px;color:var(--muted)"></div>
  </div>

  <!-- ── Formulario ── -->
  <div class="card" style="overflow-y:auto;max-height:90vh">
    <div class="row">
      <div><div class="eyebrow">Producto</div><h2 id="prodTitle">Nuevo producto</h2></div>
      <span class="chip" id="prodChip">Alta</span>
    </div>
    <input type="hidden" id="productoId" />

    <!-- Identificación ERP -->
    <div style="margin-top:16px">
      <div class="eyebrow" style="margin-bottom:10px">Identificación ERP</div>
      <div class="grid-2" style="gap:10px">
        <div>
          <div class="label-text">Clave ERP <span style="color:var(--danger)">*</span></div>
          <input class="input" id="pCve"   placeholder="Ej: CAJA-001" style="text-transform:uppercase" maxlength="50"/>
        </div>
        <div>
          <div class="label-text">Nombre corto</div>
          <input class="input" id="pNombreCorto" placeholder="Para búsqueda rápida" maxlength="100"/>
        </div>
      </div>
      <div style="margin-top:10px">
        <div class="label-text">Descripción <span style="color:var(--danger)">*</span></div>
        <input class="input" id="pDesc" placeholder="Descripción completa del producto" maxlength="300"/>
      </div>
    </div>

    <!-- Clasificación -->
    <div style="margin-top:18px; border-top:1px solid var(--line); padding-top:14px">
      <div class="eyebrow" style="margin-bottom:10px">Clasificación</div>
      <div class="grid-2" style="gap:10px">
        <div>
          <div class="label-text">Tipo <span style="color:var(--danger)">*</span></div>
          <select class="select" id="pTipo">
            <option value="producto">Producto</option>
            <option value="servicio">Servicio</option>
            <option value="kit">Kit</option>
          </select>
        </div>
        <div>
          <div class="label-text">Uso <span style="color:var(--danger)">*</span></div>
          <select class="select" id="pUso">
            <option value="producto_terminado">Producto terminado</option>
            <option value="materia_prima">Materia prima</option>
            <option value="producto_en_proceso">En proceso</option>
            <option value="consumible">Consumible</option>
            <option value="activo_fijo">Activo fijo</option>
            <option value="mercancia_reventa">Mercancía reventa</option>
            <option value="servicio_externo">Servicio externo</option>
          </select>
        </div>
        <div>
          <div class="label-text">Familia</div>
          <select class="select" id="pFamilia"><option value="">— Sin familia —</option></select>
        </div>
        <div>
          <div class="label-text">Subfamilia</div>
          <select class="select" id="pSubfamilia"><option value="">— Sin subfamilia —</option></select>
        </div>
      </div>
    </div>

    <!-- Unidad de medida -->
    <div style="margin-top:18px; border-top:1px solid var(--line); padding-top:14px">
      <div class="eyebrow" style="margin-bottom:10px">Unidad de Medida</div>
      <div class="grid-2" style="gap:10px">
        <div>
          <div class="label-text">Unidad uso / venta</div>
          <select class="select" id="pUnidad"><option value="">— Seleccionar —</option></select>
        </div>
        <div>
          <div class="label-text">Unidad compra</div>
          <select class="select" id="pUnidadCompra"><option value="">— Igual a uso —</option></select>
        </div>
        <div>
          <div class="label-text">Factor conversión</div>
          <input class="input" id="pFactor" type="number" value="1" min="0.0001" step="any" placeholder="1"/>
        </div>
      </div>
    </div>

    <!-- Precios -->
    <div style="margin-top:18px; border-top:1px solid var(--line); padding-top:14px">
      <div class="eyebrow" style="margin-bottom:10px">Precios</div>
      <div class="grid-2" style="gap:10px">
        <div>
          <div class="label-text">Precio base</div>
          <input class="input" id="pPrecio" type="number" min="0" step="0.01" placeholder="0.00"/>
        </div>
        <div>
          <div class="label-text">Costo base</div>
          <input class="input" id="pCosto" type="number" min="0" step="0.01" placeholder="0.00"/>
        </div>
        <div>
          <div class="label-text">Moneda</div>
          <select class="select" id="pMoneda">
            <option value="MXN">MXN — Peso mexicano</option>
            <option value="USD">USD — Dólar</option>
            <option value="EUR">EUR — Euro</option>
          </select>
        </div>
        <div>
          <div class="label-text">IVA default (%)</div>
          <select class="select" id="pIva">
            <option value="16">16%</option>
            <option value="8">8% (frontera)</option>
            <option value="0">0% (exento)</option>
          </select>
        </div>
      </div>
    </div>

    <!-- Flags -->
    <div style="margin-top:18px; border-top:1px solid var(--line); padding-top:14px">
      <div class="eyebrow" style="margin-bottom:10px">Módulos que lo usan</div>
      <div class="grid-2" style="gap:10px">
        <div>
          <div class="label-text">¿Es vendible?</div>
          <select class="select" id="pVendible"><option value="true">Sí</option><option value="false">No</option></select>
        </div>
        <div>
          <div class="label-text">¿Es comprable?</div>
          <select class="select" id="pComprable"><option value="true">Sí</option><option value="false">No</option></select>
        </div>
        <div>
          <div class="label-text">¿Es activo fijo?</div>
          <select class="select" id="pActivoFijo"><option value="false">No</option><option value="true">Sí</option></select>
        </div>
        <div>
          <div class="label-text">¿Maneja inventario?</div>
          <select class="select" id="pInventario"><option value="false">No</option><option value="true">Sí</option></select>
        </div>
      </div>
    </div>

    <!-- SAT (colapsado) -->
    <details style="margin-top:18px; border-top:1px solid var(--line); padding-top:14px">
      <summary style="cursor:pointer; font-size:12px; font-weight:600; letter-spacing:.08em; text-transform:uppercase; color:var(--muted)">Datos SAT (opcional)</summary>
      <div class="grid-2" style="gap:10px; margin-top:12px">
        <div>
          <div class="label-text">ClaveProdServ SAT</div>
          <input class="input" id="pClaveSat" placeholder="Ej: 43232000" maxlength="10"/>
        </div>
        <div>
          <div class="label-text">ClaveUnidad SAT</div>
          <input class="input" id="pUnidadSat" placeholder="Ej: H87" maxlength="5" style="text-transform:uppercase"/>
        </div>
      </div>
    </details>

    <!-- Estado + acciones -->
    <div style="margin-top:18px; border-top:1px solid var(--line); padding-top:14px">
      <div class="label-text">Estado</div>
      <select class="select" id="pActivo" style="margin-top:4px"><option value="true">Activo</option><option value="false">Inactivo</option></select>
    </div>
    <div class="page-actions" style="margin-top:16px">
      <button class="btn primary" id="saveProdBtn">Guardar</button>
      <button class="btn"         id="newProdBtn">Nuevo</button>
    </div>
  </div>

</div>`;

  // ── Estado ─────────────────────────────────────────────────────────────
  const PAGE_SIZE = 50;
  let productos   = [];
  let familias    = [];
  let subfamilias = {};  // keyed by familia_id
  let unidades    = [];
  let currentPage = 1;

  const val  = id => document.getElementById(id)?.value?.trim() ?? '';
  const sel  = id => document.getElementById(id)?.value ?? '';
  const setV = (id, v) => { const el = document.getElementById(id); if (el) el.value = v ?? ''; };
  const num  = id => { const v = parseFloat(document.getElementById(id)?.value); return isNaN(v) ? undefined : v; };

  // ── Carga de catálogos de soporte ────────────────────────────────────────
  async function loadSupportData() {
    const [resFam, resUnd] = await Promise.all([
      KoguApi.apiFetch(BASE_FAM),
      KoguApi.apiFetch(BASE_UND),
    ]);
    familias = KoguApi.unwrapRows(resFam).filter(f => f.activo);
    unidades = KoguApi.unwrapRows(resUnd).filter(u => u.activo);
    populateFamiliasSelects();
    populateUnidadesSelects();
  }

  function populateFamiliasSelects() {
    const opts = '<option value="">— Sin familia —</option>' +
      familias.map(f => `<option value="${f.familia_id}">${KoguUi.escapeHtml(f.clave)} — ${KoguUi.escapeHtml(f.nombre)}</option>`).join('');
    document.getElementById('pFamilia').innerHTML = opts;
    // Filter select en lista
    const famFil = document.getElementById('famFil');
    famFil.innerHTML = '<option value="">Todas las familias</option>' +
      familias.map(f => `<option value="${f.familia_id}">${KoguUi.escapeHtml(f.nombre)}</option>`).join('');
  }

  function populateUnidadesSelects() {
    const opts = '<option value="">— Seleccionar —</option>' +
      unidades.map(u => `<option value="${u.unidad_id}">${KoguUi.escapeHtml(u.clave_interna)} — ${KoguUi.escapeHtml(u.nombre)}</option>`).join('');
    const optsCompra = '<option value="">— Igual a uso —</option>' +
      unidades.map(u => `<option value="${u.unidad_id}">${KoguUi.escapeHtml(u.clave_interna)} — ${KoguUi.escapeHtml(u.nombre)}</option>`).join('');
    document.getElementById('pUnidad').innerHTML = opts;
    document.getElementById('pUnidadCompra').innerHTML = optsCompra;
  }

  async function loadSubfamiliasForFamilia(familiaId) {
    if (!familiaId) { document.getElementById('pSubfamilia').innerHTML = '<option value="">— Sin subfamilia —</option>'; return; }
    if (!subfamilias[familiaId]) {
      const res = await KoguApi.apiFetch(`${BASE_FAM}/${familiaId}/subfamilias`);
      subfamilias[familiaId] = KoguApi.unwrapRows(res).filter(s => s.activo);
    }
    document.getElementById('pSubfamilia').innerHTML =
      '<option value="">— Sin subfamilia —</option>' +
      subfamilias[familiaId].map(s =>
        `<option value="${s.subfamilia_id}">${KoguUi.escapeHtml(s.clave)} — ${KoguUi.escapeHtml(s.nombre)}</option>`
      ).join('');
  }

  document.getElementById('pFamilia').onchange = () => {
    loadSubfamiliasForFamilia(sel('pFamilia'));
  };

  // ── Reset / Fill ─────────────────────────────────────────────────────────
  function reset() {
    setV('productoId', ''); setV('pCve', ''); setV('pDesc', ''); setV('pNombreCorto', '');
    setV('pTipo', 'producto'); setV('pUso', 'producto_terminado');
    setV('pFamilia', ''); setV('pSubfamilia', '');
    setV('pUnidad', ''); setV('pUnidadCompra', ''); setV('pFactor', '1');
    setV('pPrecio', ''); setV('pCosto', ''); setV('pMoneda', 'MXN'); setV('pIva', '16');
    setV('pVendible', 'true'); setV('pComprable', 'true');
    setV('pActivoFijo', 'false'); setV('pInventario', 'false');
    setV('pClaveSat', ''); setV('pUnidadSat', ''); setV('pActivo', 'true');
    document.getElementById('prodTitle').textContent = 'Nuevo producto';
    document.getElementById('prodChip').textContent  = 'Alta';
    document.getElementById('pSubfamilia').innerHTML = '<option value="">— Sin subfamilia —</option>';
  }

  async function fill(r) {
    setV('productoId', r.producto_id); setV('pCve', r.cve_prod); setV('pDesc', r.desc_prod);
    setV('pNombreCorto', r.nombre_corto || '');
    setV('pTipo', r.tipo_producto); setV('pUso', r.uso_producto);
    setV('pFamilia', r.familia_id || '');
    if (r.familia_id) { await loadSubfamiliasForFamilia(r.familia_id); }
    setV('pSubfamilia', r.subfamilia_id || '');
    setV('pUnidad', r.unidad_medida_id || ''); setV('pUnidadCompra', r.unidad_compra_id || '');
    setV('pFactor', r.factor_conversion ?? 1);
    setV('pPrecio', r.precio_base ?? ''); setV('pCosto', r.costo_base ?? '');
    setV('pMoneda', r.moneda || 'MXN'); setV('pIva', String(r.tasa_iva_default ?? 16));
    setV('pVendible', String(!!r.es_vendible)); setV('pComprable', String(!!r.es_comprable));
    setV('pActivoFijo', String(!!r.es_activo_fijo)); setV('pInventario', String(!!r.maneja_inventario));
    setV('pClaveSat', r.clave_prod_serv_sat || ''); setV('pUnidadSat', r.clave_unidad_sat || '');
    setV('pActivo', String(!!r.activo));
    document.getElementById('prodTitle').textContent = 'Editar: ' + r.cve_prod;
    document.getElementById('prodChip').textContent  = 'Edición';
  }

  // ── Carga y render lista ─────────────────────────────────────────────────
  async function load(showToast = false) {
    const res  = await KoguApi.apiFetch(BASE);
    productos  = KoguApi.unwrapRows(res);
    currentPage = 1;
    render();
    if (showToast) KoguApi.toast('Catálogo actualizado por cambio de empresa', 'success');
  }

  const TIPO_LABEL = { producto: 'Producto', servicio: 'Servicio', kit: 'Kit' };
  const USO_SHORT  = { producto_terminado: 'P. Terminado', materia_prima: 'Mat. Prima',
    producto_en_proceso: 'En Proceso', consumible: 'Consumible', activo_fijo: 'Activo Fijo',
    mercancia_reventa: 'Reventa', servicio_externo: 'Serv. Externo' };

  function getFiltered() {
    const q  = val('q').toLowerCase();
    const tf = sel('tipoFil');
    const uf = sel('usoFil');
    const ff = sel('famFil');
    const af = sel('activoFil');
    return productos.filter(r => {
      const txt = `${r.cve_prod} ${r.desc_prod} ${r.nombre_corto || ''}`.toLowerCase();
      return (!q  || txt.includes(q))
          && (!tf || r.tipo_producto === tf)
          && (!uf || r.uso_producto  === uf)
          && (!ff || r.familia_id    === ff)
          && (af === '' || String(!!r.activo) === af);
    });
  }

  function renderPaginationProductos(total) {
    const bar        = document.getElementById('pgBarProductos');
    const totalPages = Math.ceil(total / PAGE_SIZE) || 1;
    const from       = total === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
    const to         = Math.min(currentPage * PAGE_SIZE, total);
    bar.innerHTML    = `
      <span>${from}–${to} de ${total}</span>
      <div style="display:flex;gap:8px">
        <button class="btn" id="pgPrev" ${currentPage <= 1 ? 'disabled' : ''}>Anterior</button>
        <span style="padding:6px 10px;font-size:13px">${currentPage} / ${totalPages}</span>
        <button class="btn" id="pgNext" ${currentPage >= totalPages ? 'disabled' : ''}>Siguiente</button>
      </div>`;
    document.getElementById('pgPrev').onclick = () => { if (currentPage > 1)          { currentPage--; render(); } };
    document.getElementById('pgNext').onclick = () => { if (currentPage < totalPages) { currentPage++; render(); } };
  }

  function render() {
    const filtered = getFiltered();
    const page     = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

    document.getElementById('rowsProductos').innerHTML = page.length
      ? page.map(r => `
          <tr>
            <td><span class="chip-compact">${KoguUi.escapeHtml(r.cve_prod)}</span></td>
            <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${KoguUi.escapeHtml(r.desc_prod)}">${KoguUi.escapeHtml(r.desc_prod)}</td>
            <td><span class="badge neutral">${TIPO_LABEL[r.tipo_producto] || r.tipo_producto}</span></td>
            <td style="font-size:11px;color:var(--muted)">${USO_SHORT[r.uso_producto] || r.uso_producto}</td>
            <td style="font-size:11px;color:var(--muted)">${KoguUi.escapeHtml(r.familia_nombre || '-')}</td>
            <td style="text-align:right">${r.precio_base ? KoguUi.money(r.precio_base) : '-'}</td>
            <td>${KoguUi.statusBadge(r.activo ? 'activo' : 'inactivo')}</td>
            <td><button class="btn btn-edit" data-id="${r.producto_id}">Editar</button></td>
          </tr>`).join('')
      : '<tr><td colspan="8" class="empty">Sin productos</td></tr>';

    document.querySelectorAll('.btn-edit').forEach(x => x.onclick = async () => {
      const row = productos.find(r => r.producto_id === x.dataset.id);
      if (row) await fill(row);
      document.getElementById('rightPanel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    renderPaginationProductos(filtered.length);
  }

  // ── Guardar ─────────────────────────────────────────────────────────────
  document.getElementById('saveProdBtn').onclick = async (e) => {
    await KoguUi.withLoading(e.target, async () => {
      try {
        const id = val('productoId');
        const payload = {
          cve_prod:          val('pCve').toUpperCase(),
          desc_prod:         val('pDesc'),
          nombre_corto:      val('pNombreCorto') || undefined,
          tipo_producto:     sel('pTipo'),
          uso_producto:      sel('pUso'),
          familia_id:        sel('pFamilia')      || undefined,
          subfamilia_id:     sel('pSubfamilia')   || undefined,
          unidad_medida_id:  sel('pUnidad')       || undefined,
          unidad_compra_id:  sel('pUnidadCompra') || undefined,
          factor_conversion: num('pFactor') ?? 1,
          precio_base:       num('pPrecio'),
          costo_base:        num('pCosto'),
          moneda:            sel('pMoneda'),
          tasa_iva_default:  parseFloat(sel('pIva')),
          es_vendible:       sel('pVendible')   === 'true',
          es_comprable:      sel('pComprable')  === 'true',
          es_activo_fijo:    sel('pActivoFijo') === 'true',
          maneja_inventario: sel('pInventario') === 'true',
          clave_prod_serv_sat: val('pClaveSat') || undefined,
          clave_unidad_sat:    val('pUnidadSat').toUpperCase() || undefined,
          activo:              sel('pActivo') === 'true',
        };
        if (!payload.cve_prod)  throw new Error('Clave ERP es obligatoria.');
        if (!payload.desc_prod) throw new Error('Descripción es obligatoria.');
        if (id) {
          await KoguApi.apiFetch(`${BASE}/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
          KoguApi.toast('Producto actualizado', 'success');
        } else {
          await KoguApi.apiFetch(BASE, { method: 'POST', body: JSON.stringify(payload) });
          KoguApi.toast('Producto creado', 'success');
        }
        reset(); await load();
      } catch (err) { KoguApi.toast(err.message, 'error'); }
    }, 'Guardando...');
  };

  // ── Eventos globales ──────────────────────────────────────────────────────
  document.getElementById('refreshBtn').onclick  = () => load(false);
  document.getElementById('newProdBtn').onclick  = reset;
  document.getElementById('q').oninput          = () => { currentPage = 1; render(); };
  ['tipoFil', 'usoFil', 'famFil', 'activoFil'].forEach(id =>
    document.getElementById(id).onchange = () => { currentPage = 1; render(); }
  );

  KoguShell.subscribeEmpresaActivaChange(async () => {
    subfamilias = {};
    reset();
    await loadSupportData();
    await load(true);
  });

  await loadSupportData();
  await load();
});

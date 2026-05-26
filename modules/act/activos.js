// ============================================================
// activos.js
// Pantalla: Bandeja de activos (módulo de Activos).
// Endpoint base: /protected/act/activos
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const b = await KoguShell.initShell({
    currentPage:        '/modules/act/activos.html',
    title:              'Activos',
    description:        'Bandeja de activos de la empresa activa.',
    requiredPermission: 'act.activos.read',
  });
  if (!b) return;

  const esc = KoguUi.escapeHtml;
  const canCreate = KoguShell.hasPerm(b, 'act.activos.create');

  const ESTADOS = ['activo', 'en_mantenimiento', 'en_reparacion', 'en_resguardo', 'baja'];
  const CRITICIDADES = ['baja', 'media', 'alta', 'critica'];
  const ESTADO_BADGE = {
    activo: 'success', en_mantenimiento: 'warn', en_reparacion: 'warn',
    en_resguardo: 'neutral', baja: 'danger',
  };
  function estadoBadge(e) {
    const cls = ESTADO_BADGE[e] || 'neutral';
    return `<span class="badge ${cls}">${esc((e || '').replace(/_/g, ' '))}</span>`;
  }

  // cdnjs loader (sin build local)
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if ([...document.scripts].some(s => s.src === src)) return resolve();
      const s = document.createElement('script');
      s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('No se pudo cargar ' + src));
      document.head.appendChild(s);
    });
  }

  let categorias = [], ubicaciones = [], proveedores = null;
  const custodiosVistos = new Map(); // user_id -> nombre (acumulado entre cargas)
  let page = 1, pageSize = 20, totalPages = 1, total = 0;

  document.getElementById('pageContent').innerHTML = `
<div class="card">
  <div class="row">
    <div><div class="eyebrow">Bandeja</div><h2>Activos</h2></div>
    <div style="display:flex;gap:8px">
      ${canCreate ? '<button class="btn primary" id="newBtn">+ Nuevo activo</button>' : ''}
      <button class="btn" id="exportBtn">Exportar Excel</button>
      <button class="btn" id="refreshBtn">Actualizar</button>
    </div>
  </div>
  <div class="grid-3" style="margin-top:16px">
    <input class="input" id="q" placeholder="Buscar por código, nombre o número de serie…" />
    <select class="select" id="fCategoria"><option value="">Todas las categorías</option></select>
    <select class="select" id="fEstado">
      <option value="">Todos los estados</option>
      ${ESTADOS.map(e => `<option value="${e}">${e.replace(/_/g, ' ')}</option>`).join('')}
    </select>
  </div>
  <div class="grid-2" style="margin-top:10px">
    <select class="select" id="fUbicacion"><option value="">Todas las ubicaciones</option></select>
    <select class="select" id="fCustodio"><option value="">Todos los custodios</option></select>
  </div>
  <div class="table-wrap" style="margin-top:16px">
    <table>
      <thead><tr>
        <th style="min-width:120px">Código</th>
        <th style="min-width:200px">Nombre</th>
        <th>Categoría</th>
        <th>Estado</th>
        <th>Custodio</th>
        <th>Ubicación</th>
      </tr></thead>
      <tbody id="rows"></tbody>
    </table>
  </div>
  <div id="pgBar" style="display:flex;align-items:center;justify-content:space-between;margin-top:10px;font-size:13px;color:var(--muted)"></div>
</div>`;

  const $ = id => document.getElementById(id);

  function currentFilters() {
    return {
      q:                $('q').value.trim(),
      categoria_id:     $('fCategoria').value,
      estado:           $('fEstado').value,
      ubicacion_id:     $('fUbicacion').value,
      custodio_user_id: $('fCustodio').value,
    };
  }

  function refreshCustodioOptions() {
    const sel = $('fCustodio');
    const cur = sel.value;
    const opts = ['<option value="">Todos los custodios</option>'];
    [...custodiosVistos.entries()].sort((a, b2) => String(a[1]).localeCompare(String(b2[1])))
      .forEach(([uid, nombre]) => opts.push(`<option value="${uid}">${esc(nombre)}</option>`));
    sel.innerHTML = opts.join('');
    sel.value = cur;
  }

  function renderRows(datos) {
    const tbody = $('rows');
    if (!datos.length) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:24px">Sin activos para los filtros actuales.</td></tr>`;
      return;
    }
    tbody.innerHTML = datos.map(r => `
      <tr style="cursor:pointer" data-id="${r.activo_id}">
        <td><strong>${esc(r.codigo)}</strong></td>
        <td>${esc(r.nombre)}</td>
        <td>${r.categoria_nombre ? esc(r.categoria_nombre) : '<span class="muted">—</span>'}</td>
        <td>${estadoBadge(r.estado)}</td>
        <td>${r.custodio_nombre ? esc(r.custodio_nombre) : '<span class="muted">—</span>'}</td>
        <td>${r.ubicacion_nombre ? esc(r.ubicacion_nombre) : '<span class="muted">—</span>'}</td>
      </tr>`).join('');
    tbody.querySelectorAll('[data-id]').forEach(tr => {
      tr.onclick = () => { window.location.href = '/modules/act/activo-detalle.html?id=' + encodeURIComponent(tr.dataset.id); };
    });
  }

  function renderPg() {
    $('pgBar').innerHTML = `
      <span>${total} activo${total === 1 ? '' : 's'} · página ${page} de ${totalPages}</span>
      <span style="display:flex;gap:8px">
        <button class="btn ghost" id="prevPg" ${page <= 1 ? 'disabled' : ''}>← Anterior</button>
        <button class="btn ghost" id="nextPg" ${page >= totalPages ? 'disabled' : ''}>Siguiente →</button>
      </span>`;
    const prev = $('prevPg'), next = $('nextPg');
    if (prev) prev.onclick = () => { if (page > 1) { page--; load(false); } };
    if (next) next.onclick = () => { if (page < totalPages) { page++; load(false); } };
  }

  async function load(showToast) {
    try {
      const qs = KoguUi.queryParams({ ...currentFilters(), page, page_size: pageSize });
      const res = await KoguApi.apiFetch('/protected/act/activos?' + qs);
      const data = KoguApi.unwrapData(res);
      const datos = data.datos || [];
      const pg = data.paginacion || {};
      page = pg.page || 1; pageSize = pg.page_size || 20;
      total = pg.total || datos.length; totalPages = pg.total_pages || 1;

      datos.forEach(r => { if (r.custodio_actual_user_id && r.custodio_nombre) custodiosVistos.set(r.custodio_actual_user_id, r.custodio_nombre); });
      refreshCustodioOptions();
      renderRows(datos);
      renderPg();
      if (showToast) KoguApi.toast('Bandeja actualizada por cambio de empresa', 'success');
    } catch (_err) {
      renderRows([]); renderPg();
    }
  }

  // ── Exportar Excel (cliente, vía SheetJS de cdnjs; respeta filtros) ─────────
  async function exportarExcel() {
    const btn = $('exportBtn');
    await KoguUi.withLoading(btn, async () => {
      try {
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
        // Recolecta todas las páginas que respetan los filtros actuales.
        const all = [];
        let p = 1, tp = 1;
        do {
          const qs = KoguUi.queryParams({ ...currentFilters(), page: p, page_size: 200 });
          const res = await KoguApi.apiFetch('/protected/act/activos?' + qs);
          const data = KoguApi.unwrapData(res);
          (data.datos || []).forEach(r => all.push(r));
          tp = data.paginacion?.total_pages || 1;
          p++;
        } while (p <= tp);

        if (!all.length) { KoguApi.toast('No hay activos para exportar.', 'error'); return; }

        const rows = all.map(r => ({
          Codigo: r.codigo, Nombre: r.nombre, Categoria: r.categoria_nombre || '',
          Estado: r.estado, Custodio: r.custodio_nombre || '', Ubicacion: r.ubicacion_nombre || '',
          Marca: r.marca || '', Modelo: r.modelo || '', NumeroSerie: r.numero_serie || '',
          Criticidad: r.criticidad || '', CostoAdquisicion: r.costo_adquisicion ?? '', Moneda: r.moneda || '',
          GarantiaHasta: r.garantia_hasta || '', FechaAdquisicion: r.fecha_adquisicion || '',
        }));
        const ws = window.XLSX.utils.json_to_sheet(rows);
        const wb = window.XLSX.utils.book_new();
        window.XLSX.utils.book_append_sheet(wb, ws, 'Activos');
        const empresa = (KoguApi.getEmpresaActiva() || {});
        const nombreEmp = (empresa.clave_empresa || empresa.nombre_corto || 'empresa').replace(/[^a-zA-Z0-9_-]+/g, '-');
        window.XLSX.writeFile(wb, `activos_${nombreEmp}_${new Date().toISOString().slice(0, 10)}.xlsx`);
      } catch (e) {
        KoguApi.toast(e.message || 'No fue posible exportar.', 'error');
      }
    }, 'Exportando…');
  }

  // ── Modal de alta ───────────────────────────────────────────────────────────
  function buildModal() {
    if (!canCreate) return;
    const overlay = document.createElement('div');
    overlay.id = 'actModal';
    overlay.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:9999;align-items:flex-start;justify-content:center;padding:40px 20px 20px;backdrop-filter:blur(2px)';
    overlay.innerHTML = `
      <div style="width:100%;max-width:680px;max-height:88vh;background:white;border-radius:12px;box-shadow:0 20px 50px rgba(0,0,0,.3);display:flex;flex-direction:column;overflow:hidden;color:#0f172a">
        <div style="padding:16px 20px;border-bottom:1px solid var(--line,#e2e8f0);display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
          <div><div class="eyebrow">Formulario</div><h2 style="margin:0;font-size:20px">Alta de activo</h2></div>
          <button class="btn ghost" id="closeModalBtn" style="padding:6px 10px;font-size:16px">✕</button>
        </div>
        <div style="flex:1;overflow-y:auto;padding:20px">
          <div class="stack">
            <div class="grid-2">
              <div><div class="label-text">Código</div><input class="input" id="m_codigo" maxlength="40" placeholder="Etiqueta única" /></div>
              <div><div class="label-text">Categoría</div><select class="select" id="m_categoria"><option value="">Selecciona…</option></select></div>
            </div>
            <div><div class="label-text">Nombre</div><input class="input" id="m_nombre" /></div>
            <div><div class="label-text">Descripción <span class="muted" style="font-size:11px">(opcional)</span></div><input class="input" id="m_descripcion" /></div>
            <div class="grid-3">
              <div><div class="label-text">Marca</div><input class="input" id="m_marca" /></div>
              <div><div class="label-text">Modelo</div><input class="input" id="m_modelo" /></div>
              <div><div class="label-text">Número de serie</div><input class="input" id="m_serie" /></div>
            </div>
            <div class="grid-3">
              <div><div class="label-text">Criticidad</div><select class="select" id="m_criticidad">${CRITICIDADES.map(c => `<option value="${c}"${c === 'media' ? ' selected' : ''}>${c}</option>`).join('')}</select></div>
              <div><div class="label-text">Fecha adquisición</div><input class="input" id="m_fecha_adq" type="date" /></div>
              <div><div class="label-text">Garantía hasta</div><input class="input" id="m_garantia" type="date" /></div>
            </div>
            <div class="grid-3">
              <div><div class="label-text">Costo adquisición</div><input class="input" id="m_costo" type="number" min="0" step="0.01" /></div>
              <div><div class="label-text">Moneda</div><input class="input" id="m_moneda" maxlength="3" placeholder="MXN" /></div>
              <div><div class="label-text">Costo reposición est.</div><input class="input" id="m_reposicion" type="number" min="0" step="0.01" /></div>
            </div>
            <div>
              <div class="label-text">Proveedor <span class="muted" style="font-size:11px">(opcional)</span></div>
              <div style="display:flex;gap:6px">
                <input class="input" id="m_prov_label" readonly placeholder="— ninguno —" style="flex:1;cursor:pointer;background:#f8fafc" />
                <button type="button" class="btn ghost" id="m_prov_pick">Buscar…</button>
                <button type="button" class="btn ghost" id="m_prov_clear" title="Limpiar" style="padding:7px 10px">×</button>
              </div>
              <input type="hidden" id="m_proveedor_id" />
            </div>
          </div>
        </div>
        <div style="padding:14px 20px;border-top:1px solid var(--line,#e2e8f0);display:flex;justify-content:flex-end;gap:8px;flex-shrink:0">
          <button class="btn ghost" id="cancelModalBtn">Cancelar</button>
          <button class="btn primary" id="saveBtn">Crear activo</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && overlay.style.display !== 'none') closeModal(); });
    $('closeModalBtn').onclick = closeModal;
    $('cancelModalBtn').onclick = closeModal;
    $('saveBtn').onclick = onSave;
    $('m_prov_clear').onclick = () => { $('m_proveedor_id').value = ''; $('m_prov_label').value = ''; };
    const pick = async () => {
      if (!proveedores) {
        try { proveedores = KoguApi.unwrapRows(await KoguApi.apiFetch('/protected/core/proveedores')) || []; }
        catch (_e) { proveedores = []; }
      }
      KoguUi.openSearchPicker({
        title: 'Seleccionar proveedor', items: proveedores,
        columns: [{ key: 'nombre', label: 'Nombre', primary: true }, { key: 'rfc', label: 'RFC' }],
        placeholder: 'Buscar por nombre o RFC…',
        onSelect: (it) => { $('m_proveedor_id').value = it.proveedor_id; $('m_prov_label').value = it.nombre || it.rfc || it.proveedor_id; },
      });
    };
    $('m_prov_pick').onclick = pick;
    $('m_prov_label').onclick = pick;
  }
  function openModal() { $('actModal').style.display = 'flex'; }
  function closeModal() { const m = $('actModal'); if (m) m.style.display = 'none'; }

  function fillCategoriaSelects() {
    const opts = categorias.filter(c => c.activo !== false)
      .map(c => `<option value="${c.categoria_id}">${esc(c.clave)} — ${esc(c.nombre)}</option>`).join('');
    $('fCategoria').innerHTML = '<option value="">Todas las categorías</option>' + opts;
    const mc = $('m_categoria'); if (mc) mc.innerHTML = '<option value="">Selecciona…</option>' + opts;
    $('fUbicacion').innerHTML = '<option value="">Todas las ubicaciones</option>' +
      ubicaciones.map(u => `<option value="${u.ubicacion_id}">${esc(u.clave)} — ${esc(u.nombre)}</option>`).join('');
  }

  async function onSave() {
    const payload = {
      codigo: $('m_codigo').value.trim(),
      nombre: $('m_nombre').value.trim(),
      categoria_id: $('m_categoria').value,
      descripcion: $('m_descripcion').value.trim() || null,
      marca: $('m_marca').value.trim() || null,
      modelo: $('m_modelo').value.trim() || null,
      numero_serie: $('m_serie').value.trim() || null,
      criticidad: $('m_criticidad').value,
      fecha_adquisicion: $('m_fecha_adq').value || null,
      garantia_hasta: $('m_garantia').value || null,
      costo_adquisicion: $('m_costo').value ? Number($('m_costo').value) : null,
      moneda: $('m_moneda').value.trim() || null,
      costo_reposicion_estimado: $('m_reposicion').value ? Number($('m_reposicion').value) : null,
      proveedor_id: $('m_proveedor_id').value || null,
    };
    if (!payload.codigo) { KoguApi.toast('El código es obligatorio.', 'error'); return; }
    if (!payload.nombre) { KoguApi.toast('El nombre es obligatorio.', 'error'); return; }
    if (!payload.categoria_id) { KoguApi.toast('La categoría es obligatoria.', 'error'); return; }

    await KoguUi.withLoading(this, async () => {
      try {
        const res = await KoguApi.apiFetch('/protected/act/activos', { method: 'POST', body: JSON.stringify(payload) });
        const created = KoguApi.unwrapData(res);
        KoguApi.toast('Activo creado · ' + (created?.codigo || ''), 'success');
        closeModal();
        // Muestra su QR: redirige a la ficha del nuevo activo.
        if (created?.activo_id) window.location.href = '/modules/act/activo-detalle.html?id=' + encodeURIComponent(created.activo_id);
        else await load(false);
      } catch (_err) { /* apiFetch ya hizo toast (422 código duplicado, etc.) */ }
    }, 'Creando…');
  }

  async function loadCatalogos() {
    try {
      const [cat, ubi] = await Promise.all([
        KoguApi.apiFetch('/protected/act/categorias').catch(() => ({})),
        KoguApi.apiFetch('/protected/act/ubicaciones').catch(() => ({})),
      ]);
      categorias = KoguApi.unwrapRows(cat, 'rows') || [];
      ubicaciones = KoguApi.unwrapRows(ubi, 'rows') || [];
      fillCategoriaSelects();
    } catch (_e) {}
  }

  // ── Bindings ────────────────────────────────────────────────────────────────
  buildModal();
  if (canCreate) $('newBtn').onclick = () => { openModal(); };
  $('exportBtn').onclick = exportarExcel;
  $('refreshBtn').onclick = () => { page = 1; load(false); };
  ['q', 'fCategoria', 'fEstado', 'fUbicacion', 'fCustodio'].forEach(id => {
    const el = $(id);
    const ev = (id === 'q') ? 'input' : 'change';
    let t;
    el.addEventListener(ev, () => { clearTimeout(t); t = setTimeout(() => { page = 1; load(false); }, id === 'q' ? 350 : 0); });
  });

  KoguShell.subscribeEmpresaActivaChange(async () => {
    custodiosVistos.clear(); page = 1;
    await loadCatalogos();
    await load(true);
  });

  await loadCatalogos();
  await load(false);
});

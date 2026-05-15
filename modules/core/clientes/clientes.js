window.__MODULE_DEF__ = {
  currentPage: '/modules/core/clientes/clientes.html',
  title:       'Clientes',
  description: 'Catálogo base multiempresa para clientes.',
  singular:    'cliente',
  basePath:    '/protected/core/clientes',
  idField:     'cliente_id',
  buildPayload: x => ({ nombre: x.nombre, rfc: x.rfc, cve_cte: x.cve_cte || null, activo: x.activo })
};

document.addEventListener('DOMContentLoaded', async () => {
  const MODULE = window.__MODULE_DEF__;

  const b = await KoguShell.initShell({
    currentPage:        MODULE.currentPage,
    title:              MODULE.title,
    description:        MODULE.description,
    requiredPermission: 'screen.catalogos.clientes'
  });
  if (!b) return;

  const c = document.getElementById('pageContent');
  c.innerHTML = `
<div class="split">

  <!-- ── Lista ── -->
  <div class="card">
    <div class="row">
      <div><div class="eyebrow">Listado</div><h2>${MODULE.title}</h2></div>
      <button class="btn primary" id="refreshBtn">Actualizar</button>
    </div>
    <div class="grid-2" style="margin-top:16px">
      <input  class="input"  id="q"           placeholder="Buscar por nombre o RFC" />
      <select class="select" id="activoFiltro">
        <option value="">Todos</option>
        <option value="true">Activos</option>
        <option value="false">Inactivos</option>
      </select>
    </div>
    <div class="table-wrap" style="margin-top:16px">
      <table><thead><tr>
        <th>Nombre</th><th>RFC</th><th style="width:110px">Cve SAI</th><th>Activo</th><th>Acciones</th>
      </tr></thead><tbody id="rows"></tbody></table>
    </div>
    <div id="pgBar" style="display:flex;align-items:center;justify-content:space-between;margin-top:10px;font-size:13px;color:var(--muted)"></div>
  </div>

  <!-- ── Formulario ── -->
  <div class="card">
    <div class="row">
      <div><div class="eyebrow">Formulario</div><h2 id="formTitle">Alta de ${MODULE.singular}</h2></div>
      <span class="chip" id="modeChip">Alta</span>
    </div>
    <div class="stack" style="margin-top:16px">
      <input type="hidden" id="id" />
      <div><div class="label-text">Nombre</div><input class="input" id="nombre" /></div>
      <div><div class="label-text">RFC</div><input class="input" id="rfc" /></div>
      <div>
        <div class="label-text">Cve SAI <span style="color:var(--muted);font-weight:400;font-size:11px">(cve_cte — identificador ERP)</span></div>
        <input class="input" id="cveCte" placeholder="Ej. C0001" />
      </div>
      <div>
        <div class="label-text">Activo</div>
        <select class="select" id="activo">
          <option value="true">Sí</option>
          <option value="false">No</option>
        </select>
      </div>
      <div class="page-actions">
        <button class="btn primary" id="saveBtn">Guardar</button>
        <button class="btn"         id="statusBtn">Cambiar status</button>
        <button class="btn"         id="newBtn">Nuevo</button>
      </div>
    </div>
  </div>

</div>`;

  // ── Estado ────────────────────────────────────────────────────────────────
  const PAGE_SIZE  = 50;
  let rows         = [];
  let currentPage  = 1;

  const val  = id => document.getElementById(id).value.trim();
  const mapName = r => r.nombre || r.nombre_cliente || r.razon_social || '';
  const mapRfc  = r => r.rfc || r.rfc_cliente || '';
  const mapId   = r => r[MODULE.idField] || r.id || '';

  // ── Helpers formulario ────────────────────────────────────────────────────
  function reset() {
    ['id', 'nombre', 'rfc', 'cveCte'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('activo').value    = 'true';
    document.getElementById('formTitle').textContent = 'Alta de ' + MODULE.singular;
    document.getElementById('modeChip').textContent  = 'Alta';
  }

  function fill(r) {
    document.getElementById('id').value      = mapId(r);
    document.getElementById('nombre').value  = mapName(r);
    document.getElementById('rfc').value     = mapRfc(r);
    document.getElementById('cveCte').value  = r.cve_cte || '';
    document.getElementById('activo').value  = String(!!r.activo);
    document.getElementById('formTitle').textContent = 'Editar ' + MODULE.singular;
    document.getElementById('modeChip').textContent  = 'Edición';
  }

  // ── Carga ─────────────────────────────────────────────────────────────────
  async function load(showToast = false) {
    const res = await KoguApi.apiFetch(MODULE.basePath);
    rows = KoguApi.unwrapRows(res);
    currentPage = 1;
    render();
    if (showToast) KoguApi.toast('Clientes actualizados por cambio de empresa', 'success');
  }

  // ── Filtrado ──────────────────────────────────────────────────────────────
  function getFiltered() {
    const q  = val('q').toLowerCase();
    const af = document.getElementById('activoFiltro').value;
    return rows.filter(r => {
      const text = `${mapName(r)} ${mapRfc(r)} ${r.cve_cte || ''}`.toLowerCase();
      return (!q  || text.includes(q))
          && (af === '' || String(!!r.activo) === af);
    });
  }

  // ── Paginación ────────────────────────────────────────────────────────────
  function renderPagination(total) {
    const bar       = document.getElementById('pgBar');
    const totalPages = Math.ceil(total / PAGE_SIZE) || 1;
    const from      = total === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
    const to        = Math.min(currentPage * PAGE_SIZE, total);
    bar.innerHTML   = `
      <span>${from}–${to} de ${total}</span>
      <div style="display:flex;gap:8px">
        <button class="btn" id="pgPrev" ${currentPage <= 1 ? 'disabled' : ''}>Anterior</button>
        <span style="padding:6px 10px;font-size:13px">${currentPage} / ${totalPages}</span>
        <button class="btn" id="pgNext" ${currentPage >= totalPages ? 'disabled' : ''}>Siguiente</button>
      </div>`;
    document.getElementById('pgPrev').onclick = () => { if (currentPage > 1)          { currentPage--; render(); } };
    document.getElementById('pgNext').onclick = () => { if (currentPage < totalPages) { currentPage++; render(); } };
  }

  // ── Render tabla ──────────────────────────────────────────────────────────
  function render() {
    const filtered = getFiltered();
    const page     = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

    document.getElementById('rows').innerHTML = page.length
      ? page.map(r => `
          <tr>
            <td>${KoguUi.escapeHtml(mapName(r))}</td>
            <td style="font-family:monospace;font-size:12px">${KoguUi.escapeHtml(mapRfc(r))}</td>
            <td style="font-family:monospace;font-size:12px;color:${r.cve_cte ? 'var(--primary)' : 'var(--muted)'}">${KoguUi.escapeHtml(r.cve_cte || '—')}</td>
            <td>${KoguUi.statusBadge(r.activo ? 'activo' : 'inactivo')}</td>
            <td><button class="btn btn-edit" data-id="${mapId(r)}">Editar</button></td>
          </tr>`).join('')
      : '<tr><td colspan="5" class="empty">Sin registros</td></tr>';

    document.querySelectorAll('.btn-edit').forEach(x => x.onclick = () => {
      const row = rows.find(r => String(mapId(r)) === x.dataset.id);
      if (row) fill(row);
    });

    renderPagination(filtered.length);
  }

  // ── Guardar ───────────────────────────────────────────────────────────────
  document.getElementById('saveBtn').onclick = async () => {
    try {
      const payload = MODULE.buildPayload({
        nombre:  val('nombre'),
        rfc:     val('rfc'),
        cve_cte: val('cveCte') || null,
        activo:  document.getElementById('activo').value === 'true',
      });
      if (!val('nombre')) throw new Error('Nombre es obligatorio.');
      const id = document.getElementById('id').value;
      if (id) {
        await KoguApi.apiFetch(MODULE.basePath + '/' + id, { method: 'PUT', body: JSON.stringify(payload) });
        KoguApi.toast(MODULE.singular + ' actualizado', 'success');
      } else {
        await KoguApi.apiFetch(MODULE.basePath, { method: 'POST', body: JSON.stringify(payload) });
        KoguApi.toast(MODULE.singular + ' creado', 'success');
      }
      reset(); await load(false);
    } catch (err) { KoguApi.toast(err.message, 'error'); }
  };

  document.getElementById('statusBtn').onclick = async () => {
    try {
      const id = document.getElementById('id').value;
      if (!id) throw new Error('Selecciona un registro.');
      await KoguApi.apiFetch(MODULE.basePath + '/' + id + '/status', {
        method: 'PUT',
        body: JSON.stringify({
          status: document.getElementById('status').value,
          activo: document.getElementById('activo').value === 'true'
        })
      });
      KoguApi.toast('Status actualizado', 'success');
      await load(false);
    } catch (err) { KoguApi.toast(err.message, 'error'); }
  };

  // ── Eventos ───────────────────────────────────────────────────────────────
  document.getElementById('refreshBtn').onclick      = () => load(false);
  document.getElementById('newBtn').onclick          = reset;
  document.getElementById('q').oninput              = () => { currentPage = 1; render(); };
  document.getElementById('activoFiltro').onchange  = () => { currentPage = 1; render(); };

  KoguShell.subscribeEmpresaActivaChange(async () => { await load(true); });
  await load(false);
});

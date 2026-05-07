document.addEventListener('DOMContentLoaded', async () => {
  const PAGE    = '/modules/cat/familias/familias.html';
  const BASE    = '/protected/cat/familias';
  const PERM    = 'screen.catalogos.familias';

  const b = await KoguShell.initShell({ currentPage: PAGE, title: 'Familias de Producto', description: 'Catálogo de familias y subfamilias por empresa.', requiredPermission: PERM });
  if (!b) return;

  const c = document.getElementById('pageContent');
  c.innerHTML = `
<div class="split">

  <!-- ── Lista familias ── -->
  <div class="card">
    <div class="row">
      <div><div class="eyebrow">Catálogo</div><h2>Familias de Producto</h2></div>
      <button class="btn primary" id="refreshBtn">Actualizar</button>
    </div>
    <div class="grid-2" style="margin-top:16px">
      <input  class="input"  id="q"          placeholder="Buscar por clave o nombre" />
      <select class="select" id="activoFil"><option value="">Todos</option><option value="true">Activos</option><option value="false">Inactivos</option></select>
    </div>
    <div class="table-wrap" style="margin-top:16px">
      <table><thead><tr>
        <th>Clave</th><th>Nombre</th><th>Subfamilias</th><th>Estado</th><th></th>
      </tr></thead><tbody id="rowsFamilias"></tbody></table>
    </div>
  </div>

  <!-- ── Formulario familia + subfamilias ── -->
  <div class="card" id="rightPanel">
    <!-- FAMILIA FORM -->
    <div id="familiaFormSection">
      <div class="row">
        <div><div class="eyebrow">Familia</div><h2 id="familiaTitle">Nueva familia</h2></div>
        <span class="chip" id="familiaChip">Alta</span>
      </div>
      <div class="stack" style="margin-top:16px">
        <input type="hidden" id="familiaId" />
        <div>
          <div class="label-text">Clave <span style="color:var(--danger)">*</span></div>
          <input class="input" id="fClave" placeholder="Ej: ELEC" style="text-transform:uppercase" maxlength="20"/>
        </div>
        <div>
          <div class="label-text">Nombre <span style="color:var(--danger)">*</span></div>
          <input class="input" id="fNombre" placeholder="Ej: Electrónica" maxlength="100"/>
        </div>
        <div>
          <div class="label-text">Descripción</div>
          <input class="input" id="fDesc" placeholder="Opcional" maxlength="300"/>
        </div>
        <div>
          <div class="label-text">Estado</div>
          <select class="select" id="fActivo"><option value="true">Activo</option><option value="false">Inactivo</option></select>
        </div>
        <div class="page-actions">
          <button class="btn primary" id="saveFamiliaBtn">Guardar familia</button>
          <button class="btn"         id="newFamiliaBtn">Nueva</button>
        </div>
      </div>
    </div>

    <!-- SUBFAMILIAS (solo cuando hay familia seleccionada) -->
    <div id="subfamiliasSection" style="display:none; border-top:1px solid var(--line); margin-top:24px; padding-top:20px">
      <div class="row">
        <div><div class="eyebrow">Subfamilias de</div><h3 id="subfamiliaTitulo" style="margin:4px 0 0"></h3></div>
        <button class="btn" id="newSubfamiliaBtn">+ Nueva subfamilia</button>
      </div>

      <div class="table-wrap" style="margin:12px 0">
        <table><thead><tr><th>Clave</th><th>Nombre</th><th>Estado</th><th></th></tr></thead>
        <tbody id="rowsSubfamilias"></tbody></table>
      </div>

      <!-- mini form subfamilia -->
      <div id="subForm" style="display:none; background:var(--panel2); border:1px solid var(--line); border-radius:12px; padding:16px; margin-top:12px">
        <div class="row" style="margin-bottom:12px">
          <div class="eyebrow" id="subFormTitle">Nueva subfamilia</div>
          <button class="btn" id="cancelSubBtn" style="font-size:12px">Cancelar</button>
        </div>
        <input type="hidden" id="subfamiliaId" />
        <div class="grid-2" style="gap:12px">
          <div>
            <div class="label-text">Clave <span style="color:var(--danger)">*</span></div>
            <input class="input" id="sClave" placeholder="Ej: COMP" style="text-transform:uppercase" maxlength="20"/>
          </div>
          <div>
            <div class="label-text">Nombre <span style="color:var(--danger)">*</span></div>
            <input class="input" id="sNombre" placeholder="Ej: Componentes" maxlength="100"/>
          </div>
        </div>
        <div style="margin-top:8px">
          <div class="label-text">Descripción</div>
          <input class="input" id="sDesc" placeholder="Opcional" maxlength="300"/>
        </div>
        <div style="margin-top:8px">
          <div class="label-text">Estado</div>
          <select class="select" id="sActivo"><option value="true">Activo</option><option value="false">Inactivo</option></select>
        </div>
        <div class="page-actions" style="margin-top:12px">
          <button class="btn primary" id="saveSubBtn">Guardar subfamilia</button>
        </div>
      </div>
    </div>
  </div>

</div>`;

  // ── Estado ──────────────────────────────────────────────────────────────
  let familias = [];
  let subfamilias = [];
  let selectedFamiliaId = null;

  // ── Helpers ──────────────────────────────────────────────────────────────
  const val  = id => document.getElementById(id)?.value?.trim() ?? '';
  const sel  = id => document.getElementById(id)?.value ?? '';
  const setV = (id, v) => { const el = document.getElementById(id); if (el) el.value = v ?? ''; };
  const show = (id, v) => { const el = document.getElementById(id); if (el) el.style.display = v ? '' : 'none'; };

  // ── FAMILIAS ─────────────────────────────────────────────────────────────
  function resetFamilia() {
    setV('familiaId', ''); setV('fClave', ''); setV('fNombre', ''); setV('fDesc', '');
    setV('fActivo', 'true');
    document.getElementById('familiaTitle').textContent = 'Nueva familia';
    document.getElementById('familiaChip').textContent  = 'Alta';
    selectedFamiliaId = null;
    show('subfamiliasSection', false);
  }

  function fillFamilia(r) {
    setV('familiaId', r.familia_id); setV('fClave', r.clave); setV('fNombre', r.nombre);
    setV('fDesc', r.descripcion || ''); setV('fActivo', String(!!r.activo));
    document.getElementById('familiaTitle').textContent = 'Editar: ' + r.nombre;
    document.getElementById('familiaChip').textContent  = 'Edición';
    selectedFamiliaId = r.familia_id;
    document.getElementById('subfamiliaTitulo').textContent = r.nombre;
    show('subfamiliasSection', true);
    loadSubfamilias(r.familia_id);
  }

  async function loadFamilias(showToast = false) {
    const res = await KoguApi.apiFetch(BASE);
    familias = KoguApi.unwrapRows(res);
    renderFamilias();
    if (showToast) KoguApi.toast('Familias actualizadas', 'success');
  }

  function renderFamilias() {
    const q  = val('q').toLowerCase();
    const af = sel('activoFil');
    const filtered = familias.filter(r => {
      const txt = `${r.clave} ${r.nombre}`.toLowerCase();
      const okQ = !q || txt.includes(q);
      const okA = af === '' || String(!!r.activo) === af;
      return okQ && okA;
    });
    document.getElementById('rowsFamilias').innerHTML = filtered.length
      ? filtered.map(r => `
          <tr>
            <td><span class="chip-compact">${KoguUi.escapeHtml(r.clave)}</span></td>
            <td>${KoguUi.escapeHtml(r.nombre)}</td>
            <td><span class="badge neutral">${r.total_subfamilias ?? 0}</span></td>
            <td>${KoguUi.statusBadge(r.activo ? 'activo' : 'inactivo')}</td>
            <td><button class="btn btn-edit" data-id="${r.familia_id}">Editar</button></td>
          </tr>`).join('')
      : '<tr><td colspan="5" class="empty">Sin familias registradas</td></tr>';
    document.querySelectorAll('#rowsFamilias .btn-edit').forEach(x => x.onclick = () => {
      const row = familias.find(r => r.familia_id === x.dataset.id);
      if (row) fillFamilia(row);
    });
  }

  document.getElementById('saveFamiliaBtn').onclick = async (e) => {
    await KoguUi.withLoading(e.target, async () => {
      try {
        const id      = val('familiaId');
        const payload = { clave: val('fClave').toUpperCase(), nombre: val('fNombre'), descripcion: val('fDesc'), activo: sel('fActivo') === 'true' };
        if (!payload.clave)   throw new Error('Clave es obligatoria.');
        if (!payload.nombre)  throw new Error('Nombre es obligatorio.');
        if (id) {
          await KoguApi.apiFetch(`${BASE}/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
          KoguApi.toast('Familia actualizada', 'success');
        } else {
          const res = await KoguApi.apiFetch(BASE, { method: 'POST', body: JSON.stringify(payload) });
          const created = res?.data || res;
          KoguApi.toast('Familia creada', 'success');
          if (created?.familia_id) { await loadFamilias(); fillFamilia(created); return; }
        }
        await loadFamilias();
      } catch (err) { KoguApi.toast(err.message, 'error'); }
    }, 'Guardando...');
  };

  // ── SUBFAMILIAS ───────────────────────────────────────────────────────────
  function resetSubfamilia() {
    setV('subfamiliaId', ''); setV('sClave', ''); setV('sNombre', ''); setV('sDesc', ''); setV('sActivo', 'true');
    document.getElementById('subFormTitle').textContent = 'Nueva subfamilia';
    show('subForm', false);
  }

  function fillSubfamilia(r) {
    setV('subfamiliaId', r.subfamilia_id); setV('sClave', r.clave); setV('sNombre', r.nombre);
    setV('sDesc', r.descripcion || ''); setV('sActivo', String(!!r.activo));
    document.getElementById('subFormTitle').textContent = 'Editar: ' + r.nombre;
    show('subForm', true);
  }

  async function loadSubfamilias(familiaId) {
    const res = await KoguApi.apiFetch(`${BASE}/${familiaId}/subfamilias`);
    subfamilias = KoguApi.unwrapRows(res);
    renderSubfamilias();
  }

  function renderSubfamilias() {
    document.getElementById('rowsSubfamilias').innerHTML = subfamilias.length
      ? subfamilias.map(r => `
          <tr>
            <td><span class="chip-compact">${KoguUi.escapeHtml(r.clave)}</span></td>
            <td>${KoguUi.escapeHtml(r.nombre)}</td>
            <td>${KoguUi.statusBadge(r.activo ? 'activo' : 'inactivo')}</td>
            <td><button class="btn btn-edit-sub" data-id="${r.subfamilia_id}">Editar</button></td>
          </tr>`).join('')
      : '<tr><td colspan="4" class="empty">Sin subfamilias</td></tr>';
    document.querySelectorAll('.btn-edit-sub').forEach(x => x.onclick = () => {
      const row = subfamilias.find(r => r.subfamilia_id === x.dataset.id);
      if (row) fillSubfamilia(row);
    });
  }

  document.getElementById('newSubfamiliaBtn').onclick = () => { resetSubfamilia(); show('subForm', true); };
  document.getElementById('cancelSubBtn').onclick     = resetSubfamilia;

  document.getElementById('saveSubBtn').onclick = async (e) => {
    await KoguUi.withLoading(e.target, async () => {
      try {
        if (!selectedFamiliaId) throw new Error('Selecciona una familia primero.');
        const subId   = val('subfamiliaId');
        const payload = { clave: val('sClave').toUpperCase(), nombre: val('sNombre'), descripcion: val('sDesc'), activo: sel('sActivo') === 'true' };
        if (!payload.clave)  throw new Error('Clave es obligatoria.');
        if (!payload.nombre) throw new Error('Nombre es obligatorio.');
        if (subId) {
          await KoguApi.apiFetch(`${BASE.replace('familias','subfamilias')}/${subId}`, { method: 'PUT', body: JSON.stringify(payload) });
          KoguApi.toast('Subfamilia actualizada', 'success');
        } else {
          await KoguApi.apiFetch(`${BASE}/${selectedFamiliaId}/subfamilias`, { method: 'POST', body: JSON.stringify(payload) });
          KoguApi.toast('Subfamilia creada', 'success');
        }
        resetSubfamilia();
        await loadSubfamilias(selectedFamiliaId);
        await loadFamilias();
      } catch (err) { KoguApi.toast(err.message, 'error'); }
    }, 'Guardando...');
  };

  // ── Eventos globales ───────────────────────────────────────────────────────
  document.getElementById('refreshBtn').onclick   = () => loadFamilias(false);
  document.getElementById('newFamiliaBtn').onclick = resetFamilia;
  document.getElementById('q').oninput            = renderFamilias;
  document.getElementById('activoFil').onchange   = renderFamilias;

  KoguShell.subscribeEmpresaActivaChange(async () => { resetFamilia(); await loadFamilias(true); });
  await loadFamilias();
});

// ============================================================
// categorias.js
// Pantalla: Catálogo de Categorías de activo (módulo de Activos).
// Endpoint base: /protected/act/categorias
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const b = await KoguShell.initShell({
    currentPage:        '/modules/act/categorias.html',
    title:              'Categorías de activo',
    description:        'Catálogo de categorías del módulo de Activos.',
    requiredPermission: 'act.catalogos.read',
  });
  if (!b) return;

  const canManage = KoguShell.hasPerm(b, 'act.catalogos.manage');
  const esc = KoguUi.escapeHtml;

  let categorias = [];

  document.getElementById('pageContent').innerHTML = `
<div class="card">
  <div class="row">
    <div><div class="eyebrow">Catálogo</div><h2>Categorías</h2></div>
    <div style="display:flex;gap:8px">
      ${canManage ? '<button class="btn primary" id="newBtn">+ Nueva categoría</button>' : ''}
      <button class="btn" id="refreshBtn">Actualizar</button>
    </div>
  </div>
  <div class="table-wrap" style="margin-top:16px">
    <table>
      <thead><tr>
        <th style="min-width:120px">Clave</th>
        <th style="min-width:220px">Nombre</th>
        <th style="text-align:center">Vida útil (meses)</th>
        <th style="text-align:center">Activo</th>
        ${canManage ? '<th style="white-space:nowrap">Acciones</th>' : ''}
      </tr></thead>
      <tbody id="rows"></tbody>
    </table>
  </div>
</div>`;

  // ── Modal ──────────────────────────────────────────────────────────────────
  function buildModal() {
    if (!canManage) return;
    const overlay = document.createElement('div');
    overlay.id = 'catModal';
    overlay.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:9999;align-items:flex-start;justify-content:center;padding:40px 20px 20px;backdrop-filter:blur(2px)';
    overlay.innerHTML = `
      <div style="width:100%;max-width:520px;max-height:88vh;background:white;border-radius:12px;box-shadow:0 20px 50px rgba(0,0,0,.3);display:flex;flex-direction:column;overflow:hidden;color:#0f172a">
        <div style="padding:16px 20px;border-bottom:1px solid var(--line,#e2e8f0);display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
          <div><div class="eyebrow">Formulario</div><h2 id="formTitle" style="margin:0;font-size:20px">Alta de categoría</h2></div>
          <button class="btn ghost" id="closeModalBtn" style="padding:6px 10px;font-size:16px">✕</button>
        </div>
        <div style="flex:1;overflow-y:auto;padding:20px">
          <div class="stack">
            <input type="hidden" id="categoria_id" />
            <div class="grid-2">
              <div>
                <div class="label-text">Clave</div>
                <input class="input" id="clave" maxlength="30" placeholder="Ej. COMPUTO" />
              </div>
              <div>
                <div class="label-text">Vida útil (meses) <span class="muted" style="font-size:11px">(opcional)</span></div>
                <input class="input" id="vida_util_meses" type="number" min="1" step="1" placeholder="Ej. 48" />
              </div>
            </div>
            <div>
              <div class="label-text">Nombre</div>
              <input class="input" id="nombre" placeholder="Nombre de la categoría" />
            </div>
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
              <input type="checkbox" id="activo" checked /> <span>Activo</span>
            </label>
          </div>
        </div>
        <div style="padding:14px 20px;border-top:1px solid var(--line,#e2e8f0);display:flex;justify-content:flex-end;gap:8px;flex-shrink:0">
          <button class="btn ghost" id="cancelModalBtn">Cancelar</button>
          <button class="btn primary" id="saveBtn">Guardar</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && overlay.style.display !== 'none') closeModal(); });
    document.getElementById('closeModalBtn').onclick = closeModal;
    document.getElementById('cancelModalBtn').onclick = closeModal;
    document.getElementById('saveBtn').onclick = onSave;
  }
  const $ = id => document.getElementById(id);
  function openModal() { $('catModal').style.display = 'flex'; }
  function closeModal() { const m = $('catModal'); if (m) m.style.display = 'none'; }

  function resetForm() {
    $('categoria_id').value = '';
    $('clave').value = '';
    $('nombre').value = '';
    $('vida_util_meses').value = '';
    $('activo').checked = true;
    $('formTitle').textContent = 'Alta de categoría';
  }

  function fillForm(row) {
    $('categoria_id').value = row.categoria_id;
    $('clave').value = row.clave || '';
    $('nombre').value = row.nombre || '';
    $('vida_util_meses').value = row.vida_util_meses != null ? row.vida_util_meses : '';
    $('activo').checked = row.activo !== false;
    $('formTitle').textContent = 'Editar categoría';
  }

  async function onSave() {
    const id = $('categoria_id').value;
    const clave = $('clave').value.trim();
    const nombre = $('nombre').value.trim();
    const vida = $('vida_util_meses').value.trim();
    if (!clave)  { KoguApi.toast('La clave es obligatoria.', 'error'); return; }
    if (!nombre) { KoguApi.toast('El nombre es obligatorio.', 'error'); return; }
    if (vida && (!Number.isInteger(Number(vida)) || Number(vida) <= 0)) {
      KoguApi.toast('La vida útil debe ser un entero mayor que 0.', 'error'); return;
    }

    const payload = {
      clave, nombre,
      vida_util_meses: vida ? Number(vida) : null,
      activo: $('activo').checked,
    };

    await KoguUi.withLoading(this, async () => {
      try {
        if (id) {
          await KoguApi.apiFetch('/protected/act/categorias/' + id, {
            method: 'PUT', body: JSON.stringify(payload),
          });
          KoguApi.toast('Categoría actualizada', 'success');
        } else {
          await KoguApi.apiFetch('/protected/act/categorias', {
            method: 'POST', body: JSON.stringify(payload),
          });
          KoguApi.toast('Categoría creada', 'success');
        }
        closeModal();
        await load(false);
      } catch (_err) {
        // apiFetch ya mostró el toast (422 clave duplicada, etc.)
      }
    }, 'Guardando…');
  }

  function render() {
    const tbody = $('rows');
    if (!categorias.length) {
      const cols = canManage ? 5 : 4;
      tbody.innerHTML = `<tr><td colspan="${cols}" style="text-align:center;color:var(--muted);padding:24px">Sin categorías registradas.</td></tr>`;
      return;
    }
    tbody.innerHTML = categorias.map(r => `<tr>
      <td><strong>${esc(r.clave)}</strong></td>
      <td>${esc(r.nombre)}</td>
      <td style="text-align:center">${r.vida_util_meses != null ? KoguUi.int(r.vida_util_meses) : '<span class="muted">—</span>'}</td>
      <td style="text-align:center">${r.activo !== false ? '<span class="badge success">Sí</span>' : '<span class="badge neutral">No</span>'}</td>
      ${canManage ? `<td><button class="btn ghost" data-edit="${r.categoria_id}">Editar</button></td>` : ''}
    </tr>`).join('');

    if (canManage) {
      tbody.querySelectorAll('[data-edit]').forEach(btn => {
        btn.onclick = () => {
          const row = categorias.find(c => c.categoria_id === btn.dataset.edit);
          if (row) { fillForm(row); openModal(); }
        };
      });
    }
  }

  async function load(showToast) {
    try {
      const res = await KoguApi.apiFetch('/protected/act/categorias');
      categorias = KoguApi.unwrapRows(res, 'rows') || [];
      render();
      if (showToast) KoguApi.toast('Categorías actualizadas por cambio de empresa', 'success');
    } catch (_err) {
      categorias = [];
      render();
    }
  }

  // ── Bindings ────────────────────────────────────────────────────────────────
  buildModal();
  if (canManage) $('newBtn').onclick = () => { resetForm(); openModal(); };
  $('refreshBtn').onclick = () => load(false);

  KoguShell.subscribeEmpresaActivaChange(async () => { await load(true); });

  await load(false);
});

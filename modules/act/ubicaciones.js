// ============================================================
// ubicaciones.js
// Pantalla: Catálogo de Ubicaciones (módulo de Activos).
// Endpoint base: /protected/act/ubicaciones
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const b = await KoguShell.initShell({
    currentPage:        '/modules/act/ubicaciones.html',
    title:              'Ubicaciones',
    description:        'Catálogo de ubicaciones físicas del módulo de Activos (jerárquico).',
    requiredPermission: 'act.catalogos.read',
  });
  if (!b) return;

  const canManage = KoguShell.hasPerm(b, 'act.catalogos.manage');
  const TIPOS = ['planta', 'edificio', 'area', 'almacen', 'oficina', 'otro'];
  const esc = KoguUi.escapeHtml;

  let ubicaciones = [];

  document.getElementById('pageContent').innerHTML = `
<div class="card">
  <div class="row">
    <div><div class="eyebrow">Catálogo</div><h2>Ubicaciones</h2></div>
    <div style="display:flex;gap:8px">
      ${canManage ? '<button class="btn primary" id="newBtn">+ Nueva ubicación</button>' : ''}
      <button class="btn" id="refreshBtn">Actualizar</button>
    </div>
  </div>
  <div class="table-wrap" style="margin-top:16px">
    <table>
      <thead><tr>
        <th style="min-width:120px">Clave</th>
        <th style="min-width:220px">Nombre</th>
        <th>Tipo</th>
        <th>Ubicación padre</th>
        <th>Responsable</th>
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
    overlay.id = 'ubicModal';
    overlay.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:9999;align-items:flex-start;justify-content:center;padding:40px 20px 20px;backdrop-filter:blur(2px)';
    overlay.innerHTML = `
      <div style="width:100%;max-width:560px;max-height:88vh;background:white;border-radius:12px;box-shadow:0 20px 50px rgba(0,0,0,.3);display:flex;flex-direction:column;overflow:hidden;color:#0f172a">
        <div style="padding:16px 20px;border-bottom:1px solid var(--line,#e2e8f0);display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
          <div><div class="eyebrow">Formulario</div><h2 id="formTitle" style="margin:0;font-size:20px">Alta de ubicación</h2></div>
          <button class="btn ghost" id="closeModalBtn" style="padding:6px 10px;font-size:16px">✕</button>
        </div>
        <div style="flex:1;overflow-y:auto;padding:20px">
          <div class="stack">
            <input type="hidden" id="ubicacion_id" />
            <div class="grid-2">
              <div>
                <div class="label-text">Clave</div>
                <input class="input" id="clave" maxlength="30" placeholder="Ej. PLANTA-01" />
              </div>
              <div>
                <div class="label-text">Tipo</div>
                <select class="select" id="tipo">
                  <option value="">Selecciona…</option>
                  ${TIPOS.map(t => `<option value="${t}">${t}</option>`).join('')}
                </select>
              </div>
            </div>
            <div>
              <div class="label-text">Nombre</div>
              <input class="input" id="nombre" placeholder="Nombre de la ubicación" />
            </div>
            <div>
              <div class="label-text">Ubicación padre <span class="muted" style="font-size:11px">(opcional)</span></div>
              <select class="select" id="ubicacion_padre_id"><option value="">— ninguna (raíz) —</option></select>
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
  function openModal() { $('ubicModal').style.display = 'flex'; }
  function closeModal() { const m = $('ubicModal'); if (m) m.style.display = 'none'; }

  function fillParentOptions(excludeId) {
    const sel = $('ubicacion_padre_id');
    const opts = ['<option value="">— ninguna (raíz) —</option>'];
    ubicaciones
      .filter(u => u.ubicacion_id !== excludeId)
      .forEach(u => opts.push(`<option value="${u.ubicacion_id}">${esc(u.clave)} — ${esc(u.nombre)}</option>`));
    sel.innerHTML = opts.join('');
  }

  function resetForm() {
    $('ubicacion_id').value = '';
    $('clave').value = '';
    $('nombre').value = '';
    $('tipo').value = '';
    $('activo').checked = true;
    $('formTitle').textContent = 'Alta de ubicación';
    fillParentOptions(null);
  }

  function fillForm(row) {
    $('ubicacion_id').value = row.ubicacion_id;
    $('clave').value = row.clave || '';
    $('nombre').value = row.nombre || '';
    $('tipo').value = row.tipo || '';
    $('activo').checked = row.activo !== false;
    $('formTitle').textContent = 'Editar ubicación';
    fillParentOptions(row.ubicacion_id);
    $('ubicacion_padre_id').value = row.ubicacion_padre_id || '';
  }

  async function onSave() {
    const id = $('ubicacion_id').value;
    const clave = $('clave').value.trim();
    const nombre = $('nombre').value.trim();
    const tipo = $('tipo').value;
    if (!clave)  { KoguApi.toast('La clave es obligatoria.', 'error'); return; }
    if (!nombre) { KoguApi.toast('El nombre es obligatorio.', 'error'); return; }
    if (!tipo)   { KoguApi.toast('El tipo es obligatorio.', 'error'); return; }

    const payload = {
      clave, nombre, tipo,
      ubicacion_padre_id: $('ubicacion_padre_id').value || null,
      activo: $('activo').checked,
    };

    await KoguUi.withLoading(this, async () => {
      try {
        if (id) {
          await KoguApi.apiFetch('/protected/act/ubicaciones/' + id, {
            method: 'PUT', body: JSON.stringify(payload),
          });
          KoguApi.toast('Ubicación actualizada', 'success');
        } else {
          await KoguApi.apiFetch('/protected/act/ubicaciones', {
            method: 'POST', body: JSON.stringify(payload),
          });
          KoguApi.toast('Ubicación creada', 'success');
        }
        closeModal();
        await load(false);
      } catch (_err) {
        // apiFetch ya mostró el toast (422 clave duplicada, 403, 409, etc.)
      }
    }, 'Guardando…');
  }

  // ── Jerarquía: ordena raíces y luego hijos con indentación por profundidad ──
  function orderByTree(list) {
    const byParent = new Map();
    list.forEach(u => {
      const k = u.ubicacion_padre_id || '__root__';
      if (!byParent.has(k)) byParent.set(k, []);
      byParent.get(k).push(u);
    });
    const ids = new Set(list.map(u => u.ubicacion_id));
    const ordered = [];
    const visit = (parentKey, depth) => {
      (byParent.get(parentKey) || []).forEach(u => {
        ordered.push({ ...u, _depth: depth });
        visit(u.ubicacion_id, depth + 1);
      });
    };
    visit('__root__', 0);
    // Huérfanos (padre fuera del set por filtro/permiso): cuélgalos como raíz.
    list.forEach(u => {
      if (u.ubicacion_padre_id && !ids.has(u.ubicacion_padre_id) && !ordered.find(o => o.ubicacion_id === u.ubicacion_id)) {
        ordered.push({ ...u, _depth: 0 });
      }
    });
    return ordered;
  }

  function render() {
    const tbody = $('rows');
    if (!ubicaciones.length) {
      const cols = canManage ? 7 : 6;
      tbody.innerHTML = `<tr><td colspan="${cols}" style="text-align:center;color:var(--muted);padding:24px">Sin ubicaciones registradas.</td></tr>`;
      return;
    }
    const ordered = orderByTree(ubicaciones);
    tbody.innerHTML = ordered.map(r => {
      const indent = r._depth > 0 ? `style="padding-left:${r._depth * 18}px"` : '';
      const prefix = r._depth > 0 ? '↳ ' : '';
      return `<tr>
        <td><strong ${indent}>${prefix}${esc(r.clave)}</strong></td>
        <td>${esc(r.nombre)}</td>
        <td><span class="chip">${esc(r.tipo)}</span></td>
        <td>${r.padre_clave ? esc(r.padre_clave) + ' — ' + esc(r.padre_nombre || '') : '<span class="muted">—</span>'}</td>
        <td>${r.responsable_nombre ? esc(r.responsable_nombre) : '<span class="muted">—</span>'}</td>
        <td style="text-align:center">${r.activo !== false ? '<span class="badge success">Sí</span>' : '<span class="badge neutral">No</span>'}</td>
        ${canManage ? `<td><button class="btn ghost" data-edit="${r.ubicacion_id}">Editar</button></td>` : ''}
      </tr>`;
    }).join('');

    if (canManage) {
      tbody.querySelectorAll('[data-edit]').forEach(btn => {
        btn.onclick = () => {
          const row = ubicaciones.find(u => u.ubicacion_id === btn.dataset.edit);
          if (row) { fillForm(row); openModal(); }
        };
      });
    }
  }

  async function load(showToast) {
    try {
      const res = await KoguApi.apiFetch('/protected/act/ubicaciones');
      ubicaciones = KoguApi.unwrapRows(res, 'rows') || [];
      render();
      if (showToast) KoguApi.toast('Ubicaciones actualizadas por cambio de empresa', 'success');
    } catch (_err) {
      ubicaciones = [];
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

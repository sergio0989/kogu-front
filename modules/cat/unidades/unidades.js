document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/cat/unidades/unidades.html';
  const BASE = '/protected/cat/unidades';
  const PERM = 'screen.catalogos.unidades';

  const b = await KoguShell.initShell({ currentPage: PAGE, title: 'Unidades de Medida', description: 'Catálogo de unidades SAT y personalizadas por empresa.', requiredPermission: PERM });
  if (!b) return;

  const c = document.getElementById('pageContent');
  c.innerHTML = `
<div class="split">

  <!-- ── Lista ── -->
  <div class="card">
    <div class="row">
      <div><div class="eyebrow">Catálogo</div><h2>Unidades de Medida</h2></div>
      <button class="btn primary" id="refreshBtn">Actualizar</button>
    </div>
    <div class="grid-2" style="margin-top:16px">
      <input  class="input"  id="q"        placeholder="Buscar por clave o nombre" />
      <select class="select" id="tipoFil">
        <option value="">SAT + Personalizadas</option>
        <option value="sat">Solo SAT</option>
        <option value="custom">Solo personalizadas</option>
      </select>
    </div>
    <div class="table-wrap" style="margin-top:16px">
      <table><thead><tr>
        <th>Clave</th><th>Nombre</th><th>Símbolo</th><th>Clave SAT</th><th>Tipo</th><th>Estado</th><th></th>
      </tr></thead><tbody id="rowsUnidades"></tbody></table>
    </div>
  </div>

  <!-- ── Formulario ── -->
  <div class="card">
    <div class="row">
      <div><div class="eyebrow">Unidad personalizada</div><h2 id="unidadTitle">Nueva unidad</h2></div>
      <span class="chip" id="unidadChip">Alta</span>
    </div>
    <div style="background:var(--panel2); border:1px solid var(--line); border-radius:12px; padding:14px; margin:12px 0">
      <div style="font-size:12px; color:var(--muted)">
        ℹ️ Las unidades <strong>SAT</strong> son de solo lectura. Aquí puedes crear o editar
        unidades <strong>personalizadas</strong> para tu empresa.
      </div>
    </div>
    <div class="stack" style="margin-top:8px">
      <input type="hidden" id="unidadId" />
      <div class="grid-2" style="gap:12px">
        <div>
          <div class="label-text">Clave interna <span style="color:var(--danger)">*</span></div>
          <input class="input" id="uClave" placeholder="Ej: ROLLO" style="text-transform:uppercase" maxlength="20"/>
        </div>
        <div>
          <div class="label-text">Símbolo</div>
          <input class="input" id="uSimbolo" placeholder="Ej: rol" maxlength="10"/>
        </div>
      </div>
      <div>
        <div class="label-text">Nombre <span style="color:var(--danger)">*</span></div>
        <input class="input" id="uNombre" placeholder="Ej: Rollo" maxlength="100"/>
      </div>
      <div>
        <div class="label-text">Clave SAT equivalente</div>
        <input class="input" id="uClaveSat" placeholder="Ej: H87 (opcional)" maxlength="5" style="text-transform:uppercase"/>
      </div>
      <div>
        <div class="label-text">Estado</div>
        <select class="select" id="uActivo"><option value="true">Activo</option><option value="false">Inactivo</option></select>
      </div>
      <div class="page-actions">
        <button class="btn primary" id="saveUnidadBtn">Guardar</button>
        <button class="btn"         id="newUnidadBtn">Nueva</button>
      </div>
    </div>
  </div>

</div>`;

  let unidades = [];

  const val  = id => document.getElementById(id)?.value?.trim() ?? '';
  const sel  = id => document.getElementById(id)?.value ?? '';
  const setV = (id, v) => { const el = document.getElementById(id); if (el) el.value = v ?? ''; };

  function reset() {
    setV('unidadId', ''); setV('uClave', ''); setV('uNombre', ''); setV('uSimbolo', '');
    setV('uClaveSat', ''); setV('uActivo', 'true');
    document.getElementById('unidadTitle').textContent = 'Nueva unidad';
    document.getElementById('unidadChip').textContent  = 'Alta';
  }

  function fill(r) {
    if (r.es_sat) { KoguApi.toast('Las unidades SAT son de solo lectura.', 'error'); return; }
    setV('unidadId', r.unidad_id); setV('uClave', r.clave_interna); setV('uNombre', r.nombre);
    setV('uSimbolo', r.simbolo || ''); setV('uClaveSat', r.clave_sat || ''); setV('uActivo', String(!!r.activo));
    document.getElementById('unidadTitle').textContent = 'Editar: ' + r.nombre;
    document.getElementById('unidadChip').textContent  = 'Edición';
  }

  async function load(showToast = false) {
    const res = await KoguApi.apiFetch(BASE);
    unidades  = KoguApi.unwrapRows(res);
    render();
    if (showToast) KoguApi.toast('Unidades actualizadas', 'success');
  }

  function render() {
    const q  = val('q').toLowerCase();
    const tf = sel('tipoFil');
    const filtered = unidades.filter(r => {
      const txt = `${r.clave_interna} ${r.nombre} ${r.clave_sat || ''}`.toLowerCase();
      const okQ = !q || txt.includes(q);
      const okT = tf === '' || (tf === 'sat' ? r.es_sat : !r.es_sat);
      return okQ && okT;
    });
    document.getElementById('rowsUnidades').innerHTML = filtered.length
      ? filtered.map(r => `
          <tr>
            <td><span class="chip-compact">${KoguUi.escapeHtml(r.clave_interna)}</span></td>
            <td>${KoguUi.escapeHtml(r.nombre)}</td>
            <td style="color:var(--muted)">${KoguUi.escapeHtml(r.simbolo || '-')}</td>
            <td style="color:var(--muted)">${KoguUi.escapeHtml(r.clave_sat || '-')}</td>
            <td>${r.es_sat ? '<span class="badge primary">SAT</span>' : '<span class="badge neutral">Custom</span>'}</td>
            <td>${KoguUi.statusBadge(r.activo ? 'activo' : 'inactivo')}</td>
            <td>${r.es_sat ? '' : `<button class="btn btn-edit" data-id="${r.unidad_id}">Editar</button>`}</td>
          </tr>`).join('')
      : '<tr><td colspan="7" class="empty">Sin unidades</td></tr>';
    document.querySelectorAll('.btn-edit').forEach(x => x.onclick = () => {
      const row = unidades.find(r => r.unidad_id === x.dataset.id);
      if (row) fill(row);
    });
  }

  document.getElementById('saveUnidadBtn').onclick = async (e) => {
    await KoguUi.withLoading(e.target, async () => {
      try {
        const id      = val('unidadId');
        const payload = {
          clave_interna: val('uClave').toUpperCase(),
          nombre:        val('uNombre'),
          simbolo:       val('uSimbolo') || undefined,
          clave_sat:     val('uClaveSat').toUpperCase() || undefined,
          activo:        sel('uActivo') === 'true',
        };
        if (!payload.clave_interna) throw new Error('Clave interna es obligatoria.');
        if (!payload.nombre)        throw new Error('Nombre es obligatorio.');
        if (id) {
          await KoguApi.apiFetch(`${BASE}/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
          KoguApi.toast('Unidad actualizada', 'success');
        } else {
          await KoguApi.apiFetch(BASE, { method: 'POST', body: JSON.stringify(payload) });
          KoguApi.toast('Unidad creada', 'success');
        }
        reset(); await load();
      } catch (err) { KoguApi.toast(err.message, 'error'); }
    }, 'Guardando...');
  };

  document.getElementById('refreshBtn').onclick  = () => load(false);
  document.getElementById('newUnidadBtn').onclick = reset;
  document.getElementById('q').oninput           = render;
  document.getElementById('tipoFil').onchange    = render;

  KoguShell.subscribeEmpresaActivaChange(async () => { reset(); await load(true); });
  await load();
});

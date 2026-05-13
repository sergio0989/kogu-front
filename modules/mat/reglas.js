// ============================================================
// reglas.js
// CRUD de reglas de materialidad por empresa.
// Sub-proyecto: materialidad-v1 — Iteración 1.
// ============================================================

const TIPOS_EVIDENCIA = [
  'contrato_especifico','orden_compra','recepcion_fisica','bitacora_entrada',
  'foto_recepcion','coa_lote','inspeccion_qa','rep_pago','correo',
  'acta_entrega','comprobante_servicio','reporte_actividades','otro',
];

document.addEventListener('DOMContentLoaded', async () => {
  const b = await KoguShell.initShell({
    currentPage:        '/modules/mat/reglas.html',
    title:              'Reglas de materialidad',
    description:        'Configura qué evidencias se exigen por tipo de CFDI, scope y rango de monto. Aplican al cálculo del score.',
    requiredPermission: 'screen.mat.reglas',
  });
  if (!b) return;

  document.getElementById('pageContent').innerHTML = `
<div class="split">

  <!-- Listado -->
  <div class="card">
    <div class="row">
      <div><div class="eyebrow">Listado</div><h2>Reglas</h2></div>
      <button class="btn primary" id="refreshBtn">Actualizar</button>
    </div>
    <div class="table-wrap" style="margin-top:16px">
      <table><thead><tr>
        <th>Nombre</th><th>Tipo CFDI</th><th>Scope</th><th>Rango monto</th>
        <th>Evidencias</th><th>Razón negocio</th><th>Activa</th><th>Pri.</th><th>Acción</th>
      </tr></thead><tbody id="rows"></tbody></table>
    </div>
  </div>

  <!-- Formulario -->
  <div class="card">
    <div class="row">
      <div><div class="eyebrow">Formulario</div><h2 id="formTitle">Nueva regla</h2></div>
      <span class="chip" id="modeChip">Alta</span>
    </div>
    <div class="stack" style="margin-top:16px">
      <input type="hidden" id="regla_id"/>
      <div><div class="label-text">Nombre</div><input class="input" id="nombre"/></div>
      <div><div class="label-text">Descripción</div><textarea class="input" id="descripcion" rows="2"></textarea></div>

      <div class="grid-2">
        <div>
          <div class="label-text">Tipo CFDI</div>
          <select class="select" id="tipo_cfdi">
            <option value="">Cualquiera</option>
            <option value="I">Ingreso</option><option value="E">Egreso</option>
            <option value="T">Traslado</option><option value="P">Pago (REP)</option>
            <option value="N">Nómina</option>
          </select>
        </div>
        <div>
          <div class="label-text">Scope</div>
          <select class="select" id="scope">
            <option value="ambos">Ambos</option>
            <option value="emitido">Emitido</option>
            <option value="recibido">Recibido</option>
          </select>
        </div>
      </div>

      <div class="grid-2">
        <div><div class="label-text">Monto mínimo</div><input class="input" id="monto_min" type="number" step="0.01"/></div>
        <div><div class="label-text">Monto máximo</div><input class="input" id="monto_max" type="number" step="0.01"/></div>
      </div>

      <div>
        <div class="label-text">Clave producto (pattern ILIKE) <span class="muted" style="font-size:11px">ej. <code>84%</code> para servicios</span></div>
        <input class="input" id="clave_prod_pattern" placeholder="opcional, ej. 84%"/>
      </div>

      <div>
        <div class="label-text">Evidencias requeridas <span class="muted" style="font-size:11px">(selecciona varias)</span></div>
        <select class="select" id="evidencias_requeridas" multiple size="6">
          ${TIPOS_EVIDENCIA.map(t => `<option value="${t}">${t}</option>`).join('')}
        </select>
      </div>

      <div class="grid-2">
        <div>
          <div class="label-text">Requiere razón de negocio</div>
          <select class="select" id="requiere_razon_negocio">
            <option value="false">No</option>
            <option value="true">Sí</option>
          </select>
        </div>
        <div>
          <div class="label-text">Prioridad <span class="muted" style="font-size:11px">(menor número = más prioritaria)</span></div>
          <input class="input" id="prioridad" type="number" value="100"/>
        </div>
      </div>

      <div>
        <div class="label-text">Activa</div>
        <select class="select" id="activo">
          <option value="true">Sí</option>
          <option value="false">No</option>
        </select>
      </div>

      <div class="page-actions">
        <button class="btn primary" id="saveBtn">Guardar</button>
        <button class="btn" id="newBtn">Nueva</button>
      </div>
    </div>
  </div>

</div>`;

  const $ = id => document.getElementById(id);
  const val = id => $(id).value.trim();

  let rows = [];

  async function load() {
    const res = await KoguApi.apiFetch('/protected/mat/reglas');
    rows = KoguApi.unwrapRows(res) || [];
    render();
  }

  function render() {
    $('rows').innerHTML = rows.length ? rows.map(r => {
      const ev = Array.isArray(r.evidencias_requeridas) ? r.evidencias_requeridas : [];
      const rango = (r.monto_min || r.monto_max)
        ? `${r.monto_min || 0} - ${r.monto_max || '∞'}`
        : 'Cualquiera';
      return `
        <tr>
          <td><strong>${KoguUi.escapeHtml(r.nombre)}</strong></td>
          <td>${r.tipo_cfdi || '—'}</td>
          <td>${r.scope || ''}</td>
          <td style="font-size:12px">${rango}</td>
          <td style="font-size:11px">${ev.map(t => `<span class="chip">${t}</span>`).join(' ')}</td>
          <td>${r.requiere_razon_negocio ? 'Sí' : 'No'}</td>
          <td>${KoguUi.statusBadge(r.activo ? 'activo' : 'inactivo')}</td>
          <td>${r.prioridad}</td>
          <td><button class="btn btn-edit" data-id="${r.regla_id}">Editar</button></td>
        </tr>`;
    }).join('') : '<tr><td colspan="9" class="empty">Sin reglas configuradas</td></tr>';

    document.querySelectorAll('.btn-edit').forEach(btn => btn.onclick = () => {
      const row = rows.find(r => String(r.regla_id) === btn.dataset.id);
      if (row) fill(row);
    });
  }

  function reset() {
    ['regla_id','nombre','descripcion','monto_min','monto_max','clave_prod_pattern'].forEach(id => $(id).value = '');
    $('tipo_cfdi').value = '';
    $('scope').value = 'ambos';
    $('requiere_razon_negocio').value = 'false';
    $('prioridad').value = '100';
    $('activo').value = 'true';
    const sel = $('evidencias_requeridas');
    for (const opt of sel.options) opt.selected = false;
    $('formTitle').textContent = 'Nueva regla';
    $('modeChip').textContent = 'Alta';
  }

  function fill(r) {
    $('regla_id').value = r.regla_id;
    $('nombre').value = r.nombre || '';
    $('descripcion').value = r.descripcion || '';
    $('tipo_cfdi').value = r.tipo_cfdi || '';
    $('scope').value = r.scope || 'ambos';
    $('monto_min').value = r.monto_min ?? '';
    $('monto_max').value = r.monto_max ?? '';
    $('clave_prod_pattern').value = r.clave_prod_pattern || '';
    $('requiere_razon_negocio').value = r.requiere_razon_negocio ? 'true' : 'false';
    $('prioridad').value = r.prioridad ?? 100;
    $('activo').value = r.activo ? 'true' : 'false';

    const ev = Array.isArray(r.evidencias_requeridas) ? r.evidencias_requeridas.map(String) : [];
    const sel = $('evidencias_requeridas');
    for (const opt of sel.options) opt.selected = ev.includes(opt.value);

    $('formTitle').textContent = 'Editar regla';
    $('modeChip').textContent = 'Edición';
  }

  $('saveBtn').onclick = async () => {
    try {
      const nombre = val('nombre');
      if (!nombre) throw new Error('Nombre es obligatorio.');

      const sel = $('evidencias_requeridas');
      const evidencias = Array.from(sel.selectedOptions).map(o => o.value);
      if (evidencias.length === 0) throw new Error('Selecciona al menos una evidencia requerida.');

      const payload = {
        nombre,
        descripcion: val('descripcion') || null,
        tipo_cfdi:   $('tipo_cfdi').value || null,
        scope:       $('scope').value,
        monto_min:   val('monto_min') ? Number(val('monto_min')) : null,
        monto_max:   val('monto_max') ? Number(val('monto_max')) : null,
        clave_prod_pattern: val('clave_prod_pattern') || null,
        evidencias_requeridas: evidencias,
        requiere_razon_negocio: $('requiere_razon_negocio').value === 'true',
        prioridad: Number(val('prioridad') || 100),
        activo:    $('activo').value === 'true',
      };

      const id = $('regla_id').value;
      if (id) {
        await KoguApi.apiFetch('/protected/mat/reglas/' + id, { method: 'PUT', body: JSON.stringify(payload) });
        KoguApi.toast('Regla actualizada', 'success');
      } else {
        await KoguApi.apiFetch('/protected/mat/reglas', { method: 'POST', body: JSON.stringify(payload) });
        KoguApi.toast('Regla creada', 'success');
      }
      reset();
      await load();
    } catch (e) { KoguApi.toast(e.message, 'error'); }
  };

  $('refreshBtn').onclick = load;
  $('newBtn').onclick = reset;

  KoguShell.subscribeEmpresaActivaChange(load);
  reset();
  await load();
});

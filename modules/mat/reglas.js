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
<div class="card">
  <div class="row">
    <div><div class="eyebrow">Listado</div><h2>Reglas</h2></div>
    <div style="display:flex;gap:8px">
      <button class="btn primary" id="newBtn">+ Nueva regla</button>
      <button class="btn" id="refreshBtn">Actualizar</button>
    </div>
  </div>
  <div class="table-wrap" style="margin-top:16px">
    <table><thead><tr>
      <th style="min-width:180px">Nombre</th>
      <th style="white-space:nowrap">Tipo CFDI</th>
      <th>Scope</th>
      <th style="min-width:140px;white-space:nowrap">Rango monto</th>
      <th style="min-width:200px">Evidencias</th>
      <th style="white-space:nowrap">Razón neg.</th>
      <th>Activa</th>
      <th style="text-align:center">Pri.</th>
      <th style="white-space:nowrap">Acción</th>
    </tr></thead><tbody id="rows"></tbody></table>
  </div>
</div>`;

  const $ = id => document.getElementById(id);
  const val = id => $(id).value.trim();

  let rows = [];

  // ── Modal ─────────────────────────────────────────────────────────────────
  function buildModal() {
    const overlay = document.createElement('div');
    overlay.id = 'reglaModal';
    overlay.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:9999;align-items:flex-start;justify-content:center;padding:40px 20px 20px;backdrop-filter:blur(2px)';

    overlay.innerHTML = `
      <div style="width:100%;max-width:660px;max-height:88vh;background:white;border-radius:12px;box-shadow:0 20px 50px rgba(0,0,0,.3);display:flex;flex-direction:column;overflow:hidden;color:#0f172a">
        <!-- Header -->
        <div style="padding:16px 20px;border-bottom:1px solid var(--line,#e2e8f0);display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
          <div>
            <div class="eyebrow">Formulario</div>
            <h2 id="formTitle" style="margin:0;font-size:20px">Nueva regla</h2>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <span class="chip" id="modeChip">Alta</span>
            <button class="btn ghost" id="closeModalBtn" style="padding:6px 10px;font-size:16px">✕</button>
          </div>
        </div>
        <!-- Body -->
        <div style="flex:1;overflow-y:auto;padding:20px">
          <div class="stack">
            <input type="hidden" id="regla_id"/>

            <div>
              <div class="label-text">Nombre</div>
              <input class="input" id="nombre" placeholder="Nombre descriptivo de la regla…"/>
            </div>

            <div>
              <div class="label-text">Descripción</div>
              <textarea class="input" id="descripcion" rows="2" placeholder="Descripción opcional…"></textarea>
            </div>

            <div class="grid-2">
              <div>
                <div class="label-text">Tipo CFDI</div>
                <select class="select" id="tipo_cfdi">
                  <option value="">Cualquiera</option>
                  <option value="I">I — Ingreso</option>
                  <option value="E">E — Egreso</option>
                  <option value="T">T — Traslado</option>
                  <option value="P">P — Pago (REP)</option>
                  <option value="N">N — Nómina</option>
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
              <div>
                <div class="label-text">Monto mínimo</div>
                <input class="input" id="monto_min" type="number" step="0.01" min="0" placeholder="0"/>
              </div>
              <div>
                <div class="label-text">Monto máximo</div>
                <input class="input" id="monto_max" type="number" step="0.01" min="0" placeholder="sin límite"/>
              </div>
            </div>

            <div>
              <div class="label-text">Clave producto (pattern ILIKE) <span class="muted" style="font-size:11px">ej. <code>84%</code> para servicios</span></div>
              <input class="input" id="clave_prod_pattern" placeholder="opcional, ej. 84%"/>
            </div>

            <div>
              <div class="label-text">Evidencias requeridas <span class="muted" style="font-size:11px">(selecciona varias)</span></div>
              <select class="select" id="evidencias_requeridas" multiple size="7"
                      style="height:auto;padding:4px 0">
                ${TIPOS_EVIDENCIA.map(t => `<option value="${t}" style="padding:5px 10px">${KoguUi.evidenciaLabel(t)}</option>`).join('')}
              </select>
              <div class="muted" style="font-size:11px;margin-top:4px">Ctrl+clic (o Cmd+clic en Mac) para seleccionar varias</div>
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
                <div class="label-text">Prioridad <span class="muted" style="font-size:11px">(menor = más prioritaria)</span></div>
                <input class="input" id="prioridad" type="number" value="100" min="1"/>
              </div>
            </div>

            <div>
              <div class="label-text">Activa</div>
              <select class="select" id="activo">
                <option value="true">Sí — aplica al cálculo del score</option>
                <option value="false">No — desactivada</option>
              </select>
            </div>
          </div>
        </div>
        <!-- Footer -->
        <div style="padding:14px 20px;border-top:1px solid var(--line,#e2e8f0);display:flex;gap:8px;justify-content:flex-end;flex-shrink:0">
          <button class="btn" id="cancelModalBtn">Cancelar</button>
          <button class="btn primary" id="saveBtn">Guardar</button>
        </div>
      </div>`;

    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && overlay.style.display !== 'none') closeModal();
    });
  }

  function openModal() { document.getElementById('reglaModal').style.display = 'flex'; }
  function closeModal() { document.getElementById('reglaModal').style.display = 'none'; }

  buildModal();

  // ── Load / render ─────────────────────────────────────────────────────────
  async function load() {
    const res = await KoguApi.apiFetch('/protected/mat/reglas');
    rows = KoguApi.unwrapRows(res) || [];
    render();
  }

  function evidenciasHtml(ev) {
    if (!ev || ev.length === 0) return '<span class="muted" style="font-size:12px">—</span>';
    const chips = ev.map(t =>
      `<span class="chip" style="font-size:11px;white-space:nowrap">${KoguUi.evidenciaLabel(t)}</span>`
    ).join('');
    return `<div style="display:flex;flex-wrap:wrap;gap:3px;align-items:center">${chips}</div>`;
  }

  function rangoHtml(min, max) {
    if (!min && !max) return '<span class="muted" style="font-size:12px">Cualquiera</span>';
    const lo = min != null ? Number(min).toLocaleString('es-MX') : '0';
    const hi = max != null ? Number(max).toLocaleString('es-MX') : '∞';
    return `<span style="font-size:12px;white-space:nowrap">${lo} – ${hi}</span>`;
  }

  function render() {
    $('rows').innerHTML = rows.length ? rows.map(r => {
      const ev = Array.isArray(r.evidencias_requeridas) ? r.evidencias_requeridas : [];
      const tipoCfdi = r.tipo_cfdi
        ? `<span class="chip" style="font-family:monospace;font-size:12px">${r.tipo_cfdi}</span>`
        : '<span class="muted" style="font-size:12px">Cualquiera</span>';
      const scopeChip = r.scope
        ? `<span class="chip" style="font-size:11px">${r.scope}</span>`
        : '<span class="muted">—</span>';
      const activaBadge = r.activo
        ? '<span class="chip" style="background:#16a34a1a;color:#16a34a;border:1px solid #16a34a55;font-size:11px">Sí</span>'
        : '<span class="chip" style="background:#dc26261a;color:#dc2626;border:1px solid #dc262655;font-size:11px">No</span>';
      return `
        <tr>
          <td style="min-width:180px">
            <div style="font-weight:600;line-height:1.3">${KoguUi.escapeHtml(r.nombre)}</div>
            ${r.descripcion ? `<div class="muted" style="font-size:11px;margin-top:2px;line-height:1.3">${KoguUi.escapeHtml(r.descripcion)}</div>` : ''}
          </td>
          <td style="text-align:center">${tipoCfdi}</td>
          <td>${scopeChip}</td>
          <td>${rangoHtml(r.monto_min, r.monto_max)}</td>
          <td>${evidenciasHtml(ev)}</td>
          <td style="text-align:center">${r.requiere_razon_negocio ? 'Sí' : '<span class="muted">No</span>'}</td>
          <td style="text-align:center">${activaBadge}</td>
          <td style="text-align:center;font-weight:600">${r.prioridad}</td>
          <td>
            <button class="btn sm btn-edit" data-id="${r.regla_id}" style="white-space:nowrap">Editar</button>
          </td>
        </tr>`;
    }).join('') : '<tr><td colspan="9" class="empty">Sin reglas configuradas</td></tr>';

    document.querySelectorAll('.btn-edit').forEach(btn => btn.onclick = () => {
      const row = rows.find(r => String(r.regla_id) === btn.dataset.id);
      if (row) { fill(row); openModal(); }
    });
  }

  // ── Form helpers ──────────────────────────────────────────────────────────
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
    $('modeChip').textContent  = 'Alta';
  }

  function fill(r) {
    $('regla_id').value            = r.regla_id;
    $('nombre').value              = r.nombre              || '';
    $('descripcion').value         = r.descripcion         || '';
    $('tipo_cfdi').value           = r.tipo_cfdi           || '';
    $('scope').value               = r.scope               || 'ambos';
    $('monto_min').value           = r.monto_min           ?? '';
    $('monto_max').value           = r.monto_max           ?? '';
    $('clave_prod_pattern').value  = r.clave_prod_pattern  || '';
    $('requiere_razon_negocio').value = r.requiere_razon_negocio ? 'true' : 'false';
    $('prioridad').value           = r.prioridad           ?? 100;
    $('activo').value              = r.activo ? 'true' : 'false';

    const ev = Array.isArray(r.evidencias_requeridas) ? r.evidencias_requeridas.map(String) : [];
    const sel = $('evidencias_requeridas');
    for (const opt of sel.options) opt.selected = ev.includes(opt.value);

    $('formTitle').textContent = 'Editar regla';
    $('modeChip').textContent  = 'Edición';
  }

  // ── Eventos ───────────────────────────────────────────────────────────────
  $('refreshBtn').onclick     = load;
  $('newBtn').onclick         = () => { reset(); openModal(); };
  $('closeModalBtn').onclick  = closeModal;
  $('cancelModalBtn').onclick = closeModal;

  // ── Guardar ───────────────────────────────────────────────────────────────
  $('saveBtn').onclick = async function () {
    const nombre = val('nombre');
    if (!nombre) { KoguApi.toast('Nombre es obligatorio.', 'error'); return; }

    const sel = $('evidencias_requeridas');
    const evidencias = Array.from(sel.selectedOptions).map(o => o.value);
    if (evidencias.length === 0) { KoguApi.toast('Selecciona al menos una evidencia requerida.', 'error'); return; }

    await KoguUi.withLoading(this, async () => {
      try {
        const payload = {
          nombre,
          descripcion:            val('descripcion')         || null,
          tipo_cfdi:              $('tipo_cfdi').value       || null,
          scope:                  $('scope').value,
          monto_min:              val('monto_min')  ? Number(val('monto_min'))  : null,
          monto_max:              val('monto_max')  ? Number(val('monto_max'))  : null,
          clave_prod_pattern:     val('clave_prod_pattern')  || null,
          evidencias_requeridas:  evidencias,
          requiere_razon_negocio: $('requiere_razon_negocio').value === 'true',
          prioridad:              Number(val('prioridad') || 100),
          activo:                 $('activo').value === 'true',
        };

        const id = $('regla_id').value;
        if (id) {
          await KoguApi.apiFetch('/protected/mat/reglas/' + id, { method: 'PUT', body: JSON.stringify(payload) });
          KoguApi.toast('Regla actualizada', 'success');
        } else {
          await KoguApi.apiFetch('/protected/mat/reglas', { method: 'POST', body: JSON.stringify(payload) });
          KoguApi.toast('Regla creada', 'success');
        }
        closeModal();
        await load();
      } catch (e) { KoguApi.toast(e.message, 'error'); }
    }, 'Guardando…');
  };

  // ── Cambio de empresa ─────────────────────────────────────────────────────
  KoguShell.subscribeEmpresaActivaChange(load);

  // ── Carga inicial ─────────────────────────────────────────────────────────
  reset();
  await load();
});

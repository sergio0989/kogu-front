// ============================================================
// casos.js
// Listado + alta de casos de operación (Materialidad — Iteración 1).
// Endpoint base: /protected/mat/casos
// ============================================================

const TIPO_CASO_LABELS = {
  compra_unica:        'Compra única',
  compra_proyecto:     'Compra / proyecto',
  contrato_marco:      'Contrato marco',
  servicio_recurrente: 'Servicio recurrente',
  intercompania:       'Intercompañía',
  activo_fijo:         'Activo fijo',
  defensa_69b:         'Defensa 69-B',
  auditoria_fiscal:    'Auditoría fiscal',
  otro:                'Otro',
};

const STATUS_LABELS = {
  abierto:    'Abierto',
  en_armado:  'En armado',
  completo:   'Completo',
  cerrado:    'Cerrado',
  archivado:  'Archivado',
};

document.addEventListener('DOMContentLoaded', async () => {
  const b = await KoguShell.initShell({
    currentPage:        '/modules/mat/casos.html',
    title:              'Casos de operación',
    description:        'Agrupa CFDI relacionados (compra, proyecto, contrato marco, defensa 69-B) bajo un solo expediente fiscal.',
    requiredPermission: 'screen.mat.casos',
  });
  if (!b) return;

  document.getElementById('pageContent').innerHTML = `
<div class="card">
  <div class="row">
    <div><div class="eyebrow">Listado</div><h2>Casos</h2></div>
    <div style="display:flex;gap:8px">
      <button class="btn primary" id="newBtn">+ Nuevo caso</button>
      <button class="btn" id="refreshBtn">Actualizar</button>
    </div>
  </div>
  <div class="grid-3" style="margin-top:16px">
    <input class="input" id="q" placeholder="Buscar por nombre o descripción…" />
    <select class="select" id="fStatus">
      <option value="">Todos los estados</option>
      ${Object.entries(STATUS_LABELS).map(([k,v]) => `<option value="${k}">${v}</option>`).join('')}
    </select>
    <select class="select" id="fTipo">
      <option value="">Todos los tipos</option>
      ${Object.entries(TIPO_CASO_LABELS).map(([k,v]) => `<option value="${k}">${v}</option>`).join('')}
    </select>
  </div>
  <div class="table-wrap" style="margin-top:16px">
    <table><thead><tr>
      <th style="min-width:200px">Nombre</th>
      <th style="min-width:140px">Tipo</th>
      <th style="min-width:180px">Tercero</th>
      <th style="text-align:center;min-width:60px">CFDI</th>
      <th style="text-align:right;min-width:110px;white-space:nowrap">Monto</th>
      <th>Status</th>
      <th style="white-space:nowrap">Acciones</th>
    </tr></thead><tbody id="rows"></tbody></table>
  </div>
</div>`;

  const $ = id => document.getElementById(id);
  const val = id => $(id).value.trim();

  let rows = [];
  let expedientes = [];

  // ── Badge de status ───────────────────────────────────────────────────────
  function statusBadge(s) {
    const c = s === 'completo'  ? '#16a34a'
            : s === 'en_armado' ? '#ca8a04'
            : s === 'abierto'   ? '#0ea5e9'
            : s === 'cerrado'   ? '#64748b'
            : '#94a3b8';
    return `<span class="chip" style="background:${c}1a;color:${c};border:1px solid ${c}55">${STATUS_LABELS[s] || s}</span>`;
  }

  // ── Modal ─────────────────────────────────────────────────────────────────
  function buildModal() {
    const overlay = document.createElement('div');
    overlay.id = 'casoModal';
    overlay.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:9999;align-items:flex-start;justify-content:center;padding:40px 20px 20px;backdrop-filter:blur(2px)';

    overlay.innerHTML = `
      <div style="width:100%;max-width:620px;max-height:88vh;background:white;border-radius:12px;box-shadow:0 20px 50px rgba(0,0,0,.3);display:flex;flex-direction:column;overflow:hidden;color:#0f172a">
        <!-- Header -->
        <div style="padding:16px 20px;border-bottom:1px solid var(--line,#e2e8f0);display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
          <div>
            <div class="eyebrow">Formulario</div>
            <h2 id="formTitle" style="margin:0;font-size:20px">Alta de caso</h2>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <span class="chip" id="modeChip">Alta</span>
            <button class="btn ghost" id="closeModalBtn" style="padding:6px 10px;font-size:16px">✕</button>
          </div>
        </div>
        <!-- Body -->
        <div style="flex:1;overflow-y:auto;padding:20px">
          <div class="stack">
            <input type="hidden" id="caso_id"/>

            <div>
              <div class="label-text">Nombre</div>
              <input class="input" id="nombre" placeholder="Nombre del caso…"/>
            </div>

            <div>
              <div class="label-text">Descripción</div>
              <textarea class="input" id="descripcion" rows="2" placeholder="Descripción breve (opcional)"></textarea>
            </div>

            <div>
              <div class="label-text">Tipo de caso</div>
              <select class="select" id="tipo_caso">
                <option value="">Selecciona…</option>
                ${Object.entries(TIPO_CASO_LABELS).map(([k,v]) => `<option value="${k}">${v}</option>`).join('')}
              </select>
            </div>

            <div>
              <div class="label-text">Expediente tercero <span class="muted" style="font-size:11px">(opcional)</span></div>
              <div style="display:flex;gap:6px">
                <input class="input" id="expediente_label" readonly placeholder="— ninguno —"
                       style="flex:1;cursor:pointer;background:#f8fafc;text-overflow:ellipsis;overflow:hidden;white-space:nowrap" title=""/>
                <button type="button" class="btn ghost" id="expediente_pick" style="flex-shrink:0">Buscar…</button>
                <button type="button" class="btn ghost" id="expediente_clear" title="Limpiar" style="flex-shrink:0;padding:7px 10px">×</button>
              </div>
              <input type="hidden" id="expediente_tercero_id"/>
            </div>

            <div class="grid-2">
              <div>
                <div class="label-text">Monto total</div>
                <input class="input" id="monto_total" type="number" step="0.01" min="0" placeholder="0.00"/>
              </div>
              <div>
                <div class="label-text">Moneda</div>
                <input class="input" id="moneda" maxlength="3" value="MXN"/>
              </div>
            </div>

            <div class="grid-2">
              <div>
                <div class="label-text">Fecha inicio</div>
                <input class="input" id="fecha_inicio" type="date"/>
              </div>
              <div>
                <div class="label-text">Fecha fin</div>
                <input class="input" id="fecha_fin" type="date"/>
              </div>
            </div>

            <div>
              <div class="label-text">Status</div>
              <select class="select" id="status">
                ${Object.entries(STATUS_LABELS).map(([k,v]) => `<option value="${k}">${v}</option>`).join('')}
              </select>
            </div>
          </div>
        </div>
        <!-- Footer -->
        <div style="padding:14px 20px;border-top:1px solid var(--line,#e2e8f0);display:flex;gap:8px;justify-content:flex-end;flex-shrink:0">
          <button class="btn" id="detalleBtn" style="display:none;margin-right:auto">Abrir detalle →</button>
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

  function openModal() { document.getElementById('casoModal').style.display = 'flex'; }
  function closeModal() { document.getElementById('casoModal').style.display = 'none'; }

  buildModal();

  // ── Expediente picker ─────────────────────────────────────────────────────
  async function loadExpedientes() {
    try {
      const res = await KoguApi.apiFetch('/protected/exp/expedientes');
      expedientes = KoguApi.unwrapRows(res) || [];
    } catch (e) { /* sin permisos exp_, no es crítico */ }
  }

  function pickExpediente() {
    KoguUi.openSearchPicker({
      title: 'Vincular expediente del tercero',
      items: expedientes,
      placeholder: 'Buscar por RFC, nombre o tipo…',
      columns: [
        { key: 'nombre',       label: 'Nombre',  primary: true },
        { key: 'rfc',          label: 'RFC' },
        { key: 'tercero_tipo', label: 'Tipo' },
        { key: 'nivel_riesgo', label: 'Nivel' },
      ],
      emptyText: expedientes.length === 0
        ? 'No hay expedientes registrados en esta empresa. Crea uno en Materialidad → Expedientes.'
        : 'Sin coincidencias',
      onSelect: (e) => {
        $('expediente_tercero_id').value = e.expediente_id;
        const label = (e.nombre || '') + (e.rfc ? ' · ' + e.rfc : '');
        $('expediente_label').value = label;
        $('expediente_label').title = label;
      },
    });
  }

  function clearExpediente() {
    $('expediente_tercero_id').value = '';
    $('expediente_label').value = '';
    $('expediente_label').title = '';
  }

  // ── Load / render ─────────────────────────────────────────────────────────
  async function load() {
    const p = new URLSearchParams();
    if (val('q'))            p.set('q', val('q'));
    if ($('fStatus').value)  p.set('status', $('fStatus').value);
    if ($('fTipo').value)    p.set('tipo_caso', $('fTipo').value);
    const qs = p.toString() ? `?${p}` : '';
    const res = await KoguApi.apiFetch('/protected/mat/casos' + qs);
    rows = KoguApi.unwrapRows(res) || [];
    render();
  }

  function render() {
    $('rows').innerHTML = rows.length ? rows.map(r => `
      <tr>
        <td style="font-size:13px;max-width:220px">
          <div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600"
               title="${KoguUi.escapeHtml(r.nombre||'')}">${KoguUi.escapeHtml(r.nombre||'')}</div>
          ${r.descripcion ? `<div class="muted" style="font-size:11px;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
                                  title="${KoguUi.escapeHtml(r.descripcion)}">${KoguUi.escapeHtml(r.descripcion)}</div>` : ''}
        </td>
        <td><span class="chip">${KoguUi.escapeHtml(TIPO_CASO_LABELS[r.tipo_caso] || r.tipo_caso || '—')}</span></td>
        <td style="font-size:12px;max-width:180px">
          ${r.expediente_rfc ? `
            <div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600"
                 title="${KoguUi.escapeHtml(r.expediente_nombre||'')}">${KoguUi.escapeHtml(r.expediente_nombre||'')}</div>
            <div style="font-family:monospace;font-size:11px;color:var(--muted,#64748b)">${KoguUi.escapeHtml(r.expediente_rfc)}</div>
          ` : '<span class="muted" style="font-size:12px">— sin expediente —</span>'}
        </td>
        <td style="text-align:center;font-weight:600">${r.cfdi_count || 0}</td>
        <td style="text-align:right;white-space:nowrap;font-weight:600">${KoguUi.fmtMoney(r.monto_total, r.moneda)}</td>
        <td>${statusBadge(r.status)}</td>
        <td>
          <div class="actions-cell" style="flex-wrap:nowrap">
            <button class="btn sm btn-edit" data-id="${r.caso_id}" style="white-space:nowrap">Editar</button>
            <a class="btn sm" href="/modules/mat/caso-detalle.html?id=${encodeURIComponent(r.caso_id)}" style="white-space:nowrap">Detalle</a>
          </div>
        </td>
      </tr>
    `).join('') : '<tr><td colspan="7" class="empty">Sin casos creados</td></tr>';

    document.querySelectorAll('.btn-edit').forEach(btn => btn.onclick = () => {
      const row = rows.find(r => String(r.caso_id) === btn.dataset.id);
      if (row) { fill(row); openModal(); }
    });
  }

  // ── Form helpers ──────────────────────────────────────────────────────────
  function reset() {
    ['caso_id','nombre','descripcion','monto_total','fecha_inicio','fecha_fin'].forEach(id => $(id).value = '');
    $('tipo_caso').value = '';
    clearExpediente();
    $('moneda').value  = 'MXN';
    $('status').value  = 'abierto';
    $('formTitle').textContent = 'Alta de caso';
    $('modeChip').textContent  = 'Alta';
    $('detalleBtn').style.display = 'none';
  }

  function fill(r) {
    $('caso_id').value     = r.caso_id;
    $('nombre').value      = r.nombre      || '';
    $('descripcion').value = r.descripcion || '';
    $('tipo_caso').value   = r.tipo_caso   || '';
    if (r.expediente_tercero_id) {
      const exp = expedientes.find(e => String(e.expediente_id) === String(r.expediente_tercero_id));
      $('expediente_tercero_id').value = r.expediente_tercero_id;
      const label = exp
        ? (exp.nombre || '') + (exp.rfc ? ' · ' + exp.rfc : '')
        : (r.expediente_rfc ? `${r.expediente_rfc} · ${r.expediente_nombre || ''}` : '(expediente vinculado)');
      $('expediente_label').value = label;
      $('expediente_label').title = label;
    } else {
      clearExpediente();
    }
    $('monto_total').value  = r.monto_total ?? '';
    $('moneda').value       = r.moneda      || 'MXN';
    $('fecha_inicio').value = (r.fecha_inicio || '').slice(0, 10);
    $('fecha_fin').value    = (r.fecha_fin    || '').slice(0, 10);
    $('status').value       = r.status      || 'abierto';
    $('formTitle').textContent = 'Editar caso';
    $('modeChip').textContent  = 'Edición';
    $('detalleBtn').style.display = '';
  }

  // ── Eventos ───────────────────────────────────────────────────────────────
  $('refreshBtn').onclick     = load;
  $('newBtn').onclick         = () => { reset(); openModal(); };
  $('q').oninput              = load;
  $('fStatus').onchange       = load;
  $('fTipo').onchange         = load;
  $('closeModalBtn').onclick  = closeModal;
  $('cancelModalBtn').onclick = closeModal;

  $('detalleBtn').onclick = () => {
    const id = $('caso_id').value;
    if (id) window.location.href = '/modules/mat/caso-detalle.html?id=' + encodeURIComponent(id);
  };

  $('expediente_pick').addEventListener('click',  pickExpediente);
  $('expediente_label').addEventListener('click', pickExpediente);
  $('expediente_clear').addEventListener('click', clearExpediente);

  // ── Guardar ───────────────────────────────────────────────────────────────
  $('saveBtn').onclick = async function () {
    const nombre = val('nombre');
    const tipo   = $('tipo_caso').value;
    if (!nombre) { KoguApi.toast('Nombre es obligatorio.', 'error'); return; }
    if (!tipo)   { KoguApi.toast('Tipo de caso es obligatorio.', 'error'); return; }

    await KoguUi.withLoading(this, async () => {
      try {
        const payload = {
          nombre,
          descripcion:           val('descripcion') || null,
          tipo_caso:             tipo,
          expediente_tercero_id: $('expediente_tercero_id').value || null,
          monto_total:           val('monto_total') ? Number(val('monto_total')) : 0,
          moneda:                val('moneda') || 'MXN',
          fecha_inicio:          val('fecha_inicio') || null,
          fecha_fin:             val('fecha_fin')    || null,
          status:                $('status').value,
        };

        const id = $('caso_id').value;
        if (id) {
          await KoguApi.apiFetch('/protected/mat/casos/' + id, { method: 'PUT', body: JSON.stringify(payload) });
          KoguApi.toast('Caso actualizado', 'success');
        } else {
          const res = await KoguApi.apiFetch('/protected/mat/casos', { method: 'POST', body: JSON.stringify(payload) });
          const created = KoguApi.unwrapData(res);
          KoguApi.toast('Caso creado · ' + (created?.nombre || ''), 'success');
        }
        closeModal();
        await load();
      } catch (e) { KoguApi.toast(e.message, 'error'); }
    }, 'Guardando…');
  };

  // ── Cambio de empresa ─────────────────────────────────────────────────────
  KoguShell.subscribeEmpresaActivaChange(async () => {
    await loadExpedientes();
    await load();
  });

  // ── Carga inicial ─────────────────────────────────────────────────────────
  await loadExpedientes();
  await load();
});

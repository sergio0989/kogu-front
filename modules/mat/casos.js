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
<div class="split">

  <!-- Listado -->
  <div class="card">
    <div class="row">
      <div><div class="eyebrow">Listado</div><h2>Casos</h2></div>
      <button class="btn primary" id="refreshBtn">Actualizar</button>
    </div>
    <div class="grid-2" style="margin-top:16px">
      <input class="input" id="q" placeholder="Buscar por nombre o descripción…" />
      <select class="select" id="fStatus">
        <option value="">Todos los estados</option>
        ${Object.entries(STATUS_LABELS).map(([k,v]) => `<option value="${k}">${v}</option>`).join('')}
      </select>
    </div>
    <div class="grid-2" style="margin-top:8px">
      <select class="select" id="fTipo">
        <option value="">Todos los tipos</option>
        ${Object.entries(TIPO_CASO_LABELS).map(([k,v]) => `<option value="${k}">${v}</option>`).join('')}
      </select>
      <div></div>
    </div>
    <div class="table-wrap" style="margin-top:16px">
      <table><thead><tr>
        <th>Nombre</th><th>Tipo</th><th>Tercero</th><th>CFDI</th><th>Monto</th><th>Status</th><th>Acción</th>
      </tr></thead><tbody id="rows"></tbody></table>
    </div>
  </div>

  <!-- Formulario alta -->
  <div class="card">
    <div class="row">
      <div><div class="eyebrow">Formulario</div><h2 id="formTitle">Alta de caso</h2></div>
      <span class="chip" id="modeChip">Alta</span>
    </div>
    <div class="stack" style="margin-top:16px">
      <input type="hidden" id="caso_id"/>
      <div><div class="label-text">Nombre</div><input class="input" id="nombre"/></div>
      <div><div class="label-text">Descripción</div><textarea class="input" id="descripcion" rows="2"></textarea></div>
      <div>
        <div class="label-text">Tipo de caso</div>
        <select class="select" id="tipo_caso">
          <option value="">Selecciona…</option>
          ${Object.entries(TIPO_CASO_LABELS).map(([k,v]) => `<option value="${k}">${v}</option>`).join('')}
        </select>
      </div>
      <div>
        <div class="label-text">Expediente tercero <span class="muted" style="font-size:11px">(opcional)</span></div>
        <select class="select" id="expediente_tercero_id">
          <option value="">— ninguno —</option>
        </select>
      </div>
      <div class="grid-2">
        <div><div class="label-text">Monto total</div><input class="input" id="monto_total" type="number" step="0.01"/></div>
        <div><div class="label-text">Moneda</div><input class="input" id="moneda" maxlength="3" value="MXN"/></div>
      </div>
      <div class="grid-2">
        <div><div class="label-text">Fecha inicio</div><input class="input" id="fecha_inicio" type="date"/></div>
        <div><div class="label-text">Fecha fin</div><input class="input" id="fecha_fin" type="date"/></div>
      </div>
      <div>
        <div class="label-text">Status</div>
        <select class="select" id="status">
          ${Object.entries(STATUS_LABELS).map(([k,v]) => `<option value="${k}">${v}</option>`).join('')}
        </select>
      </div>
      <div class="page-actions">
        <button class="btn primary" id="saveBtn">Guardar</button>
        <button class="btn" id="newBtn">Nuevo</button>
      </div>
    </div>
  </div>

</div>`;

  const $ = id => document.getElementById(id);
  const val = id => $(id).value.trim();

  let rows = [];
  let expedientes = [];

  function statusBadge(s) {
    const c = s === 'completo' ? '#16a34a'
            : s === 'en_armado' ? '#ca8a04'
            : s === 'abierto' ? '#0ea5e9'
            : s === 'cerrado' ? '#64748b'
            : '#94a3b8';
    return `<span class="chip" style="background:${c}1a;color:${c};border:1px solid ${c}55">${STATUS_LABELS[s] || s}</span>`;
  }
  function fmtMoney(v, mon){ if(v == null) return '—'; return Number(v).toLocaleString('es-MX',{style:'currency',currency:(mon||'MXN'),maximumFractionDigits:2}); }

  async function loadExpedientes() {
    try {
      const res = await KoguApi.apiFetch('/protected/exp/expedientes');
      expedientes = KoguApi.unwrapRows(res) || [];
      $('expediente_tercero_id').innerHTML = '<option value="">— ninguno —</option>' +
        expedientes.map(e => `<option value="${KoguUi.escapeHtml(e.expediente_id)}">${KoguUi.escapeHtml((e.rfc||'') + ' · ' + (e.nombre||''))}</option>`).join('');
    } catch (e) { /* sin permisos exp_, no es crítico */ }
  }

  async function load() {
    const p = new URLSearchParams();
    if (val('q'))     p.set('q', val('q'));
    if ($('fStatus').value) p.set('status', $('fStatus').value);
    if ($('fTipo').value)   p.set('tipo_caso', $('fTipo').value);
    const qs = p.toString() ? `?${p}` : '';
    const res = await KoguApi.apiFetch('/protected/mat/casos' + qs);
    rows = KoguApi.unwrapRows(res) || [];
    render();
  }

  function render() {
    $('rows').innerHTML = rows.length ? rows.map(r => `
      <tr>
        <td><strong>${KoguUi.escapeHtml(r.nombre || '')}</strong></td>
        <td>${KoguUi.escapeHtml(TIPO_CASO_LABELS[r.tipo_caso] || r.tipo_caso)}</td>
        <td>${KoguUi.escapeHtml(r.expediente_rfc ? (r.expediente_rfc + ' · ' + (r.expediente_nombre || '')) : '—')}</td>
        <td>${r.cfdi_count || 0}</td>
        <td>${fmtMoney(r.monto_total, r.moneda)}</td>
        <td>${statusBadge(r.status)}</td>
        <td>
          <button class="btn btn-edit" data-id="${r.caso_id}">Editar</button>
          <a class="btn" href="/modules/mat/caso-detalle.html?id=${encodeURIComponent(r.caso_id)}">Detalle</a>
        </td>
      </tr>
    `).join('') : '<tr><td colspan="7" class="empty">Sin casos creados</td></tr>';

    document.querySelectorAll('.btn-edit').forEach(btn => btn.onclick = () => {
      const row = rows.find(r => String(r.caso_id) === btn.dataset.id);
      if (row) fill(row);
    });
  }

  function reset() {
    ['caso_id','nombre','descripcion','monto_total','fecha_inicio','fecha_fin'].forEach(id => $(id).value = '');
    $('tipo_caso').value = '';
    $('expediente_tercero_id').value = '';
    $('moneda').value = 'MXN';
    $('status').value = 'abierto';
    $('formTitle').textContent = 'Alta de caso';
    $('modeChip').textContent = 'Alta';
  }

  function fill(r) {
    $('caso_id').value = r.caso_id;
    $('nombre').value = r.nombre || '';
    $('descripcion').value = r.descripcion || '';
    $('tipo_caso').value = r.tipo_caso || '';
    $('expediente_tercero_id').value = r.expediente_tercero_id || '';
    $('monto_total').value = r.monto_total ?? '';
    $('moneda').value = r.moneda || 'MXN';
    $('fecha_inicio').value = (r.fecha_inicio || '').slice(0, 10);
    $('fecha_fin').value    = (r.fecha_fin || '').slice(0, 10);
    $('status').value = r.status || 'abierto';
    $('formTitle').textContent = 'Editar caso';
    $('modeChip').textContent = 'Edición';
  }

  $('saveBtn').onclick = async () => {
    try {
      const nombre = val('nombre');
      const tipo = $('tipo_caso').value;
      if (!nombre) throw new Error('Nombre es obligatorio.');
      if (!tipo)   throw new Error('Tipo de caso es obligatorio.');

      const payload = {
        nombre,
        descripcion: val('descripcion') || null,
        tipo_caso: tipo,
        expediente_tercero_id: $('expediente_tercero_id').value || null,
        monto_total: val('monto_total') ? Number(val('monto_total')) : 0,
        moneda: val('moneda') || 'MXN',
        fecha_inicio: val('fecha_inicio') || null,
        fecha_fin: val('fecha_fin') || null,
        status: $('status').value,
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
      reset();
      await load();
    } catch (e) { KoguApi.toast(e.message, 'error'); }
  };

  $('refreshBtn').onclick = load;
  $('newBtn').onclick = reset;
  $('q').oninput = () => load();
  $('fStatus').onchange = load;
  $('fTipo').onchange = load;

  KoguShell.subscribeEmpresaActivaChange(async () => {
    await loadExpedientes();
    await load();
  });

  reset();
  await loadExpedientes();
  await load();
});

// ============================================================
// expedientes.js
// Pantalla: Expedientes de terceros (Materialidad — Iteración 1).
// Endpoint base: /protected/exp/expedientes
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const b = await KoguShell.initShell({
    currentPage:        '/modules/exp/expedientes.html',
    title:              'Expedientes de terceros',
    description:        'Carpeta legal-operativa por proveedor / cliente. Materialidad fiscal.',
    requiredPermission: 'screen.exp.expedientes',
  });
  if (!b) return;

  const NIVELES = ['BAJO', 'MEDIO', 'ALTO', 'CRITICO'];

  document.getElementById('pageContent').innerHTML = `
<div class="split">

  <!-- ── Listado ── -->
  <div class="card">
    <div class="row">
      <div><div class="eyebrow">Listado</div><h2>Expedientes</h2></div>
      <button class="btn primary" id="refreshBtn">Actualizar</button>
    </div>
    <div class="grid-2" style="margin-top:16px">
      <input class="input" id="q" placeholder="Buscar por nombre o RFC…" />
      <select class="select" id="terceroTipoFiltro">
        <option value="">Cliente y proveedor</option>
        <option value="cliente">Solo cliente</option>
        <option value="proveedor">Solo proveedor</option>
        <option value="ambos">Ambos</option>
      </select>
    </div>
    <div class="grid-2" style="margin-top:8px">
      <select class="select" id="nivelFiltro">
        <option value="">Todos los niveles</option>
        ${NIVELES.map(n => `<option value="${n}">${n}</option>`).join('')}
      </select>
      <div></div>
    </div>
    <div class="table-wrap" style="margin-top:16px">
      <table><thead><tr>
        <th style="min-width:130px;white-space:nowrap">RFC</th>
        <th style="min-width:200px">Nombre / Razón social</th>
        <th>Tipo</th>
        <th style="text-align:center;min-width:70px">Score</th>
        <th>Nivel</th>
        <th style="text-align:center">Última revisión</th>
        <th style="min-width:160px">Acciones</th>
      </tr></thead><tbody id="rows"></tbody></table>
    </div>
    <div id="pgBar" style="display:flex;align-items:center;justify-content:space-between;margin-top:10px;font-size:13px;color:var(--muted)"></div>
  </div>

  <!-- ── Formulario ── -->
  <div class="card">
    <div class="row">
      <div><div class="eyebrow">Formulario</div><h2 id="formTitle">Alta de expediente</h2></div>
      <span class="chip" id="modeChip">Alta</span>
    </div>
    <div class="stack" style="margin-top:16px">
      <input type="hidden" id="expediente_id" />

      <div>
        <div class="label-text">Tipo de tercero</div>
        <select class="select" id="tercero_tipo">
          <option value="">Selecciona…</option>
          <option value="cliente">Cliente</option>
          <option value="proveedor">Proveedor</option>
          <option value="ambos">Ambos</option>
        </select>
      </div>

      <div>
        <div class="label-text">RFC</div>
        <input class="input" id="rfc" placeholder="13 caracteres (12 para PM)" maxlength="13"/>
        <div id="rfcHint" style="margin-top:6px;font-size:12px;color:var(--muted)"></div>
      </div>

      <div>
        <div class="label-text">Nombre / Razón social</div>
        <input class="input" id="nombre" />
      </div>

      <div class="grid-2">
        <div>
          <div class="label-text">Cliente vinculado <span class="muted" style="font-size:11px">(opcional)</span></div>
          <div style="display:flex;gap:6px;min-width:0">
            <input class="input" id="cliente_label" readonly placeholder="— ninguno —"
                   style="flex:1;min-width:0;cursor:pointer;background:#f8fafc;text-overflow:ellipsis;overflow:hidden;white-space:nowrap"
                   title=""/>
            <button type="button" class="btn ghost" id="cliente_pick" style="flex-shrink:0">Buscar…</button>
            <button type="button" class="btn ghost" id="cliente_clear" title="Limpiar" style="flex-shrink:0;padding:7px 10px">×</button>
          </div>
          <input type="hidden" id="cliente_id"/>
        </div>
        <div>
          <div class="label-text">Proveedor vinculado <span class="muted" style="font-size:11px">(opcional)</span></div>
          <div style="display:flex;gap:6px;min-width:0">
            <input class="input" id="proveedor_label" readonly placeholder="— ninguno —"
                   style="flex:1;min-width:0;cursor:pointer;background:#f8fafc;text-overflow:ellipsis;overflow:hidden;white-space:nowrap"
                   title=""/>
            <button type="button" class="btn ghost" id="proveedor_pick" style="flex-shrink:0">Buscar…</button>
            <button type="button" class="btn ghost" id="proveedor_clear" title="Limpiar" style="flex-shrink:0;padding:7px 10px">×</button>
          </div>
          <input type="hidden" id="proveedor_id"/>
        </div>
      </div>

      <div class="grid-2">
        <div>
          <div class="label-text">Num. Reg. Id. Tributaria <span class="muted" style="font-size:11px">(extranjeros)</span></div>
          <input class="input" id="num_reg_id_trib" />
        </div>
        <div>
          <div class="label-text">Residencia fiscal (ISO 3)</div>
          <select class="select" id="residencia_fiscal">
            <option value="">— no aplica (residente MX) —</option>
            <option value="MEX">MEX · México</option>
            <option value="USA">USA · Estados Unidos</option>
            <option value="CAN">CAN · Canadá</option>
            <option value="ARG">ARG · Argentina</option>
            <option value="AUS">AUS · Australia</option>
            <option value="AUT">AUT · Austria</option>
            <option value="BEL">BEL · Bélgica</option>
            <option value="BOL">BOL · Bolivia</option>
            <option value="BRA">BRA · Brasil</option>
            <option value="CHE">CHE · Suiza</option>
            <option value="CHL">CHL · Chile</option>
            <option value="CHN">CHN · China</option>
            <option value="COL">COL · Colombia</option>
            <option value="CRI">CRI · Costa Rica</option>
            <option value="CUB">CUB · Cuba</option>
            <option value="DEU">DEU · Alemania</option>
            <option value="DNK">DNK · Dinamarca</option>
            <option value="DOM">DOM · República Dominicana</option>
            <option value="ECU">ECU · Ecuador</option>
            <option value="ESP">ESP · España</option>
            <option value="FIN">FIN · Finlandia</option>
            <option value="FRA">FRA · Francia</option>
            <option value="GBR">GBR · Reino Unido</option>
            <option value="GTM">GTM · Guatemala</option>
            <option value="HKG">HKG · Hong Kong</option>
            <option value="HND">HND · Honduras</option>
            <option value="IND">IND · India</option>
            <option value="IRL">IRL · Irlanda</option>
            <option value="ISR">ISR · Israel</option>
            <option value="ITA">ITA · Italia</option>
            <option value="JPN">JPN · Japón</option>
            <option value="KOR">KOR · Corea del Sur</option>
            <option value="NIC">NIC · Nicaragua</option>
            <option value="NLD">NLD · Países Bajos</option>
            <option value="NOR">NOR · Noruega</option>
            <option value="NZL">NZL · Nueva Zelanda</option>
            <option value="PAN">PAN · Panamá</option>
            <option value="PER">PER · Perú</option>
            <option value="POL">POL · Polonia</option>
            <option value="PRT">PRT · Portugal</option>
            <option value="PRY">PRY · Paraguay</option>
            <option value="RUS">RUS · Rusia</option>
            <option value="SGP">SGP · Singapur</option>
            <option value="SLV">SLV · El Salvador</option>
            <option value="SWE">SWE · Suecia</option>
            <option value="TUR">TUR · Turquía</option>
            <option value="URY">URY · Uruguay</option>
            <option value="VEN">VEN · Venezuela</option>
            <option value="ZAF">ZAF · Sudáfrica</option>
          </select>
        </div>
      </div>

      <div>
        <div class="label-text">Observaciones</div>
        <textarea class="input" id="observaciones" rows="3"></textarea>
      </div>

      <div class="page-actions">
        <button class="btn primary" id="saveBtn">Guardar</button>
        <button class="btn" id="newBtn">Nuevo</button>
        <button class="btn" id="detalleBtn">Abrir detalle</button>
      </div>
    </div>
  </div>

</div>`;

  // ── Estado ────────────────────────────────────────────────────────────────
  const PAGE_SIZE = 50;
  let rows = [];
  let clientes  = [];
  let proveedores = [];
  let currentPage = 1;

  const $ = id => document.getElementById(id);
  const val = id => $(id).value.trim();

  // ── Loaders ───────────────────────────────────────────────────────────────
  async function loadCatalogos() {
    try {
      const [cli, pro] = await Promise.all([
        KoguApi.apiFetch('/protected/core/clientes').catch(() => ({})),
        KoguApi.apiFetch('/protected/core/proveedores').catch(() => ({})),
      ]);
      clientes    = KoguApi.unwrapRows(cli)  || [];
      proveedores = KoguApi.unwrapRows(pro)  || [];
    } catch (e) {
      console.warn('Catálogos no disponibles:', e);
    }
  }

  // Helpers para picker de búsqueda (patrón Lab QA: KoguUi.openSearchPicker)
  function pickCliente() {
    KoguUi.openSearchPicker({
      title: 'Vincular cliente',
      items: clientes,
      placeholder: 'Buscar por nombre, RFC o cve_cte…',
      columns: [
        { key: 'nombre',  label: 'Nombre',  primary: true },
        { key: 'rfc',     label: 'RFC' },
        { key: 'cve_cte', label: 'cve_cte' },
      ],
      emptyText: clientes.length === 0
        ? 'No hay clientes en esta empresa.'
        : 'Sin coincidencias',
      onSelect: (c) => {
        $('cliente_id').value    = c.cliente_id;
        const txt = (c.nombre || c.razon_social || '') + (c.rfc ? ' · ' + c.rfc : '');
        $('cliente_label').value = txt;
        $('cliente_label').title = txt;
        if (!$('nombre').value) $('nombre').value = c.nombre || c.razon_social || '';
        if (!$('rfc').value)    $('rfc').value    = (c.rfc || '').toUpperCase();
      },
    });
  }

  function pickProveedor() {
    KoguUi.openSearchPicker({
      title: 'Vincular proveedor',
      items: proveedores,
      placeholder: 'Buscar por nombre, RFC o cve_prov…',
      columns: [
        { key: 'nombre',   label: 'Nombre',   primary: true },
        { key: 'rfc',      label: 'RFC' },
        { key: 'cve_prov', label: 'cve_prov' },
      ],
      emptyText: proveedores.length === 0
        ? 'No hay proveedores en esta empresa.'
        : 'Sin coincidencias',
      onSelect: (p) => {
        $('proveedor_id').value    = p.proveedor_id;
        const txt = (p.nombre || p.razon_social || '') + (p.rfc ? ' · ' + p.rfc : '');
        $('proveedor_label').value = txt;
        $('proveedor_label').title = txt;
        if (!$('nombre').value) $('nombre').value = p.nombre || p.razon_social || '';
        if (!$('rfc').value)    $('rfc').value    = (p.rfc || '').toUpperCase();
      },
    });
  }

  function clearCliente() {
    $('cliente_id').value = '';
    $('cliente_label').value = '';
    $('cliente_label').title = '';
  }
  function clearProveedor() {
    $('proveedor_id').value = '';
    $('proveedor_label').value = '';
    $('proveedor_label').title = '';
  }

  // Aplica el estado habilitado/deshabilitado de los pickers según
  // tercero_tipo: si tipo=cliente, el picker de proveedor se deshabilita
  // (y se limpia si tenía valor). Si tipo=proveedor, al revés. Si tipo=ambos
  // o vacío, ambos habilitados.
  function applyTipoTerceroUI() {
    const tipo = $('tercero_tipo').value;
    const habCliente   = tipo === 'cliente'   || tipo === 'ambos' || tipo === '';
    const habProveedor = tipo === 'proveedor' || tipo === 'ambos' || tipo === '';

    setPickerEnabled('cliente',   habCliente);
    setPickerEnabled('proveedor', habProveedor);

    // Limpiar valor del lado deshabilitado para no enviar inconsistente al save
    if (!habCliente)   clearCliente();
    if (!habProveedor) clearProveedor();
  }

  function setPickerEnabled(prefix, enabled) {
    const label = $(prefix + '_label');
    const pick  = $(prefix + '_pick');
    const clr   = $(prefix + '_clear');
    [label, pick, clr].forEach(el => {
      if (!el) return;
      el.disabled = !enabled;
      el.style.opacity = enabled ? '1' : '.45';
      el.style.cursor  = enabled ? (el.tagName === 'INPUT' ? 'pointer' : 'pointer') : 'not-allowed';
    });
    if (!enabled) label.placeholder = '(deshabilitado por tipo de tercero)';
    else          label.placeholder = '— ninguno —';
  }

  async function load(showToast = false) {
    const params = new URLSearchParams();
    const q   = val('q');                if (q)   params.set('q', q);
    const tt  = $('terceroTipoFiltro').value; if (tt)  params.set('tercero_tipo', tt);
    const nv  = $('nivelFiltro').value;       if (nv)  params.set('nivel_riesgo', nv);
    const qs = params.toString() ? `?${params}` : '';
    const res = await KoguApi.apiFetch('/protected/exp/expedientes' + qs);
    rows = KoguApi.unwrapRows(res) || [];
    currentPage = 1;
    render();
    if (showToast) KoguApi.toast('Expedientes actualizados por cambio de empresa', 'success');
  }

  // ── Render ────────────────────────────────────────────────────────────────

  function renderPagination(total) {
    const bar = $('pgBar');
    const totalPages = Math.ceil(total / PAGE_SIZE) || 1;
    const from = total === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
    const to   = Math.min(currentPage * PAGE_SIZE, total);
    bar.innerHTML = `
      <span>${from}–${to} de ${total}</span>
      <div style="display:flex;gap:8px">
        <button class="btn" id="pgPrev" ${currentPage <= 1 ? 'disabled' : ''}>Anterior</button>
        <span style="padding:6px 10px;font-size:13px">${currentPage} / ${totalPages}</span>
        <button class="btn" id="pgNext" ${currentPage >= totalPages ? 'disabled' : ''}>Siguiente</button>
      </div>`;
    $('pgPrev').onclick = () => { if (currentPage > 1)          { currentPage--; render(); } };
    $('pgNext').onclick = () => { if (currentPage < totalPages) { currentPage++; render(); } };
  }

  function render() {
    const page = rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
    $('rows').innerHTML = page.length ? page.map(r => {
      const ultRev = r.ultima_revision_at ? new Date(r.ultima_revision_at).toLocaleDateString('es-MX', { day:'2-digit', month:'2-digit', year:'2-digit' }) : null;
      return `
      <tr>
        <td style="font-family:monospace;font-size:12px;white-space:nowrap"><strong>${KoguUi.escapeHtml(r.rfc || '')}</strong></td>
        <td style="font-size:13px">
          <strong>${KoguUi.escapeHtml(r.nombre || '')}</strong>
          ${r.responsable_nombre ? `<div class="muted" style="font-size:11px;margin-top:2px">Resp.: ${KoguUi.escapeHtml(r.responsable_nombre)}</div>` : ''}
        </td>
        <td><span class="chip">${KoguUi.escapeHtml(r.tercero_tipo || '')}</span></td>
        <td style="text-align:center;font-weight:700">${typeof r.score_actual === 'number' ? r.score_actual : '<span class="muted" style="font-weight:400">—</span>'}</td>
        <td>${KoguUi.nivelBadge(r.nivel_riesgo)}</td>
        <td style="text-align:center;font-size:11px;color:var(--muted,#64748b)">${ultRev || '<span class="muted">—</span>'}</td>
        <td>
          <div class="actions-cell">
            <button class="btn sm btn-edit" data-id="${r.expediente_id}">Editar</button>
            <a class="btn sm" href="/modules/exp/expediente-detalle.html?id=${encodeURIComponent(r.expediente_id)}">Detalle</a>
          </div>
        </td>
      </tr>`;
    }).join('') : `<tr><td colspan="7" class="empty">Sin expedientes</td></tr>`;

    document.querySelectorAll('.btn-edit').forEach(btn => btn.onclick = () => {
      const row = rows.find(r => String(r.expediente_id) === btn.dataset.id);
      if (row) fill(row);
    });

    renderPagination(rows.length);
  }

  // ── Form helpers ──────────────────────────────────────────────────────────
  function reset() {
    ['expediente_id','rfc','nombre','num_reg_id_trib','residencia_fiscal','observaciones'].forEach(id => $(id).value = '');
    $('tercero_tipo').value = '';
    clearCliente();
    clearProveedor();
    applyTipoTerceroUI();
    $('formTitle').textContent = 'Alta de expediente';
    $('modeChip').textContent  = 'Alta';
    $('rfcHint').textContent   = '';
  }

  function fill(r) {
    $('expediente_id').value     = r.expediente_id;
    $('tercero_tipo').value      = r.tercero_tipo || '';
    $('rfc').value               = r.rfc || '';
    $('nombre').value            = r.nombre || '';
    $('num_reg_id_trib').value   = r.num_reg_id_trib || '';
    $('residencia_fiscal').value = r.residencia_fiscal || '';
    $('observaciones').value     = r.observaciones || '';

    // Reconstruir labels desde los catálogos en memoria
    if (r.cliente_id) {
      const cli = clientes.find(c => String(c.cliente_id) === String(r.cliente_id));
      const txt = cli ? ((cli.nombre || cli.razon_social || '') + (cli.rfc ? ' · ' + cli.rfc : '')) : (r.cliente_nombre || '(cliente vinculado)');
      $('cliente_id').value = r.cliente_id;
      $('cliente_label').value = txt;
      $('cliente_label').title = txt;
    } else {
      clearCliente();
    }
    if (r.proveedor_id) {
      const pro = proveedores.find(p => String(p.proveedor_id) === String(r.proveedor_id));
      const txt = pro ? ((pro.nombre || pro.razon_social || '') + (pro.rfc ? ' · ' + pro.rfc : '')) : (r.proveedor_nombre || '(proveedor vinculado)');
      $('proveedor_id').value = r.proveedor_id;
      $('proveedor_label').value = txt;
      $('proveedor_label').title = txt;
    } else {
      clearProveedor();
    }

    applyTipoTerceroUI();
    $('formTitle').textContent = 'Editar expediente';
    $('modeChip').textContent  = 'Edición';
    $('rfcHint').textContent   = '';
  }

  // ── Eventos ───────────────────────────────────────────────────────────────
  $('refreshBtn').onclick = () => load(false);
  $('newBtn').onclick     = reset;
  $('q').oninput          = () => load(false);
  $('terceroTipoFiltro').onchange = () => load(false);
  $('nivelFiltro').onchange       = () => load(false);

  $('detalleBtn').onclick = () => {
    const id = $('expediente_id').value;
    if (!id) { KoguApi.toast('Primero selecciona un expediente.', 'error'); return; }
    window.location.href = '/modules/exp/expediente-detalle.html?id=' + encodeURIComponent(id);
  };

  // Picker buttons — patrón Lab QA con KoguUi.openSearchPicker.
  // Respetan estado disabled (se ignoran si el tipo_tercero no aplica).
  function safePick(prefix, fn) {
    return () => {
      if ($(prefix + '_pick').disabled) return;
      fn();
    };
  }
  $('cliente_pick').addEventListener('click',  safePick('cliente',  pickCliente));
  $('cliente_label').addEventListener('click', safePick('cliente',  pickCliente));
  $('cliente_clear').addEventListener('click', safePick('cliente',  clearCliente));

  $('proveedor_pick').addEventListener('click',  safePick('proveedor', pickProveedor));
  $('proveedor_label').addEventListener('click', safePick('proveedor', pickProveedor));
  $('proveedor_clear').addEventListener('click', safePick('proveedor', clearProveedor));

  // Sincronizar UI cuando cambia el tipo de tercero
  $('tercero_tipo').addEventListener('change', applyTipoTerceroUI);
  // Hint RFC dinámico
  $('rfc').oninput = () => {
    const rfc = ($('rfc').value || '').toUpperCase().trim();
    $('rfc').value = rfc;
    if (!rfc) { $('rfcHint').textContent = ''; return; }
    if (rfc.length < 12 || rfc.length > 13) {
      $('rfcHint').textContent = 'RFC debe tener 12 (PM) o 13 (PF) caracteres.';
      $('rfcHint').style.color = '#dc2626';
    } else {
      $('rfcHint').textContent = rfc.length === 12 ? 'Persona moral.' : 'Persona física.';
      $('rfcHint').style.color = '#16a34a';
    }
  };

  $('saveBtn').onclick = async () => {
    try {
      const tipo = $('tercero_tipo').value;
      const rfc  = val('rfc').toUpperCase();
      const nombre = val('nombre');
      if (!tipo)   throw new Error('Tipo de tercero es obligatorio.');
      if (!rfc)    throw new Error('RFC es obligatorio.');
      if (!nombre) throw new Error('Nombre es obligatorio.');

      const payload = {
        tercero_tipo:      tipo,
        rfc,
        nombre,
        cliente_id:        $('cliente_id').value || null,
        proveedor_id:      $('proveedor_id').value || null,
        num_reg_id_trib:   val('num_reg_id_trib') || null,
        residencia_fiscal: val('residencia_fiscal').toUpperCase() || null,
        observaciones:     val('observaciones') || null,
      };

      const id = $('expediente_id').value;
      if (id) {
        await KoguApi.apiFetch('/protected/exp/expedientes/' + id, {
          method: 'PUT', body: JSON.stringify(payload),
        });
        KoguApi.toast('Expediente actualizado', 'success');
      } else {
        const res = await KoguApi.apiFetch('/protected/exp/expedientes', {
          method: 'POST', body: JSON.stringify(payload),
        });
        const created = KoguApi.unwrapData(res);
        KoguApi.toast('Expediente creado · ' + (created?.rfc || ''), 'success');
      }
      reset();
      await load(false);
    } catch (err) {
      KoguApi.toast(err.message || 'No fue posible guardar el expediente', 'error');
    }
  };

  // ── Cambio de empresa ─────────────────────────────────────────────────────
  KoguShell.subscribeEmpresaActivaChange(async () => {
    await loadCatalogos();
    await load(true);
  });

  // ── Carga inicial ─────────────────────────────────────────────────────────
  await loadCatalogos();
  await load(false);
});

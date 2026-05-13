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
        <th>RFC</th><th>Nombre</th><th>Tipo</th><th>Score</th><th>Nivel</th><th>Acciones</th>
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
          <select class="select" id="cliente_id">
            <option value="">— ninguno —</option>
          </select>
        </div>
        <div>
          <div class="label-text">Proveedor vinculado <span class="muted" style="font-size:11px">(opcional)</span></div>
          <select class="select" id="proveedor_id">
            <option value="">— ninguno —</option>
          </select>
        </div>
      </div>

      <div class="grid-2">
        <div>
          <div class="label-text">Num. Reg. Id. Tributaria <span class="muted" style="font-size:11px">(extranjeros)</span></div>
          <input class="input" id="num_reg_id_trib" />
        </div>
        <div>
          <div class="label-text">Residencia fiscal (ISO 3)</div>
          <input class="input" id="residencia_fiscal" maxlength="3" placeholder="MEX, USA, ESP…"/>
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

      const cs = $('cliente_id');
      cs.innerHTML = '<option value="">— ninguno —</option>' +
        clientes.map(c => `<option value="${KoguUi.escapeHtml(c.cliente_id)}">${KoguUi.escapeHtml((c.nombre || c.razon_social || '') + ' · ' + (c.rfc || ''))}</option>`).join('');

      const ps = $('proveedor_id');
      ps.innerHTML = '<option value="">— ninguno —</option>' +
        proveedores.map(p => `<option value="${KoguUi.escapeHtml(p.proveedor_id)}">${KoguUi.escapeHtml((p.nombre || p.razon_social || '') + ' · ' + (p.rfc || ''))}</option>`).join('');
    } catch (e) {
      console.warn('Catálogos no disponibles:', e);
    }
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
  function nivelBadge(nivel) {
    if (!nivel) return '<span class="muted" style="font-size:11px">— sin evaluar —</span>';
    const color = nivel === 'BAJO' ? '#16a34a'
                : nivel === 'MEDIO' ? '#ca8a04'
                : nivel === 'ALTO' ? '#ea580c'
                : '#dc2626';
    return `<span class="chip" style="background:${color}1a;color:${color};border:1px solid ${color}55;">${nivel}</span>`;
  }

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
    $('rows').innerHTML = page.length ? page.map(r => `
      <tr>
        <td style="font-family:monospace"><strong>${KoguUi.escapeHtml(r.rfc || '')}</strong></td>
        <td>${KoguUi.escapeHtml(r.nombre || '')}</td>
        <td>${KoguUi.escapeHtml(r.tercero_tipo || '')}</td>
        <td>${typeof r.score_actual === 'number' ? r.score_actual : '<span class="muted">—</span>'}</td>
        <td>${nivelBadge(r.nivel_riesgo)}</td>
        <td>
          <div class="actions-cell">
            <button class="btn btn-edit" data-id="${r.expediente_id}">Editar</button>
            <a class="btn" href="/modules/exp/expediente-detalle.html?id=${encodeURIComponent(r.expediente_id)}">Detalle</a>
          </div>
        </td>
      </tr>
    `).join('') : `<tr><td colspan="6" class="empty">Sin expedientes</td></tr>`;

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
    $('cliente_id').value   = '';
    $('proveedor_id').value = '';
    $('formTitle').textContent = 'Alta de expediente';
    $('modeChip').textContent  = 'Alta';
    $('rfcHint').textContent   = '';
  }

  function fill(r) {
    $('expediente_id').value     = r.expediente_id;
    $('tercero_tipo').value      = r.tercero_tipo || '';
    $('rfc').value               = r.rfc || '';
    $('nombre').value            = r.nombre || '';
    $('cliente_id').value        = r.cliente_id || '';
    $('proveedor_id').value      = r.proveedor_id || '';
    $('num_reg_id_trib').value   = r.num_reg_id_trib || '';
    $('residencia_fiscal').value = r.residencia_fiscal || '';
    $('observaciones').value     = r.observaciones || '';
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

  // Sugerir nombre desde catálogo cuando se elige cliente/proveedor
  $('cliente_id').onchange = () => {
    const cid = $('cliente_id').value;
    if (!cid) return;
    const cli = clientes.find(c => String(c.cliente_id) === cid);
    if (cli) {
      if (!$('nombre').value) $('nombre').value = cli.nombre || cli.razon_social || '';
      if (!$('rfc').value)    $('rfc').value    = (cli.rfc || '').toUpperCase();
    }
  };
  $('proveedor_id').onchange = () => {
    const pid = $('proveedor_id').value;
    if (!pid) return;
    const pro = proveedores.find(p => String(p.proveedor_id) === pid);
    if (pro) {
      if (!$('nombre').value) $('nombre').value = pro.nombre || pro.razon_social || '';
      if (!$('rfc').value)    $('rfc').value    = (pro.rfc || '').toUpperCase();
    }
  };
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

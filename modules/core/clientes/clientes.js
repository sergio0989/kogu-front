window.__MODULE_DEF__ = {
  currentPage: '/modules/core/clientes/clientes.html',
  title:       'Clientes',
  description: 'Catálogo base multiempresa para clientes.',
  singular:    'cliente',
  basePath:    '/protected/core/clientes',
  idField:     'cliente_id',
  buildPayload: x => ({ nombre: x.nombre, rfc: x.rfc, cve_cte: x.cve_cte || null, activo: x.activo })
};

document.addEventListener('DOMContentLoaded', async () => {
  const MODULE = window.__MODULE_DEF__;

  const b = await KoguShell.initShell({
    currentPage:        MODULE.currentPage,
    title:              MODULE.title,
    description:        MODULE.description,
    requiredPermission: 'screen.catalogos.clientes'
  });
  if (!b) return;

  estilosFicha();
  const c = document.getElementById('pageContent');
  c.innerHTML = `
<div>

  <!-- ── Lista (ancho completo; la ficha se abre en modal) ── -->
  <div class="card">
    <div class="row">
      <div><div class="eyebrow">Listado</div><h2>${MODULE.title}</h2></div>
      <div class="page-actions">
        <button class="btn" id="refreshBtn">Actualizar</button>
        <button class="btn primary" id="newBtn">Nuevo cliente</button>
      </div>
    </div>
    <div class="grid-2" style="margin-top:16px">
      <input  class="input"  id="q"           placeholder="Buscar por nombre o RFC" />
      <select class="select" id="activoFiltro">
        <option value="">Todos</option>
        <option value="true">Activos</option>
        <option value="false">Inactivos</option>
      </select>
    </div>
    <div class="table-wrap" style="margin-top:16px">
      <table><thead><tr>
        <th>Nombre</th><th>RFC</th><th style="width:110px">Cve SAI</th><th>Activo</th><th>Acciones</th>
      </tr></thead><tbody id="rows"></tbody></table>
    </div>
    <div id="pgBar" style="display:flex;align-items:center;justify-content:space-between;margin-top:10px;font-size:13px;color:var(--muted)"></div>
  </div>

  <!-- ── Ficha del cliente (modal) · patrón de detalle KOGU ── -->
  <div class="modal-backdrop" id="clModal" hidden>
  <div class="modal-card clx-card" role="dialog" aria-modal="true" aria-labelledby="formTitle">
    <header class="clx-head">
      <div class="clx-head-top">
        <div style="min-width:0">
          <div class="eyebrow">Ficha del cliente</div>
          <h2 id="formTitle" class="clx-title">Nuevo cliente</h2>
          <div class="clx-chips" id="clChips"></div>
        </div>
        <div class="clx-head-actions">
          <span class="clx-dirty" id="clDirty" style="display:none">Cambios sin guardar</span>
          <span class="chip" id="modeChip">Alta</span>
          <button class="btn" id="clCerrar" title="Cerrar (Esc)">Cerrar</button>
        </div>
      </div>
      <div class="clx-metrics" id="clMetrics"></div>
      <nav class="clx-tabs" id="clTabs">
        <button class="tab active" data-tab="general">General</button>
        <button class="tab" data-tab="cobranza">Cobranza</button>
        <button class="tab" data-tab="contactos">Contactos <span class="clx-count" id="clCountCt"></span></button>
      </nav>
    </header>
    <div class="clx-body">
      <input type="hidden" id="id" />
      <div id="tab-general" class="clx-pane">
        <section class="clx-sec">
          <h4>Identificación</h4>
          <div class="clx-f"><div class="label-text">Nombre</div><input class="input" id="nombre" /></div>
          <div class="clx-row">
            <div class="clx-f"><div class="label-text">RFC</div><input class="input" id="rfc" style="font-family:ui-monospace,Menlo,monospace" /></div>
            <div class="clx-f"><div class="label-text">Clave SAI <span class="muted" style="font-weight:400;letter-spacing:0;text-transform:none">· cve_cte</span></div><input class="input" id="cveCte" placeholder="Ej. 305" /></div>
          </div>
          <div class="clx-row">
            <div class="clx-f"><div class="label-text">Activo</div>
              <select class="select" id="activo"><option value="true">Sí</option><option value="false">No</option></select></div>
            <div></div>
          </div>
        </section>
      </div>
      <div id="tab-cobranza" class="clx-pane" style="display:none">${htmlCobranza()}</div>
      <div id="tab-contactos" class="clx-pane" style="display:none">${htmlContactos()}</div>
    </div>
    <footer class="clx-foot">
      <div class="muted" id="clFootHint" style="font-size:12px"></div>
      <div class="page-actions">
        <button class="btn" id="statusBtn">Cambiar status</button>
        <button class="btn" id="clCerrarPie">Cerrar</button>
        <button class="btn primary" id="saveBtn">Guardar cambios</button>
      </div>
    </footer>
  </div>
  </div>

</div>`;

  // ── Cobranza (F0): pestaña y contactos ───────────────────────────────────
  // La lógica pura vive en clientes-cobranza.js (tests/clientes-cobranza.test.mjs).
  function htmlCobranza() {
    const CB = window.KoguClientesCobranza;
    const esc = KoguUi.escapeHtml;
    const opts = (m) => Object.entries(m).map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('');
    const campo = (lbl, html, extra = '') => `<div class="clx-f" ${extra}><div class="label-text">${lbl}</div>${html}</div>`;
    const dias = (pref) => `<div class="clx-days">${CB.DIAS.map(d =>
      `<label class="clx-day"><input type="checkbox" id="cb_${pref}_${d}"><span>${d[0].toUpperCase() + d.slice(1)}</span></label>`).join('')}</div>`;
    const sw = (id, lbl) => `<label class="clx-switch"><input type="checkbox" id="${id}"><span class="clx-sw"></span>${lbl}</label>`;
    const portal = (cual, tit, usa, campoUrl, campoUsr) => `
      <section class="clx-sec">
        <h4>${tit} <span class="clx-c neutro" id="cb_estado_${cual}"></span></h4>
        ${sw('cb_usa_portal_' + usa, 'El cliente usa portal')}
        <div class="clx-cond" id="cbWrapPortal_${cual}" style="display:none">
          ${campo('URL', `<input class="input" id="cb_${campoUrl}" placeholder="https://">`)}
          <div class="clx-row">
            ${campo('Usuario', `<input class="input" id="cb_${campoUsr}" autocomplete="off">`)}
            ${campo('Contraseña', `<input class="input" type="password" id="cb_${CB.PASS[cual]}" autocomplete="new-password" placeholder="Escribe solo para cambiarla">`)}
          </div>
          <label class="clx-switch clx-mini"><input type="checkbox" id="cb_borrar_${CB.PASS[cual]}"><span class="clx-sw"></span>Borrar la contraseña guardada</label>
        </div>
      </section>`;
    return `
      <div class="clx-grid">
        <section class="clx-sec">
          <h4>Crédito</h4>
          ${campo('Condición de pago', `<select class="select" id="cb_condicion_pago">${opts({ contado: 'Contado', credito: 'Crédito', anticipado: 'Anticipado' })}</select>`)}
          <div class="clx-row">
            ${campo('Días de crédito', `<input class="input" id="cb_dias_credito" inputmode="numeric" placeholder="Ej. 30">`)}
            ${campo('Límite', `<div class="clx-inline"><input class="input" id="cb_limite_credito" inputmode="decimal" placeholder="0"><select class="select" id="cb_moneda_limite">${opts({ MXN: 'MXN', USD: 'USD' })}</select></div>`)}
          </div>
        </section>
        <section class="clx-sec">
          <h4>Plazo y revisión</h4>
          ${campo('El plazo de crédito corre desde', `<select class="select" id="cb_tipo_fecha">${opts({ factura: 'La fecha de la factura', revision: 'La revisión (contrarrecibo)' })}</select>`)}
          ${campo('Días que el cliente revisa facturas', dias('rev'))}
          <div class="clx-row">
            ${campo('De', '<input class="input" type="time" id="cb_hora_revision_ini">')}
            ${campo('A', '<input class="input" type="time" id="cb_hora_revision_fin">')}
          </div>
        </section>
        <section class="clx-sec">
          <h4>Cobro</h4>
          ${campo('Días en que el cliente paga', dias('cob'))}
          <div class="clx-row">
            ${campo('De', '<input class="input" type="time" id="cb_hora_cobro_ini">')}
            ${campo('A', '<input class="input" type="time" id="cb_hora_cobro_fin">')}
          </div>
        </section>
        <section class="clx-sec">
          <h4>Factoraje y estado de cuenta</h4>
          ${sw('cb_cobro_factoraje', 'Se cobra por plataforma de factoraje')}
          ${campo('Plataforma o banco', '<input class="input" id="cb_plataforma_factoraje" placeholder="Ej. plataforma de proveedores">', 'id="cbWrapPlataforma" style="display:none"')}
          ${campo('Envío de estado de cuenta', `<select class="select" id="cb_envio_edo_cta">${opts(CB.ENVIO_EDO_CTA)}</select>`)}
        </section>
        ${portal('fact', 'Portal de facturas', 'facturas', 'url_portal_facturas', 'usuario_portal_fact')}
        ${portal('pago', 'Portal de pagos', 'pagos', 'url_portal_pagos', 'usuario_portal_pago')}
      </div>
      <section class="clx-sec">
        <h4>Responsable y bloqueo</h4>
        <div class="clx-row">
          <div class="clx-f"><div class="label-text">Responsable de cobranza</div>
            <select class="select" id="cb_responsable_cobranza_id"><option value="">— sin responsable —</option></select>
            <div class="muted" id="cb_resp_aviso" style="font-size:11px;margin-top:4px"></div></div>
          <div class="clx-f"><div class="label-text">Crédito</div>${sw('cb_bloqueo_credito', 'Bloquear crédito a este cliente')}</div>
        </div>
        <div class="clx-callout" id="cbWrapBloqueo" style="display:none">
          ${campo('Motivo del bloqueo', '<textarea class="input" id="cb_bloqueo_motivo" rows="2" placeholder="Obligatorio"></textarea>')}
          <div class="muted" id="cb_bloqueo_info" style="font-size:11px"></div>
        </div>
      </section>`;
  }

  function htmlContactos() {
    const CB = window.KoguClientesCobranza;
    const opts = Object.entries(CB.ROLES).map(([v, l]) => `<option value="${v}">${KoguUi.escapeHtml(l)}</option>`).join('');
    const campo = (lbl, html) => `<div class="clx-f"><div class="label-text">${lbl}</div>${html}</div>`;
    return `
      <div class="clx-empty" id="ctSinCliente">Guarda el cliente para agregar sus contactos.</div>
      <div id="ctPanel" style="display:none">
        <div class="clx-ct-head">
          <div class="muted" style="font-size:13px">A quién escribir para cobranza, pagos y estados de cuenta.</div>
          <button class="btn primary" id="ctAgregar">+ Agregar contacto</button>
        </div>
        <section class="clx-sec clx-ct-form" id="ctForm" style="display:none">
          <h4 id="ctTitulo">Nuevo contacto</h4>
          <input type="hidden" id="ct_id">
          <div class="clx-row">
            ${campo('Nombre', '<input class="input" id="ct_nombre">')}
            ${campo('Rol', `<select class="select" id="ct_rol">${opts}</select>`)}
          </div>
          <div class="clx-row">
            ${campo('Email', '<input class="input" id="ct_email" type="email">')}
            ${campo('Puesto', '<input class="input" id="ct_puesto">')}
          </div>
          <div class="clx-row">
            ${campo('Teléfono', '<input class="input" id="ct_telefono">')}
            ${campo('WhatsApp', '<input class="input" id="ct_whatsapp" placeholder="10 dígitos">')}
          </div>
          <div style="display:flex;gap:18px;flex-wrap:wrap">
            <label class="clx-switch"><input type="checkbox" id="ct_recibe_edo_cta"><span class="clx-sw"></span>Recibe estado de cuenta</label>
            <label class="clx-switch"><input type="checkbox" id="ct_principal"><span class="clx-sw"></span>Principal de su rol</label>
          </div>
          <div class="page-actions">
            <button class="btn primary" id="ctGuardar">Guardar contacto</button>
            <button class="btn" id="ctNuevo">Cancelar</button>
          </div>
        </section>
        <div class="clx-ct" id="ctRows"></div>
      </div>`;
  }

  // Estilos propios de la ficha (prefijo clx-), sin tocar styles.css global.
  function estilosFicha() {
    if (document.getElementById('clx-styles')) return;
    const st = document.createElement('style');
    st.id = 'clx-styles';
    st.textContent = `
.clx-card{width:min(1120px,96vw);height:min(90vh,940px);max-height:none;padding:0;display:flex;flex-direction:column;overflow:hidden}
.clx-head{padding:20px 26px 0;border-bottom:1px solid var(--line);background:#fff;flex:none}
.clx-head-top{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}
.clx-title{margin:4px 0 10px;font-size:22px;line-height:1.2;overflow-wrap:anywhere}
.clx-head-actions{display:flex;gap:8px;align-items:center;flex:none}
.clx-chips{display:flex;gap:6px;flex-wrap:wrap;min-height:22px}
.clx-c{display:inline-flex;align-items:center;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:700;background:#f1f5f9;color:#334155;letter-spacing:0;text-transform:none}
.clx-c.ok{background:var(--success-bg);color:#166534}.clx-c.info{background:#e0f2fe;color:#075985}
.clx-c.warn{background:var(--warn-bg);color:#92400e}.clx-c.bad{background:var(--danger-bg);color:#991b1b}
.clx-dirty{font-size:11px;font-weight:700;color:#92400e;background:var(--warn-bg);border-radius:999px;padding:4px 10px}
.clx-metrics{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin:16px 0}
.clx-m{background:var(--panel2);border:1px solid var(--line);border-radius:12px;padding:8px 12px;min-width:0}
.clx-m small{display:block;font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}
.clx-m b{display:block;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}
.clx-tabs{display:flex;gap:4px;margin:0;flex-wrap:nowrap}
.clx-tabs .tab{border:1px solid transparent;border-bottom:none;border-radius:12px 12px 0 0;padding:10px 18px;background:transparent;color:var(--muted);margin-bottom:-1px;font-weight:700}
.clx-tabs .tab:hover{color:var(--text)}
.clx-tabs .tab.active{background:var(--panel2);border-color:var(--line);color:var(--text)}
.clx-count{display:inline-block;min-width:18px;padding:0 6px;border-radius:999px;background:#e2e8f0;font-size:11px;margin-left:4px}
.clx-count:empty{display:none}
.clx-body{flex:1;overflow:auto;padding:20px 26px;background:var(--panel2)}
.clx-pane{display:grid;gap:14px}
.clx-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;align-items:start}
.clx-sec{background:#fff;border:1px solid var(--line);border-radius:14px;padding:16px 18px;display:grid;gap:12px;align-content:start}
.clx-sec h4{margin:0;font-size:14px;display:flex;justify-content:space-between;align-items:center;gap:8px}
.clx-row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.clx-f{display:grid;gap:5px;min-width:0}
.clx-sec .label-text{font-size:11px;letter-spacing:.04em;margin:0}
.clx-sec .input,.clx-sec .select{padding:9px 12px;font-size:14px;min-width:0;width:100%}
.clx-inline{display:grid;grid-template-columns:1fr 92px;gap:8px}
.clx-cond{display:grid;gap:12px}
.clx-days{display:flex;gap:6px;flex-wrap:wrap}
.clx-day{position:relative;cursor:pointer}
.clx-day input{position:absolute;opacity:0;pointer-events:none}
.clx-day span{display:inline-block;min-width:40px;text-align:center;padding:6px 8px;border:1px solid var(--line);border-radius:999px;font-size:12px;font-weight:700;background:#fff;color:var(--muted);transition:.12s}
.clx-day input:checked + span{background:var(--primary);border-color:var(--primary);color:#fff}
.clx-day input:focus-visible + span{outline:2px solid var(--primary);outline-offset:2px}
.clx-switch{display:flex;gap:10px;align-items:center;font-size:13px;font-weight:600;cursor:pointer;position:relative}
.clx-switch input{position:absolute;opacity:0;pointer-events:none}
.clx-sw{width:34px;height:20px;border-radius:999px;background:#cbd5e1;position:relative;flex:none;transition:.15s}
.clx-sw:after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:.15s;box-shadow:0 1px 2px rgba(0,0,0,.2)}
.clx-switch input:checked + .clx-sw{background:var(--primary)}
.clx-switch input:checked + .clx-sw:after{left:16px}
.clx-switch input:focus-visible + .clx-sw{outline:2px solid var(--primary);outline-offset:2px}
.clx-mini{font-size:12px;font-weight:500;color:var(--muted)}
.clx-callout{border:1px solid #fecaca;background:#fef2f2;border-radius:12px;padding:12px 14px;display:grid;gap:6px}
.clx-foot{border-top:1px solid var(--line);padding:12px 26px;display:flex;justify-content:space-between;align-items:center;gap:12px;background:#fff;flex:none}
.clx-empty{border:1px dashed #cbd5e1;border-radius:14px;padding:26px;text-align:center;color:var(--muted);background:#fff;font-size:13px}
.clx-ct-head{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:12px}
.clx-ct-form{margin-bottom:14px;border-color:#a5f3fc;box-shadow:0 0 0 3px #ecfeff}
.clx-ct{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px}
.clx-ct-card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:14px 16px;display:grid;gap:8px;align-content:start}
.clx-ct-card.off{opacity:.55}
.clx-ct-name{font-weight:700;font-size:14px;display:flex;justify-content:space-between;gap:8px;align-items:flex-start}
.clx-ct-data{font-size:12px;color:var(--muted);display:grid;gap:2px;overflow-wrap:anywhere}
.clx-ct-actions{display:flex;gap:6px;margin-top:2px}
@media (max-width:900px){.clx-grid,.clx-row{grid-template-columns:1fr}.clx-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.clx-head-top{flex-direction:column}}
`;
    document.head.appendChild(st);
  }

  // ── Estado ────────────────────────────────────────────────────────────────
  const PAGE_SIZE  = 50;
  let rows         = [];
  let currentPage  = 1;
  let original     = null;   // cliente completo en edición (GET /clientes/:id)
  let contactos    = [];
  const CB = window.KoguClientesCobranza;

  const val  = id => document.getElementById(id).value.trim();
  const mapName = r => r.nombre || r.nombre_cliente || r.razon_social || '';
  const mapRfc  = r => r.rfc || r.rfc_cliente || '';
  const mapId   = r => r[MODULE.idField] || r.id || '';

  // ── Helpers formulario ────────────────────────────────────────────────────
  function reset() {
    ['id', 'nombre', 'rfc', 'cveCte'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('activo').value    = 'true';
    document.getElementById('formTitle').textContent = 'Nuevo cliente';
    document.getElementById('modeChip').textContent  = 'Alta';
    original = null; contactos = [];
    pintarCobranza(null); pintarContactos(); limpiarContacto();
    pintarEncabezado(); marcarSucio(false);
  }

  function fill(r) {
    document.getElementById('id').value      = mapId(r);
    document.getElementById('nombre').value  = mapName(r);
    document.getElementById('rfc').value     = mapRfc(r);
    document.getElementById('cveCte').value  = r.cve_cte || '';
    document.getElementById('activo').value  = String(!!r.activo);
    document.getElementById('formTitle').textContent = mapName(r) || 'Editar cliente';
    document.getElementById('modeChip').textContent  = 'Edición';
    original = r;
    pintarCobranza(r); limpiarContacto(); cargarContactos();
    pintarEncabezado(); marcarSucio(false); etiquetaStatus();
  }

  // Abre el cliente completo: la lista solo trae columnas de resumen.
  async function abrir(id) {
    try {
      const res = await KoguApi.apiFetch(MODULE.basePath + '/' + id);
      fill(res.data || res);
      activarTab('general');
      abrirModal();
    } catch (err) { avisar(err); }
  }

  function etiquetaStatus() {
    document.getElementById('statusBtn').textContent = original && original.activo === false ? 'Activar cliente' : 'Desactivar cliente';
  }

  function abrirModal()  { document.getElementById('clModal').hidden = false; }
  function cerrarModal() { document.getElementById('clModal').hidden = true; }

  function activarTab(t) {
    document.querySelectorAll('#clTabs .tab').forEach(b => b.classList.toggle('active', b.dataset.tab === t));
    // display explícito: el atributo hidden pierde contra .stack{display:grid}.
    ['general', 'cobranza', 'contactos'].forEach(x => { document.getElementById('tab-' + x).style.display = x === t ? '' : 'none'; });
    // Pie según pestaña: los contactos se guardan uno por uno.
    document.getElementById('saveBtn').style.display = t === 'contactos' ? 'none' : '';
    document.getElementById('statusBtn').style.display = t === 'general' && document.getElementById('id').value ? '' : 'none';
    document.getElementById('clFootHint').textContent = {
      general: 'Datos de identificación del cliente.',
      cobranza: 'Guardar aplica General y Cobranza juntos.',
      contactos: 'Cada contacto se guarda por separado.',
    }[t];
  }

  // api.js ya avisa en 401/403/409/422; lo demás (400, validaciones locales) avisa aquí.
  const avisar = (err) => { if (![401, 403, 409, 422].includes(err && err.status)) KoguApi.toast(err.message, 'error'); };

  const $c = (k) => document.getElementById('cb_' + k);

  function pintarCobranza(r) {
    const f = CB.formDesdeCliente(r);
    [...CB.CAMPOS_SELECT, ...CB.CAMPOS_TEXTO, ...CB.CAMPOS_NUM].forEach(k => { if ($c(k)) $c(k).value = f[k] ?? ''; });
    const resp = $c('responsable_cobranza_id');
    if (f.responsable_cobranza_id && ![...resp.options].some(o => o.value === f.responsable_cobranza_id)) {
      resp.insertAdjacentHTML('beforeend', `<option value="${KoguUi.escapeHtml(f.responsable_cobranza_id)}">Usuario asignado</option>`);
    }
    resp.value = f.responsable_cobranza_id || '';
    CB.CAMPOS_BOOL.forEach(k => { if ($c(k)) $c(k).checked = !!f[k]; });
    $c('bloqueo_credito').checked = f.bloqueo_credito;
    $c('bloqueo_motivo').value = f.bloqueo_motivo;
    Object.values(CB.PASS).forEach(p => { $c(p).value = ''; $c('borrar_' + p).checked = false; });
    document.getElementById('cb_estado_fact').textContent = CB.estadoPass(r, 'fact');
    document.getElementById('cb_estado_pago').textContent = CB.estadoPass(r, 'pago');
    document.getElementById('cb_bloqueo_info').textContent = r && r.bloqueo_credito && r.bloqueo_at
      ? 'Bloqueado desde ' + String(r.bloqueo_at).slice(0, 10) : '';
    aplicarCondicionales();
  }

  // Campos que solo aparecen cuando aplican.
  function aplicarCondicionales() {
    const ver = (id, on) => { document.getElementById(id).style.display = on ? '' : 'none'; };
    ver('cbWrapPlataforma', $c('cobro_factoraje').checked);
    ver('cbWrapBloqueo', $c('bloqueo_credito').checked);
    ver('cbWrapPortal_fact', $c('usa_portal_facturas').checked);
    ver('cbWrapPortal_pago', $c('usa_portal_pagos').checked);
    const credito = $c('condicion_pago').value === 'credito';
    $c('dias_credito').disabled = !credito;
    $c('limite_credito').disabled = !credito;
  }

  // Encabezado: nombre, chips y métricas con lo que hay en pantalla.
  function pintarEncabezado() {
    const esc = KoguUi.escapeHtml;
    const id = document.getElementById('id').value;
    let vista = original ? { ...original } : {};
    try {
      vista = { ...vista, ...(CB.cuerpoCobranza(original, leerCobranza()) || {}) };
    } catch (e) { /* valor a medio escribir: se muestra lo guardado */ }
    vista.cve_cte = val('cveCte') || vista.cve_cte;
    vista.activo = document.getElementById('activo').value === 'true';
    const chips = id || vista.cve_cte ? CB.chipsCliente(vista) : [];
    const rfc = val('rfc');
    document.getElementById('clChips').innerHTML =
      (rfc ? `<span class="clx-c neutro" style="font-family:ui-monospace,Menlo,monospace">${esc(rfc)}</span>` : '') +
      chips.map(ch => `<span class="clx-c ${ch.tono}">${esc(ch.txt)}</span>`).join('');
    const activos = contactos.filter(k => k.activo).length;
    document.getElementById('clMetrics').innerHTML = CB.metricasCliente(vista, activos)
      .map(m => `<div class="clx-m"><small>${esc(m.l)}</small><b title="${esc(m.v)}">${esc(m.v)}</b></div>`).join('');
    document.getElementById('clCountCt').textContent = id ? String(activos) : '';
  }

  // "Cambios sin guardar": lo general o cobranza difieren de lo guardado.
  function marcarSucio(forzar) {
    let sucio = false;
    if (forzar !== false) {
      const o = original || {};
      sucio = val('nombre') !== (o.nombre || '') || val('rfc') !== (o.rfc || '') || val('cveCte') !== (o.cve_cte || '')
        || (original && document.getElementById('activo').value !== String(!!o.activo));
      if (!sucio) { try { sucio = !!CB.cuerpoCobranza(original, leerCobranza()); } catch (e) { sucio = true; } }
    }
    document.getElementById('clDirty').style.display = sucio ? '' : 'none';
  }

  function leerCobranza() {
    const f = {};
    [...CB.CAMPOS_SELECT, ...CB.CAMPOS_TEXTO, ...CB.CAMPOS_NUM].forEach(k => { f[k] = $c(k).value; });
    CB.CAMPOS_BOOL.forEach(k => { f[k] = $c(k).checked; });
    f.bloqueo_credito = $c('bloqueo_credito').checked;
    f.bloqueo_motivo = $c('bloqueo_motivo').value;
    Object.values(CB.PASS).forEach(p => { f[p] = $c(p).value; f['borrar_' + p] = $c('borrar_' + p).checked; });
    return f;
  }

  async function cargarResponsables(perms) {
    const sel = $c('responsable_cobranza_id');
    if (!(perms || []).some(p => p === '*' || p === 'screen.catalogos.usuarios')) {
      document.getElementById('cb_resp_aviso').textContent = 'Tu perfil no puede ver la lista de usuarios; pide a un administrador que asigne el responsable.';
      sel.disabled = true;
      return;
    }
    try {
      const us = KoguApi.unwrapRows(await KoguApi.apiFetch('/protected/core/usuarios')) || [];
      sel.innerHTML = '<option value="">— sin responsable —</option>' + us.filter(u => u.activo !== false)
        .map(u => `<option value="${KoguUi.escapeHtml(u.user_id)}">${KoguUi.escapeHtml(u.nombre || u.email || u.user_id)}</option>`).join('');
      if (original) sel.value = original.responsable_cobranza_id || '';
    } catch (err) { avisar(err); }
  }

  // ── Contactos ─────────────────────────────────────────────────────────────
  const $t = (k) => document.getElementById('ct_' + k);

  function pintarContactos() {
    const id = document.getElementById('id').value;
    document.getElementById('ctSinCliente').style.display = id ? 'none' : '';
    document.getElementById('ctPanel').style.display = id ? '' : 'none';
    const esc = KoguUi.escapeHtml;
    const tarjeta = (k) => `
      <article class="clx-ct-card ${k.activo ? '' : 'off'}">
        <div class="clx-ct-name"><span>${esc(k.nombre)}</span><span class="clx-c info">${esc(CB.ROLES[k.rol] || k.rol)}</span></div>
        <div class="clx-ct-data">
          ${k.puesto ? `<span>${esc(k.puesto)}</span>` : ''}
          <span>${esc(k.email || 'Sin email')}</span>
          ${k.telefono || k.whatsapp ? `<span>${esc([k.telefono, k.whatsapp && 'WhatsApp ' + k.whatsapp].filter(Boolean).join(' · '))}</span>` : ''}
        </div>
        <div class="clx-chips">
          ${k.principal ? '<span class="clx-c ok">Principal</span>' : ''}
          ${k.recibe_edo_cta ? '<span class="clx-c info">Recibe estado de cuenta</span>' : ''}
          ${k.activo ? '' : '<span class="clx-c neutro">Dado de baja</span>'}
        </div>
        <div class="clx-ct-actions">
          <button class="btn ct-edit" data-id="${esc(k.contacto_id)}">Editar</button>
          <button class="btn ct-baja" data-id="${esc(k.contacto_id)}" data-activo="${k.activo}">${k.activo ? 'Dar de baja' : 'Reactivar'}</button>
        </div>
      </article>`;
    document.getElementById('ctRows').innerHTML = contactos.length
      ? contactos.map(tarjeta).join('')
      : '<div class="clx-empty" style="grid-column:1/-1">Este cliente aún no tiene contactos. Agrega a quien recibe cobranza o pagos.</div>';
    document.querySelectorAll('.ct-edit').forEach(b => b.onclick = () => editarContacto(b.dataset.id));
    document.querySelectorAll('.ct-baja').forEach(b => b.onclick = () => cambiarActivoContacto(b.dataset.id, b.dataset.activo !== 'true'));
    if (document.getElementById('clMetrics')) pintarEncabezado();
  }

  function abrirFormContacto(on) { document.getElementById('ctForm').style.display = on ? '' : 'none'; }

  async function cargarContactos() {
    const id = document.getElementById('id').value;
    contactos = [];
    if (id) {
      try { contactos = KoguApi.unwrapRows(await KoguApi.apiFetch(`${MODULE.basePath}/${id}/contactos`)) || []; }
      catch (err) { avisar(err); }
    }
    pintarContactos();
  }

  function limpiarContacto() {
    ['id', 'nombre', 'puesto', 'email', 'telefono', 'whatsapp'].forEach(k => { $t(k).value = ''; });
    $t('rol').value = 'cobranza'; $t('recibe_edo_cta').checked = false; $t('principal').checked = false;
    document.getElementById('ctTitulo').textContent = 'Nuevo contacto';
    abrirFormContacto(false);
  }

  function editarContacto(contactoId) {
    const k = contactos.find(x => x.contacto_id === contactoId);
    if (!k) return;
    $t('id').value = k.contacto_id;
    ['nombre', 'puesto', 'email', 'telefono', 'whatsapp'].forEach(f => { $t(f).value = k[f] || ''; });
    $t('rol').value = k.rol; $t('recibe_edo_cta').checked = !!k.recibe_edo_cta; $t('principal').checked = !!k.principal;
    document.getElementById('ctTitulo').textContent = 'Editar contacto';
    abrirFormContacto(true);
    $t('nombre').focus();
  }

  async function guardarContacto() {
    try {
      const clienteId = document.getElementById('id').value;
      const body = CB.cuerpoContacto({
        nombre: $t('nombre').value, rol: $t('rol').value, puesto: $t('puesto').value, email: $t('email').value,
        telefono: $t('telefono').value, whatsapp: $t('whatsapp').value,
        recibe_edo_cta: $t('recibe_edo_cta').checked, principal: $t('principal').checked,
      });
      const cid = $t('id').value;
      await KoguApi.apiFetch(`${MODULE.basePath}/${clienteId}/contactos${cid ? '/' + cid : ''}`,
        { method: cid ? 'PUT' : 'POST', body: JSON.stringify(body) });
      KoguApi.toast(cid ? 'Contacto actualizado' : 'Contacto agregado', 'success');
      limpiarContacto(); await cargarContactos();
    } catch (err) { avisar(err); }
  }

  async function cambiarActivoContacto(contactoId, activo) {
    try {
      const clienteId = document.getElementById('id').value;
      await KoguApi.apiFetch(`${MODULE.basePath}/${clienteId}/contactos/${contactoId}`,
        { method: 'PUT', body: JSON.stringify({ activo }) });
      KoguApi.toast(activo ? 'Contacto reactivado' : 'Contacto dado de baja', 'success');
      await cargarContactos();
    } catch (err) { avisar(err); }
  }

  // ── Carga ─────────────────────────────────────────────────────────────────
  async function load(showToast = false) {
    const res = await KoguApi.apiFetch(MODULE.basePath);
    rows = KoguApi.unwrapRows(res);
    currentPage = 1;
    render();
    if (showToast) KoguApi.toast('Clientes actualizados por cambio de empresa', 'success');
  }

  // ── Filtrado ──────────────────────────────────────────────────────────────
  function getFiltered() {
    const q  = val('q').toLowerCase();
    const af = document.getElementById('activoFiltro').value;
    return rows.filter(r => {
      const text = `${mapName(r)} ${mapRfc(r)} ${r.cve_cte || ''}`.toLowerCase();
      return (!q  || text.includes(q))
          && (af === '' || String(!!r.activo) === af);
    });
  }

  // ── Paginación ────────────────────────────────────────────────────────────
  function renderPagination(total) {
    const bar       = document.getElementById('pgBar');
    const totalPages = Math.ceil(total / PAGE_SIZE) || 1;
    const from      = total === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
    const to        = Math.min(currentPage * PAGE_SIZE, total);
    bar.innerHTML   = `
      <span>${from}–${to} de ${total}</span>
      <div style="display:flex;gap:8px">
        <button class="btn" id="pgPrev" ${currentPage <= 1 ? 'disabled' : ''}>Anterior</button>
        <span style="padding:6px 10px;font-size:13px">${currentPage} / ${totalPages}</span>
        <button class="btn" id="pgNext" ${currentPage >= totalPages ? 'disabled' : ''}>Siguiente</button>
      </div>`;
    document.getElementById('pgPrev').onclick = () => { if (currentPage > 1)          { currentPage--; render(); } };
    document.getElementById('pgNext').onclick = () => { if (currentPage < totalPages) { currentPage++; render(); } };
  }

  // ── Render tabla ──────────────────────────────────────────────────────────
  function render() {
    const filtered = getFiltered();
    const page     = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

    document.getElementById('rows').innerHTML = page.length
      ? page.map(r => `
          <tr>
            <td>${KoguUi.escapeHtml(mapName(r))}</td>
            <td style="font-family:monospace;font-size:12px">${KoguUi.escapeHtml(mapRfc(r))}</td>
            <td style="font-family:monospace;font-size:12px;color:${r.cve_cte ? 'var(--primary)' : 'var(--muted)'}">${KoguUi.escapeHtml(r.cve_cte || '—')}</td>
            <td>${KoguUi.statusBadge(r.activo ? 'activo' : 'inactivo')}</td>
            <td><button class="btn btn-edit" data-id="${mapId(r)}">Editar</button></td>
          </tr>`).join('')
      : '<tr><td colspan="5" class="empty">Sin registros</td></tr>';

    document.querySelectorAll('.btn-edit').forEach(x => x.onclick = () => {
      const row = rows.find(r => String(mapId(r)) === x.dataset.id);
      if (row) abrir(mapId(row));
    });

    renderPagination(filtered.length);
  }

  // ── Guardar ───────────────────────────────────────────────────────────────
  document.getElementById('saveBtn').onclick = async () => {
    try {
      const payload = MODULE.buildPayload({
        nombre:  val('nombre'),
        rfc:     val('rfc'),
        cve_cte: val('cveCte') || null,
        activo:  document.getElementById('activo').value === 'true',
      });
      if (!val('nombre')) throw new Error('Nombre es obligatorio.');
      Object.assign(payload, CB.cuerpoCobranza(original, leerCobranza()) || {});
      const id = document.getElementById('id').value;
      let res;
      if (id) {
        res = await KoguApi.apiFetch(MODULE.basePath + '/' + id, { method: 'PUT', body: JSON.stringify(payload) });
        KoguApi.toast(MODULE.singular + ' actualizado', 'success');
      } else {
        res = await KoguApi.apiFetch(MODULE.basePath, { method: 'POST', body: JSON.stringify(payload) });
        KoguApi.toast(MODULE.singular + ' creado', 'success');
      }
      // Se queda en la ficha (con lo que regresó el servidor) para seguir con cobranza y contactos.
      const fila = res && (res.data || res);
      if (fila && fila.cliente_id) fill(fila); else reset();
      await load(false);
    } catch (err) { avisar(err); }
  };

  // Alterna activo/inactivo con el estado GUARDADO (no con lo que diga el
  // selector sin guardar). Antes leía un #status que no existe y tronaba.
  document.getElementById('statusBtn').onclick = async () => {
    try {
      const id = document.getElementById('id').value;
      if (!id || !original) throw new Error('Selecciona un registro.');
      const activo = !original.activo;
      const res = await KoguApi.apiFetch(MODULE.basePath + '/' + id + '/status', {
        method: 'PUT',
        body: JSON.stringify({ activo })
      });
      const fila = (res && (res.data || res)) || {};
      original = { ...original, ...fila, activo: fila.activo ?? activo };
      document.getElementById('activo').value = String(!!original.activo);
      etiquetaStatus(); pintarEncabezado();
      KoguApi.toast(original.activo ? 'Cliente activado' : 'Cliente desactivado', 'success');
      await load(false);
    } catch (err) { avisar(err); }
  };

  // ── Eventos ───────────────────────────────────────────────────────────────
  document.getElementById('refreshBtn').onclick      = () => load(false);
  document.getElementById('newBtn').onclick          = () => { reset(); activarTab('general'); abrirModal(); };
  document.getElementById('clCerrar').onclick        = cerrarModal;
  document.getElementById('clCerrarPie').onclick     = cerrarModal;
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrarModal(); });
  document.querySelectorAll('#clTabs .tab').forEach(t => t.onclick = () => activarTab(t.dataset.tab));
  document.getElementById('ctGuardar').onclick = guardarContacto;
  document.getElementById('ctNuevo').onclick   = limpiarContacto;
  document.getElementById('ctAgregar').onclick = () => { limpiarContacto(); abrirFormContacto(true); $t('nombre').focus(); };
  // Condicionales, encabezado y "cambios sin guardar" en vivo.
  ['tab-general', 'tab-cobranza'].forEach(pid => {
    const pane = document.getElementById(pid);
    const alCambiar = () => { aplicarCondicionales(); pintarEncabezado(); marcarSucio(); };
    pane.addEventListener('input', alCambiar);
    pane.addEventListener('change', alCambiar);
  });
  document.getElementById('q').oninput              = () => { currentPage = 1; render(); };
  document.getElementById('activoFiltro').onchange  = () => { currentPage = 1; render(); };

  KoguShell.subscribeEmpresaActivaChange(async () => { cerrarModal(); reset(); activarTab('general'); await load(true); });
  reset();
  cargarResponsables(b.permissions || b.permisos || []);
  await load(false);
});

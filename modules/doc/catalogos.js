// ============================================================
// catalogos.js
// Pantalla: Catálogos de Control Documental.
//   Tipos · Subtipos · Usos de asignación · Ubicaciones de resguardo
//
// ── Lo que hace especial a esta pantalla ────────────────────
// El editor de campos del subtipo. `cat_doc_subtipos.esquema_campos`
// define qué captura cada tipo de documento, y de ahí sale el
// formulario de alta. Poder editarlo desde aquí es lo que permite dar
// de alta un subtipo nuevo —una licencia, un permiso, lo que sea— sin
// migración y sin despliegue.
//
// ── El riesgo que hay que cuidar ────────────────────────────
// Los VALORES capturados viven en `doc_documentos.datos`, indexados por
// la CLAVE del campo. Si alguien le cambia la clave a un campo que ya
// tiene documentos capturados, esos valores siguen en la base pero
// dejan de aparecer: el formulario buscará una llave que nadie escribió.
// Por eso, cuando el subtipo ya tiene documentos, las claves existentes
// se bloquean y solo se permite cambiar la etiqueta, la obligatoriedad
// y las opciones. Es una restricción incómoda que evita una pérdida
// silenciosa de datos.
//
// Gobierno (riesgo R2 del análisis): escribir requiere
// doc.catalogos.manage, que hoy solo tienen los Administradores. Un
// catálogo abierto termina con ocho variantes de «Acta constitutiva».
// Módulo: Control Documental (doc_) — v1.
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const b = await KoguShell.initShell({
    currentPage:        '/modules/doc/catalogos.html',
    title:              'Catálogos documentales',
    description:        'Tipos y subtipos de documento, usos de asignación y ubicaciones de resguardo.',
    requiredPermission: 'doc.catalogos.read',
  });
  if (!b) return;

  const D = window.KoguDoc;
  const esc = D.esc;
  const $ = (id) => document.getElementById(id);
  const puede = (p) => KoguShell.hasPerm(b, p);
  const canManage = puede('doc.catalogos.manage');

  const TIPOS_CAMPO = {
    text:     'Texto',
    textarea: 'Texto largo',
    int:      'Número entero',
    decimal:  'Número decimal',
    money:    'Importe',
    date:     'Fecha',
    bool:     'Sí / No',
    select:   'Lista de opciones',
  };

  const TIPOS_UBI = {
    caja_fuerte:    'Caja fuerte',
    archivero:      'Archivero',
    gaveta:         'Gaveta',
    boveda_externa: 'Bóveda externa',
    oficina:        'Oficina',
    digital:        'Digital',
    otro:           'Otro',
  };

  let tipos = [], subtipos = [], usos = [], ubicaciones = [], usuarios = [];
  let pestana = 'subtipos';   // el subtipo es lo que más se toca
  let filtroTipo = '';

  const style = document.createElement('style');
  style.textContent = `
    .cat-tabs{display:flex;gap:4px;border-bottom:1px solid var(--line);margin-bottom:16px;flex-wrap:wrap}
    .cat-tab{padding:8px 14px;font-size:13px;font-weight:600;color:var(--muted);cursor:pointer;
             border-bottom:2px solid transparent;margin-bottom:-1px}
    .cat-tab:hover{color:var(--text)}
    .cat-tab.on{color:var(--primary);border-bottom-color:var(--primary)}
    .campo-fila{border:1px solid var(--line);border-radius:10px;padding:11px;background:var(--panel2);margin-bottom:9px}
    .campo-fila .lin1{display:grid;grid-template-columns:1fr 1fr 150px auto auto;gap:8px;align-items:end}
    .campo-fila .lin2{margin-top:8px}
    .campo-lock{background:var(--line);cursor:not-allowed}
    .mini{font-size:11px;color:var(--muted);margin-top:2px}
    @media(max-width:860px){.campo-fila .lin1{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);

  // ── Carga ─────────────────────────────────────────────────
  async function cargar() {
    const [rt, rs, ru, rb, rus] = await Promise.all([
      KoguApi.apiFetch('/protected/doc/tipos'),
      KoguApi.apiFetch('/protected/doc/subtipos'),
      KoguApi.apiFetch('/protected/doc/usos'),
      KoguApi.apiFetch('/protected/doc/ubicaciones'),
      KoguApi.apiFetch('/protected/core/usuarios').catch(() => null),
    ]);
    tipos       = KoguApi.unwrapData(rt).rows || [];
    subtipos    = KoguApi.unwrapData(rs).rows || [];
    usos        = KoguApi.unwrapData(ru).rows || [];
    ubicaciones = KoguApi.unwrapData(rb).rows || [];
    usuarios    = rus ? (KoguApi.unwrapRows(rus) || []) : [];
  }

  const nombreTipo = (id) => tipos.find((t) => t.tipo_id === id)?.nombre || '—';

  // ── Armazón ───────────────────────────────────────────────
  function render() {
    $('pageContent').innerHTML = `
<div class="card">
  <div class="row">
    <div><div class="eyebrow">Configuración</div><h2>Catálogos documentales</h2>
      <div class="muted" style="font-size:12.5px">
        Definen cómo se clasifica cada documento y qué datos se le piden.</div></div>
    <div style="display:flex;gap:8px">
      <a class="btn ghost" href="/modules/doc/documentos.html">Ver documentos</a>
      <button class="btn" id="refreshBtn">Actualizar</button>
    </div>
  </div>

  ${!canManage ? `<div style="margin-top:14px">${D.nota(
    'Estás viendo el catálogo en modo consulta. Para modificarlo hace falta el permiso <span class="mono">doc.catalogos.manage</span>, reservado a administradores.')}</div>` : ''}

  <div class="cat-tabs" style="margin-top:18px">
    <div class="cat-tab" data-tab="tipos">Tipos <span class="badge">${tipos.length}</span></div>
    <div class="cat-tab" data-tab="subtipos">Subtipos <span class="badge">${subtipos.length}</span></div>
    <div class="cat-tab" data-tab="usos">Usos de asignación <span class="badge">${usos.length}</span></div>
    <div class="cat-tab" data-tab="ubicaciones">Ubicaciones <span class="badge">${ubicaciones.length}</span></div>
  </div>
  <div id="panel"></div>
</div>`;

    $('refreshBtn').onclick = recargar;
    document.querySelectorAll('.cat-tab').forEach((t) => {
      t.onclick = () => { pestana = t.dataset.tab; pintarPanel(); };
    });
    pintarPanel();
  }

  function pintarPanel() {
    document.querySelectorAll('.cat-tab').forEach((t) => t.classList.toggle('on', t.dataset.tab === pestana));
    if (pestana === 'tipos')            panelTipos();
    else if (pestana === 'subtipos')    panelSubtipos();
    else if (pestana === 'usos')        panelUsos();
    else                                panelUbicaciones();
  }

  const btnNuevo = (id, txt) =>
    canManage ? `<button class="btn primary" id="${id}">+ ${esc(txt)}</button>` : '';

  const chipActivo = (a) => a
    ? '<span class="badge success">activo</span>'
    : '<span class="badge neutral">inactivo</span>';

  // ── Tipos ─────────────────────────────────────────────────
  function panelTipos() {
    $('panel').innerHTML = `
      <div class="row" style="margin-bottom:12px">
        <div class="muted" style="font-size:12.5px">
          La primera clasificación. Si un tipo <strong>controla vigencia</strong>, todos sus documentos
          exigen fecha de vencimiento y entran a las alertas.</div>
        ${btnNuevo('newTipo', 'Nuevo tipo')}
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>Clave</th><th>Nombre</th><th>Vigencia</th>
          <th style="text-align:right">Subtipos</th><th style="text-align:right">Documentos</th>
          <th>Estado</th><th style="text-align:right"></th></tr></thead>
        <tbody>${tipos.length ? tipos.map((t) => `
          <tr>
            <td><span class="mono">${esc(t.clave)}</span></td>
            <td><strong>${esc(t.nombre)}</strong>
              ${t.descripcion ? `<div class="mini">${esc(t.descripcion)}</div>` : ''}</td>
            <td>${t.controla_vigencia
                  ? '<span class="badge warn">controla</span>'
                  : '<span class="muted">no aplica</span>'}</td>
            <td style="text-align:right">${t.subtipos_count ?? 0}</td>
            <td style="text-align:right">${t.documentos_count ?? 0}</td>
            <td>${chipActivo(t.activo)}</td>
            <td style="text-align:right">${canManage
              ? `<button class="btn ghost" data-edit-tipo="${t.tipo_id}">Editar</button>` : ''}</td>
          </tr>`).join('') : `<tr><td colspan="7" class="empty">Sin tipos.</td></tr>`}
        </tbody></table></div>`;

    if (canManage) {
      $('newTipo').onclick = () => modalTipo(null);
      $('panel').querySelectorAll('[data-edit-tipo]').forEach((btn) => {
        btn.onclick = () => modalTipo(tipos.find((t) => t.tipo_id === btn.dataset.editTipo));
      });
    }
  }

  function modalTipo(t) {
    const nuevo = !t;
    const m = D.modal('mTipo', nuevo ? 'Nuevo tipo' : 'Editar tipo', 'Catálogo', `
      <div class="grid-2">
        <div><div class="label-text">Clave <span style="color:var(--danger)">*</span></div>
          <input class="input" id="t_clave" maxlength="30" value="${esc(t?.clave || '')}" placeholder="CORP" />
          <div class="mini">Corta y en mayúsculas. Es como se identifica internamente.</div></div>
        <div><div class="label-text">Nombre <span style="color:var(--danger)">*</span></div>
          <input class="input" id="t_nombre" value="${esc(t?.nombre || '')}" placeholder="Corporativo / Legal" /></div>
      </div>
      <div><div class="label-text">Descripción</div>
        <input class="input" id="t_desc" value="${esc(t?.descripcion || '')}" /></div>
      <div class="grid-2">
        <div><div class="label-text">¿Controla vigencia?</div>
          <select class="select" id="t_vig">
            <option value="false"${!t?.controla_vigencia ? ' selected' : ''}>No</option>
            <option value="true"${t?.controla_vigencia ? ' selected' : ''}>Sí — exige fecha de vencimiento</option>
          </select>
          <div class="mini">Actívalo para licencias, permisos y opiniones fiscales.</div></div>
        <div><div class="label-text">Orden</div>
          <input class="input" id="t_orden" type="number" step="1" value="${t?.orden ?? 0}" />
          <div class="mini">Con qué prioridad aparece en listas y tablero.</div></div>
      </div>
      ${nuevo ? '' : `<div><div class="label-text">Estado</div>
        <select class="select" id="t_activo">
          <option value="true"${t.activo ? ' selected' : ''}>Activo</option>
          <option value="false"${!t.activo ? ' selected' : ''}>Inactivo — deja de ofrecerse en altas</option>
        </select></div>`}
    `, nuevo ? 'Crear' : 'Guardar');

    m.ok.onclick = async () => {
      const body = {
        clave:             $('t_clave').value.trim().toUpperCase(),
        nombre:            $('t_nombre').value.trim(),
        descripcion:       $('t_desc').value.trim() || null,
        controla_vigencia: $('t_vig').value === 'true',
        orden:             Number($('t_orden').value || 0),
      };
      if (!nuevo) body.activo = $('t_activo').value === 'true';
      if (!body.clave || !body.nombre) return KoguApi.toast('Clave y nombre son obligatorios.', 'error');

      await guardar(m, nuevo
        ? { url: '/protected/doc/tipos', method: 'POST' }
        : { url: '/protected/doc/tipos/' + encodeURIComponent(t.tipo_id), method: 'PUT' },
        body, nuevo ? 'Tipo creado' : 'Tipo actualizado');
    };
  }

  // ── Subtipos + editor de campos ───────────────────────────
  function panelSubtipos() {
    const lista = filtroTipo ? subtipos.filter((s) => s.tipo_id === filtroTipo) : subtipos;

    $('panel').innerHTML = `
      <div class="row" style="margin-bottom:12px">
        <div style="flex:1;min-width:220px;max-width:320px">
          <select class="select" id="fTipo">
            <option value="">Todos los tipos</option>
            ${tipos.map((t) => `<option value="${t.tipo_id}"${t.tipo_id === filtroTipo ? ' selected' : ''}>${esc(t.nombre)}</option>`).join('')}
          </select>
        </div>
        ${btnNuevo('newSub', 'Nuevo subtipo')}
      </div>
      <div class="muted" style="font-size:12.5px;margin-bottom:12px">
        El subtipo define <strong>qué datos se le piden</strong> a ese documento. Cambiar sus campos
        cambia el formulario de alta al instante, sin desplegar nada.</div>
      <div class="table-wrap"><table>
        <thead><tr><th>Clave</th><th>Subtipo</th><th>Tipo</th>
          <th style="text-align:right">Campos</th><th>Folio externo</th>
          <th style="text-align:right">Documentos</th><th>Estado</th><th style="text-align:right"></th></tr></thead>
        <tbody>${lista.length ? lista.map((s) => {
          const nCampos = Array.isArray(s.esquema_campos) ? s.esquema_campos.length : 0;
          return `<tr>
            <td><span class="mono">${esc(s.clave)}</span></td>
            <td><strong>${esc(s.nombre)}</strong></td>
            <td>${esc(s.tipo_nombre || nombreTipo(s.tipo_id))}</td>
            <td style="text-align:right">${nCampos || '<span class="muted">ninguno</span>'}</td>
            <td>${s.requiere_folio_externo
                  ? '<span class="badge primary">requerido</span>'
                  : '<span class="muted">opcional</span>'}</td>
            <td style="text-align:right">${s.documentos_count ?? 0}</td>
            <td>${chipActivo(s.activo)}</td>
            <td style="text-align:right">${canManage
              ? `<button class="btn ghost" data-edit-sub="${s.subtipo_id}">Editar</button>` : ''}</td>
          </tr>`;
        }).join('') : `<tr><td colspan="8" class="empty">Sin subtipos para este filtro.</td></tr>`}
        </tbody></table></div>`;

    $('fTipo').onchange = (e) => { filtroTipo = e.target.value; panelSubtipos(); };
    if (canManage) {
      $('newSub').onclick = () => modalSubtipo(null);
      $('panel').querySelectorAll('[data-edit-sub]').forEach((btn) => {
        btn.onclick = () => modalSubtipo(subtipos.find((s) => s.subtipo_id === btn.dataset.editSub));
      });
    }
  }

  // Estado del editor de campos mientras el modal está abierto.
  let campos = [];
  let clavesOriginales = new Set();
  let bloquearClaves = false;

  function modalSubtipo(s) {
    const nuevo = !s;
    campos = nuevo ? [] : JSON.parse(JSON.stringify(s.esquema_campos || []));
    clavesOriginales = new Set(campos.map((c) => c.clave));

    // Si ya hay documentos capturados, las claves existentes se
    // congelan: renombrarlas escondería los valores ya guardados.
    bloquearClaves = !nuevo && (s.documentos_count ?? 0) > 0;

    const m = D.modal('mSub', nuevo ? 'Nuevo subtipo' : 'Editar subtipo',
      nuevo ? 'Catálogo' : esc(s.tipo_nombre || ''), `
      <div class="grid-2">
        <div><div class="label-text">Tipo <span style="color:var(--danger)">*</span></div>
          ${nuevo
            ? `<select class="select" id="s_tipo"><option value="">Selecciona…</option>
                ${tipos.filter((t) => t.activo).map((t) => `<option value="${t.tipo_id}">${esc(t.nombre)}</option>`).join('')}</select>`
            : `<input class="input campo-lock" value="${esc(s.tipo_nombre || '')}" readonly />
               <div class="mini">El tipo no se cambia: el subtipo le pertenece.</div>`}
        </div>
        <div><div class="label-text">Clave <span style="color:var(--danger)">*</span></div>
          <input class="input" id="s_clave" maxlength="30" value="${esc(s?.clave || '')}" placeholder="ACTA-CONST" /></div>
      </div>
      <div><div class="label-text">Nombre <span style="color:var(--danger)">*</span></div>
        <input class="input" id="s_nombre" value="${esc(s?.nombre || '')}" placeholder="Acta constitutiva" /></div>
      <div class="grid-2">
        <div><div class="label-text">¿Exige folio externo?</div>
          <select class="select" id="s_folio">
            <option value="false"${!s?.requiere_folio_externo ? ' selected' : ''}>No</option>
            <option value="true"${s?.requiere_folio_externo ? ' selected' : ''}>Sí</option>
          </select>
          <div class="mini">Número de escritura, folio mercantil, número de registro.</div></div>
        ${nuevo ? '<div></div>' : `<div><div class="label-text">Estado</div>
          <select class="select" id="s_activo">
            <option value="true"${s.activo ? ' selected' : ''}>Activo</option>
            <option value="false"${!s.activo ? ' selected' : ''}>Inactivo</option>
          </select></div>`}
      </div>

      <div style="border-top:1px solid var(--line);padding-top:16px;margin-top:4px">
        <div class="row" style="margin-bottom:8px">
          <div><strong style="font-size:14px">Campos que se piden al capturar</strong>
            <div class="mini">Además de folio, fecha, emisor y vigencia, que siempre se piden.</div></div>
          <button class="btn" id="addCampo">+ Agregar campo</button>
        </div>
        ${bloquearClaves ? `<div style="margin-bottom:10px">${D.nota(
          `Este subtipo ya tiene <strong>${s.documentos_count} documento(s)</strong> capturados. Las claves de los campos existentes quedan bloqueadas: renombrarlas dejaría los valores ya guardados invisibles en el formulario. Puedes cambiar la etiqueta, la obligatoriedad y las opciones, y agregar campos nuevos.`)}</div>` : ''}
        <div id="campos"></div>
        <div style="border-top:1px dashed var(--line);margin-top:14px;padding-top:12px">
          <div class="label-text">Así se verá el formulario</div>
          <div id="preview" style="margin-top:6px"></div>
        </div>
      </div>
    `, nuevo ? 'Crear' : 'Guardar', 820);

    $('addCampo').onclick = () => {
      campos.push({ clave: '', label: '', tipo: 'text', requerido: false });
      pintarCampos();
    };
    pintarCampos();

    m.ok.onclick = async () => {
      const esquema = leerCampos();
      if (esquema === null) return;

      const body = {
        clave:                  $('s_clave').value.trim().toUpperCase(),
        nombre:                 $('s_nombre').value.trim(),
        requiere_folio_externo: $('s_folio').value === 'true',
        esquema_campos:         esquema,
      };
      if (!nuevo) body.activo = $('s_activo').value === 'true';
      if (!body.clave || !body.nombre) return KoguApi.toast('Clave y nombre son obligatorios.', 'error');

      let destino;
      if (nuevo) {
        const tipoId = $('s_tipo').value;
        if (!tipoId) return KoguApi.toast('Elige a qué tipo pertenece el subtipo.', 'error');
        destino = { url: `/protected/doc/tipos/${encodeURIComponent(tipoId)}/subtipos`, method: 'POST' };
      } else {
        destino = { url: '/protected/doc/subtipos/' + encodeURIComponent(s.subtipo_id), method: 'PUT' };
      }
      await guardar(m, destino, body, nuevo ? 'Subtipo creado' : 'Subtipo actualizado');
    };
  }

  /** Sugiere una clave a partir de la etiqueta: minúsculas y guion bajo. */
  function claveDesdeLabel(label) {
    return String(label || '').toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
      .replace(/^([0-9])/, 'c$1')
      .slice(0, 40);
  }

  function pintarCampos() {
    const cont = $('campos');
    if (!campos.length) {
      cont.innerHTML = `<div class="empty" style="padding:18px">
        Sin campos propios. El documento solo pedirá los datos generales.</div>`;
      pintarPreview();
      return;
    }

    cont.innerHTML = campos.map((c, i) => {
      const congelada = bloquearClaves && clavesOriginales.has(c.clave);
      return `<div class="campo-fila">
        <div class="lin1">
          <div><div class="label-text">Etiqueta</div>
            <input class="input" data-c="label" data-i="${i}" value="${esc(c.label || '')}"
                   placeholder="Número de escritura" /></div>
          <div><div class="label-text">Clave</div>
            <input class="input${congelada ? ' campo-lock' : ''}" data-c="clave" data-i="${i}"
                   value="${esc(c.clave || '')}" ${congelada ? 'readonly' : ''} placeholder="numero_escritura" />
            ${congelada ? '<div class="mini">Bloqueada: ya hay datos guardados con esta clave.</div>' : ''}</div>
          <div><div class="label-text">Tipo</div>
            <select class="select" data-c="tipo" data-i="${i}">
              ${Object.entries(TIPOS_CAMPO).map(([k, v]) =>
                `<option value="${k}"${c.tipo === k ? ' selected' : ''}>${v}</option>`).join('')}
            </select></div>
          <div><div class="label-text">Obligatorio</div>
            <select class="select" data-c="requerido" data-i="${i}">
              <option value="false"${!c.requerido ? ' selected' : ''}>No</option>
              <option value="true"${c.requerido ? ' selected' : ''}>Sí</option>
            </select></div>
          <div><div class="label-text">&nbsp;</div>
            <button class="btn ghost" data-quitar="${i}" title="Quitar campo">Quitar</button></div>
        </div>
        ${c.tipo === 'select' ? `<div class="lin2">
          <div class="label-text">Opciones (una por línea)</div>
          <textarea class="input" data-c="opciones" data-i="${i}" rows="3"
            style="resize:vertical">${esc((c.opciones || []).join('\n'))}</textarea>
        </div>` : ''}
      </div>`;
    }).join('');

    cont.querySelectorAll('[data-c]').forEach((el) => {
      const i = Number(el.dataset.i);
      const campo = el.dataset.c;
      const aplicar = () => {
        if (campo === 'requerido')      campos[i].requerido = el.value === 'true';
        else if (campo === 'opciones')  campos[i].opciones = el.value.split('\n').map((x) => x.trim()).filter(Boolean);
        else                            campos[i][campo] = el.value;

        // Al escribir la etiqueta se propone la clave, pero solo mientras
        // el campo es nuevo y nadie la ha tocado: nunca se pisa una clave
        // escrita a mano ni una que ya tiene datos.
        if (campo === 'label' && !clavesOriginales.has(campos[i].clave)
            && (!campos[i].clave || campos[i].clave === claveDesdeLabel(campos[i]._labelPrev || ''))) {
          campos[i].clave = claveDesdeLabel(el.value);
          const inpClave = cont.querySelector(`[data-c="clave"][data-i="${i}"]`);
          if (inpClave) inpClave.value = campos[i].clave;
        }
        if (campo === 'label') campos[i]._labelPrev = el.value;

        pintarPreview();
        if (campo === 'tipo') pintarCampos();   // aparece o desaparece el bloque de opciones
      };
      el.oninput  = aplicar;
      el.onchange = aplicar;
    });

    cont.querySelectorAll('[data-quitar]').forEach((btn) => {
      btn.onclick = () => {
        const i = Number(btn.dataset.quitar);
        const c = campos[i];
        if (clavesOriginales.has(c.clave)
            && !window.confirm(`¿Quitar «${c.label || c.clave}»?\n\nLo ya capturado en ese campo se conserva en la base, pero dejará de mostrarse. Si vuelves a agregarlo con la misma clave, reaparece.`)) return;
        campos.splice(i, 1);
        pintarCampos();
      };
    });

    pintarPreview();
  }

  // Vista previa en vivo: se pinta con el MISMO render que usa el alta
  // real, así que lo que se ve aquí es exactamente lo que verá quien
  // capture. Si la vista previa se ve rara, el formulario también.
  function pintarPreview() {
    const limpio = campos
      .filter((c) => c.clave && c.label)
      .map((c) => ({ ...c, clave: 'preview_' + c.clave }));
    D.renderCamposDinamicos($('preview'), limpio, {});
    $('preview').querySelectorAll('input,select,textarea').forEach((el) => { el.disabled = true; });
  }

  /** Valida el editor y devuelve el esquema, o null si algo está mal. */
  function leerCampos() {
    const vistas = new Set();
    const salida = [];

    for (let i = 0; i < campos.length; i += 1) {
      const c = campos[i];
      const pos = `campo #${i + 1}`;
      const clave = String(c.clave || '').trim();
      const label = String(c.label || '').trim();

      if (!label) { KoguApi.toast(`${pos}: falta la etiqueta.`, 'error'); return null; }
      if (!/^[a-z][a-z0-9_]{0,39}$/.test(clave)) {
        KoguApi.toast(`${pos} («${label}»): la clave debe ser minúsculas, números y guion bajo, empezando por letra.`, 'error');
        return null;
      }
      if (vistas.has(clave)) {
        KoguApi.toast(`${pos}: la clave «${clave}» está repetida.`, 'error'); return null;
      }
      vistas.add(clave);

      const salidaCampo = { clave, label, tipo: c.tipo || 'text', requerido: c.requerido === true };
      if (salidaCampo.tipo === 'select') {
        const ops = (c.opciones || []).filter(Boolean);
        if (!ops.length) {
          KoguApi.toast(`${pos} («${label}»): una lista necesita al menos una opción.`, 'error'); return null;
        }
        salidaCampo.opciones = ops;
      }
      salida.push(salidaCampo);
    }
    return salida;
  }

  // ── Usos ──────────────────────────────────────────────────
  function panelUsos() {
    $('panel').innerHTML = `
      <div class="row" style="margin-bottom:12px">
        <div class="muted" style="font-size:12.5px">
          Para qué se entrega una copia. El plazo sugerido alimenta la fecha de devolución esperada.</div>
        ${btnNuevo('newUso', 'Nuevo uso')}
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>Clave</th><th>Uso</th><th style="text-align:right">Plazo</th>
          <th>Devolución</th><th style="text-align:right">Asignaciones</th><th>Estado</th>
          <th style="text-align:right"></th></tr></thead>
        <tbody>${usos.length ? usos.map((u) => `
          <tr>
            <td><span class="mono">${esc(u.clave)}</span></td>
            <td><strong>${esc(u.nombre)}</strong>
              ${u.descripcion ? `<div class="mini">${esc(u.descripcion)}</div>` : ''}</td>
            <td style="text-align:right">${u.dias_devolucion_default ? u.dias_devolucion_default + ' días' : '—'}</td>
            <td>${u.requiere_devolucion
                  ? '<span class="badge primary">se devuelve</span>'
                  : '<span class="badge neutral">entrega definitiva</span>'}</td>
            <td style="text-align:right">${u.asignaciones_count ?? 0}</td>
            <td>${chipActivo(u.activo)}</td>
            <td style="text-align:right">${canManage
              ? `<button class="btn ghost" data-edit-uso="${u.uso_id}">Editar</button>` : ''}</td>
          </tr>`).join('') : `<tr><td colspan="7" class="empty">Sin usos.</td></tr>`}
        </tbody></table></div>`;

    if (canManage) {
      $('newUso').onclick = () => modalUso(null);
      $('panel').querySelectorAll('[data-edit-uso]').forEach((btn) => {
        btn.onclick = () => modalUso(usos.find((u) => u.uso_id === btn.dataset.editUso));
      });
    }
  }

  function modalUso(u) {
    const nuevo = !u;
    const m = D.modal('mUso', nuevo ? 'Nuevo uso' : 'Editar uso', 'Catálogo', `
      <div class="grid-2">
        <div><div class="label-text">Clave <span style="color:var(--danger)">*</span></div>
          <input class="input" id="u_clave" maxlength="30" value="${esc(u?.clave || '')}" placeholder="BANCO" /></div>
        <div><div class="label-text">Nombre <span style="color:var(--danger)">*</span></div>
          <input class="input" id="u_nombre" value="${esc(u?.nombre || '')}" placeholder="Apertura de cuenta bancaria" /></div>
      </div>
      <div><div class="label-text">Descripción</div>
        <input class="input" id="u_desc" value="${esc(u?.descripcion || '')}" /></div>
      <div class="grid-2">
        <div><div class="label-text">¿Se devuelve la copia?</div>
          <select class="select" id="u_req">
            <option value="true"${u?.requiere_devolucion !== false ? ' selected' : ''}>Sí, regresa al archivo</option>
            <option value="false"${u?.requiere_devolucion === false ? ' selected' : ''}>No, entrega definitiva</option>
          </select>
          <div class="mini">La entrega definitiva cierra la asignación al momento y no genera alertas.</div></div>
        <div><div class="label-text">Plazo sugerido (días)</div>
          <input class="input" id="u_dias" type="number" min="1" step="1" value="${u?.dias_devolucion_default ?? ''}" />
          <div class="mini">Se propone al asignar; siempre se puede cambiar.</div></div>
      </div>
      ${nuevo ? '' : `<div><div class="label-text">Estado</div>
        <select class="select" id="u_activo">
          <option value="true"${u.activo ? ' selected' : ''}>Activo</option>
          <option value="false"${!u.activo ? ' selected' : ''}>Inactivo</option>
        </select></div>`}
    `, nuevo ? 'Crear' : 'Guardar');

    m.ok.onclick = async () => {
      const dias = $('u_dias').value.trim();
      const requiere = $('u_req').value === 'true';
      const body = {
        clave:               $('u_clave').value.trim().toUpperCase(),
        nombre:              $('u_nombre').value.trim(),
        descripcion:         $('u_desc').value.trim() || null,
        requiere_devolucion: requiere,
        dias_devolucion_default: dias ? Number(dias) : null,
      };
      if (!nuevo) body.activo = $('u_activo').value === 'true';
      if (!body.clave || !body.nombre) return KoguApi.toast('Clave y nombre son obligatorios.', 'error');
      if (!requiere && dias) {
        return KoguApi.toast('Una entrega definitiva no lleva plazo de devolución: la copia no regresa.', 'error');
      }
      await guardar(m, nuevo
        ? { url: '/protected/doc/usos', method: 'POST' }
        : { url: '/protected/doc/usos/' + encodeURIComponent(u.uso_id), method: 'PUT' },
        body, nuevo ? 'Uso creado' : 'Uso actualizado');
    };
  }

  // ── Ubicaciones ───────────────────────────────────────────
  function panelUbicaciones() {
    $('panel').innerHTML = `
      <div class="row" style="margin-bottom:12px">
        <div class="muted" style="font-size:12.5px">
          Dónde vive físicamente cada copia cuando está en el archivo.</div>
        ${btnNuevo('newUbi', 'Nueva ubicación')}
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>Clave</th><th>Ubicación</th><th>Tipo</th><th>Dentro de</th>
          <th>Responsable</th><th style="text-align:right">Copias</th><th>Estado</th>
          <th style="text-align:right"></th></tr></thead>
        <tbody>${ubicaciones.length ? ubicaciones.map((b2) => `
          <tr>
            <td><span class="mono">${esc(b2.clave)}</span></td>
            <td><strong>${esc(b2.nombre)}</strong>
              ${b2.es_externa ? '<span class="badge warn" style="margin-left:6px">externa</span>' : ''}</td>
            <td>${esc(TIPOS_UBI[b2.tipo] || b2.tipo)}</td>
            <td>${b2.padre_nombre ? esc(b2.padre_nombre) : '<span class="muted">—</span>'}</td>
            <td>${b2.responsable_nombre ? esc(b2.responsable_nombre) : '<span class="muted">—</span>'}</td>
            <td style="text-align:right">${b2.copias_count ?? 0}</td>
            <td>${chipActivo(b2.activo)}</td>
            <td style="text-align:right">${canManage
              ? `<button class="btn ghost" data-edit-ubi="${b2.ubicacion_id}">Editar</button>` : ''}</td>
          </tr>`).join('') : `<tr><td colspan="8" class="empty">Sin ubicaciones.</td></tr>`}
        </tbody></table></div>`;

    if (canManage) {
      $('newUbi').onclick = () => modalUbicacion(null);
      $('panel').querySelectorAll('[data-edit-ubi]').forEach((btn) => {
        btn.onclick = () => modalUbicacion(ubicaciones.find((x) => x.ubicacion_id === btn.dataset.editUbi));
      });
    }
  }

  function modalUbicacion(u) {
    const nuevo = !u;
    const padres = ubicaciones.filter((x) => !u || x.ubicacion_id !== u.ubicacion_id);
    const m = D.modal('mUbi', nuevo ? 'Nueva ubicación' : 'Editar ubicación', 'Catálogo', `
      <div class="grid-2">
        <div><div class="label-text">Clave <span style="color:var(--danger)">*</span></div>
          <input class="input" id="b_clave" maxlength="30" value="${esc(u?.clave || '')}" placeholder="CAJA-DIR" /></div>
        <div><div class="label-text">Nombre <span style="color:var(--danger)">*</span></div>
          <input class="input" id="b_nombre" value="${esc(u?.nombre || '')}" placeholder="Caja fuerte · Dirección" /></div>
      </div>
      <div class="grid-2">
        <div><div class="label-text">Tipo <span style="color:var(--danger)">*</span></div>
          <select class="select" id="b_tipo">
            ${Object.entries(TIPOS_UBI).map(([k, v]) =>
              `<option value="${k}"${u?.tipo === k ? ' selected' : ''}>${v}</option>`).join('')}
          </select></div>
        <div><div class="label-text">Dentro de</div>
          <select class="select" id="b_padre">
            <option value="">Ninguna</option>
            ${padres.map((p) => `<option value="${p.ubicacion_id}"${u?.ubicacion_padre_id === p.ubicacion_id ? ' selected' : ''}>${esc(p.nombre)}</option>`).join('')}
          </select>
          <div class="mini">Para jerarquías: archivero → gaveta.</div></div>
      </div>
      <div class="grid-2">
        <div><div class="label-text">Responsable</div>
          <select class="select" id="b_resp">
            <option value="">Sin responsable</option>
            ${usuarios.map((x) => `<option value="${x.user_id}"${u?.responsable_user_id === x.user_id ? ' selected' : ''}>${esc(x.nombre)}</option>`).join('')}
          </select></div>
        <div><div class="label-text">¿Está fuera de la empresa?</div>
          <select class="select" id="b_ext">
            <option value="false"${!u?.es_externa ? ' selected' : ''}>No</option>
            <option value="true"${u?.es_externa ? ' selected' : ''}>Sí — notaría, banco, despacho</option>
          </select></div>
      </div>
      ${nuevo ? '' : `<div><div class="label-text">Estado</div>
        <select class="select" id="b_activo">
          <option value="true"${u.activo ? ' selected' : ''}>Activo</option>
          <option value="false"${!u.activo ? ' selected' : ''}>Inactivo</option>
        </select></div>`}
    `, nuevo ? 'Crear' : 'Guardar');

    m.ok.onclick = async () => {
      const body = {
        clave:               $('b_clave').value.trim().toUpperCase(),
        nombre:              $('b_nombre').value.trim(),
        tipo:                $('b_tipo').value,
        ubicacion_padre_id:  $('b_padre').value || null,
        responsable_user_id: $('b_resp').value || null,
        es_externa:          $('b_ext').value === 'true',
      };
      if (!nuevo) body.activo = $('b_activo').value === 'true';
      if (!body.clave || !body.nombre) return KoguApi.toast('Clave y nombre son obligatorios.', 'error');
      await guardar(m, nuevo
        ? { url: '/protected/doc/ubicaciones', method: 'POST' }
        : { url: '/protected/doc/ubicaciones/' + encodeURIComponent(u.ubicacion_id), method: 'PUT' },
        body, nuevo ? 'Ubicación creada' : 'Ubicación actualizada');
    };
  }

  // ── Guardado común ────────────────────────────────────────
  async function guardar(m, destino, body, mensajeOk) {
    await KoguUi.withLoading(m.ok, async () => {
      try {
        await KoguApi.apiFetch(destino.url, { method: destino.method, body: JSON.stringify(body) });
        KoguApi.toast(mensajeOk, 'success');
        m.cerrar();
        await recargar();
      } catch (e) { D.errorToast(e, 'No fue posible guardar.'); }
    }, 'Guardando…');
  }

  async function recargar() {
    try { await cargar(); render(); }
    catch (e) { D.errorToast(e, 'No fue posible cargar los catálogos.'); }
  }

  window.addEventListener('kogu:empresa-activa-cambiada', () => { filtroTipo = ''; recargar(); });

  try {
    await cargar();
    render();
  } catch (e) {
    $('pageContent').innerHTML =
      `<div class="card"><div class="empty">${esc(e?.message || 'No fue posible cargar los catálogos.')}</div></div>`;
  }
});

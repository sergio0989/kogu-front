// ============================================================
// catalogos.js
// Pantalla: Catálogos de Control Documental.
//   Tipos · Subtipos (con editor de campos) · Usos · Ubicaciones
//
// Lo que hace especial a esta pantalla es el EDITOR DE CAMPOS del
// subtipo. `cat_doc_subtipos.esquema_campos` define qué captura cada
// clase de documento; el alta lo lee y arma el formulario sola. Con
// este editor, dar de alta "Contrato de comodato" con sus propios
// campos deja de necesitar una migración y un despliegue.
//
// El precio es que un esquema mal armado rompe la captura de TODOS los
// documentos de ese subtipo, así que aquí se valida lo mismo que valida
// el backend (clave con formato, sin repetir, etiqueta obligatoria,
// tipo soportado, opciones si es lista) y además se muestra una vista
// previa del formulario resultante antes de guardar.
//
// Permiso: doc.catalogos.manage para escribir (hoy solo Administrador).
// Módulo: Control Documental (doc_) — v1.
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const b = await KoguShell.initShell({
    currentPage:        '/modules/doc/catalogos.html',
    title:              'Catálogos documentales',
    description:        'Tipos, subtipos y sus campos, usos de asignación y ubicaciones.',
    requiredPermission: 'doc.catalogos.read',
  });
  if (!b) return;

  const D    = window.KoguDoc;
  const esc  = D.esc;
  const $    = (id) => document.getElementById(id);
  const puedeEditar = (b.permisos_globales || []).includes('doc.catalogos.manage');

  // Tipos de campo soportados por el motor de captura (doc-esquema.js).
  const TIPOS_CAMPO = [
    { v: 'text',     n: 'Texto corto' },
    { v: 'textarea', n: 'Texto largo' },
    { v: 'int',      n: 'Número entero' },
    { v: 'decimal',  n: 'Número con decimales' },
    { v: 'money',    n: 'Importe' },
    { v: 'date',     n: 'Fecha' },
    { v: 'bool',     n: 'Sí / No' },
    { v: 'select',   n: 'Lista de opciones' },
  ];
  const TIPOS_UBICACION = [
    { v: 'caja_fuerte',    n: 'Caja fuerte' },
    { v: 'archivero',      n: 'Archivero' },
    { v: 'gaveta',         n: 'Gaveta' },
    { v: 'boveda_externa', n: 'Bóveda externa' },
    { v: 'oficina',        n: 'Oficina' },
    { v: 'digital',        n: 'Repositorio digital' },
    { v: 'otro',           n: 'Otro' },
  ];
  const CLAVE_CAMPO_RE = /^[a-z][a-z0-9_]{0,39}$/;

  let tipos = [], subtipos = [], usos = [], ubicaciones = [], usuarios = [];
  let pestana = 'tipos';

  const style = document.createElement('style');
  style.textContent = `
    .doc-tabs{display:flex;gap:4px;border-bottom:1px solid var(--line);margin:14px 0 18px;flex-wrap:wrap}
    .doc-tab{padding:9px 16px;font-size:13px;font-weight:600;color:var(--muted);cursor:pointer;
             border-bottom:2px solid transparent;margin-bottom:-1px}
    .doc-tab:hover{color:var(--text)}
    .doc-tab.on{color:var(--primary);border-bottom-color:var(--primary)}
    .campo-fila{display:grid;grid-template-columns:1fr 1.3fr 1fr auto auto;gap:8px;align-items:start;
                padding:10px;border:1px solid var(--line);border-radius:10px;background:var(--panel2);margin-bottom:8px}
    .campo-fila .mini{font-size:10.5px;color:var(--muted);margin-bottom:3px;font-weight:600;letter-spacing:.02em}
    .campo-req{display:flex;align-items:center;gap:5px;font-size:12px;white-space:nowrap;padding-top:20px}
    .campo-del{padding-top:16px}
    .previa{border:1px dashed var(--line);border-radius:10px;padding:14px;background:var(--panel2)}
    @media(max-width:820px){.campo-fila{grid-template-columns:1fr 1fr}}
  `;
  document.head.appendChild(style);

  $('pageContent').innerHTML = `
<div class="card">
  <div class="row">
    <div><div class="eyebrow">Configuración</div><h2>Catálogos documentales</h2></div>
    <button class="btn" id="refreshBtn">Actualizar</button>
  </div>
  ${puedeEditar ? '' : `<div class="muted" style="margin-top:10px;font-size:12.5px;border:1px solid var(--line);border-radius:10px;padding:10px 12px">
    Estás viendo los catálogos en modo consulta. Modificarlos requiere el permiso <span class="mono">doc.catalogos.manage</span>.</div>`}

  <div class="doc-tabs">
    <div class="doc-tab on" data-tab="tipos">Tipos</div>
    <div class="doc-tab" data-tab="subtipos">Subtipos y sus campos</div>
    <div class="doc-tab" data-tab="usos">Usos de asignación</div>
    <div class="doc-tab" data-tab="ubicaciones">Ubicaciones</div>
  </div>

  <div id="panel"></div>
</div>`;

  const badgeActivo = (v) =>
    v ? `<span class="badge success">Activo</span>` : `<span class="badge">Inactivo</span>`;
  const btnEditar = (id) => puedeEditar
    ? `<button class="btn ghost" data-edit="${id}" style="padding:4px 10px;font-size:12px">Editar</button>` : '';
  const vacio = (n, txt) => `<tr><td colspan="${n}" class="empty">${txt}</td></tr>`;

  function cabecera(titulo, sub, textoBoton) {
    return `<div class="row" style="margin-bottom:12px">
      <div><h3 style="margin:0">${esc(titulo)}</h3>
        <div class="muted" style="font-size:12.5px;margin-top:2px">${sub}</div></div>
      ${puedeEditar ? `<button class="btn primary" id="nuevoBtn">${esc(textoBoton)}</button>` : ''}
    </div>`;
  }

  // ══════════════════════════════════════════════════════════
  // TIPOS
  // ══════════════════════════════════════════════════════════
  function renderTipos() {
    $('panel').innerHTML = cabecera(
      'Tipos de documento',
      'La primera división: corporativo, fiscal, contractual… El tipo decide si sus documentos controlan vigencia.',
      '+ Nuevo tipo',
    ) + `<div class="table-wrap"><table>
      <thead><tr>
        <th>Clave</th><th>Nombre</th><th>Vigencia</th>
        <th style="text-align:right">Subtipos</th><th style="text-align:right">Documentos</th>
        <th>Estado</th><th></th>
      </tr></thead>
      <tbody>${
        tipos.length ? tipos.map((t) => `<tr>
          <td><span class="mono">${esc(t.clave)}</span></td>
          <td>${esc(t.nombre)}${t.descripcion ? `<div class="muted" style="font-size:11.5px">${esc(t.descripcion)}</div>` : ''}</td>
          <td>${t.controla_vigencia ? '<span class="badge warn">Controla</span>' : '<span class="badge">No</span>'}</td>
          <td style="text-align:right">${Number(t.subtipos_count ?? 0)}</td>
          <td style="text-align:right">${Number(t.documentos_count ?? 0)}</td>
          <td>${badgeActivo(t.activo)}</td>
          <td style="text-align:right">${btnEditar(t.tipo_id)}</td>
        </tr>`).join('') : vacio(7, 'Sin tipos.')
      }</tbody></table></div>`;

    if (puedeEditar) {
      $('nuevoBtn').onclick = () => modalTipo(null);
      $('panel').querySelectorAll('[data-edit]').forEach((btn) => {
        btn.onclick = () => modalTipo(tipos.find((t) => t.tipo_id === btn.dataset.edit));
      });
    }
  }

  function modalTipo(t) {
    const editando = !!t;
    const m = D.modal('mTipo', editando ? 'Editar tipo' : 'Nuevo tipo',
      'Catálogo', `
      <div class="grid-2">
        <div><div class="label-text">Clave <span style="color:var(--danger)">*</span></div>
          <input class="input" id="tClave" maxlength="30" placeholder="CORP" value="${esc(t?.clave || '')}"/>
          <div class="muted" style="font-size:11px;margin-top:2px">Corta y estable. Es la que se ve en reportes.</div></div>
        <div><div class="label-text">Nombre <span style="color:var(--danger)">*</span></div>
          <input class="input" id="tNombre" placeholder="Corporativo / Legal" value="${esc(t?.nombre || '')}"/></div>
      </div>
      <div><div class="label-text">Descripción</div>
        <input class="input" id="tDesc" value="${esc(t?.descripcion || '')}"/></div>
      <div class="grid-2">
        <div><div class="label-text">Orden</div>
          <input class="input" id="tOrden" type="number" value="${Number(t?.orden ?? 0)}"/>
          <div class="muted" style="font-size:11px;margin-top:2px">Posición en el tablero y en los filtros.</div></div>
        <div><div class="label-text">Estado</div>
          <select class="select" id="tActivo">
            <option value="true"${t && !t.activo ? '' : ' selected'}>Activo</option>
            <option value="false"${t && !t.activo ? ' selected' : ''}>Inactivo</option>
          </select></div>
      </div>
      <label style="display:flex;align-items:center;gap:8px;font-size:13px">
        <input type="checkbox" id="tVigencia" ${t?.controla_vigencia ? 'checked' : ''}/>
        Los documentos de este tipo controlan vigencia
      </label>
      <div class="muted" style="font-size:12px">
        Al activarlo, cada documento de este tipo exigirá fecha de vencimiento y entrará a las alertas.
        Es lo correcto para opiniones de cumplimiento, licencias y contratos; no para un acta constitutiva.
      </div>`, editando ? 'Guardar' : 'Crear');

    m.ok.onclick = async () => {
      const body = {
        clave:             $('tClave').value.trim(),
        nombre:            $('tNombre').value.trim(),
        descripcion:       $('tDesc').value.trim() || null,
        orden:             parseInt($('tOrden').value, 10) || 0,
        activo:            $('tActivo').value === 'true',
        controla_vigencia: $('tVigencia').checked,
      };
      if (!body.clave || !body.nombre) return KoguApi.toast('Clave y nombre son obligatorios.', 'error');
      m.ok.disabled = true;
      try {
        await KoguApi.apiFetch(editando ? `/protected/doc/tipos/${t.tipo_id}` : '/protected/doc/tipos',
          { method: editando ? 'PUT' : 'POST', body: JSON.stringify(body) });
        KoguApi.toast(editando ? 'Tipo actualizado' : 'Tipo creado', 'success');
        m.cerrar(); await cargar();
      } catch (e) { m.ok.disabled = false; D.errorToast(e, 'No fue posible guardar el tipo.'); }
    };
  }

  // ══════════════════════════════════════════════════════════
  // SUBTIPOS — con editor de campos
  // ══════════════════════════════════════════════════════════
  function renderSubtipos() {
    const porTipo = tipos.map((t) => ({
      t, hijos: subtipos.filter((s) => s.tipo_id === t.tipo_id),
    })).filter((g) => g.hijos.length);

    $('panel').innerHTML = cabecera(
      'Subtipos y sus campos',
      'El subtipo define qué se captura. Agregar uno nuevo con sus campos no requiere migración ni despliegue.',
      '+ Nuevo subtipo',
    ) + `<div class="table-wrap"><table>
      <thead><tr>
        <th style="min-width:220px">Subtipo</th><th>Campos propios</th>
        <th>Folio externo</th><th style="text-align:right">Documentos</th><th>Estado</th><th></th>
      </tr></thead>
      <tbody>${
        porTipo.length ? porTipo.map((g) => `
          <tr><td colspan="6" style="background:var(--panel2);font-weight:800;font-size:12.5px">
            ${esc(g.t.nombre)} <span class="mono muted">${esc(g.t.clave)}</span></td></tr>
          ${g.hijos.map((s) => {
            const campos = Array.isArray(s.esquema_campos) ? s.esquema_campos : [];
            return `<tr>
              <td style="padding-left:24px">${esc(s.nombre)}
                <div class="muted" style="font-size:11.5px"><span class="mono">${esc(s.clave)}</span></div></td>
              <td>${campos.length
                    ? `<span class="badge">${campos.length}</span> <span class="muted" style="font-size:11.5px">${
                        esc(campos.slice(0, 3).map((c) => c.label).join(', '))}${campos.length > 3 ? '…' : ''}</span>`
                    : '<span class="muted" style="font-size:12px">sin campos propios</span>'}</td>
              <td>${s.requiere_folio_externo ? '<span class="badge warn">Requerido</span>' : '<span class="badge">Opcional</span>'}</td>
              <td style="text-align:right">${Number(s.documentos_count ?? 0)}</td>
              <td>${badgeActivo(s.activo)}</td>
              <td style="text-align:right">${btnEditar(s.subtipo_id)}</td>
            </tr>`;
          }).join('')}`).join('') : vacio(6, 'Sin subtipos.')
      }</tbody></table></div>`;

    if (puedeEditar) {
      $('nuevoBtn').onclick = () => modalSubtipo(null);
      $('panel').querySelectorAll('[data-edit]').forEach((btn) => {
        btn.onclick = () => modalSubtipo(subtipos.find((s) => s.subtipo_id === btn.dataset.edit));
      });
    }
  }

  // ── Editor de campos dinámicos ────────────────────────────
  // Trabaja sobre un arreglo en memoria y repinta; así arrastrar el
  // orden y borrar filas no depende del DOM previo.
  let camposEdit = [];

  function pintarCampos() {
    const cont = $('camposLista');
    if (!camposEdit.length) {
      cont.innerHTML = `<div class="muted" style="font-size:12.5px;padding:8px 0">
        Sin campos propios. Este subtipo solo pedirá los datos generales (nombre, fecha, emisor, vigencia).</div>`;
    } else {
      cont.innerHTML = camposEdit.map((c, i) => `
        <div class="campo-fila">
          <div>
            <div class="mini">CLAVE</div>
            <input class="input" data-i="${i}" data-f="clave" value="${esc(c.clave || '')}"
                   placeholder="numero_escritura" maxlength="40"/>
          </div>
          <div>
            <div class="mini">ETIQUETA QUE VE EL USUARIO</div>
            <input class="input" data-i="${i}" data-f="label" value="${esc(c.label || '')}"
                   placeholder="Número de escritura"/>
          </div>
          <div>
            <div class="mini">TIPO</div>
            <select class="select" data-i="${i}" data-f="tipo">
              ${TIPOS_CAMPO.map((t) => `<option value="${t.v}"${c.tipo === t.v ? ' selected' : ''}>${t.n}</option>`).join('')}
            </select>
            ${c.tipo === 'select' ? `
              <div class="mini" style="margin-top:6px">OPCIONES (UNA POR RENGLÓN)</div>
              <textarea class="input" rows="3" data-i="${i}" data-f="opciones"
                >${esc((c.opciones || []).join('\n'))}</textarea>` : ''}
          </div>
          <label class="campo-req"><input type="checkbox" data-i="${i}" data-f="requerido"
            ${c.requerido ? 'checked' : ''}/> Obligatorio</label>
          <div class="campo-del">
            <button class="btn ghost" data-del="${i}" style="padding:4px 9px;font-size:14px" title="Quitar campo">✕</button>
          </div>
        </div>`).join('');
    }

    cont.querySelectorAll('[data-f]').forEach((el) => {
      const commit = () => {
        const i = Number(el.dataset.i), f = el.dataset.f;
        if (f === 'requerido')     camposEdit[i].requerido = el.checked;
        else if (f === 'opciones') camposEdit[i].opciones = el.value.split('\n').map((s) => s.trim()).filter(Boolean);
        else                       camposEdit[i][f] = el.value;
        if (f === 'tipo') pintarCampos();   // aparecen o desaparecen las opciones
        pintarPrevia();
      };
      el.addEventListener('change', commit);
      if (el.tagName !== 'SELECT' && el.type !== 'checkbox') el.addEventListener('blur', commit);
    });
    cont.querySelectorAll('[data-del]').forEach((btn) => {
      btn.onclick = () => { camposEdit.splice(Number(btn.dataset.del), 1); pintarCampos(); pintarPrevia(); };
    });
  }

  // Vista previa: el mismo motor que arma el formulario del alta real.
  // Si aquí se ve raro, en la captura se verá igual de raro.
  function pintarPrevia() {
    const validos = camposEdit.filter((c) => CLAVE_CAMPO_RE.test(String(c.clave || '')) && String(c.label || '').trim());
    D.renderCamposDinamicos($('previaCampos'), validos, {});
  }

  function validarCampos() {
    const vistas = new Set();
    for (let i = 0; i < camposEdit.length; i++) {
      const c = camposEdit[i], pos = `Campo ${i + 1}`;
      const clave = String(c.clave || '').trim();
      if (!CLAVE_CAMPO_RE.test(clave)) {
        return `${pos}: la clave "${clave || '(vacía)'}" no es válida. Solo minúsculas, números y guion bajo, empezando por letra.`;
      }
      if (vistas.has(clave)) return `${pos}: la clave "${clave}" está repetida.`;
      vistas.add(clave);
      if (!String(c.label || '').trim()) return `${pos} ("${clave}"): falta la etiqueta.`;
      if (c.tipo === 'select' && !(c.opciones || []).length) {
        return `${pos} ("${clave}"): un campo de lista necesita al menos una opción.`;
      }
    }
    return null;
  }

  function modalSubtipo(s) {
    const editando = !!s;
    camposEdit = editando
      ? JSON.parse(JSON.stringify(s.esquema_campos || [])).map((c) => ({ ...c, opciones: c.opciones || [] }))
      : [];

    const conDocumentos = Number(s?.documentos_count ?? 0);

    const m = D.modal('mSubtipo', editando ? 'Editar subtipo' : 'Nuevo subtipo',
      editando ? `${s.tipo_clave || ''} · ${s.clave}` : 'Catálogo', `
      <div class="grid-2">
        <div><div class="label-text">Tipo <span style="color:var(--danger)">*</span></div>
          <select class="select" id="sTipo" ${editando ? 'disabled' : ''}>
            ${tipos.map((t) => `<option value="${t.tipo_id}"${s?.tipo_id === t.tipo_id ? ' selected' : ''}>${esc(t.nombre)}</option>`).join('')}
          </select>
          ${editando ? `<div class="muted" style="font-size:11px;margin-top:2px">El tipo no se cambia: los documentos ya registrados quedarían mal clasificados.</div>` : ''}
        </div>
        <div><div class="label-text">Clave <span style="color:var(--danger)">*</span></div>
          <input class="input" id="sClave" maxlength="30" placeholder="ACTA-CONST" value="${esc(s?.clave || '')}"/></div>
      </div>
      <div><div class="label-text">Nombre <span style="color:var(--danger)">*</span></div>
        <input class="input" id="sNombre" placeholder="Acta constitutiva" value="${esc(s?.nombre || '')}"/></div>
      <div class="grid-2">
        <div><div class="label-text">Estado</div>
          <select class="select" id="sActivo">
            <option value="true"${s && !s.activo ? '' : ' selected'}>Activo</option>
            <option value="false"${s && !s.activo ? ' selected' : ''}>Inactivo</option>
          </select></div>
        <div style="display:flex;align-items:flex-end">
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;padding-bottom:9px">
            <input type="checkbox" id="sFolioExt" ${s?.requiere_folio_externo ? 'checked' : ''}/>
            Exigir folio externo
          </label></div>
      </div>

      <div style="border-top:1px solid var(--line);padding-top:16px;margin-top:4px">
        <div class="row" style="margin-bottom:6px">
          <div><div class="eyebrow">Campos propios</div>
            <div class="muted" style="font-size:12.5px">Lo que este subtipo pide además de los datos generales.</div></div>
          <button class="btn" id="addCampoBtn">+ Agregar campo</button>
        </div>
        ${conDocumentos ? `<div class="muted" style="font-size:12px;border:1px solid var(--warn);border-radius:10px;padding:9px 11px;margin-bottom:10px">
          Este subtipo ya tiene <strong>${conDocumentos} documento(s)</strong>. Si cambias la clave de un campo o lo quitas,
          lo capturado con el nombre anterior deja de mostrarse, y se pierde la próxima vez que alguien guarde ese documento.
          Para renombrar sin riesgo, cambia solo la <em>etiqueta</em> y deja la clave igual.</div>` : ''}
        <div id="camposLista"></div>
      </div>

      <div style="border-top:1px solid var(--line);padding-top:16px">
        <div class="eyebrow" style="margin-bottom:8px">Así se verá al capturar</div>
        <div class="previa"><div id="previaCampos"></div></div>
      </div>`, editando ? 'Guardar' : 'Crear', 780);

    pintarCampos();
    pintarPrevia();
    $('addCampoBtn').onclick = () => {
      camposEdit.push({ clave: '', label: '', tipo: 'text', requerido: false, opciones: [] });
      pintarCampos(); pintarPrevia();
    };

    m.ok.onclick = async () => {
      const error = validarCampos();
      if (error) return KoguApi.toast(error, 'error');

      const esquema = camposEdit.map((c) => {
        const out = { clave: String(c.clave).trim(), label: String(c.label).trim(), tipo: c.tipo, requerido: !!c.requerido };
        if (c.tipo === 'select') out.opciones = c.opciones;
        return out;
      });

      const body = {
        clave:                  $('sClave').value.trim(),
        nombre:                 $('sNombre').value.trim(),
        activo:                 $('sActivo').value === 'true',
        requiere_folio_externo: $('sFolioExt').checked,
        esquema_campos:         esquema,
      };
      if (!body.clave || !body.nombre) return KoguApi.toast('Clave y nombre son obligatorios.', 'error');

      m.ok.disabled = true;
      try {
        if (editando) {
          await KoguApi.apiFetch(`/protected/doc/subtipos/${s.subtipo_id}`,
            { method: 'PUT', body: JSON.stringify(body) });
        } else {
          await KoguApi.apiFetch(`/protected/doc/tipos/${$('sTipo').value}/subtipos`,
            { method: 'POST', body: JSON.stringify(body) });
        }
        KoguApi.toast(editando ? 'Subtipo actualizado' : 'Subtipo creado', 'success');
        m.cerrar(); await cargar();
      } catch (e) { m.ok.disabled = false; D.errorToast(e, 'No fue posible guardar el subtipo.'); }
    };
  }

  // ══════════════════════════════════════════════════════════
  // USOS
  // ══════════════════════════════════════════════════════════
  function renderUsos() {
    $('panel').innerHTML = cabecera(
      'Usos de asignación',
      'Para qué se entrega una copia. Define el plazo sugerido de devolución.',
      '+ Nuevo uso',
    ) + `<div class="table-wrap"><table>
      <thead><tr>
        <th>Clave</th><th>Nombre</th><th style="text-align:right">Días</th>
        <th>Devolución</th><th style="text-align:right">Usos</th><th>Estado</th><th></th>
      </tr></thead>
      <tbody>${
        usos.length ? usos.map((u) => `<tr>
          <td><span class="mono">${esc(u.clave)}</span></td>
          <td>${esc(u.nombre)}${u.descripcion ? `<div class="muted" style="font-size:11.5px">${esc(u.descripcion)}</div>` : ''}</td>
          <td style="text-align:right">${u.dias_devolucion_default ?? '—'}</td>
          <td>${u.requiere_devolucion
                ? '<span class="badge">Regresa al archivo</span>'
                : '<span class="badge warn">Entrega definitiva</span>'}</td>
          <td style="text-align:right">${Number(u.asignaciones_count ?? 0)}</td>
          <td>${badgeActivo(u.activo)}</td>
          <td style="text-align:right">${btnEditar(u.uso_id)}</td>
        </tr>`).join('') : vacio(7, 'Sin usos.')
      }</tbody></table></div>`;

    if (puedeEditar) {
      $('nuevoBtn').onclick = () => modalUso(null);
      $('panel').querySelectorAll('[data-edit]').forEach((btn) => {
        btn.onclick = () => modalUso(usos.find((u) => u.uso_id === btn.dataset.edit));
      });
    }
  }

  function modalUso(u) {
    const editando = !!u;
    const m = D.modal('mUso', editando ? 'Editar uso' : 'Nuevo uso', 'Catálogo', `
      <div class="grid-2">
        <div><div class="label-text">Clave <span style="color:var(--danger)">*</span></div>
          <input class="input" id="uClave" maxlength="30" placeholder="NOTARIA" value="${esc(u?.clave || '')}"/></div>
        <div><div class="label-text">Nombre <span style="color:var(--danger)">*</span></div>
          <input class="input" id="uNombre" placeholder="Trámite notarial" value="${esc(u?.nombre || '')}"/></div>
      </div>
      <div><div class="label-text">Descripción</div>
        <input class="input" id="uDesc" value="${esc(u?.descripcion || '')}"/></div>
      <div class="grid-2">
        <div><div class="label-text">Días sugeridos de devolución</div>
          <input class="input" id="uDias" type="number" min="1" value="${u?.dias_devolucion_default ?? ''}"/>
          <div class="muted" style="font-size:11px;margin-top:2px">Se propone al asignar; quien captura puede ajustarla.</div></div>
        <div><div class="label-text">Estado</div>
          <select class="select" id="uActivo">
            <option value="true"${u && !u.activo ? '' : ' selected'}>Activo</option>
            <option value="false"${u && !u.activo ? ' selected' : ''}>Inactivo</option>
          </select></div>
      </div>
      <label style="display:flex;align-items:center;gap:8px;font-size:13px">
        <input type="checkbox" id="uRequiere" ${u ? (u.requiere_devolucion ? 'checked' : '') : 'checked'}/>
        La copia regresa al archivo
      </label>
      <div class="muted" style="font-size:12px">
        Si lo desmarcas, la copia se da por entregada de forma definitiva: la asignación nace cerrada
        y no genera alertas de devolución. Es el caso de lo que se entrega a una autoridad y no vuelve.
      </div>`, editando ? 'Guardar' : 'Crear');

    m.ok.onclick = async () => {
      const dias = $('uDias').value.trim();
      const body = {
        clave:                   $('uClave').value.trim(),
        nombre:                  $('uNombre').value.trim(),
        descripcion:             $('uDesc').value.trim() || null,
        dias_devolucion_default: dias ? Number(dias) : null,
        requiere_devolucion:     $('uRequiere').checked,
        activo:                  $('uActivo').value === 'true',
      };
      if (!body.clave || !body.nombre) return KoguApi.toast('Clave y nombre son obligatorios.', 'error');
      m.ok.disabled = true;
      try {
        await KoguApi.apiFetch(editando ? `/protected/doc/usos/${u.uso_id}` : '/protected/doc/usos',
          { method: editando ? 'PUT' : 'POST', body: JSON.stringify(body) });
        KoguApi.toast(editando ? 'Uso actualizado' : 'Uso creado', 'success');
        m.cerrar(); await cargar();
      } catch (e) { m.ok.disabled = false; D.errorToast(e, 'No fue posible guardar el uso.'); }
    };
  }

  // ══════════════════════════════════════════════════════════
  // UBICACIONES
  // ══════════════════════════════════════════════════════════
  function renderUbicaciones() {
    const nombreTipo = (v) => (TIPOS_UBICACION.find((t) => t.v === v)?.n) || v;

    $('panel').innerHTML = cabecera(
      'Ubicaciones de resguardo',
      'Dónde vive físicamente cada copia cuando está en el archivo.',
      '+ Nueva ubicación',
    ) + `<div class="table-wrap"><table>
      <thead><tr>
        <th>Clave</th><th>Nombre</th><th>Tipo</th><th>Responsable</th>
        <th style="text-align:right">Copias</th><th>Estado</th><th></th>
      </tr></thead>
      <tbody>${
        ubicaciones.length ? ubicaciones.map((u) => `<tr>
          <td><span class="mono">${esc(u.clave)}</span></td>
          <td>${esc(u.nombre)}${u.padre_nombre ? `<div class="muted" style="font-size:11.5px">dentro de ${esc(u.padre_nombre)}</div>` : ''}</td>
          <td>${esc(nombreTipo(u.tipo))}${u.es_externa ? ' <span class="badge warn">Externa</span>' : ''}</td>
          <td>${esc(u.responsable_nombre || '—')}</td>
          <td style="text-align:right">${Number(u.copias_count ?? 0)}</td>
          <td>${badgeActivo(u.activo)}</td>
          <td style="text-align:right">${btnEditar(u.ubicacion_id)}</td>
        </tr>`).join('') : vacio(7, 'Sin ubicaciones.')
      }</tbody></table></div>`;

    if (puedeEditar) {
      $('nuevoBtn').onclick = () => modalUbicacion(null);
      $('panel').querySelectorAll('[data-edit]').forEach((btn) => {
        btn.onclick = () => modalUbicacion(ubicaciones.find((u) => u.ubicacion_id === btn.dataset.edit));
      });
    }
  }

  function modalUbicacion(u) {
    const editando = !!u;
    const m = D.modal('mUbi', editando ? 'Editar ubicación' : 'Nueva ubicación', 'Catálogo', `
      <div class="grid-2">
        <div><div class="label-text">Clave <span style="color:var(--danger)">*</span></div>
          <input class="input" id="bClave" maxlength="30" placeholder="CAJA-DIR" value="${esc(u?.clave || '')}"/></div>
        <div><div class="label-text">Nombre <span style="color:var(--danger)">*</span></div>
          <input class="input" id="bNombre" placeholder="Caja fuerte - Dirección" value="${esc(u?.nombre || '')}"/></div>
      </div>
      <div class="grid-2">
        <div><div class="label-text">Tipo <span style="color:var(--danger)">*</span></div>
          <select class="select" id="bTipo">
            ${TIPOS_UBICACION.map((t) => `<option value="${t.v}"${u?.tipo === t.v ? ' selected' : ''}>${t.n}</option>`).join('')}
          </select></div>
        <div><div class="label-text">Dentro de</div>
          <select class="select" id="bPadre">
            <option value="">— ninguna —</option>
            ${ubicaciones.filter((x) => x.ubicacion_id !== u?.ubicacion_id)
              .map((x) => `<option value="${x.ubicacion_id}"${u?.ubicacion_padre_id === x.ubicacion_id ? ' selected' : ''}>${esc(x.nombre)}</option>`).join('')}
          </select></div>
      </div>
      <div class="grid-2">
        <div><div class="label-text">Responsable</div>
          <select class="select" id="bResp">
            <option value="">— sin responsable —</option>
            ${usuarios.map((x) => `<option value="${x.user_id}"${u?.responsable_user_id === x.user_id ? ' selected' : ''}>${esc(x.nombre)}</option>`).join('')}
          </select></div>
        <div><div class="label-text">Estado</div>
          <select class="select" id="bActivo">
            <option value="true"${u && !u.activo ? '' : ' selected'}>Activo</option>
            <option value="false"${u && !u.activo ? ' selected' : ''}>Inactivo</option>
          </select></div>
      </div>
      <label style="display:flex;align-items:center;gap:8px;font-size:13px">
        <input type="checkbox" id="bExterna" ${u?.es_externa ? 'checked' : ''}/>
        Está fuera de la empresa (notaría, banco, despacho)
      </label>`, editando ? 'Guardar' : 'Crear');

    m.ok.onclick = async () => {
      const body = {
        clave:               $('bClave').value.trim(),
        nombre:              $('bNombre').value.trim(),
        tipo:                $('bTipo').value,
        ubicacion_padre_id:  $('bPadre').value || null,
        responsable_user_id: $('bResp').value || null,
        es_externa:          $('bExterna').checked,
        activo:              $('bActivo').value === 'true',
      };
      if (!body.clave || !body.nombre) return KoguApi.toast('Clave y nombre son obligatorios.', 'error');
      m.ok.disabled = true;
      try {
        await KoguApi.apiFetch(editando ? `/protected/doc/ubicaciones/${u.ubicacion_id}` : '/protected/doc/ubicaciones',
          { method: editando ? 'PUT' : 'POST', body: JSON.stringify(body) });
        KoguApi.toast(editando ? 'Ubicación actualizada' : 'Ubicación creada', 'success');
        m.cerrar(); await cargar();
      } catch (e) { m.ok.disabled = false; D.errorToast(e, 'No fue posible guardar la ubicación.'); }
    };
  }

  // ══════════════════════════════════════════════════════════
  // Ciclo
  // ══════════════════════════════════════════════════════════
  const RENDER = {
    tipos: renderTipos, subtipos: renderSubtipos,
    usos: renderUsos, ubicaciones: renderUbicaciones,
  };

  async function cargar() {
    try {
      const [rt, rs, ru, rb] = await Promise.all([
        KoguApi.apiFetch('/protected/doc/tipos'),
        KoguApi.apiFetch('/protected/doc/subtipos'),
        KoguApi.apiFetch('/protected/doc/usos'),
        KoguApi.apiFetch('/protected/doc/ubicaciones'),
      ]);
      tipos       = KoguApi.unwrapRows(rt);
      subtipos    = KoguApi.unwrapRows(rs);
      usos        = KoguApi.unwrapRows(ru);
      ubicaciones = KoguApi.unwrapRows(rb);

      // Los usuarios solo hacen falta para el selector de responsable.
      // Si el perfil no puede listarlos, la pantalla sigue sirviendo:
      // se queda sin ese select, no se cae.
      if (puedeEditar && !usuarios.length) {
        try {
          usuarios = KoguApi.unwrapRows(await KoguApi.apiFetch('/protected/core/usuarios'));
        } catch { usuarios = []; }
      }

      RENDER[pestana]();
    } catch (e) {
      D.errorToast(e, 'No fue posible cargar los catálogos.');
    }
  }

  document.querySelectorAll('.doc-tab').forEach((tab) => {
    tab.onclick = () => {
      document.querySelectorAll('.doc-tab').forEach((t) => t.classList.remove('on'));
      tab.classList.add('on');
      pestana = tab.dataset.tab;
      RENDER[pestana]();
    };
  });

  $('refreshBtn').onclick = () => cargar();
  window.addEventListener('kogu:empresa-activa-cambiada', () => cargar());

  await cargar();
});

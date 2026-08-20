// ============================================================
// documento-detalle.js
// Pantalla: Ficha del documento + copias + resguardo.
//
// Es la pantalla donde ocurre el trabajo real: aquí se registran las
// copias y se asigna y devuelve cada una. La tabla de copias va a todo
// el ancho a propósito — la copia es la unidad de control del módulo,
// no un dato secundario de la ficha.
// Módulo: Control Documental (doc_) — v1.
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(window.location.search);
  const documentoId = params.get('id');

  const b = await KoguShell.initShell({
    currentPage:        '/modules/doc/documentos.html',
    title:              'Documento',
    description:        'Ficha del documento, sus copias y el resguardo de cada una.',
    requiredPermission: 'doc.documentos.read',
  });
  if (!b) return;

  const D = window.KoguDoc;
  const esc = D.esc;
  const puede = (p) => KoguShell.hasPerm(b, p);

  const canCrearCopia = puede('doc.copias.create');
  const canAsignar    = puede('doc.asignaciones.create');
  const canDevolver   = puede('doc.asignaciones.devolver');
  const canEditarCopia= puede('doc.copias.update');

  if (!documentoId) {
    document.getElementById('pageContent').innerHTML =
      `<div class="card"><div class="empty">Falta el identificador del documento.</div></div>`;
    return;
  }

  let doc = null, copias = [], usos = [], ubicaciones = [], usuarios = [];

  const $ = (id) => document.getElementById(id);

  // ── Carga ─────────────────────────────────────────────────
  async function cargarCatalogos() {
    const [ru, rb, rus] = await Promise.all([
      KoguApi.apiFetch('/protected/doc/usos?activo=true').catch(() => null),
      KoguApi.apiFetch('/protected/doc/ubicaciones?activo=true').catch(() => null),
      KoguApi.apiFetch('/protected/core/usuarios').catch(() => null),
    ]);
    usos        = ru  ? (KoguApi.unwrapData(ru).rows  || []) : [];
    ubicaciones = rb  ? (KoguApi.unwrapData(rb).rows  || []) : [];
    usuarios    = rus ? (KoguApi.unwrapRows(rus)      || []) : [];
  }

  async function cargarDocumento() {
    const [rd, rc] = await Promise.all([
      KoguApi.apiFetch('/protected/doc/documentos/' + encodeURIComponent(documentoId)),
      KoguApi.apiFetch('/protected/doc/documentos/' + encodeURIComponent(documentoId) + '/copias'),
    ]);
    doc    = KoguApi.unwrapData(rd);
    copias = KoguApi.unwrapData(rc).rows || [];
  }

  // ── Render ────────────────────────────────────────────────
  function camposDelSubtipo() {
    const esquema = Array.isArray(doc.esquema_campos) ? doc.esquema_campos : [];
    if (!esquema.length) return '';
    const filas = esquema.map((c) => {
      let v = doc.datos?.[c.clave];
      if (v === undefined || v === null || v === '') v = '—';
      else if (c.tipo === 'bool')  v = v ? 'Sí' : 'No';
      else if (c.tipo === 'money') v = KoguUi.money ? KoguUi.money(v) : v;
      return D.kvRow(c.label, esc(String(v)));
    }).join('');
    return `<div class="card">
      <div class="eyebrow">Datos de ${esc(doc.subtipo_nombre)}</div>
      <div class="kv">${filas}</div>
    </div>`;
  }

  function render() {
    const asignadas = copias.filter((c) => c.estado === 'asignada').length;
    const vencidas  = copias.filter((c) => c.devolucion_vencida).length;
    const enArchivo = copias.filter((c) => c.estado === 'en_archivo').length;

    document.getElementById('pageContent').innerHTML = `
<div class="card">
  <div class="row">
    <div>
      <div class="eyebrow">${esc(doc.tipo_nombre)} · ${esc(doc.subtipo_nombre)}</div>
      <h2 style="margin:2px 0 6px">${esc(doc.nombre)}</h2>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <span class="badge primary mono">${esc(doc.folio)}</span>
        ${D.badgeEstadoDoc(doc.estado)}
        ${doc.confidencialidad !== 'interno'
          ? `<span class="badge neutral">🔒 ${esc(doc.confidencialidad)}</span>` : ''}
        ${doc.vigencia_hasta ? `<span class="badge warn">Vigencia ${D.fecha(doc.vigencia_hasta)}</span>` : ''}
      </div>
    </div>
    <div style="display:flex;gap:8px">
      ${canCrearCopia ? '<button class="btn primary" id="newCopiaBtn">+ Registrar copia</button>' : ''}
      <button class="btn" id="backBtn">← Bandeja</button>
    </div>
  </div>

  <div class="grid-4" style="margin-top:16px">
    ${D.kpi('Copias', copias.length, 'registradas')}
    ${D.kpi('En archivo', enArchivo, 'disponibles para prestar')}
    ${D.kpi('Asignadas', asignadas, 'fuera del archivo')}
    ${D.kpi('Devoluciones vencidas', vencidas, vencidas ? 'requieren seguimiento' : 'al corriente', vencidas > 0)}
  </div>
</div>

<div class="grid-2" style="margin-top:16px">
  <div class="card">
    <div class="eyebrow">Datos generales</div>
    <div class="kv">
      ${D.kvRow('Folio interno', `<span class="mono">${esc(doc.folio)}</span>`)}
      ${D.kvRow('Folio externo', doc.folio_externo ? esc(doc.folio_externo) : '—')}
      ${D.kvRow('Fecha del documento', D.fecha(doc.fecha_documento))}
      ${D.kvRow('Emisor / fedatario', doc.emisor ? esc(doc.emisor) : '—')}
      ${D.kvRow('Vigencia', doc.vigencia_hasta ? D.fecha(doc.vigencia_hasta) : 'Sin vigencia')}
      ${D.kvRow('Confidencialidad', esc(doc.confidencialidad))}
      ${D.kvRow('Registrado por', doc.created_by_nombre ? esc(doc.created_by_nombre) : '—')}
    </div>
  </div>
  ${camposDelSubtipo()}
</div>

<div class="card" style="margin-top:16px">
  <div class="row">
    <div><div class="eyebrow">Control</div><h3 style="margin:2px 0">Copias</h3>
      <div class="muted" style="font-size:12.5px">Una copia solo puede estar asignada a una persona a la vez.</div></div>
  </div>
  <div class="table-wrap" style="margin-top:14px">
    <table>
      <thead><tr>
        <th style="min-width:150px">Copia</th>
        <th>Carácter</th>
        <th>Expedición</th>
        <th style="min-width:170px">Custodio / ubicación</th>
        <th>Uso</th>
        <th>Desde</th>
        <th>Devolución</th>
        <th>Estado</th>
        <th style="text-align:right">Acción</th>
      </tr></thead>
      <tbody id="copiasRows"></tbody>
    </table>
  </div>
</div>`;

    $('backBtn').onclick = () => { window.location.href = '/modules/doc/documentos.html'; };
    if (canCrearCopia) $('newCopiaBtn').onclick = abrirModalCopia;
    renderCopias();
  }

  function renderCopias() {
    const tb = $('copiasRows');
    if (!copias.length) {
      tb.innerHTML = `<tr><td colspan="9" class="empty">
        Todavía no hay copias registradas. Sin copias, el documento no se puede prestar ni rastrear.</td></tr>`;
      return;
    }
    tb.innerHTML = copias.map((c) => {
      const asignada = c.estado === 'asignada';
      const accion = asignada
        ? (canDevolver ? `<button class="btn ghost" data-dev="${c.asignacion_vigente_id}" data-et="${esc(c.etiqueta)}">Devolver</button>` : '')
        : (canAsignar && ['en_archivo'].includes(c.estado)
            ? `<button class="btn primary" data-asg="${c.copia_id}" data-et="${esc(c.etiqueta)}">Asignar</button>` : '');
      return `<tr>
        <td><strong class="mono">${esc(c.etiqueta)}</strong>
          ${c.digitalizada ? '<span class="badge success" style="margin-left:6px">digitalizada</span>' : ''}</td>
        <td>${esc(D.CARACTER[c.caracter] || c.caracter)}
          ${c.folio_copia ? `<div class="muted" style="font-size:11.5px">${esc(c.folio_copia)}</div>` : ''}</td>
        <td>${D.fecha(c.fecha_expedicion)}
          ${c.expedida_por ? `<div class="muted" style="font-size:11.5px">${esc(c.expedida_por)}</div>` : ''}</td>
        <td>${asignada
              ? `<strong>${esc(c.custodio_nombre || '—')}</strong>`
              : (c.ubicacion_nombre ? esc(c.ubicacion_nombre) : '<span class="muted">Sin ubicación</span>')}</td>
        <td>${asignada ? esc(c.uso_nombre || '—') : '—'}</td>
        <td>${asignada ? D.fecha(c.fecha_asignacion) : '—'}
          ${asignada && c.dias_fuera != null
              ? `<div class="muted" style="font-size:11.5px">${c.dias_fuera} día(s) fuera</div>` : ''}</td>
        <td>${asignada
              ? (c.fecha_devolucion_esperada
                  ? `${D.fecha(c.fecha_devolucion_esperada)}${c.devolucion_vencida
                        ? '<div style="font-size:11.5px;color:var(--danger,#dc2626);font-weight:700">vencida</div>' : ''}`
                  : '<span class="muted">sin fecha</span>')
              : '—'}</td>
        <td>${D.badgeEstadoCopia(c.estado)}
          ${c.condicion !== 'buena' ? `<div class="muted" style="font-size:11.5px">${esc(D.CONDICION[c.condicion] || c.condicion)}</div>` : ''}</td>
        <td style="text-align:right;white-space:nowrap">${accion}</td>
      </tr>`;
    }).join('');

    tb.querySelectorAll('[data-asg]').forEach((btn) => {
      btn.onclick = () => abrirModalAsignar(btn.dataset.asg, btn.dataset.et);
    });
    tb.querySelectorAll('[data-dev]').forEach((btn) => {
      btn.onclick = () => abrirModalDevolver(btn.dataset.dev, btn.dataset.et);
    });
  }

  // El modal generico vive en doc-comun.js (lo comparten esta
  // pantalla y la de catalogos).
  const modal = (...args) => D.modal(...args);

  const optsUsuarios = () => usuarios
    .map((u) => `<option value="${u.user_id}">${esc(u.nombre)}</option>`).join('');
  const optsUbicaciones = () => ubicaciones
    .map((u) => `<option value="${u.ubicacion_id}">${esc(u.nombre)}</option>`).join('');

  // ── Alta de copia ─────────────────────────────────────────
  function abrirModalCopia() {
    const yaHayOriginal = copias.some((c) => c.caracter === 'original');
    const m = modal('mCopia', 'Registrar copia', doc.folio, `
      <div class="grid-2">
        <div><div class="label-text">Carácter <span style="color:var(--danger,#dc2626)">*</span></div>
          <select class="select" id="cp_caracter">
            <option value="original" ${yaHayOriginal ? 'disabled' : ''}>Original${yaHayOriginal ? ' (ya registrado)' : ''}</option>
            <option value="certificada" selected>Certificada</option>
            <option value="simple">Simple</option>
            <option value="digitalizada">Digitalizada (solo archivo)</option>
          </select></div>
        <div><div class="label-text">Folio de la copia <span class="muted" style="font-size:11px">(si el fedatario lo asigna)</span></div>
          <input class="input" id="cp_folio" /></div>
      </div>
      <div class="grid-3">
        <div><div class="label-text">Fecha de expedición</div><input class="input" id="cp_fecha" type="date" /></div>
        <div><div class="label-text">Expedida por</div><input class="input" id="cp_por" placeholder="Notaría, autoridad…" /></div>
        <div><div class="label-text">Páginas</div><input class="input" id="cp_pag" type="number" min="1" step="1" /></div>
      </div>
      <div class="grid-2">
        <div><div class="label-text">Ubicación de resguardo</div>
          <select class="select" id="cp_ubi"><option value="">Sin ubicación</option>${optsUbicaciones()}</select></div>
        <div><div class="label-text">Condición</div>
          <select class="select" id="cp_cond">
            <option value="buena" selected>Buena</option>
            <option value="deteriorada">Deteriorada</option>
            <option value="ilegible">Ilegible</option>
          </select></div>
      </div>
      <div><div class="label-text">Notas</div><input class="input" id="cp_notas" /></div>
      <div class="muted" style="font-size:12.5px;border:1px solid var(--line);border-radius:12px;padding:10px 12px">El consecutivo lo asigna el sistema: la siguiente copia será
        <span class="mono">${esc(doc.folio)}/C${String(copias.length + 1).padStart(2, '0')}</span>.</div>
    `, 'Registrar copia');

    m.ok.onclick = async () => {
      const body = {
        caracter:         $('cp_caracter').value,
        folio_copia:      $('cp_folio').value.trim() || null,
        fecha_expedicion: $('cp_fecha').value || null,
        expedida_por:     $('cp_por').value.trim() || null,
        num_paginas:      $('cp_pag').value ? Number($('cp_pag').value) : null,
        ubicacion_id:     $('cp_ubi').value || null,
        condicion:        $('cp_cond').value,
        notas:            $('cp_notas').value.trim() || null,
      };
      await KoguUi.withLoading(m.ok, async () => {
        try {
          const res = await KoguApi.apiFetch(
            '/protected/doc/documentos/' + encodeURIComponent(documentoId) + '/copias',
            { method: 'POST', body: JSON.stringify(body) });
          KoguApi.toast(`Copia ${KoguApi.unwrapData(res).etiqueta} registrada.`, 'success');
          m.cerrar();
          await recargar();
        } catch (e) { D.errorToast(e, 'No fue posible registrar la copia.'); }
      }, 'Guardando…');
    };
  }

  // ── Asignar ───────────────────────────────────────────────
  function abrirModalAsignar(copiaId, etiqueta) {
    const hoy = new Date();
    const hoyISO = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;

    const m = modal('mAsignar', 'Asignar copia', etiqueta, `
      <div class="grid-2">
        <div><div class="label-text">Asignar a <span style="color:var(--danger,#dc2626)">*</span></div>
          <select class="select" id="as_user"><option value="">Selecciona…</option>${optsUsuarios()}</select></div>
        <div><div class="label-text">Fecha de asignación <span style="color:var(--danger,#dc2626)">*</span></div>
          <input class="input" id="as_fecha" type="date" value="${hoyISO}" /></div>
      </div>
      <div class="grid-2">
        <div><div class="label-text">Uso <span style="color:var(--danger,#dc2626)">*</span></div>
          <select class="select" id="as_uso"><option value="">Selecciona…</option>
            ${usos.map((u) => `<option value="${u.uso_id}" data-dias="${u.dias_devolucion_default ?? ''}" data-req="${u.requiere_devolucion}">${esc(u.nombre)}</option>`).join('')}
          </select></div>
        <div><div class="label-text">Devolución esperada</div>
          <input class="input" id="as_dev" type="date" />
          <div class="muted" style="font-size:11px;margin-top:2px" id="as_hint">Se sugiere según el uso.</div></div>
      </div>
      <div><div class="label-text">Comentarios <span style="color:var(--danger,#dc2626)">*</span></div>
        <textarea class="input" id="as_com" rows="3" style="resize:vertical" placeholder="Para qué se entrega, a nombre de quién, cualquier condición…"></textarea></div>
    `, 'Asignar');

    // Al elegir el uso se calcula la devolución esperada, y si el uso es
    // de entrega definitiva se avisa claro: la copia no vuelve.
    $('as_uso').onchange = () => {
      const opt = $('as_uso').selectedOptions[0];
      if (!opt || !opt.value) return;
      const requiere = opt.dataset.req === 'true';
      const dias = opt.dataset.dias ? Number(opt.dataset.dias) : null;
      if (!requiere) {
        $('as_dev').value = '';
        $('as_dev').disabled = true;
        $('as_hint').innerHTML = '<strong style="color:var(--danger,#dc2626)">Entrega definitiva: la copia no regresa al archivo.</strong>';
        return;
      }
      $('as_dev').disabled = false;
      if (dias) {
        const base = new Date($('as_fecha').value || hoyISO);
        base.setDate(base.getDate() + dias);
        $('as_dev').value = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}-${String(base.getDate()).padStart(2, '0')}`;
        $('as_hint').textContent = `Sugerida por el uso: ${dias} días.`;
      } else {
        $('as_hint').textContent = 'Este uso no sugiere plazo; captúralo si aplica.';
      }
    };

    m.ok.onclick = async () => {
      if (!$('as_user').value) return KoguApi.toast('Selecciona a quién se le entrega.', 'error');
      if (!$('as_uso').value)  return KoguApi.toast('Selecciona el uso.', 'error');
      if (!$('as_com').value.trim()) return KoguApi.toast('Los comentarios son obligatorios.', 'error');

      const body = {
        user_id:                   $('as_user').value,
        uso_id:                    $('as_uso').value,
        fecha_asignacion:          $('as_fecha').value,
        fecha_devolucion_esperada: $('as_dev').value || null,
        comentarios:               $('as_com').value.trim(),
      };
      await KoguUi.withLoading(m.ok, async () => {
        try {
          await KoguApi.apiFetch('/protected/doc/copias/' + encodeURIComponent(copiaId) + '/asignar',
            { method: 'POST', body: JSON.stringify(body) });
          KoguApi.toast(`${etiqueta} asignada.`, 'success');
          m.cerrar();
          await recargar();
        } catch (e) {
          // El 422 del candado trae el mensaje completo (quién la tiene y
          // desde cuándo). Se muestra tal cual: es lo que resuelve la duda.
          D.errorToast(e, 'No fue posible asignar la copia.');
        }
      }, 'Asignando…');
    };
  }

  // ── Devolver ──────────────────────────────────────────────
  function abrirModalDevolver(asignacionId, etiqueta) {
    const hoy = new Date();
    const hoyISO = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;

    const m = modal('mDevolver', 'Registrar devolución', etiqueta, `
      <div class="grid-2">
        <div><div class="label-text">Fecha de devolución <span style="color:var(--danger,#dc2626)">*</span></div>
          <input class="input" id="dv_fecha" type="date" value="${hoyISO}" /></div>
        <div><div class="label-text">Condición en que regresa <span style="color:var(--danger,#dc2626)">*</span></div>
          <select class="select" id="dv_cond">
            <option value="buena" selected>Buena</option>
            <option value="deteriorada">Deteriorada</option>
            <option value="ilegible">Ilegible</option>
          </select></div>
      </div>
      <div><div class="label-text">Regresa a</div>
        <select class="select" id="dv_ubi"><option value="">Misma ubicación</option>${optsUbicaciones()}</select></div>
      <div><div class="label-text">Comentarios <span class="muted" style="font-size:11px" id="dv_hint">(opcional)</span></div>
        <textarea class="input" id="dv_com" rows="3" style="resize:vertical"></textarea></div>
      <div class="muted" style="font-size:12.5px;border:1px solid var(--line);border-radius:12px;padding:10px 12px">Al confirmar, en una sola operación: se cierra la asignación, la copia vuelve a
        <b>en archivo</b>, se limpia el custodio y queda el evento en la bitácora.</div>
    `, 'Registrar devolución');

    // Si no regresa en buenas condiciones, el comentario deja de ser
    // opcional — el backend lo exige y aquí se avisa antes de intentarlo.
    $('dv_cond').onchange = () => {
      const mala = $('dv_cond').value !== 'buena';
      $('dv_hint').innerHTML = mala
        ? '<strong style="color:var(--danger,#dc2626)">(obligatorio: explica qué le pasó)</strong>'
        : '(opcional)';
    };

    m.ok.onclick = async () => {
      const cond = $('dv_cond').value;
      const com  = $('dv_com').value.trim();
      if (cond !== 'buena' && !com) {
        return KoguApi.toast(`La copia regresa "${cond}": explica qué le pasó.`, 'error');
      }
      const body = {
        fecha_devolucion_real:  $('dv_fecha').value,
        condicion_devolucion:   cond,
        comentarios_devolucion: com || null,
        ubicacion_id:           $('dv_ubi').value || null,
      };
      await KoguUi.withLoading(m.ok, async () => {
        try {
          await KoguApi.apiFetch('/protected/doc/asignaciones/' + encodeURIComponent(asignacionId) + '/devolver',
            { method: 'POST', body: JSON.stringify(body) });
          KoguApi.toast(`${etiqueta} devuelta al archivo.`, 'success');
          m.cerrar();
          await recargar();
        } catch (e) { D.errorToast(e, 'No fue posible registrar la devolución.'); }
      }, 'Registrando…');
    };
  }

  // ── Ciclo ─────────────────────────────────────────────────
  async function recargar() {
    await cargarDocumento();
    render();
  }

  // Cambiar de empresa deja este documento fuera de contexto: se vuelve
  // a la bandeja en vez de mostrar datos que ya no corresponden.
  window.addEventListener('kogu:empresa-activa-cambiada', () => {
    window.location.href = '/modules/doc/documentos.html';
  });

  try {
    await cargarCatalogos();
    await cargarDocumento();
    render();
  } catch (e) {
    document.getElementById('pageContent').innerHTML =
      `<div class="card"><div class="empty">${esc(e?.message || 'No fue posible cargar el documento.')}</div></div>`;
  }
});

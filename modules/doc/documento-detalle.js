// ============================================================
// documento-detalle.js
// Pantalla: Ficha del documento + copias + resguardo.
//
// Es la pantalla donde ocurre el trabajo real: aquí se registran las
// copias y se asigna y devuelve cada una. La tabla de copias va a todo
// el ancho a propósito — la copia es la unidad de control del módulo,
// no un dato secundario de la ficha.
//
// Abajo conviven DOS HILOS, en pestañas separadas y no mezclados:
//
//   · Bitácora (doc_eventos)     → qué PASÓ. La escribe el sistema, es
//     inmutable en la base y sirve como evidencia ante un tercero.
//   · Comentarios (doc_comentarios) → qué DIJIMOS. Lo escribe la gente,
//     se puede editar y de aquí cuelgan los archivos.
//
// Juntarlos en un solo feed se ve más moderno y destruye el valor
// probatorio de la bitácora: un renglón editable y uno que no lo es
// dejan de distinguirse. Por eso van aparte.
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
  const canVerHilo    = puede('doc.comentarios.read');
  const canComentar   = puede('doc.comentarios.create');
  const canEditarCom  = puede('doc.comentarios.edit_own');
  const canBorrarAjeno= puede('doc.comentarios.delete_any');
  const canDescargar  = puede('doc.adjuntos.download');
  const canVerEventos = puede('doc.eventos.read');

  if (!documentoId) {
    document.getElementById('pageContent').innerHTML =
      `<div class="card"><div class="empty">Falta el identificador del documento.</div></div>`;
    return;
  }

  let doc = null, copias = [], usos = [], ubicaciones = [], usuarios = [];
  let comentarios = [], eventos = [];
  let pestanaHilo = 'comentarios';

  // Clases de comentario. El escaneo es la que mueve el puntero
  // doc_copias.escaneo_adjunto_id, por eso exige copia y archivo.
  const CLASES_COM = {
    nota:              { n: 'Nota',                 b: 'neutral' },
    escaneo:           { n: 'Escaneo',              b: 'success' },
    acuse_entrega:     { n: 'Acuse de entrega',     b: 'primary' },
    acuse_devolucion:  { n: 'Acuse de devolución',  b: 'primary' },
    incidencia:        { n: 'Incidencia',           b: 'danger'  },
  };

  const EVENTO_TXT = {
    alta: 'Documento registrado', actualizado: 'Documento actualizado',
    copia_alta: 'Copia dada de alta', copia_actualizada: 'Copia actualizada',
    asignada: 'Copia asignada', devuelta: 'Copia devuelta',
    vencida: 'Devolución vencida', cancelada: 'Asignación cancelada',
    extraviada: 'Copia extraviada', destruida: 'Copia destruida',
    entregada_definitiva: 'Entrega definitiva', digitalizada: 'Copia digitalizada',
    sustituido: 'Documento sustituido', baja: 'Documento dado de baja',
    copia_baja: 'Copia dada de baja',
  };
  // Solo los eventos que son mala noticia se pintan en rojo; si todo
  // lleva color, el color deja de avisar.
  const EVENTO_GRAVE = new Set(['vencida', 'extraviada', 'destruida', 'baja', 'copia_baja', 'cancelada']);

  const $ = (id) => document.getElementById(id);

  const style = document.createElement('style');
  style.textContent = `
    .hilo-tabs{display:flex;gap:4px;border-bottom:1px solid var(--line);margin-bottom:14px}
    .hilo-tab{padding:8px 14px;font-size:13px;font-weight:600;color:var(--muted);cursor:pointer;
              border-bottom:2px solid transparent;margin-bottom:-1px}
    .hilo-tab:hover{color:var(--text)}
    .hilo-tab.on{color:var(--primary);border-bottom-color:var(--primary)}
    .tl{position:relative;padding-left:18px}
    .tl::before{content:'';position:absolute;left:4px;top:6px;bottom:6px;width:1px;background:var(--line)}
    .tl-it{position:relative;padding:9px 0}
    .tl-it::before{content:'';position:absolute;left:-18px;top:14px;width:9px;height:9px;border-radius:50%;
                   background:var(--muted);box-shadow:0 0 0 2px var(--panel)}
    .tl-it.grave::before{background:var(--danger)}
    .tl-t{font-size:13px;font-weight:600}
    .tl-m{font-size:11.5px;color:var(--muted);margin-top:1px}
    .cmt{display:flex;gap:11px;padding:13px 0;border-bottom:1px solid var(--line)}
    .cmt:last-child{border-bottom:none}
    .cmt-av{width:32px;height:32px;border-radius:50%;background:var(--text);color:#fff;display:flex;
            align-items:center;justify-content:center;font-size:11.5px;font-weight:700;flex:none}
    .cmt-b{flex:1;min-width:0}
    .cmt-h{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
    .cmt-txt{font-size:13px;margin-top:3px;white-space:pre-wrap;word-break:break-word}
    .cmt-att{display:flex;align-items:center;gap:9px;margin-top:8px;border:1px solid var(--line);
             border-radius:10px;padding:8px 11px;background:var(--panel2)}
    .cmt-acc{opacity:0;transition:opacity .12s;display:flex;gap:4px}
    .cmt:hover .cmt-acc{opacity:1}
    .comp{border:1px solid var(--line);border-radius:12px;padding:11px;background:var(--panel2);margin-bottom:16px}
    .comp-bar{display:flex;align-items:center;gap:8px;margin-top:9px;flex-wrap:wrap}
    .adj-chip{display:inline-flex;align-items:center;gap:6px;font-size:11.5px;background:var(--panel);
              border:1px solid var(--line);border-radius:999px;padding:3px 9px}
  `;
  document.head.appendChild(style);

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

  // El hilo se carga aparte y tolera el fallo: si el perfil no puede
  // leer comentarios o bitácora, la ficha y las copias siguen sirviendo.
  async function cargarHilo() {
    const [rm, re] = await Promise.all([
      canVerHilo
        ? KoguApi.apiFetch(`/protected/doc/documentos/${encodeURIComponent(documentoId)}/comentarios`).catch(() => null)
        : Promise.resolve(null),
      canVerEventos
        ? KoguApi.apiFetch(`/protected/doc/documentos/${encodeURIComponent(documentoId)}/eventos`).catch(() => null)
        : Promise.resolve(null),
    ]);
    comentarios = rm ? (KoguApi.unwrapData(rm).rows || []) : [];
    eventos     = re ? (KoguApi.unwrapData(re).rows || []) : [];
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
</div>

${(canVerHilo || canVerEventos) ? `
<div class="card" style="margin-top:16px">
  <div class="hilo-tabs">
    ${canVerHilo    ? `<div class="hilo-tab" data-hilo="comentarios">Comentarios <span class="badge">${comentarios.length}</span></div>` : ''}
    ${canVerEventos ? `<div class="hilo-tab" data-hilo="bitacora">Bitácora <span class="badge">${eventos.length}</span></div>` : ''}
  </div>
  <div id="hiloPanel"></div>
</div>` : ''}`;

    $('backBtn').onclick = () => { window.location.href = '/modules/doc/documentos.html'; };
    if (canCrearCopia) $('newCopiaBtn').onclick = abrirModalCopia;
    renderCopias();

    if (canVerHilo || canVerEventos) {
      if (!canVerHilo)    pestanaHilo = 'bitacora';
      if (!canVerEventos) pestanaHilo = 'comentarios';
      document.querySelectorAll('.hilo-tab').forEach((t) => {
        t.onclick = () => { pestanaHilo = t.dataset.hilo; renderHilo(); };
      });
      renderHilo();
    }
  }

  // ══════════════════════════════════════════════════════════
  // HILO: bitácora y comentarios
  // ══════════════════════════════════════════════════════════
  function renderHilo() {
    document.querySelectorAll('.hilo-tab').forEach((t) => {
      t.classList.toggle('on', t.dataset.hilo === pestanaHilo);
    });
    if (pestanaHilo === 'bitacora') renderBitacora();
    else                            renderComentarios();
  }

  function cuando(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
  }

  function renderBitacora() {
    const cont = $('hiloPanel');
    if (!eventos.length) {
      cont.innerHTML = `<div class="empty">Sin movimientos registrados.</div>`;
      return;
    }
    cont.innerHTML = `
      <div class="muted" style="font-size:12.5px;margin-bottom:12px">
        La escribe el sistema. No se puede editar ni borrar, tampoco desde la base de datos.
      </div>
      <div class="tl">${eventos.map((e) => `
        <div class="tl-it${EVENTO_GRAVE.has(e.evento) ? ' grave' : ''}">
          <div class="tl-t">${esc(EVENTO_TXT[e.evento] || e.evento)}${
            e.copia_etiqueta ? ` <span class="mono muted" style="font-weight:400">${esc(e.copia_etiqueta)}</span>` : ''}</div>
          <div class="tl-m">${cuando(e.created_at)} · ${esc(e.user_nombre || 'sistema')}${
            e.descripcion ? ` · ${esc(e.descripcion)}` : ''}</div>
        </div>`).join('')}</div>`;
  }

  // Archivos elegidos en el compositor, antes de enviarse.
  let adjuntosPendientes = [];

  // Quién soy, para decidir qué comentarios muestro como propios.
  // Se prueban varias formas porque el bootstrap ha cambiado de shape
  // entre versiones; si ninguna resuelve, se muestran los botones y
  // manda el servidor, que ya rechaza con 403 el comentario ajeno.
  // Vale más un botón de más que esconderle a alguien el suyo.
  function miUserId() {
    const ses = (KoguApi.getSession && KoguApi.getSession()) || {};
    return b?.usuario?.user_id || b?.user?.user_id || b?.user_id
        || ses?.usuario?.user_id || ses?.user?.user_id || ses?.user_id || null;
  }
  const YO = miUserId();
  const esMio = (c) => (YO ? c.user_id === YO : true);

  function renderComentarios() {
    const cont = $('hiloPanel');
    const iniciales = (n) => String(n || '?').split(' ').map((x) => x[0]).slice(0, 2).join('').toUpperCase();
    const opcionesCopias = copias
      .map((c) => `<option value="${c.copia_id}">${esc(c.etiqueta)}</option>`).join('');

    const compositor = canComentar ? `
      <div class="comp">
        <textarea class="input" id="cm_txt" rows="2" style="resize:vertical"
          placeholder="Escribe un comentario…"></textarea>
        <div class="comp-bar">
          <select class="select" id="cm_clase" style="max-width:190px">
            ${Object.entries(CLASES_COM).map(([k, v]) => `<option value="${k}">${v.n}</option>`).join('')}
          </select>
          <select class="select" id="cm_copia" style="max-width:190px">
            <option value="">Sobre el documento</option>${opcionesCopias}
          </select>
          <label class="btn ghost" style="cursor:pointer;margin:0">
            Adjuntar<input type="file" id="cm_files" multiple hidden/>
          </label>
          <div style="flex:1"></div>
          <button class="btn primary" id="cm_send">Comentar</button>
        </div>
        <div id="cm_chips" style="margin-top:8px"></div>
        <div class="muted" style="font-size:11.5px;margin-top:6px">
          El archivo es opcional; el texto no. Un adjunto sin explicación no le sirve a nadie en seis meses.
        </div>
      </div>` : '';

    cont.innerHTML = compositor + (comentarios.length ? comentarios.map((c) => {
      const cl = CLASES_COM[c.clase] || CLASES_COM.nota;
      const mio = esMio(c);
      const adj = Array.isArray(c.adjuntos) ? c.adjuntos : [];
      return `<div class="cmt">
        <div class="cmt-av">${esc(iniciales(c.user_nombre))}</div>
        <div class="cmt-b">
          <div class="cmt-h">
            <strong style="font-size:13px">${esc(c.user_nombre || 'Usuario')}</strong>
            <span class="muted" style="font-size:11.5px">${cuando(c.created_at)}</span>
            <span class="badge ${cl.b}">${cl.n}</span>
            ${c.copia_etiqueta ? `<span class="badge mono">${esc(c.copia_etiqueta)}</span>` : ''}
            ${c.editado_at ? '<span class="muted" style="font-size:11px">(editado)</span>' : ''}
            <div style="flex:1"></div>
            <div class="cmt-acc">
              ${(mio && canEditarCom) ? `<button class="btn ghost" data-edit-cm="${c.comentario_id}" style="padding:2px 8px;font-size:11.5px">Editar</button>` : ''}
              ${(mio || canBorrarAjeno) ? `<button class="btn ghost" data-del-cm="${c.comentario_id}" style="padding:2px 8px;font-size:11.5px">Eliminar</button>` : ''}
            </div>
          </div>
          <div class="cmt-txt">${esc(c.texto || '')}</div>
          ${adj.map((a) => `
            <div class="cmt-att">
              <div style="flex:1;min-width:0">
                <div style="font-size:12.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(a.nombre_archivo_original)}</div>
                <div class="muted" style="font-size:11px">${((a.size_bytes || 0) / 1024).toFixed(0)} KB${a.hash_sha256 ? ' · íntegro' : ''}</div>
              </div>
              ${canDescargar ? `<button class="btn ghost" data-dl="${a.adjunto_id}" data-fn="${esc(a.nombre_archivo_original)}" style="padding:4px 10px;font-size:12px">Descargar</button>` : ''}
            </div>`).join('')}
        </div>
      </div>`;
    }).join('') : `<div class="empty">
      Sin comentarios todavía. Los archivos también entran por aquí: no hay adjuntos sueltos.</div>`);

    if (canComentar) {
      adjuntosPendientes = [];
      pintarChips();
      $('cm_files').onchange = (ev) => {
        adjuntosPendientes = Array.from(ev.target.files || []).slice(0, 5);
        pintarChips();
      };
      $('cm_send').onclick = enviarComentario;
    }

    cont.querySelectorAll('[data-dl]').forEach((btn) => {
      btn.onclick = () => descargarAdjunto(btn.dataset.dl, btn.dataset.fn);
    });
    cont.querySelectorAll('[data-edit-cm]').forEach((btn) => {
      btn.onclick = () => editarComentario(comentarios.find((x) => x.comentario_id === btn.dataset.editCm));
    });
    cont.querySelectorAll('[data-del-cm]').forEach((btn) => {
      btn.onclick = () => eliminarComentario(btn.dataset.delCm);
    });
  }

  function pintarChips() {
    const c = $('cm_chips');
    if (!c) return;
    c.innerHTML = adjuntosPendientes.map((f, i) => `
      <span class="adj-chip">${esc(f.name)}
        <button data-quitar="${i}" style="border:none;background:none;cursor:pointer;font-size:13px;line-height:1;padding:0">✕</button>
      </span>`).join(' ');
    c.querySelectorAll('[data-quitar]').forEach((btn) => {
      btn.onclick = () => { adjuntosPendientes.splice(Number(btn.dataset.quitar), 1); pintarChips(); };
    });
  }

  async function enviarComentario() {
    const texto = $('cm_txt').value.trim();
    const clase = $('cm_clase').value;
    const copia = $('cm_copia').value;

    if (!texto) return KoguApi.toast('El comentario necesita texto, aunque lleve archivo.', 'error');
    // Se valida aquí lo mismo que valida el backend, para no gastar una
    // subida de 20 MB en un 422 que se veía venir.
    if (clase === 'escaneo' && !copia) {
      return KoguApi.toast('Un escaneo pertenece a una copia concreta: elige cuál.', 'error');
    }
    if (clase === 'escaneo' && !adjuntosPendientes.length) {
      return KoguApi.toast('Un escaneo tiene que traer el archivo escaneado.', 'error');
    }

    const fd = new FormData();
    fd.append('texto', texto);
    fd.append('clase', clase);
    if (copia) fd.append('copia_id', copia);
    adjuntosPendientes.forEach((f) => fd.append('archivos', f));

    await KoguUi.withLoading($('cm_send'), async () => {
      try {
        await KoguApi.apiFetch(`/protected/doc/documentos/${encodeURIComponent(documentoId)}/comentarios`,
          { method: 'POST', body: fd });
        KoguApi.toast('Comentario publicado', 'success');
        // Si fue un escaneo cambió el estado de la copia, así que se
        // recarga todo y no solo el hilo.
        await recargar();
      } catch (e) { D.errorToast(e, 'No fue posible publicar el comentario.'); }
    }, 'Publicando…');
  }

  function editarComentario(c) {
    if (!c) return;
    const m = modal('mEditCm', 'Editar comentario', CLASES_COM[c.clase]?.n || 'Nota', `
      <div><div class="label-text">Texto</div>
        <textarea class="input" id="ec_txt" rows="4" style="resize:vertical">${esc(c.texto || '')}</textarea></div>
      <div class="muted" style="font-size:12px">
        Solo se puede editar dentro de las primeras 24 horas y queda marcado como editado.
        Pasada la ventana, la corrección va como comentario nuevo: el hilo es parte del expediente.
      </div>`, 'Guardar');

    m.ok.onclick = async () => {
      const texto = $('ec_txt').value.trim();
      if (!texto) return KoguApi.toast('El comentario no puede quedar vacío.', 'error');
      await KoguUi.withLoading(m.ok, async () => {
        try {
          await KoguApi.apiFetch(`/protected/doc/comentarios/${encodeURIComponent(c.comentario_id)}`,
            { method: 'PUT', body: JSON.stringify({ texto }) });
          KoguApi.toast('Comentario actualizado', 'success');
          m.cerrar();
          await cargarHilo(); renderHilo();
        } catch (e) { D.errorToast(e, 'No fue posible editar el comentario.'); }
      }, 'Guardando…');
    };
  }

  async function eliminarComentario(id) {
    // Baja lógica: el hueco queda en el hilo y los archivos se conservan.
    if (!window.confirm('¿Eliminar este comentario? Sus adjuntos se conservan como documentación.')) return;
    try {
      await KoguApi.apiFetch(`/protected/doc/comentarios/${encodeURIComponent(id)}`, { method: 'DELETE' });
      KoguApi.toast('Comentario eliminado', 'success');
      await cargarHilo(); renderHilo();
    } catch (e) { D.errorToast(e, 'No fue posible eliminar el comentario.'); }
  }

  async function descargarAdjunto(adjuntoId, nombre) {
    // El endpoint exige token y empresa activa, así que un <a href> no
    // sirve: hay que pedirlo con las cabeceras y volcarlo a un blob.
    try {
      const res = await KoguApi.authFetchRaw(`/protected/doc/adjuntos/${encodeURIComponent(adjuntoId)}/download`);
      if (!res.ok) throw new Error(res.status === 403
        ? 'No tienes permiso para descargar este archivo.'
        : 'El archivo no se encontró en el almacenamiento.');
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = nombre || 'documento';
      document.body.appendChild(a); a.click(); a.remove();
      // Sin esto el blob se queda en memoria hasta recargar la página.
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (e) { D.errorToast(e, 'No fue posible descargar el archivo.'); }
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
        <td style="text-align:right;white-space:nowrap">
          ${canComentar ? `<button class="btn ghost" data-dig="${c.copia_id}" data-et="${esc(c.etiqueta)}"
              title="Subir el escaneo de esta copia" style="padding:4px 9px;font-size:12px">Digitalizar</button>` : ''}
          ${accion}</td>
      </tr>`;
    }).join('');

    tb.querySelectorAll('[data-asg]').forEach((btn) => {
      btn.onclick = () => abrirModalAsignar(btn.dataset.asg, btn.dataset.et);
    });
    tb.querySelectorAll('[data-dev]').forEach((btn) => {
      btn.onclick = () => abrirModalDevolver(btn.dataset.dev, btn.dataset.et);
    });
    // Digitalizar no abre otro formulario: lleva al compositor con la
    // clase y la copia ya puestas. Un solo camino de entrada para los
    // archivos, y siempre con su explicación al lado.
    tb.querySelectorAll('[data-dig]').forEach((btn) => {
      btn.onclick = () => {
        pestanaHilo = 'comentarios';
        renderHilo();
        $('cm_clase').value = 'escaneo';
        $('cm_copia').value = btn.dataset.dig;
        $('cm_txt').value   = `Escaneo de la copia ${btn.dataset.et}. `;
        $('cm_txt').focus();
        $('cm_txt').scrollIntoView({ block: 'center', behavior: 'smooth' });
      };
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
    await Promise.all([cargarDocumento(), cargarHilo()]);
    render();
  }

  // Cambiar de empresa deja este documento fuera de contexto: se vuelve
  // a la bandeja en vez de mostrar datos que ya no corresponden.
  window.addEventListener('kogu:empresa-activa-cambiada', () => {
    window.location.href = '/modules/doc/documentos.html';
  });

  try {
    await cargarCatalogos();
    await Promise.all([cargarDocumento(), cargarHilo()]);
    render();
  } catch (e) {
    document.getElementById('pageContent').innerHTML =
      `<div class="card"><div class="empty">${esc(e?.message || 'No fue posible cargar el documento.')}</div></div>`;
  }
});

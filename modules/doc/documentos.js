// ============================================================
// documentos.js
// Pantalla: Bandeja de documentos + alta.
// Endpoint base: /protected/doc/documentos
// Módulo: Control Documental (doc_) — v1.
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const b = await KoguShell.initShell({
    currentPage:        '/modules/doc/documentos.html',
    title:              'Documentos',
    description:        'Documentos de la empresa activa y sus copias en resguardo.',
    requiredPermission: 'doc.documentos.read',
  });
  if (!b) return;

  const D = window.KoguDoc;
  const esc = D.esc;
  const canCreate = KoguShell.hasPerm(b, 'doc.documentos.create');

  const ESTADOS = ['borrador', 'vigente', 'por_vencer', 'vencido', 'sustituido'];

  let tipos = [], subtipos = [];
  let page = 1, limit = 25, total = 0;

  document.getElementById('pageContent').innerHTML = `
<div class="card">
  <div class="row">
    <div><div class="eyebrow">Bandeja</div><h2>Documentos</h2></div>
    <div style="display:flex;gap:8px">
      ${canCreate ? '<button class="btn primary" id="newBtn">+ Nuevo documento</button>' : ''}
      <button class="btn" id="refreshBtn">Actualizar</button>
    </div>
  </div>

  <div class="grid-3" style="margin-top:16px">
    <input class="input" id="q" placeholder="Buscar por folio, nombre, emisor…" />
    <select class="select" id="fTipo"><option value="">Todos los tipos</option></select>
    <select class="select" id="fSubtipo"><option value="">Todos los subtipos</option></select>
  </div>
  <div class="grid-3" style="margin-top:10px">
    <select class="select" id="fEstado">
      <option value="">Todos los estados</option>
      ${ESTADOS.map((e) => `<option value="${e}">${(D.EST_DOC[e] || [e])[0]}</option>`).join('')}
    </select>
    <div></div><div></div>
  </div>

  <div id="avisoRestringidos" style="display:none;margin-top:12px" class="muted" style="font-size:12.5px;border:1px solid var(--line);border-radius:12px;padding:10px 12px"></div>

  <div class="table-wrap" style="margin-top:16px">
    <table>
      <thead><tr>
        <th style="min-width:130px">Folio</th>
        <th style="min-width:220px">Documento</th>
        <th>Clasificación</th>
        <th>Fecha</th>
        <th>Vigencia</th>
        <th style="text-align:right">Copias</th>
        <th style="text-align:right">Asignadas</th>
        <th>Estado</th>
      </tr></thead>
      <tbody id="rows"></tbody>
    </table>
  </div>
  <div id="pgBar" style="display:flex;align-items:center;justify-content:space-between;margin-top:10px;font-size:13px;color:var(--muted)"></div>
</div>`;

  const $ = (id) => document.getElementById(id);

  // ── Catálogos ─────────────────────────────────────────────
  async function cargarCatalogos() {
    try {
      const [rt, rs] = await Promise.all([
        KoguApi.apiFetch('/protected/doc/tipos?activo=true'),
        KoguApi.apiFetch('/protected/doc/subtipos?activo=true'),
      ]);
      tipos    = KoguApi.unwrapData(rt).rows || [];
      subtipos = KoguApi.unwrapData(rs).rows || [];
      $('fTipo').innerHTML = '<option value="">Todos los tipos</option>'
        + tipos.map((t) => `<option value="${t.tipo_id}">${esc(t.nombre)}</option>`).join('');
      pintarSubtipos('');
    } catch (e) {
      D.errorToast(e, 'No fue posible cargar los catálogos.');
    }
  }

  // Filtros que llegan por URL desde el tablero: al hacer clic en una
  // fila de la matriz tipo × subtipo se abre esta bandeja ya acotada.
  // Sin esto el clic no haría nada y parecería que el tablero está roto.
  function aplicarFiltrosDeUrl() {
    const p = new URLSearchParams(window.location.search);
    const tipoId = p.get('tipo_id') || '';
    if (tipoId && tipos.some((t) => t.tipo_id === tipoId)) {
      $('fTipo').value = tipoId;
      pintarSubtipos(tipoId);
    }
    const subtipoId = p.get('subtipo_id') || '';
    if (subtipoId && subtipos.some((sx) => sx.subtipo_id === subtipoId)) {
      $('fSubtipo').value = subtipoId;
    }
    const estado = p.get('estado') || '';
    if (estado) $('fEstado').value = estado;
    const q = p.get('q') || '';
    if (q) $('q').value = q;
  }

  function pintarSubtipos(tipoId) {
    const lista = tipoId ? subtipos.filter((s) => s.tipo_id === tipoId) : subtipos;
    $('fSubtipo').innerHTML = '<option value="">Todos los subtipos</option>'
      + lista.map((s) => `<option value="${s.subtipo_id}">${esc(s.nombre)}</option>`).join('');
  }

  // ── Bandeja ───────────────────────────────────────────────
  function filtros() {
    return {
      q:          $('q').value.trim(),
      tipo_id:    $('fTipo').value,
      subtipo_id: $('fSubtipo').value,
      estado:     $('fEstado').value,
    };
  }

  function renderRows(rows) {
    const tb = $('rows');
    if (!rows.length) {
      tb.innerHTML = `<tr><td colspan="8" class="empty">
        Sin documentos para los filtros actuales.</td></tr>`;
      return;
    }
    tb.innerHTML = rows.map((r) => `
      <tr style="cursor:pointer" data-id="${r.documento_id}">
        <td><strong class="mono">${esc(r.folio)}</strong></td>
        <td>${esc(r.nombre)}
          ${r.confidencialidad && r.confidencialidad !== 'interno'
            ? `<span class="badge neutral" style="margin-left:6px">🔒 ${esc(r.confidencialidad)}</span>` : ''}
        </td>
        <td>${esc(r.tipo_nombre)}<div class="muted" style="font-size:11.5px">${esc(r.subtipo_nombre)}</div></td>
        <td>${D.fecha(r.fecha_documento)}</td>
        <td>${r.vigencia_hasta ? D.fecha(r.vigencia_hasta) : '<span class="muted">Sin vigencia</span>'}</td>
        <td style="text-align:right">${Number(r.copias_total || 0)}</td>
        <td style="text-align:right">${Number(r.copias_asignadas || 0) > 0
              ? `<strong>${r.copias_asignadas}</strong>` : '0'}</td>
        <td>${D.badgeEstadoDoc(r.estado)}</td>
      </tr>`).join('');
    tb.querySelectorAll('[data-id]').forEach((tr) => {
      tr.onclick = () => {
        window.location.href = '/modules/doc/documento-detalle.html?id=' + encodeURIComponent(tr.dataset.id);
      };
    });
  }

  function renderPg() {
    const totalPages = Math.max(Math.ceil(total / limit), 1);
    $('pgBar').innerHTML = `
      <span>${total} documento${total === 1 ? '' : 's'} · página ${page} de ${totalPages}</span>
      <span style="display:flex;gap:8px">
        <button class="btn ghost" id="prevPg" ${page <= 1 ? 'disabled' : ''}>← Anterior</button>
        <button class="btn ghost" id="nextPg" ${page >= totalPages ? 'disabled' : ''}>Siguiente →</button>
      </span>`;
    const prev = $('prevPg'), next = $('nextPg');
    if (prev) prev.onclick = () => { if (page > 1) { page--; load(); } };
    if (next) next.onclick = () => { if (page < totalPages) { page++; load(); } };
  }

  async function load(showToast) {
    try {
      const qs = KoguUi.queryParams({ ...filtros(), page, limit });
      const res = await KoguApi.apiFetch('/protected/doc/documentos?' + qs);
      const data = KoguApi.unwrapData(res);
      total = data.total ?? 0;
      page  = data.page  ?? 1;
      renderRows(data.rows || []);
      renderPg();

      // El backend no oculta que existen documentos confidenciales: los
      // cuenta sin decir cuáles. Mostrarlo evita que alguien crea que la
      // bandeja está completa cuando no lo está.
      const aviso = $('avisoRestringidos');
      if (data.restringidos) {
        aviso.style.display = '';
        aviso.textContent = data.restringidos_nota;
      } else {
        aviso.style.display = 'none';
      }

      if (showToast) KoguApi.toast('Bandeja actualizada por cambio de empresa', 'success');
    } catch (e) {
      renderRows([]); renderPg();
      D.errorToast(e, 'No fue posible cargar los documentos.');
    }
  }

  // ── Modal de alta ─────────────────────────────────────────
  function buildModal() {
    if (!canCreate) return;
    const ov = document.createElement('div');
    ov.id = 'docModal';
    ov.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:9999;align-items:flex-start;justify-content:center;padding:40px 20px 20px;backdrop-filter:blur(2px)';
    ov.innerHTML = `
      <div style="width:100%;max-width:720px;max-height:88vh;background:white;border-radius:12px;box-shadow:0 20px 50px rgba(0,0,0,.3);display:flex;flex-direction:column;overflow:hidden;color:#0f172a">
        <div style="padding:16px 20px;border-bottom:1px solid var(--line,#e2e8f0);display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
          <div><div class="eyebrow">Formulario</div><h2 style="margin:0;font-size:20px">Nuevo documento</h2></div>
          <button class="btn ghost" id="mClose" style="padding:6px 10px;font-size:16px">✕</button>
        </div>
        <div style="flex:1;overflow-y:auto;padding:20px">
          <div class="stack">
            <div class="grid-2">
              <div><div class="label-text">Tipo <span style="color:var(--danger,#dc2626)">*</span></div>
                <select class="select" id="m_tipo"><option value="">Selecciona…</option></select></div>
              <div><div class="label-text">Subtipo <span style="color:var(--danger,#dc2626)">*</span></div>
                <select class="select" id="m_subtipo"><option value="">Selecciona un tipo primero…</option></select></div>
            </div>
            <div><div class="label-text">Nombre del documento <span style="color:var(--danger,#dc2626)">*</span></div>
              <input class="input" id="m_nombre" placeholder="Ej. Acta constitutiva Adegermex S.A. de C.V." /></div>
            <div><div class="label-text">Descripción <span class="muted" style="font-size:11px">(opcional)</span></div>
              <input class="input" id="m_descripcion" /></div>
            <div class="grid-3">
              <div><div class="label-text">Fecha del documento <span style="color:var(--danger,#dc2626)">*</span></div>
                <input class="input" id="m_fecha" type="date" /></div>
              <div><div class="label-text">Folio externo <span class="muted" style="font-size:11px" id="m_folioext_hint"></span></div>
                <input class="input" id="m_folio_ext" placeholder="Escritura, folio mercantil…" /></div>
              <div><div class="label-text">Emisor / fedatario</div>
                <input class="input" id="m_emisor" placeholder="Notaría, autoridad…" /></div>
            </div>
            <div class="grid-3">
              <div><div class="label-text">Vigencia desde</div><input class="input" id="m_vig_desde" type="date" /></div>
              <div><div class="label-text">Vigencia hasta <span class="muted" style="font-size:11px" id="m_vig_hint"></span></div>
                <input class="input" id="m_vig_hasta" type="date" /></div>
              <div><div class="label-text">Confidencialidad</div>
                <select class="select" id="m_conf">
                  <option value="publico">Público</option>
                  <option value="interno" selected>Interno</option>
                  <option value="confidencial">Confidencial</option>
                  <option value="restringido">Restringido</option>
                </select></div>
            </div>

            <div style="border-top:1px solid var(--line,#e2e8f0);padding-top:14px">
              <div class="eyebrow" style="margin-bottom:8px">Datos del subtipo</div>
              <div id="m_dinamicos">
                <div class="muted" style="font-size:12.5px">Selecciona un subtipo para ver sus campos.</div>
              </div>
            </div>
          </div>
        </div>
        <div style="padding:14px 20px;border-top:1px solid var(--line,#e2e8f0);display:flex;justify-content:flex-end;gap:8px;flex-shrink:0">
          <button class="btn ghost" id="mCancel">Cancelar</button>
          <button class="btn primary" id="mSave">Guardar documento</button>
        </div>
      </div>`;
    document.body.appendChild(ov);

    const cerrar = () => { ov.style.display = 'none'; };
    $('mClose').onclick = cerrar;
    $('mCancel').onclick = cerrar;
    ov.onclick = (e) => { if (e.target === ov) cerrar(); };

    $('m_tipo').onchange = () => {
      const tid = $('m_tipo').value;
      const lista = subtipos.filter((s) => s.tipo_id === tid);
      $('m_subtipo').innerHTML = '<option value="">Selecciona…</option>'
        + lista.map((s) => `<option value="${s.subtipo_id}">${esc(s.nombre)}</option>`).join('');
      $('m_dinamicos').innerHTML = '<div class="muted" style="font-size:12.5px">Selecciona un subtipo para ver sus campos.</div>';
      $('m_vig_hint').textContent = '';
      $('m_folioext_hint').textContent = '';
    };

    // Al elegir subtipo se pinta su formulario: los campos vienen del
    // catálogo, no del código.
    $('m_subtipo').onchange = () => {
      const s = subtipos.find((x) => x.subtipo_id === $('m_subtipo').value);
      if (!s) return;
      D.renderCamposDinamicos($('m_dinamicos'), s.esquema_campos);
      $('m_vig_hint').textContent      = s.controla_vigencia ? '(obligatoria para este tipo)' : '(opcional)';
      $('m_folioext_hint').textContent = s.requiere_folio_externo ? '(obligatorio para este subtipo)' : '(opcional)';
    };

    $('mSave').onclick = async () => {
      const s = subtipos.find((x) => x.subtipo_id === $('m_subtipo').value);
      if (!s)                    return KoguApi.toast('Selecciona el tipo y el subtipo.', 'error');
      if (!$('m_nombre').value.trim()) return KoguApi.toast('El nombre es obligatorio.', 'error');
      if (!$('m_fecha').value)   return KoguApi.toast('La fecha del documento es obligatoria.', 'error');

      const body = {
        subtipo_id:       s.subtipo_id,
        nombre:           $('m_nombre').value.trim(),
        descripcion:      $('m_descripcion').value.trim() || null,
        fecha_documento:  $('m_fecha').value,
        folio_externo:    $('m_folio_ext').value.trim() || null,
        emisor:           $('m_emisor').value.trim() || null,
        vigencia_desde:   $('m_vig_desde').value || null,
        vigencia_hasta:   $('m_vig_hasta').value || null,
        confidencialidad: $('m_conf').value,
        datos:            D.leerCamposDinamicos(s.esquema_campos),
      };

      await KoguUi.withLoading($('mSave'), async () => {
        try {
          const res = await KoguApi.apiFetch('/protected/doc/documentos', {
            method: 'POST', body: JSON.stringify(body),
          });
          const nuevo = KoguApi.unwrapData(res);
          KoguApi.toast(`Documento ${nuevo.folio} registrado.`, 'success');
          cerrar();
          // Se va directo al detalle: sin copias registradas el documento
          // todavía no sirve para nada, y ahí es donde se dan de alta.
          window.location.href = '/modules/doc/documento-detalle.html?id='
            + encodeURIComponent(nuevo.documento_id);
        } catch (e) {
          D.errorToast(e, 'No fue posible guardar el documento.');
        }
      }, 'Guardando…');
    };
  }

  function abrirModal() {
    $('m_tipo').innerHTML = '<option value="">Selecciona…</option>'
      + tipos.map((t) => `<option value="${t.tipo_id}">${esc(t.nombre)}</option>`).join('');
    ['m_nombre', 'm_descripcion', 'm_fecha', 'm_folio_ext', 'm_emisor', 'm_vig_desde', 'm_vig_hasta']
      .forEach((id) => { $(id).value = ''; });
    $('m_subtipo').innerHTML = '<option value="">Selecciona un tipo primero…</option>';
    $('m_dinamicos').innerHTML = '<div class="muted" style="font-size:12.5px">Selecciona un subtipo para ver sus campos.</div>';
    $('m_conf').value = 'interno';
    $('docModal').style.display = 'flex';
  }

  // ── Eventos ───────────────────────────────────────────────
  let tDebounce;
  $('q').oninput = () => { clearTimeout(tDebounce); tDebounce = setTimeout(() => { page = 1; load(); }, 350); };
  $('fTipo').onchange = () => { pintarSubtipos($('fTipo').value); page = 1; load(); };
  $('fSubtipo').onchange = () => { page = 1; load(); };
  $('fEstado').onchange = () => { page = 1; load(); };
  $('refreshBtn').onclick = () => load();
  if (canCreate) { buildModal(); $('newBtn').onclick = abrirModal; }

  // Cambio de empresa: se recarga todo y no queda nada de la anterior.
  window.addEventListener('kogu:empresa-activa-cambiada', async () => {
    page = 1;
    await cargarCatalogos();
    load(true);
  });

  await cargarCatalogos();
  aplicarFiltrosDeUrl();
  await load();
});

// ============================================================
// activo-detalle.js
// Pantalla: Ficha de activo (módulo de Activos).
// Endpoints: GET /activos/:id/ficha, /activos/:id/adjuntos, etc.
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const b = await KoguShell.initShell({
    currentPage:        '/modules/act/activos.html',
    title:              'Ficha de activo',
    description:        'Detalle del activo: datos, expediente, asignaciones y mantenimiento.',
    requiredPermission: 'act.activos.read',
  });
  if (!b) return;

  const esc = KoguUi.escapeHtml;
  const canUpdate    = KoguShell.hasPerm(b, 'act.activos.update');
  const canUpload    = KoguShell.hasPerm(b, 'act.adjuntos.upload');
  const canDeleteAdj = KoguShell.hasPerm(b, 'act.adjuntos.delete');
  const canManageAsg = KoguShell.hasPerm(b, 'act.asignaciones.manage');
  const canPlanesRead   = KoguShell.hasPerm(b, 'act.planes.read');
  const canPlanesManage = KoguShell.hasPerm(b, 'act.planes.manage');
  const canOrdenesRead  = KoguShell.hasPerm(b, 'act.ordenes.read');
  const canOrdenesCreate = KoguShell.hasPerm(b, 'act.ordenes.create');
  const canComentariosRead  = KoguShell.hasPerm(b, 'act.comentarios.read');
  const canComentariosWrite = KoguShell.hasPerm(b, 'act.comentarios.write');
  const canGestoriaRead   = KoguShell.hasPerm(b, 'act.gestoria.read');
  const canGestoriaCreate = KoguShell.hasPerm(b, 'act.gestoria.create');
  const canGestoriaUpdate = KoguShell.hasPerm(b, 'act.gestoria.update');
  const canGestoriaCumplir = KoguShell.hasPerm(b, 'act.gestoria.cumplir');
  const canGestoriaDelete = KoguShell.hasPerm(b, 'act.gestoria.delete');
  const _meSession = (typeof KoguApi.getSession === 'function' ? (KoguApi.getSession() || {}) : {});
  const myUserId = (b.user && (b.user.user_id || b.user.id)) || _meSession.user?.user_id || _meSession.user?.id || _meSession.user_id || null;

  const CRITICIDADES = ['baja', 'media', 'alta', 'critica'];
  const ESTADO_BADGE = { activo: 'success', en_mantenimiento: 'warn', en_reparacion: 'warn', en_resguardo: 'neutral', baja: 'danger' };
  const TIPOS_ADJ = ['factura', 'manual', 'garantia', 'poliza_seguro', 'contrato', 'foto', 'acta_entrega', 'otro'];
  const estadoBadge = e => `<span class="badge ${ESTADO_BADGE[e] || 'neutral'}">${esc((e || '').replace(/_/g, ' '))}</span>`;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if ([...document.scripts].some(s => s.src === src)) return resolve();
      const s = document.createElement('script');
      s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('No se pudo cargar ' + src));
      document.head.appendChild(s);
    });
  }

  const params = new URLSearchParams(window.location.search);
  const activoId = params.get('id');
  const pc = document.getElementById('pageContent');

  if (!activoId) {
    pc.innerHTML = `<div class="card"><div class="empty">Falta el parámetro del activo. <a class="link" href="/modules/act/activos.html">Volver a la bandeja</a></div></div>`;
    return;
  }

  let ficha = null;       // { activo, adjuntos_count, asignacion_vigente, ordenes_abiertas, ultima_orden_cerrada }
  let categorias = [], proveedores = null;
  let activeTab = 'datos';

  const $ = id => document.getElementById(id);

  async function loadFicha() {
    try {
      const res = await KoguApi.apiFetch('/protected/act/activos/' + encodeURIComponent(activoId) + '/ficha');
      ficha = KoguApi.unwrapData(res);
      return true;
    } catch (_err) {
      pc.innerHTML = `<div class="card"><div class="empty">No se encontró el activo (o pertenece a otra empresa). <a class="link" href="/modules/act/activos.html">Volver a la bandeja</a></div></div>`;
      return false;
    }
  }

  function renderShell() {
    const a = ficha.activo;
    const mtr = [
      { k: 'Custodio actual',  v: a.custodio_nombre || '—' },
      { k: 'Ubicación actual', v: a.ubicacion_nombre || '—' },
      { k: 'Documentos',       v: String(ficha.adjuntos_count != null ? ficha.adjuntos_count : 0) },
      { k: 'Órdenes abiertas', v: String((ficha.ordenes_abiertas && ficha.ordenes_abiertas.total) || 0) },
    ];
    pc.innerHTML = `
<div class="card">
  <div class="row">
    <div>
      <div class="eyebrow"><a class="link" href="/modules/act/activos.html">← Activos</a></div>
      <h2 style="margin:4px 0">${esc(a.codigo)} · ${esc(a.nombre)}</h2>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">${estadoBadge(a.estado)}<span class="chip">${esc(a.categoria_nombre || 'Sin categoría')}</span><span class="chip">Criticidad: ${esc(a.criticidad || '—')}</span></div>
    </div>
    <div style="display:flex;gap:8px">
      ${canUpdate ? '<button class="btn" id="editBtn">Editar</button>' : ''}
      ${canUpdate && a.estado !== 'baja' ? '<button class="btn" id="bajaBtn">Dar de baja</button>' : ''}
    </div>
  </div>
</div>

<div class="ot-metrics">
  ${mtr.map(m => `<div class="ot-metric"><div class="m-k">${esc(m.k)}</div><div class="m-v">${esc(m.v)}</div></div>`).join('')}
</div>

<div class="card" style="margin-top:14px">
  <div class="tabs">
    <button class="tab" data-tab="datos">Datos</button>
    <button class="tab" data-tab="expediente">Expediente</button>
    <button class="tab" data-tab="asignaciones">Asignaciones</button>
    <button class="tab" data-tab="mantenimiento">Mantenimiento</button>
    ${canGestoriaRead ? '<button class="tab" data-tab="gestoria">Gestoría <span id="gesCount"></span></button>' : ''}
    ${canComentariosRead ? '<button class="tab" data-tab="comentarios">Comentarios <span id="comCount"></span></button>' : ''}
  </div>
  <div id="tabBody"></div>
</div>`;

    pc.querySelectorAll('[data-tab]').forEach(btn => {
      btn.onclick = () => { activeTab = btn.dataset.tab; paintTabs(); renderTab(); };
    });
    if (canUpdate) {
      $('editBtn').onclick = openEdit;
      const bb = $('bajaBtn'); if (bb) bb.onclick = darDeBaja;
    }
    paintTabs();
    renderTab();
    if (canComentariosRead) refreshComentariosCount();
    if (canGestoriaRead) refreshGestoriaCount();
  }

  function paintTabs() {
    pc.querySelectorAll('[data-tab]').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === activeTab));
  }

  function field(label, val, opts) {
    const v = (val == null || val === '') ? '<span class="muted">—</span>' : esc(String(val));
    const long = (opts && opts.long) ? ' kv-long' : '';
    return `<div class="kv-row${long}"><span class="kv-k">${esc(label)}</span><span class="kv-v">${v}</span></div>`;
  }

  function renderTab() {
    const body = $('tabBody');
    if (activeTab === 'datos')         return renderDatos(body);
    if (activeTab === 'expediente')    return renderExpediente(body);
    if (activeTab === 'asignaciones')  return renderAsignaciones(body);
    if (activeTab === 'mantenimiento') return renderMantenimiento(body);
    if (activeTab === 'gestoria')      return renderGestoria(body);
    if (activeTab === 'comentarios')   return renderComentarios(body);
  }

  function placeholder(nombre, seg) {
    return `<div class="empty">📌 ${esc(nombre)} — Disponible en próximo segmento (${seg}).</div>`;
  }

  // ── Tab Datos + QR ──────────────────────────────────────────────────────────
  function renderDatos(body) {
    const a = ficha.activo;
    body.innerHTML = `
      <div class="split">
        <div class="stack">
          <div class="kv kv-2">
            ${field('Código', a.codigo)}
            ${field('Estado', (a.estado || '').replace(/_/g, ' '))}
            ${field('Categoría', a.categoria_nombre)}
            ${field('Criticidad', a.criticidad)}
            ${field('Marca', a.marca)}
            ${field('Modelo', a.modelo)}
            ${field('Número de serie', a.numero_serie)}
            ${field('Proveedor', a.proveedor_nombre)}
            ${field('Fecha adquisición', a.fecha_adquisicion ? KoguUi.fmtDateOnly(a.fecha_adquisicion) : null)}
            ${field('Garantía hasta', a.garantia_hasta ? KoguUi.fmtDateOnly(a.garantia_hasta) : null)}
            ${field('Costo adquisición', a.costo_adquisicion != null ? KoguUi.fmtMoney(a.costo_adquisicion, a.moneda) : null)}
            ${field('Costo reposición est.', a.costo_reposicion_estimado != null ? KoguUi.fmtMoney(a.costo_reposicion_estimado, a.moneda) : null)}
            ${field('Custodio actual', a.custodio_nombre)}
            ${field('Ubicación actual', a.ubicacion_nombre)}
          </div>
          ${a.descripcion ? field('Descripción', a.descripcion, { long: true }) : ''}
        </div>
        <div class="card" style="text-align:center">
          <div class="eyebrow">Etiqueta QR</div>
          <div id="qrBox" style="display:flex;justify-content:center;padding:12px"></div>
          <div class="muted" style="font-size:12px;word-break:break-all">${a.qr_token ? esc(a.qr_token) : 'Sin token QR'}</div>
          <div style="margin-top:12px"><button class="btn" id="printQrBtn" ${a.qr_token ? '' : 'disabled'}>Imprimir etiqueta</button></div>
        </div>
      </div>`;

    if (a.qr_token) renderQr(a);
  }

  async function renderQr(a) {
    try {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/qrious/4.0.2/qrious.min.js');
      const qr = new window.QRious({ value: a.qr_token, size: 200, level: 'M' });
      const dataUrl = qr.toDataURL('image/png');
      const box = $('qrBox');
      if (box) box.innerHTML = `<img src="${dataUrl}" width="200" height="200" alt="QR ${esc(a.codigo)}"/>`;
      const pbtn = $('printQrBtn');
      if (pbtn) pbtn.onclick = () => printEtiqueta(a, dataUrl);
    } catch (e) {
      const box = $('qrBox'); if (box) box.innerHTML = `<span class="muted">No se pudo generar el QR.</span>`;
    }
  }

  function printEtiqueta(a, dataUrl) {
    const w = window.open('', '_blank', 'width=420,height=520');
    if (!w) { KoguApi.toast('Permite las ventanas emergentes para imprimir.', 'error'); return; }
    w.document.write(`<!DOCTYPE html><html><head><title>Etiqueta ${esc(a.codigo)}</title>
      <style>body{font-family:system-ui,sans-serif;text-align:center;padding:24px}
      .cod{font-size:20px;font-weight:700;margin-top:12px}.nom{font-size:14px;color:#334155}</style></head>
      <body><img src="${dataUrl}" width="240" height="240"/><div class="cod">${esc(a.codigo)}</div><div class="nom">${esc(a.nombre)}</div>
      <script>window.onload=function(){window.print();}<\/script></body></html>`);
    w.document.close();
  }

  // ── Tab Expediente ──────────────────────────────────────────────────────────
  function renderExpediente(body) {
    const a = ficha.activo;
    const expLink = a.expediente_proveedor_id
      ? `<div class="chip" style="background:#ecfeff;color:#0e7490"><a class="link" href="/modules/exp/expediente-detalle.html?id=${encodeURIComponent(a.expediente_proveedor_id)}">Ver expediente del proveedor (exp) →</a></div>`
      : '';
    body.innerHTML = `
      <div class="row">
        <div><div class="eyebrow">Documentos del activo</div>${expLink}</div>
        <div>${canUpload ? '<button class="btn primary" id="addAdjBtn">+ Subir documento</button>' : ''}</div>
      </div>
      <div class="table-wrap" style="margin-top:14px">
        <table><thead><tr>
          <th>Tipo</th><th style="min-width:200px">Archivo / Descripción</th><th>Vigencia</th><th>Status</th><th>Subido por</th><th>Acciones</th>
        </tr></thead><tbody id="adjRows"><tr><td colspan="6" class="empty">Cargando…</td></tr></tbody></table>
      </div>`;
    if (canUpload) $('addAdjBtn').onclick = openUpload;
    loadAdjuntos();
  }

  async function loadAdjuntos() {
    const tbody = $('adjRows');
    if (!tbody) return;
    try {
      const res = await KoguApi.apiFetch('/protected/act/activos/' + encodeURIComponent(activoId) + '/adjuntos');
      const rows = KoguApi.unwrapRows(res, 'rows') || [];
      if (!rows.length) { tbody.innerHTML = `<tr><td colspan="6" class="empty">Sin documentos en el expediente.</td></tr>`; return; }
      tbody.innerHTML = rows.map(d => `
        <tr>
          <td><span class="chip">${esc(d.tipo_documento)}</span></td>
          <td><div style="font-weight:600">${esc(d.nombre_archivo_original || '—')}</div>${d.descripcion ? `<div class="muted" style="font-size:12px">${esc(d.descripcion)}</div>` : ''}</td>
          <td>${d.vigencia_hasta ? esc(d.vigencia_hasta) : '<span class="muted">—</span>'}</td>
          <td>${KoguUi.statusBadge(d.status)}</td>
          <td>${d.subido_por_nombre ? esc(d.subido_por_nombre) : '<span class="muted">—</span>'}</td>
          <td class="actions-cell">
            <button class="btn ghost" data-dl="${d.adjunto_id}" data-name="${esc(d.nombre_archivo_original || d.adjunto_id)}">Descargar</button>
            ${canDeleteAdj ? `<button class="btn ghost" data-del="${d.adjunto_id}">Baja</button>` : ''}
          </td>
        </tr>`).join('');
      tbody.querySelectorAll('[data-dl]').forEach(btn => btn.onclick = () => descargar(btn.dataset.dl, btn.dataset.name));
      tbody.querySelectorAll('[data-del]').forEach(btn => btn.onclick = () => bajaAdjunto(btn.dataset.del));
    } catch (_err) {
      tbody.innerHTML = `<tr><td colspan="6" class="empty">No fue posible cargar el expediente.</td></tr>`;
    }
  }

  async function descargar(adjuntoId, filename) {
    try {
      const resp = await KoguApi.authFetchRaw('/protected/act/adjuntos/' + encodeURIComponent(adjuntoId) + '/archivo', {
        method: 'GET', headers: { Accept: 'application/octet-stream, */*' },
      });
      if (!resp.ok) {
        let msg = 'No fue posible descargar el archivo';
        try { const e = await resp.json(); msg = e?.error?.message || msg; } catch (_e) {}
        throw new Error(msg);
      }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename || 'adjunto';
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e) { KoguApi.toast(e.message, 'error'); }
  }

  async function bajaAdjunto(adjuntoId) {
    if (!window.confirm('¿Dar de baja este documento del expediente? (baja lógica, recuperable)')) return;
    try {
      await KoguApi.apiFetch('/protected/act/adjuntos/' + encodeURIComponent(adjuntoId), { method: 'DELETE' });
      KoguApi.toast('Documento dado de baja', 'success');
      await loadAdjuntos();
    } catch (_err) { /* apiFetch toast */ }
  }

  // ── Modal de subida de adjunto ──────────────────────────────────────────────
  function buildUploadModal() {
    if (!canUpload) return;
    const overlay = document.createElement('div');
    overlay.id = 'upModal';
    overlay.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:9999;align-items:flex-start;justify-content:center;padding:40px 20px;backdrop-filter:blur(2px)';
    overlay.innerHTML = `
      <div style="width:100%;max-width:520px;background:white;border-radius:12px;box-shadow:0 20px 50px rgba(0,0,0,.3);color:#0f172a;overflow:hidden">
        <div style="padding:16px 20px;border-bottom:1px solid var(--line,#e2e8f0);display:flex;justify-content:space-between;align-items:center">
          <h2 style="margin:0;font-size:18px">Subir documento</h2>
          <button class="btn ghost" id="upClose" style="padding:6px 10px">✕</button>
        </div>
        <div style="padding:20px"><div class="stack">
          <div><div class="label-text">Tipo de documento</div><select class="select" id="up_tipo"><option value="">Selecciona…</option>${TIPOS_ADJ.map(t => `<option value="${t}">${t.replace(/_/g, ' ')}</option>`).join('')}</select></div>
          <div><div class="label-text">Descripción <span class="muted" style="font-size:11px">(opcional)</span></div><input class="input" id="up_desc" /></div>
          <div class="grid-2">
            <div><div class="label-text">Vigencia desde</div><input class="input" id="up_vd" type="date" /></div>
            <div><div class="label-text">Vigencia hasta</div><input class="input" id="up_vh" type="date" /></div>
          </div>
          <div><div class="label-text">Archivo (máx. 25 MB)</div><input class="input" id="up_file" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.xlsx,.xls,.docx,.doc,.csv,.txt" /></div>
        </div></div>
        <div style="padding:14px 20px;border-top:1px solid var(--line,#e2e8f0);display:flex;justify-content:flex-end;gap:8px">
          <button class="btn ghost" id="upCancel">Cancelar</button>
          <button class="btn primary" id="upSubmit">Subir</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeUpload(); });
    $('upClose').onclick = closeUpload;
    $('upCancel').onclick = closeUpload;
    $('upSubmit').onclick = submitUpload;
  }
  function openUpload() { ['up_tipo', 'up_desc', 'up_vd', 'up_vh', 'up_file'].forEach(id => { if ($(id)) $(id).value = ''; }); $('upModal').style.display = 'flex'; }
  function closeUpload() { const m = $('upModal'); if (m) m.style.display = 'none'; }

  async function submitUpload() {
    const tipo = $('up_tipo').value;
    const file = $('up_file').files[0];
    if (!tipo) { KoguApi.toast('Selecciona el tipo de documento.', 'error'); return; }
    if (!file) { KoguApi.toast('Selecciona un archivo.', 'error'); return; }
    if (file.size > 25 * 1024 * 1024) { KoguApi.toast('El archivo supera 25 MB.', 'error'); return; }

    await KoguUi.withLoading(this, async () => {
      try {
        const fd = new FormData();
        fd.append('archivo', file);
        fd.append('tipo_documento', tipo);
        if ($('up_desc').value) fd.append('descripcion', $('up_desc').value);
        if ($('up_vd').value)   fd.append('vigencia_desde', $('up_vd').value);
        if ($('up_vh').value)   fd.append('vigencia_hasta', $('up_vh').value);
        const token = KoguApi.getToken();
        const empresaId = KoguApi.getEmpresaId();
        const resp = await fetch(KoguApi.getBaseUrl() + '/protected/act/activos/' + encodeURIComponent(activoId) + '/adjuntos', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + token, ...(empresaId ? { 'X-Empresa-Id': empresaId } : {}) },
          body: fd,
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok || data?.ok === false) throw new Error(data?.error?.message || 'No fue posible subir el documento.');
        KoguApi.toast('Documento subido', 'success');
        closeUpload();
        await loadAdjuntos();
      } catch (e) { KoguApi.toast(e.message, 'error'); }
    }, 'Subiendo…');
  }

  // ── Editar activo ───────────────────────────────────────────────────────────
  function buildEditModal() {
    if (!canUpdate) return;
    const overlay = document.createElement('div');
    overlay.id = 'editModal';
    overlay.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:9999;align-items:flex-start;justify-content:center;padding:40px 20px 20px;backdrop-filter:blur(2px)';
    overlay.innerHTML = `
      <div style="width:100%;max-width:680px;max-height:88vh;background:white;border-radius:12px;box-shadow:0 20px 50px rgba(0,0,0,.3);display:flex;flex-direction:column;overflow:hidden;color:#0f172a">
        <div style="padding:16px 20px;border-bottom:1px solid var(--line,#e2e8f0);display:flex;justify-content:space-between;align-items:center;flex-shrink:0">
          <h2 style="margin:0;font-size:20px">Editar activo</h2>
          <button class="btn ghost" id="edClose" style="padding:6px 10px;font-size:16px">✕</button>
        </div>
        <div style="flex:1;overflow-y:auto;padding:20px"><div class="stack">
          <div class="grid-2">
            <div><div class="label-text">Código</div><input class="input" id="ed_codigo" maxlength="40" /></div>
            <div><div class="label-text">Categoría</div><select class="select" id="ed_categoria"></select></div>
          </div>
          <div><div class="label-text">Nombre</div><input class="input" id="ed_nombre" /></div>
          <div><div class="label-text">Descripción</div><input class="input" id="ed_descripcion" /></div>
          <div class="grid-3">
            <div><div class="label-text">Marca</div><input class="input" id="ed_marca" /></div>
            <div><div class="label-text">Modelo</div><input class="input" id="ed_modelo" /></div>
            <div><div class="label-text">Número de serie</div><input class="input" id="ed_serie" /></div>
          </div>
          <div class="grid-3">
            <div><div class="label-text">Criticidad</div><select class="select" id="ed_criticidad">${CRITICIDADES.map(c => `<option value="${c}">${c}</option>`).join('')}</select></div>
            <div><div class="label-text">Fecha adquisición</div><input class="input" id="ed_fecha_adq" type="date" /></div>
            <div><div class="label-text">Garantía hasta</div><input class="input" id="ed_garantia" type="date" /></div>
          </div>
          <div class="grid-3">
            <div><div class="label-text">Costo adquisición</div><input class="input" id="ed_costo" type="number" min="0" step="0.01" /></div>
            <div><div class="label-text">Moneda</div><input class="input" id="ed_moneda" maxlength="3" /></div>
            <div><div class="label-text">Costo reposición est.</div><input class="input" id="ed_reposicion" type="number" min="0" step="0.01" /></div>
          </div>
        </div></div>
        <div style="padding:14px 20px;border-top:1px solid var(--line,#e2e8f0);display:flex;justify-content:flex-end;gap:8px;flex-shrink:0">
          <button class="btn ghost" id="edCancel">Cancelar</button>
          <button class="btn primary" id="edSave">Guardar cambios</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeEdit(); });
    $('edClose').onclick = closeEdit;
    $('edCancel').onclick = closeEdit;
    $('edSave').onclick = saveEdit;
  }
  function closeEdit() { const m = $('editModal'); if (m) m.style.display = 'none'; }

  async function openEdit() {
    if (!categorias.length) {
      try { categorias = KoguApi.unwrapRows(await KoguApi.apiFetch('/protected/act/categorias'), 'rows') || []; } catch (_e) {}
    }
    const a = ficha.activo;
    $('ed_categoria').innerHTML = categorias.filter(c => c.activo !== false || c.categoria_id === a.categoria_id)
      .map(c => `<option value="${c.categoria_id}">${esc(c.clave)} — ${esc(c.nombre)}</option>`).join('');
    $('ed_codigo').value = a.codigo || '';
    $('ed_categoria').value = a.categoria_id || '';
    $('ed_nombre').value = a.nombre || '';
    $('ed_descripcion').value = a.descripcion || '';
    $('ed_marca').value = a.marca || '';
    $('ed_modelo').value = a.modelo || '';
    $('ed_serie').value = a.numero_serie || '';
    $('ed_criticidad').value = a.criticidad || 'media';
    $('ed_fecha_adq').value = (a.fecha_adquisicion || '').slice(0, 10);
    $('ed_garantia').value = (a.garantia_hasta || '').slice(0, 10);
    $('ed_costo').value = a.costo_adquisicion != null ? a.costo_adquisicion : '';
    $('ed_moneda').value = a.moneda || '';
    $('ed_reposicion').value = a.costo_reposicion_estimado != null ? a.costo_reposicion_estimado : '';
    $('editModal').style.display = 'flex';
  }

  async function saveEdit() {
    const payload = {
      codigo: $('ed_codigo').value.trim(),
      nombre: $('ed_nombre').value.trim(),
      categoria_id: $('ed_categoria').value,
      descripcion: $('ed_descripcion').value.trim() || null,
      marca: $('ed_marca').value.trim() || null,
      modelo: $('ed_modelo').value.trim() || null,
      numero_serie: $('ed_serie').value.trim() || null,
      criticidad: $('ed_criticidad').value,
      fecha_adquisicion: $('ed_fecha_adq').value || null,
      garantia_hasta: $('ed_garantia').value || null,
      costo_adquisicion: $('ed_costo').value ? Number($('ed_costo').value) : null,
      moneda: $('ed_moneda').value.trim() || null,
      costo_reposicion_estimado: $('ed_reposicion').value ? Number($('ed_reposicion').value) : null,
    };
    if (!payload.codigo) { KoguApi.toast('El código es obligatorio.', 'error'); return; }
    if (!payload.nombre) { KoguApi.toast('El nombre es obligatorio.', 'error'); return; }
    if (!payload.categoria_id) { KoguApi.toast('La categoría es obligatoria.', 'error'); return; }

    await KoguUi.withLoading(this, async () => {
      try {
        await KoguApi.apiFetch('/protected/act/activos/' + encodeURIComponent(activoId), { method: 'PUT', body: JSON.stringify(payload) });
        KoguApi.toast('Activo actualizado', 'success');
        closeEdit();
        if (await loadFicha()) renderShell();
      } catch (_err) { /* apiFetch toast */ }
    }, 'Guardando…');
  }

  async function darDeBaja() {
    if (!window.confirm('¿Dar de baja este activo? No se puede si tiene órdenes abiertas o una asignación vigente.')) return;
    try {
      await KoguApi.apiFetch('/protected/act/activos/' + encodeURIComponent(activoId) + '/baja', { method: 'POST' });
      KoguApi.toast('Activo dado de baja', 'success');
      if (await loadFicha()) renderShell();
    } catch (_err) { /* apiFetch toast: 422 con el mensaje de qué falta cerrar */ }
  }

  // ── Tab Asignaciones (segmento 19) ──────────────────────────────────────────
  let usuariosAsg = null;          // lista de usuarios (lazy)
  let ubicacionesAsg = null;       // ubicaciones activas (lazy)
  let asgMode = 'asignar';         // asignar | transferir | devolver
  const asgSel = { custodioId: null, custodioNombre: '' };

  async function ensureUsuarios() {
    if (usuariosAsg) return usuariosAsg;
    try { usuariosAsg = KoguApi.unwrapRows(await KoguApi.apiFetch('/protected/core/usuarios')) || []; }
    catch (_e) { usuariosAsg = []; }
    return usuariosAsg;
  }
  async function ensureUbicaciones() {
    if (ubicacionesAsg) return ubicacionesAsg;
    try {
      const all = KoguApi.unwrapRows(await KoguApi.apiFetch('/protected/act/ubicaciones'), 'rows') || [];
      ubicacionesAsg = all.filter(u => u.activo !== false);
    } catch (_e) { ubicacionesAsg = []; }
    return ubicacionesAsg;
  }

  // Mutaciones de asignación con fetch crudo: el 409 "ya asignado" no debe
  // disparar el redirect genérico a cambio-empresa de apiFetch.
  async function asgActionFetch(path, body) {
    const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + KoguApi.getToken() };
    const emp = KoguApi.getEmpresaId(); if (emp) headers['X-Empresa-Id'] = emp;
    const resp = await fetch(KoguApi.getBaseUrl() + path, { method: 'POST', headers, body: JSON.stringify(body || {}) });
    let data = {}; try { data = await resp.json(); } catch (_e) {}
    return { ok: resp.ok, status: resp.status, data };
  }

  function renderAsignaciones(body) {
    const vig = ficha.asignacion_vigente;
    let acciones = '';
    if (canManageAsg) {
      acciones = vig
        ? `<button class="btn primary" id="asgTransferir">Transferir</button><button class="btn" id="asgDevolver">Devolver</button>`
        : `<button class="btn primary" id="asgAsignar">Asignar</button>`;
    }
    body.innerHTML = `
      <div class="row">
        <div><div class="eyebrow">Estado actual</div></div>
        <div style="display:flex;gap:8px">${acciones}</div>
      </div>
      <div class="card" style="margin-top:8px">
        ${vig
          ? `<div class="kv kv-2">
               ${field('Custodio vigente', vig.custodio_nombre)}
               ${field('Ubicación vigente', vig.ubicacion_clave ? (vig.ubicacion_clave + ' — ' + (vig.ubicacion_nombre || '')) : null)}
               ${field('Motivo', (vig.motivo || '').replace(/_/g, ' '))}
               ${field('Desde', KoguUi.fmtDate(vig.fecha_asignacion))}
             </div>${vig.observaciones ? field('Observaciones', vig.observaciones, { long: true }) : ''}`
          : `<div class="empty">Sin asignación vigente.</div>`}
      </div>
      <div class="eyebrow" style="margin-top:16px">Historial de custodia</div>
      <div id="asgRows" style="margin-top:12px"><div class="empty">Cargando…</div></div>`;

    if (canManageAsg) {
      const a = $('asgAsignar'); if (a) a.onclick = () => openAsgModal('asignar');
      const t = $('asgTransferir'); if (t) t.onclick = () => openAsgModal('transferir');
      const d = $('asgDevolver'); if (d) d.onclick = () => openAsgModal('devolver');
    }
    loadAsignaciones();
  }

  async function loadAsignaciones() {
    const cont = $('asgRows');
    if (!cont) return;
    const MOTIVO_COLOR = { asignacion: '#2563eb', transferencia: '#ca8a04', devolucion: '#16a34a', resguardo: '#7c3aed' };
    try {
      const res = await KoguApi.apiFetch('/protected/act/activos/' + encodeURIComponent(activoId) + '/asignaciones');
      const rows = KoguApi.unwrapRows(res, 'rows') || [];
      if (!rows.length) { cont.innerHTML = `<div class="empty">Sin movimientos de custodia.</div>`; return; }
      cont.innerHTML = `<div class="ot-timeline">${rows.map(r => {
        const color = MOTIVO_COLOR[r.motivo] || '#64748b';
        const ubic = r.ubicacion_clave ? (esc(r.ubicacion_clave) + (r.ubicacion_nombre ? ' — ' + esc(r.ubicacion_nombre) : '')) : '';
        const custodio = r.custodio_nombre ? esc(r.custodio_nombre) : '<span class="muted">—</span>';
        const entrega = `Entregó ${r.entregado_por_nombre ? esc(r.entregado_por_nombre) : '—'} · Recibió ${r.recibido_por_nombre ? esc(r.recibido_por_nombre) : '—'}`;
        return `<div class="ot-ev">
          <div class="ot-evdot" style="border-color:${color}"></div>
          <div class="ot-evhead">
            <span style="display:flex;gap:6px;align-items:center"><span class="chip">${esc((r.motivo || '').replace(/_/g, ' '))}</span>${r.fecha_devolucion ? '' : '<span class="badge success">Vigente</span>'}</span>
            <span class="muted" style="font-size:12px">${KoguUi.fmtDate(r.fecha_asignacion)}</span>
          </div>
          <div class="ot-evtext">${custodio}${ubic ? ' · ' + ubic : ''}</div>
          <div class="ot-evby">${entrega}${r.fecha_devolucion ? ' · Devuelto ' + KoguUi.fmtDate(r.fecha_devolucion) : ''}</div>
          ${r.observaciones ? `<div class="ot-evby">${esc(r.observaciones)}</div>` : ''}
        </div>`;
      }).join('')}</div>`;
    } catch (_err) {
      cont.innerHTML = `<div class="empty">No fue posible cargar el historial.</div>`;
    }
  }

  function buildAsgModal() {
    if (!canManageAsg) return;
    const overlay = document.createElement('div');
    overlay.id = 'asgModal';
    overlay.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:9999;align-items:flex-start;justify-content:center;padding:40px 20px;backdrop-filter:blur(2px)';
    overlay.innerHTML = `
      <div style="width:100%;max-width:540px;background:white;border-radius:12px;box-shadow:0 20px 50px rgba(0,0,0,.3);color:#0f172a;overflow:hidden">
        <div style="padding:16px 20px;border-bottom:1px solid var(--line,#e2e8f0);display:flex;justify-content:space-between;align-items:center">
          <h2 id="asgTitle" style="margin:0;font-size:18px">Asignar</h2>
          <button class="btn ghost" id="asgClose" style="padding:6px 10px">✕</button>
        </div>
        <div style="padding:20px"><div class="stack">
          <div id="asgCustodioWrap">
            <div class="label-text">Custodio</div>
            <div style="display:flex;gap:6px">
              <input class="input" id="asg_custodio_label" readonly placeholder="— selecciona —" style="flex:1;cursor:pointer;background:#f8fafc" />
              <button type="button" class="btn ghost" id="asg_custodio_pick">Buscar…</button>
            </div>
          </div>
          <div id="asgUbicacionWrap">
            <div class="label-text">Ubicación</div>
            <select class="select" id="asg_ubicacion"><option value="">— selecciona —</option></select>
          </div>
          <div>
            <div class="label-text">Observaciones <span class="muted" style="font-size:11px">(opcional)</span></div>
            <input class="input" id="asg_obs" />
          </div>
          <div id="asgDevolverNota" class="muted" style="display:none;font-size:13px">Se cerrará la asignación vigente. El custodio quedará sin asignar; la ubicación se conserva.</div>
        </div></div>
        <div style="padding:14px 20px;border-top:1px solid var(--line,#e2e8f0);display:flex;justify-content:flex-end;gap:8px">
          <button class="btn ghost" id="asgCancel">Cancelar</button>
          <button class="btn primary" id="asgSave">Confirmar</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeAsg(); });
    $('asgClose').onclick = closeAsg;
    $('asgCancel').onclick = closeAsg;
    $('asgSave').onclick = saveAsg;
    const pick = async () => {
      await ensureUsuarios();
      KoguUi.openSearchPicker({
        title: 'Selecciona el custodio', items: usuariosAsg,
        placeholder: 'Buscar por nombre o email…',
        columns: [{ key: 'nombre', label: 'Nombre', primary: true }, { key: 'email', label: 'Email' }],
        emptyText: 'Sin usuarios.',
        onSelect: (u) => { asgSel.custodioId = u.user_id; asgSel.custodioNombre = u.nombre || u.email || u.user_id; $('asg_custodio_label').value = asgSel.custodioNombre; },
      });
    };
    $('asg_custodio_pick').onclick = pick;
    $('asg_custodio_label').onclick = pick;
  }
  function closeAsg() { const m = $('asgModal'); if (m) m.style.display = 'none'; }

  async function openAsgModal(mode) {
    asgMode = mode;
    asgSel.custodioId = null; asgSel.custodioNombre = '';
    $('asg_custodio_label').value = '';
    $('asg_obs').value = '';
    const needsDestino = (mode !== 'devolver');
    $('asgCustodioWrap').style.display = needsDestino ? '' : 'none';
    $('asgUbicacionWrap').style.display = needsDestino ? '' : 'none';
    $('asgDevolverNota').style.display = needsDestino ? 'none' : '';
    $('asgTitle').textContent = mode === 'asignar' ? 'Asignar activo' : mode === 'transferir' ? 'Transferir activo' : 'Devolver activo';
    if (needsDestino) {
      await ensureUbicaciones();
      $('asg_ubicacion').innerHTML = '<option value="">— selecciona —</option>' +
        ubicacionesAsg.map(u => `<option value="${u.ubicacion_id}">${esc(u.clave)} — ${esc(u.nombre)}</option>`).join('');
    }
    $('asgModal').style.display = 'flex';
  }

  async function saveAsg() {
    const obs = $('asg_obs').value.trim() || null;
    let path, payload;
    if (asgMode === 'devolver') {
      path = '/protected/act/activos/' + encodeURIComponent(activoId) + '/devolver';
      payload = { observaciones: obs };
    } else {
      const custodioId = asgSel.custodioId;
      const ubicacionId = $('asg_ubicacion').value;
      if (!custodioId)  { KoguApi.toast('Selecciona el custodio.', 'error'); return; }
      if (!ubicacionId) { KoguApi.toast('Selecciona la ubicación.', 'error'); return; }
      path = '/protected/act/activos/' + encodeURIComponent(activoId) + '/' + (asgMode === 'asignar' ? 'asignar' : 'transferir');
      payload = { custodio_user_id: custodioId, ubicacion_id: ubicacionId, observaciones: obs };
    }

    await KoguUi.withLoading(this, async () => {
      const r = await asgActionFetch(path, payload);
      if (r.ok) {
        KoguApi.toast(asgMode === 'asignar' ? 'Activo asignado' : asgMode === 'transferir' ? 'Activo transferido' : 'Activo devuelto', 'success');
        closeAsg();
        activeTab = 'asignaciones';
        if (await loadFicha()) renderShell();
        return;
      }
      const msg = r.data?.error?.message || 'No fue posible completar la operación.';
      if (r.status === 401) { KoguApi.toast('Tu sesión expiró.', 'error'); setTimeout(() => window.location.href = '/login.html', 600); return; }
      if (r.status === 409) {
        // Carrera: el activo ya tiene asignación vigente. Toast + recarga para consistencia.
        KoguApi.toast(msg, 'error');
        closeAsg();
        activeTab = 'asignaciones';
        if (await loadFicha()) renderShell();
        return;
      }
      KoguApi.toast(msg, 'error'); // 403/404/422/otros
    }, 'Procesando…');
  }

  // ── Tab Mantenimiento (segmento 20): planes + órdenes del activo ────────────
  const ESTADO_ORDEN_COLOR = { abierta: '#ca8a04', en_proceso: '#2563eb', en_espera: '#7c3aed', cerrada: '#16a34a', cancelada: '#dc2626' };
  const ordenEstadoBadge = e => { const c = ESTADO_ORDEN_COLOR[e] || '#64748b'; return `<span class="chip" style="background:${c}1a;color:${c};border:1px solid ${c}55">${esc((e || '').replace(/_/g, ' '))}</span>`; };

  function renderMantenimiento(body) {
    body.innerHTML = `
      <div class="row">
        <div><div class="eyebrow">Planes preventivos</div></div>
        <div>${canPlanesManage ? '<button class="btn primary" id="newPlanBtn">+ Nuevo plan</button>' : ''}</div>
      </div>
      <div class="table-wrap" style="margin-top:10px">
        <table><thead><tr><th>Nombre</th><th>Frecuencia</th><th>Próxima fecha</th><th>Activo</th><th>Acciones</th></tr></thead>
        <tbody id="planRows">${canPlanesRead ? '<tr><td colspan="5" class="empty">Cargando…</td></tr>' : '<tr><td colspan="5" class="empty">Sin permiso para ver planes.</td></tr>'}</tbody></table>
      </div>
      <div class="eyebrow" style="margin-top:18px">Órdenes del activo</div>
      <div class="table-wrap" style="margin-top:8px">
        <table><thead><tr><th>Folio</th><th>Tipo</th><th>Estado</th><th>Prioridad</th><th>Apertura</th><th>Compromiso</th></tr></thead>
        <tbody id="ordActivoRows">${canOrdenesRead ? '<tr><td colspan="6" class="empty">Cargando…</td></tr>' : '<tr><td colspan="6" class="empty">Sin permiso para ver órdenes.</td></tr>'}</tbody></table>
      </div>`;
    if (canPlanesManage) $('newPlanBtn').onclick = () => openPlan(null);
    if (canPlanesRead) loadPlanes();
    if (canOrdenesRead) loadOrdenesActivo();
  }

  let planesCache = [];
  async function loadPlanes() {
    const tbody = $('planRows'); if (!tbody) return;
    try {
      const res = await KoguApi.apiFetch('/protected/act/activos/' + encodeURIComponent(activoId) + '/planes');
      planesCache = KoguApi.unwrapRows(res, 'rows') || [];
      if (!planesCache.length) { tbody.innerHTML = `<tr><td colspan="5" class="empty">Sin planes preventivos.</td></tr>`; return; }
      tbody.innerHTML = planesCache.map(p => `
        <tr>
          <td><strong>${esc(p.nombre)}</strong>${p.instrucciones ? `<div class="muted" style="font-size:12px">${esc(p.instrucciones)}</div>` : ''}</td>
          <td>cada ${esc(String(p.frecuencia_valor))} ${esc(p.tipo_frecuencia)}</td>
          <td>${p.proxima_fecha ? esc(KoguUi.fmtDateOnly(p.proxima_fecha)) : '<span class="muted">—</span>'}</td>
          <td>${p.activo !== false ? '<span class="badge success">Sí</span>' : '<span class="badge neutral">No</span>'}</td>
          <td class="actions-cell">
            ${canPlanesManage ? `<button class="btn ghost" data-plan-edit="${p.plan_id}">Editar</button>` : ''}
            ${canOrdenesCreate ? `<button class="btn ghost" data-plan-gen="${p.plan_id}">Generar orden</button>` : ''}
          </td>
        </tr>`).join('');
      tbody.querySelectorAll('[data-plan-edit]').forEach(btn => btn.onclick = () => openPlan(planesCache.find(p => p.plan_id === btn.dataset.planEdit)));
      tbody.querySelectorAll('[data-plan-gen]').forEach(btn => btn.onclick = () => generarOrden(btn.dataset.planGen));
    } catch (_err) { tbody.innerHTML = `<tr><td colspan="5" class="empty">No fue posible cargar los planes.</td></tr>`; }
  }

  async function loadOrdenesActivo() {
    const tbody = $('ordActivoRows'); if (!tbody) return;
    try {
      const res = await KoguApi.apiFetch('/protected/act/ordenes?' + KoguUi.queryParams({ activo_id: activoId, page_size: 200 }));
      const rows = KoguApi.unwrapData(res).datos || [];
      if (!rows.length) { tbody.innerHTML = `<tr><td colspan="6" class="empty">Sin órdenes para este activo.</td></tr>`; return; }
      tbody.innerHTML = rows.map(o => `
        <tr style="cursor:pointer" data-ord="${o.orden_id}">
          <td><strong>#${esc(String(o.id_mov))}</strong></td>
          <td><span class="chip">${esc(o.tipo)}</span></td>
          <td>${ordenEstadoBadge(o.estado)}</td>
          <td>${esc(o.prioridad || '')}</td>
          <td>${KoguUi.fmtDate(o.fecha_apertura)}</td>
          <td>${o.fecha_compromiso ? esc(KoguUi.fmtDateOnly(o.fecha_compromiso)) : '<span class="muted">—</span>'}</td>
        </tr>`).join('');
      tbody.querySelectorAll('[data-ord]').forEach(tr => tr.onclick = () => { window.location.href = '/modules/act/orden-detalle.html?id=' + encodeURIComponent(tr.dataset.ord); });
    } catch (_err) { tbody.innerHTML = `<tr><td colspan="6" class="empty">No fue posible cargar las órdenes.</td></tr>`; }
  }

  async function generarOrden(planId) {
    if (!window.confirm('¿Generar una orden de mantenimiento preventivo a partir de este plan?')) return;
    try {
      const res = await KoguApi.apiFetch('/protected/act/planes/' + encodeURIComponent(planId) + '/generar-orden', { method: 'POST', body: JSON.stringify({}) });
      const created = KoguApi.unwrapData(res);
      KoguApi.toast('Orden generada · #' + (created?.id_mov || ''), 'success');
      if (created?.orden_id) window.location.href = '/modules/act/orden-detalle.html?id=' + encodeURIComponent(created.orden_id);
      else await loadOrdenesActivo();
    } catch (_err) { /* apiFetch toast */ }
  }

  function buildPlanModal() {
    if (!canPlanesManage) return;
    const overlay = document.createElement('div');
    overlay.id = 'planModal';
    overlay.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:9999;align-items:flex-start;justify-content:center;padding:40px 20px;backdrop-filter:blur(2px)';
    overlay.innerHTML = `
      <div style="width:100%;max-width:520px;background:white;border-radius:12px;box-shadow:0 20px 50px rgba(0,0,0,.3);color:#0f172a;overflow:hidden">
        <div style="padding:16px 20px;border-bottom:1px solid var(--line,#e2e8f0);display:flex;justify-content:space-between;align-items:center">
          <h2 id="planTitle" style="margin:0;font-size:18px">Nuevo plan</h2><button class="btn ghost" id="planClose" style="padding:6px 10px">✕</button>
        </div>
        <div style="padding:20px"><div class="stack">
          <input type="hidden" id="plan_id"/>
          <div><div class="label-text">Nombre</div><input class="input" id="plan_nombre" placeholder="Ej. Servicio mayor"/></div>
          <div class="grid-3">
            <div><div class="label-text">Frecuencia</div><select class="select" id="plan_tipo_frec"><option value="meses">meses</option><option value="dias">días</option></select></div>
            <div><div class="label-text">Cada</div><input class="input" id="plan_valor" type="number" min="1" step="1" placeholder="6"/></div>
            <div><div class="label-text">Próxima fecha <span class="muted" style="font-size:11px">(auto)</span></div><input class="input" id="plan_proxima" type="date"/></div>
          </div>
          <div><div class="label-text">Instrucciones <span class="muted" style="font-size:11px">(opcional)</span></div><input class="input" id="plan_instr"/></div>
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer"><input type="checkbox" id="plan_activo" checked/> <span>Activo</span></label>
        </div></div>
        <div style="padding:14px 20px;border-top:1px solid var(--line,#e2e8f0);display:flex;justify-content:flex-end;gap:8px">
          <button class="btn ghost" id="planCancel">Cancelar</button><button class="btn primary" id="planSave">Guardar</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) closePlan(); });
    $('planClose').onclick = closePlan; $('planCancel').onclick = closePlan; $('planSave').onclick = savePlan;
  }
  function closePlan() { const m = $('planModal'); if (m) m.style.display = 'none'; }
  function openPlan(plan) {
    $('plan_id').value = plan ? plan.plan_id : '';
    $('plan_nombre').value = plan ? plan.nombre : '';
    $('plan_tipo_frec').value = plan ? plan.tipo_frecuencia : 'meses';
    $('plan_valor').value = plan ? plan.frecuencia_valor : '';
    $('plan_proxima').value = plan ? (plan.proxima_fecha || '').slice(0, 10) : '';
    $('plan_instr').value = plan ? (plan.instrucciones || '') : '';
    $('plan_activo').checked = plan ? plan.activo !== false : true;
    $('planTitle').textContent = plan ? 'Editar plan' : 'Nuevo plan';
    $('planModal').style.display = 'flex';
  }
  async function savePlan() {
    const id = $('plan_id').value;
    const nombre = $('plan_nombre').value.trim();
    const valor = $('plan_valor').value;
    if (!nombre) { KoguApi.toast('El nombre es obligatorio.', 'error'); return; }
    if (!valor || Number(valor) <= 0) { KoguApi.toast('La frecuencia debe ser mayor que 0.', 'error'); return; }
    const payload = {
      nombre, tipo_frecuencia: $('plan_tipo_frec').value, frecuencia_valor: Number(valor),
      proxima_fecha: $('plan_proxima').value || null,
      instrucciones: $('plan_instr').value.trim() || null,
      activo: $('plan_activo').checked,
    };
    await KoguUi.withLoading(this, async () => {
      try {
        if (id) {
          await KoguApi.apiFetch('/protected/act/planes/' + encodeURIComponent(id), { method: 'PUT', body: JSON.stringify(payload) });
          KoguApi.toast('Plan actualizado', 'success');
        } else {
          await KoguApi.apiFetch('/protected/act/activos/' + encodeURIComponent(activoId) + '/planes', { method: 'POST', body: JSON.stringify(payload) });
          KoguApi.toast('Plan creado', 'success');
        }
        closePlan();
        await loadPlanes();
      } catch (_err) { /* apiFetch toast */ }
    }, 'Guardando…');
  }

  // ── Tab Comentarios (segmento 27) ───────────────────────────────────────────
  const COM_TIPO = {
    nota:        { color: '#64748b', label: 'Nota' },
    observacion: { color: '#ca8a04', label: 'Observación' },
    incidencia:  { color: '#dc2626', label: 'Incidencia' },
  };

  async function refreshComentariosCount() {
    try {
      const res = await KoguApi.apiFetch('/protected/act/activos/' + encodeURIComponent(activoId) + '/comentarios');
      const n = (KoguApi.unwrapRows(res, 'rows') || []).length;
      const el = $('comCount'); if (el) el.textContent = n ? `(${n})` : '';
    } catch (_e) {}
  }

  function renderComentarios(body) {
    body.innerHTML = `
      ${canComentariosWrite ? `
      <div class="card" style="padding:14px">
        <div class="grid-3">
          <div><div class="label-text">Tipo</div><select class="select" id="com_tipo">
            <option value="nota">Nota</option><option value="observacion">Observación</option><option value="incidencia">Incidencia</option>
          </select></div>
          <div style="grid-column:span 2"><div class="label-text">Comentario</div><input class="input" id="com_texto" placeholder="Escribe una nota, observación o incidencia…"/></div>
        </div>
        <label style="display:flex;align-items:center;gap:8px;margin-top:10px;cursor:pointer"><input type="checkbox" id="com_fijado"/> <span>Fijar al inicio</span></label>
        <div style="margin-top:10px;text-align:right"><button class="btn primary" id="com_add">Agregar comentario</button></div>
      </div>` : ''}
      <div id="comList" class="stack" style="margin-top:14px"><div class="empty">Cargando…</div></div>`;
    if (canComentariosWrite) $('com_add').onclick = addComentario;
    loadComentarios();
  }

  async function loadComentarios() {
    const list = $('comList'); if (!list) return;
    try {
      const res = await KoguApi.apiFetch('/protected/act/activos/' + encodeURIComponent(activoId) + '/comentarios');
      const rows = KoguApi.unwrapRows(res, 'rows') || [];
      const el = $('comCount'); if (el) el.textContent = rows.length ? `(${rows.length})` : '';
      if (!rows.length) { list.innerHTML = `<div class="empty">Sin comentarios.</div>`; return; }
      list.innerHTML = `<div class="ot-timeline">${rows.map(c => {
        const t = COM_TIPO[c.tipo] || COM_TIPO.nota;
        const mine = c.created_by && myUserId && c.created_by === myUserId;
        return `<div class="ot-ev">
          <div class="ot-evdot" style="border-color:${t.color}"></div>
          <div class="ot-evhead">
            <span style="display:flex;gap:6px;align-items:center">
              ${c.fijado ? '<span title="Fijado">📌</span>' : ''}
              <span class="chip" style="background:${t.color}1a;color:${t.color};border:1px solid ${t.color}55">${esc(t.label)}</span>
            </span>
            <span class="muted" style="font-size:12px">${c.autor_nombre ? esc(c.autor_nombre) : '—'} · ${KoguUi.fmtDate(c.created_at)}</span>
          </div>
          <div class="ot-evtext" data-com-text="${c.comentario_id}">${esc(c.texto)}</div>
          ${(canComentariosWrite && mine) ? `<div class="actions-cell" style="margin-top:8px">
            <button class="btn ghost" data-com-fijar="${c.comentario_id}" data-fij="${c.fijado ? '1' : '0'}">${c.fijado ? 'Desfijar' : 'Fijar'}</button>
            <button class="btn ghost" data-com-edit="${c.comentario_id}">Editar</button>
            <button class="btn ghost" data-com-del="${c.comentario_id}">Eliminar</button>
          </div>` : ''}
        </div>`;
      }).join('')}</div>`;
      if (canComentariosWrite) {
        list.querySelectorAll('[data-com-fijar]').forEach(btn => btn.onclick = () => toggleFijar(btn.dataset.comFijar, btn.dataset.fij !== '1', rows));
        list.querySelectorAll('[data-com-edit]').forEach(btn => btn.onclick = () => editComentario(btn.dataset.comEdit, rows));
        list.querySelectorAll('[data-com-del]').forEach(btn => btn.onclick = () => delComentario(btn.dataset.comDel));
      }
    } catch (_err) { list.innerHTML = `<div class="empty">No fue posible cargar los comentarios.</div>`; }
  }

  async function addComentario() {
    const texto = $('com_texto').value.trim();
    if (!texto) { KoguApi.toast('Escribe el comentario.', 'error'); return; }
    const payload = { texto, tipo: $('com_tipo').value, fijado: $('com_fijado').checked };
    await KoguUi.withLoading($('com_add'), async () => {
      try {
        await KoguApi.apiFetch('/protected/act/activos/' + encodeURIComponent(activoId) + '/comentarios', { method: 'POST', body: JSON.stringify(payload) });
        KoguApi.toast('Comentario agregado', 'success');
        $('com_texto').value = ''; $('com_fijado').checked = false; $('com_tipo').value = 'nota';
        await loadComentarios();
      } catch (_err) { /* apiFetch toast */ }
    }, 'Guardando…');
  }

  async function toggleFijar(id, fijado, rows) {
    const c = rows.find(x => x.comentario_id === id);
    try {
      await KoguApi.apiFetch('/protected/act/comentarios/' + encodeURIComponent(id), {
        method: 'PUT', body: JSON.stringify({ fijado, tipo: c?.tipo, texto: c?.texto }),
      });
      await loadComentarios();
    } catch (_err) { /* apiFetch toast (403 si no es propio) */ }
  }

  async function editComentario(id, rows) {
    const c = rows.find(x => x.comentario_id === id);
    if (!c) return;
    const nuevo = window.prompt('Editar comentario:', c.texto || '');
    if (nuevo == null) return;
    const t = String(nuevo).trim();
    if (!t) { KoguApi.toast('El comentario no puede quedar vacío.', 'error'); return; }
    try {
      await KoguApi.apiFetch('/protected/act/comentarios/' + encodeURIComponent(id), { method: 'PUT', body: JSON.stringify({ texto: t, tipo: c.tipo, fijado: c.fijado }) });
      KoguApi.toast('Comentario actualizado', 'success');
      await loadComentarios();
    } catch (_err) { /* apiFetch toast (403 si no es propio) */ }
  }

  async function delComentario(id) {
    if (!window.confirm('¿Eliminar este comentario?')) return;
    try {
      await KoguApi.apiFetch('/protected/act/comentarios/' + encodeURIComponent(id), { method: 'DELETE' });
      KoguApi.toast('Comentario eliminado', 'success');
      await loadComentarios();
    } catch (_err) { /* apiFetch toast (403 si no es propio) */ }
  }

  // ── Tab Gestoría ─────────────────────────────────────────────────────────────
  let gestoriaTipos = null;
  async function ensureGestoriaTipos() {
    if (gestoriaTipos) return gestoriaTipos;
    try {
      const res = await KoguApi.apiFetch('/protected/act/gestoria/tipos');
      gestoriaTipos = KoguApi.unwrapRows(res, 'rows') || [];
    } catch (_e) { gestoriaTipos = []; }
    return gestoriaTipos;
  }

  function gestoriaSemaforo(g) {
    if (g.estado === 'cumplido')  return { color: '#16a34a', label: 'Cumplida' };
    if (g.estado === 'no_aplica') return { color: '#64748b', label: 'No aplica' };
    if (!g.fecha_vencimiento)     return { color: '#64748b', label: 'Sin fecha' };
    const venc = String(g.fecha_vencimiento).slice(0, 10);
    const hoy = new Date().toISOString().slice(0, 10);
    const dias = Math.round((new Date(venc + 'T00:00:00Z') - new Date(hoy + 'T00:00:00Z')) / 86400000);
    if (dias < 0)   return { color: '#dc2626', label: `Vencida (${Math.abs(dias)}d)` };
    if (dias <= 30) return { color: '#ca8a04', label: `Vence en ${dias}d` };
    return { color: '#2563eb', label: 'Vigente' };
  }

  async function refreshGestoriaCount() {
    try {
      const res = await KoguApi.apiFetch('/protected/act/activos/' + encodeURIComponent(activoId) + '/gestoria');
      const n = (KoguApi.unwrapRows(res, 'rows') || []).length;
      const el = $('gesCount'); if (el) el.textContent = n ? `(${n})` : '';
    } catch (_e) {}
  }

  function renderGestoria(body) {
    body.innerHTML = `
      <div class="row">
        <div><div class="eyebrow">Obligaciones y trámites de cumplimiento</div></div>
        <div>${canGestoriaCreate ? '<button class="btn primary" id="gesAddBtn">+ Nueva obligación</button>' : ''}</div>
      </div>
      <div id="gesList" style="margin-top:14px"><div class="empty">Cargando…</div></div>`;
    if (canGestoriaCreate) $('gesAddBtn').onclick = () => openGestoria(null);
    loadGestoria();
  }

  async function loadGestoria() {
    const cont = $('gesList'); if (!cont) return;
    try {
      const res = await KoguApi.apiFetch('/protected/act/activos/' + encodeURIComponent(activoId) + '/gestoria');
      const rows = KoguApi.unwrapRows(res, 'rows') || [];
      const el = $('gesCount'); if (el) el.textContent = rows.length ? `(${rows.length})` : '';
      if (!rows.length) { cont.innerHTML = `<div class="empty">Sin obligaciones registradas para este activo.</div>`; return; }
      cont.innerHTML = `<div class="ot-timeline">${rows.map(g => {
        const s = gestoriaSemaforo(g);
        const tipo = g.tipo_nombre ? esc(g.tipo_nombre) : '<span class="muted">Sin tipo</span>';
        const venc = g.fecha_vencimiento ? 'Vence ' + esc(KoguUi.fmtDateOnly(g.fecha_vencimiento)) : 'Sin fecha';
        const meta = [];
        if (g.costo != null) meta.push('Costo ' + esc(KoguUi.fmtMoney(g.costo, g.moneda)));
        if (g.responsable_nombre) meta.push('Resp. ' + esc(g.responsable_nombre));
        if (g.proveedor_nombre) meta.push('Gestor ' + esc(g.proveedor_nombre));
        if (g.recurrente && g.frecuencia_meses) meta.push('Recurrente c/' + g.frecuencia_meses + 'm');
        if (g.referencia) meta.push('Folio ' + esc(g.referencia));
        const pendiente = g.estado === 'pendiente' || g.estado === 'en_tramite';
        let acc = '';
        if (canGestoriaCumplir && pendiente) acc += `<button class="btn ghost" data-ges-cumplir="${g.gestoria_id}">Cumplir</button>`;
        if (canGestoriaUpdate) acc += `<button class="btn ghost" data-ges-edit="${g.gestoria_id}">Editar</button>`;
        if (canGestoriaDelete) acc += `<button class="btn ghost" data-ges-del="${g.gestoria_id}">Eliminar</button>`;
        return `<div class="ot-ev">
          <div class="ot-evdot" style="border-color:${s.color}"></div>
          <div class="ot-evhead">
            <span style="display:flex;gap:6px;align-items:center;flex-wrap:wrap"><span class="chip">${tipo}</span><span class="chip" style="background:${s.color}1a;color:${s.color};border:1px solid ${s.color}55">${esc(g.estado.replace(/_/g, ' '))}</span></span>
            <span class="muted" style="font-size:12px">${venc} · ${s.label}</span>
          </div>
          <div class="ot-evtext" style="font-weight:600">${esc(g.titulo)}</div>
          ${g.descripcion ? `<div class="ot-evby">${esc(g.descripcion)}</div>` : ''}
          ${meta.length ? `<div class="ot-evby">${meta.join(' · ')}</div>` : ''}
          ${acc ? `<div class="actions-cell" style="margin-top:8px">${acc}</div>` : ''}
        </div>`;
      }).join('')}</div>`;
      const map = {};
      rows.forEach(g => { map[g.gestoria_id] = g; });
      if (canGestoriaCumplir) cont.querySelectorAll('[data-ges-cumplir]').forEach(b => b.onclick = () => openCumplirGes(map[b.dataset.gesCumplir]));
      if (canGestoriaUpdate)  cont.querySelectorAll('[data-ges-edit]').forEach(b => b.onclick = () => openGestoria(map[b.dataset.gesEdit]));
      if (canGestoriaDelete)  cont.querySelectorAll('[data-ges-del]').forEach(b => b.onclick = () => delGestoria(b.dataset.gesDel));
    } catch (_err) { cont.innerHTML = `<div class="empty">No fue posible cargar la gestoría.</div>`; }
  }

  async function delGestoria(id) {
    if (!window.confirm('¿Eliminar esta obligación de gestoría?')) return;
    try {
      await KoguApi.apiFetch('/protected/act/gestoria/' + encodeURIComponent(id), { method: 'DELETE' });
      KoguApi.toast('Obligación eliminada', 'success');
      await loadGestoria();
    } catch (_err) { /* apiFetch toast */ }
  }

  // ── Modal alta/edición de obligación ──────────────────────────
  function buildGestoriaModal() {
    if (!canGestoriaCreate && !canGestoriaUpdate) return;
    const overlay = document.createElement('div');
    overlay.id = 'gesModal';
    overlay.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:9999;align-items:flex-start;justify-content:center;padding:40px 20px;backdrop-filter:blur(2px)';
    overlay.innerHTML = `
      <div style="width:100%;max-width:560px;background:white;border-radius:12px;box-shadow:0 20px 50px rgba(0,0,0,.3);color:#0f172a;overflow:hidden">
        <div style="padding:16px 20px;border-bottom:1px solid var(--line,#e2e8f0);display:flex;justify-content:space-between;align-items:center">
          <h2 id="gesTitle" style="margin:0;font-size:18px">Nueva obligación</h2><button class="btn ghost" id="gesClose" style="padding:6px 10px">✕</button>
        </div>
        <div style="padding:20px"><div class="stack">
          <input type="hidden" id="ges_id"/>
          <div class="grid-2">
            <div><div class="label-text">Tipo</div><select class="select" id="ges_tipo"><option value="">Sin tipo</option></select></div>
            <div><div class="label-text">Vencimiento</div><input class="input" id="ges_venc" type="date"/></div>
          </div>
          <div><div class="label-text">Título</div><input class="input" id="ges_titulo" maxlength="160" placeholder="Ej. Tenencia 2026"/></div>
          <div><div class="label-text">Descripción <span class="muted" style="font-size:11px">(opcional)</span></div><input class="input" id="ges_desc"/></div>
          <div class="grid-2">
            <div><div class="label-text">Autoridad <span class="muted" style="font-size:11px">(opcional)</span></div><input class="input" id="ges_autoridad" placeholder="SAT, Finanzas, Tránsito…"/></div>
            <div><div class="label-text">Folio / referencia <span class="muted" style="font-size:11px">(opcional)</span></div><input class="input" id="ges_ref"/></div>
          </div>
          <div class="grid-3">
            <div><div class="label-text">Costo <span class="muted" style="font-size:11px">(opcional)</span></div><input class="input" id="ges_costo" type="number" min="0" step="0.01"/></div>
            <div><div class="label-text">Moneda</div><input class="input" id="ges_moneda" maxlength="3" placeholder="MXN"/></div>
            <div><div class="label-text">Frecuencia (meses)</div><input class="input" id="ges_frec" type="number" min="1" step="1" placeholder="—"/></div>
          </div>
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer"><input type="checkbox" id="ges_recurrente"/> <span>Recurrente (al cumplir, genera la siguiente)</span></label>
        </div></div>
        <div style="padding:14px 20px;border-top:1px solid var(--line,#e2e8f0);display:flex;justify-content:flex-end;gap:8px">
          <button class="btn ghost" id="gesCancel">Cancelar</button><button class="btn primary" id="gesSave">Guardar</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeGestoria(); });
    $('gesClose').onclick = closeGestoria; $('gesCancel').onclick = closeGestoria; $('gesSave').onclick = saveGestoria;
    // Al elegir tipo, prefijar recurrencia/frecuencia con los defaults del tipo.
    $('ges_tipo').onchange = () => {
      const t = (gestoriaTipos || []).find(x => x.tipo_id === $('ges_tipo').value);
      if (t) {
        $('ges_recurrente').checked = t.recurrente_default === true;
        if (t.frecuencia_meses_default) $('ges_frec').value = t.frecuencia_meses_default;
      }
    };
  }
  function closeGestoria() { const m = $('gesModal'); if (m) m.style.display = 'none'; }
  async function openGestoria(g) {
    await ensureGestoriaTipos();
    const sel = $('ges_tipo');
    sel.innerHTML = '<option value="">Sin tipo</option>' +
      (gestoriaTipos || []).map(t => `<option value="${t.tipo_id}">${esc(t.nombre)} (${esc(t.ambito)})</option>`).join('');
    $('ges_id').value = g ? g.gestoria_id : '';
    $('ges_tipo').value = g && g.tipo_id ? g.tipo_id : '';
    $('ges_venc').value = g && g.fecha_vencimiento ? String(g.fecha_vencimiento).slice(0, 10) : '';
    $('ges_titulo').value = g ? (g.titulo || '') : '';
    $('ges_desc').value = g ? (g.descripcion || '') : '';
    $('ges_autoridad').value = g ? (g.autoridad || '') : '';
    $('ges_ref').value = g ? (g.referencia || '') : '';
    $('ges_costo').value = g && g.costo != null ? g.costo : '';
    $('ges_moneda').value = g ? (g.moneda || '') : '';
    $('ges_frec').value = g && g.frecuencia_meses != null ? g.frecuencia_meses : '';
    $('ges_recurrente').checked = g ? g.recurrente === true : false;
    $('gesTitle').textContent = g ? 'Editar obligación' : 'Nueva obligación';
    $('gesModal').style.display = 'flex';
  }
  async function saveGestoria() {
    const id = $('ges_id').value;
    const titulo = $('ges_titulo').value.trim();
    if (!titulo) { KoguApi.toast('El título es obligatorio.', 'error'); return; }
    const recurrente = $('ges_recurrente').checked;
    const frec = $('ges_frec').value ? Number($('ges_frec').value) : null;
    if (recurrente && (!frec || frec <= 0)) { KoguApi.toast('Una obligación recurrente requiere frecuencia en meses.', 'error'); return; }
    const payload = {
      tipo_id: $('ges_tipo').value || null,
      titulo,
      descripcion: $('ges_desc').value.trim() || null,
      autoridad: $('ges_autoridad').value.trim() || null,
      referencia: $('ges_ref').value.trim() || null,
      fecha_vencimiento: $('ges_venc').value || null,
      recurrente,
      frecuencia_meses: recurrente ? frec : null,
      costo: $('ges_costo').value ? Number($('ges_costo').value) : null,
      moneda: $('ges_moneda').value.trim() || null,
    };
    await KoguUi.withLoading(this, async () => {
      try {
        if (id) {
          await KoguApi.apiFetch('/protected/act/gestoria/' + encodeURIComponent(id), { method: 'PUT', body: JSON.stringify(payload) });
          KoguApi.toast('Obligación actualizada', 'success');
        } else {
          await KoguApi.apiFetch('/protected/act/activos/' + encodeURIComponent(activoId) + '/gestoria', { method: 'POST', body: JSON.stringify(payload) });
          KoguApi.toast('Obligación registrada', 'success');
        }
        closeGestoria();
        await loadGestoria();
      } catch (_err) { /* apiFetch toast (422) */ }
    }, 'Guardando…');
  }

  // ── Modal cumplir ─────────────────────────────────────────────
  function buildCumplirGesModal() {
    if (!canGestoriaCumplir) return;
    const overlay = document.createElement('div');
    overlay.id = 'gesCumplirModal';
    overlay.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:9999;align-items:flex-start;justify-content:center;padding:40px 20px;backdrop-filter:blur(2px)';
    overlay.innerHTML = `
      <div style="width:100%;max-width:480px;background:white;border-radius:12px;box-shadow:0 20px 50px rgba(0,0,0,.3);color:#0f172a;overflow:hidden">
        <div style="padding:16px 20px;border-bottom:1px solid var(--line,#e2e8f0);display:flex;justify-content:space-between;align-items:center">
          <h2 style="margin:0;font-size:18px">Marcar cumplida</h2><button class="btn ghost" id="cumGesClose" style="padding:6px 10px">✕</button>
        </div>
        <div style="padding:20px"><div class="stack">
          <input type="hidden" id="cum_ges_id"/>
          <div class="muted" id="cum_ges_info" style="font-size:13px"></div>
          <div class="grid-2">
            <div><div class="label-text">Fecha de cumplimiento</div><input class="input" id="cum_fecha" type="date"/></div>
            <div><div class="label-text">Folio / referencia <span class="muted" style="font-size:11px">(opcional)</span></div><input class="input" id="cum_ref"/></div>
          </div>
          <div class="grid-2">
            <div><div class="label-text">Costo <span class="muted" style="font-size:11px">(opcional)</span></div><input class="input" id="cum_costo" type="number" min="0" step="0.01"/></div>
            <div><div class="label-text">Moneda</div><input class="input" id="cum_moneda" maxlength="3" placeholder="MXN"/></div>
          </div>
          <div class="muted" id="cum_ges_rec" style="font-size:12px"></div>
        </div></div>
        <div style="padding:14px 20px;border-top:1px solid var(--line,#e2e8f0);display:flex;justify-content:flex-end;gap:8px">
          <button class="btn ghost" id="cumGesCancel">Cancelar</button><button class="btn primary" id="cumGesSave">Marcar cumplida</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeCumplirGes(); });
    $('cumGesClose').onclick = closeCumplirGes; $('cumGesCancel').onclick = closeCumplirGes; $('cumGesSave').onclick = doCumplirGes;
  }
  function closeCumplirGes() { const m = $('gesCumplirModal'); if (m) m.style.display = 'none'; }
  function openCumplirGes(g) {
    if (!g) return;
    $('cum_ges_id').value = g.gestoria_id;
    $('cum_ges_info').textContent = (g.titulo || '') + (g.fecha_vencimiento ? ' · vence ' + KoguUi.fmtDateOnly(g.fecha_vencimiento) : '');
    $('cum_fecha').value = new Date().toISOString().slice(0, 10);
    $('cum_ref').value = ''; $('cum_costo').value = ''; $('cum_moneda').value = g.moneda || '';
    $('cum_ges_rec').textContent = (g.recurrente && g.frecuencia_meses)
      ? `Recurrente: al cumplir se generará la siguiente (+${g.frecuencia_meses} meses).` : '';
    $('gesCumplirModal').style.display = 'flex';
  }
  async function doCumplirGes() {
    const id = $('cum_ges_id').value;
    const payload = {
      fecha_cumplimiento: $('cum_fecha').value || null,
      referencia: $('cum_ref').value.trim() || null,
      costo: $('cum_costo').value ? Number($('cum_costo').value) : null,
      moneda: $('cum_moneda').value.trim() || null,
    };
    await KoguUi.withLoading(this, async () => {
      try {
        const res = await KoguApi.apiFetch('/protected/act/gestoria/' + encodeURIComponent(id) + '/cumplir', { method: 'POST', body: JSON.stringify(payload) });
        const out = KoguApi.unwrapData(res);
        KoguApi.toast(out && out.siguiente ? 'Cumplida · siguiente generada' : 'Obligación cumplida', 'success');
        closeCumplirGes();
        await loadGestoria();
      } catch (_err) { /* apiFetch toast (422) */ }
    }, 'Guardando…');
  }

  // ── Init ────────────────────────────────────────────────────────────────────
  buildUploadModal();
  buildEditModal();
  buildAsgModal();
  buildPlanModal();
  buildGestoriaModal();
  buildCumplirGesModal();

  KoguShell.subscribeEmpresaActivaChange(() => {
    // Un activo es de una empresa; al cambiar, vuelve a la bandeja para no
    // mostrar datos residuales de la empresa anterior.
    window.location.href = '/modules/act/activos.html';
  });

  if (await loadFicha()) renderShell();
});

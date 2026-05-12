// ============================================================
// lab-reporte-inspeccion-detalle.js
// Pantalla full del Reporte de Inspección (RI-AAAA-NNNNN).
//
// Workflow:
//   borrador ──Emitir──> emitido
//                          ├─ Aceptar ───────────> aceptado
//                          ├─ Aceptar c/obs ────> aceptado_con_observacion
//                          └─ Rechazar ─────────> rechazado
//                             └─ requiere gerente + motivo
//                             └─ NC automática generada
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/lab/lab-reporte-inspeccion-detalle.html';
  const PERM = 'screen.lab.inspeccion_compras';
  const BASE = '/protected/lab';

  const DECISION = {
    borrador:                 { label: 'Borrador',                  color: '#94a3b8' },
    emitido:                  { label: 'Emitido',                   color: '#3b82f6' },
    aceptado:                 { label: 'Aceptado',                  color: '#16a34a' },
    aceptado_con_observacion: { label: 'Aceptado c/observación',    color: '#f59e0b' },
    rechazado:                { label: 'Rechazado',                 color: '#dc2626' },
  };

  const EVALUACION = {
    cumple:     { label: 'Cumple',     color: '#16a34a', bg: '#dcfce7' },
    no_cumple:  { label: 'No cumple',  color: '#991b1b', bg: '#fee2e2' },
    observacion:{ label: 'Observación',color: '#92400e', bg: '#fef3c7' },
    no_aplica:  { label: 'N/A',        color: '#64748b', bg: '#f1f5f9' },
  };

  const params = new URLSearchParams(window.location.search);
  const reporteId = params.get('id');
  if (!reporteId) {
    window.location.href = '/modules/lab/lab-imp-compras.html';
    return;
  }

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Reporte de Inspección',
    description: 'Captura de parámetros y decisión final del reporte de inspección de compras.',
    requiredPermission: PERM,
  });
  if (!b) return;

  let reporte = null;
  let parametrosCatalogo = [];
  let usuariosGerente = [];   // usuarios con permiso de gerente (para el dropdown de rechazo)

  async function loadParametros() {
    try {
      const res = await KoguApi.apiFetch('/protected/lab/maestros/parametros?status=activo');
      parametrosCatalogo = KoguApi.unwrapData(res) || [];
    } catch (_) { parametrosCatalogo = []; }
  }

  async function loadUsuariosGerente() {
    try {
      const res = await KoguApi.apiFetch('/protected/core/usuarios');
      const todos = KoguApi.unwrapRows(res) || [];
      // Filtro suave en el cliente: mostrar todos por ahora.
      // El backend valida que el gerente_user_id seleccionado tenga el permiso
      // screen.lab.inspeccion_compras.gerente al hacer la transición.
      usuariosGerente = todos;
    } catch (_) { usuariosGerente = []; }
  }

  const $ = (id) => document.getElementById(id);
  const c = document.getElementById('pageContent');

  c.innerHTML = `
<div style="margin-bottom:12px">
  <button class="btn ghost" id="backBtn">← Volver a Inspección de compras</button>
</div>

<div class="card" id="reporteHeader">
  <div style="text-align:center;padding:20px;color:var(--muted)">Cargando reporte…</div>
</div>

<!-- Documento que envía el proveedor (PDF/JPG/PNG) -->
<div class="card" style="margin-top:16px">
  <div class="row">
    <div><div class="eyebrow">Documento</div><h2>Reporte del proveedor</h2></div>
  </div>
  <div class="muted" style="font-size:12px;margin-top:6px">
    Sube el reporte de calidad / factura / remisión que envió el proveedor (PDF, JPG, PNG, WebP).
    Sirve como soporte documental de los valores declarados.
  </div>
  <div id="archivoProveedorSection" style="margin-top:14px"></div>
</div>

<!-- CofA proveedor vinculado (opcional, módulo silencioso) -->
<div class="card" style="margin-top:16px;display:none" id="cofaCard">
  <div class="row">
    <div><div class="eyebrow">CofA proveedor (opcional)</div><h2>Certificado adicional vinculado</h2></div>
    <button class="btn ghost" id="importarCofaBtn" style="display:none">⬇ Importar parámetros del CofA</button>
  </div>
  <div id="cofaInfo" style="margin-top:14px"></div>
</div>

<!-- Parámetros declarados por el proveedor -->
<div class="card" style="margin-top:16px">
  <div class="row">
    <div><div class="eyebrow">Detalle</div><h2>Parámetros declarados por el proveedor</h2></div>
    <div style="display:flex;gap:8px">
      <button class="btn primary" id="addParamBtn">+ Nuevo parámetro</button>
    </div>
  </div>
  <div class="muted" style="font-size:12px;margin-top:6px">
    Registra los parámetros que <strong>el proveedor declara</strong> con su mercancía.
    Los análisis internos del laboratorio se capturan en el flujo de
    <strong>Lote → Muestras → Resultados oficiales</strong> después de aceptar este reporte.
  </div>
  <div id="paramsList" style="margin-top:16px;display:flex;flex-direction:column;gap:10px"></div>
</div>

<!-- NC automática vinculada -->
<div class="card" style="margin-top:16px;display:none" id="ncCard"></div>
  `;

  $('backBtn').addEventListener('click', () => {
    window.location.href = '/modules/lab/lab-imp-compras.html';
  });

  async function load() {
    try {
      const res = await KoguApi.apiFetch(`${BASE}/reportes-inspeccion/${reporteId}`);
      reporte = KoguApi.unwrapData(res);
      renderHeader();
      renderArchivoProveedor();
      renderCofa();
      renderParametros();
      renderNc();
    } catch (err) {
      KoguApi.toast(err.message, 'error');
      $('reporteHeader').innerHTML =
        `<div style="text-align:center;padding:20px;color:var(--danger)">No se pudo cargar el reporte.</div>`;
    }
  }

  function renderHeader() {
    if (!reporte) return;
    const dec = DECISION[reporte.decision] || { label: reporte.decision, color: '#64748b' };
    const isBorrador = reporte.decision === 'borrador';
    const isEmitido  = reporte.decision === 'emitido';
    const isTerminal = ['aceptado','aceptado_con_observacion','rechazado'].includes(reporte.decision);

    $('reporteHeader').innerHTML = `
      <div class="row">
        <div>
          <div class="eyebrow">Reporte de inspección</div>
          <h2 style="margin-top:4px;font-family:monospace">${escapeHtml(reporte.folio_reporte)}</h2>
          <div class="muted" style="font-size:13px;margin-top:4px">
            Proveedor: <strong>${escapeHtml(reporte.proveedor_nombre || '—')}</strong> ·
            Producto: <strong>${escapeHtml(reporte.cve_prod || '—')}</strong>
            <span class="muted" style="font-size:12px">${escapeHtml(reporte.desc_prod || '')}</span>
          </div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <span class="chip" style="background:${dec.color}22;color:${dec.color};font-size:14px;padding:6px 12px">${dec.label}</span>
          ${isBorrador ? `
            <button class="btn primary" id="emitirBtn" style="background:#3b82f6">Emitir →</button>
            <button class="btn ghost danger" id="deleteBtn" title="Eliminar borrador">🗑️</button>
          ` : ''}
          ${isEmitido ? `
            <button class="btn primary" id="aceptarBtn" style="background:#16a34a">✓ Aceptar</button>
            <button class="btn ghost"   id="aceptarObsBtn" style="color:#92400e">⚠ Aceptar c/observación</button>
            <button class="btn primary" id="rechazarBtn" style="background:#dc2626">✗ Rechazar…</button>
          ` : ''}
        </div>
      </div>

      <div class="grid-2" style="margin-top:16px;gap:10px;font-size:13px">
        <div>
          <div class="label-text">Lote del proveedor</div>
          <div style="font-family:monospace">${escapeHtml(reporte.lote_numero || reporte.imp_numero_lote || '—')}</div>
        </div>
        <div>
          <div class="label-text">Folio factura / remisión</div>
          <div>${escapeHtml(reporte.remision_id || '—')}</div>
        </div>
        <div>
          <div class="label-text">Inspector</div>
          <div>${escapeHtml(reporte.inspector_nombre || '—')}
            ${reporte.inspector_email ? `<span class="muted" style="font-size:11px"> · ${escapeHtml(reporte.inspector_email)}</span>` : ''}
          </div>
        </div>
        <div>
          <div class="label-text">Supervisor</div>
          <div>${escapeHtml(reporte.supervisor_nombre || '—')}</div>
        </div>
        <div>
          <div class="label-text">Fecha inspección</div>
          <div>${reporte.fecha_inspeccion ? new Date(reporte.fecha_inspeccion).toLocaleString() : '—'}</div>
        </div>
        <div>
          <div class="label-text">Lote QA</div>
          <div>${reporte.lote_compra_id
            ? `<a href="/modules/lab/lab-lote-detalle.html?id=${reporte.lote_compra_id}" style="font-family:monospace">${escapeHtml(reporte.lote_numero || reporte.lote_compra_id)}</a>`
            : '<span class="muted">Se creará al emitir</span>'}</div>
        </div>
      </div>

      ${isTerminal && reporte.motivo_decision ? `
        <div style="margin-top:14px;padding:12px;background:${reporte.decision === 'rechazado' ? '#fee2e2' : '#fef3c7'};color:${reporte.decision === 'rechazado' ? '#991b1b' : '#92400e'};border-radius:6px;font-size:13px">
          <strong>${reporte.decision === 'rechazado' ? 'Motivo de rechazo' : 'Observación'}:</strong>
          ${escapeHtml(reporte.motivo_decision)}
          ${reporte.gerente_nombre ? `<div class="muted" style="font-size:11px;margin-top:6px">Autorizado por: ${escapeHtml(reporte.gerente_nombre)}</div>` : ''}
        </div>
      ` : ''}
      ${reporte.decision === 'aceptado' || reporte.decision === 'aceptado_con_observacion' ? `
        <div style="margin-top:14px;padding:12px;background:#dcfce7;color:#166534;border-radius:6px;font-size:13px">
          ✓ Lote <strong>${escapeHtml(reporte.lote_numero || '—')}</strong> disponible para análisis de laboratorio.
          ${reporte.lote_compra_id ? `<a href="/modules/lab/lab-lote-detalle.html?id=${reporte.lote_compra_id}" style="margin-left:8px;color:#166534;text-decoration:underline">Ir al lote →</a>` : ''}
        </div>
      ` : ''}
    `;

    if (isBorrador) {
      $('emitirBtn').addEventListener('click', emitirReporte);
      $('deleteBtn').addEventListener('click', eliminarReporte);
    } else if (isEmitido) {
      $('aceptarBtn').addEventListener('click', () => decidir('aceptar'));
      $('aceptarObsBtn').addEventListener('click', () => decidir('aceptar-con-observacion'));
      $('rechazarBtn').addEventListener('click', () => abrirModalRechazo());
    }
  }

  // Renderiza la sección CofA. Solo aparece visible si hay CofA vinculado.
  // En caso contrario el card queda oculto (módulo opcional silencioso).
  function renderCofa() {
    const card = $('cofaCard');
    const info = $('cofaInfo');
    const importBtn = $('importarCofaBtn');
    const isTerminal = ['aceptado','aceptado_con_observacion','rechazado'].includes(reporte.decision);

    if (reporte.certificado_proveedor_id) {
      card.style.display = '';
      info.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:12px;background:#eef2ff;border:1px solid #c7d2fe;border-radius:6px">
          <div>
            <div style="font-size:13px"><strong>CofA vinculado</strong>:
              <a href="/modules/lab/lab-cert-proveedor-detalle.html?id=${reporte.certificado_proveedor_id}"
                 style="font-family:monospace">${escapeHtml(reporte.cert_folio_interno || '—')}</a>
              <span class="muted" style="font-size:11px;margin-left:6px">${escapeHtml(reporte.cert_folio_proveedor || '')}</span>
            </div>
            <div class="muted" style="font-size:11px;margin-top:4px">
              Estado lectura: <span class="chip" style="background:#dcfce7;color:#166534;font-size:10px">${escapeHtml(reporte.cert_estado_lectura || '—')}</span>
            </div>
          </div>
        </div>
      `;
      importBtn.style.display = isTerminal ? 'none' : '';
      importBtn.onclick = importarParametrosCofa;
    } else {
      // Sin CofA: card oculto (la sección "Reporte del proveedor" cubre la captura básica)
      card.style.display = 'none';
      info.innerHTML = '';
      importBtn.style.display = 'none';
    }
  }

  // ── Documento del proveedor (PDF/JPG/PNG) ──────
  function renderArchivoProveedor() {
    const section = $('archivoProveedorSection');
    const isTerminal = ['aceptado','aceptado_con_observacion','rechazado'].includes(reporte.decision);
    if (reporte.pdf_path) {
      const ext = (reporte.pdf_path.match(/\.[^.]+$/) || [''])[0];
      section.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:12px;background:#f8fafc;border:1px solid var(--line);border-radius:6px">
          <div>
            <div style="font-size:13px"><strong>📎 Documento del proveedor</strong> (${escapeHtml(ext.toUpperCase().slice(1))})</div>
            ${reporte.pdf_hash ? `<div class="muted" style="font-size:11px;margin-top:4px;font-family:monospace">SHA-256: ${escapeHtml(reporte.pdf_hash.slice(0, 16))}…</div>` : ''}
          </div>
          <div style="display:flex;gap:6px">
            <button class="btn ghost" id="downloadArchivoProvBtn">↓ Descargar</button>
            ${!isTerminal ? `
              <button class="btn ghost" id="replaceArchivoProvBtn">Reemplazar…</button>
              <button class="btn ghost danger" id="deleteArchivoProvBtn">×</button>
            ` : ''}
          </div>
        </div>
        ${!isTerminal ? `<input type="file" id="archivoProvInput" accept=".pdf,.jpg,.jpeg,.png,.webp" style="display:none"/>` : ''}
      `;
      $('downloadArchivoProvBtn').addEventListener('click', descargarArchivoProveedor);
      if (!isTerminal) {
        $('replaceArchivoProvBtn').addEventListener('click', () => $('archivoProvInput').click());
        $('archivoProvInput').addEventListener('change', subirArchivoProveedor);
        $('deleteArchivoProvBtn').addEventListener('click', eliminarArchivoProveedor);
      }
    } else if (isTerminal) {
      section.innerHTML = `<div class="muted" style="text-align:center;padding:14px;font-size:13px">Sin documento del proveedor adjunto.</div>`;
    } else {
      section.innerHTML = `
        <div>
          <input type="file" id="archivoProvInput" accept=".pdf,.jpg,.jpeg,.png,.webp" style="font-size:13px"/>
          <div class="muted" style="font-size:11px;margin-top:6px">Formatos: PDF, JPG, PNG, WebP. Máximo 20 MB.</div>
        </div>
      `;
      $('archivoProvInput').addEventListener('change', subirArchivoProveedor);
    }
  }

  async function subirArchivoProveedor(ev) {
    const f = ev.target.files?.[0];
    if (!f) return;
    const fd = new FormData();
    fd.append('archivo', f);
    try {
      await KoguApi.apiFetch(`${BASE}/reportes-inspeccion/${reporteId}/upload-archivo-proveedor`,
        { method: 'POST', body: fd });
      KoguApi.toast('Archivo del proveedor subido', 'success');
      await load();
    } catch (err) { KoguApi.toast(err.message, 'error'); }
  }

  async function descargarArchivoProveedor() {
    try {
      const resp = await KoguApi.authFetchRaw(`${BASE}/reportes-inspeccion/${reporteId}/archivo-proveedor`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const ext = (reporte.pdf_path?.match(/\.[^.]+$/) || ['.pdf'])[0];
      let filename = `${reporte.folio_reporte || 'reporte-proveedor'}${ext}`;
      const cd = resp.headers.get('Content-Disposition') || '';
      const m = cd.match(/filename\*?=(?:UTF-8''|")?([^";]+)/);
      if (m) filename = decodeURIComponent(m[1]);
      const blob = await resp.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(a.href);
    } catch (err) { KoguApi.toast(err.message, 'error'); }
  }

  async function eliminarArchivoProveedor() {
    if (!confirm('¿Eliminar el archivo del proveedor adjunto?')) return;
    try {
      await KoguApi.apiFetch(`${BASE}/reportes-inspeccion/${reporteId}/archivo-proveedor`,
        { method: 'DELETE' });
      KoguApi.toast('Archivo eliminado', 'success');
      await load();
    } catch (err) { KoguApi.toast(err.message, 'error'); }
  }

  function renderParametros() {
    const list = $('paramsList');
    const isTerminal = ['aceptado','aceptado_con_observacion','rechazado'].includes(reporte.decision);
    if (!reporte.parametros?.length) {
      list.innerHTML = `<div class="muted" style="text-align:center;padding:24px;font-size:13px">
        Sin parámetros capturados. Click en <strong>+ Nuevo parámetro</strong> para empezar
        ${reporte.certificado_proveedor_id ? ' o usa <strong>Importar del CofA</strong> para precargar desde el certificado del proveedor.' : '.'}
      </div>`;
    } else {
      list.innerHTML = reporte.parametros.map(p => paramCard(p, isTerminal)).join('');
      list.querySelectorAll('button[data-edit]').forEach(btn =>
        btn.addEventListener('click', () => editarParam(btn.dataset.edit)));
      list.querySelectorAll('button[data-del]').forEach(btn =>
        btn.addEventListener('click', () => eliminarParam(btn.dataset.del)));
    }
    $('addParamBtn').disabled = isTerminal;
    $('addParamBtn').style.opacity = isTerminal ? '0.4' : '1';
  }

  function paramCard(p, readonly) {
    const ev = EVALUACION[p.evaluacion] || EVALUACION.no_aplica;
    const valorProv = p.valor_proveedor != null
      ? `<strong>${parseFloat(p.valor_proveedor).toLocaleString()}</strong> ${escapeHtml(p.unidad_simbolo || '')}`
      : (p.valor_proveedor_texto || '—');
    const spec = (p.spec_lim_min != null && p.spec_lim_max != null)
      ? `${p.spec_lim_min} – ${p.spec_lim_max}`
      : (p.spec_lim_min != null ? `≥ ${p.spec_lim_min}`
        : (p.spec_lim_max != null ? `≤ ${p.spec_lim_max}`
          : (p.spec_objetivo != null ? `obj. ${p.spec_objetivo}` : '—')));
    // Histórico: si existe valor_interno de antes del refactor, lo mostramos
    // pequeño como información (no es editable y no se captura más en nuevos).
    const valorIntHist = p.valor_interno != null
      ? `<div class="muted" style="font-size:11px;margin-top:2px">valor interno histórico: ${parseFloat(p.valor_interno).toLocaleString()} ${escapeHtml(p.unidad_simbolo || '')}</div>`
      : '';
    return `
      <div style="border:1px solid var(--line);border-radius:8px;padding:14px;background:#fafbfc">
        <div class="row">
          <div>
            <strong>${escapeHtml(p.parametro_clave || p.parametro_clave_catalogo || '—')}</strong>
            <span class="muted" style="font-size:12px"> · ${escapeHtml(p.parametro_nombre || p.parametro_nombre_catalogo || '')}</span>
            ${p.metodo_clave ? `<div class="muted" style="font-size:11px;margin-top:2px">método: ${escapeHtml(p.metodo_clave)}</div>` : ''}
          </div>
          <div style="display:flex;gap:6px;align-items:center">
            <span class="chip" style="background:${ev.bg};color:${ev.color}">${ev.label}</span>
            ${!readonly ? `<button class="btn ghost" data-edit="${p.ri_parametro_id}">Editar</button>
                           <button class="btn ghost danger" data-del="${p.ri_parametro_id}">×</button>` : ''}
          </div>
        </div>
        <div class="grid-2" style="margin-top:8px;gap:8px;font-size:13px">
          <div><strong>Valor declarado:</strong> ${valorProv}</div>
          <div><strong>Spec proveedor:</strong> ${escapeHtml(spec)} ${escapeHtml(p.unidad_simbolo || '')}</div>
          ${p.observaciones ? `<div style="grid-column:1/-1" class="muted" style="font-size:12px">obs: ${escapeHtml(p.observaciones)}</div>` : ''}
          ${valorIntHist ? `<div style="grid-column:1/-1">${valorIntHist}</div>` : ''}
        </div>
      </div>`;
  }

  function renderNc() {
    const card = $('ncCard');
    if (reporte.nc_id && reporte.folio_nc) {
      card.style.display = 'block';
      const ncStatusColor =
        reporte.nc_status === 'cerrada' ? '#16a34a' :
        reporte.nc_status === 'anulada' ? '#94a3b8' :
        '#dc2626';
      card.innerHTML = `
        <div class="row">
          <div><div class="eyebrow">No Conformidad generada</div><h2>NC vinculada</h2></div>
        </div>
        <div style="margin-top:14px;padding:14px;background:#fee2e2;border:1px solid #fca5a5;border-radius:6px">
          <div style="font-size:13px">
            <strong>Folio:</strong>
            <a href="/modules/lab/lab-nc-detalle.html?id=${reporte.nc_id}" style="font-family:monospace">${escapeHtml(reporte.folio_nc)}</a>
            <span class="chip" style="background:${ncStatusColor}22;color:${ncStatusColor};margin-left:6px;font-size:11px">${escapeHtml(reporte.nc_status || '—')}</span>
          </div>
          ${reporte.nc_fecha_apertura ? `<div class="muted" style="font-size:11px;margin-top:4px">Abierta el ${escapeHtml(String(reporte.nc_fecha_apertura).slice(0,10))}</div>` : ''}
          <div class="muted" style="font-size:11px;margin-top:6px">
            Esta NC fue generada automáticamente al rechazar el reporte.
            La gestión completa (CAPA, cierre) se hace desde el módulo de No Conformidades.
          </div>
        </div>
      `;
    } else {
      card.style.display = 'none';
    }
  }

  // ── Acciones cabecera ───────────────────────────
  async function emitirReporte() {
    // El reporte puede emitirse SIN parámetros (decisión rápida visual).
    // Los análisis internos del laboratorio se harán después en el flujo
    // del lote (muestras → resultados oficiales).
    if (!confirm('¿Emitir este reporte?\n\nAl emitir:\n- Se crea el lote físico si no existe.\n- La compra queda marcada como procesada.\n- El reporte ya no puede eliminarse.\n\nDespués podrás:\n- Aceptar / aceptar con observación / rechazar de inmediato (opción rápida)\n- O ir al lote para realizar muestras y análisis de laboratorio.')) return;
    try {
      await KoguApi.apiFetch(`${BASE}/reportes-inspeccion/${reporteId}/emitir`,
        { method: 'POST', body: JSON.stringify({}) });
      KoguApi.toast('Reporte emitido', 'success');
      await load();
    } catch (err) { KoguApi.toast(err.message, 'error'); }
  }

  async function decidir(accion) {
    const motivo = prompt(`Comentario / motivo de "${accion.replace(/-/g,' ')}" (opcional):`);
    if (motivo === null) return;  // user canceled
    try {
      await KoguApi.apiFetch(`${BASE}/reportes-inspeccion/${reporteId}/${accion}`, {
        method: 'POST',
        body: JSON.stringify({ motivo_decision: motivo || null }),
      });
      KoguApi.toast('Decisión aplicada', 'success');
      await load();
    } catch (err) { KoguApi.toast(err.message, 'error'); }
  }

  function abrirModalRechazo() {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;overflow:auto';
    overlay.innerHTML = `
      <div style="background:white;border-radius:8px;max-width:540px;width:100%;padding:24px;box-shadow:0 25px 50px rgba(0,0,0,.3)">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px">
          <div>
            <div class="eyebrow">Lab QA</div>
            <h2 style="margin:6px 0 0 0;color:#991b1b">⚠ Rechazar reporte</h2>
            <div class="muted" style="font-size:12px;margin-top:6px">
              Al rechazar se generará automáticamente una <strong>No Conformidad</strong>
              vinculada al lote, con origen "Inspección de compra".
            </div>
          </div>
          <button class="btn ghost" id="closeBtn">×</button>
        </div>

        <div class="stack" style="gap:12px;margin-top:14px">
          <div>
            <div class="label-text">Gerente que autoriza el rechazo *</div>
            <select class="select" id="m_gerente">
              <option value="">— Selecciona usuario —</option>
              ${usuariosGerente.map(u => `<option value="${u.user_id}">${escapeHtml(u.nombre || u.email)}</option>`).join('')}
            </select>
            <div class="muted" style="font-size:11px;margin-top:4px">
              Backend valida que el usuario tenga el permiso
              <code>screen.lab.inspeccion_compras.gerente</code>.
            </div>
          </div>
          <div>
            <div class="label-text">Motivo del rechazo *</div>
            <textarea class="input" id="m_motivo" rows="4" maxlength="2000"
              placeholder="Describe brevemente la razón del rechazo. Esta descripción quedará en la NC automática."></textarea>
          </div>
        </div>

        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:20px">
          <button class="btn ghost"        id="cancelBtn">Cancelar</button>
          <button class="btn primary danger" id="confirmRechazoBtn" style="background:#dc2626">Rechazar y generar NC</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const oQ = s => overlay.querySelector(s);
    const close = () => overlay.remove();
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    oQ('#closeBtn').addEventListener('click', close);
    oQ('#cancelBtn').addEventListener('click', close);

    oQ('#confirmRechazoBtn').addEventListener('click', async () => {
      const gerenteId = oQ('#m_gerente').value;
      const motivo = oQ('#m_motivo').value.trim();
      if (!gerenteId) return KoguApi.toast('Selecciona un gerente.', 'error');
      if (!motivo)    return KoguApi.toast('Motivo requerido.', 'error');
      try {
        oQ('#confirmRechazoBtn').disabled = true;
        await KoguApi.apiFetch(`${BASE}/reportes-inspeccion/${reporteId}/rechazar`, {
          method: 'POST',
          body: JSON.stringify({ gerente_user_id: gerenteId, motivo_decision: motivo }),
        });
        KoguApi.toast('Reporte rechazado · NC generada', 'success');
        close();
        await load();
      } catch (err) {
        oQ('#confirmRechazoBtn').disabled = false;
        KoguApi.toast(err.message, 'error');
      }
    });
  }

  async function eliminarReporte() {
    if (!confirm('¿Eliminar este reporte borrador? La acción no se puede deshacer.')) return;
    try {
      await KoguApi.apiFetch(`${BASE}/reportes-inspeccion/${reporteId}`, { method: 'DELETE' });
      KoguApi.toast('Reporte eliminado', 'success');
      window.location.href = '/modules/lab/lab-imp-compras.html';
    } catch (err) { KoguApi.toast(err.message, 'error'); }
  }

  // ── CofA: importar parámetros / vincular ────────
  async function importarParametrosCofa() {
    if (!confirm('¿Importar los parámetros del CofA del proveedor?\n\nCada parámetro del CofA se agregará al reporte con su spec y valor_proveedor. Tú solo capturas el valor interno y la evaluación.')) return;
    try {
      const res = await KoguApi.apiFetch(`${BASE}/reportes-inspeccion/${reporteId}/importar-cofa`,
        { method: 'POST', body: JSON.stringify({}) });
      const data = KoguApi.unwrapData(res);
      KoguApi.toast(`Importados ${data.importados} parámetros del CofA`, 'success');
      await load();
    } catch (err) { KoguApi.toast(err.message, 'error'); }
  }

  function abrirModalVincularCofa() {
    // Simple: prompt con ID o folio. UX completa con picker para iteración futura.
    const folio = prompt('Folio interno del CofA a vincular (formato CP-AAAA-NNNNN):');
    if (!folio || !folio.trim()) return;
    // Buscar el CofA por folio interno entre los del proveedor
    KoguApi.apiFetch(`${BASE}/cert-proveedor?proveedor_id=${reporte.proveedor_id}&q=${encodeURIComponent(folio.trim())}`)
      .then(async (res) => {
        const cofas = KoguApi.unwrapData(res) || [];
        const match = cofas.find(c => c.folio_interno === folio.trim().toUpperCase() || c.folio_interno === folio.trim());
        if (!match) return KoguApi.toast(`No se encontró CofA con folio "${folio}".`, 'error');
        await KoguApi.apiFetch(`${BASE}/reportes-inspeccion/${reporteId}`, {
          method: 'PUT',
          body: JSON.stringify({ certificado_proveedor_id: match.certificado_proveedor_id }),
        });
        KoguApi.toast('CofA vinculado', 'success');
        await load();
      })
      .catch(err => KoguApi.toast(err.message, 'error'));
  }

  // ── Parámetros: modal nuevo/editar ──────────────
  function abrirModalParametro(existing = null) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;overflow:auto';
    overlay.innerHTML = `
      <div style="background:white;border-radius:8px;max-width:680px;width:100%;max-height:95vh;overflow:auto;padding:24px;box-shadow:0 25px 50px rgba(0,0,0,.3)">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px">
          <div>
            <div class="eyebrow">Reporte de inspección · Parámetro</div>
            <h2 style="margin:6px 0 0 0">${existing ? 'Editar parámetro' : 'Nuevo parámetro'}</h2>
          </div>
          <button class="btn ghost" id="closeBtn">×</button>
        </div>

        <div class="grid-2" style="gap:10px">
          <div style="grid-column:1/-1">
            <div class="label-text">Parámetro del catálogo *</div>
            <select class="select" id="m_parametroId" ${existing ? 'disabled' : ''}>
              <option value="">— Selecciona —</option>
              ${parametrosCatalogo.map(p => `<option value="${p.parametro_id}" data-clave="${escapeHtml(p.clave)}" data-nombre="${escapeHtml(p.nombre)}" ${existing?.parametro_id === p.parametro_id ? 'selected' : ''}>${escapeHtml(p.clave)} — ${escapeHtml(p.nombre)}</option>`).join('')}
            </select>
          </div>

          <div>
            <div class="label-text">Método</div>
            <input class="input" id="m_metodo" maxlength="30" value="${escapeHtml(existing?.metodo_clave || '')}"/>
          </div>
          <div>
            <div class="label-text">Unidad</div>
            <input class="input" id="m_unidad" maxlength="20" value="${escapeHtml(existing?.unidad_simbolo || '')}"/>
          </div>

          <div>
            <div class="label-text">Valor declarado por el proveedor</div>
            <input class="input" type="number" step="any" id="m_valor_prov" value="${existing?.valor_proveedor ?? ''}"/>
            <div class="muted" style="font-size:11px;margin-top:2px">Lo que indica el proveedor en su reporte/factura.</div>
          </div>

          <div>
            <div class="label-text">Spec mín (proveedor)</div>
            <input class="input" type="number" step="any" id="m_spec_min" value="${existing?.spec_lim_min ?? ''}"/>
          </div>
          <div>
            <div class="label-text">Spec máx (proveedor)</div>
            <input class="input" type="number" step="any" id="m_spec_max" value="${existing?.spec_lim_max ?? ''}"/>
          </div>
          <div>
            <div class="label-text">Spec objetivo</div>
            <input class="input" type="number" step="any" id="m_spec_obj" value="${existing?.spec_objetivo ?? ''}"/>
          </div>

          <div>
            <div class="label-text">¿Cumple según el proveedor?</div>
            <select class="select" id="m_evaluacion">
              <option value="no_aplica"  ${(existing?.evaluacion ?? 'no_aplica') === 'no_aplica'  ? 'selected' : ''}>Sin información</option>
              <option value="cumple"     ${existing?.evaluacion === 'cumple'     ? 'selected' : ''}>Cumple</option>
              <option value="no_cumple"  ${existing?.evaluacion === 'no_cumple'  ? 'selected' : ''}>No cumple</option>
              <option value="observacion" ${existing?.evaluacion === 'observacion' ? 'selected' : ''}>Observación</option>
            </select>
            <div class="muted" style="font-size:11px;margin-top:2px">El análisis interno se hará en el flujo del lote después de aceptar.</div>
          </div>

          <div style="grid-column:1/-1">
            <div class="label-text">Observaciones</div>
            <textarea class="input" id="m_obs" rows="2" maxlength="500">${escapeHtml(existing?.observaciones || '')}</textarea>
          </div>
        </div>

        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:20px">
          <button class="btn ghost"   id="cancelBtn">Cancelar</button>
          <button class="btn primary" id="saveBtn">${existing ? 'Guardar' : 'Agregar'}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const oQ = s => overlay.querySelector(s);
    const close = () => overlay.remove();
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    oQ('#closeBtn').addEventListener('click', close);
    oQ('#cancelBtn').addEventListener('click', close);

    oQ('#saveBtn').addEventListener('click', async () => {
      const paramSel = oQ('#m_parametroId');
      const parametroId = paramSel.value;
      if (!parametroId) return KoguApi.toast('Selecciona un parámetro del catálogo.', 'error');
      const sel = paramSel.options[paramSel.selectedIndex];
      const body = {
        parametro_id:        parametroId,
        parametro_clave:     sel.dataset.clave || null,
        parametro_nombre:    sel.dataset.nombre || null,
        metodo_clave:        oQ('#m_metodo').value.trim() || null,
        unidad_simbolo:      oQ('#m_unidad').value.trim() || null,
        valor_proveedor:     parseFloatOrNull(oQ('#m_valor_prov').value),
        spec_lim_min:        parseFloatOrNull(oQ('#m_spec_min').value),
        spec_lim_max:        parseFloatOrNull(oQ('#m_spec_max').value),
        spec_objetivo:       parseFloatOrNull(oQ('#m_spec_obj').value),
        spec_origen:         'proveedor',          // todos los parámetros ahora son del proveedor
        evaluacion:          oQ('#m_evaluacion').value,
        observaciones:       oQ('#m_obs').value.trim() || null,
        orden_visual:        existing?.orden_visual ?? (reporte.parametros?.length || 0),
      };
      try {
        oQ('#saveBtn').disabled = true;
        if (existing) {
          await KoguApi.apiFetch(
            `${BASE}/reportes-inspeccion/${reporteId}/parametros/${existing.ri_parametro_id}`,
            { method: 'PUT', body: JSON.stringify(body) },
          );
          KoguApi.toast('Parámetro actualizado', 'success');
        } else {
          await KoguApi.apiFetch(
            `${BASE}/reportes-inspeccion/${reporteId}/parametros`,
            { method: 'POST', body: JSON.stringify(body) },
          );
          KoguApi.toast('Parámetro agregado', 'success');
        }
        close();
        await load();
      } catch (err) {
        oQ('#saveBtn').disabled = false;
        KoguApi.toast(err.message, 'error');
      }
    });
  }

  function editarParam(pid) {
    const p = (reporte.parametros || []).find(x => x.ri_parametro_id === pid);
    if (p) abrirModalParametro(p);
  }

  async function eliminarParam(pid) {
    if (!confirm('¿Eliminar este parámetro?')) return;
    try {
      await KoguApi.apiFetch(
        `${BASE}/reportes-inspeccion/${reporteId}/parametros/${pid}`,
        { method: 'DELETE' },
      );
      KoguApi.toast('Parámetro eliminado', 'success');
      await load();
    } catch (err) { KoguApi.toast(err.message, 'error'); }
  }

  $('addParamBtn').addEventListener('click', () => abrirModalParametro());

  KoguShell.subscribeEmpresaActivaChange(() => {
    window.location.href = '/modules/lab/lab-imp-compras.html';
  });

  // ── Helpers ─────────────────────────────────────
  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, m => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    })[m]);
  }
  function parseFloatOrNull(v) {
    if (v == null || v === '') return null;
    const n = parseFloat(v);
    return isFinite(n) ? n : null;
  }

  // ── Arranque ────────────────────────────────────
  await Promise.all([loadParametros(), loadUsuariosGerente()]);
  await load();
});

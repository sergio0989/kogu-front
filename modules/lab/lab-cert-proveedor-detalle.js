// ============================================================
// lab-cert-proveedor-detalle.js
// Pantalla full del Certificado de Proveedor (CofA).
// Header editable + upload PDF/JPG/PNG + parámetros expandibles.
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/lab/lab-cert-proveedor-detalle.html';
  const PERM = 'screen.lab.inspeccion_compras';
  const BASE = '/protected/lab/cert-proveedor';

  const ESTADOS = {
    pendiente:   { label: 'Pendiente',   color: '#94a3b8' },
    capturado:   { label: 'Capturado',   color: '#3b82f6' },
    discrepante: { label: 'Discrepante', color: '#dc2626' },
    validado:    { label: 'Validado',    color: '#16a34a' },
  };

  const params = new URLSearchParams(window.location.search);
  const certId = params.get('id');
  if (!certId) {
    window.location.href = '/modules/lab/lab-cert-proveedor.html';
    return;
  }

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Detalle de CofA',
    description: 'Captura de parámetros y validación del certificado del proveedor.',
    requiredPermission: PERM,
  });
  if (!b) return;

  let cp = null;
  let parametrosCatalogo = [];

  async function loadParametrosCatalogo() {
    try {
      const res = await KoguApi.apiFetch('/protected/lab/maestros/parametros?status=activo');
      parametrosCatalogo = KoguApi.unwrapData(res) || [];
    } catch (_) { parametrosCatalogo = []; }
  }

  const $ = (id) => document.getElementById(id);
  const c = document.getElementById('pageContent');

  c.innerHTML = `
<div style="margin-bottom:12px">
  <button class="btn ghost" id="backBtn">← Volver a CofAs</button>
</div>

<div class="card" id="cofaHeader">
  <div style="text-align:center;padding:20px;color:var(--muted)">Cargando CofA…</div>
</div>

<div class="card" style="margin-top:16px">
  <div class="row">
    <div><div class="eyebrow">Documento</div><h2>Archivo del CofA</h2></div>
  </div>
  <div id="archivoSection" style="margin-top:14px"></div>
</div>

<div class="card" style="margin-top:16px">
  <div class="row">
    <div><div class="eyebrow">Detalle</div><h2>Parámetros reportados</h2></div>
    <button class="btn primary" id="addParamBtn">+ Nuevo parámetro</button>
  </div>
  <div id="paramsList" style="margin-top:16px;display:flex;flex-direction:column;gap:10px"></div>
</div>
  `;

  $('backBtn').addEventListener('click', () => {
    window.location.href = '/modules/lab/lab-cert-proveedor.html';
  });

  async function load() {
    try {
      const res = await KoguApi.apiFetch(`${BASE}/${certId}`);
      cp = KoguApi.unwrapData(res);
      renderHeader();
      renderArchivo();
      renderParametros();
    } catch (err) {
      KoguApi.toast(err.message, 'error');
      $('cofaHeader').innerHTML = `<div style="text-align:center;padding:20px;color:var(--danger)">No se pudo cargar el CofA.</div>`;
    }
  }

  function renderHeader() {
    if (!cp) return;
    const est = ESTADOS[cp.estado_lectura] || { label: cp.estado_lectura, color: '#64748b' };
    const validado = cp.estado_lectura === 'validado';

    $('cofaHeader').innerHTML = `
      <div class="row">
        <div>
          <div class="eyebrow">CofA · ${escapeHtml(cp.folio_interno || '')}</div>
          <h2>${escapeHtml(cp.proveedor_nombre || '—')}</h2>
          <div class="muted" style="font-size:12px;margin-top:4px">
            <strong>Producto:</strong> ${escapeHtml(cp.cve_prod || '—')} · ${escapeHtml(cp.desc_prod || '')}
          </div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <span class="chip" style="background:${est.color}22;color:${est.color};font-size:14px;padding:6px 12px">${est.label}</span>
          ${validado
            ? `<button class="btn ghost"  id="revertirBtn">↺ Revertir validación</button>`
            : `<button class="btn primary" id="validarBtn" style="background:#16a34a">✓ Validar CofA</button>`}
          <button class="btn ghost danger" id="deleteBtn" title="Eliminar (solo si no hay reportes)">🗑️</button>
        </div>
      </div>

      <div class="grid-2" style="margin-top:16px;gap:10px;font-size:13px">
        <div>
          <div class="label-text">Folio del proveedor</div>
          <input class="input" id="h_folioProv" maxlength="80" value="${escapeHtml(cp.folio_certificado_proveedor || '')}" ${validado ? 'disabled' : ''}/>
        </div>
        <div>
          <div class="label-text">Lote del proveedor</div>
          <input class="input" id="h_loteProv" maxlength="80" value="${escapeHtml(cp.lote_proveedor || '')}" ${validado ? 'disabled' : ''}/>
        </div>
        <div>
          <div class="label-text">Fecha de emisión</div>
          <input class="input" type="date" id="h_emision" value="${fmtDateInput(cp.fecha_emision)}" ${validado ? 'disabled' : ''}/>
        </div>
        <div>
          <div class="label-text">Fecha de vigencia</div>
          <input class="input" type="date" id="h_vigencia" value="${fmtDateInput(cp.fecha_vigencia)}" ${validado ? 'disabled' : ''}/>
        </div>
        <div style="grid-column:1/-1">
          <div class="label-text">Observaciones</div>
          <textarea class="input" id="h_obs" rows="2" maxlength="500" ${validado ? 'disabled' : ''}>${escapeHtml(cp.observaciones || '')}</textarea>
        </div>
      </div>

      ${!validado ? `
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
          <button class="btn primary" id="saveHeaderBtn">Guardar cambios</button>
        </div>
      ` : ''}

      ${validado ? `
        <div style="margin-top:12px;padding:10px;background:#dcfce7;color:#166534;border-radius:6px;font-size:13px">
          ✓ Validado por ${escapeHtml(cp.validador_nombre || '—')}
          ${cp.fecha_validacion ? ` el ${new Date(cp.fecha_validacion).toLocaleString()}` : ''}
        </div>
      ` : ''}
    `;

    if (!validado) {
      $('saveHeaderBtn').addEventListener('click', guardarCabecera);
      $('validarBtn')?.addEventListener('click', validarCofa);
    } else {
      $('revertirBtn')?.addEventListener('click', revertirValidacion);
    }
    $('deleteBtn').addEventListener('click', eliminarCofa);
  }

  async function guardarCabecera() {
    const body = {
      folio_certificado_proveedor: $('h_folioProv').value.trim(),
      lote_proveedor:              $('h_loteProv').value.trim() || null,
      fecha_emision:               $('h_emision').value || null,
      fecha_vigencia:              $('h_vigencia').value || null,
      observaciones:               $('h_obs').value.trim() || null,
    };
    if (!body.folio_certificado_proveedor) return KoguApi.toast('Folio del proveedor requerido.', 'error');
    try {
      await KoguApi.apiFetch(`${BASE}/${certId}`, { method: 'PUT', body: JSON.stringify(body) });
      KoguApi.toast('CofA actualizado', 'success');
      await load();
    } catch (err) { KoguApi.toast(err.message, 'error'); }
  }

  async function validarCofa() {
    if (!confirm('¿Validar este CofA? Quedará firmado con tu usuario y bloqueado para edición. Para corregir, deberás revertir la validación.')) return;
    try {
      await KoguApi.apiFetch(`${BASE}/${certId}/validar`, { method: 'POST', body: JSON.stringify({}) });
      KoguApi.toast('CofA validado', 'success');
      await load();
    } catch (err) { KoguApi.toast(err.message, 'error'); }
  }

  async function revertirValidacion() {
    if (!confirm('¿Revertir la validación? El CofA volverá a estado "Capturado" y podrás editarlo.')) return;
    try {
      await KoguApi.apiFetch(`${BASE}/${certId}/revertir-validacion`, { method: 'POST', body: JSON.stringify({}) });
      KoguApi.toast('Validación revertida', 'success');
      await load();
    } catch (err) { KoguApi.toast(err.message, 'error'); }
  }

  async function eliminarCofa() {
    if (!confirm('¿Eliminar este CofA? Esta acción no se puede deshacer (y fallará si hay reportes de inspección vinculados).')) return;
    try {
      await KoguApi.apiFetch(`${BASE}/${certId}`, { method: 'DELETE' });
      KoguApi.toast('CofA eliminado', 'success');
      window.location.href = '/modules/lab/lab-cert-proveedor.html';
    } catch (err) { KoguApi.toast(err.message, 'error'); }
  }

  // ── Sección de archivo ─────────────────────────
  function renderArchivo() {
    const section = $('archivoSection');
    const validado = cp.estado_lectura === 'validado';
    if (cp.archivo_origen_path) {
      const ext = (cp.archivo_origen_path.match(/\.[^.]+$/) || [''])[0];
      section.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:12px;background:#f8fafc;border:1px solid var(--line);border-radius:6px">
          <div>
            <div style="font-size:13px"><strong>📎 Archivo cargado</strong> (${escapeHtml(ext.toUpperCase().slice(1))})</div>
            <div class="muted" style="font-size:11px;margin-top:4px;font-family:monospace">SHA-256: ${escapeHtml((cp.hash_archivo || '').slice(0, 16))}…</div>
          </div>
          <div style="display:flex;gap:6px">
            <button class="btn ghost" id="downloadBtn">↓ Descargar</button>
            ${!validado ? `<button class="btn ghost" id="replaceBtn">Reemplazar…</button>` : ''}
          </div>
        </div>
        ${!validado ? `<input type="file" id="archivoInput" accept=".pdf,.jpg,.jpeg,.png,.webp" style="display:none"/>` : ''}
      `;
      $('downloadBtn').addEventListener('click', descargarArchivo);
      if (!validado) {
        $('replaceBtn').addEventListener('click', () => $('archivoInput').click());
        $('archivoInput').addEventListener('change', subirArchivo);
      }
    } else if (validado) {
      section.innerHTML = `<div class="muted" style="text-align:center;padding:20px;font-size:13px">CofA validado sin archivo cargado.</div>`;
    } else {
      section.innerHTML = `
        <div style="padding:14px;background:#fef3c7;border:1px solid #fbbf24;border-radius:6px;color:#78350f;font-size:13px">
          ⚠ No hay archivo del CofA cargado todavía. Sube el PDF/JPG/PNG enviado por el proveedor.
        </div>
        <div style="margin-top:12px">
          <input type="file" id="archivoInput" accept=".pdf,.jpg,.jpeg,.png,.webp" style="font-size:13px"/>
          <div class="muted" style="font-size:11px;margin-top:6px">Formatos: PDF, JPG, PNG, WebP. Máximo 20 MB.</div>
        </div>
      `;
      $('archivoInput').addEventListener('change', subirArchivo);
    }
  }

  async function subirArchivo(ev) {
    const f = ev.target.files?.[0];
    if (!f) return;
    const fd = new FormData();
    fd.append('archivo', f);
    try {
      const token   = KoguApi.getToken && KoguApi.getToken();
      const empresa = KoguApi.getEmpresaActiva && KoguApi.getEmpresaActiva();
      const url     = (KoguConfig?.API_BASE || '') + `${BASE}/${certId}/upload`;
      const headers = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      if (empresa?.empresa_id) headers['X-Empresa-Id'] = empresa.empresa_id;
      const resp = await fetch(url, { method: 'POST', body: fd, headers });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json?.message || json?.error || `HTTP ${resp.status}`);
      KoguApi.toast('Archivo subido', 'success');
      await load();
    } catch (err) { KoguApi.toast(err.message, 'error'); }
  }

  async function descargarArchivo() {
    try {
      const token   = KoguApi.getToken && KoguApi.getToken();
      const empresa = KoguApi.getEmpresaActiva && KoguApi.getEmpresaActiva();
      const url     = (KoguConfig?.API_BASE || '') + `${BASE}/${certId}/archivo`;
      const headers = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      if (empresa?.empresa_id) headers['X-Empresa-Id'] = empresa.empresa_id;
      const resp = await fetch(url, { headers });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      // Determinar nombre desde Content-Disposition o fallback por hint
      let filename = `${cp.folio_interno || 'cofa'}`;
      const cd = resp.headers.get('Content-Disposition') || '';
      const m = cd.match(/filename\*?=(?:UTF-8''|")?([^";]+)/);
      if (m) filename = decodeURIComponent(m[1]);
      else {
        const ext = (cp.archivo_origen_path?.match(/\.[^.]+$/) || ['.pdf'])[0];
        filename = `${cp.folio_interno || 'cofa'}${ext}`;
      }
      const blob = await resp.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(a.href);
    } catch (err) { KoguApi.toast(err.message, 'error'); }
  }

  // ── Parámetros (cards expandibles) ─────────────
  function renderParametros() {
    const list = $('paramsList');
    const validado = cp.estado_lectura === 'validado';
    if (!cp.parametros?.length) {
      list.innerHTML = `<div class="muted" style="text-align:center;padding:20px;font-size:13px">
        Sin parámetros capturados. Click en <strong>+ Nuevo parámetro</strong> para empezar.
      </div>`;
    } else {
      list.innerHTML = cp.parametros.map(p => paramCard(p, validado)).join('');
      list.querySelectorAll('button[data-edit]').forEach(b => b.addEventListener('click', () => editarParam(b.dataset.edit)));
      list.querySelectorAll('button[data-del]').forEach(b => b.addEventListener('click', () => eliminarParam(b.dataset.del)));
    }
    $('addParamBtn').disabled = validado;
    $('addParamBtn').style.opacity = validado ? '0.4' : '1';
  }

  function paramCard(p, readonly) {
    const cumple = p.cumple_segun_proveedor;
    const cumpleChip = cumple === true
      ? '<span class="chip" style="background:#dcfce7;color:#166534">✓ Cumple</span>'
      : cumple === false
        ? '<span class="chip" style="background:#fee2e2;color:#991b1b">✗ No cumple</span>'
        : '<span class="chip" style="background:#f1f5f9;color:#64748b">— sin info</span>';
    const valor = p.valor_numerico != null
      ? `<strong>${parseFloat(p.valor_numerico).toLocaleString()}</strong> ${escapeHtml(p.unidad_simbolo || '')}`
      : (p.valor_texto || '—');
    const spec = (p.spec_lim_min != null && p.spec_lim_max != null)
      ? `${p.spec_lim_min} – ${p.spec_lim_max}`
      : (p.spec_lim_min != null ? `≥ ${p.spec_lim_min}`
        : (p.spec_lim_max != null ? `≤ ${p.spec_lim_max}`
          : (p.spec_objetivo != null ? `obj. ${p.spec_objetivo}` : '—')));
    return `
      <div style="border:1px solid var(--line);border-radius:8px;padding:14px;background:#fafbfc">
        <div class="row">
          <div>
            <strong>${escapeHtml(p.parametro_nombre_proveedor || p.parametro_nombre || '—')}</strong>
            ${p.parametro_clave_proveedor || p.parametro_clave ? `<span class="muted" style="font-size:12px"> · ${escapeHtml(p.parametro_clave_proveedor || p.parametro_clave)}</span>` : ''}
            ${p.metodo_clave_proveedor ? `<div class="muted" style="font-size:11px;margin-top:2px">método: ${escapeHtml(p.metodo_clave_proveedor)}</div>` : ''}
          </div>
          <div style="display:flex;gap:6px">
            ${cumpleChip}
            ${!readonly ? `<button class="btn ghost" data-edit="${p.cp_parametro_id}">Editar</button>
                           <button class="btn ghost danger" data-del="${p.cp_parametro_id}">×</button>` : ''}
          </div>
        </div>
        <div class="grid-2" style="margin-top:8px;gap:8px;font-size:13px">
          <div><strong>Valor reportado:</strong> ${valor}</div>
          <div><strong>Spec proveedor:</strong> ${escapeHtml(spec)} ${escapeHtml(p.unidad_simbolo || '')}</div>
        </div>
      </div>`;
  }

  // ── Modal de parámetro (nuevo o editar) ──────────
  function abrirModalParametro(existing = null) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;overflow:auto';
    overlay.innerHTML = `
      <div style="background:white;border-radius:8px;max-width:640px;width:100%;max-height:95vh;overflow:auto;padding:24px;box-shadow:0 25px 50px rgba(0,0,0,.3)">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px">
          <div>
            <div class="eyebrow">CofA · Parámetro</div>
            <h2 style="margin:6px 0 0 0">${existing ? 'Editar parámetro' : 'Nuevo parámetro'}</h2>
          </div>
          <button class="btn ghost" id="closeBtn">×</button>
        </div>

        <div class="grid-2" style="gap:10px">
          <div style="grid-column:1/-1">
            <div class="label-text">Mapeo a parámetro interno (opcional)</div>
            <select class="select" id="m_parametroId">
              <option value="">— sin mapear —</option>
              ${parametrosCatalogo.map(p => `<option value="${p.parametro_id}" ${existing?.parametro_id === p.parametro_id ? 'selected' : ''}>${escapeHtml(p.clave)} — ${escapeHtml(p.nombre)}</option>`).join('')}
            </select>
            <div class="muted" style="font-size:11px;margin-top:4px">Si el parámetro existe en tu catálogo Lab, mapealo para facilitar la comparación con tus mediciones internas.</div>
          </div>

          <div>
            <div class="label-text">Clave del proveedor</div>
            <input class="input" id="m_clave" maxlength="80" value="${escapeHtml(existing?.parametro_clave_proveedor || '')}"/>
          </div>
          <div>
            <div class="label-text">Nombre del proveedor *</div>
            <input class="input" id="m_nombre" maxlength="200" value="${escapeHtml(existing?.parametro_nombre_proveedor || '')}"/>
          </div>

          <div>
            <div class="label-text">Método</div>
            <input class="input" id="m_metodo" maxlength="80" value="${escapeHtml(existing?.metodo_clave_proveedor || '')}"/>
          </div>
          <div>
            <div class="label-text">Unidad</div>
            <input class="input" id="m_unidad" maxlength="20" value="${escapeHtml(existing?.unidad_simbolo || '')}"/>
          </div>

          <div>
            <div class="label-text">Valor numérico</div>
            <input class="input" type="number" step="any" id="m_valor_num" value="${existing?.valor_numerico ?? ''}"/>
          </div>
          <div>
            <div class="label-text">Valor texto (alterno)</div>
            <input class="input" id="m_valor_txt" maxlength="200" value="${escapeHtml(existing?.valor_texto || '')}"/>
          </div>

          <div>
            <div class="label-text">Spec mín</div>
            <input class="input" type="number" step="any" id="m_min" value="${existing?.spec_lim_min ?? ''}"/>
          </div>
          <div>
            <div class="label-text">Spec máx</div>
            <input class="input" type="number" step="any" id="m_max" value="${existing?.spec_lim_max ?? ''}"/>
          </div>
          <div>
            <div class="label-text">Spec objetivo</div>
            <input class="input" type="number" step="any" id="m_obj" value="${existing?.spec_objetivo ?? ''}"/>
          </div>
          <div>
            <div class="label-text">¿Cumple según proveedor?</div>
            <select class="select" id="m_cumple">
              <option value="">— sin info —</option>
              <option value="true"  ${existing?.cumple_segun_proveedor === true  ? 'selected' : ''}>Sí cumple</option>
              <option value="false" ${existing?.cumple_segun_proveedor === false ? 'selected' : ''}>No cumple</option>
            </select>
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
      const cumpleVal = oQ('#m_cumple').value;
      const body = {
        parametro_id:               oQ('#m_parametroId').value || null,
        parametro_clave_proveedor:  oQ('#m_clave').value.trim() || null,
        parametro_nombre_proveedor: oQ('#m_nombre').value.trim(),
        metodo_clave_proveedor:     oQ('#m_metodo').value.trim() || null,
        unidad_simbolo:             oQ('#m_unidad').value.trim() || null,
        valor_numerico:             parseFloatOrNull(oQ('#m_valor_num').value),
        valor_texto:                oQ('#m_valor_txt').value.trim() || null,
        spec_lim_min:               parseFloatOrNull(oQ('#m_min').value),
        spec_lim_max:               parseFloatOrNull(oQ('#m_max').value),
        spec_objetivo:              parseFloatOrNull(oQ('#m_obj').value),
        cumple_segun_proveedor:     cumpleVal === '' ? null : (cumpleVal === 'true'),
      };
      if (!body.parametro_nombre_proveedor) return KoguApi.toast('Nombre del parámetro requerido.', 'error');
      try {
        oQ('#saveBtn').disabled = true;
        const url = existing
          ? `${BASE}/${certId}/parametros/${existing.cp_parametro_id}`
          : `${BASE}/${certId}/parametros`;
        const method = existing ? 'PUT' : 'POST';
        await KoguApi.apiFetch(url, { method, body: JSON.stringify(body) });
        KoguApi.toast(existing ? 'Parámetro actualizado' : 'Parámetro agregado', 'success');
        close();
        await load();
      } catch (err) {
        oQ('#saveBtn').disabled = false;
        KoguApi.toast(err.message, 'error');
      }
    });
  }

  function editarParam(pid) {
    const p = (cp.parametros || []).find(x => x.cp_parametro_id === pid);
    if (p) abrirModalParametro(p);
  }

  async function eliminarParam(pid) {
    if (!confirm('¿Eliminar este parámetro?')) return;
    try {
      await KoguApi.apiFetch(`${BASE}/${certId}/parametros/${pid}`, { method: 'DELETE' });
      KoguApi.toast('Parámetro eliminado', 'success');
      await load();
    } catch (err) { KoguApi.toast(err.message, 'error'); }
  }

  $('addParamBtn').addEventListener('click', () => abrirModalParametro());

  KoguShell.subscribeEmpresaActivaChange(() => {
    window.location.href = '/modules/lab/lab-cert-proveedor.html';
  });

  // ── Helpers ─────────────────────────────────────
  function escapeHtml(s) { return String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m]); }
  function fmtDateInput(v) {
    if (!v) return '';
    const s = String(v);
    const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : '';
  }
  function parseFloatOrNull(v) {
    if (v == null || v === '') return null;
    const n = parseFloat(v);
    return isFinite(n) ? n : null;
  }

  await loadParametrosCatalogo();
  await load();
});

// ============================================================
// lab-lotes.js
// Pantalla principal de Lotes Lab QA: tabla con filtros + alta.
// Click en lote → drill-down a lab-lote-detalle.html?id=...
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/lab/lab-lotes.html';
  const BASE = '/protected/lab/lotes';
  const PERM = 'screen.lab.lotes';

  const ESTADOS = [
    { code: 'pendiente',      label: 'Pendiente',      color: '#94a3b8' },
    { code: 'en_analisis',    label: 'En análisis',    color: '#3b82f6' },
    { code: 'analizado',      label: 'Analizado',      color: '#8b5cf6' },
    { code: 'listo_revision', label: 'Listo revisión', color: '#f59e0b' },
    { code: 'liberado',       label: 'Liberado',       color: '#16a34a' },
    { code: 'rechazado',      label: 'Rechazado',      color: '#dc2626' },
    { code: 'con_excepcion',  label: 'Con excepción',  color: '#f97316' },
  ];
  const ORIGENES = [
    { code: 'produccion', label: 'Producción' },
    { code: 'compra',     label: 'Compra'     },
    { code: 'manual',     label: 'Manual'     },
  ];

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Lotes',
    description: 'Lotes en análisis y resultados de calidad por empresa.',
    requiredPermission: PERM,
  });
  if (!b) return;

  const c = document.getElementById('pageContent');
  c.innerHTML = `
<div class="card">
  <div class="row">
    <div><div class="eyebrow">Lab QA</div><h2>Lotes</h2></div>
    <div style="display:flex;gap:8px">
      <button class="btn"         id="refreshBtn">Actualizar</button>
      <button class="btn primary" id="newBtn">Nuevo lote</button>
    </div>
  </div>

  <!-- Filtros -->
  <div class="grid-2" style="margin-top:16px;gap:10px">
    <input  class="input" id="q" placeholder="Buscar por número de lote, cve_prod o descripción"/>
    <select class="select" id="estadoFil">
      <option value="">Todos los estados</option>
      ${ESTADOS.map(s => `<option value="${s.code}">${s.label}</option>`).join('')}
    </select>
    <select class="select" id="origenFil">
      <option value="">Todos los orígenes</option>
      ${ORIGENES.map(o => `<option value="${o.code}">${o.label}</option>`).join('')}
    </select>
    <div style="display:flex;gap:6px">
      <input class="input" type="date" id="desde" title="Desde"/>
      <input class="input" type="date" id="hasta" title="Hasta"/>
    </div>
  </div>

  <!-- Tabla -->
  <div class="table-wrap" style="margin-top:16px">
    <table><thead><tr>
      <th>Número</th>
      <th>Producto</th>
      <th>Origen</th>
      <th>Fecha</th>
      <th>Cantidad</th>
      <th>Estado</th>
      <th style="text-align:center">Muestras</th>
      <th style="text-align:center">Resultados</th>
      <th style="text-align:center">Oficiales</th>
      <th></th>
    </tr></thead><tbody id="rowsLotes"></tbody></table>
  </div>
  <div id="pgBarLotes" style="display:flex;align-items:center;justify-content:space-between;margin-top:10px;font-size:13px;color:var(--muted)"></div>
</div>

<!-- Modal-card de alta de lote (oculto por default) -->
<div class="card" id="newLoteCard" style="display:none;margin-top:16px">
  <div class="row">
    <div><div class="eyebrow">Alta</div><h2>Nuevo lote</h2></div>
    <button class="btn ghost" id="closeNewBtn">Cerrar</button>
  </div>
  <div class="grid-2" style="margin-top:16px;gap:10px">
    <div>
      <div class="label-text">Producto <span style="color:var(--danger)">*</span></div>
      <select class="select" id="nlProducto"><option value="">— Seleccionar —</option></select>
    </div>
    <div>
      <div class="label-text">Origen <span style="color:var(--danger)">*</span></div>
      <select class="select" id="nlOrigen">
        ${ORIGENES.map(o => `<option value="${o.code}">${o.label}</option>`).join('')}
      </select>
    </div>
    <div>
      <div class="label-text">Número de lote <span style="color:var(--danger)">*</span></div>
      <input class="input" id="nlNumero" style="text-transform:uppercase" maxlength="80"/>
    </div>
    <div>
      <div class="label-text">Fecha del evento <span style="color:var(--danger)">*</span></div>
      <input class="input" id="nlFecha" type="date"/>
    </div>
    <div>
      <div class="label-text">Cantidad</div>
      <input class="input" id="nlCantidad" type="number" step="0.0001"/>
    </div>
    <div>
      <div class="label-text">Unidad</div>
      <select class="select" id="nlUnidad"><option value="">— Sin unidad —</option></select>
    </div>
    <div>
      <div class="label-text">Proveedor (compra)</div>
      <select class="select" id="nlProveedor"><option value="">— N/A —</option></select>
    </div>
    <div>
      <div class="label-text">Referencia externa</div>
      <input class="input" id="nlRefExt" placeholder="Folio OP / OC / remisión" maxlength="120"/>
    </div>
    <div style="grid-column:1 / -1">
      <div class="label-text">Observaciones</div>
      <textarea class="input" id="nlObs" rows="2" maxlength="500"></textarea>
    </div>
  </div>
  <div class="row" style="margin-top:16px;gap:8px;justify-content:flex-end">
    <button class="btn" id="cancelNewBtn">Cancelar</button>
    <button class="btn primary" id="saveNewBtn">Crear lote</button>
  </div>
</div>
  `;

  // ── Estado en memoria ─────────────────────────────────────
  let lotes      = [];
  let productos  = [];
  let unidades   = [];
  let proveedores = [];

  const $ = (id) => document.getElementById(id);

  // ── Carga de auxiliares para el form de alta ──────────────
  async function loadAuxiliares() {
    try {
      const [resProd, resUnd] = await Promise.all([
        KoguApi.apiFetch('/protected/cat/productos'),
        KoguApi.apiFetch('/protected/cat/unidades'),
      ]);
      productos = KoguApi.unwrapRows(resProd).filter(p => p.activo);
      unidades  = KoguApi.unwrapRows(resUnd).filter(u => u.activo);

      $('nlProducto').innerHTML = '<option value="">— Seleccionar —</option>'
        + productos.map(p => `<option value="${p.producto_id}">${p.cve_prod} — ${escapeHtml(p.desc_prod)}</option>`).join('');
      $('nlUnidad').innerHTML = '<option value="">— Sin unidad —</option>'
        + unidades.map(u => `<option value="${u.unidad_id}">${u.clave_interna} — ${escapeHtml(u.nombre)}</option>`).join('');
    } catch (err) {
      console.warn('No se pudieron cargar auxiliares:', err.message);
    }

    // Proveedores opcional
    try {
      const resProv = await KoguApi.apiFetch('/protected/core/proveedores');
      proveedores = KoguApi.unwrapRows(resProv);
      $('nlProveedor').innerHTML = '<option value="">— N/A —</option>'
        + proveedores.map(p => `<option value="${p.proveedor_id}">${escapeHtml(p.nombre || '(sin nombre)')}</option>`).join('');
    } catch (_) { /* silencioso */ }
  }

  // ── Carga de lotes con filtros ────────────────────────────
  async function loadLotes(showToast = false) {
    const params = new URLSearchParams();
    if ($('q').value.trim())     params.set('q', $('q').value.trim());
    if ($('estadoFil').value)    params.set('estado_calidad', $('estadoFil').value);
    if ($('origenFil').value)    params.set('origen', $('origenFil').value);
    if ($('desde').value)        params.set('desde', $('desde').value);
    if ($('hasta').value)        params.set('hasta', $('hasta').value);

    const url = BASE + (params.toString() ? '?' + params.toString() : '');
    try {
      const res = await KoguApi.apiFetch(url);
      lotes = KoguApi.unwrapData(res) || [];
      renderTabla();
      if (showToast) KoguApi.toast('Lotes actualizados', 'success');
    } catch (err) {
      KoguApi.toast(err.message, 'error');
    }
  }

  function renderTabla() {
    const tbody = $('rowsLotes');
    if (!lotes.length) {
      tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:24px;color:var(--muted)">Sin lotes para los filtros aplicados.</td></tr>`;
      $('pgBarLotes').textContent = '0 lotes';
      return;
    }

    tbody.innerHTML = lotes.map(l => {
      const estado = ESTADOS.find(s => s.code === l.estado_calidad) || { label: l.estado_calidad, color: '#64748b' };
      const origen = ORIGENES.find(o => o.code === l.origen) || { label: l.origen };
      const fecha  = l.fecha_evento ? new Date(l.fecha_evento).toLocaleDateString() : '—';
      const cantidad = l.cantidad
        ? `${parseFloat(l.cantidad).toLocaleString()} ${l.unidad_simbolo || ''}`
        : '<span class="muted">—</span>';
      return `
        <tr>
          <td><strong>${escapeHtml(l.numero_lote)}</strong></td>
          <td>${escapeHtml(l.cve_prod || '')}<br><span class="muted" style="font-size:12px">${escapeHtml(l.desc_prod || '')}</span></td>
          <td>${origen.label}</td>
          <td>${fecha}</td>
          <td>${cantidad}</td>
          <td><span class="chip" style="background:${estado.color}22;color:${estado.color}">${estado.label}</span></td>
          <td style="text-align:center">${l.muestras_completadas || 0}/${l.muestras_total || 0}</td>
          <td style="text-align:center">${l.resultados_total || 0}</td>
          <td style="text-align:center">${l.oficiales_total || 0}</td>
          <td style="text-align:right">
            <button class="btn ghost" data-lote-id="${l.lote_id}">Abrir</button>
          </td>
        </tr>`;
    }).join('');

    $('pgBarLotes').textContent = `${lotes.length} lote${lotes.length === 1 ? '' : 's'}`;

    tbody.querySelectorAll('button[data-lote-id]').forEach(btn => {
      btn.addEventListener('click', () => {
        window.location.href = `/modules/lab/lab-lote-detalle.html?id=${btn.dataset.loteId}`;
      });
    });
  }

  // ── Alta de lote ──────────────────────────────────────────
  function openNewLote() {
    $('newLoteCard').style.display = '';
    $('nlProducto').value = '';
    $('nlOrigen').value   = 'manual';
    $('nlNumero').value   = '';
    $('nlFecha').value    = new Date().toISOString().slice(0, 10);
    $('nlCantidad').value = '';
    $('nlUnidad').value   = '';
    $('nlProveedor').value = '';
    $('nlRefExt').value   = '';
    $('nlObs').value      = '';
    $('newLoteCard').scrollIntoView({ behavior: 'smooth' });
  }

  function closeNewLote() {
    $('newLoteCard').style.display = 'none';
  }

  async function saveNewLote() {
    const payload = {
      producto_id:        $('nlProducto').value || null,
      origen:             $('nlOrigen').value,
      numero_lote:        $('nlNumero').value.trim().toUpperCase(),
      fecha_evento:       $('nlFecha').value,
      cantidad:           parseFloat($('nlCantidad').value) || null,
      unidad_id:          $('nlUnidad').value || null,
      proveedor_id:       $('nlProveedor').value || null,
      referencia_externa: $('nlRefExt').value.trim() || null,
      observaciones:      $('nlObs').value.trim() || null,
    };

    if (!payload.producto_id)  return KoguApi.toast('Selecciona un producto', 'error');
    if (!payload.numero_lote)  return KoguApi.toast('El número de lote es obligatorio', 'error');
    if (!payload.fecha_evento) return KoguApi.toast('La fecha es obligatoria', 'error');

    try {
      const res = await KoguApi.apiFetch(BASE, { method: 'POST', body: JSON.stringify(payload) });
      const created = KoguApi.unwrapData(res);
      KoguApi.toast('Lote creado', 'success');
      closeNewLote();
      // Ir directo al detalle para empezar a registrar muestras
      window.location.href = `/modules/lab/lab-lote-detalle.html?id=${created.lote_id}`;
    } catch (err) {
      KoguApi.toast(err.message, 'error');
    }
  }

  // ── Bindings ──────────────────────────────────────────────
  $('refreshBtn').addEventListener('click', () => loadLotes(true));
  $('q').addEventListener('input', debounce(() => loadLotes(), 300));
  $('estadoFil').addEventListener('change', () => loadLotes());
  $('origenFil').addEventListener('change', () => loadLotes());
  $('desde').addEventListener('change', () => loadLotes());
  $('hasta').addEventListener('change', () => loadLotes());
  $('newBtn').addEventListener('click', openNewLote);
  $('closeNewBtn').addEventListener('click', closeNewLote);
  $('cancelNewBtn').addEventListener('click', closeNewLote);
  $('saveNewBtn').addEventListener('click', saveNewLote);

  KoguShell.subscribeEmpresaActivaChange(async () => {
    closeNewLote();
    await loadAuxiliares();
    await loadLotes(true);
  });

  // ── Helpers ──────────────────────────────────────────────
  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, m => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    })[m]);
  }
  function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  // ── Arranque ─────────────────────────────────────────────
  await loadAuxiliares();
  await loadLotes();
});

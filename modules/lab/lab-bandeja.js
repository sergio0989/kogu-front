// ============================================================
// lab-bandeja.js
// Bandeja de Calidad: lotes en estado de revisión + acciones de
// liberación, rechazo y excepciones. Sigue las convenciones
// estándar Lab (paginación servidor, semáforo verde/amarillo/rojo).
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/lab/lab-bandeja.html';
  const BASE = '/protected/lab';
  const PERM = 'screen.lab.bandeja';

  // Estados que aparecen por DEFAULT en la bandeja (decisión humana).
  const ESTADOS_BANDEJA = [
    { code: 'listo_revision', label: 'Listo revisión', color: '#f59e0b' },
    { code: 'liberado',       label: 'Liberado',       color: '#16a34a' },
    { code: 'con_excepcion',  label: 'Con excepción',  color: '#f97316' },
    { code: 'rechazado',      label: 'Rechazado',      color: '#dc2626' },
  ];
  // Estados previos (típicamente viven en pantalla Lotes; aquí se exponen
  // en el filtro para casos de búsqueda explícita o auditoría).
  const ESTADOS_PREVIOS = [
    { code: 'pendiente',   label: 'Pendiente',    color: '#94a3b8' },
    { code: 'en_analisis', label: 'En análisis',  color: '#3b82f6' },
    { code: 'analizado',   label: 'Analizado',    color: '#8b5cf6' },
  ];
  const ESTADOS = [...ESTADOS_BANDEJA, ...ESTADOS_PREVIOS];
  const SEMAFOROS = {
    verde:    { label: '✓ Cumple',     bg: '#dcfce7', color: '#166534' },
    amarillo: { label: '⚠ Pendiente',  bg: '#fef3c7', color: '#92400e' },
    rojo:     { label: '✗ No cumple',  bg: '#fee2e2', color: '#991b1b' },
  };
  const RIESGOS = [
    { code: 'bajo',  label: 'Bajo'  },
    { code: 'medio', label: 'Medio' },
    { code: 'alto',  label: 'Alto'  },
  ];
  const MOTIVOS = [
    { code: 'proceso',        label: 'Proceso'        },
    { code: 'materia_prima',  label: 'Materia prima'  },
    { code: 'equipo',         label: 'Equipo'         },
    { code: 'humano',         label: 'Humano'         },
    { code: 'otro',           label: 'Otro'           },
  ];

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Bandeja de Calidad',
    description: 'Lotes pendientes de revisión, liberación a cliente y excepciones.',
    requiredPermission: PERM,
  });
  if (!b) return;

  const c = document.getElementById('pageContent');
  c.innerHTML = `
<div class="card">
  <div class="row">
    <div><div class="eyebrow">Lab QA</div><h2>Bandeja de Calidad</h2></div>
    <button class="btn primary" id="refreshBtn">Actualizar</button>
  </div>

  <!-- Filtros -->
  <div class="grid-2" style="margin-top:16px;gap:10px">
    <input  class="input"  id="q"        placeholder="Buscar por número de lote, cve_prod o descripción"/>
    <select class="select" id="estadoFil" title="Estado del lote">
      <option value="">Bandeja (revisión / liberado / excepción / rechazado)</option>
      <option value="__all__">Todos (incluye previos)</option>
      <optgroup label="En decisión humana">
        ${ESTADOS_BANDEJA.map(s => `<option value="${s.code}">${s.label}</option>`).join('')}
      </optgroup>
      <optgroup label="Previos al análisis">
        ${ESTADOS_PREVIOS.map(s => `<option value="${s.code}">${s.label}</option>`).join('')}
      </optgroup>
    </select>
    <select class="select" id="semaforoFil">
      <option value="">Todos los semáforos</option>
      <option value="verde">✓ Solo cumple</option>
      <option value="rojo">✗ Solo no cumple</option>
      <option value="amarillo">⚠ Sin oficial calculado</option>
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
      <th>Fecha</th>
      <th>Estado</th>
      <th>Semáforo</th>
      <th style="text-align:center">Oficiales</th>
      <th style="text-align:center">Días en bandeja</th>
      <th style="text-align:right">Acciones</th>
    </tr></thead><tbody id="rowsBandeja"></tbody></table>
  </div>

  <!-- Paginación estándar -->
  <div id="pgBarBandeja" style="display:flex;align-items:center;justify-content:space-between;margin-top:14px;flex-wrap:wrap;gap:10px;font-size:13px;color:var(--muted)">
    <div id="pgInfoBandeja">—</div>
    <div style="display:flex;align-items:center;gap:6px">
      <span>Por página:</span>
      <select class="select" id="pgSizeBandeja" style="width:80px">
        <option value="10">10</option>
        <option value="25" selected>25</option>
        <option value="50">50</option>
        <option value="100">100</option>
      </select>
      <button class="btn ghost" id="pgFirstBandeja" title="Primera">«</button>
      <button class="btn ghost" id="pgPrevBandeja"  title="Anterior">‹</button>
      <span id="pgNumerosBandeja" style="display:flex;gap:4px"></span>
      <button class="btn ghost" id="pgNextBandeja"  title="Siguiente">›</button>
      <button class="btn ghost" id="pgLastBandeja"  title="Última">»</button>
    </div>
  </div>
</div>

<!-- Modal-cards de acciones (ocultos por default) -->
<div class="card" id="liberarCard" style="display:none;margin-top:16px">
  <div class="row">
    <div><div class="eyebrow">Liberación</div><h2 id="liberarTitle">Liberar lote</h2></div>
    <button class="btn ghost" id="closeLiberarBtn">Cerrar</button>
  </div>
  <input type="hidden" id="liberarLoteId"/>
  <div class="grid-2" style="margin-top:16px;gap:10px">
    <div>
      <div class="label-text">Cliente <span style="color:var(--danger)">*</span></div>
      <div style="display:flex;gap:6px">
        <input class="input" id="liberarClienteLabel" readonly placeholder="— Sin cliente —" style="flex:1;cursor:pointer;background:#f8fafc"/>
        <button type="button" class="btn ghost" id="liberarClientePickBtn">Buscar…</button>
      </div>
      <input type="hidden" id="liberarCliente"/>
    </div>
    <div>
      <div class="label-text">Condición</div>
      <select class="select" id="liberarCondicion">
        <option value="normal">Normal</option>
        <option value="excepcion">Excepción</option>
        <option value="cliente_especifico">Cliente específico</option>
      </select>
    </div>
    <div id="liberarExcepcionWrap" style="display:none">
      <div class="label-text">Excepción aprobada</div>
      <select class="select" id="liberarExcepcionId"><option value="">— Seleccionar excepción —</option></select>
    </div>
    <div>
      <div class="label-text">Folio factura externa (opcional)</div>
      <input class="input" id="liberarFolioFactura" maxlength="60"/>
    </div>
    <div style="grid-column:1 / -1">
      <div class="label-text">Observaciones</div>
      <textarea class="input" id="liberarObservaciones" rows="2" maxlength="500"></textarea>
    </div>
  </div>
  <div class="row" style="margin-top:16px;gap:8px;justify-content:flex-end">
    <button class="btn" id="cancelLiberarBtn">Cancelar</button>
    <button class="btn primary" id="confirmLiberarBtn">Liberar</button>
  </div>
</div>

<div class="card" id="rechazarCard" style="display:none;margin-top:16px">
  <div class="row">
    <div><div class="eyebrow">Rechazo</div><h2 id="rechazarTitle">Rechazar lote</h2></div>
    <button class="btn ghost" id="closeRechazarBtn">Cerrar</button>
  </div>
  <input type="hidden" id="rechazarLoteId"/>
  <div style="margin-top:16px">
    <div class="label-text">Motivo <span style="color:var(--danger)">*</span></div>
    <textarea class="input" id="rechazarMotivo" rows="3" maxlength="500" placeholder="Describe el motivo del rechazo. Se creará automáticamente una NC."></textarea>
  </div>
  <div style="margin-top:10px">
    <div class="label-text">Acción de contención (opcional)</div>
    <input class="input" id="rechazarContencion" maxlength="500" placeholder="Ej: bloqueo de uso, cuarentena…"/>
  </div>
  <div class="row" style="margin-top:16px;gap:8px;justify-content:flex-end">
    <button class="btn" id="cancelRechazarBtn">Cancelar</button>
    <button class="btn danger" id="confirmRechazarBtn">Rechazar y crear NC</button>
  </div>
</div>

<div class="card" id="excepcionCard" style="display:none;margin-top:16px">
  <div class="row">
    <div><div class="eyebrow">Excepción</div><h2 id="excepcionTitle">Crear excepción</h2></div>
    <button class="btn ghost" id="closeExcepcionBtn">Cerrar</button>
  </div>
  <input type="hidden" id="excepcionLoteId"/>
  <div class="grid-2" style="margin-top:16px;gap:10px">
    <div>
      <div class="label-text">Categoría del motivo <span style="color:var(--danger)">*</span></div>
      <select class="select" id="excepcionCategoria">
        ${MOTIVOS.map(m => `<option value="${m.code}">${m.label}</option>`).join('')}
      </select>
    </div>
    <div>
      <div class="label-text">Evaluación de riesgo</div>
      <select class="select" id="excepcionRiesgo">
        ${RIESGOS.map(r => `<option value="${r.code}" ${r.code === 'bajo' ? 'selected' : ''}>${r.label}</option>`).join('')}
      </select>
    </div>
    <div style="grid-column:1 / -1">
      <div class="label-text">Descripción del motivo <span style="color:var(--danger)">*</span></div>
      <textarea class="input" id="excepcionMotivo" rows="2" maxlength="1000"></textarea>
    </div>
    <div style="grid-column:1 / -1">
      <div class="label-text">Narrativa del riesgo</div>
      <textarea class="input" id="excepcionNarrativa" rows="2" maxlength="1000"></textarea>
    </div>
    <div style="grid-column:1 / -1">
      <div class="label-text">Acciones inmediatas</div>
      <textarea class="input" id="excepcionAcciones" rows="2" maxlength="1000"></textarea>
    </div>
    <div>
      <div class="label-text">Vigencia</div>
      <select class="select" id="excepcionVigencia">
        <option value="todo_lote">Todo el lote</option>
        <option value="entrega_unica">Entrega única</option>
      </select>
    </div>
    <div>
      <div class="label-text">Cliente destino (si aplica)</div>
      <div style="display:flex;gap:6px">
        <input class="input" id="excepcionClienteDestinoLabel" readonly placeholder="— N/A —" style="flex:1;cursor:pointer;background:#f8fafc"/>
        <button type="button" class="btn ghost" id="excepcionClienteDestinoPickBtn">Buscar…</button>
        <button type="button" class="btn ghost" id="excepcionClienteDestinoClearBtn" title="Limpiar">×</button>
      </div>
      <input type="hidden" id="excepcionClienteDestino"/>
    </div>
  </div>
  <div class="row" style="margin-top:16px;gap:8px;justify-content:flex-end">
    <button class="btn" id="cancelExcepcionBtn">Cancelar</button>
    <button class="btn primary" id="confirmExcepcionBtn">Crear excepción (borrador)</button>
  </div>
  <div style="margin-top:8px;font-size:12px;color:var(--muted)">
    La excepción se crea en estado <strong>borrador</strong>. Un gerente con permiso debe aprobarla para liberar el lote con condición "excepción".
  </div>
</div>
  `;

  // ── Estado ────────────────────────────────────────────────
  let lotes       = [];
  let clientes    = [];

  let currentPage = 1;
  let pageSize    = 25;
  let totalPages  = 1;
  let totalLotes  = 0;

  const $ = (id) => document.getElementById(id);

  // ── Carga auxiliar: clientes (en memoria; el picker filtra cliente-side) ──
  async function loadClientes() {
    try {
      const res = await KoguApi.apiFetch('/protected/core/clientes');
      clientes = KoguApi.unwrapRows(res);
    } catch (err) {
      console.warn('No se pudieron cargar clientes:', err.message);
      clientes = [];
    }
  }

  // ── Helpers de picker de cliente ─────────────────────────
  function pickClienteFor({ titulo, hiddenInputId, labelInputId, onPicked }) {
    KoguUi.openSearchPicker({
      title: titulo,
      items: clientes,
      placeholder: 'Buscar por nombre, RFC o cve_cte…',
      columns: [
        { key: 'nombre',  label: 'Nombre',  primary: true },
        { key: 'rfc',     label: 'RFC' },
        { key: 'cve_cte', label: 'cve_cte' },
        { key: 'email',   label: 'Email' },
      ],
      emptyText: clientes.length === 0
        ? 'No hay clientes en esta empresa. Crea uno desde el módulo Clientes.'
        : 'Sin coincidencias',
      onSelect: (cli) => {
        $(hiddenInputId).value = cli.cliente_id;
        $(labelInputId).value  = cli.nombre + (cli.rfc ? ' — ' + cli.rfc : '');
        if (onPicked) onPicked(cli);
      },
    });
  }

  // ── Carga de bandeja ──────────────────────────────────────
  async function loadBandeja(showToast = false, { resetPage = false } = {}) {
    if (resetPage) currentPage = 1;

    const params = new URLSearchParams();
    if ($('q').value.trim())     params.set('q', $('q').value.trim());
    if ($('estadoFil').value)    params.set('estado_calidad', $('estadoFil').value);
    if ($('semaforoFil').value)  params.set('semaforo', $('semaforoFil').value);
    if ($('desde').value)        params.set('desde', $('desde').value);
    if ($('hasta').value)        params.set('hasta', $('hasta').value);
    params.set('page',     String(currentPage));
    params.set('pageSize', String(pageSize));

    try {
      const res = await KoguApi.apiFetch(`${BASE}/bandeja?${params.toString()}`);
      lotes = KoguApi.unwrapData(res) || [];
      const meta = res?.meta || {};
      totalLotes  = parseInt(meta.total ?? lotes.length, 10) || 0;
      pageSize    = parseInt(meta.pageSize ?? pageSize, 10) || pageSize;
      currentPage = parseInt(meta.page ?? currentPage, 10) || 1;
      totalPages  = parseInt(meta.totalPages ?? 1, 10) || 1;
      renderTabla();
      renderPaginacion();
      if (showToast) KoguApi.toast('Bandeja actualizada', 'success');
    } catch (err) {
      KoguApi.toast(err.message, 'error');
    }
  }

  function renderTabla() {
    const tbody = $('rowsBandeja');
    if (!lotes.length) {
      // Mensaje contextual según el filtro de estado activo.
      const estadoActual = $('estadoFil').value;
      let mensaje;
      if (!estadoActual) {
        // Default: solo se ven los 4 estados de bandeja.
        mensaje = `
          <div style="padding:24px;text-align:center;color:var(--muted)">
            <div style="font-size:14px;margin-bottom:6px"><strong>Sin lotes en bandeja para los filtros aplicados.</strong></div>
            <div style="font-size:13px;line-height:1.5">
              La bandeja muestra solo lotes en <em>Listo revisión</em>, <em>Liberado</em>, <em>Con excepción</em> o <em>Rechazado</em>.<br/>
              Si tu lote está en estados previos (<em>Pendiente</em>, <em>En análisis</em>, <em>Analizado</em>),
              cambia el filtro a <strong>"Todos (incluye previos)"</strong> o búscalo en la pantalla
              <a href="/modules/lab/lab-lotes.html" style="color:#2563eb">Lotes</a>.
            </div>
          </div>`;
      } else if (estadoActual === '__all__') {
        mensaje = `<div style="padding:24px;text-align:center;color:var(--muted)">No hay lotes que coincidan con los filtros aplicados.</div>`;
      } else {
        mensaje = `<div style="padding:24px;text-align:center;color:var(--muted)">Sin lotes en estado <strong>${escapeHtml(estadoActual)}</strong> para los filtros aplicados.</div>`;
      }
      tbody.innerHTML = `<tr><td colspan="8">${mensaje}</td></tr>`;
      return;
    }

    tbody.innerHTML = lotes.map(l => {
      const estado   = ESTADOS.find(s => s.code === l.estado_calidad) || { label: l.estado_calidad, color: '#64748b' };
      const sem      = SEMAFOROS[l.semaforo] || SEMAFOROS.amarillo;
      const fecha    = l.fecha_evento ? new Date(l.fecha_evento).toLocaleDateString() : '—';
      const oficiales = `${l.oficiales_cumplen || 0}✓`
        + (l.oficiales_no_cumplen > 0 ? ` · ${l.oficiales_no_cumplen}✗` : '')
        + ` / ${l.oficiales_total || 0}`;
      const dias = l.dias_en_bandeja != null ? `${l.dias_en_bandeja} d` : '—';

      const liberable = ['listo_revision', 'con_excepcion'].includes(l.estado_calidad);
      const yaTerminal = ['liberado', 'rechazado'].includes(l.estado_calidad);

      const acciones = yaTerminal
        ? `<button class="btn ghost" data-detalle="${l.lote_id}">Ver detalle</button>`
        : `
          <button class="btn ghost"            data-detalle="${l.lote_id}">Detalle</button>
          ${liberable ? `<button class="btn primary"  data-liberar="${l.lote_id}">Liberar</button>` : ''}
          <button class="btn ghost danger"      data-rechazar="${l.lote_id}">Rechazar</button>
          <button class="btn ghost"             data-excepcion="${l.lote_id}">Excepción</button>
        `;

      return `
        <tr>
          <td><strong>${escapeHtml(l.numero_lote)}</strong></td>
          <td>${escapeHtml(l.cve_prod || '')}<br><span class="muted" style="font-size:12px">${escapeHtml(l.desc_prod || '')}</span></td>
          <td>${fecha}</td>
          <td><span class="chip" style="background:${estado.color}22;color:${estado.color}">${estado.label}</span></td>
          <td><span class="chip" style="background:${sem.bg};color:${sem.color}">${sem.label}</span></td>
          <td style="text-align:center">${oficiales}</td>
          <td style="text-align:center">${dias}</td>
          <td style="text-align:right;display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap">${acciones}</td>
        </tr>`;
    }).join('');

    // Bind acciones
    tbody.querySelectorAll('[data-detalle]').forEach(b => b.addEventListener('click', () => {
      window.location.href = `/modules/lab/lab-lote-detalle.html?id=${b.dataset.detalle}`;
    }));
    tbody.querySelectorAll('[data-liberar]').forEach(b => b.addEventListener('click', () => openLiberar(b.dataset.liberar)));
    tbody.querySelectorAll('[data-rechazar]').forEach(b => b.addEventListener('click', () => openRechazar(b.dataset.rechazar)));
    tbody.querySelectorAll('[data-excepcion]').forEach(b => b.addEventListener('click', () => openExcepcion(b.dataset.excepcion)));
  }

  // ── Paginación estándar ───────────────────────────────────
  function renderPaginacion() {
    const inicio = totalLotes === 0 ? 0 : (currentPage - 1) * pageSize + 1;
    const fin    = Math.min(currentPage * pageSize, totalLotes);
    $('pgInfoBandeja').textContent = totalLotes
      ? `Mostrando ${inicio}–${fin} de ${totalLotes} lote${totalLotes === 1 ? '' : 's'}`
      : 'Sin resultados';

    $('pgFirstBandeja').disabled = currentPage <= 1;
    $('pgPrevBandeja').disabled  = currentPage <= 1;
    $('pgNextBandeja').disabled  = currentPage >= totalPages;
    $('pgLastBandeja').disabled  = currentPage >= totalPages;

    const ventana = 2;
    let from = Math.max(1, currentPage - ventana);
    let to   = Math.min(totalPages, currentPage + ventana);
    if (currentPage <= 3) to = Math.min(totalPages, 5);
    if (currentPage >= totalPages - 2) from = Math.max(1, totalPages - 4);

    const nums = $('pgNumerosBandeja');
    nums.innerHTML = '';
    if (from > 1) {
      nums.appendChild(makePgBtn(1));
      if (from > 2) {
        const dots = document.createElement('span');
        dots.textContent = '…'; dots.style.padding = '0 6px';
        nums.appendChild(dots);
      }
    }
    for (let i = from; i <= to; i++) nums.appendChild(makePgBtn(i));
    if (to < totalPages) {
      if (to < totalPages - 1) {
        const dots = document.createElement('span');
        dots.textContent = '…'; dots.style.padding = '0 6px';
        nums.appendChild(dots);
      }
      nums.appendChild(makePgBtn(totalPages));
    }
  }
  function makePgBtn(num) {
    const b = document.createElement('button');
    b.className = 'btn ghost';
    b.textContent = String(num);
    if (num === currentPage) {
      b.classList.add('primary');
      b.classList.remove('ghost');
    }
    b.addEventListener('click', () => {
      if (num !== currentPage) { currentPage = num; loadBandeja(); }
    });
    return b;
  }

  // ── Modal Liberar ─────────────────────────────────────────
  function openLiberar(loteId) {
    closeAllModals();
    $('liberarLoteId').value = loteId;
    $('liberarCliente').value = '';
    $('liberarClienteLabel').value = '';
    $('liberarCondicion').value = 'normal';
    $('liberarFolioFactura').value = '';
    $('liberarObservaciones').value = '';
    $('liberarExcepcionWrap').style.display = 'none';
    const lote = lotes.find(l => l.lote_id === loteId);
    $('liberarTitle').textContent = `Liberar lote ${lote ? lote.numero_lote : ''}`;
    $('liberarCard').style.display = '';
    $('liberarCard').scrollIntoView({ behavior: 'smooth' });
  }
  $('liberarCondicion') && $('liberarCondicion').addEventListener('change', async (e) => {
    const wrap = $('liberarExcepcionWrap');
    if (e.target.value === 'excepcion') {
      wrap.style.display = '';
      // Cargar excepciones aprobadas del lote
      const loteId = $('liberarLoteId').value;
      // Por simplicidad V1: listar via repo de bandeja no expone esto directamente.
      // El usuario debe escribir el excepcion_id manualmente o tener una pantalla aparte.
      // De momento, dejamos el select vacío y el usuario lo crea/aprueba primero por separado.
      $('liberarExcepcionId').innerHTML = '<option value="">— Selecciona la excepción aprobada —</option>'
        + '<option value="" disabled>(crea la excepción y apruébala desde el detalle del lote)</option>';
    } else {
      wrap.style.display = 'none';
    }
  });

  async function confirmLiberar() {
    const loteId = $('liberarLoteId').value;
    const payload = {
      cliente_id:            $('liberarCliente').value,
      condicion:             $('liberarCondicion').value,
      excepcion_id:          $('liberarExcepcionId').value || null,
      folio_factura_externa: $('liberarFolioFactura').value.trim() || null,
      observaciones:         $('liberarObservaciones').value.trim() || null,
    };
    if (!payload.cliente_id) return KoguApi.toast('Selecciona un cliente', 'error');
    if (payload.condicion === 'excepcion' && !payload.excepcion_id) {
      return KoguApi.toast('Para condición=excepcion debes seleccionar una excepción aprobada', 'error');
    }
    try {
      await KoguApi.apiFetch(`${BASE}/bandeja/${loteId}/liberar`, {
        method: 'POST', body: JSON.stringify(payload),
      });
      KoguApi.toast('Lote liberado', 'success');
      closeAllModals();
      await loadBandeja();
    } catch (err) { KoguApi.toast(err.message, 'error'); }
  }

  // ── Modal Rechazar ────────────────────────────────────────
  function openRechazar(loteId) {
    closeAllModals();
    $('rechazarLoteId').value = loteId;
    $('rechazarMotivo').value = '';
    $('rechazarContencion').value = '';
    const lote = lotes.find(l => l.lote_id === loteId);
    $('rechazarTitle').textContent = `Rechazar lote ${lote ? lote.numero_lote : ''}`;
    $('rechazarCard').style.display = '';
    $('rechazarCard').scrollIntoView({ behavior: 'smooth' });
  }

  async function confirmRechazar() {
    const loteId = $('rechazarLoteId').value;
    const motivo = $('rechazarMotivo').value.trim();
    if (!motivo) return KoguApi.toast('El motivo es obligatorio', 'error');
    if (!confirm('¿Rechazar el lote? Se creará una NC automática.')) return;
    try {
      const res = await KoguApi.apiFetch(`${BASE}/bandeja/${loteId}/rechazar`, {
        method: 'POST',
        body: JSON.stringify({ motivo, contencion: $('rechazarContencion').value.trim() || null }),
      });
      const data = KoguApi.unwrapData(res);
      KoguApi.toast(`Lote rechazado · ${data?.folio_nc || 'NC creada'}`, 'success');
      closeAllModals();
      await loadBandeja();
    } catch (err) { KoguApi.toast(err.message, 'error'); }
  }

  // ── Modal Excepción ──────────────────────────────────────
  function openExcepcion(loteId) {
    closeAllModals();
    $('excepcionLoteId').value = loteId;
    $('excepcionCategoria').value = 'proceso';
    $('excepcionRiesgo').value = 'bajo';
    $('excepcionMotivo').value = '';
    $('excepcionNarrativa').value = '';
    $('excepcionAcciones').value = '';
    $('excepcionVigencia').value = 'todo_lote';
    $('excepcionClienteDestino').value = '';
    $('excepcionClienteDestinoLabel').value = '';
    const lote = lotes.find(l => l.lote_id === loteId);
    $('excepcionTitle').textContent = `Crear excepción para ${lote ? lote.numero_lote : ''}`;
    $('excepcionCard').style.display = '';
    $('excepcionCard').scrollIntoView({ behavior: 'smooth' });
  }

  async function confirmExcepcion() {
    const loteId = $('excepcionLoteId').value;
    const payload = {
      motivo_categoria:    $('excepcionCategoria').value,
      motivo_descripcion:  $('excepcionMotivo').value.trim(),
      evaluacion_riesgo:   $('excepcionRiesgo').value,
      narrativa_riesgo:    $('excepcionNarrativa').value.trim() || null,
      acciones_inmediatas: $('excepcionAcciones').value.trim() || null,
      vigencia:            $('excepcionVigencia').value,
      cliente_destino_id:  $('excepcionClienteDestino').value || null,
    };
    if (!payload.motivo_descripcion) return KoguApi.toast('La descripción del motivo es obligatoria', 'error');
    try {
      await KoguApi.apiFetch(`${BASE}/bandeja/${loteId}/excepcion`, {
        method: 'POST', body: JSON.stringify(payload),
      });
      KoguApi.toast('Excepción creada en borrador. Un gerente debe aprobarla.', 'success');
      closeAllModals();
      await loadBandeja();
    } catch (err) { KoguApi.toast(err.message, 'error'); }
  }

  function closeAllModals() {
    $('liberarCard').style.display = 'none';
    $('rechazarCard').style.display = 'none';
    $('excepcionCard').style.display = 'none';
  }

  // ── Bindings ─────────────────────────────────────────────
  $('refreshBtn').addEventListener('click', () => loadBandeja(true));
  $('q').addEventListener('input', debounce(() => loadBandeja(false, { resetPage: true }), 300));
  $('estadoFil').addEventListener('change',   () => loadBandeja(false, { resetPage: true }));
  $('semaforoFil').addEventListener('change', () => loadBandeja(false, { resetPage: true }));
  $('desde').addEventListener('change',       () => loadBandeja(false, { resetPage: true }));
  $('hasta').addEventListener('change',       () => loadBandeja(false, { resetPage: true }));

  $('pgSizeBandeja').addEventListener('change', (e) => {
    pageSize = parseInt(e.target.value, 10) || 25;
    loadBandeja(false, { resetPage: true });
  });
  $('pgFirstBandeja').addEventListener('click', () => { if (currentPage > 1)         { currentPage = 1;          loadBandeja(); } });
  $('pgPrevBandeja').addEventListener('click',  () => { if (currentPage > 1)         { currentPage--;            loadBandeja(); } });
  $('pgNextBandeja').addEventListener('click',  () => { if (currentPage < totalPages) { currentPage++;           loadBandeja(); } });
  $('pgLastBandeja').addEventListener('click',  () => { if (currentPage < totalPages) { currentPage = totalPages; loadBandeja(); } });

  // Pickers de cliente (modal con búsqueda) — reemplaza el <select> nativo
  $('liberarClientePickBtn').addEventListener('click', () => {
    pickClienteFor({
      titulo: 'Seleccionar cliente para liberación',
      hiddenInputId: 'liberarCliente',
      labelInputId:  'liberarClienteLabel',
    });
  });
  $('liberarClienteLabel').addEventListener('click', () => $('liberarClientePickBtn').click());

  $('excepcionClienteDestinoPickBtn').addEventListener('click', () => {
    pickClienteFor({
      titulo: 'Seleccionar cliente destino de la excepción',
      hiddenInputId: 'excepcionClienteDestino',
      labelInputId:  'excepcionClienteDestinoLabel',
    });
  });
  $('excepcionClienteDestinoLabel').addEventListener('click', () => $('excepcionClienteDestinoPickBtn').click());
  $('excepcionClienteDestinoClearBtn').addEventListener('click', () => {
    $('excepcionClienteDestino').value = '';
    $('excepcionClienteDestinoLabel').value = '';
  });

  $('closeLiberarBtn').addEventListener('click',   closeAllModals);
  $('cancelLiberarBtn').addEventListener('click',  closeAllModals);
  $('confirmLiberarBtn').addEventListener('click', confirmLiberar);

  $('closeRechazarBtn').addEventListener('click',   closeAllModals);
  $('cancelRechazarBtn').addEventListener('click',  closeAllModals);
  $('confirmRechazarBtn').addEventListener('click', confirmRechazar);

  $('closeExcepcionBtn').addEventListener('click',   closeAllModals);
  $('cancelExcepcionBtn').addEventListener('click',  closeAllModals);
  $('confirmExcepcionBtn').addEventListener('click', confirmExcepcion);

  KoguShell.subscribeEmpresaActivaChange(async () => {
    closeAllModals();
    await loadClientes();
    await loadBandeja(true);
  });

  // ── Helpers ──────────────────────────────────────────────
  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, m => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    })[m]);
  }
  function debounce(fn, ms) { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); }; }

  // ── Arranque ─────────────────────────────────────────────
  await loadClientes();
  await loadBandeja();
});

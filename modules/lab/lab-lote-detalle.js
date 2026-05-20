// ============================================================
// lab-lote-detalle.js
// Detalle completo del lote: muestras, resultados y oficial.
// URL: /modules/lab/lab-lote-detalle.html?id=<lote_id>
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/lab/lab-lote-detalle.html';
  const PERM = 'screen.lab.lotes';
  const BASE = '/protected/lab';

  const ESTADOS_LOTE = [
    { code: 'pendiente',      label: 'Pendiente',      color: '#94a3b8' },
    { code: 'en_analisis',    label: 'En análisis',    color: '#3b82f6' },
    { code: 'analizado',      label: 'Analizado',      color: '#8b5cf6' },
    { code: 'listo_revision', label: 'Listo revisión', color: '#f59e0b' },
    { code: 'liberado',       label: 'Liberado',       color: '#16a34a' },
    { code: 'rechazado',      label: 'Rechazado',      color: '#dc2626' },
    { code: 'con_excepcion',  label: 'Con excepción',  color: '#f97316' },
  ];
  const ESTADOS_MUESTRA = [
    { code: 'pendiente',   label: 'Pendiente',  color: '#94a3b8' },
    { code: 'en_analisis', label: 'En análisis', color: '#3b82f6' },
    { code: 'completada',  label: 'Completada', color: '#16a34a' },
    { code: 'anulada',     label: 'Anulada',    color: '#dc2626' },
  ];
  const EVALS = {
    cumple:        { label: 'Cumple',        color: '#16a34a', bg: '#dcfce7' },
    no_cumple:     { label: 'No cumple',     color: '#991b1b', bg: '#fee2e2' },
    observacion:   { label: 'Observación',   color: '#92400e', bg: '#fef3c7' },
    pendiente_eval:{ label: 'Pendiente',     color: '#475569', bg: '#e2e8f0' },
    no_aplica:     { label: 'N/A',           color: '#64748b', bg: '#f1f5f9' },
  };
  const ESTRATEGIAS = [
    { code: 'promedio',        label: 'Promedio'         },
    { code: 'mediana',         label: 'Mediana'          },
    { code: 'ultimo',          label: 'Último resultado' },
    { code: 'mas_restrictivo', label: 'Más restrictivo'  },
    { code: 'manual',          label: 'Manual'           },
  ];

  // ── ID del lote por query param ───────────────────────────
  const params = new URLSearchParams(window.location.search);
  const loteId = params.get('id');
  if (!loteId) {
    window.location.href = '/modules/lab/lab-lotes.html';
    return;
  }

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Detalle de Lote',
    description: 'Muestras, resultados y resultado oficial.',
    requiredPermission: PERM,
  });
  if (!b) return;

  const c = document.getElementById('pageContent');
  c.innerHTML = `
<div style="margin-bottom:12px">
  <button class="btn ghost" id="backBtn">← Volver a Lotes</button>
</div>

<!-- Encabezado del lote -->
<div class="card" id="loteHeader">
  <div style="text-align:center;padding:20px;color:var(--muted)">Cargando lote…</div>
</div>

<!-- Sección de muestras -->
<div class="card" style="margin-top:16px">
  <div class="row">
    <div><div class="eyebrow">Muestreo</div><h2>Muestras y resultados</h2></div>
    <div style="display:flex;gap:8px;align-items:center">
      <button class="btn ghost"   id="toggleAllBtn">Expandir todas</button>
      <button class="btn primary" id="addMuestraBtn">Nueva muestra</button>
    </div>
  </div>
  <div id="muestrasList" style="margin-top:16px;display:flex;flex-direction:column;gap:12px"></div>
</div>

<!-- Sección de oficiales -->
<div class="card" style="margin-top:16px">
  <div class="row">
    <div><div class="eyebrow">Resultado oficial</div><h2>Consolidado por parámetro</h2></div>
    <div style="display:flex;gap:8px;align-items:center">
      <select class="select" id="estrategiaSel" style="width:180px">
        ${ESTRATEGIAS.map(s => `<option value="${s.code}">${s.label}</option>`).join('')}
      </select>
      <button class="btn primary" id="calcularBtn">Calcular oficial</button>
    </div>
  </div>
  <div class="table-wrap" style="margin-top:16px">
    <table><thead><tr>
      <th>Parámetro</th>
      <th>Estrategia</th>
      <th>Valor oficial</th>
      <th>Spec</th>
      <th>Evaluación</th>
      <th>Calculado por</th>
      <th></th>
    </tr></thead><tbody id="rowsOficiales"></tbody></table>
  </div>
</div>

<!-- Sección de Reporte de Inspección — solo si origen='compra' -->
<div class="card" style="margin-top:16px;display:none" id="reporteInspCard">
  <div class="row" id="reporteInspHeader" style="cursor:pointer;user-select:none">
    <div style="display:flex;align-items:center;gap:8px">
      <span id="reporteInspChevron" style="font-size:12px;color:#64748b;width:16px">▶</span>
      <div>
        <div class="eyebrow">Inspección de compra</div>
        <h2 style="margin:0">Reporte de inspección</h2>
      </div>
    </div>
    <div class="muted" style="font-size:12px" id="reporteInspResumen">Click para ver el reporte</div>
  </div>
  <div id="reporteInspBody" style="display:none;margin-top:16px"></div>
</div>

<!-- Sección de NCs asociadas — colapsable, carga lazy -->
<div class="card" style="margin-top:16px">
  <div class="row" id="ncHeader" style="cursor:pointer;user-select:none">
    <div style="display:flex;align-items:center;gap:8px">
      <span id="ncChevron" style="font-size:12px;color:#64748b;width:16px">▶</span>
      <div>
        <div class="eyebrow">Calidad</div>
        <h2 style="margin:0">No Conformidades asociadas</h2>
      </div>
    </div>
    <div class="muted" style="font-size:12px" id="ncResumen">Click para ver las NCs de este lote</div>
  </div>
  <div id="ncBody" style="display:none;margin-top:16px"></div>
</div>

<!-- Sección de historial (bitácora) — colapsable, carga lazy -->
<div class="card" style="margin-top:16px">
  <div class="row" id="bitacoraHeader" style="cursor:pointer;user-select:none">
    <div style="display:flex;align-items:center;gap:8px">
      <span id="bitacoraChevron" style="font-size:12px;color:#64748b;width:16px">▶</span>
      <div>
        <div class="eyebrow">Auditoría</div>
        <h2 style="margin:0">Historial de eventos</h2>
      </div>
    </div>
    <div class="muted" style="font-size:12px" id="bitacoraResumen">Click para ver el historial</div>
  </div>
  <div id="bitacoraBody" style="display:none;margin-top:16px"></div>
</div>
  `;

  // ── Estado en memoria ────────────────────────────────────
  let lote      = null;
  let parametros = [];   // catálogo Lab parámetros (para selector en captura)

  const $ = (id) => document.getElementById(id);

  // ── Carga inicial ────────────────────────────────────────
  async function loadParametros() {
    try {
      const res = await KoguApi.apiFetch('/protected/lab/maestros/parametros?status=activo');
      parametros = KoguApi.unwrapData(res) || [];
    } catch (err) {
      console.warn('No se pudieron cargar parámetros:', err.message);
    }
  }

  async function loadLote() {
    try {
      const res = await KoguApi.apiFetch(`${BASE}/lotes/${loteId}`);
      lote = KoguApi.unwrapData(res);
      renderHeader();
      renderMuestras();
      renderOficiales();
      // Mostrar/ocultar card de Reporte de Inspección según origen del lote
      const reporteCard = document.getElementById('reporteInspCard');
      if (reporteCard) {
        reporteCard.style.display = lote?.origen === 'compra' ? '' : 'none';
      }
    } catch (err) {
      KoguApi.toast(err.message, 'error');
      $('loteHeader').innerHTML = `<div style="text-align:center;padding:20px;color:var(--danger)">No se pudo cargar el lote.</div>`;
    }
  }

  // ── Header del lote ──────────────────────────────────────
  function renderHeader() {
    if (!lote) return;
    const estado   = ESTADOS_LOTE.find(s => s.code === lote.estado_calidad) || { label: lote.estado_calidad, color: '#64748b' };
    const fecha    = lote.fecha_evento ? new Date(lote.fecha_evento).toLocaleDateString() : '—';
    const cantidad = lote.cantidad
      ? `${parseFloat(lote.cantidad).toLocaleString()} ${lote.unidad_simbolo || ''}`
      : '—';

    const puedeCambiarEstado = KoguShell.hasPerm(b, 'lab.lotes.cambiar_estado');
    const estaLiberado       = ['liberado', 'con_excepcion'].includes(lote.estado_calidad);

    // Banner de bloqueo cuando el lote no está liberado
    const bannerBloqueo = !estaLiberado ? `
      <div style="margin-top:14px;padding:12px 16px;background:#fff7ed;border-left:4px solid #f97316;
                  border-radius:6px;font-size:13px;color:#7c2d12;display:flex;gap:10px;align-items:flex-start">
        <span style="font-size:16px;flex-shrink:0">⚠</span>
        <div>
          <strong>Lote no liberado</strong> — No se pueden crear liberaciones ni emitir COAs hasta que el estado sea
          <strong>Liberado</strong>${puedeCambiarEstado
            ? '. Usa el selector de estado para cambiar el estado cuando el análisis esté completo.'
            : '. Contacta a un <strong>Supervisor de Lab</strong> o al <strong>Gerente de Calidad</strong> para liberar este lote.'}
        </div>
      </div>` : '';

    $('loteHeader').innerHTML = `
      <div class="row">
        <div>
          <div class="eyebrow">Lote #${escapeHtml(lote.numero_lote)}</div>
          <h2>${escapeHtml(lote.cve_prod || '')} — ${escapeHtml(lote.desc_prod || '')}</h2>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <span class="chip" style="background:${estado.color}22;color:${estado.color};font-size:14px;padding:6px 12px">${estado.label}</span>
        </div>
      </div>
      <div class="grid-2" style="margin-top:16px;gap:10px;font-size:14px">
        <div><strong>Origen:</strong> ${escapeHtml(lote.origen)}</div>
        <div><strong>Fecha del evento:</strong> ${fecha}</div>
        <div><strong>Cantidad:</strong> ${cantidad}</div>
        <div><strong>Referencia externa:</strong> ${escapeHtml(lote.referencia_externa || '—')}</div>
        ${lote.proveedor_nombre ? `<div><strong>Proveedor:</strong> ${escapeHtml(lote.proveedor_nombre)}</div>` : ''}
        ${puedeCambiarEstado ? `
        <div>
          <strong>Cambiar estado:</strong>
          <select class="select" id="estadoEdit" style="display:inline-block;width:auto;margin-left:6px">
            ${ESTADOS_LOTE.map(s => `<option value="${s.code}" ${s.code === lote.estado_calidad ? 'selected' : ''}>${s.label}</option>`).join('')}
          </select>
        </div>` : ''}
      </div>
      ${lote.observaciones ? `<div style="margin-top:12px;padding:10px;background:var(--muted-bg, #f1f5f9);border-radius:6px;font-size:13px"><strong>Observaciones:</strong> ${escapeHtml(lote.observaciones)}</div>` : ''}
      ${bannerBloqueo}
    `;

    // Cambio de estado (solo si tiene permiso)
    const estadoEl = document.getElementById('estadoEdit');
    if (estadoEl) {
      estadoEl.addEventListener('change', async (e) => {
        const nuevoEstado = e.target.value;
        if (nuevoEstado === lote.estado_calidad) return;
        const estadoLabel = ESTADOS_LOTE.find(s => s.code === nuevoEstado)?.label || nuevoEstado;
        if (!confirm(`¿Cambiar el estado del lote a "${estadoLabel}"?`)) {
          e.target.value = lote.estado_calidad;
          return;
        }
        try {
          await KoguApi.apiFetch(`${BASE}/lotes/${loteId}`, {
            method: 'PATCH',
            body: JSON.stringify({ estado_calidad: nuevoEstado }),
          });
          KoguApi.toast(`Estado cambiado a ${estadoLabel}`, 'success');
          await loadLote();
        } catch (err) {
          KoguApi.toast(err.message, 'error');
          e.target.value = lote.estado_calidad;
        }
      });
    }
  }

  // ── Muestras (acordeón) ──────────────────────────────────
  function renderMuestras() {
    const list = $('muestrasList');
    const muestras = lote.muestras || [];
    if (!muestras.length) {
      list.innerHTML = '<div class="muted" style="text-align:center;padding:20px">Sin muestras todavía. Haz click en "Nueva muestra" para empezar.</div>';
      return;
    }

    list.innerHTML = muestras.map(m => {
      const estado = ESTADOS_MUESTRA.find(s => s.code === m.estado) || { label: m.estado, color: '#64748b' };
      const resultadosDeMuestra = (lote.resultados || []).filter(r => r.muestra_id === m.muestra_id);
      const fechaMuestreo = m.fecha_muestreo ? new Date(m.fecha_muestreo).toLocaleString() : '—';

      // Resumen para la cabecera (visible incluso colapsada)
      const cumplen   = resultadosDeMuestra.filter(r => r.evaluacion === 'cumple').length;
      const noCumplen = resultadosDeMuestra.filter(r => r.evaluacion === 'no_cumple').length;
      const pendientes = resultadosDeMuestra.filter(r => r.evaluacion === 'pendiente_eval').length;
      const totalRes = resultadosDeMuestra.length;
      const resumen = totalRes
        ? `${totalRes} resultado${totalRes === 1 ? '' : 's'}`
            + (cumplen ? ` · <span style="color:#16a34a">${cumplen} cumplen</span>` : '')
            + (noCumplen ? ` · <span style="color:#dc2626">${noCumplen} no cumplen</span>` : '')
            + (pendientes ? ` · <span style="color:#475569">${pendientes} pendientes</span>` : '')
        : '<span class="muted">Sin resultados aún</span>';

      const filasResultados = resultadosDeMuestra.length
        ? resultadosDeMuestra.map(r => {
            const ev = EVALS[r.evaluacion] || EVALS.pendiente_eval;
            const valor = r.valor_numerico != null
              ? `${parseFloat(r.valor_numerico).toLocaleString()} ${r.unidad_capturada_simbolo || ''}`
              : (r.valor_texto || '—');
            return `
              <tr>
                <td><strong>${escapeHtml(r.parametro_clave || '')}</strong> <span class="muted">${escapeHtml(r.parametro_nombre || '')}</span></td>
                <td>${escapeHtml(r.metodo_clave || '—')}</td>
                <td>${escapeHtml(r.clave_equipo || '—')}</td>
                <td>${valor}</td>
                <td><span class="chip" style="background:${ev.bg};color:${ev.color}">${ev.label}</span></td>
                <td style="text-align:right">
                  <button class="btn ghost danger" data-del-resultado="${r.resultado_id}" title="Eliminar">×</button>
                </td>
              </tr>`;
          }).join('')
        : `<tr><td colspan="6" style="text-align:center;padding:12px;color:var(--muted);font-size:13px">Sin resultados aún</td></tr>`;

      // Default expandido si la muestra está en trabajo activo;
      // colapsado si está completada o anulada.
      const colapsoDefault = (m.estado === 'completada' || m.estado === 'anulada');
      // Recordar preferencia del usuario en sessionStorage por (lote, muestra)
      const storeKey = `lab.muestra.collapsed.${loteId}.${m.muestra_id}`;
      const userPref = sessionStorage.getItem(storeKey);
      const colapsada = userPref !== null ? userPref === '1' : colapsoDefault;

      return `
        <div class="muestra-card" data-muestra-id="${m.muestra_id}" data-collapsed="${colapsada}"
             style="border:1px solid var(--line);border-radius:8px;padding:14px;background:#fafbfc">
          <!-- Cabecera clickeable -->
          <div class="muestra-header" data-toggle="${m.muestra_id}"
               style="cursor:pointer;user-select:none">
            <div class="row">
              <div style="display:flex;align-items:center;gap:8px">
                <span class="muestra-chevron" style="font-size:14px;color:var(--muted);transition:transform .2s;display:inline-block;width:14px">
                  ${colapsada ? '▶' : '▼'}
                </span>
                <strong>Muestra #${m.numero_muestra}</strong>
                <span class="chip" style="background:${estado.color}22;color:${estado.color}">${estado.label}</span>
                ${m.identificador_envase ? `<span class="muted">${escapeHtml(m.identificador_envase)}</span>` : ''}
              </div>
              <div style="display:flex;gap:6px" data-stop-toggle>
                ${m.estado !== 'anulada' ? `
                  <button class="btn primary ghost" data-add-resultado="${m.muestra_id}">+ Resultado</button>
                  <button class="btn ghost danger" data-anular-muestra="${m.muestra_id}">Anular</button>
                ` : ''}
              </div>
            </div>
            <div style="margin-top:6px;font-size:13px;color:var(--muted)">
              ${escapeHtml(m.lugar_muestreo || '')} · ${fechaMuestreo}
              ${m.persona_muestreo_nombre ? `· por ${escapeHtml(m.persona_muestreo_nombre)}` : ''}
              · ${resumen}
            </div>
            ${m.motivo_anulacion ? `<div style="margin-top:6px;font-size:13px;color:var(--danger)"><strong>Anulación:</strong> ${escapeHtml(m.motivo_anulacion)}</div>` : ''}
          </div>

          <!-- Cuerpo colapsable -->
          <div class="muestra-body" style="display:${colapsada ? 'none' : 'block'}">
            <div class="table-wrap" style="margin-top:12px">
              <table style="font-size:13px"><thead><tr>
                <th>Parámetro</th><th>Método</th><th>Equipo</th><th>Valor</th><th>Evaluación</th><th></th>
              </tr></thead><tbody>${filasResultados}</tbody></table>
            </div>

            <!-- Form inline de captura (oculto por default) -->
            <div id="formResultado-${m.muestra_id}" style="display:none;margin-top:12px;padding:12px;background:white;border:1px solid var(--line);border-radius:6px">
              <div class="grid-2" style="gap:10px">
                <div>
                  <div class="label-text">Parámetro</div>
                  <select class="select" data-fr-parametro="${m.muestra_id}">
                    <option value="">— Seleccionar —</option>
                    ${parametros.map(p => `<option value="${p.parametro_id}" data-tipo="${p.tipo_parametro}">${p.clave} — ${escapeHtml(p.nombre)}</option>`).join('')}
                  </select>
                </div>
                <div>
                  <div class="label-text">Valor</div>
                  <input class="input" data-fr-valor="${m.muestra_id}" placeholder="Valor numérico o texto"/>
                </div>
                <div style="grid-column:1 / -1">
                  <div class="label-text">Observaciones (opcional)</div>
                  <input class="input" data-fr-obs="${m.muestra_id}" maxlength="500"/>
                </div>
              </div>
              <div class="row" style="margin-top:10px;gap:6px;justify-content:flex-end">
                <button class="btn ghost"   data-cancel-resultado="${m.muestra_id}">Cancelar</button>
                <button class="btn primary" data-save-resultado="${m.muestra_id}">Guardar</button>
              </div>
            </div>
          </div>
        </div>`;
    }).join('');

    bindMuestrasActions();
    actualizarLabelToggleAll();
  }

  function actualizarLabelToggleAll() {
    const btn = $('toggleAllBtn');
    if (!btn) return;
    const cards = document.querySelectorAll('.muestra-card');
    if (!cards.length) {
      btn.style.display = 'none';
      return;
    }
    btn.style.display = '';
    const todasColapsadas = Array.from(cards).every(c => c.dataset.collapsed === 'true');
    btn.textContent = todasColapsadas ? 'Expandir todas' : 'Colapsar todas';
  }

  function setMuestraCollapsed(muestraId, collapsed) {
    const card = document.querySelector(`.muestra-card[data-muestra-id="${muestraId}"]`);
    if (!card) return;
    card.dataset.collapsed = collapsed ? 'true' : 'false';
    const body = card.querySelector('.muestra-body');
    const chev = card.querySelector('.muestra-chevron');
    if (body) body.style.display = collapsed ? 'none' : 'block';
    if (chev) chev.textContent = collapsed ? '▶' : '▼';
    sessionStorage.setItem(`lab.muestra.collapsed.${loteId}.${muestraId}`, collapsed ? '1' : '0');
    actualizarLabelToggleAll();
  }

  function bindMuestrasActions() {
    // Toggle al click en la cabecera (excepto en botones de acción).
    document.querySelectorAll('[data-toggle]').forEach(header => {
      header.addEventListener('click', (e) => {
        // Si el click viene de un botón de acción, no togglear
        if (e.target.closest('[data-stop-toggle]')) return;
        const muestraId = header.dataset.toggle;
        const card = header.closest('.muestra-card');
        const isCollapsed = card.dataset.collapsed === 'true';
        setMuestraCollapsed(muestraId, !isCollapsed);
      });
    });

    document.querySelectorAll('[data-add-resultado]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.addResultado;
        // Si la muestra está colapsada, expandir antes de mostrar el form
        setMuestraCollapsed(id, false);
        const form = document.getElementById(`formResultado-${id}`);
        form.style.display = form.style.display === 'none' ? '' : 'none';
        if (form.style.display !== 'none') form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    });
    document.querySelectorAll('[data-cancel-resultado]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        document.getElementById(`formResultado-${btn.dataset.cancelResultado}`).style.display = 'none';
      });
    });
    document.querySelectorAll('[data-save-resultado]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const muestraId = btn.dataset.saveResultado;
        const parametroId = document.querySelector(`[data-fr-parametro="${muestraId}"]`).value;
        const valorRaw    = document.querySelector(`[data-fr-valor="${muestraId}"]`).value.trim();
        const obs         = document.querySelector(`[data-fr-obs="${muestraId}"]`).value.trim();

        if (!parametroId) return KoguApi.toast('Selecciona un parámetro', 'error');
        if (!valorRaw)    return KoguApi.toast('Ingresa un valor', 'error');

        const payload = { parametro_id: parametroId, observaciones: obs || null };
        // Decide si es numérico o texto
        const num = parseFloat(valorRaw.replace(',', '.'));
        if (isFinite(num) && /^-?\d+(\.\d+)?$/.test(valorRaw.replace(',', '.'))) {
          payload.valor_numerico = num;
        } else {
          payload.valor_texto = valorRaw;
        }

        try {
          await KoguApi.apiFetch(`${BASE}/muestras/${muestraId}/resultados`, {
            method: 'POST',
            body: JSON.stringify(payload),
          });
          KoguApi.toast('Resultado capturado', 'success');
          await loadLote();
        } catch (err) {
          KoguApi.toast(err.message, 'error');
        }
      });
    });
    document.querySelectorAll('[data-del-resultado]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm('¿Eliminar este resultado?')) return;
        try {
          await KoguApi.apiFetch(`${BASE}/resultados/${btn.dataset.delResultado}`, { method: 'DELETE' });
          KoguApi.toast('Resultado eliminado', 'success');
          await loadLote();
        } catch (err) {
          KoguApi.toast(err.message, 'error');
        }
      });
    });
    document.querySelectorAll('[data-anular-muestra]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const motivo = prompt('Motivo de anulación (requerido):');
        if (!motivo) return;
        try {
          await KoguApi.apiFetch(`${BASE}/muestras/${btn.dataset.anularMuestra}/anular`, {
            method: 'POST',
            body: JSON.stringify({ motivo }),
          });
          KoguApi.toast('Muestra anulada', 'success');
          await loadLote();
        } catch (err) {
          KoguApi.toast(err.message, 'error');
        }
      });
    });
  }

  // ── Oficiales ────────────────────────────────────────────
  function renderOficiales() {
    const tbody = $('rowsOficiales');
    const oficiales = lote.oficiales || [];
    if (!oficiales.length) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--muted)">Sin resultados oficiales calculados. Haz click en "Calcular oficial".</td></tr>`;
      return;
    }
    tbody.innerHTML = oficiales.map(o => {
      const ev = EVALS[o.evaluacion] || EVALS.pendiente_eval;
      const valor = o.valor_oficial != null
        ? `${parseFloat(o.valor_oficial).toLocaleString()} ${o.unidad_simbolo || ''}`
        : (o.valor_texto || '—');
      const spec = (o.lim_min != null && o.lim_max != null)
        ? `${o.lim_min} – ${o.lim_max}`
        : (o.lim_min != null
            ? `≥ ${o.lim_min}`
            : (o.lim_max != null
                ? `≤ ${o.lim_max}`
                : (o.valor_cualitativo_esperado || '—')));
      const fecha = o.fecha_calculo ? new Date(o.fecha_calculo).toLocaleString() : '—';
      const congelado = o.congelado ? ' 🔒' : '';
      return `
        <tr>
          <td><strong>${escapeHtml(o.parametro_clave || '')}</strong> <span class="muted" style="font-size:12px">${escapeHtml(o.parametro_nombre || '')}</span></td>
          <td>${escapeHtml(o.estrategia)}${congelado}</td>
          <td>${valor}</td>
          <td>${escapeHtml(spec)} <span class="muted" style="font-size:11px">${escapeHtml(o.unidad_simbolo || '')}</span></td>
          <td><span class="chip" style="background:${ev.bg};color:${ev.color}">${ev.label}</span></td>
          <td style="font-size:12px">${escapeHtml(o.calculado_por_nombre || '—')}<br><span class="muted">${fecha}</span></td>
          <td style="text-align:right">
            ${o.congelado ? '' : `<button class="btn ghost" data-toggle-congelar="${o.resultado_oficial_id}" data-actual="${o.congelado}">Congelar</button>`}
          </td>
        </tr>`;
    }).join('');

    document.querySelectorAll('[data-toggle-congelar]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('¿Congelar este resultado oficial? Una vez congelado, no se podrá recalcular automáticamente.')) return;
        try {
          await KoguApi.apiFetch(`${BASE}/resultados-oficiales/${btn.dataset.toggleCongelar}`, {
            method: 'PATCH',
            body: JSON.stringify({ congelado: true }),
          });
          KoguApi.toast('Resultado oficial congelado', 'success');
          await loadLote();
        } catch (err) {
          KoguApi.toast(err.message, 'error');
        }
      });
    });
  }

  // ── Acciones globales ────────────────────────────────────
  $('backBtn').addEventListener('click', () => {
    window.location.href = '/modules/lab/lab-lotes.html';
  });

  $('toggleAllBtn').addEventListener('click', () => {
    const cards = document.querySelectorAll('.muestra-card');
    if (!cards.length) return;
    // Si TODAS están colapsadas → expandir; si no → colapsar todas.
    const todasColapsadas = Array.from(cards).every(c => c.dataset.collapsed === 'true');
    cards.forEach(c => setMuestraCollapsed(c.dataset.muestraId, !todasColapsadas));
    $('toggleAllBtn').textContent = todasColapsadas ? 'Colapsar todas' : 'Expandir todas';
  });

  $('addMuestraBtn').addEventListener('click', async () => {
    const lugar = prompt('Lugar de muestreo (opcional):') || null;
    try {
      await KoguApi.apiFetch(`${BASE}/lotes/${loteId}/muestras`, {
        method: 'POST',
        body: JSON.stringify({
          lugar_muestreo: lugar,
          estado: 'pendiente',
        }),
      });
      KoguApi.toast('Muestra creada', 'success');
      await loadLote();
    } catch (err) {
      KoguApi.toast(err.message, 'error');
    }
  });

  $('calcularBtn').addEventListener('click', async () => {
    const estrategia = $('estrategiaSel').value;
    if (!confirm(`¿Calcular resultados oficiales con estrategia "${estrategia}"?`)) return;
    try {
      await KoguApi.apiFetch(`${BASE}/lotes/${loteId}/calcular-oficial`, {
        method: 'POST',
        body: JSON.stringify({ estrategia }),
      });
      KoguApi.toast('Resultados oficiales calculados', 'success');
      await loadLote();
    } catch (err) {
      KoguApi.toast(err.message, 'error');
    }
  });

  // Refresh al cambiar empresa activa: regresa a la lista
  KoguShell.subscribeEmpresaActivaChange(() => {
    window.location.href = '/modules/lab/lab-lotes.html';
  });

  // ── Helpers ──────────────────────────────────────────────
  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, m => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    })[m]);
  }

  // ── Reporte de Inspección de Compras (G.1) — lazy load ──
  // Solo aplica si lote.origen='compra'. El card se muestra/oculta
  // en loadLote(). Resumen visible incluso colapsado si hay reporte.
  const RI_DECISION = {
    borrador:                 { label: 'Borrador',           color: '#94a3b8' },
    emitido:                  { label: 'Emitido',            color: '#3b82f6' },
    aceptado:                 { label: '✓ Aceptado',         color: '#16a34a' },
    aceptado_con_observacion: { label: '⚠ Aceptado c/obs',   color: '#f59e0b' },
    rechazado:                { label: '✗ Rechazado',        color: '#dc2626' },
  };
  let reporteInspCargado = false;

  async function cargarReporteInspeccion() {
    const body = $('reporteInspBody');
    body.innerHTML = '<div class="muted" style="text-align:center;padding:20px">Cargando reporte…</div>';
    try {
      // Filtro por lote_compra_id; idealmente 1 resultado (D.3 del kickoff)
      const params = new URLSearchParams({
        lote_compra_id: loteId,
        pageSize: '5',
      });
      const res = await KoguApi.apiFetch(`${BASE}/reportes-inspeccion?${params.toString()}`);
      const reportes = KoguApi.unwrapData(res) || [];
      reporteInspCargado = true;

      if (!reportes.length) {
        body.innerHTML = `
          <div class="muted" style="text-align:center;padding:24px;font-size:13px">
            Este lote (origen <strong>compra</strong>) aún no tiene reporte de inspección.<br/>
            Crea uno desde <a href="/modules/lab/lab-imp-compras.html">Inspección de Compras</a> tras seleccionar la fila.
          </div>`;
        $('reporteInspResumen').textContent = 'Sin reporte';
        return;
      }

      // Resumen en cabecera colapsada
      const r = reportes[0];
      const dec = RI_DECISION[r.decision] || { label: r.decision, color: '#64748b' };
      $('reporteInspResumen').innerHTML =
        `<span style="font-family:monospace">${escapeHtml(r.folio_reporte)}</span>` +
        ` <span class="chip" style="background:${dec.color}22;color:${dec.color};font-size:11px;margin-left:6px">${dec.label}</span>`;

      // Body con detalle
      body.innerHTML = reportes.map(r => filaReporteInsp(r)).join('');
      body.querySelectorAll('a[data-ri-id]').forEach(a => {
        // ya tienen href propio, no hace falta listener
      });
    } catch (err) {
      body.innerHTML = `<div style="padding:20px;text-align:center;color:#dc2626">Error: ${escapeHtml(err.message)}</div>`;
    }
  }

  function filaReporteInsp(r) {
    const dec = RI_DECISION[r.decision] || { label: r.decision, color: '#64748b' };
    const fecha = r.fecha_inspeccion ? new Date(r.fecha_inspeccion).toLocaleString() : '—';
    const noCumple = parseInt(r.parametros_no_cumple || 0, 10);
    const total = parseInt(r.parametros_count || 0, 10);
    const okCumple = total - noCumple;
    const paramsBlock = total
      ? `<span class="chip" style="background:#dcfce7;color:#166534;font-size:11px">${okCumple} cumplen</span>` +
        (noCumple ? ` <span class="chip" style="background:#fee2e2;color:#991b1b;font-size:11px">${noCumple} no cumplen</span>` : '') +
        ` <span class="muted" style="font-size:11px">de ${total} parámetros</span>`
      : '<span class="muted" style="font-size:11px">Sin parámetros capturados</span>';
    const ncBlock = r.nc_id
      ? `<div style="margin-top:8px;padding:8px 10px;background:#fee2e2;border:1px solid #fca5a5;border-radius:6px;font-size:12px;color:#991b1b">
           ⚠ <strong>NC vinculada:</strong>
           <a href="/modules/lab/lab-nc-detalle.html?id=${r.nc_id}"
              style="font-family:monospace;color:#991b1b">${escapeHtml(r.folio_nc || '—')}</a>
           <span class="chip" style="background:#fff;color:#991b1b;font-size:10px;margin-left:6px">${escapeHtml(r.nc_status || '—')}</span>
         </div>`
      : '';
    return `
      <div style="border:1px solid var(--line);border-radius:8px;padding:14px;background:#fafbfc">
        <div class="row">
          <div>
            <strong style="font-family:monospace">${escapeHtml(r.folio_reporte)}</strong>
            <span class="chip" style="background:${dec.color}22;color:${dec.color};margin-left:8px">${dec.label}</span>
          </div>
          <a class="btn ghost" href="/modules/lab/lab-reporte-inspeccion-detalle.html?id=${r.reporte_inspeccion_id}" data-ri-id="${r.reporte_inspeccion_id}">Abrir</a>
        </div>
        <div class="grid-2" style="margin-top:10px;gap:8px;font-size:13px">
          <div><strong>Inspector:</strong> ${escapeHtml(r.inspector_nombre || '—')}</div>
          <div><strong>Supervisor:</strong> ${escapeHtml(r.supervisor_nombre || '—')}</div>
          <div><strong>Fecha:</strong> ${fecha}</div>
          <div><strong>CofA:</strong> ${r.cert_folio_interno
            ? `<a href="/modules/lab/lab-cert-proveedor-detalle.html?id=${r.certificado_proveedor_id}" style="font-family:monospace">${escapeHtml(r.cert_folio_interno)}</a>`
            : '<span class="muted">—</span>'}</div>
          <div style="grid-column:1/-1"><strong>Parámetros:</strong> ${paramsBlock}</div>
          ${r.motivo_decision ? `<div style="grid-column:1/-1"><strong>Motivo:</strong> <span class="muted">${escapeHtml(r.motivo_decision)}</span></div>` : ''}
        </div>
        ${ncBlock}
      </div>`;
  }

  $('reporteInspHeader').addEventListener('click', async () => {
    const body = $('reporteInspBody');
    const chev = $('reporteInspChevron');
    const expanded = body.style.display !== 'none';
    if (expanded) {
      body.style.display = 'none';
      chev.textContent = '▶';
    } else {
      body.style.display = 'block';
      chev.textContent = '▼';
      if (!reporteInspCargado) await cargarReporteInspeccion();
    }
  });

  // ── NCs asociadas (no conformidades) — lazy load ─────────
  const NC_STATUS = {
    abierta:     { label: 'Abierta',     color: '#f59e0b' },
    en_analisis: { label: 'En análisis', color: '#3b82f6' },
    con_capa:    { label: 'Con CAPA',    color: '#8b5cf6' },
    cerrada:     { label: 'Cerrada',     color: '#16a34a' },
    anulada:     { label: 'Anulada',     color: '#94a3b8' },
  };
  const NC_ORIGENES = {
    resultado:         'Resultado fuera spec',
    excepcion:         'Excepción aprobada',
    rechazo:           'Rechazo de lote',
    queja_cliente:     'Queja de cliente',
    inspeccion_compra: 'Inspección de compra',
    auditoria:         'Auditoría',
  };
  let ncCargadas = false;

  function fmtDateNc(v) {
    if (!v) return '';
    const s = String(v);
    const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : s;
  }

  async function cargarNcs() {
    const body = $('ncBody');
    body.innerHTML = '<div class="muted" style="text-align:center;padding:20px">Cargando NCs…</div>';
    try {
      const params = new URLSearchParams({
        lote_id: loteId,
        pageSize: '50',
      });
      const res = await KoguApi.apiFetch(`${BASE}/nc?${params.toString()}`);
      const ncs = KoguApi.unwrapData(res) || [];
      ncCargadas = true;

      if (!ncs.length) {
        body.innerHTML = `
          <div class="muted" style="text-align:center;padding:24px;font-size:13px">
            Este lote no tiene No Conformidades asociadas.<br/>
            Se generan automáticamente al rechazar el lote o aprobar una excepción,
            o pueden crearse manualmente desde el módulo de NC/CAPA.
          </div>`;
        $('ncResumen').textContent = '0 NCs';
        return;
      }

      const abiertas = ncs.filter(n => n.status !== 'cerrada' && n.status !== 'anulada').length;
      $('ncResumen').innerHTML = abiertas
        ? `<strong style="color:#dc2626">${abiertas} abierta${abiertas === 1 ? '' : 's'}</strong> · ${ncs.length} total`
        : `${ncs.length} NC${ncs.length === 1 ? '' : 's'} (todas cerradas o anuladas)`;

      body.innerHTML = `
        <div class="table-wrap">
          <table style="font-size:13px">
            <thead><tr>
              <th>Folio</th>
              <th>Origen</th>
              <th>Descripción</th>
              <th>Responsable</th>
              <th>Apertura</th>
              <th>CAPAs</th>
              <th>Estado</th>
              <th></th>
            </tr></thead>
            <tbody>${ncs.map(filaNc).join('')}</tbody>
          </table>
        </div>`;
      body.querySelectorAll('[data-nc-id]').forEach(btn => btn.addEventListener('click', () => {
        window.location.href = `/modules/lab/lab-nc-detalle.html?id=${btn.dataset.ncId}`;
      }));
    } catch (err) {
      body.innerHTML = `<div style="padding:20px;text-align:center;color:#dc2626">Error: ${escapeHtml(err.message)}</div>`;
    }
  }

  function filaNc(n) {
    const st   = NC_STATUS[n.status]    || { label: n.status, color: '#64748b' };
    const orig = NC_ORIGENES[n.origen]  || n.origen;
    const fecha = fmtDateNc(n.fecha_apertura);
    const desc  = String(n.descripcion || '');
    const descCorta = desc.length > 80 ? desc.slice(0, 80) + '…' : desc;
    const capas = (n.capas_count || 0) > 0
      ? `<span class="chip" style="background:#e0f2fe;color:#075985">${n.capas_eficaces || 0}/${n.capas_count}</span>`
      : '<span class="muted">—</span>';
    return `
      <tr>
        <td><strong style="font-family:monospace">${escapeHtml(n.folio_nc)}</strong></td>
        <td>${escapeHtml(orig)}</td>
        <td title="${escapeHtml(desc)}">${escapeHtml(descCorta)}</td>
        <td>${escapeHtml(n.responsable_nombre || '—')}</td>
        <td style="font-size:12px">${fecha || '—'}</td>
        <td>${capas}</td>
        <td><span class="chip" style="background:${st.color}22;color:${st.color}">${st.label}</span></td>
        <td style="text-align:right">
          <button class="btn ghost" data-nc-id="${n.nc_id}">Abrir</button>
        </td>
      </tr>`;
  }

  $('ncHeader').addEventListener('click', async () => {
    const body = $('ncBody');
    const chev = $('ncChevron');
    const expanded = body.style.display !== 'none';
    if (expanded) {
      body.style.display = 'none';
      chev.textContent = '▶';
    } else {
      body.style.display = 'block';
      chev.textContent = '▼';
      if (!ncCargadas) await cargarNcs();
    }
  });

  // ── Bitácora (historial de eventos) — lazy load ──────────
  const ACCION_LABELS = {
    cambiar_estado:         { label: 'Cambio de estado',       color: '#f59e0b' },
    crear:                  { label: 'Creación',               color: '#16a34a' },
    actualizar:             { label: 'Actualización',          color: '#3b82f6' },
    liberar:                { label: 'Liberación a cliente',   color: '#16a34a' },
    anular_liberacion:      { label: 'Anular liberación',      color: '#dc2626' },
    reemplazar_liberacion:  { label: 'Reemplazar liberación',  color: '#9333ea' },
    aprobar_excepcion:      { label: 'Aprobar excepción',      color: '#f97316' },
    rechazar:               { label: 'Rechazo',                color: '#dc2626' },
    emitir_coa:             { label: 'Emisión de COA',         color: '#0ea5e9' },
    anular_coa:             { label: 'Anular COA',             color: '#dc2626' },
    sustituir_coa:          { label: 'Sustituir COA',          color: '#9333ea' },
    firmar:                 { label: 'Firma electrónica',      color: '#3b82f6' },
    importar:               { label: 'Importación',            color: '#64748b' },
    procesar:               { label: 'Procesamiento',          color: '#64748b' },
    calibrar:               { label: 'Calibración',            color: '#64748b' },
    ajustar_reactivo:       { label: 'Ajuste de reactivo',     color: '#64748b' },
    otro:                   { label: 'Otro',                   color: '#64748b' },
  };
  let bitacoraCargada = false;

  async function cargarBitacora() {
    const body = $('bitacoraBody');
    body.innerHTML = '<div class="muted" style="text-align:center;padding:20px">Cargando historial…</div>';
    try {
      // Filtramos por entidad=lote y entidad_id=lote actual.
      // Adicionalmente, podemos traer eventos de las liberaciones de este lote,
      // pero por ahora nos quedamos con lo directo del lote para mantenerlo simple.
      const params = new URLSearchParams({
        entidad:    'lote',
        entidad_id: loteId,
        pageSize:   '100',
      });
      const res = await KoguApi.apiFetch(`${BASE}/bitacora?${params.toString()}`);
      const eventos = KoguApi.unwrapData(res) || [];
      bitacoraCargada = true;

      if (!eventos.length) {
        body.innerHTML = `
          <div class="muted" style="text-align:center;padding:24px;font-size:13px">
            Sin eventos registrados para este lote todavía.<br/>
            Los cambios de estado, liberaciones, anulaciones y emisiones de COA aparecerán aquí.
          </div>`;
        $('bitacoraResumen').textContent = '0 eventos';
        return;
      }

      $('bitacoraResumen').textContent = `${eventos.length} evento${eventos.length === 1 ? '' : 's'}`;
      body.innerHTML = `
        <div class="table-wrap">
          <table>
            <thead><tr>
              <th style="width:160px">Cuándo</th>
              <th>Acción</th>
              <th>Usuario</th>
              <th>Detalle</th>
            </tr></thead>
            <tbody>
              ${eventos.map(filaBitacora).join('')}
            </tbody>
          </table>
        </div>`;
    } catch (err) {
      body.innerHTML = `<div style="padding:20px;text-align:center;color:#dc2626">Error: ${escapeHtml(err.message)}</div>`;
    }
  }

  function filaBitacora(ev) {
    const acc = ACCION_LABELS[ev.accion] || { label: ev.accion, color: '#64748b' };
    const fecha = ev.ts_utc ? new Date(ev.ts_utc).toLocaleString() : '—';
    let detalleHtml = '<span class="muted">—</span>';
    const antes = ev.datos_antes;
    const despues = ev.datos_despues;
    if (antes || despues) {
      const pares = [];
      if (antes && despues) {
        // Diff: claves que existen en ambos
        for (const k of Object.keys(despues)) {
          const valA = antes[k];
          const valD = despues[k];
          if (valA !== undefined && JSON.stringify(valA) !== JSON.stringify(valD)) {
            pares.push(`<strong>${escapeHtml(k)}:</strong> <span style="color:#dc2626;text-decoration:line-through">${escapeHtml(String(valA))}</span> → <span style="color:#16a34a">${escapeHtml(String(valD))}</span>`);
          } else if (valA === undefined) {
            pares.push(`<strong>${escapeHtml(k)}:</strong> ${escapeHtml(formatVal(valD))}`);
          }
        }
      } else if (despues) {
        for (const k of Object.keys(despues)) {
          pares.push(`<strong>${escapeHtml(k)}:</strong> ${escapeHtml(formatVal(despues[k]))}`);
        }
      }
      if (pares.length) detalleHtml = pares.join('<br>');
    }
    if (ev.comentario) {
      detalleHtml += (detalleHtml === '<span class="muted">—</span>' ? '' : '<br>')
                  + `<span class="muted" style="font-size:12px">${escapeHtml(ev.comentario)}</span>`;
    }
    return `
      <tr>
        <td style="font-size:12px;white-space:nowrap">${fecha}<br>
          <span class="muted" style="font-size:11px">${escapeHtml(ev.modulo || '')}</span>
        </td>
        <td><span class="chip" style="background:${acc.color}22;color:${acc.color}">${acc.label}</span></td>
        <td>${escapeHtml(ev.usuario_nombre || '—')}<br><span class="muted" style="font-size:11px">${escapeHtml(ev.usuario_email || '')}</span></td>
        <td style="font-size:13px">${detalleHtml}</td>
      </tr>`;
  }
  function formatVal(v) {
    if (v == null) return '—';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }

  $('bitacoraHeader').addEventListener('click', async () => {
    const body = $('bitacoraBody');
    const chev = $('bitacoraChevron');
    const expanded = body.style.display !== 'none';
    if (expanded) {
      body.style.display = 'none';
      chev.textContent = '▶';
    } else {
      body.style.display = 'block';
      chev.textContent = '▼';
      if (!bitacoraCargada) await cargarBitacora();
    }
  });

  // ── Arranque ─────────────────────────────────────────────
  await loadParametros();
  await loadLote();
});

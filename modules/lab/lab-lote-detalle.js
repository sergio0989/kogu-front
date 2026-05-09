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
    <button class="btn primary" id="addMuestraBtn">Nueva muestra</button>
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
    } catch (err) {
      KoguApi.toast(err.message, 'error');
      $('loteHeader').innerHTML = `<div style="text-align:center;padding:20px;color:var(--danger)">No se pudo cargar el lote.</div>`;
    }
  }

  // ── Header del lote ──────────────────────────────────────
  function renderHeader() {
    if (!lote) return;
    const estado = ESTADOS_LOTE.find(s => s.code === lote.estado_calidad) || { label: lote.estado_calidad, color: '#64748b' };
    const fecha = lote.fecha_evento ? new Date(lote.fecha_evento).toLocaleDateString() : '—';
    const cantidad = lote.cantidad
      ? `${parseFloat(lote.cantidad).toLocaleString()} ${lote.unidad_simbolo || ''}`
      : '—';
    $('loteHeader').innerHTML = `
      <div class="row">
        <div>
          <div class="eyebrow">Lote #${escapeHtml(lote.numero_lote)}</div>
          <h2>${escapeHtml(lote.cve_prod || '')} — ${escapeHtml(lote.desc_prod || '')}</h2>
        </div>
        <span class="chip" style="background:${estado.color}22;color:${estado.color};font-size:14px;padding:6px 12px">${estado.label}</span>
      </div>
      <div class="grid-2" style="margin-top:16px;gap:10px;font-size:14px">
        <div><strong>Origen:</strong> ${escapeHtml(lote.origen)}</div>
        <div><strong>Fecha del evento:</strong> ${fecha}</div>
        <div><strong>Cantidad:</strong> ${cantidad}</div>
        <div><strong>Referencia externa:</strong> ${escapeHtml(lote.referencia_externa || '—')}</div>
        ${lote.proveedor_nombre ? `<div><strong>Proveedor:</strong> ${escapeHtml(lote.proveedor_nombre)}</div>` : ''}
        <div>
          <strong>Cambiar estado:</strong>
          <select class="select" id="estadoEdit" style="display:inline-block;width:auto;margin-left:6px">
            ${ESTADOS_LOTE.map(s => `<option value="${s.code}" ${s.code === lote.estado_calidad ? 'selected' : ''}>${s.label}</option>`).join('')}
          </select>
        </div>
      </div>
      ${lote.observaciones ? `<div style="margin-top:12px;padding:10px;background:var(--muted-bg, #f1f5f9);border-radius:6px;font-size:13px"><strong>Observaciones:</strong> ${escapeHtml(lote.observaciones)}</div>` : ''}
    `;

    // Cambio de estado
    $('estadoEdit').addEventListener('change', async (e) => {
      const nuevoEstado = e.target.value;
      if (nuevoEstado === lote.estado_calidad) return;
      try {
        await KoguApi.apiFetch(`${BASE}/lotes/${loteId}`, {
          method: 'PATCH',
          body: JSON.stringify({ estado_calidad: nuevoEstado }),
        });
        KoguApi.toast(`Estado cambiado a ${nuevoEstado}`, 'success');
        await loadLote();
      } catch (err) {
        KoguApi.toast(err.message, 'error');
        e.target.value = lote.estado_calidad;
      }
    });
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

      return `
        <div style="border:1px solid var(--line);border-radius:8px;padding:14px;background:#fafbfc">
          <div class="row">
            <div>
              <strong>Muestra #${m.numero_muestra}</strong>
              <span class="chip" style="background:${estado.color}22;color:${estado.color};margin-left:8px">${estado.label}</span>
              ${m.identificador_envase ? `<span class="muted" style="margin-left:8px">${escapeHtml(m.identificador_envase)}</span>` : ''}
            </div>
            <div style="display:flex;gap:6px">
              ${m.estado !== 'anulada' ? `
                <button class="btn primary ghost" data-add-resultado="${m.muestra_id}">+ Resultado</button>
                <button class="btn ghost danger" data-anular-muestra="${m.muestra_id}">Anular</button>
              ` : ''}
            </div>
          </div>
          <div style="margin-top:6px;font-size:13px;color:var(--muted)">
            ${escapeHtml(m.lugar_muestreo || '')} · ${fechaMuestreo}
            ${m.persona_muestreo_nombre ? `· por ${escapeHtml(m.persona_muestreo_nombre)}` : ''}
          </div>
          ${m.motivo_anulacion ? `<div style="margin-top:6px;font-size:13px;color:var(--danger)"><strong>Anulación:</strong> ${escapeHtml(m.motivo_anulacion)}</div>` : ''}

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
        </div>`;
    }).join('');

    bindMuestrasActions();
  }

  function bindMuestrasActions() {
    document.querySelectorAll('[data-add-resultado]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.addResultado;
        const form = document.getElementById(`formResultado-${id}`);
        form.style.display = form.style.display === 'none' ? '' : 'none';
      });
    });
    document.querySelectorAll('[data-cancel-resultado]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.getElementById(`formResultado-${btn.dataset.cancelResultado}`).style.display = 'none';
      });
    });
    document.querySelectorAll('[data-save-resultado]').forEach(btn => {
      btn.addEventListener('click', async () => {
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
      btn.addEventListener('click', async () => {
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
      btn.addEventListener('click', async () => {
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

  // ── Arranque ─────────────────────────────────────────────
  await loadParametros();
  await loadLote();
});

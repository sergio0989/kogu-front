document.addEventListener('DOMContentLoaded', async () => {
  const b = await KoguShell.initShell({
    currentPage: '/modules/cfdi/bandeja/bandeja.html',
    title: 'Bandeja CFDI',
    description: 'Exploración operativa de comprobantes por empresa activa, con paginación, exportación, incidencias EFOS y descarga.',
    requiredPermission: 'screen.cfdi.sat_dm'
  });
  if (!b) return;

  const c = document.getElementById('pageContent');
  c.innerHTML = `
    <div class="stack">
      <div class="card">
        <div class="row">
          <div>
            <div class="eyebrow">Exploración operativa</div>
            <h2>Bandeja CFDI</h2>
          </div>
          <div class="page-actions">
            <button class="btn primary" id="applyBtn">Aplicar</button>
            <button class="btn" id="clearBtn">Limpiar filtros</button>
            <button class="btn" id="refreshSatTodosBtn">Actualizar SAT todos</button>
            <button class="btn" id="zipXmlPdfTodosBtn">ZIP XML + PDF todos</button>
            <button class="btn" id="exportBtn" title="Elegir tipo de reporte">Exportar Excel ▾</button>
          </div>
        </div>

        <div class="grid-4" style="margin-top:16px">
          <div>
            <div class="label-text">UUID</div>
            <input class="input" id="uuid" placeholder="UUID">
          </div>
          <div>
            <div class="label-text">RFC emisor / receptor</div>
            <input class="input" id="rfc" placeholder="RFC emisor/receptor">
          </div>
          <div>
            <div class="label-text">Estatus SAT</div>
            <select class="select" id="estatus_sat">
              <option value="">Todos</option>
              <option value="VIGENTE">VIGENTE</option>
              <option value="CANCELADO">CANCELADO</option>
            </select>
          </div>
          <div>
            <div class="label-text">Método de pago</div>
            <select class="select" id="metodo_pago">
              <option value="">Todos</option>
              <option value="PUE">PUE</option>
              <option value="PPD">PPD</option>
            </select>
          </div>
        </div>

        <div class="grid-4" style="margin-top:16px">
          <div>
            <div class="label-text">Fecha inicial</div>
            <input class="input" id="date_from" type="date">
          </div>
          <div>
            <div class="label-text">Fecha final</div>
            <input class="input" id="date_to" type="date">
          </div>
          <div>
            <div class="label-text">Scope</div>
            <select class="select" id="scope">
              <option value="todos">Todos</option>
              <option value="emitidos">Emitidos</option>
              <option value="recibidos" selected>Recibidos</option>
            </select>
          </div>
          <div>
            <div class="label-text">Tipo comprobante</div>
            <select class="select" id="tipo_comprobante">
              <option value="">Todos</option>
              <option value="I">Ingreso</option>
              <option value="E">Egreso</option>
              <option value="T">Traslado</option>
              <option value="N">Nómina</option>
              <option value="P">Pago</option>
            </select>
          </div>
        </div>

        <div class="row" style="margin-top:16px">
          <div class="hero-note" id="summaryBox">Cargando bandeja…</div>
          <div class="page-actions">
            <select class="select" id="pageSize" style="min-width:120px">
              <option value="25">25</option>
              <option value="50" selected>50</option>
              <option value="100">100</option>
            </select>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="row">
          <div>
            <div class="eyebrow">Bloque adicional</div>
            <h2>Incidencias / EFOS</h2>
            <p class="muted" style="margin-top:6px">Vista operativa para riesgo fiscal sin abandonar la portada principal.</p>
          </div>
          <div class="page-actions" id="incTabs">
            <button class="btn primary inc-tab" data-tab="todos">Todos</button>
            <button class="btn inc-tab" data-tab="efos">Solo EFOS</button>
            <button class="btn inc-tab" data-tab="observados">Observados</button>
            <button class="btn inc-tab" data-tab="alta_severidad">Alta severidad</button>
            <button class="btn inc-tab" data-tab="sin_validacion">Sin validación</button>
          </div>
        </div>

        <div class="grid-4" style="margin-top:16px" id="incSummary"></div>

        <div class="hero-note" id="incMessage" style="margin-top:16px">Cargando incidencias…</div>

        <div class="table-wrap" style="margin-top:16px">
          <table>
            <thead>
              <tr>
                <th>UUID</th>
                <th>Fecha</th>
                <th>Tercero</th>
                <th>Severidad</th>
                <th>EFOS</th>
                <th>Motivo</th>
                <th>Acción sugerida</th>
                <th>Detalle</th>
              </tr>
            </thead>
            <tbody id="incRows"></tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>UUID</th>
                <th>Primer concepto</th>
                <th>Fecha</th>
                <th>Origen / Tipo</th>
                <th>Emisor</th>
                <th>Receptor</th>
                <th>Relaciones</th>
                <th>Cancelabilidad</th>
                <th>Método</th>
                <th>Estatus SAT</th>
                <th>Total</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody id="rows"></tbody>
          </table>
        </div>

        <div class="row" style="margin-top:16px">
          <div id="pageInfo" class="muted">Página 1</div>
          <div class="page-actions">
            <button class="btn" id="prevBtn">Anterior</button>
            <button class="btn" id="nextBtn">Siguiente</button>
          </div>
        </div>
      </div>
    </div>
  `;

  // Visibilidad de Nómina: si el perfil no tiene cfdi.tipo.nomina.read, se
  // oculta la opción "Nómina" del filtro de tipo de comprobante. Es cosmético:
  // el backend ya excluye los CFDI tipo 'N' server-side para estos perfiles.
  const puedeVerNomina = KoguShell.hasPerm(b, 'cfdi.tipo.nomina.read');
  if (!puedeVerNomina) {
    document.querySelector('#tipo_comprobante option[value="N"]')?.remove();
  }

  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);

  function resetFilters() {
    document.getElementById('uuid').value = '';
    document.getElementById('rfc').value = '';
    document.getElementById('estatus_sat').value = '';
    document.getElementById('metodo_pago').value = '';
    document.getElementById('date_from').value = start.toISOString().slice(0, 10);
    document.getElementById('date_to').value = now.toISOString().slice(0, 10);
    document.getElementById('scope').value = 'recibidos';
    document.getElementById('tipo_comprobante').value = '';
  }

  resetFilters();

  const state = {
    page: 1,
    limit: 50,
    total: 0,
    items: [],
    incTab: 'todos',
    incData: { total: 0, resumen: {}, items: [] }
  };

  function safeNumber(v) {
    const n = Number(v || 0);
    return Number.isFinite(n) ? n : 0;
  }

  function fmtShortDate(value) {
    if (!value) return '-';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString('es-MX');
  }

  function fmtDateTime(value) {
    if (!value) return '-';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString('es-MX', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function origenConsultaLabel(value) {
    const v = String(value || '').trim().toLowerCase();
    const map = {
      manual_detalle: 'Manual detalle',
      manual_bandeja_batch: 'Bandeja masiva',
      auto_missing_batch: 'Auto faltantes',
      post_proceso_zip: 'Post proceso ZIP'
    };
    return map[v] || (value ? String(value) : '-');
  }

  function currentFilters() {
    return {
      uuid: document.getElementById('uuid').value.trim(),
      rfc: document.getElementById('rfc').value.trim(),
      estatus_sat: document.getElementById('estatus_sat').value,
      date_from: document.getElementById('date_from').value,
      date_to: document.getElementById('date_to').value,
      metodo_pago: document.getElementById('metodo_pago').value,
      scope: document.getElementById('scope').value,
      tipo_comprobante: document.getElementById('tipo_comprobante').value,
      limit: state.limit,
      offset: (state.page - 1) * state.limit
    };
  }

  function currentIncFilters() {
    const f = currentFilters();
    delete f.limit;
    delete f.offset;
    f.tab = state.incTab;
    return f;
  }

  function tipoBadge(tipo) {
    const value = String(tipo || '').toUpperCase();
    const map = {
      I: 'Ingreso',
      E: 'Egreso',
      T: 'Traslado',
      N: 'Nómina',
      P: 'Pago'
    };
    return `<span class="chip">${KoguUi.escapeHtml(map[value] || value || '-')}</span>`;
  }

  function buildOrigenTipoCell(row) {
    return `
      <div class="stack" style="gap:8px">
        <div><strong>${KoguUi.escapeHtml(row.origen || '-')}</strong></div>
        <div>${tipoBadge(row.tipo_comprobante || row.tipo_cfdi || '-')}</div>
      </div>
    `;
  }

  function cancelBadge(row) {
    const text =
      row.sat_cancelacion_ui ||
      row.cancelabilidad_ui ||
      row.es_cancelable ||
      row.estatus_cancelacion ||
      '-';

    let cls = 'chip';
    if (/no cancelable/i.test(text)) cls += ' danger';
    else if (/sin aceptación|sin aceptacion/i.test(text)) cls += ' warn';
    else if (/con aceptación|con aceptacion/i.test(text)) cls += ' success';

    return `<span class="${cls}">${KoguUi.escapeHtml(text)}</span>`;
  }

  function relationsBadge(row) {
    const count = Number(row.cantidad_relaciones || row.relaciones_count || 0);
    const tiene = !!row.tiene_relacion || !!row.tiene_relaciones || count > 0;

    if (!tiene) {
      return '<span class="chip">Sin relaciones</span>';
    }

    const tipos = Array.isArray(row.tipos_relacion)
      ? row.tipos_relacion
      : Array.isArray(row.tipos_relaciones)
        ? row.tipos_relaciones
        : [];

    const detail = tipos.length ? ` · ${tipos.join(', ')}` : '';
    return `<span class="chip success">Sí · ${count}${KoguUi.escapeHtml(detail)}</span>`;
  }

  function severityBadge(text) {
    const t = String(text || '-');
    let cls = 'chip';
    if (/alta/i.test(t)) cls += ' danger';
    else if (/media|observ/i.test(t)) cls += ' warn';
    else if (/baja/i.test(t)) cls += ' success';
    return `<span class="${cls}">${KoguUi.escapeHtml(t)}</span>`;
  }

  function buildUuidCell(row) {
    const serie = row.serie || '-';
    const folio = row.folio || '-';
    return `
      <div class="uuid-cell">
        <div class="mono">${KoguUi.escapeHtml(row.uuid || '')}</div>
        <div class="muted">Serie: ${KoguUi.escapeHtml(String(serie))}</div>
        <div class="muted">Folio: ${KoguUi.escapeHtml(String(folio))}</div>
      </div>
    `;
  }

  function buildPrimerConceptoCell(row) {
    const text =
      row.primer_concepto_descripcion ||
      row.primerConceptoDescripcion ||
      '-';

    return `
      <div class="primer-concepto-cell" title="${KoguUi.escapeHtml(String(text))}">
        ${KoguUi.escapeHtml(String(text))}
      </div>
    `;
  }

  function buildMontoCell(row) {
    const subtotal = safeNumber(row.subtotal || row.subtotal_monto || row.subtotal_total);
    const tras = safeNumber(row.impuestos_trasladados || row.impuestos_tras || row.traslados || row.impuestos_tras_total);
    const ret = safeNumber(row.impuestos_retenidos || row.impuestos_ret || row.retenidos || row.impuestos_ret_total);
    const total = safeNumber(row.total || row.total_monto || row.monto_total);
    const moneda = row.moneda ? ` ${String(row.moneda).toUpperCase()}` : '';
    const tipoCambio = safeNumber(row.tipo_cambio);

    return `
      <div class="monto-stack">
        <div><strong>Subtotal:</strong> ${KoguUi.money(subtotal)}${moneda}</div>
        <div><strong>Traslados:</strong> ${KoguUi.money(tras)}${moneda}</div>
        <div><strong>Retenidos:</strong> ${KoguUi.money(ret)}${moneda}</div>
        <div><strong>Total:</strong> ${KoguUi.money(total)}${moneda}</div>
        ${String(row.moneda || '').toUpperCase() === 'USD' && tipoCambio > 0 ? `<div><strong>TC:</strong> ${tipoCambio.toFixed(4)}</div>` : ''}
      </div>
    `;
  }

  function buildSatStatusCell(row) {
    const status = row.estatus_sat || '-';
    const ultimaConsulta = row.fecha_ultima_consulta_sat || row.sat_consultado_en || row.sat_consultado_fecha || row.sat_status_created_at || null;
    const origenConsulta = row.origen_consulta || null;

    return `
      <div class="status-stack">
        ${KoguUi.statusBadge(status)}
        <div class="muted">${fmtShortDate(ultimaConsulta)}</div>
        <div class="muted">${KoguUi.escapeHtml(origenConsultaLabel(origenConsulta))}</div>
      </div>
    `;
  }

  async function downloadFile(path, filename) {
    const response = await KoguApi.authFetchRaw(path, {
      method: 'GET',
      headers: { Accept: 'application/xml, application/json, application/octet-stream, */*' }
    });

    if (!response.ok) {
      let message = 'No fue posible descargar el archivo';
      try {
        const err = await response.json();
        message = err?.error?.message || err?.message || message;
      } catch (_e) {}
      throw new Error(message);
    }

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  }

  async function openPdfFile(uuid) {
    const response = await KoguApi.authFetchRaw(
      `/cfdi/protected/cfdi/facturas/${encodeURIComponent(uuid)}/pdf`,
      {
        method: 'GET',
        headers: { Accept: 'application/pdf, application/octet-stream, */*' }
      }
    );

    if (!response.ok) {
      let message = 'No fue posible abrir el PDF oficial';
      try {
        const err = await response.clone().json();
        message = err?.error?.message || err?.message || message;
      } catch (_e) {}
      throw new Error(message);
    }

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    window.open(objectUrl, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
  }

  function extractFileNameFromDisposition(disposition, fallbackName) {
    if (!disposition) return fallbackName;
    const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
    if (utf8Match?.[1]) {
      try {
        return decodeURIComponent(utf8Match[1]);
      } catch (_e) {
        return utf8Match[1];
      }
    }

    const basicMatch = disposition.match(/filename="?([^"]+)"?/i);
    if (basicMatch?.[1]) return basicMatch[1];
    return fallbackName;
  }

  async function refreshSatStatus(row) {
    const cfdiId = row?.cfdi_id;
    if (!cfdiId) {
      throw new Error('No se encontró cfdi_id para actualizar estatus SAT.');
    }

    await KoguApi.apiFetch(
      `/cfdi/protected/cfdi/facturas/${encodeURIComponent(cfdiId)}/refresh-sat-status`,
      { method: 'POST' }
    );
  }


  async function getCfdiIdsTodos() {
    const filters = currentFilters();
    delete filters.limit;
    delete filters.offset;

    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== '' && v != null))
    ).toString();

    const res = await KoguApi.apiFetch(
      `/cfdi/protected/cfdi/facturas/ids${qs ? '?' + qs : ''}`
    );
    const data = KoguApi.unwrapData(res) || {};
    const cfdiIds = data.cfdiIds || [];
    if (!cfdiIds.length) throw new Error('No hay CFDI con los filtros aplicados.');
    return cfdiIds;
  }

  async function refreshSatTodos() {
    const cfdiIds = await getCfdiIdsTodos();

    const res = await KoguApi.apiFetch('/cfdi/protected/cfdi/facturas/refresh-sat-status-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cfdiIds })
    });

    return KoguApi.unwrapData(res) || {};
  }

  async function downloadZipXmlPdfTodos() {
    const cfdiIds = await getCfdiIdsTodos();

    const response = await KoguApi.authFetchRaw('/cfdi/protected/cfdi/facturas/zip-xml-pdf-batch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/zip, application/octet-stream, application/json, */*'
      },
      body: JSON.stringify({ cfdiIds })
    });

    if (!response.ok) {
      let message = 'No fue posible generar el ZIP XML + PDF (todos).';
      try {
        const err = await response.clone().json();
        message = err?.error?.message || err?.message || message;
      } catch (_e) {}
      throw new Error(message);
    }

    const blob = await response.blob();
    const fileName = extractFileNameFromDisposition(
      response.headers.get('content-disposition'),
      `cfdi_xml_pdf_todos_${new Date().toISOString().slice(0, 10)}.zip`
    );

    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  }

  function renderIncTabs() {
    document.querySelectorAll('.inc-tab').forEach(btn => {
      btn.classList.toggle('primary', btn.dataset.tab === state.incTab);
    });
  }

  function renderIncidencias() {
    renderIncTabs();

    const resumen = state.incData.resumen || {};
    document.getElementById('incSummary').innerHTML = `
      <div class="mini-stat"><div class="mini-stat-k">Observados</div><div class="mini-stat-v">${KoguUi.int(resumen.observados || 0)}</div></div>
      <div class="mini-stat"><div class="mini-stat-k">EFOS</div><div class="mini-stat-v">${KoguUi.int(resumen.efos || 0)}</div></div>
      <div class="mini-stat"><div class="mini-stat-k">Sin validación</div><div class="mini-stat-v">${KoguUi.int(resumen.sin_validacion || 0)}</div></div>
      <div class="mini-stat"><div class="mini-stat-k">Alta severidad</div><div class="mini-stat-v">${KoguUi.int(resumen.alta_severidad || 0)}</div></div>
    `;

    const msg = state.incData.total
      ? `Incidencias encontradas: ${KoguUi.int(state.incData.total)}`
      : 'No se encontraron incidencias con los filtros actuales.';
    document.getElementById('incMessage').textContent = msg;

    const tbody = document.getElementById('incRows');
    const items = state.incData.items || [];
    tbody.innerHTML = items.length ? items.map(r => `
      <tr>
        <td class="mono">${KoguUi.escapeHtml(r.uuid || '')}</td>
        <td>${fmtShortDate(r.fecha_emision || r.fecha)}</td>
        <td>
          <div>${KoguUi.escapeHtml(r.tercero_rfc || r.rfc_tercero || '')}</div>
          <div class="muted">${KoguUi.escapeHtml(r.tercero_nombre || r.nombre_tercero || '')}</div>
        </td>
        <td>${severityBadge(r.severidad || '-')}</td>
        <td>${KoguUi.escapeHtml(r.efos_ui || r.sat_riesgo_ui || r.motivo || '-')}</td>
        <td>${KoguUi.escapeHtml(r.motivo || '-')}</td>
        <td>${KoguUi.escapeHtml(r.accion_sugerida || '-')}</td>
        <td>${KoguUi.escapeHtml(r.detalle || '-')}</td>
      </tr>
    `).join('') : '<tr><td colspan="8" class="empty">Sin incidencias para los criterios seleccionados</td></tr>';
  }

  function bindRowActions() {
    document.querySelectorAll('.btn-xml').forEach(btn => {
      btn.onclick = async () => {
        try {
          const uuid = btn.dataset.uuid;
          await downloadFile(`/cfdi/protected/cfdi/facturas/${encodeURIComponent(uuid)}/xml`, `${uuid}.xml`);
          KoguApi.toast('XML descargado correctamente', 'success');
        } catch (err) {
          KoguApi.toast(err.message || 'No fue posible descargar el XML', 'error');
        }
      };
    });

    document.querySelectorAll('.btn-json').forEach(btn => {
      btn.onclick = async () => {
        try {
          const uuid = btn.dataset.uuid;
          await downloadFile(`/cfdi/protected/cfdi/facturas/${encodeURIComponent(uuid)}/json`, `${uuid}.json`);
          KoguApi.toast('JSON descargado correctamente', 'success');
        } catch (err) {
          KoguApi.toast(err.message || 'No fue posible descargar el JSON', 'error');
        }
      };
    });

    document.querySelectorAll('.btn-pdf').forEach(btn => {
      btn.onclick = async () => {
        try {
          const uuid = btn.dataset.uuid;
          await openPdfFile(uuid);
        } catch (err) {
          KoguApi.toast(err.message || 'No fue posible abrir el PDF oficial', 'error');
        }
      };
    });

    document.querySelectorAll('.btn-refresh-sat').forEach(btn => {
      btn.onclick = async () => {
        try {
          const row = state.items.find((x) => String(x.cfdi_id) === String(btn.dataset.cfdiId));
          await refreshSatStatus(row);
          KoguApi.toast('Estatus SAT actualizado', 'success');
          await refreshAll();
        } catch (err) {
          KoguApi.toast(err.message || 'No fue posible actualizar estatus SAT', 'error');
        }
      };
    });
  }

  function renderBandeja() {
    const tbody = document.getElementById('rows');
    const totalPages = Math.max(1, Math.ceil((Number(state.total) || 0) / state.limit));
    const from = state.total ? ((state.page - 1) * state.limit) + 1 : 0;
    const to = Math.min(state.page * state.limit, state.total);

    document.getElementById('summaryBox').innerHTML = `
      <strong>Total CFDI:</strong> ${KoguUi.int(state.total)} ·
      <strong>Mostrando:</strong> ${KoguUi.int(from)} a ${KoguUi.int(to)} ·
      <strong>Página:</strong> ${KoguUi.int(state.page)} de ${KoguUi.int(totalPages)}
    `;
    document.getElementById('pageInfo').textContent = `Página ${state.page} de ${totalPages}`;
    document.getElementById('prevBtn').disabled = state.page <= 1;
    document.getElementById('nextBtn').disabled = state.page >= totalPages;

    tbody.innerHTML = state.items.length ? state.items.map(r => `
      <tr>
        <td>${buildUuidCell(r)}</td>
        <td>${buildPrimerConceptoCell(r)}</td>
        <td>${fmtShortDate(r.fecha_emision || r.fecha)}</td>
        <td>${buildOrigenTipoCell(r)}</td>
        <td>
          <div>${KoguUi.escapeHtml(r.emisor_rfc || r.rfc_emisor || '')}</div>
          <div class="muted">${KoguUi.escapeHtml(r.emisor_nombre || r.nombre_emisor || '')}</div>
        </td>
        <td>
          <div>${KoguUi.escapeHtml(r.receptor_rfc || r.rfc_receptor || '')}</div>
          <div class="muted">${KoguUi.escapeHtml(r.receptor_nombre || r.nombre_receptor || '')}</div>
        </td>
        <td>${relationsBadge(r)}</td>
        <td>${cancelBadge(r)}</td>
        <td>${KoguUi.escapeHtml(r.metodo_pago || '-')}</td>
        <td>${buildSatStatusCell(r)}</td>
        <td>${buildMontoCell(r)}</td>
        <td>
          <div class="bandeja-actions-grid bandeja-actions-grid-5">
            <a class="btn primary bandeja-action-btn" href="/modules/cfdi/detalle/detalle.html?uuid=${encodeURIComponent(r.uuid)}">Detalle</a>
            <button class="btn bandeja-action-btn btn-pdf" data-uuid="${KoguUi.escapeHtml(r.uuid || '')}">PDF</button>
            <button class="btn bandeja-action-btn btn-xml" data-uuid="${KoguUi.escapeHtml(r.uuid || '')}">XML</button>
            <button class="btn bandeja-action-btn btn-json" data-uuid="${KoguUi.escapeHtml(r.uuid || '')}">JSON</button>
            <button class="btn bandeja-action-btn btn-refresh-sat" data-cfdi-id="${KoguUi.escapeHtml(r.cfdi_id || '')}">Actualizar SAT</button>
          </div>
        </td>
      </tr>
    `).join('') : `<tr><td colspan="12" class="empty">Sin CFDI para los criterios seleccionados</td></tr>`;

    bindRowActions();
  }

  async function loadBandeja() {
    const qs = KoguUi.queryParams(currentFilters());
    const res = await KoguApi.apiFetch('/protected/kogu/cfdi/negocio/bandeja?' + qs);
    const data = KoguApi.unwrapData(res);

    state.total = Number(data.total || data.count || 0);
    state.items = data.items || data.rows || KoguApi.unwrapRows(res) || [];
    renderBandeja();
  }

  async function loadIncidencias() {
    try {
      const qs = KoguUi.queryParams(currentIncFilters());
      const res = await KoguApi.apiFetch('/protected/kogu/cfdi/negocio/incidencias-efos?' + qs);
      const data = KoguApi.unwrapData(res);
      state.incData = {
        total: Number(data.total || 0),
        resumen: data.resumen || {},
        items: data.items || []
      };
    } catch (err) {
      state.incData = { total: 0, resumen: {}, items: [] };
      document.getElementById('incMessage').textContent = err.message || 'No fue posible consultar incidencias';
    }
    renderIncidencias();
  }

  async function refreshAll() {
    await Promise.all([loadBandeja(), loadIncidencias()]);
  }

  async function exportExcel(template = 'estandar') {
    const btn = document.getElementById('exportBtn');
    const original = btn.textContent;

    try {
      btn.disabled = true;
      btn.textContent = 'Exportando...';

      const filters = currentFilters();

      const queryNew = KoguUi.queryParams({
        uuid: filters.uuid || '',
        rfc: filters.rfc || '',
        status: filters.estatus_sat || '',
        metodoPago: filters.metodo_pago || '',
        scope: filters.scope || '',
        docType: filters.tipo_comprobante || '',
        dateStart: filters.date_from || '',
        dateEnd: filters.date_to || '',
        template
      });

      const queryOld = KoguUi.queryParams({
        uuid: filters.uuid || '',
        rfc: filters.rfc || '',
        estatus_sat: filters.estatus_sat || '',
        metodo_pago: filters.metodo_pago || '',
        scope: filters.scope || '',
        tipo_comprobante: filters.tipo_comprobante || '',
        date_from: filters.date_from || '',
        date_to: filters.date_to || '',
        template
      });

      const candidatePaths = [
        '/protected/kogu/cfdi/negocio/exportar-excel?' + queryOld,
        '/cfdi/protected/cfdi/facturas/exportar-excel?' + queryNew
      ];

      let response = null;
      let lastMessage = 'No fue posible exportar el Excel';

      for (const path of candidatePaths) {
        const resp = await KoguApi.authFetchRaw(path, {
          method: 'GET',
          headers: {
            Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel, application/octet-stream, */*'
          }
        });

        if (resp.ok) {
          response = resp;
          break;
        }

        try {
          const err = await resp.clone().json();
          lastMessage = err?.error?.message || err?.message || lastMessage;
        } catch (_e) {}
      }

      if (!response) {
        throw new Error(lastMessage);
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const contentType = (response.headers.get('content-type') || '').toLowerCase();
      const ext = contentType.includes('openxmlformats-officedocument.spreadsheetml.sheet') ? 'xlsx' : 'xls';
      // Si el backend devuelve filename en Content-Disposition lo usamos; si no, lo armamos local con sufijo del template.
      const dispo = response.headers.get('content-disposition') || '';
      const dispoMatch = dispo.match(/filename\*?=(?:UTF-8'')?["']?([^"';\n]+)["']?/i);
      const tplSuffix = template && template !== 'estandar' ? `_${template}` : '';
      const fallbackName = `bandeja_cfdi_${document.getElementById('date_from').value || 'inicio'}_${document.getElementById('date_to').value || 'fin'}${tplSuffix}.${ext}`;
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = dispoMatch ? decodeURIComponent(dispoMatch[1]) : fallbackName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);

      KoguApi.toast(`Excel generado correctamente (${template})`, 'success');
    } catch (err) {
      KoguApi.toast(err.message || 'No fue posible exportar el Excel', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  }

  document.getElementById('pageSize').onchange = async (e) => {
    state.limit = Number(e.target.value || 50);
    state.page = 1;
    await refreshAll().catch(err => KoguApi.toast(err.message, 'error'));
  };

  document.getElementById('applyBtn').onclick = async () => {
    state.page = 1;
    await refreshAll().catch(err => KoguApi.toast(err.message, 'error'));
  };

  document.getElementById('clearBtn').onclick = async () => {
    resetFilters();
    state.page = 1;
    await refreshAll().catch(err => KoguApi.toast(err.message, 'error'));
  };

  // ---------------------------------------------------------------------------
  // Modal de selección de plantilla de Excel.
  //   Reusa el patrón visual del modal "Cambiar empresa" del shell (clases
  //   kogu-modal-overlay / kogu-modal / kogu-empresa-list) para coherencia
  //   visual y cero CSS nuevo. Cada plantilla es un <li> que al click dispara
  //   exportExcel(template) y cierra el modal.
  // ---------------------------------------------------------------------------
  const EXPORT_TEMPLATES = [
    {
      key: 'estandar',
      ini: 'ES',
      nombre: 'Reporte Estándar',
      descripcion: 'Excel completo auditable: bloque de metadatos, 35 columnas en 6 grupos, 2 hojas (CFDI + Resumen Ejecutivo con KPIs).'
    },
    {
      key: 'personalizado',
      ini: 'PE',
      nombre: 'Reporte Personalizado',
      descripcion: 'Layout solicitado por Finanzas: 34 columnas en 7 grupos, una sola hoja, orden operativo (receptor → emisor → importes → SAT).'
    }
  ];

  function openExportTemplateModal() {
    let overlay = document.getElementById('koguExportTemplateModal');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'koguExportTemplateModal';
      overlay.className = 'kogu-modal-overlay';
      document.body.appendChild(overlay);
    }
    overlay.innerHTML = `
      <div class="kogu-modal kogu-modal--empresa" role="dialog" aria-modal="true" aria-label="Elegir tipo de reporte Excel">
        <div class="kogu-modal__head">
          <div>
            <div class="kogu-modal__eyebrow">Exportar Excel</div>
            <h2>Tipo de reporte</h2>
          </div>
          <button class="kogu-modal__close" id="koguExportTemplateModalClose" type="button" aria-label="Cerrar">×</button>
        </div>
        <ul class="kogu-empresa-list">
          ${EXPORT_TEMPLATES.map(t => `
            <li class="kogu-empresa-list__item" data-template="${KoguUi.escapeHtml(t.key)}">
              <span class="kogu-empresa-list__check"></span>
              <span class="kogu-empresa-list__ini">${KoguUi.escapeHtml(t.ini)}</span>
              <span class="kogu-empresa-list__info">
                <span class="kogu-empresa-list__nombre">${KoguUi.escapeHtml(t.nombre)}</span>
                <span class="kogu-empresa-list__rfc">${KoguUi.escapeHtml(t.descripcion)}</span>
              </span>
            </li>
          `).join('')}
        </ul>
      </div>
    `;
    overlay.classList.add('is-open');

    const closeBtn = document.getElementById('koguExportTemplateModalClose');
    if (closeBtn) closeBtn.onclick = closeExportTemplateModal;
    overlay.onclick = (ev) => { if (ev.target === overlay) closeExportTemplateModal(); };

    overlay.querySelectorAll('.kogu-empresa-list__item').forEach(li => {
      li.onclick = async () => {
        const template = li.dataset.template;
        closeExportTemplateModal();
        await exportExcel(template).catch(err => KoguApi.toast(err.message || 'No fue posible exportar', 'error'));
      };
    });
  }

  function closeExportTemplateModal() {
    const overlay = document.getElementById('koguExportTemplateModal');
    if (overlay) overlay.classList.remove('is-open');
  }

  document.getElementById('exportBtn').addEventListener('click', () => openExportTemplateModal());

  document.getElementById('refreshSatTodosBtn').onclick = async () => {
    const btn = document.getElementById('refreshSatTodosBtn');
    const original = btn.textContent;
    try {
      btn.disabled = true;
      btn.textContent = 'Actualizando...';
      const data = await refreshSatTodos();
      KoguApi.toast(`Actualización SAT (todos) finalizada. OK: ${KoguUi.int(data.actualizados || 0)} · Error: ${KoguUi.int(data.errores || 0)}`, (data.errores || 0) > 0 ? 'warn' : 'success');
      await refreshAll();
    } catch (err) {
      KoguApi.toast(err.message || 'No fue posible actualizar SAT (todos)', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  };

  document.getElementById('zipXmlPdfTodosBtn').onclick = async () => {
    const btn = document.getElementById('zipXmlPdfTodosBtn');
    const original = btn.textContent;
    try {
      btn.disabled = true;
      btn.textContent = 'Preparando ZIP...';
      await downloadZipXmlPdfTodos();
      KoguApi.toast(`ZIP XML + PDF (todos) generado con los filtros aplicados`, 'success');
    } catch (err) {
      KoguApi.toast(err.message || 'No fue posible generar el ZIP XML + PDF (todos)', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  };

  // ---------------------------------------------------------------------------
  // Paginador defensivo
  //   - Guard contra doble click mientras está navegando.
  //   - Rollback de state.page si loadBandeja falla (timeout, 5xx, red).
  //   - renderBandeja siempre tras error para mantener la UI consistente con
  //     state.page real y no dejar el paginador "congelado" tras un error
  //     intermitente.
  //   - console.debug con offset solicitado para diagnóstico futuro.
  // ---------------------------------------------------------------------------
  let _paginating = false;

  async function goToPage(newPage) {
    if (_paginating) return;

    const totalPages = Math.max(1, Math.ceil((Number(state.total) || 0) / state.limit));
    const target = Math.max(1, Math.min(totalPages, Number(newPage) || 1));
    if (target === state.page) return;

    _paginating = true;
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    if (prevBtn) prevBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;

    const oldPage = state.page;
    state.page = target;

    try {
      console.debug('[bandeja-cfdi] goToPage', {
        from: oldPage,
        to: target,
        limit: state.limit,
        offset: (target - 1) * state.limit
      });
      await loadBandeja();
    } catch (err) {
      // Rollback: restauramos state.page y re-renderizamos para que el DOM
      // refleje la página real (no la página intentada que falló).
      state.page = oldPage;
      renderBandeja();
      KoguApi.toast(err?.message || 'No fue posible cargar la página solicitada', 'error');
    } finally {
      _paginating = false;
    }
  }

  document.getElementById('prevBtn').addEventListener('click', () => {
    if (state.page > 1) goToPage(state.page - 1);
  });

  document.getElementById('nextBtn').addEventListener('click', () => {
    const totalPages = Math.max(1, Math.ceil((Number(state.total) || 0) / state.limit));
    if (state.page < totalPages) goToPage(state.page + 1);
  });

  document.querySelectorAll('.inc-tab').forEach(btn => {
    btn.onclick = async () => {
      state.incTab = btn.dataset.tab;
      await loadIncidencias().catch(err => KoguApi.toast(err.message, 'error'));
    };
  });

  KoguShell.subscribeEmpresaActivaChange(async () => {
    try {
      state.page = 1;
      await refreshAll();
      KoguApi.toast('Bandeja actualizada por cambio de empresa', 'success');
    } catch (err) {
      KoguApi.toast(err.message || 'No fue posible actualizar la bandeja', 'error');
    }
  });

  await refreshAll();
});
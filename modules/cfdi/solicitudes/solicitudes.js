document.addEventListener('DOMContentLoaded', async () => {
  const bootstrap = await KoguShell.initShell({
    currentPage: '/modules/cfdi/solicitudes/solicitudes.html',
    title: 'Solicitudes SAT',
    description: 'Creación, seguimiento y cierre de solicitudes SAT para la empresa activa.',
    requiredPermission: 'screen.cfdi.sat_dm'
  });
  if (!bootstrap) return;

  // F-07: guard empresa activa — sin empresa no hay contexto para llamadas CFDI
  if (!bootstrap.empresa_activa) {
    KoguApi.toast('No hay empresa activa. Selecciona una empresa para continuar.', 'error');
    setTimeout(() => window.location.href = '/modules/core/contexto/cambio-empresa.html', 1200);
    return;
  }

  const c = document.getElementById('pageContent');
  c.innerHTML = `
    <div class="stack">
      <div class="split solicitudes-top">
        <div class="card solicitudes-create-card">
          <div class="solicitudes-create-head">
            <div class="eyebrow">Crear solicitud</div>
            <h2 class="solicitudes-create-title">Crear solicitud</h2>
          </div>

          <div class="solicitudes-form-grid">
            <div class="solicitudes-field">
              <div class="label-text">Fecha inicial</div>
              <input class="input solicitudes-control" type="date" id="date_from"/>
            </div>

            <div class="solicitudes-field">
              <div class="label-text">Fecha final</div>
              <input class="input solicitudes-control" type="date" id="date_to"/>
            </div>

            <div class="solicitudes-field">
              <div class="label-text">Scope</div>
              <select class="select solicitudes-control" id="scope">
                <option value="emitidos">emitidos</option>
                <option value="recibidos">recibidos</option>
              </select>
            </div>

            <div class="solicitudes-field">
              <div class="label-text">Formato</div>
              <select class="select solicitudes-control" id="format">
                <option value="xml">xml</option>
                <option value="metadata">metadata</option>
              </select>
            </div>

            <div class="solicitudes-field">
              <div class="label-text">Estatus CFDI</div>
              <select class="select solicitudes-control" id="status">
                <option value="todos">Todos</option>
                <option value="vigente">Vigente</option>
                <option value="cancelado">Cancelado</option>
              </select>
            </div>

            <div class="solicitudes-field">
              <div class="label-text">Tipo CFDI</div>
              <select class="select solicitudes-control" id="docType">
                <option value="">Todos</option>
                <option value="ingreso">Ingreso</option>
                <option value="egreso">Egreso</option>
                <option value="traslado">Traslado</option>
                <option value="nomina">Nómina</option>
                <option value="pago">Pago</option>
              </select>
            </div>
          </div>

          <div class="page-actions solicitudes-create-actions">
            <button class="btn primary solicitudes-btn-main" id="createBtn">Crear solicitud</button>
            <button class="btn solicitudes-btn-alt" id="refreshBtn">Actualizar historial</button>
          </div>
        </div>

        <div class="card">
          <div class="row solicitudes-process-head">
            <div>
              <div class="eyebrow">Solicitudes</div>
              <h2>En proceso</h2>
            </div>
            <input class="input solicitudes-search" id="processSearch" placeholder="Buscar request_id"/>
          </div>

          <div class="table-wrap" style="margin-top:16px">
            <table>
              <thead>
                <tr>
                  <th>Request</th>
                  <th>Solicitud</th>
                  <th>Estatus</th>
                  <th>Última verificación</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody id="processRows">
                <tr><td colspan="5" class="empty">Sin solicitudes en proceso.</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="row solicitudes-done-head">
          <div>
            <div class="eyebrow">Solicitudes terminadas, status_solicitud = 3</div>
            <h2>Terminadas con paquetes</h2>
            <p class="muted" style="margin-top:6px">Resumen operativo de solicitudes terminadas y paquetes detectados por request.</p>
          </div>
          <div class="page-actions solicitudes-terminal-toolbar">
            <label class="checkbox-inline">
              <input type="checkbox" id="onlyZip"/>
              <span>Solo con ZIP</span>
            </label>
            <input class="input solicitudes-search" id="doneSearch" placeholder="Buscar request_id"/>
            <button class="btn primary" id="refreshDoneBtn">Actualizar</button>
          </div>
        </div>

        <div class="table-wrap" style="margin-top:16px">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>RequestId</th>
                <th>Solicitud</th>
                <th>Paquetes</th>
                <th>Creada</th>
                <th>Terminada</th>
                <th>Paquetes (ZIP / PROC / XMLS / METAS / ERR)</th>
                <th>ZIP</th>
              </tr>
            </thead>
            <tbody id="doneRows">
              <tr><td colspan="8" class="empty">Sin solicitudes terminadas.</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  const els = {
    date_from: document.getElementById('date_from'),
    date_to: document.getElementById('date_to'),
    scope: document.getElementById('scope'),
    format: document.getElementById('format'),
    status: document.getElementById('status'),
    docType: document.getElementById('docType'),
    createBtn: document.getElementById('createBtn'),
    refreshBtn: document.getElementById('refreshBtn'),
    refreshDoneBtn: document.getElementById('refreshDoneBtn'),
    processSearch: document.getElementById('processSearch'),
    doneSearch: document.getElementById('doneSearch'),
    onlyZip: document.getElementById('onlyZip'),
    processRows: document.getElementById('processRows'),
    doneRows: document.getElementById('doneRows'),
  };

  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  els.date_to.value = `${yyyy}-${mm}-${dd}`;
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  els.date_from.value = `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, '0')}-${String(first.getDate()).padStart(2, '0')}`;

  const state = {
    all: [],
    en_proceso: [],
    terminadas: [],
    paquetesByRequestId: new Map(),
  };

  function fmtDate(v) {
    if (!v) return '—';
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return String(v);
    return d.toLocaleString('es-MX');
  }

  function toIsoStart(value) {
    return `${value}T00:00:00`;
  }

  function toIsoEnd(value) {
    return `${value}T23:59:59`;
  }

  function badgeStatus(status) {
    const n = Number(status);
    if (n === 1) return '<span class="chip">1</span>';
    if (n === 2) return '<span class="chip">2</span>';
    if (n === 3) return '<span class="chip success">3</span>';
    return `<span class="chip">${KoguUi.escapeHtml(String(status ?? '-'))}</span>`;
  }

  function escape(v) {
    return KoguUi.escapeHtml(String(v ?? ''));
  }

  function formatSolicitud(item) {
    const filtros = item.filtros_json || item.filtros || {};
    const scope = item.scope || filtros.scope || '—';
    const formato = item.formato || item.format || filtros.format || '—';
    const tipo = filtros.docType || filtros.tipo_cfdi || 'Todos';
    const estatus = item.status_normal || filtros.status || filtros.estatus || 'todos';
    const desde = filtros.dateStart || filtros.date_from || item.fecha_creacion || '—';
    const hasta = filtros.dateEnd || filtros.date_to || item.fecha_terminada || '—';

    return `
      <div class="solicitud-cell">
        <div class="strong">${escape(scope)} · ${escape(formato)} · ${escape(tipo || 'Todos')}</div>
        <div class="muted">${escape(desde)} → ${escape(hasta)}</div>
        <div class="muted">Estatus solicitado: ${escape(estatus)}</div>
      </div>
    `;
  }

  function normalizeSolicitudes(rows) {
    const list = Array.isArray(rows) ? rows : [];
    state.all = list;
    state.en_proceso = list.filter(x => Number(x.status_solicitud) === 1 || Number(x.status_solicitud) === 2);
    state.terminadas = list.filter(x => Number(x.status_solicitud) === 3);
  }

  function setSatRuleStatus() {
    const isRecibidosXml = els.scope.value === 'recibidos' && els.format.value === 'xml';
    if (isRecibidosXml) {
      els.status.value = 'vigente';
      els.status.disabled = true;
      els.status.title = 'Para RECIBIDOS + XML, SAT solo permite VIGENTE.';
    } else {
      els.status.disabled = false;
      els.status.title = '';
    }
  }

  async function fetchSolicitudes() {
    const res = await KoguApi.apiFetch('/cfdi/protected/cfdi/solicitudes?limit=100&offset=0');
    const data = KoguApi.unwrapData(res);
    normalizeSolicitudes(data);
  }

  async function fetchPaquetesPendientes() {
    const map = new Map();

    const endpoints = [
      '/cfdi/protected/cfdi/paquetes/pendientes-descarga?limit=200&offset=0',
      '/cfdi/protected/cfdi/paquetes/pendientes-proceso?limit=200&offset=0'
    ];

    for (const endpoint of endpoints) {
      try {
        const res = await KoguApi.apiFetch(endpoint);
        const data = KoguApi.unwrapData(res) || {};
        const items = Array.isArray(data.items) ? data.items : [];

        for (const item of items) {
          const requestId = String(item.request_id || '');
          if (!requestId) continue;
          const current = map.get(requestId) || [];
          current.push({
            paquete_id: item.paquete_id,
            zip_descargado: !!item.zip_descargado,
            procesado: !!item.procesado,
            xmls: Number(item.xmls || 0),
            metas: Number(item.metas || 0),
            errores: Number(item.errores || 0),
            download_url: item.zip_descargado ? `/cfdi/protected/cfdi/paquetes/${encodeURIComponent(item.paquete_id)}/download` : null,
          });
          map.set(requestId, current);
        }
      } catch (_err) {
        // No detenemos el render si aún no existe detalle de paquetes pendiente.
      }
    }

    state.paquetesByRequestId = map;
  }

  function summarizePaquetesList(paquetes) {
    const list = Array.isArray(paquetes) ? paquetes : [];
    return list.reduce((acc, p) => {
      acc.zips += p.zip_descargado ? 1 : 0;
      acc.procesados += p.procesado ? 1 : 0;
      acc.xmls += Number(p.xmls || 0);
      acc.metas += Number(p.metas || 0);
      acc.errores += Number(p.errores || 0);
      return acc;
    }, { zips: 0, procesados: 0, xmls: 0, metas: 0, errores: 0 });
  }

  async function fetchHistorial() {
    try {
      const res = await KoguApi.apiFetch('/cfdi/protected/cfdi/solicitudes/historial?limit=100&offset=0');
      const data = KoguApi.unwrapData(res) || {};
      state.en_proceso = Array.isArray(data.en_proceso) ? data.en_proceso : [];
      state.terminadas = Array.isArray(data.terminadas) ? data.terminadas : [];
      state.all = [...state.en_proceso, ...state.terminadas];
      state.paquetesByRequestId = new Map(
        state.terminadas.map((item) => [String(item.request_id || ''), Array.isArray(item.paquetes) ? item.paquetes : []])
      );
      return;
    } catch (_err) {
      // Fallback temporal mientras el backend se actualiza.
    }

    await Promise.all([
      fetchSolicitudes(),
      fetchPaquetesPendientes()
    ]);
  }

  function attachVerifyHandlers() {
    document.querySelectorAll('.btn-verify').forEach(btn => {
      btn.onclick = async () => {
        try {
          await KoguApi.apiFetch(`/cfdi/protected/cfdi/solicitudes/${encodeURIComponent(btn.dataset.request)}/verificar`, {
            method: 'POST'
          });
          KoguApi.toast('Solicitud verificada', 'success');
          await refreshAll();
        } catch (err) {
          KoguApi.toast(err.message || 'No fue posible verificar', 'error');
        }
      };
    });
  }

  function renderProceso() {
    const q = els.processSearch.value.trim().toLowerCase();
    const items = state.en_proceso.filter(x => !q || String(x.request_id || '').toLowerCase().includes(q));

    els.processRows.innerHTML = items.length ? items.map(x => `
      <tr>
        <td class="mono">${escape(x.request_id || '')}</td>
        <td>${formatSolicitud(x)}</td>
        <td>${badgeStatus(x.status_solicitud)}</td>
        <td>${fmtDate(x.fecha_ultima_verif || x.updated_at)}</td>
        <td>
          <button class="btn btn-verify" data-request="${escape(x.request_id || '')}">Verificar</button>
        </td>
      </tr>
    `).join('') : '<tr><td colspan="5" class="empty">Sin solicitudes en proceso.</td></tr>';

    attachVerifyHandlers();
  }

  async function downloadZip(url, packageId) {
    try {
      const response = await KoguApi.authFetchRaw(url, {
        method: 'GET',
        headers: {
          Accept: 'application/zip, application/octet-stream, */*'
        }
      });

      if (!response.ok) {
        let message = 'No fue posible descargar el ZIP';
        let errorCode = '';

        try {
          const err = await response.json();
          errorCode = err?.error?.code || '';
          message = err?.error?.message || err?.message || message;
        } catch (_e) {}

        if (response.status === 401 || errorCode === 'UNAUTHORIZED') {
          throw new Error('Tu sesión no es válida para esta descarga. Reingresa e intenta nuevamente.');
        }

        throw new Error(message);
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `${packageId || 'paquete'}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      KoguApi.toast(err.message || 'No fue posible descargar el ZIP', 'error');
      console.error('downloadZip error', err);
    }
  }

  function buildPaquetesResumen(requestId) {
    const paquetes = state.paquetesByRequestId.get(String(requestId || '')) || [];
    const resumen = summarizePaquetesList(paquetes);
    return { paquetes, resumen };
  }

  function resolvePaquetesData(item) {
    const enrichedPaquetes = Array.isArray(item?.paquetes) ? item.paquetes : null;
    if (enrichedPaquetes) {
      const resumen = item?.paquetes_resumen || summarizePaquetesList(enrichedPaquetes);
      return {
        paquetes: enrichedPaquetes,
        resumen,
        numeroPaquetes: Number(item?.numero_paquetes ?? enrichedPaquetes.length ?? 0),
      };
    }

    const fallback = buildPaquetesResumen(item?.request_id);
    return {
      paquetes: fallback.paquetes,
      resumen: fallback.resumen,
      numeroPaquetes: Number(fallback.paquetes.length || 0),
    };
  }

  function renderTerminadas() {
    const q = els.doneSearch.value.trim().toLowerCase();
    const onlyZip = els.onlyZip.checked;

    const items = state.terminadas
      .map(x => ({ ...x, _paq: resolvePaquetesData(x) }))
      .filter(x => !q || String(x.request_id || '').toLowerCase().includes(q))
      .filter(x => {
        if (!onlyZip) return true;
        return x._paq.paquetes.some(p => !!p.zip_descargado);
      });

    els.doneRows.innerHTML = items.length ? items.map((x, idx) => {
      const paquetes = x._paq.paquetes;
      const resumen = x._paq.resumen;
      const packageLine = paquetes.length ? paquetes.map((p, i) => `
        <div class="muted">
          Paquete ${i + 1} | ZIP: ${p.zip_descargado ? '✅' : '—'} | Procesado: ${p.procesado ? '✅' : '—'} | XMLs: ${Number(p.xmls || 0)} | Metas: ${Number(p.metas || 0)} | Errores: ${Number(p.errores || 0)}
        </div>
      `).join('') : '<div class="muted">Sin detalle de paquetes en endpoints actuales.</div>';

      const firstZipPackage = paquetes.find(p => p.zip_descargado && p.download_url);

      return `
        <tr>
          <td>${idx + 1}</td>
          <td class="mono">${escape(x.request_id || '')}</td>
          <td>${formatSolicitud(x)}</td>
          <td>${Number(x._paq.numeroPaquetes || paquetes.length || 0)}</td>
          <td>${fmtDate(x.fecha_creacion || x.created_at)}</td>
          <td>${fmtDate(x.fecha_terminada || x.updated_at)}</td>
          <td>
            <div class="strong">ZIPs: ${Number(resumen.zips || 0)} · Proc: ${Number(resumen.procesados || 0)} · XMLs: ${Number(resumen.xmls || 0)} · Metas: ${Number(resumen.metas || 0)} · Err: ${Number(resumen.errores || 0)}</div>
            ${packageLine}
          </td>
          <td>
            ${firstZipPackage ? `<button class="icon-btn btn-zip" title="Descargar ZIP" data-url="${escape(firstZipPackage.download_url)}" data-package="${escape(firstZipPackage.paquete_id || 'paquete')}">⬇</button>` : '<span class="muted">—</span>'}
          </td>
        </tr>
      `;
    }).join('') : '<tr><td colspan="8" class="empty">Sin solicitudes terminadas.</td></tr>';

    document.querySelectorAll('.btn-zip').forEach(btn => {
      btn.onclick = async () => {
        await downloadZip(btn.dataset.url, btn.dataset.package);
      };
    });
  }

  async function refreshAll() {
    await fetchHistorial();
    renderProceso();
    renderTerminadas();
  }

  async function createSolicitud() {
    try {
      setSatRuleStatus();

      const payload = {
        scope: els.scope.value,
        format: els.format.value,
        status: els.status.value,
        dateStart: toIsoStart(els.date_from.value),
        dateEnd: toIsoEnd(els.date_to.value),
        rfcCounterpart: []
      };

      if (els.docType.value) payload.docType = els.docType.value;

      if (!els.date_from.value || !els.date_to.value) {
        throw new Error('Captura fecha inicial y fecha final.');
      }

      await KoguApi.apiFetch('/cfdi/protected/cfdi/solicitudes', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      KoguApi.toast('Solicitud creada correctamente', 'success');
      await refreshAll();
    } catch (err) {
      KoguApi.toast(err.message || 'No fue posible crear la solicitud', 'error');
    }
  }

  els.scope.onchange = setSatRuleStatus;
  els.format.onchange = setSatRuleStatus;
  els.createBtn.onclick = () => KoguUi.withLoading(els.createBtn, createSolicitud, 'Creando solicitud...'); // F-12
  els.refreshBtn.onclick = refreshAll;
  els.refreshDoneBtn.onclick = refreshAll;
  els.processSearch.oninput = renderProceso;
  els.doneSearch.oninput = renderTerminadas;
  els.onlyZip.onchange = renderTerminadas;

  KoguShell.subscribeEmpresaActivaChange(async () => {
    await refreshAll();
    KoguApi.toast('Solicitudes actualizadas por cambio de empresa', 'success');
  });

  setSatRuleStatus();
  await refreshAll();
});
document.addEventListener('DOMContentLoaded', async () => {
  const boot = await KoguShell.initShell({
    currentPage: '/modules/cfdi/rep/bandeja-rep.html',
    title: 'Bandeja REP / Cobranza Fiscal',
    description: 'Listado operativo de conciliación REP con filtros, scope, moneda y paginación.',
    requiredPermission: 'screen.cfdi.cfdi_facturas'
  });
  if (!boot) return;

  // F-07: guard empresa activa — sin empresa no hay contexto para llamadas CFDI
  if (!boot.empresa_activa) {
    KoguApi.toast('No hay empresa activa. Selecciona una empresa para continuar.', 'error');
    setTimeout(() => window.location.href = '/modules/core/contexto/cambio-empresa.html', 1200);
    return;
  }

  // Fechas por defecto: primer y último día del mes actual
  const hoy = new Date();
  const primerDia = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().slice(0, 10);
  const ultimoDia = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).toISOString().slice(0, 10);

  const app = document.getElementById('pageContent');

  app.innerHTML = `
    <div class="stack">
      <div class="card">
        <div class="row" style="justify-content:space-between;gap:16px;flex-wrap:wrap;align-items:flex-end;">
          <div>
            <div class="eyebrow">Conciliación REP</div>
            <h2>Bandeja operativa</h2>
            <p class="muted" style="margin-top:6px;">
              Facturas PPD vigentes conciliadas contra REP, separadas por scope y moneda, sin conversión de importes.
            </p>
          </div>
          <div class="page-actions">
            <button class="btn" id="goResumenBtn">Ir a resumen</button>
            <button class="btn" id="exportBtn">Exportar Excel</button>
            <button class="btn" id="consultarBtn">Consultar</button>
          </div>
        </div>

        <div class="grid-4" style="margin-top:16px;">
          <div>
            <label class="label-text">Scope</label>
            <select class="input" id="scope">
              <option value="todos">Todos</option>
              <option value="emitidos">Emitidos</option>
              <option value="recibidos" selected>Recibidos</option>
            </select>
          </div>

          <div>
            <label class="label-text">Moneda</label>
            <select class="input" id="moneda">
              <option value="">Todas</option>
              <option value="MXN">MXN</option>
              <option value="USD">USD</option>
            </select>
          </div>

          <div>
            <label class="label-text">Estatus conciliación</label>
            <select class="input" id="estatusConciliacion">
              <option value="">Todos</option>
              <option value="SIN_REP">Sin REP</option>
              <option value="PARCIAL">Parcial</option>
              <option value="CONCILIADO">Conciliado</option>
              <option value="SOBRECONCILIADO">Sobreconciliado</option>
              <option value="REP_CANCELADO">REP cancelado</option>
              <option value="PENDIENTE_REVISION">Pendiente revisión</option>
            </select>
          </div>

          <div>
            <label class="label-text">UUID</label>
            <input class="input" id="uuid" placeholder="Buscar por UUID" />
          </div>

          <div>
            <label class="label-text">RFC</label>
            <input class="input" id="rfc" placeholder="Emisor / receptor / contraparte" />
          </div>

          <div>
            <label class="label-text">Contraparte</label>
            <input class="input" id="contraparte" placeholder="Nombre contraparte" />
          </div>

          <div>
            <label class="label-text">Fecha desde</label>
            <input class="input" type="date" id="dateFrom" value="${primerDia}" />
          </div>

          <div>
            <label class="label-text">Fecha hasta</label>
            <input class="input" type="date" id="dateTo" value="${ultimoDia}" />
          </div>
        </div>

        <div class="hero-note" id="statusMsg" style="margin-top:12px;">Cargando bandeja REP...</div>
      </div>

      <div class="card">
        <div class="row" style="justify-content:space-between;gap:16px;align-items:center;flex-wrap:wrap;">
          <div>
            <div class="eyebrow">Listado</div>
            <h2>Facturas PPD conciliadas</h2>
          </div>
          <div class="muted" id="pagerInfo">Sin datos.</div>
        </div>

        <div class="table-wrap" style="margin-top:16px;">
          <table>
            <thead>
              <tr>
                <th>UUID</th>
                <th>Scope</th>
                <th>Fecha</th>
                <th>Moneda</th>
                <th>Serie/Folio</th>
                <th>Contraparte</th>
                <th>Total factura</th>
                <th>Total conciliado</th>
                <th>Saldo pendiente</th>
                <th># REP</th>
                <th>Estatus</th>
                <th>Incidencia</th>
              </tr>
            </thead>
            <tbody id="rows">
              <tr><td colspan="12" class="empty">Sin resultados.</td></tr>
            </tbody>
          </table>
        </div>

        <div class="row" style="justify-content:flex-end;gap:8px;margin-top:16px;">
          <button class="btn" id="prevBtn">Anterior</button>
          <button class="btn" id="nextBtn">Siguiente</button>
        </div>
      </div>
    </div>
  `;

  const state = {
    limit: 20,
    offset: 0,
    total: 0
  };

  function esc(v) {
    return KoguUi.escapeHtml(String(v ?? ''));
  }

  function money(v) {
    return KoguUi.money(Number(v || 0));
  }

  function shortDate(v) {
    if (!v) return '-';
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return String(v);
    return d.toLocaleDateString('es-MX');
  }

  function badgeStatus(v) {
    const txt = String(v || '-');
    let cls = 'chip';

    if (txt === 'CONCILIADO') cls += ' success';
    else if (txt === 'PARCIAL') cls += ' warn';
    else if (txt === 'SIN_REP' || txt === 'REP_CANCELADO' || txt === 'PENDIENTE_REVISION' || txt === 'SOBRECONCILIADO') cls += ' danger';

    return `<span class="${cls}">${esc(txt.replaceAll('_', ' '))}</span>`;
  }

  function badgeBool(flag) {
    return flag
      ? '<span class="chip danger">Sí</span>'
      : '<span class="chip success">No</span>';
  }

  function buildQuery(includePaging = true) {
    const qs = new URLSearchParams();

    const scope = document.getElementById('scope').value;
    const moneda = document.getElementById('moneda').value;
    const estatus = document.getElementById('estatusConciliacion').value;
    const uuid = document.getElementById('uuid').value.trim();
    const rfc = document.getElementById('rfc').value.trim();
    const contraparte = document.getElementById('contraparte').value.trim();
    const dateFrom = document.getElementById('dateFrom').value;
    const dateTo = document.getElementById('dateTo').value;

    if (scope) qs.set('scope', scope);
    if (moneda) qs.set('moneda', moneda);
    if (estatus) qs.set('estatus_conciliacion', estatus);
    if (uuid) qs.set('uuid', uuid);
    if (rfc) qs.set('rfc', rfc);
    if (contraparte) qs.set('contraparte', contraparte);
    if (dateFrom) qs.set('date_from', dateFrom);
    if (dateTo) qs.set('date_to', dateTo);

    if (includePaging) {
      qs.set('limit', state.limit);
      qs.set('offset', state.offset);
    }

    return qs;
  }

  function renderRows(items) {
    const tbody = document.getElementById('rows');

    if (!items?.length) {
      tbody.innerHTML = '<tr><td colspan="12" class="empty">Sin resultados.</td></tr>';
      return;
    }

    tbody.innerHTML = items.map((r) => `
      <tr>
        <td class="mono">${esc(r.uuid)}</td>
        <td>${esc(r.scope)}</td>
        <td>${esc(shortDate(r.fecha_emision))}</td>
        <td>${esc(r.moneda)}</td>
        <td>${esc([r.serie, r.folio].filter(Boolean).join(' / ') || '-')}</td>
        <td>
          <div class="status-stack">
            <div>${esc(r.contraparte_nombre || '-')}</div>
            <div class="muted mono">${esc(r.contraparte_rfc || '-')}</div>
          </div>
        </td>
        <td>${money(r.total_factura)}</td>
        <td>${money(r.monto_conciliado)}</td>
        <td>${money(r.saldo_pendiente)}</td>
        <td>${KoguUi.int(r.numero_rep || 0)}</td>
        <td>${badgeStatus(r.estatus_conciliacion)}</td>
        <td>${badgeBool(r.tiene_incidencia)}</td>
      </tr>
    `).join('');
  }

  function renderPager() {
    const from = state.total === 0 ? 0 : state.offset + 1;
    const to = Math.min(state.offset + state.limit, state.total);
    document.getElementById('pagerInfo').textContent = `Mostrando ${from}-${to} de ${state.total}`;
    document.getElementById('prevBtn').disabled = state.offset <= 0;
    document.getElementById('nextBtn').disabled = state.offset + state.limit >= state.total;
  }

  async function consultar() {
    try {
      document.getElementById('statusMsg').textContent = 'Consultando bandeja REP...';

      const qs = buildQuery(true);
      const res = await KoguApi.apiFetch(`/protected/kogu/cfdi/rep/bandeja?${qs.toString()}`);
      const data = KoguApi.unwrapData(res) || {};

      state.total = Number(data.total || 0);

      renderRows(data.items || []);
      renderPager();

      document.getElementById('statusMsg').textContent =
        `Bandeja REP cargada para ${esc(data?.empresa?.nombre_corto || data?.empresa?.razon_social || 'empresa activa')}.`;
    } catch (err) {
      KoguApi.toast(err.message || 'No fue posible consultar la bandeja REP.', 'error');
      document.getElementById('statusMsg').textContent = err.message || 'No fue posible consultar la bandeja REP.';
      renderRows([]);
      state.total = 0;
      renderPager();
    }
  }

  async function exportarExcel() {
    const btn = document.getElementById('exportBtn');
    const original = btn.textContent;

    try {
      btn.disabled = true;
      btn.textContent = 'Exportando...';

      const qs = buildQuery(false);
      const response = await KoguApi.authFetchRaw(`/protected/kogu/cfdi/rep/exportar-excel?${qs.toString()}`, {
        method: 'GET',
        headers: {
          Accept: 'application/vnd.ms-excel, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/octet-stream, */*'
        }
      });

      if (!response.ok) {
        const ct = response.headers.get('content-type') || '';
        let message = `Error ${response.status}`;
        try {
          const data = ct.includes('application/json') ? await response.json() : await response.text();
          message = data?.error?.message || data?.message || data?.error || (typeof data === 'string' ? data : message);
        } catch {}
        throw new Error(message);
      }

      const blob = await response.blob();
      const disposition = response.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="?([^"]+)"?/i);
      const filename = match?.[1] || 'rep_conciliacion.xls';

      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);

      KoguApi.toast('Excel REP generado correctamente.', 'success');
    } catch (err) {
      KoguApi.toast(err.message || 'No fue posible exportar el Excel REP.', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  }

  document.getElementById('consultarBtn').onclick = () => {
    state.offset = 0;
    consultar();
  };

  document.getElementById('exportBtn').onclick = () => exportarExcel();

  document.getElementById('goResumenBtn').onclick = () => {
    window.location.href = '/modules/cfdi/rep/resumen-rep.html';
  };

  document.getElementById('prevBtn').onclick = () => {
    state.offset = Math.max(0, state.offset - state.limit);
    consultar();
  };

  document.getElementById('nextBtn').onclick = () => {
    state.offset += state.limit;
    consultar();
  };

  // Carga automática al abrir con defaults (Recibidos + mes actual)
  state.offset = 0;
  await consultar();
});
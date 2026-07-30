document.addEventListener('DOMContentLoaded', async () => {
  const boot = await KoguShell.initShell({
    currentPage: '/modules/cfdi/rep/emitidas-pendientes.html',
    title: 'PPD emitidas pendientes de complemento',
    description: 'Facturas PPD emitidas sin complemento de pago (REP) conciliado, priorizadas por antigüedad (0-30 / 31-60 / 60+ días).',
    requiredPermission: 'screen.cfdi.cfdi_facturas'
  });
  if (!boot) return;

  if (!boot.empresa_activa) {
    KoguApi.toast('No hay empresa activa. Selecciona una empresa para continuar.', 'error');
    setTimeout(() => window.location.href = '/modules/core/contexto/cambio-empresa.html', 1200);
    return;
  }

  const app = document.getElementById('pageContent');

  app.innerHTML = `
    <div class="stack">
      <div class="card">
        <div class="row" style="justify-content:space-between;gap:16px;flex-wrap:wrap;align-items:flex-end;">
          <div>
            <div class="eyebrow">Conciliación REP · Emitidos</div>
            <h2>PPD emitidas pendientes de complemento</h2>
            <p class="muted" style="margin-top:6px;">
              Facturas PPD que emitimos y aún no tienen su complemento de pago (REP) conciliado. Ordenadas por antigüedad. Conciliación documental CFDI-vs-CFDI (sin cruce con cobranza); la antigüedad no implica vencimiento fiscal por sí sola.
            </p>
          </div>
          <div class="page-actions">
            <button class="btn" id="recalcularBtn">Recalcular emitidos</button>
            <button class="btn" id="exportBtn">Exportar Excel</button>
            <button class="btn" id="consultarBtn">Consultar</button>
          </div>
        </div>

        <div class="grid-4" style="margin-top:16px;">
          <div>
            <label class="label-text">Antigüedad</label>
            <select class="input" id="bucket">
              <option value="">Todas</option>
              <option value="0-30">0-30 días</option>
              <option value="31-60">31-60 días</option>
              <option value="60+">60+ días</option>
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
            <label class="label-text">UUID</label>
            <input class="input" id="uuid" placeholder="Buscar por UUID" />
          </div>
          <div>
            <label class="label-text">Cliente (RFC)</label>
            <input class="input" id="rfc" placeholder="RFC receptor / contraparte" />
          </div>
          <div>
            <label class="label-text">Cliente (nombre)</label>
            <input class="input" id="contraparte" placeholder="Nombre contraparte" />
          </div>
          <div>
            <label class="label-text">Fecha desde</label>
            <input class="input" type="date" id="dateFrom" value="" />
          </div>
          <div>
            <label class="label-text">Fecha hasta</label>
            <input class="input" type="date" id="dateTo" value="" />
          </div>
        </div>

        <div class="hero-note" id="statusMsg" style="margin-top:12px;">Cargando...</div>
      </div>

      <div id="kpiStrip" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;"></div>

      <div class="card">
        <div class="row" style="justify-content:space-between;gap:16px;align-items:center;flex-wrap:wrap;">
          <div>
            <div class="eyebrow">Listado</div>
            <h2>Pendientes de complemento</h2>
          </div>
          <div class="muted" id="pagerInfo">Sin datos.</div>
        </div>

        <div class="table-wrap" style="margin-top:16px;">
          <table>
            <thead>
              <tr>
                <th>UUID</th>
                <th>Fecha</th>
                <th>Antigüedad</th>
                <th>Moneda</th>
                <th>Serie/Folio</th>
                <th>Cliente</th>
                <th>Total factura</th>
                <th>Conciliado</th>
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

  const state = { limit: 20, offset: 0, total: 0 };

  function esc(v) { return KoguUi.escapeHtml(String(v ?? '')); }
  function money(v) { return KoguUi.money(Number(v || 0)); }
  function shortDate(v) {
    if (!v) return '-';
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return String(v);
    return d.toLocaleDateString('es-MX');
  }

  function bucketChip(bucket, dias) {
    const d = Number(dias || 0);
    let cls = 'chip';
    if (bucket === '0-30') cls += ' success';
    else if (bucket === '31-60') cls += ' warn';
    else cls += ' danger';
    return `<span class="${cls}">${esc(bucket || '-')} · ${d} d</span>`;
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
    return flag ? '<span class="chip danger">Sí</span>' : '<span class="chip success">No</span>';
  }

  function buildQuery(includePaging = true) {
    const qs = new URLSearchParams();
    const bucket = document.getElementById('bucket').value;
    const moneda = document.getElementById('moneda').value;
    const uuid = document.getElementById('uuid').value.trim();
    const rfc = document.getElementById('rfc').value.trim();
    const contraparte = document.getElementById('contraparte').value.trim();
    const dateFrom = document.getElementById('dateFrom').value;
    const dateTo = document.getElementById('dateTo').value;

    if (bucket) qs.set('bucket', bucket);
    if (moneda) qs.set('moneda', moneda);
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

  function renderKpis(buckets) {
    const strip = document.getElementById('kpiStrip');
    const b = buckets || {};
    const card = (key, label, tone) => {
      const info = b[key] || { total: 0, saldo_pendiente: 0 };
      return `
        <div class="card kpi-bucket" data-bucket="${key}" style="cursor:pointer;">
          <div class="eyebrow">${label}</div>
          <div class="row" style="justify-content:space-between;align-items:baseline;gap:8px;">
            <div style="font-size:1.6rem;font-weight:700;">${KoguUi.int(info.total || 0)}</div>
            <span class="chip ${tone}">${label}</span>
          </div>
          <div class="muted" style="margin-top:4px;">Saldo: ${money(info.saldo_pendiente)}</div>
        </div>
      `;
    };
    strip.innerHTML =
      card('0-30', '0-30 días', 'success') +
      card('31-60', '31-60 días', 'warn') +
      card('60+', '60+ días', 'danger');

    strip.querySelectorAll('.kpi-bucket').forEach((el) => {
      el.onclick = () => {
        document.getElementById('bucket').value = el.getAttribute('data-bucket');
        state.offset = 0;
        consultar();
      };
    });
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
        <td>${esc(shortDate(r.fecha_emision))}</td>
        <td>${bucketChip(r.bucket_antiguedad, r.dias_antiguedad)}</td>
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
      document.getElementById('statusMsg').textContent = 'Consultando...';
      const qs = buildQuery(true);
      const res = await KoguApi.apiFetch(`/protected/kogu/cfdi/rep/emitidas-pendientes?${qs.toString()}`);
      const data = KoguApi.unwrapData(res) || {};
      state.total = Number(data.total || 0);
      renderKpis(data.buckets);
      renderRows(data.items || []);
      renderPager();
      const emp = data?.empresa?.nombre_corto || data?.empresa?.razon_social || 'empresa activa';
      document.getElementById('statusMsg').textContent =
        `${KoguUi.int(data.total_universo || 0)} PPD emitidas pendientes · saldo ${money(data.saldo_universo)} · ${esc(emp)}.`;
    } catch (err) {
      KoguApi.toast(err.message || 'No fue posible consultar.', 'error');
      document.getElementById('statusMsg').textContent = err.message || 'No fue posible consultar.';
      renderKpis({});
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
      qs.set('scope', 'emitidos'); // reusa el export REP existente (emitidos)
      const response = await KoguApi.authFetchRaw(`/protected/kogu/cfdi/rep/exportar-excel?${qs.toString()}`, {
        method: 'GET',
        headers: { Accept: 'application/vnd.ms-excel, application/octet-stream, */*' }
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
      const filename = match?.[1] || 'rep_emitidas_pendientes.xls';
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
      KoguApi.toast('Excel generado.', 'success');
    } catch (err) {
      KoguApi.toast(err.message || 'No fue posible exportar.', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  }

  async function recalcular() {
    const btn = document.getElementById('recalcularBtn');
    const original = btn.textContent;
    try {
      btn.disabled = true;
      btn.textContent = 'Recalculando...';
      const dateFrom = document.getElementById('dateFrom').value;
      const dateTo = document.getElementById('dateTo').value;
      const body = { scope: 'emitidos' };
      if (dateFrom) body.date_from = dateFrom;
      if (dateTo) body.date_to = dateTo;
      const res = await KoguApi.apiFetch('/protected/kogu/cfdi/rep/recalcular', {
        method: 'POST',
        body: JSON.stringify(body)
      });
      const data = KoguApi.unwrapData(res) || {};
      KoguApi.toast(`Recalculadas ${data.total_procesadas || 0} PPD emitidas.`, 'success');
      state.offset = 0;
      await consultar();
    } catch (err) {
      KoguApi.toast(err.message || 'No fue posible recalcular emitidos.', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  }

  document.getElementById('recalcularBtn').onclick = () => recalcular();
  document.getElementById('consultarBtn').onclick = () => { state.offset = 0; consultar(); };
  document.getElementById('exportBtn').onclick = () => exportarExcel();
  document.getElementById('bucket').onchange = () => { state.offset = 0; consultar(); };
  document.getElementById('prevBtn').onclick = () => { state.offset = Math.max(0, state.offset - state.limit); consultar(); };
  document.getElementById('nextBtn').onclick = () => { state.offset += state.limit; consultar(); };

  state.offset = 0;
  await consultar();
});

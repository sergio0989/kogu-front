document.addEventListener('DOMContentLoaded', async () => {
  const boot = await KoguShell.initShell({
    currentPage: '/modules/cfdi/bandeja-nomina/bandeja-nomina.html',
    title: 'Bandeja CFDI Nómina',
    description: 'Análisis de recibos de nómina emitidos por mes (fecha de pago). Detalle por recibo y datos para tabla dinámica (percepciones, deducciones, otros pagos y neto).',
    // Any-of: la comparten los perfiles cfdinomina y cfdi_solo_nomina.
    requiredPermission: ['cfdi.tipo.nomina.read', 'cfdi.alcance.solo_nomina']
  });
  if (!boot) return;

  if (!boot.empresa_activa) {
    KoguApi.toast('No hay empresa activa. Selecciona una empresa para continuar.', 'error');
    setTimeout(() => window.location.href = '/modules/core/contexto/cambio-empresa.html', 1200);
    return;
  }

  const app = document.getElementById('pageContent');

  // Mes por defecto = mes en curso (YYYY-MM).
  const now = new Date();
  const defMes = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  app.innerHTML = `
    <div class="stack">
      <div class="card">
        <div class="row" style="justify-content:space-between;gap:16px;flex-wrap:wrap;align-items:flex-end;">
          <div>
            <div class="eyebrow">Nómina · Emitida</div>
            <h2>Bandeja CFDI Nómina</h2>
            <p class="muted" style="margin-top:6px;">
              Recibos de nómina emitidos, agrupados por mes según la <strong>fecha de pago</strong>. El detalle es un renglón por recibo; la hoja "Datos" del Excel está lista para construir tu tabla dinámica (puedes agregar tu centro de costos).
            </p>
          </div>
          <div class="page-actions">
            <button class="btn" id="exportBtn">Exportar Excel</button>
            <button class="btn" id="consultarBtn">Consultar</button>
          </div>
        </div>

        <div class="grid-4" style="margin-top:16px;">
          <div>
            <label class="label-text">Mes (fecha de pago)</label>
            <input class="input" type="month" id="mes" value="${defMes}" />
          </div>
          <div>
            <label class="label-text">Núm. empleado</label>
            <input class="input" id="numEmpleado" placeholder="Buscar por número" />
          </div>
          <div>
            <label class="label-text">RFC empleado</label>
            <input class="input" id="rfc" placeholder="RFC receptor" />
          </div>
          <div>
            <label class="label-text">UUID</label>
            <input class="input" id="uuid" placeholder="Buscar por UUID" />
          </div>
        </div>

        <div class="hero-note" id="statusMsg" style="margin-top:12px;">Cargando...</div>
      </div>

      <div id="kpiStrip" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;"></div>

      <div class="card">
        <div class="row" style="justify-content:space-between;gap:16px;align-items:center;flex-wrap:wrap;">
          <div>
            <div class="eyebrow">Listado</div>
            <h2>Recibos de nómina</h2>
          </div>
          <div class="muted" id="pagerInfo">Sin datos.</div>
        </div>

        <div class="table-wrap" style="margin-top:16px;">
          <table>
            <thead>
              <tr>
                <th>Núm. emp.</th>
                <th>Empleado</th>
                <th>Departamento</th>
                <th>Puesto</th>
                <th>Estatus</th>
                <th>Fecha pago</th>
                <th>Días</th>
                <th>Percepciones</th>
                <th>Deducciones</th>
                <th>Otros pagos</th>
                <th>Neto</th>
              </tr>
            </thead>
            <tbody id="rows">
              <tr><td colspan="11" class="empty">Sin resultados.</td></tr>
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

  const state = { limit: 50, offset: 0, total: 0 };

  function esc(v) { return KoguUi.escapeHtml(String(v ?? '')); }
  function money(v) { return KoguUi.money(Number(v || 0)); }
  function shortDate(v) {
    if (!v) return '-';
    const s = String(v);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      const [y, m, d] = s.slice(0, 10).split('-');
      return `${d}/${m}/${y}`;
    }
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return s;
    return d.toLocaleDateString('es-MX');
  }

  function buildQuery(includePaging = true) {
    const qs = new URLSearchParams();
    const mes = document.getElementById('mes').value;
    const numEmpleado = document.getElementById('numEmpleado').value.trim();
    const rfc = document.getElementById('rfc').value.trim();
    const uuid = document.getElementById('uuid').value.trim();

    if (mes) qs.set('mes', mes);
    if (numEmpleado) qs.set('num_empleado', numEmpleado);
    if (rfc) qs.set('rfc', rfc);
    if (uuid) qs.set('uuid', uuid);

    if (includePaging) {
      qs.set('limit', state.limit);
      qs.set('offset', state.offset);
    }
    return qs;
  }

  function estatusBadge(v) {
    const st = String(v || '').toUpperCase();
    if (st === 'CANCELADO') return '<span class="chip danger">Cancelado</span>';
    if (st === 'VIGENTE') return '<span class="chip success">Vigente</span>';
    return `<span class="chip">${esc(v || '-')}</span>`;
  }

  function renderKpis(kpis) {
    const strip = document.getElementById('kpiStrip');
    const k = kpis || {};
    const card = (label, value, tone, isMoney) => `
      <div class="card">
        <div class="eyebrow">${label}</div>
        <div class="row" style="justify-content:space-between;align-items:baseline;gap:8px;">
          <div style="font-size:1.5rem;font-weight:700;">${isMoney ? money(value) : KoguUi.int(value || 0)}</div>
          ${tone ? `<span class="chip ${tone}">${label}</span>` : ''}
        </div>
      </div>
    `;
    strip.innerHTML =
      card('Recibos', k.total_recibos, '') +
      card('Empleados', k.total_empleados, '') +
      card('Percepciones', k.suma_percepciones, 'success', true) +
      card('Deducciones', k.suma_deducciones, 'danger', true) +
      card('Otros pagos', k.suma_otros_pagos, 'warn', true) +
      card('Neto', k.suma_neto, '', true) +
      card('Cancelados', k.cancelados, 'danger');
  }

  function renderRows(items) {
    const tbody = document.getElementById('rows');
    if (!items?.length) {
      tbody.innerHTML = '<tr><td colspan="11" class="empty">Sin resultados.</td></tr>';
      return;
    }
    tbody.innerHTML = items.map((r) => `
      <tr>
        <td class="mono">${esc(r.receptor_num_empleado || '-')}</td>
        <td>
          <div class="status-stack">
            <div>${esc(r.receptor_nombre || '-')}</div>
            <div class="muted mono">${esc(r.receptor_rfc || '-')}</div>
          </div>
        </td>
        <td>${esc(r.receptor_departamento || '-')}</td>
        <td>${esc(r.receptor_puesto || '-')}</td>
        <td>${estatusBadge(r.estatus_sat)}</td>
        <td>${esc(shortDate(r.fecha_pago))}</td>
        <td>${KoguUi.int(Number(r.num_dias_pagados || 0))}</td>
        <td>${money(r.total_percepciones)}</td>
        <td>${money(r.total_deducciones)}</td>
        <td>${money(r.total_otros_pagos)}</td>
        <td><strong>${money(r.neto)}</strong></td>
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
      const res = await KoguApi.apiFetch(`/protected/kogu/cfdi/nomina/bandeja?${qs.toString()}`);
      const data = KoguApi.unwrapData(res) || {};
      state.total = Number(data.total || 0);
      renderKpis(data.kpis);
      renderRows(data.items || []);
      renderPager();
      const emp = data?.empresa?.nombre_corto || data?.empresa?.razon_social || 'empresa activa';
      const mesLbl = data?.mes?.etiqueta || document.getElementById('mes').value;
      const nCancel = Number(data?.kpis?.cancelados || 0);
      const cancelTxt = nCancel ? ` · ${KoguUi.int(nCancel)} cancelados (no cuentan)` : '';
      document.getElementById('statusMsg').textContent =
        `${KoguUi.int(data?.kpis?.total_recibos || 0)} recibos · ${KoguUi.int(data?.kpis?.total_empleados || 0)} empleados · neto ${money(data?.kpis?.suma_neto)} · ${esc(mesLbl)} · ${esc(emp)}.${cancelTxt}`;
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
      const response = await KoguApi.authFetchRaw(`/protected/kogu/cfdi/nomina/exportar-excel?${qs.toString()}`, {
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
      const filename = match?.[1] || 'nomina.xls';
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
      KoguApi.toast('Excel de nómina generado.', 'success');
    } catch (err) {
      KoguApi.toast(err.message || 'No fue posible exportar.', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  }

  document.getElementById('consultarBtn').onclick = () => { state.offset = 0; consultar(); };
  document.getElementById('exportBtn').onclick = () => exportarExcel();
  document.getElementById('mes').onchange = () => { state.offset = 0; consultar(); };
  document.getElementById('prevBtn').onclick = () => { state.offset = Math.max(0, state.offset - state.limit); consultar(); };
  document.getElementById('nextBtn').onclick = () => { state.offset += state.limit; consultar(); };

  state.offset = 0;
  await consultar();
});

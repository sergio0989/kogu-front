document.addEventListener('DOMContentLoaded', async () => {
  const boot = await KoguShell.initShell({
    currentPage: '/modules/cfdi/rep/resumen-rep.html',
    title: 'Resumen REP / Cobranza Fiscal',
    description: 'Control ejecutivo de facturas PPD conciliadas contra REP por empresa activa, scope y moneda.',
    requiredPermission: 'screen.cfdi.sat_dm'
  });
  if (!boot) return;

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
      <div class="card" style="padding:16px 20px;">
        <div class="row" style="justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center;">
          <div>
            <div class="eyebrow">Conciliación REP</div>
            <h2 style="margin:2px 0 0;">Resumen ejecutivo</h2>
          </div>
          <div class="page-actions">
            <button class="btn" id="goBandejaBtn">Ir a bandeja</button>
            <button class="btn primary" id="recalcularBtn">Recalcular</button>
          </div>
        </div>

        <div class="grid-4" style="margin-top:12px;">
          <div>
            <label class="label-text">Scope</label>
            <select class="input" id="scope">
              <option value="todos">Todos</option>
              <option value="emitidos">Emitidos</option>
              <option value="recibidos" selected>Recibidos</option>
            </select>
          </div>
          <div>
            <label class="label-text">Fecha desde</label>
            <input class="input" type="date" id="dateFrom" value="${primerDia}" />
          </div>
          <div>
            <label class="label-text">Fecha hasta</label>
            <input class="input" type="date" id="dateTo" value="${ultimoDia}" />
          </div>
          <div style="display:flex;align-items:flex-end;">
            <button class="btn" id="consultarBtn" style="width:100%;">Consultar</button>
          </div>
        </div>

        <div class="hero-note" id="statusMsg" style="margin-top:10px;">Cargando resumen...</div>
      </div>

      <div class="grid-2" id="bloques"></div>
    </div>
  `;

  function money(v) { return KoguUi.money(Number(v || 0)); }
  function esc(v)   { return KoguUi.escapeHtml(String(v ?? '')); }

  function buildStatBlock(label, data) {
    const d = data || {};
    const sinRep     = d.sin_rep        || 0;
    const incid      = d.incidencias    || 0;
    const saldo      = d.saldo_pendiente || 0;

    const rows = [
      ['PPD',             KoguUi.int(d.total_ppd        || 0), ''],
      ['Conciliados',     KoguUi.int(d.conciliados      || 0), ''],
      ['Sin REP',         KoguUi.int(sinRep),                   sinRep  > 0 ? 'kv-highlight' : ''],
      ['Parciales',       KoguUi.int(d.parciales        || 0), ''],
      ['Sobreconcil.',    KoguUi.int(d.sobreconciliados || 0), ''],
      ['REP cancelados',  KoguUi.int(d.rep_cancelados   || 0), ''],
      ['Incidencias',     KoguUi.int(incid),                    incid   > 0 ? 'kv-danger'   : ''],
      ['Facturado',       money(d.total_facturado        || 0), ''],
      ['Conciliado',      money(d.total_conciliado       || 0), 'kv-success'],
      ['Saldo pendiente', money(saldo),                         saldo   > 0 ? 'kv-highlight' : ''],
    ];

    return `
      <div class="card" style="padding:14px 16px;">
        <div class="eyebrow" style="margin-bottom:10px;">${esc(label)}</div>
        <table class="kv-table">
          <tbody>
            ${rows.map(([k, v, cls]) => `
              <tr class="${cls}">
                <td>${k}</td>
                <td>${v}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderBloques(data, scope) {
    const contenedor = document.getElementById('bloques');
    let html = '';

    if (scope === 'emitidos' || scope === 'todos') {
      html += buildStatBlock('Emitidos MXN', data?.emitido?.mxn);
      html += buildStatBlock('Emitidos USD', data?.emitido?.usd);
    }
    if (scope === 'recibidos' || scope === 'todos') {
      html += buildStatBlock('Recibidos MXN', data?.recibido?.mxn);
      html += buildStatBlock('Recibidos USD', data?.recibido?.usd);
    }

    contenedor.innerHTML = html;
  }

  async function consultarResumen() {
    const scope    = document.getElementById('scope').value;
    const dateFrom = document.getElementById('dateFrom').value;
    const dateTo   = document.getElementById('dateTo').value;

    try {
      document.getElementById('statusMsg').textContent = 'Consultando resumen REP...';

      const qs = new URLSearchParams();
      if (scope)    qs.set('scope',     scope);
      if (dateFrom) qs.set('date_from', dateFrom);
      if (dateTo)   qs.set('date_to',   dateTo);

      const res  = await KoguApi.apiFetch(`/protected/kogu/cfdi/rep/resumen?${qs.toString()}`);
      const data = KoguApi.unwrapData(res) || {};

      renderBloques(data, scope);
      document.getElementById('statusMsg').textContent =
        `Resumen cargado para ${esc(data?.empresa?.nombre_corto || data?.empresa?.razon_social || 'empresa activa')}.`;
    } catch (err) {
      KoguApi.toast(err.message || 'No fue posible consultar el resumen REP.', 'error');
      document.getElementById('statusMsg').textContent = err.message || 'Error al consultar.';
    }
  }

  async function recalcular() {
    const scope    = document.getElementById('scope').value;
    const dateFrom = document.getElementById('dateFrom').value;
    const dateTo   = document.getElementById('dateTo').value;

    const btn = document.getElementById('recalcularBtn');
    const original = btn.textContent;

    try {
      btn.disabled = true;
      btn.textContent = 'Recalculando...';
      document.getElementById('statusMsg').textContent = 'Recalculando conciliación REP...';

      const res  = await KoguApi.apiFetch('/protected/kogu/cfdi/rep/recalcular', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope, date_from: dateFrom || null, date_to: dateTo || null })
      });

      const data = KoguApi.unwrapData(res) || {};
      KoguApi.toast(`Recálculo terminado. Procesadas: ${KoguUi.int(data.total_procesadas || 0)}.`, 'success');
      await consultarResumen();
    } catch (err) {
      KoguApi.toast(err.message || 'No fue posible recalcular REP.', 'error');
      document.getElementById('statusMsg').textContent = err.message || 'Error al recalcular.';
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  }

  document.getElementById('consultarBtn').onclick  = consultarResumen;
  document.getElementById('recalcularBtn').onclick  = recalcular;
  document.getElementById('goBandejaBtn').onclick   = () => {
    window.location.href = '/modules/cfdi/rep/bandeja-rep.html';
  };

  // Carga automática al abrir con los defaults
  await consultarResumen();
});
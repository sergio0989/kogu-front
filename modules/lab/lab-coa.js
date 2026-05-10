// ============================================================
// lab-coa.js
// Lista paginada de Certificados de Análisis emitidos.
// Drill-down a lab-coa-detalle.html?id=<coa_id>.
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/lab/lab-coa.html';
  const BASE = '/protected/lab/coa';
  const PERM = 'screen.lab.coa';

  const ESTADOS = [
    { code: 'emitido',    label: 'Emitido',    color: '#16a34a' },
    { code: 'anulado',    label: 'Anulado',    color: '#dc2626' },
    { code: 'sustituido', label: 'Sustituido', color: '#94a3b8' },
  ];

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Certificados COA',
    description: 'Certificados de Análisis emitidos a clientes.',
    requiredPermission: PERM,
  });
  if (!b) return;

  const c = document.getElementById('pageContent');
  c.innerHTML = `
<div class="card">
  <div class="row">
    <div><div class="eyebrow">Lab QA</div><h2>Certificados COA</h2></div>
    <div style="display:flex;gap:8px">
      <button class="btn ghost" id="refreshBtn">Actualizar</button>
      <button class="btn primary" id="newCoaBtn">+ Nuevo COA por factura</button>
    </div>
  </div>

  <div class="grid-2" style="margin-top:16px;gap:10px">
    <input  class="input"  id="q" placeholder="Buscar por folio, lote, cliente o cve_prod"/>
    <select class="select" id="estadoFil">
      <option value="">Todos los estados</option>
      ${ESTADOS.map(s => `<option value="${s.code}">${s.label}</option>`).join('')}
    </select>
    <div style="display:flex;gap:6px">
      <input class="input" type="date" id="desde" title="Desde"/>
      <input class="input" type="date" id="hasta" title="Hasta"/>
    </div>
  </div>

  <div class="table-wrap" style="margin-top:16px">
    <table><thead><tr>
      <th>Folio</th>
      <th>Cliente</th>
      <th>Producto / Lote</th>
      <th>Idioma</th>
      <th>Estado</th>
      <th>Emitido</th>
      <th></th>
    </tr></thead><tbody id="rowsCoa"></tbody></table>
  </div>

  <div id="pgBarCoa" style="display:flex;align-items:center;justify-content:space-between;margin-top:14px;flex-wrap:wrap;gap:10px;font-size:13px;color:var(--muted)">
    <div id="pgInfoCoa">—</div>
    <div style="display:flex;align-items:center;gap:6px">
      <span>Por página:</span>
      <select class="select" id="pgSizeCoa" style="width:80px">
        <option value="10">10</option>
        <option value="25" selected>25</option>
        <option value="50">50</option>
        <option value="100">100</option>
      </select>
      <button class="btn ghost" id="pgFirstCoa" title="Primera">«</button>
      <button class="btn ghost" id="pgPrevCoa"  title="Anterior">‹</button>
      <span id="pgNumerosCoa" style="display:flex;gap:4px"></span>
      <button class="btn ghost" id="pgNextCoa"  title="Siguiente">›</button>
      <button class="btn ghost" id="pgLastCoa"  title="Última">»</button>
    </div>
  </div>
</div>
  `;

  let coas = [];
  let currentPage = 1;
  let pageSize    = 25;
  let totalPages  = 1;
  let totalCoas   = 0;

  const $ = (id) => document.getElementById(id);

  async function loadCoas(showToast = false, { resetPage = false } = {}) {
    if (resetPage) currentPage = 1;
    const params = new URLSearchParams();
    if ($('q').value.trim())  params.set('q', $('q').value.trim());
    if ($('estadoFil').value) params.set('estado', $('estadoFil').value);
    if ($('desde').value)     params.set('desde', $('desde').value);
    if ($('hasta').value)     params.set('hasta', $('hasta').value);
    params.set('page',     String(currentPage));
    params.set('pageSize', String(pageSize));

    try {
      const res = await KoguApi.apiFetch(`${BASE}?${params.toString()}`);
      coas = KoguApi.unwrapData(res) || [];
      const meta = res?.meta || {};
      totalCoas   = parseInt(meta.total ?? coas.length, 10) || 0;
      pageSize    = parseInt(meta.pageSize ?? pageSize, 10) || pageSize;
      currentPage = parseInt(meta.page ?? currentPage, 10) || 1;
      totalPages  = parseInt(meta.totalPages ?? 1, 10) || 1;
      renderTabla();
      renderPaginacion();
      if (showToast) KoguApi.toast('COAs actualizados', 'success');
    } catch (err) { KoguApi.toast(err.message, 'error'); }
  }

  function renderTabla() {
    const tbody = $('rowsCoa');
    if (!coas.length) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--muted)">Sin COAs emitidos para los filtros aplicados.</td></tr>`;
      return;
    }
    tbody.innerHTML = coas.map(c => {
      const estado = ESTADOS.find(s => s.code === c.estado) || { label: c.estado, color: '#64748b' };
      const fecha = c.fecha_emision ? new Date(c.fecha_emision).toLocaleString() : '—';
      return `
        <tr>
          <td><strong>${escapeHtml(c.folio_coa)}</strong>${c.tiene_excepcion ? ' <span class="chip" style="background:#fef3c7;color:#92400e;font-size:11px">excep.</span>' : ''}</td>
          <td>${escapeHtml(c.cliente_nombre || '—')}<br><span class="muted" style="font-size:12px">${escapeHtml(c.cliente_rfc || '')}</span></td>
          <td>${escapeHtml(c.cve_prod || '')}<br><span class="muted" style="font-size:12px">Lote ${escapeHtml(c.numero_lote || '')}</span></td>
          <td><span class="chip" style="background:#e0f2fe;color:#075985;text-transform:uppercase;font-size:11px">${escapeHtml(c.idioma)}</span></td>
          <td><span class="chip" style="background:${estado.color}22;color:${estado.color}">${estado.label}</span></td>
          <td>${fecha}<br><span class="muted" style="font-size:12px">por ${escapeHtml(c.emisor_nombre || '—')}</span></td>
          <td style="text-align:right">
            <button class="btn ghost" data-coa-id="${c.coa_id}">Abrir</button>
          </td>
        </tr>`;
    }).join('');

    tbody.querySelectorAll('button[data-coa-id]').forEach(btn => {
      btn.addEventListener('click', () => {
        window.location.href = `/modules/lab/lab-coa-detalle.html?id=${btn.dataset.coaId}`;
      });
    });
  }

  function renderPaginacion() {
    const inicio = totalCoas === 0 ? 0 : (currentPage - 1) * pageSize + 1;
    const fin    = Math.min(currentPage * pageSize, totalCoas);
    $('pgInfoCoa').textContent = totalCoas
      ? `Mostrando ${inicio}–${fin} de ${totalCoas} COA${totalCoas === 1 ? '' : 's'}`
      : 'Sin resultados';
    $('pgFirstCoa').disabled = currentPage <= 1;
    $('pgPrevCoa').disabled  = currentPage <= 1;
    $('pgNextCoa').disabled  = currentPage >= totalPages;
    $('pgLastCoa').disabled  = currentPage >= totalPages;

    const ventana = 2;
    let from = Math.max(1, currentPage - ventana);
    let to   = Math.min(totalPages, currentPage + ventana);
    if (currentPage <= 3) to = Math.min(totalPages, 5);
    if (currentPage >= totalPages - 2) from = Math.max(1, totalPages - 4);

    const nums = $('pgNumerosCoa'); nums.innerHTML = '';
    if (from > 1) {
      nums.appendChild(makePgBtn(1));
      if (from > 2) { const d = document.createElement('span'); d.textContent = '…'; d.style.padding='0 6px'; nums.appendChild(d); }
    }
    for (let i = from; i <= to; i++) nums.appendChild(makePgBtn(i));
    if (to < totalPages) {
      if (to < totalPages - 1) { const d = document.createElement('span'); d.textContent = '…'; d.style.padding='0 6px'; nums.appendChild(d); }
      nums.appendChild(makePgBtn(totalPages));
    }
  }
  function makePgBtn(num) {
    const b = document.createElement('button');
    b.className = 'btn ghost';
    b.textContent = String(num);
    if (num === currentPage) { b.classList.add('primary'); b.classList.remove('ghost'); }
    b.addEventListener('click', () => { if (num !== currentPage) { currentPage = num; loadCoas(); } });
    return b;
  }

  $('newCoaBtn').addEventListener('click', () => {
    window.location.href = '/modules/lab/lab-coa-emitir.html';
  });
  $('refreshBtn').addEventListener('click', () => loadCoas(true));
  $('q').addEventListener('input', debounce(() => loadCoas(false, { resetPage: true }), 300));
  $('estadoFil').addEventListener('change', () => loadCoas(false, { resetPage: true }));
  $('desde').addEventListener('change',     () => loadCoas(false, { resetPage: true }));
  $('hasta').addEventListener('change',     () => loadCoas(false, { resetPage: true }));
  $('pgSizeCoa').addEventListener('change', (e) => { pageSize = parseInt(e.target.value, 10) || 25; loadCoas(false, { resetPage: true }); });
  $('pgFirstCoa').addEventListener('click', () => { if (currentPage > 1) { currentPage = 1; loadCoas(); } });
  $('pgPrevCoa').addEventListener('click',  () => { if (currentPage > 1) { currentPage--;    loadCoas(); } });
  $('pgNextCoa').addEventListener('click',  () => { if (currentPage < totalPages) { currentPage++; loadCoas(); } });
  $('pgLastCoa').addEventListener('click',  () => { if (currentPage < totalPages) { currentPage = totalPages; loadCoas(); } });

  KoguShell.subscribeEmpresaActivaChange(() => loadCoas(true, { resetPage: true }));

  function escapeHtml(s) { return String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m]); }
  function debounce(fn, ms) { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); }; }

  await loadCoas();
});

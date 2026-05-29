document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/rc/asignacion.html';
  const BASE = '/protected/rc';
  const PERM = 'screen.ventas.agentes';

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Asignación de clientes',
    description: 'Relaciona cada cliente con su agente comercial. Es la fuente de verdad del Radar (no el ERP).',
    requiredPermission: PERM,
  });
  if (!b) return;

  const c = document.getElementById('pageContent');
  c.innerHTML = `
<div class="stack" style="gap:16px">
  <div class="card">
    <div class="row">
      <div><div class="eyebrow">Radar Comercial</div><h2>Asignar agente a clientes</h2></div>
      <div id="resumen" style="font-size:13px;color:var(--muted)">—</div>
    </div>

    <div class="grid-2" style="gap:12px;margin-top:14px">
      <input class="input" id="q" placeholder="Buscar por nombre o clave de cliente" />
      <select class="select" id="sinAgenteFil">
        <option value="">Todos los clientes</option>
        <option value="true">Solo sin agente</option>
      </select>
    </div>

    <!-- Barra de asignación masiva -->
    <div style="display:flex;gap:10px;align-items:end;margin-top:12px;padding:12px;background:var(--panel2,#f1f5f9);border-radius:10px;flex-wrap:wrap">
      <div style="flex:1;min-width:200px">
        <div class="label-text">Asignar seleccionados a</div>
        <select class="select" id="bulkAgente"><option value="">— Elegir agente —</option></select>
      </div>
      <button class="btn primary" id="bulkBtn">Asignar (<span id="selCount">0</span>)</button>
      <button class="btn" id="bulkClear">Quitar agente a seleccionados</button>
    </div>

    <div class="table-wrap" style="margin-top:14px">
      <table><thead><tr>
        <th style="width:34px"><input type="checkbox" id="selAll" /></th>
        <th>Cve</th><th>Cliente</th><th style="text-align:right">Venta año</th><th style="min-width:220px">Agente</th>
      </tr></thead><tbody id="rows"></tbody></table>
    </div>
    <div class="hint" style="margin-top:8px;color:var(--muted);font-size:12px">Muestra hasta 500 clientes, ordenados por venta del año (mayor primero). Usa el buscador para acotar.</div>
  </div>
</div>`;

  const val = id => document.getElementById(id)?.value?.trim() ?? '';
  const sel = id => document.getElementById(id)?.value ?? '';
  const money = v => KoguUi.money(Number(v || 0));
  const nf0 = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 });

  let clientes = [];
  let agentes = [];

  function agenteOptions(selected) {
    return '<option value="">— Sin agente —</option>' + agentes
      .map(a => `<option value="${a.agente_id}" ${a.agente_id === selected ? 'selected' : ''}>${KoguUi.escapeHtml(`${a.cve_agente} · ${a.nombre}`)}</option>`)
      .join('');
  }

  async function loadAgentes() {
    const res = await KoguApi.apiFetch(`${BASE}/agentes?activo=true`);
    agentes = KoguApi.unwrapRows(res);
    document.getElementById('bulkAgente').innerHTML =
      '<option value="">— Elegir agente —</option>' + agentes.map(a => `<option value="${a.agente_id}">${KoguUi.escapeHtml(`${a.cve_agente} · ${a.nombre}`)}</option>`).join('');
  }

  async function loadClientes() {
    const qs = new URLSearchParams();
    if (val('q')) qs.set('q', val('q'));
    if (sel('sinAgenteFil')) qs.set('sin_agente', sel('sinAgenteFil'));
    const res = await KoguApi.apiFetch(`${BASE}/asignacion/clientes?${qs.toString()}`);
    const data = res?.data || res;
    clientes = (data.rows || []);
    const r = data.resumen || {};
    document.getElementById('resumen').innerHTML =
      `Con agente: <b>${r.con_agente ?? 0}</b> · Sin agente: <b style="color:var(--danger,#dc2626)">${r.sin_agente ?? 0}</b> · Total: ${r.total ?? 0}`;
    renderRows();
  }

  function renderRows() {
    document.getElementById('rows').innerHTML = clientes.length ? clientes.map(c => `
      <tr>
        <td><input type="checkbox" class="selRow" data-id="${c.cliente_id}" /></td>
        <td><span class="chip-compact">${KoguUi.escapeHtml(c.cve_cte || '—')}</span></td>
        <td>${KoguUi.escapeHtml(c.nombre || '')}</td>
        <td style="text-align:right;font-size:12px">${money(c.venta_imp)}<br><span style="color:var(--muted)">${nf0.format(Number(c.venta_qty || 0))} kg</span></td>
        <td>
          <select class="select rowAgente" data-id="${c.cliente_id}" style="${c.agente_venta_1_id ? '' : 'border-color:var(--danger,#dc2626)'}">
            ${agenteOptions(c.agente_venta_1_id)}
          </select>
        </td>
      </tr>`).join('') : '<tr><td colspan="5" class="empty">Sin clientes para el filtro</td></tr>';

    document.querySelectorAll('.rowAgente').forEach(s => s.onchange = async () => {
      await asignar(s.value || null, [s.dataset.id]);
    });
    document.querySelectorAll('.selRow').forEach(x => x.onchange = updateSelCount);
    updateSelCount();
  }

  function checkedIds() {
    return [...document.querySelectorAll('.selRow:checked')].map(x => x.dataset.id);
  }
  function updateSelCount() {
    document.getElementById('selCount').textContent = String(checkedIds().length);
  }

  async function asignar(agenteId, clienteIds) {
    if (!clienteIds.length) { KoguApi.toast('Selecciona al menos un cliente.', 'error'); return; }
    try {
      const res = await KoguApi.apiFetch(`${BASE}/asignacion/agente`, {
        method: 'POST', body: JSON.stringify({ agente_id: agenteId, cliente_ids: clienteIds }),
      });
      const d = res?.data || res;
      KoguApi.toast(`${d.asignados} cliente(s) actualizado(s)`, 'success');
      await loadClientes();
    } catch (err) { KoguApi.toast(err.message, 'error'); }
  }

  document.getElementById('bulkBtn').onclick = (e) => KoguUi.withLoading(e.target, async () => {
    const ag = sel('bulkAgente');
    if (!ag) { KoguApi.toast('Elige un agente.', 'error'); return; }
    await asignar(ag, checkedIds());
  }, 'Asignando...');

  document.getElementById('bulkClear').onclick = (e) => KoguUi.withLoading(e.target, async () => {
    await asignar(null, checkedIds());
  }, 'Quitando...');

  document.getElementById('selAll').onchange = (e) => {
    document.querySelectorAll('.selRow').forEach(x => { x.checked = e.target.checked; });
    updateSelCount();
  };
  let qTimer = null;
  document.getElementById('q').oninput = () => { clearTimeout(qTimer); qTimer = setTimeout(loadClientes, 350); };
  document.getElementById('sinAgenteFil').onchange = loadClientes;

  KoguShell.subscribeEmpresaActivaChange(async () => { await loadAgentes(); await loadClientes(); });

  await loadAgentes();
  await loadClientes();
});

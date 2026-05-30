document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/rc/asignacion-pp.html';
  const BASE = '/protected/rc';
  const PERM = 'screen.ventas.direccion';

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Asignación PP',
    description: 'Asigna cada (cliente, producto) a su clave de presupuesto (ClavePP) · Radar Comercial.',
    requiredPermission: PERM,
  });
  if (!b) return;

  const c = document.getElementById('pageContent');
  c.innerHTML = `
<div class="stack" style="gap:16px">
  <div class="card">
    <div class="row">
      <div>
        <div class="eyebrow">Radar · Presupuesto</div>
        <h2>Asignación de presupuesto (cliente · producto → ClavePP)</h2>
        <div class="hint" style="margin-top:4px;color:var(--muted)">Las combinaciones se registran solas al sincronizar ventas. Aquí solo confirmas las pendientes.</div>
      </div>
      <button class="btn primary" id="syncBtn">↻ Sincronizar asignaciones</button>
    </div>
    <div id="resumen" style="margin-top:14px"></div>
    <div class="grid-2" style="gap:12px;margin-top:14px;align-items:end">
      <div>
        <div class="label-text">Estado</div>
        <select class="select" id="statusFil">
          <option value="pendiente">Pendientes</option>
          <option value="asignado">Asignadas</option>
          <option value="">Todas</option>
        </select>
      </div>
      <div>
        <div class="label-text">Buscar (cliente, producto, descripción)</div>
        <input class="input" id="qFil" placeholder="WWP0164, 308, cebolla…"/>
      </div>
    </div>
  </div>

  <div class="card">
    <div class="row" style="margin-bottom:10px">
      <div class="eyebrow" id="tblInfo">—</div>
      <button class="btn primary" id="saveBtn" disabled>Guardar cambios</button>
    </div>
    <div id="tabla"></div>
  </div>
</div>`;

  // ── Estado / helpers ────────────────────────────────────────────────────────
  let data = { items: [], sublineas: [], conteo: {} };
  const dirty = new Map();   // key -> cve_sublinea nuevo
  const sel = id => document.getElementById(id)?.value ?? '';
  const keyOf = it => `${it.cve_cte}|${it.cve_prod}`;
  const miniCard = (lbl, val, hint = '', color = '') => `
    <div style="border:1px solid var(--line);border-radius:10px;padding:9px 12px">
      <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.03em">${KoguUi.escapeHtml(lbl)}</div>
      <div style="font-size:17px;font-weight:800;line-height:1.15;margin-top:1px;${color ? `color:${color}` : ''}">${KoguUi.escapeHtml(val)}</div>
      ${hint ? `<div style="font-size:10px;color:var(--muted)">${KoguUi.escapeHtml(hint)}</div>` : ''}
    </div>`;

  function optionsHtml(sel) {
    const blank = `<option value="" ${!sel ? 'selected' : ''}>— sin asignar —</option>`;
    return blank + data.sublineas.map(s =>
      `<option value="${KoguUi.escapeHtml(s.cve_sublinea)}" ${s.cve_sublinea === sel ? 'selected' : ''}>${KoguUi.escapeHtml(s.cve_sublinea)} · ${KoguUi.escapeHtml(s.sublinea_nombre)}</option>`).join('');
  }

  function renderResumen() {
    const k = data.conteo || {};
    const total = Number(k.total || 0), asg = Number(k.asignados || 0), pend = Number(k.pendientes || 0);
    const cob = total ? Math.round(100 * asg / total) : 0;
    document.getElementById('resumen').innerHTML = `
      <div class="grid-4" style="gap:10px">
        ${miniCard('Combinaciones', String(total), 'cliente · producto')}
        ${miniCard('Asignadas', String(asg), `${cob}% de cobertura`, 'var(--ok,#16a34a)')}
        ${miniCard('Pendientes', String(pend), 'por confirmar', pend ? 'var(--danger,#dc2626)' : '')}
        ${miniCard('Sublíneas PP', String(data.sublineas.length), 'claves del presupuesto')}
      </div>`;
  }

  const ORI = { seed: 'Histórico', auto: 'Auto', manual: 'Manual' };
  function renderTabla() {
    const items = data.items;
    document.getElementById('tblInfo').textContent =
      `${items.length} fila(s)${items.length === 500 ? ' (tope 500, afina la búsqueda)' : ''}`;
    if (!items.length) {
      document.getElementById('tabla').innerHTML = '<div class="empty">Sin combinaciones para el filtro.</div>';
      return;
    }
    const filas = items.map(it => {
      const k = keyOf(it);
      const cur = dirty.has(k) ? dirty.get(k) : (it.cve_sublinea || '');
      const isDirty = dirty.has(k);
      const pend = it.status === 'pendiente';
      const estado = pend
        ? '<span style="display:inline-block;padding:2px 9px;border-radius:999px;font-size:11px;font-weight:600;color:#fff;background:var(--danger,#dc2626)">Pendiente</span>'
        : '<span style="display:inline-block;padding:2px 9px;border-radius:999px;font-size:11px;font-weight:600;color:#fff;background:var(--ok,#16a34a)">Asignada</span>';
      return `<tr style="${isDirty ? 'background:var(--panel2,#f8fafc)' : ''}">
        <td>${estado}<div style="font-size:10px;color:var(--muted);margin-top:2px">${ORI[it.origen] || it.origen}</div></td>
        <td><div style="font-weight:600">${KoguUi.escapeHtml(it.cliente_nombre || ('Cliente ' + it.cve_cte))}</div><div style="font-size:11px;color:var(--muted)">cve ${KoguUi.escapeHtml(it.cve_cte)}</div></td>
        <td><span class="chip-compact">${KoguUi.escapeHtml(it.cve_prod)}</span><div style="font-size:11px;color:var(--muted);margin-top:2px">${KoguUi.escapeHtml(it.desc_prod || '')}</div></td>
        <td style="min-width:260px">
          <select class="select" data-key="${KoguUi.escapeHtml(k)}" style="width:100%">${optionsHtml(cur)}</select>
          ${it.notas ? `<div style="font-size:11px;color:var(--warning,#d97706);margin-top:3px">${KoguUi.escapeHtml(it.notas)}</div>` : ''}
        </td>
      </tr>`;
    }).join('');
    document.getElementById('tabla').innerHTML = `
      <div class="table-wrap"><table><thead><tr>
        <th>Estado</th><th>Cliente</th><th>Producto</th><th>ClavePP (sublínea)</th>
      </tr></thead><tbody>${filas}</tbody></table></div>`;
    document.querySelectorAll('#tabla select[data-key]').forEach(s => s.onchange = () => {
      const k = s.dataset.key;
      const it = items.find(x => keyOf(x) === k);
      const orig = it?.cve_sublinea || '';
      if (s.value === orig) dirty.delete(k); else dirty.set(k, s.value);
      renderSaveBtn();
      const tr = s.closest('tr'); if (tr) tr.style.background = dirty.has(k) ? 'var(--panel2,#f8fafc)' : '';
    });
    renderSaveBtn();
  }

  function renderSaveBtn() {
    const n = [...dirty.values()].filter(v => v).length;
    const btn = document.getElementById('saveBtn');
    btn.disabled = n === 0;
    btn.textContent = n ? `Guardar cambios (${n})` : 'Guardar cambios';
  }

  // ── Carga ───────────────────────────────────────────────────────────────────
  async function load() {
    const qs = new URLSearchParams();
    if (sel('statusFil')) qs.set('status', sel('statusFil'));
    if (sel('qFil')) qs.set('q', sel('qFil'));
    const res = await KoguApi.apiFetch(`${BASE}/pp/asignaciones?${qs.toString()}`);
    data = res?.data || res;
    data.items = data.items || [];
    data.sublineas = data.sublineas || [];
    dirty.clear();
    renderResumen();
    renderTabla();
  }

  // ── Eventos ──────────────────────────────────────────────────────────────────
  let qTimer = null;
  document.getElementById('qFil').oninput = () => { clearTimeout(qTimer); qTimer = setTimeout(load, 350); };
  document.getElementById('statusFil').onchange = load;

  document.getElementById('syncBtn').onclick = async (e) => {
    await KoguUi.withLoading(e.target, async () => {
      try {
        const res = await KoguApi.apiFetch(`${BASE}/pp/asignaciones/sync`, { method: 'POST', body: '{}' });
        const d = res?.data || res;
        KoguApi.toast(`Sincronizado: ${d.insertados} nuevas (${d.asignados} auto-asignadas, ${d.pendientes} pendientes)`, 'success');
        await load();
      } catch (err) { KoguApi.toast(err.message, 'error'); }
    }, 'Sincronizando...');
  };

  document.getElementById('saveBtn').onclick = async (e) => {
    const items = [];
    dirty.forEach((cve_sublinea, k) => {
      if (!cve_sublinea) return;
      const [cve_cte, cve_prod] = k.split('|');
      items.push({ cve_cte, cve_prod, cve_sublinea });
    });
    if (!items.length) return;
    await KoguUi.withLoading(e.target, async () => {
      try {
        const res = await KoguApi.apiFetch(`${BASE}/pp/asignaciones`, { method: 'PUT', body: JSON.stringify({ items }) });
        const d = res?.data || res;
        KoguApi.toast(`${d.confirmados} asignación(es) guardada(s)`, 'success');
        await load();
      } catch (err) { KoguApi.toast(err.message, 'error'); }
    }, 'Guardando...');
  };

  KoguShell.subscribeEmpresaActivaChange(load);
  await load();
});

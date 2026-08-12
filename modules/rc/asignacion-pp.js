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
  const nf0   = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 });
  const money = v => KoguUi.money(Number(v || 0));
  const pct0  = v => (v == null ? '—' : `${Math.round(Number(v) * 100)}%`);
  const fecha = v => (v ? String(v).slice(0, 10) : '—');
  const miniCard = (lbl, val, hint = '', color = '') => `
    <div style="border:1px solid var(--line);border-radius:10px;padding:9px 12px">
      <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.03em">${KoguUi.escapeHtml(lbl)}</div>
      <div style="font-size:17px;font-weight:800;line-height:1.15;margin-top:1px;${color ? `color:${color}` : ''}">${KoguUi.escapeHtml(val)}</div>
      ${hint ? `<div style="font-size:10px;color:var(--muted)">${KoguUi.escapeHtml(hint)}</div>` : ''}
    </div>`;

  const esc = v => KoguUi.escapeHtml(String(v ?? ''));
  const SIN = '__SIN_ASIGNAR__';

  const nombreDe = cve => data.sublineas.find(s => s.cve_sublinea === cve)?.sublinea_nombre || '';
  const etiquetaClave = cve => cve ? `${esc(cve)} · ${esc(nombreDe(cve))}` : '— sin asignar —';

  // Selector de ClavePP.
  //
  // Era un <select> con las ~92 sublíneas del PP: para encontrar "Ext. Ceb.
  // Power Pack 1X" había que recorrer la lista a ojo, y no se podía buscar por
  // categoría. Se reemplaza por el picker con búsqueda de KoguUi, el mismo que
  // ya usan comex, lab y mat, que además trae navegación con teclado.
  function abrirPicker(btn) {
    const k  = btn.dataset.pick;
    const it = data.items.find(x => keyOf(x) === k);
    const actual = dirty.has(k) ? dirty.get(k) : (it?.cve_sublinea || '');
    const items = [{ cve_sublinea: SIN, sublinea_nombre: '— sin asignar —', categoria: '' }]
      .concat(data.sublineas.map(x => ({
        cve_sublinea:    x.cve_sublinea,
        sublinea_nombre: x.sublinea_nombre,
        categoria:       x.cat_nombre || (x.cat != null ? 'Categoría ' + x.cat : ''),
      })));
    KoguUi.openSearchPicker({
      title: `ClavePP · ${it?.cve_prod || ''}${it?.cliente_nombre ? ' — ' + it.cliente_nombre : ''}`,
      items,
      columns: [
        { key: 'sublinea_nombre', label: 'Sublínea',  primary: true },
        { key: 'cve_sublinea',    label: 'Clave' },
        { key: 'categoria',       label: 'Categoría' },
      ],
      placeholder: actual ? `Actual: ${actual} · ${nombreDe(actual)} — buscar otra…` : 'Buscar por clave, sublínea o categoría…',
      onSelect: (x) => aplicarSeleccion(k, x.cve_sublinea === SIN ? '' : x.cve_sublinea),
    });
  }

  // Se actualiza solo el renglón tocado en vez de repintar la tabla: con 407
  // filas, un re-render manda el scroll al principio y pierdes dónde ibas.
  function aplicarSeleccion(k, valor) {
    const it   = data.items.find(x => keyOf(x) === k);
    const orig = it?.cve_sublinea || '';
    if (valor === orig) dirty.delete(k); else dirty.set(k, valor);
    const btn = [...document.querySelectorAll('#tabla button[data-pick]')].find(b => b.dataset.pick === k);
    if (btn) {
      btn.innerHTML         = etiquetaClave(valor);
      btn.style.fontWeight  = valor ? '600' : '400';
      btn.style.color       = valor ? '' : 'var(--muted)';
      const tr = btn.closest('tr');
      if (tr) tr.style.background = dirty.has(k) ? 'var(--panel2,#f8fafc)' : '';
    }
    renderSaveBtn();
  }

  function renderResumen() {
    const k = data.conteo || {};
    const total = Number(k.total || 0), asg = Number(k.asignados || 0), pend = Number(k.pendientes || 0);
    const cobN  = total ? asg / total : 0;

    // Cobertura por VENTA, no por número de filas.
    //
    // "80% de las combinaciones asignadas" no dice nada si el 20% restante es
    // la mitad de la facturación. Lo que hace confiable el desglose por
    // categoría del Tablero es el dinero atribuido. Suelen ser muy distintas:
    // un puñado de combinaciones concentra casi toda la venta.
    const vTot  = Number(k.ventas_total || 0);
    const vAsg  = Number(k.ventas_asignadas || 0);
    const vPend = Number(k.ventas_pendientes || 0);
    const cobV  = vTot ? vAsg / vTot : null;
    const colV  = cobV == null ? '' : (cobV >= 0.95 ? 'var(--ok,#16a34a)' : cobV >= 0.8 ? 'var(--warning,#d97706)' : 'var(--danger,#dc2626)');

    document.getElementById('resumen').innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px">
        ${miniCard('Combinaciones', nf0.format(total), 'cliente · producto')}
        ${miniCard('Asignadas', nf0.format(asg), `${pct0(cobN)} de las filas`, 'var(--ok,#16a34a)')}
        ${miniCard('Pendientes', nf0.format(pend), 'por confirmar', pend ? 'var(--danger,#dc2626)' : '')}
        ${miniCard('Cobertura por venta', pct0(cobV), 'de la venta ya atribuida', colV)}
        ${miniCard('Venta sin atribuir', money(vPend), `${nf0.format(Number(k.kg_pendientes || 0))} kg pendientes`, vPend ? 'var(--danger,#dc2626)' : '')}
        ${miniCard('Sublíneas PP', String(data.sublineas.length), 'claves del presupuesto')}
      </div>`;
  }

  const ORI = { seed: 'Histórico', auto: 'Auto', manual: 'Manual' };
  function renderTabla() {
    const items = data.items;
    document.getElementById('tblInfo').innerHTML =
      `${items.length} fila(s)${items.length === 500 ? ' <b>(tope 500, afina la búsqueda)</b>' : ''}`
      + ' · ordenadas por <b>venta descendente</b>: las de arriba son las que mueven el Tablero';
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
        <td style="text-align:right;white-space:nowrap">
          <div style="font-weight:700">${money(it.ventas)}</div>
          <div style="font-size:11px;color:var(--muted)">${nf0.format(Number(it.kg || 0))} kg · ${nf0.format(Number(it.facturas || 0))} fact.</div>
        </td>
        <td style="white-space:nowrap;font-size:12px;color:var(--muted)">${fecha(it.ultima_venta)}</td>
        <td style="min-width:280px">
          <button class="btn" type="button" data-pick="${esc(k)}"
                  style="width:100%;text-align:left;font-weight:${cur ? 600 : 400};${cur ? '' : 'color:var(--muted)'}">
            ${etiquetaClave(cur)}
          </button>
          ${it.notas ? `<div style="font-size:11px;color:var(--warning,#d97706);margin-top:3px">${KoguUi.escapeHtml(it.notas)}</div>` : ''}
        </td>
      </tr>`;
    }).join('');
    document.getElementById('tabla').innerHTML = `
      <div class="table-wrap"><table><thead><tr>
        <th>Estado</th><th>Cliente</th><th>Producto</th>
        <th style="text-align:right">Venta</th><th>Últ. venta</th>
        <th>ClavePP (sublínea)</th>
      </tr></thead><tbody>${filas}</tbody>${pieTabla(items)}</table></div>`;
    document.querySelectorAll('#tabla button[data-pick]').forEach(b => b.onclick = () => abrirPicker(b));
    renderSaveBtn();
  }

  // Sumatoria de lo que estás viendo. Con el tope de 500 filas, saber cuánta
  // venta cubre la pantalla actual dice si vale la pena seguir bajando.
  function pieTabla(items) {
    const v  = items.reduce((a, x) => a + Number(x.ventas || 0), 0);
    const kg = items.reduce((a, x) => a + Number(x.kg || 0), 0);
    return `<tfoot><tr style="border-top:2px solid var(--line);font-weight:700;background:var(--panel2,#f8fafc)">
      <td colspan="3">Suma de las ${items.length} fila(s) visibles</td>
      <td style="text-align:right">${money(v)}<div style="font-size:11px;font-weight:400;color:var(--muted)">${nf0.format(kg)} kg</div></td>
      <td colspan="2"></td>
    </tr></tfoot>`;
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

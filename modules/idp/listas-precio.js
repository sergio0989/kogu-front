// ============================================================
// modules/idp/listas-precio.js — Bandeja de listas de precios.
// Endpoints (/protected/idp): listas-precio (GET/POST), clientes?q=, catalogo
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  const b = await KoguShell.initShell({
    currentPage: '/modules/idp/listas-precio.html',
    title: 'Listas de precios',
    description: 'Cotizaciones por cliente con aprobación y vigencia.',
    requiredPermission: 'idp.precios.read',
  });
  if (!b) return;
  const I = KoguIdp; const esc = I.esc; const BASE = I.BASE;
  const canCreate = KoguShell.hasPerm(b, 'idp.precios.create');
  const pc = document.getElementById('pageContent');
  const $ = (x) => document.getElementById(x);
  const f = { q: '', estado: '' };
  let agentes = [];
  KoguApi.apiFetch(`${BASE}/catalogo`).then((r) => { agentes = KoguApi.unwrapData(r).agentes || []; }).catch(() => {});

  pc.innerHTML = `
    <div class="card"><div class="row" style="gap:10px;flex-wrap:wrap;align-items:flex-end">
      <div style="flex:1;min-width:240px"><div class="label-text">Buscar</div><input class="input" id="fQ" placeholder="Folio, cliente o atención…" autocomplete="off" style="width:100%"/></div>
      <div><div class="label-text">Estado</div><select class="select" id="fE"><option value="">Todos</option>
        ${Object.entries(I.ETIQUETA_LISTA).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
      ${canCreate ? '<button class="btn primary" id="btnNueva" style="margin-left:auto">+ Nueva lista</button>' : ''}
    </div></div>
    <div class="card" style="margin-top:14px">
      <div class="eyebrow" id="lbl" style="margin-bottom:8px">Listas</div>
      <div class="table-wrap"><table><thead><tr><th>Folio</th><th>Cliente</th><th>Moneda</th><th>Vigencia</th><th style="text-align:right">Partidas</th><th>Estado</th><th>Elaboró</th></tr></thead>
      <tbody id="tb"><tr><td colspan="7" class="empty">Cargando…</td></tr></tbody></table></div>
    </div>`;

  const fecha = (v) => (v ? KoguUi.fmtDateOnly(v) : '—');
  async function cargar() {
    let filas = [];
    try { filas = KoguApi.unwrapData(await KoguApi.apiFetch(`${BASE}/listas-precio?${KoguUi.queryParams(f)}`)) || []; }
    catch (err) { $('tb').innerHTML = `<tr><td colspan="7" class="empty">${esc(I.mensajeError(err))}</td></tr>`; return; }
    $('lbl').textContent = `${filas.length} lista${filas.length === 1 ? '' : 's'}`;
    $('tb').innerHTML = filas.length ? filas.map((l) => `<tr data-id="${esc(l.lista_id)}" style="cursor:pointer">
      <td><span class="chip-compact">${esc(l.folio)}</span>${l.lista_origen_folio ? ` <span class="muted" style="font-size:11px">copia de ${esc(l.lista_origen_folio)}</span>` : ''}</td>
      <td style="font-weight:600">${esc(l.cliente_nombre)} ${I.chipProspecto(l.cliente_estatus)}</td>
      <td>${esc(l.moneda)}</td><td>${fecha(l.vigencia_inicio)} – ${fecha(l.vigencia_fin)}</td>
      <td style="text-align:right">${l.partidas ?? 0}</td><td>${I.chipLista(l)}</td><td>${esc(l.creado_por_nombre || '')}</td>
    </tr>`).join('') : '<tr><td colspan="7" class="empty">Sin listas con estos filtros.</td></tr>';
    $('tb').querySelectorAll('tr[data-id]').forEach((tr) => (tr.onclick = () => { location.href = `/modules/idp/lista-precio.html?id=${encodeURIComponent(tr.dataset.id)}`; }));
  }
  let t;
  $('fQ').oninput = () => { clearTimeout(t); t = setTimeout(() => { f.q = $('fQ').value.trim(); cargar(); }, 300); };
  $('fE').onchange = () => { f.estado = $('fE').value; cargar(); };
  if ($('btnNueva')) $('btnNueva').onclick = nueva;
  cargar();

  function nueva() {
    let cliente = null;
    const hoy = new Date(Date.now() - 6 * 3600e3).toISOString().slice(0, 10);
    const fin = new Date(Date.now() + 180 * 86400e3).toISOString().slice(0, 10);   // el legado usaba vigencia semestral
    const { el } = I.modal({
      eyebrow: 'I+D · Precios', titulo: 'Nueva lista de precios', aceptar: 'Crear lista', ancho: 600,
      cuerpo: `
        <div><div class="label-text">Cliente o prospecto</div><div style="position:relative;margin-top:4px">
          <input class="input" data-c placeholder="Busca por nombre, RFC o clave…" style="width:100%"/>${I.cajaBusqueda('data-cc')}</div>
          <div data-cs class="hint" style="font-size:12px;color:var(--muted);margin-top:4px"></div></div>
        <div class="grid-2" style="gap:12px">
          <div><div class="label-text">Moneda</div><select class="select" data-v="moneda" style="width:100%"><option>USD</option><option>MXN</option><option>EUR</option></select></div>
          <div><div class="label-text">Agente</div><select class="select" data-v="agente_id" style="width:100%"><option value="">— sin agente —</option>
            ${agentes.map((a) => `<option value="${esc(a.agente_id)}">${esc(a.nombre)}</option>`).join('')}</select></div>
          <div><div class="label-text">Vigencia desde</div><input class="input" type="date" data-v="vigencia_inicio" value="${hoy}" style="width:100%"/></div>
          <div><div class="label-text">Vigencia hasta</div><input class="input" type="date" data-v="vigencia_fin" value="${fin}" style="width:100%"/></div>
        </div>
        <div><div class="label-text">Atención</div><input class="input" data-v="atencion" placeholder="Ej. Lic. Compras" style="width:100%"/></div>
        <div><div class="label-text">Condiciones</div><textarea class="input" data-v="condiciones" rows="3" placeholder="Ej. Precios LAB planta. Pago a 30 días." style="width:100%"></textarea></div>`,
      onSubmit: async (m) => {
        if (!cliente) { KoguApi.toast('Selecciona el cliente.', 'error'); throw new Error('cliente'); }
        const body = { cliente_id: cliente.cliente_id };
        m.querySelectorAll('[data-v]').forEach((x) => { if (x.value.trim()) body[x.dataset.v] = x.value.trim(); });
        const l = KoguApi.unwrapData(await KoguApi.apiFetch(`${BASE}/listas-precio`, { method: 'POST', body: JSON.stringify(body) }));
        KoguApi.toast(`Lista ${l.folio} creada`, 'success');
        setTimeout(() => { location.href = `/modules/idp/lista-precio.html?id=${encodeURIComponent(l.lista_id)}`; }, 300);
      },
    });
    I.buscador(el.querySelector('[data-c]'), el.querySelector('[data-cc]'), {
      titulo: 'Seleccionar cliente o prospecto', fetcher: async (q) => KoguApi.unwrapData(await KoguApi.apiFetch(`${BASE}/clientes?q=${encodeURIComponent(q)}`)),
      pinta: (c) => `${esc(c.nombre)} ${I.chipProspecto(c.estatus_comercial)} <span class="muted" style="font-size:11px">${esc(c.rfc || c.cve_cte || '')}</span>`,
      elegir: (c) => {
        cliente = c; el.querySelector('[data-c]').value = c.nombre;
        el.querySelector('[data-cs]').textContent = `${c.estatus_comercial === 'prospecto' ? 'Prospecto' : 'Cliente'}${c.rfc ? ' · ' + c.rfc : ''}`;
        if (c.agente_venta_1_id) el.querySelector('[data-v="agente_id"]').value = c.agente_venta_1_id;
      },
    });
  }
});

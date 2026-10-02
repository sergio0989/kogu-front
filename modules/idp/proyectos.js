// ============================================================
// modules/idp/proyectos.js — Bandeja de proyectos de I+D.
// Endpoints: GET /protected/idp/catalogo, GET /protected/idp/proyectos,
//            GET /protected/idp/clientes, POST /protected/idp/prospectos,
//            POST /protected/idp/proyectos
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  const b = await KoguShell.initShell({
    currentPage: '/modules/idp/proyectos.html',
    title: 'Proyectos de desarrollo',
    description: 'Desarrollos de I+D por cliente: estado, potencial y último movimiento.',
    requiredPermission: 'idp.proyectos.read',
  });
  if (!b) return;

  const I = KoguIdp; const esc = I.esc; const BASE = I.BASE;
  const canCreate = KoguShell.hasPerm(b, 'idp.proyectos.create');
  const pc = document.getElementById('pageContent');
  const $ = (id) => document.getElementById(id);

  let catalogo = { estados: [], agentes: [], motivos: [], desarrolladores: [] };
  try { catalogo = KoguApi.unwrapData(await KoguApi.apiFetch(`${BASE}/catalogo`)); } catch (_) { /* toast ya mostrado */ }
  const nombreEstado = (k) => catalogo.estados.find((e) => e.clave === k)?.nombre || k;

  const f = { q: '', estado: '', potencial: '', agente_id: '', estancados: '', pagina: 1 };

  pc.innerHTML = `
    <div class="card">
      <div class="row" style="gap:10px;flex-wrap:wrap;align-items:flex-end">
        <div style="flex:1;min-width:220px"><div class="label-text">Buscar</div>
          <input class="input" id="fQ" placeholder="Folio, proyecto o cliente…" autocomplete="off" style="width:100%"/></div>
        <div><div class="label-text">Estado</div><select class="select" id="fEstado"><option value="">Todos</option>
          ${catalogo.estados.filter((e) => e.activo !== false).map((e) => `<option value="${esc(e.clave)}">${esc(e.nombre)}</option>`).join('')}</select></div>
        <div><div class="label-text">Potencial</div><select class="select" id="fPot"><option value="">Todos</option>
          <option>A</option><option>B</option><option>C</option></select></div>
        <div><div class="label-text">Agente</div><select class="select" id="fAgente"><option value="">Todos</option>
          ${catalogo.agentes.map((a) => `<option value="${esc(a.agente_id)}">${esc(a.nombre)}</option>`).join('')}</select></div>
        <label style="display:flex;gap:6px;align-items:center;font-size:13px;padding-bottom:8px"><input type="checkbox" id="fEst"/> Solo estancados</label>
        ${canCreate ? '<button class="btn primary" id="btnNuevo" style="margin-left:auto">+ Nuevo proyecto</button>' : ''}
      </div>
    </div>
    <div class="card" style="margin-top:14px">
      <div class="row" style="margin-bottom:8px"><div class="eyebrow" id="lblTotal">Proyectos</div><div id="pager" style="display:flex;gap:6px;align-items:center"></div></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Folio</th><th>Proyecto</th><th>Cliente</th><th>Agente</th><th>Estado</th><th style="text-align:center">Pot.</th>
          <th style="text-align:right">Venta anual</th><th>Último movimiento</th></tr></thead>
        <tbody id="tb"><tr><td colspan="8" class="empty">Cargando…</td></tr></tbody>
      </table></div>
    </div>`;

  async function cargar() {
    const qs = KoguUi.queryParams({ ...f, limite: 50 });
    let r;
    try { r = KoguApi.unwrapData(await KoguApi.apiFetch(`${BASE}/proyectos?${qs}`)); }
    catch (err) { $('tb').innerHTML = `<tr><td colspan="8" class="empty">${esc(I.mensajeError(err))}</td></tr>`; return; }
    const items = r.items || [];
    $('lblTotal').textContent = `${r.total ?? items.length} proyecto${(r.total ?? items.length) === 1 ? '' : 's'}`;
    $('tb').innerHTML = items.length ? items.map((p) => {
      const dias = I.diasSinMovimiento(p.ultimo_evento_at || p.created_at);
      const est = I.estancado(p);
      return `<tr data-id="${esc(p.proyecto_id)}" style="cursor:pointer">
        <td><span class="chip-compact">${esc(p.folio)}</span></td>
        <td style="font-weight:600">${esc(p.nombre)}</td>
        <td>${esc(p.cliente_nombre || '')} ${I.chipProspecto(p.cliente_estatus)}</td>
        <td>${esc(p.agente_nombre || '—')}</td>
        <td>${I.chipEstado(p.estado, p.estado_nombre || nombreEstado(p.estado), p.estado_categoria)}</td>
        <td style="text-align:center">${I.chipPotencial(p.potencial)}</td>
        <td style="text-align:right">${esc(I.fmtUsd(p.venta_anual_usd))}</td>
        <td>${dias == null ? '—' : `<span style="${est ? 'color:#b45309;font-weight:600' : ''}">${dias === 0 ? 'hoy' : `hace ${dias} día${dias === 1 ? '' : 's'}`}${est ? ' · estancado' : ''}</span>`}</td>
      </tr>`;
    }).join('') : `<tr><td colspan="8" class="empty">Sin proyectos con estos filtros.</td></tr>`;
    $('tb').querySelectorAll('tr[data-id]').forEach((tr) => (tr.onclick = () => {
      window.location.href = `/modules/idp/proyecto.html?id=${encodeURIComponent(tr.dataset.id)}`;
    }));
    const paginas = Math.max(1, Math.ceil((r.total || 0) / (r.limite || 50)));
    $('pager').innerHTML = paginas > 1 ? `
      <button class="btn" id="pgAnt" ${f.pagina <= 1 ? 'disabled' : ''}>‹</button>
      <span class="muted" style="font-size:12px">Página ${f.pagina} de ${paginas}</span>
      <button class="btn" id="pgSig" ${f.pagina >= paginas ? 'disabled' : ''}>›</button>` : '';
    if ($('pgAnt')) $('pgAnt').onclick = () => { f.pagina--; cargar(); };
    if ($('pgSig')) $('pgSig').onclick = () => { f.pagina++; cargar(); };
  }

  let t;
  $('fQ').oninput = () => { clearTimeout(t); t = setTimeout(() => { f.q = $('fQ').value.trim(); f.pagina = 1; cargar(); }, 300); };
  $('fEstado').onchange = () => { f.estado = $('fEstado').value; f.pagina = 1; cargar(); };
  $('fPot').onchange = () => { f.potencial = $('fPot').value; f.pagina = 1; cargar(); };
  $('fAgente').onchange = () => { f.agente_id = $('fAgente').value; f.pagina = 1; cargar(); };
  $('fEst').onchange = () => { f.estancados = $('fEst').checked ? '1' : ''; f.pagina = 1; cargar(); };
  if ($('btnNuevo')) $('btnNuevo').onclick = abrirNuevo;
  cargar();

  // ── Nuevo proyecto ─────────────────────────────────────────
  function abrirNuevo() {
    let cliente = null;
    const opAgentes = `<option value="">— del catálogo del cliente —</option>` +
      catalogo.agentes.map((a) => `<option value="${esc(a.agente_id)}">${esc(a.nombre)}</option>`).join('');
    const { el } = I.modal({
      eyebrow: 'I+D · Nuevo proyecto', titulo: 'Nuevo proyecto de desarrollo', aceptar: 'Crear proyecto', ancho: 640,
      cuerpo: `
        <div>
          <div class="label-text">Cliente o prospecto</div>
          <div style="position:relative;margin-top:4px">
            <input class="input" data-f="cli" placeholder="Busca por nombre, RFC o clave…" autocomplete="off" style="width:100%"/>
            <div data-f="cliBox" style="display:none;position:absolute;left:0;right:0;top:100%;z-index:5;background:var(--panel,#fff);border:1px solid var(--line);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.18);max-height:240px;overflow:auto;margin-top:2px"></div>
          </div>
          <div data-f="cliSel" class="hint" style="font-size:12px;margin-top:4px;color:var(--muted)"></div>
          <div data-f="prosp" style="display:none;margin-top:8px;padding:12px;border:1px dashed var(--line);border-radius:10px">
            <div class="eyebrow" style="margin-bottom:6px">Alta de prospecto</div>
            <div class="grid-2" style="gap:10px">
              <div><div class="label-text">Nombre o razón social</div><input class="input" data-f="pNom" style="width:100%"/></div>
              <div><div class="label-text">RFC <span class="muted">(opcional)</span></div><input class="input" data-f="pRfc" maxlength="13" style="width:100%;text-transform:uppercase"/></div>
              <div><div class="label-text">Agente</div><select class="select" data-f="pAg" style="width:100%"><option value="">— sin agente —</option>
                ${catalogo.agentes.map((a) => `<option value="${esc(a.agente_id)}">${esc(a.nombre)}</option>`).join('')}</select></div>
              <div style="display:flex;align-items:flex-end;gap:6px"><button class="btn primary" data-f="pOk">Dar de alta</button><button class="btn" data-f="pNo">Cancelar</button></div>
            </div>
          </div>
        </div>
        <div><div class="label-text">Nombre del proyecto</div><input class="input" data-f="nom" placeholder="Ej. Sazonador queso cheddar para papa" style="width:100%"/></div>
        <div class="grid-2" style="gap:12px">
          <div><div class="label-text">Tipo</div><select class="select" data-f="tipo" style="width:100%"><option value="reactivo">Reactivo (lo pide el cliente)</option><option value="proactivo">Proactivo (lo propone I+D)</option></select></div>
          <div><div class="label-text">Prioridad</div><select class="select" data-f="prio" style="width:100%"><option value="media">Media</option><option value="alta">Alta</option><option value="baja">Baja</option></select></div>
          <div><div class="label-text">Categoría</div><input class="input" data-f="cat" placeholder="Ej. Sazonadores" style="width:100%"/></div>
          <div><div class="label-text">Segmento</div><input class="input" data-f="seg" placeholder="Ej. Botanas" style="width:100%"/></div>
          <div><div class="label-text">Volumen estimado (kg/mes)</div><input class="input" data-f="kg" type="number" min="0" step="any" style="width:100%"/></div>
          <div><div class="label-text">Precio objetivo por kg</div>
            <div style="display:flex;gap:6px"><input class="input" data-f="precio" type="number" min="0" step="any" style="flex:1;min-width:0;width:auto"/>
              <select class="select" data-f="mon" style="width:90px;flex:none"><option>USD</option><option>MXN</option><option>EUR</option></select></div></div>
          <div><div class="label-text">Fecha requerida</div><input class="input" data-f="fecha" type="date" style="width:100%"/></div>
          <div><div class="label-text">Agente</div><select class="select" data-f="ag" style="width:100%">${opAgentes}</select></div>
        </div>
        <div><div class="label-text">Descripción / requerimiento del cliente</div><textarea class="input" data-f="desc" rows="3" style="width:100%"></textarea></div>`,
      onSubmit: async (m) => {
        const v = (k) => m.querySelector(`[data-f="${k}"]`).value.trim();
        if (!cliente) { KoguApi.toast('Selecciona el cliente o da de alta el prospecto.', 'error'); throw new Error('sin cliente'); }
        if (!v('nom')) { KoguApi.toast('Escribe el nombre del proyecto.', 'error'); throw new Error('sin nombre'); }
        const body = { cliente_id: cliente.cliente_id, nombre: v('nom'), tipo: v('tipo'), prioridad: v('prio'),
          categoria: v('cat') || undefined, segmento: v('seg') || undefined, descripcion: v('desc') || undefined,
          kg_mes: v('kg') ? Number(v('kg')) : undefined, precio_objetivo: v('precio') ? Number(v('precio')) : undefined,
          moneda: v('mon'), fecha_requerida: v('fecha') || undefined, agente_id: v('ag') || undefined };
        const p = KoguApi.unwrapData(await KoguApi.apiFetch(`${BASE}/proyectos`, { method: 'POST', body: JSON.stringify(body) }));
        KoguApi.toast(`Proyecto ${p.folio} creado`, 'success');
        setTimeout(() => { window.location.href = `/modules/idp/proyecto.html?id=${encodeURIComponent(p.proyecto_id)}`; }, 300);
      },
    });
    const q = (k) => el.querySelector(`[data-f="${k}"]`);
    const elegir = (c) => {
      cliente = c; q('cli').value = c.nombre; q('cliBox').style.display = 'none'; q('prosp').style.display = 'none';
      q('cliSel').innerHTML = `${c.estatus_comercial === 'prospecto' ? '🟣 Prospecto' : '✓ Cliente'}${c.rfc ? ' · ' + esc(c.rfc) : ''}${c.agente_nombre ? ' · agente ' + esc(c.agente_nombre) : ''}`;
    };
    let tt;
    q('cli').oninput = () => {
      cliente = null; q('cliSel').textContent = ''; clearTimeout(tt);
      const texto = q('cli').value.trim();
      tt = setTimeout(async () => {
        if (texto.length < 2) { q('cliBox').style.display = 'none'; return; }
        let arr = [];
        try { arr = KoguApi.unwrapData(await KoguApi.apiFetch(`${BASE}/clientes?q=${encodeURIComponent(texto)}`)) || []; } catch (_) {}
        q('cliBox').innerHTML = arr.map((c, i) => `<div data-i="${i}" style="padding:7px 10px;cursor:pointer;font-size:13px;border-bottom:1px solid var(--line)">
            ${esc(c.nombre)} ${I.chipProspecto(c.estatus_comercial)} <span class="muted" style="font-size:11px">${esc(c.rfc || c.cve_cte || '')}${c.agente_nombre ? ' · ' + esc(c.agente_nombre) : ''}</span></div>`).join('')
          + (canCreate ? `<div data-nuevo style="padding:8px 10px;cursor:pointer;font-size:13px;color:var(--brand,#2563eb);font-weight:600">+ Dar de alta "${esc(texto)}" como prospecto</div>` : '');
        q('cliBox').style.display = 'block';
        q('cliBox').querySelectorAll('[data-i]').forEach((d) => (d.onmousedown = (e) => { e.preventDefault(); elegir(arr[Number(d.dataset.i)]); }));
        const n = q('cliBox').querySelector('[data-nuevo]');
        if (n) n.onmousedown = (e) => { e.preventDefault(); q('cliBox').style.display = 'none'; q('prosp').style.display = 'block'; q('pNom').value = texto; q('pRfc').focus(); };
      }, 250);
    };
    q('cli').onblur = () => setTimeout(() => { q('cliBox').style.display = 'none'; }, 150);
    q('pNo').onclick = () => { q('prosp').style.display = 'none'; };
    q('pOk').onclick = () => KoguUi.withLoading(q('pOk'), async () => {
      const body = { nombre: q('pNom').value.trim(), rfc: q('pRfc').value.trim() || undefined, agente_id: q('pAg').value || undefined };
      try {
        const c = KoguApi.unwrapData(await KoguApi.apiFetch(`${BASE}/prospectos`, { method: 'POST', body: JSON.stringify(body) }));
        const ag = catalogo.agentes.find((a) => a.agente_id === c.agente_venta_1_id);
        elegir({ ...c, agente_nombre: ag?.nombre });
        KoguApi.toast('Prospecto dado de alta', 'success');
      } catch (err) {
        if (err.status === 409 && err.details?.cliente_id) {
          elegir(err.details);
          KoguApi.toast(`Ya existía "${err.details.nombre}"; se usará ese registro.`, 'info');
        } else if (err.status !== 422) KoguApi.toast(I.mensajeError(err), 'error');
      }
    }, 'Guardando…');
  }
});

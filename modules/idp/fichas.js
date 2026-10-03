// ============================================================
// modules/idp/fichas.js — Bandeja de fichas técnicas (D5).
// Endpoints (/protected/idp): fichas (GET/POST), productos-erp?q=, productos-desarrollo?q=
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  const b = await KoguShell.initShell({
    currentPage: '/modules/idp/fichas.html',
    title: 'Fichas técnicas',
    description: 'Ficha comercial por producto: organolépticos, alérgenos, parámetros, empaque y vida útil.',
    requiredPermission: 'idp.proyectos.read',
  });
  if (!b) return;
  const I = KoguIdp; const esc = I.esc; const BASE = I.BASE;
  const canDev = KoguShell.hasPerm(b, 'idp.proyectos.desarrollar');
  const pc = document.getElementById('pageContent');
  const $ = (x) => document.getElementById(x);
  const f = { q: '', estado: '' };

  pc.innerHTML = `
    <div class="card"><div class="row" style="gap:10px;flex-wrap:wrap;align-items:flex-end">
      <div style="flex:1;min-width:240px"><div class="label-text">Buscar</div><input class="input" id="fQ" placeholder="Folio, producto o clave…" autocomplete="off" style="width:100%"/></div>
      <div><div class="label-text">Estado</div><select class="select" id="fE"><option value="">Todas</option><option value="borrador">Borrador</option><option value="vigente">Vigente</option><option value="obsoleta">Obsoleta</option></select></div>
      ${canDev ? '<button class="btn primary" id="btnNueva" style="margin-left:auto">+ Nueva ficha</button>' : ''}
    </div></div>
    <div class="card" style="margin-top:14px"><div class="eyebrow" id="lbl" style="margin-bottom:8px">Fichas</div>
      <div class="table-wrap"><table><thead><tr><th>Folio</th><th>Producto</th><th>Clave</th><th>Proyecto</th><th>Estado</th><th>Actualizó</th><th></th></tr></thead>
      <tbody id="tb"><tr><td colspan="7" class="empty">Cargando…</td></tr></tbody></table></div></div>`;

  async function cargar() {
    let filas = [];
    try { filas = KoguApi.unwrapData(await KoguApi.apiFetch(`${BASE}/fichas?${KoguUi.queryParams(f)}`)) || []; }
    catch (err) { $('tb').innerHTML = `<tr><td colspan="7" class="empty">${esc(I.mensajeError(err))}</td></tr>`; return; }
    $('lbl').textContent = `${filas.length} ficha${filas.length === 1 ? '' : 's'}`;
    $('tb').innerHTML = filas.length ? filas.map((x) => `<tr data-id="${esc(x.idp_ficha_id)}" style="cursor:pointer">
      <td><span class="chip-compact">${esc(x.folio)}</span></td><td style="font-weight:600">${esc(x.nombre)}</td><td>${esc(x.codigo || '')}</td>
      <td>${esc(x.proyecto_folio || '')}</td><td>${I.chipFicha(x.estado)}</td>
      <td>${esc(x.actualizado_por_nombre || '')} <span class="muted" style="font-size:12px">${KoguUi.fmtDateOnly(x.updated_at)}</span></td>
      <td><button class="btn" data-pdf="${esc(x.idp_ficha_id)}">PDF</button></td></tr>`).join('') : '<tr><td colspan="7" class="empty">Sin fichas con estos filtros.</td></tr>';
    $('tb').querySelectorAll('tr[data-id]').forEach((tr) => (tr.onclick = (e) => {
      if (e.target.closest('[data-pdf]')) return;
      location.href = `/modules/idp/ficha.html?id=${encodeURIComponent(tr.dataset.id)}`;
    }));
    $('tb').querySelectorAll('[data-pdf]').forEach((x) => (x.onclick = () => I.descargar(`${BASE}/fichas/${encodeURIComponent(x.dataset.pdf)}/pdf`, { abrir: true })));
  }
  let t;
  $('fQ').oninput = () => { clearTimeout(t); t = setTimeout(() => { f.q = $('fQ').value.trim(); cargar(); }, 300); };
  $('fE').onchange = () => { f.estado = $('fE').value; cargar(); };
  if ($('btnNueva')) $('btnNueva').onclick = nueva;
  cargar();

  function nueva() {
    const sel = {};
    const { el } = I.modal({
      eyebrow: 'I+D · Fichas', titulo: 'Nueva ficha técnica', aceptar: 'Crear y capturar',
      cuerpo: `
        <div style="display:flex;gap:18px;font-size:13px"><label><input type="radio" name="tp" value="experimental" data-tp checked/> Clave experimental</label>
          <label><input type="radio" name="tp" value="erp" data-tp/> Producto del ERP</label></div>
        <div><div class="label-text">Producto</div><div style="position:relative;margin-top:4px">
          <input class="input" data-b placeholder="Clave o nombre…" style="width:100%"/>${I.cajaBusqueda('data-bc')}</div></div>
        <div><div class="label-text">Nombre en la ficha</div><input class="input" data-n style="width:100%"/></div>`,
      onSubmit: async (m) => {
        const nombre = m.querySelector('[data-n]').value.trim();
        if (!sel.producto_id && !sel.producto_desarrollo_id) { KoguApi.toast('Elige el producto.', 'error'); throw new Error('producto'); }
        if (!nombre) { KoguApi.toast('Escribe el nombre.', 'error'); throw new Error('nombre'); }
        const x = KoguApi.unwrapData(await KoguApi.apiFetch(`${BASE}/fichas`, { method: 'POST', body: JSON.stringify({ ...sel, nombre }) }));
        location.href = `/modules/idp/ficha.html?id=${encodeURIComponent(x.idp_ficha_id)}`;
      },
    });
    const tipo = () => el.querySelector('[data-tp]:checked').value;
    el.querySelectorAll('[data-tp]').forEach((r) => (r.onchange = () => { el.querySelector('[data-b]').value = ''; delete sel.producto_id; delete sel.producto_desarrollo_id; }));
    I.buscador(el.querySelector('[data-b]'), el.querySelector('[data-bc]'), {
      get titulo() { return tipo() === 'erp' ? 'Seleccionar producto del ERP' : 'Seleccionar clave experimental'; },
      fetcher: async (q) => KoguApi.unwrapData(await KoguApi.apiFetch(tipo() === 'erp'
        ? `${BASE}/productos-erp?q=${encodeURIComponent(q)}` : `${BASE}/productos-desarrollo?q=${encodeURIComponent(q)}`)),
      pinta: (x) => (tipo() === 'erp' ? `<span class="chip-compact">${esc(x.cve_prod)}</span> ${esc(x.desc_prod)}` : `<span class="chip-compact">${esc(x.codigo)}</span> ${esc(x.nombre)}`),
      elegir: (x) => {
        delete sel.producto_id; delete sel.producto_desarrollo_id;
        if (tipo() === 'erp') { sel.producto_id = x.producto_id; el.querySelector('[data-b]').value = x.cve_prod; }
        else { sel.producto_desarrollo_id = x.producto_desarrollo_id; el.querySelector('[data-b]').value = x.codigo; }
        const n = el.querySelector('[data-n]'); if (!n.value) n.value = x.desc_prod || x.nombre || '';
      },
    });
  }
});

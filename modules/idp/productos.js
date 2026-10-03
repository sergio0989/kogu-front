// ============================================================
// modules/idp/productos.js — Claves experimentales y graduación a clave ERP.
// Endpoints (/protected/idp): productos-desarrollo (GET/POST/PATCH),
// productos-desarrollo/:id/sugerencias|graduar|revertir, productos-erp?q=
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  const b = await KoguShell.initShell({
    currentPage: '/modules/idp/productos.html',
    title: 'Claves experimentales',
    description: 'Productos en desarrollo y su graduación a clave del ERP.',
    requiredPermission: 'idp.proyectos.read',
  });
  if (!b) return;
  const I = KoguIdp; const esc = I.esc; const BASE = I.BASE;
  const canDev = KoguShell.hasPerm(b, 'idp.proyectos.desarrollar');
  const canGrad = KoguShell.hasPerm(b, 'idp.productos.graduar');
  const canAdmin = KoguShell.hasPerm(b, 'idp.admin');
  const pc = document.getElementById('pageContent');
  const $ = (x) => document.getElementById(x);
  const f = { q: '', graduado: '' };
  let filas = [];

  pc.innerHTML = `
    <div class="card"><div class="row" style="gap:10px;flex-wrap:wrap;align-items:flex-end">
      <div style="flex:1;min-width:240px"><div class="label-text">Buscar</div><input class="input" id="fQ" placeholder="Clave experimental, nombre o clave ERP…" autocomplete="off" style="width:100%"/></div>
      <div><div class="label-text">Graduación</div><select class="select" id="fG"><option value="">Todas</option><option value="no">Sin graduar</option><option value="si">Graduadas</option></select></div>
      ${canDev ? '<button class="btn primary" id="btnNueva" style="margin-left:auto">+ Clave experimental</button>' : ''}
    </div></div>
    <div class="card" style="margin-top:14px">
      <div class="eyebrow" id="lbl" style="margin-bottom:8px">Claves</div>
      <div class="table-wrap"><table><thead><tr><th>Clave</th><th>Nombre</th><th>Proyecto</th><th>Clave ERP</th><th style="text-align:right">Muestras</th><th></th></tr></thead>
      <tbody id="tb"><tr><td colspan="6" class="empty">Cargando…</td></tr></tbody></table></div>
    </div>`;

  async function cargar() {
    try { filas = KoguApi.unwrapData(await KoguApi.apiFetch(`${BASE}/productos-desarrollo?${KoguUi.queryParams(f)}`)) || []; }
    catch (err) { $('tb').innerHTML = `<tr><td colspan="6" class="empty">${esc(I.mensajeError(err))}</td></tr>`; return; }
    $('lbl').textContent = `${filas.length} clave${filas.length === 1 ? '' : 's'}`;
    $('tb').innerHTML = filas.length ? filas.map((c) => `<tr>
      <td><span class="chip-compact">${esc(c.codigo)}</span></td>
      <td style="font-weight:600">${esc(c.nombre)}</td>
      <td>${c.proyecto_id ? `<a class="link" href="/modules/idp/proyecto.html?id=${encodeURIComponent(c.proyecto_id)}">${esc(c.proyecto_folio || 'Ver')}</a> <span class="muted" style="font-size:12px">${esc(c.proyecto_nombre || '')}</span>` : '<span class="muted">—</span>'}</td>
      <td>${c.producto_id ? `${I.chip(c.cve_prod, '#16a34a')} <span class="muted" style="font-size:12px">${esc(c.desc_prod || '')}${c.graduado_por_nombre ? ' · por ' + esc(c.graduado_por_nombre) : ''}</span>` : '<span class="muted">sin graduar</span>'}</td>
      <td style="text-align:right">${c.muestras ?? 0}</td>
      <td style="white-space:nowrap">${!c.producto_id && canGrad ? `<button class="btn primary" data-grad="${esc(c.producto_desarrollo_id)}">Graduar</button>` : ''}
        ${c.producto_id && canAdmin ? `<button class="btn" data-rev="${esc(c.producto_desarrollo_id)}">Revertir</button>` : ''}</td>
    </tr>`).join('') : '<tr><td colspan="6" class="empty">Sin claves con estos filtros.</td></tr>';
    $('tb').querySelectorAll('[data-grad]').forEach((x) => (x.onclick = () => graduar(filas.find((c) => c.producto_desarrollo_id === x.dataset.grad))));
    $('tb').querySelectorAll('[data-rev]').forEach((x) => (x.onclick = () => revertir(filas.find((c) => c.producto_desarrollo_id === x.dataset.rev))));
  }

  let t;
  $('fQ').oninput = () => { clearTimeout(t); t = setTimeout(() => { f.q = $('fQ').value.trim(); cargar(); }, 300); };
  $('fG').onchange = () => { f.graduado = $('fG').value; cargar(); };
  if ($('btnNueva')) $('btnNueva').onclick = nueva;
  cargar();

  function nueva() {
    I.modal({
      eyebrow: 'I+D', titulo: 'Nueva clave experimental', aceptar: 'Dar de alta',
      cuerpo: `<div><div class="label-text">Clave</div><input class="input" data-c="codigo" placeholder="Ej. ADF/PNC/01121" style="width:100%;text-transform:uppercase"/>
          <div class="hint" style="font-size:12px;color:var(--muted);margin-top:4px">Se normaliza sola: ADF-PNC-01121 y ADFPNC01121 quedan como ADF/PNC/01121.</div></div>
        <div><div class="label-text">Nombre</div><input class="input" data-c="nombre" style="width:100%"/></div>
        <div class="hint" style="font-size:12px;color:var(--muted)">Para ligarla a un proyecto, dala de alta desde el detalle del proyecto.</div>`,
      onSubmit: async (m) => {
        const body = { codigo: m.querySelector('[data-c="codigo"]').value.trim(), nombre: m.querySelector('[data-c="nombre"]').value.trim() };
        try { await KoguApi.apiFetch(`${BASE}/productos-desarrollo`, { method: 'POST', body: JSON.stringify(body) }); }
        catch (err) { if (err.status === 409) KoguApi.toast(I.mensajeError(err), 'error'); throw err; }
        KoguApi.toast('Clave dada de alta', 'success'); await cargar();
      },
    });
  }

  async function graduar(c) {
    let sel = null;
    const { el } = I.modal({
      eyebrow: `Graduar ${c.codigo}`, titulo: 'Asignar clave del ERP', aceptar: 'Graduar', ancho: 640,
      cuerpo: `<div class="muted" style="font-size:13px">${esc(c.nombre)}</div>
        <div><div class="label-text">Sugerencias por nombre</div><div data-s style="margin-top:6px"><span class="muted" style="font-size:13px">Buscando…</span></div></div>
        <div><div class="label-text">O busca la clave en el ERP</div><div style="position:relative;margin-top:4px">
          <input class="input" data-b placeholder="Clave o descripción…" style="width:100%"/>${I.cajaBusqueda('data-bc')}</div></div>
        <div data-sel class="hint" style="font-size:13px"></div>`,
      onSubmit: async () => {
        if (!sel) { KoguApi.toast('Elige el producto del ERP.', 'error'); throw new Error('sin producto'); }
        await KoguApi.apiFetch(`${BASE}/productos-desarrollo/${encodeURIComponent(c.producto_desarrollo_id)}/graduar`, { method: 'POST', body: JSON.stringify({ producto_id: sel.producto_id }) });
        KoguApi.toast(`${c.codigo} graduada a ${sel.cve_prod}`, 'success'); await cargar();
      },
    });
    const elegir = (p) => {
      sel = p; el.querySelectorAll('[data-sug]').forEach((r) => (r.checked = r.value === p.producto_id));
      el.querySelector('[data-sel]').innerHTML = `Seleccionado: ${I.chip(p.cve_prod, '#16a34a')} ${esc(p.desc_prod || '')}`;
    };
    let sug = [];
    try { sug = KoguApi.unwrapData(await KoguApi.apiFetch(`${BASE}/productos-desarrollo/${encodeURIComponent(c.producto_desarrollo_id)}/sugerencias`)) || []; } catch (_) {}
    el.querySelector('[data-s]').innerHTML = sug.length ? sug.map((p) => `<label style="display:flex;gap:8px;align-items:center;padding:5px 0;font-size:13px;cursor:pointer">
        <input type="radio" name="sug" data-sug value="${esc(p.producto_id)}"/> ${I.chip(p.cve_prod, '#2563eb')} ${esc(p.desc_prod)}
        <span class="muted" style="margin-left:auto">${Math.round(Number(p.score) * 100)}%</span></label>`).join('')
      : '<span class="muted" style="font-size:13px">Sin coincidencias por nombre; búscala abajo.</span>';
    el.querySelectorAll('[data-sug]').forEach((r) => (r.onchange = () => elegir(sug.find((p) => p.producto_id === r.value))));
    I.buscador(el.querySelector('[data-b]'), el.querySelector('[data-bc]'), {
      titulo: 'Buscar producto del ERP',
      fetcher: async (q) => KoguApi.unwrapData(await KoguApi.apiFetch(`${BASE}/productos-erp?q=${encodeURIComponent(q)}`)),
      pinta: (p) => `<span class="chip-compact">${esc(p.cve_prod)}</span> ${esc(p.desc_prod)}`,
      elegir: (p) => { el.querySelector('[data-b]').value = p.cve_prod; elegir(p); },
    });
  }

  function revertir(c) {
    I.modal({
      eyebrow: `${c.codigo} → ${c.cve_prod}`, titulo: 'Revertir graduación', aceptar: 'Revertir',
      cuerpo: `<div class="muted" style="font-size:13px">La clave experimental vuelve a quedar sin clave ERP. Queda registrado en la bitácora del proyecto.</div>
        <div><div class="label-text">Motivo</div><input class="input" data-r style="width:100%" placeholder="Ej. Se asignó la clave equivocada"/></div>`,
      onSubmit: async (m) => {
        const motivo = m.querySelector('[data-r]').value.trim();
        if (!motivo) { KoguApi.toast('Indica el motivo.', 'error'); throw new Error('motivo'); }
        await KoguApi.apiFetch(`${BASE}/productos-desarrollo/${encodeURIComponent(c.producto_desarrollo_id)}/revertir`, { method: 'POST', body: JSON.stringify({ motivo }) });
        KoguApi.toast('Graduación revertida', 'success'); await cargar();
      },
    });
  }
});

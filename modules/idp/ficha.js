// ============================================================
// modules/idp/ficha.js — Captura y publicación de ficha técnica (D5).
// Endpoints (/protected/idp): fichas/:id (GET/PATCH), /publicar,
// /obsoletar, /nueva-version, /pdf
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  const b = await KoguShell.initShell({
    currentPage: '/modules/idp/fichas.html',
    title: 'Ficha técnica',
    description: 'Captura por secciones, publicación y PDF.',
    requiredPermission: 'idp.proyectos.read',
  });
  if (!b) return;
  const I = KoguIdp; const esc = I.esc; const BASE = I.BASE;
  const canDev = KoguShell.hasPerm(b, 'idp.proyectos.desarrollar');
  const pc = document.getElementById('pageContent');
  const id = new URLSearchParams(location.search).get('id');
  const fid = encodeURIComponent(id || '');
  const volver = '<a class="link" href="/modules/idp/fichas.html">Volver a fichas</a>';
  if (!id) { pc.innerHTML = `<div class="card"><div class="empty">Falta la ficha. ${volver}</div></div>`; return; }
  let f = null;

  async function cargar() {
    try { f = KoguApi.unwrapData(await KoguApi.apiFetch(`${BASE}/fichas/${fid}`)); return true; }
    catch (_) { pc.innerHTML = `<div class="card"><div class="empty">No se encontró la ficha (o es de otra empresa). ${volver}</div></div>`; return false; }
  }

  function render() {
    const ed = f.estado === 'borrador' && canDev;
    const ro = ed ? '' : 'disabled';
    const c = f.contenido || {}; const o = c.organolepticos || {};
    const params = (c.parametros && c.parametros.length) ? c.parametros : (ed ? I.PARAMETROS_BASE.map((p) => ({ ...p, min: null, max: null })) : []);
    const falt = I.faltantesFicha(c);
    const inp = (k, v, ph = '') => `<input class="input" data-k="${k}" value="${esc(v ?? '')}" placeholder="${esc(ph)}" ${ro} style="width:100%"/>`;
    const area = (k, v, ph = '') => `<textarea class="input" data-k="${k}" rows="3" placeholder="${esc(ph)}" ${ro} style="width:100%">${esc(v ?? '')}</textarea>`;
    const filaParam = (p) => `<tr data-param>
        <td><input class="input" data-pn value="${esc(p.nombre || '')}" ${ro} style="width:100%"/></td>
        <td><input class="input" data-pu value="${esc(p.unidad || '')}" ${ro} style="width:90px"/></td>
        <td><input class="input" data-pmin type="number" step="any" value="${p.min ?? ''}" ${ro} style="width:110px"/></td>
        <td><input class="input" data-pmax type="number" step="any" value="${p.max ?? ''}" ${ro} style="width:110px"/></td>
        <td>${ed ? '<button class="btn" data-qp>✕</button>' : ''}</td></tr>`;
    const sec = (t, h) => `<div class="card" style="margin-top:14px"><div class="eyebrow" style="margin-bottom:10px">${t}</div>${h}</div>`;

    pc.innerHTML = `
      <div class="card"><div class="row" style="align-items:flex-start;gap:16px">
        <div><div class="eyebrow"><a class="link" href="/modules/idp/fichas.html">← Fichas técnicas</a> · ${esc(f.folio)}</div>
          <h2 style="margin:4px 0">${esc(f.nombre)}</h2>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">${I.chipFicha(f.estado)}${f.codigo ? I.chip(f.codigo, '#2563eb') : ''}
            ${f.proyecto_id ? `<a class="link" href="/modules/idp/proyecto.html?id=${encodeURIComponent(f.proyecto_id)}">${esc(f.proyecto_folio || 'Proyecto')}</a>` : ''}</div></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">
          ${ed ? '<button class="btn" id="btnGuardar">Guardar</button><button class="btn primary" id="btnPublicar">Publicar</button>' : ''}
          ${canDev && f.estado === 'vigente' ? '<button class="btn" id="btnObs">Marcar obsoleta</button>' : ''}
          ${canDev && f.estado !== 'borrador' ? '<button class="btn" id="btnVer">Nueva versión</button>' : ''}
          <button class="btn" id="btnPdf">PDF</button></div></div>
        ${ed && falt.length ? `<div class="hint" style="margin-top:10px;font-size:13px;color:#b45309">Para publicar falta: ${esc(falt.join(', '))}.</div>` : ''}
        ${f.estado !== 'borrador' ? `<div class="hint" style="margin-top:10px;font-size:13px;color:var(--muted)">Ficha ${esc(f.estado)}: no se edita. Para cambiarla crea una nueva versión.</div>` : ''}
      </div>
      ${sec('General', `<div><div class="label-text">Nombre en la ficha</div>${inp('nombre', f.nombre)}</div>
        <div style="margin-top:10px"><div class="label-text">Descripción</div>${area('descripcion', c.descripcion, 'Qué es y para qué se usa')}</div>
        <div style="margin-top:10px"><div class="label-text">Ingredientes</div>${area('ingredientes', c.ingredientes)}</div>`)}
      ${sec('Características organolépticas', `<div class="grid-2" style="gap:12px">
        <div><div class="label-text">Aspecto</div>${inp('aspecto', o.aspecto, 'Ej. Polvo fino fluido')}</div><div><div class="label-text">Color</div>${inp('color', o.color)}</div>
        <div><div class="label-text">Olor</div>${inp('olor', o.olor)}</div><div><div class="label-text">Sabor</div>${inp('sabor', o.sabor)}</div></div>`)}
      ${sec('Alérgenos', `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:6px 14px">
        ${I.ALERGENOS.map(([k, t]) => `<label style="font-size:13px;display:flex;gap:6px;align-items:center"><input type="checkbox" data-al="${k}" ${(c.alergenos || []).includes(k) ? 'checked' : ''} ${ro}/> ${esc(t)}</label>`).join('')}</div>
        <div class="hint" style="font-size:12px;color:var(--muted);margin-top:8px">Sin ninguno marcado, la ficha dice "No contiene alérgenos".</div>`)}
      ${sec('Parámetros fisicoquímicos', `<div class="table-wrap"><table><thead><tr><th>Parámetro</th><th>Unidad</th><th>Mínimo</th><th>Máximo</th><th></th></tr></thead>
        <tbody id="tbP">${params.map(filaParam).join('') || '<tr><td colspan="5" class="empty">Sin parámetros.</td></tr>'}</tbody></table></div>
        ${ed ? '<button class="btn" id="btnParam" style="margin-top:8px">+ Parámetro</button>' : ''}
        <div class="hint" style="font-size:12px;color:var(--muted);margin-top:6px">Los renglones sin nombre o sin valores no aplican y no se guardan.</div>`)}
      ${sec('Empaque, almacenamiento y vida útil', `<div class="grid-2" style="gap:12px">
        <div><div class="label-text">Mercado del empaque</div><select class="select" data-k="empaque_mercado" ${ro} style="width:100%"><option value="">—</option>
          ${[['nacional', 'Nacional'], ['centroamerica', 'Centroamérica'], ['exportacion', 'Exportación']].map(([v, t]) => `<option value="${v}"${c.empaque?.mercado === v ? ' selected' : ''}>${t}</option>`).join('')}</select></div>
        <div><div class="label-text">Empaque</div>${inp('empaque_descripcion', c.empaque?.descripcion, 'Ej. Bolsa PE en caja corrugada, 20 kg')}</div>
        <div><div class="label-text">Vida útil</div><div style="display:flex;gap:6px">
          <input class="input" type="number" min="0" data-k="vida_valor" value="${c.vida_util?.valor ?? ''}" ${ro} style="flex:1;min-width:0;width:auto"/>
          <select class="select" data-k="vida_unidad" ${ro} style="width:110px;flex:none">${[['dias', 'días'], ['meses', 'meses'], ['anios', 'años']].map(([v, t]) => `<option value="${v}"${(c.vida_util?.unidad || 'meses') === v ? ' selected' : ''}>${t}</option>`).join('')}</select></div></div>
        </div>
        <div style="margin-top:10px"><div class="label-text">Transporte y almacenamiento</div>${area('transporte', c.transporte_almacenamiento, 'Ej. Lugar fresco y seco, menos de 25 °C')}</div>`)}`;

    const q = (x) => document.getElementById(x);
    q('btnPdf').onclick = () => I.descargar(`${BASE}/fichas/${fid}/pdf`, { abrir: true });
    const ligarQuitar = () => pc.querySelectorAll('[data-qp]').forEach((x) => (x.onclick = () => x.closest('tr').remove()));
    ligarQuitar();
    if (q('btnParam')) q('btnParam').onclick = () => {
      const tb = q('tbP'); if (tb.querySelector('.empty')) tb.innerHTML = '';
      tb.insertAdjacentHTML('beforeend', filaParam({ nombre: '', unidad: '' })); ligarQuitar();
    };
    if (q('btnGuardar')) q('btnGuardar').onclick = () => KoguUi.withLoading(q('btnGuardar'), guardar, 'Guardando…').then(() => KoguApi.toast('Ficha guardada', 'success')).catch(() => {});
    if (q('btnPublicar')) q('btnPublicar').onclick = () => KoguUi.withLoading(q('btnPublicar'), async () => {
      const c2 = await guardar();
      const fl = I.faltantesFicha(c2);
      if (fl.length) { KoguApi.toast(`Para publicar falta: ${fl.join(', ')}`, 'error'); return; }
      if (!confirm('Al publicar, la ficha vigente anterior de este producto pasa a obsoleta. ¿Publicar?')) return;
      await KoguApi.apiFetch(`${BASE}/fichas/${fid}/publicar`, { method: 'POST' });
      KoguApi.toast('Ficha publicada', 'success'); await recargar();
    }, 'Publicando…').catch(() => {});
    if (q('btnObs')) q('btnObs').onclick = () => I.modal({
      eyebrow: f.folio, titulo: 'Marcar como obsoleta', aceptar: 'Marcar obsoleta',
      cuerpo: '<div><div class="label-text">Motivo</div><input class="input" data-m style="width:100%"/></div>',
      onSubmit: async (m) => {
        const motivo = m.querySelector('[data-m]').value.trim();
        if (!motivo) { KoguApi.toast('Indica el motivo.', 'error'); throw new Error('motivo'); }
        await KoguApi.apiFetch(`${BASE}/fichas/${fid}/obsoletar`, { method: 'POST', body: JSON.stringify({ motivo }) });
        KoguApi.toast('Ficha obsoleta', 'success'); await recargar();
      },
    });
    if (q('btnVer')) q('btnVer').onclick = () => KoguUi.withLoading(q('btnVer'), async () => {
      const n = KoguApi.unwrapData(await KoguApi.apiFetch(`${BASE}/fichas/${fid}/nueva-version`, { method: 'POST' }));
      KoguApi.toast(`Versión ${n.folio} creada en borrador`, 'success');
      location.href = `/modules/idp/ficha.html?id=${encodeURIComponent(n.idp_ficha_id)}`;
    }, 'Creando…').catch(() => {});
  }

  function leer() {
    const v = { alergenos: [], parametros: [] };
    pc.querySelectorAll('[data-k]').forEach((x) => (v[x.dataset.k] = x.value));
    pc.querySelectorAll('[data-al]').forEach((x) => { if (x.checked) v.alergenos.push(x.dataset.al); });
    pc.querySelectorAll('tr[data-param]').forEach((tr) => v.parametros.push({
      nombre: tr.querySelector('[data-pn]').value, unidad: tr.querySelector('[data-pu]').value,
      min: tr.querySelector('[data-pmin]').value, max: tr.querySelector('[data-pmax]').value }));
    return v;
  }
  async function guardar() {
    const v = leer();
    const contenido = I.contenidoFicha(v);
    if (!String(v.nombre || '').trim()) { KoguApi.toast('El nombre no puede quedar vacío.', 'error'); throw new Error('nombre'); }
    f = KoguApi.unwrapData(await KoguApi.apiFetch(`${BASE}/fichas/${fid}`, { method: 'PATCH', body: JSON.stringify({ nombre: v.nombre.trim(), contenido }) }));
    return f.contenido || contenido;
  }
  async function recargar() { if (await cargar()) render(); }

  if (await cargar()) render();
});

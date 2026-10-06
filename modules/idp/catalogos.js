// ============================================================
// modules/idp/catalogos.js — Catálogos de I+D (por empresa).
// Endpoints (/protected/idp): GET catalogos · POST catalogos ·
// PATCH/DELETE catalogos/:id (idp.admin). La clave es fija después del alta;
// un valor en uso no se borra (409): se desactiva.
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  const b = await KoguShell.initShell({
    currentPage: '/modules/idp/catalogos.html',
    title: 'Catálogos de I+D',
    description: 'Líneas, tipos de solicitud, segmentos, prioridades y opciones de requisitos de los proyectos.',
    requiredPermission: 'idp.proyectos.read',
  });
  if (!b) return;
  const I = KoguIdp; const esc = I.esc; const BASE = I.BASE;
  const canAdmin = KoguShell.hasPerm(b, 'idp.admin');
  const pc = document.getElementById('pageContent');
  const $ = (x) => document.getElementById(x);
  let datos = { definiciones: {} };
  let actual = new URLSearchParams(location.search).get("c");
  let verInactivos = true;

  pc.innerHTML = `
    <div style="display:grid;grid-template-columns:260px 1fr;gap:14px;align-items:start" id="lay">
      <div class="card" style="padding:8px 0">
        <div class="eyebrow" style="padding:6px 16px 8px">Catálogos</div>
        <div id="lista"><div class="empty" style="padding:12px 16px">Cargando…</div></div>
      </div>
      <div class="card" id="panel"><div class="empty">Cargando…</div></div>
    </div>`;
  const ajustar = () => { $('lay').style.gridTemplateColumns = window.innerWidth < 860 ? '1fr' : '260px 1fr'; };
  window.addEventListener('resize', ajustar); ajustar();

  const valoresDe = (k) => datos[k] || [];
  const nombreCat = (k) => datos.definiciones[k]?.nombre || k;

  async function cargar() {
    try { datos = KoguApi.unwrapData(await KoguApi.apiFetch(`${BASE}/catalogos`)) || { definiciones: {} }; }
    catch (err) { $('panel').innerHTML = `<div class="empty">${esc(I.mensajeError(err))}</div>`; return; }
    const claves = Object.keys(datos.definiciones);
    if (!actual || !claves.includes(actual)) actual = claves[0];
    pintarLista(); pintarPanel();
  }

  function pintarLista() {
    $('lista').innerHTML = Object.keys(datos.definiciones).map((k) => {
      const v = valoresDe(k); const act = v.filter((x) => x.activo !== false).length;
      const sel = k === actual;
      return `<a href="#" data-cat="${esc(k)}" style="display:flex;justify-content:space-between;gap:8px;padding:9px 16px;text-decoration:none;color:inherit;
        border-left:3px solid ${sel ? 'var(--primary,#2563eb)' : 'transparent'};background:${sel ? 'rgba(37,99,235,.07)' : 'transparent'};font-weight:${sel ? 600 : 400}">
        <span>${esc(nombreCat(k))}</span><span class="muted" style="font-size:12px;white-space:nowrap">${act}${act !== v.length ? ` / ${v.length}` : ''}</span></a>`;
    }).join('');
    $('lista').querySelectorAll('[data-cat]').forEach((a) => (a.onclick = (e) => {
      e.preventDefault(); actual = a.dataset.cat;
      history.replaceState(null, '', `?c=${encodeURIComponent(actual)}`);
      pintarLista(); pintarPanel();
    }));
  }

  function pintarPanel() {
    const def = datos.definiciones[actual] || {};
    const vals = valoresDe(actual);
    const esLinea = actual === 'linea';
    const arbol = I.arbolCatalogo(vals);
    const filas = [];
    arbol.forEach((p) => { filas.push({ v: p, nivel: 0, hermanos: arbol }); p.hijos.forEach((h) => filas.push({ v: h, nivel: 1, hermanos: p.hijos })); });
    const visibles = filas.filter((f) => verInactivos || f.v.activo !== false);
    const inactivos = vals.filter((v) => v.activo === false).length;
    const cols = 4 + (esLinea ? 1 : 0);
    $('panel').innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:12px">
        <div><div class="eyebrow">Catálogo${def.jerarquico ? ' · con subvalores' : ''}${def.multiple ? ' · selección múltiple' : ''}</div>
          <h2 style="margin:2px 0 0;font-size:20px">${esc(nombreCat(actual))}</h2>
          <div class="muted" style="font-size:13px;margin-top:2px">${vals.length - inactivos} activo${vals.length - inactivos === 1 ? '' : 's'}${inactivos ? ` · ${inactivos} inactivo${inactivos === 1 ? '' : 's'}` : ''}</div></div>
        <div style="display:flex;gap:10px;align-items:center">
          ${inactivos ? `<label style="font-size:13px;display:flex;gap:6px;align-items:center"><input type="checkbox" id="chkInact" ${verInactivos ? 'checked' : ''}/> Ver inactivos</label>` : ''}
          ${canAdmin ? '<button class="btn primary" id="btnAlta">+ Agregar valor</button>' : ''}
        </div>
      </div>
      ${esLinea ? '<div class="hint" style="font-size:12px;color:var(--muted);margin-bottom:10px">Los <b>requisitos</b> de cada línea definen qué bloques pide el proyecto en su pestaña de requisitos.</div>' : ''}
      <div class="table-wrap"><table><thead><tr><th>Nombre · clave</th>${esLinea ? '<th style="width:230px">Requisitos</th>' : ''}<th style="text-align:right;width:76px">Orden</th><th style="width:92px">Estado</th><th style="width:${canAdmin ? 190 : 8}px"></th></tr></thead>
      <tbody>${visibles.length ? visibles.map(({ v, nivel, hermanos }) => {
        const i = hermanos.findIndex((x) => x.valor_id === v.valor_id);
        const req = I.requisitosDeLinea(v);
        // "campo:texto" del diccionario → solo el texto que se escribía en el CRM
        const leg = [...new Set((v.legado || []).map((x) => String(x).replace(/^[a-z_]+:/, '')))];
        return `<tr style="${v.activo === false ? 'opacity:.55' : ''}">
          <td style="${nivel ? 'padding-left:34px' : 'font-weight:600'}">${nivel ? '<span class="muted">↳</span> ' : ''}${esc(v.nombre)}
            <div><code style="font-size:11.5px;font-weight:400;color:var(--muted,#475569);word-break:break-all">${esc(v.clave)}</code></div>
            ${leg.length ? `<div class="muted" style="font-size:11px;font-weight:400;margin-top:2px" title="Textos del CRM que se traducen a este valor:\n${esc(leg.join('\n'))}">CRM: ${esc(leg.slice(0, 2).join(' · '))}${leg.length > 2 ? ` +${leg.length - 2}` : ''}</div>` : ''}</td>
          ${esLinea ? `<td>${req.length ? `<div style="display:flex;flex-wrap:wrap;gap:4px;max-width:280px">${req.map((k) => I.chip(nombreCat(k), '#475569')).join('')}</div>` : '<span class="muted" style="font-size:12px">sin definir</span>'}</td>` : ''}
          <td style="text-align:right;white-space:nowrap">${canAdmin ? `<button class="btn ghost" data-up="${esc(v.valor_id)}" ${i <= 0 ? 'disabled' : ''} title="Subir" style="padding:2px 7px">↑</button><button class="btn ghost" data-down="${esc(v.valor_id)}" ${i >= hermanos.length - 1 ? 'disabled' : ''} title="Bajar" style="padding:2px 7px">↓</button>` : `<span class="muted">${esc(v.orden)}</span>`}</td>
          <td>${v.activo === false ? I.chip('inactivo', '#64748b') : I.chip('activo', '#16a34a')}</td>
          <td style="text-align:right">${canAdmin ? `<div style="display:inline-flex;gap:4px;white-space:nowrap">
            <button class="btn" data-ed="${esc(v.valor_id)}" style="padding:4px 10px;font-size:12px">Editar</button>
            <button class="btn" data-act="${esc(v.valor_id)}" style="padding:4px 10px;font-size:12px">${v.activo === false ? 'Activar' : 'Desactivar'}</button>
            <button class="btn ghost" data-del="${esc(v.valor_id)}" title="Borrar" style="padding:4px 8px;font-size:12px;color:#dc2626">✕</button></div>` : ''}</td>
        </tr>`;
      }).join('') : `<tr><td colspan="${cols}" class="empty">Sin valores${canAdmin ? ': agrega el primero.' : '.'}</td></tr>`}</tbody></table></div>`;

    const porId = (id) => vals.find((v) => v.valor_id === id);
    if ($('chkInact')) $('chkInact').onchange = () => { verInactivos = $('chkInact').checked; pintarPanel(); };
    if ($('btnAlta')) $('btnAlta').onclick = alta;
    $('panel').querySelectorAll('[data-ed]').forEach((x) => (x.onclick = () => editar(porId(x.dataset.ed))));
    $('panel').querySelectorAll('[data-act]').forEach((x) => (x.onclick = () => KoguUi.withLoading(x, () => alternar(porId(x.dataset.act)), '…').catch(() => {})));
    $('panel').querySelectorAll('[data-del]').forEach((x) => (x.onclick = () => borrar(porId(x.dataset.del))));
    $('panel').querySelectorAll('[data-up],[data-down]').forEach((x) => (x.onclick = () => {
      const id = x.dataset.up || x.dataset.down;
      const f = filas.find((r) => r.v.valor_id === id);
      const i = f.hermanos.findIndex((r) => r.valor_id === id);
      const otro = f.hermanos[x.dataset.up ? i - 1 : i + 1];
      if (otro) KoguUi.withLoading(x, () => mover(f.v, otro, f.hermanos), '…').catch(() => {});
    }));
  }

  const patch = (id, body) => KoguApi.apiFetch(`${BASE}/catalogos/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) });

  // Intercambia el orden con el vecino; si los dos tienen el mismo orden, renumera el grupo de 10 en 10.
  async function mover(v, otro, hermanos) {
    if (Number(v.orden) === Number(otro.orden)) {
      const lista = hermanos.map((h) => h.valor_id);
      const i = lista.indexOf(v.valor_id); const j = lista.indexOf(otro.valor_id);
      [lista[i], lista[j]] = [lista[j], lista[i]];
      const base = Math.min(...hermanos.map((h) => Number(h.orden) || 0));
      for (let k = 0; k < lista.length; k++) await patch(lista[k], { orden: base + (k + 1) * 10 });
    } else {
      await patch(v.valor_id, { orden: otro.orden });
      await patch(otro.valor_id, { orden: v.orden });
    }
    await cargar();
  }

  async function alternar(v) {
    await patch(v.valor_id, { activo: v.activo === false });
    KoguApi.toast(`"${v.nombre}" ${v.activo === false ? 'activado' : 'desactivado'}`, 'success');
    await cargar();
  }

  function casillasRequisitos(sel) {
    return `<div><div class="label-text">Requisitos que pide esta línea</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:6px 12px;margin-top:6px">
      ${I.CATALOGOS_REQUISITO.map((k) => `<label style="font-size:13px;display:flex;gap:6px;align-items:center"><input type="checkbox" data-req="${esc(k)}" ${sel.includes(k) ? 'checked' : ''}/> ${esc(nombreCat(k))}</label>`).join('')}
      </div></div>`;
  }
  const leerRequisitos = (m) => [...m.querySelectorAll('[data-req]:checked')].map((c) => c.dataset.req);

  function alta() {
    const def = datos.definiciones[actual] || {};
    const padres = def.jerarquico ? I.arbolCatalogo(valoresDe(actual)).filter((p) => p.activo !== false) : [];
    let claveTocada = false;
    const { el } = I.modal({
      eyebrow: nombreCat(actual), titulo: 'Agregar valor', aceptar: 'Agregar',
      cuerpo: `<div><div class="label-text">Nombre</div><input class="input" data-c="nombre" maxlength="120" style="width:100%"/></div>
        <div><div class="label-text">Clave</div><input class="input" data-c="clave" maxlength="60" style="width:100%;font-family:ui-monospace,monospace"/>
          <div class="hint" style="font-size:12px;color:var(--muted);margin-top:4px">Se propone del nombre. Es lo que guardan los proyectos: <b>no se puede cambiar después</b>.</div></div>
        ${def.jerarquico ? `<div><div class="label-text">Pertenece a</div><select class="select" data-c="padre_id" style="width:100%">
          <option value="">— Es un valor principal —</option>${padres.map((p) => `<option value="${esc(p.valor_id)}">${esc(p.nombre)}</option>`).join('')}</select></div>` : ''}
        <div><div class="label-text">Orden <span class="muted" style="font-weight:400">(opcional; vacío = al final)</span></div><input class="input" data-c="orden" type="number" style="width:140px"/></div>
        ${actual === 'linea' ? casillasRequisitos([]) : ''}`,
      onSubmit: async (m) => {
        const val = (k) => m.querySelector(`[data-c="${k}"]`)?.value ?? '';
        const form = { catalogo: actual, nombre: val('nombre'), clave: val('clave'), orden: val('orden'), padre_id: val('padre_id') };
        const err = I.validarValorCatalogo(form, valoresDe(actual));
        if (err) { KoguApi.toast(err, 'error'); throw new Error(err); }
        const body = I.cuerpoValorCatalogo(form);
        if (actual === 'linea') body.config = { requisitos: leerRequisitos(m) };
        try { await KoguApi.apiFetch(`${BASE}/catalogos`, { method: 'POST', body: JSON.stringify(body) }); }
        catch (e) { if (e.status === 409) KoguApi.toast(I.mensajeError(e), 'error'); throw e; }
        KoguApi.toast(`"${body.nombre}" agregado`, 'success'); await cargar();
      },
    });
    const $n = el.querySelector('[data-c="nombre"]'); const $c = el.querySelector('[data-c="clave"]');
    $n.addEventListener('input', () => { if (!claveTocada) $c.value = I.claveDesdeNombre($n.value); });
    $c.addEventListener('input', () => { claveTocada = $c.value !== ''; });
  }

  function editar(v) {
    const esLinea = actual === 'linea';
    I.modal({
      eyebrow: nombreCat(actual), titulo: `Editar "${v.nombre}"`,
      cuerpo: `<div><div class="label-text">Nombre</div><input class="input" data-c="nombre" maxlength="120" value="${esc(v.nombre)}" style="width:100%"/></div>
        <div><div class="label-text">Clave</div><input class="input" value="${esc(v.clave)}" disabled style="width:100%;font-family:ui-monospace,monospace"/>
          <div class="hint" style="font-size:12px;color:var(--muted);margin-top:4px">La clave no cambia: los proyectos la guardan. Si ya no se usa, desactiva el valor.</div></div>
        <div><div class="label-text">Orden</div><input class="input" data-c="orden" type="number" value="${esc(v.orden)}" style="width:140px"/></div>
        ${esLinea ? casillasRequisitos(I.requisitosDeLinea(v)) : ''}`,
      onSubmit: async (m) => {
        const nombre = m.querySelector('[data-c="nombre"]').value.trim();
        if (!nombre) { KoguApi.toast('Escribe el nombre.', 'error'); throw new Error('nombre'); }
        const body = {};
        if (nombre !== v.nombre) body.nombre = nombre;
        const orden = m.querySelector('[data-c="orden"]').value;
        if (orden !== '' && Number(orden) !== Number(v.orden)) body.orden = Number(orden);
        if (esLinea) {
          const req = leerRequisitos(m);
          if (JSON.stringify(req) !== JSON.stringify(I.requisitosDeLinea(v))) body.config = { ...(v.config || {}), requisitos: req };
        }
        if (!Object.keys(body).length) return;
        await patch(v.valor_id, body);
        KoguApi.toast('Cambios guardados', 'success'); await cargar();
      },
    });
  }

  function borrar(v) {
    I.modal({
      eyebrow: nombreCat(actual), titulo: `¿Borrar "${v.nombre}"?`, aceptar: 'Borrar',
      cuerpo: `<div style="font-size:14px">Se borra definitivamente. Si algún proyecto lo usa, el sistema no lo dejará borrar y tendrás que <b>desactivarlo</b>: así los proyectos viejos conservan su valor.</div>`,
      onSubmit: async () => {
        try { await KoguApi.apiFetch(`${BASE}/catalogos/${encodeURIComponent(v.valor_id)}`, { method: 'DELETE' }); }
        catch (e) { if (e.status === 409) KoguApi.toast(I.mensajeError(e), 'error'); throw e; }
        KoguApi.toast(`"${v.nombre}" borrado`, 'success'); await cargar();
      },
    });
  }

  cargar();
});

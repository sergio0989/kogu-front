// ============================================================
// modules/idp/lista-precio.js — Detalle de lista de precios (D4).
// Endpoints (/protected/idp): listas-precio/:id (GET/PATCH), /partidas
// (POST/PATCH/DELETE), /enviar|aprobar|devolver|cancelar, /copiar, /pdf,
// productos-erp?q=, productos-desarrollo?q=
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  const b = await KoguShell.initShell({
    currentPage: '/modules/idp/listas-precio.html',
    title: 'Lista de precios',
    description: 'Partidas, aprobación, vigencia e impresión.',
    requiredPermission: 'idp.precios.read',
  });
  if (!b) return;
  const I = KoguIdp; const esc = I.esc; const BASE = I.BASE;
  const canUpdate = KoguShell.hasPerm(b, 'idp.precios.update');
  const canCreate = KoguShell.hasPerm(b, 'idp.precios.create');
  const pc = document.getElementById('pageContent');
  const id = new URLSearchParams(location.search).get('id');
  const lid = encodeURIComponent(id || '');
  const volver = '<a class="link" href="/modules/idp/listas-precio.html">Volver a listas</a>';
  if (!id) { pc.innerHTML = `<div class="card"><div class="empty">Falta la lista. ${volver}</div></div>`; return; }
  let l = null;
  const fecha = (v) => (v ? KoguUi.fmtDateOnly(v) : '—');
  const ETQ_ACCION = { enviar: 'Enviar a aprobación', aprobar: 'Aprobar', devolver: 'Devolver', cancelar: 'Cancelar lista' };
  const MOTIVO = { devolver: true, cancelar: true };

  async function cargar() {
    try { l = KoguApi.unwrapData(await KoguApi.apiFetch(`${BASE}/listas-precio/${lid}`)); return true; }
    catch (_) { pc.innerHTML = `<div class="card"><div class="empty">No se encontró la lista (o es de otra empresa). ${volver}</div></div>`; return false; }
  }

  function render() {
    const editable = l.estado === 'borrador' && canUpdate;
    const ef = I.estadoLista(l);
    const acciones = (l.acciones || []).map((a) => `<button class="btn ${a === 'aprobar' || a === 'enviar' ? 'primary' : ''}" data-acc="${a}">${ETQ_ACCION[a] || a}</button>`).join('');
    const parts = l.partidas || [];
    const field = (k, v) => `<div class="kv-row"><span class="kv-k">${esc(k)}</span><span class="kv-v">${v == null || v === '' ? '<span class="muted">—</span>' : v}</span></div>`;
    pc.innerHTML = `
      <div class="card"><div class="row" style="align-items:flex-start;gap:16px">
        <div><div class="eyebrow"><a class="link" href="/modules/idp/listas-precio.html">← Listas de precios</a> · ${esc(l.folio)}</div>
          <h2 style="margin:4px 0">${esc(l.cliente_nombre)}</h2>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">${I.chipLista(l)}<span class="chip">${esc(l.moneda)}</span>${I.chipProspecto(l.cliente_estatus)}
            ${l.lista_origen_folio ? `<span class="muted" style="font-size:12px">copia de ${esc(l.lista_origen_folio)}</span>` : ''}</div></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">${acciones}
          ${canCreate ? '<button class="btn" id="btnCopiar">Copiar para recotizar</button>' : ''}<button class="btn" id="btnPdf">PDF</button></div>
      </div>
      ${ef === 'vencida' ? '<div class="hint" style="margin-top:10px;color:#b45309;font-size:13px">La vigencia terminó: la lista ya no es válida para el cliente. Cópiala para recotizar.</div>' : ''}
      ${l.estado === 'por_aprobar' && !(l.acciones || []).includes('aprobar') ? '<div class="hint" style="margin-top:10px;font-size:13px;color:var(--muted)">En espera de aprobación.</div>' : ''}
      </div>
      <div class="split" style="margin-top:14px">
        <div class="card"><div class="row" style="margin-bottom:6px"><div class="eyebrow">Encabezado</div>${editable ? '<button class="btn" id="btnEnc">Editar</button>' : ''}</div>
          <div class="kv kv-2">${field('Atención', esc(l.atencion || ''))}${field('Agente', esc(l.agente_nombre || ''))}
            ${field('Vigencia', `${fecha(l.vigencia_inicio)} – ${fecha(l.vigencia_fin)}`)}${field('Elaboró', esc(l.creado_por_nombre || ''))}
            ${field('Aprobó', l.aprobada_por_nombre ? `${esc(l.aprobada_por_nombre)} · ${fecha(l.aprobada_at)}` : '')}</div>
          ${l.condiciones ? `<div style="margin-top:10px;white-space:pre-wrap;font-size:13px">${esc(l.condiciones)}</div>` : ''}</div>
        <div class="card"><div class="eyebrow" style="margin-bottom:8px">Historial</div>
          ${(l.historial || []).length ? `<div class="ot-timeline">${l.historial.map((h) => `<div class="ot-ev ev-cambio_estado"><div class="ot-evdot"></div>
            <div class="ot-evhead"><span style="font-weight:600">${esc(h.de ? I.ETIQUETA_LISTA[h.de] || h.de : 'Alta')} → ${esc(I.ETIQUETA_LISTA[h.a] || h.a)}</span><span class="muted" style="font-size:12px">${KoguUi.fmtDate(h.created_at)}</span></div>
            ${h.motivo ? `<div class="ot-evtext">${esc(h.motivo)}</div>` : ''}<div class="ot-evby">por ${esc(h.usuario_nombre || '—')}</div></div>`).join('')}</div>` : '<div class="empty">Sin historial.</div>'}</div>
      </div>
      <div class="card" style="margin-top:14px">
        <div class="row" style="margin-bottom:8px"><div class="eyebrow">Partidas (${parts.length})</div>${editable ? '<button class="btn primary" id="btnPartida">+ Partida</button>' : ''}</div>
        <div class="table-wrap"><table><thead><tr><th>#</th><th>Producto</th><th>Descripción</th><th style="text-align:right">Cant. mín.</th><th style="text-align:right">Cant. máx.</th>
          <th style="text-align:right">Precio</th><th style="text-align:right">Imp. %</th><th>Entrega</th><th style="width:150px"></th></tr></thead>
        <tbody>${parts.length ? parts.map((p) => `<tr>
          <td>${p.renglon}</td>
          <td>${p.producto_id ? I.chip(p.cve_prod, '#2563eb') : `${I.chip(p.producto_desarrollo_codigo, '#7c3aed')}${p.graduado_a_producto_id ? ' <span class="muted" style="font-size:11px">graduada</span>' : ''}`}</td>
          <td>${esc(p.descripcion)}</td>
          <td style="text-align:right">${p.cantidad_min != null ? I.fmtNum(p.cantidad_min, 3) : ''}</td><td style="text-align:right">${p.cantidad_max != null ? I.fmtNum(p.cantidad_max, 3) : ''}</td>
          <td style="text-align:right;font-weight:600;white-space:nowrap">${esc(l.moneda)} ${I.fmtPrecio(p.precio)}</td><td style="text-align:right">${I.fmtNum(p.impuesto_pct, 2)}</td>
          <td>${esc(p.tiempo_entrega || '')}</td>
          <td><div class="actions-cell" style="flex-wrap:nowrap">${editable ? `<button class="btn" data-ed="${esc(p.partida_id)}">Editar</button> <button class="btn" data-del="${esc(p.partida_id)}">Quitar</button>` : ''}</div></td>
        </tr>`).join('') : `<tr><td colspan="9" class="empty">Sin partidas.${editable ? ' Agrega la primera.' : ''}</td></tr>`}</tbody></table></div>
      </div>`;
    const q = (x) => document.getElementById(x);
    pc.querySelectorAll('[data-acc]').forEach((x) => (x.onclick = () => accion(x.dataset.acc)));
    q('btnPdf').onclick = () => I.descargar(`${BASE}/listas-precio/${lid}/pdf`, { abrir: true });
    if (q('btnCopiar')) q('btnCopiar').onclick = () => KoguUi.withLoading(q('btnCopiar'), async () => {
      const n = KoguApi.unwrapData(await KoguApi.apiFetch(`${BASE}/listas-precio/${lid}/copiar`, { method: 'POST' }));
      KoguApi.toast(`Copia ${n.folio} creada en borrador`, 'success');
      location.href = `/modules/idp/lista-precio.html?id=${encodeURIComponent(n.lista_id)}`;
    }, 'Copiando…').catch(() => {});
    if (q('btnEnc')) q('btnEnc').onclick = editarEncabezado;
    if (q('btnPartida')) q('btnPartida').onclick = () => partida(null);
    pc.querySelectorAll('[data-ed]').forEach((x) => (x.onclick = () => partida(parts.find((p) => p.partida_id === x.dataset.ed))));
    pc.querySelectorAll('[data-del]').forEach((x) => (x.onclick = async () => {
      if (!confirm('¿Quitar esta partida?')) return;
      try { await KoguApi.apiFetch(`${BASE}/listas-precio/${lid}/partidas/${encodeURIComponent(x.dataset.del)}`, { method: 'DELETE' }); await recargar(); } catch (_) {}
    }));
  }
  async function recargar() { if (await cargar()) render(); }

  function accion(a) {
    I.modal({
      eyebrow: l.folio, titulo: ETQ_ACCION[a], aceptar: ETQ_ACCION[a],
      cuerpo: `${a === 'aprobar' ? '<div class="muted" style="font-size:13px">Al aprobarla queda vigente y se puede enviar al cliente.</div>' : ''}
        ${a === 'enviar' ? '<div class="muted" style="font-size:13px">Se avisa a los aprobadores. Mientras esté en revisión no se puede editar.</div>' : ''}
        ${MOTIVO[a] ? '<div><div class="label-text">Motivo</div><textarea class="input" data-m rows="3" style="width:100%"></textarea></div>' : ''}`,
      onSubmit: async (m) => {
        const body = {};
        if (MOTIVO[a]) { body.motivo = m.querySelector('[data-m]').value.trim(); if (!body.motivo) { KoguApi.toast('Indica el motivo.', 'error'); throw new Error('motivo'); } }
        try { await KoguApi.apiFetch(`${BASE}/listas-precio/${lid}/${a}`, { method: 'POST', body: JSON.stringify(body) }); }
        catch (err) { if (err.status !== 422) KoguApi.toast(I.mensajeError(err), 'error'); throw err; }
        KoguApi.toast('Lista actualizada', 'success'); await recargar();
      },
    });
  }

  function editarEncabezado() {
    const v10 = (d) => (d ? String(d).slice(0, 10) : '');
    I.modal({
      eyebrow: l.folio, titulo: 'Editar encabezado', ancho: 600,
      cuerpo: `<div class="grid-2" style="gap:12px">
          <div><div class="label-text">Moneda</div><select class="select" data-v="moneda" style="width:100%">${['USD', 'MXN', 'EUR'].map((m) => `<option${m === l.moneda ? ' selected' : ''}>${m}</option>`).join('')}</select></div>
          <div><div class="label-text">Atención</div><input class="input" data-v="atencion" value="${esc(l.atencion || '')}" style="width:100%"/></div>
          <div><div class="label-text">Vigencia desde</div><input class="input" type="date" data-v="vigencia_inicio" value="${v10(l.vigencia_inicio)}" style="width:100%"/></div>
          <div><div class="label-text">Vigencia hasta</div><input class="input" type="date" data-v="vigencia_fin" value="${v10(l.vigencia_fin)}" style="width:100%"/></div></div>
        <div><div class="label-text">Condiciones</div><textarea class="input" data-v="condiciones" rows="3" style="width:100%">${esc(l.condiciones || '')}</textarea></div>`,
      onSubmit: async (m) => {
        const body = {}; m.querySelectorAll('[data-v]').forEach((x) => (body[x.dataset.v] = x.value.trim() || null));
        await KoguApi.apiFetch(`${BASE}/listas-precio/${lid}`, { method: 'PATCH', body: JSON.stringify(body) });
        KoguApi.toast('Encabezado actualizado', 'success'); await recargar();
      },
    });
  }

  function partida(p) {
    const tipoIni = p && p.producto_desarrollo_id ? 'experimental' : 'erp';
    const sel = { producto_id: p?.producto_id || null, producto_desarrollo_id: p?.producto_desarrollo_id || null };
    const etiquetaSel = p ? (p.cve_prod || p.producto_desarrollo_codigo) : '';
    const n = (v) => (v == null ? '' : esc(String(Number(v))));
    const { el } = I.modal({
      eyebrow: l.folio, titulo: p ? `Editar partida ${p.renglon}` : 'Nueva partida', ancho: 620,
      cuerpo: `
        <div style="display:flex;gap:18px;font-size:13px"><label><input type="radio" name="tp" value="erp" data-tp ${tipoIni === 'erp' ? 'checked' : ''}/> Producto del ERP</label>
          <label><input type="radio" name="tp" value="experimental" data-tp ${tipoIni === 'experimental' ? 'checked' : ''}/> Clave experimental</label></div>
        <div><div class="label-text" data-lp>Producto</div><div style="position:relative;margin-top:4px">
          <input class="input" data-b value="${esc(etiquetaSel)}" placeholder="Clave o descripción…" style="width:100%"/>${I.cajaBusqueda('data-bc')}</div></div>
        <div><div class="label-text">Descripción <span class="muted">(vacío = la del producto)</span></div><input class="input" data-v="descripcion" value="${esc(p?.descripcion || '')}" style="width:100%"/></div>
        <div class="grid-2" style="gap:12px">
          <div><div class="label-text">Precio (${esc(l.moneda)})</div><input class="input" type="number" min="0" step="any" data-v="precio" value="${n(p?.precio)}" style="width:100%"/></div>
          <div><div class="label-text">Impuesto %</div><input class="input" type="number" min="0" max="100" step="any" data-v="impuesto_pct" value="${n(p?.impuesto_pct)}" placeholder="0" style="width:100%"/></div>
          <div><div class="label-text">Cantidad mínima</div><input class="input" type="number" min="0" step="any" data-v="cantidad_min" value="${n(p?.cantidad_min)}" style="width:100%"/></div>
          <div><div class="label-text">Cantidad máxima</div><input class="input" type="number" min="0" step="any" data-v="cantidad_max" value="${n(p?.cantidad_max)}" style="width:100%"/></div>
          <div><div class="label-text">Tiempo de entrega</div><input class="input" data-v="tiempo_entrega" value="${esc(p?.tiempo_entrega || '')}" placeholder="Ej. 2 semanas" style="width:100%"/></div>
        </div>`,
      onSubmit: async (m) => {
        const v = { tipo: m.querySelector('[data-tp]:checked').value, ...sel };
        m.querySelectorAll('[data-v]').forEach((x) => (v[x.dataset.v] = x.value));
        const err = I.validarPartida(v);
        if (err) { KoguApi.toast(err, 'error'); throw new Error(err); }
        const url = p ? `${BASE}/listas-precio/${lid}/partidas/${encodeURIComponent(p.partida_id)}` : `${BASE}/listas-precio/${lid}/partidas`;
        await KoguApi.apiFetch(url, { method: p ? 'PATCH' : 'POST', body: JSON.stringify(I.cuerpoPartida(v)) });
        KoguApi.toast(p ? 'Partida actualizada' : 'Partida agregada', 'success'); await recargar();
      },
    });
    const tipo = () => el.querySelector('[data-tp]:checked').value;
    el.querySelectorAll('[data-tp]').forEach((r) => (r.onchange = () => { el.querySelector('[data-b]').value = ''; sel.producto_id = null; sel.producto_desarrollo_id = null; }));
    I.buscador(el.querySelector('[data-b]'), el.querySelector('[data-bc]'), {
      get titulo() { return tipo() === 'erp' ? 'Seleccionar producto del ERP' : 'Seleccionar clave experimental'; },
      fetcher: async (q) => (tipo() === 'erp'
        ? KoguApi.unwrapData(await KoguApi.apiFetch(`${BASE}/productos-erp?q=${encodeURIComponent(q)}`))
        : KoguApi.unwrapData(await KoguApi.apiFetch(`${BASE}/productos-desarrollo?q=${encodeURIComponent(q)}`))),
      pinta: (x) => (x.cve_prod && !x.codigo ? `<span class="chip-compact">${esc(x.cve_prod)}</span> ${esc(x.desc_prod)}`
        : `<span class="chip-compact">${esc(x.codigo)}</span> ${esc(x.nombre)}${x.cve_prod ? ` <span class="muted" style="font-size:11px">→ ${esc(x.cve_prod)}</span>` : ''}`),
      elegir: (x) => {
        if (tipo() === 'erp') { sel.producto_id = x.producto_id; sel.producto_desarrollo_id = null; el.querySelector('[data-b]').value = x.cve_prod; }
        else { sel.producto_desarrollo_id = x.producto_desarrollo_id; sel.producto_id = null; el.querySelector('[data-b]').value = x.codigo; }
      },
    });
    el.querySelector('[data-b]').addEventListener('input', () => { sel.producto_id = null; sel.producto_desarrollo_id = null; });
  }

  if (await cargar()) render();
});

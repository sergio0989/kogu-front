// ============================================================
// modules/idp/mp-clave.js — Ficha de una clave de materia prima: cotización actual con
// sus escalas, historial de precios, datos de la clave (origen, unidad, densidad) y
// claves de la misma raíz solo como enlaces. Fase 2: costo integrado (DDP) por escala con
// los incrementables copiados de Comercio Exterior, capturados a mano o del CRM.
// Endpoints: /protected/idp/mp/claves/:id (GET, PATCH), …/costeos (GET),
//            …/incrementables (POST, DELETE), …/incrementables/escenario (PATCH)
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  const b = await KoguShell.initShell({
    currentPage: '/modules/idp/mp.html',
    title: 'Ficha de materia prima',
    description: 'Precio negociado, escalas, vigencia e historial de la clave.',
    requiredPermission: 'idp.mp.read',
  });
  if (!b) return;
  const I = KoguIdp; const esc = I.esc; const BASE = I.BASE;
  const puedeCapturar = KoguShell.hasPerm(b, 'idp.mp.capturar');
  const id = new URLSearchParams(location.search).get('id');
  const pc = document.getElementById('pageContent');
  const fecha = (d) => (d ? KoguUi.fmtDateOnly(d) : '—');
  const TR = { maritimo: 'Marítimo', terrestre: 'Terrestre', aereo: 'Aéreo' };

  async function cargar() {
    let k;
    try { k = KoguApi.unwrapData(await KoguApi.apiFetch(`${BASE}/mp/claves/${encodeURIComponent(id)}`)); }
    catch (err) { pc.innerHTML = `<div class="card"><div class="empty">${esc(I.mensajeError(err))}</div></div>`; return; }
    const actual = k.precios.find((p) => p.estado_vigencia === 'vigente' || p.estado_vigencia === 'por_vencer') || k.precios[0] || null;
    const escalasHtml = (p) => p.escalas.map((e, i) => `<tr><td>${esc(I.rangoEscala(p.escalas, i, { sinEscala: p.sin_escala }).replace(/ kg/g, ' ' + I.etiquetasUnidad(p.unidad || k.unidad_compra).corto))}</td>
        <td style="text-align:right;font-weight:600;font-variant-numeric:tabular-nums">${esc(I.precioMp(p.moneda, e.precio))} /${esc(I.etiquetasUnidad(p.unidad || k.unidad_compra).corto)}</td></tr>`).join('');
    pc.innerHTML = `
      <div class="card" style="display:flex;flex-wrap:wrap;gap:16px;justify-content:space-between;align-items:flex-start">
        <div>
          <a href="/modules/idp/mp.html" class="eyebrow" style="text-decoration:none">← Materias primas</a>
          <div style="margin-top:6px"><span class="chip-compact" style="font-size:14px">${esc(k.cve_prod)}</span></div>
          <h2 style="margin:6px 0 10px">${esc(k.desc_prod)}</h2>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
            ${I.chipOrigen(k.origen)}${k.pais ? `<span class="chip">${esc(k.pais)}</span>` : ''}
            <span class="chip">${esc(k.proveedor_nombre || 'Sin proveedor')}</span>
            <span class="chip">Unidad: ${esc(k.unidad_compra)}${k.unidad_compra === 'L' ? ` · ${k.densidad_kg_l ? `${k.densidad_kg_l} kg/L` : 'sin densidad'}` : ''}</span>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;align-items:flex-end">
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            ${puedeCapturar ? '<button class="btn" id="btnEditar">Editar clave</button><button class="btn primary" id="btnCot">+ Cotización</button>' : ''}
          </div>
          ${k.misma_raiz.length ? `<div class="muted" style="font-size:12px">Misma raíz: ${k.misma_raiz.map((m) => `<a href="/modules/idp/mp-clave.html?id=${encodeURIComponent(m.clave_id)}">${esc(m.cve_prod)}</a>`).join(', ')}</div>` : ''}
        </div>
      </div>
      ${k.unidad_compra === 'L' && !k.densidad_kg_l ? '<div class="card" style="margin-top:12px;background:#fffbeb;border-color:#fde68a"><b style="color:#92400e">Falta la densidad.</b> Se compra en litros: sin densidad no se puede costear por kg.</div>' : ''}
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:14px;margin-top:14px;align-items:start">
        <div class="card">
          <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap"><div class="eyebrow">Cotización actual</div>${actual ? I.chipVigencia(actual.estado_vigencia) : ''}</div>
          ${actual ? `
            <table style="margin-top:8px;table-layout:auto"><tbody>
              <tr><td class="muted">Incoterm</td><td>${actual.incoterm === 'por_definir' ? '<span style="color:#b45309">Por definir</span>' : esc(actual.incoterm)}${actual.lugar_entrega_nombre || actual.lugar_entrega ? ` · ${esc(actual.lugar_entrega_nombre || actual.lugar_entrega)}` : ''}${actual.transporte ? ` · ${esc(TR[actual.transporte] || actual.transporte)}` : ''}</td></tr>
              <tr><td class="muted">Vigencia</td><td>${fecha(actual.vigente_desde)} → ${fecha(actual.vigente_hasta)}</td></tr>
              <tr><td class="muted">Moneda</td><td>${esc(actual.moneda)}${actual.tc_captura ? ` · TC de ese día ${Number(actual.tc_captura).toFixed(4)}` : ''}</td></tr>
              ${actual.comentario ? `<tr><td class="muted">Comentario</td><td>${esc(actual.comentario)}</td></tr>` : ''}
              ${actual.legacy_id ? `<tr><td class="muted">Origen del dato</td><td>CRM · costo ${esc(actual.legacy_id)}</td></tr>` : ''}
            </tbody></table>
            <div class="label-text" style="margin-top:12px">Escalas</div>
            <table style="table-layout:auto"><thead><tr><th>Cantidad</th><th style="text-align:right">Precio ${esc(actual.incoterm === 'por_definir' ? '' : actual.incoterm)}</th></tr></thead><tbody>${escalasHtml(actual)}</tbody></table>`
            : '<div class="empty">Sin precios capturados.</div>'}
        </div>
        <div class="card">
          <div class="eyebrow">Historial de precios</div>
          <div class="table-wrap" style="margin-top:8px"><table style="table-layout:auto"><thead><tr style="white-space:nowrap"><th>Desde</th><th>Hasta</th><th>Incoterm</th><th style="text-align:right">Precio (escala mínima)</th><th style="text-align:right">Kg</th><th></th></tr></thead><tbody>
            ${k.precios.map((p) => `<tr><td style="white-space:nowrap">${fecha(p.vigente_desde)}</td><td style="white-space:nowrap">${fecha(p.vigente_hasta)}</td>
              <td>${p.incoterm === 'por_definir' ? '<span style="color:#b45309">Por definir</span>' : esc(p.incoterm)}</td>
              <td style="text-align:right;font-variant-numeric:tabular-nums">${esc(I.precioMp(p.moneda, p.escalas[0]?.precio))}</td>
              <td style="text-align:right;white-space:nowrap">${p.sin_escala ? '<span style="color:#b45309">Sin escala</span>' : `${Number(p.escalas[0]?.desde_kg || 0).toLocaleString('en-US')}${p.escalas.length > 1 ? ` <span class="muted">+${p.escalas.length - 1}</span>` : ''}`}</td>
              <td>${I.chipVigencia(p.estado_vigencia)}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">Sin historial.</td></tr>'}
          </tbody></table></div>
        </div>
      </div>
      ${seccionCosto(k)}
      <div class="card" style="margin-top:14px"><div class="eyebrow">Teórico contra real</div>
        <div class="muted" style="margin-top:6px">Fase 3: cada compra (Costos) e importación (Comercio Exterior) contra el costo integrado vigente ese día.</div></div>`;
    const btnCot = document.getElementById('btnCot');
    if (btnCot) btnCot.onclick = () => KoguMpCaptura.abrir({ clave: k, onGuardada: cargar });
    const btnEd = document.getElementById('btnEditar');
    if (btnEd) btnEd.onclick = () => editar(k);
    ligarSeccionCosto(k);
  }

  // ── Costo integrado (Fase 2) ──
  const n3 = (v) => (v == null || !Number.isFinite(Number(v)) ? '—' : Number(v).toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 }));
  const n2 = (v) => (v == null || !Number.isFinite(Number(v)) ? '—' : Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const aviso = (html, tono = 'ambar') => {
    const c = tono === 'ambar' ? ['#fffbeb', '#fde68a'] : ['#ecfeff', '#a5f3fc'];
    return `<div style="font-size:13px;background:${c[0]};border:1px solid ${c[1]};border-radius:10px;padding:8px 12px;display:flex;gap:10px;justify-content:space-between;flex-wrap:wrap;align-items:center">${html}</div>`;
  };
  const CAPA = { cfr: 'Hasta CFR', ddp: 'Hasta DDP' };

  function seccionCosto(k) {
    const inc = k.incrementables; const c = k.costo;
    const botones = puedeCapturar ? `<div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn" data-inc-ligar>${inc ? 'Cambiar por un costeo' : 'Ligar costeo de Comercio Exterior'}</button>
        <button class="btn" data-inc-manual>Captura manual</button>
        ${inc ? '<button class="btn" data-inc-quitar>Quitar</button>' : ''}</div>` : '';
    if (!inc) {
      return `<div class="card" style="margin-top:14px;display:flex;flex-direction:column;gap:10px">
        <div class="eyebrow">Costo integrado (DDP)</div>
        <div class="muted">Sin incrementables. El costo integrado es el precio de Materias primas más fletes, aduana y arancel: liga el costeo teórico de Comercio Exterior o captúralos a mano si el proveedor no está ahí.</div>
        ${botones}</div>`;
    }
    const precio = c?.precio_id ? k.precios.find((p) => p.precio_id === c.precio_id) : null;
    const al = inc.fuente === 'costeo'
      ? (c?.costeo_actualizado
        ? `<span style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span style="background:#fef3c7;color:#92400e;font-size:12px;font-weight:600;padding:4px 10px;border-radius:999px;white-space:nowrap">Comercio Exterior ya va en la versión ${esc(inc.costeo_version_actual)}</span>${puedeCapturar ? '<button class="btn" data-inc-recopiar>Volver a copiar</button>' : ''}</span>`
        : '<span style="background:#dcfce7;color:#166534;font-size:12px;font-weight:600;padding:4px 10px;border-radius:999px;white-space:nowrap">Al día con Comercio Exterior</span>')
      : '';
    const rev = c?.revision?.revisar
      ? aviso(`<span><b style="color:#92400e">Revisar precio.</b> ${c.revision.fuera_de_escala
        ? `Los ${Number(inc.kg_base).toLocaleString('en-US')} kg del embarque del costeo quedan por debajo de la primera escala.`
        : `El costeo de Comercio Exterior trae EXW USD ${n3(c.revision.exw_costeo_usd)}; Materias primas tiene USD ${n3(c.revision.exw_mp_usd)}. Manda Materias primas: los incrementables ya se recalcularon sobre ese precio.`}</span>`) : '';
    const escSel = inc.fuente === 'costeo' && (inc.escenarios || []).length > 1 && puedeCapturar
      ? `<label style="display:flex;gap:8px;align-items:center;font-size:13px"><span class="muted">Arancel</span><select class="select" data-inc-esc>
          ${inc.escenarios.map((e) => `<option value="${esc(e.escenario_id)}"${e.escenario_id === inc.escenario_id ? ' selected' : ''}>${esc(e.nombre)} · ${esc(e.arancel_pct)}%</option>`).join('')}</select></label>`
      : `<span class="muted" style="font-size:13px">Arancel ${esc(inc.arancel_pct)}%${inc.escenario_nombre ? ` · ${esc(inc.escenario_nombre)}` : ''}</span>`;
    const tabla = c?.escalas ? `<div class="table-wrap"><table style="table-layout:auto"><thead><tr style="white-space:nowrap">
        <th>Escala</th><th style="text-align:right">Kg para repartir fijos</th><th style="text-align:right">EXW USD/kg</th><th style="text-align:right">Incrementables USD/kg</th>
        <th style="text-align:right">DDP USD/kg</th><th style="text-align:right">DDP MXN/kg</th></tr></thead><tbody>
        ${c.escalas.map((e, i) => `<tr><td style="white-space:nowrap">${precio ? esc(I.rangoEscala(precio.escalas, i, { sinEscala: precio.sin_escala })) : esc(e.desde_kg)}</td>
          <td style="text-align:right">${e.kg_calculo ? Number(e.kg_calculo).toLocaleString('en-US', { maximumFractionDigits: 1 }) : '—'}</td>
          <td style="text-align:right;font-variant-numeric:tabular-nums">${n3(e.exw_kg_usd)}</td>
          <td style="text-align:right;font-variant-numeric:tabular-nums">${n3(e.incrementables_kg_usd)}</td>
          <td style="text-align:right;font-variant-numeric:tabular-nums;font-weight:700">${n3(e.ddp_kg_usd)}</td>
          <td style="text-align:right;font-variant-numeric:tabular-nums;font-weight:700">${n2(e.ddp_kg_mxn)}</td></tr>`).join('')}
        </tbody></table></div>` : '';
    const conceptos = `<details><summary style="cursor:pointer;font-size:13px;font-weight:600">Conceptos copiados (${(inc.conceptos || []).length})</summary>
        <table style="table-layout:auto;margin-top:6px"><thead><tr><th>Concepto</th><th>Capa</th><th>Cómo se calcula</th></tr></thead><tbody>
        ${(inc.conceptos || []).map((x) => `<tr><td>${esc(x.nombre || '—')}</td><td>${esc(CAPA[x.capa_incoterm] || x.capa_incoterm)}</td><td>${esc(I.comoSeCalcula(x, inc))}</td></tr>`).join('')}
        </tbody></table></details>`;
    return `<div class="card" style="margin-top:14px;display:flex;flex-direction:column;gap:10px">
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap">
        <div class="eyebrow">Costo integrado (DDP) por escala</div>
        <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">${escSel}${c?.fix ? `<span class="muted" style="font-size:12px">FIX ${esc(fecha(c.fecha_fix))} · ${Number(c.fix).toFixed(4)}</span>` : ''}</div>
      </div>
      ${aviso(`<span><b>Fuente:</b> ${esc(I.fuenteIncrementables(inc))}. Se recalcula sobre el precio de Materias primas.</span>${al}`, 'info')}
      ${rev}
      ${c?.nota ? aviso(`<span><b style="color:#92400e">Por confirmar.</b> ${esc(c.nota)} Corrige el incoterm de la cotización si no es así.</span>`) : ''}
      ${c?.aviso ? aviso(`<span><b style="color:#92400e">No se pudo costear.</b> ${esc(c.aviso)}</span>`) : ''}
      ${tabla}
      ${conceptos}
      ${botones}
    </div>`;
  }

  function ligarCosteo(k) {
    let costeos = []; let elegido = null;
    const { el } = I.modal({
      eyebrow: 'I+D · Materias primas', titulo: `Incrementables de ${k.cve_prod} desde Comercio Exterior`, aceptar: 'Ligar costeo', ancho: 760,
      cuerpo: `<div class="muted" style="font-size:13px">Se copian solo los incrementables (fletes, aduana, arancel); el precio EXW sigue siendo el de Materias primas. Se sugieren los costeos teóricos de la misma raíz (${esc(String(k.cve_prod).split('-')[0])}); primero los del mismo proveedor.</div>
        <div data-lista style="display:flex;flex-direction:column;gap:8px;max-height:320px;overflow:auto"><div class="muted">Buscando costeos…</div></div>
        <div data-esc-w style="display:none"><div class="label-text">Escenario de arancel que aplica</div><select class="select" data-esc style="width:100%"></select></div>`,
      onSubmit: async (m) => {
        if (!elegido) { KoguApi.toast('Elige un costeo.', 'error'); throw new Error('sin costeo'); }
        const body = { fuente: 'costeo', costeo_id: elegido.costeo_id, escenario_id: m.querySelector('[data-esc]').value || null };
        try { await KoguApi.apiFetch(`${BASE}/mp/claves/${encodeURIComponent(k.clave_id)}/incrementables`, { method: 'POST', body: JSON.stringify(body) }); KoguApi.toast('Costeo ligado.', 'success'); cargar(); }
        catch (err) { KoguApi.toast(I.mensajeError(err), 'error'); throw err; }
      },
    });
    const lista = el.querySelector('[data-lista]');
    const pintar = () => {
      lista.innerHTML = costeos.length ? costeos.map((x, i) => `<label style="display:flex;gap:10px;align-items:flex-start;border:1px solid var(--line);border-radius:10px;padding:10px 12px;cursor:pointer">
          <input type="radio" name="costeo" value="${i}" style="margin-top:3px"/>
          <span style="display:flex;flex-direction:column;gap:2px;font-size:13px">
            <span><b>${esc(x.folio || 's/folio')}</b> · <span class="chip-compact">${esc(x.cve_prod)}</span> ${x.mismo_proveedor ? '<span class="chip" style="background:#dcfce7;color:#166534">Mismo proveedor</span>' : ''}</span>
            <span class="muted">${esc(x.proveedor_nombre || 'Sin proveedor')} · ${x.fecha ? esc(fecha(x.fecha)) + ' · ' : ''}${Number(x.kg).toLocaleString('en-US')} kg · EXW USD ${n3(x.costo_unit_exw)} · versión ${esc(x.version_actual)}${x.modo_transporte ? ' · ' + esc(TR[x.modo_transporte] || x.modo_transporte) : ''}</span>
          </span></label>`).join('')
        : '<div class="empty">No hay costeos teóricos de esta raíz en Comercio Exterior. Usa la captura manual.</div>';
      lista.querySelectorAll('input[name=costeo]').forEach((r) => (r.onchange = () => {
        elegido = costeos[Number(r.value)];
        const w = el.querySelector('[data-esc-w]'); const s = el.querySelector('[data-esc]');
        s.innerHTML = (elegido.escenarios || []).map((e) => `<option value="${esc(e.escenario_id)}">${esc(e.nombre)} · ${esc(e.arancel_pct)}%</option>`).join('');
        w.style.display = (elegido.escenarios || []).length ? '' : 'none';
      }));
    };
    (async () => {
      try { costeos = KoguApi.unwrapData(await KoguApi.apiFetch(`${BASE}/mp/claves/${encodeURIComponent(k.clave_id)}/costeos`)) || []; pintar(); }
      catch (err) { lista.innerHTML = `<div class="empty">${esc(I.mensajeError(err))}</div>`; }
    })();
  }

  function capturaManual(k) {
    const fila = () => `<tr data-con>
        <td><input class="input" data-n placeholder="Flete a planta" style="width:100%;min-width:140px"/></td>
        <td><select class="select" data-c><option value="ddp">Hasta DDP</option><option value="cfr">Hasta CFR</option></select></td>
        <td><select class="select" data-m><option value="usd_kg">USD por kg</option><option value="mxn_kg">MXN por kg</option><option value="usd_fijo">USD por embarque</option><option value="mxn_fijo">MXN por embarque</option></select></td>
        <td><input class="input" data-v inputmode="decimal" placeholder="0.00" style="width:100px;text-align:right"/></td>
        <td><button class="btn" data-q aria-label="Quitar concepto" style="min-width:40px">✕</button></td></tr>`;
    const { el } = I.modal({
      eyebrow: 'I+D · Materias primas', titulo: `Incrementables de ${k.cve_prod} · captura manual`, aceptar: 'Guardar', ancho: 760,
      cuerpo: `<div class="muted" style="font-size:13px">Para proveedores que no están en Comercio Exterior. Se suman al precio de Materias primas; los gastos por embarque se reparten entre los kg de cada escala.</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px">
          <div style="grid-column:1/-1"><div class="label-text">De dónde salen</div><input class="input" data-mot placeholder="Flete cotizado por compras, referencia de importación…" style="width:100%"/></div>
          <div><div class="label-text">Kg del embarque</div><input class="input" data-kg inputmode="decimal" placeholder="solo si hay gastos por embarque" style="width:100%"/></div>
          <div><div class="label-text">Arancel (%)</div><input class="input" data-ar inputmode="decimal" placeholder="0" style="width:100%"/></div>
        </div>
        <div class="table-wrap"><table style="table-layout:auto"><thead><tr><th>Concepto</th><th>Capa</th><th>Cómo se calcula</th><th>Valor</th><th></th></tr></thead><tbody data-cons>${fila()}</tbody></table></div>
        <div><button class="btn" data-add>+ Agregar concepto</button></div>`,
      onSubmit: async (m) => {
        const r = I.cuerpoIncrementablesManual({ motivo: m.querySelector('[data-mot]').value, kg_base: m.querySelector('[data-kg]').value, arancel_pct: m.querySelector('[data-ar]').value,
          conceptos: [...m.querySelectorAll('[data-con]')].map((tr) => ({ nombre: tr.querySelector('[data-n]').value, capa_incoterm: tr.querySelector('[data-c]').value,
            modo_captura: tr.querySelector('[data-m]').value, valor_captura: tr.querySelector('[data-v]').value })) });
        if (!r.ok) { KoguApi.toast(r.error, 'error'); throw new Error(r.error); }
        try { await KoguApi.apiFetch(`${BASE}/mp/claves/${encodeURIComponent(k.clave_id)}/incrementables`, { method: 'POST', body: JSON.stringify(r.body) }); KoguApi.toast('Incrementables guardados.', 'success'); cargar(); }
        catch (err) { KoguApi.toast(I.mensajeError(err), 'error'); throw err; }
      },
    });
    const ligar = () => el.querySelectorAll('[data-q]').forEach((b) => (b.onclick = () => {
      if (el.querySelectorAll('[data-con]').length > 1) b.closest('tr').remove(); else b.closest('tr').querySelectorAll('input').forEach((i) => (i.value = ''));
    }));
    ligar();
    el.querySelector('[data-add]').onclick = () => { el.querySelector('[data-cons]').insertAdjacentHTML('beforeend', fila()); ligar(); };
  }

  function ligarSeccionCosto(k) {
    const q = (s) => document.querySelector(s);
    if (q('[data-inc-ligar]')) q('[data-inc-ligar]').onclick = () => ligarCosteo(k);
    if (q('[data-inc-manual]')) q('[data-inc-manual]').onclick = () => capturaManual(k);
    if (q('[data-inc-quitar]')) q('[data-inc-quitar]').onclick = () => I.modal({
      eyebrow: 'I+D · Materias primas', titulo: 'Quitar incrementables', aceptar: 'Quitar',
      cuerpo: `<div>La clave ${esc(k.cve_prod)} se quedará sin costo integrado. La copia actual queda en el historial.</div>`,
      onSubmit: async () => {
        try { await KoguApi.apiFetch(`${BASE}/mp/claves/${encodeURIComponent(k.clave_id)}/incrementables`, { method: 'DELETE' }); KoguApi.toast('Incrementables quitados.', 'success'); cargar(); }
        catch (err) { KoguApi.toast(I.mensajeError(err), 'error'); throw err; }
      },
    });
    if (q('[data-inc-recopiar]')) q('[data-inc-recopiar]').onclick = async () => {
      const inc = k.incrementables;
      try {
        await KoguApi.apiFetch(`${BASE}/mp/claves/${encodeURIComponent(k.clave_id)}/incrementables`, { method: 'POST',
          body: JSON.stringify({ fuente: 'costeo', costeo_id: inc.costeo_id, escenario_id: inc.escenario_id }) });
        KoguApi.toast('Copiada la versión vigente del costeo.', 'success'); cargar();
      } catch (err) { KoguApi.toast(I.mensajeError(err), 'error'); }
    };
    const sel = q('[data-inc-esc]');
    if (sel) sel.onchange = async () => {
      try { await KoguApi.apiFetch(`${BASE}/mp/claves/${encodeURIComponent(k.clave_id)}/incrementables/escenario`, { method: 'PATCH', body: JSON.stringify({ escenario_id: sel.value }) }); KoguApi.toast('Escenario de arancel actualizado.', 'success'); cargar(); }
      catch (err) { KoguApi.toast(I.mensajeError(err), 'error'); }
    };
  }

  function editar(k) {
    I.modal({
      eyebrow: 'I+D · Materias primas', titulo: `Clave ${k.cve_prod}`, aceptar: 'Guardar',
      cuerpo: `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px">
          <div><div class="label-text">Origen</div><select class="select" data-ori style="width:100%">
            ${[['nacional', 'Nacional'], ['importacion', 'Importación'], ['por_revisar', 'Por revisar']].map(([v, t]) => `<option value="${v}"${k.origen === v ? ' selected' : ''}>${t}</option>`).join('')}</select></div>
          <div><div class="label-text">País</div><input class="input" data-pais value="${esc(k.pais || '')}" style="width:100%"/></div>
          <div><div class="label-text">Unidad de compra</div><select class="select" data-uni style="width:100%">
            ${[['kg', 'kg'], ['L', 'Litro'], ['pieza', 'Pieza']].map(([v, t]) => `<option value="${v}"${k.unidad_compra === v ? ' selected' : ''}>${t}</option>`).join('')}</select></div>
          <div><div class="label-text">Densidad (kg/L)</div><input class="input" data-dens inputmode="decimal" value="${esc(k.densidad_kg_l ?? '')}" style="width:100%"/></div>
        </div>`,
      onSubmit: async (m) => {
        const v = (s) => m.querySelector(s).value.trim();
        const body = { origen: v('[data-ori]'), pais: v('[data-pais]') || null, unidad_compra: v('[data-uni]'), densidad_kg_l: v('[data-dens]') === '' ? null : Number(v('[data-dens]')) };
        try { await KoguApi.apiFetch(`${BASE}/mp/claves/${encodeURIComponent(k.clave_id)}`, { method: 'PATCH', body: JSON.stringify(body) }); KoguApi.toast('Clave actualizada.', 'success'); cargar(); }
        catch (err) { KoguApi.toast(I.mensajeError(err), 'error'); throw err; }
      },
    });
  }

  if (!id) { pc.innerHTML = '<div class="card"><div class="empty">Falta la clave.</div></div>'; return; }
  cargar();
});

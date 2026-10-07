// ============================================================
// modules/idp/mp-clave.js — Ficha de una clave de materia prima: cotización actual con
// sus escalas, historial de precios, datos de la clave (origen, unidad, densidad) y
// claves de la misma raíz solo como enlaces.
// Endpoints: /protected/idp/mp/claves/:id (GET, PATCH)
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
    const escalasHtml = (p) => p.escalas.map((e, i) => `<tr><td>${esc(I.rangoEscala(p.escalas, i, { sinEscala: p.sin_escala }))}</td>
        <td style="text-align:right;font-weight:600;font-variant-numeric:tabular-nums">${esc(I.precioMp(p.moneda, e.precio))} /${esc(k.unidad_compra || 'kg')}</td></tr>`).join('');
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
              <tr><td class="muted">Incoterm</td><td>${actual.incoterm === 'por_definir' ? '<span style="color:#b45309">Por definir</span>' : esc(actual.incoterm)}${actual.lugar_entrega ? ` · ${esc(actual.lugar_entrega)}` : ''}${actual.transporte ? ` · ${esc(TR[actual.transporte] || actual.transporte)}` : ''}</td></tr>
              <tr><td class="muted">Vigencia</td><td>${fecha(actual.vigente_desde)} → ${fecha(actual.vigente_hasta)}</td></tr>
              <tr><td class="muted">Moneda</td><td>${esc(actual.moneda)}${actual.tc_captura ? ` · TC de ese día ${Number(actual.tc_captura).toFixed(4)}` : ''}</td></tr>
              ${actual.comentario ? `<tr><td class="muted">Comentario</td><td>${esc(actual.comentario)}</td></tr>` : ''}
              ${actual.legacy_id ? `<tr><td class="muted">Origen del dato</td><td>CRM · costo ${esc(actual.legacy_id)}</td></tr>` : ''}
            </tbody></table>
            <div class="label-text" style="margin-top:12px">Escalas</div>
            <table style="table-layout:auto"><thead><tr><th>Kg</th><th style="text-align:right">Precio ${esc(actual.incoterm === 'por_definir' ? '' : actual.incoterm)}</th></tr></thead><tbody>${escalasHtml(actual)}</tbody></table>`
            : '<div class="empty">Sin precios capturados.</div>'}
        </div>
        <div class="card">
          <div class="eyebrow">Historial de precios</div>
          <div class="table-wrap" style="margin-top:8px"><table style="table-layout:auto"><thead><tr style="white-space:nowrap"><th>Desde</th><th>Hasta</th><th>Incoterm</th><th style="text-align:right">Precio (escala mínima)</th><th style="text-align:right">Kg</th><th></th></tr></thead><tbody>
            ${k.precios.map((p) => `<tr><td style="white-space:nowrap">${fecha(p.vigente_desde)}</td><td style="white-space:nowrap">${fecha(p.vigente_hasta)}</td>
              <td>${p.incoterm === 'por_definir' ? '<span style="color:#b45309">Por definir</span>' : esc(p.incoterm)}</td>
              <td style="text-align:right;font-variant-numeric:tabular-nums">${esc(I.precioMp(p.moneda, p.escalas[0]?.precio))}</td>
              <td style="text-align:right">${p.sin_escala ? '<span style="color:#b45309">Sin escala</span>' : `${Number(p.escalas[0]?.desde_kg || 0).toLocaleString('en-US')}${p.escalas.length > 1 ? ` <span class="muted">+${p.escalas.length - 1}</span>` : ''}`}</td>
              <td>${I.chipVigencia(p.estado_vigencia)}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">Sin historial.</td></tr>'}
          </tbody></table></div>
        </div>
      </div>
      <div class="card" style="margin-top:14px"><div class="eyebrow">Teórico contra real</div>
        <div class="muted" style="margin-top:6px">Fase 3: cada compra (Costos) e importación (Comercio Exterior) contra el costo integrado vigente ese día.</div></div>`;
    const btnCot = document.getElementById('btnCot');
    if (btnCot) btnCot.onclick = () => KoguMpCaptura.abrir({ clave: k, onGuardada: cargar });
    const btnEd = document.getElementById('btnEditar');
    if (btnEd) btnEd.onclick = () => editar(k);
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

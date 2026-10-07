// ============================================================
// modules/idp/mp-captura.js — Captura de cotización de materia prima (compartida
// por la lista y la ficha). Sin aprobación: se guarda y queda vigente; la anterior de
// la misma clave e incoterm cierra el día antes (lo hace el backend).
// Endpoints (/protected/idp): mp/productos?q=, mp/proveedores?q=, POST mp/cotizaciones
// ============================================================
(function (root) {
  const INCOTERMS = [['EXW', 'EXW · en planta del proveedor'], ['FCA', 'FCA'], ['FOB', 'FOB'], ['CFR', 'CFR'], ['CIF', 'CIF'], ['DAP', 'DAP'], ['DDP', 'DDP · puesto en planta']];

  function abrir({ clave = null, onGuardada } = {}) {
    const I = root.KoguIdp; const esc = I.esc; const BASE = I.BASE;
    const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date());
    const sel = { producto_id: clave?.producto_id || null, proveedor_id: clave?.proveedor_id || null, nueva: !clave };
    const filaEscala = (d = '', p = '') => `<tr data-esc>
        <td><input class="input" data-d inputmode="decimal" value="${esc(d)}" placeholder="kg" style="width:120px"/></td>
        <td data-h class="muted" style="white-space:nowrap;font-size:13px"></td>
        <td><input class="input" data-p inputmode="decimal" value="${esc(p)}" placeholder="0.00" style="width:110px;text-align:right"/></td>
        <td><button class="btn" data-q aria-label="Quitar escala" style="min-width:40px">✕</button></td></tr>`;
    const { el } = I.modal({
      eyebrow: 'I+D · Materias primas', titulo: clave ? `Nueva cotización · ${clave.cve_prod}` : 'Nueva cotización', aceptar: 'Guardar cotización', ancho: 760,
      cuerpo: `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px">
          <div style="grid-column:1/-1"><div class="label-text">Clave del proveedor (producto del catálogo)</div>
            ${clave ? `<div style="margin-top:4px"><span class="chip-compact">${esc(clave.cve_prod)}</span> ${esc(clave.desc_prod || '')}</div>`
              : `<div style="position:relative;margin-top:4px"><input class="input" data-prod placeholder="Clave o nombre (WWP0622, sal…)" style="width:100%"/>${I.cajaBusqueda('data-prodc')}</div>`}</div>
          <div style="grid-column:1/-1"><div class="label-text">Proveedor</div>
            <div style="position:relative;margin-top:4px"><input class="input" data-prov placeholder="Nombre o RFC" value="${esc(clave?.proveedor_nombre || '')}" style="width:100%"/>${I.cajaBusqueda('data-provc')}</div></div>
          <div><div class="label-text">Incoterm</div><select class="select" data-inc style="width:100%">${INCOTERMS.map(([v, t]) => `<option value="${v}">${esc(t)}</option>`).join('')}</select></div>
          <div><div class="label-text">Moneda</div><select class="select" data-mon style="width:100%"><option value="USD">USD</option><option value="MXN">MXN</option></select></div>
          <div><div class="label-text">Transporte</div><select class="select" data-tr style="width:100%"><option value="">—</option><option value="terrestre">Terrestre</option><option value="maritimo">Marítimo</option><option value="aereo">Aéreo</option></select></div>
          <div><div class="label-text">Lugar de entrega</div><input class="input" data-lug placeholder="Ciudad o puerto" style="width:100%"/></div>
          <div><div class="label-text">Vigente desde</div><input class="input" type="date" data-vd value="${hoy}" style="width:100%"/></div>
          <div><div class="label-text">Vigente hasta</div><input class="input" type="date" data-vh value="${I.vigenciaSugerida(hoy)}" style="width:100%"/></div>
        </div>
        <div data-dens-aviso style="display:none;background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:10px 12px;font-size:13px"></div>
        <div data-nueva style="display:${clave ? 'none' : 'grid'};grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;background:#f8fafc;border:1px solid var(--line);border-radius:10px;padding:12px">
          <div style="grid-column:1/-1;font-size:12px;color:var(--muted)">Clave nueva en Materias primas: se da de alta con esta primera cotización.</div>
          <div><div class="label-text">Origen</div><select class="select" data-ori style="width:100%"><option value="">Por el país</option><option value="nacional">Nacional</option><option value="importacion">Importación</option></select></div>
          <div><div class="label-text">País</div><input class="input" data-pais placeholder="México, Chile…" style="width:100%"/></div>
          <div><div class="label-text">Unidad de compra</div><select class="select" data-uni style="width:100%"><option value="kg">kg</option><option value="L">Litro (pide densidad)</option><option value="pieza">Pieza</option></select></div>
          <div data-dens-w style="display:none"><div class="label-text">Densidad (kg/L)</div><input class="input" data-dens inputmode="decimal" style="width:100%"/></div>
        </div>
        <div><div class="label-text">Escalas de precio</div>
          <div class="table-wrap" style="margin-top:4px"><table><thead><tr><th>Desde (kg)</th><th>Hasta</th><th>Precio por kg</th><th></th></tr></thead><tbody data-escs>${filaEscala()}</tbody></table></div>
          <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;margin-top:6px;flex-wrap:wrap">
            <button class="btn" data-add>+ Agregar escala</button>
            <span class="muted" style="font-size:12px">Cada escala vale hasta la siguiente; la última queda abierta. La primera es el mínimo de compra.</span></div></div>
        <div><div class="label-text">Comentario</div><textarea class="input" data-com rows="2" placeholder="MOQ, condiciones, referencia de importación…" style="width:100%"></textarea></div>`,
      onSubmit: async (m) => {
        const v = (s) => m.querySelector(s)?.value ?? '';
        const r = I.cuerpoCotizacion({
          producto_id: sel.producto_id, proveedor_id: sel.proveedor_id, incoterm: v('[data-inc]'), moneda: v('[data-mon]'), transporte: v('[data-tr]'),
          lugar_entrega: v('[data-lug]'), vigente_desde: v('[data-vd]'), vigente_hasta: v('[data-vh]'), comentario: v('[data-com]'),
          ...(sel.nueva ? { origen: v('[data-ori]'), pais: v('[data-pais]'), unidad_compra: v('[data-uni]'), densidad_kg_l: v('[data-dens]') } : {}),
          escalas: [...m.querySelectorAll('[data-esc]')].map((tr) => ({ desde_kg: tr.querySelector('[data-d]').value, precio: tr.querySelector('[data-p]').value })),
        });
        if (!r.ok) { KoguApi.toast(r.error, 'error'); throw new Error(r.error); }
        try {
          const x = KoguApi.unwrapData(await KoguApi.apiFetch(`${BASE}/mp/cotizaciones`, { method: 'POST', body: JSON.stringify(r.body) }));
          KoguApi.toast('Cotización guardada.', 'success');
          if (onGuardada) onGuardada(x);
        } catch (err) { KoguApi.toast(I.mensajeError(err), 'error'); throw err; }
      },
    });
    const $ = (s) => el.querySelector(s);
    const pintarHasta = () => {
      const trs = [...el.querySelectorAll('[data-esc]')];
      const h = I.hastaCaptura(trs.map((tr) => ({ desde_kg: tr.querySelector('[data-d]').value, precio: tr.querySelector('[data-p]').value })));
      trs.forEach((tr, i) => { const c = tr.querySelector('[data-h]'); c.textContent = h[i]; c.style.color = h[i] === 'desde repetido' ? '#991b1b' : ''; });
    };
    const ligarQuitar = () => {
      el.querySelectorAll('[data-q]').forEach((b) => (b.onclick = () => {
        if (el.querySelectorAll('[data-esc]').length > 1) b.closest('tr').remove(); else { b.closest('tr').querySelectorAll('input').forEach((i) => (i.value = '')); }
        pintarHasta();
      }));
      el.querySelectorAll('[data-d]').forEach((i) => (i.oninput = pintarHasta));
      pintarHasta();
    };
    ligarQuitar();
    $('[data-add]').onclick = () => { $('[data-escs]').insertAdjacentHTML('beforeend', filaEscala()); ligarQuitar(); };
    $('[data-vd]').onchange = () => { if ($('[data-vd]').value) $('[data-vh]').value = I.vigenciaSugerida($('[data-vd]').value); };
    $('[data-uni]').onchange = () => { $('[data-dens-w]').style.display = $('[data-uni]').value === 'L' ? '' : 'none'; };
    if (!clave) {
      I.buscador($('[data-prod]'), $('[data-prodc]'), {
        titulo: 'Seleccionar clave del catálogo',
        fetcher: async (q) => KoguApi.unwrapData(await KoguApi.apiFetch(`${BASE}/mp/productos?q=${encodeURIComponent(q)}`)) || [],
        pinta: (x) => `<span class="chip-compact">${esc(x.cve_prod)}</span> ${esc(x.desc_prod)}${x.clave_id ? ' <span class="muted" style="font-size:12px">· ya tiene precios</span>' : ''}`,
        elegir: (x) => {
          sel.producto_id = x.producto_id; sel.nueva = !x.clave_id; $('[data-prod]').value = `${x.cve_prod} · ${x.desc_prod}`;
          $('[data-nueva]').style.display = sel.nueva ? 'grid' : 'none';
          const sinDens = !sel.nueva && x.unidad_compra === 'L' && !x.densidad_kg_l;
          $('[data-dens-aviso]').style.display = sinDens ? '' : 'none';
          $('[data-dens-aviso]').innerHTML = sinDens ? `<b style="color:#92400e">${esc(x.cve_prod)} se compra en litros y no tiene densidad.</b> Captúrala primero en la <a href="/modules/idp/mp-clave.html?id=${encodeURIComponent(x.clave_id)}">ficha (Editar clave)</a>; sin ella no se puede costear por kg.` : '';
          if (x.proveedor_id) { sel.proveedor_id = x.proveedor_id; $('[data-prov]').value = x.proveedor_nombre || ''; }
        },
      });
    }
    I.buscador($('[data-prov]'), $('[data-provc]'), {
      titulo: 'Seleccionar proveedor',
      fetcher: async (q) => KoguApi.unwrapData(await KoguApi.apiFetch(`${BASE}/mp/proveedores?q=${encodeURIComponent(q)}`)) || [],
      pinta: (x) => `${esc(x.nombre)} ${x.rfc ? `<span class="muted" style="font-size:12px">${esc(x.rfc)}</span>` : ''}`,
      elegir: (x) => { sel.proveedor_id = x.proveedor_id; $('[data-prov]').value = x.nombre; },
    });
    return el;
  }

  root.KoguMpCaptura = { abrir };
})(window);

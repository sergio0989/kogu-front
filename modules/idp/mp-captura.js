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
    const sel = { producto_id: clave?.producto_id || null, proveedor_id: clave?.proveedor_id || null, nueva: !clave, densidad: clave?.densidad_kg_l || null };
    const filaEscala = (d = '', p = '') => `<tr data-esc>
        <td><input class="input" data-d inputmode="decimal" value="${esc(d)}" placeholder="kg" style="width:120px"/></td>
        <td><input class="input" data-h disabled tabindex="-1" placeholder="se calcula" aria-label="Hasta (se calcula con la siguiente escala)" style="width:140px;background:#f1f5f9;color:#475569;border-style:dashed;cursor:default"/></td>
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
            <div style="position:relative;margin-top:4px"><input class="input" data-prov placeholder="Nombre, RFC o clave del ERP" value="${esc(clave?.proveedor_nombre || '')}" style="width:100%"/>${I.cajaBusqueda('data-provc')}</div></div>
          <div><div class="label-text">Incoterm</div><select class="select" data-inc style="width:100%">${INCOTERMS.map(([v, t]) => `<option value="${v}">${esc(t)}</option>`).join('')}</select></div>
          <div><div class="label-text">Moneda</div><select class="select" data-mon style="width:100%"><option value="USD">USD</option><option value="MXN">MXN</option></select></div>
          <div><div class="label-text">Transporte</div><select class="select" data-tr style="width:100%"><option value="">—</option><option value="terrestre">Terrestre</option><option value="maritimo">Marítimo</option><option value="aereo">Aéreo</option></select></div>
          <div><div class="label-text">Lugar de entrega</div><select class="select" data-lug style="width:100%"><option value="">—</option></select></div>
          <div><div class="label-text">Unidad de la cotización</div><select class="select" data-uni style="width:100%"><option value="kg">kg</option><option value="L">Litro</option><option value="pieza">Pieza</option></select></div>
          <div data-dens-w style="display:none"><div class="label-text">Densidad (kg/L)</div><input class="input" data-dens inputmode="decimal" placeholder="p. ej. 0.92" style="width:100%"/></div>
          <div><div class="label-text">Vigente desde</div><input class="input" type="date" data-vd value="${hoy}" style="width:100%"/></div>
          <div><div class="label-text">Vigente hasta</div><input class="input" type="date" data-vh value="${I.vigenciaSugerida(hoy)}" style="width:100%"/></div>
        </div>
        <div><div class="label-text">Escalas de precio</div>
          <div class="table-wrap" style="margin-top:4px"><table><thead><tr><th data-th-d>Desde (kg)</th><th>Hasta (automático)</th><th data-th-p>Precio por kg</th><th></th></tr></thead><tbody data-escs>${filaEscala()}</tbody></table></div>
          <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;margin-top:6px;flex-wrap:wrap">
            <button class="btn" data-add>+ Agregar escala</button>
            <span class="muted" style="font-size:12px">Cada escala vale hasta la siguiente; la última queda abierta. La primera es el mínimo de compra.</span></div></div>
        <div><div class="label-text">Comentario</div><textarea class="input" data-com rows="2" placeholder="MOQ, condiciones, referencia de importación…" style="width:100%"></textarea></div>`,
      onSubmit: async (m) => {
        const v = (s) => m.querySelector(s)?.value ?? '';
        const r = I.cuerpoCotizacion({
          producto_id: sel.producto_id, proveedor_id: sel.proveedor_id, incoterm: v('[data-inc]'), moneda: v('[data-mon]'), transporte: v('[data-tr]'),
          lugar_entrega: v('[data-lug]'), vigente_desde: v('[data-vd]'), vigente_hasta: v('[data-vh]'), comentario: v('[data-com]'),
          unidad: v('[data-uni]'), densidad_kg_l: v('[data-dens]'), densidadClave: sel.densidad,
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
      const h = I.hastaCaptura(trs.map((tr) => ({ desde_kg: tr.querySelector('[data-d]').value, precio: tr.querySelector('[data-p]').value })), $('[data-uni]').value);
      trs.forEach((tr, i) => { const c = tr.querySelector('[data-h]'); c.value = h[i]; c.style.color = h[i] === 'desde repetido' ? '#991b1b' : '#475569'; });
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
    const pintarUnidad = () => {
      const u = $('[data-uni]').value; const et = I.etiquetasUnidad(u);
      $('[data-th-d]').textContent = et.desde; $('[data-th-p]').textContent = et.precio;
      el.querySelectorAll('[data-d]').forEach((i) => (i.placeholder = et.corto));
      $('[data-dens-w]').style.display = u === 'L' && !(Number(sel.densidad) > 0) ? '' : 'none';
      pintarHasta();
    };
    $('[data-uni]').onchange = pintarUnidad;
    if (clave?.unidad_compra) $('[data-uni]').value = clave.unidad_compra;
    pintarUnidad();
    (async () => {
      try {
        const cats = KoguApi.unwrapData(await KoguApi.apiFetch(`${BASE}/catalogos`)) || {};
        const lugares = (cats.lugar_entrega || []).filter((x) => x.activo);
        $('[data-lug]').innerHTML = '<option value="">—</option>' + lugares.map((x) => `<option value="${esc(x.clave)}">${esc(x.nombre)}</option>`).join('');
      } catch (_) { /* sin catálogo: el campo queda vacío */ }
    })();
    if (!clave) {
      I.buscador($('[data-prod]'), $('[data-prodc]'), {
        titulo: 'Seleccionar clave del catálogo',
        fetcher: async (q) => KoguApi.unwrapData(await KoguApi.apiFetch(`${BASE}/mp/productos?q=${encodeURIComponent(q)}`)) || [],
        pinta: (x) => `<span class="chip-compact">${esc(x.cve_prod)}</span> ${esc(x.desc_prod)}${x.clave_id ? ' <span class="muted" style="font-size:12px">· ya tiene precios</span>' : ''}`,
        accion: {
          texto: () => '¿No aparece? Los servicios no se listan; revisa su Tipo y Uso en el Catálogo de productos',
          onClick: () => window.open('/modules/cat/productos/productos.html', '_blank'),
        },
        elegir: (x) => {
          sel.producto_id = x.producto_id; sel.nueva = !x.clave_id; sel.densidad = x.densidad_kg_l || null;
          if (x.unidad_compra) $('[data-uni]').value = x.unidad_compra; $('[data-prod]').value = `${x.cve_prod} · ${x.desc_prod}`;
          pintarUnidad();   // en litros sin densidad, el campo aparece aquí mismo
          if (x.proveedor_id) { sel.proveedor_id = x.proveedor_id; $('[data-prov]').value = x.proveedor_nombre || ''; }
        },
      });
    }
    I.buscador($('[data-prov]'), $('[data-provc]'), {
      titulo: 'Seleccionar proveedor',
      fetcher: async (q) => KoguApi.unwrapData(await KoguApi.apiFetch(`${BASE}/mp/proveedores?q=${encodeURIComponent(q)}`)) || [],
      pinta: (x) => `${x.cve_prov ? `<span class="chip-compact">${esc(x.cve_prov)}</span> ` : ''}${esc(x.nombre)} ${x.rfc ? `<span class="muted" style="font-size:12px">${esc(x.rfc)}</span>` : ''}`,
      elegir: (x) => { sel.proveedor_id = x.proveedor_id; $('[data-prov]').value = x.nombre; },
    });
    return el;
  }

  root.KoguMpCaptura = { abrir };
})(window);

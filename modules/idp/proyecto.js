// ============================================================
// modules/idp/proyecto.js — Detalle de proyecto de I+D.
// Patrón de detalle KOGU: encabezado (chips + stepper + acciones),
// tira de métricas, datos a dos columnas y pestañas.
// Endpoints (/protected/idp): catalogo, proyectos/:id (+ acciones con
// "requiere"), /transicion, /historial, /eventos (+ adjunto), /muestras,
// productos-desarrollo?proyecto_id, fichas?proyecto_id (+ /pdf).
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  const b = await KoguShell.initShell({
    currentPage: '/modules/idp/proyectos.html',
    title: 'Proyecto de desarrollo',
    description: 'Ciclo, bitácora, muestras y fichas del proyecto.',
    requiredPermission: 'idp.proyectos.read',
  });
  if (!b) return;

  const I = KoguIdp; const esc = I.esc; const BASE = I.BASE;
  const can = (p) => KoguShell.hasPerm(b, p);
  const canUpdate = can('idp.proyectos.update');
  const canDev = can('idp.proyectos.desarrollar');
  const canCreate = can('idp.proyectos.create');
  const pc = document.getElementById('pageContent');
  const id = new URLSearchParams(location.search).get('id');
  const volver = '<a class="link" href="/modules/idp/proyectos.html">Volver a proyectos</a>';
  if (!id) { pc.innerHTML = `<div class="card"><div class="empty">Falta el proyecto. ${volver}</div></div>`; return; }

  let catalogo = { estados: [], motivos: [], desarrolladores: [], agentes: [] };
  let cats = { definiciones: {} };   // catálogos de I+D (línea, segmento, requisitos…)
  let p = null; let tab = 'bitacora';
  const datos = { eventos: [], muestras: [], claves: [], fichas: [], historial: [] };

  const get = async (path) => KoguApi.unwrapData(await KoguApi.apiFetch(BASE + path));
  const pid = encodeURIComponent(id);

  async function cargar() {
    try {
      [catalogo, p, cats] = await Promise.all([get('/catalogo'), get(`/proyectos/${pid}`), get('/catalogos').catch(() => ({ definiciones: {} }))]);
      cats = cats || { definiciones: {} };
    } catch (_) {
      pc.innerHTML = `<div class="card"><div class="empty">No se encontró el proyecto (o pertenece a otra empresa). ${volver}</div></div>`;
      return false;
    }
    const [ev, mu, cl, fi, hi] = await Promise.all([
      get(`/proyectos/${pid}/eventos`).catch(() => []),
      get(`/proyectos/${pid}/muestras?incluir_bajas=1`).catch(() => []),
      get(`/productos-desarrollo?proyecto_id=${pid}`).catch(() => []),
      get(`/fichas?proyecto_id=${pid}`).catch(() => []),
      get(`/proyectos/${pid}/historial`).catch(() => []),
    ]);
    Object.assign(datos, { eventos: ev || [], muestras: mu || [], claves: cl || [], fichas: fi || [], historial: hi || [] });
    return true;
  }

  const nombreEstado = (k) => catalogo.estados.find((e) => e.clave === k)?.nombre || k || '—';
  const nombreDev = (uid) => catalogo.desarrolladores.find((d) => d.user_id === uid)?.nombre || (uid ? 'Asignado' : null);
  const cerrado = () => ['cierre', 'cancelado'].includes(p.estado_categoria);
  const fecha = (v) => (v ? KoguUi.fmtDateOnly(v) : '—');
  const val = (k) => cats[k] || [];
  const nomCat = (k, clave) => I.nombreCatalogo(val(k), clave);
  const nomDef = (k) => cats.definiciones?.[k]?.nombre || k;
  const field = (k, v, long) => `<div class="kv-row${long ? ' kv-long' : ''}"><span class="kv-k">${esc(k)}</span><span class="kv-v">${v == null || v === '' ? '<span class="muted">—</span>' : v}</span></div>`;

  function stepper() {
    const fase = I.faseDe(p.estado, p.estado_categoria);
    const cancel = p.estado_categoria === 'cancelado';
    let h = '<div class="ot-stepper" style="margin-top:12px">';
    I.FASES.forEach((nombre, i) => {
      if (i > 0) h += `<div class="ot-line${fase != null && i <= fase ? ' done' : ''}"></div>`;
      let cls = 'pending'; let dot = String(i + 1);
      if (fase != null && i < fase) { cls = 'done'; dot = '✓'; }
      if (fase === i) { cls = cancel ? 'cancel' : (p.estado_categoria === 'cierre' ? 'done' : 'current'); dot = cancel ? '✕' : (cls === 'done' ? '✓' : dot); }
      const lbl = fase === i ? `${nombre} · ${nombreEstado(p.estado)}` : nombre;
      h += `<div class="ot-step ${cls}"><div class="ot-dot">${dot}</div><div class="ot-lbl">${esc(lbl)}</div></div>`;
    });
    return h + '</div>';
  }

  function render() {
    const ciclos = p.ciclos || {};
    const totalCiclos = ['reformular', 'remuestreo', 'recotizar'].reduce((s, k) => s + Number(ciclos[k] || 0), 0);
    const acciones = (p.acciones || []).map((a) => {
      const suave = ['cancelado', 'rechazado', 'no_aprobado', 'hold'].includes(a.a);
      return `<button class="btn ${suave ? '' : 'primary'}" data-accion="${esc(a.a)}">${esc(a.nombre)}</button>`;
    }).join('');
    // Tira de indicadores: Negocio (define el potencial) | Seguimiento
    const cPot = I.COLOR_POTENCIAL[p.potencial] || '#64748b';
    const kpi = (k, v, sub = '') => `<div class="idp-kpi"><div class="idp-kpi-k">${esc(k)}</div>
      <div class="idp-kpi-v">${v}</div>${sub ? `<div class="idp-kpi-s">${sub}</div>` : ''}</div>`;
    const vacio = '<span class="muted">—</span>';
    const detCiclos = Object.entries(ciclos).filter(([, v]) => v).map(([k, v]) => `${esc(k)} ${v}`).join(' · ');
    const indicadores = `
      <style>
        .idp-kpis{margin-top:14px;background:var(--panel,#fff);border:1px solid var(--line);border-radius:16px;overflow:hidden}
        .idp-kgrp{display:grid;grid-template-columns:150px 1fr;align-items:center;padding:14px 18px}
        .idp-kgrp + .idp-kgrp{border-top:1px solid var(--line)}
        .idp-kgrp-t{font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);line-height:1.5}
        .idp-kgrp-t span{display:block;font-weight:500;letter-spacing:0;text-transform:none;font-size:12px}
        .idp-krow{display:grid;grid-template-columns:repeat(4,minmax(0,1fr))}
        .idp-kpi{padding:2px 16px;min-width:0}
        .idp-kpi + .idp-kpi{border-left:1px solid var(--line)}
        .idp-kpi-k{font-size:12px;color:var(--muted);margin-bottom:4px;white-space:nowrap}
        .idp-kpi-v{font-size:21px;font-weight:800;line-height:1.2;overflow-wrap:anywhere}
        .idp-kpi-v small{font-size:13px;font-weight:600;color:var(--muted);margin-left:4px}
        .idp-kpi-s{font-size:12px;color:var(--muted);margin-top:3px}
        .idp-pot{display:inline-flex;align-items:center;gap:8px}
        .idp-pot b{display:inline-grid;place-items:center;width:32px;height:32px;border-radius:10px;font-size:17px}
        @media (max-width:900px){.idp-kgrp{grid-template-columns:1fr;gap:10px}.idp-krow{grid-template-columns:1fr 1fr;row-gap:12px}.idp-kpi{padding-left:0}.idp-kpi + .idp-kpi{border-left:none}}
      </style>
      <div class="idp-kpis">
        <div class="idp-kgrp"><div class="idp-kgrp-t">Negocio<span>define el potencial</span></div><div class="idp-krow">
          ${kpi('Potencial', p.potencial ? `<span class="idp-pot"><b style="background:${cPot}1a;color:${cPot};border:1px solid ${cPot}55">${esc(p.potencial)}</b><span style="font-size:15px">Clase ${esc(p.potencial)}</span></span>` : vacio)}
          ${kpi('Venta anual', p.venta_anual_usd != null ? esc(I.fmtUsd(p.venta_anual_usd)) : vacio, p.venta_anual_usd != null ? 'kg/mes × precio × 12' : '')}
          ${kpi('Volumen', p.kg_mes ? `${esc(I.fmtNum(p.kg_mes, 0))}<small>kg/mes</small>` : vacio)}
          ${kpi('Precio objetivo', p.precio_objetivo ? `${esc(I.fmtPrecio(p.precio_objetivo))}<small>${esc(p.moneda || '')}/kg</small>` : vacio)}
        </div></div>
        <div class="idp-kgrp"><div class="idp-kgrp-t">Seguimiento<span>avance con el cliente</span></div><div class="idp-krow">
          ${kpi('Fecha requerida', p.fecha_requerida ? esc(fecha(p.fecha_requerida)) : vacio)}
          ${kpi('Muestras entregadas', String(p.muestras_entregadas ?? 0))}
          ${kpi('Ciclos', String(totalCiclos), detCiclos)}
        </div></div>
      </div>`;
    const n = { muestras: datos.muestras.filter((m) => m.activo).length, claves: datos.claves.length, fichas: datos.fichas.length };
    const tabBtn = (k, t) => `<button class="tab${tab === k ? ' active' : ''}" data-tab="${k}">${t}</button>`;

    pc.innerHTML = `
      <div class="card">
        <div class="row" style="align-items:flex-start;gap:16px">
          <div style="min-width:0">
            <div class="eyebrow"><a class="link" href="/modules/idp/proyectos.html">← Proyectos</a> · ${esc(p.folio)}</div>
            <h2 style="margin:4px 0">${esc(p.nombre)}</h2>
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
              ${I.chipEstado(p.estado, p.estado_nombre || nombreEstado(p.estado), p.estado_categoria)}
              ${p.potencial ? I.chipPotencial(p.potencial) : ''}
              ${p.tipo ? `<span class="chip">${esc(p.tipo)}</span>` : ''}
              ${p.prioridad ? `<span class="chip">Prioridad ${esc(nomCat('prioridad', p.prioridad))}</span>` : ''}
              ${I.chipProspecto(p.cliente_estatus)}
              ${I.estancado(p) ? '<span class="chip" style="background:#b453091a;color:#b45309;border:1px solid #b4530955">estancado</span>' : ''}
            </div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">
            ${acciones}${canUpdate && !cerrado() ? '<button class="btn" id="btnEditar">Editar datos</button>' : ''}
          </div>
        </div>
        ${stepper()}
      </div>

      ${indicadores}

      <div class="split" style="margin-top:14px">
        <div class="card">
          <div class="kv kv-2">
            ${field('Cliente', `${esc(p.cliente_nombre || '')} ${I.chipProspecto(p.cliente_estatus)}`)}
            ${field('RFC', esc(p.cliente_rfc || ''))}
            ${field('Agente', esc(p.agente_nombre || ''))}
            ${field('Desarrollador', esc(nombreDev(p.desarrollador_id) || ''))}
            ${field('Línea', esc(nomCat('linea', p.linea)))}
            ${field('Tipo de solicitud', esc(nomCat('tipo_solicitud', p.tipo_solicitud)))}
            ${field('Segmento', esc(nomCat('segmento', p.segmento)))}
            ${p.categoria && !p.linea ? field('Categoría (CRM)', esc(p.categoria)) : ''}
            ${field('Alta', fecha(p.created_at))}
            ${field('Inicio de desarrollo', fecha(p.fecha_inicio))}
            ${field('Compromiso', fecha(p.fecha_compromiso))}
            ${field('Cierre', p.fecha_cierre ? `${fecha(p.fecha_cierre)}${p.cierre_vendido === true ? ' · vendido' : p.cierre_vendido === false ? ' · no vendido' : ''}` : '')}
          </div>
        </div>
        <div class="card">
          <div class="eyebrow" style="margin-bottom:8px">Descripción / requerimiento</div>
          <div style="white-space:pre-wrap;font-size:14px">${p.descripcion ? esc(p.descripcion) : '<span class="muted">Sin descripción.</span>'}</div>
        </div>
      </div>

      <div class="card" style="margin-top:14px">
        <div class="tabs">
          ${tabBtn('bitacora', 'Bitácora')}${tabBtn('requisitos', 'Requisitos')}${tabBtn('muestras', `Muestras (${n.muestras})`)}
          ${tabBtn('claves', `Claves experimentales (${n.claves})`)}${tabBtn('fichas', `Fichas técnicas (${n.fichas})`)}
          ${tabBtn('historial', 'Historial de estados')}
        </div>
        <div id="tabBody">${renderTab()}</div>
      </div>`;

    pc.querySelectorAll('[data-accion]').forEach((btn) => (btn.onclick = () => abrirTransicion((p.acciones || []).find((a) => a.a === btn.dataset.accion))));
    pc.querySelectorAll('[data-tab]').forEach((btn) => (btn.onclick = () => { tab = btn.dataset.tab; render(); }));
    if (document.getElementById('btnEditar')) document.getElementById('btnEditar').onclick = abrirEditar;
    ligarTab();
  }

  // ── Pestañas ────────────────────────────────────────────
  function renderTab() {
    if (tab === 'bitacora') {
      const form = cerrado() && !canUpdate ? '' : `
        <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px">
          <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center">
            <select class="select" id="evTipo" style="width:200px;flex:none">${['comentario', 'llamada', 'visita', 'correo', 'videoconferencia', 'apoyo'].map((t) => `<option value="${t}">${t}</option>`).join('')}</select>
            <input type="file" id="evFile" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.jpg,.jpeg,.png,.webp,.msg,.eml" style="font-size:12px"/>
          </div>
          <textarea class="input" id="evTxt" rows="2" placeholder="Escribe un comentario para la bitácora…" style="width:100%"></textarea>
          <div><button class="btn primary" id="evOk">Agregar a la bitácora</button></div>
        </div>`;
      const kb = (n) => (n ? `${Math.max(1, Math.round(Number(n) / 1024))} KB` : '');
      const lista = datos.eventos.length ? `<div class="ot-timeline">${datos.eventos.map((e) => `
        <div class="ot-ev ${e.tipo === 'sistema' ? 'ev-cambio_estado' : 'ev-nota'}">
          <div class="ot-evdot"></div>
          <div class="ot-evhead"><span style="display:inline-flex;gap:8px;align-items:center"><span class="chip">${esc(e.tipo)}</span><span style="font-weight:600;font-size:13px">${esc(e.usuario_nombre || 'Sistema')}</span></span>
            <span class="muted" style="font-size:12px">${KoguUi.fmtDate(e.created_at)}</span></div>
          <div class="ot-evtext" style="white-space:pre-wrap">${esc(e.texto)}</div>
          ${e.tiene_adjunto ? `<div style="margin-top:4px"><a href="#" class="link" data-adj="${esc(e.idp_evento_id)}" style="font-size:12px">📎 ${esc(e.adjunto_nombre || 'adjunto')} <span class="muted">${kb(e.adjunto_size)}</span></a></div>` : ''}
        </div>`).join('')}</div>` : '<div class="empty">Sin movimientos en la bitácora.</div>';
      return form + lista;
    }
    if (tab === 'requisitos') return renderRequisitos();
    if (tab === 'muestras') {
      const puedeRegistrar = !cerrado() && (canCreate || canDev || canUpdate);
      const filas = datos.muestras.map((m) => `
        <tr style="${m.activo ? '' : 'opacity:.55;text-decoration:line-through'}">
          <td>${m.tipo === 'entregada' ? '<span class="chip" style="background:#16a34a1a;color:#16a34a;border:1px solid #16a34a55">entregada</span>' : '<span class="chip">solicitada</span>'}</td>
          <td>${fecha(m.fecha)}</td><td style="font-weight:600">${esc(m.nombre)}</td>
          <td>${esc(m.codigo || m.producto_desarrollo_codigo || '')}</td>
          <td style="text-align:right">${esc(I.porcionMuestra(m)) || '—'}</td>
          <td>${esc(m.creado_por_nombre || '')}</td>
          <td>${m.activo && !cerrado() && (canDev || canUpdate) ? `<button class="btn" data-baja="${esc(m.idp_muestra_id)}">Dar de baja</button>` : (m.activo ? '' : '<span class="muted">baja</span>')}</td>
        </tr>`).join('');
      return `${puedeRegistrar ? '<div style="margin-bottom:10px"><button class="btn primary" id="btnMuestra">+ Registrar muestra</button></div>' : ''}
        <div class="table-wrap"><table><thead><tr><th>Tipo</th><th>Fecha</th><th>Muestra</th><th>Código</th><th style="text-align:right">Piezas · contenido</th><th>Registró</th><th></th></tr></thead>
        <tbody>${filas || '<tr><td colspan="7" class="empty">Sin muestras registradas.</td></tr>'}</tbody></table></div>`;
    }
    if (tab === 'claves') {
      const filas = datos.claves.map((c) => `<tr><td><span class="chip-compact">${esc(c.codigo)}</span></td><td>${esc(c.nombre)}</td>
        <td>${c.producto_id ? `<span class="chip" style="background:#16a34a1a;color:#16a34a;border:1px solid #16a34a55">${esc(c.cve_prod)}</span>` : '<span class="muted">sin graduar</span>'}</td>
        <td style="text-align:right">${c.muestras ?? 0}</td></tr>`).join('');
      return `${canDev && !cerrado() ? '<div style="margin-bottom:10px"><button class="btn primary" id="btnClave">+ Clave experimental</button></div>' : ''}
        <div class="table-wrap"><table><thead><tr><th>Clave</th><th>Nombre</th><th>Clave ERP</th><th style="text-align:right">Muestras</th></tr></thead>
        <tbody>${filas || '<tr><td colspan="4" class="empty">Sin claves experimentales en este proyecto.</td></tr>'}</tbody></table></div>`;
    }
    if (tab === 'fichas') {
      const filas = datos.fichas.map((f) => `<tr><td><span class="chip-compact">${esc(f.folio)}</span></td><td>${esc(f.nombre)}</td><td>${esc(f.codigo || '')}</td>
        <td>${I.chipEstado(f.estado === 'vigente' ? 'aprobado' : f.estado, f.estado, f.estado === 'obsoleta' ? 'cancelado' : 'inicial')}</td>
        <td><button class="btn" data-pdf="${esc(f.idp_ficha_id)}">PDF</button></td></tr>`).join('');
      return `<div class="table-wrap"><table><thead><tr><th>Folio</th><th>Producto</th><th>Clave</th><th>Estado</th><th></th></tr></thead>
        <tbody>${filas || '<tr><td colspan="5" class="empty">Sin fichas técnicas para este proyecto.</td></tr>'}</tbody></table></div>`;
    }
    // historial
    return datos.historial.length ? `<div class="ot-timeline">${datos.historial.map((h) => `
      <div class="ot-ev ev-cambio_estado"><div class="ot-evdot"></div>
        <div class="ot-evhead"><span style="font-weight:600">${esc(h.de ? nombreEstado(h.de) : 'Alta')} → ${esc(nombreEstado(h.a))}</span>
          <span class="muted" style="font-size:12px">${KoguUi.fmtDate(h.created_at)}</span></div>
        ${h.motivo ? `<div class="ot-evtext">Motivo: ${esc(h.motivo)}</div>` : ''}
        ${h.comentario ? `<div class="ot-evtext" style="white-space:pre-wrap">${esc(h.comentario)}</div>` : ''}
        <div class="ot-evby">por ${esc(h.usuario || '—')}</div></div>`).join('')}</div>` : '<div class="empty">Sin historial.</div>';
  }

  // ── Requisitos ────────────────────────────────────────
  const req = () => (p.requisitos && typeof p.requisitos === 'object' ? p.requisitos : {});
  const puedeRequisitos = () => !cerrado() && (canUpdate || canDev);
  function bloquesVisibles() {
    const lineaVal = val('linea').find((v) => v.clave === p.linea) || null;
    const base = I.bloquesRequisitos(lineaVal);
    // los bloques con datos guardados se muestran aunque la línea ya no los pida
    const conDatos = I.CATALOGOS_REQUISITO.filter((b) => !base.includes(b)
      && I.camposDeBloques([b]).slice(0, -I.CAMPOS_REQUISITO_GENERALES.length).some((c) => { const v = req()[c]; return v != null && v !== '' && !(Array.isArray(v) && !v.length); }));
    return { lineaVal, bloques: [...base, ...conDatos] };
  }
  function renderRequisitos() {
    const r = req(); const ed = puedeRequisitos(); const dis = ed ? '' : ' disabled';
    const { lineaVal, bloques } = bloquesVisibles();
    const definidos = I.requisitosDeLinea(lineaVal);
    const aviso = !p.linea ? 'El proyecto no tiene línea: se muestran todos los requisitos. Asígnale una en "Editar datos".'
      : definidos.length ? `La línea <b>${esc(nomCat('linea', p.linea))}</b> pide estos requisitos.`
        : `La línea <b>${esc(nomCat('linea', p.linea))}</b> aún no tiene requisitos definidos: se muestran todos (se configuran en Catálogos de I+D).`;
    const lab = (t) => `<div class="label-text">${esc(t)}</div>`;
    const sel = (campo, cat) => `<div>${lab(nomDef(cat))}<select class="select" data-r="${campo}" style="width:100%"${dis}>${I.opcionesHtml(val(cat), r[campo] || null)}</select></div>`;
    const checks = (campo, cat) => {
      const marcados = Array.isArray(r[campo]) ? r[campo] : [];
      const ops = I.opcionesCatalogo(val(cat), null).map((o) => o.clave);
      const extra = marcados.filter((c) => !ops.includes(c));  // inactivos que ya tenía
      return `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:4px 12px;margin-top:4px">${[...ops, ...extra].map((c) =>
        `<label style="font-size:13px;display:flex;gap:6px;align-items:center"><input type="checkbox" data-rl="${campo}" value="${esc(c)}"${marcados.includes(c) ? ' checked' : ''}${dis}/> ${esc(nomCat(cat, c))}</label>`).join('')}</div>`;
    };
    const txt = (campo, t, ph = '') => `<div>${lab(t)}<input class="input" data-r="${campo}" value="${esc(r[campo] ?? '')}" placeholder="${esc(ph)}" style="width:100%"${dis}/></div>`;
    const sino = (campo, t) => `<div>${lab(t)}<select class="select" data-r="${campo}" data-bool="1" style="width:100%"${dis}>
      ${[['', '—'], ['true', 'Sí'], ['false', 'No']].map(([v, n]) => `<option value="${v}"${String(r[campo] ?? '') === v ? ' selected' : ''}>${n}</option>`).join('')}</select></div>`;
    const simples = bloques.filter((b) => !['certificacion', 'documento'].includes(b));
    const secc = (titulo, cuerpo) => `<div style="border:1px solid var(--line);border-radius:12px;padding:14px"><div class="eyebrow" style="margin-bottom:10px">${esc(titulo)}</div>${cuerpo}</div>`;
    const alerg = Array.isArray(r.alergenos_lista) ? r.alergenos_lista : [];
    return `
      <div class="hint" style="font-size:13px;color:var(--muted);margin-bottom:12px">${aviso}</div>
      <div style="display:flex;flex-direction:column;gap:12px">
        ${simples.length ? secc('Producto', `<div class="grid-2" style="gap:12px">${simples.map((b) => sel(b, b)).join('')}</div>`) : ''}
        ${bloques.includes('certificacion') ? secc('Certificaciones', `${checks('certificaciones', 'certificacion')}<div style="margin-top:10px">${txt('certificacion_otro', 'Otra certificación', 'Ej. Carta garantía TIF')}</div>`) : ''}
        ${bloques.includes('documento') ? secc('Documentación', `<div class="label-text">Requerida por el cliente</div>${checks('documentos_requeridos', 'documento')}
            <div style="margin:8px 0 14px">${txt('documento_requerido_otro', 'Otro documento requerido')}</div>
            <div class="label-text">Entregada por el cliente</div>${checks('documentos_entregados', 'documento')}
            <div style="margin-top:8px">${txt('documento_entregado_otro', 'Otro documento entregado', 'Ej. Brief, audios')}</div>`) : ''}
        ${secc('Proceso y condiciones', `<div class="grid-2" style="gap:12px">
            ${sino('termoresistente', 'Termoresistente')}
            ${sino('alergenos', '¿Permite el uso de alérgenos?')}
            <div>${lab('Dosis de uso (%)')}<input class="input" type="number" min="0" step="any" data-r="dosis" value="${esc(r.dosis ?? '')}" style="width:100%"${dis}/></div>
            <div>${lab('Vida de anaquel (meses)')}<input class="input" type="number" min="0" step="1" data-r="vida_anaquel_meses" value="${esc(r.vida_anaquel_meses ?? '')}" style="width:100%"${dis}/></div>
          </div>
          <div data-alerg style="margin-top:10px;${r.alergenos === true ? '' : 'display:none'}">${lab('¿Cuáles alérgenos?')}
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:4px 12px;margin-top:4px">${I.ALERGENOS.map(([c, n]) =>
              `<label style="font-size:13px;display:flex;gap:6px;align-items:center"><input type="checkbox" data-rl="alergenos_lista" value="${c}"${alerg.includes(c) ? ' checked' : ''}${dis}/> ${esc(n)}</label>`).join('')}</div></div>
          <div style="margin-top:10px">${lab('Proceso del cliente')}<textarea class="input" data-r="proceso" rows="3" maxlength="4000" placeholder="Ej. Cocción 180°C de 3 a 5 min." style="width:100%"${dis}>${esc(r.proceso ?? '')}</textarea></div>
          <div style="margin-top:10px">${txt('direccion_envio', 'Dirección de envío de muestras', 'Solo si es distinta a la del cliente')}</div>`)}
        ${ed ? '<div><button class="btn primary" id="btnReq">Guardar requisitos</button></div>' : ''}
      </div>`;
  }
  function leerRequisitos() {
    const out = {};
    document.querySelectorAll('#tabBody [data-r]').forEach((x) => {
      const v = x.value;
      out[x.dataset.r] = x.dataset.bool ? (v === '' ? null : v === 'true') : v;
    });
    const listas = {};
    document.querySelectorAll('#tabBody [data-rl]').forEach((x) => { (listas[x.dataset.rl] ||= []); if (x.checked) listas[x.dataset.rl].push(x.value); });
    Object.assign(out, listas);
    if (out.alergenos !== true) out.alergenos_lista = [];
    return out;
  }
  async function guardarRequisitos() {
    const cambios = I.cuerpoRequisitos(leerRequisitos(), req());
    if (!cambios) { KoguApi.toast('No hay cambios que guardar.', 'info'); return; }
    await KoguApi.apiFetch(`${BASE}/proyectos/${pid}`, { method: 'PATCH', body: JSON.stringify({ requisitos: cambios }) });
    KoguApi.toast('Requisitos guardados', 'success');
    tab = 'requisitos'; await recargar();
  }

  function ligarTab() {
    const $ = (x) => document.getElementById(x);
    if ($('btnReq')) $('btnReq').onclick = () => KoguUi.withLoading($('btnReq'), guardarRequisitos, 'Guardando…').catch(() => {});
    const $al = document.querySelector('#tabBody [data-r="alergenos"]');
    if ($al) $al.onchange = () => { document.querySelector('#tabBody [data-alerg]').style.display = $al.value === 'true' ? '' : 'none'; };
    if ($('evOk')) $('evOk').onclick = () => KoguUi.withLoading($('evOk'), async () => {
      const texto = $('evTxt').value.trim(); const file = $('evFile').files[0];
      if (!texto && !file) { KoguApi.toast('Escribe un comentario o adjunta un archivo.', 'error'); return; }
      let opts;
      if (file) {
        const fd = new FormData(); fd.append('tipo', $('evTipo').value); fd.append('texto', texto); fd.append('archivo', file);
        opts = { method: 'POST', body: fd };
      } else opts = { method: 'POST', body: JSON.stringify({ tipo: $('evTipo').value, texto }) };
      try { await KoguApi.apiFetch(`${BASE}/proyectos/${pid}/eventos`, opts); } catch (err) { if (err.status !== 422) KoguApi.toast(I.mensajeError(err), 'error'); return; }
      await recargar();
    }, 'Guardando…');
    document.querySelectorAll('[data-adj]').forEach((a) => (a.onclick = (e) => {
      e.preventDefault(); I.descargar(`${BASE}/proyectos/${pid}/eventos/${encodeURIComponent(a.dataset.adj)}/adjunto`);
    }));
    if ($('btnMuestra')) $('btnMuestra').onclick = abrirMuestra;
    document.querySelectorAll('[data-baja]').forEach((btn) => (btn.onclick = () => abrirBajaMuestra(btn.dataset.baja)));
    if ($('btnClave')) $('btnClave').onclick = abrirClave;
    document.querySelectorAll('[data-pdf]').forEach((btn) => (btn.onclick = () => I.descargar(`${BASE}/fichas/${encodeURIComponent(btn.dataset.pdf)}/pdf`, { abrir: true })));
  }

  async function recargar() { if (await cargar()) render(); }

  // ── Cambio de estado ───────────────────────────────────
  function abrirTransicion(accion) {
    if (!accion) return;
    const c = I.camposTransicion(accion, catalogo);
    I.modal({
      eyebrow: `${p.folio} · ${nombreEstado(p.estado)} →`, titulo: accion.nombre, aceptar: `Pasar a ${accion.nombre}`,
      cuerpo: `
        ${c.motivos ? `<div><div class="label-text">Motivo</div><select class="select" data-v="motivo_id" style="width:100%"><option value="">— selecciona —</option>
          ${c.motivos.map((m) => `<option value="${esc(m.idp_motivo_id)}">${esc(m.nombre)}</option>`).join('')}</select></div>` : ''}
        ${c.desarrolladores ? `<div><div class="label-text">Desarrollador</div><select class="select" data-v="desarrollador_id" style="width:100%"><option value="">— selecciona —</option>
          ${c.desarrolladores.map((d) => `<option value="${esc(d.user_id)}">${esc(d.nombre)}</option>`).join('')}</select>
          ${c.desarrolladores.length ? '' : '<div class="hint" style="color:#b45309;font-size:12px;margin-top:4px">Nadie en esta empresa tiene permiso de desarrollo de I+D.</div>'}</div>` : ''}
        ${c.pideCierre ? `<div><div class="label-text">¿El proyecto terminó en venta?</div>
          <div style="display:flex;gap:16px;margin-top:6px"><label><input type="radio" name="cv" value="si" data-cv/> Sí, se vendió</label><label><input type="radio" name="cv" value="no" data-cv/> No se vendió</label></div>
          ${p.cliente_estatus === 'prospecto' ? '<div class="hint" style="font-size:12px;color:var(--muted);margin-top:4px">Si se vendió, el prospecto pasa a cliente.</div>' : ''}</div>` : ''}
        <div><div class="label-text">Comentario <span class="muted">(opcional)</span></div><textarea class="input" data-v="comentario" rows="3" style="width:100%"></textarea></div>`,
      onSubmit: async (m) => {
        const v = {};
        m.querySelectorAll('[data-v]').forEach((x) => (v[x.dataset.v] = x.value));
        const cv = m.querySelector('[data-cv]:checked'); if (cv) v.cierre_vendido = cv.value;
        const err = I.validarTransicion(c, v);
        if (err) { KoguApi.toast(err, 'error'); throw new Error(err); }
        await KoguApi.apiFetch(`${BASE}/proyectos/${pid}/transicion`, { method: 'POST', body: JSON.stringify(I.cuerpoTransicion(accion, v)) });
        KoguApi.toast(`Proyecto en ${accion.nombre}`, 'success');
        await recargar();
      },
    });
  }

  // ── Editar datos generales ─────────────────────────────
  function abrirEditar() {
    const opt = (vals, sel) => vals.map(([v, t]) => `<option value="${v}"${v === sel ? ' selected' : ''}>${t}</option>`).join('');
    I.modal({
      eyebrow: p.folio, titulo: 'Editar datos del proyecto', ancho: 640,
      cuerpo: `
        <div><div class="label-text">Nombre</div><input class="input" data-e="nombre" value="${esc(p.nombre)}" style="width:100%"/></div>
        <div class="grid-2" style="gap:12px">
          <div><div class="label-text">Tipo</div><select class="select" data-e="tipo" style="width:100%">${opt([['reactivo', 'Reactivo'], ['proactivo', 'Proactivo']], p.tipo)}</select></div>
          <div><div class="label-text">Prioridad</div><select class="select" data-e="prioridad" style="width:100%">${I.opcionesHtml(val('prioridad'), p.prioridad || null)}</select></div>
          <div><div class="label-text">Línea</div><select class="select" data-e="linea" style="width:100%">${I.opcionesHtml(val('linea'), p.linea || null)}</select></div>
          <div><div class="label-text">Tipo de solicitud</div><select class="select" data-e="tipo_solicitud" style="width:100%">${I.opcionesHtml(val('tipo_solicitud'), p.tipo_solicitud || null)}</select></div>
          <div><div class="label-text">Segmento</div><select class="select" data-e="segmento" style="width:100%">${I.opcionesHtml(val('segmento'), p.segmento || null)}</select></div>
          <div><div class="label-text">Volumen (kg/mes)</div><input class="input" type="number" min="0" step="any" data-e="kg_mes" value="${esc(p.kg_mes ?? '')}" style="width:100%"/></div>
          <div><div class="label-text">Precio objetivo por kg</div><div style="display:flex;gap:6px">
            <input class="input" type="number" min="0" step="any" data-e="precio_objetivo" value="${esc(p.precio_objetivo ?? '')}" style="flex:1;min-width:0;width:auto"/>
            <select class="select" data-e="moneda" style="width:90px;flex:none">${opt([['USD', 'USD'], ['MXN', 'MXN'], ['EUR', 'EUR']], p.moneda)}</select></div></div>
          <div><div class="label-text">Fecha requerida</div><input class="input" type="date" data-e="fecha_requerida" value="${esc(String(p.fecha_requerida || '').slice(0, 10))}" style="width:100%"/></div>
          <div><div class="label-text">Fecha compromiso</div><input class="input" type="date" data-e="fecha_compromiso" value="${esc(String(p.fecha_compromiso || '').slice(0, 10))}" style="width:100%"/></div>
          <div><div class="label-text">Agente</div><select class="select" data-e="agente_id" style="width:100%"><option value="">— sin agente —</option>
            ${catalogo.agentes.map((a) => `<option value="${esc(a.agente_id)}"${a.agente_id === p.agente_id ? ' selected' : ''}>${esc(a.nombre)}</option>`).join('')}</select></div>
        </div>
        <div><div class="label-text">Descripción</div><textarea class="input" data-e="descripcion" rows="4" style="width:100%">${esc(p.descripcion || '')}</textarea></div>
        ${p.categoria && !p.linea ? `<div class="hint" style="font-size:12px;color:var(--muted)">Categoría capturada en el CRM: <b>${esc(p.categoria)}</b>. Elige la línea y el tipo de solicitud que le corresponden.</div>` : ''}
        ${p.moneda === 'MXN' ? '<div class="hint" style="font-size:12px;color:var(--muted)">En MXN la venta anual en USD queda pendiente hasta conectar el tipo de cambio de Banxico.</div>' : ''}`,
      onSubmit: async (m) => {
        const body = {};
        m.querySelectorAll('[data-e]').forEach((x) => {
          const k = x.dataset.e; const val = x.value.trim();
          if (['kg_mes', 'precio_objetivo'].includes(k)) body[k] = val === '' ? null : Number(val);
          else body[k] = val === '' ? null : val;
        });
        if (!body.nombre) { KoguApi.toast('El nombre no puede quedar vacío.', 'error'); throw new Error('nombre'); }
        await KoguApi.apiFetch(`${BASE}/proyectos/${pid}`, { method: 'PATCH', body: JSON.stringify(body) });
        KoguApi.toast('Proyecto actualizado', 'success');
        await recargar();
      },
    });
  }

  // ── Muestras ───────────────────────────────────────────
  function abrirMuestra() {
    const claves = datos.claves.filter((c) => c.activo !== false);
    I.modal({
      eyebrow: p.folio, titulo: 'Registrar muestra',
      cuerpo: `
        <div><div class="label-text">Tipo</div><select class="select" data-m="tipo" style="width:100%">
          <option value="solicitada">Solicitada por el cliente</option>
          ${canDev ? '<option value="entregada">Entregada al cliente</option>' : ''}</select>
          ${canDev ? '' : '<div class="hint" style="font-size:12px;color:var(--muted);margin-top:4px">Las muestras entregadas las registra I+D.</div>'}</div>
        <div><div class="label-text">Muestra</div><input class="input" data-m="nombre" placeholder="Ej. Sazonador cheddar lote piloto" style="width:100%"/></div>
        <div class="grid-2" style="gap:12px">
          <div><div class="label-text">Clave experimental <span class="muted">(opcional)</span></div><select class="select" data-m="producto_desarrollo_id" style="width:100%"><option value="">—</option>
            ${claves.map((c) => `<option value="${esc(c.producto_desarrollo_id)}">${esc(c.codigo)} · ${esc(c.nombre)}</option>`).join('')}</select></div>
          <div><div class="label-text">Código <span class="muted">(opcional)</span></div><input class="input" data-m="codigo" style="width:100%"/></div>
          <div><div class="label-text">Piezas</div><input class="input" type="number" min="1" step="1" data-m="piezas" value="1" style="width:100%"/></div>
          <div><div class="label-text">Contenido de cada pieza</div><div style="display:flex;gap:6px">
            <input class="input" type="number" min="0" step="any" data-m="cantidad" placeholder="Ej. 200" style="flex:1;min-width:0;width:auto"/>
            <select class="select" data-m="unidad" style="width:80px;flex:none"><option>g</option><option>kg</option><option>ml</option><option>l</option></select></div></div>
          <div><div class="label-text">Fecha</div><input class="input" type="date" data-m="fecha" value="${new Date(Date.now() - 6 * 3600e3).toISOString().slice(0, 10)}" style="width:100%"/></div>
        </div>`,
      onSubmit: async (m) => {
        const body = {};
        m.querySelectorAll('[data-m]').forEach((x) => { if (x.value.trim() !== '') body[x.dataset.m] = x.value.trim(); });
        if (!body.nombre) { KoguApi.toast('Escribe el nombre de la muestra.', 'error'); throw new Error('nombre'); }
        const ep = I.validarPiezas(body.piezas);
        if (ep) { KoguApi.toast(ep, 'error'); throw new Error(ep); }
        if (body.piezas) body.piezas = Number(body.piezas);
        if (body.cantidad) body.cantidad = Number(body.cantidad);
        await KoguApi.apiFetch(`${BASE}/proyectos/${pid}/muestras`, { method: 'POST', body: JSON.stringify(body) });
        KoguApi.toast('Muestra registrada', 'success');
        tab = 'muestras'; await recargar();
      },
    });
  }

  function abrirBajaMuestra(muestraId) {
    const mu = datos.muestras.find((x) => x.idp_muestra_id === muestraId);
    I.modal({
      eyebrow: p.folio, titulo: 'Dar de baja la muestra', aceptar: 'Dar de baja',
      cuerpo: `<div class="muted" style="font-size:13px">${esc(mu?.nombre || '')} · la muestra queda registrada como baja, no se borra.</div>
        <div><div class="label-text">Motivo</div><input class="input" data-b="motivo" placeholder="Ej. Se capturó dos veces" style="width:100%"/></div>`,
      onSubmit: async (m) => {
        const motivo = m.querySelector('[data-b="motivo"]').value.trim();
        if (!motivo) { KoguApi.toast('Indica el motivo de la baja.', 'error'); throw new Error('motivo'); }
        await KoguApi.apiFetch(`${BASE}/proyectos/${pid}/muestras/${encodeURIComponent(muestraId)}/baja`, { method: 'POST', body: JSON.stringify({ motivo }) });
        KoguApi.toast('Muestra dada de baja', 'success');
        await recargar();
      },
    });
  }

  // ── Clave experimental ─────────────────────────────────
  function abrirClave() {
    I.modal({
      eyebrow: p.folio, titulo: 'Nueva clave experimental', aceptar: 'Dar de alta',
      cuerpo: `
        <div><div class="label-text">Clave</div><input class="input" data-c="codigo" placeholder="Ej. ADF/PNC/01121" style="width:100%;text-transform:uppercase"/>
          <div class="hint" style="font-size:12px;color:var(--muted);margin-top:4px">Se normaliza sola: ADF-PNC-01121 y ADFPNC01121 quedan como ADF/PNC/01121.</div></div>
        <div><div class="label-text">Nombre</div><input class="input" data-c="nombre" value="${esc(p.nombre)}" style="width:100%"/></div>`,
      onSubmit: async (m) => {
        const body = { codigo: m.querySelector('[data-c="codigo"]').value.trim(), nombre: m.querySelector('[data-c="nombre"]').value.trim(), proyecto_id: id };
        try { await KoguApi.apiFetch(`${BASE}/productos-desarrollo`, { method: 'POST', body: JSON.stringify(body) }); }
        catch (err) { if (err.status === 409) KoguApi.toast(I.mensajeError(err), 'error'); throw err; }
        KoguApi.toast('Clave experimental dada de alta', 'success');
        tab = 'claves'; await recargar();
      },
    });
  }

  if (await cargar()) render();
});

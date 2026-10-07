// ============================================================
// modules/idp/proyectos.js — Bandeja de proyectos de I+D.
// Endpoints: GET /protected/idp/catalogo, GET /protected/idp/proyectos,
//            GET /protected/idp/clientes, POST /protected/idp/prospectos,
//            POST /protected/idp/proyectos
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  const b = await KoguShell.initShell({
    currentPage: '/modules/idp/proyectos.html',
    title: 'Proyectos de desarrollo',
    description: 'Desarrollos de I+D por cliente: estado, potencial y último movimiento.',
    requiredPermission: 'idp.proyectos.read',
  });
  if (!b) return;

  const I = KoguIdp; const esc = I.esc; const BASE = I.BASE;
  const canCreate = KoguShell.hasPerm(b, 'idp.proyectos.create');
  const pc = document.getElementById('pageContent');
  const $ = (id) => document.getElementById(id);

  let catalogo = { estados: [], agentes: [], motivos: [], desarrolladores: [] };
  try { catalogo = KoguApi.unwrapData(await KoguApi.apiFetch(`${BASE}/catalogo`)); } catch (_) { /* toast ya mostrado */ }
  // Catálogos de I+D (línea, tipo de solicitud, segmento, prioridad)
  let cats = {};
  try { cats = KoguApi.unwrapData(await KoguApi.apiFetch(`${BASE}/catalogos`)) || {}; } catch (_) { cats = {}; }
  const val = (k) => cats[k] || [];
  const nombreEstado = (k) => catalogo.estados.find((e) => e.clave === k)?.nombre || k;

  const f = { q: '', estado: '', potencial: '', agente_id: '', estancados: '', pagina: 1 };

  pc.innerHTML = `
    <div class="card">
      <div class="row" style="gap:10px;flex-wrap:wrap;align-items:flex-end">
        <div style="flex:1;min-width:220px"><div class="label-text">Buscar</div>
          <input class="input" id="fQ" placeholder="Folio, proyecto o cliente…" autocomplete="off" style="width:100%"/></div>
        <div><div class="label-text">Estado</div><select class="select" id="fEstado"><option value="">Todos</option>
          ${catalogo.estados.filter((e) => e.activo !== false).map((e) => `<option value="${esc(e.clave)}">${esc(e.nombre)}</option>`).join('')}</select></div>
        <div><div class="label-text">Potencial</div><select class="select" id="fPot"><option value="">Todos</option>
          <option>A</option><option>B</option><option>C</option></select></div>
        <div><div class="label-text">Agente</div><select class="select" id="fAgente"><option value="">Todos</option>
          ${catalogo.agentes.map((a) => `<option value="${esc(a.agente_id)}">${esc(a.nombre)}</option>`).join('')}</select></div>
        <label style="display:flex;gap:6px;align-items:center;font-size:13px;padding-bottom:8px"><input type="checkbox" id="fEst"/> Solo estancados</label>
        ${canCreate ? '<button class="btn primary" id="btnNuevo" style="margin-left:auto">+ Nuevo proyecto</button>' : ''}
      </div>
    </div>
    <div class="card" style="margin-top:14px">
      <div class="row" style="margin-bottom:8px;gap:10px;flex-wrap:wrap"><div class="eyebrow" id="lblTotal">Proyectos</div>
        <div style="display:flex;gap:10px;align-items:center;margin-left:auto">
          <label style="display:flex;gap:6px;align-items:center;font-size:13px" title="Agrega una hoja con los eventos de los proyectos exportados"><input type="checkbox" id="xBit"/> con bitácora</label>
          <button class="btn" id="btnExport" title="Exporta los proyectos con los filtros actuales">Exportar a Excel</button>
          <div id="pager" style="display:flex;gap:6px;align-items:center"></div></div></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Folio</th><th>Proyecto</th><th>Cliente</th><th>Agente</th><th>Estado</th><th style="text-align:center">Pot.</th>
          <th style="text-align:right">Venta anual</th><th>Último movimiento</th></tr></thead>
        <tbody id="tb"><tr><td colspan="8" class="empty">Cargando…</td></tr></tbody>
      </table></div>
    </div>`;

  async function cargar() {
    const qs = KoguUi.queryParams({ ...f, limite: 50 });
    let r;
    try { r = KoguApi.unwrapData(await KoguApi.apiFetch(`${BASE}/proyectos?${qs}`)); }
    catch (err) { $('tb').innerHTML = `<tr><td colspan="8" class="empty">${esc(I.mensajeError(err))}</td></tr>`; return; }
    const items = r.items || [];
    $('lblTotal').textContent = `${r.total ?? items.length} proyecto${(r.total ?? items.length) === 1 ? '' : 's'}`;
    $('tb').innerHTML = items.length ? items.map((p) => {
      const dias = I.diasSinMovimiento(p.ultimo_evento_at || p.created_at);
      const est = I.estancado(p);
      return `<tr data-id="${esc(p.proyecto_id)}" style="cursor:pointer">
        <td><span class="chip-compact">${esc(p.folio)}</span></td>
        <td style="font-weight:600">${esc(p.nombre)}</td>
        <td>${esc(p.cliente_nombre || '')} ${I.chipProspecto(p.cliente_estatus)}</td>
        <td>${esc(p.agente_nombre || '—')}</td>
        <td>${I.chipEstado(p.estado, p.estado_nombre || nombreEstado(p.estado), p.estado_categoria)}</td>
        <td style="text-align:center">${I.chipPotencial(p.potencial)}</td>
        <td style="text-align:right">${esc(I.fmtUsd(p.venta_anual_usd))}</td>
        <td>${dias == null ? '—' : `<span style="${est ? 'color:#b45309;font-weight:600' : ''}">${dias === 0 ? 'hoy' : `hace ${dias} día${dias === 1 ? '' : 's'}`}${est ? ' · estancado' : ''}</span>`}</td>
      </tr>`;
    }).join('') : `<tr><td colspan="8" class="empty">Sin proyectos con estos filtros.</td></tr>`;
    $('tb').querySelectorAll('tr[data-id]').forEach((tr) => (tr.onclick = () => {
      window.location.href = `/modules/idp/proyecto.html?id=${encodeURIComponent(tr.dataset.id)}`;
    }));
    const paginas = Math.max(1, Math.ceil((r.total || 0) / (r.limite || 50)));
    $('pager').innerHTML = paginas > 1 ? `
      <button class="btn" id="pgAnt" ${f.pagina <= 1 ? 'disabled' : ''}>‹</button>
      <span class="muted" style="font-size:12px">Página ${f.pagina} de ${paginas}</span>
      <button class="btn" id="pgSig" ${f.pagina >= paginas ? 'disabled' : ''}>›</button>` : '';
    if ($('pgAnt')) $('pgAnt').onclick = () => { f.pagina--; cargar(); };
    if ($('pgSig')) $('pgSig').onclick = () => { f.pagina++; cargar(); };
  }

  let t;
  $('fQ').oninput = () => { clearTimeout(t); t = setTimeout(() => { f.q = $('fQ').value.trim(); f.pagina = 1; cargar(); }, 300); };
  $('fEstado').onchange = () => { f.estado = $('fEstado').value; f.pagina = 1; cargar(); };
  $('fPot').onchange = () => { f.potencial = $('fPot').value; f.pagina = 1; cargar(); };
  $('fAgente').onchange = () => { f.agente_id = $('fAgente').value; f.pagina = 1; cargar(); };
  $('fEst').onchange = () => { f.estancados = $('fEst').checked ? '1' : ''; f.pagina = 1; cargar(); };
  if ($('btnNuevo')) $('btnNuevo').onclick = abrirNuevo;
  $('btnExport').onclick = () => KoguUi.withLoading($('btnExport'),
    () => I.descargar(I.urlExportProyectos(BASE, f, { bitacora: $('xBit').checked }), { nombre: `idp_proyectos${$('xBit').checked ? '_bitacora' : ''}_${new Date().toLocaleDateString('en-CA')}.xlsx` }), 'Exportando…').catch(() => {});
  cargar();

  // ── Nuevo proyecto: 4 pasos, como el alta del CRM (generar_proyecto.php) ──
  function abrirNuevo() {
    let cliente = null; let paso = 1;
    const hoyMx = new Date(Date.now() - 6 * 3600e3).toISOString().slice(0, 10);
    const opAgentes = `<option value="">— del catálogo del cliente —</option>` +
      catalogo.agentes.map((a) => `<option value="${esc(a.agente_id)}">${esc(a.nombre)}</option>`).join('');
    const lab = (t, extra = '') => `<div class="label-text">${esc(t)}${extra}</div>`;
    const opc = (k, vacio = 'No definido') => I.opcionesHtml(val(k), null, vacio);
    const nomCat = (k) => cats.definiciones?.[k]?.nombre || k;
    const checks = (campo, cat) => `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:4px 12px;margin-top:4px">${
      I.opcionesCatalogo(val(cat), null).map((o) => `<label style="font-size:13px;display:flex;gap:6px;align-items:center"><input type="checkbox" data-rl="${campo}" value="${esc(o.clave)}"/> ${esc(o.etiqueta)}</label>`).join('')}</div>`;
    const caja = (titulo, cuerpo) => `<div style="border:1px solid var(--line);border-radius:12px;padding:14px"><div class="eyebrow" style="margin-bottom:10px">${esc(titulo)}</div>${cuerpo}</div>`;
    const filaMuestra = (i) => `<tr>
      <td style="padding:4px"><input class="input" data-mu="codigo" data-i="${i}" placeholder="Código" style="width:100%;text-transform:uppercase"/></td>
      <td style="padding:4px"><input class="input" data-mu="nombre" data-i="${i}" placeholder="Producto" style="width:100%"/></td>
      <td style="padding:4px"><input class="input" data-mu="piezas" data-i="${i}" type="number" min="1" step="1" placeholder="#" style="width:100%"/></td>
      <td style="padding:4px"><input class="input" data-mu="cantidad" data-i="${i}" type="number" min="0" step="any" placeholder="#" style="width:100%"/></td>
      <td style="padding:4px"><select class="select" data-mu="unidad" data-i="${i}" style="width:100%"><option>g</option><option>kg</option><option>ml</option><option>l</option></select></td></tr>`;

    const { el, close } = I.modal({
      eyebrow: 'I+D · Nuevo proyecto', titulo: 'Generar nuevo proyecto', ancho: 900,
      cuerpo: `
        <div data-w="tabs" style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px"></div>
        <!-- Paso 1 -->
        <div data-paso="1" style="display:flex;flex-direction:column;gap:12px">
          <div>${lab('Cliente o prospecto')}
            <div style="margin-top:4px"><input class="input" data-f="cli" placeholder="Haz clic para buscar el cliente o prospecto…" style="width:100%"/></div>
            <div data-f="cliSel" class="hint" style="font-size:12px;margin-top:4px;color:var(--muted)"></div>
            <div data-f="prosp" style="display:none;margin-top:8px;padding:12px;border:1px dashed var(--line);border-radius:10px">
              <div class="eyebrow" style="margin-bottom:6px">Alta de prospecto</div>
              <div class="grid-2" style="gap:10px">
                <div>${lab('Nombre o razón social')}<input class="input" data-f="pNom" style="width:100%"/></div>
                <div>${lab('RFC', ' <span class="muted">(opcional)</span>')}<input class="input" data-f="pRfc" maxlength="13" style="width:100%;text-transform:uppercase"/></div>
                <div>${lab('Agente')}<select class="select" data-f="pAg" style="width:100%"><option value="">— sin agente —</option>
                  ${catalogo.agentes.map((a) => `<option value="${esc(a.agente_id)}">${esc(a.nombre)}</option>`).join('')}</select></div>
                <div style="display:flex;align-items:flex-end;gap:6px"><button class="btn primary" data-f="pOk">Dar de alta</button><button class="btn" data-f="pNo">Cancelar</button></div>
              </div>
            </div>
          </div>
          <div>${lab('Nombre del proyecto')}<input class="input" data-f="nombre" placeholder="Escribe el nombre del proyecto" style="width:100%"/></div>
          <div class="grid-2" style="gap:12px">
            <div>${lab('Tipo')}<select class="select" data-f="tipo" style="width:100%"><option value="reactivo">Reactivo (lo pide el cliente)</option><option value="proactivo">Proactivo (lo propone I+D)</option></select></div>
            <div>${lab('Línea')}<select class="select" data-f="linea" style="width:100%">${I.opcionesHtml(val('linea'), null, '— Selecciona la línea —')}</select></div>
            <div>${lab('Tipo de solicitud')}<select class="select" data-f="tipo_solicitud" style="width:100%">${I.opcionesHtml(val('tipo_solicitud'), null, '— Selecciona —')}</select></div>
            <div>${lab('Segmento')}<select class="select" data-f="segmento" style="width:100%">${I.opcionesHtml(val('segmento'), null, '— Selecciona el segmento —')}</select></div>
            <div>${lab('Fecha requerida de entrega')}<input class="input" type="date" data-f="fecha_requerida" value="${I.fechaSugeridaAlta(hoyMx)}" style="width:100%"/></div>
            <div>${lab('Agente')}<select class="select" data-f="agente_id" style="width:100%">${opAgentes}</select></div>
          </div>
          <div>${lab('Descripción general del proyecto')}<textarea class="input" data-f="descripcion" rows="3" placeholder="Escribe la descripción general del proyecto" style="width:100%"></textarea></div>
        </div>
        <!-- Paso 2 -->
        <div data-paso="2" style="display:none;flex-direction:column;gap:12px">
          <div style="padding:10px 14px;border-radius:10px;background:#fef3c7;color:#92400e;font-size:13px"><b>¡Importante!</b> La información de este paso define el <b>potencial</b> del proyecto.</div>
          <div class="grid-2" style="gap:12px">
            <div>${lab('Volumen mensual (kg)')}<input class="input" type="number" min="0" step="any" data-f="kg_mes" style="width:100%"/></div>
            <div>${lab('Precio de venta objetivo por kg')}<div style="display:flex;gap:6px">
              <input class="input" type="number" min="0" step="any" data-f="precio_objetivo" style="flex:1;min-width:0;width:auto"/>
              <select class="select" data-f="moneda" style="width:90px;flex:none"><option>USD</option><option>MXN</option><option>EUR</option></select></div></div>
            <div>${lab('Costo de la aplicación')}<div style="display:flex;gap:6px">
              <input class="input" type="number" min="0" step="any" data-r="costo_aplicacion" style="flex:1;min-width:0;width:auto"/>
              <select class="select" data-r="costo_aplicacion_moneda" style="width:90px;flex:none"><option>MXN</option><option>USD</option></select></div></div>
          </div>
        </div>
        <!-- Paso 3 -->
        <div data-paso="3" style="display:none;flex-direction:column;gap:12px"></div>
        <!-- Paso 4 -->
        <div data-paso="4" style="display:none;flex-direction:column;gap:12px"></div>
        <div style="display:flex;justify-content:space-between;gap:8px;border-top:1px solid var(--line);padding-top:14px">
          <div style="display:flex;gap:8px"><button class="btn" data-w="cancelar">Cancelar</button><button class="btn" data-w="atras">← Volver</button></div>
          <div data-w="info" class="muted" style="font-size:12px;align-self:center"></div>
          <button class="btn primary" data-w="sig">Continuar</button>
        </div>`,
    });
    const q = (k) => el.querySelector(`[data-f="${k}"]`);
    const lineaVal = () => val('linea').find((v) => v.clave === q('linea').value) || null;

    // Pasos 3 y 4 dependen de la línea (C4): se arman al entrar.
    function armarPaso3() {
      const bl = I.bloquesPasoAlta(3, lineaVal());
      const simples = bl.filter((b) => !['certificacion', 'documento', 'envio'].includes(b));
      el.querySelector('[data-paso="3"]').innerHTML = `
        ${simples.length ? caja('Producto', `<div class="grid-2" style="gap:12px">${simples.map((b) => `<div>${lab(nomCat(b))}<select class="select" data-r="${b}" style="width:100%">${opc(b)}</select></div>`).join('')}
          <div>${lab('Dosis de uso (%)')}<input class="input" type="number" min="0" step="any" data-r="dosis" style="width:100%"/></div></div>`)
          : caja('Producto', `<div style="max-width:50%">${lab('Dosis de uso (%)')}<input class="input" type="number" min="0" step="any" data-r="dosis" style="width:100%"/></div>`)}
        ${caja('Alérgenos y proceso', `
          <label style="font-size:14px;display:flex;gap:8px;align-items:center"><input type="checkbox" data-w="alerg"/> ¿Permite el uso de alérgenos?</label>
          <div data-w="alergLista" style="display:none;margin-top:6px"><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:4px 12px">${I.ALERGENOS.map(([c, n]) =>
            `<label style="font-size:13px;display:flex;gap:6px;align-items:center"><input type="checkbox" data-rl="alergenos_lista" value="${c}"/> ${esc(n)}</label>`).join('')}</div></div>
          <div style="margin-top:10px">${lab('Condiciones del proceso')}<textarea class="input" data-r="proceso" rows="3" placeholder="Temperatura, equipo a utilizar, línea de producción, etc." style="width:100%"></textarea></div>`)}
        ${bl.includes('certificacion') ? caja('¿Requiere certificación?', `${checks('certificaciones', 'certificacion')}
          <div style="margin-top:8px">${lab('Otra certificación')}<input class="input" data-r="certificacion_otro" placeholder="Indica otra certificación" style="width:100%"/></div>`) : ''}
        ${bl.includes('documento') ? caja('Documentación', `<div class="grid-2" style="gap:16px">
          <div>${lab('Entregada por el cliente')}${checks('documentos_entregados', 'documento')}<div style="margin-top:8px"><input class="input" data-r="documento_entregado_otro" placeholder="Otra documentación entregada" style="width:100%"/></div></div>
          <div>${lab('Requerida por el cliente')}${checks('documentos_requeridos', 'documento')}<div style="margin-top:8px"><input class="input" data-r="documento_requerido_otro" placeholder="Otra documentación requerida" style="width:100%"/></div></div></div>`) : ''}
        ${bl.includes('envio') ? caja('Envío', `<div class="muted" style="font-size:13px;margin-bottom:6px">La información y muestras del proyecto:</div>
          ${I.opcionesCatalogo(val('envio'), null).map((o, i) => `<label style="font-size:14px;display:flex;gap:8px;align-items:center;margin:4px 0"><input type="radio" name="envioAlta" data-env value="${esc(o.clave)}"${i === 0 ? ' checked' : ''}/> ${esc(o.etiqueta)}</label>`).join('')}
          <div data-w="dir" style="display:none;margin-top:6px"><textarea class="input" data-r="direccion_envio" rows="2" placeholder="Indica la dirección alterna para envío" style="width:100%"></textarea></div>`) : ''}`;
      const $a = el.querySelector('[data-w="alerg"]');
      $a.onchange = () => { el.querySelector('[data-w="alergLista"]').style.display = $a.checked ? '' : 'none'; };
      el.querySelectorAll('[data-env]').forEach((r) => (r.onchange = () => {
        const alt = el.querySelector('[data-env]:checked')?.value === 'direccion_alterna';
        el.querySelector('[data-w="dir"]').style.display = alt ? '' : 'none';
      }));
    }
    function armarPaso4() {
      const bl = I.bloquesPasoAlta(4, lineaVal());
      el.querySelector('[data-paso="4"]').innerHTML = `
        ${caja('Información adicional', `<div class="grid-2" style="gap:12px">
          ${bl.map((b) => `<div>${lab(nomCat(b))}<select class="select" data-r="${b}" style="width:100%">${opc(b)}</select></div>`).join('')}
          <div>${lab('Termoresistente')}<select class="select" data-r="termoresistente" data-bool="1" style="width:100%"><option value="">No definido</option><option value="true">Sí</option><option value="false">No</option></select></div>
          <div>${lab('Vida de anaquel (meses)')}<input class="input" type="number" min="1" max="99" step="1" data-r="vida_anaquel_meses" style="width:100%"/></div></div>`)}
        ${caja('Muestras de línea', `<div class="muted" style="font-size:12px;margin-bottom:6px">Las que pide el cliente; quedan como <b>solicitadas</b>. Deja vacías las filas que no uses.</div>
          <div class="table-wrap" style="border:none"><table style="table-layout:auto"><thead><tr><th>Código</th><th>Producto</th><th style="width:80px">Piezas</th><th style="width:110px">Contenido</th><th style="width:90px">Unidad</th></tr></thead>
          <tbody>${Array.from({ length: 5 }, (_, i) => filaMuestra(i)).join('')}</tbody></table></div>
          <button class="btn" data-w="masFilas" style="margin-top:6px">+ Más filas</button>`)}`;
      el.querySelector('[data-w="masFilas"]').onclick = () => {
        const tb = el.querySelector('[data-paso="4"] tbody'); const n = tb.children.length;
        if (n >= 15) return;
        tb.insertAdjacentHTML('beforeend', Array.from({ length: Math.min(5, 15 - n) }, (_, i) => filaMuestra(n + i)).join(''));
        if (tb.children.length >= 15) el.querySelector('[data-w="masFilas"]').style.display = 'none';
      };
    }
    let lineaArmada = null;
    function irA(n) {
      if (n >= 3 && lineaArmada !== q('linea').value) {
        // si cambia la línea se vuelven a armar (los bloques dependen de ella)
        armarPaso3(); armarPaso4(); lineaArmada = q('linea').value;
      }
      paso = n;
      el.querySelectorAll('[data-paso]').forEach((d) => (d.style.display = Number(d.dataset.paso) === n ? 'flex' : 'none'));
      el.querySelector('[data-w="tabs"]').innerHTML = I.PASOS_ALTA.map((t, i) => {
        const k = i + 1; const act = k === n; const hecho = k < n;
        return `<div style="padding:8px 10px;border-radius:10px;font-size:12px;font-weight:700;text-align:center;
          cursor:pointer;background:${act ? '#0f172a' : hecho ? '#16a34a1a' : 'var(--panel-2,#f1f5f9)'};color:${act ? '#fff' : hecho ? '#15803d' : 'var(--muted)'}" data-ir="${k}">${k}. ${esc(t)}</div>`;
      }).join('');
      el.querySelectorAll('[data-ir]').forEach((t) => (t.onclick = () => {
        const k = Number(t.dataset.ir);
        if (k > 1) { const e = validarPaso1(); if (e) { KoguApi.toast(e, 'error'); return; } }
        irA(k);
      }));
      el.querySelector('[data-w="atras"]').style.display = n === 1 ? 'none' : '';
      el.querySelector('[data-w="sig"]').textContent = n === 4 ? 'Generar proyecto' : `Continuar (Paso ${n + 1})`;
      el.querySelector('[data-w="info"]').textContent = n >= 3 && q('linea').value
        ? (I.requisitosDeLinea(lineaVal()).length ? `Requisitos de la línea ${lineaVal()?.nombre || ''}` : 'La línea no tiene requisitos definidos: se piden todos')
        : '';
    }
    function validarPaso1() {
      if (!cliente) return 'Selecciona el cliente o da de alta el prospecto.';
      if (!q('nombre').value.trim()) return 'Escribe el nombre del proyecto.';
      return null;
    }
    function leer() {
      const f = {}; el.querySelectorAll('[data-f]').forEach((x) => { if (x.matches('input,select,textarea')) f[x.dataset.f] = x.value; });
      const requisitos = {};
      el.querySelectorAll('[data-r]').forEach((x) => { requisitos[x.dataset.r] = x.dataset.bool ? (x.value === '' ? null : x.value === 'true') : x.value; });
      el.querySelectorAll('[data-rl]').forEach((x) => { (requisitos[x.dataset.rl] ||= []); if (x.checked) requisitos[x.dataset.rl].push(x.value); });
      const $a = el.querySelector('[data-w="alerg"]'); if ($a) requisitos.alergenos = $a.checked;
      const $e = el.querySelector('[data-env]:checked'); if ($e) requisitos.envio = $e.value;
      if (requisitos.envio !== 'direccion_alterna') delete requisitos.direccion_envio;
      const filas = [];
      el.querySelectorAll('[data-mu]').forEach((x) => { const i = Number(x.dataset.i); (filas[i] ||= {})[x.dataset.mu] = x.value; });
      return { f, requisitos, filas };
    }
    el.querySelector('[data-w="atras"]').onclick = () => irA(Math.max(1, paso - 1));
    el.querySelector('[data-w="cancelar"]').onclick = close;
    // el pie del modal (solo "Cancelar") sobra: la navegación del asistente lo incluye
    const pie = el.querySelector('[data-body]')?.nextElementSibling; if (pie) pie.style.display = 'none';
    el.querySelector('[data-w="sig"]').onclick = () => {
      if (paso === 1) { const e = validarPaso1(); if (e) { KoguApi.toast(e, 'error'); return; } }
      if (paso < 4) { irA(paso + 1); return; }
      const btn = el.querySelector('[data-w="sig"]');
      KoguUi.withLoading(btn, async () => {
        const e1 = validarPaso1(); if (e1) { irA(1); KoguApi.toast(e1, 'error'); return; }
        const { f, requisitos, filas } = leer();
        const mu = I.filasMuestraAlta(filas);
        if (mu.error) { KoguApi.toast(mu.error, 'error'); return; }
        const body = I.cuerpoAlta({ ...f, cliente_id: cliente.cliente_id, requisitos, muestras: mu.muestras,
          prioridad: val('prioridad').some((x) => x.clave === 'media') ? 'media' : '' });
        const p = KoguApi.unwrapData(await KoguApi.apiFetch(`${BASE}/proyectos`, { method: 'POST', body: JSON.stringify(body) }));
        close();
        KoguApi.toast(`Proyecto ${p.folio} generado`, 'success');
        setTimeout(() => { window.location.href = `/modules/idp/proyecto.html?id=${encodeURIComponent(p.proyecto_id)}`; }, 300);
      }, 'Generando…').catch(() => {});
    };
    irA(1);

    const elegir = (c) => {
      cliente = c; q('cli').value = c.nombre; q('prosp').style.display = 'none';
      q('cliSel').innerHTML = `${c.estatus_comercial === 'prospecto' ? '🟣 Prospecto' : '✓ Cliente'}${c.rfc ? ' · ' + esc(c.rfc) : ''}${c.agente_nombre ? ' · agente ' + esc(c.agente_nombre) : ''}`;
    };
    I.campoBusqueda(q('cli'), {
      titulo: 'Seleccionar cliente o prospecto', placeholder: 'Nombre, RFC o clave del cliente…',
      fetcher: async (texto) => KoguApi.unwrapData(await KoguApi.apiFetch(`${BASE}/clientes?q=${encodeURIComponent(texto)}`)),
      pinta: (c) => `<div style="font-weight:600">${esc(c.nombre)} ${I.chipProspecto(c.estatus_comercial)}</div>
        <div class="muted" style="font-size:12px">${esc(c.rfc || 'Sin RFC')}${c.cve_cte ? ' · clave ' + esc(c.cve_cte) : ''}${c.agente_nombre ? ' · agente ' + esc(c.agente_nombre) : ''}</div>`,
      onSelect: elegir,
      accion: canCreate ? { texto: (texto) => `+ No está: dar de alta "${texto}" como prospecto`,
        onClick: (texto) => { q('prosp').style.display = 'block'; q('pNom').value = texto; q('pRfc').focus(); } } : null,
    });
    q('pNo').onclick = () => { q('prosp').style.display = 'none'; };
    q('pOk').onclick = () => KoguUi.withLoading(q('pOk'), async () => {
      const body = { nombre: q('pNom').value.trim(), rfc: q('pRfc').value.trim() || undefined, agente_id: q('pAg').value || undefined };
      try {
        const c = KoguApi.unwrapData(await KoguApi.apiFetch(`${BASE}/prospectos`, { method: 'POST', body: JSON.stringify(body) }));
        const ag = catalogo.agentes.find((a) => a.agente_id === c.agente_venta_1_id);
        elegir({ ...c, agente_nombre: ag?.nombre });
        KoguApi.toast('Prospecto dado de alta', 'success');
      } catch (err) {
        if (err.status === 409 && err.details?.cliente_id) {
          elegir(err.details);
          KoguApi.toast(`Ya existía "${err.details.nombre}"; se usará ese registro.`, 'info');
        } else if (err.status !== 422) KoguApi.toast(I.mensajeError(err), 'error');
      }
    }, 'Guardando…');
  }
});

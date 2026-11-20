// ============================================================
// modules/core/docfis/docfis.js
// Core · Documentos fiscales SAT de la empresa activa: Constancia de
// Situación Fiscal (CSF) y Opinión de Cumplimiento 32-D, descargadas con la
// FIEL de la empresa.
//   GET  /protected/core/docfis            { ultimos, corridas, documentos }
//   GET  /protected/core/docfis/config     { docfis_auto, docfis_correos }
//   PUT  /protected/core/docfis/config     (core.docfis.config)
//   POST /protected/core/docfis/ejecutar   (core.docfis.ejecutar)
//   GET  /protected/core/docfis/documentos/:id/pdf
// Reglas (Sergio): todo proceso automático lleva interruptor por empresa y
// lista de correos; "Descargar ahora" corre aunque el interruptor esté
// apagado. Calendario global (20-nov-2026): día 1 de cada mes a las 5:00 y
// reintento los días siguientes si el SAT falla. La configuración vive aquí (no en la ficha de Empresas) porque
// aplica a la empresa ACTIVA, la misma del badge.
// Prueba: tests/core-docfis-render.test.mjs
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/core/docfis/docfis.html';
  const API = '/protected/core/docfis';
  const MAX = 10;
  const CORREO_RE = /^[^\s@,;]+@[^\s@,;]+\.[a-z]{2,}$/i;

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Documentos fiscales SAT',
    description: 'Constancia de situación fiscal y opinión de cumplimiento 32-D de la empresa activa, con su FIEL.',
    requiredPermission: 'screen.core.docfis',
  });
  if (!b) return;

  const puedeConfig = KoguShell.hasPerm(b, 'core.docfis.config');
  const puedeEjecutar = KoguShell.hasPerm(b, 'core.docfis.ejecutar');
  const esc = (s) => KoguUi.escapeHtml(s);
  const $ = (id) => document.getElementById(id);
  const datos = (r) => (r && r.data !== undefined ? r.data : r);
  const fecha = (v) => KoguUi.fmtDateOnly(v);
  // api.js ya avisa en 401/403/422; el 409 de negocio y lo demás lo avisa la pantalla.
  const avisar = (e, def) => { if (![401, 403, 422].includes(e && e.status)) KoguApi.toast((e && e.message) || def, 'error'); };

  const SENTIDO = {
    positivo: ['Positiva', 'success'], negativo: ['Negativa', 'danger'],
    sin_obligaciones: ['Sin obligaciones', 'neutral'], suspension: ['En suspensión', 'warn'],
  };
  const STATUS = { ok: ['Correcta', 'success'], parcial: ['Parcial', 'warn'], fallida: ['Fallida', 'danger'], en_proceso: ['En proceso', 'warn'] };
  const chip = ([txt, tono]) => `<span class="badge ${tono}" data-tono="${tono}">${esc(txt)}</span>`;
  const CAMBIOS = { regimenes: 'régimen', domicilio: 'domicilio', obligaciones: 'obligaciones' };

  let correos = [''];

  estilos();
  $('pageContent').innerHTML = `
<div class="stack dfis" style="gap:16px">
  <div class="dfis-docs">
    <div class="card" id="docfisOpinion"></div>
    <div class="card" id="docfisCsf"></div>
  </div>
  <div class="card" id="docfisConfig">
    <div class="dfis-cab">
      <div><div class="eyebrow">Descarga automática</div><h3 style="margin:4px 0 0">Configuración de la empresa activa</h3></div>
      ${puedeEjecutar ? '<button type="button" class="btn primary" id="docfisEjecutar">Descargar ahora</button>' : ''}
    </div>
    <div class="dfis-muted" style="margin-top:6px">KOGU entra al SAT con la FIEL de la empresa, descarga la constancia y la opinión 32-D y las manda por correo con los dos PDF. Si la opinión sale negativa o cambia la constancia, el correo llega marcado como atención.</div>
    <div class="dfis-form">
      <label><span class="label-text">Descarga automática</span>
        <select class="select" id="docfisAuto" ${puedeConfig ? '' : 'disabled'}>
          <option value="false">Apagada</option><option value="true">Encendida</option>
        </select></label>
      <div><span class="label-text">Correos que reciben los documentos <span class="dfis-muted">(hasta ${MAX})</span></span>
        <div id="docfisCorreos" class="dfis-lista"></div>
        ${puedeConfig ? '<button type="button" class="btn" id="docfisCorreosAgregar" style="margin-top:8px">Agregar correo</button>' : ''}</div>
    </div>
    <div class="dfis-vista" id="docfisCorreosVista"></div>
    <div id="docfisMsg" class="dfis-msg"></div>
    ${puedeConfig ? '<div class="dfis-btns"><button type="button" class="btn primary" id="docfisGuardar">Guardar</button></div>' : ''}
  </div>
  <div class="card">
    <div class="eyebrow">Bitácora</div><h3 style="margin:4px 0 0">Corridas</h3>
    <div class="table-wrap" style="margin-top:12px"><table id="docfisCorridas">
      <thead><tr><th>Inicio</th><th>Origen</th><th>Estatus</th><th>Detalle</th></tr></thead><tbody></tbody>
    </table></div>
  </div>
</div>`;

  // ── Documentos ─────────────────────────────────────────────
  function tarjetaOpinion(d) {
    if (!d) return `<div class="eyebrow">Opinión de cumplimiento 32-D</div><p class="dfis-muted" style="margin-top:8px">Todavía no hay opinión descargada para esta empresa.${puedeEjecutar ? ' Usa “Descargar ahora”.' : ''}</p>`;
    return `<div class="eyebrow">Opinión de cumplimiento 32-D</div>
      <div class="dfis-doc">${chip(SENTIDO[d.sentido] || [d.sentido || 'Sin sentido', 'neutral'])}
        <div><b>Emitida:</b> ${esc(fecha(d.fecha_emision))}</div>
        <div><b>Folio:</b> ${esc(d.folio || '—')}</div></div>
      <button type="button" class="btn" data-pdf="${esc(d.empresa_doc_fiscal_id)}">Ver PDF</button>`;
  }
  function tarjetaCsf(d) {
    if (!d) return `<div class="eyebrow">Constancia de situación fiscal</div><p class="dfis-muted" style="margin-top:8px">Todavía no hay constancia descargada para esta empresa.${puedeEjecutar ? ' Usa “Descargar ahora”.' : ''}</p>`;
    const cambios = d.cambio_vs_anterior ? Object.keys(d.cambio_vs_anterior).map((k) => CAMBIOS[k] || k) : [];
    return `<div class="eyebrow">Constancia de situación fiscal</div>
      <div class="dfis-doc">${cambios.length ? chip(['Con cambios', 'warn']) : chip([d.datos_json?.estatus || 'Descargada', 'success'])}
        <div><b>Emitida:</b> ${esc(fecha(d.fecha_emision))}</div>
        ${cambios.length ? `<div class="dfis-atencion">Cambió respecto a la anterior: ${esc(cambios.join(', '))}.</div>` : ''}</div>
      <button type="button" class="btn" data-pdf="${esc(d.empresa_doc_fiscal_id)}">Ver PDF</button>`;
  }
  function pintarCorridas(lista) {
    $('docfisCorridas').querySelector('tbody').innerHTML = (lista || []).map((c) => `
      <tr><td>${esc(KoguUi.fmtDate(c.iniciada_at))}</td>
        <td>${c.disparo === 'auto' ? 'Automática' : 'Manual'}</td>
        <td>${chip(STATUS[c.status] || [c.status || '-', 'neutral'])}</td>
        <td>${c.error_codigo ? `${esc(c.error_codigo)}${c.error_detalle ? ` · ${esc(c.error_detalle)}` : ''}` : ''}</td></tr>`).join('')
      || '<tr><td colspan="4" class="empty">Sin corridas todavía.</td></tr>';
  }
  async function cargarHistorial() {
    try {
      const h = datos(await KoguApi.apiFetch(API)) || {};
      $('docfisOpinion').innerHTML = tarjetaOpinion(h.ultimos?.opinion_32d);
      $('docfisCsf').innerHTML = tarjetaCsf(h.ultimos?.csf);
      pintarCorridas(h.corridas);
    } catch (e) { limpiarHistorial(); avisar(e, 'No se pudo cargar el historial.'); }
  }
  function limpiarHistorial() {
    $('docfisOpinion').innerHTML = tarjetaOpinion(null);
    $('docfisCsf').innerHTML = tarjetaCsf(null);
    pintarCorridas([]);
  }

  // El PDF va con el token: authFetchRaw + blob (un <a href> no lleva el Bearer).
  async function verPdf(id) {
    try {
      const r = await KoguApi.authFetchRaw(`${API}/documentos/${encodeURIComponent(id)}/pdf`);
      if (!r.ok) throw Object.assign(new Error('No se encontró el PDF.'), { status: r.status });
      const url = URL.createObjectURL(await r.blob());
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) { avisar(e, 'No se pudo abrir el PDF.'); }
  }

  // ── Configuración ──────────────────────────────────────────
  function limpios() { return correos.map((c) => String(c || '').trim().toLowerCase()).filter((c, i, a) => c && a.indexOf(c) === i); }
  function vista() {
    const c = limpios();
    const auto = $('docfisAuto').value === 'true';
    const estado = auto
      ? '<b>Encendida:</b> se descarga el día 1 de cada mes a las 5:00. Si el SAT falla, se vuelve a intentar los días siguientes a la misma hora.'
      : '<b>Apagada:</b> no se descarga sola; “Descargar ahora” sí funciona.';
    const para = c.length
      ? `<b>Los documentos llegan a:</b> ${esc(c.join(', '))}`
      : '<span class="dfis-muted">Sin correos: llegan a los usuarios con permiso de esta pantalla en la empresa.</span>';
    $('docfisCorreosVista').innerHTML = `${estado}<br>${para}`;
  }
  function pintarCorreos() {
    $('docfisCorreos').innerHTML = correos.map((c, i) => `
      <div class="dfis-fila"><input class="input" type="email" data-i="${i}" value="${esc(c)}" maxlength="254" placeholder="fiscal@empresa.com.mx" ${puedeConfig ? '' : 'disabled'}/>
        ${puedeConfig ? `<button type="button" class="btn" data-quitar="${i}" aria-label="Quitar correo">Quitar</button>` : ''}</div>`).join('');
    if ($('docfisCorreosAgregar')) $('docfisCorreosAgregar').disabled = correos.length >= MAX;
    vista();
  }
  function ponerConfig(d) {
    $('docfisAuto').value = d && d.docfis_auto ? 'true' : 'false';
    correos = d && (d.docfis_correos || []).length ? [...d.docfis_correos] : [''];
    $('docfisMsg').textContent = '';
    pintarCorreos();
  }
  async function cargarConfig() {
    try { ponerConfig(datos(await KoguApi.apiFetch(`${API}/config`)) || {}); }
    catch (e) { ponerConfig(null); avisar(e, 'No se pudo cargar la configuración.'); }
  }
  async function guardar() {
    const msg = (t) => { $('docfisMsg').textContent = t; };
    const c = limpios();
    const malo = c.find((x) => !CORREO_RE.test(x));
    if (malo) return msg(`El correo "${malo}" no es válido.`);
    if (c.length > MAX) return msg(`Máximo ${MAX} correos.`);
    msg('');
    const btn = $('docfisGuardar'); btn.disabled = true;
    try {
      const body = { docfis_auto: $('docfisAuto').value === 'true', docfis_correos: c };
      ponerConfig(datos(await KoguApi.apiFetch(`${API}/config`, { method: 'PUT', body: JSON.stringify(body) })) || body);
      KoguApi.toast('Se guardó la configuración de documentos fiscales.', 'success');
    } catch (e) { msg((e && e.message) || 'No se pudo guardar.'); avisar(e, 'No se pudo guardar.'); }
    finally { btn.disabled = false; }
  }

  // ── Descargar ahora ────────────────────────────────────────
  async function ejecutar() {
    const btn = $('docfisEjecutar');
    btn.disabled = true; const txt = btn.textContent; btn.textContent = 'Descargando del SAT…';
    try {
      const r = datos(await KoguApi.apiFetch(`${API}/ejecutar`, { method: 'POST' })) || {};
      const est = r.estado;
      if (est === 'ok') KoguApi.toast('Se descargaron la constancia y la opinión. Van por correo.', 'success');
      else if (est === 'parcial') KoguApi.toast('Solo se descargó uno de los dos documentos. Revisa la bitácora.', 'error');
      else KoguApi.toast('No se pudieron descargar los documentos. Revisa la bitácora.', 'error');
      await cargarHistorial();
    } catch (e) { avisar(e, 'No se pudo iniciar la descarga.'); }
    finally { btn.disabled = false; btn.textContent = txt; }
  }

  // ── Eventos ────────────────────────────────────────────────
  document.querySelector('.dfis').addEventListener('click', (e) => {
    const pdf = e.target.closest('[data-pdf]');
    if (pdf) return verPdf(pdf.dataset.pdf);
    const q = e.target.closest('[data-quitar]');
    if (q && puedeConfig) { correos.splice(Number(q.dataset.quitar), 1); if (!correos.length) correos = ['']; pintarCorreos(); }
  });
  $('docfisCorreos').addEventListener('input', (e) => {
    const i = e.target.dataset.i; if (i === undefined) return;
    correos[Number(i)] = e.target.value; vista();
  });
  $('docfisAuto').addEventListener('change', vista);
  if ($('docfisCorreosAgregar')) $('docfisCorreosAgregar').addEventListener('click', () => {
    if (correos.length >= MAX) return;
    correos.push(''); pintarCorreos();
    const ins = $('docfisCorreos').querySelectorAll('input'); ins[ins.length - 1].focus();
  });
  if ($('docfisGuardar')) $('docfisGuardar').addEventListener('click', guardar);
  if ($('docfisEjecutar')) $('docfisEjecutar').addEventListener('click', ejecutar);

  // Cambio de empresa: todo es por empresa; nada de la anterior queda en pantalla.
  KoguShell.subscribeEmpresaActivaChange(async () => {
    limpiarHistorial(); ponerConfig(null);
    await Promise.all([cargarHistorial(), cargarConfig()]);
  });

  await Promise.all([cargarHistorial(), cargarConfig()]);

  function estilos() {
    if (document.getElementById('dfisEstilos')) return;
    const s = document.createElement('style'); s.id = 'dfisEstilos';
    s.textContent = `
.dfis-muted{color:var(--muted);font-size:13px}
.dfis-docs{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}
.dfis-doc{display:grid;gap:6px;margin:10px 0 12px}
.dfis-doc .badge{justify-self:start}
.dfis-atencion{color:#b45309;font-size:13px}
.dfis-cab{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap}
.dfis-form{display:grid;gap:16px;margin-top:16px;max-width:560px}
.dfis-form .label-text .dfis-muted{text-transform:none;letter-spacing:0;font-weight:400}
.dfis-lista{display:grid;gap:6px}
.dfis-fila{display:flex;gap:8px;align-items:center}
.dfis-vista{margin-top:14px;padding:10px 12px;border-radius:8px;background:var(--surface-2,#f8fafc);font-size:13px;line-height:1.6}
.dfis-msg{color:#b91c1c;font-size:13px;margin-top:6px;min-height:1em}
.dfis-btns{margin-top:12px}`;
    document.head.appendChild(s);
  }
});

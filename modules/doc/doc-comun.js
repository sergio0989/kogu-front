// ============================================================
// doc-comun.js
// Piezas compartidas por las pantallas de Control Documental.
//
// Lo importante aquí es el formulario dinámico: cada subtipo define sus
// propios campos en cat_doc_subtipos.esquema_campos, así que el front no
// puede traer los campos escritos a mano — los pinta a partir del
// catálogo. Dar de alta un subtipo nuevo no requiere tocar este archivo.
// Módulo: Control Documental (doc_) — v1.
// ============================================================

(function () {
  const esc = (s) => KoguUi.escapeHtml(s ?? '');

  const EST_DOC = {
    borrador:   ['Borrador',   'neutral'],
    vigente:    ['Vigente',    'success'],
    por_vencer: ['Por vencer', 'warn'],
    vencido:    ['Vencido',    'danger'],
    sustituido: ['Sustituido', 'neutral'],
    baja:       ['Baja',       'danger'],
  };

  const EST_COPIA = {
    en_archivo:           ['En archivo',    'success'],
    asignada:             ['Asignada',      'warn'],
    en_transito:          ['En tránsito',   'neutral'],
    extraviada:           ['Extraviada',    'danger'],
    destruida:            ['Destruida',     'danger'],
    entregada_definitiva: ['Entregada',     'neutral'],
  };

  const CARACTER = {
    original:     'Original',
    certificada:  'Certificada',
    simple:       'Simple',
    digitalizada: 'Digitalizada',
  };

  const CONDICION = { buena: 'Buena', deteriorada: 'Deteriorada', ilegible: 'Ilegible' };

  function badge(mapa, clave) {
    const [txt, cls] = mapa[clave] || [String(clave || '—').replace(/_/g, ' '), 'neutral'];
    return `<span class="badge ${cls}">${esc(txt)}</span>`;
  }

  const badgeEstadoDoc   = (e) => badge(EST_DOC, e);
  const badgeEstadoCopia = (e) => badge(EST_COPIA, e);

  /** Fecha que puede venir como Date serializado o como ISO. */
  function fecha(v) {
    if (!v) return '—';
    const s = String(v);
    return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : s;
  }

  // ── Formulario dinámico por subtipo ────────────────────────
  const INPUT_POR_TIPO = {
    text:     (id) => `<input class="input" id="${id}" />`,
    textarea: (id) => `<textarea class="input" id="${id}" rows="3" style="resize:vertical"></textarea>`,
    int:      (id) => `<input class="input" id="${id}" type="number" step="1" />`,
    decimal:  (id) => `<input class="input" id="${id}" type="number" step="0.01" />`,
    money:    (id) => `<input class="input" id="${id}" type="number" step="0.01" min="0" />`,
    date:     (id) => `<input class="input" id="${id}" type="date" />`,
    bool:     (id) => `<select class="select" id="${id}"><option value="">—</option><option value="true">Sí</option><option value="false">No</option></select>`,
  };

  /**
   * Pinta los campos extra que define el subtipo.
   * @param {HTMLElement} destino
   * @param {Array} esquema  cat_doc_subtipos.esquema_campos
   * @param {object} valores doc_documentos.datos (para edición)
   */
  function renderCamposDinamicos(destino, esquema, valores = {}) {
    const campos = Array.isArray(esquema) ? esquema : [];
    if (!campos.length) {
      destino.innerHTML = `<div class="muted" style="font-size:12.5px;padding:4px 0">
        Este subtipo no pide campos adicionales.</div>`;
      return;
    }

    destino.innerHTML = `<div class="grid-2">` + campos.map((c) => {
      const id = 'dyn_' + c.clave;
      const req = c.requerido ? ' <span style="color:var(--danger,#dc2626)">*</span>' : '';
      const control = c.tipo === 'select'
        ? `<select class="select" id="${id}"><option value="">Selecciona…</option>${
            (c.opciones || []).map((o) => `<option value="${esc(o)}">${esc(o)}</option>`).join('')
          }</select>`
        : (INPUT_POR_TIPO[c.tipo] || INPUT_POR_TIPO.text)(id);
      const ancho = (c.tipo === 'textarea') ? ' style="grid-column:1/-1"' : '';
      return `<div${ancho}>
        <div class="label-text">${esc(c.label)}${req}</div>
        ${control}
        ${c.ayuda ? `<div class="muted" style="font-size:11px;margin-top:2px">${esc(c.ayuda)}</div>` : ''}
      </div>`;
    }).join('') + `</div>`;

    // Precarga de valores (edición).
    campos.forEach((c) => {
      const el = document.getElementById('dyn_' + c.clave);
      if (!el) return;
      const v = valores?.[c.clave];
      if (v === undefined || v === null) return;
      el.value = (c.tipo === 'bool') ? String(v) : String(v);
    });
  }

  /** Recolecta los campos dinámicos en el objeto `datos` que espera el backend. */
  function leerCamposDinamicos(esquema) {
    const datos = {};
    (Array.isArray(esquema) ? esquema : []).forEach((c) => {
      const el = document.getElementById('dyn_' + c.clave);
      if (!el) return;
      const raw = String(el.value ?? '').trim();
      if (raw === '') return;
      if (c.tipo === 'bool')                            datos[c.clave] = raw === 'true';
      else if (['int', 'decimal', 'money'].includes(c.tipo)) datos[c.clave] = Number(raw);
      else                                              datos[c.clave] = raw;
    });
    return datos;
  }

  /**
   * Muestra el error del backend, evitando el toast duplicado.
   *
   * api.js YA lanza su propio toast para 401, 403 y 422 antes de
   * relanzar el error, así que volver a avisar aquí mostraria el mismo
   * mensaje dos veces. Para esos casos solo se deja pasar. Para el
   * resto (404, 409 de negocio, 500, fallo de red) sí avisamos, porque
   * nadie mas lo hace.
   *
   * Los 422 de este modulo traen mensajes ya redactados para el usuario
   * ("la tiene Fulano desde el 2026-08-20 para Apertura de cuenta"), asi
   * que el toast de api.js muestra exactamente lo que hace falta.
   */
  const YA_AVISADOS = new Set([401, 403, 422]);

  function errorToast(e, fallback) {
    if (e && YA_AVISADOS.has(e.status)) return;
    if (e?.message === 'SESSION_EXPIRED' || e?.message === 'PASSWORD_CHANGE_REQUIRED') return;
    KoguApi.toast(e?.message || fallback || 'No fue posible completar la operación.', 'error');
  }

  // Tarjeta de métrica: KOGU usa .kpi (label/value/hint), no .stat.
  function kpi(label, value, hint = '', peligro = false) {
    const estilo = peligro ? ' style="color:var(--danger,#dc2626)"' : '';
    return `<div class="kpi"><div class="label">${esc(label)}</div>` +
           `<div class="value"${estilo}>${esc(String(value))}</div>` +
           `<div class="hint">${esc(hint)}</div></div>`;
  }

  // Fila clave/valor: KOGU usa .kv > .kv-row > .kv-k/.kv-v, no una tabla.
  function kvRow(k, vHtml) {
    return `<div class="kv-row"><span class="kv-k">${esc(k)}</span>` +
           `<span class="kv-v">${vHtml}</span></div>`;
  }

  // Aviso discreto dentro de un formulario o tarjeta.
  function nota(html) {
    return `<div class="muted" style="font-size:12.5px;border:1px solid var(--line);` +
           `border-radius:12px;padding:10px 12px">${html}</div>`;
  }

  // ── Modal generico ────────────────────────────────────────
  // Vive aqui y no en cada pantalla: lo usan el detalle del documento
  // y los catalogos, y una tercera copia del mismo overlay era la
  // senal de que tocaba compartirlo.
  function modal(id, titulo, eyebrow, cuerpoHtml, textoOk, ancho = 620) {
    let ov = document.getElementById(id);
    if (ov) ov.remove();
    ov = document.createElement('div');
    ov.id = id;
    ov.style.cssText = 'display:flex;position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:9999;align-items:flex-start;justify-content:center;padding:40px 20px 20px;backdrop-filter:blur(2px)';
    ov.innerHTML = `
      <div style="width:100%;max-width:${ancho}px;max-height:88vh;background:white;border-radius:12px;box-shadow:0 20px 50px rgba(0,0,0,.3);display:flex;flex-direction:column;overflow:hidden;color:#0f172a">
        <div style="padding:16px 20px;border-bottom:1px solid var(--line,#e2e8f0);display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
          <div><div class="eyebrow">${esc(eyebrow)}</div><h2 style="margin:0;font-size:20px">${esc(titulo)}</h2></div>
          <button class="btn ghost" data-close style="padding:6px 10px;font-size:16px">✕</button>
        </div>
        <div style="flex:1;overflow-y:auto;padding:20px"><div class="stack">${cuerpoHtml}</div></div>
        <div style="padding:14px 20px;border-top:1px solid var(--line,#e2e8f0);display:flex;justify-content:flex-end;gap:8px;flex-shrink:0">
          <button class="btn ghost" data-close>Cancelar</button>
          <button class="btn primary" data-ok>${esc(textoOk)}</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    const cerrar = () => ov.remove();
    ov.querySelectorAll('[data-close]').forEach((x) => { x.onclick = cerrar; });
    ov.onclick = (e) => { if (e.target === ov) cerrar(); };
    return { ov, cerrar, ok: ov.querySelector('[data-ok]') };
  }

  window.KoguDoc = {
    kpi, kvRow, nota, modal,
    esc, fecha,
    EST_DOC, EST_COPIA, CARACTER, CONDICION,
    badgeEstadoDoc, badgeEstadoCopia,
    renderCamposDinamicos, leerCamposDinamicos,
    errorToast,
  };
})();

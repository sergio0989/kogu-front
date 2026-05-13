// ============================================================
// cfdi-materialidad.js
// Detalle de materialidad por CFDI:
//   - Info completa del CFDI (cabecera fiscal, emisor/receptor, conceptos,
//     totales, control SAT) replicando el formato del detalle CFDI original.
//   - Score de materialidad con cobertura de evidencias.
//   - Evidencias directas + heredadas de casos.
//   - Observaciones / razón de negocio.
//
// Sub-proyecto: materialidad-v1 — Iteración 1.
// ============================================================

const TIPO_EVIDENCIA_LABELS = {
  contrato_especifico:    'Contrato específico',
  orden_compra:           'Orden de compra',
  recepcion_fisica:       'Recepción física',
  bitacora_entrada:       'Bitácora de entrada',
  foto_recepcion:         'Foto de recepción',
  coa_lote:               'COA / Certificado de análisis',
  inspeccion_qa:          'Inspección QA',
  rep_pago:               'REP / Comprobante de pago',
  correo:                 'Correo / comunicación',
  acta_entrega:           'Acta de entrega',
  comprobante_servicio:   'Comprobante de servicio',
  reporte_actividades:    'Reporte de actividades',
  otro:                   'Otro',
};

const ORIGEN_LABELS = {
  manual:        'Manual',
  derivado_erp:  'ERP',
  derivado_lab:  'Lab QA',
  derivado_rep:  'REP',
  derivado_cfdi: 'CFDI',
};

const TIPO_OBS_LABELS = {
  razon_negocio: 'Razón de negocio',
  comentario:    'Comentario',
  aprobacion:    'Aprobación',
  rechazo:       'Rechazo',
  nota_legal:    'Nota legal',
};

document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(window.location.search);
  const cfdiId = params.get('cfdi_id');
  if (!cfdiId) {
    document.body.innerHTML = '<p style="padding:40px;text-align:center">Falta el parámetro <code>cfdi_id</code>.</p>';
    return;
  }

  const b = await KoguShell.initShell({
    currentPage:        '/modules/mat/bandeja-defensa.html',
    title:              'Materialidad del CFDI',
    description:        'Detalle fiscal + score de materialidad + evidencias + observaciones para defensa.',
    requiredPermission: 'screen.mat.cfdi_detalle',
  });
  if (!b) return;

  document.getElementById('pageContent').innerHTML = `
<div class="stack">

  <!-- Header con score -->
  <div class="card">
    <div class="row">
      <div>
        <div class="eyebrow">CFDI</div>
        <h2 id="cfdiTitle">Cargando…</h2>
        <div id="cfdiSubtitle" class="muted" style="margin-top:6px"></div>
      </div>
      <div style="text-align:right;min-width:220px">
        <div class="muted" style="font-size:11px">Score de materialidad</div>
        <div id="scoreNum" style="font-size:42px;font-weight:700">—</div>
        <div id="nivelChip"></div>
        <div id="estatusChip" style="margin-top:6px"></div>
        <div id="efosChip" style="margin-top:6px"></div>
      </div>
    </div>
    <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap">
      <a class="btn" href="/modules/mat/bandeja-defensa.html">← Volver a bandeja</a>
      <button class="btn primary" id="recalcBtn">Recalcular score</button>
      <a class="btn" id="detalleCfdiLink" target="_blank" rel="noopener">Ver detalle CFDI completo →</a>
    </div>
    <div id="cobertura" style="margin-top:14px"></div>
  </div>

  <!-- ── DETALLE FISCAL DEL CFDI ──────────────────────────────────────── -->
  <div class="card" id="cfdiFiscalCard">
    <div class="row">
      <div><div class="eyebrow">Información fiscal</div><h2>Detalle del CFDI</h2></div>
      <span class="chip" id="origenChip"></span>
    </div>
    <div id="fiscalHeader" style="margin-top:14px"></div>

    <div class="split" style="margin-top:14px">
      <div>
        <div class="eyebrow">Emisor</div>
        <div id="emisorBlock" style="margin-top:6px"></div>
      </div>
      <div>
        <div class="eyebrow">Receptor</div>
        <div id="receptorBlock" style="margin-top:6px"></div>
      </div>
    </div>

    <div style="margin-top:18px">
      <div class="eyebrow">Conceptos</div>
      <div class="table-wrap" style="margin-top:6px">
        <table id="conceptosTable">
          <thead><tr>
            <th>#</th><th>Clave</th><th style="text-align:right">Cantidad</th>
            <th>Unidad</th><th>Descripción</th>
            <th style="text-align:right">V. unitario</th>
            <th style="text-align:right">Descuento</th>
            <th style="text-align:right">Importe</th>
          </tr></thead>
          <tbody></tbody>
        </table>
      </div>
    </div>

    <div class="split" style="margin-top:18px">
      <div>
        <div class="eyebrow">Totales</div>
        <div id="totalesBlock" style="margin-top:6px"></div>
      </div>
      <div>
        <div class="eyebrow">Control SAT · Semáforo fiscal</div>
        <div id="controlSatBlock" style="margin-top:6px"></div>
      </div>
    </div>

    <div style="margin-top:18px" id="relacionesWrap">
      <div class="eyebrow">Trazabilidad SAT</div>
      <div id="relacionesBlock" style="margin-top:6px"></div>
    </div>
  </div>

  <!-- Evidencias -->
  <div class="card">
    <div class="row">
      <div><div class="eyebrow">Evidencias</div><h2>Soporte del CFDI</h2></div>
      <button class="btn primary" id="addEvBtn">Adjuntar evidencia</button>
    </div>
    <div style="margin-top:8px" class="muted" id="evCounter"></div>
    <div class="table-wrap" style="margin-top:16px">
      <table id="evTable">
        <thead><tr>
          <th>Tipo</th><th>Origen</th><th>Caso (si hereda)</th><th>Descripción</th><th>Validado</th><th></th>
        </tr></thead>
        <tbody id="evRows"></tbody>
      </table>
    </div>
  </div>

  <!-- Observaciones -->
  <div class="card">
    <div class="row">
      <div><div class="eyebrow">Bitácora</div><h2>Observaciones / Razón de negocio</h2></div>
      <button class="btn primary" id="addObsBtn">Nueva observación</button>
    </div>
    <div class="table-wrap" style="margin-top:16px">
      <table id="obsTable">
        <thead><tr>
          <th>Fecha</th><th>Tipo</th><th>Autor</th><th>Texto</th>
        </tr></thead>
        <tbody id="obsRows"></tbody>
      </table>
    </div>
  </div>

  <!-- Modal adjuntar evidencia -->
  <div id="evModal" style="display:none;position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:50;align-items:center;justify-content:center;padding:20px;">
    <div class="card" style="max-width:520px;width:100%;background:#fff">
      <div class="row"><h3 style="margin:0">Adjuntar evidencia</h3><button class="btn" id="closeEvBtn">Cerrar</button></div>
      <div class="stack" style="margin-top:16px">
        <div>
          <div class="label-text">Tipo de evidencia</div>
          <select class="select" id="ev_tipo">
            <option value="">Selecciona…</option>
            ${Object.entries(TIPO_EVIDENCIA_LABELS).map(([k,v]) => `<option value="${k}">${v}</option>`).join('')}
          </select>
        </div>
        <div>
          <div class="label-text">Descripción</div>
          <input class="input" id="ev_descripcion" />
        </div>
        <div>
          <div class="label-text">Archivo (PDF, imagen, Excel, Word — máx. 25 MB)</div>
          <input class="input" id="ev_archivo" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.xlsx,.xls,.docx,.doc,.csv,.txt"/>
        </div>
        <div class="page-actions">
          <button class="btn primary" id="submitEvBtn">Subir</button>
          <button class="btn" id="cancelEvBtn">Cancelar</button>
        </div>
      </div>
    </div>
  </div>

  <!-- Modal nueva observación -->
  <div id="obsModal" style="display:none;position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:50;align-items:center;justify-content:center;padding:20px;">
    <div class="card" style="max-width:520px;width:100%;background:#fff">
      <div class="row"><h3 style="margin:0">Nueva observación</h3><button class="btn" id="closeObsBtn">Cerrar</button></div>
      <div class="stack" style="margin-top:16px">
        <div>
          <div class="label-text">Tipo</div>
          <select class="select" id="obs_tipo">
            ${Object.entries(TIPO_OBS_LABELS).map(([k,v]) => `<option value="${k}">${v}</option>`).join('')}
          </select>
        </div>
        <div>
          <div class="label-text">Texto</div>
          <textarea class="input" id="obs_texto" rows="4"></textarea>
        </div>
        <div class="page-actions">
          <button class="btn primary" id="submitObsBtn">Registrar</button>
          <button class="btn" id="cancelObsBtn">Cancelar</button>
        </div>
      </div>
    </div>
  </div>

</div>`;

  const $ = id => document.getElementById(id);

  // ── Helpers de formato ────────────────────────────────────────────────────
  function n(v){ const x = Number(v||0); return Number.isFinite(x) ? x : 0; }
  function asText(v, d='—'){ return (v === null || v === undefined || v === '') ? d : String(v); }
  function fmtMoney(v, mon='MXN'){
    if (v === null || v === undefined || v === '') return '—';
    return Number(v).toLocaleString('es-MX', { style: 'currency', currency: mon, minimumFractionDigits: 2 });
  }
  function shortDate(v){ if(!v) return '—'; const d = new Date(v); if (Number.isNaN(d.getTime())) return asText(v); return d.toLocaleDateString('es-MX', { day:'2-digit', month:'2-digit', year:'numeric' }); }
  function dateTimeText(v){ if(!v) return '—'; const d = new Date(v); if (Number.isNaN(d.getTime())) return asText(v); return d.toLocaleString('es-MX', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }); }

  function nivelBadge(n) {
    if (!n) return '';
    const c = n === 'BAJO' ? '#16a34a' : n === 'MEDIO' ? '#ca8a04' : n === 'ALTO' ? '#ea580c' : '#dc2626';
    return `<span class="chip" style="background:${c}1a;color:${c};border:1px solid ${c}55">${n}</span>`;
  }
  function estatusBadge(e) {
    if (!e) return '';
    const c = e === 'completo' ? '#16a34a'
            : e === 'en_armado' ? '#ca8a04'
            : e === 'requiere_aprobacion' ? '#7c3aed'
            : e === 'insuficiente' ? '#dc2626'
            : '#64748b';
    return `<span class="chip" style="background:${c}1a;color:${c};border:1px solid ${c}55">${e.replace('_',' ')}</span>`;
  }
  function efosBadge(e) {
    if (!e) return '';
    const c = e === 'definitivo' ? '#dc2626'
            : e === 'presunto'  ? '#ea580c'
            : e === 'desvirtuado' ? '#16a34a'
            : '#64748b';
    return `<span class="chip" style="background:${c}1a;color:${c};border:1px solid ${c}55">EFOS: ${e}</span>`;
  }
  function rowKV(label, value) {
    return `<div style="display:flex;gap:10px;padding:6px 0;border-bottom:1px dashed #e2e8f0;font-size:13px">
      <div style="min-width:160px;color:var(--muted,#64748b);font-size:12px">${KoguUi.escapeHtml(label)}</div>
      <div style="flex:1;font-weight:500">${value}</div>
    </div>`;
  }

  function relationLabel(code) {
    const k = String(code || '').padStart(2, '0');
    const map = {
      '01':'Nota de crédito','02':'Nota de débito','03':'Devolución de mercancía',
      '04':'Sustitución de CFDI previos','05':'Traslados facturados previamente',
      '06':'Factura por traslados previos','07':'CFDI por aplicación de anticipo',
    };
    return map[k] || 'Relación SAT';
  }
  function efosTextFromCode(code) {
    const c = String(code || '').trim();
    if (c === '200') return 'Sin alerta';
    if (c === '100') return 'Alerta EFOS';
    if (c === '101' || c === '201') return 'Revisión fiscal';
    if (c) return 'Otro código SAT';
    return 'Sin validación';
  }

  // ── Loaders ───────────────────────────────────────────────────────────────
  let _uuidCfdi = null;

  async function loadScoreYHeader() {
    let s = null;
    try {
      const res = await KoguApi.apiFetch('/protected/mat/score/' + cfdiId);
      s = KoguApi.unwrapData(res);
    } catch (_) {
      s = null;
    }
    // Estado inicial del header (el título descriptivo se llena en loadFichaCfdi
    // con nombre del tercero + fecha + total — más útil que el UUID).
    $('cfdiTitle').textContent = 'CFDI';
    $('cfdiSubtitle').textContent = 'Cargando información fiscal…';

    if (s) {
      _uuidCfdi = s.uuid;
      $('scoreNum').textContent = s.score ?? '—';
      $('nivelChip').innerHTML  = nivelBadge(s.nivel);
      $('estatusChip').innerHTML = estatusBadge(s.estatus_defensa);
      $('efosChip').innerHTML   = efosBadge(s.riesgo_efos);

      const req  = Array.isArray(s.evidencias_requeridas) ? s.evidencias_requeridas : [];
      const pres = Array.isArray(s.evidencias_presentes)  ? s.evidencias_presentes  : [];
      const falt = Array.isArray(s.evidencias_faltantes)  ? s.evidencias_faltantes  : [];

      $('cobertura').innerHTML = `
        <div class="muted" style="font-size:12px;margin-bottom:8px">Cobertura de evidencias</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          ${pres.map(t => `<span class="chip" style="background:#16a34a1a;color:#16a34a;border:1px solid #16a34a55">✓ ${TIPO_EVIDENCIA_LABELS[t] || t}</span>`).join('')}
          ${falt.map(t => `<span class="chip" style="background:#dc26261a;color:#dc2626;border:1px solid #dc262655">✗ ${TIPO_EVIDENCIA_LABELS[t] || t}</span>`).join('')}
        </div>
        ${req.length === 0 ? '<div class="muted" style="margin-top:8px;font-size:11px">No hay reglas aplicables a este CFDI todavía. Ve a Materialidad → Reglas.</div>' : ''}
      `;
    } else {
      $('cobertura').innerHTML = '<div class="muted" style="font-size:12px">Score aún no calculado. Presiona <strong>Recalcular score</strong>.</div>';
    }
  }

  async function loadFichaCfdi() {
    if (!_uuidCfdi) {
      $('cfdiFiscalCard').style.display = 'none';
      $('cfdiTitle').textContent = 'CFDI sin score';
      $('cfdiSubtitle').textContent = 'Recalcula el score para cargar la ficha fiscal.';
      return;
    }
    let ficha;
    try {
      const res = await KoguApi.apiFetch('/cfdi/protected/cfdi/facturas/' + encodeURIComponent(_uuidCfdi));
      ficha = KoguApi.unwrapData(res) || {};
    } catch (e) {
      $('cfdiFiscalCard').innerHTML = `<div class="muted">No fue posible cargar el detalle fiscal del CFDI: ${e.message}</div>`;
      $('cfdiTitle').textContent = 'CFDI';
      $('cfdiSubtitle').textContent = 'Detalle fiscal no disponible.';
      return;
    }

    // Link al detalle CFDI completo (XML, JSON, PDF)
    $('detalleCfdiLink').href = '/modules/cfdi/detalle/detalle.html?uuid=' + encodeURIComponent(_uuidCfdi);

    // ── Header descriptivo: nombre del tercero + scope + fecha + total ─────
    const origenUC = (ficha.origen || '').toUpperCase();
    const esRecibido = origenUC.includes('RECIB');
    const terceroNombre = esRecibido ? (ficha.emisor_nombre || ficha.emisor || '—')
                                     : (ficha.receptor_nombre || ficha.receptor || '—');
    const terceroRfc    = esRecibido ? (ficha.emisor_rfc || '—')
                                     : (ficha.receptor_rfc || '—');
    $('cfdiTitle').textContent = terceroNombre;

    const partesSubtitle = [];
    if (terceroRfc && terceroRfc !== '—') partesSubtitle.push(`RFC ${terceroRfc}`);
    partesSubtitle.push(esRecibido ? 'Recibido' : 'Emitido');
    if (ficha.fecha_emision || ficha.fecha) partesSubtitle.push(shortDate(ficha.fecha_emision || ficha.fecha));
    if (ficha.total != null) partesSubtitle.push(fmtMoney(ficha.total, ficha.moneda));
    if (ficha.metodo_pago) partesSubtitle.push(ficha.metodo_pago);
    $('cfdiSubtitle').textContent = partesSubtitle.join(' · ');

    // ── Origen chip ─────
    const origen = origenUC;
    const origenColor = origen === 'RECIBIDO' ? '#0e7490' : origen === 'EMITIDO' ? '#7c3aed' : '#64748b';
    $('origenChip').style.cssText = `background:${origenColor}1a;color:${origenColor};border:1px solid ${origenColor}55`;
    $('origenChip').textContent = origen || 'CFDI';

    // ── Cabecera fiscal ─────
    $('fiscalHeader').innerHTML = `
      <div class="grid-2" style="gap:0">
        <div style="padding-right:14px">
          ${rowKV('UUID', `<span style="font-family:monospace;font-size:12px">${KoguUi.escapeHtml(ficha.uuid || _uuidCfdi)}</span>`)}
          ${rowKV('Serie / Folio', `${asText(ficha.serie)} / ${asText(ficha.folio)}`)}
          ${rowKV('Fecha emisión', shortDate(ficha.fecha_emision || ficha.fecha))}
          ${rowKV('Timbrado', dateTimeText(ficha.fecha_timbrado))}
          ${rowKV('Lugar expedición', asText(ficha.lugar_expedicion))}
        </div>
        <div style="padding-left:14px;border-left:1px solid #e2e8f0">
          ${rowKV('Tipo comprobante', asText(ficha.tipo_comprobante))}
          ${rowKV('Método de pago', asText(ficha.metodo_pago))}
          ${rowKV('Forma de pago', asText(ficha.forma_pago))}
          ${rowKV('Moneda', asText(ficha.moneda) + (ficha.tipo_cambio ? ` (TC ${ficha.tipo_cambio})` : ''))}
          ${rowKV('Uso CFDI', asText(ficha.uso_cfdi))}
        </div>
      </div>
    `;

    // ── Emisor / Receptor ─────
    $('emisorBlock').innerHTML = `
      <div style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px">
        <div style="font-weight:600;font-size:14px">${KoguUi.escapeHtml(ficha.emisor_nombre || ficha.emisor || '—')}</div>
        <div class="muted" style="margin-top:4px;font-size:12px">RFC: <span style="font-family:monospace">${KoguUi.escapeHtml(ficha.emisor_rfc || '—')}</span></div>
        ${ficha.emisor_regimen ? `<div class="muted" style="margin-top:2px;font-size:12px">Régimen: ${KoguUi.escapeHtml(ficha.emisor_regimen)}</div>` : ''}
      </div>
    `;
    $('receptorBlock').innerHTML = `
      <div style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px">
        <div style="font-weight:600;font-size:14px">${KoguUi.escapeHtml(ficha.receptor_nombre || ficha.receptor || '—')}</div>
        <div class="muted" style="margin-top:4px;font-size:12px">RFC: <span style="font-family:monospace">${KoguUi.escapeHtml(ficha.receptor_rfc || '—')}</span></div>
        ${ficha.receptor_uso_cfdi ? `<div class="muted" style="margin-top:2px;font-size:12px">Uso CFDI: ${KoguUi.escapeHtml(ficha.receptor_uso_cfdi)}</div>` : ''}
        ${ficha.receptor_regimen_fiscal ? `<div class="muted" style="margin-top:2px;font-size:12px">Régimen: ${KoguUi.escapeHtml(ficha.receptor_regimen_fiscal)}</div>` : ''}
      </div>
    `;

    // ── Conceptos ─────
    const conceptos = Array.isArray(ficha.conceptos) ? ficha.conceptos
                    : Array.isArray(ficha.detalle)   ? ficha.detalle
                    : Array.isArray(ficha.lineas)    ? ficha.lineas
                    : [];
    const conceptosBody = $('conceptosTable').querySelector('tbody');
    conceptosBody.innerHTML = conceptos.length ? conceptos.map((c, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td style="font-family:monospace;font-size:11px">${KoguUi.escapeHtml(c.clave_prod || c.clave || c.clave_prodserv || '—')}</td>
        <td style="text-align:right">${asText(c.cantidad)}</td>
        <td style="font-family:monospace;font-size:11px">${KoguUi.escapeHtml(c.unidad || c.clave_unidad || '—')}</td>
        <td>${KoguUi.escapeHtml(c.descripcion || '—')}</td>
        <td style="text-align:right">${fmtMoney(c.valor_unit ?? c.valor_unitario, ficha.moneda)}</td>
        <td style="text-align:right">${fmtMoney(c.descuento || 0, ficha.moneda)}</td>
        <td style="text-align:right;font-weight:600">${fmtMoney(c.importe, ficha.moneda)}</td>
      </tr>
    `).join('') : '<tr><td colspan="8" class="empty">Sin conceptos disponibles</td></tr>';

    // ── Totales ─────
    $('totalesBlock').innerHTML = `
      <div style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px">
        ${rowKV('Subtotal', `<strong>${fmtMoney(ficha.subtotal, ficha.moneda)}</strong>`)}
        ${rowKV('Impuestos trasladados', fmtMoney(ficha.impuestos_tras || ficha.total_impuestos_trasladados || 0, ficha.moneda))}
        ${rowKV('Retenciones', fmtMoney(ficha.impuestos_ret || ficha.total_impuestos_retenidos || 0, ficha.moneda))}
        ${ficha.impuestos_ret_iva ? rowKV('Retención IVA', fmtMoney(ficha.impuestos_ret_iva, ficha.moneda)) : ''}
        ${ficha.impuestos_ret_isr ? rowKV('Retención ISR', fmtMoney(ficha.impuestos_ret_isr, ficha.moneda)) : ''}
        <div style="margin-top:6px;padding-top:8px;border-top:2px solid #0f172a;display:flex;justify-content:space-between;font-size:16px;font-weight:700">
          <span>Total</span>
          <span>${fmtMoney(ficha.total, ficha.moneda)}</span>
        </div>
      </div>
    `;

    // ── Control SAT ─────
    const estatusSat = (ficha.estatus_sat || '').toString().toUpperCase();
    const estatusColor = estatusSat === 'VIGENTE' ? '#16a34a' : estatusSat === 'CANCELADO' ? '#dc2626' : '#64748b';
    const efosText = efosTextFromCode(ficha.validacion_efos);
    const efosColor = /alerta/i.test(efosText) ? '#dc2626' : /revisi/i.test(efosText) ? '#ea580c' : /sin alerta/i.test(efosText) ? '#16a34a' : '#64748b';
    $('controlSatBlock').innerHTML = `
      <div style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px">
        <div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap">
          <span class="chip" style="background:${estatusColor}1a;color:${estatusColor};border:1px solid ${estatusColor}55">${estatusSat || '—'}</span>
          <span class="chip" style="background:${efosColor}1a;color:${efosColor};border:1px solid ${efosColor}55">${efosText}</span>
        </div>
        ${rowKV('Última consulta SAT', dateTimeText(ficha.fecha_ultima_consulta_sat))}
        ${rowKV('Origen consulta', asText(ficha.origen_consulta))}
        ${rowKV('Es cancelable', asText(ficha.es_cancelable))}
        ${rowKV('Estatus cancelación', asText(ficha.estatus_cancelacion))}
        ${rowKV('Validación EFOS (código)', asText(ficha.validacion_efos))}
        ${rowKV('Fecha cancelación', shortDate(ficha.fecha_cancelacion))}
        ${rowKV('Paquete origen', `<span style="font-family:monospace;font-size:11px">${KoguUi.escapeHtml(ficha.cfdi_paquete_id || '—')}</span>`)}
      </div>
    `;

    // ── Trazabilidad / Relaciones ─────
    const rels = Array.isArray(ficha.relaciones) ? ficha.relaciones : [];
    if (rels.length === 0) {
      $('relacionesBlock').innerHTML = '<div class="muted" style="font-size:12px">Sin relaciones registradas en la ficha.</div>';
    } else {
      $('relacionesBlock').innerHTML = `
        <div class="table-wrap">
          <table>
            <thead><tr><th>Tipo</th><th>UUID relacionado</th><th>Descripción</th></tr></thead>
            <tbody>
              ${rels.map(r => `
                <tr>
                  <td><span class="chip">${asText(r.tipo_relacion)}</span></td>
                  <td style="font-family:monospace;font-size:11px">${KoguUi.escapeHtml(r.uuid_relacionado || '—')}</td>
                  <td>${KoguUi.escapeHtml(relationLabel(r.tipo_relacion))}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    }
  }

  async function loadEvidencias() {
    const res = await KoguApi.apiFetch('/protected/mat/cfdi/' + cfdiId + '/evidencias');
    const data = KoguApi.unwrapData(res) || {};
    const directas  = Array.isArray(data.directas)  ? data.directas  : [];
    const heredadas = Array.isArray(data.heredadas) ? data.heredadas : [];
    const total = directas.length + heredadas.length;

    $('evCounter').textContent = `${total} evidencias (${directas.length} directas + ${heredadas.length} heredadas de casos)`;

    const html = [
      ...directas.map(e => evRowHtml(e, false)),
      ...heredadas.map(e => evRowHtml(e, true)),
    ].join('');
    $('evRows').innerHTML = html || '<tr><td colspan="6" class="empty">Sin evidencias todavía.</td></tr>';

    document.querySelectorAll('.btn-ev-delete').forEach(btn => btn.onclick = async () => {
      if (!confirm('¿Eliminar esta evidencia?')) return;
      try {
        await KoguApi.apiFetch('/protected/mat/evidencias/' + btn.dataset.id, { method: 'DELETE' });
        KoguApi.toast('Evidencia eliminada', 'success');
        await loadEvidencias();
      } catch (e) { KoguApi.toast(e.message, 'error'); }
    });
  }

  function evRowHtml(e, heredada) {
    const id = heredada ? (e.evidencia_caso_id || e.evidencia_id) : e.evidencia_id;
    const caso = heredada ? KoguUi.escapeHtml(e.caso_nombre || '') : '';
    const descargar = e.storage_ref
      ? `<a class="btn" href="${KoguApi.getBaseUrl()}/protected/mat/evidencias/${id}/archivo" target="_blank" rel="noopener">Descargar</a>`
      : '<span class="muted" style="font-size:11px">— sin archivo —</span>';
    const delBtn = (!heredada && e.evidencia_id)
      ? `<button class="btn btn-ev-delete" data-id="${e.evidencia_id}">Eliminar</button>`
      : '';
    return `
      <tr>
        <td>${KoguUi.escapeHtml(TIPO_EVIDENCIA_LABELS[e.tipo_evidencia] || e.tipo_evidencia)}</td>
        <td>${KoguUi.escapeHtml(ORIGEN_LABELS[e.origen] || e.origen)}${heredada ? ' <span class="chip" style="background:#7c3aed1a;color:#7c3aed;border:1px solid #7c3aed55">heredada</span>' : ''}</td>
        <td>${caso}</td>
        <td>${KoguUi.escapeHtml(e.descripcion || '')}</td>
        <td>${e.validado_at ? '✓ ' + dateTimeText(e.validado_at) : '<span class="muted">—</span>'}</td>
        <td><div class="actions-cell">${descargar} ${delBtn}</div></td>
      </tr>`;
  }

  async function loadObservaciones() {
    const res = await KoguApi.apiFetch('/protected/mat/cfdi/' + cfdiId + '/observaciones');
    const obs = KoguApi.unwrapRows(res) || [];
    $('obsRows').innerHTML = obs.length ? obs.map(o => `
      <tr>
        <td>${dateTimeText(o.created_at)}</td>
        <td>${KoguUi.escapeHtml(TIPO_OBS_LABELS[o.tipo] || o.tipo)}</td>
        <td>${KoguUi.escapeHtml(o.autor_nombre || '—')}</td>
        <td>${KoguUi.escapeHtml(o.texto || '')}</td>
      </tr>
    `).join('') : '<tr><td colspan="4" class="empty">Sin observaciones</td></tr>';
  }

  async function reload() {
    // Score primero porque devuelve el UUID para luego pedir la ficha CFDI
    await loadScoreYHeader();
    await Promise.all([
      loadFichaCfdi(),
      loadEvidencias(),
      loadObservaciones(),
    ]);
  }

  // ── Acciones ──────────────────────────────────────────────────────────────
  $('recalcBtn').onclick = async () => {
    try {
      const res = await KoguApi.apiFetch('/protected/mat/score/' + cfdiId + '/recalcular', { method: 'POST' });
      const s = KoguApi.unwrapData(res);
      KoguApi.toast(`Score recalculado: ${s.score} (${s.nivel})`, 'success');
      await reload();
    } catch (e) { KoguApi.toast(e.message, 'error'); }
  };

  // Modal evidencia
  $('addEvBtn').onclick     = () => { ['ev_tipo','ev_descripcion','ev_archivo'].forEach(id => $(id).value = ''); $('evModal').style.display = 'flex'; };
  $('closeEvBtn').onclick   = () => $('evModal').style.display = 'none';
  $('cancelEvBtn').onclick  = () => $('evModal').style.display = 'none';
  $('submitEvBtn').onclick  = async () => {
    try {
      const tipo = $('ev_tipo').value;
      const file = $('ev_archivo').files[0];
      if (!tipo) throw new Error('Selecciona el tipo de evidencia.');
      if (!file) throw new Error('Selecciona un archivo.');

      const fd = new FormData();
      fd.append('archivo', file);
      fd.append('tipo_evidencia', tipo);
      if ($('ev_descripcion').value) fd.append('descripcion', $('ev_descripcion').value);

      const token = KoguApi.getToken();
      const empresaId = KoguApi.getEmpresaId();
      const resp = await fetch(KoguApi.getBaseUrl() + '/protected/mat/cfdi/' + cfdiId + '/evidencias', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, ...(empresaId ? { 'X-Empresa-Id': empresaId } : {}) },
        body: fd,
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data?.ok === false) throw new Error(data?.error?.message || 'No fue posible subir la evidencia.');

      KoguApi.toast('Evidencia adjuntada. Recalculando score…', 'success');
      $('evModal').style.display = 'none';
      await KoguApi.apiFetch('/protected/mat/score/' + cfdiId + '/recalcular', { method: 'POST' }).catch(() => {});
      await reload();
    } catch (e) { KoguApi.toast(e.message, 'error'); }
  };

  // Modal observación
  $('addObsBtn').onclick    = () => { $('obs_tipo').value = 'razon_negocio'; $('obs_texto').value = ''; $('obsModal').style.display = 'flex'; };
  $('closeObsBtn').onclick  = () => $('obsModal').style.display = 'none';
  $('cancelObsBtn').onclick = () => $('obsModal').style.display = 'none';
  $('submitObsBtn').onclick = async () => {
    try {
      const body = { tipo: $('obs_tipo').value, texto: $('obs_texto').value };
      if (!body.texto || !body.texto.trim()) throw new Error('El texto es obligatorio.');
      await KoguApi.apiFetch('/protected/mat/cfdi/' + cfdiId + '/observaciones', {
        method: 'POST', body: JSON.stringify(body),
      });
      KoguApi.toast('Observación registrada', 'success');
      $('obsModal').style.display = 'none';
      if (body.tipo === 'razon_negocio') {
        await KoguApi.apiFetch('/protected/mat/score/' + cfdiId + '/recalcular', { method: 'POST' }).catch(() => {});
      }
      await reload();
    } catch (e) { KoguApi.toast(e.message, 'error'); }
  };

  KoguShell.subscribeEmpresaActivaChange(() => {
    window.location.href = '/modules/mat/bandeja-defensa.html';
  });

  await reload();
});

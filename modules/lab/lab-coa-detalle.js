// ============================================================
// lab-coa-detalle.js
// Vista del COA emitido — formato imprimible bilingüe.
// Botones: imprimir (window.print), anular (con motivo),
// copiar URL pública de verificación.
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/lab/lab-coa-detalle.html';
  const PERM = 'screen.lab.coa';
  const BASE = '/protected/lab/coa';

  const params = new URLSearchParams(window.location.search);
  const coaId  = params.get('id');
  if (!coaId) { window.location.href = '/modules/lab/lab-coa.html'; return; }

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Detalle del COA',
    description: 'Certificado de Análisis emitido al cliente.',
    requiredPermission: PERM,
  });
  if (!b) return;

  // Etiquetas multi-idioma para los encabezados del documento.
  // Si el COA está en idioma distinto al ES, el documento se renderiza
  // con encabezados en ese idioma (los nombres de parámetros y métodos
  // YA vienen traducidos en el snapshot).
  const I18N = {
    es: {
      titulo: 'Certificado de Análisis (COA)',
      empresa: 'Empresa', folio: 'Folio', emitido: 'Emitido', idioma: 'Idioma',
      cliente: 'Cliente', rfc: 'RFC', email: 'Email',
      producto: 'Producto', lote: 'Lote', cve: 'Clave',
      param: 'Parámetro', metodo: 'Método', spec: 'Especificación',
      resultado: 'Resultado', cumple: 'Dictamen',
      ok: 'Cumple', nok: 'No cumple', obs: 'Observación', na: 'N/A',
      leyenda_excep: 'Este certificado se emite con excepción aprobada.',
      anulado: 'CERTIFICADO ANULADO',
      motivo_anulacion: 'Motivo de anulación',
      firma: 'Firmado por',
      verifyTitulo: 'Verificación pública',
      verifyTexto: 'Este certificado puede verificarse en línea con la siguiente URL:',
      fechasAnalisis: 'Fechas y análisis',
      elaboracion: 'Elaboración', caducidad: 'Caducidad',
      inicioAnalisis: 'Inicio análisis', terminoAnalisis: 'Término análisis',
      numJueces: 'Núm. jueces', correctos: 'Correctos', minRequerido: 'Mín. requerido',
      comentariosSensoriales: 'Comentarios sensoriales',
      qrMetodologias: 'Metodologías de laboratorio', qrVerificacion: 'Verificación del certificado',
      lotesIncluidos: 'Lotes incluidos',
      estEmitido: 'Emitido', estAnulado: 'Anulado', estSustituido: 'Sustituido',
    },
    en: {
      titulo: 'Certificate of Analysis (COA)',
      empresa: 'Company', folio: 'Reference', emitido: 'Issued', idioma: 'Language',
      cliente: 'Customer', rfc: 'Tax ID', email: 'Email',
      producto: 'Product', lote: 'Batch', cve: 'Code',
      param: 'Parameter', metodo: 'Method', spec: 'Specification',
      resultado: 'Result', cumple: 'Conformity',
      ok: 'Pass', nok: 'Fail', obs: 'Observation', na: 'N/A',
      leyenda_excep: 'This certificate is issued under approved exception.',
      anulado: 'CERTIFICATE VOIDED',
      motivo_anulacion: 'Void reason',
      firma: 'Signed by',
      verifyTitulo: 'Public verification',
      verifyTexto: 'This certificate can be verified online at the following URL:',
      fechasAnalisis: 'Dates & analysis',
      elaboracion: 'Manufacture', caducidad: 'Best before',
      inicioAnalisis: 'Analysis start', terminoAnalisis: 'Analysis end',
      numJueces: 'Panelists', correctos: 'Correct', minRequerido: 'Min. required',
      comentariosSensoriales: 'Sensory comments',
      qrMetodologias: 'Lab methodologies', qrVerificacion: 'Certificate verification',
      lotesIncluidos: 'Included batches',
      estEmitido: 'Issued', estAnulado: 'Voided', estSustituido: 'Replaced',
    },
    pt: {
      titulo: 'Certificado de Análise (COA)',
      empresa: 'Empresa', folio: 'Folha', emitido: 'Emitido', idioma: 'Idioma',
      cliente: 'Cliente', rfc: 'CNPJ/RFC', email: 'Email',
      producto: 'Produto', lote: 'Lote', cve: 'Código',
      param: 'Parâmetro', metodo: 'Método', spec: 'Especificação',
      resultado: 'Resultado', cumple: 'Conformidade',
      ok: 'Conforme', nok: 'Não conforme', obs: 'Observação', na: 'N/A',
      leyenda_excep: 'Este certificado é emitido sob exceção aprovada.',
      anulado: 'CERTIFICADO ANULADO',
      motivo_anulacion: 'Motivo de anulação',
      firma: 'Assinado por',
      verifyTitulo: 'Verificação pública',
      verifyTexto: 'Este certificado pode ser verificado online no seguinte URL:',
    },
    fr: {
      titulo: 'Certificat d\'Analyse (COA)',
      empresa: 'Société', folio: 'Référence', emitido: 'Émis', idioma: 'Langue',
      cliente: 'Client', rfc: 'N° fiscal', email: 'Email',
      producto: 'Produit', lote: 'Lot', cve: 'Code',
      param: 'Paramètre', metodo: 'Méthode', spec: 'Spécification',
      resultado: 'Résultat', cumple: 'Conformité',
      ok: 'Conforme', nok: 'Non conforme', obs: 'Observation', na: 'N/A',
      leyenda_excep: 'Ce certificat est émis sous exception approuvée.',
      anulado: 'CERTIFICAT ANNULÉ',
      motivo_anulacion: 'Motif d\'annulation',
      firma: 'Signé par',
      verifyTitulo: 'Vérification publique',
      verifyTexto: 'Ce certificat peut être vérifié en ligne à l\'adresse suivante :',
    },
    de: {
      titulo: 'Analysezertifikat (COA)',
      empresa: 'Firma', folio: 'Belegnr.', emitido: 'Ausgestellt', idioma: 'Sprache',
      cliente: 'Kunde', rfc: 'Steuer-ID', email: 'Email',
      producto: 'Produkt', lote: 'Charge', cve: 'Code',
      param: 'Parameter', metodo: 'Methode', spec: 'Spezifikation',
      resultado: 'Ergebnis', cumple: 'Konformität',
      ok: 'Konform', nok: 'Nicht konform', obs: 'Anmerkung', na: 'N/A',
      leyenda_excep: 'Dieses Zertifikat wird unter genehmigter Ausnahme ausgestellt.',
      anulado: 'ZERTIFIKAT ANNULLIERT',
      motivo_anulacion: 'Annullierungsgrund',
      firma: 'Unterzeichnet von',
      verifyTitulo: 'Öffentliche Verifizierung',
      verifyTexto: 'Dieses Zertifikat kann unter folgender URL verifiziert werden:',
    },
    it: {
      titulo: 'Certificato d\'Analisi (COA)',
      empresa: 'Azienda', folio: 'Rif.', emitido: 'Emesso', idioma: 'Lingua',
      cliente: 'Cliente', rfc: 'P.IVA', email: 'Email',
      producto: 'Prodotto', lote: 'Lotto', cve: 'Codice',
      param: 'Parametro', metodo: 'Metodo', spec: 'Specifica',
      resultado: 'Risultato', cumple: 'Conformità',
      ok: 'Conforme', nok: 'Non conforme', obs: 'Osservazione', na: 'N/A',
      leyenda_excep: 'Questo certificato è emesso con eccezione approvata.',
      anulado: 'CERTIFICATO ANNULLATO',
      motivo_anulacion: 'Motivo annullamento',
      firma: 'Firmato da',
      verifyTitulo: 'Verifica pubblica',
      verifyTexto: 'Questo certificato può essere verificato online al seguente URL:',
    },
  };

  const c = document.getElementById('pageContent');
  c.innerHTML = `
<div class="no-print" style="margin-bottom:12px;display:flex;gap:8px;align-items:center">
  <button class="btn ghost" id="backBtn">← Volver a COAs</button>
  <button class="btn primary" id="printBtn">Imprimir / PDF</button>
  <button class="btn ghost" id="copyUrlBtn">Copiar URL pública</button>
  <button class="btn ghost danger" id="anularBtn" style="margin-left:auto">Anular COA</button>
</div>

<div id="coaDoc" class="coa-doc">
  <div style="text-align:center;padding:40px;color:var(--muted)">Cargando certificado…</div>
</div>
  `;

  let coa = null;

  async function loadCoa() {
    try {
      const res = await KoguApi.apiFetch(`${BASE}/${coaId}`);
      coa = KoguApi.unwrapData(res);
      renderCoa();
    } catch (err) {
      KoguApi.toast(err.message, 'error');
      $('coaDoc').innerHTML = `<div style="padding:40px;text-align:center;color:var(--danger)">No se pudo cargar el COA.</div>`;
    }
  }

  function renderCoa() {
    if (!coa) return;
    const t = I18N[coa.idioma] || I18N.es;
    const fechaEmi = coa.fecha_emision ? new Date(coa.fecha_emision).toLocaleString() : '—';

    // Etiqueta con fallback a ES (las claves de análisis/QR sólo están
    // traducidas en es/en; el resto cae a español).
    const tL = (k) => t[k] || I18N.es[k] || '';
    const fmtFecha = (d) => d ? new Date(d).toLocaleDateString() : '';

    // Bloque "Fechas y análisis" — lee los campos lote_* (en vivo). `src`
    // es el COA (single-lote) o cada fila de coa.lotes (multi-lote). Sólo
    // dibuja los campos presentes; si no hay ninguno, devuelve ''.
    const buildAnalisisBlock = (src) => {
      if (!src) return '';
      const cell = (label, val) =>
        (val !== null && val !== undefined && val !== '')
          ? `<div class="coa-block"><strong>${escapeHtml(label)}</strong>${escapeHtml(val)}</div>`
          : '';
      const grid = [
        cell(tL('elaboracion'),     fmtFecha(src.lote_fecha_elaboracion)),
        cell(tL('caducidad'),       fmtFecha(src.lote_fecha_caducidad)),
        cell(tL('inicioAnalisis'),  fmtFecha(src.lote_fecha_inicio_analisis)),
        cell(tL('terminoAnalisis'), fmtFecha(src.lote_fecha_termino_analisis)),
        cell(tL('numJueces'),       src.lote_num_jueces),
        cell(tL('correctos'),       src.lote_num_juicios_correctos),
        cell(tL('minRequerido'),    src.lote_min_juicios_correctos),
      ].filter(Boolean).join('');
      const sensorial = src.lote_comentarios_sensorial
        ? `<div class="coa-block" style="grid-column:1/-1"><strong>${escapeHtml(tL('comentariosSensoriales'))}</strong>${escapeHtml(src.lote_comentarios_sensorial)}</div>`
        : '';
      if (!grid && !sensorial) return '';
      return `<h2>${escapeHtml(tL('fechasAnalisis'))}</h2><div class="coa-grid">${grid}${sensorial}</div>`;
    };

    // Estado del COA como pill (emitido / anulado / sustituido).
    const estCls = ['emitido', 'anulado', 'sustituido'].includes(coa.estado) ? coa.estado : 'emitido';
    const estLabelMap = { emitido: tL('estEmitido'), anulado: tL('estAnulado'), sustituido: tL('estSustituido') };
    const estLabel = estLabelMap[estCls] || coa.estado;

    // Helper para una fila de parámetro
    const filaParam = (p) => {
      let evalLabel = t.obs, evalCls = '';
      if (p.evaluacion === 'cumple')    { evalLabel = t.ok;  evalCls = 'ok'; }
      else if (p.evaluacion === 'no_cumple') { evalLabel = t.nok; evalCls = 'nok'; }
      else if (p.evaluacion === 'observacion') { evalLabel = t.obs; }
      else                              { evalLabel = t.na; }

      let specStr = '—';
      if (p.spec_tipo_evaluacion === 'rango' && p.spec_lim_min != null && p.spec_lim_max != null) {
        specStr = `${p.spec_lim_min} – ${p.spec_lim_max}`;
      } else if (p.spec_lim_min != null) {
        specStr = `≥ ${p.spec_lim_min}`;
      } else if (p.spec_lim_max != null) {
        specStr = `≤ ${p.spec_lim_max}`;
      } else if (p.spec_valor_cualitativo_esperado) {
        specStr = p.spec_valor_cualitativo_esperado;
      }
      const specU = p.unidad_simbolo ? `${specStr} ${p.unidad_simbolo}` : specStr;

      const valor = p.valor_oficial != null
        ? `${parseFloat(p.valor_oficial).toLocaleString()} ${p.unidad_simbolo || ''}`
        : (p.valor_texto || '—');

      const metodo = [p.metodo_nombre, p.metodo_referencia ? `(${p.metodo_referencia})` : '']
        .filter(Boolean).join(' ');

      return `
        <tr>
          <td>
            <strong>${escapeHtml(p.parametro_nombre)}</strong>
            ${p.es_critico ? ' <span style="color:#92400e;font-size:11px">★</span>' : ''}
            <div class="muted">${escapeHtml(p.parametro_clave)}</div>
          </td>
          <td>${escapeHtml(metodo) || '—'}</td>
          <td>${escapeHtml(specU)}</td>
          <td><strong>${escapeHtml(valor)}</strong></td>
          <td><span class="${evalCls}">${escapeHtml(evalLabel)}</span></td>
        </tr>`;
    };

    // Detectar si es consolidado multi-lote (V032+) o single-lote (legacy)
    const esMultiLote = Array.isArray(coa.lotes) && coa.lotes.length > 0;

    // Chips de "Lotes incluidos" — resumen visual antes de las tablas.
    const buildLotesChips = () => {
      let chips = '';
      if (esMultiLote) {
        chips = coa.lotes.map(l => {
          const cant = l.cantidad ? `${parseFloat(l.cantidad).toLocaleString()} ${l.unidad || ''}`.trim() : '';
          return `<span class="coa-chip">${escapeHtml(l.numero_lote)}${cant ? ` · ${escapeHtml(cant)}` : ''}</span>`;
        }).join('');
      } else if (coa.numero_lote) {
        chips = `<span class="coa-chip">${escapeHtml(coa.numero_lote)}</span>`;
      }
      if (!chips) return '';
      return `<h2>${escapeHtml(tL('lotesIncluidos'))}</h2><div class="coa-chips">${chips}</div>`;
    };

    let secParams = '';
    if (esMultiLote) {
      // Para cada coa_lote: encabezado del lote + tabla de parámetros del lote
      secParams = coa.lotes.map(lote => {
        const paramsLote = (coa.parametros || []).filter(p => p.coa_lote_id === lote.coa_lote_id);
        const cant = lote.cantidad ? `${parseFloat(lote.cantidad).toLocaleString()} ${lote.unidad || ''}` : '';
        return `
          <h2>${escapeHtml(t.lote)}: ${escapeHtml(lote.numero_lote)}</h2>
          <div class="coa-grid">
            <div class="coa-block">
              <strong>${escapeHtml(t.cve)}</strong>${escapeHtml(lote.cve_prod || '—')}
            </div>
            <div class="coa-block">
              <strong>${escapeHtml(t.producto)}</strong>${escapeHtml(lote.desc_prod || '—')}
            </div>
            ${cant ? `<div class="coa-block"><strong>Cant.</strong>${escapeHtml(cant)}</div>` : ''}
          </div>
          ${buildAnalisisBlock(lote)}
          <table style="margin-top:8px">
            <thead><tr>
              <th>${escapeHtml(t.param)}</th>
              <th>${escapeHtml(t.metodo)}</th>
              <th>${escapeHtml(t.spec)}</th>
              <th>${escapeHtml(t.resultado)}</th>
              <th>${escapeHtml(t.cumple)}</th>
            </tr></thead>
            <tbody>${paramsLote.map(filaParam).join('') || `<tr><td colspan="5" style="text-align:center;color:#64748b">—</td></tr>`}</tbody>
          </table>`;
      }).join('');
    } else {
      // Vista legacy (single-lote): tabla única de parámetros
      const filas = (coa.parametros || []).map(filaParam).join('');
      secParams = `
        <h2>${escapeHtml(t.param)}</h2>
        <table>
          <thead><tr>
            <th>${escapeHtml(t.param)}</th>
            <th>${escapeHtml(t.metodo)}</th>
            <th>${escapeHtml(t.spec)}</th>
            <th>${escapeHtml(t.resultado)}</th>
            <th>${escapeHtml(t.cumple)}</th>
          </tr></thead>
          <tbody>${filas || `<tr><td colspan="5" style="text-align:center;color:#64748b">—</td></tr>`}</tbody>
        </table>`;
    }

    const verifyUrl = buildVerifyUrl(coa.url_publica_token);

    $('coaDoc').innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div class="coa-header">
          ${coa.empresa_logo_url ? `<img class="coa-logo" src="${escapeHtml(coa.empresa_logo_url)}" alt="${escapeHtml(coa.empresa_razon_social || 'logo')}" onerror="this.style.display='none'"/>` : ''}
          <div>
            <h1>${escapeHtml(t.titulo)}</h1>
            <div class="muted">${escapeHtml(coa.empresa_razon_social || coa.empresa_nombre_corto || '')} ${coa.empresa_rfc ? '· ' + escapeHtml(coa.empresa_rfc) : ''}</div>
          </div>
        </div>
        <div style="text-align:right">
          <div style="font-size:11px;text-transform:uppercase;color:#64748b;letter-spacing:.5px">${escapeHtml(t.folio)}</div>
          <div style="font-size:18px;font-weight:700">${escapeHtml(coa.folio_coa)}</div>
          <div><span class="coa-status ${estCls}">${escapeHtml(estLabel)}</span></div>
          <div class="muted">${escapeHtml(t.emitido)}: ${fechaEmi}</div>
          <div class="muted">${escapeHtml(t.idioma)}: ${coa.idioma.toUpperCase()}</div>
        </div>
      </div>

      ${coa.estado === 'anulado'
        ? `<div class="coa-anulado">${escapeHtml(t.anulado)}<br><span style="font-weight:400;font-size:12px">${escapeHtml(t.motivo_anulacion)}: ${escapeHtml(coa.motivo_anulacion || '—')}</span></div>`
        : ''}

      <h2>${escapeHtml(t.cliente)}</h2>
      <div class="coa-grid">
        <div class="coa-block">
          <strong>${escapeHtml(t.cliente)}</strong>
          ${escapeHtml(coa.cliente_nombre || '—')}
        </div>
        <div class="coa-block">
          <strong>${escapeHtml(t.rfc)}</strong>
          ${escapeHtml(coa.cliente_rfc || '—')}
        </div>
        ${coa.cliente_email ? `<div class="coa-block"><strong>${escapeHtml(t.email)}</strong>${escapeHtml(coa.cliente_email)}</div>` : ''}
      </div>

      ${esMultiLote ? `
        ${coa.folio_factura_externa ? `
        <h2>Factura</h2>
        <div class="coa-grid">
          <div class="coa-block">
            <strong>Folio</strong>${escapeHtml(coa.folio_factura_externa)}
          </div>
          ${coa.fecha_factura ? `<div class="coa-block"><strong>Fecha</strong>${escapeHtml(new Date(coa.fecha_factura).toLocaleDateString())}</div>` : ''}
          <div class="coa-block">
            <strong>Lotes</strong>${coa.lotes.length}
          </div>
        </div>` : ''}
      ` : `
        <h2>${escapeHtml(t.producto)}</h2>
        <div class="coa-grid">
          <div class="coa-block">
            <strong>${escapeHtml(t.cve)}</strong>
            ${escapeHtml(coa.cve_prod || '—')}
          </div>
          <div class="coa-block">
            <strong>${escapeHtml(t.producto)}</strong>
            ${escapeHtml(coa.desc_prod || '—')}
          </div>
          <div class="coa-block">
            <strong>${escapeHtml(t.lote)}</strong>
            ${escapeHtml(coa.numero_lote || '—')}
          </div>
        </div>
        ${buildAnalisisBlock(coa)}
      `}

      ${coa.tiene_excepcion
        ? `<div class="coa-leyenda">${escapeHtml(coa.leyenda_excepcion || t.leyenda_excep)}${coa.excepcion_motivo ? ' · ' + escapeHtml(coa.excepcion_motivo) : ''}</div>`
        : ''}

      ${buildLotesChips()}

      ${secParams}

      <div class="coa-firma">
        <strong>${escapeHtml(t.firma)}:</strong> ${escapeHtml(coa.emisor_nombre || '—')}
        ${coa.emisor_email ? '<span class="muted"> · ' + escapeHtml(coa.emisor_email) + '</span>' : ''}
      </div>

      ${(coa.empresa_metodologias_url || verifyUrl) ? `
      <div class="coa-qr-wrap">
        ${coa.empresa_metodologias_url ? `<div class="coa-qr"><div id="qrMetod"></div>${escapeHtml(tL('qrMetodologias'))}</div>` : ''}
        ${verifyUrl ? `<div class="coa-qr"><div id="qrVerify"></div>${escapeHtml(tL('qrVerificacion'))}</div>` : ''}
      </div>` : ''}

      ${verifyUrl ? `
      <div class="coa-verify">
        <div style="font-weight:600;color:#0f172a;margin-bottom:4px">${escapeHtml(t.verifyTitulo)}</div>
        <div>${escapeHtml(t.verifyTexto)}</div>
        <div style="margin-top:6px;color:#0f172a;font-family:monospace">${escapeHtml(verifyUrl)}</div>
        ${coa.pdf_hash ? `<div style="margin-top:4px">SHA-256: <span style="font-family:monospace">${escapeHtml(coa.pdf_hash)}</span></div>` : ''}
      </div>` : ''}
    `;

    // Generar los QR tras inyectar el HTML (la librería qrcodejs dibuja
    // dentro de un contenedor existente). Si la lib no cargó, se omite.
    try {
      if (window.QRCode) {
        if (coa.empresa_metodologias_url) {
          const elM = document.getElementById('qrMetod');
          if (elM) new QRCode(elM, { text: coa.empresa_metodologias_url, width: 110, height: 110, correctLevel: QRCode.CorrectLevel.M });
        }
        if (verifyUrl) {
          const elV = document.getElementById('qrVerify');
          if (elV) new QRCode(elV, { text: verifyUrl, width: 110, height: 110, correctLevel: QRCode.CorrectLevel.M });
        }
      }
    } catch (e) { /* QR best-effort: nunca rompe el render del COA */ }
  }

  function buildVerifyUrl(token) {
    if (!token) return '';
    // Construye URL pública absoluta sobre el host actual.
    const host = window.location.origin;
    return `${host}/public-coa-verify.html?token=${encodeURIComponent(token)}`;
  }

  $('backBtn').addEventListener('click', () => { window.location.href = '/modules/lab/lab-coa.html'; });
  $('printBtn').addEventListener('click', () => window.print());
  $('copyUrlBtn').addEventListener('click', async () => {
    const url = buildVerifyUrl(coa?.url_publica_token);
    if (!url) return KoguApi.toast('No hay token de verificación', 'error');
    try { await navigator.clipboard.writeText(url); KoguApi.toast('URL copiada al portapapeles', 'success'); }
    catch (_) { prompt('Copia la URL pública:', url); }
  });
  $('anularBtn').addEventListener('click', async () => {
    if (coa?.estado !== 'emitido') return KoguApi.toast('Solo se puede anular un COA emitido', 'error');
    const motivo = prompt('Motivo de anulación (requerido):');
    if (!motivo || !motivo.trim()) return;
    if (!confirm('¿Anular este COA? La acción no se puede deshacer.')) return;
    try {
      await KoguApi.apiFetch(`${BASE}/${coaId}/anular`, {
        method: 'POST', body: JSON.stringify({ motivo: motivo.trim() }),
      });
      KoguApi.toast('COA anulado', 'success');
      await loadCoa();
    } catch (err) { KoguApi.toast(err.message, 'error'); }
  });

  KoguShell.subscribeEmpresaActivaChange(() => {
    window.location.href = '/modules/lab/lab-coa.html';
  });

  function $(id) { return document.getElementById(id); }
  function escapeHtml(s) { return String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m]); }

  await loadCoa();
});

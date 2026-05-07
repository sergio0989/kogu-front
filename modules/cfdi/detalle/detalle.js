document.addEventListener('DOMContentLoaded', async () => {
  const boot = await KoguShell.initShell({
    currentPage: '/modules/cfdi/detalle/detalle.html',
    title: 'Detalle CFDI',
    description: 'Vista tipo factura impresa con lectura fiscal SAT, EFOS y cancelabilidad.',
    requiredPermission: 'screen.cfdi.sat_dm'
  });
  if (!boot) return;

  const c = document.getElementById('pageContent');
  const qs = new URLSearchParams(location.search);
  const uuid = qs.get('uuid');
  const printMode = qs.get('print') === '1';

  if (!uuid) {
    c.innerHTML = '<div class="card"><h2>UUID requerido</h2><p>Abre esta pantalla desde la bandeja CFDI.</p></div>';
    return;
  }

  injectPrintStyles();

  const [fichaRes, jsonRes, xmlRes] = await Promise.allSettled([
    KoguApi.apiFetch('/cfdi/protected/cfdi/facturas/' + encodeURIComponent(uuid)),
    KoguApi.apiFetch('/cfdi/protected/cfdi/facturas/' + encodeURIComponent(uuid) + '/json'),
    KoguApi.apiFetch('/cfdi/protected/cfdi/facturas/' + encodeURIComponent(uuid) + '/xml')
  ]);

  const ficha = fichaRes.status === 'fulfilled' ? (KoguApi.unwrapData(fichaRes.value) || {}) : {};
  const jsonData = jsonRes.status === 'fulfilled' ? KoguApi.unwrapData(jsonRes.value) : null;
  const xmlData = xmlRes.status === 'fulfilled' ? xmlRes.value : null;

  function n(v) {
    const x = Number(v || 0);
    return Number.isFinite(x) ? x : 0;
  }

  function asText(v, d = '-') {
    return (v === null || v === undefined || v === '') ? d : String(v);
  }

  function shortDate(v) {
    if (!v) return '-';
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return asText(v);
    return d.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function dateTimeText(v) {
    if (!v) return '-';
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return asText(v);
    return d.toLocaleString('es-MX', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function origenConsultaLabel(value) {
    const v = String(value || '').trim().toLowerCase();
    const map = {
      manual_detalle: 'Manual detalle',
      manual_bandeja_batch: 'Bandeja masiva',
      auto_missing_batch: 'Auto faltantes',
      post_proceso_zip: 'Post proceso ZIP'
    };
    return map[v] || (value ? String(value) : '-');
  }

  function resolveRisk() {
    const code = String(ficha.validacion_efos || '').trim();
    if (code === '200') return 'Sin alerta';
    if (code === '100') return 'Alerta EFOS';
    if (code === '101' || code === '201') return 'Revisión fiscal';
    if (code) return 'Otro código SAT';
    return 'Sin validación';
  }

  function resolveCancel() {
    return ficha.sat_cancelacion_ui || ficha.cancelabilidad_ui || ficha.es_cancelable || ficha.estatus_cancelacion || '-';
  }

  function chip(text, kind = '') {
    return `<span class="chip ${kind}">${KoguUi.escapeHtml(text || '-')}</span>`;
  }

  function riskChip() {
    const text = resolveRisk();
    let cls = '';
    if (/alerta/i.test(text)) cls = 'danger';
    else if (/revisi/i.test(text)) cls = 'warn';
    else if (/sin alerta/i.test(text)) cls = 'success';
    return chip(text, cls);
  }

  function cancelChip() {
    const text = resolveCancel();
    let cls = '';
    if (/no cancelable/i.test(text)) cls = 'danger';
    else if (/sin aceptación|sin aceptacion/i.test(text)) cls = 'warn';
    else if (/con aceptación|con aceptacion/i.test(text)) cls = 'success';
    return chip(text, cls);
  }

  function relationLabel(code) {
    const k = String(code || '').padStart(2, '0');
    const map = {
      '01': 'Nota de crédito',
      '02': 'Nota de débito',
      '03': 'Devolución de mercancía',
      '04': 'Sustitución de CFDI previos',
      '05': 'Traslados facturados previamente',
      '06': 'Factura por traslados previos',
      '07': 'CFDI por aplicación de anticipo'
    };
    return map[k] || 'Relación SAT';
  }

  async function openOfficialPdf(uuidValue) {
    const response = await KoguApi.authFetchRaw(
      `/cfdi/protected/cfdi/facturas/${encodeURIComponent(uuidValue)}/pdf`,
      {
        method: 'GET',
        headers: {
          Accept: 'application/pdf, application/octet-stream, */*'
        }
      }
    );

    if (!response.ok) {
      let message = 'No fue posible abrir el PDF oficial';
      try {
        const err = await response.clone().json();
        message = err?.error?.message || err?.message || message;
      } catch (_e) {}
      throw new Error(message);
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener');

    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 60000);
  }

  const subtotal = n(ficha.subtotal || ficha.desglose?.subtotal);
  const traslados = n(ficha.traslados || ficha.desglose?.traslados || ficha.impuestos_tras || ficha.impuestos_trasladados);
  const retenidos = n(ficha.retenidos || ficha.desglose?.retenidos || ficha.impuestos_ret || ficha.impuestos_retenidos);
  const retIva = n(ficha.retencion_iva || ficha.desglose?.retencion_iva || ficha.impuestos_ret_iva);
  const retIsr = n(ficha.retencion_isr || ficha.desglose?.retencion_isr || ficha.impuestos_ret_isr);
  const total = n(ficha.total || ficha.desglose?.total);

  const conceptos = Array.isArray(ficha.conceptos) ? ficha.conceptos : [];
  const relaciones = Array.isArray(ficha.relaciones) ? ficha.relaciones : [];
  const ultimaConsultaSat = ficha.fecha_ultima_consulta_sat || ficha.fecha_consulta || ficha.sat_consultado_en || null;

  c.innerHTML = `
    <div class="stack detalle-cfdi-page ${printMode ? 'detalle-print-clean' : ''}">
      <div class="card no-print detalle-toolbar-card">
        <div class="row detalle-toolbar-row">
          <div>
            <div class="eyebrow">Ficha operativa</div>
            <h2>Vista imprimible del CFDI</h2>
            <p class="muted" style="margin-top:6px">Usa esta ficha para revisar o abrir el PDF oficial generado por el backend.</p>
          </div>
          <div class="page-actions">
            <a class="btn" href="/modules/cfdi/bandeja/bandeja.html">Volver a bandeja</a>
            <button class="btn primary" id="printPdfBtn">Abrir PDF oficial</button>
          </div>
        </div>
      </div>

      <div class="card detalle-print-sheet detalle-print-hero">
        <div class="detalle-print-topline">
          <div>
            <div class="eyebrow">Comprobante fiscal digital</div>
            <h1>Detalle CFDI</h1>
          </div>
          <div class="detalle-print-statuses">
            ${chip(
              ficha.estatus_sat || '-',
              /VIGENTE/i.test(ficha.estatus_sat || '') ? 'success' : /CANCELADO/i.test(ficha.estatus_sat || '') ? 'danger' : ''
            )}
            ${riskChip()}
            ${cancelChip()}
          </div>
        </div>

        <div class="factura-header factura-header-main" style="margin-top:16px">
          <div><strong>UUID:</strong> ${KoguUi.escapeHtml(asText(ficha.uuid || uuid))}</div>
          <div><strong>Serie / Folio:</strong> ${KoguUi.escapeHtml(asText(ficha.serie))} / ${KoguUi.escapeHtml(asText(ficha.folio))}</div>
          <div><strong>Fecha emisión:</strong> ${KoguUi.escapeHtml(shortDate(ficha.fecha_emision))}</div>
          <div><strong>Timbrado:</strong> ${KoguUi.escapeHtml(shortDate(ficha.fecha_timbrado))}</div>
          <div><strong>Método de pago:</strong> ${KoguUi.escapeHtml(asText(ficha.metodo_pago))}</div>
          <div><strong>Tipo comprobante:</strong> ${KoguUi.escapeHtml(asText(ficha.tipo_comprobante))}</div>
        </div>

        <div class="factura-header factura-header-secondary" style="margin-top:10px">
          <div><strong>Moneda:</strong> ${KoguUi.escapeHtml(asText(ficha.moneda))}</div>
          <div><strong>Tipo de cambio:</strong> ${KoguUi.escapeHtml(asText(ficha.tipo_cambio))}</div>
          <div><strong>Forma de pago:</strong> ${KoguUi.escapeHtml(asText(ficha.forma_pago))}</div>
          <div><strong>Lugar expedición:</strong> ${KoguUi.escapeHtml(asText(ficha.lugar_expedicion))}</div>
          <div><strong>Origen:</strong> ${KoguUi.escapeHtml(asText(ficha.origen))}</div>
          <div><strong>Uso CFDI:</strong> ${KoguUi.escapeHtml(asText(ficha.uso_cfdi))}</div>
        </div>
      </div>

      <div class="split detalle-main-split detalle-print-sheet">
        <div class="card detalle-factura-card">
          <div class="eyebrow">Representación principal</div>
          <h2>Vista tipo factura</h2>

          <div class="split detalle-emisor-receptor" style="margin-top:16px">
            <div class="factura-box">
              <div class="eyebrow">Emisor</div>
              <div><strong>${KoguUi.escapeHtml(asText(ficha.emisor_nombre))}</strong></div>
              <div><strong>RFC:</strong> ${KoguUi.escapeHtml(asText(ficha.emisor_rfc))}</div>
              <div><strong>Régimen:</strong> ${KoguUi.escapeHtml(asText(ficha.emisor_regimen))}</div>
            </div>
            <div class="factura-box">
              <div class="eyebrow">Receptor</div>
              <div><strong>${KoguUi.escapeHtml(asText(ficha.receptor_nombre))}</strong></div>
              <div><strong>RFC:</strong> ${KoguUi.escapeHtml(asText(ficha.receptor_rfc))}</div>
              <div><strong>Uso CFDI:</strong> ${KoguUi.escapeHtml(asText(ficha.uso_cfdi))}</div>
            </div>
          </div>

          <div class="card detalle-conceptos-card" style="margin-top:16px;padding:0;border:none;box-shadow:none;background:transparent">
            <div class="eyebrow">Conceptos</div>
            <h2>Detalle de conceptos</h2>
            ${
              conceptos.length
                ? `
              <div class="table-wrap detalle-conceptos-table" style="margin-top:16px">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Clave</th>
                      <th>Cantidad</th>
                      <th>Unidad</th>
                      <th>Descripción</th>
                      <th>V. unitario</th>
                      <th>Descuento</th>
                      <th>Importe</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${conceptos
                      .map(
                        (x) => `
                      <tr>
                        <td>${KoguUi.escapeHtml(asText(x.no_linea))}</td>
                        <td>${KoguUi.escapeHtml(asText(x.clave_prod))}</td>
                        <td>${KoguUi.escapeHtml(asText(x.cantidad))}</td>
                        <td>${KoguUi.escapeHtml(asText(x.unidad))}</td>
                        <td>${KoguUi.escapeHtml(asText(x.descripcion))}</td>
                        <td>${KoguUi.money(n(x.valor_unit))}</td>
                        <td>${KoguUi.money(n(x.descuento))}</td>
                        <td>${KoguUi.money(n(x.importe))}</td>
                      </tr>
                    `
                      )
                      .join('')}
                  </tbody>
                </table>
              </div>`
                : `<div class="hero-note" style="margin-top:16px">Sin conceptos registrados para este CFDI.</div>`
            }
          </div>

          <div class="split factura-foot detalle-resumen-final" style="margin-top:16px">
            <div class="factura-box detalle-observacion-box">
              <div class="eyebrow">Observación ejecutiva</div>
              <p class="muted" style="margin-top:8px">
                ${
                  resolveRisk() !== '-'
                    ? `CFDI con lectura SAT: ${KoguUi.escapeHtml(resolveRisk())}.`
                    : 'CFDI sin lectura de riesgo fiscal derivada.'
                }
                ${resolveCancel() !== '-' ? ` Cancelabilidad: ${KoguUi.escapeHtml(resolveCancel())}.` : ''}
                ${ficha.estatus_sat ? ` Estatus SAT: ${KoguUi.escapeHtml(ficha.estatus_sat)}.` : ''}
              </p>
            </div>
            <div class="factura-totales">
              <div class="factura-total-row"><span>Subtotal</span><strong>${KoguUi.money(subtotal)}</strong></div>
              <div class="factura-total-row"><span>Impuestos trasladados</span><strong>${KoguUi.money(traslados)}</strong></div>
              <div class="factura-total-row"><span>Retenciones</span><strong>${KoguUi.money(retenidos)}</strong></div>
              <div class="factura-total-row"><span>Retención IVA</span><strong>${KoguUi.money(retIva)}</strong></div>
              <div class="factura-total-row"><span>Retención ISR</span><strong>${KoguUi.money(retIsr)}</strong></div>
              <div class="factura-total-row grand"><span>Total</span><strong>${KoguUi.money(total)}</strong></div>
            </div>
          </div>
        </div>

        <div class="stack detalle-side-stack">
          <div class="card detalle-print-sheet detalle-side-card">
            <div class="eyebrow">Control SAT</div>
            <h2>Semáforo fiscal</h2>
            <div class="detalle-sat-badges" style="margin-top:16px">
              <div>${
                chip(
                  ficha.estatus_sat || '-',
                  /VIGENTE/i.test(ficha.estatus_sat || '') ? 'success' : /CANCELADO/i.test(ficha.estatus_sat || '') ? 'danger' : ''
                )
              }</div>
              <div>${riskChip()}</div>
              <div>${cancelChip()}</div>
            </div>
            <div class="table-wrap detalle-side-table" style="margin-top:16px">
              <table>
                <tbody>
                  <tr><th>Última consulta SAT</th><td>${KoguUi.escapeHtml(dateTimeText(ultimaConsultaSat))}</td></tr>
                  <tr><th>Origen consulta</th><td>${KoguUi.escapeHtml(origenConsultaLabel(ficha.origen_consulta))}</td></tr>
                  <tr><th>EsCancelable</th><td>${KoguUi.escapeHtml(asText(ficha.es_cancelable))}</td></tr>
                  <tr><th>EstatusCancelación</th><td>${KoguUi.escapeHtml(asText(ficha.estatus_cancelacion))}</td></tr>
                  <tr><th>Validación EFOS</th><td>${KoguUi.escapeHtml(asText(ficha.validacion_efos))}</td></tr>
                  <tr><th>Fecha cancelación</th><td>${KoguUi.escapeHtml(shortDate(ficha.sat_fecha_cancelacion || ficha.fecha_cancelacion))}</td></tr>
                  <tr><th>Request / Paquete</th><td>${KoguUi.escapeHtml(asText(ficha.request_id))} / ${KoguUi.escapeHtml(asText(ficha.package_id || ficha.cfdi_paquete_id))}</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          <div class="card detalle-print-sheet detalle-side-card">
            <div class="eyebrow">Relaciones</div>
            <h2>Trazabilidad</h2>
            ${
              relaciones.length
                ? `
              <div class="table-wrap detalle-side-table" style="margin-top:16px">
                <table>
                  <thead>
                    <tr>
                      <th>Tipo</th>
                      <th>Descripción</th>
                      <th>UUID relacionado</th>
                      <th>Fecha</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${relaciones
                      .map((x) => {
                        const tipo = asText(x.tipo_relacion);
                        return `
                        <tr>
                          <td>${KoguUi.escapeHtml(tipo)}</td>
                          <td>${KoguUi.escapeHtml(relationLabel(tipo))}</td>
                          <td class="mono">${KoguUi.escapeHtml(asText(x.uuid_relacionado || x.uuid || x.uuid_relacion))}</td>
                          <td>${KoguUi.escapeHtml(shortDate(x.fecha_relacionada || x.fecha_emision || x.created_at))}</td>
                          <td>${KoguUi.money(n(x.total_relacionado || x.total))}</td>
                        </tr>`;
                      })
                      .join('')}
                  </tbody>
                </table>
              </div>`
                : `<div class="hero-note" style="margin-top:16px">Sin relaciones registradas en la ficha actual.</div>`
            }
          </div>

          <div class="card no-print">
            <div class="eyebrow">Representaciones</div>
            <h2>JSON y XML</h2>
            <div class="hero-note" style="margin-top:16px">La representación técnica se conserva como apoyo, pero la lectura principal está en la vista tipo factura.</div>
            <div class="stack" style="margin-top:16px">
              <div><div class="label-text">JSON</div><div class="pre">${KoguUi.escapeHtml(typeof jsonData === 'string' ? jsonData : JSON.stringify(jsonData || { mensaje: 'No disponible' }, null, 2))}</div></div>
              <div><div class="label-text">XML</div><div class="pre">${KoguUi.escapeHtml(typeof xmlData === 'string' ? xmlData : JSON.stringify(xmlData || { mensaje: 'No disponible' }, null, 2))}</div></div>
            </div>
          </div>
        </div>
      </div>
    </div>`;

  const printBtn = document.getElementById('printPdfBtn');
  if (printBtn) {
    printBtn.onclick = async () => {
      try {
        printBtn.disabled = true;
        const original = printBtn.textContent;
        printBtn.textContent = 'Abriendo...';
        await openOfficialPdf(uuid);
        printBtn.textContent = original;
      } catch (err) {
        KoguApi.toast(err.message || 'No fue posible abrir el PDF oficial', 'error');
        printBtn.disabled = false;
        printBtn.textContent = 'Abrir PDF oficial';
        return;
      }
      printBtn.disabled = false;
      printBtn.textContent = 'Abrir PDF oficial';
    };
  }

  if (printMode) {
    try {
      await openOfficialPdf(uuid);
    } catch (err) {
      KoguApi.toast(err.message || 'No fue posible abrir el PDF oficial', 'error');
    }
  }
});

function injectPrintStyles() {
  if (document.getElementById('cfdi-print-style-patch')) return;

  const style = document.createElement('style');
  style.id = 'cfdi-print-style-patch';
  style.textContent = `
    body.cfdi-print-mode,
    html.cfdi-print-mode,
    .cfdi-print-mode body {
      background: #fff !important;
    }

    .detalle-print-clean .no-print,
    .cfdi-print-mode .no-print,
    .cfdi-print-mode .topbar,
    .cfdi-print-mode .sidebar,
    .cfdi-print-mode .shell-sidebar,
    .cfdi-print-mode .shell-topbar,
    .cfdi-print-mode nav,
    .cfdi-print-mode aside,
    .cfdi-print-mode header {
      display: none !important;
    }

    .cfdi-print-mode #pageContent,
    .cfdi-print-mode .page-content,
    .cfdi-print-mode .main-content,
    .cfdi-print-mode .content,
    .cfdi-print-mode .layout-content {
      margin: 0 !important;
      padding: 0 !important;
      width: 100% !important;
      max-width: none !important;
    }

    .cfdi-print-mode .detalle-cfdi-page,
    .cfdi-print-mode .detalle-print-clean {
      gap: 0 !important;
    }

    .cfdi-print-mode .detalle-toolbar-card {
      display: none !important;
    }

    .cfdi-print-mode .detalle-print-sheet,
    .cfdi-print-mode .detalle-factura-card,
    .cfdi-print-mode .detalle-side-card,
    .cfdi-print-mode .card {
      box-shadow: none !important;
      border: 1px solid #d9e1ea !important;
      border-radius: 0 !important;
      background: #fff !important;
    }

    .cfdi-print-mode .detalle-main-split {
      display: block !important;
    }

    .cfdi-print-mode .detalle-side-stack {
      display: block !important;
    }

    .cfdi-print-mode .detalle-side-stack > .card {
      margin-top: 10px !important;
    }

    .cfdi-print-mode .detalle-emisor-receptor {
      display: grid !important;
      grid-template-columns: 1fr 1fr !important;
      gap: 10px !important;
    }

    .cfdi-print-mode .factura-header,
    .cfdi-print-mode .factura-header-main,
    .cfdi-print-mode .factura-header-secondary {
      display: grid !important;
      grid-template-columns: repeat(3, 1fr) !important;
      gap: 8px 16px !important;
    }

    .cfdi-print-mode .factura-header > div,
    .cfdi-print-mode .factura-header-main > div,
    .cfdi-print-mode .factura-header-secondary > div {
      min-width: 0;
    }

    .cfdi-print-mode .detalle-conceptos-table table,
    .cfdi-print-mode .detalle-side-table table,
    .cfdi-print-mode table {
      width: 100% !important;
      border-collapse: collapse !important;
      table-layout: fixed !important;
    }

    .cfdi-print-mode table th,
    .cfdi-print-mode table td {
      font-size: 11px !important;
      padding: 6px 8px !important;
      border-bottom: 1px solid #d9e1ea !important;
      vertical-align: top !important;
      word-break: break-word !important;
    }

    .cfdi-print-mode .factura-totales {
      width: 100% !important;
    }

    .cfdi-print-mode .factura-total-row {
      padding: 6px 0 !important;
    }

    .cfdi-print-mode .chip,
    .cfdi-print-mode .status-badge {
      box-shadow: none !important;
      border: 1px solid #d9e1ea !important;
    }

    .cfdi-print-mode .pre {
      white-space: pre-wrap !important;
      word-break: break-word !important;
      max-height: none !important;
      overflow: visible !important;
    }

    @page {
      size: auto;
      margin: 10mm;
    }

    @media print {
      html, body {
        background: #fff !important;
      }

      .no-print,
      .topbar,
      .sidebar,
      .shell-sidebar,
      .shell-topbar,
      nav,
      aside,
      header {
        display: none !important;
      }

      #pageContent,
      .page-content,
      .main-content,
      .content,
      .layout-content {
        margin: 0 !important;
        padding: 0 !important;
        width: 100% !important;
        max-width: none !important;
      }

      .detalle-main-split {
        display: block !important;
      }

      .detalle-side-stack > .card {
        margin-top: 10px !important;
      }

      .factura-header,
      .factura-header-main,
      .factura-header-secondary {
        display: grid !important;
        grid-template-columns: repeat(3, 1fr) !important;
        gap: 8px 16px !important;
      }

      .detalle-emisor-receptor {
        display: grid !important;
        grid-template-columns: 1fr 1fr !important;
        gap: 10px !important;
      }

      table {
        width: 100% !important;
        border-collapse: collapse !important;
        table-layout: fixed !important;
      }

      th, td {
        font-size: 11px !important;
        padding: 6px 8px !important;
        border-bottom: 1px solid #d9e1ea !important;
        vertical-align: top !important;
        word-break: break-word !important;
      }

      .card,
      .detalle-print-sheet,
      .detalle-factura-card,
      .detalle-side-card {
        box-shadow: none !important;
        border-radius: 0 !important;
        break-inside: avoid;
        page-break-inside: avoid;
      }
    }
  `;

  document.head.appendChild(style);
}
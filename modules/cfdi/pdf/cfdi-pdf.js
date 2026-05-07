document.addEventListener('DOMContentLoaded', async () => {
  const boot = await KoguShell.initShell({
    currentPage: '/modules/cfdi/pdf/cfdi-pdf.html',
    title: 'Representación CFDI',
    description: 'Salida documental para impresión o guardado en PDF.',
    requiredPermission: 'screen.cfdi.sat_dm'
  });
  if (!boot) return;

  const qs = new URLSearchParams(location.search);
  const uuid = qs.get('uuid');
  const autoPrint = qs.get('print') === '1';

  const app = document.getElementById('pdfApp');

  if (!uuid) {
    app.innerHTML = `
      <div class="cfdi-pdf-sheet">
        <div class="cfdi-pdf-loading">UUID requerido para generar la representación PDF.</div>
      </div>
    `;
    return;
  }

  let ficha = {};

  try {
    const fichaRes = await KoguApi.apiFetch('/cfdi/protected/cfdi/facturas/' + encodeURIComponent(uuid));
    ficha = KoguApi.unwrapData(fichaRes) || {};
    console.log('PDF ficha:', ficha);
  } catch (err) {
    console.error('Error cargando CFDI PDF:', err);
    app.innerHTML = `
      <div class="cfdi-pdf-sheet">
        <div class="cfdi-pdf-loading">No fue posible cargar la información del CFDI.</div>
      </div>
    `;
    return;
  }

  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function n(v) {
    const x = Number(v || 0);
    return Number.isFinite(x) ? x : 0;
  }

  function t(v, d = '-') {
    return (v === null || v === undefined || v === '') ? d : String(v);
  }

  function money(v, moneda = '') {
    const amount = new Intl.NumberFormat('es-MX', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(n(v));
    const suffix = moneda ? ` ${String(moneda).toUpperCase()}` : '';
    return `$${amount}${suffix}`;
  }

  function shortDate(v) {
    if (!v) return '-';
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return String(v);
    return d.toLocaleDateString('es-MX', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  }

  function dateTime(v) {
    if (!v) return '-';
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return String(v);
    return d.toLocaleString('es-MX', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function satTag(text, kind = '') {
    return `<span class="cfdi-pdf-tag ${kind}">${esc(text || '-')}</span>`;
  }

  function satStatusKind(status) {
    const v = String(status || '').toUpperCase();
    if (v === 'VIGENTE') return 'ok';
    if (v === 'CANCELADO') return 'bad';
    return '';
  }

  function riskLabel(code) {
    const c = String(code || '').trim();
    if (c === '200') return { text: 'Sin alerta', kind: 'ok' };
    if (c === '100') return { text: 'Alerta EFOS', kind: 'bad' };
    if (c === '101' || c === '201') return { text: 'Revisión fiscal', kind: 'warn' };
    if (c) return { text: `Código SAT ${c}`, kind: 'warn' };
    return { text: 'Sin validación', kind: '' };
  }

  function cancelLabel(value) {
    const txt = String(value || '').trim();
    if (/con aceptación|con aceptacion/i.test(txt)) return { text: txt, kind: 'ok' };
    if (/sin aceptación|sin aceptacion/i.test(txt)) return { text: txt, kind: 'warn' };
    if (/no cancelable/i.test(txt)) return { text: txt, kind: 'bad' };
    return { text: txt || '-', kind: '' };
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

  function tipoComprobanteLabel(tipo) {
    const v = String(tipo || '').toUpperCase();
    const map = {
      I: 'Ingreso',
      E: 'Egreso',
      T: 'Traslado',
      N: 'Nómina',
      P: 'Pago'
    };
    return map[v] || v || '-';
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

  const moneda = t(ficha.moneda, '');
  const subtotal = n(ficha.subtotal || ficha.desglose?.subtotal);
  const traslados = n(ficha.traslados || ficha.desglose?.traslados || ficha.impuestos_tras || ficha.impuestos_trasladados);
  const retenidos = n(ficha.retenidos || ficha.desglose?.retenidos || ficha.impuestos_ret || ficha.impuestos_retenidos);
  const retIva = n(ficha.retencion_iva || ficha.desglose?.retencion_iva || ficha.impuestos_ret_iva);
  const retIsr = n(ficha.retencion_isr || ficha.desglose?.retencion_isr || ficha.impuestos_ret_isr);
  const total = n(ficha.total || ficha.desglose?.total);

  const conceptos = Array.isArray(ficha.conceptos) ? ficha.conceptos : [];
  const relaciones = Array.isArray(ficha.relaciones) ? ficha.relaciones : [];

  const riesgo = riskLabel(ficha.validacion_efos);
  const cancelabilidad = cancelLabel(
    ficha.sat_cancelacion_ui ||
    ficha.cancelabilidad_ui ||
    ficha.es_cancelable ||
    ficha.estatus_cancelacion
  );

  const ultimaConsultaSat =
    ficha.fecha_ultima_consulta_sat ||
    ficha.fecha_consulta ||
    ficha.sat_consultado_en ||
    null;

  const footerUuid = ficha.uuid || uuid;
  const footerFechaConsulta = dateTime(ultimaConsultaSat);

  app.innerHTML = `
    <div class="cfdi-pdf-sheet">
      <div class="cfdi-pdf-toolbar">
        <a class="btn" href="/modules/cfdi/bandeja/bandeja.html">Volver</a>
        <button class="btn primary" id="printPdfBtn">Guardar PDF</button>
      </div>

      <div class="cfdi-pdf-paper">
        <section class="cfdi-pdf-head">
          <div class="cfdi-pdf-brand">
            <h1>Representación impresa de CFDI</h1>
            <p>${esc(tipoComprobanteLabel(ficha.tipo_comprobante))} · ${esc(t(ficha.origen))}</p>
          </div>
          <div class="cfdi-pdf-tags">
            ${satTag(t(ficha.estatus_sat), satStatusKind(ficha.estatus_sat))}
            ${satTag(riesgo.text, riesgo.kind)}
            ${satTag(cancelabilidad.text, cancelabilidad.kind)}
          </div>
        </section>

        <section class="cfdi-pdf-block cfdi-pdf-grid-2">
          <div class="cfdi-pdf-box">
            <div class="cfdi-pdf-section-title">Emisor</div>
            <div class="cfdi-pdf-kv">
              <div class="k">Nombre</div><div class="v">${esc(t(ficha.emisor_nombre))}</div>
              <div class="k">RFC</div><div class="v">${esc(t(ficha.emisor_rfc))}</div>
              <div class="k">Régimen</div><div class="v">${esc(t(ficha.emisor_regimen))}</div>
            </div>
          </div>

          <div class="cfdi-pdf-box">
            <div class="cfdi-pdf-section-title">Receptor</div>
            <div class="cfdi-pdf-kv">
              <div class="k">Nombre</div><div class="v">${esc(t(ficha.receptor_nombre))}</div>
              <div class="k">RFC</div><div class="v">${esc(t(ficha.receptor_rfc))}</div>
              <div class="k">Uso CFDI</div><div class="v">${esc(t(ficha.uso_cfdi))}</div>
            </div>
          </div>
        </section>

        <section class="cfdi-pdf-block">
          <div class="cfdi-pdf-mini-grid">
            <div class="cfdi-pdf-mini">
              <span class="k">UUID</span>
              <span class="v">${esc(t(ficha.uuid || uuid))}</span>
            </div>
            <div class="cfdi-pdf-mini">
              <span class="k">Serie / Folio</span>
              <span class="v">${esc(t(ficha.serie))} / ${esc(t(ficha.folio))}</span>
            </div>
            <div class="cfdi-pdf-mini">
              <span class="k">Fecha emisión</span>
              <span class="v">${esc(shortDate(ficha.fecha_emision))}</span>
            </div>

            <div class="cfdi-pdf-mini">
              <span class="k">Método pago</span>
              <span class="v">${esc(t(ficha.metodo_pago))}</span>
            </div>
            <div class="cfdi-pdf-mini">
              <span class="k">Forma pago</span>
              <span class="v">${esc(t(ficha.forma_pago))}</span>
            </div>
            <div class="cfdi-pdf-mini">
              <span class="k">Moneda / TC</span>
              <span class="v">${esc(t(ficha.moneda))} / ${esc(t(ficha.tipo_cambio))}</span>
            </div>
          </div>
        </section>

        <section class="cfdi-pdf-block">
          <div class="cfdi-pdf-box soft">
            <div class="cfdi-pdf-section-title">Datos operativos / SAT</div>
            <div class="cfdi-pdf-kv">
              <div class="k">Última consulta SAT</div><div class="v">${esc(footerFechaConsulta)}</div>
              <div class="k">Origen consulta</div><div class="v">${esc(origenConsultaLabel(ficha.origen_consulta))}</div>
              <div class="k">Código estatus</div><div class="v">${esc(t(ficha.codigo_estatus))}</div>
              <div class="k">Fecha cancelación</div><div class="v">${esc(shortDate(ficha.sat_fecha_cancelacion || ficha.fecha_cancelacion))}</div>
            </div>
          </div>
        </section>

        <section class="cfdi-pdf-block">
          <div class="cfdi-pdf-section-title">Conceptos</div>
          <div class="cfdi-pdf-table-wrap">
            <table class="cfdi-pdf-table">
              <thead>
                <tr>
                  <th style="width:8%">#</th>
                  <th style="width:13%">Clave</th>
                  <th style="width:10%">Cantidad</th>
                  <th style="width:12%">Unidad</th>
                  <th style="width:31%">Descripción</th>
                  <th style="width:13%">V. unitario</th>
                  <th style="width:13%">Importe</th>
                </tr>
              </thead>
              <tbody>
                ${
                  conceptos.length
                    ? conceptos.map((x) => `
                      <tr>
                        <td>${esc(t(x.no_linea))}</td>
                        <td>${esc(t(x.clave_prod))}</td>
                        <td>${esc(t(x.cantidad))}</td>
                        <td>${esc(t(x.unidad))}</td>
                        <td>${esc(t(x.descripcion))}</td>
                        <td class="cfdi-pdf-right">${money(x.valor_unit)}</td>
                        <td class="cfdi-pdf-right">${money(x.importe)}</td>
                      </tr>
                    `).join('')
                    : `<tr><td colspan="7" class="cfdi-pdf-empty">Sin conceptos registrados.</td></tr>`
                }
              </tbody>
            </table>
          </div>
        </section>

        ${
          relaciones.length
            ? `
            <section class="cfdi-pdf-block">
              <div class="cfdi-pdf-section-title">Relaciones CFDI</div>
              <div class="cfdi-pdf-table-wrap">
                <table class="cfdi-pdf-table">
                  <thead>
                    <tr>
                      <th style="width:10%">Tipo</th>
                      <th style="width:25%">Descripción</th>
                      <th style="width:35%">UUID relacionado</th>
                      <th style="width:15%">Fecha</th>
                      <th style="width:15%">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${relaciones.map((x) => `
                      <tr>
                        <td>${esc(t(x.tipo_relacion))}</td>
                        <td>${esc(relationLabel(x.tipo_relacion))}</td>
                        <td>${esc(t(x.uuid_relacionado || x.uuid || x.uuid_relacion))}</td>
                        <td>${esc(shortDate(x.fecha_relacionada || x.fecha_emision || x.created_at))}</td>
                        <td class="cfdi-pdf-right">${money(x.total_relacionado || x.total)}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            </section>
            `
            : ''
        }

        <section class="cfdi-pdf-totals">
          <div class="cfdi-pdf-note">
            <div class="cfdi-pdf-section-title">Observación ejecutiva</div>
            Este documento está orientado a impresión/PDF. La lectura principal conserva los datos fiscales, estatus SAT, validación EFOS y cancelabilidad del CFDI al momento de la última consulta.
          </div>

          <div class="cfdi-pdf-total-box">
            <div class="cfdi-pdf-total-row"><span>Subtotal</span><strong>${money(subtotal, moneda)}</strong></div>
            <div class="cfdi-pdf-total-row"><span>Impuestos trasladados</span><strong>${money(traslados, moneda)}</strong></div>
            <div class="cfdi-pdf-total-row"><span>Retenciones</span><strong>${money(retenidos, moneda)}</strong></div>
            <div class="cfdi-pdf-total-row"><span>Retención IVA</span><strong>${money(retIva, moneda)}</strong></div>
            <div class="cfdi-pdf-total-row"><span>Retención ISR</span><strong>${money(retIsr, moneda)}</strong></div>
            <div class="cfdi-pdf-total-row grand"><span>Total</span><strong>${money(total, moneda)}</strong></div>
          </div>
        </section>

        <section class="cfdi-pdf-foot">
          <div class="cfdi-pdf-box">
            <div class="cfdi-pdf-section-title">Timbrado / referencia</div>
            <div class="cfdi-pdf-kv">
              <div class="k">UUID</div><div class="v mono">${esc(footerUuid)}</div>
              <div class="k">Fecha timbrado</div><div class="v">${esc(shortDate(ficha.fecha_timbrado))}</div>
              <div class="k">Tipo comprobante</div><div class="v">${esc(tipoComprobanteLabel(ficha.tipo_comprobante))}</div>
            </div>
          </div>

          <div class="cfdi-pdf-box">
            <div class="cfdi-pdf-section-title">Control interno</div>
            <div class="cfdi-pdf-kv">
              <div class="k">Request / Paquete</div><div class="v">${esc(t(ficha.request_id))} / ${esc(t(ficha.package_id || ficha.cfdi_paquete_id))}</div>
              <div class="k">Estatus SAT</div><div class="v">${esc(t(ficha.estatus_sat))}</div>
              <div class="k">Validación EFOS</div><div class="v">${esc(t(ficha.validacion_efos))}</div>
            </div>
          </div>
        </section>
      </div>
    </div>
  `;

  const printBtn = document.getElementById('printPdfBtn');
  if (printBtn) {
    printBtn.onclick = () => window.print();
  }

  if (autoPrint) {
    setTimeout(() => window.print(), 500);
  }
});
document.addEventListener('DOMContentLoaded', async () => {
  const boot = await KoguShell.initShell({
    currentPage: '/modules/cfdi/validador-xml/validador-xml.html',
    title: 'Validador XML proveedor',
    description: 'Carga XML CFDI del proveedor, valida estructura, refresca SAT si el UUID existe en KOGU y compara contra la base de la empresa activa.',
    requiredPermission: 'screen.cfdi.sat_dm'
  });
  if (!boot) return;

  // F-07: guard empresa activa — sin empresa no hay contexto para llamadas CFDI
  if (!boot.empresa_activa) {
    KoguApi.toast('No hay empresa activa. Selecciona una empresa para continuar.', 'error');
    setTimeout(() => window.location.href = '/modules/core/contexto/cambio-empresa.html', 1200);
    return;
  }

  const app = document.getElementById('pageContent');
  app.innerHTML = `
    <div class="stack valxml-page">
      <div class="card">
        <div class="row valxml-head-row">
          <div>
            <div class="eyebrow">Nuevo bloque</div>
            <h2>Validador XML proveedor</h2>
            <p class="muted" style="margin-top:6px">Si el UUID existe en KOGU, primero se actualiza SAT y luego se realiza la comparación.</p>
          </div>
          <div class="page-actions">
            <button class="btn" id="clearBtn">Limpiar</button>
            <button class="btn primary" id="validateBtn">Validar XML</button>
          </div>
        </div>

        <div class="valxml-upload-box" style="margin-top:16px">
          <div class="label-text">Archivos XML</div>
          <input class="input" id="xmlFiles" type="file" accept=".xml,text/xml,application/xml" multiple>
          <div class="hero-note" id="selectedInfo" style="margin-top:12px">Sin archivos seleccionados.</div>
        </div>
      </div>

      <div class="grid-4" id="resumeGrid">
        <div class="mini-stat"><div class="mini-stat-k">Total</div><div class="mini-stat-v">0</div></div>
        <div class="mini-stat"><div class="mini-stat-k">Coincidencias</div><div class="mini-stat-v">0</div></div>
        <div class="mini-stat"><div class="mini-stat-k">Con diferencias</div><div class="mini-stat-v">0</div></div>
        <div class="mini-stat"><div class="mini-stat-k">No encontrados / inválidos</div><div class="mini-stat-v">0</div></div>
      </div>

      <div class="card">
        <div class="row" style="gap:16px; align-items:flex-start; justify-content:space-between; flex-wrap:wrap;">
          <div>
            <div class="eyebrow">Resultados</div>
            <h2>Validación por archivo</h2>
          </div>
          <div class="page-actions" id="exportActions">
            <button class="btn" id="exportPdfBtn" disabled>Exportar PDF</button>
            <button class="btn primary" id="exportExcelBtn" disabled>Exportar Excel</button>
          </div>
        </div>
        <div class="muted" id="resultMessage" style="margin-top:8px">Aún no hay validaciones ejecutadas.</div>

        <div class="table-wrap" style="margin-top:16px">
          <table>
            <thead>
              <tr>
                <th>Archivo</th>
                <th>UUID</th>
                <th>Serie/Folio</th>
                <th>Emisor</th>
                <th>Receptor</th>
                <th>Estructura XML</th>
                <th>Resultado</th>
                <th>Estatus SAT</th>
                <th>Consulta SAT</th>
                <th>Total XML</th>
                <th>Total KOGU</th>
                <th>Diferencias</th>
                <th>Detalle</th>
              </tr>
            </thead>
            <tbody id="resultRows">
              <tr><td colspan="13" class="empty">Sin resultados.</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="card" id="detailCard" hidden>
        <div class="eyebrow">Detalle</div>
        <h2 id="detailTitle">Archivo</h2>
        <div id="detailBody" class="stack" style="margin-top:16px"></div>
      </div>
    </div>
  `;

  const state = {
    files: [],
    payloadFiles: [],
    resultados: []
  };

  function esc(v) {
    return KoguUi.escapeHtml(String(v ?? ''));
  }

  function money(v) {
    return KoguUi.money(Number(v || 0));
  }

  function shortDate(v) {
    if (!v) return '-';
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return String(v);
    return d.toLocaleDateString('es-MX');
  }

  function shortDateTime(v) {
    if (!v) return '-';
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return String(v);
    return d.toLocaleString('es-MX', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  }

  function resultadoBadge(v) {
    const txt = String(v || '-');
    let cls = 'chip';
    if (/COINCIDE/.test(txt)) cls += ' success';
    else if (/DIFERENCIAS/.test(txt)) cls += ' warn';
    else cls += ' danger';
    return `<span class="${cls}">${esc(txt.replaceAll('_', ' '))}</span>`;
  }

  function estructuraBadge(item) {
    const txt = String(item?.estructura_xml_resumen || '-');
    let cls = 'chip';
    if (txt === 'CORRECTA') cls += ' success';
    else if (txt === 'CORRECTA_CON_OBSERVACIONES') cls += ' warn';
    else cls += ' danger';
    const tot = item?.estructura_xml_totales || {};
    const sub = `${Number(tot.ok || 0)}/${Number(tot.total || 0)}`;
    return `<div class="status-stack"><div><span class="${cls}">${esc(txt.replaceAll('_', ' '))}</span></div><div class="muted">${esc(sub)}</div></div>`;
  }

  function severidadLabel(v) {
    const raw = String(v || '').toLowerCase();
    if (raw === 'error') return 'Crítico';
    if (raw === 'warning') return 'Advertencia';
    return '-';
  }

  function satStatusText(item) {
    if (!item?.existe_en_kogu) return '-';
    const sat = item.sat || item.kogu || {};
    return esc(sat.estatus_sat || item.kogu?.estatus_sat || '-');
  }

  function satConsultText(item) {
    if (!item?.existe_en_kogu) return '-';
    return esc(shortDateTime(item.sat?.created_at || item.kogu?.fecha_ultima_consulta_sat));
  }

  function buildSerieFolio(xml, kogu) {
    const serieXml = xml?.serie || '';
    const folioXml = xml?.folio || '';
    const serieKogu = kogu?.serie || '';
    const folioKogu = kogu?.folio || '';

    const xmlSerieFolio = [serieXml, folioXml].filter(Boolean).join(' / ');
    const koguSerieFolio = [serieKogu, folioKogu].filter(Boolean).join(' / ');

    if (!xmlSerieFolio && !koguSerieFolio) return '-';

    return `
      <div class="status-stack">
        <div><strong>XML:</strong> ${esc(xmlSerieFolio || '-')}</div>
        <div class="muted"><strong>KOGU:</strong> ${esc(koguSerieFolio || '-')}</div>
      </div>
    `;
  }

  function buildPersonCell(nombre, rfc) {
    if (!nombre && !rfc) return '-';
    return `
      <div class="status-stack">
        <div>${esc(nombre || '-')}</div>
        <div class="muted mono">${esc(rfc || '-')}</div>
      </div>
    `;
  }

  function setExportButtons(enabled) {
    document.getElementById('exportPdfBtn').disabled = !enabled;
    document.getElementById('exportExcelBtn').disabled = !enabled;
  }

  function buildResume(resumen) {
    document.getElementById('resumeGrid').innerHTML = `
      <div class="mini-stat"><div class="mini-stat-k">Total</div><div class="mini-stat-v">${KoguUi.int(resumen.total_archivos || 0)}</div></div>
      <div class="mini-stat"><div class="mini-stat-k">Coincidencias</div><div class="mini-stat-v">${KoguUi.int(resumen.coincidencias || 0)}</div></div>
      <div class="mini-stat"><div class="mini-stat-k">Con diferencias</div><div class="mini-stat-v">${KoguUi.int(resumen.con_diferencias || 0)}</div></div>
      <div class="mini-stat"><div class="mini-stat-k">No encontrados / inválidos</div><div class="mini-stat-v">${KoguUi.int((resumen.no_encontrados || 0) + (resumen.invalidos || 0))}</div></div>
    `;
  }

  function renderRows() {
    const tbody = document.getElementById('resultRows');
    if (!state.resultados.length) {
      tbody.innerHTML = '<tr><td colspan="13" class="empty">Sin resultados.</td></tr>';
      return;
    }

    tbody.innerHTML = state.resultados.map((item, idx) => `
      <tr>
        <td>${esc(item.archivo || '-')}</td>
        <td class="mono">${esc(item.uuid || '-')}</td>
        <td>${buildSerieFolio(item.xml, item.kogu)}</td>
        <td>${buildPersonCell(item.xml?.emisor_nombre || item.kogu?.emisor_nombre, item.xml?.emisor_rfc || item.kogu?.emisor_rfc)}</td>
        <td>${buildPersonCell(item.xml?.receptor_nombre || item.kogu?.receptor_nombre, item.xml?.receptor_rfc || item.kogu?.receptor_rfc)}</td>
        <td>${estructuraBadge(item)}</td>
        <td>${resultadoBadge(item.resultado_final)}</td>
        <td>${satStatusText(item)}</td>
        <td>${satConsultText(item)}</td>
        <td>${item.xml ? money(item.xml.total) : '-'}</td>
        <td>${item.kogu ? money(item.kogu.total) : '-'}</td>
        <td>${KoguUi.int((item.diferencias || []).length)}</td>
        <td><button class="btn" data-detail-index="${idx}">Ver detalle</button></td>
      </tr>
    `).join('');

    tbody.querySelectorAll('[data-detail-index]').forEach(btn => {
      btn.onclick = () => openDetail(Number(btn.dataset.detailIndex));
    });
  }

  function openDetail(index) {
    const item = state.resultados[index];
    if (!item) return;

    document.getElementById('detailCard').hidden = false;
    document.getElementById('detailTitle').textContent = item.archivo || 'Detalle';

    const diferencias = Array.isArray(item.diferencias) ? item.diferencias : [];
    const observaciones = Array.isArray(item.observaciones) ? item.observaciones : [];
    const conceptosXml = item.xml?.conceptos || [];
    const conceptosKogu = item.conceptos_kogu || [];
    const validacionesEstructura = Array.isArray(item.validaciones_estructura) ? item.validaciones_estructura : [];
    const estructuraTotales = item.estructura_xml_totales || {};

    document.getElementById('detailBody').innerHTML = `
      <div class="grid-2">
        <div class="factura-box">
          <div class="eyebrow">XML</div>
          <div><strong>UUID:</strong> ${esc(item.uuid || '-')}</div>
          <div><strong>Versión CFDI:</strong> ${esc(item.xml?.version_cfdi || '-')}</div>
          <div><strong>Serie:</strong> ${esc(item.xml?.serie || '-')}</div>
          <div><strong>Folio:</strong> ${esc(item.xml?.folio || '-')}</div>
          <div><strong>RFC emisor:</strong> ${esc(item.xml?.emisor_rfc || '-')}</div>
          <div><strong>Nombre emisor:</strong> ${esc(item.xml?.emisor_nombre || '-')}</div>
          <div><strong>RFC receptor:</strong> ${esc(item.xml?.receptor_rfc || '-')}</div>
          <div><strong>Nombre receptor:</strong> ${esc(item.xml?.receptor_nombre || '-')}</div>
          <div><strong>Fecha:</strong> ${esc(shortDate(item.xml?.fecha_emision))}</div>
          <div><strong>Moneda:</strong> ${esc(item.xml?.moneda || '-')}</div>
          <div><strong>Total:</strong> ${money(item.xml?.total)}</div>
          <div><strong>Método:</strong> ${esc(item.xml?.metodo_pago || '-')}</div>
          <div><strong>Forma:</strong> ${esc(item.xml?.forma_pago || '-')}</div>
        </div>
        <div class="factura-box">
          <div class="eyebrow">KOGU / SAT</div>
          <div><strong>Existe en KOGU:</strong> ${item.existe_en_kogu ? 'Sí' : 'No'}</div>
          <div><strong>Serie KOGU:</strong> ${esc(item.kogu?.serie || '-')}</div>
          <div><strong>Folio KOGU:</strong> ${esc(item.kogu?.folio || '-')}</div>
          <div><strong>RFC emisor KOGU:</strong> ${esc(item.kogu?.emisor_rfc || '-')}</div>
          <div><strong>Nombre emisor KOGU:</strong> ${esc(item.kogu?.emisor_nombre || '-')}</div>
          <div><strong>RFC receptor KOGU:</strong> ${esc(item.kogu?.receptor_rfc || '-')}</div>
          <div><strong>Nombre receptor KOGU:</strong> ${esc(item.kogu?.receptor_nombre || '-')}</div>
          <div><strong>Refresh SAT:</strong> ${item.refresh_sat_intentado ? (item.refresh_sat_ok ? 'OK' : 'Falló') : 'No aplica'}</div>
          <div><strong>Estatus SAT:</strong> ${esc(item.sat?.estatus_sat || item.kogu?.estatus_sat || '-')}</div>
          <div><strong>Cancelabilidad:</strong> ${esc(item.sat?.es_cancelable || item.sat?.estatus_cancelacion || '-')}</div>
          <div><strong>EFOS:</strong> ${esc(item.sat?.validacion_efos || '-')}</div>
          <div><strong>Última consulta SAT:</strong> ${esc(shortDateTime(item.sat?.created_at || item.kogu?.fecha_ultima_consulta_sat))}</div>
          <div><strong>Total KOGU:</strong> ${item.kogu ? money(item.kogu.total) : '-'}</div>
        </div>
      </div>

      <div class="grid-2">
        <div class="factura-box">
          <div class="eyebrow">Estructura XML</div>
          <div><strong>Dictamen:</strong> ${esc(String(item.estructura_xml_resumen || '-').replaceAll('_', ' '))}</div>
          <div><strong>Checks OK:</strong> ${KoguUi.int(estructuraTotales.ok || 0)} / ${KoguUi.int(estructuraTotales.total || 0)}</div>
          <div><strong>Errores:</strong> ${KoguUi.int(estructuraTotales.errores || 0)}</div>
          <div><strong>Advertencias:</strong> ${KoguUi.int(estructuraTotales.advertencias || 0)}</div>

          <div class="table-wrap" style="margin-top:10px">
            <table>
              <thead>
                <tr><th>Campo</th><th>Severidad</th><th>Resultado</th><th>Mensaje</th></tr>
              </thead>
              <tbody>
                ${validacionesEstructura.length ? validacionesEstructura.map(v => `
                  <tr>
                    <td>${esc(v.campo)}</td>
                    <td>${esc(severidadLabel(v.nivel))}</td>
                    <td>${v.ok ? 'OK' : 'Revisar'}</td>
                    <td>${esc(v.mensaje || '-')}</td>
                  </tr>
                `).join('') : '<tr><td colspan="4" class="empty">Sin validaciones de estructura.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
        <div class="factura-box">
          <div class="eyebrow">Observaciones</div>
          ${observaciones.length ? `<ul class="valxml-list">${observaciones.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '<div class="hero-note" style="margin-top:10px">Sin observaciones.</div>'}
        </div>
      </div>

      <div class="grid-2">
        <div class="factura-box">
          <div class="eyebrow">Diferencias</div>
          ${diferencias.length ? `
            <div class="table-wrap" style="margin-top:10px">
              <table>
                <thead><tr><th>Campo</th><th>XML</th><th>KOGU</th></tr></thead>
                <tbody>
                  ${diferencias.map(d => `<tr><td>${esc(d.campo)}</td><td>${esc(d.xml)}</td><td>${esc(d.kogu)}</td></tr>`).join('')}
                </tbody>
              </table>
            </div>
          ` : '<div class="hero-note" style="margin-top:10px">Sin diferencias detectadas.</div>'}
        </div>
        <div class="factura-box">
          <div class="eyebrow">Resumen SAT</div>
          <div><strong>Estatus:</strong> ${esc(item.sat?.estatus_sat || item.kogu?.estatus_sat || '-')}</div>
          <div><strong>Consulta:</strong> ${esc(shortDateTime(item.sat?.created_at || item.kogu?.fecha_ultima_consulta_sat))}</div>
          <div><strong>EFOS:</strong> ${esc(item.sat?.validacion_efos || '-')}</div>
          <div><strong>Cancelabilidad:</strong> ${esc(item.sat?.es_cancelable || item.sat?.estatus_cancelacion || '-')}</div>
          <div><strong>Refresh:</strong> ${item.refresh_sat_intentado ? (item.refresh_sat_ok ? 'OK' : 'Falló') : 'No aplica'}</div>
        </div>
      </div>

      <div class="grid-2">
        <div class="factura-box">
          <div class="eyebrow">Conceptos XML</div>
          <div class="table-wrap" style="margin-top:10px">
            <table>
              <thead><tr><th>#</th><th>Descripción</th><th>Cant.</th><th>Valor unit.</th><th>Importe</th></tr></thead>
              <tbody>
                ${conceptosXml.length ? conceptosXml.map(c => `<tr><td>${esc(c.no_linea)}</td><td>${esc(c.descripcion || '-')}</td><td>${esc(c.cantidad || '-')}</td><td>${money(c.valor_unit)}</td><td>${money(c.importe)}</td></tr>`).join('') : '<tr><td colspan="5" class="empty">Sin conceptos XML</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
        <div class="factura-box">
          <div class="eyebrow">Conceptos KOGU</div>
          <div class="table-wrap" style="margin-top:10px">
            <table>
              <thead><tr><th>#</th><th>Descripción</th><th>Cant.</th><th>Valor unit.</th><th>Importe</th></tr></thead>
              <tbody>
                ${conceptosKogu.length ? conceptosKogu.map(c => `<tr><td>${esc(c.no_linea)}</td><td>${esc(c.descripcion || '-')}</td><td>${esc(c.cantidad || '-')}</td><td>${money(c.valor_unit)}</td><td>${money(c.importe)}</td></tr>`).join('') : '<tr><td colspan="5" class="empty">Sin conceptos KOGU</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  async function filesToPayload(files) {
    const readers = Array.from(files).map(file => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve({ name: file.name, content: String(reader.result || '') });
      reader.onerror = () => reject(new Error(`No fue posible leer ${file.name}`));
      reader.readAsText(file);
    }));
    return Promise.all(readers);
  }

  async function downloadBlobFromResponse(response, fallbackName) {
    const blob = await response.blob();
    const disposition = response.headers.get('Content-Disposition') || '';
    const match = disposition.match(/filename="?([^"]+)"?/i);
    const filename = match?.[1] || fallbackName;

    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => window.URL.revokeObjectURL(url), 1500);
  }

  async function exportExcel() {
    if (!state.payloadFiles.length) {
      KoguApi.toast('Primero valida los XML antes de exportar.', 'warn');
      return;
    }

    const btn = document.getElementById('exportExcelBtn');
    const original = btn.textContent;

    try {
      btn.disabled = true;
      btn.textContent = 'Exportando...';

      const response = await KoguApi.authFetchRaw('/protected/kogu/cfdi/validador-xml/validar/exportar-excel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: state.payloadFiles })
      });

      if (!response.ok) {
        const ct = response.headers.get('content-type') || '';
        let message = `Error ${response.status}`;
        try {
          const data = ct.includes('application/json') ? await response.json() : await response.text();
          message = data?.error?.message || data?.message || data?.error || (typeof data === 'string' ? data : message);
        } catch {}
        throw new Error(message);
      }

      await downloadBlobFromResponse(response, 'validador_xml.xls');
      KoguApi.toast('Excel exportado.', 'success');
    } catch (err) {
      KoguApi.toast(err.message || 'No fue posible exportar Excel.', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  }

  async function exportPdf() {
    if (!state.payloadFiles.length) {
      KoguApi.toast('Primero valida los XML antes de exportar.', 'warn');
      return;
    }

    const btn = document.getElementById('exportPdfBtn');
    const original = btn.textContent;

    try {
      btn.disabled = true;
      btn.textContent = 'Generando...';

      const response = await KoguApi.authFetchRaw('/protected/kogu/cfdi/validador-xml/validar/exportar-reporte', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: state.payloadFiles })
      });

      if (!response.ok) {
        const ct = response.headers.get('content-type') || '';
        let message = `Error ${response.status}`;
        try {
          const data = ct.includes('application/json') ? await response.json() : await response.text();
          message = data?.error?.message || data?.message || data?.error || (typeof data === 'string' ? data : message);
        } catch {}
        throw new Error(message);
      }

      const html = await response.text();
      const printWindow = window.open('', '_blank');

      if (!printWindow) {
        throw new Error('El navegador bloqueó la ventana emergente para generar el PDF.');
      }

      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.focus();

      setTimeout(() => {
        try {
          printWindow.print();
        } catch {}
      }, 500);

      KoguApi.toast('Reporte abierto para guardar como PDF.', 'success');
    } catch (err) {
      KoguApi.toast(err.message || 'No fue posible generar el PDF.', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  }

  async function validate() {
    if (!state.files.length) {
      KoguApi.toast('Selecciona al menos un XML.', 'warn');
      return;
    }

    const btn = document.getElementById('validateBtn');
    const original = btn.textContent;
    try {
      btn.disabled = true;
      btn.textContent = 'Validando...';
      document.getElementById('resultMessage').textContent = 'Procesando archivos...';

      const payloadFiles = await filesToPayload(state.files);
      state.payloadFiles = payloadFiles;

      const res = await KoguApi.apiFetch('/protected/kogu/cfdi/validador-xml/validar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: payloadFiles })
      });

      const data = KoguApi.unwrapData(res) || {};
      state.resultados = data.resultados || [];
      buildResume(data.resumen || {});
      renderRows();
      setExportButtons(state.resultados.length > 0);
      document.getElementById('resultMessage').textContent = `Resultados generados: ${KoguUi.int((data.resumen || {}).total_archivos || 0)} archivo(s).`;
      if (state.resultados.length) openDetail(0);
      KoguApi.toast('Validación terminada.', 'success');
    } catch (err) {
      KoguApi.toast(err.message || 'No fue posible validar los XML.', 'error');
      document.getElementById('resultMessage').textContent = err.message || 'No fue posible validar los XML.';
      state.resultados = [];
      state.payloadFiles = [];
      setExportButtons(false);
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  }

  document.getElementById('xmlFiles').onchange = (e) => {
    state.files = Array.from(e.target.files || []);
    state.payloadFiles = [];
    setExportButtons(false);
    document.getElementById('selectedInfo').textContent = state.files.length
      ? `${state.files.length} archivo(s) seleccionados.`
      : 'Sin archivos seleccionados.';
  };

  document.getElementById('validateBtn').onclick = validate;
  document.getElementById('exportExcelBtn').onclick = exportExcel;
  document.getElementById('exportPdfBtn').onclick = exportPdf;
  document.getElementById('clearBtn').onclick = () => {
    state.files = [];
    state.payloadFiles = [];
    state.resultados = [];
    document.getElementById('xmlFiles').value = '';
    document.getElementById('selectedInfo').textContent = 'Sin archivos seleccionados.';
    document.getElementById('resultMessage').textContent = 'Aún no hay validaciones ejecutadas.';
    buildResume({ total_archivos: 0, coincidencias: 0, con_diferencias: 0, no_encontrados: 0, invalidos: 0 });
    renderRows();
    setExportButtons(false);
    document.getElementById('detailCard').hidden = true;
  };

  setExportButtons(false);
});
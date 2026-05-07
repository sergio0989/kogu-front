document.addEventListener('DOMContentLoaded', async () => {
  const b = await KoguShell.initShell({
    currentPage: '/modules/cfdi/dashboard/resumen.html',
    title: 'Resumen de negocio y KPI',
    description: 'Primero periodo, después riesgo fiscal SAT, cancelabilidad e importes homologados a MXN con desglose adicional por moneda.',
    requiredPermission: 'screen.cfdi.sat_dm'
  });
  if (!b) return;

  // F-07: guard empresa activa — sin empresa no hay contexto para llamadas CFDI
  if (!b.empresa_activa) {
    KoguApi.toast('No hay empresa activa. Selecciona una empresa para continuar.', 'error');
    setTimeout(() => window.location.href = '/modules/core/contexto/cambio-empresa.html', 1200);
    return;
  }

  const c = document.getElementById('pageContent');
  c.innerHTML = `
    <div class="stack">
      <div class="card">
        <div class="row resumen-head">
          <div>
            <div class="eyebrow">Resumen de negocio</div>
            <h2>Filtros principales</h2>
          </div>
          <div class="page-actions">
            <button class="btn primary" id="applyBtn">Aplicar</button>
            <a class="btn" href="/modules/cfdi/solicitudes/solicitudes.html">Crear solicitud SAT</a>
            <button class="btn" id="exportBtn">Exportar Excel</button>
          </div>
        </div>

        <div class="grid-4" style="margin-top:16px">
          <div>
            <div class="label-text">Fecha inicial</div>
            <input class="input" id="fechaInicial" type="date">
          </div>
          <div>
            <div class="label-text">Fecha final</div>
            <input class="input" id="fechaFinal" type="date">
          </div>
          <div>
            <div class="label-text">Scope</div>
            <select class="select" id="scope">
              <option value="todos">Todos</option>
              <option value="emitidos">Emitidos</option>
              <option value="recibidos">Recibidos</option>
            </select>
          </div>
          <div>
            <div class="label-text">Método de pago</div>
            <select class="select" id="metodoPago">
              <option value="">Todos</option>
              <option value="PUE">PUE</option>
              <option value="PPD">PPD</option>
            </select>
          </div>
        </div>

        <div class="hero-note" style="margin-top:16px" id="empresaBox">Cargando empresa activa…</div>
      </div>

      <div class="grid-5" id="kpisTop"></div>

      <div class="grid-4" id="importesTop"></div>

      <div class="card">
        <div class="eyebrow">Importes ejecutivos</div>
        <h2>MXN homologado y moneda original</h2>
        <div id="importesEjecutivosBox" class="stack" style="margin-top:16px"></div>
      </div>

      <div class="card">
        <div class="eyebrow">Desglose ejecutivo</div>
        <h2>Origen / método</h2>
        <div id="desgloseEjecutivoBox" class="stack" style="margin-top:16px"></div>
      </div>

      <div class="split resumen-panels">
        <div class="card">
          <div class="eyebrow">Riesgo fiscal SAT</div>
          <h2>EFOS</h2>
          <div id="riesgoFiscalSat" class="stack" style="margin-top:16px"></div>
        </div>

        <div class="card">
          <div class="eyebrow">Cancelabilidad SAT</div>
          <h2>Estado de cancelación</h2>
          <div id="cancelabilidadSat" class="stack" style="margin-top:16px"></div>
        </div>
      </div>

      <div class="split resumen-panels">
        <div class="card">
          <div class="eyebrow">Clasificación fiscal</div>
          <h2>Método de pago</h2>
          <div id="clasificacionFiscal" class="stack" style="margin-top:16px"></div>
        </div>

        <div class="card">
          <div class="eyebrow">Composición operativa</div>
          <h2>Conteos complementarios</h2>
          <div id="composicionConteos" class="hero-note" style="margin-top:16px"></div>
        </div>
      </div>

      <div class="card">
        <div class="eyebrow">Interpretación</div>
        <h2>Lectura ejecutiva</h2>
        <div id="lecturaBox" class="stack" style="margin-top:16px"></div>
      </div>

      <div class="card">
        <div class="eyebrow">Alertas operativas</div>
        <h2>Seguimiento</h2>
        <div id="alertasBox" class="stack" style="margin-top:16px"></div>
      </div>
    </div>
  `;

  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  document.getElementById('fechaInicial').value = start.toISOString().slice(0, 10);
  document.getElementById('fechaFinal').value = now.toISOString().slice(0, 10);
  document.getElementById('scope').value = 'recibidos';

  function safeNumber(v) {
    const n = Number(v || 0);
    return Number.isFinite(n) ? n : 0;
  }

  function htmlText(value) {
    return KoguUi.escapeHtml(String(value ?? ''));
  }

  function buildMiniStat(label, value, hint = '', tone = 'neutral') {
    return `
      <div class="mini-stat tone-${tone}">
        <div class="mini-stat-k">${htmlText(label)}</div>
        <div class="mini-stat-v">${value}</div>
        ${hint ? `<div class="mini-stat-h">${htmlText(hint)}</div>` : ''}
      </div>
    `;
  }

  function buildMoneyStat(label, amount, currency, hint = '', tone = 'neutral') {
    return `
      <div class="mini-stat tone-${tone}">
        <div class="mini-stat-k">${htmlText(label)}</div>
        <div class="mini-stat-v inline-currency">
          <span>${KoguUi.money(amount)}</span>
          <span class="currency-inline">${htmlText(currency)}</span>
        </div>
        ${hint ? `<div class="mini-stat-h">${htmlText(hint)}</div>` : ''}
      </div>
    `;
  }

  function buildBar(label, value, total, tone = 'primary') {
    const pct = total > 0 ? Math.max(0, Math.min(100, (value / total) * 100)) : 0;
    return `
      <div class="bar-row">
        <div class="bar-label">${htmlText(label)}</div>
        <div class="bar-track"><div class="bar-fill ${tone}" style="width:${pct.toFixed(1)}%"></div></div>
        <div class="bar-value">${KoguUi.int(value)}</div>
      </div>
    `;
  }

  function metricCell(label, value) {
    return `
      <div class="desglose-metric">
        <span>${htmlText(label)}</span>
        <strong>${htmlText(value)}</strong>
      </div>
    `;
  }

  function moneyPairCell(label, mxn, usd) {
    return `
      <div class="desglose-metric dual">
        <span>${htmlText(label)}</span>
        <strong>
          <span>${KoguUi.money(mxn)} MXN</span>
          <span class="desglose-sub">${KoguUi.money(usd)} USD</span>
        </strong>
      </div>
    `;
  }

  function buildDesglosePanel(title, block) {
    const vigentes = safeNumber(block?.vigentes);
    const subtotalMxn = safeNumber(block?.mxn?.subtotal);
    const trasladoMxn = safeNumber(block?.mxn?.traslado);
    const retenidoMxn = safeNumber(block?.mxn?.retenido);
    const totalMxn = safeNumber(block?.mxn?.total);

    const subtotalUsd = safeNumber(block?.usd?.subtotal);
    const trasladoUsd = safeNumber(block?.usd?.traslado);
    const retenidoUsd = safeNumber(block?.usd?.retenido);
    const totalUsd = safeNumber(block?.usd?.total);

    return `
      <div class="desglose-panel">
        <h3>${htmlText(title)}</h3>
        <div class="desglose-grid">
          ${metricCell('CFDI vig.', KoguUi.int(vigentes))}
          ${moneyPairCell('Subtotal', subtotalMxn, subtotalUsd)}
          ${moneyPairCell('Traslado', trasladoMxn, trasladoUsd)}
          ${moneyPairCell('Retenido', retenidoMxn, retenidoUsd)}
          ${moneyPairCell('Total', totalMxn, totalUsd)}
        </div>
      </div>
    `;
  }

  function buildQueryString() {
    return KoguUi.queryParams({
      date_from: document.getElementById('fechaInicial').value,
      date_to: document.getElementById('fechaFinal').value,
      scope: document.getElementById('scope').value,
      metodo_pago: document.getElementById('metodoPago').value
    });
  }

  function buildExportFilters() {
    const fechaInicial = document.getElementById('fechaInicial').value;
    const fechaFinal = document.getElementById('fechaFinal').value;
    const scope = document.getElementById('scope').value;
    const metodoPago = document.getElementById('metodoPago').value;

    return {
      date_from: fechaInicial,
      date_to: fechaFinal,
      scope,
      metodo_pago: metodoPago,
      dateStart: fechaInicial,
      dateEnd: fechaFinal,
      metodoPago
    };
  }

  async function load() {
    const qs = buildQueryString();

    const [resumenResp, corpResp, alertasResp] = await Promise.all([
      KoguApi.apiFetch('/protected/kogu/cfdi/negocio/resumen?' + qs),
      KoguApi.apiFetch('/protected/kogu/cfdi/dashboard/resumen-corporativo?' + qs),
      KoguApi.apiFetch('/protected/kogu/cfdi/alertas/resumen')
    ]);

    const resumen = KoguApi.unwrapData(resumenResp);
    const corporativo = KoguApi.unwrapData(corpResp);
    const alertas = KoguApi.unwrapData(alertasResp);

    const empresa = resumen.empresa || corporativo.empresa || {};
    const totalCfdi = safeNumber(corporativo.total_cfdi ?? resumen.cfdi_totales ?? 0);

    const resumenMoneda = resumen.resumen_por_moneda || {};
    const mxn = resumenMoneda.mxn || {};
    const usd = resumenMoneda.usd || {};
    const homologado = resumen.homologado_mxn || {};
    const desglose = resumen.desglose_ejecutivo || {};

    const sinAlertaEfos = safeNumber(
      resumen.kpis_top?.sin_alerta_efos ??
      corporativo.kpis_top?.sin_alerta_efos ??
      resumen.riesgo_fiscal_sat?.sin_alerta ??
      corporativo.riesgo_fiscal_sat?.sin_alerta
    );

    const revisionFiscal = safeNumber(
      resumen.kpis_top?.revision_fiscal ??
      corporativo.kpis_top?.revision_fiscal ??
      resumen.riesgo_fiscal_sat?.revision_fiscal ??
      corporativo.riesgo_fiscal_sat?.revision_fiscal
    );

    const alertaEfos = safeNumber(
      resumen.kpis_top?.alerta_efos ??
      corporativo.kpis_top?.alerta_efos ??
      resumen.riesgo_fiscal_sat?.alerta_efos ??
      corporativo.riesgo_fiscal_sat?.alerta_efos
    );

    const importeComprometido = safeNumber(
      resumen.kpis_top?.importe_comprometido ??
      corporativo.kpis_top?.importe_comprometido ??
      resumen.riesgo_fiscal_sat?.importe_comprometido ??
      corporativo.riesgo_fiscal_sat?.importe_comprometido
    );

    const subtotalHomologadoMxn = safeNumber(homologado.subtotal ?? resumen.subtotal_vigente ?? 0);
    const trasladosHomologadoMxn = safeNumber(homologado.traslado ?? resumen.traslado_vigente ?? 0);
    const retenidosHomologadoMxn = safeNumber(homologado.retenido ?? resumen.retenido_vigente ?? 0);
    const totalHomologadoMxn = safeNumber(homologado.total ?? resumen.total_vigente ?? 0);
    const usdSinTc = safeNumber(homologado.usd_sin_tipo_cambio ?? 0);

    const subtotalVigMxn = safeNumber(mxn.subtotal ?? 0);
    const trasladosVigMxn = safeNumber(mxn.traslado ?? 0);
    const retenidosVigMxn = safeNumber(mxn.retenido ?? 0);
    const totalVigMxn = safeNumber(mxn.total ?? 0);

    const subtotalVigUsd = safeNumber(usd.subtotal ?? 0);
    const trasladosVigUsd = safeNumber(usd.traslado ?? 0);
    const retenidosVigUsd = safeNumber(usd.retenido ?? 0);
    const totalVigUsd = safeNumber(usd.total ?? 0);

    const vigentesMxn = safeNumber(mxn.vigentes ?? 0);
    const vigentesUsd = safeNumber(usd.vigentes ?? 0);

    const noCancelable = safeNumber(
      resumen.cancelabilidad?.no_cancelable ??
      corporativo.cancelabilidad?.no_cancelable
    );
    const sinAceptacion = safeNumber(
      resumen.cancelabilidad?.sin_aceptacion ??
      corporativo.cancelabilidad?.sin_aceptacion
    );
    const conAceptacion = safeNumber(
      resumen.cancelabilidad?.con_aceptacion ??
      corporativo.cancelabilidad?.con_aceptacion
    );

    const vigentes = safeNumber(corporativo.vigentes ?? resumen.cfdi_vigentes ?? resumen.vigentes);
    const cancelados = safeNumber(corporativo.cancelados ?? resumen.cfdi_cancelados ?? resumen.cancelados);
    const emitidos = safeNumber(corporativo.emitidos ?? resumen.emitidos);
    const recibidos = safeNumber(corporativo.recibidos ?? resumen.recibidos);

    const pue = safeNumber(resumen.pue);
    const ppd = safeNumber(resumen.ppd);

    document.getElementById('empresaBox').innerHTML = `
      <strong>Empresa activa:</strong> ${htmlText(empresa.nombre_corto || empresa.razon_social || 'Sin empresa')} ·
      <strong>RFC:</strong> ${htmlText(empresa.rfc || 'Sin RFC')} ·
      <strong>Periodo:</strong> ${htmlText(document.getElementById('fechaInicial').value)} → ${htmlText(document.getElementById('fechaFinal').value)}
    `;

    const kpis = [
      ['CFDI consultados', KoguUi.int(totalCfdi), 'Base del periodo'],
      ['Total vigente homologado MXN', KoguUi.money(totalHomologadoMxn), 'Lectura ejecutiva'],
      ['Casos en revisión', KoguUi.int(revisionFiscal), 'Seguimiento fiscal'],
      ['Alerta EFOS', KoguUi.int(alertaEfos), 'Prioridad alta'],
      ['Importe comprometido', KoguUi.money(importeComprometido), 'Vigentes en revisión/alerta']
    ];
    document.getElementById('kpisTop').innerHTML = kpis.map(x => KoguUi.cardStat(x[0], x[1], x[2])).join('');

    const importes = [
      ['Subtotal homologado MXN', KoguUi.money(subtotalHomologadoMxn), 'Vigentes con TC aplicado cuando corresponde'],
      ['Traslados homologados MXN', KoguUi.money(trasladosHomologadoMxn), 'Impuestos trasladados'],
      ['Retenidos homologados MXN', KoguUi.money(retenidosHomologadoMxn), 'Impuestos retenidos']
    ];
    document.getElementById('importesTop').innerHTML = importes.map(x => KoguUi.cardStat(x[0], x[1], x[2])).join('');

    document.getElementById('importesEjecutivosBox').innerHTML = `
      <div class="ejecutivo-layout">
        <div class="ejecutivo-col ejecutivo-col-main">
          <div class="eyebrow">MXN homologado</div>
          <h3>Lectura ejecutiva principal</h3>
          <div class="ejecutivo-stats-grid">
            ${buildMiniStat('Subtotal homologado', KoguUi.money(subtotalHomologadoMxn), 'Homologado a MXN', 'neutral')}
            ${buildMiniStat('Traslados homologados', KoguUi.money(trasladosHomologadoMxn), 'Homologado a MXN', 'neutral')}
            ${buildMiniStat('Retenidos homologados', KoguUi.money(retenidosHomologadoMxn), 'Homologado a MXN', 'neutral')}
            ${buildMiniStat('Total homologado', KoguUi.money(totalHomologadoMxn), 'Lectura principal del tablero', 'success')}
          </div>
          <div class="hero-note">
            La lectura principal del tablero ya se presenta en <strong>MXN homologado</strong>. Los CFDI en USD se convierten con <strong>tipo de cambio</strong> cuando está disponible.
            ${usdSinTc > 0 ? `<br><strong>Atención:</strong> existen ${KoguUi.int(usdSinTc)} CFDI en USD sin tipo de cambio válido; se excluyen de la homologación para no distorsionar los KPI.` : ''}
          </div>
        </div>

        <div class="ejecutivo-col">
          <div class="eyebrow">Moneda original MXN</div>
          <h3>Operación en pesos</h3>
          <div class="ejecutivo-stats-grid ejecutivo-stats-grid-compact">
            ${buildMiniStat('Vigentes MXN', KoguUi.int(vigentesMxn), 'Conteo en pesos', 'neutral')}
            ${buildMiniStat('Subtotal MXN', KoguUi.money(subtotalVigMxn), 'Importe base en pesos', 'neutral')}
            ${buildMiniStat('Traslados MXN', KoguUi.money(trasladosVigMxn), 'Impuestos trasladados', 'neutral')}
            ${buildMiniStat('Retenidos MXN', KoguUi.money(retenidosVigMxn), 'Impuestos retenidos', 'neutral')}
            ${buildMiniStat('Total MXN', KoguUi.money(totalVigMxn), 'Monto vigente en pesos', 'success')}
          </div>
        </div>

        <div class="ejecutivo-col">
          <div class="eyebrow">Moneda original USD</div>
          <h3>Operación en dólares</h3>
          <div class="ejecutivo-stats-grid ejecutivo-stats-grid-compact">
            ${buildMiniStat('Vigentes USD', KoguUi.int(vigentesUsd), 'Conteo en dólares', 'warn')}
            ${buildMoneyStat('Subtotal USD', subtotalVigUsd, 'USD', 'Importe base en dólares')}
            ${buildMoneyStat('Traslados USD', trasladosVigUsd, 'USD', 'Impuestos trasladados')}
            ${buildMoneyStat('Retenidos USD', retenidosVigUsd, 'USD', 'Impuestos retenidos')}
            ${buildMoneyStat('Total USD', totalVigUsd, 'USD', 'Monto vigente en dólares')}
          </div>
        </div>
      </div>
    `;

    const desgloseBox = document.getElementById('desgloseEjecutivoBox');
    if (desgloseBox) {
      desgloseBox.innerHTML = `
        <div class="desglose-ejecutivo-grid">
          ${buildDesglosePanel('EMITIDO · PUE', desglose.emitido_pue)}
          ${buildDesglosePanel('EMITIDO · PPD', desglose.emitido_ppd)}
          ${buildDesglosePanel('RECIBIDO · PUE', desglose.recibido_pue)}
          ${buildDesglosePanel('RECIBIDO · PPD', desglose.recibido_ppd)}
        </div>
      `;
    }

    document.getElementById('riesgoFiscalSat').innerHTML = `
      ${buildBar('Sin alerta', sinAlertaEfos, totalCfdi, 'success')}
      ${buildBar('Revisión fiscal', revisionFiscal, totalCfdi, 'warn')}
      ${buildBar('Alerta EFOS', alertaEfos, totalCfdi, 'danger')}
      <div class="hero-note">
        La priorización fiscal agrupa EFOS así: <strong>200 = Sin alerta</strong>, <strong>101/201 = Revisión fiscal</strong> y <strong>100 = Alerta EFOS</strong>.
      </div>
    `;

    document.getElementById('cancelabilidadSat').innerHTML = `
      ${buildBar('No cancelable', noCancelable, totalCfdi, 'danger')}
      ${buildBar('Sin aceptación', sinAceptacion, totalCfdi, 'warn')}
      ${buildBar('Con aceptación', conAceptacion, totalCfdi, 'success')}
      <div class="hero-note">
        Cancelabilidad y EFOS se leen como ejes distintos. EFOS domina la prioridad visual cuando existe riesgo fiscal.
      </div>
    `;

    document.getElementById('clasificacionFiscal').innerHTML = `
      ${buildMiniStat('PUE', KoguUi.int(pue), 'Conteo por método', 'neutral')}
      ${buildMiniStat('PPD', KoguUi.int(ppd), 'Conteo por método', 'neutral')}
      ${buildMiniStat('Vigentes MXN', KoguUi.int(vigentesMxn), 'Conteo moneda MXN', 'neutral')}
      ${buildMiniStat('Vigentes USD', KoguUi.int(vigentesUsd), 'Conteo moneda USD', 'warn')}
    `;

    document.getElementById('composicionConteos').innerHTML = `
      ${buildBar('Vigentes', vigentes, totalCfdi, 'success')}
      ${buildBar('Cancelados', cancelados, totalCfdi, 'danger')}
      ${buildBar('Emitidos', emitidos, totalCfdi, 'primary')}
      ${buildBar('Recibidos', recibidos, totalCfdi, 'primary')}
    `;

    const scopeLabel = document.getElementById('scope').value || 'todos';
    const metodoLabel = document.getElementById('metodoPago').value || 'Todos';
    const hayUsd = totalVigUsd > 0 || vigentesUsd > 0;

    document.getElementById('lecturaBox').innerHTML = `
      <div class="hero-note">
        El tablero está filtrado por <strong>${htmlText(scopeLabel)}</strong> y método de pago <strong>${htmlText(metodoLabel)}</strong>.
        El monto principal del periodo en <strong>MXN homologado</strong> es <strong>${KoguUi.money(totalHomologadoMxn)}</strong>, construido con CFDI <strong>vigentes</strong>.
        ${hayUsd ? `Además, existe operación en <strong>USD</strong> por <strong>${KoguUi.money(totalVigUsd)} USD</strong>, la cual ya se presenta por separado en moneda original.` : 'No se detectaron importes vigentes en USD para el periodo filtrado.'}
        En riesgo fiscal SAT se observan <strong>${KoguUi.int(revisionFiscal)}</strong> casos en revisión, <strong>${KoguUi.int(alertaEfos)}</strong> con alerta EFOS y un <strong>importe comprometido de ${KoguUi.money(importeComprometido)}</strong>.
      </div>
    `;

    document.getElementById('alertasBox').innerHTML = `
      ${buildMiniStat('Solicitudes activas', KoguUi.int(corporativo.solicitudes_activas || 0), 'Operación SAT', 'neutral')}
      ${buildMiniStat('Paquetes pendientes', KoguUi.int(corporativo.paquetes_pendientes || 0), 'Descarga / proceso', 'neutral')}
      ${buildMiniStat('Credenciales por vencer', KoguUi.int(alertas.credenciales_por_vencer || 0), 'Certificados / FIEL', 'warn')}
      ${buildMiniStat('Solicitudes con error', KoguUi.int(alertas.solicitudes_con_error || 0), 'Seguimiento', 'warn')}
      ${buildMiniStat('Paquetes con error', KoguUi.int(alertas.paquetes_con_error || 0), 'Corrección', 'danger')}
      ${buildMiniStat('Total alertas', KoguUi.int(alertas.total_alertas || 0), 'Semáforo general', 'danger')}
    `;
  }

  async function exportExcel() {
    const btn = document.getElementById('exportBtn');
    const original = btn.textContent;

    try {
      btn.disabled = true;
      btn.textContent = 'Exportando...';

      const filters = buildExportFilters();

      const queryNew = KoguUi.queryParams({
        dateStart: filters.dateStart,
        dateEnd: filters.dateEnd,
        scope: filters.scope,
        metodoPago: filters.metodoPago
      });

      const queryOld = KoguUi.queryParams({
        date_from: filters.date_from,
        date_to: filters.date_to,
        scope: filters.scope,
        metodo_pago: filters.metodo_pago
      });

      const candidatePaths = [
        '/protected/kogu/cfdi/negocio/exportar-excel?' + queryOld,
        '/cfdi/protected/cfdi/facturas/exportar-excel?' + queryNew
      ];

      let response = null;
      let lastMessage = 'No fue posible exportar el Excel';

      for (const path of candidatePaths) {
        const resp = await KoguApi.authFetchRaw(path, {
          method: 'GET',
          headers: {
            Accept: 'application/vnd.ms-excel, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/octet-stream, */*'
          }
        });

        if (resp.ok) {
          response = resp;
          break;
        }

        try {
          const err = await resp.clone().json();
          lastMessage = err?.error?.message || err?.message || lastMessage;
        } catch (_e) {
          // ignore non-json response
        }
      }

      if (!response) {
        throw new Error(lastMessage);
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;

      const fechaIni = document.getElementById('fechaInicial').value || 'inicio';
      const fechaFin = document.getElementById('fechaFinal').value || 'fin';
      const scope = document.getElementById('scope').value || 'todos';
      a.download = `cfdi_resumen_${scope}_${fechaIni}_${fechaFin}.xls`;

      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);

      KoguApi.toast('Excel generado correctamente', 'success');
    } catch (err) {
      KoguApi.toast(err.message || 'No fue posible exportar el Excel', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  }

  document.getElementById('applyBtn').onclick = () => KoguUi.withLoading(document.getElementById('applyBtn'), () => load().catch(err => KoguApi.toast(err.message, 'error')), 'Aplicando...'); // F-12
  document.getElementById('exportBtn').onclick = () => exportExcel();

  KoguShell.subscribeEmpresaActivaChange(async () => {
    try {
      await load();
      KoguApi.toast('Resumen actualizado por cambio de empresa', 'success');
    } catch (err) {
      KoguApi.toast(err.message || 'No fue posible actualizar el resumen', 'error');
    }
  });

  await load();
});

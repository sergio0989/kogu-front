'use strict';
/* eslint-disable no-undef */
/**
 * Pantalla: Conciliación CFDI vs ERP
 * Endpoint: POST /protected/kogu/cfdi/conciliacion/erp
 * Permiso:  screen.cfdi.sat_dm (mismo que el resto de Negocio CFDI)
 */
(function () {
  const PAGE_PATH = '/modules/cfdi/conciliacion/conciliacion-erp.html';
  const ENDPOINT  = '/protected/kogu/cfdi/conciliacion/erp';
  const MESES = [
    'Enero','Febrero','Marzo','Abril','Mayo','Junio',
    'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
  ];

  let ultimoResultado = null;
  let tabActiva = 'faltantes';
  // Filtro local de la pestaña "Todos los CFDI" — todos | en_erp | faltantes
  let filtroTodos = 'todos';

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
    ));
  }

  function fmtMoneda(n, mon) {
    if (n == null || n === '') return '';
    const v = Number(n);
    if (Number.isNaN(v)) return String(n);
    const m = (mon || '').toUpperCase();
    return v.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + (m ? ' ' + m : '');
  }

  function fmtFecha(s) {
    if (!s) return '';
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return String(s).slice(0, 10);
    return d.toISOString().slice(0, 10);
  }

  function renderForm() {
    const hoy = new Date();
    const anioActual = hoy.getFullYear();
    const mesActual  = hoy.getMonth() + 1;

    const anios = [];
    for (let a = anioActual + 1; a >= anioActual - 3; a--) anios.push(a);

    const html = `
      <section class="card" id="card-form">
        <h3>Parámetros</h3>
        <p class="muted" style="margin-top:-4px">
          Sube el reporte de compras del ERP del periodo y obtén los CFDI recibidos
          que aún no se han capturado. El archivo no se guarda — sólo queda registrado
          el evento en la bitácora con los conteos del resultado.
        </p>
        <div class="form-row" style="display:flex;gap:14px;flex-wrap:wrap;align-items:flex-end">
          <div class="form-col">
            <div class="label-text">Año</div>
            <select id="fAnio" class="input">
              ${anios.map((a) => `<option value="${a}" ${a === anioActual ? 'selected' : ''}>${a}</option>`).join('')}
            </select>
          </div>
          <div class="form-col">
            <div class="label-text">Mes</div>
            <select id="fMes" class="input">
              ${MESES.map((m, i) => `<option value="${i + 1}" ${i + 1 === mesActual ? 'selected' : ''}>${m}</option>`).join('')}
            </select>
          </div>
          <div class="form-col form-col-wide" style="flex:1;min-width:240px">
            <div class="label-text">Archivo de compras (.xlsx)</div>
            <input id="fArchivo" type="file" accept=".xlsx,.xls,.xlsm" class="input">
          </div>
        </div>
        <div class="form-actions" style="margin-top:14px">
          <button id="btnConciliar" class="btn primary">Conciliar</button>
          <button id="btnLimpiar" class="btn ghost" style="margin-left:6px">Limpiar</button>
          <span id="formMsg" class="muted" style="margin-left:12px"></span>
        </div>
      </section>

      <section id="seccionResultado" style="display:none">
        <div class="card" id="card-resumen"></div>

        <div class="card" id="card-detalle">
          <div class="tabs" id="cfTabs">
            <button class="tab active" data-tab="faltantes">Faltantes en ERP</button>
            <button class="tab"        data-tab="moneda">Discrepancias de moneda</button>
            <button class="tab"        data-tab="excluidos">Excluidos (no UUID)</button>
            <button class="tab"        data-tab="todos">Todos los CFDI</button>
          </div>
          <div id="cfPanel"></div>
          <div class="form-actions" style="margin-top:14px">
            <button id="btnExportar" class="btn ghost">Exportar resultado a Excel</button>
          </div>
        </div>
      </section>
    `;
    $('pageContent').innerHTML = html;

    $('btnConciliar').addEventListener('click', ejecutar);
    $('btnLimpiar').addEventListener('click', limpiar);
    $('btnExportar').addEventListener('click', exportar);
    document.querySelectorAll('#cfTabs .tab').forEach((t) => {
      t.addEventListener('click', () => {
        tabActiva = t.dataset.tab;
        document.querySelectorAll('#cfTabs .tab').forEach((x) => x.classList.toggle('active', x === t));
        renderPanel();
      });
    });
  }

  function limpiar() {
    const arch = $('fArchivo'); if (arch) arch.value = '';
    const msg = $('formMsg'); if (msg) msg.textContent = '';
    const sec = $('seccionResultado'); if (sec) sec.style.display = 'none';
    ultimoResultado = null;
  }

  async function ejecutar() {
    const anio    = parseInt($('fAnio').value, 10);
    const mes     = parseInt($('fMes').value, 10);
    const archivo = $('fArchivo').files[0];

    if (!archivo) {
      $('formMsg').textContent = 'Selecciona el archivo de compras del ERP.';
      KoguApi.toast && KoguApi.toast('Selecciona el archivo del ERP', 'warn');
      return;
    }

    const btn = $('btnConciliar');
    btn.disabled = true;
    btn.textContent = 'Procesando…';
    $('formMsg').textContent = '';

    try {
      const fd = new FormData();
      fd.append('anio', String(anio));
      fd.append('mes',  String(mes));
      fd.append('archivo', archivo);

      // authFetchRaw para multipart (apiFetch fijaría Content-Type JSON).
      const resp = await KoguApi.authFetchRaw(ENDPOINT, { method: 'POST', body: fd });
      const body = await resp.json().catch(() => ({}));

      if (!resp.ok || !body.ok) {
        const msg = (body && body.error && body.error.message) || (body && body.message) || ('Error ' + resp.status);
        $('formMsg').innerHTML = '<span style="color:#c0392b">⚠ ' + esc(msg) + '</span>';
        KoguApi.toast && KoguApi.toast(msg, 'error');
        return;
      }

      ultimoResultado = body.data;
      renderResultado();
      KoguApi.toast && KoguApi.toast('Conciliación completa', 'success');
    } catch (e) {
      console.error(e);
      $('formMsg').innerHTML = '<span style="color:#c0392b">⚠ Error de red o servidor</span>';
      KoguApi.toast && KoguApi.toast('Error de red o servidor', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Conciliar';
    }
  }

  function renderResultado() {
    const r = ultimoResultado;
    if (!r) return;
    const { resumen, meta } = r;

    const semaforo =
      resumen.faltantes_erp > 0 ? { lbl: 'CON FALTANTES', col: '#c0392b' } :
      resumen.discrepancias_moneda > 0 ? { lbl: 'OBSERVADO', col: '#b07207' } :
      { lbl: 'CONCILIADO', col: '#1c7a3e' };

    $('card-resumen').innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
        <div>
          <h3 style="margin:0">Resultado — ${esc(MESES[meta.mes - 1])} ${meta.anio}</h3>
          <div class="muted" style="font-size:12px;margin-top:2px">
            Archivo: ${esc(meta.archivo_nombre || '—')} · ${(meta.archivo_tamano_bytes / 1024).toFixed(0)} KB ·
            Procesado en ${meta.duracion_ms} ms · Bitácora: ${meta.log_id ? esc(meta.log_id) : '(no registrada)'}
          </div>
        </div>
        <div style="background:${semaforo.col};color:#fff;padding:6px 14px;border-radius:18px;font-weight:700;font-size:12px;letter-spacing:.4px">
          ${semaforo.lbl}
        </div>
      </div>
      <div class="kpi-strip" style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap">
        ${kpiBox(resumen.archivo_filas,       'Filas en archivo')}
        ${kpiBox(resumen.archivo_uuids,       'Con UUID')}
        ${kpiBox(resumen.archivo_excluidos,   'Excluidos')}
        ${kpiBox(resumen.kogu_periodo,        'CFDI recibidos en KOGU')}
        ${kpiBox(resumen.faltantes_erp,       'Faltantes en ERP', resumen.faltantes_erp > 0 ? '#c0392b' : null)}
        ${kpiBox(resumen.discrepancias_moneda,'Discrepancias moneda', resumen.discrepancias_moneda > 0 ? '#b07207' : null)}
        ${kpiBox((resumen.pct_cobertura_erp != null ? resumen.pct_cobertura_erp + '%' : '—'), 'Cobertura ERP', (resumen.pct_cobertura_erp != null && resumen.pct_cobertura_erp < 100) ? '#b07207' : '#1c7a3e')}
      </div>
    `;

    $('seccionResultado').style.display = '';
    tabActiva = 'faltantes';
    document.querySelectorAll('#cfTabs .tab').forEach((t) =>
      t.classList.toggle('active', t.dataset.tab === 'faltantes'),
    );
    renderPanel();
  }

  function kpiBox(n, lbl, color) {
    return `
      <div style="flex:1;min-width:140px;background:#fff;border:1px solid var(--line, #e2e8f0);border-radius:9px;padding:10px 13px">
        <div style="font-size:21px;font-weight:700;line-height:1;${color ? 'color:' + color : ''}">${n}</div>
        <div style="font-size:10.5px;color:#64748b;text-transform:uppercase;letter-spacing:.4px;margin-top:4px">${esc(lbl)}</div>
      </div>
    `;
  }

  function renderPanel() {
    const r = ultimoResultado;
    if (!r) return;

    if (tabActiva === 'faltantes') {
      renderTabla(
        'Faltantes en ERP — CFDI recibidos en KOGU que no aparecen en el reporte del ERP',
        r.faltantes_erp,
        [
          { k: 'fecha_emision',  l: 'Fecha',   fn: fmtFecha },
          { k: 'uuid',           l: 'UUID' },
          { k: 'serie',          l: 'Serie' },
          { k: 'folio',          l: 'Folio' },
          { k: 'rfc_emisor',     l: 'RFC emisor' },
          { k: 'nombre_emisor',  l: 'Emisor' },
          { k: 'moneda',         l: 'Moneda' },
          { k: 'total',          l: 'Total', align: 'right', fn: (v, row) => fmtMoneda(v, row.moneda) },
        ],
        'No hay faltantes. Todos los CFDI recibidos del periodo están registrados en el ERP.',
      );
      return;
    }

    if (tabActiva === 'moneda') {
      renderTabla(
        'Discrepancias de moneda — UUIDs que cruzan pero su moneda no coincide',
        r.discrepancias_moneda,
        [
          { k: 'uuid',           l: 'UUID' },
          { k: 'serie',          l: 'Serie' },
          { k: 'folio',          l: 'Folio' },
          { k: 'rfc_emisor',     l: 'RFC emisor' },
          { k: 'nombre_emisor',  l: 'Emisor' },
          { k: 'moneda_cfdi',    l: 'Moneda CFDI' },
          { k: 'moneda_erp',     l: 'Moneda ERP' },
          { k: 'moneda_erp_raw', l: 'ERP (raw)' },
          { k: 'no_facc',        l: 'No_facc ERP' },
        ],
        'Sin discrepancias de moneda en los UUIDs cruzados.',
      );
      return;
    }

    if (tabActiva === 'excluidos') {
      renderTabla(
        'Excluidos — renglones del ERP cuyo Vmfolio no es un UUID (facturas directas, extranjeras o sin folio)',
        r.excluidos,
        [
          { k: 'no_facc',   l: 'No_facc' },
          { k: 'vmfolio',   l: 'Vmfolio (raw)' },
          { k: 'cve_prov',  l: 'Cve_prov' },
          { k: 'nom_prov',  l: 'Proveedor' },
          { k: 'des_mon',   l: 'Moneda' },
          { k: 'total_fac', l: 'Total', align: 'right', fn: fmtMoneda },
          { k: 'motivo',    l: 'Motivo' },
        ],
        'No hay renglones excluidos — todos los Vmfolio del archivo son UUID válidos.',
      );
      return;
    }

    // todos los CFDI del periodo con flag de estado (v1.1)
    renderTablaTodos(r);
  }

  /**
   * Renderiza la pestaña "Todos los CFDI": universo completo del periodo con
   * 3 botones de filtro (todos / en_erp / faltantes) y tabla con badge de
   * estado, datos del lado ERP cuando matchea y diferencia de monto.
   */
  function renderTablaTodos(r) {
    const universo = Array.isArray(r.cfdi_periodo_estado) ? r.cfdi_periodo_estado : [];
    const enErp     = universo.filter((x) => x.en_erp).length;
    const faltantes = universo.length - enErp;

    let h = '';
    h += '<h4 style="margin:2px 0 10px">';
    h += 'Todos los CFDI del periodo — universo completo cruzado contra el archivo del ERP';
    h += '</h4>';
    h += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;align-items:center">';
    h += filterBtn('todos',     `Todos (${universo.length})`,        filtroTodos === 'todos');
    h += filterBtn('en_erp',    `En ERP (${enErp})`,                  filtroTodos === 'en_erp');
    h += filterBtn('faltantes', `Faltantes (${faltantes})`,           filtroTodos === 'faltantes');
    h += '</div>';

    const filas = universo.filter((x) => (
      filtroTodos === 'todos'     ? true :
      filtroTodos === 'en_erp'    ? x.en_erp :
      filtroTodos === 'faltantes' ? !x.en_erp :
      true
    ));

    if (filas.length === 0) {
      h += '<div class="empty" style="text-align:center;padding:24px;color:#64748b;font-size:13px">';
      h += filtroTodos === 'faltantes'
        ? 'No hay faltantes — todos los CFDI del periodo están en el archivo del ERP.'
        : filtroTodos === 'en_erp'
        ? 'Ningún CFDI del periodo aparece en el archivo del ERP.'
        : 'No hay CFDI recibidos en el periodo seleccionado.';
      h += '</div>';
    } else {
      h += '<div style="overflow-x:auto"><table class="table" style="width:100%;border-collapse:collapse;font-size:12.5px">';
      h += '<thead><tr>';
      ['Fecha','UUID','Serie','Folio','RFC emisor','Emisor','Moneda','Total CFDI',
       'Estado','No_facc ERP','Total ERP','Moneda ERP','Diferencia']
        .forEach((label, idx) => {
          const align = (idx >= 7 && idx !== 8 && idx !== 9 && idx !== 11) ? 'right' : 'left';
          h += '<th style="text-align:' + align + ';padding:8px 10px;border-bottom:2px solid #e2e8f0;background:#f8fafc;font-weight:700;font-size:11.5px;text-transform:uppercase;letter-spacing:.3px">' + esc(label) + '</th>';
        });
      h += '</tr></thead><tbody>';

      filas.forEach((x) => {
        const tdL = 'style="text-align:left;padding:7px 10px;border-bottom:1px solid #eef1f5"';
        const tdR = 'style="text-align:right;padding:7px 10px;border-bottom:1px solid #eef1f5"';
        const tdC = 'style="text-align:center;padding:7px 10px;border-bottom:1px solid #eef1f5"';
        h += '<tr>';
        h += `<td ${tdL}>${esc(fmtFecha(x.fecha_emision))}</td>`;
        h += `<td ${tdL}><span style="font-family:monospace;font-size:11.5px">${esc(x.uuid)}</span></td>`;
        h += `<td ${tdL}>${esc(x.serie)}</td>`;
        h += `<td ${tdL}>${esc(x.folio)}</td>`;
        h += `<td ${tdL}>${esc(x.rfc_emisor)}</td>`;
        h += `<td ${tdL}>${esc(x.nombre_emisor)}</td>`;
        h += `<td ${tdL}>${esc(x.moneda)}</td>`;
        h += `<td ${tdR}>${esc(fmtMoneda(x.total, x.moneda))}</td>`;
        h += `<td ${tdC}>${badgeEstado(x.en_erp)}</td>`;
        h += `<td ${tdL}>${esc(x.no_facc_erp == null ? '' : x.no_facc_erp)}</td>`;
        h += `<td ${tdR}>${x.total_erp == null ? '<span class="muted">—</span>' : esc(fmtMoneda(x.total_erp, x.moneda_erp))}</td>`;
        h += `<td ${tdL}>${esc(x.moneda_erp == null ? '' : x.moneda_erp)}</td>`;
        h += `<td ${tdR}>${renderDiferencia(x.diferencia_monto, x.moneda)}</td>`;
        h += '</tr>';
      });
      h += '</tbody></table></div>';
    }

    $('cfPanel').innerHTML = h;

    // Bind botones de filtro
    document.querySelectorAll('#cfPanel button[data-filtro]').forEach((b) => {
      b.addEventListener('click', () => {
        filtroTodos = b.dataset.filtro;
        renderPanel();
      });
    });
  }

  function filterBtn(value, label, active) {
    const base = 'padding:6px 12px;border-radius:18px;font-size:12px;font-weight:600;cursor:pointer;border:1px solid';
    const style = active
      ? `${base} #0f172a;background:#0f172a;color:#fff`
      : `${base} #cbd5e1;background:#fff;color:#0f172a`;
    return `<button type="button" data-filtro="${value}" style="${style}">${esc(label)}</button>`;
  }

  function badgeEstado(enErp) {
    const verde = 'background:#dcfce7;color:#15803d;border:1px solid #86efac';
    const rojo  = 'background:#fee2e2;color:#b91c1c;border:1px solid #fca5a5';
    const style = `padding:3px 9px;border-radius:11px;font-size:11px;font-weight:700;letter-spacing:.3px;${enErp ? verde : rojo}`;
    return `<span style="${style}">${enErp ? 'EN ERP' : 'FALTANTE'}</span>`;
  }

  function renderDiferencia(diff, moneda) {
    if (diff == null) return '<span class="muted">—</span>';
    const v = Number(diff);
    if (!Number.isFinite(v)) return '<span class="muted">—</span>';
    if (v === 0) return '<span style="color:#15803d;font-weight:600">' + fmtMoneda(0, moneda) + '</span>';
    const color = v > 0 ? '#b91c1c' : '#b07207';
    const signo = v > 0 ? '+' : '';
    return `<span style="color:${color};font-weight:600">${signo}${fmtMoneda(v, moneda)}</span>`;
  }

  function renderTabla(titulo, rows, columnas, mensajeVacio) {
    let h = '<h4 style="margin:2px 0 10px">' + esc(titulo) + ' · <span class="muted" style="font-weight:normal">' + (rows ? rows.length : 0) + '</span></h4>';
    if (!rows || rows.length === 0) {
      h += '<div class="empty" style="text-align:center;padding:24px;color:#64748b;font-size:13px">' + esc(mensajeVacio) + '</div>';
      $('cfPanel').innerHTML = h;
      return;
    }
    h += '<div style="overflow-x:auto"><table class="table" style="width:100%;border-collapse:collapse;font-size:12.5px">';
    h += '<thead><tr>';
    columnas.forEach((c) => {
      h += '<th style="text-align:' + (c.align || 'left') + ';padding:8px 10px;border-bottom:2px solid #e2e8f0;background:#f8fafc;font-weight:700;font-size:11.5px;text-transform:uppercase;letter-spacing:.3px">' + esc(c.l) + '</th>';
    });
    h += '</tr></thead><tbody>';
    rows.forEach((r) => {
      h += '<tr>';
      columnas.forEach((c) => {
        let v = r[c.k];
        if (c.fn) v = c.fn(v, r);
        h += '<td style="text-align:' + (c.align || 'left') + ';padding:7px 10px;border-bottom:1px solid #eef1f5">' + esc(v == null ? '' : v) + '</td>';
      });
      h += '</tr>';
    });
    h += '</tbody></table></div>';
    $('cfPanel').innerHTML = h;
  }

  function exportar() {
    const r = ultimoResultado;
    if (!r) { KoguApi.toast && KoguApi.toast('Genera primero la conciliación', 'warn'); return; }
    if (typeof XLSX === 'undefined') {
      KoguApi.toast && KoguApi.toast('No se cargó la librería de Excel', 'error');
      return;
    }

    const wb = XLSX.utils.book_new();
    const meta = r.meta, resumen = r.resumen;

    const resAOA = [
      ['Conciliación CFDI vs ERP'],
      ['Empresa', meta.empresa_nombre || ''],
      ['Periodo', `${MESES[meta.mes - 1]} ${meta.anio}`],
      ['Archivo', meta.archivo_nombre || ''],
      ['Procesado en (ms)', meta.duracion_ms],
      ['Log ID', meta.log_id || ''],
      [],
      ['Resumen'],
      ['Filas en archivo',            resumen.archivo_filas],
      ['Con UUID',                    resumen.archivo_uuids],
      ['Excluidos',                   resumen.archivo_excluidos],
      ['CFDI recibidos en KOGU',      resumen.kogu_periodo],
      ['Faltantes en ERP',            resumen.faltantes_erp],
      ['Discrepancias de moneda',     resumen.discrepancias_moneda],
      ['CFDI en ERP',                 resumen.cfdi_en_erp != null ? resumen.cfdi_en_erp : ''],
      ['% Cobertura ERP',             resumen.pct_cobertura_erp != null ? resumen.pct_cobertura_erp + '%' : ''],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resAOA), 'Resumen');

    XLSX.utils.book_append_sheet(wb, aoaDe(r.faltantes_erp,
      ['fecha_emision','uuid','serie','folio','rfc_emisor','nombre_emisor','moneda','total','tipo_comprobante']),
      'Faltantes ERP');

    XLSX.utils.book_append_sheet(wb, aoaDe(r.discrepancias_moneda,
      ['uuid','serie','folio','rfc_emisor','nombre_emisor','moneda_cfdi','moneda_erp','moneda_erp_raw','no_facc','total_cfdi','total_erp']),
      'Discrepancias moneda');

    XLSX.utils.book_append_sheet(wb, aoaDe(r.excluidos,
      ['no_facc','vmfolio','cve_prov','nom_prov','des_mon','total_fac','motivo']),
      'Excluidos');

    // Universo completo del periodo con flag de cruce ERP (v1.1).
    // Se añade una columna 'estado' legible ('En ERP' / 'Faltante') para que el
    // Excel se entienda sin abrir la pantalla.
    const universo = Array.isArray(r.cfdi_periodo_estado) ? r.cfdi_periodo_estado : [];
    const universoConEstado = universo.map((x) => ({
      ...x,
      estado: x.en_erp ? 'En ERP' : 'Faltante',
    }));
    XLSX.utils.book_append_sheet(wb, aoaDe(universoConEstado,
      ['fecha_emision','uuid','serie','folio','rfc_emisor','nombre_emisor',
       'tipo_comprobante','moneda','total',
       'estado','no_facc_erp','total_erp','moneda_erp','diferencia_monto']),
      'Todos los CFDI');

    const nombre = `Conciliacion_CFDI_ERP_${meta.anio}-${String(meta.mes).padStart(2,'0')}.xlsx`;
    XLSX.writeFile(wb, nombre);
  }

  function aoaDe(rows, keys) {
    const aoa = [keys];
    (rows || []).forEach((r) => aoa.push(keys.map((k) => (r[k] == null ? '' : r[k]))));
    return XLSX.utils.aoa_to_sheet(aoa);
  }

  // -- init --
  document.addEventListener('DOMContentLoaded', async () => {
    const bootstrap = await KoguShell.initShell({
      currentPage: PAGE_PATH,
      title: 'Conciliación CFDI',
      description: 'Cruce de CFDI recibidos vs reporte de compras del ERP',
      requiredPermission: 'screen.cfdi.sat_dm',
    });
    if (!bootstrap) return; // sin sesión o sin permiso: initShell ya redirigió / bloqueó
    renderForm();
    if (KoguShell.subscribeEmpresaActivaChange) {
      KoguShell.subscribeEmpresaActivaChange(() => limpiar());
    }
  });
})();

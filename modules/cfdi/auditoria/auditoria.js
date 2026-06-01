'use strict';
/* eslint-disable no-undef */
/**
 * Pantalla: Auditoría CFDI (cierre mensual)
 *
 * Endpoints:
 *   GET  /protected/kogu/cfdi/auditoria/mes?anio=&mes=
 *   POST /protected/kogu/cfdi/auditoria/snapshot
 *   GET  /protected/kogu/cfdi/auditoria/historico
 *
 * Permiso: screen.cfdi.sat_dm (mismo que el resto de Negocio CFDI).
 */
(function () {
  const PAGE_PATH = '/modules/cfdi/auditoria/auditoria.html';
  const MESES = [
    'Enero','Febrero','Marzo','Abril','Mayo','Junio',
    'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
  ];

  let ultimoReporte = null;

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
    ));
  }

  function fmtFecha(s) {
    if (!s) return '';
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return String(s).slice(0, 10);
    return d.toISOString().slice(0, 10);
  }
  function fmtInt(n) {
    const v = Number(n || 0);
    return Number.isFinite(v) ? v.toLocaleString('es-MX') : '0';
  }

  /**
   * Selector de mes/año restringido a meses pasados completos. El default es
   * el mes inmediato anterior — el cierre operativo más útil.
   */
  function opcionesPeriodo() {
    const hoy = new Date();
    let anio = hoy.getFullYear();
    let mes = hoy.getMonth(); // 0..11 → ya es "mes anterior" en base 1
    if (mes === 0) { mes = 12; anio -= 1; }

    const anios = [];
    for (let a = anio; a >= anio - 3; a--) anios.push(a);

    return { defAnio: anio, defMes: mes, anios };
  }

  function renderForm() {
    const { defAnio, defMes, anios } = opcionesPeriodo();

    const html = `
      <section class="card" id="card-form">
        <h3>Periodo a auditar</h3>
        <p class="muted" style="margin-top:-4px">
          Selecciona un mes pasado completo. La auditoría compara conteo SAT vs KOGU
          y reporta solicitudes/paquetes con problemas. Solo lectura — no modifica datos.
        </p>
        <div class="form-row" style="display:flex;gap:14px;flex-wrap:wrap;align-items:flex-end">
          <div class="form-col">
            <div class="label-text">Año</div>
            <select id="fAnio" class="input">
              ${anios.map((a) => `<option value="${a}" ${a === defAnio ? 'selected' : ''}>${a}</option>`).join('')}
            </select>
          </div>
          <div class="form-col">
            <div class="label-text">Mes</div>
            <select id="fMes" class="input">
              ${MESES.map((m, i) => `<option value="${i + 1}" ${i + 1 === defMes ? 'selected' : ''}>${m}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-actions" style="margin-top:14px">
          <button id="btnAuditar" class="btn primary">Auditar</button>
          <button id="btnGuardarSnapshot" class="btn" style="margin-left:6px" disabled title="Genera primero el reporte">Guardar snapshot</button>
          <button id="btnExportar" class="btn ghost" style="margin-left:6px" disabled title="Genera primero el reporte">Exportar Excel</button>
          <button id="btnVerHistorico" class="btn ghost" style="margin-left:6px">Ver histórico</button>
          <span id="formMsg" class="muted" style="margin-left:12px"></span>
        </div>
      </section>

      <section id="seccionResultado" style="display:none">
        <div class="card" id="card-resumen"></div>

        <div class="card" id="card-capa5">
          <h3 style="margin-top:0">📊 Capa 5 — Conciliación SAT vs KOGU <span class="muted" style="font-size:12px;font-weight:normal">(la métrica crítica)</span></h3>
          <div id="capa5Contenido"></div>
        </div>

        <div class="card" id="card-otras">
          <h3 style="margin-top:0">Otras capas operativas</h3>
          <div id="otrasCapasContenido"></div>
        </div>
      </section>

      <section id="seccionHistorico" style="display:none">
        <div class="card" id="card-historico"></div>
      </section>
    `;
    $('pageContent').innerHTML = html;

    $('btnAuditar').addEventListener('click', ejecutar);
    $('btnGuardarSnapshot').addEventListener('click', guardarSnapshot);
    $('btnExportar').addEventListener('click', exportar);
    $('btnVerHistorico').addEventListener('click', cargarHistorico);
  }

  async function ejecutar() {
    const anio = parseInt($('fAnio').value, 10);
    const mes = parseInt($('fMes').value, 10);
    const btn = $('btnAuditar');
    btn.disabled = true;
    btn.textContent = 'Auditando…';
    $('formMsg').textContent = '';

    try {
      const qs = `anio=${anio}&mes=${mes}`;
      const resp = await KoguApi.apiFetch('/protected/kogu/cfdi/auditoria/mes?' + qs);
      const body = KoguApi.unwrapData(resp);
      ultimoReporte = body;
      renderResumen(body);
      renderCapa5(body);
      renderOtrasCapas(body);
      $('seccionResultado').style.display = '';
      $('seccionHistorico').style.display = 'none';
      $('btnGuardarSnapshot').disabled = false;
      $('btnExportar').disabled = false;
      KoguApi.toast && KoguApi.toast('Auditoría generada', 'success');
    } catch (err) {
      const msg = (err && err.message) || 'Error al auditar';
      $('formMsg').innerHTML = '<span style="color:#c0392b">⚠ ' + esc(msg) + '</span>';
      KoguApi.toast && KoguApi.toast(msg, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Auditar';
    }
  }

  function colorEstado(estado) {
    if (estado === 'OK') return { lbl: 'OK', col: '#15803d', bg: '#dcfce7' };
    if (estado === 'INCOMPLETO') return { lbl: 'INCOMPLETO', col: '#b91c1c', bg: '#fee2e2' };
    return { lbl: 'OBSERVADO', col: '#b07207', bg: '#fef3c7' };
  }

  function renderResumen(r) {
    const { meta, resumen } = r;
    const c = colorEstado(resumen.estado_global);

    $('card-resumen').innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
        <div>
          <h3 style="margin:0">Auditoría — ${esc(MESES[meta.mes - 1])} ${meta.anio}</h3>
          <div class="muted" style="font-size:12px;margin-top:2px">
            Empresa: ${esc(meta.empresa_nombre || '—')} · RFC: ${esc(meta.rfc || '—')} ·
            Periodo: ${esc(meta.desde)} a ${esc(meta.hasta)} ·
            Procesado en ${meta.duracion_ms} ms
          </div>
        </div>
        <div style="background:${c.col};color:#fff;padding:6px 14px;border-radius:18px;font-weight:700;font-size:12px;letter-spacing:.4px">
          ${c.lbl}
        </div>
      </div>
      <div class="kpi-strip" style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap">
        ${kpiBox(fmtInt(resumen.cfdi_sat_total),  'CFDI según SAT')}
        ${kpiBox(fmtInt(resumen.cfdi_kogu_total), 'CFDI en KOGU')}
        ${kpiBox((resumen.delta_total > 0 ? '+' : '') + fmtInt(resumen.delta_total), 'Δ Delta',
                 resumen.delta_total !== 0 ? (resumen.delta_total > 0 ? '#c0392b' : '#b07207') : '#15803d')}
        ${kpiBox(resumen.pct_cobertura + '%', '% Cobertura',
                 resumen.pct_cobertura >= 100 ? '#15803d' : resumen.pct_cobertura >= 99 ? '#b07207' : '#c0392b')}
        ${kpiBox(fmtInt(resumen.solicitudes_faltantes), 'Solicitudes faltantes', resumen.solicitudes_faltantes > 0 ? '#c0392b' : null)}
        ${kpiBox(fmtInt(resumen.solicitudes_no_terminadas), 'Sin terminar', resumen.solicitudes_no_terminadas > 0 ? '#b07207' : null)}
        ${kpiBox(fmtInt(resumen.paquetes_pendientes), 'Paquetes pendientes', resumen.paquetes_pendientes > 0 ? '#b07207' : null)}
        ${kpiBox(fmtInt(resumen.paquetes_no_procesados), 'Paquetes sin procesar', resumen.paquetes_no_procesados > 0 ? '#c0392b' : null)}
      </div>
    `;
  }

  function kpiBox(n, lbl, color) {
    return `
      <div style="flex:1;min-width:140px;background:#fff;border:1px solid var(--line, #e2e8f0);border-radius:9px;padding:10px 13px">
        <div style="font-size:21px;font-weight:700;line-height:1;${color ? 'color:' + color : ''}">${n}</div>
        <div style="font-size:10.5px;color:#64748b;text-transform:uppercase;letter-spacing:.4px;margin-top:4px">${esc(lbl)}</div>
      </div>
    `;
  }

  function badgeDelta(estado) {
    if (estado === 'OK') {
      return '<span style="background:#dcfce7;color:#15803d;border:1px solid #86efac;padding:3px 9px;border-radius:11px;font-size:11px;font-weight:700">✅ OK</span>';
    }
    if (estado === 'SIN_TRAZA_SAT') {
      // KOGU tiene facturas sin solicitud SAT terminada vinculada. Normal si
      // hay carga histórica o flujos manuales. No es pérdida, es gap de
      // trazabilidad auditable.
      return '<span style="background:#fef3c7;color:#92400e;border:1px solid #fbbf24;padding:3px 9px;border-radius:11px;font-size:11px;font-weight:700" title="Hay CFDIs sin trazabilidad por solicitud SAT (carga histórica o manual)">⚠ SIN TRAZA SAT</span>';
    }
    if (estado === 'ANOMALIA') {
      // Caso no esperado: SAT cuenta más que KOGU. Sucede solo si la query
      // tiene un bug o si hubo borrados parciales de facturas.
      return '<span style="background:#fee2e2;color:#b91c1c;border:1px solid #fca5a5;padding:3px 9px;border-radius:11px;font-size:11px;font-weight:700" title="SAT > KOGU: revisar datos">❌ ANOMALÍA</span>';
    }
    // Compatibilidad con snapshots viejos del histórico
    if (estado === 'FALTAN') return '<span style="background:#fee2e2;color:#b91c1c;border:1px solid #fca5a5;padding:3px 9px;border-radius:11px;font-size:11px;font-weight:700">❌ FALTAN</span>';
    if (estado === 'KOGU_EXCEDE') return '<span style="background:#fef3c7;color:#92400e;border:1px solid #fbbf24;padding:3px 9px;border-radius:11px;font-size:11px;font-weight:700">⚠ KOGU EXCEDE</span>';
    return '<span style="background:#e2e8f0;color:#475569;padding:3px 9px;border-radius:11px;font-size:11px;font-weight:700">' + esc(estado) + '</span>';
  }

  function renderCapa5(r) {
    const filas = r.capa_5_conciliacion || [];
    if (filas.length === 0) {
      $('capa5Contenido').innerHTML = '<div class="empty" style="text-align:center;padding:24px;color:#64748b;font-size:13px">No hay datos del periodo: ni SAT reportó CFDIs ni KOGU tiene registrados.</div>';
      return;
    }
    let h = '<div style="overflow-x:auto"><table class="table" style="width:100%;border-collapse:collapse;font-size:13px">';
    h += '<thead><tr>';
    ['Scope', 'CFDI SAT', 'CFDI KOGU', 'Δ Delta', 'Estado'].forEach((label, idx) => {
      const align = idx >= 1 && idx <= 3 ? 'right' : (idx === 4 ? 'center' : 'left');
      h += '<th style="text-align:' + align + ';padding:8px 12px;border-bottom:2px solid #e2e8f0;background:#f8fafc;font-weight:700;font-size:11.5px;text-transform:uppercase;letter-spacing:.3px">' + esc(label) + '</th>';
    });
    h += '</tr></thead><tbody>';
    filas.forEach((x) => {
      h += '<tr>';
      h += '<td style="padding:7px 12px;border-bottom:1px solid #eef1f5;text-transform:capitalize">' + esc(x.scope) + '</td>';
      h += '<td style="padding:7px 12px;border-bottom:1px solid #eef1f5;text-align:right">' + fmtInt(x.cfdi_sat) + '</td>';
      h += '<td style="padding:7px 12px;border-bottom:1px solid #eef1f5;text-align:right">' + fmtInt(x.cfdi_kogu) + '</td>';
      const delta = Number(x.delta || 0);
      const deltaTxt = (delta > 0 ? '+' : '') + fmtInt(delta);
      const deltaColor = delta === 0 ? '#15803d' : delta > 0 ? '#b91c1c' : '#b07207';
      h += '<td style="padding:7px 12px;border-bottom:1px solid #eef1f5;text-align:right;color:' + deltaColor + ';font-weight:700">' + deltaTxt + '</td>';
      h += '<td style="padding:7px 12px;border-bottom:1px solid #eef1f5;text-align:center">' + badgeDelta(x.estado) + '</td>';
      h += '</tr>';
    });
    h += '</tbody></table></div>';
    $('capa5Contenido').innerHTML = h;
  }

  function renderOtrasCapas(r) {
    const secciones = [
      { titulo: 'Capa 1 — Solicitudes faltantes (días sin solicitud)',
        rows: r.capa_1_solicitudes_faltantes,
        cols: [
          { k: 'dia',   l: 'Día',   fn: fmtFecha },
          { k: 'scope', l: 'Scope' },
        ],
        vacio: 'Todas las combinaciones día/scope tienen al menos una solicitud.',
      },
      { titulo: 'Capa 2 — Solicitudes que no terminaron',
        rows: r.capa_2_solicitudes_no_terminadas,
        cols: [
          { k: 'scope',          l: 'Scope' },
          { k: 'status_solicitud', l: 'Status' },
          { k: 'estado_legible', l: 'Estado' },
          { k: 'desde',          l: 'Desde', fn: (v) => esc(String(v || '').slice(0, 10)) },
          { k: 'hasta',          l: 'Hasta', fn: (v) => esc(String(v || '').slice(0, 10)) },
          { k: 'mensaje',        l: 'Mensaje SAT' },
        ],
        vacio: 'Todas las solicitudes del periodo llegaron a status=3.',
      },
      { titulo: 'Capa 3 — Paquetes pendientes de descargar',
        rows: r.capa_3_paquetes_pendientes,
        cols: [
          { k: 'paquete_id', l: 'Paquete ID' },
          { k: 'scope',      l: 'Scope' },
          { k: 'created_at', l: 'Creado', fn: fmtFecha },
        ],
        vacio: 'No hay paquetes pendientes de descargar.',
      },
      { titulo: 'Capa 4 — Paquetes descargados pero NO procesados',
        rows: r.capa_4_paquetes_no_procesados,
        cols: [
          { k: 'paquete_id', l: 'Paquete ID' },
          { k: 'scope',      l: 'Scope' },
          { k: 'zip_path',   l: 'Ruta ZIP' },
          { k: 'created_at', l: 'Creado', fn: fmtFecha },
        ],
        vacio: 'No hay paquetes con ZIP descargado pendientes de procesar.',
      },
    ];

    let h = '';
    secciones.forEach((s) => {
      h += '<details style="margin-bottom:10px;border:1px solid #e2e8f0;border-radius:8px;padding:0">';
      h += '<summary style="padding:10px 14px;cursor:pointer;font-weight:600;font-size:13px;background:#f8fafc;border-radius:8px 8px 0 0">';
      h += esc(s.titulo) + ' <span class="muted" style="font-weight:normal">· ' + ((s.rows && s.rows.length) || 0) + '</span>';
      h += '</summary>';
      h += '<div style="padding:12px 14px">';
      if (!s.rows || s.rows.length === 0) {
        h += '<div class="empty" style="text-align:center;padding:16px;color:#15803d;font-size:13px">✅ ' + esc(s.vacio) + '</div>';
      } else {
        h += '<div style="overflow-x:auto"><table class="table" style="width:100%;border-collapse:collapse;font-size:12.5px">';
        h += '<thead><tr>';
        s.cols.forEach((c) => {
          h += '<th style="text-align:left;padding:6px 10px;border-bottom:2px solid #e2e8f0;background:#f8fafc;font-weight:700;font-size:11px;text-transform:uppercase">' + esc(c.l) + '</th>';
        });
        h += '</tr></thead><tbody>';
        s.rows.forEach((row) => {
          h += '<tr>';
          s.cols.forEach((c) => {
            let v = row[c.k];
            if (c.fn) v = c.fn(v, row);
            h += '<td style="padding:5px 10px;border-bottom:1px solid #eef1f5">' + esc(v == null ? '' : v) + '</td>';
          });
          h += '</tr>';
        });
        h += '</tbody></table></div>';
      }
      h += '</div></details>';
    });
    $('otrasCapasContenido').innerHTML = h;
  }

  async function guardarSnapshot() {
    if (!ultimoReporte) return;
    try {
      const resp = await KoguApi.apiFetch('/protected/kogu/cfdi/auditoria/snapshot', {
        method: 'POST',
        body: JSON.stringify(ultimoReporte),
      });
      const data = KoguApi.unwrapData(resp);
      KoguApi.toast && KoguApi.toast(`Snapshot guardado (id_mov ${data.id_mov})`, 'success');
    } catch (err) {
      KoguApi.toast && KoguApi.toast(err.message || 'No se pudo guardar el snapshot', 'error');
    }
  }

  async function cargarHistorico() {
    try {
      const resp = await KoguApi.apiFetch('/protected/kogu/cfdi/auditoria/historico');
      const data = KoguApi.unwrapData(resp);
      renderHistorico(data);
      $('seccionResultado').style.display = 'none';
      $('seccionHistorico').style.display = '';
    } catch (err) {
      KoguApi.toast && KoguApi.toast(err.message || 'No se pudo cargar histórico', 'error');
    }
  }

  function renderHistorico(data) {
    const items = (data && data.items) || [];
    let h = '<h3 style="margin-top:0">Histórico de auditorías guardadas</h3>';
    if (items.length === 0) {
      h += '<div class="empty" style="text-align:center;padding:24px;color:#64748b">No hay snapshots guardados todavía. Audita un mes y haz click en "Guardar snapshot".</div>';
    } else {
      h += '<div style="overflow-x:auto"><table class="table" style="width:100%;border-collapse:collapse;font-size:12.5px">';
      h += '<thead><tr>';
      ['Periodo','SAT','KOGU','Δ Delta','% Cobertura','Estado','Faltantes','Sin terminar','Pkg pendientes','Pkg sin procesar','Guardado'].forEach((l, idx) => {
        const align = idx >= 1 && idx <= 4 || (idx >= 6 && idx <= 9) ? 'right' : (idx === 5 ? 'center' : 'left');
        h += '<th style="text-align:' + align + ';padding:6px 10px;border-bottom:2px solid #e2e8f0;background:#f8fafc;font-weight:700;font-size:11px;text-transform:uppercase">' + esc(l) + '</th>';
      });
      h += '</tr></thead><tbody>';
      items.forEach((x) => {
        h += '<tr>';
        h += '<td style="padding:5px 10px;border-bottom:1px solid #eef1f5">' + esc(MESES[(x.mes - 1)] + ' ' + x.anio) + '</td>';
        h += '<td style="padding:5px 10px;border-bottom:1px solid #eef1f5;text-align:right">' + fmtInt(x.cfdi_sat_total) + '</td>';
        h += '<td style="padding:5px 10px;border-bottom:1px solid #eef1f5;text-align:right">' + fmtInt(x.cfdi_kogu_total) + '</td>';
        const delta = Number(x.delta_total || 0);
        const deltaColor = delta === 0 ? '#15803d' : delta > 0 ? '#b91c1c' : '#b07207';
        h += '<td style="padding:5px 10px;border-bottom:1px solid #eef1f5;text-align:right;color:' + deltaColor + ';font-weight:600">' + (delta > 0 ? '+' : '') + fmtInt(delta) + '</td>';
        h += '<td style="padding:5px 10px;border-bottom:1px solid #eef1f5;text-align:right">' + esc(x.pct_cobertura) + '%</td>';
        h += '<td style="padding:5px 10px;border-bottom:1px solid #eef1f5;text-align:center">' + badgeEstadoGlobal(x.estado_global) + '</td>';
        h += '<td style="padding:5px 10px;border-bottom:1px solid #eef1f5;text-align:right">' + fmtInt(x.solicitudes_faltantes) + '</td>';
        h += '<td style="padding:5px 10px;border-bottom:1px solid #eef1f5;text-align:right">' + fmtInt(x.solicitudes_no_terminadas) + '</td>';
        h += '<td style="padding:5px 10px;border-bottom:1px solid #eef1f5;text-align:right">' + fmtInt(x.paquetes_pendientes) + '</td>';
        h += '<td style="padding:5px 10px;border-bottom:1px solid #eef1f5;text-align:right">' + fmtInt(x.paquetes_no_procesados) + '</td>';
        h += '<td style="padding:5px 10px;border-bottom:1px solid #eef1f5">' + esc(fmtFecha(x.updated_at || x.created_at)) + '</td>';
        h += '</tr>';
      });
      h += '</tbody></table></div>';
    }
    $('card-historico').innerHTML = h;
  }

  function badgeEstadoGlobal(estado) {
    const c = colorEstado(estado);
    return `<span style="background:${c.bg};color:${c.col};padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700">${c.lbl}</span>`;
  }

  function exportar() {
    if (!ultimoReporte) {
      KoguApi.toast && KoguApi.toast('Genera primero la auditoría', 'warn');
      return;
    }
    if (typeof XLSX === 'undefined') {
      KoguApi.toast && KoguApi.toast('No se cargó la librería Excel', 'error');
      return;
    }
    const r = ultimoReporte;
    const wb = XLSX.utils.book_new();
    const m = r.meta, s = r.resumen;

    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Auditoría CFDI'],
      ['Empresa', m.empresa_nombre || ''],
      ['RFC', m.rfc || ''],
      ['Periodo', `${MESES[m.mes - 1]} ${m.anio}`],
      ['Generado', m.generado_en || ''],
      [],
      ['Resumen ejecutivo'],
      ['CFDI según SAT',           s.cfdi_sat_total],
      ['CFDI en KOGU',             s.cfdi_kogu_total],
      ['Δ Delta',                  s.delta_total],
      ['% Cobertura',              s.pct_cobertura],
      ['Estado global',            s.estado_global],
      ['Solicitudes faltantes',    s.solicitudes_faltantes],
      ['Solicitudes sin terminar', s.solicitudes_no_terminadas],
      ['Paquetes pendientes',      s.paquetes_pendientes],
      ['Paquetes sin procesar',    s.paquetes_no_procesados],
    ]), 'Resumen');

    XLSX.utils.book_append_sheet(wb, aoaDe(r.capa_5_conciliacion, ['scope','cfdi_sat','cfdi_kogu','delta','estado']), 'Capa5 SAT vs KOGU');
    XLSX.utils.book_append_sheet(wb, aoaDe(r.capa_1_solicitudes_faltantes, ['dia','scope']), 'Capa1 Faltantes');
    XLSX.utils.book_append_sheet(wb, aoaDe(r.capa_2_solicitudes_no_terminadas, ['scope','status_solicitud','estado_legible','desde','hasta','mensaje','request_id']), 'Capa2 Sin terminar');
    XLSX.utils.book_append_sheet(wb, aoaDe(r.capa_3_paquetes_pendientes, ['paquete_id','scope','sol_desde','sol_hasta','created_at']), 'Capa3 Paquetes pendientes');
    XLSX.utils.book_append_sheet(wb, aoaDe(r.capa_4_paquetes_no_procesados, ['paquete_id','scope','zip_path','created_at']), 'Capa4 Paquetes sin procesar');

    const nombre = `Auditoria_CFDI_${m.anio}-${String(m.mes).padStart(2,'0')}.xlsx`;
    XLSX.writeFile(wb, nombre);
  }

  function aoaDe(rows, keys) {
    const aoa = [keys];
    (rows || []).forEach((row) => aoa.push(keys.map((k) => (row[k] == null ? '' : row[k]))));
    return XLSX.utils.aoa_to_sheet(aoa);
  }

  // -- init --
  document.addEventListener('DOMContentLoaded', async () => {
    const bootstrap = await KoguShell.initShell({
      currentPage: PAGE_PATH,
      title: 'Auditoría CFDI',
      description: 'Cierre mensual: conciliación SAT vs KOGU y verificación de pendientes',
      requiredPermission: 'screen.cfdi.sat_dm',
    });
    if (!bootstrap) return;
    renderForm();
    if (KoguShell.subscribeEmpresaActivaChange) {
      KoguShell.subscribeEmpresaActivaChange(() => {
        ultimoReporte = null;
        $('seccionResultado').style.display = 'none';
        $('seccionHistorico').style.display = 'none';
        $('btnGuardarSnapshot').disabled = true;
        $('btnExportar').disabled = true;
      });
    }
  });
})();

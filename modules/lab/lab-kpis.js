// ============================================================
// lab-kpis.js
// MAQUETA del Dashboard de KPIs de Lab QA.
//
// IMPORTANTE: datos hardcoded. No consume backend.
// Sirve para validar el diseño con el equipo de calidad de Adegermex
// antes de implementar la versión final conectada a datos reales.
//
// Cuando se valide, conectar con:
//   GET /protected/lab/kpis/dashboard?periodo=YYYY-MM
//   GET /protected/lab/kpis/por-cliente?periodo=YYYY-MM
//   GET /protected/lab/kpis/tendencia?meses=6
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/lab/lab-kpis.html';
  const PERM = 'screen.lab.kpis';   // permiso dedicado (V137): separa KPIs de Maestros analíticos

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Dashboard de KPIs — Lab QA',
    description: 'Indicadores ejecutivos del laboratorio de calidad. MAQUETA con datos de prueba para validación con el equipo de calidad.',
    requiredPermission: PERM,
  });
  if (!b) return;

  // ── DATOS DE PRUEBA (Adegermex B2B — extractos vegetales) ──
  const DATOS = {
    periodo: 'Mayo 2026',
    actualizado: '2026-05-12 16:30',

    // Bloque 1 — Documentación contractual (COA al cliente)
    documentacion: {
      lotes_embarcados:        87,
      coas_emitidos:           86,        // 1 lote sin COA = problema
      coa_pct_a_tiempo:        98.9,
      tat_coa_horas_promedio:  3.2,
      coas_sustituidos_mes:    1,
      coas_cuestionados_mes:   0,
      // sparkline 6 meses: % COA a tiempo
      tendencia_coa_pct: [96.5, 97.1, 98.0, 98.4, 97.9, 98.9],
    },

    // Bloque 2 — Calidad por cliente
    calidadCliente: {
      // CQS = Customer Quality Score compuesto
      ranking: [
        { cliente: 'Unilever Manufacturera',  lotes: 22, aceptados: 22, excepciones: 0, reclamos: 0, cqs: 99.5 },
        { cliente: 'PepsiCo Alimentos MX',    lotes: 18, aceptados: 18, excepciones: 1, reclamos: 0, cqs: 97.8 },
        { cliente: 'Grupo Bimbo',             lotes: 15, aceptados: 14, excepciones: 1, reclamos: 1, cqs: 92.4 },
        { cliente: 'Nestlé México',           lotes: 12, aceptados: 12, excepciones: 0, reclamos: 0, cqs: 99.1 },
        { cliente: 'Abastecedora Productos N',lotes:  9, aceptados:  9, excepciones: 2, reclamos: 0, cqs: 94.2 },
        { cliente: 'ADAN Pacheco Baltazar',   lotes:  6, aceptados:  5, excepciones: 0, reclamos: 1, cqs: 88.0 },
        { cliente: 'ABCO Distribuidora',      lotes:  5, aceptados:  5, excepciones: 0, reclamos: 0, cqs: 100  },
      ],
      total_lotes:        87,
      tasa_aceptacion:    98.9,
      excepciones_mes:    4,
      reclamos_mes:       2,
      tat_reclamo_dias:   3.5,
    },

    // Bloque 3 — Cadena upstream (inspección compras) + downstream (FPY)
    cadena: {
      // Upstream
      compras_inspeccionadas: 131,
      compras_total:          133,
      tasa_inspeccion_pct:    98.5,
      reportes_emitidos:      131,
      reportes_aceptados:     128,
      reportes_rechazados:    3,
      tasa_rechazo_proveedor: 2.3,
      tat_inspeccion_dias:    1.4,
      // Downstream
      fpy_lab:                96.4,
      tat_lote_dias:          2.1,
      tat_lote_target:        3.0,
      discrepancia_pct:       6.8,
      // sparkline 6 meses: FPY
      tendencia_fpy: [94.2, 95.0, 94.8, 95.6, 96.0, 96.4],
      // Top proveedores rechazos
      top_rechazos: [
        { proveedor: 'Tecnología y Asesorías Alimentarias', rechazos: 1, total: 18, pct: 5.6 },
        { proveedor: 'Especias del Valle',                   rechazos: 1, total: 12, pct: 8.3 },
        { proveedor: 'Distribuidora Industrial Norte',       rechazos: 1, total:  8, pct: 12.5 },
      ],
    },

    // Bloque 4 — Compliance / Auditorías
    compliance: {
      ncs_abiertas:               7,
      ncs_cerradas_mes:           12,
      ncs_capa_eficaces_pct:      91.7,
      ncs_antiguas_60d:           1,
      capas_en_sla_pct:           94.3,
      auditorias_cliente_mes:     2,
      auditorias_sin_hallazgos:   2,
      auditorias_proxima:         'Coca-Cola FEMSA · 28-may-2026',
      calibraciones_al_dia_pct:   98.0,
      calibraciones_proximas_30d: 3,
      documentos_vigentes_pct:    96.8,
      // Distribución de NCs por origen (mes actual)
      ncs_por_origen: [
        { origen: 'Rechazo de lote',         n: 4, color: '#dc2626' },
        { origen: 'Excepción aprobada',      n: 3, color: '#f97316' },
        { origen: 'Inspección de compra',    n: 3, color: '#3b82f6' },
        { origen: 'Queja de cliente',        n: 2, color: '#8b5cf6' },
        { origen: 'Resultado fuera spec',    n: 5, color: '#f59e0b' },
        { origen: 'Auditoría',               n: 2, color: '#64748b' },
      ],
    },
  };

  // ── Helpers de formato ─────────────────────────────────
  const fmt  = (n, d = 0) => Number(n).toLocaleString('es-MX', { maximumFractionDigits: d, minimumFractionDigits: d });
  const pct  = (n)        => fmt(n, 1) + '%';
  const escH = (s)        => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m]);

  function trend(arr, w = 100, h = 32) {
    if (!arr?.length) return '';
    const min = Math.min(...arr), max = Math.max(...arr);
    const range = max - min || 1;
    const points = arr.map((v, i) => {
      const x = (i / (arr.length - 1)) * w;
      const y = h - ((v - min) / range) * (h - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    const last = arr[arr.length - 1];
    const prev = arr[arr.length - 2] || last;
    const delta = last - prev;
    const color = delta >= 0 ? '#16a34a' : '#dc2626';
    return `
      <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="overflow:visible">
        <polyline fill="none" stroke="${color}" stroke-width="1.5" points="${points}"/>
        <circle cx="${(w).toFixed(1)}" cy="${(h - ((last - min) / range) * (h - 4) - 2).toFixed(1)}" r="2.5" fill="${color}"/>
      </svg>`;
  }

  function semaforo(v, ok, warn) {
    if (v >= ok)   return '#16a34a';   // verde
    if (v >= warn) return '#f59e0b';   // ámbar
    return '#dc2626';                  // rojo
  }

  function kpiCard({ label, value, sub, color = '#0f172a', tendencia = null }) {
    return `
      <div style="background:white;border:1px solid var(--line);border-radius:8px;padding:14px;display:flex;flex-direction:column;gap:6px">
        <div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.06em">${escH(label)}</div>
        <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:10px">
          <div style="font-size:28px;font-weight:700;color:${color};line-height:1">${value}</div>
          ${tendencia ? `<div style="margin-bottom:-4px">${tendencia}</div>` : ''}
        </div>
        ${sub ? `<div class="muted" style="font-size:12px">${sub}</div>` : ''}
      </div>`;
  }

  // ── Layout principal ───────────────────────────────────
  const c = document.getElementById('pageContent');
  c.innerHTML = `
<div class="card">
  <div class="row">
    <div>
      <div class="eyebrow">Lab QA</div>
      <h2 style="margin-top:4px">Dashboard de KPIs</h2>
      <div class="muted" style="font-size:12px;margin-top:4px">
        Período: <strong>${DATOS.periodo}</strong>
        · Actualizado: ${DATOS.actualizado}
        · <span style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:4px;font-size:11px">⚠ MAQUETA · datos de prueba</span>
      </div>
    </div>
    <div style="display:flex;gap:8px;align-items:center">
      <select class="select" id="filtroPeriodo" style="width:160px">
        <option>Último mes</option>
        <option>Trimestre actual</option>
        <option>Año en curso</option>
      </select>
      <select class="select" id="filtroCliente" style="width:200px">
        <option value="">Todos los clientes</option>
        ${DATOS.calidadCliente.ranking.map(c => `<option>${escH(c.cliente)}</option>`).join('')}
      </select>
      <button class="btn ghost" id="refreshBtn">↻ Actualizar</button>
    </div>
  </div>
</div>

<!-- ── Panel 1: Documentación contractual (COA) ── -->
<div class="card" style="margin-top:16px">
  <div class="row">
    <div><div class="eyebrow">Bloque 1 · Crítico B2B</div><h2>Documentación contractual (COA al cliente)</h2></div>
  </div>
  <div class="grid-2" style="margin-top:14px;gap:12px">
    ${kpiCard({
      label: 'Lotes embarcados con COA firmado',
      value: `<span style="color:${semaforo(DATOS.documentacion.coa_pct_a_tiempo, 99, 95)}">${pct(DATOS.documentacion.coa_pct_a_tiempo)}</span>`,
      sub: `${DATOS.documentacion.coas_emitidos} / ${DATOS.documentacion.lotes_embarcados} lotes · meta 100%`,
      tendencia: trend(DATOS.documentacion.tendencia_coa_pct),
    })}
    ${kpiCard({
      label: 'TAT promedio emisión COA',
      value: `${fmt(DATOS.documentacion.tat_coa_horas_promedio, 1)} <span style="font-size:16px;font-weight:500;color:#64748b">h</span>`,
      sub: `meta &lt; 4h hábiles · ${DATOS.documentacion.tat_coa_horas_promedio < 4 ? '✓ en meta' : '⚠ sobre meta'}`,
      color: DATOS.documentacion.tat_coa_horas_promedio < 4 ? '#16a34a' : '#dc2626',
    })}
    ${kpiCard({
      label: 'COAs sustituidos en el mes',
      value: `${DATOS.documentacion.coas_sustituidos_mes}`,
      sub: 'meta &lt; 1% del total emitido',
      color: '#0f172a',
    })}
    ${kpiCard({
      label: 'COAs cuestionados por cliente',
      value: `<span style="color:${DATOS.documentacion.coas_cuestionados_mes === 0 ? '#16a34a' : '#dc2626'}">${DATOS.documentacion.coas_cuestionados_mes}</span>`,
      sub: 'meta 0',
    })}
  </div>
</div>

<!-- ── Panel 2: Calidad por cliente ── -->
<div class="card" style="margin-top:16px">
  <div class="row">
    <div><div class="eyebrow">Bloque 2 · Estratégico B2B</div><h2>Calidad por cliente</h2></div>
  </div>
  <div class="grid-2" style="margin-top:14px;gap:12px">
    ${kpiCard({
      label: 'Tasa de aceptación global',
      value: `<span style="color:${semaforo(DATOS.calidadCliente.tasa_aceptacion, 98, 95)}">${pct(DATOS.calidadCliente.tasa_aceptacion)}</span>`,
      sub: `${DATOS.calidadCliente.total_lotes} lotes liberados · meta &gt; 98%`,
    })}
    ${kpiCard({
      label: 'Excepciones aprobadas',
      value: DATOS.calidadCliente.excepciones_mes,
      sub: 'meta &lt; 5% de liberaciones',
      color: '#f97316',
    })}
    ${kpiCard({
      label: 'Reclamos del mes',
      value: `<span style="color:${DATOS.calidadCliente.reclamos_mes <= 1 ? '#16a34a' : '#dc2626'}">${DATOS.calidadCliente.reclamos_mes}</span>`,
      sub: 'meta 0',
    })}
    ${kpiCard({
      label: 'TAT respuesta a reclamo',
      value: `${fmt(DATOS.calidadCliente.tat_reclamo_dias, 1)} <span style="font-size:16px;font-weight:500;color:#64748b">días</span>`,
      sub: 'meta &lt; 5 días hábiles',
      color: DATOS.calidadCliente.tat_reclamo_dias < 5 ? '#16a34a' : '#dc2626',
    })}
  </div>

  <!-- Ranking CQS por cliente -->
  <div style="margin-top:18px">
    <div class="eyebrow" style="margin-bottom:8px">Customer Quality Score (CQS) por cliente</div>
    <div class="table-wrap">
      <table style="font-size:13px">
        <thead><tr>
          <th>Cliente</th>
          <th style="text-align:right">Lotes</th>
          <th style="text-align:right">Aceptados</th>
          <th style="text-align:right">Excepciones</th>
          <th style="text-align:right">Reclamos</th>
          <th style="text-align:right">CQS</th>
          <th style="width:120px">Score visual</th>
        </tr></thead>
        <tbody>
          ${DATOS.calidadCliente.ranking.map(c => {
            const color = semaforo(c.cqs, 95, 90);
            const bar = `<div style="background:#f1f5f9;height:8px;border-radius:4px;overflow:hidden"><div style="background:${color};width:${c.cqs}%;height:100%"></div></div>`;
            return `
              <tr>
                <td><strong>${escH(c.cliente)}</strong></td>
                <td style="text-align:right">${c.lotes}</td>
                <td style="text-align:right">${c.aceptados}</td>
                <td style="text-align:right">${c.excepciones}</td>
                <td style="text-align:right;color:${c.reclamos > 0 ? '#dc2626' : 'inherit'}">${c.reclamos}</td>
                <td style="text-align:right;font-weight:700;color:${color}">${fmt(c.cqs, 1)}</td>
                <td>${bar}</td>
              </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
    <div class="muted" style="font-size:11px;margin-top:6px">
      CQS = 0.40 × aceptación + 0.25 × % COA a tiempo + 0.20 × (1 − tasa excepciones) + 0.15 × OTIF
    </div>
  </div>
</div>

<!-- ── Panel 3: Cadena upstream + downstream ── -->
<div class="card" style="margin-top:16px">
  <div class="row">
    <div><div class="eyebrow">Bloque 3 · Operación</div><h2>Cadena de calidad — entrada y proceso</h2></div>
  </div>
  <div class="grid-2" style="margin-top:14px;gap:12px">
    ${kpiCard({
      label: 'Inspección de compras (cobertura)',
      value: `<span style="color:${semaforo(DATOS.cadena.tasa_inspeccion_pct, 99, 95)}">${pct(DATOS.cadena.tasa_inspeccion_pct)}</span>`,
      sub: `${DATOS.cadena.compras_inspeccionadas} / ${DATOS.cadena.compras_total} compras con reporte · meta 100%`,
    })}
    ${kpiCard({
      label: 'Tasa de rechazo a proveedor',
      value: pct(DATOS.cadena.tasa_rechazo_proveedor),
      sub: `${DATOS.cadena.reportes_rechazados} de ${DATOS.cadena.reportes_emitidos} reportes · meta &lt; 3%`,
      color: DATOS.cadena.tasa_rechazo_proveedor < 3 ? '#16a34a' : '#f59e0b',
    })}
    ${kpiCard({
      label: 'First Pass Yield (lab)',
      value: `<span style="color:${semaforo(DATOS.cadena.fpy_lab, 95, 92)}">${pct(DATOS.cadena.fpy_lab)}</span>`,
      sub: 'lotes liberados al primer cálculo oficial · meta &gt; 95%',
      tendencia: trend(DATOS.cadena.tendencia_fpy),
    })}
    ${kpiCard({
      label: 'TAT lote (recepción → liberación)',
      value: `${fmt(DATOS.cadena.tat_lote_dias, 1)} <span style="font-size:16px;font-weight:500;color:#64748b">días</span>`,
      sub: `meta ≤ ${DATOS.cadena.tat_lote_target} días · ${DATOS.cadena.tat_lote_dias <= DATOS.cadena.tat_lote_target ? '✓ en meta' : '⚠ sobre meta'}`,
      color: DATOS.cadena.tat_lote_dias <= DATOS.cadena.tat_lote_target ? '#16a34a' : '#dc2626',
    })}
  </div>

  <!-- Top proveedores rechazos -->
  <div style="margin-top:18px">
    <div class="eyebrow" style="margin-bottom:8px">Top proveedores con rechazos</div>
    <div class="table-wrap">
      <table style="font-size:13px">
        <thead><tr>
          <th>Proveedor</th>
          <th style="text-align:right">Total lotes inspeccionados</th>
          <th style="text-align:right">Rechazados</th>
          <th style="text-align:right">% Rechazo</th>
        </tr></thead>
        <tbody>
          ${DATOS.cadena.top_rechazos.map(p => `
            <tr>
              <td>${escH(p.proveedor)}</td>
              <td style="text-align:right">${p.total}</td>
              <td style="text-align:right;color:#dc2626">${p.rechazos}</td>
              <td style="text-align:right;font-weight:600;color:${p.pct > 10 ? '#dc2626' : p.pct > 5 ? '#f59e0b' : '#16a34a'}">${pct(p.pct)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
  </div>
</div>

<!-- ── Panel 4: Compliance / Auditorías ── -->
<div class="card" style="margin-top:16px">
  <div class="row">
    <div><div class="eyebrow">Bloque 4 · Compliance</div><h2>No Conformidades, auditorías y calibraciones</h2></div>
  </div>
  <div class="grid-2" style="margin-top:14px;gap:12px">
    ${kpiCard({
      label: 'NCs abiertas',
      value: `<span style="color:${DATOS.compliance.ncs_abiertas < 5 ? '#16a34a' : DATOS.compliance.ncs_abiertas < 10 ? '#f59e0b' : '#dc2626'}">${DATOS.compliance.ncs_abiertas}</span>`,
      sub: `${DATOS.compliance.ncs_cerradas_mes} cerradas en el mes · ${DATOS.compliance.ncs_antiguas_60d} con &gt; 60 días`,
    })}
    ${kpiCard({
      label: 'CAPAs eficaces',
      value: `<span style="color:${semaforo(DATOS.compliance.ncs_capa_eficaces_pct, 90, 80)}">${pct(DATOS.compliance.ncs_capa_eficaces_pct)}</span>`,
      sub: 'meta &gt; 90% · cierre dentro de SLA',
    })}
    ${kpiCard({
      label: 'Calibraciones al día',
      value: `<span style="color:${semaforo(DATOS.compliance.calibraciones_al_dia_pct, 99, 95)}">${pct(DATOS.compliance.calibraciones_al_dia_pct)}</span>`,
      sub: `${DATOS.compliance.calibraciones_proximas_30d} equipos vencen en &lt; 30 días`,
    })}
    ${kpiCard({
      label: 'Auditorías cliente sin hallazgos',
      value: `${DATOS.compliance.auditorias_sin_hallazgos} / ${DATOS.compliance.auditorias_cliente_mes}`,
      sub: `Próxima: ${escH(DATOS.compliance.auditorias_proxima)}`,
      color: DATOS.compliance.auditorias_sin_hallazgos === DATOS.compliance.auditorias_cliente_mes ? '#16a34a' : '#dc2626',
    })}
  </div>

  <!-- Distribución NCs por origen -->
  <div style="margin-top:18px">
    <div class="eyebrow" style="margin-bottom:8px">Distribución de NCs por origen (mes actual)</div>
    <div style="display:flex;flex-direction:column;gap:8px">
      ${(() => {
        const total = DATOS.compliance.ncs_por_origen.reduce((a, x) => a + x.n, 0);
        return DATOS.compliance.ncs_por_origen.map(o => `
          <div style="display:grid;grid-template-columns:180px 1fr 50px;gap:10px;align-items:center;font-size:13px">
            <div>${escH(o.origen)}</div>
            <div style="background:#f1f5f9;height:14px;border-radius:4px;overflow:hidden">
              <div style="background:${o.color};width:${(o.n/total*100).toFixed(1)}%;height:100%"></div>
            </div>
            <div style="text-align:right;font-weight:600">${o.n}</div>
          </div>`).join('');
      })()}
    </div>
  </div>
</div>

<!-- Footer maqueta -->
<div class="card" style="margin-top:16px;background:#fef3c7;border-color:#fbbf24">
  <div style="display:flex;align-items:flex-start;gap:12px">
    <div style="font-size:24px">📐</div>
    <div>
      <div style="font-weight:600;color:#92400e">MAQUETA en validación</div>
      <div style="font-size:13px;color:#78350f;margin-top:4px">
        Todos los datos mostrados son de prueba para validar el diseño con el equipo de calidad antes de implementar la versión final conectada a BD.
        Cuando se apruebe el diseño, se construirán los endpoints
        <code>GET /protected/lab/kpis/dashboard</code>,
        <code>/kpis/por-cliente</code> y
        <code>/kpis/tendencia</code> que alimentarán esta pantalla con datos reales.
      </div>
      <div style="font-size:12px;color:#78350f;margin-top:8px">
        <strong>Ajustes pendientes a validar:</strong>
        ¿Qué clientes son los críticos? ¿Qué meta de TAT es realista? ¿Hay otros KPIs que falten?
        ¿Algún KPI mostrado sobra? Comentarios bienvenidos.
      </div>
    </div>
  </div>
</div>
  `;

  // Sin handlers reales — es maqueta. Solo refresh para refrescar la fecha.
  document.getElementById('refreshBtn').addEventListener('click', () => {
    KoguApi.toast('En la maqueta los datos son fijos. La versión real conectará al backend.', 'info');
  });

  document.getElementById('filtroPeriodo').addEventListener('change', () => {
    KoguApi.toast('Filtros pendientes en versión real.', 'info');
  });
  document.getElementById('filtroCliente').addEventListener('change', () => {
    KoguApi.toast('Filtros pendientes en versión real.', 'info');
  });
});

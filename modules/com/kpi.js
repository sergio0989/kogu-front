// ============================================================
// kpi.js — Comisiones (com_): KPI del módulo.
// Solo lectura: GET /protected/com/comisiones/kpi?anio=
// Filtro año + mes (con "Acumulado (año)" como valor de mes).
// Tendencia y matriz agente×mes SIEMPRE muestran el año completo;
// tarjetas, ranking y funnel siguen al periodo seleccionado.
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/com/kpi.html';
  const BASE = '/protected/com/comisiones';
  const PERM = 'screen.comisiones';
  const CHART_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js';

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'KPI de Comisiones',
    description: 'Indicadores del módulo de comisiones: tendencia mensual por esquema, tasa efectiva, matriz agente × mes, ranking y salud del proceso.',
    requiredPermission: PERM,
  });
  if (!b) return;

  // ── Helpers ────────────────────────────────────────────────
  const $ = (id) => document.getElementById(id);
  const esc = KoguUi.escapeHtml;
  const money = (v) => KoguUi.money(Number(v || 0));
  const fmtInt = (v) => (Number(v) || 0).toLocaleString('es-MX', { maximumFractionDigits: 0 });
  const fmtPct = (v) => v == null ? '—' : ((Number(v) || 0) * 100).toFixed(2) + '%';
  const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const MESES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const MES_ABR = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const ESQ_LBL = { porcentaje: 'Porcentaje', espejo: 'Espejo', por_kg_usd: 'Kg-USD', adicional_cliente: 'Adicional' };
  const ESQ_BADGE = { espejo: 'warn', por_kg_usd: 'neutral', adicional_cliente: 'success' };
  const MOTIVO = {
    tipo_pago_no_valido: 'Tipo de pago no válido', base_no_positiva: 'Base ≤ 0',
    cliente_excluido: 'Cliente excluido', producto_excluido: 'Producto excluido',
    agente_baja: 'Agente en baja', tipocom_no_soportado: 'Tipo de comisión no soportado',
    cliente_sin_agente: 'Cliente sin agente', agente_sin_porcom: 'Agente sin %',
  };
  const NO_VALIDA = new Set(['tipo_pago_no_valido', 'base_no_positiva']);
  const COLOR = { porcentaje: '#2563eb', espejo: '#f59e0b', por_kg_usd: '#94a3b8', adicional_cliente: '#16a34a' };

  const miniCard = (lbl, valv, hint = '', color = '') => `
    <div style="border:1px solid var(--line);border-radius:10px;padding:9px 12px">
      <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.03em">${esc(lbl)}</div>
      <div style="font-size:17px;font-weight:800;line-height:1.15;margin-top:1px;${color ? `color:${color}` : ''}">${esc(valv)}</div>
      ${hint ? `<div style="font-size:10px;color:var(--muted)">${esc(hint)}</div>` : ''}
    </div>`;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if ([...document.scripts].some(s => s.src === src)) return resolve();
      const s = document.createElement('script'); s.src = src; s.onload = resolve;
      s.onerror = () => reject(new Error('No se pudo cargar ' + src));
      document.head.appendChild(s);
    });
  }

  // ── Estado ─────────────────────────────────────────────────
  let kpi = null;      // respuesta del endpoint
  let mesSel = 0;      // 0 = Acumulado (año)
  let chart = null;

  // ── Layout ─────────────────────────────────────────────────
  const now = new Date();
  const anios = [];
  for (let y = now.getFullYear() + 1; y >= now.getFullYear() - 3; y--) anios.push(y);

  const c = $('pageContent');
  c.innerHTML = `
<div class="stack" style="gap:16px">

  <div class="card">
    <div class="row">
      <div><div class="eyebrow">Comisiones</div><h2>KPI de comisiones</h2></div>
      <span class="chip" id="empChip"></span>
    </div>
    <div class="grid-4" style="margin-top:14px;gap:12px;align-items:end">
      <div>
        <div class="label-text">Año</div>
        <select class="select" id="fAnio">${anios.map(y => `<option value="${y}" ${y === now.getFullYear() ? 'selected' : ''}>${y}</option>`).join('')}</select>
      </div>
      <div>
        <div class="label-text">Mes</div>
        <select class="select" id="fMes">
          <option value="0">Acumulado (año)</option>
          ${MESES.slice(1).map((m, i) => `<option value="${i + 1}">${m}</option>`).join('')}
        </select>
      </div>
      <div style="grid-column:span 2;color:var(--muted);font-size:12px">
        Tarjetas, ranking y funnel siguen al periodo. Tendencia y matriz muestran el año completo.
      </div>
    </div>
    <div id="statusLine" style="margin-top:12px"></div>
    <div id="kpis" style="margin-top:14px"></div>
  </div>

  <div class="card" id="tendCard" style="display:none">
    <div class="row"><div><div class="eyebrow">Tendencia</div><h2>Pagos, base comisionable y comisión</h2></div></div>
    <div style="position:relative;height:320px;margin-top:14px"><canvas id="chartTend"></canvas></div>
  </div>

  <div class="card" id="matCard" style="display:none">
    <div class="row">
      <div><div class="eyebrow">Matriz</div><h2>Comisiones por agente y mes</h2></div>
      <button class="btn" id="csvMatrizBtn">Exportar CSV</button>
    </div>
    <div class="table-wrap" style="margin-top:14px">
      <table><thead id="matHead"></thead><tbody id="matRows"></tbody><tfoot id="matFoot"></tfoot></table>
    </div>
    <div style="color:var(--muted);font-size:12px;margin-top:8px">Cifras en MXN · corridas vigentes</div>
  </div>

  <div class="card" id="rankCard" style="display:none">
    <div class="row">
      <div><div class="eyebrow">Ranking</div><h2>Ranking de agentes</h2></div>
      <span class="chip" id="rankPeriodo"></span>
    </div>
    <div class="table-wrap" style="margin-top:14px">
      <table><thead><tr>
        <th>Agente</th><th style="text-align:right">Comisión</th><th style="text-align:right">Base</th>
        <th style="width:26%">Participación</th><th style="text-align:right">Δ vs mes anterior</th>
      </tr></thead><tbody id="rankRows"></tbody></table>
    </div>
    <div id="rankConc" style="color:var(--muted);font-size:12px;margin-top:8px"></div>
  </div>

  <div class="card" id="funCard" style="display:none">
    <div class="row">
      <div><div class="eyebrow">Salud del proceso</div><h2>Funnel del periodo</h2></div>
      <span class="chip" id="funPeriodo"></span>
    </div>
    <div class="grid-2" style="margin-top:14px;gap:20px">
      <div id="funnelBars"></div>
      <div>
        <div style="font-weight:700;font-size:13px;margin-bottom:8px">Motivos de exclusión</div>
        <div id="paretoRows"></div>
      </div>
    </div>
  </div>

</div>`;

  const setEmpChip = () => {
    const e = KoguApi.getEmpresaActiva() || {};
    $('empChip').textContent = e.nombre_corto || e.razon_social || e.rfc || 'Empresa activa';
  };
  setEmpChip();

  // ── Derivados ──────────────────────────────────────────────
  const mesesList = () => (kpi?.meses || []).map(m => m.mes);
  const corridaDe = (mes) => (kpi?.meses || []).find(m => m.mes === mes) || null;
  const mesPrevio = (mes) => {
    const prev = mesesList().filter(x => x < mes);
    return prev.length ? prev[prev.length - 1] : null;
  };

  // Agrega kpi.agentes al periodo (mes especifico o 0 = todo el año).
  function aggAgentes(mes) {
    const map = new Map();
    for (const r of (kpi?.agentes || [])) {
      if (mes && r.mes !== mes) continue;
      const key = `${r.cve_agente}|${r.agente_nombre}`;
      const e = map.get(key) || {
        cve: r.cve_agente, nombre: r.agente_nombre, comision: 0, base: 0,
        porMes: {}, esquemas: new Set(),
      };
      e.comision += num(r.comision);
      e.base += num(r.base);
      e.porMes[r.mes] = (e.porMes[r.mes] || 0) + num(r.comision);
      e.esquemas.add(r.esquema);
      map.set(key, e);
    }
    return [...map.values()].sort((a, x) => x.comision - a.comision);
  }

  const badgeEsq = (esquemas) => {
    const extra = ['adicional_cliente', 'por_kg_usd', 'espejo'].filter(e => esquemas.has(e));
    return extra.map(e =>
      `<span class="badge ${ESQ_BADGE[e]}" style="margin-left:6px;font-size:10px">${esc(ESQ_LBL[e])}</span>`).join('');
  };

  // ── Render: tarjetas ───────────────────────────────────────
  function renderCards() {
    const acum = kpi.acumulado || {};
    const cards = [];
    if (mesSel > 0) {
      const m = corridaDe(mesSel);
      if (!m) {
        $('kpis').innerHTML = '';
        $('statusLine').innerHTML = `<div class="empty" style="padding:14px">No hay corrida para ${MESES[mesSel]} ${kpi.anio}.</div>`;
        return;
      }
      $('statusLine').innerHTML = '';
      const raw = num(m.subtotal_periodo_raw);
      const share = raw > 0 ? (num(m.subtotal_con_espejos) / raw) : null;
      const pm = mesPrevio(mesSel);
      const prev = pm ? corridaDe(pm) : null;
      let dVal = '—', dColor = '', dHint = 'sin mes previo';
      if (prev && num(prev.comision_total) > 0) {
        const d = (num(m.comision_total) - num(prev.comision_total)) / num(prev.comision_total);
        dVal = (d >= 0 ? '+' : '−') + Math.abs(d * 100).toFixed(1) + '%';
        dColor = d >= 0 ? 'var(--accent,#2563eb)' : 'var(--danger,#dc2626)';
        dHint = `${MES_ABR[prev.mes]}: ${money(prev.comision_total)}`;
      }
      cards.push(
        miniCard('Comisión del periodo', money(m.comision_total), `${MESES[m.mes]} ${kpi.anio} · ${m.estado}`, 'var(--accent,#2563eb)'),
        miniCard('Tasa efectiva', fmtPct(m.tasa_efectiva), `acumulado: ${fmtPct(acum.tasa_efectiva)}`),
        miniCard('Base comisionable', money(m.subtotal_con_espejos), share != null ? `${(share * 100).toFixed(0)}% de la cobranza` : ''),
        miniCard('Δ vs mes anterior', dVal, dHint, dColor),
      );
    } else {
      $('statusLine').innerHTML = '';
      const esperados = kpi.anio === now.getFullYear() ? now.getMonth() + 1 : 12;
      const faltan = esperados - (acum.meses_con_corrida || 0);
      cards.push(
        miniCard('Comisión acumulada', money(acum.comision_total), `${acum.meses_con_corrida || 0} corridas vigentes`, 'var(--accent,#2563eb)'),
        miniCard('Tasa efectiva promedio', fmtPct(acum.tasa_efectiva), 'comisión / cobranza'),
        miniCard('Base comisionable', money(acum.subtotal_con_espejos), 'incluye clones'),
        miniCard('Meses con corrida', `${acum.meses_con_corrida || 0} / ${esperados}`,
          faltan > 0 ? `faltan ${faltan}` : 'año al día',
          faltan > 0 ? 'var(--danger,#dc2626)' : ''),
      );
    }
    $('kpis').innerHTML = `<div class="grid-4" style="gap:10px">${cards.join('')}</div>`;
  }

  // ── Render: tendencia (Chart.js) ───────────────────────────
  async function renderChart() {
    $('tendCard').style.display = '';
    await loadScript(CHART_SRC);
    const maxMes = kpi.anio === now.getFullYear() ? Math.max(now.getMonth() + 1, ...mesesList(), 1) : 12;
    const labels = [];
    const dataMes = [];
    for (let m = 1; m <= maxMes; m++) { labels.push(MES_ABR[m]); dataMes.push(corridaDe(m)); }
    const serie = (k) => dataMes.map(m => m ? num(m[k]) : null);
    const bg = (hex) => dataMes.map((_, i) => (mesSel > 0 && i !== mesSel - 1) ? hex + '55' : hex);
    const fmtEje = (v) => Math.abs(v) >= 1e6 ? '$' + (v / 1e6).toFixed(1) + 'M' : '$' + (v / 1000).toFixed(0) + 'k';

    // Plugin propio: dibuja el valor sobre cada barra / punto (sin CDN extra).
    const valueLabels = {
      id: 'valueLabels',
      afterDatasetsDraw(ch) {
        const { ctx } = ch;
        ctx.save();
        ctx.font = '600 10px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ch.data.datasets.forEach((ds, di) => {
          const meta = ch.getDatasetMeta(di);
          if (meta.hidden) return;
          meta.data.forEach((el, i) => {
            const v = ds.data[i];
            if (v == null || !el) return;
            ctx.fillStyle = ds.type === 'line' ? '#15803d' : '#475569';
            ctx.fillText(fmtEje(Number(v)), el.x, el.y - 6);
          });
        });
        ctx.restore();
      },
    };

    if (chart) chart.destroy();
    chart = new Chart($('chartTend').getContext('2d'), {
      type: 'bar',
      plugins: [valueLabels],
      data: {
        labels,
        datasets: [
          { label: 'Total de pagos', data: serie('subtotal_periodo_raw'), backgroundColor: bg('#94a3b8'), yAxisID: 'y' },
          { label: 'Base comisionable', data: serie('subtotal_con_espejos'), backgroundColor: bg(COLOR.porcentaje), yAxisID: 'y' },
          { label: 'Comisión total', type: 'line', data: serie('comision_total'), yAxisID: 'y2',
            borderColor: '#16a34a', backgroundColor: '#16a34a', tension: 0.2, spanGaps: true, pointRadius: 4 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        layout: { padding: { top: 22 } },
        scales: {
          y: { ticks: { callback: fmtEje }, title: { display: true, text: 'Pagos / base' }, grace: '8%' },
          y2: { position: 'right', grid: { drawOnChartArea: false }, ticks: { callback: fmtEje },
                title: { display: true, text: 'Comisión' }, beginAtZero: true, grace: '12%' },
        },
        plugins: {
          legend: { position: 'bottom' },
          tooltip: { callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${money(ctx.parsed.y)}` } },
        },
      },
    });
  }

  // ── Render: matriz agente × mes ────────────────────────────
  const HL = 'background:rgba(37,99,235,.07)';
  function renderMatriz() {
    $('matCard').style.display = '';
    const meses = mesesList();
    const rows = aggAgentes(0);
    $('matHead').innerHTML = `<tr><th>Agente</th>${meses.map(m =>
      `<th style="text-align:right;${m === mesSel ? HL : ''}">${MES_ABR[m]}</th>`).join('')}<th style="text-align:right">Total</th></tr>`;
    $('matRows').innerHTML = rows.length ? rows.map(r => `
      <tr>
        <td>${esc(r.nombre || '—')}${badgeEsq(r.esquemas)}</td>
        ${meses.map(m => `<td style="text-align:right;${m === mesSel ? HL + ';font-weight:700' : ''}">${r.porMes[m] != null ? fmtInt(r.porMes[m]) : '<span style="color:var(--muted)">—</span>'}</td>`).join('')}
        <td style="text-align:right;font-weight:700">${fmtInt(r.comision)}</td>
      </tr>`).join('') : `<tr><td colspan="${meses.length + 2}" class="empty">Sin detalle en el año</td></tr>`;
    const totMes = (m) => num(corridaDe(m)?.comision_total);
    $('matFoot').innerHTML = rows.length ? `
      <tr style="font-weight:800;border-top:2px solid var(--line)">
        <td>TOTAL</td>
        ${meses.map(m => `<td style="text-align:right;${m === mesSel ? HL : ''}">${fmtInt(totMes(m))}</td>`).join('')}
        <td style="text-align:right">${fmtInt(kpi.acumulado?.comision_total)}</td>
      </tr>` : '';
  }

  // ── Render: ranking ────────────────────────────────────────
  function renderRanking() {
    $('rankCard').style.display = '';
    $('rankPeriodo').textContent = mesSel > 0 ? `${MESES[mesSel]} ${kpi.anio}` : `Acumulado ${kpi.anio}`;
    const rows = aggAgentes(mesSel);
    const total = rows.reduce((s, r) => s + r.comision, 0);
    const prevAgg = mesSel > 0 && mesPrevio(mesSel) ? aggAgentes(mesPrevio(mesSel)) : null;
    const prevMap = prevAgg ? new Map(prevAgg.map(r => [`${r.cve}|${r.nombre}`, r.comision])) : null;
    $('rankRows').innerHTML = rows.length ? rows.map(r => {
      const part = total > 0 ? r.comision / total : 0;
      let delta = '<span style="color:var(--muted)">—</span>';
      if (prevMap) {
        const p = prevMap.get(`${r.cve}|${r.nombre}`);
        if (p == null) delta = '<span style="color:var(--muted)">nuevo</span>';
        else if (p > 0) {
          const d = (r.comision - p) / p;
          delta = `<span style="color:${d >= 0 ? 'var(--accent,#2563eb)' : 'var(--danger,#dc2626)'};font-weight:600">${d >= 0 ? '+' : '−'}${Math.abs(d * 100).toFixed(1)}%</span>`;
        }
      }
      return `<tr>
        <td>${esc(r.nombre || '—')}${badgeEsq(r.esquemas)}</td>
        <td style="text-align:right;font-weight:700">${money(r.comision)}</td>
        <td style="text-align:right">${money(r.base)}</td>
        <td><div style="height:8px;background:var(--bg-soft,#f1f5f9);border-radius:4px"><div style="width:${Math.max(1, part * 100).toFixed(1)}%;height:8px;background:${COLOR.porcentaje};border-radius:4px"></div></div>
            <div style="font-size:10px;color:var(--muted);margin-top:2px">${(part * 100).toFixed(1)}%</div></td>
        <td style="text-align:right">${delta}</td>
      </tr>`;
    }).join('') : '<tr><td colspan="5" class="empty">Sin renglones para el periodo</td></tr>';
    const top3 = rows.slice(0, 3).reduce((s, r) => s + r.comision, 0);
    $('rankConc').textContent = rows.length > 3 && total > 0
      ? `Concentración: top 3 agentes = ${(top3 / total * 100).toFixed(0)}% de la comisión del periodo` : '';
  }

  // ── Render: funnel + pareto ────────────────────────────────
  function renderFunnel() {
    $('funCard').style.display = '';
    $('funPeriodo').textContent = mesSel > 0 ? `${MESES[mesSel]} ${kpi.anio}` : `Acumulado ${kpi.anio}`;
    const enPeriodo = (r) => !mesSel || r.mes === mesSel;
    const corr = (kpi.meses || []).filter(m => !mesSel || m.mes === mesSel);
    const raw = corr.reduce((s, m) => s + num(m.subtotal_periodo_raw), 0);
    const porMotivo = new Map();
    let noValida = 0, resto = 0;
    for (const r of (kpi.exclusiones || []).filter(enPeriodo)) {
      const base = num(r.base);
      porMotivo.set(r.motivo, (porMotivo.get(r.motivo) || 0) + base);
      if (NO_VALIDA.has(r.motivo)) noValida += base; else resto += base;
    }
    const valida = raw - noValida;
    const comisionable = valida - resto;
    const bar = (lbl, val, pctW, color) => `
      <div style="margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:3px">
          <span style="color:var(--muted)">${esc(lbl)}</span>
          <span style="font-weight:700">${money(val)}${raw > 0 && val !== raw ? ` · ${(val / raw * 100).toFixed(0)}%` : ''}</span>
        </div>
        <div style="height:10px;background:var(--bg-soft,#f1f5f9);border-radius:5px">
          <div style="width:${raw > 0 ? Math.max(1, val / raw * 100).toFixed(1) : 0}%;height:10px;background:${color};border-radius:5px"></div>
        </div>
      </div>`;
    $('funnelBars').innerHTML = raw > 0
      ? bar('Cobranza del periodo', raw, 100, '#94a3b8')
        + bar('Válida (tipo de pago, base > 0)', valida, 0, '#93c5fd')
        + bar('Base comisionable', comisionable, 0, COLOR.porcentaje)
      : '<div class="empty">Sin cobranza en el periodo</div>';
    const totalExcl = noValida + resto;
    const pareto = [...porMotivo.entries()].sort((a, x) => x[1] - a[1]).slice(0, 6);
    $('paretoRows').innerHTML = pareto.length ? pareto.map(([mot, base]) => `
      <div style="display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr) auto;gap:8px;align-items:center;font-size:12px;margin-bottom:5px">
        <span style="color:var(--muted)">${esc(MOTIVO[mot] || mot)}</span>
        <div style="height:6px;background:var(--bg-soft,#f1f5f9);border-radius:3px">
          <div style="width:${totalExcl > 0 ? Math.max(1, base / totalExcl * 100).toFixed(1) : 0}%;height:6px;background:#f59e0b;border-radius:3px"></div>
        </div>
        <span style="font-weight:600">${totalExcl > 0 ? (base / totalExcl * 100).toFixed(0) : 0}%</span>
      </div>`).join('') : '<div class="empty">Sin exclusiones en el periodo</div>';
  }

  // ── Export CSV matriz ──────────────────────────────────────
  function exportMatriz() {
    const meses = mesesList();
    const rows = aggAgentes(0);
    if (!rows.length) return KoguApi.toast('Nada que exportar', 'error');
    const escCsv = (v) => { const s = String(v ?? ''); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const head = ['Agente', ...meses.map(m => MES_ABR[m]), 'Total'];
    const lines = rows.map(r => [r.nombre, ...meses.map(m => r.porMes[m] ?? ''), r.comision.toFixed(2)]);
    const csv = [head.join(','), ...lines.map(l => l.map(escCsv).join(','))].join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `comisiones_agente_mes_${kpi.anio}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ── Data / orquestación ────────────────────────────────────
  function renderAll() {
    renderCards();
    renderChart().catch((err) => {
      $('tendCard').style.display = '';
      const cv = $('chartTend');
      if (cv && cv.parentElement) {
        cv.parentElement.innerHTML =
          `<div class="empty" style="padding:14px">No se pudo dibujar la gráfica: ${esc(err?.message || 'error')}</div>`;
      }
    });
    renderMatriz();
    renderRanking();
    renderFunnel();
  }

  async function loadKpi() {
    const anio = Number($('fAnio').value);
    try {
      const res = await KoguApi.apiFetch(`${BASE}/kpi?anio=${anio}`);
      kpi = KoguApi.unwrapData(res);
      if (!kpi?.meses?.length) {
        kpi = null;
        ['kpis'].forEach(id => { $(id).innerHTML = ''; });
        ['tendCard', 'matCard', 'rankCard', 'funCard'].forEach(id => { $(id).style.display = 'none'; });
        $('statusLine').innerHTML = `<div class="empty" style="padding:14px">No hay corridas vigentes en ${anio} para esta empresa.</div>`;
        return;
      }
      // Al cambiar de año, si el mes seleccionado no existe conserva Acumulado.
      const meses = mesesList();
      if (mesSel > 0 && !meses.includes(mesSel)) mesSel = 0;
      $('fMes').value = String(mesSel);
      renderAll();
    } catch (err) {
      $('statusLine').innerHTML = `<div class="empty" style="padding:14px">${esc(err.message || 'No se pudo cargar el KPI.')}</div>`;
    }
  }

  // ── Eventos ────────────────────────────────────────────────
  $('fAnio').onchange = loadKpi;
  $('fMes').onchange = () => { mesSel = Number($('fMes').value) || 0; if (kpi) renderAll(); };
  $('csvMatrizBtn').onclick = exportMatriz;

  KoguShell.subscribeEmpresaActivaChange(async () => {
    setEmpChip();
    mesSel = 0; $('fMes').value = '0';
    await loadKpi();
  });

  // Por defecto: último mes con corrida (si hay), si no Acumulado.
  await loadKpi();
  if (kpi?.meses?.length) {
    mesSel = mesesList().slice(-1)[0];
    $('fMes').value = String(mesSel);
    renderAll();
  }
});

document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/com/comisiones.html';
  const BASE = '/protected/com/comisiones';
  const PERM = 'screen.comisiones';

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Comisiones',
    description: 'Cálculo de comisiones sobre la cobranza del periodo. Atribución por agente desde el catálogo KOGU; esquemas porcentaje, espejo y por kg (USD).',
    requiredPermission: PERM,
  });
  if (!b) return;

  // ── Helpers ────────────────────────────────────────────────────────────
  const MESES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const ESQUEMA = { porcentaje: 'Porcentaje', espejo: 'Espejo', por_kg_usd: 'Kg-USD' };
  const ESQ_BADGE = { porcentaje: 'primary', espejo: 'warn', por_kg_usd: 'neutral' };

  const money = v => KoguUi.money(Number(v || 0));
  const pct = f => (f === null || f === undefined || f === '') ? '—' : `${(Number(f) * 100).toFixed(2)}%`;
  const esc = KoguUi.escapeHtml;
  const val = id => document.getElementById(id)?.value?.trim() ?? '';
  const sel = id => document.getElementById(id)?.value ?? '';
  const elById = id => document.getElementById(id);
  const fmtDate = d => d ? String(d).slice(0, 10) : '';
  const fmtDateTime = d => d ? String(d).slice(0, 16).replace('T', ' ') : '';

  const miniCard = (lbl, valv, hint = '', color = '') => `
    <div style="border:1px solid var(--line);border-radius:10px;padding:9px 12px">
      <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.03em">${esc(lbl)}</div>
      <div style="font-size:17px;font-weight:800;line-height:1.15;margin-top:1px;${color ? `color:${color}` : ''}">${esc(valv)}</div>
      ${hint ? `<div style="font-size:10px;color:var(--muted)">${esc(hint)}</div>` : ''}
    </div>`;

  // ── Estado ─────────────────────────────────────────────────────────────
  let corridaActual = null;   // cabecera com_corridas
  let resumen = [];           // resumen por agente
  let detalle = [];           // renglones (lazy)

  // ── Layout ─────────────────────────────────────────────────────────────
  const now = new Date();
  // Por defecto: mes anterior (periodo cerrado más reciente).
  const defAnio = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const defMes = now.getMonth() === 0 ? 12 : now.getMonth();
  const anioOpts = [];
  for (let y = now.getFullYear() + 1; y >= now.getFullYear() - 3; y--) anioOpts.push(y);

  const c = elById('pageContent');
  c.innerHTML = `
<div class="stack" style="gap:16px">

  <!-- ── Control de periodo ── -->
  <div class="card">
    <div class="row">
      <div><div class="eyebrow">Comisiones</div><h2>Cálculo por periodo</h2></div>
      <span class="chip" id="empChip"></span>
    </div>
    <div class="grid-4" style="margin-top:14px;gap:12px;align-items:end">
      <div>
        <div class="label-text">Año</div>
        <select class="select" id="fAnio">${anioOpts.map(y => `<option value="${y}" ${y === defAnio ? 'selected' : ''}>${y}</option>`).join('')}</select>
      </div>
      <div>
        <div class="label-text">Mes</div>
        <select class="select" id="fMes">${MESES.slice(1).map((m, i) => `<option value="${i + 1}" ${i + 1 === defMes ? 'selected' : ''}>${m}</option>`).join('')}</select>
      </div>
      <div>
        <button class="btn" id="loadBtn" style="width:100%">Cargar corrida</button>
      </div>
      <div>
        <button class="btn primary" id="calcBtn" style="width:100%">Calcular y guardar</button>
      </div>
    </div>
    <details style="margin-top:14px;border:1px solid var(--line);border-radius:10px;padding:10px 14px;background:var(--bg-soft,#f8fafc)">
      <summary style="cursor:pointer;font-weight:600;font-size:13px;color:var(--muted)">¿Qué hace cada botón?</summary>
      <div style="margin-top:10px;font-size:13px;color:var(--muted);line-height:1.55">
        <div style="margin-bottom:6px"><b style="color:var(--text,#0f172a)">Cargar corrida</b> · Muestra la corrida ya guardada del periodo. Es lectura pura: no toca la cobranza ni vuelve a correr el motor. Si no hay corrida guardada, te invita a calcularla.</div>
        <div><b style="color:var(--text,#0f172a)">Calcular y guardar</b> · Vuelve a correr el motor sobre la cobranza actual y guarda el resultado. Si ya existe una corrida del periodo, pide confirmación antes de sobrescribir; la anterior se conserva como histórico.</div>
      </div>
    </details>
    <div id="statusLine" style="margin-top:12px"></div>
  </div>

  <!-- ── KPIs / bitácora ── -->
  <div class="card" id="kpiCard" style="display:none">
    <div class="row">
      <div><div class="eyebrow">Resumen del periodo</div><h2 id="kpiTitle">—</h2></div>
      <span class="badge" id="estadoBadge"></span>
    </div>
    <div id="kpis" style="margin-top:14px"></div>
    <div id="meta" style="margin-top:10px;color:var(--muted);font-size:12px"></div>
    <div id="warns" style="margin-top:10px"></div>
  </div>

  <!-- ── Resumen por agente ── -->
  <div class="card" id="resumenCard" style="display:none">
    <div class="row">
      <div><div class="eyebrow">Pago</div><h2>Resumen por agente</h2></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn primary" id="xlsxBtn">Excel de pago</button>
        <button class="btn" id="pdfBtn">PDF de pago</button>
        <button class="btn" id="csvResumenBtn">CSV</button>
      </div>
    </div>
    <div class="table-wrap" style="margin-top:14px">
      <table><thead><tr>
        <th>Cve</th><th>Agente</th><th style="text-align:right">Base comisionable</th>
        <th style="text-align:right">Comisión</th><th style="text-align:right">Pagos</th>
        <th style="text-align:right">Facturas</th><th style="text-align:right">Clientes</th>
      </tr></thead><tbody id="resumenRows"></tbody>
      <tfoot id="resumenFoot"></tfoot></table>
    </div>
  </div>

  <!-- ── Detalle ── -->
  <div class="card" id="detalleCard" style="display:none">
    <div class="row">
      <div><div class="eyebrow">Detalle</div><h2>Renglones comisionables</h2></div>
      <div style="display:flex;gap:8px">
        <button class="btn" id="detBtn">Ver detalle</button>
        <button class="btn" id="csvDetBtn" style="display:none">Exportar CSV</button>
      </div>
    </div>
    <div id="detFilters" style="display:none;margin-top:14px" class="grid-4">
      <input class="input" id="detQ" placeholder="Buscar cliente / factura / agente" />
      <select class="select" id="detEsq">
        <option value="">Todos los esquemas</option>
        <option value="porcentaje">Porcentaje</option>
        <option value="espejo">Espejo</option>
        <option value="por_kg_usd">Kg-USD</option>
      </select>
      <select class="select" id="detAgente"><option value="">Todos los agentes</option></select>
      <div style="display:flex;align-items:center;justify-content:flex-end;color:var(--muted);font-size:13px" id="detCounter"></div>
    </div>
    <div class="table-wrap" style="margin-top:14px">
      <table><thead><tr>
        <th>Esquema</th><th>Fecha</th><th>Factura</th><th>Cliente</th>
        <th style="text-align:right">Base</th><th style="text-align:right">%</th>
        <th style="text-align:right">Comisión</th><th>Agente</th>
      </tr></thead><tbody id="detRows"></tbody></table>
    </div>
  </div>

</div>`;

  const empA = KoguApi.getEmpresaActiva() || {};
  elById('empChip').textContent = empA.nombre_corto || empA.razon_social || empA.rfc || 'Empresa activa';

  // ── Render KPIs ─────────────────────────────────────────────────────────
  function renderCorrida() {
    if (!corridaActual) {
      elById('kpiCard').style.display = 'none';
      elById('resumenCard').style.display = 'none';
      elById('detalleCard').style.display = 'none';
      return;
    }
    const k = corridaActual;
    elById('kpiCard').style.display = '';
    elById('resumenCard').style.display = '';
    elById('detalleCard').style.display = '';
    elById('kpiTitle').textContent = `${MESES[k.mes]} ${k.anio}`;
    const eb = elById('estadoBadge');
    eb.textContent = (k.vigente ? 'Vigente' : 'Histórico') + (k.estado ? ` · ${k.estado}` : '');
    eb.className = 'badge ' + (k.vigente ? 'success' : 'neutral');

    elById('kpis').innerHTML = `
      <div class="grid-4" style="gap:10px">
        ${miniCard('Comisión total', money(k.comision_total), `${k.num_detalle} renglones`, 'var(--accent,#2563eb)')}
        ${miniCard('Porcentaje', money(k.comision_porcentaje), 'esquema base')}
        ${miniCard('Espejo', money(k.comision_espejo), 'clones')}
        ${miniCard('Kg-USD', money(k.comision_kg_usd), `USD ${Number(k.comision_kg_usd_divisa || 0).toFixed(2)}`)}
      </div>
      <div class="grid-4" style="gap:10px;margin-top:10px">
        ${miniCard('Base comisionable', money(k.subtotal_base), 'esquema %')}
        ${miniCard('Base + clones', money(k.subtotal_con_espejos), 'incl. espejo/kg')}
        ${miniCard('Excluidos', String(k.num_excluidos), 'cobros sin comisión')}
        ${miniCard('No mapeados', String(k.num_nomapeados), 'sin agente/%', Number(k.num_nomapeados) > 0 ? 'var(--danger,#dc2626)' : '')}
      </div>`;

    elById('meta').textContent =
      `TC de pago: ${k.tc_pago != null ? Number(k.tc_pago).toFixed(4) : '—'}  ·  ` +
      `Subtotal periodo: ${money(k.subtotal_periodo_raw)}  ·  ` +
      `Calculada: ${fmtDateTime(k.created_at)}`;
  }

  function renderResumen() {
    const tb = elById('resumenRows');
    if (!resumen.length) {
      tb.innerHTML = '<tr><td colspan="7" class="empty">Sin renglones comisionables</td></tr>';
      elById('resumenFoot').innerHTML = '';
      return;
    }
    tb.innerHTML = resumen.map(r => `
      <tr>
        <td><span class="chip-compact">${esc(String(r.cve_agente ?? '—'))}</span></td>
        <td>${esc(r.agente_nombre || '—')}</td>
        <td style="text-align:right">${money(r.base_comisionable)}</td>
        <td style="text-align:right;font-weight:700">${money(r.comision_total)}</td>
        <td style="text-align:right">${esc(String(r.pagos ?? 0))}</td>
        <td style="text-align:right">${esc(String(r.facturas ?? 0))}</td>
        <td style="text-align:right">${esc(String(r.clientes ?? 0))}</td>
      </tr>`).join('');
    const totBase = resumen.reduce((s, r) => s + Number(r.base_comisionable || 0), 0);
    const totCom = resumen.reduce((s, r) => s + Number(r.comision_total || 0), 0);
    elById('resumenFoot').innerHTML = `
      <tr style="font-weight:800;border-top:2px solid var(--line)">
        <td colspan="2">TOTAL (${resumen.length} agentes)</td>
        <td style="text-align:right">${money(totBase)}</td>
        <td style="text-align:right">${money(totCom)}</td>
        <td colspan="3"></td>
      </tr>`;
  }

  function fillAgenteFilter() {
    const names = [...new Set(detalle.map(d => d.agente_nombre).filter(Boolean))].sort();
    elById('detAgente').innerHTML = '<option value="">Todos los agentes</option>' +
      names.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
  }

  function renderDetalle() {
    const q = val('detQ').toLowerCase();
    const eq = sel('detEsq');
    const ag = sel('detAgente');
    const rows = detalle.filter(d => {
      const txt = `${d.cliente_nombre || ''} ${d.no_fac || ''} ${d.agente_nombre || ''} ${d.cve_cte || ''}`.toLowerCase();
      return (!q || txt.includes(q)) && (!eq || d.esquema === eq) && (!ag || d.agente_nombre === ag);
    });
    elById('detCounter').textContent = `${rows.length} de ${detalle.length} renglón(es)`;
    elById('detRows').innerHTML = rows.length ? rows.map(d => `
      <tr>
        <td><span class="badge ${ESQ_BADGE[d.esquema] || 'neutral'}">${esc(ESQUEMA[d.esquema] || d.esquema)}</span></td>
        <td>${esc(fmtDate(d.fecha))}</td>
        <td>${esc(String(d.no_fac ?? '—'))}</td>
        <td>${esc(d.cliente_nombre || '—')}</td>
        <td style="text-align:right">${money(d.subtot)}</td>
        <td style="text-align:right">${d.esquema === 'por_kg_usd' ? '—' : pct(d.porcom)}</td>
        <td style="text-align:right;font-weight:700">${money(d.comision)}</td>
        <td>${esc(d.agente_nombre || '—')}</td>
      </tr>`).join('') : '<tr><td colspan="8" class="empty">Sin renglones para el filtro</td></tr>';
  }

  // ── Data ───────────────────────────────────────────────────────────────
  async function loadVigente(silent = false) {
    const anio = Number(sel('fAnio'));
    const mes = Number(sel('fMes'));
    try {
      const res = await KoguApi.apiFetch(`${BASE}/corridas/vigente?anio=${anio}&mes=${mes}`);
      const data = KoguApi.unwrapData(res);
      corridaActual = data.corrida || null;
      resumen = data.resumen || [];
      detalle = [];
      elById('detFilters').style.display = 'none';
      elById('csvDetBtn').style.display = 'none';
      elById('detRows').innerHTML = '';
      elById('statusLine').innerHTML = '';
      renderCorrida();
      renderResumen();
    } catch (err) {
      corridaActual = null; resumen = []; detalle = [];
      renderCorrida();
      if (err.message && err.message.includes('CORRIDA_NO_ENCONTRADA')) {
        elById('statusLine').innerHTML =
          `<div class="empty" style="padding:14px">No hay corrida para ${MESES[mes]} ${anio}. Usa <b>Calcular y guardar</b> para generarla.</div>`;
      } else if (!silent) {
        elById('statusLine').innerHTML = `<div class="empty" style="padding:14px">${esc(err.message || 'No se pudo cargar la corrida.')}</div>`;
      }
    }
  }

  async function calcular() {
    const anio = Number(sel('fAnio'));
    const mes = Number(sel('fMes'));
    const res = await KoguApi.apiFetch(`${BASE}/corridas`, {
      method: 'POST', body: JSON.stringify({ anio, mes }),
    });
    const data = KoguApi.unwrapData(res);
    KoguApi.toast(`Corrida ${MESES[mes]} ${anio}: comisión total ${money(data?.totales?.comisionTotal)}`, 'success');
    if (data?.warnings?.length) {
      elById('statusLine').innerHTML = data.warnings
        .map(w => `<div class="badge warn" style="display:block;margin:4px 0">${esc(w)}</div>`).join('');
    }
    await loadVigente(true);
  }

  async function loadDetalle() {
    if (!corridaActual) return;
    const res = await KoguApi.apiFetch(`${BASE}/corridas/${corridaActual.corrida_id}/detalle`);
    detalle = KoguApi.unwrapRows(res);
    elById('detFilters').style.display = '';
    elById('csvDetBtn').style.display = '';
    fillAgenteFilter();
    renderDetalle();
  }

  // ── Export CSV ─────────────────────────────────────────────────────────
  function downloadCsv(filename, headers, rows) {
    const escCsv = v => {
      const s = String(v ?? '');
      return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [headers.join(','), ...rows.map(r => r.map(escCsv).join(','))].join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function exportResumen() {
    if (!resumen.length) return KoguApi.toast('Nada que exportar', 'error');
    const per = `${corridaActual.anio}-${String(corridaActual.mes).padStart(2, '0')}`;
    downloadCsv(`comisiones_resumen_${per}.csv`,
      ['Cve', 'Agente', 'Base comisionable', 'Comision', 'Pagos', 'Facturas', 'Clientes'],
      resumen.map(r => [r.cve_agente, r.agente_nombre, r.base_comisionable, r.comision_total, r.pagos, r.facturas, r.clientes]));
  }

  function exportDetalle() {
    if (!detalle.length) return KoguApi.toast('Nada que exportar', 'error');
    const per = `${corridaActual.anio}-${String(corridaActual.mes).padStart(2, '0')}`;
    downloadCsv(`comisiones_detalle_${per}.csv`,
      ['Esquema', 'Fecha', 'Num', 'Factura', 'Cliente', 'CveCte', 'Base', 'PorCom', 'Comision', 'CveAgente', 'Agente', 'Producto'],
      detalle.map(d => [ESQUEMA[d.esquema] || d.esquema, fmtDate(d.fecha), d.num, d.no_fac, d.cliente_nombre,
        d.cve_cte, d.subtot, d.porcom, d.comision, d.cve_agente, d.agente_nombre, d.cve_prod]));
  }

  // Reporte de pago oficial (Excel/PDF) — binario vía authFetchRaw.
  async function exportReporte(format) {
    if (!corridaActual) return KoguApi.toast('No hay corrida cargada', 'error');
    const res = await KoguApi.authFetchRaw(`${BASE}/corridas/${corridaActual.corrida_id}/export?format=${format}`);
    if (!res.ok) return KoguApi.toast('No se pudo generar el reporte', 'error');
    const blob = await res.blob();
    const cd = res.headers.get('Content-Disposition') || '';
    const m = cd.match(/filename="?([^"]+)"?/);
    const per = `${corridaActual.anio}-${String(corridaActual.mes).padStart(2, '0')}`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = m ? m[1] : `comisiones_pago_${per}.${format === 'pdf' ? 'pdf' : 'xlsx'}`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ── Eventos ────────────────────────────────────────────────────────────
  elById('loadBtn').onclick = () => loadVigente(false);
  elById('calcBtn').onclick = async (e) => {
    const anio = Number(sel('fAnio'));
    const mes = Number(sel('fMes'));
    // ¿Ya existe una corrida vigente para este periodo? Si sí, confirmar
    // antes de recalcular (la anterior se conserva como histórico).
    let existe = false;
    try {
      const chk = await KoguApi.apiFetch(`${BASE}/corridas/vigente?anio=${anio}&mes=${mes}`);
      existe = !!(KoguApi.unwrapData(chk)?.corrida);
    } catch (_) { existe = false; } // 404 = no hay corrida → seguir directo
    if (existe) {
      const ok = window.confirm(
        `Ya existe una corrida calculada para ${MESES[mes]} ${anio}.\n\n` +
        `Aceptar = recalcular y sobrescribir (la corrida anterior se conserva como histórico).\n` +
        `Cancelar = solo consultar la corrida existente.`
      );
      if (!ok) { await loadVigente(false); return; }
    }
    await KoguUi.withLoading(e.target, async () => {
      try { await calcular(); } catch (_) { /* apiFetch ya notificó */ }
    }, 'Calculando...');
  };
  elById('detBtn').onclick = (e) => KoguUi.withLoading(e.target, async () => {
    try { await loadDetalle(); } catch (_) { /* apiFetch ya notificó */ }
  }, 'Cargando...');
  elById('csvResumenBtn').onclick = exportResumen;
  elById('csvDetBtn').onclick = exportDetalle;
  elById('xlsxBtn').onclick = (e) => KoguUi.withLoading(e.target, async () => {
    try { await exportReporte('xlsx'); } catch (_) { KoguApi.toast('No se pudo generar el Excel', 'error'); }
  }, 'Generando...');
  elById('pdfBtn').onclick = (e) => KoguUi.withLoading(e.target, async () => {
    try { await exportReporte('pdf'); } catch (_) { KoguApi.toast('No se pudo generar el PDF', 'error'); }
  }, 'Generando...');
  elById('detQ').oninput = renderDetalle;
  elById('detEsq').onchange = renderDetalle;
  elById('detAgente').onchange = renderDetalle;

  KoguShell.subscribeEmpresaActivaChange(async () => {
    const empB = KoguApi.getEmpresaActiva() || {};
    elById('empChip').textContent = empB.nombre_corto || empB.razon_social || empB.rfc || 'Empresa activa';
    await loadVigente(true);
  });

  await loadVigente(true);
});

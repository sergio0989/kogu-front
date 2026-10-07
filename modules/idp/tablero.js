// ============================================================
// modules/idp/tablero.js — Estadísticas de I+D (CRM: estadisticas_proyectos.php, ampliadas).
// Dos vistas (decisión 7-oct-2026): Resultados del periodo (por omisión el mes en curso) y
// Comparativo vs el mismo periodo del año anterior.
// Endpoint: GET /protected/idp/tablero?desde&hasta[&comparar=1]  (alcance por cartera en el backend)
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  const b = await KoguShell.initShell({
    currentPage: '/modules/idp/tablero.html',
    title: 'Estadísticas de I+D',
    description: 'Resultados del periodo, embudo, tiempos, pipeline y carga; comparativo contra el año anterior.',
    requiredPermission: 'idp.proyectos.read',
  });
  if (!b) return;
  const I = KoguIdp; const esc = I.esc; const BASE = I.BASE;
  const pc = document.getElementById('pageContent');
  const $ = (id) => document.getElementById(id);
  const C_ACT = '#0891b2'; const C_ANT = '#7c3aed';   // validados (dataviz: CVD ΔE 15, normal ΔE 24.5, contraste ≥3:1)
  const n0 = (v) => Number(v || 0).toLocaleString('es-MX');
  const pct = (v) => (v == null ? '—' : `${Number(v).toLocaleString('es-MX', { maximumFractionDigits: 1 })}%`);
  const dias = (v) => (v == null ? '—' : `${Number(v).toLocaleString('es-MX', { maximumFractionDigits: 1 })} d`);
  const fCorta = (d) => (d ? d.split('-').reverse().join('/') : '');

  const estado = { vista: 'resultados', rango: 'mes', ...I.rangoTablero('mes') };

  pc.innerHTML = `
    <style>
      .tb-head{display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap}
      .tb-head .tabs{margin:0}
      .tb-rng{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
      .tb-grid{display:grid;gap:14px;margin-top:14px}
      .tb-2{grid-template-columns:repeat(2,minmax(0,1fr))}
      .tb-kpis{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:0;padding:0;overflow:hidden}
      .tb-kpi{padding:14px 16px;min-width:0}
      .tb-kpi + .tb-kpi{border-left:1px solid var(--line)}
      .tb-k{font-size:12px;color:var(--muted);font-weight:600}
      .tb-v{font-size:24px;font-weight:800;margin-top:4px;letter-spacing:-.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .tb-s{font-size:12px;color:var(--muted);margin-top:2px}
      .tb-h{display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin-bottom:10px;flex-wrap:wrap}
      .tb-h h3{margin:0;font-size:15px}
      .tb-nota{font-size:12px;color:var(--muted)}
      /* Una sola cuadrícula para todas las filas: misma escala en todas las barras */
      .tb-bars{display:grid;grid-template-columns:minmax(70px,max-content) minmax(60px,1fr) max-content;column-gap:10px;row-gap:2px;align-items:center;font-size:13px}
      .tb-bar{display:contents}
      .tb-bar > *{padding:4px 0}
      .tb-bar[data-href]{cursor:pointer}
      .tb-bar[data-href]:hover > *{background:var(--panel2)}
      .tb-bar .nm{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:210px;padding-left:4px}
      .tb-track{height:12px;border-radius:4px;background:transparent;position:relative}
      .tb-fill{height:12px;border-radius:0 4px 4px 0;min-width:0}
      .tb-val{font-variant-numeric:tabular-nums;color:var(--text);font-weight:600;white-space:nowrap}
      .tb-sub{color:var(--muted);font-weight:500}
      .tb-pair .tb-fill + .tb-fill{margin-top:2px}
      .tb-leg{display:flex;gap:14px;font-size:12px;color:var(--muted);align-items:center}
      .tb-leg i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:5px;vertical-align:-1px}
      .tb-big{font-size:28px;font-weight:800;letter-spacing:-.02em}
      .tb-mini{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:12px}
      .tb-mini > div{border:1px solid var(--line);border-radius:12px;padding:10px 12px}
      .tb-cortes{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
      .tb-tip{position:fixed;z-index:50;pointer-events:none;background:#0f172a;color:#fff;font-size:12px;padding:6px 9px;border-radius:8px;box-shadow:var(--shadow);max-width:280px;display:none}
      .tb-up{color:var(--text)} .tb-dir{font-weight:700}
      table.tb-t, .table-wrap table.tb-t{width:100%;border-collapse:collapse;font-size:13px !important;table-layout:auto}
      .table-wrap table.tb-t td, .table-wrap table.tb-t th{word-break:normal;overflow-wrap:normal}
      table.tb-t td.nm{min-width:140px}
      table.tb-t td.r, table.tb-t th.r{white-space:nowrap}
      table.tb-t th{text-align:left;color:var(--muted);font-weight:600;font-size:12px;padding:6px 8px;border-bottom:1px solid var(--line)}
      table.tb-t td{padding:7px 8px;border-bottom:1px solid var(--line)}
      table.tb-t td.r, table.tb-t th.r{text-align:right;font-variant-numeric:tabular-nums}
      table.tb-t tr[data-href]{cursor:pointer} table.tb-t tr[data-href]:hover td{background:var(--panel2)}
      @media (max-width:1200px){.tb-kpis{grid-template-columns:repeat(3,minmax(0,1fr))}.tb-kpi:nth-child(4){border-left:0}.tb-kpi:nth-child(n+4){border-top:1px solid var(--line)}.tb-cortes{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media (max-width:800px){.tb-2,.tb-cortes{grid-template-columns:1fr}.tb-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.tb-kpi{border-left:0!important;border-top:1px solid var(--line)}.tb-bar .nm{max-width:130px}.tb-head .tb-rng{margin-left:0!important}}
    </style>
    <div class="card">
      <div class="tb-head">
        <div class="tabs" id="tbVista">
          <button class="tab active" data-v="resultados">Resultados</button>
          <button class="tab" data-v="comparativo">Comparativo vs año anterior</button>
        </div>
        <div class="tb-rng" style="margin-left:auto">
          <div class="tabs" id="tbRango" style="margin:0">
            <button class="tab" data-r="mes">Este mes</button><button class="tab" data-r="mes_anterior">Mes anterior</button><button class="tab" data-r="anio">Año a la fecha</button>
          </div>
          <input class="input" type="date" id="tbDesde" style="width:150px"/><span class="muted">a</span><input class="input" type="date" id="tbHasta" style="width:150px"/>
          <button class="btn primary" id="tbAplicar">Aplicar</button>
        </div>
      </div>
      <div class="tb-nota" id="tbAlcance" style="margin-top:8px"></div>
    </div>
    <div id="tbCuerpo"><div class="card" style="margin-top:14px"><div class="empty">Cargando…</div></div></div>
    <div class="tb-tip" id="tbTip"></div>`;

  // ── tooltip (hover en barras y filas con data-tip) ──
  const tip = $('tbTip');
  document.addEventListener('mousemove', (e) => {
    const el = e.target.closest('[data-tip]');
    if (!el) { tip.style.display = 'none'; return; }
    tip.innerHTML = el.dataset.tip; tip.style.display = 'block';
    const x = Math.min(e.clientX + 14, window.innerWidth - tip.offsetWidth - 8);
    tip.style.left = `${x}px`; tip.style.top = `${e.clientY + 14}px`;
  });
  document.addEventListener('click', (e) => { const el = e.target.closest('[data-href]'); if (el) window.location.href = el.dataset.href; });

  // ── piezas ──
  const barras = (items, { valor = (x) => x.n, texto = (x) => n0(valor(x)), sub = () => '', href = () => null, tipx = null, color = C_ACT, max = null } = {}) => {
    const m = max ?? Math.max(0, ...items.map(valor));
    return items.length ? `<div class="tb-bars">${items.map((x) => {
      const h = href(x); const v = valor(x);
      const t = tipx ? tipx(x) : `${esc(x.nombre)}: ${texto(x)}${sub(x) ? ` · ${sub(x)}` : ''}${h ? '<br><span style="opacity:.75">Clic para ver el listado</span>' : ''}`;
      return `<div class="tb-bar" ${h ? `data-href="${esc(h)}"` : ''} data-tip="${esc(t)}">
        <span class="nm" title="${esc(x.nombre)}">${esc(x.nombre)}</span>
        <div class="tb-track"><div class="tb-fill" style="width:${I.anchoBarra(v, m)}%;background:${color}"></div></div>
        <span class="tb-val">${texto(x)}${sub(x) ? ` <span class="tb-sub">${sub(x)}</span>` : ''}</span></div>`;
    }).join('')}</div>` : '<div class="empty">Sin datos en el periodo.</div>';
  };
  const tarjeta = (titulo, nota, cuerpo, extra = '') => `<div class="card"><div class="tb-h"><h3>${titulo}</h3><span class="tb-nota">${nota}</span></div>${extra}${cuerpo}</div>`;
  const kpi = (k, v, s = '') => `<div class="tb-kpi"><div class="tb-k">${k}</div><div class="tb-v" title="${esc(String(v).replace(/<[^>]+>/g, ''))}">${v}</div>${s ? `<div class="tb-s">${s}</div>` : ''}</div>`;
  const periodoTxt = (p) => `${fCorta(p.desde)} – ${fCorta(p.hasta)}`;

  // serie de generados (columnas SVG con tooltip)
  const columnas = (serie) => {
    const pts = serie.puntos; const max = Math.max(1, ...pts.map((p) => p.n));
    const W = 640; const H = 170; const pad = 22; const bw = (W - pad) / pts.length; const g = Math.min(2, bw * 0.2);
    const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    const etq = (x) => (serie.unidad === 'mes' ? `${MES[+x.slice(5, 7) - 1]} ${x.slice(2, 4)}` : `${+x.slice(8, 10)}`);
    const cada = Math.ceil(pts.length / 12);
    return `<svg viewBox="0 0 ${W} ${H + 18}" style="width:100%;height:auto" role="img" aria-label="Proyectos generados por ${serie.unidad === 'mes' ? 'mes' : 'día'}">
      <line x1="${pad}" x2="${W}" y1="${H}" y2="${H}" stroke="var(--line)"/>
      <text x="0" y="12" font-size="10" fill="var(--muted)">${max}</text>
      ${pts.map((p, i) => { const h = (p.n / max) * (H - 14); const x = pad + i * bw + g / 2; return `
        <g data-tip="${esc(`${serie.unidad === 'mes' ? etq(p.x) : fCorta(p.x)}: ${p.n} proyecto${p.n === 1 ? '' : 's'}`)}">
          <rect x="${pad + i * bw}" y="0" width="${bw}" height="${H}" fill="transparent"/>
          ${p.n ? `<path d="M${x},${H} V${H - h + 3} q0,-3 3,-3 h${Math.max(0, bw - g - 6)} q3,0 3,3 V${H} Z" fill="${C_ACT}"/>` : ''}
        </g>${i % cada === 0 ? `<text x="${x + (bw - g) / 2}" y="${H + 13}" font-size="10" text-anchor="middle" fill="var(--muted)">${etq(p.x)}</text>` : ''}`; }).join('')}
    </svg>`;
  };

  function resultados(t) {
    const r = t.resumen; const ex = t.exito.global; const per = t.periodo;
    const href = (corte) => (x) => I.urlListado(corte, x.clave, per);
    const maxT = Math.max(1, ...t.tiempos.tramos.map((x) => x.p75 || 0));
    return `
      <div class="card tb-kpis" style="margin-top:14px">
        ${kpi('Proyectos generados', n0(r.generados), `${I.usdCorto(r.venta_anual_usd)} de venta anual`)}
        ${kpi('Cerrados', n0(r.finalizados), `${r.vendidos} vendidos · ${r.no_vendidos} no vendidos`)}
        ${kpi('Tasa de éxito', pct(ex.tasa), `${I.usdCorto(ex.usd_ganado)} ganado`)}
        ${kpi('Muestras entregadas', n0(r.muestras_entregadas), `${n0(r.muestras_solicitadas)} solicitadas`)}
        ${kpi('Actividad registrada', n0(r.actividad), t.actividad[0] ? `más: ${esc(t.actividad[0].clave)} (${n0(t.actividad[0].n)})` : 'comentarios, llamadas, visitas…')}
        ${kpi('Alta → decisión', dias(t.tiempos.total.mediana), t.tiempos.total.n ? `mediana · ${t.tiempos.total.n} decisiones` : 'sin decisiones en el periodo')}
      </div>
      <div class="tb-grid tb-2">
        ${tarjeta('Embudo', 'proyectos generados en el periodo y hasta dónde llegaron',
          barras(t.embudo.map((e) => ({ ...e, clave: null })), { max: t.embudo[0]?.n, sub: (e) => (e.pct_anterior == null ? '' : `${pct(e.pct_anterior)} de la etapa anterior`),
            tipx: (e) => `${esc(e.nombre)}: ${n0(e.n)} · ${pct(e.pct_inicio)} de los generados${e.pct_anterior == null ? '' : ` · ${pct(e.pct_anterior)} de la etapa anterior`}` }))}
        ${tarjeta('Proyectos generados', serieTxt(t.serie), columnas(t.serie))}
      </div>
      <div class="tb-grid tb-2">
        ${tarjeta('Tasa de éxito', 'vendidos ÷ cerrados (vendidos + no vendidos) en el periodo',
          `<div class="tabs" id="tbExTabs" style="margin-bottom:10px"><button class="tab active" data-x="por_agente">Agente</button><button class="tab" data-x="por_desarrollador">Desarrollador</button><button class="tab" data-x="por_linea">Línea</button></div><div id="tbExito">${exitoHtml(t.exito.por_agente)}</div>`)}
        ${tarjeta('Tiempos de ciclo', 'mediana de días (y el 75% de los casos) de los tramos que terminaron en el periodo',
          `${barras(t.tiempos.tramos.filter((x) => x.n), { valor: (x) => x.mediana, max: maxT, texto: (x) => dias(x.mediana), sub: (x) => `75%: ${dias(x.p75)} · ${x.n}`,
            tipx: (x) => `${esc(x.nombre)}<br>mediana ${dias(x.mediana)} · 75% de los casos en ${dias(x.p75)} o menos · ${x.n} casos` })}
           <div class="tb-h" style="margin:14px 0 6px"><h3 style="font-size:13px">Desarrollo → muestra, por desarrollador</h3><span class="tb-nota">mediana</span></div>
           ${barras(t.tiempos.por_desarrollador.slice(0, 8), { valor: (x) => x.mediana, texto: (x) => dias(x.mediana), sub: (x) => `${x.n} casos` })}`)}
      </div>
      <div class="tb-grid tb-2">
        ${tarjeta('Pipeline en juego', 'hoy · venta anual de proyectos abiertos',
          `<div class="tb-big">${I.usdCorto(t.pipeline.usd)}</div><div class="tb-nota">${n0(t.pipeline.n)} proyectos abiertos${t.pipeline.rechazados.n ? ` · aparte, ${n0(t.pipeline.rechazados.n)} rechazados (${I.usdCorto(t.pipeline.rechazados.usd)}) que no cuentan` : ''}</div>
           <div class="tb-mini">${['A', 'B', 'C'].map((k) => { const x = t.pipeline.por_potencial.find((p) => p.clave === k) || { n: 0, usd: 0 };
             return `<div ${I.urlListado('potencial', k, null) ? `data-href="${esc(I.urlListado('potencial', k, null))}" style="cursor:pointer"` : ''} data-tip="Potencial ${k}: ${n0(x.n)} proyectos · ${esc(I.usdCorto(x.usd))}"><div class="tb-k">Potencial ${k}</div><div style="font-weight:800;font-size:18px">${I.usdCorto(x.usd)}</div><div class="tb-s">${n0(x.n)} proyectos</div></div>`; }).join('')}</div>
           <div class="tb-h" style="margin:14px 0 6px"><h3 style="font-size:13px">Por etapa</h3><span class="tb-nota">USD de venta anual</span></div>
           ${barras(t.pipeline.por_etapa, { valor: (x) => x.usd, texto: (x) => I.usdCorto(x.usd), sub: (x) => `${n0(x.n)}`, href: (x) => I.urlListado('estado', x.clave, null) })}`)}
        ${tarjeta('Por qué se pierde', 'motivos registrados en el periodo (no aprobación, rechazo, cancelación)',
          t.motivos.length ? `<div class="table-wrap"><table class="tb-t"><thead><tr><th>Motivo</th><th>Tipo</th><th class="r">Proyectos</th><th class="r">USD</th></tr></thead><tbody>
            ${t.motivos.map((m) => `<tr><td>${esc(m.motivo)}</td><td class="muted">${esc({ no_aprobacion: 'No aprobado', rechazo: 'Rechazo', cancelacion: 'Cancelación' }[m.tipo] || m.tipo)}</td><td class="r">${n0(m.n)}</td><td class="r">${I.usdCorto(m.usd)}</td></tr>`).join('')}
            </tbody></table></div>` : '<div class="empty">Sin motivos registrados en el periodo.</div>')}
      </div>
      <div class="tb-grid tb-2">
        ${tarjeta('Carga por desarrollador', `hoy · abiertos y estancados (sin movimiento ${t.dias_estancado}+ días)`,
          t.carga.length ? `<div class="table-wrap"><table class="tb-t"><thead><tr><th>Desarrollador</th><th class="r">Abiertos</th><th class="r">Estancados</th><th class="r">USD</th></tr></thead><tbody>
            ${t.carga.map((x) => { const h = I.urlListado('desarrollador', x.clave, null); return `<tr ${h ? `data-href="${esc(h)}"` : ''} data-tip="${esc(`${x.nombre}: ${x.abiertos} abiertos, ${x.estancados} estancados${h ? '<br><span style=\'opacity:.75\'>Clic para ver sus proyectos</span>' : ''}`)}">
              <td class="nm">${esc(x.nombre)}</td><td class="r">${n0(x.abiertos)}</td><td class="r" style="${x.estancados ? 'font-weight:700' : ''}">${n0(x.estancados)}</td><td class="r">${I.usdCorto(x.usd)}</td></tr>`; }).join('')}
            </tbody></table></div>` : '<div class="empty">Sin proyectos abiertos.</div>')}
        ${tarjeta('Estancados a revisar', 'hoy · primero potencial A y mayor venta anual',
          t.estancados.length ? `<div class="table-wrap" style="max-height:420px;overflow:auto"><table class="tb-t"><thead><tr><th>Proyecto</th><th>Pot.</th><th class="r">USD</th><th class="r">Sin mov.</th></tr></thead><tbody>
            ${t.estancados.map((x) => `<tr data-href="/modules/idp/proyecto.html?id=${esc(x.proyecto_id)}" data-tip="${esc(`${x.folio} · ${x.cliente || ''}<br>${x.estado || ''}${x.desarrollador ? ` · ${x.desarrollador}` : ''}`)}">
              <td class="nm"><div style="font-size:11px;color:var(--muted);font-weight:700">${esc(x.folio)}</div><div>${esc(x.nombre || '')}</div></td><td>${I.chipPotencial(x.potencial)}</td><td class="r">${I.usdCorto(x.usd)}</td><td class="r">${n0(x.dias)} d</td></tr>`).join('')}
            </tbody></table></div>` : '<div class="empty">Nada estancado. 🎉</div>')}
      </div>
      <div class="card" style="margin-top:14px">
        <div class="tb-h"><h3>Proyectos generados en el periodo</h3><span class="tb-nota">como en el CRM · clic en una barra para ver el listado</span></div>
        <div class="tb-cortes">
          ${[['Estado', 'estado'], ['Agente', 'agente'], ['Desarrollador', 'desarrollador'], ['Potencial', 'potencial'], ['Línea', 'linea'], ['Segmento', 'segmento'], ['Tipo', 'tipo']].map(([nom, k]) => `
            <div><div class="tb-k" style="margin-bottom:6px">${nom}</div>${barras(t.por[k].slice(0, 8), { href: href(k), sub: (x) => (x.venta_anual_usd ? I.usdCorto(x.venta_anual_usd) : '') })}</div>`).join('')}
        </div>
      </div>`;
  }
  const serieTxt = (s) => `por ${s.unidad === 'mes' ? 'mes' : 'día'} de alta`;

  function comparativo(t) {
    const c = t.comparativo; const a = t.anterior;
    const fila = (nom, k, fmt) => { const v = I.variacion(c[k]); return `<tr><td>${nom}</td><td class="r">${fmt(c[k].actual)}</td><td class="r">${fmt(c[k].anterior)}</td>
      <td class="r tb-dir">${v.dir === 'sube' ? '▲ ' : v.dir === 'baja' ? '▼ ' : ''}${v.texto}</td></tr>`; };
    const leyenda = `<div class="tb-leg"><span><i style="background:${C_ACT}"></i>${periodoTxt(t.periodo)}</span><span><i style="background:${C_ANT}"></i>${periodoTxt(t.periodo_anterior)}</span></div>`;
    const pares = (act, ant, { clave = (x) => x.clave, nombre = (x) => x.nombre, valor = (x) => x.n, texto = (v) => n0(v) } = {}) => {
      const mapa = new Map(ant.map((x) => [clave(x), x]));
      const max = Math.max(1, ...act.map(valor), ...ant.map(valor));
      return `<div class="tb-bars">${act.map((x) => { const y = mapa.get(clave(x)); const va = valor(x); const vb = y ? valor(y) : 0;
        return `<div class="tb-bar" data-tip="${esc(`${nombre(x)}<br>${periodoTxt(t.periodo)}: ${texto(va)}<br>${periodoTxt(t.periodo_anterior)}: ${texto(vb)}`)}">
          <span class="nm">${esc(nombre(x))}</span>
          <div><div class="tb-fill" style="width:${I.anchoBarra(va, max)}%;background:${C_ACT};height:9px"></div><div class="tb-fill" style="width:${I.anchoBarra(vb, max)}%;background:${C_ANT};height:9px;margin-top:2px"></div></div>
          <span class="tb-val">${texto(va)} <span class="tb-sub">vs ${texto(vb)}</span></span></div>`; }).join('')}</div>`;
    };
    return `
      <div class="tb-grid tb-2" style="margin-top:14px">
        ${tarjeta('Indicadores', `${periodoTxt(t.periodo)} contra ${periodoTxt(t.periodo_anterior)}`,
          `<div class="table-wrap"><table class="tb-t"><thead><tr><th>Indicador</th><th class="r">Este periodo</th><th class="r">Año anterior</th><th class="r">Variación</th></tr></thead><tbody>
            ${fila('Proyectos generados', 'generados', n0)}${fila('Venta anual de lo generado', 'venta_anual_usd', I.usdCorto)}
            ${fila('Cerrados', 'finalizados', n0)}${fila('Vendidos', 'vendidos', n0)}${fila('Tasa de éxito', 'tasa_exito', pct)}
            ${fila('Muestras entregadas', 'muestras_entregadas', n0)}${fila('Actividad registrada', 'actividad', n0)}
            ${fila('Alta → decisión (mediana)', 'dias_alta_decision', dias)}
          </tbody></table></div>
          <div class="tb-nota" style="margin-top:8px">▲▼ indican si el número subió o bajó, no si es bueno o malo: en días, bajar es mejor.</div>`)}
        ${tarjeta('Embudo', 'proyectos generados en cada periodo y hasta dónde llegaron', pares(t.embudo, a.embudo, { nombre: (x) => x.nombre }), leyenda)}
      </div>
      <div class="tb-grid tb-2">
        ${tarjeta('Tiempos de ciclo', 'mediana de días', pares(t.tiempos.tramos, a.tiempos.tramos, { valor: (x) => x.mediana || 0, texto: dias }), leyenda)}
        ${tarjeta('Tasa de éxito por línea', 'vendidos ÷ cerrados', pares(t.exito.por_linea.slice(0, 8), a.exito.por_linea, { valor: (x) => x.tasa || 0, texto: pct }), leyenda)}
      </div>
      <div class="tb-grid tb-2">
        ${tarjeta('Por qué se pierde', 'motivos registrados (número de proyectos)', pares(t.motivos.slice(0, 8), a.motivos, { clave: (x) => `${x.tipo}|${x.motivo}`, nombre: (x) => x.motivo }), leyenda)}
        ${tarjeta('Tasa de éxito por agente', 'vendidos ÷ cerrados', pares(t.exito.por_agente.slice(0, 8), a.exito.por_agente || [], { valor: (x) => x.tasa || 0, texto: pct }), leyenda)}
      </div>`;
  }

  async function cargar() {
    $('tbDesde').value = estado.desde; $('tbHasta').value = estado.hasta;
    document.querySelectorAll('#tbRango [data-r]').forEach((x) => x.classList.toggle('active', x.dataset.r === estado.rango));
    document.querySelectorAll('#tbVista [data-v]').forEach((x) => x.classList.toggle('active', x.dataset.v === estado.vista));
    $('tbCuerpo').innerHTML = '<div class="card" style="margin-top:14px"><div class="empty">Calculando…</div></div>';
    const qs = new URLSearchParams({ desde: estado.desde, hasta: estado.hasta, ...(estado.vista === 'comparativo' ? { comparar: '1' } : {}) });
    let t;
    try { t = KoguApi.unwrapData(await KoguApi.apiFetch(`${BASE}/tablero?${qs}`)); }
    catch (err) { $('tbCuerpo').innerHTML = `<div class="card" style="margin-top:14px"><div class="empty">${esc(I.mensajeError(err))}</div></div>`; return; }
    $('tbAlcance').innerHTML = `${t.alcance === 'cartera' ? '<b>Tu cartera</b>: proyectos de tus clientes y los que generaste. ' : 'Toda la empresa. '}Periodo: ${periodoTxt(t.periodo)}.`;
    $('tbCuerpo').innerHTML = estado.vista === 'comparativo' ? comparativo(t) : resultados(t);
    const tabs = $('tbExTabs');
    if (tabs) tabs.querySelectorAll('[data-x]').forEach((btn) => (btn.onclick = () => {
      tabs.querySelectorAll('[data-x]').forEach((x) => x.classList.toggle('active', x === btn));
      $('tbExito').innerHTML = exitoHtml(t.exito[btn.dataset.x]);
    }));
  }
  // la tabla de éxito se re-pinta al cambiar de pestaña
  function exitoHtml(filas) {
    return filas.length ? `<div class="table-wrap"><table class="tb-t"><thead><tr><th>Nombre</th><th class="r">Vendidos</th><th class="r">Cerrados</th><th style="width:34%">Tasa de éxito</th><th class="r">USD ganado</th></tr></thead><tbody>
      ${filas.slice(0, 12).map((x) => `<tr data-tip="${esc(`${x.nombre}: ${x.vendidos} de ${x.vendidos + x.no_vendidos} (${pct(x.tasa)}) · perdido ${I.usdCorto(x.usd_perdido)}`)}">
        <td class="nm">${esc(x.nombre)}</td><td class="r">${x.vendidos}</td><td class="r">${x.vendidos + x.no_vendidos}</td>
        <td><div style="display:flex;gap:8px;align-items:center"><div style="flex:1"><div class="tb-fill" style="width:${I.anchoBarra(x.tasa || 0, 100)}%;background:${C_ACT}"></div></div><span class="tb-val">${pct(x.tasa)}</span></div></td>
        <td class="r">${I.usdCorto(x.usd_ganado)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Nada cerrado en el periodo.</div>';
  }

  document.querySelectorAll('#tbVista [data-v]').forEach((btn) => (btn.onclick = () => {
    estado.vista = btn.dataset.v;
    // El comparativo arranca en "año a la fecha" (un mes contra otro mes es muy ruidoso); se puede cambiar.
    if (estado.vista === 'comparativo' && estado.rango === 'mes') Object.assign(estado, { rango: 'anio' }, I.rangoTablero('anio'));
    cargar();
  }));
  document.querySelectorAll('#tbRango [data-r]').forEach((btn) => (btn.onclick = () => { Object.assign(estado, { rango: btn.dataset.r }, I.rangoTablero(btn.dataset.r)); cargar(); }));
  $('tbAplicar').onclick = () => {
    if (!$('tbDesde').value || !$('tbHasta').value) { KoguApi.toast('Elige las dos fechas.', 'error'); return; }
    Object.assign(estado, { rango: 'otro', desde: $('tbDesde').value, hasta: $('tbHasta').value }); cargar();
  };
  cargar();
});

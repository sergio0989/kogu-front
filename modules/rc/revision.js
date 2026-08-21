document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/rc/revision.html';
  const BASE = '/protected/rc';
  const PERM = 'screen.ventas.vendedor';

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Revisión de cartera',
    description: 'Revisión mensual cliente por cliente, con el dictamen ya propuesto · Radar Comercial.',
    requiredPermission: PERM,
  });
  if (!b) return;

  const c = document.getElementById('pageContent');
  c.innerHTML = `
<div class="stack" style="gap:16px">

  <div class="card">
    <div class="row">
      <div>
        <div class="eyebrow">Radar · Revisión mensual</div>
        <h2 id="tituloAgente">Revisión de cartera</h2>
        <div class="hint" id="metaInfo" style="margin-top:4px;color:var(--muted)">—</div>
      </div>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <select class="select" id="agenteFil" style="max-width:260px"></select>
        <select class="select" id="mesFil" style="max-width:150px"></select>
        <button class="btn" id="exportBtn">↓ Exportar</button>
        <button class="btn primary" id="cerrarBtn">Cerrar revisión</button>
      </div>
    </div>

    <div id="avance" style="margin-top:14px"></div>
    <div id="banner" style="margin-top:10px"></div>
  </div>

  <div class="card">
    <div class="row" style="align-items:center;margin-bottom:12px">
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <select class="select" id="vistaFil" style="max-width:200px">
          <option value="pendientes">Por dictaminar</option>
          <option value="">Todos</option>
          <option value="dictaminados">Ya dictaminados</option>
          <option value="corregidos">Donde corregí al sistema</option>
        </select>
        <input class="input" id="qFil" placeholder="Buscar cliente…" style="max-width:220px"/>
      </div>
      <button class="btn" id="confirmarLoteBtn" title="Confirma sólo lo que no tiene nada que decidir">✓ Confirmar estables</button>
    </div>
    <div id="lista"></div>
  </div>

</div>`;

  // ── Estado ────────────────────────────────────────────────────────────────
  let data = null;          // respuesta de /rc/revision
  let agentes = [];
  const money = v => KoguUi.money(Number(v || 0));
  const sel = id => document.getElementById(id)?.value ?? '';
  const nf0 = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 });
  const MESES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const MESC = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const fmtPct = d => d == null ? '—' : `${d <= -1 ? '−100%+' : (d * 100).toFixed(1) + '%'}`;
  const rangoIncl = (d, h) => {
    if (!d || !h) return '';
    const a = new Date(d), z = new Date(h);
    const mA = `${MESC[a.getUTCMonth() + 1]} ${String(a.getUTCFullYear()).slice(2)}`;
    const mB = `${MESC[z.getUTCMonth() + 1]} ${String(z.getUTCFullYear()).slice(2)}`;
    return mA === mB ? mA : `${mA}–${mB}`;
  };
  // Las clasificaciones que no tienen nada que decidir: se pueden confirmar
  // en bloque. Las demás son juicio humano y se tocan una por una.
  const SIN_DECISION = ['ESTABLE', 'AUMENTO'];
  const cat = clave => (data?.catalogo || []).find(x => x.clave === clave) || null;

  const miniCard = (lbl, val, hint = '', color = '') => `
    <div style="border:1px solid var(--line);border-radius:10px;padding:9px 12px">
      <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.03em">${KoguUi.escapeHtml(lbl)}</div>
      <div style="font-size:17px;font-weight:800;line-height:1.15;margin-top:1px;${color ? `color:${color}` : ''}">${KoguUi.escapeHtml(val)}</div>
      ${hint ? `<div style="font-size:10px;color:var(--muted)">${KoguUi.escapeHtml(hint)}</div>` : ''}
    </div>`;

  // ── Carga ─────────────────────────────────────────────────────────────────
  async function loadAgentes() {
    try {
      const res = await KoguApi.apiFetch(`${BASE}/revision/agentes`);
      agentes = KoguApi.unwrapRows(res);
    } catch (err) { agentes = []; KoguApi.toast(err.message, 'error'); }
    const s = document.getElementById('agenteFil');
    if (!agentes.length) {
      s.innerHTML = '<option value="">Sin agentes asignados</option>';
      return;
    }
    s.innerHTML = agentes.map(a =>
      `<option value="${KoguUi.escapeHtml(a.agente_id)}">${a.cve_agente} · ${KoguUi.escapeHtml(a.agente_nombre)}</option>`).join('');
  }

  function llenarMeses() {
    const hoy = new Date();
    const opts = [];
    for (let i = 0; i < 13; i++) {
      const d = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - i, 1));
      opts.push({ v: `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}`, t: `${MESES[d.getUTCMonth() + 1]} ${d.getUTCFullYear()}` });
    }
    document.getElementById('mesFil').innerHTML =
      `<option value="">Último mes cerrado</option>` +
      opts.map(o => `<option value="${o.v}">${o.t}</option>`).join('');
  }

  async function load() {
    const ag = sel('agenteFil');
    if (!ag) {
      document.getElementById('lista').innerHTML =
        '<div class="empty">No tienes agentes asignados para revisar. Pide al administrador que te asigne en la configuración de revisores.</div>';
      document.getElementById('avance').innerHTML = '';
      return;
    }
    const q = new URLSearchParams({ agente_id: ag });
    const per = sel('mesFil');
    if (per) { const [a, m] = per.split('-'); q.set('anio', a); q.set('mes', m); }
    try {
      const res = await KoguApi.apiFetch(`${BASE}/revision?${q}`);
      data = res?.data || res;
    } catch (err) {
      data = null;
      document.getElementById('lista').innerHTML = `<div class="empty">${KoguUi.escapeHtml(err.message)}</div>`;
      document.getElementById('avance').innerHTML = '';
      return;
    }
    render();
  }

  // ── Render ────────────────────────────────────────────────────────────────
  function render() {
    if (!data) return;
    document.getElementById('tituloAgente').textContent = data.agente.nombre;
    document.getElementById('metaInfo').textContent =
      `Revisión de ${MESES[data.mes]} ${data.anio} · revisor: ${data.revisor?.nombre || '—'}`;

    const a = data.avance;
    const cerrada = data.revision?.estado === 'cerrada';
    const pct = a.total ? Math.round(100 * a.dictaminados / a.total) : 0;
    // La distribución es lo que se lleva al comité.
    const dist = {};
    data.clientes.filter(x => x.clasificacion).forEach(x => { dist[x.clasificacion] = (dist[x.clasificacion] || 0) + 1; });
    const distTxt = Object.entries(dist).sort((x, y) => y[1] - x[1])
      .map(([k, v]) => `${cat(k)?.nombre || k}: ${v}`).join(' · ') || 'nada dictaminado todavía';

    document.getElementById('avance').innerHTML = `
      <div class="grid-4" style="gap:10px">
        ${miniCard('Cartera', String(a.total), 'clientes del agente')}
        ${miniCard('Dictaminados', `${a.dictaminados}`, `${pct}% de la cartera`, a.pendientes ? '' : 'var(--ok,#059669)')}
        ${miniCard('Por revisar', String(a.pendientes), a.pendientes ? 'faltan estos' : 'cartera completa', a.pendientes ? 'var(--warning,#d97706)' : '')}
        ${miniCard('Estado', cerrada ? 'Cerrada' : 'Abierta', cerrada ? 'presentada al comité' : 'se puede editar', cerrada ? 'var(--muted,#64748b)' : 'var(--brand,#2563eb)')}
      </div>
      <div style="margin-top:10px;background:var(--panel2,#f1f5f9);border-radius:999px;height:8px;overflow:hidden">
        <div style="width:${pct}%;height:100%;background:${a.pendientes ? 'var(--brand,#2563eb)' : 'var(--ok,#059669)'}"></div>
      </div>
      <div style="font-size:12px;color:var(--muted);margin-top:8px">${KoguUi.escapeHtml(distTxt)}</div>`;

    const p = data.periodos;
    document.getElementById('banner').innerHTML = `
      <div class="hint" style="color:var(--muted);font-size:12px">
        Se compara <b>${rangoIncl(p.act_d, p.act_h)}</b> contra <b>${rangoIncl(p.yoy_d, p.yoy_h)}</b>.
        Aquí entra <b>toda la cartera</b>, no sólo lo que trae alerta: el corte de materialidad decide a quién se le grita, no a quién se le revisa.
      </div>`;

    document.getElementById('cerrarBtn').textContent = cerrada ? 'Reabrir revisión' : 'Cerrar revisión';
    renderLista();
  }

  function filtrados() {
    const v = sel('vistaFil'), q = sel('qFil').trim().toLowerCase();
    return (data.clientes || []).filter(c => {
      if (v === 'pendientes' && c.clasificacion) return false;
      if (v === 'dictaminados' && !c.clasificacion) return false;
      if (v === 'corregidos' && (!c.clasificacion || c.clasificacion === c.propuesta)) return false;
      if (q && !(`${c.cliente_ref} ${c.cliente_nombre || ''}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }

  function chips(c, cerrada) {
    return (data.catalogo || []).map(x => {
      const elegido = c.clasificacion === x.clave;
      const propuesto = !c.clasificacion && c.propuesta === x.clave;
      const bg = elegido ? (x.color || 'var(--brand,#2563eb)') : 'transparent';
      const col = elegido ? '#fff' : (x.color || 'var(--muted,#64748b)');
      const borde = elegido ? (x.color || 'var(--brand,#2563eb)')
        : (propuesto ? (x.color || 'var(--brand,#2563eb)') : 'var(--line)');
      return `<button class="btn" data-chip="${KoguUi.escapeHtml(x.clave)}" data-ref="${KoguUi.escapeHtml(c.cliente_ref)}"
        ${cerrada ? 'disabled' : ''}
        title="${KoguUi.escapeHtml(x.descripcion || '')}"
        style="font-size:11px;padding:3px 10px;border-radius:999px;background:${bg};color:${col};
               border:${propuesto ? '2px dashed' : '1px solid'} ${borde};font-weight:${elegido || propuesto ? '700' : '500'}">
        ${KoguUi.escapeHtml(x.nombre)}</button>`;
    }).join('');
  }

  function renderLista() {
    const cerrada = data.revision?.estado === 'cerrada';
    const filas = filtrados();
    const nConfirmables = (data.clientes || [])
      .filter(c => !c.clasificacion && SIN_DECISION.includes(c.propuesta)).length;
    const bl = document.getElementById('confirmarLoteBtn');
    bl.textContent = `✓ Confirmar ${nConfirmables} estable(s) y aumento(s)`;
    bl.disabled = cerrada || !nConfirmables;
    bl.style.display = nConfirmables ? '' : 'none';

    if (!filas.length) {
      document.getElementById('lista').innerHTML =
        `<div class="empty">${sel('vistaFil') === 'pendientes' ? '¡Cartera completa! No queda nada por dictaminar.' : 'Sin clientes para el filtro.'}</div>`;
      return;
    }

    document.getElementById('lista').innerHTML = filas.map(c => {
      const catProp = cat(c.propuesta);
      const acento = c.clasificacion ? (cat(c.clasificacion)?.color || 'var(--ok,#059669)') : 'var(--line)';
      const delta = c.delta == null ? null : Number(c.delta);
      const colDelta = delta == null ? 'var(--muted)' : (delta < 0 ? 'var(--danger,#dc2626)' : 'var(--ok,#059669)');
      const base = c.base_comparacion === 'secuencial' ? 'vs periodo anterior' : 'vs año pasado';
      return `
      <div style="border:1px solid var(--line);border-left:4px solid ${acento};border-radius:12px;padding:12px 14px;margin-bottom:8px">
        <div class="row" style="align-items:flex-start;gap:12px">
          <div style="flex:1;min-width:0">
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
              <span class="chip-compact">${KoguUi.escapeHtml(c.cliente_ref)}</span>
              <span style="font-weight:700">${KoguUi.escapeHtml(c.cliente_nombre || c.cliente_ref)}</span>
              ${c.previo ? `<span style="font-size:11px;color:var(--muted)">· en ${MESC[c.previo.mes]} fue <b>${KoguUi.escapeHtml(cat(c.previo.clasificacion)?.nombre || c.previo.clasificacion)}</b></span>` : ''}
            </div>
            <div style="font-size:12px;color:var(--muted);margin-top:3px">
              ${money(c.venta_base)} → ${money(c.venta_periodo)}
              <b style="color:${colDelta}">${fmtPct(delta)}</b> ${base}
              · ${nf0.format(c.kg_periodo)} kg
              · última compra ${c.ultima_compra ? KoguUi.fmtDate(c.ultima_compra).split(',')[0] : '—'}
            </div>
            <div style="font-size:12px;margin-top:6px;color:${c.clasificacion ? 'var(--muted)' : 'var(--text,#0f172a)'}">
              ${catProp ? `<b>Propuesta: ${KoguUi.escapeHtml(catProp.nombre)}</b> — ` : ''}${KoguUi.escapeHtml(c.propuesta_motivo || '')}
            </div>
            <div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:8px">${chips(c, cerrada)}</div>
            ${c.clasificacion ? `
              <div style="margin-top:8px">
                <input class="input" data-nota="${KoguUi.escapeHtml(c.cliente_ref)}" ${cerrada ? 'disabled' : ''}
                  placeholder="Nota de la entrevista (opcional)" value="${KoguUi.escapeHtml(c.nota || '')}"
                  style="font-size:12px;max-width:520px"/>
              </div>` : ''}
          </div>
          <div style="text-align:right;min-width:130px">
            ${c.clasificacion ? `
              <div style="font-size:11px;color:var(--muted);text-transform:uppercase">Dictamen</div>
              <div style="font-size:14px;font-weight:800;color:${cat(c.clasificacion)?.color || 'inherit'}">${KoguUi.escapeHtml(cat(c.clasificacion)?.nombre || c.clasificacion)}</div>
              ${c.clasificacion !== c.propuesta ? '<div style="font-size:10px;color:var(--warning,#d97706)">corregido</div>' : '<div style="font-size:10px;color:var(--muted)">confirmado</div>'}
            ` : '<div style="font-size:11px;color:var(--muted)">Sin dictaminar</div>'}
            <div style="font-size:11px;color:var(--muted);margin-top:6px">${nf0.format(c.venta_12m)} <span style="font-size:10px">MXN 12m</span></div>
          </div>
        </div>
      </div>`;
    }).join('');

    document.querySelectorAll('#lista .btn[data-chip]').forEach(x => x.onclick = () => dictaminar(x.dataset.ref, x.dataset.chip, x));
    document.querySelectorAll('#lista .input[data-nota]').forEach(x => x.onchange = () => guardarNota(x.dataset.nota, x.value));
  }

  // ── Guardado ──────────────────────────────────────────────────────────────
  function payload(c, clasificacion, extra = {}) {
    const per = sel('mesFil');
    const body = {
      agente_id: sel('agenteFil'), anio: data.anio, mes: data.mes,
      cliente_ref: c.cliente_ref, cliente_nombre: c.cliente_nombre,
      clasificacion,
      // Se manda lo que el sistema propuso para que quede junto al dictamen:
      // es lo que después permite medir su acierto.
      propuesta: c.propuesta, propuesta_motivo: c.propuesta_motivo,
      nota: c.nota || null,
      venta_periodo: c.venta_periodo, venta_base: c.venta_base,
      kg_periodo: c.kg_periodo, kg_base: c.kg_base,
      ...extra,
    };
    if (per) { const [aa, mm] = per.split('-'); body.anio = Number(aa); body.mes = Number(mm); }
    return body;
  }

  async function dictaminar(ref, clave, btn) {
    const c = data.clientes.find(x => x.cliente_ref === ref);
    if (!c) return;
    const meta = cat(clave);
    let fecha = null;
    if (meta?.pide_fecha) {
      fecha = prompt(`${meta.nombre}: ¿para cuándo se espera que regrese? (AAAA-MM-DD)`, c.fecha_regreso || '');
      if (!fecha) return;                       // cancelar no dictamina
    }
    try {
      await KoguUi.withLoading(btn, async () => {
        await KoguApi.apiFetch(`${BASE}/revision/dictamen`, {
          method: 'POST', body: JSON.stringify(payload(c, clave, fecha ? { fecha_regreso: fecha } : {})),
        });
      }, '…');
      c.clasificacion = clave;
      if (fecha) c.fecha_regreso = fecha;
      recalcularAvance();
      render();
    } catch (err) { KoguApi.toast(err.message, 'error'); }
  }

  async function guardarNota(ref, nota) {
    const c = data.clientes.find(x => x.cliente_ref === ref);
    if (!c || !c.clasificacion) return;
    c.nota = nota;
    try {
      await KoguApi.apiFetch(`${BASE}/revision/dictamen`, {
        method: 'POST', body: JSON.stringify(payload(c, c.clasificacion, { nota })),
      });
    } catch (err) { KoguApi.toast(err.message, 'error'); }
  }

  function recalcularAvance() {
    const d = data.clientes.filter(x => x.clasificacion).length;
    data.avance = { total: data.clientes.length, dictaminados: d, pendientes: data.clientes.length - d };
  }

  // Confirmar en bloque SÓLO lo que no tiene nada que decidir. Los dictámenes
  // de juicio (caídas, bajas, spot) se tocan uno por uno a propósito: si se
  // pudieran aceptar todos de un clic, el dictamen dejaría de ser una opinión
  // humana y la medición del acierto no valdría nada.
  async function confirmarLote(btn) {
    const pend = data.clientes.filter(c => !c.clasificacion && SIN_DECISION.includes(c.propuesta));
    if (!pend.length) return;
    await KoguUi.withLoading(btn, async () => {
      let ok = 0;
      for (const c of pend) {
        try {
          await KoguApi.apiFetch(`${BASE}/revision/dictamen`, {
            method: 'POST', body: JSON.stringify(payload(c, c.propuesta)),
          });
          c.clasificacion = c.propuesta; ok++;
        } catch (err) { KoguApi.toast(err.message, 'error'); break; }
      }
      KoguApi.toast(`${ok} cliente(s) confirmados`, 'success');
      recalcularAvance();
      render();
    }, 'Confirmando…');
  }

  async function cerrarOReabrir(btn) {
    const cerrada = data.revision?.estado === 'cerrada';
    if (!cerrada && data.avance.pendientes) {
      if (!confirm(`Faltan ${data.avance.pendientes} cliente(s) por dictaminar. ¿Cerrar de todas formas?`)) return;
    }
    if (!data.revision?.revision_id) { KoguApi.toast('Dictamina al menos un cliente antes de cerrar.', 'error'); return; }
    try {
      await KoguUi.withLoading(btn, async () => {
        await KoguApi.apiFetch(`${BASE}/revision/${data.revision.revision_id}/${cerrada ? 'reabrir' : 'cerrar'}`, { method: 'POST' });
      }, '…');
      await load();
    } catch (err) { KoguApi.toast(err.message, 'error'); }
  }

  // ── Exportar para el comité ───────────────────────────────────────────────
  function exportar() {
    if (!data) return;
    const filas = data.clientes.map(c => ({
      'Cve': c.cliente_ref,
      'Cliente': c.cliente_nombre || '',
      'Dictamen': cat(c.clasificacion)?.nombre || '',
      'Propuesta del sistema': cat(c.propuesta)?.nombre || '',
      '¿Corregido?': c.clasificacion ? (c.clasificacion === c.propuesta ? 'No' : 'Sí') : '',
      'Motivo de la propuesta': c.propuesta_motivo || '',
      'Nota': c.nota || '',
      'Venta base': Number(c.venta_base || 0),
      'Venta periodo': Number(c.venta_periodo || 0),
      'Variación': c.delta == null ? null : Number(c.delta),
      'Kg periodo': Number(c.kg_periodo || 0),
      'Última compra': c.ultima_compra ? String(c.ultima_compra).slice(0, 10) : '',
      'Días sin comprar': c.dias_sin_compra ?? null,
      'Mes anterior': cat(c.previo?.clasificacion)?.nombre || '',
    }));
    const ws = XLSX.utils.json_to_sheet(filas);
    ws['!cols'] = [{ wch: 8 }, { wch: 34 }, { wch: 16 }, { wch: 20 }, { wch: 12 }, { wch: 52 }, { wch: 40 },
                   { wch: 15 }, { wch: 15 }, { wch: 11 }, { wch: 13 }, { wch: 14 }, { wch: 15 }, { wch: 16 }];
    ws['!autofilter'] = { ref: ws['!ref'] };
    const rango = XLSX.utils.decode_range(ws['!ref']);
    for (let R = 1; R <= rango.e.r; R++) {
      for (const [col, fmt] of [[7, '#,##0.00'], [8, '#,##0.00'], [9, '0.0%'], [10, '#,##0']]) {
        const cel = ws[XLSX.utils.encode_cell({ r: R, c: col })];
        if (cel && cel.v != null) cel.z = fmt;
      }
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Revisión');
    const ag = (data.agente.nombre || 'agente').replace(/[^\w]+/g, '_').slice(0, 24);
    XLSX.writeFile(wb, `Revision_${ag}_${data.anio}-${String(data.mes).padStart(2, '0')}.xlsx`);
  }

  // ── Eventos ───────────────────────────────────────────────────────────────
  document.getElementById('agenteFil').onchange = load;
  document.getElementById('mesFil').onchange = load;
  document.getElementById('vistaFil').onchange = renderLista;
  document.getElementById('qFil').oninput = renderLista;
  document.getElementById('confirmarLoteBtn').onclick = e => confirmarLote(e.target);
  document.getElementById('cerrarBtn').onclick = e => cerrarOReabrir(e.target);
  document.getElementById('exportBtn').onclick = exportar;

  llenarMeses();
  await loadAgentes();
  KoguShell.subscribeEmpresaActivaChange(async () => { await loadAgentes(); await load(); });
  await load();
});

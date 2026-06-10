document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/crm/actividades.html';
  const BASE = '/protected/crm';

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Actividades de seguimiento',
    description: 'Acciones comerciales nacidas del Radar: vigencias, recordatorios y bitácora por cliente.',
    requiredPermission: 'crm.actividades.read',
  });
  if (!b) return;

  const c = document.getElementById('pageContent');
  c.innerHTML = `
<div class="stack" style="gap:16px">
  <div class="card">
    <div class="row">
      <div><div class="eyebrow">CRM · Seguimiento</div><h2 style="margin:2px 0 0">Actividades</h2></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <select class="select" id="vigFil" style="max-width:170px">
          <option value="">Todas las vigencias</option>
          <option value="abiertas">Solo abiertas</option>
          <option value="vencidas">Vencidas</option>
          <option value="por_vencer">Por vencer (7 días)</option>
        </select>
        <select class="select" id="estFil" style="max-width:160px">
          <option value="">Todo estado</option>
          <option value="abierta">Abierta</option>
          <option value="en_proceso">En proceso</option>
          <option value="cerrada">Cerrada</option>
          <option value="cancelada">Cancelada</option>
        </select>
        <input class="input" id="cliFil" placeholder="Cliente (cve)" style="max-width:140px"/>
      </div>
    </div>
    <div id="kpis" style="margin-top:14px"></div>
  </div>
  <div class="card">
    <div id="lista"></div>
  </div>
</div>`;

  const money = v => KoguUi.money(Number(v || 0));
  const nf0 = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 });
  const esc = s => KoguUi.escapeHtml(String(s ?? ''));
  const sel = id => document.getElementById(id)?.value ?? '';
  const MESES = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const mesIso = iso => iso ? `${MESES[new Date(iso).getUTCMonth() + 1]} ${String(new Date(iso).getUTCFullYear()).slice(2)}` : '';
  const fechaCorta = iso => iso ? KoguUi.fmtDate(iso).split(',')[0] : '—';

  const SEV = { critica: 'var(--danger,#dc2626)', alerta: 'var(--warning,#d97706)', info: 'var(--muted,#64748b)' };
  const SEV_TXT = { critica: 'Crítica', alerta: 'Alerta', info: 'Info' };
  const EST = { abierta: 'var(--brand,#2563eb)', en_proceso: 'var(--warning,#d97706)', cerrada: 'var(--ok,#16a34a)', cancelada: 'var(--muted,#64748b)' };
  const EST_TXT = { abierta: 'Abierta', en_proceso: 'En proceso', cerrada: 'Cerrada', cancelada: 'Cancelada' };
  const RES_TXT = { recuperado: 'Recuperado', parcial: 'Parcial', perdido: 'Perdido', no_aplica: 'No aplica' };

  const miniCard = (lbl, val, hint = '', color = '') => `
    <div style="border:1px solid var(--line);border-radius:10px;padding:9px 12px">
      <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.03em">${esc(lbl)}</div>
      <div style="font-size:17px;font-weight:800;line-height:1.15;margin-top:1px;${color ? `color:${color}` : ''}">${esc(val)}</div>
      ${hint ? `<div style="font-size:10px;color:var(--muted)">${esc(hint)}</div>` : ''}
    </div>`;

  let items = [];

  async function loadKpis() {
    try {
      const res = await KoguApi.apiFetch(`${BASE}/actividades/resumen`);
      const k = res?.data || res || {};
      document.getElementById('kpis').innerHTML = `
        <div class="grid-4" style="gap:10px">
          ${miniCard('Abiertas', String(k.abiertas || 0), 'en seguimiento')}
          ${miniCard('Vencidas', String(k.vencidas || 0), 'fuera de vigencia', (k.vencidas > 0) ? 'var(--danger,#dc2626)' : '')}
          ${miniCard('Por vencer', String(k.por_vencer || 0), 'próximos 7 días', (k.por_vencer > 0) ? 'var(--warning,#d97706)' : '')}
          ${miniCard('Monto en seguimiento', money(k.monto_en_seguimiento), `${k.recuperadas || 0} recuperadas`)}
        </div>`;
    } catch (_) { document.getElementById('kpis').innerHTML = ''; }
  }

  function qs() {
    const p = new URLSearchParams();
    if (sel('estFil')) p.set('estado', sel('estFil'));
    if (sel('vigFil')) p.set('vigencia', sel('vigFil'));
    if (sel('cliFil').trim()) p.set('cliente_ref', sel('cliFil').trim());
    const s = p.toString();
    return s ? `?${s}` : '';
  }

  async function load() {
    document.getElementById('lista').innerHTML = '<div class="empty">Cargando…</div>';
    try {
      const res = await KoguApi.apiFetch(`${BASE}/actividades${qs()}`);
      const d = res?.data || res;
      items = d.items || [];
    } catch (err) { document.getElementById('lista').innerHTML = `<div class="empty">${esc(err.message)}</div>`; return; }
    render();
  }

  function vigBadge(a) {
    if (a.estado === 'cerrada' || a.estado === 'cancelada') return '';
    if (a.vencida) return `<span style="display:inline-block;padding:1px 8px;border-radius:999px;font-size:10px;font-weight:700;color:#fff;background:var(--danger,#dc2626)">Vencida</span>`;
    if (a.fecha_limite) return `<span style="font-size:11px;color:var(--muted)">vence ${fechaCorta(a.fecha_limite)}</span>`;
    return '';
  }

  function render() {
    if (!items.length) { document.getElementById('lista').innerHTML = '<div class="empty">Sin actividades para el filtro.</div>'; return; }
    document.getElementById('lista').innerHTML = items.map(a => {
      const sevC = SEV[a.severidad] || SEV.info;
      const estC = EST[a.estado] || EST.abierta;
      return `<div style="border:1px solid var(--line);border-left:4px solid ${a.vencida ? 'var(--danger,#dc2626)' : estC};border-radius:12px;padding:13px 15px;margin-bottom:9px;cursor:pointer" data-act="${esc(a.actividad_id)}">
        <div class="row" style="align-items:center">
          <div style="flex:1">
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
              <span style="display:inline-block;padding:2px 10px;border-radius:999px;font-size:11px;font-weight:600;color:#fff;background:${estC}">${EST_TXT[a.estado] || a.estado}</span>
              ${a.severidad ? `<span style="display:inline-block;padding:2px 9px;border-radius:999px;font-size:10px;font-weight:600;color:#fff;background:${sevC}">${SEV_TXT[a.severidad] || a.severidad}</span>` : ''}
              <span style="font-weight:700">${esc(a.cliente_nombre || a.cliente_ref)}</span>
              <span style="font-size:11px;color:var(--muted)">· ${esc(a.cliente_ref)}</span>
              ${vigBadge(a)}
            </div>
            <div style="font-size:12px;color:var(--muted);margin-top:3px">${esc(a.titulo)}${a.resultado ? ` · <b>${RES_TXT[a.resultado] || a.resultado}</b>` : ''}</div>
          </div>
          <div style="text-align:right;min-width:130px">
            <div style="font-size:11px;color:var(--muted);text-transform:uppercase">En riesgo</div>
            <div style="font-size:17px;font-weight:800;color:var(--danger,#dc2626)">${a.monto_riesgo != null ? money(a.monto_riesgo) : '—'}</div>
          </div>
        </div>
      </div>`;
    }).join('');
    document.querySelectorAll('#lista [data-act]').forEach(x => x.onclick = () => openDetalle(x.dataset.act));
  }

  // ── Detalle (modal) ───────────────────────────────────────────
  async function openDetalle(id) {
    let d;
    try {
      const res = await KoguApi.apiFetch(`${BASE}/actividades/${encodeURIComponent(id)}`);
      d = res?.data || res;
    } catch (err) { KoguApi.toast(err.message, 'error'); return; }
    renderDetalle(d);
  }
  function closeDetalle() { document.getElementById('crmActModal')?.remove(); }

  function snapshotHtml(snap) {
    if (!snap || typeof snap !== 'object') return '';
    const p = snap.periodos || {};
    const prods = Array.isArray(snap.productos) ? snap.productos : [];
    const rango = (p.p1d && p.p2d) ? `${mesIso(p.p1d)} vs ${mesIso(p.p2d)}` : '';
    const filas = prods.slice(0, 30).map(pr => {
      const v1 = pr.importe_p1 ?? pr.p1, v2 = pr.importe_p2 ?? pr.p2;
      return `<tr><td>${pr.cve_prod ? `<span class="chip-compact">${esc(pr.cve_prod)}</span>` : ''}</td>
        <td>${esc(pr.desc_prod || '')}${pr.abandonado ? ' <span style="color:var(--danger,#dc2626);font-weight:600">abandonado</span>' : ''}</td>
        <td style="text-align:right">${v1 != null ? money(v1) : '—'}</td>
        <td style="text-align:right">${v2 != null ? money(v2) : '—'}</td></tr>`;
    }).join('');
    return `
      <div class="eyebrow" style="margin:14px 0 6px">Snapshot al crear ${rango ? `· ${rango}` : ''}</div>
      ${filas ? `<div class="table-wrap"><table><thead><tr><th>Cve</th><th>Producto</th><th style="text-align:right">P1</th><th style="text-align:right">P2</th></tr></thead><tbody>${filas}</tbody></table></div>`
               : '<div class="hint" style="color:var(--muted);font-size:12px">Sin detalle de productos en el snapshot.</div>'}`;
  }

  function renderDetalle(d) {
    const estC = EST[d.estado] || EST.abierta;
    const coments = (d.comentarios || []).map(x => `
      <div style="border-left:3px solid var(--line);padding:6px 0 6px 10px;margin:6px 0">
        <div style="font-size:11px;color:var(--muted)">${esc(x.autor_nombre || 'Usuario')} · ${fechaCorta(x.created_at)}</div>
        <div style="font-size:13px;white-space:pre-wrap">${esc(x.comentario)}</div>
      </div>`).join('') || '<div class="hint" style="color:var(--muted);font-size:12px">Sin comentarios aún.</div>';
    const recs = (d.recordatorios || []).map(r => `
      <div style="display:flex;justify-content:space-between;gap:8px;font-size:12px;padding:3px 0">
        <span>${fechaCorta(r.fecha_programada)} · ${esc(r.canal)}</span>
        <span style="color:var(--muted)">${esc(r.estado)}</span>
      </div>`).join('') || '<div class="hint" style="color:var(--muted);font-size:12px">Sin recordatorios.</div>';
    const activa = d.estado === 'abierta' || d.estado === 'en_proceso';

    const html = `
      <div id="crmActModal" style="position:fixed;inset:0;z-index:9999;background:rgba(15,23,42,.55);display:flex;justify-content:center;align-items:flex-start;overflow:auto;padding:32px 16px">
        <div style="background:var(--panel,#fff);border-radius:16px;max-width:840px;width:100%;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,.3)">
          <div class="row" style="align-items:flex-start;margin-bottom:6px">
            <div>
              <div style="display:flex;gap:8px;align-items:center">
                <span style="display:inline-block;padding:2px 10px;border-radius:999px;font-size:11px;font-weight:600;color:#fff;background:${estC}">${EST_TXT[d.estado] || d.estado}</span>
                ${d.vencida ? '<span style="display:inline-block;padding:2px 9px;border-radius:999px;font-size:10px;font-weight:700;color:#fff;background:var(--danger,#dc2626)">Vencida</span>' : ''}
              </div>
              <h2 style="margin:6px 0 0">${esc(d.cliente_nombre || d.cliente_ref)}</h2>
              <div class="hint" style="color:var(--muted);font-size:12px">${esc(d.titulo)} · vigencia ${fechaCorta(d.fecha_limite)} · ${d.monto_riesgo != null ? money(d.monto_riesgo) : '—'} en riesgo</div>
            </div>
            <button class="btn" id="crmActClose">Cerrar ✕</button>
          </div>

          ${d.descripcion ? `<div style="font-size:13px;margin-top:8px">${esc(d.descripcion)}</div>` : ''}
          ${snapshotHtml(d.snapshot)}

          <div class="eyebrow" style="margin:16px 0 6px">Bitácora</div>
          <div id="crmComents">${coments}</div>
          <div style="display:flex;gap:8px;margin-top:8px">
            <input class="input" id="crmNuevoComent" placeholder="Agregar comentario…" style="flex:1"/>
            <button class="btn" id="crmAddComent">Comentar</button>
          </div>

          <div class="eyebrow" style="margin:16px 0 6px">Recordatorios</div>
          <div>${recs}</div>
          <div style="display:flex;gap:8px;margin-top:8px;align-items:end;flex-wrap:wrap">
            <div><div class="label-text">Fecha</div><input class="input" id="crmRecFecha" type="date"/></div>
            <div><div class="label-text">Canal</div><select class="select" id="crmRecCanal"><option value="in_app">In-app</option><option value="email">Correo</option></select></div>
            <button class="btn" id="crmAddRec">Programar</button>
          </div>

          ${activa ? `
          <div class="eyebrow" style="margin:18px 0 6px">Acciones</div>
          <div style="display:flex;gap:8px;align-items:end;flex-wrap:wrap">
            ${d.estado === 'abierta' ? '<button class="btn" id="crmTomar">Tomar (en proceso)</button>' : ''}
            <div><div class="label-text">Nueva vigencia</div><input class="input" id="crmFechaLim" type="date" value="${d.fecha_limite || ''}"/></div>
            <button class="btn" id="crmGuardarVig">Actualizar vigencia</button>
            <div><div class="label-text">Resultado</div>
              <select class="select" id="crmResultado">
                <option value="">—</option>
                <option value="recuperado">Recuperado</option>
                <option value="parcial">Parcial</option>
                <option value="perdido">Perdido</option>
                <option value="no_aplica">No aplica</option>
              </select>
            </div>
            <button class="btn primary" id="crmCerrar">Cerrar actividad</button>
            <button class="btn" id="crmCancelar">Cancelar</button>
          </div>` : ''}
        </div>
      </div>`;
    closeDetalle();
    document.body.insertAdjacentHTML('beforeend', html);
    document.getElementById('crmActClose').onclick = closeDetalle;
    document.getElementById('crmActModal').onclick = e => { if (e.target.id === 'crmActModal') closeDetalle(); };

    const refresh = async () => { await openDetalle(d.actividad_id); await loadKpis(); await load(); };

    document.getElementById('crmAddComent').onclick = (e) => KoguUi.withLoading(e.target, async () => {
      const txt = document.getElementById('crmNuevoComent').value.trim();
      if (!txt) return;
      await KoguApi.apiFetch(`${BASE}/actividades/${d.actividad_id}/comentarios`, { method: 'POST', body: JSON.stringify({ comentario: txt }) });
      await refresh();
    }, 'Guardando…').catch(err => KoguApi.toast(err.message, 'error'));

    document.getElementById('crmAddRec').onclick = (e) => KoguUi.withLoading(e.target, async () => {
      const f = document.getElementById('crmRecFecha').value;
      if (!f) { KoguApi.toast('Elige una fecha', 'error'); return; }
      await KoguApi.apiFetch(`${BASE}/actividades/${d.actividad_id}/recordatorios`, { method: 'POST', body: JSON.stringify({ fecha_programada: f, canal: document.getElementById('crmRecCanal').value }) });
      await refresh();
    }, 'Programando…').catch(err => KoguApi.toast(err.message, 'error'));

    if (activa) {
      const patch = async (body, msg) => {
        await KoguApi.apiFetch(`${BASE}/actividades/${d.actividad_id}`, { method: 'PATCH', body: JSON.stringify(body) });
        KoguApi.toast(msg, 'success');
        await refresh();
      };
      const tomar = document.getElementById('crmTomar');
      if (tomar) tomar.onclick = (e) => KoguUi.withLoading(e.target, () => patch({ estado: 'en_proceso' }, 'Actividad en proceso'), 'Guardando…').catch(err => KoguApi.toast(err.message, 'error'));
      document.getElementById('crmGuardarVig').onclick = (e) => KoguUi.withLoading(e.target, () => patch({ fecha_limite: document.getElementById('crmFechaLim').value || null }, 'Vigencia actualizada'), 'Guardando…').catch(err => KoguApi.toast(err.message, 'error'));
      document.getElementById('crmCerrar').onclick = (e) => {
        const r = document.getElementById('crmResultado').value;
        if (!r) { KoguApi.toast('Elige un resultado para cerrar', 'error'); return; }
        KoguUi.withLoading(e.target, () => patch({ estado: 'cerrada', resultado: r }, 'Actividad cerrada'), 'Cerrando…').catch(err => KoguApi.toast(err.message, 'error'));
      };
      document.getElementById('crmCancelar').onclick = (e) => KoguUi.withLoading(e.target, () => patch({ estado: 'cancelada' }, 'Actividad cancelada'), 'Cancelando…').catch(err => KoguApi.toast(err.message, 'error'));
    }
  }

  document.getElementById('estFil').onchange = load;
  document.getElementById('vigFil').onchange = load;
  document.getElementById('cliFil').oninput = (() => { let t; return () => { clearTimeout(t); t = setTimeout(load, 350); }; })();
  KoguShell.subscribeEmpresaActivaChange(async () => { await loadKpis(); await load(); });
  await loadKpis();
  await load();
});

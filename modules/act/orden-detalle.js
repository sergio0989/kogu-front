// ============================================================
// orden-detalle.js
// Pantalla: Detalle de orden de trabajo (mantenimiento / reparación).
// Endpoints: GET /ordenes/:id, POST /ordenes/:id/estado|cerrar|nota
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const b = await KoguShell.initShell({
    currentPage:        '/modules/act/mantenimiento.html',
    title:              'Orden de trabajo',
    description:        'Detalle, ciclo de vida y bitácora de la orden.',
    requiredPermission: 'act.ordenes.read',
  });
  if (!b) return;

  const esc = KoguUi.escapeHtml;
  const canUpdate = KoguShell.hasPerm(b, 'act.ordenes.update');
  const canClose  = KoguShell.hasPerm(b, 'act.ordenes.close');

  const ESTADO_COLOR = { abierta: '#ca8a04', en_proceso: '#2563eb', en_espera: '#7c3aed', cerrada: '#16a34a', cancelada: '#dc2626' };
  const estadoBadge = e => { const c = ESTADO_COLOR[e] || '#64748b'; return `<span class="chip" style="background:${c}1a;color:${c};border:1px solid ${c}55">${esc((e || '').replace(/_/g, ' '))}</span>`; };
  // Transiciones vía POST /estado (cerrada va por /cerrar; backend valida).
  const TRANS = {
    abierta:    [{ to: 'en_proceso', label: 'Iniciar' }, { to: 'cancelada', label: 'Cancelar' }],
    en_proceso: [{ to: 'en_espera', label: 'Poner en espera' }, { to: 'cancelada', label: 'Cancelar' }],
    en_espera:  [{ to: 'en_proceso', label: 'Reanudar' }, { to: 'cancelada', label: 'Cancelar' }],
    cerrada: [], cancelada: [],
  };

  const params = new URLSearchParams(window.location.search);
  const ordenId = params.get('id');
  const pc = document.getElementById('pageContent');
  const $ = id => document.getElementById(id);

  if (!ordenId) {
    pc.innerHTML = `<div class="card"><div class="empty">Falta el parámetro de la orden. <a class="link" href="/modules/act/mantenimiento.html">Volver</a></div></div>`;
    return;
  }

  let data = null; // { orden, eventos }

  async function loadOrden() {
    try {
      const res = await KoguApi.apiFetch('/protected/act/ordenes/' + encodeURIComponent(ordenId));
      data = KoguApi.unwrapData(res);
      return true;
    } catch (_err) {
      pc.innerHTML = `<div class="card"><div class="empty">No se encontró la orden (o pertenece a otra empresa). <a class="link" href="/modules/act/mantenimiento.html">Volver</a></div></div>`;
      return false;
    }
  }

  function field(label, val, opts) {
    const v = (val == null || val === '') ? '<span class="muted">—</span>' : esc(String(val));
    const long = (opts && opts.long) ? ' kv-long' : '';
    return `<div class="kv-row${long}"><span class="kv-k">${esc(label)}</span><span class="kv-v">${v}</span></div>`;
  }

  function render() {
    const o = data.orden;
    const eventos = (data.eventos || []).slice().sort((a, c) => new Date(a.created_at) - new Date(c.created_at));
    const backHref = o.tipo === 'reparacion' ? '/modules/act/reparaciones.html' : '/modules/act/mantenimiento.html';

    // Acciones según estado
    let acciones = '';
    if (canUpdate) {
      (TRANS[o.estado] || []).forEach(t => {
        acciones += `<button class="btn ${t.to === 'cancelada' ? '' : 'primary'}" data-estado="${t.to}">${esc(t.label)}</button>`;
      });
    }
    if (canClose && o.estado === 'en_proceso') acciones += `<button class="btn primary" id="cerrarBtn">Cerrar</button>`;
    if (canUpdate && o.estado !== 'cerrada' && o.estado !== 'cancelada') acciones += `<button class="btn" id="notaBtn">+ Nota</button>`;

    pc.innerHTML = `
<div class="card">
  <div class="row">
    <div>
      <div class="eyebrow"><a class="link" href="${backHref}">← Volver</a></div>
      <h2 style="margin:4px 0">Orden #${esc(String(o.id_mov))} · ${esc(o.activo_codigo || '')}</h2>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        ${estadoBadge(o.estado)}<span class="chip">${esc(o.tipo)}</span><span class="chip">Prioridad: ${esc(o.prioridad || '—')}</span>
        ${o.activo_id ? `<a class="link" href="/modules/act/activo-detalle.html?id=${encodeURIComponent(o.activo_id)}">Ver activo →</a>` : ''}
      </div>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">${acciones}</div>
  </div>

  <div class="split" style="margin-top:16px">
    <div class="stack">
      ${field('Descripción del problema', o.descripcion_problema, { long: true })}
      ${o.diagnostico ? field('Diagnóstico', o.diagnostico, { long: true }) : ''}
      ${o.trabajo_realizado ? field('Trabajo realizado', o.trabajo_realizado, { long: true }) : ''}
      <div class="kv kv-2">
        ${field('Activo', (o.activo_codigo || '') + (o.activo_nombre ? ' · ' + o.activo_nombre : ''))}
        ${field('Proveedor / taller', o.proveedor_nombre)}
        ${field('Responsable', o.responsable_nombre)}
        ${field('Costo', o.costo != null ? KoguUi.fmtMoney(o.costo, o.moneda) : null)}
        ${field('Apertura', KoguUi.fmtDate(o.fecha_apertura))}
        ${field('Compromiso', o.fecha_compromiso)}
        ${field('Cierre', o.fecha_cierre ? KoguUi.fmtDate(o.fecha_cierre) : null)}
        ${o.plan_nombre ? field('Plan', o.plan_nombre) : ''}
      </div>
    </div>
    <div>
      <div class="eyebrow">Bitácora</div>
      <div class="stack" style="margin-top:8px">
        ${eventos.length ? eventos.map(ev => `
          <div class="card" style="padding:12px">
            <div style="display:flex;justify-content:space-between;gap:8px">
              <span class="chip">${esc((ev.tipo_evento || '').replace(/_/g, ' '))}</span>
              <span class="muted" style="font-size:12px">${KoguUi.fmtDate(ev.created_at)}</span>
            </div>
            <div style="margin-top:6px">${esc(ev.descripcion || '')}</div>
            ${ev.estado_anterior || ev.estado_nuevo ? `<div class="muted" style="font-size:12px;margin-top:4px">${esc(ev.estado_anterior || '—')} → ${esc(ev.estado_nuevo || '—')}</div>` : ''}
            ${ev.created_by_nombre ? `<div class="muted" style="font-size:12px;margin-top:4px">por ${esc(ev.created_by_nombre)}</div>` : ''}
          </div>`).join('') : '<div class="empty">Sin eventos en la bitácora.</div>'}
      </div>
    </div>
  </div>
</div>`;

    if (canUpdate) {
      pc.querySelectorAll('[data-estado]').forEach(btn => btn.onclick = () => cambiarEstado(btn.dataset.estado));
      const nb = $('notaBtn'); if (nb) nb.onclick = openNota;
    }
    if (canClose) { const cb = $('cerrarBtn'); if (cb) cb.onclick = openCerrar; }
  }

  async function cambiarEstado(nuevoEstado) {
    if (nuevoEstado === 'cancelada' && !window.confirm('¿Cancelar esta orden? No podrá reabrirse.')) return;
    try {
      await KoguApi.apiFetch('/protected/act/ordenes/' + encodeURIComponent(ordenId) + '/estado', {
        method: 'POST', body: JSON.stringify({ estado: nuevoEstado }),
      });
      KoguApi.toast('Estado actualizado', 'success');
      if (await loadOrden()) render();
    } catch (_err) { /* apiFetch toast: 422 transición inválida con mensaje del backend */ }
  }

  // ── Nota ────────────────────────────────────────────────────────────────────
  async function openNota() {
    const texto = window.prompt('Nota para la bitácora:');
    if (texto == null) return;
    const t = String(texto).trim();
    if (!t) { KoguApi.toast('La nota no puede estar vacía.', 'error'); return; }
    try {
      await KoguApi.apiFetch('/protected/act/ordenes/' + encodeURIComponent(ordenId) + '/nota', {
        method: 'POST', body: JSON.stringify({ descripcion: t }),
      });
      KoguApi.toast('Nota agregada', 'success');
      if (await loadOrden()) render();
    } catch (_err) { /* apiFetch toast */ }
  }

  // ── Cerrar (modal) ──────────────────────────────────────────────────────────
  function buildCerrarModal() {
    if (!canClose) return;
    const overlay = document.createElement('div');
    overlay.id = 'cerrarModal';
    overlay.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:9999;align-items:flex-start;justify-content:center;padding:40px 20px;backdrop-filter:blur(2px)';
    overlay.innerHTML = `
      <div style="width:100%;max-width:520px;background:white;border-radius:12px;box-shadow:0 20px 50px rgba(0,0,0,.3);color:#0f172a;overflow:hidden">
        <div style="padding:16px 20px;border-bottom:1px solid var(--line,#e2e8f0);display:flex;justify-content:space-between;align-items:center">
          <h2 style="margin:0;font-size:18px">Cerrar orden</h2><button class="btn ghost" id="cerClose" style="padding:6px 10px">✕</button>
        </div>
        <div style="padding:20px"><div class="stack">
          <div><div class="label-text">Trabajo realizado <span style="color:#dc2626">*</span></div><textarea class="input" id="cer_trabajo" rows="3" style="resize:vertical"></textarea></div>
          <div class="grid-2">
            <div><div class="label-text">Costo <span class="muted" style="font-size:11px">(opcional)</span></div><input class="input" id="cer_costo" type="number" min="0" step="0.01"/></div>
            <div><div class="label-text">Moneda</div><input class="input" id="cer_moneda" maxlength="3" placeholder="MXN"/></div>
          </div>
          <div><div class="label-text">Fecha de cierre <span class="muted" style="font-size:11px">(opcional, default hoy)</span></div><input class="input" id="cer_fecha" type="date"/></div>
        </div></div>
        <div style="padding:14px 20px;border-top:1px solid var(--line,#e2e8f0);display:flex;justify-content:flex-end;gap:8px">
          <button class="btn ghost" id="cerCancel">Cancelar</button><button class="btn primary" id="cerSave">Cerrar orden</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeCerrar(); });
    $('cerClose').onclick = closeCerrar; $('cerCancel').onclick = closeCerrar; $('cerSave').onclick = doCerrar;
  }
  function openCerrar() { ['cer_trabajo', 'cer_costo', 'cer_moneda', 'cer_fecha'].forEach(id => { if ($(id)) $(id).value = ''; }); $('cerrarModal').style.display = 'flex'; }
  function closeCerrar() { const m = $('cerrarModal'); if (m) m.style.display = 'none'; }

  async function doCerrar() {
    const trabajo = $('cer_trabajo').value.trim();
    if (!trabajo) { KoguApi.toast('El trabajo realizado es obligatorio.', 'error'); return; }
    const payload = {
      trabajo_realizado: trabajo,
      costo: $('cer_costo').value ? Number($('cer_costo').value) : null,
      moneda: $('cer_moneda').value.trim() || null,
      fecha_cierre: $('cer_fecha').value || null,
    };
    await KoguUi.withLoading(this, async () => {
      try {
        const res = await KoguApi.apiFetch('/protected/act/ordenes/' + encodeURIComponent(ordenId) + '/cerrar', {
          method: 'POST', body: JSON.stringify(payload),
        });
        const cerrada = KoguApi.unwrapData(res);
        KoguApi.toast('Orden cerrada', 'success');
        closeCerrar();
        if (await loadOrden()) render();
        // Nudge reparar-vs-reemplazar: banner ámbar no bloqueante.
        if (cerrada && cerrada.aviso_reemplazo && cerrada.aviso_reemplazo.mensaje) {
          mostrarAvisoReemplazo(cerrada.aviso_reemplazo);
        }
      } catch (_err) { /* apiFetch toast: 422 (falta trabajo / transición inválida) */ }
    }, 'Cerrando…');
  }

  function mostrarAvisoReemplazo(aviso) {
    const banner = document.createElement('div');
    banner.style.cssText = 'background:#fffbeb;border:1px solid #f59e0b;color:#92400e;border-radius:10px;padding:12px 14px;margin:0 0 14px;display:flex;justify-content:space-between;gap:12px';
    banner.innerHTML = `<div>⚠️ <strong>Aviso reparar-vs-reemplazar:</strong> ${esc(aviso.mensaje)}</div><button class="btn ghost" style="flex-shrink:0;padding:2px 8px">✕</button>`;
    banner.querySelector('button').onclick = () => banner.remove();
    const card = pc.querySelector('.card');
    if (card) card.insertBefore(banner, card.firstChild);
  }

  // ── Init ────────────────────────────────────────────────────────────────────
  buildCerrarModal();
  KoguShell.subscribeEmpresaActivaChange(() => { window.location.href = '/modules/act/mantenimiento.html'; });
  if (await loadOrden()) render();
});

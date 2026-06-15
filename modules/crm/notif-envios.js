document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/crm/notif-envios.html';
  const BASE = '/protected/crm';

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Bitácora de notificaciones',
    description: 'Envíos de WhatsApp y correo del CRM con la respuesta del proveedor.',
    requiredPermission: 'crm.notif.read',
  });
  if (!b) return;

  const esc = s => KoguUi.escapeHtml(String(s ?? ''));
  const sel = id => document.getElementById(id)?.value ?? '';
  const fechaHora = iso => iso ? KoguUi.fmtDate(iso) : '—';
  const EVT = { mencion: 'Mención', cambio_estado: 'Cambio de estado', recordatorio: 'Recordatorio' };

  const c = document.getElementById('pageContent');
  c.innerHTML = `
<div class="stack" style="gap:16px">
  <div class="card">
    <div class="row">
      <div><div class="eyebrow">CRM · Notificaciones</div><h2 style="margin:2px 0 0">Bitácora de envíos</h2></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end">
        <select class="select" id="canalFil" style="max-width:150px"><option value="">Todo canal</option><option value="whatsapp">WhatsApp</option><option value="email">Email</option></select>
        <select class="select" id="estadoFil" style="max-width:150px"><option value="">Todo estado</option><option value="enviado">Enviado</option><option value="fallido">Fallido</option><option value="omitido">Omitido</option></select>
        <select class="select" id="eventoFil" style="max-width:170px"><option value="">Todo evento</option><option value="mencion">Mención</option><option value="cambio_estado">Cambio de estado</option><option value="recordatorio">Recordatorio</option></select>
        <button class="btn" id="refrescar">↻</button>
      </div>
    </div>
    <div id="kpis" style="margin-top:14px"></div>
  </div>
  <div class="card"><div id="tabla"></div></div>
</div>`;

  const pill = (estado) => {
    const col = estado === 'enviado' ? 'var(--ok,#16a34a)' : (estado === 'fallido' ? 'var(--danger,#dc2626)' : 'var(--muted,#64748b)');
    return `<span style="display:inline-block;padding:1px 9px;border-radius:999px;font-size:11px;font-weight:600;color:#fff;background:${col}">${esc(estado)}</span>`;
  };

  function qs() {
    const p = new URLSearchParams();
    if (sel('canalFil')) p.set('canal', sel('canalFil'));
    if (sel('estadoFil')) p.set('estado', sel('estadoFil'));
    if (sel('eventoFil')) p.set('evento', sel('eventoFil'));
    const s = p.toString();
    return s ? `?${s}` : '';
  }

  async function load() {
    document.getElementById('tabla').innerHTML = '<div class="empty">Cargando…</div>';
    let rows;
    try {
      const res = await KoguApi.apiFetch(`${BASE}/envios${qs()}`);
      rows = res?.data || res || [];
    } catch (err) { document.getElementById('tabla').innerHTML = `<div class="empty">${esc(err.message)}</div>`; return; }

    const n = rows.length, ok = rows.filter(r => r.estado === 'enviado').length, fail = rows.filter(r => r.estado === 'fallido').length;
    document.getElementById('kpis').innerHTML = `
      <div class="grid-4" style="gap:10px">
        <div style="border:1px solid var(--line);border-radius:10px;padding:9px 12px"><div style="font-size:10px;color:var(--muted);text-transform:uppercase">Envíos</div><div style="font-size:17px;font-weight:800">${n}</div></div>
        <div style="border:1px solid var(--line);border-radius:10px;padding:9px 12px"><div style="font-size:10px;color:var(--muted);text-transform:uppercase">Enviados</div><div style="font-size:17px;font-weight:800;color:var(--ok,#16a34a)">${ok}</div></div>
        <div style="border:1px solid var(--line);border-radius:10px;padding:9px 12px"><div style="font-size:10px;color:var(--muted);text-transform:uppercase">Fallidos</div><div style="font-size:17px;font-weight:800;color:${fail ? 'var(--danger,#dc2626)' : 'inherit'}">${fail}</div></div>
        <div style="border:1px solid var(--line);border-radius:10px;padding:9px 12px"><div style="font-size:10px;color:var(--muted);text-transform:uppercase">Mostrando</div><div style="font-size:17px;font-weight:800">últimos ${n}</div></div>
      </div>`;

    if (!n) { document.getElementById('tabla').innerHTML = '<div class="empty">Sin envíos para el filtro.</div>'; return; }
    const filas = rows.map(r => {
      const err = r.respuesta && (r.respuesta.error || r.respuesta.reason);
      const act = r.cliente_nombre || r.cliente_ref || r.titulo || '—';
      return `<tr>
        <td style="white-space:nowrap">${esc(fechaHora(r.created_at))}</td>
        <td>${esc(EVT[r.evento] || r.evento || '—')}</td>
        <td>${esc(r.canal)}</td>
        <td>${pill(r.estado)}</td>
        <td>${esc(act)}</td>
        <td style="font-size:12px">${esc(r.destinatario || '')}</td>
        <td style="font-size:11px;color:var(--muted)">${esc(r.proveedor_ref || '')}${err ? `<div style="color:var(--danger,#dc2626)">${esc(String(err))}</div>` : ''}</td>
      </tr>`;
    }).join('');
    document.getElementById('tabla').innerHTML = `
      <div class="table-wrap"><table>
        <thead><tr><th>Fecha</th><th>Evento</th><th>Canal</th><th>Estado</th><th>Actividad</th><th>Destinatario</th><th>Proveedor / detalle</th></tr></thead>
        <tbody>${filas}</tbody></table></div>`;
  }

  document.getElementById('canalFil').onchange = load;
  document.getElementById('estadoFil').onchange = load;
  document.getElementById('eventoFil').onchange = load;
  document.getElementById('refrescar').onclick = load;
  KoguShell.subscribeEmpresaActivaChange(load);
  await load();
});

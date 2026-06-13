document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/crm/notif-plantillas.html';
  const BASE = '/protected/crm';

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Plantillas de notificación',
    description: 'Define qué plantilla usa cada evento del CRM por canal (WhatsApp / Email).',
    requiredPermission: 'crm.notif.read',
  });
  if (!b) return;

  const esc = s => KoguUi.escapeHtml(String(s ?? ''));
  const puedeManage = KoguShell.hasPerm(b, 'crm.notif.manage');
  const EVENTOS = [
    { k: 'mencion', label: 'Mención (@ en comentario)' },
    { k: 'cambio_estado', label: 'Cambio de estado' },
    { k: 'recordatorio', label: 'Recordatorio (vigencia)' },
  ];
  const TOKENS = 'cliente, titulo, evento, fecha, monto, link';

  const c = document.getElementById('pageContent');
  c.innerHTML = `
<div class="stack" style="gap:16px">
  <div class="card">
    <div class="eyebrow">CRM · Notificaciones</div>
    <h2 style="margin:2px 0 4px">Plantillas por evento y canal</h2>
    <div class="hint" style="color:var(--muted);font-size:12.5px">
      Tokens disponibles: <code>{cliente}</code> <code>{titulo}</code> <code>{evento}</code> <code>{fecha}</code> <code>{monto}</code> <code>{link}</code>.
      En WhatsApp, el <b>orden de tokens</b> mapea a <b>{{1}}, {{2}}…</b> de tu plantilla aprobada (Twilio).
      ${puedeManage ? '' : '<br><b>Solo lectura</b> (te falta el permiso crm.notif.manage).'}
    </div>
  </div>
  <div id="cards" class="stack" style="gap:14px"><div class="empty">Cargando…</div></div>
</div>`;

  let config = {}; // `${evento}:${canal}` -> row

  async function load() {
    try {
      const res = await KoguApi.apiFetch(`${BASE}/notif-plantillas`);
      const rows = KoguApi.unwrapRows ? KoguApi.unwrapRows(res) : (res?.data || res || []);
      config = {};
      (rows || []).forEach(r => { config[`${r.evento}:${r.canal}`] = r; });
    } catch (err) { document.getElementById('cards').innerHTML = `<div class="empty">${esc(err.message)}</div>`; return; }
    render();
  }

  const dis = puedeManage ? '' : 'disabled';

  function cardEvento(ev) {
    const wa = config[`${ev.k}:whatsapp`] || {};
    const em = config[`${ev.k}:email`] || {};
    const varMap = Array.isArray(wa.var_map) ? wa.var_map.join(', ') : '';
    return `
    <div class="card" data-ev="${ev.k}">
      <h3 style="margin:0 0 10px;font-size:15px">${esc(ev.label)}</h3>
      <div class="grid-2" style="gap:18px">
        <div style="border:1px solid var(--line);border-radius:10px;padding:12px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <b style="font-size:13px">WhatsApp</b>
            <label style="font-size:12px;color:var(--muted)"><input type="checkbox" data-wa-activo ${wa.activo ? 'checked' : ''} ${dis}/> activo</label>
          </div>
          <div class="label-text">Content SID (Twilio)</div>
          <input class="input" data-wa-sid value="${esc(wa.content_sid || '')}" placeholder="HX…" style="width:100%;margin:4px 0 8px" ${dis}/>
          <div class="label-text">Variables (orden → {{1}},{{2}}…)</div>
          <input class="input" data-wa-vars value="${esc(varMap)}" placeholder="titulo, evento, fecha, monto" style="width:100%;margin-top:4px" ${dis}/>
          ${puedeManage ? `<button class="btn primary" data-save-wa style="margin-top:10px;font-size:12px">Guardar WhatsApp</button>` : ''}
        </div>
        <div style="border:1px solid var(--line);border-radius:10px;padding:12px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <b style="font-size:13px">Email</b>
            <label style="font-size:12px;color:var(--muted)"><input type="checkbox" data-em-activo ${em.activo ? 'checked' : ''} ${dis}/> activo</label>
          </div>
          <div class="label-text">Asunto</div>
          <input class="input" data-em-asunto value="${esc(em.asunto || '')}" placeholder="Ej. {evento}: {titulo}" style="width:100%;margin:4px 0 8px" ${dis}/>
          <div class="label-text">Cuerpo</div>
          <textarea class="input" data-em-cuerpo rows="3" placeholder="Ej. {evento} de {cliente}. Ver: {link}" style="width:100%;margin-top:4px" ${dis}>${esc(em.cuerpo || '')}</textarea>
          ${puedeManage ? `<button class="btn primary" data-save-em style="margin-top:10px;font-size:12px">Guardar Email</button>` : ''}
        </div>
      </div>
    </div>`;
  }

  function render() {
    document.getElementById('cards').innerHTML = EVENTOS.map(cardEvento).join('');
    if (!puedeManage) return;
    document.querySelectorAll('#cards [data-ev]').forEach(card => {
      const ev = card.dataset.ev;
      const guardar = async (canal, payload, btn) => KoguUi.withLoading(btn, async () => {
        await KoguApi.apiFetch(`${BASE}/notif-plantillas`, { method: 'PUT', body: JSON.stringify({ evento: ev, canal, ...payload }) });
        KoguApi.toast('Plantilla guardada', 'success');
        await load();
      }, 'Guardando…').catch(err => KoguApi.toast(err.message, 'error'));

      const waBtn = card.querySelector('[data-save-wa]');
      if (waBtn) waBtn.onclick = (e) => guardar('whatsapp', {
        activo: card.querySelector('[data-wa-activo]').checked,
        content_sid: card.querySelector('[data-wa-sid]').value.trim() || null,
        var_map: card.querySelector('[data-wa-vars]').value.split(',').map(s => s.trim()).filter(Boolean),
      }, e.target);

      const emBtn = card.querySelector('[data-save-em]');
      if (emBtn) emBtn.onclick = (e) => guardar('email', {
        activo: card.querySelector('[data-em-activo]').checked,
        asunto: card.querySelector('[data-em-asunto]').value.trim() || null,
        cuerpo: card.querySelector('[data-em-cuerpo]').value.trim() || null,
      }, e.target);
    });
  }

  KoguShell.subscribeEmpresaActivaChange(load);
  await load();
});

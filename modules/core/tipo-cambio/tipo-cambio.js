// ============================================================
// modules/core/tipo-cambio/tipo-cambio.js — Administrador → Tipo de cambio.
// FIX de Banxico (SF43718), global para todo KOGU (no por empresa): el del día,
// estado del sincronizador, historial con variación diaria, sincronizar a mano y
// captura manual de respaldo (con motivo; confirma si se aleja más de 5%).
// Endpoints: GET /protected/core/tipo-cambio[/historico|/estado],
//            POST /protected/core/tipo-cambio/sincronizar, POST /protected/core/tipo-cambio/manual
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  const b = await KoguShell.initShell({
    currentPage: '/modules/core/tipo-cambio/tipo-cambio.html',
    title: 'Tipo de cambio',
    description: 'FIX de Banxico (USD → MXN) que usa todo KOGU: el del día, historial y respaldo manual.',
    requiredPermission: 'core.tipo_cambio.manage',
  });
  if (!b) return;
  const T = KoguTc; const esc = KoguUi.escapeHtml;
  const pc = document.getElementById('pageContent');
  const BASE = '/protected/core/tipo-cambio';
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date());
  const menosDias = (f, n) => new Date(Date.parse(`${f}T00:00:00Z`) - n * 86400000).toISOString().slice(0, 10);
  const msg = (err) => err?.message || err?.data?.message || 'No se pudo completar.';
  const TONO = { ok: ['#f0fdf4', '#bbf7d0', '#166534'], aviso: ['#fffbeb', '#fde68a', '#92400e'], error: ['#fef2f2', '#fecaca', '#991b1b'] };
  let dias = 30; let filas = [];

  pc.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px">
      <div class="card" data-dia><div class="eyebrow">FIX de hoy</div><div class="muted" style="margin-top:8px">Cargando…</div></div>
      <div class="card" data-sync><div class="eyebrow">Sincronización con Banxico</div><div class="muted" style="margin-top:8px">Cargando…</div></div>
    </div>
    <div class="card" style="margin-top:14px">
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center">
        <div><div class="eyebrow">Historial</div><h2 style="margin:4px 0 0">Tipo de cambio por día</h2></div>
        <select class="select" data-dias aria-label="Periodo" style="width:auto;min-width:180px"><option value="30">Últimos 30 días</option><option value="90">Últimos 90 días</option></select>
      </div>
      <div class="table-wrap" style="margin-top:12px"><table style="table-layout:auto"><thead><tr style="white-space:nowrap">
        <th>Fecha</th><th style="text-align:right">FIX</th><th style="text-align:right">Variación vs día anterior</th><th>Fuente</th><th>Motivo</th><th>Capturó</th></tr></thead>
        <tbody data-hist><tr><td colspan="6" class="empty">Cargando…</td></tr></tbody></table></div>
      <div class="muted" style="font-size:12px;margin-top:8px">Banxico publica el FIX en días hábiles; fines de semana y festivos no aparecen y se usa el del día hábil anterior.</div>
    </div>
    <div class="card" style="margin-top:14px">
      <div class="eyebrow">Captura manual (respaldo)</div>
      <div class="muted" style="font-size:13px;margin-top:6px">Solo si Banxico no publicó o no respondió. Si después llega el FIX de Banxico para esa fecha, lo reemplaza y tu valor queda en la auditoría.</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-top:12px;align-items:end">
        <div><div class="label-text">Fecha</div><input class="input" type="date" data-f value="${hoy}" max="${hoy}" style="width:100%"/></div>
        <div><div class="label-text">Pesos por dólar</div><input class="input" data-v inputmode="decimal" placeholder="p. ej. 18.4523" style="width:100%"/></div>
        <div style="grid-column:span 2;min-width:0"><div class="label-text">Motivo</div><input class="input" data-m placeholder="Banxico no publicó, sin conexión…" style="width:100%"/></div>
      </div>
      <div data-cap-aviso style="display:none;margin-top:10px;font-size:13px;background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:8px 12px;color:#92400e"></div>
      <div style="margin-top:12px"><button class="btn primary" data-guardar>Guardar tipo de cambio</button></div>
    </div>`;
  const $ = (s) => pc.querySelector(s);

  async function cargarDia() {
    const el = $('[data-dia]');
    try {
      const t = T.tarjetaDia(KoguApi.unwrapData(await KoguApi.apiFetch(BASE)));
      el.innerHTML = `<div class="eyebrow">FIX de hoy</div>
        <div style="font-size:34px;font-weight:700;font-variant-numeric:tabular-nums;margin-top:6px">${esc(t.valor)} <span class="muted" style="font-size:14px;font-weight:500">MXN por USD</span></div>
        <div class="muted" style="font-size:13px">${esc(t.detalle)}</div>
        ${t.aviso ? `<div style="margin-top:8px;font-size:13px;background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:6px 10px;color:#92400e">${esc(t.aviso)}</div>` : ''}`;
    } catch (err) {
      el.innerHTML = `<div class="eyebrow">FIX de hoy</div><div style="margin-top:8px;color:#991b1b;font-weight:600">${esc(msg(err))}</div>
        <div class="muted" style="font-size:13px">Sincroniza con Banxico o captura el valor a mano.</div>`;
    }
  }

  async function cargarEstado() {
    const el = $('[data-sync]');
    let e = null;
    try { e = KoguApi.unwrapData(await KoguApi.apiFetch(`${BASE}/estado`)); } catch (_) { /* sin estado */ }
    const s = T.estadoSincronizador(e || {});
    const [bg, bd, fg] = TONO[s.tono];
    el.innerHTML = `<div class="eyebrow">Sincronización con Banxico</div>
      <div style="margin-top:8px;font-size:14px;background:${bg};border:1px solid ${bd};color:${fg};border-radius:10px;padding:8px 12px">${esc(s.texto)}</div>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:10px">
        <button class="btn" data-sincronizar ${e?.token_configurado ? '' : 'disabled'}>Sincronizar ahora</button>
        <span class="muted" style="font-size:12px">Trae de Banxico los últimos 10 días; no duplica.</span></div>
      <div style="border-top:1px solid var(--line);margin-top:12px;padding-top:12px">
        <div class="label-text">Cargar histórico desde</div>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:4px">
          <input class="input" type="date" data-hist-desde value="2023-01-01" min="2015-01-01" max="${hoy}" style="width:auto"/>
          <button class="btn" data-cargar-hist ${e?.token_configurado ? '' : 'disabled'}>Cargar histórico</button>
        </div>
        <div class="muted" style="font-size:12px;margin-top:4px">Una sola vez por ambiente: las cotizaciones viejas toman el tipo de cambio de su fecha. No duplica ni pisa lo que ya está.</div>
      </div>`;
    $('[data-sincronizar]').onclick = sincronizar;
    $('[data-cargar-hist]').onclick = cargarHistorico;
  }

  async function cargarHistorial() {
    const tb = $('[data-hist]');
    try {
      filas = T.filasHistorico(KoguApi.unwrapData(await KoguApi.apiFetch(`${BASE}/historico?${KoguUi.queryParams({ desde: menosDias(hoy, dias), hasta: hoy })}`)) || []);
      tb.innerHTML = filas.map((x) => {
        const v = x.variacion_dia_pct;
        const color = v == null ? '' : (x.fuera_de_banda ? 'color:#991b1b;font-weight:700' : '');
        const man = x.fuente === 'manual';
        return `<tr${man ? ' style="background:#fffbeb"' : ''}>
          <td style="white-space:nowrap">${esc(T.fecha(x.fecha))}</td>
          <td style="text-align:right;font-variant-numeric:tabular-nums;font-weight:600">${esc(Number(x.valor).toFixed(4))}</td>
          <td style="text-align:right;font-variant-numeric:tabular-nums;${color}">${v == null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(1)}%`}</td>
          <td>${man ? '<span class="chip" style="background:#fef3c7;color:#92400e;font-weight:600">Manual</span>' : 'Banxico'}${x.valor_manual != null ? ` <span class="muted" style="font-size:12px">(reemplazó manual ${esc(Number(x.valor_manual).toFixed(4))})</span>` : ''}</td>
          <td>${esc(x.motivo || '')}</td>
          <td>${esc(man || x.valor_manual != null ? (x.creado_por || '—') : '')}</td></tr>`;
      }).join('') || '<tr><td colspan="6" class="empty">Sin datos en el periodo. Sincroniza con Banxico.</td></tr>';
    } catch (err) { tb.innerHTML = `<tr><td colspan="6" class="empty">${esc(msg(err))}</td></tr>`; }
  }

  async function sincronizar(ev) {
    const btn = ev.currentTarget; btn.disabled = true; btn.textContent = 'Sincronizando…';
    try {
      const r = KoguApi.unwrapData(await KoguApi.apiFetch(`${BASE}/sincronizar`, { method: 'POST', body: JSON.stringify({ desde: menosDias(hoy, 9), hasta: hoy }) }));
      const g = Number(r?.guardados || 0);
      KoguApi.toast(g ? `Banxico: ${g} ${g === 1 ? 'día guardado' : 'días guardados'}.` : 'Banxico: sin días nuevos.', 'success');
      await Promise.all([cargarDia(), cargarEstado(), cargarHistorial()]);
    } catch (err) { KoguApi.toast(msg(err), 'error'); btn.disabled = false; btn.textContent = 'Sincronizar ahora'; }
  }

  async function cargarHistorico(ev) {
    const r = T.rangoHistorico($('[data-hist-desde]').value, hoy);
    if (!r.ok) { KoguApi.toast(r.error, 'error'); return; }
    const btn = ev.currentTarget; btn.disabled = true; btn.textContent = 'Cargando… (puede tardar unos segundos)';
    try {
      const x = KoguApi.unwrapData(await KoguApi.apiFetch(`${BASE}/sincronizar`, { method: 'POST', body: JSON.stringify(r.body) }));
      const g = Number(x?.guardados || 0);
      KoguApi.toast(g ? `Histórico cargado: ${g} días nuevos desde el ${T.fecha(r.body.desde)}.` : 'El histórico ya estaba completo; sin días nuevos.', 'success');
      dias = 90; $('[data-dias]').value = '90';
      await Promise.all([cargarDia(), cargarEstado(), cargarHistorial()]);
    } catch (err) { KoguApi.toast(msg(err), 'error'); btn.disabled = false; btn.textContent = 'Cargar histórico'; }
  }

  let confirmado = false;
  ['[data-f]', '[data-v]'].forEach((s) => $(s).addEventListener('input', () => { confirmado = false; $('[data-cap-aviso]').style.display = 'none'; $('[data-guardar]').textContent = 'Guardar tipo de cambio'; }));
  $('[data-guardar]').onclick = async (ev) => {
    const fecha = $('[data-f]').value;
    if (filas.some((x) => x.fecha === fecha && x.fuente === 'banxico')) { KoguApi.toast(`Ya hay FIX de Banxico para el ${T.fecha(fecha)}; no se captura a mano encima.`, 'error'); return; }
    const referencia = filas.find((x) => x.fecha < fecha)?.valor ?? null;   // el último anterior a esa fecha
    const r = T.revisarCaptura({ valor: $('[data-v]').value, motivo: $('[data-m]').value, referencia });
    if (!r.ok) { KoguApi.toast(r.error, 'error'); return; }
    if (r.requiereConfirmar && !confirmado) {
      const a = $('[data-cap-aviso]'); a.textContent = r.aviso; a.style.display = '';
      confirmado = true; ev.currentTarget.textContent = 'Sí, guardar de todos modos'; return;
    }
    const btn = ev.currentTarget; btn.disabled = true;
    try {
      await KoguApi.apiFetch(`${BASE}/manual`, { method: 'POST', body: JSON.stringify({ fecha, valor: r.valor, motivo: $('[data-m]').value.trim(), confirmar: confirmado }) });
      KoguApi.toast('Tipo de cambio guardado.', 'success');
      $('[data-v]').value = ''; $('[data-m]').value = ''; $('[data-cap-aviso]').style.display = 'none'; confirmado = false; btn.textContent = 'Guardar tipo de cambio';
      await Promise.all([cargarDia(), cargarHistorial()]);
    } catch (err) {
      // El backend compara contra su propio último dato; si pide confirmar, se muestra igual.
      if (err?.code === 'TC_DESVIACION' || err?.data?.code === 'TC_DESVIACION') {
        const a = $('[data-cap-aviso]'); a.textContent = msg(err); a.style.display = ''; confirmado = true; btn.textContent = 'Sí, guardar de todos modos';
      } else KoguApi.toast(msg(err), 'error');
    } finally { btn.disabled = false; }
  };
  $('[data-dias]').onchange = () => { dias = Number($('[data-dias]').value); cargarHistorial(); };

  await Promise.all([cargarDia(), cargarEstado(), cargarHistorial()]);
});

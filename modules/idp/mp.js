// ============================================================
// modules/idp/mp.js — Materias primas: una fila por clave de proveedor con su precio
// actual, escala mínima, origen y semáforo de vigencia. Por empresa activa.
// Endpoints: /protected/idp/mp/claves?q&origen&vigencia&incoterm · /protected/core/tipo-cambio
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  const b = await KoguShell.initShell({
    currentPage: '/modules/idp/mp.html',
    title: 'Materias primas',
    description: 'Precio negociado por clave de proveedor, con escalas, incoterm y vigencia.',
    requiredPermission: 'idp.mp.read',
  });
  if (!b) return;
  const I = KoguIdp; const esc = I.esc; const BASE = I.BASE;
  const puedeCapturar = KoguShell.hasPerm(b, 'idp.mp.capturar');
  const pc = document.getElementById('pageContent');
  const $ = (x) => document.getElementById(x);
  const f = { q: '', origen: '', vigencia: '', incoterm: '' };
  const VIG = [['', 'Todas'], ['vigente', 'Vigentes'], ['por_vencer', 'Por vencer'], ['vencida', 'Vencidas']];
  const tarjeta = (id, titulo, nota, bg, fg) => `<div style="flex:1 1 180px;background:${bg};border:1px solid ${fg}33;border-radius:12px;padding:10px 14px">
      <div id="${id}" style="font-size:22px;font-weight:700;color:${fg}">—</div><div style="font-size:13px;font-weight:600">${titulo}</div><div class="muted" style="font-size:12px">${nota}</div></div>`;

  pc.innerHTML = `
    <div class="card"><div class="row" style="gap:10px;flex-wrap:wrap;align-items:flex-end">
      <div style="flex:1;min-width:240px"><div class="label-text">Buscar</div><input class="input" id="fQ" placeholder="Clave, raíz, nombre o proveedor (WWP0098, ajo…)" autocomplete="off" style="width:100%"/></div>
      <div><div class="label-text">Origen</div><select class="select" id="fO"><option value="">Todos</option><option value="nacional">Nacional</option><option value="importacion">Importación</option><option value="por_revisar">Por revisar</option></select></div>
      <div><div class="label-text">Incoterm</div><select class="select" id="fI"><option value="">Todos</option>${['EXW', 'FCA', 'FOB', 'CFR', 'CIF', 'DAP', 'DDP', 'por_definir'].map((x) => `<option value="${x}">${x === 'por_definir' ? 'Por definir' : x}</option>`).join('')}</select></div>
      <div role="group" aria-label="Vigencia" id="fV" style="display:flex;gap:6px;flex-wrap:wrap">${VIG.map(([v, t]) => `<button class="btn${v === '' ? ' primary' : ''}" data-v="${v}">${t}</button>`).join('')}</div>
      <div style="margin-left:auto;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <span class="chip-compact" id="tc" title="Tipo de cambio FIX de Banxico">FIX …</span>
        ${puedeCapturar ? '<button class="btn primary" id="btnNueva">+ Nueva cotización</button>' : ''}
      </div>
    </div></div>
    <div style="display:flex;flex-wrap:wrap;gap:12px;margin-top:14px">
      ${tarjeta('kPv', 'Por vencer', 'Vencen en 30 días o menos', '#fffbeb', '#92400e')}
      ${tarjeta('kVe', 'Vencidas', 'Siguen visibles con aviso', '#fef2f2', '#991b1b')}
      ${tarjeta('kSe', 'Sin escala', 'Migradas del CRM sin cantidad', '#f8fafc', '#475569')}
      ${tarjeta('kOr', 'Origen por revisar', 'Sin país en la cotización', '#fff7ed', '#9a3412')}
    </div>
    <div class="card" style="margin-top:14px"><div class="eyebrow" id="lbl" style="margin-bottom:8px">Claves</div>
      <div class="table-wrap"><table style="table-layout:auto"><thead><tr style="white-space:nowrap"><th>Clave</th><th>Materia prima</th><th>Proveedor</th><th>Origen</th><th>Incoterm</th>
        <th style="text-align:right">Precio</th><th style="text-align:right">Desde</th><th>Vigente hasta</th><th>Vigencia</th></tr></thead>
      <tbody id="tb"><tr><td colspan="9" class="empty">Cargando…</td></tr></tbody></table></div>
      <div style="text-align:center;margin-top:10px"><button class="btn" id="btnMas" style="display:none">Ver más</button></div>
      <div class="muted" style="font-size:12px;margin-top:8px">Cada clave es su propia materia prima: buscar por raíz trae sus claves, pero no las agrupa ni las compara. Precio = escala mínima de la cotización actual.</div></div>`;

  (async () => {
    try {
      const t = KoguApi.unwrapData(await KoguApi.apiFetch('/protected/core/tipo-cambio'));
      $('tc').textContent = `FIX ${KoguUi.fmtDateOnly ? KoguUi.fmtDateOnly(t.fecha_dato) : t.fecha_dato} · USD 1 = ${Number(t.valor).toFixed(4)} MXN${t.es_anterior ? ' (anterior)' : ''}`;
    } catch (_) { $('tc').textContent = 'Tipo de cambio no disponible'; }
  })();

  const PAGINA = 100; let todas = []; let mostradas = PAGINA;
  async function cargar() {
    let filas = [];
    try { filas = KoguApi.unwrapData(await KoguApi.apiFetch(`${BASE}/mp/claves?${KoguUi.queryParams(f)}`)) || []; }
    catch (err) { $('tb').innerHTML = `<tr><td colspan="9" class="empty">${esc(I.mensajeError(err))}</td></tr>`; return; }
    const r = I.resumenMp(filas);
    $('kPv').textContent = r.por_vencer; $('kVe').textContent = r.vencida; $('kSe').textContent = r.sin_escala; $('kOr').textContent = r.por_revisar;
    $('lbl').textContent = `${filas.length.toLocaleString('es-MX')} clave${filas.length === 1 ? '' : 's'} · una fila por clave`;
    todas = filas; mostradas = PAGINA; pintar();
  }
  function pintar() {
    const filas = todas.slice(0, mostradas);
    $('btnMas').style.display = todas.length > mostradas ? '' : 'none';
    $('btnMas').textContent = `Ver más (${(todas.length - mostradas).toLocaleString('es-MX')} restantes)`;
    $('tb').innerHTML = filas.length ? filas.map((x) => `<tr data-id="${esc(x.clave_id)}" style="cursor:pointer">
      <td style="white-space:nowrap"><span class="chip-compact">${esc(x.cve_prod)}</span></td>
      <td style="min-width:200px">${esc(x.desc_prod)}</td>
      <td style="min-width:180px;font-size:13px">${esc(x.proveedor_nombre || '—')}</td>
      <td>${I.chipOrigen(x.origen)}</td>
      <td style="white-space:nowrap">${x.incoterm === 'por_definir' ? '<span style="color:#b45309">Por definir</span>' : esc(x.incoterm || '—')}</td>
      <td style="text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums">${esc(I.precioMp(x.moneda, x.escalas?.[0]?.precio))}${(x.unidad || x.unidad_compra) && (x.unidad || x.unidad_compra) !== 'kg' ? ` <span class="muted" style="font-size:12px">/${esc(I.etiquetasUnidad(x.unidad || x.unidad_compra).corto)}</span>` : ''}</td>
      <td style="text-align:right;white-space:nowrap">${x.sin_escala ? '<span style="color:#b45309">Sin escala</span>' : x.minimo_kg != null ? `${Number(x.minimo_kg).toLocaleString('en-US')} ${esc(I.etiquetasUnidad(x.unidad || x.unidad_compra).corto)}` : '—'}</td>
      <td style="white-space:nowrap">${esc(x.vigente_hasta ? KoguUi.fmtDateOnly(x.vigente_hasta) : '—')}</td>
      <td>${I.chipVigencia(x.estado_vigencia)}</td></tr>`).join('') : '<tr><td colspan="9" class="empty">Sin claves con estos filtros.</td></tr>';
    $('tb').querySelectorAll('tr[data-id]').forEach((tr) => (tr.onclick = () => { location.href = `/modules/idp/mp-clave.html?id=${encodeURIComponent(tr.dataset.id)}`; }));
  }
  let t;
  $('btnMas').onclick = () => { mostradas += PAGINA; pintar(); };
  $('fQ').oninput = () => { clearTimeout(t); t = setTimeout(() => { f.q = $('fQ').value.trim(); cargar(); }, 300); };
  $('fO').onchange = () => { f.origen = $('fO').value; cargar(); };
  $('fI').onchange = () => { f.incoterm = $('fI').value; cargar(); };
  $('fV').querySelectorAll('[data-v]').forEach((x) => (x.onclick = () => {
    f.vigencia = x.dataset.v; $('fV').querySelectorAll('[data-v]').forEach((y) => y.classList.toggle('primary', y === x)); cargar();
  }));
  if ($('btnNueva')) $('btnNueva').onclick = () => KoguMpCaptura.abrir({ onGuardada: (x) => { location.href = `/modules/idp/mp-clave.html?id=${encodeURIComponent(x.clave_id)}`; } });
  cargar();
});

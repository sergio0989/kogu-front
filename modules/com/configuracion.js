document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/com/configuracion.html';
  const BASE = '/protected/com/config';
  const PERM = 'screen.comisiones';

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Configuración de Comisiones',
    description: 'Parámetros por empresa que usa el cálculo: tipo de cambio de pago, exclusiones de cliente/producto y excepciones de comisión por producto.',
    requiredPermission: PERM,
  });
  if (!b) return;

  const MESES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const esc = KoguUi.escapeHtml;
  const val = id => document.getElementById(id)?.value?.trim() ?? '';
  const sel = id => document.getElementById(id)?.value ?? '';
  const setV = (id, v) => { const el = document.getElementById(id); if (el) el.value = v ?? ''; };
  const pctToFrac = p => (p === '' || p == null) ? null : Number(p) / 100;
  const fracToPct = f => (f == null || f === '') ? '' : `${(Number(f) * 100).toFixed(2)}%`;

  const now = new Date();
  const anios = [];
  for (let y = now.getFullYear() + 1; y >= now.getFullYear() - 3; y--) anios.push(y);

  const c = document.getElementById('pageContent');
  c.innerHTML = `
<div class="stack" style="gap:16px">

  <!-- ── TC de pago ── -->
  <div class="card">
    <div class="row">
      <div><div class="eyebrow">Comisiones · Configuración</div><h2>Tipo de cambio de pago (kg-USD)</h2></div>
      <span class="chip" id="empChip"></span>
    </div>
    <div style="color:var(--muted);font-size:12px;margin-top:4px">TC con el que se convierte a pesos la comisión por kg en dólares. Uno por periodo.</div>
    <div class="grid-4" style="margin-top:12px;gap:10px;align-items:end">
      <div><div class="label-text">Año</div><select class="select" id="tcAnio">${anios.map(y => `<option value="${y}">${y}</option>`).join('')}</select></div>
      <div><div class="label-text">Mes</div><select class="select" id="tcMes">${MESES.slice(1).map((m, i) => `<option value="${i + 1}">${m}</option>`).join('')}</select></div>
      <div><div class="label-text">TC de pago</div><input class="input" id="tcVal" type="number" step="0.0001" min="0" placeholder="17.3752" /></div>
      <div><button class="btn primary" id="tcAdd" style="width:100%">Guardar TC</button></div>
    </div>
    <div class="table-wrap" style="margin-top:14px"><table><thead><tr><th>Periodo</th><th style="text-align:right">TC de pago</th><th>Notas</th><th></th></tr></thead><tbody id="tcRows"></tbody></table></div>
  </div>

  <!-- ── Exclusión clientes ── -->
  <div class="card">
    <div class="row"><div><div class="eyebrow">Comisiones · Configuración</div><h2>Exclusión de clientes</h2></div></div>
    <div style="color:var(--muted);font-size:12px;margin-top:4px">La cobranza de estos clientes no genera comisión.</div>
    <div class="grid-4" style="margin-top:12px;gap:10px;align-items:end">
      <div><div class="label-text">Clave cliente</div><input class="input" id="ecCve" placeholder="Ej: 182" /></div>
      <div style="grid-column:span 2"><div class="label-text">Motivo</div><input class="input" id="ecMot" placeholder="Opcional" /></div>
      <div><button class="btn primary" id="ecAdd" style="width:100%">Agregar</button></div>
    </div>
    <div class="table-wrap" style="margin-top:14px"><table><thead><tr><th>Cliente</th><th>Motivo</th><th></th></tr></thead><tbody id="ecRows"></tbody></table></div>
  </div>

  <!-- ── Exclusión productos ── -->
  <div class="card">
    <div class="row"><div><div class="eyebrow">Comisiones · Configuración</div><h2>Exclusión de productos</h2></div></div>
    <div style="color:var(--muted);font-size:12px;margin-top:4px">Si una factura incluye uno de estos productos, no genera comisión.</div>
    <div class="grid-4" style="margin-top:12px;gap:10px;align-items:end">
      <div><div class="label-text">Clave producto</div><input class="input" id="epCve" placeholder="Ej: COM0001" /></div>
      <div style="grid-column:span 2"><div class="label-text">Motivo</div><input class="input" id="epMot" placeholder="Opcional" /></div>
      <div><button class="btn primary" id="epAdd" style="width:100%">Agregar</button></div>
    </div>
    <div class="table-wrap" style="margin-top:14px"><table><thead><tr><th>Producto</th><th>Motivo</th><th></th></tr></thead><tbody id="epRows"></tbody></table></div>
  </div>

  <!-- ── Excepción por producto ── -->
  <div class="card">
    <div class="row"><div><div class="eyebrow">Comisiones · Configuración</div><h2>Excepción de comisión por producto</h2></div></div>
    <div style="color:var(--muted);font-size:12px;margin-top:4px">Para la combinación cliente + agente + producto, la comisión usa este porcentaje en lugar del porcentaje normal del agente.</div>
    <div class="grid-4" style="margin-top:12px;gap:10px;align-items:end">
      <div><div class="label-text">Clave cliente</div><input class="input" id="ovCte" placeholder="Ej: 9" /></div>
      <div><div class="label-text">Clave agente</div><input class="input" id="ovAge" type="number" min="1" placeholder="Ej: 6" /></div>
      <div><div class="label-text">Clave producto</div><input class="input" id="ovProd" placeholder="Ej: WWP0871" /></div>
      <div><div class="label-text">% comisión</div><input class="input" id="ovPct" type="number" step="0.01" min="0" placeholder="Ej: 5 = 5%" /></div>
    </div>
    <div class="grid-4" style="margin-top:8px;gap:10px;align-items:end">
      <div style="grid-column:span 3"><div class="label-text">Motivo</div><input class="input" id="ovMot" placeholder="Opcional (ej: Especial)" /></div>
      <div><button class="btn primary" id="ovAdd" style="width:100%">Agregar excepción</button></div>
    </div>
    <div class="table-wrap" style="margin-top:14px"><table><thead><tr><th>Cliente</th><th>Agente</th><th>Producto</th><th style="text-align:right">%</th><th>Motivo</th><th></th></tr></thead><tbody id="ovRows"></tbody></table></div>
  </div>

  <!-- ── Clientes con comisión kg-USD ── -->
  <div class="card">
    <div class="row"><div><div class="eyebrow">Comisiones · Configuración</div><h2>Clientes con comisión kg-USD</h2></div></div>
    <div style="color:var(--muted);font-size:12px;margin-top:4px">Estos clientes generan comisión por kilogramo (USD) para el agente kg, <b>además</b> del % de su agente primario. El agente kg y su tasa por kg se configuran en Radar Comercial → Agentes comerciales.</div>
    <div class="grid-4" style="margin-top:12px;gap:10px;align-items:end">
      <div><div class="label-text">Clave cliente</div><input class="input" id="kgCte" placeholder="Ej: 42" /></div>
      <div style="grid-column:span 2"><div class="label-text">Agente kg-USD</div><select class="select" id="kgAge"><option value="">—</option></select></div>
      <div><button class="btn primary" id="kgAdd" style="width:100%">Agregar</button></div>
    </div>
    <div class="table-wrap" style="margin-top:14px"><table><thead><tr><th>Cliente</th><th>Nombre</th><th>Agente kg-USD</th><th></th></tr></thead><tbody id="kgRows"></tbody></table></div>
  </div>

</div>`;

  const empA = KoguApi.getEmpresaActiva() || {};
  document.getElementById('empChip').textContent = empA.nombre_corto || empA.razon_social || empA.rfc || 'Empresa activa';

  const delCell = id => `<button class="btn btn-edit" data-del="${id}">Eliminar</button>`;
  const empty = (n, msg) => `<tr><td colspan="${n}" class="empty">${msg}</td></tr>`;

  // ── Cargas ──────────────────────────────────────────────────────────────
  async function loadTc() {
    const rows = KoguApi.unwrapData(await KoguApi.apiFetch(`${BASE}/tc`)) || [];
    document.getElementById('tcRows').innerHTML = rows.length ? rows.map(r => `
      <tr><td>${MESES[r.mes]} ${r.anio}</td><td style="text-align:right">${Number(r.tc_pago).toFixed(4)}</td>
      <td>${esc(r.notas || '')}</td><td>${delCell('tc:' + r.tc_id)}</td></tr>`).join('') : empty(4, 'Sin TC configurado');
  }
  async function loadEc() {
    const rows = KoguApi.unwrapData(await KoguApi.apiFetch(`${BASE}/exclusion-clientes`)) || [];
    document.getElementById('ecRows').innerHTML = rows.length ? rows.map(r => `
      <tr><td><span class="chip-compact">${esc(r.cve_cte)}</span></td><td>${esc(r.motivo || '')}</td><td>${delCell('ec:' + r.exclusion_id)}</td></tr>`).join('') : empty(3, 'Sin clientes excluidos');
  }
  async function loadEp() {
    const rows = KoguApi.unwrapData(await KoguApi.apiFetch(`${BASE}/exclusion-productos`)) || [];
    document.getElementById('epRows').innerHTML = rows.length ? rows.map(r => `
      <tr><td><span class="chip-compact">${esc(r.cve_prod)}</span></td><td>${esc(r.motivo || '')}</td><td>${delCell('ep:' + r.exclusion_id)}</td></tr>`).join('') : empty(3, 'Sin productos excluidos');
  }
  async function loadOv() {
    const rows = KoguApi.unwrapData(await KoguApi.apiFetch(`${BASE}/comision-producto`)) || [];
    document.getElementById('ovRows').innerHTML = rows.length ? rows.map(r => `
      <tr><td><span class="chip-compact">${esc(r.cve_cte)}</span></td><td>${esc(String(r.cve_age))}</td>
      <td><span class="chip-compact">${esc(r.cve_prod)}</span></td><td style="text-align:right;font-weight:700">${fracToPct(r.porcom_override)}</td>
      <td>${esc(r.motivo || '')}</td><td>${delCell('ov:' + r.override_id)}</td></tr>`).join('') : empty(6, 'Sin excepciones por producto');
  }
  async function loadKgAgentes() {
    const rows = KoguApi.unwrapData(await KoguApi.apiFetch(`${BASE}/kg-agentes`)) || [];
    document.getElementById('kgAge').innerHTML = '<option value="">—</option>' +
      rows.map(a => `<option value="${a.cve_agente}">${esc(`${a.cve_agente} · ${a.nombre}`)}</option>`).join('');
  }
  async function loadKg() {
    const rows = KoguApi.unwrapData(await KoguApi.apiFetch(`${BASE}/kg-clientes`)) || [];
    document.getElementById('kgRows').innerHTML = rows.length ? rows.map(r => `
      <tr><td><span class="chip-compact">${esc(r.cve_cte)}</span></td><td>${esc(r.nombre || '')}</td>
      <td>${esc(`${r.kg_cve_agente} · ${r.kg_agente_nombre}`)}</td><td>${delCell('kg:' + r.cliente_id)}</td></tr>`).join('') : empty(4, 'Sin clientes con comisión kg-USD');
  }
  async function loadAll() { await Promise.all([loadTc(), loadEc(), loadEp(), loadOv(), loadKgAgentes(), loadKg()]); }

  // ── Alta ────────────────────────────────────────────────────────────────
  async function post(path, body, reload, okMsg) {
    try {
      await KoguApi.apiFetch(`${BASE}${path}`, { method: 'POST', body: JSON.stringify(body) });
      KoguApi.toast(okMsg, 'success');
      await reload();
    } catch (err) { KoguApi.toast(err.message || 'No se pudo guardar', 'error'); }
  }

  document.getElementById('tcAdd').onclick = (e) => KoguUi.withLoading(e.target, async () => {
    if (!val('tcVal')) return KoguApi.toast('Captura el TC', 'error');
    await post('/tc', { anio: Number(sel('tcAnio')), mes: Number(sel('tcMes')), tc_pago: Number(val('tcVal')) }, loadTc, 'TC guardado');
    setV('tcVal', '');
  }, 'Guardando...');

  document.getElementById('ecAdd').onclick = (e) => KoguUi.withLoading(e.target, async () => {
    if (!val('ecCve')) return KoguApi.toast('Captura la clave de cliente', 'error');
    await post('/exclusion-clientes', { cve_cte: val('ecCve'), motivo: val('ecMot') }, loadEc, 'Cliente excluido');
    setV('ecCve', ''); setV('ecMot', '');
  }, 'Guardando...');

  document.getElementById('epAdd').onclick = (e) => KoguUi.withLoading(e.target, async () => {
    if (!val('epCve')) return KoguApi.toast('Captura la clave de producto', 'error');
    await post('/exclusion-productos', { cve_prod: val('epCve'), motivo: val('epMot') }, loadEp, 'Producto excluido');
    setV('epCve', ''); setV('epMot', '');
  }, 'Guardando...');

  document.getElementById('ovAdd').onclick = (e) => KoguUi.withLoading(e.target, async () => {
    if (!val('ovCte') || !val('ovAge') || !val('ovProd') || val('ovPct') === '') return KoguApi.toast('Cliente, agente, producto y % son obligatorios', 'error');
    await post('/comision-producto', {
      cve_cte: val('ovCte'), cve_age: Number(val('ovAge')), cve_prod: val('ovProd'),
      porcom_override: pctToFrac(val('ovPct')), motivo: val('ovMot'),
    }, loadOv, 'Excepción guardada');
    setV('ovCte', ''); setV('ovAge', ''); setV('ovProd', ''); setV('ovPct', ''); setV('ovMot', '');
  }, 'Guardando...');

  document.getElementById('kgAdd').onclick = (e) => KoguUi.withLoading(e.target, async () => {
    if (!val('kgCte') || !sel('kgAge')) return KoguApi.toast('Captura cliente y selecciona el agente kg', 'error');
    await post('/kg-clientes', { cve_cte: val('kgCte'), cve_age: Number(sel('kgAge')) }, loadKg, 'Cliente kg-USD agregado');
    setV('kgCte', '');
  }, 'Guardando...');

  // ── Eliminar (delegado) ─────────────────────────────────────────────────
  const DEL = {
    tc: { path: '/tc', reload: loadTc }, ec: { path: '/exclusion-clientes', reload: loadEc },
    ep: { path: '/exclusion-productos', reload: loadEp }, ov: { path: '/comision-producto', reload: loadOv },
    kg: { path: '/kg-clientes', reload: loadKg },
  };
  c.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('[data-del]');
    if (!btn) return;
    const [kind, id] = btn.dataset.del.split(':');
    const cfg = DEL[kind];
    if (!cfg || !confirm('¿Eliminar este registro de configuración?')) return;
    try {
      await KoguApi.apiFetch(`${BASE}${cfg.path}/${id}`, { method: 'DELETE' });
      KoguApi.toast('Eliminado', 'success');
      await cfg.reload();
    } catch (err) { KoguApi.toast(err.message || 'No se pudo eliminar', 'error'); }
  });

  KoguShell.subscribeEmpresaActivaChange(async () => {
    const e = KoguApi.getEmpresaActiva() || {};
    document.getElementById('empChip').textContent = e.nombre_corto || e.razon_social || e.rfc || 'Empresa activa';
    await loadAll();
  });

  await loadAll();
});

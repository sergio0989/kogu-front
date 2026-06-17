// ============================================================
// productos-b.js — Costo (cto_): catálogo de productos "B" (producidos).
// Claves base (prefijos): toda venta cuya cve_prod empiece con una clave
// base activa se marca B en el cálculo (aplica Factor B fijo).
// Endpoints: GET/POST /protected/cto/productos-b, DELETE /productos-b/:id
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/cto/productos-b.html';
  const PERM = 'screen.costo';
  const BASE = '/protected/cto';

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Productos B (producidos)',
    description: 'Catálogo de claves base producidas. El cálculo marca B (Factor B fijo) toda venta cuya clave empiece con una de estas, aunque sea una variación.',
    requiredPermission: PERM,
  });
  if (!b) return;

  const $ = (id) => document.getElementById(id);
  const esc = KoguUi.escapeHtml;

  $('pageContent').innerHTML = `
<div class="card">
  <div class="row"><div><div class="eyebrow">Costo · Catálogos</div><h2>Productos B (producidos)</h2></div></div>
  <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;margin-top:12px">
    <div><label class="muted" style="font-size:12px">Clave base (prefijo)</label>
      <input id="clave" class="input" style="width:180px;text-transform:uppercase" placeholder="WWP0167"/></div>
    <div style="flex:1;min-width:200px"><label class="muted" style="font-size:12px">Descripción (opcional)</label>
      <input id="desc" class="input" style="width:100%" placeholder="Base producida…"/></div>
    <button class="btn primary" id="add">Agregar</button>
  </div>
  <div id="msg" style="display:none;margin-top:12px;padding:10px;border-radius:6px;font-size:13px"></div>
</div>

<div class="card" style="margin-top:16px">
  <div class="muted" style="font-size:12px;margin-bottom:8px">Una venta es producida si su clave <strong>empieza con</strong> alguna de estas (p.ej. <code>WWP0167</code> cubre WWP0167-C2-, WWP0167-DN…).</div>
  <div style="overflow-x:auto"><table class="table" id="tabla" style="width:100%;font-size:13px"></table></div>
</div>`;

  function showMsg(html, tipo) {
    const m = $('msg');
    const bg = tipo === 'error' ? '#fee2e2' : tipo === 'warn' ? '#fef9c3' : '#dcfce7';
    const co = tipo === 'error' ? '#991b1b' : tipo === 'warn' ? '#854d0e' : '#166534';
    m.style.cssText = `display:block;margin-top:12px;padding:10px;border-radius:6px;font-size:13px;background:${bg};color:${co}`;
    m.innerHTML = html;
  }

  function pintar(rows) {
    const head = `<thead><tr style="border-bottom:2px solid #e2e8f0;text-align:left">
      <th style="padding:6px">Clave base</th><th style="padding:6px">Descripción</th>
      <th style="padding:6px;text-align:center">Activo</th><th style="padding:6px;text-align:right">Acción</th></tr></thead>`;
    const body = rows.length ? rows.map(r => `<tr style="border-bottom:1px solid #f1f5f9">
      <td style="padding:6px;font-weight:700;font-family:monospace">${esc(r.clave_base)}</td>
      <td style="padding:6px;color:#475569">${esc(r.descripcion || '')}</td>
      <td style="padding:6px;text-align:center">${r.activo ? '✓' : '—'}</td>
      <td style="padding:6px;text-align:right"><button class="btn ghost" data-del="${r.producto_b_id}" data-clave="${esc(r.clave_base)}" style="padding:3px 8px;font-size:11px;color:#991b1b">Eliminar</button></td>
    </tr>`).join('') : `<tr><td colspan="4" class="muted" style="padding:16px;text-align:center">Sin claves base. Agrega una arriba.</td></tr>`;
    $('tabla').innerHTML = head + '<tbody>' + body + '</tbody>';
    $('tabla').querySelectorAll('button[data-del]').forEach(btn => btn.addEventListener('click', () => del(btn.dataset.del, btn.dataset.clave)));
  }

  async function cargar() {
    try {
      const res = await KoguApi.apiFetch(`${BASE}/productos-b`);
      pintar(KoguApi.unwrapData(res) || []);
    } catch (e) { showMsg('❌ ' + e.message, 'error'); }
  }

  async function agregar() {
    const clave = ($('clave').value || '').trim().toUpperCase();
    if (!clave) return KoguApi.toast('Indica la clave base.', 'error');
    $('add').disabled = true;
    try {
      await KoguApi.apiFetch(`${BASE}/productos-b`, { method: 'POST', body: JSON.stringify({ clave_base: clave, descripcion: $('desc').value || null }) });
      $('clave').value = ''; $('desc').value = '';
      showMsg(`✅ Clave base "${clave}" agregada. Recalcula el periodo para aplicar.`, 'ok');
      cargar();
    } catch (e) { showMsg('❌ ' + e.message, 'error'); }
    finally { $('add').disabled = false; }
  }

  async function del(id, clave) {
    if (!confirm(`¿Eliminar la clave base "${clave}"?`)) return;
    try {
      await KoguApi.apiFetch(`${BASE}/productos-b/${id}`, { method: 'DELETE' });
      showMsg(`Clave "${clave}" eliminada. Recalcula el periodo para aplicar.`, 'warn');
      cargar();
    } catch (e) { showMsg('❌ ' + e.message, 'error'); }
  }

  $('add').addEventListener('click', agregar);
  $('clave').addEventListener('keydown', (e) => { if (e.key === 'Enter') agregar(); });
  KoguShell.subscribeEmpresaActivaChange(() => cargar());
  cargar();
});

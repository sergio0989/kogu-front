// ============================================================
// precios-pactados.js — Costo · Precios de requisiciones · Precios pactados.
// Reemplaza la hoja Precios_Pactados de configuracion.xlsx: precio fijo de
// venta por producto (sin margen). Tiene prioridad sobre el kardex.
// Endpoints: GET    /protected/cto/precios-pactados?q&inactivos=1
//            POST   /protected/cto/precios-pactados
//            PATCH  /protected/cto/precios-pactados/:id
//            DELETE /protected/cto/precios-pactados/:id   (da de baja)
// Prueba: tests/cto-precios-pactados-render.test.mjs
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/cto/precios-pactados.html';
  const BASE = '/protected/cto/precios-pactados';
  const R = window.CtoReq;

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Precios pactados',
    description: 'Precio fijo de venta por producto para las requisiciones (no lleva margen).',
    requiredPermission: 'screen.cto.requisiciones',
  });
  if (!b) return;

  const puede = KoguShell.hasPerm(b, 'cto.precios_pactados.write');
  const esc = (s) => KoguUi.escapeHtml(s);
  const $ = (id) => document.getElementById(id);
  let filas = [];
  let editandoId = null;

  const c = $('pageContent');
  c.innerHTML = `
<div class="card">
  <div class="row" style="align-items:flex-end;gap:12px;flex-wrap:wrap">
    <div style="flex:1 1 320px"><div class="eyebrow">Costo · Requisiciones</div><h2 style="margin:0">Precios pactados</h2>
      <div class="muted" style="font-size:12px">Si un producto tiene precio pactado vigente, la requisición usa ese precio y no el costo del kardex.</div></div>
    <div><label class="muted" style="font-size:12px;display:block">Buscar</label><input id="pacQ" class="input" placeholder="Clave o nota" style="width:180px"/></div>
    <label class="muted" style="font-size:12.5px;display:flex;gap:6px;align-items:center"><input type="checkbox" id="pacInactivos"/> Ver dados de baja</label>
    <a class="btn ghost" href="/modules/cto/requisiciones.html">← Requisiciones</a>
  </div>
  ${puede ? `
  <div style="margin-top:14px;padding:14px;border:1px dashed var(--line);border-radius:12px">
    <div id="pacTituloForm" style="font-weight:600;margin-bottom:8px">Nuevo precio pactado</div>
    <div class="row" style="gap:10px;align-items:flex-end;flex-wrap:wrap">
      <div><label class="muted" style="font-size:12px;display:block">Clave</label><input id="pacCve" class="input" style="width:150px"/></div>
      <div><label class="muted" style="font-size:12px;display:block">Precio</label><input id="pacPrecio" type="number" step="0.0001" min="0" class="input" style="width:110px"/></div>
      <div><label class="muted" style="font-size:12px;display:block">Moneda</label><select id="pacMoneda" class="select"><option value="MXN">MXN</option><option value="USD">USD</option></select></div>
      <div><label class="muted" style="font-size:12px;display:block">IVA %</label><input id="pacIva" class="input" value="16" style="width:70px"/></div>
      <div><label class="muted" style="font-size:12px;display:block">Vigente desde</label><input id="pacDesde" type="date" class="input"/></div>
      <div><label class="muted" style="font-size:12px;display:block">Hasta</label><input id="pacHasta" type="date" class="input"/></div>
      <div style="flex:1 1 200px"><label class="muted" style="font-size:12px;display:block">Notas</label><input id="pacNotas" class="input" style="width:100%;max-width:none"/></div>
      <button class="btn primary" id="pacGuardar">Guardar</button>
      <button class="btn ghost" id="pacCancelar">Limpiar</button>
    </div>
    <div id="pacMsg" style="margin-top:8px;color:var(--danger);font-size:13px"></div>
  </div>` : ''}
</div>
<div class="card" style="margin-top:14px">
  <div class="table-wrap"><table>
    <thead><tr><th>Clave</th><th>Precio</th><th>IVA</th><th>Vigencia</th><th>Notas</th><th>Estado</th>${puede ? '<th></th>' : ''}</tr></thead>
    <tbody id="pacLista"><tr><td colspan="7" class="muted">Cargando…</td></tr></tbody>
  </table></div>
</div>`;

  const vigencia = (p) => (!p.vigente_desde && !p.vigente_hasta) ? 'Siempre'
    : `${p.vigente_desde ? R.fmtFecha(p.vigente_desde) : '…'} – ${p.vigente_hasta ? R.fmtFecha(p.vigente_hasta) : '…'}`;

  async function cargar() {
    const qs = new URLSearchParams({ q: $('pacQ').value.trim(), inactivos: $('pacInactivos').checked ? '1' : '0' });
    try {
      const res = await KoguApi.apiFetch(`${BASE}?${qs}`);
      filas = res?.data ?? res ?? [];
      $('pacLista').innerHTML = filas.length ? filas.map((p) => `
        <tr data-id="${esc(p.pactado_id)}" style="${p.activo ? '' : 'color:var(--muted)'}">
          <td><b>${esc(p.cve_prod)}</b></td>
          <td>${esc(R.fmtPrecio(p.precio, p.moneda))}</td>
          <td>${esc(R.fmtIva(p.iva))}</td>
          <td>${esc(vigencia(p))}</td>
          <td>${esc(p.notas || '')}</td>
          <td>${p.activo ? '<span class="badge success">Activo</span>' : '<span class="badge neutral">Inactivo</span>'}</td>
          ${puede ? `<td>${p.activo ? `<button class="btn ghost btn-editar" style="padding:3px 10px">Editar</button>
            <button class="btn ghost btn-baja" style="padding:3px 10px">Dar de baja</button>` : ''}</td>` : ''}
        </tr>`).join('') : `<tr><td colspan="7" class="muted">Sin precios pactados.</td></tr>`;
      enlazarFilas();
    } catch (e) {
      $('pacLista').innerHTML = `<tr><td colspan="7" style="color:var(--danger)">${esc(e.message || 'No se pudo cargar.')}</td></tr>`;
    }
  }

  function limpiar() {
    editandoId = null;
    for (const k of ['pacCve', 'pacPrecio', 'pacDesde', 'pacHasta', 'pacNotas']) $(k).value = '';
    $('pacMoneda').value = 'MXN';
    $('pacIva').value = '16';
    $('pacCve').disabled = false;
    $('pacTituloForm').textContent = 'Nuevo precio pactado';
    $('pacMsg').textContent = '';
  }

  function editar(p) {
    editandoId = p.pactado_id;
    $('pacCve').value = p.cve_prod;
    $('pacPrecio').value = String(p.precio);
    $('pacMoneda').value = p.moneda;
    $('pacIva').value = p.iva == null ? '' : String(Math.round(Number(p.iva) * 100));
    $('pacDesde').value = p.vigente_desde || '';
    $('pacHasta').value = p.vigente_hasta || '';
    $('pacNotas').value = p.notas || '';
    $('pacTituloForm').textContent = `Editar ${p.cve_prod}`;
    $('pacMsg').textContent = '';
  }

  async function guardar(ev) {
    const cve = $('pacCve').value.trim().toUpperCase();
    const precio = R.num($('pacPrecio').value);
    const iva = R.ivaDeTexto($('pacIva').value);
    if (!cve) { $('pacMsg').textContent = 'Indica la clave del producto.'; return; }
    if (!(precio > 0)) { $('pacMsg').textContent = 'Captura un precio mayor a cero.'; return; }
    if (iva === null) { $('pacMsg').textContent = 'IVA inválido: usa 16 o 0.'; return; }
    const desde = $('pacDesde').value || null;
    const hasta = $('pacHasta').value || null;
    if (desde && hasta && hasta < desde) { $('pacMsg').textContent = 'La vigencia termina antes de empezar.'; return; }
    const body = { cve_prod: cve, precio, moneda: $('pacMoneda').value, iva: iva === undefined ? null : iva,
      vigente_desde: desde, vigente_hasta: hasta, notas: $('pacNotas').value.trim() || null };
    ev.target.disabled = true;
    try {
      if (editandoId) await KoguApi.apiFetch(`${BASE}/${encodeURIComponent(editandoId)}`, { method: 'PATCH', body: JSON.stringify(body) });
      else await KoguApi.apiFetch(BASE, { method: 'POST', body: JSON.stringify(body) });
      KoguApi.toast(`Precio pactado de ${cve} guardado.`, 'success');
      limpiar();
      await cargar();
    } catch (e) { $('pacMsg').textContent = e.message || 'No se pudo guardar.'; }
    finally { ev.target.disabled = false; }
  }

  function enlazarFilas() {
    if (!puede) return;
    document.querySelectorAll('#pacLista tr[data-id]').forEach((tr) => {
      const p = filas.find((x) => x.pactado_id === tr.dataset.id);
      tr.querySelector('.btn-editar')?.addEventListener('click', () => editar(p));
      const baja = tr.querySelector('.btn-baja');
      baja?.addEventListener('click', async () => {
        if (baja.dataset.confirmar !== '1') {
          baja.dataset.confirmar = '1';
          baja.textContent = 'Confirmar baja';
          baja.classList.remove('ghost');
          return;
        }
        baja.disabled = true;
        try {
          await KoguApi.apiFetch(`${BASE}/${encodeURIComponent(p.pactado_id)}`, { method: 'DELETE' });
          KoguApi.toast(`Precio pactado de ${p.cve_prod} dado de baja.`, 'success');
          if (editandoId === p.pactado_id) limpiar();
          await cargar();
        } catch (e) { KoguApi.toast(e.message || 'No se pudo dar de baja.', 'error'); baja.disabled = false; }
      });
    });
  }

  $('pacQ').addEventListener('keydown', (e) => { if (e.key === 'Enter') cargar(); });
  $('pacInactivos').addEventListener('change', cargar);
  if (puede) {
    $('pacGuardar').addEventListener('click', guardar);
    $('pacCancelar').addEventListener('click', limpiar);
  }
  KoguShell.subscribeEmpresaActivaChange?.(() => { if (puede) limpiar(); cargar(); });
  await cargar();
});

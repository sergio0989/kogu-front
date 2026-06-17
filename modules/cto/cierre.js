// ============================================================
// cierre.js — Costo (cto_): Validación / Cierre de periodo.
// Corre los chequeos de completitud y consistencia del mes y permite
// cerrar (sello de "todo contemplado") o reabrir.
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/cto/cierre.html';
  const PERM = 'screen.costo';
  const BASE = '/protected/cto';

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Costo — Validación / Cierre de periodo',
    description: 'Verifica que el mes esté completo y consistente, y ciérralo cuando todo cuadre.',
    requiredPermission: PERM,
  });
  if (!b) return;

  const $ = (id) => document.getElementById(id);
  const now = new Date();

  const c = document.getElementById('pageContent');
  c.innerHTML = `
<div class="card">
  <div class="row">
    <div><div class="eyebrow">Costo</div><h2>Validación / Cierre de periodo</h2></div>
    <div style="display:flex;gap:8px;align-items:flex-end">
      <div><label class="muted" style="font-size:12px">Año</label><input type="number" id="anio" class="input" style="width:90px" value="${now.getFullYear()}"/></div>
      <div><label class="muted" style="font-size:12px">Mes</label><input type="number" id="mes" class="input" style="width:70px" min="1" max="12" value="${now.getMonth() + 1}"/></div>
      <button class="btn primary" id="validar">Validar</button>
    </div>
  </div>
  <div id="estado" style="display:none;margin-top:14px"></div>
</div>
<div id="checksCard" class="card" style="margin-top:16px;display:none">
  <h3 style="margin:0 0 10px 0">Chequeos del periodo</h3>
  <div id="checks"></div>
</div>`;

  const fmtMon = (v) => '$' + (Number(v) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
  const ico = { ok: '✅', warn: '⚠️', error: '❌' };
  const colBg = { ok: '#dcfce7', warn: '#fef9c3', error: '#fee2e2' };
  const colTx = { ok: '#166534', warn: '#854d0e', error: '#991b1b' };

  async function validar() {
    const anio = parseInt($('anio').value, 10), mes = parseInt($('mes').value, 10);
    if (!anio || !mes) return KoguApi.toast('Indica año y mes.', 'error');
    try {
      const data = KoguApi.unwrapData(await KoguApi.apiFetch(`${BASE}/cierre/${anio}/${mes}`));
      render(data, anio, mes);
    } catch (e) { KoguApi.toast(e.message, 'error'); }
  }

  function render(d, anio, mes) {
    const cerrado = d.cierre?.cerrado;
    const headBg = cerrado ? '#dcfce7' : d.errores ? '#fee2e2' : d.avisos ? '#fef9c3' : '#dcfce7';
    const headTx = cerrado ? '#166534' : d.errores ? '#991b1b' : d.avisos ? '#854d0e' : '#166534';
    const estadoTxt = cerrado ? '🔒 Periodo CERRADO' : d.listo_para_cerrar ? '✔ Listo para cerrar' : '⛔ Pendiente';
    $('estado').style.display = 'block';
    $('estado').innerHTML = `
      <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;
                  padding:14px;border-radius:8px;background:${headBg};color:${headTx}">
        <div>
          <strong style="font-size:15px">${estadoTxt}</strong>
          <div style="font-size:13px;margin-top:2px">
            ${d.errores} crítico(s) · ${d.avisos} aviso(s)
            ${d.cierre ? ` · Utilidad bruta ${fmtMon(d.cierre.utilidad_bruta)} (${(Number(d.cierre.utilidad_bruta_pct)*100||0).toFixed(2)}%)` : ''}
            ${cerrado && d.cierre?.cerrado_at ? ` · Cerrado ${new Date(d.cierre.cerrado_at).toLocaleString()}` : ''}
          </div>
        </div>
        <div style="display:flex;gap:8px">
          ${cerrado
            ? `<button class="btn ghost" id="reabrir">Reabrir</button>`
            : `<button class="btn primary" id="cerrar" ${d.listo_para_cerrar ? '' : 'disabled'}
                 style="background:${d.listo_para_cerrar ? '#16a34a' : '#9ca3af'}">🔒 Cerrar periodo</button>`}
        </div>
      </div>
      <div class="muted" style="font-size:12px;margin-top:8px">
        Producidos: ${d.resumen.producidos} · Exportación: ${d.resumen.exportacion} · Corregidos: ${d.resumen.corregidos} · Notas: ${d.resumen.notas}
      </div>`;
    $('checksCard').style.display = 'block';
    const fmtKg = (n) => Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
    const fmtMx = (n) => Number(n || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
    const itemsTabla = (items) => `
      <div style="margin-top:8px;overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:11px">
          <thead><tr style="opacity:.7;text-align:left">
            <th style="padding:3px 6px">Factura</th><th style="padding:3px 6px">Producto</th>
            <th style="padding:3px 6px">Cliente</th><th style="padding:3px 6px;text-align:right">Kg</th>
            <th style="padding:3px 6px;text-align:right">Subtotal</th><th style="padding:3px 6px">Marca</th>
          </tr></thead>
          <tbody>${items.map(it => {
            const marca = it.tipo_doc === 'nota' ? 'nota' : (it.marca_b ? 'B · producido' : '—');
            const fac = [it.serie, it.folio].filter(Boolean).join('-') || '—';
            return `<tr style="border-top:1px solid rgba(0,0,0,.08)">
              <td style="padding:3px 6px;white-space:nowrap">${esc(fac)}</td>
              <td style="padding:3px 6px">${esc(it.cve_prod || '—')}${it.desc_prod ? ` · <span style="opacity:.75">${esc(it.desc_prod)}</span>` : ''}</td>
              <td style="padding:3px 6px">${esc(it.nom_cte || it.cve_cte || '—')}</td>
              <td style="padding:3px 6px;text-align:right">${fmtKg(it.cant_surt)}</td>
              <td style="padding:3px 6px;text-align:right">${fmtMx(it.subtotal)}</td>
              <td style="padding:3px 6px">${esc(marca)}</td>
            </tr>`;
          }).join('')}</tbody>
        </table>
      </div>`;
    $('checks').innerHTML = d.checks.map(ch => `
      <div style="display:flex;gap:10px;align-items:flex-start;padding:9px 12px;border-radius:6px;margin-bottom:6px;
                  background:${colBg[ch.estado]};color:${colTx[ch.estado]}">
        <span style="font-size:15px">${ico[ch.estado]}</span>
        <div style="flex:1;min-width:0"><strong style="font-size:13px">${esc(ch.label)}</strong>
          <div style="font-size:12px;opacity:.9">${esc(ch.detalle)}</div>
          ${Array.isArray(ch.items) && ch.items.length ? itemsTabla(ch.items) : ''}</div>
      </div>`).join('');

    const cerrarBtn = $('cerrar'), reabrirBtn = $('reabrir');
    if (cerrarBtn) cerrarBtn.addEventListener('click', () => accion('cerrar', anio, mes));
    if (reabrirBtn) reabrirBtn.addEventListener('click', () => accion('reabrir', anio, mes));
  }

  async function accion(tipo, anio, mes) {
    if (tipo === 'cerrar' && !confirm('¿Cerrar el periodo? Quedará marcado como contemplado.')) return;
    if (tipo === 'reabrir' && !confirm('¿Reabrir el periodo para editarlo?')) return;
    try {
      const data = KoguApi.unwrapData(await KoguApi.apiFetch(`${BASE}/cierre/${anio}/${mes}/${tipo}`, { method: 'POST', body: JSON.stringify({}) }));
      KoguApi.toast(tipo === 'cerrar' ? 'Periodo cerrado' : 'Periodo reabierto', 'success');
      render(data, anio, mes);
    } catch (e) { KoguApi.toast(e.message, 'error'); }
  }

  $('validar').addEventListener('click', validar);
  KoguShell.subscribeEmpresaActivaChange(() => validar());
  validar();
});

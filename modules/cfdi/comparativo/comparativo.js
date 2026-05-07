document.addEventListener('DOMContentLoaded', async()=>{
  const b=await KoguShell.initShell({currentPage:'/modules/cfdi/comparativo/comparativo.html',title:'Comparativos',description:'Comparativo ejecutivo entre empresas y periodos.',requiredPermission:'screen.cfdi.sat_dm'});
  if(!b) return;

  // F-07: guard empresa activa — sin empresa no hay contexto para llamadas CFDI
  if (!b.empresa_activa) {
    KoguApi.toast('No hay empresa activa. Selecciona una empresa para continuar.', 'error');
    setTimeout(() => window.location.href = '/modules/core/contexto/cambio-empresa.html', 1200);
    return;
  }
  const c=document.getElementById('pageContent');
  // F-09: try/catch + fallback — endpoint puede no estar disponible en todos los ambientes
  let rows = [];
  try {
    const res = await KoguApi.apiFetch('/protected/kogu/cfdi/dashboard/comparativo-empresas');
    rows = KoguApi.unwrapRows(res);
  } catch (err) {
    const msg = err?.message || 'El servicio de comparativo no está disponible.';
    c.innerHTML = `<div class="card"><p class="muted" style="padding:24px">${KoguUi.escapeHtml(msg)}</p></div>`;
    return;
  }
  c.innerHTML=`<div class="card"><div class="eyebrow">Comparativo</div><h2>Empresas</h2><div class="table-wrap" style="margin-top:16px"><table><thead><tr><th>Empresa</th><th>Vigentes</th><th>Cancelados</th><th>Total</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${KoguUi.escapeHtml(r.nombre_corto||r.empresa||'')}</td><td>${KoguUi.int(r.vigentes||0)}</td><td>${KoguUi.int(r.cancelados||0)}</td><td>${KoguUi.money(r.total_vigente||r.monto_total||0)}</td></tr>`).join('')||'<tr><td colspan="4" class="empty">Sin información</td></tr>'}</tbody></table></div></div>`;
});
document.addEventListener('DOMContentLoaded', async()=>{
  const b=await KoguShell.initShell({currentPage:'/modules/cfdi/alertas/alertas.html',title:'Alertas CFDI',description:'Alertas ejecutivas para seguimiento de negocio sobre CFDI.',requiredPermission:'screen.cfdi.sat_dm'});
  if(!b) return;
  const c=document.getElementById('pageContent');
  const [r1,r2]=await Promise.all([KoguApi.apiFetch('/protected/kogu/cfdi/alertas/resumen'), KoguApi.apiFetch('/protected/kogu/cfdi/alertas')]);
  const resumen=KoguApi.unwrapData(r1); const rows=KoguApi.unwrapRows(r2);
  c.innerHTML=`<div class="grid-4">${KoguUi.cardStat('Alertas abiertas', KoguUi.int(resumen.total||rows.length),'Seguimiento')}${KoguUi.cardStat('Alta severidad', KoguUi.int(resumen.alta||0),'Prioridad')}${KoguUi.cardStat('Media severidad', KoguUi.int(resumen.media||0),'Prioridad')}${KoguUi.cardStat('Baja severidad', KoguUi.int(resumen.baja||0),'Prioridad')}</div><div class="card" style="margin-top:18px"><div class="eyebrow">Listado</div><h2>Detalle de alertas</h2>${rows.length?rows.map(a=>`<div class="hero-note" style="margin-top:12px"><strong>${KoguUi.escapeHtml(a.titulo||a.tipo||'Alerta')}</strong><br>${KoguUi.escapeHtml(a.descripcion||a.referencia||'')}<br>Severidad: ${KoguUi.escapeHtml(a.severidad||'-')}</div>`).join(''):'<div class="hero-note" style="margin-top:12px">No hay alertas abiertas.</div>'}</div>`;
});
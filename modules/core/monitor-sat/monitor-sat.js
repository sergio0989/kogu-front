document.addEventListener('DOMContentLoaded', async()=>{
  await KoguShell.initShell({currentPage:'/modules/core/monitor-sat/monitor-sat.html',title:'Monitoreo SAT',description:'Vista administrativa de pendientes y autoprocesamiento por empresa.',requiredPermission:'screen.core.monitor_sat'});
  const c=document.getElementById('pageContent');
  async function load(showToast=false){
    const [r1,r2,b] = await Promise.all([
      KoguApi.apiFetch('/protected/kogu/admin/cfdi/monitor/resumen'),
      KoguApi.apiFetch('/protected/kogu/admin/cfdi/monitor/empresas'),
      KoguShell.loadBootstrap()
    ]);
    const resumen=KoguApi.unwrapData(r1);
    const empresas=KoguApi.unwrapRows(r2);
    const empresaActiva = b.empresa_activa || {};
    c.innerHTML=`<div class="grid-4">${KoguUi.cardStat('Solicitudes pendientes', KoguUi.int(resumen.solicitudes_pendientes||0),'Pendientes')}${KoguUi.cardStat('Paquetes pendientes', KoguUi.int(resumen.paquetes_pendientes||0),'Pendientes')}${KoguUi.cardStat('Empresas monitoreadas', KoguUi.int(empresas.length),'Resumen admin')}${KoguUi.cardStat('Autoproceso', resumen.autoprocesamiento_activo?'Activo':'En revisión','Estado general')}</div><div class="card" style="margin-top:18px"><div class="row"><div><div class="eyebrow">Empresas</div><h2>Monitoreo por empresa</h2></div><button class="btn primary" id="refreshBtn">Actualizar</button></div><div class="hero-note" style="margin-top:12px">Empresa activa actual: <strong>${KoguUi.escapeHtml(empresaActiva.nombre_corto||empresaActiva.razon_social||'-')}</strong></div><div class="table-wrap" style="margin-top:16px"><table><thead><tr><th>Empresa</th><th>RFC</th><th>Solicitudes pendientes</th><th>Paquetes pendientes</th><th>Autoproceso</th></tr></thead><tbody>${empresas.map(e=>`<tr><td>${KoguUi.escapeHtml(e.nombre_corto||e.razon_social||'')}</td><td>${KoguUi.escapeHtml(e.rfc||'')}</td><td>${KoguUi.int(e.solicitudes_pendientes||0)}</td><td>${KoguUi.int(e.paquetes_pendientes||0)}</td><td>${KoguUi.statusBadge(e.autoproceso_status||e.autoprocesamiento_status||'-')}</td></tr>`).join('')||'<tr><td colspan="5" class="empty">Sin información</td></tr>'}</tbody></table></div></div>`;
    document.getElementById('refreshBtn').onclick=()=>load(false);
    if(showToast) KoguApi.toast('Monitoreo SAT actualizado por cambio de empresa','success');
  }
  KoguShell.subscribeEmpresaActivaChange(async()=>{ await load(true); });
  await load(false);
});
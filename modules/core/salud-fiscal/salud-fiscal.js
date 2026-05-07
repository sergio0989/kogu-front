document.addEventListener('DOMContentLoaded', async()=>{
  await KoguShell.initShell({currentPage:'/modules/core/salud-fiscal/salud-fiscal.html',title:'Salud fiscal',description:'Semáforo operativo por empresa activa para certificados y capacidad SAT.',requiredPermission:'screen.root.index'});
  const c=document.getElementById('pageContent');
  async function load(showToast=false){
    const b = await KoguShell.loadBootstrap();
    const empresa=b.empresa_activa||{};
    if(!empresa.empresa_id){ c.innerHTML='<div class="card"><h2>Sin empresa activa</h2><p>Selecciona una empresa para continuar.</p></div>'; return; }
    const res=await KoguApi.apiFetch('/protected/core/empresas/'+empresa.empresa_id+'/salud-fiscal');
    const d=KoguApi.unwrapData(res);
    c.innerHTML=`<div class="grid-4">${KoguUi.cardStat('Credenciales', KoguUi.int(d.resumen?.total_credenciales||0),'Registradas')}${KoguUi.cardStat('Certificados', KoguUi.int(d.resumen?.total_certificados||0),'Cargados')}${KoguUi.cardStat('Alertas abiertas', KoguUi.int(d.resumen?.alertas_abiertas||0),'Seguimiento')}${KoguUi.cardStat('Puede operar SAT', d.resumen?.puede_operar_sat?'Sí':'No','Empresa activa')}</div><div class="split" style="margin-top:18px"><div class="card"><div class="eyebrow">Certificados</div><h2>Semáforo</h2><div class="table-wrap" style="margin-top:16px"><table><thead><tr><th>Nombre</th><th>Serie</th><th>Vigencia fin</th><th>Semáforo</th></tr></thead><tbody>${(d.certificados||[]).map(x=>`<tr><td>${KoguUi.escapeHtml(x.nombre_certificado||'')}</td><td>${KoguUi.escapeHtml(x.numero_serie||'')}</td><td>${KoguUi.fmtDate(x.vigencia_hasta)}</td><td>${KoguUi.statusBadge(x.semaforo||'-')}</td></tr>`).join('')||'<tr><td colspan="4" class="empty">Sin certificados</td></tr>'}</tbody></table></div></div><div class="card"><div class="eyebrow">Alertas</div><h2>Detalle</h2>${(d.alertas||[]).length?(d.alertas||[]).map(a=>`<div class="hero-note" style="margin-top:12px"><strong>${KoguUi.escapeHtml(a.tipo||'Alerta')}</strong><br>${KoguUi.escapeHtml(a.referencia||'')} · ${KoguUi.escapeHtml(a.severidad||'')}</div>`).join(''):'<div class="hero-note" style="margin-top:12px">No hay alertas abiertas para la empresa activa.</div>'}</div></div>`;
    if(showToast) KoguApi.toast('Salud fiscal actualizada por cambio de empresa','success');
  }
  KoguShell.subscribeEmpresaActivaChange(async()=>{ await load(true); });
  await load(false);
});
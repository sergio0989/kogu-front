document.addEventListener('DOMContentLoaded', async()=>{
  await KoguShell.initShell({currentPage:'/modules/core/dashboard/index.html',title:'Inicio administración',description:'Panel administrativo para core multiempresa, certificados, salud fiscal y monitoreo SAT.',requiredPermission:'screen.root.index'});
  const c=document.getElementById('pageContent');
  async function load(showToast=false){
    const [bootResp, monitorResp]=await Promise.allSettled([
      KoguApi.apiFetch('/protected/kogu/bootstrap'),
      KoguApi.apiFetch('/protected/kogu/admin/cfdi/monitor/resumen')
    ]);
    const boot=bootResp.status==='fulfilled'?KoguApi.unwrapData(bootResp.value):{};
    const mon=monitorResp.status==='fulfilled'?KoguApi.unwrapData(monitorResp.value):{};
    c.innerHTML=`<div class="grid-4">
      ${KoguUi.cardStat('Empresas asignadas', KoguUi.int((boot.empresas||[]).length), 'Contexto del usuario')}
      ${KoguUi.cardStat('Solicitudes pendientes', KoguUi.int(mon.solicitudes_pendientes||mon.solicitudesPendientes||0), 'Motor SAT')}
      ${KoguUi.cardStat('Paquetes pendientes', KoguUi.int(mon.paquetes_pendientes||mon.paquetesPendientes||0), 'Descarga o proceso')}
      ${KoguUi.cardStat('Autoproceso', mon.autoprocesamiento_activo?'Activo':'En revisión', 'Monitoreo SAT')}
    </div>
    <div class="split" style="margin-top:18px">
      <div class="card"><div class="eyebrow">Accesos rápidos</div><h2>Administración</h2><div class="page-actions" style="margin-top:16px"><a class="btn primary" href="/modules/core/empresas/empresas.html">Empresas</a><a class="btn" href="/modules/core/certificados/certificados.html">Certificados</a><a class="btn" href="/modules/core/monitor-sat/monitor-sat.html">Monitoreo SAT</a><a class="btn" href="/modules/core/usuarios/usuarios.html">Usuarios</a></div><div class="hero-note" style="margin-top:16px">Este flujo no mezcla importes ni análisis fino de CFDI. Aquí se gobierna la plataforma, el contexto multiempresa y la operación técnica del motor SAT.</div></div>
      <div class="card"><div class="eyebrow">Contexto actual</div><h2>Bootstrap</h2><div class="table-wrap" style="margin-top:16px"><table><tbody>
        <tr><th>Usuario</th><td>${KoguUi.escapeHtml(boot.user?.nombre||boot.user?.email||'-')}</td></tr>
        <tr><th>Perfil</th><td>${KoguUi.escapeHtml(boot.user?.perfil||'-')}</td></tr>
        <tr><th>Empresa activa</th><td>${KoguUi.escapeHtml(boot.empresa_activa?.nombre_corto||boot.empresa_activa?.razon_social||'-')}</td></tr>
        <tr><th>RFC</th><td>${KoguUi.escapeHtml(boot.empresa_activa?.rfc||'-')}</td></tr>
        <tr><th>Ambiente</th><td>${KoguUi.escapeHtml(boot.environment?.name||'local')}</td></tr>
      </tbody></table></div></div>
    </div>`;
    if(showToast) KoguApi.toast('Panel core actualizado por cambio de empresa','success');
  }
  KoguShell.subscribeEmpresaActivaChange(async()=>{ await load(true); });
  await load(false);
});
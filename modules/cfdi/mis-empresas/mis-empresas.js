document.addEventListener('DOMContentLoaded', async()=>{
  const b=await KoguShell.initShell({currentPage:'/modules/cfdi/mis-empresas/mis-empresas.html',title:'Mis empresas',description:'Punto de entrada del usuario de negocio para seleccionar empresa y continuar al resumen.',requiredPermission:'screen.cfdi.sat_dm'});
  if(!b) return;
  const c=document.getElementById('pageContent');
  const res=await KoguApi.apiFetch('/protected/kogu/cfdi/negocio/mis-empresas');
  const rows=KoguApi.unwrapRows(res).length?KoguApi.unwrapRows(res):(b.empresas||[]);
  c.innerHTML=`<div class="grid-3">${rows.map(e=>`<div class="card"><div class="eyebrow">Empresa</div><h2>${KoguUi.escapeHtml(e.nombre_corto||e.razon_social||'')}</h2><p class="muted">${KoguUi.escapeHtml(e.rfc||'')}</p><div class="pillbar"><span class="badge ${e.activa?'success':'neutral'}">${e.activa?'Activa':'Disponible'}</span><span class="badge primary">${KoguUi.escapeHtml(e.rol_empresa||'usuario')}</span></div><div class="page-actions" style="margin-top:16px"><button class="btn primary btn-open" data-id="${e.empresa_id}">Entrar</button></div></div>`).join('')}</div>`;
  document.querySelectorAll('.btn-open').forEach(btn=>btn.onclick=async()=>{ try{ await KoguApi.apiFetch('/protected/core/context/empresa-activa',{method:'POST',body:JSON.stringify({empresa_id:btn.dataset.id})}); await KoguShell.loadBootstrap(); window.location.href='/modules/cfdi/dashboard/resumen.html'; }catch(err){ KoguApi.toast(err.message,'error'); } });
});
document.addEventListener('DOMContentLoaded', async()=>{
  let b=await KoguShell.initShell({currentPage:'/modules/core/certificados/certificados.html',title:'Certificados',description:'Gestión de certificados por empresa activa.',requiredPermission:'screen.core.certificados'});
  if(!b) return;
  const c=document.getElementById('pageContent');
  let empresa=b.empresa_activa||{};
  let rows=[];
  function renderPage(){
    c.innerHTML=`<div class="split"><div class="card"><div class="row"><div><div class="eyebrow">Empresa activa</div><h2>${KoguUi.escapeHtml(empresa.nombre_corto||empresa.razon_social||'Sin empresa')}</h2></div><button class="btn primary" id="refreshBtn">Actualizar</button></div><div class="hero-note" style="margin-top:16px">RFC: ${KoguUi.escapeHtml(empresa.rfc||'-')}</div><div class="table-wrap" style="margin-top:16px"><table><thead><tr><th>Nombre</th><th>Serie</th><th>RFC</th><th>Activo</th><th>Acciones</th></tr></thead><tbody id="rows"></tbody></table></div></div><div class="card"><div class="eyebrow">Alta</div><h2>Registrar certificado</h2><div class="stack" style="margin-top:16px"><div><div class="label-text">Nombre</div><input class="input" id="nombre_certificado"/></div><div><div class="label-text">RFC</div><input class="input" id="rfc_certificado"/></div><div><div class="label-text">Serie</div><input class="input" id="numero_serie"/></div><div><div class="label-text">Password</div><input class="input" id="password_certificado" type="password"/></div><div><div class="label-text">Observaciones</div><textarea class="input" id="observaciones"></textarea></div><div class="page-actions"><button class="btn primary" id="saveBtn">Guardar</button></div></div></div></div>`;
    document.getElementById('rows').innerHTML=rows.length?rows.map(r=>`<tr><td>${KoguUi.escapeHtml(r.nombre_certificado||'')}</td><td>${KoguUi.escapeHtml(r.numero_serie||'')}</td><td>${KoguUi.escapeHtml(r.rfc_certificado||'')}</td><td>${KoguUi.statusBadge(r.activo?'activo':'inactivo')}</td><td><div class="actions-cell"><button class="btn btn-det" data-id="${r.empresa_certificado_id||r.certificado_id||r.id}">Detalle</button><button class="btn btn-act" data-id="${r.empresa_certificado_id||r.certificado_id||r.id}">Activar</button></div></td></tr>`).join(''):`<tr><td colspan="5" class="empty">Sin certificados</td></tr>`;
    document.querySelectorAll('.btn-det').forEach(x=>x.onclick=async()=>{ try{ const res=await KoguApi.apiFetch('/protected/core/empresas/'+empresa.empresa_id+'/certificados/'+x.dataset.id); const d=KoguApi.unwrapData(res); KoguApi.toast('Detalle cargado: '+(d.nombre_certificado||d.numero_serie||'certificado'),'success'); }catch(err){ KoguApi.toast(err.message,'error'); } });
    document.querySelectorAll('.btn-act').forEach(x=>x.onclick=async()=>{ try{ await KoguApi.apiFetch('/protected/core/empresas/'+empresa.empresa_id+'/certificados/'+x.dataset.id+'/activar',{method:'POST'}); KoguApi.toast('Certificado activado','success'); await load(false); }catch(err){ KoguApi.toast(err.message,'error'); } });
    document.getElementById('refreshBtn').onclick=()=>load(false);
    document.getElementById('saveBtn').onclick=async()=>{ try{ const payload={ nombre_certificado:document.getElementById('nombre_certificado').value.trim(), rfc_certificado:document.getElementById('rfc_certificado').value.trim(), numero_serie:document.getElementById('numero_serie').value.trim(), password_certificado:document.getElementById('password_certificado').value.trim(), observaciones:document.getElementById('observaciones').value.trim() }; if(!payload.nombre_certificado||!payload.rfc_certificado) throw new Error('Nombre y RFC son obligatorios.'); await KoguApi.apiFetch('/protected/core/empresas/'+empresa.empresa_id+'/certificados',{method:'POST',body:JSON.stringify(payload)}); KoguApi.toast('Certificado registrado','success'); ['nombre_certificado','rfc_certificado','numero_serie','password_certificado','observaciones'].forEach(id=>document.getElementById(id).value=''); await load(false); }catch(err){ KoguApi.toast(err.message,'error'); } };
  }
  async function load(showToast=false){
    b = await KoguShell.loadBootstrap();
    empresa=b.empresa_activa||{};
    if(!empresa.empresa_id){ c.innerHTML='<div class="card"><h2>Sin empresa activa</h2><p>Selecciona una empresa para continuar.</p></div>'; return; }
    const res=await KoguApi.apiFetch('/protected/core/empresas/'+empresa.empresa_id+'/certificados');
    rows=KoguApi.unwrapRows(res);
    renderPage();
    if(showToast) KoguApi.toast('Certificados actualizados por cambio de empresa','success');
  }
  KoguShell.subscribeEmpresaActivaChange(async()=>{ await load(true); });
  await load(false);
});
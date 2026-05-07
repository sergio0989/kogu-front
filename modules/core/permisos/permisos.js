document.addEventListener('DOMContentLoaded', async()=>{
  const b=await KoguShell.initShell({currentPage:'/modules/core/permisos/permisos.html',title:'Permisos',description:'Catálogo de permisos disponibles del sistema.',requiredPermission:'screen.catalogos.permisos'});
  if(!b) return;
  const c=document.getElementById('pageContent');
  c.innerHTML=`<div class="card"><div class="row"><div><div class="eyebrow">Permisos</div><h2>Catálogo</h2></div><input class="input" id="q" style="max-width:320px" placeholder="Buscar por clave o descripción"/></div><div class="table-wrap" style="margin-top:16px"><table><thead><tr><th>Clave</th><th>Descripción</th><th>Activo</th></tr></thead><tbody id="rows"></tbody></table></div></div>`;
  const res=await KoguApi.apiFetch('/protected/core/permisos');
  const rows=KoguApi.unwrapRows(res);
  function render(){ const q=document.getElementById('q').value.trim().toLowerCase(); const filtered=rows.filter(r=>`${r.clave||''} ${r.descripcion||''}`.toLowerCase().includes(q)); document.getElementById('rows').innerHTML=filtered.map(r=>`<tr><td>${KoguUi.escapeHtml(r.clave||'')}</td><td>${KoguUi.escapeHtml(r.descripcion||'')}</td><td>${KoguUi.statusBadge(r.activo?'activo':'inactivo')}</td></tr>`).join(''); }
  document.getElementById('q').oninput=render; render();
});
document.addEventListener('DOMContentLoaded',async()=>{const b=await KoguShell.initShell({currentPage:'index.html',title:'Inicio Core Multiempresa',description:'Pantalla inicial conectada a bootstrap y resumen corporativo.',requiredPermission:'screen.cfdi.sat_dm'});if(!b)return;const c=document.getElementById('pageContent');c.innerHTML='<div class="grid-4" id="kpis"></div><div class="grid-2" style="margin-top:18px"><div class="card"><div class="eyebrow">Bootstrap</div><h2>Contexto inicial</h2><div class="table-wrap" style="margin-top:16px"><table><thead><tr><th>Campo</th><th>Valor</th></tr></thead><tbody id="bootRows"></tbody></table></div></div><div class="card"><div class="eyebrow">Empresas</div><h2>Asignadas al usuario</h2><div class="table-wrap" style="margin-top:16px"><table><thead><tr><th>Empresa</th><th>RFC</th><th>Activa</th></tr></thead><tbody id="empRows"></tbody></table></div></div></div>';const r=await KoguApi.apiFetch('/protected/kogu/cfdi/dashboard/resumen-corporativo');const d=r.data||{};const k=[['Total CFDI',d.total_cfdi??0],['Vigentes',d.vigentes??0],['Cancelados',d.cancelados??0],['Monto total',d.monto_total??'0'],['Emitidos',d.emitidos??0],['Recibidos',d.recibidos??0],['Solicitudes activas',d.solicitudes_activas??0],['Paquetes pendientes',d.paquetes_pendientes??0]];document.getElementById('kpis').innerHTML=k.map(x=>`<div class="kpi"><div class="label">${x[0]}</div><div class="value">${x[1]}</div><div class="hint">Servicio actual</div></div>`).join('');document.getElementById('bootRows').innerHTML=[['Usuario',b.user?.nombre||'-'],['Email',b.user?.email||'-'],['Perfil',b.user?.perfil||'-'],['Ambiente',b.environment?.name||'-'],['Módulo CFDI',b.modules?.cfdi?'Sí':'No'],['Módulo Catálogos',b.modules?.catalogos?'Sí':'No']].map(x=>`<tr><td>${x[0]}</td><td>${x[1]}</td></tr>`).join('');document.getElementById('empRows').innerHTML=(b.empresas||[]).map(e=>`<tr><td>${e.nombre_corto||e.razon_social}</td><td>${e.rfc||''}</td><td>${e.activa?'<span class="badge success">Activa</span>':'<span class="badge neutral">Disponible</span>'}</td></tr>`).join('')});
document.addEventListener('DOMContentLoaded', async () => {
  const b = await KoguShell.initShell({
    currentPage: 'index.html',
    title: 'Inicio CFDI',
    description: 'Pantalla inicial conectada a bootstrap y resumen corporativo.',
    requiredPermission: 'screen.cfdi.sat_dm'
  });
  if (!b) return;

  const c = document.getElementById('pageContent');
  c.innerHTML = `
    <div class="grid-4" id="kpis"></div>
    <div class="grid-2" style="margin-top:18px">
      <div class="card">
        <div class="eyebrow">Bootstrap</div>
        <h2>Contexto inicial</h2>
        <div class="table-wrap" style="margin-top:16px">
          <table>
            <thead>
              <tr><th>Campo</th><th>Valor</th></tr>
            </thead>
            <tbody id="bootRows"></tbody>
          </table>
        </div>
      </div>
      <div class="card">
        <div class="eyebrow">Empresas</div>
        <h2>Asignadas al usuario</h2>
        <div class="table-wrap" style="margin-top:16px">
          <table>
            <thead>
              <tr><th>Empresa</th><th>RFC</th><th>Activa</th></tr>
            </thead>
            <tbody id="empRows"></tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  const r = await KoguApi.apiFetch('/protected/kogu/cfdi/dashboard/resumen-corporativo');
  const d = r.data || {};

  const k = [
    ['Total CFDI', d.total_cfdi ?? 0],
    ['Vigentes', d.vigentes ?? 0],
    ['Cancelados', d.cancelados ?? 0],
    ['Monto total', d.monto_total ?? '0'],
    ['Emitidos', d.emitidos ?? 0],
    ['Recibidos', d.recibidos ?? 0],
    ['Solicitudes activas', d.solicitudes_activas ?? 0],
    ['Paquetes pendientes', d.paquetes_pendientes ?? 0]
  ];

  document.getElementById('kpis').innerHTML = k.map(x => `
    <div class="kpi">
      <div class="label">${x[0]}</div>
      <div class="value">${x[1]}</div>
      <div class="hint">Servicio actual</div>
    </div>
  `).join('');

  document.getElementById('bootRows').innerHTML = [
    ['Usuario', b.user?.nombre || '-'],
    ['Email', b.user?.email || '-'],
    ['Perfil', b.user?.perfil || '-'],
    ['Ambiente', b.environment?.name || '-'],
    ['Módulo CFDI', b.modules?.cfdi ? 'Sí' : 'No'],
    ['Módulo Catálogos', b.modules?.catalogos ? 'Sí' : 'No']
  ].map(x => `<tr><td>${x[0]}</td><td>${x[1]}</td></tr>`).join('');

  document.getElementById('empRows').innerHTML = (b.empresas || []).map(e => `
    <tr>
      <td>${e.nombre_corto || e.razon_social}</td>
      <td>${e.rfc || ''}</td>
      <td>${e.activa ? '<span class="badge success">Activa</span>' : '<span class="badge neutral">Disponible</span>'}</td>
    </tr>
  `).join('');
});
document.addEventListener('DOMContentLoaded', async()=>{
  const b=await KoguShell.initShell({
    currentPage:'/modules/core/empresas/empresas.html',
    title:'Empresas',
    description:'CRUD completo base de empresas. Gestión de usuarios, certificados y baja lógica en una sola vista.',
    requiredPermission:'screen.root.index'
  });
  if(!b) return;

  const c=document.getElementById('pageContent');
  c.innerHTML=`
    <div class="stack">
      <div class="card">
        <div class="row empresas-head">
          <div>
            <div class="eyebrow">Empresas</div>
            <h2>Lista de empresas</h2>
          </div>
          <div class="page-actions empresas-toolbar">
            <input class="input empresas-search" id="q" placeholder="Buscar por nombre, RFC o clave"/>
            <select class="select empresas-filter" id="activoFiltro">
              <option value="">Todos</option>
              <option value="true">Activas</option>
              <option value="false">Inactivas</option>
            </select>
            <button class="btn primary" id="refreshBtn">Actualizar</button>
            <button class="btn" id="newBtn">Nueva</button>
          </div>
        </div>

       

        <div class="table-wrap" style="margin-top:16px">
          <table>
            <thead>
              <tr>
                <th>Clave</th>
                <th>Nombre corto</th>
                <th>Razón social</th>
                <th>RFC</th>
                <th>Status</th>
                <th>Activo</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody id="rows"></tbody>
          </table>
        </div>
      </div>

      <div class="split empresas-sections">
        <div class="card">
          <div class="row">
            <div>
              <div class="eyebrow">Formulario</div>
              <h2 id="formTitle">Formulario de empresa</h2>
            </div>
            <span class="chip" id="modeChip">Alta</span>
          </div>

          <div class="stack" style="margin-top:16px">
            <input type="hidden" id="empresa_id"/>

            <div class="grid-2">
              <div>
                <div class="label-text">Clave empresa</div>
                <input class="input" id="clave_empresa"/>
              </div>
              <div>
                <div class="label-text">Nombre corto</div>
                <input class="input" id="nombre_corto"/>
              </div>
            </div>

            <div>
              <div class="label-text">Razón social</div>
              <input class="input" id="razon_social"/>
            </div>

            <div class="grid-2">
              <div>
                <div class="label-text">RFC</div>
                <input class="input" id="rfc"/>
              </div>
              <div>
                <div class="label-text">Status</div>
                <select class="select" id="status">
                  <option value="activa">activa</option>
                  <option value="inactiva">inactiva</option>
                  <option value="suspendida">suspendida</option>
                </select>
              </div>
            </div>

            <div class="grid-2">
              <div>
                <div class="label-text">Activo</div>
                <select class="select" id="activo">
                  <option value="true">Sí</option>
                  <option value="false">No</option>
                </select>
              </div>
              <div>
                <div class="label-text">Empresa seleccionada</div>
                <div class="hero-note" id="empresaBadge">Sin empresa</div>
              </div>
            </div>

            <div class="page-actions">
              <button class="btn primary" id="saveBtn">Guardar</button>
              <button class="btn" id="goUsersBtn">Usuarios</button>
              <button class="btn" id="statusBtn">Baja lógica</button>
              <button class="btn" id="clearBtn">Limpiar</button>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="row">
            <div>
              <div class="eyebrow">Certificados</div>
              <h2>Carga y activación por empresa</h2>
            </div>
            <span class="chip" id="empresaCertChip">Sin empresa</span>
          </div>

          <div class="hero-note" style="margin-top:16px">
            Selecciona o edita una empresa para trabajar sus certificados y validar la salud fiscal desde esta misma operación.
          </div>

          <div class="stack" style="margin-top:16px">
            <div class="page-actions">
              <button class="btn primary" id="openUploadCertBtn">Cargar certificado</button>
              <button class="btn" id="loadCertsBtn">Consultar certificados</button>
              <a class="btn" href="/modules/core/salud-fiscal/salud-fiscal.html">Ver salud fiscal</a>
              <button class="btn" id="reloadPageBtn">Recargar empresas</button>
            </div>

            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Certificado</th>
                    <th>Serie</th>
                    <th>RFC</th>
                    <th>Activo</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody id="certRows">
                  <tr><td colspan="5" class="empty">Selecciona una empresa para consultar certificados.</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="modal-backdrop" id="certModal" hidden>
      <div class="modal-card">
        <div class="row">
          <div>
            <div class="eyebrow">Certificados</div>
            <h2>Cargar certificado</h2>
          </div>
          <button class="btn" id="closeCertModalBtn">Cerrar</button>
        </div>

        <div class="hero-note" style="margin-top:16px">
          La carga requiere obligatoriamente RFC, archivo <code>.cer</code>, archivo <code>.key</code> y contraseña.
        </div>

        <div class="stack" style="margin-top:16px">
          <div class="grid-2">
            <div>
              <div class="label-text">Empresa</div>
              <div class="hero-note" id="certModalEmpresaLabel">Sin empresa</div>
            </div>
            <div>
              <div class="label-text">RFC del certificado *</div>
              <input class="input" id="cert_rfc" maxlength="13"/>
            </div>
          </div>

          <div class="grid-2">
            <div>
              <div class="label-text">Nombre del certificado</div>
              <input class="input" id="cert_nombre" maxlength="150" placeholder="Alias opcional"/>
            </div>
            <div>
              <div class="label-text">Observaciones</div>
              <input class="input" id="cert_observaciones" placeholder="Opcional"/>
            </div>
          </div>

          <div class="grid-2">
            <div>
              <div class="label-text">Archivo .cer *</div>
              <input class="input" type="file" id="cert_cer_file" accept=".cer,application/pkix-cert"/>
            </div>
            <div>
              <div class="label-text">Archivo .key *</div>
              <input class="input" type="file" id="cert_key_file" accept=".key,application/octet-stream"/>
            </div>
          </div>

          <div>
            <div class="label-text">Contraseña *</div>
            <input class="input" type="password" id="cert_passphrase" placeholder="Passphrase de la llave"/>
          </div>

          <div class="page-actions">
            <button class="btn primary" id="saveCertBtn">Subir certificado</button>
            <button class="btn" id="cancelCertBtn">Cancelar</button>
          </div>
        </div>
      </div>
    </div>
  `;

  let rows=[];
  let selectedEmpresa=null;

  function val(id){ return document.getElementById(id).value.trim(); }

  function setSelectedEmpresa(row){
    selectedEmpresa=row||null;
    const label = row ? (row.nombre_corto||row.razon_social||'Empresa') : 'Sin empresa';
    document.getElementById('empresaBadge').textContent=label;
    document.getElementById('empresaCertChip').textContent=label;
    document.getElementById('certModalEmpresaLabel').textContent=label;
    try{
      if(row) sessionStorage.setItem('kogu.empresa.selected', JSON.stringify(row));
      else sessionStorage.removeItem('kogu.empresa.selected');
    }catch(_){}
  }

  function reset(){
    ['empresa_id','clave_empresa','nombre_corto','razon_social','rfc'].forEach(id=>document.getElementById(id).value='');
    document.getElementById('status').value='activa';
    document.getElementById('activo').value='true';
    document.getElementById('formTitle').textContent='Formulario de empresa';
    document.getElementById('modeChip').textContent='Alta';
    setSelectedEmpresa(null);
    document.getElementById('certRows').innerHTML='<tr><td colspan="5" class="empty">Selecciona una empresa para consultar certificados.</td></tr>';
  }

  function fill(row){
    document.getElementById('empresa_id').value=row.empresa_id||'';
    document.getElementById('clave_empresa').value=row.clave_empresa||'';
    document.getElementById('nombre_corto').value=row.nombre_corto||'';
    document.getElementById('razon_social').value=row.razon_social||'';
    document.getElementById('rfc').value=row.rfc||'';
    document.getElementById('status').value=row.status||'activa';
    document.getElementById('activo').value=String(!!row.activo);
    document.getElementById('formTitle').textContent='Editar empresa';
    document.getElementById('modeChip').textContent='Edición';
    setSelectedEmpresa(row);
    loadCertificados();
  }

  async function load(){
    const res=await KoguApi.apiFetch('/protected/core/empresas');
    rows=KoguApi.unwrapRows(res);
    render();
  }

  function render(){
    const q=val('q').toLowerCase();
    const af=document.getElementById('activoFiltro').value;

    const filtered=rows.filter(r=>{
      const text=`${r.clave_empresa||''} ${r.nombre_corto||''} ${r.razon_social||''} ${r.rfc||''}`.toLowerCase();
      const okText=!q||text.includes(q);
      const okAct=af==='' || String(!!r.activo)===af;
      return okText&&okAct;
    }).slice(0,5);

    document.getElementById('rows').innerHTML=filtered.length?filtered.map(r=>`
      <tr>
        <td>${KoguUi.escapeHtml(r.clave_empresa||'')}</td>
        <td>${KoguUi.escapeHtml(r.nombre_corto||'')}</td>
        <td>${KoguUi.escapeHtml(r.razon_social||'')}</td>
        <td>${KoguUi.escapeHtml(r.rfc||'')}</td>
        <td>${KoguUi.statusBadge(r.status||'-')}</td>
        <td>${KoguUi.statusBadge(r.activo?'Sí':'No')}</td>
        <td>
          <div class="actions-cell">
            <button class="btn btn-edit" data-id="${r.empresa_id}">Editar</button>
            <button class="btn btn-users" data-id="${r.empresa_id}">Usuarios</button>
            <button class="btn btn-status" data-id="${r.empresa_id}">Baja lógica</button>
          </div>
        </td>
      </tr>
    `).join(''):`<tr><td colspan="7" class="empty">Sin resultados</td></tr>`;

    document.querySelectorAll('.btn-edit').forEach(x=>x.onclick=()=>{
      const row=rows.find(r=>String(r.empresa_id)===x.dataset.id);
      if(row) fill(row);
    });

    document.querySelectorAll('.btn-users').forEach(x=>x.onclick=()=>{
      const row=rows.find(r=>String(r.empresa_id)===x.dataset.id);
      if(row){
        setSelectedEmpresa(row);
        window.location.href='/modules/core/empresas/empresa-usuarios.html';
      }
    });

    document.querySelectorAll('.btn-status').forEach(x=>x.onclick=async()=>{
      try{
        const row=rows.find(r=>String(r.empresa_id)===x.dataset.id);
        if(!row) throw new Error('Empresa no encontrada.');
        await KoguApi.apiFetch('/protected/core/empresas/'+row.empresa_id,{
          method:'PUT',
          body:JSON.stringify({
            clave_empresa:row.clave_empresa,
            nombre_corto:row.nombre_corto,
            razon_social:row.razon_social,
            rfc:row.rfc,
            status:'inactiva',
            activo:false
          })
        });
        KoguApi.toast('Baja lógica aplicada','success');
        await load();
      }catch(err){
        KoguApi.toast(err.message,'error');
      }
    });
  }

  async function loadCertificados(){
    try{
      if(!selectedEmpresa?.empresa_id) throw new Error('Selecciona una empresa primero.');
      const res=await KoguApi.apiFetch('/protected/core/empresas/'+selectedEmpresa.empresa_id+'/certificados');
      const certs=KoguApi.unwrapRows(res);
      document.getElementById('certRows').innerHTML=certs.length?certs.map(x=>{
        const certId = x.empresa_certificado_id || x.certificado_id || x.id || '';
        return `
        <tr>
          <td>${KoguUi.escapeHtml(x.nombre_certificado||'')}</td>
          <td>${KoguUi.escapeHtml(x.numero_serie||'')}</td>
          <td>${KoguUi.escapeHtml(x.rfc_certificado||'')}</td>
          <td>${KoguUi.statusBadge(x.activo?'Sí':'No')}</td>
          <td>
            <div class="actions-cell">
              <button class="btn btn-activate-cert" data-id="${certId}">Activar</button>
            </div>
          </td>
        </tr>`;
      }).join(''):`<tr><td colspan="5" class="empty">La empresa no tiene certificados registrados.</td></tr>`;

      document.querySelectorAll('.btn-activate-cert').forEach(btn=>{
        btn.onclick = async()=>{
          try{
            if(!selectedEmpresa?.empresa_id) throw new Error('Selecciona una empresa.');
            await KoguApi.apiFetch('/protected/core/empresas/'+selectedEmpresa.empresa_id+'/certificados/'+btn.dataset.id+'/activar',{
              method:'POST'
            });
            KoguApi.toast('Certificado activado','success');
            await loadCertificados();
          }catch(err){
            KoguApi.toast(err.message,'error');
          }
        };
      });
    }catch(err){
      KoguApi.toast(err.message,'error');
    }
  }

  function openCertModal(){
    if(!selectedEmpresa?.empresa_id){
      KoguApi.toast('Selecciona una empresa primero.','error');
      return;
    }
    document.getElementById('cert_rfc').value = selectedEmpresa.rfc || '';
    document.getElementById('cert_nombre').value = '';
    document.getElementById('cert_observaciones').value = '';
    document.getElementById('cert_passphrase').value = '';
    document.getElementById('cert_cer_file').value = '';
    document.getElementById('cert_key_file').value = '';
    document.getElementById('certModal').hidden = false;
  }

  function closeCertModal(){
    document.getElementById('certModal').hidden = true;
  }

  async function saveCertificado(){
    try{
      if(!selectedEmpresa?.empresa_id) throw new Error('Selecciona una empresa primero.');

      const rfc = val('cert_rfc');
      const passphrase = val('cert_passphrase');
      const cerFile = document.getElementById('cert_cer_file').files?.[0];
      const keyFile = document.getElementById('cert_key_file').files?.[0];
      const nombre = val('cert_nombre');
      const observaciones = val('cert_observaciones');

      if(!rfc) throw new Error('RFC es obligatorio.');
      if(!cerFile) throw new Error('Archivo .cer es obligatorio.');
      if(!keyFile) throw new Error('Archivo .key es obligatorio.');
      if(!passphrase) throw new Error('Contraseña es obligatoria.');

      const formData = new FormData();
      formData.append('rfc_certificado', rfc);
      formData.append('key_password', passphrase);
      formData.append('cer_file', cerFile);
      formData.append('key_file', keyFile);
      if(nombre) formData.append('nombre_certificado', nombre);
      if(observaciones) formData.append('observaciones', observaciones);

      await KoguApi.apiFetch('/protected/core/empresas/'+selectedEmpresa.empresa_id+'/certificados', {
        method:'POST',
        body: formData,
        headers: {}
      });

      KoguApi.toast('Certificado cargado correctamente','success');
      closeCertModal();
      await loadCertificados();
    }catch(err){
      KoguApi.toast(err.message,'error');
    }
  }

  document.getElementById('refreshBtn').onclick=load;
  document.getElementById('newBtn').onclick=reset;
  document.getElementById('clearBtn').onclick=reset;
  document.getElementById('reloadPageBtn').onclick=load;
  document.getElementById('loadCertsBtn').onclick=loadCertificados;
  document.getElementById('openUploadCertBtn').onclick=openCertModal;
  document.getElementById('closeCertModalBtn').onclick=closeCertModal;
  document.getElementById('cancelCertBtn').onclick=closeCertModal;
  document.getElementById('saveCertBtn').onclick=saveCertificado;
  document.getElementById('q').oninput=render;
  document.getElementById('activoFiltro').onchange=render;

  document.getElementById('saveBtn').onclick=async()=>{
    try{
      const payload={
        clave_empresa:val('clave_empresa'),
        nombre_corto:val('nombre_corto'),
        razon_social:val('razon_social'),
        rfc:val('rfc'),
        status:document.getElementById('status').value,
        activo:document.getElementById('activo').value==='true'
      };
      if(!payload.clave_empresa||!payload.nombre_corto||!payload.razon_social||!payload.rfc){
        throw new Error('Completa clave, nombre corto, razón social y RFC.');
      }
      const id=document.getElementById('empresa_id').value;
      if(id){
        await KoguApi.apiFetch('/protected/core/empresas/'+id,{method:'PUT',body:JSON.stringify(payload)});
        KoguApi.toast('Empresa actualizada','success');
      }else{
        await KoguApi.apiFetch('/protected/core/empresas',{method:'POST',body:JSON.stringify(payload)});
        KoguApi.toast('Empresa creada','success');
      }
      reset();
      await load();
    }catch(err){
      KoguApi.toast(err.message,'error');
    }
  };

  document.getElementById('goUsersBtn').onclick=()=>{
    if(selectedEmpresa){
      try{ sessionStorage.setItem('kogu.empresa.selected', JSON.stringify(selectedEmpresa)); }catch(_){}
    }
    window.location.href='/modules/core/empresas/empresa-usuarios.html';
  };

  document.getElementById('statusBtn').onclick=async()=>{
    try{
      const id=document.getElementById('empresa_id').value;
      if(!id) throw new Error('Selecciona una empresa para aplicar baja lógica.');
      const row=rows.find(r=>String(r.empresa_id)===String(id));
      if(!row) throw new Error('Empresa no encontrada.');
      await KoguApi.apiFetch('/protected/core/empresas/'+id,{
        method:'PUT',
        body:JSON.stringify({
          clave_empresa:row.clave_empresa,
          nombre_corto:row.nombre_corto,
          razon_social:row.razon_social,
          rfc:row.rfc,
          status:'inactiva',
          activo:false
        })
      });
      KoguApi.toast('Baja lógica aplicada','success');
      reset();
      await load();
    }catch(err){
      KoguApi.toast(err.message,'error');
    }
  };

  await load();
});
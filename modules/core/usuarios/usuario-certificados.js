document.addEventListener('DOMContentLoaded', async () => {
  let bootstrap = await KoguShell.initShell({
    currentPage: '/modules/core/usuarios/usuario-certificados.html',
    title: 'Mis certificados',
    description: 'Consulta la empresa activa y carga sus certificados sin editar la información general de la empresa.'
  });
  if (!bootstrap) return;

  const container = document.getElementById('pageContent');

  let empresa = bootstrap?.empresa_activa || {};
  let renderedEmpresaId = null;

  function renderNoEmpresa() {
    renderedEmpresaId = null;
    container.innerHTML = `
      <div class="card">
        <div class="eyebrow">Empresa activa</div>
        <h2>Sin empresa activa</h2>
        <p>Selecciona una empresa para continuar con la carga de certificados.</p>
        <div class="page-actions" style="margin-top:16px">
          <a class="btn primary" href="/modules/core/contexto/cambio-empresa.html">Cambiar empresa</a>
        </div>
      </div>
    `;
  }

  function renderPage() {
    renderedEmpresaId = empresa?.empresa_id || null;

    container.innerHTML = `
      <div class="split">
        <div class="card">
          <div class="row">
            <div>
              <div class="eyebrow">Empresa activa</div>
              <h2 id="empresaTitulo">${KoguUi.escapeHtml(empresa.nombre_corto || empresa.razon_social || 'Sin empresa')}</h2>
            </div>
            <button class="btn" id="refreshEmpresaBtn">Actualizar</button>
          </div>

          <div class="grid-2" style="margin-top:18px">
            <div class="hero-note">
              <strong>Razón social</strong><br>
              <span id="empresaRazonSocial">${KoguUi.escapeHtml(empresa.razon_social || '-')}</span>
            </div>
            <div class="hero-note">
              <strong>Nombre corto</strong><br>
              <span id="empresaNombreCorto">${KoguUi.escapeHtml(empresa.nombre_corto || '-')}</span>
            </div>
            <div class="hero-note">
              <strong>RFC</strong><br>
              <span id="empresaRfc">${KoguUi.escapeHtml(empresa.rfc || '-')}</span>
            </div>
            <div class="hero-note">
              <strong>Estatus</strong><br>
              <span id="empresaStatus">${KoguUi.escapeHtml(empresa.status || empresa.estado || 'activo')}</span>
            </div>
          </div>

          <div class="hero-note" style="margin-top:16px">
            Esta vista solo muestra la empresa activa y permite la carga de certificados. No modifica los datos generales de la empresa.
          </div>
        </div>

        <div class="card">
          <div class="eyebrow">Alta</div>
          <h2>Cargar certificado</h2>
          <p class="muted" style="margin-top:8px">La carga requiere RFC, archivos <code>.cer</code> y <code>.key</code>, además de la contraseña de la llave.</p>

          <div class="stack" style="margin-top:16px">
            <div>
              <div class="label-text">RFC del certificado *</div>
              <input class="input" id="cert_rfc" maxlength="13" value="${KoguUi.escapeHtml(empresa.rfc || '')}"/>
            </div>
            <div>
              <div class="label-text">Nombre del certificado</div>
              <input class="input" id="cert_nombre" maxlength="150" placeholder="Alias opcional"/>
            </div>
            <div>
              <div class="label-text">Observaciones</div>
              <input class="input" id="cert_observaciones" maxlength="255" placeholder="Opcional"/>
            </div>
            <div>
              <div class="label-text">Archivo .cer *</div>
              <input class="input" type="file" id="cert_cer_file" accept=".cer,application/pkix-cert"/>
            </div>
            <div>
              <div class="label-text">Archivo .key *</div>
              <input class="input" type="file" id="cert_key_file" accept=".key,application/octet-stream"/>
            </div>
            <div>
              <div class="label-text">Contraseña de la llave *</div>
              <input class="input" type="password" id="cert_passphrase" placeholder="Passphrase de la llave"/>
            </div>
            <div class="page-actions">
              <button class="btn" id="clearBtn">Limpiar</button>
              <button class="btn primary" id="saveCertBtn">Subir certificado</button>
            </div>
          </div>
        </div>
      </div>
    `;

    bindEvents();
  }

  function bindEvents() {
    const refreshBtn = document.getElementById('refreshEmpresaBtn');
    const clearBtn = document.getElementById('clearBtn');
    const saveBtn = document.getElementById('saveCertBtn');

    if (refreshBtn) refreshBtn.onclick = () => load(false);
    if (clearBtn) clearBtn.onclick = resetForm;
    if (saveBtn) saveBtn.onclick = saveCertificado;
  }

  function updateEmpresaInfo() {
    const empresaTitulo = document.getElementById('empresaTitulo');
    const empresaRazonSocial = document.getElementById('empresaRazonSocial');
    const empresaNombreCorto = document.getElementById('empresaNombreCorto');
    const empresaRfc = document.getElementById('empresaRfc');
    const empresaStatus = document.getElementById('empresaStatus');
    const rfcInput = document.getElementById('cert_rfc');

    if (empresaTitulo) {
      empresaTitulo.textContent = empresa.nombre_corto || empresa.razon_social || 'Sin empresa';
    }
    if (empresaRazonSocial) {
      empresaRazonSocial.textContent = empresa.razon_social || '-';
    }
    if (empresaNombreCorto) {
      empresaNombreCorto.textContent = empresa.nombre_corto || '-';
    }
    if (empresaRfc) {
      empresaRfc.textContent = empresa.rfc || '-';
    }
    if (empresaStatus) {
      empresaStatus.textContent = empresa.status || empresa.estado || 'activo';
    }

    if (rfcInput && !rfcInput.value.trim()) {
      rfcInput.value = empresa.rfc || '';
    }
  }

  function resetForm() {
    const rfcInput = document.getElementById('cert_rfc');
    const nombreInput = document.getElementById('cert_nombre');
    const observacionesInput = document.getElementById('cert_observaciones');
    const passphraseInput = document.getElementById('cert_passphrase');
    const cerFileInput = document.getElementById('cert_cer_file');
    const keyFileInput = document.getElementById('cert_key_file');

    if (rfcInput) rfcInput.value = empresa.rfc || '';
    if (nombreInput) nombreInput.value = '';
    if (observacionesInput) observacionesInput.value = '';
    if (passphraseInput) passphraseInput.value = '';
    if (cerFileInput) cerFileInput.value = '';
    if (keyFileInput) keyFileInput.value = '';
  }

  async function saveCertificado() {
    try {
      if (!empresa?.empresa_id) throw new Error('No existe una empresa activa válida.');

      const rfc = (document.getElementById('cert_rfc')?.value || '').trim().toUpperCase();
      const passphrase = (document.getElementById('cert_passphrase')?.value || '').trim();
      const cerFile = document.getElementById('cert_cer_file')?.files?.[0];
      const keyFile = document.getElementById('cert_key_file')?.files?.[0];
      const nombre = (document.getElementById('cert_nombre')?.value || '').trim();
      const observaciones = (document.getElementById('cert_observaciones')?.value || '').trim();

      if (!rfc) throw new Error('RFC es obligatorio.');
      if (!cerFile) throw new Error('Archivo .cer es obligatorio.');
      if (!keyFile) throw new Error('Archivo .key es obligatorio.');
      if (!passphrase) throw new Error('Contraseña es obligatoria.');

      const formData = new FormData();
      formData.append('rfc_certificado', rfc);
      formData.append('key_password', passphrase);
      formData.append('cer_file', cerFile);
      formData.append('key_file', keyFile);
      if (nombre) formData.append('nombre_certificado', nombre);
      if (observaciones) formData.append('observaciones', observaciones);

      await KoguApi.apiFetch(`/protected/core/empresas/${empresa.empresa_id}/certificados`, {
        method: 'POST',
        body: formData,
        headers: {}
      });

      KoguApi.toast('Certificado cargado correctamente', 'success');
      resetForm();
    } catch (err) {
      KoguApi.toast(err.message, 'error');
    }
  }

  async function load(showToast = false) {
    bootstrap = await KoguShell.loadBootstrap();
    const nextEmpresa = bootstrap?.empresa_activa || {};
    const nextEmpresaId = nextEmpresa?.empresa_id || null;

    empresa = nextEmpresa;

    if (!nextEmpresaId) {
      renderNoEmpresa();
      return;
    }

    if (renderedEmpresaId !== nextEmpresaId) {
      renderPage();
    } else {
      updateEmpresaInfo();
    }

    if (showToast) KoguApi.toast('Empresa activa actualizada', 'success');
  }

  KoguShell.subscribeEmpresaActivaChange(async () => {
    await load(true);
  });

  await load(false);
});
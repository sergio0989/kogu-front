// ============================================================
// portal.js — Panel del proveedor (portal externo).
// Muestra expediente + checklist + envíos y permite subir documentos.
// Consume /portal/me/* con token de portal y ?empresa_id.
// ============================================================
(function () {
  if (!PortalApi.requireSession()) return;

  const $ = id => document.getElementById(id);
  const esc = PortalApi.escapeHtml;
  const fmtDate = d => d ? new Date(d).toLocaleDateString('es-MX') : '—';

  const TIPO_DOC = [
    ['constancia_situacion_fiscal', 'Constancia de situación fiscal'],
    ['comprobante_domicilio',       'Comprobante de domicilio'],
    ['acta_constitutiva',           'Acta constitutiva'],
    ['poder_notarial',              'Poder notarial'],
    ['cedula_fiscal',               'Cédula fiscal'],
    ['estado_cuenta_bancario',      'Estado de cuenta bancario'],
    ['contrato_marco',              'Contrato marco'],
    ['registro_patronal_imss',      'Registro patronal IMSS'],
    ['prueba_capacidad_proveedor',  'Prueba de capacidad'],
    ['identificacion_oficial_representante', 'Identificación del representante'],
    ['otro',                        'Otro'],
  ];
  const TIPO_LABEL = Object.fromEntries(TIPO_DOC);

  const STATUS_BADGE = {
    en_revision: '<span class="chip" style="background:#fef3c7;color:#92600c">En revisión</span>',
    aprobado:    '<span class="chip" style="background:#dcfce7;color:#15803d">Aprobado</span>',
    rechazado:   '<span class="chip" style="background:#fee2e2;color:#991b1b">Rechazado</span>',
    vigente:     '<span class="chip" style="background:#dcfce7;color:#15803d">Vigente</span>',
    por_vencer:  '<span class="chip" style="background:#fef3c7;color:#92600c">Por vencer</span>',
    vencido:     '<span class="chip" style="background:#fee2e2;color:#991b1b">Vencido</span>',
  };

  $('logoutBtn').onclick = () => { PortalApi.clear(); window.location.href = '/portal/login.html'; };

  async function initEmpresas() {
    let empresas = [];
    try { const d = await PortalApi.call('/portal/me/empresas'); empresas = d.rows || []; }
    catch (e) { return []; }
    const sel = $('empSelect');
    if (empresas.length <= 1) { sel.style.display = 'none'; } else { sel.style.display = ''; }
    sel.innerHTML = empresas.map(e =>
      `<option value="${esc(e.empresa_id)}">${esc(e.empresa_nombre || e.empresa_razon_social || e.empresa_id)}</option>`
    ).join('');
    // empresa activa
    let active = PortalApi.getEmpresaId();
    if (!active || !empresas.find(e => e.empresa_id === active)) {
      active = (empresas.find(e => e.es_predeterminada) || empresas[0])?.empresa_id || '';
      PortalApi.setEmpresaId(active);
    }
    sel.value = active;
    sel.onchange = () => { PortalApi.setEmpresaId(sel.value); loadAll(); };
    return empresas;
  }

  async function loadAll() {
    $('app').innerHTML = '<div class="muted" style="padding:40px;text-align:center">Cargando…</div>';
    let exp = {}, reqs = [], envios = [], bancarios = [];
    try {
      const [e, r, s, bk] = await Promise.all([
        PortalApi.call('/portal/me/expediente', { withEmpresa: true }),
        PortalApi.call('/portal/me/requisitos', { withEmpresa: true }),
        PortalApi.call('/portal/me/documentos', { withEmpresa: true }),
        PortalApi.call('/portal/me/bancarios',  { withEmpresa: true }).catch(() => ({ cuentas: [] })),
      ]);
      exp = e || {}; reqs = (r && r.rows) || []; envios = (s && s.rows) || [];
      bancarios = (bk && bk.cuentas) || [];
    } catch (err) {
      $('app').innerHTML = `<div class="card"><p style="color:#dc2626">No se pudo cargar tu expediente: ${esc(err.message)}</p></div>`;
      return;
    }

    const expediente = exp.expediente || null;
    const documentos = exp.documentos || [];
    if (expediente?.nombre) $('provName').textContent = expediente.nombre + (expediente.rfc ? ' · ' + expediente.rfc : '');

    const nAprob = documentos.filter(d => ['vigente', 'por_vencer'].includes(d.status)).length;
    const nRev   = envios.filter(e => e.status === 'en_revision').length;
    const nRech  = envios.filter(e => e.status === 'rechazado').length;

    render({ expediente, documentos, reqs, envios, nAprob, nRev, nRech, bancarios });
  }

  function render({ documentos, reqs, envios, nAprob, nRev, nRech, bancarios = [] }) {
    const BANCO_BADGE = {
      validada:    '<span class="chip" style="background:#dcfce7;color:#15803d">Validada</span>',
      pendiente:   '<span class="chip" style="background:#fef3c7;color:#92600c">Pendiente</span>',
      en_revision: '<span class="chip" style="background:#fef3c7;color:#92600c">En revisión</span>',
      rechazada:   '<span class="chip" style="background:#fee2e2;color:#991b1b">Rechazada</span>',
      revocada:    '<span class="chip" style="background:#fee2e2;color:#991b1b">Revocada</span>',
    };
    const cuentaActiva = (bancarios || [])[0] || null;
    const bancoEstado = cuentaActiva
      ? (BANCO_BADGE[cuentaActiva.autorizacion_status] || BANCO_BADGE[cuentaActiva.cuenta_status] || esc(cuentaActiva.cuenta_status || ''))
      : '<span class="chip" style="background:#f1f5f9;color:#475569">Sin registrar</span>';
    // estado por tipo: aprobado (en documentos) / en_revision / rechazado (último envío)
    const docTipos = new Set(documentos.map(d => d.tipo_documento));
    const envByTipo = {};
    envios.forEach(e => { if (!envByTipo[e.tipo_documento]) envByTipo[e.tipo_documento] = e; });

    const checklist = (reqs.length ? reqs.map(r => r.tipo_documento) : [])
      .concat(documentos.map(d => d.tipo_documento))
      .filter((v, i, a) => a.indexOf(v) === i);

    const checklistRows = checklist.length ? checklist.map(tipo => {
      let estado;
      if (docTipos.has(tipo)) estado = 'aprobado';
      else if (envByTipo[tipo]) estado = envByTipo[tipo].status;
      else estado = 'pendiente';
      const badge = estado === 'pendiente'
        ? '<span class="chip" style="background:#f1f5f9;color:#475569">Pendiente</span>'
        : (STATUS_BADGE[estado] || esc(estado));
      const motivo = (estado === 'rechazado' && envByTipo[tipo]?.motivo_rechazo)
        ? `<div style="font-size:11px;color:#991b1b;margin-top:3px">Motivo: ${esc(envByTipo[tipo].motivo_rechazo)}</div>` : '';
      return `<tr>
        <td>${esc(TIPO_LABEL[tipo] || tipo)}${motivo}</td>
        <td>${badge}</td>
        <td style="text-align:right">
          ${estado === 'pendiente' || estado === 'rechazado'
            ? `<button class="btn sm primary btn-up" data-tipo="${esc(tipo)}">Subir</button>`
            : '<span class="muted" style="font-size:12px">—</span>'}
        </td>
      </tr>`;
    }).join('') : '<tr><td colspan="3" class="empty">La empresa aún no definió documentos requeridos. Puedes subir los tuyos abajo.</td></tr>';

    $('app').innerHTML = `
      <div class="pp-kpis">
        <div class="pp-kpi"><div class="v" style="color:#16a34a">${nAprob}</div><div class="l">Aprobados</div></div>
        <div class="pp-kpi"><div class="v" style="color:#d97706">${nRev}</div><div class="l">En revisión</div></div>
        <div class="pp-kpi"><div class="v" style="color:#dc2626">${nRech}</div><div class="l">Rechazados</div></div>
      </div>

      <div class="card">
        <div class="row"><div><div class="eyebrow">Mi expediente</div><h2>Documentos requeridos</h2></div></div>
        <div class="table-wrap" style="margin-top:14px">
          <table><thead><tr><th>Documento</th><th>Estatus</th><th style="text-align:right">Acción</th></tr></thead>
          <tbody>${checklistRows}</tbody></table>
        </div>
      </div>

      <div class="card" style="margin-top:16px">
        <div class="eyebrow">Subir documento</div>
        <h2 style="margin-bottom:6px">Cargar un documento</h2>
        <p class="muted" style="font-size:13px;margin-top:0">El documento queda en revisión hasta que la empresa lo apruebe. PDF o imagen, máx. 10 MB.</p>
        <div class="grid-2" style="gap:10px;margin-top:10px">
          <div>
            <div class="label-text">Tipo de documento</div>
            <select class="select" id="upTipo">${TIPO_DOC.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>
          </div>
          <div>
            <div class="label-text">Archivo</div>
            <input class="input" id="upFile" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" />
          </div>
        </div>
        <div class="grid-2" style="gap:10px;margin-top:10px">
          <div><div class="label-text">Vigencia desde (opcional)</div><input class="input" id="upDesde" type="date"/></div>
          <div><div class="label-text">Vigencia hasta (opcional)</div><input class="input" id="upHasta" type="date"/></div>
        </div>
        <button class="btn primary" id="upBtn" style="margin-top:12px">Enviar a revisión</button>
      </div>

      <div class="card" style="margin-top:16px">
        <div class="row"><div><div class="eyebrow">Información financiera</div><h2>Datos bancarios</h2></div><div>${bancoEstado}</div></div>
        ${cuentaActiva ? `
        <div class="table-wrap" style="margin-top:12px">
          <table><thead><tr><th>Banco</th><th>CLABE</th><th>Titular</th><th>Moneda</th><th>Estatus</th></tr></thead>
          <tbody><tr>
            <td>${esc(cuentaActiva.banco_nombre || cuentaActiva.banco_codigo || '—')}</td>
            <td style="font-family:monospace;font-size:12px">${esc(cuentaActiva.clabe || cuentaActiva.cuenta_15 || '—')}</td>
            <td>${esc(cuentaActiva.titular || '—')}</td>
            <td>${esc(cuentaActiva.moneda || 'MXN')}</td>
            <td>${BANCO_BADGE[cuentaActiva.autorizacion_status] || BANCO_BADGE[cuentaActiva.cuenta_status] || esc(cuentaActiva.cuenta_status || '')}</td>
          </tr></tbody></table>
        </div>
        <p class="muted" style="font-size:12px;margin-top:6px">Para cambiar tu cuenta, registra una nueva abajo. Quedará en revisión hasta que la empresa la valide.</p>` :
        '<p class="muted" style="font-size:13px;margin-top:6px">Aún no has registrado una cuenta bancaria.</p>'}

        <div class="grid-2" style="gap:10px;margin-top:12px">
          <div>
            <div class="label-text">País del banco</div>
            <select class="select" id="bkPais"><option value="MEX" selected>México</option><option value="USA">Extranjero</option></select>
          </div>
          <div>
            <div class="label-text">Clave bancaria (3 díg. de CLABE)</div>
            <input class="input" id="bkClave" maxlength="3" inputmode="numeric" placeholder="012"/>
          </div>
        </div>
        <div class="grid-2" style="gap:10px;margin-top:10px">
          <div>
            <div class="label-text">Número de cuenta (15 díg. de CLABE)</div>
            <input class="input" id="bkCuenta" maxlength="15" inputmode="numeric" placeholder="180001864380912"/>
          </div>
          <div>
            <div class="label-text">Titular de la cuenta</div>
            <input class="input" id="bkTitular" placeholder="Razón social del proveedor"/>
          </div>
        </div>
        <div class="grid-2" style="gap:10px;margin-top:10px">
          <div>
            <div class="label-text">Moneda</div>
            <select class="select" id="bkMoneda"><option value="MXN" selected>MXN</option><option value="USD">USD</option></select>
          </div>
          <div>
            <div class="label-text">Comprobante (carátula / estado de cuenta)</div>
            <input class="input" id="bkFile" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp"/>
          </div>
        </div>
        <button class="btn primary" id="bkBtn" style="margin-top:12px">Guardar cuenta bancaria</button>
        <p class="muted" style="font-size:11px;margin-top:6px">KOGU valida la CLABE (18 dígitos) antes de guardar. Tus datos bancarios se muestran enmascarados.</p>
      </div>

      <div class="card" style="margin-top:16px">
        <div class="eyebrow">Historial</div>
        <h2 style="margin-bottom:6px">Mis envíos</h2>
        <div class="table-wrap" style="margin-top:10px">
          <table><thead><tr><th>Documento</th><th>Archivo</th><th>Enviado</th><th>Estatus</th></tr></thead>
          <tbody>${envios.length ? envios.map(e => `
            <tr>
              <td>${esc(TIPO_LABEL[e.tipo_documento] || e.tipo_documento)}</td>
              <td style="font-size:12px">${esc(e.nombre_archivo || '—')}</td>
              <td style="font-size:12px;white-space:nowrap">${fmtDate(e.created_at)}</td>
              <td>${STATUS_BADGE[e.status] || esc(e.status)}${(e.status === 'rechazado' && e.motivo_rechazo) ? `<div style="font-size:11px;color:#991b1b">${esc(e.motivo_rechazo)}</div>` : ''}</td>
            </tr>`).join('') : '<tr><td colspan="4" class="empty">Aún no has enviado documentos.</td></tr>'}
          </tbody></table>
        </div>
      </div>`;

    document.querySelectorAll('.btn-up').forEach(b => b.onclick = () => {
      $('upTipo').value = b.dataset.tipo;
      $('upFile').focus();
      $('upTipo').scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    $('upBtn').onclick = subir;
    if ($('bkBtn')) $('bkBtn').onclick = guardarBanco;
  }

  async function guardarBanco() {
    const pais = $('bkPais').value;
    const titular = $('bkTitular').value.trim();
    if (!titular) { PortalApi.toast('Captura el titular de la cuenta.', 'error'); return; }
    const fd = new FormData();
    fd.append('pais_banco', pais);
    fd.append('titular', titular);
    fd.append('moneda', $('bkMoneda').value);
    if (pais === 'MEX') {
      const clave = $('bkClave').value.replace(/\D/g, '');
      const cuenta = $('bkCuenta').value.replace(/\D/g, '');
      if (clave.length !== 3) { PortalApi.toast('La clave bancaria debe tener 3 dígitos.', 'error'); return; }
      if (cuenta.length !== 15) { PortalApi.toast('El número de cuenta debe tener 15 dígitos.', 'error'); return; }
      fd.append('banco_codigo', clave);
      fd.append('cuenta_15', cuenta);
    }
    const file = $('bkFile').files[0];
    if (file) fd.append('comprobante', file);

    const btn = $('bkBtn'); btn.disabled = true; btn.textContent = 'Guardando…';
    try {
      await PortalApi.call('/portal/me/bancarios', { method: 'POST', form: fd, withEmpresa: true });
      PortalApi.toast('Cuenta bancaria registrada. Queda en revisión.', 'success');
      await loadAll();
    } catch (err) {
      PortalApi.toast(err.message || 'No se pudo guardar la cuenta.', 'error');
      btn.disabled = false; btn.textContent = 'Guardar cuenta bancaria';
    }
  }

  async function subir() {
    const tipo = $('upTipo').value;
    const file = $('upFile').files[0];
    if (!file) { PortalApi.toast('Selecciona un archivo.', 'error'); return; }
    const fd = new FormData();
    fd.append('tipo_documento', tipo);
    fd.append('archivo', file);
    if ($('upDesde').value) fd.append('vigencia_desde', $('upDesde').value);
    if ($('upHasta').value) fd.append('vigencia_hasta', $('upHasta').value);

    const btn = $('upBtn');
    btn.disabled = true; btn.textContent = 'Enviando…';
    try {
      await PortalApi.call('/portal/me/documentos', { method: 'POST', form: fd, withEmpresa: true });
      PortalApi.toast('Documento enviado a revisión.', 'success');
      await loadAll();
    } catch (err) {
      PortalApi.toast(err.message || 'No se pudo enviar el documento.', 'error');
      btn.disabled = false; btn.textContent = 'Enviar a revisión';
    }
  }

  (async () => { await initEmpresas(); await loadAll(); })();
})();

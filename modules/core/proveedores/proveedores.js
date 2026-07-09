document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/core/proveedores/proveedores.html';
  const BASE = '/protected/core/proveedores';
  const PERM = 'screen.catalogos.proveedores';

  const b = await KoguShell.initShell({
    currentPage:        PAGE,
    title:              'Proveedores',
    description:        'Catálogo base multiempresa de proveedores.',
    requiredPermission: PERM,
  });
  if (!b) return;

  const c = document.getElementById('pageContent');
  c.innerHTML = `
<div class="card">
  <div class="row">
    <div><div class="eyebrow">Catálogo</div><h2>Proveedores</h2></div>
    <div style="display:flex;gap:8px">
      <button class="btn primary" id="newProvBtn">+ Nuevo proveedor</button>
      <button class="btn"         id="refreshBtn">Actualizar</button>
    </div>
  </div>
  <div class="grid-2" style="margin-top:16px;gap:10px">
    <input  class="input"  id="q" placeholder="Buscar por nombre, RFC o clave SAI…" />
    <select class="select" id="condFil">
      <option value="">Todas las condiciones</option>
      <option value="contado">Contado</option>
      <option value="credito">Crédito</option>
      <option value="anticipado">Anticipado</option>
    </select>
    <select class="select" id="activoFil">
      <option value="">Todos</option>
      <option value="true">Activos</option>
      <option value="false">Inactivos</option>
    </select>
  </div>
  <div class="table-wrap" style="margin-top:16px">
    <table><thead><tr>
      <th>Nombre</th>
      <th style="width:150px">RFC</th>
      <th style="width:110px">Clave SAI</th>
      <th style="width:110px">Condición</th>
      <th style="width:140px;text-align:right">Crédito</th>
      <th style="width:90px">Estado</th>
      <th style="width:150px"></th>
    </tr></thead><tbody id="rows"></tbody></table>
  </div>
  <div id="pgBar" style="display:flex;align-items:center;justify-content:space-between;margin-top:10px;font-size:13px;color:var(--muted)"></div>
</div>`;

  // ── Modal edición ──────────────────────────────────────────────────────────
  const DIAS = [
    ['lu', 'Lu'], ['ma', 'Ma'], ['mi', 'Mi'], ['ju', 'Ju'],
    ['vi', 'Vi'], ['sa', 'Sá'], ['do', 'Do'],
  ];
  const dayToggles = (prefix) => DIAS.map(([k, lbl]) =>
    `<label style="display:inline-flex;align-items:center;gap:4px;font-size:12px;border:1px solid var(--line,#e2e8f0);border-radius:8px;padding:5px 9px;cursor:pointer">
       <input type="checkbox" id="${prefix}_${k}" style="margin:0"/> ${lbl}
     </label>`).join('');

  function buildModal() {
    const overlay = document.createElement('div');
    overlay.id = 'provModal';
    overlay.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:9999;align-items:flex-start;justify-content:center;padding:40px 20px 20px;backdrop-filter:blur(2px)';
    overlay.innerHTML = `
      <div style="width:100%;max-width:720px;max-height:88vh;background:white;border-radius:12px;box-shadow:0 20px 50px rgba(0,0,0,.3);display:flex;flex-direction:column;overflow:hidden;color:#0f172a">
        <!-- Header -->
        <div style="padding:16px 20px;border-bottom:1px solid var(--line,#e2e8f0);display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
          <div>
            <div class="eyebrow">Proveedor</div>
            <h2 id="formTitle" style="margin:0;font-size:20px">Nuevo proveedor</h2>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <span class="chip" id="modeChip">Alta</span>
            <button class="btn ghost" id="closeModalBtn" style="padding:6px 10px;font-size:16px">✕</button>
          </div>
        </div>
        <!-- Body -->
        <div style="flex:1;overflow-y:auto;padding:20px">
          <div class="stack">
            <input type="hidden" id="provId"/>

            <!-- Identificación -->
            <div class="eyebrow" style="margin-bottom:6px">Identificación</div>
            <div>
              <div class="label-text">Nombre / Razón social <span style="color:var(--danger)">*</span></div>
              <input class="input" id="pNombre" placeholder="Nombre del proveedor" maxlength="160"/>
            </div>
            <div class="grid-2" style="gap:10px">
              <div>
                <div class="label-text">RFC</div>
                <input class="input" id="pRfc" placeholder="Ej: XAXX010101000" maxlength="20" style="text-transform:uppercase"/>
              </div>
              <div>
                <div class="label-text">Clave SAI <span class="muted" style="font-size:11px">(clave en ALPHA ERP, ej. 397)</span></div>
                <input class="input" id="pCveProv" placeholder="Ej: 397" maxlength="50"/>
              </div>
              <div>
                <div class="label-text">Email de contacto</div>
                <input class="input" id="pEmail" type="email" placeholder="correo@proveedor.com" maxlength="160"/>
              </div>
              <div>
                <div class="label-text">Teléfono</div>
                <input class="input" id="pTelefono" placeholder="Ej: 55 1234 5678" maxlength="30"/>
              </div>
            </div>

            <!-- Condiciones comerciales -->
            <div style="border-top:1px solid var(--line);padding-top:14px;margin-top:4px">
              <div class="eyebrow" style="margin-bottom:8px">Condiciones comerciales</div>
              <div class="grid-2" style="gap:10px">
                <div>
                  <div class="label-text">Condición de pago</div>
                  <select class="select" id="pCondicion">
                    <option value="contado">Contado</option>
                    <option value="credito">Crédito</option>
                    <option value="anticipado">Anticipado</option>
                  </select>
                </div>
                <div>
                  <div class="label-text">Días de crédito</div>
                  <input class="input" id="pDiasCredito" type="number" min="0" step="1" placeholder="0"/>
                </div>
                <div>
                  <div class="label-text">Límite de crédito</div>
                  <input class="input" id="pLimiteCredito" type="number" min="0" step="0.01" placeholder="0.00"/>
                </div>
                <div>
                  <div class="label-text">Moneda del límite</div>
                  <select class="select" id="pMonedaLimite">
                    <option value="MXN">MXN — Peso mexicano</option>
                    <option value="USD">USD — Dólar</option>
                    <option value="EUR">EUR — Euro</option>
                  </select>
                </div>
                <div>
                  <div class="label-text">Anticipo (%)</div>
                  <input class="input" id="pAnticipoPct" type="number" min="0" max="100" step="0.01" placeholder="0"/>
                </div>
                <div>
                  <div class="label-text">Días de anticipo</div>
                  <input class="input" id="pDiasAnticipo" type="number" min="0" step="1" placeholder="0"/>
                </div>
                <div>
                  <div class="label-text">Referencia bancaria</div>
                  <input class="input" id="pRefBancaria" placeholder="Referencia / nota" maxlength="120"/>
                </div>
                <div>
                  <div class="label-text">Tipo de fecha</div>
                  <select class="select" id="pTipoFecha">
                    <option value="factura">Factura</option>
                    <option value="revision">Revisión</option>
                  </select>
                </div>
              </div>
            </div>

            <!-- Ventanas de revisión -->
            <div style="border-top:1px solid var(--line);padding-top:14px;margin-top:4px">
              <div class="eyebrow" style="margin-bottom:8px">Ventana de revisión de facturas</div>
              <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">${dayToggles('rev')}</div>
              <div class="grid-2" style="gap:10px">
                <div><div class="label-text">Hora inicio</div><input class="input" id="pRevIni" type="time"/></div>
                <div><div class="label-text">Hora fin</div><input class="input" id="pRevFin" type="time"/></div>
              </div>
            </div>

            <!-- Ventanas de cobro -->
            <div style="border-top:1px solid var(--line);padding-top:14px;margin-top:4px">
              <div class="eyebrow" style="margin-bottom:8px">Ventana de cobro / pago</div>
              <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">${dayToggles('cob')}</div>
              <div class="grid-2" style="gap:10px">
                <div><div class="label-text">Hora inicio</div><input class="input" id="pCobIni" type="time"/></div>
                <div><div class="label-text">Hora fin</div><input class="input" id="pCobFin" type="time"/></div>
              </div>
            </div>

            <!-- Avanzado -->
            <details style="border-top:1px solid var(--line);padding-top:14px;margin-top:4px">
              <summary style="cursor:pointer;font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)">Identificadores internos (opcional)</summary>
              <div class="grid-2" style="gap:10px;margin-top:12px">
                <div>
                  <div class="label-text">ID SAI</div>
                  <input class="input" id="pIdSai" placeholder="Identificador interno SAI" maxlength="80"/>
                </div>
                <div>
                  <div class="label-text">Identificador empresa</div>
                  <input class="input" id="pIdentEmpresa" placeholder="Identificador externo" maxlength="80"/>
                </div>
              </div>
            </details>

            <!-- Estado -->
            <div style="border-top:1px solid var(--line);padding-top:14px;margin-top:4px">
              <div class="label-text">Estado</div>
              <select class="select" id="pActivo" style="margin-top:4px">
                <option value="true">Activo</option>
                <option value="false">Inactivo</option>
              </select>
            </div>
          </div>
        </div>
        <!-- Footer -->
        <div style="padding:14px 20px;border-top:1px solid var(--line,#e2e8f0);display:flex;justify-content:flex-end;gap:8px;flex-shrink:0">
          <button class="btn ghost"   id="cancelModalBtn">Cancelar</button>
          <button class="btn primary" id="saveProvBtn">Guardar</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    return overlay;
  }

  const modal  = buildModal();
  const openM  = () => { modal.style.display = 'flex'; };
  const closeM = () => { modal.style.display = 'none'; };
  modal.addEventListener('click', e => { if (e.target === modal) closeM(); });
  document.getElementById('closeModalBtn').addEventListener('click', closeM);
  document.getElementById('cancelModalBtn').addEventListener('click', closeM);

  // ── Modal datos bancarios (solo lectura) ──────────────────────────────────
  const bancoOverlay = document.createElement('div');
  bancoOverlay.id = 'bancoModal';
  bancoOverlay.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(2,6,23,.5);z-index:10000;align-items:center;justify-content:center;padding:20px';
  bancoOverlay.innerHTML = `
    <div class="card" style="max-width:900px;width:96%;max-height:88vh;overflow:auto;margin:0">
      <div class="row">
        <div><div class="eyebrow">Información financiera</div><h2 id="bancoTitle">Datos bancarios</h2></div>
        <button class="btn" id="bancoClose">Cerrar</button>
      </div>
      <div id="bancoBody" style="margin-top:14px"></div>
    </div>`;
  document.body.appendChild(bancoOverlay);
  document.getElementById('bancoClose').onclick = () => { bancoOverlay.style.display = 'none'; };
  bancoOverlay.onclick = (e) => { if (e.target.id === 'bancoModal') bancoOverlay.style.display = 'none'; };

  // ── Estado ─────────────────────────────────────────────────────────────────
  const PAGE_SIZE = 50;
  let rows        = [];
  let currentPage = 1;

  const val  = id => document.getElementById(id)?.value?.trim() ?? '';
  const sel  = id => document.getElementById(id)?.value ?? '';
  const chk  = id => !!document.getElementById(id)?.checked;
  const setV = (id, v) => { const el = document.getElementById(id); if (el) el.value = v ?? ''; };
  const setC = (id, v) => { const el = document.getElementById(id); if (el) el.checked = !!v; };
  const num  = id => { const v = parseFloat(document.getElementById(id)?.value); return isNaN(v) ? null : v; };
  const int  = id => { const v = parseInt(document.getElementById(id)?.value, 10); return isNaN(v) ? null : v; };
  const hhmm = v => { const s = String(v || '').trim(); return s ? s.slice(0, 5) : ''; };
  const timeOut = id => { const v = val(id); return v ? v.slice(0, 5) : null; };
  const txtOut  = id => { const v = val(id); return v === '' ? null : v; };

  const mapName = r => r.nombre || r.nombre_proveedor || r.razon_social || '';

  const COND_LABEL = { contado: 'Contado', credito: 'Crédito', anticipado: 'Anticipado' };

  // ── Reset / Fill ───────────────────────────────────────────────────────────
  function reset() {
    setV('provId', ''); setV('pNombre', ''); setV('pRfc', ''); setV('pCveProv', '');
    setV('pEmail', ''); setV('pTelefono', '');
    setV('pCondicion', 'contado'); setV('pDiasCredito', ''); setV('pLimiteCredito', '');
    setV('pMonedaLimite', 'MXN'); setV('pAnticipoPct', ''); setV('pDiasAnticipo', '');
    setV('pRefBancaria', ''); setV('pTipoFecha', 'factura');
    DIAS.forEach(([k]) => { setC(`rev_${k}`, false); setC(`cob_${k}`, false); });
    setV('pRevIni', ''); setV('pRevFin', ''); setV('pCobIni', ''); setV('pCobFin', '');
    setV('pIdSai', ''); setV('pIdentEmpresa', ''); setV('pActivo', 'true');
    document.getElementById('formTitle').textContent = 'Nuevo proveedor';
    document.getElementById('modeChip').textContent  = 'Alta';
  }

  function fill(r) {
    setV('provId', r.proveedor_id); setV('pNombre', mapName(r));
    setV('pRfc', r.rfc || ''); setV('pCveProv', r.cve_prov || '');
    setV('pEmail', r.email_contacto || ''); setV('pTelefono', r.telefono || '');
    setV('pCondicion', r.condicion_pago || 'contado');
    setV('pDiasCredito', r.dias_credito ?? ''); setV('pLimiteCredito', r.limite_credito ?? '');
    setV('pMonedaLimite', r.moneda_limite || 'MXN');
    setV('pAnticipoPct', r.anticipo_pct ?? ''); setV('pDiasAnticipo', r.dias_anticipo ?? '');
    setV('pRefBancaria', r.ref_bancaria || ''); setV('pTipoFecha', r.tipo_fecha || 'factura');
    DIAS.forEach(([k]) => { setC(`rev_${k}`, r[`rev_${k}`]); setC(`cob_${k}`, r[`cob_${k}`]); });
    setV('pRevIni', hhmm(r.hora_revision_ini)); setV('pRevFin', hhmm(r.hora_revision_fin));
    setV('pCobIni', hhmm(r.hora_cobro_ini));    setV('pCobFin', hhmm(r.hora_cobro_fin));
    setV('pIdSai', r.id_sai || ''); setV('pIdentEmpresa', r.identificador_empresa || '');
    setV('pActivo', String(!!r.activo));
    document.getElementById('formTitle').textContent = 'Editar: ' + mapName(r);
    document.getElementById('modeChip').textContent  = 'Edición';
  }

  // ── Carga y render ─────────────────────────────────────────────────────────
  async function load(showToast = false) {
    const res = await KoguApi.apiFetch(BASE);
    rows = KoguApi.unwrapRows(res);
    currentPage = 1;
    render();
    if (showToast) KoguApi.toast('Proveedores actualizados por cambio de empresa', 'success');
  }

  function getFiltered() {
    const q  = val('q').toLowerCase();
    const cf = sel('condFil');
    const af = sel('activoFil');
    return rows.filter(r => {
      const text = `${mapName(r)} ${r.rfc || ''} ${r.cve_prov || ''}`.toLowerCase();
      return (!q  || text.includes(q))
          && (!cf || r.condicion_pago === cf)
          && (af === '' || String(!!r.activo) === af);
    });
  }

  function renderPagination(total) {
    const bar        = document.getElementById('pgBar');
    const totalPages = Math.ceil(total / PAGE_SIZE) || 1;
    const from       = total === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
    const to         = Math.min(currentPage * PAGE_SIZE, total);
    bar.innerHTML = `
      <span>${from}–${to} de ${total}</span>
      <div style="display:flex;gap:8px">
        <button class="btn" id="pgPrev" ${currentPage <= 1 ? 'disabled' : ''}>Anterior</button>
        <span style="padding:6px 10px;font-size:13px">${currentPage} / ${totalPages}</span>
        <button class="btn" id="pgNext" ${currentPage >= totalPages ? 'disabled' : ''}>Siguiente</button>
      </div>`;
    document.getElementById('pgPrev').onclick = () => { if (currentPage > 1)          { currentPage--; render(); } };
    document.getElementById('pgNext').onclick = () => { if (currentPage < totalPages) { currentPage++; render(); } };
  }

  function creditoCell(r) {
    if (r.condicion_pago !== 'credito') return '<span class="muted" style="font-size:11px">—</span>';
    const dias  = (r.dias_credito != null) ? `${r.dias_credito} días` : '';
    const lim   = (r.limite_credito != null && r.limite_credito !== '')
      ? `${KoguUi.money(r.limite_credito)} ${KoguUi.escapeHtml(r.moneda_limite || 'MXN')}` : '';
    const parts = [dias, lim].filter(Boolean);
    return parts.length ? KoguUi.escapeHtml(parts.join(' · ')) : '<span class="muted" style="font-size:11px">—</span>';
  }

  function render() {
    const filtered = getFiltered();
    const page     = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

    document.getElementById('rows').innerHTML = page.length
      ? page.map(r => `
          <tr>
            <td>${KoguUi.escapeHtml(mapName(r))}</td>
            <td>${r.rfc ? KoguUi.escapeHtml(r.rfc) : '<span class="muted" style="font-size:11px">—</span>'}</td>
            <td>${r.cve_prov
              ? `<strong style="font-family:monospace">${KoguUi.escapeHtml(r.cve_prov)}</strong>`
              : '<span class="muted" style="font-size:11px">— sin clave —</span>'}</td>
            <td><span class="badge neutral">${COND_LABEL[r.condicion_pago] || r.condicion_pago || '-'}</span></td>
            <td style="text-align:right;font-size:12px">${creditoCell(r)}</td>
            <td>${KoguUi.statusBadge(r.activo ? 'activo' : 'inactivo')}</td>
            <td style="white-space:nowrap;text-align:right">
              <button class="btn sm btn-edit"  data-id="${r.proveedor_id}" style="white-space:nowrap">Editar</button>
              <button class="btn sm btn-banco" data-id="${r.proveedor_id}" data-name="${KoguUi.escapeHtml(mapName(r))}" style="white-space:nowrap;margin-left:6px">Banco</button>
            </td>
          </tr>`).join('')
      : '<tr><td colspan="7" class="empty">Sin proveedores</td></tr>';

    document.querySelectorAll('.btn-edit').forEach(x => x.onclick = () => openEdit(x.dataset.id));
    document.querySelectorAll('.btn-banco').forEach(x => x.onclick = () => verBanco(x.dataset.id, x.dataset.name));
    renderPagination(filtered.length);
  }

  // ── Editar: carga el registro completo por id ──────────────────────────────
  async function openEdit(proveedorId) {
    reset();
    try {
      const res  = await KoguApi.apiFetch(`${BASE}/${proveedorId}`);
      const full = KoguApi.unwrapData(res) || rows.find(r => r.proveedor_id === proveedorId) || {};
      fill(full);
      openM();
    } catch (err) {
      KoguApi.toast(err.message || 'No se pudo cargar el proveedor', 'error');
    }
  }

  // ── Datos bancarios ────────────────────────────────────────────────────────
  async function verBanco(proveedorId, nombre) {
    document.getElementById('bancoTitle').textContent = 'Datos bancarios · ' + (nombre || '');
    document.getElementById('bancoBody').innerHTML = '<p class="muted">Cargando…</p>';
    bancoOverlay.style.display = 'flex';
    try {
      const res  = await KoguApi.apiFetch('/protected/prov/bancarios/' + proveedorId);
      const data = KoguApi.unwrapData(res) || {};
      const list = data.rows || [];
      const fdt = d => d ? new Date(d).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
      const fmtClabe = s => { const d = String(s || '').replace(/\D/g, ''); return d.length === 18 ? d.replace(/(.{6})(.{6})(.{6})/, '$1 $2 $3') : (s || '—'); };
      const field = (label, v) => `<div><div class="label-text" style="font-size:10px">${label}</div><div style="font-size:14px">${v}</div></div>`;
      document.getElementById('bancoBody').innerHTML = list.length
        ? list.map(cta => `
          <div style="border:1px solid var(--line,#e2e8f0);border-radius:12px;padding:14px 16px;margin-bottom:10px">
            <div style="display:flex;flex-wrap:wrap;gap:18px 28px;align-items:flex-start">
              ${field('Banco', KoguUi.escapeHtml(cta.banco_nombre || cta.banco_codigo || '—'))}
              ${field('CLABE', `<span style="font-family:monospace;white-space:nowrap;letter-spacing:.5px">${KoguUi.escapeHtml(cta.clabe ? fmtClabe(cta.clabe) : (cta.cuenta_15 || '—'))}</span>`)}
              ${field('Titular', KoguUi.escapeHtml(cta.titular || '—'))}
              ${field('Moneda', KoguUi.escapeHtml(cta.moneda || 'MXN'))}
              ${field('Estatus', `${KoguUi.statusBadge(cta.autorizacion_status || cta.cuenta_status || '-')}${cta.version > 1 ? ` <span class="muted" style="font-size:10px">v${cta.version}</span>` : ''}`)}
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:24px;margin-top:12px;padding-top:10px;border-top:1px dashed var(--line,#e2e8f0);font-size:12px;color:var(--muted,#64748b)">
              <div>📅 Capturado: <b style="color:#0f172a">${fdt(cta.created_at)}</b></div>
              <div>✅ Validó: ${cta.validado_por_nombre
                  ? `<b style="color:#0f172a">${KoguUi.escapeHtml(cta.validado_por_nombre)}</b> · ${fdt(cta.validado_at)}`
                  : '<span>— sin validar —</span>'}</div>
              ${cta.motivo ? `<div>📝 Motivo: ${KoguUi.escapeHtml(cta.motivo)}</div>` : ''}
            </div>
          </div>`).join('')
        : '<p class="muted">Este proveedor no tiene cuentas bancarias registradas.</p>';
    } catch (e) {
      document.getElementById('bancoBody').innerHTML = `<p style="color:#dc2626">${e.status === 403
        ? 'No tienes permiso para ver datos bancarios (prov_banco.ver).'
        : KoguUi.escapeHtml(e.message)}</p>`;
    }
  }

  // ── Guardar ────────────────────────────────────────────────────────────────
  document.getElementById('saveProvBtn').onclick = async (e) => {
    await KoguUi.withLoading(e.target, async () => {
      try {
        const id = val('provId');
        const payload = {
          nombre:                val('pNombre'),
          rfc:                   txtOut('pRfc') ? val('pRfc').toUpperCase() : null,
          cve_prov:              txtOut('pCveProv'),
          email_contacto:        txtOut('pEmail'),
          telefono:              txtOut('pTelefono'),
          condicion_pago:        sel('pCondicion'),
          dias_credito:          int('pDiasCredito'),
          limite_credito:        num('pLimiteCredito'),
          moneda_limite:         sel('pMonedaLimite'),
          anticipo_pct:          num('pAnticipoPct'),
          dias_anticipo:         int('pDiasAnticipo'),
          ref_bancaria:          txtOut('pRefBancaria'),
          tipo_fecha:            sel('pTipoFecha'),
          hora_revision_ini:     timeOut('pRevIni'),
          hora_revision_fin:     timeOut('pRevFin'),
          hora_cobro_ini:        timeOut('pCobIni'),
          hora_cobro_fin:        timeOut('pCobFin'),
          id_sai:                txtOut('pIdSai'),
          identificador_empresa: txtOut('pIdentEmpresa'),
          activo:                sel('pActivo') === 'true',
        };
        DIAS.forEach(([k]) => { payload[`rev_${k}`] = chk(`rev_${k}`); payload[`cob_${k}`] = chk(`cob_${k}`); });

        if (!payload.nombre) throw new Error('Nombre es obligatorio.');

        if (id) {
          await KoguApi.apiFetch(`${BASE}/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
          KoguApi.toast('Proveedor actualizado', 'success');
        } else {
          await KoguApi.apiFetch(BASE, { method: 'POST', body: JSON.stringify(payload) });
          KoguApi.toast('Proveedor creado', 'success');
        }
        closeM();
        reset();
        await load();
      } catch (err) { KoguApi.toast(err.message, 'error'); }
    }, 'Guardando...');
  };

  // ── Eventos ────────────────────────────────────────────────────────────────
  document.getElementById('newProvBtn').onclick = () => { reset(); openM(); };
  document.getElementById('refreshBtn').onclick = () => load(false);
  document.getElementById('q').oninput = () => { currentPage = 1; render(); };
  ['condFil', 'activoFil'].forEach(id =>
    document.getElementById(id).onchange = () => { currentPage = 1; render(); }
  );

  KoguShell.subscribeEmpresaActivaChange(async () => { reset(); await load(true); });

  await load(false);
});

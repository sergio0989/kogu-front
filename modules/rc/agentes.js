document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/rc/agentes.html';
  const BASE = '/protected/rc/agentes';
  const PERM = 'screen.ventas.agentes';

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Agentes Comerciales',
    description: 'Catálogo de agentes por empresa · Radar Comercial. Fuente de verdad de KOGU (independiente del ERP).',
    requiredPermission: PERM,
  });
  if (!b) return;

  const TIPO_AGENTE   = [['interno', 'Interno'], ['externo', 'Externo']];
  const TIPO_COMISION = [['importe_de_pago', 'Importe de pago'], ['espejo', 'Espejo'], ['por_kg_usd', 'Por kg (USD)']];
  const STATUS        = [['activo', 'Activo'], ['baja', 'Baja'], ['suspendido', 'Suspendido']];

  const c = document.getElementById('pageContent');
  c.innerHTML = `
<div class="split">

  <!-- ── Lista de agentes ── -->
  <div class="card">
    <div class="row">
      <div><div class="eyebrow">Catálogo</div><h2>Agentes comerciales</h2></div>
      <button class="btn primary" id="refreshBtn">Actualizar</button>
    </div>
    <div class="grid-2" style="margin-top:16px">
      <input class="input" id="q" placeholder="Buscar por clave o nombre" />
      <select class="select" id="statusFil">
        <option value="">Todos los estados</option>
        <option value="activo">Activos</option>
        <option value="baja">Bajas</option>
        <option value="suspendido">Suspendidos</option>
      </select>
    </div>
    <div class="grid-2" style="margin-top:8px">
      <select class="select" id="tipoFil">
        <option value="">Interno y externo</option>
        <option value="interno">Internos</option>
        <option value="externo">Externos</option>
      </select>
      <div style="display:flex;align-items:center;justify-content:flex-end;color:var(--muted);font-size:13px" id="counter"></div>
    </div>
    <div class="table-wrap" style="margin-top:16px">
      <table><thead><tr>
        <th>Cve</th><th>Nombre</th><th>Tipo</th><th>Comisión</th><th>Estado</th><th></th>
      </tr></thead><tbody id="rows"></tbody></table>
    </div>
  </div>

  <!-- ── Formulario agente ── -->
  <div class="card" id="rightPanel">
    <div class="row">
      <div><div class="eyebrow">Agente</div><h2 id="formTitle">Nuevo agente</h2></div>
      <span class="chip" id="formChip">Alta</span>
    </div>

    <div class="stack" style="margin-top:16px">
      <input type="hidden" id="agenteId" />
      <div class="grid-2" style="gap:12px">
        <div>
          <div class="label-text">Clave <span style="color:var(--danger)">*</span></div>
          <input class="input" id="fCve" type="number" min="1" placeholder="Ej: 15" />
        </div>
        <div>
          <div class="label-text">Estado</div>
          <select class="select" id="fStatus">${STATUS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>
        </div>
      </div>
      <div>
        <div class="label-text">Nombre <span style="color:var(--danger)">*</span></div>
        <input class="input" id="fNombre" placeholder="Nombre del agente" maxlength="160"/>
      </div>
      <div class="grid-2" style="gap:12px">
        <div>
          <div class="label-text">Puesto</div>
          <input class="input" id="fPuesto" placeholder="Ej: Gerente de cuenta" maxlength="120"/>
        </div>
        <div>
          <div class="label-text">Email</div>
          <input class="input" id="fEmail" type="email" placeholder="agente@empresa.com" maxlength="160"/>
        </div>
      </div>
      <div class="grid-2" style="gap:12px">
        <div>
          <div class="label-text">Tipo de agente</div>
          <select class="select" id="fTipoAgente">${TIPO_AGENTE.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>
        </div>
        <div>
          <div class="label-text">Tipo de comisión</div>
          <select class="select" id="fTipoComision">${TIPO_COMISION.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>
        </div>
      </div>
      <div class="grid-2" style="gap:12px">
        <div id="wrapImportePct">
          <div class="label-text">Comisión % importe</div>
          <input class="input" id="fComImporte" type="number" step="0.01" min="0" placeholder="Ej: 1 = 1%" />
        </div>
        <div id="wrapKgPct">
          <div class="label-text">Comisión % por kg</div>
          <input class="input" id="fComKg" type="number" step="0.01" min="0" placeholder="Ej: 3 = 3%" />
        </div>
      </div>
      <div class="grid-2" style="gap:12px">
        <div>
          <div class="label-text">Gerencia (scope)</div>
          <select class="select" id="fGerencia"><option value="">— Sin gerencia —</option></select>
        </div>
        <div id="wrapEspejo">
          <div class="label-text">Agente espejo</div>
          <select class="select" id="fEspejo"><option value="">— Ninguno —</option></select>
        </div>
      </div>
      <div class="grid-2" style="gap:12px">
        <div>
          <div class="label-text">Vigente desde</div>
          <input class="input" id="fVigDesde" type="date" />
        </div>
        <div>
          <div class="label-text">Vigente hasta</div>
          <input class="input" id="fVigHasta" type="date" />
        </div>
      </div>
      <div class="page-actions">
        <button class="btn primary" id="saveBtn">Guardar agente</button>
        <button class="btn" id="newBtn">Nuevo</button>
      </div>
    </div>

    <!-- ── Meta anual (presupuesto) — solo en edición ── -->
    <div id="metaSection" style="display:none; border-top:1px solid var(--line); margin-top:24px; padding-top:20px">
      <div class="row">
        <div><div class="eyebrow">Meta anual</div><h3 id="metaTitulo" style="margin:4px 0 0">Presupuesto</h3></div>
        <input class="input" id="metaAnio" type="number" min="2000" max="2100" style="max-width:110px" />
      </div>
      <div class="grid-2" style="gap:12px; margin-top:12px">
        <div>
          <div class="label-text">Meta importe (MXN)</div>
          <input class="input" id="metaMonto" type="text" inputmode="decimal" placeholder="0.00" style="text-align:right" />
        </div>
        <div>
          <div class="label-text">Meta cantidad</div>
          <input class="input" id="metaCantidad" type="number" step="0.0001" min="0" placeholder="0" />
        </div>
      </div>
      <div style="margin-top:8px">
        <div class="label-text">Notas</div>
        <input class="input" id="metaNotas" placeholder="Opcional" maxlength="300"/>
      </div>
      <div class="page-actions" style="margin-top:12px">
        <button class="btn primary" id="saveMetaBtn">Guardar meta</button>
      </div>
    </div>
  </div>

</div>`;

  // ── Estado ────────────────────────────────────────────────────────────────
  let agentes = [];

  // ── Helpers ───────────────────────────────────────────────────────────────
  const val  = id => document.getElementById(id)?.value?.trim() ?? '';
  const sel  = id => document.getElementById(id)?.value ?? '';
  const setV = (id, v) => { const el = document.getElementById(id); if (el) el.value = v ?? ''; };
  const show = (id, v) => { const el = document.getElementById(id); if (el) el.style.display = v ? '' : 'none'; };

  const tipoComisionLabel = v => (TIPO_COMISION.find(([k]) => k === v) || [, v])[1];
  // Backend guarda fracción (0.01 = 1%); la UI trabaja en porcentaje.
  const fracToPct = f => (f === null || f === undefined || f === '') ? '' : String(+(Number(f) * 100).toFixed(4));
  const pctToFrac = p => (p === '' || p === null || p === undefined) ? null : Number(p) / 100;

  // Importe: número plano para guardar, agrupado con miles para mostrar.
  const parseMoney = s => {
    if (s === '' || s === null || s === undefined) return null;
    const n = Number(String(s).replace(/[^0-9.\-]/g, ''));
    return Number.isNaN(n) ? null : n;
  };
  const fmtMoneyInput = n =>
    (n === null || n === '' || n === undefined)
      ? ''
      : new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n));

  function comisionResumen(r) {
    if (r.tipo_comision === 'por_kg_usd') {
      return r.comision_kg_pct != null ? `${fracToPct(r.comision_kg_pct)}% / kg` : '—';
    }
    return r.comision_importe_pct != null ? `${fracToPct(r.comision_importe_pct)}% imp.` : '—';
  }

  // Muestra/oculta campos según tipo de comisión.
  function syncComisionVisibility() {
    const t = sel('fTipoComision');
    show('wrapKgPct', t === 'por_kg_usd');
    show('wrapImportePct', t !== 'por_kg_usd');
    show('wrapEspejo', t === 'espejo');
  }

  // ── Carga / render ──────────────────────────────────────────────────────
  async function loadAgentes(showToast = false) {
    const res = await KoguApi.apiFetch(BASE);
    agentes = KoguApi.unwrapRows(res);
    renderRows();
    fillRefSelects();
    if (showToast) KoguApi.toast('Agentes actualizados', 'success');
  }

  function renderRows() {
    const q  = val('q').toLowerCase();
    const sf = sel('statusFil');
    const tf = sel('tipoFil');
    const filtered = agentes.filter(r => {
      const txt = `${r.cve_agente} ${r.nombre}`.toLowerCase();
      const okQ = !q || txt.includes(q);
      const okS = !sf || r.status === sf;
      const okT = !tf || r.tipo_agente === tf;
      return okQ && okS && okT;
    });
    document.getElementById('counter').textContent =
      `${filtered.length} de ${agentes.length} agente(s)`;
    document.getElementById('rows').innerHTML = filtered.length
      ? filtered.map(r => `
          <tr>
            <td><span class="chip-compact">${KoguUi.escapeHtml(String(r.cve_agente))}</span></td>
            <td>${KoguUi.escapeHtml(r.nombre)}${r.tipo_agente === 'externo' ? ' <span class="badge neutral">ext</span>' : ''}</td>
            <td>${KoguUi.escapeHtml(tipoComisionLabel(r.tipo_comision))}</td>
            <td>${KoguUi.escapeHtml(comisionResumen(r))}</td>
            <td>${KoguUi.statusBadge(r.status)}</td>
            <td><button class="btn btn-edit" data-id="${r.agente_id}">Editar</button></td>
          </tr>`).join('')
      : '<tr><td colspan="6" class="empty">Sin agentes para el filtro</td></tr>';
    document.querySelectorAll('#rows .btn-edit').forEach(x => x.onclick = () => {
      const row = agentes.find(r => r.agente_id === x.dataset.id);
      if (row) fillForm(row);
    });
  }

  // Pobla los selects de gerencia / espejo con los agentes (excluye el actual).
  function fillRefSelects() {
    const selfId = val('agenteId');
    const opts = agentes
      .filter(a => a.agente_id !== selfId)
      .map(a => `<option value="${a.agente_id}">${KoguUi.escapeHtml(`${a.cve_agente} · ${a.nombre}`)}</option>`)
      .join('');
    const ger = document.getElementById('fGerencia');
    const esp = document.getElementById('fEspejo');
    const gerVal = ger.value, espVal = esp.value;
    ger.innerHTML = '<option value="">— Sin gerencia —</option>' + opts;
    esp.innerHTML = '<option value="">— Ninguno —</option>' + opts;
    ger.value = gerVal; esp.value = espVal;
  }

  // ── Formulario ────────────────────────────────────────────────────────────
  function resetForm() {
    ['agenteId', 'fCve', 'fNombre', 'fPuesto', 'fEmail', 'fComImporte', 'fComKg', 'fVigDesde', 'fVigHasta']
      .forEach(id => setV(id, ''));
    setV('fStatus', 'activo');
    setV('fTipoAgente', 'interno');
    setV('fTipoComision', 'importe_de_pago');
    setV('fGerencia', ''); setV('fEspejo', '');
    document.getElementById('formTitle').textContent = 'Nuevo agente';
    document.getElementById('formChip').textContent  = 'Alta';
    show('metaSection', false);
    syncComisionVisibility();
  }

  function fillForm(r) {
    setV('agenteId', r.agente_id);
    setV('fCve', r.cve_agente);
    setV('fNombre', r.nombre);
    setV('fPuesto', r.puesto || '');
    setV('fEmail', r.email || '');
    setV('fStatus', r.status || 'activo');
    setV('fTipoAgente', r.tipo_agente || 'interno');
    setV('fTipoComision', r.tipo_comision || 'importe_de_pago');
    setV('fComImporte', fracToPct(r.comision_importe_pct));
    setV('fComKg', fracToPct(r.comision_kg_pct));
    setV('fVigDesde', r.vigente_desde ? String(r.vigente_desde).slice(0, 10) : '');
    setV('fVigHasta', r.vigente_hasta ? String(r.vigente_hasta).slice(0, 10) : '');
    fillRefSelects();
    setV('fGerencia', r.gerencia_id || '');
    setV('fEspejo', r.agente_espejo_id || '');
    document.getElementById('formTitle').textContent = `Editar: ${r.nombre}`;
    document.getElementById('formChip').textContent  = 'Edición';
    syncComisionVisibility();
    // Meta anual
    show('metaSection', true);
    document.getElementById('metaTitulo').textContent = `Presupuesto · ${r.nombre}`;
    setV('metaAnio', new Date().getFullYear());
    loadMeta(r.agente_id, new Date().getFullYear());
  }

  function buildPayload() {
    const tipoCom = sel('fTipoComision');
    const payload = {
      cve_agente:   Number(val('fCve')),
      nombre:       val('fNombre'),
      puesto:       val('fPuesto') || null,
      email:        val('fEmail') || null,
      tipo_agente:  sel('fTipoAgente'),
      tipo_comision: tipoCom,
      comision_importe_pct: tipoCom === 'por_kg_usd' ? null : pctToFrac(val('fComImporte')),
      comision_kg_pct:      tipoCom === 'por_kg_usd' ? pctToFrac(val('fComKg')) : null,
      gerencia_id:       sel('fGerencia') || null,
      agente_espejo_id:  tipoCom === 'espejo' ? (sel('fEspejo') || null) : null,
      vigente_desde: val('fVigDesde') || null,
      vigente_hasta: val('fVigHasta') || null,
    };
    if (!payload.cve_agente || payload.cve_agente <= 0) throw new Error('Clave es obligatoria (entero positivo).');
    if (!payload.nombre) throw new Error('Nombre es obligatorio.');
    return payload;
  }

  document.getElementById('saveBtn').onclick = async (e) => {
    await KoguUi.withLoading(e.target, async () => {
      try {
        const id      = val('agenteId');
        const payload = buildPayload();
        const status  = sel('fStatus');
        if (id) {
          await KoguApi.apiFetch(`${BASE}/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
          await KoguApi.apiFetch(`${BASE}/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) });
          KoguApi.toast('Agente actualizado', 'success');
          await loadAgentes();
        } else {
          const res = await KoguApi.apiFetch(BASE, { method: 'POST', body: JSON.stringify(payload) });
          const created = res?.data || res;
          if (created?.agente_id && status !== 'activo') {
            await KoguApi.apiFetch(`${BASE}/${created.agente_id}/status`, { method: 'PUT', body: JSON.stringify({ status }) });
          }
          KoguApi.toast('Agente creado', 'success');
          await loadAgentes();
          if (created?.agente_id) {
            const fresh = agentes.find(a => a.agente_id === created.agente_id);
            if (fresh) fillForm(fresh);
          }
        }
      } catch (err) { KoguApi.toast(err.message, 'error'); }
    }, 'Guardando...');
  };

  // ── Meta anual ──────────────────────────────────────────────────────────
  async function loadMeta(agenteId, anio) {
    try {
      const res  = await KoguApi.apiFetch(`${BASE}/${agenteId}/presupuesto?anio=${anio}`);
      const rows = KoguApi.unwrapRows(res);
      const m    = rows[0];
      setV('metaMonto',    fmtMoneyInput(m?.monto_objetivo));
      setV('metaCantidad', m?.cantidad_objetivo ?? '');
      setV('metaNotas',    m?.notas ?? '');
    } catch (_) { /* sin meta aún */ }
  }

  document.getElementById('metaAnio').onchange = () => {
    const id = val('agenteId');
    if (id) loadMeta(id, Number(sel('metaAnio')) || new Date().getFullYear());
  };

  // Importe: al enfocar muestra número plano (editable); al salir, agrupa miles.
  const metaMontoEl = document.getElementById('metaMonto');
  metaMontoEl.onfocus = () => { const n = parseMoney(metaMontoEl.value); metaMontoEl.value = (n === null ? '' : String(n)); };
  metaMontoEl.onblur  = () => { metaMontoEl.value = fmtMoneyInput(parseMoney(metaMontoEl.value)); };

  document.getElementById('saveMetaBtn').onclick = async (e) => {
    await KoguUi.withLoading(e.target, async () => {
      try {
        const id = val('agenteId');
        if (!id) throw new Error('Selecciona un agente primero.');
        const anio = Number(sel('metaAnio'));
        if (!anio) throw new Error('Año es obligatorio.');
        const payload = {
          anio,
          monto_objetivo:    parseMoney(val('metaMonto')),
          cantidad_objetivo: val('metaCantidad') || null,
          notas:             val('metaNotas') || null,
        };
        if (payload.monto_objetivo == null && payload.cantidad_objetivo == null) {
          throw new Error('Captura meta de importe o cantidad.');
        }
        await KoguApi.apiFetch(`${BASE}/${id}/presupuesto`, { method: 'PUT', body: JSON.stringify(payload) });
        KoguApi.toast('Meta guardada', 'success');
      } catch (err) { KoguApi.toast(err.message, 'error'); }
    }, 'Guardando...');
  };

  // ── Eventos globales ────────────────────────────────────────────────────
  document.getElementById('refreshBtn').onclick     = () => loadAgentes(false);
  document.getElementById('newBtn').onclick          = resetForm;
  document.getElementById('q').oninput               = renderRows;
  document.getElementById('statusFil').onchange      = renderRows;
  document.getElementById('tipoFil').onchange        = renderRows;
  document.getElementById('fTipoComision').onchange  = syncComisionVisibility;

  KoguShell.subscribeEmpresaActivaChange(async () => { resetForm(); await loadAgentes(true); });

  resetForm();
  await loadAgentes();
});

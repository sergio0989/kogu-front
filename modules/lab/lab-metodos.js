// ============================================================
// lab-metodos.js
// CRUD de Métodos analíticos (lab_metodos).
// Incluye: i18n (lab_metodos_i18n) + pivote a parámetros
// (lab_metodo_parametros con flag es_predeterminado).
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/lab/lab-metodos.html';
  const BASE = '/protected/lab/maestros/metodos';
  const PERM = 'screen.lab.maestros';

  const ORIGENES = [
    { code: 'iso',      label: 'ISO' },
    { code: 'aoac',     label: 'AOAC' },
    { code: 'nom',      label: 'NOM' },
    { code: 'interno',  label: 'Interno' },
    { code: 'otro',     label: 'Otro' },
  ];
  const STATUS = [
    { code: 'activo',    label: 'Activo',    color: '#16a34a' },
    { code: 'inactivo',  label: 'Inactivo',  color: '#94a3b8' },
    { code: 'obsoleto',  label: 'Obsoleto',  color: '#dc2626' },
  ];
  const IDIOMAS = [
    { code: 'es', label: 'Español' },
    { code: 'en', label: 'English' },
    { code: 'pt', label: 'Português' },
    { code: 'fr', label: 'Français' },
    { code: 'de', label: 'Deutsch' },
    { code: 'it', label: 'Italiano' },
  ];

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Métodos analíticos',
    description: 'Procedimientos analíticos (ISO/AOAC/NOM/internos) que se aplican a los parámetros del laboratorio.',
    requiredPermission: PERM,
  });
  if (!b) return;

  // ── Estado ────────────────────────────────────────────
  let rows = [];
  let parametros = [];     // catálogo para el pivote
  let currentPage = 1;
  let pageSize    = 25;
  let totalPages  = 1;
  let totalRows   = 0;
  let editing     = null;

  const $ = (id) => document.getElementById(id);

  async function loadParametros() {
    try {
      const res = await KoguApi.apiFetch('/protected/lab/maestros/parametros?status=activo&pageSize=500');
      parametros = KoguApi.unwrapData(res) || [];
    } catch (err) {
      console.warn('No se pudieron cargar parámetros:', err.message);
      parametros = [];
    }
  }

  // ── Render shell ──────────────────────────────────────
  const c = document.getElementById('pageContent');
  c.innerHTML = `
<!-- Tabs de maestros -->
<div style="display:flex;gap:4px;border-bottom:1px solid var(--line);margin-bottom:16px">
  <a href="/modules/lab/lab-maestros.html"
     style="padding:10px 16px;font-size:14px;color:#64748b;border-bottom:3px solid transparent;text-decoration:none">
    Parámetros
  </a>
  <a href="/modules/lab/lab-metodos.html"
     style="padding:10px 16px;font-size:14px;color:#0f172a;font-weight:600;border-bottom:3px solid #0f172a;text-decoration:none">
    Métodos
  </a>
  <span style="padding:10px 16px;font-size:14px;color:#cbd5e1;border-bottom:3px solid transparent" title="Próximamente">
    Equipos
  </span>
  <span style="padding:10px 16px;font-size:14px;color:#cbd5e1;border-bottom:3px solid transparent" title="Próximamente">
    Reactivos
  </span>
</div>

<div class="card">
  <div class="row">
    <div>
      <div class="eyebrow">Lab QA</div>
      <h2>Métodos analíticos</h2>
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn ghost"   id="refreshBtn">Actualizar</button>
      <button class="btn primary" id="newMetodoBtn">+ Nuevo método</button>
    </div>
  </div>

  <div class="grid-2" style="margin-top:14px;gap:10px">
    <input class="input" id="qFil" placeholder="Buscar por clave, nombre, referencia o descripción…"/>
    <select class="select" id="origenFil">
      <option value="">Cualquier origen</option>
      ${ORIGENES.map(o => `<option value="${o.code}">${o.label}</option>`).join('')}
    </select>
    <select class="select" id="statusFil">
      <option value="activo" selected>Solo activos</option>
      <option value="">Cualquier estado</option>
      <option value="inactivo">Inactivos</option>
      <option value="obsoleto">Obsoletos</option>
    </select>
  </div>

  <div class="table-wrap" style="margin-top:14px">
    <table>
      <thead><tr>
        <th>Clave</th>
        <th>Nombre</th>
        <th>Origen / Ref.</th>
        <th>Tiempo</th>
        <th>Parámetros</th>
        <th>Estado</th>
        <th style="text-align:right">Acciones</th>
      </tr></thead>
      <tbody id="rows"></tbody>
    </table>
  </div>

  <div id="pgBar" style="display:flex;align-items:center;justify-content:space-between;margin-top:14px;flex-wrap:wrap;gap:10px;font-size:13px;color:var(--muted)">
    <div id="pgInfo">—</div>
    <div style="display:flex;align-items:center;gap:6px">
      <span>Por página:</span>
      <select class="select" id="pgSize" style="width:80px">
        <option value="10">10</option>
        <option value="25" selected>25</option>
        <option value="50">50</option>
        <option value="100">100</option>
      </select>
      <button class="btn ghost" id="pgFirst">«</button>
      <button class="btn ghost" id="pgPrev">‹</button>
      <span id="pgNumeros" style="display:flex;gap:4px"></span>
      <button class="btn ghost" id="pgNext">›</button>
      <button class="btn ghost" id="pgLast">»</button>
    </div>
  </div>
</div>
  `;

  // ── Load lista ────────────────────────────────────────
  async function load({ showToast = false, resetPage = false } = {}) {
    if (resetPage) currentPage = 1;
    const params = new URLSearchParams();
    params.set('page',     String(currentPage));
    params.set('pageSize', String(pageSize));
    const q = $('qFil').value.trim();
    const origen = $('origenFil').value;
    const status = $('statusFil').value;
    if (q)      params.set('q', q);
    if (origen) params.set('origen', origen);
    if (status) params.set('status', status);

    try {
      const res = await KoguApi.apiFetch(`${BASE}?${params.toString()}`);
      rows = KoguApi.unwrapData(res) || [];
      const meta = res?.meta || {};
      totalRows   = parseInt(meta.total ?? rows.length, 10) || 0;
      pageSize    = parseInt(meta.pageSize ?? pageSize, 10) || pageSize;
      currentPage = parseInt(meta.page ?? currentPage, 10) || 1;
      totalPages  = parseInt(meta.totalPages ?? 1, 10) || 1;
      renderRows();
      renderPaginacion();
      if (showToast) KoguApi.toast('Métodos actualizados', 'success');
    } catch (err) { KoguApi.toast(err.message, 'error'); }
  }

  function renderRows() {
    const tbody = $('rows');
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--muted)">
        Sin métodos con los filtros actuales. Click en <strong>+ Nuevo método</strong> para crear el primero.
      </td></tr>`;
      return;
    }
    tbody.innerHTML = rows.map(m => {
      const st = STATUS.find(s => s.code === m.status) || { label: m.status, color: '#64748b' };
      const origenLabel = ORIGENES.find(o => o.code === m.origen)?.label || m.origen;
      return `
        <tr>
          <td><strong>${escapeHtml(m.clave)}</strong></td>
          <td>${escapeHtml(m.nombre)}
            ${m.descripcion ? `<div class="muted" style="font-size:12px">${escapeHtml(truncar(m.descripcion, 80))}</div>` : ''}
          </td>
          <td>${escapeHtml(origenLabel)}
            ${m.referencia ? `<div class="muted" style="font-size:12px">${escapeHtml(m.referencia)}</div>` : ''}
          </td>
          <td>${m.tiempo_estimado_min ? m.tiempo_estimado_min + ' min' : '—'}</td>
          <td>${m.parametros_count > 0 ? `<span class="chip" style="background:#e0f2fe;color:#075985">${m.parametros_count}</span>` : '—'}</td>
          <td><span class="chip" style="background:${st.color}22;color:${st.color}">${st.label}</span></td>
          <td style="text-align:right;white-space:nowrap">
            <button class="btn ghost" data-edit="${m.metodo_id}">Editar</button>
            ${m.status === 'activo' ? `<button class="btn ghost danger" data-delete="${m.metodo_id}">Desactivar</button>` : ''}
          </td>
        </tr>`;
    }).join('');

    tbody.querySelectorAll('button[data-edit]').forEach(btn => {
      btn.addEventListener('click', () => abrirEditor(btn.dataset.edit));
    });
    tbody.querySelectorAll('button[data-delete]').forEach(btn => {
      btn.addEventListener('click', () => confirmarBaja(btn.dataset.delete));
    });
  }

  function renderPaginacion() {
    const inicio = totalRows === 0 ? 0 : (currentPage - 1) * pageSize + 1;
    const fin    = Math.min(currentPage * pageSize, totalRows);
    $('pgInfo').textContent = totalRows ? `Mostrando ${inicio}–${fin} de ${totalRows}` : 'Sin resultados';
    $('pgFirst').disabled = currentPage <= 1;
    $('pgPrev').disabled  = currentPage <= 1;
    $('pgNext').disabled  = currentPage >= totalPages;
    $('pgLast').disabled  = currentPage >= totalPages;

    const ventana = 2;
    let from = Math.max(1, currentPage - ventana);
    let to   = Math.min(totalPages, currentPage + ventana);
    if (currentPage <= 3) to = Math.min(totalPages, 5);
    if (currentPage >= totalPages - 2) from = Math.max(1, totalPages - 4);

    const nums = $('pgNumeros'); nums.innerHTML = '';
    if (from > 1) {
      nums.appendChild(makePgBtn(1));
      if (from > 2) { const d = document.createElement('span'); d.textContent = '…'; d.style.padding = '0 6px'; nums.appendChild(d); }
    }
    for (let i = from; i <= to; i++) nums.appendChild(makePgBtn(i));
    if (to < totalPages) {
      if (to < totalPages - 1) { const d = document.createElement('span'); d.textContent = '…'; d.style.padding = '0 6px'; nums.appendChild(d); }
      nums.appendChild(makePgBtn(totalPages));
    }
  }
  function makePgBtn(num) {
    const b = document.createElement('button');
    b.className = 'btn ghost';
    b.textContent = String(num);
    if (num === currentPage) { b.classList.add('primary'); b.classList.remove('ghost'); }
    b.addEventListener('click', () => { if (num !== currentPage) { currentPage = num; load(); } });
    return b;
  }

  // ── Modal de edición ──────────────────────────────────
  async function abrirEditor(metodoId = null) {
    editing = null;
    if (metodoId) {
      try {
        const res = await KoguApi.apiFetch(`${BASE}/${metodoId}`);
        editing = KoguApi.unwrapData(res);
      } catch (err) { return KoguApi.toast(err.message, 'error'); }
    }
    renderModal();
  }

  function renderModal() {
    const isEdit = !!editing;
    const e = editing || {
      clave: '', nombre: '', descripcion: '',
      origen: 'interno', referencia: '', version: '1.0',
      vigente_desde: new Date().toISOString().slice(0, 10),
      vigente_hasta: '',
      tiempo_estimado_min: '',
      status: 'activo',
      parametros: [],
      traducciones: [],
    };

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;overflow:auto';
    overlay.innerHTML = `
      <div style="background:white;border-radius:8px;max-width:820px;width:100%;max-height:95vh;overflow:auto;padding:24px;box-shadow:0 25px 50px rgba(0,0,0,.3)">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px">
          <div>
            <div class="eyebrow">Lab QA</div>
            <h2 style="margin:6px 0 0 0">${isEdit ? 'Editar método' : 'Nuevo método'}</h2>
          </div>
          <button class="btn ghost" id="closeBtn">×</button>
        </div>

        <!-- Sub-tabs del modal -->
        <div style="display:flex;gap:4px;border-bottom:1px solid var(--line);margin-bottom:14px">
          <button data-modaltab="datos"  class="modal-tab" style="border:0;background:transparent;padding:8px 14px;font-size:13px;cursor:pointer;border-bottom:3px solid #0f172a;color:#0f172a;font-weight:600">Datos básicos</button>
          <button data-modaltab="params" class="modal-tab" style="border:0;background:transparent;padding:8px 14px;font-size:13px;cursor:pointer;border-bottom:3px solid transparent;color:#64748b">Parámetros (${(e.parametros || []).length})</button>
          <button data-modaltab="i18n"   class="modal-tab" style="border:0;background:transparent;padding:8px 14px;font-size:13px;cursor:pointer;border-bottom:3px solid transparent;color:#64748b">Traducciones (${(e.traducciones || []).length})</button>
        </div>

        <!-- Tab: Datos básicos -->
        <div data-tabpanel="datos">
          <div class="grid-2" style="gap:10px">
            <div><div class="label-text">Clave *</div>
              <input class="input" id="f_clave" maxlength="30" value="${escapeAttr(e.clave)}" placeholder="ej. GRV-HUM"/>
            </div>
            <div><div class="label-text">Estado</div>
              <select class="select" id="f_status">
                ${STATUS.map(s => `<option value="${s.code}" ${e.status === s.code ? 'selected' : ''}>${s.label}</option>`).join('')}
              </select>
            </div>
            <div style="grid-column:1/-1"><div class="label-text">Nombre *</div>
              <input class="input" id="f_nombre" maxlength="200" value="${escapeAttr(e.nombre)}" placeholder="Nombre del método"/>
            </div>
            <div style="grid-column:1/-1"><div class="label-text">Descripción</div>
              <textarea class="input" id="f_descripcion" rows="2" maxlength="1000" placeholder="Descripción breve del procedimiento">${escapeHtml(e.descripcion || '')}</textarea>
            </div>
            <div><div class="label-text">Origen</div>
              <select class="select" id="f_origen">
                ${ORIGENES.map(o => `<option value="${o.code}" ${e.origen === o.code ? 'selected' : ''}>${o.label}</option>`).join('')}
              </select>
            </div>
            <div><div class="label-text">Referencia</div>
              <input class="input" id="f_referencia" maxlength="100" value="${escapeAttr(e.referencia || '')}" placeholder="ej. AOAC 925.10"/>
            </div>
            <div><div class="label-text">Versión</div>
              <input class="input" id="f_version" maxlength="20" value="${escapeAttr(e.version || '1.0')}"/>
            </div>
            <div><div class="label-text">Tiempo estimado (min)</div>
              <input class="input" type="number" min="0" step="1" id="f_tiempo" value="${e.tiempo_estimado_min ?? ''}"/>
            </div>
            <div><div class="label-text">Vigente desde</div>
              <input class="input" type="date" id="f_desde" value="${escapeAttr(e.vigente_desde || '')}"/>
            </div>
            <div><div class="label-text">Vigente hasta</div>
              <input class="input" type="date" id="f_hasta" value="${escapeAttr(e.vigente_hasta || '')}" placeholder="Indefinido"/>
            </div>
          </div>
        </div>

        <!-- Tab: Parámetros vinculados -->
        <div data-tabpanel="params" style="display:none">
          <div class="muted" style="font-size:13px;margin-bottom:8px">
            Selecciona los parámetros que se miden con este método. Marca uno como <strong>predeterminado</strong>
            si el sistema debe sugerirlo por defecto en captura de resultados.
          </div>
          <div id="paramsList" style="display:flex;flex-direction:column;gap:6px"></div>
          ${parametros.length === 0
            ? '<div class="muted" style="text-align:center;padding:20px">No hay parámetros activos. Crea parámetros primero.</div>'
            : ''}
        </div>

        <!-- Tab: Traducciones -->
        <div data-tabpanel="i18n" style="display:none">
          <div class="muted" style="font-size:13px;margin-bottom:8px">
            Nombre y referencia del método en otros idiomas — se usan al emitir COA bilingüe.
            ES es el idioma base (no se edita aquí).
          </div>
          <div id="i18nList" style="display:flex;flex-direction:column;gap:10px"></div>
        </div>

        <div style="margin-top:20px;display:flex;gap:8px;justify-content:flex-end">
          <button class="btn ghost"   id="cancelBtn">Cancelar</button>
          <button class="btn primary" id="saveBtn">${isEdit ? 'Guardar cambios' : 'Crear método'}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const oQ = (s) => overlay.querySelector(s);
    const close = () => overlay.remove();
    overlay.addEventListener('click', ev => { if (ev.target === overlay) close(); });
    oQ('#closeBtn').addEventListener('click', close);
    oQ('#cancelBtn').addEventListener('click', close);

    // Sub-tabs
    overlay.querySelectorAll('.modal-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.modaltab;
        overlay.querySelectorAll('.modal-tab').forEach(b => {
          const active = b.dataset.modaltab === tab;
          b.style.borderBottom = active ? '3px solid #0f172a' : '3px solid transparent';
          b.style.color        = active ? '#0f172a' : '#64748b';
          b.style.fontWeight   = active ? '600' : '400';
        });
        overlay.querySelectorAll('[data-tabpanel]').forEach(panel => {
          panel.style.display = panel.dataset.tabpanel === tab ? 'block' : 'none';
        });
      });
    });

    // Render parametros vinculados
    const seleccion = new Map();
    (e.parametros || []).forEach(v => {
      seleccion.set(v.parametro_id, {
        parametro_id: v.parametro_id,
        es_predeterminado: !!v.es_predeterminado,
        observaciones: v.observaciones || '',
      });
    });
    function renderParamsList() {
      const list = oQ('#paramsList');
      list.innerHTML = parametros.map(p => {
        const sel = seleccion.get(p.parametro_id);
        const checked = sel ? 'checked' : '';
        const pre     = sel?.es_predeterminado ? 'checked' : '';
        return `
          <div style="display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid var(--line);border-radius:6px;background:${sel ? '#f8fafc' : 'white'}">
            <input type="checkbox" data-pid="${p.parametro_id}" ${checked}/>
            <div style="flex:1">
              <strong>${escapeHtml(p.clave)}</strong> · <span style="font-size:13px">${escapeHtml(p.nombre)}</span>
              <div class="muted" style="font-size:11px">${escapeHtml(p.tipo_parametro || '')}</div>
            </div>
            <label style="display:flex;align-items:center;gap:4px;font-size:12px;color:#475569${sel ? '' : ';opacity:.4;pointer-events:none'}">
              <input type="checkbox" data-pre="${p.parametro_id}" ${pre}/> predeterminado
            </label>
          </div>`;
      }).join('');
      list.querySelectorAll('input[data-pid]').forEach(cb => {
        cb.addEventListener('change', e => {
          const pid = e.target.dataset.pid;
          if (e.target.checked) {
            seleccion.set(pid, { parametro_id: pid, es_predeterminado: false, observaciones: '' });
          } else {
            seleccion.delete(pid);
          }
          renderParamsList(); // redibuja para activar/desactivar 'predeterminado'
        });
      });
      list.querySelectorAll('input[data-pre]').forEach(cb => {
        cb.addEventListener('change', e => {
          const pid = e.target.dataset.pre;
          const v = seleccion.get(pid);
          if (v) { v.es_predeterminado = e.target.checked; seleccion.set(pid, v); }
        });
      });
    }
    renderParamsList();

    // i18n
    function renderI18n() {
      const list = oQ('#i18nList');
      const idiomasNoEs = IDIOMAS.filter(i => i.code !== 'es');
      const trMap = new Map((e.traducciones || []).map(t => [t.idioma, t]));
      list.innerHTML = idiomasNoEs.map(i => {
        const tr = trMap.get(i.code) || {};
        return `
          <fieldset style="border:1px solid var(--line);border-radius:6px;padding:10px">
            <legend style="padding:0 6px;font-size:12px;color:#64748b">${escapeHtml(i.label)} (${i.code})</legend>
            <div class="grid-2" style="gap:6px">
              <div><div class="label-text">Nombre</div>
                <input class="input" data-i18n-nombre="${i.code}" value="${escapeAttr(tr.nombre || '')}" placeholder="(vacío para no traducir)"/>
              </div>
              <div><div class="label-text">Referencia</div>
                <input class="input" data-i18n-ref="${i.code}" value="${escapeAttr(tr.referencia || '')}"/>
              </div>
              <div style="grid-column:1/-1"><div class="label-text">Descripción</div>
                <textarea class="input" rows="2" data-i18n-desc="${i.code}">${escapeHtml(tr.descripcion || '')}</textarea>
              </div>
            </div>
          </fieldset>`;
      }).join('');
    }
    renderI18n();

    // Save
    oQ('#saveBtn').addEventListener('click', async () => {
      const body = {
        clave:               oQ('#f_clave').value.trim(),
        nombre:              oQ('#f_nombre').value.trim(),
        descripcion:         oQ('#f_descripcion').value.trim() || null,
        origen:              oQ('#f_origen').value,
        referencia:          oQ('#f_referencia').value.trim() || null,
        version:             oQ('#f_version').value.trim() || '1.0',
        tiempo_estimado_min: oQ('#f_tiempo').value ? parseInt(oQ('#f_tiempo').value, 10) : null,
        vigente_desde:       oQ('#f_desde').value || null,
        vigente_hasta:       oQ('#f_hasta').value || null,
        status:              oQ('#f_status').value,
        parametros:          Array.from(seleccion.values()),
      };
      if (!body.clave)  return KoguApi.toast('Clave es obligatoria.', 'error');
      if (!body.nombre) return KoguApi.toast('Nombre es obligatorio.', 'error');

      try {
        oQ('#saveBtn').disabled = true;
        let metodoId;
        if (isEdit) {
          const res = await KoguApi.apiFetch(`${BASE}/${editing.metodo_id}`, {
            method: 'PUT', body: JSON.stringify(body),
          });
          metodoId = editing.metodo_id;
          KoguApi.toast('Método actualizado', 'success');
        } else {
          const res = await KoguApi.apiFetch(BASE, {
            method: 'POST', body: JSON.stringify(body),
          });
          const created = KoguApi.unwrapData(res);
          metodoId = created.metodo_id;
          KoguApi.toast('Método creado', 'success');
        }

        // Sincronizar i18n (upsert por idioma, delete si vacío)
        for (const i of IDIOMAS.filter(x => x.code !== 'es')) {
          const nombre = oQ(`[data-i18n-nombre="${i.code}"]`)?.value.trim() || '';
          const desc   = oQ(`[data-i18n-desc="${i.code}"]`)?.value.trim()   || '';
          const ref    = oQ(`[data-i18n-ref="${i.code}"]`)?.value.trim()    || '';
          const trExists = (e.traducciones || []).some(t => t.idioma === i.code);
          if (nombre) {
            try {
              await KoguApi.apiFetch(`${BASE}/${metodoId}/i18n/${i.code}`, {
                method: 'PUT',
                body: JSON.stringify({ nombre, descripcion: desc || null, referencia: ref || null }),
              });
            } catch (err) { console.warn('i18n upsert', i.code, err.message); }
          } else if (trExists) {
            try {
              await KoguApi.apiFetch(`${BASE}/${metodoId}/i18n/${i.code}`, { method: 'DELETE' });
            } catch (err) { console.warn('i18n delete', i.code, err.message); }
          }
        }

        close();
        await load();
      } catch (err) {
        oQ('#saveBtn').disabled = false;
        KoguApi.toast(err.message, 'error');
      }
    });
  }

  function confirmarBaja(metodoId) {
    if (!confirm('¿Desactivar este método?\n\nLos resultados y especificaciones que lo referencian mantienen el vínculo. El método queda como "inactivo" — puedes reactivarlo editándolo.')) return;
    KoguApi.apiFetch(`${BASE}/${metodoId}`, { method: 'DELETE' })
      .then(() => { KoguApi.toast('Método desactivado', 'success'); return load(); })
      .catch(err => KoguApi.toast(err.message, 'error'));
  }

  // ── Wiring ────────────────────────────────────────────
  $('qFil').addEventListener('input', debounce(() => load({ resetPage: true }), 300));
  $('origenFil').addEventListener('change', () => load({ resetPage: true }));
  $('statusFil').addEventListener('change', () => load({ resetPage: true }));
  $('refreshBtn').addEventListener('click', () => load({ showToast: true }));
  $('newMetodoBtn').addEventListener('click', () => abrirEditor(null));
  $('pgSize').addEventListener('change', e => {
    pageSize = parseInt(e.target.value, 10) || 25;
    load({ resetPage: true });
  });
  $('pgFirst').addEventListener('click', () => { if (currentPage > 1) { currentPage = 1; load(); } });
  $('pgPrev').addEventListener('click',  () => { if (currentPage > 1) { currentPage--;    load(); } });
  $('pgNext').addEventListener('click',  () => { if (currentPage < totalPages) { currentPage++; load(); } });
  $('pgLast').addEventListener('click',  () => { if (currentPage < totalPages) { currentPage = totalPages; load(); } });

  KoguShell.subscribeEmpresaActivaChange(() => load({ showToast: true, resetPage: true }));

  function escapeHtml(s) { return String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m]); }
  function escapeAttr(s) { return String(s ?? '').replace(/"/g, '&quot;'); }
  function debounce(fn, ms) { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); }; }
  function truncar(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }

  await loadParametros();
  await load();
});

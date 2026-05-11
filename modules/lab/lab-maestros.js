// ============================================================
// lab-maestros.js
// Pantalla del módulo Lab QA — Maestros analíticos.
// Por ahora solo Parámetros (con i18n). Métodos / Equipos /
// Reactivos se sumarán como tabs adicionales en una próxima iteración.
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/lab/lab-maestros.html';
  const BASE = '/protected/lab/maestros/parametros';
  const PERM = 'screen.lab.maestros';

  const IDIOMAS = [
    { code: 'es', label: 'Español'    },
    { code: 'en', label: 'English'    },
    { code: 'pt', label: 'Português'  },
    { code: 'fr', label: 'Français'   },
    { code: 'de', label: 'Deutsch'    },
    { code: 'it', label: 'Italiano'   },
  ];

  const TIPOS = [
    { code: 'numerico',         label: 'Numérico'         },
    { code: 'rango',            label: 'Rango'            },
    { code: 'texto_controlado', label: 'Texto controlado' },
    { code: 'booleano',         label: 'Booleano'         },
    { code: 'microbiologico',   label: 'Microbiológico'   },
  ];

  // ── Bootstrap del shell ────────────────────────────────────────
  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Maestros analíticos',
    description: 'Parámetros, métodos, equipos y reactivos del laboratorio.',
    requiredPermission: PERM,
  });
  if (!b) return;

  const c = document.getElementById('pageContent');
  c.innerHTML = `
<!-- Barra de navegación entre maestros -->
<div style="display:flex;gap:4px;border-bottom:1px solid var(--line);margin-bottom:16px">
  <a href="/modules/lab/lab-maestros.html"  style="padding:10px 16px;font-size:14px;color:#0f172a;font-weight:600;border-bottom:3px solid #0f172a;text-decoration:none">Parámetros</a>
  <a href="/modules/lab/lab-metodos.html"   style="padding:10px 16px;font-size:14px;color:#64748b;border-bottom:3px solid transparent;text-decoration:none">Métodos</a>
  <a href="/modules/lab/lab-equipos.html"   style="padding:10px 16px;font-size:14px;color:#64748b;border-bottom:3px solid transparent;text-decoration:none">Equipos</a>
  <a href="/modules/lab/lab-reactivos.html" style="padding:10px 16px;font-size:14px;color:#64748b;border-bottom:3px solid transparent;text-decoration:none">Reactivos</a>
</div>

<div class="split">

  <!-- ── Lista ── -->
  <div class="card">
    <div class="row">
      <div><div class="eyebrow">Lab QA</div><h2>Parámetros analíticos</h2></div>
      <div style="display:flex;gap:8px;align-items:center">
        <select class="select" id="idiomaVis" title="Idioma de visualización" style="width:140px">
          ${IDIOMAS.map(i => `<option value="${i.code}">${i.label}</option>`).join('')}
        </select>
        <button class="btn primary" id="refreshBtn">Actualizar</button>
      </div>
    </div>
    <div class="grid-2" style="margin-top:16px;gap:10px">
      <input  class="input"  id="q"        placeholder="Buscar por clave, nombre o descripción" />
      <select class="select" id="tipoFil">
        <option value="">Todos los tipos</option>
        ${TIPOS.map(t => `<option value="${t.code}">${t.label}</option>`).join('')}
      </select>
      <select class="select" id="statusFil">
        <option value="">Todos los estados</option>
        <option value="activo">Activos</option>
        <option value="inactivo">Inactivos</option>
      </select>
      <select class="select" id="criticoFil">
        <option value="">Todos</option>
        <option value="true">Solo críticos</option>
        <option value="false">No críticos</option>
      </select>
    </div>
    <div class="table-wrap" style="margin-top:16px">
      <table><thead><tr>
        <th>Clave</th>
        <th>Nombre</th>
        <th>Tipo</th>
        <th>Unidad</th>
        <th style="text-align:center">Decimales</th>
        <th style="text-align:center">Crítico</th>
        <th>Estado</th>
        <th></th>
      </tr></thead><tbody id="rowsParam"></tbody></table>
    </div>

    <!-- Barra de paginación (mismo patrón que lab-lotes) -->
    <div id="pgBarParam" style="display:flex;align-items:center;justify-content:space-between;margin-top:14px;flex-wrap:wrap;gap:10px;font-size:13px;color:var(--muted)">
      <div id="pgInfoParam">—</div>
      <div style="display:flex;align-items:center;gap:6px">
        <span>Por página:</span>
        <select class="select" id="pgSizeParam" style="width:80px">
          <option value="10">10</option>
          <option value="25" selected>25</option>
          <option value="50">50</option>
          <option value="100">100</option>
        </select>
        <button class="btn ghost" id="pgFirstParam" title="Primera">«</button>
        <button class="btn ghost" id="pgPrevParam"  title="Anterior">‹</button>
        <span id="pgNumerosParam" style="display:flex;gap:4px"></span>
        <button class="btn ghost" id="pgNextParam"  title="Siguiente">›</button>
        <button class="btn ghost" id="pgLastParam"  title="Última">»</button>
      </div>
    </div>
  </div>

  <!-- ── Formulario ── -->
  <div class="card" style="overflow-y:auto;max-height:90vh">
    <div class="row">
      <div><div class="eyebrow">Parámetro</div><h2 id="paramTitle">Nuevo parámetro</h2></div>
      <span class="chip" id="paramChip">Alta</span>
    </div>
    <input type="hidden" id="parametroId" />

    <!-- Identificación -->
    <div style="margin-top:16px">
      <div class="eyebrow" style="margin-bottom:10px">Identificación</div>
      <div class="grid-2" style="gap:10px">
        <div>
          <div class="label-text">Clave <span style="color:var(--danger)">*</span></div>
          <input class="input" id="pClave" placeholder="Ej: HUM, PH, BRIX" style="text-transform:uppercase" maxlength="30"/>
        </div>
        <div>
          <div class="label-text">Estado</div>
          <select class="select" id="pStatus">
            <option value="activo">Activo</option>
            <option value="inactivo">Inactivo</option>
          </select>
        </div>
      </div>
      <div style="margin-top:10px">
        <div class="label-text">Nombre <span style="color:var(--danger)">*</span></div>
        <input class="input" id="pNombre" placeholder="Nombre del parámetro" maxlength="150"/>
      </div>
      <div style="margin-top:10px">
        <div class="label-text">Descripción</div>
        <textarea class="input" id="pDesc" rows="2" placeholder="Descripción breve del parámetro" maxlength="500"></textarea>
      </div>
    </div>

    <!-- Configuración técnica -->
    <div style="margin-top:18px; border-top:1px solid var(--line); padding-top:14px">
      <div class="eyebrow" style="margin-bottom:10px">Configuración técnica</div>
      <div class="grid-2" style="gap:10px">
        <div>
          <div class="label-text">Tipo <span style="color:var(--danger)">*</span></div>
          <select class="select" id="pTipo">
            ${TIPOS.map(t => `<option value="${t.code}">${t.label}</option>`).join('')}
          </select>
        </div>
        <div>
          <div class="label-text">Unidad oficial</div>
          <select class="select" id="pUnidad"><option value="">— Sin unidad —</option></select>
        </div>
        <div>
          <div class="label-text">Decimales captura</div>
          <input class="input" id="pDecCap" type="number" min="0" max="8" value="2"/>
        </div>
        <div>
          <div class="label-text">Decimales presentación</div>
          <input class="input" id="pDecPres" type="number" min="0" max="8" value="2"/>
        </div>
      </div>
      <div style="margin-top:12px;display:flex;gap:18px;flex-wrap:wrap">
        <label style="display:flex;align-items:center;gap:6px;font-size:14px">
          <input type="checkbox" id="pCritico"/> Es crítico (destaca en COA)
        </label>
        <label style="display:flex;align-items:center;gap:6px;font-size:14px">
          <input type="checkbox" id="pNoExcep"/> No excepcionable (bloquea excepciones)
        </label>
      </div>
    </div>

    <!-- Traducciones i18n -->
    <div style="margin-top:18px; border-top:1px solid var(--line); padding-top:14px">
      <div class="row">
        <div class="eyebrow">Traducciones</div>
        <select class="select" id="i18nNuevo" style="width:160px">
          <option value="">+ Agregar idioma…</option>
          ${IDIOMAS.filter(i => i.code !== 'es').map(i => `<option value="${i.code}">${i.label}</option>`).join('')}
        </select>
      </div>
      <div id="i18nList" style="margin-top:10px;display:flex;flex-direction:column;gap:10px"></div>
      <div id="i18nHint" class="muted" style="margin-top:8px;font-size:12px">
        ES es el idioma base (se toma de Nombre/Descripción arriba). Las demás traducciones se guardan al editar abajo.
      </div>
    </div>

    <!-- Acciones -->
    <div class="row" style="margin-top:18px;gap:8px">
      <button class="btn" id="cancelBtn">Cancelar</button>
      <button class="btn primary" id="saveBtn">Guardar</button>
      <button class="btn danger" id="deleteBtn" style="display:none">Eliminar</button>
    </div>
  </div>

</div>
  `;

  // ── Estado en memoria ─────────────────────────────────────────
  let parametros = [];
  let unidades   = [];
  let editing    = null;   // parámetro actual cargado en el formulario
  let dirtyI18n  = {};     // { idioma: { nombre, descripcion, action: 'upsert'|'delete' } }

  // Paginación servidor (patrón estándar Lab)
  let currentPage = 1;
  let pageSize    = 25;
  let totalPages  = 1;
  let totalParams = 0;

  // ── Selectores ────────────────────────────────────────────────
  const $ = (id) => document.getElementById(id);

  // ── Carga inicial: unidades de medida + parámetros ────────────
  async function loadUnidades() {
    try {
      const res = await KoguApi.apiFetch('/protected/cat/unidades');
      unidades = KoguApi.unwrapRows(res).filter(u => u.activo);
      const sel = $('pUnidad');
      sel.innerHTML = '<option value="">— Sin unidad —</option>'
        + unidades.map(u => `<option value="${u.unidad_id}">${u.clave_interna} — ${u.nombre} (${u.simbolo || ''})</option>`).join('');
    } catch (err) {
      // No bloqueante — el parámetro puede ir sin unidad
      console.warn('No se pudieron cargar unidades:', err.message);
    }
  }

  async function loadParametros(showToast = false, { resetPage = false } = {}) {
    if (resetPage) currentPage = 1;
    const idiomaVis = $('idiomaVis').value || 'es';
    const params = new URLSearchParams();
    if ($('q').value.trim())        params.set('q', $('q').value.trim());
    if ($('tipoFil').value)         params.set('tipo', $('tipoFil').value);
    if ($('statusFil').value)       params.set('status', $('statusFil').value);
    if ($('criticoFil').value)      params.set('es_critico', $('criticoFil').value);
    params.set('page',     String(currentPage));
    params.set('pageSize', String(pageSize));

    const url = BASE + '?' + params.toString();
    try {
      const res = await KoguApi.apiFetch(url);
      parametros = KoguApi.unwrapData(res) || [];

      // Lectura de meta (patrón estándar Lab)
      const meta = res?.meta || {};
      totalParams = parseInt(meta.total ?? parametros.length, 10) || 0;
      pageSize    = parseInt(meta.pageSize ?? pageSize, 10) || pageSize;
      currentPage = parseInt(meta.page ?? currentPage, 10) || 1;
      totalPages  = parseInt(meta.totalPages ?? 1, 10) || 1;

      renderTabla(idiomaVis);
      renderPaginacion();
      if (showToast) KoguApi.toast('Parámetros actualizados', 'success');
    } catch (err) {
      KoguApi.toast(err.message, 'error');
    }
  }

  // ── Render de la barra de paginación (patrón estándar Lab) ──
  function renderPaginacion() {
    const inicio = totalParams === 0 ? 0 : (currentPage - 1) * pageSize + 1;
    const fin    = Math.min(currentPage * pageSize, totalParams);
    $('pgInfoParam').textContent = totalParams
      ? `Mostrando ${inicio}–${fin} de ${totalParams} parámetro${totalParams === 1 ? '' : 's'}`
      : 'Sin resultados';

    $('pgFirstParam').disabled = currentPage <= 1;
    $('pgPrevParam').disabled  = currentPage <= 1;
    $('pgNextParam').disabled  = currentPage >= totalPages;
    $('pgLastParam').disabled  = currentPage >= totalPages;

    const ventana = 2;
    let from = Math.max(1, currentPage - ventana);
    let to   = Math.min(totalPages, currentPage + ventana);
    if (currentPage <= 3) to = Math.min(totalPages, 5);
    if (currentPage >= totalPages - 2) from = Math.max(1, totalPages - 4);

    const nums = $('pgNumerosParam');
    nums.innerHTML = '';
    if (from > 1) {
      nums.appendChild(makePgBtn(1));
      if (from > 2) {
        const dots = document.createElement('span');
        dots.textContent = '…'; dots.style.padding = '0 6px';
        nums.appendChild(dots);
      }
    }
    for (let i = from; i <= to; i++) nums.appendChild(makePgBtn(i));
    if (to < totalPages) {
      if (to < totalPages - 1) {
        const dots = document.createElement('span');
        dots.textContent = '…'; dots.style.padding = '0 6px';
        nums.appendChild(dots);
      }
      nums.appendChild(makePgBtn(totalPages));
    }
  }

  function makePgBtn(num) {
    const b = document.createElement('button');
    b.className = 'btn ghost';
    b.textContent = String(num);
    if (num === currentPage) {
      b.classList.add('primary');
      b.classList.remove('ghost');
    }
    b.addEventListener('click', () => {
      if (num !== currentPage) {
        currentPage = num;
        loadParametros();
      }
    });
    return b;
  }

  function renderTabla(idiomaVis) {
    const tbody = $('rowsParam');
    if (!parametros.length) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--muted)">Sin parámetros para los filtros aplicados.</td></tr>`;
      // El texto "Sin resultados" se maneja en renderPaginacion vía pgInfoParam.
      return;
    }

    tbody.innerHTML = parametros.map(p => {
      const tipo = TIPOS.find(t => t.code === p.tipo_parametro)?.label || p.tipo_parametro;
      const unidad = p.unidad_clave
        ? `${p.unidad_clave}${p.unidad_simbolo ? ' ('+p.unidad_simbolo+')' : ''}`
        : '<span class="muted">—</span>';
      const dec = `${p.decimales_captura}/${p.decimales_presentacion}`;
      const critico = p.es_critico
        ? '<span class="chip" style="background:#fef3c7;color:#92400e">Crítico</span>'
        : '<span class="muted">—</span>';
      const status = p.status === 'activo'
        ? '<span class="chip" style="background:#dcfce7;color:#166534">Activo</span>'
        : '<span class="chip" style="background:#fee2e2;color:#991b1b">Inactivo</span>';
      // El nombre se muestra en el idioma seleccionado si hay traducción; si no, fallback al base.
      const nombreVis = idiomaVis === 'es' ? p.nombre : (p.i18n_nombre_vis || p.nombre);
      return `
        <tr>
          <td><strong>${escapeHtml(p.clave)}</strong></td>
          <td>${escapeHtml(nombreVis)}</td>
          <td>${tipo}</td>
          <td>${unidad}</td>
          <td style="text-align:center">${dec}</td>
          <td style="text-align:center">${critico}</td>
          <td>${status}</td>
          <td style="text-align:right">
            <button class="btn ghost" data-action="edit" data-id="${p.parametro_id}">Editar</button>
          </td>
        </tr>`;
    }).join('');

    // El total y "Mostrando X–Y de Z" lo dibuja renderPaginacion vía pgInfoParam.

    // Bind acción Editar
    tbody.querySelectorAll('button[data-action="edit"]').forEach(btn => {
      btn.addEventListener('click', () => loadEdit(btn.dataset.id));
    });
  }

  // Para vista bilingüe en la tabla, cuando cambien el idioma resolvemos el nombre.
  // Como la lista no trae i18n por default, hacemos fetch del detalle solo cuando el
  // usuario cambia a un idioma != 'es'. Para mantenerlo simple en V1, sólo cambiamos
  // el campo nombre de los que ya tengamos cacheados; los demás muestran el nombre base.
  async function refreshNombresVisualizacion(idiomaVis) {
    if (idiomaVis === 'es') {
      parametros.forEach(p => { p.i18n_nombre_vis = null; });
      renderTabla('es');
      return;
    }
    // Fetch detalles en paralelo (solo de los que aún no tienen i18n cargado)
    const pending = parametros.filter(p => !p._i18nLoaded);
    if (pending.length) {
      await Promise.all(pending.map(async (p) => {
        try {
          const res = await KoguApi.apiFetch(`${BASE}/${p.parametro_id}`);
          const det = KoguApi.unwrapData(res);
          p._i18n = det.i18n || {};
          p._i18nLoaded = true;
        } catch (_) { /* silencioso */ }
      }));
    }
    parametros.forEach(p => {
      p.i18n_nombre_vis = (p._i18n && p._i18n[idiomaVis]) ? p._i18n[idiomaVis].nombre : null;
    });
    renderTabla(idiomaVis);
  }

  // ── Formulario: nuevo / editar ────────────────────────────────
  function resetForm() {
    editing = null;
    dirtyI18n = {};
    $('parametroId').value = '';
    $('pClave').value = '';
    $('pNombre').value = '';
    $('pDesc').value = '';
    $('pTipo').value = 'numerico';
    $('pUnidad').value = '';
    $('pDecCap').value = 2;
    $('pDecPres').value = 2;
    $('pCritico').checked = false;
    $('pNoExcep').checked = false;
    $('pStatus').value = 'activo';
    $('paramTitle').textContent = 'Nuevo parámetro';
    $('paramChip').textContent = 'Alta';
    $('paramChip').style.background = '#dbeafe';
    $('paramChip').style.color = '#1e40af';
    $('deleteBtn').style.display = 'none';
    renderI18nList({});
  }

  async function loadEdit(parametroId) {
    try {
      const res = await KoguApi.apiFetch(`${BASE}/${parametroId}`);
      const p = KoguApi.unwrapData(res);
      editing = p;
      dirtyI18n = {};
      $('parametroId').value = p.parametro_id;
      $('pClave').value = p.clave || '';
      $('pNombre').value = p.nombre || '';
      $('pDesc').value = p.descripcion || '';
      $('pTipo').value = p.tipo_parametro || 'numerico';
      $('pUnidad').value = p.unidad_id_oficial || '';
      $('pDecCap').value = p.decimales_captura ?? 2;
      $('pDecPres').value = p.decimales_presentacion ?? 2;
      $('pCritico').checked = !!p.es_critico;
      $('pNoExcep').checked = !!p.no_excepcionable;
      $('pStatus').value = p.status || 'activo';
      $('paramTitle').textContent = 'Editar parámetro';
      $('paramChip').textContent = 'Edición';
      $('paramChip').style.background = '#fef3c7';
      $('paramChip').style.color = '#92400e';
      $('deleteBtn').style.display = p.status === 'activo' ? 'inline-block' : 'none';
      renderI18nList(p.i18n || {});
    } catch (err) {
      KoguApi.toast(err.message, 'error');
    }
  }

  function renderI18nList(i18n = {}) {
    const list = $('i18nList');
    list.innerHTML = '';
    const idiomasPresentes = Object.keys(i18n);
    if (!idiomasPresentes.length) {
      list.innerHTML = '<div class="muted" style="font-size:13px">Sin traducciones aún. Usa el selector para agregar una.</div>';
      return;
    }
    idiomasPresentes.sort().forEach(idioma => {
      const tr = i18n[idioma] || {};
      const lab = IDIOMAS.find(i => i.code === idioma)?.label || idioma.toUpperCase();
      const block = document.createElement('div');
      block.style.cssText = 'border:1px solid var(--line);padding:10px;border-radius:6px';
      block.innerHTML = `
        <div class="row">
          <div style="font-weight:600">${lab} <span class="muted" style="font-weight:normal">(${idioma})</span></div>
          <button class="btn ghost danger" data-i18n-del="${idioma}">Quitar</button>
        </div>
        <div style="margin-top:8px">
          <div class="label-text">Nombre</div>
          <input class="input" data-i18n-nombre="${idioma}" value="${escapeHtmlAttr(tr.nombre || '')}" maxlength="150"/>
        </div>
        <div style="margin-top:8px">
          <div class="label-text">Descripción</div>
          <textarea class="input" data-i18n-desc="${idioma}" rows="2" maxlength="500">${escapeHtml(tr.descripcion || '')}</textarea>
        </div>
      `;
      list.appendChild(block);
    });

    // Bind eventos delegados
    list.querySelectorAll('[data-i18n-del]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idioma = btn.dataset.i18nDel;
        dirtyI18n[idioma] = { action: 'delete' };
        if (editing && editing.i18n) delete editing.i18n[idioma];
        renderI18nList(editing?.i18n || {});
      });
    });
    list.querySelectorAll('[data-i18n-nombre]').forEach(inp => {
      inp.addEventListener('input', () => {
        const idioma = inp.dataset.i18nNombre;
        dirtyI18n[idioma] = dirtyI18n[idioma] || { action: 'upsert' };
        dirtyI18n[idioma].nombre = inp.value;
      });
    });
    list.querySelectorAll('[data-i18n-desc]').forEach(ta => {
      ta.addEventListener('input', () => {
        const idioma = ta.dataset.i18nDesc;
        dirtyI18n[idioma] = dirtyI18n[idioma] || { action: 'upsert' };
        dirtyI18n[idioma].descripcion = ta.value;
      });
    });
  }

  // ── Guardar (crear o actualizar + procesar i18n dirty) ────────
  async function save() {
    const id = $('parametroId').value;
    const payload = {
      clave:                   $('pClave').value.trim().toUpperCase(),
      nombre:                  $('pNombre').value.trim(),
      descripcion:             $('pDesc').value.trim() || null,
      tipo_parametro:          $('pTipo').value,
      unidad_id_oficial:       $('pUnidad').value || null,
      decimales_captura:       parseInt($('pDecCap').value, 10) || 0,
      decimales_presentacion:  parseInt($('pDecPres').value, 10) || 0,
      es_critico:              $('pCritico').checked,
      no_excepcionable:        $('pNoExcep').checked,
      status:                  $('pStatus').value,
    };

    if (!payload.clave)  return KoguApi.toast('La clave es obligatoria', 'error');
    if (!payload.nombre) return KoguApi.toast('El nombre es obligatorio', 'error');

    try {
      let savedId;
      if (id) {
        await KoguApi.apiFetch(`${BASE}/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
        savedId = id;
        KoguApi.toast('Parámetro actualizado', 'success');
      } else {
        const res = await KoguApi.apiFetch(BASE, { method: 'POST', body: JSON.stringify(payload) });
        const created = KoguApi.unwrapData(res);
        savedId = created.parametro_id;
        KoguApi.toast('Parámetro creado', 'success');
      }

      // Procesar traducciones dirty
      for (const [idioma, change] of Object.entries(dirtyI18n)) {
        try {
          if (change.action === 'delete') {
            await KoguApi.apiFetch(`${BASE}/${savedId}/i18n/${idioma}`, { method: 'DELETE' });
          } else if (change.action === 'upsert' && change.nombre?.trim()) {
            await KoguApi.apiFetch(`${BASE}/${savedId}/i18n/${idioma}`, {
              method: 'PUT',
              body: JSON.stringify({
                nombre: change.nombre.trim(),
                descripcion: change.descripcion?.trim() || null,
              }),
            });
          }
        } catch (e) {
          KoguApi.toast(`i18n ${idioma}: ${e.message}`, 'error');
        }
      }

      dirtyI18n = {};
      await loadParametros();
      await loadEdit(savedId);
    } catch (err) {
      KoguApi.toast(err.message, 'error');
    }
  }

  async function softDelete() {
    const id = $('parametroId').value;
    if (!id) return;
    if (!confirm('¿Marcar este parámetro como inactivo?')) return;
    try {
      await KoguApi.apiFetch(`${BASE}/${id}`, { method: 'DELETE' });
      KoguApi.toast('Parámetro inactivado', 'success');
      resetForm();
      await loadParametros();
    } catch (err) {
      KoguApi.toast(err.message, 'error');
    }
  }

  // ── Selector de "agregar idioma" ─────────────────────────────
  $('i18nNuevo').addEventListener('change', (e) => {
    const idioma = e.target.value;
    if (!idioma) return;
    e.target.value = '';
    const i18nActual = (editing && editing.i18n) || {};
    if (i18nActual[idioma]) {
      KoguApi.toast(`Ya existe traducción ${idioma}`, 'info');
      return;
    }
    if (!editing) editing = { i18n: {} };
    if (!editing.i18n) editing.i18n = {};
    editing.i18n[idioma] = { nombre: '', descripcion: '' };
    dirtyI18n[idioma] = { action: 'upsert', nombre: '', descripcion: '' };
    renderI18nList(editing.i18n);
  });

  // ── Bindings ──────────────────────────────────────────────────
  $('refreshBtn').addEventListener('click', () => loadParametros(true));
  // Filtros → reset a página 1
  $('q').addEventListener('input', debounce(() => loadParametros(false, { resetPage: true }), 300));
  $('tipoFil').addEventListener('change',     () => loadParametros(false, { resetPage: true }));
  $('statusFil').addEventListener('change',   () => loadParametros(false, { resetPage: true }));
  $('criticoFil').addEventListener('change',  () => loadParametros(false, { resetPage: true }));

  // Paginación
  $('pgSizeParam').addEventListener('change', (e) => {
    pageSize = parseInt(e.target.value, 10) || 25;
    loadParametros(false, { resetPage: true });
  });
  $('pgFirstParam').addEventListener('click', () => { if (currentPage > 1)         { currentPage = 1;          loadParametros(); } });
  $('pgPrevParam').addEventListener('click',  () => { if (currentPage > 1)         { currentPage--;            loadParametros(); } });
  $('pgNextParam').addEventListener('click',  () => { if (currentPage < totalPages) { currentPage++;           loadParametros(); } });
  $('pgLastParam').addEventListener('click',  () => { if (currentPage < totalPages) { currentPage = totalPages; loadParametros(); } });
  $('idiomaVis').addEventListener('change', (e) => refreshNombresVisualizacion(e.target.value));
  $('cancelBtn').addEventListener('click', resetForm);
  $('saveBtn').addEventListener('click', save);
  $('deleteBtn').addEventListener('click', softDelete);

  // Refresh al cambiar empresa activa
  KoguShell.subscribeEmpresaActivaChange(async () => {
    resetForm();
    await loadUnidades();
    await loadParametros(true);
  });

  // ── Helpers ──────────────────────────────────────────────────
  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, m => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    })[m]);
  }
  function escapeHtmlAttr(s) {
    return String(s ?? '').replace(/"/g, '&quot;');
  }
  function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  // ── Arranque ─────────────────────────────────────────────────
  resetForm();
  await loadUnidades();
  await loadParametros();
});

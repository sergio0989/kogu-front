// ============================================================
// bandeja-defensa.js
// Bandeja de CFDI con score de materialidad y filtros operativos.
// Sub-proyecto: materialidad-v1 — Iteración 1.
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const b = await KoguShell.initShell({
    currentPage:        '/modules/mat/bandeja-defensa.html',
    title:              'Bandeja de Defensa',
    description:        'CFDI con su score de materialidad — filtros por nivel, estatus de defensa y exposición EFOS.',
    requiredPermission: 'screen.mat.bandeja_defensa',
  });
  if (!b) return;

  document.getElementById('pageContent').innerHTML = `
<div class="card">
  <div class="row">
    <div><div class="eyebrow">Materialidad</div><h2>Bandeja de Defensa</h2></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn" id="recalcPendientesBtn" title="Calcular score de los CFDI que aún no lo tienen">Recalcular pendientes</button>
      <button class="btn primary" id="refreshBtn">Actualizar</button>
    </div>
  </div>

  <div style="margin-top:16px">
    <div class="label-text">🔍 Buscar UUID · RFC · Serie · Folio · Nombre del tercero</div>
    <input class="input" id="fQ" placeholder="Pega un UUID o escribe parte del RFC, nombre del proveedor/cliente, serie o folio…" autocomplete="off" style="font-size:14px;padding:10px 12px"/>
    <div class="muted" style="font-size:11px;margin-top:4px">La búsqueda se aplica sobre todos los CFDIs de la empresa, no solo los visibles.</div>
  </div>

  <div class="grid-2" style="margin-top:14px;gap:8px">
    <div>
      <div class="label-text">Tipo CFDI</div>
      <select class="select" id="fTipo">
        <option value="I" selected>Ingreso (compras / ventas)</option>
        <option value="E">Egreso (notas de crédito)</option>
        <option value="T">Traslado</option>
        <option value="P">Pago (REP)</option>
        <option value="N">Nómina</option>
        <option value="">Todos los tipos</option>
      </select>
    </div>
    <div>
      <div class="label-text">Scope</div>
      <select class="select" id="fScope">
        <option value="RECIBIDO" selected>Recibidos (defensa de deducciones)</option>
        <option value="EMITIDO">Emitidos</option>
        <option value="">Emitidos y recibidos</option>
      </select>
    </div>
  </div>

  <div class="grid-2" style="margin-top:8px;gap:8px">
    <div>
      <div class="label-text">Nivel</div>
      <select class="select" id="fNivel">
        <option value="">Todos los niveles</option>
        <option value="BAJO">BAJO</option><option value="MEDIO">MEDIO</option>
        <option value="ALTO">ALTO</option><option value="CRITICO">CRÍTICO</option>
      </select>
    </div>
    <div>
      <div class="label-text">Estatus defensa</div>
      <select class="select" id="fEstatus">
        <option value="">Cualquier estatus</option>
        <option value="sin_iniciar">Sin iniciar</option>
        <option value="en_armado">En armado</option>
        <option value="completo">Completo</option>
        <option value="insuficiente">Insuficiente</option>
        <option value="requiere_aprobacion">Requiere aprobación</option>
        <option value="cerrado">Cerrado</option>
      </select>
    </div>
  </div>

  <div class="grid-2" style="margin-top:8px;gap:8px">
    <div>
      <div class="label-text">EFOS / 69-B</div>
      <select class="select" id="fEfos">
        <option value="">Cualquier estado EFOS/69-B</option>
        <option value="presunto">Presunto</option>
        <option value="definitivo">Definitivo</option>
        <option value="desvirtuado">Desvirtuado</option>
        <option value="sentencia">Sentencia favorable</option>
      </select>
    </div>
    <div></div>
  </div>

  <div class="grid-2" style="margin-top:8px;gap:8px">
    <div><div class="label-text">Desde</div><input class="input" id="fFrom" type="date"/></div>
    <div><div class="label-text">Hasta</div><input class="input" id="fTo"   type="date"/></div>
  </div>

  <div class="table-wrap" style="margin-top:16px">
    <table><thead><tr>
      <th style="min-width:120px">UUID</th>
      <th style="min-width:90px">Serie / Folio</th>
      <th style="min-width:90px;white-space:nowrap">Fecha</th>
      <th>Scope</th>
      <th style="min-width:200px">Tercero</th>
      <th style="text-align:right;min-width:110px;white-space:nowrap">Total</th>
      <th style="text-align:center;min-width:70px">Score</th>
      <th>Nivel</th><th>Estatus</th><th>EFOS</th>
      <th style="min-width:140px">Acción</th>
    </tr></thead><tbody id="rows"></tbody></table>
  </div>

  <div id="pgBar" style="display:flex;align-items:center;justify-content:space-between;margin-top:14px;flex-wrap:wrap;gap:10px;font-size:13px;color:var(--muted,#64748b)">
    <div id="pgInfo">—</div>
    <div style="display:flex;align-items:center;gap:6px">
      <span style="font-size:12px">Por página:</span>
      <select id="pgSize" class="select" style="width:auto">
        <option>25</option>
        <option selected>50</option>
        <option>100</option>
        <option>200</option>
      </select>
      <button class="btn sm" id="pgFirst" title="Primera">«</button>
      <button class="btn sm" id="pgPrev"  title="Anterior">‹</button>
      <span id="pgNumeros" style="padding:0 4px"></span>
      <button class="btn sm" id="pgNext"  title="Siguiente">›</button>
      <button class="btn sm" id="pgLast"  title="Última">»</button>
    </div>
  </div>

  <div id="meta" class="muted" style="margin-top:10px;font-size:12px"></div>
  <div id="bannerLimite" style="display:none;margin-top:10px;padding:10px 14px;background:#fefce8;border:1px solid #fde047;border-radius:8px;font-size:12px;color:#854d0e">
    ⚠️ <strong>Vista limitada:</strong> Se están mostrando los primeros <strong id="bannerLimiteN"></strong> CFDIs. Usa los filtros (fecha, nivel, scope) para acotar la búsqueda y ver el rango que necesitas.
  </div>
</div>`;

  const $ = id => document.getElementById(id);

  function fmtDate(d){ if(!d) return ''; return new Date(d).toLocaleDateString('es-MX'); }

  // Estado de paginación server-side
  let _pageRows    = [];   // filas de la página actual (viene del servidor)
  let _total       = 0;   // total de registros con los filtros activos
  let _totalConScore  = 0;
  let _totalSinScore  = 0;
  let _currentPage = 1;

  async function load(opts = {}) {
    if (opts.resetPage !== false) _currentPage = 1;

    const pageSize = Number($('pgSize').value) || 50;
    const offset   = (_currentPage - 1) * pageSize;

    const p = new URLSearchParams();
    const set = (k, id) => { const v = $(id).value.trim(); if (v) p.set(k, v); };
    set('tipo_cfdi','fTipo');
    set('nivel','fNivel');
    set('estatus_defensa','fEstatus');
    set('scope','fScope');
    set('riesgo_efos','fEfos');
    set('from','fFrom');
    set('to','fTo');
    set('q','fQ');
    p.set('limit',  String(pageSize));
    p.set('offset', String(offset));

    const res      = await KoguApi.apiFetch('/protected/mat/bandeja-defensa?' + p.toString());
    const data     = KoguApi.unwrapData(res) || {};
    _pageRows      = data.rows          || [];
    _total         = data.total         || 0;
    _totalConScore = data.totalConScore || 0;
    _totalSinScore = data.totalSinScore || 0;

    // Ocultar banner (ya no aplica con paginación real)
    $('bannerLimite').style.display = 'none';

    renderPage();
  }

  function renderPage() {
    const pageSize  = Number($('pgSize').value) || 50;
    const total     = _total;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (_currentPage > totalPages) _currentPage = totalPages;
    if (_currentPage < 1) _currentPage = 1;

    const from = total === 0 ? 0 : (_currentPage - 1) * pageSize;
    const to   = Math.min(from + _pageRows.length, total);
    const pageRows = _pageRows;

    const conScore  = _totalConScore;
    const sinScore  = _totalSinScore;

    $('rows').innerHTML = pageRows.length ? pageRows.map(r => {
      const tieneScore = r.score_id != null;
      const scopeEfectivo = r.scope || (String(r.cfdi_origen || '').toUpperCase().includes('RECIB') ? 'RECIBIDO' : 'EMITIDO');
      const esRecibido = scopeEfectivo === 'RECIBIDO';
      const terceroRfc    = esRecibido ? r.emisor_rfc    : r.receptor_rfc;
      const terceroNombre = esRecibido ? r.emisor_nombre : r.receptor_nombre;
      const uuidFull  = r.cfdi_uuid || '';
      const uuidShort = uuidFull.slice(0, 8);
      const serieFolio = (r.serie || '') + (r.folio != null && r.folio !== '' ? ((r.serie ? ' / ' : '') + r.folio) : '');

      const accionHtml = tieneScore
        ? `<a class="btn sm" href="/modules/mat/cfdi-materialidad.html?cfdi_id=${encodeURIComponent(r.cfdi_id)}">Abrir</a>`
        : `<button class="btn primary sm btn-calc" data-cfdi="${KoguUi.escapeHtml(r.cfdi_id)}">Calcular</button>
           <a class="btn sm" href="/modules/mat/cfdi-materialidad.html?cfdi_id=${encodeURIComponent(r.cfdi_id)}">Abrir</a>`;

      const rowStyle = tieneScore ? '' : 'background:#fafafa;color:#475569;';
      return `
        <tr style="${rowStyle}">
          <td title="${KoguUi.escapeHtml(uuidFull)}">
            <span style="font-family:monospace;font-size:11px">${KoguUi.escapeHtml(uuidShort)}…</span>
          </td>
          <td>${serieFolio ? `<strong style="font-size:12px">${KoguUi.escapeHtml(serieFolio)}</strong>` : '<span class="muted">—</span>'}</td>
          <td style="white-space:nowrap;font-size:12px">${fmtDate(r.fecha_emision)}</td>
          <td>${KoguUi.escapeHtml(scopeEfectivo)}</td>
          <td style="font-size:12px;line-height:1.4">
            <strong>${KoguUi.escapeHtml(terceroNombre || '—')}</strong>
            <div style="font-family:monospace;font-size:11px;color:var(--muted,#64748b)">${KoguUi.escapeHtml(terceroRfc || '')}</div>
          </td>
          <td style="text-align:right;white-space:nowrap;font-weight:600">${KoguUi.fmtMoney(r.total, r.moneda)}</td>
          <td style="text-align:center;font-weight:700">${tieneScore ? r.score : '<span class="muted">—</span>'}</td>
          <td>${tieneScore ? KoguUi.nivelBadge(r.nivel) : '<span class="muted" style="font-size:11px">— sin calcular —</span>'}</td>
          <td>${tieneScore ? KoguUi.estatusBadge(r.estatus_defensa) : '<span class="muted">—</span>'}</td>
          <td>${tieneScore ? KoguUi.efosBadge(r.riesgo_efos) : '<span class="muted">—</span>'}</td>
          <td><div class="actions-cell">${accionHtml}</div></td>
        </tr>
      `;
    }).join('') : '<tr><td colspan="11" class="empty">Sin CFDIs que coincidan con los filtros.</td></tr>';

    // Wire de "Calcular" individual
    document.querySelectorAll('.btn-calc').forEach(btn => btn.onclick = async () => {
      const cfdiId = btn.dataset.cfdi;
      btn.disabled = true; btn.textContent = '...';
      try {
        const res = await KoguApi.apiFetch('/protected/mat/score/' + cfdiId + '/recalcular', { method: 'POST' });
        const s = KoguApi.unwrapData(res);
        KoguApi.toast(`Score calculado: ${s.score} (${s.nivel})`, 'success');
        await load({ resetPage: false });
      } catch (e) {
        btn.disabled = false; btn.textContent = 'Calcular';
        KoguApi.toast(e.message, 'error');
      }
    });

    renderPagination(total, totalPages, from, to);
    $('meta').textContent = `${total} CFDI · ${conScore} con score · ${sinScore} pendientes`;
  }

  function renderPagination(total, totalPages, from, to) {
    $('pgInfo').textContent = total === 0
      ? 'Sin registros'
      : `Mostrando ${from + 1}–${to} de ${total}`;

    $('pgFirst').disabled = _currentPage <= 1;
    $('pgPrev').disabled  = _currentPage <= 1;
    $('pgNext').disabled  = _currentPage >= totalPages;
    $('pgLast').disabled  = _currentPage >= totalPages;

    // Ventana de páginas: máximo 5 alrededor de la actual + primera/última con …
    const win = [];
    const push = (n) => { if (!win.includes(n) && n >= 1 && n <= totalPages) win.push(n); };
    push(1);
    for (let i = _currentPage - 2; i <= _currentPage + 2; i++) push(i);
    push(totalPages);
    win.sort((a, b) => a - b);

    let html = '';
    let prev = 0;
    for (const n of win) {
      if (n - prev > 1) html += '<span style="color:#94a3b8;padding:0 4px">…</span>';
      html += `<button class="btn sm pgN" data-n="${n}" ${n === _currentPage ? 'style="background:#0f172a;color:#fff;border-color:#0f172a"' : ''}>${n}</button>`;
      prev = n;
    }
    $('pgNumeros').innerHTML = html;

    document.querySelectorAll('.pgN').forEach(b => b.onclick = () => {
      _currentPage = Number(b.dataset.n);
      load({ resetPage: false });
    });
  }

  // Filtros que recargan desde backend (incluyen q con debounce)
  ['fTipo','fNivel','fEstatus','fScope','fEfos','fFrom','fTo'].forEach(id => $(id).onchange = () => load({ resetPage: true }));
  let _qDebounce = null;
  $('fQ').addEventListener('input', () => {
    clearTimeout(_qDebounce);
    _qDebounce = setTimeout(() => load({ resetPage: true }), 300);
  });

  // Controles de paginación — cada cambio de página recarga del servidor
  $('pgSize').onchange = () => load({ resetPage: true });
  $('pgFirst').onclick = () => { _currentPage = 1;                                                                           load({ resetPage: false }); };
  $('pgPrev').onclick  = () => { _currentPage = Math.max(1, _currentPage - 1);                                               load({ resetPage: false }); };
  $('pgNext').onclick  = () => { _currentPage++;                                                                              load({ resetPage: false }); };
  $('pgLast').onclick  = () => { _currentPage = Math.ceil(_total / (Number($('pgSize').value) || 50));                       load({ resetPage: false }); };

  $('refreshBtn').onclick = () => load({ resetPage: false });

  // Recalcular pendientes (lote de hasta 50 por click).
  // Respeta los filtros actuales de Tipo CFDI y Scope para procesar solo
  // el subset visible en la bandeja.
  $('recalcPendientesBtn').onclick = async () => {
    const btn = $('recalcPendientesBtn');
    const tipoCfdi = $('fTipo').value;
    const scope    = $('fScope').value;

    // Etiqueta humana de los filtros activos
    const TIPO_LABELS = { I:'Ingreso', E:'Egreso', T:'Traslado', P:'Pago (REP)', N:'Nómina' };
    const partes = [];
    if (tipoCfdi) partes.push(`tipo ${TIPO_LABELS[tipoCfdi] || tipoCfdi}`);
    if (scope)    partes.push(scope === 'RECIBIDO' ? 'recibidos' : 'emitidos');
    const filtroLabel = partes.length ? partes.join(' · ') : 'sin filtros (todos los tipos)';

    if (!confirm(`Calcular score de hasta 50 CFDIs sin puntaje aún (${filtroLabel}). ¿Continuar?`)) return;
    btn.disabled = true; btn.textContent = 'Procesando...';
    try {
      const res = await KoguApi.apiFetch('/protected/mat/score/recalcular-pendientes', {
        method: 'POST',
        body: JSON.stringify({
          batch_limit: 50,
          tipo_cfdi:   tipoCfdi || null,
          scope:       scope    || null,
        }),
      });
      const data = KoguApi.unwrapData(res);
      if (data.procesados === 0 && (!data.errores || data.errores.length === 0)) {
        KoguApi.toast(`No hay CFDIs pendientes de score (${filtroLabel}).`, 'info');
      } else {
        const errCount = data.errores?.length || 0;
        KoguApi.toast(`Procesados: ${data.procesados} · Errores: ${errCount} · ${filtroLabel}. Recargando…`, 'success');
      }
      await load();
    } catch (e) {
      KoguApi.toast(e.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Recalcular pendientes';
    }
  };

  KoguShell.subscribeEmpresaActivaChange(() => load({ resetPage: true }));
  await load({ resetPage: true });
});

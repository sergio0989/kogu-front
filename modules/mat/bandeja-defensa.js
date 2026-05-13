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

  <div class="grid-2" style="margin-top:16px;gap:8px">
    <select class="select" id="fNivel">
      <option value="">Todos los niveles</option>
      <option value="BAJO">BAJO</option><option value="MEDIO">MEDIO</option>
      <option value="ALTO">ALTO</option><option value="CRITICO">CRÍTICO</option>
    </select>
    <select class="select" id="fEstatus">
      <option value="">Cualquier estatus de defensa</option>
      <option value="sin_iniciar">Sin iniciar</option>
      <option value="en_armado">En armado</option>
      <option value="completo">Completo</option>
      <option value="insuficiente">Insuficiente</option>
      <option value="requiere_aprobacion">Requiere aprobación</option>
      <option value="cerrado">Cerrado</option>
    </select>
  </div>

  <div class="grid-2" style="margin-top:8px;gap:8px">
    <select class="select" id="fScope">
      <option value="">Emitidos y recibidos</option>
      <option value="EMITIDO">Emitidos</option>
      <option value="RECIBIDO">Recibidos</option>
    </select>
    <select class="select" id="fEfos">
      <option value="">Cualquier estado EFOS/69-B</option>
      <option value="presunto">Presunto</option>
      <option value="definitivo">Definitivo</option>
      <option value="desvirtuado">Desvirtuado</option>
      <option value="sentencia">Sentencia favorable</option>
    </select>
  </div>

  <div class="grid-2" style="margin-top:8px;gap:8px">
    <div><div class="label-text">Desde</div><input class="input" id="fFrom" type="date"/></div>
    <div><div class="label-text">Hasta</div><input class="input" id="fTo"   type="date"/></div>
  </div>

  <div class="table-wrap" style="margin-top:16px">
    <table><thead><tr>
      <th>UUID</th><th>Fecha</th><th>Scope</th><th>Tercero</th><th>Total</th>
      <th>Score</th><th>Nivel</th><th>Estatus</th><th>EFOS</th><th>Acción</th>
    </tr></thead><tbody id="rows"></tbody></table>
  </div>
  <div id="meta" class="muted" style="margin-top:10px;font-size:12px"></div>
</div>`;

  const $ = id => document.getElementById(id);

  function nivelBadge(n) {
    if (!n) return '<span class="muted">—</span>';
    const c = n === 'BAJO' ? '#16a34a' : n === 'MEDIO' ? '#ca8a04' : n === 'ALTO' ? '#ea580c' : '#dc2626';
    return `<span class="chip" style="background:${c}1a;color:${c};border:1px solid ${c}55">${n}</span>`;
  }
  function estatusBadge(e) {
    if (!e) return '<span class="muted">—</span>';
    const c = e === 'completo' ? '#16a34a'
            : e === 'en_armado' ? '#ca8a04'
            : e === 'requiere_aprobacion' ? '#7c3aed'
            : e === 'insuficiente' ? '#dc2626'
            : '#64748b';
    return `<span class="chip" style="background:${c}1a;color:${c};border:1px solid ${c}55">${e.replace('_',' ')}</span>`;
  }
  function efosBadge(e) {
    if (!e) return '<span class="muted">—</span>';
    const c = e === 'definitivo' ? '#dc2626'
            : e === 'presunto'  ? '#ea580c'
            : e === 'desvirtuado' ? '#16a34a'
            : '#64748b';
    return `<span class="chip" style="background:${c}1a;color:${c};border:1px solid ${c}55">${e}</span>`;
  }
  function fmtDate(d){ if(!d) return ''; return new Date(d).toLocaleDateString('es-MX'); }
  function fmtMoney(v, mon){ if(v == null) return '—'; return Number(v).toLocaleString('es-MX',{style:'currency',currency:(mon||'MXN'),maximumFractionDigits:2}); }

  async function load() {
    const p = new URLSearchParams();
    const set = (k, id) => { const v = $(id).value.trim(); if (v) p.set(k, v); };
    set('nivel','fNivel');
    set('estatus_defensa','fEstatus');
    set('scope','fScope');
    set('riesgo_efos','fEfos');
    set('from','fFrom');
    set('to','fTo');
    const qs = p.toString() ? `?${p}` : '';
    const res = await KoguApi.apiFetch('/protected/mat/bandeja-defensa' + qs);
    const rows = KoguApi.unwrapRows(res) || [];

    let conScore = 0, sinScore = 0;
    $('rows').innerHTML = rows.length ? rows.map(r => {
      const tieneScore = r.score_id != null;
      if (tieneScore) conScore++; else sinScore++;

      // El scope efectivo: usa s.scope (calculado) cuando hay score; si no, deriva de cfdi.origen
      const scopeEfectivo = r.scope || (String(r.cfdi_origen || '').toUpperCase().includes('RECIB') ? 'RECIBIDO' : 'EMITIDO');
      const tercero = scopeEfectivo === 'RECIBIDO'
        ? `${r.emisor_rfc || ''} · ${r.emisor_nombre || ''}`
        : `${r.receptor_rfc || ''} · ${r.receptor_nombre || ''}`;

      // Acciones según si hay score o no
      const accionHtml = tieneScore
        ? `<a class="btn" href="/modules/mat/cfdi-materialidad.html?cfdi_id=${encodeURIComponent(r.cfdi_id)}">Abrir</a>`
        : `<button class="btn primary btn-calc" data-cfdi="${KoguUi.escapeHtml(r.cfdi_id)}">Calcular</button>
           <a class="btn" href="/modules/mat/cfdi-materialidad.html?cfdi_id=${encodeURIComponent(r.cfdi_id)}">Abrir</a>`;

      const rowStyle = tieneScore ? '' : 'background:#fafafa;color:#475569;';
      return `
        <tr style="${rowStyle}">
          <td style="font-family:monospace;font-size:11px">${KoguUi.escapeHtml((r.cfdi_uuid || '').slice(0, 8))}…</td>
          <td>${fmtDate(r.fecha_emision)}</td>
          <td>${KoguUi.escapeHtml(scopeEfectivo)}</td>
          <td>${KoguUi.escapeHtml(tercero)}</td>
          <td>${fmtMoney(r.total, r.moneda)}</td>
          <td style="font-weight:700">${tieneScore ? r.score : '<span class="muted">—</span>'}</td>
          <td>${tieneScore ? nivelBadge(r.nivel) : '<span class="muted" style="font-size:11px">— sin calcular —</span>'}</td>
          <td>${tieneScore ? estatusBadge(r.estatus_defensa) : '<span class="muted">—</span>'}</td>
          <td>${tieneScore ? efosBadge(r.riesgo_efos) : '<span class="muted">—</span>'}</td>
          <td><div class="actions-cell">${accionHtml}</div></td>
        </tr>
      `;
    }).join('') : '<tr><td colspan="10" class="empty">Sin CFDIs en esta empresa. Procesa algún paquete SAT primero para que aparezcan aquí.</td></tr>';

    $('meta').textContent = `${rows.length} CFDI · ${conScore} con score · ${sinScore} pendientes`;

    // Wire de "Calcular" individual
    document.querySelectorAll('.btn-calc').forEach(btn => btn.onclick = async () => {
      const cfdiId = btn.dataset.cfdi;
      btn.disabled = true; btn.textContent = '...';
      try {
        const res = await KoguApi.apiFetch('/protected/mat/score/' + cfdiId + '/recalcular', { method: 'POST' });
        const s = KoguApi.unwrapData(res);
        KoguApi.toast(`Score calculado: ${s.score} (${s.nivel})`, 'success');
        await load();
      } catch (e) {
        btn.disabled = false; btn.textContent = 'Calcular';
        KoguApi.toast(e.message, 'error');
      }
    });
  }

  ['fNivel','fEstatus','fScope','fEfos','fFrom','fTo'].forEach(id => $(id).onchange = load);
  $('refreshBtn').onclick = load;

  // Recalcular pendientes (lote de hasta 50 por click)
  $('recalcPendientesBtn').onclick = async () => {
    const btn = $('recalcPendientesBtn');
    if (!confirm('Calcular score de hasta 50 CFDIs sin puntaje aún. ¿Continuar?')) return;
    btn.disabled = true; btn.textContent = 'Procesando...';
    try {
      const res = await KoguApi.apiFetch('/protected/mat/score/recalcular-pendientes', {
        method: 'POST',
        body: JSON.stringify({ batch_limit: 50 }),
      });
      const data = KoguApi.unwrapData(res);
      if (data.procesados === 0 && (!data.errores || data.errores.length === 0)) {
        KoguApi.toast('No hay CFDIs pendientes de score.', 'info');
      } else {
        const errCount = data.errores?.length || 0;
        KoguApi.toast(`Procesados: ${data.procesados} · Errores: ${errCount}. Recargando…`, 'success');
      }
      await load();
    } catch (e) {
      KoguApi.toast(e.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Recalcular pendientes';
    }
  };

  KoguShell.subscribeEmpresaActivaChange(load);
  await load();
});

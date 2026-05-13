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
    <div style="display:flex;gap:8px">
      <button class="btn" id="refreshBtn">Actualizar</button>
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

    $('rows').innerHTML = rows.length ? rows.map(r => {
      const tercero = r.scope === 'RECIBIDO'
        ? `${r.emisor_rfc || ''} · ${r.emisor_nombre || ''}`
        : `${r.receptor_rfc || ''} · ${r.receptor_nombre || ''}`;
      return `
        <tr>
          <td style="font-family:monospace;font-size:11px">${KoguUi.escapeHtml((r.cfdi_uuid || '').slice(0, 8))}…</td>
          <td>${fmtDate(r.fecha_emision)}</td>
          <td>${KoguUi.escapeHtml(r.scope || '')}</td>
          <td>${KoguUi.escapeHtml(tercero)}</td>
          <td>${fmtMoney(r.total, r.moneda)}</td>
          <td style="font-weight:700">${r.score ?? 0}</td>
          <td>${nivelBadge(r.nivel)}</td>
          <td>${estatusBadge(r.estatus_defensa)}</td>
          <td>${efosBadge(r.riesgo_efos)}</td>
          <td><a class="btn" href="/modules/mat/cfdi-materialidad.html?cfdi_id=${encodeURIComponent(r.cfdi_id)}">Abrir</a></td>
        </tr>
      `;
    }).join('') : '<tr><td colspan="10" class="empty">Sin CFDI con score. Ejecuta recalcular desde el detalle de un CFDI.</td></tr>';

    $('meta').textContent = `Total: ${rows.length} CFDI`;
  }

  ['fNivel','fEstatus','fScope','fEfos','fFrom','fTo'].forEach(id => $(id).onchange = load);
  $('refreshBtn').onclick = load;
  KoguShell.subscribeEmpresaActivaChange(load);
  await load();
});

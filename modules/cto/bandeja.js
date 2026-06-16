// ============================================================
// bandeja.js — Costo (cto_): Bandeja de renglones de venta calculados +
// corrección manual de costo (revertir a sistema / fijar manual).
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/cto/bandeja.html';
  const PERM = 'screen.costo';
  const BASE = '/protected/cto';

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Costo — Bandeja / Corrección de costo',
    description: 'Revisa los renglones calculados y corrige a mano el costo de las excepciones (con rastro). Recalcula después para reflejarlas en los KPIs.',
    requiredPermission: PERM,
  });
  if (!b) return;

  const $ = (id) => document.getElementById(id);
  const now = new Date();
  let page = 1, pageSize = 50, totalPages = 1, total = 0;

  const c = document.getElementById('pageContent');
  c.innerHTML = `
<div class="card">
  <div class="row">
    <div><div class="eyebrow">Costo</div><h2>Bandeja / Corrección de costo</h2></div>
    <div style="display:flex;gap:8px;align-items:flex-end">
      <div><label class="muted" style="font-size:12px">Año</label><input type="number" id="anio" class="input" style="width:90px" value="${now.getFullYear()}"/></div>
      <div><label class="muted" style="font-size:12px">Mes</label><input type="number" id="mes" class="input" style="width:70px" min="1" max="12" value="${now.getMonth() + 1}"/></div>
      <button class="btn ghost" id="verCorr">Ver correcciones</button>
      <button class="btn ghost" id="exportar">⬇ Excel</button>
      <button class="btn primary" id="cargar">Cargar</button>
    </div>
  </div>
  <div class="grid-2" style="margin-top:12px;gap:10px">
    <input class="input" id="q" placeholder="Buscar por producto, cliente, lote, folio…"/>
    <div style="display:flex;gap:14px;align-items:center;font-size:13px;flex-wrap:wrap">
      <select class="select" id="nivel" style="width:auto">
        <option value="">Utilidad: todas</option>
        <option value="correcto">🟢 Correcto (≥20%)</option>
        <option value="revisar">🟡 Revisar (10–20%)</option>
        <option value="alerta">🔴 Alerta (&lt;10%)</option>
      </select>
      <select class="select" id="tipoCli" style="width:auto">
        <option value="">Cliente: todos</option>
        <option value="externo">Solo externos</option>
        <option value="interno">Solo internos (Co-Pack)</option>
      </select>
      <label><input type="checkbox" id="soloProd"/> Solo producidos (B)</label>
      <label><input type="checkbox" id="soloManual"/> Solo corregidos</label>
    </div>
  </div>
  <div class="table-wrap" style="margin-top:14px">
    <table>
      <thead><tr>
        <th>Folio</th><th>Cliente</th><th>Producto</th><th>Lote</th>
        <th style="text-align:right">Kg</th><th style="text-align:right">SubTotal</th>
        <th style="text-align:right">Costo MP u.</th><th style="text-align:center">A/B/C</th>
        <th style="text-align:right">Costo Int</th><th style="text-align:right">Utilidad</th>
        <th style="text-align:center">% Util</th>
        <th style="text-align:right;white-space:nowrap">Acción</th>
      </tr></thead>
      <tbody id="rows"><tr><td colspan="12" style="text-align:center;padding:24px;color:var(--muted)">Indica periodo y pulsa Cargar.</td></tr></tbody>
    </table>
  </div>
  <div id="pg" style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;font-size:13px;color:var(--muted)">
    <span id="pgInfo">—</span>
    <span style="display:flex;gap:6px">
      <button class="btn ghost" id="prev">‹</button><button class="btn ghost" id="next">›</button>
    </span>
  </div>
</div>`;

  const fmtMon = (v) => '$' + (Number(v) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtNum = (v) => (Number(v) || 0).toLocaleString('es-MX');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
  const chip = (on, txt, col) => `<span class="chip" style="background:${on ? col + '22' : '#e5e7eb'};color:${on ? col : '#9ca3af'};font-size:10px;padding:1px 5px">${txt}</span>`;
  function pctChip(p) {
    const v = (Number(p) || 0) * 100;
    let bg, col, txt;
    if (v >= 20)      { bg = '#dcfce7'; col = '#166534'; txt = 'Correcto'; }
    else if (v >= 10) { bg = '#fef9c3'; col = '#854d0e'; txt = 'Revisar'; }
    else              { bg = '#fee2e2'; col = '#991b1b'; txt = 'Alerta'; }
    return `<span class="chip" style="background:${bg};color:${col};font-size:11px;white-space:nowrap">${v.toFixed(2)}% · ${txt}</span>`;
  }

  async function load() {
    const anio = parseInt($('anio').value, 10), mes = parseInt($('mes').value, 10);
    if (!anio || !mes) return KoguApi.toast('Indica año y mes.', 'error');
    const p = new URLSearchParams({ anio, mes, page, pageSize });
    if ($('q').value.trim()) p.set('q', $('q').value.trim());
    if ($('soloProd').checked) p.set('solo_producido', 'true');
    if ($('soloManual').checked) p.set('solo_manual', 'true');
    if ($('nivel').value) p.set('nivel_util', $('nivel').value);
    if ($('tipoCli').value) p.set('tipo_cliente', $('tipoCli').value);
    try {
      const res = await KoguApi.apiFetch(`${BASE}/bandeja?${p}`);
      const rows = KoguApi.unwrapData(res) || [];
      const meta = res?.meta || {};
      total = meta.total ?? rows.length; totalPages = meta.totalPages ?? 1; page = meta.page ?? page;
      render(rows);
      $('pgInfo').textContent = total ? `Mostrando página ${page}/${totalPages} · ${fmtNum(total)} renglones` : 'Sin resultados';
      $('prev').disabled = page <= 1; $('next').disabled = page >= totalPages;
    } catch (e) { KoguApi.toast(e.message, 'error'); }
  }

  function render(rows) {
    const tb = $('rows');
    if (!rows.length) { tb.innerHTML = '<tr><td colspan="12" style="text-align:center;padding:24px;color:var(--muted)">Sin renglones.</td></tr>'; return; }
    tb.innerHTML = rows.map(r => `
      <tr${r.costo_manual ? ' style="background:#fef9c3"' : ''}>
        <td style="font-size:12px">${esc((r.serie || '') + ' ' + (r.folio || ''))}</td>
        <td style="font-size:12px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(r.nom_cte)}">${esc(r.nom_cte || '—')}${r.es_interno ? ' <span class="chip" style="background:#e0e7ff;color:#3730a3;font-size:9px;padding:1px 4px">interno</span>' : ''}</td>
        <td style="font-size:12px"><strong>${esc(r.cve_prod)}</strong></td>
        <td style="font-family:monospace;font-size:11px">${esc(r.lote || '—')}</td>
        <td style="text-align:right;font-size:12px">${fmtNum(r.cant_surt)}</td>
        <td style="text-align:right;font-size:12px">${fmtMon(r.subtotal)}</td>
        <td style="text-align:right;font-size:12px">${fmtMon(r.costo_mp)}${r.costo_manual ? ' ✍️' : ''}</td>
        <td style="text-align:center;white-space:nowrap">${chip(r.marca_a,'A','#0ea5e9')}${chip(r.marca_b,'B','#16a34a')}${chip(r.marca_c,'C','#a855f7')}</td>
        <td style="text-align:right;font-size:12px">${fmtMon(r.costo_int_imp)}</td>
        <td style="text-align:right;font-size:12px">${fmtMon(r.utilidad_bruta)}</td>
        <td style="text-align:center">${pctChip(r.utilidad_bruta_pct)}</td>
        <td style="text-align:right;white-space:nowrap">
          ${r.costo_manual
            ? `<button class="btn ghost" data-quitar="${r.venta_id}" style="padding:3px 7px;font-size:11px">Quitar</button>`
            : `<button class="btn ghost" data-corr="${r.venta_id}" data-prod="${esc(r.cve_prod)}" data-sis="${r.costo_sistema_unit ?? ''}" style="padding:3px 7px;font-size:11px">Corregir</button>`}
        </td>
      </tr>`).join('');
    tb.querySelectorAll('button[data-corr]').forEach(btn => btn.addEventListener('click', () => modal(btn.dataset)));
    tb.querySelectorAll('button[data-quitar]').forEach(btn => btn.addEventListener('click', () => quitar(btn.dataset.quitar)));
  }

  function modal(ds) {
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
    ov.innerHTML = `
      <div style="background:#fff;border-radius:8px;max-width:460px;width:100%;padding:22px;box-shadow:0 25px 50px rgba(0,0,0,.3)">
        <div class="eyebrow">Costo</div><h2 style="margin:6px 0 2px">Corregir costo</h2>
        <div class="muted" style="font-size:12px">Producto <strong>${esc(ds.prod)}</strong>. Costo del sistema: ${ds.sis ? fmtMon(ds.sis) : 'N/D'}.</div>
        <div style="margin-top:14px">
          <label class="muted" style="font-size:12px">Tipo de corrección</label>
          <select class="select" id="cmodo">
            <option value="sistema">Revertir al costo del sistema (no producido)</option>
            <option value="manual">Fijar costo unitario manual</option>
          </select>
        </div>
        <div id="cmanualBox" style="margin-top:10px;display:none">
          <label class="muted" style="font-size:12px">Costo unitario ($/kg)</label>
          <input type="number" id="cunit" class="input" step="0.0001" placeholder="0.0000"/>
        </div>
        <div style="margin-top:10px">
          <label class="muted" style="font-size:12px">Motivo (obligatorio)</label>
          <input class="input" id="cmotivo" placeholder="p.ej. producto base distinto, no es producción"/>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:18px">
          <button class="btn ghost" id="ccancel">Cancelar</button>
          <button class="btn primary" id="cok">Aplicar</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    const q = s => ov.querySelector(s);
    q('#cmodo').addEventListener('change', () => q('#cmanualBox').style.display = q('#cmodo').value === 'manual' ? 'block' : 'none');
    const close = () => ov.remove();
    ov.addEventListener('click', e => { if (e.target === ov) close(); });
    q('#ccancel').addEventListener('click', close);
    q('#cok').addEventListener('click', async () => {
      const modo = q('#cmodo').value;
      const motivo = q('#cmotivo').value.trim();
      if (!motivo) return KoguApi.toast('El motivo es obligatorio.', 'error');
      const body = { venta_id: ds.corr, modo, motivo };
      if (modo === 'manual') body.costo_unit = parseFloat(q('#cunit').value);
      try {
        await KoguApi.apiFetch(`${BASE}/correcciones`, { method: 'POST', body: JSON.stringify(body) });
        KoguApi.toast('Corrección aplicada. Recalcula el periodo para reflejarla.', 'success');
        close(); load();
      } catch (e) { KoguApi.toast(e.message, 'error'); }
    });
  }

  async function quitar(ventaId) {
    if (!confirm('¿Quitar la corrección manual de este renglón? El recálculo lo retomará.')) return;
    try {
      await KoguApi.apiFetch(`${BASE}/correcciones/${ventaId}`, { method: 'DELETE' });
      KoguApi.toast('Corrección quitada. Recalcula para reflejarlo.', 'success');
      load();
    } catch (e) { KoguApi.toast(e.message, 'error'); }
  }

  async function verCorrecciones() {
    let rows = [];
    try { rows = KoguApi.unwrapData(await KoguApi.apiFetch(`${BASE}/correcciones`)) || []; }
    catch (e) { return KoguApi.toast(e.message, 'error'); }
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
    const filas = rows.length ? rows.map(r => `<tr>
      <td style="font-size:12px">${r.fecha ? new Date(r.fecha).toLocaleString() : '—'}</td>
      <td style="font-size:12px">${esc(r.cve_prod)}</td><td style="font-family:monospace;font-size:11px">${esc(r.lote_norm || '—')}</td>
      <td style="text-align:right;font-size:12px">${fmtMon(r.costo_original)} → ${fmtMon(r.costo_corregido)}</td>
      <td style="font-size:12px">${esc(r.motivo || '—')}</td><td style="font-size:12px">${esc(r.corregido_por_nombre || '—')}</td></tr>`).join('')
      : '<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--muted)">Sin correcciones.</td></tr>';
    ov.innerHTML = `<div style="background:#fff;border-radius:8px;max-width:820px;width:100%;max-height:80vh;overflow:auto;padding:22px;box-shadow:0 25px 50px rgba(0,0,0,.3)">
      <div style="display:flex;justify-content:space-between"><h2 style="margin:0">Correcciones de costo</h2><button class="btn ghost" id="x">×</button></div>
      <table style="width:100%;margin-top:12px"><thead><tr><th>Fecha</th><th>Producto</th><th>Lote</th><th style="text-align:right">Original → Corregido</th><th>Motivo</th><th>Usuario</th></tr></thead><tbody>${filas}</tbody></table></div>`;
    document.body.appendChild(ov);
    ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
    ov.querySelector('#x').addEventListener('click', () => ov.remove());
  }

  $('cargar').addEventListener('click', () => { page = 1; load(); });
  $('q').addEventListener('input', () => { page = 1; clearTimeout(window.__t); window.__t = setTimeout(load, 350); });
  $('soloProd').addEventListener('change', () => { page = 1; load(); });
  $('soloManual').addEventListener('change', () => { page = 1; load(); });
  $('nivel').addEventListener('change', () => { page = 1; load(); });
  $('tipoCli').addEventListener('change', () => { page = 1; load(); });
  $('verCorr').addEventListener('click', verCorrecciones);
  $('exportar').addEventListener('click', exportar);

  async function exportar() {
    const anio = parseInt($('anio').value, 10), mes = parseInt($('mes').value, 10);
    if (!anio || !mes) return KoguApi.toast('Indica año y mes.', 'error');
    // El Resumen ejecutivo es del MES COMPLETO (segmenta externos/internos
    // y facturas/notas adentro); NO aplica los filtros de la vista.
    const p = new URLSearchParams({ anio, mes });
    try {
      KoguApi.toast('Generando Excel…', 'info');
      const res = await KoguApi.authFetchRaw(`${BASE}/bandeja/export?${p}`);
      if (!res.ok) throw new Error('No se pudo generar el Excel.');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `cto_bandeja_${anio}_${String(mes).padStart(2, '0')}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e) { KoguApi.toast(e.message, 'error'); }
  }
  $('prev').addEventListener('click', () => { if (page > 1) { page--; load(); } });
  $('next').addEventListener('click', () => { if (page < totalPages) { page++; load(); } });
  KoguShell.subscribeEmpresaActivaChange(() => { page = 1; load(); });
});

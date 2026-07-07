// ============================================================
// pedimentos-sat.js — Comercio Exterior (comex_): Pedimentos SAT (Data Stage).
// Sube el zip mensual (.asc), procesa (parseo + matriz FM_ped) y permite
// consultar/descargar la matriz. Base para la reconciliación (Fase 2) y cierre.
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/comex/pedimentos-sat.html';
  const PERM = 'screen.comex.pedimentos';
  const BASE = '/protected/comex/pedimentos';

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Pedimentos SAT (matriz)',
    description: 'Sube el zip mensual del SAT (.asc), arma la matriz de pedimentos y descárgala.',
    requiredPermission: PERM,
  });
  if (!b) return;

  const $ = (id) => document.getElementById(id);
  const c = $('pageContent');
  const money = (v) => '$' + (Number(v) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const n0 = (v) => (Number(v) || 0).toLocaleString('es-MX');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const fdate = (v) => v ? new Date(v).toLocaleString('es-MX') : '';
  const MT = { 1: 'Marítimo', 4: 'Aéreo', 5: 'Aéreo', 7: 'Carretero', 8: 'Ferroviario', 10: 'Ducto', 11: 'Peatonal' };

  c.innerHTML = `
<div class="card">
  <div class="row">
    <div><div class="eyebrow">Comercio Exterior · SAT</div><h2>Pedimentos SAT (matriz)</h2>
      <div class="muted" style="font-size:12px">Sube el zip mensual (archivos .asc: 501, 502, 505, 510, 551, 557, 701). KOGU arma la matriz FM_ped.</div></div>
  </div>
  <div style="display:flex;gap:12px;align-items:flex-end;margin-top:14px;flex-wrap:wrap">
    <div><label class="muted" style="font-size:12px;display:block">Archivo (.zip)</label>
      <input type="file" id="file" accept=".zip" class="input" style="max-width:340px"/></div>
    <div><label class="muted" style="font-size:12px;display:block">Año</label>
      <input type="number" id="anio" class="input" style="width:100px" value="${new Date().getFullYear()}"/></div>
    <div><label class="muted" style="font-size:12px;display:block">Mes</label>
      <input type="number" id="mes" class="input" style="width:80px" min="1" max="12" value="${new Date().getMonth() + 1}"/></div>
    <button class="btn primary" id="procBtn" style="background:#0891b2">📥 Procesar zip</button>
    <span id="proc" class="muted" style="font-size:12px"></span>
  </div>
  <div class="muted" style="font-size:11px;margin-top:6px">El año/mes se detectan del nombre del zip; ajústalos si es necesario.</div>
  <div id="msg" style="display:none;margin-top:12px;padding:10px;border-radius:6px;font-size:13px"></div>
</div>

<div class="card" style="margin-top:14px">
  <div class="row"><h3 style="margin:0">Cargas</h3><span class="muted" style="font-size:12px">historial de matrices por periodo</span></div>
  <div style="overflow-x:auto;margin-top:10px"><table class="table" id="tCargas" style="width:100%;font-size:13px;font-variant-numeric:tabular-nums"></table></div>
</div>

<div class="card" id="matrizCard" style="margin-top:14px;display:none">
  <div class="row"><div><h3 style="margin:0" id="matrizTit">Matriz</h3><span class="muted" style="font-size:12px">vista previa (máx. 500)</span></div>
    <button class="btn ghost" id="dlBtn">⬇ Descargar Excel</button></div>
  <div style="overflow-x:auto;margin-top:10px"><table class="table" id="tMatriz" style="width:100%;font-size:12px;font-variant-numeric:tabular-nums"></table></div>
</div>`;

  function showMsg(html, tipo) {
    const m = $('msg');
    const bg = tipo === 'error' ? '#fee2e2' : tipo === 'warn' ? '#fef9c3' : '#dcfce7';
    const co = tipo === 'error' ? '#991b1b' : tipo === 'warn' ? '#854d0e' : '#166534';
    m.style.cssText = `display:block;margin-top:12px;padding:10px;border-radius:6px;font-size:13px;background:${bg};color:${co}`;
    m.innerHTML = html;
  }

  function statusChip(s) {
    const map = { procesando: ['#fef3c7', '#92400e'], completado: ['#dcfce7', '#166534'], error: ['#fee2e2', '#991b1b'] };
    const m = map[s] || map.procesando;
    return `<span class="chip" style="background:${m[0]};color:${m[1]};font-size:11px;font-weight:800;padding:2px 9px;border-radius:999px">${esc(s)}</span>`;
  }

  let SELCARGA = null;

  // Detecta {anio, mes} del nombre del zip (ej. ..._06_26.zip → 2026-06).
  function detectPer(name) {
    const s = String(name || '');
    let m = s.match(/(\d{4})[_\-](\d{2})/);
    if (m) return { anio: +m[1], mes: +m[2] };
    m = s.match(/_(\d{2})_(\d{2})(?:\D|$)/);
    if (m) return { anio: 2000 + (+m[2]), mes: +m[1] };
    return null;
  }

  async function procesar() {
    const f = $('file').files[0];
    if (!f) return KoguApi.toast('Elige el zip primero.', 'error');
    if (!/\.zip$/i.test(f.name)) return KoguApi.toast('Debe ser un archivo .zip', 'error');
    const anio = parseInt($('anio').value, 10), mes = parseInt($('mes').value, 10);
    if (!anio || !mes || mes < 1 || mes > 12) return KoguApi.toast('Indica año y mes válidos.', 'error');
    const periodo = anio + '-' + String(mes).padStart(2, '0');
    $('procBtn').disabled = true; $('proc').textContent = '⏳ Procesando ' + f.name + '…';
    try {
      const fd = new FormData(); fd.append('archivo', f); fd.append('periodo', periodo);
      const res = await KoguApi.apiFetch(BASE + '/cargar', { method: 'POST', body: fd });
      const d = KoguApi.unwrapData(res) || {};
      showMsg(`✅ Procesado: ${n0(d.n_pedimentos)} pedimentos · ${n0(d.n_staging)} filas (periodo ${esc(d.periodo || '—')}).`, 'ok');
      $('proc').textContent = ''; $('file').value = '';
      await cargarCargas();
      if (d.carga_id) verMatriz(d.carga_id, d.periodo);
    } catch (e) {
      showMsg('❌ ' + e.message, 'error'); $('proc').textContent = '';
    } finally { $('procBtn').disabled = false; }
  }

  async function cargarCargas() {
    const head = `<thead><tr style="border-bottom:2px solid #e2e8f0;text-align:right">
      <th style="text-align:left;padding:7px">Periodo</th><th style="text-align:left;padding:7px">Archivo</th>
      <th>Pedimentos</th><th>Filas</th><th style="text-align:center;padding:7px">Estatus</th>
      <th style="text-align:left;padding:7px">Fecha</th><th></th></tr></thead>`;
    try {
      const rows = KoguApi.unwrapData(await KoguApi.apiFetch(BASE + '/cargas')) || [];
      if (!rows.length) { $('tCargas').innerHTML = head + '<tbody><tr><td colspan="7" style="text-align:center;padding:18px;color:var(--muted)">Sin cargas. Sube un zip.</td></tr></tbody>'; return; }
      $('tCargas').innerHTML = head + '<tbody>' + rows.map(r => `<tr style="border-bottom:1px solid #f1f5f9;text-align:right">
        <td style="text-align:left;padding:7px;font-weight:700">${esc(r.periodo || '—')}</td>
        <td style="text-align:left;padding:7px">${esc(r.archivo_nombre || '')}</td>
        <td style="padding:7px">${n0(r.n_pedimentos)}</td><td style="padding:7px">${n0(r.n_staging)}</td>
        <td style="text-align:center;padding:7px">${statusChip(r.status)}</td>
        <td style="text-align:left;padding:7px">${fdate(r.created_at)}</td>
        <td style="padding:7px;white-space:nowrap">
          <button class="btn ghost" style="padding:2px 8px" data-ver="${r.carga_id}" data-per="${esc(r.periodo || '')}">Ver</button>
          <button class="btn ghost" style="padding:2px 8px;color:#991b1b" data-del="${r.carga_id}">✕</button></td></tr>`).join('') + '</tbody>';
      $('tCargas').querySelectorAll('button[data-ver]').forEach(bn => bn.addEventListener('click', () => verMatriz(bn.dataset.ver, bn.dataset.per)));
      $('tCargas').querySelectorAll('button[data-del]').forEach(bn => bn.addEventListener('click', () => borrar(bn.dataset.del)));
    } catch (e) { KoguApi.toast(e.message, 'error'); }
  }

  async function verMatriz(cargaId, periodo) {
    SELCARGA = { cargaId, periodo };
    try {
      const rows = KoguApi.unwrapData(await KoguApi.apiFetch(BASE + '/matriz?carga_id=' + encodeURIComponent(cargaId))) || [];
      $('matrizCard').style.display = 'block';
      $('matrizTit').textContent = 'Matriz ' + (periodo || '') + ' · ' + n0(rows.length) + ' pedimentos';
      const head = `<thead><tr style="border-bottom:2px solid #e2e8f0;text-align:right">
        <th style="text-align:left;padding:6px">PatPed</th><th style="text-align:left;padding:6px">Op</th>
        <th style="text-align:left;padding:6px">Transporte</th><th>TC</th><th>Peso</th>
        <th>Factura USD</th><th>IGI (arancel)</th><th style="text-align:left;padding:6px">Proveedor</th><th style="text-align:left;padding:6px">Estatus</th></tr></thead>`;
      if (!rows.length) { $('tMatriz').innerHTML = head + '<tbody><tr><td colspan="9" style="text-align:center;padding:16px;color:var(--muted)">Sin pedimentos.</td></tr></tbody>'; return; }
      $('tMatriz').innerHTML = head + '<tbody>' + rows.map(r => `<tr style="border-bottom:1px solid #f1f5f9;text-align:right">
        <td style="text-align:left;padding:6px;font-weight:700">${esc(r.pat_ped || '')}</td>
        <td style="text-align:left;padding:6px">${r.tipo_operacion === '2' ? 'Expo' : 'Impo'}</td>
        <td style="text-align:left;padding:6px">${esc(MT[r.medio_transporte_arribo] || r.medio_transporte_arribo || '—')}</td>
        <td style="padding:6px">${(Number(r.tipo_cambio) || 0).toFixed(4)}</td>
        <td style="padding:6px">${n0(Math.round(r.peso_bruto))}</td>
        <td style="padding:6px">${money(r.factura_usd)}</td>
        <td style="padding:6px">${money(r.igi)}</td>
        <td style="text-align:left;padding:6px">${esc((r.proveedor || '').slice(0, 28))}</td>
        <td style="text-align:left;padding:6px">${esc(r.sustituido || 'Activo')}</td></tr>`).join('') + '</tbody>';
    } catch (e) { KoguApi.toast(e.message, 'error'); }
  }

  async function descargar() {
    if (!SELCARGA) return;
    try {
      KoguApi.toast('Generando Excel…', 'info');
      const res = await KoguApi.authFetchRaw(BASE + '/matriz/export?carga_id=' + encodeURIComponent(SELCARGA.cargaId));
      if (!res.ok) throw new Error('No se pudo generar el Excel.');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `FM_ped_${(SELCARGA.periodo || 'matriz')}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } catch (e) { KoguApi.toast(e.message, 'error'); }
  }

  async function borrar(cargaId) {
    if (!confirm('¿Eliminar esta carga y su matriz?')) return;
    try { await KoguApi.apiFetch(BASE + '/cargas/' + cargaId, { method: 'DELETE' }); KoguApi.toast('Carga eliminada', 'success');
      $('matrizCard').style.display = 'none'; cargarCargas();
    } catch (e) { KoguApi.toast(e.message, 'error'); }
  }

  $('file').addEventListener('change', () => {
    const f = $('file').files[0]; if (!f) return;
    const p = detectPer(f.name);
    if (p) { $('anio').value = p.anio; $('mes').value = p.mes; }
  });
  $('procBtn').addEventListener('click', procesar);
  $('dlBtn').addEventListener('click', descargar);
  KoguShell.subscribeEmpresaActivaChange(() => { $('matrizCard').style.display = 'none'; cargarCargas(); });

  cargarCargas();
});

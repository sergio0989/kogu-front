// ============================================================
// factura.js — Costo (cto_): Ficha de factura + notas.
// Pantalla de revisión: lista de facturas del periodo (izq) y la ficha de
// la factura seleccionada (der) con sus renglones, costo vs referencia,
// la NOTA visible/editable y el check de revisado — todo a la vez.
// Endpoints:
//   GET  /protected/cto/facturas/:anio/:mes?q=
//   GET  /protected/cto/factura/:anio/:mes/:folio
//   POST /protected/cto/revision   { venta_id, revisado?, nota? }
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/cto/factura.html';
  const PERM = 'screen.costo';
  const BASE = '/protected/cto';

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Ficha de factura',
    description: 'Revisa una factura completa con sus renglones, costos y notas en una sola vista.',
    requiredPermission: PERM,
  });
  if (!b) return;

  const $ = (id) => document.getElementById(id);
  const esc = KoguUi.escapeHtml;
  const now = new Date();
  let folioSel = null;

  const fmtMon = (v) => v == null ? '—' : '$' + (Number(v) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtNum = (v) => v == null ? '—' : (Number(v) || 0).toLocaleString('es-MX', { maximumFractionDigits: 3 });
  const fmtPct = (v) => v == null ? '—' : ((Number(v) || 0) * 100).toFixed(2) + ' %';
  const refInfo = (r) => r.ref_prod != null ? { ref: +r.ref_prod, f: 'producción' }
    : r.ref_prodmov != null ? { ref: +r.ref_prodmov, f: 'prod_mov' }
    : r.ref_comp != null ? { ref: +r.ref_comp, f: 'compra' } : { ref: null, f: '—' };

  $('pageContent').innerHTML = `
<div class="card">
  <div class="row">
    <div><div class="eyebrow">Costo</div><h2>Ficha de factura</h2></div>
    <div style="display:flex;gap:8px;align-items:flex-end">
      <div><label class="muted" style="font-size:12px">Año</label><input type="number" id="anio" class="input" style="width:96px" value="${now.getFullYear()}"/></div>
      <div><label class="muted" style="font-size:12px">Mes</label><input type="number" id="mes" class="input" style="width:72px" min="1" max="12" value="${now.getMonth() + 1}"/></div>
      <button class="btn primary" id="cargar">Cargar</button>
    </div>
  </div>
  <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:12px;font-size:13px">
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
    <select class="select" id="fuente" style="width:auto">
      <option value="">Fuente: todas</option>
      <option value="produccion">Producción</option>
      <option value="prod_mov">Producción (mov)</option>
      <option value="compra">Compra</option>
      <option value="sin">Sin fuente</option>
    </select>
    <select class="select" id="revision" style="width:auto">
      <option value="">Revisión: todas</option>
      <option value="true">✓ Revisados</option>
      <option value="false">Pendientes</option>
    </select>
    <label style="display:flex;align-items:center;gap:6px"><input type="checkbox" id="soloProd"/> Solo producidos (B)</label>
    <label style="display:flex;align-items:center;gap:6px"><input type="checkbox" id="soloManual"/> Solo corregidos</label>
  </div>
  <div id="msg" style="display:none;margin-top:12px;padding:10px;border-radius:6px;font-size:13px"></div>
</div>

<div class="grid-2" style="margin-top:16px;gap:16px;grid-template-columns:340px 1fr;align-items:start">
  <div class="card" style="padding:12px">
    <input class="input" id="q" placeholder="Buscar factura o cliente…" style="margin-bottom:10px"/>
    <div id="lista" style="max-height:70vh;overflow:auto"></div>
  </div>
  <div class="card" id="ficha"><div class="muted" style="padding:24px;text-align:center">Selecciona una factura de la izquierda.</div></div>
</div>`;

  function showMsg(html, tipo) {
    const m = $('msg');
    const bg = tipo === 'error' ? '#fee2e2' : tipo === 'warn' ? '#fef9c3' : '#dcfce7';
    const co = tipo === 'error' ? '#991b1b' : tipo === 'warn' ? '#854d0e' : '#166534';
    m.style.cssText = `display:block;margin-top:12px;padding:10px;border-radius:6px;font-size:13px;background:${bg};color:${co}`;
    m.innerHTML = html;
  }

  function pintarLista(facturas) {
    if (!facturas.length) { $('lista').innerHTML = '<div class="muted" style="padding:16px;text-align:center">Sin facturas.</div>'; return; }
    $('lista').innerHTML = facturas.map(f => {
      const pct = Number(f.utilidad_pct) || 0;
      const col = pct >= 0.20 ? '#16a34a' : pct >= 0.10 ? '#ca8a04' : '#dc2626';
      const sel = String(f.folio) === String(folioSel);
      return `<div data-folio="${esc(f.folio)}" style="padding:10px;border-radius:8px;cursor:pointer;margin-bottom:6px;border:1px solid ${sel ? '#0f172a' : '#e2e8f0'};background:${sel ? '#f1f5f9' : '#fff'}">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <strong style="font-size:13px">${esc((f.serie || '') + ' ' + f.folio)}</strong>
          <span style="color:${col};font-weight:700;font-size:12px">${fmtPct(f.utilidad_pct)}</span>
        </div>
        <div class="muted" style="font-size:11px;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(f.nom_cte || '—')}</div>
        <div style="font-size:11px;color:#64748b;margin-top:3px">${fmtMon(f.subtotal)} · ${f.n_renglones} reng.
          ${f.n_notas > 0 ? ` · 📝 ${f.n_notas}` : ''}
          · <span style="color:${f.all_revisado ? '#166534' : '#854d0e'}">${f.n_revisados}/${f.n_renglones} rev.</span></div>
      </div>`;
    }).join('');
    $('lista').querySelectorAll('[data-folio]').forEach(el => el.addEventListener('click', () => { folioSel = el.dataset.folio; cargarFicha(); cargarLista(); }));
  }

  function pintarFicha(rows) {
    if (!rows.length) { $('ficha').innerHTML = '<div class="muted" style="padding:24px;text-align:center">Factura sin renglones.</div>'; return; }
    const h = rows[0];
    const sum = (k) => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
    const sub = sum('subtotal'), ub = sum('utilidad_bruta');
    const head = `
      <div class="row" style="align-items:flex-start">
        <div>
          <div class="eyebrow">Factura</div>
          <h2 style="margin:2px 0">${esc((h.serie || '') + ' ' + h.folio)}</h2>
          <div class="muted" style="font-size:13px">${esc(h.nom_cte || '—')}${h.cve_cte ? ' · cliente ' + esc(h.cve_cte) : ''}${h.fecha_factura ? ' · ' + String(h.fecha_factura).slice(0, 10) : ''}</div>
        </div>
        <div style="text-align:right">
          <div class="muted" style="font-size:12px">Subtotal</div><div style="font-size:20px;font-weight:700">${fmtMon(sub)}</div>
          <div class="muted" style="font-size:12px;margin-top:2px">Utilidad ${fmtMon(ub)} · <strong>${fmtPct(sub ? ub / sub : 0)}</strong></div>
        </div>
      </div>`;
    const filas = rows.map(r => {
      const ri = refInfo(r);
      const sist = r.costo_sistema_unit != null ? Number(r.costo_sistema_unit) : null;
      const dif = (ri.ref && sist != null) ? (sist - ri.ref) / ri.ref : null;
      const difTxt = dif == null ? '—' : (dif * 100).toFixed(1) + '%';
      const difCol = dif == null ? '#9ca3af' : Math.abs(dif) > 0.05 ? '#991b1b' : Math.abs(dif) > 0.02 ? '#854d0e' : '#166534';
      return `<tr style="border-bottom:1px solid #f1f5f9;vertical-align:top">
        <td style="padding:6px;font-size:12px"><strong>${esc(r.cve_prod)}</strong><div class="muted" style="font-size:11px">${esc(r.desc_prod || '')}</div></td>
        <td style="padding:6px;font-family:monospace;font-size:11px">${esc(r.lote || '—')}</td>
        <td style="padding:6px;text-align:right;font-size:12px">${fmtNum(r.cant_surt)}</td>
        <td style="padding:6px;text-align:right;font-size:12px">${fmtMon(r.subtotal)}</td>
        <td style="padding:6px;text-align:right;font-size:12px">${fmtMon(sist)}</td>
        <td style="padding:6px;text-align:right;font-size:12px">${ri.ref != null ? fmtMon(ri.ref) : '—'}<div class="muted" style="font-size:10px">${ri.f}</div></td>
        <td style="padding:6px;text-align:right;font-size:12px;color:${difCol};font-weight:600">${difTxt}</td>
        <td style="padding:6px;text-align:right;font-size:12px">${fmtMon(r.utilidad_bruta)}<div style="font-size:10px;color:#64748b">${fmtPct(r.utilidad_bruta_pct)}</div></td>
        <td style="padding:6px;text-align:center"><input type="checkbox" data-rev="${r.venta_id}" ${r.revisado ? 'checked' : ''} style="width:16px;height:16px;cursor:pointer"/></td>
        <td style="padding:6px;text-align:center" title="Muestra facturada (se excluye de rentabilidad)"><input type="checkbox" data-mtra="${r.venta_id}" ${r.es_muestra ? 'checked' : ''} style="width:16px;height:16px;cursor:pointer"/></td>
        <td style="padding:6px;min-width:220px"><textarea data-nota="${r.venta_id}" rows="2" class="input" style="width:100%;font-size:12px;resize:vertical" placeholder="Nota…">${esc(r.nota || '')}</textarea></td>
      </tr>`;
    }).join('');
    $('ficha').innerHTML = head + `
      <div style="overflow-x:auto;margin-top:12px"><table class="table" style="width:100%;font-size:13px">
        <thead><tr style="text-align:right;border-bottom:2px solid #e2e8f0">
          <th style="text-align:left;padding:6px">Producto</th><th style="text-align:left;padding:6px">Lote</th>
          <th style="padding:6px">Kg</th><th style="padding:6px">SubTotal</th>
          <th style="padding:6px">Costo u. sist.</th><th style="padding:6px">Costo u. ref.</th>
          <th style="padding:6px">Dif. %</th><th style="padding:6px">Utilidad</th>
          <th style="padding:6px;text-align:center">Rev.</th><th style="padding:6px;text-align:center" title="Muestra facturada">Mtra.</th><th style="text-align:left;padding:6px">Nota</th>
        </tr></thead><tbody>${filas}</tbody></table></div>`;
    $('ficha').querySelectorAll('input[data-rev]').forEach(cb => cb.addEventListener('change', () => guardar(cb.dataset.rev, { revisado: cb.checked })));
    $('ficha').querySelectorAll('input[data-mtra]').forEach(cb => cb.addEventListener('change', () => guardar(cb.dataset.mtra, { es_muestra: cb.checked })));
    $('ficha').querySelectorAll('textarea[data-nota]').forEach(ta => ta.addEventListener('change', () => guardar(ta.dataset.nota, { nota: ta.value })));
  }

  async function guardar(ventaId, campos) {
    try {
      await KoguApi.apiFetch(`${BASE}/revision`, { method: 'POST', body: JSON.stringify({ venta_id: ventaId, ...campos }) });
      KoguApi.toast('Guardado', 'success');
      cargarLista(); // refresca contadores de notas/revisados
    } catch (e) { KoguApi.toast(e.message, 'error'); }
  }

  async function cargarLista() {
    const anio = parseInt($('anio').value, 10), mes = parseInt($('mes').value, 10);
    if (!anio || !mes) return;
    const qs = new URLSearchParams(); const q = ($('q').value || '').trim(); if (q) qs.set('q', q);
    if ($('nivel').value) qs.set('nivel_util', $('nivel').value);
    if ($('tipoCli').value) qs.set('tipo_cliente', $('tipoCli').value);
    if ($('fuente').value) qs.set('fuente', $('fuente').value);
    if ($('revision').value) qs.set('revisado', $('revision').value);
    if ($('soloProd').checked) qs.set('solo_producido', 'true');
    if ($('soloManual').checked) qs.set('solo_manual', 'true');
    const res = await KoguApi.apiFetch(`${BASE}/facturas/${anio}/${mes}?${qs}`);
    pintarLista(KoguApi.unwrapData(res) || []);
  }

  async function cargarFicha() {
    if (!folioSel) return;
    const anio = parseInt($('anio').value, 10), mes = parseInt($('mes').value, 10);
    const res = await KoguApi.apiFetch(`${BASE}/factura/${anio}/${mes}/${encodeURIComponent(folioSel)}`);
    pintarFicha(KoguApi.unwrapData(res) || []);
  }

  async function cargar() {
    const anio = parseInt($('anio').value, 10), mes = parseInt($('mes').value, 10);
    if (!anio || !mes) return KoguApi.toast('Indica año y mes.', 'error');
    try {
      $('msg').style.display = 'none';
      await cargarLista();
      if (folioSel) await cargarFicha();
    } catch (e) { showMsg('❌ ' + e.message, 'error'); }
  }

  $('cargar').addEventListener('click', cargar);
  $('anio').addEventListener('change', cargar);
  $('mes').addEventListener('change', cargar);
  ['nivel', 'tipoCli', 'fuente', 'revision', 'soloProd', 'soloManual'].forEach(id =>
    $(id).addEventListener('change', cargarLista));
  let qt; $('q').addEventListener('input', () => { clearTimeout(qt); qt = setTimeout(cargarLista, 300); });
  KoguShell.subscribeEmpresaActivaChange(() => { folioSel = null; cargar(); });

  cargar();
});

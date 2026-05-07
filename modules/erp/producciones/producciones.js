/* KOGU Multiempresa — ERP Producciones / Lotes */
document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/erp/producciones/producciones.html';
  const BASE = '/protected/erp';
  const PERM = 'screen.erp.producciones';

  const b = await KoguShell.initShell({ currentPage: PAGE, title: 'Producciones / Lotes', description: 'Órdenes de producción y trazabilidad de lotes importadas.', requiredPermission: PERM });
  if (!b) return;

  document.getElementById('pageContent').innerHTML = `
<div class="stack" style="gap:20px">

  <!-- KPIs -->
  <div class="card" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px">
    <div class="kpi"><div class="label">Órdenes</div><div class="value" id="kpiTotal">—</div><div class="hint">totales</div></div>
    <div class="kpi"><div class="label">Artículos distintos</div><div class="value" id="kpiArts">—</div><div class="hint">SKUs</div></div>
    <div class="kpi"><div class="label">Cant. total</div><div class="value" id="kpiCant">—</div><div class="hint">unidades</div></div>
    <div class="kpi"><div class="label">Costo fab. total</div><div class="value" id="kpiCosto">—</div><div class="hint">pesos</div></div>
  </div>

  <!-- Filtros + tabla -->
  <div class="card">
    <div class="row">
      <div><div class="eyebrow">Catálogo</div><h2>Órdenes de Producción</h2></div>
      <button class="btn" id="refreshBtn">Actualizar</button>
    </div>
    <div class="grid-2" style="margin-top:14px;gap:10px;grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">
      <input  class="input"  id="q"      placeholder="No. orden / artículo / lote" />
      <input  class="input"  id="añoFil" placeholder="Año (ej. 2024)" maxlength="4" style="width:110px"/>
      <select class="select" id="mesFil">
        <option value="">Todos los meses</option>
        ${['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'].map((m,i)=>`<option value="${i+1}">${m}</option>`).join('')}
      </select>
    </div>
    <div class="table-wrap" style="margin-top:14px">
      <table>
        <thead><tr>
          <th>#</th><th>No. Orden</th><th>Fecha</th><th>Artículo</th><th>Descripción</th>
          <th>Lote</th><th style="text-align:right">Cantidad</th>
          <th style="text-align:right">Rendimiento</th><th style="text-align:right">Costo Fab.</th>
        </tr></thead>
        <tbody id="rows"></tbody>
      </table>
    </div>
    <div id="pager" style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px;align-items:center"></div>
  </div>
</div>`;

  let page = 1;
  const LIMIT = 50;
  const fmt = v => KoguUi.money(v);
  const num = v => Number(v||0).toLocaleString('es-MX',{maximumFractionDigits:2});

  async function load() {
    const qs = new URLSearchParams({ limit: LIMIT, offset: (page-1)*LIMIT });
    const qv = document.getElementById('q').value.trim(); if (qv) qs.set('q', qv);
    const af = document.getElementById('añoFil').value.trim(); if (af) qs.set('año', af);
    const ef = document.getElementById('mesFil').value; if (ef) qs.set('mes', ef);

    try {
      const res   = await KoguApi.apiFetch(`${BASE}/producciones?${qs}`);
      const rows  = KoguApi.unwrapRows(res);
      const total = res?.data?.total ?? rows.length;
      renderKpis(rows);
      renderRows(rows, total);
    } catch(_) {
      document.getElementById('rows').innerHTML = '<tr><td colspan="9" class="empty">No se pudo cargar la información.</td></tr>';
    }
  }

  function renderKpis(rows) {
    const arts  = new Set(rows.map(r=>r.cve_art).filter(Boolean)).size;
    const cant  = rows.reduce((s,r)=>s+Number(r.cantidad||0),0);
    const costo = rows.reduce((s,r)=>s+Number(r.costo_fab||0),0);
    document.getElementById('kpiTotal').textContent = rows.length.toLocaleString();
    document.getElementById('kpiArts').textContent  = arts.toLocaleString();
    document.getElementById('kpiCant').textContent  = num(cant);
    document.getElementById('kpiCosto').textContent = fmt(costo);
  }

  function renderRows(rows, total) {
    document.getElementById('rows').innerHTML = rows.length
      ? rows.map(r => `<tr>
          <td style="color:var(--muted);font-size:12px">${r.id_mov??'-'}</td>
          <td><strong>${KoguUi.escapeHtml(r.no_ordp??'-')}</strong></td>
          <td style="white-space:nowrap">${r.fecha_prod?new Date(r.fecha_prod).toLocaleDateString('es-MX'):'-'}</td>
          <td><span class="chip-compact">${KoguUi.escapeHtml(r.cve_art??'-')}</span></td>
          <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${KoguUi.escapeHtml(r.descripcion??'-')}</td>
          <td><span class="chip-compact">${KoguUi.escapeHtml(r.lote_p??'-')}</span></td>
          <td style="text-align:right">${num(r.cantidad)}</td>
          <td style="text-align:right">${num(r.rendimiento)}</td>
          <td style="text-align:right;font-weight:700">${fmt(r.costo_fab)}</td>
        </tr>`).join('')
      : '<tr><td colspan="9" class="empty">Sin producciones registradas para esta empresa.</td></tr>';

    const pages = Math.ceil(total / LIMIT);
    document.getElementById('pager').innerHTML = pages > 1
      ? `<span style="font-size:12px;color:var(--muted)">${total.toLocaleString()} registros</span>
         <button class="btn" id="prev" ${page<=1?'disabled':''}>‹ Ant.</button>
         <span style="font-size:13px;font-weight:600">${page}/${pages}</span>
         <button class="btn" id="next" ${page>=pages?'disabled':''}>Sig. ›</button>` : '';
    document.getElementById('prev')?.addEventListener('click', ()=>{ page--; load(); });
    document.getElementById('next')?.addEventListener('click', ()=>{ page++; load(); });
  }

  ['añoFil','mesFil'].forEach(id =>
    document.getElementById(id)?.addEventListener('change', ()=>{ page=1; load(); })
  );
  document.getElementById('q').addEventListener('input', ()=>{ page=1; load(); });
  document.getElementById('refreshBtn').onclick = ()=>{ page=1; load(); };
  KoguShell.subscribeEmpresaActivaChange(async ()=>{ page=1; await load(); });
  await load();
});

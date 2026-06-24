// ============================================================
// captura-abc.js — Costo (cto_): Captura manual de gastos ABC (factores).
// Sustituye la importación del archivo AbcHistorico: finanzas captura aquí los
// IMPORTES del periodo y KOGU calcula kilos + factores al Calcular.
// Guarda reutilizando el ingest de factores (POST /protected/cto/cargas/factores)
// con un solo renglón → versiona vigente/histórico y queda registrado.
// Prefill desde GET /protected/cto/factores/:anio/:mes.
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/cto/captura-abc.html';
  const PERM = 'screen.costo';
  const BASE = '/protected/cto';

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Costo — Captura ABC (gastos)',
    description: 'Captura los importes del mes (gastos ABC). KOGU calcula los kilos y los factores al Calcular.',
    requiredPermission: PERM,
  });
  if (!b) return;

  const $ = (id) => document.getElementById(id);
  const now = new Date();
  const fmtMon = (v) => '$' + (Number(v) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const f2 = (v) => (Number(v) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const f4 = (v) => v == null ? '—' : (Number(v) || 0).toLocaleString('es-MX', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  const MES = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

  // Campos de importe: id, etiqueta, cuenta/origen, y si su factor se aplica.
  const CAMPOS = [
    { id: 'importe_a', key: 'ImporteA', lbl: 'Importe A', src: '501-0000 · Gastos tipo A COSTO', tag: 'aplica (Factor A)' },
    { id: 'importe_b', key: 'ImporteB', lbl: 'Importe B', src: 'Total B', tag: 'informativo' },
    { id: 'importe_b_fijo', key: 'ImporteBFijo', lbl: 'Importe B fijo', src: '503-0000 · Gastos indirectos tipo B fijos', tag: 'aplica (Factor B fijo)' },
    { id: 'importe_b_prorrateo', key: 'ImporteBProrrateo', lbl: 'Importe B prorrateo', src: 'Maquila + Gastos Variables', tag: 'informativo' },
    { id: 'importe_c', key: 'ImporteC', lbl: 'Importe C', src: 'Total C', tag: 'informativo' },
    { id: 'importe_d', key: 'ImporteD', lbl: 'Importe D', src: 'opcional', tag: '' },
    { id: 'importe_inventario', key: 'ImporteInventario', lbl: 'Importe inventario', src: 'opcional', tag: '' },
  ];

  const tagChip = (t) => {
    if (!t) return '';
    const aplica = t.startsWith('aplica');
    const c = aplica ? ['#dcfce7', '#166534'] : ['#e5e7eb', '#6b7280'];
    return `<span class="chip" style="background:${c[0]};color:${c[1]};font-size:10px;font-weight:700;padding:1px 6px;margin-left:6px">${t}</span>`;
  };

  const c = document.getElementById('pageContent');
  c.innerHTML = `
<div class="card">
  <div class="row">
    <div><div class="eyebrow">Costo · Captura</div><h2>Captura ABC (gastos)</h2>
      <div class="muted" style="font-size:12px">Captura los importes del mes. KOGU calcula los kilos y factores al Calcular.</div></div>
    <div style="display:flex;gap:8px;align-items:flex-end">
      <div><label class="muted" style="font-size:12px;display:block">Año</label><input type="number" id="anio" class="input" style="width:100px" value="${now.getFullYear()}"/></div>
      <div><label class="muted" style="font-size:12px;display:block">Mes</label><input type="number" id="mes" class="input" style="width:80px" min="1" max="12" value="${now.getMonth() + 1}"/></div>
      <button class="btn ghost" id="cargarBtn">Cargar periodo</button>
    </div>
  </div>
  <div id="msg" style="display:none;margin-top:14px;padding:12px;border-radius:6px;font-size:13px"></div>

  <div class="grid-2" style="margin-top:16px;gap:12px 22px">
    ${CAMPOS.map(f => `<div>
      <label class="muted" style="font-size:12px;display:block">${f.lbl}${tagChip(f.tag)}</label>
      <input type="text" inputmode="decimal" id="${f.id}" class="input" placeholder="0.00"/>
      <div class="muted" style="font-size:11px;margin-top:2px">${f.src}</div>
    </div>`).join('')}
  </div>

  <div style="display:flex;gap:8px;justify-content:flex-end;align-items:center;margin-top:18px">
    <span class="muted" style="font-size:12px;margin-right:auto" id="estadoPeriodo"></span>
    <button class="btn primary" id="guardarBtn">💾 Guardar importes</button>
  </div>
</div>

<div class="card" style="margin-top:16px">
  <div class="muted" style="font-size:13px">
    <strong>¿Cómo funciona?</strong> Aquí solo capturas los <strong>importes</strong> (lo que hoy traes del archivo de finanzas).
    KOGU calcula automáticamente <strong>KilosA</strong> (neto de notas), <strong>KilosB</strong> (producidos),
    <strong>KilosC</strong> (exportación) y <strong>KilosProdB</strong> de tus ventas, y deriva los factores.
    Al costo se aplican <strong>Factor A</strong> y <strong>Factor B fijo</strong>; los demás son informativos.
    Después de guardar, ve a <strong>Costo de ventas / Utilidad</strong> y pulsa <strong>Calcular</strong>.
  </div>
</div>

<div class="card" id="listaCard" style="margin-top:16px">
  <div class="row">
    <div><h3 style="margin:0" id="listaTitulo">Histórico ABC</h3>
      <span class="muted" style="font-size:12px">Importes capturados + kilos y factores calculados (reporte de cierre)</span></div>
    <button class="btn ghost" id="exportBtn">⬇ Excel</button>
  </div>
  <div style="overflow-x:auto;margin-top:10px"><table class="table" id="tablaLista" style="width:100%;font-size:12px;font-variant-numeric:tabular-nums"></table></div>
</div>`;

  function showMsg(html, tipo) {
    const m = $('msg');
    const bg = tipo === 'error' ? '#fee2e2' : tipo === 'warn' ? '#fef9c3' : '#dcfce7';
    const co = tipo === 'error' ? '#991b1b' : tipo === 'warn' ? '#854d0e' : '#166534';
    m.style.cssText = `display:block;margin-top:14px;padding:12px;border-radius:6px;font-size:13px;background:${bg};color:${co}`;
    m.innerHTML = html;
  }

  async function cargarPeriodo() {
    const anio = parseInt($('anio').value, 10), mes = parseInt($('mes').value, 10);
    if (!anio || !mes) return KoguApi.toast('Indica año y mes.', 'error');
    try {
      const res = await KoguApi.apiFetch(`${BASE}/factores/${anio}/${mes}`);
      const f = KoguApi.unwrapData(res);
      CAMPOS.forEach(cmp => { $(cmp.id).value = f && f[cmp.id] != null ? Number(f[cmp.id]).toFixed(2) : ''; });
      if (f) {
        showMsg(`Periodo ${anio}-${String(mes).padStart(2, '0')} ya tiene importes capturados — puedes ajustarlos y volver a guardar.`, 'ok');
        $('estadoPeriodo').textContent = `Última actualización: ${f.updated_at ? new Date(f.updated_at).toLocaleString() : '—'}`;
      } else {
        showMsg(`Periodo ${anio}-${String(mes).padStart(2, '0')} sin importes. Captúralos y guarda.`, 'warn');
        $('estadoPeriodo').textContent = '';
      }
    } catch (e) { KoguApi.toast(e.message, 'error'); }
  }

  async function guardar() {
    const anio = parseInt($('anio').value, 10), mes = parseInt($('mes').value, 10);
    if (!anio || !mes) return KoguApi.toast('Indica año y mes.', 'error');
    const importes = {};
    let alguno = false;
    CAMPOS.forEach(cmp => {
      const raw = String($(cmp.id).value || '').replace(/,/g, '').trim();
      const v = raw === '' ? null : parseFloat(raw);
      if (v != null && isFinite(v)) { importes[cmp.id] = v; alguno = true; }
      else importes[cmp.id] = 0;
    });
    if (!alguno) return KoguApi.toast('Captura al menos un importe.', 'error');
    $('guardarBtn').disabled = true;
    try {
      await KoguApi.apiFetch(`${BASE}/factores/${anio}/${mes}`, { method: 'POST', body: JSON.stringify(importes) });
      showMsg(`✅ Importes guardados para ${anio}-${String(mes).padStart(2, '0')}. Ahora ve a "Costo de ventas / Utilidad" y pulsa Calcular (necesita ventas/producciones/exportación cargadas).`, 'ok');
      KoguApi.toast('Importes guardados', 'success');
      cargarLista();
    } catch (e) {
      showMsg('❌ ' + e.message, 'error');
      KoguApi.toast(e.message, 'error');
    } finally { $('guardarBtn').disabled = false; }
  }

  function pintarLista(rows, anio) {
    $('listaTitulo').textContent = `Histórico ABC ${anio}`;
    const head = `<thead><tr style="border-bottom:2px solid #e2e8f0;text-align:right">
      <th style="text-align:left;padding:6px">Mes</th>
      <th style="padding:6px">Importe A</th><th style="padding:6px">Importe B</th>
      <th style="padding:6px">Imp. B prorr.</th><th style="padding:6px">Importe C</th>
      <th style="padding:6px">Suma</th>
      <th style="padding:6px">Kilos A</th><th style="padding:6px">Kilos B</th>
      <th style="padding:6px">Kilos Prod B</th><th style="padding:6px">Kilos C</th>
      <th style="padding:6px">Factor A</th><th style="padding:6px">Factor B fijo</th>
      <th style="padding:6px">Factor B</th><th style="padding:6px">Factor C</th>
      <th style="padding:6px">Promedio</th></tr></thead>`;
    if (!rows || !rows.length) {
      $('tablaLista').innerHTML = head + '<tbody><tr><td colspan="15" style="text-align:center;padding:18px;color:var(--muted)">Sin periodos capturados para el año.</td></tr></tbody>';
      return;
    }
    const dash = '<span style="color:#cbd5e1">—</span>';
    const body = rows.map(r => {
      const pend = r.factor_a == null; // capturado pero aún sin Calcular
      const kg = (v) => pend ? dash : f2(v);
      const fc = (v) => pend ? dash : f4(v);
      const tag = pend ? ' <span class="chip" style="background:#fef9c3;color:#854d0e;font-size:9px;font-weight:700;padding:1px 5px">pendiente</span>' : '';
      return `<tr style="border-bottom:1px solid #f1f5f9;text-align:right${pend ? ';background:#fffdf5' : ''}">
      <td style="text-align:left;padding:6px;font-weight:600">${MES[Number(r.mes)] || r.mes}${tag}</td>
      <td style="padding:6px">${f2(r.importe_a)}</td><td style="padding:6px">${f2(r.importe_b)}</td>
      <td style="padding:6px">${f2(r.importe_b_prorrateo)}</td><td style="padding:6px">${f2(r.importe_c)}</td>
      <td style="padding:6px;font-weight:600">${f2(r.sum_gastos)}</td>
      <td style="padding:6px">${kg(r.kilos_a)}</td><td style="padding:6px">${kg(r.kilos_b)}</td>
      <td style="padding:6px">${kg(r.kilos_prod_b)}</td><td style="padding:6px">${kg(r.kilos_c)}</td>
      <td style="padding:6px;color:#166534;font-weight:600">${fc(r.factor_a)}</td>
      <td style="padding:6px;color:#166534;font-weight:600">${fc(r.factor_b_fijo)}</td>
      <td style="padding:6px;color:#64748b">${fc(r.factor_b)}</td><td style="padding:6px;color:#64748b">${fc(r.factor_c)}</td>
      <td style="padding:6px">${fc(r.costo_promedio)}</td></tr>`;
    }).join('');
    $('tablaLista').innerHTML = head + '<tbody>' + body + '</tbody>';
  }

  async function cargarLista() {
    const anio = parseInt($('anio').value, 10);
    if (!anio) return;
    try {
      const res = await KoguApi.apiFetch(`${BASE}/factores-lista/${anio}`);
      pintarLista(KoguApi.unwrapData(res) || [], anio);
    } catch (e) { /* lista best-effort */ }
  }

  async function exportarLista() {
    const anio = parseInt($('anio').value, 10);
    if (!anio) return KoguApi.toast('Indica el año.', 'error');
    try {
      KoguApi.toast('Generando Excel…', 'info');
      const res = await KoguApi.authFetchRaw(`${BASE}/factores-lista/${anio}/export`);
      if (!res.ok) throw new Error('No se pudo generar el Excel.');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `cto_abc_${anio}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e) { KoguApi.toast(e.message, 'error'); }
  }

  $('cargarBtn').addEventListener('click', () => { cargarPeriodo(); cargarLista(); });
  $('guardarBtn').addEventListener('click', guardar);
  $('exportBtn').addEventListener('click', exportarLista);
  KoguShell.subscribeEmpresaActivaChange(() => { cargarPeriodo(); cargarLista(); });

  cargarPeriodo();
  cargarLista();
});

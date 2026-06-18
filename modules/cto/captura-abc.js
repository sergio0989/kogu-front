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
      <input type="number" step="0.01" id="${f.id}" class="input" placeholder="0.00"/>
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
      CAMPOS.forEach(cmp => { $(cmp.id).value = f && f[cmp.id] != null ? Number(f[cmp.id]) : ''; });
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
    const row = { anio, mes };
    let alguno = false;
    CAMPOS.forEach(cmp => {
      const v = $(cmp.id).value;
      if (v !== '' && v != null) { row[cmp.key] = Number(v); alguno = true; }
      else row[cmp.key] = 0;
    });
    if (!alguno) return KoguApi.toast('Captura al menos un importe.', 'error');
    $('guardarBtn').disabled = true;
    try {
      const body = { rows: [row], archivo_nombre: `Captura manual ${anio}-${String(mes).padStart(2, '0')}`, anio, mes };
      const res = await KoguApi.apiFetch(`${BASE}/cargas/factores`, { method: 'POST', body: JSON.stringify(body) });
      const d = KoguApi.unwrapData(res) || {};
      if ((d.errores ?? 0) > 0) {
        showMsg(`⚠ Guardado con avisos: ${d.detalle?.[0]?.error || 'revisa los datos.'}`, 'warn');
      } else {
        showMsg(`✅ Importes guardados para ${anio}-${String(mes).padStart(2, '0')}. Ahora ve a "Costo de ventas / Utilidad" y pulsa Calcular.`, 'ok');
        KoguApi.toast('Importes guardados', 'success');
      }
    } catch (e) {
      showMsg('❌ ' + e.message, 'error');
      KoguApi.toast(e.message, 'error');
    } finally { $('guardarBtn').disabled = false; }
  }

  $('cargarBtn').addEventListener('click', cargarPeriodo);
  $('guardarBtn').addEventListener('click', guardar);
  KoguShell.subscribeEmpresaActivaChange(() => cargarPeriodo());

  cargarPeriodo();
});

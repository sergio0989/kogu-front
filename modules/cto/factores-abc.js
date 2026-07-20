// ============================================================
// factores-abc.js — Costo: Factores del ABC (dashboard, solo lectura).
// Muestra los factores/kg que el motor aplica por mes + la composición del
// costo/kg (MP + Factor A + Factor B fijo + Expo) por producto y cliente.
// Un mes solo aparece cuando sus integraciones están capturadas (compuerta).
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/cto/factores-abc.html';
  const PERM = 'screen.cto.factores';
  const BASE = '/protected/cto';

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Factores del ABC · Costo',
    description: 'Factores/kg que el motor aplica por mes y composición del costo por producto y cliente.',
    requiredPermission: PERM,
  });
  if (!b) return;

  const $ = (id) => document.getElementById(id);
  const c = $('pageContent');
  const MES = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const n0 = (v) => (Number(v) || 0).toLocaleString('es-MX', { maximumFractionDigits: 0 });
  const kg = (v) => (Number(v) || 0).toLocaleString('es-MX', { maximumFractionDigits: 0 });
  const f2 = (v) => (v == null ? '—' : '$' + Number(v).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const f4 = (v) => (v == null ? '—' : '$' + Number(v).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 4 }));

  // Componentes de la composición del costo/kg (color + etiqueta).
  const COMP = [
    { k: 'mp', lab: 'Materia prima', co: '#0891b2' },
    { k: 'a', lab: 'Factor A', co: '#7c3aed' },
    { k: 'bfijo', lab: 'Factor B fijo', co: '#f59e0b' },
    { k: 'expo', lab: 'Exportación', co: '#059669' },
  ];

  let D = null, comp = null, dim = 'producto';

  c.innerHTML = `
<div class="card">
  <div class="row">
    <div><div class="eyebrow">Costo · ABC</div><h2 style="margin:0">Factores del ABC aplicados</h2>
      <div class="muted" style="font-size:12px">Factores/kg que el motor usa por mes y de qué se compone el costo. Un mes aparece cuando sus integraciones están <strong>capturadas</strong>.</div></div>
    <div><label class="muted" style="font-size:12px;display:block">Año</label>
      <select id="anio" class="input" style="min-width:110px"></select></div>
  </div>
  <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.04em;margin-top:14px;font-weight:700">Estado de captura del año</div>
  <div id="captura" style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap"></div>
</div>

<div class="card" style="margin-top:14px">
  <div class="row"><div><h3 style="margin:0">Factores por kg (mensual)</h3>
    <span class="muted" style="font-size:12px">Cada factor = importe capturado ÷ kilos base. Un salto suele venir de una caída de kilos — por eso van al lado.</span></div></div>
  <div style="display:flex;gap:18px;flex-wrap:wrap;margin-top:10px;align-items:flex-start">
    <div id="chartFac" style="flex:1 1 360px;min-width:320px;overflow-x:auto"></div>
    <div id="tFac" style="flex:1 1 520px;min-width:460px;overflow-x:auto"></div>
  </div>
</div>

<div class="card" style="margin-top:14px">
  <div class="row">
    <div><h3 style="margin:0">Composición del costo por kg</h3>
      <span class="muted" style="font-size:12px">MP + Factor A + Factor B fijo + Exportación. La rebanada de Exportación llega cuando se finalizan las integraciones de expo del mes.</span></div>
    <div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap">
      <div><label class="muted" style="font-size:12px;display:block">Mes</label><select id="mes" class="input" style="min-width:150px"></select></div>
      <div style="display:flex;gap:6px"><button class="btn" data-dim="producto">Por producto</button><button class="btn" data-dim="cliente">Por cliente</button></div>
    </div>
  </div>
  <div id="leyendaComp" style="display:flex;gap:14px;flex-wrap:wrap;margin-top:10px;font-size:11.5px"></div>
  <div class="muted" id="compInfo" style="font-size:12px;margin-top:6px"></div>
  <div style="overflow-x:auto;margin-top:6px"><table class="table" id="tComp" style="width:100%;font-size:12.5px;font-variant-numeric:tabular-nums"></table></div>
</div>`;

  // ── Estado de captura (compuerta) ──
  function pintaCaptura() {
    const cap = D.capturados || {};
    $('captura').innerHTML = MES.slice(1).map((m, i) => {
      const on = !!cap[i + 1];
      const bg = on ? '#dcfce7' : '#f1f5f9', co = on ? '#166534' : '#94a3b8', bd = on ? '#bbf7d0' : '#e2e8f0';
      return `<span style="background:${bg};color:${co};border:1px solid ${bd};border-radius:8px;padding:4px 10px;font-size:12px;font-weight:700">${on ? '✓' : '○'} ${m}</span>`;
    }).join('');
  }

  // ── Factores por kg: gráfica de líneas + tabla ──
  const FAC = [
    { k: 'factor_a', lab: 'Factor A', co: '#0891b2' },
    { k: 'factor_b_fijo', lab: 'Factor B fijo', co: '#f59e0b' },
    { k: 'factor_c', lab: 'Factor C', co: '#e11d48' },
    { k: 'costo_promedio', lab: 'Costo prom.', co: '#64748b' },
  ];
  function chartFactores(serie) {
    const rows = (serie || []).filter(r => r.capturado);
    if (!rows.length) return '<div class="muted" style="font-size:12px;padding:10px">Sin meses capturados en el año.</div>';
    const W = Math.max(300, Math.min(540, rows.length * 76)), H = 250, padL = 40, padR = 12, padT = 16, padB = 46;
    const iw = W - padL - padR, ih = H - padT - padB, n = rows.length;
    let maxV = 0; rows.forEach(r => FAC.forEach(f => { const v = Number(r[f.k]) || 0; if (v > maxV) maxV = v; })); maxV = maxV || 1;
    const x = (i) => padL + (n === 1 ? iw / 2 : iw * i / (n - 1));
    const y = (v) => padT + ih - (v / maxV) * ih;
    let grid = '', axis = '', lines = '', labels = '';
    for (let g = 0; g <= 3; g++) { const gv = maxV * g / 3, gy = y(gv); grid += `<line x1="${padL}" y1="${gy}" x2="${W - padR}" y2="${gy}" stroke="#f1f5f9"/>`; axis += `<text x="${padL - 5}" y="${gy + 3}" text-anchor="end" font-size="9" fill="#94a3b8">$${gv.toFixed(1)}</text>`; }
    rows.forEach((r, i) => { labels += `<text x="${x(i)}" y="${H - 24}" text-anchor="middle" font-size="10" fill="#64748b">${MES[+r.mes] || r.mes}</text>`; });
    FAC.forEach(f => {
      const pts = rows.map((r, i) => [x(i), y(Number(r[f.k]) || 0)]);
      lines += `<polyline points="${pts.map(p => p.join(',')).join(' ')}" fill="none" stroke="${f.co}" stroke-width="2"/>`;
      lines += pts.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="2.5" fill="${f.co}"/>`).join('');
    });
    const leg = FAC.map(f => `<span style="color:${f.co};font-weight:700;font-size:11px;margin-right:10px">▬ ${f.lab}</span>`).join('');
    return `<div style="margin-bottom:4px">${leg}</div><svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px;height:auto">${grid}${axis}${lines}${labels}</svg>`;
  }
  function tablaFactores(serie) {
    const head = `<thead><tr style="border-bottom:2px solid #e2e8f0;text-align:right">
      <th style="text-align:left;padding:6px">Mes</th><th>Factor A</th><th>Factor B fijo</th><th>Factor C</th><th>Factor B alm.</th><th>Costo prom.</th>
      <th>Kilos A</th><th>Kilos B</th><th>Kilos C</th></tr></thead>`;
    const rows = (serie || []).filter(r => r.capturado);
    if (!rows.length) return head + '<tbody><tr><td colspan="9" style="text-align:center;padding:14px;color:var(--muted)">Sin meses capturados.</td></tr></tbody>';
    return head + '<tbody>' + rows.map(r => `<tr style="border-bottom:1px solid #f1f5f9;text-align:right">
      <td style="text-align:left;padding:6px;font-weight:700">${MES[+r.mes] || r.mes}</td>
      <td style="padding:6px;color:#0e7490;font-weight:700">${f4(r.factor_a)}</td>
      <td style="padding:6px;color:#b45309">${f4(r.factor_b_fijo)}</td>
      <td style="padding:6px;color:#be123c">${f4(r.factor_c)}</td>
      <td style="padding:6px;color:#64748b">${f4(r.factor_b_alm)}</td>
      <td style="padding:6px;font-weight:700">${f4(r.costo_promedio)}</td>
      <td style="padding:6px;color:#475569">${kg(r.kilos_a)}</td>
      <td style="padding:6px;color:#475569">${kg(r.kilos_b)}</td>
      <td style="padding:6px;color:#475569">${kg(r.kilos_c)}</td></tr>`).join('') + '</tbody>';
  }

  // ── Composición del costo/kg ──
  function pintaLeyendaComp() {
    $('leyendaComp').innerHTML = COMP.map(x => `<span><span style="display:inline-block;width:11px;height:11px;border-radius:3px;background:${x.co};vertical-align:-1px"></span> ${x.lab}</span>`).join('');
  }
  function barra(parts, total, w) {
    if (!total) return `<div style="height:16px;background:#f1f5f9;border-radius:4px;width:${w}%"></div>`;
    let acc = '';
    COMP.forEach(x => { const v = parts[x.k] || 0; const pc = v / total * 100; if (pc > 0) acc += `<div title="${x.lab}: ${f4(v / (parts.kg || 1))}/kg" style="height:16px;width:${pc}%;background:${x.co}"></div>`; });
    return `<div style="display:flex;height:16px;border-radius:4px;overflow:hidden;width:${w}%">${acc}</div>`;
  }
  function tablaComp(cp) {
    const rows = (cp && cp.rows) || [];
    const dimLab = cp && cp.dim === 'cliente' ? 'Cliente' : 'Producto';
    const head = `<thead><tr style="border-bottom:2px solid #e2e8f0;text-align:right">
      <th style="text-align:left;padding:6px">${dimLab}</th><th>Kg</th><th style="min-width:170px">Composición</th>
      <th style="color:#0891b2">MP/kg</th><th style="color:#7c3aed">A/kg</th><th style="color:#b45309">B fijo/kg</th><th style="color:#059669">Expo/kg</th>
      <th>Costo/kg</th></tr></thead>`;
    if (!rows.length) return head + '<tbody><tr><td colspan="8" style="text-align:center;padding:16px;color:var(--muted)">Sin datos capturados para el periodo.</td></tr></tbody>';
    const maxCosto = Math.max(...rows.map(r => { const k = Number(r.kg) || 1; return (Number(r.mp_tot) + Number(r.a_tot) + Number(r.bfijo_tot) + Number(r.expo_tot)) / k; }), 0.0001);
    return head + '<tbody>' + rows.map(r => {
      const k = Number(r.kg) || 0;
      const parts = { mp: Number(r.mp_tot) || 0, a: Number(r.a_tot) || 0, bfijo: Number(r.bfijo_tot) || 0, expo: Number(r.expo_tot) || 0, kg: k };
      const tot = parts.mp + parts.a + parts.bfijo + parts.expo;
      const perKg = (v) => k > 0 ? v / k : null;
      const costoKg = k > 0 ? tot / k : 0;
      const w = maxCosto > 0 ? Math.max(6, costoKg / maxCosto * 100) : 6;
      return `<tr style="border-bottom:1px solid #f1f5f9;text-align:right">
        <td style="text-align:left;padding:6px;font-weight:700">${esc(r.nombre || r.grupo)}${r.grupo && r.grupo !== r.nombre ? ` <span style="color:#94a3b8;font-weight:400;font-size:11px">${esc(r.grupo)}</span>` : ''}</td>
        <td style="padding:6px">${kg(k)}</td>
        <td style="padding:6px">${barra(parts, tot, w)}</td>
        <td style="padding:6px;color:#0e7490">${f4(perKg(parts.mp))}</td>
        <td style="padding:6px;color:#7c3aed">${f4(perKg(parts.a))}</td>
        <td style="padding:6px;color:#b45309">${f4(perKg(parts.bfijo))}</td>
        <td style="padding:6px;color:#059669">${f4(perKg(parts.expo))}</td>
        <td style="padding:6px;font-weight:700">${f4(costoKg)}</td></tr>`;
    }).join('') + '</tbody>';
  }

  function pintaComp() {
    document.querySelectorAll('button[data-dim]').forEach(bn => {
      const on = bn.dataset.dim === dim; bn.className = 'btn ' + (on ? 'primary' : 'ghost'); bn.style.background = on ? '#7c3aed' : '';
    });
    const rows = (comp && comp.rows) || [];
    const mesTxt = comp && comp.mes ? (MES[comp.mes] + ' ' + (D ? D.anio : '')) : 'todo el año';
    $('compInfo').textContent = `${n0(rows.length)} ${dim === 'cliente' ? 'cliente(s)' : 'producto(s)'} · ${mesTxt} · costo/kg = MP + A + B fijo + Expo`;
    $('tComp').innerHTML = tablaComp(comp);
  }

  async function cargarComp() {
    const mes = $('mes').value || 0;
    try {
      comp = KoguApi.unwrapData(await KoguApi.apiFetch(BASE + '/factores/' + encodeURIComponent(D.anio) + '/composicion?dim=' + encodeURIComponent(dim) + '&mes=' + encodeURIComponent(mes))) || { rows: [] };
      pintaComp();
    } catch (e) { KoguApi.toast(e.message, 'error'); }
  }

  async function cargar() {
    try {
      const anio = $('anio').value;
      D = KoguApi.unwrapData(await KoguApi.apiFetch(BASE + '/factores' + (anio ? '?anio=' + encodeURIComponent(anio) : ''))) || {};
      const selA = $('anio');
      if (!selA.options.length && (D.anios || []).length) selA.innerHTML = D.anios.map(a => `<option value="${esc(a)}" ${a == D.anio ? 'selected' : ''}>${esc(a)}</option>`).join('');
      if (!(D.anios || []).length) { selA.innerHTML = '<option value="">— sin datos —</option>'; }
      // Mes: Todos + solo meses capturados
      const cap = D.capturados || {};
      $('mes').innerHTML = '<option value="0">Todo el año</option>' + MES.slice(1).map((m, i) => cap[i + 1] ? `<option value="${i + 1}">${m}</option>` : '').join('');
      pintaCaptura();
      $('chartFac').innerHTML = chartFactores(D.serie || []);
      $('tFac').innerHTML = `<table class="table" style="width:100%;font-size:12px;font-variant-numeric:tabular-nums">${tablaFactores(D.serie || [])}</table>`;
      pintaLeyendaComp();
      await cargarComp();
    } catch (e) { KoguApi.toast(e.message, 'error'); }
  }

  $('anio').addEventListener('change', cargar);
  $('mes').addEventListener('change', cargarComp);
  document.querySelectorAll('button[data-dim]').forEach(bn => bn.addEventListener('click', () => { dim = bn.dataset.dim; cargarComp(); }));
  KoguShell.subscribeEmpresaActivaChange(() => { $('anio').innerHTML = ''; cargar(); });
  cargar();
});

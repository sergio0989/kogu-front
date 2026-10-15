// ============================================================
// modules/crm/kpis.js
// CRM · KPIs de actividades de seguimiento. Minuta del 14-oct, punto 2.
//
// Seis indicadores sobre GET /protected/crm/actividades/kpis.
//
// Tres decisiones que la pantalla defiende, y que tienen prueba:
//   · El volumen va en TRES cubetas y jamás en un total. La deriva mide
//     doce meses y la caída un bimestre: sumarlas da un número sin
//     significado (misma regla que RcEngineService.riesgoDe).
//   · La cubeta "sin motivo" se EXPLICA. Son las actividades creadas
//     antes del parche de riesgoBase, que nacieron con riesgo cero. Se
//     muestran para que el subconteo sea visible, y desaparece sola
//     cuando ya no hay ninguna.
//   · El desenlace es CONTEO. `monto_riesgo` es lo que estaba en riesgo
//     al crear, no lo que se recuperó: ese dato no existe, y una tarjeta
//     de "kg recuperados" mentiría.
//
// Prueba: tests/crm-kpis-render.test.mjs
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/crm/kpis.html';
  const BASE = '/protected/crm';

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'KPIs de seguimiento',
    description: 'Cómo se está atendiendo lo que detecta el Radar · CRM.',
    requiredPermission: 'crm.actividades.read',
  });
  if (!b) return;

  const esc = (s) => KoguUi.escapeHtml(s);
  const money = (v) => KoguUi.money(v);
  const nf0 = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 });
  const pct = (v) => (v == null ? '—' : `${(Number(v) * 100).toFixed(v * 100 % 1 ? 1 : 0)}%`);
  const dias = (v) => (v == null ? '—' : `${v} ${v === 1 ? 'día' : 'días'}`);
  const $ = (id) => document.getElementById(id);

  // Periodo por omisión: los últimos 90 días. Es un agregado barato, así
  // que a diferencia de la Consulta de ventas aquí sí conviene cargar al
  // abrir: un tablero que arranca vacío no es un tablero.
  const hoyISO = () => new Date().toISOString().slice(0, 10);
  const haceDias = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

  const card = (lbl, val, hint = '', color = '') => `
    <div style="border:1px solid var(--line);border-radius:12px;padding:12px 14px;min-width:0">
      <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em">${esc(lbl)}</div>
      <div style="font-size:22px;font-weight:800;line-height:1.15;margin-top:2px;${color ? `color:${color}` : ''}">${esc(val)}</div>
      ${hint ? `<div style="font-size:11px;color:var(--muted);margin-top:2px">${hint}</div>` : ''}
    </div>`;

  const ORIGEN_TXT = { 'mi-panel': 'Radar · Mi panel', manual: 'Manual', 'comex-recon': 'Comex' };

  const c = document.getElementById('pageContent');
  c.innerHTML = `
<div class="stack" style="gap:16px">
  <div class="card">
    <div class="row">
      <div><div class="eyebrow">CRM · Indicadores</div><h2>KPIs de seguimiento</h2>
        <div class="hint" style="margin-top:4px;color:var(--muted)">Cómo se está atendiendo lo que detecta el Radar Comercial.</div>
      </div>
    </div>
    <div id="kpiFiltros" style="display:flex;gap:10px;align-items:end;flex-wrap:wrap;margin-top:14px">
      <div><div class="label-text">Desde</div><input class="input" id="kpiDesde" type="date" style="max-width:170px"/></div>
      <div><div class="label-text">Hasta</div><input class="input" id="kpiHasta" type="date" style="max-width:170px"/></div>
      <div><div class="label-text">Origen</div>
        <select class="select" id="kpiOrigen" style="max-width:190px">
          <option value="">Todos los orígenes</option>
          <option value="mi-panel">Radar · Mi panel</option>
          <option value="manual">Manual</option>
          <option value="comex-recon">Comex</option>
        </select>
      </div>
      <div><div class="label-text">Severidad</div>
        <select class="select" id="kpiSev" style="max-width:160px">
          <option value="">Toda severidad</option>
          <option value="critica">Crítica</option>
          <option value="alerta">Alerta</option>
          <option value="info">Info</option>
        </select>
      </div>
    </div>
  </div>
  <div id="kpiCuerpo"></div>
</div>`;

  $('kpiDesde').value = haceDias(90);
  $('kpiHasta').value = hoyISO();

  function pintar(d) {
    const v = d.volumen || {};
    const sinMotivo = (v.sin_motivo && v.sin_motivo.actividades) || 0;

    const origenes = Object.entries(d.creadas.por_origen || {})
      .map(([k, n]) => `${esc(ORIGEN_TXT[k] || k)}: ${n}`).join(' · ') || '—';

    const vencidas = d.pendiente.vencidas || 0;
    const des = d.desenlace || {};

    // Cubetas de volumen. Cada una con su base de tiempo dicha, para que
    // a nadie se le ocurra sumarlas mentalmente.
    const cubeta = (titulo, nota, dato) => `
      <div style="border:1px solid var(--line);border-radius:12px;padding:14px;min-width:0">
        <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em">${esc(titulo)}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:2px">${esc(nota)}</div>
        <div style="font-size:20px;font-weight:800;margin-top:8px">${nf0.format(dato.kg || 0)} kg</div>
        <div style="font-size:13px;color:var(--muted)">${money(dato.mxn || 0)}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:4px">${dato.actividades || 0} actividad${(dato.actividades || 0) === 1 ? '' : 'es'}</div>
      </div>`;

    const vacio = (d.creadas.total || 0) === 0;

    $('kpiCuerpo').innerHTML = `
      <div class="card" style="margin-top:14px">
        <div class="eyebrow" style="margin-bottom:10px">Del ${esc(d.periodo.desde)} al ${esc(d.periodo.hasta)}</div>
        ${vacio ? `<div class="empty">Sin actividades creadas en este periodo. Ajusta las fechas o el origen.</div>` : `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px">
          ${card('Creadas', String(d.creadas.total), origenes)}
          ${card('Pendiente', `${d.pendiente.abiertas + d.pendiente.en_proceso}`,
                 `${d.pendiente.abiertas} abiertas · ${d.pendiente.en_proceso} en proceso`)}
          ${card('Vencidas', String(vencidas), 'fuera de vigencia, exigen acción hoy',
                 vencidas > 0 ? 'var(--danger,#dc2626)' : '')}
          ${card('Tasa de cierre', pct(d.cierre.tasa_cierre),
                 `${d.cierre.cerradas} cerradas de ${d.creadas.total} · ${d.cierre.canceladas} canceladas`)}
          ${card('Desenlace', `${des.recuperado || 0} recuperadas`,
                 `${des.parcial || 0} parcial · ${des.perdido || 0} perdido · ${des.no_aplica || 0} no aplica · ${des.completada || 0} completada`)}
          ${card('Vigencia cumplida', pct(d.vigencia.pct_a_tiempo),
                 `mediana: ${dias(d.vigencia.dias_mediana_cierre)} en cerrar · ${dias(d.vigencia.dias_mediana_tomar)} en tomar`)}
        </div>

        <div class="eyebrow" style="margin:18px 0 8px">Volumen atendido</div>
        <div class="hint" style="color:var(--muted);font-size:12px;margin-bottom:10px">
          Van por separado a propósito: la <b>deriva</b> mide doce meses y la <b>caída</b> un bimestre.
          Sumarlas daría una cifra sin significado.
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px">
          ${cubeta('Caída / dormancia', 'bimestre o ventana sin compra', v.caida_dormancia || {})}
          ${cubeta('Deriva', 'últimos 12 meses vs los 12 previos', v.deriva || {})}
          ${sinMotivo ? cubeta('Sin motivo', 'actividades anteriores al 15-oct: nacieron con riesgo cero', v.sin_motivo) : ''}
        </div>
        ${sinMotivo ? `<div class="hint" style="color:var(--muted);font-size:12px;margin-top:10px">
          Las <b>${sinMotivo}</b> actividades sin motivo se crearon antes de la corrección del 15-oct y quedaron
          registradas en cero. Se muestran aparte para que el subconteo sea visible; esa columna se vacía sola.
        </div>` : ''}
        `}
      </div>`;
  }

  async function consultar() {
    $('kpiCuerpo').innerHTML = '<div class="card" style="margin-top:14px"><div class="empty">Calculando…</div></div>';
    const q = new URLSearchParams();
    q.set('desde', $('kpiDesde').value || haceDias(90));
    q.set('hasta', $('kpiHasta').value || hoyISO());
    if ($('kpiOrigen').value) q.set('origen', $('kpiOrigen').value);
    if ($('kpiSev').value) q.set('severidad', $('kpiSev').value);
    try {
      const res = await KoguApi.apiFetch(`${BASE}/actividades/kpis?${q}`);
      pintar(res?.data || res);
    } catch (err) {
      $('kpiCuerpo').innerHTML =
        `<div class="card" style="margin-top:14px"><div class="empty">${esc(err.message || 'No se pudieron calcular los indicadores.')}</div></div>`;
    }
  }

  ['kpiDesde', 'kpiHasta', 'kpiOrigen', 'kpiSev'].forEach((id) => { $(id).onchange = consultar; });

  await consultar();

  if (KoguShell.subscribeEmpresaActivaChange) KoguShell.subscribeEmpresaActivaChange(consultar);
});

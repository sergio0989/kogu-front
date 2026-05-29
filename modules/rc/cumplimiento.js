document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/rc/cumplimiento.html';
  const BASE = '/protected/rc';
  const PERM = 'screen.ventas.direccion';

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Cumplimiento de agentes',
    description: 'Avance de cada agente contra su meta anual, con ritmo esperado por mes transcurrido · Radar Comercial.',
    requiredPermission: PERM,
  });
  if (!b) return;

  const anioActual = new Date().getFullYear();

  const c = document.getElementById('pageContent');
  c.innerHTML = `
<div class="stack" style="gap:16px">
  <div class="card">
    <div class="row">
      <div>
        <div class="eyebrow">Radar · Gestión</div>
        <h2>Cumplimiento vs meta</h2>
        <div class="hint" id="metaInfo" style="margin-top:4px;color:var(--muted)">—</div>
      </div>
      <div style="display:flex;gap:10px;align-items:center">
        <select class="select" id="anioFil" style="max-width:120px"></select>
        <select class="select" id="ordenFil" style="max-width:200px">
          <option value="ritmo">Ordenar: peor ritmo primero</option>
          <option value="venta">Ordenar: mayor venta</option>
          <option value="avance">Ordenar: menor avance</option>
        </select>
      </div>
    </div>
    <div id="resumen" style="margin-top:14px"></div>
    <div class="table-wrap" style="margin-top:14px">
      <table><thead><tr>
        <th>Agente</th><th>Cartera</th><th style="text-align:right">Meta</th>
        <th style="text-align:right">Actual</th><th style="text-align:right">Avance</th>
        <th style="text-align:right">Esperado</th><th>Ritmo</th>
      </tr></thead><tbody id="rows"></tbody></table>
    </div>
    <div class="hint" style="margin-top:8px;color:var(--muted);font-size:12px">
      La meta se mide en kg si el agente tiene meta de cantidad; si no, en importe. El semáforo compara el avance contra el ritmo esperado (meses transcurridos / 12).
    </div>
  </div>
</div>`;

  const money = v => KoguUi.money(Number(v || 0));
  const sel = id => document.getElementById(id)?.value ?? '';
  const nf0 = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 });
  const fmtBase = (v, base) => base === 'kg' ? `${nf0.format(Number(v || 0))} kg` : money(v);
  const pct = v => v == null ? '—' : `${Math.round(Number(v) * 100)}%`;
  // Tarjeta KPI compacta homologada con todas las pantallas del Radar.
  const miniCard = (lbl, val, hint = '', color = '') => `
    <div style="border:1px solid var(--line);border-radius:10px;padding:9px 12px">
      <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.03em">${KoguUi.escapeHtml(lbl)}</div>
      <div style="font-size:17px;font-weight:800;line-height:1.15;margin-top:1px;${color ? `color:${color}` : ''}">${KoguUi.escapeHtml(val)}</div>
      ${hint ? `<div style="font-size:10px;color:var(--muted)">${KoguUi.escapeHtml(hint)}</div>` : ''}
    </div>`;

  const SEM = {
    verde:    { bg: 'var(--ok,#16a34a)',      txt: 'Al día' },
    amarillo: { bg: 'var(--warning,#d97706)', txt: 'Atención' },
    naranja:  { bg: '#ea580c',                txt: 'Atrasado' },
    rojo:     { bg: 'var(--danger,#dc2626)',  txt: 'Crítico' },
    sin_meta: { bg: 'var(--muted,#64748b)',   txt: 'Sin meta' },
  };
  const semBadge = s => { const m = SEM[s] || SEM.sin_meta; return `<span style="display:inline-block;padding:2px 10px;border-radius:999px;font-size:11px;font-weight:600;color:#fff;background:${m.bg}">${m.txt}</span>`; };
  const SEM_RANK = { rojo: 0, naranja: 1, amarillo: 2, verde: 3, sin_meta: 4 };

  let data = { rows: [] };

  const anioFil = document.getElementById('anioFil');
  anioFil.innerHTML = [anioActual, anioActual - 1, anioActual - 2].map(a => `<option value="${a}">${a}</option>`).join('');
  anioFil.value = String(anioActual);

  async function load() {
    const res = await KoguApi.apiFetch(`${BASE}/cumplimiento?anio=${sel('anioFil') || anioActual}`);
    data = res?.data || res;
    document.getElementById('metaInfo').textContent =
      `Año ${data.anio} · ${data.meses_transcurridos} meses transcurridos (ritmo esperado ${Math.round((data.elapsed_pct || 0) * 100)}%)`;
    render();
  }

  function render() {
    const rows = (data.rows || []).slice();
    const orden = sel('ordenFil');
    if (orden === 'venta') rows.sort((a, b) => b.qty_actual - a.qty_actual);
    else if (orden === 'avance') rows.sort((a, b) => (a.avance ?? 9) - (b.avance ?? 9));
    else rows.sort((a, b) => (SEM_RANK[a.semaforo] - SEM_RANK[b.semaforo]) || ((a.ritmo ?? 9) - (b.ritmo ?? 9)));

    const conMeta = rows.filter(r => r.tiene_meta);
    const enRiesgo = conMeta.filter(r => r.semaforo === 'rojo' || r.semaforo === 'naranja').length;
    const sinMeta = rows.filter(r => !r.tiene_meta).length;
    document.getElementById('resumen').innerHTML = `
      <div class="grid-4" style="gap:10px">
        ${miniCard('Agentes activos', String(rows.length), `${conMeta.length} con meta`)}
        ${miniCard('En riesgo', String(enRiesgo), 'atrasados / críticos', enRiesgo ? 'var(--danger,#dc2626)' : '')}
        ${miniCard('Sin meta', String(sinMeta), 'capturar presupuesto')}
        ${miniCard('Al día', String(conMeta.filter(r => r.semaforo === 'verde').length), 'cumpliendo ritmo', 'var(--ok,#16a34a)')}
      </div>`;

    document.getElementById('rows').innerHTML = rows.length ? rows.map(r => {
      const avColor = r.semaforo === 'rojo' ? 'var(--danger,#dc2626)' : (r.semaforo === 'verde' ? 'var(--ok,#16a34a)' : 'inherit');
      return `<tr>
        <td>
          <div style="font-weight:600">${KoguUi.escapeHtml(r.agente_nombre)}</div>
          <div style="font-size:11px;color:var(--muted)">cve ${r.cve_agente} · ${r.tipo_agente}</div>
        </td>
        <td><span class="badge neutral">${r.cartera}</span> <span style="font-size:11px;color:var(--muted)">${r.clientes_activos} activos</span></td>
        <td style="text-align:right">${r.tiene_meta ? fmtBase(r.meta, r.base) : '—'}</td>
        <td style="text-align:right">${fmtBase(r.actual, r.base || 'kg')}</td>
        <td style="text-align:right;font-weight:700;color:${avColor}">${r.tiene_meta ? pct(r.avance) : '—'}</td>
        <td style="text-align:right;color:var(--muted)">${r.tiene_meta ? fmtBase(r.esperado, r.base) : '—'}</td>
        <td>${semBadge(r.semaforo)}${r.tiene_meta && r.faltante_ritmo > 0 ? `<div style="font-size:11px;color:var(--muted);margin-top:2px">faltan ${fmtBase(r.faltante_ritmo, r.base)}</div>` : ''}</td>
      </tr>`;
    }).join('') : '<tr><td colspan="7" class="empty">Sin agentes</td></tr>';
  }

  document.getElementById('anioFil').onchange = load;
  document.getElementById('ordenFil').onchange = render;
  KoguShell.subscribeEmpresaActivaChange(load);
  await load();
});

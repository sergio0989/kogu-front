// ============================================================
// modules/cob/mis-vencidas/mis-vencidas.js
// Cobranza · portal de agentes: "Mis clientes · Vencidas" (solo consulta).
//   GET /protected/cob/portal-agentes/mis-vencidas
// El agente ve las facturas vencidas de SUS clientes (agente vigente del
// catálogo KOGU) que Cuentas por cobrar autorizó, del último corte aplicado.
// El servidor resuelve empresa, usuario y alcance; aquí solo se pinta.
// Decisiones 24-nov-2026: claude/cobranza-portal-agentes.md
// Prueba: tests/cob-mis-vencidas.test.mjs
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/cob/mis-vencidas/mis-vencidas.html';
  const API = '/protected/cob/portal-agentes/mis-vencidas';
  const C = window.CobComun;

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Mis clientes · Vencidas',
    description: 'Facturas vencidas de tus clientes que Cuentas por cobrar te pidió apoyar.',
    requiredPermission: 'cob.portal_agentes.read',
  });
  if (!b) return;

  const esc = (s) => KoguUi.escapeHtml(s);
  const $ = (id) => document.getElementById(id);
  const cont = $('pageContent');
  const plural = (n, a, p) => `${n} ${n === 1 ? a : p}`;
  const MONEDAS = ['USD', 'MXN'];

  estilos();

  async function cargar() {
    cont.innerHTML = '<div class="card cobmv-muted">Cargando tus facturas…</div>';
    let d;
    try {
      const r = await KoguApi.apiFetch(API);
      d = r && r.data !== undefined ? r.data : r;
    } catch (e) {
      if (e && e.code === 'COB_PORTAL_SIN_AGENTE') {
        cont.innerHTML = `<div class="card"><div class="eyebrow">Mis clientes · Vencidas</div>
          <p>${esc(e.message || 'Tu usuario no está ligado a un agente comercial en esta empresa.')}</p>
          <p class="cobmv-muted">Pide a Cuentas por cobrar o al administrador que liguen tu usuario a tu clave de agente (Comercial › Agentes comerciales).</p></div>`;
        return;
      }
      cont.innerHTML = `<div class="card"><p class="cobmv-err">${esc((e && e.message) || 'No se pudieron cargar tus facturas.')}</p></div>`;
      return;
    }
    pintar(d || {});
  }

  function pintar(d) {
    if (!d.corte) {
      cont.innerHTML = '<div class="card"><div class="eyebrow">Mis clientes · Vencidas</div><p>Todavía no hay un corte de cartera cargado en esta empresa.</p></div>';
      return;
    }
    const facturas = Array.isArray(d.facturas) ? d.facturas : [];
    const cabecera = `<div class="eyebrow">Saldos al ${C.fmtFecha(d.corte.fecha_corte)} según el último corte de cartera</div>
      <div class="cobmv-agente">Agente: <b>${esc((d.agente && d.agente.nombre) || '')}</b></div>`;
    if (!facturas.length) {
      cont.innerHTML = `<div class="card">${cabecera}<p style="margin-top:12px">No hay facturas vencidas para mostrar. Aquí aparecen las que Cuentas por cobrar te pida apoyar con tus clientes.</p></div>`;
      return;
    }

    // Agrupa por cliente; el de mayor saldo (USD, luego MXN) primero.
    const porCliente = new Map();
    for (const f of facturas) {
      const k = f.cve_cte || f.cliente;
      if (!porCliente.has(k)) porCliente.set(k, { cliente: f.cliente, docs: [], tot: {} });
      const g = porCliente.get(k);
      g.docs.push(f);
      g.tot[f.moneda] = (g.tot[f.moneda] || 0) + Number(f.saldo || 0);
    }
    const grupos = [...porCliente.values()].sort((a, z) => (z.tot.USD || 0) - (a.tot.USD || 0) || (z.tot.MXN || 0) - (a.tot.MXN || 0));
    grupos.forEach((g) => g.docs.sort((a, z) => (z.dias_vencido || 0) - (a.dias_vencido || 0)));

    const tot = d.totales || {};
    const monedas = MONEDAS.filter((m) => Number(tot[m]) > 0);
    const kpis = monedas.map((m) => `<div class="cobmv-kpi"><div class="l">Vencido ${m}</div><div class="v">${m} ${C.numero(tot[m])}</div></div>`).join('');
    const totGrupo = (g) => MONEDAS.filter((m) => g.tot[m]).map((m) => `${m} ${C.numero(g.tot[m])}`).join(' · ');
    const seg = (f) => {
      const s = f.seguimiento;
      if (!s) return '<span class="cobmv-muted">—</span>';
      return `<div><b>${esc(s.accion)}</b> · ${C.fmtFecha(s.fecha)}</div>${s.texto ? `<div class="cobmv-muted">${esc(s.texto)}</div>` : ''}${s.compromiso ? `<div class="cobmv-muted">Compromiso ${C.fmtFecha(s.compromiso)}</div>` : ''}`;
    };
    const filas = grupos.map((g) => `<tr class="g"><td colspan="5">${esc(g.cliente)} · ${plural(g.docs.length, 'factura', 'facturas')}</td><td class="num">${totGrupo(g)}</td><td></td></tr>`
      + g.docs.map((f) => `<tr class="r"><td><b>${esc(C.folioDe(f))}</b></td><td>${C.fmtFecha(f.fecha_doc)}</td><td>${C.fmtFecha(f.fecha_vencimiento)}</td>
          <td class="num"><b class="cobmv-rojo">${Number(f.dias_vencido) || 0}</b></td><td>${esc(f.moneda)}</td><td class="num">${C.numero(f.saldo)}</td><td class="cobmv-seg">${seg(f)}</td></tr>`).join('')).join('');

    cont.innerHTML = `
<div class="stack" style="gap:16px">
  <div class="card">
    ${cabecera}
    <div class="cobmv-kpis" id="cobMvTotales">${kpis}<div class="cobmv-kpi"><div class="l">Facturas</div><div class="v cobmv-chico">${plural(facturas.length, 'factura', 'facturas')} · ${plural(grupos.length, 'cliente', 'clientes')}</div></div></div>
  </div>
  <div class="card">
    <div class="cobmv-scroll"><table class="cobmv-tbl" id="cobMvTabla">
      <thead><tr><th>Factura</th><th>Fecha</th><th>Vence</th><th class="num">Días vencida</th><th>Moneda</th><th class="num">Saldo</th><th>Último seguimiento de CxC</th></tr></thead>
      <tbody>${filas}</tbody>
    </table></div>
    <div class="cobmv-muted" style="margin-top:10px;font-size:12px">Los saldos son los del corte; si el cliente ya pagó después, Cuentas por cobrar lo verá en el siguiente corte.</div>
  </div>
</div>`;
  }

  function estilos() {
    if (document.getElementById('cobmv-css')) return;
    const st = document.createElement('style');
    st.id = 'cobmv-css';
    st.textContent = `
.cobmv-muted{color:var(--muted)}
.cobmv-err{color:var(--danger,#dc2626);font-weight:600}
.cobmv-rojo{color:#b91c1c}
.cobmv-agente{margin-top:6px;font-size:14px}
.cobmv-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-top:14px}
.cobmv-kpi{border:1px solid var(--line);border-left:3px solid #b91c1c;border-radius:12px;padding:12px 14px;background:#fff}
.cobmv-kpi:last-child{border-left-color:#64748b}
.cobmv-kpi .l{font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}
.cobmv-kpi .v{font-size:20px;font-weight:800;margin-top:2px}
.cobmv-kpi .v.cobmv-chico{font-size:15px}
.cobmv-scroll{overflow:auto;border:1px solid var(--line);border-radius:10px}
.cobmv-tbl{width:100%;border-collapse:collapse;font-size:13px}
.cobmv-tbl th{background:#f8fafc;text-align:left;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);padding:10px;border-bottom:1px solid var(--line);white-space:nowrap}
.cobmv-tbl td{padding:9px 10px;border-bottom:1px solid var(--line);vertical-align:top}
.cobmv-tbl tr.g td{background:#f8fafc;font-weight:700}
.cobmv-tbl .num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.cobmv-seg{min-width:200px;max-width:300px;font-size:12px;line-height:1.35}`;
    document.head.appendChild(st);
  }

  if (KoguShell.subscribeEmpresaActivaChange) KoguShell.subscribeEmpresaActivaChange(() => cargar());
  cargar();
});

/* KOGU · Comercio Exterior — regla de control vs teórico (lógica pura).
 * Probada con: node --test tests/comex-control.test.mjs
 * En el navegador queda en window.KoguComexControl (Resumen y Análisis).
 *
 * · Bandas: dentro ≤10 % · fuera ≤30 % · revisar >30 %. El estado no sigue al signo:
 *   una desviación grande —favorable o no— es señal a revisar, no un logro.
 * · MP (mercancía) se compara solo en líneas del producto del costeo (base kgMp).
 *   Flete + gastos nacionales sobre toda la operación con teórico (base kg).
 * · DDP/kg = MP/kg + gastos/kg. Tiene estado solo si la MP comparable cubre
 *   ≥ UMBRAL_COB_MP de los kg; debajo es 'parcial': una muestra mínima de
 *   mercancía no decide el estado de todo el grupo. La señal de la MP se
 *   reporta aparte (mp.desv / mp.estado) con su propia base.
 */
(function (root) {
  const api = {};
  api.UMBRAL_COB_MP = 0.5;

  api.estado = (d) => {
    if (d == null || !Number.isFinite(d)) return null;
    const a = Math.abs(d);
    return a <= 0.10 ? 'dentro' : a <= 0.30 ? 'fuera' : 'revisar';
  };

  const num = (v) => Number(v) || 0;

  api.control = ({ kg, kgMp, mpReal, mpTeo, gastosReal, gastosTeo }) => {
    kg = num(kg); kgMp = num(kgMp);
    const vacio = (motivo) => ({ cobMp: 0, mp: null, ddp: { real: null, teo: null, desv: null, estado: null, motivo } });
    if (!(kg > 0)) return vacio('sin_teorico');
    if (!(kgMp > 0)) return vacio('mp_sin_teorico');

    const cobMp = Math.min(kgMp / kg, 1);
    const mpR = num(mpReal) / kgMp, mpT = num(mpTeo) / kgMp;
    const mpDesv = mpT > 0 ? mpR / mpT - 1 : null;
    const mp = { real: mpR, teo: mpT, desv: mpDesv, estado: api.estado(mpDesv), kg: kgMp };

    const real = mpR + num(gastosReal) / kg, teo = mpT + num(gastosTeo) / kg;
    const desv = teo > 0 ? real / teo - 1 : null;
    const parcial = cobMp < api.UMBRAL_COB_MP;
    return {
      cobMp, mp,
      ddp: { real, teo, desv, estado: parcial ? 'parcial' : api.estado(desv), motivo: parcial ? 'mp_parcial' : null },
    };
  };

  // Cuenta operaciones por estado sobre una desviación (por omisión
  // desv_total_pct = gastos vs teórico de la reconciliación). Conserva cuántas
  // van sobre y cuántas bajo: el estado no sigue al signo, pero el dato no se pierde.
  api.contarEstados = (rows, campo = 'desv_total_pct') => {
    const out = { dentro: { n: 0, sobre: 0, bajo: 0 }, fuera: { n: 0, sobre: 0, bajo: 0 }, revisar: { n: 0, sobre: 0, bajo: 0 } };
    for (const r of rows || []) {
      const v = r[campo];
      if (v == null || v === '') continue;
      const d = Number(v), e = api.estado(d);
      if (!e) continue;
      out[e].n++;
      if (d > 0) out[e].sobre++; else if (d < 0) out[e].bajo++;
    }
    return out;
  };

  // Estado de una fila de reconciliación: si se midió contra el teórico, su
  // estado por desviación de gastos; si no, el motivo (SinTeorico/SinProveedor/
  // SinDatos). El 'resultado' guardado (banda ±5 %) ya no decide el estado.
  const MOTIVOS = ['SinTeorico', 'SinProveedor', 'SinDatos'];
  api.estadoRecon = (r) => {
    if (r && MOTIVOS.includes(r.resultado)) return r.resultado;
    const v = r ? r.desv_total_pct : null;
    const e = (v == null || v === '') ? null : api.estado(Number(v));
    return e || 'SinDatos';
  };

  // Estado de gastos cuando la fila trae importes (real y teórico en USD) y no
  // desv_total_pct: partidas y detalle por operación de Análisis.
  api.estadoGastos = ({ resultado, real, teo } = {}) => {
    if (MOTIVOS.includes(resultado)) return resultado;
    const t = Number(teo);
    if (teo == null || teo === '' || !(t > 0) || real == null || real === '') return 'SinDatos';
    return api.estado(Number(real) / t - 1);
  };

  // Chip de estado (mismos colores en Resumen, Análisis, Costeo y Reconciliación).
  const COLORES = {
    dentro: ['#f0fdf4', '#bbf7d0', '#166534', 'dentro'],
    fuera: ['#fef9c3', '#fde68a', '#854d0e', 'fuera'],
    revisar: ['#fef2f2', '#fecaca', '#991b1b', 'revisar'],
    parcial: ['#f8fafc', '#e2e8f0', '#64748b', 'MP parcial'],
  };
  api.color = (est) => { const c = COLORES[est] || ['#f8fafc', '#e2e8f0', '#64748b', 's/d']; return { bg: c[0], bd: c[1], co: c[2], t: c[3] }; };
  api.chip = (est, title = '') => {
    const c = api.color(est);
    return `<span${title ? ` title="${String(title).replace(/"/g, '&quot;')}"` : ''} style="background:${c.bg};color:${c.co};border:1px solid ${c.bd};font-size:11px;font-weight:700;padding:1px 8px;border-radius:999px;white-space:nowrap">${c.t}</span>`;
  };
  api.pct = (d) => { if (d == null) return '—'; const p = d * 100; if (Math.abs(p) < 0.05) return '0.0%'; return (p > 0 ? '+' : '') + p.toFixed(1) + '%'; };

  // Vista simple de Análisis: GASTOS (flete int'l + nacionales) real vs teórico,
  // sobre los kg con teórico — mismo criterio que Reconciliación y Resumen.
  // Agregado = Σ gastos ÷ Σ kg (ponderado por kg). El estado no sigue al signo;
  // el signo se conserva ('sobre' / 'bajo'). Sin teórico = kg sin teórico y su %.
  api.filaGastos = (r = {}) => {
    const kg = num(r.kg), kgCmp = num(r.kg_cmp);
    const sinTeoKg = Math.max(kg - kgCmp, 0);
    const sinTeoPct = kg > 0 ? sinTeoKg / kg : 0;
    const teoTot = num(r.teo_flete) + num(r.teo_otros);
    if (!(kgCmp > 0) || !(teoTot > 0)) {
      return { kg, kgCmp, real: null, teo: null, desv: null, estado: null, signo: null, motivo: 'sin_teorico', sinTeoKg, sinTeoPct };
    }
    const real = num(r.gastos_real_cmp) / kgCmp, teo = teoTot / kgCmp;
    const desv = real / teo - 1;
    return { kg, kgCmp, real, teo, desv, estado: api.estado(desv), signo: desv > 0 ? 'sobre' : desv < 0 ? 'bajo' : null, motivo: null, sinTeoKg, sinTeoPct };
  };

  // Orden de la vista simple: revisar → fuera → dentro → sin teórico; dentro de
  // cada estado, por kg (lo que más pesa primero). No modifica el arreglo.
  const RANGO = { revisar: 0, fuera: 1, dentro: 2 };
  api.ordenarControl = (rows) => (rows || []).map((r) => ({ r, g: api.filaGastos(r) }))
    .sort((a, b) => ((RANGO[a.g.estado] ?? 3) - (RANGO[b.g.estado] ?? 3)) || (b.g.kg - a.g.kg))
    .map((x) => x.r);

  // Opciones del selector de periodo de Análisis. Solo se elige un periodo con
  // operaciones analizables (n_analizable > 0); los demás se muestran
  // deshabilitados con su motivo. Acumulado solo si alguno es analizable.
  // Si el back aún no manda n_analizable, todo queda habilitado (como antes).
  api.opcionesPeriodo = (rows) => {
    const n = (v) => (Number(v) || 0).toLocaleString('es-MX');
    const lista = rows || [];
    const conDato = lista.some((r) => r && r.n_analizable != null);
    const ops = lista.map((r) => {
      const ped = `${n(r.n_pedimentos)} pedimentos`;
      if (!conDato) return { value: r.periodo, label: `${r.periodo} · ${ped}`, disabled: false };
      if (Number(r.n_analizable) > 0) return { value: r.periodo, label: `${r.periodo} · ${n(r.n_analizable)} ops reconciliadas · ${ped}`, disabled: false };
      const motivo = Number(r.n_reconciliado) > 0 ? 'sin datos analizables' : 'sin reconciliar';
      return { value: r.periodo, label: `${r.periodo} · ${motivo} · ${ped}`, disabled: true };
    });
    const hayAnalizable = ops.some((o) => !o.disabled);
    return hayAnalizable ? [{ value: 'ACUM', label: '📊 Acumulado (todos los periodos)', disabled: false }, ...ops] : ops;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KoguComexControl = api;
})(typeof window !== 'undefined' ? window : globalThis);

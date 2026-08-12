/* ============================================================
   KOGU Multiempresa — Radar Comercial · Presupuesto (PP)
   Pantalla: /modules/rc/presupuesto.html
   Permiso:  screen.ventas.direccion

   Versión extendida del bloque "Cumplimiento vs PP" del Tablero.
   El Tablero conserva su versión resumida a propósito: ahí se ve el
   pulso sin salir; aquí se trabaja el detalle.

   Fuente única: GET /protected/rc/pp?anio= (uno por ejercicio).
   ============================================================ */
document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/rc/presupuesto.html';
  const BASE = '/protected/rc';
  const PERM = 'screen.ventas.direccion';

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Presupuesto (PP)',
    description: 'Presupuesto anual por sublínea contra la venta real, con comparativo entre ejercicios · Radar Comercial.',
    requiredPermission: PERM,
  });
  if (!b) return;

  // ── Estado ────────────────────────────────────────────────────────────────
  let anio  = null;
  let anios = [];
  let pp    = null;                 // payload del año seleccionado
  const cache = new Map();          // anio -> payload (evita repedir al comparar)
  let compAbierto = false;          // el comparativo se carga al abrirse, no al entrar
  let compCargando = false;
  let filtro = '';
  let orden  = { col: 'pp', dir: 'desc' };

  // Métrica compartida con el resto del Radar (misma llave que el Tablero).
  let metrica = localStorage.getItem('kogu:rc-metrica') || 'cantidad';
  const esDinero = () => metrica === 'dinero';

  // ── Helpers de formato (homologados con tablero.js) ───────────────────────
  const nf0   = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 });
  const money = v => KoguUi.money(Number(v || 0));
  const moneyC = v => {
    const n = Number(v || 0), abs = Math.abs(n);
    if (abs >= 1e6) {
      const m = Math.trunc(n / 1e3) / 1e3;
      return `$${m.toLocaleString('es-MX', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} M`;
    }
    return money(n);
  };
  const fmtVal  = v => esDinero() ? money(v) : `${nf0.format(Number(v || 0))} kg`;
  const fmtValC = v => esDinero() ? moneyC(v) : `${nf0.format(Number(v || 0))} kg`;
  const pct0  = v => (v == null ? '—' : `${(Number(v) * 100).toFixed(0)}%`);
  const pct1  = v => (v == null ? '—' : `${(Number(v) * 100).toFixed(1)}%`);
  const esc   = s => KoguUi.escapeHtml(String(s ?? ''));

  const ppVal      = o => esDinero() ? Number(o.ventas_pp   || 0) : Number(o.kg_pp   || 0);
  const realVal    = o => esDinero() ? Number(o.ventas_real || 0) : Number(o.kg_real || 0);
  const realMapVal = o => esDinero() ? Number(o.ventas_real_mapeado || 0) : Number(o.kg_real_mapeado || 0);
  const avVal      = o => { const p = ppVal(o); return p ? realVal(o) / p : null; };

  const semColor = (av, ritmo) => {
    if (av == null || !ritmo) return 'var(--muted,#64748b)';
    const r = av / ritmo;
    return r >= 0.95 ? 'var(--success,#16a34a)' : r >= 0.8 ? 'var(--warning,#d97706)' : 'var(--danger,#dc2626)';
  };
  const miniCard = (lbl, val, hint = '', color = '') => `
    <div style="border:1px solid var(--line);border-radius:10px;padding:9px 12px">
      <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.03em">${esc(lbl)}</div>
      <div style="font-size:17px;font-weight:800;line-height:1.15;margin-top:1px;${color ? `color:${color}` : ''}">${esc(val)}</div>
      ${hint ? `<div style="font-size:10px;color:var(--muted)">${esc(hint)}</div>` : ''}
    </div>`;

  // ── Layout ────────────────────────────────────────────────────────────────
  document.getElementById('pageContent').innerHTML = `
<div class="stack" style="gap:16px">

  <div class="card">
    <div class="row" style="align-items:flex-start">
      <div>
        <div class="eyebrow">Radar · Presupuesto</div>
        <h2 id="tituloPp" style="margin:0">Cumplimiento vs PP</h2>
        <div id="subPp" class="hint" style="margin-top:4px;color:var(--muted);font-size:12px"></div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <select class="select" id="anioSel" style="min-width:110px"></select>
        <div class="tabs" id="metricaTabs">
          <button class="tab" data-m="cantidad">kg</button>
          <button class="tab" data-m="dinero">MXN</button>
        </div>
        <button class="btn" id="exportBtn" title="Descargar el detalle y el comparativo en Excel">⬇ Exportar</button>
      </div>
    </div>
    <div id="cards" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin-top:14px"></div>
    <div id="barra"></div>
  </div>

  <div class="card">
    <div class="row" style="align-items:flex-start">
      <div>
        <div class="eyebrow">Detalle</div>
        <h3 style="margin:2px 0 0">Categorías y sublíneas</h3>
        <div class="hint" style="color:var(--muted);font-size:12px;margin-top:2px">
          Todo desplegado. Clic en los encabezados para ordenar.
        </div>
      </div>
      <input class="input" id="qFil" placeholder="Buscar categoría, clave o sublínea…" style="min-width:260px"/>
    </div>
    <div id="tabla" style="margin-top:12px"></div>
    <div id="cuadre"></div>
  </div>

  <div class="card">
    <div id="compHead" class="eyebrow" style="cursor:pointer;display:flex;align-items:center;gap:8px;user-select:none;margin:0">
      <span id="compCaret" style="display:inline-block;width:12px">▸</span>
      Comparativo entre ejercicios
      <span style="color:var(--muted);font-weight:400;font-size:11px;text-transform:none" id="compHint">· clic para cargar</span>
    </div>
    <div id="comparativo"></div>
  </div>

</div>`;

  // ── Carga ─────────────────────────────────────────────────────────────────
  async function traerAnio(a) {
    if (cache.has(a)) return cache.get(a);
    const res = await KoguApi.apiFetch(`${BASE}/pp?anio=${a}`);
    const d = KoguApi.unwrapData(res);
    cache.set(a, d);
    return d;
  }

  async function load(a = null) {
    const res = await KoguApi.apiFetch(`${BASE}/pp${a ? `?anio=${a}` : ''}`);
    pp = KoguApi.unwrapData(res);
    anio  = pp.anio;
    anios = pp.anios || [];
    cache.set(anio, pp);
    renderAnios();
    renderTodo();
    if (compAbierto) await cargarComparativo();
  }

  function renderAnios() {
    const sel = document.getElementById('anioSel');
    sel.innerHTML = (anios.length ? anios : [anio]).map(a =>
      `<option value="${a}"${a === anio ? ' selected' : ''}>${a}</option>`).join('');
  }

  function renderTodo() {
    document.querySelectorAll('#metricaTabs .tab').forEach(t =>
      t.classList.toggle('active', t.dataset.m === metrica));
    renderCabecera();
    renderTabla();
    if (compAbierto) renderComparativo();
  }

  // ── Cabecera: tarjetas y barra ────────────────────────────────────────────
  function renderCabecera() {
    document.getElementById('tituloPp').textContent = `Cumplimiento vs PP ${anio ?? ''}`;
    if (!pp || pp.sin_pp) {
      document.getElementById('subPp').textContent = '';
      document.getElementById('cards').innerHTML =
        `<div class="empty">No hay presupuesto (PP) cargado para ${anio}.${anios.length ? ` Disponibles: ${anios.join(', ')}.` : ''}</div>`;
      document.getElementById('barra').innerHTML = '';
      return;
    }
    const t = pp.totales, ritmo = Number(t.ritmo_esperado || 0);
    const av = avVal(t), col = semColor(av, ritmo);
    const ultv = t.ult_venta ? String(t.ult_venta).slice(0, 10) : '—';
    const sc = pp.sin_cruce || {};
    const scVal = esDinero() ? Number(sc.ventas_real || 0) : Number(sc.kg_real || 0);
    const cob = esDinero() ? t.cobertura_ventas : t.cobertura_kg;

    const meses = Number(t.meses_transcurridos) || (t.ult_venta ? new Date(t.ult_venta).getUTCMonth() + 1 : 0);
    const metaCorte = meses ? ppVal(t) / 12 * meses : null;
    const cumpl = metaCorte ? realVal(t) / metaCorte : null;
    const cumplCol = cumpl == null ? 'var(--muted,#64748b)'
      : (cumpl >= 1 ? 'var(--success,#16a34a)' : cumpl >= 0.9 ? 'var(--warning,#d97706)' : 'var(--danger,#dc2626)');

    document.getElementById('subPp').innerHTML =
      `Métrica: <b>${esDinero() ? 'venta (MXN)' : 'volumen (kg)'}</b> · última venta ${ultv} · ritmo esperado <b>${pct0(ritmo)}</b> del año`;

    document.getElementById('cards').innerHTML = [
      miniCard(`PP ${anio} (${esDinero() ? 'MXN' : 'kg'})`, fmtValC(ppVal(t)), 'presupuesto anual'),
      miniCard('Real a la fecha', fmtValC(realVal(t)), `${pct0(av)} del PP · ritmo ${pct0(ritmo)}`, col),
      miniCard(`Meta al corte (${meses} m)`, metaCorte != null ? fmtValC(metaCorte) : '—', `PP ÷ 12 × ${meses} meses`),
      miniCard('Cumplimiento al corte', pct0(cumpl), 'real ÷ meta al corte', cumplCol),
      miniCard('Atribuido a sublíneas', pct0(cob), 'cobertura del cruce', cob >= 0.95 ? 'var(--success,#16a34a)' : 'var(--warning,#d97706)'),
      miniCard('Sin cruce', fmtValC(scVal), 'sin ClavePP asignada', scVal ? 'var(--warning,#d97706)' : ''),
    ].join('');

    const barW = Math.min(100, Math.round((av || 0) * 100));
    const ritW = Math.min(100, Math.round(ritmo * 100));
    document.getElementById('barra').innerHTML = `
      <div style="margin-top:14px">
        <div style="position:relative;background:var(--panel2,#f1f5f9);border-radius:8px;height:22px;overflow:hidden">
          <div style="width:${barW}%;height:100%;background:${col};transition:width .3s"></div>
          <div title="Ritmo esperado ${pct0(ritmo)}" style="position:absolute;top:-2px;left:${ritW}%;width:2px;height:26px;background:var(--ink,#0f172a)"></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--muted);margin-top:3px">
          <span>Avance ${pct0(av)}</span><span>Marcador = ritmo esperado ${pct0(ritmo)}</span><span>PP 100%</span>
        </div>
      </div>`;
  }

  // ── Detalle: categorías con sus sublíneas ─────────────────────────────────
  // Se ordena por el criterio elegido en los dos niveles (categorías entre sí y
  // sublíneas dentro de cada una) para que el orden signifique lo mismo en toda
  // la tabla.
  const valorOrden = (o, col) => col === 'pp' ? ppVal(o) : col === 'real' ? realVal(o) : (avVal(o) ?? -1);
  function ordenar(arr, col, dir) {
    const s = [...arr].sort((a, x) => {
      // Las dos ramas ordenan DESCENDENTE por defecto para que el reverse de
      // abajo signifique lo mismo en ambas. Si el texto se ordenara ascendente
      // aquí, pedir 'asc' lo dejaría al revés.
      if (col === 'nombre') {
        const na = a.cat_nombre ?? a.sublinea_nombre ?? '', nx = x.cat_nombre ?? x.sublinea_nombre ?? '';
        return String(nx).localeCompare(String(na), 'es');
      }
      return valorOrden(x, col) - valorOrden(a, col);
    });
    return dir === 'asc' ? s.reverse() : s;
  }

  function categoriasFiltradas() {
    if (!pp?.categorias) return [];
    const f = filtro.trim().toLowerCase();
    let cats = pp.categorias.map(c => ({ ...c }));
    if (f) {
      cats = cats
        .map(c => {
          const catMatch = String(c.cat_nombre || '').toLowerCase().includes(f);
          const subs = c.sublineas.filter(s =>
            catMatch ||
            String(s.cve_sublinea || '').toLowerCase().includes(f) ||
            String(s.sublinea_nombre || '').toLowerCase().includes(f));
          return { ...c, sublineas: subs };
        })
        .filter(c => c.sublineas.length);
    }
    return ordenar(cats, orden.col, orden.dir);
  }

  function th(col, txt, alinea = 'left') {
    const act = orden.col === col;
    const flecha = act ? (orden.dir === 'desc' ? ' ▾' : ' ▴') : '';
    return `<th data-col="${col}" style="text-align:${alinea};cursor:pointer;user-select:none${act ? ';color:var(--brand,#2563eb)' : ''}">${esc(txt)}${flecha}</th>`;
  }

  function renderTabla() {
    const cont = document.getElementById('tabla');
    const cuad = document.getElementById('cuadre');
    if (!pp || pp.sin_pp) { cont.innerHTML = ''; cuad.innerHTML = ''; return; }

    const cats  = categoriasFiltradas();
    const t     = pp.totales;
    const ritmo = Number(t.ritmo_esperado || 0);
    const sc    = pp.sin_cruce || {};
    const scVal = esDinero() ? Number(sc.ventas_real || 0) : Number(sc.kg_real || 0);
    const filtrando = !!filtro.trim();

    if (!cats.length) {
      cont.innerHTML = `<div class="empty">Sin categorías para “${esc(filtro)}”.</div>`;
      cuad.innerHTML = '';
      return;
    }

    const cuerpo = cats.map(c => {
      const a = avVal(c);
      const subs = ordenar(c.sublineas, orden.col, orden.dir).map(s => {
        const sa = avVal(s);
        return `<tr style="background:var(--panel2,#f8fafc)">
          <td style="padding-left:26px"><span class="chip-compact">${esc(s.cve_sublinea)}</span> ${esc(s.sublinea_nombre)}${s.mapeado ? '' : ' <span style="color:var(--warning,#d97706);font-size:11px">·sin cruce</span>'}</td>
          <td style="text-align:right">${fmtVal(ppVal(s))}</td>
          <td style="text-align:right">${fmtVal(realVal(s))}</td>
          <td style="text-align:right;font-weight:600;color:${semColor(sa, ritmo)}">${pct0(sa)}</td>
        </tr>`;
      }).join('');
      return `<tr>
          <td><b>${esc(c.cat_nombre || ('Categoría ' + c.cat))}</b> <span style="color:var(--muted);font-size:11px">(${c.sublineas.length})</span></td>
          <td style="text-align:right">${fmtVal(ppVal(c))}</td>
          <td style="text-align:right">${fmtVal(realVal(c))}</td>
          <td style="text-align:right;font-weight:700;color:${semColor(a, ritmo)}">${pct0(a)}</td>
        </tr>${subs}`;
    }).join('');

    // Sumatorias. Con el buscador activo suman SOLO lo visible y se dice así:
    // un total que no corresponde a lo que se ve en pantalla es peor que no
    // tener total.
    const sumPp   = cats.reduce((a, c) => a + ppVal(c), 0);
    const sumReal = cats.reduce((a, c) => a + realVal(c), 0);
    const totReal = sumReal + (filtrando ? 0 : scVal);
    const avSum   = sumPp ? sumReal / sumPp : null;
    const avTot   = sumPp ? totReal / sumPp : null;

    const foot = `
      <tfoot>
        <tr style="border-top:2px solid var(--line);font-weight:700;background:var(--panel2,#f8fafc)">
          <td>${filtrando ? `Suma de lo filtrado` : `Suma de categorías`} <span style="color:var(--muted);font-weight:400;font-size:11px">(${cats.length})</span></td>
          <td style="text-align:right">${fmtVal(sumPp)}</td>
          <td style="text-align:right">${fmtVal(sumReal)}</td>
          <td style="text-align:right;color:${semColor(avSum, ritmo)}">${pct0(avSum)}</td>
        </tr>
        ${(!filtrando && scVal > 0) ? `<tr style="background:var(--panel2,#f8fafc);color:var(--warning,#d97706)">
          <td style="padding-left:14px">Sin cruce <span style="font-weight:400;font-size:11px">· cliente·producto todavía sin ClavePP — <a href="/modules/rc/asignacion-pp.html" style="color:inherit;text-decoration:underline">asignar</a></span></td>
          <td style="text-align:right">—</td>
          <td style="text-align:right;font-weight:700">${fmtVal(scVal)}</td>
          <td style="text-align:right">—</td>
        </tr>` : ''}
        ${!filtrando ? `<tr style="border-top:1px solid var(--line);font-weight:800">
          <td>TOTAL ${anio}</td>
          <td style="text-align:right">${fmtVal(sumPp)}</td>
          <td style="text-align:right">${fmtVal(totReal)}</td>
          <td style="text-align:right;color:${semColor(avTot, ritmo)}">${pct0(avTot)}</td>
        </tr>` : ''}
      </tfoot>`;

    cont.innerHTML = `
      <div class="table-wrap"><table><thead><tr>
        ${th('nombre', 'Categoría / sublínea')}
        ${th('pp', `PP ${anio}`, 'right')}
        ${th('real', 'Real', 'right')}
        ${th('avance', 'Avance', 'right')}
      </tr></thead><tbody>${cuerpo}</tbody>${foot}</table></div>`;

    cont.querySelectorAll('th[data-col]').forEach(el => el.onclick = () => {
      const col = el.dataset.col;
      if (orden.col === col) orden.dir = orden.dir === 'desc' ? 'asc' : 'desc';
      else orden = { col, dir: col === 'nombre' ? 'asc' : 'desc' };
      renderTabla();
    });

    // Cuadre contra el servidor (solo tiene sentido sin filtro).
    if (filtrando) { cuad.innerHTML = ''; return; }
    const tol = esDinero() ? 0.5 : 1;
    const dMap = sumReal - realMapVal(t);
    const dTot = totReal - realVal(t);
    cuad.innerHTML = (Math.abs(dMap) > tol || Math.abs(dTot) > tol)
      ? `<div style="margin-top:10px;padding:9px 12px;border:1px solid var(--danger,#dc2626);border-radius:10px;color:var(--danger,#dc2626);font-size:12px">
           <b>Las sumas no cuadran.</b>
           ${Math.abs(dMap) > tol ? `Suma de categorías ${fmtVal(sumReal)} vs atribuido del servidor ${fmtVal(realMapVal(t))} (dif. ${fmtVal(dMap)}). ` : ''}
           ${Math.abs(dTot) > tol ? `Total de la tabla ${fmtVal(totReal)} vs Real a la fecha ${fmtVal(realVal(t))} (dif. ${fmtVal(dTot)}).` : ''}
         </div>`
      : `<div style="margin-top:10px;font-size:12px;color:var(--muted)">
           ✓ Cuadra: suma de categorías + sin cruce = Real a la fecha (${fmtVal(realVal(t))}).
         </div>`;
  }

  // ── Comparativo entre ejercicios ──────────────────────────────────────────
  async function cargarComparativo() {
    if (compCargando) return;
    compCargando = true;
    document.getElementById('compHint').textContent = '· cargando…';
    try {
      await Promise.all((anios.length ? anios : [anio]).map(a => traerAnio(a).catch(() => null)));
      renderComparativo();
    } finally {
      compCargando = false;
    }
  }

  function renderComparativo() {
    const cont = document.getElementById('comparativo');
    const ys = (anios.length ? anios : [anio]).filter(a => cache.has(a) && !cache.get(a)?.sin_pp).sort((a, x) => a - x);
    document.getElementById('compHint').textContent = ys.length
      ? `· ${ys.join(' · ')}`
      : '· sin ejercicios con PP cargado';
    if (!ys.length) { cont.innerHTML = ''; return; }

    // Universo de categorías = unión de todos los años (una categoría puede
    // existir en un ejercicio y no en otro).
    const nombres = new Map();
    const porCat = new Map();
    for (const y of ys) {
      for (const c of (cache.get(y).categorias || [])) {
        nombres.set(c.cat, c.cat_nombre || ('Categoría ' + c.cat));
        if (!porCat.has(c.cat)) porCat.set(c.cat, new Map());
        porCat.get(c.cat).set(y, c);
      }
    }

    const ultimo = ys[ys.length - 1], previo = ys.length > 1 ? ys[ys.length - 2] : null;
    const varReal = (m) => {
      if (!previo) return null;
      const a = m.get(previo), u = m.get(ultimo);
      const va = a ? realVal(a) : 0, vu = u ? realVal(u) : 0;
      return va ? (vu - va) / va : null;
    };
    const colVar = v => v == null ? 'var(--muted,#64748b)' : (v >= 0 ? 'var(--success,#16a34a)' : 'var(--danger,#dc2626)');
    const fmtVar = v => v == null ? '—' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(0)}%`;

    const filas = [...porCat.entries()]
      .sort((a, x) => {
        const ra = a[1].get(ultimo), rx = x[1].get(ultimo);
        return (rx ? realVal(rx) : 0) - (ra ? realVal(ra) : 0);
      })
      .map(([cat, m]) => {
        const celdas = ys.map(y => {
          const c = m.get(y);
          if (!c) return `<td style="text-align:right;color:var(--muted)">—</td><td style="text-align:right;color:var(--muted)">—</td><td style="text-align:right;color:var(--muted)">—</td>`;
          const rit = Number(cache.get(y).totales?.ritmo_esperado || 0);
          // nowrap: con 3 ejercicios × 3 columnas los importes se parten en dos
          // renglones y la tabla se vuelve ilegible.
          return `<td style="text-align:right;white-space:nowrap">${fmtVal(ppVal(c))}</td>
                  <td style="text-align:right;white-space:nowrap">${fmtVal(realVal(c))}</td>
                  <td style="text-align:right;white-space:nowrap;font-weight:600;color:${semColor(avVal(c), rit)}">${pct0(avVal(c))}</td>`;
        }).join('');
        const v = varReal(m);
        return `<tr><td style="min-width:160px"><b>${esc(nombres.get(cat))}</b></td>${celdas}
          <td style="text-align:right;font-weight:700;color:${colVar(v)}">${fmtVar(v)}</td></tr>`;
      }).join('');

    // Pie: suma de categorías, sin cruce y total por año (misma estructura que
    // el detalle, para que las dos tablas se lean igual).
    const pie = (etiqueta, sel, negrita) => `
      <tr style="${negrita ? 'font-weight:800;border-top:1px solid var(--line)' : 'font-weight:700;background:var(--panel2,#f8fafc)'}">
        <td>${etiqueta}</td>
        ${ys.map(y => {
          const d = cache.get(y), r = sel(d);
          return `<td style="text-align:right;white-space:nowrap">${r.pp == null ? '—' : fmtVal(r.pp)}</td>
                  <td style="text-align:right;white-space:nowrap">${fmtVal(r.real)}</td>
                  <td style="text-align:right;white-space:nowrap;color:${semColor(r.av, Number(d.totales?.ritmo_esperado || 0))}">${r.av == null ? '—' : pct0(r.av)}</td>`;
        }).join('')}
        <td></td>
      </tr>`;

    const sumaDe = d => {
      const p = (d.categorias || []).reduce((a, c) => a + ppVal(c), 0);
      const r = (d.categorias || []).reduce((a, c) => a + realVal(c), 0);
      return { pp: p, real: r, av: p ? r / p : null };
    };
    const sinCruceDe = d => {
      const s = d.sin_cruce || {};
      return { pp: null, real: esDinero() ? Number(s.ventas_real || 0) : Number(s.kg_real || 0), av: null };
    };
    const totalDe = d => {
      const s = sumaDe(d), c = sinCruceDe(d);
      const real = s.real + c.real;
      return { pp: s.pp, real, av: s.pp ? real / s.pp : null };
    };

    const cabAnios = ys.map(y => `<th colspan="3" style="text-align:center;border-left:1px solid var(--line)">${y}</th>`).join('');
    const cabCols  = ys.map(() => `<th style="text-align:right;border-left:1px solid var(--line)">PP</th><th style="text-align:right">Real</th><th style="text-align:right">Av.</th>`).join('');

    cont.innerHTML = `
      <div class="hint" style="color:var(--muted);font-size:12px;margin:8px 0 10px">
        Real de cada ejercicio <b>atribuido a sublíneas</b>; el renglón "sin cruce" recoge lo que en ese año no tenía ClavePP.
        La última columna compara el real de <b>${ultimo}</b> contra <b>${previo ?? '—'}</b>.
      </div>
      <div class="table-wrap"><table>
        <thead>
          <tr><th></th>${cabAnios}<th style="text-align:right">Var. real</th></tr>
          <tr><th>Categoría</th>${cabCols}<th style="text-align:right">${previo ? `${ultimo} vs ${previo}` : '—'}</th></tr>
        </thead>
        <tbody>${filas}</tbody>
        <tfoot>
          ${pie('Suma de categorías', sumaDe, false)}
          ${pie('Sin cruce', sinCruceDe, false)}
          ${pie('TOTAL', totalDe, true)}
        </tfoot>
      </table></div>`;
  }

  // ── Exportar ──────────────────────────────────────────────────────────────
  function exportar() {
    if (typeof XLSX === 'undefined') { KoguApi.toast('SheetJS no cargó. Recarga la página.', 'error'); return; }
    if (!pp || pp.sin_pp) { KoguApi.toast('No hay PP que exportar.', 'error'); return; }
    const unidad = esDinero() ? 'MXN' : 'kg';
    const wb = XLSX.utils.book_new();

    // Hoja 1 — detalle del año seleccionado (sin filtrar: el Excel se exporta
    // completo aunque la pantalla esté filtrada).
    const det = [];
    for (const c of pp.categorias) {
      det.push({ Categoria: c.cat_nombre || ('Categoría ' + c.cat), Clave: '', Sublinea: '(total categoría)',
        [`PP_${unidad}`]: ppVal(c), [`Real_${unidad}`]: realVal(c), Avance: avVal(c) });
      for (const s of c.sublineas) {
        det.push({ Categoria: c.cat_nombre || ('Categoría ' + c.cat), Clave: s.cve_sublinea, Sublinea: s.sublinea_nombre,
          [`PP_${unidad}`]: ppVal(s), [`Real_${unidad}`]: realVal(s), Avance: avVal(s),
          Cruzado: s.mapeado ? 'sí' : 'no' });
      }
    }
    const sc = pp.sin_cruce || {};
    det.push({ Categoria: 'SIN CRUCE', Clave: '', Sublinea: 'cliente·producto sin ClavePP',
      [`PP_${unidad}`]: null, [`Real_${unidad}`]: esDinero() ? Number(sc.ventas_real || 0) : Number(sc.kg_real || 0), Avance: null });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(det), `Detalle ${anio}`);

    // Hoja 2 — comparativo, solo si ya se cargaron los otros ejercicios.
    const ys = (anios.length ? anios : [anio]).filter(a => cache.has(a) && !cache.get(a)?.sin_pp).sort((a, x) => a - x);
    if (ys.length > 1) {
      const nombres = new Map(), porCat = new Map();
      for (const y of ys) for (const c of (cache.get(y).categorias || [])) {
        nombres.set(c.cat, c.cat_nombre || ('Categoría ' + c.cat));
        if (!porCat.has(c.cat)) porCat.set(c.cat, new Map());
        porCat.get(c.cat).set(y, c);
      }
      const comp = [...porCat.entries()].map(([cat, m]) => {
        const fila = { Categoria: nombres.get(cat) };
        for (const y of ys) {
          const c = m.get(y);
          fila[`PP ${y}`]     = c ? ppVal(c)   : null;
          fila[`Real ${y}`]   = c ? realVal(c) : null;
          fila[`Avance ${y}`] = c ? avVal(c)   : null;
        }
        return fila;
      });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(comp), 'Comparativo');
    }

    XLSX.writeFile(wb, `KOGU_PP_${anio}_${unidad}.xlsx`);
  }

  // ── Eventos ───────────────────────────────────────────────────────────────
  document.getElementById('anioSel').onchange = (e) => load(Number(e.target.value));
  document.querySelectorAll('#metricaTabs .tab').forEach(t => t.onclick = () => {
    metrica = t.dataset.m;
    localStorage.setItem('kogu:rc-metrica', metrica);
    renderTodo();
  });
  let qTimer = null;
  document.getElementById('qFil').oninput = (e) => {
    clearTimeout(qTimer);
    qTimer = setTimeout(() => { filtro = e.target.value; renderTabla(); }, 250);
  };
  document.getElementById('exportBtn').onclick = (e) => KoguUi.withLoading(e.target, async () => exportar(), 'Generando…');
  document.getElementById('compHead').onclick = async () => {
    compAbierto = !compAbierto;
    document.getElementById('compCaret').textContent = compAbierto ? '▾' : '▸';
    if (!compAbierto) { document.getElementById('comparativo').innerHTML = ''; document.getElementById('compHint').textContent = '· clic para cargar'; return; }
    await cargarComparativo();
  };

  KoguShell.subscribeEmpresaActivaChange(async () => { cache.clear(); await load(); });
  await load();
});

document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/rc/nuevas-ventas.html';
  const BASE = '/protected/rc';
  const PERM = 'screen.ventas.direccion';

  // ── Ventas nuevas por par (cliente, producto) ───────────────────────────────
  //
  // Una venta nueva es la primera vez que un cliente compra una clave de
  // producto. Esta pantalla contesta dos cosas: cuántas se abrieron en el mes,
  // y qué pasó con ellas desde que nacieron.
  //
  // Es el CONTRAPESO de la Bandeja de Riesgo, no un tablero de novedades. La
  // Bandeja mide decaimiento sobre doce meses; ésta mide lo que nace en los
  // últimos tres. El caso que lo demostró: UNILEVER MANUFACTURERA es la deriva
  // más grande de la cartera —−30.6%, 1,263,868 kg menos en el año— y al mismo
  // tiempo abrió en junio una línea que lleva 310,000 kg en tres meses. Las dos
  // cosas son ciertas y ninguna pantalla las mostraba juntas.
  //
  // La métrica principal es la CANTIDAD (kg), como pidió Dirección; el importe
  // en pesos acompaña, y el dólar va como "de los cuales" — nunca al lado del
  // peso como si fueran dos monedas de la misma suma, porque subt_prod siempre
  // está en pesos y la cifra en USD es la porción facturada en esa moneda.
  //
  // Lo que hace accionable la lista NO es el conteo: es el semáforo. Medido en
  // ADGM, la mitad de las ventas nuevas no se repite nunca —34% repite dentro
  // de 3 meses, 47% dentro de 6, 50% dentro de 12— y la curva se aplana en el
  // primer trimestre. Por eso "pendiente" (todavía hay ventana) y "perdida"
  // (ya se acabó) son estados distintos y no el mismo cero.

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Ventas nuevas',
    description: 'Combinaciones cliente-producto que nacieron en el mes y qué pasó con ellas. Radar Comercial.',
    requiredPermission: PERM,
  });
  if (!b) return;

  const c = document.getElementById('pageContent');
  c.innerHTML = `
<div class="stack" style="gap:20px">

  <div class="card">
    <div class="row">
      <div>
        <div class="eyebrow">Radar · Dirección</div>
        <h2>Ventas nuevas</h2>
        <div class="hint" id="metaInfo" style="margin-top:4px;color:var(--muted)">Cargando…</div>
      </div>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <select class="select" id="mesFil" style="max-width:150px"></select>
        <button class="btn" id="comoBtn" title="¿Cómo se cuenta una venta nueva?">ℹ Cómo se cuenta</button>
      </div>
    </div>

    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:14px">
      <select class="select" id="clienteFil" style="max-width:280px"><option value="">Todos los clientes</option></select>
      <select class="select" id="productoFil" style="max-width:240px"><option value="">Todos los productos</option></select>
      <select class="select" id="sublineaFil" style="max-width:240px"><option value="">Todas las líneas de PP</option></select>
      <select class="select" id="segFil" style="max-width:200px">
        <option value="">Todo el seguimiento</option>
        <option value="pendiente">Pendientes de repetir</option>
        <option value="repitio">Ya repitieron</option>
        <option value="perdida">Perdidas</option>
      </select>
      <button class="btn" id="limpiarBtn">Limpiar filtros</button>
    </div>

    <div id="avisos" style="margin-top:12px"></div>
    <div id="kpis" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px;margin-top:14px"></div>
  </div>

  <div class="card">
    <div class="eyebrow">Ritmo</div>
    <h3 style="margin:4px 0 12px">Ventas nuevas por mes</h3>
    <div id="serie"></div>
  </div>

  <div class="card">
    <div class="row" style="align-items:flex-start">
      <div>
        <div class="eyebrow">Lista de trabajo</div>
        <h3 id="tituloLista" style="margin:4px 0 0">Eventos del mes</h3>
      </div>
    </div>
    <div id="eventos" style="margin-top:12px"></div>
  </div>

  <div class="card">
    <div class="eyebrow">¿Pegan? ¿Crecen?</div>
    <h3 style="margin:4px 0 12px">Supervivencia por cohorte</h3>
    <div id="cohortes"></div>
  </div>

</div>`;

  // ── Estado / helpers ────────────────────────────────────────────────────────
  let data = null;

  const money = v => KoguUi.money(Number(v || 0));
  const nf0 = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 });
  const num = v => nf0.format(Number(v || 0));
  const kg = v => `${num(v)} kg`;
  const usd = v => `US$${nf0.format(Number(v || 0))}`;
  const pctTxt = v => v == null ? '—' : `${(Number(v) * 100).toFixed(0)}%`;
  const sel = id => document.getElementById(id)?.value ?? '';
  const esc = s => KoguUi.escapeHtml(String(s ?? ''));

  const MESES = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  // Las fechas vienen en UTC. Se leen con getUTC* a propósito: con el huso de
  // México, un new Date('2026-06-01').getMonth() devuelve mayo.
  const mesLbl = iso => {
    const d = new Date(iso);
    return `${MESES[d.getUTCMonth() + 1]} ${String(d.getUTCFullYear()).slice(2)}`;
  };
  const mesKey = iso => new Date(iso).toISOString().slice(0, 7);

  const miniCard = (lbl, val, hint = '', color = '') => `
    <div style="border:1px solid var(--line);border-radius:10px;padding:9px 12px">
      <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.03em">${esc(lbl)}</div>
      <div style="font-size:17px;font-weight:800;line-height:1.15;margin-top:1px;${color ? `color:${color}` : ''}">${esc(val)}</div>
      ${hint ? `<div style="font-size:10px;color:var(--muted)">${esc(hint)}</div>` : ''}
    </div>`;

  const TIPO = {
    cliente_nuevo: { txt: 'Cliente nuevo', bg: 'var(--brand,#2563eb)' },
    venta_cruzada: { txt: 'Venta cruzada', bg: 'var(--ok,#059669)' },
    reactivada:    { txt: 'Reactivación',  bg: 'var(--warning,#d97706)' },
  };
  const SEG = {
    repitio:   { txt: '✓ Repitió',  color: 'var(--ok,#059669)' },
    pendiente: { txt: '◷ Pendiente', color: 'var(--warning,#d97706)' },
    perdida:   { txt: '✕ Perdida',  color: 'var(--danger,#dc2626)' },
  };

  // ── Carga ───────────────────────────────────────────────────────────────────
  async function cargar(mes = null) {
    const qs = new URLSearchParams();
    if (mes) qs.set('mes', mes);
    if (sel('clienteFil'))  qs.set('cliente',  sel('clienteFil'));
    if (sel('productoFil')) qs.set('producto', sel('productoFil'));
    if (sel('sublineaFil')) qs.set('sublinea', sel('sublineaFil'));
    try {
      const res = await KoguApi.apiFetch(`${BASE}/nuevas-ventas?${qs.toString()}`);
      data = res?.data || res;
      render();
    } catch (err) {
      KoguApi.toast(err.message, 'error');
      document.getElementById('metaInfo').textContent = 'No se pudo cargar.';
    }
  }

  // Los selectores se llenan UNA vez, con el universo completo. Si se
  // repoblaran en cada carga, filtrar por un cliente dejaría la lista de
  // productos con un solo elemento y ya no se podría cambiar de idea.
  let opcionesListas = false;
  function llenarOpciones(o) {
    if (opcionesListas || !o) return;
    const put = (id, items, val, txt) => {
      const el = document.getElementById(id);
      el.innerHTML = el.options[0].outerHTML
        + items.map(x => `<option value="${esc(val(x))}">${esc(txt(x))}</option>`).join('');
    };
    put('clienteFil', o.clientes, x => x.cliente_ref,
        x => `${x.nombre}${Number(x.eventos) ? ` (${x.eventos})` : ''}`);
    put('productoFil', o.productos, x => x.cve_prod,
        x => `${x.cve_prod}${x.desc_prod ? ` · ${x.desc_prod}` : ''}`);
    put('sublineaFil', o.sublineas, x => x.cve_sublinea,
        x => `${x.cve_sublinea}${x.sublinea_nombre ? ` · ${x.sublinea_nombre}` : ''}`);
    opcionesListas = true;
  }

  function llenarMeses(serie, mesActual) {
    const el = document.getElementById('mesFil');
    if (el.options.length && el.value) return;   // ya está armado
    const piso = data?.periodos?.piso_cohortes;
    // Se listan del más reciente al más viejo. Los meses anteriores al piso se
    // marcan: en el arranque del archivo TODO es nuevo por definición y ese mes
    // no se puede leer como un buen mes comercial.
    const opts = serie.slice().reverse().map(s => {
      const k = mesKey(s.mes);
      const antes = piso && new Date(s.mes) < new Date(piso);
      return `<option value="${k}">${mesLbl(s.mes)}${antes ? ' · arranque del archivo' : ''}</option>`;
    }).join('');
    el.innerHTML = opts;
    el.value = mesKey(mesActual);
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  function render() {
    if (!data) return;
    const p = data.periodos, k = data.kpis, cr = data.criterio;

    llenarOpciones(data.opciones);
    llenarMeses(data.serie, p.mes);

    document.getElementById('metaInfo').innerHTML =
      `Mes <b>${mesLbl(p.mes)}</b> · datos al ${esc(p.ultimo_dato)}`
      + (p.mes_en_curso_excluido ? ' · el mes en curso queda fuera (sólo meses cerrados)' : '')
      + ` · un par se da por perdido si no repite en <b>${cr.seguimiento_meses} meses</b>`
      + ` · vuelve a contar como nueva tras <b>${cr.hueco_meses} meses</b> sin comprar`;

    renderAvisos();
    renderKpis();
    renderSerie();
    renderEventos();
    renderCohortes();
  }

  function renderAvisos() {
    const p = data.periodos, con = data.concentracion, pp = data.cobertura_pp;
    const av = [];

    // Un mes donde un renglón se lleva casi todo NO mide ritmo comercial: mide
    // un pedido. Decirlo evita que alguien lea el promedio como cadencia.
    if (con?.avisar) {
      av.push(`<div style="border:1px solid var(--warning,#d97706);border-left:4px solid var(--warning,#d97706);border-radius:10px;padding:10px 12px;font-size:12px">
        <b>Un solo renglón es el ${pctTxt(con.share_kg)} del volumen nuevo del mes</b> —
        ${esc(con.cliente_nombre)} / ${esc(con.cve_prod)}, ${kg(con.kg)}.
        Este mes no mide ritmo comercial, mide un pedido: sin ese par cierra en ${kg(con.kg_sin_top)}.
      </div>`);
    }

    // Los pares más nuevos son justo los que no tienen sublínea: el sync de
    // asignación PP sólo corre a mano, nunca al importar ventas. Se dice en vez
    // de mostrar una lista corta sin explicar por qué.
    if (Number(pp?.sin_fila) > 0) {
      av.push(`<div style="border:1px solid var(--line);border-left:4px solid var(--muted,#64748b);border-radius:10px;padding:10px 12px;font-size:12px;color:var(--muted)">
        ${num(pp.sin_fila)} de ${num(pp.nacimientos)} ventas nuevas todavía no tienen línea de PP asignada —
        el filtro de arriba no las ve. Se resuelve en <b>Asignación PP</b> con el botón de sincronizar.
      </div>`);
    }

    if (new Date(p.mes) < new Date(p.piso_cohortes)) {
      av.push(`<div style="border:1px solid var(--line);border-left:4px solid var(--muted,#64748b);border-radius:10px;padding:10px 12px;font-size:12px;color:var(--muted)">
        Este mes es anterior al ${esc(p.piso_cohortes)}, el arranque del archivo de ventas.
        Ahí <b>todo par es nuevo por definición</b> porque no hay historia detrás: el número no se puede
        comparar con el de un mes normal.
      </div>`);
    }

    document.getElementById('avisos').innerHTML =
      av.length ? `<div class="stack" style="gap:8px">${av.join('')}</div>` : '';
  }

  function renderKpis() {
    const k = data.kpis;
    const shareVol = k.kg_mes_total ? k.kg / k.kg_mes_total : null;
    document.getElementById('kpis').innerHTML = [
      miniCard('Ventas nuevas', String(k.nuevas),
        `${k.cliente_nuevo} cliente nuevo · ${k.venta_cruzada} venta cruzada`),
      miniCard('Volumen nuevo', kg(k.kg),
        shareVol != null ? `${pctTxt(shareVol)} del volumen del mes` : ''),
      miniCard('Importe', money(k.mxn),
        Number(k.usd) ? `de los cuales ${usd(k.usd)} facturados en dólares` : 'sin facturación en dólares'),
      miniCard('Reactivaciones', String(k.reactivadas),
        `${kg(k.kg_react)} · volvieron tras ${data.criterio.hueco_meses} meses`,
        Number(k.reactivadas) ? 'var(--warning,#d97706)' : ''),
      miniCard('Seguimiento', `${k.repitieron} / ${k.pendientes} / ${k.perdidas}`,
        'repitieron · pendientes · perdidas',
        Number(k.perdidas) ? 'var(--danger,#dc2626)' : ''),
    ].join('');
  }

  function renderSerie() {
    const s = data.serie || [];
    if (!s.length) { document.getElementById('serie').innerHTML = '<div class="empty">Sin datos</div>'; return; }
    // Se grafica el CONTEO, no los kg. Los kg los domina un pedido grande —un
    // par fue el 48% del volumen nuevo de veinte meses— y la barra de ese mes
    // aplastaría todas las demás hasta volverlas invisibles. El conteo mide
    // ritmo comercial, que es lo que esta gráfica quiere mostrar; el volumen
    // vive en el tooltip y en los KPI.
    const vis = s.slice(-24);
    const piso = data.periodos.piso_cohortes;
    const max = Math.max(1, ...vis.map(x => Number(x.cliente_nuevo) + Number(x.venta_cruzada)));
    document.getElementById('serie').innerHTML = vis.map(x => {
      const cn = Number(x.cliente_nuevo), vc = Number(x.venta_cruzada), re = Number(x.reactivadas);
      const tot = cn + vc;
      const wc = Math.round(100 * cn / max), wv = Math.round(100 * vc / max);
      const antes = piso && new Date(x.mes) < new Date(piso);
      const t = `${mesLbl(x.mes)}: ${tot} nuevas (${cn} cliente nuevo, ${vc} cruzada)`
              + `, ${re} reactivaciones, ${kg(x.kg)}, ${money(x.mxn)}`;
      return `<div style="display:flex;align-items:center;gap:10px;margin:4px 0${antes ? ';opacity:.45' : ''}" title="${esc(t)}">
        <div style="width:66px;font-size:12px;color:var(--muted)">${mesLbl(x.mes)}</div>
        <div style="flex:1;display:flex;background:var(--panel2,#f1f5f9);border-radius:6px;overflow:hidden;height:16px">
          <div style="width:${wc}%;background:var(--brand,#2563eb)"></div>
          <div style="width:${wv}%;background:var(--ok,#059669)"></div>
        </div>
        <div style="width:44px;text-align:right;font-size:12px;font-weight:600">${tot}</div>
        <div style="width:96px;text-align:right;font-size:11px;color:var(--muted)">${kg(x.kg)}</div>
      </div>`;
    }).join('')
      + `<div style="display:flex;gap:14px;margin-top:10px;font-size:11px;color:var(--muted);flex-wrap:wrap">
           <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:var(--brand,#2563eb)"></span> cliente nuevo</span>
           <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:var(--ok,#059669)"></span> venta cruzada</span>
           <span>La barra cuenta EVENTOS, no kilos: un pedido grande deformaría la escala. El volumen va a la derecha.</span>
           <span>Los meses tenues son anteriores al arranque del archivo.</span>
         </div>`;
  }

  function renderEventos() {
    const segF = sel('segFil');
    const todos = data.eventos || [];
    const ev = segF ? todos.filter(e => e.seguimiento === segF) : todos;

    document.getElementById('tituloLista').textContent =
      `Eventos de ${mesLbl(data.periodos.mes)}${segF ? ` · ${SEG[segF].txt.replace(/^[^ ]+ /, '')}` : ''}`;

    if (!ev.length) {
      document.getElementById('eventos').innerHTML =
        `<div class="empty">${todos.length ? 'Ningún evento con ese seguimiento' : 'Sin ventas nuevas ni reactivaciones este mes'}</div>`;
      return;
    }

    const fila = e => {
      const t = TIPO[e.tipo] || TIPO.venta_cruzada;
      const g = SEG[e.seguimiento] || SEG.pendiente;
      const desp = e.meses_despues
        ? `${e.meses_despues} mes(es) · ${kg(e.kg_despues)} · última ${mesLbl(e.ultimo_mes)}`
        : (e.seguimiento === 'pendiente'
            ? `sin repetir · lleva ${e.edad_meses} de ${data.criterio.seguimiento_meses} meses`
            : `nunca repitió · ${e.edad_meses} meses después`);
      return `<tr>
        <td><span style="display:inline-block;padding:2px 9px;border-radius:999px;font-size:10px;font-weight:600;color:#fff;background:${t.bg}">${t.txt}</span></td>
        <td>
          <div style="font-weight:600">${esc(e.cliente_nombre)}${e.en_catalogo ? '' : ' <span title="No está en el catálogo de clientes" style="color:var(--warning,#d97706);font-size:11px">⚠ sin alta</span>'}</div>
          <div style="font-size:11px;color:var(--muted)">${e.agente_nombre ? esc(e.agente_nombre) : 'sin agente'}</div>
        </td>
        <td>
          <div><span class="chip-compact">${esc(e.cve_prod)}</span></div>
          <div style="font-size:11px;color:var(--muted)">${esc(e.desc_prod || '')}</div>
        </td>
        <td style="text-align:right;font-weight:600">${kg(e.kg)}</td>
        <td style="text-align:right">${money(e.mxn)}</td>
        <td style="text-align:right;color:var(--muted)">${Number(e.usd) ? usd(e.usd) : '—'}</td>
        <td>${e.cve_sublinea ? `<span class="chip-compact">${esc(e.cve_sublinea)}</span>` : '<span style="color:var(--muted);font-size:11px">sin cruce</span>'}</td>
        <td>
          <div style="color:${g.color};font-weight:600;font-size:12px">${g.txt}</div>
          <div style="font-size:11px;color:var(--muted)">${esc(desp)}</div>
        </td>
      </tr>`;
    };

    const sumKg = ev.reduce((s, e) => s + Number(e.kg || 0), 0);
    document.getElementById('eventos').innerHTML = `
      <div class="table-wrap"><table><thead><tr>
        <th>Tipo</th><th>Cliente</th><th>Producto</th>
        <th style="text-align:right">kg</th><th style="text-align:right">MXN</th><th style="text-align:right">USD</th>
        <th>PP</th><th>Seguimiento</th>
      </tr></thead><tbody>${ev.map(fila).join('')}</tbody></table></div>
      <div class="hint" style="margin-top:8px;color:var(--muted);font-size:12px">
        ${ev.length} evento(s) · ${kg(sumKg)}${segF ? ` de ${todos.length} en el mes` : ''} ·
        ordenados por volumen. El importe en dólares es la porción facturada en esa moneda, no un total aparte.
      </div>`;
  }

  function renderCohortes() {
    const co = data.cohortes || [];
    const r = data.resumen_cohortes || {};
    if (!co.length) { document.getElementById('cohortes').innerHTML = '<div class="empty">Sin cohortes en el periodo</div>'; return; }

    const cel = (v, pares) => v == null
      ? '<span style="color:var(--muted)" title="La cohorte todavía no cumple esa edad">—</span>'
      : `<b style="color:${v >= 0.5 ? 'var(--ok,#059669)' : (v <= 0.25 ? 'var(--danger,#dc2626)' : 'inherit')}">${pctTxt(v)}</b>`;

    const filas = co.slice().reverse().map(x => `<tr>
      <td>${mesLbl(x.cohorte)}</td>
      <td style="text-align:right">${x.pares}</td>
      <td style="text-align:right">${kg(x.kg_m0)}</td>
      <td style="text-align:right">${cel(x.repite_3)}</td>
      <td style="text-align:right">${cel(x.repite_6)}</td>
      <td style="text-align:right">${cel(x.repite_12)}</td>
      <td style="text-align:right;color:var(--muted)">${x.edad_meses}m</td>
    </tr>`).join('');

    const e = r.expansion || {};
    const expTxt = e.delta == null ? '' : `
      <div style="border:1px solid var(--line);border-radius:10px;padding:12px;margin-top:14px">
        <div class="eyebrow">¿Crecen?</div>
        <div style="font-size:13px;margin-top:4px">
          Sobre ${e.cohortes} cohorte(s) con doce meses cumplidos (${e.pares} pares):
          meses 1 a 6 <b>${kg(e.kg_1a6)}</b> contra meses 7 a 12 <b>${kg(e.kg_7a12)}</b> —
          <b style="color:${e.delta < 0 ? 'var(--danger,#dc2626)' : 'var(--ok,#059669)'}">${(e.delta * 100).toFixed(1)}%</b>.
        </div>
        <div style="font-size:11px;color:var(--muted);margin-top:3px">
          Ventanas del mismo largo a propósito: comparar el acumulado de una cohorte vieja
          contra una joven sólo mide el calendario.
        </div>
      </div>`;

    document.getElementById('cohortes').innerHTML = `
      <div class="hint" style="margin-bottom:10px;color:var(--muted);font-size:12px">
        Cada cohorte es el mes en que nacieron los pares. Se mide siempre a la MISMA edad:
        <b>${pctTxt(r.repite_3)}</b> repite dentro de 3 meses, <b>${pctTxt(r.repite_6)}</b> dentro de 6,
        <b>${pctTxt(r.repite_12)}</b> dentro de 12. La curva se aplana en el primer trimestre —
        por eso la ventana para actuar es ésa.
      </div>
      <div class="table-wrap"><table><thead><tr>
        <th>Cohorte</th><th style="text-align:right">Pares</th><th style="text-align:right">kg mes 0</th>
        <th style="text-align:right">Repite ≤3m</th><th style="text-align:right">≤6m</th><th style="text-align:right">≤12m</th>
        <th style="text-align:right">Edad</th>
      </tr></thead><tbody>${filas}</tbody></table></div>
      <div class="hint" style="margin-top:8px;color:var(--muted);font-size:12px">
        <b>—</b> no es cero: es que la cohorte todavía no cumple esa edad y no se sabe.
        Con pocos pares por mes, un porcentaje suelto tiene mucho ruido; la lectura confiable es la de arriba.
      </div>
      ${expTxt}`;
  }

  // ── Modal: cómo se cuenta ───────────────────────────────────────────────────
  function openComo() {
    const cr = data?.criterio || {};
    const p = data?.periodos || {};
    const bloque = (t, cuerpo) => `
      <div style="border:1px solid var(--line);border-left:4px solid var(--brand,#2563eb);border-radius:12px;padding:14px;margin-bottom:10px">
        <div style="font-weight:700;margin-bottom:4px">${t}</div>
        <div style="font-size:13px;color:var(--muted);line-height:1.5">${cuerpo}</div>
      </div>`;
    const html = `
      <div id="nvComoModal" style="position:fixed;inset:0;z-index:9999;background:rgba(15,23,42,.55);display:flex;justify-content:center;align-items:flex-start;overflow:auto;padding:32px 16px">
        <div style="background:var(--panel,#fff);border-radius:16px;max-width:760px;width:100%;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,.3)">
          <div class="row" style="align-items:flex-start;margin-bottom:12px">
            <div><div class="eyebrow">Radar Comercial</div><h2 style="margin:4px 0 0">Cómo se cuenta una venta nueva</h2></div>
            <button class="btn" id="nvComoClose">Cerrar ✕</button>
          </div>
          ${bloque('La unidad es el par (cliente, producto)',
            'Una venta nueva es la primera vez que un cliente compra una clave de producto. Dos presentaciones distintas del mismo insumo son dos ventas nuevas, porque comercialmente son dos decisiones de compra. La clave se normaliza a mayúsculas: el ERP tiene <code>ade1248</code> y <code>ADE1248</code> y sin eso el mismo par nacería dos veces.')}
          ${bloque('Cliente nuevo contra venta cruzada',
            'Si el cliente también nace ese mes es <b>cliente nuevo</b>; si ya te compraba otra cosa es <b>venta cruzada</b>. No es lo mismo abrir una cuenta que meterle un producto más a un cliente de siempre, y en esta cartera el motor real es lo segundo.')}
          ${bloque(`Reactivación: volvió tras ${cr.hueco_meses ?? 12} meses`,
            `Un par que ya había nacido, dejó de venderse ${cr.hueco_meses ?? 12} meses o más y vuelve, no es nuevo — pero es un evento comercial igual de real, y más barato de repetir. Va aparte para no ensuciar ninguna de las dos lecturas.`)}
          ${bloque(`Seguimiento: ${cr.seguimiento_meses ?? 3} meses`,
            `<b>Pendiente</b> es que todavía no repite pero sigue dentro de la ventana. <b>Perdida</b> es que la ventana ya cerró. La diferencia importa: sin ella un par de hace tres semanas se ve igual de muerto que uno de hace un año. Los ${cr.seguimiento_meses ?? 3} meses salen de la medición, no del gusto — la mitad de las ventas nuevas no repite nunca, y la curva de supervivencia se aplana justo en el primer trimestre.`)}
          ${bloque('Las devoluciones no cuentan como nacimiento',
            'En este ERP las notas de crédito no vienen marcadas: llegan como importes negativos dentro del mismo tipo de movimiento. Un mes que cierra en cero o en negativo no crea una venta nueva ni cuenta como "repitió". Una devolución parcial sí deja nacer al par, con el neto.')}
          ${bloque('El dólar es una porción, no un total',
            'El importe de la línea siempre viene en pesos, también en las facturas en dólares. La cifra en USD es la parte facturada en esa moneda, devuelta a dólares con el tipo de cambio de su propia factura. Por eso se lee "de los cuales" y nunca se suma con el peso.')}
          ${bloque('El arranque del archivo no es un mes bueno',
            `Los datos empiezan el ${p.primer_dato || '—'}. En los primeros meses todo par es nuevo por definición, porque no hay historia detrás. Desde el ${p.piso_cohortes || '—'} las cifras ya son comparables; antes de esa fecha la pantalla lo avisa.`)}
        </div>
      </div>`;
    document.getElementById('nvComoModal')?.remove();
    document.body.insertAdjacentHTML('beforeend', html);
    const m = document.getElementById('nvComoModal');
    document.getElementById('nvComoClose').onclick = () => m.remove();
    m.onclick = e => { if (e.target === m) m.remove(); };
  }

  // ── Eventos de UI ───────────────────────────────────────────────────────────
  document.getElementById('mesFil').onchange = e => cargar(e.target.value);
  ['clienteFil', 'productoFil', 'sublineaFil'].forEach(id => {
    document.getElementById(id).onchange = () => cargar(sel('mesFil'));
  });
  // El seguimiento filtra en memoria: es un atributo de los eventos que ya
  // están en pantalla, no hace falta volver a pedir el mes.
  document.getElementById('segFil').onchange = renderEventos;
  document.getElementById('limpiarBtn').onclick = () => {
    ['clienteFil', 'productoFil', 'sublineaFil', 'segFil'].forEach(id => { document.getElementById(id).value = ''; });
    cargar(sel('mesFil'));
  };
  document.getElementById('comoBtn').onclick = openComo;

  await cargar();
});

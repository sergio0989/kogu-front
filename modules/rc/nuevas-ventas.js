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

    <!--
      Cliente, producto y línea de PP NO son selects nativos: son 179, 275 y 64
      opciones. Un desplegable de ese tamaño tapa media pantalla y obliga a
      buscar a ojo. Cada uno abre un modal con búsqueda; el botón muestra qué
      está aplicado. El seguimiento sí es un select: son cuatro opciones.
    -->
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:14px">
      <button class="btn" id="clienteBtn" data-picker="cliente" style="max-width:300px">Todos los clientes ▾</button>
      <button class="btn" id="productoBtn" data-picker="producto" style="max-width:280px">Todos los productos ▾</button>
      <button class="btn" id="sublineaBtn" data-picker="sublinea" style="max-width:280px">Todas las líneas de PP ▾</button>
      <button class="btn" id="agenteBtn" data-picker="agente" style="max-width:260px">Todos los agentes ▾</button>
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

  <!--
    El ritmo va al final a propósito. Lo que se trabaja a diario es la lista de
    eventos del mes; la gráfica es contexto histórico y, arriba, empujaba la
    lista fuera de la primera pantalla.
  -->
  <div class="card">
    <div class="eyebrow">Ritmo</div>
    <h3 style="margin:4px 0 12px">Ventas nuevas por mes</h3>
    <div id="serie"></div>
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

  // Filtros de cliente / producto / sublínea. Viven aquí y no en el DOM porque
  // ya no son selects: los pone el modal de búsqueda.
  const filtros = { cliente: '', producto: '', sublinea: '', agente: '' };
  const etiquetas = { cliente: '', producto: '', sublinea: '', agente: '' };

  // ── Carga ───────────────────────────────────────────────────────────────────
  async function cargar(mes = null) {
    const qs = new URLSearchParams();
    if (mes) qs.set('mes', mes);
    if (filtros.cliente)  qs.set('cliente',  filtros.cliente);
    if (filtros.producto) qs.set('producto', filtros.producto);
    if (filtros.sublinea) qs.set('sublinea', filtros.sublinea);
    if (filtros.agente)   qs.set('agente',   filtros.agente);
    try {
      const res = await KoguApi.apiFetch(`${BASE}/nuevas-ventas?${qs.toString()}`);
      data = res?.data || res;
      render();
    } catch (err) {
      KoguApi.toast(err.message, 'error');
      document.getElementById('metaInfo').textContent = 'No se pudo cargar.';
    }
  }

  // ── Listas de los pickers ───────────────────────────────────────────────────
  //
  // Se arman UNA vez, con el universo completo. Si se rearmaran en cada carga,
  // filtrar por un cliente dejaría la lista de productos con un solo elemento
  // y ya no se podría cambiar de idea sin limpiar antes.
  const LISTAS = { cliente: [], producto: [], sublinea: [], agente: [] };
  const PICKER = {
    cliente:  { titulo: 'Cliente',     todos: 'Todos los clientes' },
    producto: { titulo: 'Producto',    todos: 'Todos los productos' },
    sublinea: { titulo: 'Línea de PP', todos: 'Todas las líneas de PP' },
    agente:   { titulo: 'Agente',      todos: 'Todos los agentes' },
  };
  let listasListas = false;

  function llenarOpciones(o) {
    if (listasListas || !o) return;
    LISTAS.cliente = (o.clientes || []).map(x => ({
      value: String(x.cliente_ref), label: x.nombre || String(x.cliente_ref),
      sub: `clave ${x.cliente_ref}${Number(x.eventos) ? ` · ${x.eventos} evento(s)` : ''}`,
    }));
    LISTAS.producto = (o.productos || []).map(x => ({
      value: x.cve_prod, label: x.cve_prod,
      sub: x.desc_prod || '', extra: `${Number(x.eventos) ? `${x.eventos} evento(s)` : ''}`,
    }));
    LISTAS.sublinea = (o.sublineas || []).map(x => ({
      value: x.cve_sublinea, label: x.cve_sublinea, sub: x.sublinea_nombre || '',
    }));
    LISTAS.agente = (o.agentes || []).map(x => ({
      value: String(x.agente_id), label: x.nombre || String(x.agente_id),
      sub: Number(x.eventos) ? `${x.eventos} evento(s)` : '',
    }));
    listasListas = true;
    pintarBotones();
  }

  function pintarBotones() {
    for (const k of Object.keys(PICKER)) {
      const btn = document.getElementById(`${k}Btn`);
      if (!btn) continue;
      const activo = !!filtros[k];
      const t = activo ? etiquetas[k] : PICKER[k].todos;
      btn.textContent = `${t.length > 34 ? `${t.slice(0, 33)}…` : t} ▾`;
      btn.title = activo ? `${PICKER[k].titulo}: ${etiquetas[k]} — clic para cambiar` : `Filtrar por ${PICKER[k].titulo.toLowerCase()}`;
      // El filtro activo se ve sin tener que leer: si no, con tres botones que
      // dicen "Todos" y uno que no, nadie nota cuál está aplicado.
      btn.style.borderColor = activo ? 'var(--brand,#2563eb)' : '';
      btn.style.color = activo ? 'var(--brand,#2563eb)' : '';
      btn.style.fontWeight = activo ? '700' : '';
    }
  }

  // Búsqueda sin acentos ni mayúsculas: nadie escribe "Sabores Lácteos" con el
  // acento puesto, y la lista de PP está llena de ellos.
  const plano = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  function abrirPicker(clave) {
    const cfg = PICKER[clave];
    const items = LISTAS[clave] || [];
    const html = `
      <div id="nvPicker" style="position:fixed;inset:0;z-index:10000;background:rgba(15,23,42,.55);display:flex;justify-content:center;align-items:flex-start;padding:48px 16px">
        <div style="background:var(--panel,#fff);border-radius:16px;max-width:560px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.3);display:flex;flex-direction:column;max-height:calc(100vh - 96px)">
          <div style="padding:18px 20px 12px;border-bottom:1px solid var(--line)">
            <div class="row" style="align-items:flex-start">
              <div><div class="eyebrow">Filtrar por</div><h3 style="margin:2px 0 0">${esc(cfg.titulo)}</h3></div>
              <button class="btn" id="nvPickerClose">Cerrar ✕</button>
            </div>
            <input class="input" id="nvPickerQ" type="text" autocomplete="off"
                   placeholder="Escribe para buscar — Enter elige el primero"
                   style="width:100%;margin-top:12px"/>
            <div id="nvPickerCount" style="font-size:11px;color:var(--muted);margin-top:6px"></div>
          </div>
          <div id="nvPickerList" style="overflow:auto;padding:8px"></div>
        </div>
      </div>`;
    document.getElementById('nvPicker')?.remove();
    document.body.insertAdjacentHTML('beforeend', html);

    const modal = document.getElementById('nvPicker');
    const inp = document.getElementById('nvPickerQ');
    const lista = document.getElementById('nvPickerList');
    const cont = document.getElementById('nvPickerCount');
    const cerrar = () => { modal.remove(); document.removeEventListener('keydown', onKey); };

    let visibles = items;
    const pintar = () => {
      const q = plano(inp.value.trim());
      visibles = !q ? items
        : items.filter(x => plano(x.label).includes(q) || plano(x.sub).includes(q) || plano(x.value).includes(q));
      cont.textContent = q
        ? `${visibles.length} de ${items.length} coinciden`
        : `${items.length} opciones`;
      const fila = (val, titulo, sub, activo) => `
        <div data-val="${esc(val)}" style="padding:8px 12px;border-radius:8px;cursor:pointer;${activo ? 'background:rgba(37,99,235,.08)' : ''}">
          <div style="font-weight:${activo ? '700' : '600'};font-size:13px">${activo ? '✓ ' : ''}${esc(titulo)}</div>
          ${sub ? `<div style="font-size:11px;color:var(--muted)">${esc(sub)}</div>` : ''}
        </div>`;
      lista.innerHTML =
        fila('', cfg.todos, 'quita este filtro', !filtros[clave])
        + (visibles.length
            ? visibles.map(x => fila(x.value, x.label, [x.sub, x.extra].filter(Boolean).join(' · '), filtros[clave] === x.value)).join('')
            : '<div class="empty" style="padding:16px">Ninguna opción coincide</div>');
      lista.querySelectorAll('[data-val]').forEach(el => {
        el.onmouseenter = () => { if (el.style.background === '') el.style.background = 'var(--panel2,#f1f5f9)'; };
        el.onmouseleave = () => { if (el.style.background === 'var(--panel2, #f1f5f9)') el.style.background = ''; };
        el.onclick = () => elegir(el.dataset.val);
      });
    };

    const elegir = val => {
      filtros[clave] = val || '';
      etiquetas[clave] = val ? (items.find(x => x.value === val)?.label || val) : '';
      cerrar();
      pintarBotones();
      cargar(sel('mesFil'));
    };

    const onKey = e => {
      if (e.key === 'Escape') { cerrar(); return; }
      // Enter elige la primera coincidencia: con una búsqueda que deja un solo
      // resultado, obligar a apuntar con el mouse es trabajo de más.
      if (e.key === 'Enter' && document.activeElement === inp) {
        if (!inp.value.trim()) return;
        if (visibles.length) elegir(visibles[0].value);
      }
    };

    inp.oninput = pintar;
    document.addEventListener('keydown', onKey);
    document.getElementById('nvPickerClose').onclick = cerrar;
    modal.onclick = e => { if (e.target === modal) cerrar(); };
    pintar();
    inp.focus();
  }

  // Meses comparables: del piso en adelante. Los del arranque del archivo NO se
  // ofrecen — ahí todo par es nuevo por definición porque no hay historia
  // detrás, así que elegir uno sólo produce un número que no significa nada.
  const desdePiso = serie => {
    const piso = data?.periodos?.piso_cohortes;
    return (serie || []).filter(s => !piso || new Date(s.mes) >= new Date(piso));
  };

  function llenarMeses(serie, mesActual) {
    const el = document.getElementById('mesFil');
    if (el.options.length && el.value) return;   // ya está armado
    const piso = data?.periodos?.piso_cohortes;
    // "Todos los meses" quita el filtro de fecha: es la vista para revisar de
    // corrido todo lo que se perdió, sin ir mes por mes.
    const opts = `<option value="todos">Todos los meses</option>`
      + desdePiso(serie).reverse().map(s =>
          `<option value="${mesKey(s.mes)}">${mesLbl(s.mes)}</option>`).join('');
    el.innerHTML = opts;
    el.value = data?.periodos?.todos_los_meses ? 'todos' : mesKey(mesActual);
    el.title = piso ? `Meses comparables desde ${piso}` : '';
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  function render() {
    if (!data) return;
    const p = data.periodos, k = data.kpis, cr = data.criterio;

    llenarOpciones(data.opciones);
    llenarMeses(data.serie, p.mes);

    const todos = !!p.todos_los_meses;
    document.getElementById('metaInfo').innerHTML =
      (todos
        ? `<b>Todos los meses</b> desde ${esc(p.piso_cohortes)} · datos al ${esc(p.ultimo_dato)}`
        : `Mes <b>${mesLbl(p.mes)}</b> · datos al ${esc(p.ultimo_dato)}`)
      + (p.mes_en_curso_excluido ? ' · el mes en curso queda fuera (sólo meses cerrados)' : '')
      + (p.eventos_truncados ? ' · <b>lista recortada</b>: filtra para verla completa' : '')
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
    const todos = !!p.todos_los_meses;
    const av = [];

    // Un mes donde un renglón se lleva casi todo NO mide ritmo comercial: mide
    // un pedido. Decirlo evita que alguien lea el promedio como cadencia.
    if (con?.avisar) {
      av.push(`<div style="border:1px solid var(--warning,#d97706);border-left:4px solid var(--warning,#d97706);border-radius:10px;padding:10px 12px;font-size:12px">
        <b>Un solo renglón es el ${pctTxt(con.share_kg)} del volumen nuevo ${todos ? 'del periodo' : 'del mes'}</b> —
        ${esc(con.cliente_nombre)} / ${esc(con.cve_prod)}, ${kg(con.kg)}.
        ${todos
          ? `Un solo par pesa más que todo lo demás junto: sin él el periodo cierra en ${kg(con.kg_sin_top)}.`
          : `Este mes no mide ritmo comercial, mide un pedido: sin ese par cierra en ${kg(con.kg_sin_top)}.`}
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

    if (todos) {
      av.push(`<div style="border:1px solid var(--line);border-left:4px solid var(--brand,#2563eb);border-radius:10px;padding:10px 12px;font-size:12px;color:var(--muted)">
        Sin filtro de fecha: la lista trae <b>todos los eventos desde ${esc(p.piso_cohortes)}</b>, mezclando meses.
        Cada renglón lleva su mes de nacimiento. Es la vista para revisar de corrido lo que se perdió —
        combínala con el filtro <b>Perdidas</b>.
      </div>`);
    }

    document.getElementById('avisos').innerHTML =
      av.length ? `<div class="stack" style="gap:8px">${av.join('')}</div>` : '';
  }

  function renderKpis() {
    const k = data.kpis;
    const shareVol = k.kg_mes_total ? k.kg / k.kg_mes_total : null;
    // Cada categoría lleva su porcentaje. "5 y 16" no dice si el negocio crece
    // por cuentas nuevas o por venta cruzada; "24% y 76%" sí, y ese reparto es
    // la lectura de fondo: en esta cartera el motor es meterle un producto más
    // a un cliente que ya se tiene, no abrir cuentas.
    const share = (n, tot) => tot ? ` (${Math.round(100 * n / tot)}%)` : '';
    const totalEventos = k.nuevas + k.reactivadas;
    const totalSeg = k.repitieron + k.pendientes + k.perdidas;
    document.getElementById('kpis').innerHTML = [
      miniCard('Ventas nuevas', String(k.nuevas),
        `${k.cliente_nuevo} cliente nuevo${share(k.cliente_nuevo, k.nuevas)} · ${k.venta_cruzada} venta cruzada${share(k.venta_cruzada, k.nuevas)}`),
      miniCard('Volumen nuevo', kg(k.kg),
        shareVol != null ? `${pctTxt(shareVol)} del volumen ${data.periodos.todos_los_meses ? 'del periodo' : 'del mes'}` : ''),
      miniCard('Importe', money(k.mxn),
        Number(k.usd) ? `de los cuales ${usd(k.usd)} facturados en dólares` : 'sin facturación en dólares'),
      miniCard('Reactivaciones', String(k.reactivadas),
        `${share(k.reactivadas, totalEventos).replace(/[() ]/g, '')} de los eventos · ${kg(k.kg_react)}`,
        Number(k.reactivadas) ? 'var(--warning,#d97706)' : ''),
      miniCard('Seguimiento', `${k.repitieron} / ${k.pendientes} / ${k.perdidas}`,
        `repitieron${share(k.repitieron, totalSeg)} · pendientes${share(k.pendientes, totalSeg)} · perdidas${share(k.perdidas, totalSeg)}`,
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
    const vis = desdePiso(s).slice(-24);
    if (!vis.length) { document.getElementById('serie').innerHTML = '<div class="empty">Sin meses comparables</div>'; return; }
    const max = Math.max(1, ...vis.map(x => Number(x.cliente_nuevo) + Number(x.venta_cruzada)));
    document.getElementById('serie').innerHTML = vis.map(x => {
      const cn = Number(x.cliente_nuevo), vc = Number(x.venta_cruzada), re = Number(x.reactivadas);
      const tot = cn + vc;
      const wc = Math.round(100 * cn / max), wv = Math.round(100 * vc / max);
      const t = `${mesLbl(x.mes)}: ${tot} nuevas (${cn} cliente nuevo, ${vc} cruzada)`
              + `, ${re} reactivaciones, ${kg(x.kg)}, ${money(x.mxn)}`;
      return `<div style="display:flex;align-items:center;gap:10px;margin:4px 0" title="${esc(t)}">
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
           <span>Desde ${esc(data.periodos.piso_cohortes)}: antes de esa fecha no hay historia detrás y todo par sale "nuevo".</span>
         </div>`;
  }

  function renderEventos() {
    const segF = sel('segFil');
    const todos = !!data.periodos.todos_los_meses;
    const lista = data.eventos || [];
    const ev = segF ? lista.filter(e => e.seguimiento === segF) : lista;

    document.getElementById('tituloLista').textContent =
      (todos ? `Eventos desde ${data.periodos.piso_cohortes}` : `Eventos de ${mesLbl(data.periodos.mes)}`)
      + (segF ? ` · ${SEG[segF].txt.replace(/^[^ ]+ /, '')}` : '');

    if (!ev.length) {
      document.getElementById('eventos').innerHTML =
        `<div class="empty">${lista.length ? 'Ningún evento con ese seguimiento' : 'Sin ventas nuevas ni reactivaciones en el periodo'}</div>`;
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
        ${todos ? `<td style="font-size:12px;color:var(--muted);white-space:nowrap">${mesLbl(e.mes)}</td>` : ''}
        <td><span style="display:inline-block;padding:2px 9px;border-radius:999px;font-size:10px;font-weight:600;color:#fff;background:${t.bg}">${t.txt}</span></td>
        <td>
          <div style="font-weight:600">${esc(e.cliente_nombre)}${e.en_catalogo ? '' : ' <span title="No está en el catálogo de clientes" style="color:var(--warning,#d97706);font-size:11px">⚠ sin alta</span>'}</div>
          <div style="font-size:11px;color:var(--muted)">clave ${esc(e.cliente_ref)}</div>
        </td>
        <td style="font-size:12px">${e.agente_nombre
          ? esc(e.agente_nombre)
          : '<span style="color:var(--warning,#d97706)" title="El cliente no tiene agente asignado en cat_clientes">sin agente</span>'}</td>
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
    // Un evento sin agente no le llega a nadie: no lo ve ningún vendedor al
    // filtrar su cartera. Vale la pena decirlo, no sólo pintarlo en ámbar.
    const sinAgente = ev.filter(e => !e.agente_nombre).length;
    document.getElementById('eventos').innerHTML = `
      <div class="table-wrap"><table><thead><tr>
        ${todos ? '<th>Mes</th>' : ''}<th>Tipo</th><th>Cliente</th><th>Agente</th><th>Producto</th>
        <th style="text-align:right">kg</th><th style="text-align:right">MXN</th><th style="text-align:right">USD</th>
        <th>PP</th><th>Seguimiento</th>
      </tr></thead><tbody>${ev.map(fila).join('')}</tbody></table></div>
      <div class="hint" style="margin-top:8px;color:var(--muted);font-size:12px">
        ${ev.length} evento(s) · ${kg(sumKg)}${segF ? ` de ${lista.length} en ${todos ? 'el periodo' : 'el mes'}` : ''} ·
        ordenados por volumen. El importe en dólares es la porción facturada en esa moneda, no un total aparte.
        ${sinAgente ? `<br><b>${sinAgente} sin agente asignado</b> — no aparecen al filtrar por agente y nadie les da seguimiento.` : ''}
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
  document.querySelectorAll('[data-picker]').forEach(b => {
    b.onclick = () => abrirPicker(b.dataset.picker);
  });
  // El seguimiento filtra en memoria: es un atributo de los eventos que ya
  // están en pantalla, no hace falta volver a pedir el mes.
  document.getElementById('segFil').onchange = renderEventos;
  document.getElementById('limpiarBtn').onclick = () => {
    Object.keys(filtros).forEach(k => { filtros[k] = ''; etiquetas[k] = ''; });
    document.getElementById('segFil').value = '';
    pintarBotones();
    cargar(sel('mesFil'));
  };
  document.getElementById('comoBtn').onclick = openComo;

  await cargar();
});

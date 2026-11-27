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

  // ── Color ──────────────────────────────────────────────────────────
  // Dos familias que NO se mezclan.
  //
  // ESTADO (reservados): bueno / atención / mal. Nunca se reusan como
  // "categoría 3", y nunca viajan solos: cada tarjeta en color lleva su
  // cifra y su frase, para quien no distingue los tonos y para quien
  // imprime en blanco y negro.
  const EST = { ok: '#16a34a', warn: '#d97706', mal: '#dc2626', neutro: '#64748b' };

  // IDENTIDAD: las cubetas de volumen son identidades, no estados. Cian
  // (el primary de KOGU) e índigo, validados contra fondo blanco: ΔE 13.0
  // en deuteranopía y 17.0 en visión normal, ambos sobre el piso. El gris
  // de "sin motivo" es deliberado: es ausencia de información, no una
  // categoría más.
  //
  // La tercera identidad —"sin compra"— entra con el corte de tres cubetas del
  // 21-oct. Rosa 700 contra los otros dos: ΔE2000 62.5 contra el cian y 33.6
  // contra el índigo en visión normal, y además L* 41.8 contra 55.6 y 50.1, o
  // sea que también se separan por claridad y no sólo por tono. La separación
  // en deuteranopía NO se volvió a medir aquí: por eso ninguna cubeta depende
  // del color — cada una lleva su rótulo, su cifra y su base de tiempo escrita.
  const IDENT = {
    caida: '#0891b2', sinCompra: '#be185d', deriva: '#6366f1', sinMotivo: '#94a3b8',
  };

  // Banda de desempeño de una proporción.
  const banda = (v) => (v == null ? EST.neutro : v >= 0.7 ? EST.ok : v >= 0.4 ? EST.warn : EST.mal);

  const card = (lbl, val, hint = '', acento = EST.neutro, opts = {}) => `
    <div style="border:1px solid var(--line);border-left:3px solid ${acento};border-radius:12px;padding:12px 14px;min-width:0;${opts.tinte ? `background:${opts.tinte}` : ''}">
      <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em">${esc(lbl)}</div>
      <div style="font-size:22px;font-weight:800;line-height:1.15;margin-top:2px;color:${opts.valor ? acento : 'var(--text)'}">${esc(val)}</div>
      ${hint ? `<div style="font-size:11px;color:var(--muted);margin-top:2px">${hint}</div>` : ''}
    </div>`;

  const ORIGEN_TXT = { 'mi-panel': 'Radar · Mi panel', manual: 'Manual', 'comex-recon': 'Comex' };

  // Vocabulario de cierre consolidado el 20-oct: describe qué pasó con el
  // cliente, que es la pregunta de la revisión comercial.
  const RES_TXT = {
    aumento: 'Aumento', estable: 'Estable', disminucion: 'Disminución',
    baja_temporal: 'Baja temporal', baja_total: 'Baja total',
    nuevo_cliente: 'Nuevo cliente', spot: 'Spot', seguimiento: 'Seguimiento',
    no_aplica: 'No aplica', completada: 'Completada',
  };
  const RES_ORDEN = ['aumento', 'estable', 'disminucion', 'baja_temporal',
    'baja_total', 'nuevo_cliente', 'spot', 'seguimiento', 'no_aplica', 'completada'];

  const c = document.getElementById('pageContent');
  c.innerHTML = `
<div class="stack" style="gap:16px">
  <div class="card">
    <div class="row">
      <div><div class="eyebrow">CRM · Indicadores</div><h2>KPIs de seguimiento</h2>
        <div class="hint" style="margin-top:4px;color:var(--muted)">Cómo se está atendiendo lo que detecta el Radar Comercial.</div>
      </div>
    </div>
    <div id="kpiFiltros" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px;align-items:end;margin-top:14px">
      <div><div class="label-text">Desde</div><input class="input" id="kpiDesde" type="date" style="width:100%"/></div>
      <div><div class="label-text">Hasta</div><input class="input" id="kpiHasta" type="date" style="width:100%"/></div>
      <div><div class="label-text">Origen</div>
        <select class="select" id="kpiOrigen" style="width:100%">
          <option value="">Todos los orígenes</option>
          <option value="mi-panel">Radar · Mi panel</option>
          <option value="manual">Manual</option>
          <option value="comex-recon">Comex</option>
        </select>
      </div>
      <div><div class="label-text">Agente</div>
        <select class="select" id="kpiAgente" style="width:100%">
          <option value="">Todos los agentes</option>
        </select>
      </div>
      <div><div class="label-text">Mes analizado</div>
        <input class="input" id="kpiPeriodo" type="month" style="width:100%"/>
      </div>
      <div><div class="label-text">Severidad</div>
        <select class="select" id="kpiSev" style="width:100%">
          <option value="">Toda severidad</option>
          <option value="critica">Crítica</option>
          <option value="alerta">Alerta</option>
          <option value="info">Info</option>
        </select>
      </div>
    </div>
    <div id="kpiChips" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:12px"></div>
  </div>
  <div id="kpiCuerpo"></div>
</div>`;

  $('kpiDesde').value = haceDias(90);
  $('kpiHasta').value = hoyISO();

  // El recorte que produjo las cifras. Vive en UN solo lugar porque lo
  // consumen dos: el encabezado del bloque de resultados —para que viaje
  // con los números en una captura— y los chips, que además lo dejan quitar.
  function recorteActivo(d) {
    const f = (d && d.filtro) || {};
    const out = [];
    if (f.agente_id) out.push({ clave: 'agente', etq: 'Agente', val: AGENTES[f.agente_id] || f.agente_id });
    if (f.periodo) out.push({ clave: 'periodo', etq: 'Mes analizado', val: fmtMes(f.periodo) });
    if (f.origen) out.push({ clave: 'origen', etq: 'Origen', val: ORIGEN_TXT[f.origen] || f.origen });
    if (f.severidad) out.push({ clave: 'severidad', etq: 'Severidad', val: esc(f.severidad) });
    return out;
  }

  const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun',
    'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const fmtMes = (v) => {
    const m = String(v || '').match(/^(\d{4})-(\d{2})/);
    return m ? `${MESES_CORTOS[Number(m[2]) - 1]} ${m[1]}` : String(v || '');
  };

  const CAMPO_DE = { agente: 'kpiAgente', periodo: 'kpiPeriodo', origen: 'kpiOrigen', severidad: 'kpiSev' };

  function pintarChips(d) {
    const act = recorteActivo(d);
    $('kpiChips').innerHTML = act.map((x) => `
      <span class="chip" style="display:inline-flex;align-items:center;gap:6px;padding:4px 6px 4px 11px;border:1px solid var(--line);border-radius:999px;background:var(--panel);font-size:13px">
        <span style="color:var(--muted)">${esc(x.etq)}:</span> <b>${esc(x.val)}</b>
        <button type="button" data-quita="${esc(x.clave)}" title="Quitar filtro" aria-label="Quitar"
          style="border:0;background:transparent;cursor:pointer;color:var(--muted);font-size:15px;line-height:1;padding:0 3px">\u00d7</button>
      </span>`).join('');
  }

  // El MISMO vocabulario que Mi panel. "Dormancia" es el nombre de la regla
  // RC-004: el vendedor lee "Sin compra" en su lista y tiene que leer lo mismo
  // aquí, o son dos pantallas del mismo módulo hablando distinto de la misma
  // señal.
  const MOTIVO_TXT = {
    // Vocabulario del 27-nov (opción A), el mismo de Mi panel y la Bandeja.
    caida: 'Caída reciente',
    sin_compra: 'Sin compra',
    deriva: 'Baja sostenida',
    sin_motivo: 'Sin motivo',
  };
  const SEV_COLOR = { critica: EST.mal, alerta: EST.warn, info: EST.neutro };
  const SEV_TXT = { critica: 'Crítica', alerta: 'Alerta', info: 'Info' };
  const EST_TXT = { abierta: 'Abierta', en_proceso: 'En proceso', cerrada: 'Cerrada', cancelada: 'Cancelada' };

  // Tabla de detalle. Una fila por ACTIVIDAD y SIN fila de totales: cada
  // renglón tiene un motivo y una unidad, así que la tabla es honesta por
  // construcción, pero sumar su columna de kg volvería a mezclar doce
  // meses con un bimestre. El agregado vive abajo, por motivo.
  // El nombre del cliente lleva a su actividad: de la cifra a la
  // conversación. El detalle completo —bitácora, comentarios con
  // @menciones, seguidores, acciones— ya vive en actividades.html; aquí solo
  // se liga, en vez de hacer una segunda copia que terminaría divergiendo.
  //
  // Va en el nombre y no en una columna nueva porque la tabla ya tiene diez
  // columnas y se desplaza de lado; y abre en la MISMA ventana, que fue la
  // decisión del 24-nov: una pestaña por fila confunde más de lo que ayuda.
  //
  // Sin `actividad_id` no se pinta liga: más vale texto plano que una liga
  // muerta.
  function nombreConLiga(f) {
    const nombre = `<b>${esc(f.cliente)}</b>`;
    if (!f.actividad_id) return nombre;
    return `<a href="/modules/crm/actividades.html?act=${encodeURIComponent(f.actividad_id)}"
      data-act-id="${esc(f.actividad_id)}"
      title="Ver la retroalimentación de esta actividad"
      style="color:inherit;text-decoration:none;border-bottom:1px solid var(--line)">${nombre}</a>`;
  }

  // ── Detalle de la actividad, dentro de la pantalla y de SOLO LECTURA ──
  //
  // Por qué aquí y no navegando: estos KPIs se leen explicando, y salir de la
  // pantalla corta la frase. Peor: el recorte —agente, mes analizado— vive en
  // los filtros y no en la URL, así que volver con el botón del navegador lo
  // tira. Medido en uso real el 24-nov.
  //
  // Por qué SOLO LECTURA, y es la decisión importante: las @menciones no se
  // parsean en el backend, el front manda los `user_id` que produce su
  // autocompletado. Una caja de comentarios aquí o reimplementaba ese
  // buscador, o degradaba las menciones en silencio —se ve igual, no suma
  // seguidor, no avisa a nadie—. Dos pantallas que se ven iguales y se portan
  // distinto es peor que una pantalla menos. Para actuar está la liga a
  // Actividades, que abre aparte y deja estos KPIs intactos.
  //
  // La liga conserva su `href`: el clic normal abre el modal, pero ctrl+clic
  // y "abrir en pestaña nueva" siguen funcionando como en cualquier liga.
  function cerrarDetalleModal() {
    document.getElementById('kpiDetalleModal')?.remove();
    document.removeEventListener('keydown', escDetalle);
  }
  function escDetalle(e) { if (e.key === 'Escape') cerrarDetalleModal(); }

  const DET_EST = { abierta: 'Abierta', en_proceso: 'En proceso', cerrada: 'Cerrada', cancelada: 'Cancelada' };

  // Resalta las @menciones del texto ya escapado, igual que la bitácora de
  // Actividades: el nombre mencionado se lee distinto del resto.
  const conMenciones = (t) => String(t || '').replace(/(@[\wÁÉÍÓÚÑáéíóúñ.]+)/g,
    `<span style="color:var(--brand,#2563eb);font-weight:600">$1</span>`);

  // Fecha y hora de un comentario, sin segundos: `KoguUi.fmtDate` usa
  // toLocaleString y arrastra `8:31:15 a.m.`, que es ruido cuando esto se lee
  // en voz alta en una junta. Es un timestamp real, así que va en hora local
  // -aquí sí corresponde- y no por el camino de las fechas sin hora.
  const fechaHora = (v) => {
    if (!v) return '';
    const d = new Date(v);
    if (isNaN(d)) return String(v);
    return d.toLocaleString('es-MX', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
  };

  function detalleHtml(d) {
    const dato = (etq, val, ancho = 1) => `
      <div style="min-width:0${ancho > 1 ? `;grid-column:span ${ancho}` : ''}">
        <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em">${esc(etq)}</div>
        <div style="font-weight:600;margin-top:1px;word-break:break-word">${val}</div>
      </div>`;

    const fecha = (v) => (v ? esc(KoguUi.fmtDateOnly(v)) : '—');
    const prods = ((d.snapshot && d.snapshot.productos) || []).slice(0, 40);
    const snapshot = prods.length ? `
      <div style="margin-top:14px">
        <div class="eyebrow" style="margin-bottom:6px">Snapshot al crear · ${prods.length} partida${prods.length === 1 ? '' : 's'}</div>
        <div style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse;font-size:13px">
            <thead><tr>
              <th style="text-align:left;padding:5px 8px 5px 0;font-size:11px;color:var(--muted);text-transform:uppercase">Cve</th>
              <th style="text-align:left;padding:5px 8px 5px 0;font-size:11px;color:var(--muted);text-transform:uppercase">Producto</th>
              <th style="text-align:right;padding:5px 0;font-size:11px;color:var(--muted);text-transform:uppercase">P1</th>
              <th style="text-align:right;padding:5px 0;font-size:11px;color:var(--muted);text-transform:uppercase">P2</th>
            </tr></thead>
            <tbody>${prods.map((p) => `
              <tr>
                <td style="padding:5px 8px 5px 0;border-top:1px solid var(--line)">${esc(p.cve_prod || '')}</td>
                <td style="padding:5px 8px 5px 0;border-top:1px solid var(--line)">${esc((p.desc_prod || '').trim())}</td>
                <td style="padding:5px 0;border-top:1px solid var(--line);text-align:right;font-variant-numeric:tabular-nums">${nf0.format(Number(p.cant_p1 || 0))} kg</td>
                <td style="padding:5px 0;border-top:1px solid var(--line);text-align:right;font-variant-numeric:tabular-nums">${nf0.format(Number(p.cant_p2 || 0))} kg</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>` : '';

    const coments = (d.comentarios || []).length
      ? (d.comentarios || []).map((x) => `
        <div style="border-left:2px solid var(--line);padding:0 0 10px 12px;margin-bottom:2px">
          <div style="display:flex;gap:8px;align-items:baseline;flex-wrap:wrap">
            <span style="font-weight:600;font-size:13px">${esc(x.autor_nombre || 'Usuario')}</span>
            <span style="font-size:12px;color:var(--muted)">${esc(fechaHora(x.created_at))}</span>
          </div>
          ${x.comentario ? `<div style="white-space:pre-wrap;font-size:13px;margin-top:2px">${conMenciones(esc(x.comentario))}</div>` : ''}
          ${x.tiene_adjunto ? `<div style="font-size:12px;color:var(--muted);margin-top:3px">📎 ${esc(x.adjunto_nombre || 'archivo')}</div>` : ''}
        </div>`).join('')
      : '<div class="empty">Sin comentarios.</div>';

    const chips = (arr, campo) => (arr || []).length
      ? (arr || []).map((x) => `<span style="display:inline-block;padding:2px 9px;border:1px solid var(--line);border-radius:999px;font-size:12px;margin:0 5px 5px 0">${esc(x[campo] || '')}</span>`).join('')
      : '<span style="font-size:12px;color:var(--muted)">—</span>';

    return `
    <div id="kpiDetalleModal" data-cerrar-fondo
      style="position:fixed;inset:0;z-index:9999;background:rgba(15,23,42,.55);display:flex;justify-content:center;align-items:flex-start;overflow:auto;padding:18px 16px">
      <div style="background:var(--panel,#fff);border-radius:14px;max-width:820px;width:100%;margin:auto;padding:20px 22px;box-shadow:0 18px 50px rgba(0,0,0,.25)">

        <div style="display:flex;justify-content:space-between;gap:14px;align-items:flex-start">
          <div style="min-width:0">
            <div class="eyebrow">CRM · Retroalimentación</div>
            <h2 style="margin:3px 0 4px;word-break:break-word">${esc(d.cliente_nombre || d.cliente_ref || 'Actividad')}</h2>
            <div style="font-size:13px;color:var(--muted)">
              ${esc(DET_EST[d.estado] || d.estado || '')}
              ${d.severidad ? ` · <span style="color:${SEV_COLOR[d.severidad] || EST.neutro}">${esc(SEV_TXT[d.severidad] || d.severidad)}</span>` : ''}
              ${d.titulo ? ` · ${esc(d.titulo)}` : ''}
            </div>
          </div>
          <button class="btn" data-cerrar-detalle style="flex:none">Cerrar</button>
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-top:16px;padding:12px 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line)">
          ${dato('En riesgo', `${nf0.format(Number(d.kg_riesgo || 0))} kg · ${money(d.monto_riesgo || 0)}`, 2)}
          ${dato('Mes analizado', d.periodo_analizado ? esc(fmtMes(d.periodo_analizado)) : '—')}
          ${dato('Apertura', fecha(d.created_at))}
          ${dato('Vence', fecha(d.fecha_limite))}
          ${dato('Cierre', fecha(d.fecha_cierre))}
          ${dato('Resultado', d.resultado ? esc(RES_TXT[d.resultado] || d.resultado) : '—')}
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-top:14px">
          ${dato('Agente responsable', esc(d.agente_nombre || '—'))}
          ${dato('Creada por', esc(d.creada_por_nombre || '—'))}
          ${dato('Tomada por', esc(d.tomada_por_nombre || '—'))}
        </div>

        ${d.descripcion ? `
        <div style="margin-top:16px">
          <div class="eyebrow" style="margin-bottom:5px">Nota / plan de acción</div>
          <div style="white-space:pre-wrap;font-size:14px">${esc(d.descripcion)}</div>
        </div>` : ''}

        ${snapshot}

        <div style="margin-top:18px">
          <div class="eyebrow" style="margin-bottom:8px">Bitácora</div>
          ${coments}
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;margin-top:16px">
          <div><div class="eyebrow" style="margin-bottom:6px">Seguidores</div>${chips(d.seguidores, 'nombre')}</div>
          <div><div class="eyebrow" style="margin-bottom:6px">Etiquetas</div>${chips(d.etiquetas, 'nombre')}</div>
        </div>

        <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;margin-top:20px;padding-top:14px;border-top:1px solid var(--line);flex-wrap:wrap">
          <div style="font-size:12px;color:var(--muted)">Esta vista solo lee. Para comentar, tomar o cerrar, abre la actividad.</div>
          <a class="btn primary" target="_blank" rel="noopener"
             href="/modules/crm/actividades.html?act=${encodeURIComponent(d.actividad_id)}">Abrir en Actividades ↗</a>
        </div>

      </div>
    </div>`;
  }

  async function abrirDetalleActividad(id) {
    let d;
    try {
      const res = await KoguApi.apiFetch(`${BASE}/actividades/${encodeURIComponent(id)}`);
      d = res?.data || res;
    } catch (err) { KoguApi.toast(err.message, 'error'); return; }
    cerrarDetalleModal();
    document.body.insertAdjacentHTML('beforeend', detalleHtml(d));
    const modal = document.getElementById('kpiDetalleModal');
    modal.querySelector('[data-cerrar-detalle]').onclick = cerrarDetalleModal;
    modal.addEventListener('click', (e) => { if (e.target === modal) cerrarDetalleModal(); });
    document.addEventListener('keydown', escDetalle);
  }

  function tablaDetalle(d) {
    const filas = d.detalle || [];
    if (!filas.length) {
      return '<div class="empty">Sin actividades en este recorte.</div>';
    }
    const th = (t, n) => `<th style="text-align:${n ? 'right' : 'left'};padding:7px 10px;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);white-space:nowrap">${esc(t)}</th>`;
    const td = (c, n, extra) => `<td style="padding:7px 10px;border-top:1px solid var(--line);text-align:${n ? 'right' : 'left'};${extra || ''}">${c}</td>`;

    return `<div style="overflow-x:auto">
      <table id="kpiTabla" style="width:100%;border-collapse:collapse;font-size:13px">
        <thead><tr>
          ${th('Cliente')}${th('Agente')}${th('Mes analizado')}${th('Motivo')}
          ${th('Severidad')}${th('En riesgo kg', true)}${th('En riesgo MXN', true)}
          ${th('Estado')}${th('Días', true)}${th('Resultado')}
        </tr></thead>
        <tbody>
          ${filas.map((f) => `<tr${f.vencida ? ' style="background:var(--danger-bg,#fee2e2)"' : ''}>
            ${td(`${nombreConLiga(f)}${f.vencida ? ` <span style="color:${EST.mal};font-size:11px;font-weight:700">VENCIDA</span>` : ''}`)}
            ${td(esc(f.agente || '—'))}
            ${td(f.periodo_analizado ? esc(fmtMes(f.periodo_analizado)) : '—')}
            ${td(esc(((f.motivos && f.motivos.length ? f.motivos : [f.motivo])
              .map((m) => MOTIVO_TXT[m] || m)).join(' + ')))}
            ${td(`<span style="color:${SEV_COLOR[f.severidad] || EST.neutro}">${esc(SEV_TXT[f.severidad] || f.severidad || '—')}</span>`)}
            ${td(nf0.format(f.kg || 0), true)}
            ${td(money(f.mxn || 0), true)}
            ${td(esc(EST_TXT[f.estado] || f.estado))}
            ${td(f.dias_cierre != null ? `${f.dias_cierre} en cerrar` : (f.dias_abierta != null ? `${f.dias_abierta} abierta` : '—'), true)}
            ${td(f.resultado ? esc(RES_TXT[f.resultado] || f.resultado) : '—')}
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  }

  // El clic normal abre el modal; ctrl/cmd+clic y el botón de en medio se
  // dejan pasar para que la liga siga siendo una liga.
  function ligarDetalle() {
    document.querySelectorAll('#kpiTabla a[data-act-id]').forEach((a) => {
      a.addEventListener('click', (e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
        e.preventDefault();
        abrirDetalleActividad(a.dataset.actId);
      });
    });
  }

  function pintar(d) {
    const v = d.volumen || {};
    const sinMotivo = (v.sin_motivo && v.sin_motivo.actividades) || 0;
    const enCeroTotal = ['caida', 'sin_compra', 'deriva', 'sin_motivo']
      .reduce((t, k) => t + ((v[k] && v[k].en_cero) || 0), 0);

    const origenes = Object.entries(d.creadas.por_origen || {})
      .map(([k, n]) => `${esc(ORIGEN_TXT[k] || k)}: ${n}`).join(' · ') || '—';

    const vencidas = d.pendiente.vencidas || 0;
    const des = d.desenlace || {};

    // Desenlace: el titular nombra el desenlace que MÁS ocurrió, no uno fijo.
    //
    // Antes el titular era siempre "N en aumento". Con una sola actividad
    // cerrada en estable, la tarjeta decía "0 en aumento" en tipografía
    // grande y "1 estable" en chico (visto en dev el 30-oct): un cero grande
    // se lee como "no pasó nada", y sí pasó. Con el vocabulario de diez
    // valores, estable, spot y seguimiento son desenlaces legítimos y no
    // fracasos, así que el titular no puede estar clavado en uno solo.
    //
    // El aumento NO se pierde: cuando no es el dominante, el pie lo dice
    // —"ninguna en aumento"— porque ese sí es el dato que gerencia busca.
    // Lo que se quita es el cero en grande, no la información.
    //
    // Los empates los desempata RES_ORDEN: se filtra en ese orden y el sort
    // por conteo es estable, así que el orden canónico se conserva.
    const RES_BUENO = new Set(['aumento', 'nuevo_cliente']);
    const RES_MALO = new Set(['disminucion', 'baja_temporal', 'baja_total']);
    const desDom = RES_ORDEN.filter((r) => (des[r] || 0) > 0)
      .sort((a, b) => (des[b] || 0) - (des[a] || 0))[0] || null;
    const desOtros = RES_ORDEN.filter((r) => r !== desDom && (des[r] || 0) > 0)
      .map((r) => `${des[r]} ${RES_TXT[r].toLowerCase()}`);
    if (!(des.aumento > 0)) desOtros.push('ninguna en aumento');
    const desColor = RES_BUENO.has(desDom) ? EST.ok : (RES_MALO.has(desDom) ? EST.mal : EST.neutro);

    // Cubetas de volumen. Cada una con su base de tiempo dicha, para que
    // a nadie se le ocurra sumarlas mentalmente.
    const cubeta = (titulo, nota, dato, acento) => {
      const n = dato.actividades || 0;
      const cero = dato.en_cero || 0;
      const multi = dato.multi_motivo || 0;
      return `
      <div style="border:1px solid var(--line);border-left:4px solid ${acento};border-radius:12px;padding:14px;min-width:0">
        <div style="display:flex;align-items:center;gap:7px">
          <span style="width:9px;height:9px;border-radius:2px;background:${acento};flex:none"></span>
          <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em">${esc(titulo)}</div>
        </div>
        <div style="font-size:11px;color:var(--muted);margin-top:3px">${esc(nota)}</div>
        <div style="font-size:20px;font-weight:800;margin-top:8px">${nf0.format(dato.kg || 0)} kg</div>
        <div style="font-size:13px;color:var(--muted)">${money(dato.mxn || 0)}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:4px">${n} actividad${n === 1 ? '' : 'es'}</div>
        ${cero ? `<div style="font-size:11px;color:${EST.warn};margin-top:4px;font-weight:600">${cero} de ${n} registradas en cero</div>` : ''}
        ${multi ? `<div style="font-size:11px;color:var(--muted);margin-top:4px">${multi} de ${n} traen además otro motivo</div>` : ''}
      </div>`;
    };

    const vacio = (d.creadas.total || 0) === 0;

    $('kpiCuerpo').innerHTML = `
      <div class="card" style="margin-top:14px">
        <div class="eyebrow" id="kpiRecorte" style="margin-bottom:10px">Del ${esc(d.periodo.desde)} al ${esc(d.periodo.hasta)}${recorteActivo(d).map((x) => ` · ${esc(x.etq)}: ${esc(x.val)}`).join('')}</div>
        ${vacio ? `<div class="empty">Sin actividades creadas en este periodo. Ajusta las fechas o el origen.</div>` : `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px">
          ${card('Creadas', String(d.creadas.total), origenes, IDENT.caida)}
          ${card('Pendiente', `${d.pendiente.abiertas + d.pendiente.en_proceso}`,
                 `${d.pendiente.abiertas} abiertas · ${d.pendiente.en_proceso} en proceso`, EST.neutro)}
          ${vencidas > 0
            ? card('Vencidas', String(vencidas), 'fuera de vigencia, exigen acción hoy', EST.mal,
                   { valor: true, tinte: 'var(--danger-bg,#fee2e2)' })
            : card('Vencidas', '0', 'al corriente: nada fuera de vigencia', EST.ok, { valor: true })}
          ${card('Tasa de cierre', pct(d.cierre.tasa_cierre),
                 `${d.cierre.cerradas} cerradas de ${d.creadas.total} · ${d.cierre.canceladas} canceladas`,
                 banda(d.cierre.tasa_cierre), { valor: true })}
          ${(d.cierre.cerradas || 0) === 0
            ? card('Desenlace', 'Sin cierres', 'aún no se ha cerrado ninguna actividad', EST.neutro)
            : card('Desenlace',
                 desDom ? `${des[desDom]} ${RES_TXT[desDom].toLowerCase()}` : 'Sin resultado',
                 desOtros.join(' · ') || 'único desenlace registrado',
                 desColor, { valor: RES_BUENO.has(desDom) || RES_MALO.has(desDom) })}
          ${card('Vigencia cumplida', pct(d.vigencia.pct_a_tiempo),
                 `mediana: ${dias(d.vigencia.dias_mediana_cierre)} en cerrar · ${dias(d.vigencia.dias_mediana_tomar)} en tomar`,
                 banda(d.vigencia.pct_a_tiempo), { valor: d.vigencia.pct_a_tiempo != null })}
        </div>

        ${(d.filtro && d.filtro.solo_con_periodo) ? `<div class="hint" style="color:var(--warn,#d97706);font-size:12px;margin-top:12px">
          Filtrado por el mes analizado <b>${esc(d.filtro.periodo)}</b>: esto <b>deja fuera</b> las actividades
          <b>sin periodo</b> —las manuales y las que nacen de comex—, porque ese dato solo lo traen las del Radar.
        </div>` : ''}

        <div class="eyebrow" style="margin:18px 0 8px">Detalle por actividad</div>
        ${tablaDetalle(d)}

        <div class="eyebrow" style="margin:18px 0 8px">Volumen atendido</div>
        <div class="hint" style="color:var(--muted);font-size:12px;margin-bottom:10px">
          Son los <b>kg de las actividades creadas</b>, no la cartera en riesgo. Van por separado a
          propósito: <b>baja sostenida</b> mide doce meses, <b>caída reciente</b> un bimestre y <b>sin compra</b>
          su ventana. Sumarlas daría una cifra sin significado. Cada actividad cuenta en la cubeta del
          motivo que <b>produjo su cifra</b>; si traía otro motivo además, la cubeta lo dice.
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px">
          ${cubeta('Caída reciente', 'bimestre contra su base', v.caida || {}, IDENT.caida)}
          ${cubeta('Sin compra', 'lo que venía comprando en la ventana', v.sin_compra || {}, IDENT.sinCompra)}
          ${cubeta('Baja sostenida', 'últimos 12 meses vs los 12 previos', v.deriva || {}, IDENT.deriva)}
          ${sinMotivo ? cubeta('Sin motivo', 'no quedó registrado por qué entraron', v.sin_motivo, IDENT.sinMotivo) : ''}
        </div>
        ${enCeroTotal ? `<div class="hint" style="color:var(--muted);font-size:12px;margin-top:10px">
          Las <b>${enCeroTotal}</b> actividades <b>registradas en cero</b> se crearon antes de la corrección del
          15-oct, cuando "+ Actividad" no copiaba el riesgo que la tarjeta mostraba. Cuentan como trabajo
          atendido pero no suman volumen. Se señalan para que el subconteo sea visible; desaparecen solas
          conforme entran las nuevas.
        </div>` : ''}
        `}
      </div>`;

    // Las ligas de la tabla se enganchan DESPUÉS de pintar: la tabla se vuelve
    // a dibujar con cada consulta y los manejadores se irían con ella.
    ligarDetalle();
  }

  async function consultar() {
    $('kpiCuerpo').innerHTML = '<div class="card" style="margin-top:14px"><div class="empty">Calculando…</div></div>';
    const q = new URLSearchParams();
    q.set('desde', $('kpiDesde').value || haceDias(90));
    q.set('hasta', $('kpiHasta').value || hoyISO());
    if ($('kpiOrigen').value) q.set('origen', $('kpiOrigen').value);
    if ($('kpiAgente').value) q.set('agente_id', $('kpiAgente').value);
    if ($('kpiPeriodo').value) q.set('periodo', $('kpiPeriodo').value);
    if ($('kpiSev').value) q.set('severidad', $('kpiSev').value);
    try {
      const res = await KoguApi.apiFetch(`${BASE}/actividades/kpis?${q}`);
      const d = res?.data || res;
      pintar(d);
      pintarChips(d);
    } catch (err) {
      $('kpiCuerpo').innerHTML =
        `<div class="card" style="margin-top:14px"><div class="empty">${esc(err.message || 'No se pudieron calcular los indicadores.')}</div></div>`;
    }
  }

  ['kpiDesde', 'kpiHasta', 'kpiOrigen', 'kpiSev', 'kpiAgente', 'kpiPeriodo']
    .forEach((id) => { $(id).addEventListener('change', consultar); });

  // Catálogo de agentes: lo sirve el propio módulo CRM con el permiso que
  // esta pantalla ya exige, así que no hace falta tocar permisos de Radar.
  var AGENTES = {};
  async function cargarAgentes() {
    try {
      const res = await KoguApi.apiFetch(`${BASE}/agentes`);
      const filas = (res && res.data && res.data.rows) || (res && res.data) || [];
      filas.forEach((a) => { AGENTES[a.agente_id] = a.agente_nombre || a.nombre || a.agente_id; });
      $('kpiAgente').innerHTML = '<option value="">Todos los agentes</option>'
        + filas.map((a) => `<option value="${esc(a.agente_id)}">${esc(a.agente_nombre || a.nombre || a.agente_id)}</option>`).join('');
    } catch (_) { /* sin catálogo el selector se queda en "todos" */ }
  }
  await cargarAgentes();

  // Quitar un filtro desde su chip: limpia el control y vuelve a consultar.
  $('kpiChips').addEventListener('click', function (e) {
    const b = e.target && e.target.closest ? e.target.closest('[data-quita]') : null;
    if (!b) return;
    const campo = CAMPO_DE[b.getAttribute('data-quita')];
    if (!campo) return;
    $(campo).value = '';
    consultar();
  });

  await consultar();

  if (KoguShell.subscribeEmpresaActivaChange) KoguShell.subscribeEmpresaActivaChange(consultar);
});

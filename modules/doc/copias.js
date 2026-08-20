// ============================================================
// copias.js
// Pantalla: Bandeja global de copias.
//
// Responde la pregunta que más se hace en control documental y que
// ninguna otra pantalla contesta: «¿dónde quedó la copia certificada?».
// Desde el detalle hay que saber primero de qué documento es; aquí no.
//
// Por eso el filtro por custodio es de primera clase: la búsqueda real
// no suele ser «copias del acta constitutiva» sino «qué trae Fulano».
// Módulo: Control Documental (doc_) — v1.
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const b = await KoguShell.initShell({
    currentPage:        '/modules/doc/copias.html',
    title:              'Copias',
    description:        'Todas las copias de la empresa, estén en el archivo o en manos de alguien.',
    requiredPermission: 'doc.copias.read',
  });
  if (!b) return;

  const D = window.KoguDoc;
  const esc = D.esc;
  const $ = (id) => document.getElementById(id);

  let tipos = [], subtipos = [], ubicaciones = [], usuarios = [];
  let pagina = 1, ultimo = null;

  const ESTADOS = {
    en_archivo:           'En archivo',
    asignada:             'Asignada',
    en_transito:          'En tránsito',
    extraviada:           'Extraviada',
    destruida:            'Destruida',
    entregada_definitiva: 'Entregada en definitiva',
  };

  $('pageContent').innerHTML = `
<div class="card">
  <div class="row">
    <div><div class="eyebrow">Bandeja</div><h2>Copias</h2>
      <div class="muted" style="font-size:12.5px">
        La copia es lo que se presta y lo que se pierde. Aquí están todas, sin importar de qué documento sean.</div></div>
    <div style="display:flex;gap:8px">
      <a class="btn ghost" href="/modules/doc/documentos.html">Ver documentos</a>
      <button class="btn" id="refreshBtn">Actualizar</button>
    </div>
  </div>

  <div class="grid-4" id="kpis" style="margin-top:16px"></div>

  <div class="grid-4" style="margin-top:16px">
    <input class="input" id="q" placeholder="Buscar por folio, nombre o folio de copia…" />
    <select class="select" id="fTipo"><option value="">Todos los tipos</option></select>
    <select class="select" id="fSubtipo"><option value="">Todos los subtipos</option></select>
    <select class="select" id="fEstado">
      <option value="">Todos los estados</option>
      ${Object.entries(ESTADOS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
    </select>
  </div>
  <div class="grid-4" style="margin-top:10px">
    <select class="select" id="fCaracter">
      <option value="">Cualquier carácter</option>
      ${Object.entries(D.CARACTER).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
    </select>
    <select class="select" id="fCustodio"><option value="">Cualquier custodio</option></select>
    <select class="select" id="fUbicacion"><option value="">Cualquier ubicación</option></select>
    <select class="select" id="fVencidas">
      <option value="">Vencidas y al corriente</option>
      <option value="true">Solo devoluciones vencidas</option>
    </select>
  </div>

  <div class="table-wrap" style="margin-top:14px">
    <table>
      <thead><tr>
        <th style="min-width:150px">Copia</th>
        <th style="min-width:200px">Documento</th>
        <th>Carácter</th>
        <th style="min-width:170px">Custodio / ubicación</th>
        <th>Uso</th>
        <th style="text-align:right">Días fuera</th>
        <th>Devolución</th>
        <th>Estado</th>
      </tr></thead>
      <tbody id="rows"></tbody>
    </table>
  </div>

  <div class="row" style="margin-top:12px">
    <div class="muted" style="font-size:12.5px" id="resumen"></div>
    <div style="display:flex;gap:8px">
      <button class="btn ghost" id="prevBtn">← Anterior</button>
      <button class="btn ghost" id="nextBtn">Siguiente →</button>
    </div>
  </div>
</div>`;

  // ── Catálogos de los filtros ──────────────────────────────
  async function cargarCatalogos() {
    const [rt, rs, rb, rus] = await Promise.all([
      KoguApi.apiFetch('/protected/doc/tipos?activo=true').catch(() => null),
      KoguApi.apiFetch('/protected/doc/subtipos?activo=true').catch(() => null),
      KoguApi.apiFetch('/protected/doc/ubicaciones?activo=true').catch(() => null),
      KoguApi.apiFetch('/protected/core/usuarios').catch(() => null),
    ]);
    tipos       = rt  ? (KoguApi.unwrapData(rt).rows || []) : [];
    subtipos    = rs  ? (KoguApi.unwrapData(rs).rows || []) : [];
    ubicaciones = rb  ? (KoguApi.unwrapData(rb).rows || []) : [];
    usuarios    = rus ? (KoguApi.unwrapRows(rus)     || []) : [];

    $('fTipo').innerHTML = '<option value="">Todos los tipos</option>'
      + tipos.map((t) => `<option value="${t.tipo_id}">${esc(t.nombre)}</option>`).join('');
    $('fUbicacion').innerHTML = '<option value="">Cualquier ubicación</option>'
      + ubicaciones.map((u) => `<option value="${u.ubicacion_id}">${esc(u.nombre)}</option>`).join('');
    $('fCustodio').innerHTML = '<option value="">Cualquier custodio</option>'
      + usuarios.map((u) => `<option value="${u.user_id}">${esc(u.nombre)}</option>`).join('');
    pintarSubtipos('');
  }

  function pintarSubtipos(tipoId) {
    const lista = tipoId ? subtipos.filter((s) => s.tipo_id === tipoId) : subtipos;
    $('fSubtipo').innerHTML = '<option value="">Todos los subtipos</option>'
      + lista.map((s) => `<option value="${s.subtipo_id}">${esc(s.nombre)}</option>`).join('');
  }

  // ── Filtros que llegan por URL (drill-down desde el tablero) ──
  function aplicarFiltrosDeUrl() {
    const p = new URLSearchParams(window.location.search);
    const tipoId = p.get('tipo_id') || '';
    if (tipoId && tipos.some((t) => t.tipo_id === tipoId)) {
      $('fTipo').value = tipoId; pintarSubtipos(tipoId);
    }
    const sub = p.get('subtipo_id') || '';
    if (sub && subtipos.some((s) => s.subtipo_id === sub)) $('fSubtipo').value = sub;
    const est = p.get('estado') || '';
    if (est && ESTADOS[est]) $('fEstado').value = est;
    if (p.get('solo_vencidas') === 'true') $('fVencidas').value = 'true';
    const cust = p.get('custodio_user_id') || '';
    if (cust) $('fCustodio').value = cust;
  }

  // ── Carga ─────────────────────────────────────────────────
  async function load() {
    const qs = KoguUi.queryParams({
      q:                $('q').value.trim() || undefined,
      tipo_id:          $('fTipo').value || undefined,
      subtipo_id:       $('fSubtipo').value || undefined,
      estado:           $('fEstado').value || undefined,
      caracter:         $('fCaracter').value || undefined,
      ubicacion_id:     $('fUbicacion').value || undefined,
      custodio_user_id: $('fCustodio').value || undefined,
      solo_vencidas:    $('fVencidas').value || undefined,
      page:             pagina,
      limit:            100,
    });

    try {
      const res = await KoguApi.apiFetch('/protected/doc/copias?' + qs);
      ultimo = KoguApi.unwrapData(res);
      render();
    } catch (e) { D.errorToast(e, 'No fue posible cargar las copias.'); }
  }

  function render() {
    const rows  = ultimo?.rows || [];
    const total = ultimo?.total ?? 0;

    // Los KPIs describen LA PÁGINA, no el universo: contar sobre `rows`
    // y llamarlo "total" sería mentir en cuanto haya más de 100 copias.
    const asignadas = rows.filter((c) => c.estado === 'asignada').length;
    const vencidas  = rows.filter((c) => c.devolucion_vencida).length;
    const archivo   = rows.filter((c) => c.estado === 'en_archivo').length;

    $('kpis').innerHTML = [
      D.kpi('Copias', total.toLocaleString('es-MX'), 'con los filtros actuales'),
      D.kpi('En archivo', archivo, 'disponibles en esta página'),
      D.kpi('Asignadas', asignadas, 'fuera del archivo en esta página'),
      D.kpi('Vencidas', vencidas, vencidas ? 'pasaron su fecha' : 'al corriente', vencidas > 0),
    ].join('');

    $('rows').innerHTML = rows.length ? rows.map((c) => {
      const asignada = c.estado === 'asignada';
      return `<tr class="doc-fila" data-doc="${c.documento_id}" style="cursor:pointer">
        <td><strong class="mono">${esc(c.etiqueta)}</strong>
          ${c.digitalizada ? '<span class="badge success" style="margin-left:6px">digitalizada</span>' : ''}
          ${c.folio_copia ? `<div class="muted" style="font-size:11.5px">${esc(c.folio_copia)}</div>` : ''}</td>
        <td>${esc(c.documento_nombre)}
          <div class="muted" style="font-size:11.5px">${esc(c.tipo_nombre)} · ${esc(c.subtipo_nombre)}</div></td>
        <td>${esc(D.CARACTER[c.caracter] || c.caracter)}</td>
        <td>${asignada
              ? `<strong>${esc(c.custodio_nombre || '—')}</strong>`
              : (c.ubicacion_nombre
                  ? `${esc(c.ubicacion_nombre)}${c.es_externa ? ' <span class="badge warn">externa</span>' : ''}`
                  : '<span class="muted">Sin ubicación</span>')}</td>
        <td>${asignada ? esc(c.uso_nombre || '—') : '—'}</td>
        <td style="text-align:right">${asignada && c.dias_fuera != null ? c.dias_fuera : '—'}</td>
        <td>${asignada
              ? (c.fecha_devolucion_esperada
                  ? `${D.fecha(c.fecha_devolucion_esperada)}${c.devolucion_vencida
                      ? '<div style="font-size:11.5px;color:var(--danger);font-weight:700">vencida</div>' : ''}`
                  : '<span class="muted">sin fecha</span>')
              : '—'}</td>
        <td>${D.badgeEstadoCopia(c.estado)}</td>
      </tr>`;
    }).join('') : `<tr><td colspan="8" class="empty">Sin copias para los filtros actuales.</td></tr>`;

    $('rows').querySelectorAll('.doc-fila').forEach((tr) => {
      tr.onclick = () => {
        window.location.href = '/modules/doc/documento-detalle.html?id=' + encodeURIComponent(tr.dataset.doc);
      };
    });

    const paginas = Math.max(1, Math.ceil(total / (ultimo?.limit || 100)));
    $('resumen').textContent = `${total.toLocaleString('es-MX')} copia(s) · página ${pagina} de ${paginas}`;
    $('prevBtn').disabled = pagina <= 1;
    $('nextBtn').disabled = pagina >= paginas;
  }

  // ── Eventos ───────────────────────────────────────────────
  const recargarDesdeCero = () => { pagina = 1; load(); };

  ['fTipo', 'fSubtipo', 'fEstado', 'fCaracter', 'fCustodio', 'fUbicacion', 'fVencidas']
    .forEach((id) => { $(id).onchange = () => {
      if (id === 'fTipo') pintarSubtipos($('fTipo').value);
      recargarDesdeCero();
    }; });

  // Se espera a que deje de teclear: una petición por letra satura el
  // servidor y hace parpadear la tabla.
  let t = null;
  $('q').oninput = () => { clearTimeout(t); t = setTimeout(recargarDesdeCero, 350); };

  $('refreshBtn').onclick = () => load();
  $('prevBtn').onclick = () => { if (pagina > 1) { pagina -= 1; load(); } };
  $('nextBtn').onclick = () => { pagina += 1; load(); };
  window.addEventListener('kogu:empresa-activa-cambiada', recargarDesdeCero);

  await cargarCatalogos();
  aplicarFiltrosDeUrl();
  await load();
});

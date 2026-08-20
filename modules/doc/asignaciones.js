// ============================================================
// asignaciones.js
// Pantalla: Historial de resguardo.
//
// La bandeja de copias dice DÓNDE ESTÁ cada copia hoy. Ésta dice POR
// DÓNDE HA PASADO: quién la tuvo, para qué, cuánto tiempo y si volvió.
// Es la pantalla que se abre cuando alguien pregunta «¿quién tenía el
// acta en marzo?» o «¿este proveedor devuelve o hay que perseguirlo?».
//
// A diferencia de las otras bandejas, aquí no hay caja de búsqueda por
// texto: el backend no expone un filtro `q` sobre asignaciones, y una
// caja que filtre solo lo que cabe en la página mentiría en cuanto
// hubiera más de cien registros. Se filtra por persona, uso, estado y
// fechas, que es como se busca en la práctica.
// Módulo: Control Documental (doc_) — v1.
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const b = await KoguShell.initShell({
    currentPage:        '/modules/doc/asignaciones.html',
    title:              'Resguardos',
    description:        'Historial completo de préstamos de copias: quién, para qué y si volvió.',
    requiredPermission: 'doc.asignaciones.read',
  });
  if (!b) return;

  const D = window.KoguDoc;
  const esc = D.esc;
  const $ = (id) => document.getElementById(id);

  let tipos = [], subtipos = [], usos = [], usuarios = [];
  let pagina = 1, ultimo = null;

  const EST_ASIG = {
    vigente:     ['Vigente',      'warn'],
    devuelta:    ['Devuelta',     'success'],
    vencida:     ['Vencida',      'danger'],
    no_devuelta: ['No devuelta',  'danger'],
    cancelada:   ['Cancelada',    'neutral'],
  };

  const badgeAsig = (e) => {
    const [txt, cls] = EST_ASIG[e] || [String(e || '—'), 'neutral'];
    return `<span class="badge ${cls}">${esc(txt)}</span>`;
  };

  $('pageContent').innerHTML = `
<div class="card">
  <div class="row">
    <div><div class="eyebrow">Bandeja</div><h2>Resguardos</h2>
      <div class="muted" style="font-size:12.5px">
        Cada vez que una copia salió del archivo y qué pasó con ella.</div></div>
    <div style="display:flex;gap:8px">
      <a class="btn ghost" href="/modules/doc/copias.html">Ver copias</a>
      <button class="btn" id="refreshBtn">Actualizar</button>
    </div>
  </div>

  <div class="grid-4" id="kpis" style="margin-top:16px"></div>

  <div class="grid-4" style="margin-top:16px">
    <select class="select" id="fUser"><option value="">Cualquier persona</option></select>
    <select class="select" id="fUso"><option value="">Cualquier uso</option></select>
    <select class="select" id="fEstado">
      <option value="">Todos los estados</option>
      ${Object.entries(EST_ASIG).map(([k, v]) => `<option value="${k}">${v[0]}</option>`).join('')}
    </select>
    <select class="select" id="fAbiertas">
      <option value="">Historial completo</option>
      <option value="abiertas">Solo las que siguen fuera</option>
      <option value="vencidas">Solo vencidas</option>
    </select>
  </div>
  <div class="grid-4" style="margin-top:10px">
    <select class="select" id="fTipo"><option value="">Todos los tipos</option></select>
    <select class="select" id="fSubtipo"><option value="">Todos los subtipos</option></select>
    <div><input class="input" id="fDesde" type="date" />
      <div class="muted" style="font-size:11px;margin-top:2px">Asignadas desde</div></div>
    <div><input class="input" id="fHasta" type="date" />
      <div class="muted" style="font-size:11px;margin-top:2px">Asignadas hasta</div></div>
  </div>

  <div class="table-wrap" style="margin-top:14px">
    <table>
      <thead><tr>
        <th style="min-width:140px">Copia</th>
        <th style="min-width:190px">Documento</th>
        <th style="min-width:150px">La tuvo</th>
        <th>Uso</th>
        <th>Asignada</th>
        <th>Debía volver</th>
        <th>Devuelta</th>
        <th style="text-align:right">Días</th>
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

  async function cargarCatalogos() {
    const [rt, rs, ru, rus] = await Promise.all([
      KoguApi.apiFetch('/protected/doc/tipos?activo=true').catch(() => null),
      KoguApi.apiFetch('/protected/doc/subtipos?activo=true').catch(() => null),
      KoguApi.apiFetch('/protected/doc/usos').catch(() => null),
      KoguApi.apiFetch('/protected/core/usuarios').catch(() => null),
    ]);
    tipos    = rt  ? (KoguApi.unwrapData(rt).rows || []) : [];
    subtipos = rs  ? (KoguApi.unwrapData(rs).rows || []) : [];
    usos     = ru  ? (KoguApi.unwrapData(ru).rows || []) : [];
    usuarios = rus ? (KoguApi.unwrapRows(rus)     || []) : [];

    $('fTipo').innerHTML = '<option value="">Todos los tipos</option>'
      + tipos.map((t) => `<option value="${t.tipo_id}">${esc(t.nombre)}</option>`).join('');
    $('fUso').innerHTML = '<option value="">Cualquier uso</option>'
      + usos.map((u) => `<option value="${u.uso_id}">${esc(u.nombre)}</option>`).join('');
    $('fUser').innerHTML = '<option value="">Cualquier persona</option>'
      + usuarios.map((u) => `<option value="${u.user_id}">${esc(u.nombre)}</option>`).join('');
    pintarSubtipos('');
  }

  function pintarSubtipos(tipoId) {
    const lista = tipoId ? subtipos.filter((s) => s.tipo_id === tipoId) : subtipos;
    $('fSubtipo').innerHTML = '<option value="">Todos los subtipos</option>'
      + lista.map((s) => `<option value="${s.subtipo_id}">${esc(s.nombre)}</option>`).join('');
  }

  function aplicarFiltrosDeUrl() {
    const p = new URLSearchParams(window.location.search);
    const u = p.get('user_id') || '';
    if (u && usuarios.some((x) => x.user_id === u)) $('fUser').value = u;
    const est = p.get('estado') || '';
    if (est && EST_ASIG[est]) $('fEstado').value = est;
    if (p.get('solo_vencidas') === 'true') $('fAbiertas').value = 'vencidas';
    else if (p.get('solo_abiertas') === 'true') $('fAbiertas').value = 'abiertas';
  }

  async function load() {
    const modo = $('fAbiertas').value;
    const qs = KoguUi.queryParams({
      user_id:       $('fUser').value || undefined,
      uso_id:        $('fUso').value || undefined,
      estado:        $('fEstado').value || undefined,
      tipo_id:       $('fTipo').value || undefined,
      subtipo_id:    $('fSubtipo').value || undefined,
      solo_abiertas: modo === 'abiertas' ? 'true' : undefined,
      solo_vencidas: modo === 'vencidas' ? 'true' : undefined,
      desde:         $('fDesde').value || undefined,
      hasta:         $('fHasta').value || undefined,
      page:          pagina,
      limit:         100,
    });

    try {
      const res = await KoguApi.apiFetch('/protected/doc/asignaciones?' + qs);
      ultimo = KoguApi.unwrapData(res);
      render();
    } catch (e) { D.errorToast(e, 'No fue posible cargar los resguardos.'); }
  }

  function render() {
    const rows  = ultimo?.rows || [];
    const total = ultimo?.total ?? 0;

    const abiertas = rows.filter((a) => !a.fecha_devolucion_real && a.estado === 'vigente').length;
    const vencidas = rows.filter((a) => a.dias_retraso != null).length;
    const devueltas= rows.filter((a) => a.estado === 'devuelta').length;

    $('kpis').innerHTML = [
      D.kpi('Resguardos', total.toLocaleString('es-MX'), 'con los filtros actuales'),
      D.kpi('Siguen fuera', abiertas, 'sin devolver, en esta página'),
      D.kpi('Vencidos', vencidas, vencidas ? 'pasaron su fecha' : 'al corriente', vencidas > 0),
      D.kpi('Devueltos', devueltas, 'cerrados en esta página'),
    ].join('');

    $('rows').innerHTML = rows.length ? rows.map((a) => `
      <tr class="doc-fila" data-doc="${a.documento_id}" style="cursor:pointer">
        <td><strong class="mono">${esc(a.etiqueta)}</strong>
          <div class="muted" style="font-size:11.5px">${esc(D.CARACTER[a.caracter] || a.caracter)}</div></td>
        <td>${esc(a.documento_nombre)}
          <div class="muted" style="font-size:11.5px">${esc(a.subtipo_nombre)}</div></td>
        <td><strong>${esc(a.user_nombre || '—')}</strong></td>
        <td>${esc(a.uso_nombre || '—')}
          ${a.requiere_devolucion === false
            ? '<div class="muted" style="font-size:11.5px">entrega definitiva</div>' : ''}</td>
        <td>${D.fecha(a.fecha_asignacion)}</td>
        <td>${a.fecha_devolucion_esperada ? D.fecha(a.fecha_devolucion_esperada) : '<span class="muted">—</span>'}
          ${a.dias_retraso != null
            ? `<div style="font-size:11.5px;color:var(--danger);font-weight:700">${a.dias_retraso} d de retraso</div>` : ''}</td>
        <td>${a.fecha_devolucion_real
              ? D.fecha(a.fecha_devolucion_real)
                + (a.condicion_devolucion && a.condicion_devolucion !== 'buena'
                    ? `<div class="muted" style="font-size:11.5px">${esc(D.CONDICION[a.condicion_devolucion] || a.condicion_devolucion)}</div>` : '')
              : '<span class="muted">—</span>'}</td>
        <td style="text-align:right">${a.dias_fuera ?? '—'}</td>
        <td>${badgeAsig(a.estado)}</td>
      </tr>`).join('') : `<tr><td colspan="9" class="empty">
        Sin resguardos para los filtros actuales.</td></tr>`;

    $('rows').querySelectorAll('.doc-fila').forEach((tr) => {
      tr.onclick = () => {
        window.location.href = '/modules/doc/documento-detalle.html?id=' + encodeURIComponent(tr.dataset.doc);
      };
    });

    const paginas = Math.max(1, Math.ceil(total / (ultimo?.limit || 100)));
    $('resumen').textContent = `${total.toLocaleString('es-MX')} resguardo(s) · página ${pagina} de ${paginas}`;
    $('prevBtn').disabled = pagina <= 1;
    $('nextBtn').disabled = pagina >= paginas;
  }

  const recargarDesdeCero = () => { pagina = 1; load(); };

  ['fUser', 'fUso', 'fEstado', 'fAbiertas', 'fTipo', 'fSubtipo', 'fDesde', 'fHasta']
    .forEach((id) => { $(id).onchange = () => {
      if (id === 'fTipo') pintarSubtipos($('fTipo').value);
      recargarDesdeCero();
    }; });

  $('refreshBtn').onclick = () => load();
  $('prevBtn').onclick = () => { if (pagina > 1) { pagina -= 1; load(); } };
  $('nextBtn').onclick = () => { pagina += 1; load(); };
  window.addEventListener('kogu:empresa-activa-cambiada', recargarDesdeCero);

  await cargarCatalogos();
  aplicarFiltrosDeUrl();
  await load();
});

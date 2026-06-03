// ============================================================
// lab-coa-emitir.js
// Pantalla "Nuevo COA por factura" — wizard one-page.
// Flujo: cliente → factura + lotes → idioma → emitir.
// El backend valida que cada lote tenga liberación activa al
// cliente y emite UN COA consolidado con N lotes.
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/lab/lab-coa-emitir.html';
  const PERM = 'screen.lab.coa';
  const BASE = '/protected/lab/coa';

  const IDIOMAS = [
    { code: 'es', label: 'Español'    },
    { code: 'en', label: 'English'    },
    { code: 'pt', label: 'Português'  },
    { code: 'fr', label: 'Français'   },
    { code: 'de', label: 'Deutsch'    },
    { code: 'it', label: 'Italiano'   },
  ];

  // Soporte de query params al entrar a la pantalla:
  //
  // (a) ?lote_id=XYZ   — desde el detalle de un lote.
  //     Preseleccionamos ese lote automáticamente cuando el usuario
  //     elija el cliente al que está liberado.
  //
  // (b) ?liberacion_ids=a,b,c — desde el módulo Liberaciones tras
  //     multi-selección. Resolvemos cliente común y precargamos los
  //     lotes correspondientes. El usuario solo captura folio +
  //     idioma y emite.
  const urlParams           = new URLSearchParams(window.location.search);
  const preselectLoteId     = urlParams.get('lote_id') || '';
  const preselectLibIdsRaw  = urlParams.get('liberacion_ids') || '';
  const preselectLibIds     = preselectLibIdsRaw
    ? preselectLibIdsRaw.split(',').map(s => s.trim()).filter(Boolean)
    : [];

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Nuevo COA por factura',
    description: 'Emite un certificado consolidado para los lotes incluidos en una factura del ERP.',
    requiredPermission: PERM,
  });
  if (!b) return;

  const c = document.getElementById('pageContent');
  c.innerHTML = `
<div style="margin-bottom:12px">
  <button class="btn ghost" id="backBtn">← Volver a COAs</button>
</div>

<div class="card">
  <div class="row">
    <div><div class="eyebrow">Lab QA</div><h2>Nuevo COA por factura</h2></div>
  </div>
  <div class="muted" style="margin-top:6px;font-size:13px">
    Selecciona el cliente y los lotes liberados a ese cliente que viajan en la factura.
    Se genera <strong>un único COA consolidado</strong> con todos los lotes y se entrega como anexo de la factura.
  </div>

  <!-- Paso 1: Cliente -->
  <div style="margin-top:18px;border-top:1px solid var(--line);padding-top:14px">
    <div class="eyebrow" style="margin-bottom:10px">1 · Cliente</div>
    <div style="display:flex;gap:6px;align-items:center">
      <input class="input" id="clienteLabel" readonly placeholder="— Sin cliente seleccionado —"
             style="flex:1;cursor:pointer;background:#f8fafc"/>
      <button type="button" class="btn primary" id="clientePickBtn">Buscar cliente…</button>
      <button type="button" class="btn ghost" id="clienteClearBtn" title="Limpiar">×</button>
    </div>
    <input type="hidden" id="clienteId"/>
    <div class="muted" style="margin-top:6px;font-size:12px">
      Solo se muestran lotes que ya tienen <strong>liberación activa</strong> a este cliente.
      Si el cliente no aparece, créalo en el módulo Clientes; si no hay lotes liberados, libéralos primero desde la Bandeja de Calidad.
    </div>
  </div>

  <!-- Paso 2: Factura + lotes -->
  <div style="margin-top:18px;border-top:1px solid var(--line);padding-top:14px">
    <div class="eyebrow" style="margin-bottom:10px">2 · Factura</div>
    <div class="grid-2" style="gap:10px">
      <div>
        <div class="label-text">Folio de factura externa</div>
        <div style="display:flex;gap:6px">
          <input class="input" id="folioFactura" placeholder="Ej. FAC-2026-001234" maxlength="60" style="flex:1"/>
          <button type="button" class="btn ghost" id="facturaImpBtn" disabled title="Selecciona cliente primero">Importadas…</button>
        </div>
        <div class="muted" style="margin-top:4px;font-size:12px">Captura libre o selecciona una factura previamente importada.</div>
      </div>
      <div>
        <div class="label-text">Fecha de factura</div>
        <input class="input" type="date" id="fechaFactura"/>
      </div>
    </div>
  </div>

  <div style="margin-top:18px;border-top:1px solid var(--line);padding-top:14px">
    <div class="row">
      <div class="eyebrow">3 · Lotes incluidos en la factura</div>
      <div id="lotesResumen" class="muted" style="font-size:12px"></div>
    </div>
    <div id="lotesList" style="margin-top:10px">
      <div class="muted" style="text-align:center;padding:20px;font-size:13px">
        Selecciona un cliente para ver los lotes disponibles.
      </div>
    </div>
  </div>

  <!-- Paso 4: Idioma y observaciones -->
  <div style="margin-top:18px;border-top:1px solid var(--line);padding-top:14px">
    <div class="eyebrow" style="margin-bottom:10px">4 · Configuración del COA</div>
    <div class="grid-2" style="gap:10px">
      <div>
        <div class="label-text">Idioma del COA</div>
        <select class="select" id="idioma">
          ${IDIOMAS.map(i => `<option value="${i.code}" ${i.code === 'es' ? 'selected' : ''}>${i.label} (${i.code})</option>`).join('')}
        </select>
        <div class="muted" style="margin-top:4px;font-size:12px">Si el cliente tiene config de idioma, se usa esa por default. Override aquí.</div>
      </div>
      <div>
        <div class="label-text">Formato</div>
        <select class="select" id="formato">
          <option value="estandar" selected>Estándar</option>
          <option value="extendido">Extendido</option>
        </select>
      </div>
      <div style="grid-column:1 / -1">
        <div class="label-text">Observaciones (opcional)</div>
        <textarea class="input" id="observaciones" rows="2" maxlength="500"></textarea>
      </div>
    </div>
  </div>

  <!-- Acciones -->
  <div class="row" style="margin-top:24px;gap:8px;justify-content:flex-end">
    <button class="btn ghost" id="cancelBtn">Cancelar</button>
    <button class="btn primary" id="emitirBtn" disabled>Emitir COA</button>
  </div>
</div>
  `;

  // Estado
  let clientes = [];                  // catálogo en memoria para el picker
  let facturasImportadas = [];        // facturas filtradas por cliente actual
  let lotesDisponibles = [];          // lotes con liberación activa al cliente
  const lotesSeleccionados = new Set();

  const $ = (id) => document.getElementById(id);

  // ── Validación pliego-driven (espejo del gate backend) ──────
  // Un lote no_cumple / incompleta / sin_pliego sólo se certifica si la
  // liberación es condicion='excepcion' (excepción aprobada). Si no, se
  // bloquea su selección y el backend lo rechaza con COA_REQUIERE_EXCEPCION.
  const VAL_MAP = {
    validada:   { label: '✓ Validada',   bg: '#dcfce7', fg: '#166534' },
    incompleta: { label: '⚠ Incompleta', bg: '#fef3c7', fg: '#92400e' },
    no_cumple:  { label: '✕ No cumple',  bg: '#fee2e2', fg: '#991b1b' },
    sin_pliego: { label: '⚠ Sin pliego', bg: '#fef3c7', fg: '#92400e' },
    sin_lote:   { label: '○ Sin lote',   bg: '#f1f5f9', fg: '#475569' },
  };
  const VAL_BLOQUEANTE = ['no_cumple', 'incompleta', 'sin_pliego'];
  function esBloqueada(l) {
    return VAL_BLOQUEANTE.includes(l.validacion_status) && l.condicion !== 'excepcion';
  }
  function chipValidacion(l) {
    const m = VAL_MAP[l.validacion_status];
    if (!m) return '';
    const exc = l.condicion === 'excepcion'
      ? ' <span class="muted" style="font-size:11px">· excepción</span>' : '';
    return `<span class="chip" style="background:${m.bg};color:${m.fg};font-size:11px">${m.label}</span>${exc}`;
  }

  // ── Carga inicial: clientes ────────────────────────────
  async function loadClientes() {
    try {
      const res = await KoguApi.apiFetch('/protected/core/clientes');
      clientes = KoguApi.unwrapRows(res);
    } catch (err) {
      console.warn('No se pudieron cargar clientes:', err.message);
      clientes = [];
    }
  }

  // ── Picker de cliente ──────────────────────────────────
  function abrirPickerCliente() {
    KoguUi.openSearchPicker({
      title: 'Seleccionar cliente para el COA',
      items: clientes,
      placeholder: 'Buscar por nombre, RFC o cve_cte…',
      columns: [
        { key: 'nombre',  label: 'Nombre',  primary: true },
        { key: 'rfc',     label: 'RFC' },
        { key: 'cve_cte', label: 'cve_cte' },
        { key: 'email',   label: 'Email' },
      ],
      emptyText: clientes.length === 0
        ? 'No hay clientes en esta empresa. Crea uno desde el módulo Clientes.'
        : 'Sin coincidencias',
      onSelect: (cli) => {
        $('clienteId').value = cli.cliente_id;
        $('clienteLabel').value = cli.nombre + (cli.rfc ? ' — ' + cli.rfc : '');
        $('facturaImpBtn').disabled = false;
        $('facturaImpBtn').title = 'Buscar facturas importadas';
        cargarLotesDisponibles();
        cargarFacturasImportadas();
        actualizarBotonEmitir();
      },
    });
  }

  function limpiarCliente() {
    $('clienteId').value = '';
    $('clienteLabel').value = '';
    $('facturaImpBtn').disabled = true;
    $('facturaImpBtn').title = 'Selecciona cliente primero';
    lotesDisponibles = [];
    facturasImportadas = [];
    lotesSeleccionados.clear();
    renderLotes();
    actualizarBotonEmitir();
  }

  // ── Cargar lotes disponibles ───────────────────────────
  async function cargarLotesDisponibles() {
    const clienteId = $('clienteId').value;
    if (!clienteId) return;
    try {
      const res = await KoguApi.apiFetch(`${BASE}/lotes-disponibles?cliente_id=${encodeURIComponent(clienteId)}`);
      lotesDisponibles = KoguApi.unwrapData(res) || [];
      lotesSeleccionados.clear();
      // Si se llegó con ?lote_id=XYZ, buscamos la liberación correspondiente y la preseleccionamos.
      const matchLote = preselectLoteId
        ? lotesDisponibles.find(l => l.lote_id === preselectLoteId)
        : null;
      if (matchLote && !esBloqueada(matchLote)) {
        lotesSeleccionados.add(matchLote.liberacion_id);
      } else if (matchLote && esBloqueada(matchLote)) {
        KoguApi.toast('El lote preseleccionado requiere excepción aprobada para certificar.', 'warning');
      }
      renderLotes();
      if (matchLote && lotesSeleccionados.has(matchLote.liberacion_id)) {
        // Marca el checkbox tras render (el value ahora es liberacion_id)
        const cb = document.querySelector(`input[data-lote-pick][value="${matchLote.liberacion_id}"]`);
        if (cb && !cb.disabled) cb.checked = true;
        actualizarResumen();
        actualizarBotonEmitir();
      }
    } catch (err) {
      KoguApi.toast(err.message, 'error');
      lotesDisponibles = [];
      renderLotes();
    }
  }

  function renderLotes() {
    const list = $('lotesList');
    const resumen = $('lotesResumen');
    if (!$('clienteId').value) {
      list.innerHTML = `<div class="muted" style="text-align:center;padding:20px;font-size:13px">Selecciona un cliente para ver los lotes disponibles.</div>`;
      resumen.textContent = '';
      return;
    }
    if (!lotesDisponibles.length) {
      list.innerHTML = `
        <div class="muted" style="text-align:center;padding:20px;font-size:13px">
          Este cliente no tiene lotes con liberación activa.<br/>
          Libera primero el lote desde la <a href="/modules/lab/lab-bandeja.html" style="color:#2563eb">Bandeja de Calidad</a>.
        </div>`;
      resumen.textContent = '';
      return;
    }

    list.innerHTML = `
      <div style="margin-bottom:8px;font-size:12px;color:var(--muted)">
        Selecciona los lotes que viajan en esta factura. <strong>${lotesDisponibles.length}</strong> disponible${lotesDisponibles.length === 1 ? '' : 's'}.
      </div>
      <div style="display:flex;flex-direction:column;gap:6px">
        ${lotesDisponibles.map((l, idx) => {
          const ok = (parseInt(l.oficiales_total, 10) || 0) > 0
                  && parseInt(l.oficiales_cumplen, 10) === parseInt(l.oficiales_total, 10);
          const bg = ok ? '#dcfce7' : '#fef3c7';
          const fg = ok ? '#166534' : '#92400e';
          const sem = ok ? '✓ Cumple' : '⚠ Verificar';
          const bloq = esBloqueada(l);
          const fechaLib = l.fecha_liberacion ? new Date(l.fecha_liberacion).toLocaleDateString() : '—';
          const cant = l.cantidad ? `${parseFloat(l.cantidad).toLocaleString()} ${l.unidad_simbolo || ''}` : '—';
          return `
            <label style="display:flex;align-items:center;gap:10px;padding:10px;border:1px solid ${bloq ? '#fecaca' : 'var(--line)'};border-left:${bloq ? '3px solid #dc2626' : '1px solid var(--line)'};border-radius:6px;cursor:${bloq ? 'not-allowed' : 'pointer'};background:${bloq ? '#fef2f2' : 'white'};opacity:${bloq ? '.85' : '1'}">
              <input type="checkbox" data-lote-pick="${idx}" value="${l.liberacion_id}" ${bloq ? 'disabled' : ''} />
              <div style="flex:1">
                <div><strong>${escapeHtml(l.numero_lote)}</strong> <span class="muted">·</span> ${escapeHtml(l.cve_prod || '')} — ${escapeHtml(l.desc_prod || '')}</div>
                <div class="muted" style="font-size:12px;margin-top:2px">
                  Liberado ${fechaLib} · ${cant}
                  ${l.folio_factura_externa ? ' · ref liberación: ' + escapeHtml(l.folio_factura_externa) : ''}
                </div>
                <div style="margin-top:4px">${chipValidacion(l)}</div>
                ${bloq ? `<div style="margin-top:4px;color:#991b1b;font-size:12px">⛔ Requiere excepción aprobada para certificar. Crea/aprueba la excepción o corrige y revalida la liberación.</div>` : ''}
              </div>
              <span class="chip" style="background:${bg};color:${fg}">${sem}</span>
              <span class="muted" style="font-size:12px">${l.oficiales_cumplen || 0}/${l.oficiales_total || 0}</span>
            </label>`;
        }).join('')}
      </div>
    `;

    list.querySelectorAll('input[data-lote-pick]').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const idx = parseInt(e.target.dataset.lotePick, 10);
        const lote = lotesDisponibles[idx];
        if (!lote) return;
        if (e.target.checked) lotesSeleccionados.add(lote.liberacion_id);
        else lotesSeleccionados.delete(lote.liberacion_id);
        actualizarResumen();
        actualizarBotonEmitir();
      });
    });
  }

  function actualizarResumen() {
    const n = lotesSeleccionados.size;
    $('lotesResumen').textContent = n === 0
      ? 'Sin lotes seleccionados'
      : `${n} lote${n === 1 ? '' : 's'} seleccionado${n === 1 ? '' : 's'}`;
  }

  function actualizarBotonEmitir() {
    const ok = !!$('clienteId').value && lotesSeleccionados.size > 0;
    $('emitirBtn').disabled = !ok;
  }

  // ── Cargar facturas importadas (autocompletado) ────────
  async function cargarFacturasImportadas() {
    const clienteId = $('clienteId').value;
    if (!clienteId) return;
    try {
      const res = await KoguApi.apiFetch(`${BASE}/facturas-importadas?cliente_id=${encodeURIComponent(clienteId)}`);
      facturasImportadas = KoguApi.unwrapData(res) || [];
    } catch (err) {
      console.warn('No se pudieron cargar facturas importadas:', err.message);
      facturasImportadas = [];
    }
  }

  function abrirPickerFactura() {
    if (!facturasImportadas.length) {
      KoguApi.toast('No hay facturas importadas para este cliente.', 'info');
      return;
    }
    // Agrupa por folio_factura para mostrar UNA fila por factura (un folio puede tener varias líneas).
    const porFolio = new Map();
    for (const f of facturasImportadas) {
      if (!porFolio.has(f.folio_factura)) porFolio.set(f.folio_factura, { ...f, lineas: 0 });
      porFolio.get(f.folio_factura).lineas++;
    }
    const items = Array.from(porFolio.values()).map(f => ({
      folio_factura: f.folio_factura,
      fecha_factura: f.fecha_factura,
      lineas:        `${f.lineas} línea(s)`,
      cve_cte:       f.cve_cte,
    }));

    KoguUi.openSearchPicker({
      title: 'Seleccionar factura importada',
      items,
      placeholder: 'Buscar por folio…',
      columns: [
        { key: 'folio_factura', label: 'Folio',  primary: true },
        { key: 'fecha_factura', label: 'Fecha' },
        { key: 'lineas',        label: 'Líneas' },
      ],
      emptyText: 'Sin facturas importadas para este cliente',
      onSelect: (f) => {
        $('folioFactura').value = f.folio_factura;
        if (f.fecha_factura) $('fechaFactura').value = f.fecha_factura;
      },
    });
  }

  // ── Emitir ─────────────────────────────────────────────
  async function emitir() {
    const clienteId = $('clienteId').value;
    if (!clienteId) return KoguApi.toast('Selecciona un cliente', 'error');
    if (!lotesSeleccionados.size) return KoguApi.toast('Selecciona al menos un lote', 'error');

    const payload = {
      cliente_id:    clienteId,
      folio_factura: $('folioFactura').value.trim() || null,
      fecha_factura: $('fechaFactura').value || null,
      idioma:        $('idioma').value,
      formato:       $('formato').value,
      observaciones: $('observaciones').value.trim() || null,
      liberaciones:  Array.from(lotesSeleccionados),
    };

    if (!confirm(`¿Emitir COA consolidado con ${payload.liberaciones.length} lote${payload.liberaciones.length === 1 ? '' : 's'}? Se generará un certificado inmutable.`)) return;

    try {
      const res = await KoguApi.apiFetch(`${BASE}/emitir-factura`, {
        method: 'POST', body: JSON.stringify(payload),
      });
      const coa = KoguApi.unwrapData(res);
      KoguApi.toast(`COA ${coa.folio_coa} emitido (${payload.liberaciones.length} lote${payload.liberaciones.length === 1 ? '' : 's'})`, 'success');
      window.location.href = `/modules/lab/lab-coa-detalle.html?id=${coa.coa_id}`;
    } catch (err) {
      KoguApi.toast(err.message, 'error');
    }
  }

  // ── Bindings ───────────────────────────────────────────
  $('backBtn').addEventListener('click', () => window.location.href = '/modules/lab/lab-coa.html');
  $('cancelBtn').addEventListener('click', () => window.location.href = '/modules/lab/lab-coa.html');
  $('clientePickBtn').addEventListener('click', abrirPickerCliente);
  $('clienteLabel').addEventListener('click', abrirPickerCliente);
  $('clienteClearBtn').addEventListener('click', limpiarCliente);
  $('facturaImpBtn').addEventListener('click', abrirPickerFactura);
  $('emitirBtn').addEventListener('click', emitir);

  KoguShell.subscribeEmpresaActivaChange(() => window.location.href = '/modules/lab/lab-coa.html');

  // ── Helpers ───────────────────────────────────────────
  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m]);
  }

  await loadClientes();

  // Aviso visual cuando se entra con ?lote_id= preseleccionado
  if (preselectLoteId) {
    KoguApi.toast(
      'Selecciona el cliente para incluir el lote preseleccionado en la factura.',
      'info',
    );
  }

  // ── Precarga desde ?liberacion_ids=a,b,c ────────────────
  // Resolvemos cliente común y marcamos lotes en un solo paso.
  if (preselectLibIds.length) {
    try {
      // Traemos detalle de cada liberación. Pueden ser N llamadas,
      // pero en práctica multi-selección suele ser ≤ 10.
      const detalles = await Promise.all(preselectLibIds.map(id =>
        KoguApi.apiFetch(`${BASE.replace('/coa','')}/liberaciones/${id}`)
          .then(r => KoguApi.unwrapData(r))
          .catch(() => null)
      ));

      const validas = detalles.filter(d => d && d.status === 'activo');
      if (validas.length === 0) {
        KoguApi.toast(
          'Ninguna de las liberaciones seleccionadas está activa.',
          'error',
        );
      } else {
        // Validar cliente único
        const clienteIds = new Set(validas.map(v => v.cliente_id));
        if (clienteIds.size > 1) {
          KoguApi.toast(
            'Las liberaciones seleccionadas son de clientes distintos. Vuelve a Liberaciones y selecciona uno solo.',
            'error',
          );
        } else {
          const cli = validas[0];
          $('clienteId').value    = cli.cliente_id;
          $('clienteLabel').value = (cli.cliente_nombre || '—')
                                  + (cli.cliente_rfc ? ' — ' + cli.cliente_rfc : '');
          $('facturaImpBtn').disabled = false;
          $('facturaImpBtn').title    = 'Buscar facturas importadas';
          await cargarLotesDisponibles();
          await cargarFacturasImportadas();

          // Auto-poblar folio si todas las liberaciones comparten el mismo folio de factura.
          const foliosUnicos = new Set(validas.map(v => v.folio_factura_externa).filter(Boolean));
          if (foliosUnicos.size === 1) {
            $('folioFactura').value = [...foliosUnicos][0];
          }

          // Cuando se llega con liberacion_ids, mostrar SOLO esas liberaciones
          // (no el resto del lote que viaja en otras facturas)
          const libIdsAIncluir = new Set(preselectLibIds);
          lotesDisponibles = lotesDisponibles.filter(l => libIdsAIncluir.has(l.liberacion_id));

          // Marcar como seleccionadas SOLO las certificables; las bloqueadas
          // (no_cumple / incompleta / sin_pliego sin excepción) quedan visibles
          // pero deshabilitadas — el backend también las rechazaría.
          lotesSeleccionados.clear();
          let bloqueadasPre = 0;
          lotesDisponibles.forEach(l => {
            if (esBloqueada(l)) { bloqueadasPre++; return; }
            lotesSeleccionados.add(l.liberacion_id);
          });
          renderLotes();
          // Marcar visualmente los checkboxes tras render
          document.querySelectorAll('input[data-lote-pick]').forEach(cb => {
            if (!cb.disabled) cb.checked = lotesSeleccionados.has(cb.value);
          });
          actualizarResumen();
          actualizarBotonEmitir();

          // Avisos: faltantes (inactivas/otro cliente) y bloqueadas por validación.
          const noEncontrados = preselectLibIds.length - lotesDisponibles.length;
          if (bloqueadasPre > 0) {
            KoguApi.toast(
              `${bloqueadasPre} lote(s) requieren excepción aprobada para certificar y no se seleccionaron.`,
              'warning',
            );
          }
          if (noEncontrados > 0) {
            KoguApi.toast(
              `${noEncontrados} lote(s) de la selección no están disponibles para este cliente (puede que la liberación esté inactiva).`,
              'warning',
            );
          }
          if (bloqueadasPre === 0 && noEncontrados === 0) {
            KoguApi.toast(
              `${validas.length} liberación(es) precargadas. Captura folio de factura y emite.`,
              'success',
            );
          }
        }
      }
    } catch (err) {
      KoguApi.toast('No se pudieron precargar las liberaciones: ' + err.message, 'error');
    }
  }
});

// ============================================================
// lab-costos.js
// Costos de laboratorio — captura mensual de MO y gastos (Fase 1).
//
// Modelo: dos bolsas (ver lab/analisis/KOGU_lab_AnalisisCostos_v1.md).
//   bolsa fija     = total × pct_fijo_lote / 100   → ÷ lotes del mes
//   bolsa variable = total − bolsa fija            → ÷ determinaciones del mes
//   costo_lote = fija/lotes + variable/dets × dets_del_lote
//
// El periodo lo define lab_resultados.fecha_analisis, no fecha_evento:
// así un mes cerrado no cambia cuando alguien captura un resultado atrasado.
//
// Este módulo es INFORMATIVO. No alimenta el ABC.
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/lab/lab-costos.html';
  const BASE = '/protected/lab/costos';
  const PERM = 'screen.lab.costos';

  const MESES = ['enero','febrero','marzo','abril','mayo','junio',
                 'julio','agosto','septiembre','octubre','noviembre','diciembre'];

  const STATUS = {
    borrador:  { label: 'Borrador',  color: '#d97706', bg: '#fef3c7' },
    calculado: { label: 'Calculado', color: '#0e7490', bg: '#ecfeff' },
    cerrado:   { label: 'Cerrado',   color: '#16a34a', bg: '#dcfce7' },
    historico: { label: 'Histórico', color: '#64748b', bg: '#e2e8f0' },
  };

  const ORIGEN_LABEL = {
    produccion: 'Producción',
    compra:     'Compra (materia prima)',
    manual:     'Manual',
    sda:        'SDA',
  };

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Costos de laboratorio',
    description: 'Mano de obra y gastos del mes, repartidos entre el trabajo analítico real. Informativo para laboratorio — no alimenta el ABC.',
    requiredPermission: PERM,
  });
  if (!b) return;

  // hasPerm(bootstrap, permiso) — con un solo argumento devuelve true siempre
  // (la función abre con `if(!perm) return true`), y analista_lab, que solo
  // tiene lectura, vería todos los botones de captura y cierre.
  const puedeEditar = KoguShell.hasPerm(b, 'lab.costos.manage');
  const puedeCerrar = KoguShell.hasPerm(b, 'lab.costos.cerrar');

  // ── Estado ────────────────────────────────────────────
  let periodos   = [];    // cabeceras para el selector
  let actual     = null;  // { periodo, conceptos, denominadores, por_origen, reparto }
  let pctPreview = null;  // valor del slider mientras no se ha guardado

  const $ = (id) => document.getElementById(id);

  // ── Render shell ──────────────────────────────────────
  const c = document.getElementById('pageContent');
  c.innerHTML = `
<div class="card">
  <div class="row">
    <div>
      <div class="eyebrow">Lab QA</div>
      <h2>Costos de laboratorio</h2>
    </div>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <select class="select" id="periodoSel" style="width:auto;min-width:190px"></select>
      <span id="statusBadge"></span>
      <button class="btn ghost"   id="refreshBtn">Actualizar</button>
      ${puedeEditar ? '<button class="btn primary" id="nuevoBtn">+ Nuevo periodo</button>' : ''}
    </div>
  </div>
  <div id="accionesBar" style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap"></div>
</div>

<div id="vacio" class="card" style="display:none;margin-top:16px">
  <p style="color:var(--muted);margin:0">
    Todavía no hay periodos de costos capturados.
    ${puedeEditar ? 'Usa <strong>+ Nuevo periodo</strong> para empezar por el mes que quieras costear.' : 'Pide a jefatura de laboratorio que capture el primero.'}
  </p>
</div>

<div id="detalle" style="display:none">
  <div class="grid-2" style="margin-top:16px;align-items:start;gap:16px">

    <!-- ── Columna izquierda: captura ── -->
    <div style="display:flex;flex-direction:column;gap:16px">
      <div class="card">
        <div class="eyebrow">Paso 1</div>
        <h3 style="margin:6px 0 2px">Mano de obra y gastos del mes</h3>
        <div style="color:var(--muted);font-size:12px;margin-bottom:12px">
          Cada renglón queda con su concepto para poder explicar el total después.
        </div>

        <div id="grupoMo"></div>
        <div id="grupoGasto" style="margin-top:18px"></div>

        <div style="display:flex;justify-content:space-between;align-items:center;
                    border-top:2px solid var(--line);margin-top:16px;padding-top:14px">
          <strong style="font-size:15px">Total del periodo</strong>
          <strong id="totalPeriodo" style="font-size:20px"></strong>
        </div>
      </div>

      <div class="card">
        <div class="eyebrow">Conciliación</div>
        <h3 style="margin:6px 0 2px">Contra el costo B del ABC</h3>
        <div style="color:var(--muted);font-size:12px;line-height:1.55">
          El laboratorio ya es uno de los elementos del costo B. Si contabilidad puede
          decir cuánto de <code>importe_b</code> le corresponde, captúralo aquí y las
          dos vistas amarran.
        </div>
        <div style="margin-top:12px">
          <div class="label-text">Porción de laboratorio en importe_b</div>
          <input class="input" id="importeB" type="text" inputmode="decimal"
                 placeholder="Sin informar" ${puedeEditar ? '' : 'disabled'}/>
        </div>
        <div id="conciliacionNota" style="margin-top:12px"></div>
      </div>
    </div>

    <!-- ── Columna derecha: reparto ── -->
    <div style="display:flex;flex-direction:column;gap:16px">
      <div class="card">
        <div class="eyebrow">Paso 2</div>
        <h3 style="margin:6px 0 2px">Reparto: dos bolsas</h3>
        <div style="color:var(--muted);font-size:12px;line-height:1.55">
          El bolsón se parte en lo que cuesta <strong>atender un lote</strong>
          —recepción, preparación de muestra, revisión, liberación, COA— y lo que
          cuesta <strong>cada análisis</strong>.
        </div>

        <div id="bagbar" style="display:flex;height:36px;border-radius:12px;overflow:hidden;
                                border:1px solid var(--line);margin:14px 0 8px">
          <div id="segFija" style="background:#0e7490;color:#fff;display:flex;align-items:center;
               justify-content:center;font-size:11px;font-weight:700;white-space:nowrap;overflow:hidden"></div>
          <div id="segVar"  style="background:#0891b2;opacity:.62;color:#fff;display:flex;align-items:center;
               justify-content:center;font-size:11px;font-weight:700;white-space:nowrap;overflow:hidden"></div>
        </div>
        <input type="range" id="pct" min="0" max="100" step="5" value="50"
               style="width:100%;accent-color:#0891b2" ${puedeEditar ? '' : 'disabled'}/>
        <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--muted);font-weight:600">
          <span>0 % — todo por determinación</span><span>100 % — todo por lote</span>
        </div>

        <div style="margin-top:14px;border-top:1px solid var(--line);padding-top:12px">
          <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:13px">
            <span style="color:var(--muted)">Bolsa fija</span><strong id="bolsaFija"></strong>
          </div>
          <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:13px">
            <span style="color:var(--muted)">Bolsa variable</span><strong id="bolsaVar"></strong>
          </div>
        </div>
        <div style="border-left:3px solid var(--primary);background:#ecfeff;border-radius:0 12px 12px 0;
                    padding:10px 13px;font-size:12px;color:#164e63;margin-top:12px;line-height:1.55">
          <strong>El parámetro se congela en el periodo.</strong> No se lee de configuración
          viva, para que un mes cerrado siempre se pueda reproducir tal como se publicó.
        </div>
      </div>

      <div class="card">
        <div class="eyebrow">Paso 3 · automático</div>
        <h3 style="margin:6px 0 2px">Denominadores del mes</h3>
        <div style="color:var(--muted);font-size:12px;line-height:1.55">
          Se leen del trabajo real registrado. Cada determinación cuenta en el mes de
          su <code>fecha_analisis</code>; el cargo fijo de un lote cuenta en el mes de
          su primera determinación.
        </div>
        <div id="denominadores" style="margin-top:12px"></div>
        <div id="tarifas" style="margin-top:14px;border-top:1px solid var(--line);padding-top:14px"></div>
      </div>

      <div class="card">
        <div class="eyebrow">Segmentación obligatoria</div>
        <h3 style="margin:6px 0 2px">Por origen del lote</h3>
        <div style="color:var(--muted);font-size:12px;line-height:1.55">
          Nunca se publica un solo costo por kg global: la misma materia prima se
          analiza al entrar como <code>compra</code> y el producto que la contiene al
          salir como <code>produccion</code>.
        </div>
        <div id="porOrigen" style="margin-top:12px"></div>
      </div>
    </div>

  </div>
</div>
  `;

  // ══════════════════════════════════════════════════════
  // Carga
  // ══════════════════════════════════════════════════════

  async function cargarPeriodos({ seleccionar = null, showToast = false } = {}) {
    try {
      const res = await KoguApi.apiFetch(`${BASE}/periodos?pageSize=60`);
      periodos = KoguApi.unwrapData(res) || [];

      const sel = $('periodoSel');
      if (!periodos.length) {
        sel.innerHTML = '<option value="">Sin periodos</option>';
        $('vacio').style.display   = '';
        $('detalle').style.display = 'none';
        $('statusBadge').innerHTML = '';
        $('accionesBar').innerHTML = '';
        return;
      }
      $('vacio').style.display = 'none';

      sel.innerHTML = periodos.map(p =>
        `<option value="${escapeAttr(p.periodo_id)}">${escapeHtml(etiqueta(p.anio, p.mes))}${p.status === 'cerrado' ? ' · cerrado' : ''}</option>`
      ).join('');

      const id = seleccionar
        || (actual && periodos.some(p => p.periodo_id === actual.periodo.periodo_id) ? actual.periodo.periodo_id : null)
        || periodos[0].periodo_id;
      sel.value = id;

      await cargarDetalle(id);
      if (showToast) KoguApi.toast('Costos actualizados', 'success');
    } catch (err) {
      KoguApi.toast(err.message, 'error');
    }
  }

  async function cargarDetalle(periodoId) {
    try {
      const res = await KoguApi.apiFetch(`${BASE}/periodos/${encodeURIComponent(periodoId)}`);
      actual = KoguApi.unwrapData(res);
      pctPreview = null;
      render();
    } catch (err) {
      KoguApi.toast(err.message, 'error');
    }
  }

  // ══════════════════════════════════════════════════════
  // Render
  // ══════════════════════════════════════════════════════

  function render() {
    if (!actual) return;
    $('detalle').style.display = '';

    const p        = actual.periodo;
    const bloqueado = p.status === 'cerrado' || p.status === 'historico' || !puedeEditar;

    // Badge de estado
    const st = STATUS[p.status] || { label: p.status, color: '#64748b', bg: '#e2e8f0' };
    $('statusBadge').innerHTML =
      `<span class="chip" style="background:${st.bg};color:${st.color};font-weight:700">${escapeHtml(st.label)}</span>`;

    // Acciones
    const acciones = [];
    if (puedeEditar && !bloqueado) {
      acciones.push('<button class="btn ghost" id="copiarBtn">Copiar estructura del mes anterior</button>');
    }
    if (puedeCerrar && p.status !== 'cerrado' && p.status !== 'historico') {
      acciones.push('<button class="btn primary" id="cerrarBtn">Cerrar periodo</button>');
    }
    if (puedeCerrar && p.status === 'cerrado') {
      acciones.push('<button class="btn ghost" id="reabrirBtn">Reabrir periodo</button>');
    }
    if (puedeEditar && p.status === 'borrador') {
      acciones.push('<button class="btn ghost danger" id="eliminarBtn">Eliminar periodo</button>');
    }
    $('accionesBar').innerHTML = acciones.join('');
    if ($('copiarBtn'))   $('copiarBtn').addEventListener('click', copiarMesAnterior);
    if ($('cerrarBtn'))   $('cerrarBtn').addEventListener('click', cerrarPeriodo);
    if ($('reabrirBtn'))  $('reabrirBtn').addEventListener('click', reabrirPeriodo);
    if ($('eliminarBtn')) $('eliminarBtn').addEventListener('click', eliminarPeriodo);

    renderGrupo('mo',    'Mano de obra', $('grupoMo'),    bloqueado);
    renderGrupo('gasto', 'Gastos',       $('grupoGasto'), bloqueado);

    $('totalPeriodo').textContent = money(p.total_periodo);

    // Conciliación
    $('importeB').value    = p.importe_b_laboratorio != null ? String(p.importe_b_laboratorio) : '';
    $('importeB').disabled = bloqueado;
    $('conciliacionNota').innerHTML = p.importe_b_laboratorio == null
      ? nota('warn', '<strong>Total estimado por laboratorio.</strong> Contabilidad no ha desglosado qué parte del costo B corresponde al área, así que este total no concilia con la contabilidad. Las comparaciones relativas entre productos siguen siendo válidas.')
      : diferenciaB(p);

    // Reparto
    $('pct').value    = pctPreview != null ? pctPreview : Number(p.pct_fijo_lote);
    $('pct').disabled = bloqueado;
    renderReparto();

    // Denominadores
    const d = actual.denominadores || {};
    $('denominadores').innerHTML = [
      kv('Lotes analizados',        int(d.lotes)),
      kv('Determinaciones',         int(d.determinaciones)),
      kv('Muestras procesadas',     int(d.muestras)),
      kv('Analistas con actividad', int(d.analistas)),
    ].join('');

    renderPorOrigen();
  }

  function renderGrupo(tipo, titulo, cont, bloqueado) {
    const filas = (actual.conceptos || []).filter(x => x.tipo === tipo);
    const subtotal = filas.reduce((a, x) => a + Number(x.importe || 0), 0);

    cont.innerHTML = `
      <div class="label-text">${escapeHtml(titulo)}</div>
      <div class="table-wrap">
        <table>
          <tbody>
            ${filas.length ? filas.map(x => `
              <tr>
                <td>${escapeHtml(x.concepto)}</td>
                <td style="text-align:right;width:150px">
                  ${bloqueado
                    ? `<span>${money(x.importe)}</span>`
                    : `<input class="input" data-importe="${escapeAttr(x.concepto_id)}"
                             value="${escapeAttr(x.importe)}" inputmode="decimal"
                             style="text-align:right;padding:6px 8px"/>`}
                </td>
                ${bloqueado ? '' : `<td style="width:40px;text-align:right">
                  <button class="btn ghost danger" data-del="${escapeAttr(x.concepto_id)}"
                          title="Eliminar" style="padding:4px 8px">✕</button></td>`}
              </tr>`).join('')
              : `<tr><td colspan="3" style="color:var(--muted);text-align:center;padding:16px">
                   Sin conceptos de ${escapeHtml(titulo.toLowerCase())}.</td></tr>`}
          </tbody>
          <tfoot>
            <tr style="background:#f8fafc;font-weight:700">
              <td>Subtotal ${escapeHtml(titulo.toLowerCase())}</td>
              <td style="text-align:right">${money(subtotal)}</td>
              ${bloqueado ? '' : '<td></td>'}
            </tr>
          </tfoot>
        </table>
      </div>
      ${bloqueado ? '' : `
      <div style="display:flex;gap:8px;margin-top:8px">
        <input class="input" data-nuevo-concepto="${tipo}" placeholder="Nuevo concepto de ${escapeHtml(titulo.toLowerCase())}…" style="flex:2"/>
        <input class="input" data-nuevo-importe="${tipo}"  placeholder="0.00" inputmode="decimal" style="flex:1;text-align:right"/>
        <button class="btn" data-agregar="${tipo}">Agregar</button>
      </div>`}
    `;

    if (bloqueado) return;

    cont.querySelectorAll('input[data-importe]').forEach(inp => {
      inp.addEventListener('change', () => guardarImporte(inp.dataset.importe, inp.value));
      inp.addEventListener('keydown', ev => { if (ev.key === 'Enter') inp.blur(); });
    });
    cont.querySelectorAll('button[data-del]').forEach(btn => {
      btn.addEventListener('click', () => eliminarConcepto(btn.dataset.del));
    });
    const btnAdd = cont.querySelector(`button[data-agregar="${tipo}"]`);
    if (btnAdd) btnAdd.addEventListener('click', () => agregarConcepto(tipo, cont));
    const inpImp = cont.querySelector(`input[data-nuevo-importe="${tipo}"]`);
    if (inpImp) inpImp.addEventListener('keydown', ev => { if (ev.key === 'Enter') agregarConcepto(tipo, cont); });
  }

  // El reparto se recalcula en el front mientras se mueve el slider, con la
  // MISMA fórmula del backend, para que la respuesta sea inmediata. El valor
  // que manda es siempre el que devuelve el servidor tras guardar.
  function renderReparto() {
    const p     = actual.periodo;
    const d     = actual.denominadores || {};
    const pct   = pctPreview != null ? pctPreview : Number(p.pct_fijo_lote);
    const total = Number(p.total_periodo || 0);

    const fija = +(total * pct / 100).toFixed(2);
    const vari = +(total - fija).toFixed(2);
    const pv   = 100 - pct;

    $('segFija').style.width = pct + '%';
    $('segVar').style.width  = pv  + '%';
    $('segFija').textContent = pct >= 30 ? `Fija por lote · ${pct}%` : pct >= 12 ? `Fija · ${pct}%` : pct >= 6 ? `${pct}%` : '';
    $('segVar').textContent  = pv  >= 40 ? `Variable por determinación · ${pv}%` : pv >= 18 ? `Variable · ${pv}%` : pv >= 6 ? `${pv}%` : '';

    $('bolsaFija').textContent = money(fija);
    $('bolsaVar').textContent  = money(vari);

    const lotes = Number(d.lotes || 0);
    const dets  = Number(d.determinaciones || 0);

    if (!lotes || !dets) {
      $('tarifas').innerHTML = nota('warn',
        `<strong>Sin actividad analítica en ${escapeHtml(etiqueta(p.anio, p.mes))}.</strong> `
        + `Hay ${int(lotes)} lote(s) y ${int(dets)} determinación(es) registradas en el mes, `
        + 'así que todavía no hay entre qué repartir el costo. El periodo no se puede cerrar hasta que exista trabajo capturado.');
      return;
    }

    $('tarifas').innerHTML = `
      <div class="grid-2" style="gap:12px">
        <div>
          <div class="label-text">Costo por lote</div>
          <div style="font-size:20px;font-weight:800">${money(fija / lotes)}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:2px">bolsa fija ÷ ${int(lotes)} lotes</div>
        </div>
        <div>
          <div class="label-text">Costo por determinación</div>
          <div style="font-size:20px;font-weight:800">${money(vari / dets)}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:2px">bolsa variable ÷ ${int(dets)} det.</div>
        </div>
      </div>`;
  }

  function renderPorOrigen() {
    const filas = actual.por_origen || [];
    if (!filas.length) {
      $('porOrigen').innerHTML = `<div style="color:var(--muted);font-size:13px">Sin actividad registrada en el mes.</div>`;
      return;
    }

    const sinKg = filas.reduce((a, x) => a + Number(x.lotes_sin_kg || 0), 0);

    $('porOrigen').innerHTML = `
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Origen</th>
            <th style="text-align:right">Lotes nuevos</th>
            <th style="text-align:right">Con actividad</th>
            <th style="text-align:right">Det.</th>
            <th style="text-align:right">kg</th>
          </tr></thead>
          <tbody>
            ${filas.map(x => `
              <tr>
                <td>${escapeHtml(ORIGEN_LABEL[x.origen] || x.origen)}</td>
                <td style="text-align:right">${int(x.lotes_nuevos)}</td>
                <td style="text-align:right">${int(x.lotes_con_actividad)}</td>
                <td style="text-align:right">${int(x.determinaciones)}</td>
                <td style="text-align:right">${Number(x.kg) > 0 ? int(Math.round(Number(x.kg))) : '—'}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div style="font-size:11px;color:var(--muted);margin-top:8px;line-height:1.5">
        <strong>Lotes nuevos</strong> = su primera determinación cayó en este mes; son los que
        cargan la bolsa fija y los que cuentan para la vista de kg.
        <strong>Con actividad</strong> = tuvieron análisis en el mes, hayan empezado antes o no.
      </div>
      ${sinKg > 0 ? nota('warn',
        `<strong>${int(sinKg)} lote(s) sin kilos utilizables.</strong> No tienen cantidad capturada o `
        + 'su unidad no es de masa (solo se convierten KG, GR y TON). Su costo sí está repartido y sí '
        + 'aparece en las demás vistas — simplemente no tienen kilos con los cuales dividirse.') : ''}
    `;
  }

  function diferenciaB(p) {
    const capturado = Number(p.total_periodo || 0);
    const abc       = Number(p.importe_b_laboratorio || 0);
    const dif       = capturado - abc;
    const pct       = abc ? Math.abs(dif / abc * 100) : 0;
    const ok        = pct <= 1;
    return nota(ok ? 'ok' : 'warn',
      `<strong>Capturado ${money(capturado)}</strong> contra ${money(abc)} de la porción de laboratorio en el costo B. `
      + `Diferencia: ${money(dif)} (${pct.toFixed(1)} %). `
      + (ok ? 'Las dos vistas amarran.'
            : 'Vale la pena revisar qué conceptos entran de cada lado antes de cerrar el mes.'));
  }

  // ══════════════════════════════════════════════════════
  // Acciones
  // ══════════════════════════════════════════════════════

  async function guardarImporte(conceptoId, valor) {
    const n = aNumero(valor);
    if (n === null) { KoguApi.toast('Importe no válido.', 'error'); return; }
    try {
      const res = await KoguApi.apiFetch(`${BASE}/conceptos/${encodeURIComponent(conceptoId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ importe: n }),
      });
      actual = KoguApi.unwrapData(res);
      render();
    } catch (err) { KoguApi.toast(err.message, 'error'); }
  }

  async function agregarConcepto(tipo, cont) {
    const inpC = cont.querySelector(`input[data-nuevo-concepto="${tipo}"]`);
    const inpI = cont.querySelector(`input[data-nuevo-importe="${tipo}"]`);
    const concepto = (inpC?.value || '').trim();
    if (!concepto) { KoguApi.toast('Escribe el nombre del concepto.', 'error'); inpC?.focus(); return; }

    const importe = inpI?.value ? aNumero(inpI.value) : 0;
    if (importe === null) { KoguApi.toast('Importe no válido.', 'error'); inpI?.focus(); return; }

    try {
      const res = await KoguApi.apiFetch(`${BASE}/periodos/${encodeURIComponent(actual.periodo.periodo_id)}/conceptos`, {
        method: 'POST',
        body: JSON.stringify({ tipo, concepto, importe }),
      });
      actual = KoguApi.unwrapData(res);
      render();
    } catch (err) { KoguApi.toast(err.message, 'error'); }
  }

  async function eliminarConcepto(conceptoId) {
    const fila = (actual.conceptos || []).find(x => x.concepto_id === conceptoId);
    if (!confirm(`¿Eliminar el concepto "${fila?.concepto || ''}"?`)) return;
    try {
      const res = await KoguApi.apiFetch(`${BASE}/conceptos/${encodeURIComponent(conceptoId)}`, { method: 'DELETE' });
      actual = KoguApi.unwrapData(res);
      render();
    } catch (err) { KoguApi.toast(err.message, 'error'); }
  }

  const guardarPct = debounce(async (pct) => {
    try {
      const res = await KoguApi.apiFetch(`${BASE}/periodos/${encodeURIComponent(actual.periodo.periodo_id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ pct_fijo_lote: pct }),
      });
      actual = KoguApi.unwrapData(res);
      // Si el usuario siguió moviendo el control mientras se guardaba, no se
      // repinta con el valor viejo: se deja el preview y se vuelve a guardar.
      const enPantalla = parseInt($('pct').value, 10);
      if (enPantalla !== pct) { pctPreview = enPantalla; guardarPct(enPantalla); return; }
      pctPreview = null;
      render();
    } catch (err) { KoguApi.toast(err.message, 'error'); }
  }, 450);

  async function guardarImporteB(valor) {
    const txt = String(valor || '').trim();
    const n   = txt === '' ? null : aNumero(txt);
    if (txt !== '' && n === null) { KoguApi.toast('Importe no válido.', 'error'); return; }
    try {
      const res = await KoguApi.apiFetch(`${BASE}/periodos/${encodeURIComponent(actual.periodo.periodo_id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ importe_b_laboratorio: n }),
      });
      actual = KoguApi.unwrapData(res);
      render();
    } catch (err) { KoguApi.toast(err.message, 'error'); }
  }

  async function nuevoPeriodo() {
    const hoy = new Date();
    // Por defecto, el mes anterior: el mes en curso todavía no está completo.
    let anio = hoy.getFullYear();
    let mes  = hoy.getMonth();          // 0-based → ya es el mes anterior en 1-based
    if (mes === 0) { mes = 12; anio -= 1; }

    const txt = prompt('Periodo a capturar (AAAA-MM):', `${anio}-${String(mes).padStart(2, '0')}`);
    if (!txt) return;
    const m = String(txt).trim().match(/^(\d{4})[-/](\d{1,2})$/);
    if (!m) { KoguApi.toast('Formato esperado: AAAA-MM (por ejemplo 2026-07).', 'error'); return; }

    try {
      const res = await KoguApi.apiFetch(`${BASE}/periodos`, {
        method: 'POST',
        body: JSON.stringify({
          anio: parseInt(m[1], 10),
          mes:  parseInt(m[2], 10),
          copiar_mes_anterior: true,
        }),
      });
      const data = KoguApi.unwrapData(res);
      KoguApi.toast('Periodo creado', 'success');
      await cargarPeriodos({ seleccionar: data.periodo.periodo_id });
    } catch (err) { KoguApi.toast(err.message, 'error'); }
  }

  async function copiarMesAnterior() {
    if (!confirm('Se copiará la ESTRUCTURA de conceptos del mes anterior, con los importes en cero. ¿Continuar?')) return;
    try {
      const res = await KoguApi.apiFetch(`${BASE}/periodos/${encodeURIComponent(actual.periodo.periodo_id)}/copiar-mes-anterior`, { method: 'POST' });
      const data = KoguApi.unwrapData(res);
      actual = data;
      render();
      KoguApi.toast(`${data.conceptos_copiados || 0} concepto(s) copiados`, 'success');
    } catch (err) { KoguApi.toast(err.message, 'error'); }
  }

  async function cerrarPeriodo() {
    const p = actual.periodo;
    if (!confirm(`¿Cerrar ${etiqueta(p.anio, p.mes)}? Después de cerrarlo no se puede modificar sin reabrirlo, y la reapertura queda en la bitácora.`)) return;
    try {
      const res = await KoguApi.apiFetch(`${BASE}/periodos/${encodeURIComponent(p.periodo_id)}/cerrar`, { method: 'POST' });
      actual = KoguApi.unwrapData(res);
      render();
      await cargarPeriodos({ seleccionar: p.periodo_id });
      KoguApi.toast('Periodo cerrado', 'success');
    } catch (err) { KoguApi.toast(err.message, 'error'); }
  }

  async function reabrirPeriodo() {
    const motivo = prompt('Motivo de la reapertura (mínimo 10 caracteres). Queda registrado en la bitácora:');
    if (motivo === null) return;
    try {
      const res = await KoguApi.apiFetch(`${BASE}/periodos/${encodeURIComponent(actual.periodo.periodo_id)}/reabrir`, {
        method: 'POST',
        body: JSON.stringify({ motivo }),
      });
      actual = KoguApi.unwrapData(res);
      render();
      await cargarPeriodos({ seleccionar: actual.periodo.periodo_id });
      KoguApi.toast('Periodo reabierto', 'success');
    } catch (err) { KoguApi.toast(err.message, 'error'); }
  }

  async function eliminarPeriodo() {
    const p = actual.periodo;
    if (!confirm(`¿Eliminar el periodo ${etiqueta(p.anio, p.mes)} y todos sus conceptos? No se puede deshacer.`)) return;
    try {
      await KoguApi.apiFetch(`${BASE}/periodos/${encodeURIComponent(p.periodo_id)}`, { method: 'DELETE' });
      actual = null;
      KoguApi.toast('Periodo eliminado', 'success');
      await cargarPeriodos();
    } catch (err) { KoguApi.toast(err.message, 'error'); }
  }

  // ══════════════════════════════════════════════════════
  // Listeners
  // ══════════════════════════════════════════════════════

  $('periodoSel').addEventListener('change', e => { if (e.target.value) cargarDetalle(e.target.value); });
  $('refreshBtn').addEventListener('click',  () => cargarPeriodos({ showToast: true }));
  if ($('nuevoBtn')) $('nuevoBtn').addEventListener('click', nuevoPeriodo);

  $('pct').addEventListener('input', e => {
    pctPreview = parseInt(e.target.value, 10);
    renderReparto();
    guardarPct(pctPreview);
  });

  $('importeB').addEventListener('change', e => guardarImporteB(e.target.value));

  // Al cambiar de empresa activa hay que recargar todo: los periodos, los
  // conceptos y los denominadores son de la empresa anterior.
  KoguShell.subscribeEmpresaActivaChange(async () => {
    actual = null;
    await cargarPeriodos({ showToast: true });
  });

  // ══════════════════════════════════════════════════════
  // Helpers
  // ══════════════════════════════════════════════════════

  function etiqueta(anio, mes) {
    const nombre = MESES[Number(mes) - 1] || mes;
    return `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} ${anio}`;
  }

  function money(v) {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(v || 0));
  }
  function int(v) { return new Intl.NumberFormat('es-MX').format(Number(v || 0)); }

  function kv(k, v) {
    return `<div style="display:flex;justify-content:space-between;padding:7px 0;
                        border-bottom:1px solid var(--line);font-size:13px">
              <span style="color:var(--muted)">${escapeHtml(k)}</span>
              <strong>${escapeHtml(String(v))}</strong>
            </div>`;
  }

  function nota(tipo, html) {
    const c = tipo === 'warn'
      ? 'border-left:3px solid #d97706;background:#fffbeb;color:#78350f'
      : tipo === 'ok'
        ? 'border-left:3px solid #16a34a;background:#f0fdf4;color:#14532d'
        : 'border-left:3px solid var(--primary);background:#ecfeff;color:#164e63';
    return `<div style="${c};border-radius:0 12px 12px 0;padding:11px 14px;font-size:12px;line-height:1.6">${html}</div>`;
  }

  // Acepta "1,234.56", "1 234,56", "8,85". Devuelve null si no es un número
  // limpio, en vez de adivinar. Mismo criterio que lab-lote-detalle.js.
  function aNumero(txt) {
    let s = String(txt ?? '').trim();
    if (!s) return null;
    s = s.replace(/\s| /g, '');
    const tieneComa = s.includes(',');
    const tienePunto = s.includes('.');
    if (tieneComa && tienePunto) {
      // El último separador que aparece es el decimal.
      s = s.lastIndexOf(',') > s.lastIndexOf('.')
        ? s.replace(/\./g, '').replace(',', '.')
        : s.replace(/,/g, '');
    } else if (tieneComa) {
      // Una sola coma con 1-2 decimales es decimal; si no, es de millares.
      s = /,\d{1,2}$/.test(s) ? s.replace(',', '.') : s.replace(/,/g, '');
    }
    if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  function escapeHtml(s) { return String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m]); }
  function escapeAttr(s) { return String(s ?? '').replace(/"/g, '&quot;'); }
  function debounce(fn, ms) { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); }; }

  await cargarPeriodos();
});

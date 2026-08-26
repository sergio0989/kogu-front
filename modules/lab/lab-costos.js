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
  const puedeCerrar   = KoguShell.hasPerm(b, 'lab.costos.cerrar');
  const puedeCalcular = KoguShell.hasPerm(b, 'lab.costos.calcular');

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

  <div class="tabs-costos" style="display:flex;gap:4px;border-bottom:1px solid var(--line);margin-top:16px">
    <button class="tabc" data-pane="captura"   style="border:0;background:none;padding:11px 16px;font-size:13.5px;font-weight:700;cursor:pointer;font-family:inherit;margin-bottom:-1px">Captura del periodo</button>
    <button class="tabc" data-pane="resultado" style="border:0;background:none;padding:11px 16px;font-size:13.5px;font-weight:700;cursor:pointer;font-family:inherit;margin-bottom:-1px">Resultado del reparto</button>
    <button class="tabc" data-pane="abc" style="border:0;background:none;padding:11px 16px;font-size:13.5px;font-weight:700;cursor:pointer;font-family:inherit;margin-bottom:-1px">Comparativo vs ABC</button>
  </div>

  <div id="pane-captura">
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

  <div id="pane-resultado" style="display:none">
    <div id="resumenCards" class="grid-4" style="margin-top:16px;gap:16px"></div>

    <div class="card" style="margin-top:16px">
      <div class="row">
        <div>
          <div class="eyebrow">Resultado</div>
          <h3 style="margin:6px 0 2px">Costo asignado</h3>
          <div style="color:var(--muted);font-size:12px">
            El costo por kg se calcula al final, sobre el costo ya asignado por actividad.
            Nunca es la base del reparto.
          </div>
        </div>
        <select class="select" id="agruparSel" style="width:auto;min-width:200px">
          <option value="producto">Por producto</option>
          <option value="lote">Por lote</option>
          <option value="origen">Por origen</option>
          <option value="analista">Por analista</option>
          <option value="parametro">Por parámetro</option>
          <option value="metodo">Por método</option>
        </select>
      </div>
      <div id="granoNota" style="margin-top:12px"></div>
      <div id="tablaResultado" style="margin-top:12px"></div>
    </div>
  </div>

  <div id="pane-abc" style="display:none">
    <div class="card" style="margin-top:16px">
      <div class="eyebrow">Por qué existe esta pantalla</div>
      <h3 style="margin:6px 0 2px">El ABC ya reparte el costo del laboratorio — proporcional al volumen</h3>
      <div style="color:var(--muted);font-size:12.5px;line-height:1.6">
        El laboratorio vive dentro del costo B, y el costo B se divide entre kilos.
        Eso significa que hoy, sin que nadie lo haya decidido,
        <strong>cada producto ya carga un costo de laboratorio proporcional a los kilos
        que vende</strong>. Esta pantalla pone al lado el costo que realmente consumió.
        La diferencia no propone cambiar el ABC: lo mide.
      </div>
    </div>

    <div id="abcCards" class="grid-3" style="margin-top:16px;gap:16px"></div>
    <div id="abcConciliacion" style="margin-top:16px"></div>

    <div class="card" style="margin-top:16px">
      <div class="eyebrow">El entregable</div>
      <h3 style="margin:6px 0 2px">Quién está subsidiando a quién</h3>
      <div style="color:var(--muted);font-size:12px">
        Costo de laboratorio que el ABC le carga a cada producto por volumen,
        contra el que consumió por actividad.
      </div>
      <div id="tablaAbc" style="margin-top:14px"></div>
      <div style="display:flex;gap:18px;flex-wrap:wrap;font-size:12px;color:var(--muted);margin-top:12px">
        <span><i style="display:inline-block;width:11px;height:11px;border-radius:3px;background:#dc2626;margin-right:6px;vertical-align:-1px"></i>Subsidiado — consume más laboratorio del que le cobran</span>
        <span><i style="display:inline-block;width:11px;height:11px;border-radius:3px;background:#0891b2;margin-right:6px;vertical-align:-1px"></i>Sobrecargado — paga laboratorio que no consumió</span>
      </div>
      <div id="abcExcluidos" style="margin-top:14px"></div>
      <div style="margin-top:12px">
        <div style="border-left:3px solid #d97706;background:#fffbeb;color:#78350f;border-radius:0 12px 12px 0;padding:11px 14px;font-size:12px;line-height:1.6">
          <strong>Estas cifras no cuadran con <code>costo_promedio</code> del ABC, y está bien.</strong>
          El ABC divide entre kilos <em>vendidos</em> y opera sobre el mes de la factura;
          laboratorio analiza kilos <em>producidos y recibidos</em> sobre el mes del análisis,
          e incluye lotes de compra que el ABC no tiene. Son universos distintos a propósito.
        </div>
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
    if (puedeCalcular && p.status !== 'cerrado' && p.status !== 'historico') {
      acciones.push(`<button class="btn primary" id="calcularBtn">${p.status === 'calculado' ? 'Recalcular reparto' : 'Calcular reparto'}</button>`);
    }
    if (puedeCerrar && p.status === 'calculado') {
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
    if ($('calcularBtn')) $('calcularBtn').addEventListener('click', calcularReparto);
    if ($('cerrarBtn'))   $('cerrarBtn').addEventListener('click', cerrarPeriodo);
    if ($('reabrirBtn'))  $('reabrirBtn').addEventListener('click', reabrirPeriodo);
    if ($('eliminarBtn')) $('eliminarBtn').addEventListener('click', eliminarPeriodo);

    renderGrupo('mo',    'Mano de obra', $('grupoMo'),    bloqueado);
    renderGrupo('gasto', 'Gastos',       $('grupoGasto'), bloqueado);

    $('totalPeriodo').textContent = money(p.total_periodo);

    // Conciliación
    $('importeB').value = p.importe_b_laboratorio != null ? String(p.importe_b_laboratorio) : '';
    // La porción de laboratorio en importe_b llega junto con el importe del
    // ABC, o sea DESPUÉS de cerrar el mes. No entra en ninguna fórmula del
    // reparto, así que se puede capturar con el periodo cerrado — igual que
    // lo permite el backend, y como lo promete el banner del comparativo.
    $('importeB').disabled = !puedeEditar || p.status === 'historico';
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
    cargarResultado();
    // Si el usuario está parado en el comparativo y cambia de periodo o de
    // empresa, hay que repintarlo: si no, se queda mostrando las cifras del
    // periodo —o de la empresa— anterior sin ninguna señal.
    if (paneActivo === 'abc') cargarComparativo();
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
  // Resultado del reparto
  // ══════════════════════════════════════════════════════

  async function calcularReparto() {
    const p = actual.periodo;
    const rehacer = p.status === 'calculado';
    if (!confirm(rehacer
      ? '¿Recalcular el reparto? Se reemplaza el resultado anterior con los importes y el porcentaje actuales.'
      : `¿Calcular el reparto de ${etiqueta(p.anio, p.mes)}?`)) return;
    try {
      await KoguApi.apiFetch(`${BASE}/periodos/${encodeURIComponent(p.periodo_id)}/calcular`, { method: 'POST' });
      KoguApi.toast('Reparto calculado', 'success');
      await cargarDetalle(p.periodo_id);
      irA('resultado');
    } catch (err) { KoguApi.toast(err.message, 'error'); }
  }

  async function cargarResultado() {
    if (!actual || !actual.periodo) return;
    const p = actual.periodo;
    const calculado = p.status === 'calculado' || p.status === 'cerrado';

    if (!calculado) {
      $('resumenCards').innerHTML = '';
      $('granoNota').innerHTML = '';
      $('tablaResultado').innerHTML = nota('warn',
        '<strong>El reparto todavía no se ha calculado para este periodo.</strong> '
        + 'Captura la mano de obra y los gastos, ajusta el porcentaje de la bolsa fija y pulsa '
        + '<strong>Calcular reparto</strong>. Cualquier cambio posterior en un importe o en el '
        + 'porcentaje invalida el resultado y hay que volver a calcular — así no se publica una cifra vieja.');
      return;
    }

    try {
      const res = await KoguApi.apiFetch(
        `${BASE}/periodos/${encodeURIComponent(p.periodo_id)}/resultado?agrupar=${encodeURIComponent($('agruparSel').value)}&pageSize=300`);
      renderResultado(KoguApi.unwrapData(res));
    } catch (err) { KoguApi.toast(err.message, 'error'); }
  }

  function renderResultado(r) {
    const s = r.resumen || {};

    $('resumenCards').innerHTML = [
      card('Costo asignado', money(s.costo_total),
           `fijo ${money(s.costo_fijo)} · variable ${money(s.costo_variable)}`),
      card('Lotes', int(s.lotes),
           `${int(s.lotes_nuevos)} nuevos cargan la bolsa fija`),
      card('Determinaciones', int(s.determinaciones),
           `peso: ${escapeHtml(s.peso_origen || 'unitario')}`),
      card('Costo por kg', s.costo_por_kg != null ? money(s.costo_por_kg) : '—',
           s.lotes_sin_kg > 0
             ? `${int(s.lotes_sin_kg)} lote(s) sin kg · ${money(s.costo_sin_kg)} fuera de esta vista`
             : 'sobre todos los lotes del mes'),
    ].join('');

    $('granoNota').innerHTML = r.grano === 'determinacion'
      ? nota('info',
          '<strong>Este corte solo lleva costo variable.</strong> La bolsa fija es un costo del '
          + 'lote —recepción, preparación de muestra, revisión, liberación, COA— y no es atribuible '
          + `a un analista ni a un parámetro concreto. Los ${money(s.costo_fijo)} de bolsa fija `
          + 'aparecen en los cortes por lote, producto y origen.')
      // El residuo es casi siempre distinto de cero por redondeo a la sexta
      // decimal. Solo se avisa cuando alcanza a verse en pesos y centavos;
      // si no, el banner ámbar estaría permanente diciendo "$0.00".
      : (Math.abs(Number(s.residuo || 0)) >= 0.005 ? nota('warn',
          `<strong>Residuo de división: ${money(s.residuo)}.</strong> Sobra de repartir el bolsón `
          + 'entre los denominadores del mes. Se muestra en vez de esconderse.') : '');

    const filas = r.data || [];
    if (!filas.length) {
      $('tablaResultado').innerHTML = `<div style="color:var(--muted);font-size:13px">Sin renglones para esta agrupación.</div>`;
      return;
    }

    const conKg = r.grano === 'lote';
    $('tablaResultado').innerHTML = `
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>${conKg ? 'Concepto' : 'Dimensión'}</th>
            <th style="text-align:right">Lotes</th>
            <th style="text-align:right">Det.</th>
            ${conKg ? '<th style="text-align:right">Fijo</th>' : ''}
            <th style="text-align:right">Variable</th>
            <th style="text-align:right">Costo</th>
            ${conKg ? '<th style="text-align:right">kg</th><th style="text-align:right">Costo / kg</th>' : ''}
          </tr></thead>
          <tbody>
            ${filas.map(x => `
              <tr>
                <td><strong>${escapeHtml(x.etiqueta ?? '—')}</strong>
                  ${x.sub_etiqueta || x.sub_clave
                    ? `<div style="font-size:11px;color:var(--muted);margin-top:2px">${escapeHtml([x.sub_clave, x.sub_etiqueta].filter(Boolean).join(' · '))}</div>` : ''}
                </td>
                <td style="text-align:right">${int(x.lotes)}</td>
                <td style="text-align:right">${int(x.determinaciones)}</td>
                ${conKg ? `<td style="text-align:right">${money(x.costo_fijo)}</td>` : ''}
                <td style="text-align:right">${money(x.costo_variable)}</td>
                <td style="text-align:right"><strong>${money(x.costo_total)}</strong></td>
                ${conKg ? `
                  <td style="text-align:right">${Number(x.kg) > 0 ? int(Math.round(Number(x.kg))) : '—'}</td>
                  <td style="text-align:right">${x.costo_por_kg != null ? money(x.costo_por_kg) : '—'}
                    ${Number(x.lotes_sin_kg) > 0 ? `<div style="font-size:11px;color:var(--muted);margin-top:2px">${int(x.lotes_sin_kg)} sin kg</div>` : ''}
                  </td>` : ''}
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  // ══════════════════════════════════════════════════════
  // Comparativo contra el ABC
  // ══════════════════════════════════════════════════════

  async function cargarComparativo() {
    if (!actual || !actual.periodo) return;
    const p = actual.periodo;
    const calculado = p.status === 'calculado' || p.status === 'cerrado';

    if (!calculado) {
      $('abcCards').innerHTML = '';
      $('abcConciliacion').innerHTML = '';
      $('abcExcluidos').innerHTML = '';
      $('tablaAbc').innerHTML = nota('warn',
        '<strong>El comparativo necesita el reparto ya calculado.</strong> '
        + 'Sin repartir el bolsón no hay con qué comparar el cargo del ABC.');
      return;
    }

    try {
      const res = await KoguApi.apiFetch(`${BASE}/periodos/${encodeURIComponent(p.periodo_id)}/comparativo-abc`);
      renderComparativo(KoguApi.unwrapData(res));
    } catch (err) { KoguApi.toast(err.message, 'error'); }
  }

  function renderComparativo(r) {
    const base = r.base || {};
    const ext  = r.extremos;

    $('abcCards').innerHTML = [
      card('Reparto implícito del ABC',
           base.factor_kg != null ? money(base.factor_kg) : '—',
           `por kilo, parejo para todos los productos · cubre ${base.cobertura_pct ?? 0} % del costo del mes`),
      ext ? card('Producto más sobrecargado', ext.mas_sobrecargado.cve_prod || '—',
           `${escapeHtml(ext.mas_sobrecargado.desc_prod || '')} · el ABC le carga <strong>${money(Math.abs(ext.mas_sobrecargado.delta))}</strong> de más`)
        : card('Producto más sobrecargado', '—', 'sin datos'),
      ext ? card('Producto más subsidiado', ext.mas_subsidiado.cve_prod || '—',
           `${escapeHtml(ext.mas_subsidiado.desc_prod || '')} · el ABC le carga <strong>${money(Math.abs(ext.mas_subsidiado.delta))}</strong> de menos`)
        : card('Producto más subsidiado', '—', 'sin datos'),
    ].join('');

    const con = r.conciliacion || {};
    $('abcConciliacion').innerHTML = !con.informado
      ? nota('warn',
          '<strong>Total estimado por laboratorio.</strong> Contabilidad todavía no ha informado qué '
          + `parte de <code>importe_b</code> corresponde al área, así que los ${money(con.total_capturado)} `
          + 'capturados no están anclados a una cifra contable. El comparativo sigue siendo válido en forma '
          + '—quién consume más que su proporción— pero no en pesos frente a contabilidad. '
          + 'La porción se puede capturar en la pestaña de captura, incluso con el periodo ya cerrado.')
      : nota(con.concilia ? 'ok' : 'warn',
          `<strong>Capturado ${money(con.total_capturado)}</strong> contra ${money(con.importe_b_laboratorio)} `
          + 'de la porción de laboratorio en el costo B. '
          + `Diferencia: ${money(con.diferencia)}${con.pct_diferencia != null ? ` (${con.pct_diferencia} %)` : ''}. `
          + (con.concilia ? 'Las dos vistas amarran.'
                          : 'Vale la pena revisar qué conceptos entran de cada lado.'));

    const filas = r.data || [];
    if (!filas.length) {
      $('tablaAbc').innerHTML = `<div style="color:var(--muted);font-size:13px">
        Sin productos de producción con kilos en este periodo, así que no hay comparativo posible.</div>`;
      $('abcExcluidos').innerHTML = '';
      return;
    }

    const maxAbs = Math.max(...filas.map(x => Math.abs(Number(x.delta)))) || 1;

    $('tablaAbc').innerHTML = `
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Producto</th>
            <th style="text-align:right">Det./lote</th>
            <th style="text-align:right">kg</th>
            <th style="text-align:right">Le carga el ABC</th>
            <th style="text-align:right">Consumió</th>
            <th style="text-align:right">Diferencia</th>
            <th style="min-width:150px">Desvío</th>
          </tr></thead>
          <tbody>
            ${filas.map(x => {
              const pos   = Number(x.delta) > 0;
              const w     = Math.abs(Number(x.delta)) / maxAbs * 50;
              const color = pos ? 'var(--danger)' : 'var(--primary)';
              const fill  = pos
                ? `<div style="position:absolute;top:3px;height:14px;border-radius:4px;background:#dc2626;left:50%;width:${w}%"></div>`
                : `<div style="position:absolute;top:3px;height:14px;border-radius:4px;background:#0891b2;right:50%;width:${w}%"></div>`;
              return `
              <tr>
                <td><strong>${escapeHtml(x.cve_prod ?? '—')}</strong>
                  ${x.desc_prod ? `<div style="font-size:11px;color:var(--muted);margin-top:2px">${escapeHtml(x.desc_prod)}</div>` : ''}
                </td>
                <td style="text-align:right">${x.det_por_lote}</td>
                <td style="text-align:right">${int(Math.round(Number(x.kg)))}</td>
                <td style="text-align:right">${money(x.carga_abc)}</td>
                <td style="text-align:right">${money(x.consumido)}</td>
                <td style="text-align:right;color:${color};font-weight:800">
                  ${pos ? '+' : '−'} ${money(Math.abs(Number(x.delta)))}
                  ${x.pct_delta != null ? `<div style="font-size:11px;font-weight:600;opacity:.8">${x.pct_delta > 0 ? '+' : ''}${x.pct_delta} %</div>` : ''}
                </td>
                <td>
                  <div style="position:relative;height:20px;background:#f1f5f9;border-radius:6px;min-width:130px">
                    <div style="position:absolute;left:50%;top:-3px;bottom:-3px;width:1px;background:#cbd5e1"></div>
                    ${fill}
                  </div>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;

    // Lo que quedó fuera del comparativo se declara siempre. Un comparativo
    // que cubre el 77 % del costo sin decirlo es peor que no tenerlo.
    const e = r.excluidos || {};
    const partes = [];
    if (e.lotes_no_produccion) partes.push(`${int(e.lotes_no_produccion)} lote(s) de compra (${money(e.costo_no_produccion)}) — materia prima, sin contraparte en el ABC`);
    if (e.lotes_arrastrados)   partes.push(`${int(e.lotes_arrastrados)} lote(s) arrastrado(s) de meses anteriores (${money(e.costo_arrastrado)}) — su costo del mes es parcial`);
    if (e.lotes_sin_kg)        partes.push(`${int(e.lotes_sin_kg)} lote(s) sin kilos utilizables (${money(e.costo_sin_kg)})`);
    if (e.lotes_sin_producto)  partes.push(`${int(e.lotes_sin_producto)} lote(s) sin producto asignado (${money(e.costo_sin_producto)})`);

    $('abcExcluidos').innerHTML = partes.length
      ? nota('info',
          `<strong>El comparativo cubre ${base.cobertura_pct} % del costo del mes.</strong> `
          + `Quedan fuera: ${partes.join('; ')}. Su costo sí está repartido y aparece en las otras pestañas.`)
      : '';
  }

  function card(label, valor, hint) {
    return `<div class="kpi">
      <div class="label">${escapeHtml(label)}</div>
      <div class="value" style="font-size:24px">${escapeHtml(String(valor))}</div>
      <div class="hint">${hint}</div>
    </div>`;
  }

  let paneActivo = 'captura';

  function irA(pane) {
    paneActivo = pane;
    document.querySelectorAll('.tabc').forEach(t => {
      const activo = t.dataset.pane === pane;
      t.style.color = activo ? 'var(--text)' : 'var(--muted)';
      t.style.borderBottom = activo ? '2px solid var(--primary)' : '2px solid transparent';
    });
    $('pane-captura').style.display   = pane === 'captura'   ? '' : 'none';
    $('pane-resultado').style.display = pane === 'resultado' ? '' : 'none';
    $('pane-abc').style.display       = pane === 'abc'       ? '' : 'none';
    // El comparativo se pide solo cuando se abre su pestaña: es una consulta
    // más pesada y no tiene sentido lanzarla en cada repintado de la captura.
    if (pane === 'abc') cargarComparativo();
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

  document.querySelectorAll('.tabc').forEach(t =>
    t.addEventListener('click', () => irA(t.dataset.pane)));
  $('agruparSel').addEventListener('change', cargarResultado);
  irA('captura');

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

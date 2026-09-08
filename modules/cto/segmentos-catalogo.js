// ============================================================
// segmentos-catalogo.js — Costo (cto_): mantenimiento del catálogo de segmentos.
//
// Aquí se decide cómo se clasifica TODA la venta de la compañía. Un patrón mal
// escrito mueve millones de un segmento a otro, así que la pantalla se diseñó
// alrededor de una sola regla: NADA SE GUARDA SIN VER EL IMPACTO.
//
//   1. Se acumulan cambios en una lista (nada toca la base todavía).
//   2. "Ver impacto" los manda al backend, que los aplica en una transacción,
//      mide qué renglones cambian de segmento y REVIERTE.
//   3. Solo entonces se habilita "Guardar", que recorre exactamente el mismo
//      código con commit.
//
// La lista de "sin patrón" es el corazón de la pantalla, no un anexo: es la
// venta que hoy cae al respaldo, ordenada por importe. Ahí se ve que
// WWP0169-2-Q son $10.5 M sin familia, y se asigna de un clic.
//
// Cada pieza del catálogo se muestra CON SU PESO. Sin esas cifras esto sería
// una lista de nombres y nadie sabría cuál importa.
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/cto/segmentos-catalogo.html';
  const PERM = 'screen.cto.segmentos';
  const BASE = '/protected/cto';

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Catálogo de segmentos',
    description: 'Define cómo se clasifica la venta en segmentos de negocio: grupos de cliente, familias de producto y el nombre de cada combinación. Todo cambio se previsualiza antes de guardarse.',
    requiredPermission: PERM,
  });
  if (!b) return;

  const $ = (id) => document.getElementById(id);
  const now = new Date();

  const sg = (v, s) => ((Number(v) || 0) < 0 ? '-' + s : s);
  const mon = (v) => (v == null ? '—' : sg(v, '$' + Math.abs(Number(v) || 0).toLocaleString('es-MX', { maximumFractionDigits: 0 })));
  const mon2 = (v) => (v == null ? '—' : sg(v, '$' + Math.abs(Number(v) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })));
  const pc = (v, d = 1) => (v == null ? '—' : `${(Number(v) * 100).toFixed(d)}%`);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Estado local. CAT es lo que hay en la base; PEND lo que el usuario propuso
  // y todavía no existe en ningún lado.
  let CAT = null;
  let PEND = { patrones_alta: [], patrones_baja: [], segmentos: [], dimensiones: [] };
  let PREVISTO = null;   // el impacto que devolvió la última simulación

  const hayPendientes = () => PEND.patrones_alta.length + PEND.patrones_baja.length
    + PEND.segmentos.length + PEND.dimensiones.length;

  // Cualquier cambio en la lista invalida un impacto ya calculado: si no, se
  // podría guardar un conjunto de cambios distinto del que se previsualizó.
  const marcarSucio = () => { PREVISTO = null; pintarPie(); };

  document.getElementById('pageContent').innerHTML = `
<style>
  .cat-grid { display:grid; grid-template-columns:1fr 1fr; gap:14px; align-items:start; }
  .dimcard { border:1px solid var(--border,#cbd5e1); border-radius:10px; padding:12px 14px; margin-bottom:10px; background:#fff; }
  .dimcard.resto { background:#f8fafc; border-style:dashed; }
  .dimcard .dh { display:flex; justify-content:space-between; align-items:baseline; gap:8px; }
  .dimcard .dn { font-size:14px; font-weight:800; }
  .dimcard .dc { font-size:10.5px; color:#64748b; font-weight:700; letter-spacing:.4px; }
  .dimcard .dv { font-size:13px; font-weight:800; white-space:nowrap; }
  .dimcard .dm { font-size:10.5px; color:#64748b; }
  .pat { display:flex; align-items:center; gap:6px; margin-top:6px; font-size:12px; }
  .pat code { background:#f1f5f9; border-radius:4px; padding:1px 6px; font-size:11.5px; }
  .pat .campo { font-size:10px; color:#64748b; text-transform:uppercase; letter-spacing:.4px; }
  .pat.nuevo code { background:#dcfce7; }
  .pat.baja code { background:#fee2e2; text-decoration:line-through; }
  .xbtn { border:0; background:transparent; color:#94a3b8; cursor:pointer; font-size:14px; line-height:1; padding:0 3px; }
  .xbtn:hover { color:#dc2626; }
  table.mx { width:100%; border-collapse:collapse; font-size:11.5px; }
  table.mx th, table.mx td { border:1px solid #e2e8f0; padding:5px 7px; vertical-align:top; }
  table.mx th { background:#0e7490; color:#fff; font-size:10.5px; text-align:left; }
  table.mx th.rot { text-align:center; }
  table.mx td .sn { font-weight:700; }
  table.mx td .sv { font-size:10px; color:#64748b; }
  table.mx td.vacio { background:#fafafa; color:#94a3b8; }
  table.sp { width:100%; border-collapse:collapse; font-size:12px; }
  table.sp th { background:#f1f5f9; color:#334155; padding:5px 8px; text-align:right; font-size:10.5px; }
  table.sp th:first-child, table.sp th:nth-child(2) { text-align:left; }
  table.sp td { padding:4px 8px; text-align:right; border-bottom:1px solid #eef2f6; white-space:nowrap; }
  table.sp td:first-child, table.sp td:nth-child(2) { text-align:left; white-space:normal; }
  table.sp select { font-size:11px; padding:2px 4px; }
  .pie { position:sticky; bottom:0; background:#0f172a; color:#fff; padding:10px 14px; border-radius:10px;
         display:flex; justify-content:space-between; align-items:center; gap:12px; margin-top:14px; }
  .pie .txt { font-size:12.5px; }
  .pie .txt b { color:#5eead4; }
  .imp { border:1px solid #cbd5e1; border-radius:10px; padding:12px 14px; margin-top:12px; background:#fff; }
  .imp h4 { margin:0 0 8px; font-size:12px; text-transform:uppercase; letter-spacing:.5px; }
  .imp .cifra { font-size:20px; font-weight:800; }
  .neg { color:#dc2626; } .pos { color:#059669; font-weight:700; }
  .aviso { border-left:4px solid #d97706; background:#fffbeb; color:#78350f; padding:9px 12px;
           border-radius:0 6px 6px 0; font-size:12px; margin:10px 0; }
  .aviso.info { border-left-color:#0e7490; background:#ecfeff; color:#155e75; }
</style>

<div class="card">
  <div class="row">
    <div><div class="eyebrow">Costo · Configuración</div><h2>Catálogo de segmentos</h2></div>
    <div style="display:flex;gap:8px;align-items:flex-end">
      <div><label class="muted" style="font-size:12px">Ejercicio a medir</label>
        <input type="number" id="anio" class="input" style="width:110px" value="${now.getFullYear()}"/></div>
      <button class="btn primary" id="cargarBtn">Cargar</button>
    </div>
  </div>
  <div class="aviso info" style="margin-bottom:0">
    Un segmento es <b>grupo de cliente × familia de producto</b>. Los cambios que hagas aquí
    reclasifican <b>toda la venta del ejercicio</b>, también la de los meses ya informados.
    Por eso nada se guarda sin que veas antes cuánta venta se mueve.
  </div>
  <div id="msg" class="muted" style="margin-top:10px;font-size:13px">Elige el ejercicio y pulsa <b>Cargar</b>.</div>
</div>

<div id="cuerpo"></div>`;

  // ─── render ───

  function pintarDim(d) {
    const pendAlta = PEND.patrones_alta.filter((p) => p.dimension === d.dimension && p.dim_clave === d.clave);
    const pats = (d.patrones || []).map((p) => {
      const baja = PEND.patrones_baja.includes(p.patron_id);
      return `<div class="pat${baja ? ' baja' : ''}">
        <span class="campo">${esc(p.campo)}</span><code>${esc(p.patron)}</code>
        ${baja
          ? `<button class="xbtn" data-deshacer-baja="${esc(p.patron_id)}" title="Conservar">↩</button>`
          : `<button class="xbtn" data-baja="${esc(p.patron_id)}" title="Quitar patrón">✕</button>`}
      </div>`;
    }).join('');
    const nuevos = pendAlta.map((p, i) => `<div class="pat nuevo">
        <span class="campo">${esc(p.campo)}</span><code>${esc(p.patron)}</code>
        <span style="font-size:10px;color:#059669;font-weight:700">NUEVO</span>
        <button class="xbtn" data-quitar-alta="${esc(p.__id)}" title="Descartar">✕</button>
      </div>`).join('');

    return `<div class="dimcard${d.es_resto ? ' resto' : ''}">
      <div class="dh">
        <div><div class="dn">${esc(d.nombre)}</div><div class="dc">${esc(d.clave)}${d.es_resto ? ' · respaldo' : ''}</div></div>
        <div style="text-align:right"><div class="dv">${mon(d.peso.ventas)}</div>
          <div class="dm">${d.peso.renglones} renglones · margen ${pc(d.peso.margen)}</div></div>
      </div>
      ${d.es_resto
        ? `<div class="dm" style="margin-top:6px">Sin patrones: recoge todo lo que no empata con ningún otro. No se puede quitar.</div>`
        : (pats + nuevos || '<div class="dm" style="margin-top:6px">Sin patrones.</div>')}
    </div>`;
  }

  function pintarMatriz() {
    const gs = CAT.grupos, fs = CAT.familias;
    const celda = (g, f) => {
      const m = CAT.matriz.find((x) => x.grupo_clave === g.clave && x.familia_clave === f.clave);
      if (!m) return '<td class="vacio">—</td>';
      const pend = PEND.segmentos.find((s) => s.segmento_id === m.segmento_id);
      const nom = pend && pend.nombre != null ? pend.nombre : m.nombre;
      const cambiado = pend && pend.nombre != null && pend.nombre !== m.nombre;
      return `<td>
        <div class="sn"><input class="input" style="width:100%;font-size:11.5px;padding:2px 5px;${cambiado ? 'background:#dcfce7' : ''}"
             data-seg="${esc(m.segmento_id)}" data-orig="${esc(m.nombre)}" value="${esc(nom)}"/></div>
        <div class="sv">${m.peso.renglones ? `${mon(m.peso.ventas)} · ${pc(m.peso.margen)}` : 'sin venta'}</div>
      </td>`;
    };
    return `<div class="card"><h3 style="margin-top:0">La matriz</h3>
      <p class="muted" style="font-size:12.5px;margin-top:0">
        Cada celda es el nombre con el que se publica esa combinación. Varias celdas pueden compartir
        nombre — así es como todo lo que no tiene segmento propio termina en «Otro».
        Las combinaciones sin venta se muestran igual: existen para que ningún renglón futuro quede fuera.</p>
      <div style="overflow-x:auto"><table class="mx">
      <thead><tr><th>Grupo \\ Familia</th>${fs.map((f) => `<th class="rot">${esc(f.nombre)}</th>`).join('')}</tr></thead>
      <tbody>${gs.map((g) => `<tr><th>${esc(g.nombre)}</th>${fs.map((f) => celda(g, f)).join('')}</tr>`).join('')}</tbody>
      </table></div></div>`;
  }

  function pintarSinPatron() {
    const gs = CAT.grupos.filter((g) => !g.es_resto);
    const fs = CAT.familias.filter((f) => !f.es_resto);
    const fila = (x, tipo) => {
      const opts = (tipo === 'cliente' ? gs : fs)
        .map((d) => `<option value="${esc(d.clave)}">${esc(d.nombre)}</option>`).join('');
      return `<tr><td><code style="font-size:11px">${esc(x.clave)}</code></td><td>${esc(x.nombre || '')}</td>
        <td>${mon(x.ventas)}</td><td>${pc(x.margen)}</td>
        <td><select data-asignar="${tipo}" data-clave="${esc(x.clave)}">
          <option value="">— sin asignar —</option>${opts}</select></td></tr>`;
    };
    return `<div class="card"><h3 style="margin-top:0">Lo que hoy cae al respaldo</h3>
      <p class="muted" style="font-size:12.5px;margin-top:0">
        Esta venta no empata con ningún patrón, así que se informa dentro del segmento residual.
        No es un error —el mercado abierto vive aquí— pero un cliente o una familia grande en esta
        lista es venta que Dirección lee como «Otro». Asignarla es el trabajo de esta pantalla.</p>
      <div class="cat-grid">
        <div><div class="eyebrow" style="margin-bottom:6px">Clientes sin grupo</div>
          <table class="sp"><thead><tr><th>Clave</th><th>Cliente</th><th>Ventas</th><th>Margen</th><th>Asignar a</th></tr></thead>
          <tbody>${CAT.sin_patron.clientes.map((x) => fila(x, 'cliente')).join('') || '<tr><td colspan="5">Ninguno.</td></tr>'}</tbody></table></div>
        <div><div class="eyebrow" style="margin-bottom:6px">Productos sin familia</div>
          <table class="sp"><thead><tr><th>Clave</th><th>Producto</th><th>Ventas</th><th>Margen</th><th>Asignar a</th></tr></thead>
          <tbody>${CAT.sin_patron.productos.map((x) => fila(x, 'producto')).join('') || '<tr><td colspan="5">Ninguno.</td></tr>'}</tbody></table></div>
      </div></div>`;
  }

  function pintarImpacto() {
    if (!PREVISTO) return '';
    const i = PREVISTO.impacto;
    if (!i.renglones_movidos) {
      return `<div class="imp"><h4>Impacto</h4>
        <div class="aviso">Los cambios propuestos <b>no mueven ningún renglón</b> de segmento en ${CAT.anio}.
        Puede ser correcto —un patrón para venta que todavía no ocurre— pero verifica que escribiste lo que querías.</div></div>`;
    }
    return `<div class="imp"><h4>Impacto en ${CAT.anio}</h4>
      <div style="display:flex;gap:26px;align-items:baseline;flex-wrap:wrap">
        <div><div class="cifra">${mon2(i.venta_movida)}</div>
          <div class="muted" style="font-size:11.5px">de venta cambia de segmento — ${pc(i.pct_venta_movida, 2)} del ejercicio</div></div>
        <div><div class="cifra">${i.renglones_movidos.toLocaleString('es-MX')}</div>
          <div class="muted" style="font-size:11.5px">renglones de ${i.renglones_totales.toLocaleString('es-MX')}</div></div>
      </div>
      <table class="sp" style="margin-top:10px"><thead><tr>
        <th>Sale de</th><th>Entra a</th><th>Renglones</th><th>Ventas</th><th>Utilidad</th></tr></thead><tbody>
        ${PREVISTO.movimientos.map((m) => `<tr><td>${esc(m.antes)}</td><td><b>${esc(m.despues)}</b></td>
          <td>${m.renglones}</td><td>${mon(m.ventas)}</td><td>${mon(m.utilidad)}</td></tr>
          <tr><td colspan="5" style="font-size:10.5px;color:#64748b;padding-top:0">
            ${esc([...(m.clientes || []), ...(m.productos || [])].slice(0, 5).join(' · '))}</td></tr>`).join('')}
      </tbody></table></div>`;
  }

  function pintarPie() {
    const n = hayPendientes();
    const pie = $('pie');
    if (!pie) return;
    pie.innerHTML = `<div class="txt">${n
      ? `<b>${n}</b> cambio(s) sin guardar. ${PREVISTO ? 'Impacto calculado.' : 'Falta calcular el impacto.'}`
      : 'Sin cambios pendientes.'}</div>
      <div style="display:flex;gap:8px">
        <button class="btn ghost" id="descartarBtn" ${n ? '' : 'disabled'}>Descartar</button>
        <button class="btn" id="simularBtn" ${n ? '' : 'disabled'}>Ver impacto</button>
        <button class="btn primary" id="guardarBtn" ${n && PREVISTO ? '' : 'disabled'}>Guardar</button>
      </div>`;
    $('impacto').innerHTML = pintarImpacto();
    $('descartarBtn').onclick = () => {
      PEND = { patrones_alta: [], patrones_baja: [], segmentos: [], dimensiones: [] };
      PREVISTO = null; pintar();
    };
    $('simularBtn').onclick = () => enviar(false);
    $('guardarBtn').onclick = () => enviar(true);
  }

  function pintar() {
    $('cuerpo').innerHTML = `
      <div class="card"><div class="cat-grid">
        <div><h3 style="margin-top:0">Grupos de cliente</h3>${CAT.grupos.map(pintarDim).join('')}</div>
        <div><h3 style="margin-top:0">Familias de producto</h3>${CAT.familias.map(pintarDim).join('')}</div>
      </div></div>
      ${pintarMatriz()}
      ${pintarSinPatron()}
      <div id="impacto"></div>
      <div class="pie" id="pie"></div>`;
    pintarPie();
    conectar();
  }

  // ─── interacción ───
  function conectar() {
    $('cuerpo').querySelectorAll('[data-baja]').forEach((el) => {
      el.onclick = () => { PEND.patrones_baja.push(el.dataset.baja); PREVISTO = null; pintar(); };
    });
    $('cuerpo').querySelectorAll('[data-deshacer-baja]').forEach((el) => {
      el.onclick = () => {
        PEND.patrones_baja = PEND.patrones_baja.filter((x) => x !== el.dataset.deshacerBaja);
        PREVISTO = null; pintar();
      };
    });
    $('cuerpo').querySelectorAll('[data-quitar-alta]').forEach((el) => {
      el.onclick = () => {
        PEND.patrones_alta = PEND.patrones_alta.filter((x) => x.__id !== el.dataset.quitarAlta);
        PREVISTO = null; pintar();
      };
    });

    // Asignar desde la lista de respaldo: la clave EXACTA, sin comodines. Es lo
    // que hace previsible el resultado — un '%' de más se lleva media cartera.
    $('cuerpo').querySelectorAll('[data-asignar]').forEach((sel) => {
      sel.onchange = () => {
        if (!sel.value) return;
        const tipo = sel.dataset.asignar;
        PEND.patrones_alta.push({
          __id: `n${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
          dimension: tipo === 'cliente' ? 'grupo' : 'familia',
          dim_clave: sel.value,
          campo: tipo === 'cliente' ? 'cve_cte' : 'cve_prod',
          patron: sel.dataset.clave,
          prioridad: 5,
          nota: 'Asignado desde la pantalla de catálogo.',
        });
        PREVISTO = null; pintar();
      };
    });

    $('cuerpo').querySelectorAll('[data-seg]').forEach((inp) => {
      inp.onchange = () => {
        const id = inp.dataset.seg; const orig = inp.dataset.orig;
        PEND.segmentos = PEND.segmentos.filter((s) => s.segmento_id !== id);
        if (inp.value.trim() && inp.value.trim() !== orig) {
          PEND.segmentos.push({ segmento_id: id, nombre: inp.value.trim() });
        }
        marcarSucio();
        inp.style.background = inp.value.trim() !== orig ? '#dcfce7' : '';
      };
    });
  }

  // ─── backend ───
  async function cargar() {
    const anio = $('anio').value;
    if (!anio) return KoguApi.toast('Indica el ejercicio.', 'error');
    $('msg').innerHTML = 'Cargando catálogo…';
    try {
      CAT = KoguApi.unwrapData(await KoguApi.apiFetch(`${BASE}/segmentos/catalogo/${anio}`));
      PEND = { patrones_alta: [], patrones_baja: [], segmentos: [], dimensiones: [] };
      PREVISTO = null;
      pintar();
      $('msg').innerHTML = `Catálogo de ${CAT.anio}: ${CAT.grupos.length} grupos, ${CAT.familias.length} familias, ${CAT.matriz.length} combinaciones.`;
    } catch (e) {
      $('cuerpo').innerHTML = '';
      const msg = /catálogo|catalogo/i.test(e.message || '')
        ? 'Esta empresa todavía no tiene catálogo de segmentos.'
        : (e.message || 'Error cargando el catálogo');
      KoguApi.toast(msg, 'error');
      $('msg').innerHTML = `<span style="color:#b45309">${esc(msg)}</span>`;
    }
  }

  async function enviar(confirmar) {
    const cambios = {
      patrones_alta: PEND.patrones_alta.map(({ __id, ...p }) => p),
      patrones_baja: PEND.patrones_baja,
      segmentos: PEND.segmentos,
      dimensiones: PEND.dimensiones,
    };
    $('msg').innerHTML = confirmar ? 'Guardando…' : 'Calculando impacto…';
    try {
      const r = KoguApi.unwrapData(await KoguApi.apiFetch(
        `${BASE}/segmentos/catalogo/${CAT.anio}${confirmar ? '?confirmar=1' : ''}`,
        { method: 'POST', body: JSON.stringify(cambios) }
      ));
      if (confirmar) {
        KoguApi.toast(`Guardado. ${r.impacto.renglones_movidos} renglones cambiaron de segmento.`, 'success');
        await cargar();
        $('msg').innerHTML = `Catálogo actualizado: ${mon2(r.impacto.venta_movida)} de venta cambió de segmento.`;
      } else {
        PREVISTO = r;
        pintarPie();
        $('msg').innerHTML = 'Impacto calculado. Revísalo abajo antes de guardar.';
        // Fuera del try: es cosmético y no existe en todos los entornos. Dentro,
        // un fallo suyo convertía una simulación correcta en un toast de error.
        try { $('impacto').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch { /* da igual */ }
      }
    } catch (e) {
      KoguApi.toast(e.message || 'Error aplicando los cambios', 'error');
      $('msg').innerHTML = `<span style="color:#b45309">${esc(e.message || 'Error')}</span>`;
    }
  }

  $('cargarBtn').onclick = cargar;
  cargar();
});

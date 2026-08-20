// ============================================================
// dashboard.js
// Pantalla: Tablero de Control Documental.
// Endpoint: GET /protected/doc/dashboard  (los 4 bloques en una llamada)
//
// ── Decisiones de visualización ─────────────────────────────
// Se eligió la FORMA antes que el color, y el color por el trabajo
// que hace cada dato:
//
//   · KPIs → tarjetas de dato (.kpi de KOGU), no una gráfica de barras.
//     Son números sueltos de cabecera; graficarlos no agrega nada.
//
//   · Matriz tipo × subtipo → TABLA. Hay hasta 96 combinaciones y todas
//     cargan significado; más colores no las volverían legibles. Cada
//     fila lleva un medidor de ocupación (ratio contra un límite), que
//     es la forma correcta para "cuánto de esto está fuera del archivo".
//
//   · Antigüedad de resguardo → barra apilada ORDINAL. Las cubetas son
//     bandas de edad: si se reordenan cambia el significado, así que no
//     son categorías sino una escala. Por eso van en UN SOLO tono con
//     pasos de luminosidad crecientes, no en cuatro colores distintos.
//
//   · Top custodios → barras de un solo tono. Son nombres (identidad
//     nominal); colorearlos por su valor gastaría el canal de color en
//     repetir lo que ya dice el largo de la barra.
//
// La rampa se validó con el verificador de la guía de visualización
// (monotonía de luminosidad, separación entre pasos, contraste del
// extremo claro) y arranca en el --primary de KOGU, así que no
// introduce una paleta nueva.
//
// Módulo: Control Documental (doc_) — v1.
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const b = await KoguShell.initShell({
    currentPage:        '/modules/doc/dashboard.html',
    title:              'Tablero documental',
    description:        'Qué documentos hay, cuántas copias y quién las tiene.',
    requiredPermission: 'doc.dashboard.read',
  });
  if (!b) return;

  const D = window.KoguDoc;
  const esc = D.esc;

  // Rampa ordinal de 4 pasos, un solo tono (cian de KOGU), light→dark.
  // Verificada: luminosidad monótona, ΔL ≥ 0.06 entre pasos,
  // extremo claro 3.68:1 sobre blanco, dispersión de tono 8°.
  const RAMPA = ['#0891b2', '#0e7490', '#155e75', '#083344'];
  const PISTA = '#cffafe';   // paso claro del mismo tono, para el fondo del medidor

  // Tinta de la etiqueta DENTRO de cada segmento, elegida por la
  // luminancia del relleno para que siempre pase 4.5:1. En el paso más
  // claro el blanco solo da 3.68:1 (insuficiente para 11.5px), así que
  // ahí la etiqueta va en oscuro: 4.85:1.
  const TINTA = ['#0f172a', '#ffffff', '#ffffff', '#ffffff'];

  const CUBETAS = [
    { k: 'd_0_30',    label: '0 a 30 días',    corto: '0-30' },
    { k: 'd_31_90',   label: '31 a 90 días',   corto: '31-90' },
    { k: 'd_91_180',  label: '91 a 180 días',  corto: '91-180' },
    { k: 'd_181_mas', label: 'más de 180 días', corto: '+180' },
  ];

  // Estilos propios del tablero. Van aquí y no en styles.css para no
  // tocar la hoja compartida por todos los módulos.
  const style = document.createElement('style');
  style.textContent = `
    .doc-apilada{display:flex;width:100%;height:22px;border-radius:6px;overflow:hidden;background:var(--panel)}
    /* La separación entre segmentos la hace el color de la superficie,
       no un borde: un trazo agregaría tinta que no es dato. */
    .doc-apilada > span{position:relative;box-shadow:2px 0 0 0 var(--panel);transition:filter .12s}
    .doc-apilada > span:last-child{box-shadow:none}
    .doc-apilada > span:hover{filter:brightness(1.15)}
    .doc-apilada > span:first-child{border-radius:6px 0 0 6px}
    .doc-apilada > span:last-child{border-radius:0 6px 6px 0}
    .doc-leyenda{display:flex;flex-wrap:wrap;gap:14px;margin-top:12px}
    .doc-leyenda .it{display:flex;align-items:center;gap:7px;font-size:12.5px;color:var(--muted)}
    .doc-leyenda .sw{width:11px;height:11px;border-radius:3px;flex:none}
    .doc-leyenda .n{font-weight:700;color:var(--text)}
    .doc-medidor{display:flex;align-items:center;gap:8px;min-width:120px}
    .doc-medidor .pista{flex:1;height:7px;border-radius:999px;background:${PISTA};overflow:hidden}
    .doc-medidor .relleno{height:100%;border-radius:999px;background:${RAMPA[0]}}
    .doc-medidor .pct{font-size:11.5px;color:var(--muted);min-width:34px;text-align:right;font-variant-numeric:tabular-nums}
    .doc-tipo-cab td{background:var(--panel2);font-weight:800;font-size:12.5px;letter-spacing:.02em}
    .doc-barra-mini{height:7px;border-radius:999px;background:${RAMPA[0]};min-width:2px}
    tr.doc-fila{cursor:pointer}
    tr.doc-fila:hover td{background:var(--panel2)}
  `;
  document.head.appendChild(style);

  const $ = (id) => document.getElementById(id);
  const n = (v) => Number(v ?? 0);
  const fmt = (v) => n(v).toLocaleString('es-MX');

  document.getElementById('pageContent').innerHTML = `
<div class="card">
  <div class="row">
    <div><div class="eyebrow">Control documental</div><h2>Tablero</h2></div>
    <div style="display:flex;gap:8px">
      <a class="btn ghost" href="/modules/doc/documentos.html">Ver documentos</a>
      <button class="btn" id="refreshBtn">Actualizar</button>
    </div>
  </div>
  <div id="avisoRestringidos" style="display:none;margin-top:12px" class="muted"></div>
  <div class="grid-4" id="kpis" style="margin-top:16px"></div>
</div>

<div class="card" style="margin-top:16px">
  <div class="eyebrow">Antigüedad del resguardo</div>
  <h3 style="margin:2px 0 4px">Cuánto llevan fuera del archivo</h3>
  <div class="muted" style="font-size:12.5px;margin-bottom:14px">
    Las copias prestadas y olvidadas no aparecen como problema en ningún otro lado
    cuando nadie capturó su fecha de devolución.</div>
  <div id="aging"></div>
</div>

<div class="card" style="margin-top:16px">
  <div class="eyebrow">Clasificación</div>
  <h3 style="margin:2px 0 4px">Copias por tipo y subtipo</h3>
  <div class="muted" style="font-size:12.5px;margin-bottom:14px">
    Haz clic en cualquier fila para abrir la bandeja ya filtrada.</div>
  <div class="table-wrap">
    <table>
      <thead><tr>
        <th style="min-width:230px">Tipo / subtipo</th>
        <th style="text-align:right">Documentos</th>
        <th style="text-align:right">Copias</th>
        <th style="text-align:right">En archivo</th>
        <th style="text-align:right">Asignadas</th>
        <th style="text-align:right">Vencidas</th>
        <th style="min-width:150px">Fuera del archivo</th>
      </tr></thead>
      <tbody id="matriz"></tbody>
    </table>
  </div>
</div>

<div class="grid-2" style="margin-top:16px">
  <div class="card">
    <div class="eyebrow">Resguardo</div>
    <h3 style="margin:2px 0 12px">Quién tiene copias</h3>
    <div id="custodios"></div>
  </div>
  <div class="card">
    <div class="eyebrow">Requieren atención</div>
    <h3 style="margin:2px 0 12px">Alertas</h3>
    <div id="alertas"></div>
  </div>
</div>`;

  // ── KPIs ──────────────────────────────────────────────────
  function renderKpis(k) {
    // Cuatro números de cabecera. El rojo solo en las vencidas, y solo
    // cuando hay: --danger da 4.83:1 sobre blanco, así que es legible
    // como texto (--warn y --success no lo son, por eso no se usan aquí).
    $('kpis').innerHTML = [
      D.kpi('Documentos', fmt(k.documentos), 'registrados en la empresa'),
      D.kpi('Copias', fmt(k.copias), `${k.pct_digitalizado}% con escaneo`),
      D.kpi('Fuera del archivo', fmt(k.copias_asignadas), `${k.pct_asignadas}% del total en resguardo`),
      D.kpi('Devoluciones vencidas', fmt(k.devoluciones_vencidas),
            k.devoluciones_vencidas ? 'pasaron su fecha de devolución' : 'todo al corriente',
            k.devoluciones_vencidas > 0),
    ].join('');
  }

  // ── Antigüedad: barra apilada ordinal ─────────────────────
  function renderAging(a) {
    const total = n(a.total);
    if (!total) {
      $('aging').innerHTML = `<div class="empty">No hay copias fuera del archivo ahora mismo.</div>`;
      return;
    }

    const datos = CUBETAS.map((c, i) => ({ ...c, valor: n(a[c.k]), color: RAMPA[i], tinta: TINTA[i] }));

    // Etiqueta dentro del segmento SOLO si cabe: un texto recortado es
    // peor que ningún texto. El valor nunca se pierde — la leyenda de
    // abajo lleva los cuatro conteos.
    const segmentos = datos.filter((d) => d.valor > 0).map((d) => {
      const pct = (d.valor / total) * 100;
      const cabe = pct >= 12;
      return `<span style="width:${pct}%;background:${d.color}"
                    title="${esc(d.label)}: ${fmt(d.valor)} copia(s)">
        ${cabe ? `<span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
                    font-size:11.5px;font-weight:700;color:${d.tinta}">${fmt(d.valor)}</span>` : ''}
      </span>`;
    }).join('');

    // La leyenda siempre está: con cuatro tramos la identidad no puede
    // depender solo del color.
    const leyenda = datos.map((d) => `
      <div class="it"><span class="sw" style="background:${d.color}"></span>
        ${esc(d.label)} <span class="n">${fmt(d.valor)}</span></div>`).join('');

    $('aging').innerHTML = `
      <div class="doc-apilada">${segmentos}</div>
      <div class="doc-leyenda">${leyenda}</div>
      <div class="muted" style="font-size:12.5px;margin-top:12px">
        ${fmt(total)} copia(s) en resguardo · la más antigua lleva
        <strong style="color:${a.max_dias > 180 ? 'var(--danger)' : 'var(--text)'}">${fmt(a.max_dias)} días</strong> fuera.
      </div>`;
  }

  // ── Matriz tipo × subtipo ─────────────────────────────────
  function medidor(pct) {
    return `<div class="doc-medidor">
      <div class="pista"><div class="relleno" style="width:${Math.min(n(pct), 100)}%"></div></div>
      <span class="pct">${n(pct)}%</span>
    </div>`;
  }

  function renderMatriz(matriz) {
    const conDatos = matriz.filter((t) => n(t.documentos) > 0);
    if (!conDatos.length) {
      $('matriz').innerHTML = `<tr><td colspan="7" class="empty">
        Todavía no hay documentos registrados. En cuanto captures el primero, aquí verás el desglose.</td></tr>`;
      return;
    }

    $('matriz').innerHTML = conDatos.map((t) => {
      const cab = `<tr class="doc-tipo-cab">
        <td>${esc(t.nombre)}</td>
        <td style="text-align:right">${fmt(t.documentos)}</td>
        <td style="text-align:right">${fmt(t.copias)}</td>
        <td style="text-align:right">${fmt(t.en_archivo)}</td>
        <td style="text-align:right">${fmt(t.asignadas)}</td>
        <td style="text-align:right">${n(t.vencidas) ? `<span class="badge danger">${fmt(t.vencidas)}</span>` : '0'}</td>
        <td>${medidor(t.pct_asignadas)}</td>
      </tr>`;

      const hijos = t.subtipos.filter((s) => n(s.documentos) > 0).map((s) => `
        <tr class="doc-fila" data-tipo="${t.tipo_id}" data-subtipo="${s.subtipo_id}">
          <td style="padding-left:26px">${esc(s.nombre)}
            <div class="muted" style="font-size:11.5px">${esc(s.clave)}</div></td>
          <td style="text-align:right">${fmt(s.documentos)}</td>
          <td style="text-align:right">${fmt(s.copias)}</td>
          <td style="text-align:right">${fmt(s.en_archivo)}</td>
          <td style="text-align:right">${fmt(s.asignadas)}</td>
          <td style="text-align:right">${n(s.vencidas) ? `<span class="badge danger">${fmt(s.vencidas)}</span>` : '0'}</td>
          <td>${medidor(s.pct_asignadas)}</td>
        </tr>`).join('');

      return cab + hijos;
    }).join('');

    $('matriz').querySelectorAll('.doc-fila').forEach((tr) => {
      tr.onclick = () => {
        const qs = KoguUi.queryParams({ tipo_id: tr.dataset.tipo, subtipo_id: tr.dataset.subtipo });
        window.location.href = '/modules/doc/documentos.html?' + qs;
      };
    });
  }

  // ── Top custodios ─────────────────────────────────────────
  function renderCustodios(lista) {
    if (!lista.length) {
      $('custodios').innerHTML = `<div class="empty">Nadie tiene copias en resguardo.</div>`;
      return;
    }
    const max = Math.max(...lista.map((c) => n(c.copias)), 1);

    // Un solo tono: son nombres, no categorías con significado propio.
    // Colorear cada barra distinto gastaría el color en repetir lo que
    // el largo ya dice.
    // Cada custodio lleva a la bandeja de copias ya filtrada: la
    // pregunta que sigue a "quién tiene copias" es siempre "cuáles".
    $('custodios').innerHTML = lista.map((c) => `
      <div data-cust="${c.user_id}" style="display:flex;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid var(--line);cursor:pointer">
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
            ${esc(c.user_nombre || 'Sin nombre')}</div>
          <div class="doc-barra-mini" style="width:${(n(c.copias) / max) * 100}%;margin-top:5px"></div>
        </div>
        <div style="text-align:right;flex:none">
          <div style="font-size:14px;font-weight:700;font-variant-numeric:tabular-nums">${fmt(c.copias)}</div>
          ${n(c.vencidas)
            ? `<div style="font-size:11px;color:var(--danger);font-weight:700">${fmt(c.vencidas)} vencida(s)</div>`
            : `<div class="muted" style="font-size:11px">${fmt(c.max_dias_fuera)} d máx.</div>`}
        </div>
      </div>`).join('');

    $('custodios').querySelectorAll('[data-cust]').forEach((el) => {
      el.onclick = () => {
        window.location.href = '/modules/doc/copias.html?'
          + KoguUi.queryParams({ custodio_user_id: el.dataset.cust, estado: 'asignada' });
      };
    });
  }

  // ── Alertas ───────────────────────────────────────────────
  function renderAlertas(al) {
    const bloques = [];

    if (al.devoluciones_vencidas?.length) {
      bloques.push(`
        <div style="margin-bottom:16px">
          <div style="font-size:12.5px;font-weight:700;color:var(--danger);margin-bottom:6px">
            Devoluciones vencidas (${al.devoluciones_vencidas.length})
            <a href="/modules/doc/asignaciones.html?solo_vencidas=true"
               style="float:right;font-weight:600">ver todas</a></div>
          ${al.devoluciones_vencidas.slice(0, 6).map((r) => `
            <div style="display:flex;justify-content:space-between;gap:12px;padding:6px 0;font-size:12.5px">
              <span><span class="mono">${esc(r.etiqueta)}</span> · ${esc(r.custodio_nombre || 'sin custodio')}</span>
              <span style="color:var(--danger);font-weight:700;flex:none">${fmt(r.dias_retraso)} d</span>
            </div>`).join('')}
        </div>`);
    }

    if (al.documentos_por_vencer?.length) {
      bloques.push(`
        <div style="margin-bottom:16px">
          <div style="font-size:12.5px;font-weight:700;margin-bottom:6px">
            Vigencia por vencer (${al.documentos_por_vencer.length})</div>
          ${al.documentos_por_vencer.slice(0, 6).map((r) => `
            <div style="display:flex;justify-content:space-between;gap:12px;padding:6px 0;font-size:12.5px;cursor:pointer"
                 data-doc="${r.documento_id}">
              <span><span class="mono">${esc(r.folio)}</span> · ${esc(r.nombre)}</span>
              <span class="muted" style="flex:none">${fmt(r.dias_restantes)} d</span>
            </div>`).join('')}
        </div>`);
    }

    if (al.sin_digitalizar?.length) {
      bloques.push(`
        <div>
          <div style="font-size:12.5px;font-weight:700;margin-bottom:6px">
            Sin ninguna copia digitalizada (${al.sin_digitalizar.length})</div>
          ${al.sin_digitalizar.slice(0, 6).map((r) => `
            <div style="padding:6px 0;font-size:12.5px;cursor:pointer" data-doc="${r.documento_id}">
              <span class="mono">${esc(r.folio)}</span> · ${esc(r.nombre)}
            </div>`).join('')}
        </div>`);
    }

    $('alertas').innerHTML = bloques.length
      ? bloques.join('')
      : `<div class="empty">Sin alertas: nada vencido, nada por vencer y todo digitalizado.</div>`;

    $('alertas').querySelectorAll('[data-doc]').forEach((el) => {
      el.onclick = () => {
        window.location.href = '/modules/doc/documento-detalle.html?id=' + encodeURIComponent(el.dataset.doc);
      };
    });
  }

  // ── Ciclo ─────────────────────────────────────────────────
  async function load(showToast) {
    try {
      const res = await KoguApi.apiFetch('/protected/doc/dashboard');
      const d = KoguApi.unwrapData(res);

      renderKpis(d.kpis || {});
      renderAging(d.aging || {});
      renderMatriz(d.matriz || []);
      renderCustodios(d.top_custodios || []);
      renderAlertas(d.alertas || {});

      // Si hay confidenciales fuera del alcance, se dice: unos KPIs que
      // no cuadran con la realidad y no lo explican son peores que unos
      // KPIs incompletos y honestos.
      const aviso = $('avisoRestringidos');
      if (d.restringidos) {
        aviso.style.display = '';
        aviso.style.cssText += 'font-size:12.5px;border:1px solid var(--line);border-radius:12px;padding:10px 12px';
        aviso.textContent = d.restringidos_nota;
      } else {
        aviso.style.display = 'none';
      }

      if (showToast) KoguApi.toast('Tablero actualizado por cambio de empresa', 'success');
    } catch (e) {
      D.errorToast(e, 'No fue posible cargar el tablero.');
    }
  }

  $('refreshBtn').onclick = () => load();
  window.addEventListener('kogu:empresa-activa-cambiada', () => load(true));

  await load();
});

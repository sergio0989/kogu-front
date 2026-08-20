// ============================================================
// mis-documentos.js
// Pantalla: lo que YO tengo en resguardo ahora mismo.
//
// El backend ignora cualquier user_id que venga por query y usa siempre
// el de la sesión, así que esta pantalla no puede mostrar el resguardo
// de otra persona aunque se manipule la URL.
//
// Es la pantalla barata que sostiene la adopción del módulo: si para
// saber qué documentos tienes prestados hubiera que entrar a la bandeja
// general y filtrar, nadie lo haría.
// Módulo: Control Documental (doc_) — v1.
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const b = await KoguShell.initShell({
    currentPage:        '/modules/doc/mis-documentos.html',
    title:              'Mis documentos',
    description:        'Copias que tienes en resguardo y su fecha de devolución.',
    requiredPermission: 'doc.asignaciones.read',
  });
  if (!b) return;

  const D = window.KoguDoc;
  const esc = D.esc;

  document.getElementById('pageContent').innerHTML = `
<div class="card">
  <div class="row">
    <div><div class="eyebrow">Resguardo</div><h2>Mis documentos</h2></div>
    <button class="btn" id="refreshBtn">Actualizar</button>
  </div>
  <div id="resumen" style="margin-top:14px"></div>
  <div class="table-wrap" style="margin-top:16px">
    <table>
      <thead><tr>
        <th style="min-width:150px">Copia</th>
        <th style="min-width:220px">Documento</th>
        <th>Uso</th>
        <th>Desde</th>
        <th>Devolver antes de</th>
        <th style="text-align:right">Días fuera</th>
      </tr></thead>
      <tbody id="rows"></tbody>
    </table>
  </div>
</div>`;

  const $ = (id) => document.getElementById(id);

  function render(data) {
    const rows = data.rows || [];
    const vencidas = data.vencidas || 0;

    $('resumen').innerHTML = !rows.length
      ? ''
      : `<div class="grid-2">
          ${D.kpi('Copias en tu resguardo', rows.length, 'a tu nombre')}
          ${D.kpi('Con devolución vencida', vencidas,
                  vencidas ? 'devuélvelas cuanto antes' : 'al corriente', vencidas > 0)}
        </div>`;

    const tb = $('rows');
    if (!rows.length) {
      tb.innerHTML = `<tr><td colspan="6" class="empty">
        No tienes copias en resguardo.</td></tr>`;
      return;
    }

    tb.innerHTML = rows.map((r) => {
      const retraso = r.dias_retraso;
      return `<tr style="cursor:pointer" data-id="${r.documento_id}">
        <td><strong class="mono">${esc(r.etiqueta)}</strong>
          <div class="muted" style="font-size:11.5px">${esc(D.CARACTER[r.caracter] || r.caracter)}</div></td>
        <td>${esc(r.documento_nombre)}
          <div class="muted" style="font-size:11.5px">${esc(r.tipo_nombre)} · ${esc(r.subtipo_nombre)}</div></td>
        <td>${esc(r.uso_nombre || '—')}</td>
        <td>${D.fecha(r.fecha_asignacion)}</td>
        <td>${r.fecha_devolucion_esperada
              ? `${D.fecha(r.fecha_devolucion_esperada)}${retraso
                  ? `<div style="font-size:11.5px;color:var(--danger,#dc2626);font-weight:700">${retraso} día(s) de retraso</div>` : ''}`
              : '<span class="muted">sin fecha</span>'}</td>
        <td style="text-align:right">${r.dias_fuera ?? '—'}</td>
      </tr>`;
    }).join('');

    tb.querySelectorAll('[data-id]').forEach((tr) => {
      tr.onclick = () => {
        window.location.href = '/modules/doc/documento-detalle.html?id=' + encodeURIComponent(tr.dataset.id);
      };
    });
  }

  async function load(showToast) {
    try {
      const res = await KoguApi.apiFetch('/protected/doc/mis-documentos');
      render(KoguApi.unwrapData(res));
      if (showToast) KoguApi.toast('Actualizado por cambio de empresa', 'success');
    } catch (e) {
      render({ rows: [] });
      D.errorToast(e, 'No fue posible cargar tu resguardo.');
    }
  }

  $('refreshBtn').onclick = () => load();
  window.addEventListener('kogu:empresa-activa-cambiada', () => load(true));

  await load();
});

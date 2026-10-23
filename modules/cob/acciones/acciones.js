// ============================================================
// modules/cob/acciones/acciones.js
// Cobranza F1b · catálogo de tipos de acción de seguimiento (solo administradores).
//   GET  /protected/cob/acciones/admin   todas (también inactivas) con usos
//   POST /protected/cob/acciones         { nombre, requiere_fecha, orden? }
//   PUT  /protected/cob/acciones/:id     solo lo que cambió (nombre, requiere_fecha, orden, activo)
// No se borra: se desactiva, porque el historial de seguimientos apunta a la
// acción. La clave interna no cambia. Permiso: cob.acciones.manage.
// Prueba: tests/cob-acciones-render.test.mjs
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/cob/acciones/acciones.html';
  const API = '/protected/cob/acciones';

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Tipos de acción de seguimiento',
    description: 'Lo que Cobranza elige al registrar el seguimiento de una factura en la Cartera.',
    requiredPermission: 'cob.acciones.manage',
  });
  if (!b) return;

  const esc = (s) => KoguUi.escapeHtml(s);
  const $ = (id) => document.getElementById(id);
  const datos = (r) => (r && r.data !== undefined ? r.data : r);
  // api.js ya avisa en 401/403/409/422; lo demás (400, red) avisa la pantalla.
  const avisar = (e) => { if (![401, 403, 409, 422].includes(e && e.status)) KoguApi.toast((e && e.message) || 'No se pudo guardar.', 'error'); };
  const pl = (n, a, b2) => `${n} ${n === 1 ? a : b2}`;

  let acciones = [];
  let editando = null;   // acción en el formulario (null = nueva)

  estilos();
  $('pageContent').innerHTML = `
<div class="stack coba" style="gap:16px">
  <div class="card">
    <div class="coba-bar">
      <div><div class="eyebrow">Catálogo de la empresa activa</div>
        <div class="coba-muted" id="cobAccResumen" style="margin-top:4px"></div></div>
      <span class="coba-sp"></span>
      <button type="button" class="btn primary" id="cobAccNueva">Nueva acción</button>
    </div>
    <div class="coba-muted" style="margin-top:10px">No se borran: desactiva las que ya no se usen y dejarán de salir en el formulario de seguimiento; el historial de las facturas las conserva. "Pide fecha" obliga a capturar fecha compromiso.</div>
    <div class="table-wrap" style="margin-top:14px"><table id="cobAccTabla">
      <thead><tr><th class="num" style="width:72px">Orden</th><th>Nombre</th><th>Fecha compromiso</th><th class="num">Usos</th><th>Estado</th><th></th></tr></thead>
      <tbody><tr><td colspan="6" class="coba-muted">Cargando…</td></tr></tbody></table></div>
  </div>
</div>
<div class="coba-ov" id="cobAccOv" style="display:none"></div>
<div class="coba-modal" id="cobAccModal" style="display:none" role="dialog" aria-labelledby="cobAccTitulo">
  <div class="eyebrow">Tipo de acción</div><h3 id="cobAccTitulo" style="margin:4px 0 0"></h3>
  <div id="cobAccClave" class="coba-muted" style="margin-top:4px"></div>
  <div class="coba-form">
    <label><span class="label-text">Nombre</span><input class="input" id="cobAccNombre" maxlength="120" placeholder="Ej. Pago parcial recibido"/></label>
    <label class="coba-check"><input type="checkbox" id="cobAccFecha"/> Pide fecha compromiso</label>
    <label><span class="label-text">Orden en la lista</span><input class="input" id="cobAccOrden" type="number" min="0" max="9999" step="1" style="width:140px"/><span class="coba-muted" style="font-size:12px">Opcional. El número menor sale primero; si lo dejas vacío, va al final.</span></label>
  </div>
  <div id="cobAccMsg" class="coba-msg"></div>
  <div class="coba-btns"><button type="button" class="btn" id="cobAccCancelar">Cancelar</button><button type="button" class="btn primary" id="cobAccGuardar">Guardar</button></div>
</div>`;

  async function cargar() {
    try {
      acciones = datos(await KoguApi.apiFetch(`${API}/admin`)) || [];
    } catch (e) { acciones = []; avisar(e); }
    pintar();
  }

  function pintar() {
    const act = acciones.filter((a) => a.activo).length;
    $('cobAccResumen').textContent = `${pl(act, 'activa', 'activas')} · ${pl(acciones.length - act, 'inactiva', 'inactivas')}`;
    $('cobAccTabla').tBodies[0].innerHTML = acciones.map((a) => `
      <tr data-accion="${esc(a.accion_id)}" class="${a.activo ? '' : 'coba-off'}">
        <td class="num">${esc(a.orden)}</td>
        <td><b>${esc(a.nombre)}</b></td>
        <td>${a.requiere_fecha ? '<span class="badge warn">Pide fecha</span>' : '<span class="coba-muted">—</span>'}</td>
        <td class="num">${Number(a.usos || 0)}</td>
        <td><span class="badge ${a.activo ? 'success' : 'neutral'}">${a.activo ? 'Activa' : 'Inactiva'}</span></td>
        <td class="coba-acc"><button type="button" class="btn" data-editar="${esc(a.accion_id)}">Editar</button>
          <button type="button" class="btn" data-estado="${esc(a.accion_id)}">${a.activo ? 'Desactivar' : 'Activar'}</button></td>
      </tr>`).join('') || '<tr><td colspan="6" class="coba-muted">Sin acciones.</td></tr>';
  }

  function abrir(a) {
    editando = a || null;
    $('cobAccTitulo').textContent = a ? 'Editar acción' : 'Nueva acción';
    $('cobAccClave').textContent = a ? `Clave interna: ${a.clave} (no cambia)` : '';
    $('cobAccNombre').value = a ? a.nombre : '';
    $('cobAccFecha').checked = a ? !!a.requiere_fecha : false;
    $('cobAccOrden').value = a ? String(a.orden ?? '') : '';
    $('cobAccMsg').textContent = '';
    $('cobAccOv').style.display = ''; $('cobAccModal').style.display = '';
    $('cobAccNombre').focus();
  }
  function cerrar() { editando = null; $('cobAccOv').style.display = 'none'; $('cobAccModal').style.display = 'none'; }

  async function guardar() {
    const msg = (t) => { $('cobAccMsg').textContent = t; };
    const nombre = $('cobAccNombre').value.replace(/\s+/g, ' ').trim();
    if (nombre.length < 2) return msg('Escribe el nombre de la acción (al menos 2 caracteres).');
    const ordenTxt = $('cobAccOrden').value.trim();
    if (ordenTxt && !/^\d{1,4}$/.test(ordenTxt)) return msg('El orden debe ser un número entero de 0 a 9999.');
    const form = { nombre, requiere_fecha: $('cobAccFecha').checked, ...(ordenTxt ? { orden: Number(ordenTxt) } : {}) };
    let body = form;
    if (editando) {
      body = {};
      if (form.nombre !== editando.nombre) body.nombre = form.nombre;
      if (form.requiere_fecha !== !!editando.requiere_fecha) body.requiere_fecha = form.requiere_fecha;
      if (form.orden !== undefined && form.orden !== Number(editando.orden)) body.orden = form.orden;
      if (!Object.keys(body).length) return msg('No hay cambios que guardar.');
    }
    const btn = $('cobAccGuardar'); btn.disabled = true;
    try {
      const url = editando ? `${API}/${encodeURIComponent(editando.accion_id)}` : API;
      await KoguApi.apiFetch(url, { method: editando ? 'PUT' : 'POST', body: JSON.stringify(body) });
      KoguApi.toast(editando ? `Se guardó "${nombre}".` : `Se agregó "${nombre}".`, 'success');
      cerrar();
      await cargar();
    } catch (e) {
      msg((e && e.message) || 'No se pudo guardar.');
      avisar(e);
    } finally { btn.disabled = false; }
  }

  async function cambiarEstado(a) {
    try {
      await KoguApi.apiFetch(`${API}/${encodeURIComponent(a.accion_id)}`, { method: 'PUT', body: JSON.stringify({ activo: !a.activo }) });
      KoguApi.toast(`"${a.nombre}" ${a.activo ? 'ya no sale' : 'vuelve a salir'} en el formulario de seguimiento.`, 'success');
      await cargar();
    } catch (e) { avisar(e); }
  }

  $('cobAccNueva').addEventListener('click', () => abrir(null));
  $('cobAccCancelar').addEventListener('click', cerrar);
  $('cobAccOv').addEventListener('click', cerrar);
  $('cobAccGuardar').addEventListener('click', guardar);
  $('cobAccNombre').addEventListener('keydown', (e) => { if (e.key === 'Enter') guardar(); });
  $('cobAccTabla').addEventListener('click', (e) => {
    const ed = e.target.closest('[data-editar]');
    const st = e.target.closest('[data-estado]');
    const id = (ed || st)?.dataset[ed ? 'editar' : 'estado'];
    const a = id && acciones.find((x) => x.accion_id === id);
    if (!a) return;
    if (ed) abrir(a); else cambiarEstado(a);
  });

  // Cambio de empresa: el catálogo es por empresa; nada de la anterior queda en pantalla.
  KoguShell.subscribeEmpresaActivaChange(async () => {
    cerrar(); acciones = []; pintar();
    await cargar();
  });

  await cargar();

  function estilos() {
    if (document.getElementById('cobaEstilos')) return;
    const s = document.createElement('style'); s.id = 'cobaEstilos';
    s.textContent = `
.coba-muted{color:var(--muted);font-size:13px}
.coba-bar{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.coba-sp{flex:1}
.coba #cobAccTabla td.num,.coba #cobAccTabla th.num{text-align:right}
.coba-acc{white-space:nowrap;text-align:right}
.coba-acc .btn{padding:6px 12px;font-size:13px}
.coba-off td{color:var(--muted)}
.coba-off td b{font-weight:500}
.coba-ov{position:fixed;inset:0;background:rgba(15,23,42,.35);z-index:50}
.coba-modal{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:min(480px,calc(100% - 32px));max-height:calc(100vh - 40px);overflow:auto;background:#fff;border-radius:16px;padding:20px 22px;z-index:51;box-shadow:0 20px 50px rgba(15,23,42,.25)}
.coba-form{display:grid;gap:12px;margin-top:14px}
.coba-form label{display:grid;gap:4px}
.coba-form label.coba-check{display:flex;gap:8px;align-items:center;font-size:14px}
.coba-msg{margin-top:10px;font-size:13px;color:#b91c1c;min-height:18px}
.coba-btns{display:flex;gap:10px;justify-content:flex-end;margin-top:14px}`;
    document.head.appendChild(s);
  }
});

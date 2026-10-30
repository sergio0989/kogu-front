// ============================================================
// modules/cob/config/config.js
// Cobranza · configuración de la empresa activa (solo administradores).
//   GET /protected/cob/config   { correos_pagos: [], telefono_pagos }
//   PUT /protected/cob/config   { correos_pagos: [...], telefono_pagos }
// Hoy: a qué correos mandan los clientes sus comprobantes de pago; sale al final
// del estado de cuenta (caso CxC Adegermex, 30-oct-2026). Sin correos, el PDF no
// lleva la línea. Permiso: cob.config.manage.
// Prueba: tests/cob-config-render.test.mjs
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/cob/config/config.html';
  const API = '/protected/cob/config';
  const MAX = 5;
  const CORREO_RE = /^[^\s@,;]+@[^\s@,;]+\.[a-z]{2,}$/i;

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Configuración de cobranza',
    description: 'Datos de la empresa activa que salen en los documentos de cobranza.',
    requiredPermission: 'cob.config.manage',
  });
  if (!b) return;

  const esc = (s) => KoguUi.escapeHtml(s);
  const $ = (id) => document.getElementById(id);
  const datos = (r) => (r && r.data !== undefined ? r.data : r);
  // api.js ya avisa en 401/403/409/422; lo demás (400, red) avisa la pantalla.
  const avisar = (e) => { if (![401, 403, 409, 422].includes(e && e.status)) KoguApi.toast((e && e.message) || 'No se pudo guardar.', 'error'); };

  let correos = [''];

  estilos();
  $('pageContent').innerHTML = `
<div class="stack cobc" style="gap:16px">
  <div class="card">
    <div class="eyebrow">Estado de cuenta</div>
    <h3 style="margin:4px 0 0">Comprobantes de pago</h3>
    <div class="cobc-muted" style="margin-top:6px">Correos a los que los clientes deben mandar sus comprobantes de pago (hasta ${MAX}). Salen al final del estado de cuenta, en español o inglés según el cliente.</div>
    <div class="cobc-form">
      <div><span class="label-text">Correos</span>
        <div id="cobCfgCorreos" class="cobc-lista"></div>
        <button type="button" class="btn" id="cobCfgAgregar" style="margin-top:8px">Agregar correo</button></div>
      <label><span class="label-text">Teléfono <span class="cobc-muted">(opcional)</span></span>
        <input class="input" id="cobCfgTel" maxlength="40" placeholder="Ej. 81 1234 5678" style="max-width:260px"/></label>
    </div>
    <div class="cobc-vista"><div class="cobc-muted">Así sale en el estado de cuenta:</div><div id="cobCfgVista"></div></div>
    <div id="cobCfgMsg" class="cobc-msg"></div>
    <div class="cobc-btns"><button type="button" class="btn primary" id="cobCfgGuardar">Guardar</button></div>
  </div>
</div>`;

  function limpios() {
    return correos.map((c) => c.trim().toLowerCase()).filter((c, i, a) => c && a.indexOf(c) === i);
  }
  function telefono() { return $('cobCfgTel').value.replace(/\s+/g, ' ').trim() || null; }

  function vista() {
    const c = limpios(); const t = telefono();
    $('cobCfgVista').innerHTML = c.length
      ? `<b>Envíe sus comprobantes de pago a:</b> ${esc(c.join(', '))}${t ? ` · Tel. ${esc(t)}` : ''}`
      : '<span class="cobc-muted">Sin correos: el estado de cuenta no lleva esta línea.</span>';
  }

  function pintar() {
    $('cobCfgCorreos').innerHTML = correos.map((c, i) => `
      <div class="cobc-fila"><input class="input" type="email" data-i="${i}" value="${esc(c)}" maxlength="254" placeholder="cxc@empresa.com.mx"/>
        <button type="button" class="btn" data-quitar="${i}" aria-label="Quitar correo">Quitar</button></div>`).join('');
    $('cobCfgAgregar').disabled = correos.length >= MAX;
    vista();
  }

  async function cargar() {
    try {
      const d = datos(await KoguApi.apiFetch(API)) || {};
      correos = (d.correos_pagos || []).length ? [...d.correos_pagos] : [''];
      $('cobCfgTel').value = d.telefono_pagos || '';
    } catch (e) { correos = ['']; $('cobCfgTel').value = ''; avisar(e); }
    $('cobCfgMsg').textContent = '';
    pintar();
  }

  async function guardar() {
    const msg = (t) => { $('cobCfgMsg').textContent = t; };
    const c = limpios();
    const malo = c.find((x) => !CORREO_RE.test(x));
    if (malo) return msg(`El correo "${malo}" no es válido.`);
    if (c.length > MAX) return msg(`Máximo ${MAX} correos.`);
    msg('');
    const btn = $('cobCfgGuardar'); btn.disabled = true;
    try {
      const d = datos(await KoguApi.apiFetch(API, { method: 'PUT', body: JSON.stringify({ correos_pagos: c, telefono_pagos: telefono() }) })) || {};
      correos = (d.correos_pagos || c).length ? [...(d.correos_pagos || c)] : [''];
      $('cobCfgTel').value = d.telefono_pagos || '';
      pintar();
      KoguApi.toast('Se guardó la configuración de cobranza.', 'success');
    } catch (e) {
      msg((e && e.message) || 'No se pudo guardar.');
      avisar(e);
    } finally { btn.disabled = false; }
  }

  $('cobCfgCorreos').addEventListener('input', (e) => {
    const i = e.target.dataset.i;
    if (i === undefined) return;
    correos[Number(i)] = e.target.value;
    vista();
  });
  $('cobCfgCorreos').addEventListener('click', (e) => {
    const q = e.target.closest('[data-quitar]');
    if (!q) return;
    correos.splice(Number(q.dataset.quitar), 1);
    if (!correos.length) correos = [''];
    pintar();
  });
  $('cobCfgAgregar').addEventListener('click', () => {
    if (correos.length >= MAX) return;
    correos.push('');
    pintar();
    const ins = $('cobCfgCorreos').querySelectorAll('input');
    ins[ins.length - 1].focus();
  });
  $('cobCfgTel').addEventListener('input', vista);
  $('cobCfgGuardar').addEventListener('click', guardar);

  // Cambio de empresa: la configuración es por empresa; nada de la anterior queda en pantalla.
  KoguShell.subscribeEmpresaActivaChange(async () => {
    correos = ['']; $('cobCfgTel').value = ''; pintar();
    await cargar();
  });

  await cargar();

  function estilos() {
    if (document.getElementById('cobcEstilos')) return;
    const s = document.createElement('style'); s.id = 'cobcEstilos';
    s.textContent = `
.cobc-muted{color:var(--muted);font-size:13px}
.cobc-form .label-text .cobc-muted{text-transform:none;letter-spacing:0;font-weight:400}
.cobc-form{display:grid;gap:16px;margin-top:16px;max-width:560px}
.cobc-form label{display:grid;gap:4px}
.cobc-lista{display:grid;gap:8px;margin-top:4px}
.cobc-fila{display:flex;gap:8px;align-items:center}
.cobc-fila .input{flex:1}
.cobc-fila .btn{padding:6px 12px;font-size:13px}
.cobc-vista{margin-top:18px;padding:12px 14px;border-radius:12px;background:var(--surface-2,#f8fafc);border:1px solid var(--border,#e2e8f0);font-size:14px;display:grid;gap:4px}
.cobc-msg{margin-top:10px;font-size:13px;color:#b91c1c;min-height:18px}
.cobc-btns{display:flex;gap:10px;justify-content:flex-end;margin-top:8px}`;
    document.head.appendChild(s);
  }
});

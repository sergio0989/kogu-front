// ============================================================
// inventario-conteo.js
// Pantalla: Levantamiento de inventario por escaneo QR / captura manual.
// Endpoint: POST /protected/act/inventarios/:id/conteo
// Usable desde el navegador de un teléfono.
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const b = await KoguShell.initShell({
    currentPage:        '/modules/act/inventario.html',
    title:              'Conteo de inventario',
    description:        'Escanea o teclea códigos para levantar el inventario.',
    requiredPermission: 'act.inventario.contar',
  });
  if (!b) return;

  const esc = KoguUi.escapeHtml;
  const $ = id => document.getElementById(id);
  const params = new URLSearchParams(window.location.search);
  const inventarioId = params.get('id');
  const pc = document.getElementById('pageContent');

  if (!inventarioId) {
    pc.innerHTML = `<div class="card"><div class="empty">Falta el parámetro de la campaña. <a class="link" href="/modules/act/inventario.html">Volver</a></div></div>`;
    return;
  }

  const RES = {
    localizado:           { color: '#16a34a', icon: '✓', label: 'Localizado' },
    ubicacion_incorrecta: { color: '#ca8a04', icon: '⚠', label: 'Ubicación incorrecta' },
    no_registrado:        { color: '#dc2626', icon: '✗', label: 'No registrado' },
    sobrante:             { color: '#0e7490', icon: '＋', label: 'Sobrante' },
  };
  const counters = { localizado: 0, ubicacion_incorrecta: 0, no_registrado: 0, sobrante: 0 };
  let inventario = null, ubicaciones = [];
  let scanner = null, scanning = false;
  let lastCode = '', lastTime = 0;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if ([...document.scripts].some(s => s.src === src)) return resolve();
      const s = document.createElement('script'); s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('No se pudo cargar ' + src));
      document.head.appendChild(s);
    });
  }

  async function loadCampaign() {
    try { inventario = KoguApi.unwrapData(await KoguApi.apiFetch('/protected/act/inventarios/' + encodeURIComponent(inventarioId))); return true; }
    catch (_e) { pc.innerHTML = `<div class="card"><div class="empty">No se encontró la campaña. <a class="link" href="/modules/act/inventario.html">Volver</a></div></div>`; return false; }
  }
  async function loadUbicaciones() {
    try { const all = KoguApi.unwrapRows(await KoguApi.apiFetch('/protected/act/ubicaciones'), 'rows') || []; ubicaciones = all.filter(u => u.activo !== false); }
    catch (_e) { ubicaciones = []; }
  }

  function render() {
    const cerrada = inventario.estado === 'conciliacion' || inventario.estado === 'cerrado';
    pc.innerHTML = `
<div class="card">
  <div class="row">
    <div><div class="eyebrow"><a class="link" href="/modules/act/inventario.html">← Campañas</a></div>
      <h2 style="margin:6px 0">Conteo · ${esc(inventario.nombre || '')}</h2>
      <div class="chip">Estado: ${esc((inventario.estado || '').replace(/_/g, ' '))}</div></div>
  </div>

  ${cerrada ? `<div class="empty" style="margin-top:14px">La campaña está en "${esc(inventario.estado)}" y ya no admite conteos.</div>` : `
  <div class="split" style="margin-top:16px">
    <div class="stack">
      <div>
        <div class="label-text">Ubicación donde estoy contando <span class="muted" style="font-size:11px">(opcional)</span></div>
        <select class="select" id="ubicEncontrada"><option value="">— sin especificar —</option>${ubicaciones.map(u => `<option value="${u.ubicacion_id}">${esc(u.clave)} — ${esc(u.nombre)}</option>`).join('')}</select>
      </div>
      <div>
        <div class="label-text">Código (teclear / pegar / lector de barras)</div>
        <div style="display:flex;gap:6px">
          <input class="input" id="manualCode" placeholder="Escanea con lector o teclea el QR/código y Enter" autocomplete="off"/>
          <button class="btn primary" id="manualBtn">Registrar</button>
        </div>
      </div>
      <div>
        <div class="label-text">Cámara</div>
        <div style="display:flex;gap:6px">
          <button class="btn" id="camStart">Iniciar cámara</button>
          <button class="btn ghost" id="camStop" disabled>Detener</button>
        </div>
        <div id="reader" style="margin-top:10px;max-width:360px"></div>
        <div class="muted" id="camMsg" style="font-size:12px;margin-top:6px"></div>
      </div>
    </div>
    <div>
      <div class="eyebrow">Sesión de conteo</div>
      <div class="grid-2" style="margin-top:8px">
        <div class="kpi"><div class="label">Localizado</div><div class="value" id="c_localizado" style="color:${RES.localizado.color}">0</div></div>
        <div class="kpi"><div class="label">Ubic. incorrecta</div><div class="value" id="c_ubicacion_incorrecta" style="color:${RES.ubicacion_incorrecta.color}">0</div></div>
        <div class="kpi"><div class="label">No registrado</div><div class="value" id="c_no_registrado" style="color:${RES.no_registrado.color}">0</div></div>
        <div class="kpi"><div class="label">Sobrante</div><div class="value" id="c_sobrante" style="color:${RES.sobrante.color}">0</div></div>
      </div>
      <div id="liveList" class="stack" style="margin-top:12px"></div>
    </div>
  </div>`}
</div>`;

    if (cerrada) return;
    $('manualBtn').onclick = () => { const v = $('manualCode').value.trim(); if (v) submitConteo(v, true); };
    $('manualCode').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); const v = $('manualCode').value.trim(); if (v) submitConteo(v, true); } });
    $('camStart').onclick = startCamera;
    $('camStop').onclick = stopCamera;
    $('manualCode').focus();
  }

  async function startCamera() {
    $('camMsg').textContent = 'Cargando lector…';
    try {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html5-qrcode/2.3.8/html5-qrcode.min.js');
      if (!scanner) scanner = new window.Html5Qrcode('reader');
      await scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 240, height: 240 } },
        (decoded) => submitConteo(decoded, false),
        () => {});
      scanning = true;
      $('camStart').disabled = true; $('camStop').disabled = false; $('camMsg').textContent = 'Cámara activa. Apunta al QR.';
    } catch (e) {
      $('camMsg').textContent = 'No se pudo iniciar la cámara: ' + (e?.message || e) + '. Usa la captura manual.';
    }
  }
  async function stopCamera() {
    try { if (scanner && scanning) { await scanner.stop(); scanning = false; } } catch (_e) {}
    $('camStart').disabled = false; $('camStop').disabled = true; $('camMsg').textContent = 'Cámara detenida.';
  }

  async function submitConteo(codigo, fromManual) {
    const now = Date.now();
    // Dedupe: la cámara dispara el mismo código repetidamente.
    if (!fromManual && codigo === lastCode && (now - lastTime) < 2000) return;
    lastCode = codigo; lastTime = now;

    const payload = { codigo_escaneado: codigo, ubicacion_encontrada_id: $('ubicEncontrada').value || null };
    try {
      const res = await KoguApi.apiFetch('/protected/act/inventarios/' + encodeURIComponent(inventarioId) + '/conteo', { method: 'POST', body: JSON.stringify(payload) });
      const row = KoguApi.unwrapData(res);
      const r = RES[row.resultado] || { color: '#64748b', icon: '•', label: row.resultado };
      counters[row.resultado] = (counters[row.resultado] || 0) + 1;
      const cEl = $('c_' + row.resultado); if (cEl) cEl.textContent = counters[row.resultado];
      const item = document.createElement('div');
      item.className = 'card'; item.style.cssText = `padding:10px 12px;border-left:4px solid ${r.color}`;
      item.innerHTML = `<div style="display:flex;justify-content:space-between;gap:8px;align-items:center">
        <div><span style="color:${r.color};font-weight:700">${r.icon} ${esc(r.label)}</span> · <span style="font-family:ui-monospace,monospace">${esc(codigo)}</span></div>
        <span class="muted" style="font-size:11px">${new Date().toLocaleTimeString('es-MX')}</span></div>`;
      $('liveList').insertBefore(item, $('liveList').firstChild);
      if (fromManual) { $('manualCode').value = ''; $('manualCode').focus(); }
    } catch (_err) {
      // apiFetch ya hizo toast (422 si la campaña no admite conteos, etc.)
      if (fromManual) $('manualCode').select();
    }
  }

  // ── Init ────────────────────────────────────────────────────────────────────
  KoguShell.subscribeEmpresaActivaChange(async () => { await stopCamera(); window.location.href = '/modules/act/inventario.html'; });
  window.addEventListener('beforeunload', () => { if (scanner && scanning) { try { scanner.stop(); } catch (_e) {} } });

  if (await loadCampaign()) { await loadUbicaciones(); render(); }
});

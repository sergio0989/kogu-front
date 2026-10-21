// ============================================================
// modules/erp/iva/iva.js — ERP · IVA por clave de venta
//
// El catálogo se calcula en el backend sobre las ventas importadas, así
// que esta pantalla siempre refleja la última importación del mes: no
// hay archivo que cargar. Lo único que se captura aquí es la decisión
// manual de las claves por confirmar o sin definir.
//
// Backend: /protected/erp/iva (screen.erp.iva · erp.iva.decidir).
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/erp/iva/iva.html';
  const BASE = '/protected/erp/iva';

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'IVA por clave',
    description: 'Tasa de IVA por clave de venta según el tipo de cliente, calculada sobre las ventas importadas.',
    requiredPermission: 'screen.erp.iva',
  });
  if (!b) return;

  const esc = (s) => KoguUi.escapeHtml(String(s ?? ''));
  const int = (n) => KoguUi.int(n || 0);
  const puedeDecidir = KoguShell.hasPerm(b, 'erp.iva.decidir');
  const api = (path, opts) => KoguApi.apiFetch(`${BASE}${path}`, opts);

  const ESTATUS = {
    iva_16:        ['success', 'Con IVA 16 %'],
    tasa_0:        ['primary', 'Tasa 0 %'],
    otra_tasa:     ['primary', 'Otra tasa'],
    por_confirmar: ['warn',    'Por confirmar'],
    sin_definir:   ['neutral', 'Sin definir'],
    resuelta:      ['primary', 'Resuelta a mano'],
  };
  const MOTIVO = {
    tasa_distinta:       ['danger',  'Tasa distinta al catálogo'],
    clave_por_confirmar: ['warn',    'Clave por confirmar'],
    ext_con_iva:         ['danger',  'Exportación con IVA'],
    sin_tasa:            ['neutral', 'Sin tasa en el ERP'],
  };
  const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio',
    'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

  const hoy = new Date();
  const S = {
    anio: 2026,
    tab: 'catalogo',
    q: '',
    estatus: '',
    mes: hoy.getFullYear() === 2026 ? Math.max(1, hoy.getMonth()) : 12,
    cat: null,
    exc: null,
  };

  const pct = (t) => (t == null ? '—' : `${Math.round(Number(t) * 100)} %`);
  const badge = (map, k) => { const [c, t] = map[k] || ['neutral', k || '—']; return `<span class="badge ${c}">${esc(t)}</span>`; };

  const anios = [];
  for (let a = Math.max(hoy.getFullYear(), 2026); a >= 2024; a--) anios.push(a);

  const c = document.getElementById('pageContent');
  c.innerHTML = `
<div class="iva-page">
  <div class="card">
    <div class="iva-head">
      <div>
        <div class="eyebrow">ERP · Fiscal</div>
        <h2 style="margin:2px 0 0">IVA por clave de venta</h2>
        <ul class="iva-reglas">
          <li><b>Cliente extranjero (EXT)</b> siempre va al 0 %.</li>
          <li><b>Cliente nacional (NAL)</b> toma la tasa con la que se facturó la clave en el año.</li>
          <li>Si una clave trae dos tasas en nacional queda <b>por confirmar</b>; si solo se vende al extranjero queda <b>sin definir</b>. Ambas se resuelven a mano.</li>
          <li>Se actualiza sola con cada importación de ventas del mes.</li>
        </ul>
      </div>
      <div class="iva-tools">
        <label class="muted" for="ivaAnio" style="font-size:12px">Año</label>
        <select class="select" id="ivaAnio">${anios.map((a) => `<option value="${a}"${a === S.anio ? ' selected' : ''}>${a}</option>`).join('')}</select>
        <button class="btn" id="ivaExport">Exportar Excel</button>
      </div>
    </div>
    <div class="iva-kpis" id="ivaKpis"></div>
    ${puedeDecidir ? '' : '<div class="iva-nota" style="margin-top:10px">Solo lectura: te falta el permiso <b>erp.iva.decidir</b> para resolver claves. Si te lo acaban de dar, cierra sesión y vuelve a entrar.</div>'}
  </div>

  <div class="card">
    <div class="iva-tabs" role="tablist">
      <button class="iva-tab on" data-tab="catalogo" role="tab">Catálogo <span class="n" id="nCat">—</span></button>
      <button class="iva-tab" data-tab="excepciones" role="tab">Renglones que no coinciden <span class="n" id="nExc">—</span></button>
    </div>

    <div id="paneCatalogo">
      <div class="iva-filtros">
        <input class="input" id="ivaQ" type="search" placeholder="Buscar clave o descripción" autocomplete="off"/>
        <select class="select" id="ivaEstatus">
          <option value="">Todos los estatus</option>
          ${Object.entries(ESTATUS).map(([k, [, t]]) => `<option value="${k}">${esc(t)}</option>`).join('')}
          <option value="_alerta">Con alerta tras decisión</option>
          <option value="_variante">Variantes con sufijo</option>
        </select>
        <span class="iva-nota" id="ivaCuenta"></span>
      </div>
      <div class="table-wrap"><table class="kogu-actions-table">
        <thead><tr>
          <th>Clave</th><th>Descripción</th><th>Tasa NAL</th><th>Tasa EXT</th><th>Estatus</th>
          <th class="iva-num">NAL 16 %</th><th class="iva-num">NAL 0 %</th><th class="iva-num">EXT</th>
          <th>Nota</th>${puedeDecidir ? '<th></th>' : ''}
        </tr></thead>
        <tbody id="ivaRows"><tr><td colspan="10" class="empty">Cargando…</td></tr></tbody>
      </table></div>
    </div>

    <div id="paneExcepciones" hidden>
      <div class="iva-filtros">
        <label class="muted" for="ivaMes" style="font-size:12px">Mes</label>
        <select class="select" id="ivaMes">
          <option value="">Todo el año</option>
          ${MESES.map((m, i) => `<option value="${i + 1}"${i + 1 === S.mes ? ' selected' : ''}>${m}</option>`).join('')}
        </select>
        <span class="iva-nota" id="excResumen"></span>
      </div>
      <div class="table-wrap"><table>
        <thead><tr>
          <th>Fecha</th><th>Folio</th><th>Cliente</th><th>Clave</th><th>Mercado</th>
          <th class="iva-num">Facturada</th><th class="iva-num">Esperada</th><th>Motivo</th><th class="iva-num">Subtotal MXN</th>
        </tr></thead>
        <tbody id="excRows"><tr><td colspan="9" class="empty">Cargando…</td></tr></tbody>
      </table></div>
    </div>
  </div>
</div>

<div class="modal-backdrop" id="ivaModal" hidden>
  <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="ivaModalTitle">
    <div class="iva-modal-head">
      <div><div class="eyebrow">Resolver tasa nacional</div><h3 style="margin:2px 0 0" id="ivaModalTitle"></h3><div class="iva-nota" id="ivaModalDesc"></div></div>
      <button class="btn" id="ivaModalClose" aria-label="Cerrar">✕</button>
    </div>
    <form id="ivaForm" autocomplete="off"></form>
  </div>
</div>`;

  const $ = (id) => document.getElementById(id);

  // ── carga ────────────────────────────────────────────────────
  async function loadCatalogo() {
    $('ivaRows').innerHTML = '<tr><td colspan="10" class="empty">Cargando…</td></tr>';
    try {
      const r = await api(`/claves?anio=${S.anio}`);
      S.cat = r?.data || r;
    } catch (err) {
      S.cat = null;
      $('ivaRows').innerHTML = `<tr><td colspan="10" class="empty">${esc(err.message || 'No se pudo cargar el catálogo.')}</td></tr>`;
      return;
    }
    renderKpis();
    renderCatalogo();
  }

  async function loadExcepciones() {
    $('excRows').innerHTML = '<tr><td colspan="9" class="empty">Cargando…</td></tr>';
    try {
      const qs = KoguUi.queryParams({ anio: S.anio, mes: S.mes || '' });
      const r = await api(`/excepciones?${qs}`);
      S.exc = r?.data || r;
    } catch (err) {
      S.exc = null;
      $('excRows').innerHTML = `<tr><td colspan="9" class="empty">${esc(err.message || 'No se pudieron cargar los renglones.')}</td></tr>`;
      return;
    }
    renderExcepciones();
  }

  // ── KPIs (también filtran) ───────────────────────────────────
  function renderKpis() {
    const r = S.cat?.resumen || {};
    const tiles = [
      ['', 'Claves vendidas', r.total, ''],
      ['iva_16', 'Con IVA 16 %', r.iva_16, ''],
      ['tasa_0', 'Tasa 0 %', r.tasa_0, ''],
      ['por_confirmar', 'Por confirmar', r.por_confirmar, r.por_confirmar ? 'warn' : ''],
      ['sin_definir', 'Sin definir', r.sin_definir, ''],
      ['resuelta', 'Resueltas a mano', r.resuelta, ''],
      ['_alerta', 'Alerta tras decisión', r.con_alerta, r.con_alerta ? 'danger' : ''],
    ];
    if (r.otra_tasa) tiles.splice(3, 0, ['otra_tasa', 'Otra tasa', r.otra_tasa, '']);
    $('ivaKpis').innerHTML = tiles.map(([k, l, v, cls]) =>
      `<button type="button" class="iva-kpi ${cls} ${S.estatus === k ? 'on' : ''}" data-filtro="${k}"><div class="l">${esc(l)}</div><div class="v">${int(v)}</div></button>`).join('');
    $('nCat').textContent = int(r.total);
  }

  // ── Catálogo ─────────────────────────────────────────────────
  function filtradas() {
    const q = S.q.trim().toUpperCase();
    return (S.cat?.claves || []).filter((k) => {
      if (S.estatus === '_alerta' && !k.alertas_posteriores) return false;
      if (S.estatus === '_variante' && !k.variante_de) return false;
      if (S.estatus && !S.estatus.startsWith('_') && k.estatus !== S.estatus) return false;
      if (q && !String(k.cve_prod).toUpperCase().includes(q) && !String(k.desc_prod || '').toUpperCase().includes(q)) return false;
      return true;
    });
  }

  function nota(k) {
    const p = [];
    if (k.alertas_posteriores) p.push(`<span class="alerta">${int(k.alertas_posteriores)} renglón(es) importados después con otra tasa</span>`);
    if (k.decision) p.push(`${esc(k.decision.motivo)}${k.decision.decidido_por_nombre ? ` — ${esc(k.decision.decidido_por_nombre)}` : ''}`);
    if (k.variante_de) p.push(`Variante de <span class="iva-clave">${esc(k.variante_de)}</span>; Comercial confirma si es duplicado`);
    if (k.n_ext_con_iva) p.push(`<span class="alerta">${int(k.n_ext_con_iva)} venta(s) EXT con IVA</span>`);
    if (k.n_nal_sin_tasa) p.push(`${int(k.n_nal_sin_tasa)} renglón(es) NAL sin tasa`);
    return p.length ? `<div class="iva-nota">${p.join('<br>')}</div>` : '';
  }

  function accion(k) {
    if (!puedeDecidir) return '';
    if (k.estatus === 'por_confirmar' || k.estatus === 'sin_definir') {
      return `<td><button class="btn primary" data-resolver="${esc(k.cve_prod)}">Resolver</button></td>`;
    }
    if (k.estatus === 'resuelta') return `<td><button class="btn" data-resolver="${esc(k.cve_prod)}">Cambiar</button></td>`;
    return '<td></td>';
  }

  function renderCatalogo() {
    const rows = filtradas();
    const total = S.cat?.claves?.length || 0;
    $('ivaCuenta').textContent = rows.length === total ? `${int(total)} claves` : `${int(rows.length)} de ${int(total)} claves`;
    const cols = puedeDecidir ? 10 : 9;
    if (!rows.length) {
      $('ivaRows').innerHTML = `<tr><td colspan="${cols}" class="empty">${total ? 'Ninguna clave con ese filtro.' : `Sin ventas importadas en ${S.anio}.`}</td></tr>`;
      return;
    }
    $('ivaRows').innerHTML = rows.map((k) => `<tr>
      <td class="iva-clave">${esc(k.cve_prod)}</td>
      <td>${esc(k.desc_prod || '—')}</td>
      <td class="iva-tasa">${pct(k.tasa_nal)}</td>
      <td class="iva-tasa">0 %</td>
      <td>${badge(ESTATUS, k.estatus)}</td>
      <td class="iva-num">${k.n_nal_16 ? int(k.n_nal_16) : '—'}</td>
      <td class="iva-num">${k.n_nal_0 ? int(k.n_nal_0) : '—'}</td>
      <td class="iva-num">${k.n_ext ? int(k.n_ext) : '—'}</td>
      <td>${nota(k)}</td>
      ${accion(k)}
    </tr>`).join('');
  }

  // ── Excepciones ──────────────────────────────────────────────
  function renderExcepciones() {
    const filas = S.exc?.filas || [];
    $('nExc').textContent = int(filas.length);
    const pm = S.exc?.resumen?.por_motivo || {};
    $('excResumen').innerHTML = Object.keys(pm).length
      ? Object.entries(pm).map(([k, n]) => `${esc((MOTIVO[k] || [, k])[1])}: <b>${int(n)}</b>`).join(' · ')
      : '';
    if (!filas.length) {
      $('excRows').innerHTML = '<tr><td colspan="9" class="empty">Todos los renglones del periodo coinciden con el catálogo.</td></tr>';
      return;
    }
    $('excRows').innerHTML = filas.map((f) => `<tr>
      <td style="white-space:nowrap">${esc(KoguUi.fmtDateOnly(f.falta_fac))}</td>
      <td style="white-space:nowrap">${esc(f.folio_factura || '—')}</td>
      <td>${esc(f.nom_cte || f.cve_cte || '—')}</td>
      <td class="iva-clave">${esc(f.cve_prod)}</td>
      <td>${esc(f.mercado || '—')}</td>
      <td class="iva-num iva-tasa">${pct(f.tasa_facturada)}</td>
      <td class="iva-num iva-tasa">${pct(f.tasa_esperada)}</td>
      <td>${badge(MOTIVO, f.motivo)}</td>
      <td class="iva-num">${KoguUi.money(f.subt_prod)}</td>
    </tr>`).join('');
  }

  // ── Modal resolver ───────────────────────────────────────────
  function abrirModal(cve) {
    const k = (S.cat?.claves || []).find((x) => x.cve_prod === cve);
    if (!k) return;
    const actual = k.decision ? Number(k.decision.tasa_nal) : null;
    $('ivaModalTitle').innerHTML = `<span class="iva-clave" style="font-size:16px">${esc(k.cve_prod)}</span>`;
    $('ivaModalDesc').textContent = k.desc_prod || '';
    const opcion = (v, t) => `<label><input type="radio" name="tasa" value="${v}"${actual === v ? ' checked' : ''} required/>${t}</label>`;
    $('ivaForm').innerHTML = `
      <div class="iva-conteos">
        <span>NAL al 16 %: <b>${int(k.n_nal_16)}</b></span>
        <span>NAL al 0 %: <b>${int(k.n_nal_0)}</b></span>
        ${k.n_nal_otra ? `<span>NAL otra tasa: <b>${int(k.n_nal_otra)}</b></span>` : ''}
        <span>EXT: <b>${int(k.n_ext)}</b></span>
        <span>Estatus: ${badge(ESTATUS, k.estatus)}</span>
      </div>
      <div class="label-text" style="margin-bottom:6px">Tasa para cliente nacional</div>
      <div class="iva-opciones">${opcion(0.16, '16 %')}${opcion(0.08, '8 %')}${opcion(0, '0 %')}</div>
      <div class="iva-nota" style="margin-top:6px">Cliente extranjero queda al 0 % siempre.</div>
      <div class="label-text" style="margin:14px 0 6px">Motivo (quién lo confirmó y por qué)</div>
      <textarea class="input" name="motivo" required maxlength="500" placeholder="Ej. Contabilidad confirma 16 %: el 0 % fue error de captura.">${esc(k.decision?.motivo || '')}</textarea>
      ${k.decision ? `<div class="iva-hist">Decisión vigente: <b>${pct(k.decision.tasa_nal)}</b>${k.decision.decidido_por_nombre ? `, ${esc(k.decision.decidido_por_nombre)}` : ''}${k.decision.decidido_at ? `, ${esc(KoguUi.fmtDate(k.decision.decidido_at))}` : ''}. Al cambiarla, la anterior queda en el historial.</div>` : ''}
      <div class="btns" style="justify-content:flex-end;margin-top:16px">
        <button type="button" class="btn" id="ivaCancelar">Cancelar</button>
        <button type="submit" class="btn primary" id="ivaGuardar">Guardar decisión</button>
      </div>`;
    $('ivaForm').dataset.cve = k.cve_prod;
    $('ivaModal').hidden = false;
    $('ivaCancelar').onclick = cerrarModal;
  }
  function cerrarModal() { $('ivaModal').hidden = true; }

  $('ivaForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const motivo = String(fd.get('motivo') || '').trim();
    if (fd.get('tasa') == null) { KoguApi.toast('Elige la tasa nacional.', 'info'); return; }
    if (!motivo) { KoguApi.toast('Escribe el motivo de la decisión.', 'info'); return; }
    const btn = $('ivaGuardar');
    btn.disabled = true;
    try {
      await api('/decision', {
        method: 'PUT',
        body: JSON.stringify({ cve_prod: e.target.dataset.cve, tasa_nal: Number(fd.get('tasa')), motivo }),
      });
      KoguApi.toast(`Clave ${e.target.dataset.cve} resuelta.`, 'success');
      cerrarModal();
      await Promise.all([loadCatalogo(), loadExcepciones()]);
    } catch (err) {
      // 403 y 422 ya los avisa apiFetch con su mensaje.
      if (err?.status !== 403 && err?.status !== 422) KoguApi.toast(err.message || 'No se pudo guardar.', 'error');
    } finally {
      btn.disabled = false;
    }
  });

  // ── Exportar ─────────────────────────────────────────────────
  $('ivaExport').addEventListener('click', async () => {
    const btn = $('ivaExport');
    btn.disabled = true;
    try {
      const res = await KoguApi.authFetchRaw(`${BASE}/claves/export?anio=${S.anio}`);
      if (!res.ok) { KoguApi.toast('No se pudo generar el archivo.', 'error'); return; }
      const blob = await res.blob();
      const m = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') || '');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = m ? m[1] : `IVA-por-clave_${S.anio}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch (err) {
      KoguApi.toast(err?.message || 'No se pudo generar el archivo.', 'error');
    } finally {
      btn.disabled = false;
    }
  });

  // ── Eventos ──────────────────────────────────────────────────
  $('ivaAnio').addEventListener('change', (e) => {
    S.anio = Number(e.target.value);
    loadCatalogo(); loadExcepciones();
  });
  $('ivaMes').addEventListener('change', (e) => { S.mes = e.target.value ? Number(e.target.value) : null; loadExcepciones(); });
  let t = null;
  $('ivaQ').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { S.q = e.target.value; renderCatalogo(); }, 200); });
  $('ivaEstatus').addEventListener('change', (e) => { S.estatus = e.target.value; renderKpis(); renderCatalogo(); });
  $('ivaKpis').addEventListener('click', (e) => {
    const k = e.target.closest('[data-filtro]');
    if (!k) return;
    S.estatus = S.estatus === k.dataset.filtro ? '' : k.dataset.filtro;
    $('ivaEstatus').value = S.estatus;
    setTab('catalogo'); renderKpis(); renderCatalogo();
  });
  $('ivaRows').addEventListener('click', (e) => {
    const bt = e.target.closest('[data-resolver]');
    if (bt) abrirModal(bt.dataset.resolver);
  });
  $('ivaModalClose').addEventListener('click', cerrarModal);
  $('ivaModal').addEventListener('click', (e) => { if (e.target.id === 'ivaModal') cerrarModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('ivaModal').hidden) cerrarModal(); });

  function setTab(tab) {
    S.tab = tab;
    document.querySelectorAll('.iva-tab').forEach((x) => x.classList.toggle('on', x.dataset.tab === tab));
    $('paneCatalogo').hidden = tab !== 'catalogo';
    $('paneExcepciones').hidden = tab !== 'excepciones';
  }
  document.querySelector('.iva-tabs').addEventListener('click', (e) => {
    const x = e.target.closest('.iva-tab');
    if (x) setTab(x.dataset.tab);
  });

  await Promise.all([loadCatalogo(), loadExcepciones()]);
});

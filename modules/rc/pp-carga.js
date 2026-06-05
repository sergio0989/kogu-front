// ============================================================
// pp-carga.js
// Radar Comercial (rc_) — Carga del Presupuesto anual de empresa (PP).
// Permite: subir el Excel del PP (parse en cliente con SheetJS) y/o
// capturar/editar renglón a renglón, luego guardar con upsert por
// sublínea (POST /protected/rc/pp). Opera siempre sobre la empresa activa.
// Permiso: rc.pp.manage.
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const PAGE = '/modules/rc/pp-carga.html';
  const BASE = '/protected/rc';
  const PERM = 'rc.pp.manage';

  const b = await KoguShell.initShell({
    currentPage: PAGE,
    title: 'Carga de Presupuesto (PP)',
    description: 'Carga y edición del presupuesto anual de la empresa por sublínea. Radar Comercial · Dirección.',
    requiredPermission: PERM,
  });
  if (!b) return;

  const anioActual = new Date().getFullYear();

  // ── Estado ──────────────────────────────────────────────────────────────
  let anio = anioActual;
  let anios = [];
  let items = [];          // [{presupuesto_pp_id?, cve_sublinea, sublinea_nombre, cat, cat_nombre, kg_pp, ventas_pp, utilidad_pp, notas?}]
  let dirty = false;

  // ── Helpers ─────────────────────────────────────────────────────────────
  const esc = s => KoguUi.escapeHtml(String(s ?? ''));
  const money = v => KoguUi.money(Number(v || 0));
  const nf0 = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 });
  const $ = id => document.getElementById(id);
  // Parsea "1,234.56", "$1,234.56" o número nativo → Number (0 si vacío/no numérico).
  const num = v => {
    if (v == null || v === '') return 0;
    const n = typeof v === 'number' ? v : Number(String(v).replace(/[$,\s]/g, ''));
    return Number.isFinite(n) ? n : 0;
  };
  // Formato compacto en millones para los totales (coherente con el Tablero).
  const moneyC = v => {
    const n = Number(v || 0), abs = Math.abs(n);
    if (abs >= 1e6) { const m = Math.trunc(n / 1e3) / 1e3; return `$${m.toLocaleString('es-MX', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} M`; }
    return money(n);
  };

  // ── Layout ──────────────────────────────────────────────────────────────
  const c = document.getElementById('pageContent');
  c.innerHTML = `
<div class="stack" style="gap:18px">
  <div class="card">
    <div class="row" style="align-items:flex-start">
      <div>
        <div class="eyebrow">Radar · Presupuesto</div>
        <h2>Carga de Presupuesto (PP)</h2>
        <div class="hint" style="margin-top:4px;color:var(--muted);font-size:13px">
          Presupuesto anual de la empresa por sublínea. Sube el Excel o edita manualmente; al guardar se hace
          <b>upsert por sublínea</b> (no borra renglones que no incluyas). Opera sobre la <b>empresa activa</b>.
        </div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <span class="label-text" style="margin:0">Año</span>
        <input class="input" id="anioInput" type="number" min="2000" max="2100" step="1" style="width:96px"/>
        <button class="btn" id="cargarBtn" title="Cargar el PP del año seleccionado">↻ Cargar año</button>
        <button class="btn" id="excelBtn" title="Subir Excel del PP">📥 Subir Excel</button>
        <input type="file" id="excelInput" accept=".xlsx,.xls" style="display:none"/>
      </div>
    </div>

    <!-- Resumen de totales -->
    <div id="totBar" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin-top:14px"></div>

    <div class="hint" id="estado" style="margin-top:10px;color:var(--muted);font-size:12px">—</div>
  </div>

  <div class="card">
    <div class="row" style="align-items:flex-start">
      <div><div class="eyebrow">Detalle por sublínea</div><h3 style="margin:2px 0 0">Renglones del PP ${''}</h3></div>
      <div style="display:flex;gap:8px">
        <button class="btn" id="addRowBtn">+ Agregar renglón</button>
        <button class="btn primary" id="guardarBtn">💾 Guardar PP</button>
      </div>
    </div>

    <div class="table-wrap" style="margin-top:12px">
      <table>
        <thead><tr>
          <th style="width:70px">Cat</th>
          <th style="min-width:150px">Categoría (nombre)</th>
          <th style="width:90px">Código</th>
          <th style="min-width:180px">Sublínea</th>
          <th style="width:130px;text-align:right">Kg PP</th>
          <th style="width:150px;text-align:right">Ventas PP (MXN)</th>
          <th style="width:150px;text-align:right">Utilidad PP (MXN)</th>
          <th style="width:48px"></th>
        </tr></thead>
        <tbody id="rows"></tbody>
        <tfoot id="foot"></tfoot>
      </table>
    </div>
    <div class="hint" style="margin-top:8px;color:var(--muted);font-size:12px">
      Columnas esperadas en el Excel (se detectan por nombre, sin importar mayúsculas): <b>Código</b>, <b>SubLinea</b>,
      <b>Cat</b>, opcional <b>Cat nombre</b>, <b>Kg PP</b>, <b>Total de Ventas</b>, <b>Utilidad</b>.
    </div>
  </div>
</div>`;

  // ── Totales (vivos, recalculados desde items en memoria) ──────────────────
  function recompute() {
    return items.reduce((a, it) => {
      a.kg += num(it.kg_pp); a.ventas += num(it.ventas_pp); a.utilidad += num(it.utilidad_pp);
      if (String(it.cve_sublinea ?? '').trim()) a.validos++;
      return a;
    }, { kg: 0, ventas: 0, utilidad: 0, validos: 0 });
  }

  const miniCard = (lbl, val, hint = '', color = '') => `
    <div style="border:1px solid var(--line);border-radius:10px;padding:9px 12px">
      <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.03em">${esc(lbl)}</div>
      <div style="font-size:18px;font-weight:800;line-height:1.15;margin-top:1px;${color ? `color:${color}` : ''}">${esc(val)}</div>
      ${hint ? `<div style="font-size:10px;color:var(--muted)">${esc(hint)}</div>` : ''}
    </div>`;

  function renderTotales() {
    const t = recompute();
    $('totBar').innerHTML = [
      miniCard(`PP ${anio} · Ventas`, moneyC(t.ventas), 'presupuesto anual', 'var(--brand,#2563eb)'),
      miniCard('Kg PP', `${nf0.format(t.kg)} kg`, 'volumen presupuestado'),
      miniCard('Utilidad PP', moneyC(t.utilidad), 'utilidad presupuestada'),
      miniCard('Renglones', `${t.validos}`, `de ${items.length} en pantalla`),
    ].join('');
  }

  // ── Tabla editable ────────────────────────────────────────────────────────
  function cellInput(i, field, value, opts = {}) {
    const type = opts.type || 'text';
    const align = opts.align ? `text-align:${opts.align}` : '';
    const ph = opts.ph ? `placeholder="${esc(opts.ph)}"` : '';
    return `<input class="input" data-i="${i}" data-f="${field}" type="${type}" ${ph}
              value="${esc(value ?? '')}" style="width:100%;padding:6px 8px;${align}"/>`;
  }

  function renderRows() {
    const tb = $('rows');
    if (!items.length) {
      tb.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:26px;color:var(--muted)">
        Sin renglones. Sube el Excel del PP o usa “+ Agregar renglón”.</td></tr>`;
    } else {
      tb.innerHTML = items.map((it, i) => `
        <tr>
          <td>${cellInput(i, 'cat', it.cat, { type: 'number', align: 'center' })}</td>
          <td>${cellInput(i, 'cat_nombre', it.cat_nombre, { ph: 'Nombre categoría' })}</td>
          <td>${cellInput(i, 'cve_sublinea', it.cve_sublinea, { ph: '1A' })}</td>
          <td>${cellInput(i, 'sublinea_nombre', it.sublinea_nombre, { ph: 'Nombre sublínea' })}</td>
          <td>${cellInput(i, 'kg_pp', it.kg_pp, { type: 'number', align: 'right' })}</td>
          <td>${cellInput(i, 'ventas_pp', it.ventas_pp, { type: 'number', align: 'right' })}</td>
          <td>${cellInput(i, 'utilidad_pp', it.utilidad_pp, { type: 'number', align: 'right' })}</td>
          <td style="text-align:center">
            <button class="btn ghost danger" data-del="${i}" title="Eliminar renglón" style="padding:4px 8px">✕</button>
          </td>
        </tr>`).join('');
    }
    const t = recompute();
    $('foot').innerHTML = items.length ? `
      <tr style="font-weight:800;background:var(--panel2,#f8fafc)">
        <td colspan="4" style="text-align:right">Total</td>
        <td style="text-align:right">${nf0.format(t.kg)}</td>
        <td style="text-align:right">${money(t.ventas)}</td>
        <td style="text-align:right">${money(t.utilidad)}</td>
        <td></td>
      </tr>` : '';

    tb.querySelectorAll('input[data-i]').forEach(inp => {
      inp.addEventListener('input', e => {
        const i = Number(e.target.dataset.i), f = e.target.dataset.f;
        items[i][f] = e.target.value;
        dirty = true;
        // Solo refrescamos totales (no re-render para no perder el foco del input).
        renderTotales();
        $('foot').querySelector('tr') && refreshFootTotals();
        setEstado();
      });
    });
    tb.querySelectorAll('button[data-del]').forEach(btn => {
      btn.addEventListener('click', () => eliminarRenglon(Number(btn.dataset.del)));
    });
    renderTotales();
  }

  function refreshFootTotals() {
    const t = recompute();
    const tr = $('foot').querySelector('tr');
    if (!tr) return;
    const tds = tr.querySelectorAll('td');
    if (tds.length >= 4) {
      tds[1].textContent = nf0.format(t.kg);
      tds[2].textContent = money(t.ventas);
      tds[3].textContent = money(t.utilidad);
    }
  }

  function setEstado(extra) {
    const t = recompute();
    $('estado').innerHTML = (extra ? extra + ' · ' : '') +
      `${t.validos} renglón(es) con código · Ventas PP ${money(t.ventas)}` +
      (dirty ? ' · <b style="color:var(--warning,#d97706)">cambios sin guardar</b>' : '');
  }

  // ── Cargar el PP de un año ────────────────────────────────────────────────
  async function cargar(anioPedido) {
    const a = Number(anioPedido) || anioActual;
    try {
      const res = await KoguApi.apiFetch(`${BASE}/pp/items?anio=${a}`);
      const data = KoguApi.unwrapData(res);
      anio = Number(data.anio) || a;
      anios = data.anios || [];
      items = (data.items || []).map(r => ({
        presupuesto_pp_id: r.presupuesto_pp_id,
        cat: r.cat, cat_nombre: r.cat_nombre || '',
        cve_sublinea: r.cve_sublinea, sublinea_nombre: r.sublinea_nombre || '',
        kg_pp: Number(r.kg_pp || 0), ventas_pp: Number(r.ventas_pp || 0), utilidad_pp: Number(r.utilidad_pp || 0),
      }));
      dirty = false;
      $('anioInput').value = String(anio);
      renderRows();
      setEstado(items.length ? `PP ${anio} cargado` : `No hay PP cargado para ${anio}` + (anios.length ? ` (años con PP: ${anios.join(', ')})` : ''));
    } catch (err) {
      KoguApi.toast(err.message, 'error');
    }
  }

  // ── Subir Excel ───────────────────────────────────────────────────────────
  // Mapea encabezados por candidatos (trim + lowercase) a los campos del PP.
  const COLMAP = {
    cve_sublinea: ['codigo', 'código', 'cve', 'cve_sublinea', 'clave', 'clavepp', 'clave_pp', 'cod'],
    sublinea_nombre: ['sublinea', 'sublínea', 'sub linea', 'sub_linea', 'sublinea_nombre', 'descripcion', 'descripción', 'nombre'],
    cat: ['cat', 'categoria', 'categoría', 'linea', 'línea', 'cat_id'],
    cat_nombre: ['cat_nombre', 'categoria_nombre', 'nombre_categoria', 'linea_nombre', 'nombre_cat', 'categoria nombre', 'nombre categoria'],
    kg_pp: ['kg pp', 'kg_pp', 'kg', 'kilos', 'kgs', 'cantidad', 'kg_presupuesto'],
    ventas_pp: ['total de ventas', 'total de venta', 'ventas_pp', 'ventas', 'total ventas', 'importe', 'total', 'venta', 'ventas pp'],
    utilidad_pp: ['utilidad', 'utilidad_pp', 'margen', 'utilidad pp'],
  };
  function mapHeader(norm) {
    const out = {};
    for (const [field, cands] of Object.entries(COLMAP)) {
      const hit = cands.find(c => norm[c] !== undefined);
      if (hit) out[field] = hit;
    }
    return out;
  }

  async function onExcel(file) {
    if (!file) return;
    if (!file.name.match(/\.(xlsx|xls)$/i)) return KoguApi.toast('Solo archivos .xlsx o .xls', 'error');
    if (typeof XLSX === 'undefined') return KoguApi.toast('SheetJS no cargó. Recarga la página.', 'error');
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      if (!ws) throw new Error('El archivo no tiene hojas.');
      const raw = XLSX.utils.sheet_to_json(ws, { defval: null, raw: true });
      if (!raw.length) throw new Error('El archivo no tiene filas.');

      // Normaliza llaves a lowercase+trim para mapear encabezados.
      const normRows = raw.map(row => {
        const r = {};
        for (const [k, v] of Object.entries(row)) r[String(k).trim().toLowerCase()] = v;
        return r;
      });
      const fmap = mapHeader(normRows[0]);
      if (!fmap.cve_sublinea || fmap.cat === undefined) {
        throw new Error('No se reconocen las columnas mínimas (Código y Cat). Revisa los encabezados del Excel.');
      }

      // Construye renglones y mergea por cve_sublinea sobre lo ya cargado.
      const byClave = new Map(items.map(it => [String(it.cve_sublinea ?? '').trim().toUpperCase(), it]));
      let nuevos = 0, actualizados = 0, omitidos = 0;
      for (const r of normRows) {
        const cve = String(r[fmap.cve_sublinea] ?? '').trim();
        if (!cve) { omitidos++; continue; }
        const cat = Number(r[fmap.cat]);
        if (!Number.isInteger(cat)) { omitidos++; continue; }
        const reg = {
          cat,
          cat_nombre: fmap.cat_nombre ? String(r[fmap.cat_nombre] ?? '').trim() : '',
          cve_sublinea: cve,
          sublinea_nombre: fmap.sublinea_nombre ? String(r[fmap.sublinea_nombre] ?? '').trim() : '',
          kg_pp: fmap.kg_pp ? num(r[fmap.kg_pp]) : 0,
          ventas_pp: fmap.ventas_pp ? num(r[fmap.ventas_pp]) : 0,
          utilidad_pp: fmap.utilidad_pp ? num(r[fmap.utilidad_pp]) : 0,
        };
        const key = cve.toUpperCase();
        const ex = byClave.get(key);
        if (ex) { Object.assign(ex, reg); actualizados++; }
        else { const it = { ...reg }; items.push(it); byClave.set(key, it); nuevos++; }
      }
      // Orden estable por categoría y código.
      items.sort((a, b) => (Number(a.cat) - Number(b.cat)) || String(a.cve_sublinea).localeCompare(String(b.cve_sublinea)));
      dirty = true;
      renderRows();
      const t = recompute();
      KoguApi.toast(`Excel leído: ${nuevos} nuevos, ${actualizados} actualizados${omitidos ? `, ${omitidos} omitidos` : ''}. Revisa y Guarda.`, 'success');
      setEstado(`Excel “${file.name}”: ${nuevos + actualizados} renglones · Ventas PP ${money(t.ventas)}`);
    } catch (err) {
      KoguApi.toast(err.message, 'error');
    } finally {
      $('excelInput').value = '';
    }
  }

  // ── Acciones de renglón ───────────────────────────────────────────────────
  function agregarRenglon() {
    items.push({ cat: '', cat_nombre: '', cve_sublinea: '', sublinea_nombre: '', kg_pp: 0, ventas_pp: 0, utilidad_pp: 0 });
    dirty = true;
    renderRows();
  }

  async function eliminarRenglon(i) {
    const it = items[i];
    if (!it) return;
    if (it.presupuesto_pp_id) {
      if (!confirm(`¿Dar de baja la sublínea ${it.cve_sublinea} (${it.sublinea_nombre || ''})? Saldrá del PP ${anio}.`)) return;
      try {
        await KoguApi.apiFetch(`${BASE}/pp/${it.presupuesto_pp_id}`, { method: 'DELETE' });
        KoguApi.toast('Renglón dado de baja.', 'success');
      } catch (err) { return KoguApi.toast(err.message, 'error'); }
    }
    items.splice(i, 1);
    renderRows();
    setEstado();
  }

  // ── Guardar (upsert por sublínea) ─────────────────────────────────────────
  async function guardar(btn) {
    const payload = items
      .filter(it => String(it.cve_sublinea ?? '').trim() && String(it.cat ?? '').trim() !== '')
      .map(it => ({
        cve_sublinea: String(it.cve_sublinea).trim(),
        sublinea_nombre: String(it.sublinea_nombre || '').trim(),
        cat: Number(it.cat),
        cat_nombre: it.cat_nombre || null,
        kg_pp: num(it.kg_pp), ventas_pp: num(it.ventas_pp), utilidad_pp: num(it.utilidad_pp),
      }));
    if (!payload.length) return KoguApi.toast('No hay renglones válidos (faltan Código o Cat).', 'error');
    const a = Number($('anioInput').value) || anio;
    await KoguUi.withLoading(btn, async () => {
      try {
        const res = await KoguApi.apiFetch(`${BASE}/pp`, { method: 'POST', body: JSON.stringify({ anio: a, items: payload }) });
        const d = KoguApi.unwrapData(res);
        const errN = (d.errores || []).length;
        KoguApi.toast(`PP ${d.anio} guardado: ${d.guardados} renglones${errN ? `, ${errN} con error` : ''}.`, errN ? 'warning' : 'success');
        await cargar(a);   // recarga con PKs frescas
      } catch (err) { KoguApi.toast(err.message, 'error'); }
    }, 'Guardando...');
  }

  // ── Eventos ───────────────────────────────────────────────────────────────
  $('anioInput').value = String(anioActual);
  $('cargarBtn').onclick = () => cargar(Number($('anioInput').value));
  $('anioInput').addEventListener('change', () => cargar(Number($('anioInput').value)));
  $('excelBtn').onclick = () => $('excelInput').click();
  $('excelInput').addEventListener('change', e => onExcel(e.target.files?.[0]));
  $('addRowBtn').onclick = agregarRenglon;
  $('guardarBtn').onclick = e => guardar(e.target);
  window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

  KoguShell.subscribeEmpresaActivaChange(() => cargar(Number($('anioInput').value)));
  await cargar(anioActual);
});

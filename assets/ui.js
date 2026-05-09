(function(){
  function money(v){ const n=Number(v||0); return new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN'}).format(n); }
  function int(v){ return new Intl.NumberFormat('es-MX').format(Number(v||0)); }
  function fmtDate(v){ if(!v) return '-'; const d=new Date(v); return isNaN(d)?String(v):d.toLocaleString('es-MX'); }
  function escapeHtml(s){ return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
  function statusBadge(v){
    const x=String(v||'').toUpperCase();
    let cls='neutral';
    if(['VIGENTE','ACTIVO','ACTIVA','OK','OPERANDO'].includes(x)) cls='success';
    else if(['CANCELADO','ERROR','SUSPENDIDO','INACTIVO','INACTIVA','NO AUTORIZADO'].includes(x)) cls='danger';
    else if(['PENDIENTE','PROCESANDO','EN PROCESO','POR VENCER'].includes(x)) cls='warn';
    return `<span class="badge ${cls}">${escapeHtml(v||'-')}</span>`;
  }
  function cardStat(label,value,hint=''){
    return `<div class="kpi"><div class="label">${escapeHtml(label)}</div><div class="value">${escapeHtml(value)}</div><div class="hint">${escapeHtml(hint)}</div></div>`;
  }
  function queryParams(obj){ const qs=new URLSearchParams(); Object.entries(obj||{}).forEach(([k,v])=>{ if(v!==undefined && v!==null && v!=='') qs.append(k,v); }); return qs.toString(); }
  function parseBool(v){ return v===true || v==='true' || v===1 || v==='1'; }

  // ─── withLoading: previene doble submit en botones (F-05) ─────────────────
  // Uso: await KoguUi.withLoading(btn, async () => { ... });
  // Uso con texto custom: await KoguUi.withLoading(btn, fn, 'Guardando...');
  async function withLoading(btn, asyncFn, loadingText = 'Procesando...'){
    if(!btn) return asyncFn();
    const original = btn.textContent;
    const wasDisabled = btn.disabled;
    btn.disabled = true;
    btn.textContent = loadingText;
    try {
      return await asyncFn();
    } finally {
      btn.disabled = wasDisabled;
      btn.textContent = original;
    }
  }

  // ─── openSearchPicker: modal selector con búsqueda (F-09) ─────────────────
  // Reemplazo del <select> nativo cuando hay decenas/cientos de opciones.
  //
  // Uso típico:
  //   KoguUi.openSearchPicker({
  //     title: 'Seleccionar cliente',
  //     items: clientesArray,
  //     columns: [
  //       { key: 'nombre', label: 'Nombre', primary: true },
  //       { key: 'rfc',    label: 'RFC' },
  //       { key: 'cve_cte', label: 'cve_cte' }
  //     ],
  //     placeholder: 'Buscar por nombre, RFC, cve_cte…',
  //     onSelect: (item) => { ... },
  //   });
  //
  // - Filtra en cliente sobre TODAS las columnas declaradas (case-insensitive).
  // - Autofocus en el input al abrir.
  // - Cierre: Escape, click en overlay o botón Cerrar.
  // - Navegación con teclado: ↑ ↓ Enter.
  // - Indica total de resultados y limita a maxVisible (default 200) por fluidez.
  // - Agnóstico al tipo de entidad (clientes, proveedores, productos…).
  let _pickerEl = null;
  function openSearchPicker({
    title       = 'Seleccionar',
    items       = [],
    columns     = [],
    placeholder = 'Buscar…',
    onSelect    = () => {},
    emptyText   = 'Sin coincidencias',
    maxVisible  = 200,
  } = {}) {
    closeSearchPicker();

    const overlay = document.createElement('div');
    overlay.className = 'kogu-picker-overlay';
    overlay.style.cssText = `
      position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:9999;
      display:flex;align-items:flex-start;justify-content:center;
      padding:60px 20px;backdrop-filter:blur(2px);
    `;

    const dialog = document.createElement('div');
    dialog.className = 'kogu-picker-dialog';
    dialog.style.cssText = `
      width:100%;max-width:720px;max-height:80vh;background:white;
      border-radius:12px;box-shadow:0 20px 50px rgba(0,0,0,.3);
      display:flex;flex-direction:column;overflow:hidden;color:#0f172a;
    `;

    const header = document.createElement('div');
    header.style.cssText = 'padding:16px 18px;border-bottom:1px solid var(--line, #e2e8f0);display:flex;align-items:center;justify-content:space-between;gap:10px';
    header.innerHTML = `
      <div style="font-weight:600;font-size:16px">${escapeHtml(title)}</div>
      <button class="btn ghost" data-picker-close>Cerrar</button>
    `;

    const searchWrap = document.createElement('div');
    searchWrap.style.cssText = 'padding:12px 18px;border-bottom:1px solid var(--line, #e2e8f0)';
    searchWrap.innerHTML = `
      <input class="input" data-picker-search placeholder="${escapeHtml(placeholder)}" autocomplete="off"/>
      <div data-picker-info style="margin-top:6px;font-size:12px;color:var(--muted, #64748b)">${items.length} registro${items.length === 1 ? '' : 's'}</div>
    `;

    const listWrap = document.createElement('div');
    listWrap.style.cssText = 'flex:1;overflow-y:auto;padding:0';

    const list = document.createElement('div');
    list.dataset.pickerList = '';
    list.style.cssText = 'display:flex;flex-direction:column';
    listWrap.appendChild(list);

    dialog.appendChild(header);
    dialog.appendChild(searchWrap);
    dialog.appendChild(listWrap);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    _pickerEl = overlay;

    // Estado interno
    let filtered    = items.slice();
    let highlighted = 0;

    function renderList(query = '') {
      const q = query.trim().toLowerCase();
      filtered = q
        ? items.filter(item => columns.some(c => {
            const val = String(item[c.key] ?? '').toLowerCase();
            return val.includes(q);
          }))
        : items.slice();

      const info = dialog.querySelector('[data-picker-info]');
      info.textContent = filtered.length === 0
        ? emptyText
        : `${filtered.length} de ${items.length} registro${items.length === 1 ? '' : 's'}`
          + (filtered.length > maxVisible ? ` · mostrando primeros ${maxVisible}` : '');

      const visible = filtered.slice(0, maxVisible);
      if (visible.length === 0) {
        list.innerHTML = `<div style="padding:24px;text-align:center;color:var(--muted, #64748b);font-size:13px">${escapeHtml(emptyText)}</div>`;
        return;
      }

      list.innerHTML = visible.map((item, idx) => {
        const cells = columns.map(c => {
          const v = String(item[c.key] ?? '');
          if (c.primary) return `<div style="font-weight:600">${escapeHtml(v)}</div>`;
          return `<div style="font-size:12px;color:var(--muted, #64748b)">${escapeHtml(c.label || c.key)}: ${escapeHtml(v) || '—'}</div>`;
        }).join('');
        return `
          <div class="kogu-picker-row" data-picker-idx="${idx}"
               style="padding:10px 18px;border-bottom:1px solid var(--line, #e2e8f0);cursor:pointer">
            ${cells}
          </div>`;
      }).join('');

      highlighted = 0;
      paintHighlight();
    }

    function paintHighlight() {
      list.querySelectorAll('[data-picker-idx]').forEach((row, i) => {
        row.style.background = i === highlighted ? 'rgba(59,130,246,.10)' : 'white';
      });
      const target = list.querySelector(`[data-picker-idx="${highlighted}"]`);
      if (target) target.scrollIntoView({ block: 'nearest' });
    }

    function selectAt(idx) {
      const item = filtered[idx];
      if (!item) return;
      try { onSelect(item); } finally { closeSearchPicker(); }
    }

    // Bindings
    const input = dialog.querySelector('[data-picker-search]');
    input.addEventListener('input', (e) => renderList(e.target.value));
    input.addEventListener('keydown', (e) => {
      const max = Math.min(filtered.length, maxVisible);
      if (e.key === 'Escape')         { closeSearchPicker(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); highlighted = Math.min(highlighted + 1, max - 1); paintHighlight(); }
      else if (e.key === 'ArrowUp')   { e.preventDefault(); highlighted = Math.max(highlighted - 1, 0);       paintHighlight(); }
      else if (e.key === 'Enter')     { e.preventDefault(); selectAt(highlighted); }
    });

    list.addEventListener('click', (e) => {
      const row = e.target.closest('[data-picker-idx]');
      if (!row) return;
      selectAt(parseInt(row.dataset.pickerIdx, 10));
    });
    list.addEventListener('mousemove', (e) => {
      const row = e.target.closest('[data-picker-idx]');
      if (!row) return;
      const idx = parseInt(row.dataset.pickerIdx, 10);
      if (idx !== highlighted) { highlighted = idx; paintHighlight(); }
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeSearchPicker();
    });
    dialog.querySelector('[data-picker-close]').addEventListener('click', closeSearchPicker);

    renderList('');
    setTimeout(() => input.focus(), 30);
  }

  function closeSearchPicker() {
    if (_pickerEl && _pickerEl.parentNode) {
      _pickerEl.parentNode.removeChild(_pickerEl);
    }
    _pickerEl = null;
  }

  window.KoguUi = {
    money, int, fmtDate, escapeHtml, statusBadge, cardStat, queryParams, parseBool, withLoading,
    openSearchPicker, closeSearchPicker,
  };
})();
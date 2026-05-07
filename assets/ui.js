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

  window.KoguUi = { money, int, fmtDate, escapeHtml, statusBadge, cardStat, queryParams, parseBool, withLoading };
})();
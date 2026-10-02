/* KOGU · I+D (idp_) — lógica compartida del front.
 * Parte pura (probada con node --test tests/idp-comun.test.mjs) + ayudas de
 * navegador (modal, descarga con sesión). En el navegador queda en window.KoguIdp.
 */
(function (root) {
  const BASE = '/protected/idp';

  // ── Fases del ciclo (stepper de 5 pasos sobre los estados del catálogo) ──
  const FASES = ['Alta', 'Autorización', 'Desarrollo', 'Cliente', 'Cierre'];
  const FASE_POR_ESTADO = {
    generado: 0, rechazado: 0,
    autorizado: 1, asignado: 1,
    en_desarrollo: 2, muestra_entregada: 2, reformular: 2, remuestreo: 2,
    enviado_cliente: 3, hold: 3, aprobado: 3, no_aprobado: 3, recotizar: 3, prueba_piloto: 3,
    finalizado: 4, cancelado: 4,
  };
  function faseDe(clave, categoria) {
    if (clave in FASE_POR_ESTADO) return FASE_POR_ESTADO[clave];
    if (categoria === 'inicial') return 0;
    if (categoria === 'cierre' || categoria === 'cancelado') return 4;
    return null;   // estado propio de la empresa sin fase conocida: el stepper no marca avance
  }

  // ── Color del chip de estado ──
  function colorEstado(clave, categoria) {
    if (clave === 'aprobado' || categoria === 'cierre') return '#16a34a';
    if (clave === 'no_aprobado' || clave === 'rechazado') return '#dc2626';
    if (clave === 'hold') return '#ca8a04';
    if (categoria === 'cancelado') return '#991b1b';
    if (categoria === 'inicial') return '#64748b';
    return '#2563eb';
  }
  const COLOR_POTENCIAL = { A: '#16a34a', B: '#2563eb', C: '#64748b' };

  // ── Cambio de estado: qué pedir, validar y qué enviar ──
  function camposTransicion(accion, catalogo) {
    const rq = (accion && accion.requiere) || {};
    const motivos = rq.motivo
      ? ((catalogo && catalogo.motivos) || []).filter((m) => m.activo !== false && m.tipo === rq.motivo)
      : null;
    return {
      motivos,
      desarrolladores: rq.desarrollador ? ((catalogo && catalogo.desarrolladores) || []) : null,
      pideCierre: !!rq.cierre_vendido,
    };
  }
  function validarTransicion(campos, v) {
    v = v || {};
    if (campos.motivos && !v.motivo_id) return 'Selecciona el motivo.';
    if (campos.desarrolladores && !v.desarrollador_id) return 'Selecciona el desarrollador.';
    if (campos.pideCierre && !['si', 'no'].includes(v.cierre_vendido)) return 'Indica si el proyecto se vendió.';
    return null;
  }
  function cuerpoTransicion(accion, v) {
    v = v || {};
    const rq = accion.requiere || {};
    const b = { a: accion.a };
    if (rq.motivo && v.motivo_id) b.motivo_id = v.motivo_id;
    if (rq.desarrollador && v.desarrollador_id) b.desarrollador_id = v.desarrollador_id;
    if (rq.cierre_vendido && ['si', 'no'].includes(v.cierre_vendido)) b.cierre_vendido = v.cierre_vendido === 'si';
    const c = String(v.comentario || '').trim();
    if (c) b.comentario = c;
    return b;
  }

  // ── Estancado ──
  const DIA = 86400000;
  function diasSinMovimiento(fechaIso, hoy) {
    if (!fechaIso) return null;
    const h = hoy ? new Date(String(hoy).slice(0, 10) + 'T00:00:00Z') : new Date();
    const d = new Date(String(fechaIso).slice(0, 10) + 'T00:00:00Z');
    return Math.floor((h - d) / DIA);
  }
  function estancado(p, hoy, umbral) {
    if (!p || ['cierre', 'cancelado'].includes(p.estado_categoria)) return false;
    const d = diasSinMovimiento(p.ultimo_evento_at || p.created_at, hoy);
    return d != null && d >= (umbral || 90);
  }

  // ── Formatos ──
  function fmtUsd(n) {
    if (n === null || n === undefined || n === '' || !Number.isFinite(Number(n))) return '—';
    return 'USD ' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
  }
  function fmtNum(n, dec) {
    if (n === null || n === undefined || n === '') return '—';
    return Number(n).toLocaleString('es-MX', { maximumFractionDigits: dec == null ? 2 : dec });
  }

  const api = { BASE, FASES, faseDe, colorEstado, COLOR_POTENCIAL, camposTransicion, validarTransicion, cuerpoTransicion,
    diasSinMovimiento, estancado, fmtUsd, fmtNum };

  // ── Solo navegador ──
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
    api.esc = esc;

    api.chipEstado = (clave, nombre, categoria) => {
      const c = colorEstado(clave, categoria);
      return `<span class="chip" style="background:${c}1a;color:${c};border:1px solid ${c}55">${esc(nombre || clave)}</span>`;
    };
    api.chipPotencial = (p) => {
      if (!p) return '<span class="muted">—</span>';
      const c = COLOR_POTENCIAL[p] || '#64748b';
      return `<span class="chip" style="background:${c}1a;color:${c};border:1px solid ${c}55;font-weight:700">${esc(p)}</span>`;
    };
    api.chipProspecto = (estatus) => (estatus === 'prospecto'
      ? '<span class="chip" style="background:#7c3aed1a;color:#7c3aed;border:1px solid #7c3aed55">prospecto</span>' : '');

    // Modal sencillo: devuelve { el, close }. onSubmit(el) puede lanzar para no cerrar.
    api.modal = ({ eyebrow, titulo, cuerpo, aceptar = 'Guardar', ancho = 560, onSubmit }) => {
      const id = 'idpModal' + Date.now();
      document.body.insertAdjacentHTML('beforeend', `
        <div id="${id}" style="position:fixed;inset:0;z-index:9999;background:rgba(15,23,42,.55);display:flex;justify-content:center;align-items:flex-start;overflow:auto;padding:40px 16px">
          <div style="background:var(--panel,#fff);border-radius:16px;max-width:${ancho}px;width:100%;box-shadow:0 24px 70px rgba(0,0,0,.3);overflow:hidden">
            <div style="padding:18px 22px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;gap:16px">
              <div>${eyebrow ? `<div class="eyebrow">${esc(eyebrow)}</div>` : ''}<h2 style="margin:4px 0 0;font-size:20px">${esc(titulo)}</h2></div>
              <button class="btn" data-x>✕</button>
            </div>
            <div style="padding:18px 22px;display:flex;flex-direction:column;gap:14px" data-body>${cuerpo}</div>
            <div style="padding:14px 22px;border-top:1px solid var(--line);display:flex;gap:8px;justify-content:flex-end">
              <button class="btn" data-x>Cancelar</button>
              ${onSubmit ? `<button class="btn primary" data-ok>${esc(aceptar)}</button>` : ''}
            </div>
          </div>
        </div>`);
      const el = document.getElementById(id);
      const close = () => el.remove();
      el.querySelectorAll('[data-x]').forEach((b) => (b.onclick = close));
      el.onclick = (e) => { if (e.target === el) close(); };
      const ok = el.querySelector('[data-ok]');
      if (ok) ok.onclick = () => KoguUi.withLoading(ok, async () => { await onSubmit(el); close(); }, 'Guardando…').catch(() => {});
      const f = el.querySelector('[data-body] input, [data-body] select, [data-body] textarea');
      if (f) setTimeout(() => f.focus(), 30);
      return { el, close };
    };

    // Descarga (o abre) un archivo protegido usando la sesión.
    api.descargar = async (path, { abrir = false, nombre = 'archivo' } = {}) => {
      const res = await KoguApi.authFetchRaw(path);
      if (!res.ok) { KoguApi.toast('No se pudo obtener el archivo.', 'error'); return; }
      const blob = await res.blob();
      const cd = res.headers.get('Content-Disposition') || '';
      const m = cd.match(/filename\*=UTF-8''([^;]+)/) || cd.match(/filename="?([^";]+)"?/);
      const url = URL.createObjectURL(blob);
      if (abrir) { window.open(url, '_blank'); }
      else {
        const a = document.createElement('a');
        a.href = url; a.download = m ? decodeURIComponent(m[1]) : nombre;
        document.body.appendChild(a); a.click(); a.remove();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    };

    api.mensajeError = (err) => err?.message || 'Ocurrió un error.';
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KoguIdp = api;
})(typeof window !== 'undefined' ? window : globalThis);

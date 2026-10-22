/* KOGU · Clientes — pestaña Cobranza y contactos (F0 del módulo de cobranza).
 * Parte pura, probada con tests/clientes-cobranza.test.mjs.
 * En el navegador queda en window.KoguClientesCobranza.
 */
(function (root) {
  const DIAS = ['lu', 'ma', 'mi', 'ju', 'vi', 'sa', 'do'];

  const CAMPOS_SELECT = ['condicion_pago', 'moneda_limite', 'tipo_fecha', 'envio_edo_cta', 'responsable_cobranza_id'];
  const CAMPOS_TEXTO = ['url_portal_facturas', 'usuario_portal_fact', 'url_portal_pagos', 'usuario_portal_pago',
    'plataforma_factoraje', 'hora_revision_ini', 'hora_revision_fin', 'hora_cobro_ini', 'hora_cobro_fin'];
  const CAMPOS_NUM = ['dias_credito', 'limite_credito'];
  const CAMPOS_BOOL = [...DIAS.map((d) => 'rev_' + d), ...DIAS.map((d) => 'cob_' + d),
    'usa_portal_facturas', 'usa_portal_pagos', 'cobro_factoraje'];
  const PASS = { fact: 'pass_portal_fact', pago: 'pass_portal_pago' };

  // Defaults de la tabla: un cliente nuevo se compara contra esto.
  const CLIENTE_VACIO = {
    condicion_pago: 'contado', moneda_limite: 'MXN', tipo_fecha: 'factura', envio_edo_cta: 'no_aplica',
    responsable_cobranza_id: null, dias_credito: null, limite_credito: null,
    bloqueo_credito: false, bloqueo_motivo: null,
  };

  const ROLES = {
    cobranza: 'Cobranza', pagos: 'Pagos', cxp: 'Cuentas por pagar del cliente',
    comercial: 'Comercial', facturacion: 'Facturación', otro: 'Otro',
  };
  const ENVIO_EDO_CTA = { no_aplica: 'No aplica', manual: 'Manual (se revisa antes de enviar)', automatico: 'Automático' };

  const txt = (v) => (v == null ? '' : String(v).trim());
  const nul = (v) => txt(v) || null;
  const hora = (v) => (txt(v) ? txt(v).slice(0, 5) : null);   // pg time '09:00:00' → '09:00'
  const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function numero(v, etiqueta, { entero = false } = {}) {
    const s = txt(v).replace(/,/g, '');
    if (!s) return null;
    const n = Number(s);
    if (!Number.isFinite(n) || n < 0 || (entero && !Number.isInteger(n))) {
      throw new Error(`${etiqueta}: escribe un número ${entero ? 'entero ' : ''}mayor o igual a cero.`);
    }
    return n;
  }

  // Lo que el formulario muestra para un cliente. La contraseña nunca se precarga.
  function formDesdeCliente(row) {
    const r = { ...CLIENTE_VACIO, ...(row || {}) };
    const f = {};
    for (const k of CAMPOS_SELECT) f[k] = txt(r[k]);
    for (const k of CAMPOS_TEXTO) f[k] = k.startsWith('hora_') ? (hora(r[k]) || '') : txt(r[k]);
    for (const k of CAMPOS_NUM) f[k] = r[k] == null ? '' : String(Number(r[k]));
    for (const k of CAMPOS_BOOL) f[k] = !!r[k];
    f.bloqueo_credito = !!r.bloqueo_credito;
    f.bloqueo_motivo = txt(r.bloqueo_motivo);
    for (const p of Object.values(PASS)) { f[p] = ''; f['borrar_' + p] = false; }
    return f;
  }

  // Cuerpo del PUT/POST: solo lo que cambió. null si no cambió nada.
  function cuerpoCobranza(original, form) {
    const o = { ...CLIENTE_VACIO, ...(original || {}) };
    const out = {};
    for (const k of CAMPOS_SELECT) {
      const v = nul(form[k]);
      if (v !== nul(o[k])) out[k] = v;
    }
    for (const k of CAMPOS_TEXTO) {
      const v = k.startsWith('hora_') ? hora(form[k]) : nul(form[k]);
      const antes = k.startsWith('hora_') ? hora(o[k]) : nul(o[k]);
      if (v !== antes) out[k] = v;
    }
    const dias = numero(form.dias_credito, 'Días de crédito', { entero: true });
    if (dias !== (o.dias_credito == null ? null : Number(o.dias_credito))) out.dias_credito = dias;
    const limite = numero(form.limite_credito, 'Límite de crédito');
    if (limite !== (o.limite_credito == null ? null : Number(o.limite_credito))) out.limite_credito = limite;
    for (const k of CAMPOS_BOOL) if (!!form[k] !== !!o[k]) out[k] = !!form[k];

    // Bloqueo: motivo obligatorio; desbloquear solo manda false (el servidor limpia).
    if (form.bloqueo_credito) {
      const motivo = txt(form.bloqueo_motivo);
      if (!motivo) throw new Error('Para bloquear el crédito escribe el motivo.');
      if (!o.bloqueo_credito || motivo !== txt(o.bloqueo_motivo)) {
        out.bloqueo_credito = true;
        out.bloqueo_motivo = motivo;
      }
    } else if (o.bloqueo_credito) {
      out.bloqueo_credito = false;
    }

    for (const p of Object.values(PASS)) {
      if (form['borrar_' + p]) out['borrar_' + p] = true;
      else if (txt(form[p])) out[p] = txt(form[p]);
    }
    return Object.keys(out).length ? out : null;
  }

  function estadoPass(row, cual) {
    return row && row['tiene_' + PASS[cual]] ? 'Hay una contraseña guardada' : 'Sin contraseña';
  }

  function cuerpoContacto(f) {
    const nombre = txt(f.nombre);
    if (!nombre) throw new Error('El nombre del contacto es obligatorio.');
    const email = txt(f.email).toLowerCase() || null;
    if (email && !RE_EMAIL.test(email)) throw new Error('El email del contacto no tiene un formato válido.');
    if (f.recibe_edo_cta && !email) throw new Error('Para recibir estado de cuenta el contacto necesita email.');
    return {
      nombre, rol: txt(f.rol) || 'cobranza', email,
      telefono: nul(f.telefono), whatsapp: nul(f.whatsapp), puesto: nul(f.puesto),
      recibe_edo_cta: !!f.recibe_edo_cta, principal: !!f.principal,
    };
  }

  // ── Encabezado de la ficha ──────────────────────────────────────────────
  const fmtMonto = (v) => new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 }).format(Number(v));
  const ENVIO_CORTO = { no_aplica: 'No aplica', manual: 'Manual', automatico: 'Automático' };

  function textoCredito(r) {
    if (r.condicion_pago === 'credito') return r.dias_credito != null && r.dias_credito !== '' ? `${Number(r.dias_credito)} días` : 'Sin días';
    return r.condicion_pago === 'anticipado' ? 'Anticipado' : 'Contado';
  }

  // Chips del encabezado: [{ txt, tono }] con tono ok | info | warn | bad | neutro.
  function chipsCliente(r = {}) {
    const out = [];
    if (txt(r.cve_cte)) out.push({ txt: 'SAI ' + txt(r.cve_cte), tono: 'neutro' });
    if (r.activo === false) out.push({ txt: 'Inactivo', tono: 'neutro' });
    if (r.condicion_pago === 'credito') out.push({ txt: r.dias_credito ? `Crédito ${Number(r.dias_credito)} días` : 'Crédito', tono: 'info' });
    else out.push({ txt: r.condicion_pago === 'anticipado' ? 'Anticipado' : 'Contado', tono: 'neutro' });
    if (r.cobro_factoraje) out.push({ txt: 'Factoraje', tono: 'warn' });
    if (r.envio_edo_cta === 'manual' || r.envio_edo_cta === 'automatico') {
      out.push({ txt: 'Estado de cuenta ' + ENVIO_CORTO[r.envio_edo_cta].toLowerCase(), tono: 'info' });
    }
    if (r.bloqueo_credito) out.push({ txt: 'Crédito bloqueado', tono: 'bad' });
    return out;
  }

  function metricasCliente(r = {}, nContactos = 0) {
    return [
      { l: 'Crédito', v: textoCredito(r) },
      { l: 'Límite', v: r.limite_credito != null && r.limite_credito !== '' ? `$${fmtMonto(r.limite_credito)} ${r.moneda_limite || 'MXN'}` : '—' },
      { l: 'Plazo desde', v: r.tipo_fecha === 'revision' ? 'Revisión' : 'Factura' },
      { l: 'Estado de cuenta', v: ENVIO_CORTO[r.envio_edo_cta] || 'No aplica' },
      { l: 'Contactos', v: String(nContactos || 0) },
    ];
  }

  const api = {
    DIAS, CAMPOS_SELECT, CAMPOS_TEXTO, CAMPOS_NUM, CAMPOS_BOOL, PASS, CLIENTE_VACIO, ROLES, ENVIO_EDO_CTA,
    formDesdeCliente, cuerpoCobranza, estadoPass, cuerpoContacto, chipsCliente, metricasCliente,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KoguClientesCobranza = api;
})(typeof window !== 'undefined' ? window : globalThis);

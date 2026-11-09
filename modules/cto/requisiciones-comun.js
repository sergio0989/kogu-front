/*
 * modules/cto/requisiciones-comun.js — Costo · Precios de requisiciones.
 * ESQUELETO (regla §16: tests/cto-requisiciones-comun.test.mjs primero en rojo).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CtoReq = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const NI = (f) => () => { throw new Error(`CtoReq.${f}: no implementado`); };
  return {
    PASOS: [], etiquetaTipo: NI('etiquetaTipo'), etiquetasAvisos: NI('etiquetasAvisos'), etiquetaStatus: NI('etiquetaStatus'),
    resumen: NI('resumen'), faltanParaAprobar: NI('faltanParaAprobar'), abierta: NI('abierta'),
    numDelArchivo: NI('numDelArchivo'), numDelTitulo: NI('numDelTitulo'), contarPartidas: NI('contarPartidas'),
    validarEdicion: NI('validarEdicion'), fmtPrecio: NI('fmtPrecio'), fmtIva: NI('fmtIva'), entrada: NI('entrada'),
    ivaDeTexto: NI('ivaDeTexto'),
  };
});

// ============================================================
// tests/cob-config-render.test.mjs
// Cobranza · Configuración de la empresa (solo administradores, cob.config.manage).
// Regla §16: escrita antes de la pantalla y mostrada fallando.
// Caso real 30-oct-2026, Jaqueline (CxC Adegermex): los clientes deben mandar sus
// comprobantes de pago a contabilidadcxc@ y auxiliarcxc@adegermex.com.mx. Se
// capturan aquí (no en el código) y salen al final del estado de cuenta.
//   GET /protected/cob/config  → { correos_pagos: [], telefono_pagos: null }
//   PUT /protected/cob/config  { correos_pagos: [...], telefono_pagos }
// Se corre con: node --test tests/cob-config-render.test.mjs
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import fs from 'node:fs';

const JS = fs.readFileSync(new URL('../modules/cob/config/config.js', import.meta.url), 'utf8');
const CXC = ['contabilidadcxc@adegermex.com.mx', 'auxiliarcxc@adegermex.com.mx'];
const err = (status, code, message) => Object.assign(new Error(message), { status, code });

async function arranca({ inicial = { correos_pagos: [], telefono_pagos: null }, falla = null } = {}) {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div></body></html>',
    { url: 'https://kogu.test/modules/cob/config/config.html', runScripts: 'outside-only' });
  const { window } = dom;
  const pedidos = []; const toasts = [];
  let guardado = { ...inicial };
  let alCambiarEmpresa = null;
  window.KoguShell = {
    initShell: async (o) => {
      window.__init = o;
      const d = window.document.createElement('div'); d.id = 'pageContent';
      window.document.getElementById('app').appendChild(d);
      return { ok: true, permissions: ['cob.config.manage'] };
    },
    subscribeEmpresaActivaChange: (fn) => { alCambiarEmpresa = fn; },
  };
  window.KoguApi = {
    apiFetch: async (u, o = {}) => {
      const method = o.method || 'GET';
      pedidos.push({ u, method, body: o.body ? JSON.parse(o.body) : null });
      if (u !== '/protected/cob/config') throw new Error('ruta no esperada ' + u);
      if (method === 'PUT') { if (falla) throw falla; guardado = JSON.parse(o.body); return { ok: true, data: guardado }; }
      return { ok: true, data: guardado };
    },
    toast: (m, t) => toasts.push([t, m]),
  };
  window.KoguUi = { escapeHtml: (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') };
  window.eval(JS);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  await new Promise((r) => setTimeout(r, 100));
  const $ = (s) => window.document.querySelector(s);
  const $$ = (s) => [...window.document.querySelectorAll(s)];
  const texto = (el = window.document.getElementById('app')) => el.textContent.replace(/\s+/g, ' ').trim();
  const espera = () => new Promise((r) => setTimeout(r, 50));
  const correos = () => $$('#cobCfgCorreos input').map((i) => i.value);
  const escribir = (el, v) => { el.value = v; el.dispatchEvent(new window.Event('input', { bubbles: true })); };
  const puts = () => pedidos.filter((x) => x.method === 'PUT');
  const cargas0 = pedidos.filter((x) => x.method === 'GET').length;
  const recargas = () => pedidos.filter((x) => x.method === 'GET').length - cargas0;
  return { window, pedidos, toasts, $, $$, texto, espera, correos, escribir, puts, recargas,
    cambiarEmpresa: async () => { await alCambiarEmpresa(); await espera(); } };
}

test('exige cob.config.manage; empresa sin configuración: un renglón vacío y aviso de que el PDF no lleva la línea', async () => {
  const p = await arranca();
  assert.equal(p.window.__init.requiredPermission, 'cob.config.manage');
  assert.equal(p.window.__init.currentPage, '/modules/cob/config/config.html');
  assert.deepEqual(p.correos(), ['']);
  assert.equal(p.$('#cobCfgTel').value, '');
  assert.match(p.texto(p.$('#cobCfgVista')), /sin correos|no lleva/i);
});

test('captura los dos correos de CxC, ve cómo sale en el estado de cuenta y guarda', async () => {
  const p = await arranca();
  p.escribir(p.$('#cobCfgCorreos input'), ' ContabilidadCxC@adegermex.com.mx ');
  p.$('#cobCfgAgregar').click();
  p.escribir(p.$$('#cobCfgCorreos input')[1], 'auxiliarcxc@adegermex.com.mx');
  assert.match(p.texto(p.$('#cobCfgVista')), /Envíe sus comprobantes de pago a: contabilidadcxc@adegermex\.com\.mx, auxiliarcxc@adegermex\.com\.mx/);
  p.$('#cobCfgGuardar').click(); await p.espera();
  assert.deepEqual(p.puts().map((x) => x.body), [{ correos_pagos: CXC, telefono_pagos: null }]);
  assert.ok(p.toasts.some(([t, m]) => t === 'success' && /guard/i.test(m)));
});

test('muestra lo guardado; quitar un correo y agregar teléfono', async () => {
  const p = await arranca({ inicial: { correos_pagos: CXC, telefono_pagos: null } });
  assert.deepEqual(p.correos(), CXC);
  p.$$('#cobCfgCorreos [data-quitar]')[1].click();
  assert.deepEqual(p.correos(), [CXC[0]]);
  p.escribir(p.$('#cobCfgTel'), '81 1234 5678');
  assert.match(p.texto(p.$('#cobCfgVista')), /contabilidadcxc@adegermex\.com\.mx · Tel\. 81 1234 5678/);
  p.$('#cobCfgGuardar').click(); await p.espera();
  assert.deepEqual(p.puts().at(-1).body, { correos_pagos: [CXC[0]], telefono_pagos: '81 1234 5678' });
});

test('correo mal escrito: avisa en pantalla y no manda nada', async () => {
  const p = await arranca();
  p.escribir(p.$('#cobCfgCorreos input'), 'auxiliarcxc@adegermex');
  p.$('#cobCfgGuardar').click(); await p.espera();
  assert.equal(p.puts().length, 0);
  assert.match(p.texto(p.$('#cobCfgMsg')), /auxiliarcxc@adegermex.*no es válido/);
});

test('máximo 5 correos: el botón Agregar se desactiva', async () => {
  const p = await arranca({ inicial: { correos_pagos: ['a', 'b', 'c', 'd'].map((x) => `${x}@adegermex.com.mx`), telefono_pagos: null } });
  assert.equal(p.$('#cobCfgAgregar').disabled, false);
  p.$('#cobCfgAgregar').click();
  assert.equal(p.correos().length, 5);
  assert.equal(p.$('#cobCfgAgregar').disabled, true);
});

test('error del servidor (400): se muestra el mensaje en pantalla', async () => {
  const p = await arranca({ falla: err(400, 'COB_CONFIG_CORREO', 'El correo "x@y" no es válido.') });
  p.escribir(p.$('#cobCfgCorreos input'), CXC[0]);
  p.$('#cobCfgGuardar').click(); await p.espera();
  assert.match(p.texto(p.$('#cobCfgMsg')), /no es válido/);
  assert.ok(p.toasts.some(([t]) => t === 'error'));
});

test('cambio de empresa: limpia y vuelve a cargar la configuración de la nueva', async () => {
  const p = await arranca({ inicial: { correos_pagos: CXC, telefono_pagos: null } });
  await p.cambiarEmpresa();
  assert.equal(p.recargas(), 1);
  assert.deepEqual(p.correos(), CXC);
});

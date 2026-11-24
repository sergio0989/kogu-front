// ============================================================
// tests/cfdi-validador-xml-chips.test.mjs
// CFDI · Validador XML (y todo el semaforo fiscal CFDI) — colores de chip.
// Regla §16.4: escrita antes del cambio y mostrada fallando.
// Caso real (auditoria CFDI 11-sep-2026, confirmado 24-nov-2026): validador,
// bandeja y detalle pintan <span class="chip success|warn|danger">, pero
// styles.css solo define .chip (azul). COINCIDE, CON DIFERENCIAS e INVALIDO
// se ven iguales.
// Se corre con: cd tests && node cfdi-validador-xml-chips.test.mjs
// ============================================================
import fs from 'node:fs';
import assert from 'node:assert/strict';

const css = fs.readFileSync(new URL('../assets/styles.css', import.meta.url), 'utf8');
const rojo = [];
for (const [cls, token] of [['success', '--success'], ['warn', '--warn'], ['danger', '--danger']]) {
  const re = new RegExp(`\\.chip\\.${cls}\\s*\\{[^}]*var\\(${token}\\)`);
  try { assert.match(css, re); console.log(`ok   .chip.${cls} usa var(${token})`); }
  catch { rojo.push(cls); console.log(`FAIL .chip.${cls} no existe o no usa var(${token})`); }
}
if (rojo.length) { console.log(`\n${rojo.length} en rojo`); process.exit(1); }
console.log('\ntodo en verde');

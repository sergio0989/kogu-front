// ============================================================
// tests/crm-kpis-render.test.mjs
// CRM · pantalla de KPIs de actividades (minuta 14-oct, punto 2).
//
// Regla §16.4: escrita antes de la pantalla y mostrada fallando.
//
// Lo que esta prueba defiende no es el pixel, es la honestidad de los
// numeros: que el volumen nunca aparezca como un total unico (la deriva
// mide 12 meses y la caida un bimestre), que la cubeta "sin motivo" se
// explique en vez de esconderse, y que la palabra "mediana" no se
// convierta en "promedio" sin que nadie se entere.
// ============================================================
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const verde = [];
const rojo = [];
const check = async (n, f) => {
  try { await f(); verde.push(n); }
  catch (e) { rojo.push([n, String(e.message).split('\n')[0]]); }
};

const ARCHIVO = new URL('../modules/crm/kpis.js', import.meta.url).pathname;

// Payload con la forma real que devuelve el servicio (14 casos en verde
// en qa/crm-actividades-kpis.test.mjs).
const CON_DATOS = {
  periodo: { desde: '2026-08-01', hasta: '2026-10-15', hoy: '2026-10-15' },
  creadas: { total: 9, por_origen: { 'mi-panel': 8, manual: 1 } },
  pendiente: { abiertas: 3, en_proceso: 1, vencidas: 1 },
  cierre: { cerradas: 4, canceladas: 1, tasa_cierre: 0.4444 },
  desenlace: { aumento: 1, estable: 0, disminucion: 1, baja_temporal: 0,
               baja_total: 1, nuevo_cliente: 0, spot: 0, seguimiento: 0,
               no_aplica: 0, completada: 1 },
  filtro: { periodo: null, solo_con_periodo: false, agente_id: null, origen: null, severidad: null },
  vigencia: { cerradas_a_tiempo: 3, pct_a_tiempo: 0.75, dias_mediana_cierre: 7, dias_mediana_tomar: 1 },
  volumen: {
    caida_dormancia: { kg: 2067, mxn: 330998.90, actividades: 5, en_cero: 2 },
    deriva:          { kg: 2500, mxn: 250000, actividades: 2, en_cero: 0 },
    sin_motivo:      { kg: 0, mxn: 0, actividades: 1, en_cero: 1 },
  },
};

// Todo limpio: ninguna actividad en cero, ninguna sin motivo.
const LIMPIO = {
  ...CON_DATOS,
  pendiente: { abiertas: 3, en_proceso: 1, vencidas: 0 },
  cierre: { cerradas: 8, canceladas: 0, tasa_cierre: 0.8889 },
  vigencia: { cerradas_a_tiempo: 8, pct_a_tiempo: 0.95, dias_mediana_cierre: 3, dias_mediana_tomar: 1 },
  volumen: {
    caida_dormancia: { kg: 2067, mxn: 330998.90, actividades: 3, en_cero: 0 },
    deriva:          { kg: 2500, mxn: 250000, actividades: 2, en_cero: 0 },
    sin_motivo:      { kg: 0, mxn: 0, actividades: 0, en_cero: 0 },
  },
};

// Recorte con agente y mes puestos, como lo devuelve el servicio.
const CON_RECORTE = {
  ...CON_DATOS,
  filtro: { periodo: '2026-09', solo_con_periodo: true, agente_id: 'ag-1',
            origen: 'mi-panel', severidad: null },
};

// Nada cerrado todavia: decir "0 en aumento" da a entender que se cerraron
// y ninguna aumento, que es distinto.
const SIN_CIERRES = {
  ...CON_DATOS,
  cierre: { cerradas: 0, canceladas: 0, tasa_cierre: 0 },
  desenlace: { aumento: 0, estable: 0, disminucion: 0, baja_temporal: 0,
               baja_total: 0, nuevo_cliente: 0, spot: 0, seguimiento: 0,
               no_aplica: 0, completada: 0 },
};

const CON_PERIODO = {
  ...CON_DATOS,
  filtro: { periodo: '2026-09', solo_con_periodo: true, agente_id: null, origen: null, severidad: null },
};

const SIN_MOTIVO_VACIO = {
  ...CON_DATOS,
  volumen: { ...CON_DATOS.volumen, sin_motivo: { kg: 0, mxn: 0, actividades: 0 } },
};

const VACIO = {
  periodo: { desde: '2026-01-01', hasta: '2026-01-31', hoy: '2026-10-15' },
  creadas: { total: 0, por_origen: {} },
  pendiente: { abiertas: 0, en_proceso: 0, vencidas: 0 },
  cierre: { cerradas: 0, canceladas: 0, tasa_cierre: 0 },
  desenlace: { recuperado: 0, parcial: 0, perdido: 0, no_aplica: 0, completada: 0 },
  vigencia: { cerradas_a_tiempo: 0, pct_a_tiempo: null, dias_mediana_cierre: null, dias_mediana_tomar: null },
  volumen: {
    caida_dormancia: { kg: 0, mxn: 0, actividades: 0 },
    deriva: { kg: 0, mxn: 0, actividades: 0 },
    sin_motivo: { kg: 0, mxn: 0, actividades: 0 },
  },
};

async function arranca(cuerpo = CON_DATOS) {
  const js = fs.readFileSync(ARCHIVO, 'utf8');
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div></body></html>',
    { url: 'https://kogu.test/modules/crm/kpis.html', runScripts: 'outside-only' });
  const { window } = dom;
  await new Promise((r) => {
    if (window.document.readyState === 'complete') return r();
    window.addEventListener('load', r);
    setTimeout(r, 500);
  });
  const pedidos = [];
  let actual = cuerpo;
  window.KoguShell = {
    initShell: async () => {
      const d = window.document.createElement('div');
      d.id = 'pageContent';
      window.document.getElementById('app').appendChild(d);
      return { ok: true, permisos: ['crm.actividades.read', 'crm.actividades.admin'] };
    },
    hasPerm: () => true,
    subscribeEmpresaActivaChange: () => {},
  };
  window.KoguApi = {
    apiFetch: async (url) => {
      pedidos.push(url);
      if (url.includes('/agentes')) {
        return { ok: true, data: { rows: [{ agente_id: 'ag-1', agente_nombre: 'ALEJANDRA GONZALEZ' }] } };
      }
      return { ok: true, data: actual };
    },
    toast: () => {},
    withLoading: async (el, fn) => fn(),
  };
  window.KoguUi = {
    escapeHtml: (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    money: (v) => '$' + Number(v || 0).toLocaleString('es-MX', { maximumFractionDigits: 2 }),
    fmtDate: (v) => String(v),
    fmtDateOnly: (v) => String(v),
    withLoading: async (el, fn) => fn(),
  };
  window.eval(js);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  await new Promise((r) => setTimeout(r, 400));
  const texto = () => window.document.getElementById('app').textContent.replace(/\s+/g, ' ');
  return { window, pedidos, texto, setCuerpo: (c) => { actual = c; } };
}

console.log('\n── La honestidad de los numeros ────────────────────────────────');

await check('el volumen se pinta en TRES cubetas separadas', async () => {
  const { texto } = await arranca();
  const t = texto();
  assert.ok(/ca[ií]da|dormancia/i.test(t), 'falta la cubeta de caida/dormancia');
  assert.ok(/deriva|encogi/i.test(t), 'falta la cubeta de deriva');
  assert.ok(/sin motivo/i.test(t), 'falta la cubeta sin motivo');
});

await check('NUNCA aparece el total que mezcla las bases de tiempo', async () => {
  const { texto } = await arranca();
  const t = texto().replace(/[,\s]/g, '');
  assert.ok(!t.includes('4567'), 'aparece 4567: alguien sumo deriva con caida');
});

await check('la cubeta sin motivo viene EXPLICADA, no suelta', async () => {
  const { texto } = await arranca();
  assert.ok(/anteriores|previas|antes de|no registr/i.test(texto()),
    'sin motivo aparece sin decir que son actividades viejas');
});

await check('si no hay actividades sin motivo, la cubeta no estorba', async () => {
  const { texto } = await arranca(SIN_MOTIVO_VACIO);
  assert.ok(!/sin motivo/i.test(texto()), 'pinta una cubeta vacia');
});

await check('dice MEDIANA, no promedio', async () => {
  const { texto } = await arranca();
  const t = texto();
  assert.ok(/mediana/i.test(t), 'no dice mediana');
  assert.ok(!/promedio/i.test(t), 'dice promedio: el dato es mediana');
});

await check('el desenlace es conteo: en ningun lado hay kg recuperados', async () => {
  const { texto } = await arranca();
  const t = texto();
  assert.ok(!/recuperad\w*\s*[:·-]?\s*[\d,.]+\s*kg/i.test(t),
    'hay una cifra de kg pegada a recuperado: monto_riesgo no mide recuperacion');
});

console.log('\n── Los seis indicadores ────────────────────────────────────────');

await check('pide los KPIs al abrir, con un periodo por omision', async () => {
  const { pedidos } = await arranca();
  const p = pedidos.find((u) => u.includes('/actividades/kpis'));
  assert.ok(p, 'no pidio los KPIs');
  assert.ok(/desde=\d{4}-\d{2}-\d{2}/.test(p), 'no mando desde');
  assert.ok(/hasta=\d{4}-\d{2}-\d{2}/.test(p), 'no mando hasta');
});

await check('pinta creadas con su desglose por origen', async () => {
  const { texto } = await arranca();
  const t = texto();
  assert.ok(/\b9\b/.test(t), 'no pinta el total de creadas');
  assert.ok(/mi-panel|Radar/i.test(t), 'no desglosa el origen');
});

await check('pinta el pendiente y destaca las vencidas', async () => {
  const { window, texto } = await arranca();
  assert.ok(/vencid/i.test(texto()), 'no menciona vencidas');
  const html = window.document.getElementById('app').innerHTML;
  assert.ok(/danger|#dc2626/.test(html), 'la vencida no se destaca con color de alarma');
});

await check('la tasa de cierre se pinta como porcentaje legible', async () => {
  const { texto } = await arranca();
  assert.ok(/44\s*%|44\.4\s*%/.test(texto()), 'no convirtio 0.4444 a porcentaje');
});

await check('pinta el desenlace con el vocabulario nuevo', async () => {
  const { texto } = await arranca();
  const t = texto().toLowerCase();
  for (const r of ['aumento', 'disminuci', 'baja total']) {
    assert.ok(t.includes(r), `falta ${r} en el desenlace`);
  }
  for (const r of ['recuperad', 'parcial', 'perdid']) {
    assert.ok(!t.includes(r), `"${r}" sigue apareciendo y quedo retirado`);
  }
});

console.log('\n── Filtros nuevos: agente y mes analizado ──────────────────────');

await check('ofrece un selector de agente, poblado del catalogo de CRM', async () => {
  const { window, pedidos } = await arranca();
  const sel = window.document.getElementById('kpiAgente');
  assert.ok(sel, 'no hay selector de agente');
  assert.ok(pedidos.some((u) => u.includes('/crm/agentes')),
    'no pidio el catalogo de agentes');
  const vals = [...sel.options].map((o) => o.value);
  assert.ok(vals.includes('ag-1'), `no poblo el selector: ${JSON.stringify(vals)}`);
});

await check('elegir un agente vuelve a consultar con ese filtro', async () => {
  const { window, pedidos } = await arranca();
  const sel = window.document.getElementById('kpiAgente');
  sel.value = 'ag-1';
  sel.dispatchEvent(new window.Event('change'));
  await new Promise((r) => setTimeout(r, 200));
  assert.ok(pedidos.some((u) => u.includes('agente_id=ag-1')), 'no mando el agente');
});

await check('ofrece filtrar por el mes de ventas analizado', async () => {
  const { window, pedidos } = await arranca();
  const campo = window.document.getElementById('kpiPeriodo');
  assert.ok(campo, 'no hay filtro de mes analizado');
  campo.value = '2026-09';
  campo.dispatchEvent(new window.Event('change'));
  await new Promise((r) => setTimeout(r, 200));
  assert.ok(pedidos.some((u) => u.includes('periodo=2026-09')), 'no mando el periodo');
});

await check('al filtrar por mes ADVIERTE que deja fuera a las que no lo tienen', async () => {
  const { texto } = await arranca(CON_PERIODO);
  // OJO: "Comex" ya aparece como opcion del selector de origen, asi que
  // buscarla sola daba un verde falso. La asercion pide la frase del aviso.
  const t = texto();
  assert.ok(/deja fuera/i.test(t),
    'no avisa que el filtro deja fuera a las actividades sin periodo');
  assert.ok(/sin periodo|manuales/i.test(t), 'el aviso no dice a cuales deja fuera');
});

await check('sin filtro de mes no advierte nada', async () => {
  const { texto } = await arranca();
  assert.ok(!/deja fuera|quedan fuera/i.test(texto()),
    'advierte cuando no hay filtro de periodo puesto');
});

await check('pinta la disciplina de vigencia en porcentaje y dias', async () => {
  const { texto } = await arranca();
  const t = texto();
  assert.ok(/75\s*%/.test(t), 'no pinta el cumplimiento de vigencia');
  assert.ok(/\b7\b/.test(t), 'no pinta la mediana de dias a cerrar');
});

console.log('\n── El color dice algo, y nunca dice solo ───────────────────────');

// Lo que la pantalla del 15-oct escondia: la cubeta decia "3 actividades ·
// 1,667 kg" y callaba que dos de esas tres valian cero.
await check('cada cubeta delata las actividades que quedaron en cero', async () => {
  const { texto } = await arranca();
  assert.ok(/en cero/i.test(texto()), 'no dice cuantas quedaron en cero');
  assert.ok(/2 de 5|2 en cero/i.test(texto()), 'no dice cuantas de cuantas');
});

await check('si ninguna quedo en cero, no lo menciona', async () => {
  const { texto } = await arranca(LIMPIO);
  assert.ok(!/en cero/i.test(texto()), 'habla de ceros cuando no hay ninguno');
});

await check('las dos cubetas de volumen llevan colores distintos', async () => {
  const { window } = await arranca();
  const html = window.document.getElementById('app').innerHTML;
  assert.ok(html.includes('#0891b2'), 'falta el tono de caida/dormancia');
  assert.ok(html.includes('#6366f1'), 'falta el tono de deriva');
});

await check('vencidas en cero NO se pinta de alarma, y lo dice con palabras', async () => {
  const { window, texto } = await arranca(LIMPIO);
  assert.ok(/al corriente|sin vencidas/i.test(texto()),
    'con cero vencidas no dice que todo esta al corriente');
  // OJO: el DOM trae el rotulo tal cual se escribio; las mayusculas de la
  // pantalla son text-transform. Partir por el texto en mayusculas devolvia
  // vacio y la asercion pasaba sin comprobar nada.
  const html = window.document.getElementById('app').innerHTML;
  const partes = html.split('Vencidas');
  assert.ok(partes.length > 1, 'no se encontro la tarjeta de Vencidas en el DOM');
  const tarjeta = partes[1].slice(0, 400);
  assert.ok(tarjeta.length > 50, 'la tarjeta quedo vacia: la asercion no estaria comprobando nada');
  assert.ok(!/#dc2626/.test(tarjeta), 'pinta de rojo una tarjeta sin vencidas');
});

await check('una tasa de cierre baja se pinta con color de estado', async () => {
  const { window } = await arranca();
  const html = window.document.getElementById('app').innerHTML;
  const partes = html.split('Tasa de cierre');
  assert.ok(partes.length > 1, 'no se encontro la tarjeta de Tasa de cierre en el DOM');
  const tarjeta = partes[1].slice(0, 500);
  assert.ok(tarjeta.length > 50, 'la tarjeta quedo vacia: la asercion no comprobaria nada');
  assert.ok(/#dc2626|#d97706/.test(tarjeta),
    '44% de cierre se pinta igual que 95%: el color no dice nada');
});

await check('el estado nunca viaja solo en color: siempre trae su etiqueta', async () => {
  const { texto } = await arranca();
  const t = texto();
  assert.ok(/exigen acci[oó]n|fuera de vigencia/i.test(t), 'las vencidas no se explican');
  assert.ok(/cerradas de/i.test(t), 'la tasa no dice de cuantas');
});

console.log('\n── El recorte viaja con los numeros ────────────────────────────');

// Observado el 20-oct: al filtrar por agente, el nombre solo vivia en el
// desplegable de arriba. Al hacer scroll —o al tomar una captura— las
// cifras quedaban sin decir de quien son. Mismo criterio que ya aplicamos
// en Consulta de ventas y en el libro de Excel: el contexto acompaña al
// numero, no se queda en el control.
await check('el encabezado de resultados nombra al agente filtrado', async () => {
  const { window, texto } = await arranca(CON_RECORTE);
  // El nombre lo resuelve el front desde su propio catalogo de agentes.
  const cuerpo = (window.document.getElementById('kpiRecorte') || { textContent: '' }).textContent;
  assert.ok(/ALEJANDRA GONZALEZ/i.test(cuerpo),
    `el bloque de resultados no dice de que agente son las cifras: "${cuerpo.slice(0, 120)}"`);
  assert.ok(/agente/i.test(cuerpo), 'no etiqueta que ese nombre es el agente');
});

await check('tambien nombra el mes analizado y el origen', async () => {
  // Contra el renglon del recorte, no contra todo el cuerpo: "2026-09" ya
  // sale en el aviso ambar y "Radar · Mi panel" en el desglose de origen,
  // asi que buscarlos sueltos daba un verde falso.
  const { window } = await arranca(CON_RECORTE);
  const linea = window.document.getElementById('kpiRecorte');
  assert.ok(linea, 'no hay renglon que declare el recorte');
  const t = linea.textContent;
  assert.ok(/sep 2026|2026-09/.test(t), `el recorte no nombra el mes: "${t}"`);
  assert.ok(/Radar|Mi panel/i.test(t), `el recorte no nombra el origen: "${t}"`);
});

await check('sin filtros el encabezado no inventa recortes', async () => {
  const { window } = await arranca();
  const cuerpo = (window.document.getElementById('kpiRecorte') || { textContent: '' }).textContent;
  assert.ok(!/agente:/i.test(cuerpo), 'anuncia un agente cuando no hay ninguno filtrado');
});

await check('los filtros activos salen como chips con forma de quitarlos', async () => {
  const { window } = await arranca(CON_RECORTE);
  const chip = window.document.querySelector('#kpiChips [data-quita]');
  assert.ok(chip, 'no hay chips con los filtros activos');
  const texto = window.document.getElementById('kpiChips').textContent;
  assert.ok(/ALEJANDRA GONZALEZ/i.test(texto), 'el chip no nombra al agente');
});

await check('quitar un chip limpia ese filtro y vuelve a consultar', async () => {
  const { window, pedidos } = await arranca(CON_RECORTE);
  const chip = window.document.querySelector('#kpiChips [data-quita="agente"]');
  assert.ok(chip, 'no hay chip del agente');
  const antes = pedidos.length;
  chip.click();
  await new Promise((r) => setTimeout(r, 200));
  assert.ok(pedidos.length > antes, 'quitar el chip no reconsulto');
  assert.ok(!pedidos[pedidos.length - 1].includes('agente_id='), 'siguio mandando el agente');
});

await check('sin cierres, el desenlace lo dice en vez de "0 en aumento"', async () => {
  const { texto } = await arranca(SIN_CIERRES);
  const t = texto();
  assert.ok(/sin cierres|ninguna cerrada|a[uú]n no/i.test(t),
    'dice "0 en aumento", que da a entender que se cerraron y ninguna aumento');
});

console.log('\n── Filtros y estado vacio ──────────────────────────────────────');

await check('cambiar el origen vuelve a pedir con ese filtro', async () => {
  const { window, pedidos } = await arranca();
  const sel = window.document.getElementById('kpiOrigen');
  assert.ok(sel, 'no hay selector de origen');
  sel.value = 'mi-panel';
  sel.onchange ? sel.onchange({ target: sel }) : sel.dispatchEvent(new window.Event('change'));
  await new Promise((r) => setTimeout(r, 200));
  assert.ok(pedidos.some((u) => u.includes('origen=mi-panel')), 'no mando el filtro de origen');
});

await check('el selector de origen NO ofrece bandeja-riesgo, que nadie produce', async () => {
  const { window } = await arranca();
  const sel = window.document.getElementById('kpiOrigen');
  const vals = Array.from(sel.options).map((o) => o.value);
  assert.ok(!vals.includes('bandeja-riesgo'),
    'ofrece bandeja-riesgo: ninguna pantalla crea actividades con ese origen');
});

await check('sin actividades en el periodo lo dice, no deja tarjetas en blanco', async () => {
  const { texto } = await arranca(VACIO);
  assert.ok(/sin actividades|no hay actividades/i.test(texto()),
    'no explica que el periodo esta vacio');
});

console.log(`\n${'='.repeat(70)}`);
verde.forEach(n => console.log(`  VERDE  ${n}`));
rojo.forEach(([n, m]) => console.log(`  ROJO   ${n}\n           ${m}`));
console.log(`${'='.repeat(70)}`);
console.log(`  ${verde.length} en verde, ${rojo.length} en rojo\n`);
process.exit(rojo.length ? 1 : 0);

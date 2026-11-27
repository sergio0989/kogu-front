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
  detalle: [
    { actividad_id: 'd1', cliente: 'CLIENTE VENCIDO', cliente_ref: '205',
      agente: 'ISELA RODRIGUEZ', titulo: 'Atender vencida', periodo_analizado: '2026-08',
      motivo: 'deriva', motivos: ['deriva'], severidad: 'critica', origen: 'mi-panel',
      kg: 2000, mxn: 200000, estado: 'en_proceso', resultado: null,
      vencida: true, dias_abierta: 75, dias_cierre: null },
    { actividad_id: 'd2', cliente: 'TROPHE INGREDIENTES', cliente_ref: '102',
      agente: 'MARCELA GARZA', titulo: 'Recuperar TROPHE', periodo_analizado: '2026-09',
      motivo: 'caida', motivos: ['caida', 'deriva'], severidad: 'alerta', origen: 'mi-panel',
      kg: 1667, mxn: 290998.9, estado: 'abierta', resultado: null,
      vencida: false, dias_abierta: 5, dias_cierre: null },
    { actividad_id: 'd3', cliente: 'BOCASANO', cliente_ref: '362',
      agente: 'MARCELA GARZA', titulo: 'Recuperar BOCASANO', periodo_analizado: '2026-09',
      motivo: 'sin_compra', motivos: ['sin_compra'], severidad: 'critica', origen: 'mi-panel',
      kg: 0, mxn: 0, estado: 'cerrada', resultado: 'baja_total',
      vencida: false, dias_abierta: null, dias_cierre: 10 },
  ],
  vigencia: { cerradas_a_tiempo: 3, pct_a_tiempo: 0.75, dias_mediana_cierre: 7, dias_mediana_tomar: 1 },
  volumen: {
    caida:      { kg: 1767, mxn: 300998.90, actividades: 2, en_cero: 0, multi_motivo: 1 },
    sin_compra: { kg: 300, mxn: 30000, actividades: 3, en_cero: 2, multi_motivo: 0 },
    deriva:     { kg: 2500, mxn: 250000, actividades: 2, en_cero: 0, multi_motivo: 0 },
    sin_motivo: { kg: 0, mxn: 0, actividades: 1, en_cero: 1, multi_motivo: 0 },
  },
};

// Todo limpio: ninguna actividad en cero, ninguna sin motivo.
const LIMPIO = {
  ...CON_DATOS,
  pendiente: { abiertas: 3, en_proceso: 1, vencidas: 0 },
  cierre: { cerradas: 8, canceladas: 0, tasa_cierre: 0.8889 },
  vigencia: { cerradas_a_tiempo: 8, pct_a_tiempo: 0.95, dias_mediana_cierre: 3, dias_mediana_tomar: 1 },
  volumen: {
    caida:      { kg: 1767, mxn: 300998.90, actividades: 2, en_cero: 0, multi_motivo: 0 },
    sin_compra: { kg: 300, mxn: 30000, actividades: 1, en_cero: 0, multi_motivo: 0 },
    deriva:     { kg: 2500, mxn: 250000, actividades: 2, en_cero: 0, multi_motivo: 0 },
    sin_motivo: { kg: 0, mxn: 0, actividades: 0, en_cero: 0, multi_motivo: 0 },
  },
};

// §16.5 — CASO REAL, dev.kogu.ink/modules/crm/kpis.html el 30-oct-2026:
// una sola actividad creada, cerrada, con desenlace ESTABLE. La tarjeta
// mostraba "0 en aumento" en tipografia grande y "1 estable" en chico: un
// cero grande se lee como "no paso nada", y si paso. Con el vocabulario de
// diez valores, estable, spot o seguimiento son desenlaces legitimos, no
// fracasos, asi que el titular no puede estar clavado en aumento.
const SOLO_ESTABLE = {
  ...CON_DATOS,
  creadas: { total: 1, por_origen: { 'mi-panel': 1 } },
  pendiente: { abiertas: 0, en_proceso: 0, vencidas: 0 },
  cierre: { cerradas: 1, canceladas: 0, tasa_cierre: 1 },
  desenlace: { aumento: 0, estable: 1, disminucion: 0, baja_temporal: 0,
               baja_total: 0, nuevo_cliente: 0, spot: 0, seguimiento: 0,
               no_aplica: 0, completada: 0 },
};

// §16.5 — captura real del 24-nov-2026: la actividad que se abrio desde los
// KPIs, cerrada, critica, con su nota, su bitacora, una seguidora mencionada
// y el snapshot de dos partidas. El contenido es el observado; el cliente y
// el id se alinean con la fila d2 de este fixture para que la prueba hable de
// una sola actividad y no de dos.
const DETALLE = {
  actividad_id: 'd2',
  cliente_ref: '102', cliente_nombre: 'TROPHE INGREDIENTES',
  titulo: 'Recuperar TROPHE INGREDIENTES',
  descripcion: 'Se tuvieron dos productos nuevos para 2026 (Caldo de hueso y ajo 98-U). '
    + 'No se considera un cliente con severidad critica',
  estado: 'cerrada', severidad: 'critica', origen: 'mi-panel',
  agente_id: 'ag-1', agente_nombre: 'ALEJANDRA GONZALEZ GERENTE DE CTA.',
  creada_por_nombre: 'Itzel Paz', tomada_por_nombre: null,
  resultado: 'estable',
  kg_riesgo: 1437, monto_riesgo: 1213068.20,
  periodo_analizado: '2026-10-01',
  created_at: '2026-11-17T16:00:00Z', fecha_limite: '2026-12-02',
  fecha_cierre: '2026-11-17T18:00:00Z',
  snapshot: { base_comparacion: 'yoy',
    periodos: { p1d: '2025-09-01', p1h: '2025-10-01', p2d: '2026-09-01', p2h: '2026-09-30' },
    caida: { cant_p1: 6536, cant_p2: 2000 },
    productos: [
      { cve_prod: 'WWP1211', desc_prod: 'Caldo de hueso de pollo en polvo 3507',
        cant_p1: 3016, cant_p2: 0, importe_p1: 980000, importe_p2: 0 },
      { cve_prod: 'ADE1094', desc_prod: 'Aderome YE Cheese',
        cant_p1: 3520, cant_p2: 2000, importe_p1: 1100000, importe_p2: 640000 },
    ] },
  comentarios: [{ comentario_id: 'c1', autor_nombre: 'Itzel Paz',
                  comentario: '@Mariana Hernandez revisa el caldo de hueso',
                  created_at: '2026-11-17T16:05:00Z', tiene_adjunto: false }],
  recordatorios: [], etiquetas: [],
  seguidores: [{ user_id: 'u-mar', nombre: 'Mariana Hernández' }],
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
    caida: { kg: 0, mxn: 0, actividades: 0 },
    sin_compra: { kg: 0, mxn: 0, actividades: 0 },
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
      const m = url.match(/\/actividades\/([^/?]+)$/);
      if (m) {
        if (m[1] !== DETALLE.actividad_id) {
          const e = new Error('La actividad no existe.'); e.status = 404; throw e;
        }
        return { ok: true, data: DETALLE };
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
    // Como el ui.js real, no mas amables: fmtDateOnly lee la cadena con regex
    // -por eso no corre el dia en UTC-6- y fmtDate si pasa por toLocaleString.
    // Un stub que devuelve la cadena cruda esconde justo lo que se quiere ver.
    fmtDate: (v) => (v ? new Date(v).toLocaleString('es-MX') : '-'),
    fmtDateOnly: (v) => {
      const m = String(v ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
      return m ? `${m[3]}/${m[2]}/${m[1]}` : (v ? new Date(v).toLocaleDateString('es-MX') : '-');
    },
    withLoading: async (el, fn) => fn(),
  };
  window.eval(js);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  await new Promise((r) => setTimeout(r, 400));
  const texto = () => window.document.getElementById('app').textContent.replace(/\s+/g, ' ');
  return { window, pedidos, texto, setCuerpo: (c) => { actual = c; } };
}

console.log('\n── La honestidad de los numeros ────────────────────────────────');

// CAMBIO ACORDADO el 21-oct: tres cubetas de motivo, no dos, y con el
// vocabulario que el vendedor ya lee en Mi panel. "Dormancia" es el nombre
// de la regla RC-004; la pantalla de Mi panel se tomo el trabajo de
// traducirlo a "Sin compra" y esta se habia quedado hablando otro idioma.
await check('el volumen se pinta en TRES cubetas de motivo, mas sin motivo', async () => {
  const { texto } = await arranca();
  const t = texto();
  // Vocabulario del 27-nov (opción A): Caída reciente · Sin compra · Baja sostenida.
  assert.ok(/Ca[ií]da reciente/i.test(t), 'falta la cubeta Caida reciente');
  assert.ok(/Sin compra/i.test(t), 'falta la cubeta Sin compra');
  assert.ok(/Baja sostenida/i.test(t), 'falta la cubeta Baja sostenida');
  assert.ok(!/encogiendo/i.test(t), 'sigue diciendo Encogiendo');
  assert.ok(!/\bEn ca[ií]da\b/i.test(t), 'sigue diciendo En caida');
  assert.ok(/sin motivo/i.test(t), 'falta la cubeta sin motivo');
});

await check('no usa la jerga interna del motor en la pantalla', async () => {
  const { texto } = await arranca();
  assert.ok(!/dormancia/i.test(texto()),
    '"dormancia" es el nombre de la regla, no lo que el vendedor lee');
});

await check('la cubeta avisa cuantas de sus tarjetas traen ademas otro motivo', async () => {
  const { texto } = await arranca();
  assert.match(texto(), /1 de 2[^.]*otro motivo|tambi[eé]n|adem[aá]s/i,
    'la caida se lleva en silencio a un cliente que ademas lleva un anio encogiendo');
});

await check('la tabla muestra los DOS motivos de una tarjeta, no solo uno', async () => {
  const { window } = await arranca();
  const fila = [...window.document.querySelectorAll('#kpiTabla tbody tr')]
    .find((tr) => /TROPHE/.test(tr.textContent));
  assert.ok(fila, 'no encontro la fila de TROPHE');
  assert.match(fila.textContent, /Ca[ií]da reciente/i, 'falta el motivo que nombra la cifra');
  assert.match(fila.textContent, /Baja sostenida/i, 'la tabla oculta que la tarjeta tambien deriva');
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
  assert.ok(/2 de 3|2 en cero/i.test(texto()), 'no dice cuantas de cuantas');
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

console.log('\n── Tabla de detalle (pedido de gerencia) ───────────────────────');

await check('pinta una tabla con una fila por actividad', async () => {
  const { window } = await arranca();
  const filas = window.document.querySelectorAll('#kpiTabla tbody tr');
  assert.equal(filas.length, 3, 'debe haber una fila por actividad');
});

await check('trae las columnas que pidio gerencia', async () => {
  const { window } = await arranca();
  const enc = window.document.querySelector('#kpiTabla thead').textContent.toLowerCase();
  for (const c of ['cliente', 'agente', 'mes', 'motivo', 'riesgo', 'estado', 'resultado']) {
    assert.ok(enc.includes(c), `falta la columna ${c}: "${enc}"`);
  }
});

await check('nombra el resultado en palabras, no en clave', async () => {
  const { window } = await arranca();
  const t = window.document.getElementById('kpiTabla').textContent;
  assert.ok(/Baja total/i.test(t), 'imprime baja_total en crudo');
  assert.ok(!/baja_total/.test(t), 'dejo la clave con guion bajo a la vista');
});

await check('destaca la vencida, que es la que exige accion', async () => {
  const { window } = await arranca();
  const fila = [...window.document.querySelectorAll('#kpiTabla tbody tr')]
    .find((tr) => /CLIENTE VENCIDO/.test(tr.textContent));
  assert.ok(fila, 'no pinto la fila vencida');
  assert.ok(/#dc2626|vencid/i.test(fila.innerHTML), 'no la distingue de las demas');
});

await check('la tabla NO lleva fila de totales', async () => {
  const { window } = await arranca();
  const pie = window.document.querySelector('#kpiTabla tfoot');
  assert.ok(!pie || !pie.textContent.trim(),
    'sumar la columna de kg mezclaria doce meses con un bimestre');
});

await check('los totales por motivo quedan debajo, separados', async () => {
  const { texto } = await arranca();
  const t = texto();
  assert.ok(/Ca[ií]da reciente/i.test(t) && /Sin compra/i.test(t) && /Baja sostenida/i.test(t),
    'se perdieron los totales por motivo');
});

console.log('\n── De la cifra a la conversacion ──────────────────────────────');

// Peticion del 24-nov-2026: desde los KPIs hay que poder abrir la actividad
// para leer la retroalimentacion de todos. El detalle ya existe completo en
// actividades.html; aqui solo se liga. Decidido el mismo dia: el nombre del
// cliente es la liga -no una columna nueva, que la tabla ya se desplaza de
// lado- y abre en la MISMA ventana.
await check('el cliente de cada fila liga a su actividad', async () => {
  const { window } = await arranca();
  const fila = [...window.document.querySelectorAll('#kpiTabla tbody tr')]
    .find((tr) => /TROPHE/.test(tr.textContent));
  assert.ok(fila, 'no encontro la fila de TROPHE');
  const liga = fila.querySelector('a[href]');
  assert.ok(liga, 'el cliente no es una liga');
  assert.match(liga.getAttribute('href'), /actividades\.html\?act=d2$/,
    `la liga apunta a ${liga.getAttribute('href')}`);
});

await check('cada fila liga a SU actividad, no todas a la misma', async () => {
  const { window } = await arranca();
  const hrefs = [...window.document.querySelectorAll('#kpiTabla tbody tr a[href]')]
    .map((a) => a.getAttribute('href'));
  assert.deepEqual(hrefs, [
    '/modules/crm/actividades.html?act=d1',
    '/modules/crm/actividades.html?act=d2',
    '/modules/crm/actividades.html?act=d3',
  ], 'las ligas no corresponden una a una con las filas');
});

await check('abre en la misma ventana, sin dejar pestanas sueltas', async () => {
  const { window } = await arranca();
  const liga = window.document.querySelector('#kpiTabla tbody tr a[href]');
  assert.ok(!liga.getAttribute('target'), 'abre en pestana nueva');
});

await check('el nombre del cliente sigue siendo legible, no un enlace crudo', async () => {
  const { window } = await arranca();
  const liga = [...window.document.querySelectorAll('#kpiTabla tbody tr a[href]')]
    .find((a) => /TROPHE/.test(a.textContent));
  assert.ok(liga, 'el nombre del cliente dejo de estar dentro de la liga');
});

console.log('\n── El desenlace nombra lo que paso ────────────────────────────');

await check('el titular nombra el desenlace que ocurrio, no un cero', async () => {
  const { texto } = await arranca(SOLO_ESTABLE);
  const t = texto();
  assert.match(t, /1 estable/i, 'no nombra el desenlace que si ocurrio');
  assert.ok(!/0 en aumento/i.test(t),
    'un cero en grande se lee como "no paso nada" y si se cerro una actividad');
});

await check('aun asi dice que ninguna termino en aumento', async () => {
  const { texto } = await arranca(SOLO_ESTABLE);
  assert.match(texto(), /ninguna en aumento/i,
    'gerencia pierde de vista el dato que si le importa');
});

await check('cuando el aumento manda, el titular lo dice', async () => {
  const CON_AUMENTO = { ...SOLO_ESTABLE,
    cierre: { cerradas: 3, canceladas: 0, tasa_cierre: 1 },
    desenlace: { ...SOLO_ESTABLE.desenlace, aumento: 2, estable: 1 } };
  const { texto } = await arranca(CON_AUMENTO);
  assert.match(texto(), /2 aumento|2 en aumento/i, 'se perdio el desenlace dominante');
});

await check('sin cierres sigue diciendo que no hay cierres', async () => {
  const { texto } = await arranca(SIN_CIERRES);
  assert.match(texto(), /sin cierres/i, 'inventa un desenlace donde no hay ninguno');
});

console.log('\n── El detalle se lee sin salir de la pantalla ─────────────────');

// Decidido el 24-nov, despues de probarlo navegando: salir de los KPIs corta
// la explicacion y tira el recorte, porque los filtros viven en la pantalla y
// no en la URL. El detalle se abre como modal, de SOLO LECTURA: aqui se lee
// la retroalimentacion, se actua en Actividades.
const abreDetalle = async (window, nombre = 'TROPHE INGREDIENTES') => {
  const liga = [...window.document.querySelectorAll('#kpiTabla tbody tr a[href]')]
    .find((a) => new RegExp(nombre).test(a.textContent));
  assert.ok(liga, `no encontro la liga de ${nombre}`);
  liga.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  await new Promise((r) => setTimeout(r, 120));
  return window.document.getElementById('kpiDetalleModal');
};

await check('al hacer clic abre el modal y NO navega', async () => {
  const { window } = await arranca();
  const antes = window.location.href;
  const modal = await abreDetalle(window);
  assert.ok(modal, 'no abrio el modal de detalle');
  assert.equal(window.location.href, antes, 'se salio de la pantalla de KPIs');
});

await check('pide el detalle de ESA actividad', async () => {
  const { window, pedidos } = await arranca();
  await abreDetalle(window);
  assert.ok(pedidos.some((u) => u.endsWith('/actividades/d2')),
    `no pidio el detalle: ${pedidos.join(' , ')}`);
});

await check('trae la retroalimentacion: nota, bitacora y seguidores', async () => {
  const { window } = await arranca();
  const t = (await abreDetalle(window)).textContent;
  assert.match(t, /Caldo de hueso/, 'falta la nota / plan de accion');
  assert.match(t, /Itzel Paz/, 'falta quien comento');
  assert.match(t, /revisa el caldo de hueso/, 'falta el texto del comentario');
  assert.match(t, /Mariana/, 'falta la seguidora');
});

await check('trae lo que explica la cifra: periodo, riesgo y desenlace', async () => {
  const { window } = await arranca();
  const t = (await abreDetalle(window)).textContent.replace(/\s+/g, ' ');
  assert.match(t, /oct 2026/i, 'falta el mes analizado');
  assert.match(t, /1,437/, 'falta el riesgo en kg');
  assert.match(t, /1,213,068/, 'falta el riesgo en pesos');
  assert.match(t, /Estable/i, 'falta el resultado al cerrar');
});

await check('trae el snapshot que justifico la actividad', async () => {
  const { window } = await arranca();
  const t = (await abreDetalle(window)).textContent;
  assert.match(t, /WWP1211/, 'falta la partida del snapshot');
  assert.match(t, /Aderome YE Cheese/, 'falta el segundo producto');
});

await check('para actuar, manda a Actividades en pestana nueva', async () => {
  const { window } = await arranca();
  const modal = await abreDetalle(window);
  const salida = [...modal.querySelectorAll('a[href]')]
    .find((a) => /actividades\.html/.test(a.getAttribute('href')));
  assert.ok(salida, 'no hay salida hacia la pantalla donde si se puede actuar');
  assert.match(salida.getAttribute('href'), /\?act=d2$/);
  assert.equal(salida.getAttribute('target'), '_blank',
    'si abre aqui mismo, vuelve a tirar el recorte');
});

await check('es de SOLO LECTURA: no trae controles que escriban', async () => {
  const { window } = await arranca();
  const modal = await abreDetalle(window);
  assert.equal(modal.querySelectorAll('textarea, input, select').length, 0,
    'aparecio un control de captura en un modal declarado de solo lectura');
  // Se auditan los CONTROLES, no las palabras: el pie explica donde se actua
  // y menciona "comentar" a proposito. Lo que no puede haber es un boton que
  // escriba. Solo deben existir el de cerrar y la liga de salida.
  const botones = [...modal.querySelectorAll('button')];
  assert.equal(botones.length, 1, `hay ${botones.length} botones: ${botones.map((b) => b.textContent.trim()).join(' | ')}`);
  assert.ok(botones[0].hasAttribute('data-cerrar-detalle'), 'el unico boton debe ser el de cerrar');
  const ligas = [...modal.querySelectorAll('a[href]')];
  assert.equal(ligas.length, 1, 'solo debe haber la salida hacia Actividades');
});

await check('la bitacora dice la hora, no los segundos', async () => {
  const { window } = await arranca();
  const t = (await abreDetalle(window)).textContent;
  // Sin fijar zona: se afirma la FORMA, no una hora concreta.
  assert.match(t, /\d{1,2}:\d{2}/, 'no dice la hora del comentario');
  assert.ok(!/\d{1,2}:\d{2}:\d{2}/.test(t),
    'los segundos son ruido para leer en una junta');
});

await check('se cierra con el boton y con Escape', async () => {
  const { window } = await arranca();
  const modal = await abreDetalle(window);
  modal.querySelector('[data-cerrar-detalle]').click();
  await new Promise((r) => setTimeout(r, 60));
  assert.ok(!window.document.getElementById('kpiDetalleModal'), 'el boton no cerro');
  await abreDetalle(window);
  window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await new Promise((r) => setTimeout(r, 60));
  assert.ok(!window.document.getElementById('kpiDetalleModal'), 'Escape no cerro');
});

await check('la liga conserva su href para abrir en pestana aparte', async () => {
  const { window } = await arranca();
  const liga = window.document.querySelector('#kpiTabla tbody tr a[href]');
  assert.match(liga.getAttribute('href'), /actividades\.html\?act=/,
    'sin href, ctrl+clic deja de funcionar');
});

await check('si el detalle no se puede abrir, avisa y no deja un modal vacio', async () => {
  const { window } = await arranca();
  const liga = [...window.document.querySelectorAll('#kpiTabla tbody tr a[href]')]
    .find((a) => /CLIENTE VENCIDO/.test(a.textContent));
  liga.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  await new Promise((r) => setTimeout(r, 150));
  assert.ok(!window.document.getElementById('kpiDetalleModal'), 'dejo un modal sin contenido');
  assert.ok(window.document.getElementById('kpiTabla'), 'se rompio la tabla');
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

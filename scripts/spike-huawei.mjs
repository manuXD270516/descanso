// Spike de 007 (importar desde el reloj): analiza una exportación de Huawei Health YA DESCOMPRIMIDA
// y responde las 4 preguntas de specs/007-importar-reloj/spec.md ("Requisito previo"):
//   1. ¿Hay fases de sueño legibles (PROFESSIONAL_SLEEP_* u otras parecidas)?
//   2. ¿Las marcas de tiempo vienen en milisegundos o en segundos?
//   3. ¿Cuánto se repiten los tramos entre archivos?
//   4. Con un hueco de 15/30/60 min como separador, ¿las sesiones quedan bien cortadas?
//
// Uso: node scripts/spike-huawei.mjs <carpeta-descomprimida> [--salida <archivo>]
//
// PRIVACIDAD: el informe contiene SOLO datos agregados (nombres de claves y de tipos, conteos,
// porcentajes, medianas en minutos, cantidad de meses). Nunca imprime fechas, horas, valores,
// identificadores ni nombres: los valores de los ejemplos se sustituyen por su tipo y los nombres
// de archivo se muestran con los números de 4 o más cifras enmascarados. No usa red ni escribe
// nada salvo el informe de --salida. Sin dependencias: solo Node 22.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';

const MAX_BYTES = 300 * 1024 * 1024; // por archivo; más grande se omite (y se informa)
const MAX_PROFUNDIDAD = 40;
const UMBRALES_MIN = [15, 30, 60];
const MIN = 60_000;
// Rango plausible de una marca de tiempo (ms): 2005-01-01 a 2045-01-01.
const MS_MIN = 1_104_537_600_000;
const MS_MAX = 2_335_219_200_000;

const FASES = ['ligero', 'profundo', 'rem', 'despierto', 'siesta'];

// ---------- utilidades de saneado (nada identificable sale en el informe) ----------

// Nombre de clave o de tipo apto para imprimir: identificador corto. Si no, se enmascara.
function claveSegura(k) {
  if (/^[A-Za-z_][A-Za-z0-9_ .-]{0,48}$/.test(k) && !/\d{4,}/.test(k)) return k;
  return '<clave-variable>';
}

function rutaSegura(p) {
  return p
    .split(/[\\/]/)
    .map((parte) =>
      parte
        .replace(/[0-9A-Fa-f]{16,}/g, '<id>')
        .replace(/\d{4,}/g, '#')
        .replace(/[^\x20-\x7E]/g, '?'),
    )
    .join('/');
}

function mediana(xs) {
  if (!xs.length) return null;
  const a = [...xs].sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

function pct(n, d) {
  return d ? `${((100 * n) / d).toFixed(1)} %` : 'n/d';
}

function inc(mapa, clave, n = 1) {
  mapa.set(clave, (mapa.get(clave) ?? 0) + n);
}

// ---------- reconocimiento de marcas de tiempo ----------

// Devuelve { ms, escala } o null. Escalas: segundos, milisegundos, microsegundos, texto ISO,
// texto compacto (aaaaMMddHHmmss).
function aMs(v) {
  if (typeof v === 'string') {
    const t = v.trim();
    if (/^\d{14}$/.test(t) && t.startsWith('20')) {
      const ms = Date.UTC(+t.slice(0, 4), +t.slice(4, 6) - 1, +t.slice(6, 8), +t.slice(8, 10), +t.slice(10, 12), +t.slice(12, 14));
      return ms >= MS_MIN && ms <= MS_MAX ? { ms, escala: 'texto compacto' } : null;
    }
    if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(t)) {
      const ms = Date.parse(t);
      return Number.isFinite(ms) && ms >= MS_MIN && ms <= MS_MAX ? { ms, escala: 'texto ISO' } : null;
    }
    if (/^\d{9,17}$/.test(t)) return aMs(Number(t));
    return null;
  }
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const candidatos = [
    [v * 1000, 'segundos'],
    [v, 'milisegundos'],
    [v / 1000, 'microsegundos'],
  ];
  for (const [ms, escala] of candidatos) {
    if (ms >= MS_MIN && ms <= MS_MAX) return { ms, escala };
  }
  return null;
}

function palabras(clave) {
  return clave
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean);
}
const esClaveInicio = (k) => palabras(k).some((w) => w === 'start' || w === 'begin' || w === 'from');
const esClaveFin = (k) => palabras(k).some((w) => w === 'end' || w === 'stop' || w === 'finish' || w === 'to');

// ---------- fase a partir de un nombre/tipo ----------

function faseDe(texto) {
  const t = String(texto).toUpperCase();
  if (/NAP|SIESTA/.test(t)) return 'siesta';
  if (/DEEP|PROFUND/.test(t)) return 'profundo';
  if (/LIGHT|LIGER|SHALLOW/.test(t)) return 'ligero';
  if (/\bREM\b|(^|[^A-Z])REM([^A-Z]|$)|DREAM/.test(t)) return 'rem';
  if (/AWAKE|WAKE|DESPIER/.test(t)) return 'despierto';
  return null;
}
const esMarcador = (s) => typeof s === 'string' && s.length > 0 && s.length <= 80 && /^[A-Za-z][A-Za-z0-9_ .-]*$/.test(s);

// ---------- estado del análisis ----------

function nuevoEstado() {
  return {
    archivos: { json: 0, csv: 0, otros: 0, omitidos: 0, ilegibles: 0 },
    jsonAnidado: 0,
    clavesSueno: new Map(), // clave (con "sleep" en el nombre) -> apariciones
    clavesDeRegistro: new Map(), // claves de los objetos con tramos de sueño
    marcadores: new Map(), // nombre de tipo -> apariciones (solo los que nombran sueño o fase)
    fasesCrudas: new Map(), // fase -> tramos crudos
    registrosSinFase: 0, // objetos de sueño con inicio/fin pero sin fase reconocible
    rutasConSueno: new Map(), // ruta saneada -> tramos
    escalas: new Map(), // escala -> cantidad de marcas
    tramos: new Map(), // "fase|ini|fin" -> { fase, ini, fin, archivos:Set<number> }
    crudos: 0,
    ejemplo: null,
    sinInicioFin: 0, // objetos con marcador de sueño pero sin inicio/fin legible
  };
}

// Sustituye cada valor por su tipo; conserva (saneadas) las claves. Una sola rama por arreglo.
function esqueleto(v, prof = 0) {
  if (Array.isArray(v)) return v.length && prof < 4 ? [esqueleto(v[0], prof + 1)] : [];
  if (v && typeof v === 'object') {
    if (prof >= 4) return '<objeto>';
    const o = {};
    for (const [k, x] of Object.entries(v)) o[claveSegura(k)] = esqueleto(x, prof + 1);
    return o;
  }
  if (typeof v === 'string') return '<texto>';
  if (typeof v === 'number') return '<número>';
  if (typeof v === 'boolean') return '<booleano>';
  return '<nulo>';
}

function procesarObjeto(obj, ancestros, ctx, est) {
  const claves = Object.keys(obj);
  for (const k of claves) if (/sleep|sue[ñn]o|nap/i.test(k)) inc(est.clavesSueno, claveSegura(k));

  const contextoSueno = ancestros.some((a) => /sleep|sue[ñn]o/i.test(a)) || /sleep|sue[ñn]o/i.test(ctx.ruta);
  // Marcadores: clave padre y valores de texto cortos del propio objeto.
  const marcadores = [];
  if (ancestros.length) marcadores.push(ancestros[ancestros.length - 1]);
  for (const k of claves) if (esMarcador(obj[k])) marcadores.push(obj[k]);
  const conSueno = marcadores.filter((m) => /sleep|sue[ñn]o/i.test(m));
  const conFase = marcadores.filter((m) => faseDe(m));
  const relevante = conSueno.length > 0 || (contextoSueno && conFase.length > 0);
  if (!relevante) return;

  for (const m of new Set([...conSueno, ...conFase])) inc(est.marcadores, claveSegura(m));

  // Inicio y fin legibles en el propio objeto.
  let ini = null;
  let fin = null;
  for (const k of claves) {
    if (ini === null && esClaveInicio(k)) ini = aMs(obj[k]);
    else if (fin === null && esClaveFin(k)) fin = aMs(obj[k]);
  }
  if (!ini || !fin) {
    est.sinInicioFin++;
    return;
  }
  const fase = (conFase.map(faseDe).find(Boolean)) ?? null;

  for (const k of claves) inc(est.clavesDeRegistro, claveSegura(k));
  inc(est.escalas, ini.escala);
  inc(est.escalas, fin.escala);
  if (!est.ejemplo) est.ejemplo = esqueleto(obj);
  inc(est.rutasConSueno, rutaSegura(ctx.ruta));

  if (!fase || fin.ms <= ini.ms) {
    est.registrosSinFase++;
    return;
  }
  est.crudos++;
  inc(est.fasesCrudas, fase);
  const clave = `${fase}|${ini.ms}|${fin.ms}`;
  let t = est.tramos.get(clave);
  if (!t) est.tramos.set(clave, (t = { fase, ini: ini.ms, fin: fin.ms, archivos: new Set() }));
  t.archivos.add(ctx.idArchivo);
}

function recorrer(nodo, ancestros, ctx, est, prof = 0) {
  if (prof > MAX_PROFUNDIDAD || nodo === null) return;
  if (typeof nodo === 'string') {
    // Huawei suele guardar JSON dentro de un texto ("value": "[{...}]").
    const t = nodo.trim();
    if (t.length > 2 && t.length < 50_000_000 && (t[0] === '[' || t[0] === '{')) {
      try {
        const dentro = JSON.parse(t);
        est.jsonAnidado++;
        recorrer(dentro, ancestros, ctx, est, prof + 1);
      } catch {
        /* no era JSON */
      }
    }
    return;
  }
  if (Array.isArray(nodo)) {
    for (const x of nodo) recorrer(x, ancestros, ctx, est, prof + 1);
    return;
  }
  if (typeof nodo !== 'object') return;
  procesarObjeto(nodo, ancestros, ctx, est);
  for (const [k, v] of Object.entries(nodo)) {
    if (v && (typeof v === 'object' || typeof v === 'string')) recorrer(v, [...ancestros, k], ctx, est, prof + 1);
  }
}

// ---------- CSV tolerante ----------

function parsearCsv(texto) {
  const primera = texto.slice(0, texto.indexOf('\n') >>> 0 || 2000);
  const sep = [',', ';', '\t'].map((s) => [s, primera.split(s).length]).sort((a, b) => b[1] - a[1])[0][0];
  const filas = [];
  let fila = [];
  let campo = '';
  let comillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (comillas) {
      if (c === '"' && texto[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (c === '"') comillas = false;
      else campo += c;
    } else if (c === '"') comillas = true;
    else if (c === sep) {
      fila.push(campo);
      campo = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      fila.push(campo);
      campo = '';
      if (fila.length > 1 || fila[0] !== '') filas.push(fila);
      fila = [];
    } else campo += c;
  }
  if (campo !== '' || fila.length) {
    fila.push(campo);
    filas.push(fila);
  }
  return filas;
}

function procesarCsv(texto, ctx, est) {
  const filas = parsearCsv(texto.replace(/^﻿/, ''));
  if (filas.length < 2) return;
  const cab = filas[0].map((h) => h.trim());
  for (const h of cab) if (/sleep|sue[ñn]o/i.test(h)) inc(est.clavesSueno, claveSegura(h));
  for (let i = 1; i < filas.length; i++) {
    const obj = {};
    cab.forEach((h, j) => {
      if (!h) return;
      const v = filas[i][j] ?? '';
      obj[h] = /^-?\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : v;
    });
    procesarObjeto(obj, [], ctx, est);
  }
}

// ---------- recorrido de la carpeta ----------

function* archivosDe(dir) {
  let entradas;
  try {
    entradas = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  entradas.sort((a, b) => a.name.localeCompare(b.name));
  for (const e of entradas) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* archivosDe(p);
    else if (e.isFile()) yield p;
  }
}

function analizarCarpeta(raiz) {
  const est = nuevoEstado();
  let id = 0;
  for (const p of archivosDe(raiz)) {
    const ext = extname(p).toLowerCase();
    if (ext !== '.json' && ext !== '.csv') {
      est.archivos.otros++;
      continue;
    }
    let tam;
    try {
      tam = statSync(p).size;
    } catch {
      est.archivos.ilegibles++;
      continue;
    }
    if (tam > MAX_BYTES) {
      est.archivos.omitidos++;
      continue;
    }
    let texto;
    try {
      texto = readFileSync(p, 'utf8');
    } catch {
      est.archivos.ilegibles++;
      continue;
    }
    const ctx = { ruta: relative(raiz, p), idArchivo: id++ };
    if (ext === '.csv') {
      est.archivos.csv++;
      procesarCsv(texto, ctx, est);
      continue;
    }
    est.archivos.json++;
    texto = texto.replace(/^﻿/, '');
    try {
      recorrer(JSON.parse(texto), [], ctx, est);
    } catch {
      // ¿JSON por líneas?
      let ok = false;
      for (const linea of texto.split(/\r?\n/)) {
        if (!linea.trim()) continue;
        try {
          recorrer(JSON.parse(linea), [], ctx, est);
          ok = true;
        } catch {
          /* línea no JSON */
        }
      }
      if (!ok) est.archivos.ilegibles++;
    }
  }
  return est;
}

// ---------- sesiones ----------

function sesionesCon(tramosOrdenados, umbralMin) {
  const sesiones = [];
  let actual = null;
  for (const t of tramosOrdenados) {
    if (actual && t.ini - actual.fin < umbralMin * MIN) {
      actual.fin = Math.max(actual.fin, t.fin);
      actual.fases.add(t.fase);
      actual.n++;
    } else {
      actual = { ini: t.ini, fin: t.fin, fases: new Set([t.fase]), n: 1 };
      sesiones.push(actual);
    }
  }
  return sesiones;
}

const CUBOS = [
  ['solapado o contiguo (<= 0 min)', (g) => g <= 0],
  ['0 a 1 min', (g) => g <= 1],
  ['1 a 5 min', (g) => g <= 5],
  ['5 a 15 min', (g) => g <= 15],
  ['15 a 30 min', (g) => g <= 30],
  ['30 a 60 min', (g) => g <= 60],
  ['1 a 2 h', (g) => g <= 120],
  ['2 a 6 h', (g) => g <= 360],
  ['más de 6 h', () => true],
];

// ---------- informe ----------

function topN(mapa, n = 30) {
  return [...mapa.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n);
}

function construirInforme(est) {
  const L = [];
  const h = (t) => L.push('', `== ${t} ==`);

  L.push('INFORME DEL SPIKE DE HUAWEI HEALTH (solo datos agregados)');
  L.push('Seguro para compartir: no contiene fechas, horas, valores, identificadores ni nombres.');

  h('Archivos recorridos');
  const a = est.archivos;
  L.push(`JSON: ${a.json}   CSV: ${a.csv}   otros (ignorados): ${a.otros}   omitidos por tamaño: ${a.omitidos}   ilegibles: ${a.ilegibles}`);
  if (est.jsonAnidado) L.push(`JSON incrustado dentro de textos (leído igualmente): ${est.jsonAnidado}`);

  h('Rutas con datos de sueño (números de 4+ cifras enmascarados)');
  if (!est.rutasConSueno.size) L.push('(ninguna)');
  for (const [r, n] of topN(est.rutasConSueno, 25)) L.push(`  ${n}  ${r}`);

  h('Pregunta 1: tipos y fases de sueño');
  if (!est.marcadores.size) L.push('Tipos/claves de sueño encontrados: (ninguno)');
  else {
    L.push('Nombres de tipo o clave de sueño encontrados (apariciones):');
    for (const [k, n] of topN(est.marcadores)) L.push(`  ${k}: ${n}`);
  }
  L.push('Tramos con fase reconocida (crudos, antes de quitar repetidos):');
  for (const f of FASES) L.push(`  ${f}: ${est.fasesCrudas.get(f) ?? 0}`);
  L.push(`Registros de sueño con inicio y fin pero sin fase reconocible: ${est.registrosSinFase}`);
  L.push(`Objetos con marcador de sueño pero sin inicio/fin legibles: ${est.sinInicioFin}`);
  if (est.clavesSueno.size) {
    L.push('Claves con "sleep" o "sueño" en el nombre (apariciones):');
    for (const [k, n] of topN(est.clavesSueno, 20)) L.push(`  ${k}: ${n}`);
  }
  if (est.clavesDeRegistro.size) {
    L.push('Claves de los registros de sueño con inicio y fin (apariciones):');
    for (const [k, n] of topN(est.clavesDeRegistro, 30)) L.push(`  ${k}: ${n}`);
  }
  if (est.ejemplo) {
    L.push('Ejemplo de estructura de un registro (valores sustituidos por su tipo):');
    for (const l of JSON.stringify(est.ejemplo, null, 2).split('\n')) L.push(`  ${l}`);
  }

  h('Pregunta 2: escala de las marcas de tiempo');
  const totalMarcas = [...est.escalas.values()].reduce((x, y) => x + y, 0);
  if (!totalMarcas) L.push('Sin marcas de tiempo legibles en registros de sueño.');
  for (const [e, n] of topN(est.escalas)) L.push(`  ${e}: ${n} (${pct(n, totalMarcas)})`);
  const escalaDominante = topN(est.escalas, 1)[0]?.[0] ?? null;
  if (escalaDominante) L.push(`Escala detectada: ${escalaDominante}${est.escalas.size > 1 ? ' (HAY MEZCLA: revisar)' : ''}`);

  const unicos = [...est.tramos.values()];
  const enVarios = unicos.filter((t) => t.archivos.size > 1).length;
  h('Pregunta 3: repetición de tramos entre archivos');
  L.push(`Tramos crudos con fase: ${est.crudos}   únicos: ${unicos.length}`);
  L.push(`Registros redundantes (crudos que repiten a otro): ${pct(est.crudos - unicos.length, est.crudos)}`);
  L.push(`Tramos únicos presentes en más de un archivo: ${enVarios} (${pct(enVarios, unicos.length)})`);

  // Las siestas no entran en las sesiones nocturnas.
  const noche = unicos.filter((t) => t.fase !== 'siesta').sort((x, y) => x.ini - y.ini || x.fin - y.fin);
  const siestas = unicos.filter((t) => t.fase === 'siesta');
  h('Pregunta 4: huecos entre tramos y sesiones');
  L.push(`Tramos únicos usados (sin siestas): ${noche.length}   siestas: ${siestas.length}`);
  const hist = CUBOS.map(([nombre]) => [nombre, 0]);
  let finMax = null;
  for (const t of noche) {
    if (finMax !== null) {
      const g = (t.ini - finMax) / MIN;
      hist[CUBOS.findIndex(([, f]) => f(g))][1]++;
    }
    finMax = finMax === null ? t.fin : Math.max(finMax, t.fin);
  }
  const maxCubo = Math.max(1, ...hist.map((x) => x[1]));
  L.push('Histograma de huecos entre tramos consecutivos:');
  for (const [nombre, n] of hist) L.push(`  ${nombre.padEnd(32)} ${String(n).padStart(7)}  ${'#'.repeat(Math.round((30 * n) / maxCubo))}`);

  let meses = 0;
  if (unicos.length) {
    const ini = new Date(Math.min(...unicos.map((t) => t.ini)));
    const fin = new Date(Math.max(...unicos.map((t) => t.fin)));
    meses = (fin.getUTCFullYear() - ini.getUTCFullYear()) * 12 + fin.getUTCMonth() - ini.getUTCMonth() + 1;
  }
  const resumen = {};
  for (const u of UMBRALES_MIN) {
    const ss = sesionesCon(noche, u);
    const dur = ss.map((s) => (s.fin - s.ini) / MIN);
    const cortas = dur.filter((d) => d < 30).length;
    const largas = dur.filter((d) => d > 16 * 60).length;
    const conFases = ss.filter((s) => s.fases.has('profundo') && s.fases.has('ligero')).length;
    resumen[u] = { n: ss.length, cortas, largas, conFases };
    L.push(
      `Umbral ${String(u).padStart(2)} min: ${ss.length} sesiones, mediana ${mediana(dur) === null ? 'n/d' : `${Math.round(mediana(dur))} min`}` +
        `, con ligero y profundo: ${conFases}, de menos de 30 min: ${cortas}, de más de 16 h: ${largas}` +
        (meses ? `, ${(ss.length / meses).toFixed(1)} por mes` : ''),
    );
  }
  L.push(`Rango de fechas: ${meses} ${meses === 1 ? 'mes' : 'meses'}`);
  L.push('Pista: si el hueco de 30 min corta bien, las sesiones por mes rondan las noches reales y');
  L.push('casi no hay sesiones de menos de 30 min ni de más de 16 h; si 15, 30 y 60 dan casi lo mismo,');
  L.push('el separador es robusto.');

  // Veredicto del criterio de salida de la spec.
  h('Veredicto del criterio de salida');
  const fasesDistintas = FASES.filter((f) => f !== 'siesta' && (est.fasesCrudas.get(f) ?? 0) > 0);
  const r30 = resumen[30];
  let veredicto;
  let motivo;
  if (!unicos.length) {
    veredicto = 'NO';
    motivo = est.marcadores.size || est.clavesSueno.size
      ? 'hay claves de sueño pero no se pudieron leer tramos con fase e inicio/fin; probablemente solo hay totales por noche'
      : 'no se encontró ninguna clave ni tipo de sueño en los JSON/CSV';
  } else if (fasesDistintas.length >= 3 && r30.conFases > 0 && est.escalas.size === 1 && r30.largas <= r30.n * 0.05) {
    veredicto = 'SÍ';
    motivo = `fases legibles (${fasesDistintas.join(', ')}), escala de tiempo única (${escalaDominante}) y ${r30.n} sesiones con el hueco de 30 min`;
  } else {
    veredicto = 'DUDOSO';
    const motivos = [];
    if (fasesDistintas.length < 3) motivos.push(`solo ${fasesDistintas.length} fase(s) distinta(s) con datos (${fasesDistintas.join(', ') || 'ninguna'})`);
    if (!r30.conFases) motivos.push('ninguna sesión tiene a la vez ligero y profundo');
    if (est.escalas.size > 1) motivos.push('las marcas de tiempo mezclan escalas');
    if (r30.largas > r30.n * 0.05) motivos.push('más del 5 % de las sesiones dura más de 16 h (el corte no separa bien)');
    motivo = motivos.join('; ') || 'revisar el informe a mano';
  }
  L.push(`¿Se pueden obtener noches con fases? ${veredicto}`);
  L.push(`Motivo: ${motivo}.`);
  return L.join('\n') + '\n';
}

// ---------- entrada ----------

function uso() {
  return [
    'Uso: node scripts/spike-huawei.mjs <carpeta-descomprimida> [--salida <archivo>]',
    '',
    '  <carpeta-descomprimida>  la exportación de Huawei Health ya abierta con 7-Zip (fuera del repo)',
    '  --salida <archivo>       guarda el informe en ese archivo (por defecto, solo a la consola)',
    '  --ayuda                  muestra esta ayuda',
    '',
  ].join('\n');
}

function main(argv) {
  let carpeta = null;
  let salida = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--ayuda' || a === '-h') {
      process.stdout.write(uso());
      return 0;
    }
    if (a === '--salida') salida = argv[++i];
    else if (a.startsWith('--salida=')) salida = a.slice('--salida='.length);
    else if (!carpeta && !a.startsWith('--')) carpeta = a;
    else {
      process.stderr.write(`Argumento no reconocido: ${a}\n${uso()}`);
      return 2;
    }
  }
  if (!carpeta || salida === undefined || salida === '') {
    process.stderr.write(uso());
    return 2;
  }
  const raiz = resolve(carpeta);
  try {
    if (!statSync(raiz).isDirectory()) throw new Error('no es carpeta');
  } catch {
    process.stderr.write('La carpeta indicada no existe o no es una carpeta. Pasá la exportación ya descomprimida.\n');
    return 2;
  }
  const informe = construirInforme(analizarCarpeta(raiz));
  if (salida) {
    writeFileSync(salida, informe, 'utf8');
    process.stdout.write(`Informe guardado en ${resolve(salida)}\n`);
  } else {
    process.stdout.write(informe);
  }
  return 0;
}

process.exitCode = main(process.argv.slice(2));

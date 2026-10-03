const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Principio VIII (feature 006, FR-003 y SC-002): ningún texto de la interfaz usa vocabulario clínico.
// Recorre el código fuente que produce textos visibles (plantillas, componentes y mensajes del
// servidor) contra la lista versionada docs/sdd/terminos-prohibidos.txt.
const ROOT = path.join(__dirname, '..', '..');
const LIST = path.join(ROOT, 'docs', 'sdd', 'terminos-prohibidos.txt');

/** Minúsculas y sin tildes: "Diagnóstico" → "diagnostico", "sueño" → "sueno". */
const normalize = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function loadTerms(file = LIST) {
  return fs
    .readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.replace(/#.*/, '').trim())
    .filter(Boolean)
    .map((raw) => {
      const term = normalize(raw);
      const prefix = term.endsWith('*');
      const body = escape(prefix ? term.slice(0, -1) : term);
      // Límites de palabra explícitos: \b de JS no conoce letras fuera de ASCII
      return { raw, re: new RegExp(`(?<![a-z0-9])${body}${prefix ? '[a-z]*' : '(?![a-z0-9])'}`) };
    });
}

/** Coincidencias de una lista de términos en un texto: [{ line, term }]. */
function findTerms(text, terms) {
  const hits = [];
  normalize(text).split(/\r?\n/).forEach((line, i) => {
    for (const t of terms) if (t.re.test(line)) hits.push({ line: i + 1, term: t.raw });
  });
  return hits;
}

function sources() {
  const out = [];
  const walk = (dir, accept) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p, accept);
      else if (accept(e.name)) out.push(p);
    }
  };
  walk(path.join(ROOT, 'frontend', 'src'), (n) => n.endsWith('.html') || (n.endsWith('.ts') && !n.endsWith('.spec.ts')));
  walk(path.join(ROOT, 'backend', 'src'), (n) => n.endsWith('.js'));
  return out;
}

test('la lista de términos prohibidos existe y no está vacía', () => {
  assert.ok(loadTerms().length >= 10);
});

test('autocomprobación: detecta términos (con tildes, mayúsculas y comodín) y respeta las excepciones', () => {
  const terms = loadTerms();
  const found = (text) => findTerms(text, terms).map((h) => h.term);
  assert.deepEqual(found('Posible INSOMNIO crónico'), ['insomnio*']);
  assert.deepEqual(found('Sin diagnósticos'), ['diagnostic*']);
  assert.deepEqual(found('trastornos del sueño'), ['trastorno*']);
  assert.deepEqual(found('Tu % de REM fue bajo'), ['% de rem']);
  assert.deepEqual(found('un tratamiento médico'), ['tratamiento medico']);
  // Excepciones: términos legales y palabras comunes
  assert.deepEqual(found('Acepto el tratamiento de mis datos de sueño (datos de salud).'), []);
  assert.deepEqual(found('No es un dispositivo médico'), []);
  assert.deepEqual(found('Está ahí, al lado de "Me voy a dormir"'), []);
  assert.deepEqual(found('paciencia, tecla, piah'), [], 'límites de palabra');
});

test('ningún texto de la interfaz (frontend y mensajes del servidor) usa un término prohibido', () => {
  const terms = loadTerms();
  const hits = [];
  for (const file of sources()) {
    for (const h of findTerms(fs.readFileSync(file, 'utf8'), terms)) hits.push(`${path.relative(ROOT, file)}:${h.line} → "${h.term}"`);
  }
  assert.deepEqual(hits, [], `Términos prohibidos (docs/sdd/terminos-prohibidos.txt):\n${hits.join('\n')}`);
});

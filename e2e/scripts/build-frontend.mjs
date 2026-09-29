// Compila el frontend de Angular solo si hace falta, para que el servidor lo sirva.
//
// Reconstruye si no existe el build o si algún archivo fuente es más nuevo que el build
// (así nunca se prueba un build viejo). E2E_REBUILD=1 fuerza la compilación y
// E2E_SKIP_BUILD=1 la omite (útil en CI, donde el build ya se hizo en un paso anterior).
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const frontend = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'frontend');
const builtIndex = join(frontend, 'dist', 'frontend', 'browser', 'index.html');

function newestMtime(path) {
  const st = statSync(path);
  if (!st.isDirectory()) return st.mtimeMs;
  return readdirSync(path).reduce((max, name) => Math.max(max, newestMtime(join(path, name))), 0);
}

function reason() {
  if (process.env.E2E_REBUILD === '1') return 'E2E_REBUILD=1';
  if (!existsSync(builtIndex)) return 'no existe el build';
  const built = statSync(builtIndex).mtimeMs;
  const sources = ['src', 'public', 'angular.json', 'package-lock.json', 'tsconfig.json', 'tsconfig.app.json']
    .map((p) => join(frontend, p))
    .filter(existsSync);
  const newest = Math.max(...sources.map(newestMtime));
  return newest > built ? 'hay fuentes más nuevas que el build' : null;
}

if (process.env.E2E_SKIP_BUILD === '1') {
  if (!existsSync(builtIndex)) {
    console.error(`[e2e] E2E_SKIP_BUILD=1 pero no existe ${builtIndex}`);
    process.exit(1);
  }
  console.log('[e2e] Se usa el build existente del frontend (E2E_SKIP_BUILD=1)');
} else {
  const why = reason();
  if (why) {
    console.log(`[e2e] Compilando el frontend (${why})...`);
    execSync('npx ng build', { cwd: frontend, stdio: 'inherit' });
  } else {
    console.log('[e2e] El build del frontend está al día');
  }
}

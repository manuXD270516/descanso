import { readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const STALE_MS = 60 * 60 * 1000;

function remove(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    // En Windows el servidor compartido aún retiene su base: se borra en una ejecución posterior
  }
}

/**
 * Borra la carpeta temporal de esta ejecución y las de ejecuciones anteriores de hace más de
 * una hora (en Windows, la base del servidor compartido sigue abierta durante el teardown y
 * no se puede borrar hasta la siguiente ejecución).
 */
export default function globalTeardown(): void {
  const current = process.env.E2E_RUN_DIR;
  if (current) remove(current);

  const now = Date.now();
  for (const name of readdirSync(tmpdir())) {
    if (!name.startsWith('descanso-e2e-')) continue;
    const dir = join(tmpdir(), name);
    try {
      if (statSync(dir).isDirectory() && now - statSync(dir).mtimeMs > STALE_MS) remove(dir);
    } catch {
      // desapareció entre medias
    }
  }
}

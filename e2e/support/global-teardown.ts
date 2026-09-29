import { rmSync } from 'node:fs';

/** Borra la carpeta temporal de la ejecución (la base del servidor compartido). */
export default function globalTeardown(): void {
  const dir = process.env.E2E_RUN_DIR;
  if (!dir) return;
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    // En Windows el servidor compartido puede seguir reteniendo el archivo: queda en %TEMP%
  }
}

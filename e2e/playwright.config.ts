import { defineConfig, devices } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SHARED_PORT, SHARED_URL, TIMEZONE } from './support/env';

const CI = !!process.env.CI;

// Carpeta temporal de esta ejecución. El config se evalúa también en cada worker: la variable
// de entorno garantiza que todos usan la misma carpeta que creó el proceso principal.
process.env.E2E_RUN_DIR ??= mkdtempSync(join(tmpdir(), 'descanso-e2e-run-'));

// En local se usa el Chrome instalado (no hace falta descargar navegadores);
// en CI, el Chromium de Playwright. E2E_CHANNEL permite elegir otro ('' = Chromium).
const channel = (process.env.E2E_CHANNEL ?? (CI ? '' : 'chrome')) || undefined;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  workers: CI ? 2 : undefined,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: CI
    ? [['list'], ['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  globalTeardown: './support/global-teardown.ts',

  use: {
    baseURL: SHARED_URL,
    // Determinismo: zona horaria fija sin horario de verano (-04:00) y textos en español
    timezoneId: TIMEZONE,
    locale: 'es-ES',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], channel },
    },
  ],

  // Servidor compartido: el mismo `node backend/src/server.js` de producción, con una base
  // SQLite temporal y limpia por ejecución. Antes compila el frontend si hace falta.
  webServer: {
    command: 'node scripts/build-frontend.mjs && node ../backend/src/server.js',
    url: `${SHARED_URL}/api/health`,
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      PORT: String(SHARED_PORT),
      DB_PATH: join(process.env.E2E_RUN_DIR, 'compartida.db'),
      // Vacías = sin versión inyectada ("dev") y sin endpoint de respaldo
      APP_VERSION: '',
      BACKUP_TOKEN: '',
    },
  },
});

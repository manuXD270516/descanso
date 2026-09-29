import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/** `node backend/src/server.js`: el mismo punto de entrada que en producción. */
export const SERVER_JS = resolve(__dirname, '..', '..', 'backend', 'src', 'server.js');

/** Variables del backend que nunca deben filtrarse desde el entorno de quien ejecuta. */
const BACKEND_VARS = ['PORT', 'DB_PATH', 'APP_VERSION', 'BACKUP_TOKEN', 'FRONTEND_DIST'];

async function freePort(): Promise<number> {
  return new Promise((ok, fail) => {
    const srv = createServer();
    srv.once('error', fail);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address() as { port: number };
      srv.close(() => ok(port));
    });
  });
}

/**
 * Una instancia real del servicio (API + frontend compilado) con su propia base SQLite
 * temporal y su propio puerto. Se usa una por test para aislar los datos.
 */
export class AppServer {
  private child: ChildProcess | null = null;
  private output = '';

  private constructor(
    readonly port: number,
    readonly dbPath: string,
    private readonly env: Record<string, string>,
    private readonly dir: string,
  ) {}

  get url(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  static async start(env: Record<string, string> = {}): Promise<AppServer> {
    const dir = mkdtempSync(join(tmpdir(), 'descanso-e2e-'));
    const server = new AppServer(await freePort(), join(dir, 'sleep.db'), env, dir);
    await server.boot();
    return server;
  }

  /** Arranca el proceso y espera a que /api/health responda. */
  private async boot(): Promise<void> {
    const env: NodeJS.ProcessEnv = { ...process.env };
    for (const k of BACKEND_VARS) delete env[k];
    Object.assign(env, this.env, { PORT: String(this.port), DB_PATH: this.dbPath });

    this.output = '';
    const child = spawn(process.execPath, [SERVER_JS], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    this.child = child;
    child.stdout?.on('data', (d) => (this.output += d));
    child.stderr?.on('data', (d) => (this.output += d));

    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) {
        throw new Error(`El servidor terminó al arrancar (código ${child.exitCode}):\n${this.output}`);
      }
      try {
        const res = await fetch(`${this.url}/api/health`);
        if (res.ok) return;
      } catch {
        // todavía no escucha
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    await this.kill();
    throw new Error(`El servidor no respondió en /api/health en 15 s:\n${this.output}`);
  }

  private async kill(): Promise<void> {
    const child = this.child;
    this.child = null;
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    const exited = new Promise((r) => child.once('exit', r));
    child.kill();
    await exited;
  }

  /** Reinicio abrupto del servicio: mata el proceso y arranca otro sobre la misma base. */
  async restart(): Promise<void> {
    await this.kill();
    await this.boot();
  }

  /** Salida del proceso (útil para adjuntar al reporte si un test falla). */
  logs(): string {
    return this.output;
  }

  async stop(): Promise<void> {
    await this.kill();
    // Windows puede retener el archivo unos milisegundos tras cerrar el proceso
    rmSync(this.dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { SETUP_TOKEN } from './env';

/** `node backend/src/server.js`: el mismo punto de entrada que en producción. */
export const SERVER_JS = resolve(__dirname, '..', '..', 'backend', 'src', 'server.js');

/** Variables del backend que nunca deben filtrarse desde el entorno de quien ejecuta. */
const BACKEND_VARS = ['PORT', 'DB_PATH', 'APP_VERSION', 'BACKUP_TOKEN', 'FRONTEND_DIST', 'OWNER_SETUP_TOKEN', 'NODE_ENV'];

/**
 * Puertos de cada worker: un rango propio y disjunto (20000 + 20 × índice del worker), por
 * debajo de los rangos efímeros del sistema. Así dos workers nunca eligen el mismo puerto.
 * Con el puerto 0 (el que asigna el sistema) había carreras: el sistema podía dar a otro worker
 * el mismo puerto recién liberado antes de que el servidor lo ocupara.
 */
const PORT_BASE = 20_000;
const PORTS_PER_WORKER = 20;

function isFree(port: number): Promise<boolean> {
  return new Promise((ok) => {
    const srv = createServer();
    srv.once('error', () => ok(false));
    // Sin host, igual que app.listen(PORT) del servidor: todas las interfaces
    srv.listen(port, () => srv.close(() => ok(true)));
  });
}

async function freePort(workerIndex: number): Promise<number> {
  const first = PORT_BASE + (workerIndex % 100) * PORTS_PER_WORKER;
  for (let port = first; port < first + PORTS_PER_WORKER; port++) {
    if (await isFree(port)) return port;
  }
  throw new Error(`No hay puertos libres entre ${first} y ${first + PORTS_PER_WORKER - 1}`);
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

  /** @param workerIndex testInfo.parallelIndex: único entre los workers que corren a la vez. */
  static async start(workerIndex: number, env: Record<string, string> = {}): Promise<AppServer> {
    const dir = mkdtempSync(join(tmpdir(), 'descanso-e2e-'));
    const server = new AppServer(await freePort(workerIndex), join(dir, 'sleep.db'), env, dir);
    try {
      await server.boot();
    } catch (err) {
      await server.stop();
      throw err;
    }
    return server;
  }

  /** Arranca el proceso y espera a que /api/health responda. */
  private async boot(): Promise<void> {
    const env: NodeJS.ProcessEnv = { ...process.env };
    for (const k of BACKEND_VARS) delete env[k];
    // Código de alta de prueba (feature 004); un test puede sobrescribirlo con serverEnv
    Object.assign(env, { OWNER_SETUP_TOKEN: SETUP_TOKEN }, this.env, { PORT: String(this.port), DB_PATH: this.dbPath });

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
        // Que responda NUESTRO proceso: si murió (p. ej. puerto ocupado), respondió otro
        if (res.ok && child.exitCode === null) return;
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
  /**
   * Ejecuta una sentencia SQL sobre la base temporal de este servidor (feature 011). Solo para
   * preparar estados que la API no permite crear a propósito, como una racha activada hace días.
   */
  sql(statement: string, ...params: unknown[]): void {
    const Database = createRequire(SERVER_JS)('better-sqlite3');
    const db = new Database(this.dbPath);
    try {
      db.prepare(statement).run(...params);
    } finally {
      db.close();
    }
  }

  logs(): string {
    return this.output;
  }

  async stop(): Promise<void> {
    await this.kill();
    // Windows puede retener el archivo unos milisegundos tras cerrar el proceso
    rmSync(this.dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

// Humo de memoria y latencia de la entrada (feature 004, SC-005 y SC-006).
// Construye la imagen, la arranca con los límites de producción (256 MB, 1 CPU), da de alta al
// propietario y lanza 10 entradas simultáneas midiendo el pico de memoria con `docker stats`.
// Después mide 5 entradas seguidas (cada una < 1 s).
//
// Uso: node scripts/smoke-login-mem.mjs [--no-build]
// Credenciales: generadas al vuelo, solo viven en este contenedor efímero.
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';

const IMAGE = 'descanso:smoke-004';
const NAME = 'descanso-smoke-004';
const PORT = 3997;
const URL = `http://127.0.0.1:${PORT}`;
const TOKEN = randomBytes(24).toString('hex');
const EMAIL = 'smoke@descanso.test';
const PASSWORD = randomBytes(12).toString('base64url');
const LIMIT_MB = 200;

const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: 'utf8', ...opts }).trim();
const headers = { 'content-type': 'application/json', Origin: URL };
const post = (path, body) => fetch(URL + path, { method: 'POST', headers, body: JSON.stringify(body) });

function toMb(usage) {
  const [value, unit] = usage.split('/')[0].trim().match(/([\d.]+)\s*([KMG]i?B)/).slice(1);
  return Number(value) * { KiB: 1 / 1024, KB: 1 / 1000, MiB: 1, MB: 1, GiB: 1024, GB: 1000 }[unit];
}

async function main() {
  if (!process.argv.includes('--no-build')) {
    console.log('Construyendo la imagen…');
    sh('docker', ['build', '-q', '-t', IMAGE, '.'], { stdio: ['ignore', 'pipe', 'inherit'] });
  }
  try { sh('docker', ['rm', '-f', NAME], { stdio: 'ignore' }); } catch { /* no existía */ }
  sh('docker', ['run', '-d', '--rm', '--name', NAME, '--memory=256m', '--cpus=1', '-p', `${PORT}:3000`,
    '-e', 'DB_PATH=/data/sleep.db', '-e', `OWNER_SETUP_TOKEN=${TOKEN}`, IMAGE]);

  try {
    for (let i = 0; i < 60; i++) {
      try { if ((await fetch(`${URL}/api/health`)).ok) break; } catch { /* arrancando */ }
      await new Promise((r) => setTimeout(r, 500));
    }
    const setup = await post('/api/auth/setup', { token: TOKEN, email: EMAIL, password: PASSWORD });
    if (setup.status !== 201) throw new Error(`Alta fallida: ${setup.status} ${await setup.text()}`);

    // Muestreo de memoria en paralelo a las 10 entradas simultáneas
    let peak = 0;
    let sampling = true;
    const sampler = (async () => {
      while (sampling) {
        const out = await new Promise((resolve) => {
          const p = spawn('docker', ['stats', '--no-stream', '--format', '{{.MemUsage}}', NAME]);
          let s = '';
          p.stdout.on('data', (d) => (s += d));
          p.on('close', () => resolve(s));
        });
        if (out.trim()) peak = Math.max(peak, toMb(out));
      }
    })();

    const t0 = performance.now();
    const results = await Promise.all(Array.from({ length: 10 }, () => post('/api/auth/login', { email: EMAIL, password: PASSWORD })));
    const concurrentMs = performance.now() - t0;
    sampling = false;
    await sampler;
    const statuses = results.map((r) => r.status);
    const restarts = sh('docker', ['inspect', '-f', '{{.RestartCount}} {{.State.OOMKilled}}', NAME]);

    const times = [];
    for (let i = 0; i < 5; i++) {
      const t = performance.now();
      const r = await post('/api/auth/login', { email: EMAIL, password: PASSWORD });
      times.push(Math.round(performance.now() - t));
      if (r.status !== 200) throw new Error(`Entrada secuencial ${i + 1}: ${r.status}`);
    }

    console.log(`10 entradas simultáneas: ${statuses.join(' ')} en ${Math.round(concurrentMs)} ms`);
    console.log(`Pico de memoria: ${peak.toFixed(1)} MB (límite de la prueba ${LIMIT_MB} MB, contenedor 256 MB); reinicios/OOM: ${restarts}`);
    console.log(`5 entradas seguidas (ms): ${times.join(', ')}`);

    const ok = statuses.every((s) => s === 200) && peak > 0 && peak < LIMIT_MB && restarts === '0 false' && times.every((t) => t < 1000);
    console.log(ok ? 'OK: SC-005 y SC-006 se cumplen' : 'FALLO');
    process.exitCode = ok ? 0 : 1;
  } finally {
    try { sh('docker', ['stop', NAME], { stdio: 'ignore' }); } catch { /* ya parado */ }
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});

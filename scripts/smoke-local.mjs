// Verificación local automatizada (quickstart §3 de 005) y sembrado de datos bajo demanda.
//
// Uso:
//   node scripts/smoke-local.mjs run   [opciones]   arranca un servidor local, siembra y verifica; luego lo para
//   node scripts/smoke-local.mjs serve [opciones]   arranca el servidor (y siembra si se pide) y lo deja abierto
//   node scripts/smoke-local.mjs seed  [opciones]   solo siembra contra un servidor ya en marcha (--url)
//   node scripts/smoke-local.mjs help
//
// Opciones (todas con valor por defecto):
//   --port 3995            puerto del servidor local (run/serve)
//   --url URL              servidor destino; por defecto http://localhost:<port>
//   --db tmp/smoke/sleep.db  base SQLite del servidor local (run/serve)
//   --fresh                borra la base local antes de arrancar (run lo hace siempre)
//   --build                compila el frontend antes de arrancar
//   --days 30              días hacia atrás a sembrar (hoy incluido)
//   --gap-every 4          deja un día sin noche cada N días (0 = sin huecos)
//   --nap-every 5          añade una siesta de 40 min cada N días (0 = sin siestas)
//   --open-night           deja abierta la noche de hoy (por defecto en run; flag en seed/serve)
//   --metrics              registra "Calidad del sueño" (1–5) en los días con noche
//   --seed 42              semilla del generador: mismos datos en cada ejecución
//   --tz -04:00            desfase de las horas sembradas
//   --email / --password   cuenta con la que se siembra (por defecto, la del propietario de pruebas)
//   --token                código de alta del servidor local (por defecto, el de las e2e)
//   --no-seed              serve sin sembrar
//   --allow-remote         permite sembrar contra un host que no sea localhost (no recomendado)
//
// Las credenciales por defecto son las de prueba de e2e/support/env.ts: solo existen en bases
// locales temporales. El sembrado se niega a escribir fuera de localhost salvo con --allow-remote.
import { spawn, execSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULTS = {
  port: 3995, url: '', db: 'tmp/smoke/sleep.db', fresh: false, build: false,
  days: 30, 'gap-every': 4, 'nap-every': 5, 'open-night': false, metrics: false, seed: 42, tz: '-04:00',
  email: 'propietario@descanso.test', password: 'una frase de prueba larga', token: 'e2e-codigo-de-alta',
  'no-seed': false, 'allow-remote': false,
};
const FLAGS = new Set(['fresh', 'build', 'open-night', 'metrics', 'no-seed', 'allow-remote']);

function parseArgs(argv) {
  const [command = 'help', ...rest] = argv;
  const opts = { ...DEFAULTS };
  for (let i = 0; i < rest.length; i++) {
    const key = rest[i].replace(/^--/, '');
    if (!(key in DEFAULTS)) throw new Error(`Opción desconocida: ${rest[i]}`);
    if (FLAGS.has(key)) opts[key] = true;
    else {
      const value = rest[++i];
      if (value === undefined) throw new Error(`Falta el valor de --${key}`);
      opts[key] = typeof DEFAULTS[key] === 'number' ? Number(value) : value;
    }
  }
  opts.url ||= `http://localhost:${opts.port}`;
  return { command, opts };
}

// --- Cliente HTTP con cookie de sesión y Origin (defensa CSRF de 004) ---
function client(base) {
  let cookie = '';
  return async function call(method, path, body) {
    const res = await fetch(base + path, {
      method,
      headers: { 'content-type': 'application/json', Origin: base, ...(cookie ? { Cookie: cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { status: res.status, data };
  };
}

// --- Generador determinista (mulberry32) para que --seed repita los mismos datos ---
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pad = (n) => String(n).padStart(2, '0');
/** Fecha local (YYYY-MM-DD) en el desfase dado, desplazada n días. */
function localDate(tz, n = 0) {
  const [, sign, h, m] = tz.match(/([+-])(\d\d):(\d\d)/);
  const offsetMin = (sign === '-' ? -1 : 1) * (Number(h) * 60 + Number(m));
  const d = new Date(Date.now() + offsetMin * 60_000 + n * 86_400_000);
  return d.toISOString().slice(0, 10);
}
const at = (date, minutes, tz) => {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCMinutes(minutes);
  return `${day.toISOString().slice(0, 16)}:00${tz}`;
};

function assertLocal(url, allowRemote) {
  const host = new URL(url).hostname;
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(host) || host.endsWith('.localhost') || host.endsWith('.test');
  if (!local && !allowRemote) throw new Error(`Me niego a sembrar en ${host}: solo localhost (usa --allow-remote si de verdad lo quieres)`);
}

/** Da de alta al propietario si hace falta (solo con el código de alta) y entra. */
async function signIn(call, opts) {
  const status = (await call('GET', '/api/auth/status')).data;
  if (status?.state === 'setup') {
    const setup = await call('POST', '/api/auth/setup', { token: opts.token, email: opts.email, password: opts.password });
    if (setup.status !== 201) throw new Error(`Alta del propietario: ${setup.status} ${JSON.stringify(setup.data)}`);
  }
  const login = await call('POST', '/api/auth/login', { email: opts.email, password: opts.password });
  if (login.status !== 200) throw new Error(`Entrar: ${login.status} ${JSON.stringify(login.data)}`);
  return login.data;
}

/**
 * Siembra noches (fecha de noche = día en que te acuestas, principio III), siestas, valores de
 * métrica y, opcionalmente, la noche abierta de hoy. Los días que ya tienen noche se saltan.
 */
async function seed(call, opts) {
  const random = rng(opts.seed);
  const existing = new Set(((await call('GET', '/api/sleep')).data ?? []).map((r) => r.date));
  const quality = opts.metrics ? ((await call('GET', '/api/metrics')).data ?? []).find((m) => m.name === 'Calidad del sueño') : null;
  const count = { nights: 0, naps: 0, metrics: 0, skipped: 0, open: false };

  for (let i = opts.days - 1; i >= 1; i--) {
    const date = localDate(opts.tz, -i);
    const next = localDate(opts.tz, -i + 1);
    if (opts['gap-every'] > 0 && i % opts['gap-every'] === 0) continue;
    if (existing.has(date)) { count.skipped++; continue; }
    const bed = 21 * 60 + 30 + Math.floor(random() * 150); // 21:30–23:59
    const bedMin = Math.min(bed, 23 * 60 + 59);
    const sleepMin = 360 + Math.floor(random() * 150); // 6 h–8 h 30
    const wakeTotal = bedMin + sleepMin - 1440; // minutos del día siguiente
    const res = await call('POST', '/api/sleep', { date, bedtime: at(date, bedMin, opts.tz), wake_time: at(next, wakeTotal, opts.tz) });
    if (res.status !== 201) throw new Error(`Noche ${date}: ${res.status} ${JSON.stringify(res.data)}`);
    count.nights++;
    if (opts['nap-every'] > 0 && i % opts['nap-every'] === 0) {
      const nap = await call('POST', '/api/naps', { date, start_time: at(date, 14 * 60, opts.tz), end_time: at(date, 14 * 60 + 40, opts.tz) });
      if (nap.status === 201) count.naps++;
    }
    if (quality) {
      const v = await call('PUT', `/api/metrics/${quality.id}/entries/${date}`, { value: 1 + Math.floor(random() * 5) });
      if (v.status === 200) count.metrics++;
    }
  }
  if (opts['open-night']) {
    const today = localDate(opts.tz);
    const open = await call('GET', '/api/sleep/open');
    if (!open.data) {
      // Una hora antes de ahora (o 00:00 si es muy temprano), para no quedar en el futuro
      const nowMin = Math.max(0, Math.floor(((Date.now() / 60_000) + tzMinutes(opts.tz)) % 1440) - 60);
      const res = await call('POST', '/api/sleep', { date: today, bedtime: at(today, nowMin, opts.tz) });
      count.open = res.status === 201;
    }
  }
  return count;
}
function tzMinutes(tz) {
  const [, sign, h, m] = tz.match(/([+-])(\d\d):(\d\d)/);
  return (sign === '-' ? -1 : 1) * (Number(h) * 60 + Number(m));
}

// --- Servidor local ---
async function startServer(opts) {
  const db = resolve(ROOT, opts.db);
  if (opts.fresh) rmSync(dirname(db), { recursive: true, force: true });
  mkdirSync(dirname(db), { recursive: true });
  if (opts.build) {
    console.log('· compilando el frontend…');
    execSync('npm run build', { cwd: resolve(ROOT, 'frontend'), stdio: 'inherit' });
  }
  if (!existsSync(resolve(ROOT, 'frontend/dist/frontend/browser/index.html'))) {
    console.warn('! No hay build del frontend: la API funciona, pero la web no. Usa --build.');
  }
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: resolve(ROOT, 'backend'),
    env: { ...process.env, DB_PATH: db, PORT: String(opts.port), OWNER_SETUP_TOKEN: opts.token, NODE_ENV: 'development' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const logs = [];
  child.stdout.on('data', (d) => logs.push(String(d)));
  child.stderr.on('data', (d) => logs.push(String(d)));
  for (let i = 0; i < 60; i++) {
    if (child.exitCode !== null) throw new Error(`El servidor terminó al arrancar:\n${logs.join('')}`);
    try {
      if ((await fetch(`${opts.url}/api/health`)).ok) {
        console.log(`· servidor en ${opts.url} (base ${db})`);
        logs.filter((l) => l.includes('[migraciones]')).forEach((l) => console.log(`  ${l.trim()}`));
        return child;
      }
    } catch { /* aún arrancando */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  child.kill();
  throw new Error(`El servidor no respondió en 30 s (¿puerto ${opts.port} ocupado?)\n${logs.join('')}`);
}

// --- Verificaciones del quickstart §3 por API ---
async function verify(call, opts) {
  const results = [];
  const check = (name, ok, detail = '') => results.push({ name, ok: !!ok, detail });
  const today = localDate(opts.tz);
  const dash = async (days) => (await call('GET', `/api/dashboard?days=${days}&to=${today}`)).data;

  const status = (await call('GET', '/api/auth/status')).data;
  check('1 · cuenta nueva sin bienvenida vista (onboarded=false)', status.onboarded === false, `onboarded=${status.onboarded}`);
  const bad = await call('POST', '/api/me/onboarding', { sleep_goal_min: 780 });
  check('1 · bienvenida rechaza 13 h (400)', bad.status === 400, `${bad.status}`);
  const welcome = await call('POST', '/api/me/onboarding', { sleep_goal_min: 450 });
  const after = (await call('GET', '/api/auth/status')).data;
  check('1 · bienvenida con "7 h 30 (5 ciclos)" → objetivo 450 y onboarded', welcome.status === 200 && after.onboarded === true, `${welcome.status}`);

  const seeded = await seed(call, { ...opts, 'open-night': true });
  check('2 · siembra', seeded.nights > 0, JSON.stringify(seeded));

  for (const days of [7, 30, 90]) {
    const d = await dash(days);
    check(`2 · periodo ${days} días: ${days} filas`, d?.days?.length === days, `${d?.days?.length}`);
  }
  const d30 = await dash(30);
  const statuses = d30.days.map((x) => x.status);
  check('2 · hay días "sin dato" (none) con total null, nunca 0', d30.days.some((x) => x.status === 'none' && x.total_min === null));
  check('2 · hoy está "en curso" (noche abierta)', statuses[statuses.length - 1] === 'in_progress', statuses[statuses.length - 1]);
  check('2 · resumen "X de Y" coherente', d30.summary.goal_met <= d30.summary.days_with_data && d30.summary.days_with_data > 0,
    `${d30.summary.goal_met} de ${d30.summary.days_with_data}`);
  check('2 · objetivo del dashboard = 450', d30.goal_min === 450, `${d30.goal_min}`);
  check('2 · pendiente 14 días calculado', d30.pending14 && typeof d30.pending14.days === 'number', JSON.stringify(d30.pending14));
  check('2 · ciclos: 3 atajos dentro de 4–12 h', d30.cycles?.shortcuts?.length === 3 && d30.cycles.shortcuts.every((s) => s.minutes >= 240 && s.minutes <= 720));

  const tooLong = await call('PUT', '/api/me', { sleep_goal_min: 780 });
  check('2 · editar objetivo a 13 h → 400', tooLong.status === 400, `${tooLong.status} ${tooLong.data?.error ?? ''}`);
  const shortcut = await call('PUT', '/api/me', { sleep_goal_min: d30.cycles.shortcuts[0].minutes });
  check('2 · editar objetivo con un atajo → 200', shortcut.status === 200, `${shortcut.status}`);

  const reg30 = d30.regularity;
  check('3 · regularidad con ≥ 7 noches', reg30 && reg30.nights >= 7, JSON.stringify(reg30));
  const empty = (await call('GET', `/api/dashboard?days=7&to=${localDate(opts.tz, -400)}`)).data;
  check('3 · periodo sin noches → "Aún no hay datos suficientes" (regularity null)', empty.regularity === null);

  const badPeriod = await call('GET', `/api/dashboard?days=14&to=${today}`);
  check('Borde · periodo no permitido → 400', badPeriod.status === 400, badPeriod.data?.error ?? '');
  return results;
}

async function main() {
  const { command, opts } = parseArgs(process.argv.slice(2));
  if (command === 'help' || !['run', 'serve', 'seed'].includes(command)) {
    const text = (await import('node:fs')).readFileSync(fileURLToPath(import.meta.url), 'utf8');
    console.log(text.split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n'));
    return;
  }

  if (command === 'seed') {
    assertLocal(opts.url, opts['allow-remote']);
    const call = client(opts.url);
    await signIn(call, opts);
    const count = await seed(call, opts);
    console.log(`· sembrado en ${opts.url} como ${opts.email}:`, count);
    return;
  }

  if (command === 'serve') {
    const server = await startServer(opts);
    if (!opts['no-seed']) {
      const call = client(opts.url);
      await signIn(call, opts);
      console.log('· sembrado:', await seed(call, opts));
    }
    console.log(`\nAbre ${opts.url} y entra con la cuenta de pruebas (--email / --password).`);
    console.log('Para más datos, en otra terminal: node scripts/smoke-local.mjs seed --days 90 --metrics');
    console.log('Ctrl+C para parar.');
    const stop = () => { server.kill(); process.exit(0); };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
    return;
  }

  // run: base nueva siempre, para que la bienvenida y la siembra sean reproducibles
  const server = await startServer({ ...opts, fresh: true });
  let failed = 0;
  try {
    const call = client(opts.url);
    await signIn(call, opts);
    for (const r of await verify(call, opts)) {
      if (!r.ok) failed++;
      console.log(`${r.ok ? '✔' : '✘'} ${r.name}${r.detail ? `  (${r.detail})` : ''}`);
    }
  } finally {
    server.kill();
  }
  console.log(failed ? `\n${failed} comprobación(es) fallaron` : '\nTodo correcto. El paso 4 (lector de pantalla) lo cubre la e2e tendencias.spec.ts.');
  process.exitCode = failed ? 1 : 0;
}

main().catch((e) => {
  console.error(`✘ ${e.message}`);
  process.exitCode = 1;
});

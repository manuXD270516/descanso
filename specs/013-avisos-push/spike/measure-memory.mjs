// Spike de 013, punto 7: memoria del servicio real con web-push cargado y un "tick" de avisos cada
// 30 s durante N minutos. Usa la app de verdad (Express + SQLite en memoria) con datos sintéticos.
// Uso: node measure-memory.mjs --vendor <dir con node_modules/web-push> [--minutes 10]
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : def;
};
const MINUTES = Number(arg('minutes', 10));
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
process.env.DB_PATH = ':memory:';
const requireApp = createRequire(path.join(ROOT, 'backend', 'package.json'));
const mb = () => Math.round(process.memoryUsage().rss / 1048576);
const base = mb();

const app = requireApp('./src/app');
const db = requireApp('./src/db');
const webpush = createRequire(path.join(arg('vendor'), 'package.json'))('web-push');
const keys = webpush.generateVAPIDKeys();
webpush.setVapidDetails('mailto:spike@descanso.test', keys.publicKey, keys.privateKey);
const server = app.listen(0);
const afterLoad = mb();

// Tick sintético: lo que hará el disparador de 013 (consultar horarios y preparar cifrado de un envío)
let peak = afterLoad;
let ticks = 0;
const tick = () => {
  db.prepare('SELECT COUNT(*) AS c FROM schedule_versions').get();
  webpush.generateRequestDetails(
    { endpoint: 'https://fcm.googleapis.com/fcm/send/spike', keys: { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' } },
    JSON.stringify({ title: 'Descanso', body: 'Descanso: es tu hora de dormir' }),
  );
  ticks++;
  peak = Math.max(peak, mb());
};
const timer = setInterval(tick, 30_000);
tick();
const sampler = setInterval(() => { peak = Math.max(peak, mb()); }, 5_000);
setTimeout(() => {
  clearInterval(timer);
  clearInterval(sampler);
  server.close();
  console.log(JSON.stringify({ minutes: MINUTES, ticks, rss_mb: { node_base: base, app_y_webpush: afterLoad, pico: peak, final: mb() }, limite_mb: 256 }));
}, MINUTES * 60_000);

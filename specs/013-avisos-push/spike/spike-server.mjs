// Spike de 013 (avisos push): servidor mínimo e independiente de la app para comprobar en un Android
// real la entrega de Web Push con Chrome cerrado, la latencia, el clic que abre "Noche", la caducidad
// (TTL) y el colapso de avisos, y qué pasa con una pestaña visible. Sin datos de salud: solo textos de
// prueba. No es código de la app.
//
// Uso (las claves y suscripciones viven FUERA del repositorio, en --data):
//   node spike-server.mjs --vendor <dir con node_modules/web-push> --data <dir> [--port 3996]
//   El móvil abre http://localhost:3996 por USB con `adb reverse tcp:3996 tcp:3996` (localhost es
//   contexto seguro, así que no hace falta HTTPS).
// Envíos (desde el PC):
//   curl -X POST localhost:3996/send -d '{"type":"prepare","ttl":600}'
//   curl -X POST localhost:3996/send -d '{"type":"bedtime","ttl":60,"topic":"bedtime"}'
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : def;
};
const PORT = Number(arg('port', 3996));
const DATA = arg('data');
const VENDOR = arg('vendor');
if (!DATA || !VENDOR) {
  console.error('Faltan --data y --vendor');
  process.exit(1);
}
const webpush = createRequire(path.join(VENDOR, 'package.json'))('web-push');
const vapid = JSON.parse(fs.readFileSync(path.join(DATA, 'vapid.json'), 'utf8'));
webpush.setVapidDetails('mailto:spike@descanso.test', vapid.publicKey, vapid.privateKey);
const SUBS = path.join(DATA, 'subscriptions.json');
const LOG = path.join(DATA, 'spike-log.jsonl');
const subs = () => (fs.existsSync(SUBS) ? JSON.parse(fs.readFileSync(SUBS, 'utf8')) : []);
const log = (entry) => {
  const line = { at: new Date().toISOString(), ...entry };
  fs.appendFileSync(LOG, JSON.stringify(line) + '\n');
  console.log(JSON.stringify(line));
};

// Textos de 013 (FR-022: sin datos de salud ni racha)
const TEXTS = {
  prepare: 'Descanso: en 30 min es tu hora de dormir',
  bedtime: 'Descanso: es tu hora de dormir',
  wake_check: 'Descanso: ¿ya despertaste?',
  test: 'Descanso: aviso de prueba',
};

const PAGE = `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Spike avisos</title>
<body style="font-family:system-ui;padding:1rem;background:#131a33;color:#eceaf6">
<h1 id="noche">Spike de avisos (013)</h1>
<p id="state">Comprobando…</p>
<button id="on" style="font-size:1.2rem;padding:.6rem 1rem">Activar avisos</button>
<p>Ruta actual: <b id="hash"></b></p>
<ul id="inapp"></ul>
<script>
const $ = (id) => document.getElementById(id);
const key = ${JSON.stringify(vapid.publicKey)};
const b64 = (s) => Uint8Array.from(atob((s + '='.repeat((4 - s.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const show = () => { $('hash').textContent = location.hash || '(sin hash)'; };
show(); addEventListener('hashchange', show);
async function state() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return $('state').textContent = 'Sin soporte';
  const reg = await navigator.serviceWorker.register('/sw.js');
  const sub = await reg.pushManager.getSubscription();
  $('state').textContent = 'Permiso: ' + Notification.permission + ' · suscrito: ' + (sub ? 'sí' : 'no');
}
$('on').onclick = async () => {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return state();
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(key) });
  await fetch('/subscribe', { method: 'POST', body: JSON.stringify(sub) });
  state();
};
navigator.serviceWorker?.addEventListener('message', (e) => {
  const li = document.createElement('li'); li.textContent = 'Dentro de la app: ' + e.data.body; $('inapp').prepend(li);
});
state();
</script></body></html>`;

// Con una pestaña visible, el aviso se muestra dentro de la app (FR-019); si no, como notificación.
const SW = `self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('push', (event) => {
  const d = event.data ? event.data.json() : {};
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const visible = wins.find((c) => c.visibilityState === 'visible');
    const ack = (shown) => fetch('/ack', { method: 'POST', body: JSON.stringify({ id: d.id, type: d.type, receivedAt: Date.now(), shown }) }).catch(() => {});
    if (visible && d.inAppWhenVisible) { visible.postMessage(d); return ack('in-app'); }
    await self.registration.showNotification(d.title, { body: d.body, tag: d.tag, data: { url: d.url } });
    return ack('notification');
  })());
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data.url, self.location.origin).href;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of wins) { await c.focus(); return c.navigate(url); }
    return self.clients.openWindow(url);
  })());
});`;

const body = (req) => new Promise((ok) => { let s = ''; req.on('data', (c) => (s += c)); req.on('end', () => ok(s ? JSON.parse(s) : {})); });
let seq = 0;

http.createServer(async (req, res) => {
  const send = (code, type, payload) => { res.writeHead(code, { 'Content-Type': type }); res.end(payload); };
  try {
    if (req.method === 'GET' && req.url === '/') return send(200, 'text/html; charset=utf-8', PAGE);
    if (req.method === 'GET' && req.url === '/sw.js') return send(200, 'text/javascript', SW);
    if (req.method === 'POST' && req.url === '/subscribe') {
      const sub = await body(req);
      const all = subs().filter((s) => s.endpoint !== sub.endpoint);
      all.push(sub);
      fs.writeFileSync(SUBS, JSON.stringify(all), { mode: 0o600 });
      log({ event: 'subscribed', service: new URL(sub.endpoint).host, count: all.length });
      return send(201, 'application/json', '{}');
    }
    if (req.method === 'POST' && req.url === '/ack') {
      const a = await body(req);
      const sent = Number(a.id?.split('-')[0]);
      log({ event: 'received', id: a.id, type: a.type, shown: a.shown, latency_ms: sent ? a.receivedAt - sent : null });
      return send(204, 'text/plain', '');
    }
    if (req.method === 'POST' && req.url === '/send') {
      const o = await body(req);
      const type = o.type ?? 'test';
      const id = `${Date.now()}-${++seq}`;
      const payload = {
        id, type, title: 'Descanso', body: TEXTS[type] ?? TEXTS.test,
        tag: o.tag ?? type, url: type === 'wake_check' ? '/#noche-despertar' : '/#noche', inAppWhenVisible: o.inApp ?? true,
      };
      const results = [];
      for (const s of subs()) {
        try {
          const r = await webpush.sendNotification(s, JSON.stringify(payload), { TTL: o.ttl ?? 600, urgency: o.urgency ?? 'high', topic: o.topic });
          results.push({ status: r.statusCode });
        } catch (e) {
          results.push({ status: e.statusCode ?? 'error', error: String(e.body ?? e.message).slice(0, 120) });
        }
      }
      log({ event: 'sent', id, type, ttl: o.ttl ?? 600, topic: o.topic ?? null, results });
      return send(200, 'application/json', JSON.stringify({ id, results }));
    }
    send(404, 'text/plain', 'No encontrado');
  } catch (e) {
    send(500, 'text/plain', String(e.message));
  }
}).listen(PORT, () => console.log(`Spike de avisos en http://localhost:${PORT}`));

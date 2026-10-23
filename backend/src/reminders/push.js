// Envío de avisos por Web Push (feature 013, research R5, R6 y R8): validación de dispositivos,
// textos fijos de los avisos y envío con `web-push`. Nunca lanza al enviar: devuelve un resultado.
const crypto = require('node:crypto');
const http = require('node:http');
const webpush = require('web-push');
const { HttpError } = require('../util');
const { ttlSeconds } = require('./windows');

const SEND_TIMEOUT_MS = 10_000;
const MAX_ENDPOINT = 1024;
const BASE64URL = /^[A-Za-z0-9_-]+$/;

// FR-023: solo servicios de push de navegador conocidos (anti-SSRF)
const EXACT_HOSTS = new Set(['fcm.googleapis.com', 'web.push.apple.com']);
const SUFFIX_HOSTS = ['.push.services.mozilla.com', '.notify.windows.com'];
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);

/**
 * Costura de pruebas (R6 y R17): con NODE_ENV=test, PUSH_TEST_ORIGIN=http://<loopback>:<puerto> se
 * admite además ese único origen. Con cualquier otro NODE_ENV, o si no es loopback, se ignora.
 */
function testOrigin() {
  const raw = process.env.PUSH_TEST_ORIGIN;
  if (!raw || process.env.NODE_ENV !== 'test') return null;
  try {
    const u = new URL(raw);
    return u.protocol === 'http:' && LOOPBACK.has(u.hostname) && u.port ? u.origin : null;
  } catch {
    return null;
  }
}

const hostAllowed = (host) => EXACT_HOSTS.has(host) || SUFFIX_HOSTS.some((s) => host.endsWith(s) && host.length > s.length);

/** Endpoint admitido: https sin credenciales ni puerto, host conocido y ≤ 1.024 caracteres. */
function endpointAllowed(endpoint) {
  if (typeof endpoint !== 'string' || endpoint.length > MAX_ENDPOINT) return false;
  let u;
  try { u = new URL(endpoint); } catch { return false; }
  const seam = testOrigin();
  if (seam && u.origin === seam) return !u.username && !u.password;
  return u.protocol === 'https:' && !u.username && !u.password && u.port === '' && hostAllowed(u.hostname);
}

const keyOk = (v, length) => typeof v === 'string' && v.length === length && BASE64URL.test(v);

/** Valida lo que manda el navegador; devuelve { endpoint, p256dh, auth } o lanza HttpError 400. */
function validateSubscription({ endpoint, keys } = {}) {
  if (!endpointAllowed(endpoint)) throw new HttpError(400, 'Este navegador no usa un servicio de avisos compatible');
  if (!keyOk(keys?.p256dh, 87) || !keyOk(keys?.auth, 22)) throw new HttpError(400, 'Datos del dispositivo no válidos');
  return { endpoint, p256dh: keys.p256dh, auth: keys.auth };
}

/** Nombre legible del dispositivo, sin guardar el User-Agent (R8). */
function deviceLabel(ua) {
  const s = typeof ua === 'string' ? ua : '';
  const browser = /SamsungBrowser/.test(s) ? 'Samsung Internet'
    : /Edg(e|A|iOS)?\//.test(s) ? 'Edge'
      : /OPR\/|Opera/.test(s) ? 'Opera'
        : /Firefox\/|FxiOS\//.test(s) ? 'Firefox'
          : /Chrome\/|CriOS\//.test(s) ? 'Chrome'
            : /Safari\//.test(s) ? 'Safari' : null;
  if (!browser) return 'Navegador';
  const system = /Android/.test(s) ? 'Android'
    : /iPhone|iPad|iPod/.test(s) ? 'iPhone'
      : /Windows/.test(s) ? 'Windows'
        : /Macintosh|Mac OS X/.test(s) ? 'macOS'
          : /Linux|X11/.test(s) ? 'Linux' : null;
  return (system ? `${browser} en ${system}` : browser).slice(0, 40);
}

/** Huella pública de un endpoint: 16 hexadecimales del SHA-256 (el navegador marca "Este móvil"). */
const fingerprint = (endpoint) => crypto.createHash('sha256').update(endpoint).digest('hex').slice(0, 16);

/** Carga del aviso: textos fijos, sin datos de sueño ni de salud (FR-022). */
function payloadFor(kind, night, leadMin) {
  const body = {
    prepare: `en ${leadMin} min es tu hora de dormir`,
    bedtime: 'es tu hora de dormir',
    wake_check: '¿ya despertaste?',
    test: 'aviso de prueba',
  }[kind];
  if (!body) throw new Error(`payloadFor: tipo desconocido ${kind}`);
  const isTest = kind === 'test';
  return {
    kind,
    night: isTest ? null : night,
    title: 'Descanso',
    body,
    tag: isTest ? 'test' : `${kind}-${night}`,
    url: kind === 'wake_check' ? '/#noche-despertar' : '/#noche',
  };
}

const vapid = () => ({
  publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY, subject: process.env.VAPID_SUBJECT,
});

/** Los avisos solo funcionan con las tres variables VAPID definidas (FR-024). */
function available() {
  const v = vapid();
  return Boolean(v.publicKey && v.privateKey && v.subject);
}

let configuredWith = null;
/** Fija las credenciales VAPID en la librería (una vez; de nuevo si cambian). */
function configure() {
  if (process.env.PUSH_TEST_ORIGIN && process.env.NODE_ENV !== 'test') {
    console.warn('PUSH_TEST_ORIGIN ignorada: solo se admite con NODE_ENV=test');
  }
  if (!available()) return false;
  const v = vapid();
  const key = `${v.subject}|${v.publicKey}|${v.privateKey}`;
  if (configuredWith !== key) {
    webpush.setVapidDetails(v.subject, v.publicKey, v.privateKey);
    configuredWith = key;
  }
  return true;
}

/** Envío al origen de pruebas (http de loopback): la librería solo habla https. */
function sendToTestOrigin(subscription, body, options) {
  const details = webpush.generateRequestDetails(subscription, body, options);
  return new Promise((resolve, reject) => {
    const u = new URL(details.endpoint);
    const req = http.request(
      { hostname: u.hostname, port: u.port, path: `${u.pathname}${u.search}`, method: details.method, headers: details.headers, timeout: options.timeout },
      (res) => {
        res.resume();
        res.on('end', () => (res.statusCode >= 200 && res.statusCode <= 299 ? resolve({ statusCode: res.statusCode }) : reject(Object.assign(new Error('Received unexpected response code'), { statusCode: res.statusCode }))));
      },
    );
    req.on('timeout', () => req.destroy(new Error('Socket timeout')));
    req.on('error', reject);
    req.end(details.body);
  });
}

/**
 * Envía `payload` a un dispositivo { endpoint, p256dh, auth }. Resultado: 'ok', 'expired' (404 o 410:
 * el dispositivo ya no vale), 'timeout' o 'error'. No lanza.
 */
async function send(sub, payload, kind) {
  let timer;
  try {
    if (!configure()) return 'error';
    if (!endpointAllowed(sub.endpoint)) return 'error'; // defensa en profundidad (R6)
    const subscription = { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } };
    const options = { TTL: ttlSeconds(kind), topic: kind, urgency: 'high', timeout: SEND_TIMEOUT_MS };
    const body = JSON.stringify(payload);
    const seam = testOrigin();
    const sending = seam && new URL(sub.endpoint).origin === seam
      ? sendToTestOrigin(subscription, body, options)
      : webpush.sendNotification(subscription, body, options);
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Socket timeout')), SEND_TIMEOUT_MS + 500);
      timer.unref?.();
    });
    sending.catch(() => {}); // si gana el plazo, el rechazo tardío no queda sin atender
    await Promise.race([sending, deadline]);
    return 'ok';
  } catch (err) {
    if (err?.statusCode === 404 || err?.statusCode === 410) return 'expired';
    if (/timed? ?out|Socket timeout|ETIMEDOUT/i.test(err?.message || '') || err?.code === 'ETIMEDOUT') return 'timeout';
    console.warn(`Aviso push no enviado (${kind}): ${err?.statusCode ?? err?.code ?? err?.message}`);
    return 'error';
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  validateSubscription, endpointAllowed, deviceLabel, fingerprint, payloadFor, available, configure, send, testOrigin, SEND_TIMEOUT_MS,
};

const app = require('./app');
const db = require('./db');
const { storageStatus } = require('./storage');
const { bootstrap } = require('./auth/bootstrap');
const push = require('./reminders/push');
const { startWaker } = require('./reminders/waker');
const { runTick } = require('./reminders/tick');

bootstrap(db); // si OWNER_SETUP_TOKEN cambió, reabre el alta del propietario (feature 004)

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`Sleep tracker API escuchando en http://localhost:${PORT}`);
  storageStatus(); // avisa en el log si el volumen supera el 70 %
});

// Avisos push (feature 013, R1): el disparador vive en este proceso. Sin las tres variables VAPID, o con
// REMINDER_WAKER=off, la feature queda desactivada y el resto de la app funciona igual (FR-024).
let waker = null;
push.configure(); // avisa en el log si hay una costura de pruebas fuera de NODE_ENV=test
if (!push.available()) {
  console.warn('Avisos push desactivados: faltan VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY o VAPID_SUBJECT');
} else if (process.env.REMINDER_WAKER === 'off') {
  console.warn('Avisos push sin disparador: REMINDER_WAKER=off');
} else {
  waker = startWaker(() => runTick());
  console.log('Avisos push: disparador en marcha (cada 30 s)');
}

// Cierre limpio durante el despliegue: detiene el disparador y deja de aceptar peticiones
function shutdown() {
  waker?.stop();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

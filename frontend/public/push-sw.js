// Service worker mínimo de Descanso (feature 013): solo recibe avisos push y abre la app al tocarlos.
// Sin manejador "fetch" ni caché: no intercepta nada y no puede servir versiones viejas tras un
// despliegue. Contrato: specs/013-avisos-push/contracts/service-worker.md.
/* global self, clients, registration */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim()); // controla la pestaña ya abierta para poder navegarla al tocar el aviso
});

self.addEventListener('push', (event) => {
  let data = null;
  try {
    data = event.data.json();
  } catch {
    data = null; // carga ilegible: aviso genérico, Chrome exige mostrar algo
  }
  event.waitUntil(show(data));
});

async function show(data) {
  if (data) {
    const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    const visible = windows.find((w) => w.visibilityState === 'visible');
    if (visible) {
      // Con la app a la vista el aviso se muestra dentro de ella, sin notificación del sistema
      visible.postMessage({ type: 'descanso-push', ...data });
      return;
    }
  }
  const title = data?.title || 'Descanso';
  const options = { icon: '/favicon.ico' };
  if (data) {
    options.body = data.body;
    options.tag = data.tag;
    options.data = { url: data.url };
  }
  await registration.showNotification(title, options);
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/#noche';
  event.waitUntil(open(url));
});

async function open(url) {
  const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true });
  if (windows.length) {
    const win = windows[0];
    await win.focus();
    try {
      await win.navigate(url); // la misma pestaña, sin abrir otra
    } catch {
      // una pestaña sin controlar no se puede navegar: se queda enfocada
    }
    return;
  }
  await clients.openWindow(url);
}

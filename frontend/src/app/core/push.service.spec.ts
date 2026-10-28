import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PUSH_PLATFORM, PushPermissionError, PushService } from './push.service';
import { PUSH_STATE, FakePlatform, fakePlatform, fakeSubscription } from './push-testing.spec';

// PushService (feature 013, US1): el permiso solo se pide al activar (FR-001, SC-007).
const KEY = PUSH_STATE.public_key!;
const keyBytes = () => {
  const raw = atob(KEY.replace(/-/g, '+').replace(/_/g, '/').padEnd(88, '='));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};
const flush = () => new Promise<void>((r) => setTimeout(r));

describe('PushService', () => {
  let http: HttpTestingController;
  let fake: FakePlatform;

  function setup(opts: Parameters<typeof fakePlatform>[0] = {}) {
    fake = fakePlatform(opts);
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), { provide: PUSH_PLATFORM, useValue: fake.platform }] });
    http = TestBed.inject(HttpTestingController);
    return TestBed.inject(PushService);
  }
  afterEach(() => http.verify());

  it('construir el servicio, cargar el estado, inspeccionar y leer el permiso nunca piden permiso (SC-007)', async () => {
    const service = setup();
    service.state().subscribe();
    http.expectOne('/api/push').flush(PUSH_STATE);
    await service.inspect(KEY);
    service.refreshPermission();
    expect(service.isSupported()).toBeTrue();
    expect(fake.requestPermission).not.toHaveBeenCalled();
    expect(fake.register).not.toHaveBeenCalled();
    expect(fake.subscribe).not.toHaveBeenCalled();
  });

  it('enable(): pide el permiso una vez, registra el service worker, se suscribe con la clave y registra el dispositivo', async () => {
    const service = setup();
    const done = service.enable(KEY, 'Europe/Madrid');
    await flush();
    expect(fake.requestPermission).toHaveBeenCalledTimes(1);
    expect(fake.register).toHaveBeenCalledWith('/push-sw.js');
    const [options] = fake.subscribe.calls.mostRecent().args;
    expect(options.userVisibleOnly).toBeTrue();
    expect(Array.from(options.applicationServerKey as Uint8Array)).toEqual(Array.from(keyBytes()));
    const post = http.expectOne('/api/push/subscriptions');
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) }, timezone: 'Europe/Madrid' });
    post.flush({ id: 7, label: 'Chrome en Android', created_at: '2026-10-05T10:00:00.000Z', fingerprint: '4e9bdab8bbe7189c' });
    expect((await done).id).toBe(7);
    expect(service.permission()).toBe('granted');
  });

  it('enable() sin zona horaria no la envía', async () => {
    const service = setup();
    const done = service.enable(KEY);
    await flush();
    const post = http.expectOne('/api/push/subscriptions');
    expect(post.request.body.timezone).toBeUndefined();
    post.flush({});
    await done;
  });

  it('si no se concede el permiso: error y ni se suscribe ni se llama a la API', async () => {
    const service = setup({ granted: 'denied' });
    await expectAsync(service.enable(KEY)).toBeRejectedWithError(PushPermissionError);
    expect(service.permission()).toBe('denied');
    expect(fake.subscribe).not.toHaveBeenCalled();
    http.expectNone('/api/push/subscriptions');
  });

  it('una suscripción previa con otra clave se cierra antes de suscribirse; con la misma no', async () => {
    const stale = fakeSubscription('https://fcm.googleapis.com/fcm/send/old', new Uint8Array([1, 2, 3]));
    let service = setup({ subscription: stale });
    let done = service.enable(KEY);
    await flush();
    http.expectOne('/api/push/subscriptions').flush({});
    await done;
    expect(stale.unsubscribe).toHaveBeenCalled();

    TestBed.resetTestingModule();
    const same = fakeSubscription('https://fcm.googleapis.com/fcm/send/abc', keyBytes());
    service = setup({ subscription: same });
    done = service.enable(KEY);
    await flush();
    http.expectOne('/api/push/subscriptions').flush({});
    await done;
    expect(same.unsubscribe).not.toHaveBeenCalled();
  });

  it('disable(): borra en el servidor y, si es este navegador, cierra su suscripción', async () => {
    const sub = fakeSubscription('https://fcm.googleapis.com/fcm/send/abc', keyBytes());
    const service = setup({ subscription: sub });
    let done = service.disable(3);
    http.expectOne('/api/push/subscriptions/3').flush(null);
    await done;
    expect(sub.unsubscribe).not.toHaveBeenCalled();
    done = service.disable(4, true);
    http.expectOne('/api/push/subscriptions/4').flush(null);
    await done;
    expect(sub.unsubscribe).toHaveBeenCalled();
  });

  it('inspect(): sin suscripción; con la clave actual y su huella; con otra clave', async () => {
    let service = setup();
    expect(await service.inspect(KEY)).toEqual({ subscribed: false, keyMatches: false, fingerprint: null });

    TestBed.resetTestingModule();
    service = setup({ subscription: fakeSubscription('https://fcm.googleapis.com/fcm/send/abc', keyBytes()) });
    // La huella es la del servidor: 16 hexadecimales del SHA-256 del endpoint
    expect(await service.inspect(KEY)).toEqual({ subscribed: true, keyMatches: true, fingerprint: '4e9bdab8bbe7189c' });
    expect((await service.inspect('BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM')).keyMatches).toBeFalse();
    expect((await service.inspect(null)).keyMatches).toBeFalse();
  });

  it('unsubscribeOnLogout(): cierra la suscripción sin registrar nada y nunca falla', async () => {
    const sub = fakeSubscription('https://fcm.googleapis.com/fcm/send/abc', keyBytes());
    const service = setup({ subscription: sub });
    await service.unsubscribeOnLogout();
    expect(sub.unsubscribe).toHaveBeenCalled();
    expect(fake.register).not.toHaveBeenCalled();
    expect(fake.requestPermission).not.toHaveBeenCalled();
    sub.unsubscribe.and.rejectWith(new Error('boom'));
    await expectAsync(service.unsubscribeOnLogout()).toBeResolved();
  });

  it('un navegador sin soporte: no hay nada que cerrar ni que inspeccionar', async () => {
    const service = setup({ supported: false });
    expect(service.isSupported()).toBeFalse();
    expect(await service.inspect(KEY)).toEqual({ subscribed: false, keyMatches: false, fingerprint: null });
    await expectAsync(service.unsubscribeOnLogout()).toBeResolved();
    await expectAsync(service.enable(KEY)).toBeRejected();
  });

  it('los avisos que entrega el service worker con la app visible se publican en messages', () => {
    const service = setup();
    const got: unknown[] = [];
    service.messages.subscribe((m) => got.push(m));
    fake.postMessage({ type: 'descanso-push', kind: 'bedtime', title: 'Descanso', body: 'es tu hora de dormir' });
    fake.postMessage({ type: 'otra-cosa' });
    fake.postMessage(null);
    expect(got.length).toBe(1);
  });

  it('refreshPermission() lee el permiso del navegador; savePreferences y sendTest llaman a la API', () => {
    const service = setup();
    fake.setPermission('denied');
    expect(service.refreshPermission()).toBe('denied');
    expect(service.permission()).toBe('denied');
    service.savePreferences({ kinds: { prepare: false } }).subscribe();
    const put = http.expectOne('/api/push/preferences');
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual({ kinds: { prepare: false } });
    put.flush({});
    service.sendTest(5).subscribe();
    const post = http.expectOne('/api/push/subscriptions/5/test');
    expect(post.request.method).toBe('POST');
    post.flush({ result: 'sent' });
  });
});

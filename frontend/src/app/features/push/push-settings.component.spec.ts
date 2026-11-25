import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { PushDevice, PushState } from '../../core/push';
import { PUSH_PLATFORM } from '../../core/push.service';
import { PUSH_STATE, FakePlatform, fakePlatform, fakeSubscription } from '../../core/push-testing.spec';
import { ScheduleVersion, daysFor } from '../../core/schedule';
import { PushSettingsComponent } from './push-settings.component';

// Bloque "Avisos en este móvil" (feature 013, US1, US3, US4, US5): cada estado, 2 toques para activar,
// quitar dispositivos, tipos, "Silenciar hoy", "No molestar" y aviso de prueba.
const VERSION: ScheduleVersion = { id: 1, effective_from: '2026-10-01', days: daysFor('same', { bed_min: 1395, wake_min: 420 }, { bed_min: 1395, wake_min: 420 }) };
const KEY = PUSH_STATE.public_key!;
const keyBytes = () => Uint8Array.from(atob(KEY.replace(/-/g, '+').replace(/_/g, '/').padEnd(88, '=')), (c) => c.charCodeAt(0));
const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/abc';
const THIS_DEVICE: PushDevice = { id: 7, label: 'Chrome en Android', created_at: '2026-10-05T10:00:00.000Z', fingerprint: '4e9bdab8bbe7189c' };
const OTHER_DEVICE: PushDevice = { id: 8, label: 'Firefox en Windows', created_at: '2026-10-04T10:00:00.000Z', fingerprint: '0000000000000000' };
const settle = async (f: ComponentFixture<unknown>) => { for (let i = 0; i < 4; i++) { await new Promise((r) => setTimeout(r, 5)); f.detectChanges(); } };

describe('PushSettingsComponent (feature 013)', () => {
  let http: HttpTestingController;
  let fake: FakePlatform;

  async function mount(opts: {
    state?: Partial<PushState>; platform?: Parameters<typeof fakePlatform>[0]; version?: ScheduleVersion | null; lead?: number;
  } = {}) {
    fake = fakePlatform(opts.platform);
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), { provide: PUSH_PLATFORM, useValue: fake.platform }] });
    http = TestBed.inject(HttpTestingController);
    const f = TestBed.createComponent(PushSettingsComponent);
    f.componentRef.setInput('version', opts.version === undefined ? VERSION : opts.version);
    f.componentRef.setInput('leadMin', opts.lead ?? 30);
    f.componentRef.setInput('scheduleLoaded', true);
    f.detectChanges();
    http.expectOne('/api/push').flush({ ...PUSH_STATE, ...opts.state });
    await settle(f);
    const el: HTMLElement = f.nativeElement;
    return { f, el };
  }
  afterEach(() => http.verify());

  const button = (el: HTMLElement, text: string) => Array.from(el.querySelectorAll('button')).find((b) => b.textContent!.trim() === text) as HTMLButtonElement | undefined;
  const text = (el: HTMLElement) => el.textContent!.replace(/\s+/g, ' ');
  /** Una petición de escritura: la comprueba y la responde. */
  const reply = (method: string, url: string, body: object = {}, status = 200): TestRequest => {
    const req = http.expectOne((r) => r.method === method && r.url === url);
    if (status === 200) req.flush(body); else req.flush(body, { status, statusText: 'Error' });
    return req;
  };

  describe('estados (FR-004)', () => {
    it('no compatible: lo dice, ofrece el calendario y no hay botón de activar', async () => {
      const { el } = await mount({ platform: { supported: false } });
      expect(text(el)).toContain('Este navegador no puede recibir avisos con la app cerrada');
      expect(text(el)).toContain('Añadir a mi calendario');
      expect(button(el, 'Activar avisos')).toBeUndefined();
    });

    it('no disponible: "Los avisos no están disponibles"', async () => {
      const { el } = await mount({ state: { available: false, public_key: null } });
      expect(text(el)).toContain('Los avisos no están disponibles');
      expect(button(el, 'Activar avisos')).toBeUndefined();
    });

    it('sin horario: botón deshabilitado, "Primero agenda tu horario" y enlace a Mi horario', async () => {
      const { el } = await mount({ version: null });
      expect(text(el)).toContain('Primero agenda tu horario');
      expect(button(el, 'Activar avisos')!.disabled).toBeTrue();
      expect(el.querySelector('a[href="#schedule-title"]')!.textContent).toContain('Mi horario');
    });

    it('permiso denegado: cómo reactivarlo y sin botón; el resto de la app sigue igual', async () => {
      const { el } = await mount({ platform: { permission: 'denied' } });
      expect(text(el)).toContain('bloqueados en este navegador');
      expect(text(el)).toContain('ajustes del sitio');
      expect(button(el, 'Activar avisos')).toBeUndefined();
    });

    it('listo para activar: explicación previa con las tres horas de hoy, sin datos de salud, quién lo entrega, doble "prepárate" y límites (FR-002, FR-005, FR-012)', async () => {
      const { el } = await mount();
      const t = text(el);
      expect(t).toContain('Prepárate · 22:45');
      expect(t).toContain('Hora de dormir · 23:15');
      expect(t).toContain('¿Ya despertaste? · 8:00');
      expect(t).toContain('Avisarme antes');
      expect(t).toContain('nunca lleva datos de tu sueño ni de tu salud');
      expect(t).toContain('Google, en Chrome de Android');
      expect(t).toContain('pero no su contenido');
      expect(t).toContain('dos avisos de "prepárate"');
      expect(t).toContain('"No molestar" de Android');
      expect(t).toContain('ahorro de batería');
      expect(button(el, 'Activar avisos')!.disabled).toBeFalse();
      expect(button(el, 'Activar avisos')!.getAttribute('aria-describedby')).toBe('push-explain');
      expect(el.querySelector('#push-explain')).not.toBeNull();
    });

    it('las horas siguen a "Avisarme antes"', async () => {
      const { el } = await mount({ lead: 45 });
      expect(text(el)).toContain('Prepárate · 22:30');
    });

    it('hay que reactivar: el navegador tiene suscripción pero no está en la lista (FR-025)', async () => {
      const { el } = await mount({ platform: { permission: 'granted', subscription: fakeSubscription(ENDPOINT, keyBytes()) } });
      expect(text(el)).toContain('Vuelve a activar los avisos');
      expect(button(el, 'Activar avisos')).toBeDefined();
    });

    it('hay que reactivar: la clave del servicio cambió', async () => {
      const { el } = await mount({
        state: { devices: [THIS_DEVICE] },
        platform: { permission: 'granted', subscription: fakeSubscription(ENDPOINT, new Uint8Array([9, 9, 9])) },
      });
      expect(text(el)).toContain('Vuelve a activar los avisos');
    });

    it('activado: este móvil marcado, otros dispositivos con nombre y fecha, y "Quitar"', async () => {
      const { el } = await mount({
        state: { devices: [THIS_DEVICE, OTHER_DEVICE] },
        platform: { permission: 'granted', subscription: fakeSubscription(ENDPOINT, keyBytes()) },
      });
      expect(text(el)).toContain('Avisos activados en este móvil');
      const rows = Array.from(el.querySelectorAll('.device'));
      expect(rows.length).toBe(2);
      expect(rows[0].textContent).toContain('Chrome en Android');
      expect(rows[0].textContent).toContain('Este móvil');
      expect(rows[1].textContent).toContain('Firefox en Windows');
      expect(rows[1].textContent).not.toContain('Este móvil');
      expect(Array.from(el.querySelectorAll('button[aria-label^="Quitar"]')).length).toBe(2);
      expect(text(el)).not.toContain(ENDPOINT);
    });
  });

  describe('permiso (FR-001, SC-007, SC-008)', () => {
    it('sin pulsar "Activar avisos" no se pide permiso, aunque se cargue y se vuelva a cargar el bloque', async () => {
      const { f } = await mount();
      const again = f.componentInstance.refresh();
      http.expectOne('/api/push').flush(PUSH_STATE);
      await again;
      await settle(f);
      expect(fake.requestPermission).not.toHaveBeenCalled();
    });

    it('2 toques: "Activar avisos" pide el permiso, registra el móvil y lo marca como "Este móvil"', async () => {
      const { f, el } = await mount();
      button(el, 'Activar avisos')!.click(); // toque 1; el toque 2 es "Permitir" en el diálogo del navegador
      await settle(f);
      expect(fake.requestPermission).toHaveBeenCalledTimes(1);
      const post = http.expectOne('/api/push/subscriptions');
      expect(post.request.body.endpoint).toBe(ENDPOINT);
      expect(post.request.body.timezone).toBeUndefined(); // el perfil ya tiene zona
      post.flush(THIS_DEVICE);
      await settle(f);
      http.expectOne('/api/push').flush({ ...PUSH_STATE, devices: [THIS_DEVICE] });
      await settle(f);
      expect(text(el)).toContain('Avisos activados en este móvil');
      expect(el.querySelector('.device')!.textContent).toContain('Este móvil');
    });

    it('si el perfil no tiene zona horaria, propone la del navegador y la envía al activar (R14)', async () => {
      const { f, el } = await mount({ state: { timezone: null } });
      expect(text(el)).toContain(`zona horaria ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);
      button(el, 'Activar avisos')!.click();
      await settle(f);
      const post = http.expectOne('/api/push/subscriptions');
      expect(post.request.body.timezone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
      post.flush(THIS_DEVICE);
      await settle(f);
      http.expectOne('/api/push').flush({ ...PUSH_STATE, devices: [THIS_DEVICE] });
      await settle(f);
    });

    it('si se deniega el permiso, el bloque pasa a explicar cómo reactivarlo y no registra nada', async () => {
      const { f, el } = await mount({ platform: { granted: 'denied' } });
      button(el, 'Activar avisos')!.click();
      await settle(f);
      http.expectNone('/api/push/subscriptions');
      http.expectOne('/api/push').flush(PUSH_STATE);
      await settle(f);
      expect(text(el)).toContain('bloqueados en este navegador');
    });

    it('si se cierra el diálogo sin decidir, lo dice y deja volver a intentarlo', async () => {
      const { f, el } = await mount({ platform: { granted: 'default' } });
      button(el, 'Activar avisos')!.click();
      await settle(f);
      http.expectOne('/api/push').flush(PUSH_STATE);
      await settle(f);
      expect(text(el)).toContain('No se concedió el permiso');
      expect(button(el, 'Activar avisos')).toBeDefined();
    });

    it('el sexto dispositivo muestra el motivo del servidor', async () => {
      const { f, el } = await mount();
      button(el, 'Activar avisos')!.click();
      await settle(f);
      http.expectOne('/api/push/subscriptions').flush({ error: 'Ya tienes 5 dispositivos con avisos; quita uno para añadir este' }, { status: 409, statusText: 'Conflict' });
      await settle(f);
      expect(el.querySelector('[role="alert"]')!.textContent).toContain('Ya tienes 5 dispositivos');
    });
  });

  describe('con este móvil activado', () => {
    const on = (extra: Partial<PushState> = {}) =>
      mount({
        state: { devices: [THIS_DEVICE, OTHER_DEVICE], ...extra },
        platform: { permission: 'granted', subscription: fakeSubscription(ENDPOINT, keyBytes()) },
      });

    it('quitar un dispositivo: DELETE y la lista se actualiza; quitar el de este móvil cierra también su suscripción', async () => {
      const { f, el } = await on();
      (el.querySelector('button[aria-label="Quitar Firefox en Windows"]') as HTMLButtonElement).click();
      await settle(f);
      reply('DELETE', '/api/push/subscriptions/8');
      await settle(f);
      http.expectOne('/api/push').flush({ ...PUSH_STATE, devices: [THIS_DEVICE] });
      await settle(f);
      expect(el.querySelectorAll('.device').length).toBe(1);
      const sub = (await fake.getSubscription()) as ReturnType<typeof fakeSubscription>;
      expect(sub.unsubscribe).not.toHaveBeenCalled();
      (el.querySelector('button[aria-label="Quitar Chrome en Android"]') as HTMLButtonElement).click();
      await settle(f);
      reply('DELETE', '/api/push/subscriptions/7');
      await settle(f);
      expect(sub.unsubscribe).toHaveBeenCalled();
      http.expectOne('/api/push').flush({ ...PUSH_STATE, devices: [] });
      await settle(f);
    });

    it('un interruptor por tipo con su hora de hoy; cambiar uno guarda solo ese tipo (US3, FR-012)', async () => {
      const { f, el } = await on();
      const labels = Array.from(el.querySelectorAll('fieldset.kinds label')).map((l) => l.textContent!.trim());
      expect(labels).toEqual(['Prepárate · 22:45', 'Hora de dormir · 23:15', '¿Ya despertaste? · 8:00']);
      const boxes = Array.from(el.querySelectorAll('fieldset.kinds input')) as HTMLInputElement[];
      expect(boxes.map((b) => b.checked)).toEqual([true, true, true]);
      boxes[0].click();
      await settle(f);
      const put = reply('PUT', '/api/push/preferences', { kinds: { prepare: false, bedtime: true, wake_check: true }, dnd: null, muted_until: null });
      expect(put.request.body).toEqual({ kinds: { prepare: false } });
      await settle(f);
      expect((el.querySelectorAll('fieldset.kinds input')[0] as HTMLInputElement).checked).toBeFalse();
    });

    it('"Silenciar hoy" y "Deshacer" (US5)', async () => {
      const { f, el } = await on();
      button(el, 'Silenciar hoy')!.click();
      await settle(f);
      const today = new Date();
      const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      expect(reply('PUT', '/api/push/preferences', { kinds: PUSH_STATE.preferences.kinds, dnd: null, muted_until: iso }).request.body).toEqual({ mute_today: true });
      await settle(f);
      expect(text(el)).toContain('Avisos silenciados hasta mañana');
      expect(button(el, 'Silenciar hoy')).toBeUndefined();
      button(el, 'Deshacer')!.click();
      await settle(f);
      expect(reply('PUT', '/api/push/preferences', PUSH_STATE.preferences).request.body).toEqual({ mute_today: false });
      await settle(f);
      expect(button(el, 'Silenciar hoy')).toBeDefined();
    });

    it('"No molestar": activar muestra inicio y fin con etiquetas, guarda la franja que cruza medianoche y se desactiva con un toque', async () => {
      const { f, el } = await on();
      expect(el.querySelector('input[name="dndStart"]')).toBeNull();
      (el.querySelector('fieldset.dnd input[type="checkbox"]') as HTMLInputElement).click();
      await settle(f);
      const start = el.querySelector('input[name="dndStart"]') as HTMLInputElement;
      const end = el.querySelector('input[name="dndEnd"]') as HTMLInputElement;
      expect(start.closest('label')!.textContent).toContain('Desde');
      expect(end.closest('label')!.textContent).toContain('Hasta');
      start.value = '23:00'; start.dispatchEvent(new Event('input'));
      end.value = '07:00'; end.dispatchEvent(new Event('input'));
      button(el, 'Guardar franja')!.click();
      await settle(f);
      const prefs = { ...PUSH_STATE.preferences, dnd: { start_min: 1380, end_min: 420 } };
      expect(reply('PUT', '/api/push/preferences', prefs).request.body).toEqual({ dnd: { start_min: 1380, end_min: 420 } });
      await settle(f);
      expect(text(el)).toContain('Franja guardada');
      (el.querySelector('fieldset.dnd input[type="checkbox"]') as HTMLInputElement).click();
      await settle(f);
      expect(reply('PUT', '/api/push/preferences', PUSH_STATE.preferences).request.body).toEqual({ dnd: null });
      await settle(f);
      expect(el.querySelector('input[name="dndStart"]')).toBeNull();
    });

    it('una franja que el servidor rechaza muestra su motivo', async () => {
      const { f, el } = await on();
      (el.querySelector('fieldset.dnd input[type="checkbox"]') as HTMLInputElement).click();
      await settle(f);
      button(el, 'Guardar franja')!.click();
      await settle(f);
      reply('PUT', '/api/push/preferences', { error: 'La franja de No molestar necesita inicio y fin distintos' }, 400);
      await settle(f);
      expect(el.querySelector('[role="alert"]')!.textContent).toContain('inicio y fin distintos');
    });

    it('aviso de prueba: "Enviado" en un role="status"', async () => {
      const { f, el } = await on();
      button(el, 'Enviarme un aviso de prueba')!.click();
      await settle(f);
      reply('POST', '/api/push/subscriptions/7/test', { result: 'sent' });
      await settle(f);
      expect(text(el)).toContain('Enviado');
      expect(Array.from(el.querySelectorAll('[role="status"]')).some((n) => n.textContent!.includes('Enviado'))).toBeTrue();
    });

    it('aviso de prueba con el dispositivo caducado: lo explica y refresca la lista', async () => {
      const { f, el } = await on();
      button(el, 'Enviarme un aviso de prueba')!.click();
      await settle(f);
      reply('POST', '/api/push/subscriptions/7/test', { result: 'expired' });
      await settle(f);
      http.expectOne('/api/push').flush({ ...PUSH_STATE, devices: [OTHER_DEVICE] });
      await settle(f);
      expect(text(el)).toContain('Este dispositivo ya no es válido: vuelve a activar los avisos');
      expect(el.querySelectorAll('.device').length).toBe(1);
    });

    it('aviso de prueba con el permiso retirado: "Permiso retirado" y cómo reactivarlo', async () => {
      const { f, el } = await on();
      fake.setPermission('denied');
      button(el, 'Enviarme un aviso de prueba')!.click();
      await settle(f);
      reply('POST', '/api/push/subscriptions/7/test', { result: 'expired' });
      await settle(f);
      http.expectOne('/api/push').flush({ ...PUSH_STATE, devices: [OTHER_DEVICE] });
      await settle(f);
      expect(text(el)).toContain('Permiso retirado');
      expect(text(el)).toContain('ajustes del sitio');
    });

    it('aviso de prueba que falla y límite de 429 con mensaje amable', async () => {
      const { f, el } = await on();
      button(el, 'Enviarme un aviso de prueba')!.click();
      await settle(f);
      reply('POST', '/api/push/subscriptions/7/test', { result: 'failed' });
      await settle(f);
      expect(text(el)).toContain('No se pudo enviar');
      button(el, 'Enviarme un aviso de prueba')!.click();
      await settle(f);
      reply('POST', '/api/push/subscriptions/7/test', { error: 'Espera un momento antes de probar otra vez' }, 429);
      await settle(f);
      expect(text(el)).toContain('Espera un momento antes de probar otra vez');
    });
  });
});

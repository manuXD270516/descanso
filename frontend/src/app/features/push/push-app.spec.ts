import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { App } from '../../app';
import { authInterceptor } from '../../core/auth.interceptor';
import { AuthService } from '../../core/auth.service';
import { PushMessage } from '../../core/push';
import { PUSH_PLATFORM, PushService } from '../../core/push.service';
import { fakePlatform, fakeSubscription } from '../../core/push-testing.spec';
import { localDay } from '../../core/schedule';
import { BedtimeNoticeComponent } from '../../shared/bedtime-notice.component';
import { NightUiService } from '../night/night-ui.service';

// Feature 013 en la app: #noche-despertar (US2, FR-013), aviso con la app visible (FR-019) y cierre de sesión (FR-007).
const PROFILE = { id: 1, email: 'yo@x.com', role: 'owner', display_name: 'Yo', timezone: null, sleep_goal_min: 450, cycle_min: 90, latency_min: 15, lead_min: 30, consent_version: null, consent_at: null, created_at: '' };
const OPEN_NIGHT = { id: 7, date: '2026-10-05', bedtime: '2026-10-05T23:20:00+02:00', wake_time: null, notes: null, duration_min: null };
const message = (p: Partial<PushMessage> = {}): PushMessage => ({
  type: 'descanso-push', kind: 'bedtime', night: '2026-10-05', title: 'Descanso', body: 'es tu hora de dormir', tag: 'bedtime-2026-10-05', url: '/#noche', ...p,
});
const settle = async (f: ComponentFixture<unknown>) => { for (let i = 0; i < 3; i++) { await new Promise((r) => setTimeout(r, 5)); f.detectChanges(); } };

describe('Feature 013 · app', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [App],
      providers: [provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => history.replaceState(null, '', location.pathname + location.search));

  /** Responde a todo lo pendiente con los datos mínimos de cada ruta. */
  function answer(open: object | null = null) {
    for (const r of http.match(() => true)) {
      const url = r.request.url;
      if (url === '/api/auth/status') r.flush({ state: 'authenticated', email: 'yo@x.com', onboarded: true });
      else if (url === '/api/health') r.flush({ ok: true, time: '', version: 'dev' });
      else if (url === '/api/me') r.flush(PROFILE);
      else if (url === '/api/sleep/open') r.flush(open);
      else if (url === '/api/schedule') r.flush({ version: null, lead_min: 30, pause: null });
      else if (url === '/api/stats') r.flush({ days: [], summary: { nights: 0, avg_sleep_min: 0, avg_nap_min: 0, total_naps: 0, avg_bedtime_min: null, avg_wake_min: null } });
      else if (url === '/api/streak') r.flush({ enabled: false, offered: false, margin_min: 30, offer: false });
      else r.flush([]);
    }
  }

  describe('#noche-despertar (US2, FR-013)', () => {
    it('con sesión: abre Noche con "Ya desperté" a la vista y con el foco, y limpia el fragmento', async () => {
      history.replaceState(null, '', '#noche-despertar');
      const f = TestBed.createComponent(App);
      f.detectChanges();
      expect(location.hash).toBe('');
      answer(OPEN_NIGHT);
      f.detectChanges();
      answer(OPEN_NIGHT);
      await settle(f);
      const el: HTMLElement = f.nativeElement;
      expect(el.querySelector('app-night')).not.toBeNull();
      const wake = Array.from(el.querySelectorAll('button')).find((b) => b.textContent!.trim() === 'Ya desperté')!;
      expect(wake).toBeDefined();
      expect(document.activeElement).toBe(wake);
      expect(TestBed.inject(NightUiService).wakeIntent()).toBeFalse();
    });

    it('#noche abre Noche sin pedir el foco de "Ya desperté"', async () => {
      history.replaceState(null, '', '#noche');
      const f = TestBed.createComponent(App);
      f.detectChanges();
      expect(location.hash).toBe('');
      expect(TestBed.inject(NightUiService).wakeIntent()).toBeFalse();
      answer(OPEN_NIGHT);
      await settle(f);
      const wake = Array.from((f.nativeElement as HTMLElement).querySelectorAll('button')).find((b) => b.textContent!.trim() === 'Ya desperté')!;
      expect(document.activeElement).not.toBe(wake);
    });

    it('sin noche abierta no hay nada que enfocar y la intención se descarta', async () => {
      history.replaceState(null, '', '#noche-despertar');
      const f = TestBed.createComponent(App);
      f.detectChanges();
      answer(null);
      f.detectChanges();
      answer(null);
      await settle(f);
      expect(TestBed.inject(NightUiService).wakeIntent()).toBeFalse();
      expect(Array.from((f.nativeElement as HTMLElement).querySelectorAll('button')).some((b) => b.textContent!.trim() === 'Ya desperté')).toBeFalse();
    });

    it('con la app abierta y otra pestaña, el cambio de fragmento (sin recarga) también lo abre', async () => {
      const f = TestBed.createComponent(App);
      f.detectChanges();
      answer(OPEN_NIGHT);
      f.detectChanges();
      answer(OPEN_NIGHT);
      await settle(f);
      f.componentInstance.selectTab('naps');
      f.detectChanges();
      answer();
      history.replaceState(null, '', '#noche-despertar'); // un enlace con la app ya abierta solo cambia el fragmento
      // (los listeners de hashchange de otras apps de prueba limpiarían el fragmento antes: se invoca el manejador de esta)
      (f.componentInstance as unknown as { openNightLink(): void }).openNightLink();
      f.detectChanges();
      answer(OPEN_NIGHT);
      f.detectChanges();
      answer(OPEN_NIGHT);
      await settle(f);
      expect(f.componentInstance.tab()).toBe('night');
      expect(location.hash).toBe('');
      const wake = Array.from((f.nativeElement as HTMLElement).querySelectorAll('button')).find((b) => b.textContent!.trim() === 'Ya desperté')!;
      expect(document.activeElement).toBe(wake);
    });

    it('sin sesión: se muestra la entrada, la intención se conserva y, tras entrar, Noche enfoca "Ya desperté"', async () => {
      history.replaceState(null, '', '#noche-despertar');
      const f = TestBed.createComponent(App);
      f.detectChanges();
      http.expectOne('/api/auth/status').flush({ state: 'login' });
      http.expectOne('/api/health').flush({ ok: true, time: '', version: 'dev' });
      f.detectChanges();
      const el: HTMLElement = f.nativeElement;
      expect(el.querySelector('app-login')).not.toBeNull();
      expect(el.querySelector('app-night')).toBeNull();
      expect(location.hash).toBe('');
      expect(TestBed.inject(NightUiService).wakeIntent()).toBeTrue();
      TestBed.inject(AuthService).state.set('authenticated');
      f.detectChanges();
      answer(OPEN_NIGHT);
      f.detectChanges();
      answer(OPEN_NIGHT);
      await settle(f);
      expect(f.componentInstance.tab()).toBe('night');
      const wake = Array.from(el.querySelectorAll('button')).find((b) => b.textContent!.trim() === 'Ya desperté')!;
      expect(document.activeElement).toBe(wake);
    });
  });

  describe('cerrar sesión (FR-007)', () => {
    it('este navegador cierra su suscripción de avisos y la sesión sigue su curso sin esperarla', async () => {
      const sub = fakeSubscription('https://fcm.googleapis.com/fcm/send/abc', new Uint8Array([1]));
      const fake = fakePlatform({ permission: 'granted', subscription: sub });
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [App],
        providers: [provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting(), { provide: PUSH_PLATFORM, useValue: fake.platform }],
      });
      http = TestBed.inject(HttpTestingController);
      const f = TestBed.createComponent(App);
      f.detectChanges();
      answer();
      f.detectChanges();
      f.componentInstance.logout();
      http.expectOne('/api/auth/logout').flush(null, { status: 204, statusText: 'No Content' });
      await settle(f);
      expect(sub.unsubscribe).toHaveBeenCalled();
      expect(fake.requestPermission).not.toHaveBeenCalled();
    });
  });

  describe('aviso dentro de la app (FR-019)', () => {
    function mountNotice() {
      const f = TestBed.createComponent(BedtimeNoticeComponent);
      f.detectChanges();
      http.match(() => true).forEach((r) => r.flush({ version: null, lead_min: 30, pause: null }));
      return f;
    }
    const statuses = (f: ComponentFixture<unknown>) => Array.from((f.nativeElement as HTMLElement).querySelectorAll('.bedtime-notice > span')).map((n) => n.textContent!.trim());

    it('un aviso que entrega el service worker con la app visible aparece silencioso con role="status"; "Cerrar" lo quita', () => {
      const f = mountNotice();
      expect(statuses(f)).toEqual([]);
      TestBed.inject(PushService).messages.next(message());
      f.detectChanges();
      expect(statuses(f)[0]).toContain('Descanso: es tu hora de dormir');
      const close = Array.from((f.nativeElement as HTMLElement).querySelectorAll('button')).find((b) => b.textContent!.trim() === 'Cerrar')!;
      close.click();
      f.detectChanges();
      expect(statuses(f)).toEqual([]);
    });

    it('muestra también "¿ya despertaste?" y el aviso de prueba', () => {
      const f = mountNotice();
      const push = TestBed.inject(PushService);
      push.messages.next(message({ kind: 'wake_check', body: '¿ya despertaste?', url: '/#noche-despertar' }));
      f.detectChanges();
      expect(statuses(f)[0]).toBe('Descanso: ¿ya despertaste?');
      push.messages.next(message({ kind: 'test', night: null, body: 'aviso de prueba', tag: 'test' }));
      f.detectChanges();
      expect(statuses(f)[0]).toBe('Descanso: aviso de prueba');
    });

    it('un "prepárate" no se repite si el aviso de 010 ya se mostró ese día; los demás tipos sí', () => {
      const f = mountNotice();
      const c = f.componentInstance as unknown as { noticeShownDay: string; onPush(m: PushMessage, now?: Date): void };
      const today = localDay(new Date());
      c.noticeShownDay = today;
      TestBed.inject(PushService).messages.next(message({ kind: 'prepare', body: 'en 30 min es tu hora de dormir' }));
      f.detectChanges();
      expect(statuses(f)).toEqual([]);
      TestBed.inject(PushService).messages.next(message());
      f.detectChanges();
      expect(statuses(f)).toEqual(['Descanso: es tu hora de dormir']);
      // Otro día, el "prepárate" sí se muestra
      c.noticeShownDay = '2000-01-01';
      TestBed.inject(PushService).messages.next(message({ kind: 'prepare', body: 'en 30 min es tu hora de dormir' }));
      f.detectChanges();
      expect(statuses(f)[0]).toContain('en 30 min es tu hora de dormir');
    });
  });
});

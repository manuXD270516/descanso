import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthService } from '../../core/auth.service';
import { ScheduleDay, daysFor, localDay } from '../../core/schedule';
import { WelcomeComponent } from '../onboarding/welcome.component';
import { CalendarGuideComponent, detectPlatform } from './calendar-guide.component';
import { MyScheduleComponent } from './my-schedule.component';
import { BedtimeNoticeComponent } from '../../shared/bedtime-notice.component';
import { flushStreak } from '../streak/streak.testing';
import { flushPush } from '../../core/push-testing.spec';

// Feature 010 en el frontend: bienvenida con horario (US1), Mi horario + calendario + pausa (US2/US4),
// guía por plataforma (FR-011) y aviso con la app abierta (US5).
const WEEK: ScheduleDay[] = daysFor('weekend', { bed_min: 1395, wake_min: 420 }, { bed_min: 75, wake_min: 540 });
const PROFILE = { id: 1, email: 'yo@x.com', role: 'owner', display_name: 'Yo', timezone: null, sleep_goal_min: 450, cycle_min: 90, latency_min: 15, lead_min: 30, consent_version: null, consent_at: null, created_at: '' };
const TODAY = localDay(new Date());

describe('Feature 010 · horario', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { flushStreak(http); flushPush(http); http.verify(); });

  describe('bienvenida (US1, SC-001)', () => {
    it('elegir un atajo solo marca el objetivo; "Guardar" con horario guarda objetivo y horario vigente desde hoy', () => {
      const auth = TestBed.inject(AuthService);
      auth.onboarded.set(false);
      const f = TestBed.createComponent(WelcomeComponent);
      f.detectChanges();
      const c = f.componentInstance;
      c.chooseGoal(450);
      http.expectNone('/api/me/onboarding');
      c.days.set(WEEK);
      c.finish(c.goal(), c.days());
      http.expectOne('/api/me/onboarding').flush({});
      const put = http.expectOne((r) => r.url === '/api/schedule' && r.method === 'PUT');
      expect(put.request.body).toEqual({ today: TODAY, days: WEEK });
      put.flush({ id: 1, effective_from: TODAY, days: WEEK });
      expect(auth.onboarded()).toBeTrue();
    });

    it('sin hora de levantarse, "Guardar" solo guarda el objetivo; "Saltar" no guarda horario', () => {
      const f = TestBed.createComponent(WelcomeComponent);
      f.detectChanges();
      f.componentInstance.finish(420, null);
      http.expectOne('/api/me/onboarding').flush({});
      f.componentInstance.finish();
      expect(http.expectOne('/api/me/onboarding').request.body).toEqual({});
      http.expectNone('/api/schedule');
    });

    it('la pantalla pregunta la hora de levantarse y ofrece Guardar y Saltar', () => {
      const f = TestBed.createComponent(WelcomeComponent);
      f.detectChanges();
      const el: HTMLElement = f.nativeElement;
      expect(el.textContent).toContain('¿A qué hora quieres levantarte?');
      expect(Array.from(el.querySelectorAll('button')).map((b) => b.textContent!.trim())).toContain('Saltar (7 h)');
    });
  });

  describe('Mi horario (US1, US2, US4)', () => {
    function render(version: unknown = { id: 3, effective_from: TODAY, days: WEEK }, pause: unknown = null, pauses: unknown[] = []) {
      const f = TestBed.createComponent(MyScheduleComponent);
      f.detectChanges();
      http.expectOne('/api/me').flush(PROFILE);
      http.expectOne((r) => r.url === '/api/schedule' && r.method === 'GET').flush({ version, lead_min: 30, pause });
      http.expectOne('/api/pauses').flush(pauses);
      f.detectChanges();
      return { f, c: f.componentInstance, el: f.nativeElement as HTMLElement };
    }

    it('con horario: enlace de descarga del calendario y guía; guardar crea versión desde hoy', () => {
      const { f, c, el } = render();
      const link = el.querySelector('a[download]') as HTMLAnchorElement;
      expect(link.getAttribute('href')).toBe(`/api/schedule.ics?today=${TODAY}`);
      expect(el.querySelector('app-calendar-guide')).not.toBeNull();
      c.draft.set(WEEK);
      c.save();
      http.expectOne((r) => r.url === '/api/schedule' && r.method === 'PUT').flush({ id: 4, effective_from: TODAY, days: WEEK });
      f.detectChanges();
      expect(el.textContent).toContain('Se aplica desde hoy; los días anteriores no cambian');
    });

    it('FR-021 · sin horario completo "Guardar horario" no envía: marca la hora que falta y, si no, avisa con un mensaje', async () => {
      const { f, c, el } = render(null);
      await f.whenStable();
      const save = Array.from(el.querySelectorAll('button')).find((b) => b.textContent!.trim() === 'Guardar horario') as HTMLButtonElement;
      save.click();
      f.detectChanges();
      const wake = el.querySelector('input[name="weekWake"]') as HTMLInputElement;
      expect(wake.getAttribute('aria-invalid')).toBe('true');
      expect(document.activeElement).toBe(wake);
      http.expectNone((r) => r.method === 'PUT');
      // cualquier otro camino que llegue a save() sin horario tampoco sale en silencio
      c.draft.set(null);
      c.save();
      f.detectChanges();
      expect(el.querySelector('[role="alert"]')!.textContent).toContain('Completa todas las horas');
      http.expectNone((r) => r.method === 'PUT');
    });

    it('FR-021 · en "Cada día distinto" una celda vacía se marca (todas las horas son obligatorias)', async () => {
      const { f, el } = render(null);
      await f.whenStable();
      (Array.from(el.querySelectorAll('input[type="radio"]')).find((r) => (r as HTMLInputElement).value === 'each') as HTMLInputElement).click();
      f.detectChanges();
      await f.whenStable();
      const save = Array.from(el.querySelectorAll('button')).find((b) => b.textContent!.trim() === 'Guardar horario') as HTMLButtonElement;
      save.click();
      f.detectChanges();
      const first = el.querySelector('input[name="wake1"], input[type="time"]') as HTMLInputElement;
      expect(first.getAttribute('aria-invalid')).toBe('true');
      expect(document.activeElement).toBe(first);
      http.expectNone((r) => r.method === 'PUT');
    });

    it('sin horario no hay descarga; el aviso se guarda en el perfil', () => {
      const { c, el } = render(null);
      expect(el.querySelector('a[download]')).toBeNull();
      c.lead = 45;
      c.saveLead();
      const req = http.expectOne((r) => r.url === '/api/me' && r.method === 'PUT');
      expect(req.request.body).toEqual({ lead_min: 45 });
      req.flush({ ...PROFILE, lead_min: 45 });
      expect(c.leadMin()).toBe(45);
    });

    it('pausa: muestra "En pausa hasta…", la crea con hoy y enseña el motivo del rechazo', () => {
      const { f, c, el } = render(undefined, { id: 1, start_date: TODAY, end_date: TODAY }, [{ id: 1, start_date: TODAY, end_date: TODAY }]);
      expect(el.querySelector('.paused')!.textContent).toContain('En pausa hasta el');
      c.pauseFrom = TODAY;
      c.pauseTo = TODAY;
      c.createPause();
      const req = http.expectOne((r) => r.url === '/api/pauses' && r.method === 'POST');
      expect(req.request.body.today).toBe(TODAY);
      req.flush({ error: 'Se solapa con otra pausa' }, { status: 409, statusText: 'Conflict' });
      f.detectChanges();
      expect(el.querySelector('[role="alert"]')!.textContent).toContain('Se solapa con otra pausa');
    });
  });

  describe('guía del calendario (FR-011)', () => {
    function render(ua: string) {
      const f = TestBed.createComponent(CalendarGuideComponent);
      f.componentRef.setInput('days', WEEK);
      f.componentRef.setInput('leadMin', 30);
      f.componentRef.setInput('userAgent', ua);
      f.detectChanges();
      return f.nativeElement as HTMLElement;
    }

    it('detecta la plataforma; Android primero con lo comprobado en el spike', () => {
      expect(detectPlatform('Mozilla/5.0 (Linux; Android 15)')).toBe('android');
      expect(detectPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)')).toBe('iphone');
      const el = render('Mozilla/5.0 (Linux; Android 15)');
      const summaries = Array.from(el.querySelectorAll('summary')).map((s) => s.textContent!.trim());
      expect(summaries).toEqual(['Android', 'iPhone']);
      expect(el.textContent).toContain('notificación por defecto 30 minutos antes');
      expect(el.textContent).toContain('"Añadir todo"');
      expect(el.textContent).toContain('duplica');
      expect(el.textContent).toContain('Sin comprobar en un iPhone real');
      expect(el.textContent).toContain('No molestar');
    });

    it('en iPhone muestra primero la guía de iPhone; la alternativa lista las alarmas por noche', () => {
      const el = render('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)');
      expect(el.querySelector('summary')!.textContent!.trim()).toBe('iPhone');
      expect(el.textContent).toContain('Noche del lunes: alarma a las 22:45 (te acuestas a las 23:15)');
      expect(el.textContent).toContain('Noche del sábado: alarma a las 00:45 (te acuestas a las 01:15)');
    });
  });

  describe('aviso con la app abierta (US5)', () => {
    // Reloj fijado con jasmine.clock: ngOnInit usa new Date(), así que nada depende de la hora real.
    beforeEach(() => jasmine.clock().install());
    afterEach(() => jasmine.clock().uninstall());
    function prepare(now: Date, bedMin: number) {
      jasmine.clock().mockDate(now);
      const f = TestBed.createComponent(BedtimeNoticeComponent);
      const days = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, bed_min: bedMin, wake_min: 420, active: true }));
      f.detectChanges(); // ngOnInit: carga el horario de hoy y comprueba la hora
      http.expectOne((r) => r.url === '/api/schedule').flush({ version: { id: 1, effective_from: localDay(now), days }, lead_min: 30, pause: null });
      return { f, c: f.componentInstance, el: f.nativeElement as HTMLElement };
    }

    it('a la hora de prepararse (±1 min) aparece silencioso con role="status" y se puede cerrar', () => {
      const { f, c, el } = prepare(new Date(2026, 10, 25, 19, 0), 19 * 60 + 30);
      http.expectOne('/api/sleep/open').flush(null);
      f.detectChanges();
      expect(el.querySelector('[role="status"]')!.textContent).toContain('En 30 min es tu hora de dormir');
      c.dismiss();
      f.detectChanges();
      expect(el.querySelector('[role="status"]')).toBeNull();
    });

    it('fuera de hora no aparece (ni consulta la noche abierta)', () => {
      prepare(new Date(2026, 10, 25, 18, 0), 19 * 60 + 30);
      http.expectNone('/api/sleep/open');
    });

    it('cruce de medianoche: a las 23:40 con acostarse a las 00:10 avisa (la noche es la de hoy)', () => {
      const { f, el } = prepare(new Date(2026, 10, 25, 23, 40), 10);
      http.expectOne('/api/sleep/open').flush(null);
      f.detectChanges();
      expect(el.querySelector('[role="status"]')!.textContent).toContain('En 30 min es tu hora de dormir');
    });

    it('pasada la medianoche: a las 00:15 con acostarse a las 00:45 avisa (es la noche de ayer)', () => {
      const { f, el } = prepare(new Date(2026, 10, 26, 0, 15), 45);
      http.expectOne('/api/sleep/open').flush(null);
      f.detectChanges();
      expect(el.querySelector('[role="status"]')!.textContent).toContain('En 30 min es tu hora de dormir');
    });

    it('en pausa no aparece', () => {
      const f = TestBed.createComponent(BedtimeNoticeComponent);
      f.componentInstance.check(new Date());
      http.expectOne((r) => r.url === '/api/schedule').flush({ version: null, lead_min: 30, pause: { id: 1, start_date: TODAY, end_date: TODAY } });
      http.expectNone('/api/sleep/open');
      expect(f.componentInstance.visible()).toBeFalse();
    });
  });
});

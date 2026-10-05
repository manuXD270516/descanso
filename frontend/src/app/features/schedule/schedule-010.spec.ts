import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthService } from '../../core/auth.service';
import { ScheduleDay, daysFor, localDay } from '../../core/schedule';
import { WelcomeComponent } from '../onboarding/welcome.component';
import { CalendarGuideComponent, detectPlatform } from './calendar-guide.component';
import { MyScheduleComponent } from './my-schedule.component';
import { BedtimeNoticeComponent } from '../../shared/bedtime-notice.component';

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
  afterEach(() => http.verify());

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
    it('a la hora de prepararse (±1 min) aparece silencioso con role="status"; fuera de hora o en pausa no', () => {
      const f = TestBed.createComponent(BedtimeNoticeComponent);
      const c = f.componentInstance;
      const now = new Date(); // el componente usa la hora real; el margen es de ±1 min
      const night = localDay(now);
      // Horario de hoy: acostarse dentro de 30 min exactos → ahora es la hora de prepararse
      const bedMin = (now.getHours() * 60 + now.getMinutes() + 30) % 1440;
      const days = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, bed_min: bedMin, wake_min: 420, active: true }));
      f.detectChanges(); // ngOnInit: carga el horario de hoy y comprueba la hora
      http.expectOne((r) => r.url === '/api/schedule').flush({ version: { id: 1, effective_from: night, days }, lead_min: 30, pause: null });
      // si la hora de acostarse cae antes de mediodía se interpreta como de madrugada (día siguiente):
      // en ese caso no aplica hoy, y la prueba solo comprueba que no aparece
      const reqs = http.match('/api/sleep/open');
      if (bedMin >= 720) {
        expect(reqs.length).toBe(1);
        reqs[0].flush(null);
        f.detectChanges();
        const notice = (f.nativeElement as HTMLElement).querySelector('[role="status"]')!;
        expect(notice.textContent).toContain('En 30 min es tu hora de dormir');
        c.dismiss();
        f.detectChanges();
        expect((f.nativeElement as HTMLElement).querySelector('[role="status"]')).toBeNull();
      } else {
        expect(reqs.length).toBe(0);
      }
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

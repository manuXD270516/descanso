import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { SleepRecord, Stats } from '../../core/api.service';
import { daysFor } from '../../core/schedule';
import { toInputLocal } from '../../core/time';
import { NightComponent, nightOrigin } from './night.component';
import { flushStreak } from '../streak/streak.testing';

// Feature 010 en Noche: "¿Ya despertaste?" con horario (US3, FR-012/FR-014) y origen "Anotado después" (FR-013).
const PROFILE = { id: 1, email: 'yo@x.com', role: 'owner', display_name: 'Yo', timezone: null, sleep_goal_min: 450, cycle_min: 90, latency_min: 15, lead_min: 30, consent_version: null, consent_at: null, created_at: '' };
const EMPTY_STATS = { from: '', to: '', days: [], summary: { avg_sleep_min: 0, total_naps: 0, avg_bedtime_min: null, avg_wake_min: null } } as unknown as Stats;
const MIN = 60_000;
const pad = (n: number) => String(n).padStart(2, '0');
const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function night(p: Partial<SleepRecord>): SleepRecord {
  return { id: 7, date: '2026-09-29', bedtime: '2026-09-29T23:00:00-04:00', wake_time: null, notes: null, duration_min: null, ...p };
}

describe('NightComponent · feature 010', () => {
  let fixture: ComponentFixture<NightComponent>;
  let http: HttpTestingController;
  let el: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [NightComponent], providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { flushStreak(http); http.verify(); });

  /** Noche abierta "anoche" y horario cuya hora de levantarse fue hace `minutesAgo` minutos. */
  function start(minutesAgo: number, opts: { paused?: boolean; active?: boolean } = {}) {
    const now = new Date();
    const wakeAt = new Date(now.getTime() - minutesAgo * MIN);
    const nightDay = new Date(wakeAt.getFullYear(), wakeAt.getMonth(), wakeAt.getDate() - 1);
    const nightDate = localDate(nightDay);
    const wakeMin = wakeAt.getHours() * 60 + wakeAt.getMinutes();
    const active = [0, 1, 2, 3, 4, 5, 6].map((w) => (w === nightDay.getDay() ? opts.active ?? true : true));
    const days = daysFor('same', { bed_min: 1380, wake_min: wakeMin }, { bed_min: 1380, wake_min: wakeMin }, active);
    // Acostarse 8 h antes de la hora de levantarse: lejos de las 14 h de la regla de 006
    const open = night({ date: nightDate, bedtime: new Date(wakeAt.getTime() - 8 * 60 * MIN).toISOString() });

    fixture = TestBed.createComponent(NightComponent);
    el = fixture.nativeElement;
    fixture.detectChanges();
    http.expectOne('/api/me').flush(PROFILE);
    http.expectOne('/api/sleep/open').flush(open);
    const sched = http.expectOne((r) => r.url === '/api/schedule');
    expect(sched.request.params.get('date')).toBe(localDate(new Date())); // el horario vigente hoy
    sched.flush({ version: { id: 1, effective_from: '2026-01-01', days }, lead_min: 30, pause: opts.paused ? { id: 1, start_date: nightDate, end_date: nightDate } : null });
    http.expectOne((r) => r.url === '/api/sleep' && r.method === 'GET').flush([]);
    http.expectOne((r) => r.url === '/api/naps').flush([]);
    http.expectOne((r) => r.url === '/api/stats').flush(EMPTY_STATS);
    fixture.detectChanges();
    return { wakeAt };
  }
  const reminder = () => el.querySelector('.reminder')?.textContent ?? '';

  it('59 min después de la hora agendada no hay aviso; 61 min después, "¿Ya despertaste?" con esa hora', () => {
    start(59);
    expect(reminder()).toBe('');
    fixture.destroy();
    const { wakeAt } = start(61);
    expect(reminder()).toContain('¿Ya despertaste?');
    expect(fixture.componentInstance.reminderInput()).toBe(toInputLocal(wakeAt));
  });

  it('confirmar la hora propuesta sin cambiarla se envía como from_proposal; corregirla, no', () => {
    start(90);
    (Array.from(el.querySelectorAll('button')).find((b) => b.textContent!.includes('Sí, desperté a esa hora')) as HTMLButtonElement).click();
    const req = http.expectOne('/api/sleep/wake');
    expect(req.request.body.from_proposal).toBeTrue();
    req.flush(night({ wake_time: req.request.body.wake_time }));
    for (let i = 0; i < 3; i++) for (const r of http.match(() => true)) r.flush(r.request.url.includes('stats') ? EMPTY_STATS : r.request.url === '/api/sleep/open' ? null : []);

    fixture.destroy();
    start(90);
    fixture.componentInstance.reminderInput.set(toInputLocal(new Date(Date.now() - 100 * MIN)));
    fixture.componentInstance.acceptReminder();
    const corrected = http.expectOne('/api/sleep/wake');
    expect(corrected.request.body.from_proposal).toBeUndefined();
    corrected.flush(night({}));
    for (let i = 0; i < 3; i++) for (const r of http.match(() => true)) r.flush(r.request.url.includes('stats') ? EMPTY_STATS : r.request.url === '/api/sleep/open' ? null : []);
  });

  it('en pausa o con el día inactivo rige la regla de 14 h de 006 (sin aviso a las pocas horas)', () => {
    start(120, { paused: true });
    expect(reminder()).toBe('');
    fixture.destroy();
    start(120, { active: false });
    expect(reminder()).toBe('');
  });

  it('"Anotado después": despertar anotado más de 60 min después de ocurrir', () => {
    expect(nightOrigin(night({ wake_time: '2026-09-30T07:00:00-04:00', wake_logged_at: '2026-09-30T12:01:00.000Z' }))).toBe('late'); // 7:00 −04:00 = 11:00Z; anotado 61 min después
    expect(nightOrigin(night({ wake_time: '2026-09-30T07:00:00-04:00', wake_logged_at: '2026-09-30T11:30:00.000Z' }))).toBe('manual'); // 30 min después
    expect(nightOrigin(night({ wake_time: '2026-09-30T07:00:00-04:00', wake_logged_at: null }))).toBe('manual');
  });
});

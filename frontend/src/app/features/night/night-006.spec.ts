import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { SleepRecord, Stats } from '../../core/api.service';
import { toInputLocal } from '../../core/time';
import { NightComponent } from './night.component';
import { NightCardComponent } from './night-card.component';
import { CycleSettingsComponent } from './cycle-settings.component';
import { NightUiService } from './night-ui.service';
import { flushStreak } from '../streak/streak.testing';

// Feature 006 en Noche: calculadora (US2), recordatorio de noche abierta (US4), tarjeta (US5) e insignias (US1).
const PROFILE = { id: 1, email: 'yo@x.com', role: 'owner', display_name: 'Yo', timezone: null, sleep_goal_min: 450, cycle_min: 90, latency_min: 15, consent_version: null, consent_at: null, created_at: '' };
const EMPTY_STATS: Stats = { from: '', to: '', days: [], summary: { avg_sleep_min: 0, total_naps: 0, avg_bedtime_min: null, avg_wake_min: null } } as unknown as Stats;
const HOUR = 3600_000;

function night(p: Partial<SleepRecord>): SleepRecord {
  return { id: 7, date: '2026-09-29', bedtime: '2026-09-29T23:00:00-04:00', wake_time: null, notes: null, duration_min: null, sol_bucket: null, awakenings_bucket: null, ...p };
}

describe('NightComponent · feature 006', () => {
  let fixture: ComponentFixture<NightComponent>;
  let http: HttpTestingController;
  let el: HTMLElement;

  function start(open: SleepRecord | null = null, records: SleepRecord[] = [], profile = PROFILE) {
    fixture = TestBed.createComponent(NightComponent);
    el = fixture.nativeElement;
    fixture.detectChanges();
    http.expectOne('/api/me').flush(profile);
    flushLoad(open, records);
  }
  function flushLoad(open: SleepRecord | null = null, records: SleepRecord[] = []) {
    http.expectOne('/api/sleep/open').flush(open);
    // Feature 010: con una noche abierta se pide el horario de su fecha (aquí, sin horario)
    for (const r of http.match((r) => r.url === '/api/schedule')) r.flush({ version: null, lead_min: 30, pause: null });
    http.expectOne((r) => r.url === '/api/sleep' && r.method === 'GET').flush(records);
    http.expectOne((r) => r.url === '/api/naps').flush([]);
    http.expectOne((r) => r.url === '/api/stats').flush(EMPTY_STATS);
    fixture.detectChanges();
  }
  const button = (text: string) => Array.from(el.querySelectorAll('button')).find((b) => b.textContent!.trim() === text) as HTMLButtonElement;
  const windows = () => Array.from(el.querySelectorAll('app-cycle-calculator li')).map((li) => li.textContent!.replace(/\s+/g, ' ').trim());

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [NightComponent], providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { flushStreak(http); http.verify(); });

  describe('calculadora (US2)', () => {
    it('bajo "¿Hora de dormir?" muestra 3 ventanas estimadas con el texto fijo, y se recalcula al cambiar la hora', () => {
      start();
      fixture.componentInstance.bedtimeInput.set('2026-09-29T23:00');
      fixture.detectChanges();
      expect(windows()).toEqual(['4 ciclos entre 5:00 y 5:30 (mañana)', '5 ciclos entre 6:30 y 7:00 (mañana)', '6 ciclos entre 8:00 y 8:30 (mañana)']);
      const calc = el.querySelector('app-cycle-calculator')!;
      expect(calc.textContent).toContain('Estimado');
      expect(calc.textContent).toContain('Estimación, no medición; no está demostrado que despertar al final de un ciclo mejore cómo te sientes.');

      fixture.componentInstance.bedtimeInput.set('2026-09-29T22:00');
      fixture.detectChanges();
      expect(windows()[1]).toBe('5 ciclos entre 5:30 y 6:00 (mañana)');
    });

    it('usa los ajustes de la persona y los cambia al guardarlos desde "Ajustar"', () => {
      start(null, [], { ...PROFILE, cycle_min: 100, latency_min: 20 });
      fixture.componentInstance.bedtimeInput.set('2026-09-29T23:00');
      fixture.detectChanges();
      expect(windows()[0]).toContain('entre 5:45 y 6:15'); // 23:00 + 20 + 4 × 100 min = 6:00, ± 15
      fixture.componentInstance.updateSettings({ cycleMin: 90, latencyMin: 15 });
      fixture.detectChanges();
      expect(windows()[0]).toContain('entre 5:00 y 5:30');
    });

    it('con una noche abierta calcula desde la hora real de acostarse; "Me voy a dormir" sigue siendo 1 toque', () => {
      start(night({ bedtime: new Date(Date.now() - HOUR).toISOString() }));
      expect(windows().length).toBe(3);
      fixture.componentInstance.open.set(null);
      fixture.detectChanges();
      button('Me voy a dormir').click();
      http.expectOne((r) => r.url === '/api/sleep' && r.method === 'POST').flush(night({ id: 9 }));
      flushLoad(night({ id: 9 }));
      expect(el.querySelector('app-night-card')).toBeNull();
    });
  });

  describe('recordatorio de noche abierta (US4)', () => {
    it('con menos de 14 h abierta no hay aviso', () => {
      start(night({ bedtime: new Date(Date.now() - 14 * HOUR + 60_000).toISOString() }));
      expect(el.textContent).not.toContain('¿Olvidaste marcar que despertaste?');
    });

    it('con 14 h o más propone dormir + objetivo y "Sí" cierra la noche con esa hora; después llega la tarjeta', () => {
      const bed = new Date(Date.now() - 15 * HOUR);
      start(night({ bedtime: bed.toISOString() }));
      expect(el.querySelector('[role="status"]')!.textContent).toContain('¿Olvidaste marcar que despertaste?');
      expect(fixture.componentInstance.reminderInput()).toBe(toInputLocal(new Date(bed.getTime() + 450 * 60_000)));

      button('Sí, desperté a esa hora').click();
      const req = http.expectOne('/api/sleep/wake');
      expect(new Date(req.request.body.wake_time).getTime()).toBe(Math.floor((bed.getTime() + 450 * 60_000) / 60_000) * 60_000);
      req.flush(night({ wake_time: req.request.body.wake_time, duration_min: 450 }));
      flushLoad();
      expect(el.querySelector('app-night-card')).not.toBeNull();
    });

    it('con 48 h abierta la propuesta sigue siendo dormir + objetivo (en el pasado)', () => {
      const bed = new Date(Date.now() - 48 * HOUR);
      start(night({ bedtime: bed.toISOString() }));
      expect(fixture.componentInstance.reminderInput()).toBe(toInputLocal(new Date(bed.getTime() + 450 * 60_000)));
    });

    it('"Aún no" lo oculta y no reaparece al volver a la pestaña; una hora futura se rechaza', () => {
      start(night({ bedtime: new Date(Date.now() - 20 * HOUR).toISOString() }));
      fixture.componentInstance.reminderInput.set(toInputLocal(new Date(Date.now() + 2 * HOUR)));
      button('Sí, desperté a esa hora').click();
      fixture.detectChanges();
      expect(el.querySelector('[role="alert"]')!.textContent).toContain('no puede estar en el futuro');
      button('Aún no').click();
      fixture.detectChanges();
      expect(el.textContent).not.toContain('¿Olvidaste marcar que despertaste?');
      expect(TestBed.inject(NightUiService).reminderDismissed()).toBeTrue();
    });
  });

  describe('tarjeta "¿Cómo fue la noche?" (US5)', () => {
    it('"Ya desperté" cierra en 1 toque y la tarjeta llega después; cerrarla no guarda nada', () => {
      start(night({ bedtime: new Date(Date.now() - 8 * HOUR).toISOString() }));
      expect(el.querySelector('app-night-card')).toBeNull();
      button('Ya desperté').click();
      http.expectOne('/api/sleep/wake').flush(night({ wake_time: new Date().toISOString(), duration_min: 480 }));
      flushLoad();
      expect(el.querySelector('app-night-card')!.textContent).toContain('¿Cómo fue la noche?');
      button('Cerrar').click();
      fixture.detectChanges();
      expect(el.querySelector('app-night-card')).toBeNull();
    });

    it('editar una noche permite cambiar o borrar las respuestas, y la lista las muestra en frases', () => {
      const closed = night({ wake_time: '2026-09-30T07:00:00-04:00', duration_min: 480, sol_bucket: '15_30', awakenings_bucket: '3plus' });
      start(null, [closed]);
      expect(el.querySelector('.answers')!.textContent).toBe('Tardé 15–30 min en dormirme · Desperté 3 o más veces');
      fixture.componentInstance.startEdit(closed);
      fixture.componentInstance.edit.sol = '';
      fixture.componentInstance.saveEdit(closed.id);
      const req = http.expectOne('/api/sleep/7');
      expect(req.request.body.sol_bucket).toBeNull();
      expect(req.request.body.awakenings_bucket).toBe('3plus');
      req.flush(closed);
      flushLoad(null, [closed]);
    });
  });

  it('insignia "Anotado por ti" una vez en la cabecera de la cinta y de la lista (US1)', () => {
    start(null, [night({ wake_time: '2026-09-30T07:00:00-04:00', duration_min: 480 })]);
    const heads = Array.from(el.querySelectorAll('.block-head'));
    expect(heads.length).toBe(2);
    for (const h of heads) expect(h.querySelectorAll('app-origin-badge').length).toBe(1);
    expect(heads[0].textContent).toContain('Anotado por ti');
    expect(el.querySelectorAll('.record app-origin-badge').length).toBe(0);
  });
});

describe('NightCardComponent', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { flushStreak(http); http.verify(); });

  it('cada toque guarda su respuesta; tocar la elegida la borra', () => {
    const f = TestBed.createComponent(NightCardComponent);
    f.componentRef.setInput('night', night({ wake_time: '2026-09-30T07:00:00-04:00' }));
    f.detectChanges();
    const el: HTMLElement = f.nativeElement;
    const chip = (t: string) => Array.from(el.querySelectorAll('button.chip')).find((b) => b.textContent!.trim() === t) as HTMLButtonElement;

    chip('15–30 min').click();
    let req = http.expectOne('/api/sleep/7');
    expect(req.request.body).toEqual({ sol_bucket: '15_30' });
    req.flush(night({ sol_bucket: '15_30' }));
    f.detectChanges();
    expect(chip('15–30 min').getAttribute('aria-pressed')).toBe('true');

    chip('1–2').click();
    req = http.expectOne('/api/sleep/7');
    expect(req.request.body).toEqual({ awakenings_bucket: '1_2' });
    req.flush(night({ sol_bucket: '15_30', awakenings_bucket: '1_2' }));
    f.detectChanges();

    chip('15–30 min').click();
    req = http.expectOne('/api/sleep/7');
    expect(req.request.body).toEqual({ sol_bucket: null });
    req.flush(night({ awakenings_bucket: '1_2' }));
  });
});

describe('CycleSettingsComponent', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { flushStreak(http); http.verify(); });

  it('guarda ciclo y tiempo en dormirse; un 400 muestra el rango del servidor', () => {
    const f = TestBed.createComponent(CycleSettingsComponent);
    f.componentRef.setInput('cycleMin', 100);
    f.componentRef.setInput('latencyMin', 20);
    f.detectChanges();
    const c = f.componentInstance;
    let changed: unknown = null;
    c.changed.subscribe((v) => (changed = v));
    c.save();
    let req = http.expectOne((r) => r.url === '/api/me' && r.method === 'PUT');
    expect(req.request.body).toEqual({ cycle_min: 100, latency_min: 20 });
    req.flush({ ...PROFILE, cycle_min: 100, latency_min: 20 });
    expect(changed).toEqual({ cycleMin: 100, latencyMin: 20 });

    c.cycle = 120;
    c.save();
    req = http.expectOne((r) => r.url === '/api/me' && r.method === 'PUT');
    req.flush({ error: 'La duración del ciclo debe estar entre 70 y 110 minutos' }, { status: 400, statusText: 'Bad Request' });
    f.detectChanges();
    expect((f.nativeElement as HTMLElement).querySelector('[role="alert"]')!.textContent).toContain('entre 70 y 110 minutos');
  });
});

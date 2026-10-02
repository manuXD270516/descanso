import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Dashboard, DashboardDay } from '../../core/dashboard.service';
import { cyclesFor, fmtGoal } from '../../core/cycles';
import { localDate } from '../../core/time';
import { TrendsComponent } from './trends.component';
import { GoalEditorComponent } from './goal-editor.component';
import { DailyBarsComponent } from '../../shared/charts/daily-bars.component';
import { WelcomeComponent } from '../onboarding/welcome.component';
import { AuthService } from '../../core/auth.service';

const day = (date: string, status: DashboardDay['status'], total: number | null, nap: number | null = null): DashboardDay => ({
  date, status, night_min: status === 'data' && total !== null ? total - (nap ?? 0) : null, nap_min: nap, total_min: total,
});

function dashboard(overrides: Partial<Dashboard> = {}): Dashboard {
  return {
    goal_min: 420,
    cycle_min: 90,
    period: { from: '2026-09-01', to: '2026-09-30', days: 30 },
    days: [day('2026-09-28', 'data', 450, 30), day('2026-09-29', 'none', null), day('2026-09-30', 'in_progress', null)],
    summary: { avg_min: 450, days_with_data: 1, goal_met: 1 },
    pending14: { net_min: 200, days: 8 },
    regularity: null,
    cycles: cyclesFor(420),
    ...overrides,
  };
}

describe('Tendencias (feature 005)', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  function render(d: Dashboard = dashboard()) {
    const fixture = TestBed.createComponent(TrendsComponent);
    fixture.detectChanges();
    const req = http.expectOne((r) => r.url === '/api/dashboard');
    expect(req.request.params.get('to')).toBe(localDate());
    req.flush(d);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement, c: fixture.componentInstance, req };
  }

  it('muestra solo 3 indicadores arriba y el texto de sueño pendiente (FR-003, FR-004)', () => {
    const { el } = render();
    const labels = Array.from(el.querySelectorAll('.summary .lbl')).map((l) => l.textContent!.trim());
    expect(labels).toEqual(['media diaria', 'días con tus horas objetivo', 'sueño pendiente (14 días)']);
    expect(el.querySelector('.summary')!.textContent).toContain('1 de 1');
    expect(el.textContent).toContain('Te faltan 3 h 20 min en los últimos 14 días (8 días registrados)');
  });

  it('pendiente negativo o sin datos → textos sin culpa', () => {
    expect(render(dashboard({ pending14: { net_min: -30, days: 3 } })).el.textContent).toContain('No tienes sueño pendiente: llevas 30 min de más');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    expect(render(dashboard({ pending14: { net_min: null, days: 0 } })).el.textContent).toContain('Aún no hay datos en los últimos 14 días');
  });

  it('el selector de periodo vuelve a pedir el dashboard con 7, 30 o 90 días (US1-6)', () => {
    const { c } = render();
    c.select(90);
    const req = http.expectOne((r) => r.url === '/api/dashboard');
    expect(req.request.params.get('days')).toBe('90');
    req.flush(dashboard({ period: { from: '2026-07-03', to: '2026-09-30', days: 90 } }));
  });

  it('regularidad: con menos de 7 noches dice "Aún no hay datos suficientes"; con datos, ±min (US3)', () => {
    expect(render().el.querySelector('.regularity')!.textContent).toContain('Aún no hay datos suficientes');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    const reg = { nights: 10, bedtime: { mean_min: 1380, spread_min: 40 }, wake: { mean_min: 420, spread_min: 15 } };
    const text = render(dashboard({ regularity: reg })).el.querySelector('.regularity')!.textContent!;
    expect(text).toContain('±40 min');
    expect(text).toContain('23:00');
  });
});

describe('DailyBarsComponent (FR-002, FR-011, FR-013)', () => {
  beforeEach(() => TestBed.configureTestingModule({}));

  it('svg con rol de imagen, título y descripción; "sin dato" y "en curso" diferenciados; tabla con los mismos días', () => {
    const fixture = TestBed.createComponent(DailyBarsComponent);
    fixture.componentRef.setInput('days', [day('2026-09-28', 'data', 450, 30), day('2026-09-29', 'none', null), day('2026-09-30', 'in_progress', null)]);
    fixture.componentRef.setInput('goalMin', 420);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const svg = el.querySelector('svg')!;
    expect(svg.getAttribute('role')).toBe('img');
    expect(el.querySelector(`#${svg.getAttribute('aria-labelledby')}`)!.textContent).toContain('Horas dormidas');
    expect(el.querySelector(`#${svg.getAttribute('aria-describedby')}`)!.textContent).toContain('1 con dato, de los que 1 llegan a tu objetivo de 7 h');
    expect(el.querySelectorAll('rect.bar').length).toBe(1);
    expect(el.querySelectorAll('line.bar-none').length).toBe(1);
    expect(el.querySelectorAll('rect.bar-progress').length).toBe(1);
    const cells = Array.from(el.querySelectorAll('tbody tr')).map((r) => r.lastElementChild!.textContent!.trim());
    expect(cells).toEqual(['7 h 30 min', 'Sin dato', 'En curso']);
  });
});

describe('Objetivo y ciclos (US4, US5)', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('cyclesFor y fmtGoal: 7 h ≈ 4,7 ciclos; atajos de 6 h, 7 h 30 y 9 h', () => {
    expect(cyclesFor(420)).toEqual({ equivalent: 4.7, shortcuts: [{ cycles: 4, minutes: 360 }, { cycles: 5, minutes: 450 }, { cycles: 6, minutes: 540 }] });
    expect(fmtGoal(450)).toBe('7 h 30');
    expect(fmtGoal(360)).toBe('6 h');
  });

  it('el editor muestra la equivalencia, guarda un atajo y valida el rango sin llamar al servidor', () => {
    const fixture = TestBed.createComponent(GoalEditorComponent);
    fixture.componentRef.setInput('goalMin', 420);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('4,7');
    expect(el.textContent).toContain('aunque varía entre personas');
    const c = fixture.componentInstance;
    let changed = 0;
    c.changed.subscribe((g) => (changed = g));
    c.choose(450);
    const req = http.expectOne((r) => r.url === '/api/me' && r.method === 'PUT');
    expect(req.request.body).toEqual({ sleep_goal_min: 450 });
    req.flush({});
    expect(changed).toBe(450);
    c.setParts(13, 0);
    c.save();
    fixture.detectChanges();
    expect(el.querySelector('[role="alert"]')!.textContent).toContain('entre 4 y 12 horas');
  });

  it('la bienvenida guarda un atajo o se salta, y marca onboarded', () => {
    const auth = TestBed.inject(AuthService);
    auth.onboarded.set(false);
    const fixture = TestBed.createComponent(WelcomeComponent);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('¿Cuántas horas quieres dormir?');
    fixture.componentInstance.finish(450);
    const req = http.expectOne('/api/me/onboarding');
    expect(req.request.body).toEqual({ sleep_goal_min: 450 });
    req.flush({});
    expect(auth.onboarded()).toBeTrue();

    auth.onboarded.set(false);
    fixture.componentInstance.finish();
    http.expectOne('/api/me/onboarding').flush({});
    expect(auth.onboarded()).toBeTrue();
  });
});

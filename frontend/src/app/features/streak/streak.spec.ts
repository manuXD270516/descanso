import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Type } from '@angular/core';
import { Streak, StreakDay } from '../../core/streak';
import { BedtimeNoticeComponent } from '../../shared/bedtime-notice.component';
import { WelcomeComponent } from '../onboarding/welcome.component';
import { StreakCardComponent } from './streak-card.component';
import { StreakMorningComponent } from './streak-morning.component';
import { StreakOfferComponent } from './streak-offer.component';
import { StreakPanelComponent } from './streak-panel.component';
import { StreakSettingsComponent } from './streak-settings.component';
import { STREAK_OFF, flushStreak } from './streak.testing';

// Interfaz de la racha (feature 011, US1–US4, US6).
const day = (date: string, state: StreakDay['state'], p: Partial<StreakDay> = {}): StreakDay =>
  ({ date, state, reason: null, bed_time: null, wake_time: null, late_logged: false, ...p });
const WEEK: StreakDay[] = [
  day('2026-09-28', 'met', { bed_time: '23:00', wake_time: '07:00' }),
  day('2026-09-29', 'missed', { reason: 'late_wake', bed_time: '23:00', wake_time: '09:10', late_logged: true }),
  day('2026-09-30', 'paused'),
  day('2026-10-01', 'met'),
  day('2026-10-02', 'pending'),
  day('2026-10-03', 'pending'),
  day('2026-10-04', 'pending'),
];
const ON: Streak = {
  enabled: true, offered: true, margin_min: 30, offer: false, current: 12, best: 25, total: 60, cut: false,
  week: WEEK, last_night: WEEK[0], summary: null,
  achievements: [{ key: 7, achieved_on: '2026-09-10', wake_spread_min: 12, seen: true }, { key: 66, achieved_on: '2026-10-01', wake_spread_min: 9, seen: true }],
};

describe('Racha de constancia (feature 011)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  function mount<T>(type: Type<T>, streak?: Streak): { fixture: ComponentFixture<T>; el: HTMLElement } {
    const fixture = TestBed.createComponent(type);
    fixture.detectChanges();
    if (streak) flushStreak(http, streak);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement };
  }
  const button = (el: HTMLElement, text: string) => Array.from(el.querySelectorAll('button')).find((b) => b.textContent!.trim() === text)!;

  it('tarjeta: role="status", "Cerrar" la descarta y sin brillo con movimiento reducido', () => {
    const fixture = TestBed.createComponent(StreakCardComponent);
    fixture.componentRef.setInput('title', 'Constelación de 7 días');
    fixture.componentRef.setInput('glow', true);
    let closed = false;
    fixture.componentInstance.dismissed.subscribe(() => (closed = true));
    fixture.detectChanges();
    const card = fixture.nativeElement.querySelector('.streak-card') as HTMLElement;
    expect(card.getAttribute('role')).toBe('status');
    expect(card.classList).toContain('glow');
    button(fixture.nativeElement, 'Cerrar').click();
    expect(closed).toBeTrue();
    const css = Array.from(document.styleSheets).flatMap((s) => Array.from(s.cssRules).map((r) => r.cssText)).join('\n');
    expect(css).toMatch(/prefers-reduced-motion: reduce\)\s*\{\s*\.glow[^{]*\{\s*animation: (none|auto)/);
    expect(css).toContain('400ms');
  });

  it('mañana: "Día N de constancia ★" con la noche cumplida; nada desactivada y sin oferta', () => {
    let { el } = mount(StreakMorningComponent, ON);
    expect(el.textContent).toContain('Día 12 de constancia ★');
    ({ el } = mount(StreakMorningComponent, STREAK_OFF));
    expect(el.textContent!.trim()).toBe('');
  });

  it('mañana: logro sin ver una sola vez; "Cerrar" lo marca visto', () => {
    const { fixture, el } = mount(StreakMorningComponent, { ...ON, achievements: [{ key: 7, achieved_on: '2026-10-05', wake_spread_min: 12, seen: false }] });
    expect(el.textContent).toContain('Constelación de 7 días');
    expect(el.textContent).toContain('Tu hora de levantarte varió solo ±12 min');
    button(el, 'Cerrar').click();
    http.expectOne('/api/streak/achievements/7/seen').flush(null);
    flushStreak(http, ON);
    fixture.detectChanges();
    expect(el.textContent).not.toContain('Constelación de 7 días');
  });

  it('mañana: racha cortada → nuevo comienzo sin culpa', () => {
    const { el } = mount(StreakMorningComponent, { ...ON, current: 0, cut: true, last_night: day('2026-10-04', 'missed', { reason: 'no_record' }) });
    expect(el.textContent).toContain('Tu récord sigue siendo 25');
  });

  it('oferta: "Sí, activarla" y "Ahora no" en un toque cada una', () => {
    const { fixture, el } = mount(StreakOfferComponent);
    const answers: boolean[] = [];
    fixture.componentInstance.answered.subscribe((v) => answers.push(v));
    expect(el.textContent).toContain('¿Quieres llevar una racha de constancia?');
    button(el, 'Sí, activarla').click();
    const on = http.expectOne('/api/streak/settings');
    expect(on.request.body.enabled).toBeTrue();
    on.flush({ ...STREAK_OFF, enabled: true, offered: true });
    button(el, 'Ahora no').click();
    const no = http.expectOne('/api/streak/settings');
    expect(no.request.body.offered).toBeTrue();
    no.flush({ ...STREAK_OFF, offered: true });
    expect(answers).toEqual([true, false]);
  });

  it('mañana y panel: la oferta aparece cuando el servidor la propone', () => {
    expect(mount(StreakMorningComponent, { ...STREAK_OFF, offer: true }).el.textContent).toContain('¿Quieres llevar una racha de constancia?');
    expect(mount(StreakPanelComponent, { ...STREAK_OFF, offer: true }).el.textContent).toContain('¿Quieres llevar una racha de constancia?');
    expect(mount(StreakPanelComponent, STREAK_OFF).el.textContent!.trim()).toBe('');
  });

  it('panel: día, récord, total, tolerancia y estrellas accesibles sin colores de error', () => {
    const { el } = mount(StreakPanelComponent, ON);
    expect(el.querySelector('summary')!.textContent).toContain('Constancia');
    expect(el.textContent).toContain('Día 12 de constancia');
    expect(el.textContent).toContain('Tu récord: 25');
    expect(el.textContent).toContain('Días cumplidos en total: 60');
    expect(el.textContent).toContain('Puedes fallar hasta 2 días en cualquier periodo de 7 días seguidos');
    const stars = Array.from(el.querySelectorAll('.week li'));
    expect(stars.length).toBe(7);
    expect(stars[1].getAttribute('aria-label')).toBe('Noche del martes: no cumplido. Te levantaste a las 9:10 (fuera de tu horario). Anotado después');
    expect(stars[1].textContent).toContain('Anotado después');
    expect(stars[2].getAttribute('aria-label')).toContain('en pausa');
    expect(el.querySelectorAll('.error, .btn-danger').length).toBe(0);
    expect(el.textContent).toContain('66 días es la media');
    expect(el.textContent!.toLowerCase()).not.toMatch(/puntos|nivel|ranking|monedas/);
  });

  it('panel: resumen de la semana con su origen; descartarlo lo guarda', () => {
    const { fixture, el } = mount(StreakPanelComponent, { ...ON, summary: { week_start: '2026-09-28', met: 5, of: 7, avg_min: 430 } });
    expect(el.textContent).toContain('La semana pasada: 5 de 7 días cumplidos · media 7 h 10 min');
    expect(el.textContent).toContain('Anotado por ti');
    button(el, 'Cerrar').click();
    const put = http.expectOne('/api/streak/settings');
    expect(put.request.body.dismiss_summary).toBeTrue();
    put.flush(STREAK_OFF);
    flushStreak(http, ON);
    fixture.detectChanges();
    expect(el.textContent).not.toContain('La semana pasada');
  });

  it('ajustes: activar, margen y el error del servidor', () => {
    const { fixture, el } = mount(StreakSettingsComponent, { ...ON });
    expect(el.textContent).toContain('Llevar una racha de constancia');
    fixture.componentInstance.margin = 14;
    button(el, 'Guardar margen').click();
    http.expectOne('/api/streak/settings').flush({ error: 'El margen debe ser entre 15 y 60 minutos' }, { status: 400, statusText: 'Bad Request' });
    fixture.detectChanges();
    expect(el.querySelector('[role="alert"]')!.textContent).toContain('El margen debe ser entre 15 y 60 minutos');
  });

  it('el aviso de la hora de acostarse no muestra ni pide nada de la racha (SC-003)', () => {
    const fixture = TestBed.createComponent(BedtimeNoticeComponent);
    fixture.detectChanges();
    expect(http.match((r) => r.url.startsWith('/api/streak')).length).toBe(0);
    for (const r of http.match(() => true)) r.flush({ version: null, lead_min: 30, pause: null });
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent!.toLowerCase()).not.toContain('constancia');
  });

  it('bienvenida: ofrece la racha una vez; responder la oculta sin salir de la pantalla', () => {
    const { fixture, el } = mount(WelcomeComponent);
    expect(el.textContent).toContain('¿Quieres llevar una racha de constancia?');
    button(el, 'Ahora no').click();
    http.expectOne('/api/streak/settings').flush({ ...STREAK_OFF, offered: true });
    fixture.detectChanges();
    expect(el.textContent).not.toContain('¿Quieres llevar una racha de constancia?');
    expect(el.textContent).toContain('¿Cuántas horas quieres dormir?');
  });
});

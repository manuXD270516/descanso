import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { NapsComponent } from './naps.component';
import { Nap } from '../../core/api.service';
import { addDays, localDate } from '../../core/time';

describe('NapsComponent', () => {
  let fixture: ComponentFixture<NapsComponent>;
  let http: HttpTestingController;
  let el: HTMLElement;
  const now = new Date(2026, 8, 8, 15, 0); // 8 sep 2026, 15:00 hora local

  const button = (text: string) => Array.from(el.querySelectorAll('button')).find((b) => b.textContent!.trim() === text)!;
  const hint = () => el.querySelector('.form .muted.small')!.textContent!.trim();

  function flushList(naps: Nap[] = []) {
    http.expectOne((r) => r.url === '/api/naps').flush(naps);
    fixture.detectChanges();
  }

  beforeEach(() => {
    jasmine.clock().install();
    jasmine.clock().mockDate(now);
    TestBed.configureTestingModule({
      imports: [NapsComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(NapsComponent);
    el = fixture.nativeElement;
    fixture.detectChanges();
  });

  afterEach(() => {
    http.verify();
    jasmine.clock().uninstall();
  });

  it('pide las siestas de los últimos 30 días (FR-012)', () => {
    const req = http.expectOne((r) => r.url === '/api/naps');
    const today = localDate(now);
    expect(req.request.params.get('from')).toBe(addDays(today, -29));
    expect(req.request.params.get('to')).toBe(today);
    req.flush([]);
  });

  it('propone los últimos 30 minutos y muestra la duración (US3-1)', () => {
    flushList();
    expect(fixture.componentInstance.form.start).toBe('2026-09-08T14:30');
    expect(fixture.componentInstance.form.end).toBe('2026-09-08T15:00');
    expect(hint()).toBe('Duración: 30 min');
    expect(button('Guardar siesta').disabled).toBeFalse();
  });

  it('con fin igual o anterior al inicio avisa y deshabilita "Guardar siesta" (US3-2)', () => {
    flushList();
    fixture.componentInstance.form.end = '2026-09-08T14:30';
    fixture.detectChanges();
    expect(hint()).toBe('El fin debe ser posterior al inicio');
    expect(button('Guardar siesta').disabled).toBeTrue();
  });

  it('agrupa por día con número de siestas y total (US3-3)', () => {
    flushList([
      { id: 2, date: '2026-09-08', start_time: '2026-09-08T17:00:00-04:00', end_time: '2026-09-08T17:45:00-04:00', notes: null, duration_min: 45 },
      { id: 1, date: '2026-09-08', start_time: '2026-09-08T13:00:00-04:00', end_time: '2026-09-08T13:20:00-04:00', notes: null, duration_min: 20 },
      { id: 0, date: '2026-09-07', start_time: '2026-09-07T14:00:00-04:00', end_time: '2026-09-07T14:30:00-04:00', notes: null, duration_min: 30 },
    ]);
    const heads = Array.from(el.querySelectorAll('.day-head .muted')).map((h) => h.textContent!.replace(/\s+/g, ' ').trim());
    expect(heads).toEqual(['2 siestas · 1 h 05 min', '1 siesta · 30 min']);
  });

  it('guardar envía la fecha del día del inicio y horas ISO con offset (FR-011)', () => {
    flushList();
    button('Guardar siesta').click();
    const req = http.expectOne((r) => r.url === '/api/naps' && r.method === 'POST');
    expect(req.request.body.date).toBe('2026-09-08');
    expect(req.request.body.start_time).toMatch(/^2026-09-08T14:30:00[+-]\d{2}:\d{2}$/);
    expect(req.request.body.end_time).toMatch(/^2026-09-08T15:00:00[+-]\d{2}:\d{2}$/);
    req.flush({});
    flushList();
  });

  it('eliminar pide confirmación (US3-5)', () => {
    flushList([{ id: 5, date: '2026-09-08', start_time: '2026-09-08T13:00:00-04:00', end_time: '2026-09-08T13:20:00-04:00', notes: null, duration_min: 20 }]);
    spyOn(window, 'confirm').and.returnValue(true);
    button('Eliminar').click();
    const req = http.expectOne('/api/naps/5');
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
    flushList();
  });
});

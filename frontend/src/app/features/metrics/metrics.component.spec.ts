import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MetricsComponent } from './metrics.component';
import { Metric, MetricEntry } from '../../core/api.service';
import { addDays, localDate } from '../../core/time';

function metric(p: Partial<Metric>): Metric {
  return { id: 1, name: 'Calidad del sueño', type: 'scale', unit: null, min_value: 1, max_value: 5, color: '#5b6ee1', sort_order: 0, archived: 0, ...p };
}

describe('MetricsComponent', () => {
  let fixture: ComponentFixture<MetricsComponent>;
  let http: HttpTestingController;
  let el: HTMLElement;
  const today = localDate();

  const buttons = (text: string) => Array.from(el.querySelectorAll('button')).filter((b) => b.textContent!.trim() === text);
  const button = (text: string) => buttons(text)[0];
  const byLabel = (label: string) => el.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement;

  const flushMetrics = (metrics: Metric[]) => http.expectOne((r) => r.url === '/api/metrics' && r.method === 'GET').flush(metrics);
  const flushEntries = (entries: MetricEntry[] = []) => {
    http.expectOne((r) => r.url === '/api/metrics/entries').flush(entries);
    fixture.detectChanges();
  };
  const load = (metrics: Metric[], entries: MetricEntry[] = []) => {
    flushMetrics(metrics);
    flushEntries(entries);
  };
  const entry = (metric_id: number, value: string, date = today): MetricEntry => ({ id: metric_id, metric_id, date, value });

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [MetricsComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(MetricsComponent);
    el = fixture.nativeElement;
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it('carga todas las métricas y los valores de los 7 días que terminan hoy (FR-024)', () => {
    const m = http.expectOne((r) => r.url === '/api/metrics');
    expect(m.request.params.get('all')).toBe('1');
    m.flush([metric({})]);
    const e = http.expectOne((r) => r.url === '/api/metrics/entries');
    expect(e.request.params.get('from')).toBe(addDays(today, -6));
    expect(e.request.params.get('to')).toBe(today);
    e.flush([]);
    fixture.detectChanges();
    expect(el.querySelectorAll('.history thead th').length).toBe(1 + 7);
  });

  it('en una escala, pulsar un valor lo guarda y volver a pulsarlo lo borra (US5-3)', () => {
    load([metric({})]);
    button('4').click();
    const put = http.expectOne(`/api/metrics/1/entries/${today}`);
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual({ value: 4 });
    put.flush(entry(1, '4'));
    flushEntries([entry(1, '4')]);

    button('4').click();
    const del = http.expectOne(`/api/metrics/1/entries/${today}`);
    expect(del.request.method).toBe('DELETE');
    del.flush(null);
    flushEntries();
  });

  it('sí/no alterna "Sin registrar" → "Sí" → "No" (US5-5)', () => {
    load([metric({ id: 2, name: 'Ejercicio', type: 'boolean', min_value: null, max_value: null })]);
    const bool = () => el.querySelector('button.bool') as HTMLButtonElement;
    expect(bool().textContent!.trim()).toBe('Sin registrar');

    bool().click();
    let req = http.expectOne(`/api/metrics/2/entries/${today}`);
    expect(req.request.body).toEqual({ value: '1' });
    req.flush(entry(2, '1'));
    flushEntries([entry(2, '1')]);
    expect(bool().textContent!.trim()).toBe('Sí');

    bool().click();
    req = http.expectOne(`/api/metrics/2/entries/${today}`);
    expect(req.request.body).toEqual({ value: '0' });
    req.flush(entry(2, '0'));
    flushEntries([entry(2, '0')]);
    expect(bool().textContent!.trim()).toBe('No');
  });

  it('no permite avanzar más allá de hoy, pero sí retroceder (US5-9, FR-023)', () => {
    load([metric({})]);
    expect(byLabel('Día siguiente').disabled).toBeTrue();
    byLabel('Día anterior').click();
    const req = http.expectOne((r) => r.url === '/api/metrics/entries');
    expect(req.request.params.get('to')).toBe(addDays(today, -1));
    req.flush([]);
    fixture.detectChanges();
    expect(byLabel('Día siguiente').disabled).toBeFalse();
  });

  it('archivar envía archived: 1 y recarga (US5-7)', () => {
    load([metric({})]);
    button('Archivar').click();
    const req = http.expectOne('/api/metrics/1');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ archived: 1 });
    req.flush(metric({ archived: 1 }));
    load([metric({ archived: 1 })]);
    expect(el.querySelector('.entries .empty')).not.toBeNull();
  });

  it('"Eliminar" solo aparece en las archivadas y respeta la confirmación (US5-8)', () => {
    load([metric({}), metric({ id: 9, name: 'Vieja', archived: 1 })]);
    expect(buttons('Eliminar').length).toBe(0);
    button('1 archivada').click();
    fixture.detectChanges();

    const confirmSpy = spyOn(window, 'confirm').and.returnValue(false);
    button('Eliminar').click();
    http.expectNone('/api/metrics/9');

    confirmSpy.and.returnValue(true);
    button('Eliminar').click();
    const req = http.expectOne('/api/metrics/9');
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
    load([metric({})]);
  });

  it('bajar la primera métrica reescribe sort_order de todas las activas (US5-6, FR-020)', () => {
    load([metric({ id: 1, sort_order: 0 }), metric({ id: 2, name: 'Energía', sort_order: 1 })]);
    (el.querySelectorAll('button[aria-label="Bajar"]')[0] as HTMLButtonElement).click();
    const r2 = http.expectOne('/api/metrics/2');
    const r1 = http.expectOne('/api/metrics/1');
    expect(r2.request.body).toEqual({ sort_order: 0 });
    expect(r1.request.body).toEqual({ sort_order: 1 });
    r2.flush({});
    r1.flush({});
    load([metric({ id: 2, name: 'Energía', sort_order: 0 }), metric({ id: 1, sort_order: 1 })]);
  });

  it('"Crear métrica" está deshabilitado mientras no hay nombre (US5-2)', () => {
    load([]);
    button('Nueva métrica').click();
    fixture.detectChanges();
    expect(button('Crear métrica').disabled).toBeTrue();
    fixture.componentInstance.patch('name', 'Ánimo');
    fixture.detectChanges();
    expect(button('Crear métrica').disabled).toBeFalse();
  });
});

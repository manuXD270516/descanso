import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { NightComponent } from './night.component';
import { Nap, SleepRecord, Stats } from '../../core/api.service';
import { addDays, localDate, nightDate } from '../../core/time';

const EMPTY_STATS: Stats = {
  days: [],
  summary: { nights: 0, avg_sleep_min: 0, avg_nap_min: 0, total_naps: 0, avg_bedtime_min: null, avg_wake_min: null },
};

function record(p: Partial<SleepRecord>): SleepRecord {
  return { id: 1, date: '2026-09-07', bedtime: '2026-09-07T23:40:00-04:00', wake_time: null, notes: null, duration_min: null, ...p };
}

describe('NightComponent', () => {
  let fixture: ComponentFixture<NightComponent>;
  let http: HttpTestingController;
  let el: HTMLElement;

  const today = localDate();
  const from = addDays(today, -13);

  /** Responde a las 4 cargas iniciales (noche abierta, noches, siestas, resumen). */
  function flushLoad(opts: { open?: SleepRecord | null; records?: SleepRecord[]; naps?: Nap[]; stats?: Stats } = {}) {
    http.expectOne('/api/sleep/open').flush(opts.open ?? null);
    http.expectOne((r) => r.url === '/api/sleep' && r.method === 'GET').flush(opts.records ?? []);
    http.expectOne((r) => r.url === '/api/naps').flush(opts.naps ?? []);
    http.expectOne((r) => r.url === '/api/stats').flush(opts.stats ?? EMPTY_STATS);
    fixture.detectChanges();
  }

  const buttons = () => Array.from(el.querySelectorAll('button')).map((b) => b.textContent!.trim());
  const button = (text: string) => Array.from(el.querySelectorAll('button')).find((b) => b.textContent!.trim() === text)!;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [NightComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(NightComponent);
    el = fixture.nativeElement;
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  // --- US1 ---

  it('sin noche abierta muestra "Me voy a dormir" y al pulsarlo crea la noche con su fecha de noche (US1-1)', () => {
    flushLoad();
    expect(buttons()).toContain('Me voy a dormir');

    button('Me voy a dormir').click();
    const req = http.expectOne((r) => r.url === '/api/sleep' && r.method === 'POST');
    expect(req.request.body.bedtime).toMatch(/[+-]\d{2}:\d{2}$/);
    expect(req.request.body.date).toBe(nightDate(req.request.body.bedtime));
    expect(req.request.body.date).toBe(today);
    req.flush(record({ date: today }));
    flushLoad({ open: record({ date: today }) });
  });

  it('con noche abierta muestra la hora de dormir y "Ya desperté", y oculta "Me voy a dormir" (US1-2, FR-027)', () => {
    const open = record({ bedtime: '2026-09-07T23:40:00' });
    flushLoad({ open });
    expect(el.querySelector('.state-title')!.textContent).toContain('Te acostaste a las 23:40');
    expect(buttons()).toContain('Ya desperté');
    expect(buttons()).not.toContain('Me voy a dormir');
  });

  it('"Ya desperté" cierra la noche con POST /api/sleep/wake (US1-3)', () => {
    flushLoad({ open: record({}) });
    button('Ya desperté').click();
    const req = http.expectOne('/api/sleep/wake');
    expect(req.request.method).toBe('POST');
    expect(req.request.body.wake_time).toMatch(/[+-]\d{2}:\d{2}$/);
    req.flush(record({ wake_time: req.request.body.wake_time, duration_min: 450 }));
    flushLoad();
  });

  it('muestra el error del servidor en un role="alert" (FR-028)', () => {
    flushLoad();
    button('Me voy a dormir').click();
    http.expectOne((r) => r.url === '/api/sleep' && r.method === 'POST').flush(
      { error: 'Ya hay una noche abierta. Ciérrala antes de abrir otra.' },
      { status: 409, statusText: 'Conflict' },
    );
    fixture.detectChanges();
    expect(el.querySelector('[role="alert"]')!.textContent).toContain('Ya hay una noche abierta');
  });

  it('un registro sin despertar aparece como "noche abierta" en la lista (FR-008)', () => {
    flushLoad({ open: record({}), records: [record({})] });
    expect(el.querySelector('.record-dur')!.textContent!.trim()).toBe('noche abierta');
  });

  // --- US2 ---

  describe('noches pasadas (US2)', () => {
    beforeEach(() => {
      flushLoad();
      button('Registrar una noche pasada').click();
      fixture.detectChanges();
    });

    it('"Guardar noche" está deshabilitado si falta dormir o despertar (US2-2)', () => {
      expect(button('Guardar noche').disabled).toBeTrue();
      fixture.componentInstance.manual = { bedtime: '2026-09-01T23:00', wake: '', notes: '' };
      fixture.detectChanges();
      expect(button('Guardar noche').disabled).toBeTrue();
    });

    it('guardar crea una noche cerrada con fecha de noche = día de la hora de dormir (US2-1)', () => {
      fixture.componentInstance.manual = { bedtime: '2026-09-01T23:00', wake: '2026-09-02T07:00', notes: 'ok' };
      fixture.detectChanges();
      button('Guardar noche').click();
      const req = http.expectOne((r) => r.url === '/api/sleep' && r.method === 'POST');
      expect(req.request.body.date).toBe('2026-09-01');
      expect(req.request.body.date).toBe(nightDate(req.request.body.bedtime));
      expect(req.request.body.wake_time).toMatch(/^2026-09-02T07:00:00[+-]\d{2}:\d{2}$/);
      expect(req.request.body.notes).toBe('ok');
      req.flush(record({ wake_time: req.request.body.wake_time }));
      flushLoad();
    });
  });

  it('editar y vaciar el despertar envía wake_time null (US2-3)', () => {
    const closed = record({ id: 7, wake_time: '2026-09-08T07:10:00-04:00', duration_min: 450 });
    flushLoad({ records: [closed] });
    button('Editar').click();
    fixture.detectChanges();
    fixture.componentInstance.edit.wake = '';
    button('Guardar cambios').click();
    const req = http.expectOne('/api/sleep/7');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body.wake_time).toBeNull();
    expect(req.request.body.date).toBe(nightDate(req.request.body.bedtime));
    req.flush(record({ id: 7 }));
    flushLoad();
  });

  it('al editar, la fecha de la noche se calcula de "Me dormí" y no se edita por separado (FR-025, DT-04)', () => {
    const closed = record({ id: 7, wake_time: '2026-09-08T07:10:00-04:00', duration_min: 450 });
    flushLoad({ records: [closed] });
    button('Editar').click();
    fixture.detectChanges();

    const dateInput = Array.from(el.querySelectorAll('label.field'))
      .find((l) => l.textContent!.includes('Fecha de la noche'))!
      .querySelector('input')!;
    expect(dateInput.readOnly).toBeTrue();

    fixture.componentInstance.edit.bedtime = '2026-09-06T22:30';
    fixture.componentInstance.edit.wake = '2026-09-07T06:30';
    fixture.detectChanges();
    expect(dateInput.value).toBe('2026-09-06');

    button('Guardar cambios').click();
    const req = http.expectOne('/api/sleep/7');
    expect(req.request.body.date).toBe('2026-09-06');
    expect(req.request.body.date).toBe(nightDate(req.request.body.bedtime));
    req.flush(record({ id: 7 }));
    flushLoad();
  });

  it('eliminar pide confirmación y solo borra si se confirma (US2-4)', () => {
    const closed = record({ id: 7, wake_time: '2026-09-08T07:10:00-04:00', duration_min: 450 });
    flushLoad({ records: [closed] });
    const confirmSpy = spyOn(window, 'confirm').and.returnValue(false);
    button('Eliminar').click();
    http.expectNone('/api/sleep/7');

    confirmSpy.and.returnValue(true);
    button('Eliminar').click();
    const req = http.expectOne('/api/sleep/7');
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
    flushLoad();
  });

  // --- US4 ---

  it('el resumen muestra promedio, horas medias y total de siestas (US4-1, US4-4)', () => {
    flushLoad({
      stats: {
        days: [],
        summary: { nights: 2, avg_sleep_min: 450, avg_nap_min: 30, total_naps: 3, avg_bedtime_min: 1410, avg_wake_min: 420 },
      },
    });
    const cells = Array.from(el.querySelectorAll('.summary > div')).map((d) => [
      d.querySelector('.num')!.textContent!.trim(),
      d.querySelector('.lbl')!.textContent!.trim(),
    ]);
    expect(cells).toEqual([
      ['7 h 30 min', 'promedio por noche'],
      ['23:30', 'hora media de dormir'],
      ['07:00', 'hora media de despertar'],
      ['3', 'siestas en 14 días'],
    ]);
  });

  it('sin datos muestra "—" en las horas medias y "0 min" de promedio (US4-5)', () => {
    flushLoad();
    const nums = Array.from(el.querySelectorAll('.summary .num')).map((n) => n.textContent!.trim());
    expect(nums).toEqual(['0 min', '—', '—', '0']);
  });

  it('la cinta tiene 14 filas, la más reciente arriba, y posiciona sueño y siestas en el eje 12:00–12:00 (US4-6)', () => {
    const yesterday = addDays(today, -1);
    const bedtime = new Date(`${yesterday}T23:00`).toISOString();
    const wake = new Date(`${today}T07:00`).toISOString();
    const napStart = new Date(`${yesterday}T15:00`).toISOString();
    const napEnd = new Date(`${yesterday}T15:30`).toISOString();
    flushLoad({
      records: [record({ date: yesterday, bedtime, wake_time: wake, duration_min: 480 })],
      naps: [{ id: 1, date: yesterday, start_time: napStart, end_time: napEnd, notes: null, duration_min: 30 }],
    });

    const ribbons = fixture.componentInstance.ribbons();
    expect(ribbons.length).toBe(14);
    expect(ribbons[0].date).toBe(today);
    expect(ribbons[13].date).toBe(from);

    const row = ribbons.find((r) => r.date === yesterday)!;
    expect(row.sleeps.length).toBe(1);
    expect(row.sleeps[0].x).toBeCloseTo(45.83, 1);
    expect(row.sleeps[0].w).toBeCloseTo(33.33, 1);
    expect(row.naps.length).toBe(1);
    expect(row.naps[0].x).toBeCloseTo(12.5, 1);
  });

  it('la cinta muestra todas las noches de una misma fecha (DT-11)', () => {
    const yesterday = addDays(today, -1);
    const iso = (d: string, t: string) => new Date(`${d}T${t}`).toISOString();
    flushLoad({
      records: [
        record({ id: 1, date: yesterday, bedtime: iso(yesterday, '13:00'), wake_time: iso(yesterday, '15:00'), duration_min: 120 }),
        record({ id: 2, date: yesterday, bedtime: iso(yesterday, '23:00'), wake_time: iso(today, '07:00'), duration_min: 480 }),
      ],
    });
    const row = fixture.componentInstance.ribbons().find((r) => r.date === yesterday)!;
    expect(row.sleeps.length).toBe(2);
    const rowEl = Array.from(el.querySelectorAll('.ribbon-row'))[1];
    expect(rowEl.querySelectorAll('.bar.sleep').length).toBe(2);
  });

  it('la cinta es una imagen con descripción en frases y una tabla con las 14 noches (feature 005, FR-011)', () => {
    const yesterday = addDays(today, -1);
    const iso = (d: string, t: string) => new Date(`${d}T${t}`).toISOString();
    flushLoad({
      records: [record({ date: yesterday, bedtime: iso(yesterday, '23:00'), wake_time: iso(today, '07:00'), duration_min: 480 })],
      naps: [{ id: 1, date: yesterday, start_time: iso(yesterday, '15:00'), end_time: iso(yesterday, '15:30'), notes: null, duration_min: 30 }],
    });
    const img = el.querySelector('.ribbons')!;
    expect(img.getAttribute('role')).toBe('img');
    expect(el.querySelector(`#${img.getAttribute('aria-describedby')}`)!.textContent)
      .toContain('1 con sueño registrado, 13 sin dato y 1 siesta');
    const rows = Array.from(el.querySelectorAll('app-chart-table tbody tr'));
    expect(rows.length).toBe(14);
    expect(rows[1].textContent).toContain('8 h');
    expect(rows[0].textContent).toContain('Sin dato');
  });

  it('pide los datos de los últimos 14 días', () => {
    http.expectOne('/api/sleep/open').flush(null);
    const sleep = http.expectOne((r) => r.url === '/api/sleep' && r.method === 'GET');
    expect(sleep.request.params.get('from')).toBe(from);
    expect(sleep.request.params.get('to')).toBe(today);
    sleep.flush([]);
    http.expectOne((r) => r.url === '/api/naps').flush([]);
    http.expectOne((r) => r.url === '/api/stats').flush(EMPTY_STATS);
  });
});

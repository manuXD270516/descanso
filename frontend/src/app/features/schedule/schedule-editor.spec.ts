import { TestBed } from '@angular/core/testing';
import { ScheduleDay } from '../../core/schedule';
import { ScheduleEditorComponent } from './schedule-editor.component';

// Editor del horario (feature 010, US1, FR-001…FR-003).
describe('ScheduleEditorComponent', () => {
  beforeEach(() => TestBed.configureTestingModule({}));

  function create(goal = 450) {
    const f = TestBed.createComponent(ScheduleEditorComponent);
    f.componentRef.setInput('goalMin', goal);
    f.detectChanges();
    let last: ScheduleDay[] | null = null;
    f.componentInstance.changed.subscribe((d) => (last = d));
    return { f, c: f.componentInstance, el: f.nativeElement as HTMLElement, last: () => last };
  }

  it('pregunta la hora de levantarse y propone la de acostarse (7:00 con 7 h 30 → 23:15); "Igual todos los días" por defecto', () => {
    const { f, c, el, last } = create();
    expect(el.textContent).toContain('¿A qué hora quieres levantarte?');
    expect(c.days()).toBeNull();
    c.setWake('week', '07:00');
    f.detectChanges();
    expect(c.week().bed).toBe('23:15');
    expect((el.querySelector('input[name=mode][value=same]') as HTMLInputElement).checked).toBeTrue();
    expect(last()!.length).toBe(7);
    expect(last()!.every((d) => d.bed_min === 1395 && d.wake_min === 420 && d.active)).toBeTrue();
  });

  it('"Distinto el fin de semana": las noches del sábado y del domingo con su propio par', () => {
    const { f, c } = create();
    c.setWake('week', '07:00');
    c.setMode('weekend');
    c.setWake('weekend', '09:00');
    f.detectChanges();
    expect(c.weekend().bed).toBe('01:15');
    const days = c.days()!;
    expect(days.filter((d) => d.wake_min === 540).map((d) => d.weekday)).toEqual([0, 6]);
  });

  it('la hora de acostarse se puede cambiar y las noches se pueden desactivar', () => {
    const { c } = create();
    c.setWake('week', '07:00');
    c.setBed('week', '22:30');
    c.toggle(3);
    const days = c.days()!;
    expect(days[1].bed_min).toBe(1350);
    expect(days[3].active).toBeFalse();
  });

  it('"Cada día distinto" parte de lo que había y abre con lo guardado', () => {
    const { f, c } = create();
    c.setWake('week', '07:00');
    c.setMode('each');
    c.setEach(2, 'wake', '06:00');
    expect(c.days()![2].wake_min).toBe(360);
    expect(c.days()![2].bed_min).toBe(1335);

    const g = TestBed.createComponent(ScheduleEditorComponent);
    g.componentRef.setInput('initial', c.days());
    g.detectChanges();
    expect(g.componentInstance.mode()).toBe('each');
    f.destroy();
  });
});

describe('ScheduleEditorComponent · cambio de objetivo', () => {
  beforeEach(() => TestBed.configureTestingModule({}));

  it('si el objetivo cambia después de escribir la hora de levantarse, la propuesta lo sigue (salvo cambio a mano)', () => {
    const f = TestBed.createComponent(ScheduleEditorComponent);
    f.componentRef.setInput('goalMin', 420);
    f.detectChanges();
    const c = f.componentInstance;
    c.setWake('week', '07:00');
    expect(c.week().bed).toBe('23:45');
    f.componentRef.setInput('goalMin', 450); // p. ej. el atajo "7 h 30" llega un instante después
    f.detectChanges();
    expect(c.week().bed).toBe('23:15');
    c.setBed('week', '22:30');
    f.componentRef.setInput('goalMin', 540);
    f.detectChanges();
    expect(c.week().bed).toBe('22:30', 'lo cambiado a mano se respeta');
  });
});

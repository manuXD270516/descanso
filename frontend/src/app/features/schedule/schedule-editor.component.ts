import { Component, computed, effect, input, output, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  NIGHT_NAMES, NIGHT_ORDER, ScheduleDay, ScheduleMode, daysFor, minToTime, modeOf, proposeBed, timeToMin,
} from '../../core/schedule';

interface Pair { wake: string; bed: string }

/**
 * Editor del horario (feature 010, US1): hora de levantarse → hora de acostarse propuesta (editable),
 * y "Igual todos los días" (por defecto), "Distinto el fin de semana" (noches de sábado y domingo) o
 * "Cada día distinto", con noches activables. Emite los 7 días, o null mientras falte la hora de
 * levantarse. Lo usan la bienvenida y "Mi horario".
 */
@Component({
  selector: 'app-schedule-editor',
  imports: [FormsModule],
  template: `
    <div class="schedule-editor">
      @if (mode() !== 'each') {
        <fieldset class="pair">
          <legend class="small">{{ mode() === 'weekend' ? 'Noches de lunes a viernes' : 'Todas las noches' }}</legend>
          <label class="field"><span>¿A qué hora quieres levantarte?</span>
            <input type="time" name="weekWake" [ngModel]="week().wake" (ngModelChange)="setWake('week', $event)">
          </label>
          <label class="field"><span>Hora de acostarte</span>
            <input type="time" name="weekBed" [ngModel]="week().bed" (ngModelChange)="setBed('week', $event)">
          </label>
        </fieldset>
        @if (mode() === 'weekend') {
          <fieldset class="pair">
            <legend class="small">Noches del sábado y del domingo</legend>
            <label class="field"><span>Levantarte</span>
              <input type="time" name="endWake" [ngModel]="weekend().wake" (ngModelChange)="setWake('weekend', $event)">
            </label>
            <label class="field"><span>Acostarte</span>
              <input type="time" name="endBed" [ngModel]="weekend().bed" (ngModelChange)="setBed('weekend', $event)">
            </label>
          </fieldset>
        }
        <p class="small muted">La hora de acostarte se propone como tu hora de levantarte menos tu objetivo de sueño y 15 min para dormirte. Puedes cambiarla.</p>
      } @else {
        <table class="each">
          <caption class="small muted">Cada noche lleva el nombre del día en que te acuestas.</caption>
          <thead><tr><th scope="col">Noche</th><th scope="col">Levantarte</th><th scope="col">Acostarte</th></tr></thead>
          <tbody>
            @for (w of order; track w) {
              <tr>
                <th scope="row">{{ names[w] }}</th>
                <td><input type="time" [name]="'wake' + w" [attr.aria-label]="'Levantarte tras la noche del ' + names[w]" [ngModel]="each()[w].wake" (ngModelChange)="setEach(w, 'wake', $event)"></td>
                <td><input type="time" [name]="'bed' + w" [attr.aria-label]="'Acostarte la noche del ' + names[w]" [ngModel]="each()[w].bed" (ngModelChange)="setEach(w, 'bed', $event)"></td>
              </tr>
            }
          </tbody>
        </table>
      }

      <div class="modes" role="radiogroup" aria-label="Tipo de horario">
        @for (m of modes; track m.id) {
          <label class="mode"><input type="radio" name="mode" [value]="m.id" [checked]="mode() === m.id" (change)="setMode(m.id)"> {{ m.label }}</label>
        }
      </div>

      <fieldset class="actives">
        <legend class="small">Noches con horario</legend>
        @for (w of order; track w) {
          <label class="day"><input type="checkbox" [name]="'active' + w" [checked]="active()[w]" (change)="toggle(w)"> {{ names[w].slice(0, 3) }}</label>
        }
      </fieldset>
    </div>
  `,
  styles: `
    .schedule-editor { display: grid; gap: 0.8rem; }
    .pair { display: flex; flex-wrap: wrap; gap: 0.8rem; border: 0; padding: 0; margin: 0; }
    .pair legend, .actives legend { margin-bottom: 0.3rem; }
    .modes { display: grid; gap: 0.3rem; }
    .actives { display: flex; flex-wrap: wrap; gap: 0.6rem; border: 0; padding: 0; margin: 0; }
    .each { border-collapse: collapse; }
    .each th, .each td { padding: 0.2rem 0.4rem; text-align: left; }
    .each caption { text-align: left; }
  `,
})
export class ScheduleEditorComponent {
  /** Objetivo de sueño para proponer la hora de acostarse. */
  readonly goalMin = input(420);
  /** Días ya guardados (null = horario nuevo). */
  readonly initial = input<ScheduleDay[] | null>(null);
  readonly changed = output<ScheduleDay[] | null>();

  readonly order = NIGHT_ORDER;
  readonly names = NIGHT_NAMES;
  readonly modes: { id: ScheduleMode; label: string }[] = [
    { id: 'same', label: 'Igual todos los días' },
    { id: 'weekend', label: 'Distinto el fin de semana' },
    { id: 'each', label: 'Cada día distinto' },
  ];

  readonly mode = signal<ScheduleMode>('same');
  readonly week = signal<Pair>({ wake: '', bed: '' });
  readonly weekend = signal<Pair>({ wake: '', bed: '' });
  readonly each = signal<Pair[]>(Array.from({ length: 7 }, () => ({ wake: '', bed: '' })));
  readonly active = signal<boolean[]>([true, true, true, true, true, true, true]);
  /** Horas de acostarse cambiadas a mano: ya no se vuelven a proponer si cambia el objetivo. */
  private readonly edited = { week: false, weekend: false, each: [false, false, false, false, false, false, false] };

  /** Los 7 días, o null si falta alguna hora. */
  readonly days = computed<ScheduleDay[] | null>(() => {
    const act = this.active();
    const toPair = (p: Pair) => {
      const wake = timeToMin(p.wake);
      const bed = timeToMin(p.bed);
      return wake === null || bed === null ? null : { wake_min: wake, bed_min: bed };
    };
    if (this.mode() === 'each') {
      const pairs = this.each().map(toPair);
      if (pairs.some((p) => !p)) return null;
      return pairs.map((p, weekday) => ({ weekday, bed_min: p!.bed_min, wake_min: p!.wake_min, active: act[weekday] }));
    }
    const week = toPair(this.week());
    const weekend = this.mode() === 'weekend' ? toPair(this.weekend()) : week;
    if (!week || !weekend) return null;
    return daysFor(this.mode() as 'same' | 'weekend', week, weekend, act);
  });

  constructor() {
    effect(() => {
      const init = this.initial();
      if (init?.length === 7) untracked(() => this.load(init));
    });
    effect(() => this.changed.emit(this.days()));
    // Si el objetivo cambia (incluso justo después de escribir la hora de levantarse), la propuesta lo sigue
    effect(() => {
      const goal = this.goalMin();
      untracked(() => this.repropose(goal));
    });
  }

  private repropose(goal: number) {
    const propose = (p: Pair, edited: boolean): Pair => {
      const wake = timeToMin(p.wake);
      return wake === null || edited ? p : { wake: p.wake, bed: minToTime(proposeBed(wake, goal)) };
    };
    this.week.update((p) => propose(p, this.edited.week));
    this.weekend.update((p) => propose(p, this.edited.weekend));
    this.each.update((all) => all.map((p, w) => propose(p, this.edited.each[w])));
  }

  private load(days: ScheduleDay[]) {
    const by = (w: number) => days.find((d) => d.weekday === w)!;
    const pair = (d: ScheduleDay): Pair => ({ wake: minToTime(d.wake_min), bed: minToTime(d.bed_min) });
    this.mode.set(modeOf(days));
    this.week.set(pair(by(1)));
    this.weekend.set(pair(by(6)));
    this.each.set([0, 1, 2, 3, 4, 5, 6].map((w) => pair(by(w))));
    this.active.set([0, 1, 2, 3, 4, 5, 6].map((w) => by(w).active));
    // Lo guardado se respeta: no se vuelve a proponer
    this.edited.week = this.edited.weekend = true;
    this.edited.each = this.edited.each.map(() => true);
  }

  /** Al cambiar la hora de levantarse se vuelve a proponer la de acostarse (FR-002). */
  setWake(which: 'week' | 'weekend', value: string) {
    const wake = timeToMin(value);
    const bed = wake === null ? '' : minToTime(proposeBed(wake, this.goalMin()));
    (which === 'week' ? this.week : this.weekend).set({ wake: value, bed });
    this.edited[which] = false;
    if (which === 'week' && !this.weekend().wake) this.weekend.set({ wake: value, bed });
  }

  setBed(which: 'week' | 'weekend', value: string) {
    (which === 'week' ? this.week : this.weekend).update((p) => ({ ...p, bed: value }));
    this.edited[which] = true;
  }

  setEach(weekday: number, field: 'wake' | 'bed', value: string) {
    this.each.update((all) => all.map((p, w) => {
      if (w !== weekday) return p;
      this.edited.each[w] = field === 'bed';
      if (field === 'bed') return { ...p, bed: value };
      const wake = timeToMin(value);
      return { wake: value, bed: wake === null ? p.bed : minToTime(proposeBed(wake, this.goalMin())) };
    }));
  }

  setMode(mode: ScheduleMode) {
    // Al pasar a "cada día", se parte de lo que ya había
    if (mode === 'each' && this.mode() !== 'each') {
      const current = this.days();
      if (current) this.each.set(current.map((d) => ({ wake: minToTime(d.wake_min), bed: minToTime(d.bed_min) })));
    }
    this.mode.set(mode);
  }

  toggle(weekday: number) {
    this.active.update((a) => a.map((v, w) => (w === weekday ? !v : v)));
  }
}

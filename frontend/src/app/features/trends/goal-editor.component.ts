import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { AccountService } from '../../core/account.service';
import { CYCLE_MIN, GOAL_MAX, GOAL_MIN, cyclesFor, fmtGoal } from '../../core/cycles';

/**
 * Editor del objetivo de sueño con sugerencias de ciclos completos (feature 005, US4).
 * Se usa desde Tendencias y desde el perfil; guarda con PUT /api/me.
 */
@Component({
  selector: 'app-goal-editor',
  imports: [FormsModule],
  template: `
    <div class="goal-editor">
      <p class="small">
        Tu objetivo: <strong>{{ fmt(draft()) }}</strong>, unos <strong>{{ equivalent() }}</strong> ciclos de {{ cycleMin() }} min.
      </p>
      <div class="row wrap" role="group" aria-label="Ciclos completos">
        @for (s of shortcuts(); track s.cycles) {
          <button type="button" class="btn btn-sm" [class.btn-moon]="s.minutes === draft()" [attr.aria-pressed]="s.minutes === draft()"
                  (click)="choose(s.minutes)">{{ fmt(s.minutes) }} · {{ s.cycles }} ciclos</button>
        }
      </div>
      <div class="row wrap">
        <label class="field"><span>Horas</span><input type="number" name="goalHours" [ngModel]="hours()" (ngModelChange)="setParts($event, minutes())" min="4" max="12"></label>
        <label class="field"><span>Minutos</span><input type="number" name="goalMinutes" [ngModel]="minutes()" (ngModelChange)="setParts(hours(), $event)" min="0" max="59" step="5"></label>
        <button type="button" class="btn" (click)="save()" [disabled]="busy()">Guardar objetivo</button>
      </div>
      <p class="small faint">Un ciclo dura unos {{ cycleMin() }} minutos, aunque varía entre personas y a lo largo de la noche: tómalo como orientación.</p>
      @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
      @if (saved()) { <p class="small" role="status">Objetivo guardado.</p> }
    </div>
  `,
  styles: `
    .goal-editor { display: grid; gap: 0.6rem; }
    .wrap { flex-wrap: wrap; }
    .field input { width: 5.5rem; }
  `,
})
export class GoalEditorComponent {
  private account = inject(AccountService);

  readonly goalMin = input.required<number>();
  /** Duración del ciclo de la persona (feature 006, FR-010); 90 min por defecto. */
  readonly cycleMin = input(CYCLE_MIN);
  readonly changed = output<number>();

  readonly draft = signal(420);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly saved = signal(false);

  readonly hours = computed(() => Math.floor(this.draft() / 60));
  readonly minutes = computed(() => this.draft() % 60);
  readonly equivalent = computed(() => cyclesFor(this.draft(), this.cycleMin()).equivalent.toLocaleString('es'));
  readonly shortcuts = computed(() => cyclesFor(this.draft(), this.cycleMin()).shortcuts);
  readonly fmt = fmtGoal;

  constructor() {
    effect(() => this.draft.set(this.goalMin()));
  }

  setParts(h: number | string, m: number | string) {
    this.saved.set(false);
    this.draft.set(Number(h || 0) * 60 + Number(m || 0));
  }

  choose(minutes: number) {
    this.draft.set(minutes);
    this.save();
  }

  save() {
    const goal = this.draft();
    this.error.set(null);
    this.saved.set(false);
    if (!Number.isInteger(goal) || goal < GOAL_MIN || goal > GOAL_MAX) {
      this.error.set('El objetivo de sueño debe estar entre 4 y 12 horas');
      return;
    }
    this.busy.set(true);
    this.account.updateProfile({ sleep_goal_min: goal }).subscribe({
      next: () => {
        this.busy.set(false);
        this.saved.set(true);
        this.changed.emit(goal);
      },
      error: (e: HttpErrorResponse) => {
        this.busy.set(false);
        this.error.set(e.error?.error ?? 'No se pudo guardar el objetivo.');
      },
    });
  }
}

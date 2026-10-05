import { Component, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { switchMap, of } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { CYCLE_MIN, cyclesFor, fmtGoal } from '../../core/cycles';
import { ScheduleDay, localDay } from '../../core/schedule';
import { ScheduleService } from '../../core/schedule.service';
import { ScheduleEditorComponent } from '../schedule/schedule-editor.component';

/**
 * Bienvenida (features 005 y 010): una sola vez por usuario y en una sola pantalla. Objetivo de sueño
 * (atajos de ciclos o a mano) → horario opcional (hora de levantarse, la de acostarse propuesta y el
 * tipo de horario) → "Guardar". "Saltar" deja el objetivo en 7 h y sin horario. 011 añadirá la racha.
 */
@Component({
  selector: 'app-welcome',
  imports: [FormsModule, ScheduleEditorComponent],
  template: `
    <section class="panel welcome" aria-labelledby="welcome-title">
      <h2 id="welcome-title">¿Cuántas horas quieres dormir?</h2>
      <p class="muted">Lo usamos para tus tendencias y tu horario. Puedes cambiarlo cuando quieras.</p>
      <div class="row wrap" role="group" aria-label="Ciclos completos">
        @for (s of shortcuts; track s.cycles) {
          <button type="button" class="btn" [class.btn-moon]="goal() === s.minutes" [attr.aria-pressed]="goal() === s.minutes"
                  [disabled]="busy()" (click)="chooseGoal(s.minutes)">{{ fmt(s.minutes) }} · {{ s.cycles }} ciclos</button>
        }
      </div>
      <div class="row wrap">
        <label class="field"><span>Horas</span><input type="number" name="h" [ngModel]="hours()" (ngModelChange)="setParts($event, minutes())" min="4" max="12"></label>
        <label class="field"><span>Minutos</span><input type="number" name="m" [ngModel]="minutes()" (ngModelChange)="setParts(hours(), $event)" min="0" max="59" step="5"></label>
      </div>
      <p class="small faint">Un ciclo de sueño dura unos {{ cycle }} minutos (varía entre personas): despertar al final de uno suele sentar mejor.</p>

      <h3>Tu horario <span class="small muted">(opcional)</span></h3>
      <app-schedule-editor [goalMin]="goal()" (changed)="days.set($event)" />

      @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
      <div class="row wrap">
        <button type="button" class="btn btn-moon" [disabled]="busy()" (click)="finish(goal(), days())">Guardar</button>
        <button type="button" class="btn btn-ghost" [disabled]="busy()" (click)="finish()">Saltar (7 h)</button>
      </div>
    </section>
  `,
  styles: `
    .welcome { max-width: 560px; margin: 1rem auto 0; display: grid; gap: 0.8rem; }
    .wrap { flex-wrap: wrap; }
    .field input { width: 5.5rem; }
    h3 { font-size: 1.05rem; margin-top: 0.4rem; }
  `,
})
export class WelcomeComponent {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private schedule = inject(ScheduleService);

  readonly cycle = CYCLE_MIN;
  readonly shortcuts = cyclesFor(420).shortcuts;
  readonly fmt = fmtGoal;
  readonly goal = signal(420);
  readonly hours = signal(7);
  readonly minutes = signal(0);
  readonly days = signal<ScheduleDay[] | null>(null);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  chooseGoal(minutes: number) {
    this.goal.set(minutes);
    this.hours.set(Math.floor(minutes / 60));
    this.minutes.set(minutes % 60);
  }

  /** Objetivo escrito a mano en horas y minutos. */
  setParts(h: number | string, m: number | string) {
    this.hours.set(Number(h || 0));
    this.minutes.set(Number(m || 0));
    this.goal.set(this.hours() * 60 + this.minutes());
  }

  /**
   * Sin objetivo = "Saltar": queda 7 h por defecto y sin horario. Con horario, se guarda vigente desde
   * hoy (fecha local del navegador).
   */
  finish(goal?: number, days?: ScheduleDay[] | null) {
    if (goal !== undefined && (!Number.isInteger(goal) || goal < 240 || goal > 720)) {
      this.error.set('El objetivo de sueño debe estar entre 4 y 12 horas');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.http
      .post('/api/me/onboarding', goal === undefined ? {} : { sleep_goal_min: goal })
      .pipe(switchMap(() => (days ? this.schedule.save(localDay(new Date()), days) : of(null))))
      .subscribe({
        next: () => this.auth.onboarded.set(true),
        error: (e: HttpErrorResponse) => {
          this.busy.set(false);
          this.error.set(e.error?.error ?? 'No se pudo guardar.');
        },
      });
  }
}

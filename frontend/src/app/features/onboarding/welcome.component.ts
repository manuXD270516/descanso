import { Component, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/auth.service';
import { CYCLE_MIN, cyclesFor, fmtGoal } from '../../core/cycles';

/**
 * Bienvenida (feature 005, US5): una sola vez por usuario. Pregunta cuántas horas quiere dormir, con
 * atajos de ciclos completos; "Saltar" deja el objetivo en 7 h. 010 y 011 ampliarán esta misma pantalla.
 */
@Component({
  selector: 'app-welcome',
  imports: [FormsModule],
  template: `
    <section class="panel welcome" aria-labelledby="welcome-title">
      <h2 id="welcome-title">¿Cuántas horas quieres dormir?</h2>
      <p class="muted">Lo usamos para tus tendencias. Puedes cambiarlo cuando quieras.</p>
      <div class="row wrap" role="group" aria-label="Ciclos completos">
        @for (s of shortcuts; track s.cycles) {
          <button type="button" class="btn" [disabled]="busy()" (click)="finish(s.minutes)">{{ fmt(s.minutes) }} · {{ s.cycles }} ciclos</button>
        }
      </div>
      <div class="row wrap">
        <label class="field"><span>Horas</span><input type="number" name="h" [(ngModel)]="hours" min="4" max="12"></label>
        <label class="field"><span>Minutos</span><input type="number" name="m" [(ngModel)]="minutes" min="0" max="59" step="5"></label>
        <button type="button" class="btn btn-moon" [disabled]="busy()" (click)="saveCustom()">Guardar</button>
      </div>
      <p class="small faint">Un ciclo de sueño dura unos {{ cycle }} minutos (varía entre personas): despertar al final de uno suele sentar mejor.</p>
      @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
      <button type="button" class="btn btn-ghost" [disabled]="busy()" (click)="finish()">Saltar (7 h)</button>
    </section>
  `,
  styles: `
    .welcome { max-width: 520px; margin: 1rem auto 0; display: grid; gap: 0.8rem; }
    .wrap { flex-wrap: wrap; }
    .field input { width: 5.5rem; }
    .welcome > .btn-ghost { justify-self: start; }
  `,
})
export class WelcomeComponent {
  private http = inject(HttpClient);
  private auth = inject(AuthService);

  readonly cycle = CYCLE_MIN;
  readonly shortcuts = cyclesFor(420).shortcuts;
  readonly fmt = fmtGoal;
  hours = 7;
  minutes = 0;
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  /** Objetivo escrito a mano en horas y minutos. */
  saveCustom() {
    this.finish(Number(this.hours) * 60 + Number(this.minutes));
  }

  /** Sin objetivo = "Saltar": queda 7 h por defecto. */
  finish(goal?: number) {
    if (goal !== undefined && (!Number.isInteger(goal) || goal < 240 || goal > 720)) {
      this.error.set('El objetivo de sueño debe estar entre 4 y 12 horas');
      return;
    }
    this.busy.set(true);
    this.http.post('/api/me/onboarding', goal === undefined ? {} : { sleep_goal_min: goal }).subscribe({
      next: () => this.auth.onboarded.set(true),
      error: (e: HttpErrorResponse) => {
        this.busy.set(false);
        this.error.set(e.error?.error ?? 'No se pudo guardar.');
      },
    });
  }
}

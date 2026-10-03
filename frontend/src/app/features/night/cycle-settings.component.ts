import { Component, effect, inject, input, output, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { AccountService } from '../../core/account.service';
import { CYCLE_MIN, LATENCY_MIN } from '../../core/cycles';

/**
 * Ajustes de la calculadora de ciclos (feature 006, US2, FR-009): duración del ciclo (70–110 min) y
 * tiempo en dormirse (0–60 min). Se usa desde la calculadora de Noche y desde el perfil.
 * El servidor valida los rangos; aquí solo se muestra su mensaje.
 */
@Component({
  selector: 'app-cycle-settings',
  imports: [FormsModule],
  template: `
    <div class="cycle-settings">
      <div class="row wrap">
        <label class="field"><span>Duración del ciclo (min)</span>
          <input type="number" name="cycleMin" [(ngModel)]="cycle" min="70" max="110" step="5">
        </label>
        <label class="field"><span>Tiempo en dormirte (min)</span>
          <input type="number" name="latencyMin" [(ngModel)]="latency" min="0" max="60" step="5">
        </label>
        <button type="button" class="btn btn-sm" (click)="save()" [disabled]="busy()">Guardar ajustes</button>
      </div>
      @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
      @if (saved()) { <p class="small" role="status">Ajustes guardados.</p> }
    </div>
  `,
  styles: `
    .cycle-settings { display: grid; gap: 0.5rem; }
    .wrap { flex-wrap: wrap; align-items: end; }
    .field input { width: 6rem; }
  `,
})
export class CycleSettingsComponent {
  private account = inject(AccountService);

  readonly cycleMin = input(CYCLE_MIN);
  readonly latencyMin = input(LATENCY_MIN);
  readonly changed = output<{ cycleMin: number; latencyMin: number }>();

  cycle = CYCLE_MIN;
  latency = LATENCY_MIN;
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly saved = signal(false);

  constructor() {
    effect(() => {
      this.cycle = this.cycleMin();
      this.latency = this.latencyMin();
    });
  }

  save() {
    this.error.set(null);
    this.saved.set(false);
    this.busy.set(true);
    const body = { cycle_min: Number(this.cycle), latency_min: Number(this.latency) };
    this.account.updateProfile(body).subscribe({
      next: (p) => {
        this.busy.set(false);
        this.saved.set(true);
        this.changed.emit({ cycleMin: p.cycle_min, latencyMin: p.latency_min });
      },
      error: (e: HttpErrorResponse) => {
        this.busy.set(false);
        this.error.set(e.error?.error ?? 'No se pudieron guardar los ajustes.');
      },
    });
  }
}

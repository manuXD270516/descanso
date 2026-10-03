import { Component, inject, input, output, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ApiService, AwakeningsBucket, SleepRecord, SolBucket } from '../../core/api.service';

export const SOL_OPTIONS: { value: SolBucket; label: string }[] = [
  { value: 'lt15', label: '<15 min' },
  { value: '15_30', label: '15–30 min' },
  { value: 'gt30', label: '>30 min' },
];
export const AWAKENINGS_OPTIONS: { value: AwakeningsBucket; label: string }[] = [
  { value: '0', label: '0' },
  { value: '1_2', label: '1–2' },
  { value: '3plus', label: '3+' },
];

/**
 * Tarjeta opcional "¿Cómo fue la noche?" (feature 006, US5): aparece después de cerrar la noche,
 * nunca antes, así cerrar sigue siendo 1 toque. Cada toque guarda; tocar lo elegido lo borra.
 */
@Component({
  selector: 'app-night-card',
  template: `
    <section class="panel night-card" aria-labelledby="card-title">
      <div class="row between">
        <h2 id="card-title">¿Cómo fue la noche?</h2>
        <button type="button" class="btn btn-ghost btn-sm" (click)="closed.emit()">Cerrar</button>
      </div>
      <p class="small muted">Opcional. Lo que anotes se guarda en esta noche.</p>
      <div class="question" role="group" aria-label="Cuánto tardé en dormirme">
        <span class="small">Cuánto tardé en dormirme</span>
        <div class="row wrap">
          @for (o of solOptions; track o.value) {
            <button type="button" class="btn btn-sm chip" [class.btn-moon]="sol() === o.value" [attr.aria-pressed]="sol() === o.value"
                    [disabled]="busy()" (click)="pick('sol_bucket', o.value)">{{ o.label }}</button>
          }
        </div>
      </div>
      <div class="question" role="group" aria-label="Cuántas veces desperté">
        <span class="small">Cuántas veces desperté</span>
        <div class="row wrap">
          @for (o of awakeningsOptions; track o.value) {
            <button type="button" class="btn btn-sm chip" [class.btn-moon]="awakenings() === o.value" [attr.aria-pressed]="awakenings() === o.value"
                    [disabled]="busy()" (click)="pick('awakenings_bucket', o.value)">{{ o.label }}</button>
          }
        </div>
      </div>
      @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
    </section>
  `,
  styles: `
    .night-card { display: grid; gap: 0.6rem; }
    .question { display: grid; gap: 0.3rem; }
    .wrap { flex-wrap: wrap; }
  `,
})
export class NightCardComponent {
  private api = inject(ApiService);

  readonly night = input.required<SleepRecord>();
  readonly closed = output<void>();
  readonly answered = output<SleepRecord>();

  readonly solOptions = SOL_OPTIONS;
  readonly awakeningsOptions = AWAKENINGS_OPTIONS;
  readonly sol = signal<SolBucket | null>(null);
  readonly awakenings = signal<AwakeningsBucket | null>(null);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  pick(key: 'sol_bucket' | 'awakenings_bucket', value: string) {
    const current = key === 'sol_bucket' ? this.sol() : this.awakenings();
    const next = current === value ? null : value;
    this.busy.set(true);
    this.error.set(null);
    this.api.updateSleep(this.night().id, { [key]: next } as Partial<SleepRecord>).subscribe({
      next: (r) => {
        this.busy.set(false);
        this.sol.set(r.sol_bucket ?? null);
        this.awakenings.set(r.awakenings_bucket ?? null);
        this.answered.emit(r);
      },
      error: (e: HttpErrorResponse) => {
        this.busy.set(false);
        this.error.set(e.error?.error ?? 'No se pudo guardar.');
      },
    });
  }
}

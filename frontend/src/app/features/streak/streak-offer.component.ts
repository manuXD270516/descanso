import { Component, inject, output, signal } from '@angular/core';
import { StreakService } from '../../core/streak.service';

/**
 * Oferta de la racha (feature 011, US3, FR-017): una sola vez, con un ejemplo, qué se premia y por
 * qué. Activarla o rechazarla cuesta un toque (SC-007); la respuesta se guarda y no vuelve a salir.
 */
@Component({
  selector: 'app-streak-offer',
  template: `
    <section class="panel streak-offer" aria-labelledby="streak-offer-title">
      <h3 id="streak-offer-title">¿Quieres llevar una racha de constancia?</h3>
      <p class="small">Por ejemplo: «Día 12 de constancia ★». Cuenta un día si te acuestas y te levantas a tu hora
        (con un margen), o si registras la noche cuando no tienes horario.</p>
      <p class="small muted">Mantener horarios regulares ayuda a fijar el hábito. Nunca puntúa cuántas horas dormiste
        ni cómo dormiste, y puedes desactivarla cuando quieras en Mi horario.</p>
      @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
      <div class="row wrap">
        <button type="button" class="btn btn-moon" [disabled]="busy()" (click)="answer(true)">Sí, activarla</button>
        <button type="button" class="btn btn-ghost" [disabled]="busy()" (click)="answer(false)">Ahora no</button>
      </div>
    </section>
  `,
  styles: `
    .streak-offer { display: grid; gap: 0.5rem; }
    h3 { margin: 0; font-size: 1.05rem; }
    .wrap { flex-wrap: wrap; }
  `,
})
export class StreakOfferComponent {
  private streak = inject(StreakService);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  /** true = activada; false = "Ahora no". */
  readonly answered = output<boolean>();

  answer(enabled: boolean) {
    this.busy.set(true);
    this.streak.saveSettings(enabled ? { enabled: true } : { offered: true }).subscribe({
      next: () => { this.busy.set(false); this.answered.emit(enabled); },
      error: () => { this.busy.set(false); this.error.set('No se pudo guardar. Inténtalo de nuevo.'); },
    });
  }
}

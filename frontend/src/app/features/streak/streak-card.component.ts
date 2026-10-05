import { Component, input, output } from '@angular/core';

/**
 * Tarjeta descartable de la racha (feature 011, FR-015): logro nuevo, resumen semanal o nuevo
 * comienzo. Se anuncia con role="status"; un brillo de 400 ms como máximo y ninguno con
 * prefers-reduced-motion.
 */
@Component({
  selector: 'app-streak-card',
  template: `
    <section class="streak-card" role="status" [class.glow]="glow()" [attr.aria-label]="title()">
      <div class="head">
        <h3>{{ title() }}</h3>
        <button type="button" class="btn btn-ghost btn-sm close" (click)="dismissed.emit()">Cerrar</button>
      </div>
      <ng-content />
    </section>
  `,
  styles: `
    .streak-card {
      border: 1px solid var(--line);
      border-radius: 14px;
      background: var(--night-2);
      padding: 0.8rem 1rem;
      display: grid;
      gap: 0.4rem;
    }
    .head { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; }
    h3 { margin: 0; font-size: 1rem; }
    .close:focus-visible { outline: 2px solid var(--dawn); outline-offset: 2px; }
    .glow { animation: glow 400ms ease-out 1; }
    @keyframes glow {
      from { box-shadow: 0 0 0 0 color-mix(in srgb, var(--moon) 55%, transparent); }
      to { box-shadow: 0 0 0 12px transparent; }
    }
    @media (prefers-reduced-motion: reduce) {
      .glow { animation: none; }
    }
  `,
})
export class StreakCardComponent {
  readonly title = input.required<string>();
  /** Brillo breve al aparecer (solo para logros). */
  readonly glow = input(false);
  readonly dismissed = output<void>();
}

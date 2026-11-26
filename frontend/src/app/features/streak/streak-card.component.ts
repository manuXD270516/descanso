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
  styles: `@layer components {
    .streak-card {
      border: 1px solid var(--line);
      border-radius: var(--radius);
      background: var(--surface-raised);
      padding: 0.8rem 1rem;
      display: grid;
      gap: 0.4rem;
    }
    .head { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; }
    h3 { margin: 0; font-size: 1rem; }
    @media (prefers-reduced-motion: no-preference) {
      .glow { animation: glow var(--dur-base) var(--ease-out) 1; }
      @keyframes glow {
        from { box-shadow: 0 0 0 0 color-mix(in oklab, var(--accent) 55%, transparent); }
        to { box-shadow: 0 0 0 0.75rem transparent; }
      }
    }
  }`,
})
export class StreakCardComponent {
  readonly title = input.required<string>();
  /** Brillo breve al aparecer (solo para logros). */
  readonly glow = input(false);
  readonly dismissed = output<void>();
}

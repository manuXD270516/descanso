import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Streak, morningText } from '../../core/streak';
import { StreakService } from '../../core/streak.service';
import { localDate } from '../../core/time';
import { StreakCardsComponent } from './streak-cards.component';
import { StreakOfferComponent } from './streak-offer.component';

/**
 * La racha tras "Ya desperté" (feature 011, FR-019): la línea "Día N de constancia ★" (o un texto
 * neutro) y la tarjeta que toque. Solo se monta en el estado de noche recién cerrada: nunca en la
 * pantalla de acostarse (SC-003). Con la racha desactivada no muestra nada, salvo la oferta.
 */
@Component({
  selector: 'app-streak-morning',
  imports: [StreakCardsComponent, StreakOfferComponent],
  template: `
    @if (streak(); as s) {
      @if (s.enabled) {
        <section class="streak-morning" aria-label="Constancia">
          <p class="line" role="status">{{ line() }}</p>
          <app-streak-cards [streak]="s" (changed)="load()" />
        </section>
      } @else if (s.offer) {
        <app-streak-offer (answered)="load()" />
      }
    }
  `,
  styles: `
    .streak-morning { display: grid; gap: 0.6rem; margin-bottom: 1rem; }
    .line { margin: 0; font-weight: 600; }
  `,
})
export class StreakMorningComponent implements OnInit {
  private service = inject(StreakService);
  readonly streak = signal<Streak | null>(null);
  readonly line = computed(() => (this.streak() ? morningText(this.streak()!, localDate()) : ''));

  ngOnInit() {
    this.load();
  }

  load() {
    this.service.get().subscribe({ next: (s) => this.streak.set(s), error: () => this.streak.set(null) });
  }
}

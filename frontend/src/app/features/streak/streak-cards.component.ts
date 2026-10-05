import { Component, computed, inject, input, output } from '@angular/core';
import { MEAN_66_TEXT, Streak, achievementFact, achievementTitle, summaryText } from '../../core/streak';
import { StreakService } from '../../core/streak.service';
import { OriginBadgeComponent } from '../../shared/origin/origin-badge.component';
import { StreakCardComponent } from './streak-card.component';

/**
 * Tarjetas que tocan tras "Ya desperté" y en Tendencias (feature 011): un logro sin ver (una sola
 * vez, FR-015) y el resumen de la semana anterior (FR-025). Descartarlas se guarda en el servidor.
 */
@Component({
  selector: 'app-streak-cards',
  imports: [StreakCardComponent, OriginBadgeComponent],
  template: `
    @if (unseen(); as a) {
      <app-streak-card [title]="achievementTitle(a.key)" [glow]="true" (dismissed)="seen(a.key)">
        <p>{{ achievementFact(a) }}.</p>
        @if (a.key === 66) { <p class="small muted">{{ mean66 }}</p> }
      </app-streak-card>
    }
    @if (streak().summary; as s) {
      <app-streak-card title="Resumen de la semana" (dismissed)="dismissSummary()">
        <p>{{ summaryText(s) }} @if (s.avg_min !== null) { <app-origin-badge origin="manual" /> }</p>
      </app-streak-card>
    }
  `,
  styles: `:host { display: grid; gap: 0.6rem; } p { margin: 0; }`,
})
export class StreakCardsComponent {
  private service = inject(StreakService);
  readonly streak = input.required<Streak>();
  /** Algo cambió en el servidor: el padre vuelve a pedir la racha. */
  readonly changed = output<void>();

  readonly unseen = computed(() => this.streak().achievements?.find((a) => !a.seen) ?? null);
  readonly achievementTitle = achievementTitle;
  readonly achievementFact = achievementFact;
  readonly summaryText = summaryText;
  readonly mean66 = MEAN_66_TEXT;

  seen(key: number) {
    this.service.markSeen(key).subscribe({ next: () => this.changed.emit() });
  }

  dismissSummary() {
    this.service.saveSettings({ dismiss_summary: true }).subscribe({ next: () => this.changed.emit() });
  }
}

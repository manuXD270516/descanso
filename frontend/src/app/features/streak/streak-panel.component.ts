import { Component, OnInit, inject, signal } from '@angular/core';
import {
  MEAN_66_TEXT, Streak, StreakDay, TOLERANCE_TEXT, achievementFact, achievementTitle, bestText, dayLine, freshStartText, starLabel, totalText,
} from '../../core/streak';
import { StreakService } from '../../core/streak.service';
import { fmtDateShort, localDate } from '../../core/time';
import { OriginBadgeComponent } from '../../shared/origin/origin-badge.component';
import { StreakCardsComponent } from './streak-cards.component';
import { StreakOfferComponent } from './streak-offer.component';

const STAR: Record<StreakDay['state'], string> = { met: '★', missed: '☆', paused: '‖', pending: '·', off: '' };

/**
 * Plegable "Constancia" de Tendencias (feature 011, FR-012, FR-019): semana de estrellas, récord,
 * total, tolerancia y colección, fuera de los 3 indicadores de 005. Desactivada: nada, salvo la oferta.
 * Los días no cumplidos se ven apagados y con su motivo, nunca en rojo (FR-021).
 */
@Component({
  selector: 'app-streak-panel',
  imports: [OriginBadgeComponent, StreakCardsComponent, StreakOfferComponent],
  template: `
    @if (streak(); as s) {
      @if (s.enabled) {
        <details class="panel streak-panel" open>
          <summary><h2>Constancia</h2></summary>
          <app-streak-cards [streak]="s" (changed)="load()" />
          @if (s.cut) { <p role="status">{{ freshStart(s) }}</p> } @else { <p class="day">{{ dayLine(s.current ?? 0) }}</p> }
          <p class="small">{{ bestText(s.best ?? 0) }} · {{ totalText(s.total ?? 0) }}</p>
          <ul class="week" aria-label="Esta semana">
            @for (d of s.week ?? []; track d.date) {
              <li class="star" [class]="'star ' + d.state" [attr.aria-label]="starLabel(d)" [title]="starLabel(d)">
                <span aria-hidden="true" class="glyph">{{ star[d.state] }}</span>
                <span aria-hidden="true" class="wd">{{ weekday(d.date) }}</span>
                @if (d.late_logged) { <app-origin-badge origin="late" /> }
              </li>
            }
          </ul>
          <p class="small muted">{{ tolerance }}. Los días en pausa no cuentan.</p>
          <h3>Tus constelaciones</h3>
          @if (s.achievements?.length) {
            <ul class="collection">
              @for (a of s.achievements; track a.key) {
                <li>
                  <strong>{{ achievementTitle(a.key) }}</strong> · {{ fmtDateShort(a.achieved_on) }}
                  <span class="small muted">· {{ achievementFact(a) }}</span>
                  @if (a.key === 66) { <span class="small muted"> {{ mean66 }}</span> }
                </li>
              }
            </ul>
          } @else {
            <p class="small muted">La primera llega con 7 días de constancia.</p>
          }
        </details>
      } @else if (s.offer) {
        <app-streak-offer (answered)="load()" />
      }
    }
  `,
  styles: `
    .streak-panel { display: grid; gap: 0.6rem; }
    .day { font-size: 1.15rem; font-weight: 700; margin: 0; }
    .week { list-style: none; display: flex; gap: 0.4rem; padding: 0; margin: 0; flex-wrap: wrap; }
    .star { display: grid; justify-items: center; gap: 0.15rem; min-width: 2.6rem; padding: 0.3rem; border-radius: 10px; border: 1px solid var(--line); }
    .glyph { font-size: 1.3rem; line-height: 1; }
    .wd { font-size: 0.72rem; color: var(--ink-dim); }
    .star.met .glyph { color: var(--dawn); }
    .star.missed .glyph, .star.pending .glyph, .star.paused .glyph { color: var(--ink-dim); }
    .star.paused { border-style: dashed; }
    .star.off { opacity: 0.4; }
    .collection { padding-left: 1.1rem; margin: 0; display: grid; gap: 0.3rem; }
    h3 { font-size: 1rem; margin: 0.4rem 0 0; }
  `,
})
export class StreakPanelComponent implements OnInit {
  private service = inject(StreakService);
  readonly streak = signal<Streak | null>(null);

  readonly star = STAR;
  readonly tolerance = TOLERANCE_TEXT;
  readonly mean66 = MEAN_66_TEXT;
  readonly dayLine = dayLine;
  readonly bestText = bestText;
  readonly totalText = totalText;
  readonly starLabel = starLabel;
  readonly achievementTitle = achievementTitle;
  readonly achievementFact = achievementFact;
  readonly fmtDateShort = fmtDateShort;

  ngOnInit() {
    this.load();
  }

  load() {
    this.service.get().subscribe({ next: (s) => this.streak.set(s), error: () => this.streak.set(null) });
  }

  freshStart(s: Streak) {
    return freshStartText(s.best ?? 0, localDate());
  }

  weekday(date: string) {
    const [y, m, d] = date.split('-').map(Number);
    return ['D', 'L', 'M', 'X', 'J', 'V', 'S'][new Date(y, m - 1, d).getDay()];
  }
}

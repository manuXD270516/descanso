import { Component, computed, input, output } from '@angular/core';
import { fmtWindow, wakeWindows } from '../../core/cycles';
import { OriginBadgeComponent } from '../../shared/origin/origin-badge.component';
import { CycleSettingsComponent } from './cycle-settings.component';

/**
 * Calculadora de ciclos (feature 006, US2): ventanas para despertar tras 4, 5 o 6 ciclos desde una
 * hora de dormir. Es una estimación: no se guarda (FR-004) y lo dice siempre (FR-008).
 */
@Component({
  selector: 'app-cycle-calculator',
  imports: [OriginBadgeComponent, CycleSettingsComponent],
  template: `
    <div class="calculator" aria-labelledby="calc-title">
      <div class="row between">
        <p id="calc-title" class="small calc-title">Para despertar al final de un ciclo</p>
        <app-origin-badge origin="estimated" />
      </div>
      @if (windows(); as ws) {
        <ul class="windows">
          @for (w of ws; track w.cycles) {
            <li><span class="cycles">{{ w.cycles }} ciclos</span><span class="tabular">{{ ' ' + w.range }}</span>@if (w.tomorrow) { <span class="muted small"> (mañana)</span> }</li>
          }
        </ul>
      }
      <p class="small faint">Estimación, no medición; no está demostrado que despertar al final de un ciclo mejore cómo te sientes.</p>
      <details class="adjust">
        <summary class="small">Ajustar (ciclo de {{ cycleMin() }} min, {{ latencyMin() }} min para dormirte)</summary>
        <app-cycle-settings [cycleMin]="cycleMin()" [latencyMin]="latencyMin()" (changed)="settingsChanged.emit($event)" />
      </details>
    </div>
  `,
  styles: `
    .calculator { display: grid; gap: 0.4rem; margin-top: 0.8rem; padding-top: 0.8rem; border-top: 1px solid var(--line); }
    .calc-title { font-weight: 600; margin: 0; }
    .windows { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.2rem; }
    .cycles { display: inline-block; min-width: 5.2rem; color: var(--ink-dim); }
    .adjust summary { cursor: pointer; color: var(--ink-dim); }
    .adjust app-cycle-settings { display: block; margin-top: 0.5rem; }
  `,
})
export class CycleCalculatorComponent {
  /** Hora de dormir (ISO con offset); null o inválida = sin ventanas. */
  readonly bedtime = input<string | null>(null);
  readonly cycleMin = input(90);
  readonly latencyMin = input(15);
  readonly settingsChanged = output<{ cycleMin: number; latencyMin: number }>();

  readonly windows = computed(() => {
    const iso = this.bedtime();
    const bed = iso ? new Date(iso) : null;
    if (!bed || Number.isNaN(bed.getTime())) return null;
    return wakeWindows(bed, { cycleMin: this.cycleMin(), latencyMin: this.latencyMin() }).map((w) => ({
      cycles: w.cycles,
      ...fmtWindow(w, bed),
    }));
  });
}

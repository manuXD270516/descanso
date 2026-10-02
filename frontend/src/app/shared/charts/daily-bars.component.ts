import { Component, computed, input } from '@angular/core';
import { DashboardDay } from '../../core/dashboard.service';
import { fmtDateShort, fmtDuration } from '../../core/time';
import { ChartTableComponent, TableColumn } from './chart-table.component';

let nextId = 0;

const H = 140; // alto del área de barras (unidades del viewBox)
const BAR = 10;
const GAP = 4;

/**
 * Barras de sueño por día con la banda del objetivo (feature 005, US1, US6). SVG propio (principio I).
 * Sin rojo ni verde: con dato → luna; "en curso" → rayado; "sin dato" → trazo discontinuo bajo.
 */
@Component({
  selector: 'app-daily-bars',
  imports: [ChartTableComponent],
  template: `
    <figure class="daily-bars">
      <svg role="img" [attr.viewBox]="'0 0 ' + width() + ' ' + (H + 4)" preserveAspectRatio="none"
           [attr.aria-labelledby]="ids.title" [attr.aria-describedby]="ids.desc">
        <title [id]="ids.title">{{ title() }}</title>
        <desc [id]="ids.desc">{{ description() }}</desc>
        <defs>
          <pattern [id]="ids.hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="2" height="4" class="hatch" />
          </pattern>
        </defs>
        <rect class="goal-band" x="0" [attr.y]="y(goalMin() + 15)" [attr.width]="width()" [attr.height]="y(goalMin() - 15) - y(goalMin() + 15)" />
        <line class="goal-line" x1="0" [attr.x2]="width()" [attr.y1]="y(goalMin())" [attr.y2]="y(goalMin())" />
        @for (b of bars(); track b.date) {
          @switch (b.status) {
            @case ('data') { <rect class="bar" [attr.x]="b.x" [attr.y]="y(b.min)" [attr.width]="BAR" [attr.height]="H - y(b.min)" rx="2" /> }
            @case ('in_progress') { <rect class="bar-progress" [attr.x]="b.x" [attr.y]="H - 24" [attr.width]="BAR" height="24" [attr.fill]="'url(#' + ids.hatch + ')'" /> }
            @default { <line class="bar-none" [attr.x1]="b.x" [attr.x2]="b.x + BAR" [attr.y1]="H - 1" [attr.y2]="H - 1" /> }
          }
        }
      </svg>
      <figcaption class="small muted">
        <span class="key key-goal"></span> Tu objetivo · <span class="key key-progress"></span> En curso · <span class="key key-none"></span> Sin dato
      </figcaption>
      <app-chart-table [caption]="title()" [columns]="columns" [rows]="tableRows()" />
    </figure>
  `,
  styles: `
    .daily-bars { margin: 0; display: grid; gap: 0.4rem; }
    svg { width: 100%; height: 160px; display: block; }
    .bar { fill: var(--moon); }
    .hatch { fill: var(--dawn); }
    .bar-progress { stroke: var(--dawn); stroke-width: 0.5; }
    .bar-none { stroke: var(--ink-faint); stroke-width: 1.5; stroke-dasharray: 2 2; }
    .goal-band { fill: var(--moon); opacity: 0.15; }
    .goal-line { stroke: var(--moon); stroke-width: 0.8; stroke-dasharray: 3 3; }
    .key { display: inline-block; width: 0.8rem; height: 0.5rem; margin-right: 0.15rem; border-radius: 2px; vertical-align: middle; }
    .key-goal { background: color-mix(in srgb, var(--moon) 30%, transparent); }
    .key-progress { background: repeating-linear-gradient(45deg, var(--dawn) 0 2px, transparent 2px 4px); }
    .key-none { border-bottom: 2px dashed var(--ink-faint); height: 0; }
  `,
})
export class DailyBarsComponent {
  readonly days = input.required<DashboardDay[]>();
  readonly goalMin = input.required<number>();
  readonly title = input('Horas dormidas por día');

  readonly H = H;
  readonly BAR = BAR;
  readonly ids = { title: `bars-t-${++nextId}`, desc: `bars-d-${nextId}`, hatch: `bars-h-${nextId}` };

  /** Escala: al menos 12 h, o el máximo si es mayor (las noches muy largas no se salen). */
  private readonly maxMin = computed(() => Math.max(720, this.goalMin() + 60, ...this.days().map((d) => d.total_min ?? 0)));
  readonly width = computed(() => this.days().length * (BAR + GAP));
  readonly bars = computed(() => this.days().map((d, i) => ({ date: d.date, status: d.status, min: d.total_min ?? 0, x: i * (BAR + GAP) + GAP / 2 })));

  y(min: number): number {
    return H - (Math.max(0, min) / this.maxMin()) * H;
  }

  readonly description = computed(() => {
    const days = this.days();
    const withData = days.filter((d) => d.status === 'data');
    const met = withData.filter((d) => (d.total_min ?? 0) >= this.goalMin()).length;
    const none = days.filter((d) => d.status === 'none').length;
    const progress = days.filter((d) => d.status === 'in_progress').length;
    return `${days.length} días. ${withData.length} con dato, de los que ${met} llegan a tu objetivo de ${fmtDuration(this.goalMin())}. ` +
      `${none} sin dato${progress ? ` y ${progress} en curso` : ''}.`;
  });

  readonly columns: TableColumn[] = [
    { key: 'date', label: 'Día' },
    { key: 'night', label: 'Noche' },
    { key: 'naps', label: 'Siestas' },
    { key: 'total', label: 'Total' },
  ];

  readonly tableRows = computed(() =>
    this.days().map((d) => ({
      date: fmtDateShort(d.date),
      night: d.status === 'in_progress' ? 'En curso' : d.night_min === null ? '—' : fmtDuration(d.night_min),
      naps: d.nap_min === null ? '—' : fmtDuration(d.nap_min),
      total: d.status === 'none' ? 'Sin dato' : d.status === 'in_progress' ? 'En curso' : fmtDuration(d.total_min),
    })),
  );
}

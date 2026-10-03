import { Component, input } from '@angular/core';

export interface TableColumn {
  key: string;
  label: string;
}

/** Tabla alternativa de un gráfico (feature 005, FR-011): los mismos datos, accesibles a lector de pantalla. */
@Component({
  selector: 'app-chart-table',
  template: `
    <details class="chart-table">
      <summary>Ver como tabla</summary>
      <table>
        <caption>{{ caption() }}</caption>
        <thead>
          <tr>
            @for (c of columns(); track c.key) { <th scope="col">{{ c.label }}</th> }
          </tr>
        </thead>
        <tbody>
          @for (row of rows(); track $index) {
            <tr>
              @for (c of columns(); track c.key) { <td>{{ row[c.key] }}</td> }
            </tr>
          }
        </tbody>
      </table>
    </details>
  `,
  styles: `
    .chart-table { font-size: 0.875rem; }
    .chart-table summary { cursor: pointer; color: var(--ink-dim); }
    table { width: 100%; border-collapse: collapse; margin-top: 0.5rem; }
    caption { text-align: left; color: var(--ink-dim); padding-bottom: 0.3rem; }
    th, td { text-align: left; padding: 0.25rem 0.4rem; border-bottom: 1px solid var(--line); }
    th { color: var(--ink-dim); font-weight: 600; }
  `,
})
export class ChartTableComponent {
  readonly caption = input.required<string>();
  readonly columns = input.required<TableColumn[]>();
  readonly rows = input.required<Record<string, string>[]>();
}

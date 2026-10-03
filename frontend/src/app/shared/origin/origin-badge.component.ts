import { Component, computed, input } from '@angular/core';

/**
 * Origen de un dato de sueño (feature 006, US1, principio VIII): lo anotó la persona, es una
 * estimación de la app o viene de un reloj (feature 007).
 */
export type Origin = 'manual' | 'estimated' | 'device';

export const ORIGIN_LABEL: Record<Origin, string> = {
  manual: 'Anotado por ti',
  estimated: 'Estimado',
  device: 'Del reloj',
};

/**
 * Origen común de un bloque, o null si mezcla orígenes (entonces cada fila lleva el suyo) o está
 * vacío (aclaración del 2026-10-03).
 */
export function blockOrigin(items: readonly { origin: Origin }[]): Origin | null {
  if (!items.length) return null;
  const first = items[0].origin;
  return items.every((i) => i.origin === first) ? first : null;
}

@Component({
  selector: 'app-origin-badge',
  template: `<span class="origin-badge" [class.estimated]="origin() === 'estimated'">{{ label() }}</span>`,
  styles: `
    .origin-badge {
      display: inline-block;
      font-size: 0.72rem;
      font-weight: 600;
      color: var(--ink-dim);
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 0.1rem 0.5rem;
      white-space: nowrap;
    }
    .origin-badge.estimated { border-style: dashed; }
  `,
})
export class OriginBadgeComponent {
  readonly origin = input.required<Origin>();
  readonly label = computed(() => ORIGIN_LABEL[this.origin()]);
}

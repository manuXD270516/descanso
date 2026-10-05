import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Dashboard, DashboardService } from '../../core/dashboard.service';
import { fmtDuration, fmtMinutesOfDay, localDate } from '../../core/time';
import { WATCH_IMPORT_AVAILABLE } from '../../core/features';
import { DailyBarsComponent } from '../../shared/charts/daily-bars.component';
import { OriginBadgeComponent } from '../../shared/origin/origin-badge.component';
import { GoalEditorComponent } from './goal-editor.component';
import { StreakPanelComponent } from '../streak/streak-panel.component';

type Period = 7 | 30 | 90;

/**
 * Tendencias (feature 005): 3 indicadores arriba, gráfico del periodo con el objetivo y regularidad
 * plegable. Todo en palabras, sin siglas, sin rojo ni verde y sin puntuaciones.
 */
@Component({
  selector: 'app-trends',
  imports: [DailyBarsComponent, GoalEditorComponent, OriginBadgeComponent, StreakPanelComponent],
  templateUrl: './trends.component.html',
  styleUrl: './trends.component.css',
})
export class TrendsComponent implements OnInit {
  private service = inject(DashboardService);

  readonly periods: Period[] = [7, 30, 90];
  readonly period = signal<Period>(30);
  readonly data = signal<Dashboard | null>(null);
  readonly error = signal<string | null>(null);
  readonly editing = signal(false);
  /** ¿Existe la importación de relojes? (feature 006, US3; la activa 007) */
  readonly watchImport = input(WATCH_IMPORT_AVAILABLE);

  readonly fmtDuration = fmtDuration;
  readonly fmtMinutesOfDay = fmtMinutesOfDay;

  ngOnInit() {
    this.load();
  }

  select(p: Period) {
    this.period.set(p);
    this.load();
  }

  load() {
    this.error.set(null);
    this.service.get(this.period(), localDate()).subscribe({
      next: (d) => this.data.set(d),
      error: (e: HttpErrorResponse) => this.error.set(e.error?.error ?? 'No se pudieron cargar tus tendencias.'),
    });
  }

  /** "Te faltan …" / "No tienes sueño pendiente…" / "Aún no hay datos…" (FR-004). */
  readonly pendingText = computed(() => {
    const p = this.data()?.pending14;
    if (!p || p.net_min === null) return 'Aún no hay datos en los últimos 14 días';
    const days = `(${p.days} ${p.days === 1 ? 'día registrado' : 'días registrados'})`;
    if (p.net_min > 0) return `Te faltan ${fmtDuration(p.net_min)} en los últimos 14 días ${days}`;
    if (p.net_min < 0) return `No tienes sueño pendiente: llevas ${fmtDuration(-p.net_min)} de más en los últimos 14 días ${days}`;
    return `No tienes sueño pendiente en los últimos 14 días ${days}`;
  });

  readonly title = computed(() => `Horas dormidas en los últimos ${this.period()} días`);
}

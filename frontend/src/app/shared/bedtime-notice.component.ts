import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { ApiService } from '../core/api.service';
import { ScheduleState, ScheduleService } from '../core/schedule.service';
import { isAround, localDay, prepareInstant } from '../core/schedule';

const CHECK_MS = 30_000;

/**
 * Aviso con la app abierta (feature 010, US5, FR-018): a la hora de acostarse − aviso (±1 min) muestra
 * "En X min es tu hora de dormir". Silencioso (role="status", sin sonido), sin animación si se pide
 * movimiento reducido. No sale en pausa, en una noche sin horario ni con la noche ya abierta; se cierra
 * y no vuelve ese día. El servidor no programa nada (SC-008).
 */
@Component({
  selector: 'app-bedtime-notice',
  template: `
    @if (visible()) {
      <div class="bedtime-notice" role="status">
        <span>En {{ lead() }} min es tu hora de dormir.</span>
        <button type="button" class="btn btn-ghost btn-sm" (click)="dismiss()">Cerrar</button>
      </div>
    }
  `,
  styles: `
    .bedtime-notice {
      max-width: 720px;
      margin: 0.5rem auto 0;
      padding: 0.6rem 1rem;
      display: flex;
      gap: 0.8rem;
      align-items: center;
      justify-content: space-between;
      border: 1px solid var(--line);
      border-radius: 12px;
      background: var(--night-2);
      animation: notice-in 0.3s ease-out;
    }
    @keyframes notice-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
    @media (prefers-reduced-motion: reduce) { .bedtime-notice { animation: none; } }
  `,
})
export class BedtimeNoticeComponent implements OnInit {
  private schedule = inject(ScheduleService);
  private api = inject(ApiService);

  readonly visible = signal(false);
  readonly lead = signal(30);
  private state: ScheduleState | null = null;
  private stateDay = '';
  private dismissedDay = '';

  constructor() {
    const timer = setInterval(() => this.check(), CHECK_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  ngOnInit() {
    this.check();
  }

  /** Comprueba la hora; carga el horario de hoy una vez al día. */
  check(now = new Date()) {
    const today = localDay(now);
    if (this.stateDay !== today) {
      this.stateDay = today;
      this.schedule.get(today).subscribe({ next: (s) => { this.state = s; this.lead.set(s.lead_min); this.evaluate(now); } });
      return;
    }
    this.evaluate(now);
  }

  private evaluate(now: Date) {
    const today = localDay(now);
    const s = this.state;
    if (!s || s.pause || this.dismissedDay === today) return this.visible.set(false);
    const prep = prepareInstant(today, s.version, s.lead_min);
    if (!isAround(now, prep)) return;
    // Solo si no hay una noche ya abierta
    this.api.openNight().subscribe({ next: (open) => this.visible.set(!open) });
  }

  dismiss() {
    this.dismissedDay = localDay(new Date());
    this.visible.set(false);
  }
}

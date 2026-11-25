import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { PushService } from '../core/push.service';
import { PushMessage, pushMessageText } from '../core/push';
import { ApiService } from '../core/api.service';
import { ScheduleState, ScheduleService } from '../core/schedule.service';
import { isAround, localDay, prepareInstant } from '../core/schedule';

const CHECK_MS = 30_000;

/**
 * Aviso con la app abierta (feature 010, US5, FR-018): a la hora de acostarse − aviso (±1 min) muestra
 * "En X min es tu hora de dormir". Silencioso (role="status", sin sonido), sin animación si se pide
 * movimiento reducido. No sale en pausa, en una noche sin horario ni con la noche ya abierta; se cierra
 * y no vuelve ese día. El servidor no programa nada (SC-008).
 *
 * Feature 013 (FR-019): con la app visible, el aviso que llega por push se muestra aquí, igual de silencioso,
 * en vez de como notificación del sistema. Un "prepárate" no se repite si el aviso de 010 ya salió ese día.
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
    @if (pushText(); as text) {
      <div class="bedtime-notice push-notice" role="status">
        <span>{{ text }}</span>
        <button type="button" class="btn btn-ghost btn-sm" (click)="pushText.set(null)">Cerrar</button>
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

  private push = inject(PushService);

  readonly visible = signal(false);
  /** Aviso recibido por push con la app visible (feature 013). */
  readonly pushText = signal<string | null>(null);
  /** Último día en que el aviso de 010 se mostró (para no repetir el "prepárate"). */
  private noticeShownDay = '';
  readonly lead = signal(30);
  private state: ScheduleState | null = null;
  private stateDay = '';
  private dismissedDay = '';

  constructor() {
    const timer = setInterval(() => this.check(), CHECK_MS);
    const sub = this.push.messages.subscribe((m) => this.onPush(m));
    inject(DestroyRef).onDestroy(() => { clearInterval(timer); sub.unsubscribe(); });
  }

  /** Muestra el aviso de push dentro de la app, salvo un "prepárate" que el aviso de 010 ya mostró hoy. */
  onPush(m: PushMessage, now = new Date()) {
    if (m.kind === 'prepare' && this.noticeShownDay === localDay(now)) return;
    this.pushText.set(pushMessageText(m));
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
    this.api.openNight().subscribe({
      next: (open) => {
        this.visible.set(!open);
        if (!open) this.noticeShownDay = today;
      },
    });
  }

  dismiss() {
    this.dismissedDay = localDay(new Date());
    this.visible.set(false);
  }
}

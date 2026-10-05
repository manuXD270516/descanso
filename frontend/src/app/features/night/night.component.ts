import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { Observable } from 'rxjs';
import { ApiService, Nap, SleepRecord, Stats } from '../../core/api.service';
import { AccountService } from '../../core/account.service';
import { CYCLE_MIN, LATENCY_MIN } from '../../core/cycles';
import {
  addDays, fmtDateShort, fmtDuration, fmtMinutesOfDay, fmtTime,
  inputLocalToIso, isoToInputLocal, localDate, minutesOfDay, nightDate, toInputLocal,
} from '../../core/time';
import { ChartTableComponent, TableColumn } from '../../shared/charts/chart-table.component';
import { OriginBadgeComponent, Origin, blockOrigin } from '../../shared/origin/origin-badge.component';
import { CycleCalculatorComponent } from './cycle-calculator.component';
import { AWAKENINGS_OPTIONS, NightCardComponent, SOL_OPTIONS } from './night-card.component';
import { NightUiService } from './night-ui.service';
import { ScheduleService, ScheduleState } from '../../core/schedule.service';
import { scheduledWakeCheck } from '../../core/schedule';
import { StreakMorningComponent } from '../streak/streak-morning.component';

const RANGE_DAYS = 14;
/** Una noche abierta desde hace 14 h o más probablemente se olvidó cerrar (feature 006, US4). */
const FORGOTTEN_MS = 14 * 3600_000;
/** Un despertar anotado más de 60 min después de ocurrir es "Anotado después" (feature 010). */
const LATE_MS = 60 * 60_000;

/** Origen de una noche: 'late' si el despertar se anotó más de 60 min después (FR-013). */
export function nightOrigin(r: SleepRecord): Origin {
  if (!r.wake_time || !r.wake_logged_at) return 'manual';
  return Date.parse(r.wake_logged_at) - Date.parse(r.wake_time) > LATE_MS ? 'late' : 'manual';
}

interface Ribbon {
  date: string;
  label: string;
  sleeps: { x: number; w: number; text: string }[];
  naps: { x: number; w: number; text: string }[];
}

@Component({
  selector: 'app-night',
  imports: [FormsModule, ChartTableComponent, OriginBadgeComponent, CycleCalculatorComponent, NightCardComponent, StreakMorningComponent],
  templateUrl: './night.component.html',
  styleUrl: './night.component.css',
})
export class NightComponent implements OnInit {
  private api = inject(ApiService);
  private account = inject(AccountService);
  private ui = inject(NightUiService);
  private schedules = inject(ScheduleService);

  /** Horario y pausa vigentes hoy, que se aplican a la noche abierta (feature 010). */
  readonly openSchedule = signal<ScheduleState | null>(null);

  readonly open = signal<SleepRecord | null>(null);
  readonly records = signal<SleepRecord[]>([]);
  readonly naps = signal<Nap[]>([]);
  readonly stats = signal<Stats | null>(null);
  readonly error = signal<string | null>(null);
  readonly busy = signal(false);

  // Ajustes de la persona (feature 006): objetivo para el recordatorio y ciclo para la calculadora
  readonly goalMin = signal(420);
  readonly cycleMin = signal(CYCLE_MIN);
  readonly latencyMin = signal(LATENCY_MIN);

  // Formularios
  readonly bedtimeInput = signal(toInputLocal());
  readonly wakeInput = signal(toInputLocal());
  readonly showManual = signal(false);
  manual = { bedtime: '', wake: '', notes: '' };
  readonly editingId = signal<number | null>(null);
  edit = { bedtime: '', wake: '', notes: '', sol: '', awakenings: '' };

  /** Noche recién cerrada: muestra la tarjeta "¿Cómo fue la noche?" (feature 006, US5). */
  readonly lastClosed = signal<SleepRecord | null>(null);
  /** Se acaba de pulsar "Ya desperté": solo entonces se muestra la racha (feature 011, FR-019). */
  readonly wokeUp = signal(false);
  /** Hora propuesta del recordatorio de noche abierta, editable. */
  readonly reminderInput = signal('');
  private readonly loadedAt = signal(Date.now());

  readonly today = localDate();
  readonly from = addDays(this.today, -(RANGE_DAYS - 1));

  readonly fmtTime = fmtTime;
  readonly fmtDuration = fmtDuration;
  readonly fmtDateShort = fmtDateShort;
  readonly fmtMinutesOfDay = fmtMinutesOfDay;
  readonly solOptions = SOL_OPTIONS;
  readonly awakeningsOptions = AWAKENINGS_OPTIONS;

  /** Hora de dormir del panel, en ISO, para la calculadora. */
  readonly bedtimeIso = computed(() => (this.bedtimeInput() ? inputLocalToIso(this.bedtimeInput()) : null));

  /**
   * Con horario activo para la noche abierta y sin pausa (010): "¿Ya despertaste?" a partir de la hora de
   * levantarse agendada + 60 min, proponiendo esa hora. Si no, regla de 006: ≥ 14 h y dormir + objetivo.
   */
  readonly scheduledCheck = computed(() => {
    const o = this.open();
    const s = this.openSchedule();
    return o && s ? scheduledWakeCheck(new Date(o.bedtime), o.date, s.version, !!s.pause, new Date(this.loadedAt())) : null;
  });

  /** Recordatorio de noche abierta, salvo que la persona lo descartara en esta apertura. */
  readonly showReminder = computed(() => {
    const o = this.open();
    if (!o || this.ui.reminderDismissed()) return false;
    const sched = this.scheduledCheck();
    if (sched) return sched.due;
    return this.loadedAt() - new Date(o.bedtime).getTime() >= FORGOTTEN_MS;
  });

  /** Hora propuesta del recordatorio (para saber si se confirmó sin cambiarla). */
  private proposal = '';

  // Todo lo guardado lo anotó la persona; 007 añadirá datos "Del reloj" (feature 006, US1)
  // y desde 010, "Anotado después" si el despertar se anotó tarde: si el bloque mezcla, va por fila
  readonly nightsOrigin = computed<Origin | null>(() => blockOrigin(this.records().map((r) => ({ origin: nightOrigin(r) }))));
  readonly nightOrigin = nightOrigin;

  /** Ejes de la cinta: de 12:00 a 12:00 del día siguiente (24 h) */
  readonly axisTicks = [12, 18, 0, 6, 12].map((h, i) => ({ h, x: i * 25 }));

  readonly ribbons = computed<Ribbon[]>(() => {
    const byDate = new Map<string, Ribbon>();
    for (let i = 0; i < RANGE_DAYS; i++) {
      const date = addDays(this.from, i);
      byDate.set(date, { date, label: fmtDateShort(date), sleeps: [], naps: [] });
    }
    const pos = (iso: string) => {
      const m = minutesOfDay(iso);
      return ((m >= 720 ? m - 720 : m + 720) / 1440) * 100;
    };
    for (const r of this.records()) {
      const row = byDate.get(r.date);
      if (!row || !r.wake_time) continue;
      const x = pos(r.bedtime);
      const w = Math.max(0.5, (r.duration_min! / 1440) * 100);
      row.sleeps.push({ x, w: Math.min(w, 100 - x), text: `${fmtTime(r.bedtime)} → ${fmtTime(r.wake_time)}, ${fmtDuration(r.duration_min)}` });
    }
    for (const n of this.naps()) {
      const row = byDate.get(n.date);
      if (!row) continue;
      const x = pos(n.start_time);
      row.naps.push({ x, w: Math.max(0.5, (n.duration_min / 1440) * 100), text: `Siesta ${fmtTime(n.start_time)} → ${fmtTime(n.end_time)}` });
    }
    return [...byDate.values()].reverse();
  });

  // Accesibilidad de la cinta (feature 005, FR-011): descripción en frases y tabla alternativa
  readonly ribbonColumns: TableColumn[] = [
    { key: 'date', label: 'Noche' },
    { key: 'sleep', label: 'Sueño' },
    { key: 'naps', label: 'Siestas' },
  ];

  readonly ribbonRows = computed(() =>
    this.ribbons().map((r) => ({
      date: r.label,
      sleep: r.sleeps.length ? r.sleeps.map((s) => s.text).join('; ') : 'Sin dato',
      naps: r.naps.length ? r.naps.map((n) => n.text.replace(/^Siesta /, '')).join('; ') : '—',
    })),
  );

  readonly ribbonDescription = computed(() => {
    const rows = this.ribbons();
    const withSleep = rows.filter((r) => r.sleeps.length).length;
    const naps = rows.reduce((s, r) => s + r.naps.length, 0);
    return `Últimas ${rows.length} noches, de 12:00 a 12:00: ${withSleep} con sueño registrado, ` +
      `${rows.length - withSleep} sin dato y ${naps} ${naps === 1 ? 'siesta' : 'siestas'}.`;
  });

  ngOnInit() {
    this.account.me().subscribe({
      next: (p) => {
        this.goalMin.set(p.sleep_goal_min);
        this.cycleMin.set(p.cycle_min ?? CYCLE_MIN);
        this.latencyMin.set(p.latency_min ?? LATENCY_MIN);
        this.proposeWake();
      },
    });
    this.reload();
  }

  reload() {
    this.error.set(null);
    this.loadedAt.set(Date.now());
    this.api.openNight().subscribe({
      next: (o) => {
        this.open.set(o);
        this.openSchedule.set(null);
        this.proposeWake();
        if (o) {
          // El horario vigente hoy rige la noche abierta, aunque empezara ayer y el horario se guardara hoy
          this.schedules.get(localDate()).subscribe({
            next: (s) => { this.openSchedule.set(s); this.proposeWake(); },
          });
        }
      },
      error: (e) => this.fail(e),
    });
    this.api.listSleep(this.from, this.today).subscribe({ next: (r) => this.records.set(r), error: (e) => this.fail(e) });
    this.api.listNaps(this.from, this.today).subscribe({ next: (n) => this.naps.set(n) });
    this.api.stats(this.from, this.today).subscribe({ next: (s) => this.stats.set(s) });
  }

  /** Hora propuesta: la agendada (010) o dormir + objetivo (006), nunca en el futuro. */
  private proposeWake() {
    const o = this.open();
    if (!o) return;
    const sched = this.scheduledCheck();
    const base = sched ? sched.proposal.getTime() : new Date(o.bedtime).getTime() + this.goalMin() * 60_000;
    this.proposal = toInputLocal(new Date(Math.min(base, Date.now())));
    this.reminderInput.set(this.proposal);
  }

  goToSleep() {
    const iso = inputLocalToIso(this.bedtimeInput());
    this.wokeUp.set(false);
    this.run(this.api.createSleep({ date: nightDate(iso), bedtime: iso }), () => this.wakeInput.set(toInputLocal()));
  }

  /** "Ya desperté": 1 toque cierra la noche; la tarjeta llega después (FR-011, FR-017). */
  wakeUp() {
    this.closeNight(inputLocalToIso(this.wakeInput()));
  }

  acceptReminder() {
    if (new Date(this.reminderInput()).getTime() > Date.now()) {
      this.error.set('La hora de despertar no puede estar en el futuro');
      return;
    }
    // Confirmar la hora propuesta sin cambiarla queda registrado (FR-014; lo usará 011)
    this.closeNight(inputLocalToIso(this.reminderInput()), this.reminderInput() === this.proposal);
  }

  dismissReminder() {
    this.ui.reminderDismissed.set(true);
  }

  private closeNight(wakeIso: string, fromProposal = false) {
    this.run(this.api.wake(wakeIso, fromProposal), (closed) => {
      this.bedtimeInput.set(toInputLocal());
      this.lastClosed.set(closed);
      this.wokeUp.set(true);
    });
  }

  updateSettings(s: { cycleMin: number; latencyMin: number }) {
    this.cycleMin.set(s.cycleMin);
    this.latencyMin.set(s.latencyMin);
  }

  saveManual() {
    if (!this.manual.bedtime || !this.manual.wake) return;
    const bedtime = inputLocalToIso(this.manual.bedtime);
    this.run(
      this.api.createSleep({ date: nightDate(bedtime), bedtime, wake_time: inputLocalToIso(this.manual.wake), notes: this.manual.notes || null }),
      () => { this.showManual.set(false); this.manual = { bedtime: '', wake: '', notes: '' }; },
    );
  }

  startEdit(r: SleepRecord) {
    this.editingId.set(r.id);
    this.edit = {
      bedtime: isoToInputLocal(r.bedtime),
      wake: r.wake_time ? isoToInputLocal(r.wake_time) : '',
      notes: r.notes ?? '',
      sol: r.sol_bucket ?? '',
      awakenings: r.awakenings_bucket ?? '',
    };
  }

  /** La fecha de la noche sale siempre de "Me dormí" (principio III); el servicio rechaza otra. */
  editNightDate(): string {
    return this.edit.bedtime ? nightDate(inputLocalToIso(this.edit.bedtime)) : '';
  }

  saveEdit(id: number) {
    this.run(
      this.api.updateSleep(id, {
        date: this.editNightDate(),
        bedtime: inputLocalToIso(this.edit.bedtime),
        wake_time: this.edit.wake ? inputLocalToIso(this.edit.wake) : null,
        notes: this.edit.notes || null,
        sol_bucket: (this.edit.sol || null) as SleepRecord['sol_bucket'],
        awakenings_bucket: (this.edit.awakenings || null) as SleepRecord['awakenings_bucket'],
      }),
      () => this.editingId.set(null),
    );
  }

  /** "Tardé 15–30 min en dormirme · Desperté 1–2 veces", o '' sin respuestas. */
  answersText(r: SleepRecord): string {
    const parts: string[] = [];
    const sol = SOL_OPTIONS.find((o) => o.value === r.sol_bucket);
    const aw = AWAKENINGS_OPTIONS.find((o) => o.value === r.awakenings_bucket);
    if (sol) parts.push(`Tardé ${sol.label} en dormirme`);
    const awakeText = { '0': 'No desperté', '1_2': 'Desperté 1–2 veces', '3plus': 'Desperté 3 o más veces' };
    if (aw) parts.push(awakeText[aw.value]);
    return parts.join(' · ');
  }

  remove(r: SleepRecord) {
    if (!confirm(`¿Eliminar la noche del ${fmtDateShort(r.date)}?`)) return;
    this.run(this.api.deleteSleep(r.id));
  }

  private run<T>(obs: Observable<T>, after?: (result: T) => void) {
    this.busy.set(true);
    this.error.set(null);
    obs.subscribe({
      next: (result) => { after?.(result); this.busy.set(false); this.reload(); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.fail(e); },
    });
  }

  private fail(e: HttpErrorResponse) {
    this.error.set(e?.error?.error || 'No se pudo conectar con el servidor');
  }
}

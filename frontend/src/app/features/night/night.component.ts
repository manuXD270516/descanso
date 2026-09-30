import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { Observable } from 'rxjs';
import { ApiService, Nap, SleepRecord, Stats } from '../../core/api.service';
import {
  addDays, fmtDateShort, fmtDuration, fmtMinutesOfDay, fmtTime,
  inputLocalToIso, isoToInputLocal, localDate, minutesOfDay, nightDate, toInputLocal,
} from '../../core/time';

const RANGE_DAYS = 14;

interface Ribbon {
  date: string;
  label: string;
  sleeps: { x: number; w: number; text: string }[];
  naps: { x: number; w: number; text: string }[];
}

@Component({
  selector: 'app-night',
  imports: [FormsModule],
  templateUrl: './night.component.html',
  styleUrl: './night.component.css',
})
export class NightComponent implements OnInit {
  private api = inject(ApiService);

  readonly open = signal<SleepRecord | null>(null);
  readonly records = signal<SleepRecord[]>([]);
  readonly naps = signal<Nap[]>([]);
  readonly stats = signal<Stats | null>(null);
  readonly error = signal<string | null>(null);
  readonly busy = signal(false);

  // Formularios
  readonly bedtimeInput = signal(toInputLocal());
  readonly wakeInput = signal(toInputLocal());
  readonly showManual = signal(false);
  manual = { bedtime: '', wake: '', notes: '' };
  readonly editingId = signal<number | null>(null);
  edit = { bedtime: '', wake: '', notes: '' };

  readonly today = localDate();
  readonly from = addDays(this.today, -(RANGE_DAYS - 1));

  readonly fmtTime = fmtTime;
  readonly fmtDuration = fmtDuration;
  readonly fmtDateShort = fmtDateShort;
  readonly fmtMinutesOfDay = fmtMinutesOfDay;

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

  ngOnInit() { this.reload(); }

  reload() {
    this.error.set(null);
    this.api.openNight().subscribe({ next: (o) => this.open.set(o), error: (e) => this.fail(e) });
    this.api.listSleep(this.from, this.today).subscribe({ next: (r) => this.records.set(r), error: (e) => this.fail(e) });
    this.api.listNaps(this.from, this.today).subscribe({ next: (n) => this.naps.set(n) });
    this.api.stats(this.from, this.today).subscribe({ next: (s) => this.stats.set(s) });
  }

  goToSleep() {
    const iso = inputLocalToIso(this.bedtimeInput());
    this.run(this.api.createSleep({ date: nightDate(iso), bedtime: iso }), () => this.wakeInput.set(toInputLocal()));
  }

  wakeUp() {
    this.run(this.api.wake(inputLocalToIso(this.wakeInput())), () => this.bedtimeInput.set(toInputLocal()));
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
    this.edit = { bedtime: isoToInputLocal(r.bedtime), wake: r.wake_time ? isoToInputLocal(r.wake_time) : '', notes: r.notes ?? '' };
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
      }),
      () => this.editingId.set(null),
    );
  }

  remove(r: SleepRecord) {
    if (!confirm(`¿Eliminar la noche del ${fmtDateShort(r.date)}?`)) return;
    this.run(this.api.deleteSleep(r.id));
  }

  private run(obs: Observable<unknown>, after?: () => void) {
    this.busy.set(true);
    this.error.set(null);
    obs.subscribe({
      next: () => { after?.(); this.busy.set(false); this.reload(); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.fail(e); },
    });
  }

  private fail(e: HttpErrorResponse) {
    this.error.set(e?.error?.error || 'No se pudo conectar con el servidor');
  }
}

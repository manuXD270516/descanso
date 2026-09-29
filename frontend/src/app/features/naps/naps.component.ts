import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, Nap } from '../../core/api.service';
import { addDays, fmtDateShort, fmtDuration, fmtTime, inputLocalToIso, isoToInputLocal, localDate, toInputLocal } from '../../core/time';

@Component({
  selector: 'app-naps',
  imports: [FormsModule],
  templateUrl: './naps.component.html',
  styleUrl: './naps.component.css',
})
export class NapsComponent implements OnInit {
  private api = inject(ApiService);

  readonly naps = signal<Nap[]>([]);
  readonly error = signal<string | null>(null);
  readonly busy = signal(false);
  readonly editingId = signal<number | null>(null);

  readonly today = localDate();
  readonly from = addDays(this.today, -29);

  form = { start: '', end: '', notes: '' };
  edit = { start: '', end: '', notes: '' };

  readonly fmtTime = fmtTime;
  readonly fmtDuration = fmtDuration;
  readonly fmtDateShort = fmtDateShort;

  /** Siestas agrupadas por día, de hoy hacia atrás */
  readonly grouped = computed(() => {
    const map = new Map<string, Nap[]>();
    for (const n of this.naps()) (map.get(n.date) ?? map.set(n.date, []).get(n.date)!).push(n);
    return [...map.entries()].map(([date, items]) => ({
      date, items, total: items.reduce((s, n) => s + n.duration_min, 0),
    }));
  });

  readonly formDuration = computed(() => {
    if (!this.form.start || !this.form.end) return null;
    const m = Math.round((new Date(this.form.end).getTime() - new Date(this.form.start).getTime()) / 60000);
    return m > 0 ? m : null;
  });

  ngOnInit() {
    this.presetNow();
    this.reload();
  }

  presetNow() {
    const now = new Date();
    this.form.start = toInputLocal(new Date(now.getTime() - 30 * 60000));
    this.form.end = toInputLocal(now);
  }

  reload() {
    this.api.listNaps(this.from, this.today).subscribe({
      next: (n) => this.naps.set(n),
      error: (e) => this.fail(e),
    });
  }

  save() {
    const start = inputLocalToIso(this.form.start);
    this.run(
      this.api.createNap({ date: start.slice(0, 10), start_time: start, end_time: inputLocalToIso(this.form.end), notes: this.form.notes || null }),
      () => { this.form.notes = ''; this.presetNow(); },
    );
  }

  startEdit(n: Nap) {
    this.editingId.set(n.id);
    this.edit = { start: isoToInputLocal(n.start_time), end: isoToInputLocal(n.end_time), notes: n.notes ?? '' };
  }

  saveEdit(id: number) {
    const start = inputLocalToIso(this.edit.start);
    this.run(
      this.api.updateNap(id, { date: start.slice(0, 10), start_time: start, end_time: inputLocalToIso(this.edit.end), notes: this.edit.notes || null }),
      () => this.editingId.set(null),
    );
  }

  remove(n: Nap) {
    if (!confirm('¿Eliminar esta siesta?')) return;
    this.run(this.api.deleteNap(n.id));
  }

  private run(obs: { subscribe: Function }, after?: () => void) {
    this.busy.set(true);
    this.error.set(null);
    obs.subscribe({
      next: () => { after?.(); this.busy.set(false); this.reload(); },
      error: (e: any) => { this.busy.set(false); this.fail(e); },
    });
  }

  private fail(e: any) {
    this.error.set(e?.error?.error || 'No se pudo conectar con el servidor');
  }
}

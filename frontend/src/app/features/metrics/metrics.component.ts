import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, Metric, MetricEntry, MetricType } from '../../core/api.service';
import { addDays, fmtDateShort, localDate } from '../../core/time';

const HISTORY_DAYS = 7;

interface MetricForm {
  id: number | null;
  name: string;
  type: MetricType;
  unit: string;
  min_value: number | null;
  max_value: number | null;
  color: string;
}

const EMPTY_FORM: MetricForm = { id: null, name: '', type: 'scale', unit: '', min_value: 1, max_value: 5, color: '#a9b5f5' };

@Component({
  selector: 'app-metrics',
  imports: [FormsModule],
  templateUrl: './metrics.component.html',
  styleUrl: './metrics.component.css',
})
export class MetricsComponent implements OnInit {
  private api = inject(ApiService);

  readonly metrics = signal<Metric[]>([]);
  readonly entries = signal<MetricEntry[]>([]);
  readonly error = signal<string | null>(null);
  readonly busy = signal(false);

  readonly date = signal(localDate());
  readonly today = localDate();
  readonly configOpen = signal(false);
  readonly showArchived = signal(false);
  readonly form = signal<MetricForm>({ ...EMPTY_FORM });

  readonly fmtDateShort = fmtDateShort;
  readonly types: { id: MetricType; label: string; hint: string }[] = [
    { id: 'scale', label: 'Escala', hint: 'Botones del mínimo al máximo, ej. 1 a 5' },
    { id: 'number', label: 'Número', hint: 'Cualquier cantidad, con unidad opcional' },
    { id: 'boolean', label: 'Sí / No', hint: 'Un hábito que se cumplió o no' },
    { id: 'text', label: 'Texto', hint: 'Una nota corta' },
  ];
  readonly palette = ['#a9b5f5', '#f3b76b', '#7fd3a8', '#ea7a70', '#d69ae8', '#6fc8de', '#c9c07a', '#a08f7a'];

  readonly active = computed(() => this.metrics().filter((m) => !m.archived));
  readonly archived = computed(() => this.metrics().filter((m) => m.archived));
  readonly historyDates = computed(() => Array.from({ length: HISTORY_DAYS }, (_, i) => addDays(this.date(), -i)));

  private readonly index = computed(() => {
    const map = new Map<string, string>();
    for (const e of this.entries()) map.set(`${e.metric_id}|${e.date}`, e.value);
    return map;
  });

  ngOnInit() { this.reload(); }

  reload() {
    this.error.set(null);
    this.api.listMetrics(true).subscribe({ next: (m) => this.metrics.set(m), error: (e) => this.fail(e) });
    this.loadEntries();
  }

  loadEntries() {
    this.api.listEntries(addDays(this.date(), -(HISTORY_DAYS - 1)), this.date()).subscribe({
      next: (e) => this.entries.set(e),
      error: (e) => this.fail(e),
    });
  }

  setDate(d: string) {
    if (!d) return;
    this.date.set(d);
    this.loadEntries();
  }
  shiftDate(n: number) { this.setDate(addDays(this.date(), n)); }

  value(metricId: number, date = this.date()): string | undefined {
    return this.index().get(`${metricId}|${date}`);
  }

  scaleValues(m: Metric): number[] {
    const min = m.min_value ?? 1;
    const max = m.max_value ?? 5;
    return Array.from({ length: Math.min(max - min + 1, 11) }, (_, i) => min + i);
  }

  setValue(m: Metric, raw: unknown) {
    if (raw === '' || raw === null || raw === undefined) {
      if (this.value(m.id) !== undefined) this.api.deleteEntry(m.id, this.date()).subscribe({ next: () => this.loadEntries(), error: (e) => this.fail(e) });
      return;
    }
    this.api.setEntry(m.id, this.date(), raw).subscribe({ next: () => this.loadEntries(), error: (e) => this.fail(e) });
  }

  toggleBool(m: Metric) {
    const cur = this.value(m.id);
    this.setValue(m, cur === '1' ? '0' : '1');
  }

  display(m: Metric, date: string): string {
    const v = this.value(m.id, date);
    if (v === undefined) return '·';
    if (m.type === 'boolean') return v === '1' ? '✓' : '✗';
    return v;
  }

  // Configuración
  newMetric() { this.form.set({ ...EMPTY_FORM }); this.configOpen.set(true); }
  editMetric(m: Metric) {
    this.form.set({ id: m.id, name: m.name, type: m.type, unit: m.unit ?? '', min_value: m.min_value, max_value: m.max_value, color: m.color });
    this.configOpen.set(true);
  }
  patch<K extends keyof MetricForm>(key: K, val: MetricForm[K]) { this.form.update((f) => ({ ...f, [key]: val })); }
  onTypeChange(t: MetricType) {
    this.form.update((f) => ({ ...f, type: t, min_value: t === 'scale' ? 1 : null, max_value: t === 'scale' ? 5 : null }));
  }

  saveMetric() {
    const f = this.form();
    const body: Partial<Metric> = {
      name: f.name, type: f.type, unit: f.unit || null, color: f.color,
      min_value: f.type === 'text' || f.type === 'boolean' ? null : f.min_value,
      max_value: f.type === 'text' || f.type === 'boolean' ? null : f.max_value,
      sort_order: f.id === null ? this.metrics().length : undefined,
    };
    const req = f.id === null ? this.api.createMetric(body) : this.api.updateMetric(f.id, body);
    this.run(req, () => this.form.set({ ...EMPTY_FORM }));
  }

  archive(m: Metric, archived: boolean) { this.run(this.api.updateMetric(m.id, { archived: archived ? 1 : 0 })); }

  removeMetric(m: Metric) {
    if (!confirm(`¿Eliminar "${m.name}" y todos sus registros? Esta acción no se puede deshacer.`)) return;
    this.run(this.api.deleteMetric(m.id));
  }

  move(m: Metric, dir: -1 | 1) {
    const list = [...this.active()];
    const i = list.findIndex((x) => x.id === m.id);
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    this.busy.set(true);
    let pending = list.length;
    list.forEach((x, idx) => this.api.updateMetric(x.id, { sort_order: idx }).subscribe({
      next: () => { if (--pending === 0) { this.busy.set(false); this.reload(); } },
      error: (e) => { this.busy.set(false); this.fail(e); },
    }));
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

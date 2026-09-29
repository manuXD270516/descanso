import { expect, type APIRequestContext, type APIResponse } from '@playwright/test';
import { OFFSET } from './env';

/** "2026-09-07T23:40" → "2026-09-07T23:40:00-04:00" (hora local de los tests con su offset). */
export const iso = (local: string) => `${local}:00${OFFSET}`;

/** Suma días a una fecha YYYY-MM-DD (aritmética de calendario, sin zona horaria). */
export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export interface SleepRecord {
  id: number;
  date: string;
  bedtime: string;
  wake_time: string | null;
  notes: string | null;
  duration_min: number | null;
}
export interface Nap {
  id: number;
  date: string;
  start_time: string;
  end_time: string;
  notes: string | null;
  duration_min: number;
}
export interface Metric {
  id: number;
  name: string;
  type: 'number' | 'scale' | 'boolean' | 'text';
  unit: string | null;
  min_value: number | null;
  max_value: number | null;
  sort_order: number;
  archived: number;
}
export interface MetricEntry {
  metric_id: number;
  date: string;
  value: string;
}

async function json<T>(res: APIResponse): Promise<T> {
  expect(res.ok(), `${res.url()} → ${res.status()} ${await res.text()}`).toBeTruthy();
  return res.status() === 204 ? (undefined as T) : ((await res.json()) as T);
}

/**
 * Cliente mínimo de la API del servidor bajo prueba. Sirve para preparar datos (lo que no es
 * objeto del test) y para comprobar lo que la interfaz no muestra (p. ej. la fecha guardada).
 */
export class Api {
  constructor(readonly request: APIRequestContext) {}

  /** Noche con horas locales "YYYY-MM-DDTHH:mm"; la fecha de noche es el día de acostarse. */
  createNight(bed: string, wake?: string, notes?: string) {
    return this.request
      .post('/api/sleep', {
        data: { date: bed.slice(0, 10), bedtime: iso(bed), wake_time: wake ? iso(wake) : null, notes },
      })
      .then(json<SleepRecord>);
  }
  nights() {
    return this.request.get('/api/sleep').then(json<SleepRecord[]>);
  }
  deleteNight(id: number) {
    return this.request.delete(`/api/sleep/${id}`).then(json<void>);
  }

  createNap(start: string, end: string, notes?: string) {
    return this.request
      .post('/api/naps', { data: { date: start.slice(0, 10), start_time: iso(start), end_time: iso(end), notes } })
      .then(json<Nap>);
  }
  naps() {
    return this.request.get('/api/naps').then(json<Nap[]>);
  }

  metrics(all = true) {
    return this.request.get(`/api/metrics${all ? '?all=1' : ''}`).then(json<Metric[]>);
  }
  async metric(name: string): Promise<Metric> {
    const m = (await this.metrics()).find((x) => x.name === name);
    if (!m) throw new Error(`No existe la métrica "${name}"`);
    return m;
  }
  createMetric(body: Partial<Metric> & { color?: string }) {
    return this.request.post('/api/metrics', { data: body }).then(json<Metric>);
  }
  setEntry(metricId: number, date: string, value: unknown) {
    return this.request.put(`/api/metrics/${metricId}/entries/${date}`, { data: { value } }).then(json<MetricEntry>);
  }
  /** Valores de las métricas activas en el rango (la API omite los de las archivadas). */
  entries(from = '2000-01-01', to = '2100-01-01') {
    return this.request.get(`/api/metrics/entries?from=${from}&to=${to}`).then(json<MetricEntry[]>);
  }
}

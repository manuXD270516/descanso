import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface SleepRecord {
  id: number;
  date: string;
  bedtime: string;
  wake_time: string | null;
  notes: string | null;
  duration_min: number | null;
  /** Respuestas opcionales de "¿Cómo fue la noche?" (feature 006); null = sin respuesta. */
  sol_bucket?: SolBucket | null;
  awakenings_bucket?: AwakeningsBucket | null;
  /** Feature 010: cuándo se anotó el despertar y si se confirmó la hora propuesta sin cambiarla. */
  wake_logged_at?: string | null;
  wake_from_proposal?: number;
}

export type SolBucket = 'lt15' | '15_30' | 'gt30';
export type AwakeningsBucket = '0' | '1_2' | '3plus';

export interface Nap {
  id: number;
  date: string;
  start_time: string;
  end_time: string;
  notes: string | null;
  duration_min: number;
}

export type MetricType = 'number' | 'scale' | 'boolean' | 'text';

export interface Metric {
  id: number;
  name: string;
  type: MetricType;
  unit: string | null;
  min_value: number | null;
  max_value: number | null;
  color: string;
  sort_order: number;
  archived: number;
}

export interface MetricEntry {
  id: number;
  metric_id: number;
  date: string;
  value: string;
}

export interface DayStat {
  date: string;
  sleep_min: number;
  nap_min: number;
  naps: number;
  bedtime: string | null;
  wake_time: string | null;
}

export interface Stats {
  days: DayStat[];
  summary: {
    nights: number;
    avg_sleep_min: number;
    avg_nap_min: number;
    total_naps: number;
    avg_bedtime_min: number | null;
    avg_wake_min: number | null;
  };
}

export interface Health {
  ok: boolean;
  time: string;
  version: string;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  private base = '/api';

  // Sueño nocturno
  listSleep(from?: string, to?: string): Observable<SleepRecord[]> {
    return this.http.get<SleepRecord[]>(`${this.base}/sleep`, { params: clean({ from, to }) });
  }
  openNight(): Observable<SleepRecord | null> {
    return this.http.get<SleepRecord | null>(`${this.base}/sleep/open`);
  }
  createSleep(body: Partial<SleepRecord>): Observable<SleepRecord> {
    return this.http.post<SleepRecord>(`${this.base}/sleep`, body);
  }
  wake(wake_time: string, from_proposal = false): Observable<SleepRecord> {
    return this.http.post<SleepRecord>(`${this.base}/sleep/wake`, from_proposal ? { wake_time, from_proposal } : { wake_time });
  }
  updateSleep(id: number, body: Partial<SleepRecord>): Observable<SleepRecord> {
    return this.http.put<SleepRecord>(`${this.base}/sleep/${id}`, body);
  }
  deleteSleep(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/sleep/${id}`);
  }

  // Siestas
  listNaps(from?: string, to?: string): Observable<Nap[]> {
    return this.http.get<Nap[]>(`${this.base}/naps`, { params: clean({ from, to }) });
  }
  createNap(body: Partial<Nap>): Observable<Nap> {
    return this.http.post<Nap>(`${this.base}/naps`, body);
  }
  updateNap(id: number, body: Partial<Nap>): Observable<Nap> {
    return this.http.put<Nap>(`${this.base}/naps/${id}`, body);
  }
  deleteNap(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/naps/${id}`);
  }

  // Métricas
  listMetrics(all = false): Observable<Metric[]> {
    return this.http.get<Metric[]>(`${this.base}/metrics`, { params: all ? { all: '1' } : {} });
  }
  createMetric(body: Partial<Metric>): Observable<Metric> {
    return this.http.post<Metric>(`${this.base}/metrics`, body);
  }
  updateMetric(id: number, body: Partial<Metric>): Observable<Metric> {
    return this.http.put<Metric>(`${this.base}/metrics/${id}`, body);
  }
  deleteMetric(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/metrics/${id}`);
  }
  listEntries(from: string, to: string): Observable<MetricEntry[]> {
    return this.http.get<MetricEntry[]>(`${this.base}/metrics/entries`, { params: { from, to } });
  }
  setEntry(metricId: number, date: string, value: unknown): Observable<MetricEntry> {
    return this.http.put<MetricEntry>(`${this.base}/metrics/${metricId}/entries/${date}`, { value });
  }
  deleteEntry(metricId: number, date: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/metrics/${metricId}/entries/${date}`);
  }

  // Salud y versión desplegada
  health(): Observable<Health> {
    return this.http.get<Health>(`${this.base}/health`);
  }

  // Estadísticas
  stats(from: string, to: string): Observable<Stats> {
    return this.http.get<Stats>(`${this.base}/stats`, { params: { from, to } });
  }
}

function clean(o: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Record<string, string>;
}

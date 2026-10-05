import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Pause, ScheduleDay, ScheduleVersion } from './schedule';

export interface ScheduleState {
  version: ScheduleVersion | null;
  lead_min: number;
  pause: Pause | null;
}

/** Horario, archivo de calendario y pausas (feature 010). "Hoy" lo pone siempre el cliente. */
@Injectable({ providedIn: 'root' })
export class ScheduleService {
  private http = inject(HttpClient);

  get(date: string): Observable<ScheduleState> {
    return this.http.get<ScheduleState>('/api/schedule', { params: { date } });
  }
  save(today: string, days: ScheduleDay[]): Observable<ScheduleVersion> {
    return this.http.put<ScheduleVersion>('/api/schedule', { today, days });
  }
  /** URL de descarga del archivo de calendario (la sesión va en la cookie). */
  icsUrl(today: string): string {
    return `/api/schedule.ics?today=${today}`;
  }
  pauses(): Observable<Pause[]> {
    return this.http.get<Pause[]>('/api/pauses');
  }
  createPause(today: string, start_date: string, end_date: string): Observable<Pause> {
    return this.http.post<Pause>('/api/pauses', { today, start_date, end_date });
  }
  endPause(today: string, id: number): Observable<Pause | null> {
    return this.http.post<Pause | null>(`/api/pauses/${id}/end`, { today });
  }
}

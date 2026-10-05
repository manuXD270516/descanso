import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Streak, StreakSettingsPatch } from './streak';
import { localDate } from './time';

/** Racha de constancia (feature 011). "Hoy" lo pone siempre el cliente (su fecha local). */
@Injectable({ providedIn: 'root' })
export class StreakService {
  private http = inject(HttpClient);

  get(today = localDate()): Observable<Streak> {
    return this.http.get<Streak>('/api/streak', { params: { today } });
  }
  saveSettings(patch: StreakSettingsPatch, today = localDate()): Observable<Streak> {
    return this.http.put<Streak>('/api/streak/settings', { today, ...patch });
  }
  markSeen(key: number): Observable<void> {
    return this.http.post<void>(`/api/streak/achievements/${key}/seen`, {});
  }
}

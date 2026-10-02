import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

/** Un día del dashboard (feature 005). total_min null = sin dato (nunca 0). */
export interface DashboardDay {
  date: string;
  status: 'data' | 'none' | 'in_progress';
  night_min: number | null;
  nap_min: number | null;
  total_min: number | null;
}

export interface CircularStat {
  mean_min: number;
  spread_min: number;
}

export interface Dashboard {
  goal_min: number;
  cycle_min: number;
  period: { from: string; to: string; days: 7 | 30 | 90 };
  days: DashboardDay[];
  summary: { avg_min: number | null; days_with_data: number; goal_met: number };
  pending14: { net_min: number | null; days: number };
  regularity: { nights: number; bedtime: CircularStat; wake: CircularStat } | null;
  cycles: { equivalent: number; shortcuts: { cycles: number; minutes: number }[] };
}

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private http = inject(HttpClient);

  /** `to` es la fecha local de hoy: el servidor no adivina la zona horaria (principio III). */
  get(days: 7 | 30 | 90, to: string): Observable<Dashboard> {
    return this.http.get<Dashboard>('/api/dashboard', { params: { days, to } });
  }
}

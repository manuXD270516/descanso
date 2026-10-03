import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

/** Mi perfil (feature 008). */
export interface Profile {
  id: number;
  email: string;
  role: 'owner' | 'user';
  display_name: string | null;
  timezone: string | null;
  sleep_goal_min: number;
  /** Calculadora de ciclos (feature 006): 70–110 y 0–60 min. */
  cycle_min: number;
  latency_min: number;
  consent_version: string | null;
  consent_at: string | null;
  created_at: string;
}

export interface Activity {
  action: 'reset_link_created' | 'password_reset';
  actor: string;
  created_at: string;
}

export interface Person {
  id: number;
  display_name: string | null;
  email: string | null;
  role: 'owner' | 'user';
  created_at: string;
}

export interface Invite {
  id: number;
  status: 'pendiente' | 'usada' | 'revocada' | 'caducada';
  created_at: string;
  expires_at: string;
  used_by_name: string | null;
}

export interface OneTimeLink {
  token: string;
  expires_at: string;
}

@Injectable({ providedIn: 'root' })
export class AccountService {
  private http = inject(HttpClient);

  me(): Observable<Profile> {
    return this.http.get<Profile>('/api/me');
  }
  updateProfile(body: Partial<Pick<Profile, 'display_name' | 'timezone' | 'sleep_goal_min' | 'cycle_min' | 'latency_min'>>): Observable<Profile> {
    return this.http.put<Profile>('/api/me', body);
  }
  changeEmail(email: string, password: string): Observable<Profile> {
    return this.http.put<Profile>('/api/me/email', { email, password });
  }
  changePassword(current: string, password: string): Observable<void> {
    return this.http.put<void>('/api/me/password', { current, password });
  }
  activity(): Observable<Activity[]> {
    return this.http.get<Activity[]>('/api/me/activity');
  }
  deleteAccount(password: string): Observable<void> {
    return this.http.delete<void>('/api/me', { body: { password } });
  }

  // Solo propietario
  people(): Observable<Person[]> {
    return this.http.get<Person[]>('/api/people');
  }
  invites(): Observable<Invite[]> {
    return this.http.get<Invite[]>('/api/people/invites');
  }
  createInvite(): Observable<OneTimeLink & { id: number }> {
    return this.http.post<OneTimeLink & { id: number }>('/api/people/invites', {});
  }
  revokeInvite(id: number): Observable<void> {
    return this.http.delete<void>(`/api/people/invites/${id}`);
  }
  resetLink(userId: number): Observable<OneTimeLink> {
    return this.http.post<OneTimeLink>(`/api/people/${userId}/reset-link`, {});
  }
}

import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';

/**
 * Qué pantalla toca mostrar (feature 004). "loading" mientras se pregunta al servidor;
 * "offline" si no se pudo contactar con él (no es lo mismo que no tener sesión).
 */
export type AuthState = 'loading' | 'offline' | 'setup' | 'setup-unavailable' | 'login' | 'authenticated';

interface StatusResponse {
  state: Exclude<AuthState, 'loading' | 'offline'>;
  nights?: number;
  email?: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);

  readonly state = signal<AuthState>('loading');
  readonly email = signal<string | null>(null);
  /** Noches registradas, para "Tus N noches están a salvo" en el alta. */
  readonly nights = signal(0);

  refresh(): void {
    this.http.get<StatusResponse>('/api/auth/status').subscribe({
      next: (s) => {
        this.state.set(s.state);
        this.email.set(s.email ?? null);
        this.nights.set(s.nights ?? 0);
      },
      error: () => this.state.set('offline'),
    });
  }

  login(email: string, password: string): Observable<{ email: string }> {
    return this.http.post<{ email: string }>('/api/auth/login', { email, password }).pipe(tap((r) => this.enter(r.email)));
  }

  setup(token: string, email: string, password: string): Observable<{ email: string }> {
    return this.http.post<{ email: string }>('/api/auth/setup', { token, email, password }).pipe(tap((r) => this.enter(r.email)));
  }

  logout(): void {
    this.http.post<void>('/api/auth/logout', {}).subscribe({ complete: () => this.loggedOut(), error: () => this.loggedOut() });
  }

  /** La sesión ya no vale (un 401 de la API o cerrar sesión). */
  loggedOut(): void {
    this.email.set(null);
    this.state.set('login');
  }

  private enter(email: string): void {
    this.email.set(email);
    this.state.set('authenticated');
  }
}

import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { POLICY_VERSION } from './privacy';

/**
 * Qué pantalla toca mostrar (feature 004). "loading" mientras se pregunta al servidor;
 * "offline" si no se pudo contactar con él (no es lo mismo que no tener sesión).
 */
export type AuthState = 'loading' | 'offline' | 'setup' | 'setup-unavailable' | 'login' | 'authenticated';
export type Role = 'owner' | 'user';

interface StatusResponse {
  state: Exclude<AuthState, 'loading' | 'offline'>;
  nights?: number;
  email?: string;
  role?: Role;
  display_name?: string | null;
}

interface SessionUser {
  email: string;
  role?: Role;
  display_name?: string | null;
  reset_notice_at?: string | null;
}

export interface RegisterForm {
  invite: string;
  display_name: string;
  email: string;
  password: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);

  readonly state = signal<AuthState>('loading');
  readonly email = signal<string | null>(null);
  readonly role = signal<Role | null>(null);
  readonly displayName = signal<string | null>(null);
  /** Noches registradas, para "Tus N noches están a salvo" en el alta. */
  readonly nights = signal(0);
  /** Fecha del último restablecimiento de contraseña, pendiente de mostrar (feature 008). */
  readonly resetNotice = signal<string | null>(null);

  refresh(): void {
    this.http.get<StatusResponse>('/api/auth/status').subscribe({
      next: (s) => {
        this.state.set(s.state);
        this.email.set(s.email ?? null);
        this.role.set(s.role ?? null);
        this.displayName.set(s.display_name ?? null);
        this.nights.set(s.nights ?? 0);
      },
      error: () => this.state.set('offline'),
    });
  }

  login(email: string, password: string): Observable<SessionUser> {
    return this.http.post<SessionUser>('/api/auth/login', { email, password }).pipe(tap((r) => this.enter(r)));
  }

  setup(token: string, email: string, password: string): Observable<SessionUser> {
    return this.http.post<SessionUser>('/api/auth/setup', { token, email, password }).pipe(tap((r) => this.enter({ role: 'owner', ...r })));
  }

  /** Registro con invitación aceptando la política vigente (feature 008). */
  register(form: RegisterForm): Observable<SessionUser> {
    return this.http
      .post<SessionUser>('/api/auth/register', { ...form, accept_policy: true, policy_version: POLICY_VERSION })
      .pipe(tap((r) => this.enter(r)));
  }

  /** Contraseña nueva con un enlace de recuperación del propietario (feature 008). */
  resetPassword(token: string, password: string): Observable<void> {
    return this.http.post<void>('/api/auth/reset', { token, password });
  }

  logout(): void {
    this.http.post<void>('/api/auth/logout', {}).subscribe({ complete: () => this.loggedOut(), error: () => this.loggedOut() });
  }

  /** La sesión ya no vale (un 401 de la API, cerrar sesión o borrar la cuenta). */
  loggedOut(): void {
    this.email.set(null);
    this.role.set(null);
    this.displayName.set(null);
    this.resetNotice.set(null);
    this.state.set('login');
  }

  /** Marca como visto el aviso de restablecimiento. */
  dismissResetNotice(): void {
    this.resetNotice.set(null);
    this.http.post<void>('/api/me/reset-notice/ack', {}).subscribe({ error: () => undefined });
  }

  private enter(u: SessionUser): void {
    this.email.set(u.email);
    this.role.set(u.role ?? null);
    this.displayName.set(u.display_name ?? null);
    this.resetNotice.set(u.reset_notice_at ?? null);
    this.state.set('authenticated');
  }
}

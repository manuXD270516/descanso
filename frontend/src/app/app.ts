import { Component, OnInit, inject, signal } from '@angular/core';
import { ApiService } from './core/api.service';
import { AuthService } from './core/auth.service';
import { readLinkTokens } from './core/link-tokens';
import { NightComponent } from './features/night/night.component';
import { NapsComponent } from './features/naps/naps.component';
import { MetricsComponent } from './features/metrics/metrics.component';
import { LoginComponent } from './features/auth/login.component';
import { SetupComponent } from './features/auth/setup.component';
import { RegisterComponent } from './features/account/register.component';
import { ResetPasswordComponent } from './features/account/reset-password.component';
import { ForgotComponent } from './features/account/forgot.component';
import { PrivacyComponent } from './features/account/privacy.component';
import { ProfileComponent } from './features/account/profile.component';
import { PeopleComponent } from './features/account/people.component';

type Tab = 'night' | 'naps' | 'metrics';
/** Vistas del menú Cuenta (feature 008). */
type AccountView = 'profile' | 'people' | 'privacy';
/** Pantallas sin sesión que se abren desde un enlace o desde "Entrar". */
type PublicView = 'register' | 'reset' | 'forgot' | 'privacy';

@Component({
  selector: 'app-root',
  imports: [
    NightComponent, NapsComponent, MetricsComponent, LoginComponent, SetupComponent,
    RegisterComponent, ResetPasswordComponent, ForgotComponent, PrivacyComponent, ProfileComponent, PeopleComponent,
  ],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  private api = inject(ApiService);
  readonly auth = inject(AuthService);

  // La pestaña vive en App: si la sesión caduca y vuelves a entrar, sigues donde estabas
  readonly tab = signal<Tab>('night');
  readonly accountView = signal<AccountView | null>(null);
  readonly publicView = signal<PublicView | null>(null);
  readonly inviteToken = signal<string | null>(null);
  readonly resetToken = signal<string | null>(null);

  readonly tabs: { id: Tab; label: string }[] = [
    { id: 'night', label: 'Noche' },
    { id: 'naps', label: 'Siestas' },
    { id: 'metrics', label: 'Métricas' },
  ];

  /** Exportaciones (feature 004, US5): JSON completo y un CSV por tipo. */
  readonly exports = [
    { href: '/api/export.json', label: 'Todo (JSON)' },
    { href: '/api/export/noches.csv', label: 'Noches (CSV)' },
    { href: '/api/export/siestas.csv', label: 'Siestas (CSV)' },
    { href: '/api/export/metricas.csv', label: 'Métricas (CSV)' },
    { href: '/api/export/valores.csv', label: 'Valores (CSV)' },
  ];

  /** Versión desplegada: SHA corto del commit, o "dev" en local */
  readonly version = signal<string | null>(null);

  ngOnInit() {
    const links = readLinkTokens();
    if (links.invite) {
      this.inviteToken.set(links.invite);
      this.publicView.set('register');
    } else if (links.reset) {
      this.resetToken.set(links.reset);
      this.publicView.set('reset');
    }
    this.auth.refresh();
    this.api.health().subscribe({
      next: (h) => this.version.set(/^[0-9a-f]{40}$/.test(h.version) ? h.version.slice(0, 7) : h.version),
      error: () => this.version.set(null),
    });
  }

  selectTab(id: Tab) {
    this.accountView.set(null);
    this.tab.set(id);
  }

  openAccount(view: AccountView, menu?: HTMLDetailsElement) {
    if (menu) menu.open = false;
    this.accountView.set(view);
  }

  closePublic() {
    this.publicView.set(null);
    this.inviteToken.set(null);
    this.resetToken.set(null);
    this.auth.refresh();
  }

  logout(menu?: HTMLDetailsElement) {
    if (menu) menu.open = false;
    this.accountView.set(null);
    this.auth.logout();
  }

  /** Fecha legible del aviso de restablecimiento. */
  noticeDate(iso: string): string {
    return new Date(iso).toLocaleString('es', { dateStyle: 'long', timeStyle: 'short' });
  }
}

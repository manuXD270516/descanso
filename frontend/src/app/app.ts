import { Component, OnInit, inject, signal } from '@angular/core';
import { ApiService } from './core/api.service';
import { AuthService } from './core/auth.service';
import { NightComponent } from './features/night/night.component';
import { NapsComponent } from './features/naps/naps.component';
import { MetricsComponent } from './features/metrics/metrics.component';
import { LoginComponent } from './features/auth/login.component';
import { SetupComponent } from './features/auth/setup.component';

type Tab = 'night' | 'naps' | 'metrics';

@Component({
  selector: 'app-root',
  imports: [NightComponent, NapsComponent, MetricsComponent, LoginComponent, SetupComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  private api = inject(ApiService);
  readonly auth = inject(AuthService);

  // La pestaña vive en App: si la sesión caduca y vuelves a entrar, sigues donde estabas
  readonly tab = signal<Tab>('night');
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
    this.auth.refresh();
    this.api.health().subscribe({
      next: (h) => this.version.set(/^[0-9a-f]{40}$/.test(h.version) ? h.version.slice(0, 7) : h.version),
      error: () => this.version.set(null),
    });
  }
}

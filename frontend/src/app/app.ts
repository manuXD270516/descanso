import { Component, OnInit, inject, signal } from '@angular/core';
import { ApiService } from './core/api.service';
import { NightComponent } from './features/night/night.component';
import { NapsComponent } from './features/naps/naps.component';
import { MetricsComponent } from './features/metrics/metrics.component';

type Tab = 'night' | 'naps' | 'metrics';

@Component({
  selector: 'app-root',
  imports: [NightComponent, NapsComponent, MetricsComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  private api = inject(ApiService);

  readonly tab = signal<Tab>('night');
  readonly tabs: { id: Tab; label: string }[] = [
    { id: 'night', label: 'Noche' },
    { id: 'naps', label: 'Siestas' },
    { id: 'metrics', label: 'Métricas' },
  ];

  /** Versión desplegada: SHA corto del commit, o "dev" en local */
  readonly version = signal<string | null>(null);

  ngOnInit() {
    this.api.health().subscribe({
      next: (h) => this.version.set(/^[0-9a-f]{40}$/.test(h.version) ? h.version.slice(0, 7) : h.version),
      error: () => this.version.set(null),
    });
  }
}

import { Component, signal } from '@angular/core';
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
export class App {
  readonly tab = signal<Tab>('night');
  readonly tabs: { id: Tab; label: string }[] = [
    { id: 'night', label: 'Noche' },
    { id: 'naps', label: 'Siestas' },
    { id: 'metrics', label: 'Métricas' },
  ];
}

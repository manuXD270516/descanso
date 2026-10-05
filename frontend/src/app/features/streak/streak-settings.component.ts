import { Component, OnInit, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { StreakSettingsPatch } from '../../core/streak';
import { StreakService } from '../../core/streak.service';

/**
 * Ajustes de la racha en Cuenta → "Mi horario" (feature 011, FR-008, FR-017, FR-018): activarla o
 * desactivarla (el récord y los logros se conservan) y el margen para las dos horas (15–60 min).
 */
@Component({
  selector: 'app-streak-settings',
  imports: [FormsModule],
  template: `
    <h3>Racha de constancia</h3>
    <p class="small muted">Cuenta un día si te acuestas y te levantas a tu hora, o si registras la noche cuando no tienes
      horario o estás en pausa. Opcional: puedes desactivarla cuando quieras.</p>
    @if (loaded()) {
      <label class="row check">
        <input type="checkbox" name="streakEnabled" [ngModel]="enabled()" (ngModelChange)="save({ enabled: $event })" [disabled]="busy()">
        <span>Llevar una racha de constancia</span>
      </label>
      @if (enabled()) {
        <div class="row wrap">
          <label class="field"><span>Margen (minutos)</span>
            <input type="number" name="streakMargin" [(ngModel)]="margin" min="15" max="60" step="5">
          </label>
          <button type="button" class="btn btn-sm" [disabled]="busy()" (click)="save({ margin_min: margin })">Guardar margen</button>
        </div>
        <p class="small muted">Tu hora puede pasarse hasta el margen sin que deje de contar. Adelantarte nunca resta.</p>
      }
    }
    @if (saved()) { <p class="small" role="status">{{ saved() }}</p> }
    @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
  `,
  styles: `.check { gap: 0.5rem; align-items: center; } .wrap { flex-wrap: wrap; } .field input { width: 6rem; }`,
})
export class StreakSettingsComponent implements OnInit {
  private service = inject(StreakService);
  readonly loaded = signal(false);
  readonly enabled = signal(false);
  readonly busy = signal(false);
  readonly saved = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  margin = 30;

  ngOnInit() {
    this.service.get().subscribe({
      next: (s) => { this.enabled.set(s.enabled); this.margin = s.margin_min; this.loaded.set(true); },
    });
  }

  save(patch: StreakSettingsPatch) {
    this.busy.set(true);
    this.error.set(null);
    this.saved.set(null);
    this.service.saveSettings(patch).subscribe({
      next: (s) => {
        this.busy.set(false);
        this.enabled.set(s.enabled);
        this.margin = s.margin_min;
        this.saved.set(patch.enabled === true ? 'Racha activada: empieza esta noche.' : patch.enabled === false ? 'Racha desactivada. Tu récord y tus constelaciones se conservan.' : 'Margen guardado.');
      },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.error.set(e.error?.error ?? 'No se pudo guardar.'); },
    });
  }
}

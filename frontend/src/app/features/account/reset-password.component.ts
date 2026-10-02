import { Component, ElementRef, inject, input, output, signal, viewChild } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/auth.service';

/** Contraseña nueva con un enlace de recuperación del propietario (feature 008, US4). */
@Component({
  selector: 'app-reset-password',
  imports: [FormsModule],
  styleUrl: './account.css',
  template: `
    <section class="panel account-card" aria-labelledby="reset-title">
      <h2 id="reset-title">Elige una contraseña nueva</h2>
      @if (done()) {
        <p role="status">Listo: tu contraseña se cambió y se cerraron tus sesiones anteriores. Ya puedes entrar.</p>
        <button class="btn btn-moon" type="button" (click)="finished.emit()">Ir a Entrar</button>
      } @else {
        @if (error()) {
          <p class="error" role="alert" tabindex="-1" #errorMsg>{{ error() }}</p>
        }
        <form (ngSubmit)="submit()">
          <label class="field"><span>Contraseña nueva</span>
            <input type="password" name="password" [(ngModel)]="password" autocomplete="new-password" required>
            <small class="muted small">Al menos 12 caracteres.</small>
          </label>
          <button class="btn btn-moon" type="submit" [disabled]="busy() || length() < 12">Guardar contraseña</button>
        </form>
      }
    </section>
  `,
})
export class ResetPasswordComponent {
  private auth = inject(AuthService);
  private errorEl = viewChild<ElementRef<HTMLElement>>('errorMsg');

  readonly token = input.required<string>();
  readonly finished = output<void>();

  password = '';
  readonly busy = signal(false);
  readonly done = signal(false);
  readonly error = signal<string | null>(null);

  length(): number {
    return [...this.password].length;
  }

  submit() {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    this.auth.resetPassword(this.token(), this.password).subscribe({
      next: () => {
        this.busy.set(false);
        this.done.set(true);
      },
      error: (e: HttpErrorResponse) => {
        this.busy.set(false);
        this.error.set(e.error?.error ?? 'No se pudo cambiar la contraseña.');
        queueMicrotask(() => this.errorEl()?.nativeElement.focus());
      },
    });
  }
}

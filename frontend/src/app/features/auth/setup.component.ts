import { Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/auth.service';

/** Pantalla "Crea tu contraseña": alta del propietario con el código de alta (feature 004, US2). */
@Component({
  selector: 'app-setup',
  imports: [FormsModule],
  templateUrl: './setup.component.html',
  styleUrl: './auth.css',
})
export class SetupComponent {
  readonly auth = inject(AuthService);
  private errorEl = viewChild<ElementRef<HTMLElement>>('errorMsg');

  static readonly MIN_LENGTH = 12;
  readonly minLength = SetupComponent.MIN_LENGTH;

  token = '';
  email = '';
  password = '';
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  /** Longitud en caracteres (no en unidades UTF-16), igual que el servidor. */
  passwordLength(): number {
    return [...this.password].length;
  }

  submit() {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    this.auth.setup(this.token, this.email, this.password).subscribe({
      next: () => this.busy.set(false),
      error: (e: HttpErrorResponse) => {
        this.busy.set(false);
        this.error.set(e.error?.error ?? 'No se pudo crear la cuenta. Inténtalo de nuevo.');
        queueMicrotask(() => this.errorEl()?.nativeElement.focus());
      },
    });
  }
}

import { Component, ElementRef, inject, input, output, signal, viewChild } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/auth.service';
import { OPERATOR_NOTICE, POLICY_SECTIONS } from '../../core/privacy';

/** Registro con invitación (feature 008, US1 y US6). */
@Component({
  selector: 'app-register',
  imports: [FormsModule],
  styleUrl: './account.css',
  template: `
    <section class="panel account-card" aria-labelledby="register-title">
      <h2 id="register-title">Te han invitado a Descanso</h2>
      <p class="notice">{{ notice }}</p>

      <details class="policy">
        <summary>Leer la política de privacidad</summary>
        @for (s of sections; track s.title) {
          <h3>{{ s.title }}</h3>
          <p>{{ s.text }}</p>
        }
      </details>

      @if (error()) {
        <p class="error" role="alert" tabindex="-1" #errorMsg>{{ error() }}</p>
      }

      <form (ngSubmit)="submit()">
        <label class="field"><span>Tu nombre</span>
          <input type="text" name="display_name" [(ngModel)]="displayName" autocomplete="nickname" maxlength="60" required>
        </label>
        <label class="field"><span>Email</span>
          <input type="email" name="email" [(ngModel)]="email" autocomplete="username" required>
        </label>
        <label class="field"><span>Contraseña</span>
          <input type="password" name="password" [(ngModel)]="password" autocomplete="new-password" aria-describedby="reg-pw-hint" required>
          <small id="reg-pw-hint" class="muted small">Al menos 12 caracteres. Usa una frase de 3–4 palabras.</small>
        </label>
        <label class="check">
          <input type="checkbox" name="accept" [(ngModel)]="accept">
          <span>He leído y acepto la política de privacidad y el tratamiento de mis datos de sueño (datos de salud).</span>
        </label>
        <button class="btn btn-moon" type="submit" [disabled]="busy() || !canSubmit()">{{ busy() ? 'Creando…' : 'Crear mi cuenta' }}</button>
      </form>
    </section>
  `,
})
export class RegisterComponent {
  private auth = inject(AuthService);
  private errorEl = viewChild<ElementRef<HTMLElement>>('errorMsg');

  readonly invite = input.required<string>();
  /** Se emite si el registro termina (la sesión ya está iniciada). */
  readonly done = output<void>();

  readonly notice = OPERATOR_NOTICE;
  readonly sections = POLICY_SECTIONS;
  displayName = '';
  email = '';
  password = '';
  accept = false;
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  canSubmit(): boolean {
    return !!this.displayName.trim() && !!this.email && [...this.password].length >= 12 && this.accept;
  }

  submit() {
    if (this.busy() || !this.canSubmit()) return;
    this.busy.set(true);
    this.error.set(null);
    this.auth.register({ invite: this.invite(), display_name: this.displayName, email: this.email, password: this.password }).subscribe({
      next: () => {
        this.busy.set(false);
        this.done.emit();
      },
      error: (e: HttpErrorResponse) => {
        this.busy.set(false);
        this.error.set(e.error?.error ?? 'No se pudo crear la cuenta. Inténtalo de nuevo.');
        queueMicrotask(() => this.errorEl()?.nativeElement.focus());
      },
    });
  }
}

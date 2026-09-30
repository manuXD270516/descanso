import { Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/auth.service';

/** Pantalla "Entrar" (feature 004, US1). */
@Component({
  selector: 'app-login',
  imports: [FormsModule],
  templateUrl: './login.component.html',
  styleUrl: './auth.css',
})
export class LoginComponent {
  private auth = inject(AuthService);
  private errorEl = viewChild<ElementRef<HTMLElement>>('errorMsg');

  email = '';
  password = '';
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  submit() {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    this.auth.login(this.email, this.password).subscribe({
      next: () => this.busy.set(false),
      error: (e: HttpErrorResponse) => {
        this.busy.set(false);
        this.password = '';
        this.error.set(e.error?.error ?? 'No se pudo entrar. Inténtalo de nuevo.');
        queueMicrotask(() => this.errorEl()?.nativeElement.focus());
      },
    });
  }
}

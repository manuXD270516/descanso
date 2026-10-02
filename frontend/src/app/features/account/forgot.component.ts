import { Component, output } from '@angular/core';

/**
 * "¿Olvidaste tu contraseña?" (feature 008, FR-017): el mismo mensaje siempre, sin consultar al
 * servidor, así no revela si una cuenta existe.
 */
@Component({
  selector: 'app-forgot',
  styleUrl: './account.css',
  template: `
    <section class="panel account-card" aria-labelledby="forgot-title">
      <h2 id="forgot-title">¿Olvidaste tu contraseña?</h2>
      <p>
        Pide a quien administra Descanso un <strong>enlace de recuperación</strong>. Es de un solo uso y
        caduca a los 30 minutos. Al usarlo eliges una contraseña nueva y se cierran tus sesiones abiertas.
      </p>
      <p class="muted small">Si administras Descanso tú, sigue el runbook "recuperar acceso" (cambiar el código de alta en Fly).</p>
      <button class="btn btn-ghost" type="button" (click)="back.emit()">Volver a Entrar</button>
    </section>
  `,
})
export class ForgotComponent {
  readonly back = output<void>();
}

import { afterRenderEffect, Component, effect, ElementRef, inject, viewChild } from '@angular/core';
import { AuthService } from '../../core/auth.service';
import { ConfirmService } from './confirm.service';

/**
 * Diálogo de confirmación compartido (feature 014): un `<dialog>` modal montado una vez en la app.
 * El navegador da capa superior, fondo inerte, Esc y devolución del foco; aquí solo se abre, se cierra
 * y se traduce `returnValue` al resultado de `ConfirmService.ask()`.
 */
@Component({
  selector: 'app-confirm-dialog',
  template: `
    <dialog #dialog class="confirm" closedby="closerequest"
            aria-labelledby="confirm-title" aria-describedby="confirm-body" (close)="onClose()">
      @if (confirm.current(); as req) {
        <form method="dialog" class="confirm-form">
          <h2 id="confirm-title">{{ req.title }}</h2>
          <p id="confirm-body" class="muted">{{ req.body }}</p>
          <div class="confirm-actions">
            <button type="submit" value="keep" class="btn" autofocus>Conservar</button>
            <button type="submit" value="confirm" class="btn btn-danger-solid">{{ req.confirmLabel ?? 'Borrar' }}</button>
          </div>
        </form>
      }
    </dialog>
  `,
})
export class ConfirmDialogComponent {
  readonly confirm = inject(ConfirmService);
  private readonly auth = inject(AuthService);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    // Con el diálogo abierto, si la sesión deja de estar autenticada se cancela
    effect(() => {
      if (this.auth.state() !== 'authenticated') this.confirm.settle(false);
    });
    // Abre o cierra el <dialog> según haya un pedido, una vez pintado su contenido
    afterRenderEffect(() => {
      const el = this.dialog().nativeElement;
      if (this.confirm.current()) {
        if (!el.open) {
          el.returnValue = '';
          el.showModal();
        }
      } else if (el.open) {
        el.close();
      }
    });
  }

  onClose(): void {
    this.confirm.settle(this.dialog().nativeElement.returnValue === 'confirm');
  }
}

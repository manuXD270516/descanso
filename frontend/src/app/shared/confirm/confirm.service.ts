import { Injectable, signal } from '@angular/core';

/** Pedido de confirmación (feature 014, contracts/confirm-dialog.md). */
export interface ConfirmRequest {
  /** "¿Borrar esta noche?" */
  title: string;
  /** "Se borra el registro de la noche del 3 mar. No se puede recuperar." */
  body: string;
  /** Texto del botón destructivo; por defecto "Borrar". */
  confirmLabel?: string;
}

interface PendingConfirm extends ConfirmRequest {
  resolve: (confirmed: boolean) => void;
}

/**
 * Sustituye a `confirm()`: pide confirmación con un diálogo modal propio y devuelve `true` solo si
 * la persona pulsa el botón destructivo. Esc, "Conservar" y cerrar la sesión resuelven `false`.
 */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  /** Pedido abierto; lo muestra `ConfirmDialogComponent`. */
  readonly current = signal<PendingConfirm | null>(null);

  ask(request: ConfirmRequest): Promise<boolean> {
    // Un pedido nuevo con otro abierto resuelve el anterior en "no"
    this.current()?.resolve(false);
    return new Promise<boolean>((resolve) => this.current.set({ ...request, resolve }));
  }

  /** Cierra el pedido abierto con el resultado dado (no hace nada si no hay ninguno). */
  settle(confirmed: boolean): void {
    const pending = this.current();
    if (!pending) return;
    this.current.set(null);
    pending.resolve(confirmed);
  }
}

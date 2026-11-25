import { Injectable, signal } from '@angular/core';

/**
 * Estado de la pestaña Noche que debe sobrevivir a cambiar de pestaña (Noche se recrea) pero no a
 * recargar la app (feature 006, US4): si la persona respondió "Aún no" al recordatorio de noche
 * abierta, no se vuelve a mostrar hasta la próxima apertura.
 */
@Injectable({ providedIn: 'root' })
export class NightUiService {
  readonly reminderDismissed = signal(false);
  /**
   * Feature 013: se abrió #noche-despertar (el aviso "¿Ya despertaste?"): Noche debe mostrar "Ya desperté" a la
   * vista y enfocarlo. Vive aquí porque Noche se recrea al cambiar de pestaña o tras entrar con la sesión cerrada.
   */
  readonly wakeIntent = signal(false);
}

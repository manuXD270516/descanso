import { Injectable, signal } from '@angular/core';

/**
 * Estado de la pestaña Noche que debe sobrevivir a cambiar de pestaña (Noche se recrea) pero no a
 * recargar la app (feature 006, US4): si la persona respondió "Aún no" al recordatorio de noche
 * abierta, no se vuelve a mostrar hasta la próxima apertura.
 */
@Injectable({ providedIn: 'root' })
export class NightUiService {
  readonly reminderDismissed = signal(false);
}

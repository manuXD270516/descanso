import { Component, computed, input } from '@angular/core';
import { NIGHT_NAMES, NIGHT_ORDER, ScheduleDay, minToTime } from '../../core/schedule';

type Platform = 'android' | 'iphone';

/** Plataforma por el agente de usuario; si no se reconoce, Android (la de la persona usuaria, P5). */
export function detectPlatform(userAgent: string): Platform {
  return /iPhone|iPad|iPod/i.test(userAgent) ? 'iphone' : 'android';
}

/**
 * Guía para añadir el horario al calendario del móvil (feature 010, US2, FR-011). Dice lo que se midió
 * en el spike (specs/010-horario-recordatorios/spike/README.md), no lo que se supone:
 * - Google Calendar (Android): importa con "Añadir todo" y actualiza al reimportar, pero el aviso lo
 *   pone la notificación por defecto del calendario de destino, no el archivo.
 * - Calendarios de fabricante: importan un evento cada vez, duplican al reimportar y usan su
 *   recordatorio por defecto.
 * - iPhone: sin verificar.
 */
@Component({
  selector: 'app-calendar-guide',
  template: `
    <div class="guide">
      @for (p of order(); track p) {
        @if (p === 'android') {
          <details class="platform" [open]="order()[0] === 'android'">
            <summary>Android</summary>
            <h4>Con Google Calendar <span class="small muted">(comprobado)</span></h4>
            <ol>
              <li>Antes de importar, crea un calendario "Descanso" en calendar.google.com (Configuración → Añadir calendario → Crear un calendario).</li>
              <li>En la configuración de ese calendario, pon como <strong>notificación por defecto {{ leadMin() }} minutos antes</strong>. Google Calendar usa esa notificación, no la del archivo.</li>
              <li>Abre el archivo descargado con Google Calendar, elige el calendario "Descanso" y pulsa <strong>"Añadir todo"</strong>.</li>
              <li>Si cambias tu horario, descarga el archivo otra vez e impórtalo igual: los eventos se actualizan, sin duplicarse.</li>
            </ol>
            <h4>Con el calendario de tu móvil (Samsung, Xiaomi, Huawei…) <span class="small muted">(comprobado en un calendario de Android estándar)</span></h4>
            <ul>
              <li>Puede importar <strong>un solo evento cada vez</strong>: revisa que estén todas tus noches.</li>
              <li>Al reimportar <strong>duplica</strong> los eventos: borra los anteriores antes de importar el archivo nuevo.</li>
              <li>Usa su propio recordatorio: ajústalo a {{ leadMin() }} minutos en cada evento.</li>
              <li>Si no avisa a la hora, en Ajustes → Aplicaciones → tu calendario, permite <strong>"Alarmas y recordatorios"</strong>.</li>
            </ul>
          </details>
        } @else {
          <details class="platform" [open]="order()[0] === 'iphone'">
            <summary>iPhone</summary>
            <p class="small muted">Sin comprobar en un iPhone real.</p>
            <ol>
              <li>Abre el archivo descargado (desde Archivos o el correo).</li>
              <li>Pulsa <strong>"Añadir todo"</strong> y elige el calendario.</li>
              <li>Si cambias tu horario, importa el archivo nuevo: debería actualizar los eventos. Si se duplican, borra los anteriores.</li>
            </ol>
          </details>
        }
      }
      <div class="notice small" role="note">
        <p><strong>Ojo con el modo descanso o No molestar:</strong> si empieza antes del aviso, el calendario no sonará.</p>
        <p>Otra opción: crea una alarma que se repita en el reloj del móvil con estas horas:</p>
        <ul class="times">
          @for (line of alarmTimes(); track line) { <li>{{ line }}</li> }
        </ul>
        <p>Para silenciar el horario unos días, hazlo desde el propio calendario.</p>
      </div>
    </div>
  `,
  styles: `
    .guide { display: grid; gap: 0.6rem; }
    .platform summary { cursor: pointer; font-weight: 600; }
    .platform h4 { margin: 0.6rem 0 0.3rem; font-size: 0.95rem; }
    .platform ol, .platform ul { margin: 0.2rem 0 0 1.2rem; padding: 0; display: grid; gap: 0.25rem; }
    .notice { border-left: 3px solid var(--line); padding-left: 0.6rem; display: grid; gap: 0.3rem; }
    .times { margin: 0 0 0 1.2rem; padding: 0; }
  `,
})
export class CalendarGuideComponent {
  readonly days = input<ScheduleDay[]>([]);
  readonly leadMin = input(30);
  /** Agente de usuario (inyectable en las pruebas). */
  readonly userAgent = input(typeof navigator === 'undefined' ? '' : navigator.userAgent);

  readonly order = computed<Platform[]>(() => (detectPlatform(this.userAgent()) === 'iphone' ? ['iphone', 'android'] : ['android', 'iphone']));

  /** Hora de la alarma alternativa (acostarse − aviso) por noche activa, en frases. */
  readonly alarmTimes = computed(() =>
    NIGHT_ORDER.map((w) => this.days().find((d) => d.weekday === w))
      .filter((d): d is ScheduleDay => !!d && d.active)
      .map((d) => {
        const alarm = (((d.bed_min - this.leadMin()) % 1440) + 1440) % 1440;
        return `Noche del ${NIGHT_NAMES[d.weekday]}: alarma a las ${minToTime(alarm)} (te acuestas a las ${minToTime(d.bed_min)})`;
      }),
  );
}

import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  KINDS, KIND_LABELS, PUSH_DELIVERY, PUSH_DENIED, PUSH_DOUBLE, PUSH_INTRO, PUSH_LIMITS, PUSH_NO_HEALTH, PUSH_NO_SCHEDULE, PUSH_REACTIVATE,
  PUSH_REACTIVATE_WHY, PUSH_TITLE, PUSH_UNAVAILABLE, PUSH_UNSUPPORTED, PUSH_UNSUPPORTED_ALT, PushDevice, PushKind, PushState, TEST_MESSAGES,
  blockState, reminderTimes,
} from '../../core/push';
import { DeviceInspection, PushPermissionError, PushService } from '../../core/push.service';
import { ScheduleVersion, localDay, minToTime, timeToMin } from '../../core/schedule';
import { fmtDateShort } from '../../core/time';

/**
 * Cuenta → Mi horario → "Avisos en este móvil" (feature 013): explicación previa, activar este móvil,
 * lista de dispositivos, un interruptor por tipo, "Silenciar hoy", "No molestar" y aviso de prueba.
 * El permiso del navegador solo se pide al pulsar "Activar avisos" (FR-001).
 */
@Component({
  selector: 'app-push-settings',
  template: `
    <section class="push" aria-labelledby="push-title">
      <h3 id="push-title">{{ title }}</h3>
      @if (!loaded()) {
        <p class="small muted" role="status">Cargando…</p>
      } @else {
        @switch (state()) {
          @case ('unsupported') {
            <p class="small" role="status">{{ unsupported }}</p>
            <p class="small muted">{{ unsupportedAlt }}</p>
          }
          @case ('unavailable') { <p class="small" role="status">{{ unavailable }}</p> }
          @default {
            <div id="push-explain" class="explain">
              <p class="small">{{ intro }}</p>
              @if (times(); as t) {
                <ul class="list-plain small times" aria-label="Tus avisos de hoy">
                  @for (x of t; track x.kind) { <li>{{ x.text }}</li> }
                </ul>
              } @else if (scheduleLoaded()) {
                <p class="small muted">Esta noche no tienes horario activo; los avisos llegarán las noches que sí lo tengan.</p>
              }
              <p class="small">{{ noHealth }}</p>
              <p class="small muted">{{ delivery }}</p>
              @if (!st()?.timezone) {
                <p class="small muted">Tus avisos usarán la zona horaria {{ browserZone }}.</p>
              }
              <p class="small muted">{{ double }}</p>
              <p class="small muted">{{ limits }}</p>
            </div>

            @switch (state()) {
              @case ('no_schedule') {
                <p class="small" role="status">{{ noSchedule }}.
                  <a href="#schedule-title" (click)="goToSchedule($event)">Mi horario</a></p>
                <button type="button" class="btn btn-moon" disabled aria-describedby="push-explain">Activar avisos</button>
              }
              @case ('denied') {
                <p class="small" role="status">{{ denied }}</p>
              }
              @case ('needs_reactivation') {
                <p class="small" role="status"><strong>{{ reactivate }}</strong>. {{ reactivateWhy }}</p>
                <button type="button" class="btn btn-moon" [disabled]="busy()" aria-describedby="push-explain" (click)="activate()">Activar avisos</button>
              }
              @case ('off') {
                <button type="button" class="btn btn-moon" [disabled]="busy()" aria-describedby="push-explain" (click)="activate()">Activar avisos</button>
              }
              @case ('on') {
                <p class="small" role="status">Avisos activados en este móvil.</p>
              }
            }
          }
        }
        @if (message()) { <p class="small" role="status">{{ message() }}</p> }
        @if (error()) { <p class="error" role="alert">{{ error() }}</p> }

        @if (state() !== 'unsupported' && state() !== 'unavailable') {
          @if (devices().length) {
            <h4 id="push-devices">Móviles con avisos</h4>
            <ul class="list-plain devices" aria-labelledby="push-devices">
              @for (d of devices(); track d.id) {
                <li class="row device">
                  <span>{{ d.label }} · activado el {{ activated(d) }}
                    @if (isThis(d)) { <strong class="badge">Este móvil</strong> }</span>
                  <button type="button" class="btn btn-ghost btn-sm" [disabled]="busy()" [attr.aria-label]="'Quitar ' + d.label" (click)="remove(d)">Quitar</button>
                </li>
              }
            </ul>

            <fieldset class="kinds">
              <legend class="small">Qué avisos quiero recibir</legend>
              @for (k of kinds; track k) {
                <label class="row check">
                  <input type="checkbox" [checked]="st()!.preferences.kinds[k]" [disabled]="busy()" (change)="toggleKind(k, $any($event.target).checked)">
                  <span>{{ kindText(k) }}</span>
                </label>
              }
            </fieldset>

            <div class="mute">
              @if (muted()) {
                <p class="small" role="status">Avisos silenciados hasta mañana.</p>
                <button type="button" class="btn btn-ghost btn-sm" [disabled]="busy()" (click)="mute(false)">Deshacer</button>
              } @else {
                <button type="button" class="btn btn-sm" [disabled]="busy()" (click)="mute(true)">Silenciar hoy</button>
                <span class="small muted">Sin avisos esta noche; mañana vuelven.</span>
              }
            </div>

            <fieldset class="dnd">
              <legend class="small">No molestar</legend>
              <label class="row check">
                <input type="checkbox" [checked]="dndOn()" [disabled]="busy()" (change)="toggleDnd($any($event.target).checked)">
                <span>No enviarme avisos en esta franja</span>
              </label>
              @if (dndOn()) {
                <div class="row wrap">
                  <label class="field"><span>Desde</span><input type="time" name="dndStart" [value]="dndStart()" (input)="dndStart.set($any($event.target).value)"></label>
                  <label class="field"><span>Hasta</span><input type="time" name="dndEnd" [value]="dndEnd()" (input)="dndEnd.set($any($event.target).value)"></label>
                  <button type="button" class="btn btn-sm" [disabled]="busy()" (click)="saveDnd()">Guardar franja</button>
                </div>
                <p class="small muted">Puede cruzar la medianoche. Los avisos que caigan dentro no se envían ni se aplazan.</p>
              }
            </fieldset>

            @if (thisDevice()) {
              <div class="row wrap">
                <button type="button" class="btn btn-sm" [disabled]="busy()" (click)="test()">Enviarme un aviso de prueba</button>
              </div>
            }
          }
          @if (testMessage()) { <p class="small" role="status">{{ testMessage() }}</p> }
        }
      }
    </section>
  `,
  styles: `
    .push { display: grid; gap: 0.6rem; }
    h3 { margin-top: 0.6rem; font-size: 1.05rem; }
    h4 { margin: 0.4rem 0 0; font-size: 0.95rem; font-weight: 600; }
    .explain { display: grid; gap: 0.35rem; }
    .list-plain { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.5rem; }
    .times { display: flex; gap: 0.4rem 1.2rem; flex-wrap: wrap; font-weight: 600; }
    .device { justify-content: space-between; gap: 0.6rem; align-items: center; flex-wrap: wrap; }
    .badge { margin-left: 0.4rem; padding: 0.05rem 0.5rem; border: 1px solid var(--moon); border-radius: 999px; font-size: 0.8rem; font-weight: 600; color: var(--moon); }
    fieldset { border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 0.5rem 0.8rem; display: grid; gap: 0.4rem; margin: 0; }
    legend { padding: 0 0.3rem; color: var(--ink-dim); }
    .check { gap: 0.5rem; align-items: center; }
    .wrap { flex-wrap: wrap; align-items: end; }
    .mute { display: flex; gap: 0.6rem; align-items: center; flex-wrap: wrap; }
    input[type=time] { width: 8rem; background: var(--night); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 0.45rem 0.6rem; color: var(--ink); }
  `,
})
export class PushSettingsComponent implements OnInit {
  private push = inject(PushService);

  /** Horario vigente y "Avisarme antes" de Mi horario: de aquí salen las horas de hoy (FR-002). */
  readonly version = input<ScheduleVersion | null>(null);
  readonly leadMin = input(30);
  readonly scheduleLoaded = input(false);

  readonly loaded = signal(false);
  readonly st = signal<PushState | null>(null);
  private readonly inspection = signal<DeviceInspection>({ subscribed: false, keyMatches: false, fingerprint: null });
  readonly busy = signal(false);
  readonly message = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly testMessage = signal<string | null>(null);
  readonly dndStart = signal('23:00');
  readonly dndEnd = signal('07:00');
  private readonly dndEditing = signal(false);

  readonly kinds = KINDS;
  readonly title = PUSH_TITLE;
  readonly intro = PUSH_INTRO;
  readonly noHealth = PUSH_NO_HEALTH;
  readonly delivery = PUSH_DELIVERY;
  readonly double = PUSH_DOUBLE;
  readonly limits = PUSH_LIMITS;
  readonly unsupported = PUSH_UNSUPPORTED;
  readonly unsupportedAlt = PUSH_UNSUPPORTED_ALT;
  readonly unavailable = PUSH_UNAVAILABLE;
  readonly noSchedule = PUSH_NO_SCHEDULE;
  readonly denied = PUSH_DENIED;
  readonly reactivate = PUSH_REACTIVATE;
  readonly reactivateWhy = PUSH_REACTIVATE_WHY;
  readonly browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  readonly devices = computed(() => this.st()?.devices ?? []);
  readonly times = computed(() => reminderTimes(this.version(), new Date().getDay(), this.leadMin()));
  readonly thisDevice = computed(() => this.devices().find((d) => d.fingerprint === this.inspection().fingerprint) ?? null);
  readonly state = computed(() =>
    blockState({
      supported: this.push.isSupported(),
      available: this.st()?.available ?? false,
      hasSchedule: !!this.version()?.days.some((d) => d.active),
      permission: this.push.permission(),
      subscribed: this.inspection().subscribed,
      keyMatches: this.inspection().keyMatches,
      listed: !!this.thisDevice(),
    }),
  );
  readonly muted = computed(() => {
    const until = this.st()?.preferences.muted_until;
    return !!until && until >= localDay(new Date());
  });
  readonly dndOn = computed(() => this.dndEditing() || !!this.st()?.preferences.dnd);

  ngOnInit() {
    void this.refresh();
  }

  isThis = (d: PushDevice) => d.fingerprint === this.inspection().fingerprint;
  activated = (d: PushDevice) => fmtDateShort(localDay(new Date(d.created_at)));
  kindText = (k: PushKind) => this.times()?.find((t) => t.kind === k)?.text ?? KIND_LABELS[k];

  /** Vuelve a leer el estado del servidor y de este navegador (sin pedir ningún permiso). */
  async refresh() {
    this.push.refreshPermission();
    try {
      const st = await firstValueFrom(this.push.state());
      this.st.set(st);
      this.inspection.set(await this.push.inspect(st.public_key));
      const dnd = st.preferences.dnd;
      if (dnd) { this.dndStart.set(minToTime(dnd.start_min)); this.dndEnd.set(minToTime(dnd.end_min)); this.dndEditing.set(false); }
    } catch (e) {
      this.error.set(this.messageOf(e, 'No se pudo cargar el estado de los avisos.'));
    }
    this.loaded.set(true);
  }

  private messageOf(e: unknown, fallback: string): string {
    return e instanceof HttpErrorResponse ? e.error?.error ?? fallback : fallback;
  }

  /** Corre una acción con el bloque ocupado y los mensajes limpios. */
  private async run(action: () => Promise<void>, fallback: string) {
    this.busy.set(true);
    this.error.set(null);
    this.message.set(null);
    this.testMessage.set(null);
    try {
      await action();
    } catch (e) {
      this.error.set(this.messageOf(e, fallback));
    }
    this.busy.set(false);
  }

  /** "Activar avisos": explica, pide el permiso y registra este móvil (2 toques, SC-008). */
  async activate() {
    const st = this.st();
    if (!st?.public_key) return;
    await this.run(async () => {
      try {
        await this.push.enable(st.public_key!, st.timezone ? undefined : this.browserZone);
      } catch (e) {
        if (!(e instanceof PushPermissionError)) throw e;
        if (e.permission !== 'denied') this.message.set('No se concedió el permiso. Puedes volver a intentarlo cuando quieras.');
      }
      await this.refresh();
    }, 'No se pudieron activar los avisos.');
  }

  async remove(d: PushDevice) {
    await this.run(async () => {
      await this.push.disable(d.id, this.isThis(d));
      await this.refresh();
    }, 'No se pudo quitar el dispositivo.');
  }

  async toggleKind(kind: PushKind, checked: boolean) {
    await this.run(async () => {
      const preferences = await firstValueFrom(this.push.savePreferences({ kinds: { [kind]: checked } }));
      this.st.update((s) => (s ? { ...s, preferences } : s));
    }, 'No se pudo guardar el cambio.');
  }

  async mute(on: boolean) {
    await this.run(async () => {
      const preferences = await firstValueFrom(this.push.savePreferences({ mute_today: on }));
      this.st.update((s) => (s ? { ...s, preferences } : s));
    }, 'No se pudo guardar el cambio.');
  }

  async toggleDnd(on: boolean) {
    if (on) { this.dndEditing.set(true); return; }
    this.dndEditing.set(false);
    await this.run(async () => {
      const preferences = await firstValueFrom(this.push.savePreferences({ dnd: null }));
      this.st.update((s) => (s ? { ...s, preferences } : s));
    }, 'No se pudo guardar el cambio.');
  }

  async saveDnd() {
    const start_min = timeToMin(this.dndStart());
    const end_min = timeToMin(this.dndEnd());
    if (start_min === null || end_min === null) { this.error.set('Indica la hora de inicio y la de fin.'); return; }
    await this.run(async () => {
      const preferences = await firstValueFrom(this.push.savePreferences({ dnd: { start_min, end_min } }));
      this.st.update((s) => (s ? { ...s, preferences } : s));
      this.message.set('Franja guardada.');
    }, 'No se pudo guardar la franja.');
  }

  /** Aviso de prueba al dispositivo actual (FR-020). */
  async test() {
    const device = this.thisDevice();
    if (!device) return;
    await this.run(async () => {
      try {
        const { result } = await firstValueFrom(this.push.sendTest(device.id));
        this.push.refreshPermission();
        // Con el permiso retirado, el servicio de avisos responde que el dispositivo caducó
        this.testMessage.set(this.push.permission() === 'denied' ? TEST_MESSAGES.denied : TEST_MESSAGES[result]);
        if (result === 'expired') await this.refresh();
      } catch (e) {
        if (e instanceof HttpErrorResponse && e.status === 429) { this.testMessage.set(e.error?.error ?? 'Espera un momento antes de probar otra vez'); return; }
        throw e;
      }
    }, 'No se pudo enviar.');
  }

  /** El bloque vive dentro de Mi horario: el enlace lleva al editor del horario. */
  goToSchedule(event: Event) {
    event.preventDefault();
    const heading = document.getElementById('schedule-title');
    heading?.setAttribute('tabindex', '-1');
    heading?.scrollIntoView({ block: 'start' });
    heading?.focus();
  }
}

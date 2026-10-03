import { Component, OnInit, inject, output, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { AccountService, Activity, Profile } from '../../core/account.service';
import { AuthService } from '../../core/auth.service';
import { GoalEditorComponent } from '../trends/goal-editor.component';
import { CycleSettingsComponent } from '../night/cycle-settings.component';

const ACTIONS: Record<Activity['action'], string> = {
  reset_link_created: 'generó un enlace de recuperación',
  password_reset: 'tu contraseña se restableció con un enlace de',
};

/** Mi perfil (feature 008, US3–US5). */
@Component({
  selector: 'app-profile',
  imports: [FormsModule, GoalEditorComponent, CycleSettingsComponent],
  templateUrl: './profile.component.html',
  styleUrl: './account.css',
})
export class ProfileComponent implements OnInit {
  private account = inject(AccountService);
  private auth = inject(AuthService);

  /** La cuenta se borró: la app vuelve a "Entrar". */
  readonly deleted = output<void>();

  readonly profile = signal<Profile | null>(null);
  readonly activity = signal<Activity[]>([]);
  readonly message = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly tzProposed = signal(false);
  readonly timezones = Intl.supportedValuesOf('timeZone');

  displayName = '';
  timezone = '';
  newEmail = '';
  emailPassword = '';
  currentPassword = '';
  newPassword = '';
  deletePassword = '';
  deleteConfirm = false;

  ngOnInit() {
    this.account.me().subscribe({ next: (p) => this.load(p), error: (e) => this.fail(e) });
    this.account.activity().subscribe({ next: (a) => this.activity.set(a) });
  }

  /** Ajustes de ciclo guardados (feature 006): los atajos del objetivo usan el ciclo nuevo sin recargar el formulario. */
  cycleChanged(s: { cycleMin: number; latencyMin: number }) {
    this.profile.update((p) => p && { ...p, cycle_min: s.cycleMin, latency_min: s.latencyMin });
  }

  private load(p: Profile) {
    this.profile.set(p);
    this.displayName = p.display_name ?? '';
    this.tzProposed.set(!p.timezone);
    this.timezone = p.timezone ?? (Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
    this.newEmail = p.email;
  }

  actionText(a: Activity): string {
    return ACTIONS[a.action];
  }

  saveProfile() {
    // El objetivo se guarda con su propio editor (ciclos, feature 005)
    this.run(this.account.updateProfile({ display_name: this.displayName, timezone: this.timezone }), (p) => {
      this.load(p as Profile);
      this.auth.displayName.set((p as Profile).display_name);
      this.ok('Perfil guardado.');
    });
  }

  saveEmail() {
    this.run(this.account.changeEmail(this.newEmail, this.emailPassword), (p) => {
      this.load(p as Profile);
      this.auth.email.set((p as Profile).email);
      this.emailPassword = '';
      this.ok('Email actualizado.');
    });
  }

  savePassword() {
    this.run(this.account.changePassword(this.currentPassword, this.newPassword), () => {
      this.currentPassword = '';
      this.newPassword = '';
      this.ok('Contraseña cambiada. Se cerraron tus otras sesiones.');
    });
  }

  deleteAccount() {
    this.run(this.account.deleteAccount(this.deletePassword), () => {
      this.auth.loggedOut();
      this.deleted.emit();
    });
  }

  private run<T>(obs: import('rxjs').Observable<T>, done: (v: T) => void) {
    this.error.set(null);
    this.message.set(null);
    obs.subscribe({ next: done, error: (e) => this.fail(e) });
  }

  private ok(text: string) {
    this.message.set(text);
  }

  private fail(e: HttpErrorResponse) {
    this.error.set(e.error?.error ?? 'No se pudo guardar. Inténtalo de nuevo.');
  }
}

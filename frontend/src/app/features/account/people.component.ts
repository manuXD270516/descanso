import { Component, OnInit, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { AccountService, Invite, Person } from '../../core/account.service';
import { linkFor } from '../../core/link-tokens';

/** Personas (feature 008): solo el propietario. Invitaciones y enlaces de recuperación; sin datos de salud. */
@Component({
  selector: 'app-people',
  styleUrl: './account.css',
  template: `
    <section class="panel account-card" aria-labelledby="people-title">
      <h2 id="people-title">Personas</h2>
      <p class="muted small">Desde aquí invitas a alguien o le das un enlace para recuperar su contraseña. No ves sus datos.</p>
      @if (error()) { <p class="error" role="alert">{{ error() }}</p> }

      <div class="row-actions">
        <button class="btn btn-moon" type="button" (click)="invite()">Invitar a alguien</button>
      </div>

      @if (link(); as l) {
        <div class="link-box notice" role="status">
          <span class="small">{{ l.label }} (válido hasta {{ l.until }}). Envíaselo por el medio que prefieras:</span>
          <input type="text" readonly [value]="l.url" aria-label="Enlace para compartir" (focus)="$any($event.target).select()">
          <button class="btn btn-sm" type="button" (click)="copy(l.url)">{{ copied() ? 'Copiado' : 'Copiar enlace' }}</button>
        </div>
      }

      <h3>Quién usa Descanso</h3>
      <ul class="list-plain">
        @for (p of people(); track p.id) {
          <li>
            <span>{{ p.display_name || p.email }} <span class="muted small">{{ p.role === 'owner' ? '(propietario)' : p.email }}</span></span>
            @if (p.role === 'user') {
              <button class="btn btn-ghost btn-sm" type="button" (click)="resetLink(p)">Enlace de recuperación</button>
            }
          </li>
        }
      </ul>

      <h3>Invitaciones</h3>
      @if (invites().length === 0) {
        <p class="muted small">Todavía no has invitado a nadie.</p>
      } @else {
        <ul class="list-plain small">
          @for (i of invites(); track i.id) {
            <li>
              <span>{{ i.created_at.slice(0, 10) }} · {{ i.status }}{{ i.used_by_name ? ' por ' + i.used_by_name : '' }}</span>
              @if (i.status === 'pendiente') {
                <button class="btn btn-ghost btn-sm btn-danger" type="button" (click)="revoke(i)">Revocar</button>
              }
            </li>
          }
        </ul>
      }
    </section>
  `,
})
export class PeopleComponent implements OnInit {
  private account = inject(AccountService);

  readonly people = signal<Person[]>([]);
  readonly invites = signal<Invite[]>([]);
  readonly link = signal<{ url: string; label: string; until: string } | null>(null);
  readonly copied = signal(false);
  readonly error = signal<string | null>(null);

  ngOnInit() {
    this.reload();
  }

  reload() {
    this.account.people().subscribe({ next: (p) => this.people.set(p), error: (e) => this.fail(e) });
    this.account.invites().subscribe({ next: (i) => this.invites.set(i) });
  }

  invite() {
    this.account.createInvite().subscribe({
      next: (r) => {
        this.show(linkFor('invitacion', r.token), 'Enlace de invitación, de un solo uso', r.expires_at);
        this.reload();
      },
      error: (e) => this.fail(e),
    });
  }

  resetLink(p: Person) {
    this.account.resetLink(p.id).subscribe({
      next: (r) => this.show(linkFor('restablecer', r.token), `Enlace de recuperación para ${p.display_name || p.email}`, r.expires_at),
      error: (e) => this.fail(e),
    });
  }

  revoke(i: Invite) {
    this.account.revokeInvite(i.id).subscribe({ next: () => this.reload(), error: (e) => this.fail(e) });
  }

  copy(url: string) {
    navigator.clipboard?.writeText(url).then(() => this.copied.set(true), () => undefined);
  }

  private show(url: string, label: string, expires: string) {
    this.copied.set(false);
    this.link.set({ url, label, until: new Date(expires).toLocaleString('es') });
  }

  private fail(e: HttpErrorResponse) {
    this.error.set(e.error?.error ?? 'No se pudo completar la acción.');
  }
}

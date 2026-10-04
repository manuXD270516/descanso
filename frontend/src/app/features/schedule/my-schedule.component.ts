import { Component, OnInit, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { AccountService } from '../../core/account.service';
import { Pause, ScheduleDay, ScheduleVersion, localDay } from '../../core/schedule';
import { ScheduleService } from '../../core/schedule.service';
import { addDays, fmtDateShort } from '../../core/time';
import { CalendarGuideComponent } from './calendar-guide.component';
import { ScheduleEditorComponent } from './schedule-editor.component';

/**
 * Cuenta → "Mi horario" (feature 010): horario (US1), calendario con aviso y guía (US2) y modo pausa
 * (US4). Guardar crea una versión vigente desde hoy; los días anteriores no cambian.
 */
@Component({
  selector: 'app-my-schedule',
  imports: [FormsModule, ScheduleEditorComponent, CalendarGuideComponent],
  template: `
    <section class="panel account-card" aria-labelledby="schedule-title">
      <h2 id="schedule-title">Mi horario</h2>
      @if (pause(); as p) {
        <div class="paused" role="status">
          <span>En pausa hasta el {{ fmtDateShort(p.end_date) }}.</span>
          <button type="button" class="btn btn-ghost btn-sm" (click)="endPause(p)">Terminar hoy</button>
        </div>
      }
      @if (loaded()) {
        <app-schedule-editor [goalMin]="goalMin()" [initial]="version()?.days ?? null" (changed)="draft.set($event)" />
        <div class="row wrap">
          <button type="button" class="btn" [disabled]="!draft() || busy()" (click)="save()">Guardar horario</button>
        </div>
        @if (saved()) { <p class="small" role="status">Horario guardado. Se aplica desde hoy; los días anteriores no cambian.</p> }
      }
      @if (error()) { <p class="error" role="alert">{{ error() }}</p> }

      <h3>Añadir a mi calendario</h3>
      <p class="small muted">El calendario del móvil te avisará antes de tu hora de acostarte, aunque Descanso esté cerrada. El archivo no contiene datos de tu sueño.</p>
      <div class="row wrap">
        <label class="field"><span>Avisarme antes (minutos)</span>
          <input type="number" name="lead" [(ngModel)]="lead" min="15" max="60" step="5">
        </label>
        <button type="button" class="btn btn-sm" (click)="saveLead()">Guardar aviso</button>
        @if (version()) {
          <a class="btn btn-moon" [href]="icsUrl" download="descanso-horario.ics">Añadir a mi calendario</a>
        } @else {
          <span class="small muted">Guarda tu horario para poder añadirlo.</span>
        }
      </div>
      @if (leadSaved()) { <p class="small" role="status">Aviso guardado. Descarga el archivo otra vez para actualizar tu calendario.</p> }
      @if (version(); as v) { <app-calendar-guide [days]="v.days" [leadMin]="leadMin()" /> }

      <h3>Modo pausa (viaje, malestar, turnos)</h3>
      <p class="small muted">Durante la pausa, Descanso no te avisa dentro de la app. Hasta 14 días, 2 pausas cada 30 días.</p>
      <div class="row wrap">
        <label class="field"><span>Desde</span><input type="date" name="pauseFrom" [(ngModel)]="pauseFrom" [min]="today"></label>
        <label class="field"><span>Hasta</span><input type="date" name="pauseTo" [(ngModel)]="pauseTo" [min]="pauseFrom"></label>
        <button type="button" class="btn btn-sm" (click)="createPause()" [disabled]="busy()">Activar pausa</button>
      </div>
      @if (pauseError()) { <p class="error" role="alert">{{ pauseError() }}</p> }
      @if (upcoming().length) {
        <ul class="list-plain small">
          @for (p of upcoming(); track p.id) {
            <li>Del {{ fmtDateShort(p.start_date) }} al {{ fmtDateShort(p.end_date) }}
              <button type="button" class="btn btn-ghost btn-sm" (click)="endPause(p)">{{ p.start_date > today ? 'Cancelar' : 'Terminar hoy' }}</button></li>
          }
        </ul>
      }
    </section>
  `,
  styles: `
    .account-card { display: grid; gap: 0.8rem; }
    .paused { display: flex; gap: 0.6rem; align-items: center; flex-wrap: wrap; }
    .wrap { flex-wrap: wrap; align-items: end; }
    .field input[type=number] { width: 6rem; }
    h3 { font-size: 1.05rem; margin-top: 0.6rem; }
  `,
})
export class MyScheduleComponent implements OnInit {
  private service = inject(ScheduleService);
  private account = inject(AccountService);

  readonly today = localDay(new Date());
  readonly icsUrl = this.service.icsUrl(this.today);
  readonly fmtDateShort = fmtDateShort;

  readonly version = signal<ScheduleVersion | null>(null);
  readonly pause = signal<Pause | null>(null);
  readonly upcoming = signal<Pause[]>([]);
  readonly goalMin = signal(420);
  readonly leadMin = signal(30);
  readonly draft = signal<ScheduleDay[] | null>(null);
  readonly loaded = signal(false);
  readonly busy = signal(false);
  readonly saved = signal(false);
  readonly leadSaved = signal(false);
  readonly error = signal<string | null>(null);
  readonly pauseError = signal<string | null>(null);
  lead = 30;
  pauseFrom = this.today;
  pauseTo = addDays(this.today, 4);

  ngOnInit() {
    this.account.me().subscribe({ next: (p) => this.goalMin.set(p.sleep_goal_min) });
    this.load();
  }

  private load() {
    this.service.get(this.today).subscribe({
      next: (s) => {
        this.version.set(s.version);
        this.pause.set(s.pause);
        this.leadMin.set(s.lead_min);
        this.lead = s.lead_min;
        this.loaded.set(true);
      },
      error: (e: HttpErrorResponse) => this.error.set(e.error?.error ?? 'No se pudo cargar tu horario.'),
    });
    this.service.pauses().subscribe({ next: (all) => this.upcoming.set(all.filter((p) => p.end_date >= this.today)) });
  }

  save() {
    const days = this.draft();
    if (!days) return;
    this.busy.set(true);
    this.saved.set(false);
    this.service.save(this.today, days).subscribe({
      next: (v) => { this.busy.set(false); this.version.set(v); this.saved.set(true); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.error.set(e.error?.error ?? 'No se pudo guardar.'); },
    });
  }

  saveLead() {
    this.leadSaved.set(false);
    this.account.updateProfile({ lead_min: Number(this.lead) }).subscribe({
      next: (p) => { this.leadMin.set(p.lead_min); this.leadSaved.set(true); this.error.set(null); },
      error: (e: HttpErrorResponse) => this.error.set(e.error?.error ?? 'No se pudo guardar el aviso.'),
    });
  }

  createPause() {
    this.pauseError.set(null);
    this.busy.set(true);
    this.service.createPause(this.today, this.pauseFrom, this.pauseTo).subscribe({
      next: () => { this.busy.set(false); this.load(); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.pauseError.set(e.error?.error ?? 'No se pudo activar la pausa.'); },
    });
  }

  endPause(p: Pause) {
    this.service.endPause(this.today, p.id).subscribe({ next: () => this.load() });
  }
}

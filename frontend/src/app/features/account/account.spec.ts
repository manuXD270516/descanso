import { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { authInterceptor } from '../../core/auth.interceptor';
import { AuthService } from '../../core/auth.service';
import { POLICY_VERSION, OPERATOR_NOTICE } from '../../core/privacy';
import { linkFor, readLinkTokens } from '../../core/link-tokens';
import { RegisterComponent } from './register.component';
import { ResetPasswordComponent } from './reset-password.component';
import { ForgotComponent } from './forgot.component';
import { PrivacyComponent } from './privacy.component';
import { ProfileComponent } from './profile.component';
import { PeopleComponent } from './people.component';

describe('Cuenta (feature 008)', () => {
  let http: HttpTestingController;
  let auth: AuthService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
  });
  afterEach(() => http.verify());

  const render = <T>(cmp: Type<T>, inputs: Record<string, unknown> = {}) => {
    const fixture = TestBed.createComponent(cmp);
    for (const [k, v] of Object.entries(inputs)) fixture.componentRef.setInput(k, v);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement, c: fixture.componentInstance };
  };

  describe('enlaces por fragmento (R4)', () => {
    it('lee #invitacion= y lo borra de la URL; compone enlaces con el fragmento', () => {
      const replaced: string[] = [];
      const loc = { hash: '#invitacion=abc123', pathname: '/', search: '' } as Location;
      const hist = { replaceState: (_s: unknown, _t: string, url: string) => replaced.push(url) } as unknown as History;
      expect(readLinkTokens(loc, hist)).toEqual({ invite: 'abc123', reset: null });
      expect(replaced).toEqual(['/']);
      expect(readLinkTokens({ hash: '', pathname: '/', search: '' } as Location, hist)).toEqual({ invite: null, reset: null });
      expect(linkFor('restablecer', 'tok', 'https://x.dev')).toBe('https://x.dev/#restablecer=tok');
    });
  });

  describe('RegisterComponent (US1, US6)', () => {
    it('muestra el texto honesto y exige aceptar la política y 12 caracteres', () => {
      const { fixture, el, c } = render(RegisterComponent, { invite: 'tok' });
      expect(el.textContent).toContain(OPERATOR_NOTICE);
      const button = el.querySelector('button[type="submit"]') as HTMLButtonElement;
      c.displayName = 'Ana';
      c.email = 'ana@x.com';
      c.password = 'una frase larga';
      fixture.detectChanges();
      expect(button.disabled).toBeTrue();
      c.accept = true;
      fixture.detectChanges();
      expect(button.disabled).toBeFalse();
    });

    it('envía la invitación en el cuerpo con la aceptación y la versión de la política', () => {
      const { c } = render(RegisterComponent, { invite: 'tok' });
      Object.assign(c, { displayName: 'Ana', email: 'ana@x.com', password: 'una frase larga', accept: true });
      let done = false;
      c.done.subscribe(() => (done = true));
      c.submit();
      const req = http.expectOne('/api/auth/register');
      expect(req.request.body).toEqual({ invite: 'tok', display_name: 'Ana', email: 'ana@x.com', password: 'una frase larga', accept_policy: true, policy_version: POLICY_VERSION });
      req.flush({ email: 'ana@x.com', role: 'user', display_name: 'Ana' }, { status: 201, statusText: 'Created' });
      expect(done).toBeTrue();
      expect(auth.role()).toBe('user');
    });

    it('una invitación no válida se muestra en role="alert"', () => {
      const { fixture, el, c } = render(RegisterComponent, { invite: 'mala' });
      Object.assign(c, { displayName: 'Ana', email: 'ana@x.com', password: 'una frase larga', accept: true });
      c.submit();
      http.expectOne('/api/auth/register').flush({ error: 'Esta invitación no es válida' }, { status: 403, statusText: 'Forbidden' });
      fixture.detectChanges();
      expect(el.querySelector('[role="alert"]')!.textContent).toContain('Esta invitación no es válida');
    });
  });

  it('ResetPasswordComponent envía token y contraseña y confirma (US4)', () => {
    const { fixture, el, c } = render(ResetPasswordComponent, { token: 'r1' });
    c.password = 'una contraseña nueva';
    c.submit();
    const req = http.expectOne('/api/auth/reset');
    expect(req.request.body).toEqual({ token: 'r1', password: 'una contraseña nueva' });
    req.flush(null, { status: 204, statusText: 'No Content' });
    fixture.detectChanges();
    expect(el.querySelector('[role="status"]')!.textContent).toContain('tu contraseña se cambió');
  });

  it('ForgotComponent muestra siempre el mismo mensaje y no llama al servidor (FR-017)', () => {
    const { el } = render(ForgotComponent);
    expect(el.textContent).toContain('enlace de recuperación');
  });

  it('PrivacyComponent muestra las secciones, el acceso del operador, los 14 días y la versión (US6)', () => {
    const { el } = render(PrivacyComponent);
    expect(el.textContent).toContain(OPERATOR_NOTICE);
    expect(el.textContent).toContain('14 días');
    expect(el.textContent).toContain(POLICY_VERSION);
  });

  describe('ProfileComponent (US3–US5)', () => {
    const profile = { id: 2, email: 'ana@x.com', role: 'user', display_name: 'Ana', timezone: null, sleep_goal_min: 450, consent_version: POLICY_VERSION, consent_at: 'x', created_at: 'x' };
    function load(overrides = {}) {
      const r = render(ProfileComponent);
      http.expectOne('/api/me').flush({ ...profile, ...overrides });
      http.expectOne('/api/me/activity').flush([{ action: 'password_reset', actor: 'Propietario', created_at: '2026-10-01T10:00:00.000Z' }]);
      r.fixture.detectChanges();
      return r;
    }

    it('propone la zona del navegador si no hay, y muestra objetivo (con ciclos) y actividad', () => {
      const { el, c } = load();
      expect(c.tzProposed()).toBeTrue();
      expect(c.timezone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
      expect(el.querySelector('app-goal-editor')!.textContent).toContain('7 h 30');
      expect(el.textContent).toContain('Propietario tu contraseña se restableció');
    });

    it('guarda nombre y zona (el objetivo va por su editor)', () => {
      const { c } = load({ timezone: 'Europe/Madrid' });
      Object.assign(c, { displayName: 'Inés' });
      c.saveProfile();
      const req = http.expectOne((r) => r.url === '/api/me' && r.method === 'PUT');
      expect(req.request.body).toEqual({ display_name: 'Inés', timezone: 'Europe/Madrid' });
      req.flush({ ...profile, display_name: 'Inés' });
      expect(auth.displayName()).toBe('Inés');
    });

    it('borrar la cuenta exige contraseña y confirmación; al terminar vuelve a "Entrar"', () => {
      const { fixture, el, c } = load();
      const button = Array.from(el.querySelectorAll('button')).find((b) => b.textContent!.includes('Borrar mi cuenta')) as HTMLButtonElement;
      expect(button.disabled).toBeTrue();
      Object.assign(c, { deletePassword: 'secreta', deleteConfirm: true });
      fixture.detectChanges();
      expect(button.disabled).toBeFalse();
      c.deleteAccount();
      const req = http.expectOne((r) => r.url === '/api/me' && r.method === 'DELETE');
      expect(req.request.body).toEqual({ password: 'secreta' });
      req.flush(null, { status: 204, statusText: 'No Content' });
      expect(auth.state()).toBe('login');
    });

    it('el 409 del propietario se muestra como error', () => {
      const { fixture, el, c } = load({ role: 'owner' });
      Object.assign(c, { deletePassword: 'x', deleteConfirm: true });
      c.deleteAccount();
      http.expectOne((r) => r.method === 'DELETE').flush({ error: 'No puedes borrar la cuenta del propietario mientras haya otras personas usando Descanso' }, { status: 409, statusText: 'Conflict' });
      fixture.detectChanges();
      expect(el.querySelector('[role="alert"]')!.textContent).toContain('otras personas');
    });
  });

  describe('PeopleComponent (US1, US4)', () => {
    function load() {
      const r = render(PeopleComponent);
      http.expectOne('/api/people').flush([
        { id: 1, display_name: 'Yo', email: 'yo@x.com', role: 'owner', created_at: 'x' },
        { id: 2, display_name: 'Ana', email: 'ana@x.com', role: 'user', created_at: 'x' },
      ]);
      http.expectOne('/api/people/invites').flush([{ id: 7, status: 'pendiente', created_at: '2026-10-01T00:00:00Z', expires_at: 'x', used_by_name: null }]);
      r.fixture.detectChanges();
      return r;
    }

    it('invitar muestra un enlace con #invitacion= para copiar', () => {
      const { fixture, el, c } = load();
      c.invite();
      http.expectOne((r) => r.url === '/api/people/invites' && r.method === 'POST').flush({ id: 8, token: 'tok', expires_at: '2026-10-04T00:00:00Z' });
      http.expectOne('/api/people').flush([]);
      http.expectOne('/api/people/invites').flush([]);
      fixture.detectChanges();
      expect((el.querySelector('input[readonly]') as HTMLInputElement).value).toBe(`${location.origin}/#invitacion=tok`);
    });

    it('solo los usuarios (no el propietario) tienen "Enlace de recuperación"; revocar llama a la API', () => {
      const { el, c } = load();
      expect(Array.from(el.querySelectorAll('button')).filter((b) => b.textContent!.includes('Enlace de recuperación')).length).toBe(1);
      c.revoke({ id: 7, status: 'pendiente', created_at: '', expires_at: '', used_by_name: null });
      http.expectOne((r) => r.url === '/api/people/invites/7' && r.method === 'DELETE').flush(null, { status: 204, statusText: 'No Content' });
      http.expectOne('/api/people').flush([]);
      http.expectOne('/api/people/invites').flush([]);
    });
  });
});

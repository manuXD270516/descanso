import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthService } from '../../core/auth.service';
import { authInterceptor } from '../../core/auth.interceptor';
import { LoginComponent } from './login.component';
import { SetupComponent } from './setup.component';

describe('Acceso (feature 004)', () => {
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

  describe('AuthService e interceptor', () => {
    it('refresh() refleja el estado del servidor', () => {
      auth.refresh();
      http.expectOne('/api/auth/status').flush({ state: 'setup', nights: 3 });
      expect(auth.state()).toBe('setup');
      expect(auth.nights()).toBe(3);
    });

    it('un 401 de la API marca "login", pero no uno de /api/auth/* (el formulario lo gestiona)', () => {
      auth.state.set('authenticated');
      const client = TestBed.inject(HttpClient);
      client.post('/api/auth/login', {}).subscribe({ error: () => undefined });
      http.expectOne('/api/auth/login').flush({ error: 'x' }, { status: 401, statusText: 'Unauthorized' });
      expect(auth.state()).toBe('authenticated');

      client.get('/api/sleep').subscribe({ error: () => undefined });
      http.expectOne('/api/sleep').flush({ error: 'x' }, { status: 401, statusText: 'Unauthorized' });
      expect(auth.state()).toBe('login');
    });
  });

  describe('LoginComponent', () => {
    function create() {
      const fixture = TestBed.createComponent(LoginComponent);
      fixture.detectChanges();
      return { fixture, el: fixture.nativeElement as HTMLElement, c: fixture.componentInstance };
    }

    it('usa autocomplete de usuario y contraseña actual', () => {
      const { el } = create();
      expect(el.querySelector('input[type="email"]')!.getAttribute('autocomplete')).toBe('username');
      expect(el.querySelector('input[type="password"]')!.getAttribute('autocomplete')).toBe('current-password');
    });

    it('entrar con éxito pasa a "authenticated"', () => {
      const { c } = create();
      c.email = 'yo@ejemplo.com';
      c.password = 'mi frase de doce o más';
      c.submit();
      const req = http.expectOne('/api/auth/login');
      expect(req.request.body).toEqual({ email: 'yo@ejemplo.com', password: 'mi frase de doce o más' });
      req.flush({ email: 'yo@ejemplo.com' });
      expect(auth.state()).toBe('authenticated');
      expect(auth.email()).toBe('yo@ejemplo.com');
    });

    it('un error se muestra en role="alert", limpia la contraseña y no envía dos veces', () => {
      const { fixture, el, c } = create();
      c.email = 'yo@ejemplo.com';
      c.password = 'equivocada';
      c.submit();
      c.submit(); // mientras está ocupado no reenvía
      http.expectOne('/api/auth/login').flush({ error: 'Email o contraseña incorrectos' }, { status: 401, statusText: 'Unauthorized' });
      fixture.detectChanges();
      expect(el.querySelector('[role="alert"]')!.textContent).toContain('Email o contraseña incorrectos');
      expect(c.password).toBe('');
      expect(c.busy()).toBeFalse();
    });
  });

  describe('SetupComponent', () => {
    function create(nights = 5) {
      auth.nights.set(nights);
      const fixture = TestBed.createComponent(SetupComponent);
      fixture.detectChanges();
      return { fixture, el: fixture.nativeElement as HTMLElement, c: fixture.componentInstance };
    }

    it('muestra "Tus N noches están a salvo" (singular con 1)', () => {
      expect(create(5).el.textContent).toContain('Tus 5 noches están a salvo');
    });

    it('el botón exige 12 caracteres reales (con acentos) y el código usa autocomplete="off"', () => {
      const { fixture, el, c } = create();
      const button = el.querySelector('button[type="submit"]') as HTMLButtonElement;
      c.token = 'código';
      c.email = 'yo@ejemplo.com';
      c.password = 'ñandú lúcid';
      fixture.detectChanges();
      expect(button.disabled).toBeTrue();
      expect(el.querySelector('#password-hint')!.textContent).toContain('llevas 11');
      c.password = 'ñandú lúcido';
      fixture.detectChanges();
      expect(button.disabled).toBeFalse();
      expect(el.querySelector('input[name="token"]')!.getAttribute('autocomplete')).toBe('off');
      expect(el.querySelector('input[name="password"]')!.getAttribute('autocomplete')).toBe('new-password');
    });

    it('envía el código en el cuerpo, nunca en la URL, y entra al terminar (US2-2, US2-8)', () => {
      const { c } = create();
      c.token = 'mi-codigo';
      c.email = 'yo@ejemplo.com';
      c.password = 'mi frase de doce o más';
      c.submit();
      const req = http.expectOne('/api/auth/setup');
      expect(req.request.urlWithParams).toBe('/api/auth/setup');
      expect(req.request.body.token).toBe('mi-codigo');
      req.flush({ email: 'yo@ejemplo.com' }, { status: 201, statusText: 'Created' });
      expect(auth.state()).toBe('authenticated');
    });
  });
});

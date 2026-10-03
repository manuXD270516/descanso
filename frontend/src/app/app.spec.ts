import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { App } from './app';
import { authInterceptor } from './core/auth.interceptor';

describe('App', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [App],
      providers: [provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  /** Crea la app y responde al estado de acceso y a la salud. */
  function render(status: object, health: object | null = { ok: true, time: '', version: 'dev' }) {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    http.expectOne('/api/auth/status').flush(status);
    const h = http.expectOne('/api/health');
    if (health) h.flush(health);
    else h.flush(null, { status: 500, statusText: 'Error' });
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }
  const authenticated = { state: 'authenticated', email: 'yo@ejemplo.com' };

  it('muestra las pestañas Noche, Tendencias, Siestas y Métricas, con la activa marcada (FR-027, feature 005)', () => {
    const { fixture, el } = render(authenticated);
    const tabs = Array.from(el.querySelectorAll('nav.tabs button'));
    expect(tabs.map((t) => t.textContent!.trim())).toEqual(['Noche', 'Tendencias', 'Siestas', 'Métricas']);
    expect(tabs[0].getAttribute('aria-current')).toBe('page');
    expect(el.querySelector('app-night')).not.toBeNull();

    (tabs[2] as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(tabs[2].getAttribute('aria-current')).toBe('page');
    expect(tabs[0].getAttribute('aria-current')).toBeNull();
    expect(el.querySelector('app-naps')).not.toBeNull();
    expect(el.querySelector('app-night')).toBeNull();
  });

  describe('compuerta de acceso (feature 004)', () => {
    it('sin sesión muestra "Entrar" y ningún dato ni pestañas (US1-1)', () => {
      const { el } = render({ state: 'login' });
      expect(el.querySelector('app-login')).not.toBeNull();
      expect(el.querySelector('nav.tabs')).toBeNull();
      expect(el.querySelector('app-night')).toBeNull();
    });

    it('sin contraseña muestra "Crea tu contraseña" (US2-1)', () => {
      const { el } = render({ state: 'setup', nights: 12 });
      expect(el.querySelector('app-setup')!.textContent).toContain('Tus 12 noches están a salvo');
    });

    it('si el servidor no responde, avisa de la conexión (no pide entrar) y permite reintentar', () => {
      const fixture = TestBed.createComponent(App);
      fixture.detectChanges();
      http.expectOne('/api/auth/status').error(new ProgressEvent('error'));
      http.expectOne('/api/health').error(new ProgressEvent('error'));
      fixture.detectChanges();
      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('[role="alert"]')!.textContent).toContain('No se pudo conectar con el servidor');
      expect(el.querySelector('app-login')).toBeNull();
      (Array.from(el.querySelectorAll('button')).find((b) => b.textContent!.includes('Reintentar')) as HTMLButtonElement).click();
      http.expectOne('/api/auth/status').flush({ state: 'login' });
      fixture.detectChanges();
      expect(el.querySelector('app-login')).not.toBeNull();
    });

    it('sin código de alta explica qué configurar, sin datos (US2-7)', () => {
      const { el } = render({ state: 'setup-unavailable' });
      expect(el.querySelector('[role="status"]')!.textContent).toContain('Falta configurar el código de alta');
      expect(el.querySelector('nav.tabs')).toBeNull();
    });

    it('un 401 de la API vuelve a "Entrar" y conserva la pestaña al volver (caso límite)', () => {
      const { fixture, el } = render(authenticated);
      (Array.from(el.querySelectorAll('nav.tabs button'))[3] as HTMLButtonElement).click();
      fixture.detectChanges();
      // La pestaña Métricas pide datos: la sesión caducó
      for (const req of http.match((r) => r.url.startsWith('/api/metrics'))) req.flush({ error: 'Necesitas iniciar sesión' }, { status: 401, statusText: 'Unauthorized' });
      fixture.detectChanges();
      expect(el.querySelector('app-login')).not.toBeNull();

      fixture.componentInstance.auth.state.set('authenticated');
      fixture.detectChanges();
      expect(el.querySelector('app-metrics')).not.toBeNull();
    });

    it('el menú Cuenta ofrece las 5 exportaciones y cerrar sesión (US5, FR-004)', () => {
      const { fixture, el } = render(authenticated);
      const links = Array.from(el.querySelectorAll<HTMLAnchorElement>('.account-exports a'));
      expect(links.map((a) => a.getAttribute('href'))).toEqual([
        '/api/export.json', '/api/export/noches.csv', '/api/export/siestas.csv', '/api/export/metricas.csv', '/api/export/valores.csv',
      ]);
      expect(links.every((a) => a.hasAttribute('download'))).toBeTrue();
      expect(el.querySelector('.account-email')!.textContent).toContain('yo@ejemplo.com');

      Array.from(el.querySelectorAll('.account button')).find((b) => b.textContent!.includes('Cerrar sesión'))!.dispatchEvent(new Event('click'));
      http.expectOne((r) => r.url === '/api/auth/logout' && r.method === 'POST').flush(null, { status: 204, statusText: 'No Content' });
      fixture.detectChanges();
      expect(el.querySelector('app-login')).not.toBeNull();
    });
  });

  it('sin bienvenida vista, muestra la bienvenida en lugar de las pestañas de datos (feature 005)', () => {
    const { el } = render({ ...authenticated, onboarded: false });
    expect(el.querySelector('app-welcome')).not.toBeNull();
    expect(el.querySelector('app-night')).toBeNull();
  });

  describe('pie de página con la versión (FR-017)', () => {
    const footer = (el: HTMLElement) => el.querySelector('footer')?.textContent?.replace(/\s+/g, ' ').trim();

    it('muestra los 7 primeros caracteres del SHA desplegado', () => {
      const { el } = render(authenticated, { ok: true, time: '', version: 'a6efe9b68d08a574233ce72d5ade7d40babfb739' });
      expect(footer(el)).toBe('Versión a6efe9b');
    });

    it('muestra "dev" en local', () => {
      const { el } = render(authenticated);
      expect(footer(el)).toBe('Versión dev');
    });

    it('si el chequeo de salud falla, no muestra pie y la app sigue funcionando', () => {
      const { el } = render(authenticated, null);
      expect(el.querySelector('footer')).toBeNull();
      expect(el.querySelector('nav.tabs')).not.toBeNull();
    });
  });
});

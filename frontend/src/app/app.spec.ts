import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { App } from './app';

describe('App', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [App],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
  });

  it('muestra las pestañas Noche, Siestas y Métricas, con la activa marcada (FR-027)', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;

    const tabs = Array.from(el.querySelectorAll('nav.tabs button'));
    expect(tabs.map((t) => t.textContent!.trim())).toEqual(['Noche', 'Siestas', 'Métricas']);
    expect(tabs[0].getAttribute('aria-current')).toBe('page');
    expect(el.querySelector('app-night')).not.toBeNull();

    (tabs[1] as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(tabs[1].getAttribute('aria-current')).toBe('page');
    expect(tabs[0].getAttribute('aria-current')).toBeNull();
    expect(el.querySelector('app-naps')).not.toBeNull();
    expect(el.querySelector('app-night')).toBeNull();
  });

  describe('pie de página con la versión (FR-017)', () => {
    const footer = (el: HTMLElement) => el.querySelector('footer')?.textContent?.replace(/\s+/g, ' ').trim();

    function render(respond: (http: HttpTestingController) => void) {
      const fixture = TestBed.createComponent(App);
      fixture.detectChanges();
      respond(TestBed.inject(HttpTestingController));
      fixture.detectChanges();
      return fixture.nativeElement as HTMLElement;
    }

    it('muestra los 7 primeros caracteres del SHA desplegado', () => {
      const el = render((http) => http.expectOne('/api/health').flush({ ok: true, time: '', version: 'a6efe9b68d08a574233ce72d5ade7d40babfb739' }));
      expect(footer(el)).toBe('Versión a6efe9b');
    });

    it('muestra "dev" en local', () => {
      const el = render((http) => http.expectOne('/api/health').flush({ ok: true, time: '', version: 'dev' }));
      expect(footer(el)).toBe('Versión dev');
    });

    it('si el chequeo de salud falla, no muestra pie y la app sigue funcionando', () => {
      const el = render((http) => http.expectOne('/api/health').flush(null, { status: 500, statusText: 'Error' }));
      expect(el.querySelector('footer')).toBeNull();
      expect(el.querySelector('nav.tabs')).not.toBeNull();
    });
  });
});

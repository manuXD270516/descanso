import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
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
});

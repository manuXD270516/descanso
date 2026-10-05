import { TestBed } from '@angular/core/testing';
import { OriginBadgeComponent, Origin, blockOrigin } from './origin-badge.component';

// Insignias de origen (feature 006, US1, FR-001).
describe('OriginBadgeComponent y blockOrigin', () => {
  beforeEach(() => TestBed.configureTestingModule({}));

  it('pinta los cuatro orígenes con su texto (010 añade "Anotado después")', () => {
    const texts: Record<Origin, string> = { manual: 'Anotado por ti', late: 'Anotado después', estimated: 'Estimado', device: 'Del reloj' };
    for (const [origin, text] of Object.entries(texts)) {
      const f = TestBed.createComponent(OriginBadgeComponent);
      f.componentRef.setInput('origin', origin);
      f.detectChanges();
      expect((f.nativeElement as HTMLElement).textContent!.trim()).toBe(text);
    }
  });

  it('un bloque homogéneo tiene un origen común; uno mezclado o vacío, ninguno', () => {
    expect(blockOrigin([{ origin: 'manual' }, { origin: 'manual' }])).toBe('manual');
    expect(blockOrigin([{ origin: 'manual' }, { origin: 'device' }])).toBeNull();
    expect(blockOrigin([])).toBeNull();
  });
});

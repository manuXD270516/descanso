import { TestBed } from '@angular/core/testing';
import { ConfirmService } from './confirm.service';

describe('ConfirmService (feature 014)', () => {
  let service: ConfirmService;
  beforeEach(() => { service = TestBed.inject(ConfirmService); });

  it('ask() queda pendiente y resuelve true solo al confirmar', async () => {
    const answer = service.ask({ title: 'T', body: 'B' });
    expect(service.current()?.title).toBe('T');
    service.settle(true);
    expect(await answer).toBeTrue();
    expect(service.current()).toBeNull();
  });

  it('settle(false) resuelve false', async () => {
    const answer = service.ask({ title: 'T', body: 'B' });
    service.settle(false);
    expect(await answer).toBeFalse();
  });

  it('un segundo ask() resuelve el primero en false y muestra el nuevo', async () => {
    const first = service.ask({ title: 'Uno', body: 'B' });
    const second = service.ask({ title: 'Dos', body: 'B' });
    expect(await first).toBeFalse();
    expect(service.current()?.title).toBe('Dos');
    service.settle(true);
    expect(await second).toBeTrue();
  });

  it('settle() sin pedido abierto no hace nada', () => {
    expect(() => service.settle(true)).not.toThrow();
  });
});

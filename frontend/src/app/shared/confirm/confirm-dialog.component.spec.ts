import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AuthService } from '../../core/auth.service';
import { ConfirmDialogComponent } from './confirm-dialog.component';
import { ConfirmService } from './confirm.service';

describe('ConfirmDialogComponent (feature 014)', () => {
  let fixture: ComponentFixture<ConfirmDialogComponent>;
  let service: ConfirmService;
  let auth: AuthService;
  const dialog = () => fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;
  const button = (text: string) => Array.from(dialog().querySelectorAll('button')).find((b) => b.textContent!.trim() === text)!;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ConfirmDialogComponent],
      providers: [{ provide: AuthService, useValue: { state: signal('authenticated') } }],
    }).compileComponents();
    service = TestBed.inject(ConfirmService);
    auth = TestBed.inject(AuthService);
    fixture = TestBed.createComponent(ConfirmDialogComponent);
    fixture.detectChanges();
  });

  afterEach(() => { if (dialog().open) dialog().close(); });

  async function open(req = { title: '¿Borrar esta noche?', body: 'Se borra. No se puede recuperar.' }) {
    const answer = service.ask(req);
    fixture.detectChanges();
    await fixture.whenStable();
    return answer;
  }

  it('abre un diálogo modal con título, cuerpo y foco inicial en "Conservar"', async () => {
    void open();
    await fixture.whenStable();
    expect(dialog().open).toBeTrue();
    expect(dialog().getAttribute('aria-labelledby')).toBe('confirm-title');
    expect(dialog().getAttribute('aria-describedby')).toBe('confirm-body');
    expect(dialog().getAttribute('closedby')).toBe('closerequest');
    expect(dialog().querySelector('#confirm-title')!.textContent).toContain('¿Borrar esta noche?');
    expect(document.activeElement).toBe(button('Conservar'));
  });

  it('"Borrar" resuelve true', async () => {
    const answer = open();
    await fixture.whenStable();
    button('Borrar').click();
    expect(await answer).toBeTrue();
    expect(dialog().open).toBeFalse();
  });

  it('"Conservar" resuelve false', async () => {
    const answer = open();
    await fixture.whenStable();
    button('Conservar').click();
    expect(await answer).toBeFalse();
  });

  it('el evento cancel (Esc) cierra y resuelve false', async () => {
    const answer = open();
    await fixture.whenStable();
    dialog().dispatchEvent(new Event('cancel'));
    dialog().close();
    expect(await answer).toBeFalse();
  });

  it('cerrar la sesión con el diálogo abierto lo cancela', async () => {
    const answer = open();
    await fixture.whenStable();
    (auth.state as unknown as { set(v: string): void }).set('login');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(await answer).toBeFalse();
    expect(dialog().open).toBeFalse();
  });

  it('usa la etiqueta de confirmación del pedido', async () => {
    void service.ask({ title: 'T', body: 'B', confirmLabel: 'Eliminar todo' });
    fixture.detectChanges();
    await fixture.whenStable();
    expect(button('Eliminar todo')).toBeTruthy();
  });
});

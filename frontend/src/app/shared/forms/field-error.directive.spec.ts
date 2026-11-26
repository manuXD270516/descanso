import { Component, ViewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { FieldErrorDirective } from './field-error.directive';

@Component({
  imports: [FormsModule, FieldErrorDirective],
  template: `
    <form appFieldError #fe="appFieldError" (ngSubmit)="sent = sent + 1">
      <label class="field"><span>Email</span><input type="email" name="email" [(ngModel)]="email" required></label>
      <label class="field"><span>Nombre</span><input type="text" name="nombre" [(ngModel)]="nombre" aria-describedby="ayuda"></label>
      <button type="submit">Enviar</button>
    </form>
  `,
})
class HostComponent {
  email = '';
  nombre = '';
  sent = 0;
  @ViewChild('fe') fe!: FieldErrorDirective;
}

describe('FieldErrorDirective (feature 014)', () => {
  let fixture: ComponentFixture<HostComponent>;
  let el: HTMLElement;
  const email = () => el.querySelector('input[name="email"]') as HTMLInputElement;
  const errors = () => el.querySelectorAll('.field-error');

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    el = fixture.nativeElement;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('al cargar y al solo enfocar, aria-invalid es "false" y no hay mensaje', () => {
    expect(email().getAttribute('aria-invalid')).toBe('false');
    email().focus();
    expect(email().getAttribute('aria-invalid')).toBe('false');
    expect(errors().length).toBe(0);
  });

  it('indica "(obligatorio)" en la etiqueta de los campos obligatorios', () => {
    expect(el.querySelector('label span')!.textContent).toBe('Email (obligatorio)');
    expect(el.querySelectorAll('label span')[1].textContent).toBe('Nombre');
  });

  it('tras salir del campo con valor inválido marca aria-invalid y enlaza el mensaje', () => {
    email().focus();
    email().dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    expect(email().getAttribute('aria-invalid')).toBe('true');
    const message = el.querySelector('.field-error') as HTMLElement;
    expect(message.textContent).toBe('Este campo es obligatorio.');
    expect(email().getAttribute('aria-describedby')).toContain(message.id);
  });

  it('al corregirlo vuelve a "false" y desaparece el mensaje', () => {
    email().dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    email().value = 'a@b.co';
    email().dispatchEvent(new Event('input', { bubbles: true }));
    expect(email().getAttribute('aria-invalid')).toBe('false');
    expect(errors().length).toBe(0);
    expect(email().hasAttribute('aria-describedby')).toBeFalse();
  });

  it('al enviar con errores no envía y enfoca el primer campo inválido', () => {
    (el.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.componentInstance.sent).toBe(0);
    expect(document.activeElement).toBe(email());
    expect(email().getAttribute('aria-invalid')).toBe('true');
  });

  it('con datos válidos envía', async () => {
    email().value = 'a@b.co';
    email().dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();
    (el.querySelector('button') as HTMLButtonElement).click();
    expect(fixture.componentInstance.sent).toBe(1);
  });

  it('validate() sirve para grupos sin <form>', () => {
    expect(fixture.componentInstance.fe.validate()).toBeFalse();
  });
});

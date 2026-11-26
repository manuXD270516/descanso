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

@Component({
  imports: [FormsModule, FieldErrorDirective],
  template: `
    <div appFieldError #g="appFieldError">
      <label class="field"><span>Minutos</span><input type="number" name="min" [(ngModel)]="min" min="0" max="59" step="5" required></label>
      <button type="button" data-submit (click)="g.validate() && (sent = sent + 1)">Guardar</button>
    </div>
  `,
})
class GroupComponent {
  min: number | null = 0;
  sent = 0;
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

  it('un evento change sin salir del campo no muestra el error (FR-020, datetime-local)', () => {
    email().focus();
    email().dispatchEvent(new Event('change', { bubbles: true }));
    expect(email().getAttribute('aria-invalid')).toBe('false');
    expect(errors().length).toBe(0);
  });

  it('el mensaje va dentro del label.field (no añade hijos al contenedor) y no entra en el nombre accesible', () => {
    email().dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    const message = el.querySelector('.field-error') as HTMLElement;
    expect(message.parentElement!.tagName).toBe('LABEL');
    expect(message.getAttribute('aria-hidden')).toBe('true');
    expect(el.querySelector('form')!.children.length).toBe(3); // 2 etiquetas y el botón
  });

  it('N-1 · si el foco pasa al botón de enviar no se marca el campo (lo hace la validación del envío)', () => {
    const button = el.querySelector('button') as HTMLButtonElement;
    email().dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: button }));
    expect(email().getAttribute('aria-invalid')).toBe('false');
    expect(errors().length).toBe(0);
    // con otro destino sí se marca
    email().dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    expect(email().getAttribute('aria-invalid')).toBe('true');
  });

  it('report() muestra un error propio en el campo, lo enfoca y se limpia al editar', () => {
    expect(fixture.componentInstance.fe.report('email', 'Texto propio.')).toBeTrue();
    expect(document.activeElement).toBe(email());
    expect(el.querySelector('.field-error')!.textContent).toBe('Texto propio.');
    email().value = 'a@b.co';
    email().dispatchEvent(new Event('input', { bubbles: true }));
    expect(errors().length).toBe(0);
  });

  describe('grupo sin <form> con botón data-submit', () => {
    let group: ComponentFixture<GroupComponent>;
    beforeEach(async () => {
      group = TestBed.createComponent(GroupComponent);
      group.detectChanges();
      await group.whenStable();
    });
    const field = () => group.nativeElement.querySelector('input') as HTMLInputElement;
    const save = () => group.nativeElement.querySelector('button') as HTMLButtonElement;

    it('ir al botón data-submit no marca el campo; la validación del clic sí', () => {
      field().value = '';
      field().dispatchEvent(new Event('input', { bubbles: true }));
      field().dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: save() }));
      expect(field().getAttribute('aria-invalid')).toBe('false');
      save().click();
      expect(field().getAttribute('aria-invalid')).toBe('true');
      expect(group.componentInstance.sent).toBe(0);
    });

    it('Safari: pointerdown sobre el botón con relatedTarget null tampoco marca el campo antes del clic', () => {
      field().value = '';
      field().dispatchEvent(new Event('input', { bubbles: true }));
      save().dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      field().dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: null }));
      expect(field().getAttribute('aria-invalid')).toBe('false');
      expect(group.nativeElement.querySelectorAll('.field-error').length).toBe(0);
    });

    it('un valor fuera de rango no pasa, pero un múltiplo distinto del paso sí (step no cuenta)', () => {
      field().value = '70';
      field().dispatchEvent(new Event('input', { bubbles: true }));
      save().click();
      expect(group.componentInstance.sent).toBe(0);
      field().value = '7';
      field().dispatchEvent(new Event('input', { bubbles: true }));
      save().click();
      expect(group.componentInstance.sent).toBe(1);
    });
  });
});

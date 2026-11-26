import { DestroyRef, Directive, ElementRef, afterNextRender, inject } from '@angular/core';

type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

const CONTROLS = 'input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]):not([type="button"]):not([type="submit"]), select, textarea';
let nextId = 0;

/**
 * Errores de campo anunciados (feature 014, FR-019 a FR-022). Se pone en un `<form>` o en el contenedor
 * de un grupo de campos:
 *  - los campos obligatorios llevan "(obligatorio)" en su etiqueta;
 *  - tras salir de un campo (o al enviar) un valor inválido se marca con `aria-invalid="true"`, borde,
 *    icono y un mensaje enlazado por `aria-describedby`; al corregirlo todo desaparece;
 *  - al enviar con errores el envío se cancela y el foco va al primer campo con error.
 * Para grupos sin `<form>`, `validate()` hace lo mismo desde el manejador del botón.
 */
@Directive({
  selector: '[appFieldError]',
  exportAs: 'appFieldError',
  host: {
    '(focusout)': 'onTouched($event)',
    '(change)': 'onTouched($event)',
    '(input)': 'onInput($event)',
  },
})
export class FieldErrorDirective {
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly touched = new WeakSet<Control>();
  private readonly messages = new Map<Control, HTMLElement>();
  private readonly base = new WeakMap<Control, string | null>();
  private readonly prefix = `fe${nextId++}`;
  private count = 0;

  constructor() {
    // `invalid` no burbujea: se escucha en captura
    const onInvalid = (e: Event) => this.touchAndSync(e.target as Control);
    this.host.addEventListener('invalid', onInvalid, true);
    // En captura para adelantarse a NgForm: con errores, `ngSubmit` no llega a emitirse
    const onSubmit = (e: Event) => this.onSubmit(e);
    this.host.addEventListener('submit', onSubmit, true);
    afterNextRender(() => this.decorate());
    // Los campos pueden pintarse después (@if): se decoran al aparecer
    const observer = new MutationObserver(() => this.decorate());
    observer.observe(this.host, { childList: true, subtree: true, attributes: true, attributeFilter: ['required'] });
    inject(DestroyRef).onDestroy(() => {
      observer.disconnect();
      this.host.removeEventListener('invalid', onInvalid, true);
      this.host.removeEventListener('submit', onSubmit, true);
      this.messages.forEach((m) => m.remove());
      this.messages.clear();
    });
  }

  /** Valida todos los campos del grupo; muestra los errores y enfoca el primero. `true` si no hay errores. */
  validate(): boolean {
    let first: Control | null = null;
    for (const control of this.controls()) {
      if (control.disabled) continue;
      this.touched.add(control);
      this.sync(control);
      if (!control.checkValidity() && !first) first = control;
    }
    first?.focus();
    return !first;
  }

  onTouched(event: Event): void {
    const control = this.asControl(event.target);
    if (control) this.touchAndSync(control);
  }

  onInput(event: Event): void {
    // Mientras se escribe solo se limpia un error ya mostrado; no se crea uno nuevo (FR-020)
    const control = this.asControl(event.target);
    if (control && this.messages.has(control) && control.checkValidity()) this.sync(control);
  }

  private onSubmit(event: Event): void {
    if (this.validate()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  private controls(): Control[] {
    return Array.from(this.host.querySelectorAll<Control>(CONTROLS));
  }

  private asControl(target: EventTarget | null): Control | null {
    return target instanceof HTMLElement && target.matches(CONTROLS) ? (target as Control) : null;
  }

  private touchAndSync(control: Control): void {
    this.touched.add(control);
    this.sync(control);
  }

  /** Etiqueta "(obligatorio)" y estado inicial `aria-invalid="false"` de cada campo (idempotente). */
  private decorate(): void {
    for (const control of this.controls()) {
      if (!control.hasAttribute('aria-invalid')) control.setAttribute('aria-invalid', 'false');
      if (control.required && !control.dataset['feRequired']) {
        control.dataset['feRequired'] = '1';
        const label = control.closest('label')?.querySelector('span') ?? null;
        if (label && !/obligatorio/i.test(label.textContent ?? '')) label.append(' (obligatorio)');
      }
    }
  }

  private sync(control: Control): void {
    const invalid = this.touched.has(control) && !control.checkValidity();
    control.setAttribute('aria-invalid', String(invalid));
    let message = this.messages.get(control);
    if (!invalid) {
      if (message) {
        message.remove();
        this.messages.delete(control);
        this.restoreDescribedBy(control);
      }
      return;
    }
    if (!message) {
      message = document.createElement('span');
      message.id = `${this.prefix}-${this.count++}`;
      message.className = 'field-error';
      (control.closest('label') ?? control).insertAdjacentElement('afterend', message);
      this.messages.set(control, message);
      this.base.set(control, control.getAttribute('aria-describedby'));
      const others = control.getAttribute('aria-describedby');
      control.setAttribute('aria-describedby', others ? `${others} ${message.id}` : message.id);
    }
    message.textContent = this.text(control);
  }

  private restoreDescribedBy(control: Control): void {
    const base = this.base.get(control) ?? null;
    if (base) control.setAttribute('aria-describedby', base);
    else control.removeAttribute('aria-describedby');
  }

  private text(control: Control): string {
    const v = control.validity;
    if (v.valueMissing) return 'Este campo es obligatorio.';
    if (v.typeMismatch) return control.type === 'email' ? 'Escribe un email válido.' : 'El valor no es válido.';
    if (v.tooShort) return `Usa al menos ${control.getAttribute('minlength')} caracteres.`;
    if (v.rangeUnderflow || v.rangeOverflow) return 'El valor está fuera del rango permitido.';
    if (v.patternMismatch) return 'El formato no es válido.';
    return control.validationMessage || 'El valor no es válido.';
  }
}

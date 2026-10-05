import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { WelcomeComponent } from './welcome.component';
import { ScheduleEditorComponent } from '../schedule/schedule-editor.component';

// Diagnóstico (feature 010): elegir 7 h 30 y luego levantarse a las 7:00 debe proponer 23:15.
describe('Bienvenida · objetivo y propuesta de acostarse', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] }));

  it('tras elegir 7 h 30 por la interfaz, levantarse a las 7:00 propone 23:15', () => {
    const f = TestBed.createComponent(WelcomeComponent);
    f.detectChanges();
    const el: HTMLElement = f.nativeElement;
    (Array.from(el.querySelectorAll('button')).find((b) => b.textContent!.includes('7 h 30')) as HTMLButtonElement).click();
    f.detectChanges();
    const wake = el.querySelector('input[name=weekWake]') as HTMLInputElement;
    wake.value = '07:00';
    wake.dispatchEvent(new Event('input'));
    f.detectChanges();
    const editor = f.debugElement.query((d) => d.componentInstance instanceof ScheduleEditorComponent).componentInstance as ScheduleEditorComponent;
    expect(editor.goalMin()).toBe(450);
    expect(editor.week().bed).toBe('23:15');
  });
});

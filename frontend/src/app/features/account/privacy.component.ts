import { Component } from '@angular/core';
import { POLICY_SECTIONS, POLICY_VERSION } from '../../core/privacy';

/** Política de privacidad (feature 008, US6): desde el registro y desde el menú Cuenta. */
@Component({
  selector: 'app-privacy',
  styleUrl: './account.css',
  template: `
    <section class="panel account-card policy" aria-labelledby="privacy-title">
      <h2 id="privacy-title">Privacidad</h2>
      @for (s of sections; track s.title) {
        <h3>{{ s.title }}</h3>
        <p>{{ s.text }}</p>
      }
      <p class="small faint">Versión {{ version }}</p>
    </section>
  `,
})
export class PrivacyComponent {
  readonly sections = POLICY_SECTIONS;
  readonly version = POLICY_VERSION;
}

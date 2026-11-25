import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, openTab, test } from '../support/fixtures';
import { expandTab, TABS, waitForTab } from '../support/tabs';

// Feature 014 · accesibilidad automática en ambos temas (SC-002, SC-003, SC-007).
// El servidor compartido es de solo lectura: estos tests solo miran.

const THEMES = ['light', 'dark'] as const;
const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function openAccountView(page: Page, name: 'Mi perfil' | 'Mi horario') {
  await page.getByText('Cuenta', { exact: true }).click();
  await page.getByRole('button', { name }).click();
}

/** Corre axe y adjunta lo que no pudo decidir ("incomplete") al reporte. */
async function expectNoViolations(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  if (results.incomplete.length) {
    await test.info().attach(`axe-incomplete-${label}.json`, {
      body: JSON.stringify(results.incomplete.map((r) => ({ id: r.id, nodes: r.nodes.length })), null, 2),
      contentType: 'application/json',
    });
  }
  const summary = results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
  expect(summary, `violaciones de axe en ${label}`).toEqual([]);
}

test.describe('axe en ambos temas (servidor compartido, solo lectura)', () => {
  test.use({ isolate: false });

  for (const theme of THEMES) {
    test(`SC-002 · las cuatro pestañas, con sus plegables abiertos, no tienen violaciones (${theme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme });
      await page.goto('/');
      for (const tab of TABS) {
        await openTab(page, tab);
        await expandTab(page, tab);
        await waitForTab(page, tab);
        await expectNoViolations(page, `${tab}-${theme}`);
      }
    });

    test(`SC-002 · Mi perfil y Mi horario no tienen violaciones (${theme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme });
      await page.goto('/');
      await openAccountView(page, 'Mi perfil');
      await expect(page.getByRole('heading', { name: 'Mi perfil' })).toBeVisible();
      await expectNoViolations(page, `perfil-${theme}`);
      await openAccountView(page, 'Mi horario');
      await expect(page.getByRole('heading', { name: 'Mi horario' })).toBeVisible();
      await expectNoViolations(page, `horario-${theme}`);
    });
  }

  test('SC-007 · ninguna petición sale del servicio', async ({ page, externalRequests }) => {
    await page.goto('/');
    for (const tab of TABS) {
      await openTab(page, tab);
      await expandTab(page, tab);
      await waitForTab(page, tab);
    }
    await openAccountView(page, 'Mi perfil');
    await expect(page.getByRole('heading', { name: 'Mi perfil' })).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(externalRequests).toEqual([]);
  });

  test('SC-007 · la fuente de la marca se sirve desde el propio servicio', async ({ page }) => {
    const font = page.waitForResponse((r) => r.url().endsWith('.woff2'));
    await page.goto('/');
    const response = await font;
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('font/woff2');
    expect(new URL(response.url()).host).toBe(new URL(page.url()).host);
  });

  test('FR-004 · hay un theme-color por tema y el fondo sigue al esquema sin recargar', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');
    const metas = await page.locator('meta[name="theme-color"]').evaluateAll((els) =>
      els.map((e) => ({ media: e.getAttribute('media') ?? '', content: e.getAttribute('content') ?? '' })));
    expect(metas.map((m) => m.media).sort()).toEqual(['(prefers-color-scheme: dark)', '(prefers-color-scheme: light)']);
    await expect(page.locator('meta[name="color-scheme"]')).toHaveAttribute('content', 'light dark');

    const background = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const light = await background();
    await page.emulateMedia({ colorScheme: 'dark' });
    const dark = await background();
    expect(light).not.toBe(dark);
    // Sin blanco ni negro puro (FR-003)
    for (const color of [light, dark]) expect(color).not.toMatch(/^rgb\((255, 255, 255|0, 0, 0)\)$/);
    // theme-color de la barra del navegador = fondo de cada tema
    const hex = (rgb: string) => '#' + (rgb.match(/\d+/g) ?? []).slice(0, 3).map((n) => Number(n).toString(16).padStart(2, '0')).join('');
    expect(hex(light)).toBe(metas.find((m) => m.media.includes('light'))!.content);
    expect(hex(dark)).toBe(metas.find((m) => m.media.includes('dark'))!.content);
  });
});

// --- Contraste de los tokens, medido sobre el CSS real (SC-003) ------------------------------

type Rgb = [number, number, number];
const luminance = ([r, g, b]: Rgb) => {
  const c = [r, g, b].map((v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a: Rgb, b: Rgb) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const SURFACES = ['surface', 'surface-raised', 'surface-sunken', 'surface-hover'];
const TEXT_PAIRS: [string, string[]][] = [
  ['ink', SURFACES], ['ink-muted', SURFACES], ['ink-faint', SURFACES],
  ['accent', ['surface', 'surface-raised']], ['accent-2', ['surface', 'surface-raised']],
  ['danger', ['surface', 'surface-raised', 'danger-bg']], ['success', ['surface', 'surface-raised']],
  ['on-accent', ['accent']], ['on-accent-2', ['accent-2-fill']], ['on-danger', ['danger']],
];
const NON_TEXT_PAIRS: [string, string[]][] = [
  ['line-strong', ['surface', 'surface-raised', 'surface-sunken']],
  ['focus', ['surface', 'surface-raised', 'surface-sunken']],
  ...Array.from({ length: 8 }, (_, i): [string, string[]] => [`cat-${i + 1}`, ['surface-raised']]),
];

test.describe('Contraste de tokens (servidor compartido, solo lectura)', () => {
  test.use({ isolate: false });

  for (const theme of THEMES) {
    test(`SC-003 · todos los pares de contracts/design-tokens.md cumplen AA (${theme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme });
      await page.goto('/');
      const names = [...new Set([...TEXT_PAIRS, ...NON_TEXT_PAIRS].flatMap(([fg, bgs]) => [fg, ...bgs]))];
      const colors = await page.evaluate((tokens) => {
        const probe = document.createElement('i');
        document.body.append(probe);
        const out: Record<string, string> = {};
        for (const t of tokens) {
          probe.style.color = '';
          probe.style.color = `var(--${t})`;
          out[t] = getComputedStyle(probe).color;
        }
        probe.remove();
        return out;
      }, names);
      const rgb = (token: string): Rgb => {
        const m = colors[token].match(/rgba?\(([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)/);
        expect(m, `--${token} no se resolvió a rgb: ${colors[token]}`).not.toBeNull();
        return [Number(m![1]), Number(m![2]), Number(m![3])];
      };
      const failures: string[] = [];
      const check = (pairs: [string, string[]][], min: number) => {
        for (const [fg, bgs] of pairs) for (const bg of bgs) {
          const r = ratio(rgb(fg), rgb(bg));
          if (r < min) failures.push(`--${fg} sobre --${bg}: ${r.toFixed(2)}:1 (mínimo ${min})`);
        }
      };
      check(TEXT_PAIRS, 4.5);
      check(NON_TEXT_PAIRS, 3);
      expect(failures).toEqual([]);
    });
  }
});

// --- Pantalla de entrar (sin sesión) ----------------------------------------------------------

test.describe('axe en la pantalla de entrar (servidor propio, sin sesión)', () => {
  test.use({ authenticated: false });

  for (const theme of THEMES) {
    test(`SC-002 · entrar no tiene violaciones (${theme})`, async ({ page, api }) => {
      await api.setupOwner();
      await page.emulateMedia({ colorScheme: theme });
      await page.goto('/');
      await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible();
      await expectNoViolations(page, `entrar-${theme}`);
    });
  }
});

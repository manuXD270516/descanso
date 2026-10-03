import type { Page } from '@playwright/test';
import { test, expect, setNow, openTab } from '../support/fixtures';
import type { Api } from '../support/api';

// Feature 005: dashboard de tendencias, objetivo de sueño con ciclos, bienvenida y accesibilidad.

const NOW = '2026-09-30T23:30';
const TO = '2026-09-30';

/**
 * Semana del 24 al 30 de septiembre: 4 días con dato (uno con siesta), 2 huecos y una noche
 * abierta hoy. Con el objetivo de 7 h: 3 de 4 días lo cumplen (el 26 suma 6 h + 30 min de siesta).
 */
async function seedWeek(api: Api) {
  await api.createNight('2026-09-24T23:00', '2026-09-25T07:00');
  await api.createNight('2026-09-26T23:30', '2026-09-27T05:30');
  await api.createNap('2026-09-26T14:00', '2026-09-26T14:30');
  await api.createNight('2026-09-27T22:00', '2026-09-28T06:00');
  await api.createNight('2026-09-29T23:00', '2026-09-30T06:00');
  await api.createNight('2026-09-30T23:00');
}

async function openTrends(page: Page) {
  await setNow(page, NOW);
  await page.goto('/');
  await openTab(page, 'Tendencias');
  await expect(page.getByRole('heading', { name: 'Horas dormidas' })).toBeVisible();
  // El periodo por defecto es 30 días; la semana sembrada se ve mejor con 7
  await page.getByRole('group', { name: 'Periodo' }).getByRole('button', { name: '7 días' }).click();
}

/** Filas de la tabla alternativa de un gráfico: [día, valor]. */
async function tableRows(page: Page, scope: string) {
  const details = page.locator(`${scope} details`).filter({ hasText: 'Ver como tabla' }).first();
  await details.locator('summary').click();
  return details.locator('tbody tr').evaluateAll((rows) =>
    rows.map((r) => Array.from(r.querySelectorAll('th, td')).map((c) => c.textContent!.trim())),
  );
}

test('con datos sembrados muestra los indicadores, "sin dato" y "en curso" (US1, FR-002, FR-003)', async ({ page, api }) => {
  await seedWeek(api);
  const d = await api.dashboard(7, TO);
  expect(d.summary).toMatchObject({ days_with_data: 4, goal_met: 3 });

  await openTrends(page);
  const summary = page.getByRole('region', { name: 'Resumen' });
  await expect(summary).toContainText('3 de 4');
  await expect(summary.locator('.lbl')).toHaveText(['media diaria', 'días con tus horas objetivo', 'sueño pendiente (14 días)']);
  // 4 × 7 h = 28 h frente a 29 h 30 min dormidas: sin sueño pendiente
  await expect(page.locator('.pending-text')).toContainText('No tienes sueño pendiente');

  const rows = await tableRows(page, 'app-trends');
  expect(rows).toHaveLength(7);
  const values = rows.map((r) => r[r.length - 1]);
  expect(values.filter((v) => v === 'Sin dato')).toHaveLength(2);
  expect(values[values.length - 1]).toBe('En curso');
});

test('cambiar el periodo vuelve a pintar el gráfico con 90 días (US1-6)', async ({ page, api }) => {
  await seedWeek(api);
  await openTrends(page);
  const button = page.getByRole('group', { name: 'Periodo' }).getByRole('button', { name: '90 días' });
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  expect(await tableRows(page, 'app-trends')).toHaveLength(90);
});

test('editar el objetivo con un atajo de ciclos recalcula los días que lo cumplen (US4)', async ({ page, api }) => {
  await seedWeek(api);
  await openTrends(page);
  await page.getByRole('button', { name: 'Editar objetivo' }).click();
  await expect(page.locator('app-goal-editor')).toContainText('varía entre personas');
  await page.locator('app-goal-editor').getByRole('button', { name: '6 h · 4 ciclos' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Objetivo guardado' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Resumen' })).toContainText('4 de 4');
  expect((await api.dashboard(7, TO)).goal_min).toBe(360);
});

test('cada gráfico tiene nombre, descripción y tabla con las mismas filas, también la cinta (SC-004)', async ({ page, api }) => {
  await seedWeek(api);
  await openTrends(page);
  const svgs = page.locator('app-trends svg[role="img"]');
  await expect(svgs).toHaveCount(1);
  const names = await svgs.evaluateAll((list) =>
    list.map((svg) => {
      const text = (attr: string) =>
        (svg.getAttribute(attr) ?? '').split(/\s+/).filter(Boolean).map((id) => document.getElementById(id)?.textContent?.trim() ?? '').join(' ');
      return { name: text('aria-labelledby'), desc: text('aria-describedby') };
    }),
  );
  for (const n of names) {
    expect(n.name).not.toBe('');
    expect(n.desc).toContain('con dato');
  }
  expect(await tableRows(page, 'app-trends')).toHaveLength(7);

  await openTab(page, 'Noche');
  const ribbon = page.getByRole('img', { name: 'Cinta de las últimas 14 noches' });
  await expect(ribbon).toBeVisible();
  const descId = await ribbon.getAttribute('aria-describedby');
  await expect(page.locator(`#${descId}`)).toContainText('Últimas 14 noches');
  expect(await tableRows(page, 'app-night')).toHaveLength(14);
});

test('el texto tenue cumple contraste WCAG ≥ 4,5 y el dashboard no usa rojo ni verde (SC-005, FR-013)', async ({ page, api }) => {
  await seedWeek(api);
  await openTrends(page);
  await page.getByRole('button', { name: 'Editar objetivo' }).click();
  await expect(page.locator('.faint').first()).toBeVisible();

  const ratios = await page.locator('.faint').evaluateAll((els) => {
    const parse = (c: string) => c.match(/[\d.]+/g)!.map(Number);
    const lum = ([r, g, b]: number[]) => {
      const ch = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
    };
    const background = (el: Element | null): number[] => {
      for (; el; el = el.parentElement) {
        const c = parse(getComputedStyle(el).backgroundColor);
        if (c.length < 4 || c[3] > 0) return c.slice(0, 3);
      }
      return parse(getComputedStyle(document.body).backgroundColor).slice(0, 3);
    };
    return els.map((el) => {
      const [a, b] = [lum(parse(getComputedStyle(el).color)), lum(background(el))].sort((x, y) => y - x);
      return (a + 0.05) / (b + 0.05);
    });
  });
  expect(ratios.length).toBeGreaterThan(0);
  for (const r of ratios) expect(r).toBeGreaterThanOrEqual(4.5);

  const offending = await page.locator('app-trends, app-trends *').evaluateAll((els) => {
    const bad: string[] = [];
    for (const el of els) {
      const s = getComputedStyle(el);
      for (const c of [s.color, s.backgroundColor, s.fill, s.stroke]) {
        const m = c.match(/[\d.]+/g);
        if (!m || (m.length === 4 && Number(m[3]) === 0)) continue;
        const [r, g, b] = m.map(Number);
        const red = r > 150 && g < 110 && b < 110;
        const green = g > 150 && r < 110 && b < 130;
        if (red || green) bad.push(`${el.tagName}.${el.getAttribute('class') ?? ''}: ${c}`);
      }
    }
    return bad;
  });
  expect(offending).toEqual([]);
});

test.describe('bienvenida (US5)', () => {
  test.use({ onboarded: false });

  test('la primera entrada pregunta el objetivo; elegir un atajo lo guarda y no vuelve a aparecer', async ({ page, api }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '¿Cuántas horas quieres dormir?' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Secciones' })).toBeHidden();
    await page.getByRole('button', { name: '7 h 30 · 5 ciclos' }).click();
    await expect(page.getByRole('navigation', { name: 'Secciones' })).toBeVisible();
    expect((await api.dashboard(7, TO)).goal_min).toBe(450);

    await page.reload();
    await expect(page.getByRole('navigation', { name: 'Secciones' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '¿Cuántas horas quieres dormir?' })).toBeHidden();
  });

  test('"Saltar" deja el objetivo en 7 h', async ({ page, api }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Saltar (7 h)' }).click();
    await expect(page.getByRole('navigation', { name: 'Secciones' })).toBeVisible();
    expect((await api.dashboard(7, TO)).goal_min).toBe(420);
  });
});

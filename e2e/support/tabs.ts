import { expect, type Page } from '@playwright/test';

/** Las cuatro pestañas de la navegación principal. */
export const TABS = ['Noche', 'Tendencias', 'Siestas', 'Métricas'] as const;
export type TabName = (typeof TABS)[number];

/** Abre las secciones plegables de cada pestaña para revisar también sus controles. */
export async function expandTab(page: Page, tab: TabName): Promise<void> {
  if (tab === 'Noche') await page.getByRole('button', { name: 'Registrar una noche pasada' }).click();
  if (tab === 'Tendencias') await page.getByRole('button', { name: 'Editar objetivo' }).click();
  if (tab === 'Métricas') await page.getByRole('button', { name: 'Nueva métrica' }).click();
}

/** Espera a que el contenido de la pestaña (con sus secciones plegables abiertas) esté pintado. */
export async function waitForTab(page: Page, tab: TabName): Promise<void> {
  if (tab === 'Noche') await expect(page.getByRole('button', { name: 'Ocultar registro manual' })).toBeVisible();
  if (tab === 'Tendencias') await expect(page.getByRole('button', { name: 'Guardar objetivo' })).toBeVisible();
  if (tab === 'Siestas') await expect(page.getByRole('heading', { name: 'Últimos 30 días' })).toBeVisible();
  if (tab === 'Métricas') await expect(page.getByRole('heading', { name: 'Nueva métrica' })).toBeVisible();
}

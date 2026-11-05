import { expect, test } from '@playwright/test';
import { expectWorldRendered } from './world-pixels';
import { setupE2EPage } from './helpers';

test('home screen renders the PLAYVERSE experience', async ({ page }) => {
  const errors = await setupE2EPage(page);

  await page.goto('/');

  await expect(page).toHaveTitle(/PLAYVERSE/);
  await expect(page.getByRole('heading', { level: 1, name: /PLAYVERSE/ })).toBeVisible();
  // The visible tagline under the wordmark (the sr-only h1 also contains this phrase).
  await expect(page.locator('.pv-logo__ribbon')).toHaveText('Play together. Anywhere.');
  await expect(page.locator('.pv-logo__ribbon')).toBeVisible();
  await expect(page.getByRole('button', { name: /Create a Room/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Join a Room/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /How to Play/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Settings/ })).toBeVisible();
  await expect(page.getByText('2–8')).toBeVisible();

  expect(errors).toEqual([]);
});

test('mounts the real WebGL scene, not a static image', async ({ page }) => {
  const errors = await setupE2EPage(page);

  await page.goto('/');

  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();

  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThan(200);
  expect(box!.height).toBeGreaterThan(140);

  const hasWebGL2 = await page.evaluate(() => {
    const element = document.querySelector('canvas');
    if (!element) return false;
    return element.getContext('webgl2') !== null;
  });
  expect(hasWebGL2).toBe(true);

  expect(errors).toEqual([]);
});

test('renders actual 3D scene pixels on Home, not the flat clear colour', async ({ page }) => {
  const errors = await setupE2EPage(page);

  await page.goto('/');

  // Canvas existence alone is not enough: poll rendered pixel variety.
  await expectWorldRendered(page);

  expect(errors).toEqual([]);
});

test('navigates from Home to another screen', async ({ page }) => {
  const errors = await setupE2EPage(page);

  await page.goto('/');

  await page.getByRole('button', { name: /How to Play/ }).click();

  await expect(page).toHaveURL(/#\/guide$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Player Guide' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Back to Home/ })).toBeVisible();

  await page.getByRole('button', { name: /Back to Home/ }).click();
  await expect(page).toHaveURL(/#\/home$/);
  await expect(page.getByRole('heading', { level: 1, name: /PLAYVERSE/ })).toBeVisible();

  expect(errors).toEqual([]);
});

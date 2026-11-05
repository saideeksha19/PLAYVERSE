import { expect, test } from '@playwright/test';
import { expectWorldRendered } from './world-pixels';
import { setupE2EPage } from './helpers';

test('create flow: Home → Player Setup → Create Room → live lobby', async ({ page }) => {
  const errors = await setupE2EPage(page);

  await page.goto('/');

  await page.getByRole('button', { name: /Create a Room/ }).click();
  await expect(page).toHaveURL(/#\/setup$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Player Setup' })).toBeVisible();

  const nickname = page.getByLabel('Enter your nickname');
  await expect(nickname).toHaveValue('Player1');
  await expect(page.getByRole('button', { name: 'Use the Blue cube' })).toBeVisible();
  await page.getByRole('button', { name: 'Use the Blue cube' }).click();
  await expect(page.getByRole('button', { name: 'Use the Blue cube' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await page.getByRole('button', { name: /Continue/ }).click();
  await expect(page).toHaveURL(/#\/create-room$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Create Room' })).toBeVisible();

  await page.getByRole('button', { name: /Family Friendly/ }).click();
  await expect(page.getByRole('button', { name: /Family Friendly/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Decrease Max players' }).click();
  await expect(page.getByRole('spinbutton', { name: 'Max players' })).toHaveAttribute(
    'aria-valuenow',
    '7',
  );
  await page.getByLabel('Room Name (optional)').fill('Fun Squad');

  const create = page.getByRole('button', { name: /^Create Room$/ });
  await expect(create).toBeEnabled();
  await create.click();
  // The server assigns the real code and opens the lobby with this player in it.
  await expect(page).toHaveURL(/#\/lobby$/, { timeout: 15_000 });
  await expect(page.getByTestId('player-Player1')).toBeVisible();
  await expect(page.getByLabel(/^Room code /)).toBeVisible();
  await expect(page.getByText('Fun Squad')).toBeVisible();
  await expect(page.getByText('Family Friendly')).toBeVisible();
  await expect(page.getByText('1/7 players')).toBeVisible();
  // Alone in the room, nobody can start yet.
  await expect(page.getByRole('button', { name: /Start Game/ })).toBeDisabled();

  // The 3D world stays mounted behind the panels — and shows real pixels.
  await expect(page.locator('canvas')).toBeVisible();
  await expectWorldRendered(page);

  expect(errors).toEqual([]);
});

test('join flow: six code boxes and typed validation errors', async ({ page }) => {
  const errors = await setupE2EPage(page);

  await page.goto('/');

  await page.getByRole('button', { name: /Join a Room/ }).click();
  await expect(page).toHaveURL(/#\/setup$/);
  await page.getByRole('button', { name: /Continue/ }).click();
  await expect(page).toHaveURL(/#\/join-room$/);

  const join = page.getByRole('button', { name: /^Join$/ });
  await expect(join).toBeDisabled();

  // Type the reference code: focus auto-advances through the six boxes.
  await page.getByLabel('Room code character 1').type('AB47FH', { delay: 25 });
  await expect(join).toBeEnabled();

  await join.click();
  // The code is valid alphabet but matches no room: the server says so, and the
  // screen stays put instead of pretending to join.
  await expect(page.getByTestId('join-error')).toBeVisible({ timeout: 15_000 });
  await expect(page).toHaveURL(/#\/join-room$/);

  await page.getByRole('button', { name: /Join via Invitation Link/ }).click();
  await expect(page.getByTestId('link-notice')).toBeVisible();

  expect(errors).toEqual([]);
});

test('game introduction explains when there is no match to introduce', async ({ page }) => {
  const errors = await setupE2EPage(page);

  // The lobby is reachable directly; with no room it explains that rather than
  // inventing a roster.
  await page.goto('/#/lobby');
  await expect(page.getByRole('heading', { level: 1, name: 'Waiting Lobby' })).toBeVisible();

  // Phase 4 made the intro server-driven: without a room it says so plainly
  // instead of inventing a round. The real round copy is covered by phase4.
  await page.goto('/#/intro');
  await expect(page.getByRole('heading', { level: 1, name: 'Game Introduction' })).toBeVisible();
  await expect(page.getByTestId('intro-waiting')).toContainText("You're not in a match.");
  await expect(page.getByRole('heading', { level: 2, name: 'Color Clash' })).toHaveCount(0);

  await page.getByRole('button', { name: /Back to Lobby/ }).first().click();
  await expect(page).toHaveURL(/#\/lobby$/);

  expect(errors).toEqual([]);
});

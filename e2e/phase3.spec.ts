import { expect, test, type Browser, type Page } from '@playwright/test';
import { blockExternalFonts } from './helpers';

/**
 * Phase 3 — real multiplayer against the production preview.
 *
 * Two independent browser contexts behave as two separate players (separate
 * cookies, storage and sockets). Everything asserted here comes from the
 * server's `room:state` broadcasts, so a pass means the authoritative path
 * really works end to end.
 */

// Two contexts with the WebGL world running; a full-suite run shares the CPU
// with the Phase 4 match, so the budget is generous.
test.setTimeout(300_000);

/**
 * Serial on purpose: each test drives two full browser contexts, and each page
 * keeps the WebGL world rendering. Running two of these in parallel starves
 * the CPU until clicks stop resolving — the shared-resource nature of the
 * scenario means one at a time is the honest way to measure it.
 */
test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'chromium-desktop',
    'Two-context multiplayer runs once, on desktop Chromium',
  );
});

const ROOM_CODE = /^[A-Z0-9]{6}$/;

async function setupPage(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await blockExternalFonts(page);
}

async function createRoom(page: Page, nickname: string, roomName: string): Promise<string> {
  await page.goto('/');
  await page.getByRole('button', { name: /Create a Room/ }).click();
  await expect(page).toHaveURL(/#\/setup$/);

  await page.getByLabel('Enter your nickname').fill(nickname);
  await page.getByRole('button', { name: /Continue/ }).click();
  await expect(page).toHaveURL(/#\/create-room$/);

  await page.getByLabel('Room Name (optional)').fill(roomName);
  await page.getByRole('button', { name: /^Create Room$/ }).click();

  await expect(page).toHaveURL(/#\/lobby$/, { timeout: 20_000 });
  const label = await page.getByLabel(/^Room code /).getAttribute('aria-label');
  const code = (label ?? '').replace('Room code ', '').replace(/\s+/g, '');
  expect(code).toMatch(ROOM_CODE);
  return code;
}

async function joinByInvite(page: Page, code: string): Promise<void> {
  await page.goto(`/#/join-room?code=${code}`);

  // The invite link prefills the six boxes.
  await expect(page.getByTestId('invite-prefill')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Room code character 1' })).toHaveValue(code[0]!);

  await page.getByRole('button', { name: /^Join$/ }).click();
  await expect(page).toHaveURL(/#\/lobby$/, { timeout: 20_000 });
}

function readyButton(page: Page) {
  return page.getByRole('button', { name: 'Mark me ready' });
}

function startButton(page: Page) {
  return page.getByRole('button', { name: /Start Game/ });
}

test('two players share one authoritative lobby, and leaving updates the roster', async ({
  browser,
}: {
  browser: Browser;
}) => {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  await setupPage(host);
  await setupPage(guest);

  try {
    // 1. Player A creates a room; the server assigns the code.
    const code = await createRoom(host, 'Alice', 'E2E Arena');

    // 2. Player B joins through the invite link carrying that code.
    await joinByInvite(guest, code);

    // 3. Both clients see each other — one shared roster, two viewpoints.
    await expect(host.getByText('2/8 players')).toBeVisible();
    await expect(host.getByTestId('player-Alice')).toContainText('You');
    await expect(host.getByTestId('player-Player1')).toBeVisible();

    await expect(guest.getByText('2/8 players')).toBeVisible();
    await expect(guest.getByTestId('player-Player1')).toContainText('You');
    await expect(guest.getByTestId('player-Alice')).toBeVisible();
    await expect(guest.getByText('Alice')).toBeVisible();

    // 4. Ready state is server-authoritative and propagates to the other client.
    await readyButton(guest).click();
    await expect(guest.getByTestId('ready-count')).toContainText('1 of 2 ready');
    await expect(host.getByTestId('player-Player1')).toContainText('Ready', { timeout: 15_000 });

    await readyButton(host).click();
    await expect(host.getByTestId('ready-count')).toContainText('2 of 2 ready');

    // 5. Only the host can start; the guest's control stays locked.
    await expect(startButton(host)).toBeEnabled();
    await expect(startButton(guest)).toBeDisabled();
    await expect(startButton(guest)).toHaveAttribute('title', 'Only the host can start the match');

    await host.screenshot({ path: 'screenshots/phase3-host-lobby.png' });
    await guest.screenshot({ path: 'screenshots/phase3-guest-lobby.png' });

    // 6. The guest leaves; the host's roster shrinks without a stale ghost.
    await guest.getByTestId('leave-room').click();
    await expect(guest).toHaveURL(/#\/home$/);
    await expect(host.getByText('1/8 players')).toBeVisible({ timeout: 15_000 });
    await expect(host.getByTestId('player-Player1')).toHaveCount(0);
  } finally {
    await hostContext.close().catch(() => {});
    await guestContext.close().catch(() => {});
  }
});

test('a reloaded client reclaims its slot and the host can start for both', async ({
  browser,
}: {
  browser: Browser;
}) => {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  await setupPage(host);
  await setupPage(guest);

  try {
    const code = await createRoom(host, 'Alice', 'Reconnect Arena');
    await joinByInvite(guest, code);
    await expect(host.getByText('2/8 players')).toBeVisible();

    // The guest readies up, then the tab reloads: the socket drops, the grace
    // period holds the slot, and the stored session rejoins the same player.
    await readyButton(guest).click();
    await expect(guest.getByTestId('ready-count')).toContainText('1 of 2 ready');

    await guest.reload();
    await expect(guest).toHaveURL(/#\/lobby$/, { timeout: 20_000 });
    await expect(guest.getByTestId('player-Player1')).toContainText('You', { timeout: 20_000 });
    // The rejoined slot kept its ready flag — no duplicate player was created.
    await expect(guest.getByTestId('ready-count')).toContainText('1 of 2 ready');
    await expect(host.getByText('2/8 players')).toBeVisible();
    await expect(host.getByTestId('player-Player1')).toHaveCount(1);

    // Host readies too, starts, and both clients reflect the authoritative phase.
    await readyButton(host).click();
    await expect(startButton(host)).toBeEnabled({ timeout: 15_000 });
    await host.screenshot({ path: 'screenshots/phase3-host-both-ready.png' });

    await startButton(host).click();
    await expect(host).toHaveURL(/#\/intro$/);
    // Phase 4: every client follows the match into the intro screen — the
    // lobby's old "match started" banner is gone because nobody stays there.
    await expect(guest).toHaveURL(/#\/intro$/, { timeout: 15_000 });
    await expect(
      guest.getByRole('heading', { level: 1, name: 'Game Introduction' }),
    ).toBeVisible();
    await expect(startButton(guest)).toHaveCount(0);

    await guest.screenshot({ path: 'screenshots/phase3-guest-match-started.png' });
  } finally {
    await hostContext.close().catch(() => {});
    await guestContext.close().catch(() => {});
  }
});

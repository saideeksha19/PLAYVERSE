import { expect, test, type Browser, type Page } from '@playwright/test';
import { blockExternalFonts } from './helpers';

/**
 * Phase 4 — Color Clash played by two real, independent browser contexts.
 *
 * Every assertion reads what the server broadcast to each client: the target
 * tile, the answer key on reveal, the standings. Nothing here reaches into app
 * state, so a pass means two separate players really shared one authoritative
 * match.
 */

// A five-round match with screenshots is slow because every page renders the
// WebGL world at low frame rates; the budget covers a contended full-suite run.
test.setTimeout(420_000);

/**
 * Serial: each test drives two browser contexts with the WebGL world running.
 * Two such scenarios in parallel starve the CPU and clicks stop resolving.
 */
test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'chromium-desktop',
    'Two-context gameplay runs once, on desktop Chromium',
  );
});

const ROOM_CODE = /^[A-Z0-9]{6}$/;
const PHASE_URL = /#\/(gameplay|round-results)$/;

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
  await expect(page.getByTestId('invite-prefill')).toBeVisible();
  await page.getByRole('button', { name: /^Join$/ }).click();
  await expect(page).toHaveURL(/#\/lobby$/, { timeout: 20_000 });
}

/** Host + guest in one ready lobby, match started and both on the intro. */
async function startMatch(host: Page, guest: Page, roomName: string): Promise<void> {
  const code = await createRoom(host, 'Alice', roomName);
  await joinByInvite(guest, code);
  await expect(host.getByText('2/8 players')).toBeVisible();

  await guest.getByRole('button', { name: 'Mark me ready' }).click();
  await expect(host.getByTestId('ready-count')).toContainText('1 of 2 ready', { timeout: 20_000 });
  await host.getByRole('button', { name: 'Mark me ready' }).click();
  await expect(host.getByTestId('ready-count')).toContainText('2 of 2 ready');

  const start = host.getByRole('button', { name: /Start Game/ });
  await expect(start).toBeEnabled();
  await start.click();
  await expect(host).toHaveURL(/#\/intro$/, { timeout: 20_000 });
  await expect(guest).toHaveURL(/#\/intro$/, { timeout: 20_000 });
}

/** Both players press "I'm Ready" and the server opens the round for everyone. */
async function getThroughIntro(
  host: Page,
  guest: Page,
  game: 'color-clash' | 'memory-mix',
): Promise<void> {
  await guest.getByRole('button', { name: "I'm Ready" }).click();
  await host.getByRole('button', { name: "I'm Ready" }).click();

  await expect(host).toHaveURL(/#\/gameplay$/, { timeout: 25_000 });
  await expect(guest).toHaveURL(/#\/gameplay$/, { timeout: 25_000 });
  if (game === 'memory-mix') {
    await expect(host.getByTestId('memory-prompt')).toBeVisible();
    await expect(guest.getByTestId('memory-prompt')).toBeVisible();
  } else {
    await expect(host.getByTestId('clash-target-label')).toBeVisible();
    await expect(guest.getByTestId('clash-target-label')).toBeVisible();
  }
}

const gameForRound = (round: number): 'color-clash' | 'memory-mix' =>
  round % 2 === 1 ? 'color-clash' : 'memory-mix';

/** Reads the server's sequence while the memorise window is still open. */
async function memorySequence(page: Page): Promise<string[]> {
  await expect(page.getByTestId('memory-sequence')).toBeVisible({ timeout: 5_000 });
  return page
    .getByTestId('memory-sequence-item')
    .evaluateAll((items) => items.map((item) => item.getAttribute('data-item') ?? ''));
}

async function memoryPoolIds(page: Page): Promise<string[]> {
  return page
    .getByTestId('memory-pool')
    .locator('button[data-item]')
    .evaluateAll((items) => items.map((item) => item.getAttribute('data-item') ?? ''));
}

/**
 * Host repeats the server's sequence exactly; guest deliberately taps a
 * different first symbol. Returns the sequence for reveal assertions.
 */
async function playMemoryRound(host: Page, guest: Page): Promise<string[]> {
  const sequence = await memorySequence(host);
  expect(sequence.length).toBeGreaterThan(0);
  expect(await memorySequence(guest)).toEqual(sequence);

  const hostPool = host.getByTestId('memory-pool');
  const guestPool = guest.getByTestId('memory-pool');
  const hostButtons = hostPool.locator('button[data-item]');
  const guestButtons = guestPool.locator('button[data-item]');
  await expect(hostButtons.first()).toBeEnabled({ timeout: 15_000 });
  await expect(guestButtons.first()).toBeEnabled({ timeout: 15_000 });

  const poolIds = await memoryPoolIds(host);
  const wrong = poolIds.find((id) => id !== sequence[0]) ?? poolIds[0]!;

  for (const item of sequence) {
    await hostPool.locator(`button[data-item="${item}"]`).click();
  }
  await host.getByRole('button', { name: 'Submit' }).click();
  await expect(host.getByTestId('memory-locked')).toBeVisible({ timeout: 15_000 });
  await expect(guest.getByTestId('memory-answered')).toHaveText('1 of 2 answered', {
    timeout: 20_000,
  });

  await guestPool.locator(`button[data-item="${wrong}"]`).click();
  await guest.getByRole('button', { name: 'Submit' }).click();
  return sequence;
}

async function targetLabel(page: Page): Promise<string> {
  return ((await page.getByTestId('clash-target-label').textContent()) ?? '').trim();
}

/** Every tile's accessible name, in render order. */
async function tileNames(page: Page): Promise<string[]> {
  const names: string[] = [];
  for (const tile of await page.getByTestId('clash-tiles').getByRole('button').all()) {
    names.push((await tile.getAttribute('aria-label')) ?? '');
  }
  return names;
}

/**
 * The leaderboard as each client renders it — the server's ordering. The
 * "(You)" marker is per-viewer, so it is stripped before comparing two clients.
 */
async function leaderboardRows(page: Page): Promise<string[]> {
  const rows = await page
    .getByRole('list', { name: 'Full leaderboard' })
    .locator('[data-testid^="leaderboard-"]')
    .allTextContents();
  return rows.map((row) => row.replace(' (You)', ''));
}

test('two players play all five rounds, then replay from the same result', async ({
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
    await startMatch(host, guest, 'Clash Arena');

    // The intro is server-driven: both see round one of five and can ready up.
    await expect(host.getByText('Round 1 of 5')).toBeVisible();
    await expect(guest.getByText('Round 1 of 5')).toBeVisible();
    await host.screenshot({ path: 'screenshots/phase4-host-intro.png' });
    await guest.screenshot({ path: 'screenshots/phase4-guest-intro.png' });

    await getThroughIntro(host, guest, 'color-clash');

    for (let round = 1; round <= 5; round += 1) {
      const game = gameForRound(round);
      let target = '';
      let sequence: string[] = [];

      if (game === 'color-clash') {
        // 1. Both clients were handed the same target by the server.
        target = await targetLabel(host);
        expect(target).not.toEqual('');
        expect(await targetLabel(guest)).toBe(target);

        const names = await tileNames(host);
        expect(names).toContain(`Answer ${target}`);
        // The guest deliberately picks a different, wrong tile.
        const wrong = names.find((name) => name !== `Answer ${target}`);
        expect(wrong).toBeTruthy();

        if (round === 1) {
          // The host answers first and the other client learns about it — the
          // answer-status strip is a server broadcast, not a local guess.
          await host.getByRole('button', { name: `Answer ${target}`, exact: true }).click();
          await expect(host.getByTestId('clash-locked')).toBeVisible({ timeout: 15_000 });
          await expect(guest.getByTestId('clash-answered')).toHaveText('1 of 2 answered', {
            timeout: 20_000,
          });
          await expect(guest.getByTestId('answer-status-Alice')).toContainText('✓');
          await expect(guest.getByTestId('answer-status-Player1')).toContainText('…');
          await guest.screenshot({ path: 'screenshots/phase4-guest-gameplay.png' });
        } else {
          await host.getByRole('button', { name: `Answer ${target}`, exact: true }).click();
        }

        // 2. The guest answers with a tile that is not the target.
        await guest.getByRole('button', { name: wrong!, exact: true }).click();
      } else {
        sequence = await playMemoryRound(host, guest);
        if (round === 2) {
          await guest.screenshot({ path: 'screenshots/phase4-guest-memory.png' });
        }
      }

      // 3. The server reveals the round to everybody, with the same answer key.
      await expect(host.getByTestId('round-results')).toBeVisible({ timeout: 30_000 });
      await expect(guest.getByTestId('round-results')).toBeVisible({ timeout: 30_000 });
      if (game === 'memory-mix') {
        await expect(host.getByTestId('correct-sequence-item')).toHaveCount(sequence.length);
        await expect(guest.getByTestId('correct-sequence-item')).toHaveCount(sequence.length);
      } else {
        await expect(host.getByTestId('correct-answer')).toContainText(target);
        await expect(guest.getByTestId('correct-answer')).toContainText(target);
      }

      // 4. Both players' rows (and therefore the deltas) are in both reveals.
      await expect(host.getByTestId('result-Alice')).toBeVisible();
      await expect(host.getByTestId('result-Player1')).toBeVisible();
      await expect(guest.getByTestId('result-Alice')).toBeVisible();
      await expect(guest.getByTestId('result-Player1')).toBeVisible();

      if (round === 1) {
        await expect(host.getByTestId('my-result')).toContainText('Correct');
        await expect(guest.getByTestId('my-result')).toContainText('Not this time');
        await host.screenshot({ path: 'screenshots/phase4-host-round-results.png' });
        await guest.screenshot({ path: 'screenshots/phase4-guest-round-results.png' });
      }

      if (round < 5) {
        // 5. No host click: the server's own reveal clock advances both clients.
        await expect(host).toHaveURL(/#\/intro$/, { timeout: 30_000 });
        await expect(guest).toHaveURL(/#\/intro$/, { timeout: 30_000 });
        await expect(host.getByText(`Round ${round + 1} of 5`)).toBeVisible();
        await getThroughIntro(host, guest, gameForRound(round + 1));
      }
    }

    // 6. The final reveal turns into the final standings on both clients.
    await expect(host.getByTestId('match-results')).toBeVisible({ timeout: 30_000 });
    await expect(guest.getByTestId('match-results')).toBeVisible({ timeout: 30_000 });

    const hostRows = await leaderboardRows(host);
    const guestRows = await leaderboardRows(guest);
    expect(hostRows).toHaveLength(2);
    expect(guestRows).toEqual(hostRows);
    // The host answered every round correctly, the guest never did.
    expect(hostRows[0]).toContain('Alice');

    await expect(host.getByTestId('my-finish')).toContainText('You finished #1');
    await expect(guest.getByTestId('my-finish')).toContainText('You finished #2');
    await expect(host.getByRole('heading', { level: 2, name: 'Alice wins!' })).toBeVisible();

    await host.screenshot({ path: 'screenshots/phase4-host-match-results.png' });
    await guest.screenshot({ path: 'screenshots/phase4-guest-match-results.png' });

    // 7. Replay: only the host can, and it resets both clients into round one.
    await expect(guest.getByTestId('rematch')).toHaveCount(0);
    await expect(guest.getByTestId('waiting-host')).toBeVisible();

    await host.getByTestId('rematch').click();
    await expect(host).toHaveURL(/#\/intro$/, { timeout: 25_000 });
    await expect(guest).toHaveURL(/#\/intro$/, { timeout: 25_000 });
    await expect(host.getByText('Round 1 of 5')).toBeVisible();
    await expect(guest.getByText('Round 1 of 5')).toBeVisible();
    // Ready flags and scores were reset by the server, not carried over.
    await expect(host.getByTestId('intro-status')).toContainText('0 of 2');

    await getThroughIntro(host, guest, 'color-clash');
    await expect(host.getByTestId('clash-score')).toHaveText('0');
    await expect(guest.getByTestId('clash-score')).toHaveText('0');
  } finally {
    await hostContext.close().catch(() => {});
    await guestContext.close().catch(() => {});
  }
});

test('a reloaded player rejoins a live match and the match still finishes', async ({
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
    await startMatch(host, guest, 'Reconnect Clash');
    await getThroughIntro(host, guest, 'color-clash');

    // The guest reloads mid-round: the socket drops and the server keeps the
    // slot during the grace period, then the stored session rejoins it.
    await guest.reload();
    await expect(guest).toHaveURL(PHASE_URL, { timeout: 30_000 });
    // Whichever phase the server is in, the reconnected client shows it —
    // a live target tile, a memory sequence, or the current reveal.
    await expect(
      guest
        .locator(
          '[data-testid="clash-target-label"], [data-testid="memory-prompt"], [data-testid="round-results"]',
        )
        .first(),
    ).toBeVisible({ timeout: 25_000 });

    // Nobody clicks through the remaining rounds: the match reaches its end for
    // both clients on the server's clock alone.
    await expect(host.getByTestId('match-results')).toBeVisible({ timeout: 180_000 });
    await expect(guest.getByTestId('match-results')).toBeVisible({ timeout: 30_000 });
    expect(await leaderboardRows(guest)).toEqual(await leaderboardRows(host));
    await expect(guest.getByTestId('my-finish')).toContainText('You finished');
  } finally {
    await hostContext.close().catch(() => {});
    await guestContext.close().catch(() => {});
  }
});

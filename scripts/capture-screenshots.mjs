/**
 * Captures Phase 2 screenshots with headless Chromium (works even when the
 * desktop window is minimized) while re-walking the real UI flows.
 *
 * Usage: node scripts/capture-screenshots.mjs   (dev server must be on :5173)
 */
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const BASE = 'http://localhost:5173';
const OUT = 'screenshots';

const VIEWPORTS = [
  { tag: 'desktop', width: 1440, height: 900 },
  { tag: 'mobile', width: 390, height: 844 },
];

/** Waits until the WebGL canvas shows real scene pixels (not flat clear colour). */
async function waitForWorld(page, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let last = 'no-canvas';
  while (Date.now() < deadline) {
    last = await page.evaluate(
      () =>
        new Promise((resolve) => {
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              const canvas = document.querySelector('canvas');
              if (!canvas) return resolve('no-canvas');
              const off = document.createElement('canvas');
              off.width = 64;
              off.height = 40;
              const ctx = off.getContext('2d');
              ctx.drawImage(canvas, 0, 0, 64, 40);
              const d = ctx.getImageData(0, 0, 64, 40).data;
              const seen = new Set();
              let nonSky = 0;
              for (let i = 0; i < d.length; i += 4) {
                const r = d[i], g = d[i + 1], b = d[i + 2];
                seen.add(`${r >> 4},${g >> 4},${b >> 4}`);
                if (Math.abs(r - 191) + Math.abs(g - 230) + Math.abs(b - 255) > 40) nonSky++;
              }
              const ratio = nonSky / (64 * 40);
              resolve(seen.size >= 8 && ratio >= 0.05 ? 'rendered' : `flat(${seen.size})`);
            }),
          );
        }),
    );
    if (last === 'rendered') return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`world did not render within ${timeoutMs}ms (last: ${last})`);
}

async function capture(viewport) {
  const browser = await chromium.launch({
    // Hardware WebGL like a real browser (falls back to SwiftShader if none).
    args: ['--enable-gpu', '--use-angle=d3d11', '--enable-unsafe-gpu', '--ignore-gpu-blocklist'],
  });
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error' && !/fonts\.|favicon/.test(message.text())) {
      errors.push(`console: ${message.text()}`);
    }
  });

  const shot = async (name) => {
    await waitForWorld(page);
    return page.screenshot({ path: `${OUT}/phase2-${name}-${viewport.tag}.png` });
  };
  const { expect } = await import('@playwright/test');

  // 1. Home
  await page.goto(`${BASE}/`);
  await expect(page.getByRole('button', { name: /Create a Room/ })).toBeVisible();
  await page.waitForTimeout(1200); // let the 3D world settle
  await shot('home');

  // 2. Player Setup
  await page.getByRole('button', { name: /Create a Room/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Player Setup' })).toBeVisible();
  await page.getByRole('button', { name: 'Use the Blue cube' }).click();
  await shot('setup');

  // 3. Create Room
  await page.getByRole('button', { name: /Continue/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Create Room' })).toBeVisible();
  await page.getByLabel('Room Name (optional)').fill('Fun Squad');
  await shot('create');

  // 4. Honest Phase 3 gate, then the lobby preview
  await page.getByRole('button', { name: /^Create Room$/ }).click();
  await expect(page.getByTestId('phase3-gate')).toBeVisible();
  await page.getByRole('button', { name: /Preview lobby/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Waiting Lobby' })).toBeVisible();
  await page.getByRole('button', { name: 'Mark me ready' }).click();
  await expect(page.getByRole('button', { name: 'Ready!' })).toBeVisible();
  await shot('lobby');

  // 5. Game Introduction
  await page.goto(`${BASE}/#/intro`);
  await expect(page.getByRole('heading', { level: 1, name: 'Game Introduction' })).toBeVisible();
  await shot('intro');

  // 6. Join Room with a filled code
  await page.goto(`${BASE}/#/join-room`);
  await expect(page.getByRole('heading', { level: 1, name: 'Join Room' })).toBeVisible();
  await page.getByLabel('Room code character 1').type('AB47FH', { delay: 30 });
  await shot('join');

  await browser.close();
  return errors;
}

await mkdir(OUT, { recursive: true });
let failed = false;
for (const viewport of VIEWPORTS) {
  const errors = await capture(viewport);
  if (errors.length > 0) {
    failed = true;
    console.log(`[${viewport.tag}] console errors:`);
    for (const error of errors) console.log(`  - ${error}`);
  } else {
    console.log(`[${viewport.tag}] clean — no console/page errors`);
  }
}
process.exit(failed ? 1 : 0);

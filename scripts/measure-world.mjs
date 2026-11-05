/**
 * Measures the three load milestones of the 3D background:
 *   1. canvas mount          (WebGL canvas element exists)
 *   2. first populated frame (canvas pixels contain scene content, not flat #bfe6ff)
 *   3. fallback reveal done   (CSS-sky overlay has faded to opacity 0)
 *
 * Usage: node scripts/measure-world.mjs [label]
 */
import { chromium } from '@playwright/test';

const label = process.argv[2] ?? 'run';
const URL = process.env.MEASURE_URL ?? 'http://localhost:5173/';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const started = Date.now();
await page.goto(URL, { waitUntil: 'commit' });

const milestones = { canvas: -1, world: -1, reveal: -1 };
const deadline = started + 60_000;

while (Date.now() < deadline) {
  const sample = await page.evaluate(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            const canvas = document.querySelector('canvas');
            let world = false;
            if (canvas) {
              const off = document.createElement('canvas');
              off.width = 64;
              off.height = 40;
              const ctx = off.getContext('2d');
              if (ctx) {
                ctx.drawImage(canvas, 0, 0, 64, 40);
                const d = ctx.getImageData(0, 0, 64, 40).data;
                const seen = new Set();
                let nonSky = 0;
                for (let i = 0; i < d.length; i += 4) {
                  const r = d[i];
                  const g = d[i + 1];
                  const b = d[i + 2];
                  seen.add(`${r >> 4},${g >> 4},${b >> 4}`);
                  if (Math.abs(r - 191) + Math.abs(g - 230) + Math.abs(b - 255) > 40) nonSky++;
                }
                world = seen.size >= 8 && nonSky / (64 * 40) >= 0.05;
              }
            }
            const fallback = document.querySelector('[data-testid=world-fallback]');
            const overlay = fallback ? fallback.parentElement : null;
            const opacity = overlay ? Number(getComputedStyle(overlay).opacity) : -1;
            resolve({ canvas: Boolean(canvas), world, opacity });
          }),
        );
      }),
  );

  const elapsed = Date.now() - started;
  if (sample.canvas && milestones.canvas < 0) milestones.canvas = elapsed;
  if (sample.world && milestones.world < 0) milestones.world = elapsed;
  if (milestones.world > 0 && sample.opacity === 0 && milestones.reveal < 0) {
    milestones.reveal = elapsed;
    break;
  }
  await new Promise((resolve) => setTimeout(resolve, 120));
}

console.log(
  `[${label}] canvas=${milestones.canvas}ms firstPopulatedFrame=${milestones.world}ms fallbackFadeDone=${milestones.reveal}ms`,
);
await browser.close();
process.exit(milestones.world > 0 && milestones.reveal > 0 ? 0 : 1);

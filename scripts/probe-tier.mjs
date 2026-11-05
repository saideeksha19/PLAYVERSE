/**
 * Attribution + reduced-motion probe (SwiftShader unless --gpu elsewhere).
 *
 * Usage: node scripts/probe-tier.mjs
 *   MEASURE_URL overrides target (default http://localhost:5173/)
 *
 * Scenarios (one browser launch, sequential):
 *   1. high        — baseline desktop, same viewport as before
 *   2. low-hw      — navigator.hardwareConcurrency overridden to 2 so the
 *                    app's detectDeviceTier picks 'low' (shadows off, fewer
 *                    clouds/islands) at an identical pixel count → isolates
 *                    shadow + object-count cost
 *   3. small       — high tier, 720x450 viewport → isolates fill-rate cost
 *   4. reduced     — prefers-reduced-motion: the reveal state, overlay
 *                    opacity, and a screenshot of what the user actually sees
 */
import { writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const url = process.env.MEASURE_URL ?? 'http://localhost:5173/';
const browser = await chromium.launch();

/** rAF cadence over a window (page main thread, blocked by GL backpressure). */
async function sample(page, ms) {
  return page.evaluate(
    (windowMs) =>
      new Promise((resolve) => {
        const frames = [];
        const start = performance.now();
        function tick(now) {
          frames.push(now);
          if (now - start < windowMs) {
            requestAnimationFrame(tick);
          } else {
            const deltas = [];
            for (let i = 1; i < frames.length; i += 1) deltas.push(frames[i] - frames[i - 1]);
            deltas.sort((a, b) => a - b);
            const pct = (p) => (deltas.length ? Math.round(deltas[Math.floor(deltas.length * p)]) : -1);
            resolve({
              frames: frames.length,
              fps: Number((frames.length / ((frames.at(-1) - frames[0]) / 1000)).toFixed(1)),
              p50: pct(0.5),
              worst: deltas.length ? Math.round(deltas.at(-1)) : -1,
            });
          }
        }
        requestAnimationFrame(tick);
      }),
    ms,
  );
}

/** True once canvas pixels contain scene content (frameloop: always only). */
async function waitForWorld(page, timeout = 45_000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const state = await page.evaluate(
      () =>
        new Promise((resolve) => {
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              const canvas = document.querySelector('canvas');
              if (!canvas) return resolve(false);
              const off = document.createElement('canvas');
              off.width = 64;
              off.height = 40;
              const ctx = off.getContext('2d');
              if (!ctx) return resolve(false);
              ctx.drawImage(canvas, 0, 0, 64, 40);
              const d = ctx.getImageData(0, 0, 64, 40).data;
              const seen = new Set();
              let nonSky = 0;
              for (let i = 0; i < d.length; i += 4) {
                seen.add(`${d[i] >> 4},${d[i + 1] >> 4},${d[i + 2] >> 4}`);
                if (Math.abs(d[i] - 191) + Math.abs(d[i + 1] - 230) + Math.abs(d[i + 2] - 255) > 40) {
                  nonSky += 1;
                }
              }
              resolve(seen.size >= 8 && nonSky / (64 * 40) >= 0.05);
            }),
          );
        }),
    );
    if (state) return Date.now() - start;
    await new Promise((r) => setTimeout(r, 120));
  }
  return -1;
}

async function run(name, { initScript, viewport = { width: 1440, height: 900 }, reduced = false } = {}) {
  const context = await browser.newContext({ viewport });
  if (initScript) await context.addInitScript(initScript);
  const page = await context.newPage();
  if (reduced) await page.emulateMedia({ reducedMotion: 'reduce' });
  const started = Date.now();
  await page.goto(url, { waitUntil: 'commit' });

  const worldMs = await waitForWorld(page);
  const stats = await sample(page, 5000);

  const extra = {};
  if (reduced) {
    // Give the scene every chance to settle, then record reveal + screenshot.
    await new Promise((r) => setTimeout(r, 6000));
    extra.reveal = await page.evaluate(() => {
      const fallback = document.querySelector('[data-testid=world-fallback]');
      const overlay = fallback?.parentElement;
      return overlay ? Number(getComputedStyle(overlay).opacity) : -999;
    });
    const shot = `screenshots/diag-reduced-motion.png`;
    await page.screenshot({ path: shot });
    extra.screenshot = shot;
  }

  console.log(JSON.stringify({ scenario: name, worldMs, loadMs: Date.now() - started, ...stats, ...extra }));
  await context.close();
}

await run('high');
await run('low-hw', {
  initScript: () => {
    Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', { get: () => 2 });
  },
});
await run('small-720x450', { viewport: { width: 720, height: 450 } });
await run('reduced-motion', { reduced: true });

await browser.close();

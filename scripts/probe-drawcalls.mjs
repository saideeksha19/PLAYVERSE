/**
 * Counts WebGL draw calls per second on the live page to verify:
 *   - normal motion: continuous rendering with a bounded draw-call budget
 *   - reduced motion: the render loop stops (no unnecessary rendering)
 *
 * Usage: node scripts/probe-drawcalls.mjs [normal|reduced]
 *   MEASURE_URL overrides target (default http://localhost:5173/)
 */
import { chromium } from '@playwright/test';

const mode = process.argv[2] ?? 'normal';
const url = process.env.MEASURE_URL ?? 'http://localhost:5173/';
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addInitScript(() => {
  // Wrap WebGL draw entry points before app code runs.
  const counts = { draw: 0, clear: 0, frames: [] };
  (window).__glCounts = counts;
  for (const proto of [WebGL2RenderingContext.prototype, WebGLRenderingContext.prototype]) {
    for (const name of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
      const original = proto[name];
      if (typeof original !== 'function') continue;
      proto[name] = function wrapped(...callArgs) {
        counts.draw += 1;
        return original.apply(this, callArgs);
      };
    }
    const originalClear = proto.clear;
    proto.clear = function wrappedClear(...callArgs) {
      counts.clear += 1;
      return originalClear.apply(this, callArgs);
    };
  }
});
const page = await context.newPage();
if (mode === 'reduced') await page.emulateMedia({ reducedMotion: 'reduce' });
await page.goto(url, { waitUntil: 'load' });

// Let the scene load and settle first.
await new Promise((r) => setTimeout(r, 15_000));
await page.evaluate(() => {
  const counts = window.__glCounts;
  counts.markA = counts.draw;
  counts.clearA = counts.clear;
});
await new Promise((r) => setTimeout(r, 5_000));
const result = await page.evaluate(() => {
  const counts = window.__glCounts;
  return {
    drawsIn5s: counts.draw - counts.markA,
    clearsIn5s: counts.clear - counts.clearA,
    drawsPerSecond: (counts.draw - counts.markA) / 5,
  };
});
console.log(JSON.stringify({ mode, ...result }));
await browser.close();

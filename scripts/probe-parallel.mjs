/**
 * Six simultaneous page loads against the dev server — mimics Playwright's
 * 6-worker run. Reports per-page: WebGL renderer string, UI/canvas/world
 * milestones. Usage: node scripts/probe-parallel.mjs [url]
 */
import { chromium } from '@playwright/test';

const url = process.argv[2] ?? 'http://localhost:5173/';
const browser = await chromium.launch({
  args: ['--enable-gpu', '--use-angle=d3d11', '--enable-unsafe-gpu', '--ignore-gpu-blocklist'],
});

async function oneLoad(index) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const started = Date.now();
  await page.goto(url, { waitUntil: 'commit' });

  const renderer = await page.evaluate(() => {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') ?? c.getContext('webgl');
    if (!gl) return 'NO-WEBGL';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return String(name);
  });

  let uiMs = -1;
  let canvasMs = -1;
  let worldMs = -1;
  const deadline = started + 45_000;
  while (Date.now() < deadline && worldMs < 0) {
    const s = await page.evaluate(
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
                    seen.add(`${d[i] >> 4},${d[i + 1] >> 4},${d[i + 2] >> 4}`);
                    if (Math.abs(d[i] - 191) + Math.abs(d[i + 1] - 230) + Math.abs(d[i + 2] - 255) > 40) {
                      nonSky += 1;
                    }
                  }
                  world = seen.size >= 8 && nonSky / (64 * 40) >= 0.05;
                }
              }
              resolve({
                ui: Boolean(document.querySelector('.pv-logo__ribbon')),
                canvas: Boolean(canvas),
                world,
              });
            }),
          );
        }),
    );
    const elapsed = Date.now() - started;
    if (s.ui && uiMs < 0) uiMs = elapsed;
    if (s.canvas && canvasMs < 0) canvasMs = elapsed;
    if (s.world) worldMs = elapsed;
    await new Promise((r) => setTimeout(r, 80));
  }

  await context.close();
  return {
    page: index,
    renderer: renderer.includes('SwiftShader') ? 'SwiftShader' : renderer.includes('D3D11') || renderer.includes('Direct3D') ? 'D3D11-GPU' : renderer.slice(0, 60),
    uiMs,
    canvasMs,
    worldMs,
  };
}

const results = await Promise.all(Array.from({ length: 6 }, (_, i) => oneLoad(i + 1)));
for (const r of results) console.log(JSON.stringify(r));
await browser.close();

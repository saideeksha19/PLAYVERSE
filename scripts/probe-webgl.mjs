/**
 * WebGL + performance probe.
 *
 * Usage: node scripts/probe-webgl.mjs [default|gpu]
 *   MEASURE_URL overrides the target (default http://localhost:5173/)
 *
 * Reports: GL renderer string, UI-commit / canvas / populated-frame timings,
 * and the frame-time distribution (fps, p50, p95, worst) once the world is
 * visible, plus long tasks observed during the sampling window.
 */
import { chromium } from '@playwright/test';

const mode = process.argv[2] ?? 'default';
const url = process.env.MEASURE_URL ?? 'http://localhost:5173/';
const args =
  mode === 'gpu'
    ? ['--enable-gpu', '--use-angle=d3d11', '--enable-unsafe-gpu', '--ignore-gpu-blocklist']
    : [];

const dsf = Number(process.env.DSF ?? '1');
const browser = await chromium.launch({ args });
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: dsf,
});

const started = Date.now();
await page.goto(url, { waitUntil: 'commit' });

const renderer = await page.evaluate(() => {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
  if (!gl) return 'NO-WEBGL';
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  const vendor = ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return `${vendor} | ${name}`;
});

// Milestones: UI commit, canvas mount, first populated frame.
let uiMs = -1;
let canvasMs = -1;
let worldMs = -1;
const deadline = started + 45_000;
while (Date.now() < deadline && worldMs < 0) {
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
  if (sample.ui && uiMs < 0) uiMs = elapsed;
  if (sample.canvas && canvasMs < 0) canvasMs = elapsed;
  if (sample.world) worldMs = elapsed;
  if (uiMs < 0 || canvasMs < 0) {
    await new Promise((r) => setTimeout(r, 60));
  }
}

// Frame-time distribution over a 6s window on the live page.
const stats = await page.evaluate(
  () =>
    new Promise((resolve) => {
      const frames = [];
      const longTasks = [];
      const longTaskObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          longTasks.push(Math.round(entry.duration));
        }
      });
      try {
        longTaskObserver.observe({ entryTypes: ['longtask'] });
      } catch {
        /* longtask unsupported */
      }
      const start = performance.now();
      function tick(now) {
        frames.push(now);
        if (now - start < 6000) {
          requestAnimationFrame(tick);
        } else {
          longTaskObserver.disconnect();
          const deltas = [];
          for (let i = 1; i < frames.length; i += 1) deltas.push(frames[i] - frames[i - 1]);
          deltas.sort((a, b) => a - b);
          const pct = (p) => (deltas.length ? Math.round(deltas[Math.floor(deltas.length * p)]) : -1);
          resolve({
            frameCount: frames.length,
            fps: Number((frames.length / ((frames.at(-1) - frames[0]) / 1000)).toFixed(1)),
            p50: pct(0.5),
            p95: pct(0.95),
            worst: deltas.length ? Math.round(deltas.at(-1)) : -1,
            longTasks,
          });
        }
      }
      requestAnimationFrame(tick);
    }),
);

console.log(
  JSON.stringify(
    { mode, dsf, url, renderer, uiMs, canvasMs, worldMs, ...stats },
    null,
    2,
  ),
);
await browser.close();

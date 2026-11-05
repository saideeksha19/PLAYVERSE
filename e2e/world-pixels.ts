import { expect, type Page } from '@playwright/test';

/** Flat clear colour of the scene — a canvas showing only this is a failure. */
const CLEAR_COLOR = { r: 191, g: 230, b: 255 }; // #bfe6ff

interface WorldPixelStats {
  canvas: boolean;
  distinct: number;
  nonSky: number;
}

/**
 * Samples the live WebGL canvas by drawing it (same animation frame, after
 * three.js's render callback) into a small 2D canvas. Counts distinct
 * quantised colours and the fraction of pixels that are not the flat clear
 * colour — a rendered world has sky gradient + clouds + islands (high values);
 * an empty scene scores ~1 and 0.
 */
export function worldPixelStats(page: Page): Promise<WorldPixelStats> {
  return page.evaluate(
    ({ clear }) =>
      new Promise<WorldPixelStats>((resolve) => {
        // double rAF: our callback runs after three's render in this frame.
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            const canvas = document.querySelector('canvas');
            if (!canvas) return resolve({ canvas: false, distinct: 0, nonSky: 0 });

            const width = 64;
            const height = 40;
            const offscreen = document.createElement('canvas');
            offscreen.width = width;
            offscreen.height = height;
            const context = offscreen.getContext('2d');
            if (!context) return resolve({ canvas: false, distinct: 0, nonSky: 0 });

            context.drawImage(canvas, 0, 0, width, height);
            const pixels = context.getImageData(0, 0, width, height).data;

            const seen = new Set<string>();
            let nonSky = 0;
            for (let i = 0; i < pixels.length; i += 4) {
              const r = pixels[i]!;
              const g = pixels[i + 1]!;
              const b = pixels[i + 2]!;
              seen.add(`${r >> 4},${g >> 4},${b >> 4}`);
              if (Math.abs(r - clear.r) + Math.abs(g - clear.g) + Math.abs(b - clear.b) > 40) {
                nonSky += 1;
              }
            }
            resolve({ canvas: true, distinct: seen.size, nonSky: nonSky / (width * height) });
          }),
        );
      }),
    { clear: CLEAR_COLOR },
  );
}

/**
 * Polls until the canvas shows actual rendered scene pixels instead of the
 * flat clear colour. Thresholds sit far between the two measured states:
 * flat = (distinct 1–2, nonSky 0), world = (distinct 233, nonSky 0.88).
 */
export async function expectWorldRendered(page: Page, timeout = 30_000): Promise<void> {
  await expect
    .poll(
      async () => {
        const stats = await worldPixelStats(page);
        if (!stats.canvas) return 'no-canvas';
        return stats.distinct >= 8 && stats.nonSky >= 0.05
          ? 'rendered'
          : `flat(distinct=${stats.distinct}, nonSky=${stats.nonSky.toFixed(2)})`;
      },
      { timeout, intervals: [500], message: '3D world should show rendered scene pixels' },
    )
    .toBe('rendered');
}

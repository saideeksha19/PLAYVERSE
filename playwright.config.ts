import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const BASE_URL = `http://localhost:${PORT}`;

/**
 * Browser matrix: Chromium on desktop and a mobile viewport, plus Firefox and
 * WebKit on desktop. The two-context gameplay suites run once on desktop
 * Chromium because each scenario keeps several WebGL pages rendering.
 *
 * Runs against the production build (vite preview), not the dev server:
 * six parallel workers cold-loading Vite's module graph measured 15–19s to
 * a first world frame (vs ~10s for the built app), which starved the
 * load-timing assertions. The built artifact is what ships, so it is what
 * the suite verifies.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  // Measured: every page renders the WebGL world continuously, so two workers
  // oversubscribe this machine as soon as two specs each drive several browser
  // contexts (Phase 3 + Phase 4 time out at 5 minutes when they overlap). One
  // worker keeps the whole suite deterministic; the phase tests still run
  // their own scenarios in sequence.
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      // Run on hardware WebGL like a real desktop browser. SwiftShader
      // (software GL) renders the world at ~2 FPS and starves parallel
      // workers of CPU; when no GPU is available Chrome silently falls back
      // to SwiftShader, so this degrades safely on GPU-less machines.
      args: ['--enable-gpu', '--use-angle=d3d11', '--enable-unsafe-gpu', '--ignore-gpu-blocklist'],
    },
  },
  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'chromium-mobile',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'firefox-desktop',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit-desktop',
      use: { ...devices['Desktop Safari'] },
    },
  ],
  webServer: {
    // Production build served by vite preview, with the Socket.IO server
    // alongside — Phase 3 e2e exercises real rooms through the preview proxy.
    command:
      'npm run build -w @playverse/client && concurrently -k -n api,web "npm run dev:server" "npm run preview -w @playverse/client -- --port 4173 --strictPort"',
    // The API must sit on the port the preview proxy targets (:3001). Pin it so
    // an ambient PORT (CI runners, sandboxes) cannot move it out from under us.
    // Match timings are shortened so a five-round e2e match stays quick; the
    // server still owns the clock, the e2e just makes it faster.
    env: {
      PORT: '3001',
      PLAYVERSE_ROUND_MS: '10000',
      PLAYVERSE_REVEAL_MS: '5000',
      PLAYVERSE_INTRO_MS: '4000',
    },
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});

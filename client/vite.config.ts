import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Same-origin API access in both dev and preview: the Express/Socket.IO
 * server runs on :3001. The preview proxy is what lets Playwright's
 * production-preview suite talk to the real server without CORS juggling.
 */
const proxy = {
  '/api': { target: 'http://localhost:3001', changeOrigin: false },
  '/socket.io': { target: 'http://localhost:3001', ws: true },
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: false,
    proxy,
  },
  preview: { port: 5173, proxy },
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    restoreMocks: true,
  },
});

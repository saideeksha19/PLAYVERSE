import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import { getFakeSocket, resetFakeSocket } from './fakeSocket';

/**
 * No client test opens a real Socket.IO connection. The app's socket module is
 * replaced for every suite, so screens and the room provider run against an
 * in-memory fake that records intents and replays server events.
 */
vi.mock('../net/socket', async () => {
  const fake = await import('./fakeSocket');
  return {
    getSocket: fake.getFakeSocket,
    resetSocket: fake.resetFakeSocket,
  };
});

// A fresh fake socket (and empty session storage) per test: no listener or
// stored-session leakage between cases.
beforeEach(() => {
  resetFakeSocket();
  void getFakeSocket();
});

afterEach(() => {
  cleanup();
  window.location.hash = '';
});

// jsdom does not implement matchMedia — framer-motion and our hooks need it.
if (typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string): MediaQueryList =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => undefined,
        removeListener: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => false,
      }) as MediaQueryList,
  });
}

// jsdom only provides requestAnimationFrame with pretendToBeVisual; polyfill
// defensively so motion components always have a frame source.
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 16)) as unknown as typeof requestAnimationFrame;
  globalThis.cancelAnimationFrame = ((handle: number) =>
    clearTimeout(handle)) as unknown as typeof cancelAnimationFrame;
}

// jsdom does not dispatch hashchange when window.location.hash is set.
// Navigation tests/screen logic rely on that event; fake it so route updates
// behave like a real browser when tests mutate the hash directly.
if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
  try {
    const originalSetHash = Object.getOwnPropertyDescriptor(window.location, 'hash')?.set;
    if (typeof originalSetHash === 'function') {
      Object.defineProperty(window.location, 'hash', {
        configurable: true,
        set: (value: string) => {
          originalSetHash.call(window.location, value);
          try {
            window.dispatchEvent(new HashChangeEvent('hashchange'));
          } catch {
            // jsdom may refuse HashChangeEvent construction in some versions.
          }
        },
      });
    }
  } catch {
    // Some jsdom builds seal window.location; leave the default behaviour.
  }
}

// jsdom has no ResizeObserver (drei / layout observers).
if (typeof globalThis.ResizeObserver !== 'function') {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(globalThis, 'ResizeObserver', {
    writable: true,
    configurable: true,
    value: ResizeObserverStub,
  });
}

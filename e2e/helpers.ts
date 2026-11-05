import { type Page } from '@playwright/test';

/**
 * Google Fonts are external cosmetic resources (index.html preconnect/stylesheet).
 * In offline/sandboxed E2E runs they can fail DNS; block them explicitly so
 * tests don't depend on external network and failures stay specific to the app.
 * Fulfill as valid CSS so browsers (notably WebKit strict mode) don't emit
 * console errors for a non-CSS MIME type.
 */
export async function blockExternalFonts(page: Page): Promise<void> {
  await page.route(/^https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com)\//, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/css; charset=utf-8',
      body: '/* external font blocked in E2E */\n',
    }),
  );
}

/**
 * Console/page errors that are environmental, not product defects.
 * Keep this narrow — genuine app failures must remain visible.
 */
function isBenignConsoleError(message: string): boolean {
  // Firefox reports websocket teardown/navigation noise with its own phrasing
  // when the page unloads or the preview server connection drops transiently.
  // These are specific to the app's own socket.io endpoint and to lifecycle
  // interruption; other socket/network errors remain visible.
  if (
    message.includes('localhost:4173/socket.io/') &&
    (message.includes('interrupted while the page was loading') ||
      message.includes("can\u2019t establish a connection to the server") ||
      message.includes("can't establish a connection to the server"))
  ) {
    return true;
  }
  return false;
}

function isBenignPageError(message: string): boolean {
  // Firefox can throw during websocket teardown on navigation.
  if (
    message.includes('socket.io') &&
    (message.includes('interrupted') || message.includes('connection'))
  ) {
    return true;
  }
  return false;
}

export function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => {
    if (!isBenignPageError(error.message)) errors.push(`pageerror: ${error.message}`);
  });
  page.on('console', (message) => {
    if (message.type() === 'error' && !isBenignConsoleError(message.text())) {
      errors.push(`console: ${message.text()}`);
    }
  });
  page.on('requestfailed', (request) => {
    const url = request.url();
    // Font requests are blocked above; if any still fail, treat as the known
    // cosmetic external resource. All other failed requests (app assets, API,
    // socket transport initial load errors surfaced as requests) stay visible.
    if (/^https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com)\//.test(url)) return;
    const failure = request.failure()?.errorText ?? 'unknown';
    // Aborted navigations/resource loads during intentional page transitions
    // are not app defects.
    if (
      failure === 'net::ERR_ABORTED' ||
      failure === 'NS_BINDING_ABORTED' ||
      failure === 'Load request cancelled' ||
      failure === 'cancelled'
    ) {
      return;
    }
    errors.push(`requestfailed: ${failure} ${url}`);
  });
  return errors;
}

/** Apply standard E2E environment setup and return the error collector. */
export async function setupE2EPage(page: Page): Promise<string[]> {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await blockExternalFonts(page);
  return trackErrors(page);
}

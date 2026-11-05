import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Reads the token stylesheet whether vitest runs from the repo or the client root. */
function readStylesheet(): string {
  const candidates = ['src/styles/global.css', 'client/src/styles/global.css'];
  for (const candidate of candidates) {
    try {
      return readFileSync(resolve(process.cwd(), candidate), 'utf8');
    } catch {
      // Try the next candidate location.
    }
  }
  throw new Error(`designTokens: could not locate global.css (cwd: ${process.cwd()})`);
}

const stylesheet = readStylesheet();

const APPROVED_PALETTE = [
  '#52b8ff', // sky blue
  '#102a56', // deep ocean blue
  '#101c3b', // cosmic navy
  '#7658f5', // portal purple
  '#ffd447', // energy yellow
  '#39c985', // forest green
  '#ff6b68', // coral red
  '#f7faff', // soft white
];

describe('design tokens', () => {
  it('defines the approved PLAYVERSE palette', () => {
    const lower = stylesheet.toLowerCase();
    for (const hex of APPROVED_PALETTE) {
      expect(lower).toContain(hex);
    }
  });

  it('defines the display and body typefaces', () => {
    expect(stylesheet).toContain('Fredoka');
    expect(stylesheet).toContain('Nunito');
  });

  it('defines the translucent panel treatment', () => {
    expect(stylesheet).toContain('.pv-panel');
    expect(stylesheet).toContain('backdrop-filter');
    expect(stylesheet).toContain('.pv-panel--light');
  });

  it('defines the dimensional wordmark layers', () => {
    expect(stylesheet).toContain('.pv-logo__layer--extrude');
    expect(stylesheet).toContain('.pv-logo__layer--stroke');
    expect(stylesheet).toContain('.pv-logo__layer--fill');
    expect(stylesheet).toContain('.pv-logo__ribbon');
  });

  it('honours prefers-reduced-motion at the stylesheet level', () => {
    expect(stylesheet).toContain('prefers-reduced-motion');
  });
});

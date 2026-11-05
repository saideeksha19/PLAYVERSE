import { describe, expect, it } from 'vitest';
import { SCREENS, SCREEN_BY_ID, getScreenByPath, type ScreenId } from '../screens/registry';

const EXPECTED_ORDER: ScreenId[] = [
  'home',
  'setup',
  'create-room',
  'join-room',
  'lobby',
  'intro',
  'gameplay',
  'round-results',
  'match-results',
  'guide',
  'settings',
  'connection',
];

describe('screen registry', () => {
  it('exposes exactly the 12 screens from the reference board, in order', () => {
    expect(SCREENS).toHaveLength(12);
    expect(SCREENS.map((screen) => screen.id)).toEqual(EXPECTED_ORDER);
    expect(SCREENS.map((screen) => screen.index)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
  });

  it('gives every screen a unique path and id', () => {
    const paths = SCREENS.map((screen) => screen.path);
    expect(new Set(paths).size).toBe(paths.length);
    expect(new Set(SCREENS.map((screen) => screen.id)).size).toBe(SCREENS.length);
    for (const path of paths) expect(path.startsWith('/')).toBe(true);
  });

  it('titles and subtitles match the reference copy', () => {
    expect(SCREENS[0]).toMatchObject({
      title: 'Home',
      subtitle: 'Start your PLAYVERSE adventure',
    });
    expect(SCREENS[4]).toMatchObject({
      title: 'Waiting Lobby',
      subtitle: "See who's here and get ready",
    });
    expect(SCREENS[11]).toMatchObject({
      title: 'Connection & Recovery',
      subtitle: 'Get back in the game',
    });
  });

  it('marks all twelve screens as ready in roadmap order', () => {
    const ready = SCREENS.filter((screen) => screen.status === 'ready');
    expect(ready).toHaveLength(12);
    expect(ready.map((screen) => screen.id)).toEqual(EXPECTED_ORDER);
    expect(SCREEN_BY_ID.home.phase).toBe(1);
    for (const id of ['setup', 'create-room', 'join-room', 'lobby', 'intro'] as const) {
      expect(SCREEN_BY_ID[id].phase).toBe(2);
    }
    for (const id of ['gameplay', 'round-results', 'match-results'] as const) {
      expect(SCREEN_BY_ID[id].phase).toBe(4);
    }
    for (const id of ['guide', 'settings', 'connection'] as const) {
      expect(SCREEN_BY_ID[id].phase).toBe(6);
    }
  });

  it('resolves known paths and falls back to Home for unknown ones', () => {
    expect(getScreenByPath('/lobby').id).toBe('lobby');
    expect(getScreenByPath('/match-results').id).toBe('match-results');
    expect(getScreenByPath('/definitely-not-a-screen').id).toBe('home');
    expect(getScreenByPath('').id).toBe('home');
  });
});

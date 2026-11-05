/**
 * Game-wide constants shared by client and server.
 * These are the single source of truth: never re-declare them in either side.
 */

/** Minimum players required to start a match. */
export const MIN_PLAYERS = 2;
/** Maximum players in a room. */
export const MAX_PLAYERS = 8;
/** Players a newly created room defaults to. */
export const DEFAULT_MAX_PLAYERS = 8;

/** Six-character room codes. */
export const ROOM_CODE_LENGTH = 6;
/**
 * Alphabet for room codes. Excludes I, O, 0 and 1 so codes cannot be
 * misread when shared verbally or typed from a phone.
 */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Every match lasts exactly five rounds. */
export const TOTAL_ROUNDS = 5;

/** The two mini-games, played in this order during a match. */
export const GAME_IDS = ['color-clash', 'memory-mix'] as const;
export type GameId = (typeof GAME_IDS)[number];

/** Room rule sets. */
export const GAME_MODES = ['classic', 'family-friendly'] as const;
export type GameMode = (typeof GAME_MODES)[number];

/**
 * Socket.IO protocol version. Bumped whenever the event contract changes
 * in a way older clients cannot handle; the server rejects mismatches.
 */
export const PROTOCOL_VERSION = 1;

/** Nickname limits (trimmed before validation). */
export const NICKNAME_MIN_LENGTH = 2;
export const NICKNAME_MAX_LENGTH = 16;

/** Optional room name limits. */
export const ROOM_NAME_MAX_LENGTH = 24;

/**
 * Color Clash rules. Shared so the intro screen advertises exactly the
 * numbers the server enforces — there is no second copy to drift.
 *
 * Scoring (deterministic, see `server/src/games/colorClash.ts`):
 *  - correct answer  → `correctPoints`
 *  - speed bonus     → up to `maxSpeedBonus`, scaled by the fraction of the
 *                      round that was still on the clock when the server
 *                      *received* the answer (rounded down)
 *  - wrong answer    → `penalty` (classic) or 0 (family-friendly)
 *  - no answer       → 0
 * Scores never drop below zero.
 */
export const COLOR_CLASH_RULES = {
  correctPoints: 10,
  maxSpeedBonus: 5,
  classicPenalty: 5,
  familyPenalty: 0,
  /** Tiles per round: later rounds are harder to scan. */
  tilesPerRound: [4, 4, 6, 6, 6],
} as const;

/**
 * Memory Mix rules. Shared so the intro advertises exactly what the server
 * enforces.
 *
 * Scoring (see `server/src/games/memoryMix.ts`):
 *  - full correct sequence → `correctPoints` + speed bonus (up to 5)
 *  - partial correct → scaled points by position (no big penalty)
 *  - wrong/empty → 0 in classic, 0 in family-friendly (no invented penalty)
 */
export const MEMORY_MIX_RULES = {
  correctPoints: 12,
  maxSpeedBonus: 5,
  classicPenalty: 0,
  familyPenalty: 0,
  /** Sequence length per round (increasing). */
  sequenceLengths: [3, 4, 4, 5, 6],
  /** Memorisation time per round in ms. */
  memoriseMs: [3000, 3500, 3000, 3500, 4000],
  /** Answer time per round in ms. */
  answerMs: [8000, 9000, 9000, 10000, 12000],
} as const;

/** The match alternates: round 1 -> Color Clash, round 2 -> Memory Mix, etc. */
export function gameForRound(roundIndex: number): GameId {
  return roundIndex % 2 === 1 ? 'color-clash' : 'memory-mix';
}

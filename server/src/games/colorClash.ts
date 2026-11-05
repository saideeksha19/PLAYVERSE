/**
 * Color Clash — the rules.
 *
 * Everything in this file is pure: given the same inputs it produces the
 * same round and the same score. The socket layer never computes points,
 * never picks the target colour and never reads a client-supplied score —
 * it only feeds server-recorded answers through `scoreAnswer`.
 *
 * Accessibility: every colour has a name and a glyph. A tile is never
 * identifiable by hue alone, so colour-blind players play the same game —
 * they match name + symbol instead of colour.
 */
import {
  COLOR_CLASH_RULES,
  type AnswerChoice,
  type GameId,
  type GameMode,
  type LeaderboardEntry,
  type Player,
  type RoundQuestion,
} from '@playverse/shared';

export interface PaletteColor {
  id: string;
  /** Accessible name, e.g. "Azure". */
  label: string;
  /** Accessible glyph, e.g. "●". */
  symbol: string;
  /** Swatch colour shown on the target card and the tiles. */
  color: string;
}

/**
 * The six colours Color Clash draws from. Each name and glyph is unique, so
 * name → tile and glyph → tile are both one-to-one.
 */
export const COLOR_CLASH_PALETTE: readonly PaletteColor[] = [
  { id: 'azure', label: 'Azure', symbol: '●', color: '#4C9BFF' },
  { id: 'crimson', label: 'Crimson', symbol: '▲', color: '#FF5F58' },
  { id: 'leaf', label: 'Leaf', symbol: '■', color: '#43D08A' },
  { id: 'amber', label: 'Amber', symbol: '★', color: '#FFD447' },
  { id: 'violet', label: 'Violet', symbol: '◆', color: '#9B7BFF' },
  { id: 'teal', label: 'Teal', symbol: '✚', color: '#3ED0C8' },
] as const;

export function paletteColor(id: string): PaletteColor {
  return COLOR_CLASH_PALETTE.find((entry) => entry.id === id) ?? COLOR_CLASH_PALETTE[0]!;
}

/** Fisher–Yates over a copy; injectable rng keeps tests deterministic. */
function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(rng() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap]!, copy[index]!];
  }
  return copy;
}

function tileCountFor(roundIndex: number): number {
  const table = COLOR_CLASH_RULES.tilesPerRound;
  return table[Math.min(Math.max(roundIndex - 1, 0), table.length - 1)]!;
}

export interface BuildRoundInput {
  roundIndex: number;
  gameId: GameId;
  mode: GameMode;
  /** Server clock (ms) when the round opens. */
  startsAt: number;
  /** Round length (ms). */
  roundMs: number;
  rng?: () => number;
}

export interface BuiltRound {
  question: RoundQuestion;
  /** Never leaves the server before the reveal. */
  correctChoiceId: string;
}

/**
 * Builds one round: a target colour plus a randomised tile set that contains
 * exactly one matching tile. Later rounds use more tiles.
 */
export function buildRound(input: BuildRoundInput): BuiltRound {
  const rng = input.rng ?? Math.random;
  const tileCount = tileCountFor(input.roundIndex);
  const pool = shuffle(COLOR_CLASH_PALETTE, rng).slice(0, tileCount);
  const target = pool[Math.floor(rng() * pool.length)] ?? COLOR_CLASH_PALETTE[0]!;

  const choices: AnswerChoice[] = shuffle(pool, rng).map((entry) => ({
    id: entry.id,
    label: entry.label,
    symbol: entry.symbol,
    color: entry.color,
  }));

  return {
    correctChoiceId: target.id,
    question: {
      roundIndex: input.roundIndex,
      gameId: input.gameId,
      prompt: `Tap ${target.label} ${target.symbol}`,
      choices,
      stimulus: {
        kind: 'color-swatch',
        color: target.color,
        label: target.label,
        symbol: target.symbol,
      },
      startedAt: input.startsAt,
      endsAt: input.startsAt + input.roundMs,
    },
  };
}

export interface ScoreInput {
  correct: boolean;
  /** Milliseconds from round start to server receipt; null when no answer. */
  elapsedMs: number | null;
  roundMs: number;
  mode: GameMode;
}

export interface ScoreBreakdown {
  points: number;
  timeBonus: number;
  /** Negative; 0 for correct answers, no answer, and family-friendly mode. */
  penalty: number;
  total: number;
}

/**
 * Deterministic scoring.
 *
 *  correct  → +10, plus a speed bonus of
 *             floor((remaining / roundMs) * 5)  (0…5)
 *  wrong    → -5 in classic mode, 0 in family-friendly mode
 *  no answer→ 0 (a timeout is not punished)
 *
 * `elapsedMs` always comes from server timestamps (receipt − round start).
 */
export function scoreAnswer(input: ScoreInput): ScoreBreakdown {
  if (input.elapsedMs === null) return { points: 0, timeBonus: 0, penalty: 0, total: 0 };

  if (!input.correct) {
    const penalty =
      input.mode === 'family-friendly' ? COLOR_CLASH_RULES.familyPenalty : COLOR_CLASH_RULES.classicPenalty;
    // `penalty` is stored as a negative delta; keep 0 as 0, never -0.
    const delta = penalty === 0 ? 0 : -penalty;
    return { points: 0, timeBonus: 0, penalty: delta, total: delta };
  }

  const roundMs = Math.max(1, input.roundMs);
  const elapsed = Math.min(Math.max(input.elapsedMs, 0), roundMs);
  const remainingFraction = (roundMs - elapsed) / roundMs;
  const timeBonus = Math.floor(remainingFraction * COLOR_CLASH_RULES.maxSpeedBonus);

  return {
    points: COLOR_CLASH_RULES.correctPoints,
    timeBonus,
    penalty: 0,
    total: COLOR_CLASH_RULES.correctPoints + timeBonus,
  };
}

/**
 * Final standings: score desc, then earliest joiner, then id — a total order,
 * so two clients can never disagree about ranks or ties.
 */
export function buildLeaderboard(players: readonly Player[]): LeaderboardEntry[] {
  return [...players]
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.joinedAt - right.joinedAt ||
        (left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
    )
    .map((player, index) => ({
      rank: index + 1,
      playerId: player.id,
      nickname: player.nickname,
      avatarId: player.avatarId,
      score: player.score,
    }));
}

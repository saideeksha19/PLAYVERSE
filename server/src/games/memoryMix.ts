import {
  MEMORY_MIX_RULES,
  type GameId,
  type GameMode,
  type RoundQuestion,
} from '@playverse/shared';

export interface MemoryMixRoundInput {
  roundIndex: number;
  gameId: GameId;
  mode: GameMode;
  startsAt: number;
  /** Total round length: memorisation window plus answer window. */
  roundMs: number;
  /** Injectable rng keeps tests deterministic; defaults to Math.random. */
  rng?: () => number;
}

export interface MemoryMixRound {
  correctSequence: readonly string[];
  question: RoundQuestion;
}

const POOL: readonly string[] = [
  'star',
  'heart',
  'diamond',
  'circle',
  'triangle',
  'square',
  'bolt',
  'moon',
  'sun',
  'leaf',
];

const LABELS: Record<string, { label: string; symbol: string }> = {
  star: { label: 'Star', symbol: '★' },
  heart: { label: 'Heart', symbol: '♥' },
  diamond: { label: 'Diamond', symbol: '◆' },
  circle: { label: 'Circle', symbol: '●' },
  triangle: { label: 'Triangle', symbol: '▲' },
  square: { label: 'Square', symbol: '■' },
  bolt: { label: 'Bolt', symbol: '⚡' },
  moon: { label: 'Moon', symbol: '☾' },
  sun: { label: 'Sun', symbol: '☀' },
  leaf: { label: 'Leaf', symbol: '🍃' },
};

/** Per-round timings derived from the shared rules. */
export function memoryMixTiming(roundIndex: number): {
  length: number;
  memoriseMs: number;
  answerMs: number;
  totalMs: number;
} {
  const index = Math.min(Math.max(roundIndex - 1, 0), MEMORY_MIX_RULES.sequenceLengths.length - 1);
  const memoriseMs = MEMORY_MIX_RULES.memoriseMs[index] ?? 3000;
  const answerMs = MEMORY_MIX_RULES.answerMs[index] ?? 8000;
  return {
    length: MEMORY_MIX_RULES.sequenceLengths[index] ?? 3,
    memoriseMs,
    answerMs,
    totalMs: memoriseMs + answerMs,
  };
}

/** Random sequence with repeats, drawn from the public symbol pool. */
function generateSequence(rng: () => number, length: number): string[] {
  const sequence: string[] = [];
  for (let i = 0; i < length; i += 1) {
    const idx = Math.min(POOL.length - 1, Math.floor(rng() * POOL.length));
    sequence.push(POOL[idx]!);
  }
  return sequence;
}

/**
 * Validates a comma-joined Memory Mix submission against the public pool and
 * the round's maximum length. Partial sequences are allowed (they score by
 * position); unknown symbols, empty entries and over-long sequences are not.
 */
export function parseMemoryMixSubmission(
  choiceId: string,
  pool: readonly string[],
  maxLength: number,
): string[] | null {
  if (typeof choiceId !== 'string' || choiceId.length === 0) return null;
  const items = choiceId.split(',');
  if (items.length === 0 || items.length > maxLength) return null;
  if (items.some((item) => item.length === 0 || !pool.includes(item))) return null;
  return items;
}

export function buildMemoryMixRound(input: MemoryMixRoundInput): MemoryMixRound {
  const timing = memoryMixTiming(input.roundIndex);
  const length = timing.length;
  const memoriseMs = timing.memoriseMs;
  const correctSequence = generateSequence(input.rng ?? Math.random, length);
  const memoriseUntil = input.startsAt + memoriseMs;

  const choices = POOL.map((id) => ({
    id,
    label: LABELS[id]?.label ?? id,
    symbol: LABELS[id]?.symbol,
  }));

  return {
    correctSequence,
    question: {
      roundIndex: input.roundIndex,
      gameId: input.gameId,
      prompt: 'Watch the sequence, then repeat it in order.',
      choices,
      stimulus: {
        kind: 'memory-sequence',
        // Server sends sequence only up to memoriseUntil; client must hide after
        sequence: correctSequence,
        memoriseUntil,
        length,
        pool: [...POOL],
      },
      startedAt: input.startsAt,
      endsAt: input.startsAt + input.roundMs,
    },
  };
}

export interface MemoryMixScoreInput {
  submitted: string[] | null;
  correctSequence: readonly string[];
  elapsedMs: number | null;
  roundMs: number;
  mode: GameMode;
}

export interface MemoryMixScoreBreakdown {
  points: number;
  timeBonus: number;
  penalty: number;
  total: number;
}

/** Score based on correct sequence positions. */
export function scoreMemoryMix(input: MemoryMixScoreInput): MemoryMixScoreBreakdown {
  if (input.elapsedMs === null || !input.submitted || input.submitted.length === 0) {
    return { points: 0, timeBonus: 0, penalty: 0, total: 0 };
  }

  let correctPositions = 0;
  const maxLen = Math.max(input.correctSequence.length, input.submitted.length);
  for (let i = 0; i < maxLen && i < input.correctSequence.length && i < input.submitted.length; i += 1) {
    if (input.submitted[i] === input.correctSequence[i]) correctPositions += 1;
  }

  if (correctPositions === 0) {
    return { points: 0, timeBonus: 0, penalty: 0, total: 0 };
  }

  const ratio = correctPositions / input.correctSequence.length;
  let points = Math.floor(MEMORY_MIX_RULES.correctPoints * ratio);
  if (ratio === 1 && correctPositions === input.correctSequence.length) {
    points = MEMORY_MIX_RULES.correctPoints;
  }

  let timeBonus = 0;
  if (ratio === 1) {
    const roundMs = Math.max(1, input.roundMs);
    const elapsed = Math.min(Math.max(input.elapsedMs, 0), roundMs);
    const remainingFraction = (roundMs - elapsed) / roundMs;
    timeBonus = Math.floor(remainingFraction * MEMORY_MIX_RULES.maxSpeedBonus);
  }

  const total = points + timeBonus;
  return { points, timeBonus, penalty: 0, total };
}

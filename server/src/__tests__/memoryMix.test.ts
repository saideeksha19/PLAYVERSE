import { describe, expect, it } from 'vitest';
import { MEMORY_MIX_RULES } from '@playverse/shared';
import {
  buildMemoryMixRound,
  memoryMixTiming,
  parseMemoryMixSubmission,
  scoreMemoryMix,
} from '../games/memoryMix';

const BASE = {
  roundIndex: 2,
  gameId: 'memory-mix' as const,
  mode: 'classic' as const,
  startsAt: 1_000,
};

describe('memory mix rules', () => {
  it('builds a random sequence from the public pool with the round length', () => {
    const timing = memoryMixTiming(2);
    const first = buildMemoryMixRound({ ...BASE, roundMs: timing.totalMs, rng: () => 0.05 });
    const second = buildMemoryMixRound({ ...BASE, roundMs: timing.totalMs, rng: () => 0.95 });

    expect(first.correctSequence).toHaveLength(timing.length);
    expect(first.correctSequence.every((item) => first.question.choices.some((choice) => choice.id === item))).toBe(true);
    expect(second.correctSequence).not.toEqual(first.correctSequence);
    expect(first.question.endsAt - first.question.startedAt).toBe(timing.totalMs);
    const stimulus = first.question.stimulus;
    expect(stimulus.kind).toBe('memory-sequence');
    if (stimulus.kind === 'memory-sequence') {
      expect(stimulus.memoriseUntil).toBe(BASE.startsAt + timing.memoriseMs);
      expect(stimulus.length).toBe(timing.length);
    }
  });

  it('uses the shared increasing sequence lengths and timings', () => {
    expect(memoryMixTiming(1).length).toBe(MEMORY_MIX_RULES.sequenceLengths[0]);
    expect(memoryMixTiming(5).length).toBe(MEMORY_MIX_RULES.sequenceLengths[4]);
    expect(memoryMixTiming(2).totalMs).toBe(
      MEMORY_MIX_RULES.memoriseMs[1]! + MEMORY_MIX_RULES.answerMs[1]!,
    );
  });

  it('validates submissions against the pool and the round length', () => {
    const pool = ['star', 'heart', 'moon'];
    expect(parseMemoryMixSubmission('star,heart', pool, 3)).toEqual(['star', 'heart']);
    expect(parseMemoryMixSubmission('star,star,star', pool, 3)).toEqual([
      'star',
      'star',
      'star',
    ]);
    expect(parseMemoryMixSubmission('star,neon', pool, 3)).toBeNull();
    expect(parseMemoryMixSubmission('star,,heart', pool, 3)).toBeNull();
    expect(parseMemoryMixSubmission('', pool, 3)).toBeNull();
    expect(parseMemoryMixSubmission('star,heart,moon,star', pool, 3)).toBeNull();
  });

  it('scores full and partial sequences without a penalty', () => {
    const correct = ['star', 'heart', 'moon'];
    const full = scoreMemoryMix({
      submitted: correct,
      correctSequence: correct,
      elapsedMs: 0,
      roundMs: 8_000,
      mode: 'classic',
    });
    expect(full.points).toBe(MEMORY_MIX_RULES.correctPoints);
    expect(full.timeBonus).toBe(MEMORY_MIX_RULES.maxSpeedBonus);
    expect(full.total).toBe(MEMORY_MIX_RULES.correctPoints + MEMORY_MIX_RULES.maxSpeedBonus);

    const partial = scoreMemoryMix({
      submitted: ['star', 'moon'],
      correctSequence: correct,
      elapsedMs: 2_000,
      roundMs: 8_000,
      mode: 'classic',
    });
    expect(partial.points).toBeGreaterThan(0);
    expect(partial.points).toBeLessThan(MEMORY_MIX_RULES.correctPoints);
    expect(partial.timeBonus).toBe(0);
    expect(partial.penalty).toBe(0);

    expect(
      scoreMemoryMix({
        submitted: ['moon'],
        correctSequence: correct,
        elapsedMs: 2_000,
        roundMs: 8_000,
        mode: 'classic',
      }).total,
    ).toBe(0);
  });
});

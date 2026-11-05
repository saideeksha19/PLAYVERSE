import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  COLOR_CLASH_RULES,
  TOTAL_ROUNDS,
  type MatchResults,
  type RoundQuestion,
} from '@playverse/shared';
import { RoomService } from '../rooms';
import { MatchEngine, type MatchEmitter, type MatchTimings } from '../match';
import { buildRound, scoreAnswer } from '../games/colorClash';
import { memoryMixTiming } from '../games/memoryMix';

/**
 * Match lifecycle under a fake clock.
 *
 * These tests are about what the engine does with time: when it advances on
 * its own, that it advances exactly once, and that every timer it owns is
 * released when the match or the room goes away. Real-socket behaviour is
 * covered separately in colorClash.integration.test.ts.
 */
const TIMINGS: MatchTimings = { roundMs: 1000, revealMs: 500, introMs: 2000 };

function harness(timings: MatchTimings = TIMINGS) {
  const rooms = new RoomService(500);
  const intro = vi.fn();
  const roundStart = vi.fn();
  const answers = vi.fn();
  const reveal = vi.fn();
  const results = vi.fn();
  const emitter: MatchEmitter = { intro, roundStart, answers, reveal, results };
  const match = new MatchEngine(rooms, timings, emitter);

  const created = rooms.create('sock-host', {
    nickname: 'Alice',
    avatarId: 'red',
    maxPlayers: 8,
    mode: 'classic',
  });
  if (!created.ok) throw new Error(created.error.message);
  const code = created.data.state.code;

  const joined = rooms.join('sock-guest', { code, nickname: 'Bob', avatarId: 'blue' });
  if (!joined.ok) throw new Error(joined.error.message);

  const hostId = created.data.playerId;
  const guestId = joined.data.playerId;

  const readyAndStart = () => {
    rooms.setReady('sock-host', true);
    rooms.setReady('sock-guest', true);
    const started = rooms.startMatch('sock-host');
    if (!started.ok) throw new Error(started.error.message);
    match.begin(code);
  };

  const currentQuestion = () => {
    const call = roundStart.mock.calls.at(-1);
    if (!call) throw new Error('no round started');
    return call[1] as RoundQuestion;
  };

  /** The answer a player should submit for the current round. */
  const matchingChoice = (question: RoundQuestion) => {
    if (question.stimulus.kind === 'memory-sequence' && question.stimulus.sequence) {
      return question.stimulus.sequence.join(',');
    }
    if (question.stimulus.kind !== 'color-swatch') throw new Error('not a color round');
    const { label } = question.stimulus;
    return question.choices.find((choice) => choice.label === label)!.id;
  };

  return {
    rooms,
    match,
    code,
    hostId,
    guestId,
    spied: { intro, roundStart, answers, reveal, results },
    readyAndStart,
    currentQuestion,
    matchingChoice,
  };
}

describe('match lifecycle timing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('opens the round from the intro timer without any client action', () => {
    const { spied, readyAndStart, code, rooms } = harness();
    readyAndStart();

    expect(spied.intro).toHaveBeenCalledTimes(1);
    expect(rooms.getRoom(code)!.status).toBe('intro');
    expect(spied.roundStart).not.toHaveBeenCalled();

    vi.advanceTimersByTime(TIMINGS.introMs);

    expect(spied.roundStart).toHaveBeenCalledTimes(1);
    expect(rooms.getRoom(code)!.status).toBe('playing');
  });

  it('plays a whole match with no host Continue, auto-advancing every round', () => {
    const { spied, readyAndStart, code, rooms, match, hostId, guestId, currentQuestion, matchingChoice } =
      harness();
    readyAndStart();
    vi.advanceTimersByTime(TIMINGS.introMs);

    for (let round = 1; round <= TOTAL_ROUNDS; round += 1) {
      const question = currentQuestion();
      expect(question.roundIndex).toBe(round);

      vi.advanceTimersByTime(100);
      expect(match.answer(code, hostId, { roundIndex: round, choiceId: matchingChoice(question) }).ok).toBe(true);
      expect(match.answer(code, guestId, { roundIndex: round, choiceId: matchingChoice(question) }).ok).toBe(true);

      // Everyone answered → the reveal is immediate, no clock to wait out.
      expect(spied.reveal).toHaveBeenCalledTimes(round);
      expect(rooms.getRoom(code)!.status).toBe('round-results');

      // The pause is the only thing between rounds; the server walks forward.
      vi.advanceTimersByTime(TIMINGS.revealMs);

      if (round < TOTAL_ROUNDS) {
        expect(rooms.getRoom(code)!.status).toBe('intro');
        vi.advanceTimersByTime(TIMINGS.introMs);
        expect(rooms.getRoom(code)!.status).toBe('playing');
      }
    }

    expect(spied.results).toHaveBeenCalledTimes(1);
    expect(rooms.getRoom(code)!.status).toBe('match-results');
    const leaderboard = (spied.results.mock.calls[0]![1] as MatchResults).leaderboard;
    expect(leaderboard).toHaveLength(2);
    expect(leaderboard[0]!.score).toBeGreaterThan(0);
    expect(leaderboard.map((entry) => entry.rank)).toEqual([1, 2]);
  });

  it('advances only once when the host skips the pause and the timer also fires', () => {
    const { spied, readyAndStart, code, rooms, match, hostId, guestId, currentQuestion, matchingChoice } =
      harness();
    readyAndStart();
    vi.advanceTimersByTime(TIMINGS.introMs);

    const question = currentQuestion();
    match.answer(code, hostId, { roundIndex: 1, choiceId: matchingChoice(question) });
    match.answer(code, guestId, { roundIndex: 1, choiceId: matchingChoice(question) });
    expect(spied.reveal).toHaveBeenCalledTimes(1);

    // Host skips, then the (already cancelled) results timer would have fired.
    expect(match.advance(code).ok).toBe(true);
    vi.advanceTimersByTime(TIMINGS.revealMs + 10);

    // Exactly one new intro, and it is for round 2 — not two advances stacked.
    expect(spied.intro).toHaveBeenCalledTimes(2);
    expect(spied.intro.mock.calls[1]![1].roundIndex).toBe(2);
    expect(rooms.getRoom(code)!.roundIndex).toBe(2);
    expect(rooms.getRoom(code)!.status).toBe('intro');

    // ...and the ordinary intro timer opens round 2 exactly once.
    vi.advanceTimersByTime(TIMINGS.introMs);
    expect(spied.roundStart).toHaveBeenCalledTimes(2);
    expect(rooms.getRoom(code)!.roundIndex).toBe(2);
    expect(rooms.getRoom(code)!.status).toBe('playing');
  });

  it('stops emitting once the match has finished', () => {
    const { spied, readyAndStart, code, match, hostId, guestId, currentQuestion, matchingChoice } = harness({
      roundMs: 500,
      revealMs: 100,
      introMs: 100,
    });
    readyAndStart();
    vi.advanceTimersByTime(100);

    for (let round = 1; round <= TOTAL_ROUNDS; round += 1) {
      const question = currentQuestion();
      match.answer(code, hostId, { roundIndex: round, choiceId: matchingChoice(question) });
      match.answer(code, guestId, { roundIndex: round, choiceId: matchingChoice(question) });
      vi.advanceTimersByTime(200);
    }
    expect(spied.results).toHaveBeenCalledTimes(1);

    const snapshot = {
      intro: spied.intro.mock.calls.length,
      roundStart: spied.roundStart.mock.calls.length,
      reveal: spied.reveal.mock.calls.length,
    };
    vi.advanceTimersByTime(60_000);

    // A finished match is inert: no phantom rounds, no second results screen.
    expect(spied.intro).toHaveBeenCalledTimes(snapshot.intro);
    expect(spied.roundStart).toHaveBeenCalledTimes(snapshot.roundStart);
    expect(spied.reveal).toHaveBeenCalledTimes(snapshot.reveal);
    expect(spied.results).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('releases every timer when the match is cleared', () => {
    const { spied, readyAndStart, code, match, rooms } = harness();
    readyAndStart();
    vi.advanceTimersByTime(TIMINGS.introMs);
    expect(vi.getTimerCount()).toBe(1); // the round deadline

    match.clearAll();
    expect(vi.getTimerCount()).toBe(0);
    const frozen = { roundStart: spied.roundStart.mock.calls.length, reveal: spied.reveal.mock.calls.length };

    vi.advanceTimersByTime(60_000);
    expect(spied.roundStart).toHaveBeenCalledTimes(frozen.roundStart);
    expect(spied.reveal).toHaveBeenCalledTimes(frozen.reveal);
    expect(match.isLive(code)).toBe(false);
    expect(rooms.getRoom(code)!.status).toBe('playing'); // room untouched, timers gone
  });

  it('releases every timer when the room disappears', () => {
    const { readyAndStart, code, match, rooms, hostId, guestId } = harness();
    readyAndStart();
    vi.advanceTimersByTime(TIMINGS.introMs);

    // Both players drop past the grace window, as the socket layer would.
    rooms.handleDisconnect('sock-host');
    rooms.handleDisconnect('sock-guest');
    vi.advanceTimersByTime(600);
    match.departure(code, hostId);
    match.departure(code, guestId);

    expect(rooms.getRoom(code)).toBeUndefined();
    expect(match.isLive(code)).toBe(false);
    expect(match.roundOf(code)).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('closes the round exactly once when a late answer arrives after the deadline', () => {
    const { spied, readyAndStart, code, match, rooms, hostId, currentQuestion, matchingChoice } = harness();
    readyAndStart();
    vi.advanceTimersByTime(TIMINGS.introMs);

    const question = currentQuestion();
    // Jump past the deadline but leave the timer unfired, as a busy event loop would.
    vi.setSystemTime(new Date(Date.now() + TIMINGS.roundMs + 5));

    const late = match.answer(code, hostId, { roundIndex: 1, choiceId: matchingChoice(question) });
    expect(late.ok).toBe(false);
    if (!late.ok) expect(late.error.code).toBe('round-closed');
    expect(match.roundOf(code)!.closed).toBe(true);
    expect(rooms.getRoom(code)!.status).toBe('round-results');
    expect(spied.reveal).toHaveBeenCalledTimes(1);

    // The round's own timer firing afterwards must not score the round again.
    vi.advanceTimersByTime(TIMINGS.roundMs);
    expect(spied.reveal).toHaveBeenCalledTimes(1);
  });

  it('refuses a second answer and an answer from another round', () => {
    const { readyAndStart, code, match, hostId, currentQuestion, matchingChoice } = harness();
    readyAndStart();
    vi.advanceTimersByTime(TIMINGS.introMs);

    const question = currentQuestion();
    expect(match.answer(code, hostId, { roundIndex: 1, choiceId: matchingChoice(question) }).ok).toBe(true);

    const duplicate = match.answer(code, hostId, { roundIndex: 1, choiceId: matchingChoice(question) });
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) expect(duplicate.error.code).toBe('duplicate-answer');

    const stale = match.answer(code, hostId, { roundIndex: 4, choiceId: matchingChoice(question) });
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.error.code).toBe('round-closed');
  });

  it('never scores a disconnected player', () => {
    const { readyAndStart, code, match, rooms, hostId, guestId, currentQuestion, matchingChoice } = harness();
    readyAndStart();
    vi.advanceTimersByTime(TIMINGS.introMs);

    // The guest drops: their slot stays, but they are no longer connected.
    rooms.handleDisconnect('sock-guest');
    match.departure(code, guestId);

    const question = currentQuestion();
    const attempt = match.answer(code, guestId, { roundIndex: 1, choiceId: matchingChoice(question) });
    expect(attempt.ok).toBe(false);
    if (!attempt.ok) expect(attempt.error.code).toBe('wrong-phase');

    // Host answering closes the round: one answer, one reveal.
    expect(match.answer(code, hostId, { roundIndex: 1, choiceId: matchingChoice(question) }).ok).toBe(true);
    vi.advanceTimersByTime(TIMINGS.revealMs);
  });

  it('alternates into Memory Mix and validates the submitted sequence', () => {
    const { spied, readyAndStart, code, match, rooms, hostId, guestId, currentQuestion, matchingChoice } =
      harness();
    readyAndStart();
    vi.advanceTimersByTime(TIMINGS.introMs);

    // Finish round 1 (Color Clash) to reach the Memory Mix intro.
    const first = currentQuestion();
    match.answer(code, hostId, { roundIndex: 1, choiceId: matchingChoice(first) });
    match.answer(code, guestId, { roundIndex: 1, choiceId: matchingChoice(first) });
    vi.advanceTimersByTime(TIMINGS.revealMs);
    vi.advanceTimersByTime(TIMINGS.introMs);

    const question = currentQuestion();
    const timing = memoryMixTiming(2);
    expect(question.roundIndex).toBe(2);
    expect(question.gameId).toBe('memory-mix');
    expect(question.stimulus.kind).toBe('memory-sequence');
    expect(question.endsAt - question.startedAt).toBe(timing.totalMs);
    if (question.stimulus.kind === 'memory-sequence') {
      expect(question.stimulus.sequence).toHaveLength(timing.length);
    }
    expect(spied.intro.mock.calls.at(-1)?.[1].gameId).toBe('memory-mix');

    const unknown = match.answer(code, hostId, { roundIndex: 2, choiceId: 'neon' });
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.error.code).toBe('invalid-answer');

    const tooLong = Array.from({ length: timing.length + 1 }, () => 'star').join(',');
    const overlong = match.answer(code, hostId, { roundIndex: 2, choiceId: tooLong });
    expect(overlong.ok).toBe(false);
    if (!overlong.ok) expect(overlong.error.code).toBe('invalid-answer');

    const correct = matchingChoice(question);
    expect(match.answer(code, hostId, { roundIndex: 2, choiceId: correct }).ok).toBe(true);
    expect(match.answer(code, guestId, { roundIndex: 2, choiceId: correct }).ok).toBe(true);
    expect(rooms.getRoom(code)!.status).toBe('round-results');
  });
});

describe('color clash rules', () => {
  it('builds a deterministic round from a seeded rng', () => {
    const seed = () => {
      let state = 42;
      return () => {
        state = (state * 1103515245 + 12345) % 2147483648;
        return state / 2147483648;
      };
    };
    const first = buildRound({
      roundIndex: 3,
      gameId: 'color-clash',
      mode: 'classic',
      startsAt: 1000,
      roundMs: 12_000,
      rng: seed(),
    });
    const second = buildRound({
      roundIndex: 3,
      gameId: 'color-clash',
      mode: 'classic',
      startsAt: 1000,
      roundMs: 12_000,
      rng: seed(),
    });

    expect(second).toEqual(first);
    expect(first.question.choices).toHaveLength(COLOR_CLASH_RULES.tilesPerRound[2]);
    expect(first.question.choices.filter((choice) => choice.id === first.correctChoiceId)).toHaveLength(1);
    expect(first.question.endsAt - first.question.startedAt).toBe(12_000);
    expect(first.question.stimulus).toMatchObject({ kind: 'color-swatch' });
    const labels = new Set(first.question.choices.map((choice) => choice.label));
    expect(labels.size).toBe(first.question.choices.length);
  });

  it('scores correct answers with a shrinking speed bonus', () => {
    const base = { correct: true, roundMs: 10_000, mode: 'classic' as const };
    expect(scoreAnswer({ ...base, elapsedMs: 0 })).toEqual({ points: 10, timeBonus: 5, penalty: 0, total: 15 });
    expect(scoreAnswer({ ...base, elapsedMs: 5_000 })).toEqual({ points: 10, timeBonus: 2, penalty: 0, total: 12 });
    expect(scoreAnswer({ ...base, elapsedMs: 9_999 })).toEqual({ points: 10, timeBonus: 0, penalty: 0, total: 10 });
    expect(scoreAnswer({ ...base, elapsedMs: 20_000 })).toEqual({ points: 10, timeBonus: 0, penalty: 0, total: 10 });
  });

  it('penalises wrong answers by mode and spares timeouts', () => {
    expect(scoreAnswer({ correct: false, elapsedMs: 400, roundMs: 10_000, mode: 'classic' })).toEqual({
      points: 0,
      timeBonus: 0,
      penalty: -COLOR_CLASH_RULES.classicPenalty,
      total: -COLOR_CLASH_RULES.classicPenalty,
    });
    expect(scoreAnswer({ correct: false, elapsedMs: 400, roundMs: 10_000, mode: 'family-friendly' }).total).toBe(0);
    expect(scoreAnswer({ correct: false, elapsedMs: null, roundMs: 10_000, mode: 'classic' }).total).toBe(0);
  });
});

/**
 * Match engine — server-authoritative Color Clash lifecycle.
 *
 * The client can only ever ask to do things (ready up, submit a choice,
 * continue). This engine owns the match state, the round deadlines, the
 * target colour, the accepted answers and the scores. Answers are stamped
 * with `Date.now()` on arrival, never with anything the client sent.
 */
import {
  COLOR_CLASH_RULES,
  MEMORY_MIX_RULES,
  MIN_PLAYERS,
  TOTAL_ROUNDS,
  err,
  gameForRound,
  ok,
  type AnswerReceipt,
  type GameId,
  type GameIntro,
  type MatchResults,
  type PlayerId,
  type Result,
  type RoomCode,
  type RoomState,
  type RoundAnswerState,
  type RoundPlayerResult,
  type RoundQuestion,
  type RoundReveal,
} from '@playverse/shared';
import { buildLeaderboard, buildRound, paletteColor, scoreAnswer } from './games/colorClash';
import {
  buildMemoryMixRound,
  memoryMixTiming,
  parseMemoryMixSubmission,
  scoreMemoryMix,
} from './games/memoryMix';
import type { RoomService } from './rooms';

/** Per-round deadlines, injected so integration tests can run quickly. */
export interface MatchTimings {
  roundMs: number;
  revealMs: number;
  introMs: number;
}

export const DEFAULT_TIMINGS: MatchTimings = {
  roundMs: 12_000,
  revealMs: 5_000,
  introMs: 15_000,
};

/**
 * Phase 5 uses alternating games: Color Clash and Memory Mix.
 */
export const GAME_FOR_MATCH: GameId = 'color-clash';

/** Server → clients. The socket layer binds these to a room channel. */
export interface MatchEmitter {
  intro: (code: RoomCode, intro: GameIntro) => void;
  roundStart: (code: RoomCode, question: RoundQuestion) => void;
  answers: (code: RoomCode, payload: RoundAnswerState) => void;
  reveal: (code: RoomCode, reveal: RoundReveal) => void;
  results: (code: RoomCode, results: MatchResults) => void;
}

interface ActiveRound {
  roundIndex: number;
  gameId: GameId;
  question: RoundQuestion;
  correctChoiceId: string;
  correctSequence?: readonly string[];
  startedAt: number;
  endsAt: number;
  /** Scoring window: memorisation time is excluded for Memory Mix. */
  answerMs: number;
  /** Memory Mix only: server clock when the sequence is hidden. */
  memoriseUntil?: number;
  answered: Map<PlayerId, { choiceId: string; receivedAt: number }>;
  closed: boolean;
  timer: ReturnType<typeof setTimeout> | null;
}

interface ActiveMatch {
  code: RoomCode;
  gameId: GameId;
  readied: Set<PlayerId>;
  intro: GameIntro | null;
  introStartsAt: number;
  introTimer: ReturnType<typeof setTimeout> | null;
  round: ActiveRound | null;
  lastReveal: RoundReveal | null;
  results: MatchResults | null;
  advanceTimer: ReturnType<typeof setTimeout> | null;
}

/** Everything a reconnecting client needs to re-render its current screen. */
export interface MatchResume {
  intro?: GameIntro;
  question?: RoundQuestion;
  answers?: RoundAnswerState;
  reveal?: RoundReveal;
  results?: MatchResults;
}

const NICKNAMES: Record<GameId, { title: string; early: string; late: string }> = {
  'color-clash': {
    title: 'Color Clash',
    early: 'Tap the tile that matches the colour shown. Speed wins the bonus points.',
    late: 'More tiles this time. Match the name and shape to the target — fast.',
  },
  'memory-mix': {
    title: 'Memory Mix',
    early: 'Watch the sequence carefully, then repeat it in the correct order.',
    late: 'Longer sequences this time. Memorise quickly and reproduce in order.',
  },
};

export class MatchEngine {
  private readonly matches = new Map<RoomCode, ActiveMatch>();

  constructor(
    private readonly rooms: RoomService,
    private readonly timings: MatchTimings,
    private readonly emitter: MatchEmitter,
  ) {}

  /* ---------------------------------------------------------------- */
  /* Intro / round control                                             */
  /* ---------------------------------------------------------------- */

  /** Called after the room engine has validated and entered the intro phase. */
  begin(code: RoomCode): void {
    const room = this.rooms.getRoom(code);
    if (!room) return;
    this.matches.set(code, this.freshMatch(code));
    this.rooms.setPhase(code, 'intro', 1);
    this.enterIntro(code);
  }

  private freshMatch(code: RoomCode): ActiveMatch {
    return {
      code,
      gameId: GAME_FOR_MATCH,
      readied: new Set<PlayerId>(),
      intro: null,
      introStartsAt: 0,
      introTimer: null,
      round: null,
      lastReveal: null,
      results: null,
      advanceTimer: null,
    };
  }

  private matchFor(code: RoomCode): ActiveMatch | undefined {
    return this.matches.get(code);
  }

  private clearMatchTimers(match: ActiveMatch): void {
    if (match.introTimer) clearTimeout(match.introTimer);
    if (match.advanceTimer) clearTimeout(match.advanceTimer);
    if (match.round?.timer) clearTimeout(match.round.timer);
    match.introTimer = null;
    match.advanceTimer = null;
    if (match.round) match.round.timer = null;
  }

  /** Emits the intro for the room's current round and arms the auto-start. */
  private enterIntro(code: RoomCode): void {
    const room = this.rooms.getRoom(code);
    const match = this.matchFor(code);
    if (!room || !match) return;

    this.clearMatchTimers(match);
    match.readied = new Set<PlayerId>();
    match.lastReveal = null;
    match.introStartsAt = Date.now() + this.timings.introMs;

    const connected = room.players.filter((player) => player.connected);
    const intro: GameIntro = {
      ...this.buildIntro(room.roundIndex, room.mode),
      readyCount: 0,
      playerCount: connected.length,
      startsAt: match.introStartsAt,
    };
    match.intro = intro;
    this.rooms.setPhase(code, 'intro', room.roundIndex);
    this.emitter.intro(code, intro);

    match.introTimer = setTimeout(() => {
      match.introTimer = null;
      const live = this.rooms.getRoom(code);
      if (!live || live.status !== 'intro') return;
      this.startRound(code);
    }, this.timings.introMs);
    match.introTimer.unref?.();
  }

  private buildIntro(roundIndex: number, mode: 'classic' | 'family-friendly'): GameIntro {
    const gameId = gameForRound(roundIndex);
    const copy = NICKNAMES[gameId];
    if (gameId === 'memory-mix') {
      return {
        roundIndex,
        totalRounds: TOTAL_ROUNDS,
        gameId,
        title: copy.title,
        description: roundIndex <= 2 ? copy.early : copy.late,
        preview: null,
        scoring: {
          correct: MEMORY_MIX_RULES.correctPoints,
          fastAnswer: MEMORY_MIX_RULES.maxSpeedBonus,
          incorrect: 0,
        },
        readyCount: 0,
        playerCount: 0,
        startsAt: 0,
      };
    }
    const preview = paletteColor(['azure', 'leaf', 'amber', 'violet', 'teal'][(roundIndex - 1) % 5]!);
    return {
      roundIndex,
      totalRounds: TOTAL_ROUNDS,
      gameId,
      title: copy.title,
      description: roundIndex <= 2 ? copy.early : copy.late,
      preview: { kind: 'color-swatch', color: preview.color, label: preview.label, symbol: preview.symbol },
      scoring: {
        correct: COLOR_CLASH_RULES.correctPoints,
        fastAnswer: COLOR_CLASH_RULES.maxSpeedBonus,
        incorrect:
          mode === 'family-friendly' ? COLOR_CLASH_RULES.familyPenalty : COLOR_CLASH_RULES.classicPenalty,
      },
      readyCount: 0,
      playerCount: 0,
      startsAt: 0,
    };
  }

  /** "I'm Ready" on the intro screen; all-ready starts the round early. */
  markReady(code: RoomCode, playerId: PlayerId): Result<{ readyCount: number }> {
    const room = this.rooms.getRoom(code);
    const match = this.matchFor(code);
    if (!room || !match) return err('wrong-phase', 'There is no match running in this room.');
    if (room.status !== 'intro') return err('wrong-phase', 'This round has already started.');

    match.readied.add(playerId);
    const connected = room.players.filter((player) => player.connected);
    const readyCount = connected.filter((player) => match.readied.has(player.id)).length;

    if (connected.length > 0 && readyCount >= connected.length) {
      this.startRound(code);
      return ok({ readyCount });
    }

    // Refresh the counter for everyone; `startsAt` stays put.
    const intro: GameIntro = {
      ...(match.intro ?? this.buildIntro(room.roundIndex, room.mode)),
      readyCount,
      playerCount: connected.length,
      startsAt: match.introStartsAt,
    };
    match.intro = intro;
    this.emitter.intro(code, intro);
    return ok({ readyCount });
  }

  /** Opens the round: the question carries no answer key until reveal. */
  private startRound(code: RoomCode): void {
    const room = this.rooms.getRoom(code);
    const match = this.matchFor(code);
    if (!room || !match) return;
    if (room.status !== 'intro') return;

    this.clearMatchTimers(match);

    const startedAt = Date.now();
    const gameId = gameForRound(room.roundIndex);
    match.gameId = gameId;
    const baseRoundMs = this.timings.roundMs;

    let round: ActiveRound;
    if (gameId === 'memory-mix') {
      const timing = memoryMixTiming(room.roundIndex);
      const built = buildMemoryMixRound({
        roundIndex: room.roundIndex,
        gameId,
        mode: room.mode,
        startsAt: startedAt,
        roundMs: timing.totalMs,
      });
      round = {
        roundIndex: room.roundIndex,
        gameId,
        question: built.question,
        correctChoiceId: built.correctSequence.join(','),
        correctSequence: built.correctSequence,
        startedAt,
        endsAt: startedAt + timing.totalMs,
        answerMs: timing.answerMs,
        memoriseUntil: startedAt + timing.memoriseMs,
        answered: new Map(),
        closed: false,
        timer: null,
      };
      round.timer = setTimeout(() => this.closeRound(code), timing.totalMs);
      round.timer.unref?.();
    } else {
      const built = buildRound({
        roundIndex: room.roundIndex,
        gameId,
        mode: room.mode,
        startsAt: startedAt,
        roundMs: baseRoundMs,
      });
      round = {
        roundIndex: room.roundIndex,
        gameId,
        question: built.question,
        correctChoiceId: built.correctChoiceId,
        startedAt,
        endsAt: startedAt + baseRoundMs,
        answerMs: baseRoundMs,
        answered: new Map(),
        closed: false,
        timer: null,
      };
      round.timer = setTimeout(() => this.closeRound(code), round.answerMs);
      round.timer.unref?.();
    }

    match.round = round;
    match.lastReveal = null;

    this.rooms.setPhase(code, 'playing', room.roundIndex);
    this.emitter.roundStart(code, round.question);
    this.emitter.answers(code, { roundIndex: round.roundIndex, answeredPlayerIds: [], endsAt: round.endsAt });
  }

  /* ---------------------------------------------------------------- */
  /* Answers                                                           */
  /* ---------------------------------------------------------------- */

  answer(
    code: RoomCode,
    playerId: PlayerId,
    payload: { roundIndex: number; choiceId: string },
  ): Result<AnswerReceipt> {
    const room = this.rooms.getRoom(code);
    const match = this.matchFor(code);
    const round = match?.round;
    if (!room || !match || !round) return err('wrong-phase', 'No round is running right now.');
    if (room.status !== 'playing' || round.closed) {
      return err('round-closed', 'That round is already over.');
    }
    if (payload.roundIndex !== round.roundIndex) {
      return err('round-closed', 'That answer belongs to a finished round.');
    }

    // Server clock only — the payload carries no timing to trust.
    const receivedAt = Date.now();
    if (receivedAt > round.endsAt) {
      this.closeRound(code);
      return err('round-closed', 'Time is up for this round.');
    }

    const player = room.players.find((candidate) => candidate.id === playerId);
    if (!player || !player.connected) {
      return err('wrong-phase', 'You are not connected to this room.');
    }
    let normalizedChoiceId = payload.choiceId;
    if (round.gameId === 'color-clash') {
      if (!round.question.choices.some((choice) => choice.id === payload.choiceId)) {
        return err('invalid-answer', 'That colour is not part of this round.');
      }
    } else {
      const stimulus = round.question.stimulus;
      const maxLength = stimulus.kind === 'memory-sequence' ? stimulus.length : 0;
      const pool = round.question.choices.map((choice) => choice.id);
      const parsed = parseMemoryMixSubmission(payload.choiceId, pool, maxLength);
      if (!parsed) {
        return err('invalid-answer', 'Submit a sequence using the symbols from this round.');
      }
      normalizedChoiceId = parsed.join(',');
    }
    if (round.answered.has(playerId)) {
      return err('duplicate-answer', 'You already answered this round.');
    }

    round.answered.set(playerId, { choiceId: normalizedChoiceId, receivedAt });
    this.emitter.answers(code, {
      roundIndex: round.roundIndex,
      answeredPlayerIds: [...round.answered.keys()],
      endsAt: round.endsAt,
    });

    // Everyone still connected has answered: don't make them wait out the clock.
    if (this.everyoneAnswered(room.players, round)) this.closeRound(code);

    return ok({ choiceId: normalizedChoiceId, receivedAt });
  }

  private everyoneAnswered(
    players: readonly { id: PlayerId; connected: boolean }[],
    round: ActiveRound,
  ): boolean {
    const connected = players.filter((player) => player.connected);
    return connected.length > 0 && connected.every((player) => round.answered.has(player.id));
  }

  /** Scores the round exactly once and publishes the reveal. */
  private closeRound(code: RoomCode): void {
    const room = this.rooms.getRoom(code);
    const match = this.matchFor(code);
    const round = match?.round;
    if (!room || !match || !round || round.closed) return;

    round.closed = true;
    if (round.timer) clearTimeout(round.timer);
    round.timer = null;

    const roundMsForScore =
      round.gameId === 'memory-mix'
        ? round.answerMs
        : this.timings.roundMs;

    const results: RoundPlayerResult[] = room.players.map((player) => {
      const answer = round.answered.get(player.id);
      const rawElapsed = answer ? answer.receivedAt - round.startedAt : null;
      // Memory Mix scoring starts when the sequence is hidden, not when the
      // memorisation window opened.
      const elapsedMs =
        round.gameId === 'memory-mix' && rawElapsed !== null
          ? Math.max(0, rawElapsed - ((round.memoriseUntil ?? round.startedAt) - round.startedAt))
          : rawElapsed;
      let breakdown: { points: number; timeBonus: number; penalty: number; total: number };
      let correct = false;

      if (round.gameId === 'memory-mix') {
        const submitted = answer?.choiceId ? answer.choiceId.split(',').filter(Boolean) : null;
        const correctSeq = round.correctSequence ?? round.correctChoiceId.split(',');
        correct = submitted?.join(',') === correctSeq.join(',');
        breakdown = scoreMemoryMix({
          submitted,
          correctSequence: correctSeq,
          elapsedMs,
          roundMs: roundMsForScore,
          mode: room.mode,
        });
      } else {
        correct = answer?.choiceId === round.correctChoiceId;
        breakdown = scoreAnswer({
          correct,
          elapsedMs,
          roundMs: roundMsForScore,
          mode: room.mode,
        });
      }

      const scoreAfter = this.rooms.awardPoints(code, player.id, breakdown.total);
      return {
        playerId: player.id,
        nickname: player.nickname,
        avatarId: player.avatarId,
        choiceId: answer?.choiceId ?? null,
        correct,
        points: breakdown.points,
        timeBonus: breakdown.timeBonus,
        penalty: breakdown.penalty,
        scoreDelta: breakdown.total,
        scoreAfter,
        elapsedMs,
        connected: player.connected,
      };
    });

    const reveal: RoundReveal = {
      roundIndex: round.roundIndex,
      gameId: round.gameId,
      correctChoiceId: round.correctChoiceId,
      results,
      // Always a deadline: after the last round this advances to the final
      // results, so a match can never stall on a missing button press.
      nextAt: Date.now() + this.timings.revealMs,
    };
    match.lastReveal = reveal;

    this.rooms.setPhase(code, 'round-results', round.roundIndex);
    this.emitter.reveal(code, reveal);

    match.advanceTimer = setTimeout(() => {
      match.advanceTimer = null;
      this.advance(code);
    }, this.timings.revealMs);
    match.advanceTimer.unref?.();
  }

  /* ---------------------------------------------------------------- */
  /* Advancement                                                       */
  /* ---------------------------------------------------------------- */

  /** Host may skip the results pause; the timer calls this too. */
  advance(code: RoomCode): Result<RoomState> {
    const room = this.rooms.getRoom(code);
    const match = this.matchFor(code);
    if (!room || !match) return err('wrong-phase', 'There is no match running in this room.');
    if (room.status !== 'round-results') return err('wrong-phase', 'This round is still in progress.');

    if (match.advanceTimer) {
      clearTimeout(match.advanceTimer);
      match.advanceTimer = null;
    }

    if (room.roundIndex >= TOTAL_ROUNDS) return this.finishMatch(code);

    match.round = null;
    this.rooms.setPhase(code, 'intro', room.roundIndex + 1);
    this.enterIntro(code);
    const live = this.rooms.getRoom(code);
    return ok(live ? this.rooms.toState(live) : this.rooms.toState(room));
  }

  private finishMatch(code: RoomCode): Result<RoomState> {
    const room = this.rooms.getRoom(code);
    const match = this.matchFor(code);
    if (!room || !match) return err('wrong-phase', 'There is no match running in this room.');

    const leaderboard = buildLeaderboard(room.players);
    const results: MatchResults = {
      roundCount: TOTAL_ROUNDS,
      leaderboard,
      podium: leaderboard.slice(0, 3),
    };
    match.results = results;
    match.round = null;
    this.rooms.setPhase(code, 'match-results', TOTAL_ROUNDS);
    this.emitter.results(code, results);
    return ok(this.rooms.toState(room));
  }

  /** Host: same room, scores reset, straight back into round 1. */
  rematch(code: RoomCode): Result<RoomState> {
    const room = this.rooms.getRoom(code);
    if (!room) return err('room-not-found', 'That room no longer exists.');
    if (room.status !== 'match-results') return err('wrong-phase', 'The match has not finished yet.');

    this.clearMatchTimersFor(code);
    this.rooms.resetScores(code);
    this.rooms.resetReadiness(code);
    this.matches.set(code, this.freshMatch(code));
    this.rooms.setPhase(code, 'intro', 1);
    this.enterIntro(code);
    return ok(this.rooms.toState(room));
  }

  /** Host: back to the waiting lobby, scores cleared, ready flags reset. */
  returnToLobby(code: RoomCode): Result<RoomState> {
    const room = this.rooms.getRoom(code);
    if (!room) return err('room-not-found', 'That room no longer exists.');
    if (room.status !== 'match-results') return err('wrong-phase', 'The match has not finished yet.');

    this.clearMatchTimersFor(code);
    this.matches.delete(code);
    this.rooms.resetScores(code);
    this.rooms.resetReadiness(code);
    this.rooms.setPhase(code, 'lobby', 0);
    return ok(this.rooms.toState(room));
  }

  /* ---------------------------------------------------------------- */
  /* Reconnection + departures                                          */
  /* ---------------------------------------------------------------- */

  /**
   * What a reconnecting player must be sent so their screen matches the room:
   * the live question (with its real deadline), the pending reveal, the final
   * results, or the current intro.
   */
  resume(code: RoomCode): MatchResume {
    const room = this.rooms.getRoom(code);
    const match = this.matchFor(code);
    if (!room || !match) return {};

    // A reconnect can land after the deadline but before the timer fired.
    const round = match.round;
    if (room.status === 'playing' && round && !round.closed && Date.now() > round.endsAt) {
      this.closeRound(code);
    }

    const liveRoom = this.rooms.getRoom(code) ?? room;
    if (liveRoom.status === 'intro') {
      const connected = liveRoom.players.filter((player) => player.connected);
      const intro: GameIntro = {
        ...(match.intro ?? this.buildIntro(liveRoom.roundIndex, liveRoom.mode)),
        readyCount: connected.filter((player) => match.readied.has(player.id)).length,
        playerCount: connected.length,
        startsAt: match.introStartsAt,
      };
      match.intro = intro;
      return { intro };
    }

    if (liveRoom.status === 'playing' && match.round && !match.round.closed) {
      return {
        question: match.round.question,
        answers: {
          roundIndex: match.round.roundIndex,
          answeredPlayerIds: [...match.round.answered.keys()],
          endsAt: match.round.endsAt,
        },
      };
    }

    if (liveRoom.status === 'round-results' && match.lastReveal) {
      return { reveal: match.lastReveal };
    }

    if (liveRoom.status === 'match-results') {
      if (!match.results) {
        const leaderboard = buildLeaderboard(liveRoom.players);
        match.results = { roundCount: TOTAL_ROUNDS, leaderboard, podium: leaderboard.slice(0, 3) };
      }
      return { results: match.results };
    }

    return {};
  }

  /** A player left or dropped: never let that stall a round or an intro. */
  departure(code: RoomCode, playerId: PlayerId): void {
    const room = this.rooms.getRoom(code);
    const match = this.matchFor(code);
    if (!room) {
      this.clearMatchTimersFor(code);
      this.matches.delete(code);
      return;
    }
    if (!match) return;

    match.readied.delete(playerId);

    if (room.players.length === 0) {
      this.clearMatchTimersFor(code);
      this.matches.delete(code);
      return;
    }
    if (room.status === 'playing' && match.round && !match.round.closed) {
      if (this.everyoneAnswered(room.players, match.round)) this.closeRound(code);
      return;
    }
    if (room.status === 'intro') {
      const connected = room.players.filter((player) => player.connected);
      if (connected.length > 0 && connected.every((player) => match.readied.has(player.id))) {
        this.startRound(code);
      }
    }
  }

  /** True while a match (any phase) is live — guards host start/replay rules. */
  isLive(code: RoomCode): boolean {
    const room = this.rooms.getRoom(code);
    return Boolean(room && room.status !== 'lobby' && this.matches.has(code));
  }

  /** Current round (tests use the public question, never the answer key). */
  roundOf(code: RoomCode): { roundIndex: number; endsAt: number; closed: boolean } | null {
    const round = this.matchFor(code)?.round;
    if (!round) return null;
    return { roundIndex: round.roundIndex, endsAt: round.endsAt, closed: round.closed };
  }

  private clearMatchTimersFor(code: RoomCode): void {
    const match = this.matchFor(code);
    if (match) this.clearMatchTimers(match);
  }

  clearAll(): void {
    for (const match of this.matches.values()) this.clearMatchTimers(match);
    this.matches.clear();
  }
}

/** Keeps the minimum-players rule visible next to the lifecycle above. */
export const MATCH_MIN_PLAYERS = MIN_PLAYERS;

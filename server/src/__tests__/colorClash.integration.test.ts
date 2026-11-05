import { afterEach, describe, expect, it } from 'vitest';
import { io as connectSocket, type Socket as ClientSocket } from 'socket.io-client';
import {
  COLOR_CLASH_RULES,
  TOTAL_ROUNDS,
  type AnswerReceipt,
  type ClientToServerEvents,
  type GameIntro,
  type MatchResults,
  type PlayerIdentity,
  type Result,
  type RoomState,
  type RoundAnswerState,
  type RoundQuestion,
  type RoundReveal,
  type ServerToClientEvents,
} from '@playverse/shared';
import { startServer, type RunningServer } from '../server';
import type { ServerConfig } from '../config';

type AppClientSocket = ClientSocket<ServerToClientEvents, ClientToServerEvents>;

/**
 * Phase 4 — Color Clash, end to end over real sockets.
 *
 * Nothing here mocks the server: every assertion is about what a party of
 * genuine Socket.IO clients observes. Timings are injected so rounds close
 * quickly without any fixed sleeps — waiting is always predicate-driven.
 */
const MATCH_EVENTS = [
  'game:intro',
  'round:start',
  'round:answers',
  'round:reveal',
  'match:results',
] as const;

interface Recorder {
  /** Every payload received, in order. */
  events: Map<string, unknown[]>;
  last<T>(event: string): T | undefined;
  waitFor<T>(event: string, predicate?: (payload: T) => boolean, timeoutMs?: number): Promise<T>;
}

describe('Color Clash (server-authoritative)', () => {
  let server: RunningServer;
  const sockets: AppClientSocket[] = [];

  async function boot(overrides: Partial<ServerConfig> = {}): Promise<RunningServer> {
    server = await startServer({
      port: 0,
      host: '127.0.0.1',
      disconnectGraceMs: 400,
      roundMs: 1500,
      revealMs: 150,
      introMs: 150,
      ...overrides,
    });
    return server;
  }

  afterEach(async () => {
    for (const socket of sockets.splice(0)) {
      socket.removeAllListeners();
      socket.disconnect();
    }
    server?.rooms.clear();
    server?.match.clearAll();
    await server?.close();
  });

  async function open(raw = false): Promise<{ socket: AppClientSocket } & Recorder> {
    const socket = connectSocket(server.origin, {
      transports: ['websocket'],
      forceNew: true,
    }) as unknown as AppClientSocket;
    sockets.push(socket);

    const events = new Map<string, unknown[]>();
    for (const event of MATCH_EVENTS) events.set(event, []);
    socket.on('room:state', () => undefined);

    socket.on('game:intro', (payload) => events.get('game:intro')!.push(payload));
    socket.on('round:start', (payload) => events.get('round:start')!.push(payload));
    socket.on('round:answers', (payload) => events.get('round:answers')!.push(payload));
    socket.on('round:reveal', (payload) => events.get('round:reveal')!.push(payload));
    socket.on('match:results', (payload) => events.get('match:results')!.push(payload));

    const recorder: Recorder = {
      events,
      last: <T,>(event: string) => {
        const list = events.get(event) ?? [];
        return list[list.length - 1] as T | undefined;
      },
      waitFor: async <T,>(event: string, predicate?: (payload: T) => boolean, timeoutMs = 4000) => {
        const started = Date.now();
        for (;;) {
          const candidate = [...(events.get(event) ?? [])]
            .reverse()
            .find((payload) => (predicate ? predicate(payload as T) : true)) as T | undefined;
          if (candidate) return candidate;
          if (Date.now() - started > timeoutMs) {
            throw new Error(`timed out waiting for ${event}`);
          }
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
      },
    };

    if (raw) return { socket, ...recorder };

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('socket connect timeout')), 4000);
      socket.once('session:welcome', () => {
        clearTimeout(timer);
        resolve();
      });
    });
    return { socket, ...recorder };
  }

  function ask<T>(
    register: (ack: (result: Result<T>) => void) => void,
    label: string,
  ): Promise<Result<T>> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no ack for ${label}`)), 4000);
      register((result) => {
        clearTimeout(timer);
        resolve(result);
      });
    });
  }

  interface Party {
    code: string;
    host: { socket: AppClientSocket } & Recorder;
    guest: { socket: AppClientSocket } & Recorder;
    hostId: string;
    guestId: string;
    guestToken: string;
  }

  /** Creates a room with two real clients and starts the match. */
  async function startMatch(
    options: { mode?: 'classic' | 'family-friendly'; start?: boolean } = {},
  ): Promise<Party> {
    const host = await open();
    const guest = await open();

    const created = await ask<PlayerIdentity>(
      (ack) =>
        host.socket.emit(
          'room:create',
          { nickname: 'Alice', avatarId: 'red', maxPlayers: 8, mode: options.mode ?? 'classic' },
          ack,
        ),
      'room:create',
    );
    if (!created.ok) throw new Error(created.error.message);

    const joined = await ask<PlayerIdentity>(
      (ack) =>
        guest.socket.emit('room:join', { code: created.data.state.code, nickname: 'Bob', avatarId: 'blue' }, ack),
      'room:join',
    );
    if (!joined.ok) throw new Error(joined.error.message);

    const party: Party = {
      code: created.data.state.code,
      host,
      guest,
      hostId: created.data.playerId,
      guestId: joined.data.playerId,
      guestToken: joined.data.reconnectToken,
    };

    if (options.start !== false) {
      // The lobby gate still applies: both players ready, then the host starts.
      for (const player of [host, guest]) {
        const ready = await ask<RoomState>((ack) => player.socket.emit('player:ready', true, ack), 'player:ready');
        if (!ready.ok) throw new Error(ready.error.message);
      }
      const started = await ask<RoomState>((ack) => host.socket.emit('game:start', ack), 'game:start');
      if (!started.ok) throw new Error(started.error.message);
    }
    return party;
  }

  /** The correct answer for the current game. */
  function correctChoice(question: RoundQuestion): string {
    if (question.stimulus.kind === 'memory-sequence' && (question.stimulus as any).sequence) {
      return (question.stimulus as any).sequence.join(',');
    }
    const target = question.stimulus.kind === 'color-swatch' ? question.stimulus.label : '';
    const match = question.choices.find((choice) => choice.label === target);
    if (!match) throw new Error('no matching tile in the round');
    return match.id;
  }

  function wrongChoice(question: RoundQuestion): string {
    if (question.stimulus.kind === 'memory-sequence' && (question.stimulus as any).sequence) {
      const seq = (question.stimulus as any).sequence ?? [];
      const others = question.choices.filter((choice) => !seq.includes(choice.id));
      return others[0]?.id ?? question.choices[0]!.id;
    }
    const target = question.stimulus.kind === 'color-swatch' ? question.stimulus.label : '';
    const miss = question.choices.find((choice) => choice.label !== target);
    if (!miss) throw new Error('every tile matched the target');
    return miss.id;
  }

  const answer = (party: Party['host'], roundIndex: number, choiceId: string) =>
    ask<AnswerReceipt>(
      (ack) => party.socket.emit('game:answer', { roundIndex, choiceId }, ack),
      'game:answer',
    );

  /* ------------------------------------------------------------------ */
  /* Start + round initialisation                                        */
  /* ------------------------------------------------------------------ */

  it('moves the room into the intro, then serves the same round to both players', async () => {
    await boot();
    const party = await startMatch();

    const intro = await party.host.waitFor<GameIntro>('game:intro');
    expect(intro).toMatchObject({
      roundIndex: 1,
      totalRounds: TOTAL_ROUNDS,
      gameId: 'color-clash',
      title: 'Color Clash',
      scoring: {
        correct: COLOR_CLASH_RULES.correctPoints,
        fastAnswer: COLOR_CLASH_RULES.maxSpeedBonus,
        incorrect: COLOR_CLASH_RULES.classicPenalty,
      },
    });
    expect(intro.startsAt).toBeGreaterThan(0);

    const hostRound = await party.host.waitFor<RoundQuestion>('round:start');
    const guestRound = await party.guest.waitFor<RoundQuestion>('round:start');

    // One authoritative question: identical for every participant.
    expect(guestRound).toEqual(hostRound);
    expect(hostRound.roundIndex).toBe(1);
    expect(hostRound.endsAt).toBeGreaterThan(hostRound.startedAt);
    expect(hostRound.choices).toHaveLength(COLOR_CLASH_RULES.tilesPerRound[0]);

    // Exactly one tile matches the target, and no answer key leaks.
    const target = hostRound.stimulus.kind === 'color-swatch' ? hostRound.stimulus : null;
    expect(target).not.toBeNull();
    expect(hostRound.choices.filter((choice) => choice.label === target!.label)).toHaveLength(1);
    expect(hostRound.choices.filter((choice) => choice.symbol === target!.symbol)).toHaveLength(1);
    const wire = JSON.stringify(hostRound);
    expect(wire).not.toContain('correctChoiceId');
    expect(wire).not.toContain('correct');

    // Every tile is identifiable without colour vision.
    for (const choice of hostRound.choices) {
      expect(choice.label.length).toBeGreaterThan(0);
      expect(choice.symbol?.length).toBeGreaterThan(0);
    }
  });

  it('starts the round as soon as every player readies up, and counts them', async () => {
    await boot({ introMs: 5000 });
    const party = await startMatch();
    await party.host.waitFor('game:intro');

    const hostReady = await ask<{ readyCount: number }>(
      (ack) => party.host.socket.emit('round:ready', ack),
      'round:ready',
    );
    expect(hostReady.ok).toBe(true);
    if (hostReady.ok) expect(hostReady.data.readyCount).toBe(1);

    const refreshed = await party.guest.waitFor<GameIntro>(
      'game:intro',
      (payload) => payload.readyCount === 1,
    );
    expect(refreshed.playerCount).toBe(2);

    const guestReady = await ask<{ readyCount: number }>(
      (ack) => party.guest.socket.emit('round:ready', ack),
      'round:ready',
    );
    expect(guestReady.ok).toBe(true);

    // All ready → the round opens immediately, well before introMs elapsed.
    const question = await party.guest.waitFor<RoundQuestion>('round:start');
    expect(question.roundIndex).toBe(1);
  });

  /* ------------------------------------------------------------------ */
  /* Answers + scoring                                                   */
  /* ------------------------------------------------------------------ */

  it('accepts a correct answer, keeps the choice secret and awards points plus a speed bonus', async () => {
    await boot();
    const party = await startMatch();
    const question = await party.host.waitFor<RoundQuestion>('round:start');

    const receipt = await answer(party.host, question.roundIndex, correctChoice(question));
    expect(receipt.ok).toBe(true);
    if (receipt.ok) {
      expect(receipt.data.choiceId).toBe(correctChoice(question));
      expect(receipt.data.receivedAt).toBeGreaterThanOrEqual(question.startedAt);
      expect(receipt.data.receivedAt).toBeLessThanOrEqual(question.endsAt);
    }

    const pending = await party.guest.waitFor<RoundAnswerState>(
      'round:answers',
      (payload) => payload.answeredPlayerIds.length > 0,
    );
    // Presence of the answer only — never which tile was chosen.
    expect(pending.answeredPlayerIds).toEqual([party.hostId]);
    expect(JSON.stringify(pending)).not.toContain(correctChoice(question));

    const reveal = await party.guest.waitFor<RoundReveal>('round:reveal');
    const hostResult = reveal.results.find((result) => result.playerId === party.hostId)!;
    expect(reveal.correctChoiceId).toBe(correctChoice(question));
    expect(hostResult.correct).toBe(true);
    expect(hostResult.points).toBe(COLOR_CLASH_RULES.correctPoints);
    expect(hostResult.timeBonus).toBeGreaterThan(0);
    expect(hostResult.timeBonus).toBeLessThanOrEqual(COLOR_CLASH_RULES.maxSpeedBonus);
    expect(hostResult.scoreDelta).toBe(hostResult.points + hostResult.timeBonus);
    expect(hostResult.scoreAfter).toBe(hostResult.scoreDelta);
    expect(hostResult.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it('rejects a choice that is not part of the round', async () => {
    await boot();
    const party = await startMatch();
    const question = await party.host.waitFor<RoundQuestion>('round:start');

    const receipt = await answer(party.host, question.roundIndex, 'neon-green');
    expect(receipt.ok).toBe(false);
    if (!receipt.ok) expect(receipt.error.code).toBe('invalid-answer');
  });

  it('rejects a second answer in the same round', async () => {
    await boot({ roundMs: 4000 });
    const party = await startMatch();
    const question = await party.host.waitFor<RoundQuestion>('round:start');

    const first = await answer(party.host, question.roundIndex, correctChoice(question));
    expect(first.ok).toBe(true);

    const second = await answer(party.host, question.roundIndex, wrongChoice(question));
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error.code).toBe('duplicate-answer');
  });

  it('rejects an answer bound to a finished round index', async () => {
    await boot();
    const party = await startMatch();
    const question = await party.host.waitFor<RoundQuestion>('round:start');

    const stale = await answer(party.host, question.roundIndex + 3, correctChoice(question));
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.error.code).toBe('round-closed');
  });

  it('applies the classic penalty to a wrong answer and never goes below zero', async () => {
    await boot();
    const party = await startMatch();
    const question = await party.host.waitFor<RoundQuestion>('round:start');

    const receipt = await answer(party.host, question.roundIndex, wrongChoice(question));
    expect(receipt.ok).toBe(true);

    const reveal = await party.host.waitFor<RoundReveal>('round:reveal');
    const result = reveal.results.find((entry) => entry.playerId === party.hostId)!;
    expect(result.correct).toBe(false);
    expect(result.points).toBe(0);
    expect(result.timeBonus).toBe(0);
    expect(result.penalty).toBe(-COLOR_CLASH_RULES.classicPenalty);
    expect(result.scoreDelta).toBe(-COLOR_CLASH_RULES.classicPenalty);
    expect(result.scoreAfter).toBe(0);
  });

  it('charges no penalty for a wrong answer in family-friendly mode', async () => {
    await boot();
    const party = await startMatch({ mode: 'family-friendly' });
    const intro = await party.host.waitFor<GameIntro>('game:intro');
    expect(intro.scoring.incorrect).toBe(0);

    const question = await party.host.waitFor<RoundQuestion>('round:start');
    await answer(party.host, question.roundIndex, wrongChoice(question));

    const reveal = await party.host.waitFor<RoundReveal>('round:reveal');
    const result = reveal.results.find((entry) => entry.playerId === party.hostId)!;
    expect(result.penalty).toBe(0);
    expect(result.scoreDelta).toBe(0);
  });

  /* ------------------------------------------------------------------ */
  /* Deadlines + round completion                                        */
  /* ------------------------------------------------------------------ */

  it('closes the round on the server clock when nobody answers', async () => {
    await boot({ roundMs: 400, revealMs: 3000 });
    const party = await startMatch();
    const question = await party.host.waitFor<RoundQuestion>('round:start');
    expect(question.endsAt - question.startedAt).toBe(400);

    const reveal = await party.guest.waitFor<RoundReveal>('round:reveal');
    expect(reveal.roundIndex).toBe(question.roundIndex);
    expect(reveal.nextAt).not.toBeNull();
    for (const result of reveal.results) {
      expect(result.choiceId).toBeNull();
      expect(result.correct).toBe(false);
      expect(result.scoreDelta).toBe(0);
      expect(result.elapsedMs).toBeNull();
    }
  });

  it('rejects an answer submitted after the round has closed', async () => {
    await boot({ roundMs: 300, revealMs: 3000 });
    const party = await startMatch();
    const question = await party.host.waitFor<RoundQuestion>('round:start');
    await party.host.waitFor<RoundReveal>('round:reveal');

    const late = await answer(party.host, question.roundIndex, correctChoice(question));
    expect(late.ok).toBe(false);
    if (!late.ok) expect(late.error.code).toBe('round-closed');
  });

  it('only the host may skip the results pause', async () => {
    await boot({ roundMs: 400, revealMs: 5000 });
    const party = await startMatch();
    await party.host.waitFor<RoundReveal>('round:reveal');

    const guestTry = await ask<RoomState>(
      (ack) => party.guest.socket.emit('round:continue', ack),
      'round:continue',
    );
    expect(guestTry.ok).toBe(false);
    if (!guestTry.ok) expect(guestTry.error.code).toBe('not-host');

    const hostTry = await ask<RoomState>(
      (ack) => party.host.socket.emit('round:continue', ack),
      'round:continue',
    );
    expect(hostTry.ok).toBe(true);
    if (hostTry.ok) expect(hostTry.data.roundIndex).toBe(2);
  });

  /* ------------------------------------------------------------------ */
  /* Multiplayer sync: advancement through a whole match                 */
  /* ------------------------------------------------------------------ */

  it('advances five rounds, keeps every client in sync and produces one leaderboard', async () => {
    await boot({ roundMs: 3000, revealMs: 1200, introMs: 150 });
    const party = await startMatch();

    for (let round = 1; round <= TOTAL_ROUNDS; round += 1) {
      const question = await party.guest.waitFor<RoundQuestion>(
        'round:start',
        (payload) => payload.roundIndex === round,
      );
      expect(question.roundIndex).toBe(round);

      // Host always right, guest wrong: the standings must reflect that.
      await answer(party.host, round, correctChoice(question));
      await answer(party.guest, round, wrongChoice(question));

      const reveal = await party.host.waitFor<RoundReveal>(
        'round:reveal',
        (payload) => payload.roundIndex === round,
      );
      expect(reveal.correctChoiceId).toBe(correctChoice(question));
      expect(reveal.nextAt).toBeGreaterThan(0);

      if (round < TOTAL_ROUNDS) {
        const advanced = await ask<RoomState>(
          (ack) => party.host.socket.emit('round:continue', ack),
          'round:continue',
        );
        expect(advanced.ok).toBe(true);
      }
    }

    const hostResults = await party.host.waitFor<MatchResults>('match:results');
    const guestResults = await party.guest.waitFor<MatchResults>('match:results');

    expect(guestResults).toEqual(hostResults);
    expect(hostResults.roundCount).toBe(TOTAL_ROUNDS);
    expect(hostResults.leaderboard).toHaveLength(2);
    expect(hostResults.leaderboard[0]!.nickname).toBe('Alice');
    expect(hostResults.leaderboard[0]!.score).toBeGreaterThan(hostResults.leaderboard[1]!.score);
    expect(hostResults.podium).toHaveLength(2);
    expect(hostResults.leaderboard.map((entry) => entry.rank)).toEqual([1, 2]);

    // The final reveal stays on screen for a moment, then pulls everyone into
    // the results by itself: no host click is required to finish a match.
    const finalReveal = await party.host.waitFor<RoundReveal>(
      'round:reveal',
      (payload) => payload.roundIndex === TOTAL_ROUNDS,
    );
    expect(finalReveal.roundIndex).toBe(TOTAL_ROUNDS);
    expect(finalReveal.nextAt).toBeGreaterThan(0);
  });

  /* ------------------------------------------------------------------ */
  /* Disconnects + reconnection                                          */
  /* ------------------------------------------------------------------ */

  it('does not let a disconnected player stall the round', async () => {
    await boot({ roundMs: 5000, revealMs: 3000 });
    const party = await startMatch();
    const question = await party.host.waitFor<RoundQuestion>('round:start');

    party.guest.socket.disconnect();
    await party.host.waitFor<RoundAnswerState>('round:answers');

    await answer(party.host, question.roundIndex, correctChoice(question));
    const reveal = await party.host.waitFor<RoundReveal>('round:reveal');

    const guestResult = reveal.results.find((entry) => entry.playerId === party.guestId)!;
    expect(guestResult.choiceId).toBeNull();
    expect(guestResult.connected).toBe(false);
    expect(guestResult.scoreDelta).toBe(0);
    expect(reveal.results.find((entry) => entry.playerId === party.hostId)!.correct).toBe(true);
  });

  it('hands the live round back to a reconnecting player', async () => {
    await boot({ roundMs: 6000, revealMs: 3000 });
    const party = await startMatch();
    const question = await party.host.waitFor<RoundQuestion>('round:start');

    party.guest.socket.disconnect();
    const rejoined = await open();
    const result = await ask<{ playerId: string; state: RoomState }>(
      (ack) =>
        rejoined.socket.emit(
          'room:rejoin',
          { code: party.code, playerId: party.guestId, reconnectToken: party.guestToken },
          ack,
        ),
      'room:rejoin',
    );
    expect(result.ok).toBe(true);

    const resumed = await rejoined.waitFor<RoundQuestion>('round:start');
    expect(resumed).toEqual(question);
    const answers = await rejoined.waitFor<RoundAnswerState>('round:answers');
    expect(answers.endsAt).toBe(question.endsAt);

    // And they can still play: the re-issued question accepts an answer.
    const receipt = await answer(rejoined, resumed.roundIndex, correctChoice(resumed));
    expect(receipt.ok).toBe(true);
  });

  it('rejects answers from a socket that is not in the room', async () => {
    await boot();
    const party = await startMatch();
    const question = await party.host.waitFor<RoundQuestion>('round:start');

    const outsider = await open();
    const receipt = await ask<AnswerReceipt>(
      (ack) =>
        outsider.socket.emit(
          'game:answer',
          { roundIndex: question.roundIndex, choiceId: correctChoice(question) },
          ack,
        ),
      'game:answer',
    );
    expect(receipt.ok).toBe(false);
    if (!receipt.ok) expect(receipt.error.code).toBe('room-not-found');
  });

  /* ------------------------------------------------------------------ */
  /* Replay                                                              */
  /* ------------------------------------------------------------------ */

  it('lets only the host rematch, and resets scores into round one', async () => {
    await boot({ roundMs: 400, revealMs: 1200 });
    const party = await startMatch();

    for (let round = 1; round <= TOTAL_ROUNDS; round += 1) {
      const question = await party.host.waitFor<RoundQuestion>(
        'round:start',
        (payload) => payload.roundIndex === round,
      );
      await answer(party.host, round, correctChoice(question));
      await answer(party.guest, round, wrongChoice(question));
      await party.host.waitFor<RoundReveal>('round:reveal', (payload) => payload.roundIndex === round);
      if (round < TOTAL_ROUNDS) {
        await ask<RoomState>((ack) => party.host.socket.emit('round:continue', ack), 'round:continue');
      }
    }
    await party.host.waitFor<MatchResults>('match:results', undefined, 6000);

    const guestTry = await ask<RoomState>(
      (ack) => party.guest.socket.emit('match:rematch', ack),
      'match:rematch',
    );
    expect(guestTry.ok).toBe(false);
    if (!guestTry.ok) expect(guestTry.error.code).toBe('not-host');

    const rematch = await ask<RoomState>((ack) => party.host.socket.emit('match:rematch', ack), 'match:rematch');
    expect(rematch.ok).toBe(true);
    if (rematch.ok) {
      expect(rematch.data.status).toBe('intro');
      expect(rematch.data.roundIndex).toBe(1);
      expect(rematch.data.players.every((player) => player.score === 0)).toBe(true);
    }

    const freshIntro = await party.guest.waitFor<GameIntro>('game:intro', (payload) => payload.roundIndex === 1);
    expect(freshIntro.readyCount).toBe(0);
    const freshRound = await party.guest.waitFor<RoundQuestion>('round:start', (payload) => payload.roundIndex === 1);
    expect(freshRound.roundIndex).toBe(1);
  });

  it('lets the host return everyone to the lobby after the match', async () => {
    await boot({ roundMs: 300, revealMs: 1200 });
    const party = await startMatch();

    for (let round = 1; round <= TOTAL_ROUNDS; round += 1) {
      const question = await party.host.waitFor<RoundQuestion>(
        'round:start',
        (payload) => payload.roundIndex === round,
      );
      await answer(party.host, round, correctChoice(question));
      await answer(party.guest, round, wrongChoice(question));
      await party.host.waitFor<RoundReveal>('round:reveal', (payload) => payload.roundIndex === round);
      if (round < TOTAL_ROUNDS) {
        await ask<RoomState>((ack) => party.host.socket.emit('round:continue', ack), 'round:continue');
      }
    }
    await party.host.waitFor<MatchResults>('match:results');

    const back = await ask<RoomState>((ack) => party.host.socket.emit('match:lobby', ack), 'match:lobby');
    expect(back.ok).toBe(true);
    if (back.ok) {
      expect(back.data.status).toBe('lobby');
      expect(back.data.roundIndex).toBe(0);
      expect(back.data.players.every((player) => player.score === 0 && !player.isReady)).toBe(true);
    }

    // The lobby works again: ready up and start a second match.
    await ask<RoomState>((ack) => party.host.socket.emit('player:ready', true, ack), 'player:ready');
    await ask<RoomState>((ack) => party.guest.socket.emit('player:ready', true, ack), 'player:ready');
    const restart = await ask<RoomState>((ack) => party.host.socket.emit('game:start', ack), 'game:start');
    expect(restart.ok).toBe(true);
    const intro = await party.guest.waitFor<GameIntro>(
      'game:intro',
      (payload) => payload.roundIndex === 1 && payload.readyCount === 0,
    );
    expect(intro.roundIndex).toBe(1);
  });
});

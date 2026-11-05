/**
 * Room-state builders for client tests. They mirror the shared contract the
 * server broadcasts, so tests assert against realistic payloads rather than
 * hand-rolled objects with missing fields.
 */
import {
  ok,
  type AnswerChoice,
  type GameIntro,
  type LeaderboardEntry,
  type MatchResults,
  type Player,
  type Result,
  type RoomState,
  type RoundAnswerState,
  type RoundPlayerResult,
  type RoundQuestion,
  type RoundReveal,
} from '@playverse/shared';

export const TEST_CODE = 'AB47FH';

export interface PlayerIdentityPayload {
  playerId: string;
  reconnectToken: string;
  state: RoomState;
}

export function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: 'p1',
    nickname: 'Player1',
    avatarId: 'red',
    isHost: false,
    isReady: false,
    connected: true,
    score: 0,
    joinedAt: 0,
    ...overrides,
  };
}

export function makeRoom(overrides: Partial<RoomState> = {}): RoomState {
  const players = overrides.players ?? [makePlayer({ id: 'p1', nickname: 'Alice', isHost: true })];
  const host = players.find((player) => player.isHost);

  return {
    code: TEST_CODE,
    name: 'Fun Squad',
    hostId: host?.id ?? players[0]?.id ?? 'p1',
    maxPlayers: 8,
    mode: 'classic',
    status: 'lobby',
    roundIndex: 0,
    players,
    createdAt: 0,
    // The client derives its server-clock offset from this, so tests must use
    // a realistic value rather than a constant that predates the epoch.
    serverTime: Date.now(),
    ...overrides,
  };
}

/** Alice hosts, Bob joined — the canonical two-player lobby. */
export function twoPlayerRoom(overrides: Partial<RoomState> = {}): RoomState {
  return makeRoom({
    players: [
      makePlayer({ id: 'p1', nickname: 'Alice', isHost: true }),
      makePlayer({ id: 'p2', nickname: 'Bob' }),
    ],
    ...overrides,
  });
}

/** The two-player lobby with every player ready (start is unlocked). */
export function readyRoom(overrides: Partial<RoomState> = {}): RoomState {
  return twoPlayerRoom({
    players: [
      makePlayer({ id: 'p1', nickname: 'Alice', isHost: true, isReady: true }),
      makePlayer({ id: 'p2', nickname: 'Bob', isReady: true }),
    ],
    ...overrides,
  });
}

/** Sets the ready flag for one player, leaving everyone else untouched. */
export function withReady(state: RoomState, playerId: string, isReady: boolean): RoomState {
  return {
    ...state,
    players: state.players.map((player) =>
      player.id === playerId ? { ...player, isReady } : player,
    ),
  };
}

/** Marks one player offline while keeping their slot (grace-period state). */
export function withOffline(state: RoomState, playerId: string): RoomState {
  return {
    ...state,
    players: state.players.map((player) =>
      player.id === playerId ? { ...player, connected: false } : player,
    ),
  };
}

/** Moves the host role, as the server does on transfer. */
export function withHost(state: RoomState, playerId: string): RoomState {
  return {
    ...state,
    hostId: playerId,
    players: state.players.map((player) => ({ ...player, isHost: player.id === playerId })),
  };
}

/** Successful identity ack for `room:create`, `room:join` or `room:rejoin`. */
export function identityAck(
  playerId: string,
  state: RoomState,
  reconnectToken = 'token-1',
): Result<PlayerIdentityPayload> {
  return ok({ playerId, reconnectToken, state });
}

/* ------------------------------------------------------------------ */
/* Color Clash payloads                                                */
/* ------------------------------------------------------------------ */

/** The four tiles of an early round, in a fixed (test-friendly) order. */
export const FIXTURE_CHOICES: readonly AnswerChoice[] = [
  { id: 'azure', label: 'Azure', symbol: '●', color: '#4C9BFF' },
  { id: 'crimson', label: 'Crimson', symbol: '▲', color: '#FF5F58' },
  { id: 'leaf', label: 'Leaf', symbol: '■', color: '#43D08A' },
  { id: 'amber', label: 'Amber', symbol: '★', color: '#FFD447' },
];

/** The target matches the `amber` tile. */
export function makeQuestion(overrides: Partial<RoundQuestion> = {}): RoundQuestion {
  const startedAt = Date.now();
  return {
    roundIndex: 1,
    gameId: 'color-clash',
    prompt: 'Tap Amber ★',
    choices: FIXTURE_CHOICES,
    stimulus: { kind: 'color-swatch', color: '#FFD447', label: 'Amber', symbol: '★' },
    startedAt,
    endsAt: startedAt + 12_000,
    ...overrides,
  };
}

export function makeIntro(overrides: Partial<GameIntro> = {}): GameIntro {
  const startsAt = Date.now() + 15_000;
  return {
    roundIndex: 1,
    totalRounds: 5,
    gameId: 'color-clash',
    title: 'Color Clash',
    description: 'Tap the tile that matches the colour shown. Speed wins the bonus points.',
    preview: { kind: 'color-swatch', color: '#FFD447', label: 'Amber', symbol: '★' },
    scoring: { correct: 10, fastAnswer: 5, incorrect: 5 },
    readyCount: 0,
    playerCount: 2,
    startsAt,
    ...overrides,
  };
}

export function makeAnswers(overrides: Partial<RoundAnswerState> = {}): RoundAnswerState {
  return {
    roundIndex: 1,
    answeredPlayerIds: [],
    endsAt: Date.now() + 12_000,
    ...overrides,
  };
}

export function makeResult(overrides: Partial<RoundPlayerResult> = {}): RoundPlayerResult {
  return {
    playerId: 'p1',
    nickname: 'Alice',
    avatarId: 'red',
    choiceId: 'amber',
    correct: true,
    points: 10,
    timeBonus: 4,
    penalty: 0,
    scoreDelta: 14,
    scoreAfter: 14,
    elapsedMs: 900,
    connected: true,
    ...overrides,
  };
}

export function makeReveal(overrides: Partial<RoundReveal> = {}): RoundReveal {
  return {
    roundIndex: 1,
    gameId: 'color-clash',
    correctChoiceId: 'amber',
    results: [makeResult()],
    nextAt: Date.now() + 5_000,
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/* Memory Mix payloads                                                 */
/* ------------------------------------------------------------------ */

export const MEMORY_POOL = [
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
] as const;

export const MEMORY_SEQUENCE = ['star', 'heart', 'star'] as const;

export function makeMemoryQuestion(overrides: Partial<RoundQuestion> = {}): RoundQuestion {
  const startedAt = Date.now();
  const memoriseUntil = startedAt + 3_000;
  return {
    roundIndex: 2,
    gameId: 'memory-mix',
    prompt: 'Watch the sequence, then repeat it in order.',
    choices: MEMORY_POOL.map((id) => ({ id, label: id[0]!.toUpperCase() + id.slice(1) })),
    stimulus: {
      kind: 'memory-sequence',
      sequence: [...MEMORY_SEQUENCE],
      memoriseUntil,
      length: MEMORY_SEQUENCE.length,
      pool: [...MEMORY_POOL],
    },
    startedAt,
    endsAt: startedAt + 11_000,
    ...overrides,
  };
}

export function makeMemoryReveal(overrides: Partial<RoundReveal> = {}): RoundReveal {
  return makeReveal({
    roundIndex: 2,
    gameId: 'memory-mix',
    correctChoiceId: MEMORY_SEQUENCE.join(','),
    results: [
      makeResult({
        choiceId: MEMORY_SEQUENCE.join(','),
        nickname: 'Alice',
        points: 12,
        timeBonus: 4,
        scoreDelta: 16,
        scoreAfter: 16,
      }),
    ],
    ...overrides,
  });
}

export function makeLeaderboardEntry(overrides: Partial<LeaderboardEntry> = {}): LeaderboardEntry {
  return {
    rank: 1,
    playerId: 'p1',
    nickname: 'Alice',
    avatarId: 'red',
    score: 42,
    ...overrides,
  };
}

export function makeResults(overrides: Partial<MatchResults> = {}): MatchResults {
  const leaderboard = overrides.leaderboard ?? [
    makeLeaderboardEntry({ rank: 1, playerId: 'p1', nickname: 'Alice', score: 42 }),
    makeLeaderboardEntry({ rank: 2, playerId: 'p2', nickname: 'Bob', avatarId: 'blue', score: 31 }),
  ];
  return { roundCount: 5, leaderboard, podium: leaderboard.slice(0, 3), ...overrides };
}

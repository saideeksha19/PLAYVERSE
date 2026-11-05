/**
 * Domain types shared by client and server.
 * Pure types only — no runtime socket dependencies.
 */
import type { GameId, GameMode } from './constants';

export type PlayerId = string;
export type RoomCode = string;

/* ------------------------------------------------------------------ */
/* Avatars                                                             */
/* ------------------------------------------------------------------ */

/** A preset cube avatar. Chosen at Player Setup; no accounts, no uploads. */
export interface Avatar {
  id: string;
  label: string;
  /** Main body colour of the cube character. */
  color: string;
  /** Face / limb accent colour. */
  accent: string;
}

/** Preset avatar catalogue — matches the reference art's cube characters. */
export const AVATARS: readonly Avatar[] = [
  { id: 'red', label: 'Red', color: '#FF5F58', accent: '#E8443C' },
  { id: 'blue', label: 'Blue', color: '#4C9BFF', accent: '#2F7BF6' },
  { id: 'green', label: 'Green', color: '#43D08A', accent: '#2FAE6E' },
  { id: 'yellow', label: 'Yellow', color: '#FFD447', accent: '#F0B429' },
  { id: 'pink', label: 'Pink', color: '#FF8FC7', accent: '#F26AA9' },
  { id: 'orange', label: 'Orange', color: '#FF9F45', accent: '#F07C1F' },
  { id: 'purple', label: 'Purple', color: '#9B7BFF', accent: '#7658F5' },
  { id: 'teal', label: 'Teal', color: '#3ED0C8', accent: '#26B0A9' },
] as const;

export function getAvatar(avatarId: string): Avatar {
  return AVATARS.find((avatar) => avatar.id === avatarId) ?? AVATARS[0]!;
}

/* ------------------------------------------------------------------ */
/* Room / player state                                                 */
/* ------------------------------------------------------------------ */

export type RoomStatus =
  | 'lobby'
  | 'intro'
  | 'playing'
  | 'round-results'
  | 'match-results';

export interface Player {
  id: PlayerId;
  nickname: string;
  avatarId: string;
  isHost: boolean;
  isReady: boolean;
  /** False while disconnected; the slot is kept for reconnection. */
  connected: boolean;
  score: number;
  /** Server clock (ms) when the player joined. */
  joinedAt: number;
}

export interface Room {
  code: RoomCode;
  name: string;
  hostId: PlayerId;
  maxPlayers: number;
  mode: GameMode;
  status: RoomStatus;
  /** 0 while in the lobby, 1..TOTAL_ROUNDS during a match. */
  roundIndex: number;
  players: Player[];
  createdAt: number;
}

/** The full-state broadcast payload. This is the client's only source of truth. */
export interface RoomState extends Room {
  /** Server clock at the moment of broadcast — used for RTT/clock sync. */
  serverTime: number;
}

/* ------------------------------------------------------------------ */
/* Round / match payloads                                              */
/* ------------------------------------------------------------------ */

export interface AnswerChoice {
  id: string;
  label: string;
  /** Optional UI colour (used by Color Clash's colour-word answers). */
  color?: string;
  /**
   * Non-colour identity (a glyph such as "●" or "▲"). Colour Clash always
   * sends one so the game is playable without colour vision: every tile and
   * the target carry a name *and* a shape, never colour alone.
   */
  symbol?: string;
}

/** Colour stimulus for Color Clash. */
export interface ColorClashStimulus {
  kind: 'color-swatch';
  /** The colour shown on screen, e.g. "#52B8FF". */
  color: string;
  /** Accessible name of the target colour, e.g. "Azure". */
  label: string;
  /** Accessible glyph of the target colour, e.g. "●". */
  symbol: string;
}

/** Sequence stimulus for Memory Mix. */
export interface MemoryMixStimulus {
  kind: 'memory-sequence';
  /** Order players must reproduce (only sent during/after memorisation per server policy; client never sees before hide). */
  sequence?: readonly string[];
  /** Server clock (ms) at which the sequence must be hidden. */
  memoriseUntil: number;
  /** Number of items in the sequence. */
  length: number;
  /** Available items to choose from. */
  pool: readonly string[];
}

export type RoundStimulus = ColorClashStimulus | MemoryMixStimulus;

/**
 * What a player may see while a round is running.
 *
 * SECURITY: this payload deliberately contains no answer key. The correct
 * choice is computed server-side and only leaves the server in `RoundReveal`
 * after the round timer expires.
 */
export interface RoundQuestion {
  roundIndex: number;
  gameId: GameId;
  prompt: string;
  choices: readonly AnswerChoice[];
  stimulus: RoundStimulus;
  /** Server clock (ms) when the round opened. */
  startedAt: number;
  /** Server clock (ms) when the round closes. Clients render a countdown. */
  endsAt: number;
}

/** Broadcast as answers land; choice ids stay secret until the reveal. */
export interface RoundAnswerState {
  roundIndex: number;
  answeredPlayerIds: readonly PlayerId[];
  /** Server clock (ms) when the round closes. */
  endsAt: number;
}

export interface RoundPlayerResult {
  playerId: PlayerId;
  nickname: string;
  avatarId: string;
  choiceId: string | null;
  correct: boolean;
  /** Base points for a correct answer (0 when incorrect). */
  points: number;
  /** Speed bonus on top of `points`. */
  timeBonus: number;
  /** Negative penalty applied for a wrong answer (0 when correct / no answer). */
  penalty: number;
  /** Net change applied to the player's score this round. */
  scoreDelta: number;
  /** The player's score after this round was applied. */
  scoreAfter: number;
  /** Time taken to answer, ms (null when no answer). */
  elapsedMs: number | null;
  /** True while the player was disconnected at reveal time. */
  connected: boolean;
}

/** Server → clients after a round closes. The only place answers appear. */
export interface RoundReveal {
  roundIndex: number;
  gameId: GameId;
  correctChoiceId: string;
  results: readonly RoundPlayerResult[];
  /**
   * Server clock (ms) of the automatic advance. After the final round it
   * advances to the match results, so this is always a real deadline.
   */
  nextAt: number;
}

export interface LeaderboardEntry {
  rank: number;
  playerId: PlayerId;
  nickname: string;
  avatarId: string;
  score: number;
}

/** Final leaderboard after five rounds. */
export interface MatchResults {
  roundCount: number;
  leaderboard: readonly LeaderboardEntry[];
  /** Top three for the podium view. */
  podium: readonly LeaderboardEntry[];
}

/** Rules preview shown on the Game Introduction screen before each round. */
export interface GameIntro {
  roundIndex: number;
  totalRounds: number;
  gameId: GameId;
  title: string;
  description: string;
  /** Small visual example (swatch colour or preview sequence). */
  preview: RoundStimulus | null;
  scoring: {
    correct: number;
    fastAnswer: number;
    incorrect: number;
  };
  /** How many players have clicked "I'm Ready" so far. */
  readyCount: number;
  /** Connected players who can still ready up. */
  playerCount: number;
  /** Server clock (ms) when the round starts even if not everyone is ready. */
  startsAt: number;
}

/* ------------------------------------------------------------------ */
/* Errors                                                              */
/* ------------------------------------------------------------------ */

export type ErrorCode =
  | 'room-not-found'
  | 'room-full'
  | 'invalid-code'
  | 'invalid-nickname'
  | 'invalid-avatar'
  | 'invalid-settings'
  | 'name-taken'
  | 'not-host'
  | 'not-ready'
  | 'wrong-phase'
  | 'round-closed'
  | 'duplicate-answer'
  | 'invalid-answer'
  | 'not-enough-players'
  | 'protocol-mismatch'
  | 'server-error';

export interface PlayverseError {
  code: ErrorCode;
  message: string;
}

/** Every acknowledgement uses this shape so failures are typed, never thrown. */
export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: PlayverseError };

export function ok<T>(data: T): Result<T> {
  return { ok: true, data };
}

export function err<T>(code: ErrorCode, message: string): Result<T> {
  return { ok: false, error: { code, message } };
}

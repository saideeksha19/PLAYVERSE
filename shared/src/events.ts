/**
 * Socket.IO event contract.
 *
 * The server implements `ClientToServerEvents` handlers and emits
 * `ServerToClientEvents`; the client is typed the other way round, so a typo
 * or payload drift fails `npm run typecheck` instead of at runtime.
 *
 * Design rules:
 *  - Every request that can fail is acknowledged with `Result<T>` (never throws).
 *  - `room:state` is the single source of truth: full state, broadcast on change.
 *  - Answer keys and authoritative timers only appear in `round:reveal`.
 */
import type {
  GameIntro,
  MatchResults,
  PlayverseError,
  PlayerId,
  Result,
  RoomCode,
  RoomState,
  RoundAnswerState,
  RoundQuestion,
  RoundReveal,
} from './types';
import type { GameMode } from './constants';

/** Acknowledgement callback passed as the last argument of a client event. */
export type Ack<T> = (result: Result<T>) => void;

/* ------------------------------------------------------------------ */
/* Payloads                                                            */
/* ------------------------------------------------------------------ */

export interface SessionWelcome {
  serverTime: number;
  protocolVersion: number;
  connectionId: string;
}

export interface SessionPong {
  clientTime: number;
  serverTime: number;
}

export interface CreateRoomRequest {
  nickname: string;
  avatarId: string;
  maxPlayers: number;
  mode: GameMode;
  roomName?: string;
}

export interface JoinRoomRequest {
  code: string;
  nickname: string;
  avatarId: string;
}

export interface RejoinRoomRequest {
  code: RoomCode;
  playerId: PlayerId;
  reconnectToken: string;
}

export interface RejoinSuccess {
  state: RoomState;
  playerId: PlayerId;
  reconnectToken: string;
}

export interface PlayerIdentity {
  playerId: PlayerId;
  reconnectToken: string;
  state: RoomState;
}

export type UpdateRoomRequest = Partial<{
  roomName: string;
  maxPlayers: number;
  mode: GameMode;
}>;

export interface StartMatchRequest {
  /** Optional override; the server validates against `MIN_PLAYERS`. */
  force?: boolean;
}

/** Receipt for a submitted answer. Never reveals correctness. */
export interface AnswerReceipt {
  choiceId: string;
  /** Server clock when the answer was accepted. */
  receivedAt: number;
}

export interface ConnectionResume {
  state: RoomState;
  resumedAt: number;
}

/* ------------------------------------------------------------------ */
/* Client → Server                                                     */
/* ------------------------------------------------------------------ */

export interface ClientToServerEvents {
  /** Keep-alive + clock sync. */
  'session:ping': (clientTime: number) => void;

  'room:create': (payload: CreateRoomRequest, ack: Ack<PlayerIdentity>) => void;
  'room:join': (payload: JoinRoomRequest, ack: Ack<PlayerIdentity>) => void;
  /** Restore a dropped player into their existing slot. */
  'room:rejoin': (payload: RejoinRoomRequest, ack: Ack<RejoinSuccess>) => void;
  'room:leave': (ack: Ack<{ left: true }>) => void;
  /** Host-only: hand the host role to another connected player. */
  'host:transfer': (payload: { playerId: PlayerId }, ack: Ack<RoomState>) => void;
  /** Host-only: rename room, change capacity or mode. */
  'room:update': (payload: UpdateRoomRequest, ack: Ack<RoomState>) => void;

  'player:ready': (ready: boolean, ack: Ack<RoomState>) => void;
  'player:unready': (ack: Ack<RoomState>) => void;

  /** Host-only: begin the five-round match. */
  'game:start': (ack: Ack<RoomState>) => void;
  /** Submit the current round's answer. */
  'game:answer': (
    payload: { roundIndex: number; choiceId: string },
    ack: Ack<AnswerReceipt>,
  ) => void;
  /** Game Introduction: "I'm Ready" for this round. */
  'round:ready': (ack: Ack<{ readyCount: number }>) => void;
  /** Host-only: leave round results before the auto-advance timer. */
  'round:continue': (ack: Ack<RoomState>) => void;

  /** Host-only after match results. */
  'match:rematch': (ack: Ack<RoomState>) => void;
  'match:lobby': (ack: Ack<RoomState>) => void;
}

/* ------------------------------------------------------------------ */
/* Server → Client                                                     */
/* ------------------------------------------------------------------ */

export interface ServerToClientEvents {
  'session:welcome': (payload: SessionWelcome) => void;
  'session:pong': (payload: SessionPong) => void;

  /** Full-state broadcast; also emitted on join, leave, ready and host change. */
  'room:state': (state: RoomState) => void;
  'player:joined': (payload: { playerId: PlayerId; nickname: string; avatarId: string }) => void;
  'player:left': (payload: { playerId: PlayerId }) => void;

  'game:intro': (intro: GameIntro) => void;
  /** Round begins. Contains no answer key. */
  'round:start': (question: RoundQuestion) => void;
  /** Who has locked in an answer already (never which answer). */
  'round:answers': (payload: RoundAnswerState) => void;
  /** Round closed: the only event carrying the correct answer. */
  'round:reveal': (reveal: RoundReveal) => void;
  'match:results': (results: MatchResults) => void;

  /** Sent in response to a successful rejoin. */
  'connection:resume': (payload: ConnectionResume) => void;
  'error': (error: PlayverseError) => void;
}

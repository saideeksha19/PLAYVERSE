import { randomBytes, randomUUID } from 'node:crypto';
import {
  AVATARS,
  GAME_MODES,
  MAX_PLAYERS,
  MIN_PLAYERS,
  NICKNAME_MAX_LENGTH,
  NICKNAME_MIN_LENGTH,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  ROOM_NAME_MAX_LENGTH,
  err,
  ok,
  type CreateRoomRequest,
  type GameMode,
  type JoinRoomRequest,
  type Player,
  type PlayerId,
  type Result,
  type Room,
  type RoomCode,
  type RoomState,
  type RoomStatus,
  type UpdateRoomRequest,
} from '@playverse/shared';

/** A player record as the server owns it: identity + live socket binding. */
export interface ServerPlayer extends Player {
  /** Current socket id, or null while disconnected (slot is retained). */
  socketId: string | null;
  /** Secret presented on reconnection; never sent to other players. */
  reconnectToken: string;
}

interface ServerRoom extends Room {
  players: ServerPlayer[];
}

/** What a successful create/join hands back to the caller. */
export interface PlayerIdentity {
  playerId: PlayerId;
  reconnectToken: string;
  state: RoomState;
}

/** Emitted by the socket layer whenever room state changes. */
export interface RoomBroadcaster {
  broadcastState(code: RoomCode): void;
  playerJoined(code: RoomCode, player: Player): void;
  playerLeft(code: RoomCode, playerId: PlayerId): void;
}

const NOOP_BROADCAST: RoomBroadcaster = {
  broadcastState: () => undefined,
  playerJoined: () => undefined,
  playerLeft: () => undefined,
};

/** Randomness that is safe for codes (rejection sampling, no modulo bias). */
function randomCodeCharacter(): string {
  const alphabet = ROOM_CODE_ALPHABET;
  // Rejection sampling over one byte: 256 % 32 === 0 here, but keep the
  // general guard so an alphabet change cannot introduce bias.
  const limit = Math.floor(256 / alphabet.length) * alphabet.length;
  let value = randomBytes(1)[0]!;
  while (value >= limit) value = randomBytes(1)[0]!;
  return alphabet[value % alphabet.length]!;
}

function normalizeNickname(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

export class RoomService {
  private readonly rooms = new Map<RoomCode, ServerRoom>();
  private readonly socketIndex = new Map<string, { code: RoomCode; playerId: PlayerId }>();
  private readonly graceTimers = new Map<PlayerId, ReturnType<typeof setTimeout>>();
  private broadcaster: RoomBroadcaster = NOOP_BROADCAST;

  constructor(private readonly disconnectGraceMs: number) {}

  setBroadcaster(broadcaster: RoomBroadcaster): void {
    this.broadcaster = broadcaster;
  }

  /* ---------------------------------------------------------------- */
  /* Reads                                                             */
  /* ---------------------------------------------------------------- */

  getRoom(code: RoomCode): ServerRoom | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  roomCount(): number {
    return this.rooms.size;
  }

  /**
   * The match engine's only handle on room state: it may broadcast, move the
   * phase and award points, but it cannot invent players or bypass host and
   * readiness validation (those stay in the commands above).
   */
  publish(code: RoomCode): void {
    this.snapshot(code);
  }

  setPhase(code: RoomCode, status: RoomStatus, roundIndex: number): boolean {
    const room = this.rooms.get(code);
    if (!room) return false;
    room.status = status;
    room.roundIndex = roundIndex;
    this.publish(code);
    return true;
  }

  /** Applies one round's points. Returns the clamped score, or 0 if gone. */
  awardPoints(code: RoomCode, playerId: PlayerId, delta: number): number {
    const room = this.rooms.get(code);
    const player = room?.players.find((candidate) => candidate.id === playerId);
    if (!player) return 0;
    player.score = Math.max(0, player.score + delta);
    return player.score;
  }

  resetScores(code: RoomCode): void {
    const room = this.rooms.get(code);
    if (!room) return;
    for (const player of room.players) player.score = 0;
  }

  resetReadiness(code: RoomCode): void {
    const room = this.rooms.get(code);
    if (!room) return;
    for (const player of room.players) player.isReady = false;
  }

  toState(room: ServerRoom): RoomState {
    return { ...room, players: room.players.map((player) => ({ ...player })), serverTime: Date.now() };
  }

  private snapshot(code: RoomCode): void {
    if (this.rooms.has(code)) this.broadcaster.broadcastState(code);
  }

  /* ---------------------------------------------------------------- */
  /* Validation                                                        */
  /* ---------------------------------------------------------------- */

  private validateProfile(
    nickname: string,
    avatarId: string,
  ): Result<{ nickname: string }> {
    const clean = normalizeNickname(nickname);
    if (clean.length < NICKNAME_MIN_LENGTH || clean.length > NICKNAME_MAX_LENGTH) {
      return err('invalid-nickname', `Nicknames need ${NICKNAME_MIN_LENGTH}–${NICKNAME_MAX_LENGTH} characters.`);
    }
    if (!AVATARS.some((avatar) => avatar.id === avatarId)) {
      return err('invalid-avatar', 'Pick one of the preset cube avatars.');
    }
    return ok({ nickname: clean });
  }

  private validateMaxPlayers(maxPlayers: number): Result<number> {
    if (!Number.isInteger(maxPlayers) || maxPlayers < MIN_PLAYERS || maxPlayers > MAX_PLAYERS) {
      return err('invalid-settings', `A room holds ${MIN_PLAYERS}–${MAX_PLAYERS} players.`);
    }
    return ok(maxPlayers);
  }

  private validateMode(mode: GameMode): Result<GameMode> {
    if (!GAME_MODES.includes(mode)) {
      return err('invalid-settings', 'Unknown game mode.');
    }
    return ok(mode);
  }

  /* ---------------------------------------------------------------- */
  /* Membership helpers                                                */
  /* ---------------------------------------------------------------- */

  /**
   * The host role is authoritative in `room.hostId`. It is only recomputed
   * when that player is gone or disconnected: the next host is the connected
   * player who joined first (lowest `joinedAt`, stable tie-break on id), so
   * disconnects, leaves and rejoins always resolve to exactly one host.
   */
  private ensureHost(room: ServerRoom): void {
    const current = room.players.find((player) => player.id === room.hostId);
    if (current?.connected) {
      this.applyHostFlags(room);
      return;
    }
    const connected = room.players.filter((player) => player.connected);
    if (connected.length > 0) {
      const next = connected.reduce((best, player) =>
        player.joinedAt < best.joinedAt || (player.joinedAt === best.joinedAt && player.id < best.id)
          ? player
          : best,
      );
      room.hostId = next.id;
    }
    this.applyHostFlags(room);
  }

  private applyHostFlags(room: ServerRoom): void {
    for (const player of room.players) player.isHost = player.id === room.hostId;
  }

  private makePlayer(nickname: string, avatarId: string, socketId: string): ServerPlayer {
    return {
      id: randomUUID(),
      nickname,
      avatarId,
      isHost: false,
      isReady: false,
      connected: true,
      score: 0,
      joinedAt: Date.now(),
      socketId,
      reconnectToken: randomUUID(),
    };
  }

  /** Frees the player's previous membership, if any, before a new one. */
  private detachSocketFromRoom(socketId: string, emitLeft: boolean): void {
    const entry = this.socketIndex.get(socketId);
    if (!entry) return;
    this.socketIndex.delete(socketId);
    const room = this.rooms.get(entry.code);
    const player = room?.players.find((candidate) => candidate.id === entry.playerId);
    if (!room || !player) return;
    this.removePlayer(room, player, emitLeft);
  }

  private removePlayer(room: ServerRoom, player: ServerPlayer, emitLeft: boolean): void {
    const timer = this.graceTimers.get(player.id);
    if (timer) {
      clearTimeout(timer);
      this.graceTimers.delete(player.id);
    }
    if (player.socketId) this.socketIndex.delete(player.socketId);
    room.players = room.players.filter((candidate) => candidate.id !== player.id);
    if (emitLeft) this.broadcaster.playerLeft(room.code, player.id);
    this.ensureHost(room);
    if (room.players.length === 0) {
      this.rooms.delete(room.code);
      return;
    }
    this.snapshot(room.code);
  }

  /* ---------------------------------------------------------------- */
  /* Commands                                                          */
  /* ---------------------------------------------------------------- */

  create(socketId: string, request: CreateRoomRequest): Result<PlayerIdentity> {
    const profile = this.validateProfile(request.nickname, request.avatarId);
    if (!profile.ok) return profile;
    const maxPlayers = this.validateMaxPlayers(request.maxPlayers);
    if (!maxPlayers.ok) return maxPlayers;
    const mode = this.validateMode(request.mode);
    if (!mode.ok) return mode;

    const roomName = (request.roomName ?? '').trim();
    if (roomName.length > ROOM_NAME_MAX_LENGTH) {
      return err('invalid-settings', `Room names are up to ${ROOM_NAME_MAX_LENGTH} characters.`);
    }

    this.detachSocketFromRoom(socketId, true);

    let code = '';
    for (let attempt = 0; attempt < 1000; attempt += 1) {
      let candidate = '';
      for (let index = 0; index < ROOM_CODE_LENGTH; index += 1) candidate += randomCodeCharacter();
      if (!this.rooms.has(candidate)) {
        code = candidate;
        break;
      }
    }
    if (!code) return err('server-error', 'Could not allocate a room code — try again.');

    const player = this.makePlayer(profile.data.nickname, request.avatarId, socketId);
    const room: ServerRoom = {
      code,
      name: roomName || 'Party Room',
      hostId: player.id,
      maxPlayers: maxPlayers.data,
      mode: mode.data,
      status: 'lobby',
      roundIndex: 0,
      players: [player],
      createdAt: Date.now(),
    };
    player.isHost = true;
    this.rooms.set(code, room);
    this.socketIndex.set(socketId, { code, playerId: player.id });

    this.broadcaster.playerJoined(code, player);
    this.snapshot(code);
    return ok({ playerId: player.id, reconnectToken: player.reconnectToken, state: this.toState(room) });
  }

  join(socketId: string, request: JoinRoomRequest): Result<PlayerIdentity> {
    const code = (request.code ?? '').trim().toUpperCase();
    if (code.length !== ROOM_CODE_LENGTH || [...code].some((c) => !ROOM_CODE_ALPHABET.includes(c))) {
      return err('invalid-code', 'Room codes are six characters from A–Z and 2–9.');
    }
    const room = this.rooms.get(code);
    if (!room) return err('room-not-found', `No room found for code ${code}.`);
    if (room.status !== 'lobby') return err('wrong-phase', 'This match has already started.');

    const profile = this.validateProfile(request.nickname, request.avatarId);
    if (!profile.ok) return profile;
    if (
      room.players.some(
        (player) => player.nickname.toLowerCase() === profile.data.nickname.toLowerCase(),
      )
    ) {
      return err('name-taken', 'That nickname is already in this room — pick another.');
    }
    if (room.players.length >= room.maxPlayers) {
      return err('room-full', 'This room is full.');
    }

    this.detachSocketFromRoom(socketId, true);

    const player = this.makePlayer(profile.data.nickname, request.avatarId, socketId);
    room.players.push(player);
    this.socketIndex.set(socketId, { code, playerId: player.id });
    this.ensureHost(room);

    this.broadcaster.playerJoined(code, player);
    this.snapshot(code);
    return ok({ playerId: player.id, reconnectToken: player.reconnectToken, state: this.toState(room) });
  }

  rejoin(
    socketId: string,
    payload: { code: RoomCode; playerId: PlayerId; reconnectToken: string },
  ): Result<PlayerIdentity> {
    const code = payload.code.toUpperCase();
    const room = this.rooms.get(code);
    if (!room) return err('room-not-found', 'That room no longer exists.');
    const player = room.players.find((candidate) => candidate.id === payload.playerId);
    if (!player) {
      return err('room-not-found', 'Your slot in this room has expired — join again.');
    }
    if (player.reconnectToken !== payload.reconnectToken) {
      return err('invalid-settings', 'This reconnection link is no longer valid.');
    }

    // Release whatever the NEW socket was doing — but never the very slot
    // we are restoring (a same-room rejoin would evict itself).
    const existing = this.socketIndex.get(socketId);
    if (existing && !(existing.code === code && existing.playerId === player.id)) {
      this.detachSocketFromRoom(socketId, true);
    } else {
      this.socketIndex.delete(socketId);
    }

    const timer = this.graceTimers.get(player.id);
    if (timer) {
      clearTimeout(timer);
      this.graceTimers.delete(player.id);
    }

    player.connected = true;
    player.socketId = socketId;
    this.socketIndex.set(socketId, { code, playerId: player.id });
    this.ensureHost(room);
    this.snapshot(code);
    return ok({ playerId: player.id, reconnectToken: player.reconnectToken, state: this.toState(room) });
  }

  leave(socketId: string): { code: RoomCode; playerId: PlayerId } | null {
    const entry = this.socketIndex.get(socketId);
    if (!entry) return null;
    const room = this.rooms.get(entry.code);
    const player = room?.players.find((candidate) => candidate.id === entry.playerId);
    if (!room || !player) {
      this.socketIndex.delete(socketId);
      return null;
    }
    this.removePlayer(room, player, true);
    return { code: room.code, playerId: player.id };
  }

  /**
   * Marks the player disconnected and starts their grace timer. The slot is
   * kept (so a reload can rejoin without creating a duplicate record); the
   * host role moves to the connected player who joined first.
   */
  handleDisconnect(socketId: string): { code: RoomCode; playerId: PlayerId } | null {
    const entry = this.socketIndex.get(socketId);
    if (!entry) return null;
    this.socketIndex.delete(socketId);

    const room = this.rooms.get(entry.code);
    const player = room?.players.find((candidate) => candidate.id === entry.playerId);
    if (!room || !player) return null;
    // The slot was re-bound to a newer socket (rejoin raced the old
    // disconnect) — this close belongs to the stale connection.
    if (player.socketId !== socketId) return null;

    player.connected = false;
    player.socketId = null;
    this.ensureHost(room);
    this.snapshot(room.code);

    const timer = setTimeout(() => {
      this.graceTimers.delete(player.id);
      const current = this.rooms.get(room.code);
      if (!current) return;
      const occupant = current.players.find((candidate) => candidate.id === player.id);
      if (!occupant || occupant.connected) return;
      this.removePlayer(current, occupant, true);
    }, this.disconnectGraceMs);
    timer.unref?.();
    this.graceTimers.set(player.id, timer);

    return { code: room.code, playerId: player.id };
  }

  /* ---------------------------------------------------------------- */
  /* Lobby commands                                                    */
  /* ---------------------------------------------------------------- */

  /** Resolves the room + player bound to a socket (public for the match engine). */
  actorFor(socketId: string): Result<{ room: ServerRoom; player: ServerPlayer }> {
    const entry = this.socketIndex.get(socketId);
    if (!entry) return err('room-not-found', 'You are not in a room.');
    const room = this.rooms.get(entry.code);
    const player = room?.players.find((candidate) => candidate.id === entry.playerId);
    if (!room || !player) return err('room-not-found', 'You are not in a room.');
    return ok({ room, player });
  }

  setReady(socketId: string, ready: boolean): Result<RoomState> {
    const actor = this.actorFor(socketId);
    if (!actor.ok) return actor;
    const { room, player } = actor.data;
    if (room.status !== 'lobby') return err('wrong-phase', 'The match has already started.');
    player.isReady = ready;
    this.snapshot(room.code);
    return ok(this.toState(room));
  }

  updateRoom(socketId: string, patch: UpdateRoomRequest): Result<RoomState> {
    const actor = this.actorFor(socketId);
    if (!actor.ok) return actor;
    const { room, player } = actor.data;
    if (!player.isHost) return err('not-host', 'Only the host can change room settings.');
    if (room.status !== 'lobby') return err('wrong-phase', 'The match has already started.');

    if (patch.roomName !== undefined) {
      const name = patch.roomName.trim();
      if (name.length > ROOM_NAME_MAX_LENGTH) {
        return err('invalid-settings', `Room names are up to ${ROOM_NAME_MAX_LENGTH} characters.`);
      }
      if (name) room.name = name;
    }
    if (patch.maxPlayers !== undefined) {
      const maxPlayers = this.validateMaxPlayers(patch.maxPlayers);
      if (!maxPlayers.ok) return maxPlayers;
      if (maxPlayers.data < room.players.length) {
        return err('invalid-settings', 'Capacity cannot be lower than the current player count.');
      }
      room.maxPlayers = maxPlayers.data;
    }
    if (patch.mode !== undefined) {
      const mode = this.validateMode(patch.mode);
      if (!mode.ok) return mode;
      room.mode = mode.data;
    }

    this.snapshot(room.code);
    return ok(this.toState(room));
  }

  transferHost(socketId: string, targetId: PlayerId): Result<RoomState> {
    const actor = this.actorFor(socketId);
    if (!actor.ok) return actor;
    const { room, player } = actor.data;
    if (!player.isHost) return err('not-host', 'Only the host can transfer the host role.');
    if (room.status !== 'lobby') return err('wrong-phase', 'The match has already started.');
    const target = room.players.find((candidate) => candidate.id === targetId);
    if (!target) return err('invalid-settings', 'That player is not in this room.');
    if (target.id === player.id) return err('invalid-settings', 'You are already the host.');
    if (!target.connected) return err('invalid-settings', 'That player is disconnected.');

    room.hostId = target.id;
    this.applyHostFlags(room);
    this.snapshot(room.code);
    return ok(this.toState(room));
  }

  /**
   * Host-only match start. Server-owned validation: phase, minimum connected
   * players, and every connected player ready — the client's view of these is
   * advisory only.
   */
  startMatch(socketId: string): Result<RoomState> {
    const actor = this.actorFor(socketId);
    if (!actor.ok) return actor;
    const { room, player } = actor.data;
    if (!player.isHost) return err('not-host', 'Only the host can start the match.');
    if (room.status !== 'lobby') return err('wrong-phase', 'The match has already started.');

    const connected = room.players.filter((candidate) => candidate.connected);
    if (connected.length < MIN_PLAYERS) {
      return err('not-enough-players', `Waiting for at least ${MIN_PLAYERS} players.`);
    }
    if (connected.some((candidate) => !candidate.isReady)) {
      return err('not-ready', 'Everyone needs to be ready before the match starts.');
    }

    room.status = 'intro';
    room.roundIndex = 1;
    for (const candidate of room.players) candidate.score = 0;
    this.snapshot(room.code);
    return ok(this.toState(room));
  }

  /** Test/diagnostic helper: drop every room (used by teardown). */
  clear(): void {
    for (const timer of this.graceTimers.values()) clearTimeout(timer);
    this.graceTimers.clear();
    this.rooms.clear();
    this.socketIndex.clear();
  }
}

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { io as connectSocket, type Socket as ClientSocket } from 'socket.io-client';
import {
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  type ClientToServerEvents,
  type PlayerIdentity,
  type Result,
  type RoomState,
  type ServerToClientEvents,
} from '@playverse/shared';
import { startServer, type RunningServer } from '../server';

type AppClientSocket = ClientSocket<ServerToClientEvents, ClientToServerEvents>;

/**
 * Phase 3: real multiplayer rooms.
 *
 * Every case below uses genuine Socket.IO connections against a real HTTP
 * server — no mocked players, no client-only state. The server must pass
 * every rule on its own; clients only render what it broadcasts.
 */
describe('rooms and lobby (server-authoritative)', () => {
  let server: RunningServer;
  const openSockets: AppClientSocket[] = [];

  beforeEach(async () => {
    server = await startServer({ port: 0, host: '127.0.0.1', disconnectGraceMs: 300 });
  });

  afterEach(async () => {
    for (const socket of openSockets.splice(0)) {
      socket.removeAllListeners();
      socket.disconnect();
    }
    server.rooms.clear();
    await server.close();
  });

  /** Latest room:state observed per socket, so waiters can check it first. */
  const latest = new Map<AppClientSocket, RoomState[]>();

  function openSocket(): Promise<AppClientSocket> {
    const socket = connectSocket(server.origin, {
      transports: ['websocket'],
      forceNew: true,
    }) as unknown as AppClientSocket;
    openSockets.push(socket);
    const seen: RoomState[] = [];
    latest.set(socket, seen);
    socket.on('room:state', (state) => seen.push(state));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('socket connect timeout')), 4000);
      socket.once('session:welcome', () => {
        clearTimeout(timer);
        resolve(socket);
      });
    });
  }

  /** Registers an ack callback and rejects if the server never answers. */
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

  const create = (
    socket: AppClientSocket,
    payload: Parameters<ClientToServerEvents['room:create']>[0],
  ) =>
    ask<PlayerIdentity>(
      (ack) => socket.emit('room:create', payload, ack),
      'room:create',
    );

  const join = (
    socket: AppClientSocket,
    payload: Parameters<ClientToServerEvents['room:join']>[0],
  ) =>
    ask<PlayerIdentity>(
      (ack) => socket.emit('room:join', payload, ack),
      'room:join',
    );

  const rejoin = (
    socket: AppClientSocket,
    payload: Parameters<ClientToServerEvents['room:rejoin']>[0],
  ) =>
    ask<{ state: RoomState; playerId: string; reconnectToken: string }>(
      (ack) => socket.emit('room:rejoin', payload, ack),
      'room:rejoin',
    );

  const leave = (socket: AppClientSocket) =>
    ask<{ left: true }>((ack) => socket.emit('room:leave', ack), 'room:leave');

  const setReady = (socket: AppClientSocket, ready: boolean) =>
    ask<RoomState>((ack) => socket.emit('player:ready', ready, ack), 'player:ready');

  const start = (socket: AppClientSocket) =>
    ask<RoomState>((ack) => socket.emit('game:start', ack), 'game:start');

  const transfer = (socket: AppClientSocket, playerId: string) =>
    ask<RoomState>(
      (ack) => socket.emit('host:transfer', { playerId }, ack),
      'host:transfer',
    );

  const update = (
    socket: AppClientSocket,
    payload: Parameters<ClientToServerEvents['room:update']>[0],
  ) => ask<RoomState>((ack) => socket.emit('room:update', payload, ack), 'room:update');

  /**
   * Waits for a room:state on `socket` satisfying `predicate`, considering
   * only states received after `since` (an index captured with `markState`
   * right before the action that should trigger the broadcast).
   */
  function waitState(
    socket: AppClientSocket,
    predicate: (state: RoomState) => boolean = () => true,
    since = 0,
    timeoutMs = 3000,
  ): Promise<RoomState> {
    const history = latest.get(socket) ?? [];
    const cached = history
      .slice(since)
      .reverse()
      .find(predicate);
    if (cached) return Promise.resolve(cached);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.off('room:state', onState);
        reject(new Error('timed out waiting for room:state'));
      }, timeoutMs);
      function onState(state: RoomState) {
        if (!predicate(state)) return;
        clearTimeout(timer);
        socket.off('room:state', onState);
        resolve(state);
      }
      socket.on('room:state', onState);
    });
  }

  /** Capture before acting: `const since = markState(socket)` . */
  function markState(socket: AppClientSocket): number {
    return (latest.get(socket) ?? []).length;
  }

  function playerByName(state: RoomState, nickname: string) {
    return state.players.find((player) => player.nickname === nickname);
  }

  const HOST_PROFILE = { nickname: 'Hosty', avatarId: 'red' };
  const GUEST_PROFILE = { nickname: 'Joiner', avatarId: 'blue' };

  /* ---------------------------------------------------------------- */
  /* Create                                                            */
  /* ---------------------------------------------------------------- */

  it('creates a room: unique six-character code, creator is host', async () => {
    const socket = await openSocket();
    const result = await create(socket, {
      ...HOST_PROFILE,
      maxPlayers: 8,
      mode: 'classic',
      roomName: 'Fun Squad',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { state, playerId, reconnectToken } = result.data;
    expect(state.code).toHaveLength(ROOM_CODE_LENGTH);
    for (const character of state.code) expect(ROOM_CODE_ALPHABET).toContain(character);
    expect(state.name).toBe('Fun Squad');
    expect(state.status).toBe('lobby');
    expect(state.roundIndex).toBe(0);
    expect(state.players).toHaveLength(1);
    expect(state.players[0]!.id).toBe(playerId);
    expect(state.players[0]!.isHost).toBe(true);
    expect(state.players[0]!.connected).toBe(true);
    expect(state.players[0]!.isReady).toBe(false);
    expect(reconnectToken).toHaveLength(36);
    expect(typeof state.serverTime).toBe('number');

    // Two creations from fresh sockets never collide within a run.
    const second = await openSocket();
    const other = await create(second, { ...GUEST_PROFILE, maxPlayers: 4, mode: 'classic' });
    expect(other.ok).toBe(true);
    if (other.ok) expect(other.data.state.code).not.toBe(state.code);
    expect(server.rooms.roomCount()).toBe(2);
  });

  it('rejects invalid room creation with typed errors', async () => {
    const socket = await openSocket();

    const badNickname = await create(socket, {
      nickname: 'x',
      avatarId: 'red',
      maxPlayers: 8,
      mode: 'classic',
    });
    expect(badNickname).toMatchObject({ ok: false, error: { code: 'invalid-nickname' } });

    const badAvatar = await create(socket, {
      nickname: 'Hosty',
      avatarId: 'hologram',
      maxPlayers: 8,
      mode: 'classic',
    });
    expect(badAvatar).toMatchObject({ ok: false, error: { code: 'invalid-avatar' } });

    const badCapacity = await create(socket, {
      nickname: 'Hosty',
      avatarId: 'red',
      maxPlayers: 99,
      mode: 'classic',
    });
    expect(badCapacity).toMatchObject({ ok: false, error: { code: 'invalid-settings' } });

    const badMode = await create(socket, {
      nickname: 'Hosty',
      avatarId: 'red',
      maxPlayers: 8,
      mode: 'chaos' as 'classic',
    });
    expect(badMode).toMatchObject({ ok: false, error: { code: 'invalid-settings' } });

    expect(server.rooms.roomCount()).toBe(0);
  });

  /* ---------------------------------------------------------------- */
  /* Join                                                              */
  /* ---------------------------------------------------------------- */

  it('lets a second player join by code and both see the same lobby', async () => {
    const host = await openSocket();
    const guest = await openSocket();

    const created = await create(host, { ...HOST_PROFILE, maxPlayers: 8, mode: 'classic' });
    if (!created.ok) throw new Error('create failed');

    const hostSeesGuest = waitState(host, (s) => s.players.length === 2);
    const joined = await join(guest, {
      code: created.data.state.code,
      ...GUEST_PROFILE,
    });
    expect(joined.ok).toBe(true);
    if (!joined.ok) return;

    expect(joined.data.state.players).toHaveLength(2);
    expect(joined.data.state.players.find((p) => p.id === joined.data.playerId)?.isHost).toBe(
      false,
    );

    const synchronized = await hostSeesGuest;
    expect(playerByName(synchronized, 'Joiner')).toBeTruthy();
    // Host stayed host; the single source of truth reached both sockets.
    expect(playerByName(synchronized, 'Hosty')?.isHost).toBe(true);
    expect(synchronized.code).toBe(created.data.state.code);
  });

  it('rejects invalid codes, missing rooms and duplicate nicknames', async () => {
    const host = await openSocket();
    const guest = await openSocket();
    const created = await create(host, { ...HOST_PROFILE, maxPlayers: 8, mode: 'classic' });
    if (!created.ok) throw new Error('create failed');
    const code = created.data.state.code;

    const malformed = await join(guest, { code: 'XY!', ...GUEST_PROFILE });
    expect(malformed).toMatchObject({ ok: false, error: { code: 'invalid-code' } });

    const tooShort = await join(guest, { code: 'AB2', ...GUEST_PROFILE });
    expect(tooShort).toMatchObject({ ok: false, error: { code: 'invalid-code' } });

    const unknown = await join(guest, { code: 'AB2D4F', ...GUEST_PROFILE });
    expect(unknown).toMatchObject({ ok: false, error: { code: 'room-not-found' } });

    const secondGuest = await openSocket();
    const realJoin = await join(secondGuest, { code, ...GUEST_PROFILE });
    expect(realJoin.ok).toBe(true);

    const thirdGuest = await openSocket();
    const duplicate = await join(thirdGuest, { code, ...GUEST_PROFILE });
    expect(duplicate).toMatchObject({ ok: false, error: { code: 'name-taken' } });

    // The duplicate attempt never created a player record.
    expect(server.rooms.getRoom(code)?.players).toHaveLength(2);
  });

  it('enforces room capacity', async () => {
    const host = await openSocket();
    const created = await create(host, { ...HOST_PROFILE, maxPlayers: 2, mode: 'classic' });
    if (!created.ok) throw new Error('create failed');
    const code = created.data.state.code;

    const guest = await openSocket();
    const firstJoin = await join(guest, { code, ...GUEST_PROFILE });
    expect(firstJoin.ok).toBe(true);

    const overflow = await openSocket();
    const rejected = await join(overflow, { code, nickname: 'Third', avatarId: 'green' });
    expect(rejected).toMatchObject({ ok: false, error: { code: 'room-full' } });
    expect(server.rooms.getRoom(code)?.players).toHaveLength(2);
  });

  it('rejects joining once the match has started', async () => {
    const host = await openSocket();
    const guest = await openSocket();
    const created = await create(host, { ...HOST_PROFILE, maxPlayers: 8, mode: 'classic' });
    if (!created.ok) throw new Error('create failed');
    const code = created.data.state.code;
    await join(guest, { code, ...GUEST_PROFILE });

    await setReady(host, true);
    await setReady(guest, true);
    const started = await start(host);
    expect(started.ok).toBe(true);

    const late = await openSocket();
    const rejected = await join(late, { code, nickname: 'Late', avatarId: 'pink' });
    expect(rejected).toMatchObject({ ok: false, error: { code: 'wrong-phase' } });
  });

  /* ---------------------------------------------------------------- */
  /* Ready + start validation                                          */
  /* ---------------------------------------------------------------- */

  it('synchronises ready state to every player immediately', async () => {
    const host = await openSocket();
    const guest = await openSocket();
    const created = await create(host, { ...HOST_PROFILE, maxPlayers: 8, mode: 'classic' });
    if (!created.ok) throw new Error('create failed');
    await join(guest, { code: created.data.state.code, ...GUEST_PROFILE });

    const hostSeesReady = waitState(host, (s) => playerByName(s, 'Joiner')?.isReady === true);
    const result = await setReady(guest, true);
    expect(result.ok).toBe(true);
    if (result.ok) expect(playerByName(result.data, 'Joiner')?.isReady).toBe(true);

    const synced = await hostSeesReady;
    expect(playerByName(synced, 'Hosty')?.isReady).toBe(false);

    const guestSeesUnreadySince = markState(guest);
    const guestSeesUnready = waitState(
      guest,
      (s) => playerByName(s, 'Joiner')?.isReady === false,
      guestSeesUnreadySince,
    );
    const off = await setReady(guest, false);
    expect(off.ok).toBe(true);
    await guestSeesUnready;
  });

  it('only the host can start, and only when everyone is ready', async () => {
    const host = await openSocket();
    const guest = await openSocket();
    const created = await create(host, { ...HOST_PROFILE, maxPlayers: 8, mode: 'classic' });
    if (!created.ok) throw new Error('create failed');
    const code = created.data.state.code;

    // Alone in the room: below the minimum player count.
    const early = await start(host);
    expect(early).toMatchObject({ ok: false, error: { code: 'not-enough-players' } });

    await join(guest, { code, ...GUEST_PROFILE });

    // Guest is not the host.
    const guestStart = await start(guest);
    expect(guestStart).toMatchObject({ ok: false, error: { code: 'not-host' } });

    // Everyone present but not everyone ready.
    await setReady(host, true);
    const notReady = await start(host);
    expect(notReady).toMatchObject({ ok: false, error: { code: 'not-ready' } });

    const hostSeesGuestReady = waitState(host, (s) => playerByName(s, 'Joiner')?.isReady === true);
    await setReady(guest, true);
    await hostSeesGuestReady;

    const started = await start(host);
    expect(started.ok).toBe(true);
    if (started.ok) {
      expect(started.data.status).toBe('intro');
      expect(started.data.roundIndex).toBe(1);
    }

    // Starting again is rejected: the match has begun.
    const again = await start(host);
    expect(again).toMatchObject({ ok: false, error: { code: 'wrong-phase' } });
  });

  /* ---------------------------------------------------------------- */
  /* Host rules                                                        */
  /* ---------------------------------------------------------------- */

  it('transfers the host role explicitly and rejects non-host transfers', async () => {
    const host = await openSocket();
    const guest = await openSocket();
    const created = await create(host, { ...HOST_PROFILE, maxPlayers: 8, mode: 'classic' });
    if (!created.ok) throw new Error('create failed');
    const code = created.data.state.code;
    const joined = await join(guest, { code, ...GUEST_PROFILE });
    if (!joined.ok) throw new Error('join failed');

    // The guest cannot grant itself the host role.
    const sneaky = await transfer(guest, created.data.playerId);
    expect(sneaky).toMatchObject({ ok: false, error: { code: 'not-host' } });

    // Unknown target is rejected.
    const ghost = await transfer(host, 'no-such-player');
    expect(ghost).toMatchObject({ ok: false, error: { code: 'invalid-settings' } });

    const guestSeesCrown = waitState(
      guest,
      (s) => playerByName(s, 'Joiner')?.isHost === true,
    );
    const handedOver = await transfer(host, joined.data.playerId);
    expect(handedOver.ok).toBe(true);
    if (handedOver.ok) {
      expect(playerByName(handedOver.data, 'Joiner')?.isHost).toBe(true);
      expect(playerByName(handedOver.data, 'Hosty')?.isHost).toBe(false);
    }

    const synced = await guestSeesCrown;
    expect(playerByName(synced, 'Hosty')?.isHost).toBe(false);
  });

  it('reassigns the host automatically when the host disconnects', async () => {
    const host = await openSocket();
    const guest = await openSocket();
    const created = await create(host, { ...HOST_PROFILE, maxPlayers: 8, mode: 'classic' });
    if (!created.ok) throw new Error('create failed');
    await join(guest, { code: created.data.state.code, ...GUEST_PROFILE });

    const guestSeesTransfer = waitState(
      guest,
      (s) => playerByName(s, 'Joiner')?.isHost === true,
    );
    host.disconnect();

    const state = await guestSeesTransfer;
    expect(playerByName(state, 'Hosty')?.connected).toBe(false);
    expect(playerByName(state, 'Joiner')?.isHost).toBe(true);
    // The disconnected slot is retained during the grace window.
    expect(state.players).toHaveLength(2);
  });

  it('host settings changes are host-only and broadcast', async () => {
    const host = await openSocket();
    const guest = await openSocket();
    const created = await create(host, { ...HOST_PROFILE, maxPlayers: 8, mode: 'classic' });
    if (!created.ok) throw new Error('create failed');
    await join(guest, { code: created.data.state.code, ...GUEST_PROFILE });

    const attempt = await update(guest, { maxPlayers: 4 });
    expect(attempt).toMatchObject({ ok: false, error: { code: 'not-host' } });

    const guestSeesUpdate = waitState(guest, (s) => s.maxPlayers === 4);
    const changed = await update(host, { maxPlayers: 4, mode: 'family-friendly' });
    expect(changed.ok).toBe(true);
    if (changed.ok) {
      expect(changed.data.maxPlayers).toBe(4);
      expect(changed.data.mode).toBe('family-friendly');
    }
    const synced = await guestSeesUpdate;
    expect(synced.mode).toBe('family-friendly');

    const tooSmall = await update(host, { maxPlayers: 1 });
    expect(tooSmall).toMatchObject({ ok: false, error: { code: 'invalid-settings' } });
  });

  /* ---------------------------------------------------------------- */
  /* Leave / disconnect / reconnect                                    */
  /* ---------------------------------------------------------------- */

  it('removes a leaving player and broadcasts player:left', async () => {
    const host = await openSocket();
    const guest = await openSocket();
    const created = await create(host, { ...HOST_PROFILE, maxPlayers: 8, mode: 'classic' });
    if (!created.ok) throw new Error('create failed');
    const code = created.data.state.code;
    const joined = await join(guest, { code, ...GUEST_PROFILE });
    expect(joined.ok).toBe(true);
    if (!joined.ok) return;
    const guestId = joined.data.playerId;

    const leftEvent = new Promise<{ playerId: string }>((resolve) => {
      host.once('player:left', resolve);
    });
    const sinceLeave = markState(host);
    const hostSeesRemoval = waitState(host, (s) => s.players.length === 1, sinceLeave);

    const result = await leave(guest);
    expect(result).toEqual({ ok: true, data: { left: true } });

    expect((await leftEvent).playerId).toBe(guestId);
    const state = await hostSeesRemoval;
    expect(state.players).toHaveLength(1);
    expect(playerByName(state, 'Hosty')?.isHost).toBe(true);
    expect(server.rooms.getRoom(state.code)?.players).toHaveLength(1);
  });

  it('reconnects a dropped player into the same slot without duplicates', async () => {
    const host = await openSocket();
    const guest = await openSocket();
    const created = await create(host, { ...HOST_PROFILE, maxPlayers: 8, mode: 'classic' });
    if (!created.ok) throw new Error('create failed');
    const code = created.data.state.code;
    const joined = await join(guest, { code, ...GUEST_PROFILE });
    if (!joined.ok) throw new Error('join failed');
    const { playerId, reconnectToken } = joined.data;

    // Connection drops (page reload): slot retained, marked disconnected.
    guest.removeAllListeners('room:state');
    const sinceDrop = markState(host);
    guest.disconnect();
    const during = await waitState(
      host,
      (s) => s.players.some((p) => p.nickname === 'Joiner' && !p.connected),
      sinceDrop,
      4000,
    );
    expect(during.players).toHaveLength(2);

    // A brand-new connection restores the same player record.
    const sinceRestore = markState(host);
    const reconnected = await openSocket();
    const restored = await rejoin(reconnected, { code, playerId, reconnectToken });
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(restored.data.playerId).toBe(playerId);
    expect(restored.data.state.players).toHaveLength(2);
    expect(playerByName(restored.data.state, 'Joiner')?.connected).toBe(true);

    // Everyone still sees exactly one Joiner.
    const hostSeesRestore = await waitState(
      host,
      (s) => playerByName(s, 'Joiner')?.connected === true,
      sinceRestore,
    );
    expect(hostSeesRestore.players.filter((p) => p.nickname === 'Joiner')).toHaveLength(1);
  });

  it('rejects rejoin with a wrong token or unknown player', async () => {
    const host = await openSocket();
    const created = await create(host, { ...HOST_PROFILE, maxPlayers: 8, mode: 'classic' });
    if (!created.ok) throw new Error('create failed');

    const impostor = await openSocket();
    const badToken = await rejoin(impostor, {
      code: created.data.state.code,
      playerId: created.data.playerId,
      reconnectToken: 'not-the-token',
    });
    expect(badToken).toMatchObject({ ok: false, error: { code: 'invalid-settings' } });

    const unknownPlayer = await rejoin(impostor, {
      code: created.data.state.code,
      playerId: '00000000-0000-4000-8000-000000000000',
      reconnectToken: created.data.reconnectToken,
    });
    expect(unknownPlayer).toMatchObject({ ok: false, error: { code: 'room-not-found' } });

    const unknownRoom = await rejoin(impostor, {
      code: 'ZZZZZZ',
      playerId: created.data.playerId,
      reconnectToken: created.data.reconnectToken,
    });
    expect(unknownRoom).toMatchObject({ ok: false, error: { code: 'room-not-found' } });
  });

  it('frees the slot after the grace period so rooms do not leak players', async () => {
    const host = await openSocket();
    const guest = await openSocket();
    const created = await create(host, { ...HOST_PROFILE, maxPlayers: 8, mode: 'classic' });
    if (!created.ok) throw new Error('create failed');
    const code = created.data.state.code;
    const joined = await join(guest, { code, ...GUEST_PROFILE });
    if (!joined.ok) throw new Error('join failed');

    const sinceDrop = markState(host);
    guest.disconnect();
    const removed = await waitState(
      host,
      (s) => s.players.length === 1 && s.players[0]!.nickname === 'Hosty',
      sinceDrop,
      4000,
    );
    expect(removed.players).toHaveLength(1);

    // The expired slot cannot be restored…
    const late = await openSocket();
    const expired = await rejoin(late, {
      code,
      playerId: joined.data.playerId,
      reconnectToken: joined.data.reconnectToken,
    });
    expect(expired).toMatchObject({ ok: false, error: { code: 'room-not-found' } });

    // …and the nickname is free again for a fresh join.
    const fresh = await join(late, { code, ...GUEST_PROFILE });
    expect(fresh.ok).toBe(true);
  });

  /* ---------------------------------------------------------------- */
  /* Simultaneous players                                              */
  /* ---------------------------------------------------------------- */

  it('keeps four simultaneous clients on identical lobby state', async () => {
    const sockets = [await openSocket(), await openSocket(), await openSocket(), await openSocket()];
    const [creator, ...rest] = sockets;
    const created = await create(creator!, {
      nickname: 'P1',
      avatarId: 'red',
      maxPlayers: 8,
      mode: 'classic',
    });
    if (!created.ok) throw new Error('create failed');
    const code = created.data.state.code;

    const names = ['P2', 'P3', 'P4'];
    const avatars = ['blue', 'green', 'yellow'];
    const marks = sockets.map((socket) => markState(socket));
    const joins = await Promise.all(
      rest.map((socket, index) =>
        join(socket, { code, nickname: names[index]!, avatarId: avatars[index]! }),
      ),
    );
    for (const result of joins) expect(result.ok).toBe(true);

    // Every socket converges on the same roster.
    const states = await Promise.all(
      sockets.map((socket, index) =>
        waitState(socket, (s) => s.players.length === 4, marks[index]!),
      ),
    );
    const reference = states[0]!;
    expect(reference.players.map((p) => p.nickname).sort()).toEqual([
      'P1',
      'P2',
      'P3',
      'P4',
    ]);
    expect(reference.players.filter((p) => p.isHost)).toHaveLength(1);
    for (const state of states) {
      expect(state.code).toBe(code);
      expect(state.players.map((p) => p.id).sort()).toEqual(
        reference.players.map((p) => p.id).sort(),
      );
    }

    // Host-only start from a non-host is still rejected with four players.
    const attempt = await start(rest[1]!);
    expect(attempt).toMatchObject({ ok: false, error: { code: 'not-host' } });
  });
});

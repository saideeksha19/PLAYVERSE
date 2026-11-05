import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  err,
  type CreateRoomRequest,
  type JoinRoomRequest,
  type PlayverseError,
  type PlayerId,
  type Result,
  type RoomState,
  type UpdateRoomRequest,
} from '@playverse/shared';
import { getSocket, type PlayverseSocket } from '../net/socket';

export type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'offline';
export type BootState = 'pending' | 'resolved';

/** Where a dropped session is remembered so a reload rejoins the same slot. */
interface StoredSession {
  code: string;
  playerId: PlayerId;
  reconnectToken: string;
}

/**
 * Where a dropped session is remembered so a reload rejoins the same slot.
 * sessionStorage keeps two tabs independent — the two-browser flow relies on it.
 */
export const ROOM_SESSION_KEY = 'playverse.session';
const ACK_TIMEOUT_MS = 6000;

function readSession(): StoredSession | null {
  try {
    const raw = sessionStorage.getItem(ROOM_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    if (!parsed?.code || !parsed?.playerId || !parsed?.reconnectToken) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeSession(session: StoredSession | null): void {
  try {
    if (session) sessionStorage.setItem(ROOM_SESSION_KEY, JSON.stringify(session));
    else sessionStorage.removeItem(ROOM_SESSION_KEY);
  } catch {
    // Storage unavailable (private mode) — reconnection degrades to a fresh join.
  }
}

export interface RoomValue {
  /** Live transport state for the connection banner. */
  connection: ConnectionState;
  /** True until the first connect/rejoin attempt settles. */
  boot: BootState;
  /** The authoritative lobby state, or null when not in a room. */
  room: RoomState | null;
  /** This client's player id within `room`. */
  meId: PlayerId | null;
  /** Push errors (server pushes, rejoin failures) for banner display. */
  error: PlayverseError | null;
  clearError: () => void;
  /** Manual recovery from the Connection screen: reconnect and rejoin. */
  retryConnection: () => void;

  createRoom: (request: CreateRoomRequest) => Promise<Result<RoomState>>;
  joinRoom: (request: JoinRoomRequest) => Promise<Result<RoomState>>;
  leaveRoom: () => Promise<void>;
  setReady: (ready: boolean) => Promise<Result<RoomState>>;
  updateRoom: (patch: UpdateRoomRequest) => Promise<Result<RoomState>>;
  transferHost: (playerId: PlayerId) => Promise<Result<RoomState>>;
  startMatch: () => Promise<Result<RoomState>>;
}

const RoomContext = createContext<RoomValue | null>(null);

/**
 * Server-authoritative room state.
 *
 * The provider holds no game logic: it forwards intents, applies the server's
 * `room:state` broadcasts verbatim, and restores a dropped session on
 * reconnect using the stored player id + reconnect token (never a fresh
 * duplicate record).
 */
export function RoomProvider({ children }: { children: ReactNode }) {
  const [connection, setConnection] = useState<ConnectionState>('connecting');
  const [boot, setBoot] = useState<BootState>('pending');
  const [room, setRoom] = useState<RoomState | null>(null);
  const [meId, setMeId] = useState<PlayerId | null>(null);
  const [error, setError] = useState<PlayverseError | null>(null);
  const rejoiningRef = useRef(false);

  const applyIdentity = useCallback((code: string, playerId: PlayerId, token: string) => {
    writeSession({ code, playerId, reconnectToken: token });
    setMeId(playerId);
  }, []);

  /** Emit an event with an ack, with a client-side timeout guard. */
  const ask = useCallback(<T,>(
    emit: (socket: PlayverseSocket, resolve: (result: Result<T>) => void) => void,
    label: string,
  ): Promise<Result<T>> => {
    return new Promise((resolve) => {
      const socket = getSocket();
      const timer = setTimeout(() => {
        resolve(err<T>('server-error', `The server did not answer ${label} — try again.`));
      }, ACK_TIMEOUT_MS);
      emit(socket, (result) => {
        clearTimeout(timer);
        resolve(result);
      });
    });
  }, []);

  /* ---------------- connection lifecycle + subscriptions ---------------- */

  const rejoinStoredSession = useCallback((socket: PlayverseSocket) => {
    // Restore a stored session (first load after reload, or after any
    // reconnect — the server binds rooms per socket id).
    const session = readSession();
    if (!session || rejoiningRef.current) {
      setBoot('resolved');
      return;
    }
    rejoiningRef.current = true;
    socket.emit('room:rejoin', session, (result) => {
      rejoiningRef.current = false;
      if (result.ok) {
        setRoom(result.data.state);
        setMeId(result.data.playerId);
        setError(null);
      } else {
        writeSession(null);
        setRoom(null);
        setMeId(null);
        // Only surface the reason when the player was trying to be somewhere.
        if (
          window.location.hash.startsWith('#/lobby') ||
          window.location.hash.startsWith('#/connection')
        ) {
          setError(result.error);
        }
      }
      setBoot('resolved');
    });
  }, []);

  useEffect(() => {
    const socket = getSocket();

    const onConnect = () => {
      setConnection('connected');
      rejoinStoredSession(socket);
    };

    const onDisconnect = (reason: string) => {
      setConnection(reason === 'io server disconnect' ? 'offline' : 'reconnecting');
      if (reason === 'io server disconnect') setBoot('resolved');
    };

    const onReconnectAttempt = () => setConnection('reconnecting');
    const onReconnectFailed = () => {
      setConnection('offline');
      setBoot('resolved');
    };
    // Reconnect lifecycle events live on the Manager, not the Socket.
    const manager = socket.io;

    const onState = (state: RoomState) => setRoom(state);
    const onResume = (payload: { state: RoomState }) => setRoom(payload.state);
    const onPushedError = (pushed: PlayverseError) => setError(pushed);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    manager.on('reconnect_attempt', onReconnectAttempt);
    manager.on('reconnect_failed', onReconnectFailed);
    socket.on('room:state', onState);
    socket.on('connection:resume', onResume);
    socket.on('error', onPushedError);

    // Already connected before this effect ran (StrictMode remount, fast open).
    if (socket.connected) onConnect();

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      manager.off('reconnect_attempt', onReconnectAttempt);
      manager.off('reconnect_failed', onReconnectFailed);
      socket.off('room:state', onState);
      socket.off('connection:resume', onResume);
      socket.off('error', onPushedError);
    };
  }, [rejoinStoredSession]);

  /* ------------------------------- intents ------------------------------ */

  const createRoom = useCallback(
    async (request: CreateRoomRequest): Promise<Result<RoomState>> => {
      const result = await ask<{ playerId: PlayerId; reconnectToken: string; state: RoomState }>(
        (socket, resolve) => socket.emit('room:create', request, resolve),
        'room:create',
      );
      if (result.ok) {
        applyIdentity(result.data.state.code, result.data.playerId, result.data.reconnectToken);
        setRoom(result.data.state);
        setError(null);
        return { ok: true, data: result.data.state };
      }
      setError(result.error);
      return result;
    },
    [ask, applyIdentity],
  );

  const joinRoom = useCallback(
    async (request: JoinRoomRequest): Promise<Result<RoomState>> => {
      const result = await ask<{ playerId: PlayerId; reconnectToken: string; state: RoomState }>(
        (socket, resolve) => socket.emit('room:join', request, resolve),
        'room:join',
      );
      if (result.ok) {
        applyIdentity(result.data.state.code, result.data.playerId, result.data.reconnectToken);
        setRoom(result.data.state);
        setError(null);
        return { ok: true, data: result.data.state };
      }
      setError(result.error);
      return result;
    },
    [ask, applyIdentity],
  );

  const leaveRoom = useCallback(async () => {
    await ask<{ left: true }>((socket, resolve) => socket.emit('room:leave', resolve), 'room:leave');
    writeSession(null);
    setRoom(null);
    setMeId(null);
  }, [ask]);

  const setReady = useCallback(
    async (ready: boolean): Promise<Result<RoomState>> => {
      const result = await ask<RoomState>(
        (socket, resolve) => socket.emit('player:ready', ready, resolve),
        'player:ready',
      );
      if (result.ok) setRoom(result.data);
      else setError(result.error);
      return result;
    },
    [ask],
  );

  const updateRoom = useCallback(
    async (patch: UpdateRoomRequest): Promise<Result<RoomState>> => {
      const result = await ask<RoomState>(
        (socket, resolve) => socket.emit('room:update', patch, resolve),
        'room:update',
      );
      if (result.ok) setRoom(result.data);
      else setError(result.error);
      return result;
    },
    [ask],
  );

  const transferHost = useCallback(
    async (playerId: PlayerId): Promise<Result<RoomState>> => {
      const result = await ask<RoomState>(
        (socket, resolve) => socket.emit('host:transfer', { playerId }, resolve),
        'host:transfer',
      );
      if (result.ok) setRoom(result.data);
      else setError(result.error);
      return result;
    },
    [ask],
  );

  const startMatch = useCallback(async (): Promise<Result<RoomState>> => {
    const result = await ask<RoomState>(
      (socket, resolve) => socket.emit('game:start', resolve),
      'game:start',
    );
    if (result.ok) setRoom(result.data);
    else setError(result.error);
    return result;
  }, [ask]);

  const clearError = useCallback(() => setError(null), []);

  const retryConnection = useCallback(() => {
    const socket = getSocket();
    setBoot('pending');
    if (socket.connected) {
      rejoinStoredSession(socket);
      return;
    }
    setConnection('connecting');
    socket.connect();
  }, [rejoinStoredSession]);

  const value = useMemo<RoomValue>(
    () => ({
      connection,
      boot,
      room,
      meId,
      error,
      clearError,
      retryConnection,
      createRoom,
      joinRoom,
      leaveRoom,
      setReady,
      updateRoom,
      transferHost,
      startMatch,
    }),
    [
      connection,
      boot,
      room,
      meId,
      error,
      clearError,
      retryConnection,
      createRoom,
      joinRoom,
      leaveRoom,
      setReady,
      updateRoom,
      transferHost,
      startMatch,
    ],
  );

  return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>;
}

export function useRoom(): RoomValue {
  const value = useContext(RoomContext);
  if (!value) throw new Error('useRoom must be used inside <RoomProvider>');
  return value;
}

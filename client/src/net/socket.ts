import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@playverse/shared';

export type PlayverseSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let instance: PlayverseSocket | null = null;

/**
 * The app's single Socket.IO connection.
 *
 * Same-origin by design: in dev Vite proxies `/socket.io` to :3001, and the
 * production preview proxies identically — no origin/CORS juggling in app
 * code, and no socket exists until something asks for one (unit tests can
 * mock this module instead of opening real connections).
 */
export function getSocket(): PlayverseSocket {
  if (!instance) {
    instance = io({
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 400,
      reconnectionDelayMax: 3000,
      timeout: 5000,
    });
  }
  return instance;
}

/** Test hook: drop the singleton so each test starts clean. */
export function resetSocket(): void {
  instance?.removeAllListeners();
  instance?.disconnect();
  instance = null;
}

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { io as connectSocket, type Socket as ClientSocket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SessionPong,
  SessionWelcome,
} from '@playverse/shared';
import { startServer, type RunningServer } from '../server';

type AppClientSocket = ClientSocket<ServerToClientEvents, ClientToServerEvents>;

interface HealthBody {
  status: string;
  service: string;
  version: string;
  protocolVersion: number;
  sockets: number;
  uptimeSeconds: number;
  serverTime: number;
}

describe('PLAYVERSE server (Phase 1 foundation)', () => {
  let server: RunningServer;
  const openSockets: AppClientSocket[] = [];

  beforeEach(async () => {
    server = await startServer({ port: 0, host: '127.0.0.1' });
  });

  afterEach(async () => {
    for (const socket of openSockets.splice(0)) {
      socket.removeAllListeners();
      socket.disconnect();
    }
    await server.close();
  });

  function openSocket(): AppClientSocket {
    const socket = connectSocket(server.origin, {
      transports: ['websocket'],
      forceNew: true,
    }) as unknown as AppClientSocket;
    openSockets.push(socket);
    return socket;
  }

  function waitFor<T>(socket: AppClientSocket, event: keyof ServerToClientEvents): Promise<T> {
    return new Promise<T>((resolve) => {
      // The event name is checked by the caller at compile time through
      // `keyof ServerToClientEvents`; the cast unifies the listener signature.
      // `.bind(socket)` keeps component-emitter's `this` intact.
      const once = socket.once.bind(socket) as unknown as (
        name: string,
        handler: (payload: T) => void,
      ) => void;
      once(event as string, resolve);
    });
  }

  async function health(): Promise<HealthBody> {
    const response = await fetch(`${server.origin}/api/health`);
    expect(response.status).toBe(200);
    return (await response.json()) as HealthBody;
  }

  it('serves a health probe with protocol info and CORS header', async () => {
    const body = await health();

    expect(body.status).toBe('ok');
    expect(body.service).toBe('playverse-server');
    expect(body.protocolVersion).toBe(1);
    expect(body.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(body.sockets).toBe(0);
    expect(typeof body.serverTime).toBe('number');

    const response = await fetch(`${server.origin}/api/health`);
    expect(response.headers.get('access-control-allow-origin')).toBe(
      server.config.clientOrigins[0],
    );
  });

  it('returns JSON 404 for unknown routes', async () => {
    const response = await fetch(`${server.origin}/api/nope`);
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ status: 'error', code: 'not-found' });
  });

  it('welcomes a connecting socket with server time and protocol version', async () => {
    const socket = openSocket();
    const welcome = await waitFor<SessionWelcome>(socket, 'session:welcome');

    expect(welcome.protocolVersion).toBe(1);
    expect(welcome.connectionId).toBe(socket.id);
    expect(typeof welcome.serverTime).toBe('number');
    expect(welcome.serverTime).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it('echoes session:ping with the server clock (RTT handshake)', async () => {
    const socket = openSocket();
    await waitFor<SessionWelcome>(socket, 'session:welcome');

    const clientTime = Date.now();
    socket.emit('session:ping', clientTime);
    const pong = await waitFor<SessionPong>(socket, 'session:pong');

    expect(pong.clientTime).toBe(clientTime);
    expect(pong.serverTime).toBeGreaterThanOrEqual(clientTime);
    expect(pong.serverTime).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it('tracks live socket connections in the health payload', async () => {
    const socket = openSocket();
    await waitFor<SessionWelcome>(socket, 'session:welcome');

    await vi.waitFor(
      async () => {
        expect((await health()).sockets).toBe(1);
      },
      { timeout: 3000 },
    );

    socket.disconnect();

    await vi.waitFor(
      async () => {
        expect((await health()).sockets).toBe(0);
      },
      { timeout: 3000 },
    );
  });

  it('handles several simultaneous clients', async () => {
    const sockets = [openSocket(), openSocket(), openSocket()];
    const welcomes = await Promise.all(
      sockets.map((socket) => waitFor<SessionWelcome>(socket, 'session:welcome')),
    );

    expect(welcomes.map((welcome) => welcome.connectionId)).toHaveLength(3);
    expect(new Set(welcomes.map((welcome) => welcome.connectionId)).size).toBe(3);

    await vi.waitFor(
      async () => {
        expect((await health()).sockets).toBe(3);
      },
      { timeout: 3000 },
    );
  });
});

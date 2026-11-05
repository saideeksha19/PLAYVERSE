import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp, type SocketStats } from './app';
import { attachSocketServer, type AppServer, type SocketLayer } from './socket';
import { loadConfig, type ServerConfig } from './config';
import type { RoomService } from './rooms';
import type { MatchEngine } from './match';

export interface RunningServer {
  config: ServerConfig;
  io: AppServer;
  rooms: RoomService;
  match: MatchEngine;
  stats: SocketStats;
  port: number;
  /** e.g. http://localhost:3001 */
  origin: string;
  close: () => Promise<void>;
}

/**
 * Boots the HTTP + Socket.IO stack. Used by `index.ts` in production and by
 * integration tests (pass `{ port: 0 }` for an ephemeral port).
 */
export async function startServer(
  overrides: Partial<ServerConfig> = {},
): Promise<RunningServer> {
  const config: ServerConfig = { ...loadConfig(), ...overrides };
  const stats: SocketStats = { connections: 0 };

  const app = createApp(config, stats);
  const httpServer = createServer(app);
  const layer: SocketLayer = attachSocketServer(httpServer, config, stats);
  const { io, rooms, match } = layer;

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    httpServer.once('error', onError);
    httpServer.listen(config.port, config.host, () => {
      httpServer.off('error', onError);
      resolve();
    });
  });

  const address = httpServer.address() as AddressInfo | null;
  const port = address?.port ?? config.port;

  return {
    config,
    io,
    rooms,
    match,
    stats,
    port,
    origin: `http://localhost:${port}`,
    close: async () => {
      await new Promise<void>((resolve) => {
        io.close(() => resolve());
      });
      await new Promise<void>((resolve) => {
        httpServer.close(() => resolve());
      });
    },
  };
}

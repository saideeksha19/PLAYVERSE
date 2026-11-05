import { readFileSync } from 'node:fs';
import express, { type Express, type Request, type Response } from 'express';
import type { ServerConfig } from './config';

/** Live socket counters shared with the Socket.IO layer. */
export interface SocketStats {
  connections: number;
}

function readVersion(): string {
  try {
    const raw = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
    return (JSON.parse(raw) as { version?: string }).version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

const VERSION = readVersion();

/**
 * Creates the Express application.
 *
 * Phase 1 exposes only the health probe. Game routes are socket-driven, so
 * there is nothing else HTTP-side yet — deliberately.
 */
export function createApp(config: ServerConfig, stats: SocketStats): Express {
  const app = express();

  app.disable('x-powered-by');

  // The client normally reaches the API through the Vite proxy (same origin),
  // but allow the configured origins directly so the server can be used standalone.
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    const allowed = origin && config.clientOrigins.includes(origin);
    res.setHeader('Access-Control-Allow-Origin', allowed ? origin : (config.clientOrigins[0] ?? ''));
    res.setHeader('Vary', 'Origin');
    next();
  });

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      service: 'playverse-server',
      version: VERSION,
      protocolVersion: config.protocolVersion,
      sockets: stats.connections,
      uptimeSeconds: Math.round(process.uptime()),
      serverTime: Date.now(),
    });
  });

  // Anything else is a 404 (JSON, so API clients stay happy).
  app.use((_req, res) => {
    res.status(404).json({ status: 'error', code: 'not-found' });
  });

  return app;
}

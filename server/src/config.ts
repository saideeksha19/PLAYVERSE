import { PROTOCOL_VERSION } from '@playverse/shared';

export interface ServerConfig {
  /** TCP port to listen on (0 = ephemeral, used by tests). */
  port: number;
  /** Bind address. */
  host: string;
  /** Allowed browser origins (dev client, preview build, deployed SPA). */
  clientOrigins: string[];
  /** How long a disconnected player keeps their slot before removal (ms). */
  disconnectGraceMs: number;
  /** Length of a Color Clash round (ms). */
  roundMs: number;
  /** How long round results stay up before the server advances (ms). */
  revealMs: number;
  /** How long the intro waits for readiness before starting anyway (ms). */
  introMs: number;
  /** Shared Socket.IO protocol version. */
  protocolVersion: number;
}

const DEFAULT_PORT = 3001;
const DEFAULT_GRACE_MS = 60_000;

/**
 * Match timings are server-owned. Defaults are tuned for a relaxed party
 * game; the Playwright webServer shortens them so the e2e match is quick.
 */
const DEFAULT_ROUND_MS = 12_000;
const DEFAULT_REVEAL_MS = 5_000;
const DEFAULT_INTRO_MS = 15_000;

/**
 * Both local dev origins are allowed by default: the Vite dev server (:5173)
 * and the production preview Playwright e2e runs against (:4173). Deployments
 * override with CLIENT_ORIGIN (comma-separated list).
 */
const DEFAULT_ORIGINS = ['http://localhost:5173', 'http://localhost:4173'];

function readPort(value: string | undefined): number {
  if (!value) return DEFAULT_PORT;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65_535) return DEFAULT_PORT;
  return parsed;
}

function readOrigins(value: string | undefined): string[] {
  if (!value) return DEFAULT_ORIGINS;
  const list = value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  return list.length > 0 ? list : DEFAULT_ORIGINS;
}

function readGrace(value: string | undefined): number {
  if (!value) return DEFAULT_GRACE_MS;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) return DEFAULT_GRACE_MS;
  return parsed;
}

/** Timings clamp to a playable window so a typo cannot freeze a match. */
function readTiming(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 100 || parsed > 120_000) return fallback;
  return parsed;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  return {
    port: readPort(env.PORT),
    host: env.HOST ?? '0.0.0.0',
    clientOrigins: readOrigins(env.CLIENT_ORIGIN),
    disconnectGraceMs: readGrace(env.DISCONNECT_GRACE_MS),
    roundMs: readTiming(env.PLAYVERSE_ROUND_MS, DEFAULT_ROUND_MS),
    revealMs: readTiming(env.PLAYVERSE_REVEAL_MS, DEFAULT_REVEAL_MS),
    introMs: readTiming(env.PLAYVERSE_INTRO_MS, DEFAULT_INTRO_MS),
    protocolVersion: PROTOCOL_VERSION,
  };
}

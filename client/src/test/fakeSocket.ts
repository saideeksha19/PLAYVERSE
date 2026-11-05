/**
 * In-memory stand-in for the app's Socket.IO client.
 *
 * Every client test runs against this instead of a real connection (see
 * `setup.ts`): `emit` records the intent and resolves its ack from a
 * per-event responder, while `deliver` replays server→client events exactly
 * as the real socket would. That keeps screen tests deterministic and lets
 * them assert on the wire protocol, not on timing.
 */

type Listener = (...args: any[]) => void;

class FakeEmitter {
  private listeners = new Map<string, Set<Listener>>();

  on(event: string, listener: Listener): this {
    const set = this.listeners.get(event) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(event, set);
    return this;
  }

  off(event: string, listener: Listener): this {
    this.listeners.get(event)?.delete(listener);
    return this;
  }

  removeAllListeners(event?: string): this {
    if (event) this.listeners.delete(event);
    else this.listeners.clear();
    return this;
  }

  /** How many listeners are registered — used to prove cleanup on unmount. */
  listenerCount(event: string): number {
    return this.listeners.get(event)?.size ?? 0;
  }

  /** Delivers an event to every current listener (server → client). */
  deliver(event: string, ...args: unknown[]): void {
    for (const listener of [...(this.listeners.get(event) ?? [])]) listener(...args);
  }
}

/** Manager-level events the provider subscribes to for reconnect state. */
export class FakeManager extends FakeEmitter {}

export interface SentEvent {
  event: string;
  payload: unknown;
}

type Responder = (payload: any) => unknown;

export class FakeSocket extends FakeEmitter {
  /** Starts connected: mounting a provider resolves immediately, like a warm socket. */
  connected = true;

  readonly io = new FakeManager();
  readonly sent: SentEvent[] = [];

  private responders = new Map<string, Responder>();

  /** The ack result the fake server returns for `event`. */
  respond(event: string, responder: Responder): this {
    this.responders.set(event, responder);
    return this;
  }

  /** Client → server intent; Socket.IO passes the ack as the last argument. */
  emit(event: string, ...args: any[]): this {
    const last = args[args.length - 1];
    const ack = typeof last === 'function' ? last : null;
    this.sent.push({ event, payload: args.length > 1 ? args[0] : undefined });

    const responder = this.responders.get(event);
    if (ack && responder) {
      Promise.resolve(responder(this.sent[this.sent.length - 1]!.payload)).then((result) =>
        ack(result),
      );
    }
    return this;
  }

  disconnect(): void {
    this.connected = false;
  }

  /** Real sockets expose connect(); tests use it for manual recovery paths. */
  connect(): this {
    this.restoreConnection();
    return this;
  }

  /** Most recent intent for an event (tests assert on the payload). */
  lastSent(event: string): SentEvent | undefined {
    return [...this.sent].reverse().find((entry) => entry.event === event);
  }

  /* --------------------------- transport controls --------------------------- */

  /** Transport drop, as Socket.IO reports it to `disconnect` listeners. */
  dropConnection(reason = 'transport close'): void {
    this.connected = false;
    this.deliver('disconnect', reason);
  }

  /** Transport recovered: fires `connect`, like a successful reconnect. */
  restoreConnection(): void {
    this.connected = true;
    this.deliver('connect');
  }

  reconnectAttempt(): void {
    this.io.deliver('reconnect_attempt', 1);
  }

  failReconnection(): void {
    this.io.deliver('reconnect_failed');
  }
}

let current: FakeSocket | null = null;

export function getFakeSocket(): FakeSocket {
  current ??= new FakeSocket();
  return current;
}

/** Fresh socket + clean session storage for each test. */
export function resetFakeSocket(): void {
  current?.removeAllListeners();
  current?.io.removeAllListeners();
  current = null;
  try {
    sessionStorage.clear();
  } catch {
    // jsdom always has sessionStorage; a real browser may refuse in private mode.
  }
  try {
    localStorage.clear();
  } catch {
    // Same degradation as above: preferences fall back to defaults.
  }
}

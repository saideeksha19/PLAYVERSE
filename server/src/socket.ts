import { Server } from 'socket.io';
import type { Server as HttpServer } from 'node:http';
import {
  err,
  ok,
  type ClientToServerEvents,
  type CreateRoomRequest,
  type JoinRoomRequest,
  type Player,
  type PlayerId,
  type RejoinRoomRequest,
  type Result,
  type RoomCode,
  type ServerToClientEvents,
  type SessionPong,
  type SessionWelcome,
  type UpdateRoomRequest,
} from '@playverse/shared';
import type { ServerConfig } from './config';
import type { SocketStats } from './app';
import { RoomService, type ServerPlayer } from './rooms';
import { MatchEngine } from './match';

/**
 * Typed Socket.IO server.
 * Generic order: events the server *listens* for (client → server), then
 * events it *emits* (server → client).
 */
export type AppServer = Server<ClientToServerEvents, ServerToClientEvents>;

/** The room engine bound to a live server; integration tests grab it here. */
export interface SocketLayer {
  io: AppServer;
  rooms: RoomService;
  match: MatchEngine;
}

/**
 * Attaches Socket.IO to an HTTP server and wires the server-authoritative
 * room handlers. Every mutating request is acknowledged with `Result<T>` —
 * the server never trusts client-supplied state, host permissions or codes.
 */
export function attachSocketServer(
  httpServer: HttpServer,
  config: ServerConfig,
  stats: SocketStats,
): SocketLayer {
  const io: AppServer = new Server(httpServer, {
    cors: {
      origin: config.clientOrigins,
      methods: ['GET', 'POST'],
    },
  });

  const rooms = new RoomService(config.disconnectGraceMs);

  /**
   * The match engine binds server-owned round events to the room channel, so
   * every participant of a code receives the same question and reveal.
   */
  const match = new MatchEngine(
    rooms,
    { roundMs: config.roundMs, revealMs: config.revealMs, introMs: config.introMs },
    {
      intro: (code, intro) => io.to(code).emit('game:intro', intro),
      roundStart: (code, question) => io.to(code).emit('round:start', question),
      answers: (code, payload) => io.to(code).emit('round:answers', payload),
      reveal: (code, reveal) => io.to(code).emit('round:reveal', reveal),
      results: (code, results) => io.to(code).emit('match:results', results),
    },
  );

  rooms.setBroadcaster({
    broadcastState: (code: RoomCode) => {
      const room = rooms.getRoom(code);
      if (room) io.to(code).emit('room:state', rooms.toState(room));
    },
    playerJoined: (code: RoomCode, player: Player) => {
      io.to(code).emit('player:joined', {
        playerId: player.id,
        nickname: player.nickname,
        avatarId: player.avatarId,
      });
    },
    playerLeft: (code: RoomCode, playerId: PlayerId) => {
      io.to(code).emit('player:left', { playerId });
    },
  });

  /** Host-only guard shared by the round/replay commands. */
  function withHost<T>(player: ServerPlayer, run: () => Result<T>): Result<T> {
    if (!player.isHost) return err('not-host', 'Only the host can do that.');
    return run();
  }

  /** Wraps a handler so unexpected throws become typed error acks. */
  function command<T>(handler: () => Result<T>, ack: (result: Result<T>) => void): void {
    try {
      ack(handler());
    } catch {
      ack({
        ok: false,
        error: { code: 'server-error', message: 'Something went wrong on the server — try again.' },
      });
    }
  }

  io.on('connection', (socket) => {
    stats.connections += 1;

    const welcome: SessionWelcome = {
      serverTime: Date.now(),
      protocolVersion: config.protocolVersion,
      connectionId: socket.id,
    };
    socket.emit('session:welcome', welcome);

    // The socket joins its room's channel so state broadcasts are scoped.
    socket.on('room:create', (payload: CreateRoomRequest, ack) => {
      command(() => {
        const result = rooms.create(socket.id, payload);
        if (result.ok) {
          // Join first, then hand the joiner its own state: the channel
          // broadcast fires inside rooms.create, before the channel exists.
          void socket.join(result.data.state.code);
          socket.emit('room:state', result.data.state);
        }
        return result;
      }, ack);
    });

    socket.on('room:join', (payload: JoinRoomRequest, ack) => {
      command(() => {
        const result = rooms.join(socket.id, payload);
        if (result.ok) {
          void socket.join(result.data.state.code);
          socket.emit('room:state', result.data.state);
        }
        return result;
      }, ack);
    });

    socket.on('room:rejoin', (payload: RejoinRoomRequest, ack) => {
      command(() => {
        const result = rooms.rejoin(socket.id, payload);
        if (result.ok) {
          void socket.join(result.data.state.code);
          socket.emit('room:state', result.data.state);
          socket.emit('connection:resume', { state: result.data.state, resumedAt: Date.now() });
          // Re-render whatever the room is showing: intro, live round, reveal
          // or final results. Without this a reload mid-match lands on a
          // blank game screen.
          const resume = match.resume(result.data.state.code);
          if (resume.intro) socket.emit('game:intro', resume.intro);
          if (resume.question) socket.emit('round:start', resume.question);
          if (resume.answers) socket.emit('round:answers', resume.answers);
          if (resume.reveal) socket.emit('round:reveal', resume.reveal);
          if (resume.results) socket.emit('match:results', resume.results);
        }
        return result;
      }, ack);
    });

    socket.on('room:leave', (ack) => {
      command(() => {
        const removed = rooms.leave(socket.id);
        if (removed) {
          socket.leave(removed.code);
          match.departure(removed.code, removed.playerId);
        }
        return ok({ left: true as const });
      }, ack);
    });

    socket.on('host:transfer', (payload, ack) => {
      command(() => rooms.transferHost(socket.id, payload.playerId), ack);
    });

    socket.on('room:update', (payload: UpdateRoomRequest, ack) => {
      command(() => rooms.updateRoom(socket.id, payload), ack);
    });

    socket.on('player:ready', (ready: boolean, ack) => {
      command(() => rooms.setReady(socket.id, ready), ack);
    });

    socket.on('player:unready', (ack) => {
      command(() => rooms.setReady(socket.id, false), ack);
    });

    socket.on('game:start', (ack) => {
      command(() => {
        const started = rooms.startMatch(socket.id);
        if (started.ok) match.begin(started.data.code);
        return started;
      }, ack);
    });

    /* ---------------------------- match play --------------------------- */

    socket.on('round:ready', (ack) => {
      command(() => {
        const actor = rooms.actorFor(socket.id);
        if (!actor.ok) return actor;
        return match.markReady(actor.data.room.code, actor.data.player.id);
      }, ack);
    });

    socket.on('game:answer', (payload, ack) => {
      command(() => {
        const actor = rooms.actorFor(socket.id);
        if (!actor.ok) return actor;
        return match.answer(actor.data.room.code, actor.data.player.id, payload);
      }, ack);
    });

    socket.on('round:continue', (ack) => {
      command(() => {
        const actor = rooms.actorFor(socket.id);
        if (!actor.ok) return actor;
        return withHost(actor.data.player, () => match.advance(actor.data.room.code));
      }, ack);
    });

    socket.on('match:rematch', (ack) => {
      command(() => {
        const actor = rooms.actorFor(socket.id);
        if (!actor.ok) return actor;
        return withHost(actor.data.player, () => match.rematch(actor.data.room.code));
      }, ack);
    });

    socket.on('match:lobby', (ack) => {
      command(() => {
        const actor = rooms.actorFor(socket.id);
        if (!actor.ok) return actor;
        return withHost(actor.data.player, () => match.returnToLobby(actor.data.room.code));
      }, ack);
    });

    socket.on('session:ping', (clientTime: number) => {
      const pong: SessionPong = { clientTime, serverTime: Date.now() };
      socket.emit('session:pong', pong);
    });

    socket.on('disconnect', () => {
      stats.connections = Math.max(0, stats.connections - 1);
      const dropped = rooms.handleDisconnect(socket.id);
      if (dropped) match.departure(dropped.code, dropped.playerId);
    });
  });

  return { io, rooms, match };
}

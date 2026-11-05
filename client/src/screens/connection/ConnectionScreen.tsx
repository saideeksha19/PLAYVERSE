import { getAvatar } from '@playverse/shared';
import { Badge, type BadgeTone } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { CubeAvatar } from '../../ui/CubeAvatar';
import { Notice } from '../../ui/Notice';
import { Panel } from '../../ui/Panel';
import { ScreenHeader } from '../../ui/ScreenHeader';
import { ScreenShell } from '../ScreenShell';
import { useNavigation } from '../../nav/navigation';
import { useRoom } from '../../state/room';

const CONNECTION_COPY = {
  connected: 'Connected to the game server.',
  connecting: 'Opening the connection…',
  reconnecting: 'Connection lost — trying to reconnect.',
  offline: 'Offline. The server connection is closed.',
} as const;

const CONNECTION_TONE: Record<keyof typeof CONNECTION_COPY, BadgeTone> = {
  connected: 'forest',
  connecting: 'sky',
  reconnecting: 'energy',
  offline: 'coral',
};

/** Screen 12 — transport state and a manual rejoin path. */
export function ConnectionScreen() {
  const { navigate } = useNavigation();
  const { connection, boot, room, meId, error, clearError, retryConnection } = useRoom();
  const me = room?.players.find((player) => player.id === meId) ?? null;
  const recovering = connection === 'connecting' || boot === 'pending';

  return (
    <ScreenShell scrim="center">
      <ScreenHeader
        index={12}
        title="Connection & Recovery"
        subtitle="Get back in the game"
        onBack={() => navigate('/home')}
        backLabel="Back to Home"
        badge={<Badge tone={CONNECTION_TONE[connection]}>{connection}</Badge>}
      />

      <div className="flex flex-1 items-start justify-center">
        <Panel className="w-full max-w-2xl">
          <div className="flex flex-col gap-4">
            <Notice
              tone={connection === 'connected' && boot === 'resolved' ? 'success' : 'warning'}
              data-testid="connection-status"
            >
              <span>
                <strong className="font-display">{CONNECTION_COPY[connection]}</strong>{' '}
                {boot === 'pending'
                  ? ' Checking for a saved room…'
                  : room
                    ? ' Your saved session is active.'
                    : ' No saved room session on this device.'}
              </span>
            </Notice>

            {room ? (
              <div className="rounded-2xl border border-white/12 bg-white/6 p-4" data-testid="connection-room">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-widest text-play-soft/55">
                      Current room
                    </p>
                    <p className="font-display text-2xl font-bold text-play-soft">{room.code}</p>
                    <p className="text-xs font-semibold text-play-soft/65">
                      {room.name} · {room.status} · {room.players.length}/{room.maxPlayers} players
                    </p>
                  </div>
                  {me ? (
                    <div className="flex items-center gap-2 rounded-full border border-white/15 bg-white/6 px-3 py-1.5">
                      <CubeAvatar avatar={getAvatar(me.avatarId)} size="sm" className="h-6 w-6" />
                      <span className="font-display text-sm font-bold text-play-soft">
                        {me.nickname}
                      </span>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {error ? (
              <Notice tone="warning" role="alert" data-testid="connection-error">
                <span className="flex w-full items-center justify-between gap-3">
                  <span>{error.message}</span>
                  <Button variant="ghost" size="sm" onClick={clearError}>
                    Dismiss
                  </Button>
                </span>
              </Notice>
            ) : null}

            <div className="flex flex-col gap-2.5 sm:flex-row">
              <Button
                fullWidth
                onClick={retryConnection}
                disabled={recovering}
                data-testid="retry-connection"
              >
                {recovering ? 'Recovering…' : 'Retry connection'}
              </Button>
              <Button
                variant="secondary"
                fullWidth
                onClick={() => navigate(room ? '/lobby' : '/home')}
              >
                {room ? 'Back to Lobby' : 'Back to Home'}
              </Button>
            </div>

            <Notice tone="info">
              A dropped player keeps their slot for a short grace period. Reloading this
              tab restores the same player id and reconnect token from session storage.
            </Notice>
          </div>
        </Panel>
      </div>
    </ScreenShell>
  );
}

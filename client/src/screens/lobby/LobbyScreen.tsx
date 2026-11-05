import { useEffect, useRef, useState } from 'react';
import { MIN_PLAYERS, TOTAL_ROUNDS, getAvatar } from '@playverse/shared';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { CubeAvatar } from '../../ui/CubeAvatar';
import { IconCheck, IconCopy, IconCrown, IconPlay, IconShare } from '../../ui/icons';
import { Notice } from '../../ui/Notice';
import { Panel } from '../../ui/Panel';
import { ScreenHeader } from '../../ui/ScreenHeader';
import { ScreenShell } from '../ScreenShell';
import { useNavigation } from '../../nav/navigation';
import { useRoom, type ConnectionState } from '../../state/room';

const CONNECTION_BADGE: Record<ConnectionState, { tone: 'forest' | 'energy' | 'coral'; label: string }> = {
  connected: { tone: 'forest', label: 'Live' },
  connecting: { tone: 'energy', label: 'Connecting…' },
  reconnecting: { tone: 'energy', label: 'Reconnecting…' },
  offline: { tone: 'coral', label: 'Offline' },
};

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Clipboard unavailable (permissions / insecure context).
  }
  return false;
}

/**
 * Screen 5 — Waiting Lobby. Every visible fact comes from the server's
 * `room:state` broadcasts: roster, capacity, host crown, ready flags and the
 * start gate. This screen renders intents only — it never invents room data.
 */
export function LobbyScreen() {
  const { navigate } = useNavigation();
  const {
    connection,
    boot,
    room,
    meId,
    error,
    clearError,
    setReady,
    leaveRoom,
    transferHost,
    startMatch,
  } = useRoom();

  const [copied, setCopied] = useState<'code' | 'link' | null>(null);
  const [pendingStart, setPendingStart] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    [],
  );

  if (boot === 'pending') {
    return (
      <ScreenShell scrim="center">
        <ScreenHeader
          index={5}
          title="Waiting Lobby"
          subtitle="See who's here and get ready"
          onBack={() => navigate('/home')}
          backLabel="Back to Home"
        />
        <div className="flex flex-1 items-start justify-center">
          <Panel className="w-full max-w-xl">
            <p className="py-6 text-center font-display text-lg text-play-soft/85">
              Connecting to the server…
            </p>
          </Panel>
        </div>
      </ScreenShell>
    );
  }

  if (!room) {
    return (
      <ScreenShell scrim="center">
        <ScreenHeader
          index={5}
          title="Waiting Lobby"
          subtitle="See who's here and get ready"
          onBack={() => navigate('/home')}
          backLabel="Back to Home"
        />
        <div className="flex flex-1 items-start justify-center">
          <Panel className="w-full max-w-xl">
            <div className="flex flex-col gap-4">
              <Notice tone="warning" data-testid="no-room">
                <span>
                  <strong className="font-display">You're not in a room.</strong>{' '}
                  {error ? error.message : 'Create a room or join with a code to see the lobby.'}
                </span>
              </Notice>
              <div className="flex gap-3">
                <Button fullWidth onClick={() => navigate('/create-room')}>
                  Create a Room
                </Button>
                <Button variant="secondary" fullWidth onClick={() => navigate('/join-room')}>
                  Join a Room
                </Button>
              </div>
            </div>
          </Panel>
        </div>
      </ScreenShell>
    );
  }

  const me = room.players.find((player) => player.id === meId) ?? null;
  const connectedPlayers = room.players.filter((player) => player.connected);
  const readyCount = connectedPlayers.filter((player) => player.isReady).length;
  const everyoneReady =
    connectedPlayers.length >= MIN_PLAYERS && connectedPlayers.every((player) => player.isReady);
  const iAmHost = me?.isHost ?? false;
  const openSlots = Math.max(0, room.maxPlayers - room.players.length);
  const badge = CONNECTION_BADGE[connection];
  const matchStarted = room.status !== 'lobby';

  const inviteUrl = `${window.location.origin}/#/join-room?code=${room.code}`;

  const flashCopied = (what: 'code' | 'link') => {
    setCopied(what);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(null), 2000);
  };

  const handleCopyCode = async () => {
    if (await copyText(room.code)) flashCopied('code');
  };

  const handleShare = async () => {
    const shareData = {
      title: 'PLAYVERSE',
      text: `Join my PLAYVERSE room (${room.code})`,
      url: inviteUrl,
    };
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share(shareData);
        return;
      } catch {
        // User cancelled or sharing failed — fall through to clipboard.
      }
    }
    if (await copyText(inviteUrl)) flashCopied('link');
  };

  const handleReadyToggle = () => {
    if (me && !matchStarted) void setReady(!me.isReady);
  };

  const handleStart = async () => {
    if (pendingStart) return;
    setPendingStart(true);
    const result = await startMatch();
    setPendingStart(false);
    if (result.ok) navigate('/intro');
  };

  const handleLeave = async () => {
    await leaveRoom();
    navigate('/home');
  };

  const handleTransfer = (playerId: string) => {
    void transferHost(playerId);
  };

  return (
    <ScreenShell scrim="center">
      <ScreenHeader
        index={5}
        title="Waiting Lobby"
        subtitle="See who's here and get ready"
        badge={<Badge tone={badge.tone}>{badge.label}</Badge>}
        onBack={() => navigate('/home')}
        backLabel="Back to Home"
      />

      <div className="flex flex-1 items-start justify-center">
        <Panel className="w-full max-w-3xl">
          <div className="flex flex-col gap-5">
            {connection !== 'connected' ? (
              <Notice tone="warning" data-testid="connection-banner">
                <span>
                  <strong className="font-display">
                    {connection === 'offline' ? 'Connection lost.' : 'Reconnecting…'}
                  </strong>{' '}
                  Your slot is held — you'll rejoin this room automatically when the connection
                  returns.
                </span>
              </Notice>
            ) : null}

            {error ? (
              <Notice tone="warning" role="alert" data-testid="lobby-error">
                <span className="flex items-center justify-between gap-3">
                  <span>{error.message}</span>
                  <Button variant="ghost" size="sm" onClick={clearError}>
                    Dismiss
                  </Button>
                </span>
              </Notice>
            ) : null}

            {matchStarted ? (
              <Notice tone="info" data-testid="match-started">
                <span className="flex items-center justify-between gap-3">
                  <span>
                    <strong className="font-display">The match has started.</strong> Round{' '}
                    {room.roundIndex} of {TOTAL_ROUNDS} is under way.
                  </span>
                  <Button variant="secondary" size="sm" onClick={() => navigate('/intro')}>
                    Back to Game Intro
                  </Button>
                </span>
              </Notice>
            ) : null}

            {/* Room code + meta */}
            <div className="flex flex-col gap-4 rounded-2xl border border-white/12 bg-play-cosmic/45 p-4 backdrop-blur-md sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-play-soft/65">
                  {room.name}
                </p>
                <p
                  className="font-display text-3xl font-bold tracking-[0.22em] text-play-energy sm:text-4xl"
                  aria-label={`Room code ${room.code.split('').join(' ')}`}
                >
                  {room.code}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<IconCopy className="h-4 w-4" />}
                  onClick={handleCopyCode}
                >
                  {copied === 'code' ? 'Copied!' : 'Copy'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<IconShare className="h-4 w-4" />}
                  onClick={handleShare}
                >
                  {copied === 'link' ? 'Link copied!' : 'Share Invite'}
                </Button>
                <span className="rounded-full border border-white/15 bg-white/8 px-3 py-1.5 text-xs font-bold text-play-soft/85">
                  {room.players.length}/{room.maxPlayers} players
                </span>
                <button
                  type="button"
                  aria-label="Lobby settings"
                  onClick={() => navigate('/settings')}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/8 text-play-soft/80 transition-colors hover:bg-white/15"
                >
                  ⚙
                </button>
              </div>
            </div>

            {/* Roster */}
            <ul className="grid grid-cols-4 gap-3 sm:grid-cols-8" aria-label="Players in the room">
              {room.players.map((player) => {
                const isMe = player.id === meId;
                const avatar = getAvatar(player.avatarId);
                const canTransfer = iAmHost && !player.isHost && player.connected;
                return (
                  <li
                    key={player.id}
                    className="flex flex-col items-center gap-1.5"
                    data-testid={`player-${player.nickname}`}
                  >
                    <span
                      className={`relative ${player.connected ? '' : 'opacity-45 grayscale'}`}
                    >
                      <CubeAvatar avatar={avatar} size="md" />
                      {player.isHost ? (
                        <span
                          aria-hidden="true"
                          className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-play-energy text-play-ocean shadow"
                        >
                          <IconCrown className="h-3.5 w-3.5" />
                        </span>
                      ) : null}
                    </span>
                    <span className="max-w-full truncate text-center text-xs font-bold text-play-soft">
                      {player.nickname}
                      {isMe ? ' (You)' : ''}
                    </span>
                    <span
                      className={[
                        'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                        player.isHost
                          ? 'bg-play-portal/35 text-play-soft'
                          : player.isReady
                            ? 'bg-play-forest/30 text-play-soft'
                            : 'bg-white/10 text-play-soft/60',
                      ].join(' ')}
                    >
                      {!player.connected
                        ? 'Offline'
                        : player.isHost
                          ? isMe
                            ? 'You · Host'
                            : 'Host'
                          : player.isReady
                            ? 'Ready'
                            : 'Not ready'}
                    </span>
                    {canTransfer ? (
                      <button
                        type="button"
                        className="text-[10px] font-bold uppercase tracking-wider text-play-energy underline-offset-2 hover:underline"
                        onClick={() => handleTransfer(player.id)}
                        aria-label={`Make ${player.nickname} the host`}
                      >
                        Make host
                      </button>
                    ) : null}
                  </li>
                );
              })}

              {Array.from({ length: openSlots }, (_, index) => (
                <li key={`slot-${index}`} className="flex flex-col items-center gap-1.5">
                  <span className="flex h-[56px] w-[56px] items-center justify-center rounded-[30%] border-2 border-dashed border-white/25 text-xl text-play-soft/45">
                    +
                  </span>
                  <span className="text-center text-xs font-semibold text-play-soft/50">
                    Open slot
                  </span>
                </li>
              ))}
            </ul>

            {/* Mode + ready state */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/12 bg-white/6 p-4">
                <p className="text-[11px] font-bold uppercase tracking-widest text-play-soft/60">
                  Game Mode
                </p>
                <p className="font-display text-xl font-semibold text-play-soft">
                  {room.mode === 'family-friendly' ? 'Family Friendly' : 'Classic'}
                </p>
                <p className="mt-1 text-xs font-semibold text-play-soft/60">
                  {TOTAL_ROUNDS} rounds · {room.maxPlayers} player max
                </p>
              </div>

              <div className="rounded-2xl border border-white/12 bg-white/6 p-4">
                <p className="text-[11px] font-bold uppercase tracking-widest text-play-soft/60">
                  Everyone Ready?
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    aria-pressed={me?.isReady ?? false}
                    disabled={!me || matchStarted || connection !== 'connected'}
                    onClick={handleReadyToggle}
                    className={[
                      'flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold transition-colors',
                      me?.isReady
                        ? 'border-play-forest bg-play-forest/25 text-play-soft'
                        : 'border-white/20 bg-white/8 text-play-soft/75 hover:bg-white/14',
                      'disabled:pointer-events-none disabled:opacity-55',
                    ].join(' ')}
                  >
                    <IconCheck
                      className={`h-4 w-4 ${me?.isReady ? 'text-play-forest' : 'text-play-soft/40'}`}
                    />
                    {me?.isReady ? 'Ready!' : 'Mark me ready'}
                  </button>
                  <span className="text-xs font-semibold text-play-soft/55" data-testid="ready-count">
                    {readyCount} of {connectedPlayers.length} ready
                    {everyoneReady && !matchStarted ? ' — all set!' : ''}
                  </span>
                </div>
              </div>
            </div>

            {/* Start */}
            {matchStarted ? null : (
              <>
                <Button
                  variant="success"
                  size="lg"
                  fullWidth
                  disabled={!iAmHost || !everyoneReady || pendingStart || connection !== 'connected'}
                  title={
                    iAmHost
                      ? everyoneReady
                        ? 'Start the match'
                        : `Waiting for everyone to be ready (${readyCount}/${connectedPlayers.length})`
                      : 'Only the host can start the match'
                  }
                  icon={<IconPlay className="h-5 w-5" />}
                  onClick={handleStart}
                >
                  {pendingStart ? 'Starting…' : 'Start Game'}
                </Button>

                <p className="text-center text-xs font-semibold text-play-soft/60">
                  {iAmHost
                    ? everyoneReady
                      ? 'Everyone is ready — start when you are!'
                      : `Start unlocks for the host once every player is ready (needs ${MIN_PLAYERS}+ present).`
                    : 'Waiting for the host to start once everyone is ready.'}
                </p>
              </>
            )}

            <Button
              variant="danger"
              fullWidth
              onClick={handleLeave}
              data-testid="leave-room"
            >
              Leave Room
            </Button>
          </div>
        </Panel>
      </div>
    </ScreenShell>
  );
}

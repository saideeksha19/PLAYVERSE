import { useState } from 'react';
import { getAvatar, type LeaderboardEntry } from '@playverse/shared';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { CubeAvatar } from '../../ui/CubeAvatar';
import { IconCrown, IconPlay, IconTrophy } from '../../ui/icons';
import { Notice } from '../../ui/Notice';
import { Panel } from '../../ui/Panel';
import { ScreenHeader } from '../../ui/ScreenHeader';
import { ScreenShell } from '../ScreenShell';
import { useRoom } from '../../state/room';
import { useGame } from '../../state/game';

const RANK_TONE: Record<number, string> = {
  1: 'border-play-energy/70 bg-play-energy/18',
  2: 'border-play-sky/60 bg-play-sky/12',
  3: 'border-play-coral/60 bg-play-coral/12',
};

/**
 * Screen 9 — Match Results.
 *
 * The final leaderboard is the server's `match:results` payload, ordered by
 * score with a deterministic tie-break, so every client sees the same ranks.
 * Only the host can start a rematch or reopen the lobby.
 */
export function MatchResultsScreen() {
  const { room, meId } = useRoom();
  const { results, rematch, returnToLobby } = useGame();
  const [pending, setPending] = useState<'rematch' | 'lobby' | null>(null);

  if (!room || !results) {
    return (
      <ScreenShell scrim="center">
        <ScreenHeader index={9} title="Match Results" subtitle="Final leaderboard after 5 rounds" />
        <div className="flex flex-1 items-start justify-center">
          <Panel className="w-full max-w-xl">
            <Notice tone="info" data-testid="match-results-waiting">
              Waiting for the final scores…
            </Notice>
          </Panel>
        </div>
      </ScreenShell>
    );
  }

  const me = room.players.find((player) => player.id === meId) ?? null;
  const isHost = me?.isHost ?? false;
  const mine = results.leaderboard.find((entry) => entry.playerId === meId) ?? null;
  const winner = results.leaderboard[0] ?? null;

  const handleRematch = async () => {
    if (pending) return;
    setPending('rematch');
    await rematch();
    setPending(null);
  };

  const handleLobby = async () => {
    if (pending) return;
    setPending('lobby');
    await returnToLobby();
    setPending(null);
  };

  return (
    <ScreenShell scrim="center">
      <ScreenHeader
        index={9}
        title="Match Results"
        subtitle={`${results.roundCount} rounds complete`}
        badge={<Badge tone="energy">Final scores</Badge>}
      />

      <div className="flex flex-1 items-start justify-center" data-testid="match-results">
        <Panel className="w-full max-w-2xl">
          <div className="flex flex-col gap-5">
            <div className="text-center">
              <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-play-energy text-play-ocean shadow-[0_5px_0_var(--color-play-energy-deep)]">
                <IconTrophy className="h-7 w-7" />
              </span>
              <h2 className="mt-2 font-display text-2xl font-bold text-play-soft">
                {winner ? `${winner.nickname} wins!` : 'Match complete'}
              </h2>
              {mine ? (
                <p className="text-sm font-semibold text-play-soft/70" data-testid="my-finish">
                  You finished #{mine.rank} with {mine.score} points.
                </p>
              ) : null}
            </div>

            {/* Podium */}
            <ul className="grid grid-cols-3 items-end gap-2" aria-label="Podium">
              {results.podium.map((entry) => (
                <li
                  key={entry.playerId}
                  data-testid={`podium-${entry.rank}`}
                  className={[
                    'flex flex-col items-center gap-1.5 rounded-2xl border px-2 py-3 text-center',
                    RANK_TONE[entry.rank] ?? 'border-white/12 bg-white/6',
                    entry.rank === 1 ? 'pb-5 pt-4' : '',
                  ].join(' ')}
                >
                  <span className="font-display text-[11px] font-bold uppercase tracking-wider text-play-soft/60">
                    {entry.rank === 1 ? 'Winner' : `#${entry.rank}`}
                  </span>
                  <CubeAvatar avatar={getAvatar(entry.avatarId)} size={entry.rank === 1 ? 'lg' : 'md'} />
                  <span className="max-w-full truncate font-display text-sm font-bold text-play-soft">
                    {entry.nickname}
                    {entry.rank === 1 ? (
                      <IconCrown className="ml-1 inline h-4 w-4 text-play-energy" />
                    ) : null}
                  </span>
                  <span className="font-display text-xl font-bold text-play-energy tabular-nums">
                    {entry.score}
                  </span>
                </li>
              ))}
            </ul>

            {/* Full standings */}
            <ul className="flex flex-col gap-1.5" aria-label="Full leaderboard">
              {results.leaderboard.map((entry) => (
                <LeaderboardRow key={entry.playerId} entry={entry} isMe={entry.playerId === meId} />
              ))}
            </ul>

            {isHost ? (
              <div className="flex flex-col gap-2.5 sm:flex-row">
                <Button
                  fullWidth
                  icon={<IconPlay className="h-5 w-5" />}
                  disabled={pending !== null}
                  onClick={handleRematch}
                  data-testid="rematch"
                >
                  {pending === 'rematch' ? 'Starting…' : 'Play Again'}
                </Button>
                <Button
                  variant="secondary"
                  fullWidth
                  disabled={pending !== null}
                  onClick={handleLobby}
                  data-testid="back-to-lobby"
                >
                  {pending === 'lobby' ? 'Returning…' : 'Back to Lobby'}
                </Button>
              </div>
            ) : (
              <Notice tone="info" data-testid="waiting-host">
                <span>The host can start a rematch or take everyone back to the lobby.</span>
              </Notice>
            )}
          </div>
        </Panel>
      </div>
    </ScreenShell>
  );
}

function LeaderboardRow({ entry, isMe }: { entry: LeaderboardEntry; isMe: boolean }) {
  return (
    <li
      data-testid={`leaderboard-${entry.nickname}`}
      className={[
        'flex items-center gap-3 rounded-xl border px-3 py-2',
        isMe ? 'border-play-energy/60 bg-play-energy/12' : 'border-white/10 bg-white/5',
      ].join(' ')}
    >
      <span className="w-6 text-center font-display text-sm font-bold text-play-soft/60">{entry.rank}</span>
      <CubeAvatar avatar={getAvatar(entry.avatarId)} size="sm" />
      <span className="min-w-0 flex-1 truncate font-display text-sm font-semibold text-play-soft">
        {entry.nickname}
        {isMe ? ' (You)' : ''}
      </span>
      <span className="font-display text-base font-bold text-play-soft tabular-nums">{entry.score}</span>
    </li>
  );
}

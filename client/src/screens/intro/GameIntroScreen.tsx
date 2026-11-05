import { TOTAL_ROUNDS } from '@playverse/shared';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { ColorSwatch } from '../../ui/ColorSwatch';
import { IconCheck } from '../../ui/icons';
import { Notice } from '../../ui/Notice';
import { Panel } from '../../ui/Panel';
import { ScreenHeader } from '../../ui/ScreenHeader';
import { ScreenShell } from '../ScreenShell';
import { useNavigation } from '../../nav/navigation';
import { useRoom } from '../../state/room';
import { useGame, secondsLeft } from '../../state/game';

/**
 * Screen 6 — Game Introduction.
 *
 * Everything shown is the server's `game:intro` payload: round number, copy,
 * scoring for this room's mode, how many players are ready and when the round
 * will start regardless. "I'm Ready" is an intent (`round:ready`); the server
 * opens the round when everyone is ready or the intro clock runs out.
 */
export function GameIntroScreen() {
  const { navigate } = useNavigation();
  const { room } = useRoom();
  const { intro, readied, markReady, error, clearError, now } = useGame();

  if (!room || !intro) {
    return (
      <ScreenShell scrim="center">
        <ScreenHeader
          index={6}
          title="Game Introduction"
          subtitle="Learn the rules before each round"
          onBack={() => navigate('/lobby')}
          backLabel="Back to Lobby"
        />
        <div className="flex flex-1 items-start justify-center">
          <Panel className="w-full max-w-xl">
            <div className="flex flex-col gap-4">
              <Notice tone="info" data-testid="intro-waiting">
                {room ? (
                  <span>The next round is being prepared…</span>
                ) : (
                  <span>
                    <strong className="font-display">You&apos;re not in a match.</strong> Join a
                    room from the lobby to see the round rules.
                  </span>
                )}
              </Notice>
              <Button fullWidth onClick={() => navigate('/lobby')}>
                Back to Lobby
              </Button>
            </div>
          </Panel>
        </div>
      </ScreenShell>
    );
  }

  const preview = intro.preview?.kind === 'color-swatch' ? intro.preview : null;
  const startsIn = secondsLeft(intro.startsAt - now);

  return (
    <ScreenShell scrim="center">
      <ScreenHeader
        index={6}
        title="Game Introduction"
        subtitle="Learn the rules before each round"
        badge={
          <Badge tone="portal">
            Round {intro.roundIndex} of {intro.totalRounds || TOTAL_ROUNDS}
          </Badge>
        }
        onBack={() => navigate('/lobby')}
        backLabel="Back to Lobby"
      />

      <div className="flex flex-1 items-start justify-center">
        <Panel tone="light" className="w-full max-w-2xl">
          <div className="flex flex-col gap-5 text-play-cosmic">
            <div className="text-center">
              <h2 className="text-3xl text-play-cosmic sm:text-4xl">{intro.title}</h2>
              <p className="mx-auto mt-2 max-w-md font-semibold text-play-ocean/75">
                {intro.description}
              </p>
            </div>

            {preview ? (
              <div className="flex items-center justify-center gap-4 rounded-3xl bg-play-ocean/8 px-4 py-5">
                <ColorSwatch
                  color={preview.color}
                  label={preview.label}
                  symbol={preview.symbol}
                  size="xl"
                />
                <div className="text-left">
                  <p className="font-display text-[11px] font-bold uppercase tracking-[0.16em] text-play-ocean/60">
                    This round&apos;s target
                  </p>
                  <p className="font-display text-2xl font-bold text-play-cosmic">
                    {preview.label} {preview.symbol}
                  </p>
                  <p className="text-xs font-semibold text-play-ocean/70">
                    Match the name and the shape — colour is never the only clue.
                  </p>
                </div>
              </div>
            ) : null}

            <div className="grid grid-cols-3 gap-2.5" aria-label="Scoring rules">
              <ScoreTile label="Correct" points={`+${intro.scoring.correct}`} tone="forest" />
              <ScoreTile label="Fast Answer" points={`+${intro.scoring.fastAnswer}`} tone="energy" />
              <ScoreTile
                label="Incorrect"
                points={intro.scoring.incorrect === 0 ? '0' : `−${intro.scoring.incorrect}`}
                tone="coral"
              />
            </div>

            <div className="flex flex-col gap-3">
              <Button
                size="lg"
                fullWidth
                aria-pressed={readied}
                disabled={readied}
                variant={readied ? 'success' : 'primary'}
                icon={<IconCheck className="h-5 w-5" />}
                onClick={() => void markReady()}
              >
                {readied ? "You're Ready!" : "I'm Ready"}
              </Button>

              <Notice tone={readied ? 'success' : 'info'} data-testid="intro-status">
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <strong className="font-display">
                      {intro.readyCount} of {intro.playerCount}
                    </strong>{' '}
                    {intro.playerCount === 1 ? 'player is' : 'players are'} ready.
                    {readied
                      ? ' Waiting for the others — the round starts on its own.'
                      : ' The round opens as soon as everyone is ready or the clock runs out.'}
                  </span>
                  <span className="font-display text-sm font-bold text-play-energy" role="timer">
                    Starts in {startsIn}s
                  </span>
                </span>
              </Notice>

              {error ? (
                <Notice tone="warning" role="alert" data-testid="intro-error">
                  <span className="flex items-center justify-between gap-3">
                    <span>{error.message}</span>
                    <Button variant="ghost" size="sm" onClick={clearError}>
                      Dismiss
                    </Button>
                  </span>
                </Notice>
              ) : null}
            </div>
          </div>
        </Panel>
      </div>
    </ScreenShell>
  );
}

function ScoreTile({ label, points, tone }: { label: string; points: string; tone: 'forest' | 'energy' | 'coral' }) {
  const tones = {
    forest: 'bg-play-forest/15 text-play-forest',
    energy: 'bg-play-energy/25 text-[#8A5B00]',
    coral: 'bg-play-coral/15 text-[#B5342F]',
  } as const;

  return (
    <div
      className={`flex flex-col items-center gap-0.5 rounded-2xl border border-play-ocean/10 px-2 py-3 text-center ${tones[tone]}`}
    >
      <span className="font-display text-2xl font-bold">{points}</span>
      <span className="text-[11px] font-bold uppercase tracking-wider opacity-90">{label}</span>
    </div>
  );
}

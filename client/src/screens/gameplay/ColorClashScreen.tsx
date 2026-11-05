import { motion } from 'framer-motion';
import { TOTAL_ROUNDS, getAvatar } from '@playverse/shared';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { ColorSwatch } from '../../ui/ColorSwatch';
import { CubeAvatar } from '../../ui/CubeAvatar';
import { IconCheck } from '../../ui/icons';
import { Notice } from '../../ui/Notice';
import { Panel } from '../../ui/Panel';
import { ScreenHeader } from '../../ui/ScreenHeader';
import { ScreenShell } from '../ScreenShell';
import { useRoom } from '../../state/room';
import { useGame, useGameViewModel, secondsLeft } from '../../state/game';
import { MemoryMixScreen } from './MemoryMixScreen';

/**
 * Screen 7 — Live Gameplay.
 * Routes to the correct game based on the server question.
 */
export function ColorClashScreen() {
  const { room, meId } = useRoom();
  const game = useGame();
  const vm = useGameViewModel(game);
  const { question, reveal, myAnswer, submitting, msLeft, answeredPlayerIds, error, clearError, submitAnswer } = vm;

  if (question?.gameId === 'memory-mix') {
    return <MemoryMixScreen />;
  }

  if (!room || !question) {
    return (
      <ScreenShell scrim="center">
        <ScreenHeader index={7} title="Live Gameplay" subtitle="Play together in real time" />
        <div className="flex flex-1 items-start justify-center">
          <Panel className="w-full max-w-xl">
            <Notice tone="info" data-testid="game-waiting">
              {room ? 'Waiting for the round to start…' : 'You are not in a match right now.'}
            </Notice>
          </Panel>
        </div>
      </ScreenShell>
    );
  }

  const stimulus = question.stimulus.kind === 'color-swatch' ? question.stimulus : null;
  const me = room.players.find((player) => player.id === meId) ?? null;
  const total = Math.max(1, question.endsAt - question.startedAt);
  const remainingPct = Math.max(0, Math.min(100, Math.round((msLeft / total) * 100)));
  const seconds = secondsLeft(msLeft);
  const urgent = msLeft <= 3000;
  const lockedChoice = myAnswer
    ? question.choices.find((choice) => choice.id === myAnswer.choiceId) ?? null
    : null;
  // Our own accepted answer counts immediately, even before the
  // `round:answers` broadcast lands.
  const answeredIds = new Set(answeredPlayerIds);
  if (myAnswer && meId) answeredIds.add(meId);
  const answeredPlayers = room.players.filter((player) => answeredIds.has(player.id));
  const connectedCount = room.players.filter((player) => player.connected).length;
  const waitingOn = Math.max(0, connectedCount - answeredPlayers.length);

  return (
    <ScreenShell scrim="center">
      <ScreenHeader
        index={7}
        title="Color Clash"
        subtitle={`Round ${question.roundIndex} of ${TOTAL_ROUNDS}`}
        badge={<Badge tone="energy">Round {question.roundIndex}</Badge>}
      />

      <div className="flex flex-1 items-start justify-center">
        <Panel className="w-full max-w-3xl">
          <div className="flex flex-col gap-5">
            {/* Target + clock */}
            <div className="flex flex-col items-center gap-4 rounded-2xl border border-white/12 bg-play-cosmic/45 p-4 sm:flex-row sm:justify-between sm:p-5">
              <div className="flex items-center gap-4">
                {stimulus ? (
                  <ColorSwatch
                    color={stimulus.color}
                    label={stimulus.label}
                    symbol={stimulus.symbol}
                    size="xl"
                    className="motion-safe:animate-[pv-pop_320ms_ease-out]"
                  />
                ) : null}
                <div>
                  <p className="font-display text-[11px] font-bold uppercase tracking-[0.16em] text-play-soft/60">
                    Match this colour
                  </p>
                  <p className="font-display text-2xl font-bold text-play-soft" data-testid="clash-target-label">
                    {stimulus ? `${stimulus.label} ${stimulus.symbol}` : question.prompt}
                  </p>
                  <p className="text-xs font-semibold text-play-soft/65" data-testid="clash-answered">
                    {answeredPlayers.length} of {connectedCount} answered
                  </p>
                </div>
              </div>

              <div className="w-full sm:w-44">
                <div className="flex items-baseline justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-widest text-play-soft/55">
                    Time
                  </span>
                  <span
                    className={`font-display text-2xl font-bold tabular-nums ${urgent ? 'text-play-coral' : 'text-play-energy'}`}
                    role="timer"
                    aria-label={`${seconds} seconds left`}
                    data-testid="clash-timer"
                  >
                    {seconds}s
                  </span>
                </div>
                <div
                  role="progressbar"
                  aria-label="Round time remaining"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={remainingPct}
                  className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-white/12"
                >
                  <div
                    className={`h-full rounded-full transition-[width] duration-100 ease-linear ${urgent ? 'bg-play-coral' : 'bg-play-energy'}`}
                    style={{ width: `${remainingPct}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Tile grid */}
            <ul
              className="grid grid-cols-2 gap-3 sm:grid-cols-3"
              aria-label="Answer tiles"
              data-testid="clash-tiles"
            >
              {question.choices.map((choice, index) => {
                const isMine = myAnswer?.choiceId === choice.id;
                const dimmed = Boolean(myAnswer) && !isMine;
                return (
                  <li key={choice.id}>
                    <motion.button
                      type="button"
                      initial={{ opacity: 0, scale: 0.94 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.04 * index, duration: 0.22, ease: 'easeOut' }}
                      disabled={Boolean(myAnswer) || submitting || Boolean(reveal)}
                      aria-pressed={isMine}
                      aria-label={`Answer ${choice.label} ${choice.symbol ?? ''}`.trim()}
                      onClick={() => void submitAnswer(choice.id)}
                      className={[
                        'group flex w-full flex-col items-center gap-2 rounded-2xl border-2 px-3 py-4 text-center',
                        'transition-[transform,background-color,border-color] duration-150 active:translate-y-0.5',
                        'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-play-energy/60',
                        isMine
                          ? 'border-play-energy bg-play-energy/20'
                          : 'border-white/15 bg-white/8 hover:border-white/35 hover:bg-white/14',
                        dimmed ? 'opacity-45' : '',
                        'disabled:pointer-events-none',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      style={{ minHeight: 112 }}
                    >
                      <ColorSwatch
                        color={choice.color ?? '#8FA3C8'}
                        label={choice.label}
                        symbol={choice.symbol ?? '•'}
                        size="lg"
                        className="transition-transform duration-150 group-hover:scale-105"
                      />
                      <span className="font-display text-base font-bold text-play-soft">{choice.label}</span>
                      {isMine ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-play-energy">
                          <IconCheck className="h-3.5 w-3.5" /> Locked in
                        </span>
                      ) : null}
                    </motion.button>
                  </li>
                );
              })}
            </ul>

            {/* Status strip */}
            <div className="flex flex-col gap-3">
              {myAnswer ? (
                <Notice tone="success" data-testid="clash-locked">
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      <strong className="font-display">
                        Locked in{lockedChoice ? `: ${lockedChoice.label} ${lockedChoice.symbol ?? ''}` : ''}.
                      </strong>{' '}
                      {waitingOn > 0
                        ? `Waiting for ${waitingOn} more ${waitingOn === 1 ? 'player' : 'players'} or the clock.`
                        : 'Everyone has answered.'}
                    </span>
                  </span>
                </Notice>
              ) : (
                <Notice tone="info" data-testid="clash-hint">
                  <span>Tap the tile that matches the target. Speed adds bonus points.</span>
                </Notice>
              )}

              {error ? (
                <Notice tone="warning" role="alert" data-testid="clash-error">
                  <span className="flex items-center justify-between gap-3">
                    <span>{error.message}</span>
                    <Button variant="ghost" size="sm" onClick={clearError}>
                      Dismiss
                    </Button>
                  </span>
                </Notice>
              ) : null}

              <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/12 bg-white/6 px-4 py-3">
                <span className="text-xs font-bold uppercase tracking-widest text-play-soft/60">
                  Your score
                </span>
                <span
                  className="font-display text-2xl font-bold text-play-energy tabular-nums"
                  data-testid="clash-score"
                >
                  {me?.score ?? 0}
                </span>
              </div>

              <ul className="flex flex-wrap items-center gap-3" aria-label="Answer status">
                {room.players.map((player) => {
                  const answered = answeredIds.has(player.id);
                  return (
                    <li
                      key={player.id}
                      className={`flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-bold ${
                        answered
                          ? 'border-play-forest/60 bg-play-forest/18 text-play-soft'
                          : 'border-white/15 bg-white/6 text-play-soft/60'
                      }`}
                      data-testid={`answer-status-${player.nickname}`}
                    >
                      <CubeAvatar avatar={getAvatar(player.avatarId)} size="sm" className="h-5 w-5" />
                      {player.nickname}
                      {answered ? ' ✓' : ' …'}
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </Panel>
      </div>
    </ScreenShell>
  );
}

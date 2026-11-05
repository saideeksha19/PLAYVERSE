import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { TOTAL_ROUNDS, getAvatar } from '@playverse/shared';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { CubeAvatar } from '../../ui/CubeAvatar';
import { Notice } from '../../ui/Notice';
import { Panel } from '../../ui/Panel';
import { ScreenHeader } from '../../ui/ScreenHeader';
import { ScreenShell } from '../ScreenShell';
import { useRoom } from '../../state/room';
import { useGame, useGameViewModel, secondsLeft } from '../../state/game';
import { MEMORY_SYMBOLS } from './memoryItems';

const SYMBOLS: Record<string, { label: string; symbol: string }> = Object.fromEntries(
  MEMORY_SYMBOLS.map((entry) => [entry.id, entry]),
);

export function MemoryMixScreen() {
  const { room } = useRoom();
  const game = useGame();
  const vm = useGameViewModel(game);
  const meId = game.meId;
  const { question, submitting, msLeft, answeredPlayerIds, error, submitAnswer, clearError, now } = vm;
  const [input, setInput] = useState<string[]>([]);

  // A new round (or a reconnect that re-sends the question) starts empty.
  useEffect(() => {
    setInput([]);
  }, [question?.roundIndex]);

  if (!room || !question || question.gameId !== 'memory-mix') {
    return (
      <ScreenShell scrim="center">
        <ScreenHeader index={7} title="Memory Mix" subtitle="Play together in real time" />
        <div className="flex flex-1 items-start justify-center">
          <Panel className="w-full max-w-xl">
            <Notice tone="info" data-testid="memory-waiting">
              {room ? 'Waiting for the round to start…' : 'You are not in a match right now.'}
            </Notice>
          </Panel>
        </div>
      </ScreenShell>
    );
  }

  const stimulus = question.stimulus.kind === 'memory-sequence' ? question.stimulus : null;
  const me = room.players.find((player) => player.id === meId) ?? null;
  const total = Math.max(1, question.endsAt - question.startedAt);
  const remainingPct = Math.max(0, Math.min(100, Math.round((msLeft / total) * 100)));
  const seconds = secondsLeft(msLeft);
  const urgent = msLeft <= 3000;

  const memoriseUntil = stimulus?.memoriseUntil ?? question.startedAt;
  const isMemorising = now < memoriseUntil && !vm.myAnswer;
  const showSequence = isMemorising && stimulus?.sequence;

  const pool = stimulus?.pool ?? ['star', 'heart', 'diamond', 'circle', 'triangle', 'square'];

  const answeredIds = new Set(answeredPlayerIds);
  if (vm.myAnswer && meId) answeredIds.add(meId);
  const answeredPlayers = room.players.filter((player) => answeredIds.has(player.id));
  const connectedCount = room.players.filter((player) => player.connected).length;
  const waitingOn = Math.max(0, connectedCount - answeredPlayers.length);

  const addToSequence = (item: string) => {
    if (vm.myAnswer || submitting || isMemorising) return;
    setInput((prev) => [...prev, item].slice(0, stimulus?.length ?? 6));
  };

  const clearInput = () => {
    if (vm.myAnswer || submitting) return;
    setInput([]);
  };

  const submit = () => {
    if (vm.myAnswer || submitting || input.length === 0) return;
    void submitAnswer(input.join(','));
  };

  return (
    <ScreenShell scrim="center">
      <ScreenHeader
        index={7}
        title="Memory Mix"
        subtitle={`Round ${question.roundIndex} of ${TOTAL_ROUNDS}`}
        badge={<Badge tone="energy">Round {question.roundIndex}</Badge>}
      />

      <div className="flex flex-1 items-start justify-center">
        <Panel className="w-full max-w-3xl">
          <div className="flex flex-col gap-5">
            <div className="flex flex-col items-center gap-4 rounded-2xl border border-white/12 bg-play-cosmic/45 p-4 sm:flex-row sm:justify-between sm:p-5">
              <div className="flex items-center gap-4">
                <div>
                  <p className="font-display text-[11px] font-bold uppercase tracking-[0.16em] text-play-soft/60">
                    {isMemorising ? 'Memorise the sequence' : 'Repeat the sequence'}
                  </p>
                  <p className="font-display text-2xl font-bold text-play-soft" data-testid="memory-prompt">
                    {isMemorising ? 'Watch closely!' : 'Tap in order'}
                  </p>
                  <p className="text-xs font-semibold text-play-soft/65" data-testid="memory-answered">
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
                    data-testid="memory-timer"
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

            {isMemorising && showSequence ? (
              <div className="flex flex-wrap items-center justify-center gap-3 rounded-2xl border border-white/12 bg-white/6 p-6" data-testid="memory-sequence">
                {stimulus.sequence?.map((item, idx) => (
                  <motion.div
                    key={`${item}-${idx}`}
                    data-testid="memory-sequence-item"
                    data-item={item}
                    aria-label={SYMBOLS[item]?.label ?? item}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: idx * 0.15 }}
                    className="flex h-16 w-16 items-center justify-center rounded-xl bg-play-azure text-2xl text-white shadow-lg"
                  >
                    {SYMBOLS[item]?.symbol ?? item}
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4 rounded-2xl border border-white/12 bg-white/6 p-6">
                <p className="font-display text-lg font-bold text-play-soft">Your Sequence</p>
                <div className="flex min-h-[80px] flex-wrap items-center justify-center gap-2" data-testid="memory-input">
                  {input.length === 0 ? (
                    <span className="text-sm text-play-soft/60">Tap symbols below in order</span>
                  ) : (
                    input.map((item, idx) => (
                      <div
                        key={`${item}-${idx}`}
                        className="flex h-12 w-12 items-center justify-center rounded-lg bg-play-energy text-xl text-white"
                      >
                        {SYMBOLS[item]?.symbol ?? item}
                      </div>
                    ))
                  )}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={clearInput} disabled={input.length === 0 || Boolean(vm.myAnswer)}>
                    Clear
                  </Button>
                  <Button size="sm" onClick={submit} disabled={input.length === 0 || Boolean(vm.myAnswer) || submitting}>
                    Submit
                  </Button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-5 gap-2" aria-label="Symbol pool" data-testid="memory-pool">
              {pool.map((item) => (
                <button
                  key={item}
                  type="button"
                  data-item={item}
                  disabled={isMemorising || Boolean(vm.myAnswer) || submitting}
                  onClick={() => addToSequence(item)}
                  className="flex h-14 items-center justify-center rounded-xl border border-white/15 bg-white/8 text-2xl transition hover:bg-white/14 disabled:opacity-40"
                  aria-label={`Add ${SYMBOLS[item]?.label ?? item}`}
                >
                  {SYMBOLS[item]?.symbol ?? item}
                </button>
              ))}
            </div>              <div className="flex flex-col gap-3">
              {vm.myAnswer ? (
                <Notice tone="success" data-testid="memory-locked">
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      <strong className="font-display">Sequence locked in.</strong>{' '}
                      {waitingOn > 0
                        ? `Waiting for ${waitingOn} more ${waitingOn === 1 ? 'player' : 'players'} or the clock.`
                        : 'Everyone has answered.'}
                    </span>
                  </span>
                </Notice>
              ) : null}

              {error ? (
                <Notice tone="warning" role="alert" data-testid="memory-error">
                  <span className="flex items-center justify-between gap-3">
                    <span>{error.message}</span>
                    <Button variant="ghost" size="sm" onClick={clearError}>
                      Dismiss
                    </Button>
                  </span>
                </Notice>
              ) : null}

              <div className="text-xs font-semibold text-play-soft/65" data-testid="mine">
                Your answer: {vm.myAnswer ? vm.myAnswer.choiceId : 'none'}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/12 bg-white/6 px-4 py-3">
                <span className="text-xs font-bold uppercase tracking-widest text-play-soft/60">Your score</span>
                <span className="font-display text-2xl font-bold text-play-energy tabular-nums" data-testid="memory-score">
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
                      data-testid={`memory-status-${player.nickname}`}
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

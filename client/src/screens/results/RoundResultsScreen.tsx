import { motion } from 'framer-motion';
import { TOTAL_ROUNDS, getAvatar, type RoundPlayerResult } from '@playverse/shared';
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
import { useGame, secondsLeft } from '../../state/game';
import { memorySequenceLabel, memorySymbol } from '../gameplay/memoryItems';

/**
 * Screen 8 — Round Results.
 *
 * A pure rendering of `round:reveal`: the correct tile (the first moment the
 * answer is public), every player's choice and the score deltas the server
 * applied. The next round — or the final standings after round five — starts
 * on the server's clock; the host may only skip the pause.
 */
export function RoundResultsScreen() {
  const { room, meId } = useRoom();
  const { question, reveal, now, continueRound } = useGame();

  if (!room || !reveal) {
    return (
      <ScreenShell scrim="center">
        <ScreenHeader index={8} title="Round Results" subtitle="See answers and scores" />
        <div className="flex flex-1 items-start justify-center">
          <Panel className="w-full max-w-xl">
            <Notice tone="info" data-testid="results-waiting">
              Waiting for the round to finish…
            </Notice>
          </Panel>
        </div>
      </ScreenShell>
    );
  }

  const me = room.players.find((player) => player.id === meId) ?? null;
  const isHost = me?.isHost ?? false;
  const isFinal = reveal.roundIndex >= TOTAL_ROUNDS;
  const isMemory = reveal.gameId === 'memory-mix';
  const correct = question?.choices.find((choice) => choice.id === reveal.correctChoiceId) ?? null;
  const correctSequence = isMemory ? reveal.correctChoiceId.split(',').filter(Boolean) : [];
  const standings = [...reveal.results].sort((left, right) => right.scoreAfter - left.scoreAfter);
  const mine = reveal.results.find((result) => result.playerId === meId) ?? null;
  const seconds = secondsLeft(reveal.nextAt - now);

  return (
    <ScreenShell scrim="center">
      <ScreenHeader
        index={8}
        title="Round Results"
        subtitle={`Round ${reveal.roundIndex} of ${TOTAL_ROUNDS}`}
        badge={<Badge tone="portal">{isFinal ? 'Last round' : `Next in ${seconds}s`}</Badge>}
      />

      <div className="flex flex-1 items-start justify-center" data-testid="round-results">
        <Panel className="w-full max-w-2xl">
          <div className="flex flex-col gap-4">
            {/* The answer, finally public */}
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-white/12 bg-play-cosmic/45 p-4 text-center">
              <p className="font-display text-[11px] font-bold uppercase tracking-[0.16em] text-play-soft/60">
                Correct answer
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3" data-testid="correct-answer">
                {isMemory ? (
                  <>
                    {correctSequence.map((id, index) => (
                      <span
                        key={`${id}-${index}`}
                        data-testid="correct-sequence-item"
                        aria-label={memorySymbol(id).label}
                        className="flex h-11 w-11 items-center justify-center rounded-xl bg-play-azure text-xl text-white"
                      >
                        {memorySymbol(id).symbol}
                      </span>
                    ))}
                    <span className="font-display text-lg font-bold text-play-soft">
                      {memorySequenceLabel(reveal.correctChoiceId)}
                    </span>
                  </>
                ) : correct ? (
                  <>
                    <ColorSwatch
                      color={correct.color ?? '#8FA3C8'}
                      label={correct.label}
                      symbol={correct.symbol ?? '•'}
                      size="lg"
                    />
                    <span className="font-display text-2xl font-bold text-play-soft">
                      {correct.label} {correct.symbol}
                    </span>
                  </>
                ) : (
                  <span className="font-display text-2xl font-bold text-play-soft">
                    {reveal.correctChoiceId}
                  </span>
                )}
              </div>
            </div>

            {mine ? <MyResult result={mine} /> : null}

            {/* Everyone's round */}
            <ul className="flex flex-col gap-2" aria-label="Round results by player">
              {standings.map((result, index) => (
                <motion.li
                  key={result.playerId}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.05 * index, duration: 0.22 }}
                  data-testid={`result-${result.nickname}`}
                  className={[
                    'flex items-center gap-3 rounded-2xl border px-3 py-2.5',
                    result.playerId === meId
                      ? 'border-play-energy/60 bg-play-energy/12'
                      : 'border-white/12 bg-white/6',
                  ].join(' ')}
                >
                  <span className="w-5 text-center font-display text-sm font-bold text-play-soft/55">
                    {index + 1}
                  </span>
                  <CubeAvatar avatar={getAvatar(result.avatarId)} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-sm font-bold text-play-soft">
                      {result.nickname}
                      {result.playerId === meId ? ' (You)' : ''}
                      {!result.connected ? ' · offline' : ''}
                    </p>
                    <p className="text-[11px] font-semibold text-play-soft/60">
                      {explain(result, question, isMemory)}
                    </p>
                  </div>
                  <span
                    className={[
                      'font-display text-sm font-bold tabular-nums',
                      result.scoreDelta > 0
                        ? 'text-play-forest'
                        : result.scoreDelta < 0
                          ? 'text-play-coral'
                          : 'text-play-soft/50',
                    ].join(' ')}
                  >
                    {result.scoreDelta > 0 ? `+${result.scoreDelta}` : result.scoreDelta === 0 ? '±0' : result.scoreDelta}
                  </span>
                  <span className="w-12 text-right font-display text-base font-bold text-play-soft tabular-nums">
                    {result.scoreAfter}
                  </span>
                </motion.li>
              ))}
            </ul>

            <Notice tone="info" data-testid="results-countdown">
              <span className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {isFinal
                    ? 'That was the last round — final standings are coming up.'
                    : `Round ${reveal.roundIndex + 1} starts on the server's clock.`}
                </span>
                <span className="font-display text-sm font-bold text-play-energy" role="timer">
                  {isFinal ? 'Results' : 'Next'} in {seconds}s
                </span>
              </span>
            </Notice>

            {isHost ? (
              <Button
                variant="secondary"
                fullWidth
                onClick={() => void continueRound()}
                data-testid="next-round"
              >
                {isFinal ? 'Skip to final results' : 'Skip ahead'}
              </Button>
            ) : (
              <p className="text-center text-xs font-semibold text-play-soft/60">
                The host can skip the pause — otherwise it moves on by itself.
              </p>
            )}
          </div>
        </Panel>
      </div>
    </ScreenShell>
  );
}

function MyResult({ result }: { result: RoundPlayerResult }) {
  if (result.choiceId === null) {
    return (
      <Notice tone="warning" data-testid="my-result">
        <span>
          <strong className="font-display">You didn&apos;t answer in time.</strong> No points lost —
          but no points gained either.
        </span>
      </Notice>
    );
  }
  if (result.correct) {
    return (
      <Notice tone="success" data-testid="my-result">
        <span className="flex items-center gap-2">
          <IconCheck className="h-4 w-4" />
          <span>
            <strong className="font-display">
              Correct — +{result.points}
              {result.timeBonus > 0 ? ` and +${result.timeBonus} speed` : ''}.
            </strong>{' '}
            {result.elapsedMs !== null ? `Answered in ${(result.elapsedMs / 1000).toFixed(1)}s.` : ''}
          </span>
        </span>
      </Notice>
    );
  }
  return (
    <Notice tone="warning" data-testid="my-result">
      <span>
        <strong className="font-display">Not this time.</strong>{' '}
        {result.penalty < 0 ? `${result.penalty} points.` : 'No penalty in family-friendly mode.'}
      </span>
    </Notice>
  );
}

/** Human-readable account of one player's round. */
function explain(
  result: RoundPlayerResult,
  question: ReturnType<typeof useGame>['question'],
  isMemory: boolean,
): string {
  if (!result.connected && result.choiceId === null) return 'Disconnected — no answer';
  if (result.choiceId === null) return 'No answer (time ran out)';
  if (isMemory) {
    const picked = memorySequenceLabel(result.choiceId);
    if (result.correct) {
      return `Repeated ${picked} · +${result.points}${result.timeBonus > 0 ? ` +${result.timeBonus} speed` : ''}`;
    }
    return `Repeated ${picked} · not quite`;
  }
  const choice = question?.choices.find((entry) => entry.id === result.choiceId) ?? null;
  const picked = choice ? `${choice.label} ${choice.symbol ?? ''}`.trim() : result.choiceId;
  if (result.correct) {
    return `Picked ${picked} · +${result.points}${result.timeBonus > 0 ? ` +${result.timeBonus} speed` : ''}`;
  }
  return `Picked ${picked} · wrong${result.penalty < 0 ? ` (${result.penalty})` : ''}`;
}

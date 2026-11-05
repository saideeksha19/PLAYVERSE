import {
  COLOR_CLASH_RULES,
  MAX_PLAYERS,
  MEMORY_MIX_RULES,
  MIN_PLAYERS,
  TOTAL_ROUNDS,
} from '@playverse/shared';
import { Badge } from '../../ui/Badge';
import { Panel } from '../../ui/Panel';
import { ScreenHeader } from '../../ui/ScreenHeader';
import { ScreenShell } from '../ScreenShell';
import { useNavigation } from '../../nav/navigation';

const FLOW = [
  'Create a room or open an invite link, then choose a nickname and avatar.',
  'Everyone marks ready; the host starts the five-round match.',
  'Every round opens with a short rules card and a ready-up window.',
  'Answers lock immediately. The server closes the round when everyone has answered or time runs out.',
  'Round results show the answer plus score changes; the next round starts on the server clock.',
] as const;

/** Screen 10 — Player Guide. Static, safe to open before joining a room. */
export function GuideScreen() {
  const { navigate } = useNavigation();

  return (
    <ScreenShell scrim="center">
      <ScreenHeader
        index={10}
        title="Player Guide"
        subtitle="Learn the games and tips"
        onBack={() => navigate('/home')}
        backLabel="Back to Home"
        badge={<Badge tone="energy">{MIN_PLAYERS}–{MAX_PLAYERS} players</Badge>}
      />

      <div className="flex flex-1 items-start justify-center">
        <Panel tone="light" className="w-full max-w-3xl">
          <div className="flex flex-col gap-6 text-play-cosmic">
            <section aria-labelledby="guide-flow">
              <h2 id="guide-flow" className="text-2xl text-play-cosmic">
                A match in {TOTAL_ROUNDS} rounds
              </h2>
              <ol className="mt-3 flex flex-col gap-2">
                {FLOW.map((step, index) => (
                  <li key={step} className="flex gap-3 text-sm font-semibold text-play-ocean/85">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-play-ocean/10 font-display text-xs font-bold">
                      {index + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </section>

            <div className="grid gap-4 sm:grid-cols-2">
              <section
                aria-labelledby="guide-color"
                className="rounded-2xl border border-play-ocean/10 bg-play-ocean/5 p-4"
              >
                <h2 id="guide-color" className="text-xl text-play-cosmic">
                  Color Clash
                </h2>
                <p className="mt-1.5 text-sm font-semibold text-play-ocean/80">
                  Tap the tile whose name and shape match the target. Every tile has a
                  label and a glyph, so colour is never the only clue.
                </p>
                <p className="mt-2 text-xs font-bold uppercase tracking-wider text-play-ocean/60">
                  +{COLOR_CLASH_RULES.correctPoints} correct · up to +
                  {COLOR_CLASH_RULES.maxSpeedBonus} speed
                </p>
              </section>

              <section
                aria-labelledby="guide-memory"
                className="rounded-2xl border border-play-ocean/10 bg-play-ocean/5 p-4"
              >
                <h2 id="guide-memory" className="text-xl text-play-cosmic">
                  Memory Mix
                </h2>
                <p className="mt-1.5 text-sm font-semibold text-play-ocean/80">
                  Watch the sequence during the memorise window. When it hides, add the
                  symbols back in the same order, then submit. Partial sequences still
                  score by position.
                </p>
                <p className="mt-2 text-xs font-bold uppercase tracking-wider text-play-ocean/60">
                  +{MEMORY_MIX_RULES.correctPoints} full sequence · up to +
                  {MEMORY_MIX_RULES.maxSpeedBonus} speed
                </p>
              </section>
            </div>

            <section aria-labelledby="guide-tips">
              <h2 id="guide-tips" className="text-2xl text-play-cosmic">
                Tips
              </h2>
              <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm font-semibold text-play-ocean/85">
                <li>Answer early for a larger speed bonus; wrong answers wait for the reveal.</li>
                <li>If your screen drops, reopen the link in the same tab to reclaim your slot.</li>
                <li>The Connection screen shows transport state and can retry a rejoin.</li>
                <li>Use Settings to reduce motion or raise panel contrast.</li>
              </ul>
            </section>
          </div>
        </Panel>
      </div>
    </ScreenShell>
  );
}

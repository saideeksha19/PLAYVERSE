import { motion } from 'framer-motion';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Panel } from '../ui/Panel';
import { useNavigation } from '../nav/navigation';
import { SCREENS, SCREEN_BY_ID, type ScreenId } from './registry';
import { ScreenShell } from './ScreenShell';

/**
 * Renders routes whose screen is not implemented yet. It states the roadmap
 * phase plainly and offers the full 12-screen index — nothing is faked.
 */
export function ScreenPlaceholder({ id }: { id: ScreenId }) {
  const screen = SCREEN_BY_ID[id];
  const { path, navigate } = useNavigation();

  return (
    <ScreenShell>
      <div className="flex flex-1 items-center justify-center py-8">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className="w-full max-w-2xl"
        >
          <Panel className="text-center">
            <Badge tone="energy">Phase {screen.phase} · Not built yet</Badge>
            <p className="mt-4 font-display text-6xl font-bold text-play-energy" aria-hidden="true">
              {screen.index}
            </p>
            <h1 className="mt-1 text-3xl text-play-soft sm:text-4xl">{screen.title}</h1>
            <p className="mt-1.5 font-semibold text-play-soft/75">{screen.subtitle}</p>
            <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-play-soft/70">
              This route exists in the navigation structure, but the screen itself is
              scheduled for Phase {screen.phase} of the roadmap.
            </p>
            <div className="mt-6 flex justify-center">
              <Button variant="secondary" onClick={() => navigate('/home')}>
                Back to Home
              </Button>
            </div>
          </Panel>

          <Panel className="mt-4">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-play-soft/70">
              All 12 screens
            </h2>
            <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {SCREENS.map((entry) => {
                const isCurrent = entry.path === path;
                return (
                  <li key={entry.id}>
                    <button
                      type="button"
                      onClick={() => navigate(entry.path)}
                      aria-current={isCurrent ? 'page' : undefined}
                      className={[
                        'flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left transition-colors',
                        isCurrent
                          ? 'border-play-energy/70 bg-play-energy/15'
                          : 'border-white/12 bg-white/6 hover:bg-white/12',
                      ].join(' ')}
                    >
                      <span className="font-display text-xs font-bold text-play-energy">
                        {entry.index}
                      </span>
                      <span className="truncate text-xs font-semibold text-play-soft">
                        {entry.title}
                      </span>
                      {entry.status === 'ready' ? (
                        <span
                          className="ml-auto h-2 w-2 shrink-0 rounded-full bg-play-forest"
                          title="Built"
                        />
                      ) : (
                        <span
                          className="ml-auto h-2 w-2 shrink-0 rounded-full bg-white/25"
                          title="Planned"
                        />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </Panel>
        </motion.div>
      </div>
    </ScreenShell>
  );
}

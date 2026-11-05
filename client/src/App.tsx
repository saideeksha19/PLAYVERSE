import type { MouseEvent } from 'react';
import { Suspense, lazy, useEffect } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { NavigationProvider, useNavigation } from './nav/navigation';
import { SetupProvider } from './state/setup';
import { RoomProvider, useRoom } from './state/room';
import { GameProvider } from './state/game';
import { PreferencesProvider, usePreferences } from './state/preferences';
import { getScreenByPath } from './screens/registry';
import { WorldFallback } from './three/WorldFallback';

/**
 * three.js + React Three Fiber stay out of the initial bundle. Until the
 * chunk arrives, the eager CSS-only WorldFallback keeps a designed sky on
 * screen instead of a blank background.
 */
const WorldBackground = lazy(() =>
  import('./three/WorldBackground').then((module) => ({ default: module.WorldBackground })),
);

function PersistentWorld() {
  return (
    <div className="fixed inset-0 -z-10" aria-hidden="true">
      <Suspense fallback={<WorldFallback />}>
        <WorldBackground />
      </Suspense>
    </div>
  );
}


/** Room status → the screen that shows it. Lobby is deliberately absent. */
const MATCH_ROUTE: Record<string, string> = {
  intro: '/intro',
  playing: '/gameplay',
  'round-results': '/round-results',
  'match-results': '/match-results',
};

/**
 * Keeps the visible screen honest: when the server moves the match on, every
 * client follows in the same tick. The lobby is never force-navigated to, so
 * choosing a screen from the lobby still works.
 */
function MatchPhaseSync() {
  const { room } = useRoom();
  const { path, navigate } = useNavigation();

  const status = room?.status ?? null;

  useEffect(() => {
    if (!status) return;
    const target = MATCH_ROUTE[status];
    if (target) {
      if (path !== target) navigate(target);
      return;
    }
    // Back in the lobby: don't strand anyone on a match screen.
    if (status === 'lobby' && ['/gameplay', '/round-results', '/match-results'].includes(path)) {
      navigate('/lobby');
    }
  }, [status, path, navigate]);

  return null;
}

function RoutedScreen() {
  const { path } = useNavigation();
  const screen = getScreenByPath(path);
  const Component = screen.component;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={screen.id}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
      >
        <Component />
      </motion.div>
    </AnimatePresence>
  );
}

function handleSkipToContent(event: MouseEvent<HTMLAnchorElement>) {
  event.preventDefault();
  const main = document.getElementById('main');
  main?.focus();
  main?.scrollIntoView({ block: 'start' });
}

function AppShell() {
  const { reduceMotion } = usePreferences();

  return (
    <NavigationProvider>
      <SetupProvider>
        <RoomProvider>
          <GameProvider>
            <MotionConfig reducedMotion={reduceMotion ? 'always' : 'user'}>
              <div className="relative min-h-dvh">
                {/* One world behind every screen: no WebGL re-init while navigating. */}
                <PersistentWorld />

                <a
                  href="#main"
                  onClick={handleSkipToContent}
                  className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-xl focus:bg-play-energy focus:px-4 focus:py-2 focus:font-display focus:font-semibold focus:text-play-ocean"
                >
                  Skip to content
                </a>

                <MatchPhaseSync />
                <RoutedScreen />
              </div>
            </MotionConfig>
          </GameProvider>
        </RoomProvider>
      </SetupProvider>
    </NavigationProvider>
  );
}

export default function App() {
  return (
    <PreferencesProvider>
      <AppShell />
    </PreferencesProvider>
  );
}

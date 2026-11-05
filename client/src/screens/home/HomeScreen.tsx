import { motion } from 'framer-motion';
import { Button } from '../../ui/Button';
import { Logo } from '../../ui/Logo';
import {
  IconArrowRight,
  IconBook,
  IconCreate,
  IconGear,
  IconLink,
} from '../../ui/icons';
import { useNavigation } from '../../nav/navigation';
import { useSetup, type FlowIntent } from '../../state/setup';
import { ScreenShell } from '../ScreenShell';
import { FeatureBar } from './FeatureBar';

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * Screen 1 — Home. The reference composition: wordmark top-left, feature
 * pills top-right, CTA stack over the floating-island world on the left.
 */
export function HomeScreen() {
  const { navigate } = useNavigation();
  const { setIntent } = useSetup();

  /** Home always runs through Player Setup first, like the reference flow. */
  const startFlow = (intent: FlowIntent) => {
    setIntent(intent);
    navigate('/setup');
  };

  return (
    <ScreenShell scrim="left">

      <div className="relative flex flex-1 flex-col">
        <h1 className="sr-only">PLAYVERSE — Play Together. Anywhere.</h1>

        <header className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <motion.div
            initial={{ opacity: 0, y: -26, rotate: -2 }}
            animate={{ opacity: 1, y: 0, rotate: 0 }}
            transition={{ duration: 0.7, ease: EASE }}
          >
            <Logo />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.25, ease: EASE }}
            className="md:pt-3"
          >
            <FeatureBar />
          </motion.div>
        </header>

        <div className="flex flex-1 items-center py-8">
          <motion.div
            initial={{ opacity: 0, y: 26 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.15, ease: EASE }}
            className="w-full max-w-md"
          >
            <p className="mb-6 font-display text-lg font-semibold text-play-soft/90 drop-shadow-[0_2px_10px_rgba(4,12,34,0.8)] sm:text-xl">
              A five-round party game for every screen.
            </p>

            <div className="flex flex-col gap-3.5">
              <Button
                size="lg"
                fullWidth
                icon={<IconCreate className="h-5 w-5" />}
                onClick={() => startFlow('create')}
              >
                Create a Room
              </Button>
              <Button
                variant="secondary"
                size="lg"
                fullWidth
                icon={<IconLink className="h-5 w-5" />}
                onClick={() => startFlow('join')}
              >
                Join a Room
              </Button>
              <div className="grid grid-cols-2 gap-3.5">
                <Button
                  variant="ghost"
                  icon={<IconBook className="h-5 w-5" />}
                  onClick={() => navigate('/guide')}
                >
                  How to Play
                </Button>
                <Button
                  variant="ghost"
                  icon={<IconGear className="h-5 w-5" />}
                  onClick={() => navigate('/settings')}
                >
                  Settings
                </Button>
              </div>
            </div>

            <p className="mt-6 flex items-center gap-2 text-sm font-semibold text-play-soft/75">
              <IconArrowRight className="h-4 w-4 text-play-energy" aria-hidden="true" />
              No login · No install · Works on any device
            </p>
          </motion.div>
        </div>
      </div>
    </ScreenShell>
  );
}

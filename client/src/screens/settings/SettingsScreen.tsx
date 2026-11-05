import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { Notice } from '../../ui/Notice';
import { Panel } from '../../ui/Panel';
import { ScreenHeader } from '../../ui/ScreenHeader';
import { ScreenShell } from '../ScreenShell';
import { useNavigation } from '../../nav/navigation';
import { usePreferences } from '../../state/preferences';

interface ToggleProps {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  testId: string;
}

function Toggle({ label, description, checked, onChange, testId }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      data-testid={testId}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 rounded-2xl border border-play-ocean/12 bg-play-ocean/5 px-4 py-3 text-left transition hover:bg-play-ocean/10"
    >
      <span>
        <span className="block font-display text-sm font-bold text-play-cosmic">{label}</span>
        <span className="mt-0.5 block text-xs font-semibold text-play-ocean/70">{description}</span>
      </span>
      <span
        aria-hidden="true"
        className={[
          'relative h-7 w-12 shrink-0 rounded-full transition-colors',
          checked ? 'bg-play-forest' : 'bg-play-ocean/25',
        ].join(' ')}
      >
        <span
          className={[
            'absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-[left]',
            checked ? 'left-6' : 'left-1',
          ].join(' ')}
        />
      </span>
    </button>
  );
}

/** Screen 11 — local display preferences. Nothing here needs an account. */
export function SettingsScreen() {
  const { navigate } = useNavigation();
  const { reduceMotion, highContrast, setPreference, resetPreferences } = usePreferences();

  return (
    <ScreenShell scrim="center">
      <ScreenHeader
        index={11}
        title="Settings"
        subtitle="Adjust your experience"
        onBack={() => navigate('/home')}
        backLabel="Back to Home"
        badge={<Badge tone="light">Saved on this device</Badge>}
      />

      <div className="flex flex-1 items-start justify-center">
        <Panel tone="light" className="w-full max-w-2xl">
          <div className="flex flex-col gap-4 text-play-cosmic">
            <Toggle
              label="Reduce motion"
              description="Turn off interface animations and transitions where possible."
              checked={reduceMotion}
              onChange={(value) => setPreference('reduceMotion', value)}
              testId="setting-reduce-motion"
            />
            <Toggle
              label="High contrast panels"
              description="Stronger borders and darker panel backgrounds for easier reading."
              checked={highContrast}
              onChange={(value) => setPreference('highContrast', value)}
              testId="setting-high-contrast"
            />

            <Notice tone="info" data-testid="settings-saved">
              Preferences are stored in this browser only.
            </Notice>

            <div className="flex flex-col gap-2.5 sm:flex-row">
              <Button variant="secondary" fullWidth onClick={() => navigate('/connection')}>
                Connection &amp; Recovery
              </Button>
              <Button variant="ghost" fullWidth onClick={resetPreferences}>
                Reset preferences
              </Button>
            </div>

            <Button fullWidth onClick={() => navigate('/home')}>
              Back to Home
            </Button>
          </div>
        </Panel>
      </div>
    </ScreenShell>
  );
}

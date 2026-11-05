import { AVATARS, NICKNAME_MAX_LENGTH, NICKNAME_MIN_LENGTH } from '@playverse/shared';
import { Button } from '../../ui/Button';
import { CubeAvatar } from '../../ui/CubeAvatar';
import { Field, inputClasses } from '../../ui/Field';
import { IconArrowRight } from '../../ui/icons';
import { Panel } from '../../ui/Panel';
import { ScreenHeader } from '../../ui/ScreenHeader';
import { ScreenShell } from '../ScreenShell';
import { useNavigation } from '../../nav/navigation';
import { useSetup } from '../../state/setup';

/**
 * Screen 2 — Player Setup. Nickname + preset cube avatars, both local state.
 * Continue routes into whichever flow Home started (create or join).
 */
export function PlayerSetupScreen() {
  const { navigate } = useNavigation();
  const { nickname, setNickname, avatarId, setAvatarId, intent, isComplete } = useSetup();

  const handleContinue = () => {
    if (!isComplete) return;
    navigate(intent === 'join' ? '/join-room' : '/create-room');
  };

  return (
    <ScreenShell scrim="center">
      <ScreenHeader
        index={2}
        title="Player Setup"
        subtitle="Choose your avatar and nickname"
        onBack={() => navigate('/home')}
        backLabel="Back to Home"
      />

      <div className="flex flex-1 items-start justify-center">
        <Panel className="w-full max-w-xl">
          <div className="flex flex-col gap-6">
            <Field
              label="Enter your nickname"
              htmlFor="nickname"
              hint={`Between ${NICKNAME_MIN_LENGTH} and ${NICKNAME_MAX_LENGTH} characters — this is how you appear in the room.`}
            >
              <input
                id="nickname"
                type="text"
                autoComplete="off"
                spellCheck={false}
                maxLength={NICKNAME_MAX_LENGTH}
                value={nickname}
                placeholder="Player1"
                onChange={(event) => setNickname(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') handleContinue();
                }}
                className={inputClasses}
              />
            </Field>

            <fieldset className="flex flex-col gap-3">
              <legend className="font-display text-xs font-semibold uppercase tracking-[0.14em] text-play-soft/75">
                Choose your cube
              </legend>

              <div className="grid grid-cols-4 gap-3 sm:grid-cols-8">
                {AVATARS.map((avatar) => {
                  const selected = avatar.id === avatarId;
                  return (
                    <button
                      key={avatar.id}
                      type="button"
                      aria-pressed={selected}
                      aria-label={`Use the ${avatar.label} cube`}
                      onClick={() => setAvatarId(avatar.id)}
                      className={[
                        'flex items-center justify-center rounded-2xl border p-2 transition-colors',
                        selected
                          ? 'border-play-energy bg-play-energy/15'
                          : 'border-white/12 bg-white/6 hover:bg-white/12',
                      ].join(' ')}
                    >
                      <CubeAvatar avatar={avatar} size="md" selected={selected} />
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <div className="flex flex-col gap-3">
              <Button
                size="lg"
                fullWidth
                disabled={!isComplete}
                icon={<IconArrowRight className="h-5 w-5" />}
                onClick={handleContinue}
              >
                Continue
              </Button>

              {!isComplete ? (
                <p role="status" className="text-center text-xs font-semibold text-play-soft/65">
                  Enter at least {NICKNAME_MIN_LENGTH} characters to continue.
                </p>
              ) : null}
            </div>
          </div>
        </Panel>
      </div>
    </ScreenShell>
  );
}

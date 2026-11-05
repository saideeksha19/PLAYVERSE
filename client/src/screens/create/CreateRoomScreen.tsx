import { useState } from 'react';
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  ROOM_NAME_MAX_LENGTH,
  type GameMode,
  type PlayverseError,
} from '@playverse/shared';
import { Button } from '../../ui/Button';
import { Field, inputClasses } from '../../ui/Field';
import { IconArrowRight } from '../../ui/icons';
import { Notice } from '../../ui/Notice';
import { Panel } from '../../ui/Panel';
import { ScreenHeader } from '../../ui/ScreenHeader';
import { Stepper } from '../../ui/Stepper';
import { ScreenShell } from '../ScreenShell';
import { useNavigation } from '../../nav/navigation';
import { useSetup } from '../../state/setup';
import { useRoom } from '../../state/room';

const MODE_COPY: Record<GameMode, { label: string; note: string }> = {
  classic: { label: 'Classic', note: 'Recommended' },
  'family-friendly': { label: 'Family Friendly', note: 'Easier rounds' },
};

/**
 * Screen 3 — Create Room. Submits to the server, which assigns the real
 * six-character code and opens the lobby; typed errors render inline.
 */
export function CreateRoomScreen() {
  const { navigate } = useNavigation();
  const { nickname, avatarId, draft, updateDraft, isComplete } = useSetup();
  const { createRoom } = useRoom();
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<PlayverseError | null>(null);

  const handleCreate = async () => {
    if (!isComplete || pending) return;
    setPending(true);
    setFailure(null);
    const result = await createRoom({
      nickname,
      avatarId,
      maxPlayers: draft.maxPlayers,
      mode: draft.mode,
      roomName: draft.roomName.trim() || undefined,
    });
    setPending(false);
    if (result.ok) {
      navigate('/lobby');
    } else {
      setFailure(result.error);
    }
  };

  return (
    <ScreenShell scrim="center">
      <ScreenHeader
        index={3}
        title="Create Room"
        subtitle="Set up your match"
        onBack={() => navigate('/setup')}
        backLabel="Back to Player Setup"
      />

      <div className="flex flex-1 items-start justify-center">
        <Panel className="w-full max-w-xl">
          <div className="flex flex-col gap-5">
            {/* Game mode */}
            <Field label="Game Mode">
              <div className="grid grid-cols-2 gap-3" role="group" aria-label="Game Mode">
                {(Object.keys(MODE_COPY) as GameMode[]).map((mode) => {
                  const selected = draft.mode === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => updateDraft({ mode })}
                      className={[
                        'flex flex-col items-center gap-0.5 rounded-xl border px-3 py-3 text-center transition-colors',
                        selected
                          ? 'border-play-portal bg-play-portal/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]'
                          : 'border-white/12 bg-white/6 hover:bg-white/12',
                      ].join(' ')}
                    >
                      <span className="font-display text-base font-semibold text-play-soft">
                        {MODE_COPY[mode].label}
                      </span>
                      <span className="text-[11px] font-semibold text-play-soft/65">
                        {MODE_COPY[mode].note}
                      </span>
                    </button>
                  );
                })}
              </div>
            </Field>

            {/* Max players */}
            <Field
              label="Max Players"
              hint={`Between ${MIN_PLAYERS} and ${MAX_PLAYERS} players can join a room.`}
            >
              <Stepper
                label="Max players"
                value={draft.maxPlayers}
                min={MIN_PLAYERS}
                max={MAX_PLAYERS}
                onChange={(maxPlayers) => updateDraft({ maxPlayers })}
              />
            </Field>

            {/* Room name */}
            <Field label="Room Name (optional)" htmlFor="room-name">
              <input
                id="room-name"
                type="text"
                autoComplete="off"
                maxLength={ROOM_NAME_MAX_LENGTH}
                value={draft.roomName}
                placeholder="Fun Squad"
                onChange={(event) => updateDraft({ roomName: event.target.value })}
                className={inputClasses}
              />
            </Field>

            <Button
              size="lg"
              fullWidth
              disabled={!isComplete || pending}
              icon={<IconArrowRight className="h-5 w-5" />}
              onClick={handleCreate}
            >
              {pending ? 'Creating room…' : 'Create Room'}
            </Button>

            {!isComplete ? (
              <Notice tone="warning">
                Set a nickname in Player Setup first — the room will show your name.
              </Notice>
            ) : null}

            {failure ? (
              <Notice tone="warning" role="alert" data-testid="create-error">
                <span>
                  <strong className="font-display">Could not create the room.</strong>{' '}
                  {failure.message}
                </span>
              </Notice>
            ) : null}
          </div>
        </Panel>
      </div>
    </ScreenShell>
  );
}

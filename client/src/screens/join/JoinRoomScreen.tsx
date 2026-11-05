import { useEffect, useRef, useState } from 'react';
import {
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  type PlayverseError,
} from '@playverse/shared';
import { Button } from '../../ui/Button';
import { IconArrowRight, IconLink } from '../../ui/icons';
import { Notice } from '../../ui/Notice';
import { Panel } from '../../ui/Panel';
import { ScreenHeader } from '../../ui/ScreenHeader';
import { ScreenShell } from '../ScreenShell';
import { useNavigation } from '../../nav/navigation';
import { useSetup } from '../../state/setup';
import { useRoom } from '../../state/room';

function cleanCode(raw: string): string {
  return raw
    .toUpperCase()
    .split('')
    .filter((character) => ROOM_CODE_ALPHABET.includes(character))
    .join('');
}

/** Reads `?code=XXXXXX` from an invite link (`#/join-room?code=…`). */
function readInviteCode(): string {
  if (typeof window === 'undefined') return '';
  const query = window.location.hash.split('?')[1] ?? '';
  const value = new URLSearchParams(query).get('code') ?? '';
  return cleanCode(value).slice(0, ROOM_CODE_LENGTH);
}

/**
 * Screen 4 — Join Room. Six auto-advancing code boxes with paste support and
 * invite-link prefill; submitting asks the server to validate the code and
 * drop this player into the lobby.
 */
export function JoinRoomScreen() {
  const { navigate } = useNavigation();
  const { nickname, avatarId, isComplete } = useSetup();
  const { joinRoom } = useRoom();

  const inviteCode = readInviteCode();
  const [digits, setDigits] = useState<string[]>(() =>
    Array<string>(ROOM_CODE_LENGTH).fill('').map((_, index) => inviteCode[index] ?? ''),
  );
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<PlayverseError | null>(null);
  const [linkNotice, setLinkNotice] = useState(false);
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);

  const isFull = digits.every((digit) => digit.length === 1);

  useEffect(() => {
    if (inviteCode.length === ROOM_CODE_LENGTH) {
      inputsRef.current[ROOM_CODE_LENGTH - 1]?.focus();
    }
  }, [inviteCode]);

  /** Write characters starting at `startIndex`, then move focus along. */
  const distribute = (raw: string, startIndex: number) => {
    const cleaned = cleanCode(raw);
    if (cleaned.length === 0) return;
    setDigits((current) => {
      const next = [...current];
      for (let i = 0; i < cleaned.length && startIndex + i < ROOM_CODE_LENGTH; i++) {
        next[startIndex + i] = cleaned[i]!;
      }
      return next;
    });
    const focusIndex = Math.min(ROOM_CODE_LENGTH - 1, startIndex + cleaned.length);
    inputsRef.current[focusIndex]?.focus();
  };

  const handleChange = (index: number, value: string) => {
    if (value.length > 1) {
      distribute(value, index);
      return;
    }
    const cleaned = value ? cleanCode(value).slice(-1) : '';
    setDigits((current) => {
      const next = [...current];
      next[index] = cleaned;
      return next;
    });
    if (cleaned && index < ROOM_CODE_LENGTH - 1) inputsRef.current[index + 1]?.focus();
  };

  const handleKeyDown = (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace' && digits[index] === '' && index > 0) {
      event.preventDefault();
      setDigits((current) => {
        const next = [...current];
        next[index - 1] = '';
        return next;
      });
      inputsRef.current[index - 1]?.focus();
    } else if (event.key === 'ArrowLeft' && index > 0) {
      inputsRef.current[index - 1]?.focus();
    } else if (event.key === 'ArrowRight' && index < ROOM_CODE_LENGTH - 1) {
      inputsRef.current[index + 1]?.focus();
    }
  };

  const handleJoin = async () => {
    if (!isFull || !isComplete || pending) return;
    setPending(true);
    setFailure(null);
    const result = await joinRoom({
      code: digits.join(''),
      nickname,
      avatarId,
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
        index={4}
        title="Join Room"
        subtitle="Enter a code or open an invite link"
        onBack={() => navigate('/setup')}
        backLabel="Back to Player Setup"
      />

      <div className="flex flex-1 items-start justify-center">
        <Panel className="w-full max-w-xl">
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <span className="font-display text-xs font-semibold uppercase tracking-[0.14em] text-play-soft/75">
                Enter Room Code
              </span>

              <div
                className="grid grid-cols-6 gap-2 sm:gap-2.5"
                onPaste={(event) => {
                  event.preventDefault();
                  distribute(event.clipboardData.getData('text'), 0);
                }}
              >
                {digits.map((digit, index) => (
                  <input
                    key={index}
                    ref={(element) => {
                      inputsRef.current[index] = element;
                    }}
                    className="pv-code-input"
                    type="text"
                    inputMode="text"
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    maxLength={ROOM_CODE_LENGTH}
                    aria-label={`Room code character ${index + 1}`}
                    value={digit}
                    placeholder="·"
                    onChange={(event) => handleChange(index, event.target.value)}
                    onKeyDown={(event) => handleKeyDown(index, event)}
                  />
                ))}
              </div>

              <p className="text-xs font-semibold text-play-soft/60">
                Six characters — A–Z and 2–9 (I, O, 0 and 1 are skipped so codes stay readable).
              </p>
            </div>

            <Button
              size="lg"
              fullWidth
              disabled={!isFull || !isComplete || pending}
              icon={<IconArrowRight className="h-5 w-5" />}
              onClick={handleJoin}
            >
              {pending ? 'Joining…' : 'Join'}
            </Button>

            {inviteCode.length === ROOM_CODE_LENGTH ? (
              <Notice tone="success" data-testid="invite-prefill">
                <span>
                  <strong className="font-display">Invitation link detected.</strong> The code was
                  filled in for you — confirm your nickname in Player Setup if you want a different
                  one, then join.
                </span>
              </Notice>
            ) : null}

            {!isComplete ? (
              <Notice tone="warning">
                Set a nickname in Player Setup first — that is the name the room will show.
              </Notice>
            ) : null}

            {failure ? (
              <Notice tone="warning" role="alert" data-testid="join-error">
                <span>
                  <strong className="font-display">Cannot join.</strong> {failure.message}
                </span>
              </Notice>
            ) : null}

            <div className="flex items-center gap-3" aria-hidden="true">
              <span className="h-px flex-1 bg-white/15" />
              <span className="text-xs font-semibold uppercase tracking-widest text-play-soft/55">
                or
              </span>
              <span className="h-px flex-1 bg-white/15" />
            </div>

            <Button
              variant="secondary"
              fullWidth
              icon={<IconLink className="h-5 w-5" />}
              onClick={() => setLinkNotice(true)}
            >
              Join via Invitation Link
            </Button>

            {linkNotice ? (
              <Notice tone="info" data-testid="link-notice">
                Invite links look like <code className="font-bold">…/#/join-room?code=AB47FH</code>{' '}
                — opening one prefills the six boxes above automatically. Share one from the
                lobby&apos;s <strong className="font-display">Share Invite</strong> button.
              </Notice>
            ) : null}
          </div>
        </Panel>
      </div>
    </ScreenShell>
  );
}

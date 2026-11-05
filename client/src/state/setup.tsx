import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  GAME_MODES,
  MAX_PLAYERS,
  NICKNAME_MIN_LENGTH,
  getAvatar,
  type GameMode,
} from '@playverse/shared';

/** Which flow the player came through Home with. */
export type FlowIntent = 'create' | 'join';

export interface RoomDraft {
  mode: GameMode;
  maxPlayers: number;
  roomName: string;
}

export interface SetupValue {
  nickname: string;
  avatarId: string;
  intent: FlowIntent;
  draft: RoomDraft;
  /** Nickname is usable (min length after trimming). */
  isComplete: boolean;
  setNickname: (value: string) => void;
  setAvatarId: (value: string) => void;
  setIntent: (value: FlowIntent) => void;
  updateDraft: (patch: Partial<RoomDraft>) => void;
}

const DEFAULT_NICKNAME = 'Player1';

const SetupContext = createContext<SetupValue | null>(null);

/**
 * Local-only setup state: nickname, avatar, which flow the player picked and
 * the room draft. Deliberately in-memory — rooms and players become real in
 * Phase 3 when the server owns them. Nothing here talks to the network.
 */
export function SetupProvider({ children }: { children: ReactNode }) {
  const [nickname, setNicknameState] = useState(DEFAULT_NICKNAME);
  const [avatarId, setAvatarId] = useState(getAvatar('red').id);
  const [intent, setIntent] = useState<FlowIntent>('create');
  const [draft, setDraft] = useState<RoomDraft>({
    mode: GAME_MODES[0],
    maxPlayers: MAX_PLAYERS,
    roomName: '',
  });

  const setNickname = useCallback((value: string) => setNicknameState(value), []);
  const updateDraft = useCallback(
    (patch: Partial<RoomDraft>) => setDraft((current) => ({ ...current, ...patch })),
    [],
  );

  const isComplete = nickname.trim().length >= NICKNAME_MIN_LENGTH;

  const value = useMemo<SetupValue>(
    () => ({
      nickname,
      avatarId,
      intent,
      draft,
      isComplete,
      setNickname,
      setAvatarId,
      setIntent,
      updateDraft,
    }),
    [nickname, avatarId, intent, draft, isComplete, setNickname, setIntent, updateDraft],
  );

  return <SetupContext.Provider value={value}>{children}</SetupContext.Provider>;
}

export function useSetup(): SetupValue {
  const value = useContext(SetupContext);
  if (!value) {
    throw new Error('useSetup must be used inside <SetupProvider>');
  }
  return value;
}

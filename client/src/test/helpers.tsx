import { useEffect, type ReactNode } from 'react';
import { render } from '@testing-library/react';
import { NavigationProvider } from '../nav/navigation';
import { RoomProvider } from '../state/room';
import { GameProvider } from '../state/game';
import { SetupProvider, useSetup, type FlowIntent } from '../state/setup';
import { PreferencesProvider } from '../state/preferences';
import { ROOM_SESSION_KEY } from '../state/room';
import type { RoomState } from '@playverse/shared';
import { getFakeSocket } from './fakeSocket';
import { identityAck } from './fixtures';

/**
 * Renders UI inside the providers every screen runs under in the real app.
 * `RoomProvider` talks to the fake socket installed in `setup.ts`, so screens
 * behave exactly as they do live without a server running.
 */
export function renderWithProviders(ui: ReactNode) {
  return render(
    <PreferencesProvider>
      <SetupProvider>
        <NavigationProvider>
          <RoomProvider>
            <GameProvider>{ui}</GameProvider>
          </RoomProvider>
        </NavigationProvider>
      </SetupProvider>
    </PreferencesProvider>,
  );
}

/**
 * Applies setup-state overrides before the assertion runs — lets a test reach
 * e.g. an empty nickname or the join intent without a UI detour.
 */
export function SetupOverride({
  nickname,
  intent,
  maxPlayers,
}: {
  nickname?: string;
  intent?: FlowIntent;
  maxPlayers?: number;
}) {
  const { setNickname, setIntent, updateDraft } = useSetup();

  useEffect(() => {
    if (nickname !== undefined) setNickname(nickname);
    if (intent !== undefined) setIntent(intent);
    if (maxPlayers !== undefined) updateDraft({ maxPlayers });
  }, [nickname, intent, maxPlayers, setNickname, setIntent, updateDraft]);

  return null;
}

/**
 * Renders a match screen for an already-joined player.
 *
 * The provider path is the real one: a stored session is rejoined through
 * `room:rejoin`, so `meId` and the roster arrive from a server payload exactly
 * as they do after a reconnect.
 */
export function renderWithSession(ui: ReactNode, state: RoomState, meId = 'p1') {
  const socket = getFakeSocket();
  window.sessionStorage.setItem(
    ROOM_SESSION_KEY,
    JSON.stringify({ code: state.code, playerId: meId, reconnectToken: 'token-1' }),
  );
  socket.respond('room:rejoin', () => identityAck(meId, state));
  return { socket, ...renderWithProviders(ui) };
}

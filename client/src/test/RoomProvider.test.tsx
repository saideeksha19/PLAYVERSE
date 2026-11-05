import { describe, expect, it } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { err } from '@playverse/shared';
import { ROOM_SESSION_KEY, useRoom } from '../state/room';
import { getFakeSocket } from './fakeSocket';
import { identityAck, twoPlayerRoom } from './fixtures';
import { renderWithProviders } from './helpers';

/** Tiny consumer so provider state is readable without a screen in the way. */
function Probe() {
  const { connection, boot, room, meId, error, clearError } = useRoom();
  return (
    <div>
      <span data-testid="connection">{connection}</span>
      <span data-testid="boot">{boot}</span>
      <span data-testid="code">{room?.code ?? 'none'}</span>
      <span data-testid="me">{meId ?? 'none'}</span>
      <span data-testid="error">{error?.message ?? 'none'}</span>
      <button onClick={clearError}>clear error</button>
    </div>
  );
}

function storeSession(code = 'AB47FH', playerId = 'p1') {
  window.sessionStorage.setItem(
    ROOM_SESSION_KEY,
    JSON.stringify({ code, playerId, reconnectToken: 'token-1' }),
  );
}

describe('RoomProvider', () => {
  it('resolves boot on a warm connection with no stored session', () => {
    renderWithProviders(<Probe />);

    expect(screen.getByTestId('connection')).toHaveTextContent('connected');
    expect(screen.getByTestId('boot')).toHaveTextContent('resolved');
    expect(screen.getByTestId('code')).toHaveTextContent('none');
  });

  it('waits for the first connect before resolving boot', async () => {
    const socket = getFakeSocket();
    socket.connected = false;

    renderWithProviders(<Probe />);
    expect(screen.getByTestId('boot')).toHaveTextContent('pending');
    expect(screen.getByTestId('connection')).toHaveTextContent('connecting');

    await act(async () => {
      socket.restoreConnection();
    });

    expect(screen.getByTestId('boot')).toHaveTextContent('resolved');
    expect(screen.getByTestId('connection')).toHaveTextContent('connected');
    expect(socket.sent.some((event) => event.event === 'room:rejoin')).toBe(false);
  });

  it('rejoins a stored session on connect and restores the same slot', async () => {
    const socket = getFakeSocket();
    socket.connected = false;
    storeSession();
    socket.respond('room:rejoin', () => identityAck('p1', twoPlayerRoom()));

    renderWithProviders(<Probe />);
    await act(async () => {
      socket.restoreConnection();
    });

    expect(screen.getByTestId('code')).toHaveTextContent('AB47FH');
    expect(screen.getByTestId('me')).toHaveTextContent('p1');
    expect(socket.lastSent('room:rejoin')?.payload).toEqual({
      code: 'AB47FH',
      playerId: 'p1',
      reconnectToken: 'token-1',
    });
    // The stored session survives a successful rejoin.
    expect(window.sessionStorage.getItem(ROOM_SESSION_KEY)).not.toBeNull();
  });

  it('drops an unusable stored session instead of retrying forever', async () => {
    const socket = getFakeSocket();
    socket.connected = false;
    storeSession();
    socket.respond('room:rejoin', () =>
      err('room-not-found', 'That room is no longer open.'),
    );

    renderWithProviders(<Probe />);
    await act(async () => {
      socket.restoreConnection();
    });

    expect(screen.getByTestId('code')).toHaveTextContent('none');
    expect(screen.getByTestId('me')).toHaveTextContent('none');
    expect(screen.getByTestId('boot')).toHaveTextContent('resolved');
    expect(window.sessionStorage.getItem(ROOM_SESSION_KEY)).toBeNull();
  });

  it('rejoins again after a transport reconnect', async () => {
    const socket = getFakeSocket();
    socket.respond('room:rejoin', () => identityAck('p1', twoPlayerRoom()));
    storeSession();

    renderWithProviders(<Probe />);
    await waitFor(() => expect(screen.getByTestId('code')).toHaveTextContent('AB47FH'));

    const rejoinsBefore = socket.sent.filter((event) => event.event === 'room:rejoin').length;

    act(() => {
      socket.dropConnection();
    });
    expect(screen.getByTestId('connection')).toHaveTextContent('reconnecting');

    await act(async () => {
      socket.restoreConnection();
    });

    // The server binds rooms per socket id, so a new connection must re-bind.
    await waitFor(() =>
      expect(socket.sent.filter((event) => event.event === 'room:rejoin').length).toBe(
        rejoinsBefore + 1,
      ),
    );
    expect(screen.getByTestId('connection')).toHaveTextContent('connected');
  });

  it('maps the reconnect lifecycle onto connection state', () => {
    const socket = getFakeSocket();
    renderWithProviders(<Probe />);

    act(() => {
      socket.dropConnection();
    });
    expect(screen.getByTestId('connection')).toHaveTextContent('reconnecting');

    act(() => {
      socket.reconnectAttempt();
    });
    expect(screen.getByTestId('connection')).toHaveTextContent('reconnecting');

    act(() => {
      socket.failReconnection();
    });
    expect(screen.getByTestId('connection')).toHaveTextContent('offline');
    expect(screen.getByTestId('boot')).toHaveTextContent('resolved');
  });

  it('goes straight to offline when the server ends the connection', () => {
    const socket = getFakeSocket();
    renderWithProviders(<Probe />);

    act(() => {
      socket.dropConnection('io server disconnect');
    });

    expect(screen.getByTestId('connection')).toHaveTextContent('offline');
  });

  it('surfaces pushed server errors and clears them on demand', async () => {
    const socket = getFakeSocket();
    renderWithProviders(<Probe />);

    act(() => {
      socket.deliver('error', { code: 'server-error', message: 'Server exploded.' });
    });
    expect(screen.getByTestId('error')).toHaveTextContent('Server exploded.');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'clear error' }));
    expect(screen.getByTestId('error')).toHaveTextContent('none');
  });

  it('removes every socket and manager listener on unmount', () => {
    const socket = getFakeSocket();
    const { unmount } = renderWithProviders(<Probe />);

    // Both providers in the tree may listen; what matters is that they all clear.
    expect(socket.listenerCount('connect')).toBeGreaterThan(0);
    expect(socket.listenerCount('room:state')).toBeGreaterThan(0);
    expect(socket.io.listenerCount('reconnect_attempt')).toBeGreaterThan(0);

    unmount();

    for (const event of ['connect', 'disconnect', 'room:state', 'connection:resume', 'error']) {
      expect(socket.listenerCount(event)).toBe(0);
    }
    for (const event of ['reconnect_attempt', 'reconnect_failed']) {
      expect(socket.io.listenerCount(event)).toBe(0);
    }
  });
});

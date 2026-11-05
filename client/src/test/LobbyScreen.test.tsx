import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ok, type RoomState } from '@playverse/shared';
import { LobbyScreen } from '../screens/lobby/LobbyScreen';
import { ROOM_SESSION_KEY } from '../state/room';
import { getFakeSocket, type FakeSocket } from './fakeSocket';
import {
  identityAck,
  makePlayer,
  makeRoom,
  readyRoom,
  twoPlayerRoom,
  withHost,
  withOffline,
  withReady,
} from './fixtures';
import { renderWithProviders } from './helpers';

const listOfPlayers = () => screen.getByRole('list', { name: 'Players in the room' });

/**
 * Renders the lobby with a restored session (the reload path): a stored
 * session is rejoined through the provider, so `meId` and the roster come from
 * the server payload exactly as they do live.
 */
async function renderLobby(state: RoomState, meId = 'p1'): Promise<FakeSocket> {
  const socket = getFakeSocket();
  window.sessionStorage.setItem(
    ROOM_SESSION_KEY,
    JSON.stringify({ code: state.code, playerId: meId, reconnectToken: 'token-1' }),
  );
  socket.respond('room:rejoin', () => identityAck(meId, state));

  renderWithProviders(<LobbyScreen />);
  await screen.findByRole('list', { name: 'Players in the room' });
  return socket;
}

describe('Waiting Lobby screen', () => {
  it('renders the server roster, host crown and capacity', async () => {
    await renderLobby(twoPlayerRoom());

    expect(screen.getByText('Fun Squad')).toBeInTheDocument();
    expect(screen.getByLabelText('Room code A B 4 7 F H')).toBeInTheDocument();
    expect(screen.getByText('2/8 players')).toBeInTheDocument();

    expect(screen.getByText('Alice (You)')).toBeInTheDocument();
    expect(screen.getByText('You · Host')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('Not ready')).toBeInTheDocument();

    // Eight slots, two filled.
    expect(screen.getAllByText('Open slot')).toHaveLength(6);
  });

  it('applies live broadcasts: a join, a ready toggle and an offline drop', async () => {
    const socket = await renderLobby(twoPlayerRoom());
    const withThird = makeRoom({
      players: [
        makePlayer({ id: 'p1', nickname: 'Alice', isHost: true, isReady: true }),
        makePlayer({ id: 'p2', nickname: 'Bob', isReady: true }),
        makePlayer({ id: 'p3', nickname: 'Cara', isReady: true }),
      ],
    });

    act(() => {
      socket.deliver('room:state', withThird);
    });

    expect(await screen.findByText('Cara')).toBeInTheDocument();
    expect(screen.getAllByText('Open slot')).toHaveLength(5);
    expect(screen.getByText('3/8 players')).toBeInTheDocument();
    expect(screen.getByTestId('ready-count')).toHaveTextContent('3 of 3 ready');

    // Bob drops: his slot is kept and marked offline, not removed.
    act(() => {
      socket.deliver('room:state', withOffline(withThird, 'p2'));
    });

    expect(await screen.findByText('Offline')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    // Three player entries (not four, not two) plus five remaining open slots.
    expect(listOfPlayers().querySelectorAll('[data-testid^="player-"]')).toHaveLength(3);
    expect(screen.getAllByText('Open slot')).toHaveLength(5);
  });

  it('sends ready intents and renders the server response', async () => {
    const socket = getFakeSocket();
    const base = twoPlayerRoom();
    socket.respond('player:ready', (ready: boolean) => ok(withReady(base, 'p1', ready)));
    await renderLobby(base);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Mark me ready' }));

    expect(await screen.findByRole('button', { name: 'Ready!' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await user.click(screen.getByRole('button', { name: 'Ready!' }));

    expect(await screen.findByRole('button', { name: 'Mark me ready' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    expect(socket.sent.filter((event) => event.event === 'player:ready').map((e) => e.payload)).toEqual(
      [true, false],
    );
  });

  it('lets the host start once every connected player is ready', async () => {
    const socket = getFakeSocket();
    socket.respond('game:start', () => ok({ ...readyRoom(), status: 'intro', roundIndex: 1 }));
    await renderLobby(readyRoom());

    const start = screen.getByRole('button', { name: /Start Game/ });
    expect(start).toBeEnabled();
    expect(screen.getByTestId('ready-count')).toHaveTextContent('2 of 2 ready');

    const user = userEvent.setup();
    await user.click(start);

    await waitFor(() => expect(window.location.hash).toBe('#/intro'));
    expect(socket.lastSent('game:start')).toBeDefined();
  });

  it('locks start until every connected player is ready', async () => {
    await renderLobby(twoPlayerRoom());

    const start = screen.getByRole('button', { name: /Start Game/ });
    expect(start).toBeDisabled();
    expect(start).toHaveAttribute('title', 'Waiting for everyone to be ready (0/2)');
  });

  it('never lets a non-host start the match', async () => {
    const socket = await renderLobby(readyRoom(), 'p2');

    const start = screen.getByRole('button', { name: /Start Game/ });
    expect(start).toBeDisabled();
    expect(start).toHaveAttribute('title', 'Only the host can start the match');
    expect(screen.queryByRole('button', { name: 'Make Alice the host' })).toBeNull();

    fireEvent.click(start);
    expect(socket.sent.some((event) => event.event === 'game:start')).toBe(false);
  });

  it('lets the host hand the crown to another player', async () => {
    const socket = getFakeSocket();
    socket.respond('host:transfer', (payload: { playerId: string }) =>
      ok(withHost(twoPlayerRoom(), payload.playerId)),
    );
    await renderLobby(twoPlayerRoom());

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Make Bob the host' }));

    expect(socket.lastSent('host:transfer')?.payload).toEqual({ playerId: 'p2' });
    expect(await screen.findByText('Host')).toBeInTheDocument();
  });

  it('leaves the room and returns home', async () => {
    const socket = getFakeSocket();
    socket.respond('room:leave', () => ok({ left: true }));
    await renderLobby(twoPlayerRoom());

    const user = userEvent.setup();
    await user.click(screen.getByTestId('leave-room'));

    await waitFor(() => expect(window.location.hash).toBe('#/home'));
    expect(window.sessionStorage.getItem(ROOM_SESSION_KEY)).toBeNull();
  });

  it('copies the real room code to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    await renderLobby(twoPlayerRoom({ code: 'ZX81QP' }));

    // fireEvent, not userEvent: userEvent.setup() installs its own clipboard stub.
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));

    expect(writeText).toHaveBeenCalledWith('ZX81QP');
    expect(await screen.findByRole('button', { name: 'Copied!' })).toBeInTheDocument();
  });

  it('warns while the transport is down and clears when it recovers', async () => {
    const socket = await renderLobby(twoPlayerRoom());

    act(() => {
      socket.dropConnection();
    });
    expect(screen.getByTestId('connection-banner')).toHaveTextContent(/Reconnecting/);

    act(() => {
      socket.reconnectAttempt();
    });
    expect(screen.getByTestId('connection-banner')).toHaveTextContent(/Reconnecting/);

    act(() => {
      socket.restoreConnection();
    });
    await waitFor(() => expect(screen.queryByTestId('connection-banner')).toBeNull());
    expect(screen.getByText('Alice (You)')).toBeInTheDocument();
  });

  it('reports a started match instead of start controls', async () => {
    await renderLobby(readyRoom({ status: 'playing', roundIndex: 1 }));

    expect(screen.getByTestId('match-started')).toHaveTextContent(/Round 1 of/);
    expect(screen.queryByRole('button', { name: /Start Game/ })).toBeNull();
  });

  it('shows a no-room notice instead of inventing a lobby', async () => {
    renderWithProviders(<LobbyScreen />);

    expect(await screen.findByTestId('no-room')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Players in the room' })).toBeNull();
  });

  it('routes the lobby gear to Settings', async () => {
    await renderLobby(twoPlayerRoom());

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Lobby settings' }));

    expect(window.location.hash).toBe('#/settings');
  });
});

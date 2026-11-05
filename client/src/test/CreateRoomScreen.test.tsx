import { describe, expect, it } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MAX_PLAYERS, MIN_PLAYERS, err } from '@playverse/shared';
import { CreateRoomScreen } from '../screens/create/CreateRoomScreen';
import { getFakeSocket } from './fakeSocket';
import { identityAck, makeRoom } from './fixtures';
import { renderWithProviders, SetupOverride } from './helpers';

describe('Create Room screen', () => {
  it('renders the three reference fields', () => {
    renderWithProviders(<CreateRoomScreen />);

    expect(screen.getByRole('heading', { level: 1, name: 'Create Room' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Game Mode' })).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'Max players' })).toHaveAttribute(
      'aria-valuenow',
      String(MAX_PLAYERS),
    );
    expect(screen.getByLabelText('Room Name (optional)')).toHaveAttribute(
      'placeholder',
      'Fun Squad',
    );
  });

  it('switches the game mode', async () => {
    renderWithProviders(<CreateRoomScreen />);
    const user = userEvent.setup();

    const classic = screen.getByRole('button', { name: /Classic/ });
    const family = screen.getByRole('button', { name: /Family Friendly/ });

    expect(classic).toHaveAttribute('aria-pressed', 'true');

    await user.click(family);

    expect(family).toHaveAttribute('aria-pressed', 'true');
    expect(classic).toHaveAttribute('aria-pressed', 'false');
  });

  it('bounds the max-player stepper between 2 and 8', async () => {
    renderWithProviders(<CreateRoomScreen />);
    const user = userEvent.setup();

    const spinbutton = screen.getByRole('spinbutton', { name: 'Max players' });
    const decrease = screen.getByRole('button', {
      name: 'Decrease Max players',
    }) as HTMLButtonElement;
    const increase = screen.getByRole('button', { name: 'Increase Max players' });

    expect(increase).toBeDisabled();

    for (let i = 0; i < 10; i++) {
      if (!decrease.disabled) await user.click(decrease);
    }
    expect(spinbutton).toHaveAttribute('aria-valuenow', String(MIN_PLAYERS));
    expect(decrease).toBeDisabled();

    await user.click(increase);
    expect(spinbutton).toHaveAttribute('aria-valuenow', String(MIN_PLAYERS + 1));
  });

  it('keeps the room name in the draft', async () => {
    renderWithProviders(<CreateRoomScreen />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('Room Name (optional)'), 'Fun Squad');

    expect(screen.getByLabelText('Room Name (optional)')).toHaveValue('Fun Squad');
  });

  it('creates the room on the server and opens the lobby', async () => {
    const socket = getFakeSocket();
    const room = makeRoom({ code: 'ZX81QP', name: 'Fun Squad' });
    socket.respond('room:create', () => identityAck('p1', room));

    renderWithProviders(<CreateRoomScreen />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('Room Name (optional)'), 'Fun Squad');
    await user.click(screen.getByRole('button', { name: /^Create Room$/ }));

    await waitFor(() => expect(window.location.hash).toBe('#/lobby'));

    // The screen sends the draft as an intent — the server owns the room itself.
    expect(socket.lastSent('room:create')?.payload).toEqual({
      nickname: 'Player1',
      avatarId: 'red',
      maxPlayers: MAX_PLAYERS,
      mode: 'classic',
      roomName: 'Fun Squad',
    });
  });

  it('omits an empty room name so the server picks the default', async () => {
    const socket = getFakeSocket();
    socket.respond('room:create', () => identityAck('p1', makeRoom()));

    renderWithProviders(<CreateRoomScreen />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /^Create Room$/ }));
    await waitFor(() => expect(window.location.hash).toBe('#/lobby'));

    const payload = socket.lastSent('room:create')?.payload as { roomName?: string };
    expect(payload.roomName).toBeUndefined();
  });

  it('surfaces a typed server error and stays on the form', async () => {
    const socket = getFakeSocket();
    socket.respond('room:create', () =>
      err('server-error', 'Room creation is unavailable right now.'),
    );

    renderWithProviders(<CreateRoomScreen />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /^Create Room$/ }));

    expect(await screen.findByTestId('create-error')).toHaveTextContent(
      /Room creation is unavailable right now/i,
    );
    expect(window.location.hash).not.toBe('#/lobby');
  });

  it('shows an in-flight state until the server acknowledges', async () => {
    const socket = getFakeSocket();
    let release!: (value: unknown) => void;
    socket.respond(
      'room:create',
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );

    renderWithProviders(<CreateRoomScreen />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /^Create Room$/ }));

    // No duplicate submissions while the ack is outstanding.
    expect(screen.getByRole('button', { name: 'Creating room…' })).toBeDisabled();
    expect(window.location.hash).not.toBe('#/lobby');

    await act(async () => {
      release(identityAck('p1', makeRoom()));
    });
    await waitFor(() => expect(window.location.hash).toBe('#/lobby'));
  });

  it('blocks creation while the nickname is empty', () => {
    renderWithProviders(
      <>
        <SetupOverride nickname="" />
        <CreateRoomScreen />
      </>,
    );

    expect(screen.getByRole('button', { name: /^Create Room$/ })).toBeDisabled();
    expect(screen.getByText(/Set a nickname in Player Setup first/i)).toBeInTheDocument();
  });
});

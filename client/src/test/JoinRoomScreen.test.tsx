import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import userEvent from '@testing-library/user-event';
import { ROOM_CODE_LENGTH, err } from '@playverse/shared';
import { JoinRoomScreen } from '../screens/join/JoinRoomScreen';
import { getFakeSocket } from './fakeSocket';
import { identityAck, twoPlayerRoom } from './fixtures';
import { renderWithProviders, SetupOverride } from './helpers';

function codeBoxes(): HTMLInputElement[] {
  return screen
    .getAllByRole('textbox', { name: /Room code character/ })
    .map((element) => element as HTMLInputElement);
}

async function typeCode(user: ReturnType<typeof userEvent.setup>, code: string) {
  const boxes = codeBoxes();
  for (let index = 0; index < code.length; index++) {
    await user.type(boxes[index]!, code[index]!);
  }
  return boxes;
}

describe('Join Room screen', () => {
  it('renders six code boxes with Join disabled', () => {
    renderWithProviders(<JoinRoomScreen />);

    expect(screen.getByRole('heading', { level: 1, name: 'Join Room' })).toBeInTheDocument();
    expect(codeBoxes()).toHaveLength(ROOM_CODE_LENGTH);
    expect(screen.getByRole('button', { name: /^Join$/ })).toBeDisabled();
  });

  it('accepts a full code typed one box at a time', async () => {
    renderWithProviders(<JoinRoomScreen />);
    const user = userEvent.setup();

    const boxes = codeBoxes();
    const code = 'AB47FH';
    for (let i = 0; i < code.length; i++) {
      await user.type(boxes[i]!, code[i]!);
    }

    expect(boxes.map((box) => box.value).join('')).toBe(code);
    expect(screen.getByRole('button', { name: /^Join$/ })).toBeEnabled();
  });

  it('filters ambiguous characters out of a pasted code', () => {
    renderWithProviders(<JoinRoomScreen />);

    fireEvent.paste(screen.getAllByRole('textbox')[0]!, {
      clipboardData: { getData: () => 'ab1i0o7' },
    });

    // a, b, 7 survive; 1, i, 0, o are excluded by ROOM_CODE_ALPHABET.
    const values = codeBoxes().map((box) => box.value);
    expect(values.join('')).toBe('AB7');
    expect(values[3]).toBe('');
    expect(screen.getByRole('button', { name: /^Join$/ })).toBeDisabled();
  });

  it('joins with the typed code and opens the lobby', async () => {
    const socket = getFakeSocket();
    socket.respond('room:join', () => identityAck('p2', twoPlayerRoom()));

    renderWithProviders(<JoinRoomScreen />);
    const user = userEvent.setup();

    await typeCode(user, 'AB47FH');
    await user.click(screen.getByRole('button', { name: /^Join$/ }));

    await waitFor(() => expect(window.location.hash).toBe('#/lobby'));
    expect(socket.lastSent('room:join')?.payload).toEqual({
      code: 'AB47FH',
      nickname: 'Player1',
      avatarId: 'red',
    });
  });

  it('prefills the code from an invite link', () => {
    window.location.hash = '#/join-room?code=ab47fh';

    renderWithProviders(<JoinRoomScreen />);

    expect(codeBoxes().map((box) => box.value).join('')).toBe('AB47FH');
    expect(screen.getByTestId('invite-prefill')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Join$/ })).toBeEnabled();
  });

  it('shows the server reason when the code matches no room', async () => {
    const socket = getFakeSocket();
    socket.respond('room:join', () => err('room-not-found', 'No room matches that code.'));

    renderWithProviders(<JoinRoomScreen />);
    const user = userEvent.setup();

    await typeCode(user, 'ZZZZZZ');
    await user.click(screen.getByRole('button', { name: /^Join$/ }));

    expect(await screen.findByTestId('join-error')).toHaveTextContent(/No room matches that code/i);
    expect(window.location.hash).not.toBe('#/lobby');
  });

  it('shows the server reason when the room is full', async () => {
    const socket = getFakeSocket();
    socket.respond('room:join', () => err('room-full', 'This room is full.'));
    // The full room took the player's nickname, so the server rejects the join.

    renderWithProviders(<JoinRoomScreen />);
    const user = userEvent.setup();

    await typeCode(user, 'AB47FH');
    await user.click(screen.getByRole('button', { name: /^Join$/ }));

    expect(await screen.findByTestId('join-error')).toHaveTextContent(/This room is full/i);
    expect(window.location.hash).not.toBe('#/lobby');
  });

  it('explains invite links', async () => {
    renderWithProviders(<JoinRoomScreen />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /Join via Invitation Link/ }));

    expect(await screen.findByTestId('link-notice')).toBeInTheDocument();
    expect(screen.getByTestId('link-notice')).toHaveTextContent(/join-room\?code=/);
  });

  it('blocks joining while the nickname is empty', () => {
    renderWithProviders(
      <>
        <SetupOverride nickname="" />
        <JoinRoomScreen />
      </>,
    );

    expect(screen.getByText(/Set a nickname in Player Setup first/i)).toBeInTheDocument();
  });
});

import { describe, expect, it } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ok, type AnswerReceipt, type RoundQuestion } from '@playverse/shared';
import { MemoryMixScreen } from '../screens/gameplay/MemoryMixScreen';
import { makeMemoryQuestion, twoPlayerRoom } from './fixtures';
import { renderWithSession } from './helpers';

const playingRoom = twoPlayerRoom({
  status: 'playing',
  roundIndex: 2,
  players: [
    { id: 'p1', nickname: 'Alice', avatarId: 'red', isHost: true, isReady: true, connected: true, score: 0, joinedAt: 0 },
    { id: 'p2', nickname: 'Bob', avatarId: 'blue', isHost: false, isReady: true, connected: true, score: 0, joinedAt: 1 },
  ],
});

async function renderMemory(
  question: RoundQuestion | (() => RoundQuestion) = makeMemoryQuestion,
) {
  const { socket } = renderWithSession(<MemoryMixScreen />, {
    ...playingRoom,
    serverTime: Date.now(),
  });
  await screen.findByTestId('memory-waiting');
  const payload = typeof question === 'function' ? question() : question;
  await act(async () => {
    socket.deliver('round:start', payload);
  });
  await screen.findByTestId('memory-prompt');
  return { socket, question: payload };
}

const memorisingQuestion = () => {
  const base = makeMemoryQuestion();
  if (base.stimulus.kind !== 'memory-sequence') throw new Error('wrong fixture');
  return makeMemoryQuestion({
    stimulus: { ...base.stimulus, memoriseUntil: Date.now() + 1200 },
  });
};

describe('Memory Mix gameplay screen', () => {
  it('shows the sequence while memorising and disables the symbol pool', async () => {
    await renderMemory(memorisingQuestion);

    expect(screen.getByTestId('memory-sequence')).toBeInTheDocument();
    const items = screen.getAllByTestId('memory-sequence-item');
    expect(items.map((item) => item.getAttribute('data-item'))).toEqual([
      'star',
      'heart',
      'star',
    ]);
    expect(screen.getByRole('button', { name: 'Add Star' })).toBeDisabled();
    expect(screen.getByTestId('memory-prompt')).toHaveTextContent('Watch closely!');
  });

  it('hides the sequence after memorising and submits the tapped order', async () => {
    const { socket } = await renderMemory(memorisingQuestion);

    const star = screen.getByRole('button', { name: 'Add Star' });
    await waitFor(() => expect(star).toBeEnabled(), { timeout: 3000 });
    expect(screen.queryByTestId('memory-sequence')).not.toBeInTheDocument();
    expect(screen.getByTestId('memory-prompt')).toHaveTextContent('Tap in order');

    const user = userEvent.setup();
    await user.click(star);
    await user.click(screen.getByRole('button', { name: 'Add Heart' }));
    await user.click(star);

    expect(screen.getByTestId('memory-input')).toHaveTextContent('★♥★');

    socket.respond('game:answer', () =>
      ok<AnswerReceipt>({ choiceId: 'star,heart,star', receivedAt: Date.now() }),
    );
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(socket.lastSent('game:answer')?.payload).toEqual({
      roundIndex: 2,
      choiceId: 'star,heart,star',
    });
    expect(await screen.findByTestId('memory-locked')).toHaveTextContent(
      'Sequence locked in.',
    );
    expect(screen.getByRole('button', { name: 'Add Star' })).toBeDisabled();
    expect(screen.getByTestId('mine')).toHaveTextContent('star,heart,star');
  });

  it('clears the input when a new round arrives', async () => {
    const { socket } = await renderMemory({
      ...makeMemoryQuestion(),
      stimulus: {
        kind: 'memory-sequence',
        sequence: ['star', 'heart', 'star'],
        memoriseUntil: Date.now() - 60_000,
        length: 3,
        pool: ['star', 'heart', 'moon'],
      },
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Add Star' }));
    expect(screen.getByTestId('memory-input')).toHaveTextContent('★');

    await act(async () => {
      socket.deliver(
        'round:start',
        makeMemoryQuestion({
          roundIndex: 4,
          stimulus: {
            kind: 'memory-sequence',
            sequence: ['heart'],
            memoriseUntil: Date.now() - 60_000,
            length: 1,
            pool: ['star', 'heart'],
          },
        }),
      );
    });

    await waitFor(() => expect(screen.getByTestId('memory-input')).toHaveTextContent(
      'Tap symbols below in order',
    ));
  });
});

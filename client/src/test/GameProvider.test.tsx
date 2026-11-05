import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { err, ok, type AnswerReceipt, type Result } from '@playverse/shared';
import { useGame } from '../state/game';
import { getFakeSocket } from './fakeSocket';
import { makeMemoryQuestion } from './fixtures';
import { renderWithProviders } from './helpers';

function AnswerProbe() {
  const { question, myAnswer, submitting, error, submitAnswer, clearError } = useGame();
  return (
    <div>
      <span data-testid="round">{question?.roundIndex ?? 'none'}</span>
      <span data-testid="mine">{myAnswer?.choiceId ?? 'none'}</span>
      <span data-testid="submitting">{String(submitting)}</span>
      <span data-testid="error">{error?.message ?? 'none'}</span>
      <button onClick={() => void submitAnswer('star')}>send answer</button>
      <button onClick={clearError}>clear error</button>
    </div>
  );
}

async function renderQuestion() {
  const socket = getFakeSocket();
  renderWithProviders(<AnswerProbe />);
  await act(async () => {
    socket.deliver('round:start', makeMemoryQuestion());
  });
  await waitFor(() => expect(screen.getByTestId('round')).toHaveTextContent('2'));
  return socket;
}

describe('GameProvider answer flow', () => {
  it('drops a second intent while the first answer is still in flight', async () => {
    const socket = await renderQuestion();
    let resolveFirst: ((result: Result<AnswerReceipt>) => void) | null = null;
    socket.respond(
      'game:answer',
      () =>
        new Promise<Result<AnswerReceipt>>((resolve) => {
          resolveFirst = resolve;
        }),
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'send answer' }));
    await user.click(screen.getByRole('button', { name: 'send answer' }));

    expect(socket.sent.filter((event) => event.event === 'game:answer')).toHaveLength(1);
    expect(screen.getByTestId('submitting')).toHaveTextContent('true');

    await act(async () => {
      resolveFirst?.(ok<AnswerReceipt>({ choiceId: 'star', receivedAt: Date.now() }));
    });

    await waitFor(() => expect(screen.getByTestId('mine')).toHaveTextContent('star'));
    expect(screen.getByTestId('submitting')).toHaveTextContent('false');

    // Once accepted, every further tap is blocked locally.
    await user.click(screen.getByRole('button', { name: 'send answer' }));
    expect(socket.sent.filter((event) => event.event === 'game:answer')).toHaveLength(1);
  });

  it('surfaces a rejected answer and allows a retry', async () => {
    const socket = await renderQuestion();
    let attempt = 0;
    socket.respond('game:answer', () => {
      attempt += 1;
      return attempt === 1
        ? err<AnswerReceipt>('round-closed', 'Time is up for this round.')
        : ok<AnswerReceipt>({ choiceId: 'star', receivedAt: Date.now() });
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'send answer' }));

    await waitFor(() =>
      expect(screen.getByTestId('error')).toHaveTextContent('Time is up for this round.'),
    );
    expect(screen.getByTestId('mine')).toHaveTextContent('none');

    await user.click(screen.getByRole('button', { name: 'send answer' }));

    await waitFor(() => expect(screen.getByTestId('mine')).toHaveTextContent('star'));
    expect(screen.getByTestId('error')).toHaveTextContent('none');
    expect(socket.sent.filter((event) => event.event === 'game:answer')).toHaveLength(2);
  });

  it('treats a duplicate-answer ack as already locked in', async () => {
    const socket = await renderQuestion();
    socket.respond('game:answer', () =>
      err<AnswerReceipt>('duplicate-answer', 'You already answered this round.'),
    );

    await userEvent.setup().click(screen.getByRole('button', { name: 'send answer' }));

    await waitFor(() => expect(screen.getByTestId('mine')).toHaveTextContent('star'));
    expect(screen.getByTestId('error')).toHaveTextContent('none');
    expect(screen.getByTestId('submitting')).toHaveTextContent('false');

    await userEvent.setup().click(screen.getByRole('button', { name: 'send answer' }));
    expect(socket.sent.filter((event) => event.event === 'game:answer')).toHaveLength(1);
  });
});

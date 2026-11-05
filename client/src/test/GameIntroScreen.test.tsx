import { describe, expect, it } from 'vitest';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { err, ok } from '@playverse/shared';
import { GameIntroScreen } from '../screens/intro/GameIntroScreen';
import { getFakeSocket } from './fakeSocket';
import { makeIntro, twoPlayerRoom } from './fixtures';
import { renderWithProviders, renderWithSession } from './helpers';

async function renderIntro(intro = makeIntro(), meId = 'p1') {
  const { socket } = renderWithSession(
    <GameIntroScreen />,
    twoPlayerRoom({ status: 'intro', roundIndex: intro.roundIndex }),
    meId,
  );
  await screen.findByTestId('intro-waiting');
  act(() => {
    socket.deliver('game:intro', intro);
  });
  await screen.findByTestId('intro-status');
  return socket;
}

describe('Game Introduction screen', () => {
  it('says plainly when there is no match to introduce', () => {
    renderWithProviders(<GameIntroScreen />);

    expect(screen.getByTestId('intro-waiting')).toHaveTextContent("You're not in a match.");
  });

  it('renders the round, the rules and the server’s scoring numbers', async () => {
    await renderIntro();

    expect(screen.getByText('Round 1 of 5')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Color Clash' })).toBeInTheDocument();
    expect(screen.getByText(/Tap the tile that matches the colour shown/)).toBeInTheDocument();
    expect(screen.getByText('Amber ★')).toBeInTheDocument();

    expect(screen.getByText('+10')).toBeInTheDocument();
    expect(screen.getByText('Correct')).toBeInTheDocument();
    expect(screen.getByText('+5')).toBeInTheDocument();
    expect(screen.getByText('Fast Answer')).toBeInTheDocument();
    expect(screen.getByText('−5')).toBeInTheDocument();
    expect(screen.getByText('Incorrect')).toBeInTheDocument();
  });

  it('shows a zero penalty for family-friendly rooms', async () => {
    await renderIntro(makeIntro({ scoring: { correct: 10, fastAnswer: 5, incorrect: 0 } }));

    expect(screen.getByText('Incorrect')).toBeInTheDocument();
    expect(screen.queryByText('−5')).not.toBeInTheDocument();
  });

  it('readies up on the server and disables the button afterwards', async () => {
    const socket = getFakeSocket();
    socket.respond('round:ready', () => ok({ readyCount: 2 }));
    await renderIntro(makeIntro({ readyCount: 1, playerCount: 2 }));

    expect(screen.getByTestId('intro-status')).toHaveTextContent('1 of 2 players are ready');

    const ready = screen.getByRole('button', { name: "I'm Ready" });
    expect(ready).toHaveAttribute('aria-pressed', 'false');

    await userEvent.setup().click(ready);

    expect(socket.lastSent('round:ready')).toBeDefined();
    const pressed = await screen.findByRole('button', { name: "You're Ready!" });
    expect(pressed).toHaveAttribute('aria-pressed', 'true');
    expect(pressed).toBeDisabled();
    expect(screen.getByTestId('intro-status')).toHaveTextContent('Waiting for the others');

    // The count is the server's: a fresh broadcast updates it.
    act(() => {
      socket.deliver('game:intro', makeIntro({ readyCount: 2, playerCount: 2, startsAt: Date.now() + 8000 }));
    });
    expect(screen.getByTestId('intro-status')).toHaveTextContent('2 of 2 players are ready');
  });

  it('surfaces a server refusal to ready up', async () => {
    const socket = getFakeSocket();
    socket.respond('round:ready', () => err('wrong-phase', 'This round has already started.'));
    await renderIntro();

    await userEvent.setup().click(screen.getByRole('button', { name: "I'm Ready" }));

    expect(await screen.findByTestId('intro-error')).toHaveTextContent('This round has already started.');
    expect(screen.getByRole('button', { name: "I'm Ready" })).toBeEnabled();
  });

  it('routes back to the lobby', async () => {
    await renderIntro();

    await userEvent.setup().click(screen.getByRole('button', { name: /Back to Lobby/ }));

    expect(window.location.hash).toBe('#/lobby');
  });
});

import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AVATARS, NICKNAME_MAX_LENGTH } from '@playverse/shared';
import { PlayerSetupScreen } from '../screens/setup/PlayerSetupScreen';
import { renderWithProviders, SetupOverride } from './helpers';

describe('Player Setup screen', () => {
  it('renders the heading, nickname field and every preset avatar', () => {
    renderWithProviders(<PlayerSetupScreen />);

    expect(screen.getByRole('heading', { level: 1, name: 'Player Setup' })).toBeInTheDocument();

    const input = screen.getByLabelText('Enter your nickname');
    expect(input).toHaveValue('Player1');
    expect(input).toHaveAttribute('maxLength', String(NICKNAME_MAX_LENGTH));

    expect(screen.getAllByRole('img', { name: /cube avatar/ })).toHaveLength(AVATARS.length);
  });

  it('disables Continue until the nickname is long enough', async () => {
    renderWithProviders(
      <>
        <SetupOverride nickname="" />
        <PlayerSetupScreen />
      </>,
    );
    const user = userEvent.setup();

    const continueButton = screen.getByRole('button', { name: /Continue/ });
    expect(continueButton).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent(/at least 2 characters/i);

    await user.type(screen.getByLabelText('Enter your nickname'), 'Al');
    expect(continueButton).toBeEnabled();
  });

  it('selects an avatar and marks it pressed', async () => {
    renderWithProviders(<PlayerSetupScreen />);
    const user = userEvent.setup();

    const red = screen.getByRole('button', { name: 'Use the Red cube' });
    const blue = screen.getByRole('button', { name: 'Use the Blue cube' });

    expect(red).toHaveAttribute('aria-pressed', 'true');
    expect(blue).toHaveAttribute('aria-pressed', 'false');

    await user.click(blue);

    expect(blue).toHaveAttribute('aria-pressed', 'true');
    expect(red).toHaveAttribute('aria-pressed', 'false');
  });

  it('routes Continue into Create Room for the create intent', async () => {
    renderWithProviders(<PlayerSetupScreen />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /Continue/ }));

    expect(window.location.hash).toBe('#/create-room');
  });

  it('routes Continue into Join Room for the join intent', async () => {
    renderWithProviders(
      <>
        <SetupOverride intent="join" />
        <PlayerSetupScreen />
      </>,
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /Continue/ }));

    expect(window.location.hash).toBe('#/join-room');
  });
});

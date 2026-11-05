import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HomeScreen } from '../screens/home/HomeScreen';
import { renderWithProviders } from './helpers';

function renderHome() {
  return renderWithProviders(<HomeScreen />);
}

describe('Home screen', () => {
  it('shows the wordmark heading and ribbon', () => {
    renderHome();

    expect(screen.getByRole('heading', { level: 1, name: /PLAYVERSE/ })).toBeInTheDocument();
    expect(screen.getByText('Play together. Anywhere.')).toBeInTheDocument();
    expect(screen.getAllByText('PLAYVERSE').length).toBeGreaterThan(0);
  });

  it('shows the four reference actions', () => {
    renderHome();

    expect(screen.getByRole('button', { name: /Create a Room/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Join a Room/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /How to Play/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Settings/ })).toBeInTheDocument();
  });

  it('derives the feature pills from shared constants', () => {
    renderHome();

    expect(screen.getByText('2–8')).toBeInTheDocument();
    expect(screen.getByText('No Login')).toBeInTheDocument();
    expect(screen.getByText('2 Mini-Games')).toBeInTheDocument();
    expect(screen.getByText('5 Rounds')).toBeInTheDocument();
  });

  it('routes Create a Room through Player Setup', async () => {
    renderHome();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /Create a Room/ }));

    expect(window.location.hash).toBe('#/setup');
  });

  it('routes Join a Room through Player Setup too', async () => {
    renderHome();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /Join a Room/ }));
    expect(window.location.hash).toBe('#/setup');

    await user.click(screen.getByRole('button', { name: /How to Play/ }));
    expect(window.location.hash).toBe('#/guide');

    await user.click(screen.getByRole('button', { name: /^Settings$/ }));
    expect(window.location.hash).toBe('#/settings');
  });
});

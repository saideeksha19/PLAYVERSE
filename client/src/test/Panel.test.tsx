import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Panel } from '../ui/Panel';

describe('Panel', () => {
  it('renders its children inside the glass panel', () => {
    render(<Panel>Room AB47FH</Panel>);
    const panel = screen.getByText('Room AB47FH');
    expect(panel).toHaveClass('pv-panel');
    expect(panel).not.toHaveClass('pv-panel--light');
  });

  it('supports the light content-card tone', () => {
    render(
      <Panel tone="light">How to play</Panel>,
    );
    expect(screen.getByText('How to play')).toHaveClass('pv-panel--light');
  });

  it('merges custom classes and forwards accessibility attributes', () => {
    render(
      <Panel className="max-w-lg" role="region" aria-label="Waiting lobby" padded={false} />,
    );
    const panel = screen.getByRole('region', { name: 'Waiting lobby' });
    expect(panel).toHaveClass('pv-panel', 'max-w-lg');
    expect(panel).not.toHaveClass('p-5');
  });
});

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WorldBackground } from '../three/WorldBackground';

describe('WorldBackground (WebGL guard)', () => {
  it('renders the CSS sky fallback when WebGL is unavailable', () => {
    render(<WorldBackground />);
    expect(screen.getByTestId('world-fallback')).toBeInTheDocument();
  });

  it('never mounts a WebGL canvas without support', () => {
    const { container } = render(<WorldBackground />);
    expect(container.querySelector('canvas')).toBeNull();
  });

  it('marks the fallback as decorative so it is hidden from screen readers', () => {
    render(<WorldBackground />);
    expect(screen.getByTestId('world-fallback')).toHaveAttribute('aria-hidden', 'true');
  });
});

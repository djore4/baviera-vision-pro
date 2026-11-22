import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { SeasonProvider, useSeason } from '@/components/season/SeasonProvider';
import { Snowfall } from '@/components/season/Snowfall';

const Probe = () => {
  const s = useSeason();
  return <button onClick={() => s.setEnabled(!s.enabled)}>{String(s.xmas)}/{String(s.xmasWindow)}</button>;
};

describe('SeasonProvider', () => {
  // jsdom não implementa canvas; a neve tolera a ausência de contexto.
  beforeEach(() => { vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null); });
  beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); delete document.documentElement.dataset.season; });

  it('em dezembro liga data-season e respeita a preferência da pessoa', () => {
    vi.setSystemTime(new Date(2026, 11, 10));
    render(<SeasonProvider><Probe /></SeasonProvider>);
    expect(document.documentElement.dataset.season).toBe('xmas');
    fireEvent.click(screen.getByRole('button'));
    expect(document.documentElement.dataset.season).toBeUndefined();
    expect(screen.getByRole('button')).toHaveTextContent('false/true');
    expect(localStorage.getItem('season.effects')).toBe('off');
  });

  it('fora de época não faz nada', () => {
    vi.setSystemTime(new Date(2026, 6, 10));
    render(<SeasonProvider><Probe /></SeasonProvider>);
    expect(document.documentElement.dataset.season).toBeUndefined();
    expect(screen.getByRole('button')).toHaveTextContent('false/false');
  });

  it('a neve só existe com a época ativa', () => {
    vi.setSystemTime(new Date(2026, 6, 10));
    const { unmount } = render(<SeasonProvider><Snowfall /></SeasonProvider>);
    expect(screen.queryByTestId('snowfall')).toBeNull();
    unmount();
    vi.setSystemTime(new Date(2026, 11, 10));
    act(() => { render(<SeasonProvider><Snowfall /></SeasonProvider>); });
    expect(screen.getByTestId('snowfall')).toHaveClass('pointer-events-none');
  });
});
